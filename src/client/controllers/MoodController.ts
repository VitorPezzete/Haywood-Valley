import { Controller, OnStart } from "@flamework/core";
import { subscribe } from "@rbxts/charm";
import { Players, RunService, TextChatService } from "@rbxts/services";
import { WALK_SPEED } from "shared/character";
import { chatMood, isReaction, Mood, Moods, REACTION_COOLDOWN } from "shared/moods";
import { Events } from "client/network";
import { screen } from "client/state/screen";
import { CharacterController } from "./CharacterController";
import { MovementController } from "./MovementController";

/** Depois de entrar no jogo, o tempo até o boneco cumprimentar: o véu da abertura ainda está saindo. */
const GREET_DELAY = 1.6;
/** Andando contra um obstáculo por este tempo, em segundos, o boneco reclama; e só volta a reclamar depois do intervalo. */
const BUMP_SECONDS = 0.3;
const BUMP_COOLDOWN = 4;
/** Distância, em studs, em que outro jogador conta como encontro, e o intervalo até cumprimentar o mesmo de novo. */
const MEET_DISTANCE = 1.5;
const MEET_COOLDOWN = 90;
/** De quanto em quanto tempo os encontros são conferidos, em segundos. */
const MEET_EVERY = 0.25;
/** Andando sem parar por um tempo sorteado neste intervalo, em segundos, o boneco se anima. */
const STROLL_MIN = 40;
const STROLL_MAX = 80;

/**
 * Faz o rosto do jogador reagir ao que acontece com ele, sem ele escolher nada: cumprimenta ao
 * entrar e ao encontrar alguém, reclama ao esbarrar, se anima num passeio comprido e acompanha o
 * que ele escreve no chat. A reação aparece na hora no boneco dele e vai pelo servidor aos outros.
 * O sono de quem fica parado não passa por aqui: cada cliente conta sozinho (`CharacterController`).
 */
@Controller()
export class MoodController implements OnStart {
	private random = new Random();
	private last = -math.huge;
	private lastBump = -math.huge;
	private blockedSince?: number;
	private walkingSince?: number;
	private strollAfter = this.random.NextNumber(STROLL_MIN, STROLL_MAX);
	private nextMeet = 0;
	/** Quando cada jogador foi cumprimentado pela última vez. */
	private met = new Map<Player, number>();

	constructor(
		private characters: CharacterController,
		private movement: MovementController,
	) {}

	onStart() {
		Events.reacted.connect((userId, reaction, bubble) => {
			if (!isReaction(reaction)) return;
			const player = Players.GetPlayerByUserId(userId);
			if (player && player !== Players.LocalPlayer) this.characters.react(player, reaction, bubble);
		});

		subscribe(screen, (value) => {
			if (value !== "playing") return;
			// O tempo no menu e na personalização não conta como ficar parado.
			this.characters.touch(Players.LocalPlayer);
			task.delay(GREET_DELAY, () => this.feel(Moods.greet));
		});

		TextChatService.SendingMessage.Connect((message) => this.feel(chatMood(message.Text)));
		Players.PlayerRemoving.Connect((player) => this.met.delete(player));
		RunService.Heartbeat.Connect(() => this.watch());
	}

	/**
	 * Dispara uma reação no rosto do jogador, aqui e nos outros clientes. Outras partes do jogo
	 * (colheita, pesca, conversa) chamam isto quando algo acontece. Devolve se a reação saiu.
	 */
	feel(mood: Mood) {
		if (mood.reaction < 0 || screen() !== "playing") return false;
		const now = os.clock();
		if (now - this.last < REACTION_COOLDOWN) return false;
		this.last = now;
		this.characters.react(Players.LocalPlayer, mood.reaction, mood.bubble);
		Events.react.fire(mood.reaction, mood.bubble);
		return true;
	}

	private watch() {
		if (screen() !== "playing") return;
		const character = Players.LocalPlayer.Character;
		const humanoid = character?.FindFirstChildOfClass("Humanoid");
		const root = character?.FindFirstChild("HumanoidRootPart");
		if (!humanoid || !root?.IsA("BasePart")) return;

		const now = os.clock();
		const velocity = root.AssemblyLinearVelocity;
		const speed = math.sqrt(velocity.X * velocity.X + velocity.Z * velocity.Z);

		// Esbarrão: o jogador manda andar e o boneco não sai do lugar.
		const pushing = humanoid.MoveDirection.Magnitude > 0.5 && !this.movement.holding();
		if (pushing && speed < WALK_SPEED * 0.25) {
			this.blockedSince ??= now;
			if (now - this.blockedSince >= BUMP_SECONDS && now - this.lastBump >= BUMP_COOLDOWN) {
				if (this.feel(Moods.bump)) this.lastBump = now;
			}
		} else {
			this.blockedSince = undefined;
		}

		// Passeio: andando há bastante tempo sem parar.
		if (speed > WALK_SPEED * 0.6) {
			this.walkingSince ??= now;
			if (now - this.walkingSince >= this.strollAfter) {
				this.feel(Moods.stroll);
				this.walkingSince = now;
				this.strollAfter = this.random.NextNumber(STROLL_MIN, STROLL_MAX);
			}
		} else {
			this.walkingSince = undefined;
		}

		// Encontro: outro jogador chegou perto.
		if (now >= this.nextMeet) {
			this.nextMeet = now + MEET_EVERY;
			for (const other of Players.GetPlayers()) {
				if (other === Players.LocalPlayer) continue;
				if (now - (this.met.get(other) ?? -math.huge) < MEET_COOLDOWN) continue;
				const otherRoot = other.Character?.FindFirstChild("HumanoidRootPart");
				if (!otherRoot?.IsA("BasePart")) continue;
				const offset = otherRoot.Position.sub(root.Position);
				if (offset.X * offset.X + offset.Z * offset.Z > MEET_DISTANCE * MEET_DISTANCE) continue;
				this.met.set(other, now);
				this.feel(Moods.greet);
			}
		}
	}
}
