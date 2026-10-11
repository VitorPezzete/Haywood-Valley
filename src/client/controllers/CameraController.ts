import { Controller, OnStart } from "@flamework/core";
import { Players, RunService, Workspace } from "@rbxts/services";
import {
	ART_PX_PER_STUD,
	CAMERA_MAX_DISTANCE,
	CAMERA_MIN_FOV,
	LOOK,
	SCREEN_RIGHT,
	SCREEN_UP,
	TARGET_VIEW_HEIGHT,
	snapToArtPx,
} from "shared/view";

/** Arredonda para que o alvo caia num pixel inteiro da tela, senão a arte treme ao andar. */
function snapToScreen(value: number, studsPerScreenPx: number, viewportLength: number) {
	const half = viewportLength / 2;
	return (math.round(value / studsPerScreenPx + half) - half) * studsPerScreenPx;
}

/** Câmera fixa, de cima em 3/4, que segue o personagem, com zoom em múltiplos inteiros do pixel de arte. */
@Controller()
export class CameraController implements OnStart {
	onStart() {
		RunService.BindToRenderStep("WorldCamera", Enum.RenderPriority.Camera.Value + 1, () => this.update());
	}

	private update() {
		const camera = Workspace.CurrentCamera;
		if (!camera) return;

		const viewport = camera.ViewportSize;
		const zoom = math.max(1, math.round(viewport.Y / TARGET_VIEW_HEIGHT));
		const studsPerScreenPx = 1 / (ART_PX_PER_STUD * zoom);
		// O campo de visão é o que enquadra a tela à distância máxima; se o Roblox não aceitar um
		// valor tão pequeno, a câmera chega mais perto.
		const halfHeight = (viewport.Y * studsPerScreenPx) / 2;
		const fov = math.max(CAMERA_MIN_FOV, math.deg(2 * math.atan(halfHeight / CAMERA_MAX_DISTANCE)));
		const distance = halfHeight / math.tan(math.rad(fov) / 2);

		const root = Players.LocalPlayer.Character?.FindFirstChild("HumanoidRootPart");
		// O mesmo arredondamento do sprite do personagem, para os dois andarem juntos.
		const target = root?.IsA("BasePart")
			? snapToArtPx(new Vector3(root.Position.X, 0, root.Position.Z))
			: Vector3.zero;
		const focus = SCREEN_RIGHT.mul(snapToScreen(target.Dot(SCREEN_RIGHT), studsPerScreenPx, viewport.X))
			.add(SCREEN_UP.mul(snapToScreen(target.Dot(SCREEN_UP), studsPerScreenPx, viewport.Y)))
			.add(LOOK.mul(target.Dot(LOOK)));

		camera.CameraType = Enum.CameraType.Scriptable;
		camera.FieldOfView = fov;
		camera.CFrame = CFrame.fromMatrix(focus.sub(LOOK.mul(distance)), SCREEN_RIGHT, SCREEN_UP, LOOK.mul(-1));
		camera.Focus = new CFrame(focus);
	}
}
