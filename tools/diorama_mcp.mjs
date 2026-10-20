#!/usr/bin/env node
// MCP do Diorama: servidor MCP (stdio) que dá ao Claude Code as rotas da ponte do Diorama.
// A ponte (tools/diorama_ponte.mjs, http://127.0.0.1:34873) é o centro: este servidor só fala HTTP com ela, e ela
// fala com o disco do repositório, com cada Studio aberto (plugin Diorama) e com o Aseprite (extensão Lua).
// Contrato em docs/diorama/CONEXOES.md (seção 6); uso em docs/diorama/MCP.md.
//
// Uso: o Claude Code sobe este processo sozinho pela entrada "diorama" do .mcp.json. À mão:
//   node tools/diorama_mcp.mjs            (fala MCP por stdin/stdout; DIORAMA_PONTE muda o endereço da ponte)
//
// stdout é o canal do MCP: nada aqui pode escrever nele. Mensagens de diagnóstico vão para stderr.

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const VERSAO = "0.2.0";
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARQUIVO_PONTE = path.join(RAIZ, "tools", "diorama_ponte.mjs");
const PONTE = (process.env.DIORAMA_PONTE ?? "http://127.0.0.1:34873").replace(/\/+$/, "");

/** Acima disto o JSON da resposta é cortado (com aviso). */
const LIMITE_TEXTO = 20_000;
/** Quanto esperar a ponte subir depois de lançá-la. */
const ESPERA_PONTE_MS = 5_000;
/** Tempo de um pedido comum à ponte. */
const TEMPO_PEDIDO_MS = 15_000;
/** Os geradores da ponte param em 120 s; damos uma folga. */
const TEMPO_GERADOR_MS = 135_000;
/** Espera padrão pela resposta de um comando ao Studio, e a do autoteste. */
const ESPERA_STUDIO_S = 60;
const ESPERA_AUTOTESTE_S = 120;

const log = (...partes) => console.error("[diorama-mcp]", ...partes);

// ---------------------------------------------------------------------------------------------------------------
// Erros com a dica do que ligar

class ErroPonte extends Error {
	/** @param {string} mensagem @param {{ status?: number, dados?: unknown }} [extra] */
	constructor(mensagem, extra = {}) {
		super(mensagem);
		this.status = extra.status;
		this.dados = extra.dados;
	}
}

const DICA_PONTE = "Ligue a ponte com `npm run diorama:ponte` na raiz do repositório e veja o erro no terminal.";
const DICA_STUDIO =
	"Abra o Studio com o plugin Diorama instalado (npm run plugin:build) e confira se ele aparece em studio_sessoes.";
const DICA_ASEPRITE =
	"Abra o Aseprite com a extensão Diorama (aseprite/diorama, instalada em %APPDATA%\\Aseprite\\extensions\\diorama); ela reconecta sozinha a cada 3 s. Confira com aseprite_estado.";

function erroRotaFaltando(metodo, caminho) {
	return new ErroPonte(
		`A ponte ainda não tem esta rota (${metodo} ${caminho}): atualize. A ponte em execução é anterior às rotas de docs/diorama/CONEXOES.md; feche a ponte que está rodando (o processo node de tools/diorama_ponte.mjs na porta 34873) e suba de novo com \`npm run diorama:ponte\`, ou chame qualquer ferramenta deste MCP com ela fechada para ele subir a versão do disco.`,
		{ status: 404 },
	);
}

// ---------------------------------------------------------------------------------------------------------------
// Ponte: subir se preciso e pedir

let avisoPonte = ""; // vai no próximo resultado: "subi a ponte"
let subindo = null; // promessa compartilhada enquanto a ponte está subindo

async function ponteResponde(tempoMs = 1_500) {
	try {
		const resposta = await fetch(`${PONTE}/status`, { signal: AbortSignal.timeout(tempoMs) });
		return resposta.ok;
	} catch {
		return false;
	}
}

/** Confere /status; se não responde, lança a ponte destacada (continua depois deste processo) e espera até 5 s. */
function garantirPonte() {
	subindo ??= (async () => {
		if (await ponteResponde()) return true;
		const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(PONTE);
		if (!local) return false;
		const porta = new URL(PONTE).port || "80";
		log(`a ponte não respondeu em ${PONTE}; subindo ${ARQUIVO_PONTE}`);
		try {
			const filho = spawn(process.execPath, [ARQUIVO_PONTE, "--porta", porta], {
				cwd: RAIZ,
				detached: true,
				stdio: "ignore",
				windowsHide: true,
			});
			filho.on("error", (erro) => log("não deu para subir a ponte:", erro.message));
			filho.unref();
		} catch (erro) {
			log("não deu para subir a ponte:", erro.message);
			return false;
		}
		const limite = Date.now() + ESPERA_PONTE_MS;
		while (Date.now() < limite) {
			await new Promise((r) => setTimeout(r, 250));
			if (await ponteResponde(1_000)) {
				avisoPonte = `A ponte não estava no ar; subi-a em segundo plano (${PONTE}, processo separado que continua depois desta sessão).`;
				log("ponte no ar");
				return true;
			}
		}
		log("a ponte não respondeu em 5 s depois de lançada");
		return false;
	})().finally(() => {
		subindo = null;
	});
	return subindo;
}

const causaDoErro = (erro) => erro?.cause?.code ?? erro?.code;
/** A conexão nem abriu: a ponte não está no ar. Repetir é seguro para qualquer método. */
const naoConectou = (erro) => ["ECONNREFUSED", "ECONNABORTED", "EADDRNOTAVAIL"].includes(causaDoErro(erro));
/** A conexão abriu e caiu (a ponte fechou no meio): o pedido pode ou não ter sido feito. */
const caiuNoMeio = (erro) =>
	["ECONNRESET", "UND_ERR_SOCKET", "EPIPE", "UND_ERR_CLOSED"].includes(causaDoErro(erro)) || erro?.name === "TypeError";

/**
 * Um pedido à ponte. Devolve { status, dados } (dados: JSON lido, ou o texto se não for JSON).
 * Se a ponte não está no ar, tenta subi-la uma vez e repete. Se a conexão cai no meio, só repete GET: um POST ou PUT
 * repetido poderia rodar duas vezes (um gerador, um comando ao Studio). 404 de "rota desconhecida" vira a mensagem
 * de atualizar. Todo pedido leva `X-Diorama: 1`, que a ponte exige em POST/PUT/DELETE.
 * @param {string} metodo @param {string} caminho @param {{ corpo?: unknown, tempoMs?: number, aceitar?: number[] }} [opcoes]
 */
async function pedir(metodo, caminho, opcoes = {}) {
	const { corpo, tempoMs = TEMPO_PEDIDO_MS, aceitar = [] } = opcoes;
	const fazer = () =>
		fetch(PONTE + caminho, {
			method: metodo,
			headers: { "X-Diorama": "1", ...(corpo === undefined ? {} : { "Content-Type": "application/json; charset=utf-8" }) },
			body: corpo === undefined ? undefined : JSON.stringify(corpo),
			signal: AbortSignal.timeout(tempoMs),
		});
	const tempoEsgotado = () => new ErroPonte(`A ponte não respondeu a ${metodo} ${caminho} em ${Math.round(tempoMs / 1000)} s.`);
	let resposta;
	try {
		resposta = await fazer();
	} catch (erro) {
		if (erro?.name === "TimeoutError") throw tempoEsgotado();
		if (!naoConectou(erro)) {
			if (!caiuNoMeio(erro)) throw erro;
			if (metodo !== "GET") {
				throw new ErroPonte(
					`A conexão com a ponte caiu no meio de ${metodo} ${caminho}: não dá para saber se o pedido foi feito. Confira o resultado (ponte_status, mapa_ler, eventos) antes de repetir. ${DICA_PONTE}`,
				);
			}
		}
		const noAr = await garantirPonte();
		if (!noAr) {
			throw new ErroPonte(`A ponte não responde em ${PONTE} e não consegui subi-la em 5 s. ${DICA_PONTE}`);
		}
		try {
			resposta = await fazer();
		} catch (erro2) {
			if (erro2?.name === "TimeoutError") throw tempoEsgotado();
			throw new ErroPonte(`A ponte subiu mas ${metodo} ${caminho} falhou: ${erro2?.cause?.message ?? erro2?.message}. ${DICA_PONTE}`);
		}
	}
	let texto;
	try {
		texto = await resposta.text();
	} catch (erro) {
		if (erro?.name === "TimeoutError") throw tempoEsgotado();
		throw new ErroPonte(`A conexão com a ponte caiu enquanto a resposta de ${metodo} ${caminho} chegava (${erro?.message}). ${DICA_PONTE}`);
	}
	let dados = texto;
	if (texto !== "") {
		try {
			dados = JSON.parse(texto);
		} catch {
			dados = texto;
		}
	} else {
		dados = null;
	}
	const status = resposta.status;
	if ((status >= 200 && status < 300) || aceitar.includes(status)) return { status, dados };
	const mensagem = typeof dados === "object" && dados !== null && "erro" in dados ? String(dados.erro) : texto;
	if (status === 404 && /^rota desconhecida/.test(mensagem)) throw erroRotaFaltando(metodo, caminho.split("?")[0]);
	if (status === 403) {
		throw new ErroPonte(
			`A ponte recusou ${metodo} ${caminho}: ${mensagem}. A ponte só aceita pedidos locais sem Origin de página web e com o cabeçalho X-Diorama: 1 (docs/diorama/PONTE.md); se DIORAMA_PONTE aponta para outro endereço, confira.`,
			{ status, dados },
		);
	}
	throw new ErroPonte(`A ponte respondeu ${status} a ${metodo} ${caminho}: ${mensagem}`, { status, dados });
}

// ---------------------------------------------------------------------------------------------------------------
// Resultado das ferramentas: texto curto + JSON indentado (cortado acima de ~20 mil caracteres)

/** JSON indentado, mas com listas só de valores simples numa linha (as células [x, y, folha, coluna, linha]). */
function jsonLegivel(valor, recuo = "") {
	if (Array.isArray(valor)) {
		if (valor.length === 0) return "[]";
		if (valor.every((v) => v === null || typeof v !== "object")) return `[${valor.map((v) => JSON.stringify(v) ?? "null").join(", ")}]`;
		const dentro = recuo + "  ";
		return `[\n${valor.map((v) => dentro + jsonLegivel(v, dentro)).join(",\n")}\n${recuo}]`;
	}
	if (valor && typeof valor === "object") {
		const entradas = Object.entries(valor).filter(([, v]) => v !== undefined);
		if (entradas.length === 0) return "{}";
		const dentro = recuo + "  ";
		return `{\n${entradas.map(([k, v]) => `${dentro}${JSON.stringify(k)}: ${jsonLegivel(v, dentro)}`).join(",\n")}\n${recuo}}`;
	}
	return JSON.stringify(valor) ?? "null";
}

function jsonCortado(valor, dicaCorte) {
	let texto = typeof valor === "string" ? valor : jsonLegivel(valor);
	if (texto === undefined) texto = "null";
	if (texto.length <= LIMITE_TEXTO) return texto;
	const aviso =
		`[cortado: a resposta tem ${texto.length} caracteres e só vão os primeiros ${LIMITE_TEXTO}.` +
		(dicaCorte ? ` ${dicaCorte}` : "") +
		"]";
	return `${aviso}\n${texto.slice(0, LIMITE_TEXTO)}\n${aviso}`;
}

function resultado(resumo, valor, dicaCorte) {
	const partes = [];
	if (avisoPonte) {
		partes.push(avisoPonte);
		avisoPonte = "";
	}
	partes.push(resumo);
	if (valor !== undefined) partes.push(jsonCortado(valor, dicaCorte));
	return { content: [{ type: "text", text: partes.join("\n\n") }] };
}

function falha(mensagem, dados) {
	const r = resultado(mensagem, dados);
	return { ...r, isError: true };
}

/** Envolve a função da ferramenta: ErroPonte e erros inesperados viram resultado com isError. */
function ferramenta(fn) {
	return async (args) => {
		try {
			return await fn(args ?? {});
		} catch (erro) {
			if (erro instanceof ErroPonte) return falha(erro.message, erro.dados);
			log("erro inesperado:", erro);
			return falha(`Erro inesperado no MCP do Diorama: ${erro?.message ?? erro}`);
		}
	};
}

// ---------------------------------------------------------------------------------------------------------------
// Validação mínima do bloco (formato 1, docs/diorama/GERADOR.md), igual à da ponte, para errar antes de mandar

const CAMADAS = ["chao", "objeto", "frente"];
const ID_MAPA = /^[a-z0-9_]+$/;

function validarBloco(bloco, id, [bx, by]) {
	const problemas = [];
	if (typeof bloco !== "object" || bloco === null || Array.isArray(bloco)) return ["o bloco precisa ser um objeto"];
	if (bloco.versao !== 1) problemas.push(`versao precisa ser 1 (veio ${JSON.stringify(bloco.versao)})`);
	if (bloco.mapa !== id) problemas.push(`mapa precisa ser "${id}" (veio ${JSON.stringify(bloco.mapa)})`);
	if (!Array.isArray(bloco.bloco) || bloco.bloco[0] !== bx || bloco.bloco[1] !== by) {
		problemas.push(`bloco precisa ser [${bx}, ${by}] (veio ${JSON.stringify(bloco.bloco)})`);
	}
	if (!Array.isArray(bloco.folhas) || !bloco.folhas.every((f) => typeof f === "string")) {
		problemas.push("folhas precisa ser uma lista de nomes");
	}
	const vazio = bloco.vazio;
	if (
		!Array.isArray(vazio) ||
		vazio.length !== 3 ||
		typeof vazio[0] !== "string" ||
		!Number.isInteger(vazio[1]) ||
		!Number.isInteger(vazio[2])
	) {
		problemas.push("vazio precisa ser [folha, coluna, linha]");
	}
	if (typeof bloco.camadas !== "object" || bloco.camadas === null || Array.isArray(bloco.camadas)) {
		problemas.push("camadas precisa ser um objeto com chao, objeto e frente");
	} else {
		for (const nome of Object.keys(bloco.camadas)) {
			if (!CAMADAS.includes(nome)) problemas.push(`camada desconhecida: ${nome}`);
		}
		for (const nome of CAMADAS) {
			const celulas = bloco.camadas[nome];
			if (celulas === undefined) continue;
			if (!Array.isArray(celulas)) {
				problemas.push(`camada ${nome} precisa ser uma lista`);
				continue;
			}
			const ruim = celulas.findIndex(
				(c) =>
					!Array.isArray(c) ||
					c.length !== 5 ||
					!Number.isInteger(c[0]) ||
					!Number.isInteger(c[1]) ||
					c[0] < 0 ||
					c[0] >= 64 ||
					c[1] < 0 ||
					c[1] >= 64 ||
					typeof c[2] !== "string" ||
					!Number.isInteger(c[3]) ||
					!Number.isInteger(c[4]),
			);
			if (ruim !== -1) {
				problemas.push(
					`camada ${nome}, entrada ${ruim} (${JSON.stringify(celulas[ruim])}): esperado [x, y, folha, coluna, linha] com x e y de 0 a 63`,
				);
			}
		}
	}
	return problemas;
}

/** Resumo de um bloco: tudo menos as listas de células e o terreno, que viram contagens. */
function resumirBloco(conteudo) {
	if (typeof conteudo !== "object" || conteudo === null) return conteudo;
	const saida = { ...conteudo };
	if (saida.camadas && typeof saida.camadas === "object") {
		saida.camadas = Object.fromEntries(
			Object.entries(saida.camadas).map(([nome, lista]) => [nome, Array.isArray(lista) ? `${lista.length} células` : lista]),
		);
	}
	if (saida.exterior && typeof saida.exterior === "object") {
		const ext = { ...saida.exterior };
		if (Array.isArray(ext.terreno)) ext.terreno = `${ext.terreno.length} linhas`;
		if (Array.isArray(ext.decalques)) ext.decalques = `${ext.decalques.length} decalques`;
		if (Array.isArray(ext.formas)) ext.formas = `${ext.formas.length} formas`;
		if (Array.isArray(ext.runs_importados)) ext.runs_importados = `${ext.runs_importados.length} recortes`;
		saida.exterior = ext;
	}
	return saida;
}

// ---------------------------------------------------------------------------------------------------------------
// Studio e Aseprite

/**
 * Manda um comando ao plugin (POST /studio/comandos) e espera a resposta com GET /studio/respostas/<id>?espera=30,
 * repetindo enquanto vier 202, até `limiteS` segundos.
 */
async function comandoStudio(tipo, args, sessao, limiteS = ESPERA_STUDIO_S) {
	const corpo = { tipo, args: args ?? {} };
	if (sessao) corpo.sessao = sessao;
	let enviado;
	try {
		enviado = await pedir("POST", "/studio/comandos", { corpo });
	} catch (erro) {
		if (erro instanceof ErroPonte && erro.status && erro.status !== 404) {
			throw new ErroPonte(`${erro.message}\n${DICA_STUDIO}`, { status: erro.status, dados: erro.dados });
		}
		throw erro;
	}
	const id = enviado.dados?.id;
	if (!id) throw new ErroPonte("A ponte aceitou o comando mas não devolveu o id.", { dados: enviado.dados });
	const inicio = Date.now();
	const limite = inicio + limiteS * 1000;
	let entregue = false;
	for (;;) {
		const restante = Math.ceil((limite - Date.now()) / 1000);
		if (restante <= 0) {
			const situacao = entregue
				? "O plugin recebeu o comando e ainda não respondeu (ocupado, ou travou no meio)."
				: "Nenhum plugin buscou o comando ainda (o Studio pode estar num diálogo, em Play ou sem o canal ligado).";
			throw new ErroPonte(
				`O Studio não respondeu ao comando "${tipo}" (id ${id}) em ${limiteS} s. ${situacao} Não repita o comando às cegas: a resposta ainda pode chegar em GET ${PONTE}/studio/respostas/${id}?espera=30. ${DICA_STUDIO}`,
			);
		}
		const espera = Math.min(30, restante);
		let status;
		let dados;
		try {
			({ status, dados } = await pedir("GET", `/studio/respostas/${encodeURIComponent(id)}?espera=${espera}`, {
				tempoMs: (espera + 10) * 1000,
				aceitar: [202],
			}));
		} catch (erro) {
			if (erro instanceof ErroPonte && erro.status === 404) {
				// A ponte não conhece mais o id: ela reiniciou no meio (guarda os comandos só em memória).
				throw new ErroPonte(
					`A ponte esqueceu o comando "${tipo}" (id ${id}): ela reiniciou enquanto o MCP esperava a resposta. Não dá para saber se o Studio chegou a rodá-lo; confira (studio_comando "estado", studio_output) antes de repetir.`,
				);
			}
			throw erro;
		}
		if (status === 202) {
			entregue = dados?.entregue === true;
			continue;
		}
		const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
		if (dados?.ok === false) {
			const desconhecido = /comando desconhecido/i.test(String(dados.erro ?? ""));
			throw new ErroPonte(
				`O comando "${tipo}" (id ${id}) falhou: ${dados.erro}` +
					(desconhecido
						? "\nO pacote do plugin em uso não tem este comando: recompile o plugin (npm run plugin:compile, a ponte entrega o pacote novo) ou confira o nome na tabela da seção 2 de docs/diorama/CONEXOES.md."
						: ""),
				{ dados },
			);
		}
		return { id, segundos, dados };
	}
}

function ferramentaStudio(tipo, montarArgs, limiteS) {
	return ferramenta(async (entrada) => {
		const { id, segundos, dados } = await comandoStudio(tipo, montarArgs(entrada), entrada.sessao, entrada.limite_s ?? limiteS);
		return resultado(`Studio respondeu a "${tipo}" (id ${id}) em ${segundos} s.`, dados?.valor ?? dados);
	});
}

async function comandoAseprite(nome, args) {
	try {
		const { dados } = await pedir("POST", "/aseprite/comandos", { corpo: { nome, args: args ?? {} }, tempoMs: 40_000 });
		if (dados?.ok === false) throw new ErroPonte(`O Aseprite recusou "${nome}": ${dados.erro}`, { dados });
		return dados;
	} catch (erro) {
		if (erro instanceof ErroPonte && erro.status && erro.status !== 404) {
			throw new ErroPonte(`${erro.message}\n${DICA_ASEPRITE}`, { status: erro.status, dados: erro.dados });
		}
		if (erro instanceof ErroPonte && /não respondeu a POST/.test(erro.message)) {
			throw new ErroPonte(`${erro.message}\n${DICA_ASEPRITE}`);
		}
		throw erro;
	}
}

function ferramentaAseprite(nome, montarArgs) {
	return ferramenta(async (entrada) => {
		const dados = await comandoAseprite(nome, montarArgs(entrada));
		return resultado(`Aseprite respondeu a "${nome}".`, dados?.valor ?? dados);
	});
}

// ---------------------------------------------------------------------------------------------------------------
// Ferramentas

const servidor = new McpServer({ name: "diorama", version: VERSAO });
const somenteLeitura = { readOnlyHint: true, openWorldHint: false };

const zIdMapa = z.string().regex(ID_MAPA).describe("Id do mapa: a pasta em diorama/mapas (letras minúsculas, números e _).");
const zSessao = z
	.string()
	.optional()
	.describe("Sessão do Studio (de studio_sessoes). Sem ela, vai para a sessão mais recente em modo edição.");
const zLimite = (padrao) =>
	z.number().int().min(1).max(600).optional().describe(`Quantos segundos esperar a resposta do Studio (padrão ${padrao}).`);

// Ponte e disco ------------------------------------------------------------------------------------------------

servidor.registerTool(
	"ponte_status",
	{
		title: "Estado da ponte",
		description:
			"Confere a ponte do Diorama (http://127.0.0.1:34873): versão, raiz do repositório, pastas, se o Rojo está ligado, quantos mapas e folhas há e quais mapas já têm módulo gerado em src/shared/interiors. Use primeiro para saber se a ponte está no ar; se não estiver, este MCP a sobe sozinho em segundo plano.",
		inputSchema: {},
		annotations: somenteLeitura,
	},
	ferramenta(async () => {
		const { dados } = await pedir("GET", "/status");
		const rojo = dados?.rojo?.ligado ? "Rojo ligado" : "Rojo desligado";
		return resultado(
			`Ponte ${dados?.versao ?? "?"} no ar em ${PONTE}; ${dados?.mapas ?? "?"} mapas, ${dados?.folhas ?? "?"} folhas, ${dados?.gerados?.length ?? 0} gerados; ${rojo}.`,
			dados,
		);
	}),
);

servidor.registerTool(
	"mapas_listar",
	{
		title: "Listar mapas",
		description:
			"Lista os mapas do Diorama (pastas em diorama/mapas): id, nome e os blocos [bx, by] que têm arquivo. Use para achar o id antes de mapa_ler, mapa_gravar_bloco ou mapa_gerar. Precisa só da ponte.",
		inputSchema: {},
		annotations: somenteLeitura,
	},
	ferramenta(async () => {
		const { dados } = await pedir("GET", "/mapas");
		return resultado(`${Array.isArray(dados) ? dados.length : "?"} mapas em diorama/mapas.`, dados);
	}),
);

servidor.registerTool(
	"mapa_ler",
	{
		title: "Ler mapa",
		description:
			"Lê um mapa do Diorama: o mapa.json e o conteúdo dos blocos (formato 1, docs/diorama/GERADOR.md: camadas chao/objeto/frente com células [x, y, folha, coluna, linha], exterior, saídas, zonas, moradores...). Os blocos podem ser grandes: use `resumo: true` para trocar as listas de células e o terreno por contagens, e `bloco` para pegar um só. Para o conteúdo completo de um bloco grande, leia o arquivo diorama/mapas/<id>/blocos/<bx>_<by>.json direto do disco.",
		inputSchema: {
			id: zIdMapa,
			bloco: z
				.string()
				.regex(/^\d+_\d+$/)
				.optional()
				.describe('Só este bloco, como "0_0".'),
			resumo: z.boolean().optional().describe("Troca as células e o terreno por contagens (padrão false)."),
		},
		annotations: somenteLeitura,
	},
	ferramenta(async ({ id, bloco, resumo }) => {
		const { dados } = await pedir("GET", `/mapas/${encodeURIComponent(id)}`);
		let blocos = Array.isArray(dados?.blocos) ? dados.blocos : [];
		if (bloco) {
			const [bx, by] = bloco.split("_").map(Number);
			blocos = blocos.filter((b) => b.bloco?.[0] === bx && b.bloco?.[1] === by);
			if (blocos.length === 0) return falha(`O mapa ${id} não tem o bloco ${bloco}.`, { blocos: dados?.blocos?.map((b) => b.bloco) });
		}
		if (resumo) blocos = blocos.map((b) => ({ ...b, conteudo: resumirBloco(b.conteudo) }));
		const descricao = blocos.map((b) => `${b.bloco?.join("_")}`).join(", ") || "nenhum";
		return resultado(
			`Mapa ${id}: blocos ${descricao}${resumo ? " (resumo)" : ""}.`,
			{ ...dados, blocos },
			`Use resumo: true, ou leia diorama/mapas/${id}/blocos/<bx>_<by>.json do disco.`,
		);
	}),
);

servidor.registerTool(
	"mapa_gravar_bloco",
	{
		title: "Gravar bloco de mapa",
		description:
			"Grava um bloco de mapa (formato 1, docs/diorama/GERADOR.md) em diorama/mapas/<id>/blocos/<bx>_<by>.json pela ponte, criando a pasta e anotando o bloco no mapa.json. Confere antes o mínimo: versao 1, mapa igual ao id, bloco igual às coordenadas, folhas, vazio [folha, coluna, linha] e camadas chao/objeto/frente com células [x, y, folha, coluna, linha] (x e y de 0 a 63). Substitui o bloco inteiro: leia com mapa_ler, mude e mande o bloco completo. Sem `nascimento` [x, y] o bloco é gravado com aviso, e o gerador põe o jogador na primeira célula livre. Depois rode mapa_gerar para o jogo receber.",
		inputSchema: {
			id: zIdMapa,
			bloco: z
				.record(z.string(), z.unknown())
				.describe('O bloco inteiro: { "versao": 1, "mapa": "<id>", "bloco": [bx, by], "folhas": [...], "vazio": [...], "camadas": {...}, ... }.'),
		},
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
	},
	ferramenta(async ({ id, bloco }) => {
		const coordenadas = bloco?.bloco;
		if (!Array.isArray(coordenadas) || !Number.isInteger(coordenadas[0]) || !Number.isInteger(coordenadas[1]) || coordenadas[0] < 0 || coordenadas[1] < 0) {
			return falha(`O bloco precisa do campo "bloco": [bx, by] com inteiros não negativos (veio ${JSON.stringify(coordenadas)}).`);
		}
		const problemas = validarBloco(bloco, id, coordenadas);
		if (problemas.length > 0) return falha(`Bloco inválido, nada foi gravado:\n- ${problemas.join("\n- ")}`);
		const [bx, by] = coordenadas;
		const { dados } = await pedir("PUT", `/mapas/${encodeURIComponent(id)}/blocos/${bx}_${by}`, { corpo: bloco });
		const avisos = Array.isArray(dados?.avisos) && dados.avisos.length > 0 ? `\nAvisos:\n- ${dados.avisos.join("\n- ")}` : "";
		return resultado(`Bloco ${id} ${bx}_${by} gravado em ${dados?.arquivo ?? "?"}. Rode mapa_gerar para atualizar o módulo do jogo.${avisos}`, dados);
	}),
);

servidor.registerTool(
	"mapa_gerar",
	{
		title: "Gerar módulo do mapa",
		description:
			'Roda o gerador pela ponte: com o id de um mapa, `npm run diorama:jogo -- <id>` (bloco → src/shared/interiors/<id>.ts e index.ts); com id "decorar", `npm run diorama:jogo -- --decorar` (catálogo → src/shared/decorCatalog.ts). Devolve ok, código de saída e o log. Pode levar até 120 s. Use depois de gravar um bloco ou o catálogo; com o Rojo ligado o Studio recebe sozinho.',
		inputSchema: {
			id: z
				.string()
				.regex(/^[a-z0-9_]+$/)
				.describe('Id do mapa, ou "decorar" para gerar o catálogo do Decorar.'),
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
	},
	ferramenta(async ({ id }) => {
		const caminho = id === "decorar" ? "/gerar/decorar" : `/gerar/${encodeURIComponent(id)}`;
		const { dados } = await pedir("POST", caminho, { tempoMs: TEMPO_GERADOR_MS });
		const r = resultado(
			dados?.ok ? `Gerador de "${id}" terminou bem.` : `Gerador de "${id}" falhou (código ${dados?.codigo}); veja o log.`,
			dados,
		);
		return dados?.ok ? r : { ...r, isError: true };
	}),
);

servidor.registerTool(
	"catalogo_ler",
	{
		title: "Ler catálogo",
		description:
			"Lê um catálogo do Diorama (diorama/catalogo/<nome>.json): zonas (zonas das folhas, bloqueios, ações), pecas (regiões das folhas que o jogo cita, ~40 kB), fundos (tipos de fundo) ou exterior (terrenos, junções, decalques, formas). Para o pecas, prefira `id` (só os itens com esse id) ou `resumo: true` (as chaves e os ids das listas), porque o arquivo inteiro passa do limite e é cortado.",
		inputSchema: {
			nome: z
				.string()
				.regex(/^[a-z0-9_]+$/)
				.describe('Nome do catálogo: "zonas", "pecas", "fundos" ou "exterior".'),
			id: z.string().optional().describe("Só os itens (de qualquer lista do topo) cujo campo id é este."),
			resumo: z.boolean().optional().describe("Devolve as chaves do topo e, nas listas, só a contagem e os ids."),
		},
		annotations: somenteLeitura,
	},
	ferramenta(async ({ nome, id, resumo }) => {
		const { dados } = await pedir("GET", `/catalogo/${encodeURIComponent(nome)}`);
		const dica = `Use id ou resumo: true, ou leia diorama/catalogo/${nome}.json do disco.`;
		if (id !== undefined && dados && typeof dados === "object") {
			const achados = [];
			for (const [chave, valor] of Object.entries(dados)) {
				if (Array.isArray(valor)) {
					for (const item of valor) {
						if (item && typeof item === "object" && item.id === id) achados.push({ lista: chave, item });
					}
				} else if (valor && typeof valor === "object" && id in valor) {
					achados.push({ objeto: chave, chave: id, item: valor[id] });
				}
			}
			return achados.length === 0
				? falha(`Nada com id "${id}" no catálogo ${nome}.`)
				: resultado(`${achados.length} item(ns) com id "${id}" no catálogo ${nome}.`, achados, dica);
		}
		if (resumo && dados && typeof dados === "object") {
			const saida = {};
			for (const [chave, valor] of Object.entries(dados)) {
				if (Array.isArray(valor)) {
					const ids = valor.map((v) => (v && typeof v === "object" && "id" in v ? v.id : undefined)).filter((v) => v !== undefined);
					saida[chave] = ids.length > 0 ? { itens: valor.length, ids } : `${valor.length} itens`;
				} else if (valor && typeof valor === "object") saida[chave] = { chaves: Object.keys(valor) };
				else saida[chave] = valor;
			}
			return resultado(`Catálogo ${nome} (resumo).`, saida, dica);
		}
		return resultado(`Catálogo ${nome}.`, dados, dica);
	}),
);

servidor.registerTool(
	"catalogo_gravar",
	{
		title: "Gravar catálogo",
		description:
			"Grava o catálogo inteiro em diorama/catalogo/<nome>.json pela ponte (qualquer JSON válido; a ponte não confere o formato). Substitui o arquivo: leia com catalogo_ler (ou do disco), mude e mande tudo. Depois do pecas ou fundos, rode mapa_gerar com id \"decorar\".",
		inputSchema: {
			nome: z
				.string()
				.regex(/^[a-z0-9_]+$/)
				.describe('Nome do catálogo: "zonas", "pecas", "fundos" ou "exterior".'),
			conteudo: z.record(z.string(), z.unknown()).describe("O JSON inteiro do catálogo (objeto com versao, nota e as listas)."),
		},
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
	},
	ferramenta(async ({ nome, conteudo }) => {
		const { dados } = await pedir("PUT", `/catalogo/${encodeURIComponent(nome)}`, { corpo: conteudo });
		return resultado(`Catálogo ${nome} gravado em ${dados?.arquivo ?? "?"}.`, dados);
	}),
);

/** As entradas de assets/registro.json (seção "assets", e "antigos" se pedido). */
async function lerRegistro() {
	const { dados } = await pedir("GET", "/assets");
	if (!dados || typeof dados !== "object" || dados.formato !== 1) {
		throw new ErroPonte(`assets/registro.json em formato inesperado (formato ${dados?.formato}).`);
	}
	return dados;
}

const semId = (e) => e?.id === "" || e?.id === undefined || e?.id === null;

servidor.registerTool(
	"assets_listar",
	{
		title: "Listar assets",
		description:
			"Lista o registro de assets do jogo (assets/registro.json): cada chave (ui.atlas, graal.aeko.0, som.passo...) com tipo, id do Roblox, arquivo e origem. Use `filtro` para só as chaves que contêm um texto. Para o que ainda não foi enviado ao Roblox, use assets_faltam.",
		inputSchema: {
			filtro: z.string().optional().describe('Só as chaves que contêm este texto (ex. "ui." ou "aeko").'),
			antigos: z.boolean().optional().describe("Inclui também a seção antigos (chaves que o jogo não usa mais)."),
		},
		annotations: somenteLeitura,
	},
	ferramenta(async ({ filtro, antigos }) => {
		const registro = await lerRegistro();
		const filtrar = (secao) =>
			Object.fromEntries(Object.entries(secao ?? {}).filter(([chave]) => !filtro || chave.includes(filtro)));
		const assets = filtrar(registro.assets);
		const saida = { assets };
		if (antigos) saida.antigos = filtrar(registro.antigos);
		const n = Object.keys(assets).length;
		const faltam = Object.values(assets).filter(semId).length;
		return resultado(
			`${n} chave(s) em assets${filtro ? ` com "${filtro}"` : ""}; ${faltam} sem id.`,
			saida,
			'Use filtro (ex. "ui.") ou leia assets/registro.json do disco.',
		);
	}),
);

servidor.registerTool(
	"assets_faltam",
	{
		title: "Assets sem id",
		description:
			"Lista as chaves de assets/registro.json ainda sem id do Roblox (o mesmo que `npm run assets -- --faltam`), separadas em imagens e sons, com o arquivo e a origem de cada uma. Imagens se enviam pelo Studio (ferramenta Assets do plugin); sons sem arquivo se perderam e serão refeitos (DUVIDAS.md, item 19), e um som com arquivo vai pelo Creator Hub. Depois do envio: npm run assets -- --importar.",
		inputSchema: {},
		annotations: somenteLeitura,
	},
	ferramenta(async () => {
		const registro = await lerRegistro();
		const faltam = Object.entries(registro.assets ?? {})
			.filter(([, e]) => semId(e))
			.map(([chave, e]) => ({ chave, tipo: e?.tipo, arquivo: e?.arquivo, origem: e?.origem }));
		if (faltam.length === 0) return resultado("Todas as chaves têm id.", []);
		const imagens = faltam.filter((f) => f.tipo === "imagem");
		const sons = faltam.filter((f) => f.tipo === "som");
		const outros = faltam.filter((f) => f.tipo !== "imagem" && f.tipo !== "som");
		const linhas = [`${faltam.length} chave(s) sem id.`];
		if (imagens.length > 0) {
			linhas.push(`- ${imagens.length} imagem(ns): envie pela ferramenta Assets do plugin no Studio (ou pelo Creator Hub) e rode npm run assets -- --importar.`);
		}
		if (sons.length > 0) {
			const semArquivo = sons.filter((f) => !f.arquivo).length;
			linhas.push(
				`- ${sons.length} som(ns)${semArquivo > 0 ? `, ${semArquivo} sem arquivo` : ""}: a ferramenta Assets não envia som. Os sons sem arquivo se perderam e serão refeitos (docs/diorama/DUVIDAS.md, item 19; docs/audio/ESTUDO_PACOTES_ABLETON.md); um som com arquivo vai pelo Creator Hub, e o id entra com npm run assets -- --importar. O jogo segue sem eles (avisa [Som]).`,
			);
		}
		if (outros.length > 0) linhas.push(`- ${outros.length} de tipo desconhecido: corrija o tipo no registro (imagem ou som).`);
		return resultado(linhas.join("\n"), { imagens, sons, ...(outros.length > 0 ? { outros } : {}) });
	}),
);

servidor.registerTool(
	"eventos",
	{
		title: "Eventos da ponte",
		description:
			"Lê os eventos da ponte (GET /eventos): folha_salva (Aseprite), pacote_novo (plugin recompilado), mapa_gravado, gerado, studio_entrou/studio_saiu, aseprite_conectou/aseprite_saiu. Passe `desde` com o `proximo` da chamada anterior para só os novos; `espera` (até 25 s) segura a resposta até chegar algo.",
		inputSchema: {
			desde: z.number().int().min(0).optional().describe("Número do primeiro evento (o `proximo` da última leitura). Padrão 0."),
			espera: z.number().int().min(0).max(25).optional().describe("Segundos para esperar um evento novo (padrão 0: responde já)."),
		},
		annotations: somenteLeitura,
	},
	ferramenta(async ({ desde = 0, espera = 0 }) => {
		const { dados } = await pedir("GET", `/eventos?desde=${desde}&espera=${espera}`, { tempoMs: (espera + 10) * 1000 });
		const n = Array.isArray(dados?.eventos) ? dados.eventos.length : 0;
		return resultado(`${n} evento(s); próximo desde=${dados?.proximo ?? "?"}.`, dados);
	}),
);

// Studio -------------------------------------------------------------------------------------------------------

servidor.registerTool(
	"studio_sessoes",
	{
		title: "Sessões do Studio",
		description:
			"Lista os Studios abertos com o plugin Diorama que falaram com a ponte nos últimos 15 s: sessão, place, placeId, versão do plugin, modo (edicao, run, cliente, servidor) e há quanto tempo foi visto. Vazio quer dizer nenhum Studio com o plugin. Use antes dos comandos studio_* e para escolher `sessao` quando há mais de um.",
		inputSchema: {},
		annotations: somenteLeitura,
	},
	ferramenta(async () => {
		const { dados } = await pedir("GET", "/studio/presenca");
		const n = Array.isArray(dados) ? dados.length : 0;
		return resultado(n === 0 ? `Nenhum Studio com o plugin Diorama conectado. ${DICA_STUDIO}` : `${n} sessão(ões) do Studio.`, dados);
	}),
);

servidor.registerTool(
	"studio_comando",
	{
		title: "Comando ao Studio",
		description:
			"Manda um comando ao plugin Diorama no Studio e espera a resposta. Tipos (docs/diorama/CONEXOES.md, seção 2 e nota do topo): ping, estado, abrir_ferramenta {id}, abrir_mapa {id, descartar?}, testar_mapa {id, celula?}, parar_teste, diagnosticar, autoteste {ferramentas?, espera?, remontar?}, output {desde?, filtro?, limite?}, recarregar_folhas {folha?, ligar?, desligar?, pixel?}, executar_luau {codigo} (o plugin recusa se o usuário não ligou \"Permitir executar Luau\" no painel Conexão). Precisa da ponte e de um Studio aberto com o plugin. Há atalhos para os mais usados (studio_abrir_mapa, studio_testar_mapa, studio_autoteste, studio_diagnosticar, studio_output).",
		inputSchema: {
			tipo: z.string().min(1).describe('O tipo do comando, ex. "ping" ou "estado".'),
			args: z.record(z.string(), z.unknown()).optional().describe("Argumentos do comando (objeto)."),
			sessao: zSessao,
			limite_s: zLimite(ESPERA_STUDIO_S),
		},
		annotations: { readOnlyHint: false, openWorldHint: false },
	},
	ferramenta(async ({ tipo, args, sessao, limite_s }) => {
		const limite = limite_s ?? (tipo === "autoteste" ? ESPERA_AUTOTESTE_S : ESPERA_STUDIO_S);
		const { id, segundos, dados } = await comandoStudio(tipo, args, sessao, limite);
		return resultado(`Studio respondeu a "${tipo}" (id ${id}) em ${segundos} s.`, dados?.valor ?? dados);
	}),
);

servidor.registerTool(
	"studio_abrir_mapa",
	{
		title: "Abrir mapa no Studio",
		description:
			"Abre um mapa no editor de mapas do plugin Diorama no Studio e devolve o resumo do que abriu. Precisa da ponte e de um Studio com o plugin.",
		inputSchema: { id: zIdMapa, sessao: zSessao, limite_s: zLimite(ESPERA_STUDIO_S) },
		annotations: { readOnlyHint: false, openWorldHint: false },
	},
	ferramentaStudio("abrir_mapa", ({ id }) => ({ id }), ESPERA_STUDIO_S),
);

servidor.registerTool(
	"studio_testar_mapa",
	{
		title: "Testar mapa no Studio",
		description:
			"Prepara o teste de um mapa no Studio: o plugin grava os atributos InteriorTeste (e InteriorTesteCelula, se vier `celula`) para o próximo Play começar nesse mapa. Para desfazer, studio_comando com tipo \"parar_teste\". Precisa da ponte e de um Studio com o plugin, e do módulo do mapa já gerado (mapa_gerar) e sincronizado pelo Rojo.",
		inputSchema: {
			id: zIdMapa,
			celula: z.tuple([z.number().int(), z.number().int()]).optional().describe("Célula de chegada [x, y]; sem ela, o nascimento do mapa."),
			sessao: zSessao,
			limite_s: zLimite(ESPERA_STUDIO_S),
		},
		annotations: { readOnlyHint: false, openWorldHint: false },
	},
	ferramentaStudio("testar_mapa", ({ id, celula }) => (celula ? { id, celula } : { id }), ESPERA_STUDIO_S),
);

servidor.registerTool(
	"studio_autoteste",
	{
		title: "Autoteste do plugin",
		description:
			"Roda o autoteste do plugin Diorama no Studio: por ferramenta, se montou, quantas instâncias, erros capturados no Output durante a montagem e as conferências próprias. Use depois de mudar o plugin para ver se tudo monta. Pode levar até 2 min. Precisa da ponte e de um Studio com o plugin.",
		inputSchema: {
			ferramentas: z.array(z.string()).optional().describe("Só estas ferramentas (ids); sem a lista, todas."),
			sessao: zSessao,
			limite_s: zLimite(ESPERA_AUTOTESTE_S),
		},
		annotations: { readOnlyHint: false, openWorldHint: false },
	},
	ferramentaStudio("autoteste", ({ ferramentas }) => (ferramentas ? { ferramentas } : {}), ESPERA_AUTOTESTE_S),
);

servidor.registerTool(
	"studio_diagnosticar",
	{
		title: "Diagnóstico do Studio",
		description:
			"Pede ao plugin Diorama a lista do painel Problemas (mapas, catálogo, visual dos moradores, assets...). Precisa da ponte e de um Studio com o plugin.",
		inputSchema: { sessao: zSessao, limite_s: zLimite(ESPERA_STUDIO_S) },
		annotations: { readOnlyHint: true, openWorldHint: false },
	},
	ferramentaStudio("diagnosticar", () => ({}), ESPERA_STUDIO_S),
);

servidor.registerTool(
	"studio_output",
	{
		title: "Output do Studio",
		description:
			"Lê as mensagens do Output do Studio que o plugin Diorama guardou: { mensagens: [{ n, nivel, hora, texto }], proximo }. Passe `desde` (o `proximo` da leitura anterior) para só as novas, `filtro` para só as que contêm um texto (ex. \"[Diorama]\" ou \"error\") e `limite` para no máximo tantas. Precisa da ponte e de um Studio com o plugin.",
		inputSchema: {
			desde: z.number().int().min(0).optional().describe("Só mensagens a partir deste número de ordem."),
			filtro: z.string().optional().describe("Só mensagens que contêm este texto."),
			limite: z.number().int().min(1).max(2000).optional().describe("No máximo tantas mensagens."),
			sessao: zSessao,
			limite_s: zLimite(ESPERA_STUDIO_S),
		},
		annotations: { readOnlyHint: true, openWorldHint: false },
	},
	ferramentaStudio(
		"output",
		({ desde, filtro, limite }) => ({
			...(desde !== undefined ? { desde } : {}),
			...(filtro !== undefined ? { filtro } : {}),
			...(limite !== undefined ? { limite } : {}),
		}),
		ESPERA_STUDIO_S,
	),
);

// Aseprite -----------------------------------------------------------------------------------------------------

servidor.registerTool(
	"aseprite_estado",
	{
		title: "Estado do Aseprite",
		description:
			"Diz se o Aseprite está conectado à ponte pela extensão Diorama, a versão e o sprite aberto. Use antes dos comandos aseprite_*. Precisa só da ponte; o Aseprite aparece como desconectado se não estiver aberto com a extensão.",
		inputSchema: {},
		annotations: somenteLeitura,
	},
	ferramenta(async () => {
		const { dados } = await pedir("GET", "/aseprite/estado");
		return resultado(dados?.conectado ? "Aseprite conectado." : `Aseprite desconectado. ${DICA_ASEPRITE}`, dados);
	}),
);

servidor.registerTool(
	"aseprite_comando",
	{
		title: "Comando ao Aseprite",
		description:
			"Manda um comando à extensão Diorama do Aseprite e espera a resposta (até 30 s). Nomes (docs/diorama/CONEXOES.md, seção 3): ping, sprite_atual, abrir {arquivo} (caminho relativo à raiz do repositório), abrir_regiao {folha, area}, salvar_regiao {folha?, area?}, exportar {arquivo}, paleta. Precisa da ponte e do Aseprite aberto com a extensão.",
		inputSchema: {
			nome: z.string().min(1).describe('O comando, ex. "sprite_atual" ou "paleta".'),
			args: z.record(z.string(), z.unknown()).optional().describe("Argumentos do comando (objeto)."),
		},
		annotations: { readOnlyHint: false, openWorldHint: false },
	},
	ferramenta(async ({ nome, args }) => {
		const dados = await comandoAseprite(nome, args);
		return resultado(`Aseprite respondeu a "${nome}".`, dados?.valor ?? dados);
	}),
);

const zArea = z
	.tuple([z.number().int().min(0), z.number().int().min(0), z.number().int().min(1), z.number().int().min(1)])
	.describe("[coluna, linha, largura, altura] em tiles de 16 px.");

servidor.registerTool(
	"aseprite_abrir_regiao",
	{
		title: "Abrir região de folha no Aseprite",
		description:
			"Abre no Aseprite um sprite novo com uma região de diorama/folhas/<folha>.png (tiles de 16 px), com a grade de 16 px ligada e o nome folha@c,l, para editar. Depois de editar, aseprite_salvar_regiao grava de volta na folha e o Studio recarrega a prévia. Precisa da ponte e do Aseprite aberto com a extensão.",
		inputSchema: {
			folha: z.string().regex(/^[A-Za-z0-9_.-]+$/).describe('Nome da folha sem .png, ex. "casa".'),
			area: zArea,
		},
		annotations: { readOnlyHint: false, openWorldHint: false },
	},
	ferramentaAseprite("abrir_regiao", ({ folha, area }) => ({ folha, area })),
);

servidor.registerTool(
	"aseprite_salvar_regiao",
	{
		title: "Salvar região de volta na folha",
		description:
			"Grava o sprite atual do Aseprite de volta na região da folha de onde veio (lida do nome folha@c,l quando faltam folha e area), salva a folha em diorama/folhas e solta o evento folha_salva, que faz o Studio recarregar as folhas locais. Precisa da ponte e do Aseprite aberto com a extensão.",
		inputSchema: {
			folha: z.string().regex(/^[A-Za-z0-9_.-]+$/).optional().describe("Nome da folha; sem ele, vem do nome do sprite."),
			area: zArea.optional(),
		},
		annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
	},
	ferramentaAseprite("salvar_regiao", ({ folha, area }) => ({ ...(folha ? { folha } : {}), ...(area ? { area } : {}) })),
);

// ---------------------------------------------------------------------------------------------------------------
// Início

const transporte = new StdioServerTransport();
await servidor.connect(transporte);
log(`MCP do Diorama ${VERSAO} no ar (ponte: ${PONTE})`);
// Confere a ponte já na largada (sem segurar nada): se não está no ar, sobe-a, e o próximo resultado avisa.
garantirPonte().catch((erro) => log("erro ao conferir a ponte:", erro?.message ?? erro));
