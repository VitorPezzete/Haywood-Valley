// O gerador do jogo: do bloco JSON do Diorama (diorama/mapas/<mapa>/blocos/0_0.json) para o módulo
// src/shared/interiors/<mapa>.ts, refazendo index.ts; e do catálogo (diorama/catalogo) para
// src/shared/decorCatalog.ts. Como rodar e o formato: docs/diorama/GERADOR.md.
//
//   npm run diorama:jogo -- <mapa>        gera um mapa e refaz index.ts
//   npm run diorama:jogo -- --todos       gera todos os mapas de diorama/mapas que têm blocos/0_0.json
//   npm run diorama:jogo -- --decorar     regenera src/shared/decorCatalog.ts
//   npm run diorama:jogo -- --folhas      monta diorama/folhas/<folha>.png das metades <folha>_0.png e _1.png
//   npm run diorama:jogo -- --conferir    só compara com o que está em src/, sem gravar (para testar o gerador)
//
// Só escreve em src/ o que mudou. Sem a ponte: lê e grava o disco direto.
import fs from "node:fs";
import path from "node:path";
import { carimboDoBloco } from "./diorama_lib/carimbo.mjs";
import { textoDecorCatalog } from "./diorama_lib/decorar.mjs";
import { montarFolha, RAIZ } from "./diorama_lib/folhas.mjs";
import { gerarInterior, textoIndex, textoModulo } from "./diorama_lib/gerar.mjs";
import { textoJson } from "./diorama_lib/json.mjs";
import { lerInteriorTs } from "./diorama_lib/ler_ts.mjs";

const PASTA_MAPAS = path.join(RAIZ, "diorama", "mapas");
const PASTA_INTERIORS = path.join(RAIZ, "src", "shared", "interiors");
const ID = /^[a-z0-9_]+$/;

/** O fim de linha de um arquivo que existe (os módulos do jogo estão em CRLF; decorCatalog.ts em LF), ou o pedido. */
function eolDe(caminho, padrao) {
	if (!fs.existsSync(caminho)) return padrao;
	const texto = fs.readFileSync(caminho, "utf8");
	return texto.includes("\r\n") ? "\r\n" : "\n";
}

/** Grava o arquivo só se o texto mudou; devolve "igual", "novo" ou "mudou". */
function gravar(caminho, texto, conferir) {
	const existe = fs.existsSync(caminho);
	if (existe && fs.readFileSync(caminho, "utf8") === texto) return "igual";
	if (!conferir) {
		fs.mkdirSync(path.dirname(caminho), { recursive: true });
		fs.writeFileSync(caminho, texto);
	}
	return existe ? "mudou" : "novo";
}

function lerBloco(mapa) {
	if (!ID.test(mapa)) throw new Error(`id de mapa inválido: ${mapa} (letras minúsculas, números e _)`);
	const caminho = path.join(PASTA_MAPAS, mapa, "blocos", "0_0.json");
	if (!fs.existsSync(caminho)) throw new Error(`o mapa ${mapa} não tem diorama/mapas/${mapa}/blocos/0_0.json`);
	const bloco = JSON.parse(fs.readFileSync(caminho, "utf8"));
	if (bloco.mapa !== mapa) throw new Error(`${caminho}: o campo mapa é "${bloco.mapa}", esperado "${mapa}"`);
	return { bloco, caminho };
}

function mapasComBloco() {
	if (!fs.existsSync(PASTA_MAPAS)) return [];
	return fs
		.readdirSync(PASTA_MAPAS)
		.filter((nome) => ID.test(nome) && fs.existsSync(path.join(PASTA_MAPAS, nome, "blocos", "0_0.json")))
		.sort();
}

/** Os módulos da pasta src/shared/interiors (menos index.ts e types.ts): o que index.ts lista. */
function modulosDaPasta() {
	return fs
		.readdirSync(PASTA_INTERIORS)
		.filter((nome) => nome.endsWith(".ts") && nome !== "index.ts" && nome !== "types.ts")
		.map((nome) => nome.slice(0, -3))
		.sort();
}

function gerarMapa(mapa, conferir) {
	const { bloco, caminho } = lerBloco(mapa);
	const { data, avisos } = gerarInterior(bloco);
	for (const aviso of avisos) console.log(`  aviso: ${aviso}`);
	const destino = path.join(PASTA_INTERIORS, `${mapa}.ts`);
	const estado = gravar(destino, textoModulo(data, eolDe(destino, "\r\n")), conferir);
	const carimbo = carimboDoBloco(bloco);
	if (carimbo.mudou && !conferir) {
		// O conteúdo mudou desde o último carimbo: o bloco guarda o novo, e o gerado leva o mesmo.
		bloco.carimbo = carimbo.carimbo;
		bloco.carimbo_conteudo = carimbo.conteudo;
		fs.writeFileSync(caminho, textoJson(bloco));
	}
	console.log(
		`${mapa}: ${data.width} × ${data.height} em (${data.x}, ${data.y}), ${data.tiles.length} tiles na paleta` +
			(data.terrain ? `, exterior com ${data.terrain.tiles} células em ${data.terrain.runs.length} recortes` : "") +
			`, carimbo ${data.stamp}${carimbo.mudou ? " (novo)" : ""}: src/shared/interiors/${mapa}.ts ${estado}`,
	);
	return estado;
}

function refazerIndex(conferir) {
	const ids = modulosDaPasta();
	const folhas = new Set();
	for (const id of ids) {
		const data = lerInteriorTs(path.join(PASTA_INTERIORS, `${id}.ts`));
		folhas.add(data.backdrop[0]);
		for (const [folha] of data.tiles) folhas.add(folha);
	}
	const destino = path.join(PASTA_INTERIORS, "index.ts");
	const estado = gravar(destino, textoIndex(ids, folhas, eolDe(destino, "\r\n")), conferir);
	console.log(`index.ts com ${ids.length} mapas e as folhas ${[...folhas].sort().join(", ")}: ${estado}`);
	return estado;
}

function decorar(conferir) {
	const destino = path.join(RAIZ, "src", "shared", "decorCatalog.ts");
	const estado = gravar(destino, textoDecorCatalog(eolDe(destino, "\n")), conferir);
	console.log(`src/shared/decorCatalog.ts: ${estado}`);
	return estado;
}

function folhas() {
	for (const nome of ["casa", "castelo"]) console.log(`montada ${path.relative(RAIZ, montarFolha(nome))}`);
}

function main(args) {
	const conferir = args.includes("--conferir");
	const resto = args.filter((a) => a !== "--conferir");
	if (resto.length === 0) {
		console.log("uso: npm run diorama:jogo -- <mapa> | --todos | --decorar | --folhas [--conferir]");
		return 2;
	}
	const estados = [];
	for (const arg of resto) {
		if (arg === "--folhas") folhas();
		else if (arg === "--decorar") estados.push(decorar(conferir));
		else if (arg === "--todos") {
			for (const mapa of mapasComBloco()) estados.push(gerarMapa(mapa, conferir));
			estados.push(refazerIndex(conferir));
		} else {
			estados.push(gerarMapa(arg, conferir));
			estados.push(refazerIndex(conferir));
		}
	}
	if (conferir) {
		const diferentes = estados.filter((e) => e !== "igual").length;
		console.log(diferentes === 0 ? "tudo igual ao que está em src/" : `${diferentes} arquivo(s) sairiam diferentes`);
		return diferentes === 0 ? 0 : 1;
	}
	return 0;
}

try {
	process.exitCode = main(process.argv.slice(2));
} catch (erro) {
	console.error(`erro: ${erro.message}`);
	process.exitCode = 1;
}
