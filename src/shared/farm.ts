// A fazenda do jogador no lote do mundo (fase 1 do `docs/mundo/MAPA_MUNDO.md`, §3.5 e §11, 2026-10-23): o esqueleto
// de arar, plantar e colher, sem economia. Vale no cliente (que desenha e pede) e no servidor (que confere e grava).
//
// - **Onde**: a fazenda inicial de 64 × 64 tiles no meio do lote (`PHASE1_LOTS[n].farm`), dividida em **canteiros** de
//   2 × 2 tiles (32 × 32 px, a célula do protótipo: a terra arada e o trigo de `sprites.ts` têm esse tamanho). Um
//   canteiro dá para cultivar quando os 4 tiles são terra do plano (os 3 canteiros de terra do esboço) e nada bloqueia.
//   O lote é uma vaga (`MundoLote`, como o lugar da casa): a fazenda é guardada pelo canteiro dentro dela, então sai
//   igual em qualquer lote que o jogador ganhar.
// - **Estados**: terra (nada guardado), arada, plantada; crescendo e pronta saem da hora em que se plantou
//   (`plotStage`), pelo relógio do servidor (`Workspace.GetServerTimeNow`, segundos Unix: o mesmo em todo servidor),
//   então a planta cresce com o jogador fora do jogo, como no Hay Day.
// - **Salvo** em `PlayerData.farm` (`FARM_SAVE_VERSION`), no texto de `encodeFarm`, e repassado a todos os clientes no
//   atributo `Fazenda` do jogador (o mundo é compartilhado: todos veem a fazenda de todos).

import { Workspace } from "@rbxts/services";
import { PHASE1_LOTS } from "./world/fase1";
import { PHASE1_CELL_X, PHASE1_CELL_Y, terrainAt, worldBlocked } from "./world";

/** Versão do formato salvo da fazenda; muda quando o texto mudar de jeito. */
export const FARM_SAVE_VERSION = 1;
/** As versões que este código lê. Uma mais nova fica guardada como veio, sem mexer (`farmIsNewer`). */
const FARM_READS = new Set([1]);
/** Atributo do jogador com a fazenda (o texto de `encodeFarm`), repassado a todos. */
export const FARM_ATTRIBUTE = "Fazenda";
/** Atributo do Workspace, só para testes: segundos para o trigo crescer, no lugar de `FARM_CROPS`. */
export const FARM_GROW_TEST_ATTRIBUTE = "FazendaCrescerTeste";

/** Lado do canteiro, em tiles, e da fazenda inicial, em canteiros. */
export const PLOT_TILES = 2;
export const FARM_TILES = 64;
export const FARM_PLOTS = FARM_TILES / PLOT_TILES;
/** A que distância (em tiles, de célula a célula) o personagem alcança um canteiro. */
export const FARM_REACH = 3;
/** Tamanho máximo do texto salvo (cada canteiro guardado tem até uns 22 letras; 1.024 canteiros). */
export const FARM_MAX_TEXT = 24000;

/** O que se planta: o tempo para ficar pronto, em segundos. Sem economia ainda (nem semente nem venda). */
export const FARM_CROPS: Record<string, { grow: number }> = {
	trigo: { grow: 120 },
};
export const DEFAULT_CROP = "trigo";

export const enum PlotState {
	Tilled = 1,
	Planted = 2,
}

/** Um canteiro guardado: arado, ou plantado (com a planta e a hora do servidor em que foi plantado). */
export interface FarmPlot {
	state: PlotState;
	crop: string;
	at: number;
}

export type FarmStage = "terra" | "arada" | "plantada" | "crescendo" | "pronta";

/** O que fica salvo em `PlayerData.farm`. */
export interface PlayerFarm {
	v: number;
	plots: string;
}

export function emptyFarm(): PlayerFarm {
	return { v: FARM_SAVE_VERSION, plots: "" };
}

/** Se a fazenda foi salva por uma versão do jogo mais nova que esta: fica como veio e não se mexe nela. */
export function farmIsNewer(farm: PlayerFarm) {
	return farm.v > FARM_SAVE_VERSION;
}

const isIndex = (value: number | undefined): value is number =>
	value !== undefined && value === math.floor(value) && value >= 0 && value < FARM_PLOTS * FARM_PLOTS;

/** Os canteiros como texto estável: "índice,estado,planta,hora;..." em ordem de índice (a planta vazia no arado). */
export function encodeFarm(plots: ReadonlyMap<number, FarmPlot>) {
	const keys = new Array<number>();
	for (const [index] of plots) keys.push(index);
	keys.sort((a, b) => a < b);
	return keys
		.map((index) => {
			const plot = plots.get(index)!;
			return plot.state === PlotState.Planted ? `${index},2,${plot.crop},${plot.at}` : `${index},1`;
		})
		.join(";");
}

/** Lê o texto de `encodeFarm`, jogando fora o que não for do formato. */
export function decodeFarm(text: unknown) {
	const plots = new Map<number, FarmPlot>();
	if (!typeIs(text, "string") || text === "" || text.size() > FARM_MAX_TEXT) return plots;
	for (const entry of text.split(";")) {
		const [i, s, crop, at] = entry.split(",") as (string | undefined)[];
		const index = tonumber(i);
		const state = tonumber(s);
		if (!isIndex(index)) continue;
		if (state === PlotState.Tilled) {
			plots.set(index, { state: PlotState.Tilled, crop: "", at: 0 });
		} else if (state === PlotState.Planted && crop !== undefined && FARM_CROPS[crop] !== undefined) {
			const time = tonumber(at);
			if (time !== undefined && time === math.floor(time) && time >= 0) {
				plots.set(index, { state: PlotState.Planted, crop, at: time });
			}
		}
	}
	return plots;
}

/**
 * Lê o salvo. Sem fazenda (o salvo de antes de 2026-10-23) é a fazenda vazia. Uma versão mais nova fica como veio,
 * para a gravação deste servidor devolvê-la sem perder nada.
 */
export function sanitizeFarm(value: unknown): PlayerFarm {
	const farm = emptyFarm();
	if (!typeIs(value, "table")) return farm;
	const saved = value as { v?: unknown; plots?: unknown };
	if (!typeIs(saved.v, "number") || !typeIs(saved.plots, "string")) return farm;
	if (saved.v > FARM_SAVE_VERSION && saved.v === math.floor(saved.v)) return { v: saved.v, plots: saved.plots };
	if (!FARM_READS.has(saved.v)) return farm;
	farm.plots = encodeFarm(decodeFarm(saved.plots));
	return farm;
}

/** Os segundos para a planta ficar pronta (o teste `FazendaCrescerTeste` vale mais). */
export function growSeconds(crop: string) {
	const test = Workspace.GetAttribute(FARM_GROW_TEST_ATTRIBUTE);
	if (typeIs(test, "number") && test > 0) return test;
	return FARM_CROPS[crop]?.grow ?? math.huge;
}

/** A hora do servidor, em segundos Unix (a mesma em todo servidor e, com a correção do Roblox, no cliente). */
export function farmNow() {
	return Workspace.GetServerTimeNow();
}

/** O estágio do canteiro agora: plantada no primeiro terço do tempo, crescendo até ficar pronta. */
export function plotStage(plot: FarmPlot | undefined, now: number): FarmStage {
	if (!plot) return "terra";
	if (plot.state === PlotState.Tilled) return "arada";
	const fraction = (now - plot.at) / growSeconds(plot.crop);
	return fraction >= 1 ? "pronta" : fraction >= 1 / 3 ? "crescendo" : "plantada";
}

/** A fazenda do lote: o canto de cima à esquerda (célula do mundo), ou nada se o lote não existe. */
export function farmCorner(lot: string): [number, number] | undefined {
	const found = PHASE1_LOTS.find((candidate) => candidate.name === lot);
	return found ? [PHASE1_CELL_X + found.farm[0], PHASE1_CELL_Y + found.farm[1]] : undefined;
}

/** A primeira célula do mundo do canteiro `index` do lote. */
export function plotCell(lot: string, index: number): [number, number] | undefined {
	const corner = farmCorner(lot);
	if (!corner || !isIndex(index)) return undefined;
	return [corner[0] + (index % FARM_PLOTS) * PLOT_TILES, corner[1] + math.floor(index / FARM_PLOTS) * PLOT_TILES];
}

/** O canteiro do lote sob a célula (x, y) do mundo, ou nada fora da fazenda. */
export function plotAt(lot: string, x: number, y: number): number | undefined {
	const corner = farmCorner(lot);
	if (!corner) return undefined;
	const i = x - corner[0];
	const j = y - corner[1];
	if (i < 0 || j < 0 || i >= FARM_TILES || j >= FARM_TILES) return undefined;
	return math.floor(j / PLOT_TILES) * FARM_PLOTS + math.floor(i / PLOT_TILES);
}

const openPlots = new Map<string, boolean>();

/** Se o canteiro dá para cultivar: os 4 tiles são terra do plano e nenhum bloqueia. */
export function plotOpen(lot: string, index: number) {
	const key = `${lot}:${index}`;
	const known = openPlots.get(key);
	if (known !== undefined) return known;
	const cell = plotCell(lot, index);
	let open = cell !== undefined;
	for (let dy = 0; dy < PLOT_TILES && open && cell; dy++) {
		for (let dx = 0; dx < PLOT_TILES && open; dx++) {
			const x = cell[0] + dx;
			const y = cell[1] + dy;
			open = terrainAt(x, y) === "t" && !worldBlocked(x, y);
		}
	}
	openPlots.set(key, open);
	return open;
}

/** Se a célula (x, y) do mundo está a até `FARM_REACH` tiles do canteiro. */
export function plotInReach(lot: string, index: number, x: number, y: number) {
	const cell = plotCell(lot, index);
	if (!cell) return false;
	const dx = x < cell[0] ? cell[0] - x : x >= cell[0] + PLOT_TILES ? x - (cell[0] + PLOT_TILES - 1) : 0;
	const dy = y < cell[1] ? cell[1] - y : y >= cell[1] + PLOT_TILES ? y - (cell[1] + PLOT_TILES - 1) : 0;
	return math.max(dx, dy) <= FARM_REACH;
}

/** A ação que o canteiro aceita agora (a do botão F), ou nada. */
export function plotAction(plot: FarmPlot | undefined, now: number): "till" | "plant" | "harvest" | undefined {
	const stage = plotStage(plot, now);
	if (stage === "terra") return "till";
	if (stage === "arada") return "plant";
	if (stage === "pronta") return "harvest";
	return undefined;
}
