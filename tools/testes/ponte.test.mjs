// Testes da ponte do Diorama (tools/diorama_ponte.mjs): sobe a ponte numa porta livre, sobre uma cópia mínima do
// repositório numa pasta temporária (DIORAMA_RAIZ), e confere as rotas, os ataques de uma página web (Origin,
// Sec-Fetch-Site, Host, cabeçalho X-Diorama), os caminhos maliciosos (.., nomes reservados do Windows, links), os
// corpos ruins, o canal do Studio (long-poll, comando órfão, dois Studios) e o do Aseprite (WebSocket).
//
// Uso: npm run teste:ponte      (ou: node --test tools/testes/ponte.test.mjs)
// Só node:test e node:assert, mais o `ws` que a ponte já usa. Não toca na ponte de 34873 nem no repositório.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const RAIZ_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PONTE = path.join(RAIZ_REPO, "tools", "diorama_ponte.mjs");
const PNG_PEQUENO = path.join(RAIZ_REPO, "diorama", "folhas", "forma_equipe_32.png");

let raiz;
let fora;
let ponte;
let porta;
let logPonte = "";

// ---------------------------------------------------------------------------------------------------------------
// Ajudantes

/** Um pedido HTTP cru (cabeçalhos sob controle: Host, Origin...). Devolve { status, cabecalhos, json, texto }. */
function pedir(metodo, caminho, { corpo, cabecalhos = {}, semX = false } = {}) {
	return new Promise((resolve, reject) => {
		const dados = corpo === undefined ? undefined : typeof corpo === "string" ? corpo : JSON.stringify(corpo);
		const headers = {
			...(!semX && metodo !== "GET" ? { "X-Diorama": "1" } : {}),
			...(dados !== undefined ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(dados) } : {}),
			...cabecalhos,
		};
		const req = http.request({ host: "127.0.0.1", port: porta, method: metodo, path: caminho, headers, agent: false }, (res) => {
			const partes = [];
			res.on("data", (p) => partes.push(p));
			res.on("end", () => {
				const texto = Buffer.concat(partes).toString("utf8");
				let json;
				try {
					json = JSON.parse(texto);
				} catch {
					json = undefined;
				}
				resolve({ status: res.statusCode, cabecalhos: res.headers, json, texto, bytes: Buffer.concat(partes) });
			});
		});
		req.on("error", reject);
		if (dados !== undefined) req.write(dados);
		req.end();
	});
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function linkDePasta(alvo, link) {
	fs.symlinkSync(alvo, link, process.platform === "win32" ? "junction" : "dir");
}

function blocoValido(id, extra = {}) {
	return {
		versao: 1,
		mapa: id,
		bloco: [0, 0],
		folhas: ["f"],
		vazio: ["f", 0, 0],
		camadas: { chao: [[1, 1, "f", 0, 0]], objeto: [], frente: [] },
		...extra,
	};
}

/** Arquivos que começam com "." numa pasta (temporários que a gravação atômica não pode deixar). */
function temporarios(pasta) {
	return fs.existsSync(pasta) ? fs.readdirSync(pasta).filter((n) => n.startsWith(".")) : [];
}

function abrirWs(caminho, opcoes = {}) {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(`ws://127.0.0.1:${porta}${caminho}`, opcoes);
		ws.once("open", () => resolve(ws));
		ws.once("unexpected-response", (_req, res) => reject(Object.assign(new Error(`upgrade recusado: ${res.statusCode}`), { status: res.statusCode })));
		ws.once("error", reject);
	});
}

function proximaMensagem(ws, filtro = () => true) {
	return new Promise((resolve) => {
		const ouvir = (dados) => {
			const msg = JSON.parse(String(dados));
			if (!filtro(msg)) return;
			ws.off("message", ouvir);
			resolve(msg);
		};
		ws.on("message", ouvir);
	});
}

// ---------------------------------------------------------------------------------------------------------------
// Subir e derrubar

before(async () => {
	raiz = fs.mkdtempSync(path.join(os.tmpdir(), "ponte-teste-"));
	fora = path.join(raiz, "_fora"); // "fora do repositório": o alvo dos links
	for (const p of ["diorama/mapas", "diorama/catalogo", "diorama/folhas", "diorama/recortes/casa/peca", "assets/ui", "docs/diorama", "_fora/blocos"]) {
		fs.mkdirSync(path.join(raiz, p), { recursive: true });
	}
	fs.copyFileSync(PNG_PEQUENO, path.join(raiz, "diorama", "folhas", "f.png"));
	fs.copyFileSync(PNG_PEQUENO, path.join(raiz, "assets", "ui", "x.png"));
	fs.copyFileSync(PNG_PEQUENO, path.join(raiz, "diorama", "recortes", "casa", "peca", "base.png"));
	fs.copyFileSync(PNG_PEQUENO, path.join(raiz, "diorama", "catalogo", "y.png"));
	fs.copyFileSync(PNG_PEQUENO, path.join(fora, "segredo.png"));
	fs.writeFileSync(path.join(fora, "segredo.md"), "segredo");
	fs.writeFileSync(path.join(fora, "blocos", "0_0.json"), JSON.stringify(blocoValido("fora")));
	fs.writeFileSync(path.join(raiz, "docs", "diorama", "A.md"), "# A\n");
	fs.writeFileSync(path.join(raiz, "assets", "registro.json"), JSON.stringify({ formato: 1, assets: {} }));
	fs.writeFileSync(path.join(raiz, "diorama", "catalogo", "zonas.json"), "{}\n");
	// Links que levam para fora: um mapa inteiro, a pasta blocos de outro mapa e uma pasta de assets.
	linkDePasta(fora, path.join(raiz, "diorama", "mapas", "mapa_link"));
	fs.mkdirSync(path.join(raiz, "diorama", "mapas", "blocos_link"));
	linkDePasta(path.join(fora, "blocos"), path.join(raiz, "diorama", "mapas", "blocos_link", "blocos"));
	linkDePasta(fora, path.join(raiz, "assets", "link"));
	// Um mapa com mapa.json quebrado não pode derrubar a lista.
	fs.mkdirSync(path.join(raiz, "diorama", "mapas", "quebrado"));
	fs.writeFileSync(path.join(raiz, "diorama", "mapas", "quebrado", "mapa.json"), "{ quebrado");

	ponte = spawn(process.execPath, [PONTE, "--porta", "0", "--exigir-cabecalho"], {
		cwd: raiz,
		env: { ...process.env, DIORAMA_RAIZ: raiz, DIORAMA_SESSAO_EXPIRA_MS: "1500" },
		stdio: ["ignore", "pipe", "pipe"],
		windowsHide: true,
	});
	ponte.stderr.on("data", (d) => (logPonte += d));
	porta = await new Promise((resolve, reject) => {
		const t = setTimeout(() => reject(new Error(`a ponte não subiu:\n${logPonte}`)), 15_000);
		ponte.stdout.on("data", (d) => {
			logPonte += d;
			const m = /em http:\/\/127\.0\.0\.1:(\d+)/.exec(logPonte);
			if (m) {
				clearTimeout(t);
				resolve(Number(m[1]));
			}
		});
		ponte.once("exit", (codigo) => reject(new Error(`a ponte saiu (${codigo}):\n${logPonte}`)));
	});
});

after(async () => {
	if (ponte && ponte.exitCode === null) {
		const saiu = new Promise((resolve) => ponte.once("exit", resolve));
		ponte.kill();
		await saiu; // no Windows a pasta não sai enquanto o processo (com cwd nela) vive
	}
	if (!raiz) return;
	// Tira os links antes (o rm recursivo não deve passar por eles).
	for (const link of [
		path.join(raiz, "diorama", "mapas", "mapa_link"),
		path.join(raiz, "diorama", "mapas", "blocos_link", "blocos"),
		path.join(raiz, "assets", "link"),
	]) {
		try {
			fs.unlinkSync(link);
		} catch {
			try {
				fs.rmdirSync(link);
			} catch {
				// já saiu
			}
		}
	}
	fs.rmSync(raiz, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------------------------------------------
// Rede e quem pode falar

test("escuta só em 127.0.0.1", async () => {
	assert.match(logPonte, /em http:\/\/127\.0\.0\.1:\d+/);
	const externos = Object.values(os.networkInterfaces())
		.flat()
		.filter((i) => i && i.family === "IPv4" && !i.internal);
	for (const { address } of externos.slice(0, 2)) {
		const erro = await new Promise((resolve) => {
			const s = net.connect({ host: address, port: porta, timeout: 2000 });
			s.once("connect", () => {
				s.destroy();
				resolve(undefined);
			});
			s.once("error", (e) => resolve(e));
			s.once("timeout", () => {
				s.destroy();
				resolve(new Error("tempo"));
			});
		});
		assert.ok(erro, `a ponte aceitou conexão em ${address}`);
	}
});

test("GET /status e rotas desconhecidas", async () => {
	const r = await pedir("GET", "/status");
	assert.equal(r.status, 200);
	assert.equal(r.json.raiz, raiz);
	assert.equal((await pedir("GET", "/nada")).status, 404);
	assert.equal((await pedir("POST", "/status")).status, 405);
	// Sem plugin/out compilado na cópia: o pacote não está pronto.
	assert.equal((await pedir("GET", "/plugin/versao")).status, 503);
});

test("página web: Origin, Sec-Fetch-Site, Host e preflight são recusados", async () => {
	assert.equal((await pedir("GET", "/status", { cabecalhos: { Origin: "https://exemplo.com" } })).status, 403);
	assert.equal((await pedir("GET", "/status", { cabecalhos: { Origin: "null" } })).status, 403);
	assert.equal((await pedir("GET", "/status", { cabecalhos: { Origin: "http://127.0.0.1:1234" } })).status, 403);
	assert.equal((await pedir("GET", "/status", { cabecalhos: { Origin: `http://127.0.0.1:${porta}` } })).status, 200);
	assert.equal((await pedir("GET", "/studio/proximo?sessao=x&espera=0", { cabecalhos: { "Sec-Fetch-Site": "cross-site" } })).status, 403);
	assert.equal((await pedir("GET", "/status", { cabecalhos: { "Sec-Fetch-Site": "same-site" } })).status, 403);
	assert.equal((await pedir("GET", "/status", { cabecalhos: { "Sec-Fetch-Site": "none" } })).status, 200);
	assert.equal((await pedir("GET", "/status", { cabecalhos: { Host: "rebind.exemplo.com" } })).status, 403);
	assert.equal((await pedir("GET", "/status", { cabecalhos: { Host: `localhost:${porta}` } })).status, 200);
	assert.equal((await pedir("OPTIONS", "/mapas/a/blocos/0_0", { cabecalhos: { Origin: "https://exemplo.com" } })).status, 403);
	assert.equal((await pedir("OPTIONS", "/catalogo/zonas")).status, 403);
});

test("POST/PUT/DELETE sem X-Diorama: 1 são recusados", async () => {
	const sem = await pedir("PUT", "/catalogo/teste", { corpo: { a: 1 }, semX: true });
	assert.equal(sem.status, 403);
	assert.match(sem.json.erro, /X-Diorama/);
	assert.equal(fs.existsSync(path.join(raiz, "diorama", "catalogo", "teste.json")), false);
	// Um formulário HTML manda text/plain sem cabeçalho próprio: recusado mesmo com corpo JSON.
	const formulario = await pedir("POST", "/studio/comandos", {
		corpo: '{"tipo":"executar_luau","args":{"codigo":"x"}}',
		semX: true,
		cabecalhos: { "Content-Type": "text/plain" },
	});
	assert.equal(formulario.status, 403);
	assert.equal((await pedir("DELETE", "/mapas/qualquer", { semX: true })).status, 403);
	assert.equal((await pedir("PUT", "/catalogo/teste", { corpo: { a: 1 } })).status, 200);
});

test("WebSocket: Origin de página web é recusado; sem Origin conecta", async () => {
	await assert.rejects(abrirWs("/ws?cliente=aseprite", { origin: "https://exemplo.com" }), (e) => e.status === 403);
	await assert.rejects(abrirWs("/ws?cliente=observador", { headers: { Host: "rebind.exemplo.com" } }), (e) => e.status === 403);
	await assert.rejects(abrirWs("/outra"), (e) => e.status === 404);
	const ws = await abrirWs("/ws?cliente=observador");
	ws.close();
});

// ---------------------------------------------------------------------------------------------------------------
// Caminhos

test("caminhos maliciosos nas rotas de arquivo", async () => {
	const casos = [
		["GET", "/mapas/..%2F..%2Fdocs"],
		["GET", "/mapas/%2e%2e"],
		["GET", "/mapas/con"],
		["GET", "/mapas/NUL"],
		["GET", "/mapas/a%5Cb"],
		["GET", "/mapas/C:%5CWindows"],
		["GET", "/catalogo/nul"],
		["GET", "/catalogo/com1"],
		["GET", "/catalogo/..%5C..%5Cassets%5Cregistro"],
		["GET", "/folhas/..%5C..%5C_fora%5Csegredo.rgba"],
		["GET", "/folhas/con.rgba"],
		["GET", "/folhas/aux.algo.rgba"],
		["GET", "/folhas/.f.rgba"],
		["GET", "/folhas/f.%20.rgba"],
		["GET", "/imagens/assets/%2E%2E/_fora/segredo.rgba"],
		["GET", "/imagens/assets/..%5C_fora%5Csegredo.rgba"],
		["GET", "/imagens/C:/Windows/x.rgba"],
		["GET", "/imagens/src/x.rgba"],
		["GET", "/imagens/assets/con.rgba"],
		["GET", "/imagens/assets/lpt1/x.rgba"],
		["GET", "/imagens/diorama/recortes/%2E%2E/catalogo/y.rgba"],
		["GET", "/imagens/diorama/recortes/..%5Ccatalogo%5Cy.rgba"],
		["GET", "/imagens/diorama/catalogo/y.rgba"],
		["GET", "/imagens/diorama/recortes/casa/nul.rgba"],
		["GET", "/docs/..%5C..%5C_fora%5Csegredo"],
		["GET", "/docs/prn"],
		["GET", "/docs/%E0%A4%A"],
		["PUT", "/mapas/con/blocos/0_0"],
		["PUT", "/mapas/a/blocos/0_0%5C..%5C..%5Cx"],
		["PUT", "/mapas/a/blocos/9999999_0"],
		["PUT", "/catalogo/nul"],
		["DELETE", "/mapas/aux"],
	];
	for (const [metodo, caminho] of casos) {
		const r = await pedir(metodo, caminho, metodo === "PUT" ? { corpo: blocoValido("a") } : {});
		assert.ok([400, 404].includes(r.status), `${metodo} ${caminho} deu ${r.status}: ${r.texto.slice(0, 200)}`);
		assert.ok(r.json?.erro, `${metodo} ${caminho} sem { erro }`); // nunca o conteúdo de um arquivo
	}
	// Nada foi criado fora das pastas, nem com nome de dispositivo.
	assert.deepEqual(fs.readdirSync(fora).sort(), ["blocos", "segredo.md", "segredo.png"]);
	assert.equal(fs.existsSync(path.join(raiz, "diorama", "catalogo", "nul.json")), false);
});

test("a ponte não segue links (junções) para fora", async () => {
	const mapa = await pedir("GET", "/mapas/mapa_link");
	assert.equal(mapa.status, 400);
	assert.match(mapa.json.erro, /link/);
	const blocos = await pedir("GET", "/mapas/blocos_link");
	assert.equal(blocos.status, 400);
	const put = await pedir("PUT", "/mapas/blocos_link/blocos/0_0", { corpo: blocoValido("blocos_link") });
	assert.equal(put.status, 400);
	const apagar = await pedir("DELETE", "/mapas/blocos_link");
	assert.equal(apagar.status, 400);
	assert.ok(fs.existsSync(path.join(fora, "blocos", "0_0.json")), "o DELETE apagou o que estava do outro lado do link");
	assert.equal((await pedir("GET", "/imagens/assets/link/segredo.rgba")).status, 400);
	// O link nem aparece como mapa na lista, e o mapa.json quebrado sai com erro sem derrubar a lista.
	const lista = await pedir("GET", "/mapas");
	assert.equal(lista.status, 200);
	assert.ok(!lista.json.some((m) => m.id === "mapa_link"));
	assert.ok(lista.json.find((m) => m.id === "quebrado")?.erro);
});

test("imagens e folhas válidas", async () => {
	const lista = await pedir("GET", "/folhas");
	assert.equal(lista.status, 200);
	assert.deepEqual(
		lista.json.map((f) => f.nome),
		["f"],
	);
	const r = await pedir("GET", "/folhas/f.rgba?x=0&y=0&w=2&h=3");
	assert.equal(r.status, 200);
	assert.equal(r.bytes.length, 2 * 3 * 4);
	assert.equal(r.cabecalhos["x-largura"], "2");
	assert.equal((await pedir("GET", "/folhas/f.rgba?x=99999")).status, 400);
	assert.equal((await pedir("GET", "/folhas/f.rgba?y=99999&h=1")).status, 400);
	assert.equal((await pedir("GET", "/folhas/f.rgba?x=1.5")).status, 400);
	assert.equal((await pedir("GET", "/imagens/assets/ui/x.rgba?w=1&h=1")).status, 200);
	// Os recortes da etapa G (diorama/recortes/<folha>/<id>/base.png e as máscaras) também.
	const recorte = await pedir("GET", "/imagens/diorama/recortes/casa/peca/base.rgba?x=0&y=0&w=2&h=2");
	assert.equal(recorte.status, 200);
	assert.equal(recorte.bytes.length, 2 * 2 * 4);
	assert.equal((await pedir("GET", "/imagens/diorama/recortes/casa/peca/parte_9.rgba")).status, 404);
	assert.equal((await pedir("GET", "/docs/A")).texto, "# A\n");
	// Um temporário largado na pasta (".f.salvando.png", do Aseprite) não aparece como folha.
	fs.copyFileSync(PNG_PEQUENO, path.join(raiz, "diorama", "folhas", ".f.salvando.png"));
	assert.deepEqual(
		(await pedir("GET", "/folhas")).json.map((f) => f.nome),
		["f"],
	);
	fs.rmSync(path.join(raiz, "diorama", "folhas", ".f.salvando.png"));
});

// ---------------------------------------------------------------------------------------------------------------
// Corpos

test("corpos ruins: JSON inválido, não objeto, grande demais, conexão que cai", async () => {
	const invalido = await pedir("PUT", "/catalogo/teste", { corpo: "{ nao" });
	assert.equal(invalido.status, 400);
	assert.match(invalido.json.erro, /JSON inválido/);
	assert.equal((await pedir("PUT", "/mapas/a/blocos/0_0", { corpo: "[]" })).status, 400);
	assert.equal((await pedir("POST", "/studio/comandos", { corpo: "null" })).status, 400);
	assert.equal((await pedir("POST", "/studio/presenca", { corpo: "7" })).status, 400);
	assert.equal((await pedir("POST", "/aseprite/comandos", { corpo: '"ping"' })).status, 400);
	assert.equal((await pedir("POST", "/assets/enviadas", { corpo: "[1]" })).status, 400);
	assert.equal((await pedir("POST", "/studio/comandos", { corpo: { tipo: "ping", args: [1] } })).status, 400);

	// Content-Length acima de 16 MB: 413 sem ler o corpo.
	const declarado = await new Promise((resolve, reject) => {
		const req = http.request(
			{
				host: "127.0.0.1",
				port: porta,
				method: "PUT",
				path: "/catalogo/grande",
				headers: { "X-Diorama": "1", "Content-Type": "application/json", "Content-Length": 17 * 1024 * 1024 },
				agent: false,
			},
			(res) => {
				res.resume();
				resolve(res.statusCode);
				req.destroy();
			},
		);
		req.on("error", () => {});
		req.write("{");
		setTimeout(() => reject(new Error("sem resposta ao corpo grande")), 5000);
	});
	assert.equal(declarado, 413);

	// Corpo em pedaços passando de 16 MB: 413 também.
	const emPedacos = await new Promise((resolve) => {
		const req = http.request(
			{ host: "127.0.0.1", port: porta, method: "PUT", path: "/catalogo/grande", headers: { "X-Diorama": "1" }, agent: false },
			(res) => {
				res.resume();
				resolve(res.statusCode);
			},
		);
		req.on("error", () => resolve("erro"));
		const pedaco = Buffer.alloc(1024 * 1024, 0x20);
		for (let i = 0; i < 17; i++) req.write(pedaco);
		req.end();
	});
	assert.equal(emPedacos, 413);
	assert.equal(fs.existsSync(path.join(raiz, "diorama", "catalogo", "grande.json")), false);

	// Conexão que cai no meio do corpo: a ponte segue no ar.
	await new Promise((resolve) => {
		const req = http.request({
			host: "127.0.0.1",
			port: porta,
			method: "PUT",
			path: "/catalogo/caiu",
			headers: { "X-Diorama": "1", "Content-Length": 1000 },
			agent: false,
		});
		req.on("error", () => resolve());
		req.write('{"a":');
		setTimeout(() => {
			req.destroy();
			resolve();
		}, 100);
	});
	await esperar(100);
	assert.equal((await pedir("GET", "/status")).status, 200);
	assert.equal(fs.existsSync(path.join(raiz, "diorama", "catalogo", "caiu.json")), false);
});

// ---------------------------------------------------------------------------------------------------------------
// Mapas e catálogo

test("bloco: grava de uma vez, avisa sem nascimento, apaga", async () => {
	const pastaBlocos = path.join(raiz, "diorama", "mapas", "teste_a", "blocos");
	const r = await pedir("PUT", "/mapas/teste_a/blocos/0_0", { corpo: blocoValido("teste_a") });
	assert.equal(r.status, 200, r.texto);
	assert.ok(r.json.avisos?.some((a) => /nascimento/.test(a)), "sem aviso de nascimento");
	assert.deepEqual(r.json.mapa.blocos, [[0, 0]]);
	assert.deepEqual(temporarios(pastaBlocos), []);
	assert.deepEqual(temporarios(path.dirname(pastaBlocos)), []);

	const com = await pedir("PUT", "/mapas/teste_a/blocos/0_0", { corpo: blocoValido("teste_a", { nascimento: [1, 1] }) });
	assert.equal(com.status, 200);
	assert.equal(com.json.avisos, undefined);
	const ruim = await pedir("PUT", "/mapas/teste_a/blocos/0_0", { corpo: blocoValido("teste_a", { nascimento: "x" }) });
	assert.ok(ruim.json.avisos?.length === 1);

	const errado = await pedir("PUT", "/mapas/teste_a/blocos/1_0", { corpo: blocoValido("teste_a") });
	assert.equal(errado.status, 400);
	assert.match(errado.json.erro, /bloco precisa ser \[1, 0\]/);
	const camadasLista = await pedir("PUT", "/mapas/teste_a/blocos/0_0", { corpo: blocoValido("teste_a", { camadas: [] }) });
	assert.equal(camadasLista.status, 400);

	const lido = await pedir("GET", "/mapas/teste_a");
	assert.equal(lido.status, 200);
	assert.equal(lido.json.blocos[0].conteudo.nascimento, "x");

	assert.equal((await pedir("DELETE", "/mapas/teste_a/blocos/0_0")).status, 200);
	assert.equal((await pedir("DELETE", "/mapas/teste_a/blocos/0_0")).status, 404);
	assert.equal((await pedir("DELETE", "/mapas/teste_a")).status, 200);
	assert.equal(fs.existsSync(path.join(raiz, "diorama", "mapas", "teste_a")), false);
});

test("catálogo: ida e volta, sem temporários", async () => {
	const r = await pedir("PUT", "/catalogo/fundos", { corpo: { versao: 1, fundos: [] } });
	assert.equal(r.status, 200);
	assert.equal(fs.readFileSync(path.join(raiz, "diorama", "catalogo", "fundos.json"), "utf8"), '{\n\t"versao": 1,\n\t"fundos": []\n}\n');
	assert.deepEqual(JSON.parse((await pedir("GET", "/catalogo/fundos")).texto), { versao: 1, fundos: [] });
	assert.deepEqual(temporarios(path.join(raiz, "diorama", "catalogo")), []);
	assert.equal((await pedir("GET", "/catalogo/naoexiste")).status, 404);
});

// ---------------------------------------------------------------------------------------------------------------
// Canal do Studio

async function presenca(sessao, modo = "edicao") {
	const r = await pedir("POST", "/studio/presenca", { corpo: { sessao, place: `place_${sessao}`, placeId: 0, versao: "t", modo } });
	assert.equal(r.status, 200);
}

test("Studio: comando, long-poll, resposta, devolver", async () => {
	assert.equal((await pedir("POST", "/studio/comandos", { corpo: { tipo: "ping", sessao: "nao_existe" } })).status, 503);
	await presenca("s1");
	const enviado = await pedir("POST", "/studio/comandos", { corpo: { tipo: "ping", args: { a: 1 } } });
	assert.equal(enviado.status, 200);
	const id = enviado.json.id;
	const pendente = await pedir("GET", `/studio/respostas/${id}?espera=0`);
	assert.equal(pendente.status, 202);
	assert.equal(pendente.json.entregue, false);

	const buscado = await pedir("GET", "/studio/proximo?sessao=s1&espera=1");
	assert.equal(buscado.status, 200);
	assert.equal(buscado.json.id, id);
	// Devolvido (o pacote parou): volta para a frente da fila.
	assert.equal((await pedir("POST", `/studio/respostas/${id}`, { corpo: { devolver: true } })).json.devolvido, true);
	assert.equal((await pedir("GET", "/studio/proximo?sessao=s1&espera=1")).json.id, id);
	await pedir("POST", `/studio/respostas/${id}`, { corpo: { ok: true, valor: { pong: 1 } } });
	const resposta = await pedir("GET", `/studio/respostas/${id}?espera=1`);
	assert.deepEqual(resposta.json, { ok: true, valor: { pong: 1 } });
	assert.equal((await pedir("GET", "/studio/respostas/c99999")).status, 404);
	// Sem comando: 204 depois da espera.
	assert.equal((await pedir("GET", "/studio/proximo?sessao=s1&espera=0")).status, 204);
});

test("Studio: long-poll que cai não perde o comando", async () => {
	await presenca("s_cai");
	await new Promise((resolve) => {
		const req = http.request({ host: "127.0.0.1", port: porta, path: "/studio/proximo?sessao=s_cai&espera=10", agent: false });
		req.on("error", () => resolve());
		req.end();
		setTimeout(() => {
			req.destroy();
			resolve();
		}, 200);
	});
	await esperar(100);
	const { json } = await pedir("POST", "/studio/comandos", { corpo: { tipo: "estado", sessao: "s_cai" } });
	const buscado = await pedir("GET", "/studio/proximo?sessao=s_cai&espera=2");
	assert.equal(buscado.status, 200);
	assert.equal(buscado.json.id, json.id);
	await pedir("POST", `/studio/respostas/${json.id}`, { corpo: { ok: true, valor: null } });
});

test("Studio: dois Studios, cada comando vai para a sessão certa", async () => {
	await presenca("s_a");
	await esperar(20);
	await presenca("s_b");
	const paraA = await pedir("POST", "/studio/comandos", { corpo: { tipo: "ping", sessao: "s_a" } });
	assert.equal(paraA.json.sessao, "s_a");
	const semSessao = await pedir("POST", "/studio/comandos", { corpo: { tipo: "ping" } });
	assert.notEqual(semSessao.json.sessao, "s_a"); // a mais recente em edição
	assert.equal((await pedir("GET", "/studio/proximo?sessao=s_a&espera=1")).json.id, paraA.json.id);
	const doOutro = await pedir("GET", `/studio/proximo?sessao=${semSessao.json.sessao}&espera=1`);
	assert.equal(doOutro.json.id, semSessao.json.id);
	for (const id of [paraA.json.id, semSessao.json.id]) await pedir("POST", `/studio/respostas/${id}`, { corpo: { ok: true } });
});

test("Studio: comando órfão (o plugin some depois de receber) falha com mensagem clara", { timeout: 15_000 }, async () => {
	await presenca("s_orfa");
	const { json } = await pedir("POST", "/studio/comandos", { corpo: { tipo: "autoteste", sessao: "s_orfa" } });
	assert.equal((await pedir("GET", "/studio/proximo?sessao=s_orfa&espera=1")).json.id, json.id);
	// Nenhuma presença depois disso: a sessão expira (1,5 s nos testes) e a limpeza (a cada 2 s) falha o comando.
	const resposta = await pedir("GET", `/studio/respostas/${json.id}?espera=8`);
	assert.equal(resposta.status, 200);
	assert.equal(resposta.json.ok, false);
	assert.match(resposta.json.erro, /saiu depois de receber o comando/);
	// E um comando que ninguém buscou, numa sessão que sai, também.
	await presenca("s_orfa2");
	const { json: j2 } = await pedir("POST", "/studio/comandos", { corpo: { tipo: "ping", sessao: "s_orfa2" } });
	const r2 = await pedir("GET", `/studio/respostas/${j2.id}?espera=8`);
	assert.match(r2.json.erro, /saiu antes de buscar/);
});

// ---------------------------------------------------------------------------------------------------------------
// Canal do Aseprite e eventos

test("Aseprite: ola, comando, evento folha_salva repassado ao Studio", { timeout: 15_000 }, async () => {
	assert.equal((await pedir("POST", "/aseprite/comandos", { corpo: { nome: "ping" } })).status, 503);
	const ws = await abrirWs("/ws?cliente=aseprite");
	ws.send(JSON.stringify({ tipo: "ola", versao: "teste", aseprite: "1.3" }));
	await esperar(100);
	const estado = await pedir("GET", "/aseprite/estado");
	assert.equal(estado.json.conectado, true);
	assert.equal(estado.json.versao, "teste");

	ws.on("message", (dados) => {
		const msg = JSON.parse(String(dados));
		if (msg.tipo === "comando" && msg.nome === "ping") ws.send(JSON.stringify({ tipo: "resposta", id: msg.id, ok: true, valor: { pong: true } }));
	});
	const r = await pedir("POST", "/aseprite/comandos", { corpo: { nome: "ping" } });
	assert.deepEqual(r.json, { ok: true, valor: { pong: true } });

	const observador = await abrirWs("/ws?cliente=observador");
	const visto = proximaMensagem(observador, (m) => m.nome === "folha_salva");
	await presenca("s_ase");
	const { json: antes } = await pedir("GET", "/eventos");
	ws.send(JSON.stringify({ tipo: "evento", nome: "folha_salva", dados: { folha: "f" } }));
	assert.equal((await visto).dados.folha, "f");
	const eventos = await pedir("GET", `/eventos?desde=${antes.proximo}&espera=2`);
	assert.ok(eventos.json.eventos.some((e) => e.tipo === "folha_salva"));
	const recarregar = await pedir("GET", "/studio/proximo?sessao=s_ase&espera=2");
	assert.equal(recarregar.json.tipo, "recarregar_folhas");
	assert.deepEqual(recarregar.json.args, { folha: "f" });
	observador.close();
	ws.close();
});

test("Aseprite: cai no meio do comando, ou outra conexão entra", { timeout: 15_000 }, async () => {
	const ws1 = await abrirWs("/ws?cliente=aseprite");
	ws1.on("message", (dados) => {
		if (JSON.parse(String(dados)).tipo === "comando") ws1.terminate(); // recebe e cai sem responder
	});
	const caiu = await pedir("POST", "/aseprite/comandos", { corpo: { nome: "salvar_regiao" } });
	assert.equal(caiu.json.ok, false);
	assert.match(caiu.json.erro, /desconectou/);

	const ws2 = await abrirWs("/ws?cliente=aseprite");
	const pendente = pedir("POST", "/aseprite/comandos", { corpo: { nome: "demora" } });
	await proximaMensagem(ws2, (m) => m.tipo === "comando");
	const fechou = new Promise((resolve) => ws2.once("close", (codigo) => resolve(codigo)));
	const ws3 = await abrirWs("/ws?cliente=aseprite");
	assert.equal(await fechou, 4000);
	const r = await pendente;
	assert.equal(r.json.ok, false);
	assert.match(r.json.erro, /outra conexão/);
	ws3.close();
});

test("eventos: long-poll volta cedo quando chega um evento", async () => {
	await esperar(300); // o aseprite_saiu do teste anterior
	const { json } = await pedir("GET", "/eventos");
	const inicio = Date.now();
	const espera = pedir("GET", `/eventos?desde=${json.proximo}&espera=10`);
	await esperar(200);
	await pedir("PUT", "/catalogo/ev", { corpo: {} }); // não solta evento
	await pedir("DELETE", "/mapas/naoexiste"); // 404, não solta evento
	await pedir("PUT", "/mapas/ev/blocos/0_0", { corpo: blocoValido("ev", { nascimento: [1, 1] }) });
	const r = await espera;
	assert.ok(Date.now() - inicio < 5000);
	assert.equal(r.json.eventos[0].tipo, "mapa_gravado");
	assert.equal((await pedir("GET", "/eventos?desde=-1")).status, 400);
});

// ---------------------------------------------------------------------------------------------------------------
// Gerador: bloco sem nascimento (item 28 de DUVIDAS.md)

test("gerador: bloco sem nascimento usa a primeira célula livre, com aviso", async () => {
	const { gerarInterior } = await import(new URL("../diorama_lib/gerar.mjs", import.meta.url).href);
	const bloco = JSON.parse(fs.readFileSync(path.join(RAIZ_REPO, "diorama", "mapas", "teste_d_destino", "blocos", "0_0.json"), "utf8"));
	const comNascimento = gerarInterior(bloco).data;
	assert.deepEqual(comNascimento.spawn, bloco.nascimento);

	delete bloco.nascimento;
	const { data, avisos } = gerarInterior(bloco);
	const j = data.blocks.findIndex((linha) => linha.includes("."));
	assert.deepEqual(data.spawn, [data.x + data.blocks[j].indexOf("."), data.y + j]);
	assert.ok(avisos.some((a) => /sem nascimento/.test(a)));

	bloco.nascimento = [1];
	assert.ok(gerarInterior(bloco).avisos.some((a) => /nascimento inválido/.test(a)));
});
