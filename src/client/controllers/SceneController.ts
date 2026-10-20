import { Controller, OnInit, OnRender, OnStart } from "@flamework/core";
import { Players, Workspace } from "@rbxts/services";
import { actionsStart, mapCorner, mapData, placeOf } from "shared/interiorChoice";
import { InteriorMap } from "shared/interiorMap";
import { cellToWorld, groundOffset, snapToArtPx } from "shared/view";
import { createCard } from "client/world/card";
import { createCollider } from "client/world/collider";
import { perfBegin, perfEnd } from "client/perf";
import { createGround, GroundLayer, LIVE_Z_OFFSET } from "client/world/ground";
import { buildInterior } from "client/world/interior";
import { interiorTest, startInterior } from "client/world/interiorTest";
import { Occlusion, Silhouette } from "client/world/occlusion";
import { Sprite, Sprites } from "client/world/sprites";
import { Wind } from "client/world/wind";

type Ground = ReturnType<typeof createGround>;
type Interior = ReturnType<typeof buildInterior>;
type MapData = NonNullable<ReturnType<typeof mapData>>;
type Place = NonNullable<ReturnType<typeof placeOf>>;

/** Grama em volta da origem: cobre a tela com a câmera afastada (768 de altura) andando pela cena toda. */
const GROUND_CANVAS = new Vector2(4096, 2048);

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

/**
 * O mapa em que o jogador está: um mapa do Diorama (interior, exterior ou os dois), montado em `buildInterior`.
 * Cada cliente monta só o mapa do próprio jogador (o atributo `Mapa`, que o servidor grava) e troca de mapa
 * quando o jogador passa por uma saída (`enter`, chamado pelo `MapController`); quem desenha algo do mapa
 * (luzes, peças, sombras) se inscreve em `onMapChanged`. Sem nenhum mapa gerado, a cena fixa do protótipo:
 * chão de grama, um canteiro com trigo e alguns objetos.
 */
@Controller()
export class SceneController implements OnInit, OnStart, OnRender {
	/** Pasta, só deste cliente, com tudo o que é desenhado no mundo. */
	world!: Folder;
	ground!: Ground;
	live!: Ground;
	interior?: Interior;
	map?: InteriorMap;
	mapId?: string;
	mapKey?: string;
	mapSlot = 0;
	private wind = new Wind();
	/** O que fica meio transparente com o jogador atrás; o que é desenhado fora daqui (a tampa do baú) também registra. */
	readonly occlusion = new Occlusion();
	private listeners = new Array<() => void>();

	onInit() {
		this.world = new Instance("Folder");
		this.world.Name = "World";
		this.world.Parent = Workspace;

		// O mapa que o servidor já deu ao jogador; sem ele ainda, o de começo (o teste do Diorama vale mais; sem
		// ele, o interior de começo do jogo normal, a casa de teste). O servidor chega à mesma escolha.
		const place = placeOf(Players.LocalPlayer);
		const start = (place && mapData(place.id)) ?? (interiorTest() || startInterior())?.data;
		if (start) {
			this.build(start, place?.id === start.id ? place : undefined);
			return;
		}
		this.ground = createGround(this.world, Vector3.zero, GROUND_CANVAS);
		this.live = createGround(this.world, Vector3.zero, GROUND_CANVAS, false, LIVE_Z_OFFSET, "vivo");
	}

	mapImages() {
		const images = new Set<string>();
		const folder = this.interior?.folder;
		if (folder) {
			for (const child of folder.GetDescendants()) {
				if (child.IsA("ImageLabel") && child.Image !== "") images.add(child.Image);
			}
		}
		const list = new Array<string>();
		for (const image of images) list.push(image);
		return list;
	}

	onMapChanged(listener: () => void) {
		this.listeners.push(listener);
	}

	enter(place: Place) {
		const data = mapData(place.id);
		if (!data || (place.key === this.mapKey && place.slot === this.mapSlot) || !this.interior) return false;
		this.interior.destroy();
		this.build(data, place);
		for (const listener of this.listeners) listener();
		return true;
	}

	private build(data: MapData, place?: Place) {
		const start = actionsStart(data);
		this.mapSlot = place?.slot ?? 0;
		this.mapKey = place?.key ?? data.id;
		this.map = new InteriorMap(data, start.cell, start.test);
		this.interior = buildInterior(this.world, data, mapCorner(data.id, this.mapSlot), this.map);
		this.ground = this.interior.ground;
		this.live = this.interior.live;
		this.mapId = data.id;
		const s = this.interior.stats;
		print(
			`[Interior] ${this.mapKey} (${data.stamp}): ${s.tiles} tiles em ${s.groundImages} imagens no chão` +
				(s.terrainTiles > 0
					? ` (exterior: ${s.terrainTiles} tiles, ${s.terrainLayers} recortes em ${s.terrainImages} imagens, ${s.terrainAnimated} animadas)`
					: "") +
				`; ${s.colliders} bloqueios; ${s.instances} instâncias; montado em ${string.format("%.1f", s.buildMs)} ms`,
		);
	}

	onStart() {
		if (this.interior) return;
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
		const now = os.clock();
		let started = perfBegin("Vento");
		this.wind.update(now);
		perfEnd("Vento", started);
		started = perfBegin("Tiles");
		this.interior?.animate(now);
		perfEnd("Tiles", started);
		started = perfBegin("Oclusao");
		const root = Players.LocalPlayer.Character?.FindFirstChild("HumanoidRootPart");
		this.occlusion.update(
			root?.IsA("BasePart") ? snapToArtPx(new Vector3(root.Position.X, 0, root.Position.Z)) : undefined,
			dt,
		);
		perfEnd("Oclusao", started);
	}

	/** Põe um objeto em pé na cena e, se ele tiver quadros de vento, deixa balançando. */
	private place(name: string, sprite: Sprite, position: Vector3) {
		const { image } = createCard(this.world, name, sprite, position);
		this.wind.add(image, sprite, position);
		return image;
	}
}
