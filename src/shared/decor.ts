// Decorar a casa (etapa E2 do roteiro do Diorama, aprovada pelo usuário: "decorar no jogo com as mesmas regras
// de encaixe e de fundo do Diorama"). As peças do inventário de teste (`decorCatalog.ts`, gerado) são postas
// sobre o mapa com a regra do carimbo do plugin (seção 12.14 da especificação): cada variante é conferida
// contra o tile que está embaixo de cada célula (exata, costura ou conflito) e fica a de menos conflitos; sem
// variante sem conflito, a peça é recusada com o motivo. Janela e quadro encaixam na parede como no plugin
// (seção 12.12, `encaixe.ts`): a coluna onde o jogador aponta e a altura tirada da parede do cômodo. O mesmo
// código vale no cliente (a peça meio transparente e o aviso) e no servidor (que confere cada pedido).
// Este módulo não importa o plugin: as regras foram copiadas de plugin/src/fundos.ts, encaixe.ts, detectar.ts e
// paredes.ts (só as que o inventário usa) e as tabelas vêm do gerador.

import { tileZone } from "./interiorMap";
import type { InteriorMap, TileKind } from "./interiorMap";
import {
	DECOR_BACKGROUNDS,
	DECOR_EXACT,
	DECOR_ITEMS,
	DECOR_TYPE_SETS,
	DecorCell,
	DecorItem,
	DecorVariant,
} from "./decorCatalog";
import type { InteriorTile } from "./interiors/types";
import type { TextKey } from "./i18n/en";
import { DECOR_RECORTES, RECORTES } from "./recortes";

/**
 * O inventário de teste: quantas de cada peça o jogador tem para pôr na casa. Guardar uma peça devolve a ela.
 * Quando houver itens de verdade, só esta tabela (e quem a lê, `stockOf`) muda.
 */
export const TEST_INVENTORY: Record<string, number> = {
	chair: 4,
	table: 1,
	pot: 3,
	rug: 2,
	picture: 2,
	window: 2,
	shelf: 1,
	bed: 1,
	torch: 2,
	lamp: 2,
};

/** A ordem das peças no inventário (a do catálogo gerado). */
export const DECOR_ORDER = DECOR_ITEMS.map((item) => item.id);

/**
 * Versão do formato salvo da decoração (`PlayerData.decor`); muda quando o texto mudar de jeito. A 2 (etapa G,
 * 2026-10-20) acrescentou as cores das partes no fim de cada peça; a 1 se lê igual, com as peças na cor original.
 */
export const DECOR_SAVE_VERSION = 2;
/** As versões que este código lê. Uma mais nova fica guardada como veio, sem decorar (`decorIsNewer`). */
const DECOR_READS = new Set([1, 2]);
/**
 * Peças postas, no máximo, em cada mapa; e o tamanho máximo do texto salvo de um mapa. Com as cores, a peça mais
 * longa é o quadro com as 6 partes pintadas: "picture 0 63 63 " e 6 cores de 6 letras com vírgulas, 57 letras e o
 * ";"; 120 delas dão 6959. Antes das cores o limite era 4000 (a peça mais longa tinha 16 letras).
 */
export const DECOR_MAX_PIECES = 120;
export const DECOR_MAX_TEXT = 8000;
/** Mapas com decoração salva, no máximo, por jogador. */
export const DECOR_MAX_MAPS = 8;

export type DecorId = string;

const byId = new Map<DecorId, DecorItem>();
for (const item of DECOR_ITEMS) byId.set(item.id, item);

/** A peça do inventário pelo id, ou nada. */
export function decorItem(id: unknown) {
	return typeIs(id, "string") ? byId.get(id) : undefined;
}

/** O nome da peça para o jogador (`decor.item.<id>`). */
export function decorItemKey(id: string) {
	return `decor.item.${id}` as TextKey;
}

/** Uma peça posta pelo jogador num mapa. */
export interface DecorState {
	key: number;
	item: DecorItem;
	form: number;
	variant: number;
	x: number;
	y: number;
	ax: number;
	ay: number;
	/** A cor de cada parte pintável (`decorParts`), ou `DECOR_ORIGINAL`; a lista pode ser mais curta que as partes. */
	colors: DecorColors;
}

export function decorVariant(state: DecorState) {
	const form = state.item.forms[state.form] ?? state.item.forms[0];
	return form.variants[state.variant] ?? form.variants[0];
}

/** O tile da folha que a célula da peça mostra. */
export function decorTile(item: DecorItem, cell: DecorCell): InteriorTile {
	return [item.sheet, cell[2], cell[3]];
}

/** O tipo de tile do Graal de uma célula da peça (a cadeira senta, a cama deita). */
export function decorKind(cell: DecorCell): TileKind {
	const code = cell[7];
	return code === "3" ? 3 : code === "4" ? 4 : code === "5" ? 5 : 0;
}

// ------------------------------------------------------------------ as cores (etapa G, recortes.ts)

/**
 * As cores das partes de uma peça posta: uma por parte pintável do recorte (`shared/recortes.ts`, gerado por
 * tools/recortes.py --montar), 0xRRGGBB, ou `DECOR_ORIGINAL` para a parte na cor da arte.
 */
export type DecorColors = readonly number[];
export const DECOR_ORIGINAL = -1;

/**
 * As cores prontas do Decorar: tons que já existem nas peças do Aeko (as cores de referência das partes), para a
 * peça pintada continuar parecendo da mesma folha. A máscara multiplica a cor pelo cinza dela, então a sombra e a
 * textura ficam; o branco da máscara recebe a cor cheia.
 */
export const DECOR_PALETTE: readonly number[] = [
	0xc45b43, // vermelho (a coberta da cama)
	0xe08b55, // laranja (a moldura da janela)
	0xda8506, // dourado (o sofá)
	0x6daa73, // verde (o quadro)
	0x2cacb0, // turquesa (os livros da estante)
	0x326abb, // azul (o baú do castelo)
	0xb06da3, // lilás (a coberta da cama)
	0x7f4230, // marrom (a madeira do quadro)
	0xbcbcc2, // cinza (o fogão)
];

/** Quantas partes pintáveis a peça tem; 0 é sem recorte (a peça não se pinta). */
export function decorParts(item: DecorItem) {
	return DECOR_RECORTES[item.id]?.parts ?? 0;
}

/** O recorte que a peça desenha na direção e na variante dela, ou nada (a cena desenha os tiles). */
export function decorRecorte(state: Pick<DecorState, "item" | "form" | "variant">) {
	const forms = DECOR_RECORTES[state.item.id]?.forms;
	if (!forms) return undefined;
	const form = forms[state.form] ?? forms[0];
	const index = form[state.variant] ?? form[0];
	return index >= 0 ? RECORTES[index] : undefined;
}

/** A cor da parte `part` (0, 1...) da peça: a escolhida ou, sem escolha, a original do recorte. */
export function partColor(state: Pick<DecorState, "item" | "form" | "variant" | "colors">, part: number) {
	const color = state.colors[part] ?? DECOR_ORIGINAL;
	return color !== DECOR_ORIGINAL ? color : (decorRecorte(state)?.colors[part] ?? 0xffffff);
}

/** A cor 0xRRGGBB como `Color3`. */
export function decorColor3(color: number) {
	return Color3.fromRGB((color >> 16) & 255, (color >> 8) & 255, color & 255);
}

/** Sem as originais do fim: a lista guardada e enviada é a mais curta que diz as mesmas cores. */
function trimColors(colors: DecorColors) {
	const list = [...colors];
	while (list.size() > 0 && list[list.size() - 1] === DECOR_ORIGINAL) list.pop();
	return list;
}

/** As cores em texto: "c45b43,-,2cacb0" (o "-" é a original); "" quando todas são a original. */
export function encodeColors(colors: DecorColors) {
	return trimColors(colors)
		.map((color) => (color === DECOR_ORIGINAL ? "-" : string.format("%06x", color)))
		.join(",");
}

/** Uma cor do texto: "-" (a original) ou 6 letras hexadecimais; nada se não for nenhum dos dois. */
function colorOf(text: string): number | undefined {
	if (text === "-") return DECOR_ORIGINAL;
	if (text.size() !== 6 || string.match(text, "^%x+$")[0] === undefined) return undefined;
	return tonumber(text, 16);
}

/**
 * Lê as cores de um pedido do cliente: no máximo uma por parte da peça, cada uma "-" ou 6 letras hexadecimais
 * (0xRRGGBB). Fora disso, nada (o servidor ignora o pedido).
 */
export function parseColors(text: unknown, parts: number): number[] | undefined {
	if (!typeIs(text, "string") || text.size() > parts * 7) return undefined;
	if (text === "") return [];
	const list = new Array<number>();
	for (const entry of text.split(",")) {
		const color = colorOf(entry);
		if (color === undefined) return undefined;
		list.push(color);
	}
	return list.size() <= parts ? trimColors(list) : undefined;
}

/**
 * Lê as cores do salvo sem jogar a peça fora: a cor estragada vira a original e as partes a mais (o recorte foi
 * refeito com menos partes) são esquecidas.
 */
function decodeColors(text: string | undefined, parts: number) {
	const list = new Array<number>();
	if (text === undefined || text === "" || text.size() > 7 * 16) return list;
	for (const entry of text.split(",")) {
		if (list.size() >= parts) break;
		list.push(colorOf(entry) ?? DECOR_ORIGINAL);
	}
	return trimColors(list);
}

// ------------------------------------------------------------------ o fundo (plugin/src/fundos.ts)

/** Os tipos de fundo (índices em DECOR_BACKGROUNDS) de cada tile, pela chave "folha,linha*128+coluna". */
const typesOf = new Map<string, number[]>();
DECOR_BACKGROUNDS.forEach(([sheet, , tiles], index) => {
	for (const tile of tiles) {
		const key = `${sheet},${tile}`;
		const list = typesOf.get(key) ?? [];
		if (!list.includes(index)) list.push(index);
		typesOf.set(key, list);
	}
});
const exactSets = DECOR_EXACT.map((list) => new Set(list));

function tileTypes(tile: InteriorTile) {
	return typesOf.get(`${tile[0]},${tile[2] * 128 + tile[1]}`);
}

/** A chave do nome de um tipo de fundo (`decor.bg.<id>`), ou a do "outra coisa". */
function backgroundKey(index: number | undefined) {
	const entry = index !== undefined ? DECOR_BACKGROUNDS[index] : undefined;
	// Só os fundos da folha da casa têm nome traduzido (`decor.bg.<id>`); o resto é "outra coisa".
	return (entry && entry[0] === "casa" ? `decor.bg.${entry[1]}` : "decor.bg.other") as TextKey;
}

interface DecorFit {
	exact: number;
	seams: number;
	conflicts: number;
	checked: number;
	found?: InteriorTile;
}

/** Como a variante combina com o que está embaixo, célula a célula (`fitAt` do plugin). */
function fitOf(
	item: DecorItem,
	variant: DecorVariant,
	x: number,
	y: number,
	under: (x: number, y: number) => InteriorTile | undefined,
) {
	const fit: DecorFit = { exact: 0, seams: 0, conflicts: 0, checked: 0 };
	for (const cell of variant.cells) {
		const need = cell[5];
		if (need === 0) continue;
		const tile = under(x + cell[0], y + cell[1]);
		if (!tile) continue;
		fit.checked++;
		if (tile[0] === item.sheet && tile[1] === cell[2] && tile[2] === cell[3]) {
			fit.exact++;
			continue;
		}
		if (tile[0] === item.sheet && exactSets[need - 1]?.has(tile[2] * 128 + tile[1])) {
			fit.exact++;
			continue;
		}
		const accepted = cell[6] > 0 ? DECOR_TYPE_SETS[cell[6] - 1] : variant.types;
		const types = tileTypes(tile);
		if (accepted.size() === 0 || (types !== undefined && types.some((t) => accepted.includes(t)))) {
			fit.seams++;
			continue;
		}
		fit.conflicts++;
		if (!fit.found) fit.found = tile;
	}
	return fit;
}

/** Se a encaixa melhor que b: menos conflitos, mais células exatas, mais células conferidas (`betterFit`). */
function betterFit(a: DecorFit, b: DecorFit) {
	if (a.conflicts !== b.conflicts) return a.conflicts < b.conflicts;
	if (a.exact !== b.exact) return a.exact > b.exact;
	return a.exact + a.seams > b.exact + b.seams;
}

// ------------------------------------------------------------------ a parede (plugin/src/encaixe.ts, detectar.ts, paredes.ts)

type Tile = InteriorTile | undefined;

const at = (tile: Tile, c0: number, l0: number, c1: number, l1: number) =>
	tile !== undefined && tile[0] === "casa" && tile[1] >= c0 && tile[1] <= c1 && tile[2] >= l0 && tile[2] <= l1;
const isTile = (tile: Tile, col: number, row: number) => at(tile, col, row, col, row);
const isTopStrip = (t: Tile) => at(t, 34, 25, 39, 25) || at(t, 41, 28, 42, 28);
const isChimneyTop = (t: Tile) => at(t, 56, 25, 60, 25);
const isChimney = (t: Tile) => at(t, 56, 25, 60, 31);
const isPillar = (t: Tile) => at(t, 32, 24, 33, 31);
const isTopRowInside = (t: Tile) => isTopStrip(t) || isChimneyTop(t) || at(t, 32, 25, 33, 25);
const isTopCorner = (t: Tile) => isTile(t, 40, 28) || isTile(t, 43, 28);
const isBottomWall = (t: Tile) => at(t, 41, 31, 42, 31);
const isBottomRow = (t: Tile) => isBottomWall(t) || isTile(t, 40, 31) || isTile(t, 43, 31);
const isVoid = (t: Tile) => isTile(t, 0, 2) || at(t, 58, 16, 58, 18);
const isBluePaper = (t: Tile) => at(t, 34, 27, 36, 29) || at(t, 38, 27, 39, 29);
const isYellowPaper = (t: Tile) => at(t, 54, 21, 55, 22);
const isPaper = (t: Tile) => isBluePaper(t) || isYellowPaper(t);
const isFaceTile = (t: Tile) => at(t, 34, 26, 39, 31) || (at(t, 54, 20, 56, 23) && !at(t, 54, 20, 55, 20));
/** As pontas de parede de 1 e de 2 tiles. */
const isWallEnd = (t: Tile) => isTile(t, 42, 30) || isTile(t, 41, 29) || isTile(t, 42, 29);

/**
 * A peça de parede da célula: a da camada de objeto ou, sem ela, a do chão. O cômodo da ferramenta do Diorama põe
 * a parede na camada de objeto; a casa de teste (`casa_teste_v2_l`, decodificada) tem a parede no chão. O plugin
 * só olha a de objeto; aqui valem as duas.
 */
function wallAt(map: InteriorMap, x: number, y: number) {
	return map.tile(1, x, y) ?? map.tile(0, x, y);
}

/** A linha que dois cômodos empilhados dividem, servindo de topo ao de baixo (`sharedTop`). */
function sharedTop(map: InteriorMap, x: number, y: number) {
	const wall = wallAt(map, x, y);
	if (!isBottomWall(wall) && !isWallEnd(wall)) return false;
	const below = wallAt(map, x, y + 1);
	return isFaceTile(below) || isChimney(below) || isPillar(below);
}

/** A linha do topo da parede de fundo acima da célula, ou nada se sair do cômodo antes (`topAbove`). */
function topAbove(map: InteriorMap, x: number, y: number) {
	for (let row = y; row >= map.y; row--) {
		const wall = wallAt(map, x, row);
		if (isTopRowInside(wall) || isTopCorner(wall) || sharedTop(map, x, row)) return row;
		if (row !== y && isBottomRow(wall)) return undefined;
		if (wall === undefined || isVoid(wall)) return undefined;
	}
	return undefined;
}

// ------------------------------------------------------------------ pôr a peça

/** O motivo de uma recusa: a chave do texto e as chaves que entram nele (traduzidas por quem mostra). */
export interface DecorRefusal {
	key: TextKey;
	piece?: TextKey;
	wanted?: TextKey[];
	found?: TextKey;
}

/** O que o tabuleiro de peças diz de uma célula, para a decoração não cobrir peça, jogador nem saída. */
export interface DecorBoard {
	readonly map: InteriorMap;
	isExit(x: number, y: number): boolean;
	occupiedByPiece(x: number, y: number, ignore?: number): boolean;
}

export interface DecorPlan {
	ok: boolean;
	variant: number;
	x: number;
	y: number;
	refusal?: DecorRefusal;
}

interface DecorChoice {
	variant: number;
	x: number;
	y: number;
	fit: DecorFit;
}

/** O canto da primeira variante para quem aponta a célula (ax, ay): a peça fica centrada no ponto. */
function cornerFor(variant: DecorVariant, ax: number, ay: number): [number, number] {
	return [ax - math.floor((variant.w - 1) / 2), ay - math.floor((variant.h - 1) / 2)];
}

/**
 * Os fundos de parede: a peça cujos tipos de fundo são todos de parede (a luminária no papel, o peixe nas tábuas) é
 * de parede, e a célula dela sem exigência de fundo pede parede do mesmo tipo embaixo, não piso.
 */
const WALL_BACKGROUNDS = new Set([
	"papel_azul",
	"poste",
	"viga",
	"lambri",
	"papel_amarelo",
	"lambri_amarelo",
	"parede_tabuas",
	"face_pedra",
	"topo_bege",
	"muralha_lado",
]);

function isWallVariant(variant: DecorVariant) {
	return (
		variant.types.size() > 0 && variant.types.every((index) => WALL_BACKGROUNDS.has(DECOR_BACKGROUNDS[index]?.[1] ?? ""))
	);
}

/** Piso em que a peça pode pousar: não bloqueia, não é assento, cama nem água, e é piso das folhas. */
function freeFloor(map: InteriorMap, x: number, y: number) {
	if (map.blocked(x, y) || map.kind(x, y) !== 0) return false;
	const top = map.ground(x, y);
	if (!top) return false;
	const zone = tileZone(top);
	return zone === "chao" || zone === "normal";
}

/**
 * Onde e em que variante a peça `item` (na direção `form`) fica para quem aponta a célula (ax, ay) do bloco, ou
 * por que não fica. `ignore` é a peça posta que está sendo movida; `someoneAt` diz se há um jogador na célula
 * (só o servidor sabe; a peça que bloqueia não cai em cima de ninguém).
 *
 * - Peça da parede (janela, quadro): cada variante encaixa pela regra dela (a coluna apontada, a altura da
 *   parede do cômodo, o papel certo); das que encaixam, fica a que combina melhor com o fundo, sem recusar por
 *   ele (como no plugin).
 * - Peça do chão: cada variante no lugar apontado; fica a de menos conflitos de fundo; com conflito, recusa
 *   com o motivo. Célula sem exigência de fundo precisa de piso livre embaixo.
 * - Toda peça: dentro do mapa, sem cobrir outra peça, uma saída nem (se bloqueia) um jogador.
 */
export function planDecor(
	board: DecorBoard,
	item: DecorItem,
	formIndex: number,
	ax: number,
	ay: number,
	ignore?: number,
	someoneAt?: (x: number, y: number) => boolean,
): DecorPlan {
	const map = board.map;
	const form = item.forms[formIndex];
	const piece = decorItemKey(item.id);
	const refuse = (refusal: DecorRefusal, x = ax, y = ay): DecorPlan => ({ ok: false, variant: 0, x, y, refusal });
	if (!form) return refuse({ key: "decor.refuse.blocked" });

	const under = (x: number, y: number) => map.ground(x, y);
	let best: DecorChoice | undefined;
	let snapError: DecorRefusal | undefined;
	let snapped = false;
	form.variants.forEach((variant, index) => {
		const [cx, cy] = cornerFor(form.variants[0], ax, ay);
		const x = cx + variant.dx;
		let y = cy + variant.dy;
		if (variant.snap) {
			snapped = true;
			const [kind, row, paper] = variant.snap;
			const top = topAbove(map, ax, ay);
			if (top === undefined) {
				snapError = snapError ?? { key: "decor.refuse.noWall", piece };
				return;
			}
			y = top + row + variant.dy;
			for (const cell of variant.cells) {
				const tx = x + cell[0];
				const ty = y + cell[1];
				const current = wallAt(map, tx, ty);
				if (topAbove(map, tx, ty) !== top) {
					snapError = snapError ?? { key: "decor.refuse.crossWall", piece };
					return;
				}
				const ok =
					kind === "janela" ? (paper === "amarelo" ? isYellowPaper(current) : isBluePaper(current)) : isPaper(current);
				if (!ok) {
					snapError = snapError ?? {
						key: kind === "janela" && isPaper(current) ? "decor.refuse.paper" : "decor.refuse.wall",
						piece,
					};
					return;
				}
			}
		}
		const fit = fitOf(item, variant, x, y, under);
		if (!best || betterFit(fit, best.fit)) best = { variant: index, x, y, fit };
	});

	const chosen = best as DecorChoice | undefined;
	if (!chosen) return refuse(snapError ?? { key: "decor.refuse.wall", piece });
	const variant = form.variants[chosen.variant];
	const wallPiece = isWallVariant(variant);
	const { x, y } = chosen;
	if (!snapped && chosen.fit.conflicts > 0) {
		const found = chosen.fit.found ? tileTypes(chosen.fit.found)?.[0] : undefined;
		const wanted = new Array<TextKey>();
		for (const kind of variant.types) {
			if (wanted.size() < 3) wanted.push(backgroundKey(kind));
		}
		return refuse({ key: "decor.refuse.background", piece, wanted, found: backgroundKey(found) }, x, y);
	}
	for (const cell of variant.cells) {
		const cx = x + cell[0];
		const cy = y + cell[1];
		if (!map.inside(cx, cy)) return refuse({ key: "decor.refuse.outside", piece }, x, y);
		const tile = under(cx, cy);
		if (!tile || isVoid(tile)) return refuse({ key: "decor.refuse.outside", piece }, x, y);
		if (board.isExit(cx, cy)) return refuse({ key: "decor.refuse.door", piece }, x, y);
		if (board.occupiedByPiece(cx, cy, ignore)) return refuse({ key: "decor.refuse.blocked", piece }, x, y);
		// A célula sem exigência de fundo: a da peça de parede pede a mesma parede embaixo (o rabo do peixe nas tábuas);
		// a da peça do chão (a mesa, a estante, o miolo da cama) pousa em piso livre.
		if (!snapped && cell[5] === 0) {
			if (wallPiece) {
				const types = tileTypes(tile);
				if (types === undefined || !types.some((t) => variant.types.includes(t))) {
					const wanted = variant.types.filter((_, i) => i < 3).map((t) => backgroundKey(t));
					return refuse(
						{ key: "decor.refuse.background", piece, wanted, found: backgroundKey(types?.[0]) },
						x,
						y,
					);
				}
			} else if (!freeFloor(map, cx, cy)) {
				return refuse({ key: "decor.refuse.blocked", piece }, x, y);
			}
		}
		if (cell[8] === 1 && someoneAt?.(cx, cy)) return refuse({ key: "decor.refuse.player", piece }, x, y);
	}
	return { ok: true, variant: chosen.variant, x, y };
}

// ------------------------------------------------------------------ o que fica salvo

/** Uma peça salva: a peça, a direção, onde o jogador apontou e as cores das partes. */
export interface PlacedDecor {
	item: string;
	form: number;
	ax: number;
	ay: number;
	colors: DecorColors;
}

/** Uma peça móvel da casa (pote, cadeira, baú) que o jogador mudou de lugar no Decorar. */
export interface MovedPiece {
	id: string;
	x: number;
	y: number;
	variant: number;
}

/** A decoração de um mapa no salvo: as peças postas e as móveis mudadas de lugar, em texto. */
export interface DecorMapSave {
	placed: string;
	moved: string;
}

/**
 * A decoração de um jogador no DataStore (`PlayerData.decor`): a versão do formato e, por mapa (o id do Diorama),
 * as peças em texto. Peça: "item forma x y cores", separadas por ";", com as cores de `encodeColors` (o campo
 * some quando a peça está toda na cor original; a versão 1 não tinha esse campo). Peça móvel: "id x y variante".
 * A variante e o canto das postas saem de novo do mapa ao carregar, então um mapa redesenhado não deixa peça em
 * cima de parede: a que não couber mais volta ao inventário.
 */
export interface PlayerDecor {
	v: number;
	maps: Record<string, DecorMapSave>;
}

export function emptyDecor(): PlayerDecor {
	return { v: DECOR_SAVE_VERSION, maps: {} };
}

const isInt = (value: number | undefined): value is number =>
	value !== undefined && value === math.floor(value) && value >= 0 && value < 1024;

export function encodePlaced(list: PlacedDecor[]) {
	return list
		.map((p) => {
			const colors = encodeColors(p.colors);
			return `${p.item} ${p.form} ${p.ax} ${p.ay}` + (colors !== "" ? ` ${colors}` : "");
		})
		.join(";");
}

export function decodePlaced(text: unknown) {
	const list = new Array<PlacedDecor>();
	if (!typeIs(text, "string") || text === "" || text.size() > DECOR_MAX_TEXT) return list;
	for (const entry of text.split(";")) {
		const [id, form, ax, ay, colors] = entry.split(" ") as (string | undefined)[];
		const item = decorItem(id);
		const f = tonumber(form);
		const x = tonumber(ax);
		const y = tonumber(ay);
		if (!item || !isInt(f) || f >= item.forms.size() || !isInt(x) || !isInt(y)) continue;
		if (list.size() < DECOR_MAX_PIECES) {
			list.push({ item: item.id, form: f, ax: x, ay: y, colors: decodeColors(colors, decorParts(item)) });
		}
	}
	return list;
}

export function encodeMoved(list: MovedPiece[]) {
	return list.map((p) => `${p.id} ${p.x} ${p.y} ${p.variant}`).join(";");
}

export function decodeMoved(text: unknown) {
	const list = new Array<MovedPiece>();
	if (!typeIs(text, "string") || text === "" || text.size() > DECOR_MAX_TEXT) return list;
	for (const entry of text.split(";")) {
		const [id, x, y, variant] = entry.split(" ") as (string | undefined)[];
		const cx = tonumber(x);
		const cy = tonumber(y);
		const v = tonumber(variant);
		if (id === undefined || id.size() > 64 || !isInt(cx) || !isInt(cy) || !isInt(v)) continue;
		if (list.size() < DECOR_MAX_PIECES) list.push({ id, x: cx, y: cy, variant: v });
	}
	return list;
}

/** Se a decoração foi salva por uma versão do jogo mais nova que esta: fica como veio e não se decora. */
export function decorIsNewer(decor: PlayerDecor) {
	return decor.v > DECOR_SAVE_VERSION;
}

/**
 * Lê o salvo, jogando fora o que não for do formato (mapa demais, texto grande demais, peça que não existe). As
 * versões de `DECOR_READS` saem na atual (a 1 sem cores: as peças na cor original), e a gravação seguinte já grava
 * a atual. Uma versão mais nova (este servidor ficou no ar depois de uma atualização) fica como veio, texto a
 * texto, para a gravação deste servidor devolvê-la sem perder nada; a casa fica sem decoração até o jogador entrar
 * num servidor novo.
 */
export function sanitizeDecor(value: unknown): PlayerDecor {
	const decor = emptyDecor();
	if (!typeIs(value, "table")) return decor;
	const saved = value as { v?: unknown; maps?: unknown };
	if (!typeIs(saved.v, "number") || !typeIs(saved.maps, "table")) return decor;
	if (saved.v > DECOR_SAVE_VERSION && saved.v === math.floor(saved.v)) {
		const kept: PlayerDecor = { v: saved.v, maps: {} };
		for (const [map, entry] of pairs(saved.maps as Record<string | number, unknown>)) {
			if (!typeIs(map, "string") || !typeIs(entry, "table")) continue;
			const e = entry as { placed?: unknown; moved?: unknown };
			kept.maps[map] = {
				placed: typeIs(e.placed, "string") ? e.placed : "",
				moved: typeIs(e.moved, "string") ? e.moved : "",
			};
		}
		return kept;
	}
	if (!DECOR_READS.has(saved.v)) return decor;
	let count = 0;
	for (const [map, entry] of pairs(saved.maps as Record<string | number, unknown>)) {
		if (!typeIs(map, "string") || map.size() > 64 || !typeIs(entry, "table") || count >= DECOR_MAX_MAPS) continue;
		const e = entry as { placed?: unknown; moved?: unknown };
		decor.maps[map] = { placed: encodePlaced(decodePlaced(e.placed)), moved: encodeMoved(decodeMoved(e.moved)) };
		count++;
	}
	return decor;
}

/** Quantas de cada peça o jogador ainda tem para pôr, contando as postas em todos os mapas salvos. */
export function stockOf(decor: PlayerDecor) {
	const stock = new Map<string, number>();
	for (const id of DECOR_ORDER) stock.set(id, TEST_INVENTORY[id] ?? 0);
	// O salvo de uma versão mais nova não se lê aqui: nada para pôr até o jogador entrar num servidor novo.
	if (decorIsNewer(decor)) {
		for (const id of DECOR_ORDER) stock.set(id, 0);
		return stock;
	}
	for (const [, entry] of pairs(decor.maps)) {
		for (const placed of decodePlaced(entry.placed)) stock.set(placed.item, (stock.get(placed.item) ?? 0) - 1);
	}
	return stock;
}
