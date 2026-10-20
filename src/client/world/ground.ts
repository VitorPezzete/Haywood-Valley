import {
	ART_PX_PER_STUD,
	GROUND_STUDS_PER_PX,
	SCREEN_RIGHT,
	TOWARD_CAMERA,
	toView,
	worldToArtPx,
} from "shared/view";
import { CANVAS_ROLE_ATTRIBUTE } from "client/perf";
import { GRASS_TILE, Sprite } from "./sprites";

const THICKNESS = 0.2;
/** O padrão do SurfaceGui é sumir a 1000 studs; a câmera fica longe. */
export const SURFACE_MAX_DISTANCE = 10000;
/**
 * O Roblox desenha os SurfaceGuis do mais distante para o mais próximo, medindo pelo centro de
 * cada um. Sem isto, o chão cobriria todo objeto que está além do centro dele.
 */
const DRAW_FIRST = -100;
/**
 * A camada viva do chão (seção 3.4 do `PLANO_OTIMIZACAO.md`): um segundo canvas no mesmo plano, desenhado logo
 * depois do chão e ainda antes de todo cartão. O Roblox refaz o desenho de um `SurfaceGui` inteiro quando
 * qualquer imagem dentro dele muda; o que se mexe (sombras, tiles animados, halos, peças) fica nela, com poucas
 * imagens, e o canvas grande dos tiles parados não é refeito a cada quadro.
 */
export const LIVE_Z_OFFSET = DRAW_FIRST + 1;
/** O mar de fora, num canvas próprio por baixo do chão: troca de quadro sem refazer o canvas dos tiles. */
export const UNDER_Z_OFFSET = DRAW_FIRST - 1;

/**
 * Camadas do que é desenhado deitado no chão. `Piece`: as peças móveis dos interiores, acima dos tiles.
 * `Light`: os halos das luzes (`lights.ts`), por cima de tudo o que é deitado.
 */
export const GroundLayer = { Grass: 0, Soil: 1, Piece: 2, Shadow: 3, Light: 4 };

export interface Ground {
	part: Part;
	gui: SurfaceGui;
	/** Desenha um sprite deitado no chão, com a âncora sobre o ponto dado. */
	addFlat(sprite: Sprite, position: Vector3, layer: number): ImageLabel;
	/** Leva para outro ponto um sprite criado por `addFlat`. */
	moveFlat(label: ImageLabel, sprite: Sprite, position: Vector3): void;
}

/**
 * O chão visível: um Part alinhado com a tela, com um SurfaceGui cujo canvas é medido em pixels de arte.
 * Ele é o chão de verdade com a profundidade comprimida (`toView`): fica quase de frente para a câmera, e
 * cada pixel de arte tem o mesmo tamanho na tela inteira. A grama e tudo o que fica deitado (solo, sombras) são ImageLabels nesse canvas,
 * ordenados entre si por ZIndex. Sem `grass`, o canvas começa vazio (o interior do Diorama põe os tiles dele).
 */
export function createGround(
	parent: Instance,
	center: Vector3,
	canvasSize: Vector2,
	grass = true,
	zOffset = DRAW_FIRST,
	role: "fixo" | "vivo" | "mar" = "fixo",
): Ground {
	const part = new Instance("Part");
	part.Name = "Ground";
	part.Anchored = true;
	part.CanCollide = false;
	part.CanQuery = false;
	part.CanTouch = false;
	part.CastShadow = false;
	part.Transparency = 1;
	// O "para baixo" do chão (um stud em direção à câmera), já comprimido.
	const down = toView(TOWARD_CAMERA);
	part.Size = new Vector3(
		canvasSize.X / ART_PX_PER_STUD,
		canvasSize.Y * GROUND_STUDS_PER_PX * down.Magnitude,
		THICKNESS,
	);
	// A face Front fica virada para a câmera (era para cima, antes da compressão); a direita do canvas é
	// a direita da tela e o pé do canvas é o lado da câmera.
	const right = SCREEN_RIGHT.mul(-1);
	const up = down.Unit.mul(-1);
	const back = right.Cross(up).Unit;
	part.CFrame = CFrame.fromMatrix(toView(center).add(back.mul(THICKNESS / 2)), right, up, back);

	const gui = new Instance("SurfaceGui");
	gui.Face = Enum.NormalId.Front;
	gui.SizingMode = Enum.SurfaceGuiSizingMode.FixedSize;
	gui.CanvasSize = canvasSize;
	gui.LightInfluence = 0;
	gui.MaxDistance = SURFACE_MAX_DISTANCE;
	gui.ZOffset = zOffset;
	gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling;
	// O papel do canvas, para o painel de desempenho contar quantas vezes cada um é refeito (`client/perf.ts`).
	gui.SetAttribute(CANVAS_ROLE_ATTRIBUTE, role);
	gui.Parent = part;

	if (grass) {
		const label = new Instance("ImageLabel");
		label.Name = "Grass";
		label.BackgroundTransparency = 1;
		label.Size = UDim2.fromScale(1, 1);
		label.Image = GRASS_TILE.image;
		label.ScaleType = Enum.ScaleType.Tile;
		label.TileSize = UDim2.fromOffset(GRASS_TILE.size.X, GRASS_TILE.size.Y);
		label.ResampleMode = Enum.ResamplerMode.Pixelated;
		label.ZIndex = GroundLayer.Grass;
		label.Parent = gui;
	}

	const origin = canvasSize.div(2).sub(worldToArtPx(center));

	part.Parent = parent;

	const canvasPosition = (sprite: Sprite, position: Vector3) => {
		const at = origin.add(worldToArtPx(position)).sub(sprite.anchor);
		return UDim2.fromOffset(math.round(at.X), math.round(at.Y));
	};

	return {
		part,
		gui,
		moveFlat(label, sprite, position) {
			const at = canvasPosition(sprite, position);
			if (label.Position !== at) label.Position = at;
		},
		addFlat(sprite, position, layer) {
			const label = new Instance("ImageLabel");
			label.BackgroundTransparency = 1;
			label.Position = canvasPosition(sprite, position);
			label.Size = UDim2.fromOffset(sprite.size.X, sprite.size.Y);
			label.Image = sprite.image;
			label.ImageRectOffset = sprite.frames[0];
			label.ImageRectSize = sprite.size;
			label.ResampleMode = Enum.ResamplerMode.Pixelated;
			label.ZIndex = layer;
			label.Parent = gui;
			return label;
		},
	};
}
