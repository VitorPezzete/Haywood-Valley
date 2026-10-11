// Projeção do mundo: vista de cima em 3/4. A câmera olha para o norte (−Z), bem de cima, então a
// direita da tela é +X e a grade do chão fica alinhada com a tela. As medidas de arte são em pixels
// do sprite, antes do zoom.

/**
 * Pixels de arte por stud. O mundo é pequeno de propósito: com poucos studs na tela, a câmera
 * pode ficar perto e ainda assim quase sem perspectiva.
 */
export const ART_PX_PER_STUD = 32;
/**
 * Inclinação da câmera acima do horizonte. Não chega a 90°: os objetos em pé são cartões de frente
 * para a câmera, ordenados pela distância até ela, e vistos a prumo ficariam todos à mesma distância.
 * A 70°, andar para cima na tela é só 6% mais lento do que andar para o lado.
 */
export const CAMERA_PITCH = math.rad(70);
/**
 * Distância máxima da câmera. Na qualidade gráfica mínima o Roblox deixa de desenhar o que está
 * além de uns 300 a 400 studs (medido no Studio em 2026-10-08), então a câmera fica abaixo disso.
 */
export const CAMERA_MAX_DISTANCE = 280;
/** Menor campo de visão que o Roblox aceita. */
export const CAMERA_MIN_FOV = 1;
/** Altura da tela, em pixels de arte, que a câmera tenta mostrar; o zoom é sempre inteiro. */
export const TARGET_VIEW_HEIGHT = 270;

const SIN_PITCH = math.sin(CAMERA_PITCH);
const COS_PITCH = math.cos(CAMERA_PITCH);

/** Direita da tela, no mundo. */
export const SCREEN_RIGHT = Vector3.xAxis;
/** Direção do chão que aponta para a câmera: é o "para baixo" da tela. */
export const TOWARD_CAMERA = Vector3.zAxis;
/** Para cima da tela, no mundo. */
export const SCREEN_UP = new Vector3(0, COS_PITCH, 0).sub(TOWARD_CAMERA.mul(SIN_PITCH));
/** Direção em que a câmera olha. */
export const LOOK = TOWARD_CAMERA.mul(-COS_PITCH).sub(new Vector3(0, SIN_PITCH, 0));

/** Studs de chão, na direção da câmera, que valem um pixel de arte na vertical da tela. */
export const GROUND_STUDS_PER_PX = 1 / (ART_PX_PER_STUD * SIN_PITCH);

/** Lado da célula do chão na tela, em pixels de arte: ela é um quadrado. */
export const CELL_PX = 32;
/** Largura da célula no chão, em studs. */
export const CELL_WIDTH = CELL_PX / ART_PX_PER_STUD;
/** Fundo da célula no chão, em studs. É maior que a largura para compensar a inclinação da câmera. */
export const CELL_DEPTH = CELL_PX * GROUND_STUDS_PER_PX;

/** Centro da célula (i, j) no chão: i cresce para a direita da tela e j para baixo. */
export function cellToWorld(i: number, j: number) {
	return new Vector3(i * CELL_WIDTH, 0, j * CELL_DEPTH);
}

/** Deslocamento no chão que move um ponto (px, py) pixels de arte na tela: x para a direita, y para baixo. */
export function groundOffset(px: number, py: number) {
	return SCREEN_RIGHT.mul(px / ART_PX_PER_STUD).add(TOWARD_CAMERA.mul(py * GROUND_STUDS_PER_PX));
}

/** Posição de um ponto do chão na tela, em pixels de arte a partir da origem do mundo. */
export function worldToArtPx(position: Vector3) {
	return new Vector2(
		position.Dot(SCREEN_RIGHT) * ART_PX_PER_STUD,
		position.Dot(TOWARD_CAMERA) / GROUND_STUDS_PER_PX,
	);
}

/** Leva um ponto do chão ao pixel de arte mais próximo, para o que se move não ficar entre dois pixels. */
export function snapToArtPx(position: Vector3) {
	const px = worldToArtPx(position);
	return groundOffset(math.round(px.X), math.round(px.Y));
}
