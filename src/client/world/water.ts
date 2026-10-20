// A água do exterior que não vem dos tiles do mapa: o mar fundo em volta do mapa (a ilha no meio do mar) e o
// boneco andando na água rasa (a água cobrindo os pés, a onda em volta e o respingo a cada passo). As
// imagens saem de `Aseprite\exterior_teste\juncao\mar_infinito\gerar_mar_infinito.py`, com as peças e as
// cores da junção. Sem o id de uma imagem, vale o que dá com a folha da junção já enviada (o mar parado, a água
// sobre os pés sem a onda nem o respingo) e o Output avisa uma vez.
import { ASSET_LISTS, ASSETS } from "shared/assets";
import { EXTERIOR_SHEETS } from "shared/interiors";
import { FEET } from "./graalArt";

const TILE_PX = 16;

/**
 * `mar_infinito_q0.png` a `_q3.png` (512 × 512 cada): o mar fundo da junção, que repete sem costura, um quadro
 * por imagem, com os decalques do mar fundo no quadro de mesmo número. Um quadro por imagem porque o
 * `ScaleType.Tile` do Roblox não repete um recorte: com `ImageRectSize`, ele estica o recorte na imagem toda
 * (conferido no Studio em 2026-10-18). Os ids vêm do registro (mar.infinito.0 a 3; o quadro 3 é igual ao 1, o
 * mesmo arquivo e o mesmo id).
 */
export const SEA_SHEETS = ASSET_LISTS["mar.infinito"];
const SEA_TILE = 512;
/** Sem a folha do mar: a base do mar fundo da junção (linha 36 da `folha_juncao.png`, uma cor só), esticada. */
const DEEP_BASE = new Vector2(0, 36 * TILE_PX);

/**
 * `agua_rasa_boneco.png` (128 × 56), em células de 32 × 14 com a sola na última linha e o pé no meio: linha 0 a
 * volta de trás da onda (4 quadros), 1 a água da frente com a volta da frente (4), 2 e 3 o respingo do pé
 * esquerdo e do direito (3 cada). O id no registro (agua.rasa_boneco).
 */
export const WADE_SHEET = ASSETS["agua.rasa_boneco"];
export const WADE_CELL = new Vector2(32, 14);
/** O canto da célula na tela do boneco (48 × 48): o meio sobre o pé, a última linha na sola. */
export const WADE_AT = new Vector2(FEET.X - WADE_CELL.X / 2, FEET.Y + 1 - WADE_CELL.Y);
export const WADE_FRAMES = 4;
export const SPLASH_FRAMES = 3;
/** Quadros por segundo do respingo: os 3 cabem nos 0,2 s de um passo (`WALK_STEP_PX` × 4 a 160 pixels por segundo). */
export const SPLASH_FPS = 15;
/** Linhas da folha: a volta de trás, a água da frente, o respingo esquerdo e o direito. */
export const enum WadeRow {
	Back = 0,
	Front = 1,
	SplashLeft = 2,
	SplashRight = 3,
}

/** Sem a folha: a base do mar raso da junção (linha 37, uma cor só), esticada sobre os pés. */
const SHALLOW_BASE = new Vector2(0, 37 * TILE_PX);
/** A faixa de água sem a folha, na tela do boneco: 28 × 6 pixels, da linha 42 até a sola. */
export const WADE_BAND_AT = new Vector2(FEET.X - 14, FEET.Y - 5);
export const WADE_BAND = new Vector2(28, 6);

const warned = new Set<string>();

function warnOnce(key: string, text: string) {
	if (warned.has(key)) return;
	warned.add(key);
	warn(text);
}

/**
 * O mar fundo em volta do mapa: uma imagem por quadro, do tamanho do canvas do chão, com a imagem de 512 × 512
 * repetida (`ScaleType.Tile`, sem recorte); trocar de quadro é mostrar outra. Fica por baixo de tudo no canvas;
 * o mapa cobre o meio. Pega o tom do dia sozinho (está na pasta `World`).
 */
export function createSea(parent: Instance, zIndex: number) {
	const label = (name: string) => {
		const image = new Instance("ImageLabel");
		image.Name = name;
		image.BackgroundTransparency = 1;
		image.Size = UDim2.fromScale(1, 1);
		image.ResampleMode = Enum.ResamplerMode.Pixelated;
		image.ZIndex = zIndex;
		return image;
	};

	const animated = SEA_SHEETS.every((id) => id !== "");
	const labels = new Array<ImageLabel>();
	if (animated) {
		SEA_SHEETS.forEach((id, frame) => {
			const image = label(`Sea${frame}`);
			image.Image = id;
			image.ScaleType = Enum.ScaleType.Tile;
			image.TileSize = UDim2.fromOffset(SEA_TILE, SEA_TILE);
			image.Visible = frame === 0;
			image.Parent = parent;
			labels.push(image);
		});
	} else {
		warnOnce(
			"sea",
			"[Água] mar_infinito_q0..3.png ainda sem id (mar.infinito em assets/registro.json): o mar de fora fica parado",
		);
		// A base do mar fundo tem uma cor só: esticar o recorte de 16 × 16 dá os mesmos pixels que repeti-lo.
		const image = label("Sea");
		image.Image = EXTERIOR_SHEETS[0] ?? "";
		image.ImageRectOffset = DEEP_BASE;
		image.ImageRectSize = new Vector2(TILE_PX, TILE_PX);
		image.Parent = parent;
		labels.push(image);
	}

	let shown = 0;
	return {
		labels,
		animate(tick: number) {
			if (!animated) return;
			const frame = tick % labels.size();
			if (frame === shown) return;
			labels[shown].Visible = false;
			labels[frame].Visible = true;
			shown = frame;
		},
	};
}

/** Se a folha da água rasa tem id; sem ela, só a faixa de água sobre os pés. */
export function hasWadeSheet() {
	if (WADE_SHEET === "") {
		warnOnce(
			"wade",
			"[Água] agua_rasa_boneco.png ainda sem id (agua.rasa_boneco em assets/registro.json): sem a onda e o respingo",
		);
	}
	return WADE_SHEET !== "";
}

/** A imagem e o recorte de uma célula da folha da água rasa; sem a folha, a base do mar raso da junção. */
export function wadeImage(row: WadeRow, frame: number): [string, Vector2, Vector2] {
	if (WADE_SHEET === "") {
		return [EXTERIOR_SHEETS[0] ?? "", SHALLOW_BASE, new Vector2(TILE_PX, TILE_PX)];
	}
	return [WADE_SHEET, new Vector2(frame * WADE_CELL.X, row * WADE_CELL.Y), WADE_CELL];
}
