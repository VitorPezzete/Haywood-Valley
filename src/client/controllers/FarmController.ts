import { Controller, OnStart } from "@flamework/core";
import { Players } from "@rbxts/services";
import {
	decodeFarm,
	DEFAULT_CROP,
	FARM_ATTRIBUTE,
	farmCorner,
	farmNow,
	FarmPlot,
	plotAction,
	plotAt,
	plotInReach,
	plotOpen,
} from "shared/farm";
import { TextKey } from "shared/i18n/en";
import { dirStep } from "shared/pieces";
import { worldToArtPx } from "shared/view";
import { WORLD_LOT_ATTRIBUTE, WORLD_ORIGIN, WORLD_TILE } from "shared/world";
import { Events } from "client/network";
import { perfBegin, perfEnd } from "client/perf";
import { FarmLayer } from "client/world/farm";
import { SceneController } from "./SceneController";

/** De quanto em quanto tempo o trigo confere se cresceu, em segundos. */
const GROW_CHECK = 1;
/** Quanto à frente do pé se procura o canteiro, em pixels de arte (logo depois do bloqueio do personagem). */
const REACH_PROBE = 12;

/**
 * A fazenda dos lotes no cliente (fase 1 do `docs/mundo/MAPA_MUNDO.md`, 2026-10-23; regras em `shared/farm.ts`): no
 * mapa do mundo, uma camada (`FarmLayer`) por lote com dono, desenhada do atributo `Fazenda` do dono (todos veem a
 * fazenda de todos), e o trigo crescendo pela hora do servidor. A tecla de ação (`ActionController`) chama `prompt` e
 * `press` quando não há peça nem móvel: na própria fazenda, o canteiro à frente é arado, plantado (trigo) ou colhido; o
 * servidor confere e muda o atributo, e só aí o desenho muda.
 */
@Controller()
export class FarmController implements OnStart {
	private folder?: Folder;
	private layers = new Map<Player, FarmLayer>();
	private decoded = new Map<Player, { text: string; plots: Map<number, FarmPlot> }>();

	constructor(private scene: SceneController) {}

	onStart() {
		this.scene.onMapChanged(() => this.refresh());
		const watch = (player: Player) => {
			player.GetAttributeChangedSignal(FARM_ATTRIBUTE).Connect(() => this.refreshPlayer(player));
			player.GetAttributeChangedSignal(WORLD_LOT_ATTRIBUTE).Connect(() => this.refreshPlayer(player));
		};
		Players.PlayerAdded.Connect(watch);
		for (const player of Players.GetPlayers()) watch(player);
		Players.PlayerRemoving.Connect((player) => {
			this.layers.get(player)?.destroy();
			this.layers.delete(player);
			this.decoded.delete(player);
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

	private refresh() {
		if (!this.scene.worldMap) {
			for (const [, layer] of this.layers) layer.destroy();
			this.layers.clear();
			this.folder?.Destroy();
			this.folder = undefined;
			return;
		}
		for (const player of Players.GetPlayers()) this.refreshPlayer(player);
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
			layer = new FarmLayer(this.folder, lot, corner);
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
		const action = plotAction(this.plotsOf(Players.LocalPlayer).get(plot), farmNow());
		return action === "till" ? "action.till" : action === "plant" ? "action.plant" : action === "harvest" ? "action.harvest" : undefined;
	}

	/** A tecla de ação na fazenda: pede ao servidor; devolve se havia o que fazer. */
	press(root: BasePart, facing: number) {
		const plot = this.target(root, facing);
		if (plot === undefined) return false;
		const action = plotAction(this.plotsOf(Players.LocalPlayer).get(plot), farmNow());
		if (action === "till") Events.farmTill.fire(plot);
		else if (action === "plant") Events.farmPlant.fire(plot, DEFAULT_CROP);
		else if (action === "harvest") Events.farmHarvest.fire(plot);
		return action !== undefined;
	}
}
