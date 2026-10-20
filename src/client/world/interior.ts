import { INTERIOR_TILE } from "shared/interiorChoice";
import { ANIMATION_FRAMES, InteriorMap, isAnimated } from "shared/interiorMap";
import { EXTERIOR_SHEETS, INTERIOR_SHEETS } from "shared/interiors";
import { InteriorData, InteriorTile } from "shared/interiors/types";
import { groundOffset, snapToArtPx } from "shared/view";
import { createCollider } from "./collider";
import { createGround, Ground, GroundLayer, LIVE_Z_OFFSET, UNDER_Z_OFFSET } from "./ground";
import { isLightSource, windowOf } from "./lightTiles";
import { NO_TINT_ATTRIBUTE } from "./tint";
import { createSea } from "./water";

export { INTERIOR_TILE };

/** Colunas de cada metade: a folha de 128 colunas foi enviada em duas imagens de 1024 × 512. */
const HALF_COLS = 64;
/**
 * Vazio em volta do mapa, em tiles, para a tela não mostrar o céu com o personagem na borda. Com a câmera
 * no mais longe, a tela mostra até 768 pixels de arte de altura, uns 1370 de largura em 16:9 (`zoomRange`).
 */
const DEFAULT_MARGIN = new Vector2(48, 26);
/**
 * A margem dos mapas com exterior, cheia de mar: 1024 × 512 pixels de arte em cada lado, para o mar ir até a
 * borda da tela com a câmera no mais longe (até uns 845 de altura, `FARTHEST_SLACK`), em telas até 2,4 : 1.
 */
const SEA_MARGIN = new Vector2(64, 32);
/**
 * Quadros por segundo dos tiles animados (chamas, patinhos, torneira): 4, como pediu o usuário. O Graal não
 * diz o ritmo dos tiles animados dele; 4 por segundo é o do vento das árvores do jogo (`wind.ts`).
 */
export const TILE_ANIMATION_FPS = 4;
/**
 * O recorte do meio de um tile de uma cor só que se estica num retângulo: 8 × 8, longe da borda, para a
 * amostragem não pegar o tile vizinho. O `ScaleType.Tile` do Roblox não repete um recorte (estica o recorte na
 * imagem toda, conferido no Studio em 2026-10-18), então só o tile de uma cor só cobre mais de uma célula.
 */
const FLAT_INSET = 4;
const FLAT_SIZE = new Vector2(8, 8);

// Ordem no canvas do chão: o mar de fora (nos mapas com exterior) e o vazio embaixo de tudo, os tiles por
// cima, a sombra do personagem acima deles.
const SEA_Z = GroundLayer.Grass - 1;
const BACKDROP_Z = GroundLayer.Grass;
const TILE_Z = GroundLayer.Soil;

export interface Interior {
	folder: Folder;
	/** O canvas dos tiles parados. */
	ground: Ground;
	/**
	 * A camada viva: o que muda de quadro (tiles animados, sombras, halos, peças) fica nela, para o canvas
	 * grande dos tiles parados não ser refeito a cada quadro.
	 */
	live: Ground;
	/** O centro da célula (x, y) do bloco, no chão. */
	cellCenter(x: number, y: number): Vector3;
	/** O canto de cima à esquerda da célula (x, y) do bloco, no chão. */
	cellCorner(x: number, y: number): Vector3;
	/** O canto da célula (x, y) do bloco no canvas do chão, em pixels de arte. */
	canvasOf(x: number, y: number): Vector2;
	/** Troca o quadro dos tiles animados; `now` em segundos. */
	animate(now: number): void;
	/** Prende o tile animado da célula (x, y) num quadro parado (a torneira fechada), ou solta com `undefined`. */
	setAnimatedTile(x: number, y: number, tile: InteriorTile | undefined): void;
	/** Se a célula (x, y) do bloco bloqueia. */
	blocked(x: number, y: number): boolean;
	/** O retângulo do mapa, em células do bloco. */
	area: { x: number; y: number; width: number; height: number };
	/** As imagens das janelas com versão de noite, no canvas do chão. */
	windows: { canvas: Vector2; w: number; h: number; group: number; night: InteriorTile }[];
	/** O tile que aparece na célula (x, y) do bloco, ou nada fora do mapa. */
	topTile(x: number, y: number): InteriorTile | undefined;
	/** Troca as janelas para a versão de noite ou de dia. */
	setNight(night: boolean): void;
	stats: {
		tiles: number;
		groundImages: number;
		colliders: number;
		windowImages: number;
		terrainTiles: number;
		terrainLayers: number;
		terrainImages: number;
		terrainAnimated: number;
		liveImages: number;
		instances: number;
		buildMs: number;
	};
	destroy(): void;
}

/** Um retângulo de células que vira uma imagem só. */
interface Run {
	x: number;
	y: number;
	w: number;
	h: number;
	tile: InteriorTile;
	/** Tiles de uma cor só: o recorte do meio de `tile`, esticado. */
	flat: boolean;
}

const warned = new Set<string>();

/**
 * Junta as células em retângulos que viram uma imagem cada: um pedaço contínuo da folha (as células vizinhas
 * no mapa são vizinhas na folha, na mesma metade), copiado como está, ou tiles de uma cor só, todos da mesma
 * cor (`flatOf`), que viram o recorte do meio de um deles esticado. Guloso: em ordem de leitura, cresce para a
 * direita e depois para baixo, e fica com o maior dos dois.
 */
function mergeCells(
	width: number,
	height: number,
	cellTile: (x: number, y: number) => InteriorTile | undefined,
	flatOf: (tile: InteriorTile) => number | undefined = () => undefined,
) {
	const used = new Set<number>();
	const runs = new Array<Run>();
	const free = (x: number, y: number) => x < width && y < height && !used.has(y * width + x);
	const contiguous = (tile: InteriorTile, x: number, y: number, dc: number, dl: number) => {
		if (!free(x, y)) return false;
		const other = cellTile(x, y);
		return (
			other !== undefined &&
			other[0] === tile[0] &&
			other[1] === tile[1] + dc &&
			other[2] === tile[2] + dl &&
			math.floor(other[1] / HALF_COLS) === math.floor(tile[1] / HALF_COLS)
		);
	};
	const sameColor = (color: number, x: number, y: number) => {
		if (!free(x, y)) return false;
		const other = cellTile(x, y);
		return other !== undefined && flatOf(other) === color;
	};
	const grow = (fits: (x: number, y: number, i: number, j: number) => boolean, x: number, y: number) => {
		let w = 1;
		while (fits(x + w, y, w, 0)) w++;
		let h = 1;
		let more = true;
		while (more) {
			for (let i = 0; i < w && more; i++) more = fits(x + i, y + h, i, h);
			if (more) h++;
		}
		return [w, h] as const;
	};
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (used.has(y * width + x)) continue;
			const tile = cellTile(x, y);
			if (!tile) continue;
			const [cw, ch] = grow((cx, cy, i, j) => contiguous(tile, cx, cy, i, j), x, y);
			let run: Run = { x, y, w: cw, h: ch, tile, flat: false };
			const color = flatOf(tile);
			if (color !== undefined) {
				const [fw, fh] = grow((cx, cy) => sameColor(color, cx, cy), x, y);
				if (fw * fh > cw * ch) run = { x, y, w: fw, h: fh, tile, flat: true };
			}
			for (let j = 0; j < run.h; j++) {
				for (let i = 0; i < run.w; i++) used.add((y + j) * width + x + i);
			}
			runs.push(run);
		}
	}
	return runs;
}

/**
 * A imagem e o canto, na metade da folha, de `w` × `h` tiles a partir do tile `tile`: um recorte contínuo
 * da folha, sem mudar nenhum pixel (o recorte não pode passar da coluna 63 para a 64, de uma metade a outra).
 */
export function sheetRect(tile: InteriorTile, w = 1, h = 1) {
	const [sheet, col, row] = tile;
	const halves = INTERIOR_SHEETS[sheet];
	return {
		image: halves ? halves[col < HALF_COLS ? 0 : 1] : "",
		offset: new Vector2((col % HALF_COLS) * INTERIOR_TILE, row * INTERIOR_TILE),
		size: new Vector2(w, h).mul(INTERIOR_TILE),
	};
}

/** Uma imagem com o recorte da folha, sem mudar nenhum pixel: só tiles inteiros de 16 × 16. */
function tileImage(parent: Instance, run: Run, at: Vector2, zIndex: number) {
	const [sheet, col, row] = run.tile;
	const halves = INTERIOR_SHEETS[sheet];
	if (!halves && !warned.has(sheet)) {
		warned.add(sheet);
		warn(`[Interior] folha desconhecida: ${sheet}; rode npm run diorama:jogo de novo`);
	}
	const label = new Instance("ImageLabel");
	label.BackgroundTransparency = 1;
	label.Position = UDim2.fromOffset(at.X, at.Y);
	label.Size = UDim2.fromOffset(run.w * INTERIOR_TILE, run.h * INTERIOR_TILE);
	label.Image = halves ? halves[col < HALF_COLS ? 0 : 1] : "";
	const corner = new Vector2((col % HALF_COLS) * INTERIOR_TILE, row * INTERIOR_TILE);
	if (run.flat) {
		// Uma cor só: o meio do tile esticado dá os mesmos pixels que repeti-lo.
		label.ImageRectOffset = corner.add(new Vector2(FLAT_INSET, FLAT_INSET));
		label.ImageRectSize = FLAT_SIZE;
	} else {
		label.ImageRectOffset = corner;
		label.ImageRectSize = new Vector2(run.w, run.h).mul(INTERIOR_TILE);
	}
	label.ResampleMode = Enum.ResamplerMode.Pixelated;
	label.ZIndex = zIndex;
	label.Parent = parent;
	return label;
}

/**
 * Monta no mundo um interior pintado no Diorama, com a técnica do jogo. `origin` é o canto de cima à
 * esquerda da célula (0, 0) do bloco, no chão (vai para o pixel de arte mais perto). Cada tile tem 16
 * pixels: meio stud de largura e meia célula do chão de fundo.
 *
 * - **As três camadas** vão deitadas no chão, como no Graal (a arte já vem em 3/4): um `SurfaceGui` só, com
 *   o `ZOffset` do chão, então o boneco fica por cima de todo tile do mapa. Os tiles do Aeko são opacos, então
 *   cada célula mostra só o tile de cima: a frente sobre o objeto, o objeto sobre o chão. O vazio preto é o
 *   fundo do canvas inteiro (uma imagem esticada do tile, que tem uma cor só) e não é desenhado célula a
 *   célula; os demais tiles se juntam em retângulos (`mergeCells`). No mapa com exterior, o vazio cobre só o
 *   retângulo do mapa e o mar fundo (`water.ts`) enche o resto do canvas: a ilha fica no meio do mar.
 * - **Bloqueio**: as células que bloqueiam, mais uma volta em torno do retângulo do mapa, juntadas em
 *   retângulos, cada um um bloqueio invisível de `collider.ts`.
 * - **Peças móveis** (com `map`, `shared/interiorMap.ts`): onde uma peça que se segura ou carrega estava, o
 *   chão mostra o piso da camada de baixo e não bloqueia; a peça é desenhada e bloqueia à parte
 *   (`client/world/pieces.ts`), para poder mudar de lugar. Os tiles do teste das ações (a água) também vêm dele.
 */
export function buildInterior(parent: Instance, data: InteriorData, origin: Vector3, map?: InteriorMap): Interior {
	const started = os.clock();
	const corner = snapToArtPx(origin);
	const { width, height } = data;
	const margin = data.terrain ? SEA_MARGIN : DEFAULT_MARGIN;
	const folder = new Instance("Folder");
	folder.Name = `Interior_${data.id}`;

	// Uma lista por camada com o número de cada célula do retângulo (0 vazia), em ordem de leitura.
	let tiles = 0;
	const layers = data.layers.map((rows) => {
		const cells = new Array<number>();
		for (const row of rows) {
			for (const part of row.split(" ")) {
				const n = tonumber(part) ?? 0;
				if (n !== 0) tiles++;
				cells.push(n);
			}
		}
		return cells;
	});
	const numberAt = (layer: number, x: number, y: number) => layers[layer][y * width + x];
	const tileOf = (n: number) => (n === 0 ? undefined : data.tiles[n - 1]);
	const [voidSheet, voidCol, voidRow] = data.backdrop;
	const isVoid = (tile: InteriorTile) => tile[0] === voidSheet && tile[1] === voidCol && tile[2] === voidRow;

	// Os tiles de uma cor só (o gerador leu os PNG): só eles cobrem um retângulo esticados.
	const flatColors = new Map<string, number>();
	for (const [n, color] of data.flat || []) {
		const [sheet, col, row] = data.tiles[n - 1];
		flatColors.set(`${sheet},${col},${row}`, color);
	}
	const flatOf = (tile: InteriorTile) => flatColors.get(`${tile[0]},${tile[1]},${tile[2]}`);

	/** Canto de cima à esquerda da célula (x, y) do bloco, no chão. */
	const cellCorner = (x: number, y: number) => corner.add(groundOffset(x * INTERIOR_TILE, y * INTERIOR_TILE));

	// O chão: o canvas cobre o retângulo do mapa e a margem, com o vazio de fundo.
	const canvasCells = new Vector2(width, height).add(margin.mul(2));
	const canvas = canvasCells.mul(INTERIOR_TILE);
	const center = cellCorner(data.x - margin.X, data.y - margin.Y).add(groundOffset(canvas.X / 2, canvas.Y / 2));
	const ground = createGround(folder, center, canvas, false);
	ground.part.Name = "InteriorGround";
	// A camada viva, no mesmo plano e do mesmo tamanho, desenhada logo depois do chão (ver `Interior.live`).
	const live = createGround(folder, center, canvas, false, LIVE_Z_OFFSET, "vivo");
	live.part.Name = "InteriorLive";
	// Com exterior, o mar fundo enche um canvas próprio por baixo do chão (troca de quadro sem refazer o chão) e o
	// vazio cobre só o retângulo do mapa (o preto entre os cômodos); sem exterior, o vazio enche o canvas, como antes.
	const under = data.terrain ? createGround(folder, center, canvas, false, UNDER_Z_OFFSET, "mar") : undefined;
	if (under) under.part.Name = "InteriorSea";
	const sea = under ? createSea(under.gui, SEA_Z) : undefined;
	const backdrop = sea
		? tileImage(
				ground.gui,
				{ x: 0, y: 0, w: width, h: height, tile: data.backdrop, flat: true },
				margin.mul(INTERIOR_TILE),
				BACKDROP_Z,
			)
		: tileImage(
				ground.gui,
				{ x: 0, y: 0, w: canvasCells.X, h: canvasCells.Y, tile: data.backdrop, flat: true },
				Vector2.zero,
				BACKDROP_Z,
			);
	backdrop.Name = "Backdrop";
	let groundImages = 1 + (sea?.labels.size() ?? 0);

	/** O tile que aparece na célula (x, y) do retângulo: o da camada de cima, ou o do mapa das ações. */
	const topAt = (x: number, y: number) => {
		if (map) return map.ground(data.x + x, data.y + y);
		let n = 0;
		for (const layer of [2, 1, 0]) {
			n = numberAt(layer, x, y);
			if (n !== 0) break;
		}
		return tileOf(n);
	};

	// As janelas com versão de noite ficam fora das imagens juntadas com o resto: juntadas só entre as do
	// mesmo par de regiões (dia e noite), cada imagem troca o recorte inteiro quando escurece.
	const windowCells = new Map<number, NonNullable<ReturnType<typeof windowOf>>>();
	let windowGroups = 0;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const tile = topAt(x, y);
			const win = tile && !isAnimated(tile) ? windowOf(tile) : undefined;
			if (!win) continue;
			windowCells.set(y * width + x, win);
			windowGroups = math.max(windowGroups, win.group + 1);
		}
	}
	const windows = new Array<{
		label: ImageLabel;
		run: Run;
		day: InteriorTile;
		night: InteriorTile;
		group: number;
	}>();
	for (let group = 0; group < windowGroups; group++) {
		const runs = mergeCells(width, height, (x, y) => {
			const win = windowCells.get(y * width + x);
			return win && win.group === group ? win.day : undefined;
		});
		for (const run of runs) {
			const night = windowCells.get(run.y * width + run.x)!.night;
			const label = tileImage(
				ground.gui,
				run,
				new Vector2(margin.X + run.x, margin.Y + run.y).mul(INTERIOR_TILE),
				TILE_Z,
			);
			windows.push({ label, run, day: run.tile, night, group });
			groundImages++;
		}
	}
	let showingNight = false;

	// Os tiles animados ficam fora das imagens juntadas: cada um é uma imagem que troca de quadro, na camada viva.
	let liveImages = 0;
	const animated = new Map<number, { label: ImageLabel; tile: InteriorTile; still?: InteriorTile }>();
	if (map) {
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const tile = map.ground(data.x + x, data.y + y);
				if (!tile || !isAnimated(tile)) continue;
				const run: Run = { x, y, w: 1, h: 1, tile, flat: false };
				const label = tileImage(live.gui, run, new Vector2(margin.X + x, margin.Y + y).mul(INTERIOR_TILE), TILE_Z);
				liveImages++;
				// A chama acesa fica na cor cheia à noite (`tint.ts`).
				if (isLightSource(tile)) label.SetAttribute(NO_TINT_ATTRIBUTE, true);
				animated.set(map.key(data.x + x, data.y + y), { label, tile });
				groundImages++;
			}
		}
	}

	// As fontes de luz (a lâmpada, o vidro aceso) se juntam só entre si: elas ficam sem o tom do dia.
	const stillTile = (x: number, y: number) => {
		if (map && animated.has(map.key(data.x + x, data.y + y))) return undefined;
		if (windowCells.has(y * width + x)) return undefined;
		const tile = topAt(x, y);
		return tile && !isVoid(tile) ? tile : undefined;
	};
	for (const source of [false, true]) {
		const runs = mergeCells(
			width,
			height,
			(x, y) => {
				const tile = stillTile(x, y);
				return tile && isLightSource(tile) === source ? tile : undefined;
			},
			flatOf,
		);
		for (const run of runs) {
			const label = tileImage(
				ground.gui,
				run,
				new Vector2(margin.X + run.x, margin.Y + run.y).mul(INTERIOR_TILE),
				TILE_Z,
			);
			if (source) label.SetAttribute(NO_TINT_ATTRIBUTE, true);
			groundImages++;
		}
	}

	// O exterior (a grama, o caminho, a areia e o mar do Diorama): as imagens que o gerador já juntou, nas
	// células sem tile, numa moldura própria acima do vazio, com as camadas de recorte em ordem (a base embaixo,
	// os encontros e o decalque por cima). Os recortes têm só pixels opacos ou transparentes: empilhados, dão os
	// mesmos pixels que o plugin compõe (`plugin/src/exterior.ts`).
	const terrainAnimated = new Array<{ label: ImageLabel; offset: Vector2; step: Vector2; frames: number }>();
	let terrainImages = 0;
	if (data.terrain) {
		const frameIn = (gui: SurfaceGui) => {
			const holder = new Instance("Frame");
			holder.Name = "Terrain";
			holder.BackgroundTransparency = 1;
			holder.Size = UDim2.fromScale(1, 1);
			holder.ZIndex = TILE_Z;
			holder.Parent = gui;
			return holder;
		};
		const holder = frameIn(ground.gui);
		let liveHolder: Frame | undefined;
		// O recorte animado vai para a camada viva (por cima do chão inteiro) só se nenhum recorte parado da mesma
		// célula fica acima dele (z maior, ou o mesmo z criado depois); senão ele fica no chão, na ordem certa.
		// Nos mapas de hoje (2026-10-18) todos os animados podem ir.
		const staticTop = new Map<number, number>();
		const runs = data.terrain.runs;
		runs.forEach(([, i, j, w, h, , , , , z, frames], index) => {
			if (frames > 1) return;
			for (let b = j; b < j + h; b++) {
				for (let a = i; a < i + w; a++) {
					const key = b * 100000 + a;
					staticTop.set(key, math.max(staticTop.get(key) ?? -math.huge, z * 100000 + index));
				}
			}
		});
		const canGoLive = (i: number, j: number, w: number, h: number, z: number, index: number) => {
			for (let b = j; b < j + h; b++) {
				for (let a = i; a < i + w; a++) {
					const top = staticTop.get(b * 100000 + a);
					if (top !== undefined && top > z * 100000 + index) return false;
				}
			}
			return true;
		};
		runs.forEach(([image, i, j, w, h, sx, sy, sw, sh, z, frames, dx, dy], index) => {
			const id = EXTERIOR_SHEETS[image] ?? "";
			if (id === "" && !warned.has(`exterior${image}`)) {
				warned.add(`exterior${image}`);
				warn(`[Interior] a imagem ${image} do exterior não tem id; rode npm run diorama:jogo de novo`);
			}
			const label = new Instance("ImageLabel");
			label.BackgroundTransparency = 1;
			label.Position = UDim2.fromOffset((margin.X + i) * INTERIOR_TILE, (margin.Y + j) * INTERIOR_TILE);
			label.Size = UDim2.fromOffset(w * INTERIOR_TILE, h * INTERIOR_TILE);
			label.Image = id;
			label.ImageRectOffset = new Vector2(sx, sy);
			label.ImageRectSize = new Vector2(sw, sh);
			// O recorte é do tamanho do retângulo (cópia 1:1), ou menor quando é de uma cor só e se estica nele (o
			// gerador só junta assim recortes de uma cor só; o Tile do Roblox não repete um recorte).
			label.ResampleMode = Enum.ResamplerMode.Pixelated;
			label.ZIndex = z + 1;
			let parent = holder;
			if (frames > 1) {
				terrainAnimated.push({ label, offset: new Vector2(sx, sy), step: new Vector2(dx, dy), frames });
				if (canGoLive(i, j, w, h, z, index)) {
					liveHolder ??= frameIn(live.gui);
					parent = liveHolder;
					liveImages++;
				}
			}
			label.Parent = parent;
			terrainImages++;
		});
		groundImages += terrainImages;
	}

	// Os bloqueios, numa grade com uma volta a mais em cada lado: fora do mapa não se anda.
	const blockedLocal = (i: number, j: number) =>
		map
			? map.blocked(data.x + i, data.y + j)
			: i < 0 || j < 0 || i >= width || j >= height || data.blocks[j].sub(i + 1, i + 1) === "#";
	const gridW = width + 2;
	const gridH = height + 2;
	const taken = new Set<number>();
	const solid = (i: number, j: number) =>
		i < gridW && j < gridH && !taken.has(j * gridW + i) && blockedLocal(i - 1, j - 1);
	let colliders = 0;
	for (let j = 0; j < gridH; j++) {
		for (let i = 0; i < gridW; i++) {
			if (!solid(i, j)) continue;
			let w = 1;
			while (solid(i + w, j)) w++;
			let h = 1;
			let more = true;
			while (more) {
				for (let k = 0; k < w && more; k++) more = solid(i + k, j + h);
				if (more) h++;
			}
			for (let b = 0; b < h; b++) {
				for (let a = 0; a < w; a++) taken.add((j + b) * gridW + i + a);
			}
			// A base do bloqueio é o meio da borda de baixo do retângulo.
			const base = cellCorner(data.x + i - 1, data.y + j - 1).add(
				groundOffset((w * INTERIOR_TILE) / 2, h * INTERIOR_TILE),
			);
			createCollider(folder, "Interior", base, new Vector2(w, h).mul(INTERIOR_TILE));
			colliders++;
		}
	}

	folder.Parent = parent;
	// O quadro da animação já mostrado: os tiles só mudam quando ele muda (4 vezes por segundo), não a cada quadro.
	let shownTick = -1;
	return {
		folder,
		ground,
		live,
		cellCenter(x, y) {
			return cellCorner(x, y).add(groundOffset(INTERIOR_TILE / 2, INTERIOR_TILE / 2));
		},
		cellCorner(x, y) {
			return cellCorner(x, y);
		},
		canvasOf(x, y) {
			return new Vector2(margin.X + x - data.x, margin.Y + y - data.y).mul(INTERIOR_TILE);
		},
		animate(now) {
			// O quadro de cada tile começa na linha em que ele foi pintado: os patinhos lado a lado não boiam juntos.
			const tick = math.floor(now * TILE_ANIMATION_FPS);
			if (tick === shownTick) return;
			shownTick = tick;
			for (const [, cell] of animated) {
				const [sheet, col, row] = cell.still || cell.tile;
				const frame = cell.still ? row : (cell.tile[2] + tick) % ANIMATION_FRAMES;
				const rect = sheetRect([sheet, col, frame]);
				if (cell.label.ImageRectOffset !== rect.offset) cell.label.ImageRectOffset = rect.offset;
				if (cell.label.Image !== rect.image) cell.label.Image = rect.image;
			}
			// O mar e os decalques do exterior: todos no mesmo quadro, como no plugin; o mar de fora junto.
			for (const item of terrainAnimated) {
				const offset = item.offset.add(item.step.mul(tick % item.frames));
				if (item.label.ImageRectOffset !== offset) item.label.ImageRectOffset = offset;
			}
			sea?.animate(tick);
		},
		setAnimatedTile(x, y, tile) {
			const cell = map ? animated.get(map.key(x, y)) : undefined;
			if (cell) cell.still = tile;
			// A torneira fechada ou aberta aparece já no próximo quadro.
			shownTick = -1;
		},
		blocked(x, y) {
			return blockedLocal(x - data.x, y - data.y);
		},
		area: { x: data.x, y: data.y, width, height },
		windows: windows.map((win) => ({
			canvas: new Vector2(margin.X + win.run.x, margin.Y + win.run.y).mul(INTERIOR_TILE),
			w: win.run.w,
			h: win.run.h,
			group: win.group,
			night: win.night,
		})),
		topTile(x, y) {
			const i = x - data.x;
			const j = y - data.y;
			if (i < 0 || j < 0 || i >= width || j >= height) return undefined;
			return topAt(i, j);
		},
		setNight(night) {
			if (night === showingNight) return;
			showingNight = night;
			for (const win of windows) {
				// A versão de noite tem o mesmo tamanho e a mesma disposição: o recorte do retângulo inteiro muda junto.
				const rect = sheetRect(night ? win.night : win.day);
				win.label.Image = rect.image;
				win.label.ImageRectOffset = rect.offset;
			}
		},
		stats: {
			tiles,
			groundImages,
			colliders,
			windowImages: windows.size(),
			terrainTiles: data.terrain?.tiles ?? 0,
			terrainLayers: data.terrain?.layers ?? 0,
			terrainImages,
			terrainAnimated: terrainAnimated.size(),
			liveImages,
			instances: folder.GetDescendants().size() + 1,
			buildMs: (os.clock() - started) * 1000,
		},
		destroy() {
			folder.Destroy();
		},
	};
}
