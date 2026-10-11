import { OnStart, Service } from "@flamework/core";
import { Lighting, Workspace } from "@rbxts/services";

const FLOOR_SIZE = 2048;
const FLOOR_THICKNESS = 4;

/** Prepara o que todos os jogadores compartilham: o piso em que se anda e a iluminação. */
@Service()
export class WorldService implements OnStart {
	onStart() {
		this.clearTemplate();
		this.createFloor();
		this.setupLighting();
	}

	/**
	 * Some com o que veio do modelo de place do Studio: a base cinza e a aparência do ponto de
	 * nascimento. Provisório: o certo é tirar os dois do place.
	 */
	private clearTemplate() {
		Workspace.FindFirstChild("Baseplate")?.Destroy();
		for (const child of Workspace.GetChildren()) {
			if (!child.IsA("SpawnLocation")) continue;
			child.Transparency = 1;
			child.CanCollide = false;
			for (const decal of child.GetChildren()) {
				if (decal.IsA("Decal")) decal.Transparency = 1;
			}
		}
	}

	/** Piso invisível, só colisão. O chão que se vê é montado no cliente. */
	private createFloor() {
		const floor = new Instance("Part");
		floor.Name = "Floor";
		floor.Anchored = true;
		floor.Transparency = 1;
		floor.CastShadow = false;
		floor.Size = new Vector3(FLOOR_SIZE, FLOOR_THICKNESS, FLOOR_SIZE);
		floor.Position = new Vector3(0, -FLOOR_THICKNESS / 2, 0);
		floor.Parent = Workspace;
	}

	/** A câmera fica muito longe: névoa e efeitos de profundidade estragariam a imagem. */
	private setupLighting() {
		for (const child of Lighting.GetChildren()) {
			if (child.IsA("PostEffect")) child.Enabled = false;
			if (child.IsA("Atmosphere")) {
				child.Density = 0;
				child.Haze = 0;
			}
		}
	}
}
