// As folhas do Aeko inteiras (2048 × 512, 128 colunas × 32 linhas de tiles de 16 px), em diorama/folhas/<nome>.png,
// montadas das metades (<nome>_0.png à esquerda, colunas 0 a 63; <nome>_1.png à direita, 64 a 127, as imagens que
// vão para o Roblox). As imagens do exterior (folha_juncao.png, forma_equipe_32.png) ficam na mesma pasta. O gerador
// lê daqui a cor dos tiles de uma cor só (`flat` do InteriorData e os recortes esticados do exterior).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gravarPng, lerPng, pixel } from "./png.mjs";

export const TILE = 16;
export const COLUNAS = 128;
export const LINHAS = 32;
export const METADE = 64;

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PASTA_FOLHAS = path.join(RAIZ, "diorama", "folhas");

/** Monta diorama/folhas/<nome>.png das duas metades (1024 × 512 cada). */
export function montarFolha(nome, esquerda = path.join(PASTA_FOLHAS, `${nome}_0.png`), direita = path.join(PASTA_FOLHAS, `${nome}_1.png`)) {
	const a = lerPng(esquerda);
	const b = lerPng(direita);
	if (a.width !== METADE * TILE || b.width !== METADE * TILE || a.height !== LINHAS * TILE || b.height !== LINHAS * TILE) {
		throw new Error(`metades de ${nome} com tamanho inesperado: ${a.width}×${a.height} e ${b.width}×${b.height}`);
	}
	const width = COLUNAS * TILE;
	const height = LINHAS * TILE;
	const data = Buffer.alloc(width * height * 4);
	for (let y = 0; y < height; y++) {
		a.data.copy(data, y * width * 4, y * a.width * 4, (y + 1) * a.width * 4);
		b.data.copy(data, (y * width + a.width) * 4, y * b.width * 4, (y + 1) * b.width * 4);
	}
	fs.mkdirSync(PASTA_FOLHAS, { recursive: true });
	const destino = path.join(PASTA_FOLHAS, `${nome}.png`);
	gravarPng(destino, { width, height, data });
	cache.delete(nome);
	return destino;
}

const cache = new Map();

/** Uma imagem de diorama/folhas pelo nome (`casa`, `castelo`, `folha_juncao`, `forma_equipe_32`), lida uma vez. */
export function lerImagem(nome) {
	let imagem = cache.get(nome);
	if (!imagem) {
		const caminho = path.join(PASTA_FOLHAS, `${nome}.png`);
		if (!fs.existsSync(caminho)) throw new Error(`a imagem ${nome}.png não existe em diorama/folhas (rode npm run diorama:folhas)`);
		imagem = lerPng(caminho);
		cache.set(nome, imagem);
	}
	return imagem;
}

/** A folha inteira do Aeko pelo nome, conferindo o tamanho. */
export function lerFolha(nome) {
	const folha = lerImagem(nome);
	if (folha.width !== COLUNAS * TILE || folha.height !== LINHAS * TILE) {
		throw new Error(`folha ${nome} com tamanho inesperado: ${folha.width}×${folha.height}`);
	}
	return folha;
}

/**
 * A cor de um recorte de 16 × 16 de uma cor só (0xRRGGBB), ou undefined quando ele tem mais de uma cor ou é
 * transparente. Todos os 256 pixels têm de ser iguais e opacos; o jogo estica o miolo de 8 × 8 desse recorte.
 */
export function corChapadaEm(nome, px, py) {
	const imagem = lerImagem(nome);
	if (px < 0 || py < 0 || px + TILE > imagem.width || py + TILE > imagem.height) return undefined;
	const [r, g, b, a] = pixel(imagem, px, py);
	if (a !== 255) return undefined;
	for (let y = 0; y < TILE; y++) {
		for (let x = 0; x < TILE; x++) {
			const p = pixel(imagem, px + x, py + y);
			if (p[0] !== r || p[1] !== g || p[2] !== b || p[3] !== a) return undefined;
		}
	}
	return (r << 16) | (g << 8) | b;
}

/** A cor de um tile de uma cor só de uma folha do Aeko (coluna 0 a 127, linha 0 a 31), ou undefined. */
export function corChapada(folha, col, row) {
	lerFolha(folha);
	return corChapadaEm(folha, col * TILE, row * TILE);
}
