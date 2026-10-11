// Gerado por tools/cozy_atlas.py (pasta Aseprite) a partir do Cozy People Asset Pack, de shubibubi.
// Não editar à mão: rodar o script de novo.

export interface WardrobePiece {
	id: string;
	/** Nome na tela de personalizar. */
	name: string;
	/** Primeiro bloco da peça nas folhas; cada cor pronta ocupa o bloco seguinte. */
	block: number;
	/** Quantas cores prontas a peça tem. As que o jogo tinge têm uma só. */
	variants: number;
	/** Cobre tronco e pernas: não se usa parte de baixo junto. */
	full?: boolean;
	/** Já vem com o sapato. */
	shoes?: boolean;
	/** É saia: o cabelo comprido troca para a versão que cai por cima dela. */
	skirt?: boolean;
	/** Bloco do mesmo cabelo desenhado para saia ou vestido. */
	skirtBlock?: number;
	/** Bloco de uma camada a mais da peça (os laços das tranças). */
	extraBlock?: number;
}

/** Lado do quadro do personagem, em pixels de arte. */
export const FRAME = 32;
/** Quadros do andar em cada direção; o primeiro serve de parado. */
export const WALK_FRAMES = 8;
/** Cada bloco tem o andar inteiro de uma peça: 8 quadros por 4 direções. */
export const BLOCK_SIZE = new Vector2(256, 128);
/** Blocos por linha de uma folha, blocos por folha e número de folhas. */
export const ATLAS_COLUMNS = 4;
export const BLOCKS_PER_ATLAS = 32;
export const ATLAS_COUNT = 7;

export const Wardrobe = {
	body: { id: "body", name: "Corpo", block: 0, variants: 1 } as WardrobePiece,
	eyes: { id: "eyes", name: "Olhos", block: 1, variants: 1 } as WardrobePiece,
	blush: { id: "blush", name: "Blush", block: 2, variants: 1 } as WardrobePiece,
	lipstick: { id: "lipstick", name: "Batom", block: 3, variants: 1 } as WardrobePiece,
	beard: { id: "beard", name: "Barba", block: 4, variants: 1 } as WardrobePiece,
	shoes: { id: "shoes", name: "Sapato", block: 21, variants: 10 } as WardrobePiece,
	hair: [
		{ id: "bob", name: "Chanel", block: 5, variants: 1 },
		{ id: "braids", name: "Tranças", block: 6, variants: 1, extraBlock: 7 },
		{ id: "buzzcut", name: "Raspado", block: 8, variants: 1 },
		{ id: "curly", name: "Cacheado", block: 9, variants: 1 },
		{ id: "emo", name: "Franja de lado", block: 10, variants: 1 },
		{ id: "extra_long", name: "Muito comprido", block: 11, variants: 1, skirtBlock: 12 },
		{ id: "frenchcurl", name: "Cachos", block: 13, variants: 1 },
		{ id: "gentleman", name: "Cavalheiro", block: 14, variants: 1 },
		{ id: "long_straight", name: "Liso comprido", block: 15, variants: 1, skirtBlock: 16 },
		{ id: "midiwave", name: "Ondulado médio", block: 17, variants: 1 },
		{ id: "ponytail", name: "Rabo de cavalo", block: 18, variants: 1 },
		{ id: "spacebuns", name: "Dois coques", block: 19, variants: 1 },
		{ id: "wavy", name: "Ondulado", block: 20, variants: 1 },
	] as WardrobePiece[],
	top: [
		{ id: "basic", name: "Camiseta", block: 31, variants: 10 },
		{ id: "stripe", name: "Listrada", block: 41, variants: 10 },
		{ id: "floral", name: "Florida", block: 51, variants: 10 },
		{ id: "sporty", name: "Esportiva", block: 61, variants: 10 },
		{ id: "skull", name: "Caveira", block: 71, variants: 10 },
		{ id: "sailor", name: "Marinheiro", block: 81, variants: 10 },
		{ id: "sailor_bow", name: "Marinheiro com laço", block: 91, variants: 10 },
		{ id: "overalls", name: "Jardineira", block: 101, variants: 10 },
		{ id: "suit", name: "Terno", block: 111, variants: 10 },
		{ id: "spaghetti", name: "Regata", block: 121, variants: 10 },
		{ id: "dress", name: "Vestido", block: 131, variants: 10, full: true },
		{ id: "clown", name: "Palhaço", block: 141, variants: 2, full: true, shoes: true },
		{ id: "pumpkin", name: "Abóbora", block: 143, variants: 2, full: true, shoes: true },
		{ id: "spooky", name: "Assombrado", block: 145, variants: 1, full: true, shoes: true },
		{ id: "witch", name: "Bruxa", block: 146, variants: 1, full: true, shoes: true },
	] as WardrobePiece[],
	bottom: [
		{ id: "pants", name: "Calça", block: 147, variants: 10 },
		{ id: "skirt", name: "Saia", block: 157, variants: 10, skirt: true },
		{ id: "pants_suit", name: "Calça social", block: 167, variants: 10 },
	] as WardrobePiece[],
	glasses: [
		{ id: "glasses", name: "Óculos", block: 177, variants: 10 },
		{ id: "glasses_sun", name: "Óculos escuros", block: 187, variants: 10 },
	] as WardrobePiece[],
	hat: [
		{ id: "hat_cowboy", name: "Chapéu de vaqueiro", block: 197, variants: 1 },
		{ id: "hat_lucky", name: "Chapéu da sorte", block: 198, variants: 1 },
		{ id: "hat_pumpkin", name: "Chapéu de abóbora", block: 199, variants: 1 },
		{ id: "hat_pumpkin_purple", name: "Abóbora roxa", block: 200, variants: 1 },
		{ id: "hat_witch", name: "Chapéu de bruxa", block: 201, variants: 1 },
	] as WardrobePiece[],
	mask: [
		{ id: "mask_clown_blue", name: "Palhaço azul", block: 202, variants: 1 },
		{ id: "mask_clown_red", name: "Palhaço vermelho", block: 203, variants: 1 },
		{ id: "mask_spooky", name: "Assombrada", block: 204, variants: 1 },
	] as WardrobePiece[],
	earring: [
		{ id: "earring_emerald", name: "Esmeralda", block: 205, variants: 1 },
		{ id: "earring_emerald_silver", name: "Esmeralda e prata", block: 206, variants: 1 },
		{ id: "earring_red", name: "Rubi", block: 207, variants: 1 },
		{ id: "earring_red_silver", name: "Rubi e prata", block: 208, variants: 1 },
	] as WardrobePiece[],
};
