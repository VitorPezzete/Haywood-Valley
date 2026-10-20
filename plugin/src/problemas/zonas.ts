// As zonas das folhas do Aeko, copiadas da seção 12.4 da especificação (ZONES em src/shared/interiorMap.ts), só
// para o diagnóstico saber se uma célula bloqueia (zona `bloqueia`). A fonte de verdade é diorama/catalogo/
// zonas.json; quando o catálogo existir na ponte, trocar esta cópia pela leitura de lá.

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

/** [c0, l0, c1, l1, zona], inclusivo; vale a primeira que contém o tile. A linha 0 das colunas 32–63 é `chao` no castelo. */
const ZONAS: Array<[number, number, number, number, Zona]> = [
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

export function zonaDoTile(folha: string, coluna: number, linha: number): Zona {
	if (coluna === 0 && linha === 2) return "vazio";
	if (folha === "castelo" && linha === 0 && coluna >= 32 && coluna <= 63) return "chao";
	for (const [c0, l0, c1, l1, zona] of ZONAS) {
		if (coluna >= c0 && coluna <= c1 && linha >= l0 && linha <= l1) return zona;
	}
	return "chao";
}

/** Se um tile nesta zona bloqueia o passo (palpite de ARQUITETURA.md: `bloqueia`; `sem_pecas` fica de fora). */
export function zonaBloqueia(zona: Zona): boolean {
	return zona === "bloqueia";
}
