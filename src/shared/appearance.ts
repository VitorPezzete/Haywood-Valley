// Aparência do personagem. O cliente monta um visual (`Look`) na tela de personalizar; o servidor
// confere e guarda como atributo do jogador, que chega a todos os clientes.

import { fitsGender, Gender, Graal, MAX_CLOTHS, MAX_DETAILS } from "./graal";
import { DEFAULT_PIECE_STYLE, LEGACY_PIECE_STYLE, PIECE_STYLES, PieceStyle } from "./pieceStyle";

/** Valores de uma cor 0xRRGGBB. */
const RGB_COUNT = 0x1000000;
/** Cor guardada como -1: a parte fica com a cor com que foi desenhada. */
export const ORIGINAL = -1;

/** A cor de um valor 0xRRGGBB. */
export function colorOfRgb(rgb: number) {
	return Color3.fromRGB((rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff);
}

/** Os três canais de um valor 0xRRGGBB, de 0 a 255. */
export function channelsOfRgb(rgb: number): [number, number, number] {
	return [(rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff];
}

/** O valor 0xRRGGBB de três canais de 0 a 255. */
export function rgbOfChannels(r: number, g: number, b: number) {
	return (
		(math.clamp(math.round(r), 0, 255) << 16) +
		(math.clamp(math.round(g), 0, 255) << 8) +
		math.clamp(math.round(b), 0, 255)
	);
}

/**
 * O visual de um personagem, montado com as cabeças e os corpos dos contribuidores (`Graal`). Cada
 * cor é 0xRRGGBB ou `ORIGINAL` (-1), a cor com que a parte foi desenhada.
 */
export interface Look {
	gender: number;
	head: number;
	body: number;
	skinRgb: number;
	hairRgb: number;
	eyesRgb: number;
	detail0Rgb: number;
	detail1Rgb: number;
	detail2Rgb: number;
	cloth0Rgb: number;
	cloth1Rgb: number;
	cloth2Rgb: number;
	cloth3Rgb: number;
	cloth4Rgb: number;
	cloth5Rgb: number;
	headStyle: PieceStyle;
	bodyStyle: PieceStyle;
}

export type ClothKey = "cloth0Rgb" | "cloth1Rgb" | "cloth2Rgb" | "cloth3Rgb" | "cloth4Rgb" | "cloth5Rgb";
export type DetailKey = "detail0Rgb" | "detail1Rgb" | "detail2Rgb";
export type ColorKey = "skinRgb" | "hairRgb" | "eyesRgb" | DetailKey | ClothKey;

/** A chave da parte `index` da roupa. */
export const CLOTH_KEYS: ReadonlyArray<ClothKey> = [
	"cloth0Rgb",
	"cloth1Rgb",
	"cloth2Rgb",
	"cloth3Rgb",
	"cloth4Rgb",
	"cloth5Rgb",
];
assert(CLOTH_KEYS.size() === MAX_CLOTHS);
/** A chave do enfeite `index` da cabeça. */
export const DETAIL_KEYS: ReadonlyArray<DetailKey> = ["detail0Rgb", "detail1Rgb", "detail2Rgb"];
assert(DETAIL_KEYS.size() === MAX_DETAILS);

/**
 * Cada escolha e quantos valores ela aceita, a partir do menor. A ordem é a do texto guardado no
 * atributo.
 */
const FIELDS: { key: keyof Look; min: number; count: () => number }[] = [
	{ key: "gender", min: 0, count: () => 2 },
	{ key: "head", min: 0, count: () => Graal.heads.size() },
	{ key: "body", min: 0, count: () => Graal.bodies.size() },
	{ key: "skinRgb", min: ORIGINAL, count: () => RGB_COUNT + 1 },
	{ key: "hairRgb", min: ORIGINAL, count: () => RGB_COUNT + 1 },
	{ key: "eyesRgb", min: ORIGINAL, count: () => RGB_COUNT + 1 },
	...DETAIL_KEYS.map((key) => ({ key, min: ORIGINAL, count: () => RGB_COUNT + 1 })),
	...CLOTH_KEYS.map((key) => ({ key, min: ORIGINAL, count: () => RGB_COUNT + 1 })),
	{ key: "headStyle", min: 0, count: () => PIECE_STYLES },
	{ key: "bodyStyle", min: 0, count: () => PIECE_STYLES },
];
/** Quantos valores tinha o texto antes dos estilos. */
const FIELDS_BEFORE_STYLES = FIELDS.size() - 2;

/** O visual com que todo jogador começa: masculino, a cabeça e o corpo padrão, tudo nas cores originais. */
export const DEFAULT_LOOK: Look = {
	gender: 0,
	head: Graal.defaultHead[0],
	body: Graal.defaultBody[0],
	skinRgb: ORIGINAL,
	hairRgb: ORIGINAL,
	eyesRgb: ORIGINAL,
	detail0Rgb: ORIGINAL,
	detail1Rgb: ORIGINAL,
	detail2Rgb: ORIGINAL,
	cloth0Rgb: ORIGINAL,
	cloth1Rgb: ORIGINAL,
	cloth2Rgb: ORIGINAL,
	cloth3Rgb: ORIGINAL,
	cloth4Rgb: ORIGINAL,
	cloth5Rgb: ORIGINAL,
	headStyle: DEFAULT_PIECE_STYLE,
	bodyStyle: DEFAULT_PIECE_STYLE,
};

/** A cabeça do visual, no estilo escolhido para ela. */
export function lookHead(look: Look) {
	return Graal.head(look.head, look.headStyle);
}

/** O corpo do visual, no estilo escolhido para ele. */
export function lookBody(look: Look) {
	return Graal.body(look.body, look.bodyStyle);
}

/**
 * O mesmo visual com a cabeça ou o corpo em outro estilo. As cores escolhidas ficam; as que estão na
 * original passam a ser as do estilo novo.
 */
export function withStyle(look: Look, piece: "head" | "body", style: PieceStyle): Look {
	return piece === "head" ? { ...look, headStyle: style } : { ...look, bodyStyle: style };
}

/** O mesmo visual com outro corpo: as partes da roupa são outras, então voltam à cor original. */
export function withBody(look: Look, body: number): Look {
	const changed = { ...look, body };
	for (const key of CLOTH_KEYS) changed[key] = ORIGINAL;
	return changed;
}

/** O mesmo visual com outra cabeça: os enfeites são outros, então voltam à cor original. */
export function withHead(look: Look, head: number): Look {
	const changed = { ...look, head };
	if (head !== look.head) {
		for (const key of DETAIL_KEYS) changed[key] = ORIGINAL;
	}
	return changed;
}

/**
 * A cabeça escolhida na grade: vem com o cabelo, os olhos e os enfeites que o artista pintou, e a pele do
 * boneco continua (decisão do usuário em 2026-10-17). A grade mostra cada cabeça assim.
 */
export function withPickedHead(look: Look, head: number): Look {
	const changed = withHead(look, head);
	changed.hairRgb = ORIGINAL;
	changed.eyesRgb = ORIGINAL;
	for (const key of DETAIL_KEYS) changed[key] = ORIGINAL;
	return changed;
}

/** O gênero do visual. */
export function lookGender(look: Look): Gender {
	return look.gender === 1 ? 1 : 0;
}

/**
 * O mesmo visual com outro gênero. Cabeça e corpo que não servem ao gênero novo trocam pelos padrão
 * dele; as cores escolhidas ficam.
 */
export function withGender(look: Look, gender: Gender): Look {
	let changed: Look = { ...look, gender };
	const head = Graal.heads[look.head];
	if (!head || !fitsGender(head, gender)) changed = withHead(changed, Graal.defaultHead[gender]);
	const body = Graal.bodies[look.body];
	if (!body || !fitsGender(body, gender)) changed = withBody(changed, Graal.defaultBody[gender]);
	return changed;
}

/**
 * A cor original de uma parte no visual, no estilo da peça. A pele vem da cabeça, se ela tem pele, senão
 * do corpo: pintando as duas com ela, cabeça e corpo ficam com o mesmo tom.
 */
export function originalRgb(look: Look, key: ColorKey): number | undefined {
	const head = lookHead(look);
	const body = lookBody(look);
	if (key === "skinRgb") return head?.skin ?? body?.skin;
	if (key === "hairRgb") return head?.hair;
	if (key === "eyesRgb") return head?.eyes;
	const detail = DETAIL_KEYS.indexOf(key as DetailKey);
	if (detail >= 0) return head?.details[detail];
	return body?.cloths[CLOTH_KEYS.indexOf(key as ClothKey)];
}

/** A cor que pinta a parte `key`: a escolhida ou a original. `undefined` se a peça não tem a parte. */
export function partRgb(look: Look, key: ColorKey) {
	const original = originalRgb(look, key);
	if (original === undefined) return undefined;
	return look[key] === ORIGINAL ? original : look[key];
}

/** Atributo do `Player` com o visual, no formato de `encodeLook`. */
export const LOOK_ATTRIBUTE = "Look";
/** Limite do texto de um visual: bem acima do maior que `encodeLook` produz. */
const MAX_LOOK_TEXT = FIELDS.size() * 9 + 16;

/** O visual como texto: os valores na ordem de `FIELDS`, separados por vírgula. */
export function encodeLook(look: Look) {
	return FIELDS.map((field) => tostring(look[field.key])).join(",");
}

/**
 * Lê o texto de `encodeLook`. Devolve `undefined` se faltar valor ou se algum não existir. O texto de
 * antes dos estilos (sem os dois últimos valores) vale, com as peças no estilo do Aeko.
 */
export function parseLook(text: unknown): Look | undefined {
	if (!typeIs(text, "string")) return undefined;
	// O texto vem do cliente: conferir o tamanho antes de dividir.
	if (text.size() > MAX_LOOK_TEXT) return undefined;
	const parts = text.split(",");
	if (parts.size() !== FIELDS.size() && parts.size() !== FIELDS_BEFORE_STYLES) return undefined;

	const look: Look = { ...DEFAULT_LOOK, headStyle: LEGACY_PIECE_STYLE, bodyStyle: LEGACY_PIECE_STYLE };
	for (let index = 0; index < parts.size(); index++) {
		const field = FIELDS[index];
		const value = tonumber(parts[index]);
		if (value === undefined || value !== math.floor(value)) return undefined;
		if (value < field.min || value >= field.min + field.count()) return undefined;
		(look as unknown as Record<keyof Look, number>)[field.key] = value;
	}
	return look;
}
