// Gerado por tools/mundo_mapa.py (`npm run mundo:jogo`) a partir do plano do mundo; não editar à mão.
// Os objetos do mundo (diorama/catalogo/mundo.json, `objetos`): onde cada recorte fica na folha.
// A folha (`mundo.objetos.<n>` no registro) sai de `python -I tools/mundo_mapa.py objetos`; sem o id, o jogo desenha
// o lugar marcado (worldMap.ts). Pixels de arte; o pé é o ponto da imagem que fica no ponto do chão do objeto.

export const WORLD_OBJECT_SHEET = "mundo.objetos";
export const WORLD_OBJECT_SHEETS = 1;

/** Forma: 0 cartão (em pé), 1 deitado (no canvas fixo). Oculta: 0 nada, 1 árvore, 2 cheio (occlusion.ts). */
export const WORLD_OBJECTS: Record<
	string,
	[sheet: number, x: number, y: number, w: number, h: number, ax: number, ay: number, form: number, hides: number]
> = {
	arbusto: [0, 1000, 252, 16, 16, 8, 16, 0, 0],
	arvore_grande: [0, 954, 0, 64, 80, 32, 80, 0, 1],
	arvore_pequena: [0, 512, 174, 31, 32, 15, 32, 0, 0],
	arvore_pequena_rosa: [0, 721, 196, 31, 32, 15, 32, 0, 0],
	banco_madeira: [0, 966, 252, 32, 16, 16, 16, 0, 0],
	banco_pedra: [0, 966, 234, 48, 16, 24, 16, 0, 0],
	bebedouro: [0, 966, 214, 37, 18, 18, 18, 0, 0],
	canteiro_flores_rosa: [0, 816, 196, 80, 24, 40, 24, 1, 0],
	canteiro_potes: [0, 388, 174, 88, 48, 44, 48, 0, 0],
	casa_azul: [0, 758, 0, 96, 96, 48, 96, 0, 0],
	casa_azul_grande: [0, 546, 0, 96, 144, 48, 144, 0, 0],
	casa_azul_media: [0, 856, 0, 96, 96, 48, 96, 0, 0],
	casa_madeira: [0, 758, 98, 96, 96, 48, 96, 0, 0],
	casa_vermelha: [0, 856, 98, 96, 96, 48, 96, 0, 0],
	casa_vermelha_loja: [0, 644, 114, 96, 80, 48, 80, 0, 0],
	cata_vento_praca: [0, 612, 146, 25, 53, 12, 53, 0, 2],
	flores_brancas: [0, 666, 263, 15, 15, 7, 15, 1, 0],
	galpao_madeira: [0, 954, 82, 61, 68, 30, 68, 0, 0],
	lago_anel: [0, 52, 0, 188, 218, 94, 218, 1, 0],
	mata_bloco: [0, 242, 0, 302, 172, 151, 172, 0, 2],
	moita_cruz: [0, 954, 152, 58, 60, 29, 60, 0, 2],
	moita_grande: [0, 546, 146, 64, 64, 32, 64, 0, 2],
	morro: [0, 644, 0, 112, 112, 56, 112, 1, 0],
	pedra_leve: [0, 648, 263, 16, 15, 8, 15, 0, 0],
	placa: [0, 630, 263, 16, 16, 8, 16, 0, 0],
	poco_madeira: [0, 786, 196, 28, 30, 14, 30, 0, 0],
	poco_pedra: [0, 754, 196, 30, 32, 15, 32, 0, 0],
	ponte_madeira: [0, 242, 174, 144, 79, 72, 79, 1, 0],
	portal_madeira: [0, 639, 196, 80, 40, 40, 40, 0, 2],
	toco: [0, 478, 174, 32, 32, 16, 32, 0, 0],
};

/** Uma tira (a peça de sebe ou cerca repetida): folha, canto, largura e altura da tira, o passo e o lado da peça. */
export type WorldStrip = [sheet: number, x: number, y: number, w: number, h: number, step: number, piece: number];

/** Sebes, muros e cercas: linha (um lado) ou contorno (os quatro, com o vão no meio de baixo), deitados. */
export const WORLD_LINES: Record<string, { outline: boolean; gap: number; h?: WorldStrip; v?: WorldStrip }> = {
	cerca: { outline: true, gap: 0, h: [0, 52, 263, 576, 16, 64, 64], v: [0, 0, 0, 32, 576, 44, 48] },
	cerca_h: { outline: false, gap: 0, h: [0, 52, 263, 576, 16, 64, 64] },
	cerca_v: { outline: false, gap: 0, v: [0, 0, 0, 32, 576, 44, 48] },
	muro_h: { outline: false, gap: 0, h: [0, 388, 238, 576, 23, 32, 32] },
	muro_v: { outline: false, gap: 0, v: [0, 34, 0, 16, 572, 30, 32] },
	sebe_h: { outline: false, gap: 0, h: [0, 388, 238, 576, 23, 32, 32] },
	sebe_lote: { outline: true, gap: 5, h: [0, 388, 238, 576, 23, 32, 32], v: [0, 34, 0, 16, 572, 30, 32] },
	sebe_v: { outline: false, gap: 0, v: [0, 34, 0, 16, 572, 30, 32] },
};
