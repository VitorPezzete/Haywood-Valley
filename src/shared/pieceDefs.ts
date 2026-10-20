// As peças dos interiores que o jogador pode segurar e puxar, empurrar ou levantar e carregar. Só peças
// inteiras e pequenas das folhas do Aeko: cadeira, pote, caixote, baú e barril. Cada uma é uma região do
// catálogo do Diorama (plugin/src/generated/catalogoAeko.ts, o id é o de lá), com a área copiada de lá:
// o jogo não importa do plugin. Peça nova: acrescentar aqui, com a área da região no catálogo.

export type PieceKind = "chair" | "pot" | "crate" | "chest" | "barrel";

export interface PieceDef {
	id: string;
	kind: PieceKind;
	sheet: string;
	col: number;
	row: number;
	w: number;
	h: number;
	blocks: boolean;
	lift: boolean;
	breaks: boolean;
	weight: number;
	family?: string;
	variant?: number;
}

/** Para que lado olha quem senta, na ordem das direções do boneco (`Facing`): 0 cima, 1 esquerda, 2 baixo, 3 direita. */
export type Facing = 0 | 1 | 2 | 3;

export const PIECE_DEFS: PieceDef[] = [
	{
		id: "casa8",
		kind: "chair",
		sheet: "casa",
		col: 0,
		row: 20,
		w: 2,
		h: 2,
		blocks: false,
		lift: false,
		breaks: false,
		weight: 1,
	},
	{
		id: "casa9",
		kind: "chair",
		sheet: "casa",
		col: 2,
		row: 20,
		w: 1,
		h: 2,
		blocks: false,
		lift: false,
		breaks: false,
		weight: 1,
	},
	{
		id: "casa10a",
		kind: "chair",
		sheet: "casa",
		col: 0,
		row: 22,
		w: 2,
		h: 1,
		blocks: false,
		lift: false,
		breaks: false,
		weight: 1,
	},
	{
		id: "casa10b",
		kind: "chair",
		sheet: "casa",
		col: 0,
		row: 23,
		w: 2,
		h: 1,
		blocks: false,
		lift: false,
		breaks: false,
		weight: 1,
	},
	{
		id: "casa11",
		kind: "chair",
		sheet: "casa",
		col: 2,
		row: 22,
		w: 1,
		h: 2,
		blocks: false,
		lift: false,
		breaks: false,
		weight: 1,
	},
	{
		id: "castelo14",
		kind: "chair",
		sheet: "castelo",
		col: 0,
		row: 20,
		w: 2,
		h: 3,
		blocks: false,
		lift: false,
		breaks: false,
		weight: 1,
	},
	{
		id: "casa42",
		kind: "pot",
		sheet: "casa",
		col: 37,
		row: 20,
		w: 2,
		h: 2,
		blocks: true,
		lift: true,
		breaks: true,
		weight: 1,
		family: "pot",
		variant: 0,
	},
	{
		id: "casa43",
		kind: "pot",
		sheet: "casa",
		col: 37,
		row: 22,
		w: 2,
		h: 2,
		blocks: true,
		lift: true,
		breaks: true,
		weight: 1,
		family: "pot",
		variant: 1,
	},
	{
		id: "casa67",
		kind: "crate",
		sheet: "casa",
		col: 54,
		row: 20,
		w: 2,
		h: 1,
		blocks: true,
		lift: true,
		breaks: false,
		weight: 1,
	},
	{
		id: "casa46",
		kind: "chest",
		sheet: "casa",
		col: 45,
		row: 20,
		w: 2,
		h: 2,
		blocks: true,
		lift: false,
		breaks: false,
		weight: 2,
	},
	{
		id: "casa47",
		kind: "chest",
		sheet: "casa",
		col: 45,
		row: 22,
		w: 2,
		h: 2,
		blocks: true,
		lift: false,
		breaks: false,
		weight: 2,
	},
	{
		id: "casa64",
		kind: "chest",
		sheet: "casa",
		col: 47,
		row: 22,
		w: 2,
		h: 2,
		blocks: true,
		lift: false,
		breaks: false,
		weight: 2,
	},
	{
		id: "castelo68",
		kind: "barrel",
		sheet: "castelo",
		col: 61,
		row: 20,
		w: 2,
		h: 3,
		blocks: true,
		lift: false,
		breaks: false,
		weight: 2,
	},
];

/** A peça pelo id do catálogo. */
export function pieceDef(id: string) {
	return PIECE_DEFS.find((def) => def.id === id);
}

/** As versões de uma família, na ordem de `variant`. */
export function familyDefs(family: string) {
	const defs = PIECE_DEFS.filter((def) => def.family === family);
	defs.sort((a, b) => (a.variant ?? 0) < (b.variant ?? 0));
	return defs;
}
