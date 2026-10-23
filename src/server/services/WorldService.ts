import { OnStart, Service } from "@flamework/core";
import { Lighting, Workspace } from "@rbxts/services";
import { MAP_SPACING, worldSpan } from "shared/interiorChoice";
import { PHASE1_CELL_X, PHASE1_CELL_Y, worldCellCorner } from "shared/world";
import { PHASE1 } from "shared/world/fase1";

const FLOOR_SIZE = 2048;
const FLOOR_THICKNESS = 4;
/** Quanto o piso do mundo passa da área aberta, em studs (o bloqueio da borda fica dentro dela). */
const WORLD_FLOOR_MARGIN = 32;

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
		// Os mapas compartilhados em volta da origem e as casas dos jogadores dos dois lados deles (`mapCenter`). O
		// Roblox não aceita Part com mais de 2048 studs de lado: o piso é feito de pedaços lado a lado.
		const [first, last] = worldSpan();
		const left = math.min(-FLOOR_SIZE / 2, first - 2 * MAP_SPACING);
		const right = math.max(FLOOR_SIZE / 2, last + 2 * MAP_SPACING);
		// Com o streaming ligado, cada Part chega ao cliente pelo lugar do centro dele: um pedaço de 2048 studs com o
		// centro longe ficaria de fora e o personagem cairia. O modelo persistente vai inteiro a todo cliente.
		const model = new Instance("Model");
		model.Name = "Floor";
		model.ModelStreamingMode = Enum.ModelStreamingMode.Persistent;
		let x = left;
		let index = 0;
		while (x < right) {
			const width = math.min(FLOOR_SIZE, right - x);
			const floor = new Instance("Part");
			floor.Name = index === 0 ? "Floor" : `Floor${index}`;
			floor.Anchored = true;
			floor.Transparency = 1;
			floor.CastShadow = false;
			floor.Size = new Vector3(width, FLOOR_THICKNESS, FLOOR_SIZE);
			floor.Position = new Vector3(x + width / 2, -FLOOR_THICKNESS / 2, 0);
			floor.CanTouch = false;
			floor.Parent = model;
			x += width;
			index++;
		}
		this.createWorldFloor(model);
		model.Parent = Workspace;
	}

	/**
	 * O piso do mapa do mundo (`shared/world`), só sob a área aberta (hoje a fase 1, 384 × 306 studs), longe do piso
	 * dos interiores. Em pedaços de até 2048 studs, no mesmo modelo persistente.
	 */
	private createWorldFloor(model: Model) {
		const a = worldCellCorner(PHASE1_CELL_X, PHASE1_CELL_Y);
		const b = worldCellCorner(PHASE1_CELL_X + PHASE1.width, PHASE1_CELL_Y + PHASE1.height);
		const x0 = math.min(a.X, b.X) - WORLD_FLOOR_MARGIN;
		const x1 = math.max(a.X, b.X) + WORLD_FLOOR_MARGIN;
		const z0 = math.min(a.Z, b.Z) - WORLD_FLOOR_MARGIN;
		const z1 = math.max(a.Z, b.Z) + WORLD_FLOOR_MARGIN;
		let index = 0;
		for (let x = x0; x < x1; x += FLOOR_SIZE) {
			for (let z = z0; z < z1; z += FLOOR_SIZE) {
				const width = math.min(FLOOR_SIZE, x1 - x);
				const depth = math.min(FLOOR_SIZE, z1 - z);
				const floor = new Instance("Part");
				floor.Name = `WorldFloor${index}`;
				floor.Anchored = true;
				floor.Transparency = 1;
				floor.CastShadow = false;
				floor.Size = new Vector3(width, FLOOR_THICKNESS, depth);
				floor.Position = new Vector3(x + width / 2, -FLOOR_THICKNESS / 2, z + depth / 2);
				floor.CanTouch = false;
				floor.Parent = model;
				index++;
			}
		}
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
