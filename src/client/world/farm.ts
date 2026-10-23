// A camada da fazenda de um lote do mundo (fase 1 do `docs/mundo/MAPA_MUNDO.md`, §3.5, 2026-10-23; regras em
// `shared/farm.ts`). Um canvas vivo próprio do lote (`createGround`, papel `vivo`) do tamanho da fazenda inicial (64 × 64
// tiles, 1024 × 1024 px), por cima do canvas fixo dos pedaços: arar, plantar, crescer e colher mudam só ele, nunca o
// chão (a regra do plano de otimização). Cada canteiro de 2 × 2 tiles mostra o que já existe do protótipo
// (`sprites.ts`): a terra arada (`Sprites.soil`, duas fileiras) e o trigo em três fases (`wheat1` plantado, `wheat2`
// crescendo, `wheat3` pronto). Sem arte nova.
//
// **O trigo em pé** (terceiro passo, 2026-10-23): a terra arada e o broto (`wheat1`, baixo, não cobre ninguém) ficam
// deitados no canvas vivo; o trigo crescendo e o pronto vão para **cartões** (`card.ts`), como no protótipo, para o
// boneco que passa atrás deles ficar atrás. Um cartão por **fileira de canteiros** (1024 × 32 px, a base na borda de
// baixo da fileira, que é a borda de baixo de cada pé de trigo: a mesma ordem de desenho que um cartão por planta),
// criado quando a fileira ganha o primeiro trigo alto e tirado quando perde o último: no máximo 32 cartões por lote
// em vez de 1.024 (180 numa fazenda cheia). Cada pé de trigo alto entra sozinho na oclusão (`occlusion.ts`, "block",
// como o trigo do protótipo): só ele fica meio transparente com o boneco atrás, não a fileira. Sem o vento do
// protótipo: trocar o quadro de cada pé faria o Roblox refazer o cartão da fileira inteira a cada quadro.

import { FARM_TILES, FarmPlot, FarmStage, PLOT_TILES, FARM_PLOTS, plotStage } from "shared/farm";
import { groundOffset } from "shared/view";
import { WORLD_TILE, worldCellCorner } from "shared/world";
import { createCard } from "./card";
import { createGround, Ground, GroundLayer, LIVE_Z_OFFSET } from "./ground";
import { Occlusion } from "./occlusion";
import { Sprite, Sprites } from "./sprites";

const PLOT_PX = PLOT_TILES * WORLD_TILE;
const FARM_PX = FARM_TILES * WORLD_TILE;
/** A planta de cada estágio e onde fica o pé dela no canteiro (pixels do canteiro). */
const PLANTS: Partial<Record<FarmStage, Sprite>> = {
	plantada: Sprites.wheat1,
	crescendo: Sprites.wheat2,
	pronta: Sprites.wheat3,
};
/** Os estágios que ficam em pé (no cartão da fileira); o broto fica deitado. */
const STANDING: Partial<Record<FarmStage, true>> = { crescendo: true, pronta: true };
const PLANT_FOOT = new Vector2(PLOT_PX / 2, PLOT_PX - 6);
/** As duas fileiras de terra arada no canteiro (o meio de cada uma). */
const FURROWS = [new Vector2(PLOT_PX / 2, PLOT_PX / 4), new Vector2(PLOT_PX / 2, (PLOT_PX * 3) / 4)];

interface PlotView {
	stage: FarmStage;
	/** O que fica deitado no canvas vivo (a terra e o broto). */
	labels: ImageLabel[];
	/** O pé de trigo em pé, no cartão da fileira, e a função que o tira da oclusão. */
	standing?: ImageLabel;
	unocclude?: () => void;
}

/** O cartão de uma fileira de canteiros: quantos pés de trigo em pé ele tem. */
interface RowCard {
	part: Part;
	gui: SurfaceGui;
	plants: number;
}

function label(parent: Instance, sprite: Sprite, at: Vector2, layer: number) {
	const image = new Instance("ImageLabel");
	image.BackgroundTransparency = 1;
	image.Size = UDim2.fromOffset(sprite.size.X, sprite.size.Y);
	image.Image = sprite.image;
	image.ImageRectOffset = sprite.frames[0];
	image.ImageRectSize = sprite.size;
	image.ResampleMode = Enum.ResamplerMode.Pixelated;
	image.Position = UDim2.fromOffset(math.round(at.X - sprite.anchor.X), math.round(at.Y - sprite.anchor.Y));
	image.ZIndex = layer;
	image.Parent = parent;
	return image;
}

export class FarmLayer {
	readonly ground: Ground;
	private views = new Map<number, PlotView>();
	private plots = new Map<number, FarmPlot>();
	private rows = new Map<number, RowCard>();

	constructor(
		private readonly parent: Instance,
		readonly lot: string,
		private readonly corner: [number, number],
		private readonly occlusion: Occlusion,
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

	/** Quantas imagens a camada tem, deitadas e nos cartões (painel de desempenho). */
	images() {
		let count = 0;
		for (const [, view] of this.views) count += view.labels.size() + (view.standing ? 1 : 0);
		return count;
	}

	/** Quantos cartões de fileira a camada tem agora. */
	cards() {
		return this.rows.size();
	}

	destroy() {
		for (const [, view] of this.views) view.unocclude?.();
		for (const [, row] of this.rows) row.part.Destroy();
		this.rows.clear();
		this.ground.part.Destroy();
		this.views.clear();
	}

	/** O cartão da fileira `row` (criado na primeira vez): a base na borda de baixo da fileira, do lado esquerdo da fazenda. */
	private rowCard(row: number) {
		const known = this.rows.get(row);
		if (known) return known;
		const size = new Vector2(FARM_PX, PLOT_PX);
		const sprite: Sprite = { image: "", size, anchor: new Vector2(0, size.Y), frames: [Vector2.zero] };
		const base = worldCellCorner(this.corner[0], this.corner[1] + (row + 1) * PLOT_TILES);
		const card = createCard(this.parent, `Trigo_${this.lot}_${row}`, sprite, base);
		// O cartão só leva os pés de trigo: a imagem dele (vazia) não aparece.
		card.image.Visible = false;
		const created: RowCard = { part: card.part, gui: card.image.Parent as SurfaceGui, plants: 0 };
		this.rows.set(row, created);
		return created;
	}

	private dropStanding(index: number, view: PlotView) {
		if (!view.standing) return;
		view.unocclude?.();
		view.standing.Destroy();
		view.standing = undefined;
		view.unocclude = undefined;
		const card = this.rows.get(math.floor(index / FARM_PLOTS));
		if (card) card.plants -= 1;
	}

	/** Tira o cartão da fileira que ficou sem trigo em pé. */
	private pruneRow(row: number) {
		const card = this.rows.get(row);
		if (!card || card.plants > 0) return;
		card.part.Destroy();
		this.rows.delete(row);
	}

	private draw(index: number, stage: FarmStage) {
		const view = this.views.get(index);
		if (view?.stage === stage) return;
		if (view) {
			for (const old of view.labels) old.Destroy();
			this.dropStanding(index, view);
		}
		const column = index % FARM_PLOTS;
		const row = math.floor(index / FARM_PLOTS);
		if (stage === "terra") {
			this.views.delete(index);
			this.pruneRow(row);
			return;
		}
		const origin = new Vector2(column * PLOT_PX, row * PLOT_PX);
		const labels = FURROWS.map((at) => label(this.ground.gui, Sprites.soil, origin.add(at), GroundLayer.Soil));
		const created: PlotView = { stage, labels };
		const plant = PLANTS[stage];
		if (plant && STANDING[stage]) {
			const card = this.rowCard(row);
			card.plants += 1;
			created.standing = label(card.gui, plant, new Vector2(column * PLOT_PX, 0).add(PLANT_FOOT), 1);
			const foot = worldCellCorner(this.corner[0], this.corner[1]).add(
				groundOffset(origin.X + PLANT_FOOT.X, origin.Y + PLANT_FOOT.Y),
			);
			created.unocclude = this.occlusion.add(created.standing, plant, foot, "block");
		} else if (plant) {
			labels.push(label(this.ground.gui, plant, origin.add(PLANT_FOOT), GroundLayer.Soil + 1));
		}
		this.views.set(index, created);
		this.pruneRow(row);
	}
}
