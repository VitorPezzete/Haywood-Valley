import { worldToArtPx } from "shared/view";
import { FEET, FIGURE } from "./graalArt";
import { Sprite } from "./sprites";

/** Da sola dos pés até a borda de baixo do cartão do personagem. */
const FEET_TO_BOTTOM = FIGURE.Y - FEET.Y;

/** Transparência de um objeto quando o jogador está atrás dele. */
const FADED = 0.55;
/** Quanto da diferença some por segundo: a troca leva uns 0,3 s. */
const FADE_RATE = 10;

// Corpo do personagem na tela, em pixels de arte a partir dos pés.
const BODY_HALF_WIDTH = 10;
const BODY_TOP = 40;
const BODY_BOTTOM = 2;

// Árvore dentro do recorte: copa em cima, tronco estreito embaixo.
const CANOPY_HEIGHT = 0.62;
const CANOPY_INSET = 0.08;
const TRUNK_HALF_WIDTH = 0.1;
// Objeto baixo e cheio (arbusto, plantação): o recorte inteiro, menos uma margem.
const BLOCK_INSET = 0.12;

/** Silhueta aproximada do objeto, usada para saber se ele cobre o jogador. */
export type Silhouette = "tree" | "block";

interface Box {
	min: Vector2;
	max: Vector2;
}

interface Occluder {
	/** As imagens do objeto: uma só, ou várias quando o cartão é montado de tiles (a tampa do baú grande). */
	images: ImageLabel[];
	/**
	 * Borda de baixo do cartão na tela. É ela que decide a ordem de desenho (ver card.ts), então o
	 * objeto só cobre o jogador quando a dele está abaixo da do personagem.
	 */
	bottomY: number;
	boxes: Box[];
	alpha: number;
}

function overlaps(box: Box, min: Vector2, max: Vector2) {
	return box.min.X < max.X && box.max.X > min.X && box.min.Y < max.Y && box.max.Y > min.Y;
}

function boxesOf(silhouette: Silhouette, corner: Vector2, base: Vector2, size: Vector2): Box[] {
	const { X: w, Y: h } = size;
	if (silhouette === "block") {
		return [{ min: corner.add(new Vector2(w * BLOCK_INSET, 0)), max: corner.add(new Vector2(w * (1 - BLOCK_INSET), h)) }];
	}
	const split = corner.Y + h * CANOPY_HEIGHT;
	return [
		{ min: new Vector2(corner.X + w * CANOPY_INSET, corner.Y), max: new Vector2(corner.X + w * (1 - CANOPY_INSET), split) },
		{ min: new Vector2(base.X - w * TRUNK_HALF_WIDTH, split), max: new Vector2(base.X + w * TRUNK_HALF_WIDTH, corner.Y + h) },
	];
}

/**
 * Deixa meio transparente o objeto que está cobrindo o jogador. Só vale para o que a cena registra
 * aqui: o que é alto ou cheio o bastante para esconder o personagem. Pedra e enfeite nunca somem.
 */
export class Occlusion {
	private occluders = new Array<Occluder>();

	/**
	 * Registra o objeto e devolve a função que tira o registro, para o que some antes da cena (a tampa do baú
	 * grande, que fecha). O que fica a cena inteira pode ignorar o retorno.
	 */
	add(image: ImageLabel | ImageLabel[], sprite: Sprite, position: Vector3, silhouette: Silhouette) {
		const base = worldToArtPx(position);
		const item: Occluder = {
			images: typeIs(image, "Instance") ? [image] : image,
			bottomY: base.Y + sprite.size.Y - sprite.anchor.Y,
			alpha: 0,
			boxes: boxesOf(silhouette, base.sub(sprite.anchor), base, sprite.size),
		};
		this.occluders.push(item);
		return () => {
			const index = this.occluders.indexOf(item);
			if (index >= 0) this.occluders.remove(index);
		};
	}

	/** `player` é o ponto do chão onde o jogador está, ou `undefined` se ele não tem personagem. */
	update(player: Vector3 | undefined, dt: number) {
		const feet = player ? worldToArtPx(player) : undefined;
		const bodyMin = feet?.add(new Vector2(-BODY_HALF_WIDTH, -BODY_TOP));
		const bodyMax = feet?.add(new Vector2(BODY_HALF_WIDTH, -BODY_BOTTOM));
		const blend = math.min(1, dt * FADE_RATE);

		for (const item of this.occluders) {
			let target = 0;
			if (feet && bodyMin && bodyMax && item.bottomY > feet.Y + FEET_TO_BOTTOM) {
				for (const box of item.boxes) {
					if (overlaps(box, bodyMin, bodyMax)) {
						target = FADED;
						break;
					}
				}
			}
			const gap = target - item.alpha;
			if (gap === 0) continue;
			item.alpha = math.abs(gap) < 0.01 ? target : item.alpha + gap * blend;
			for (const image of item.images) image.ImageTransparency = item.alpha;
		}
	}
}
