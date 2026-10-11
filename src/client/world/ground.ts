import {
	ART_PX_PER_STUD,
	GROUND_STUDS_PER_PX,
	SCREEN_RIGHT,
	TOWARD_CAMERA,
	worldToArtPx,
} from "shared/view";
import { GRASS_TILE, Sprite } from "./sprites";

const THICKNESS = 0.2;
/** O padrão do SurfaceGui é sumir a 1000 studs; a câmera fica longe. */
export const SURFACE_MAX_DISTANCE = 10000;
/**
 * O Roblox desenha os SurfaceGuis do mais distante para o mais próximo, medindo pelo centro de
 * cada um. Sem isto, o chão cobriria todo objeto que está além do centro dele.
 */
const DRAW_FIRST = -100;

/** Camadas do que é desenhado deitado no chão. */
export const GroundLayer = { Grass: 0, Soil: 1, Shadow: 2 };

export interface Ground {
	part: Part;
	/** Desenha um sprite deitado no chão, com a âncora sobre o ponto dado. */
	addFlat(sprite: Sprite, position: Vector3, layer: number): ImageLabel;
	/** Leva para outro ponto um sprite criado por `addFlat`. */
	moveFlat(label: ImageLabel, sprite: Sprite, position: Vector3): void;
}

/**
 * O chão visível: um Part deitado, alinhado com a tela, com um SurfaceGui cujo canvas é medido em
 * pixels de arte. A grama e tudo o que fica deitado (solo, sombras) são ImageLabels nesse canvas,
 * ordenados entre si por ZIndex.
 */
export function createGround(parent: Instance, center: Vector3, canvasSize: Vector2): Ground {
	const part = new Instance("Part");
	part.Name = "Ground";
	part.Anchored = true;
	part.CanCollide = false;
	part.CanQuery = false;
	part.CanTouch = false;
	part.CastShadow = false;
	part.Transparency = 1;
	part.Size = new Vector3(canvasSize.X / ART_PX_PER_STUD, canvasSize.Y * GROUND_STUDS_PER_PX, THICKNESS);
	// A face Front fica virada para cima; a direita do canvas é a direita da tela.
	part.CFrame = CFrame.fromMatrix(
		center.sub(new Vector3(0, THICKNESS / 2, 0)),
		SCREEN_RIGHT.mul(-1),
		TOWARD_CAMERA.mul(-1),
		new Vector3(0, -1, 0),
	);

	const gui = new Instance("SurfaceGui");
	gui.Face = Enum.NormalId.Front;
	gui.SizingMode = Enum.SurfaceGuiSizingMode.FixedSize;
	gui.CanvasSize = canvasSize;
	gui.LightInfluence = 0;
	gui.MaxDistance = SURFACE_MAX_DISTANCE;
	gui.ZOffset = DRAW_FIRST;
	gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling;
	gui.Parent = part;

	const grass = new Instance("ImageLabel");
	grass.Name = "Grass";
	grass.BackgroundTransparency = 1;
	grass.Size = UDim2.fromScale(1, 1);
	grass.Image = GRASS_TILE.image;
	grass.ScaleType = Enum.ScaleType.Tile;
	grass.TileSize = UDim2.fromOffset(GRASS_TILE.size.X, GRASS_TILE.size.Y);
	grass.ResampleMode = Enum.ResamplerMode.Pixelated;
	grass.ZIndex = GroundLayer.Grass;
	grass.Parent = gui;

	const origin = canvasSize.div(2).sub(worldToArtPx(center));

	part.Parent = parent;

	const canvasPosition = (sprite: Sprite, position: Vector3) => {
		const at = origin.add(worldToArtPx(position)).sub(sprite.anchor);
		return UDim2.fromOffset(math.round(at.X), math.round(at.Y));
	};

	return {
		part,
		moveFlat(label, sprite, position) {
			label.Position = canvasPosition(sprite, position);
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
