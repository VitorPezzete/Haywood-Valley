// Gerado por tools/recortes.py --montar a partir de diorama/recortes/recortes.json (a etapa G do Diorama) e
// de src/shared/decorCatalog.ts. Não editar: rodar o comando de novo (docs/diorama/RECORTES.md).
// As peças do Decorar recortadas do fundo, na folha montada assets/recortes/recortes_<n>.png (chave
// recortes.<n> do registro): a base (a peça inteira nas cores originais, com 1 pixel de folga em volta) e
// uma máscara em cinza por parte pintável, do mesmo tamanho, que a cena pinta com `ImageColor3`.

/** [x, y, largura, altura] em pixels na folha montada. */
export type RecorteRect = readonly [x: number, y: number, w: number, h: number];

export interface Recorte {
	/** O id da peça recortada em diorama/recortes/recortes.json. */
	id: string;
	/** A folha montada: o n da chave recortes.<n>. */
	sheet: number;
	base: RecorteRect;
	/** A máscara de cada parte pintável, na ordem das cores. */
	parts: readonly RecorteRect[];
	/** A cor original (o tom de referência da máscara) de cada parte, 0xRRGGBB. */
	colors: readonly number[];
}

export interface DecorRecorte {
	/** Quantas partes pintáveis a peça tem (o maior número entre as direções). */
	parts: number;
	/** Por direção e variante do catálogo do Decorar, o índice em RECORTES; -1, sem recorte (vão os tiles). */
	forms: readonly (readonly number[])[];
}

/** Os pixels de folga em volta da área: o canto do recorte fica 1 pixel acima e à esquerda da célula. */
export const RECORTE_FOLGA = 1;

export const RECORTES: readonly Recorte[] = [
	{ id: "chair", sheet: 0, base: [0, 338, 34, 34], parts: [[35, 338, 34, 34]], colors: [0xaa6d3c] },
	{ id: "casa9", sheet: 0, base: [70, 338, 18, 34], parts: [[89, 338, 18, 34]], colors: [0xb66d42] },
	{ id: "casa11", sheet: 0, base: [108, 338, 18, 34], parts: [[127, 338, 18, 34]], colors: [0xb66d42] },
	{ id: "table", sheet: 0, base: [588, 99, 50, 66], parts: [[639, 99, 50, 66]], colors: [0xe0e0e0] },
	{ id: "pot", sheet: 0, base: [338, 303, 34, 34], parts: [[373, 303, 34, 34], [408, 303, 34, 34]], colors: [0x8c5b4a, 0xbc9185] },
	{ id: "casa43", sheet: 0, base: [443, 303, 34, 34], parts: [[478, 303, 34, 34], [513, 303, 34, 34]], colors: [0x8c5b4a, 0xbc9185] },
	{ id: "picture", sheet: 0, base: [0, 217, 50, 50], parts: [[51, 217, 50, 50], [102, 217, 50, 50], [153, 217, 50, 50], [204, 217, 50, 50], [255, 217, 50, 50], [306, 217, 50, 50]], colors: [0x7f4230, 0x6daa73, 0xf8aa6c, 0xe08b55, 0xb76820, 0xa4d6b7] },
	{ id: "window", sheet: 0, base: [567, 217, 50, 50], parts: [[618, 217, 50, 50], [669, 217, 50, 50]], colors: [0xe08b55, 0xfdffff] },
	{ id: "casa@62,24", sheet: 0, base: [720, 217, 50, 50], parts: [[771, 217, 50, 50], [822, 217, 50, 50]], colors: [0xe08b55, 0xfdffff] },
	{ id: "shelf", sheet: 0, base: [524, 268, 66, 34], parts: [[591, 268, 66, 34], [658, 268, 66, 34], [725, 268, 66, 34], [792, 268, 66, 34]], colors: [0xaa553c, 0x2cacb0, 0x69d470, 0x9d5500] },
	{ id: "bed", sheet: 0, base: [402, 0, 66, 98], parts: [[469, 0, 66, 98], [536, 0, 66, 98], [603, 0, 66, 98], [670, 0, 66, 98]], colors: [0xb06da3, 0xc45b43, 0xfdffff, 0xe08b55] },
	{ id: "lamp", sheet: 0, base: [695, 338, 18, 18], parts: [[714, 338, 18, 18]], colors: [0xfdffff] },
];

export const DECOR_RECORTES: Readonly<Record<string, DecorRecorte>> = {
	chair: { parts: 1, forms: [[0, 0, 0], [1], [2]] },
	table: { parts: 1, forms: [[3]] },
	pot: { parts: 2, forms: [[4, 5]] },
	picture: { parts: 6, forms: [[6]] },
	window: { parts: 2, forms: [[7, 8]] },
	shelf: { parts: 4, forms: [[9]] },
	bed: { parts: 4, forms: [[10]] },
	lamp: { parts: 1, forms: [[11]] },
};
