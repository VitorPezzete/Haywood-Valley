// Os catálogos do Diorama em diorama/catalogo/*.json: as zonas das folhas (zonas.json), as peças (pecas.json), os
// tipos de fundo (fundos.json) e o layout das folhas do exterior (exterior.json). Formato em docs/diorama/GERADOR.md.
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "./folhas.mjs";

export const PASTA_CATALOGO = path.join(RAIZ, "diorama", "catalogo");

const cache = new Map();

export function lerCatalogo(nome) {
	let valor = cache.get(nome);
	if (!valor) {
		const caminho = path.join(PASTA_CATALOGO, `${nome}.json`);
		if (!fs.existsSync(caminho)) throw new Error(`catálogo ${nome}.json não existe em diorama/catalogo`);
		valor = JSON.parse(fs.readFileSync(caminho, "utf8"));
		cache.set(nome, valor);
	}
	return valor;
}

function dentro(col, row, [c0, l0, c1, l1]) {
	return col >= c0 && col <= c1 && row >= l0 && row <= l1;
}

/**
 * A zona de um tile da folha (`vazio`, `chao`, `bloqueia`…), como `tileZone` de src/shared/interiorMap.ts: o tile
 * do vazio primeiro, depois as exceções por folha (zonas.json `excecoes`) e as zonas gerais; fora de tudo, `chao`.
 */
export function zonaDoTile(folha, col, row) {
	const zonas = lerCatalogo("zonas");
	if (col === zonas.vazio[0] && row === zonas.vazio[1]) return "vazio";
	for (const excecao of zonas.excecoes ?? []) {
		if (excecao.folha === folha && dentro(col, row, excecao.area)) return excecao.zona;
	}
	for (const [c0, l0, c1, l1, zona] of zonas.zonas) {
		if (dentro(col, row, [c0, l0, c1, l1])) return zona;
	}
	return "chao";
}

/** Se um tile bloqueia o passo, pela zona dele (zonas.json `bloqueiam`). */
export function tileBloqueia(folha, col, row) {
	return lerCatalogo("zonas").bloqueiam.includes(zonaDoTile(folha, col, row));
}

let acoesPorTile;

/**
 * O código de ação de um tile (`3` senta, `4` cama em cima, `5` cama embaixo) ou `.`: primeiro as peças de pecas.json
 * com `acoes` (uma linha de códigos por linha da peça) ou `acao`, depois a zona (zonas.json `acoes`).
 */
export function acaoDoTile(folha, col, row) {
	if (!acoesPorTile) {
		acoesPorTile = new Map();
		for (const peca of lerCatalogo("pecas").pecas) {
			const [c0, l0, w, h] = peca.area;
			for (let j = 0; j < h; j++) {
				const linha = peca.acoes ? peca.acoes[j] : peca.acao ? peca.acao.repeat(w) : undefined;
				if (!linha) continue;
				for (let i = 0; i < w; i++) {
					if (linha[i] && linha[i] !== ".") acoesPorTile.set(`${peca.folha},${c0 + i},${l0 + j}`, linha[i]);
				}
			}
		}
	}
	const daPeca = acoesPorTile.get(`${folha},${col},${row}`);
	if (daPeca) return daPeca;
	return lerCatalogo("zonas").acoes[zonaDoTile(folha, col, row)] ?? ".";
}
