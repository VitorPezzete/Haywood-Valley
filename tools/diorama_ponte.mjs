// Ponte do Diorama: servidor HTTP local que dá ao plugin do Studio acesso ao disco do repositório.
// Lê e grava `diorama/` (mapas, catálogo, folhas), `assets/` e `docs/diorama/`, e roda os geradores.
// Só escuta em 127.0.0.1 e não tem autenticação. Rotas documentadas em docs/diorama/PONTE.md.
//
// Uso: npm run diorama:ponte            (ou: node tools/diorama_ponte.mjs [--porta 34873])
// Só depende do Node e do pngjs (devDependency), que decodifica as folhas para GET /folhas/<nome>.rgba.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

export const VERSAO = "0.2.0";
const HOST = "127.0.0.1";
const PORTA_PADRAO = 34873;
const PORTA_ROJO = 34872;
/** Tamanho máximo de um corpo de pedido (os blocos e catálogos são pequenos; as folhas só saem, não entram). */
const CORPO_MAXIMO = 16 * 1024 * 1024;
/** Tempo máximo de um gerador, em milissegundos. */
const TEMPO_GERADOR = 120_000;
/** Lado do bloco em células. */
const LADO_BLOCO = 64;

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PASTAS = {
	mapas: path.join(RAIZ, "diorama", "mapas"),
	catalogo: path.join(RAIZ, "diorama", "catalogo"),
	folhas: path.join(RAIZ, "diorama", "folhas"),
	assets: path.join(RAIZ, "assets"),
	docs: path.join(RAIZ, "docs", "diorama"),
};
/** As pastas de onde GET /imagens/<caminho>.rgba serve PNG (caminhos relativos à raiz). */
const PASTAS_IMAGENS = ["assets", path.join("diorama", "folhas")];
/** De onde GET /graal/ids e o `gerados` do status leem. */
const ARQUIVO_GRAAL = path.join(RAIZ, "src", "shared", "graalData.ts");
const ARQUIVO_INTERIORS = path.join(RAIZ, "src", "shared", "interiors", "index.ts");

const ID_MAPA = /^[a-z0-9_]+$/;
const NOME_ARQUIVO = /^[A-Za-z0-9_.-]+$/;
const NOME_CATALOGO = /^[a-z0-9_]+$/;
const BLOCO = /^(\d+)_(\d+)$/;
/** Um caminho de imagem: segmentos de nome de arquivo separados por "/", sem "." nem ".." como segmento. */
const CAMINHO_IMAGEM = /^(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*$/;

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

function lerCorpo(req) {
	return new Promise((resolve, reject) => {
		const partes = [];
		let tamanho = 0;
		req.on("data", (parte) => {
			tamanho += parte.length;
			if (tamanho > CORPO_MAXIMO) {
				reject(new ErroHttp(413, `corpo maior que ${CORPO_MAXIMO} bytes`));
				req.destroy();
				return;
			}
			partes.push(parte);
		});
		req.on("end", () => resolve(Buffer.concat(partes)));
		req.on("error", reject);
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

function existe(caminho) {
	try {
		fs.accessSync(caminho);
		return true;
	} catch {
		return false;
	}
}

function lerJsonDoDisco(caminho) {
	return JSON.parse(fs.readFileSync(caminho, "utf8"));
}

/** Grava JSON com tabulação, como o Prettier do repositório, e quebra de linha no fim. */
function gravarJson(caminho, valor) {
	fs.mkdirSync(path.dirname(caminho), { recursive: true });
	fs.writeFileSync(caminho, JSON.stringify(valor, null, "\t") + "\n");
}

// ---------------------------------------------------------------------------------------------------------------
// Mapas e blocos

function pastaMapa(id) {
	if (!ID_MAPA.test(id)) throw new ErroHttp(400, `id de mapa inválido: ${id} (só letras minúsculas, números e _)`);
	return path.join(PASTAS.mapas, id);
}

function lerBlocos(id) {
	const pasta = path.join(pastaMapa(id), "blocos");
	if (!existe(pasta)) return [];
	return fs
		.readdirSync(pasta)
		.filter((nome) => nome.endsWith(".json") && BLOCO.test(nome.slice(0, -5)))
		.sort()
		.map((nome) => {
			const [, bx, by] = BLOCO.exec(nome.slice(0, -5));
			return { bloco: [Number(bx), Number(by)], arquivo: nome };
		});
}

function lerMapaJson(id) {
	const caminho = path.join(pastaMapa(id), "mapa.json");
	return existe(caminho) ? lerJsonDoDisco(caminho) : null;
}

function listarMapas() {
	if (!existe(PASTAS.mapas)) return [];
	return fs
		.readdirSync(PASTAS.mapas, { withFileTypes: true })
		.filter((entrada) => entrada.isDirectory() && ID_MAPA.test(entrada.name))
		.map((entrada) => {
			const mapa = lerMapaJson(entrada.name);
			return {
				id: entrada.name,
				nome: mapa?.nome ?? entrada.name,
				blocos: lerBlocos(entrada.name).map((b) => b.bloco),
			};
		});
}

function lerMapa(id) {
	const pasta = pastaMapa(id);
	if (!existe(pasta)) throw new ErroHttp(404, `mapa não encontrado: ${id}`);
	const blocos = lerBlocos(id).map((b) => ({
		...b,
		conteudo: lerJsonDoDisco(path.join(pasta, "blocos", b.arquivo)),
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
	if (typeof bloco.camadas !== "object" || bloco.camadas === null) {
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

/** Garante o mapa.json do mapa e anota o bloco nele (ou o tira, com `remover`). O formato do mapa.json é palpite. */
function atualizarMapaJson(id, [bx, by], remover = false) {
	const caminho = path.join(pastaMapa(id), "mapa.json");
	const mapa = existe(caminho) ? lerJsonDoDisco(caminho) : { versao: 1, id, nome: id, blocos: [] };
	if (!Array.isArray(mapa.blocos)) mapa.blocos = [];
	mapa.blocos = mapa.blocos.filter((b) => !(Array.isArray(b) && b[0] === bx && b[1] === by));
	if (!remover) mapa.blocos.push([bx, by]);
	mapa.blocos.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
	gravarJson(caminho, mapa);
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
	gravarJson(caminho, normalizarBloco(bloco));
	const mapa = atualizarMapaJson(id, coordenadas);
	return { ok: true, arquivo: path.relative(RAIZ, caminho), mapa };
}

function apagarBloco(id, coordenadas) {
	const [bx, by] = coordenadas;
	const caminho = path.join(pastaMapa(id), "blocos", `${bx}_${by}.json`);
	if (!existe(caminho)) throw new ErroHttp(404, `bloco não encontrado: ${id}/${bx}_${by}`);
	fs.unlinkSync(caminho);
	const mapa = atualizarMapaJson(id, coordenadas, true);
	return { ok: true, arquivo: path.relative(RAIZ, caminho), mapa };
}

// ---------------------------------------------------------------------------------------------------------------
// Catálogo

function caminhoCatalogo(nome) {
	if (!NOME_CATALOGO.test(nome)) throw new ErroHttp(400, `nome de catálogo inválido: ${nome}`);
	return path.join(PASTAS.catalogo, `${nome}.json`);
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
		.readdirSync(PASTAS.folhas)
		.filter((nome) => nome.endsWith(".png"))
		.sort()
		.map((nome) => ({ nome: nome.slice(0, -4), ...medirPng(path.join(PASTAS.folhas, nome)) }));
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
	imagensDecodificadas.set(caminho, { mtime, png });
	return png;
}

function lerFolha(nome) {
	if (!NOME_ARQUIVO.test(nome)) throw new ErroHttp(400, `nome de folha inválido: ${nome}`);
	return decodificarPng(path.join(PASTAS.folhas, `${nome}.png`), `folha ${nome}`);
}

/**
 * Um PNG de `assets/` ou `diorama/folhas/` pelo caminho relativo à raiz sem o `.png` (`assets/ui/atlas`,
 * `diorama/folhas/casa`). Só essas duas pastas, sem `..`; o caminho é conferido depois de resolvido.
 */
function lerImagem(caminho) {
	const limpo = caminho.replaceAll("\\", "/").replace(/\.png$/i, "");
	if (!CAMINHO_IMAGEM.test(limpo)) throw new ErroHttp(400, `caminho de imagem inválido: ${caminho}`);
	const absoluto = path.resolve(RAIZ, `${limpo}.png`);
	const dentro = PASTAS_IMAGENS.some((pasta) => {
		const base = path.resolve(RAIZ, pasta) + path.sep;
		return absoluto.startsWith(base);
	});
	if (!dentro) throw new ErroHttp(400, `a ponte só serve imagens de ${PASTAS_IMAGENS.join(" e ")}: ${caminho}`);
	return decodificarPng(absoluto, limpo);
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

/** Roda `npm run <script> -- <args>` na raiz e devolve o log inteiro (stdout e stderr misturados). */
function rodarNpm(script, args = []) {
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
	const caminho = path.join(PASTAS.docs, `${nome}.md`);
	if (!existe(caminho)) throw new ErroHttp(404, `documento não encontrado: ${nome}`);
	return fs.readFileSync(caminho, "utf8");
}

// ---------------------------------------------------------------------------------------------------------------
// Rotas

/** Cada rota: método, expressão do caminho e função (grupos, pedido, busca) → { status?, json | texto | binario }. */
const ROTAS = [
	["GET", /^\/status$/, async () => ({ json: await status() })],

	["GET", /^\/mapas$/, () => ({ json: listarMapas() })],
	["GET", /^\/mapas\/([^/]+)$/, ([id]) => ({ json: lerMapa(id) })],
	[
		"PUT",
		/^\/mapas\/([^/]+)\/blocos\/([^/]+)$/,
		async ([id, bloco], req) => ({ json: gravarBloco(id, lerCoordenadas(bloco), await lerJson(req)) }),
	],
	["DELETE", /^\/mapas\/([^/]+)\/blocos\/([^/]+)$/, ([id, bloco]) => ({ json: apagarBloco(id, lerCoordenadas(bloco)) })],

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
			gravarJson(caminho, await lerJson(req));
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

	["POST", /^\/gerar\/decorar$/, async () => ({ json: await rodarNpm("diorama:jogo", ["--decorar"]) })],
	[
		"POST",
		/^\/gerar\/([^/]+)$/,
		async ([id]) => {
			pastaMapa(id); // só valida o id
			return { json: await rodarNpm("diorama:jogo", [id]) };
		},
	],

	[
		"GET",
		/^\/assets$/,
		() => {
			const caminho = path.join(PASTAS.assets, "registro.json");
			if (!existe(caminho)) throw new ErroHttp(404, "assets/registro.json ainda não existe");
			return { texto: fs.readFileSync(caminho, "utf8"), tipo: "application/json; charset=utf-8" };
		},
	],
	[
		"POST",
		/^\/assets\/enviadas$/,
		async (_grupos, req) => {
			const enviadas = await lerJson(req);
			// O formato de tools/assets.mjs --importar: { "<chave, caminho ou nome do arquivo>": id }.
			if (typeof enviadas !== "object" || enviadas === null || Array.isArray(enviadas)) {
				throw new ErroHttp(400, 'enviadas precisa ser um objeto { "<chave>": id }');
			}
			const ruim = Object.entries(enviadas).find(([, id]) => typeof id !== "number" && typeof id !== "string");
			if (ruim) throw new ErroHttp(400, `enviadas: o id de "${ruim[0]}" precisa ser um número ou texto`);
			gravarJson(path.join(PASTAS.assets, "enviadas.json"), enviadas);
			return { json: await rodarNpm("assets", ["--importar"]) };
		},
	],

	["GET", /^\/docs$/, () => ({ json: listarDocs() })],
	["GET", /^\/docs\/([^/]+)$/, ([nome]) => ({ texto: lerDoc(nome.endsWith(".md") ? nome.slice(0, -3) : nome) })],
];

async function atender(req, res) {
	const inicio = Date.now();
	const url = new URL(req.url, `http://${HOST}`);
	const caminho = decodeURIComponent(url.pathname);
	let statusFinal = 200;
	try {
		let rotaDoCaminho = false;
		for (const [metodo, padrao, acao] of ROTAS) {
			const m = padrao.exec(caminho);
			if (!m) continue;
			rotaDoCaminho = true;
			if (metodo !== req.method) continue;
			const resposta = await acao(m.slice(1), req, url.searchParams);
			statusFinal = resposta.status ?? 200;
			if (resposta.binario) {
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
		json(res, statusFinal, { erro: erro.message });
	} finally {
		console.log(`${req.method} ${caminho} -> ${statusFinal} (${Date.now() - inicio} ms)`);
	}
}

// ---------------------------------------------------------------------------------------------------------------
// Início

export function criarServidor() {
	return http.createServer((req, res) => {
		atender(req, res).catch((erro) => {
			console.error(erro);
			if (!res.headersSent) json(res, 500, { erro: erro.message });
		});
	});
}

function lerPorta() {
	const i = process.argv.indexOf("--porta");
	if (i === -1) return PORTA_PADRAO;
	const porta = Number(process.argv[i + 1]);
	if (!Number.isInteger(porta) || porta <= 0) {
		console.error("--porta precisa de um número");
		process.exit(2);
	}
	return porta;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const porta = lerPorta();
	const servidor = criarServidor();
	servidor.on("error", (erro) => {
		if (erro.code === "EADDRINUSE") {
			console.error(`A porta ${porta} já está em uso. Outra ponte rodando? Feche-a ou use --porta.`);
		} else {
			console.error(erro);
		}
		process.exit(1);
	});
	servidor.listen(porta, HOST, () => {
		console.log(`Ponte do Diorama ${VERSAO} em http://${HOST}:${porta} (raiz: ${RAIZ}). Ctrl+C encerra.`);
	});
	const encerrar = () => {
		console.log("\nEncerrando a ponte.");
		servidor.close(() => process.exit(0));
		setTimeout(() => process.exit(0), 500).unref();
	};
	process.on("SIGINT", encerrar);
	process.on("SIGTERM", encerrar);
}
