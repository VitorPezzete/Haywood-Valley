import { Controller, OnStart } from "@flamework/core";
import { subscribe } from "@rbxts/charm";
import { Players, RunService, UserInputService } from "@rbxts/services";
import { mount, source } from "@rbxts/vide";
import {
	ACTION_ATTRIBUTE,
	encodeAction,
	parseAction,
	PUSH_AFTER,
	PUSH_STREAK,
	SIT_TURN_HOLD,
} from "shared/actions";
import { TAP_CLOSED } from "shared/interiorMap";
import { decorItem, decorParts, parseColors } from "shared/decor";
import { chestOfPiece, CHEST_TAP_SECONDS } from "shared/fixtures";
import {
	canLift,
	canPull,
	canPush,
	dirStep,
	frontSpot,
	handlingOf,
	PieceBoard,
	STEP_SECONDS,
	TAP_REACH,
} from "shared/pieces";
import { groundOffset, SCREEN_RIGHT, TOWARD_CAMERA, worldToArtPx } from "shared/view";
import { WALK_SPEED } from "shared/character";
import { Events } from "client/network";
import { perfBegin, perfEnd } from "client/perf";
import { screen } from "client/state/screen";
import { ActionHud } from "client/ui/ActionHud";
import { t } from "client/ui/i18n";
import { FixtureView } from "client/world/fixtures";
import { createCard } from "client/world/card";
import { CARRY_FRAMES, PUSH_FPS, PUSH_FRAMES, WALK_FRAMES, WALK_STEP_PX } from "client/world/graalArt";
import { INTERIOR_TILE, sheetRect } from "client/world/interior";
import { PieceView } from "client/world/pieces";
import { DialogueController } from "./DialogueController";
import { MapController } from "./MapController";
import { MovementController } from "./MovementController";
import { SceneController } from "./SceneController";

type Facing = 0 | 1 | 2 | 3;
type TextKey = Parameters<typeof t>[0];
type PieceState = NonNullable<ReturnType<PieceBoard["at"]>>;
type DecorState = Parameters<PieceBoard["setDecor"]>[0];
type Fixture = NonNullable<ReturnType<FixtureView["fixtureAt"]>>;
type FixtureCells = ReturnType<FixtureView["cellsOf"]>;
type Card = ReturnType<typeof createCard>;
type BodyAction = NonNullable<ReturnType<typeof parseAction>>;

/** As teclas da ação: F no teclado (o A do Graal é andar para a esquerda aqui) e X no controle. */
const ACTION_KEYS = new Set<Enum.KeyCode>([Enum.KeyCode.F, Enum.KeyCode.ButtonX]);
/** Quanto dura levantar o objeto do chão, em segundos, antes de ele ir para cima da cabeça. */
const LIFT_SECONDS = 0.25;
/** Abaixo desta fração do passo, quem tenta andar está parado contra alguma coisa. */
const STUCK_FRACTION = 0.3;
/** Quanto à frente do pé se procura a peça, em pixels de arte: logo depois do bloqueio do personagem. */
const REACH_PROBES = [10, 14, 20];
/**
 * Deitado, quanto o pé do desenho fica abaixo do meio da célula do travesseiro: a cabeça da pose deitada
 * tem o meio 23 pixels acima do pé (a célula de 32 em y 8 da tela, o pé em 47), e o rosto cai no travesseiro.
 */
const LIE_FEET_BELOW_PILLOW = 23;
/** Abaixo desta velocidade, em studs por segundo, quem para num assento senta. */
const SIT_STILL_SPEED = 0.5;
/** Dormir: quanto a tela leva para escurecer, quanto fica escura e quanto se espera o servidor, em segundos. */
const SLEEP_FADE = 0.6;
const SLEEP_DARK = 1.5;
const SLEEP_TIMEOUT = 8;
/** Um pedido de passo sem resposta do servidor é esquecido depois deste tempo, em segundos. */
const STEP_TIMEOUT = 1;

/** A pose de um boneco neste quadro, que o `CharacterController` desenha. */
export interface ActorPose {
	anim: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
	frame: number;
	facing: number;
	swim: boolean;
	wade: boolean;
	shadow: boolean;
	at?: Vector3;
	item?: ReturnType<PieceView["carriedArt"]>;
}

interface Holding {
	id: string;
	facing: Facing;
	confirmed: boolean;
	since: number;
	release: () => void;
}

interface Step {
	kind: "pull";
	started: number;
	from: CFrame;
	delta: Vector3;
}

interface Seat {
	facing: Facing;
	since?: number;
	release: () => void;
}

/** A direção da tela mais perto do movimento (x para a direita, z para baixo), ou nada parado. */
function dirOf(move: Vector3): Facing | undefined {
	const x = move.Dot(SCREEN_RIGHT);
	const z = move.Dot(TOWARD_CAMERA);
	if (math.abs(x) < 0.3 && math.abs(z) < 0.3) return undefined;
	if (math.abs(x) >= math.abs(z)) return x > 0 ? 3 : 1;
	return z > 0 ? 2 : 0;
}

function opposite(dir: Facing) {
	return (dir + 2) % 4;
}

/**
 * As ações do boneco, como no Graal Online Classic:
 *
 * - **Sentar** (tile 3: cadeira, sofá, vaso) e **deitar** (4 e 5: cama): o boneco anda por cima e, ao parar,
 *   senta virado para onde o assento olha (`seatFacing`) ou deita com a cabeça no travesseiro e a coberta
 *   por cima (os próprios tiles da parte de baixo da cama, num cartão na frente do boneco). Sentado, um toque
 *   numa direção vira o boneco sem levantar; segurar a direção levanta e anda (`updateSeat`).
 * - **Nadar** (11, água funda): só a cabeça e os ombros aparecem.
 * - **Água rasa** (6, "swamp" no Graal): o boneco anda com os pés na água, em qualquer pose de pé.
 * - **Empurrar**: andando contra o que bloqueia por `PUSH_AFTER`, o boneco faz força; se for uma peça que se
 *   move, ela desliza uma célula, e quem continua andando contra ela segue empurrando, célula por célula. Sem
 *   tecla, como no Graal.
 * - **Segurar e puxar**: com F (ou X no controle, ou o botão na tela) apertado de frente para uma peça, o
 *   boneco segura; só andar para trás puxa, uma célula por vez, com a peça junto. Para os lados e para a
 *   frente ele não anda enquanto segura. Soltar a tecla solta a peça.
 * - **Levantar, carregar, pôr no chão e jogar**: F de frente para um pote ou um caixote levanta acima da
 *   cabeça; com ele, F parado põe no chão à frente e F andando joga. O pote quebra ao cair; o caixote pousa.
 *
 * Sentar, deitar e nadar cada cliente tira do lugar em que o boneco parou; empurrar, segurar e puxar vêm do
 * atributo `Action` do jogador (o servidor grava o que o cliente dele pede); carregar, das peças, que são do
 * servidor (PieceService). O próprio jogador vê a ação dele na hora, sem esperar a rede.
 */
@Controller()
export class ActionController implements OnStart {
	private readonly prompt = source<TextKey | undefined>(undefined);
	private board?: PieceBoard;
	private view?: PieceView;
	private fixtures?: FixtureView;
	private corner = Vector3.zero;
	private holding?: Holding;
	private step?: Step;
	private pendingStep?: { id: string; kind: "pull"; sent: number };
	private pendingPush?: { id: string; sent: number };
	private streak?: { dir: Facing; at: number };
	private liftUntil = 0;
	private stuckSince?: number;
	private stuckFacing: Facing = 2;
	private trying?: Facing;
	private sent = "";
	private localFacing = 2;
	private localMoving = false;
	private seat?: Seat;
	private beds = new Map<Player | string, { key: string; card: Card }>();
	private closedTaps = new Set<ReturnType<PieceBoard["map"]["key"]>>();
	private localLying = false;
	private sleepRequest?: { release: () => void; since: number };
	private chestTap?: { id: string; since: number; x: number; y: number };
	private decorListeners = new Array<(key: number, state: DecorState | undefined) => void>();
	private fixtureListeners = new Array<(id: string, on: boolean, cells: FixtureCells, moved: boolean) => void>();
	private poses = new Map<Player, ActorPose>();
	private remoteActions = new Map<Player, { raw: unknown; value: BodyAction | undefined }>();

	constructor(
		private scene: SceneController,
		private movement: MovementController,
		private mapController: MapController,
		private dialogue: DialogueController,
	) {}

	onStart() {
		if (this.scene.interior) {
			// Os avisos do servidor trazem o mapa: o que chega de um mapa de onde o jogador já saiu fica de fora.
			const here = (map: string) => map === this.scene.mapKey && this.board !== undefined;
			Events.pieceChanged.connect((map, id, x, y, mode, holder, variant) => {
				if (here(map)) this.changed(id, x, y, mode, holder, variant);
			});
			Events.pieceThrown.connect((map, id, holder, x, y, mode, variant) => {
				if (here(map)) this.thrown(id, holder, x, y, mode, variant);
			});
			Events.tapChanged.connect((map, x, y, open) => {
				if (!here(map)) return;
				const key = this.board!.map.key(x, y);
				if (open) this.closedTaps.delete(key);
				else this.closedTaps.add(key);
				this.scene.interior?.setAnimatedTile(x, y, open ? undefined : TAP_CLOSED);
			});
			Events.decorChanged.connect((map, key, item, form, variant, x, y, ax, ay, colors) => {
				if (here(map)) this.decorChanged(key, item, form, variant, x, y, ax, ay, colors);
			});
			Events.fixtureChanged.connect((map, id, on) => {
				if (!here(map) || !this.fixtures) return;
				// O servidor repete o estado a quem chega (`piecesReady`): o que já estava assim não toca som de novo.
				const before = this.fixtures.isOpen(id);
				this.fixtures.set(id, on);
				if (this.fixtures.isOpen(id) === before) return;
				const cells = this.fixtures.cellsOf(id);
				for (const listener of this.fixtureListeners) listener(id, on, cells, false);
			});
			Events.slept.connect((woke, waiting) => this.slept(woke, waiting));
			this.useMap();
			this.scene.onMapChanged(() => this.useMap());
		}

		UserInputService.InputBegan.Connect((input, processed) => {
			if (!processed && ACTION_KEYS.has(input.KeyCode)) this.press();
		});
		UserInputService.InputEnded.Connect((input) => {
			if (ACTION_KEYS.has(input.KeyCode)) this.unpress();
		});
		Players.LocalPlayer.CharacterAdded.Connect(() => {
			this.stopHolding(true);
			this.leaveSeat();
		});
		RunService.Heartbeat.Connect(() => this.tick());

		const playing = source(screen() === "playing");
		subscribe(screen, (value) => playing(value === "playing"));
		mount(
			() =>
				ActionHud({
					prompt: this.prompt,
					visible: playing,
					onDown: () => this.press(),
					onUp: () => this.unpress(),
				}),
			Players.LocalPlayer.WaitForChild("PlayerGui"),
		);
	}

	private useMap() {
		const map = this.scene.map;
		const interior = this.scene.interior;
		if (!map || !interior) return;
		this.stopHolding(true);
		this.leaveSeat();
		this.pendingPush = undefined;
		this.streak = undefined;
		for (const [player] of this.beds) this.leaveBed(player);
		this.closedTaps.clear();
		this.board = new PieceBoard(map);
		this.view = new PieceView(this.board, interior);
		this.fixtures?.destroy();
		this.fixtures = new FixtureView(this.board, interior, this.scene.occlusion);
		this.corner = interior.cellCorner(0, 0);
		Events.piecesReady.fire();
	}

	currentBoard() {
		return this.board;
	}

	onDecor(listener: (key: number, state: DecorState | undefined) => void) {
		this.decorListeners.push(listener);
	}

	/**
	 * Avisa quando um baú abre ou fecha ou um fogão acende ou apaga. `moved` é o baú-peça aberto que fechou por ter
	 * saído do lugar (puxado, empurrado), sem ninguém pedir.
	 */
	onFixture(listener: (id: string, on: boolean, cells: FixtureCells, moved: boolean) => void) {
		this.fixtureListeners.push(listener);
	}

	currentFixtures() {
		return this.fixtures;
	}

	currentView() {
		return this.view;
	}

	private decorChanged(
		key: number,
		id: string,
		form: number,
		variant: number,
		x: number,
		y: number,
		ax: number,
		ay: number,
		text: string,
	) {
		const board = this.board!;
		const item = decorItem(id);
		if (!item) {
			board.removeDecor(key);
			this.view?.removeDecor(key);
			for (const listener of this.decorListeners) listener(key, undefined);
			return;
		}
		const colors = parseColors(text, decorParts(item)) ?? [];
		const state: DecorState = { key, item, form, variant, x, y, ax, ay, colors };
		board.setDecor(state);
		this.view?.refreshDecor(state);
		for (const listener of this.decorListeners) listener(key, state);
	}

	poseFor(player: Player, position: Vector3, moving: boolean, facing: number, walked: number) {
		const pose = this.choose(player, position, moving, facing, walked);
		if (pose.anim !== 3) this.leaveBed(player);
		// Na água rasa, de pé (andando, parado, carregando, empurrando), a água cobre os pés e a sombra some.
		if (this.board && !pose.swim && pose.anim !== 3 && pose.anim !== 2) {
			const [x, y] = this.cellOf(position);
			if (this.board.kind(x, y) === 6) {
				pose.wade = true;
				pose.shadow = false;
			}
		}
		if (player === Players.LocalPlayer) {
			this.localFacing = pose.facing;
			this.localMoving = moving;
			this.localLying = pose.anim === 3;
		}
		return pose;
	}

	forget(player: Player) {
		this.leaveBed(player);
		this.poses.delete(player);
		this.remoteActions.delete(player);
	}

	private remoteAction(player: Player) {
		const raw = player.GetAttribute(ACTION_ATTRIBUTE);
		const known = this.remoteActions.get(player);
		if (known && known.raw === raw) return known.value;
		const value = parseAction(raw);
		this.remoteActions.set(player, { raw, value });
		return value;
	}

	private choose(player: Player, position: Vector3, moving: boolean, facing: number, walked: number): ActorPose {
		const now = os.clock();
		const walkFrame = moving ? math.floor(walked / WALK_STEP_PX) % WALK_FRAMES : 0;
		let pose = this.poses.get(player);
		if (!pose) {
			pose = { anim: 0, frame: 0, facing, swim: false, wade: false, shadow: true };
			this.poses.set(player, pose);
		}
		// Por padrão, andando ou parado; cada caso abaixo muda só o que é dele.
		pose.anim = moving ? 1 : 0;
		pose.frame = walkFrame;
		pose.facing = facing;
		pose.swim = false;
		pose.wade = false;
		pose.shadow = true;
		pose.at = undefined;
		pose.item = undefined;

		const carried = this.board?.heldBy(player.UserId);
		if (carried && carried.mode === 2 && this.view) {
			pose.item = this.view.carriedArt(carried);
			if (player === Players.LocalPlayer && now < this.liftUntil) {
				pose.anim = 9;
				pose.frame = 0;
				return pose;
			}
			pose.anim = moving ? 7 : 8;
			pose.frame = moving ? math.floor(walked / WALK_STEP_PX) % CARRY_FRAMES : 0;
			return pose;
		}

		const action = player === Players.LocalPlayer ? this.localAction() : this.remoteAction(player);
		// Sentado, virado para o lado que o jogador escolheu (o assento, por onde chegou ou um toque numa direção).
		if (action?.kind === "sit") {
			pose.anim = 2;
			pose.frame = 0;
			pose.facing = action.facing;
			pose.shadow = false;
			return pose;
		}
		if (action) {
			pose.anim = action.kind === "push" ? 4 : action.kind === "grab" ? 5 : 6;
			pose.frame = action.kind === "push" ? math.floor(now * PUSH_FPS) % PUSH_FRAMES : 0;
			pose.facing = action.facing;
			return pose;
		}

		const board = this.board;
		if (!board) return pose;
		const [x, y] = this.cellOf(position);
		const kind = board.kind(x, y);
		if (kind === 11) {
			pose.swim = true;
			pose.shadow = false;
			return pose;
		}
		if (moving) return pose;
		if (kind === 4 || kind === 5) {
			pose.at = this.bedFor(player, x, y);
			pose.anim = 3;
			pose.frame = 0;
			pose.facing = 2;
			pose.shadow = false;
			return pose;
		}
		if (kind === 3) {
			// Sem lado no desenho (as almofadas do castelo), senta virado para onde chegou.
			const seat = board.seatFacing(x, y);
			pose.anim = 2;
			pose.frame = 0;
			pose.facing = seat !== undefined ? seat : facing;
			pose.shadow = false;
		}
		return pose;
	}

	private localAction(): BodyAction | undefined {
		if (this.seat) return { kind: "sit", facing: this.seat.facing };
		if (this.step) return { kind: this.step.kind, facing: this.holding?.facing ?? (this.localFacing as Facing) };
		if (this.holding?.confirmed) return { kind: "grab", facing: this.holding.facing };
		if (this.stuckSince !== undefined && os.clock() - this.stuckSince >= PUSH_AFTER) {
			return { kind: "push", facing: this.stuckFacing };
		}
		// Empurrando uma peça que desliza, o boneco segue fazendo força enquanto anda atrás dela.
		const streak = this.streak;
		if (streak && streak.dir === this.trying && os.clock() - streak.at < PUSH_STREAK) {
			return { kind: "push", facing: streak.dir };
		}
		return undefined;
	}

	private cellOf(position: Vector3) {
		const px = this.pxOf(position);
		return [math.floor(px.X / INTERIOR_TILE), math.floor(px.Y / INTERIOR_TILE)] as const;
	}

	private pxOf(position: Vector3) {
		return worldToArtPx(position).sub(worldToArtPx(this.corner));
	}

	private bedFor(player: Player | string, x: number, y: number) {
		const board = this.board!;
		let pillow = y;
		if (board.kind(x, y) === 5) {
			while (board.kind(x, pillow - 1) === 5) pillow -= 1;
			if (board.kind(x, pillow - 1) === 4) pillow -= 1;
		} else {
			while (board.kind(x, pillow + 1) === 4) pillow += 1;
		}
		const at = this.corner.add(
			groundOffset(
				x * INTERIOR_TILE + INTERIOR_TILE / 2,
				pillow * INTERIOR_TILE + INTERIOR_TILE / 2 + LIE_FEET_BELOW_PILLOW,
			),
		);
		const key = `${x},${pillow}`;
		if (this.beds.get(player)?.key === key) return at;
		this.leaveBed(player);
		const cells = this.coverCells(x, pillow + 1);
		if (cells.size() > 0) this.beds.set(player, { key, card: this.coverCard(player, cells) });
		return at;
	}

	lieResident(name: string, x: number, y: number) {
		return this.board ? this.bedFor(`resident:${name}`, x, y) : undefined;
	}

	leaveResidentBed(name: string) {
		this.leaveBed(`resident:${name}`);
	}

	private coverCells(x: number, y: number) {
		const board = this.board!;
		const cells = new Array<[number, number]>();
		const seen = new Set<ReturnType<PieceBoard["map"]["key"]>>();
		const queue: Array<[number, number]> = [[x, y]];
		while (queue.size() > 0 && cells.size() < 64) {
			const [cx, cy] = queue.shift()!;
			const key = board.map.key(cx, cy);
			if (seen.has(key)) continue;
			seen.add(key);
			if (board.kind(cx, cy) !== 5) continue;
			cells.push([cx, cy]);
			queue.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
		}
		return cells;
	}

	private coverCard(player: Player | string, cells: Array<[number, number]>) {
		let x0 = math.huge;
		let y0 = math.huge;
		let x1 = -math.huge;
		let y1 = -math.huge;
		for (const [x, y] of cells) {
			x0 = math.min(x0, x);
			y0 = math.min(y0, y);
			x1 = math.max(x1, x);
			y1 = math.max(y1, y);
		}
		const size = new Vector2(x1 - x0 + 1, y1 - y0 + 1).mul(INTERIOR_TILE);
		const base = this.corner.add(groundOffset(x0 * INTERIOR_TILE, (y1 + 1) * INTERIOR_TILE));
		const card = createCard(
			this.scene.interior!.folder,
			`Cover_${typeIs(player, "string") ? player : player.Name}`,
			{ image: "", size, anchor: new Vector2(0, size.Y), frames: [Vector2.zero] },
			base,
		);
		card.image.Visible = false;
		const gui = card.image.Parent;
		for (const [x, y] of cells) {
			const tile = this.board!.top(x, y);
			if (!tile) continue;
			const art = sheetRect(tile);
			const label = new Instance("ImageLabel");
			label.BackgroundTransparency = 1;
			label.Image = art.image;
			label.ImageRectOffset = art.offset;
			label.ImageRectSize = art.size;
			label.ResampleMode = Enum.ResamplerMode.Pixelated;
			label.Position = UDim2.fromOffset((x - x0) * INTERIOR_TILE, (y - y0) * INTERIOR_TILE);
			label.Size = UDim2.fromOffset(INTERIOR_TILE, INTERIOR_TILE);
			label.Parent = gui;
		}
		return card;
	}

	private leaveBed(player: Player | string) {
		const bed = this.beds.get(player);
		if (!bed) return;
		bed.card.part.Destroy();
		this.beds.delete(player);
	}

	private changed(id: string, x: number, y: number, mode: number, holder: number, variant: number) {
		const board = this.board!;
		const state = board.pieces.get(id);
		if (!state) return;
		const before = { x: state.x, y: state.y, mode: state.mode };
		board.set(id, x, y, mode as PieceState["mode"], holder, variant);
		const dx = x - before.x;
		const dy = y - before.y;
		const unit = math.abs(dx) + math.abs(dy) === 1;
		const stepped = before.mode === 1 && mode === 1 && unit;
		const pushed = before.mode === 0 && mode === 0 && unit;
		// Empurrada, a peça desliza para longe de quem empurra e o bloqueio vai junto; puxada, ele some no
		// deslize, porque a peça vem para onde o jogador estava.
		this.view!.refresh(state, stepped || pushed, pushed);
		if (pushed && this.pendingPush?.id === id) {
			this.pendingPush = undefined;
			this.streak = { dir: this.stuckFacing, at: os.clock() };
		}

		const me = Players.LocalPlayer.UserId;
		const pending = this.pendingStep;
		if (pending && pending.id === id && stepped) {
			this.pendingStep = undefined;
			this.beginStep(pending.kind, dx, dy);
		}
		const holding = this.holding;
		if (holding && holding.id === id) {
			if (mode === 1 && holder === me) holding.confirmed = true;
			else this.stopHolding(false);
		}
		if (mode === 2 && holder === me && before.mode !== 2) {
			// Levantar: o boneco para um instante com o objeto à frente, depois anda com ele na cabeça.
			this.liftUntil = os.clock() + LIFT_SECONDS;
			const release = this.movement.hold();
			task.delay(LIFT_SECONDS, release);
		}
	}

	private thrown(id: string, holder: number, x: number, y: number, mode: number, variant: number) {
		const board = this.board!;
		const state = board.pieces.get(id);
		if (!state) return;
		const thrower = Players.GetPlayerByUserId(holder);
		const root = thrower?.Character?.FindFirstChild("HumanoidRootPart");
		const from = root?.IsA("BasePart")
			? new Vector3(root.Position.X, 0, root.Position.Z)
			: this.scene.interior!.cellCenter(state.x, state.y);
		board.set(id, x, y, mode as PieceState["mode"], 0, variant);
		this.view!.fly(state, from, mode === 3);
	}

	private frontPiece(feet: Vector2, dir: Facing = this.localFacing as Facing) {
		const board = this.board;
		if (!board) return undefined;
		const [sx, sy] = dirStep(dir);
		for (const reach of REACH_PROBES) {
			const probe = feet.add(new Vector2(sx, sy).mul(reach));
			const piece = board.at(math.floor(probe.X / INTERIOR_TILE), math.floor(probe.Y / INTERIOR_TILE));
			if (piece && piece.mode === 0) return piece;
		}
		return undefined;
	}

	private frontTap(feet: Vector2) {
		const board = this.board;
		if (!board) return undefined;
		const fx = math.floor(feet.X / INTERIOR_TILE);
		const fy = math.floor(feet.Y / INTERIOR_TILE);
		const [sx, sy] = dirStep(this.localFacing as Facing);
		let best: [number, number] | undefined;
		let bestDistance = math.huge;
		for (const [x, y] of board.map.taps) {
			const dx = x - fx;
			const dy = y - fy;
			if (math.abs(dx) > TAP_REACH || math.abs(dy) > TAP_REACH || dx * sx + dy * sy <= 0) continue;
			const distance = math.abs(dx) + math.abs(dy);
			if (distance < bestDistance) {
				best = [x, y];
				bestDistance = distance;
			}
		}
		return best;
	}

	private localRoot() {
		const root = Players.LocalPlayer.Character?.FindFirstChild("HumanoidRootPart");
		return root?.IsA("BasePart") ? root : undefined;
	}

	private putSpot(state: PieceState, feet: Vector2) {
		const def = state.spot.def;
		const [x, y] = frontSpot(feet, this.localFacing as Facing, def.w, def.h);
		return this.board!.fits(state, x, y) ? ([x, y] as const) : undefined;
	}

	private press() {
		const board = this.board;
		const root = this.localRoot();
		if (!board || !root || screen() !== "playing" || this.holding || this.step) return;
		const feet = this.pxOf(root.Position);
		const carried = board.heldBy(Players.LocalPlayer.UserId);
		if (carried && carried.mode === 2) {
			if (os.clock() < this.liftUntil) return;
			const spot = this.localMoving ? undefined : this.putSpot(carried, feet);
			if (spot) Events.placePiece.fire(carried.spot.id, spot[0], spot[1]);
			else Events.throwPiece.fire(carried.spot.id, this.localFacing);
			return;
		}
		// Uma tela na frente (diálogo) segura o personagem: a tecla não faz nada.
		if (this.movement.holding()) return;
		// Deitado numa cama, dorme.
		if (this.localLying) {
			this.sleep();
			return;
		}
		const piece = this.frontPiece(feet);
		const handling = handlingOf(Players.LocalPlayer);
		if (!piece) {
			const fixture = this.frontFixture(feet);
			if (fixture) {
				Events.useFixture.fire(fixture.id);
				return;
			}
			const tap = this.frontTap(feet);
			if (tap) Events.toggleTap.fire(tap[0], tap[1]);
			return;
		}
		// O baú aberto fecha; o fechado abre num toque em F (segurar F segura para puxar, `unpress`).
		const chest = this.fixtures && chestOfPiece(board.defOf(piece)) !== undefined;
		if (chest && this.fixtures!.pieceOpen(piece.spot.id)) {
			Events.useFixture.fire(piece.spot.id);
			return;
		}
		if (canLift(handling, piece.spot.def)) {
			Events.liftPiece.fire(piece.spot.id);
			return;
		}
		if (!canPull(handling, piece.spot.def)) {
			if (chest) Events.useFixture.fire(piece.spot.id);
			return;
		}
		this.chestTap = chest ? { id: piece.spot.id, since: os.clock(), x: piece.x, y: piece.y } : undefined;
		Events.grabPiece.fire(piece.spot.id);
		this.holding = {
			id: piece.spot.id,
			facing: this.localFacing as Facing,
			confirmed: false,
			since: os.clock(),
			release: this.movement.hold(),
		};
	}

	private unpress() {
		const holding = this.holding;
		const tap = this.chestTap;
		this.chestTap = undefined;
		if (!holding) return;
		Events.releasePiece.fire(holding.id);
		this.stopHolding(false);
		// Um toque rápido no baú, sem puxar: abre (o servidor recebe na ordem, depois de soltar).
		const piece = this.board?.pieces.get(holding.id);
		if (
			tap &&
			tap.id === holding.id &&
			os.clock() - tap.since < CHEST_TAP_SECONDS &&
			piece &&
			piece.x === tap.x &&
			piece.y === tap.y
		) {
			Events.useFixture.fire(holding.id);
		}
	}

	private frontFixture(feet: Vector2): Fixture | undefined {
		const fixtures = this.fixtures;
		if (!fixtures || fixtures.fixtures.size() === 0) return undefined;
		const [sx, sy] = dirStep(this.localFacing as Facing);
		for (const reach of REACH_PROBES) {
			const probe = feet.add(new Vector2(sx, sy).mul(reach));
			const fixture = fixtures.fixtureAt(math.floor(probe.X / INTERIOR_TILE), math.floor(probe.Y / INTERIOR_TILE));
			if (fixture) return fixture;
		}
		return undefined;
	}

	private sleep() {
		if (this.sleepRequest) return;
		this.sleepRequest = { release: this.movement.hold(), since: os.clock() };
		this.mapController.curtain(true, SLEEP_FADE);
		Events.sleep.fire();
		task.delay(SLEEP_TIMEOUT, () => {
			const request = this.sleepRequest;
			if (request && os.clock() - request.since >= SLEEP_TIMEOUT - 0.05) this.wake();
		});
	}

	private slept(woke: boolean, waiting: number) {
		if (!woke) {
			this.wake();
			if (waiting > 0) {
				this.dialogue.say([
					{ name: () => t("dialogue.tip"), text: () => t("sleep.waiting", { count: waiting }) },
				]);
			}
			return;
		}
		// Quem esperava acordado na cama (o último a deitar foi outro) escurece agora.
		if (!this.sleepRequest) {
			this.sleepRequest = { release: this.movement.hold(), since: os.clock() };
			this.mapController.curtain(true, SLEEP_FADE);
		}
		const request = this.sleepRequest;
		task.delay(SLEEP_DARK, () => {
			if (this.sleepRequest === request) this.wake();
		});
	}

	private wake() {
		const request = this.sleepRequest;
		if (!request) return;
		this.sleepRequest = undefined;
		request.release();
		this.mapController.curtain(false, SLEEP_FADE * 2);
	}

	private stopHolding(now: boolean) {
		this.holding?.release();
		this.holding = undefined;
		this.pendingStep = undefined;
		if (now) this.step = undefined;
	}

	private beginStep(kind: "pull", dx: number, dy: number) {
		const character = Players.LocalPlayer.Character;
		if (!character) return;
		this.step = {
			kind,
			started: os.clock(),
			from: character.GetPivot(),
			delta: groundOffset(dx * INTERIOR_TILE, dy * INTERIOR_TILE),
		};
	}

	private tick() {
		const started = perfBegin("Acoes");
		this.advance();
		perfEnd("Acoes", started);
	}

	private advance() {
		const now = os.clock();
		this.view?.update(now);
		// O baú aberto que saiu do lugar (puxado, empurrado) fechou: as luzes e o som também ficam sabendo.
		if (this.fixtures) {
			for (const id of this.fixtures.update()) {
				for (const listener of this.fixtureListeners) listener(id, false, [], true);
			}
		}

		const character = Players.LocalPlayer.Character;
		const root = this.localRoot();
		const humanoid = character?.FindFirstChildOfClass("Humanoid");
		const step = this.step;
		if (step && character) {
			const t = math.clamp((now - step.started) / STEP_SECONDS, 0, 1);
			character.PivotTo(step.from.add(step.delta.mul(t)));
			if (t >= 1) this.step = undefined;
		}
		if (this.pendingStep && now - this.pendingStep.sent > STEP_TIMEOUT) this.pendingStep = undefined;
		if (this.pendingPush && now - this.pendingPush.sent > STEP_TIMEOUT) this.pendingPush = undefined;
		// O servidor não deu a peça (outro jogador pegou antes, longe demais): solta o personagem.
		if (this.holding && !this.holding.confirmed && now - this.holding.since > STEP_TIMEOUT) {
			this.stopHolding(false);
		}

		const board = this.board;
		const holding = this.holding;
		if (board && root && humanoid && holding?.confirmed && !this.step && !this.pendingStep) {
			this.tryStep(holding, root, humanoid);
		}

		// Empurrar a parede: quem tenta andar e não sai do lugar.
		const move = humanoid?.MoveDirection ?? Vector3.zero;
		const velocity = root?.AssemblyLinearVelocity ?? Vector3.zero;
		const flat = new Vector3(velocity.X, 0, velocity.Z).Magnitude;
		const trying = dirOf(move);
		this.trying = trying;
		const carrying = board?.heldBy(Players.LocalPlayer.UserId)?.mode === 2;
		let swimming = false;
		if (board && root) {
			const [cx, cy] = this.cellOf(root.Position);
			swimming = board.kind(cx, cy) === 11;
		}
		const free = !holding && !this.step && !carrying && !swimming && !this.movement.holding();
		if (free && trying !== undefined && flat < WALK_SPEED * STUCK_FRACTION) {
			if (this.stuckSince === undefined || trying !== this.stuckFacing) this.stuckSince = now;
			this.stuckFacing = trying;
		} else {
			this.stuckSince = undefined;
		}
		if (free && trying !== undefined && board && root) this.tryPush(board, root, trying, flat, now);
		if (board && root) this.updateSeat(board, root, trying, flat, carrying, now);

		const action = this.localAction();
		const value = encodeAction(action?.kind, action?.facing ?? 2);
		if (value !== this.sent) {
			this.sent = value;
			Events.setAction.fire(action?.kind ?? "", action?.facing ?? 2);
		}

		const prompt = this.promptFor(root);
		if (prompt !== this.prompt()) this.prompt(prompt);
	}

	private updateSeat(
		board: PieceBoard,
		root: BasePart,
		trying: Facing | undefined,
		flat: number,
		carrying: boolean,
		now: number,
	) {
		const [cx, cy] = this.cellOf(root.Position);
		const onSeat = board.kind(cx, cy) === 3;
		const seat = this.seat;
		if (seat) {
			if (!onSeat || this.holding || this.step || carrying) {
				this.leaveSeat();
				return;
			}
			if (trying === undefined) {
				seat.since = undefined;
				return;
			}
			seat.since ??= now;
			seat.facing = trying;
			if (now - seat.since > SIT_TURN_HOLD) this.leaveSeat();
			return;
		}
		if (!onSeat || trying !== undefined || flat > SIT_STILL_SPEED || this.holding || this.step || carrying) return;
		if (this.movement.holding()) return;
		const facing = board.seatFacing(cx, cy) ?? (this.localFacing as Facing);
		this.seat = { facing, release: this.movement.hold() };
	}

	private leaveSeat() {
		this.seat?.release();
		this.seat = undefined;
	}

	private tryPush(board: PieceBoard, root: BasePart, trying: Facing, flat: number, now: number) {
		if (this.pendingPush || flat >= WALK_SPEED * STUCK_FRACTION) return;
		const streak = this.streak;
		const ready =
			(this.stuckSince !== undefined && now - this.stuckSince >= PUSH_AFTER) ||
			(streak !== undefined && streak.dir === trying && now - streak.at < PUSH_STREAK);
		if (!ready) return;
		const piece = this.frontPiece(this.pxOf(root.Position), trying);
		if (!piece || !canPush(handlingOf(Players.LocalPlayer), piece.spot.def)) return;
		const [dx, dy] = dirStep(trying);
		if (!board.fits(piece, piece.x + dx, piece.y + dy)) return;
		this.pendingPush = { id: piece.spot.id, sent: now };
		Events.pushPiece.fire(piece.spot.id, dx, dy);
	}

	private tryStep(holding: Holding, root: BasePart, humanoid: Humanoid) {
		const board = this.board!;
		const state = board.pieces.get(holding.id);
		const trying = dirOf(humanoid.MoveDirection);
		if (!state || trying === undefined || trying !== opposite(holding.facing)) return;
		const [dx, dy] = dirStep(trying);
		if (!board.fits(state, state.x + dx, state.y + dy)) return;
		// Para trás do jogador também tem de ter lugar.
		const feet = this.pxOf(root.Position);
		const back = feet.add(new Vector2(dx, dy).mul(INTERIOR_TILE));
		if (board.blocked(math.floor(back.X / INTERIOR_TILE), math.floor(back.Y / INTERIOR_TILE))) return;
		this.pendingStep = { id: holding.id, kind: "pull", sent: os.clock() };
		Events.stepPiece.fire(holding.id, dx, dy);
	}

	private promptFor(root: BasePart | undefined): TextKey | undefined {
		const board = this.board;
		if (!board || !root || screen() !== "playing") return undefined;
		if (this.holding) return "action.pull";
		const carried = board.heldBy(Players.LocalPlayer.UserId);
		if (carried && carried.mode === 2) {
			const feet = this.pxOf(root.Position);
			return !this.localMoving && this.putSpot(carried, feet) ? "action.put" : "action.throw";
		}
		if (this.movement.holding()) return undefined;
		if (this.localLying) return "action.sleep";
		const feet = this.pxOf(root.Position);
		const piece = this.frontPiece(feet);
		if (!piece) {
			const fixture = this.frontFixture(feet);
			if (fixture) {
				const on = this.fixtures!.isOn(fixture);
				if (fixture.kind === "stove") return on ? "action.stoveOff" : "action.cook";
				return on ? "action.closeChest" : "action.openChest";
			}
			const tap = this.frontTap(feet);
			if (!tap) return undefined;
			return this.closedTaps.has(board.map.key(tap[0], tap[1])) ? "action.openTap" : "action.closeTap";
		}
		// O baú: o toque abre e fecha (segurar F ainda segura para puxar).
		if (this.fixtures && chestOfPiece(board.defOf(piece))) {
			return this.fixtures.pieceOpen(piece.spot.id) ? "action.closeChest" : "action.openChest";
		}
		const handling = handlingOf(Players.LocalPlayer);
		if (canLift(handling, piece.spot.def)) return "action.lift";
		return canPull(handling, piece.spot.def) ? "action.grab" : undefined;
	}
}
