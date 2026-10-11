import { Controller, OnInit, OnRender, OnStart } from "@flamework/core";
import { Players, Workspace } from "@rbxts/services";
import { cellToWorld, groundOffset, snapToArtPx } from "shared/view";
import { createCard } from "client/world/card";
import { createCollider } from "client/world/collider";
import { createGround, Ground, GroundLayer } from "client/world/ground";
import { Occlusion, Silhouette } from "client/world/occlusion";
import { Sprite, Sprites } from "client/world/sprites";
import { Wind } from "client/world/wind";

const GROUND_CANVAS = new Vector2(2048, 1024);

// Canteiro de teste, em células.
const FIELD = { i0: 1, i1: 5, j0: 0, j1: 3 };

interface Prop {
	name: string;
	sprite: Sprite;
	shadow?: Sprite;
	/** Esconde o jogador: fica meio transparente quando ele passa por trás. */
	hides?: Silhouette;
	/** Área que bloqueia a passagem: largura e profundidade no chão, em pixels de arte. */
	footprint?: Vector2;
	/** Posição na tela, em pixels de arte a partir da origem do mundo. */
	at: [number, number][];
}

const PROPS: Prop[] = [
	{
		name: "Oak",
		sprite: Sprites.oak,
		shadow: Sprites.oakShadow,
		hides: "tree",
		footprint: new Vector2(16, 8),
		at: [
			[-156, 79],
			[-70, -78],
			[-36, -62],
			[150, -52],
			[236, 20],
			[-250, -10],
			[150, 205],
		],
	},
	{
		name: "Bush",
		sprite: Sprites.bush,
		shadow: Sprites.bushShadow,
		hides: "block",
		footprint: new Vector2(34, 12),
		at: [
			[214, 62],
			[-186, -39],
			[120, 142],
		],
	},
	{
		name: "Rock",
		sprite: Sprites.rock,
		shadow: Sprites.rockShadow,
		footprint: new Vector2(18, 8),
		at: [
			[204, 120],
			[-44, -95],
		],
	},
	{
		name: "Pebble",
		sprite: Sprites.pebble,
		shadow: Sprites.pebbleShadow,
		at: [
			[224, 127],
			[-58, -90],
			[-120, 40],
		],
	},
];

// Enfeites espalhados pela grama, com sorteio fixo para a cena sair sempre igual.
const SCATTER: { name: string; sprite: Sprite; count: number }[] = [
	{ name: "Tuft", sprite: Sprites.tuft, count: 46 },
	{ name: "Daisy", sprite: Sprites.daisy, count: 14 },
	{ name: "Poppy", sprite: Sprites.poppy, count: 9 },
];
const SCATTER_SEED = 7;
const SCATTER_HALF = new Vector2(520, 250);

function insideField(position: Vector3) {
	const margin = 0.8;
	const i = position.X / cellToWorld(1, 0).X;
	const j = position.Z / cellToWorld(0, 1).Z;
	return i > FIELD.i0 - margin && i < FIELD.i1 + margin && j > FIELD.j0 - margin && j < FIELD.j1 + margin;
}

/** Cena fixa do protótipo: chão de grama, um canteiro com trigo e alguns objetos. */
@Controller()
export class SceneController implements OnInit, OnStart, OnRender {
	/** Pasta, só deste cliente, com tudo o que é desenhado no mundo. */
	world!: Folder;
	ground!: Ground;
	private wind = new Wind();
	private occlusion = new Occlusion();

	onInit() {
		this.world = new Instance("Folder");
		this.world.Name = "World";
		this.world.Parent = Workspace;
		this.ground = createGround(this.world, Vector3.zero, GROUND_CANVAS);
	}

	onStart() {
		for (let i = FIELD.i0; i <= FIELD.i1; i++) {
			for (let j = FIELD.j0; j <= FIELD.j1; j++) {
				const position = cellToWorld(i, j);
				this.ground.addFlat(Sprites.soil, position, GroundLayer.Soil);
				const age = i - FIELD.i0;
				const wheat = age <= 1 ? Sprites.wheat1 : age <= 2 ? Sprites.wheat2 : Sprites.wheat3;
				const image = this.place("Wheat", wheat, position);
				// O trigo crescido cobre o personagem; o broto, não.
				if (wheat !== Sprites.wheat1) this.occlusion.add(image, wheat, position, "block");
			}
		}

		for (const prop of PROPS) {
			for (const [x, y] of prop.at) {
				const position = groundOffset(x, y);
				if (prop.shadow) this.ground.addFlat(prop.shadow, position, GroundLayer.Shadow);
				const image = this.place(prop.name, prop.sprite, position);
				if (prop.hides) this.occlusion.add(image, prop.sprite, position, prop.hides);
				if (prop.footprint) createCollider(this.world, prop.name, position, prop.footprint);
			}
		}

		const random = new Random(SCATTER_SEED);
		for (const item of SCATTER) {
			for (let n = 0; n < item.count; n++) {
				const x = random.NextInteger(-SCATTER_HALF.X, SCATTER_HALF.X);
				const y = random.NextInteger(-SCATTER_HALF.Y, SCATTER_HALF.Y);
				const position = groundOffset(x, y);
				if (!insideField(position)) this.place(item.name, item.sprite, position);
			}
		}
	}

	onRender(dt: number) {
		this.wind.update(os.clock());
		const root = Players.LocalPlayer.Character?.FindFirstChild("HumanoidRootPart");
		this.occlusion.update(
			root?.IsA("BasePart") ? snapToArtPx(new Vector3(root.Position.X, 0, root.Position.Z)) : undefined,
			dt,
		);
	}

	/** Põe um objeto em pé na cena e, se ele tiver quadros de vento, deixa balançando. */
	private place(name: string, sprite: Sprite, position: Vector3) {
		const { image } = createCard(this.world, name, sprite, position);
		this.wind.add(image, sprite, position);
		return image;
	}
}
