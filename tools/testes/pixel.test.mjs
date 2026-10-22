// Testes do RotSprite e da limpeza de linhas (aseprite/pixel/, 2026-10-22): roda aseprite/pixel/testes.lua no
// Aseprite em lote (-b) e transforma cada linha "OK <caso>" / "FALHOU <caso>: <motivo>" num teste do node:test.
// As linhas "NUM <chave> <valor>" (os números registrados no fim dos planos, docs/arte/PLANO_ROTSPRITE.md e
// PLANO_LIMPEZA_LINHAS.md) e a pasta com os PNGs ampliados aparecem no diagnóstico.
//
// Uso: npm run teste:pixel
// Aseprite: ASEPRITE_PATH, senão o do .mcp.json (servidor "aseprite"), senão o da Steam.
// A vaca: uma cópia de HV_VACA (padrão Documents\Haywood-Valley-recuperado\novas\vaca\vaca.aseprite) numa pasta
// temporária; o original nunca é aberto. Sem ela, os casos da vaca são pulados (aviso no diagnóstico).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = path.join(RAIZ, "aseprite", "pixel", "testes.lua");

function acharAseprite() {
	if (process.env.ASEPRITE_PATH && fs.existsSync(process.env.ASEPRITE_PATH)) return process.env.ASEPRITE_PATH;
	try {
		const mcp = JSON.parse(fs.readFileSync(path.join(RAIZ, ".mcp.json"), "utf8"));
		const p = mcp?.mcpServers?.aseprite?.env?.ASEPRITE_PATH;
		if (p && fs.existsSync(p)) return p;
	} catch {
		// sem .mcp.json: tenta o padrão
	}
	const steam = "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Aseprite\\Aseprite.exe";
	if (fs.existsSync(steam)) return steam;
	return null;
}

const aseprite = acharAseprite();
const vacaOriginal =
	process.env.HV_VACA ?? path.join(os.homedir(), "Documents", "Haywood-Valley-recuperado", "novas", "vaca", "vaca.aseprite");
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "hv-pixel-"));
let vaca = "";
if (fs.existsSync(vacaOriginal)) {
	vaca = path.join(pasta, "vaca.aseprite");
	fs.copyFileSync(vacaOriginal, vaca);
}

let saida = "";
let erroExecucao = null;
if (aseprite) {
	try {
		saida = execFileSync(
			aseprite,
			["-b", "--script-param", `saida=${pasta}`, "--script-param", `vaca=${vaca}`, "--script", SCRIPT],
			{ encoding: "utf8", timeout: 300_000, maxBuffer: 16 * 1024 * 1024 },
		);
	} catch (e) {
		erroExecucao = e;
		saida = `${e.stdout ?? ""}${e.stderr ?? ""}`;
	}
}

const linhas = saida.split(/\r?\n/);
const casos = [];
const numeros = [];
for (const linha of linhas) {
	let m;
	if ((m = linha.match(/^OK (.+)$/))) casos.push({ nome: m[1], ok: true });
	else if ((m = linha.match(/^FALHOU (.+?): (.*)$/))) casos.push({ nome: m[1], ok: false, motivo: m[2] });
	else if (linha.startsWith("NUM ")) numeros.push(linha.slice(4));
}

test("o Aseprite rodou os testes em lote", (t) => {
	assert.ok(aseprite, "não achei o Aseprite (ASEPRITE_PATH, .mcp.json ou a Steam)");
	t.diagnostic(`Aseprite: ${aseprite}`);
	t.diagnostic(`PNGs e cópia da vaca: ${pasta}`);
	if (!vaca) t.diagnostic(`sem a vaca (${vacaOriginal}): os casos dela foram pulados`);
	assert.equal(erroExecucao, null, `o Aseprite saiu com erro:\n${saida}`);
	assert.match(saida, /RESUMO ok=\d+ falhas=\d+/, `o script não chegou ao fim:\n${saida}`);
	for (const n of numeros) t.diagnostic(n);
});

for (const c of casos) {
	test(c.nome, () => {
		assert.ok(c.ok, c.motivo);
	});
}
