// Cliente HTTP da ponte (tools/diorama_ponte.mjs). Uma função tipada por rota; todas devolvem um `Resultado`
// em vez de lançar erro (com o `status` HTTP quando a ponte respondeu com erro), e atualizam `ponteLigada` e
// `erroPonte` em `estado.ts`.
// Todas yieldam (RequestAsync): chamar de um `task.spawn`, nunca de dentro de um `effect` do Vide.
//
// As duas fontes do estado da conexão moram aqui (e `estado.ts` as reexporta) para `estado.ts` poder importar
// este módulo sem ciclo: o roblox-ts não aceita dois módulos que se requerem um ao outro.
import { HttpService } from "@rbxts/services";
import { source } from "@rbxts/vide";

/** A última chamada à ponte respondeu? Atualizado a cada pedido. */
export const ponteLigada = source(false);
/** Mensagem amigável do último erro de conexão (ou `undefined` quando a ponte respondeu). */
export const erroPonte = source<string | undefined>(undefined);

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
	/** Ids dos mapas que já têm módulo gerado (src/shared/interiors/index.ts). */
	gerados: string[];
}

export interface ResumoMapa {
	id: string;
	nome: string;
	blocos: Array<[number, number]>;
}

/** Uma célula pintada: [x, y, folha, coluna, linha]. */
export type Celula = [number, number, string, number, number];

/** Onde uma saída leva: o nome de uma entrada do destino, uma célula [x, y] de lá, ou nada (o nascimento). */
export type Chegada = string | [number, number];

export interface Saida {
	x: number;
	y: number;
	largura: number;
	altura: number;
	mapa: string;
	chegada?: Chegada;
}

/** Bloco no formato 1 (docs/diorama/GERADOR.md). Os campos opcionais são os que o autor pode não ter preenchido. */
export interface Bloco {
	versao: 1;
	mapa: string;
	bloco: [number, number];
	folhas: string[];
	vazio: [string, number, number];
	camadas: { chao?: Celula[]; objeto?: Celula[]; frente?: Celula[] };
	exterior?: {
		/** 64 linhas de 64 códigos ("." = nada) ou a lista de 64 × 64 códigos ("" = nada). */
		terreno?: string[];
		decalques?: Array<{ x: number; y: number; id: string }>;
		formas?: Array<{ x: number; y: number; painel: string; bx: number; by: number }>;
		/** Recortes crus guardados pelo importador quando a grade dupla não explicou o mapa. */
		runs_importados?: unknown;
		caixa_importada?: unknown;
	};
	bloqueios?: { mais?: Array<[number, number]>; menos?: Array<[number, number]> };
	acoes?: Array<[number, number, string]>;
	nascimento?: [number, number];
	entradas?: Array<{ nome: string; x: number; y: number }>;
	saidas?: Saida[];
	zonas?: Array<{ nome: string; areas: Array<[number, number, number, number]>; props?: Record<string, string> }>;
	moradores?: Array<{ nome: string; x: number; y: number; olhando: number; visual: string; pose?: string }>;
	carimbo?: string;
	carimbo_conteudo?: string;
	nota?: unknown;
	notas?: unknown;
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

/** Recorte de uma imagem: RGBA cru, 4 bytes por pixel, pronto para `EditableImage:WritePixelsBuffer`. */
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

/** O registro de assets (assets/registro.json, formato 1 de tools/assets.mjs) e os ids prontos para `Image`. */
export interface Assets<T = unknown> {
	/** O registro como veio do disco. */
	registro: T;
	/** Chave do registro → `rbxassetid://<id>`, só das entradas de `assets` que já têm id. */
	ids: Record<string, string>;
}

/** Os ids de cabeças e corpos de src/shared/graalData.ts. */
export interface IdsGraal {
	cabecas: string[];
	corpos: string[];
}

export interface Resposta {
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

/** Um pedido cru à ponte (o canal do Studio usa para o long-poll, que responde 204 quando não há comando). */
export function pedir(metodo: "GET" | "PUT" | "POST" | "DELETE", rota: string, corpo?: string): Resultado<Resposta> {
	// `X-Diorama: 1` em todo pedido que muda algo: a ponte pode recusar POST/PUT/DELETE sem ele (uma página aberta
	// no navegador não consegue mandar cabeçalho próprio sem o preflight do CORS, que a ponte não aceita).
	const cabecalhos: Record<string, string> = {};
	if (corpo !== undefined) cabecalhos["Content-Type"] = "application/json";
	if (metodo !== "GET") cabecalhos["X-Diorama"] = "1";
	const temCabecalho = corpo !== undefined || metodo !== "GET";
	const [ok, resposta] = pcall(() =>
		HttpService.RequestAsync({
			Url: BASE + rota,
			Method: metodo,
			Body: corpo,
			Headers: temCabecalho ? cabecalhos : undefined,
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

export function pedirJson<T>(metodo: "GET" | "PUT" | "POST" | "DELETE", rota: string, corpo?: unknown): Resultado<T> {
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

/** Um pedido de pixels crus: o corpo RGBA com `X-Largura` e `X-Altura`. */
function pedirRecorte(rota: string): Resultado<Recorte> {
	const r = pedir("GET", rota);
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

function buscaRetangulo(x?: number, y?: number, w?: number, h?: number): string {
	const partes = new Array<string>();
	if (x !== undefined) partes.push(`x=${x}`);
	if (y !== undefined) partes.push(`y=${y}`);
	if (w !== undefined) partes.push(`w=${w}`);
	if (h !== undefined) partes.push(`h=${h}`);
	return partes.size() > 0 ? `?${partes.join("&")}` : "";
}

// Rotas

export function status(): Resultado<Status> {
	const r = pedirJson<Status>("GET", "/status");
	if (r.ok && !typeIs(r.valor.gerados, "table")) r.valor.gerados = [];
	return r;
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

/** Apaga o mapa inteiro (a pasta diorama/mapas/<id>). O autoteste usa para o mapa temporário. */
export function apagarMapa(id: string): Resultado<{ ok: boolean; pasta: string }> {
	return pedirJson("DELETE", `/mapas/${id}`);
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
	return pedirRecorte(`/folhas/${nome}.rgba${buscaRetangulo(x, y, w, h)}`);
}

/**
 * Recorte de qualquer PNG de `assets/` ou `diorama/folhas/`: `caminho` é o caminho relativo à raiz do repositório
 * sem o `.png` (`assets/ui/atlas`, `diorama/folhas/casa`). Sem retângulo, a imagem inteira.
 */
export function lerImagem(caminho: string, x?: number, y?: number, w?: number, h?: number): Resultado<Recorte> {
	const semPng = caminho.gsub("\\", "/")[0].gsub("%.png$", "")[0];
	return pedirRecorte(`/imagens/${semPng}.rgba${buscaRetangulo(x, y, w, h)}`);
}

/** Roda `npm run diorama:jogo -- <id>` e devolve o log. Demora: chamar de um `task.spawn`. */
export function gerarMapa(id: string): Resultado<LogGerador> {
	return pedirJson<LogGerador>("POST", `/gerar/${id}`);
}

/** Roda `npm run diorama:jogo -- --decorar`. */
export function gerarDecorar(): Resultado<LogGerador> {
	return pedirJson<LogGerador>("POST", "/gerar/decorar");
}

function idTexto(v: unknown): string | undefined {
	if (typeIs(v, "number") && v > 0) return `rbxassetid://${v}`;
	if (typeIs(v, "string") && v !== "") return v.sub(1, 13) === "rbxassetid://" ? v : `rbxassetid://${v}`;
	return undefined;
}

/** O `assets/registro.json` como veio do disco, mais o mapa chave → `rbxassetid://` das entradas com id. */
export function lerAssets<T = unknown>(): Resultado<Assets<T>> {
	const r = pedirJson<T>("GET", "/assets");
	if (!r.ok) return r;
	const ids: Record<string, string> = {};
	const registro = r.valor as unknown as { assets?: Record<string, { id?: unknown }> } | undefined;
	if (typeIs(registro, "table") && typeIs(registro.assets, "table")) {
		for (const [chave, entrada] of pairs(registro.assets)) {
			const id = typeIs(entrada, "table") ? idTexto(entrada.id) : undefined;
			if (id !== undefined) ids[chave as string] = id;
		}
	}
	return { ok: true, valor: { registro: r.valor, ids } };
}

/** Grava `assets/enviadas.json` (`{ "<chave>": id }`) e roda `npm run assets -- --importar`. */
export function enviarAssets(enviadas: Record<string, number>): Resultado<LogGerador> {
	return pedirJson<LogGerador>("POST", "/assets/enviadas", enviadas);
}

/** Os ids de cabeças e corpos do Graal que o jogo conhece (src/shared/graalData.ts). */
export function lerIdsGraal(): Resultado<IdsGraal> {
	return pedirJson<IdsGraal>("GET", "/graal/ids");
}

/** Nomes (sem `.md`) dos documentos em docs/diorama. */
export function listarDocs(): Resultado<string[]> {
	return pedirJson<string[]>("GET", "/docs");
}

/** O texto de docs/diorama/<nome>.md. */
export function lerDoc(nome: string): Resultado<string> {
	return pedirTexto(`/docs/${nome}`);
}
