// Testes das janelas da extensão Diorama 0.5.0 (Arquivo > Diorama > Ferramentas, 2026-10-22): roda
// aseprite/testes/janelas.lua no Aseprite em lote (-b, um processo só, que termina sozinho) e transforma cada linha
// "OK <caso>" / "FALHOU <caso>: <motivo>" num teste do node:test. O script carrega o diorama.lua com um plugin e um
// Dialog de mentira (preenchem os campos e clicam nos botões) e roda cada item do menu de ponta a ponta numa cópia
// da vaca; a biblioteca é uma pasta temporária. A pasta com os PNGs ampliados aparece no diagnóstico.
//
// Uso: npm run teste:aseprite
// Aseprite: ASEPRITE_PATH, senão o do .mcp.json (servidor "aseprite"), senão o da Steam.
// A vaca: uma cópia de HV_VACA (padrão Documents\Haywood-Valley-recuperado\novas\vaca\vaca.aseprite) numa pasta
// temporária; o original nunca é aberto. Sem ela, um sprite de duas camadas faz o papel dela.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = path.join(RAIZ, "aseprite", "testes", "janelas.lua");

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
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "hv-janelas-"));
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
	if (!vaca) t.diagnostic(`sem a vaca (${vacaOriginal}): um sprite de duas camadas no lugar dela`);
	assert.equal(erroExecucao, null, `o Aseprite saiu com erro:\n${saida}`);
	assert.match(saida, /RESUMO ok=\d+ falhas=\d+/, `o script não chegou ao fim:\n${saida}`);
	for (const n of numeros) t.diagnostic(n);
	assert.ok(casos.length > 0, `nenhum caso rodou:
${saida}`);
});

for (const c of casos) {
	test(c.nome, () => {
		assert.ok(c.ok, c.motivo);
	});
}
