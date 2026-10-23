import { Controller, OnStart } from "@flamework/core";
import { ContentProvider, Players, RunService, SoundService, Workspace } from "@rbxts/services";
import { gameHour } from "shared/clock";
import { cellOfPoint, MAP_ATTRIBUTE, mapCorner, mapData, placeOf, zoneAt } from "shared/interiorChoice";
import { THROW_SECONDS } from "shared/pieces";
import {
	AMBIENCE_GROUP,
	AMBIENCE_LAYERS,
	AMBIENCE_PERIOD_FADE,
	AMBIENCE_PROFILES,
	AMBIENCE_ZONE_FADE,
	EFFECT_MAX,
	EFFECT_MIN,
	EFFECTS,
	INTERFACE_GROUP,
	MAP_SOUND_PROPS,
	MAX_AMBIENT_LOOPS,
	MAX_EFFECT_COPIES,
	MUFFLE,
	OTHER_PLAYER_VOLUME,
	periodOf,
	PLACED,
	SWIM_STROKE_STEPS,
	UI_SOUNDS,
	VEIL_FADE_IN,
	VEIL_FADE_OUT,
} from "shared/sounds";
import { Events } from "client/network";
import { perfBegin, perfEnd } from "client/perf";
import { screen } from "client/state/screen";
import { settings } from "client/state/settings";
import { setUiSoundPlayer, UiSoundName } from "client/uiSound";
import { lightOf } from "client/world/lightTiles";
import { findFixtures } from "shared/fixtures";
import { PLOT_TILES, plotCell } from "shared/farm";
import { groundOffset } from "shared/view";
import { WORLD_TILE, worldCellCorner, worldCellPoint, worldWaterSample } from "shared/world";
import { ActionController } from "./ActionController";
import { CharacterController } from "./CharacterController";
import { FarmController, FarmWork } from "./FarmController";
import { MapController } from "./MapController";
import { SceneController } from "./SceneController";
import { SettingsController } from "./SettingsController";

/** Logo depois de trocar de mapa, os avisos de torneira são o servidor contando como elas estão: sem o clique. */
const TAP_SYNC_SECONDS = 2;
/** A cada quanto o mar (ou o rio, no mundo) procura a célula de água mais perto do jogador, em segundos. */
const SEA_SEARCH_SECONDS = 0.25;
/** Ao sair da tela do jogo (ou voltar a ela), o ambiente some e volta neste tempo. */
const SCREEN_FADE = 2;
/** Os volumes do ambiente andam a cada tanto, em segundos (não a cada quadro): os fades são de segundos. */
const TICK_SECONDS = 0.1;

const warned = new Set<string>();
function warnOnce(key: string, text: string) {
	if (warned.has(key)) return;
	warned.add(key);
	warn(text);
}

interface SoundDef {
	readonly id: string;
	readonly volume: number;
	readonly region?: readonly [number, number];
	readonly loop?: readonly [number, number];
	readonly pitch?: number;
}

interface PlacedDef extends SoundDef {
	readonly min: number;
	readonly max: number;
	readonly zoneBound: boolean;
}

interface Profile {
	readonly muffled: boolean;
	readonly levels: Readonly<Record<string, Readonly<Record<string, number | undefined>>>>;
}

type EffectName = keyof typeof EFFECTS;
type PlacedName = keyof typeof PLACED;
type Zone = ReturnType<typeof zoneAt>;
type ActorPose = Parameters<Parameters<CharacterController["onActorFrame"]>[0]>[2];

export interface SoundProps {
	ambiente: string;
	musica?: string;
}

/** Um laço de ambiente: de fundo (sem lugar) ou pelo lugar (num `Attachment`). */
interface Loop {
	name: string;
	sound: Sound;
	def: SoundDef;
	target: number;
	level: number;
	fade: number;
	aim: number;
	span: number;
	heard: number;
	started: boolean;
	muffle?: EqualizerSoundEffect;
	placed?: {
		def: PlacedDef;
		attachment: Attachment;
		zone: Zone;
		tap?: number;
		stove?: string;
	};
}

/** O que o som lembra de cada boneco à mostra: se nadava e quantos passos deu. */
interface Walker {
	swim: ActorPose["swim"];
	steps: number;
}

/**
 * O som do mundo, todo no cliente (página "Plano de som e música" do Notion, seção 5): nada de som pela rede, e o
 * que outro jogador faz (o pote dele quebrando, os passos dele na água) cada cliente toca quando vê acontecer.
 *
 * - **Ouvinte**: um Part invisível que segue o pé do personagem, sempre virado para o norte, como a câmera
 *   (`SoundService:SetListener`). A câmera fica a até 280 studs: com ela de ouvinte, perto e longe soariam igual.
 * - **Grupos**: `Ambience` e `Interface` dentro do `Effects` das Configurações (o `SettingsController` cria
 *   `Music` e `Effects`).
 * - **Ambiente de fundo**: pássaros, grilos, vento e mar distante, pela propriedade `ambiente` da zona (ou do
 *   mapa, `MAP_SOUND_PROPS`) e pelo período do dia (`gameHour`), com troca suave. Dentro de casa, o de fora fica
 *   baixo e abafado (`EqualizerSoundEffect` sem os agudos).
 * - **Pelo lugar** (`LinearSquare`): a lareira, a torneira aberta e o mar ao longo da costa (um som só, que vai à
 *   célula de água mais perto). A lareira e a torneira só se ouvem na zona delas. Fora do alcance, em pausa. No mapa
 *   do mundo (2026-10-23), o rio, do mesmo jeito que o mar: um laço só, que vai ao ponto de água mais perto
 *   (`worldWaterSample`). As posições são as físicas, como a do ouvinte (que não é a câmera): `toView` não entra.
 * - **Limites**: até `MAX_AMBIENT_LOOPS` laços audíveis (os mais altos) e `MAX_EFFECT_COPIES` cópias do mesmo efeito.
 * - **Efeitos**: a porta no começo do véu da viagem, o pote quebrando, o respingo e a braçada na água funda, o passo
 *   na água rasa, a torneira abrindo e fechando, os passos em seco e, na fazenda do mundo (2026-10-23), a enxada, o
 *   plantar e o colher no meio do canteiro, quando o atributo `Fazenda` do dono muda (o servidor já aceitou; vale
 *   para o próprio jogador e para os outros, mais baixo, `FarmController.onWork`).
 *
 * Som sem id não toca, e o Output avisa uma vez. A música é do `MusicController`.
 */
@Controller()
export class SoundController implements OnStart {
	private folder!: Folder;
	private host!: Part;
	private listener!: Part;
	private effectsGroup!: SoundGroup;
	private ambienceGroup!: SoundGroup;
	private interfaceGroup!: SoundGroup;
	private background = new Map<string, Loop>();
	private placed = new Array<Loop>();
	private sea?: Loop;
	private water = new Array<Vector3>();
	private seaSearchAt = 0;
	private closedTaps = new Set<number>();
	private stovesOn = new Set<string>();
	private mapChangedAt = 0;
	private copies = new Map<string, Sound[]>();
	private walkers = new Map<Player, Walker>();
	private places = new Map<Player, string | undefined>();
	private random = new Random();
	private veil = 1;
	private veilTarget = 1;
	private screenGain = 0;
	private muffled = 0;
	private lastProfile = "";
	private lastPeriod?: string;
	private pending = 0;
	private audible = new Array<Loop>();
	private kept = new Set<Loop>();
	private props: SoundProps = { ambiente: "exterior" };
	private propsReady = false;
	private propsZone?: unknown;
	private propsMap?: string;

	constructor(
		private settingsController: SettingsController,
		private scene: SceneController,
		private map: MapController,
		private characters: CharacterController,
		private actions: ActionController,
		private farm: FarmController,
	) {}

	onStart() {
		this.folder = new Instance("Folder");
		this.folder.Name = "Sound";
		this.folder.Parent = Workspace;
		this.host = this.makePart("SoundEmitters");
		this.listener = this.makePart("SoundListener");
		SoundService.SetListener(Enum.ListenerType.ObjectCFrame, this.listener);
		this.effectsGroup = this.settingsController.group("effects");
		this.ambienceGroup = this.childGroup(AMBIENCE_GROUP);
		this.interfaceGroup = this.childGroup(INTERFACE_GROUP);

		for (const [name, def] of pairs(AMBIENCE_LAYERS)) {
			if (def.id === "") continue;
			const sound = this.makeSound(`Ambience_${name}`, def, this.folder, this.ambienceGroup);
			sound.Looped = true;
			const muffle = new Instance("EqualizerSoundEffect");
			muffle.LowGain = 0;
			muffle.MidGain = 0;
			muffle.HighGain = 0;
			muffle.Parent = sound;
			this.background.set(name, {
				name,
				sound,
				def,
				target: 0,
				level: 0,
				fade: AMBIENCE_ZONE_FADE,
				aim: 0,
				span: 1,
				heard: 0,
				started: false,
				muffle,
			});
		}

		setUiSoundPlayer((name) => this.ui(name));
		this.preload();
		this.mapChangedAt = os.clock();
		this.buildPlaced();
		this.scene.onMapChanged(() => {
			this.mapChangedAt = os.clock();
			this.walkers.clear();
			this.buildPlaced();
		});
		this.map.onVeil((closing, exit) => {
			if (closing && exit) this.play("porta");
			this.veilTarget = closing ? 0 : 1;
		});
		this.characters.onActorFrame((player, at, pose, moving, stepped) =>
			this.actorFrame(player, at, pose, moving, stepped),
		);

		const here = (map: string) => map === this.scene.mapKey;
		Events.tapChanged.connect((map, x, y, open) => {
			if (!here(map) || !this.scene.map) return;
			const key = this.scene.map.key(x, y);
			if (open === !this.closedTaps.has(key)) return;
			if (open) this.closedTaps.delete(key);
			else this.closedTaps.add(key);
			if (os.clock() - this.mapChangedAt < TAP_SYNC_SECONDS || !this.scene.interior) return;
			this.play(open ? "torneiraAbre" : "torneiraFecha", this.scene.interior.cellCenter(x, y));
		});
		// O baú abrindo e fechando e o fogão acendendo, no meio dele; o fogão aceso soa enquanto estiver aceso. O
		// baú-peça que fechou por sair do lugar fecha calado.
		this.actions.onFixture((id, on, _cells, moved) => {
			const stove = id.sub(1, 6) === "stove@";
			if (stove) {
				if (on) this.stovesOn.add(id);
				else this.stovesOn.delete(id);
			}
			const interior = this.scene.interior;
			const fixtures = this.actions.currentFixtures();
			if (moved || !interior || !fixtures || os.clock() - this.mapChangedAt < TAP_SYNC_SECONDS) return;
			// O retângulo do baú ou do fogão, e não as células desenhadas: voltar ao estado pintado no mapa (fechar o
			// baú pintado fechado, reacender o fogão pintado aceso) não desenha nenhuma.
			const area = fixtures.area(id);
			if (!area) return;
			const [x, y, w, h] = area;
			const at = interior.cellCenter(x + (w - 1) / 2, y + (h - 1) / 2);
			if (stove) {
				if (on) this.play("fogaoAcende", at);
				return;
			}
			this.play(fixtures.isOpen(id) ? "bauAbre" : "bauFecha", at);
		});
		// A fazenda: o canteiro que o servidor mudou, no meio dele.
		this.farm.onWork((player, lot, plot, work) => this.farmWork(player, lot, plot, work));
		Events.pieceThrown.connect((map, _id, holder, x, y, mode) => {
			if (!here(map) || mode !== 3) return;
			// Quebra ao cair, no fim do voo (`PieceView.fly`).
			task.delay(THROW_SECONDS, () => {
				if (!here(map) || !this.scene.interior) return;
				const scale = holder === Players.LocalPlayer.UserId ? 1 : OTHER_PLAYER_VOLUME;
				this.play("poteQuebra", this.scene.interior.cellCenter(x, y), scale);
			});
		});

		Players.PlayerAdded.Connect((player) => this.watchPlace(player));
		Players.PlayerRemoving.Connect((player) => {
			this.walkers.delete(player);
			this.places.delete(player);
		});
		for (const player of Players.GetPlayers()) this.watchPlace(player);

		RunService.Heartbeat.Connect((dt) => {
			const started = perfBegin("Som");
			this.update(dt);
			perfEnd("Som", started);
		});
	}

	placeProps() {
		const id = this.scene.mapId;
		const zone = this.map.zone();
		if (this.propsReady && zone === this.propsZone && id === this.propsMap) return this.props;
		this.propsReady = true;
		this.propsZone = zone;
		this.propsMap = id;
		const base = id !== undefined ? (MAP_SOUND_PROPS as Record<string, Partial<SoundProps>>)[id] : undefined;
		const data = mapData(id);
		const fallback = data && data.terrain === undefined ? "casa" : "exterior";
		this.props = {
			ambiente: zone?.props.ambiente ?? base?.ambiente ?? fallback,
			musica: zone?.props.musica ?? base?.musica,
		};
		return this.props;
	}

	play(name: EffectName, at?: Vector3, scale = 1) {
		const variants = EFFECTS[name] as ReadonlyArray<SoundDef>;
		const def = variants[this.random.NextInteger(0, variants.size() - 1)];
		this.fire(`effect.${name}`, def, this.effectsGroup, at, scale);
	}

	private farmWork(player: Player, lot: string, plot: number, work: FarmWork) {
		const cell = plotCell(lot, plot);
		if (!cell) return;
		const half = (PLOT_TILES * WORLD_TILE) / 2;
		const at = worldCellCorner(cell[0], cell[1]).add(groundOffset(half, half));
		const scale = player === Players.LocalPlayer ? 1 : OTHER_PLAYER_VOLUME;
		this.play(work === "till" ? "enxada" : work === "plant" ? "plantar" : "colher", at, scale);
	}

	private ui(name: UiSoundName) {
		const def = UI_SOUNDS[settings().theme][name] as SoundDef;
		this.fire(`ui.${settings().theme}.${name}`, def, this.interfaceGroup);
	}

	private fire(key: string, def: SoundDef, group: SoundGroup, at?: Vector3, scale = 1) {
		if (def.id === "") {
			warnOnce(key, `[Som] "${key}" ainda não tem id (som.* em assets/registro.json): fica mudo`);
			return;
		}
		// No máximo `MAX_EFFECT_COPIES` cópias: a mais velha para.
		const copies = this.copies.get(key) ?? [];
		this.copies.set(key, copies);
		while (copies.size() >= MAX_EFFECT_COPIES) {
			const oldest = copies.shift()!;
			(oldest.Parent?.IsA("Attachment") ? oldest.Parent : oldest).Destroy();
		}

		let parent: Instance = this.folder;
		let holder: Attachment | undefined;
		if (at) {
			const attachment = new Instance("Attachment");
			attachment.Name = key;
			attachment.Position = new Vector3(at.X, 0, at.Z);
			attachment.Parent = this.host;
			parent = attachment;
			holder = attachment;
		}
		const sound = this.makeSound(key, def, parent, group);
		sound.Volume = def.volume * scale;
		if (def.pitch !== undefined) sound.PlaybackSpeed = 1 + this.random.NextNumber(-def.pitch, def.pitch);
		if (at) {
			sound.RollOffMode = Enum.RollOffMode.LinearSquare;
			sound.RollOffMinDistance = EFFECT_MIN;
			sound.RollOffMaxDistance = EFFECT_MAX;
		}
		copies.push(sound);
		const done = () => {
			const index = copies.indexOf(sound);
			if (index >= 0) copies.remove(index);
			(holder || sound).Destroy();
		};
		sound.Ended.Once(done);
		// Garantia, caso o `Ended` não venha (som que não carregou).
		const length = def.region ? def.region[1] - def.region[0] : 8;
		task.delay(length / sound.PlaybackSpeed + 2, () => {
			if (sound.Parent) done();
		});
		sound.Play();
	}

	private makePart(name: string) {
		const part = new Instance("Part");
		part.Name = name;
		part.Anchored = true;
		part.CanCollide = false;
		part.CanQuery = false;
		part.CanTouch = false;
		part.Transparency = 1;
		part.Size = new Vector3(0.2, 0.2, 0.2);
		part.CFrame = new CFrame();
		part.Parent = this.folder;
		return part;
	}

	private childGroup(name: string) {
		const group = new Instance("SoundGroup");
		group.Name = name;
		group.Volume = 1;
		group.Parent = this.effectsGroup;
		return group;
	}

	private makeSound(name: string, def: SoundDef, parent: Instance, group: SoundGroup) {
		const sound = new Instance("Sound");
		sound.Name = name;
		sound.SoundId = def.id;
		sound.Volume = 0;
		sound.SoundGroup = group;
		if (def.region || def.loop) {
			sound.PlaybackRegionsEnabled = true;
			if (def.region) sound.PlaybackRegion = new NumberRange(def.region[0], def.region[1]);
			if (def.loop) sound.LoopRegion = new NumberRange(def.loop[0], def.loop[1]);
		}
		sound.Parent = parent;
		return sound;
	}

	private preload() {
		const ids = new Set<string>();
		for (const [, def] of pairs(AMBIENCE_LAYERS)) if (def.id !== "") ids.add(def.id);
		for (const [, def] of pairs(PLACED)) if (def.id !== "") ids.add(def.id);
		for (const [, variants] of pairs(EFFECTS)) {
			for (const def of variants as ReadonlyArray<SoundDef>) if (def.id !== "") ids.add(def.id);
		}
		// Pelo `Sound`, não pelo texto do id: com o texto, o `PreloadAsync` pede uma imagem e o Output enche de "Asset
		// type does not match requested type" (visto no Studio em 2026-10-19).
		const list = new Array<Sound>();
		for (const id of ids) {
			const sound = new Instance("Sound");
			sound.SoundId = id;
			list.push(sound);
		}
		task.spawn(() => {
			ContentProvider.PreloadAsync(list);
			for (const sound of list) sound.Destroy();
		});
	}

	private buildPlaced() {
		for (const loop of this.placed) loop.placed?.attachment.Destroy();
		this.placed.clear();
		this.sea = undefined;
		this.water.clear();
		this.closedTaps.clear();
		this.stovesOn.clear();
		// O mundo: o rio vai ao ponto de água mais perto (como o mar dos interiores); os pontos já vêm espaçados.
		if (this.scene.worldMap) {
			for (const [x, y] of worldWaterSample()) this.water.push(worldCellPoint(x, y));
			if (this.water.size() > 0) this.sea = this.addPlaced("rio", this.water[0], undefined);
			this.seaSearchAt = 0;
			return;
		}
		const interior = this.scene.interior;
		const data = mapData(this.scene.mapId);
		if (!interior || !data) return;

		const { x: ax, y: ay, width, height } = interior.area;
		for (let y = ay; y < ay + height; y++) {
			for (let x = ax; x < ax + width; x++) {
				const tile = interior.topTile(x, y);
				// O fogo de cada lareira, onde as luzes põem o halo dela (`LIGHT_TILES`).
				if (tile && lightOf(tile)?.kind === "lareira") {
					this.addPlaced("lareira", interior.cellCenter(x, y), zoneAt(data, x, y));
				}
			}
		}
		const map = this.scene.map;
		if (map) {
			for (const [x, y] of map.taps) {
				const loop = this.addPlaced("torneira", interior.cellCenter(x, y), zoneAt(data, x, y));
				if (loop?.placed) loop.placed.tap = map.key(x, y);
			}
		}
		// Os fogões, no meio de cada um; soam só acesos.
		if (map) {
			for (const fixture of findFixtures(map)) {
				if (fixture.kind !== "stove") continue;
				if (fixture.startsOn) this.stovesOn.add(fixture.id);
				const loop = this.addPlaced(
					"fogao",
					interior.cellCenter(fixture.x + 1, fixture.y + fixture.h - 1),
					zoneAt(data, fixture.x + 1, fixture.y),
				);
				if (loop?.placed) loop.placed.stove = fixture.id;
			}
		}
		// O mar do exterior: o mar fundo e a água rasa do terreno (não a água da banheira).
		if (data.terrain) {
			for (let j = 0; j < data.height; j++) {
				const row = data.actions[j];
				for (let i = 0; i < data.width; i++) {
					const code = row.sub(i + 1, i + 1);
					if (code === "~" || code === "6") this.water.push(interior.cellCenter(data.x + i, data.y + j));
				}
			}
			if (this.water.size() > 0) this.sea = this.addPlaced("mar", this.water[0], undefined);
		}
		this.seaSearchAt = 0;
	}

	private addPlaced(name: PlacedName, at: Vector3, zone: Zone) {
		const def = PLACED[name] as PlacedDef;
		if (def.id === "") {
			warnOnce(
				`placed.${name}`,
				`[Som] o som "${name}" pelo lugar ainda não tem id (som.* em assets/registro.json): fica mudo`,
			);
			return undefined;
		}
		const attachment = new Instance("Attachment");
		attachment.Name = name;
		attachment.Position = new Vector3(at.X, 0, at.Z);
		attachment.Parent = this.host;
		const sound = this.makeSound(name, def, attachment, this.ambienceGroup);
		sound.Looped = true;
		sound.RollOffMode = Enum.RollOffMode.LinearSquare;
		sound.RollOffMinDistance = def.min;
		sound.RollOffMaxDistance = def.max;
		const loop: Loop = {
			name,
			sound,
			def,
			target: 0,
			level: 0,
			fade: AMBIENCE_ZONE_FADE,
			aim: 0,
			span: 1,
			heard: 0,
			started: false,
			placed: { def, attachment, zone },
		};
		this.placed.push(loop);
		return loop;
	}

	private update(frameDt: number) {
		// O ouvinte vai ao pé do personagem, no chão, virado para o norte (−Z), como a câmera.
		const root = Players.LocalPlayer.Character?.FindFirstChild("HumanoidRootPart");
		const ear = root?.IsA("BasePart") ? new Vector3(root.Position.X, 0, root.Position.Z) : this.listener.Position;
		if (ear !== this.listener.Position) this.listener.CFrame = new CFrame(ear);

		this.pending += frameDt;
		if (this.pending < TICK_SECONDS) return;
		const dt = this.pending;
		this.pending = 0;

		// O véu da porta e a tela do jogo.
		const veilStep = dt / (this.veilTarget < this.veil ? VEIL_FADE_OUT : VEIL_FADE_IN);
		this.veil = this.approach(this.veil, this.veilTarget, veilStep);
		const playing = screen() === "playing";
		this.screenGain = this.approach(this.screenGain, playing ? 1 : 0, dt / SCREEN_FADE);
		const gain = this.veil * this.screenGain;

		// O ambiente de fundo pela zona e pela hora.
		const props = this.placeProps();
		let profile = (AMBIENCE_PROFILES as Record<string, Profile | undefined>)[props.ambiente];
		if (!profile) {
			warnOnce(
				`profile.${props.ambiente}`,
				`[Som] ambiente "${props.ambiente}" desconhecido (AMBIENCE_PROFILES em shared/sounds.ts): vale o "exterior"`,
			);
			profile = AMBIENCE_PROFILES.exterior as Profile;
		}
		const period = periodOf(gameHour());
		const fade =
			period !== this.lastPeriod && this.lastProfile === props.ambiente ? AMBIENCE_PERIOD_FADE : AMBIENCE_ZONE_FADE;
		if (props.ambiente !== this.lastProfile || period !== this.lastPeriod) {
			const levels = profile.levels[period];
			for (const [name] of pairs(AMBIENCE_LAYERS)) {
				const level = levels[name] ?? 0;
				const loop = this.background.get(name);
				if (!loop) {
					if (level > 0) {
						warnOnce(
							`layer.${name}`,
							`[Som] a camada de ambiente "${name}" ainda não tem id (som.* em assets/registro.json): fica muda`,
						);
					}
					continue;
				}
				loop.target = level;
				loop.fade = fade;
			}
			this.lastProfile = props.ambiente;
			this.lastPeriod = period;
		}
		for (const [, loop] of this.background) loop.heard = loop.def.volume * loop.target;
		this.muffled = this.approach(this.muffled, profile.muffled ? 1 : 0, dt / AMBIENCE_ZONE_FADE);

		// O mar (ou o rio) vai à célula de água mais perto do ouvinte (na água, a do próprio jogador).
		const now = os.clock();
		if (this.sea && now >= this.seaSearchAt) {
			this.seaSearchAt = now + SEA_SEARCH_SECONDS;
			let best = this.water[0];
			let bestDistance = math.huge;
			for (const point of this.water) {
				const dx = point.X - ear.X;
				const dz = point.Z - ear.Z;
				const distance = dx * dx + dz * dz;
				if (distance < bestDistance) {
					best = point;
					bestDistance = distance;
				}
			}
			const attachment = this.sea.placed!.attachment;
			if (attachment.Position !== best) attachment.Position = best;
		}

		// Os sons pelo lugar: presos à zona, só a torneira aberta, e a queda pela distância (`LinearSquare`).
		const zone = this.map.zone();
		for (const loop of this.placed) {
			const placed = loop.placed!;
			const def = placed.def;
			let target = 1;
			if (def.zoneBound && placed.zone !== zone) target = 0;
			if (placed.tap !== undefined && this.closedTaps.has(placed.tap)) target = 0;
			if (placed.stove !== undefined && !this.stovesOn.has(placed.stove)) target = 0;
			const distance = placed.attachment.Position.sub(ear).Magnitude;
			const falloff =
				distance <= def.min ? 1 : distance >= def.max ? 0 : (1 - (distance - def.min) / (def.max - def.min)) ** 2;
			loop.target = target;
			loop.fade = AMBIENCE_ZONE_FADE;
			loop.heard = def.volume * target * falloff;
		}

		// No máximo `MAX_AMBIENT_LOOPS` laços: ficam os que mais se ouvem.
		const audible = this.audible;
		audible.clear();
		for (const [, loop] of this.background) if (loop.heard > 0) audible.push(loop);
		for (const loop of this.placed) if (loop.heard > 0) audible.push(loop);
		audible.sort((a, b) => a.heard > b.heard);
		const kept = this.kept;
		kept.clear();
		for (let i = 0; i < math.min(audible.size(), MAX_AMBIENT_LOOPS); i++) kept.add(audible[i]);

		for (const [, loop] of this.background) this.drive(loop, kept.has(loop) ? loop.target : 0, gain, dt);
		for (const loop of this.placed) {
			// Fora do alcance, nada a esperar: em pausa na hora.
			if (loop.heard <= 0 && loop.target > 0) loop.level = 0;
			this.drive(loop, kept.has(loop) ? loop.target : 0, gain, dt);
		}
	}

	private drive(loop: Loop, target: number, gain: number, dt: number) {
		if (target !== loop.aim) {
			loop.aim = target;
			loop.span = math.max(math.abs(target - loop.level), 0.01);
		}
		loop.level = this.approach(loop.level, target, (dt / loop.fade) * loop.span);
		const volume = loop.def.volume * loop.level * gain;
		if (math.abs(loop.sound.Volume - volume) > 1e-4) loop.sound.Volume = volume;
		if (loop.muffle) {
			const m = this.muffled;
			loop.muffle.LowGain = MUFFLE.low * m;
			loop.muffle.MidGain = MUFFLE.mid * m;
			loop.muffle.HighGain = MUFFLE.high * m;
		}
		const audible = volume > 1e-3;
		if (audible && !loop.sound.IsPlaying) {
			if (loop.started) {
				loop.sound.Resume();
			} else {
				loop.started = true;
				loop.sound.Play();
			}
		} else if (!audible && loop.level <= 0 && loop.sound.IsPlaying) {
			loop.sound.Pause();
		}
	}

	private approach(value: number, target: number, step: number) {
		if (value < target) return math.min(value + step, target);
		if (value > target) return math.max(value - step, target);
		return value;
	}

	private actorFrame(player: Player, at: Vector3, pose: ActorPose, moving: boolean, stepped: boolean) {
		const scale = player === Players.LocalPlayer ? 1 : OTHER_PLAYER_VOLUME;
		let walker = this.walkers.get(player);
		if (!walker) {
			// Quem aparece já nadando não respinga.
			walker = { swim: pose.swim, steps: 0 };
			this.walkers.set(player, walker);
		}
		if (pose.swim !== walker.swim) {
			walker.swim = pose.swim;
			this.play(pose.swim ? "respingo" : "passoAgua", at, scale);
			return;
		}
		if (!moving || !stepped) return;
		walker.steps++;
		if (pose.swim) {
			if (walker.steps % SWIM_STROKE_STEPS === 0) this.play("nadar", at, scale);
		} else if (pose.wade) {
			this.play("passoAgua", at, scale);
		} else {
			this.play(this.surfaceAt(at), at, scale);
		}
	}

	private surfaceAt(at: Vector3): EffectName {
		const map = this.scene.map;
		const id = this.scene.mapId;
		if (!map || id === undefined) return "passoGrama";
		const [x, y] = cellOfPoint(mapCorner(id, this.scene.mapSlot), at);
		const tile = map.ground(x, y);
		if (!tile) return "passoGrama";
		return tile[0] === "castelo" ? "passoPedra" : "passoTabua";
	}

	private watchPlace(player: Player) {
		if (player === Players.LocalPlayer) return;
		this.places.set(player, placeOf(player)?.key);
		player.GetAttributeChangedSignal(MAP_ATTRIBUTE).Connect(() =>
			task.defer(() => {
				const before = this.places.get(player);
				const after = placeOf(player)?.key;
				this.places.set(player, after);
				if (before === after) return;
				const mine = this.scene.mapKey;
				const where = () => {
					const root = player.Character?.FindFirstChild("HumanoidRootPart");
					return root?.IsA("BasePart") ? root.Position : undefined;
				};
				if (before === mine) {
					const at = where();
					if (at) this.play("porta", at, OTHER_PLAYER_VOLUME);
				} else if (after === mine) {
					// O servidor leva o personagem à chegada logo depois de gravar o mapa.
					task.delay(0.3, () => {
						const at = where();
						if (at && placeOf(player)?.key === this.scene.mapKey) this.play("porta", at, OTHER_PLAYER_VOLUME);
					});
				}
			}),
		);
	}
}
