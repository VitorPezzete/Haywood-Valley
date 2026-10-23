// Qual interior o jogo monta e onde ele fica no mundo. Vale para o cliente (SceneController, que monta a
// cena) e para o servidor (PieceService, que guarda as peças que os jogadores empurram e carregam): os dois
// leem os mesmos atributos do Workspace e chegam ao mesmo mapa, na mesma posição.

import { Workspace } from "@rbxts/services";
import { ACTIONS_TEST_ATTRIBUTE } from "./interiorMap";
import { INTERIORS } from "./interiors";
import { INTERIOR_TEST_ATTRIBUTE, INTERIOR_TEST_CELL_ATTRIBUTE, InteriorData, InteriorExit, InteriorZone } from "./interiors/types";
import { groundOffset, snapToArtPx, worldToArtPx } from "./view";
import { WORLD_MAP_ID } from "./world";

/** Lado do tile das folhas do Aeko, em pixels de arte: meio stud de largura (o jogo tem 32 pixels por stud). */
export const INTERIOR_TILE = 16;

/** O teste de interior do Diorama: o mapa e a célula do bloco onde o personagem começa. */
export interface InteriorChoice {
	data: InteriorData;
	cell: [number, number];
}

let cached: InteriorChoice | false | undefined;

/**
 * O teste de interior pedido pelo atributo `InteriorTeste` do Workspace (o id de um mapa gerado por
 * `npm run diorama:jogo`), ou nada no jogo normal. Com ele, o jogo entra direto no interior, sem menu
 * nem personalização (seção 12.9 da especificação do Diorama). O atributo `InteriorTesteCelula`
 * ("x,y", células do bloco) escolhe onde o personagem começa; sem ele, vale a célula que o gerador
 * escolheu. Lido uma vez, no começo.
 */
export function interiorTest() {
	if (cached === undefined) cached = readTest() ?? false;
	return cached === false ? undefined : cached;
}

function readTest(): InteriorChoice | undefined {
	const id = Workspace.GetAttribute(INTERIOR_TEST_ATTRIBUTE);
	if (id === undefined || id === "") return undefined;
	const data = typeIs(id, "string") ? INTERIORS[id] : undefined;
	if (!data) {
		const known = new Array<string>();
		for (const [name] of pairs(INTERIORS)) known.push(name);
		warn(`[Interior] o mapa "${tostring(id)}" não foi gerado; os que o jogo conhece: ${known.join(", ")}`);
		return undefined;
	}
	let cell = data.spawn;
	const asked = Workspace.GetAttribute(INTERIOR_TEST_CELL_ATTRIBUTE);
	if (typeIs(asked, "string") && asked !== "") {
		const [x, y] = asked.match("^%s*(%d+)%s*,%s*(%d+)%s*$");
		const cx = tonumber(x);
		const cy = tonumber(y);
		if (cx === undefined || cy === undefined) {
			warn(`[Interior] ${INTERIOR_TEST_CELL_ATTRIBUTE} pede "x,y", veio "${asked}"`);
		} else if (blocks(data, cx, cy)) {
			warn(`[Interior] a célula ${cx},${cy} bloqueia; começando em ${cell[0]},${cell[1]}`);
		} else {
			cell = [cx, cy];
		}
	}
	return { data, cell };
}

/**
 * O interior em que o jogo normal começa, depois do menu e da personalização (pedido do usuário em
 * 2026-10-17: a casa de teste v2 no lugar da cena do protótipo). `undefined` volta à cena antiga, que
 * continua no SceneController.
 */
export const START_INTERIOR: string | undefined = "casa_teste_v2_l";

/** O interior de começo do jogo normal, na célula que o gerador escolheu, ou nada. */
export function startInterior(): InteriorChoice | undefined {
	if (START_INTERIOR === undefined) return undefined;
	const data = INTERIORS[START_INTERIOR];
	if (!data) {
		warn(`[Interior] o mapa de começo "${START_INTERIOR}" não foi gerado; usando a cena antiga`);
		return undefined;
	}
	return { data, cell: data.spawn };
}

/** Se a célula (x, y) do bloco bloqueia, pelos dados do mapa. */
function blocks(data: InteriorData, x: number, y: number) {
	const i = x - data.x;
	const j = y - data.y;
	return i < 0 || j < 0 || i >= data.width || j >= data.height || data.blocks[j].sub(i + 1, i + 1) === "#";
}

/** O interior em que o jogador começa: o teste do Diorama, se houver, senão o de começo do jogo normal. */
export function chosenInterior() {
	return interiorTest() ?? startInterior();
}

// ------------------------------------------------------------------ os mapas no mundo (etapa E1)

/**
 * Atributo do jogador com o id do mapa em que ele está. Quem grava é o servidor (`MapService`): ao entrar, o
 * mapa de começo; depois, o destino de cada saída que ele confere. Cada cliente monta só o mapa do próprio
 * jogador e só desenha os jogadores do mesmo mapa.
 */
export const MAP_ATTRIBUTE = "Mapa";
/** Atributo do jogador com a célula do bloco ("x,y") em que ele chegou ao mapa: onde ele volta ao renascer. */
export const MAP_CELL_ATTRIBUTE = "MapaCelula";

/**
 * Cada mapa fica num lugar só dele no mundo, lado a lado na direção da direita da tela (o bloco tem 32 studs de
 * largura e uns 34 de fundo), em ordem do id. Assim o bloqueio de um mapa nunca encosta no de outro, o servidor
 * sabe onde está cada um, e o personagem do Roblox de quem está noutro mapa fica longe. Só no eixo X: a
 * profundidade comprimida da câmera (`toView`) não depende de X, mas ao sul e ao norte ela perde precisão
 * (`view.ts`).
 *
 * 512 studs (fase 1 do `PLANO_OTIMIZACAO.md`, seção 2.6; antes, 64): bem mais que o raio de streaming do
 * `default.project.json` (`StreamingTargetRadius` 192) somado ao tamanho de um mapa, então o Roblox nem manda a
 * este cliente o personagem de quem está noutro mapa ou noutra casa.
 */
export const MAP_SPACING = 512;
/** Lado do bloco do Diorama, em tiles. */
const BLOCK_TILES = 64;

const MAP_IDS = new Array<string>();
for (const [id] of pairs(INTERIORS)) MAP_IDS.push(id);
MAP_IDS.sort();

/** Os mapas que o jogo conhece, na ordem em que ficam no mundo. */
export function mapIds(): ReadonlyArray<string> {
	return MAP_IDS;
}

/** Os dados do mapa, ou nada se ele não foi gerado. */
export function mapData(id: unknown): InteriorData | undefined {
	return typeIs(id, "string") ? INTERIORS[id] : undefined;
}

/**
 * O ponto do mundo no meio do bloco do mapa (no chão). Os mapas compartilhados ficam em volta da origem, na ordem
 * do id; as casas (`slot` 1 em diante, uma por dono) ficam dos dois lados deles, alternando (1 à direita, 2 à
 * esquerda, 3 à direita...), para o mundo ir só até uns 55 mil studs da origem com as 200 casas. No X o chão e os
 * cartões ficam no pixel de arte (múltiplos de 1/32 stud), que o float guarda exato até 262 mil studs.
 */
export function mapCenter(id: string, slot = 0) {
	const shared = MAP_IDS.size();
	const left = -math.floor(shared / 2);
	if (slot > 0) {
		const right = slot % 2 === 1;
		const step = math.ceil(slot / 2);
		const at = right ? left + shared - 1 + step : left - step;
		return new Vector3(at * MAP_SPACING, 0, 0);
	}
	const order = MAP_IDS.indexOf(id);
	return new Vector3((math.max(order, 0) + left) * MAP_SPACING, 0, 0);
}

/** Canto de cima à esquerda da célula (0, 0) do bloco do mapa (no lugar `slot`), no chão, no pixel de arte. */
export function mapCorner(id: string, slot = 0) {
	const half = (BLOCK_TILES * INTERIOR_TILE) / 2;
	return snapToArtPx(mapCenter(id, slot).add(groundOffset(-half, -half)));
}

/** O centro da célula (x, y) do bloco do mapa (no lugar `slot`), no chão. */
export function mapCellPoint(id: string, x: number, y: number, slot = 0) {
	return mapCorner(id, slot).add(groundOffset((x + 0.5) * INTERIOR_TILE, (y + 0.5) * INTERIOR_TILE));
}

// ------------------------------------------------------------------ a casa de cada jogador (etapa E2)

/**
 * Os mapas que são a casa de um jogador: cada jogador tem a dele, com a decoração dele (`shared/decor.ts`). O
 * servidor monta uma cópia por dono, num lugar próprio do mundo (`MAP_SLOT_ATTRIBUTE`), então dois jogadores no
 * mesmo servidor, cada um na sua casa, não se veem nem se esbarram. Visitar a casa de outro (mais tarde) é só o
 * servidor gravar o dono e o lugar dela no visitante.
 */
export const HOUSE_MAPS: ReadonlySet<string> = new Set(START_INTERIOR !== undefined ? [START_INTERIOR] : []);
/** Atributo do jogador com o `UserId` do dono da casa em que ele está; 0 (ou nada) num mapa compartilhado. */
export const MAP_OWNER_ATTRIBUTE = "MapaDono";
/** Atributo do jogador com o lugar no mundo da casa em que ele está (1 em diante); 0 (ou nada) num mapa compartilhado. */
export const MAP_SLOT_ATTRIBUTE = "MapaLugar";
/**
 * Casas no mundo, no máximo: uma por jogador do servidor (200, decisão do usuário em 2026-10-18); o piso do
 * `WorldService` cobre todas.
 */
export const MAX_HOUSE_SLOTS = 200;

/** O X do mapa mais à esquerda e o do mais à direita, com todas as casas: o piso do `WorldService` cobre os dois. */
export function worldSpan(): [number, number] {
	let min = mapCenter(MAP_IDS[0] ?? "").X;
	let max = mapCenter(MAP_IDS[MAP_IDS.size() - 1] ?? "").X;
	for (const slot of [MAX_HOUSE_SLOTS - 1, MAX_HOUSE_SLOTS]) {
		min = math.min(min, mapCenter("", slot).X);
		max = math.max(max, mapCenter("", slot).X);
	}
	return [min, max];
}

export function isHouse(id: string) {
	return HOUSE_MAPS.has(id);
}

/** Onde um jogador está: o mapa, o dono e o lugar da cópia (0 nos compartilhados) e a chave dessa cópia. */
export interface Place {
	id: string;
	owner: number;
	slot: number;
	key: string;
}

export function placeKey(id: string, owner: number) {
	return owner > 0 ? `${id}#${owner}` : id;
}

/**
 * O lugar em que o jogador está, pelos atributos que o servidor grava, ou nada. O mapa do mundo (`WORLD_MAP_ID`) é um
 * lugar compartilhado sem dados de interior (`mapData` dele é nada).
 */
export function placeOf(player: Player): Place | undefined {
	const id = player.GetAttribute(MAP_ATTRIBUTE);
	if (!typeIs(id, "string") || (id !== WORLD_MAP_ID && mapData(id) === undefined)) return undefined;
	const owner = player.GetAttribute(MAP_OWNER_ATTRIBUTE);
	const slot = player.GetAttribute(MAP_SLOT_ATTRIBUTE);
	const o = typeIs(owner, "number") && owner > 0 ? owner : 0;
	const s = typeIs(slot, "number") && slot > 0 ? slot : 0;
	return { id, owner: o, slot: s, key: placeKey(id, o) };
}

/**
 * A célula onde chega quem vem por uma saída com a chegada `arrival`: a célula pedida, a entrada com esse nome,
 * a entrada "entrada" (sem chegada) ou, sem nenhuma delas, o começo do gerador (`spawn`). Célula que bloqueia
 * também cai no começo.
 */
export function arrivalCell(data: InteriorData, arrival: InteriorExit["arrival"]): [number, number] {
	if (arrival !== undefined && !typeIs(arrival, "string")) {
		if (!blocks(data, arrival[0], arrival[1])) return [arrival[0], arrival[1]];
		warn(`[Mapa] a chegada ${arrival[0]},${arrival[1]} de "${data.id}" bloqueia; indo ao começo`);
		return data.spawn;
	}
	const name = arrival ?? "entrada";
	const entry = data.entries?.find((candidate) => candidate.name === name);
	if (entry && !blocks(data, entry.x, entry.y)) return [entry.x, entry.y];
	if (arrival !== undefined) warn(`[Mapa] "${data.id}" não tem a entrada "${arrival}"; indo ao começo`);
	return data.spawn;
}

/** A saída que cobre a célula (x, y) do bloco, ou nada. */
export function exitAt(data: InteriorData, x: number, y: number): InteriorExit | undefined {
	return data.exits?.find((exit) => x >= exit.x && y >= exit.y && x < exit.x + exit.width && y < exit.y + exit.height);
}

/** A zona com nome da célula (x, y) do bloco, ou nada. */
export function zoneAt(data: InteriorData, x: number, y: number): InteriorZone | undefined {
	return data.zones?.find((zone) => zone.areas.some(([x0, y0, x1, y1]) => x >= x0 && y >= y0 && x <= x1 && y <= y1));
}

/**
 * Como montar o mapa para as ações (as peças móveis e o teste delas): a célula de começo e se entram as peças de
 * teste (`AcoesTeste`, só no mapa em que o jogo começa). O servidor e o cliente perguntam aqui, para acharem as
 * mesmas peças com os mesmos ids.
 */
export function actionsStart(data: InteriorData): { cell: [number, number]; test: boolean } {
	const start = chosenInterior();
	if (start && start.data.id === data.id) {
		return { cell: start.cell, test: Workspace.GetAttribute(ACTIONS_TEST_ATTRIBUTE) === true };
	}
	return { cell: data.spawn, test: false };
}

/** "x,y" de uma célula, como no atributo `MapaCelula`. */
export function encodeCell(cell: [number, number]) {
	return `${cell[0]},${cell[1]}`;
}

/** A célula de um texto "x,y", ou nada. */
export function decodeCell(value: unknown): [number, number] | undefined {
	if (!typeIs(value, "string")) return undefined;
	const [x, y] = value.match("^%s*(%d+)%s*,%s*(%d+)%s*$");
	const cx = tonumber(x);
	const cy = tonumber(y);
	return cx !== undefined && cy !== undefined ? [cx, cy] : undefined;
}

/** A célula do bloco sob um ponto do chão, com o canto do interior em `corner`. */
export function cellOfPoint(corner: Vector3, position: Vector3): [number, number] {
	const px = worldToArtPx(position).sub(worldToArtPx(corner));
	return [math.floor(px.X / INTERIOR_TILE), math.floor(px.Y / INTERIOR_TILE)];
}

/** O ponto do chão a (px, py) pixels de arte do canto da célula (0, 0) do bloco. */
export function pointOfCellPx(corner: Vector3, px: number, py: number) {
	return corner.add(groundOffset(px, py));
}
