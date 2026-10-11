import { ART_PX_PER_STUD, LOOK, SCREEN_RIGHT, SCREEN_UP, groundOffset } from "shared/view";
import { SURFACE_MAX_DISTANCE } from "./ground";
import { Sprite } from "./sprites";

const THICKNESS = 0.05;

export interface Card {
	part: Part;
	image: ImageLabel;
}

/**
 * Onde fica um cartão de frente para a câmera cujo ponto `anchor` cai sobre `position` no chão.
 * A borda de baixo do sprite encosta no chão. Como todos os cartões são paralelos, o Roblox
 * desenha por último o que tem a base mais perto da câmera, que é a ordem certa.
 */
export function cardCFrame(size: Vector2, anchor: Vector2, position: Vector3) {
	const bottom = position.add(groundOffset(size.X / 2 - anchor.X, size.Y - anchor.Y));
	const center = bottom.add(SCREEN_UP.mul(size.Y / 2 / ART_PX_PER_STUD));
	// A face Front fica virada para a câmera.
	return CFrame.fromMatrix(center, SCREEN_RIGHT.mul(-1), SCREEN_UP, LOOK);
}

/** Um objeto em pé: um Part fino, de frente para a câmera, com o primeiro quadro do sprite num SurfaceGui. */
export function createCard(parent: Instance, name: string, sprite: Sprite, position: Vector3): Card {
	const { size } = sprite;

	const part = new Instance("Part");
	part.Name = name;
	part.Anchored = true;
	part.CanCollide = false;
	part.CanQuery = false;
	part.CanTouch = false;
	part.CastShadow = false;
	part.Transparency = 1;
	part.Size = new Vector3(size.X / ART_PX_PER_STUD, size.Y / ART_PX_PER_STUD, THICKNESS);
	part.CFrame = cardCFrame(size, sprite.anchor, position);

	const gui = new Instance("SurfaceGui");
	gui.Face = Enum.NormalId.Front;
	gui.SizingMode = Enum.SurfaceGuiSizingMode.FixedSize;
	gui.CanvasSize = size;
	gui.LightInfluence = 0;
	gui.MaxDistance = SURFACE_MAX_DISTANCE;
	gui.Parent = part;

	const image = new Instance("ImageLabel");
	image.BackgroundTransparency = 1;
	image.Size = UDim2.fromScale(1, 1);
	image.Image = sprite.image;
	image.ImageRectOffset = sprite.frames[0];
	image.ImageRectSize = size;
	image.ResampleMode = Enum.ResamplerMode.Pixelated;
	image.Parent = gui;

	part.Parent = parent;
	return { part, image };
}
