export interface Piece {
	image: string;
	/** Recorte dentro da folha, em pixels. */
	offset: Vector2;
	size: Vector2;
}

// Folha ui_atlas.png, gerada por draw_ui.lua (pasta Aseprite).
// As linhas de `UiArt` são a saída desse script: colar de novo sempre que a folha mudar.
const UI_ATLAS = "rbxassetid://78421265144619";

function piece(x: number, y: number, w: number, h: number): Piece {
	return { image: UI_ATLAS, offset: new Vector2(x, y), size: new Vector2(w, h) };
}

export const UiArt = {
	cloud1: piece(2, 2, 143, 50),
	cloud2: piece(147, 2, 127, 37),
	cloud3: piece(276, 2, 76, 29),
	parchment: piece(354, 2, 24, 24),
	clay: piece(380, 2, 24, 24),
	well: piece(406, 2, 16, 16),
	card: piece(424, 2, 24, 24),
	woodBar: piece(450, 2, 24, 18),
	woodGrain: piece(2, 54, 96, 16),
	purpleBar: piece(100, 54, 16, 16),
	purpleDiamonds: piece(118, 54, 54, 16),
	slot: piece(174, 54, 20, 20),
	slotSelected: piece(196, 54, 22, 22),
	swatch: piece(220, 54, 20, 20),
	pill: piece(242, 54, 24, 18),
	keycap: piece(268, 54, 14, 14),
	hintBack: piece(284, 54, 16, 16),
	ring: piece(302, 54, 26, 26),
	ringSelected: piece(330, 54, 26, 26),
	dot: piece(358, 54, 20, 20),
	ribbon: piece(380, 54, 30, 16),
	cursorHand: piece(412, 54, 18, 12),
	glow: piece(2, 82, 95, 95),
};

/** Borda que não estica numa peça fatiada em 9, em pixels da folha. */
export interface Border {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

function border(left: number, top: number, right: number, bottom: number): Border {
	return { left, top, right, bottom };
}

export const Slice = {
	parchment: border(6, 6, 6, 6),
	clay: border(6, 6, 6, 6),
	well: border(4, 4, 4, 4),
	card: border(6, 6, 6, 6),
	woodBar: border(6, 6, 6, 4),
	purpleBar: border(4, 4, 4, 2),
	slot: border(4, 4, 4, 4),
	slotSelected: border(6, 6, 6, 6),
	swatch: border(4, 4, 4, 4),
	pill: border(9, 8, 9, 8),
	keycap: border(4, 4, 4, 5),
	hintBack: border(6, 6, 6, 6),
	ribbon: border(12, 4, 4, 4),
};

/** Logo do jogo na escala de pixel da tela de título (ui_logo_small.png). */
export const LOGO = { image: "rbxassetid://92437185188163", size: new Vector2(244, 98) };

/**
 * Ilustração da tela de título (draw_title.lua), em camadas do mesmo tamanho: o vale ao fundo e,
 * por cima das nuvens, o morro com o fazendeiro deitado.
 */
export const TITLE = {
	size: new Vector2(480, 270),
	back: "rbxassetid://98658523377109",
	front: "rbxassetid://111426932233822",
};

// Folha title_clouds.png, montada por tools/title_pack.py; as linhas abaixo são a saída dele.
const TITLE_CLOUD_SHEET = "rbxassetid://131236085603721";

function cloud(x: number, y: number, w: number, h: number): Piece {
	return { image: TITLE_CLOUD_SHEET, offset: new Vector2(x, y), size: new Vector2(w, h) };
}

const TitleClouds = {
	cloud1: cloud(2, 2, 232, 111),
	cloud2: cloud(236, 2, 160, 80),
	cloud3: cloud(398, 2, 111, 54),
};

/**
 * Nuvens que passam na tela de título. `y` é a altura na cena, `speed` a velocidade em pixels de
 * arte por segundo e `start` a posição inicial da borda direita da nuvem.
 */
export const TITLE_CLOUDS: { piece: Piece; y: number; speed: number; start: number }[] = [
	{ piece: TitleClouds.cloud1, y: 150, speed: 4, start: 522 },
	{ piece: TitleClouds.cloud2, y: 76, speed: 3, start: 130 },
	{ piece: TitleClouds.cloud3, y: 58, speed: 2, start: 441 },
];
