// O formato de um problema apontado pelo diagnóstico (ferramenta Problemas). Cada verificação devolve uma lista
// destes; o painel os mostra com a etiqueta da gravidade, onde, o quê e como corrigir.

export type Gravidade = "erro" | "aviso" | "info";

export type Grupo = "ponte" | "mapas" | "catalogo" | "assets" | "place";

export interface Problema {
	gravidade: Gravidade;
	grupo: Grupo;
	/** Onde: "mapa casa_teste_v2_l, bloco 0_0, saída 2", "assets/registro.json: ui.painel", "ServerScriptService"… */
	onde: string;
	/** O que está errado. */
	oQue: string;
	/** O que fazer. */
	comoCorrigir: string;
}

export const TITULO_DO_GRUPO: Record<Grupo, string> = {
	ponte: "Ponte",
	mapas: "Mapas",
	catalogo: "Catálogo",
	assets: "Assets",
	place: "Place",
};

/** Ordem de gravidade para ordenar a lista: erro primeiro. */
export const PESO_DA_GRAVIDADE: Record<Gravidade, number> = { erro: 0, aviso: 1, info: 2 };

/** Lado do bloco em células; coordenadas válidas vão de 0 a 63. */
export const LADO_DO_BLOCO = 64;
/** Colunas e linhas de uma folha do Aeko (tiles de 16 px numa imagem de 2048 × 512). */
export const COLUNAS_DA_FOLHA = 128;
export const LINHAS_DA_FOLHA = 32;
/** Folhas que o jogo conhece hoje (INTERIOR_SHEETS), para quando a ponte não lista as folhas. */
export const FOLHAS_DO_JOGO = ["casa", "castelo"];

export function dentroDoBloco(x: unknown, y: unknown): boolean {
	return (
		typeIs(x, "number") && typeIs(y, "number") && x >= 0 && y >= 0 && x < LADO_DO_BLOCO && y < LADO_DO_BLOCO && x === math.floor(x) && y === math.floor(y)
	);
}

export function tileDentroDaFolha(coluna: unknown, linha: unknown): boolean {
	return (
		typeIs(coluna, "number") &&
		typeIs(linha, "number") &&
		coluna >= 0 &&
		linha >= 0 &&
		coluna < COLUNAS_DA_FOLHA &&
		linha < LINHAS_DA_FOLHA &&
		coluna === math.floor(coluna) &&
		linha === math.floor(linha)
	);
}

/** Id de mapa e nome de catálogo: letras minúsculas, números e _. */
export function idValido(id: unknown): id is string {
	return typeIs(id, "string") && id !== "" && id.match("^[a-z0-9_]+$")[0] !== undefined;
}

/** Nome de entrada: letras minúsculas, números, - e _. */
export function nomeDeEntradaValido(nome: unknown): nome is string {
	return typeIs(nome, "string") && nome !== "" && nome.match("^[a-z0-9_%-]+$")[0] !== undefined;
}
