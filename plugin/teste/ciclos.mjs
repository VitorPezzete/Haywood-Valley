// Os dois ciclos de identidade do plugin, rodados no Node sem o Studio:
//
//   1. Catálogo: diorama/catalogo/pecas.json e fundos.json → lerCatalogo/lerPeca/lerFundo (plugin/src/catalogo/
//      formato.ts) → pecaParaJson/fundoParaJson/catalogoParaJson → gravados como a ponte grava → `npm run
//      diorama:jogo -- --decorar` → src/shared/decorCatalog.ts tem de ficar igual (git status src vazio). Confere
//      também o texto das células (textoDasCelulas/celulasDoTexto) e se o JSON gravado saiu byte a byte igual.
//   2. Bloco: cada diorama/mapas/<mapa>/blocos/0_0.json → ModeloBloco.deJson (plugin/src/mapas/bloco.ts) →
//      paraJson → gravarBloco da ponte (tools/diorama_ponte.mjs, com a normalização) → `npm run diorama:jogo --
//      <mapa>` → src/shared/interiors/<mapa>.ts igual. Os arquivos tocados voltam ao que eram no fim.
//
// A lógica de (de)serialização do plugin é pura: os .ts são transpilados com o typescript da raiz (sem conferir
// tipos) para plugin/out/teste/ e carregados com um simulacro dos globais do roblox-ts (typeIs, math, pairs,
// tostring, tonumber, os métodos Lua de string e de array). Não é o Luau: serve para a lógica, não para o Studio.
//
// Uso (na raiz, com o Node no PATH): node plugin/teste/ciclos.mjs [--catalogo] [--blocos] [--mapa <id>] [--manter]
//   sem argumentos roda os dois ciclos; --manter não restaura os arquivos gravados (para olhar o diff).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SAIDA = path.join(RAIZ, "plugin", "out", "teste");
const require = createRequire(import.meta.url);
const ts = require(path.join(RAIZ, "node_modules", "typescript"));
const { gravarBloco } = await import(pathToFileURL(path.join(RAIZ, "tools", "diorama_ponte.mjs")).href);

const args = process.argv.slice(2);
const manter = args.includes("--manter");
const soMapa = args.includes("--mapa") ? args[args.indexOf("--mapa") + 1] : undefined;
const rodarCatalogo = args.includes("--catalogo") || (!args.includes("--blocos") && soMapa === undefined);
const rodarBlocos = args.includes("--blocos") || soMapa !== undefined || !args.includes("--catalogo");

// ---------------------------------------------------------------------------------------------------------------
// O simulacro do roblox-ts

function instalarSimulacro() {
	const g = globalThis;
	g.typeIs = (v, t) => {
		if (t === "table") return typeof v === "object" && v !== null;
		if (t === "nil") return v === undefined;
		return typeof v === t;
	};
	g.math = { floor: Math.floor, max: Math.max, min: Math.min, abs: Math.abs, huge: Infinity, clamp: (v, a, b) => Math.min(b, Math.max(a, v)) };
	g.pairs = (o) => Object.entries(o);
	g.ipairs = (o) => o.map((v, i) => [i + 1, v]);
	g.tostring = (v) => (v === undefined ? "nil" : String(v));
	g.tonumber = (v) => {
		if (typeof v === "number") return v;
		if (typeof v !== "string" || v.trim() === "") return undefined;
		const n = Number(v);
		return Number.isNaN(n) ? undefined : n;
	};
	g.print = (...x) => console.log(...x);
	g.warn = (...x) => console.warn(...x);
	g.error = (m) => {
		throw new Error(m);
	};
	g.Color3 = { fromRGB: (r, gg, b) => ({ r, g: gg, b }) };
	g.pcall = (f, ...a) => {
		try {
			return [true, f(...a)];
		} catch (e) {
			return [false, e];
		}
	};
	const A = Array.prototype;
	A.size = function () {
		return this.length;
	};
	A.isEmpty = function () {
		return this.length === 0;
	};
	A.remove = function (i) {
		return this.splice(i, 1)[0];
	};
	A.clear = function () {
		this.length = 0;
	};
	const sortOriginal = A.sort;
	// O comparador do roblox-ts devolve booleano (a vem antes de b), como no Lua.
	A.sort = function (cmp) {
		if (!cmp) return sortOriginal.call(this);
		return sortOriginal.call(this, (a, b) => {
			const r = cmp(a, b);
			if (typeof r === "boolean") return r ? -1 : cmp(b, a) ? 1 : 0;
			return r;
		});
	};
	const S = String.prototype;
	S.size = function () {
		return this.length;
	};
	S.sub = function (i, j) {
		const s = this.toString();
		const n = s.length;
		let a = i < 0 ? n + i + 1 : i;
		let b = j === undefined ? n : j < 0 ? n + j + 1 : j;
		a = Math.max(a, 1);
		b = Math.min(b, n);
		return a > b ? "" : s.slice(a - 1, b);
	};
	S.lower = function () {
		return this.toLowerCase();
	};
	S.upper = function () {
		return this.toUpperCase();
	};
	S.find = function (padrao, inicio = 1, simples = false) {
		const s = this.toString();
		if (!simples) throw new Error("o simulacro só tem string.find com plain = true");
		const i = s.indexOf(padrao, inicio - 1);
		return i < 0 ? [undefined] : [i + 1, i + padrao.length];
	};
	S.gsub = function (padrao, troca) {
		const re = new RegExp(luaParaRegex(padrao), "g");
		const s = this.toString();
		let n = 0;
		const saida = s.replace(re, () => {
			n++;
			return troca;
		});
		return [saida, n];
	};
	S.match = function (padrao) {
		const m = new RegExp(luaParaRegex(padrao)).exec(this.toString());
		if (!m) return [undefined];
		return m.length > 1 ? m.slice(1) : [m[0]];
	};
	// `split` já existe no JS com a mesma assinatura que o roblox-ts usa; `find`, `sub`, `gsub` e `match` não.
}

/** O bastante dos padrões Lua que o plugin usa (%s, %d, %w, classes, âncoras, %- e %.). */
function luaParaRegex(padrao) {
	return padrao.replace(/%(.)/g, (_, c) => {
		if (c === "s") return "\\s";
		if (c === "d") return "\\d";
		if (c === "w") return "[A-Za-z0-9]";
		if (c === "a") return "[A-Za-z]";
		return "\\" + c;
	});
}

/** Transpila um .ts do plugin (sem conferir tipos) para plugin/out/teste e devolve o módulo carregado. */
function carregar(relativo) {
	const origem = path.join(RAIZ, "plugin", "src", relativo);
	const destino = path.join(SAIDA, relativo.replace(/\.tsx?$/, ".js"));
	const texto = fs.readFileSync(origem, "utf8");
	const { outputText } = ts.transpileModule(texto, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
		fileName: origem,
	});
	fs.mkdirSync(path.dirname(destino), { recursive: true });
	fs.writeFileSync(destino, outputText);
	return require(destino);
}

// ---------------------------------------------------------------------------------------------------------------
// Apoio

function gitStatusSrc() {
	const r = spawnSync("git", ["status", "--porcelain", "src"], { cwd: RAIZ, encoding: "utf8" });
	return r.stdout.trim();
}

function rodarGerador(argumentos) {
	const r = spawnSync(process.execPath, [path.join(RAIZ, "tools", "diorama_jogo.mjs"), ...argumentos], { cwd: RAIZ, encoding: "utf8" });
	return { codigo: r.status, log: (r.stdout ?? "") + (r.stderr ?? "") };
}

/** Grava como a ponte grava (JSON com tabulação e quebra de linha no fim). */
function textoPonte(valor) {
	return JSON.stringify(valor, null, "\t") + "\n";
}

const restaurar = [];
function guardarParaRestaurar(caminho) {
	restaurar.push({ caminho, texto: fs.existsSync(caminho) ? fs.readFileSync(caminho, "utf8") : undefined });
}
function restaurarTudo() {
	for (const { caminho, texto } of restaurar.reverse()) {
		if (texto === undefined) fs.rmSync(caminho, { force: true });
		else fs.writeFileSync(caminho, texto);
	}
	restaurar.length = 0;
}

let falhas = 0;
function resultado(nome, ok, detalhe = "") {
	console.log(`${ok ? "ok   " : "FALHA"} ${nome}${detalhe ? `: ${detalhe}` : ""}`);
	if (!ok) falhas++;
}

// ---------------------------------------------------------------------------------------------------------------
// Ciclo 1: catálogo

function cicloCatalogo(formato) {
	console.log("\n== Ciclo 1: catálogo (pecas.json, fundos.json → plugin → --decorar)");
	const pasta = path.join(RAIZ, "diorama", "catalogo");
	const arquivos = { pecas: path.join(pasta, "pecas.json"), fundos: path.join(pasta, "fundos.json") };
	const originais = { pecas: fs.readFileSync(arquivos.pecas, "utf8"), fundos: fs.readFileSync(arquivos.fundos, "utf8") };

	const pecas = formato.lerCatalogo(JSON.parse(originais.pecas), "pecas", formato.lerPeca);
	const fundos = formato.lerCatalogo(JSON.parse(originais.fundos), "fundos", formato.lerFundo);
	resultado("pecas.json lido sem descartes", pecas.descartadas === 0, `${pecas.itens.length} peças, ${pecas.descartadas} descartadas`);
	resultado("fundos.json lido sem descartes", fundos.descartadas === 0, `${fundos.itens.length} fundos, ${fundos.descartadas} descartados`);

	// O texto das células volta igual.
	let celulas = 0;
	let diferentes = 0;
	for (const p of pecas.itens) {
		for (const f of p.decorar?.formas ?? []) {
			for (const v of f.variantes) {
				const texto = formato.textoDasCelulas(v.celulas);
				const volta = formato.celulasDoTexto(texto);
				celulas += v.celulas.length;
				if (volta.erros.length > 0 || JSON.stringify(volta.celulas.map(formato.celulaParaJson)) !== JSON.stringify(v.celulas.map(formato.celulaParaJson))) diferentes++;
			}
		}
	}
	resultado("células em texto e de volta", diferentes === 0, `${celulas} células, ${diferentes} variante(s) diferente(s)`);

	const textoPecas = textoPonte(formato.catalogoParaJson("pecas", pecas.itens.map(formato.pecaParaJson), pecas.extras, pecas.ordem));
	const textoFundos = textoPonte(formato.catalogoParaJson("fundos", fundos.itens.map(formato.fundoParaJson), fundos.extras, fundos.ordem));
	resultado("pecas.json gravado byte a byte igual", textoPecas === originais.pecas);
	resultado("fundos.json gravado byte a byte igual", textoFundos === originais.fundos);

	const antes = gitStatusSrc();
	if (antes !== "") console.log(`  (src já tinha mudanças antes do ciclo:\n${antes})`);
	guardarParaRestaurar(arquivos.pecas);
	guardarParaRestaurar(arquivos.fundos);
	fs.writeFileSync(arquivos.pecas, textoPecas);
	fs.writeFileSync(arquivos.fundos, textoFundos);
	const g = rodarGerador(["--decorar"]);
	const depois = gitStatusSrc();
	resultado("decorCatalog.ts idêntico depois de --decorar", g.codigo === 0 && depois === antes, g.codigo === 0 ? (depois === antes ? "git status src igual" : `git status src:\n${depois}`) : g.log.trim());
	if (g.codigo !== 0 || depois !== antes) {
		spawnSync("git", ["checkout", "--", "src/shared/decorCatalog.ts"], { cwd: RAIZ });
	}
	if (!manter) restaurarTudo();
}

// ---------------------------------------------------------------------------------------------------------------
// Ciclo 2: blocos

function cicloBlocos(bloco) {
	console.log("\n== Ciclo 2: blocos (0_0.json → ModeloBloco.deJson → paraJson → ponte → gerador)");
	const pastaMapas = path.join(RAIZ, "diorama", "mapas");
	const mapas = fs
		.readdirSync(pastaMapas)
		.filter((id) => fs.existsSync(path.join(pastaMapas, id, "blocos", "0_0.json")))
		.filter((id) => soMapa === undefined || id === soMapa)
		.sort();
	for (const id of mapas) {
		const caminho = path.join(pastaMapas, id, "blocos", "0_0.json");
		const caminhoMapa = path.join(pastaMapas, id, "mapa.json");
		const original = fs.readFileSync(caminho, "utf8");
		const json = JSON.parse(original);
		let modelo;
		try {
			modelo = bloco.ModeloBloco.deJson(json);
		} catch (erro) {
			resultado(`${id}: deJson`, false, erro.stack ?? String(erro));
			continue;
		}
		// O que sai do plugin passa pelo HttpService:JSONEncode do Roblox, que manda `[]` para toda tabela vazia
		// (`props: {}` vira `props: []`); a ponte tem de desfazer isso.
		const saida = comoJsonEncodeDoLuau(modelo.paraJson());
		const antes = gitStatusSrc();
		guardarParaRestaurar(caminho);
		guardarParaRestaurar(caminhoMapa);
		try {
			gravarBloco(id, [0, 0], saida);
		} catch (erro) {
			resultado(`${id}: PUT na ponte`, false, erro.message);
			restaurarTudo();
			continue;
		}
		const gravado = JSON.parse(fs.readFileSync(caminho, "utf8"));
		const mesmoConteudo = JSON.stringify(canonico(gravado)) === JSON.stringify(canonico(json));
		const g = rodarGerador([id]);
		const depois = gitStatusSrc();
		const regravou = fs.readFileSync(caminho, "utf8") !== textoPonte(gravado);
		const ok = g.codigo === 0 && depois === antes && !regravou;
		resultado(
			`${id}`,
			ok,
			ok
				? `módulo igual${mesmoConteudo ? ", bloco com o mesmo conteúdo" : ", bloco com conteúdo canônico diferente (mas o módulo saiu igual)"}`
				: g.codigo !== 0
					? g.log.trim()
					: regravou
						? "o gerador regravou o bloco (carimbo novo): o conteúdo mudou no ciclo"
						: `git status src:\n${depois}`,
		);
		if (!ok && !mesmoConteudo) console.log(`  diferença: ${primeiraDiferenca(canonico(json), canonico(gravado))}`);
		if (depois !== antes) spawnSync("git", ["checkout", "--", "src/shared/interiors"], { cwd: RAIZ });
		if (!manter) restaurarTudo();
	}
}

/** O que o JSONEncode do Roblox faz com o valor: toda tabela vazia (objeto ou lista) sai como `[]`. */
function comoJsonEncodeDoLuau(valor) {
	if (Array.isArray(valor)) return valor.map(comoJsonEncodeDoLuau);
	if (valor && typeof valor === "object") {
		const chaves = Object.keys(valor).filter((k) => valor[k] !== undefined);
		if (chaves.length === 0) return [];
		const saida = {};
		for (const k of chaves) saida[k] = comoJsonEncodeDoLuau(valor[k]);
		return saida;
	}
	return valor;
}

/** JSON canônico como o gerador faz o hash (chaves em ordem, sem carimbo e notas). */
function canonico(valor) {
	if (Array.isArray(valor)) return valor.map(canonico);
	if (valor && typeof valor === "object") {
		const saida = {};
		for (const chave of Object.keys(valor).sort()) {
			if (["carimbo", "carimbo_conteudo", "nota", "notas"].includes(chave)) continue;
			saida[chave] = canonico(valor[chave]);
		}
		return saida;
	}
	return valor;
}

function primeiraDiferenca(a, b, caminho = "") {
	if (JSON.stringify(a) === JSON.stringify(b)) return undefined;
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return `${caminho}: ${a.length} vs ${b.length} itens`;
		for (let i = 0; i < a.length; i++) {
			const d = primeiraDiferenca(a[i], b[i], `${caminho}[${i}]`);
			if (d) return d;
		}
	} else if (a && b && typeof a === "object" && typeof b === "object") {
		for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
			const d = primeiraDiferenca(a[k], b[k], `${caminho}.${k}`);
			if (d) return d;
		}
	}
	return `${caminho}: ${JSON.stringify(a)?.slice(0, 80)} vs ${JSON.stringify(b)?.slice(0, 80)}`;
}

// ---------------------------------------------------------------------------------------------------------------

instalarSimulacro();
const formato = carregar("catalogo/formato.ts");
carregar("mapas/zonas.ts");
const bloco = carregar("mapas/bloco.ts");

try {
	if (rodarCatalogo) cicloCatalogo(formato);
	if (rodarBlocos) cicloBlocos(bloco);
} finally {
	if (!manter) restaurarTudo();
}
console.log(falhas === 0 ? "\nTudo igual." : `\n${falhas} falha(s).`);
process.exitCode = falhas === 0 ? 0 : 1;
