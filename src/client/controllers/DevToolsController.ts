import { Controller, OnStart } from "@flamework/core";
import { GuiService, Players, RunService, Stats, UserInputService, Workspace } from "@rbxts/services";
import { mount, source } from "@rbxts/vide";
import { screenDensity, zoomRange } from "shared/view";
import { CANVAS_ROLE_ATTRIBUTE, setPerfOn, takePerf } from "client/perf";
import { phonePreview, phoneScale, parsePhone } from "client/state/phone";
import { t } from "client/ui/i18n";
import { DevPanel } from "client/ui/DevPanel";
import { DESIGN } from "client/ui/kit";
import { CharacterController } from "./CharacterController";
import { SceneController } from "./SceneController";

/** Atributo do Workspace que mostra o painel de orçamento (true). */
export const BUDGET_ATTRIBUTE = "OrcamentoTeste";
/** Atributo do Workspace que liga a prévia de celular: true (844 × 390, o comum) ou "LxA" em pontos. */
export const PHONE_ATTRIBUTE = "CelularTeste";
/**
 * Atributo do Workspace que deixa qualquer jogador abrir o painel pelo gesto do celular ou pelo atalho, fora do
 * Studio (para um teste com amigos num servidor privado). Sem ele, só quem é do grupo dono do jogo (cargo 250 ou
 * mais) ou o dono, quando o jogo é de uma pessoa.
 */
export const PANEL_FOR_ALL_ATTRIBUTE = "PainelParaTodos";
/** De quanto em quanto tempo o painel mede de novo, em segundos. */
const MEASURE_EVERY = 0.5;
/** O nome do quadro que segura a interface do jogo dentro da tela do celular, em cada `ScreenGui`. */
const PHONE_FRAME = "PhoneScreen";
/** O gesto do celular: três dedos na tela ao mesmo tempo, soltos antes deste tempo, em segundos. */
const GESTURE_FINGERS = 3;
const GESTURE_SECONDS = 0.8;
/** Cargo mínimo no grupo dono do jogo para abrir o painel fora do Studio. */
const DEV_RANK = 250;

type CanvasRole = "fixo" | "vivo" | "mar";
type Budget = NonNullable<ReturnType<Parameters<typeof DevPanel>[0]["budget"]>>;

/** Os papéis dos canvas do chão (`client/perf.ts`), na ordem do painel. */
const ROLES: CanvasRole[] = ["fixo", "vivo", "mar"];

interface PhoneWrap {
	frame: Frame;
	connection: RBXScriptConnection;
}

/** Um canvas do chão vigiado: cada mudança numa imagem dele obriga o Roblox a refazer o desenho. */
interface CanvasWatch {
	role: CanvasRole;
	connections: RBXScriptConnection[];
	touched: boolean;
	frames: number;
}

/**
 * Ferramentas de desenvolvimento, no Studio (atalhos Ctrl+Shift+O e Ctrl+Shift+P), com os atributos de teste do
 * Workspace (`OrcamentoTeste`, `CelularTeste`), que valem fora do Studio também, e, para quem pode (o grupo dono do
 * jogo, ou todos com `PainelParaTodos`), pelo atalho Ctrl+Shift+O ou pelo gesto de três dedos no celular:
 *
 * - **Desempenho** (fase 0 do `PLANO_OTIMIZACAO.md`, seção 9.1): imagens (no chão fixo e na camada viva),
 *   instâncias, cartões, bonecos, o tempo por quadro (média e pior), o tempo de cada sistema nosso por quadro
 *   (`client/perf.ts`), quantas vezes por segundo cada canvas do chão é refeito, a memória (total, texturas,
 *   interface, Lua, instâncias, animação) e a rede (recebido e enviado), medidos a cada meio segundo. Com o painel
 *   fechado, nada disso é medido.
 * - **Prévia de celular**: a câmera escolhe o zoom e a interface o `k` como num celular comum (`client/state/
 *   phone.ts`); tudo aparece ampliado pelo inteiro que cabe, num retângulo no meio da tela, com o resto preto. A
 *   interface do jogo vai para dentro do retângulo: os filhos de cada `ScreenGui` passam para um quadro do tamanho
 *   dele, e voltam ao desligar.
 */
@Controller()
export class DevToolsController implements OnStart {
	private budget = source<Budget | undefined>(undefined);
	private phoneRect = source<Rect | undefined>(undefined);
	private phoneLabel = source("");
	private frames = new Array<number>();
	private lastMeasure = 0;
	private wrapped = new Map<Instance, PhoneWrap>();
	private guiWatch?: RBXScriptConnection;
	private canvases = new Map<SurfaceGui, CanvasWatch>();
	private developer = false;
	private touches = new Set<InputObject>();
	private gestureStart?: number;
	private gestureFingers = 0;

	constructor(
		private scene: SceneController,
		private characters: CharacterController,
	) {}

	onStart() {
		const studio = RunService.IsStudio();
		const apply = () => {
			const phone = parsePhone(Workspace.GetAttribute(PHONE_ATTRIBUTE));
			if (phonePreview() !== phone) phonePreview(phone);
			const on = Workspace.GetAttribute(BUDGET_ATTRIBUTE) === true;
			setPerfOn(on);
			if (!on) {
				this.budget(undefined);
				this.unwatchCanvases();
			}
		};
		Workspace.GetAttributeChangedSignal(PHONE_ATTRIBUTE).Connect(apply);
		Workspace.GetAttributeChangedSignal(BUDGET_ATTRIBUTE).Connect(apply);
		apply();

		this.developer = studio;
		if (!studio) {
			task.spawn(() => {
				this.developer = this.isDeveloper();
			});
		}

		// Os atalhos e o gesto ligam e desligam os atributos só neste cliente.
		UserInputService.InputBegan.Connect((input, processed) => {
			if (input.UserInputType === Enum.UserInputType.Touch) this.touchBegan(input);
			if (processed) return;
			const ctrl =
				UserInputService.IsKeyDown(Enum.KeyCode.LeftControl) ||
				UserInputService.IsKeyDown(Enum.KeyCode.RightControl);
			const shift =
				UserInputService.IsKeyDown(Enum.KeyCode.LeftShift) || UserInputService.IsKeyDown(Enum.KeyCode.RightShift);
			if (!ctrl || !shift) return;
			if (input.KeyCode === Enum.KeyCode.O && this.allowed()) this.toggleBudget();
			if (input.KeyCode === Enum.KeyCode.P && studio) {
				Workspace.SetAttribute(PHONE_ATTRIBUTE, Workspace.GetAttribute(PHONE_ATTRIBUTE) !== undefined ? undefined : true);
			}
		});
		UserInputService.InputEnded.Connect((input) => {
			if (input.UserInputType === Enum.UserInputType.Touch) this.touchEnded(input);
		});
		RunService.RenderStepped.Connect((dt) => this.tick(dt));

		mount(
			() =>
				DevPanel({
					budget: () => this.budget(),
					phoneRect: () => this.phoneRect(),
					phoneLabel: () => this.phoneLabel(),
				}),
			Players.LocalPlayer.WaitForChild("PlayerGui"),
		);
	}

	private allowed() {
		return this.developer || Workspace.GetAttribute(PANEL_FOR_ALL_ATTRIBUTE) === true;
	}

	private isDeveloper() {
		const player = Players.LocalPlayer;
		if (game.CreatorType === Enum.CreatorType.User) return player.UserId === game.CreatorId;
		const [ok, rank] = pcall(() => player.GetRankInGroup(game.CreatorId));
		return ok && rank >= DEV_RANK;
	}

	private toggleBudget() {
		Workspace.SetAttribute(BUDGET_ATTRIBUTE, Workspace.GetAttribute(BUDGET_ATTRIBUTE) === true ? undefined : true);
	}

	private touchBegan(input: InputObject) {
		this.touches.add(input);
		if (this.touches.size() === 1) {
			this.gestureStart = os.clock();
			this.gestureFingers = 0;
		}
		this.gestureFingers = math.max(this.gestureFingers, this.touches.size());
	}

	private touchEnded(input: InputObject) {
		this.touches.delete(input);
		if (this.touches.size() > 0) return;
		const start = this.gestureStart;
		this.gestureStart = undefined;
		if (start === undefined || this.gestureFingers < GESTURE_FINGERS || os.clock() - start > GESTURE_SECONDS) return;
		if (this.allowed()) this.toggleBudget();
	}

	private tick(dt: number) {
		if (Workspace.GetAttribute(BUDGET_ATTRIBUTE) === true) {
			// Só com o painel aberto: o tempo de cada quadro e quais canvas do chão mudaram nele.
			this.frames.push(dt);
			for (const [, watch] of this.canvases) {
				if (!watch.touched) continue;
				watch.touched = false;
				watch.frames += 1;
			}
			const now = os.clock();
			if (now - this.lastMeasure >= MEASURE_EVERY) {
				const seconds = now - this.lastMeasure;
				this.lastMeasure = now;
				this.measure(seconds);
			}
		}
		this.updatePhone();
	}

	private watchCanvases(guis: SurfaceGui[]) {
		const present = new Set(guis);
		for (const [gui, watch] of this.canvases) {
			if (present.has(gui)) continue;
			for (const connection of watch.connections) connection.Disconnect();
			this.canvases.delete(gui);
		}
		for (const gui of guis) {
			if (this.canvases.has(gui)) continue;
			const watch: CanvasWatch = {
				role: gui.GetAttribute(CANVAS_ROLE_ATTRIBUTE) as CanvasRole,
				connections: [],
				touched: false,
				frames: 0,
			};
			const mark = (property: string) => {
				if (property !== "AbsolutePosition" && property !== "AbsoluteSize" && property !== "AbsoluteRotation") {
					watch.touched = true;
				}
			};
			const hook = (instance: Instance) => {
				if (!instance.IsA("GuiObject")) return;
				const changed = instance.Changed as RBXScriptSignal<(property: string) => void>;
				watch.connections.push(changed.Connect(mark));
			};
			for (const descendant of gui.GetDescendants()) hook(descendant);
			watch.connections.push(
				gui.DescendantAdded.Connect((instance) => {
					watch.touched = true;
					hook(instance);
				}),
			);
			watch.connections.push(
				gui.DescendantRemoving.Connect(() => {
					watch.touched = true;
				}),
			);
			this.canvases.set(gui, watch);
		}
	}

	private unwatchCanvases() {
		for (const [, watch] of this.canvases) {
			for (const connection of watch.connections) connection.Disconnect();
		}
		this.canvases.clear();
	}

	private measure(seconds: number) {
		let images = 0;
		let cards = 0;
		const grounds = new Array<SurfaceGui>();
		const descendants = this.scene.world.GetDescendants();
		for (const child of descendants) {
			if (child.IsA("ImageLabel") || child.IsA("ImageButton")) {
				images += 1;
			} else if (child.IsA("SurfaceGui")) {
				if (child.GetAttribute(CANVAS_ROLE_ATTRIBUTE) !== undefined) grounds.push(child);
				else cards += 1;
			}
		}

		const groundImages: Record<CanvasRole, number> = { fixo: 0, vivo: 0, mar: 0 };
		for (const gui of grounds) {
			const role = gui.GetAttribute(CANVAS_ROLE_ATTRIBUTE) as CanvasRole;
			for (const child of gui.GetDescendants()) {
				if (child.IsA("ImageLabel")) groundImages[role] += 1;
			}
		}

		const redraws: Record<CanvasRole, number> = { fixo: 0, vivo: 0, mar: 0 };
		for (const [, watch] of this.canvases) {
			redraws[watch.role] = math.max(redraws[watch.role], watch.frames / math.max(seconds, 1e-3));
			watch.frames = 0;
		}
		this.watchCanvases(grounds);

		let total = 0;
		let worst = 0;
		for (const dt of this.frames) {
			total += dt;
			worst = math.max(worst, dt);
		}
		const count = math.max(this.frames.size(), 1);
		this.frames.clear();
		const systems = takePerf(count);
		let scripts = 0;
		for (const reading of systems) {
			if (reading.name !== "Baloes") scripts += reading.perFrameMs;
		}

		const tag = (which: Enum.DeveloperMemoryTag) => {
			const [ok, mb] = pcall(() => Stats.GetMemoryUsageMbForTag(which));
			return ok ? mb : 0;
		};
		const actors = this.characters.counts();
		this.budget({
			map: this.mapLabel(),
			images,
			groundStill: groundImages.fixo,
			groundLive: groundImages.vivo + groundImages.mar,
			instances: descendants.size() + 1,
			cards,
			frameMs: (total / count) * 1000,
			worstMs: worst * 1000,
			fps: total > 0 ? count / total : 0,
			scriptsMs: scripts,
			systems,
			redraws: ROLES.map((role) => redraws[role]),
			memoryMb: Stats.GetTotalMemoryUsageMb(),
			textureMb: tag(Enum.DeveloperMemoryTag.GraphicsTexture),
			characterTextureMb: tag(Enum.DeveloperMemoryTag.GraphicsTextureCharacter),
			guiMb: tag(Enum.DeveloperMemoryTag.Gui),
			luaMb: tag(Enum.DeveloperMemoryTag.LuaHeap),
			instancesMb: tag(Enum.DeveloperMemoryTag.Instances),
			animationMb: tag(Enum.DeveloperMemoryTag.Animation),
			receiveKbps: Stats.DataReceiveKbps,
			sendKbps: Stats.DataSendKbps,
			actorsShown: actors.shown,
			actorsOnScreen: actors.onScreen,
			actorsPool: actors.pool,
		});
	}

	/** O mapa no painel; no mundo, com os blocos montados e as imagens deles. */
	private mapLabel() {
		const world = this.scene.worldMap;
		if (!world) return this.scene.mapKey ?? "-";
		const n = world.counts();
		return `${this.scene.mapKey} · ${n.pieces} pedaços (${n.blocks} blocos), ${n.images} imagens (${n.live} vivas), ${n.cards} cartões, pior ${string.format("%.0f", n.composeWorstMs)} + ${string.format("%.0f", n.buildWorstMs)} ms`;
	}

	private updatePhone() {
		const phone = phonePreview();
		const camera = Workspace.CurrentCamera;
		if (!phone || !camera) {
			if (this.phoneRect() !== undefined) {
				this.phoneRect(undefined);
				this.unwrapAll();
			}
			return;
		}
		const real = camera.ViewportSize;
		const density = screenDensity(real);
		const scale = phoneScale(phone, real.mul(density));
		const size = phone.mul(scale / density);
		const min = real.sub(size).div(2);
		const rect = new Rect(math.floor(min.X), math.floor(min.Y), math.floor(min.X) + size.X, math.floor(min.Y) + size.Y);
		const old = this.phoneRect();
		if (!old || old.Min !== rect.Min || old.Max !== rect.Max) this.phoneRect(rect);

		const zoom = zoomRange(phone.Y);
		const k = math.max(1, math.floor(math.min(phone.X / DESIGN.X, phone.Y / DESIGN.Y)));
		const label = t("dev.phone.label", {
			w: tostring(phone.X),
			h: tostring(phone.Y),
			zoom: `${zoom.farthest}-${zoom.closest}`,
			k: tostring(k),
		});
		if (label !== this.phoneLabel()) this.phoneLabel(label);
		this.wrapAll(rect);
	}

	private wrapAll(rect: Rect) {
		const gui = Players.LocalPlayer.FindFirstChild("PlayerGui");
		if (!gui) return;
		for (const child of gui.GetChildren()) {
			if (!child.IsA("ScreenGui") || child.Name === "DevTools") continue;
			let wrap = this.wrapped.get(child);
			if (!wrap) {
				const frame = new Instance("Frame");
				frame.Name = PHONE_FRAME;
				frame.BackgroundTransparency = 1;
				frame.Parent = child;
				for (const other of child.GetChildren()) {
					if (other !== frame && other.IsA("GuiObject")) other.Parent = frame;
				}
				// O que entra depois (o Vide recoloca o que o `Show` esconde) vai para dentro também.
				const connection = child.ChildAdded.Connect((added) => {
					if (added !== frame && added.IsA("GuiObject")) {
						task.defer(() => {
							if (added.Parent === child) added.Parent = frame;
						});
					}
				});
				wrap = { frame, connection };
				this.wrapped.set(child, wrap);
			}
			// A tela que não ignora a barra de cima começa abaixo dela (o `AbsolutePosition` da ScreenGui vem 0, 0).
			const offset = child.IgnoreGuiInset ? Vector2.zero : GuiService.GetGuiInset()[0];
			wrap.frame.Position = UDim2.fromOffset(rect.Min.X - offset.X, rect.Min.Y - offset.Y);
			wrap.frame.Size = UDim2.fromOffset(rect.Width, rect.Height);
		}
		if (!this.guiWatch) {
			this.guiWatch = gui.ChildRemoved.Connect((removed) => this.wrapped.delete(removed));
		}
	}

	private unwrapAll() {
		for (const [gui, wrap] of this.wrapped) {
			wrap.connection.Disconnect();
			for (const child of wrap.frame.GetChildren()) child.Parent = gui;
			wrap.frame.Destroy();
		}
		this.wrapped.clear();
	}
}
