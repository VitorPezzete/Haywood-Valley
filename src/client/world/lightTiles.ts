// Que tiles das folhas do Aeko acendem uma luz e que janelas têm versão de noite. As regiões são as do
// catálogo do Diorama (plugin/src/generated/catalogoPecas_*.ts, gerado do `mapa_folhas.json` do guia do
// Aeko), que o jogo não importa: o id de cada peça vai no comentário. Só tiles oficiais, inteiros e sem
// mudar nenhum pixel: a janela de noite é outra região da mesma folha.

import type { InteriorTile } from "shared/interiors/types";

/** Os halos da folha de luzes (`Aseprite\iluminacao\folha_luzes.png`). */
export type LightKind = "lareira" | "tocha" | "abajur" | "janela_noite" | "janela_lua";

export interface LightTile {
	sheet: string;
	area: [c0: number, l0: number, c1: number, l1: number];
	col?: number;
	kind: LightKind;
	center: [x: number, y: number];
	floor?: boolean;
	nightOnly?: boolean;
	hangs?: boolean;
}

/**
 * As luzes, pelos tiles que as mostram. O fogo azul do braseiro (`castelo@12,0`) fica sem halo: as faixas são
 * de fogo laranja.
 *
 * A lareira com chaminé da casa (`casa@56,25`) não tem quadro de fogo na folha do Aeko: o `[2,0-3]` da zona
 * animada é o rabo do gato dormindo no piso (conferido na folha em 2026-10-18; o guia só diz que o fogo e o
 * gato usam a mesma rampa de laranja). A pedido do usuário, ela acende só pelo halo, na boca da fornalha.
 */
export const LIGHT_TILES: LightTile[] = [
	{ sheet: "casa", area: [1, 0, 1, 3], kind: "tocha", center: [8, 10], floor: true },
	{ sheet: "casa", area: [64, 31, 64, 31], kind: "abajur", center: [8, 10], floor: true },
	{ sheet: "castelo", area: [8, 0, 9, 3], col: 8, kind: "tocha", center: [16, 8], floor: true },
	{ sheet: "castelo", area: [10, 0, 11, 3], col: 10, kind: "lareira", center: [16, 8] },
	{ sheet: "casa", area: [58, 31, 58, 31], kind: "lareira", center: [8, 8] },
	{ sheet: "casa", area: [64, 28, 64, 28], kind: "tocha", center: [8, 4] },
	{
		sheet: "castelo",
		area: [56, 31, 56, 31],
		kind: "janela_noite",
		center: [8, 16],
		nightOnly: true,
		hangs: true,
	},
];

/**
 * As fontes de luz, que ficam na cor cheia à noite, sem o tom do dia (pedido do usuário em 2026-10-18): só o
 * fogo, a lâmpada e o vidro aceso; a parede em volta escurece com o resto. [folha, c0, l0, c1, l1].
 */
const SOURCE_TILES: [sheet: string, c0: number, l0: number, c1: number, l1: number][] = [
	["casa", 1, 0, 1, 3],
	["casa", 64, 31, 64, 31],
	["castelo", 8, 0, 13, 3],
	["castelo", 55, 29, 57, 31],
];

/** Se o tile é uma fonte de luz (fogo, lâmpada, vidro aceso), que não recebe o tom do dia. */
export function isLightSource(tile: InteriorTile) {
	const [sheet, col, row] = tile;
	for (const [s, c0, l0, c1, l1] of SOURCE_TILES) {
		if (s === sheet && col >= c0 && col <= c1 && row >= l0 && row <= l1) return true;
	}
	return false;
}

/** A luz que o tile acende, ou nada. */
export function lightOf(tile: InteriorTile): LightTile | undefined {
	const [sheet, col, row] = tile;
	for (const light of LIGHT_TILES) {
		const [c0, l0, c1, l1] = light.area;
		if (
			light.sheet === sheet &&
			col >= c0 &&
			col <= c1 &&
			row >= l0 &&
			row <= l1 &&
			(light.col === undefined || light.col === col)
		) {
			return light;
		}
	}
	return undefined;
}

/**
 * As janelas da casa com versão de noite na folha (casa, colunas 78 a 84): a região de dia e a de noite,
 * do mesmo tamanho e com o mesmo desenho em volta. Os tiles de noite também são reconhecidos: a casa de
 * teste usa o canto de cima da cortina verde de noite ([81,22]), igual pixel a pixel ao de dia ([44,28]).
 * A janela com vaso de flor no parapeito (`casa@55,25`, que troca [44,26-27]) não tem versão de noite e
 * fica como está.
 */
const WINDOWS: { day: [col: number, row: number]; night: [col: number, row: number]; size: [w: number, h: number] }[] =
	[
		{ day: [40, 25], night: [78, 19], size: [3, 3] },
		{ day: [62, 24], night: [78, 22], size: [3, 3] },
		{ day: [43, 25], night: [81, 19], size: [4, 3] },
		{ day: [44, 28], night: [81, 22], size: [4, 3] },
	];
const WINDOW_SHEET = "casa";

/** O recorte do vidro de noite de cada janela de `WINDOWS`, na mesma ordem (`folha_luzes_v2.png`). */
export const WINDOW_GLASS = [
	"vidro_simples_azul",
	"vidro_simples_amarelo",
	"vidro_cortina_vermelha",
	"vidro_cortina_verde",
] as const;

/** O canto de cima da região de noite da janela do grupo, na folha da casa. */
export function windowNightOrigin(group: number) {
	return WINDOWS[group].night;
}

/** Uma célula de janela: o grupo (as do mesmo grupo se juntam numa imagem só) e o tile de dia e de noite. */
export interface WindowCell {
	group: number;
	day: InteriorTile;
	night: InteriorTile;
}

/** O tile de janela com as duas versões, ou nada se o tile não é de janela. */
export function windowOf(tile: InteriorTile): WindowCell | undefined {
	const [sheet, col, row] = tile;
	if (sheet !== WINDOW_SHEET) return undefined;
	for (let group = 0; group < WINDOWS.size(); group++) {
		const { day, night, size } = WINDOWS[group];
		for (const [from, other, isDay] of [
			[day, night, true],
			[night, day, false],
		] as const) {
			const dc = col - from[0];
			const dl = row - from[1];
			if (dc < 0 || dl < 0 || dc >= size[0] || dl >= size[1]) continue;
			const mine: InteriorTile = [sheet, col, row];
			const theirs: InteriorTile = [sheet, other[0] + dc, other[1] + dl];
			return { group, day: isDay ? mine : theirs, night: isDay ? theirs : mine };
		}
	}
	return undefined;
}
