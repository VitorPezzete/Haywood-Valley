import { Controller, OnStart } from "@flamework/core";
import { Players, RunService, UserInputService, Workspace } from "@rbxts/services";
import {
	ART_PX_PER_STUD,
	CAMERA_MAX_DISTANCE,
	CAMERA_MIN_FOV,
	LOOK,
	SCREEN_RIGHT,
	SCREEN_UP,
	screenDensity,
	snapToArtPx,
	toView,
	worldToArtPx,
	zoomRange,
} from "shared/view";
import { perfBegin, perfEnd } from "client/perf";
import { worldView, worldZoom } from "client/state/camera";
import { phonePreview, phoneScale } from "client/state/phone";
import { screen } from "client/state/screen";

/** Quanto a pinça precisa abrir ou fechar, desde o começo, para cada passo de zoom. */
const PINCH_STEP = 1.3;

/** Arredonda para que o alvo caia num pixel inteiro da tela, senão a arte treme ao andar. */
function snapToScreen(value: number, studsPerScreenPx: number, viewportLength: number) {
	const half = viewportLength / 2;
	return (math.round(value / studsPerScreenPx + half) - half) * studsPerScreenPx;
}

/**
 * Câmera fixa, de cima em 3/4, que segue o personagem, com zoom em múltiplos inteiros do pixel de arte,
 * como no Graal: o padrão mostra uns 540 pixels de arte de altura, e o jogador aproxima e afasta com a
 * roda do mouse ou a pinça, de 270 até 768 de altura (`zoomRange`). O zoom é inteiro em pixels físicos
 * (`screenDensity`), também numa tela com escala de 125%. Ela olha para o mundo desenhado, de profundidade
 * comprimida (`toView`), e anda paralela a ele.
 */
@Controller()
export class CameraController implements OnStart {
	private chosen?: number;
	private pinchFrom?: number;

	onStart() {
		RunService.BindToRenderStep("WorldCamera", Enum.RenderPriority.Camera.Value + 1, () => this.update());

		UserInputService.InputChanged.Connect((input, processed) => {
			if (processed || input.UserInputType !== Enum.UserInputType.MouseWheel) return;
			if (input.Position.Z !== 0) this.step(input.Position.Z > 0 ? 1 : -1);
		});
		UserInputService.TouchPinch.Connect((_positions, scale, _velocity, state, processed) => {
			if (state === Enum.UserInputState.Begin) this.pinchFrom = processed ? undefined : this.zoom();
			const from = this.pinchFrom;
			if (from === undefined) return;
			if (state === Enum.UserInputState.End || state === Enum.UserInputState.Cancel) this.pinchFrom = undefined;
			// Abrir os dedos aproxima: cada `PINCH_STEP` de abertura é um zoom a mais.
			const steps = math.floor(math.log(scale) / math.log(PINCH_STEP) + 0.5);
			this.choose(from + steps);
		});
	}

	private physicalHeight() {
		const phone = phonePreview();
		if (phone) return phone.Y;
		const camera = Workspace.CurrentCamera;
		if (!camera) return 1080;
		return camera.ViewportSize.Y * screenDensity(camera.ViewportSize);
	}

	private zoom() {
		const range = zoomRange(this.physicalHeight());
		return math.clamp(this.chosen ?? range.standard, range.farthest, range.closest);
	}

	private step(direction: number) {
		this.choose(this.zoom() + direction);
	}

	private choose(zoom: number) {
		if (screen() !== "playing") return;
		const range = zoomRange(this.physicalHeight());
		this.chosen = math.clamp(zoom, range.farthest, range.closest);
	}

	private update() {
		const started = perfBegin("Camera");
		this.follow();
		perfEnd("Camera", started);
	}

	private follow() {
		const camera = Workspace.CurrentCamera;
		if (!camera) return;

		// As contas são em pixels físicos: o pixel de arte vale `zoom` deles, inteiro, e a câmera se alinha a eles.
		const density = screenDensity(camera.ViewportSize);
		const viewport = camera.ViewportSize.mul(density);
		// Na prévia de celular, o zoom do celular ampliado pelo inteiro que cabe nesta tela (`phoneScale`).
		const phone = phonePreview();
		const zoom = this.zoom() * (phone ? phoneScale(phone, viewport) : 1);
		// O que mede canvas em pixels da tela (o balão do chat) usa os pixels do ViewportSize.
		if (worldZoom() !== zoom / density) worldZoom(zoom / density);
		const studsPerScreenPx = 1 / (ART_PX_PER_STUD * zoom);
		// O campo de visão é o que enquadra a tela à distância máxima; se o Roblox não aceitar um
		// valor tão pequeno, a câmera chega mais perto.
		const halfHeight = (viewport.Y * studsPerScreenPx) / 2;
		const fov = math.max(CAMERA_MIN_FOV, math.deg(2 * math.atan(halfHeight / CAMERA_MAX_DISTANCE)));
		const distance = halfHeight / math.tan(math.rad(fov) / 2);

		const root = Players.LocalPlayer.Character?.FindFirstChild("HumanoidRootPart");
		// O mesmo arredondamento do sprite do personagem, para os dois andarem juntos.
		const feet = root?.IsA("BasePart") ? snapToArtPx(new Vector3(root.Position.X, 0, root.Position.Z)) : Vector3.zero;
		const target = toView(feet);
		// O retângulo da tela em pixels de arte, para quem esconde o que está fora dela.
		worldView.center = worldToArtPx(feet);
		worldView.half = viewport.div(2 * zoom);
		const focus = SCREEN_RIGHT.mul(snapToScreen(target.Dot(SCREEN_RIGHT), studsPerScreenPx, viewport.X))
			.add(SCREEN_UP.mul(snapToScreen(target.Dot(SCREEN_UP), studsPerScreenPx, viewport.Y)))
			.add(LOOK.mul(target.Dot(LOOK)));

		camera.CameraType = Enum.CameraType.Scriptable;
		camera.FieldOfView = fov;
		camera.CFrame = CFrame.fromMatrix(focus.sub(LOOK.mul(distance)), SCREEN_RIGHT, SCREEN_UP, LOOK.mul(-1));
		camera.Focus = new CFrame(focus);
	}
}
