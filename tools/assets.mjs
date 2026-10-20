#!/usr/bin/env node
// O registro de assets do jogo: assets/registro.json → src/shared/assets.ts.
//
// Uso (na raiz do repositório):
//   npm run assets                               grava src/shared/assets.ts a partir do registro
//   npm run assets -- --importar <enviadas.json> traz ids de um JSON { "<arquivo ou chave>": <id> } para o registro
//   npm run assets -- --recuperar <pasta>        copia <pasta>/<chave>.png para o `arquivo` de cada entrada do registro
//   npm run assets -- --faltam                   lista as chaves ainda sem id
//
// Formato de assets/registro.json (formato 1):
//   {
//     "formato": 1,
//     "notas": ["..."],                       // texto livre para quem abre o arquivo
//     "assets": {                             // o que entra em assets.ts, na ordem em que fica lá
//       "<chave>": {
//         "tipo": "imagem" | "som",
//         "id": 101792482061813 | "",         // o id no Roblox (número), ou "" enquanto não foi enviado
//         "arquivo": "assets/ui/ui_atlas.png", // onde o arquivo fica no repositório (assets/, contribuidores/,
//                                             // diorama/); ausente quando ele fica fora do repositório
//         "origem": "Aseprite/draw_ui.lua",   // de onde ele sai: o script ou a pasta que o gera (texto livre;
//                                             // "Aseprite/..." é a pasta Aseprite do usuário)
//         "nota": "..."                       // opcional: licença, dúvida, histórico
//       }
//     },
//     "antigos": { ... }                      // mesmas entradas, para chaves que o jogo não usa mais; não entram
//   }                                         // em assets.ts, mas --importar e --recuperar as tratam igual
//
// As chaves `<grupo>.<n>` (graal.aeko.0, mar.infinito.3, som.passo_agua.1...) viram também uma lista em
// ASSET_LISTS[<grupo>], na ordem de n, com "" no lugar de um n que falta. Sons (som.*, musica.*) ficam só com o id.
// O arquivo gerado tem de sair idêntico ao que está no git quando o registro não muda: o cabeçalho e a
// contagem ("174 imagens e 29 sons") são calculados daqui.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRO = join(RAIZ, "assets", "registro.json");
const SAIDA = join(RAIZ, "src", "shared", "assets.ts");

function lerRegistro() {
	const registro = JSON.parse(readFileSync(REGISTRO, "utf8"));
	if (registro.formato !== 1) throw new Error(`assets/registro.json: formato ${registro.formato} desconhecido (esperado 1)`);
	registro.assets ??= {};
	registro.antigos ??= {};
	return registro;
}

/** Uma entrada por linha, para o diff do git ficar legível. */
function serializarRegistro(registro) {
	const linha = (entrada) =>
		"{ " +
		Object.entries(entrada)
			.map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)
			.join(", ") +
		" }";
	const grupo = (nome, entradas) => {
		const chaves = Object.keys(entradas);
		if (chaves.length === 0) return `  ${JSON.stringify(nome)}: {}`;
		return `  ${JSON.stringify(nome)}: {\n${chaves.map((c) => `    ${JSON.stringify(c)}: ${linha(entradas[c])}`).join(",\n")}\n  }`;
	};
	const notas = (registro.notas ?? []).map((n) => `    ${JSON.stringify(n)}`).join(",\n");
	return (
		"{\n" +
		`  "formato": 1,\n` +
		`  "notas": [\n${notas}\n  ],\n` +
		grupo("assets", registro.assets) +
		",\n" +
		grupo("antigos", registro.antigos) +
		"\n}\n"
	);
}

function gravarRegistro(registro) {
	writeFileSync(REGISTRO, serializarRegistro(registro), "utf8");
}

function idTexto(entrada) {
	return entrada.id === "" || entrada.id === undefined || entrada.id === null ? "" : `rbxassetid://${entrada.id}`;
}

/** O texto de src/shared/assets.ts para o registro. */
function gerarTs(registro) {
	const entradas = Object.entries(registro.assets);
	const imagens = entradas.filter(([, e]) => e.tipo === "imagem").length;
	const sons = entradas.filter(([, e]) => e.tipo === "som").length;
	const linhas = [];
	linhas.push("// Gerado por tools/assets.mjs a partir de assets/registro.json. Não editar: mudar o registro e rodar");
	linhas.push("// `npm run assets`. Aqui ficam só os ids; os recortes e os dados de cada folha continuam no módulo que a usa.");
	linhas.push('/** Imagem vazia de propósito (não é um asset): quem pré-carrega pula este id e o "". */');
	linhas.push('export const MISSING_IMAGE = "rbxassetid://0";');
	linhas.push(`/** O id de cada asset do registro, pela chave ("" enquanto não foi enviado): ${imagens} imagens e ${sons} sons. */`);
	linhas.push("export const ASSETS: Readonly<Record<string, string>> = {");
	for (const [chave, entrada] of entradas) linhas.push(`\t${JSON.stringify(chave)}: ${JSON.stringify(idTexto(entrada))},`);
	linhas.push("};");
	// As listas: chaves <grupo>.<n>, na ordem em que o grupo aparece pela primeira vez.
	const listas = new Map();
	for (const [chave, entrada] of entradas) {
		const m = /^(.*)\.(\d+)$/.exec(chave);
		if (!m) continue;
		if (!listas.has(m[1])) listas.set(m[1], new Map());
		listas.get(m[1]).set(Number(m[2]), idTexto(entrada));
	}
	linhas.push('/** As listas do registro (chaves `<grupo>.<n>`), na ordem de n; "" no lugar de um número que falta. */');
	linhas.push("export const ASSET_LISTS: Readonly<Record<string, readonly string[]>> = {");
	for (const [grupo, itens] of listas) {
		const maior = Math.max(...itens.keys());
		const lista = [];
		for (let n = 0; n <= maior; n++) lista.push(JSON.stringify(itens.get(n) ?? ""));
		linhas.push(`\t${JSON.stringify(grupo)}: [${lista.join(", ")}],`);
	}
	linhas.push("};");
	return linhas.join("\n") + "\n";
}

function gerar() {
	const registro = lerRegistro();
	const texto = gerarTs(registro);
	const antes = existsSync(SAIDA) ? readFileSync(SAIDA, "utf8") : undefined;
	writeFileSync(SAIDA, texto, "utf8");
	const entradas = Object.values(registro.assets);
	const semId = entradas.filter((e) => idTexto(e) === "").length;
	console.log(
		`${SAIDA}: ${entradas.length} chaves (${semId} sem id)${antes === texto ? ", sem mudança" : antes === undefined ? ", criado" : ", atualizado"}`,
	);
}

/** Todas as entradas (assets e antigos), com a chave. */
function todas(registro) {
	return [...Object.entries(registro.assets), ...Object.entries(registro.antigos)];
}

/**
 * Lê um JSON { "<arquivo ou chave>": <id> } e põe os ids no registro. O nome pode ser a chave, o caminho do
 * `arquivo` ou só o nome do arquivo (como o contribuidores/pack_aeko/enviadas.json antigo: "graal_0.png").
 * O id pode vir como número, "123" ou "rbxassetid://123".
 */
function importar(caminho) {
	const registro = lerRegistro();
	const enviadas = JSON.parse(readFileSync(caminho, "utf8"));
	const entradas = todas(registro);
	let novos = 0;
	const naoAchados = [];
	for (const [nome, valor] of Object.entries(enviadas)) {
		const id = Number(String(valor).replace(/^rbxassetid:\/\//, ""));
		if (!Number.isSafeInteger(id) || id <= 0) {
			console.warn(`  ${nome}: id inválido (${JSON.stringify(valor)}), ignorado`);
			continue;
		}
		const nomeNormal = nome.replaceAll("\\", "/");
		let candidatos = entradas.filter(([chave]) => chave === nomeNormal);
		if (candidatos.length === 0) candidatos = entradas.filter(([, e]) => e.arquivo !== undefined && e.arquivo === nomeNormal);
		if (candidatos.length === 0)
			candidatos = entradas.filter(([, e]) => e.arquivo !== undefined && basename(e.arquivo) === basename(nomeNormal));
		if (candidatos.length === 0) {
			naoAchados.push(nome);
			continue;
		}
		if (candidatos.length > 1) {
			// graal_0.png existe em pack_aeko e em pack_original: pedir a chave ou o caminho inteiro.
			console.warn(`  ${nome}: nome ambíguo (${candidatos.map(([chave]) => chave).join(", ")}), ignorado; usar a chave ou o caminho inteiro`);
			continue;
		}
		const [chave, entrada] = candidatos[0];
		if (entrada.id !== id) {
			console.log(`  ${chave}: ${entrada.id === "" ? "(sem id)" : entrada.id} → ${id}`);
			entrada.id = id;
			novos++;
		}
	}
	gravarRegistro(registro);
	console.log(`${novos} id(s) novo(s) no registro`);
	if (naoAchados.length > 0) console.warn(`sem entrada no registro: ${naoAchados.join(", ")}`);
	gerar();
}

/**
 * Copia <pasta>/<chave>.png (as imagens baixadas do Roblox, uma por chave) para o `arquivo` de cada entrada.
 * Entrada sem `arquivo` (o que fica fora do repositório) é pulada e listada.
 */
function recuperar(pasta) {
	const registro = lerRegistro();
	let copiados = 0;
	const semArquivo = [];
	const semFonte = [];
	for (const [chave, entrada] of todas(registro)) {
		if (entrada.tipo !== "imagem") continue;
		if (entrada.arquivo === undefined) {
			semArquivo.push(chave);
			continue;
		}
		const fonte = join(pasta, `${chave}.png`);
		if (!existsSync(fonte)) {
			semFonte.push(chave);
			continue;
		}
		const destino = join(RAIZ, entrada.arquivo);
		mkdirSync(dirname(destino), { recursive: true });
		copyFileSync(fonte, destino);
		copiados++;
	}
	console.log(`${copiados} imagem(ns) copiada(s) para o repositório`);
	if (semArquivo.length > 0) console.log(`fora do repositório (sem "arquivo"): ${semArquivo.join(", ")}`);
	if (semFonte.length > 0) console.warn(`sem ${basename(pasta)}/<chave>.png: ${semFonte.join(", ")}`);
}

function faltam() {
	const registro = lerRegistro();
	const chaves = Object.entries(registro.assets)
		.filter(([, e]) => idTexto(e) === "")
		.map(([chave]) => chave);
	console.log(chaves.length === 0 ? "todas as chaves têm id" : chaves.join("\n"));
}

const args = process.argv.slice(2);
if (args.length === 0) gerar();
else if (args[0] === "--importar" && args[1]) importar(resolve(args[1]));
else if (args[0] === "--recuperar" && args[1]) recuperar(resolve(args[1]));
else if (args[0] === "--faltam") faltam();
else {
	console.error("uso: node tools/assets.mjs [--importar <enviadas.json> | --recuperar <pasta> | --faltam]");
	process.exit(2);
}
