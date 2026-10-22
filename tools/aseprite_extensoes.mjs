// Chama o adaptador das extensões de terceiros do Aseprite (aseprite/adaptadores/extensoes.lua) em modo lote.
// Ações, opções e licenças em docs/arte/EXTENSOES_ASEPRITE.md (2026-10-22).
//
// Uso: node tools/aseprite_extensoes.mjs <ação> [arquivo.aseprite] [opções JSON | @opcoes.json]
//      node tools/aseprite_extensoes.mjs verificar
//      node tools/aseprite_extensoes.mjs dithering.preencher C:\tmp\vaca.aseprite "{\"camada\":\"sombra\",\"densidade\":5}"
//
// Escreve o resultado em JSON (código 0) ou o erro (código 1). O Aseprite é o de ASEPRITE_PATH, o do .mcp.json ou o
// da Steam; roda com -b (sem janela) e nunca mexe no Aseprite que o usuário tem aberto.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SCRIPT_RODAR = path.join(RAIZ, "aseprite", "adaptadores", "rodar.lua");
const STEAM = "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Aseprite\\Aseprite.exe";
const TEMPO_PADRAO = 300_000;

/** O executável do Aseprite: ASEPRITE_PATH, o do servidor `aseprite` no .mcp.json, ou o da Steam. */
export function caminhoAseprite() {
	if (process.env.ASEPRITE_PATH) return process.env.ASEPRITE_PATH;
	try {
		const mcp = JSON.parse(fs.readFileSync(path.join(RAIZ, ".mcp.json"), "utf8"));
		const doMcp = mcp?.mcpServers?.aseprite?.env?.ASEPRITE_PATH;
		if (doMcp) return doMcp;
	} catch {
		// sem .mcp.json: o caminho da Steam
	}
	return STEAM;
}

/**
 * Roda uma ação do adaptador. `opcoes` vai num .json temporário (no Windows, JSON na linha de comando perde as
 * aspas). Devolve { ok, resultado?, erro?, saida } — `saida` é tudo o que o Aseprite escreveu.
 */
export function rodarExtensao(acao, opcoes = {}, { tempo = TEMPO_PADRAO, aseprite = caminhoAseprite() } = {}) {
	if (typeof acao !== "string" || !/^[a-z_]+(\.[a-z_]+)?$/.test(acao)) {
		return Promise.resolve({ ok: false, erro: `ação inválida: ${acao}`, saida: "" });
	}
	if (!fs.existsSync(aseprite)) return Promise.resolve({ ok: false, erro: `Aseprite não encontrado: ${aseprite}`, saida: "" });
	const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "hv-extensoes-"));
	const arquivoOpcoes = path.join(pasta, "opcoes.json");
	fs.writeFileSync(arquivoOpcoes, JSON.stringify(opcoes ?? {}));
	const args = ["-b", "--script-param", `acao=${acao}`, "--script-param", `opcoes=${arquivoOpcoes}`, "--script", SCRIPT_RODAR];
	return new Promise((resolve) => {
		let saida = "";
		const filho = spawn(aseprite, args, { windowsHide: true });
		const relogio = setTimeout(() => filho.kill(), tempo);
		filho.stdout.on("data", (d) => (saida += d));
		filho.stderr.on("data", (d) => (saida += d));
		const fim = (erroDoProcesso) => {
			clearTimeout(relogio);
			fs.rmSync(pasta, { recursive: true, force: true });
			const linhas = saida.split(/\r?\n/);
			const res = linhas.find((l) => l.startsWith("RESULTADO "));
			const err = linhas.find((l) => l.startsWith("ERRO "));
			if (res) {
				try {
					resolve({ ok: true, resultado: JSON.parse(res.slice(10)), saida });
				} catch {
					resolve({ ok: false, erro: "o resultado não é JSON", saida });
				}
			} else {
				resolve({ ok: false, erro: err ? err.slice(5) : erroDoProcesso ?? "o Aseprite terminou sem resultado", saida });
			}
		};
		filho.on("error", (e) => fim(String(e.message ?? e)));
		filho.on("close", (codigo) => fim(codigo === null ? "tempo esgotado" : undefined));
	});
}

async function principal() {
	const [acao, ...resto] = process.argv.slice(2);
	if (!acao || acao === "--help" || acao === "-h") {
		console.log("Uso: node tools/aseprite_extensoes.mjs <ação> [arquivo.aseprite] [opções JSON | @opcoes.json]");
		console.log("Ações: node tools/aseprite_extensoes.mjs acoes   (ou veja docs/arte/EXTENSOES_ASEPRITE.md)");
		process.exit(acao ? 0 : 2);
	}
	let arquivo;
	let opcoes = {};
	for (const arg of resto) {
		if (arg.startsWith("@")) opcoes = JSON.parse(fs.readFileSync(arg.slice(1), "utf8"));
		else if (arg.trim().startsWith("{")) opcoes = JSON.parse(arg);
		else arquivo = path.resolve(arg);
	}
	if (arquivo && opcoes.arquivo === undefined) opcoes.arquivo = arquivo;
	const r = await rodarExtensao(acao, opcoes);
	if (r.ok) {
		console.log(JSON.stringify(r.resultado, null, 2));
	} else {
		console.error(`erro: ${r.erro}`);
		const resto = r.saida.split(/\r?\n/).filter((l) => l && !l.startsWith("ERRO ")).join("\n");
		if (resto) console.error(resto);
		process.exit(1);
	}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) principal();
