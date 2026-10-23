// O mapa do mundo (fase 0 do `docs/mundo/MAPA_MUNDO.md`, 2026-10-23; o mundo inteiro desde a §12): um mapa só, em
// blocos de 64 × 64 tiles, longe da fila de mapas dos interiores. Vale para o cliente (que monta os blocos perto da
// câmera, `client/world/worldMap.ts`) e para o servidor (que leva o personagem ao mundo, `MapService`). O chão de cada
// célula sai de `blocks.ts` (o plano compacto de `mapa.ts` e `plano.ts`; a fase 1 vem de `fase1.ts`); as imagens de
// cada bloco, de `generate.ts`.
//
// Coordenadas: a célula (x, y) do mundo é o tile de 16 px contado do canto noroeste do mundo (0 a 53.247); o bloco
// (bx, by) cobre as células bx × 64 a bx × 64 + 63. O mundo inteiro está aberto (fases 2 a 9 em §12); o que bloqueia é a
// água funda, o paredão, a lava, as construções e as cercas.

import { Workspace } from "@rbxts/services";
import { groundOffset, snapToArtPx, worldToArtPx } from "shared/view";
import { InteriorZone } from "shared/interiors/types";
import { PHASE1, PHASE1_ZONES } from "./fase1";
import {
	BLOCK_TILES,
	biomeName,
	DISTRICTS,
	inPhase1,
	PHASE1_CELL_X,
	PHASE1_CELL_Y,
	placeAt,
	phase1Code,
	PLOTS,
	POIS,
	realmName,
	TOWNS,
	WORLD_CELLS,
	WORLD_OPEN,
	worldCellBlocked,
	worldCode,
	WorldPlot,
} from "./blocks";

export { BLOCK_TILES, PHASE1_CELL_X, PHASE1_CELL_Y, WORLD_CELLS, WORLD_OPEN } from "./blocks";
export type { WorldPlot } from "./blocks";
export { phaseBlockersIn } from "./blocks";

/** O id do mundo no atributo `Mapa` do jogador; não é um mapa do Diorama (`INTERIORS` não o tem). */
export const WORLD_MAP_ID = "mundo";
/**
 * Atributo do Workspace, só para testes: leva direto ao mundo, sem menu nem personalização (como `InteriorTeste`).
 * "bx,by" é um bloco qualquer do mundo (0 a 831) e o personagem começa na célula livre mais perto do meio dele; o nome
 * de um lugar (como `MundoIr`) começa nele; `true` (ou outro texto) começa no portão do lote que o servidor deu ao
 * jogador (`MundoLote`; sem lote, o do lote A). O começo normal do jogo (`START_INTERIOR`) não muda.
 */
export const WORLD_TEST_ATTRIBUTE = "MundoTeste";
/**
 * Atributo do Workspace, só no Studio (2026-10-23): o nome de um lugar do plano (cidade, vila, distrito, "Lote D02-A",
 * pousada, covil...) ou "bx,by"; ao mudar, o servidor leva quem está no mundo até lá (`MapService`). Acentos e
 * maiúsculas não importam; um começo de nome basta.
 */
export const WORLD_GO_ATTRIBUTE = "MundoIr";
/**
 * Atributo do jogador com o lote (a vaga de fazenda, como o lugar da casa) que o servidor deu a ele no mundo: "A" a
 * "L" no D03 (A a D são os da fase 1), "D02-A" e assim por diante nos outros distritos, ou "" quando os 200 lotes
 * acabaram. O lote fica com o jogador enquanto ele está no servidor.
 */
export const WORLD_LOT_ATTRIBUTE = "MundoLote";
/** Atributo do Workspace: `false` esconde os lugares marcados (o que ainda não tem arte com id). */
export const WORLD_MARKS_ATTRIBUTE = "MundoMarcas";

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

/** Se o bloco (bx, by) está aberto: o mundo inteiro com `WORLD_OPEN`; senão, só os da fase 1 (12 × 9 blocos). */
export function blockOpen(bx: number, by: number) {
	if (!WORLD_OPEN) {
		return (
			bx >= PHASE1.blockX &&
			by >= PHASE1.blockY &&
			bx < PHASE1.blockX + PHASE1.blocksWide &&
			by < PHASE1.blockY + PHASE1.blocksHigh
		);
	}
	return bx >= 0 && by >= 0 && bx < WORLD_CELLS / BLOCK_TILES && by < WORLD_CELLS / BLOCK_TILES;
}

/** Se a célula (x, y) está aberta: dentro do mundo com `WORLD_OPEN`; senão, na fase 1. */
export function cellOpen(x: number, y: number) {
	if (!WORLD_OPEN) return inPhase1(x, y);
	return x >= 0 && y >= 0 && x < WORLD_CELLS && y < WORLD_CELLS;
}

/**
 * O código do terreno da célula (x, y) do mundo: os de `terreno.ts` (m mar fundo, r raso, a areia, t terra, g grama, os
 * lisos dos biomas sem arte) e "G" (grama com capim, só na fase 1). Fora do mundo, mar fundo.
 */
export function terrainAt(x: number, y: number) {
	// Só a fase 1: fora dela, o da borda mais perto (o tile da grade dupla na borda continua o terreno).
	if (!WORLD_OPEN) return phase1Code(x, y);
	if (!cellOpen(x, y)) return "m";
	return worldCode(x, y);
}

/**
 * Se a célula (x, y) do mundo bloqueia: fora do mundo, a água funda, o paredão e a lava, as construções e as cercas
 * (marcadas ou com arte) e, na fase 1, as áreas fechadas (o resto da Ribeira, em obras).
 */
export function worldBlocked(x: number, y: number) {
	return worldCellBlocked(x, y);
}

/** O tipo da célula para o boneco, como `TileKind` dos interiores: 6 na água rasa, 11 na funda, 0 em terra. */
export function worldKind(x: number, y: number) {
	const code = terrainAt(x, y);
	return code === "r" ? 6 : code === "m" ? 11 : 0;
}

// ------------------------------------------------------------------ zonas

// As propriedades de som de cada zona (`ambiente`, `musica`): as da fase 1 vêm do gerador (`ZONAS_F1` em
// tools/mundo_mapa.py), como as zonas do Diorama; as do resto do mundo, daqui: o campo na roça (campos, floresta,
// taiga, savana, selva e os lotes), o mar na costa, nas ilhas e no mar, o de fora nos outros biomas, e a vila (com a
// música) nas cidades, vilas e centros de distrito. Só perfis e músicas que já existem em `shared/sounds.ts`.
const CAMPO = { ambiente: "campo" };
const MAR = { ambiente: "mar" };
const FORA = { ambiente: "exterior" };
const VILA = { ambiente: "exterior", musica: "vila" };
const BIOME_SOUND: Record<number, Record<string, string>> = {
	0: CAMPO,
	1: CAMPO,
	2: CAMPO,
	3: FORA,
	4: FORA,
	5: FORA,
	6: CAMPO,
	7: CAMPO,
	8: FORA,
	9: FORA,
	10: MAR,
	11: MAR,
	12: FORA,
	13: MAR,
	14: MAR,
};

const phaseZones: InteriorZone[] = PHASE1_ZONES.map(([name, [x0, y0, x1, y1], props]) => ({
	name,
	areas: [[x0 + PHASE1_CELL_X, y0 + PHASE1_CELL_Y, x1 + PHASE1_CELL_X, y1 + PHASE1_CELL_Y]],
	props,
}));

/** As zonas do resto do mundo, uma por nome (a mesma tabela volta igual: o `MapController` compara pela identidade). */
const zoneCache = new Map<string, InteriorZone>();
function zoneNamed(name: string, props: Record<string, string>): InteriorZone {
	let zone = zoneCache.get(name);
	if (!zone) {
		zone = { name, areas: [], props };
		zoneCache.set(name, zone);
	}
	return zone;
}

/** O mar de fora: o nome pelo lado do mundo (como o plano escreve: Frozen Sea, Sunset Sea, South Sea, Anil Sea). */
function seaName(x: number, y: number) {
	const u = x / WORLD_CELLS - 0.5;
	const v = y / WORLD_CELLS - 0.5;
	if (math.abs(v) >= math.abs(u)) return v < 0 ? "Frozen Sea" : "South Sea";
	return u < 0 ? "Sunset Sea" : "Anil Sea";
}

/**
 * A zona com nome da célula (x, y) do mundo (a plaquinha do `MapController`), ou nada fora do mundo. Na fase 1, as
 * dela; fora, o lote, o centro do distrito, a cidade, o lugar do plano (até 40 células em volta) e, no resto, o reino
 * com o bioma ("Invernia · neve") ou o mar.
 */
export function worldZoneAt(x: number, y: number): InteriorZone | undefined {
	if (!cellOpen(x, y)) return undefined;
	if (inPhase1(x, y)) {
		for (const zone of phaseZones) {
			const [x0, y0, x1, y1] = zone.areas[0];
			if (x >= x0 && y >= y0 && x <= x1 && y <= y1) return zone;
		}
		return undefined;
	}
	const at = placeAt(x, y);
	if (at.plot) return zoneNamed(`Lote ${at.plot.name}`, CAMPO);
	if (at.center) return zoneNamed(`Centro do distrito ${at.center.code}`, VILA);
	if (at.town) return zoneNamed(at.town.name, VILA);
	const sound = BIOME_SOUND[at.biome] ?? FORA;
	if (at.poi) return zoneNamed(at.poi.name, sound);
	if (at.biome === 14) return zoneNamed("Serene Sea", MAR);
	if (at.biome === 13) return zoneNamed(seaName(x, y), MAR);
	return zoneNamed(`${realmName(at.realm)} · ${biomeName(at.biome)}`, sound);
}

/** De quantas em quantas células se pega um ponto da água (`worldWaterSample`): 2 células são 1 stud. */
const WATER_SAMPLE_STEP = 2;

let waterSample: [number, number][] | undefined;

/**
 * As células de água (rasa ou funda) da fase 1, uma a cada `WATER_SAMPLE_STEP` em cada eixo, em células do mundo: o som
 * do rio vai à mais perto do jogador (`SoundController`), como o mar dos interiores. Lido uma vez. Com o mundo inteiro
 * (`WORLD_OPEN`), o certo é pegar os pontos dos blocos montados (`BlockContent.waterPoints`): ainda não ligado.
 */
export function worldWaterSample(): ReadonlyArray<[number, number]> {
	if (waterSample) return waterSample;
	const found = new Array<[number, number]>();
	for (let j = 0; j < PHASE1.height; j += WATER_SAMPLE_STEP) {
		let previous = "";
		for (let i = 0; i < PHASE1.width; i++) {
			const code = phase1Code(PHASE1_CELL_X + i, PHASE1_CELL_Y + j);
			const isWater = code === "r" || code === "m";
			// Cada corrida dá ao menos um ponto (a água estreita, no vau, também soa).
			if (isWater && (i % WATER_SAMPLE_STEP === 0 || (previous !== "r" && previous !== "m"))) {
				found.push([PHASE1_CELL_X + i, PHASE1_CELL_Y + j]);
			}
			previous = code;
		}
	}
	waterSample = found;
	return found;
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

// ------------------------------------------------------------------ lotes

/**
 * Os 200 lotes do mundo (as vagas de fazenda), na ordem em que o servidor os dá: o D03 primeiro (A a D são os da fase
 * 1, E a L os que continuam o distrito ao leste e ao sul), depois os distritos do mais perto ao mais longe do D03.
 */
export const WORLD_LOTS: ReadonlyArray<string> = PLOTS.filter((plot) => WORLD_OPEN || inPhase1(plot.gate[0], plot.gate[1])).map(
	(plot) => plot.name,
);

const plotsByName = new Map<string, WorldPlot>();
for (const plot of PLOTS) plotsByName.set(plot.name, plot);

/** Todos os lotes, com a área de 256 × 256, a fazenda de 64 × 64 e o portão em células do mundo. */
export function worldPlots(): ReadonlyArray<WorldPlot> {
	return PLOTS;
}

/** O lote pelo nome (o valor de `MundoLote`), ou nada. */
export function worldPlot(name: string): WorldPlot | undefined {
	return plotsByName.get(name);
}

/** O portão do lote (a célula do mundo onde o dono chega), ou nada se o lote não existe. */
export function lotGate(name: string): [number, number] | undefined {
	return plotsByName.get(name)?.gate;
}

// ------------------------------------------------------------------ lugares pelo nome (testes)

const ACCENTS: Record<string, string> = {
	á: "a",
	à: "a",
	â: "a",
	ã: "a",
	é: "e",
	ê: "e",
	í: "i",
	ó: "o",
	ô: "o",
	õ: "o",
	ú: "u",
	ç: "c",
};

function normalize(text: string) {
	let out = text.lower();
	for (const [from, to] of pairs(ACCENTS)) out = out.gsub(from, to)[0];
	return out.gsub("^%s+", "")[0].gsub("%s+$", "")[0];
}

/** Os lugares com nome e a célula de cada um (o portão do lote, o centro do distrito, a praça, a frente do lugar). */
function namedPlaces() {
	const list = new Array<[string, [number, number]]>();
	for (const plot of PLOTS) list.push([`Lote ${plot.name}`, plot.gate]);
	for (const d of DISTRICTS) {
		const [cx0, cy0, cx1, cy1] = d.center;
		const at: [number, number] = [math.floor((cx0 + cx1) / 2), cy1 + 2];
		list.push([d.name, at]);
		list.push([d.code, at]);
	}
	for (const town of TOWNS) list.push([town.name, [town.plaza[0] * BLOCK_TILES + 32, town.plaza[1] * BLOCK_TILES + 60]]);
	for (const poi of POIS) list.push([poi.name, [poi.x0 + math.floor(poi.w / 2), poi.y0 + poi.h + 2]]);
	return list;
}

/**
 * A célula de um lugar pelo nome (`MundoIr`, `MundoTeste`): o nome inteiro ou o começo dele, sem acento nem
 * maiúscula, ou "bx,by" (o meio do bloco). A célula livre mais perto, ou nada se o nome não existe.
 */
export function worldPlace(name: string): [number, number] | undefined {
	const [a, b] = name.match("^%s*(%d+)%s*,%s*(%d+)%s*$");
	const bx = tonumber(a);
	const by = tonumber(b);
	let target: [number, number] | undefined;
	if (bx !== undefined && by !== undefined) {
		if (!blockOpen(bx, by)) return undefined;
		target = [bx * BLOCK_TILES + BLOCK_TILES / 2, by * BLOCK_TILES + BLOCK_TILES / 2];
	} else {
		const wanted = normalize(name);
		if (wanted === "") return undefined;
		const places = namedPlaces();
		for (const [placeName, cell] of places) {
			if (normalize(placeName) === wanted) {
				target = cell;
				break;
			}
		}
		if (!target) {
			for (const [placeName, cell] of places) {
				if (normalize(placeName).sub(1, wanted.size()) === wanted) {
					target = cell;
					break;
				}
			}
		}
	}
	if (!target) return undefined;
	return nearestFree(target[0], target[1], 96) ?? target;
}

/** Os nomes que `worldPlace` conhece (para o aviso de nome errado). */
export function worldPlaceNames() {
	return namedPlaces().map(([placeName]) => placeName);
}

// ------------------------------------------------------------------ o teste

/** O teste do mundo: a célula de começo e se ela veio de um lugar pedido ("bx,by" ou nome) ou é o começo padrão. */
export interface WorldTest {
	cell: [number, number];
	block: boolean;
}

let cachedTest: WorldTest | false | undefined;

/**
 * O teste do mundo pedido por `MundoTeste`, ou nada no jogo normal. Lido uma vez. O servidor e o cliente chegam à
 * mesma célula. Sem lugar pedido, o servidor leva cada jogador ao portão do lote dele.
 */
export function worldTest(): WorldTest | undefined {
	if (cachedTest === undefined) cachedTest = readTest() ?? false;
	return cachedTest === false ? undefined : cachedTest;
}

function readTest(): WorldTest | undefined {
	const value = Workspace.GetAttribute(WORLD_TEST_ATTRIBUTE);
	if (value === undefined || value === false || value === "") return undefined;
	if (typeIs(value, "string") && value.lower() !== "true") {
		const cell = worldPlace(value);
		if (cell && cellOpen(cell[0], cell[1])) return { cell, block: true };
		warn(`[Mundo] ${WORLD_TEST_ATTRIBUTE}: "${value}" não é um bloco do mundo (0 a 831) nem um lugar; começando no lote A`);
	}
	return { cell: worldSpawn(), block: false };
}
