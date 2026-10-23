// O mapa do mundo (fase 0 do `docs/mundo/MAPA_MUNDO.md`, 2026-10-23): um mapa só, em blocos de 64 × 64 tiles, longe
// da fila de mapas dos interiores. Vale para o cliente (que monta os blocos perto da câmera, `client/world/worldMap.ts`)
// e para o servidor (que leva o personagem ao mundo, `MapService`). Os dados vêm do plano por
// `tools/mundo_mapa.py jogo` (`plano.ts`, `terreno.ts`, `fase1.ts`); o chão de cada bloco sai de `generate.ts`.
//
// Coordenadas: a célula (x, y) do mundo é o tile de 16 px contado do canto noroeste do mundo (0 a 53.247); o bloco
// (bx, by) cobre as células bx × 64 a bx × 64 + 63. Hoje só a fase 1 está aberta (12 × 9 blocos, `PHASE1`); fora
// dela tudo bloqueia.

import { Workspace } from "@rbxts/services";
import { groundOffset, snapToArtPx, worldToArtPx } from "shared/view";
import { InteriorZone } from "shared/interiors/types";
import { PHASE1, PHASE1_BLOCKERS, PHASE1_CLOSED, PHASE1_LOTS, PHASE1_ROWS, PHASE1_ZONES } from "./fase1";

/** O id do mundo no atributo `Mapa` do jogador; não é um mapa do Diorama (`INTERIORS` não o tem). */
export const WORLD_MAP_ID = "mundo";
/**
 * Atributo do Workspace, só para testes: leva direto ao mundo, sem menu nem personalização (como `InteriorTeste`).
 * "bx,by" é o bloco do mundo (471 a 482, 762 a 770 na fase 1) e o personagem começa na célula livre mais perto do meio
 * dele; `true` (ou outro texto) começa no portão do lote que o servidor deu ao jogador (`MundoLote`; sem lote, o do
 * lote A). O começo normal do jogo (`START_INTERIOR`) não muda.
 */
export const WORLD_TEST_ATTRIBUTE = "MundoTeste";
/**
 * Atributo do jogador com o lote (a vaga de fazenda, como o lugar da casa) que o servidor deu a ele no mundo: "A" a
 * "D" na fase 1, ou "" quando os lotes acabaram. O lote fica com o jogador enquanto ele está no servidor.
 */
export const WORLD_LOT_ATTRIBUTE = "MundoLote";
/** Atributo do Workspace: `false` esconde os lugares marcados (o que ainda não tem arte com id). */
export const WORLD_MARKS_ATTRIBUTE = "MundoMarcas";

/** Lado do bloco, em tiles. */
export const BLOCK_TILES = 64;
/** Lado do tile, em pixels de arte (o `INTERIOR_TILE` dos interiores). */
export const WORLD_TILE = 16;
/** Lado do bloco, em pixels de arte. */
export const BLOCK_PX = BLOCK_TILES * WORLD_TILE;
/**
 * Lado do pedaço, em tiles: o cliente monta o bloco em 4 pedaços de 32 × 32 (512 × 512 px), só os que tocam a vista,
 * e o gerador junta os recortes sem passar da borda de um pedaço. No zoom mais longe, a vista com a folga toca uns 20
 * pedaços (5 blocos) e não 9 blocos inteiros: medido na fase 1 em 2026-10-23, o pior 3 × 3 de blocos tem 4.027
 * imagens, acima das 2.500 do orçamento.
 */
export const PIECE_TILES = 32;

/**
 * O canto noroeste do mundo, no chão: longe da fila dos interiores (Z = 0), como pede o plano. O mundo tem 832 blocos
 * de 32 studs de largura (26.624) e uns 34 de fundo (28.340): vai de X −13.312 a 13.312 e de Z −30.000 a uns −1.660,
 * e o piso dos interiores (`WorldService`) fica em Z de −1.024 a 1.024. No pixel de arte.
 */
export const WORLD_ORIGIN = snapToArtPx(new Vector3(-13312, 0, -30000));

/** O canto de cima à esquerda da célula (x, y) do mundo, no chão. */
export function worldCellCorner(x: number, y: number) {
	return WORLD_ORIGIN.add(groundOffset(x * WORLD_TILE, y * WORLD_TILE));
}

/** O centro da célula (x, y) do mundo, no chão. */
export function worldCellPoint(x: number, y: number) {
	return worldCellCorner(x, y).add(groundOffset(WORLD_TILE / 2, WORLD_TILE / 2));
}

/** A célula do mundo sob um ponto do chão. */
export function worldCellOf(position: Vector3): [number, number] {
	const px = worldToArtPx(position).sub(worldToArtPx(WORLD_ORIGIN));
	return [math.floor(px.X / WORLD_TILE), math.floor(px.Y / WORLD_TILE)];
}

// ------------------------------------------------------------------ a fase 1 (os dados de `fase1.ts`)

/** A primeira célula da fase 1 no mundo. */
export const PHASE1_CELL_X = PHASE1.blockX * BLOCK_TILES;
export const PHASE1_CELL_Y = PHASE1.blockY * BLOCK_TILES;

/** Se o bloco (bx, by) do mundo está aberto (hoje, só os da fase 1). */
export function blockOpen(bx: number, by: number) {
	return (
		bx >= PHASE1.blockX &&
		by >= PHASE1.blockY &&
		bx < PHASE1.blockX + PHASE1.blocksWide &&
		by < PHASE1.blockY + PHASE1.blocksHigh
	);
}

/** Se a célula (x, y) do mundo está na fase 1. */
export function cellOpen(x: number, y: number) {
	const i = x - PHASE1_CELL_X;
	const j = y - PHASE1_CELL_Y;
	return i >= 0 && j >= 0 && i < PHASE1.width && j < PHASE1.height;
}

/** Uma linha de `PHASE1_ROWS` aberta: onde começa cada corrida e o código dela. */
interface Row {
	starts: number[];
	codes: string[];
}
const rows = new Map<number, Row>();

function rowOf(j: number): Row {
	let row = rows.get(j);
	if (row) return row;
	row = { starts: [], codes: [] };
	let at = 0;
	for (const [code, count] of PHASE1_ROWS[j].gmatch("(%a)(%d+)")) {
		row.starts.push(at);
		row.codes.push(code as string);
		at += tonumber(count) ?? 0;
	}
	rows.set(j, row);
	return row;
}

/**
 * O código do terreno da célula (x, y) do mundo, como em `fase1.ts` ("G" é grama com capim). Fora da fase, o da
 * célula da borda mais perto: o tile da grade dupla na borda continua o terreno, e a borda bloqueia.
 */
export function terrainAt(x: number, y: number) {
	const i = math.clamp(x - PHASE1_CELL_X, 0, PHASE1.width - 1);
	const j = math.clamp(y - PHASE1_CELL_Y, 0, PHASE1.height - 1);
	const row = rowOf(j);
	// Busca binária pela corrida que contém i.
	let lo = 0;
	let hi = row.starts.size() - 1;
	while (lo < hi) {
		const mid = math.ceil((lo + hi) / 2);
		if (row.starts[mid] <= i) lo = mid;
		else hi = mid - 1;
	}
	return row.codes[lo];
}

type Rect = [number, number, number, number, ...unknown[]];

/**
 * Os retângulos que bloqueiam, em baldes de 64 × 64 células da fase (um por bloco): com o catálogo dos objetos são uns
 * 600 (cada tronco de árvore), e procurar em todos a cada célula deixava compor um bloco 20 vezes mais lento.
 */
const buckets = new Map<number, Rect[]>();
function bucketKey(bi: number, bj: number) {
	return bj * 1000 + bi;
}
for (const list of [PHASE1_BLOCKERS, PHASE1_CLOSED] as ReadonlyArray<ReadonlyArray<Rect>>) {
	for (const rect of list) {
		const [x0, y0, x1, y1] = rect;
		for (let bj = math.floor(y0 / BLOCK_TILES); bj <= math.floor(y1 / BLOCK_TILES); bj++) {
			for (let bi = math.floor(x0 / BLOCK_TILES); bi <= math.floor(x1 / BLOCK_TILES); bi++) {
				const k = bucketKey(bi, bj);
				const bucket = buckets.get(k) ?? [];
				bucket.push(rect);
				buckets.set(k, bucket);
			}
		}
	}
}

/** Os retângulos que bloqueiam e tocam o bloco (bi, bj) da fase (células desde o canto da fase). */
export function phaseBlockersIn(bi: number, bj: number): ReadonlyArray<Rect> {
	return buckets.get(bucketKey(bi, bj)) ?? [];
}

function insideAny(i: number, j: number) {
	for (const [x0, y0, x1, y1] of phaseBlockersIn(math.floor(i / BLOCK_TILES), math.floor(j / BLOCK_TILES))) {
		if (i >= x0 && j >= y0 && i <= x1 && j <= y1) return true;
	}
	return false;
}

/**
 * Se a célula (x, y) do mundo bloqueia: fora da fase aberta, a água funda, as construções marcadas e as áreas
 * fechadas (o resto da Ribeira, em obras).
 */
export function worldBlocked(x: number, y: number) {
	if (!cellOpen(x, y)) return true;
	if (terrainAt(x, y) === "m") return true;
	const i = x - PHASE1_CELL_X;
	const j = y - PHASE1_CELL_Y;
	return insideAny(i, j);
}

/** O tipo da célula para o boneco, como `TileKind` dos interiores: 6 na água rasa, 11 na funda, 0 em terra. */
export function worldKind(x: number, y: number) {
	const code = terrainAt(x, y);
	return code === "r" ? 6 : code === "m" ? 11 : 0;
}

const zones: InteriorZone[] = PHASE1_ZONES.map(([name, [x0, y0, x1, y1]]) => ({
	name,
	areas: [[x0 + PHASE1_CELL_X, y0 + PHASE1_CELL_Y, x1 + PHASE1_CELL_X, y1 + PHASE1_CELL_Y]],
	props: { ambiente: "exterior" },
}));

/** A zona com nome da célula (x, y) do mundo (a plaquinha do `MapController`), ou nada. */
export function worldZoneAt(x: number, y: number): InteriorZone | undefined {
	for (const zone of zones) {
		const [x0, y0, x1, y1] = zone.areas[0];
		if (x >= x0 && y >= y0 && x <= x1 && y <= y1) return zone;
	}
	return undefined;
}

/** A célula livre mais perto de (x, y), num raio de `radius` células (em anéis), ou nada. */
export function nearestFree(x: number, y: number, radius = 48): [number, number] | undefined {
	for (let r = 0; r <= radius; r++) {
		for (let dy = -r; dy <= r; dy++) {
			for (let dx = -r; dx <= r; dx++) {
				if (math.max(math.abs(dx), math.abs(dy)) !== r) continue;
				if (!worldBlocked(x + dx, y + dy) && worldKind(x + dx, y + dy) === 0) return [x + dx, y + dy];
			}
		}
	}
	return undefined;
}

/** Onde o jogador começa no mundo: o portão do lote A (`PHASE1.spawn`). */
export function worldSpawn(): [number, number] {
	return [PHASE1_CELL_X + PHASE1.spawn[0], PHASE1_CELL_Y + PHASE1.spawn[1]];
}

/** Os lotes da fase 1 (as vagas de fazenda), na ordem em que o servidor os dá. */
export const WORLD_LOTS: ReadonlyArray<string> = PHASE1_LOTS.map((lot) => lot.name);

/** O portão do lote (a célula do mundo onde o dono chega), ou nada se o lote não existe. */
export function lotGate(name: string): [number, number] | undefined {
	const lot = PHASE1_LOTS.find((candidate) => candidate.name === name);
	return lot ? [PHASE1_CELL_X + lot.gate[0], PHASE1_CELL_Y + lot.gate[1]] : undefined;
}

/** O teste do mundo: a célula de começo e se ela veio de um bloco pedido ("bx,by") ou é o começo padrão. */
export interface WorldTest {
	cell: [number, number];
	block: boolean;
}

let cachedTest: WorldTest | false | undefined;

/**
 * O teste do mundo pedido por `MundoTeste`, ou nada no jogo normal. Lido uma vez. O servidor e o cliente chegam à
 * mesma célula. Sem bloco pedido, o servidor leva cada jogador ao portão do lote dele.
 */
export function worldTest(): WorldTest | undefined {
	if (cachedTest === undefined) cachedTest = readTest() ?? false;
	return cachedTest === false ? undefined : cachedTest;
}

function readTest(): WorldTest | undefined {
	const value = Workspace.GetAttribute(WORLD_TEST_ATTRIBUTE);
	if (value === undefined || value === false || value === "") return undefined;
	if (typeIs(value, "string")) {
		const [a, b] = value.match("^%s*(%d+)%s*,%s*(%d+)%s*$");
		const bx = tonumber(a);
		const by = tonumber(b);
		if (bx !== undefined && by !== undefined) {
			if (!blockOpen(bx, by)) {
				warn(
					`[Mundo] ${WORLD_TEST_ATTRIBUTE}: o bloco ${bx},${by} não está aberto (a fase 1 vai de ` +
						`${PHASE1.blockX},${PHASE1.blockY} a ${PHASE1.blockX + PHASE1.blocksWide - 1},` +
						`${PHASE1.blockY + PHASE1.blocksHigh - 1}); começando no lote A`,
				);
				return { cell: worldSpawn(), block: false };
			}
			const center = nearestFree(bx * BLOCK_TILES + BLOCK_TILES / 2, by * BLOCK_TILES + BLOCK_TILES / 2);
			if (center) return { cell: center, block: true };
			warn(`[Mundo] ${WORLD_TEST_ATTRIBUTE}: nenhuma célula livre no bloco ${bx},${by}; começando no lote A`);
		}
	}
	return { cell: worldSpawn(), block: false };
}
