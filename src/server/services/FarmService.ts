import { OnStart, Service } from "@flamework/core";
import { Players } from "@rbxts/services";
import {
	decodeFarm,
	encodeFarm,
	FARM_ATTRIBUTE,
	FARM_CROPS,
	FARM_SAVE_VERSION,
	farmIsNewer,
	farmNow,
	FarmPlot,
	plotAction,
	plotInReach,
	plotOpen,
	PlotState,
} from "shared/farm";
import { MAP_ATTRIBUTE } from "shared/interiorChoice";
import { WORLD_LOT_ATTRIBUTE, WORLD_MAP_ID, worldCellOf } from "shared/world";
import { Events } from "server/network";
import { RATE, RateLimiter } from "server/rateLimit";
import { PlayerDataService } from "./PlayerDataService";

/**
 * A fazenda de cada jogador no lote do mundo (fase 1 do `docs/mundo/MAPA_MUNDO.md`, 2026-10-23; regras em
 * `shared/farm.ts`): o esqueleto de arar, plantar e colher, sem economia (sem semente, sem venda, sem colheita
 * guardada). O servidor guarda a verdade em `PlayerData.farm` e a repassa a todos no atributo `Fazenda` do jogador.
 *
 * Cada pedido (`farmTill`, `farmPlant`, `farmHarvest`) passa pelo limitador (`RATE.farm`) e é conferido: o jogador
 * está no mundo, tem lote, o canteiro dá para cultivar (terra do plano, sem bloqueio), o personagem está a até
 * `FARM_REACH` tiles dele e o canteiro está no estado certo (arar a terra, plantar o arado, colher o pronto). O que não
 * passa é ignorado (o cliente só muda o desenho quando o atributo muda).
 */
@Service()
export class FarmService implements OnStart {
	private plots = new Map<Player, Map<number, FarmPlot>>();

	constructor(private readonly data: PlayerDataService) {}

	onStart() {
		this.data.onLoaded((player) => this.load(player));
		for (const player of Players.GetPlayers()) if (this.data.isReady(player)) this.load(player);
		Players.PlayerRemoving.Connect((player) => this.plots.delete(player));
		const limit = new RateLimiter(RATE.farm);
		Events.farmTill.connect((player, plot) => {
			if (limit.allow(player)) this.change(player, plot, "till");
		});
		Events.farmPlant.connect((player, plot, crop) => {
			if (limit.allow(player)) this.change(player, plot, "plant", crop);
		});
		Events.farmHarvest.connect((player, plot) => {
			if (limit.allow(player)) this.change(player, plot, "harvest");
		});
	}

	private load(player: Player) {
		const farm = this.data.farmOf(player);
		if (!farm || !player.Parent) return;
		// O salvo de uma versão mais nova fica como veio: nada se mexe nele nesta sessão.
		if (farmIsNewer(farm)) {
			warn(`[Fazenda] ${player.Name}: fazenda salva por uma versão mais nova (${farm.v}); fica sem mexer`);
			return;
		}
		const plots = decodeFarm(farm.plots);
		this.plots.set(player, plots);
		player.SetAttribute(FARM_ATTRIBUTE, encodeFarm(plots));
	}

	private change(player: Player, plot: unknown, action: "till" | "plant" | "harvest", crop?: unknown) {
		const plots = this.plots.get(player);
		const lot = player.GetAttribute(WORLD_LOT_ATTRIBUTE);
		if (!plots || player.GetAttribute(MAP_ATTRIBUTE) !== WORLD_MAP_ID || !typeIs(lot, "string") || lot === "") return;
		if (!typeIs(plot, "number") || plot !== math.floor(plot) || !plotOpen(lot, plot)) return;
		const root = player.Character?.FindFirstChild("HumanoidRootPart");
		if (!root?.IsA("BasePart")) return;
		const [x, y] = worldCellOf(root.Position);
		if (!plotInReach(lot, plot, x, y)) return;
		const now = farmNow();
		const current = plots.get(plot);
		if (plotAction(current, now) !== action) return;
		if (action === "till") {
			plots.set(plot, { state: PlotState.Tilled, crop: "", at: 0 });
		} else if (action === "plant") {
			if (!typeIs(crop, "string") || FARM_CROPS[crop] === undefined) return;
			plots.set(plot, { state: PlotState.Planted, crop, at: math.floor(now) });
		} else {
			// Colher: o canteiro volta a arado (a colheita ainda não vai para lugar nenhum).
			plots.set(plot, { state: PlotState.Tilled, crop: "", at: 0 });
		}
		const text = encodeFarm(plots);
		this.data.setFarm(player, { v: FARM_SAVE_VERSION, plots: text });
		player.SetAttribute(FARM_ATTRIBUTE, text);
	}
}
