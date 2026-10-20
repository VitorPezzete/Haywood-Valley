// As luzes em pixel, no estilo do Aeko (decisão do usuário em 2026-10-17): um halo em faixas, cada faixa
// com uma cor da paleta do Aeko e uma transparência só, sem degradê liso, deitado no chão por cima dos tiles.
// A força da hora (`shared/daylight.ts`) multiplica a opacidade de todas as faixas; o halo não recebe o tom do
// dia, porque ele é a própria luz. A tocha e a lareira tremem em 3 quadros. Quem está dentro de um halo (o
// boneco) clareia e esquenta como o chão embaixo dele (`lightAt`).
//
// Pelas janelas (pedido do usuário em 2026-10-18): de dia, a mancha do sol no piso logo abaixo, no formato da
// janela, que escorrega para um lado de manhã e para o outro à tarde e fica alaranjada e comprida no pôr do
// sol; de noite, a mancha azulada da lua, e o vidro da janela de noite fica na cor cheia. E o fogo da lareira
// da casa, peça derivada (`Aseprite\iluminacao\fogo_lareira`).

import { ASSETS } from "shared/assets";
import type { daylightAt } from "shared/daylight";
import type { InteriorTile } from "shared/interiors/types";
import { worldToArtPx } from "shared/view";
import { GroundLayer } from "./ground";
import { Interior, INTERIOR_TILE, sheetRect, TILE_ANIMATION_FPS } from "./interior";
import { LightKind, lightOf, WINDOW_GLASS, windowNightOrigin, windowOf, WindowCell } from "./lightTiles";
import { NO_TINT_ATTRIBUTE } from "./tint";

/**
 * A folha dos halos, `Aseprite\iluminacao\folha_luzes.png` (montada por `iluminacao\folha_luzes.py`, que também
 * imprime `LIGHT_FRAMES`), enviada em 2026-10-18 (id no registro, luz.folha). Sem o id, os halos
 * ficam de fora e o Output avisa; o tom do dia e as janelas de noite funcionam sem ela.
 */
export const LIGHT_SHEET = ASSETS["luz.folha"];
/**
 * A folha 2, `Aseprite\iluminacao\folha_luzes_v2.png`: os recortes da folha 1 nos mesmos lugares, mais a mancha
 * do sol, a do pôr do sol e o vidro de noite de cada janela (id no registro, luz.folha_v2). Sem o id, vale a
 * folha 1, sem o sol pelas janelas e sem o vidro na cor cheia, e o Output avisa.
 */
export const LIGHT_SHEET_V2 = ASSETS["luz.folha_v2"];
/**
 * O fogo da lareira da casa, `Aseprite\iluminacao\fogo_lareira\fogo_lareira.png` (4 quadros de 48 × 32 lado a
 * lado, a boca da fornalha inteira, [57-59, 30-31] da folha da casa; id no registro, luz.fogo_lareira). Sem o id,
 * a lareira fica sem fogo desenhado (só o halo) e o Output avisa.
 */
export const FIRE_SHEET = ASSETS["luz.fogo_lareira"];
const FIRE_TILE: InteriorTile = ["casa", 57, 30];
const FIRE_SIZE = new Vector2(48, 32);
const FIRE_FRAMES = 4;

type HaloKind = LightKind | "janela_sol" | "janela_poente";

interface HaloArt {
	size: Vector2;
	frames: Vector2[];
}

/** O recorte de cada halo na folha 1 (e nos mesmos lugares na 2): o tamanho e o canto de cada quadro. */
const LIGHT_FRAMES: Partial<Record<string, HaloArt>> = {
	lareira: {
		size: new Vector2(104, 80),
		frames: [new Vector2(2, 2), new Vector2(108, 2), new Vector2(214, 2)],
	},
	tocha: {
		size: new Vector2(64, 50),
		frames: [new Vector2(320, 2), new Vector2(386, 2), new Vector2(2, 84)],
	},
	abajur: { size: new Vector2(44, 36), frames: [new Vector2(68, 84)] },
	janela_noite: { size: new Vector2(56, 30), frames: [new Vector2(114, 84)] },
	janela_lua: { size: new Vector2(56, 30), frames: [new Vector2(172, 84)] },
};

/** Os recortes que só a folha 2 tem. */
const LIGHT_FRAMES_V2: Partial<Record<string, HaloArt>> = {
	janela_sol: { size: new Vector2(56, 30), frames: [new Vector2(2, 136)] },
	janela_poente: { size: new Vector2(56, 44), frames: [new Vector2(60, 136)] },
	vidro_simples_azul: { size: new Vector2(48, 48), frames: [new Vector2(118, 136)] },
	vidro_simples_amarelo: { size: new Vector2(48, 48), frames: [new Vector2(168, 136)] },
	vidro_cortina_vermelha: { size: new Vector2(64, 48), frames: [new Vector2(218, 136)] },
	vidro_cortina_verde: { size: new Vector2(64, 48), frames: [new Vector2(284, 136)] },
};

/** A imagem e o recorte de um tipo: da folha 2 quando ela tem id, senão da 1, ou nada. */
function artOf(kind: string) {
	const old = LIGHT_FRAMES[kind];
	if (LIGHT_SHEET_V2 !== "") {
		const art = old ?? LIGHT_FRAMES_V2[kind];
		return art ? { image: LIGHT_SHEET_V2, ...art } : undefined;
	}
	return old && LIGHT_SHEET !== "" ? { image: LIGHT_SHEET, ...old } : undefined;
}

type HaloBand = [radius: number, color: Color3, opacity: number];

/**
 * As faixas de cada halo, de dentro para fora: o raio em pixels de arte, a cor e a opacidade (o `luzes.json` da
 * versão 2, em `Aseprite\exterior_teste\v2`, e o `folha_luzes_v2.json`). Servem para clarear quem está em cima
 * do halo com a mesma faixa que o chão mostra. A janela é um retângulo: dentro dele vale a primeira faixa.
 */
const HALO_BANDS: Record<HaloKind, HaloBand[]> = {
	lareira: [
		[9, Color3.fromHex("#ffdd99"), 0.38],
		[18, Color3.fromHex("#ffad30"), 0.3],
		[27, Color3.fromHex("#ff9000"), 0.22],
		[38, Color3.fromHex("#e4620c"), 0.13],
		[48, Color3.fromHex("#9d4818"), 0.07],
	],
	tocha: [
		[6, Color3.fromHex("#ffdd99"), 0.38],
		[13, Color3.fromHex("#ffad30"), 0.28],
		[20, Color3.fromHex("#e4620c"), 0.16],
		[28, Color3.fromHex("#9d4818"), 0.08],
	],
	abajur: [
		[5, Color3.fromHex("#ffffec"), 0.45],
		[11, Color3.fromHex("#ffdd99"), 0.27],
		[18, Color3.fromHex("#eaaf66"), 0.13],
	],
	janela_noite: [[0, Color3.fromHex("#ffdd99"), 0.36]],
	janela_lua: [[0, Color3.fromHex("#c9d1e4"), 0.27]],
	janela_sol: [[0, Color3.fromHex("#ffdd99"), 0.48]],
	janela_poente: [[0, Color3.fromHex("#ff9000"), 0.4]],
};

/** O círculo de luz no chão, visto em 3/4, fica mais largo que alto (`achatamento_vertical`). */
const FLATTEN = 0.75;
/** Abaixo desta força o halo some de vez, em vez de ficar quase transparente. */
const LIGHT_OFF = 0.02;
/** Até quantas fileiras abaixo da janela (e da luz de parede) se procura o piso. */
const FLOOR_REACH = 6;
/** A luz de parede fica com o centro estes pixels abaixo do alto da primeira célula de piso. */
const FLOOR_LIGHT_DROP = 4;
/** Quanto a mancha do sol escorrega para o lado, no máximo (de manhã para a esquerda, à tarde para a direita). */
const SUN_SLIDE_PX = 2 * INTERIOR_TILE;

/** Quando o halo acende: com a força das luzes, só de noite (janela acesa, lua), com o sol, ou no pôr do sol. */
type HaloMode = "lights" | "night" | "sun" | "dusk";

interface Halo {
	label: ImageLabel;
	kind: HaloKind;
	mode: HaloMode;
	frames: Vector2[];
	size: Vector2;
	base: Vector2;
	corner: Vector2;
	power: number;
	phase: number;
	frame: number;
}

type GlassWindow = Interior["windows"][number];

type Daylight = ReturnType<typeof daylightAt>;

interface Extra {
	halos: Halo[];
	labels: ImageLabel[];
}

export interface Lights {
	count: number;
	version: number;
	update(day: Daylight, now: number): void;
	lightAt(position: Vector3, tone: Color3): Color3 | undefined;
	setExtra(key: string, cells: [x: number, y: number, tile: InteriorTile][]): void;
	destroy(): void;
}

const warned = new Set<string>();
function warnOnce(key: string, text: string) {
	if (warned.has(key)) return;
	warned.add(key);
	warn(text);
}

/**
 * Procura no interior os tiles que acendem uma luz (`LIGHT_TILES`), as janelas e a lareira, e põe os halos na
 * camada viva do chão (`Interior.live`), acima dos tiles e das sombras; o vidro de noite e o fogo vão logo acima
 * dos tiles. Tudo o que muda fica fora do canvas grande dos tiles parados.
 */
export function buildLights(interior: Interior): Lights {
	const halos = new Array<Halo>();
	/** O fogo de cada lareira, que troca de quadro. */
	const fires = new Array<ImageLabel>();
	const { x: ax, y: ay, width, height } = interior.area;

	if (LIGHT_SHEET === "" && LIGHT_SHEET_V2 === "") {
		warnOnce(
			"sheet",
			"[Luz] a folha dos halos ainda não tem id (luz.folha em assets/registro.json; arquivo " +
				"Aseprite\\iluminacao\\folha_luzes.png): sem halos; o tom do dia e as janelas de noite funcionam",
		);
	}
	if (LIGHT_SHEET_V2 === "") {
		warnOnce(
			"v2",
			"[Luz] a folha 2 das luzes ainda não tem id (luz.folha_v2 em assets/registro.json; arquivo " +
				"Aseprite\\iluminacao\\folha_luzes_v2.png): sem o sol pelas janelas e sem o vidro de noite na cor cheia",
		);
	}

	const add = (kind: HaloKind, canvasCenter: Vector2, mode: HaloMode, hangs: boolean) => {
		const art = artOf(kind);
		if (!art) return;
		const corner = canvasCenter.sub(new Vector2(art.size.X / 2, hangs ? 0 : art.size.Y / 2));
		const rounded = new Vector2(math.round(corner.X), math.round(corner.Y));
		const label = new Instance("ImageLabel");
		label.Name = `Light_${kind}`;
		label.BackgroundTransparency = 1;
		label.Image = art.image;
		label.ImageRectOffset = art.frames[0];
		label.ImageRectSize = art.size;
		label.Size = UDim2.fromOffset(art.size.X, art.size.Y);
		label.Position = UDim2.fromOffset(rounded.X, rounded.Y);
		label.ResampleMode = Enum.ResamplerMode.Pixelated;
		label.ZIndex = GroundLayer.Light;
		label.Visible = false;
		label.SetAttribute(NO_TINT_ATTRIBUTE, true);
		label.Parent = interior.live.gui;
		const halo: Halo = {
			label,
			kind,
			mode,
			frames: art.frames,
			size: art.size,
			base: rounded,
			corner: rounded,
			power: 0,
			phase: halos.size(),
			frame: -1,
		};
		halos.push(halo);
		return halo;
	};

	/** A primeira fileira de piso livre abaixo de (x, y), até `FLOOR_REACH` fileiras, ou nada. */
	const floorBelow = (x: number, y: number) => {
		for (let fy = y + 1; fy <= y + FLOOR_REACH && fy < ay + height; fy++) {
			if (!interior.blocked(x, fy)) return fy;
		}
		return undefined;
	};

	/** O halo do tile (x, y) que acende uma luz, ou nada. A luz de parede desce até o piso logo abaixo dela. */
	const tileLight = (tile: InteriorTile, x: number, y: number) => {
		const light = lightOf(tile);
		if (!light) return;
		let at = interior.canvasOf(x, y).add(new Vector2(light.center[0], light.center[1]));
		if (light.floor) {
			const fy = floorBelow(x, y);
			if (fy !== undefined) at = new Vector2(at.X, interior.canvasOf(x, fy).Y + FLOOR_LIGHT_DROP);
		}
		return add(light.kind, at, light.nightOnly === true ? "night" : "lights", light.hangs === true);
	};

	/** A lua, o sol e o pôr do sol de uma janela das colunas x0 a x1 com a fileira de baixo em y1. */
	const windowLights = (x0: number, x1: number, y1: number) => {
		const added = new Array<Halo>();
		// O piso: a primeira célula livre abaixo do meio da janela (a parede embaixo dela bloqueia).
		const fy = floorBelow(math.floor((x0 + x1 + 1) / 2), y1);
		if (fy === undefined) return added;
		const top = interior.canvasOf(x0, fy);
		const anchor = new Vector2(top.X + ((x1 - x0 + 1) * INTERIOR_TILE) / 2, top.Y);
		for (const [kind, mode] of [
			["janela_lua", "night"],
			["janela_sol", "sun"],
			["janela_poente", "dusk"],
		] as const) {
			const halo = add(kind, anchor, mode, true);
			if (halo) added.push(halo);
		}
		return added;
	};

	// Os tiles que acendem.
	let fireplaces = 0;
	for (let y = ay; y < ay + height; y++) {
		for (let x = ax; x < ax + width; x++) {
			const tile = interior.topTile(x, y);
			if (!tile) continue;
			if (tile[0] === FIRE_TILE[0] && tile[1] === FIRE_TILE[1] && tile[2] === FIRE_TILE[2]) {
				fireplaces += 1;
				if (FIRE_SHEET !== "") {
					const at = interior.canvasOf(x, y);
					const label = new Instance("ImageLabel");
					label.Name = "Fire";
					label.BackgroundTransparency = 1;
					label.Image = FIRE_SHEET;
					label.ImageRectSize = FIRE_SIZE;
					label.ImageRectOffset = Vector2.zero;
					label.Size = UDim2.fromOffset(FIRE_SIZE.X, FIRE_SIZE.Y);
					label.Position = UDim2.fromOffset(at.X, at.Y);
					label.ResampleMode = Enum.ResamplerMode.Pixelated;
					label.ZIndex = GroundLayer.Piece;
					// O fogo é a própria luz: na cor cheia à noite.
					label.SetAttribute(NO_TINT_ATTRIBUTE, true);
					label.Parent = interior.live.gui;
					fires.push(label);
				}
			}
			tileLight(tile, x, y);
		}
	}
	if (fireplaces > 0 && FIRE_SHEET === "") {
		warnOnce(
			"fire",
			"[Luz] o fogo da lareira ainda não tem id (luz.fogo_lareira em assets/registro.json; arquivo " +
				"Aseprite\\iluminacao\\fogo_lareira\\fogo_lareira.png): a lareira fica só com o halo",
		);
	}

	// As janelas: cada janela é um grupo de células de janela vizinhas; a lua, o sol e o pôr do sol caem no
	// primeiro piso livre embaixo do meio dela.
	const isWindow = (x: number, y: number) => {
		const tile = interior.topTile(x, y);
		return tile !== undefined && windowOf(tile) !== undefined;
	};
	const seen = new Set<number>();
	for (let y = ay; y < ay + height; y++) {
		for (let x = ax; x < ax + width; x++) {
			if (seen.has(y * 1000 + x) || !isWindow(x, y)) continue;
			// A janela inteira, por busca em largura (com `while`: a fila cresce dentro do laço).
			let x0 = x;
			let x1 = x;
			let y1 = y;
			const queue: [number, number][] = [[x, y]];
			seen.add(y * 1000 + x);
			let index = 0;
			while (index < queue.size()) {
				const [cx, cy] = queue[index++];
				x0 = math.min(x0, cx);
				x1 = math.max(x1, cx);
				y1 = math.max(y1, cy);
				for (const [dx, dy] of [
					[1, 0],
					[-1, 0],
					[0, 1],
					[0, -1],
				]) {
					const nx = cx + dx;
					const ny = cy + dy;
					if (seen.has(ny * 1000 + nx) || !isWindow(nx, ny)) continue;
					seen.add(ny * 1000 + nx);
					queue.push([nx, ny]);
				}
			}
			windowLights(x0, x1, y1);
		}
	}

	// O vidro de noite de cada imagem de janela, na cor cheia por cima dela (só com a folha 2).
	const glasses = new Array<ImageLabel>();
	let glassShown = false;
	const addGlass = (win: GlassWindow) => {
		const art = artOf(WINDOW_GLASS[win.group]);
		if (!art) return;
		const [oc, ol] = windowNightOrigin(win.group);
		const offset = art.frames[0].add(new Vector2(win.night[1] - oc, win.night[2] - ol).mul(INTERIOR_TILE));
		const label = new Instance("ImageLabel");
		label.Name = "NightGlass";
		label.BackgroundTransparency = 1;
		label.Image = art.image;
		label.ImageRectOffset = offset;
		label.Position = UDim2.fromOffset(win.canvas.X, win.canvas.Y);
		label.Size = UDim2.fromOffset(win.w * INTERIOR_TILE, win.h * INTERIOR_TILE);
		// A imagem de janela é um pedaço contínuo da folha: o vidro de noite, o pedaço do mesmo tamanho.
		label.ImageRectSize = new Vector2(win.w, win.h).mul(INTERIOR_TILE);
		label.ResampleMode = Enum.ResamplerMode.Pixelated;
		label.ZIndex = GroundLayer.Piece;
		label.Visible = glassShown;
		label.SetAttribute(NO_TINT_ATTRIBUTE, true);
		label.Parent = interior.live.gui;
		glasses.push(label);
		return label;
	};
	for (const win of interior.windows) addGlass(win);

	/**
     * As luzes de fora do mapa (as peças postas no Decorar, o fogão aceso), por dono: os halos e, nas janelas, a
     * versão de noite por cima da de dia e o vidro aceso. Trocar as células de um dono refaz as dele.
     */
	const extras = new Map<string, Extra>();
	/** As imagens de janela de noite das peças postas, que aparecem só de noite (as do mapa trocam no `setNight`). */
	const nightWindows = new Array<ImageLabel>();
	const dropExtra = (key: string) => {
		const old = extras.get(key);
		if (!old) return;
		extras.delete(key);
		for (const halo of old.halos) {
			halo.label.Destroy();
			const index = halos.indexOf(halo);
			if (index >= 0) halos.remove(index);
		}
		for (const label of old.labels) {
			label.Destroy();
			for (const list of [glasses, nightWindows]) {
				const index = list.indexOf(label);
				if (index >= 0) list.remove(index);
			}
		}
	};

	// Do chão do mundo para o canvas: o canto da célula (ax, ay) é um ponto conhecido dos dois.
	const canvasZero = interior.canvasOf(ax, ay).sub(worldToArtPx(interior.cellCorner(ax, ay)));

	const lights: Lights = {
		count: halos.size(),
		version: 0,
		update(day, now) {
			const tick = math.floor(now * TILE_ANIMATION_FPS);
			const slide = math.round(day.sunSide * SUN_SLIDE_PX);
			for (const halo of halos) {
				let power = day.lights;
				if (halo.mode === "night") power = day.night ? day.lights : 0;
				else if (halo.mode === "sun") power = day.dusk ? 0 : day.sun;
				else if (halo.mode === "dusk") power = day.dusk ? day.sun : 0;
				const shown = power > LIGHT_OFF;
				const newPower = shown ? power : 0;
				if (newPower !== halo.power) {
					halo.power = newPower;
					lights.version += 1;
				}
				if (halo.label.Visible !== shown) halo.label.Visible = shown;
				if (!shown) continue;
				const transparency = 1 - power;
				if (math.abs(halo.label.ImageTransparency - transparency) > 0.004) {
					halo.label.ImageTransparency = transparency;
				}
				if (halo.mode === "sun" || halo.mode === "dusk") {
					const corner = halo.base.add(new Vector2(slide, 0));
					if (corner !== halo.corner) {
						halo.corner = corner;
						lights.version += 1;
						halo.label.Position = UDim2.fromOffset(corner.X, corner.Y);
					}
				}
				const frame = (tick + halo.phase) % halo.frames.size();
				if (frame !== halo.frame) {
					halo.frame = frame;
					halo.label.ImageRectOffset = halo.frames[frame];
				}
			}
			if (day.night !== glassShown) {
				glassShown = day.night;
				for (const glass of glasses) glass.Visible = day.night;
				for (const night of nightWindows) night.Visible = day.night;
			}
			for (const fire of fires) {
				const offset = new Vector2((tick % FIRE_FRAMES) * FIRE_SIZE.X, 0);
				if (fire.ImageRectOffset !== offset) fire.ImageRectOffset = offset;
			}
		},
		lightAt(position, tone) {
			const at = canvasZero.add(worldToArtPx(position));
			let color: Color3 | undefined;
			for (const halo of halos) {
				if (halo.power <= 0) continue;
				const bands = HALO_BANDS[halo.kind];
				let band: HaloBand | undefined;
				if (bands[0][0] === 0) {
					// A janela: o retângulo do halo.
					const inside =
						at.X >= halo.corner.X &&
						at.Y >= halo.corner.Y &&
						at.X < halo.corner.X + halo.size.X &&
						at.Y < halo.corner.Y + halo.size.Y;
					band = inside ? bands[0] : undefined;
				} else {
					const center = halo.corner.add(halo.size.div(2));
					const d = math.sqrt((at.X - center.X) ** 2 + ((at.Y - center.Y) / FLATTEN) ** 2);
					band = bands.find(([radius]) => d < radius);
				}
				if (!band) continue;
				// A mesma mistura do halo sobre o chão: a cor da faixa por cima, com a opacidade dela vezes a força.
				color = (color ?? tone).Lerp(band[1], band[2] * halo.power);
			}
			return color;
		},
		setExtra(key, cells) {
			dropExtra(key);
			lights.version += 1;
			if (cells.size() === 0) return;
			const own: Extra = { halos: [], labels: [] };
			// As células de janela, juntas: o retângulo delas é uma janela (a peça posta é uma janela só).
			let win: { x0: number; y0: number; x1: number; y1: number; info: WindowCell } | undefined;
			for (const [x, y, tile] of cells) {
				const halo = tileLight(tile, x, y);
				if (halo) own.halos.push(halo);
				const info = windowOf(tile);
				if (!info) continue;
				if (!win) win = { x0: x, y0: y, x1: x, y1: y, info };
				win.x1 = math.max(win.x1, x);
				win.y1 = math.max(win.y1, y);
				if (x <= win.x0 && y <= win.y0) {
					win.x0 = x;
					win.y0 = y;
					win.info = info;
				}
			}
			if (win) {
				for (const halo of windowLights(win.x0, win.x1, win.y1)) own.halos.push(halo);
				const w = win.x1 - win.x0 + 1;
				const h = win.y1 - win.y0 + 1;
				const canvas = interior.canvasOf(win.x0, win.y0);
				// A versão de noite da mesma folha, por cima da de dia (que a peça posta desenha), só de noite.
				const rect = sheetRect(win.info.night, w, h);
				const night = new Instance("ImageLabel");
				night.Name = "NightWindow";
				night.BackgroundTransparency = 1;
				night.Image = rect.image;
				night.ImageRectOffset = rect.offset;
				night.ImageRectSize = rect.size;
				night.Size = UDim2.fromOffset(rect.size.X, rect.size.Y);
				night.Position = UDim2.fromOffset(canvas.X, canvas.Y);
				night.ResampleMode = Enum.ResamplerMode.Pixelated;
				night.ZIndex = GroundLayer.Piece;
				night.Visible = glassShown;
				night.Parent = interior.live.gui;
				nightWindows.push(night);
				own.labels.push(night);
				const glass = addGlass({ canvas, w, h, group: win.info.group, night: win.info.night });
				if (glass) own.labels.push(glass);
			}
			extras.set(key, own);
		},
		destroy() {
			for (const halo of halos) halo.label.Destroy();
			for (const label of [...glasses, ...fires, ...nightWindows]) label.Destroy();
			halos.clear();
			extras.clear();
		},
	};
	return lights;
}
