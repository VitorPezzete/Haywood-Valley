// O que cada célula de um interior faz, para as ações do boneco: assento, cama, água funda, bloqueio, e
// onde estão as peças que se seguram e carregam. Vale para o cliente (pose e desenho) e para o servidor
// (que confere os movimentos das peças).

import { Workspace } from "@rbxts/services";
import type { InteriorData, InteriorTile } from "./interiors/types";
import { Facing, PIECE_DEFS, PieceDef } from "./pieceDefs";

/**
 * Os tipos de tile do Graal que as ações usam (lista da Graal Bible): 3 cadeira (sofá, cadeira, vaso),
 * 4 cama em cima (cabeceira e travesseiro), 5 cama embaixo (coberta), 6 água rasa ("swamp": os pés na água),
 * 11 água funda (nada).
 */
export type TileKind = 0 | 3 | 4 | 5 | 6 | 11;

/** Comportamento de um tile pela zona da folha (formato pics1 do Graal), como no catálogo do Diorama. */
export type TileZone =
	| "vazio"
	| "animado"
	| "agua"
	| "agua_rasa"
	| "lava"
	| "fere"
	| "senta"
	| "deita"
	| "normal"
	| "sem_pecas"
	| "frente"
	| "chao"
	| "bloqueia";

/**
 * As zonas das folhas do Aeko, [c0, l0, c1, l1, zona]; vale a primeira. Cópia de `AEKO_ZONES` do catálogo
 * do Diorama (plugin/src/generated/catalogoAeko.ts), que o jogo não importa; as duas folhas são iguais,
 * menos a linha 0 das colunas 32 a 63 (frente na casa, chão no castelo).
 */
const ZONES: ReadonlyArray<[c0: number, l0: number, c1: number, l1: number, zone: TileZone]> = [
	[0, 0, 15, 3, "animado"],
	[0, 4, 15, 9, "agua"],
	[0, 10, 15, 11, "agua_rasa"],
	[0, 12, 15, 17, "lava"],
	[0, 18, 15, 19, "fere"],
	[0, 20, 15, 23, "senta"],
	[0, 24, 15, 25, "deita"],
	[0, 26, 15, 31, "normal"],
	[16, 0, 31, 31, "sem_pecas"],
	[32, 0, 63, 0, "frente"],
	[32, 1, 63, 19, "chao"],
	[32, 20, 63, 31, "bloqueia"],
	[64, 16, 127, 31, "bloqueia"],
	[64, 0, 127, 15, "sem_pecas"],
];

export function tileZone(tile: InteriorTile): TileZone {
	const [sheet, col, row] = tile;
	if (col === 0 && row === 2) return "vazio";
	for (const [c0, l0, c1, l1, zone] of ZONES) {
		if (col >= c0 && col <= c1 && row >= l0 && row <= l1) return zone === "frente" && sheet === "castelo" ? "chao" : zone;
	}
	return "chao";
}

/**
 * Tile animado: a zona [1-15, 0-3] das folhas (a coluna 0 é o vazio e o claro da prancha). Cada coluna tem
 * 4 quadros, um por linha da folha: o quadro n é a linha n da mesma coluna. São as chamas, o fogo da lareira,
 * os patinhos e a torneira da banheira, a água do fosso do castelo.
 */
export const ANIMATION_FRAMES = 4;

export function isAnimated(tile: InteriorTile) {
	return tile[1] >= 1 && tile[1] <= 15 && tile[2] >= 0 && tile[2] < ANIMATION_FRAMES;
}

/**
 * A torneira da banheira: aberta, a água corre (os 4 quadros de [5, 0-3]); fechada, o tile da banheira com a
 * torneira sem água correndo ([68, 19], a ponta esquerda da borda com água, que é o mesmo desenho sem o jato).
 */
export const TAP_SHEET = "casa";
export const TAP_COL = 5;
export const TAP_CLOSED: InteriorTile = ["casa", 68, 19];

export function isTap(tile: InteriorTile) {
	return tile[0] === TAP_SHEET && tile[1] === TAP_COL && tile[2] < ANIMATION_FRAMES;
}

/** Piso em que se pisa e onde uma peça pode pousar. */
function isFloorZone(zone: TileZone) {
	return zone === "chao" || zone === "normal";
}

/**
 * Para que lado olha quem senta em cada assento, pelo desenho das folhas (conferido nas folhas em
 * 2026-10-17): a cadeira "de frente" mostra o encosto atrás do assento e quem senta olha para baixo; a "de
 * costas" mostra as costas do encosto e quem senta olha para cima; a "de lado" de [2, 20-21] tem o encosto
 * à esquerda (olha para a direita) e a de [2, 22-23] à direita (olha para a esquerda); o vaso de [3-5] olha
 * para a esquerda e o de [6-8] para a direita (nota do catálogo); o sofá e a cadeira de pedra do castelo,
 * para baixo. Assento fora da lista (as almofadas do castelo) senta virado para onde o boneco chegou.
 */
const SEAT_FACING: ReadonlyArray<[sheet: string, c0: number, l0: number, c1: number, l1: number, facing: Facing]> = [
	["casa", 0, 20, 1, 21, 2],
	["casa", 2, 20, 2, 21, 3],
	["casa", 0, 22, 1, 23, 0],
	["casa", 2, 22, 2, 23, 1],
	["casa", 3, 20, 5, 23, 1],
	["casa", 6, 20, 8, 23, 3],
	["casa", 10, 20, 15, 21, 2],
	["castelo", 0, 20, 1, 22, 2],
];

/** Para que lado olha quem senta no tile, ou nada quando o desenho não diz. */
export function seatFacing(tile: InteriorTile): Facing | undefined {
	const [sheet, col, row] = tile;
	for (const [s, c0, l0, c1, l1, dir] of SEAT_FACING) {
		if (s === sheet && col >= c0 && col <= c1 && row >= l0 && row <= l1) return dir;
	}
	return undefined;
}

/** O tipo de tile do Graal de um tile das folhas, pela zona dele. */
export function tileKind(tile: InteriorTile): TileKind {
	const zone = tileZone(tile);
	if (zone === "agua_rasa") return 6;
	return zone === "senta" ? 3 : zone === "deita" ? 4 : zone === "agua" ? 11 : 0;
}

/**
 * Atributo do Workspace que liga as peças de teste das ações: um pote, um caixote, um baú e uma piscina de
 * água funda (a água da banheira, que é a única água funda da folha da casa), postos no piso livre mais perto
 * do começo. A posição muda quando o mapa muda; serve para testar, não é parte do mapa.
 */
export const ACTIONS_TEST_ATTRIBUTE = "AcoesTeste";
/** A água funda da piscina de teste: a água da banheira, "sem borda", três tiles que se repetem. */
const TEST_WATER: InteriorTile[] = [
	["casa", 0, 9],
	["casa", 1, 9],
	["casa", 2, 9],
];
const TEST_POOL = new Vector2(5, 4);
const TEST_PIECES = ["casa42", "casa67", "casa46"];

/** Uma peça móvel do interior: qual, onde ela estava no mapa e o id que a rede usa. */
export interface PieceSpot {
	id: string;
	def: PieceDef;
	x: number;
	y: number;
	test: boolean;
}

/**
 * Um interior lido para as ações. As células são do bloco (as do Diorama, 0 a 63). As peças móveis são
 * achadas no próprio mapa: cada lugar da camada de objeto em que aparece, inteira e na ordem da folha,
 * uma peça de `PIECE_DEFS`, em cima de piso de verdade (a peça desenhada na parede ou no balcão, como o
 * baú e o caixote da casa de teste, fica onde está). Onde a peça estava, o jogo desenha o piso da camada de
 * baixo quando ela sai.
 */
export class InteriorMap {
	readonly spots = new Array<PieceSpot>();
	readonly origin = new Set<number>();
	private readonly extra = new Map<number, InteriorTile>();
	readonly taps = new Array<[number, number]>();
	readonly residentCells = new Set<number>();
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
	private readonly cells: number[][];

	constructor(
		readonly data: InteriorData,
		start: [number, number],
		test = Workspace.GetAttribute(ACTIONS_TEST_ATTRIBUTE) === true,
	) {
		this.x = data.x;
		this.y = data.y;
		this.width = data.width;
		this.height = data.height;
		this.cells = data.layers.map((rows) => {
			const cells = new Array<number>();
			for (const row of rows) {
				for (const part of row.split(" ")) cells.push(tonumber(part) ?? 0);
			}
			return cells;
		});
		this.findPieces();
		this.findResidents();
		if (test) this.addTest(start);
		for (let y = this.y; y < this.y + this.height; y++) {
			for (let x = this.x; x < this.x + this.width; x++) {
				const tile = this.ground(x, y);
				if (tile && isTap(tile)) this.taps.push([x, y]);
			}
		}
	}

	isTap(x: number, y: number) {
		return this.taps.some(([tx, ty]) => tx === x && ty === y);
	}

	residentAt(x: number, y: number) {
		return this.residentCells.has(this.key(x, y));
	}

	key(x: number, y: number) {
		return y * 1024 + x;
	}

	inside(x: number, y: number) {
		return x >= this.x && y >= this.y && x < this.x + this.width && y < this.y + this.height;
	}

	tile(layer: number, x: number, y: number): InteriorTile | undefined {
		if (!this.inside(x, y)) return undefined;
		const n = this.cells[layer][(y - this.y) * this.width + (x - this.x)];
		return n === 0 ? undefined : this.data.tiles[n - 1];
	}

	ground(x: number, y: number): InteriorTile | undefined {
		const key = this.key(x, y);
		const extra = this.extra.get(key);
		if (extra) return extra;
		if (this.origin.has(key)) return this.tile(0, x, y);
		return this.tile(2, x, y) ?? this.tile(1, x, y) ?? this.tile(0, x, y);
	}

	blocked(x: number, y: number) {
		if (!this.inside(x, y)) return true;
		const key = this.key(x, y);
		if (this.origin.has(key) || this.extra.has(key)) return false;
		return this.data.blocks[y - this.y].sub(x - this.x + 1, x - this.x + 1) === "#";
	}

	kind(x: number, y: number): TileKind {
		if (!this.inside(x, y)) return 0;
		const key = this.key(x, y);
		const extra = this.extra.get(key);
		if (extra) return tileKind(extra);
		if (this.origin.has(key)) return 0;
		const code = this.data.actions[y - this.y].sub(x - this.x + 1, x - this.x + 1);
		if (code === "3") return 3;
		if (code === "4") return 4;
		if (code === "5") return 5;
		// O mar fundo do exterior: o gerador marca a célula (não há tile de chão).
		if (code === "~") return 11;
		// A água rasa do exterior: o boneco anda com os pés na água.
		if (code === "6") return 6;
		// A água das folhas não está em `actions`: vem da zona do tile de chão (a camada de baixo; a água não bloqueia).
		const floor = this.tile(0, x, y);
		const top = this.ground(x, y);
		if (top && floor && top === floor) {
			const zone = tileZone(floor);
			if (zone === "agua") return 11;
			if (zone === "agua_rasa") return 6;
		}
		return 0;
	}

	freeFloor(x: number, y: number) {
		if (this.blocked(x, y) || this.residentAt(x, y) || this.kind(x, y) !== 0) return false;
		const top = this.ground(x, y);
		return top !== undefined && isFloorZone(tileZone(top));
	}

	private findResidents() {
		for (const resident of this.data.residents ?? []) {
			const { x, y } = resident;
			this.residentCells.add(this.key(x, y));
			if (resident.pose !== "lie") continue;
			const bed = (cy: number) => {
				const kind = this.kind(x, cy);
				return kind === 4 || kind === 5;
			};
			for (let cy = y - 1; bed(cy); cy--) this.residentCells.add(this.key(x, cy));
			for (let cy = y + 1; bed(cy); cy++) this.residentCells.add(this.key(x, cy));
		}
	}

	private findPieces() {
		const claimed = new Set<number>();
		for (let y = this.y; y < this.y + this.height; y++) {
			for (let x = this.x; x < this.x + this.width; x++) {
				const tile = this.tile(1, x, y);
				if (!tile) continue;
				for (const def of PIECE_DEFS) {
					if (def.sheet !== tile[0] || def.col !== tile[1] || def.row !== tile[2]) continue;
					if (!this.wholeAt(def, x, y, claimed)) continue;
					for (let j = 0; j < def.h; j++) {
						for (let i = 0; i < def.w; i++) {
							claimed.add(this.key(x + i, y + j));
							this.origin.add(this.key(x + i, y + j));
						}
					}
					this.spots.push({ id: `${def.id}@${x},${y}`, def, x, y, test: false });
					break;
				}
			}
		}
	}

	private wholeAt(def: PieceDef, x: number, y: number, claimed: Set<number>) {
		for (let j = 0; j < def.h; j++) {
			for (let i = 0; i < def.w; i++) {
				const cx = x + i;
				const cy = y + j;
				if (claimed.has(this.key(cx, cy))) return false;
				const tile = this.tile(1, cx, cy);
				if (!tile || tile[0] !== def.sheet || tile[1] !== def.col + i || tile[2] !== def.row + j) return false;
				if (this.tile(2, cx, cy)) return false;
				const floor = this.tile(0, cx, cy);
				if (!floor || !isFloorZone(tileZone(floor))) return false;
			}
		}
		return true;
	}

	private addTest(start: [number, number]) {
		const reserved = new Set<number>();
		for (let j = -1; j <= 1; j++) {
			for (let i = -1; i <= 1; i++) reserved.add(this.key(start[0] + i, start[1] + j));
		}
		const spotFor = (w: number, h: number) => {
			let best: [number, number] | undefined;
			let bestDistance = math.huge;
			for (let y = this.y + 1; y + h < this.y + this.height; y++) {
				for (let x = this.x + 1; x + w < this.x + this.width; x++) {
					const distance = math.abs(x + w / 2 - start[0]) + math.abs(y + h / 2 - start[1]);
					if (distance >= bestDistance) continue;
					let free = true;
					for (let j = -1; j <= h && free; j++) {
						for (let i = -1; i <= w && free; i++) {
							free = this.freeFloor(x + i, y + j) && !reserved.has(this.key(x + i, y + j));
						}
					}
					if (free) {
						best = [x, y];
						bestDistance = distance;
					}
				}
			}
			if (best) {
				for (let j = -1; j <= h; j++) {
					for (let i = -1; i <= w; i++) reserved.add(this.key(best[0] + i, best[1] + j));
				}
			}
			return best;
		};
		const pool = spotFor(TEST_POOL.X, TEST_POOL.Y);
		if (pool) {
			for (let j = 0; j < TEST_POOL.Y; j++) {
				for (let i = 0; i < TEST_POOL.X; i++) {
					this.extra.set(this.key(pool[0] + i, pool[1] + j), TEST_WATER[i % TEST_WATER.size()]);
				}
			}
		}
		for (const id of TEST_PIECES) {
			const def = PIECE_DEFS.find((candidate) => candidate.id === id);
			if (!def) continue;
			const at = spotFor(def.w, def.h);
			if (at) this.spots.push({ id: `${def.id}@${at[0]},${at[1]}`, def, x: at[0], y: at[1], test: true });
		}
	}
}
