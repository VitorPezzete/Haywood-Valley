// Os pincéis (12.6): pincel, retângulo, balde, borracha e conta-gotas, sobre uma camada do modelo. Todos recebem um
// carimbo: um retângulo de valores (tiles empacotados nas camadas 0–2, códigos de terreno na 3) que se repete pelo
// padrão a partir do ponto de origem. Cada função grava no modelo e registra as células no histórico; quem chama
// abre e fecha o lote e sobe a versão do canvas.
import { CAMADA_TERRENO, CELULAS, LADO, ModeloBloco } from "./bloco";
import { Historico } from "./historico";

export type Ferramenta = "pincel" | "retangulo" | "balde" | "borracha" | "contagotas" | "peca";

export const TECLA_DA_FERRAMENTA: ReadonlyArray<[Enum.KeyCode, Ferramenta]> = [
	[Enum.KeyCode.B, "pincel"],
	[Enum.KeyCode.R, "retangulo"],
	[Enum.KeyCode.G, "balde"],
	[Enum.KeyCode.E, "borracha"],
	[Enum.KeyCode.I, "contagotas"],
];

export const NOME_DA_FERRAMENTA: Record<Ferramenta, string> = {
	pincel: "Pincel (B)",
	retangulo: "Retângulo (R)",
	balde: "Balde (G)",
	borracha: "Borracha (E)",
	contagotas: "Conta-gotas (I)",
	peca: "Peça do catálogo",
};

export type Valor = number | string;

/** Um retângulo de valores, linha a linha. Tiles empacotados (0 = apaga) ou códigos de terreno ("" = apaga). */
export interface Carimbo {
	largura: number;
	altura: number;
	valores: Valor[];
}

export function vazioDe(camada: number): Valor {
	return camada === CAMADA_TERRENO ? "" : 0;
}

export function carimboUnico(valor: Valor): Carimbo {
	return { largura: 1, altura: 1, valores: [valor] };
}

/** O carimbo serve para a camada: tiles nas camadas 0–2, códigos na 3. */
export function carimboServe(carimbo: Carimbo | undefined, camada: number) {
	if (!carimbo || carimbo.valores.size() === 0) return false;
	const v = carimbo.valores[0];
	return camada === CAMADA_TERRENO ? typeIs(v, "string") : typeIs(v, "number");
}

/** O valor do padrão na posição (i, j) relativa à origem do carimbo, repetindo o padrão. */
export function valorDoCarimbo(carimbo: Carimbo, i: number, j: number): Valor {
	const ci = ((i % carimbo.largura) + carimbo.largura) % carimbo.largura;
	const cj = ((j % carimbo.altura) + carimbo.altura) % carimbo.altura;
	return carimbo.valores[cj * carimbo.largura + ci];
}

/** Grava um valor numa célula e registra no histórico (nada acontece fora do bloco ou se o valor é o mesmo). */
export function gravar(modelo: ModeloBloco, hist: Historico, camada: number, x: number, y: number, valor: Valor) {
	if (!modelo.dentro(x, y)) return;
	const indice = modelo.indice(x, y);
	const antes = modelo.obter(camada, indice);
	if (antes === valor) return;
	modelo.definir(camada, indice, valor);
	hist.registrar(camada, indice, antes, valor);
}

/** Pincel: o carimbo inteiro com o canto superior esquerdo na célula (x, y). */
export function pintar(modelo: ModeloBloco, hist: Historico, camada: number, x: number, y: number, carimbo: Carimbo) {
	for (let j = 0; j < carimbo.altura; j++) {
		for (let i = 0; i < carimbo.largura; i++) gravar(modelo, hist, camada, x + i, y + j, carimbo.valores[j * carimbo.largura + i]);
	}
}

/** Borracha: apaga um retângulo de `largura × altura` com o canto em (x, y). */
export function apagar(modelo: ModeloBloco, hist: Historico, camada: number, x: number, y: number, largura = 1, altura = 1) {
	const vazio = vazioDe(camada);
	for (let j = 0; j < altura; j++) {
		for (let i = 0; i < largura; i++) gravar(modelo, hist, camada, x + i, y + j, vazio);
	}
}

/** Retângulo entre dois cantos (inclusivos), preenchido com o padrão do carimbo a partir do canto de cima à esquerda; sem carimbo, apaga. */
export function retangulo(
	modelo: ModeloBloco,
	hist: Historico,
	camada: number,
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	carimbo: Carimbo | undefined,
) {
	const ax = math.max(0, math.min(x0, x1));
	const ay = math.max(0, math.min(y0, y1));
	const bx = math.min(LADO - 1, math.max(x0, x1));
	const by = math.min(LADO - 1, math.max(y0, y1));
	const vazio = vazioDe(camada);
	for (let y = ay; y <= by; y++) {
		for (let x = ax; x <= bx; x++) {
			gravar(modelo, hist, camada, x, y, carimbo ? valorDoCarimbo(carimbo, x - ax, y - ay) : vazio);
		}
	}
}

/**
 * Balde: preenche a área contígua (4 vizinhos) do mesmo valor da célula (x, y) com o padrão do carimbo, alinhado ao
 * bloco (a célula (x, y) do bloco recebe o valor (x mod largura, y mod altura) do padrão). Sem carimbo, apaga.
 */
export function balde(modelo: ModeloBloco, hist: Historico, camada: number, x: number, y: number, carimbo: Carimbo | undefined) {
	if (!modelo.dentro(x, y)) return;
	const alvo = modelo.obter(camada, modelo.indice(x, y));
	const vazio = vazioDe(camada);
	// Com um carimbo de um valor só igual ao alvo, nada muda.
	if (carimbo && carimbo.largura === 1 && carimbo.altura === 1 && carimbo.valores[0] === alvo) return;
	if (!carimbo && alvo === vazio) return;
	const visitadas = new Array<boolean>(CELULAS);
	const fila = new Array<number>();
	fila.push(modelo.indice(x, y));
	visitadas[modelo.indice(x, y)] = true;
	// Primeiro decide quais células entram (pelo valor original), depois grava, para o padrão não contaminar a busca.
	const dentro = new Array<number>();
	while (fila.size() > 0) {
		const i = fila.pop()!;
		if (modelo.obter(camada, i) !== alvo) continue;
		dentro.push(i);
		const cx = i % LADO;
		const cy = math.floor(i / LADO);
		const vizinhos = [
			cx > 0 ? i - 1 : -1,
			cx < LADO - 1 ? i + 1 : -1,
			cy > 0 ? i - LADO : -1,
			cy < LADO - 1 ? i + LADO : -1,
		];
		for (const v of vizinhos) {
			if (v < 0 || visitadas[v]) continue;
			visitadas[v] = true;
			fila.push(v);
		}
	}
	for (const i of dentro) {
		const cx = i % LADO;
		const cy = math.floor(i / LADO);
		gravar(modelo, hist, camada, cx, cy, carimbo ? valorDoCarimbo(carimbo, cx, cy) : vazio);
	}
}

/** Conta-gotas: o valor da camada ativa na célula; vazio nela, o tile de cima entre as três camadas (e a camada dele). */
export function contaGotas(modelo: ModeloBloco, camada: number, x: number, y: number): { camada: number; valor: Valor } | undefined {
	if (!modelo.dentro(x, y)) return undefined;
	const i = modelo.indice(x, y);
	const proprio = modelo.obter(camada, i);
	if (proprio !== vazioDe(camada)) return { camada, valor: proprio };
	if (camada === CAMADA_TERRENO) return undefined;
	for (const c of [2, 1, 0]) {
		const v = modelo.obter(c, i);
		if (v !== 0) return { camada: c, valor: v };
	}
	return undefined;
}
