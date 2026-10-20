// O pacote do plugin Diorama para a recarga a quente (docs/diorama/CONEXOES.md, seção 1).
//
// Monta a árvore de ModuleScripts que a casca do plugin (plugin/src/index.server.ts) recria no Studio, a partir do
// mesmo `plugin/default.project.json` que o `rojo build` usa: `plugin/out` + `plugin/include` + os pacotes de
// `node_modules/@rbxts` que o projeto lista. É um resolvedor mínimo das regras do Rojo (pasta com `init.luau` vira
// ModuleScript, `*.luau`/`*.lua` vira ModuleScript, `*.server.luau` vira Script, `default.project.json` dentro de
// uma pasta é seguido, `globIgnorePaths` vale), suficiente para o que o plugin usa.
//
// A raiz da árvore é uma Folder `Diorama` com os mesmos filhos que o Script raiz do .rbxm tem (`app`,
// `ferramentas`, `rbxts_include`...); o `init.server.luau` (a casca) fica de fora. Scripts que não são
// ModuleScript também ficam de fora: a casca só monta ModuleScript e Folder.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const EXTENSOES = [".luau", ".lua"];

function globParaRegex(glob) {
	let r = "";
	for (let i = 0; i < glob.length; i++) {
		const c = glob[i];
		if (c === "*" && glob[i + 1] === "*" && glob[i + 2] === "/") {
			r += "(?:.*/)?";
			i += 2;
		} else if (c === "*" && glob[i + 1] === "*") {
			r += ".*";
			i += 1;
		} else if (c === "*") r += "[^/]*";
		else if (c === "?") r += "[^/]";
		else r += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
	}
	return new RegExp(`^${r}$`);
}

/** Classe e nome de um arquivo pelas regras do Rojo, ou undefined se o Rojo o ignora. */
function classeDoArquivo(nome) {
	for (const ext of EXTENSOES) {
		if (!nome.endsWith(ext)) continue;
		const base = nome.slice(0, -ext.length);
		if (base.endsWith(".server")) return { nome: base.slice(0, -7), classe: "Script" };
		if (base.endsWith(".client")) return { nome: base.slice(0, -7), classe: "LocalScript" };
		return { nome: base, classe: "ModuleScript" };
	}
	return undefined;
}

function lerFonte(caminho, arquivos) {
	arquivos.push(caminho);
	return fs.readFileSync(caminho, "utf8");
}

/**
 * Resolve um caminho (pasta ou arquivo) como o `$path` do Rojo. `ignorar(caminho)` diz se o caminho casa com o
 * `globIgnorePaths` do projeto.
 */
function resolverCaminho(nome, caminho, ignorar, arquivos) {
	const estat = fs.statSync(caminho);
	if (!estat.isDirectory()) {
		const c = classeDoArquivo(path.basename(caminho));
		if (!c) return undefined;
		return { nome, classe: c.classe, fonte: lerFonte(caminho, arquivos) };
	}
	const projeto = path.join(caminho, "default.project.json");
	if (fs.existsSync(projeto)) return resolverProjeto(projeto, nome, arquivos);

	const entradas = fs.readdirSync(caminho).sort();
	let no = { nome, classe: "Folder", filhos: [] };
	for (const init of ["init.luau", "init.lua", "init.server.luau", "init.server.lua", "init.client.luau", "init.client.lua"]) {
		if (!entradas.includes(init)) continue;
		const c = classeDoArquivo(init);
		no = { nome, classe: c.classe, fonte: lerFonte(path.join(caminho, init), arquivos), filhos: [] };
		break;
	}
	for (const entrada of entradas) {
		if (/^init(\.server|\.client)?\.(luau|lua)$/.test(entrada)) continue;
		const filho = path.join(caminho, entrada);
		if (ignorar(filho)) continue;
		if (fs.statSync(filho).isDirectory()) {
			const n = resolverCaminho(entrada, filho, ignorar, arquivos);
			if (n) no.filhos.push(n);
		} else {
			const c = classeDoArquivo(entrada);
			if (c) no.filhos.push({ nome: c.nome, classe: c.classe, fonte: lerFonte(filho, arquivos) });
		}
	}
	return no;
}

function resolverNo(nome, definicao, pastaProjeto, ignorar, arquivos) {
	let no;
	if (definicao.$path) {
		const caminho = path.resolve(pastaProjeto, definicao.$path);
		if (!fs.existsSync(caminho)) throw new Error(`o projeto aponta para ${caminho}, que não existe`);
		no = resolverCaminho(nome, caminho, ignorar, arquivos);
	}
	if (!no) no = { nome, classe: definicao.$className ?? "Folder", filhos: [] };
	if (!no.filhos) no.filhos = [];
	for (const [chave, valor] of Object.entries(definicao)) {
		if (chave.startsWith("$")) continue;
		const filho = resolverNo(chave, valor, pastaProjeto, ignorar, arquivos);
		no.filhos = no.filhos.filter((f) => f.nome !== chave);
		no.filhos.push(filho);
	}
	return no;
}

function resolverProjeto(arquivoProjeto, nome, arquivos) {
	const projeto = JSON.parse(fs.readFileSync(arquivoProjeto, "utf8"));
	const pasta = path.dirname(arquivoProjeto);
	const padroes = (projeto.globIgnorePaths ?? []).map(globParaRegex);
	const ignorar = (caminho) => {
		const relativo = path.relative(pasta, caminho).split(path.sep).join("/");
		return padroes.some((p) => p.test(relativo));
	};
	return resolverNo(nome ?? projeto.name, projeto.tree, pasta, ignorar, arquivos);
}

/** Tira o que a casca não monta: Scripts e LocalScripts (rodariam sozinhos) e pastas que ficaram vazias. */
function podar(no) {
	if (!no.filhos) return no;
	no.filhos = no.filhos
		.filter((f) => f.classe === "ModuleScript" || f.classe === "Folder")
		.map(podar)
		.sort((a, b) => (a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0));
	if (no.filhos.length === 0) delete no.filhos;
	return no;
}

function hashDaArvore(no) {
	const h = crypto.createHash("sha256");
	const visitar = (n, prefixo) => {
		h.update(`${prefixo}/${n.nome}\0${n.classe}\0`);
		if (n.fonte !== undefined) h.update(n.fonte);
		h.update("\0");
		for (const f of n.filhos ?? []) visitar(f, `${prefixo}/${n.nome}`);
	};
	visitar(no, "");
	return h.digest("hex").slice(0, 16);
}

/** A versão do plugin, lida do `versao.luau` compilado (o VERSAO de plugin/src/versao.ts). */
function versaoDoPacote(raiz) {
	const no = (raiz.filhos ?? []).find((f) => f.nome === "versao");
	const m = no?.fonte ? /VERSAO\s*=\s*"([^"]+)"/.exec(no.fonte) : null;
	return m ? m[1] : "?";
}

/**
 * Monta o pacote a partir do projeto do Rojo do plugin. Devolve `{ hash, versao, gerado_em, arvore, arquivos }`.
 * Lança erro se `plugin/out` ainda não foi compilado.
 */
export function montarPacote(arquivoProjeto) {
	const arquivos = [];
	const raizProjeto = resolverProjeto(arquivoProjeto, "Diorama", arquivos);
	if (raizProjeto.classe !== "Script") {
		throw new Error("a raiz do projeto do plugin não é um Script: falta plugin/out/init.server.luau (rode npm run plugin:compile)");
	}
	const arvore = podar({ nome: "Diorama", classe: "Folder", filhos: raizProjeto.filhos });
	if (!(arvore.filhos ?? []).some((f) => f.nome === "app" && f.classe === "ModuleScript")) {
		throw new Error("o pacote não tem o módulo app (plugin/out/app.luau); compile o plugin");
	}
	return { hash: hashDaArvore(arvore), versao: versaoDoPacote(arvore), gerado_em: new Date().toISOString(), arvore, arquivos };
}

/**
 * Guarda o pacote montado e o refaz quando algo muda em `pastas` (com espera de `esperaMs` depois da última
 * mudança, para pegar a compilação inteira). `aoMudar(pacote)` é chamado quando o hash muda.
 */
export function observarPacote({ arquivoProjeto, pastas, esperaMs = 300, aoMudar, log = console.log }) {
	let pacote;
	let erro;
	const refazer = () => {
		try {
			const novo = montarPacote(arquivoProjeto);
			const mudou = !pacote || novo.hash !== pacote.hash;
			pacote = novo;
			erro = undefined;
			if (mudou) aoMudar?.(pacote);
		} catch (e) {
			erro = e;
		}
	};
	refazer();
	let temporizador;
	const observadores = [];
	for (const pasta of pastas) {
		if (!fs.existsSync(pasta)) continue;
		try {
			observadores.push(
				fs.watch(pasta, { recursive: true }, (_evento, arquivo) => {
					if (arquivo && String(arquivo).endsWith(".tsbuildinfo")) return;
					clearTimeout(temporizador);
					temporizador = setTimeout(refazer, esperaMs);
				}),
			);
		} catch (e) {
			log(`[pacote] não deu para observar ${pasta}: ${e.message}; o pacote é refeito a cada pedido.`);
			observadores.push(null);
		}
	}
	const semObservador = observadores.length === 0 || observadores.includes(null);
	return {
		/** O pacote atual; lança o erro da última montagem se nunca deu certo. */
		atual() {
			if (semObservador) refazer();
			if (!pacote) throw erro ?? new Error("pacote ainda não montado");
			return pacote;
		},
		erro: () => erro,
		fechar() {
			clearTimeout(temporizador);
			for (const o of observadores) o?.close();
		},
	};
}
