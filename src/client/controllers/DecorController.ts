import { Controller, OnStart } from "@flamework/core";
import { GuiService, Players, RunService, UserInputService, Workspace } from "@rbxts/services";
import { mount, source } from "@rbxts/vide";
import { decorItem, decorItemKey, DecorState, decorVariant, DECOR_ORDER, planDecor } from "shared/decor";
import { isHouse, placeOf } from "shared/interiorChoice";
import { toView } from "shared/view";
import { Events } from "client/network";
import { perfBegin, perfEnd } from "client/perf";
import { worldZoom } from "client/state/camera";
import { phonePreview } from "client/state/phone";
import { screen } from "client/state/screen";
import { DecorHud } from "client/ui/DecorHud";
import { GroundLayer } from "client/world/ground";
import { INTERIOR_TILE, sheetRect } from "client/world/interior";
import { decorImages } from "client/world/pieces";
import { ActionController } from "./ActionController";
import { SceneController } from "./SceneController";

type DecorItem = NonNullable<ReturnType<typeof decorItem>>;
type DecorPlan = ReturnType<typeof planDecor>;
type DecorStatus = ReturnType<Parameters<typeof DecorHud>[0]["status"]>;
type Board = NonNullable<ReturnType<ActionController["currentBoard"]>>;
type PieceState = NonNullable<ReturnType<Board["pieces"]["get"]>>;

/** A tecla que liga e desliga o Decorar; as do modo: girar, guardar e as que escolhem a peça (1 a 9 e 0, na ordem do painel). */
const DECOR_KEY = Enum.KeyCode.B;
const ROTATE_KEY = Enum.KeyCode.R;
const STORE_KEYS = new Set<Enum.KeyCode>([Enum.KeyCode.X, Enum.KeyCode.Delete]);
const SLOT_KEYS: Enum.KeyCode[] = [
	Enum.KeyCode.One,
	Enum.KeyCode.Two,
	Enum.KeyCode.Three,
	Enum.KeyCode.Four,
	Enum.KeyCode.Five,
	Enum.KeyCode.Six,
	Enum.KeyCode.Seven,
	Enum.KeyCode.Eight,
	Enum.KeyCode.Nine,
	Enum.KeyCode.Zero,
];
/** A peça que cabe aparece meio transparente no mouse; a que não cabe, bem apagada (como no carimbo do Diorama). */
const GHOST_OK = 0.3;
const GHOST_REFUSED = 0.75;
/** A peça que o jogador está mudando de lugar fica apagada no lugar de antes. */
const MOVING_DIM = 0.7;
/** Quanto tempo a recusa do servidor fica no aviso, em segundos. */
const REFUSAL_SECONDS = 3;
/** Com tudo igual (a célula, a peça, a direção), o plano é refeito no máximo a cada tanto, em segundos. */
const REPLAN_EVERY = 0.25;

/** O que o jogador tem na mão no Decorar: uma peça nova do inventário, uma peça que ele pôs ou uma peça móvel da casa. */
type Holding =
	| { kind: "new"; item: DecorItem }
	| { kind: "decor"; key: number; item: DecorItem }
	| { kind: "piece"; id: string };

/**
 * Decorar a casa (etapa E2; regras em `shared/decor.ts`, servidor em `DecorService`). Na própria casa, B (ou o
 * botão Decorar) liga o modo: o painel mostra o inventário de teste; escolhida uma peça (clique, ou 1 a 9 e 0), ela
 * segue o mouse meio transparente, já na variante que o chão pede e encaixada na parede, e bem apagada onde não
 * cabe, com o motivo no aviso. Clique põe. Clicar numa peça posta (ou numa peça móvel da casa: pote, cadeira, baú)
 * pega para mudar de lugar; R gira entre as direções (a cadeira de frente e as de lado), X ou Delete guarda de
 * volta, Backspace ou o botão direito larga (o Esc é do menu do Roblox) o que está na mão, B de novo sai. O boneco continua andando (é assim que a
 * tela anda pela casa). O servidor confere tudo e responde com a peça (ou com a recusa).
 */
@Controller()
export class DecorController implements OnStart {
	private active = source(false);
	private collapsed = source(false);
	private available = source(false);
	private chosen = source<string | undefined>(undefined);
	private stock = source(new Map<string, number>());
	private status = source<DecorStatus>({ key: "decor.status.choose" });
	private holding?: Holding;
	private form = 0;
	private ghost: ImageLabel[] = [];
	private ghostKey = "";
	private planKey = "";
	private plannedAt = 0;
	private refusedUntil = 0;
	private dimmed?: number | string;

	constructor(
		private scene: SceneController,
		private actions: ActionController,
	) {}

	onStart() {
		if (!this.scene.interior) return;

		Events.decorStock.connect((text) => {
			const stock = new Map<string, number>();
			for (const entry of text.split(",")) {
				const [id, n] = entry.split("=");
				const count = tonumber(n);
				if (id !== undefined && count !== undefined) stock.set(id, count);
			}
			this.stock(stock);
			// Acabou a peça escolhida: larga.
			const holding = this.holding;
			if (holding?.kind === "new" && (stock.get(holding.item.id) ?? 0) <= 0) this.drop();
		});
		Events.decorRefused.connect((reason, piece, wanted, found) => {
			this.status({
				key: reason as DecorStatus["key"],
				piece: piece !== "" ? (piece as DecorStatus["piece"]) : undefined,
				wanted: wanted !== "" ? (wanted.split(",") as NonNullable<DecorStatus["wanted"]>) : undefined,
				found: found !== "" ? (found as DecorStatus["found"]) : undefined,
			});
			this.refusedUntil = os.clock() + REFUSAL_SECONDS;
		});
		this.scene.onMapChanged(() => this.setActive(false));
		UserInputService.InputBegan.Connect((input, processed) => this.input(input, processed));
		RunService.RenderStepped.Connect(() => this.update());

		mount(
			() =>
				DecorHud({
					available: () => this.available(),
					active: () => this.active(),
					collapsed: () => this.collapsed(),
					onCollapse: (value) => this.collapsed(value),
					chosen: () => this.chosen(),
					stock: () => this.stock(),
					status: () => this.status(),
					onToggle: () => this.setActive(!this.active()),
					onChoose: (id) => this.choose(id),
					onRotate: () => this.rotate(),
					onStore: () => this.store(),
				}),
			Players.LocalPlayer.WaitForChild("PlayerGui"),
		);
	}

	private static onPhone() {
		return phonePreview() !== undefined || (UserInputService.TouchEnabled && !UserInputService.KeyboardEnabled);
	}

	private atHome() {
		const place = placeOf(Players.LocalPlayer);
		return screen() === "playing" && place !== undefined && isHouse(place.id) && place.owner === Players.LocalPlayer.UserId;
	}

	private setActive(on: boolean) {
		if (on && !this.atHome()) return;
		if (on && !this.active()) this.collapsed(DecorController.onPhone());
		this.active(on);
		if (!on) {
			this.drop();
			this.chosen(undefined);
		}
		this.status({ key: "decor.status.choose" });
	}

	private choose(id: string) {
		const item = decorItem(id);
		if (!item || !this.active()) return;
		if (this.chosen() === id) return this.drop();
		if ((this.stock().get(id) ?? 0) <= 0) {
			this.status({ key: "decor.refuse.none", piece: decorItemKey(id) as DecorStatus["piece"] });
			this.refusedUntil = os.clock() + REFUSAL_SECONDS;
			return;
		}
		this.drop();
		this.holding = { kind: "new", item };
		this.form = 0;
		this.chosen(id);
	}

	private drop() {
		this.holding = undefined;
		this.chosen(undefined);
		this.clearGhost();
		this.actions.currentView()?.dim(this.dimmed!, 0);
		this.dimmed = undefined;
	}

	private clearGhost() {
		for (const label of this.ghost) label.Destroy();
		this.ghost.clear();
		this.ghostKey = "";
		this.planKey = "";
	}

	private rotate() {
		if (!this.active()) return;
		const holding = this.holding;
		if (holding && holding.kind !== "piece") {
			this.form = (this.form + 1) % holding.item.forms.size();
			return;
		}
		const cell = this.mouseCell();
		const decor = cell && this.actions.currentBoard()?.decorAt(cell[0], cell[1]);
		if (!decor) return;
		const state = decor[0];
		if (state.item.forms.size() > 1) {
			Events.decorMove.fire(state.key, (state.form + 1) % state.item.forms.size(), state.ax, state.ay);
		}
	}

	private store() {
		if (!this.active()) return;
		const holding = this.holding;
		if (holding?.kind === "decor") {
			Events.decorStore.fire(holding.key);
			this.drop();
			return;
		}
		const cell = this.mouseCell();
		const decor = cell && this.actions.currentBoard()?.decorAt(cell[0], cell[1]);
		if (decor) Events.decorStore.fire(decor[0].key);
	}

	private input(input: InputObject, processed: boolean) {
		if (input.KeyCode === DECOR_KEY && !processed) return this.setActive(!this.active());
		if (!this.active() || processed) return;
		if (input.KeyCode === ROTATE_KEY) return this.rotate();
		if (STORE_KEYS.has(input.KeyCode)) return this.store();
		if (input.KeyCode === Enum.KeyCode.Backspace || input.UserInputType === Enum.UserInputType.MouseButton2) {
			if (this.holding) this.drop();
			else this.setActive(false);
			return;
		}
		const slot = SLOT_KEYS.indexOf(input.KeyCode);
		if (slot >= 0 && DECOR_ORDER[slot] !== undefined) return this.choose(DECOR_ORDER[slot]);
		// O mouse pelo `GetMouseLocation` (as mesmas medidas do `WorldToViewportPoint`); o toque vem sem a barra de cima.
		if (input.UserInputType === Enum.UserInputType.MouseButton1) {
			this.click(UserInputService.GetMouseLocation());
		} else if (input.UserInputType === Enum.UserInputType.Touch) {
			const [inset] = GuiService.GetGuiInset();
			this.click(new Vector2(input.Position.X, input.Position.Y).add(inset));
		}
	}

	private mouseCell(at?: Vector2): [number, number] | undefined {
		const camera = Workspace.CurrentCamera;
		const interior = this.scene.interior;
		if (!camera || !interior) return undefined;
		const point = at || UserInputService.GetMouseLocation();
		const [corner] = camera.WorldToViewportPoint(toView(interior.cellCorner(0, 0)));
		const zoom = worldZoom();
		const x = math.floor((point.X - corner.X) / zoom / INTERIOR_TILE);
		const y = math.floor((point.Y - corner.Y) / zoom / INTERIOR_TILE);
		return x >= 0 && y >= 0 && x < 64 && y < 64 ? [x, y] : undefined;
	}

	private click(at: Vector2) {
		const board = this.actions.currentBoard();
		const cell = this.mouseCell(at);
		if (!board || !cell) return;
		const holding = this.holding;
		const [ax, ay] = cell;
		if (!holding) {
			// Sem nada na mão: pega a peça posta, ou a móvel da casa, que está sob o mouse.
			const decor = board.decorAt(ax, ay);
			if (decor) {
				this.holding = { kind: "decor", key: decor[0].key, item: decor[0].item };
				this.form = decor[0].form;
				this.dimmed = decor[0].key;
				this.actions.currentView()?.dim(this.dimmed!, MOVING_DIM);
				this.status({ key: "decor.status.moving" });
				return;
			}
			const piece = board.at(ax, ay);
			if (piece && piece.mode === 0 && !piece.spot.test) {
				this.holding = { kind: "piece", id: piece.spot.id };
				this.dimmed = piece.spot.id;
				this.actions.currentView()?.dim(this.dimmed!, MOVING_DIM);
				this.status({ key: "decor.status.moving" });
			}
			return;
		}
		const plan = this.planFor(holding, ax, ay);
		if (!plan.ok) {
			if (plan.refusal) this.status(plan.refusal);
			this.refusedUntil = os.clock() + REFUSAL_SECONDS;
			return;
		}
		if (holding.kind === "new") {
			Events.decorPlace.fire(holding.item.id, this.form, ax, ay);
			// Continua com a peça na mão enquanto sobrar (o servidor manda quantas sobram).
			if ((this.stock().get(holding.item.id) ?? 0) <= 1) this.drop();
		} else if (holding.kind === "decor") {
			Events.decorMove.fire(holding.key, this.form, ax, ay);
			this.drop();
		} else {
			Events.decorMovePiece.fire(holding.id, ax, ay);
			this.drop();
		}
	}

	private planFor(holding: Holding, ax: number, ay: number): DecorPlan {
		const board = this.actions.currentBoard()!;
		if (holding.kind === "piece") {
			const state = board.pieces.get(holding.id);
			if (!state) return { ok: false, variant: 0, x: ax, y: ay };
			const def = state.spot.def;
			const x = ax - math.floor((def.w - 1) / 2);
			const y = ay - math.floor((def.h - 1) / 2);
			const ok = board.fits(state, x, y);
			return {
				ok,
				variant: ok ? board.variantFor(state, x, y) : state.variant,
				x,
				y,
				refusal: ok ? undefined : { key: "decor.refuse.blocked" },
			};
		}
		return planDecor(board, holding.item, this.form, ax, ay, holding.kind === "decor" ? holding.key : undefined);
	}

	private update() {
		const home = this.atHome();
		if (home !== this.available()) this.available(home);
		if (this.active() && !home) this.setActive(false);
		if (!this.active()) return;

		const holding = this.holding;
		const cell = this.mouseCell();
		const interior = this.scene.interior;
		if (!holding || !cell || !interior) {
			this.clearGhost();
			if (!holding && os.clock() > this.refusedUntil && this.status().key !== "decor.status.choose") {
				this.status({ key: "decor.status.choose" });
			}
			return;
		}

		// O `planDecor` inteiro só roda quando a célula, a peça na mão ou a direção mudam, ou a cada `REPLAN_EVERY`
		// (o tabuleiro pode mudar por um aviso do servidor): antes, rodava a cada quadro (seção 5.1 do
		// `PLANO_OTIMIZACAO.md`).
		const now = os.clock();
		const which = holding.kind === "piece" ? holding.id : holding.kind === "decor" ? holding.key : holding.item.id;
		const planKey = `${holding.kind}|${which}|${this.form}|${cell[0]},${cell[1]}`;
		if (planKey === this.planKey && now - this.plannedAt < REPLAN_EVERY) return;
		this.planKey = planKey;
		this.plannedAt = now;

		const started = perfBegin("Decorar");
		const plan = this.planFor(holding, cell[0], cell[1]);
		perfEnd("Decorar", started);
		const key = `${holding.kind}|${this.form}|${plan.variant}|${plan.x}|${plan.y}|${plan.ok}`;
		if (key !== this.ghostKey) {
			this.clearGhost();
			this.ghostKey = key;
			if (holding.kind === "piece") {
				const state = this.actions.currentBoard()!.pieces.get(holding.id);
				if (state) this.ghost.push(this.pieceGhost(state, plan));
			} else {
				const variant = decorVariant({ item: holding.item, form: this.form, variant: plan.variant } as DecorState);
				for (const label of decorImages(interior, holding.item, variant, plan.x, plan.y, GroundLayer.Shadow)) {
					this.ghost.push(label);
				}
			}
			for (const label of this.ghost) label.ImageTransparency = plan.ok ? GHOST_OK : GHOST_REFUSED;
		}
		const fits: DecorStatus =
			holding.kind === "piece"
				? { key: "decor.status.fitsPlain" }
				: { key: "decor.status.fits", piece: decorItemKey(holding.item.id) as DecorStatus["piece"] };
		if (os.clock() > this.refusedUntil) {
			this.status(plan.ok ? fits : (plan.refusal || { key: "decor.refuse.blocked" }));
		}
	}

	private pieceGhost(state: PieceState, plan: DecorPlan) {
		const interior = this.scene.interior!;
		const def = this.actions.currentBoard()!.defOf({ ...state, variant: plan.variant });
		const art = sheetRect([def.sheet, def.col, def.row], def.w, def.h);
		const label = new Instance("ImageLabel");
		label.Name = "DecorGhost";
		label.BackgroundTransparency = 1;
		label.ResampleMode = Enum.ResamplerMode.Pixelated;
		label.Image = art.image;
		label.ImageRectOffset = art.offset;
		label.ImageRectSize = art.size;
		label.Size = UDim2.fromOffset(art.size.X, art.size.Y);
		const at = interior.canvasOf(0, 0).add(new Vector2(plan.x, plan.y).mul(INTERIOR_TILE));
		label.Position = UDim2.fromOffset(at.X, at.Y);
		label.ZIndex = GroundLayer.Shadow;
		// Na camada viva do chão, com as peças (por cima delas, como antes) e sem refazer o canvas grande dos tiles.
		label.Parent = interior.live.gui;
		return label;
	}
}
