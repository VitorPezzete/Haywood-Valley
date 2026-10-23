// O gerador de blocos do mundo (fase 0 do `docs/mundo/MAPA_MUNDO.md`, 2026-10-23): do terreno de cada célula
// (`fase1.ts`) para as imagens já juntadas de um bloco, determinístico (o mesmo bloco sai sempre igual). É a grade
// dupla do exterior do Diorama (`docs/diorama/EXTERIOR.md`, `tools/diorama_lib/exterior.mjs`), feita no jogo e não no
// gerador, porque o mundo tem blocos demais para virar módulo (o plano tem 518 mil blocos de terra):
//
// - O tile da célula (x, y) mostra nos quatro quadrantes as células (x, y), (x + 1, y), (x, y + 1) e (x + 1, y + 1).
//   A base é o terreno mais baixo entre eles; cada terreno mais alto vira uma junção por cima, com a máscara dos
//   quadrantes (bit 1 em cima à esquerda, 2 em cima à direita, 4 embaixo à esquerda, 8 embaixo à direita) e a junção
//   do par (esse terreno, o presente logo abaixo dele).
// - **Base em textura grande** (§3.3 do plano): com o id da textura de 1024 × 1024 do terreno (`mundo.base.*`), o tile
//   da célula é o recorte (x mod 64, y mod 64) dela, então a base de um bloco junta em poucos retângulos. Sem o id, a
//   base sai lisa (o recorte `flat` de uma cor só, esticado): a grama e a terra da folha_juncao são um padrão de 2 × 2
//   tiles que não junta (2.048 imagens por bloco de grama).
// - **Conjuntos da equipe** (`wang16_4x6`, §3.4): com o id da folha dos conjuntos, o tile de dois terrenos que têm um
//   conjunto é o tile Wang dele (opaco: substitui a base e a junção). Sem o id, vale a folha_juncao.
// - **Água do rio** no canvas de baixo (`mundo.agua_rio`, 4 quadros): com os ids, a base da água fica de fora do
//   canvas fixo (transparente) e o cliente põe a água animada por baixo; sem eles, a água é a base lisa.
// - **Decalques** (flores, pedrinhas) por semente da célula, só em grama pura de 2 × 2 tiles.

import { ASSET_LISTS, ASSETS } from "shared/assets";
import { EXTERIOR_SHEETS } from "shared/interiors";
import { BLOCK_TILES, PHASE1_CELL_X, PHASE1_CELL_Y, phaseBlockersIn, PIECE_TILES, terrainAt, WORLD_TILE } from "./index";
import { PHASE1_CLOSED, PHASE1_MARK_KINDS, PHASE1_MARKS, PHASE1 } from "./fase1";
import {
	WORLD_DECALS,
	WORLD_JUNCTIONS,
	WORLD_RIVER_FRAMES,
	WORLD_SETS,
	WORLD_SETS_SHEET,
	WORLD_TERRAINS,
	WorldTerrain,
} from "./terreno";

/**
 * Uma imagem do chão do bloco, já juntada: a imagem (id), o canto e o tamanho em células do bloco, o recorte (canto e
 * tamanho em pixels: do tamanho do retângulo, ou menor quando é de uma cor só e se estica), a camada, os quadros e
 * quanto o recorte anda por quadro. Como o `ExteriorRun` dos interiores, com o id no lugar do índice da folha.
 */
export type WorldRun = [
	image: string,
	i: number,
	j: number,
	w: number,
	h: number,
	sx: number,
	sy: number,
	sw: number,
	sh: number,
	z: number,
	frames: number,
	dx: number,
	dy: number,
];

/** Um lugar marcado do bloco (o que ainda não tem arte com id): tipo, categoria, retângulo em células do bloco, nome. */
export interface WorldMark {
	kind: string;
	category: string;
	x: number;
	y: number;
	w: number;
	h: number;
	label: string;
}

export interface WorldBlock {
	bx: number;
	by: number;
	runs: WorldRun[];
	/** As células que bloqueiam, em ordem de leitura (64 × 64). */
	blocked: boolean[];
	/** Se o bloco tem água (para o canvas de baixo, com a água do rio animada). */
	water: boolean;
	marks: WorldMark[];
	stats: { tiles: number; layers: number; decals: number; runs: number; animated: number; ms: number };
}

/** Um recorte de 16 × 16 de uma célula, antes de juntar. */
interface Piece {
	image: string;
	sx: number;
	sy: number;
	frames: number;
	dy: number;
	/** Recorte de uma cor só (a chave da cor) e o lado do recorte que se estica. */
	flat?: string;
	size?: number;
}

/** Folga, em células, com que um lugar marcado ainda entra no bloco vizinho (`composeBlock`). */
const MARK_MARGIN = 2;

const TERRAINS = new Map<string, WorldTerrain>();
for (const terrain of WORLD_TERRAINS) TERRAINS.set(terrain.code, terrain);
const JUNCTIONS = new Map<string, (typeof WORLD_JUNCTIONS)[number]>();
for (const junction of WORLD_JUNCTIONS) JUNCTIONS.set(`${junction[0]}${junction[1]}`, junction);

const JUNCTION_SHEET = EXTERIOR_SHEETS[0] ?? "";
const SETS_SHEET = ASSETS[WORLD_SETS_SHEET] ?? "";
/** Os conjuntos usáveis (com a folha enviada e os dois terrenos conhecidos), pelo par "ab" e "ba". */
const SETS = new Map<string, { a: string; x: number; y: number }>();
if (SETS_SHEET !== "") {
	for (const [, a, b, x, y] of WORLD_SETS) {
		if (!TERRAINS.has(a) || !TERRAINS.has(b)) continue;
		SETS.set(`${a}${b}`, { a, x, y });
		SETS.set(`${b}${a}`, { a, x, y });
	}
}
const RIVER = ASSET_LISTS[WORLD_RIVER_FRAMES] ?? [];
/** Se a água do rio vai no canvas de baixo (os 4 quadros têm id). */
export const RIVER_UNDER = RIVER.size() === 4 && RIVER.every((id) => id !== "");
export const RIVER_IMAGES: ReadonlyArray<string> = RIVER;

/** Os terrenos com textura grande enviada; os demais saem lisos. */
export function missingTextures() {
	const missing = new Array<string>();
	for (const terrain of WORLD_TERRAINS) {
		if (terrain.texture !== "" && (ASSETS[terrain.texture] ?? "") === "") missing.push(terrain.texture);
	}
	return missing;
}

/** Um número de 0 a 1 que só depende da célula e da semente (o mesmo bloco sai sempre igual). */
export function cellHash(x: number, y: number, seed: number) {
	let h = (x * 374761393 + y * 668265263 + seed * 2147483647) % 4294967296;
	h = bit32.bxor(h, bit32.rshift(h, 13));
	h = (h * 1274126177) % 4294967296;
	h = bit32.bxor(h, bit32.rshift(h, 16));
	return h / 4294967296;
}

function plainCode(code: string) {
	return code === "G" ? "g" : code;
}

function basePiece(code: string, x: number, y: number): Piece | undefined {
	const terrain = TERRAINS.get(code);
	if (!terrain) return undefined;
	if (RIVER_UNDER && (code === "m" || code === "r")) return undefined;
	const texture = terrain.texture !== "" ? (ASSETS[terrain.texture] ?? "") : "";
	if (texture !== "") return { image: texture, sx: x * WORLD_TILE, sy: y * WORLD_TILE, frames: 1, dy: 0 };
	const [sx, sy, size] = terrain.flat;
	return { image: JUNCTION_SHEET, sx, sy, frames: 1, dy: 0, flat: code, size };
}

/**
 * Compõe o bloco (bx, by) do mundo. `step` é chamado a cada linha de tiles: o cliente o usa para dividir a montagem
 * entre quadros (ele pode esperar; o gerador não guarda nada entre as linhas que dependa do tempo).
 */
export function composeBlock(bx: number, by: number, step?: () => void): WorldBlock {
	const started = os.clock();
	const size = BLOCK_TILES;
	const x0 = bx * size;
	const y0 = by * size;
	// As células do bloco e mais uma linha e uma coluna (os quadrantes de baixo e da direita do último tile).
	const span = size + 1;
	const codes = new Array<string>(span * span);
	for (let j = 0; j < span; j++) {
		for (let i = 0; i < span; i++) codes[j * span + i] = terrainAt(x0 + i, y0 + j);
	}
	const at = (i: number, j: number) => plainCode(codes[j * span + i]);

	// As pilhas de recortes por camada: layers[z][célula].
	const layers = new Array<Array<Piece | undefined>>();
	const put = (z: number, cell: number, piece: Piece) => {
		while (layers.size() <= z) layers.push(new Array<Piece | undefined>(size * size));
		layers[z][cell] = piece;
	};
	let tiles = 0;
	let pieces = 0;
	let water = false;
	const pure = new Array<boolean>(size * size);
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const cell = y * size + x;
			const q = [at(x, y), at(x + 1, y), at(x, y + 1), at(x + 1, y + 1)];
			if (q[0] === "m" || q[0] === "r") water = true;
			tiles++;
			if (q[0] === q[1] && q[0] === q[2] && q[0] === q[3]) {
				pure[cell] = q[0] === "g";
				const base = basePiece(q[0], x, y);
				if (base) {
					put(0, cell, base);
					pieces++;
				}
				continue;
			}
			// Os terrenos do tile, do mais baixo ao mais alto.
			const present = new Array<WorldTerrain>();
			for (const code of q) {
				const terrain = TERRAINS.get(code);
				if (terrain && !present.includes(terrain)) present.push(terrain);
			}
			present.sort((a, b) => a.level < b.level);
			const variant = (y % 2) * 2 + (x % 2);
			// Dois terrenos com um conjunto da equipe: um tile Wang só, opaco.
			if (present.size() === 2) {
				const set = SETS.get(`${present[0].code}${present[1].code}`);
				if (set) {
					let mask = 0;
					q.forEach((code, k) => {
						if (code === set.a) mask += 2 ** k;
					});
					const row = math.floor(mask / 4);
					const col = mask % 4;
					put(0, cell, { image: SETS_SHEET, sx: set.x + col * WORLD_TILE, sy: set.y + row * WORLD_TILE, frames: 1, dy: 0 });
					pieces++;
					continue;
				}
			}
			let z = 0;
			const base = basePiece(present[0].code, x, y);
			if (base) {
				put(z, cell, base);
				pieces++;
			}
			for (let n = 1; n < present.size(); n++) {
				const over = present[n];
				const junction = JUNCTIONS.get(`${over.code}${present[n - 1].code}`);
				// Par sem junção: o gerador do plano (`tools/mundo_mapa.py`, `conferir_pares`) não deixa acontecer.
				if (!junction) continue;
				let mask = 0;
				q.forEach((code, k) => {
					const terrain = TERRAINS.get(code);
					if (terrain && terrain.level >= over.level) mask += 2 ** k;
				});
				z++;
				put(z, cell, {
					image: JUNCTION_SHEET,
					sx: mask * WORLD_TILE,
					sy: (junction[2] + variant) * WORLD_TILE,
					frames: junction[3],
					dy: junction[4],
				});
				pieces++;
			}
		}
		step?.();
	}

	// Os decalques: em células pares, sobre 2 × 2 tiles de grama pura; capim tem os dele.
	let decals = 0;
	for (let y = 0; y < size - 1; y += 2) {
		for (let x = 0; x < size - 1; x += 2) {
			const cell = y * size + x;
			if (!pure[cell] || !pure[cell + 1] || !pure[cell + size] || !pure[cell + size + 1]) continue;
			const group = codes[y * span + x] === "G" ? WORLD_DECALS.capim : WORLD_DECALS.grama;
			if (!group) continue;
			let roll = cellHash(x0 + x, y0 + y, 7) * 250;
			for (const [, sx, sy, w, h, perMille] of group) {
				// Um 2 × 2 tem 4 células: a chance por célula vezes 4, em mil, numa rolagem de 0 a 250.
				roll -= perMille;
				if (roll >= 0) continue;
				for (let j = 0; j < h && y + j < size; j++) {
					for (let i = 0; i < w && x + i < size; i++) {
						put(1, (y + j) * size + x + i, {
							image: JUNCTION_SHEET,
							sx: sx + i * WORLD_TILE,
							sy: sy + j * WORLD_TILE,
							frames: 1,
							dy: 0,
						});
						pieces++;
					}
				}
				decals++;
				break;
			}
		}
	}

	// Junta cada camada em retângulos, como `mergeCells` de `interior.ts` e `juntar.mjs` do Diorama, sem passar da
	// borda de um pedaço (`PIECE_TILES`): o cliente monta cada pedaço à parte.
	const runs = new Array<WorldRun>();
	let animated = 0;
	let limitX = size;
	let limitY = size;
	layers.forEach((layer, z) => {
		const used = new Array<boolean>(size * size);
		const free = (x: number, y: number) => x < limitX && y < limitY && !used[y * size + x];
		const contiguous = (a: Piece, x: number, y: number, dc: number, dl: number) => {
			if (!free(x, y)) return false;
			const b = layer[y * size + x];
			return (
				b !== undefined &&
				b.flat === undefined &&
				b.image === a.image &&
				b.frames === a.frames &&
				b.dy === a.dy &&
				b.sx === a.sx + dc * WORLD_TILE &&
				b.sy === a.sy + dl * WORLD_TILE
			);
		};
		const sameFlat = (key: string, x: number, y: number) => {
			if (!free(x, y)) return false;
			const b = layer[y * size + x];
			return b !== undefined && b.flat === key;
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
		for (let y = 0; y < size; y++) {
			for (let x = 0; x < size; x++) {
				if (used[y * size + x]) continue;
				const piece = layer[y * size + x];
				if (!piece) continue;
				limitX = (math.floor(x / PIECE_TILES) + 1) * PIECE_TILES;
				limitY = (math.floor(y / PIECE_TILES) + 1) * PIECE_TILES;
				const flat = piece.flat;
				const [w, h] =
					flat !== undefined
						? grow((cx, cy) => sameFlat(flat, cx, cy), x, y)
						: grow((cx, cy, i, j) => contiguous(piece, cx, cy, i, j), x, y);
				for (let j = 0; j < h; j++) {
					for (let i = 0; i < w; i++) used[(y + j) * size + x + i] = true;
				}
				if (flat !== undefined) {
					const side = piece.size ?? 8;
					runs.push([piece.image, x, y, w, h, piece.sx, piece.sy, side, side, z, 1, 0, 0]);
				} else {
					runs.push([piece.image, x, y, w, h, piece.sx, piece.sy, w * WORLD_TILE, h * WORLD_TILE, z, piece.frames, 0, piece.dy]);
					if (piece.frames > 1) animated++;
				}
			}
		}
	});

	// O que bloqueia: fora da fase, a água funda, as construções e as áreas fechadas que tocam o bloco.
	const li = x0 - PHASE1_CELL_X;
	const lj = y0 - PHASE1_CELL_Y;
	const blocked = new Array<boolean>(size * size);
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const i = li + x;
			const j = lj + y;
			blocked[y * size + x] = i < 0 || j < 0 || i >= PHASE1.width || j >= PHASE1.height || codes[y * span + x] === "m";
		}
	}
	// Os retângulos que tocam o bloco (`phaseBlockersIn`, os baldes por bloco), pintados direto.
	for (const [a0, b0, a1, b1] of phaseBlockersIn(math.floor(li / size), math.floor(lj / size))) {
		for (let y = math.max(b0 - lj, 0); y <= math.min(b1 - lj, size - 1); y++) {
			for (let x = math.max(a0 - li, 0); x <= math.min(a1 - li, size - 1); x++) blocked[y * size + x] = true;
		}
	}

	// Os lugares marcados que tocam o bloco (o canvas corta o que passa da borda; o nome fica no bloco do canto), com
	// `MARK_MARGIN` células de folga: a arte deitada de um objeto (a sebe, a lagoa) passa um pouco do retângulo da marca.
	const marks = new Array<WorldMark>();
	for (const [kind, mx, my, w, h, label] of PHASE1_MARKS) {
		const x = mx - li;
		const y = my - lj;
		const m = MARK_MARGIN;
		if (x + math.max(w, 1) + m <= 0 || y + math.max(h, 1) + m <= 0 || x - m >= size || y - m >= size) continue;
		const [name, category] = PHASE1_MARK_KINDS[kind];
		marks.push({ kind: name, category, x, y, w, h, label });
	}
	// As áreas fechadas (tapumes): marcadas como lugar sem passagem.
	for (const [a0, b0, a1, b1, why] of PHASE1_CLOSED) {
		const x = a0 - li;
		const y = b0 - lj;
		const w = a1 - a0 + 1;
		const h = b1 - b0 + 1;
		if (x + w <= 0 || y + h <= 0 || x >= size || y >= size) continue;
		marks.push({ kind: "fechado", category: "fechado", x, y, w, h, label: why });
	}

	return {
		bx,
		by,
		runs,
		blocked,
		water,
		marks,
		stats: { tiles, layers: pieces, decals, runs: runs.size(), animated, ms: (os.clock() - started) * 1000 },
	};
}
