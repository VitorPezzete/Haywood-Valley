// Onde está cada peça móvel de um interior durante a sessão, e as regras para ela mudar de lugar. O
// servidor guarda a verdade (PieceService) e confere cada pedido; cada cliente tem uma cópia igual, que ele
// usa para desenhar, colidir e saber onde o boneco senta. A posição vale só para a sessão; no Decorar
// (shared/decor.ts), o dono da casa muda as peças de lugar de vez, e o tabuleiro guarda também as peças que ele
// pôs (`decor`), que bloqueiam, sentam e deitam como os tiles do mapa.

import { InteriorMap, PieceSpot, seatFacing, TileKind, tileKind } from "./interiorMap";
import { DecorBoard, decorKind, DecorState, decorTile, decorVariant } from "./decor";
import type { DecorCell } from "./decorCatalog";
import type { InteriorTile } from "./interiors/types";
import { Facing, familyDefs, PieceDef } from "./pieceDefs";
import { FLOOR_COL0, FLOOR_COLS, FLOOR_ROW0, FLOOR_ROWS, PIECE_FLOORS } from "./pieceFloors";

/** Passo do boneco e da peça ao puxar ou empurrar, em células. */
export const STEP_CELLS = 1;
/** Quanto dura um passo de puxar ou empurrar, em segundos. */
export const STEP_SECONDS = 0.3;
/** Até quantas células além da frente do boneco voa o objeto jogado. */
export const THROW_CELLS = 3;
/** Quanto dura o voo do objeto jogado, em segundos. */
export const THROW_SECONDS = 0.4;
/** Distância máxima, em células, entre o pé do jogador e a peça que ele mexe (o servidor confere). */
export const PIECE_REACH = 2;
/**
 * Distância máxima, em células, entre o pé do jogador e a torneira que ele abre e fecha: a banheira tem 4
 * fileiras e 5 colunas, e a torneira fica na ponta esquerda da segunda; de baixo da banheira, ela fica a 3.
 */
export const TAP_REACH = 4;

/**
 * O que um jogador consegue fazer com as peças: empurrar andando, puxar (com F), levantar, e até que peso
 * (`PieceDef.weight`). É o ponto único para uma luva virar item depois (pedido do usuário em 2026-10-17):
 * hoje todo jogador tem as mãos de começo, que puxam e levantam tudo. O servidor e o cliente perguntam aqui.
 */
export interface Handling {
	pull: boolean;
	lift: boolean;
	strength: number;
}

/** As mãos de quem começa o jogo: puxam e levantam tudo o que existe hoje. */
export const BARE_HANDS: Handling = { pull: true, lift: true, strength: 2 };

/** O que o jogador consegue fazer com as peças (sem luva por enquanto: as mãos de começo). */
export function handlingOf(player: Player): Handling {
	void player;
	return BARE_HANDS;
}

/** Empurrar andando contra a peça: só as que bloqueiam (a cadeira não: o boneco sobe nela). */
export function canPush(handling: Handling, def: PieceDef) {
	return def.blocks && def.weight <= handling.strength;
}

export function canPull(handling: Handling, def: PieceDef) {
	return handling.pull && def.weight <= handling.strength;
}

export function canLift(handling: Handling, def: PieceDef) {
	return handling.lift && def.lift && def.weight <= handling.strength;
}

/** O passo de uma direção do boneco, em células: x para a direita, y para baixo. */
export function dirStep(dir: number): [number, number] {
	return dir === 0 ? [0, -1] : dir === 1 ? [-1, 0] : dir === 2 ? [0, 1] : [1, 0];
}

/**
 * Onde fica uma peça de `w` × `h` células posta logo à frente de quem tem o pé em `feet` (pixels de arte a
 * partir do canto do bloco) e olha para `dir`: encostada na célula do pé, centrada nele.
 */
export function frontSpot(feet: Vector2, dir: number, w: number, h: number): [number, number] {
	const cx = math.floor(feet.X / 16);
	const cy = math.floor(feet.Y / 16);
	// Para cima e para baixo, centrada no pé; para os lados, com a fileira de baixo na do pé.
	const left = math.floor(feet.X / 16 - w / 2 + 0.5);
	if (dir === 0) return [left, cy - h];
	if (dir === 2) return [left, cy + 1];
	if (dir === 1) return [cx - w, cy - h + 1];
	return [cx + 1, cy - h + 1];
}

export interface PieceState {
	spot: PieceSpot;
	x: number;
	y: number;
	mode: number;
	holder: number;
	variant: number;
}

export class PieceBoard implements DecorBoard {
	readonly pieces = new Map<string, PieceState>();
	private readonly order = new Array<PieceState>();
	readonly decor = new Map<number, DecorState>();
	private readonly decorCells = new Map<number, [DecorState, DecorCell]>();

	constructor(readonly map: InteriorMap) {
		for (const spot of map.spots) {
			const state: PieceState = { spot, x: spot.x, y: spot.y, mode: 0, holder: 0, variant: spot.def.variant ?? 0 };
			this.pieces.set(spot.id, state);
			this.order.push(state);
		}
	}

	all(): ReadonlyArray<PieceState> {
		return this.order;
	}

	defOf(state: PieceState): PieceDef {
		const family = state.spot.def.family;
		if (family === undefined) return state.spot.def;
		return familyDefs(family)[state.variant] ?? state.spot.def;
	}

	at(x: number, y: number, ignore?: PieceState) {
		for (const state of this.order) {
			if (state === ignore || (state.mode !== 0 && state.mode !== 1)) continue;
			const def = state.spot.def;
			if (x >= state.x && y >= state.y && x < state.x + def.w && y < state.y + def.h) return state;
		}
		return undefined;
	}

	setDecor(state: DecorState) {
		this.removeDecor(state.key);
		this.decor.set(state.key, state);
		for (const cell of decorVariant(state).cells) {
			this.decorCells.set(this.map.key(state.x + cell[0], state.y + cell[1]), [state, cell]);
		}
	}

	removeDecor(key: number) {
		const state = this.decor.get(key);
		if (!state) return undefined;
		this.decor.delete(key);
		for (const cell of decorVariant(state).cells) {
			const cellKey = this.map.key(state.x + cell[0], state.y + cell[1]);
			if (this.decorCells.get(cellKey)?.[0] === state) this.decorCells.delete(cellKey);
		}
		return state;
	}

	decorAt(x: number, y: number) {
		return this.decorCells.get(this.map.key(x, y));
	}

	occupiedByPiece(x: number, y: number, ignore?: number) {
		if (this.at(x, y) || this.map.residentAt(x, y)) return true;
		const decor = this.decorAt(x, y);
		return decor !== undefined && decor[0].key !== ignore;
	}

	isExit(x: number, y: number) {
		return (this.map.data.exits ?? []).some(
			(exit) => x >= exit.x && y >= exit.y && x < exit.x + exit.width && y < exit.y + exit.height,
		);
	}

	top(x: number, y: number): InteriorTile | undefined {
		const decor = this.decorAt(x, y);
		if (decor) return decorTile(decor[0].item, decor[1]);
		const piece = this.at(x, y);
		if (piece) return this.tileOf(piece, x, y);
		return this.map.ground(x, y);
	}

	tileOf(state: PieceState, x: number, y: number): InteriorTile {
		const def = this.defOf(state);
		return [def.sheet, def.col + (x - state.x), def.row + (y - state.y)];
	}

	blocked(x: number, y: number) {
		if (this.map.blocked(x, y) || this.map.residentAt(x, y)) return true;
		const decor = this.decorAt(x, y);
		if (decor && decor[1][8] === 1) return true;
		const piece = this.at(x, y);
		return piece !== undefined && piece.spot.def.blocks;
	}

	kind(x: number, y: number): TileKind {
		const decor = this.decorAt(x, y);
		if (decor) return decorKind(decor[1]);
		const piece = this.at(x, y);
		if (piece) return piece.spot.def.kind === "chair" ? tileKind(this.tileOf(piece, x, y)) : 0;
		return this.map.kind(x, y);
	}

	seatFacing(x: number, y: number): Facing | undefined {
		const decor = this.decorAt(x, y);
		if (decor) {
			// A cadeira posta olha para onde a forma dela diz (de frente, de lado).
			const facing = decor[0].item.forms[decor[0].form]?.facing;
			return facing !== undefined ? facing as Facing : seatFacing(decorTile(decor[0].item, decor[1]));
		}
		const piece = this.at(x, y);
		if (piece) return seatFacing(this.tileOf(piece, x, y));
		const tile = this.map.ground(x, y);
		return tile ? seatFacing(tile) : undefined;
	}

	fits(state: PieceState, x: number, y: number, occupied?: (x: number, y: number) => boolean) {
		const def = state.spot.def;
		for (let j = 0; j < def.h; j++) {
			for (let i = 0; i < def.w; i++) {
				const cx = x + i;
				const cy = y + j;
				if (!this.map.freeFloor(cx, cy) && !this.map.origin.has(this.map.key(cx, cy))) return false;
				if (this.at(cx, cy, state) || this.decorAt(cx, cy)) return false;
				if (occupied?.(cx, cy)) return false;
			}
		}
		return true;
	}

	variantFor(state: PieceState, x: number, y: number) {
		const family = state.spot.def.family;
		const floors = family !== undefined ? PIECE_FLOORS[family] : undefined;
		if (!floors) return state.variant;
		const votes = new Map<number, number>();
		const def = state.spot.def;
		for (let j = 0; j < def.h; j++) {
			for (let i = 0; i < def.w; i++) {
				const floor = this.map.tile(0, x + i, y + j);
				const text = floor ? floors[floor[0]] : undefined;
				if (!floor || text === undefined) continue;
				const col = floor[1] - FLOOR_COL0;
				const row = floor[2] - FLOOR_ROW0;
				if (col < 0 || row < 0 || col >= FLOOR_COLS || row >= FLOOR_ROWS) continue;
				const index = row * FLOOR_COLS + col + 1;
				const variant = tonumber(text.sub(index, index));
				if (variant !== undefined) votes.set(variant, (votes.get(variant) ?? 0) + 1);
			}
		}
		let best = state.variant;
		let most = 0;
		for (const [variant, count] of votes) {
			if (count > most || (count === most && variant === state.variant)) {
				best = variant;
				most = count;
			}
		}
		return best;
	}

	set(id: string, x: number, y: number, mode: number, holder: number, variant: number) {
		const state = this.pieces.get(id);
		if (!state) return undefined;
		state.x = x;
		state.y = y;
		state.mode = mode;
		state.holder = holder;
		state.variant = variant;
		return state;
	}

	heldBy(userId: number) {
		for (const state of this.order) {
			if (state.holder === userId && (state.mode === 1 || state.mode === 2)) return state;
		}
		return undefined;
	}

	untouched(state: PieceState) {
		return (
			state.x === state.spot.x &&
			state.y === state.spot.y &&
			state.mode === 0 &&
			state.variant === (state.spot.def.variant ?? 0)
		);
	}
}
