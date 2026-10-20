// Cliente HTTP da ponte (tools/diorama_ponte.mjs). Uma função tipada por rota; todas devolvem um `Resultado`
// em vez de lançar erro, e atualizam `ponteLigada` e `erroPonte` em `estado.ts`.
// Todas yieldam (RequestAsync): chamar de um `task.spawn`, nunca de dentro de um `effect` do Vide.
import { HttpService } from "@rbxts/services";
import { erroPonte, ponteLigada } from "./estado";

export const PORTA = 34873;
export const BASE = `http://127.0.0.1:${PORTA}`;
/** Como subir a ponte, para as mensagens de erro. */
export const COMO_LIGAR = "Rode `npm run diorama:ponte` na pasta do repositório.";

export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string; status?: number };

// Formatos das respostas, espelhando docs/diorama/PONTE.md.

export interface Status {
	versao: string;
	raiz: string;
	pastas: Record<string, { caminho: string; existe: boolean }>;
	rojo: { ligado: boolean; porta: number; projeto?: string };
	mapas: number;
	folhas: number;
}

export interface ResumoMapa {
	id: string;
	nome: string;
	blocos: Array<[number, number]>;
}

/** Uma célula pintada: [x, y, folha, coluna, linha]. */
export type Celula = [number, number, string, number, number];

/** Bloco no formato 1 (docs/diorama/ARQUITETURA.md). Os campos opcionais são os que o autor pode não ter preenchido. */
export interface Bloco {
	versao: 1;
	mapa: string;
	bloco: [number, number];
	folhas: string[];
	vazio: [string, number, number];
	camadas: { chao?: Celula[]; objeto?: Celula[]; frente?: Celula[] };
	exterior?: { terreno: string[]; decalques: Array<{ x: number; y: number; id: string }> };
	bloqueios?: { mais?: Array<[number, number]>; menos?: Array<[number, number]> };
	nascimento?: [number, number];
	entradas?: Array<{ nome: string; x: number; y: number }>;
	saidas?: Array<{ x: number; y: number; largura: number; altura: number; mapa: string; chegada?: unknown }>;
	zonas?: Array<{ nome: string; areas: Array<[number, number, number, number]>; props?: Record<string, string> }>;
	moradores?: Array<{ nome: string; x: number; y: number; olhando: number; visual: string; pose?: string }>;
	carimbo?: string;
}

export interface Mapa {
	id: string;
	/** O mapa.json, ou `undefined` se o mapa ainda não tem um. */
	mapa?: { versao?: number; id?: string; nome?: string; blocos?: Array<[number, number]> };
	blocos: Array<{ bloco: [number, number]; arquivo: string; conteudo: Bloco }>;
}

export interface Folha {
	nome: string;
	largura: number;
	altura: number;
}

/** Recorte de uma folha: RGBA cru, 4 bytes por pixel, pronto para `EditableImage:WritePixelsBuffer`. */
export interface Recorte {
	largura: number;
	altura: number;
	pixels: buffer;
}

/** O que volta de um gerador ou do importador de assets. */
export interface LogGerador {
	ok: boolean;
	codigo?: number;
	log: string;
}

interface Resposta {
	status: number;
	corpo: string;
	cabecalhos: Record<string, string>;
}

/** Traduz o erro do RequestAsync para uma frase que diz o que fazer. */
function mensagemAmigavel(erro: string): string {
	if (erro.find("HttpError", 1, true)[0] !== undefined || erro.find("Connect", 1, true)[0] !== undefined) {
		return `A ponte não respondeu em ${BASE}. ${COMO_LIGAR}`;
	}
	if (erro.find("not enabled", 1, true)[0] !== undefined || erro.find("not allowed", 1, true)[0] !== undefined) {
		return `O Studio não deixou o plugin chamar ${BASE}. Aceite o pedido de permissão de HTTP do plugin Diorama.`;
	}
	return `Erro ao falar com a ponte: ${erro}`;
}

function pedir(metodo: "GET" | "PUT" | "POST" | "DELETE", rota: string, corpo?: string): Resultado<Resposta> {
	const [ok, resposta] = pcall(() =>
		HttpService.RequestAsync({
			Url: BASE + rota,
			Method: metodo,
			Body: corpo,
			Headers: corpo !== undefined ? { "Content-Type": "application/json" } : undefined,
		}),
	);
	if (!ok) {
		const erro = mensagemAmigavel(tostring(resposta));
		ponteLigada(false);
		erroPonte(erro);
		return { ok: false, erro };
	}
	ponteLigada(true);
	erroPonte(undefined);
	const r = resposta as RequestAsyncResponse;
	if (!r.Success) {
		// A ponte responde erros como { "erro": "..." }.
		let erro = `${r.StatusCode} ${r.StatusMessage}`;
		const [decodificou, json] = pcall(() => HttpService.JSONDecode(r.Body) as { erro?: string });
		if (decodificou && typeIs(json, "table") && json.erro !== undefined) erro = json.erro;
		return { ok: false, erro, status: r.StatusCode };
	}
	return { ok: true, valor: { status: r.StatusCode, corpo: r.Body, cabecalhos: r.Headers } };
}

function pedirJson<T>(metodo: "GET" | "PUT" | "POST" | "DELETE", rota: string, corpo?: unknown): Resultado<T> {
	const texto = corpo !== undefined ? HttpService.JSONEncode(corpo) : undefined;
	const r = pedir(metodo, rota, texto);
	if (!r.ok) return r;
	const [decodificou, valor] = pcall(() => HttpService.JSONDecode(r.valor.corpo) as T);
	if (!decodificou) return { ok: false, erro: `resposta da ponte não é JSON: ${tostring(valor)}` };
	return { ok: true, valor: valor as T };
}

function pedirTexto(rota: string): Resultado<string> {
	const r = pedir("GET", rota);
	return r.ok ? { ok: true, valor: r.valor.corpo } : r;
}

// Rotas

export function status(): Resultado<Status> {
	return pedirJson<Status>("GET", "/status");
}

export function listarMapas(): Resultado<ResumoMapa[]> {
	return pedirJson<ResumoMapa[]>("GET", "/mapas");
}

export function lerMapa(id: string): Resultado<Mapa> {
	return pedirJson<Mapa>("GET", `/mapas/${id}`);
}

export function gravarBloco(id: string, bx: number, by: number, bloco: Bloco): Resultado<{ ok: boolean; arquivo: string }> {
	return pedirJson("PUT", `/mapas/${id}/blocos/${bx}_${by}`, bloco);
}

export function apagarBloco(id: string, bx: number, by: number): Resultado<{ ok: boolean; arquivo: string }> {
	return pedirJson("DELETE", `/mapas/${id}/blocos/${bx}_${by}`);
}

export function lerCatalogo<T = unknown>(nome: string): Resultado<T> {
	return pedirJson<T>("GET", `/catalogo/${nome}`);
}

export function gravarCatalogo(nome: string, conteudo: unknown): Resultado<{ ok: boolean; arquivo: string }> {
	return pedirJson("PUT", `/catalogo/${nome}`, conteudo);
}

export function listarFolhas(): Resultado<Folha[]> {
	return pedirJson<Folha[]>("GET", "/folhas");
}

/** Recorte de `diorama/folhas/<nome>.png`. Sem retângulo, vem a folha inteira (2048×512×4 = 4 MB). */
export function lerFolha(nome: string, x?: number, y?: number, w?: number, h?: number): Resultado<Recorte> {
	const partes = new Array<string>();
	if (x !== undefined) partes.push(`x=${x}`);
	if (y !== undefined) partes.push(`y=${y}`);
	if (w !== undefined) partes.push(`w=${w}`);
	if (h !== undefined) partes.push(`h=${h}`);
	const busca = partes.size() > 0 ? `?${partes.join("&")}` : "";
	const r = pedir("GET", `/folhas/${nome}.rgba${busca}`);
	if (!r.ok) return r;
	const largura = tonumber(r.valor.cabecalhos["X-Largura"] ?? r.valor.cabecalhos["x-largura"]);
	const altura = tonumber(r.valor.cabecalhos["X-Altura"] ?? r.valor.cabecalhos["x-altura"]);
	if (largura === undefined || altura === undefined) {
		return { ok: false, erro: "a ponte não mandou X-Largura e X-Altura" };
	}
	if (r.valor.corpo.size() !== largura * altura * 4) {
		return { ok: false, erro: `recorte com ${r.valor.corpo.size()} bytes; esperava ${largura * altura * 4}` };
	}
	return { ok: true, valor: { largura, altura, pixels: buffer.fromstring(r.valor.corpo) } };
}

/** Roda `npm run diorama:jogo -- <id>` e devolve o log. Demora: chamar de um `task.spawn`. */
export function gerarMapa(id: string): Resultado<LogGerador> {
	return pedirJson<LogGerador>("POST", `/gerar/${id}`);
}

/** Roda `npm run diorama:jogo -- --decorar`. */
export function gerarDecorar(): Resultado<LogGerador> {
	return pedirJson<LogGerador>("POST", "/gerar/decorar");
}

/** O `assets/registro.json` como veio do disco. */
export function lerAssets<T = unknown>(): Resultado<T> {
	return pedirJson<T>("GET", "/assets");
}

/** Grava `assets/enviadas.json` e roda `npm run assets -- --importar`. */
export function enviarAssets(enviadas: unknown): Resultado<LogGerador> {
	return pedirJson<LogGerador>("POST", "/assets/enviadas", enviadas);
}

/** Nomes (sem `.md`) dos documentos em docs/diorama. */
export function listarDocs(): Resultado<string[]> {
	return pedirJson<string[]>("GET", "/docs");
}

/** O texto de docs/diorama/<nome>.md. */
export function lerDoc(nome: string): Resultado<string> {
	return pedirTexto(`/docs/${nome}`);
}
