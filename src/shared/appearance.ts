// Aparência do personagem. O cliente monta um visual (`Look`) na tela de personalizar; o servidor
// confere e guarda como atributo do jogador, que chega a todos os clientes.

import { Faces } from "./faces";
import { Wardrobe } from "./wardrobe";

function palette(hexes: string[]) {
	return hexes.map((hex) => Color3.fromHex(hex));
}

/** 8 colunas por 4 linhas, na ordem em que aparecem na tela de personalizar. */
export const HAIR_COLORS = palette([
	"141414", "2E2C2C", "40200E", "522E1A", "66381E", "7A4A2A", "86603A", "C09B7C",
	"B89A64", "DECA92", "F6EEC8", "E4BA82", "CC7C46", "D0642C", "A2482A", "822C2A",
	"FFFFFF", "C6C6D0", "70707A", "B03C54", "76325A", "38366A", "005C5A", "B88014",
	"F04440", "FF5CA8", "FFB8DC", "8660C4", "2C60D8", "8CC8FF", "B4FF64", "F6FA5E",
]);

export const SKIN_COLORS = palette([
	"FFFFFF", "FCEEDE", "F6DCC6", "FCD0AC", "F0A068", "DAA274", "D09462", "C48654",
	"B67A4A", "AA6C42", "9A5E3A", "8C5232", "7C482C", "6C3C26", "5C3020", "4C261C",
	"DC3040", "FF445C", "BC1C44", "FF6830", "FF8C48", "FFDC50", "FFFF64", "64FF6C",
	"A4FF78", "74E4FF", "3C8CFF", "2450D8", "C490FF", "8850E0", "FCA0DC", "FC5CB8",
]);

/** As cores de olho, de blush e de batom do pacote de personagem, na ordem dele. */
export const EYE_COLORS = palette([
	"362F2D", "354652", "546E8A", "4D3530", "2E2723", "754B44", "475C4E",
	"24382D", "637D64", "544B4E", "6E656A", "B04F63", "C26576", "A64444",
]);
export const BLUSH_COLORS = palette(["D9776A", "FA7069", "FA8C73", "C25151", "873D3C"]);
export const LIP_COLORS = palette(["CC6464", "AD4C44", "BD5C57", "963B3B", "6E2721"]);
/** Cor dos laços das tranças. */
export const TIE_COLOR = Color3.fromHex("E85060");

export const PALETTE_COLUMNS = 8;

/**
 * O visual de um personagem: um número por escolha. Nas peças opcionais 0 é "sem" e os demais
 * apontam para `Wardrobe[...][valor - 1]`; nas obrigatórias o valor é o próprio índice.
 */
export interface Look {
	skin: number;
	/** Cor dos olhos. */
	eyes: number;
	/** Formato dos olhos: índice em `Faces.eyes`. */
	eyeStyle: number;
	/** Boca em repouso: índice em `Faces.mouths`. */
	mouth: number;
	/** 0 é careca. */
	hair: number;
	hairColor: number;
	top: number;
	topColor: number;
	bottom: number;
	bottomColor: number;
	/** 0 é descalço; os demais são a cor do sapato. */
	shoes: number;
	beard: number;
	glasses: number;
	glassesColor: number;
	hat: number;
	mask: number;
	earring: number;
	blush: number;
	lipstick: number;
}

/**
 * Cada escolha e quantos valores ela aceita. A ordem importa: é a do texto guardado no atributo,
 * e a cor de uma peça vem depois da peça, porque depende dela.
 */
const FIELDS: { key: keyof Look; count: (look: Look) => number }[] = [
	{ key: "skin", count: () => SKIN_COLORS.size() },
	{ key: "eyes", count: () => EYE_COLORS.size() },
	{ key: "eyeStyle", count: () => Faces.eyes.size() },
	{ key: "mouth", count: () => Faces.mouths.size() },
	{ key: "hair", count: () => Wardrobe.hair.size() + 1 },
	{ key: "hairColor", count: () => HAIR_COLORS.size() },
	{ key: "top", count: () => Wardrobe.top.size() },
	{ key: "topColor", count: (look) => Wardrobe.top[look.top].variants },
	{ key: "bottom", count: () => Wardrobe.bottom.size() },
	{ key: "bottomColor", count: (look) => Wardrobe.bottom[look.bottom].variants },
	{ key: "shoes", count: () => Wardrobe.shoes.variants + 1 },
	{ key: "beard", count: () => 2 },
	{ key: "glasses", count: () => Wardrobe.glasses.size() + 1 },
	{ key: "glassesColor", count: (look) => (look.glasses > 0 ? Wardrobe.glasses[look.glasses - 1].variants : 1) },
	{ key: "hat", count: () => Wardrobe.hat.size() + 1 },
	{ key: "mask", count: () => Wardrobe.mask.size() + 1 },
	{ key: "earring", count: () => Wardrobe.earring.size() + 1 },
	{ key: "blush", count: () => BLUSH_COLORS.size() + 1 },
	{ key: "lipstick", count: () => LIP_COLORS.size() + 1 },
];

/** Quantos valores a escolha `key` aceita no visual dado. */
export function lookCount(key: keyof Look, look: Look) {
	for (const field of FIELDS) {
		if (field.key === key) return field.count(look);
	}
	return 0;
}

/** O visual com que todo jogador começa: cabelo chanel castanho, camiseta azul, calça marrom e sapato. */
export const DEFAULT_LOOK: Look = {
	skin: 4,
	eyes: 0,
	eyeStyle: Faces.defaultEyes,
	mouth: Faces.defaultMouth,
	hair: 1,
	hairColor: 7,
	top: 0,
	topColor: 1,
	bottom: 0,
	bottomColor: 3,
	shoes: 4,
	beard: 0,
	glasses: 0,
	glassesColor: 0,
	hat: 0,
	mask: 0,
	earring: 0,
	blush: 0,
	lipstick: 0,
};

/** Atributo do `Player` com o visual, no formato de `encodeLook`. */
export const LOOK_ATTRIBUTE = "Look";
/** Limite do texto de um visual: bem acima do maior que `encodeLook` produz. */
const MAX_LOOK_TEXT = FIELDS.size() * 4;

/** Traz para dentro do que existe as cores que dependem de uma peça (depois de trocar a peça). */
export function clampLook(look: Look): Look {
	const result = { ...look };
	for (const field of FIELDS) {
		result[field.key] = math.clamp(result[field.key], 0, field.count(result) - 1);
	}
	return result;
}

/** O visual como texto: os valores na ordem de `FIELDS`, separados por vírgula. */
export function encodeLook(look: Look) {
	return FIELDS.map((field) => tostring(look[field.key])).join(",");
}

/** Lê o texto de `encodeLook`. Devolve `undefined` se faltar valor ou se algum não existir. */
export function parseLook(text: unknown): Look | undefined {
	if (!typeIs(text, "string")) return undefined;
	// O texto vem do cliente: conferir o tamanho antes de dividir.
	if (text.size() > MAX_LOOK_TEXT) return undefined;
	const parts = text.split(",");
	if (parts.size() !== FIELDS.size()) return undefined;

	const look = { ...DEFAULT_LOOK };
	for (let index = 0; index < FIELDS.size(); index++) {
		const field = FIELDS[index];
		const value = tonumber(parts[index]);
		if (value === undefined || value !== math.floor(value)) return undefined;
		if (value < 0 || value >= field.count(look)) return undefined;
		look[field.key] = value;
	}
	return look;
}
