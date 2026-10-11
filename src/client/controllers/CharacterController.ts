import { Controller, OnStart } from "@flamework/core";
import { Players, RunService } from "@rbxts/services";
import { DEFAULT_LOOK, Look, LOOK_ATTRIBUTE, parseLook } from "shared/appearance";
import { FacePose, Faces } from "shared/faces";
import { DROWSY_AFTER, Moods, SLEEP_AFTER } from "shared/moods";
import { ART_PX_PER_STUD, LOOK as CAMERA_LOOK, SCREEN_RIGHT, SCREEN_UP, TOWARD_CAMERA, snapToArtPx } from "shared/view";
import { WALK_FRAMES } from "shared/wardrobe";
import { Card, cardCFrame, createCard } from "client/world/card";
import {
	BLINK_POSE,
	BUBBLE_FRAME,
	bubbleOffset,
	CHARACTER_ANCHOR,
	CHARACTER_FRAME,
	CharacterLayer,
	FACE_SHEET,
	layerExtent,
	layerOffset,
	layerPosition,
	layerRect,
	layerShows,
	lookLayers,
	MAX_LAYERS,
	reactionPoseIndex,
	WALK_FPS,
} from "client/world/characterArt";
import { GroundLayer } from "client/world/ground";
import { Facing, Sprites } from "client/world/sprites";
import { SceneController } from "./SceneController";

/** Abaixo desta velocidade, em studs por segundo, o personagem conta como parado. */
const MOVING_SPEED = 0.5;
/** Quem já olha para um eixo só troca quando o outro passa com folga; evita piscar na diagonal. */
const AXIS_BIAS = 1.25;

const SHADOW = Sprites.rockShadow;

/** Quanto tempo os olhos ficam fechados numa piscada e o intervalo entre duas, em segundos. */
const BLINK_SECONDS = 0.13;
const BLINK_MIN = 2.5;
const BLINK_MAX = 6;

/** O balão encosta a ponta de baixo no ponto do chão; daí sobe até ficar acima do cabelo. */
const BUBBLE_ANCHOR = new Vector2(BUBBLE_FRAME.X / 2, BUBBLE_FRAME.Y);
/** Altura da borda de baixo do balão acima da sola, em pixels de arte, sem chapéu e com chapéu. */
const BUBBLE_RISE = 22;
const BUBBLE_RISE_HAT = 27;
/** Quanto o balão vem para perto da câmera, em studs, para ser desenhado depois do boneco. */
const BUBBLE_NUDGE = 0.05;
/** Poses que cabem na chave de uma reação; nenhuma tem tantas. */
const POSE_SLOTS = 8;

/** Uma reação em curso no rosto: qual, desde quando e se o balão dela aparece. */
interface Feeling {
	reaction: number;
	started: number;
	bubble: boolean;
}

interface Actor {
	character: Model;
	card: Card;
	gui: SurfaceGui;
	/** Uma imagem por camada possível do visual; as que o visual não usa ficam escondidas. */
	labels: ImageLabel[];
	/** As camadas em uso, na mesma ordem de `labels`. */
	layers: CharacterLayer[];
	look: Look;
	shadow: ImageLabel;
	facing: Facing;
	/** Quadro e direção já aplicados às camadas; -1 manda aplicar de novo. */
	shown: number;
	/** Rosto já aplicado: 0 é o do visual, -1 a piscada e os demais uma pose de reação. */
	pose: number;
	nextBlink: number;
	/** A reação que alguma coisa disparou; vale até o tempo dela acabar. */
	feeling?: Feeling;
	/** O sono de quem está parado há muito tempo; só os campos mudam, para não criar tabela a cada quadro. */
	rest: Feeling;
	/** Desde quando o boneco está parado e sem reagir. */
	stillSince: number;
	bubble?: Card;
	/** Balão à mostra, ou -1. */
	bubbleShown: number;
	/** Se o boneco já foi posto no lugar ao menos uma vez; até lá ele fica escondido. */
	placed: boolean;
	lookChanged: RBXScriptConnection;
}

/**
 * Desenha o sprite de cada jogador sobre o personagem do Roblox dele, que é invisível e só serve
 * para andar, colidir e chegar aos outros clientes. O visual vem do atributo que o servidor guarda
 * no jogador; cada peça é uma camada. As peças do corpo mostram o mesmo quadro do andar; as do
 * rosto são células pequenas que acompanham a cabeça.
 *
 * O rosto muda sozinho: pisca, fica sonolento e dorme quando o boneco passa muito tempo parado, e
 * mostra as reações que o `MoodController` de cada jogador dispara.
 */
@Controller()
export class CharacterController implements OnStart {
	private actors = new Map<Player, Actor>();
	private random = new Random();

	constructor(private scene: SceneController) {}

	onStart() {
		Players.PlayerAdded.Connect((player) => this.watch(player));
		Players.PlayerRemoving.Connect((player) => this.remove(player));
		for (const player of Players.GetPlayers()) this.watch(player);
		RunService.BindToRenderStep("CharacterSprites", Enum.RenderPriority.Camera.Value - 1, () => this.update());
	}

	/** Mostra a reação `reaction` (de `Faces.reactions`) no rosto de `player`, com ou sem o balão dela. */
	react(player: Player, reaction: number, bubble: boolean) {
		const actor = this.actors.get(player);
		if (!actor || !Faces.reactions[reaction]) return;
		const now = os.clock();
		actor.feeling = { reaction, started: now, bubble };
		actor.stillSince = now;
	}

	/** Conta como atividade: quem estava quase dormindo volta a ficar acordado. */
	touch(player: Player) {
		const actor = this.actors.get(player);
		if (actor) actor.stillSince = os.clock();
	}

	private watch(player: Player) {
		player.CharacterAdded.Connect((character) => this.add(player, character));
		player.CharacterRemoving.Connect(() => this.remove(player));
		if (player.Character) this.add(player, player.Character);
	}

	private add(player: Player, character: Model) {
		this.remove(player);
		const card = createCard(
			this.scene.world,
			player.Name,
			{ image: "", size: CHARACTER_FRAME, anchor: CHARACTER_ANCHOR, frames: [Vector2.zero] },
			Vector3.zero,
		);
		const gui = card.image.Parent as SurfaceGui;
		// O personagem pode chegar antes das partes dele: o boneco só aparece quando há onde pôr.
		gui.Enabled = false;

		// As imagens são irmãs criadas em ordem, então as de cima cobrem as de baixo.
		const labels = [card.image];
		for (let index = 1; index < MAX_LAYERS; index++) {
			const label = card.image.Clone();
			label.Parent = gui;
			labels.push(label);
		}

		const shadow = this.scene.ground.addFlat(SHADOW, Vector3.zero, GroundLayer.Shadow);
		shadow.Visible = false;

		const now = os.clock();
		const actor: Actor = {
			character,
			card,
			gui,
			labels,
			layers: [],
			look: this.lookOf(player),
			shadow,
			facing: Facing.Front,
			shown: -1,
			pose: 0,
			nextBlink: now + this.random.NextNumber(BLINK_MIN, BLINK_MAX),
			rest: { reaction: -1, started: 0, bubble: false },
			stillSince: now,
			bubbleShown: -1,
			placed: false,
			lookChanged: player.GetAttributeChangedSignal(LOOK_ATTRIBUTE).Connect(() => {
				actor.look = this.lookOf(player);
				actor.pose = 0;
				this.dress(actor);
			}),
		};
		this.dress(actor);
		this.actors.set(player, actor);
	}

	private lookOf(player: Player) {
		return parseLook(player.GetAttribute(LOOK_ATTRIBUTE)) ?? DEFAULT_LOOK;
	}

	/** Troca as camadas do sprite pelas do visual, com o rosto de `pose` se houver. */
	private dress(actor: Actor, pose?: FacePose) {
		const layers = lookLayers(actor.look, pose);
		actor.layers = layers;
		for (let index = 0; index < actor.labels.size(); index++) {
			const label = actor.labels[index];
			const layer = layers[index];
			if (!layer) {
				label.Visible = false;
				continue;
			}
			label.Image = layer.image;
			label.ImageColor3 = layer.color;
			label.ImageRectSize = layerRect(layer);
			label.Size = layerExtent(layer);
			label.Position = layerPosition(layer, 0);
		}
		// O recorte entra junto, para nenhuma camada mostrar por um instante o bloco errado.
		const frame = actor.shown >= 0 ? math.floor(actor.shown / 4) : 0;
		actor.shown = -1;
		this.show(actor, frame);
	}

	/** Põe todas as camadas no quadro `frame` do andar, na direção em que o boneco olha. */
	private show(actor: Actor, frame: number) {
		const key = frame * 4 + actor.facing;
		if (key === actor.shown) return;
		actor.shown = key;
		for (let index = 0; index < actor.layers.size(); index++) {
			const layer = actor.layers[index];
			const label = actor.labels[index];
			label.ImageRectOffset = layerOffset(layer, frame, actor.facing);
			if (layer.face) label.Position = layerPosition(layer, frame);
			label.Visible = layerShows(layer, actor.facing);
		}
	}

	private remove(player: Player) {
		const actor = this.actors.get(player);
		if (!actor) return;
		actor.lookChanged.Disconnect();
		actor.card.part.Destroy();
		actor.bubble?.part.Destroy();
		actor.shadow.Destroy();
		this.actors.delete(player);
	}

	/**
	 * A reação que vale agora no rosto: a que alguma coisa disparou, enquanto durar, ou o sono de
	 * quem está parado há muito tempo. Sem nenhuma, o rosto é o do visual (e pisca).
	 */
	private feelingOf(actor: Actor, now: number): Feeling | undefined {
		const fired = actor.feeling;
		if (fired) {
			if (now - fired.started < Faces.reactions[fired.reaction].seconds) return fired;
			actor.feeling = undefined;
			actor.nextBlink = now + this.random.NextNumber(BLINK_MIN, BLINK_MAX);
		}

		const still = now - actor.stillSince;
		const asleep = still >= SLEEP_AFTER && Moods.sleep.reaction >= 0;
		const mood = asleep ? Moods.sleep : still >= DROWSY_AFTER ? Moods.drowsy : undefined;
		if (!mood || mood.reaction < 0) return undefined;
		const rest = actor.rest;
		rest.reaction = mood.reaction;
		rest.started = actor.stillSince + (mood === Moods.sleep ? SLEEP_AFTER : DROWSY_AFTER);
		rest.bubble = mood.bubble;
		return rest;
	}

	/** Mostra o balão `bubble` em cima da cabeça, ou esconde o que estiver lá se for -1. */
	private float(actor: Actor, bubble: number, position: Vector3, elapsed: number) {
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
		const rise = (actor.look.hat > 0 ? BUBBLE_RISE_HAT : BUBBLE_RISE) + hop;
		card.part.CFrame = cardCFrame(BUBBLE_FRAME, BUBBLE_ANCHOR, position)
			.add(SCREEN_UP.mul(rise / ART_PX_PER_STUD))
			.sub(CAMERA_LOOK.mul(BUBBLE_NUDGE));
		if (bubble !== actor.bubbleShown) {
			actor.bubbleShown = bubble;
			card.image.ImageRectOffset = bubbleOffset(bubble);
			(card.image.Parent as SurfaceGui).Enabled = true;
		}
	}

	private update() {
		const now = os.clock();
		const walkFrame = math.floor(now * WALK_FPS) % WALK_FRAMES;

		for (const [, actor] of this.actors) {
			const root = actor.character.FindFirstChild("HumanoidRootPart");
			if (!root?.IsA("BasePart")) continue;

			const velocity = root.AssemblyLinearVelocity;
			const right = velocity.Dot(SCREEN_RIGHT);
			const down = velocity.Dot(TOWARD_CAMERA);
			const moving = math.sqrt(right * right + down * down) > MOVING_SPEED;
			if (moving) {
				actor.stillSince = now;
				const sideways = actor.facing === Facing.Left || actor.facing === Facing.Right;
				if (math.abs(right) * (sideways ? AXIS_BIAS : 1) > math.abs(down) * (sideways ? 1 : AXIS_BIAS)) {
					actor.facing = right < 0 ? Facing.Left : Facing.Right;
				} else {
					actor.facing = down > 0 ? Facing.Front : Facing.Back;
				}
			}

			// O rosto: a pose da reação em curso, a piscada, ou o rosto do visual.
			let pose: FacePose | undefined;
			let key = 0;
			let bubble = -1;
			let elapsed = 0;
			const feeling = this.feelingOf(actor, now);
			if (feeling) {
				const reaction = Faces.reactions[feeling.reaction];
				elapsed = now - feeling.started;
				const index = reactionPoseIndex(reaction, elapsed);
				pose = reaction.poses[index];
				key = 1 + feeling.reaction * POSE_SLOTS + index;
				if (feeling.bubble) bubble = reaction.bubble;
			} else if (now >= actor.nextBlink) {
				if (now < actor.nextBlink + BLINK_SECONDS) {
					pose = BLINK_POSE;
					key = -1;
				} else {
					actor.nextBlink = now + this.random.NextNumber(BLINK_MIN, BLINK_MAX);
				}
			}
			if (key !== actor.pose) {
				actor.pose = key;
				this.dress(actor, pose);
			}

			const position = snapToArtPx(new Vector3(root.Position.X, 0, root.Position.Z));
			actor.card.part.CFrame = cardCFrame(CHARACTER_FRAME, CHARACTER_ANCHOR, position);
			// O primeiro quadro do andar é o parado.
			this.show(actor, moving ? walkFrame : 0);
			this.scene.ground.moveFlat(actor.shadow, SHADOW, position);
			this.float(actor, bubble, position, elapsed);

			if (!actor.placed) {
				actor.placed = true;
				actor.gui.Enabled = true;
				actor.shadow.Visible = true;
			}
		}
	}
}
