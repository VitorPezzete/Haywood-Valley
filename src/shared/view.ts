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
 * para a câmera, ordenados pela profundidade, e vistos a prumo ficariam todos à mesma profundidade.
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

// Altura da tela, em pixels de arte, nos zooms da câmera, como no Graal (pedido do usuário em 2026-10-17):
// o padrão mostra uns 540 (34 tiles de 16) numa tela de 1080, e o jogador aproxima e afasta com a roda do
// mouse ou a pinça. O zoom é sempre inteiro. A interface não muda com ele (`ui/kit.tsx`, palco de 480×270).
/** O mais perto: a vista de antes, 270 de altura. */
export const CLOSEST_VIEW_HEIGHT = 270;
/** O padrão. */
export const DEFAULT_VIEW_HEIGHT = 540;
/**
 * O mais longe: uns 768 de altura, o Graal no iPad (2048×1536 em zoom 2, 64×48 tiles). Aceita até 10% a
 * mais, para uma tela de 779 ainda chegar ao zoom 1.
 */
export const FARTHEST_VIEW_HEIGHT = 768;
const FARTHEST_SLACK = 1.1;

const SCREEN_DENSITIES = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 3];

/**
 * Quantos pixels físicos vale um pixel do `ViewportSize`. No Studio com a escala de tela do Windows em
 * 125%, o ViewportSize vem em pixels lógicos (1530,4 × 779,2 para 1913 × 974 físicos, medido em
 * 2026-10-17), e um zoom inteiro nele não é inteiro na tela: o pixel de arte fica com 2 e 3 pixels
 * físicos, alternados, e abre fresta entre as imagens. O Roblox não informa a escala, mas ela aparece no
 * tamanho fracionário: é a menor das escalas comuns que deixa a largura e a altura inteiras. Com o tamanho
 * inteiro, vale 1 (numa escala de 150% com o tamanho lógico inteiro, não dá para saber).
 */
export function screenDensity(viewport: Vector2) {
	for (const density of SCREEN_DENSITIES) {
		const x = viewport.X * density;
		const y = viewport.Y * density;
		if (math.abs(x - math.round(x)) < 0.01 && math.abs(y - math.round(y)) < 0.01) return density;
	}
	return 1;
}

/** O zoom inteiro cuja altura de vista fica mais perto de `viewHeight`, pela razão (não pela diferença). */
function nearestZoom(viewportHeight: number, viewHeight: number) {
	const exact = viewportHeight / viewHeight;
	const low = math.max(1, math.floor(exact));
	const high = low + 1;
	return exact * exact >= low * high ? high : low;
}

/**
 * Os zooms do mundo numa tela de `viewportHeight` pixels físicos de altura (`screenDensity`): quantos
 * pixels físicos vale um pixel de arte, sempre inteiro. `closest` é o maior, a vista de antes (270 de altura); `farthest` o menor que
 * ainda mostra no máximo uns 768 (numa tela de 1080 é o mesmo do padrão, porque o zoom 1 mostraria 1080);
 * `standard`, o padrão, o que fica mais perto de 540.
 */
export function zoomRange(viewportHeight: number) {
	const closest = math.max(1, math.round(viewportHeight / CLOSEST_VIEW_HEIGHT));
	const farthest = math.min(closest, math.max(1, math.ceil(viewportHeight / (FARTHEST_VIEW_HEIGHT * FARTHEST_SLACK))));
	const standard = math.clamp(nearestZoom(viewportHeight, DEFAULT_VIEW_HEIGHT), farthest, closest);
	return { closest, standard, farthest };
}

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

/**
 * O que se vê não fica na profundidade de verdade. Com o chão inclinado a 70°, a perspectiva deixava o
 * topo da tela menor que a base: no zoom 3 de uma tela de 779, o pixel de arte do chão media 2,968
 * pixels da tela no topo e 3,031 embaixo (medido no Studio em 2026-10-17), e de tempos em tempos uma
 * fileira de pixels dobrava ou sumia. A câmera não pode ir mais longe (`CAMERA_MAX_DISTANCE`).
 *
 * Então a profundidade (ao longo da linha de visão) de tudo o que é desenhado, o chão e os cartões, é
 * multiplicada por este número (`toView`). O lugar na tela não muda: só se anda ao longo da linha de
 * visão. O chão fica quase de frente para a câmera, e a diferença de tamanho do pixel na tela inteira caiu
 * de 2,1% para 0,02% a 0,05% (medido no Studio em 2026-10-17, nos zooms 2 e 4): o erro somado fica abaixo
 * de meio pixel da tela, então nenhum pixel dobra. A ordem dos cartões continua certa, porque o Roblox
 * ordena os SurfaceGuis pela profundidade, não pela distância em linha reta (medido no Studio no mesmo
 * dia), e um pixel de arte de chão ainda vale 0,0001 stud de profundidade, acima da precisão do float.
 *
 * O que é físico (o personagem do Roblox, os bloqueios, o piso) fica onde está; só o desenho anda. A
 * câmera olha para o desenho, então uma parte física longe da origem fica a outra distância dela: com o
 * jogador a mais de uns 800 studs ao sul da origem, a parte física fica atrás da câmera. Nada no jogo
 * depende disso hoje (não há BillboardGui, ProximityPrompt, raio da câmera nem som 3D); quem vier a
 * depender tem de usar a posição desenhada (`toView`) ou mudar a referência por região.
 */
export const VIEW_DEPTH_SCALE = 0.01;

/** Onde um ponto do mundo é desenhado: o mesmo lugar na tela, com a profundidade comprimida. */
export function toView(position: Vector3) {
	return position.sub(LOOK.mul(position.Dot(LOOK) * (1 - VIEW_DEPTH_SCALE)));
}

/** Profundidade, no desenho, de um pixel de arte de chão em direção à câmera: para trazer um cartão para a frente. */
export const VIEW_DEPTH_PER_PX = GROUND_STUDS_PER_PX * COS_PITCH * VIEW_DEPTH_SCALE;

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
