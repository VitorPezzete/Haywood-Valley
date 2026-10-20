// As zonas das folhas do Aeko e o que se deriva delas (seção 12.4 da especificação). Cópia de `ZONES`, `tileZone`,
// `isAnimated`, `tileKind` e `SEAT_FACING` de src/shared/interiorMap.ts: o plugin não importa de src/. Mudar uma
// zona é mudar aqui e no jogo (e, quando existir, em diorama/catalogo/zonas.json).

/** Um tile de uma folha do Aeko: a folha (`casa`, `castelo`), a coluna (0 a 127) e a linha (0 a 31). */
export type Tile = [folha: string, col: number, row: number];

export type Zona =
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

/** Os tipos de tile do Graal que as ações usam: 3 senta, 4 cama em cima, 5 cama embaixo, 6 água rasa, 11 água funda. */
export type TipoTile = 0 | 3 | 4 | 5 | 6 | 11;

/** Para onde olha o boneco: 0 cima, 1 esquerda, 2 baixo, 3 direita. */
export type Olhar = 0 | 1 | 2 | 3;

export const COLUNAS = 128;
export const LINHAS = 32;
export const TILE_PX = 16;
/** Cada folha vai ao Roblox em duas metades de 64 colunas (1024 × 512). */
export const METADE = 64;
export const FOLHAS_CONHECIDAS: ReadonlyArray<string> = ["casa", "castelo"];
/** O tile vazio: preto, de uma cor só, fundo do canvas inteiro. */
export const VAZIO_COL = 0;
export const VAZIO_LINHA = 2;

/** [c0, l0, c1, l1, zona]; vale a primeira que contém o tile. */
export const ZONAS: ReadonlyArray<[c0: number, l0: number, c1: number, l1: number, zona: Zona]> = [
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

export const DESCRICAO_ZONA: Record<Zona, string> = {
	vazio: "vazio (bloqueia)",
	animado: "animado (4 quadros, um por linha)",
	agua: "água funda",
	agua_rasa: "água rasa",
	lava: "lava",
	fere: "fere",
	senta: "assento",
	deita: "cama",
	normal: "piso",
	sem_pecas: "sem peças",
	frente: "frente",
	chao: "chão",
	bloqueia: "bloqueia",
};

/** A zona de um tile. `[folha, 0, 2]` é o vazio antes de qualquer zona; a linha 0 das colunas 32–63 é chão no castelo. */
export function zonaDoTile(tile: Tile): Zona {
	const [folha, col, row] = tile;
	if (col === VAZIO_COL && row === VAZIO_LINHA) return "vazio";
	for (const [c0, l0, c1, l1, zona] of ZONAS) {
		if (col >= c0 && col <= c1 && row >= l0 && row <= l1) {
			return zona === "frente" && folha === "castelo" ? "chao" : zona;
		}
	}
	return "chao";
}

export const QUADROS_ANIMACAO = 4;

/** Tile animado: a zona [1–15, 0–3]; cada coluna tem 4 quadros, um por linha. */
export function ehAnimado(tile: Tile) {
	return tile[1] >= 1 && tile[1] <= 15 && tile[2] >= 0 && tile[2] < QUADROS_ANIMACAO;
}

/** Piso em que se pisa e onde uma peça pousa. */
export function ehPiso(zona: Zona) {
	return zona === "chao" || zona === "normal";
}

/** A zona que bloqueia o passo (12.8): vazio e `bloqueia`. `sem_pecas` fica de fora (palpite de ARQUITETURA.md). */
export function zonaBloqueia(zona: Zona) {
	return zona === "vazio" || zona === "bloqueia";
}

/** O tipo de tile do Graal de um tile, pela zona dele. */
export function tipoDoTile(tile: Tile): TipoTile {
	const zona = zonaDoTile(tile);
	if (zona === "agua_rasa") return 6;
	return zona === "senta" ? 3 : zona === "deita" ? 4 : zona === "agua" ? 11 : 0;
}

/** Para que lado olha quem senta em cada assento (conferido nas folhas em 2026-10-17). */
export const ASSENTOS: ReadonlyArray<[folha: string, c0: number, l0: number, c1: number, l1: number, olhar: Olhar]> = [
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
export function olharDoAssento(tile: Tile): Olhar | undefined {
	const [folha, col, row] = tile;
	for (const [f, c0, l0, c1, l1, olhar] of ASSENTOS) {
		if (f === folha && col >= c0 && col <= c1 && row >= l0 && row <= l1) return olhar;
	}
	return undefined;
}

export function mesmoTile(a: Tile | undefined, b: Tile | undefined) {
	if (a === undefined || b === undefined) return a === b;
	return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}
