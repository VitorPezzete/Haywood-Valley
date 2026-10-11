import {
	BLUSH_COLORS,
	EYE_COLORS,
	HAIR_COLORS,
	LIP_COLORS,
	Look,
	SKIN_COLORS,
	TIE_COLOR,
} from "shared/appearance";
import {
	BUBBLE_COLUMNS,
	BUBBLE_ORIGIN,
	BUBBLE_SIZE,
	FACE_CELL,
	FACE_ORIGIN,
	FacePose,
	Faces,
	HEAD_BOB,
	Reaction,
	STRIP_COLUMNS,
	STRIP_SIZE,
} from "shared/faces";
import { ATLAS_COLUMNS, BLOCK_SIZE, BLOCKS_PER_ATLAS, FRAME, Wardrobe } from "shared/wardrobe";
import { Facing } from "./sprites";

/**
 * Folhas do personagem (cozy_walk_N.png), montadas por tools/cozy_atlas.py (pasta Aseprite) a partir
 * do Cozy People Asset Pack, de shubibubi. Na ordem do script: o bloco N fica na folha N / 32.
 */
export const CHARACTER_ATLASES = [
	"rbxassetid://72224700908847",
	"rbxassetid://91302890490680",
	"rbxassetid://104407233189312",
	"rbxassetid://76850043365019",
	"rbxassetid://126488856412068",
	"rbxassetid://102644308970701",
	"rbxassetid://97554877478111",
];

/**
 * Folha de rostos (cozy_faces.png), montada por tools/cozy_faces.py: as peças de olhos, bocas e
 * efeitos em tiras e, embaixo, os balões de reação.
 */
export const FACE_SHEET = "";

export const CHARACTER_FRAME = new Vector2(FRAME, FRAME);
/** Sola dos pés dentro do quadro. */
export const CHARACTER_ANCHOR = new Vector2(16, 31);
/** O pacote anima o andar a 100 ms por quadro. */
export const WALK_FPS = 10;
/**
 * O visual mais carregado: corpo, três camadas de olhos, duas de boca, blush, batom, roupa, parte
 * de baixo, sapato, cabelo, laço, barba, brinco, óculos, máscara, chapéu e o efeito da reação.
 */
export const MAX_LAYERS = 19;
/** A cabeça sem cabelo: corpo, olhos, bocas, blush e batom. */
export const MAX_HEAD_LAYERS = 8;

export const BUBBLE_FRAME = new Vector2(BUBBLE_SIZE, BUBBLE_SIZE);

/** Linha de cada direção dentro de um bloco, que vem na ordem frente, costas, direita, esquerda. */
const ROW_OF_FACING = [0, 3, 2, 1];
/** Coluna de cada direção dentro de uma tira de rosto: frente, direita, esquerda. De costas não há rosto. */
const STRIP_COLUMN_OF_FACING = [0, 2, 1, 0];

const WHITE = new Color3(1, 1, 1);
const FACE_RECT = new Vector2(FACE_CELL, FACE_CELL);
const FULL = UDim2.fromScale(1, 1);
const FACE_EXTENT = UDim2.fromScale(FACE_CELL / FRAME, FACE_CELL / FRAME);
const NO_OFFSET = UDim2.fromScale(0, 0);

/** Uma camada do personagem: a folha, o canto do recorte dela e a cor que multiplica a imagem. */
export interface CharacterLayer {
	image: string;
	origin: Vector2;
	color: Color3;
	/**
	 * Peça de rosto: em vez de um bloco com o andar inteiro, uma célula pequena que cobre a cabeça e
	 * acompanha o sobe e desce dela. `origin` é o canto da tira.
	 */
	face?: boolean;
}

/** A camada do bloco `block`, tingida se for uma das peças em cinza. */
export function layerOf(block: number, color = WHITE): CharacterLayer {
	const slot = block % BLOCKS_PER_ATLAS;
	return {
		image: CHARACTER_ATLASES[math.floor(block / BLOCKS_PER_ATLAS)],
		origin: new Vector2((slot % ATLAS_COLUMNS) * BLOCK_SIZE.X, math.floor(slot / ATLAS_COLUMNS) * BLOCK_SIZE.Y),
		color,
	};
}

/** A camada da tira `strip` da folha de rostos. */
function stripOf(strip: number, color = WHITE): CharacterLayer {
	return {
		image: FACE_SHEET,
		origin: new Vector2((strip % STRIP_COLUMNS) * STRIP_SIZE.X, math.floor(strip / STRIP_COLUMNS) * STRIP_SIZE.Y),
		color,
		face: true,
	};
}

/** Canto do quadro `frame` do andar, na direção `facing`, dentro de um bloco. */
export function frameOffset(frame: number, facing: Facing) {
	return new Vector2(frame * FRAME, ROW_OF_FACING[facing] * FRAME);
}

/** Recorte da camada, na folha dela, para o quadro `frame` do andar e a direção `facing`. */
export function layerOffset(layer: CharacterLayer, frame: number, facing: Facing) {
	if (layer.face) return layer.origin.add(new Vector2(STRIP_COLUMN_OF_FACING[facing] * FACE_CELL, 0));
	return layer.origin.add(frameOffset(frame, facing));
}

/** Tamanho do recorte da camada na folha. */
export function layerRect(layer: CharacterLayer) {
	return layer.face ? FACE_RECT : CHARACTER_FRAME;
}

/** Tamanho da camada, em fração do quadro do personagem. */
export function layerExtent(layer: CharacterLayer) {
	return layer.face ? FACE_EXTENT : FULL;
}

/** Lugar da camada dentro do quadro do personagem, em fração dele. O rosto sobe e desce com a cabeça. */
export function layerPosition(layer: CharacterLayer, frame: number) {
	if (!layer.face) return NO_OFFSET;
	return UDim2.fromScale(FACE_ORIGIN.X / FRAME, (FACE_ORIGIN.Y + HEAD_BOB[frame]) / FRAME);
}

/** De costas o rosto não aparece. */
export function layerShows(layer: CharacterLayer, facing: Facing) {
	return !(layer.face === true && facing === Facing.Back);
}

/**
 * A cabeça sem cabelo, de baixo para cima: corpo, olhos, risco da boca, blush, batom e o que da
 * boca fica por cima do batom. `pose` troca os olhos e a boca do visual pelos de uma reação.
 */
export function headLayers(look: Look, pose?: FacePose): CharacterLayer[] {
	const skin = SKIN_COLORS[look.skin];
	const eyes = pose?.eyes !== undefined ? Faces.poseEyes[pose.eyes] : Faces.eyes[look.eyeStyle];
	const mouth = pose?.mouth !== undefined ? Faces.poseMouths[pose.mouth] : Faces.mouths[look.mouth];

	const layers = [layerOf(Wardrobe.body.block, skin)];
	if (eyes.iris !== undefined) layers.push(stripOf(eyes.iris, EYE_COLORS[look.eyes]));
	if (eyes.skin !== undefined) layers.push(stripOf(eyes.skin, skin));
	if (eyes.ink !== undefined) layers.push(stripOf(eyes.ink));
	if (mouth.skin !== undefined) layers.push(stripOf(mouth.skin, skin));
	if (look.blush > 0) layers.push(layerOf(Wardrobe.blush.block, BLUSH_COLORS[look.blush - 1]));
	if (look.lipstick > 0) layers.push(layerOf(Wardrobe.lipstick.block, LIP_COLORS[look.lipstick - 1]));
	if (mouth.ink !== undefined) layers.push(stripOf(mouth.ink));
	return layers;
}

/**
 * As camadas de um visual, de baixo para cima, na ordem do pacote: corpo, rosto, roupa, cabelo e
 * acessórios. Pele, olhos, blush, batom, cabelo e barba são cinza e recebem a cor aqui. O efeito de
 * uma reação (gota de suor, veia de raiva) fica por cima de tudo.
 */
export function lookLayers(look: Look, pose?: FacePose): CharacterLayer[] {
	const hairColor = HAIR_COLORS[look.hairColor];
	const layers = headLayers(look, pose);

	const top = Wardrobe.top[look.top];
	layers.push(layerOf(top.block + look.topColor));
	const bottom = top.full ? undefined : Wardrobe.bottom[look.bottom];
	if (bottom) layers.push(layerOf(bottom.block + look.bottomColor));
	if (look.shoes > 0 && !top.shoes) layers.push(layerOf(Wardrobe.shoes.block + look.shoes - 1));

	if (look.hair > 0) {
		const hair = Wardrobe.hair[look.hair - 1];
		// O cabelo comprido tem um desenho próprio para cair por cima de saia e vestido.
		const overSkirt = top.full === true || bottom?.skirt === true;
		layers.push(layerOf(overSkirt && hair.skirtBlock !== undefined ? hair.skirtBlock : hair.block, hairColor));
		if (hair.extraBlock !== undefined) layers.push(layerOf(hair.extraBlock, TIE_COLOR));
	}
	if (look.beard > 0) layers.push(layerOf(Wardrobe.beard.block, hairColor));
	if (look.earring > 0) layers.push(layerOf(Wardrobe.earring[look.earring - 1].block));
	if (look.glasses > 0) layers.push(layerOf(Wardrobe.glasses[look.glasses - 1].block + look.glassesColor));
	if (look.mask > 0) layers.push(layerOf(Wardrobe.mask[look.mask - 1].block));
	if (look.hat > 0) layers.push(layerOf(Wardrobe.hat[look.hat - 1].block));

	const fx = pose?.fx !== undefined ? Faces.fx[pose.fx].fx : undefined;
	if (fx !== undefined) layers.push(stripOf(fx));
	return layers;
}

/** Os olhos fechados de uma piscada; a boca fica como está. */
export const BLINK_POSE: FacePose = { eyes: Faces.blink };

/** Qual pose da reação vale aos `elapsed` segundos dela. */
export function reactionPoseIndex(reaction: Reaction, elapsed: number) {
	if (reaction.rate <= 0 || reaction.poses.size() < 2) return 0;
	return math.floor(elapsed * reaction.rate) % reaction.poses.size();
}

/** Canto do balão `bubble` na folha de rostos. */
export function bubbleOffset(bubble: number) {
	return BUBBLE_ORIGIN.add(
		new Vector2((bubble % BUBBLE_COLUMNS) * BUBBLE_SIZE, math.floor(bubble / BUBBLE_COLUMNS) * BUBBLE_SIZE),
	);
}
