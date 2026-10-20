import { Controller, OnRender, OnStart } from "@flamework/core";
import { Workspace } from "@rbxts/services";
import { CLOCK_OFFSET_ATTRIBUTE, gameHour, HOUR_TEST_ATTRIBUTE } from "shared/clock";
import { decorTile, decorVariant } from "shared/decor";
import { daylightAt } from "shared/daylight";
import { perfBegin, perfEnd } from "client/perf";
import { TILE_ANIMATION_FPS } from "client/world/interior";
import { buildLights } from "client/world/lights";
import { dayTone, setTone, tintedCount, tintStats, watchTint } from "client/world/tint";
import { ActionController } from "./ActionController";
import { SceneController } from "./SceneController";

type Lights = ReturnType<typeof buildLights>;
type DecorState = Parameters<typeof decorVariant>[0];

/** Depois de quantos segundos de jogo o Output mostra o custo do tom e das luzes. */
const REPORT_AFTER = 8;

/**
 * De quanto em quanto tempo a hora é lida de novo, em segundos: num dia de 10 minutos a hora anda devagar, e o
 * tom só troca a cada 0,25 s (`tint.ts`). Os halos que tremem trocam de quadro no ritmo dos tiles animados, então
 * a hora também é lida quando esse quadro muda (seção 5.1 do `PLANO_OTIMIZACAO.md`).
 */
const DAY_EVERY = 0.25;

/**
 * O dia e a noite no mundo: a cada quadro lê a hora (`shared/clock.ts`), tinge tudo o que é desenhado na
 * pasta `World` com o tom da hora (`client/world/tint.ts`), troca as janelas do interior pela versão de noite
 * e acerta a força dos halos (`client/world/lights.ts`). A interface fica de fora.
 */
@Controller()
export class DaylightController implements OnStart, OnRender {
	private lights?: Lights;
	private started = 0;
	private reported = false;
	private lastName = "";
	private lastApply = -math.huge;
	private lastTick = -1;
	private lightSerial = 0;
	private seenLights = -1;
	private seenTone?: Color3;

	constructor(
		private scene: SceneController,
		private actions: ActionController,
	) {}

	onStart() {
		this.started = os.clock();
		watchTint(this.scene.world);
		if (this.scene.interior) this.lights = buildLights(this.scene.interior);
		this.addExtras();
		// Outro mapa: as luzes dele, e as janelas e os halos já na hora de agora.
		this.scene.onMapChanged(() => {
			this.lightSerial += 1;
			this.lights?.destroy();
			this.lights = this.scene.interior ? buildLights(this.scene.interior) : undefined;
			this.addExtras();
			this.apply(true);
		});
		// As peças postas no Decorar (a tocha, a luminária, a janela) e o fogão aceso acendem como os tiles do mapa.
		this.actions.onDecor((key, state) => this.setDecorLights(key, state));
		this.actions.onFixture((id, _on, cells) => {
			this.lights?.setExtra(`fixture:${id}`, cells);
			this.apply(true);
		});
		this.apply(true);
		// Hora fixada ou solta para testar: o tom muda na hora, sem esperar o intervalo do `tint.ts`.
		Workspace.GetAttributeChangedSignal(HOUR_TEST_ATTRIBUTE).Connect(() => this.apply(true));
		// Dormir pula a hora (`RelogioDesvio`): o tom da manhã entra na hora.
		Workspace.GetAttributeChangedSignal(CLOCK_OFFSET_ATTRIBUTE).Connect(() => this.apply(true));
	}

	onRender() {
		const now = os.clock();
		const tick = math.floor(now * TILE_ANIMATION_FPS);
		if (tick === this.lastTick && now - this.lastApply < DAY_EVERY) return;
		this.lastTick = tick;
		this.apply(false);
	}

	lightAt(position: Vector3) {
		return this.lights?.lightAt(position, dayTone());
	}

	lightKey() {
		return this.lightSerial;
	}

	private setDecorLights(key: number, state: DecorState | undefined) {
		const cells: Parameters<Lights["setExtra"]>[1] = [];
		if (state) {
			for (const cell of decorVariant(state).cells) {
				cells.push([state.x + cell[0], state.y + cell[1], decorTile(state.item, cell)]);
			}
		}
		this.lights?.setExtra(`decor:${key}`, cells);
		this.apply(true);
	}

	private addExtras() {
		if (!this.lights) return;
		// O tabuleiro ainda pode ser o do mapa de antes (o `ActionController` troca no mesmo aviso): só o do mapa de agora.
		const board = this.actions.currentBoard();
		if (!board || board.map !== this.scene.map) return;
		for (const [key, state] of board.decor) this.setDecorLights(key, state);
		const fixtures = this.actions.currentFixtures();
		if (fixtures) {
			for (const fixture of fixtures.fixtures) {
				this.lights.setExtra(`fixture:${fixture.id}`, fixtures.cellsOf(fixture.id));
			}
		}
	}

	private apply(force: boolean) {
		const now = os.clock();
		this.lastApply = now;
		const day = daylightAt(gameHour());
		let started = perfBegin("Tom");
		setTone(day.tone, now, force);
		this.scene.interior?.setNight(day.night);
		perfEnd("Tom", started);
		started = perfBegin("Luzes");
		this.lights?.update(day, now);
		perfEnd("Luzes", started);
		const version = this.lights?.version ?? -1;
		if (version !== this.seenLights || dayTone() !== this.seenTone) {
			this.seenLights = version;
			this.seenTone = dayTone();
			this.lightSerial += 1;
		}
		if (day.name !== this.lastName) {
			this.lastName = day.name;
			print(
				`[Luz] ${string.format("%05.2f", day.hour)}h: ${day.name}, luzes ${string.format("%.2f", day.lights)}`,
			);
		}
		if (!this.reported && now - this.started > REPORT_AFTER) {
			this.reported = true;
			print(
				`[Luz] tom em ${tintedCount()} imagens; última troca ${string.format("%.2f", tintStats.lastMs)} ms, ` +
					`a mais lenta ${string.format("%.2f", tintStats.maxMs)} ms, ${tintStats.applies} trocas; ` +
					`${this.lights?.count ?? 0} halos; ${this.scene.interior?.stats.windowImages ?? 0} imagens de janela`,
			);
		}
	}
}
