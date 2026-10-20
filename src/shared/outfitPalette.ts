// Cores de roupa que combinam com o personagem: a partir da cor do cabelo e da pele, cada corpo recebe
// uma paleta diferente (pedido do usuário em 2026-10-17: a grade de corpos já mostra as roupas
// combinando, cada uma de um jeito, e o corpo escolhido vem com essas cores).
import { CLOTH_KEYS, colorOfRgb, Look, ORIGINAL, partRgb, rgbOfChannels } from "./appearance";
import { Graal } from "./graal";

/**
 * Esquemas de cor, em voltas do círculo de matizes a partir da matiz de base: a primeira entrada pinta
 * a parte maior da roupa, as outras os detalhes. O esquema muda de corpo para corpo.
 */
const SCHEMES: readonly (readonly number[])[] = [
	[0.5, 0.42, 0.58],
	[0.08, -0.08, 0.5],
	[0.33, 0.67, 0],
	[0, 0, 0],
	[0.45, 0.55, 0.15],
	[0.17, 0.83, 0.5],
];
/** Claridade de cada parte no esquema de uma cor só, para as partes não saírem iguais. */
const MONO_VALUES = [0.55, 0.85, 0.35];
/** Parte quase sem cor (branco, cinza, preto) fica como o artista pintou: meia, sapato, contorno. */
const NEUTRAL_SATURATION = 0.15;
/** Cabelo quase sem cor (preto, branco, cinza) não dá matiz; aí a base sai da pele. */
const GRAY_HAIR = 0.12;

function hsvOf(rgb: number) {
	const [h, s, v] = colorOfRgb(rgb).ToHSV();
	return { h, s, v };
}

function rgbOfHsv(h: number, s: number, v: number) {
	const color = Color3.fromHSV(((h % 1) + 1) % 1, math.clamp(s, 0, 1), math.clamp(v, 0, 1));
	return rgbOfChannels(color.R * 255, color.G * 255, color.B * 255);
}

/** Distância de matiz, em voltas (0 a 0,5). */
function hueGap(a: number, b: number) {
	const d = math.abs(a - b) % 1;
	return math.min(d, 1 - d);
}

/**
 * As cores das partes da roupa do corpo `body` combinando com o cabelo e a pele do visual: uma por
 * parte, na ordem cloth0, cloth1..., ou `ORIGINAL` nas partes neutras. Cada corpo usa um esquema.
 */
export function outfitColors(look: Look, body: number): number[] {
	// As cores que o artista pintou, no estilo do corpo no visual: as partes neutras são outras em cada um.
	const piece = Graal.body(body, look.bodyStyle);
	if (!piece) return [];
	const hair = hsvOf(partRgb(look, "hairRgb") ?? 0x6a4030);
	const skin = hsvOf(partRgb(look, "skinRgb") ?? 0xffd0b0);
	const scheme = SCHEMES[body % SCHEMES.size()];
	// Uma pequena variação por corpo, para dois corpos com o mesmo esquema não saírem iguais.
	const jitter = ((body * 37) % 11) / 110 - 0.05;
	const baseHue = (hair.s < GRAY_HAIR ? skin.h + 0.5 + (body % 5) * 0.13 : hair.h) + jitter;
	const saturation = math.clamp(math.max(hair.s, 0.3) * 0.8 + 0.2, 0.4, 0.8);
	const colors: number[] = [];
	let painted = 0;
	piece.cloths.forEach((original) => {
		const drawn = hsvOf(original);
		if (drawn.s < NEUTRAL_SATURATION) {
			colors.push(ORIGINAL);
			return;
		}
		const slot = painted % scheme.size();
		let hue = baseHue + scheme[slot];
		let value = scheme === SCHEMES[3] ? MONO_VALUES[slot] : slot === 0 ? 0.7 : 0.85;
		// Roupa da cor da pele parece pele à mostra: afasta a matiz ou a claridade.
		if (hueGap(hue, skin.h) < 0.06 && math.abs(value - skin.v) < 0.2) {
			hue += 0.12;
			value = skin.v > 0.6 ? value - 0.25 : value + 0.2;
		}
		colors.push(rgbOfHsv(hue, slot === 0 ? saturation : saturation * 0.9, value));
		painted++;
	});
	// Corpo todo neutro (terno cinza, roupa preta): pinta pelo menos a parte maior.
	if (painted === 0 && colors.size() > 0) {
		colors[0] = rgbOfHsv(baseHue + scheme[0], saturation * 0.6, 0.55);
	}
	return colors;
}

/** O visual com as partes da roupa pintadas por `outfitColors`. */
export function withOutfitPalette(look: Look, body: number): Look {
	const changed = { ...look };
	const colors = outfitColors(look, body);
	CLOTH_KEYS.forEach((key, index) => {
		changed[key] = colors[index] ?? ORIGINAL;
	});
	return changed;
}
