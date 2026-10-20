// Ponte do Diorama: servidor HTTP local que dá ao plugin do Studio acesso ao disco do repositório.
// Lê e grava `diorama/` (mapas, catálogo, folhas), `assets/` e `docs/diorama/`, e roda os geradores.
// Só escuta em 127.0.0.1 e não tem senha; recusa pedidos de páginas web (Origin, Sec-Fetch-Site, Host) e
// POST/PUT/DELETE sem `X-Diorama: 1` (a não ser com --sem-exigir-cabecalho). Rotas em docs/diorama/PONTE.md.
//
// Uso: npm run diorama:ponte            (ou: node tools/diorama_ponte.mjs [--porta 34873] [--plugin-watch]
//                                             [--exigir-cabecalho | --sem-exigir-cabecalho])
// Depende do Node, do pngjs (decodifica as folhas para GET /folhas/<nome>.rgba) e do ws (o canal do Aseprite).
// DIORAMA_RAIZ (variável de ambiente) troca a raiz do repositório: os testes (tools/testes/ponte.test.mjs) sobem a
// ponte numa cópia.
//
// Além do disco, a ponte é o centro das conexões (docs/diorama/CONEXOES.md): serve o pacote do plugin para a
// recarga a quente (/plugin/*, diorama_lib/pacote.mjs), leva comandos ao Studio (/studio/*), fala com o Aseprite
// por WebSocket (/ws, /aseprite/*) e anuncia eventos (/eventos); os canais moram em diorama_lib/canais.mjs.

import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { criarCanais } from "./diorama_lib/canais.mjs";
import { observarPacote } from "./diorama_lib/pacote.mjs";

export const VERSAO = "0.5.0";
const HOST = "127.0.0.1";
const PORTA_PADRAO = 34873;
const PORTA_ROJO = 34872;
/** Tamanho máximo de um corpo de pedido (os blocos e catálogos são pequenos; as folhas só saem, não entram). */
const CORPO_MAXIMO = 16 * 1024 * 1024;
/** Tempo máximo de um gerador, em milissegundos. */
const TEMPO_GERADOR = 120_000;
/** Lado do bloco em células. */
const LADO_BLOCO = 64;
/**
 * Se POST/PUT/DELETE precisam de `X-Diorama: 1` quando nenhuma opção diz o contrário. O MCP e os testes mandam o
 * cabeçalho, e o plugin também desde a revisão de 2026-10-20 (DUVIDAS.md, item 29); `--sem-exigir-cabecalho` desliga
 * para um plugin mais velho. A extensão do Aseprite só usa o WebSocket.
 */
const EXIGIR_CABECALHO_PADRAO = true;

export const RAIZ = process.env.DIORAMA_RAIZ
	? path.resolve(process.env.DIORAMA_RAIZ)
	: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PASTAS = {
	mapas: path.join(RAIZ, "diorama", "mapas"),
	catalogo: path.join(RAIZ, "diorama", "catalogo"),
	folhas: path.join(RAIZ, "diorama", "folhas"),
	assets: path.join(RAIZ, "assets"),
	docs: path.join(RAIZ, "docs", "diorama"),
};
/** As pastas de onde GET /imagens/<caminho>.rgba serve PNG (caminhos relativos à raiz). */
const PASTAS_IMAGENS = ["assets", path.join("diorama", "folhas"), path.join("diorama", "recortes")];
/** De onde GET /graal/ids e o `gerados` do status leem. */
const ARQUIVO_GRAAL = path.join(RAIZ, "src", "shared", "graalData.ts");
const ARQUIVO_INTERIORS = path.join(RAIZ, "src", "shared", "interiors", "index.ts");

const ID_MAPA = /^[a-z0-9_]+$/;
/** Nome de folha ou documento: não começa com "." (nem é "." ou ".."; os temporários começam com "."). */
const NOME_ARQUIVO = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/;
const NOME_CATALOGO = /^[a-z0-9_]+$/;
const BLOCO = /^(\d{1,6})_(\d{1,6})$/;
/** Um caminho de imagem: segmentos de nome de arquivo separados por "/", sem "." nem ".." como segmento. */
const CAMINHO_IMAGEM = /^(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*$/;
/** Nomes que o Windows reserva para dispositivos; valem com qualquer extensão (`con.json`, `nul.png`). */
const NOME_RESERVADO = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³]|conin\$|conout\$|clock\$)$/i;

// ---------------------------------------------------------------------------------------------------------------
// Respostas e erros

class ErroHttp extends Error {
	constructor(status, mensagem) {
		super(mensagem);
		this.status = status;
	}
}

function json(res, status, valor) {
	const texto = JSON.stringify(valor, null, "\t");
	res.writeHead(status, {
		"Content-Type": "application/json; charset=utf-8",
		"Content-Length": Buffer.byteLength(texto),
	});
	res.end(texto);
}

function texto(res, status, conteudo, tipo = "text/plain; charset=utf-8") {
	res.writeHead(status, { "Content-Type": tipo, "Content-Length": Buffer.byteLength(conteudo) });
	res.end(conteudo);
}

/**
 * Lê o corpo inteiro. Corpo acima de CORPO_MAXIMO dá 413 sem ler o resto (pelo Content-Length, quando vem, ou ao
 * passar do limite); a conexão é fechada depois da resposta. Conexão que cai no meio dá 400.
 */
function lerCorpo(req) {
	return new Promise((resolve, reject) => {
		const declarado = Number(req.headers["content-length"]);
		const grande = () => {
			req.corpoGrande = true; // atender() fecha a conexão depois de responder
			req.removeAllListeners("data");
			req.resume(); // descarta o resto sem guardar
			reject(new ErroHttp(413, `corpo maior que ${CORPO_MAXIMO} bytes`));
		};
		if (Number.isFinite(declarado) && declarado > CORPO_MAXIMO) {
			grande();
			return;
		}
		const partes = [];
		let tamanho = 0;
		let terminou = false;
		req.on("data", (parte) => {
			tamanho += parte.length;
			if (tamanho > CORPO_MAXIMO) {
				grande();
				return;
			}
			partes.push(parte);
		});
		req.on("end", () => {
			terminou = true;
			resolve(Buffer.concat(partes));
		});
		req.on("error", (erro) => reject(new ErroHttp(400, `o pedido caiu no meio: ${erro.message}`)));
		req.on("close", () => {
			if (!terminou) reject(new ErroHttp(400, "a conexão caiu antes do fim do corpo"));
		});
	});
}

async function lerJson(req) {
	const corpo = await lerCorpo(req);
	if (corpo.length === 0) throw new ErroHttp(400, "o pedido precisa de um corpo JSON");
	try {
		return JSON.parse(corpo.toString("utf8"));
	} catch (erro) {
		throw new ErroHttp(400, `JSON inválido: ${erro.message}`);
	}
}

/** Como lerJson, mas o corpo tem de ser um objeto JSON ({ ... }). */
async function lerObjeto(req, oQue = "o corpo") {
	const valor = await lerJson(req);
	if (typeof valor !== "object" || valor === null || Array.isArray(valor)) {
		throw new ErroHttp(400, `${oQue} precisa ser um objeto JSON`);
	}
	return valor;
}

function existe(caminho) {
	try {
		fs.accessSync(caminho);
		return true;
	} catch {
		return false;
	}
}

function lerJsonDoDisco(caminho) {
	const texto = fs.readFileSync(caminho, "utf8");
	try {
		return JSON.parse(texto);
	} catch (erro) {
		throw new ErroHttp(500, `${path.relative(RAIZ, caminho)} tem JSON inválido: ${erro.message}`);
	}
}

// ---------------------------------------------------------------------------------------------------------------
// Caminhos seguros: nomes conferidos e nada de links

/** Recusa nomes que o Windows trata como dispositivo (`con`, `nul.json`) ou que ele encurta (ponto ou espaço no fim). */
function conferirNome(nome, oQue) {
	if (NOME_RESERVADO.test(nome.split(".")[0])) throw new ErroHttp(400, `${oQue} inválido: ${nome} (nome reservado do Windows)`);
	if (/[. ]$/.test(nome)) throw new ErroHttp(400, `${oQue} inválido: ${nome} (termina em ponto ou espaço)`);
	return nome;
}

/**
 * Confere que `alvo` fica dentro de `base` e que nenhum pedaço do caminho entre eles (nem a própria base) é link
 * simbólico ou junção: um link dentro de diorama/ levaria a leitura ou a gravação para fora do repositório.
 * Partes que ainda não existem são aceitas (a gravação vai criá-las).
 */
function semLinks(base, alvo) {
	const relativo = path.relative(base, alvo);
	if (relativo.startsWith("..") || path.isAbsolute(relativo)) throw new ErroHttp(400, `caminho fora de ${path.relative(RAIZ, base)}`);
	let atual = base;
	for (const parte of ["", ...relativo.split(path.sep).filter(Boolean)]) {
		atual = parte === "" ? atual : path.join(atual, parte);
		let estat;
		try {
			estat = fs.lstatSync(atual);
		} catch {
			return alvo; // daqui para baixo não existe
		}
		if (estat.isSymbolicLink()) {
			throw new ErroHttp(400, `a ponte não segue links: ${path.relative(RAIZ, atual) || atual} é um link simbólico ou junção`);
		}
	}
	return alvo;
}

/** Espera `ms` sem devolver o controle (só para as tentativas de renomear, poucos milissegundos). */
function pausar(ms) {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Grava um arquivo de uma vez: escreve num temporário na mesma pasta (`.<nome>.<pid>.<n>.tmp`) e renomeia por cima.
 * Quem lê nunca vê o arquivo pela metade, e uma queda no meio deixa o original inteiro. No Windows o renomear falha
 * enquanto outro programa está com o arquivo aberto; tenta de novo por até ~1 s.
 */
let contadorTemporario = 0;
export function gravarAtomico(caminho, conteudo) {
	fs.mkdirSync(path.dirname(caminho), { recursive: true });
	const temporario = path.join(path.dirname(caminho), `.${path.basename(caminho)}.${process.pid}.${++contadorTemporario}.tmp`);
	fs.writeFileSync(temporario, conteudo, { flag: "wx" });
	try {
		for (let tentativa = 0; ; tentativa++) {
			try {
				fs.renameSync(temporario, caminho);
				return;
			} catch (erro) {
				if (tentativa >= 20 || !["EPERM", "EACCES", "EBUSY"].includes(erro.code)) throw erro;
				pausar(50);
			}
		}
	} catch (erro) {
		fs.rmSync(temporario, { force: true });
		throw new ErroHttp(500, `não deu para gravar ${path.relative(RAIZ, caminho)}: ${erro.message}`);
	}
}

/** Grava JSON com tabulação, como o Prettier do repositório, e quebra de linha no fim (de uma vez, sem links). */
function gravarJson(base, caminho, valor) {
	semLinks(base, caminho);
	gravarAtomico(caminho, JSON.stringify(valor, null, "\t") + "\n");
}

// ---------------------------------------------------------------------------------------------------------------
// Mapas e blocos

/** A pasta de um mapa, conferida: id válido, sem nome reservado do Windows e sem link no caminho. */
function pastaMapa(id) {
	if (!ID_MAPA.test(id)) throw new ErroHttp(400, `id de mapa inválido: ${id} (só letras minúsculas, números e _)`);
	conferirNome(id, "id de mapa");
	return semLinks(PASTAS.mapas, path.join(PASTAS.mapas, id));
}

function lerBlocos(id) {
	const pasta = semLinks(PASTAS.mapas, path.join(pastaMapa(id), "blocos"));
	if (!existe(pasta)) return [];
	return fs
		.readdirSync(pasta, { withFileTypes: true })
		.filter((e) => e.isFile() && e.name.endsWith(".json") && BLOCO.test(e.name.slice(0, -5)))
		.map((e) => e.name)
		.sort()
		.map((nome) => {
			const [, bx, by] = BLOCO.exec(nome.slice(0, -5));
			return { bloco: [Number(bx), Number(by)], arquivo: nome };
		});
}

function lerMapaJson(id) {
	const caminho = semLinks(PASTAS.mapas, path.join(pastaMapa(id), "mapa.json"));
	return existe(caminho) ? lerJsonDoDisco(caminho) : null;
}

function listarMapas() {
	if (!existe(PASTAS.mapas)) return [];
	return fs
		.readdirSync(PASTAS.mapas, { withFileTypes: true })
		.filter((entrada) => entrada.isDirectory() && ID_MAPA.test(entrada.name) && !NOME_RESERVADO.test(entrada.name))
		.map((entrada) => {
			// Um mapa com mapa.json quebrado não derruba a lista: sai com o erro.
			try {
				const mapa = lerMapaJson(entrada.name);
				return { id: entrada.name, nome: mapa?.nome ?? entrada.name, blocos: lerBlocos(entrada.name).map((b) => b.bloco) };
			} catch (erro) {
				return { id: entrada.name, nome: entrada.name, blocos: [], erro: erro.message };
			}
		});
}

function lerMapa(id) {
	const pasta = pastaMapa(id);
	if (!existe(pasta)) throw new ErroHttp(404, `mapa não encontrado: ${id}`);
	const blocos = lerBlocos(id).map((b) => ({
		...b,
		conteudo: lerJsonDoDisco(semLinks(PASTAS.mapas, path.join(pasta, "blocos", b.arquivo))),
	}));
	return { id, mapa: lerMapaJson(id), blocos };
}

function lerCoordenadas(texto) {
	const m = BLOCO.exec(texto);
	if (!m) throw new ErroHttp(400, `bloco inválido: ${texto} (esperado <bx>_<by>, números inteiros)`);
	return [Number(m[1]), Number(m[2])];
}

const CAMADAS = ["chao", "objeto", "frente"];

/** Validação mínima do formato 1 (docs/diorama/ARQUITETURA.md). Devolve a lista de problemas; vazia se estiver bom. */
export function validarBloco(bloco, id, [bx, by]) {
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
	if (
		!Array.isArray(bloco.vazio) ||
		bloco.vazio.length !== 3 ||
		typeof bloco.vazio[0] !== "string" ||
		!Number.isInteger(bloco.vazio[1]) ||
		!Number.isInteger(bloco.vazio[2])
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
				problemas.push(`camada ${nome}, entrada ${ruim}: esperado [x, y, folha, coluna, linha] com x e y de 0 a 63`);
			}
		}
	}
	return problemas;
}

/**
 * O que o bloco tem de estranho mas não impede gravar (vai em `avisos` na resposta do PUT). Hoje: o nascimento,
 * que o plugin deixa salvar sem; o gerador assume a primeira célula livre (item 28 de DUVIDAS.md).
 */
export function avisosDoBloco(bloco) {
	const avisos = [];
	const n = bloco.nascimento;
	if (n === undefined) {
		avisos.push("o bloco não tem nascimento: o gerador põe o jogador na primeira célula livre (ou em [0, 0]); marque o nascimento no editor");
	} else if (!Array.isArray(n) || n.length !== 2 || !Number.isInteger(n[0]) || !Number.isInteger(n[1])) {
		avisos.push(`nascimento precisa ser [x, y] com inteiros (veio ${JSON.stringify(n)}): o gerador vai usar a primeira célula livre`);
	}
	return avisos;
}

/** Garante o mapa.json do mapa e anota o bloco nele (ou o tira, com `remover`). O formato do mapa.json é palpite. */
function atualizarMapaJson(id, [bx, by], remover = false) {
	const caminho = path.join(pastaMapa(id), "mapa.json");
	const mapa = existe(caminho) ? lerJsonDoDisco(caminho) : { versao: 1, id, nome: id, blocos: [] };
	if (typeof mapa !== "object" || mapa === null || Array.isArray(mapa)) {
		throw new ErroHttp(500, `${path.relative(RAIZ, caminho)} não é um objeto JSON; conserte o arquivo`);
	}
	if (!Array.isArray(mapa.blocos)) mapa.blocos = [];
	mapa.blocos = mapa.blocos.filter((b) => Array.isArray(b) && !(b[0] === bx && b[1] === by));
	if (!remover) mapa.blocos.push([bx, by]);
	mapa.blocos.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
	gravarJson(PASTAS.mapas, caminho, mapa);
	return mapa;
}

/**
 * Põe o bloco na forma em que o importador grava e o gerador faz o hash do carimbo (GERADOR.md): o terreno do
 * exterior em 64 linhas de 64 códigos com "." para nada (o plugin manda a lista de 64 × 64 códigos com ""), as
 * listas vazias de decalques e formas de fora, um exterior sem nada de fora, e `props` de zona como objeto (o
 * JSONEncode do Roblox manda `[]` quando a zona não tem propriedades). Assim um bloco aberto no plugin e salvo sem
 * mudança continua com o mesmo carimbo. Devolve o bloco normalizado (não altera o recebido).
 */
export function normalizarBloco(bloco) {
	const saida = { ...bloco };
	if (saida.exterior && typeof saida.exterior === "object" && !Array.isArray(saida.exterior)) {
		const exterior = { ...saida.exterior };
		if (Array.isArray(exterior.terreno) && exterior.terreno.length === LADO_BLOCO * LADO_BLOCO) {
			const linhas = [];
			for (let y = 0; y < LADO_BLOCO; y++) {
				linhas.push(
					exterior.terreno
						.slice(y * LADO_BLOCO, (y + 1) * LADO_BLOCO)
						.map((c) => (typeof c === "string" && c !== "" ? c : "."))
						.join(""),
				);
			}
			exterior.terreno = linhas;
		}
		if (Array.isArray(exterior.decalques) && exterior.decalques.length === 0) delete exterior.decalques;
		if (Array.isArray(exterior.formas) && exterior.formas.length === 0) delete exterior.formas;
		const terrenoVazio = !Array.isArray(exterior.terreno) || exterior.terreno.every((linha) => /^\.*$/.test(linha));
		if (terrenoVazio && !exterior.decalques && !exterior.formas && exterior.runs_importados === undefined) delete saida.exterior;
		else saida.exterior = exterior;
	}
	if (Array.isArray(saida.zonas)) {
		saida.zonas = saida.zonas.map((z) =>
			z && typeof z === "object" && Array.isArray(z.props) && z.props.length === 0 ? { ...z, props: {} } : z,
		);
	}
	return saida;
}

export function gravarBloco(id, coordenadas, bloco) {
	const problemas = validarBloco(bloco, id, coordenadas);
	if (problemas.length > 0) throw new ErroHttp(400, `bloco inválido: ${problemas.join("; ")}`);
	const [bx, by] = coordenadas;
	const caminho = path.join(pastaMapa(id), "blocos", `${bx}_${by}.json`);
	gravarJson(PASTAS.mapas, caminho, normalizarBloco(bloco));
	const mapa = atualizarMapaJson(id, coordenadas);
	const avisos = avisosDoBloco(bloco);
	return { ok: true, arquivo: path.relative(RAIZ, caminho), mapa, ...(avisos.length > 0 ? { avisos } : {}) };
}

function apagarBloco(id, coordenadas) {
	const [bx, by] = coordenadas;
	const caminho = semLinks(PASTAS.mapas, path.join(pastaMapa(id), "blocos", `${bx}_${by}.json`));
	if (!existe(caminho)) throw new ErroHttp(404, `bloco não encontrado: ${id}/${bx}_${by}`);
	fs.unlinkSync(caminho);
	const mapa = atualizarMapaJson(id, coordenadas, true);
	return { ok: true, arquivo: path.relative(RAIZ, caminho), mapa };
}

/** Apaga a pasta inteira do mapa (blocos e mapa.json). Usado pelo autoteste do plugin para o mapa temporário. */
function apagarMapa(id) {
	const pasta = pastaMapa(id);
	if (!existe(pasta)) throw new ErroHttp(404, `mapa não encontrado: ${id}`);
	// Um link dentro da pasta (blocos/ como junção) faria o rm recursivo apagar o que está do outro lado.
	for (const entrada of fs.readdirSync(pasta, { withFileTypes: true, recursive: true })) {
		if (entrada.isSymbolicLink()) throw new ErroHttp(400, `a ponte não apaga mapa com link dentro: ${entrada.name}`);
	}
	fs.rmSync(pasta, { recursive: true, force: true });
	return { ok: true, pasta: path.relative(RAIZ, pasta) };
}

// ---------------------------------------------------------------------------------------------------------------
// Catálogo

function caminhoCatalogo(nome) {
	if (!NOME_CATALOGO.test(nome)) throw new ErroHttp(400, `nome de catálogo inválido: ${nome} (só letras minúsculas, números e _)`);
	conferirNome(nome, "nome de catálogo");
	return semLinks(PASTAS.catalogo, path.join(PASTAS.catalogo, `${nome}.json`));
}

// ---------------------------------------------------------------------------------------------------------------
// Folhas

/** Largura e altura lidas do cabeçalho IHDR, sem decodificar a imagem. */
function medirPng(caminho) {
	const fd = fs.openSync(caminho, "r");
	try {
		const cabecalho = Buffer.alloc(24);
		fs.readSync(fd, cabecalho, 0, 24, 0);
		if (cabecalho.toString("latin1", 1, 4) !== "PNG") throw new ErroHttp(500, `não é PNG: ${caminho}`);
		return { largura: cabecalho.readUInt32BE(16), altura: cabecalho.readUInt32BE(20) };
	} finally {
		fs.closeSync(fd);
	}
}

function listarFolhas() {
	if (!existe(PASTAS.folhas)) return [];
	return fs
		.readdirSync(PASTAS.folhas, { withFileTypes: true })
		// Só arquivos de verdade com nome válido: os temporários do Aseprite (".casa.salvando.png") e links ficam de fora.
		.filter((e) => e.isFile() && e.name.endsWith(".png") && NOME_ARQUIVO.test(e.name.slice(0, -4)))
		.map((e) => e.name)
		.sort()
		.map((nome) => {
			try {
				return { nome: nome.slice(0, -4), ...medirPng(path.join(PASTAS.folhas, nome)) };
			} catch (erro) {
				return { nome: nome.slice(0, -4), erro: erro.message };
			}
		});
}

/** Imagens decodificadas, pelo caminho, com a data do arquivo para reler quando ele mudar. */
const imagensDecodificadas = new Map();

function decodificarPng(caminho, nome) {
	if (!existe(caminho)) throw new ErroHttp(404, `imagem não encontrada: ${nome}`);
	const mtime = fs.statSync(caminho).mtimeMs;
	const guardada = imagensDecodificadas.get(caminho);
	if (guardada && guardada.mtime === mtime) return guardada.png;
	let png;
	try {
		png = PNG.sync.read(fs.readFileSync(caminho));
	} catch (erro) {
		throw new ErroHttp(500, `não deu para decodificar ${nome}: ${erro.message}`);
	}
	imagensDecodificadas.delete(caminho);
	imagensDecodificadas.set(caminho, { mtime, png });
	// Guarda no máximo uns 256 MB de pixels: o envio de assets pelo Studio lê o registro inteiro.
	let total = 0;
	for (const { png: p } of imagensDecodificadas.values()) total += p.data.length;
	for (const [chave, { png: p }] of imagensDecodificadas) {
		if (total <= 256 * 1024 * 1024 || chave === caminho) break;
		imagensDecodificadas.delete(chave);
		total -= p.data.length;
	}
	return png;
}

function lerFolha(nome) {
	if (!NOME_ARQUIVO.test(nome)) throw new ErroHttp(400, `nome de folha inválido: ${nome}`);
	conferirNome(nome, "nome de folha");
	return decodificarPng(semLinks(PASTAS.folhas, path.join(PASTAS.folhas, `${nome}.png`)), `folha ${nome}`);
}

/**
 * Um PNG de `assets/`, `diorama/folhas/` ou `diorama/recortes/` pelo caminho relativo à raiz sem o `.png`
 * (`assets/ui/atlas`, `diorama/folhas/casa`, `diorama/recortes/casa/chair/base`). Só essas três pastas, sem
 * `..`, sem nome reservado e sem link no caminho; o caminho é conferido depois de resolvido.
 */
function lerImagem(caminho) {
	const limpo = caminho.replaceAll("\\", "/").replace(/\.png$/i, "");
	if (!CAMINHO_IMAGEM.test(limpo)) throw new ErroHttp(400, `caminho de imagem inválido: ${caminho}`);
	for (const parte of limpo.split("/")) conferirNome(parte, "caminho de imagem");
	const absoluto = path.resolve(RAIZ, `${limpo}.png`);
	const base = PASTAS_IMAGENS.map((pasta) => path.resolve(RAIZ, pasta)).find((b) => absoluto.startsWith(b + path.sep));
	if (!base) throw new ErroHttp(400, `a ponte só serve imagens de ${PASTAS_IMAGENS.map((p) => p.replaceAll("\\", "/")).join(", ")}: ${caminho}`);
	return decodificarPng(semLinks(base, absoluto), limpo);
}

function numeroDaBusca(busca, chave, padrao) {
	const valor = busca.get(chave);
	if (valor === null || valor === "") return padrao;
	const n = Number(valor);
	if (!Number.isInteger(n) || n < 0) throw new ErroHttp(400, `${chave} precisa ser um inteiro não negativo`);
	return n;
}

/** Recorte de um PNG em RGBA cru (4 bytes por pixel, linha a linha), do jeito que o `WritePixelsBuffer` espera. */
function recortar(png, nome, busca) {
	const x = numeroDaBusca(busca, "x", 0);
	const y = numeroDaBusca(busca, "y", 0);
	if (x >= png.width || y >= png.height) {
		throw new ErroHttp(400, `recorte fora de ${nome} (${png.width}×${png.height}): x=${x} y=${y}`);
	}
	const w = numeroDaBusca(busca, "w", png.width - x);
	const h = numeroDaBusca(busca, "h", png.height - y);
	if (w === 0 || h === 0 || x + w > png.width || y + h > png.height) {
		throw new ErroHttp(400, `recorte fora de ${nome} (${png.width}×${png.height}): x=${x} y=${y} w=${w} h=${h}`);
	}
	const pixels = Buffer.alloc(w * h * 4);
	for (let linha = 0; linha < h; linha++) {
		const origem = ((y + linha) * png.width + x) * 4;
		png.data.copy(pixels, linha * w * 4, origem, origem + w * 4);
	}
	return { largura: w, altura: h, pixels };
}

function recortarFolha(nome, busca) {
	return recortar(lerFolha(nome), `folha ${nome}`, busca);
}

function recortarImagem(caminho, busca) {
	return recortar(lerImagem(caminho), caminho, busca);
}

// ---------------------------------------------------------------------------------------------------------------
// O que vem do jogo: os ids do Graal e os mapas gerados

/** Os ids (o texto antes do primeiro "|") de uma lista de textos em graalData.ts, como `GRAAL_HEADS`. */
function idsDaLista(texto, nome) {
	const inicio = texto.indexOf(`export const ${nome}`);
	if (inicio < 0) throw new ErroHttp(500, `${nome} não está em src/shared/graalData.ts`);
	const abre = texto.indexOf("[", inicio);
	const fecha = texto.indexOf("];", abre);
	if (abre < 0 || fecha < 0) throw new ErroHttp(500, `${nome}: literal sem fim em graalData.ts`);
	const ids = [];
	for (const m of texto.slice(abre, fecha).matchAll(/"([^"|]+)\|/g)) ids.push(m[1]);
	return ids;
}

/** `GET /graal/ids`: as cabeças e os corpos que o jogo conhece (src/shared/graalData.ts). */
function idsGraal() {
	if (!existe(ARQUIVO_GRAAL)) throw new ErroHttp(404, "src/shared/graalData.ts não existe");
	const texto = fs.readFileSync(ARQUIVO_GRAAL, "utf8");
	return { cabecas: idsDaLista(texto, "GRAAL_HEADS"), corpos: idsDaLista(texto, "GRAAL_BODIES") };
}

/** Os ids dos mapas com módulo gerado (os `import ... from "./<id>"` de src/shared/interiors/index.ts). */
function mapasGerados() {
	if (!existe(ARQUIVO_INTERIORS)) return [];
	const texto = fs.readFileSync(ARQUIVO_INTERIORS, "utf8");
	const ids = [];
	for (const m of texto.matchAll(/import \{ interior as map\d+ \} from "\.\/([a-z0-9_]+)";/g)) ids.push(m[1]);
	return ids;
}

// ---------------------------------------------------------------------------------------------------------------
// Geradores e scripts do npm

/**
 * Como chamar o npm: de preferência o `npm-cli.js` que vem junto do Node em uso (`process.execPath`), rodado pelo
 * próprio Node, porque o Studio e o terminal nem sempre têm o npm no PATH; senão, o `npm` do PATH.
 */
function comandoNpm() {
	const cli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
	if (existe(cli)) return { programa: process.execPath, prefixo: [cli], shell: false };
	return { programa: process.platform === "win32" ? "npm.cmd" : "npm", prefixo: [], shell: process.platform === "win32" };
}

/**
 * Os geradores rodam um de cada vez: dois `diorama:jogo` ao mesmo tempo gravariam o mesmo index.ts juntos.
 * O segundo pedido espera o primeiro terminar.
 */
let filaNpm = Promise.resolve();

/** Roda `npm run <script> -- <args>` na raiz e devolve o log inteiro (stdout e stderr misturados). */
function rodarNpm(script, args = []) {
	const vez = filaNpm.then(() => rodarNpmAgora(script, args));
	filaNpm = vez.catch(() => {});
	return vez;
}

function rodarNpmAgora(script, args) {
	return new Promise((resolve) => {
		const npm = comandoNpm();
		const comando = ["run", script, "--", ...args];
		const inicio = Date.now();
		let log = `> npm ${comando.join(" ")}\n`;
		let processo;
		try {
			processo = spawn(npm.programa, [...npm.prefixo, ...comando], { cwd: RAIZ, shell: npm.shell, windowsHide: true });
		} catch (erro) {
			resolve({ ok: false, codigo: null, log: log + `não deu para iniciar o npm: ${erro.message}\n` });
			return;
		}
		const temporizador = setTimeout(() => {
			log += `\n(interrompido depois de ${TEMPO_GERADOR / 1000} s)\n`;
			processo.kill();
		}, TEMPO_GERADOR);
		processo.stdout.on("data", (parte) => (log += parte.toString()));
		processo.stderr.on("data", (parte) => (log += parte.toString()));
		processo.on("error", (erro) => {
			clearTimeout(temporizador);
			resolve({ ok: false, codigo: null, log: log + `erro ao rodar o npm: ${erro.message}\n` });
		});
		processo.on("close", (codigo) => {
			clearTimeout(temporizador);
			const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
			if (/missing script/i.test(log)) {
				log += `\nO script "${script}" ainda não existe no package.json.\n`;
			}
			resolve({ ok: codigo === 0, codigo, log: log + `\n(saiu com código ${codigo} em ${segundos} s)\n` });
		});
	});
}

// ---------------------------------------------------------------------------------------------------------------
// Status

function pingRojo() {
	return new Promise((resolve) => {
		const pedido = http.get({ host: HOST, port: PORTA_ROJO, path: "/api/rojo", timeout: 700 }, (res) => {
			let corpo = "";
			res.setEncoding("utf8");
			res.on("data", (parte) => (corpo += parte));
			res.on("end", () => {
				let projeto;
				try {
					projeto = JSON.parse(corpo).projectName;
				} catch {
					projeto = undefined;
				}
				resolve({ ligado: res.statusCode === 200, porta: PORTA_ROJO, projeto });
			});
		});
		pedido.on("timeout", () => pedido.destroy(new Error("tempo esgotado")));
		pedido.on("error", () => resolve({ ligado: false, porta: PORTA_ROJO }));
	});
}

async function status() {
	const pastas = {};
	for (const [nome, caminho] of Object.entries(PASTAS)) {
		pastas[nome] = { caminho: path.relative(RAIZ, caminho), existe: existe(caminho) };
	}
	return {
		versao: VERSAO,
		raiz: RAIZ,
		pastas,
		rojo: await pingRojo(),
		mapas: listarMapas().length,
		folhas: listarFolhas().length,
		gerados: mapasGerados(),
		plugin: estadoPacote(),
		studios: canais.sessoesVivas(),
		aseprite: canais.estadoAseprite(),
		estilo: { script: path.relative(RAIZ, SCRIPT_ESTILO), python: comandoPython(), temporaria: PASTA_TEMPORARIA },
	};
}

// ---------------------------------------------------------------------------------------------------------------
// Docs

function listarDocs() {
	if (!existe(PASTAS.docs)) return [];
	return fs
		.readdirSync(PASTAS.docs)
		.filter((nome) => nome.endsWith(".md"))
		.sort()
		.map((nome) => nome.slice(0, -3));
}

function lerDoc(nome) {
	if (!NOME_ARQUIVO.test(nome)) throw new ErroHttp(400, `nome de documento inválido: ${nome}`);
	conferirNome(nome, "nome de documento");
	const caminho = semLinks(PASTAS.docs, path.join(PASTAS.docs, `${nome}.md`));
	if (!existe(caminho)) throw new ErroHttp(404, `documento não encontrado: ${nome}`);
	return fs.readFileSync(caminho, "utf8");
}

// ---------------------------------------------------------------------------------------------------------------
// Estilo Aeko: tools/estilo_aeko_arte.py (docs/arte/ESTILO_AEKO_ARTE.md)
//
// `POST /estilo/aeko { entrada, saida, opcoes }` e o pedido `estilo_aeko` do Aseprite (WebSocket) rodam a ferramenta
// que passa qualquer arte para o estilo aeko, equipe ou aeko+equipe. Só PNG, só dentro do repositório ou da pasta
// temporária da ponte (`<temp>/diorama-ponte`, onde a extensão do Aseprite grava o sprite), sem link no caminho; uma
// saída dentro do repositório não pode cair por cima de arquivo que já existe (na pasta temporária pode). As opções
// são uma lista fechada, traduzidas para os argumentos da linha de comando: nada do pedido vira argumento sem ser
// conferido. O Python roda com `-I`, sem shell, um de cada vez, e com tempo máximo.

/** A pasta temporária da ponte (a extensão do Aseprite pergunta por ela com o pedido `temporaria`). */
export const PASTA_TEMPORARIA = path.join(os.tmpdir(), "diorama-ponte");
/** O script mora ao lado da ponte (não em DIORAMA_RAIZ: os testes sobem a ponte numa cópia mínima). */
const SCRIPT_ESTILO = path.join(path.dirname(fileURLToPath(import.meta.url)), "estilo_aeko_arte.py");
const TEMPO_ESTILO = 180_000;
const OPCOES_ESTILO = {
	estilo: (v) => ["aeko", "equipe", "aeko+equipe"].includes(v) && ["--estilo", v],
	mistura: (v) => typeof v === "number" && v >= 0 && v <= 1 && ["--mistura", String(v)],
	fundo: (v) => typeof v === "string" && /^(auto|nenhum|#[0-9A-Fa-f]{6})$/.test(v) && ["--fundo", v],
	paleta: (v) => ["auto", "estilo", "livre", "aeko", "equipe"].includes(v) && ["--paleta", v],
	tons: (v) => Number.isInteger(v) && v >= 1 && v <= 16 && ["--tons", String(v)],
	contorno: (v) => ["externo", "todos", "nao"].includes(v) && ["--contorno", v],
	cor_contorno: (v) => ["auto", "preto", "escuro"].includes(v) && ["--cor-contorno", v],
	escala: (v) => (v === "auto" || (Number.isInteger(v) && v >= 1 && v <= 16)) && ["--escala", String(v)],
	nota_minima: (v) => typeof v === "number" && v >= 0 && v <= 10 && ["--nota-minima", String(v)],
	previa: (v) => typeof v === "boolean" && (v ? ["--previa"] : []),
};

/** O Python: DIORAMA_PYTHON, o 3.12 de %LOCALAPPDATA% (o deste PC, fora do PATH) ou o `python` do PATH. */
function comandoPython() {
	if (process.env.DIORAMA_PYTHON) return process.env.DIORAMA_PYTHON;
	const local = process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs", "Python", "Python312", "python.exe");
	if (local && existe(local)) return local;
	return process.platform === "win32" ? "python.exe" : "python3";
}

/**
 * Um caminho de PNG do pedido, conferido: relativo à raiz ou absoluto, dentro da raiz ou da pasta temporária, sem
 * `..` que escape, sem nome reservado do Windows e sem link. Devolve { absoluto, base, temporario }.
 */
function caminhoDeEstilo(valor, oQue) {
	if (typeof valor !== "string" || valor === "" || valor.includes("\0")) throw new ErroHttp(400, `${oQue} precisa ser um caminho`);
	if (!/\.png$/i.test(valor)) throw new ErroHttp(400, `${oQue} precisa ser um .png: ${valor}`);
	const absoluto = path.resolve(RAIZ, valor);
	const bases = [
		{ base: path.resolve(PASTA_TEMPORARIA), temporario: true },
		{ base: path.resolve(RAIZ), temporario: false },
	];
	const achada = bases.find(({ base }) => absoluto.startsWith(base + path.sep));
	if (!achada) throw new ErroHttp(400, `${oQue} fora do repositório e da pasta temporária da ponte: ${valor}`);
	for (const parte of path.relative(achada.base, absoluto).split(path.sep)) conferirNome(parte, oQue);
	semLinks(achada.base, absoluto);
	return { absoluto, ...achada };
}

let filaEstilo = Promise.resolve();

/** Confere o pedido e roda a ferramenta (um de cada vez). Devolve { ok, codigo, log, resumo?, saida, previa? }. */
export function aplicarEstilo(pedido) {
	if (typeof pedido !== "object" || pedido === null || Array.isArray(pedido)) throw new ErroHttp(400, "o pedido precisa ser um objeto");
	const entrada = caminhoDeEstilo(pedido.entrada, "entrada");
	const saida = caminhoDeEstilo(pedido.saida, "saida");
	if (!existe(entrada.absoluto) || !fs.statSync(entrada.absoluto).isFile()) throw new ErroHttp(404, `a entrada não existe: ${pedido.entrada}`);
	if (entrada.absoluto === saida.absoluto) throw new ErroHttp(400, "a saída não pode ser a própria entrada");
	if (!saida.temporario && existe(saida.absoluto)) {
		throw new ErroHttp(409, `a saída já existe no repositório: ${path.relative(RAIZ, saida.absoluto)} (a ponte não grava por cima)`);
	}
	const opcoes = pedido.opcoes ?? {};
	if (typeof opcoes !== "object" || opcoes === null || Array.isArray(opcoes)) throw new ErroHttp(400, "opcoes precisa ser um objeto");
	const args = [];
	for (const [chave, valor] of Object.entries(opcoes)) {
		const traduzir = OPCOES_ESTILO[chave];
		if (!traduzir) throw new ErroHttp(400, `opção desconhecida: ${chave} (valem ${Object.keys(OPCOES_ESTILO).join(", ")})`);
		const traduzido = traduzir(valor);
		if (!traduzido) throw new ErroHttp(400, `valor inválido para ${chave}: ${JSON.stringify(valor)}`);
		args.push(...traduzido);
	}
	fs.mkdirSync(path.dirname(saida.absoluto), { recursive: true });
	const vez = filaEstilo.then(() => rodarEstilo([entrada.absoluto, saida.absoluto, ...args, "--json"], saida.absoluto));
	filaEstilo = vez.catch(() => {});
	return vez;
}

function rodarEstilo(args, saida) {
	return new Promise((resolve) => {
		const python = comandoPython();
		const inicio = Date.now();
		let log = "";
		let processo;
		try {
			processo = spawn(python, ["-I", SCRIPT_ESTILO, ...args], {
				cwd: RAIZ,
				shell: false,
				windowsHide: true,
				env: { ...process.env, PYTHONIOENCODING: "utf-8", OPENBLAS_NUM_THREADS: "1" },
			});
		} catch (erro) {
			resolve({ ok: false, codigo: null, log: `não deu para iniciar o Python (${python}): ${erro.message}\n`, saida });
			return;
		}
		const temporizador = setTimeout(() => {
			log += `\n(interrompido depois de ${TEMPO_ESTILO / 1000} s)\n`;
			processo.kill();
		}, TEMPO_ESTILO);
		processo.stdout.on("data", (parte) => (log += parte.toString("utf8")));
		processo.stderr.on("data", (parte) => (log += parte.toString("utf8")));
		processo.on("error", (erro) => {
			clearTimeout(temporizador);
			resolve({ ok: false, codigo: null, log: log + `erro ao rodar o Python (${python}): ${erro.message}\n`, saida });
		});
		processo.on("close", (codigo) => {
			clearTimeout(temporizador);
			// A última linha que é um objeto JSON é o resumo (--json); o resto é o log legível.
			let resumo;
			const linhas = log.trimEnd().split(/\r?\n/);
			for (let i = linhas.length - 1; i >= 0; i--) {
				if (!linhas[i].startsWith("{")) continue;
				try {
					resumo = JSON.parse(linhas[i]);
					linhas.splice(i, 1);
				} catch {
					resumo = undefined;
				}
				break;
			}
			const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
			const resposta = { ok: codigo === 0 && existe(saida), codigo, log: `${linhas.join("\n")}\n(saiu com código ${codigo} em ${segundos} s)\n`, saida };
			if (resumo) {
				resposta.resumo = resumo;
				if (resumo.previa) resposta.previa = resumo.previa;
			}
			resolve(resposta);
		});
	});
}

// ---------------------------------------------------------------------------------------------------------------
// Pacote do plugin e canais (CONEXOES.md)

/** Pedidos que o Aseprite faz à ponte pelo WebSocket ({ tipo: "pedido", id, nome, args }). */
const pedidosAseprite = {
	temporaria: async () => {
		fs.mkdirSync(PASTA_TEMPORARIA, { recursive: true });
		return { pasta: PASTA_TEMPORARIA };
	},
	estilo_aeko: async (args) => {
		const r = await aplicarEstilo(args);
		canais.emitir("estilo_aplicado", { saida: r.saida, ok: r.ok, nota: r.resumo?.nota, origem: "aseprite" });
		return r;
	},
};

const canais = criarCanais({ ErroHttp, lerJson: lerObjeto, pedidos: pedidosAseprite });
const PROJETO_PLUGIN = path.join(RAIZ, "plugin", "default.project.json");
let observador;

/** O observador do pacote, criado no primeiro uso (para quem importa este módulo sem subir a ponte). */
function pacotes() {
	if (!observador) {
		observador = observarPacote({
			arquivoProjeto: PROJETO_PLUGIN,
			pastas: [path.join(RAIZ, "plugin", "out"), path.join(RAIZ, "plugin", "include")],
			aoMudar: (p) => {
				console.log(`[plugin] pacote ${p.versao} ${p.hash} (${p.arquivos.length} arquivos)`);
				canais.emitir("pacote_novo", { hash: p.hash, versao: p.versao });
			},
		});
	}
	return observador;
}

function estadoPacote() {
	try {
		const p = pacotes().atual();
		return { hash: p.hash, versao: p.versao, gerado_em: p.gerado_em, arquivos: p.arquivos.length };
	} catch (erro) {
		return { erro: erro.message };
	}
}

function pacoteAtual() {
	try {
		return pacotes().atual();
	} catch (erro) {
		throw new ErroHttp(503, `o pacote do plugin não está pronto: ${erro.message}`);
	}
}

// ---------------------------------------------------------------------------------------------------------------
// Rotas

/** Cada rota: método, expressão do caminho e função (grupos, pedido, busca) → { status?, json | texto | binario }. */
const ROTAS = [
	["GET", /^\/status$/, async () => ({ json: await status() })],

	[
		"GET",
		/^\/plugin\/versao$/,
		() => {
			const p = pacoteAtual();
			return { json: { hash: p.hash, gerado_em: p.gerado_em, versao: p.versao } };
		},
	],
	[
		"GET",
		/^\/plugin\/pacote$/,
		() => {
			const p = pacoteAtual();
			return { json: { hash: p.hash, versao: p.versao, arvore: p.arvore }, compacto: true };
		},
	],
	...canais.rotas,

	["GET", /^\/mapas$/, () => ({ json: listarMapas() })],
	["GET", /^\/mapas\/([^/]+)$/, ([id]) => ({ json: lerMapa(id) })],
	[
		"PUT",
		/^\/mapas\/([^/]+)\/blocos\/([^/]+)$/,
		async ([id, bloco], req) => {
			const coordenadas = lerCoordenadas(bloco);
			pastaMapa(id); // confere o id antes de ler o corpo
			const r = gravarBloco(id, coordenadas, await lerObjeto(req, "o bloco"));
			canais.emitir("mapa_gravado", { mapa: id, bloco, arquivo: r.arquivo });
			if (r.avisos) console.log(`[mapas] ${id}/${bloco}: ${r.avisos.join("; ")}`);
			return { json: r };
		},
	],
	[
		"DELETE",
		/^\/mapas\/([^/]+)\/blocos\/([^/]+)$/,
		([id, bloco]) => {
			const r = apagarBloco(id, lerCoordenadas(bloco));
			canais.emitir("mapa_gravado", { mapa: id, bloco, apagado: true });
			return { json: r };
		},
	],
	[
		"DELETE",
		/^\/mapas\/([^/]+)$/,
		([id]) => {
			const r = apagarMapa(id);
			canais.emitir("mapa_gravado", { mapa: id, apagado: true });
			return { json: r };
		},
	],

	[
		"GET",
		/^\/catalogo\/([^/]+)$/,
		([nome]) => {
			const caminho = caminhoCatalogo(nome);
			if (!existe(caminho)) throw new ErroHttp(404, `catálogo não encontrado: ${nome}`);
			return { texto: fs.readFileSync(caminho, "utf8"), tipo: "application/json; charset=utf-8" };
		},
	],
	[
		"PUT",
		/^\/catalogo\/([^/]+)$/,
		async ([nome], req) => {
			const caminho = caminhoCatalogo(nome);
			gravarJson(PASTAS.catalogo, caminho, await lerJson(req));
			return { json: { ok: true, arquivo: path.relative(RAIZ, caminho) } };
		},
	],

	["GET", /^\/folhas$/, () => ({ json: listarFolhas() })],
	[
		"GET",
		/^\/folhas\/([^/]+)\.rgba$/,
		([nome], _req, busca) => {
			const { largura, altura, pixels } = recortarFolha(nome, busca);
			return { binario: pixels, cabecalhos: { "X-Largura": String(largura), "X-Altura": String(altura) } };
		},
	],

	[
		"GET",
		/^\/imagens\/(.+)\.rgba$/,
		([caminho], _req, busca) => {
			const { largura, altura, pixels } = recortarImagem(caminho, busca);
			return { binario: pixels, cabecalhos: { "X-Largura": String(largura), "X-Altura": String(altura) } };
		},
	],

	["GET", /^\/graal\/ids$/, () => ({ json: idsGraal() })],

	[
		"POST",
		/^\/gerar\/decorar$/,
		async () => {
			const r = await rodarNpm("diorama:jogo", ["--decorar"]);
			canais.emitir("gerado", { alvo: "decorar", ok: r.ok });
			return { json: r };
		},
	],
	[
		"POST",
		/^\/gerar\/([^/]+)$/,
		async ([id]) => {
			pastaMapa(id); // só valida o id
			const r = await rodarNpm("diorama:jogo", [id]);
			canais.emitir("gerado", { alvo: id, ok: r.ok });
			return { json: r };
		},
	],

	[
		"GET",
		/^\/assets$/,
		() => {
			const caminho = semLinks(PASTAS.assets, path.join(PASTAS.assets, "registro.json"));
			if (!existe(caminho)) throw new ErroHttp(404, "assets/registro.json ainda não existe");
			return { texto: fs.readFileSync(caminho, "utf8"), tipo: "application/json; charset=utf-8" };
		},
	],
	[
		"POST",
		/^\/assets\/enviadas$/,
		async (_grupos, req) => {
			// O formato de tools/assets.mjs --importar: { "<chave, caminho ou nome do arquivo>": id }.
			const enviadas = await lerObjeto(req, 'enviadas ({ "<chave>": id })');
			const ruim = Object.entries(enviadas).find(([, id]) => typeof id !== "number" && typeof id !== "string");
			if (ruim) throw new ErroHttp(400, `enviadas: o id de "${ruim[0]}" precisa ser um número ou texto`);
			gravarJson(PASTAS.assets, path.join(PASTAS.assets, "enviadas.json"), enviadas);
			return { json: await rodarNpm("assets", ["--importar"]) };
		},
	],

	[
		"POST",
		/^\/estilo\/aeko$/,
		async (_grupos, req) => {
			const r = await aplicarEstilo(await lerObjeto(req, "o pedido ({ entrada, saida, opcoes })"));
			canais.emitir("estilo_aplicado", { saida: r.saida, ok: r.ok, nota: r.resumo?.nota });
			return { json: r };
		},
	],

	["GET", /^\/docs$/, () => ({ json: listarDocs() })],
	["GET", /^\/docs\/([^/]+)$/, ([nome]) => ({ texto: lerDoc(nome.endsWith(".md") ? nome.slice(0, -3) : nome) })],
];

// ---------------------------------------------------------------------------------------------------------------
// Quem pode falar com a ponte
//
// A ponte escuta só em 127.0.0.1, mas uma página aberta no navegador também roda no 127.0.0.1 e pode tentar
// `fetch("http://127.0.0.1:34873/...")`, um formulário que posta para cá ou `new WebSocket("ws://127.0.0.1:34873/ws")`.
// O plugin (HttpService), o MCP (fetch do Node), o curl e a extensão do Aseprite não mandam `Origin` nem
// `Sec-Fetch-Site`; o navegador manda. Então:
// - `Origin` presente e que não seja a própria ponte: recusado (403). Vale também para o WebSocket.
// - `Sec-Fetch-Site` presente e diferente de `none`/`same-origin`: recusado (pega o GET "no-cors" de <img>/<script>,
//   que não leva Origin).
// - `Host` que não seja 127.0.0.1, localhost ou [::1]: recusado (DNS rebinding: um domínio que passa a apontar para
//   127.0.0.1 chega com o próprio nome no Host).
// - POST/PUT/DELETE sem `X-Diorama: 1`, quando a exigência está ligada: recusado. Um formulário não manda cabeçalho
//   próprio, e um fetch com cabeçalho próprio faz antes o preflight OPTIONS, que a ponte recusa.

const HOSTS_LOCAIS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** Devolve o motivo da recusa, ou undefined se o pedido pode passar. `metodo` undefined: o upgrade do WebSocket. */
export function motivoRecusa(req, { exigirCabecalho = false } = {}) {
	const host = req.headers.host;
	if (host !== undefined) {
		const m = /^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/.exec(host.toLowerCase());
		if (!m || !HOSTS_LOCAIS.has(m[1])) return `Host ${JSON.stringify(host)} não é local`;
	}
	const origem = req.headers.origin;
	if (origem !== undefined) {
		let local = false;
		try {
			const u = new URL(origem);
			local = (u.protocol === "http:" || u.protocol === "ws:") && HOSTS_LOCAIS.has(u.hostname) && Number(u.port || 80) === req.socket.localPort;
		} catch {
			local = false;
		}
		if (!local) return `pedido de página web (Origin ${origem})`;
	}
	const site = req.headers["sec-fetch-site"];
	if (site !== undefined && site !== "none" && site !== "same-origin") return `pedido de página web (Sec-Fetch-Site ${site})`;
	if (req.method === "OPTIONS") return "a ponte não aceita CORS (preflight OPTIONS)";
	if (exigirCabecalho && ["POST", "PUT", "DELETE", "PATCH"].includes(req.method) && req.headers["x-diorama"] !== "1") {
		return "falta o cabeçalho X-Diorama: 1 (exigido em POST, PUT e DELETE)";
	}
	return undefined;
}

let opcoesServidor = { exigirCabecalho: EXIGIR_CABECALHO_PADRAO };

async function atender(req, res) {
	const inicio = Date.now();
	let caminho = req.url;
	let statusFinal = 200;
	let silenciosa = false;
	try {
		const recusa = motivoRecusa(req, opcoesServidor);
		if (recusa) throw new ErroHttp(403, `recusado: ${recusa}`);
		const url = new URL(req.url, `http://${HOST}`);
		try {
			caminho = decodeURIComponent(url.pathname);
		} catch {
			throw new ErroHttp(400, `caminho com % inválido: ${url.pathname}`);
		}
		if (caminho.includes("\0")) throw new ErroHttp(400, "caminho com caractere nulo");
		let rotaDoCaminho = false;
		for (const [metodo, padrao, acao] of ROTAS) {
			const m = padrao.exec(caminho);
			if (!m) continue;
			rotaDoCaminho = true;
			if (metodo !== req.method) continue;
			const resposta = await acao(m.slice(1), req, url.searchParams, res);
			statusFinal = resposta.status ?? 200;
			silenciosa = statusFinal < 400 && canais.silenciosas.some((r) => r.test(caminho));
			if (res.destroyed) return;
			if (resposta.vazio) {
				res.writeHead(statusFinal);
				res.end();
			} else if (resposta.compacto) {
				const corpo = JSON.stringify(resposta.json);
				res.writeHead(statusFinal, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(corpo) });
				res.end(corpo);
			} else if (resposta.binario) {
				res.writeHead(statusFinal, {
					"Content-Type": "application/octet-stream",
					"Content-Length": resposta.binario.length,
					...(resposta.cabecalhos ?? {}),
				});
				res.end(resposta.binario);
			} else if (resposta.texto !== undefined) {
				texto(res, statusFinal, resposta.texto, resposta.tipo);
			} else {
				json(res, statusFinal, resposta.json);
			}
			return;
		}
		throw new ErroHttp(rotaDoCaminho ? 405 : 404, rotaDoCaminho ? `método ${req.method} não vale em ${caminho}` : `rota desconhecida: ${caminho}`);
	} catch (erro) {
		statusFinal = erro instanceof ErroHttp ? erro.status : 500;
		if (statusFinal === 500) console.error(erro);
		// Corpo grande demais ou pedido recusado: fecha a conexão depois de responder (o resto do corpo não é lido).
		if (req.corpoGrande || statusFinal === 403) res.setHeader("Connection", "close");
		if (!res.headersSent && !res.destroyed) json(res, statusFinal, { erro: erro.message });
		if (statusFinal === 403) console.log(`[recusado] ${req.method} ${req.url}: ${erro.message}`);
	} finally {
		if (!silenciosa) console.log(`${req.method} ${caminho} -> ${statusFinal} (${Date.now() - inicio} ms)`);
	}
}

// ---------------------------------------------------------------------------------------------------------------
// Início

/** `exigirCabecalho`: POST/PUT/DELETE sem `X-Diorama: 1` dão 403 (padrão: EXIGIR_CABECALHO_PADRAO). */
export function criarServidor({ exigirCabecalho = EXIGIR_CABECALHO_PADRAO } = {}) {
	opcoesServidor = { exigirCabecalho };
	const servidor = http.createServer((req, res) => {
		atender(req, res).catch((erro) => {
			console.error(erro);
			if (!res.headersSent && !res.destroyed) json(res, 500, { erro: erro.message });
		});
	});
	// O keep-alive precisa durar mais que o intervalo entre os pedidos do plugin (presença a cada 5 s).
	servidor.keepAliveTimeout = 65_000;
	servidor.headersTimeout = 66_000;
	canais.aoAtualizar(servidor, (req) => motivoRecusa(req));
	return servidor;
}

/** `--plugin-watch`: roda o `rbxtsc -w` do plugin junto, com a saída prefixada por [rbxtsc]. */
function vigiarPlugin() {
	const cli = path.join(RAIZ, "node_modules", "roblox-ts", "out", "CLI", "cli.js");
	if (!existe(cli)) {
		console.error("[rbxtsc] node_modules/roblox-ts não encontrado; --plugin-watch ignorado.");
		return undefined;
	}
	const processo = spawn(process.execPath, [cli, "-w", "-p", "plugin/tsconfig.json", "--rojo", "plugin/default.project.json"], {
		cwd: RAIZ,
		windowsHide: true,
	});
	const repassar = (parte) => {
		for (const linha of parte.toString().split(/\r?\n/)) if (linha.trim() !== "") console.log(`[rbxtsc] ${linha}`);
	};
	processo.stdout.on("data", repassar);
	processo.stderr.on("data", repassar);
	processo.on("close", (codigo) => console.log(`[rbxtsc] saiu com código ${codigo}`));
	return processo;
}

function lerPorta() {
	const i = process.argv.indexOf("--porta");
	if (i === -1) return PORTA_PADRAO;
	const porta = Number(process.argv[i + 1]);
	// 0: uma porta livre qualquer (os testes usam; a porta escolhida sai na primeira linha do terminal).
	if (!Number.isInteger(porta) || porta < 0 || porta > 65535) {
		console.error("--porta precisa de um número de 0 a 65535");
		process.exit(2);
	}
	return porta;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const porta = lerPorta();
	const exigirCabecalho = process.argv.includes("--exigir-cabecalho")
		? true
		: process.argv.includes("--sem-exigir-cabecalho")
			? false
			: EXIGIR_CABECALHO_PADRAO;
	const servidor = criarServidor({ exigirCabecalho });
	servidor.on("error", (erro) => {
		if (erro.code === "EADDRINUSE") {
			console.error(`A porta ${porta} já está em uso. Outra ponte rodando? Feche-a ou use --porta.`);
		} else {
			console.error(erro);
		}
		process.exit(1);
	});
	servidor.listen(porta, HOST, () => {
		console.log(`Ponte do Diorama ${VERSAO} em http://${HOST}:${servidor.address().port} (raiz: ${RAIZ}). Ctrl+C encerra.`);
		console.log(
			exigirCabecalho
				? "POST/PUT/DELETE exigem o cabeçalho X-Diorama: 1 (--sem-exigir-cabecalho desliga)."
				: "POST/PUT/DELETE sem o cabeçalho X-Diorama passam (--exigir-cabecalho liga a exigência).",
		);
		// Monta o pacote já (o observador anuncia a versão no terminal).
		const p = estadoPacote();
		if (p.erro) console.log(`[plugin] pacote indisponível: ${p.erro}`);
	});
	const rbxtsc = process.argv.includes("--plugin-watch") ? vigiarPlugin() : undefined;
	const encerrar = () => {
		console.log("\nEncerrando a ponte.");
		rbxtsc?.kill();
		canais.fechar();
		observador?.fechar();
		servidor.close(() => process.exit(0));
		setTimeout(() => process.exit(0), 500).unref();
	};
	process.on("SIGINT", encerrar);
	process.on("SIGTERM", encerrar);
	// Um erro fora de um pedido (um socket que cai num momento ruim) não derruba a ponte: o plugin e o Aseprite
	// perderiam a conexão. Sai no terminal e a ponte segue.
	process.on("uncaughtException", (erro) => console.error("[erro não tratado]", erro));
	process.on("unhandledRejection", (erro) => console.error("[promessa rejeitada]", erro));
}
