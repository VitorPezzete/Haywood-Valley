import { Controller, OnStart } from "@flamework/core";
import { Players, RunService } from "@rbxts/services";
import { DEFAULT_LOOK, Look, LOOK_ATTRIBUTE, parseLook } from "shared/appearance";
import { MAP_ATTRIBUTE, MAP_OWNER_ATTRIBUTE, MAP_SLOT_ATTRIBUTE, placeOf } from "shared/interiorChoice";
import { WALK_SPEED } from "shared/character";
import { Faces } from "shared/faces";
import { DROWSY_AFTER, Moods, SLEEP_AFTER } from "shared/moods";
import {
	ART_PX_PER_STUD,
	LOOK as CAMERA_LOOK,
	SCREEN_RIGHT,
	SCREEN_UP,
	TOWARD_CAMERA,
	VIEW_DEPTH_PER_PX,
	snapToArtPx,
	worldToArtPx,
} from "shared/view";
import { Card, cardCFrame, createCard } from "client/world/card";
import {
	ACTOR_FEET,
	ACTOR_FIGURE,
	BLINK_MAX,
	BLINK_MIN,
	BLINK_TIME,
	facingOf,
	poseRise,
	WALK_STEP_PX,
} from "client/world/graalArt";
import { BUBBLE_FRAME, bubbleOffset, FACE_SHEET } from "client/world/characterArt";
import { ChatBalloon } from "client/world/chatBalloon";
import { GroundLayer } from "client/world/ground";
import {
	dressShell,
	pooledShells,
	poseShell,
	puppetOnScreen,
	storeShell,
	SWIM_SINK,
	takeShell,
	toneShell,
} from "client/world/puppet";
import { Sprites } from "client/world/sprites";
import { hasWadeSheet, SPLASH_FPS, SPLASH_FRAMES, WADE_FRAMES, wadeImage } from "client/world/water";
import { TILE_ANIMATION_FPS } from "client/world/interior";
import { perfBegin, perfEnd } from "client/perf";
import { ActionController, ActorPose } from "./ActionController";
import { DaylightController } from "./DaylightController";
import { SceneController } from "./SceneController";

/** Abaixo desta velocidade, em studs por segundo, o personagem conta como parado. */
const MOVING_SPEED = 0.5;
/**
 * A direção do boneco só segue o movimento acima desta velocidade: ao esbarrar num móvel, o personagem do
 * Roblox escorrega devagar para o lado, e o boneco virava de lado ou de costas para o móvel (visto em
 * 2026-10-17, segurando o baú de cima para baixo).
 */
const FACING_SPEED = WALK_SPEED * 0.4;
/** Pixels de arte andados entre dois passos do andar (meio ciclo de 8 quadros): um respingo por passo na água rasa. */
const STEP_PX = WALK_STEP_PX * 4;

const SHADOW = Sprites.rockShadow;

/** O balão encosta a ponta de baixo no ponto do chão; daí sobe até ficar acima da cabeça. */
const BUBBLE_ANCHOR = new Vector2(BUBBLE_FRAME.X / 2, BUBBLE_FRAME.Y);
/**
 * Quanto a borda de baixo do quadro do balão fica acima da altura do boneco (`figureHeight`), em
 * pixels de arte. O desenho do balão deixa linhas vazias embaixo do quadro (2 nos de emoticon), então
 * sobram uns 3 pixels entre o rabinho e o cabelo (com o Curto, o quadro fica 40 pixels acima da sola).
 */
const BUBBLE_CLEARANCE = 1;
/**
 * Quanto o balão vem para perto da câmera, para ser desenhado depois do boneco: 4 pixels de chão, na
 * profundidade comprimida do desenho.
 */
const BUBBLE_NUDGE = 4 * VIEW_DEPTH_PER_PX;

/** Uma reação em curso: qual (em `Faces.reactions`) e desde quando. */
interface Feeling {
	reaction: number;
	started: number;
}

/** O personagem do Roblox de um jogador e a parte que anda (que o streaming pode tirar deste cliente). */
interface Body {
	character: Model;
	root?: BasePart;
}

interface Actor {
	card: Card;
	gui: SurfaceGui;
	/** Uma imagem por camada possível do visual; as que o visual não usa ficam escondidas. */
	labels: ImageLabel[];
	hands: ImageLabel[];
	item: ImageLabel;
	wadeBack: ImageLabel;
	wadeFront: ImageLabel;
	splash: ImageLabel;
	character: Model;
	splashStart: number;
	splashFoot: number;
	step: number;
	/** As camadas em uso, na mesma ordem de `labels`. */
	layers: ReturnType<typeof dressShell>["layers"];
	height: number;
	shadow: ImageLabel;
	facing: number;
	nextBlink: number;
	shownAnim: number;
	shownFrame: number;
	shownFacing: number;
	shownClosed: boolean;
	shownSwim: boolean;
	shownItemImage?: string;
	shownItemOffset?: Vector2;
	/** A reação que alguma coisa disparou; vale até o tempo dela acabar. */
	feeling?: Feeling;
	/** O sono de quem está parado há muito tempo; só os campos mudam, para não criar tabela a cada quadro. */
	rest: Feeling;
	/** Desde quando o boneco está parado e sem reagir. */
	stillSince: number;
	bubble?: Card;
	/** Balão à mostra, ou -1. */
	bubbleShown: number;
	chat?: ChatBalloon;
	/** Se o boneco já foi posto no lugar ao menos uma vez; até lá ele fica escondido. */
	placed: boolean;
	walked: number;
	lastPx?: Vector2;
	shadowAt?: Vector3;
	litKey: number;
	litAt?: Vector3;
	lit?: ReturnType<DaylightController["lightAt"]>;
	onScreen: boolean;
	lookChanged: RBXScriptConnection;
}

type FrameListener = (player: Player, position: Vector3, pose: ActorPose, moving: boolean, stepped: boolean) => void;

/**
 * Desenha o sprite de cada jogador sobre o personagem do Roblox dele, que é invisível e só serve
 * para andar, colidir e chegar aos outros clientes. O boneco é uma cabeça e um corpo dos
 * contribuidores, no formato do Graal, em camadas pintadas conforme o visual que o servidor guarda no
 * jogador, em 4 direções, parado ou andando, piscando de vez em quando.
 *
 * As reações não têm rosto neste boneco: cada uma aparece pelo balão em cima da cabeça. Quem fica
 * muito tempo parado fica entediado e depois dorme; as demais reações vêm do `MoodController`.
 *
 * O que o jogador escreve no chat aparece no balão de fala (`say`, chamado pelo `ChatController`).
 * Os dois balões não se empilham: enquanto a fala está à mostra, a reação aparece como rosto dentro
 * dela, à esquerda do texto, e o balão de reação some; se a reação ainda durar quando a fala sumir,
 * o balão dela volta.
 */
@Controller()
export class CharacterController implements OnStart {
	private actors = new Map<Player, Actor>();
	private bodies = new Map<Player, Body>();
	private places = new Map<Player, string | undefined>();
	private watchers = new Map<Player, RBXScriptConnection[]>();
	private random = new Random();
	private frameListeners = new Array<FrameListener>();

	constructor(
		private scene: SceneController,
		private actions: ActionController,
		private daylight: DaylightController,
	) {}

	onActorFrame(listener: FrameListener) {
		this.frameListeners.push(listener);
	}

	onStart() {
		Players.PlayerAdded.Connect((player) => this.watch(player));
		Players.PlayerRemoving.Connect((player) => this.forgetPlayer(player));
		for (const player of Players.GetPlayers()) this.watch(player);
		RunService.BindToRenderStep("CharacterSprites", Enum.RenderPriority.Camera.Value - 1, () => this.update());

		// A sombra fica na camada viva do chão do mapa: o mapa novo tem outro chão.
		this.scene.onMapChanged(() => {
			for (const [, actor] of this.actors) {
				actor.shadow.Destroy();
				actor.shadow = this.scene.live.addFlat(SHADOW, Vector3.zero, GroundLayer.Shadow);
				actor.shadow.Visible = false;
				actor.shadowAt = undefined;
				actor.placed = false;
				actor.onScreen = false;
				actor.gui.Enabled = false;
				actor.lastPx = undefined;
				actor.litAt = undefined;
			}
		});
	}

	private sameMap(player: Player) {
		if (player === Players.LocalPlayer || this.scene.mapKey === undefined) return true;
		return this.places.get(player) === this.scene.mapKey;
	}

	private conceal(actor: Actor) {
		if (!actor.onScreen) return;
		actor.onScreen = false;
		actor.gui.Enabled = false;
		actor.shadow.Visible = false;
		actor.chat?.conceal();
		this.float(actor, -1, Vector3.zero, 0, 0);
	}

	counts() {
		let onScreen = 0;
		for (const [, actor] of this.actors) if (actor.onScreen) onScreen++;
		return { shown: this.actors.size(), onScreen, pool: pooledShells() };
	}

	react(player: Player, reaction: number, bubble: boolean) {
		const actor = this.actors.get(player);
		if (!actor || !Faces.reactions[reaction]) return;
		// Sem rosto para mudar, a reação que não sobe balão não teria o que mostrar: sobe sempre que houver.
		void bubble;
		const now = os.clock();
		actor.feeling = { reaction, started: now };
		actor.stillSince = now;
	}

	/** Conta como atividade: quem estava quase dormindo volta a ficar acordado. */
	touch(player: Player) {
		const actor = this.actors.get(player);
		if (actor) actor.stillSince = os.clock();
	}

	say(player: Player, text: string) {
		const actor = this.actors.get(player);
		// Quem está noutro mapa não aparece aqui, nem a fala dele em cima do boneco (a janela do chat continua).
		if (!actor || !this.sameMap(player)) return;
		actor.chat ??= new ChatBalloon(this.scene.world, `${actor.card.part.Name}Chat`);
		actor.chat.show(text);
		// Falar também conta como atividade.
		actor.stillSince = os.clock();
	}

	hush(player: Player) {
		this.actors.get(player)?.chat?.hide();
	}

	private watch(player: Player) {
		const refresh = () => {
			this.places.set(player, placeOf(player)?.key);
		};
		refresh();
		const connections = [
			player.GetAttributeChangedSignal(MAP_ATTRIBUTE).Connect(refresh),
			player.GetAttributeChangedSignal(MAP_OWNER_ATTRIBUTE).Connect(refresh),
			player.GetAttributeChangedSignal(MAP_SLOT_ATTRIBUTE).Connect(refresh),
			player.CharacterAdded.Connect((character) => this.setBody(player, character)),
			player.CharacterRemoving.Connect(() => this.setBody(player, undefined)),
		];
		this.watchers.set(player, connections);
		if (player.Character) this.setBody(player, player.Character);
	}

	private setBody(player: Player, character: Model | undefined) {
		this.release(player);
		if (character) this.bodies.set(player, { character });
		else this.bodies.delete(player);
	}

	private rootOf(body: Body) {
		const known = body.root;
		if (known && known.Parent === body.character) return known;
		const found = body.character.FindFirstChild("HumanoidRootPart");
		body.root = found?.IsA("BasePart") ? found : undefined;
		return body.root;
	}

	private add(player: Player, character: Model) {
		const shell = takeShell(this.scene.world, player.Name);
		const shadow = this.scene.live.addFlat(SHADOW, Vector3.zero, GroundLayer.Shadow);
		shadow.Visible = false;

		const now = os.clock();
		const actor: Actor = {
			card: shell.card,
			gui: shell.gui,
			labels: shell.labels,
			hands: shell.hands,
			item: shell.item,
			wadeBack: shell.wadeBack,
			wadeFront: shell.wadeFront,
			splash: shell.splash,
			character,
			splashStart: -1,
			splashFoot: 0,
			step: 0,
			layers: [],
			height: 0,
			shadow,
			facing: 2,
			nextBlink: now + this.random.NextNumber(BLINK_MIN, BLINK_MAX),
			shownAnim: -1,
			shownFrame: -1,
			shownFacing: -1,
			shownClosed: false,
			shownSwim: false,
			rest: { reaction: -1, started: 0 },
			stillSince: now,
			bubbleShown: -1,
			placed: false,
			walked: 0,
			litKey: -1,
			onScreen: false,
			lookChanged: player
				.GetAttributeChangedSignal(LOOK_ATTRIBUTE)
				.Connect(() => this.dress(actor, this.lookOf(player))),
		};
		this.dress(actor, this.lookOf(player));
		this.actors.set(player, actor);
		return actor;
	}

	private lookOf(player: Player) {
		return parseLook(player.GetAttribute(LOOK_ATTRIBUTE)) ?? DEFAULT_LOOK;
	}

	private dress(actor: Actor, look: Look) {
		const dressed = dressShell(actor, look, actor.facing);
		actor.layers = dressed.layers;
		actor.height = dressed.height;
		actor.shownAnim = -1;
	}

	private release(player: Player) {
		const actor = this.actors.get(player);
		if (!actor) return;
		actor.lookChanged.Disconnect();
		this.actions.forget(player);
		actor.bubble?.part.Destroy();
		actor.chat?.destroy();
		actor.shadow.Destroy();
		this.actors.delete(player);
		storeShell({
			card: actor.card,
			gui: actor.gui,
			labels: actor.labels,
			hands: actor.hands,
			item: actor.item,
			wadeBack: actor.wadeBack,
			wadeFront: actor.wadeFront,
			splash: actor.splash,
		});
	}

	private forgetPlayer(player: Player) {
		this.release(player);
		this.bodies.delete(player);
		this.places.delete(player);
		for (const connection of this.watchers.get(player) ?? []) connection.Disconnect();
		this.watchers.delete(player);
	}

	private feelingOf(actor: Actor, now: number): Feeling | undefined {
		const fired = actor.feeling;
		if (fired) {
			if (now - fired.started < Faces.reactions[fired.reaction].seconds) return fired;
			actor.feeling = undefined;
		}

		const still = now - actor.stillSince;
		const asleep = still >= SLEEP_AFTER && Moods.sleep.reaction >= 0;
		const mood = asleep ? Moods.sleep : still >= DROWSY_AFTER ? Moods.drowsy : undefined;
		if (!mood || mood.reaction < 0) return undefined;
		const rest = actor.rest;
		rest.reaction = mood.reaction;
		rest.started = actor.stillSince + (asleep ? SLEEP_AFTER : DROWSY_AFTER);
		return rest;
	}

	private pose(actor: Actor, pose: ActorPose, closed: boolean) {
		poseShell(actor, actor, pose, closed);
	}

	/** Mostra o balão `bubble` em cima da cabeça, ou esconde o que estiver lá se for -1. */
	private float(actor: Actor, bubble: number, position: Vector3, elapsed: number, height: number) {
		if (bubble < 0) {
			if (actor.bubbleShown >= 0 && actor.bubble) (actor.bubble.image.Parent as SurfaceGui).Enabled = false;
			actor.bubbleShown = -1;
			return;
		}
		actor.bubble ??= createCard(
			this.scene.world,
			`${actor.card.part.Name}Bubble`,
			{ image: FACE_SHEET, size: BUBBLE_FRAME, anchor: BUBBLE_ANCHOR, frames: [Vector2.zero] },
			position,
		);
		const card = actor.bubble;
		// O balão salta para o lugar e depois flutua um pixel para cima e para baixo.
		const hop = elapsed < 0.08 ? -3 : elapsed < 0.16 ? 1 : math.floor(elapsed * 2) % 2;
		card.part.CFrame = cardCFrame(BUBBLE_FRAME, BUBBLE_ANCHOR, position)
			.add(SCREEN_UP.mul((height + BUBBLE_CLEARANCE + hop) / ART_PX_PER_STUD))
			.sub(CAMERA_LOOK.mul(BUBBLE_NUDGE));
		if (bubble !== actor.bubbleShown) {
			actor.bubbleShown = bubble;
			card.image.ImageRectOffset = bubbleOffset(bubble);
			(card.image.Parent as SurfaceGui).Enabled = true;
		}
	}

	private light(actor: Actor, position: Vector3) {
		const key = this.daylight.lightKey();
		if (key === actor.litKey && position === actor.litAt) return;
		actor.litKey = key;
		actor.litAt = position;
		const lit = this.daylight.lightAt(position);
		if (lit === actor.lit) return;
		actor.lit = lit;
		toneShell(actor, lit);
	}

	private wade(actor: Actor, pose: ActorPose, moving: boolean, now: number) {
		const step = math.floor(actor.walked / STEP_PX);
		const stepped = step !== actor.step;
		actor.step = step;
		const inWater = pose.wade;
		actor.wadeFront.Visible = inWater;
		const sheet = hasWadeSheet();
		actor.wadeBack.Visible = inWater && sheet;
		if (!inWater || !sheet) {
			actor.splash.Visible = false;
			actor.splashStart = -1;
			return stepped;
		}
		const frame = math.floor(now * TILE_ANIMATION_FPS) % WADE_FRAMES;
		const set = (label: ImageLabel, row: number, index: number) => {
			const offset = wadeImage(row, index)[1];
			if (label.ImageRectOffset !== offset) label.ImageRectOffset = offset;
		};
		set(actor.wadeBack, 0, frame);
		set(actor.wadeFront, 1, frame);
		if (moving && stepped) {
			actor.splashStart = now;
			actor.splashFoot = 1 - actor.splashFoot;
		}
		const splashFrame = actor.splashStart < 0 ? -1 : math.floor((now - actor.splashStart) * SPLASH_FPS);
		const splashing = splashFrame >= 0 && splashFrame < SPLASH_FRAMES;
		actor.splash.Visible = splashing;
		if (splashing) set(actor.splash, actor.splashFoot === 0 ? 2 : 3, splashFrame);
		else actor.splashStart = -1;
		return stepped;
	}

	private update() {
		const started = perfBegin("Bonecos");
		const now = os.clock();

		for (const [player, body] of this.bodies) {
			const root = this.rootOf(body);
			// Noutro mapa, ou com o personagem fora deste cliente (o streaming o tirou, longe): o boneco volta ao
			// reservatório, sem deixar fantasma parado onde ele estava.
			if (!root || !this.sameMap(player)) {
				this.release(player);
				continue;
			}
			const actor = this.actors.get(player) || this.add(player, body.character);

			// O andar troca de quadro a cada `WALK_STEP_PX` andados na tela, como o Graal no passo dele.
			const screenPx = worldToArtPx(root.Position);
			if (actor.lastPx) actor.walked += screenPx.sub(actor.lastPx).Magnitude;
			actor.lastPx = screenPx;

			const velocity = root.AssemblyLinearVelocity;
			const right = velocity.Dot(SCREEN_RIGHT);
			const down = velocity.Dot(TOWARD_CAMERA);
			const speed = math.sqrt(right * right + down * down);
			const moving = speed > MOVING_SPEED;
			if (moving) actor.stillSince = now;
			if (speed > FACING_SPEED) actor.facing = facingOf(right, down, actor.facing);

			// Fora da tela (com a folga), nada de pose, luz, água nem balão (seção 3.3 do `PLANO_OTIMIZACAO.md`). O
			// próprio jogador está sempre nela.
			if (player !== Players.LocalPlayer && !puppetOnScreen(screenPx)) {
				this.conceal(actor);
				continue;
			}

			// A ação (sentar, deitar, nadar, empurrar, segurar, puxar, carregar) decide a pose e pode virar o boneco.
			const ground = snapToArtPx(new Vector3(root.Position.X, 0, root.Position.Z));
			const pose = this.actions.poseFor(player, ground, moving, actor.facing, actor.walked);
			actor.facing = pose.facing;
			if (pose.anim === 3) actor.stillSince = math.min(actor.stillSince, now - SLEEP_AFTER);

			if (now >= actor.nextBlink + BLINK_TIME) actor.nextBlink = now + this.random.NextNumber(BLINK_MIN, BLINK_MAX);
			// Deitado, de olho fechado.
			const closed = now >= actor.nextBlink || pose.anim === 3;
			// A pose mudou? Campo a campo, sem montar texto.
			const item = pose.item;
			if (
				pose.anim !== actor.shownAnim ||
				pose.frame !== actor.shownFrame ||
				pose.facing !== actor.shownFacing ||
				closed !== actor.shownClosed ||
				pose.swim !== actor.shownSwim ||
				item?.image !== actor.shownItemImage ||
				item?.offset !== actor.shownItemOffset
			) {
				actor.shownAnim = pose.anim;
				actor.shownFrame = pose.frame;
				actor.shownFacing = pose.facing;
				actor.shownClosed = closed;
				actor.shownSwim = pose.swim;
				actor.shownItemImage = item?.image;
				actor.shownItemOffset = item?.offset;
				this.pose(actor, pose, closed);
			}

			const position = pose.at ? snapToArtPx(pose.at) : ground;
			this.light(actor, position);
			// O cartão e a sombra só se mexem quando o pé muda de pixel de arte: a sombra fica na camada viva do chão.
			if (position !== actor.shadowAt) {
				actor.shadowAt = position;
				actor.card.part.CFrame = cardCFrame(ACTOR_FIGURE, ACTOR_FEET, position);
				this.scene.live.moveFlat(actor.shadow, SHADOW, position);
			}
			const shadowShown = actor.placed && pose.shadow;
			if (actor.shadow.Visible !== shadowShown) actor.shadow.Visible = shadowShown;
			const stepped = this.wade(actor, pose, moving, now);
			for (const listener of this.frameListeners) listener(player, position, pose, moving, stepped);

			const bubbles = perfBegin("Baloes");
			const feeling = this.feelingOf(actor, now);
			const bubble = feeling ? Faces.reactions[feeling.reaction].bubble : -1;
			// Os balões sobem com a cabeça (sentado) e descem com ela (nadando).
			const height = actor.height + poseRise(pose.anim, pose.facing) - (pose.swim ? SWIM_SINK : 0);
			// Com a fala à mostra, a reação vai como rosto dentro dela e o balão de reação fica escondido.
			const talking = actor.chat?.update(now, position, height, bubble) ?? false;
			this.float(actor, talking ? -1 : bubble, position, feeling ? now - feeling.started : 0, height);
			perfEnd("Baloes", bubbles);

			if (!actor.onScreen) {
				actor.placed = true;
				actor.onScreen = true;
				actor.gui.Enabled = true;
				actor.shadow.Visible = pose.shadow;
			}
		}
		perfEnd("Bonecos", started);
	}
}
