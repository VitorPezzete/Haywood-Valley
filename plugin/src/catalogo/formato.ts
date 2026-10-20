// O formato dos JSON do catálogo (diorama/catalogo/pecas.json, fundos.json, zonas.json) como o plugin o lê e
// grava. É o formato do gerador (docs/diorama/GERADOR.md, "Os catálogos"), o mesmo que tools/diorama_lib/
// catalogo.mjs, decorar.mjs e semear_catalogo.mjs usam: o que o plugin grava, o `npm run diorama:jogo -- --decorar`
// tem de ler e reproduzir src/shared/decorCatalog.ts sem mudar nada (plugin/teste/ciclos.mjs confere).
//
// A leitura é defensiva: campo que falta vira o padrão, entrada sem o mínimo (id e area) é descartada e contada em
// `descartadas`. O que o plugin não edita (movel, fixo, luz, noite e qualquer campo desconhecido) fica em `extras` e
// volta na gravação, na ordem de chaves em que veio (`ordem`), para o arquivo mudar só onde o autor mexeu.
//
// pecas.json
//   { "versao": 1, "nota": "...", "pecas": [ {
//       "id": "chair",                       // como o jogo cita: casa8, casa@56,25 ou o id do Decorar
//       "nome": "cadeira", "folha": "casa",
//       "area": [coluna, linha, largura, altura],   // em tiles de 16 px
//       "tipo": "movel",                     // movel, tapete, quadro, janela, cama, parede, bau, fogao, luz...
//       "camada": 1,                         // sugerida: 0 chão, 1 objeto, 2 frente
//       "bloqueia": true,                    // opcional
//       "acao": "3",                         // opcional: um código para a peça toda
//       "acoes": ["4444", "5555"],           // opcional: uma linha de códigos por linha da peça
//       "decorar": { "formas": [ { "olhando": 2, "variantes": [ {
//           "w": 2, "h": 2, "dx": 0, "dy": 0,
//           "fundos": ["xadrez_claro"],                                   // ids de fundos.json
//           "encaixe": { "tipo": "janela", "linha": 2, "papel": "azul" }, // opcional (12.12)
//           "celulas": [ { "dx": 0, "dy": 0, "coluna": 0, "linha": 20, "camada": 0,
//                          "exatos": [1575, 1702],                        // opcional: tiles linha × 128 + coluna
//                          "fundos": ["xadrez_claro"],                    // opcional
//                          "acao": "3", "bloqueia": false } ]
//       } ] } ] },
//       "movel": {...}, "fixo": {...}, "luz": {...}, "noite": {...},   // preservados
//       "nota": "..."
//   } ] }
//
// fundos.json
//   { "versao": 1, "nota": "...", "fundos": [ { "folha": "casa", "id": "papel_azul", "tiles": [3491, 3494] } ] }
//   `tiles` é linha × 128 + coluna (o formato de DECOR_BACKGROUNDS); a ordem da lista é a dos índices do Decorar.
//
// zonas.json
//   { "versao": 1, "vazio": [0, 2], "zonas": [[c0, l0, c1, l1, "animado"], ...],   // vale a primeira
//     "excecoes": [{ "folha": "castelo", "area": [c0, l0, c1, l1], "zona": "chao" }],   // antes das zonas
//     "bloqueiam": ["vazio", "bloqueia"], "acoes": { "senta": "3", "deita": "4" } }

export const TILE = 16;
export const COLUNAS = 128;
export const LINHAS = 32;
/** Colunas por metade da folha no Roblox (1024 px). */
export const COLUNAS_METADE = 64;
export const FOLHAS = ["casa", "castelo"] as const;
export type NomeFolha = (typeof FOLHAS)[number];

/** As camadas, pelo número que o catálogo guarda. */
export type Camada = 0 | 1 | 2;
export const CAMADAS: ReadonlyArray<Camada> = [0, 1, 2];
export const NOME_DA_CAMADA: Record<Camada, string> = { 0: "chão", 1: "objeto", 2: "frente" };

/** Tipos que o catálogo semeado usa; o campo é texto livre, estes são só as sugestões do formulário. */
export const TIPOS_SUGERIDOS = ["movel", "tapete", "quadro", "janela", "cama", "parede", "bau", "fogao", "luz", "piso", "fundo", "outro"] as const;
/** Tipos que só fazem sentido com fundo exigido: as peças de parede encaixam no papel (12.12, 12.14). */
export const TIPOS_QUE_PEDEM_FUNDO: ReadonlyArray<string> = ["quadro", "janela"];

/** Os códigos de ação do Graal que o jogo conhece: nada, senta, cama em cima, cama embaixo. */
export const ACOES = [".", "3", "4", "5"] as const;
export const NOME_DA_ACAO: Record<string, string> = { ".": "nenhuma", "3": "3 senta", "4": "4 cama cima", "5": "5 cama baixo" };

export const ENCAIXES = ["quadro", "janela"] as const;
export type TipoEncaixe = (typeof ENCAIXES)[number];
export const PAPEIS = ["azul", "amarelo"] as const;
export type Papel = (typeof PAPEIS)[number];

/** Retângulo em tiles: canto de cima à esquerda, largura e altura. */
export interface Retangulo {
	c: number;
	l: number;
	w: number;
	h: number;
}

export interface Encaixe {
	tipo: TipoEncaixe;
	linha: number;
	papel?: Papel;
}

/** Uma célula de uma variante do Decorar (um tile da folha num deslocamento da peça). */
export interface CelulaPeca {
	dx: number;
	dy: number;
	coluna: number;
	linha: number;
	camada: number;
	/** Tiles (linha × 128 + coluna) que entram embaixo sem costura; ausente = não confere; vazio = nunca bate. */
	exatos?: number[];
	/** Tipos de fundo aceitos com costura (ids de fundos.json); ausente = os da variante. */
	fundos?: string[];
	acao: string;
	bloqueia: boolean;
}

export interface VariantePeca {
	w: number;
	h: number;
	dx: number;
	dy: number;
	/** Ids de fundos.json. */
	fundos: string[];
	encaixe?: Encaixe;
	celulas: CelulaPeca[];
}

export interface FormaPeca {
	/** Para onde olha quem senta: 0 cima, 1 esquerda, 2 baixo, 3 direita. */
	olhando?: number;
	variantes: VariantePeca[];
}

export interface Peca {
	id: string;
	nome: string;
	folha: string;
	area: Retangulo;
	tipo: string;
	camada: Camada;
	/** Ausente no arquivo = `undefined`; o gerador não usa, o plugin mostra. */
	bloqueia?: boolean;
	/** Um código para a peça toda. */
	acao?: string;
	/** Uma linha de códigos por linha da peça. */
	acoes?: string[];
	decorar?: { formas: FormaPeca[] };
	nota?: string;
	/** Campos que o plugin não edita (movel, fixo, luz, noite...), preservados como vieram. */
	extras: Record<string, unknown>;
	/** A ordem das chaves do objeto no arquivo, para gravar igual. */
	ordem: string[];
}

export interface Fundo {
	folha: string;
	id: string;
	/** linha × 128 + coluna. */
	tiles: number[];
	extras: Record<string, unknown>;
	ordem: string[];
}

export interface Zona {
	c0: number;
	l0: number;
	c1: number;
	l1: number;
	zona: string;
}

export interface ExcecaoZona {
	folha: string;
	/** [c0, l0, c1, l1], inclusivo. */
	area: [number, number, number, number];
	zona: string;
	nota?: string;
}

export interface CatalogoZonas {
	vazio: [number, number];
	zonas: Zona[];
	excecoes: ExcecaoZona[];
	bloqueiam: string[];
	acoes: Record<string, string>;
}

export interface Catalogo<T> {
	itens: T[];
	/** Entradas que não deu para ler. */
	descartadas: number;
	/** Campos de cima do JSON que não são a lista (versao, nota...), preservados ao gravar. */
	extras: Record<string, unknown>;
	/** A ordem das chaves de cima, com a lista no lugar dela. */
	ordem: string[];
}

/** Cópia de zonas.json (ZONES de src/shared/interiorMap.ts), para quando a ponte não responde. */
export const ZONAS_PADRAO: CatalogoZonas = {
	vazio: [0, 2],
	zonas: [
		{ c0: 0, l0: 0, c1: 15, l1: 3, zona: "animado" },
		{ c0: 0, l0: 4, c1: 15, l1: 9, zona: "agua" },
		{ c0: 0, l0: 10, c1: 15, l1: 11, zona: "agua_rasa" },
		{ c0: 0, l0: 12, c1: 15, l1: 17, zona: "lava" },
		{ c0: 0, l0: 18, c1: 15, l1: 19, zona: "fere" },
		{ c0: 0, l0: 20, c1: 15, l1: 23, zona: "senta" },
		{ c0: 0, l0: 24, c1: 15, l1: 25, zona: "deita" },
		{ c0: 0, l0: 26, c1: 15, l1: 31, zona: "normal" },
		{ c0: 16, l0: 0, c1: 31, l1: 31, zona: "sem_pecas" },
		{ c0: 32, l0: 0, c1: 63, l1: 0, zona: "frente" },
		{ c0: 32, l0: 1, c1: 63, l1: 19, zona: "chao" },
		{ c0: 32, l0: 20, c1: 63, l1: 31, zona: "bloqueia" },
		{ c0: 64, l0: 16, c1: 127, l1: 31, zona: "bloqueia" },
		{ c0: 64, l0: 0, c1: 127, l1: 15, zona: "sem_pecas" },
	],
	excecoes: [
		{ folha: "castelo", area: [32, 0, 63, 0], zona: "chao" },
		{ folha: "castelo", area: [57, 20, 60, 23], zona: "normal" },
	],
	bloqueiam: ["vazio", "bloqueia", "animado", "sem_pecas"],
	acoes: { senta: "3", deita: "4" },
};

/** A cor de cada zona na sobreposição e na legenda. */
export const COR_DA_ZONA: Record<string, Color3> = {
	vazio: Color3.fromRGB(0, 0, 0),
	animado: Color3.fromRGB(255, 140, 0),
	agua: Color3.fromRGB(30, 90, 220),
	agua_rasa: Color3.fromRGB(80, 170, 255),
	lava: Color3.fromRGB(220, 40, 20),
	fere: Color3.fromRGB(180, 0, 120),
	senta: Color3.fromRGB(60, 200, 90),
	deita: Color3.fromRGB(150, 230, 120),
	normal: Color3.fromRGB(200, 200, 60),
	sem_pecas: Color3.fromRGB(120, 120, 120),
	frente: Color3.fromRGB(240, 120, 240),
	chao: Color3.fromRGB(230, 220, 160),
	bloqueia: Color3.fromRGB(230, 60, 60),
};

/** O que cada zona faz, para a legenda. */
export const DESCRICAO_DA_ZONA: Record<string, string> = {
	vazio: "o tile [0, 2], preto, fundo de tudo",
	animado: "4 quadros por coluna, um por linha",
	agua: "água funda (tipo 11), nada",
	agua_rasa: "água rasa (tipo 6), pés na água",
	lava: "lava",
	fere: "fere",
	senta: "assento (tipo 3)",
	deita: "cama em cima (tipo 4)",
	normal: "piso em que se pisa",
	sem_pecas: "sem peças",
	frente: "frente (casa); chão no castelo",
	chao: "piso em que se pisa e onde a peça pousa",
	bloqueia: "bloqueia o passo",
};

// Leitura defensiva

function ehTabela(v: unknown): v is Record<string, unknown> {
	return typeIs(v, "table");
}

function numero(v: unknown, padrao: number): number {
	return typeIs(v, "number") ? v : padrao;
}

function inteiro(v: unknown): number | undefined {
	if (!typeIs(v, "number")) return undefined;
	return math.floor(v);
}

function texto(v: unknown, padrao = ""): string {
	return typeIs(v, "string") ? v : padrao;
}

function listaDeTextos(v: unknown): string[] | undefined {
	if (!typeIs(v, "table")) return undefined;
	const saida = new Array<string>();
	for (const item of v as unknown[]) if (typeIs(item, "string")) saida.push(item);
	return saida;
}

function listaDeNumeros(v: unknown): number[] | undefined {
	if (!typeIs(v, "table")) return undefined;
	const saida = new Array<number>();
	for (const item of v as unknown[]) if (typeIs(item, "number")) saida.push(item);
	return saida;
}

/** As chaves do objeto na ordem em que vieram. No Luau o JSONDecode perde a ordem; no Node (harness) ela vale. */
function chavesDe(obj: Record<string, unknown>): string[] {
	const saida = new Array<string>();
	for (const [k] of pairs(obj)) saida.push(k as string);
	return saida;
}

/** `[c, l, w, h]` com números; largura e altura mínimas 1. */
export function lerArea(v: unknown): Retangulo | undefined {
	if (!typeIs(v, "table")) return undefined;
	const lista = v as unknown[];
	const c = inteiro(lista[0]);
	const l = inteiro(lista[1]);
	if (c === undefined || l === undefined) return undefined;
	const w = math.max(1, inteiro(lista[2]) ?? 1);
	const h = math.max(1, inteiro(lista[3]) ?? 1);
	return { c, l, w, h };
}

export function lerEncaixe(v: unknown): Encaixe | undefined {
	if (!ehTabela(v)) return undefined;
	if (!typeIs(v.tipo, "string") || !(ENCAIXES as ReadonlyArray<string>).includes(v.tipo)) return undefined;
	const papel = typeIs(v.papel, "string") && (PAPEIS as ReadonlyArray<string>).includes(v.papel) ? (v.papel as Papel) : undefined;
	return { tipo: v.tipo as TipoEncaixe, linha: numero(v.linha, 0), papel };
}

export function lerCelula(v: unknown): CelulaPeca | undefined {
	if (!ehTabela(v)) return undefined;
	const coluna = inteiro(v.coluna);
	const linha = inteiro(v.linha);
	if (coluna === undefined || linha === undefined) return undefined;
	return {
		dx: numero(v.dx, 0),
		dy: numero(v.dy, 0),
		coluna,
		linha,
		camada: numero(v.camada, 1),
		exatos: listaDeNumeros(v.exatos),
		fundos: listaDeTextos(v.fundos),
		acao: texto(v.acao, "."),
		bloqueia: v.bloqueia === true,
	};
}

export function lerVariante(v: unknown): VariantePeca | undefined {
	if (!ehTabela(v)) return undefined;
	const celulas = new Array<CelulaPeca>();
	if (typeIs(v.celulas, "table")) {
		for (const item of v.celulas as unknown[]) {
			const c = lerCelula(item);
			if (c) celulas.push(c);
		}
	}
	let w = numero(v.w, 0);
	let h = numero(v.h, 0);
	if (w === 0 || h === 0) {
		for (const c of celulas) {
			w = math.max(w, c.dx + 1);
			h = math.max(h, c.dy + 1);
		}
	}
	return {
		w: math.max(1, w),
		h: math.max(1, h),
		dx: numero(v.dx, 0),
		dy: numero(v.dy, 0),
		fundos: listaDeTextos(v.fundos) ?? [],
		encaixe: lerEncaixe(v.encaixe),
		celulas,
	};
}

export function lerForma(v: unknown): FormaPeca | undefined {
	if (!ehTabela(v)) return undefined;
	const variantes = new Array<VariantePeca>();
	if (typeIs(v.variantes, "table")) {
		for (const item of v.variantes as unknown[]) {
			const variante = lerVariante(item);
			if (variante) variantes.push(variante);
		}
	}
	const olhando = inteiro(v.olhando);
	return { olhando: olhando !== undefined && olhando >= 0 && olhando <= 3 ? olhando : undefined, variantes };
}

/** Os campos da peça que o plugin lê para os seus próprios; o resto é `extras`. */
const CAMPOS_PECA = new Set(["id", "nome", "folha", "area", "tipo", "camada", "bloqueia", "acao", "acoes", "decorar", "nota"]);

export function lerPeca(v: unknown): Peca | undefined {
	if (!ehTabela(v)) return undefined;
	const id = texto(v.id);
	const area = lerArea(v.area);
	if (id === "" || !area) return undefined;
	let decorar: Peca["decorar"];
	if (ehTabela(v.decorar) && typeIs(v.decorar.formas, "table")) {
		const formas = new Array<FormaPeca>();
		for (const item of v.decorar.formas as unknown[]) {
			const forma = lerForma(item);
			if (forma) formas.push(forma);
		}
		decorar = { formas };
	}
	const camada = inteiro(v.camada);
	const extras: Record<string, unknown> = {};
	for (const [k, valor] of pairs(v)) if (!CAMPOS_PECA.has(k as string)) extras[k as string] = valor;
	return {
		id,
		nome: texto(v.nome),
		folha: texto(v.folha, FOLHAS[0]),
		area,
		tipo: texto(v.tipo, "outro"),
		camada: camada !== undefined && camada >= 0 && camada <= 2 ? (camada as Camada) : 1,
		bloqueia: typeIs(v.bloqueia, "boolean") ? v.bloqueia : undefined,
		acao: typeIs(v.acao, "string") ? v.acao : undefined,
		acoes: listaDeTextos(v.acoes),
		decorar,
		nota: typeIs(v.nota, "string") ? v.nota : undefined,
		extras,
		ordem: chavesDe(v),
	};
}

const CAMPOS_FUNDO = new Set(["folha", "id", "tiles"]);

export function lerFundo(v: unknown): Fundo | undefined {
	if (!ehTabela(v)) return undefined;
	const id = texto(v.id);
	if (id === "") return undefined;
	const tiles = new Array<number>();
	if (typeIs(v.tiles, "table")) {
		for (const item of v.tiles as unknown[]) {
			if (typeIs(item, "number")) tiles.push(math.floor(item));
			else if (typeIs(item, "table")) {
				// Também aceita o par [coluna, linha]; grava sempre como número.
				const par = item as unknown[];
				const c = inteiro(par[0]);
				const l = inteiro(par[1]);
				if (c !== undefined && l !== undefined) tiles.push(l * COLUNAS + c);
			}
		}
	}
	const extras: Record<string, unknown> = {};
	for (const [k, valor] of pairs(v)) if (!CAMPOS_FUNDO.has(k as string)) extras[k as string] = valor;
	return { folha: texto(v.folha, FOLHAS[0]), id, tiles, extras, ordem: chavesDe(v) };
}

function lerZona(v: unknown): Zona | undefined {
	if (!typeIs(v, "table")) return undefined;
	const lista = v as unknown[];
	const c0 = inteiro(lista[0]);
	const l0 = inteiro(lista[1]);
	const c1 = inteiro(lista[2]);
	const l1 = inteiro(lista[3]);
	if (c0 === undefined || l0 === undefined || c1 === undefined || l1 === undefined || !typeIs(lista[4], "string")) return undefined;
	return { c0, l0, c1, l1, zona: lista[4] };
}

/** Lê zonas.json inteiro; o que faltar vem de ZONAS_PADRAO. */
export function lerZonas(bruto: unknown): CatalogoZonas {
	if (!ehTabela(bruto)) return ZONAS_PADRAO;
	const vazio = typeIs(bruto.vazio, "table") ? (bruto.vazio as unknown[]) : [];
	const zonas = new Array<Zona>();
	if (typeIs(bruto.zonas, "table")) {
		for (const item of bruto.zonas as unknown[]) {
			const z = lerZona(item);
			if (z) zonas.push(z);
		}
	}
	const excecoes = new Array<ExcecaoZona>();
	if (typeIs(bruto.excecoes, "table")) {
		for (const item of bruto.excecoes as unknown[]) {
			if (!ehTabela(item) || !typeIs(item.zona, "string") || !typeIs(item.area, "table")) continue;
			const a = item.area as unknown[];
			const c0 = inteiro(a[0]);
			const l0 = inteiro(a[1]);
			const c1 = inteiro(a[2]);
			const l1 = inteiro(a[3]);
			if (c0 === undefined || l0 === undefined || c1 === undefined || l1 === undefined) continue;
			excecoes.push({ folha: texto(item.folha, "*"), area: [c0, l0, c1, l1], zona: item.zona, nota: typeIs(item.nota, "string") ? item.nota : undefined });
		}
	}
	const acoes: Record<string, string> = {};
	if (ehTabela(bruto.acoes)) {
		for (const [k, valor] of pairs(bruto.acoes)) if (typeIs(valor, "string")) acoes[k as string] = valor;
	}
	return {
		vazio: [inteiro(vazio[0]) ?? 0, inteiro(vazio[1]) ?? 2],
		zonas: zonas.size() > 0 ? zonas : ZONAS_PADRAO.zonas,
		excecoes,
		bloqueiam: listaDeTextos(bruto.bloqueiam) ?? ZONAS_PADRAO.bloqueiam,
		acoes,
	};
}

/**
 * Lê o JSON de um catálogo: a lista fica em `chave` (`pecas`, `fundos`); um JSON que é só a lista também serve.
 * O que mais houver no objeto de cima é guardado em `extras` e volta na gravação.
 */
export function lerCatalogo<T extends defined>(bruto: unknown, chave: string, lerItem: (v: unknown) => T | undefined): Catalogo<T> {
	const itens = new Array<T>();
	let descartadas = 0;
	const extras: Record<string, unknown> = {};
	let ordem = new Array<string>();
	let lista: unknown[] = [];
	if (typeIs(bruto, "table")) {
		const obj = bruto as Record<string, unknown>;
		if (typeIs(obj[chave], "table")) {
			lista = obj[chave] as unknown[];
			for (const [k, v] of pairs(obj)) if (k !== chave) extras[k as string] = v;
			ordem = chavesDe(obj);
		} else if ((bruto as unknown[])[0] !== undefined) {
			lista = bruto as unknown[];
		}
	}
	for (const item of lista) {
		const lido = lerItem(item);
		if (lido) itens.push(lido);
		else descartadas++;
	}
	return { itens, descartadas, extras, ordem };
}

// Gravação

export function areaParaJson(r: Retangulo): number[] {
	return [r.c, r.l, r.w, r.h];
}

/** Monta um objeto com as chaves na ordem pedida (as que faltam na ordem vão para o fim, na ordem de `valores`). */
function ordenar(valores: Array<[string, unknown]>, ordem: string[]): Record<string, unknown> {
	const saida: Record<string, unknown> = {};
	const postos = new Set<string>();
	for (const chave of ordem) {
		const par = valores.find((v) => v[0] === chave);
		if (par && par[1] !== undefined) {
			saida[chave] = par[1];
			postos.add(chave);
		}
	}
	for (const [chave, valor] of valores) {
		if (!postos.has(chave) && valor !== undefined) saida[chave] = valor;
	}
	return saida;
}

export function encaixeParaJson(e: Encaixe): Record<string, unknown> {
	const saida: Record<string, unknown> = { tipo: e.tipo, linha: e.linha };
	if (e.papel !== undefined) saida.papel = e.papel;
	return saida;
}

export function celulaParaJson(c: CelulaPeca): Record<string, unknown> {
	const saida: Record<string, unknown> = { dx: c.dx, dy: c.dy, coluna: c.coluna, linha: c.linha, camada: c.camada };
	if (c.exatos !== undefined) saida.exatos = [...c.exatos];
	if (c.fundos !== undefined) saida.fundos = [...c.fundos];
	saida.acao = c.acao;
	saida.bloqueia = c.bloqueia;
	return saida;
}

export function varianteParaJson(v: VariantePeca): Record<string, unknown> {
	const saida: Record<string, unknown> = { w: v.w, h: v.h, dx: v.dx, dy: v.dy, fundos: [...v.fundos] };
	if (v.encaixe) saida.encaixe = encaixeParaJson(v.encaixe);
	saida.celulas = v.celulas.map(celulaParaJson);
	return saida;
}

export function formaParaJson(f: FormaPeca): Record<string, unknown> {
	const saida: Record<string, unknown> = {};
	if (f.olhando !== undefined) saida.olhando = f.olhando;
	saida.variantes = f.variantes.map(varianteParaJson);
	return saida;
}

/** A ordem padrão das chaves de uma peça nova (a de semear_catalogo.mjs). */
const ORDEM_PECA = ["id", "nome", "folha", "area", "tipo", "camada", "decorar", "acoes", "acao", "bloqueia"];

export function pecaParaJson(p: Peca): Record<string, unknown> {
	const valores: Array<[string, unknown]> = [
		["id", p.id],
		["nome", p.nome],
		["folha", p.folha],
		["area", areaParaJson(p.area)],
		["tipo", p.tipo],
		["camada", p.camada],
		["decorar", p.decorar ? { formas: p.decorar.formas.map(formaParaJson) } : undefined],
		["acoes", p.acoes ? [...p.acoes] : undefined],
		["acao", p.acao],
		["bloqueia", p.bloqueia],
	];
	for (const [k, v] of pairs(p.extras)) valores.push([k as string, v]);
	valores.push(["nota", p.nota !== undefined && p.nota !== "" ? p.nota : undefined]);
	return ordenar(valores, p.ordem.size() > 0 ? p.ordem : ORDEM_PECA);
}

export function fundoParaJson(f: Fundo): Record<string, unknown> {
	const valores: Array<[string, unknown]> = [
		["folha", f.folha],
		["id", f.id],
		["tiles", [...f.tiles]],
	];
	for (const [k, v] of pairs(f.extras)) valores.push([k as string, v]);
	return ordenar(valores, f.ordem.size() > 0 ? f.ordem : ["folha", "id", "tiles"]);
}

/** Monta o objeto de cima: `extras` (com `versao` 1 se faltar) e a lista em `chave`, na ordem em que vieram. */
export function catalogoParaJson(chave: string, lista: unknown[], extras: Record<string, unknown>, ordem: string[] = []): Record<string, unknown> {
	const valores: Array<[string, unknown]> = [["versao", extras.versao ?? 1]];
	for (const [k, v] of pairs(extras)) if (k !== "versao") valores.push([k as string, v]);
	valores.push([chave, lista]);
	return ordenar(valores, ordem.size() > 0 ? ordem : ["versao", "nota", chave]);
}

// As células em texto, para o editor mínimo de variantes

/**
 * Uma célula por linha: `dx dy coluna linha camada acao livre|bloqueia [exatos:1,2] [fundos:a,b]`.
 * `exatos:` sem nada depois é a lista vazia (uma exigência que nunca bate, que o catálogo semeado tem).
 */
export function textoDasCelulas(celulas: CelulaPeca[]): string {
	return celulas
		.map((c) => {
			const partes = [tostring(c.dx), tostring(c.dy), tostring(c.coluna), tostring(c.linha), tostring(c.camada), c.acao, c.bloqueia ? "bloqueia" : "livre"];
			if (c.exatos !== undefined) partes.push(`exatos:${c.exatos.map((n) => tostring(n)).join(",")}`);
			if (c.fundos !== undefined) partes.push(`fundos:${c.fundos.join(",")}`);
			return partes.join(" ");
		})
		.join("\n");
}

function separar(texto: string, separador: string): string[] {
	const saida = new Array<string>();
	let atual = "";
	for (let i = 0; i < texto.size(); i++) {
		const ch = texto.sub(i + 1, i + 1);
		if (ch === separador) {
			saida.push(atual);
			atual = "";
		} else atual += ch;
	}
	saida.push(atual);
	return saida;
}

/** Lê o texto de `textoDasCelulas`. Devolve as células e os erros (linha e motivo); linha vazia é ignorada. */
export function celulasDoTexto(texto: string): { celulas: CelulaPeca[]; erros: string[] } {
	const celulas = new Array<CelulaPeca>();
	const erros = new Array<string>();
	separar(texto, "\n").forEach((linhaCrua, n) => {
		const partes = separar(linhaCrua, " ").filter((p) => p !== "" && p !== "\r" && p !== "\t");
		if (partes.size() === 0) return;
		if (partes.size() < 7) {
			erros.push(`linha ${n + 1}: esperava "dx dy coluna linha camada acao livre|bloqueia"`);
			return;
		}
		const dx = tonumber(partes[0]);
		const dy = tonumber(partes[1]);
		const coluna = tonumber(partes[2]);
		const linha = tonumber(partes[3]);
		const camada = tonumber(partes[4]);
		if (dx === undefined || dy === undefined || coluna === undefined || linha === undefined || camada === undefined) {
			erros.push(`linha ${n + 1}: dx, dy, coluna, linha e camada são números`);
			return;
		}
		const bloqueia = partes[6] === "bloqueia" || partes[6] === "1" || partes[6] === "true";
		const celula: CelulaPeca = {
			dx: math.floor(dx),
			dy: math.floor(dy),
			coluna: math.floor(coluna),
			linha: math.floor(linha),
			camada: math.floor(camada),
			acao: partes[5],
			bloqueia,
		};
		for (let i = 7; i < partes.size(); i++) {
			const parte = partes[i];
			if (parte.sub(1, 7) === "exatos:") {
				const lista = parte.sub(8);
				celula.exatos = lista === "" ? [] : separar(lista, ",").map((t) => math.floor(tonumber(t) ?? -1)).filter((v) => v >= 0);
			} else if (parte.sub(1, 7) === "fundos:") {
				const lista = parte.sub(8);
				celula.fundos = lista === "" ? [] : separar(lista, ",").filter((t) => t !== "");
			} else {
				erros.push(`linha ${n + 1}: "${parte}" não é exatos:... nem fundos:...`);
			}
		}
		celulas.push(celula);
	});
	return { celulas, erros };
}

// Consultas

/** A zona do tile como `tileZone` de interiorMap.ts: o vazio, as exceções da folha, as zonas (vale a primeira), senão `chao`. */
export function zonaDoTile(zonas: CatalogoZonas, folha: string, c: number, l: number): string {
	if (c === zonas.vazio[0] && l === zonas.vazio[1]) return "vazio";
	for (const e of zonas.excecoes) {
		if ((e.folha === "*" || e.folha === folha) && c >= e.area[0] && c <= e.area[2] && l >= e.area[1] && l <= e.area[3]) return e.zona;
	}
	for (const z of zonas.zonas) {
		if (c >= z.c0 && c <= z.c1 && l >= z.l0 && l <= z.l1) return z.zona;
	}
	return "chao";
}

export function dentroDaFolha(r: Retangulo): boolean {
	return r.c >= 0 && r.l >= 0 && r.c + r.w <= COLUNAS && r.l + r.h <= LINHAS;
}

export function contem(r: Retangulo, c: number, l: number): boolean {
	return c >= r.c && c < r.c + r.w && l >= r.l && l < r.l + r.h;
}

export function retanguloTexto(r: Retangulo): string {
	return `[${r.c}, ${r.l}] ${r.w}×${r.h}`;
}

/** Tile de fundo (linha × 128 + coluna) para coluna e linha, e a volta. */
export function tileNumero(c: number, l: number): number {
	return l * COLUNAS + c;
}

export function tileColunaLinha(n: number): [number, number] {
	return [n % COLUNAS, math.floor(n / COLUNAS)];
}

/** O id que o jogo cita para uma região sem id próprio: `<folha>@<coluna>,<linha>`. */
export function idPadrao(folha: string, r: Retangulo): string {
	return `${folha}@${r.c},${r.l}`;
}

export function novaPeca(folha: string, r: Retangulo): Peca {
	return { id: idPadrao(folha, r), nome: "", folha, area: r, tipo: "outro", camada: 1, extras: {}, ordem: [] };
}

export function novoFundo(folha: string): Fundo {
	return { folha, id: "", tiles: [], extras: {}, ordem: [] };
}

/** Uma variante nova com uma célula por tile da área da peça (camada, ação e bloqueio da peça). */
export function varianteDaArea(p: Peca): VariantePeca {
	const celulas = new Array<CelulaPeca>();
	for (let j = 0; j < p.area.h; j++) {
		for (let i = 0; i < p.area.w; i++) {
			const linha = p.acoes?.[j];
			const codigo = linha !== undefined && linha.size() > i ? linha.sub(i + 1, i + 1) : (p.acao ?? ".");
			celulas.push({ dx: i, dy: j, coluna: p.area.c + i, linha: p.area.l + j, camada: p.camada, acao: codigo, bloqueia: p.bloqueia === true });
		}
	}
	return { w: p.area.w, h: p.area.h, dx: 0, dy: 0, fundos: [], celulas };
}

/** Cópia profunda de uma peça (para duplicar). */
export function copiarPeca(p: Peca): Peca {
	const copia = lerPeca(pecaParaJson(p));
	return copia ?? novaPeca(p.folha, { ...p.area });
}
