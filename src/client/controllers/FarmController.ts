import { Controller, OnStart } from "@flamework/core";
import { Players } from "@rbxts/services";
import {
	decodeFarm,
	DEFAULT_CROP,
	FARM_ATTRIBUTE,
	FARM_CROPS,
	farmCorner,
	farmNow,
	FarmPlot,
	plotAction,
	plotAt,
	plotInReach,
	plotOpen,
	PlotState,
} from "shared/farm";
import { TextKey } from "shared/i18n/en";
import { TextArgs } from "shared/i18n/locales";
import { ITEM_MAX } from "shared/items";
import { dirStep } from "shared/pieces";
import { worldToArtPx } from "shared/view";
import { WORLD_LOT_ATTRIBUTE, WORLD_ORIGIN, WORLD_TILE } from "shared/world";
import { Events } from "client/network";
import { perfBegin, perfEnd } from "client/perf";
import { inventory, itemCount } from "client/state/inventory";
import { FarmLayer } from "client/world/farm";
import { SceneController } from "./SceneController";

/** De quanto em quanto tempo o trigo confere se cresceu, em segundos. */
const GROW_CHECK = 1;
/** Quanto à frente do pé se procura o canteiro, em pixels de arte (logo depois do bloqueio do personagem). */
const REACH_PROBE = 12;

/** O trabalho feito num canteiro, visto pela mudança do atributo `Fazenda` (para o som). */
export type FarmWork = "till" | "plant" | "harvest";

/**
 * A fazenda dos lotes no cliente (fase 1 do `docs/mundo/MAPA_MUNDO.md`, 2026-10-23; regras em `shared/farm.ts`): no
 * mapa do mundo, uma camada (`FarmLayer`) por lote com dono, desenhada do atributo `Fazenda` do dono (todos veem a
 * fazenda de todos), e o trigo crescendo pela hora do servidor. A tecla de ação (`ActionController`) chama `prompt` e
 * `press` quando não há peça nem móvel: na própria fazenda, o canteiro à frente é arado, plantado (trigo) ou colhido; o
 * servidor confere e muda o atributo, e só aí o desenho muda.
 *
 * O som do trabalho (2026-10-23, `onWork`): quando o atributo de um jogador muda com o mundo montado, o que mudou em
 * cada canteiro (nada → arada: arou; arada → plantada: plantou; plantada → arada: colheu) vai a quem ouve. O "antes" é
 * o que este controller ouviu da última vez (`heard`), não o cache do desenho: a dica da tecla lê o atributo a cada
 * quadro e podia já ter o texto novo quando o evento chega. Ao montar o mundo e ao trocar de lote, só se guarda o
 * estado, sem som (a fazenda inteira chegando não é trabalho).
 *
 * O inventário (terceiro passo, 2026-10-23, `client/state/inventory.ts`): a dica de plantar diz quantas sementes
 * sobram (`promptArgs`); sem semente, ela vira "Sem sementes" e a tecla não pede nada; com o item da colheita no
 * máximo, "Inventário cheio". O servidor confere de novo (`FarmService`, `InventoryService`).
 */
@Controller()
export class FarmController implements OnStart {
	private folder?: Folder;
	private layers = new Map<Player, FarmLayer>();
	private decoded = new Map<Player, { text: string; plots: Map<number, FarmPlot> }>();
	private heard = new Map<Player, Map<number, FarmPlot>>();
	private workListeners = new Array<(player: Player, lot: string, plot: number, work: FarmWork) => void>();

	constructor(private scene: SceneController) {}

	/** Chamado a cada canteiro trabalhado por qualquer jogador, depois de o servidor aceitar (o atributo mudou). */
	onWork(listener: (player: Player, lot: string, plot: number, work: FarmWork) => void) {
		this.workListeners.push(listener);
	}

	onStart() {
		this.scene.onMapChanged(() => this.refresh());
		const watch = (player: Player) => {
			player.GetAttributeChangedSignal(FARM_ATTRIBUTE).Connect(() => {
				this.hear(player);
				this.refreshPlayer(player);
			});
			player.GetAttributeChangedSignal(WORLD_LOT_ATTRIBUTE).Connect(() => {
				this.heard.delete(player);
				this.hear(player);
				this.refreshPlayer(player);
			});
		};
		Players.PlayerAdded.Connect(watch);
		for (const player of Players.GetPlayers()) watch(player);
		Players.PlayerRemoving.Connect((player) => {
			this.layers.get(player)?.destroy();
			this.layers.delete(player);
			this.decoded.delete(player);
			this.heard.delete(player);
		});
		task.spawn(() => {
			while (true) {
				task.wait(GROW_CHECK);
				const started = perfBegin("Fazenda");
				const now = farmNow();
				for (const [, layer] of this.layers) layer.update(now);
				perfEnd("Fazenda", started);
			}
		});
		this.refresh();
	}

	/** Quantas imagens as camadas das fazendas têm (painel de desempenho). */
	images() {
		let count = 0;
		for (const [, layer] of this.layers) count += layer.images();
		return count;
	}

	/** Quantos cartões de fileira de trigo as fazendas têm. */
	cards() {
		let count = 0;
		for (const [, layer] of this.layers) count += layer.cards();
		return count;
	}

	private refresh() {
		this.heard.clear();
		if (!this.scene.worldMap) {
			for (const [, layer] of this.layers) layer.destroy();
			this.layers.clear();
			this.folder?.Destroy();
			this.folder = undefined;
			return;
		}
		for (const player of Players.GetPlayers()) {
			this.hear(player);
			this.refreshPlayer(player);
		}
	}

	/** Compara a fazenda do jogador com a última ouvida e avisa o trabalho de cada canteiro (só com o mundo montado). */
	private hear(player: Player) {
		if (!this.scene.worldMap) return;
		const plots = this.plotsOf(player);
		const before = this.heard.get(player);
		this.heard.set(player, plots);
		const lot = player.GetAttribute(WORLD_LOT_ATTRIBUTE);
		if (!before || before === plots || !typeIs(lot, "string") || lot === "") return;
		for (const [index, plot] of plots) {
			const old = before.get(index);
			let work: FarmWork | undefined;
			if (!old) work = plot.state === PlotState.Tilled ? "till" : "plant";
			else if (old.state === PlotState.Tilled && plot.state === PlotState.Planted) work = "plant";
			else if (old.state === PlotState.Planted && plot.state === PlotState.Tilled) work = "harvest";
			if (work) for (const listener of this.workListeners) listener(player, lot, index, work);
		}
	}

	private plotsOf(player: Player) {
		const text = player.GetAttribute(FARM_ATTRIBUTE);
		const value = typeIs(text, "string") ? text : "";
		const known = this.decoded.get(player);
		if (known && known.text === value) return known.plots;
		const plots = decodeFarm(value);
		this.decoded.set(player, { text: value, plots });
		return plots;
	}

	private refreshPlayer(player: Player) {
		const world = this.scene.worldMap;
		const lot = player.GetAttribute(WORLD_LOT_ATTRIBUTE);
		const corner = typeIs(lot, "string") && lot !== "" ? farmCorner(lot) : undefined;
		let layer = this.layers.get(player);
		if (layer && (!world || !corner || layer.lot !== lot)) {
			layer.destroy();
			this.layers.delete(player);
			layer = undefined;
		}
		if (!world || !corner || !typeIs(lot, "string")) return;
		if (!this.folder || this.folder.Parent === undefined) {
			this.folder = new Instance("Folder");
			this.folder.Name = "Fazendas";
			this.folder.Parent = this.scene.world;
		}
		if (!layer) {
			layer = new FarmLayer(this.folder, lot, corner, this.scene.occlusion);
			this.layers.set(player, layer);
		}
		layer.set(this.plotsOf(player), farmNow());
	}

	/** O canteiro da própria fazenda à frente do personagem (ou debaixo do pé), se dá para cultivar. */
	private target(root: BasePart, facing: number) {
		const lot = Players.LocalPlayer.GetAttribute(WORLD_LOT_ATTRIBUTE);
		if (!this.scene.worldMap || !typeIs(lot, "string") || lot === "") return undefined;
		const feet = worldToArtPx(root.Position).sub(worldToArtPx(WORLD_ORIGIN));
		const [sx, sy] = dirStep(facing);
		const cellAt = (px: Vector2) => [math.floor(px.X / WORLD_TILE), math.floor(px.Y / WORLD_TILE)] as const;
		const [fx, fy] = cellAt(feet);
		for (const probe of [feet.add(new Vector2(sx, sy).mul(REACH_PROBE)), feet]) {
			const [x, y] = cellAt(probe);
			const plot = plotAt(lot, x, y);
			if (plot !== undefined && plotOpen(lot, plot) && plotInReach(lot, plot, fx, fy)) return plot;
		}
		return undefined;
	}

	/** O que a tecla de ação faz aqui, para a dica (`ActionHud`). */
	prompt(root: BasePart, facing: number): TextKey | undefined {
		const plot = this.target(root, facing);
		if (plot === undefined) return undefined;
		const current = this.plotsOf(Players.LocalPlayer).get(plot);
		const action = plotAction(current, farmNow());
		if (action === "till") return "action.till";
		if (action === "plant") return this.hasSeed() ? "action.plant" : "action.noSeeds";
		if (action === "harvest") return this.roomFor(current) ? "action.harvest" : "action.storageFull";
		return undefined;
	}

	/** Os valores do texto da dica: quantas sementes sobram, na de plantar. */
	promptArgs(prompt: TextKey | undefined): TextArgs | undefined {
		if (prompt !== "action.plant") return undefined;
		const def = FARM_CROPS[DEFAULT_CROP];
		return { count: def ? itemCount(def.seed) : 0 };
	}

	/** Se há semente da planta de agora (antes de o inventário chegar, deixa o servidor decidir). */
	private hasSeed() {
		const def = FARM_CROPS[DEFAULT_CROP];
		return !inventory().ready || (def !== undefined && itemCount(def.seed) > 0);
	}

	/** Se a colheita do canteiro cabe no inventário. */
	private roomFor(plot: FarmPlot | undefined) {
		const def = plot ? FARM_CROPS[plot.crop] : undefined;
		return !inventory().ready || def === undefined || itemCount(def.harvest) + def.yield <= ITEM_MAX;
	}

	/** A tecla de ação na fazenda: pede ao servidor; devolve se havia o que fazer. */
	press(root: BasePart, facing: number) {
		const plot = this.target(root, facing);
		if (plot === undefined) return false;
		const current = this.plotsOf(Players.LocalPlayer).get(plot);
		const action = plotAction(current, farmNow());
		if (action === "till") Events.farmTill.fire(plot);
		else if (action === "plant" && this.hasSeed()) Events.farmPlant.fire(plot, DEFAULT_CROP);
		else if (action === "harvest" && this.roomFor(current)) Events.farmHarvest.fire(plot);
		else return false;
		return true;
	}
}
