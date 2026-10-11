import { worldToArtPx } from "shared/view";
import { Sprite } from "./sprites";

/** Quadros por segundo do ciclo de vento. */
const WIND_FPS = 4;
/** Distância na tela, em pixels de arte, entre duas rajadas: o vento atravessa o mapa em onda. */
const GUST_LENGTH = 220;

interface Swaying {
	image: ImageLabel;
	sprite: Sprite;
	/** Atraso, em quadros, de acordo com o lugar do objeto no mapa. */
	delay: number;
	shown: number;
}

/** Troca os quadros de tudo o que balança ao vento. */
export class Wind {
	private swaying = new Array<Swaying>();

	/** Registra um sprite de vários quadros; os de um quadro só são ignorados. */
	add(image: ImageLabel, sprite: Sprite, position: Vector3) {
		if (sprite.frames.size() < 2) return;
		const px = worldToArtPx(position);
		const delay = ((px.X + px.Y * 2) / GUST_LENGTH) * sprite.frames.size();
		this.swaying.push({ image, sprite, delay, shown: 0 });
	}

	update(clock: number) {
		const step = clock * WIND_FPS;
		for (const item of this.swaying) {
			const count = item.sprite.frames.size();
			const frame = math.floor(step + item.delay) % count;
			if (frame === item.shown) continue;
			item.shown = frame;
			item.image.ImageRectOffset = item.sprite.frames[frame];
		}
	}
}
