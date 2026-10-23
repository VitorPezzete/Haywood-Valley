// A camada da fazenda de um lote do mundo (fase 1 do `docs/mundo/MAPA_MUNDO.md`, §3.5, 2026-10-23; regras em
// `shared/farm.ts`). Um canvas vivo próprio do lote (`createGround`, papel `vivo`) do tamanho da fazenda inicial (64 × 64
// tiles, 1024 × 1024 px), por cima do canvas fixo dos pedaços: arar, plantar, crescer e colher mudam só ele, nunca o
// chão (a regra do plano de otimização). Cada canteiro de 2 × 2 tiles mostra o que já existe do protótipo
// (`sprites.ts`): a terra arada (`Sprites.soil`, duas fileiras) e o trigo em três fases (`wheat1` plantado, `wheat2`
// crescendo, `wheat3` pronto), deitados na camada `GroundLayer.Soil`. Sem arte nova.

import { FARM_TILES, FarmPlot, FarmStage, PLOT_TILES, FARM_PLOTS, plotStage } from "shared/farm";
import { groundOffset } from "shared/view";
import { WORLD_TILE, worldCellCorner } from "shared/world";
import { createGround, Ground, GroundLayer, LIVE_Z_OFFSET } from "./ground";
import { Sprite, Sprites } from "./sprites";

const PLOT_PX = PLOT_TILES * WORLD_TILE;
const FARM_PX = FARM_TILES * WORLD_TILE;
/** A planta de cada estágio e onde fica o pé dela no canteiro (pixels do canteiro). */
const PLANTS: Partial<Record<FarmStage, Sprite>> = {
	plantada: Sprites.wheat1,
	crescendo: Sprites.wheat2,
	pronta: Sprites.wheat3,
};
const PLANT_FOOT = new Vector2(PLOT_PX / 2, PLOT_PX - 6);
/** As duas fileiras de terra arada no canteiro (o meio de cada uma). */
const FURROWS = [new Vector2(PLOT_PX / 2, PLOT_PX / 4), new Vector2(PLOT_PX / 2, (PLOT_PX * 3) / 4)];

interface PlotView {
	stage: FarmStage;
	labels: ImageLabel[];
}

function label(ground: Ground, sprite: Sprite, at: Vector2, layer: number) {
	const image = new Instance("ImageLabel");
	image.BackgroundTransparency = 1;
	image.Size = UDim2.fromOffset(sprite.size.X, sprite.size.Y);
	image.Image = sprite.image;
	image.ImageRectOffset = sprite.frames[0];
	image.ImageRectSize = sprite.size;
	image.ResampleMode = Enum.ResamplerMode.Pixelated;
	image.Position = UDim2.fromOffset(math.round(at.X - sprite.anchor.X), math.round(at.Y - sprite.anchor.Y));
	image.ZIndex = layer;
	image.Parent = ground.gui;
	return image;
}

export class FarmLayer {
	readonly ground: Ground;
	private views = new Map<number, PlotView>();
	private plots = new Map<number, FarmPlot>();

	constructor(
		parent: Instance,
		readonly lot: string,
		corner: [number, number],
	) {
		const center = worldCellCorner(corner[0], corner[1]).add(groundOffset(FARM_PX / 2, FARM_PX / 2));
		this.ground = createGround(parent, center, new Vector2(FARM_PX, FARM_PX), false, LIVE_Z_OFFSET, "vivo");
		this.ground.part.Name = `Fazenda_${lot}`;
	}

	/** Os canteiros guardados agora (do atributo `Fazenda` do dono); redesenha só os que mudaram de estágio. */
	set(plots: Map<number, FarmPlot>, now: number) {
		this.plots = plots;
		for (const [index] of this.views) if (!plots.has(index)) this.draw(index, "terra");
		this.update(now);
	}

	/** Confere o estágio de cada canteiro (o trigo cresce com a hora); `now` é a hora do servidor. */
	update(now: number) {
		for (const [index, plot] of this.plots) this.draw(index, plotStage(plot, now));
	}

	/** Quantas imagens a camada tem (painel de desempenho). */
	images() {
		let count = 0;
		for (const [, view] of this.views) count += view.labels.size();
		return count;
	}

	destroy() {
		this.ground.part.Destroy();
		this.views.clear();
	}

	private draw(index: number, stage: FarmStage) {
		const view = this.views.get(index);
		if (view?.stage === stage) return;
		if (view) for (const old of view.labels) old.Destroy();
		if (stage === "terra") {
			this.views.delete(index);
			return;
		}
		const origin = new Vector2((index % FARM_PLOTS) * PLOT_PX, math.floor(index / FARM_PLOTS) * PLOT_PX);
		const labels = FURROWS.map((at) => label(this.ground, Sprites.soil, origin.add(at), GroundLayer.Soil));
		const plant = PLANTS[stage];
		if (plant) labels.push(label(this.ground, plant, origin.add(PLANT_FOOT), GroundLayer.Soil + 1));
		this.views.set(index, { stage, labels });
	}
}
