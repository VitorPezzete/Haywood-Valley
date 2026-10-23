// O chão do mundo inteiro, célula a célula (`docs/mundo/MAPA_MUNDO.md` §12, 2026-10-23). Pedido do usuário: "faça o
// mapa todo", "expanda para além do reino Haywood, faça tudo", e o que não tem arte fica como lugar marcado, sem arte
// nova. O mundo tem 832 × 832 blocos de 64 × 64 tiles: não cabe em dado por célula. Cada bloco sai daqui, na hora e
// sempre igual (o mesmo código no cliente, que desenha, e no servidor, que confere o bloqueio), a partir do plano
// compacto que `tools/mundo_mapa.py jogo` grava:
//
// - `plano.ts`: o bioma e o reino de cada bloco (RLE). A borda entre biomas é torcida por um ruído suave (até 44 tiles)
//   para não sair em degraus de 64.
// - `mapa.ts`: estradas e trilhas (polilinhas com largura), rios (com meia largura; o Dry Riverbed é seco), lagos
//   (elipses), pontes, cidades (a caixa do plano), distritos e lotes, lugares.
// - `fase1.ts`: a fase 1 (Ribeira leste e os 4 primeiros lotes do D03) continua vindo célula a célula, igual: ela é
//   "congelada" (nada do gerador a muda); o que está em volta se ajusta a ela.
//
// Como uma célula vira terreno (`rawCode`, em ordem): fora do mundo, mar fundo; na fase 1, o dela; num distrito, a
// avenida, a trilha e os canteiros de terra dos lotes (o resto é o chão do bioma); fora disso o chão do bioma (grama nos
// campos, na floresta e nas ilhas; areia na costa; mar fundo no mar; nos biomas sem arte, os terrenos lisos de
// `terreno.ts`, pintados na cor do bioma), as manchas do bioma (paredão nas montanhas, lava no vulcânico, poças no
// pântano), lagos e rios (raso na margem, fundo no meio), estradas (terra; vau raso onde cruzam a água; calçada dentro
// das cidades), as ruas e a praça das cidades (calçada), a clareira dos lugares. Depois, três passadas de vizinhança
// deixam a grade dupla sempre com junção (`legalize`): terra firme encostada na água vira areia, mar fundo encostado em
// terra vira raso; nada muda dentro da fase 1.
//
// Os objetos (lugares marcados, ou a arte do catálogo quando ela tiver id): as quadras das cidades (lotes de 18 × 18 com
// sebe, casa e horta, como as da Ribeira da fase 1), a praça, o castelo da capital, o muro com portões onde as
// estradas entram, a fazenda de cada lote (cerca com porteira, casa, celeiro, galinheiro, espantalho, placa), as sebes
// dos distritos, o centro de cada distrito, os lugares do plano, as pontes e a vegetação espalhada por semente (os
// tipos do catálogo nos campos e na floresta; nos outros biomas, marcas com o nome do que falta criar). O que bloqueia
// sai das marcas (o catálogo diz o pé e o bloqueio da arte) e do terreno (mar fundo, paredão, lava).
//
// Desempenho: um bloco longe de tudo e no meio de um bioma sai de uma vez (uma cor só, sem passar célula a célula); os
// outros calculam 72 × 72 células (o bloco e 4 de folga). O ruído é amostrado de 4 em 4 células e interpolado. Os blocos
// prontos ficam guardados (`CACHE_BLOCKS`).

import { PHASE1, PHASE1_BLOCKERS, PHASE1_CLOSED, PHASE1_MARK_KINDS, PHASE1_MARKS, PHASE1_ROWS } from "./fase1";
import { BIOME_ROWS, REALM_ROWS, WORLD_BIOMES, WORLD_BLOCKS, WORLD_REALMS } from "./plano";
import { WORLD_TERRAINS } from "./terreno";
import { WORLD_OBJECT_BLOCKS, WORLD_OBJECTS } from "./objetos";
import {
	WORLD_BRIDGES,
	WORLD_DISTRICTS,
	WORLD_LAKES,
	WORLD_PLOTS,
	WORLD_POIS,
	WORLD_RIVERS,
	WORLD_ROADS,
	WORLD_TOWNS,
} from "./mapa";

/**
 * Se o mundo inteiro está aberto (§12). Desligado em 2026-10-23: o usuário achou feia a vista da fase 1 e quer mudar o
 * visual (com os assets do ALttP e da equipe) antes de abrir mais mapa. Desligado, tudo fica como na fase 1: fora dela
 * a célula repete a da borda e bloqueia, nada do gerador aparece, e só os lotes A a D existem. Ligado, o resto do mundo
 * sai deste gerador (ainda não testado no Studio).
 */
export const WORLD_OPEN = false;

/** Lado do bloco, em tiles. */
export const BLOCK_TILES = 64;
/** Lado do mundo, em células. */
export const WORLD_CELLS = WORLD_BLOCKS * BLOCK_TILES;
/** A primeira célula da fase 1 no mundo. */
export const PHASE1_CELL_X = PHASE1.blockX * BLOCK_TILES;
export const PHASE1_CELL_Y = PHASE1.blockY * BLOCK_TILES;
/** Folga, em células, com que um lugar marcado ainda entra no bloco vizinho (a arte deitada passa um pouco da marca). */
export const MARK_MARGIN = 2;
/** Folga das células calculadas em volta do bloco: as três passadas de vizinhança e a folga das marcas. */
const RAW_MARGIN = 4;
const RAW_SIDE = BLOCK_TILES + 2 * RAW_MARGIN;
/** As células com o código certo, em volta do bloco: o bloco e uma a mais de cada lado (a grade dupla usa a de baixo e a da direita). */
const CODE_SIDE = BLOCK_TILES + 2;
/** Quantos blocos prontos ficam guardados (no cliente, os da vista; no servidor, os de quem pede). */
const CACHE_BLOCKS = 48;

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

/** O bloco pronto: o terreno, o que bloqueia, as marcas e os pontos de água (o som do rio e do mar). */
export interface BlockContent {
	bx: number;
	by: number;
	/** O código de cada célula de x0 − 1 a x0 + 64 (66 × 66, em ordem de leitura). */
	codes: string[];
	/** As células do bloco que bloqueiam (64 × 64). */
	blocked: boolean[];
	marks: WorldMark[];
	/** Se o bloco tem água (para o canvas de baixo, com a água do rio animada). */
	water: boolean;
	/** Células de água do bloco, de 4 em 4, em células do mundo. */
	waterPoints: [number, number][];
	/** Se saiu pelo caminho rápido (um bioma só, sem nada em volta). */
	plain: boolean;
	ms: number;
}

// ------------------------------------------------------------------ o hash e o ruído

/** Um número de 0 a 1 que só depende da célula e da semente (o mesmo bloco sai sempre igual). */
export function cellHash(x: number, y: number, seed: number) {
	let h = (x * 374761393 + y * 668265263 + seed * 2147483647) % 4294967296;
	h = bit32.bxor(h, bit32.rshift(h, 13));
	h = (h * 1274126177) % 4294967296;
	h = bit32.bxor(h, bit32.rshift(h, 16));
	return h / 4294967296;
}

/** Ruído de valor (0 a 1), suave, com a grade de `spacing` células. */
function valueNoise(x: number, y: number, spacing: number, seed: number) {
	const fx = x / spacing;
	const fy = y / spacing;
	const ix = math.floor(fx);
	const iy = math.floor(fy);
	let tx = fx - ix;
	let ty = fy - iy;
	tx = tx * tx * (3 - 2 * tx);
	ty = ty * ty * (3 - 2 * ty);
	const a = cellHash(ix, iy, seed);
	const b = cellHash(ix + 1, iy, seed);
	const c = cellHash(ix, iy + 1, seed);
	const d = cellHash(ix + 1, iy + 1, seed);
	const top = a + (b - a) * tx;
	const bottom = c + (d - c) * tx;
	return top + (bottom - top) * ty;
}

/** Quanto a borda dos biomas é torcida (em células): duas oitavas, até 44 (menos que um bloco). */
function warpAt(x: number, y: number): [number, number] {
	const wx = (valueNoise(x, y, 96, 11) - 0.5) * 72 + (valueNoise(x, y, 24, 12) - 0.5) * 16;
	const wy = (valueNoise(x, y, 96, 13) - 0.5) * 72 + (valueNoise(x, y, 24, 14) - 0.5) * 16;
	return [wx, wy];
}

/** O ruído das manchas do bioma (paredão, lava, poças): 0 a 1. */
function patchNoise(x: number, y: number) {
	return valueNoise(x, y, 36, 21) * 0.7 + valueNoise(x, y, 12, 22) * 0.3;
}

// ------------------------------------------------------------------ o plano por bloco (RLE)

interface Runs {
	starts: number[];
	codes: string[];
	width: number;
}

function decodeRow(text: string): Runs {
	const row: Runs = { starts: [], codes: [], width: 0 };
	let at = 0;
	for (const [code, count] of text.gmatch("(%a)(%d+)")) {
		row.starts.push(at);
		row.codes.push(code as string);
		at += tonumber(count) ?? 0;
	}
	row.width = at;
	return row;
}

function runAt(row: Runs, i: number) {
	let lo = 0;
	let hi = row.starts.size() - 1;
	while (lo < hi) {
		const mid = math.ceil((lo + hi) / 2);
		if (row.starts[mid] <= i) lo = mid;
		else hi = mid - 1;
	}
	return row.codes[lo];
}

const biomeRows = new Map<number, Runs>();
const realmRows = new Map<number, Runs>();
const phaseRows = new Map<number, Runs>();
/** O código "a" do RLE do plano é o 0. */
const A_BYTE = string.byte("a")[0];

/** O bioma do bloco (bx, by): o índice de `WORLD_BIOMES`; fora do mundo, o mar (13). */
export function biomeOfBlock(bx: number, by: number) {
	if (bx < 0 || by < 0 || bx >= WORLD_BLOCKS || by >= WORLD_BLOCKS) return 13;
	let row = biomeRows.get(by);
	if (!row) {
		row = decodeRow(BIOME_ROWS[by]);
		biomeRows.set(by, row);
	}
	return string.byte(runAt(row, bx))[0] - A_BYTE;
}

/** O reino do bloco: 0 o mar, 1 a 6 os reinos, 7 a 12 as cidades livres (`WORLD_REALMS`). */
export function realmOfBlock(bx: number, by: number) {
	if (bx < 0 || by < 0 || bx >= WORLD_BLOCKS || by >= WORLD_BLOCKS) return 0;
	let row = realmRows.get(by);
	if (!row) {
		row = decodeRow(REALM_ROWS[by]);
		realmRows.set(by, row);
	}
	return string.byte(runAt(row, bx))[0] - A_BYTE;
}

/** O bioma da célula, com a borda torcida. */
export function biomeAt(x: number, y: number) {
	const [wx, wy] = warpAt(x, y);
	return biomeOfBlock(math.floor((x + wx) / BLOCK_TILES), math.floor((y + wy) / BLOCK_TILES));
}

/** O reino da célula, com a mesma borda torcida dos biomas. */
export function realmAt(x: number, y: number) {
	const [wx, wy] = warpAt(x, y);
	return realmOfBlock(math.floor((x + wx) / BLOCK_TILES), math.floor((y + wy) / BLOCK_TILES));
}

// ------------------------------------------------------------------ a fase 1

/** Se a célula (x, y) do mundo é da fase 1 (os dados dela vêm de `fase1.ts`, célula a célula). */
export function inPhase1(x: number, y: number) {
	const i = x - PHASE1_CELL_X;
	const j = y - PHASE1_CELL_Y;
	return i >= 0 && j >= 0 && i < PHASE1.width && j < PHASE1.height;
}

/** O código da fase 1 na célula (fora dela, o da borda mais perto), como em `fase1.ts` ("G" é grama com capim). */
export function phase1Code(x: number, y: number) {
	const i = math.clamp(x - PHASE1_CELL_X, 0, PHASE1.width - 1);
	const j = math.clamp(y - PHASE1_CELL_Y, 0, PHASE1.height - 1);
	let row = phaseRows.get(j);
	if (!row) {
		row = decodeRow(PHASE1_ROWS[j]);
		phaseRows.set(j, row);
	}
	return runAt(row, i);
}

type Rect = [number, number, number, number, ...unknown[]];

/**
 * Os retângulos que bloqueiam na fase 1, em baldes de 64 × 64 células da fase (um por bloco): com o catálogo dos
 * objetos são uns 600 (cada tronco de árvore), e procurar em todos a cada célula deixava compor um bloco 20 vezes
 * mais lento.
 */
const phaseBuckets = new Map<number, Rect[]>();
for (const list of [PHASE1_BLOCKERS, PHASE1_CLOSED] as ReadonlyArray<ReadonlyArray<Rect>>) {
	for (const rect of list) {
		const [x0, y0, x1, y1] = rect;
		for (let bj = math.floor(y0 / BLOCK_TILES); bj <= math.floor(y1 / BLOCK_TILES); bj++) {
			for (let bi = math.floor(x0 / BLOCK_TILES); bi <= math.floor(x1 / BLOCK_TILES); bi++) {
				const k = bj * 1000 + bi;
				const bucket = phaseBuckets.get(k) ?? [];
				bucket.push(rect);
				phaseBuckets.set(k, bucket);
			}
		}
	}
}

/** Os retângulos que bloqueiam e tocam o bloco (bi, bj) da fase (células desde o canto da fase). */
export function phaseBlockersIn(bi: number, bj: number): ReadonlyArray<Rect> {
	return phaseBuckets.get(bj * 1000 + bi) ?? [];
}

// ------------------------------------------------------------------ os biomas

/** O chão de cada bioma (o índice de `WORLD_BIOMES`): grama, areia, mar fundo ou um terreno liso de `terreno.ts`. */
const BIOME_GROUND = ["g", "g", "p", "n", "o", "d", "s", "j", "w", "v", "a", "g", "x", "m", "m"];
const SEA_BIOMES = new Set([13, 14]);
const WATER = new Set(["r", "m"]);
/** O que não é chão firme na legalização: a água e a areia (a areia é a borda dela). */
const SHORE = new Set(["r", "m", "a"]);

/** A vegetação de cada bioma: a chance por quadrado de 8 × 8 células e os tipos, com o peso. */
const VEGETATION: Record<number, { density: number; kinds: [string, number][] }> = {
	0: { density: 0.1, kinds: [["arvore_pequena", 3], ["arbusto", 3], ["pedra_leve", 2], ["flores_brancas", 1], ["arvore_grande", 1]] },
	1: { density: 0.55, kinds: [["arvore_grande", 9], ["arvore_pequena", 5], ["moita_grande", 2], ["moita_cruz", 1], ["arbusto", 2], ["toco", 1]] },
	2: { density: 0.5, kinds: [["pinheiro", 8], ["toco", 1], ["pedra_leve", 1]] },
	3: { density: 0.06, kinds: [["pinheiro_neve", 6], ["pedra_leve", 4]] },
	4: { density: 0.12, kinds: [["pedra_leve", 6], ["rocha", 4]] },
	5: { density: 0.04, kinds: [["cacto", 6], ["ossos", 2], ["pedra_leve", 2]] },
	6: { density: 0.06, kinds: [["baoba", 3], ["capim_seco", 4], ["cupinzeiro", 3]] },
	7: { density: 0.6, kinds: [["arvore_tropical", 6], ["palmeira", 2], ["folhagem", 2]] },
	8: { density: 0.2, kinds: [["mangue", 6], ["juncos", 4]] },
	9: { density: 0.05, kinds: [["rocha", 7], ["fumarola", 3]] },
	10: { density: 0.04, kinds: [["coqueiro", 7], ["pedra_leve", 3]] },
	11: { density: 0.12, kinds: [["coqueiro", 5], ["arbusto", 3], ["arvore_pequena", 2]] },
	12: { density: 0.15, kinds: [["cogumelo_gigante", 5], ["cristal", 5]] },
};
/** A densidade da vegetação dentro dos lotes (o mato que o jogador limpa para crescer, como nos lotes da fase 1). */
const LOT_DENSITY = 0.35;
/** As plantas sem arte que bloqueiam a célula delas (o tronco); as do catálogo bloqueiam pelo catálogo. */
const PLANT_BLOCKS = new Set([
	"pinheiro",
	"pinheiro_neve",
	"rocha",
	"cacto",
	"baoba",
	"cupinzeiro",
	"arvore_tropical",
	"palmeira",
	"mangue",
	"fumarola",
	"coqueiro",
	"cogumelo_gigante",
	"cristal",
]);

const TERRAIN_BLOCKS = new Set<string>();
for (const terrain of WORLD_TERRAINS) if (terrain.blocks) TERRAIN_BLOCKS.add(terrain.code);

/** Se o terreno do código não se anda (mar fundo, paredão, lava). */
export function codeBlocks(code: string) {
	return TERRAIN_BLOCKS.has(code);
}

// ------------------------------------------------------------------ o plano compacto, indexado

/** Lado dos baldes do índice, em células (8 × 8 blocos). */
const BUCKET = 512;

interface Seg {
	ax: number;
	ay: number;
	bx: number;
	by: number;
	dx: number;
	dy: number;
	len2: number;
	/** Meia largura, em células. */
	hw: number;
	river: boolean;
	dry: boolean;
}
interface Lake {
	cx: number;
	cy: number;
	rx: number;
	ry: number;
	cos: number;
	sin: number;
	deep: number;
}
export interface Town {
	name: string;
	kind: string;
	x0: number;
	y0: number;
	x1: number;
	y1: number;
	realm: number;
	/** Os blocos construídos (as vilas só têm os 2 × 2 do meio): [bx0, by0, bx1, by1]. */
	built: [number, number, number, number];
	/** O bloco da praça e, na capital, os blocos do castelo [bx0, by0, bx1, by1]. */
	plaza: [number, number];
	castle?: [number, number, number, number];
	walled: boolean;
}
export interface District {
	name: string;
	code: string;
	x0: number;
	y0: number;
	x1: number;
	y1: number;
	cols: number;
	rows: number;
	center: [number, number, number, number];
	city: string;
}
/** Um lote: a área de 256 × 256, a fazenda inicial de 64 × 64 e o portão, em células do mundo. */
export interface WorldPlot {
	name: string;
	district: string;
	area: [number, number, number, number];
	farm: [number, number, number, number];
	gate: [number, number];
	/** 0: a trilha sai pela direita da fazenda (coluna da esquerda do par); 1: pela esquerda. */
	side: number;
}
export interface Poi {
	name: string;
	kind: string;
	mark: string;
	x0: number;
	y0: number;
	w: number;
	h: number;
	category: string;
	blocks: boolean;
}

type Feature =
	| { t: "seg"; v: Seg; box: Rect }
	| { t: "lake"; v: Lake; box: Rect }
	| { t: "town"; v: Town; box: Rect }
	| { t: "district"; v: District; box: Rect }
	| { t: "poi"; v: Poi; box: Rect }
	| { t: "bridge"; v: [string, number, number, number, number]; box: Rect };

const buckets = new Map<number, Feature[]>();
function index(feature: Feature) {
	const [x0, y0, x1, y1] = feature.box;
	for (let j = math.floor(y0 / BUCKET); j <= math.floor(y1 / BUCKET); j++) {
		for (let i = math.floor(x0 / BUCKET); i <= math.floor(x1 / BUCKET); i++) {
			const k = j * 1000 + i;
			const list = buckets.get(k) ?? [];
			list.push(feature);
			buckets.set(k, list);
		}
	}
}

function addPolyline(points: ReadonlyArray<number>, from: number, hw: number, river: boolean, dry: boolean) {
	for (let k = from; k + 3 < points.size(); k += 2) {
		const ax = points[k];
		const ay = points[k + 1];
		const bx = points[k + 2];
		const by = points[k + 3];
		const dx = bx - ax;
		const dy = by - ay;
		const reach = hw + 4;
		const seg: Seg = { ax, ay, bx, by, dx, dy, len2: dx * dx + dy * dy, hw, river, dry };
		index({
			t: "seg",
			v: seg,
			box: [math.min(ax, bx) - reach, math.min(ay, by) - reach, math.max(ax, bx) + reach, math.max(ay, by) + reach],
		});
	}
}
for (const road of WORLD_ROADS) addPolyline(road, 1, road[0] / 2, false, false);
for (const [, hw, dry, points] of WORLD_RIVERS) addPolyline(points, 0, hw, true, dry);
for (const [, cx, cy, rx, ry, angle] of WORLD_LAKES) {
	const r = math.max(rx, ry) + 2;
	const lake: Lake = { cx, cy, rx, ry, cos: math.cos(angle), sin: math.sin(angle), deep: math.min(rx, ry) >= 8 ? 1 - 3 / math.min(rx, ry) : -1 };
	index({ t: "lake", v: lake, box: [cx - r, cy - r, cx + r, cy + r] });
}

/** As cidades (a caixa do plano), na ordem de `mapa.ts`. */
export const TOWNS: Town[] = WORLD_TOWNS.map(([name, kind, x0, y0, x1, y1, realm]) => {
	const bx0 = x0 / BLOCK_TILES;
	const by0 = y0 / BLOCK_TILES;
	const bx1 = (x1 + 1) / BLOCK_TILES - 1;
	const by1 = (y1 + 1) / BLOCK_TILES - 1;
	const cbx = math.floor((bx0 + bx1 + 1) / 2);
	const cby = math.floor((by0 + by1 + 1) / 2);
	const village = kind === "vila";
	const town: Town = {
		name,
		kind,
		x0,
		y0,
		x1,
		y1,
		realm,
		built: village ? [cbx - 1, cby - 1, cbx, cby] : [bx0, by0, bx1, by1],
		plaza: [cbx, cby],
		walled: !village,
	};
	// O castelo da capital: 6 × 6 blocos no alto da caixa (o plano põe o castelo ao norte, sobre a enseada).
	if (kind === "capital") town.castle = [cbx - 3, by0, cbx + 2, by0 + 5];
	return town;
});
for (const town of TOWNS) index({ t: "town", v: town, box: [town.x0 - 3, town.y0 - 3, town.x1 + 3, town.y1 + 3] });

/** Os distritos de fazenda, na ordem de `mapa.ts`. */
export const DISTRICTS: District[] = WORLD_DISTRICTS.map(([name, code, x, y, cols, rows, cx0, cy0, cx1, cy1, city]) => ({
	name,
	code,
	x0: x,
	y0: y,
	x1: x + cols * 256 - 1,
	y1: y + rows * 256 - 1,
	cols,
	rows,
	center: [cx0, cy0, cx1, cy1],
	city,
}));
for (const district of DISTRICTS) {
	const [cx0, cy0, cx1, cy1] = district.center;
	index({
		t: "district",
		v: district,
		box: [math.min(district.x0, cx0) - 8, math.min(district.y0, cy0) - 8, math.max(district.x1, cx1) + 8, math.max(district.y1, cy1) + 8],
	});
}

/** Os lotes, na ordem em que o servidor os dá (o D03 primeiro: A a D são os da fase 1). */
export const PLOTS: WorldPlot[] = WORLD_PLOTS.map(([name, d, x, y, side]) => {
	const fx = x + 96;
	const fy = y + 96;
	return {
		name,
		district: DISTRICTS[d].code,
		area: [x, y, x + 255, y + 255],
		farm: [fx, fy, fx + 63, fy + 63],
		gate: side === 0 ? [fx + 70, fy + 29] : [fx - 6, fy + 29],
		side,
	};
});

/** Os lugares do plano que não são cidade nem distrito. */
export const POIS: Poi[] = WORLD_POIS.map(([name, kind, mark, x, y, w, h, category, blocks]) => ({
	name,
	kind,
	mark,
	x0: x,
	y0: y,
	w,
	h,
	category,
	blocks: blocks === 1,
}));
for (const poi of POIS) {
	if (poi.mark !== "") index({ t: "poi", v: poi, box: [poi.x0 - 4, poi.y0 - 4, poi.x0 + poi.w + 4, poi.y0 + poi.h + 4] });
}
for (const bridge of WORLD_BRIDGES) {
	const [, x, y, w, h] = bridge;
	index({ t: "bridge", v: bridge, box: [x, y, x + w - 1, y + h - 1] });
}

/** O que toca o retângulo (células do mundo, inclusivo). */
function featuresIn(x0: number, y0: number, x1: number, y1: number) {
	const found = new Array<Feature>();
	const seen = new Set<Feature>();
	for (let j = math.floor(y0 / BUCKET); j <= math.floor(y1 / BUCKET); j++) {
		for (let i = math.floor(x0 / BUCKET); i <= math.floor(x1 / BUCKET); i++) {
			const list = buckets.get(j * 1000 + i);
			if (!list) continue;
			for (const feature of list) {
				if (seen.has(feature)) continue;
				seen.add(feature);
				const [a0, b0, a1, b1] = feature.box;
				if (a1 < x0 || b1 < y0 || a0 > x1 || b0 > y1) continue;
				found.push(feature);
			}
		}
	}
	return found;
}

// ------------------------------------------------------------------ cidades, distritos e lotes, célula a célula

/** Se a célula está numa faixa de rua (4 células em cada borda do bloco), como as quadras da Ribeira da fase 1. */
function streetBand(x: number, y: number) {
	const i = x % BLOCK_TILES;
	const j = y % BLOCK_TILES;
	return i < 4 || i >= 60 || j < 4 || j >= 60;
}

function insideBlocks(bx: number, by: number, r: [number, number, number, number] | undefined) {
	return r !== undefined && bx >= r[0] && by >= r[1] && bx <= r[2] && by <= r[3];
}

/** O código de uma célula dentro do retângulo de um distrito (nada: o chão do bioma). */
function districtCode(d: District, x: number, y: number): string | undefined {
	const i = x - d.x0;
	const j = y - d.y0;
	// As avenidas N-S no meio de cada par de colunas e as E-O entre as linhas de lotes (6 células).
	for (let p = 0; p < d.cols / 2; p++) {
		const ax = (2 * p + 1) * 256 - 3;
		if (i >= ax && i <= ax + 5) return "t";
	}
	for (let r = 1; r < d.rows; r++) {
		const ay = r * 256 - 3;
		if (j >= ay && j <= ay + 5) return "t";
	}
	const c = math.floor(i / 256);
	const r = math.floor(j / 256);
	const fx = c * 256 + 96;
	const fy = r * 256 + 96;
	// A trilha do portão (3 células) até a avenida do par.
	if (j >= fy + 28 && j <= fy + 30) {
		if (c % 2 === 0 && i >= fx + 64 && i <= c * 256 + 255) return "t";
		if (c % 2 === 1 && i >= c * 256 && i < fx) return "t";
	}
	// Os três canteiros de terra da fazenda (como os do esboço da fase 1).
	if (j >= fy + 34 && j <= fy + 53) {
		for (let k = 0; k < 3; k++) {
			const sx = fx + 8 + k * 17;
			if (i >= sx && i <= sx + 12) return "t";
		}
	}
	return undefined;
}

// ------------------------------------------------------------------ o terreno de uma célula

/** O que o cálculo de um bloco já achou em volta dele (para não procurar de novo célula a célula). */
interface Near {
	segs: Seg[];
	lakes: Lake[];
	towns: Town[];
	districts: District[];
	pois: Poi[];
	bridges: [string, number, number, number, number][];
}

function nearOf(x0: number, y0: number, x1: number, y1: number): Near {
	const near: Near = { segs: [], lakes: [], towns: [], districts: [], pois: [], bridges: [] };
	for (const f of featuresIn(x0, y0, x1, y1)) {
		if (f.t === "seg") near.segs.push(f.v);
		else if (f.t === "lake") near.lakes.push(f.v);
		else if (f.t === "town") near.towns.push(f.v);
		else if (f.t === "district") near.districts.push(f.v);
		else if (f.t === "poi") near.pois.push(f.v);
		else near.bridges.push(f.v);
	}
	return near;
}

/**
 * O terreno de uma célula antes das passadas de vizinhança. `biome` é o bioma dela (já com a borda torcida) e `patch`
 * o ruído das manchas (só nos biomas que têm).
 */
function rawCode(x: number, y: number, biome: number, patch: number, near: Near): string {
	if (x < 0 || y < 0 || x >= WORLD_CELLS || y >= WORLD_CELLS) return "m";
	const sea = SEA_BIOMES.has(biome);
	const ground = sea ? "g" : BIOME_GROUND[biome];
	for (const d of near.districts) {
		if (x >= d.x0 && y >= d.y0 && x <= d.x1 && y <= d.y1) return districtCode(d, x, y) ?? ground;
		const [cx0, cy0, cx1, cy1] = d.center;
		if (x >= cx0 && y >= cy0 && x <= cx1 && y <= cy1) return "t";
	}
	let code = sea ? "m" : ground;
	if (!sea) {
		if (biome === 4 && patch > 0.66) code = "q";
		else if (biome === 9 && patch > 0.74) code = "l";
		else if (biome === 8 && patch > 0.7) code = patch > 0.78 ? "m" : "r";
	}
	// Lagos e rios: raso na margem, fundo no meio.
	let water = false;
	let deep = false;
	let dryBed = false;
	for (const lake of near.lakes) {
		const dx = x + 0.5 - lake.cx;
		const dy = y + 0.5 - lake.cy;
		const u = (dx * lake.cos + dy * lake.sin) / lake.rx;
		const v = (-dx * lake.sin + dy * lake.cos) / lake.ry;
		const rho = u * u + v * v;
		if (rho <= 1) {
			water = true;
			if (rho <= lake.deep * lake.deep) deep = true;
		}
	}
	let roadGap = math.huge;
	let roadHw = 0;
	for (const s of near.segs) {
		const px = x + 0.5 - s.ax;
		const py = y + 0.5 - s.ay;
		let t = s.len2 > 0 ? (px * s.dx + py * s.dy) / s.len2 : 0;
		t = t < 0 ? 0 : t > 1 ? 1 : t;
		const ex = px - t * s.dx;
		const ey = py - t * s.dy;
		const d = math.sqrt(ex * ex + ey * ey);
		if (s.river) {
			if (d <= s.hw) {
				if (s.dry) dryBed = true;
				else {
					water = true;
					if (d <= s.hw - 2.5) deep = true;
				}
			}
		} else if (d - s.hw < roadGap) {
			roadGap = d - s.hw;
			roadHw = s.hw;
		}
	}
	if (water && !sea) code = deep ? "m" : "r";
	else if (dryBed && !sea) code = "t";
	// Estradas: terra; sobre a água, o vau (raso de margem a margem, como a fase 1 faz nas pontes).
	if (roadHw > 0 && roadGap <= 3 && WATER.has(code) && !sea) code = "r";
	let inTown: Town | undefined;
	for (const town of near.towns) {
		if (x >= town.x0 && y >= town.y0 && x <= town.x1 && y <= town.y1) inTown = town;
	}
	if (roadHw > 0 && roadGap <= 0 && !WATER.has(code) && !sea) code = inTown ? "a" : "t";
	if (inTown && !sea && !WATER.has(code)) {
		const bx = math.floor(x / BLOCK_TILES);
		const by = math.floor(y / BLOCK_TILES);
		if (insideBlocks(bx, by, inTown.castle)) {
			code = ground;
		} else if (bx === inTown.plaza[0] && by === inTown.plaza[1]) {
			code = "a";
		} else if (insideBlocks(bx, by, inTown.built)) {
			if (streetBand(x, y)) code = "a";
			else if (code === "q" || code === "l") code = ground;
		}
	}
	// A clareira dos lugares do plano (o paredão e a lava não fecham a entrada).
	for (const poi of near.pois) {
		if (x >= poi.x0 - 3 && y >= poi.y0 - 3 && x < poi.x0 + poi.w + 3 && y < poi.y0 + poi.h + 3) {
			if (code === "q" || code === "l") code = ground;
		}
	}
	return code;
}

// ------------------------------------------------------------------ o bloco

const cache = new Map<number, BlockContent>();
const cacheOrder = new Array<number>();

function remember(key: number, content: BlockContent) {
	cache.set(key, content);
	cacheOrder.push(key);
	while (cacheOrder.size() > CACHE_BLOCKS) {
		const old = cacheOrder.shift()!;
		if (old !== key) cache.delete(old);
	}
}

/** O bloco (bx, by) pronto (guardado ou calculado agora). Fora do mundo, mar fundo que bloqueia. */
export function blockContent(bx: number, by: number): BlockContent {
	const key = by * 100000 + bx;
	const known = cache.get(key);
	if (known) return known;
	const content = buildContent(bx, by);
	remember(key, content);
	return content;
}

/** O código de terreno da célula (x, y) do mundo, já com as passadas de vizinhança. */
export function worldCode(x: number, y: number) {
	const bx = math.floor(x / BLOCK_TILES);
	const by = math.floor(y / BLOCK_TILES);
	const content = blockContent(bx, by);
	return content.codes[(y - by * BLOCK_TILES + 1) * CODE_SIDE + (x - bx * BLOCK_TILES + 1)];
}

/** Se a célula (x, y) do mundo bloqueia. */
export function worldCellBlocked(x: number, y: number) {
	if (x < 0 || y < 0 || x >= WORLD_CELLS || y >= WORLD_CELLS) return true;
	const bx = math.floor(x / BLOCK_TILES);
	const by = math.floor(y / BLOCK_TILES);
	return blockContent(bx, by).blocked[(y - by * BLOCK_TILES) * BLOCK_TILES + (x - bx * BLOCK_TILES)];
}

/** O código de terreno de cada célula (x0 − 1 a x0 + 64) do bloco. */
export function codeSide() {
	return CODE_SIDE;
}

function buildContent(bx: number, by: number): BlockContent {
	const started = os.clock();
	const x0 = bx * BLOCK_TILES;
	const y0 = by * BLOCK_TILES;
	const wx0 = x0 - RAW_MARGIN;
	const wy0 = y0 - RAW_MARGIN;
	const near = nearOf(wx0 - MARK_MARGIN, wy0 - MARK_MARGIN, wx0 + RAW_SIDE + MARK_MARGIN, wy0 + RAW_SIDE + MARK_MARGIN);
	const touchesPhase =
		wx0 + RAW_SIDE + 8 > PHASE1_CELL_X &&
		wy0 + RAW_SIDE + 8 > PHASE1_CELL_Y &&
		wx0 - 8 < PHASE1_CELL_X + PHASE1.width &&
		wy0 - 8 < PHASE1_CELL_Y + PHASE1.height;

	// O bioma dos 3 × 3 blocos em volta: igual em todos, a borda torcida não chega a este bloco.
	const biome0 = biomeOfBlock(bx, by);
	let uniform = true;
	for (let j = -1; j <= 1 && uniform; j++) {
		for (let i = -1; i <= 1 && uniform; i++) if (biomeOfBlock(bx + i, by + j) !== biome0) uniform = false;
	}
	const hasPatch = biome0 === 4 || biome0 === 9 || biome0 === 8;
	const outside = bx < 0 || by < 0 || bx >= WORLD_BLOCKS || by >= WORLD_BLOCKS;
	const empty =
		near.segs.size() === 0 &&
		near.lakes.size() === 0 &&
		near.towns.size() === 0 &&
		near.districts.size() === 0 &&
		near.pois.size() === 0;

	const raw = new Array<string>(RAW_SIDE * RAW_SIDE);
	const biomes = new Array<number>(RAW_SIDE * RAW_SIDE);
	const frozen = new Array<boolean>(RAW_SIDE * RAW_SIDE);
	let plain = false;
	let anyWater = false;
	let anyFrozen = false;
	if (!WORLD_OPEN) {
		// Só a fase 1: a célula de fora repete a da borda (como antes do mundo inteiro), tudo congelado.
		for (let j = 0; j < RAW_SIDE; j++) {
			for (let i = 0; i < RAW_SIDE; i++) {
				const k = j * RAW_SIDE + i;
				raw[k] = phase1Code(wx0 + i, wy0 + j);
				biomes[k] = 0;
				frozen[k] = true;
			}
		}
	} else if (outside || (uniform && !hasPatch && empty && !touchesPhase)) {
		plain = true;
		const code = outside ? "m" : SEA_BIOMES.has(biome0) ? "m" : BIOME_GROUND[biome0];
		for (let k = 0; k < RAW_SIDE * RAW_SIDE; k++) {
			raw[k] = code;
			biomes[k] = biome0;
		}
	} else {
		// O ruído de 4 em 4 células, interpolado: a borda torcida dos biomas e as manchas.
		const S = 4;
		const samples = RAW_SIDE / S + 1;
		const warpX = new Array<number>(samples * samples);
		const warpY = new Array<number>(samples * samples);
		const patches = new Array<number>(samples * samples);
		for (let j = 0; j < samples; j++) {
			for (let i = 0; i < samples; i++) {
				const k = j * samples + i;
				if (!uniform) {
					const [wx, wy] = warpAt(wx0 + i * S, wy0 + j * S);
					warpX[k] = wx;
					warpY[k] = wy;
				}
				patches[k] = uniform && !hasPatch ? 0 : patchNoise(wx0 + i * S, wy0 + j * S);
			}
		}
		const lerp2 = (grid: number[], i: number, j: number) => {
			const gi = math.floor(i / S);
			const gj = math.floor(j / S);
			const ti = (i - gi * S) / S;
			const tj = (j - gj * S) / S;
			const k = gj * samples + gi;
			const a = grid[k];
			const b = grid[k + 1];
			const c = grid[k + samples];
			const d = grid[k + samples + 1];
			const top = a + (b - a) * ti;
			return top + (c + (d - c) * ti - top) * tj;
		};
		for (let j = 0; j < RAW_SIDE; j++) {
			const y = wy0 + j;
			for (let i = 0; i < RAW_SIDE; i++) {
				const x = wx0 + i;
				const k = j * RAW_SIDE + i;
				if (touchesPhase && inPhase1(x, y)) {
					raw[k] = phase1Code(x, y);
					biomes[k] = 0;
					frozen[k] = true;
					anyFrozen = true;
				} else {
					let biome = biome0;
					if (!uniform) {
						biome = biomeOfBlock(
							math.floor((x + lerp2(warpX, i, j)) / BLOCK_TILES),
							math.floor((y + lerp2(warpY, i, j)) / BLOCK_TILES),
						);
					}
					const patch = SEA_BIOMES.has(biome) || !(biome === 4 || biome === 9 || biome === 8) ? 0 : lerp2(patches, i, j);
					raw[k] = rawCode(x, y, biome, patch, near);
					biomes[k] = biome;
				}
				if (WATER.has(raw[k])) anyWater = true;
			}
		}
	}

	const codes = anyWater || anyFrozen ? legalize(raw, frozen) : raw;
	const out = new Array<string>(CODE_SIDE * CODE_SIDE);
	for (let j = 0; j < CODE_SIDE; j++) {
		for (let i = 0; i < CODE_SIDE; i++) {
			out[j * CODE_SIDE + i] = codes[(j + RAW_MARGIN - 1) * RAW_SIDE + (i + RAW_MARGIN - 1)];
		}
	}

	// As marcas: a fase 1 (os dados dela), o que o gerador põe, e a vegetação.
	const marks = new Array<WorldMark>();
	const blockers = new Array<[number, number, number, number]>();
	const ctx: MarkContext = { x0, y0, raw, wx0, wy0, marks, blockers };
	if (touchesPhase) phaseMarks(ctx);
	if (WORLD_OPEN && !outside && !(plain && SEA_BIOMES.has(biome0))) {
		for (const town of near.towns) townMarks(ctx, town);
		for (const d of near.districts) districtMarks(ctx, d);
		for (const poi of near.pois) {
			addMark(ctx, poi.mark, poi.category, poi.x0, poi.y0, poi.w, poi.h, poi.name, poi.blocks ? "rect" : "none");
		}
		for (const [kind, x, y, w, h] of near.bridges) addMark(ctx, kind, kind === "ponte" ? "criar" : "construcao", x, y, w, h, "", "none");
		vegetation(ctx, biomes, near);
	}

	// O que bloqueia: o terreno, as marcas e, na fase 1, os retângulos dela.
	const blocked = new Array<boolean>(BLOCK_TILES * BLOCK_TILES);
	let water = false;
	const waterPoints = new Array<[number, number]>();
	for (let j = 0; j < BLOCK_TILES; j++) {
		for (let i = 0; i < BLOCK_TILES; i++) {
			const code = out[(j + 1) * CODE_SIDE + i + 1];
			blocked[j * BLOCK_TILES + i] =
				outside || TERRAIN_BLOCKS.has(code) || (!WORLD_OPEN && !inPhase1(x0 + i, y0 + j));
			if (WATER.has(code)) {
				water = true;
				if (i % 4 === 0 && j % 4 === 0) waterPoints.push([x0 + i, y0 + j]);
			}
		}
	}
	if (touchesPhase) {
		const li = x0 - PHASE1_CELL_X;
		const lj = y0 - PHASE1_CELL_Y;
		for (const [a0, b0, a1, b1] of phaseBlockersIn(math.floor(li / BLOCK_TILES), math.floor(lj / BLOCK_TILES))) {
			paint(blocked, a0 - li, b0 - lj, a1 - li, b1 - lj);
		}
		// Fora da fase 1 o resto do mundo está aberto; a borda da fase não bloqueia mais.
	}
	for (const [a0, b0, a1, b1] of blockers) paint(blocked, a0 - x0, b0 - y0, a1 - x0, b1 - y0);

	return {
		bx,
		by,
		codes: out,
		blocked,
		marks,
		water,
		waterPoints,
		plain,
		ms: (os.clock() - started) * 1000,
	};
}

function paint(blocked: boolean[], a0: number, b0: number, a1: number, b1: number) {
	for (let y = math.max(b0, 0); y <= math.min(b1, BLOCK_TILES - 1); y++) {
		for (let x = math.max(a0, 0); x <= math.min(a1, BLOCK_TILES - 1); x++) blocked[y * BLOCK_TILES + x] = true;
	}
}

/**
 * As três passadas de vizinhança (8 vizinhos) que deixam todo tile da grade dupla com junção (a folha_juncao só junta
 * mar fundo com raso, raso com areia, areia com grama, terra e caminho, terra com grama): (1) o que encosta no mar fundo
 * da fase 1 vira água; (2) terra firme encostada na água vira areia, e a água encostada em terra firme da fase 1 vira
 * areia; (3) mar fundo encostado no que não é água vira raso. As células da fase 1 nunca mudam.
 */
/** Os 8 vizinhos de uma célula da janela calculada (`RAW_SIDE` de lado). */
const AROUND = [-RAW_SIDE - 1, -RAW_SIDE, -RAW_SIDE + 1, -1, 1, RAW_SIDE - 1, RAW_SIDE, RAW_SIDE + 1];

function legalize(raw: string[], frozen: boolean[]) {
	const N = RAW_SIDE;
	const pass = (from: string[], rule: (k: number, i: number, j: number) => string | undefined) => {
		const to = table.clone(from);
		for (let j = 1; j < N - 1; j++) {
			for (let i = 1; i < N - 1; i++) {
				const k = j * N + i;
				if (frozen[k]) continue;
				const v = rule(k, i, j);
				if (v !== undefined) to[k] = v;
			}
		}
		return to;
	};
	const anyAround = (codes: string[], k: number, test: (code: string, n: number) => boolean) => {
		for (const offset of AROUND) {
			const n = k + offset;
			if (test(codes[n], n)) return true;
		}
		return false;
	};
	const a = pass(raw, (k) => {
		if (WATER.has(raw[k])) return undefined;
		return anyAround(raw, k, (code, n) => frozen[n] === true && code === "m") ? "r" : undefined;
	});
	const b = pass(a, (k) => {
		const code = a[k];
		if (!SHORE.has(code)) return anyAround(a, k, (c) => WATER.has(c)) ? "a" : undefined;
		if (WATER.has(code)) return anyAround(a, k, (c, n) => frozen[n] === true && !SHORE.has(c)) ? "a" : undefined;
		return undefined;
	});
	return pass(b, (k) => {
		if (b[k] !== "m") return undefined;
		return anyAround(b, k, (c) => !WATER.has(c)) ? "r" : undefined;
	});
}

// ------------------------------------------------------------------ as marcas

interface MarkContext {
	x0: number;
	y0: number;
	raw: string[];
	wx0: number;
	wy0: number;
	marks: WorldMark[];
	blockers: [number, number, number, number][];
}

/** O terreno (antes das passadas) de uma célula da janela calculada, ou nada fora dela. */
function rawAt(ctx: MarkContext, x: number, y: number) {
	const i = x - ctx.wx0;
	const j = y - ctx.wy0;
	if (i < 0 || j < 0 || i >= RAW_SIDE || j >= RAW_SIDE) return undefined;
	return ctx.raw[j * RAW_SIDE + i];
}

/** Se o retângulo (células do mundo) toca a janela das marcas do bloco (o bloco e `MARK_MARGIN` de folga). */
function touches(ctx: MarkContext, x: number, y: number, w: number, h: number) {
	const m = MARK_MARGIN;
	return x + math.max(w, 1) + m > ctx.x0 && y + math.max(h, 1) + m > ctx.y0 && x - m < ctx.x0 + BLOCK_TILES && y - m < ctx.y0 + BLOCK_TILES;
}

function overlapsPhase1(x: number, y: number, w: number, h: number) {
	return (
		x + math.max(w, 1) > PHASE1_CELL_X &&
		y + math.max(h, 1) > PHASE1_CELL_Y &&
		x < PHASE1_CELL_X + PHASE1.width &&
		y < PHASE1_CELL_Y + PHASE1.height
	);
}

/**
 * Põe uma marca (em células do mundo) se ela toca o bloco e não é da fase 1. `blocks`: "rect" bloqueia o retângulo,
 * "catalog" o que o catálogo diz da arte (o tronco, as paredes), "cell" a célula do pé, "none" nada.
 */
function addMark(
	ctx: MarkContext,
	kind: string,
	category: string,
	x: number,
	y: number,
	w: number,
	h: number,
	label: string,
	blocks: "rect" | "catalog" | "cell" | "none",
) {
	if (kind === "" || !touches(ctx, x, y, w, h) || overlapsPhase1(x, y, w, h)) return;
	ctx.marks.push({ kind, category, x: x - ctx.x0, y: y - ctx.y0, w, h, label });
	if (blocks === "rect") ctx.blockers.push([x, y, x + math.max(w, 1) - 1, y + math.max(h, 1) - 1]);
	else if (blocks === "cell") ctx.blockers.push([x + math.floor(math.max(w, 1) / 2), y + math.max(h, 1) - 1, x + math.floor(math.max(w, 1) / 2), y + math.max(h, 1) - 1]);
	else if (blocks === "catalog") {
		for (const r of objectBlockers(kind, x, y, w, h)) ctx.blockers.push(r);
	}
}

/**
 * Os bloqueios (células inclusivas) de um objeto do catálogo posto na marca (x, y, w, h): o pé da imagem no meio da
 * borda de baixo da marca, os retângulos do catálogo em pixels da imagem; a célula cujo meio cai dentro bloqueia (como
 * `bloqueios_objeto` de tools/mundo_mapa.py faz para a fase 1).
 */
export function objectBlockers(kind: string, x: number, y: number, w: number, h: number) {
	const out = new Array<[number, number, number, number]>();
	const object = WORLD_OBJECTS[kind];
	const rects = WORLD_OBJECT_BLOCKS[kind];
	if (!object || !rects) return out;
	const footX = (x + math.max(w, 1) / 2) * 16;
	const footY = (y + math.max(h, 1)) * 16;
	const ix = footX - object[5];
	const iy = footY - object[6];
	for (const [rx, ry, rw, rh] of rects) {
		const px = ix + rx;
		const py = iy + ry;
		let cx0 = math.ceil((px - 8) / 16);
		let cy0 = math.ceil((py - 8) / 16);
		let cx1 = math.ceil((px + rw - 8) / 16) - 1;
		let cy1 = math.ceil((py + rh - 8) / 16) - 1;
		if (cx1 < cx0 || cy1 < cy0) {
			cx0 = cx1 = math.floor((px + rw / 2) / 16);
			cy0 = cy1 = math.floor((py + rh / 2) / 16);
		}
		out.push([cx0, cy0, cx1, cy1]);
	}
	return out;
}

/** Como uma marca do gerador bloqueia, pelo tipo: o catálogo quando há arte, o retângulo das construções sem arte. */
function blockRule(kind: string, category: string): "rect" | "catalog" | "cell" | "none" {
	if (WORLD_OBJECT_BLOCKS[kind] !== undefined) return "catalog";
	if (PLANT_BLOCKS.has(kind)) return "cell";
	return category === "criar" || category === "construcao" ? "rect" : "none";
}

/**
 * Uma linha de sebe, muro ou cerca de (x, y), `length` células, horizontal ou vertical (com `thick` células de largura),
 * partida em trechos retos sem os vãos: onde a célula é caminho, rua ou água (os portões e as passagens) e onde
 * `gap` diz. Cada trecho é uma marca e um bloqueio, como `linhas_fase1` faz para a fase 1.
 */
function line(
	ctx: MarkContext,
	kind: string,
	horizontal: boolean,
	x: number,
	y: number,
	length: number,
	thick: number,
	label: string,
	gap?: (n: number) => boolean,
) {
	const w0 = horizontal ? x : y;
	// Só o pedaço da linha que toca a janela do bloco.
	const lo = math.max(0, (horizontal ? ctx.x0 : ctx.y0) - MARK_MARGIN - 1 - w0);
	const hi = math.min(length - 1, (horizontal ? ctx.x0 : ctx.y0) + BLOCK_TILES + MARK_MARGIN - w0);
	const across = horizontal ? y : x;
	const acrossStart = horizontal ? ctx.y0 : ctx.x0;
	if (hi < lo || across + thick + MARK_MARGIN <= acrossStart || across - MARK_MARGIN >= acrossStart + BLOCK_TILES) return;
	const open = (n: number) => {
		if (gap?.(n)) return true;
		const cx = horizontal ? x + n : x;
		const cy = horizontal ? y : y + n;
		if (inPhase1(cx, cy)) return true;
		const code = rawAt(ctx, cx, cy);
		return code === "t" || code === "a" || code === "r" || code === "m";
	};
	let n = lo;
	let first = label;
	while (n <= hi) {
		if (open(n)) {
			n++;
			continue;
		}
		let m = n;
		while (m <= hi && !open(m)) m++;
		if (horizontal) addMark(ctx, kind, "cerca", x + n, y, m - n, thick, first, "rect");
		else addMark(ctx, kind, "cerca", x, y + n, thick, m - n, first, "rect");
		first = "";
		n = m;
	}
}

const HOUSES = ["casa_vermelha", "casa_azul", "casa_madeira", "casa_azul_media", "casa_vermelha", "casa_azul"];
const HOUSE_SIZE: Record<string, [number, number]> = {
	casa_azul_grande: [6, 9],
	casa_vermelha_loja: [6, 5],
	casa_madeira: [6, 6],
	casa_vermelha: [6, 6],
	casa_azul: [6, 6],
	casa_azul_media: [6, 6],
};

/** As marcas de uma cidade que tocam o bloco: o muro, o castelo, a praça e as quadras construídas. */
function townMarks(ctx: MarkContext, town: Town) {
	if (town.walled) {
		const w = town.x1 - town.x0 + 3;
		const h = town.y1 - town.y0 + 3;
		line(ctx, "muro_h", true, town.x0 - 1, town.y0 - 1, w, 1, "");
		line(ctx, "muro_h", true, town.x0 - 1, town.y1 + 1, w, 1, "");
		line(ctx, "muro_v", false, town.x0 - 1, town.y0, h - 2, 1, "");
		line(ctx, "muro_v", false, town.x1 + 1, town.y0, h - 2, 1, "");
	}
	const bx = math.floor(ctx.x0 / BLOCK_TILES);
	const by = math.floor(ctx.y0 / BLOCK_TILES);
	if (bx * BLOCK_TILES < town.x0 || by * BLOCK_TILES < town.y0 || bx * BLOCK_TILES > town.x1 || by * BLOCK_TILES > town.y1) return;
	const castle = town.castle;
	if (castle) {
		const cx = castle[0] * BLOCK_TILES + 4;
		const cy = castle[1] * BLOCK_TILES + 4;
		addMark(ctx, "castelo", "criar", cx, cy, (castle[2] - castle[0] + 1) * BLOCK_TILES - 8, (castle[3] - castle[1] + 1) * BLOCK_TILES - 8, `Castelo de ${town.name}`, "rect");
		if (insideBlocks(bx, by, castle)) return;
	}
	const qx = bx * BLOCK_TILES;
	const qy = by * BLOCK_TILES;
	if (bx === town.plaza[0] && by === town.plaza[1]) {
		// A praça, como o Largo do Rio da fase 1 (as mesmas posições dentro do bloco).
		addMark(ctx, "barraca", "criar", qx + 10, qy + 12, 4, 3, `${town.name}: praça`, "rect");
		for (const dx of [16, 22, 28]) addMark(ctx, "barraca", "criar", qx + dx, qy + 12, 4, 3, "", "rect");
		addMark(ctx, "cata_vento_praca", "construcao", qx + 32, qy + 30, 2, 4, "", "catalog");
		addMark(ctx, "poco_pedra", "construcao", qx + 46, qy + 42, 2, 2, "", "catalog");
		addMark(ctx, "banco_pedra", "construcao", qx + 12, qy + 48, 3, 1, "", "catalog");
		addMark(ctx, "banco_pedra", "construcao", qx + 38, qy + 50, 3, 1, "", "catalog");
		addMark(ctx, "canteiro_potes", "construcao", qx + 44, qy + 22, 6, 3, "", "catalog");
		addMark(ctx, "canteiro_flores_rosa", "vegetacao", qx + 8, qy + 38, 5, 2, "", "none");
		addMark(ctx, "arvore_pequena_rosa", "vegetacao", qx + 10, qy + 30, 1, 1, "", "catalog");
		addMark(ctx, "arvore_pequena_rosa", "vegetacao", qx + 56, qy + 32, 1, 1, "", "catalog");
		return;
	}
	if (!insideBlocks(bx, by, town.built)) return;
	// A quadra: 3 × 3 lotes de 18 × 18 com sebe (vão de 5 embaixo), casa e horta ou árvore.
	const [px, py] = town.plaza;
	for (let i = 0; i < 3; i++) {
		for (let j = 0; j < 3; j++) {
			const lx = qx + 5 + i * 18;
			const ly = qy + 5 + j * 18;
			let skip = false;
			for (const [cx, cy] of [[lx, ly], [lx + 17, ly], [lx, ly + 17], [lx + 17, ly + 17], [lx + 8, ly + 8]]) {
				const code = rawAt(ctx, cx, cy);
				if (code === undefined || code === "r" || code === "m" || code === "a" || code === "t") skip = true;
			}
			if (skip) continue;
			let kind = HOUSES[math.floor(cellHash(lx, ly, 41) * HOUSES.size())];
			let label = "";
			if (bx === px && by === py + 1 && i === 1 && j === 1) {
				kind = "casa_azul_grande";
				label = `Pousada de ${town.name}`;
			} else if (bx === px + 1 && by === py && i === 0 && j === 0) {
				kind = "casa_vermelha_loja";
				label = "loja";
			} else if (bx === px - 1 && by === py && i === 2 && j === 2) {
				kind = "casa_vermelha_loja";
				label = "mercado";
			}
			const [hw, hh] = HOUSE_SIZE[kind];
			// A sebe do lote: os quatro lados, com o vão de 5 no meio de baixo.
			line(ctx, "sebe_h", true, lx, ly, 17, 1, "");
			line(ctx, "sebe_h", true, lx, ly + 16, 17, 1, "", (n) => n >= 6 && n < 11);
			line(ctx, "sebe_v", false, lx, ly + 1, 15, 1, "");
			line(ctx, "sebe_v", false, lx + 16, ly + 1, 15, 1, "");
			addMark(ctx, kind, "construcao", lx + 6, ly + 15 - hh, hw, hh, label, "catalog");
			if (cellHash(lx, ly, 43) < 1 / 3) addMark(ctx, "canteiro_flores_rosa", "vegetacao", lx + 2, ly + 13, 5, 2, "", "none");
			else addMark(ctx, "arvore_pequena", "vegetacao", lx + 3, ly + 6, 1, 1, "", "catalog");
		}
	}
}

/** As marcas de um distrito que tocam o bloco: as sebes, a fazenda de cada lote e o centro do distrito. */
function districtMarks(ctx: MarkContext, d: District) {
	const W = d.x1 - d.x0 + 1;
	const H = d.y1 - d.y0 + 1;
	// A sebe em volta do distrito (as avenidas abrem os vãos) e entre os pares de colunas.
	line(ctx, "sebe_h", true, d.x0, d.y0, W, 1, d.code === "D03" ? "" : d.name);
	line(ctx, "sebe_h", true, d.x0, d.y1, W, 1, "");
	line(ctx, "sebe_v", false, d.x0, d.y0 + 1, H - 2, 1, "");
	line(ctx, "sebe_v", false, d.x1, d.y0 + 1, H - 2, 1, "");
	for (let p = 1; p < d.cols / 2; p++) line(ctx, "sebe_v", false, d.x0 + p * 512 - 1, d.y0 + 1, H - 2, 1, "");
	for (const plot of PLOTS) {
		if (plot.district !== d.code) continue;
		const [fx, fy] = plot.farm;
		if (!touches(ctx, fx - 8, fy - 8, 80, 80) || overlapsPhase1(plot.area[0], plot.area[1], 256, 256)) continue;
		// A cerca de 64 × 64 com a porteira de 2 células do lado da trilha (como `vaos_porteira` da fase 1).
		const gateX = plot.side === 0 ? 62 : 0;
		const porteira = (n: number) => n === 28 || n === 29;
		line(ctx, "cerca_h", true, fx, fy, 64, 1, `Lote ${plot.name}`);
		line(ctx, "cerca_h", true, fx, fy + 63, 64, 1, "");
		line(ctx, "cerca_v", false, fx, fy, 64, 2, "", gateX === 0 ? porteira : undefined);
		line(ctx, "cerca_v", false, fx + 62, fy, 64, 2, "", gateX === 62 ? porteira : undefined);
		addMark(ctx, "casa_fazenda", "criar", fx + 6, fy + 8, 7, 6, "", "rect");
		addMark(ctx, "celeiro", "criar", fx + 44, fy + 6, 8, 8, "", "rect");
		addMark(ctx, "galinheiro", "criar", fx + 26, fy + 12, 6, 4, "", "rect");
		// O espantalho bloqueia (2026-10-23): fica num canteiro de terra, e assim `plotOpen` o tira.
		addMark(ctx, "espantalho", "criar", fx + 30, fy + 42, 2, 3, "", "rect");
		addMark(ctx, "placa", "construcao", plot.side === 0 ? fx + 64 : fx - 2, fy + 25, 1, 1, "", "catalog");
	}
	if (d.code === "D03") return;
	// O centro do distrito (as posições do da fase 1, desde o canto do terreiro).
	const [cx, cy] = d.center;
	addMark(ctx, "caixa_venda", "criar", cx + 3, cy + 2, 3, 2, "caixa de venda", "rect");
	addMark(ctx, "quadro_pedidos", "criar", cx + 10, cy + 1, 4, 3, "pedidos", "rect");
	addMark(ctx, "galpao_madeira", "construcao", cx + 28, cy + 1, 4, 4, "galpão", "catalog");
	addMark(ctx, "poco_madeira", "construcao", cx + 4, cy + 16, 2, 2, "", "catalog");
	addMark(ctx, "bebedouro", "construcao", cx + 30, cy + 19, 2, 1, "", "catalog");
	addMark(ctx, "espantalho", "criar", cx + 23, cy + 9, 2, 3, "", "rect");
	addMark(ctx, "carroca", "criar", cx + 9, cy + 12, 4, 3, "carroça", "rect");
	addMark(ctx, "placa", "construcao", cx + 24, cy + 28, 1, 1, `Centro do distrito ${d.code}`, "catalog");
	addMark(ctx, "banco_madeira", "construcao", cx + 16, cy + 22, 2, 1, "", "catalog");
	addMark(ctx, "arvore_grande", "vegetacao", cx + 42, cy + 4, 1, 1, "", "catalog");
	addMark(ctx, "arvore_grande", "vegetacao", cx + 42, cy + 26, 1, 1, "", "catalog");
}

/** As marcas da fase 1 que tocam o bloco (os dados de `fase1.ts`, como antes) e as áreas fechadas dela. */
function phaseMarks(ctx: MarkContext) {
	const li = ctx.x0 - PHASE1_CELL_X;
	const lj = ctx.y0 - PHASE1_CELL_Y;
	const size = BLOCK_TILES;
	const m = MARK_MARGIN;
	for (const [kind, mx, my, w, h, label] of PHASE1_MARKS) {
		const x = mx - li;
		const y = my - lj;
		if (x + math.max(w, 1) + m <= 0 || y + math.max(h, 1) + m <= 0 || x - m >= size || y - m >= size) continue;
		const [name, category] = PHASE1_MARK_KINDS[kind];
		ctx.marks.push({ kind: name, category, x, y, w, h, label });
	}
	for (const [a0, b0, a1, b1, why] of PHASE1_CLOSED) {
		const x = a0 - li;
		const y = b0 - lj;
		const w = a1 - a0 + 1;
		const h = b1 - b0 + 1;
		if (x + w <= 0 || y + h <= 0 || x >= size || y >= size) continue;
		ctx.marks.push({ kind: "fechado", category: "fechado", x, y, w, h, label: why });
	}
}

/**
 * A vegetação espalhada: um candidato por quadrado de 8 × 8 células do mundo (o mesmo em qualquer bloco que o
 * calcule), pela chance do bioma (mais dentro dos lotes), só no chão do bioma, longe da água, das estradas, das
 * cidades, das fazendas e dos lugares.
 */
function vegetation(ctx: MarkContext, biomes: number[], near: Near) {
	const from = ctx.x0 - MARK_MARGIN;
	const fromY = ctx.y0 - MARK_MARGIN;
	for (let gy = math.floor(fromY / 8); gy <= math.floor((ctx.y0 + BLOCK_TILES + MARK_MARGIN - 1) / 8); gy++) {
		for (let gx = math.floor(from / 8); gx <= math.floor((ctx.x0 + BLOCK_TILES + MARK_MARGIN - 1) / 8); gx++) {
			const roll = cellHash(gx, gy, 31);
			const x = gx * 8 + math.floor(cellHash(gx, gy, 32) * 8);
			const y = gy * 8 + math.floor(cellHash(gx, gy, 33) * 8);
			if (!touches(ctx, x, y, 1, 1)) continue;
			const i = x - ctx.wx0;
			const j = y - ctx.wy0;
			if (i < 1 || j < 1 || i >= RAW_SIDE - 1 || j >= RAW_SIDE - 1) continue;
			const biome = biomes[j * RAW_SIDE + i];
			const palette = VEGETATION[biome];
			if (!palette || inPhase1(x, y)) continue;
			const code = ctx.raw[j * RAW_SIDE + i];
			if (code !== BIOME_GROUND[biome]) continue;
			let ok = true;
			for (let dj = -1; dj <= 1 && ok; dj++) {
				for (let di = -1; di <= 1 && ok; di++) {
					const c = ctx.raw[(j + dj) * RAW_SIDE + i + di];
					if (c !== code) ok = false;
				}
			}
			if (!ok) continue;
			let density = palette.density;
			for (const town of near.towns) {
				if (x >= town.x0 - 2 && y >= town.y0 - 2 && x <= town.x1 + 2 && y <= town.y1 + 2) {
					const bx = math.floor(x / BLOCK_TILES);
					const by = math.floor(y / BLOCK_TILES);
					if (town.walled || insideBlocks(bx, by, town.built) || (bx === town.plaza[0] && by === town.plaza[1])) ok = false;
				}
			}
			for (const d of near.districts) {
				const [cx0, cy0, cx1, cy1] = d.center;
				if (x >= cx0 - 4 && y >= cy0 - 6 && x <= cx1 + 4 && y <= cy1 + 4) ok = false;
				if (x >= d.x0 && y >= d.y0 && x <= d.x1 && y <= d.y1) {
					density = LOT_DENSITY;
					const c = math.floor((x - d.x0) / 256);
					const r = math.floor((y - d.y0) / 256);
					const fx = d.x0 + c * 256 + 96;
					const fy = d.y0 + r * 256 + 96;
					if (x >= fx - 6 && y >= fy - 6 && x <= fx + 70 && y <= fy + 70) ok = false;
					if (x <= d.x0 + 1 || y <= d.y0 + 1 || x >= d.x1 - 1 || y >= d.y1 - 1) ok = false;
				}
			}
			for (const poi of near.pois) {
				if (x >= poi.x0 - 3 && y >= poi.y0 - 3 && x < poi.x0 + poi.w + 3 && y < poi.y0 + poi.h + 3) ok = false;
			}
			if (!ok || roll >= density) continue;
			let total = 0;
			for (const [, weight] of palette.kinds) total += weight;
			let pick = cellHash(gx, gy, 34) * total;
			let kind = palette.kinds[0][0];
			for (const [name, weight] of palette.kinds) {
				pick -= weight;
				if (pick < 0) {
					kind = name;
					break;
				}
			}
			addMark(ctx, kind, "vegetacao", x, y, 1, 1, "", blockRule(kind, "vegetacao"));
		}
	}
}

// ------------------------------------------------------------------ zonas e nomes

/** O nome de cada bioma para a plaquinha. */
export function biomeName(biome: number) {
	return WORLD_BIOMES[biome] ?? "";
}

/** O nome do reino (ou da cidade livre) para a plaquinha. */
export function realmName(realm: number) {
	return WORLD_REALMS[realm]?.[0] ?? "";
}

/** O que há na célula, para as zonas: o lote, o distrito (o centro), a cidade, o lugar, o bioma e o reino. */
export function placeAt(x: number, y: number) {
	let plot: WorldPlot | undefined;
	let center: District | undefined;
	let town: Town | undefined;
	let poi: Poi | undefined;
	for (const f of featuresIn(x - 40, y - 40, x + 40, y + 40)) {
		if (f.t === "district") {
			const d = f.v;
			const [cx0, cy0, cx1, cy1] = d.center;
			if (x >= cx0 - 4 && y >= cy0 - 4 && x <= cx1 + 4 && y <= cy1 + 4) center = d;
			if (x >= d.x0 && y >= d.y0 && x <= d.x1 && y <= d.y1) {
				for (const p of PLOTS) {
					if (p.district === d.code && x >= p.area[0] && y >= p.area[1] && x <= p.area[2] && y <= p.area[3]) plot = p;
				}
			}
		} else if (f.t === "town") {
			const t = f.v;
			if (x >= t.x0 && y >= t.y0 && x <= t.x1 && y <= t.y1) town = t;
		}
	}
	for (const p of POIS) {
		if (x >= p.x0 - 40 && y >= p.y0 - 40 && x < p.x0 + math.max(p.w, 1) + 40 && y < p.y0 + math.max(p.h, 1) + 40) poi = p;
	}
	return { plot, center, town, poi, biome: biomeAt(x, y), realm: realmAt(x, y) };
}
