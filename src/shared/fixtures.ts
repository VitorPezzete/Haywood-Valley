// O que se usa com a tecla de ação sem sair do lugar (etapa E do roteiro do Diorama, item 17): o baú, que abre e
// fecha, e o fogão, que acende para cozinhar. Só tiles das folhas do Aeko, trocados célula a célula pela versão
// da mesma folha (o baú aberto, a boca e o forno acesos), sem mudar pixel. O baú grande do castelo aberto é mais
// alto que fechado: a tampa aberta ocupa duas linhas acima dele, que só aparecem enquanto ele está aberto. O
// estado vale só para a sessão, como a torneira. Vale no cliente (desenho, dica) e no servidor (que confere e
// manda a todos).

import type { InteriorMap } from "./interiorMap";
import type { InteriorTile } from "./interiors/types";
import type { PieceDef } from "./pieceDefs";

/**
 * Uma célula do que se usa: o tile desligado (baú fechado, fogão apagado) e o ligado. Sem `off`, desligado mostra
 * o que o mapa tem na célula (as linhas acima do baú grande fechado). `upright` é a tampa aberta do baú grande: em
 * pé, desenhada na frente de quem passa atrás do baú.
 */
export interface FixtureCell {
	dx: number;
	dy: number;
	off?: InteriorTile;
	on: InteriorTile;
	upright?: boolean;
}

/**
 * Um baú ou um fogão do mapa: fica onde o mapa o pôs. O retângulo (x, y, w, h) é o do baú fechado (o que se usa e
 * o que bloqueia); a tampa aberta do baú grande fica acima dele, nas células de `dy` negativo.
 */
export interface Fixture {
	id: string;
	kind: "chest" | "stove";
	x: number;
	y: number;
	w: number;
	h: number;
	cells: FixtureCell[];
	startsOn: boolean;
}

/**
 * Os baús pequenos das folhas, 2 × 2, fechado e aberto célula a célula, do `mapa_folhas.json` do guia: o
 * vermelho aberto é a tampa aberta [47-48,22] (a mesma do azul) sobre a frente [45-46,24]. Os baús grandes do
 * castelo, 4 × 4 fechados e 4 × 6 abertos, ficam em `BIG_CHESTS`.
 */
const CHESTS: { sheet: string; closed: [number, number][]; open: [number, number][] }[] = [
	{
		sheet: "casa",
		closed: [
			[45, 20],
			[46, 20],
			[45, 21],
			[46, 21],
		],
		open: [
			[47, 22],
			[48, 22],
			[45, 24],
			[46, 24],
		],
	},
	{
		sheet: "casa",
		closed: [
			[45, 22],
			[46, 22],
			[45, 23],
			[46, 23],
		],
		open: [
			[47, 22],
			[48, 22],
			[47, 23],
			[48, 23],
		],
	},
	{
		sheet: "castelo",
		closed: [
			[64, 16],
			[65, 16],
			[64, 17],
			[65, 17],
		],
		open: [
			[66, 18],
			[67, 18],
			[64, 20],
			[65, 20],
		],
	},
	{
		sheet: "castelo",
		closed: [
			[64, 18],
			[65, 18],
			[64, 19],
			[65, 19],
		],
		open: [
			[66, 18],
			[67, 18],
			[66, 19],
			[67, 19],
		],
	},
];
const CHEST_CELLS: [number, number][] = [
	[0, 0],
	[1, 0],
	[0, 1],
	[1, 1],
];

/**
 * Os baús grandes do castelo (decidido pelo usuário em 2026-10-20: abrem no lugar como os pequenos). Fechados,
 * 4 × 4: o azul [68-71,16-19] e o vermelho [72-75,16-19]. Aberto, o vermelho é [68-71,20-25], 4 × 6: a tampa em pé
 * (linhas 20-21, a borda vermelha em cima), a caixa aberta (22-24) e o pé com a faixa vermelha (25). O azul aberto
 * usa o mesmo desenho com as duas linhas de cor trocadas pelas azuis de [72-75,20-21]: a borda da tampa [72-75,20]
 * e o pé [72-75,21]; as linhas 21-24 do vermelho não têm vermelho. Conferido pixel a pixel na folha em 2026-10-20:
 * as linhas de cor diferem do vermelho só na troca das cores do fechado vermelho pelas do azul, e o pé do aberto
 * tem os mesmos 11 pixels de baixo (pés e barra) que o pé do fechado, na mesma coluna. A base fica no lugar e a
 * tampa sobe 2 tiles: a linha 0 do fechado é a linha 2 do aberto. Cada linha do aberto é dada pelo tile da esquerda.
 */
const BIG_CHESTS: { sheet: string; closed: [number, number]; open: [number, number][] }[] = [
	{
		sheet: "castelo",
		closed: [72, 16],
		open: [
			[68, 20],
			[68, 21],
			[68, 22],
			[68, 23],
			[68, 24],
			[68, 25],
		],
	},
	{
		sheet: "castelo",
		closed: [68, 16],
		open: [
			[72, 20],
			[68, 21],
			[68, 22],
			[68, 23],
			[68, 24],
			[72, 21],
		],
	},
];
const BIG_CHEST_WIDTH = 4;
const BIG_CHEST_HEIGHT = 4;
/** Quantas linhas a tampa aberta sobe acima do baú grande fechado. */
const BIG_CHEST_LID = 2;

/**
 * O fogão da casa (`casa79`, [61-63,27-31]): a coluna da direita apagada [63,27-30] troca pela acesa [64,27-30]
 * (`casa80`, a boca acesa, e `casa183`, o forno aceso). A folha não tem fumaça nem panela.
 */
const STOVE_SHEET = "casa";
const STOVE_OFF_COL = 63;
const STOVE_ON_COL = 64;
const STOVE_ROWS = [27, 28, 29, 30];
const STOVE_WIDTH = 3;

function same(tile: InteriorTile | undefined, sheet: string, col: number, row: number) {
	return tile !== undefined && tile[0] === sheet && tile[1] === col && tile[2] === row;
}

/** O baú 2 × 2 cujas células (pelo `tileAt` de cada uma) batem com um da lista, fechado ou aberto. */
function matchChest(tileAt: (dx: number, dy: number) => InteriorTile | undefined) {
	for (const chest of CHESTS) {
		for (const open of [false, true]) {
			const cells = open ? chest.open : chest.closed;
			const fits = CHEST_CELLS.every(([dx, dy], i) => same(tileAt(dx, dy), chest.sheet, cells[i][0], cells[i][1]));
			if (!fits) continue;
			const list = CHEST_CELLS.map(
				([dx, dy], i): FixtureCell => ({
					dx,
					dy,
					off: [chest.sheet, chest.closed[i][0], chest.closed[i][1]],
					on: [chest.sheet, chest.open[i][0], chest.open[i][1]],
				}),
			);
			return { cells: list, open };
		}
	}
	return undefined;
}

/**
 * O que fica por baixo da tampa pintada aberta na célula (x, y): o tile da camada de baixo daquela em que ela está,
 * ou o vazio do mapa. É o que o baú grande pintado aberto mostra acima dele quando fecha.
 */
function beneath(map: InteriorMap, x: number, y: number): InteriorTile {
	for (const layer of [2, 1]) {
		if (!map.tile(layer, x, y)) continue;
		for (let below = layer - 1; below >= 0; below--) {
			const tile = map.tile(below, x, y);
			if (tile) return tile;
		}
		break;
	}
	return map.data.backdrop;
}

/**
 * O baú grande cujo canto de cima à esquerda está em (x, y): o fechado, ou o aberto com a tampa começando ali (o
 * baú fica 2 linhas abaixo). As células vão com o baú primeiro (o canto dele é a primeira) e a tampa depois.
 */
function matchBigChest(map: InteriorMap, x: number, y: number, free: (x: number, y: number) => boolean) {
	for (const chest of BIG_CHESTS) {
		for (const open of [false, true]) {
			const rows = open ? BIG_CHEST_HEIGHT + BIG_CHEST_LID : BIG_CHEST_HEIGHT;
			let fits = true;
			for (let j = 0; j < rows && fits; j++) {
				for (let i = 0; i < BIG_CHEST_WIDTH && fits; i++) {
					const [col, row] = open ? chest.open[j] : [chest.closed[0], chest.closed[1] + j];
					fits = free(x + i, y + j) && same(map.ground(x + i, y + j), chest.sheet, col + i, row);
				}
			}
			if (!fits) continue;
			// Pintado aberto, a tampa está no mapa: o canto do baú fica abaixo dela.
			const top = open ? y + BIG_CHEST_LID : y;
			const cells = new Array<FixtureCell>();
			for (let j = 0; j < BIG_CHEST_HEIGHT; j++) {
				for (let i = 0; i < BIG_CHEST_WIDTH; i++) {
					const [col, row] = chest.open[j + BIG_CHEST_LID];
					cells.push({
						dx: i,
						dy: j,
						off: [chest.sheet, chest.closed[0] + i, chest.closed[1] + j],
						on: [chest.sheet, col + i, row],
					});
				}
			}
			// A tampa: aberto, em pé; fechado, o que o mapa tinha ali (pintado fechado, o mapa como está; pintado
			// aberto, o que fica por baixo da tampa).
			for (let j = 0; j < BIG_CHEST_LID; j++) {
				for (let i = 0; i < BIG_CHEST_WIDTH; i++) {
					const [col, row] = chest.open[j];
					cells.push({
						dx: i,
						dy: j - BIG_CHEST_LID,
						off: open ? beneath(map, x + i, y + j) : undefined,
						on: [chest.sheet, col + i, row],
						upright: true,
					});
				}
			}
			return { x, y: top, cells, open, rows };
		}
	}
	return undefined;
}

/** O baú de uma peça móvel (`casa46`, `casa47`, `casa64`): as células fechado e aberto e se ela é a aberta. */
export function chestOfPiece(def: PieceDef) {
	if (def.kind !== "chest") return undefined;
	return matchChest((dx, dy) => (dx < def.w && dy < def.h ? [def.sheet, def.col + dx, def.row + dy] : undefined));
}

/**
 * Os baús e fogões fixos do mapa, pelo tile que aparece em cada célula (`InteriorMap.ground`). As peças móveis
 * (o baú que se puxa) ficam de fora: o mapa mostra o piso onde elas estavam, e elas abrem pelo id da peça.
 */
export function findFixtures(map: InteriorMap) {
	const fixtures = new Array<Fixture>();
	const claimed = new Set<number>();
	for (let y = map.y; y < map.y + map.height; y++) {
		for (let x = map.x; x < map.x + map.width; x++) {
			if (claimed.has(map.key(x, y))) continue;
			const chest = matchChest((dx, dy) =>
				claimed.has(map.key(x + dx, y + dy)) ? undefined : map.ground(x + dx, y + dy),
			);
			if (chest) {
				for (const cell of chest.cells) claimed.add(map.key(x + cell.dx, y + cell.dy));
				fixtures.push({
					id: `chest@${x},${y}`,
					kind: "chest",
					x,
					y,
					w: 2,
					h: 2,
					cells: chest.cells,
					startsOn: chest.open,
				});
				continue;
			}
			const big = matchBigChest(map, x, y, (cx, cy) => !claimed.has(map.key(cx, cy)));
			if (big) {
				// Pintado aberto, a tampa também é do baú; pintado fechado, as linhas de cima continuam do mapa.
				for (let j = 0; j < big.rows; j++) {
					for (let i = 0; i < BIG_CHEST_WIDTH; i++) claimed.add(map.key(x + i, y + j));
				}
				fixtures.push({
					id: `chest@${big.x},${big.y}`,
					kind: "chest",
					x: big.x,
					y: big.y,
					w: BIG_CHEST_WIDTH,
					h: BIG_CHEST_HEIGHT,
					cells: big.cells,
					startsOn: big.open,
				});
				continue;
			}
			// O fogão: a coluna da direita (apagada ou acesa), com a chapa ou o forno [62, linha] à esquerda.
			const tile = map.ground(x, y);
			if (
				!tile ||
				tile[0] !== STOVE_SHEET ||
				(tile[1] !== STOVE_OFF_COL && tile[1] !== STOVE_ON_COL) ||
				!STOVE_ROWS.includes(tile[2])
			)
				continue;
			if (!same(map.ground(x - 1, y), STOVE_SHEET, STOVE_OFF_COL - 1, tile[2])) continue;
			// Desce pela coluna enquanto for fogão; o de cima é o canto.
			const cells = new Array<FixtureCell>();
			// Aceso só com a coluna toda acesa: a boca acesa e o forno apagado do mapa contam como apagado (o primeiro F
			// acende tudo).
			let startsOn = true;
			for (let dy = 0; ; dy++) {
				const below = map.ground(x, y + dy);
				if (!below || below[0] !== STOVE_SHEET || !STOVE_ROWS.includes(below[2])) break;
				if (below[1] !== STOVE_OFF_COL && below[1] !== STOVE_ON_COL) break;
				if (!same(map.ground(x - 1, y + dy), STOVE_SHEET, STOVE_OFF_COL - 1, below[2])) break;
				if (below[1] !== STOVE_ON_COL) startsOn = false;
				claimed.add(map.key(x, y + dy));
				cells.push({
					dx: STOVE_WIDTH - 1,
					dy,
					off: [STOVE_SHEET, STOVE_OFF_COL, below[2]],
					on: [STOVE_SHEET, STOVE_ON_COL, below[2]],
				});
			}
			// O retângulo é o fogão inteiro (três colunas), para usar de frente para qualquer parte dele.
			const left = x - (STOVE_WIDTH - 1);
			fixtures.push({
				id: `stove@${left},${y}`,
				kind: "stove",
				x: left,
				y,
				w: STOVE_WIDTH,
				h: cells.size(),
				cells,
				startsOn,
			});
		}
	}
	return fixtures;
}

/** Distância máxima, em células, entre o pé do jogador e o baú ou o fogão que ele usa (o servidor confere). */
export const FIXTURE_REACH = 2;
/**
 * O baú que é peça móvel se abre com um toque em F; segurar F mais que isto segura a peça para puxar (como antes).
 * Em segundos.
 */
export const CHEST_TAP_SECONDS = 0.3;
/**
 * Cozinhar (a confirmar com o inventário): o fogão aceso por este tempo, em segundos, chama o gancho de cozinhar do
 * servidor (`FixtureService.cook`), que hoje só avisa no Output: ainda não há receitas, ingredientes nem itens.
 */
export const COOK_SECONDS = 6;

/** Se o retângulo (x, y, w, h) está a até `reach` células da célula (cx, cy). */
export function nearCells(cx: number, cy: number, x: number, y: number, w: number, h: number, reach: number) {
	const dx = math.max(x - cx, 0, cx - (x + w - 1));
	const dy = math.max(y - cy, 0, cy - (y + h - 1));
	return dx <= reach && dy <= reach;
}
