// Um falso Claude Code para os testes da IA da ponte (tools/testes/ponte.test.mjs): a ponte o roda pelo Node quando
// DIORAMA_CLAUDE aponta para cá. Imita o `claude -p --output-format json`: lê o prompt da entrada padrão e escreve
// um objeto `{ type: "result", ... }` com `structured_output`. Anota cada chamada (argumentos, prompt, pid, se veio
// chave de API) em DIORAMA_FALSO_LOG, uma linha JSON por chamada.
//
// O que ele faz depende de marcas no prompt:
//   #explicar  responde sem proposta              #proposta  devolve uma proposta de 2 mudanças
//   #enviar    proposta, e conta que upload_image foi negado (permission_denials)
//   #dormir    dorme 60 s (tempo limite e cancelar)   #quebrar   sai com código 1 e "not logged in"
// Na fase aplicar (--resume), se a proposta tem "gravar bloco <mapa>", grava o bloco 0_0 desse mapa pela ponte
// (a porta vem do arquivo do --mcp-config), como o MCP diorama faria.

import fs from "node:fs";
import http from "node:http";

const args = process.argv.slice(2);
const valor = (nome) => {
	const i = args.indexOf(nome);
	return i >= 0 ? args[i + 1] : undefined;
};

let entrada = "";
process.stdin.setEncoding("utf8");
for await (const parte of process.stdin) entrada += parte;

const fase = args.includes("--resume") ? "aplicar" : "proposta";
const sessao = valor("--resume") ?? valor("--session-id") ?? "sem-sessao";
if (process.env.DIORAMA_FALSO_LOG) {
	fs.appendFileSync(
		process.env.DIORAMA_FALSO_LOG,
		JSON.stringify({ fase, args, entrada, pid: process.pid, chave: process.env.ANTHROPIC_API_KEY !== undefined }) + "\n",
	);
}

const sair = (estruturado, extra = {}) => {
	process.stdout.write(
		JSON.stringify({
			type: "result",
			subtype: "success",
			is_error: false,
			result: estruturado.resposta ?? "",
			session_id: sessao,
			structured_output: estruturado,
			permission_denials: [],
			...extra,
		}),
	);
	process.exit(0);
};

if (entrada.includes("#dormir") || (fase === "aplicar" && entrada.includes("dormir"))) {
	await new Promise((r) => setTimeout(r, 60_000));
}
if (entrada.includes("#quebrar")) {
	process.stderr.write("Error: not logged in. Please run /login\n");
	process.exit(1);
}

if (fase === "aplicar") {
	const m = /gravar bloco ([a-z0-9_]+)/.exec(entrada);
	if (m) {
		const config = JSON.parse(fs.readFileSync(valor("--mcp-config"), "utf8"));
		const porta = new URL(config.mcpServers.diorama.env.DIORAMA_PONTE).port;
		const bloco = JSON.stringify({ versao: 1, mapa: m[1], bloco: [0, 0], folhas: ["f"], vazio: ["f", 0, 0], camadas: { chao: [[2, 2, "f", 0, 0]] }, nascimento: [2, 2] });
		await new Promise((resolve, reject) => {
			const req = http.request(
				{ host: "127.0.0.1", port: porta, method: "PUT", path: `/mapas/${m[1]}/blocos/0_0`, headers: { "X-Diorama": "1", "Content-Type": "application/json" } },
				(res) => {
					res.resume();
					res.on("end", resolve);
				},
			);
			req.on("error", reject);
			req.end(bloco);
		});
	}
	sair({ ok: true, resposta: "Apliquei a proposta.", feito: ["bloco gravado"] });
}

if (entrada.includes("#explicar")) sair({ tipo: "resposta", resposta: "O mapa está certo." });
if (entrada.includes("#proposta") || entrada.includes("#enviar")) {
	const mapa = /"mapa": "([a-z0-9_]+)"/.exec(entrada)?.[1] ?? "x";
	sair(
		{ tipo: "proposta", resposta: "Achei o lugar.", proposta: { resumo: "Criar a zona Cozinha", mudancas: [`gravar bloco ${mapa}`, "musica=sala"] } },
		entrada.includes("#enviar") ? { permission_denials: [{ tool_name: "mcp__Roblox_Studio__upload_image", tool_input: {} }] } : {},
	);
}
sair({ tipo: "resposta", resposta: "Não entendi." });
