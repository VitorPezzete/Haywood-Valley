// Os canais da ponte (docs/diorama/CONEXOES.md, seções 2, 3 e 5): o do Studio (presença e comandos por long-poll),
// o do Aseprite (WebSocket em /ws) e os eventos (/eventos, long-poll). Tudo em memória: reiniciar a ponte esquece
// sessões, comandos e eventos.
//
// `criarCanais({ ErroHttp, lerJson, pedidos })` devolve `{ rotas, emitir, aoAtualizar(servidor, recusar), fechar }`: as rotas
// no formato de diorama_ponte.mjs, `emitir(tipo, dados)` para a ponte anunciar os próprios eventos, e o
// `aoAtualizar` que liga o WebSocket ao servidor HTTP (`recusar(req)` diz por que recusar um upgrade). `lerJson(req)`
// tem de devolver um objeto JSON (ou lançar ErroHttp 400). `pedidos`: nome → função async(args) para os pedidos que o
// Aseprite faz à ponte pelo WebSocket (`temporaria`, `estilo_aeko`; a ponte é quem os define).

import { WebSocketServer } from "ws";

/** Uma sessão some depois deste tempo sem presença (nem pedido de comando). DIORAMA_SESSAO_EXPIRA_MS: só os testes. */
const SESSAO_EXPIRA_MS = Number(process.env.DIORAMA_SESSAO_EXPIRA_MS) || 15_000;
/** Espera máxima de um long-poll, em segundos. */
const ESPERA_MAXIMA_S = 55;
/** Quantos eventos ficam guardados. */
const EVENTOS_GUARDADOS = 500;
/** Por quanto tempo uma resposta de comando fica guardada depois de chegar. */
const RESPOSTA_GUARDADA_MS = 10 * 60_000;
/** Um comando que nenhum Studio buscou em tanto tempo falha. */
const COMANDO_EXPIRA_MS = 120_000;
/** Um comando entregue que o Studio não respondeu em tanto tempo falha (o autoteste leva até uns 2 min). */
const ENTREGUE_EXPIRA_MS = 10 * 60_000;
/** Espera da resposta do Aseprite. */
const ESPERA_ASEPRITE_MS = 30_000;
/** Maior mensagem aceita no WebSocket. */
const WS_MAXIMO = 16 * 1024 * 1024;

function esperaDaBusca(busca, padrao) {
	const v = busca.get("espera");
	if (v === null || v === "") return padrao;
	const n = Number(v);
	if (!Number.isFinite(n) || n < 0) return padrao;
	return Math.min(n, ESPERA_MAXIMA_S);
}

export function criarCanais({ ErroHttp, lerJson, log = console.log, pedidos = {} }) {
	// ----------------------------------------------------------------------------------------------------------
	// Eventos

	const eventos = [];
	let proximoEvento = 1;
	const ouvintesEventos = new Set();
	/** Clientes WebSocket que não são o Aseprite: recebem cada evento. */
	const observadoresWs = new Set();

	function emitir(tipo, dados = {}) {
		const evento = { n: proximoEvento++, tipo, dados, em: new Date().toISOString() };
		eventos.push(evento);
		if (eventos.length > EVENTOS_GUARDADOS) eventos.splice(0, eventos.length - EVENTOS_GUARDADOS);
		for (const ouvinte of [...ouvintesEventos]) ouvinte();
		// Mesmo formato do evento que o Aseprite manda: `nome` é o tipo do evento.
		const texto = JSON.stringify({ tipo: "evento", nome: evento.tipo, n: evento.n, dados: evento.dados, em: evento.em });
		for (const ws of observadoresWs) if (ws.readyState === 1) ws.send(texto);
		return evento;
	}

	function eventosDesde(desde) {
		return eventos.filter((e) => e.n >= desde);
	}

	async function buscarEventos(busca, res) {
		const desdeTexto = busca.get("desde");
		if (desdeTexto === null || desdeTexto === "") {
			return { json: { proximo: proximoEvento, eventos: [...eventos] } };
		}
		const desde = Number(desdeTexto);
		if (!Number.isInteger(desde) || desde < 0) throw new ErroHttp(400, "desde precisa ser um inteiro não negativo");
		let lista = eventosDesde(desde);
		const espera = esperaDaBusca(busca, 25);
		if (lista.length === 0 && espera > 0) {
			await new Promise((resolve) => {
				const fim = () => {
					clearTimeout(t);
					ouvintesEventos.delete(fim);
					resolve();
				};
				const t = setTimeout(fim, espera * 1000);
				ouvintesEventos.add(fim);
				res.on("close", fim);
			});
			lista = eventosDesde(desde);
		}
		const proximo = lista.length > 0 ? lista[lista.length - 1].n + 1 : Math.max(desde, proximoEvento);
		return { json: { proximo, eventos: lista } };
	}

	// ----------------------------------------------------------------------------------------------------------
	// Studio: sessões e comandos

	/** sessao → { sessao, place, placeId, versao, modo, visto, entrou, fila: comando[], espera?: {entregar, fechar} } */
	const sessoes = new Map();
	/** id → { id, tipo, args, sessao, criado, entregue?, resposta?, respondido?, ouvintes: Set } */
	const comandos = new Map();
	let proximoComando = 1;

	function viva(s, agora = Date.now()) {
		return agora - s.visto <= SESSAO_EXPIRA_MS;
	}

	function resumoSessao(s, agora = Date.now()) {
		return { sessao: s.sessao, place: s.place, placeId: s.placeId, versao: s.versao, modo: s.modo, origem: s.origem, visto_ha_ms: agora - s.visto };
	}

	function tocarSessao(id, dados = {}) {
		let s = sessoes.get(id);
		const nova = !s;
		if (!s) {
			s = { sessao: id, place: "?", placeId: 0, versao: "?", modo: "desconhecido", visto: Date.now(), entrou: Date.now(), fila: [] };
			sessoes.set(id, s);
		}
		for (const chave of ["place", "placeId", "versao", "modo", "origem"]) if (dados[chave] !== undefined) s[chave] = dados[chave];
		s.visto = Date.now();
		if (nova) emitir("studio_entrou", resumoSessao(s));
		return s;
	}

	function responder(comando, resposta) {
		if (comando.resposta) return;
		comando.resposta = resposta;
		comando.respondido = Date.now();
		for (const ouvinte of [...comando.ouvintes]) ouvinte();
	}

	/** Entrega o primeiro da fila ao long-poll que está esperando, se houver. */
	function entregar(s) {
		if (!s.espera || s.fila.length === 0) return;
		const comando = s.fila.shift();
		const espera = s.espera;
		s.espera = undefined;
		if (!espera.entregar(comando)) {
			// A conexão já tinha caído: o comando volta para a frente da fila.
			s.fila.unshift(comando);
		}
	}

	// Limpeza: sessões caladas, comandos esquecidos, respostas velhas.
	const limpeza = setInterval(() => {
		const agora = Date.now();
		for (const [id, s] of sessoes) {
			if (viva(s, agora) || s.espera) continue;
			sessoes.delete(id);
			for (const c of s.fila) responder(c, { ok: false, erro: "o Studio desta sessão saiu antes de buscar o comando" });
			emitir("studio_saiu", resumoSessao(s, agora));
		}
		for (const [id, c] of comandos) {
			if (c.resposta) {
				if (agora - c.respondido > RESPOSTA_GUARDADA_MS) comandos.delete(id);
				continue;
			}
			if (!c.entregue && agora - c.criado > COMANDO_EXPIRA_MS) {
				const s = sessoes.get(c.sessao);
				if (s) s.fila = s.fila.filter((x) => x !== c);
				responder(c, { ok: false, erro: `nenhum Studio buscou o comando em ${COMANDO_EXPIRA_MS / 1000} s` });
			} else if (c.entregue && !sessoes.has(c.sessao)) {
				// O plugin buscou o comando e sumiu (Studio fechado, plugin travado) sem responder.
				responder(c, { ok: false, erro: "o Studio desta sessão saiu depois de receber o comando, sem responder" });
			} else if (c.entregue && agora - c.entregue > ENTREGUE_EXPIRA_MS) {
				responder(c, { ok: false, erro: `o Studio recebeu o comando e não respondeu em ${ENTREGUE_EXPIRA_MS / 60_000} min` });
			}
		}
	}, 2_000);
	limpeza.unref();

	/** A sessão para um comando sem `sessao`: a mais recente em modo edição; senão, a mais recente viva. */
	function escolherSessao() {
		const vivas = [...sessoes.values()].filter((s) => viva(s));
		const edicao = vivas.filter((s) => s.modo === "edicao");
		const lista = edicao.length > 0 ? edicao : vivas;
		lista.sort((a, b) => b.entrou - a.entrou);
		return lista[0];
	}

	function textoOuNada(v) {
		return typeof v === "string" ? v : undefined;
	}

	async function presencaPost(req) {
		const corpo = await lerJson(req);
		const id = textoOuNada(corpo.sessao);
		if (!id) throw new ErroHttp(400, "presença sem sessao");
		const s = tocarSessao(id, {
			place: textoOuNada(corpo.place),
			placeId: typeof corpo.placeId === "number" ? corpo.placeId : undefined,
			versao: textoOuNada(corpo.versao),
			modo: textoOuNada(corpo.modo),
			origem: textoOuNada(corpo.origem),
		});
		return { json: { ok: true, sessao: s.sessao, fila: s.fila.length } };
	}

	async function proximo(busca, res) {
		const id = busca.get("sessao");
		if (!id) throw new ErroHttp(400, "falta ?sessao=");
		const s = tocarSessao(id);
		if (s.fila.length > 0) {
			const comando = s.fila.shift();
			comando.entregue = Date.now();
			return { json: { id: comando.id, tipo: comando.tipo, args: comando.args } };
		}
		// Um long-poll novo da mesma sessão (o plugin recarregou) encerra o anterior.
		if (s.espera) {
			const anterior = s.espera;
			s.espera = undefined;
			anterior.fechar();
		}
		const espera = esperaDaBusca(busca, 25);
		const comando = await new Promise((resolve) => {
			let terminado = false;
			const fim = (valor) => {
				if (terminado) return false;
				terminado = true;
				clearTimeout(t);
				if (s.espera === registro) s.espera = undefined;
				resolve(valor);
				return true;
			};
			const registro = {
				entregar: (c) => {
					if (res.destroyed || res.writableEnded) return false;
					return fim(c);
				},
				fechar: () => fim(undefined),
			};
			const t = setTimeout(() => fim(undefined), espera * 1000);
			res.on("close", () => fim(undefined));
			s.espera = registro;
			entregar(s);
		});
		s.visto = Date.now();
		if (!comando) return { status: 204, vazio: true };
		if (res.destroyed || res.writableEnded) {
			// A conexão caiu entre a entrega e a escrita: o comando volta para a frente da fila.
			s.fila.unshift(comando);
			return { status: 204, vazio: true };
		}
		comando.entregue = Date.now();
		return { json: { id: comando.id, tipo: comando.tipo, args: comando.args } };
	}

	async function respostaPost(id, req) {
		const comando = comandos.get(id);
		if (!comando) throw new ErroHttp(404, `comando desconhecido: ${id}`);
		const corpo = await lerJson(req);
		if (corpo.devolver === true) {
			// O plugin recebeu o comando enquanto parava (recarga): volta para a frente da fila da sessão.
			if (comando.resposta) return { json: { ok: true, devolvido: false } };
			const s = sessoes.get(comando.sessao);
			if (!s) {
				responder(comando, { ok: false, erro: "o Studio devolveu o comando e a sessão dele já saiu" });
				return { json: { ok: true, devolvido: false } };
			}
			comando.entregue = undefined;
			if (!s.fila.includes(comando)) s.fila.unshift(comando);
			entregar(s);
			return { json: { ok: true, devolvido: true } };
		}
		const resposta = corpo.ok === true ? { ok: true, valor: corpo.valor ?? null } : { ok: false, erro: String(corpo.erro ?? "erro sem mensagem") };
		responder(comando, resposta);
		if (comando.tipo === "autoteste" || !resposta.ok) {
			log(`[studio] ${comando.id} ${comando.tipo}: ${resposta.ok ? "ok" : `erro: ${resposta.erro}`}`);
		}
		return { json: { ok: true } };
	}

	/** Enfileira um comando. Lança 503 se não há Studio. Devolve o registro do comando. */
	function enfileirar(tipo, args = {}, sessaoPedida) {
		let s;
		if (sessaoPedida) {
			s = sessoes.get(sessaoPedida);
			if (!s || !viva(s)) throw new ErroHttp(503, `a sessão ${sessaoPedida} não está conectada`);
		} else {
			s = escolherSessao();
			if (!s) throw new ErroHttp(503, "nenhum Studio com o plugin Diorama conectado à ponte");
		}
		const comando = { id: `c${proximoComando++}`, tipo, args, sessao: s.sessao, criado: Date.now(), ouvintes: new Set() };
		comandos.set(comando.id, comando);
		s.fila.push(comando);
		entregar(s);
		return comando;
	}

	async function comandoPost(req) {
		const corpo = await lerJson(req);
		if (typeof corpo.tipo !== "string" || corpo.tipo === "") throw new ErroHttp(400, "comando sem tipo");
		if (corpo.args !== undefined && corpo.args !== null && (typeof corpo.args !== "object" || Array.isArray(corpo.args))) {
			throw new ErroHttp(400, "args precisa ser um objeto");
		}
		const args = corpo.args ?? {};
		const comando = enfileirar(corpo.tipo, args, textoOuNada(corpo.sessao));
		return { json: { id: comando.id, sessao: comando.sessao } };
	}

	async function respostaGet(id, busca, res) {
		const comando = comandos.get(id);
		if (!comando) throw new ErroHttp(404, `comando desconhecido: ${id}`);
		const espera = esperaDaBusca(busca, 30);
		if (!comando.resposta && espera > 0) {
			await new Promise((resolve) => {
				const fim = () => {
					clearTimeout(t);
					comando.ouvintes.delete(fim);
					resolve();
				};
				const t = setTimeout(fim, espera * 1000);
				comando.ouvintes.add(fim);
				res.on("close", fim);
			});
		}
		if (!comando.resposta) return { status: 202, json: { pendente: true, entregue: comando.entregue !== undefined } };
		return { json: comando.resposta };
	}

	/** Manda `recarregar_folhas` a todos os Studios na edição (repasse do `folha_salva` do Aseprite). */
	function avisarStudios(tipo, args) {
		const ids = [];
		for (const s of sessoes.values()) {
			if (!viva(s) || s.modo !== "edicao") continue;
			ids.push(enfileirar(tipo, args, s.sessao).id);
		}
		return ids;
	}

	// ----------------------------------------------------------------------------------------------------------
	// Aseprite

	const aseprite = { ws: undefined, versao: undefined, aseprite: undefined, sprite: undefined, conectado_em: undefined };
	/** id → { resolve, timer } */
	const pendentesAseprite = new Map();
	let proximoAseprite = 1;

	function estadoAseprite() {
		return {
			conectado: aseprite.ws !== undefined && aseprite.ws.readyState === 1,
			versao: aseprite.versao ?? null,
			aseprite: aseprite.aseprite ?? null,
			sprite: aseprite.sprite ?? null,
			conectado_em: aseprite.conectado_em ?? null,
		};
	}

	function falharPendentesAseprite(erro) {
		for (const [id, p] of pendentesAseprite) {
			clearTimeout(p.timer);
			pendentesAseprite.delete(id);
			p.resolve({ ok: false, erro });
		}
	}

	function aoMensagemAseprite(ws, dados) {
		let msg;
		try {
			msg = JSON.parse(String(dados));
		} catch {
			log("[aseprite] mensagem que não é JSON; ignorada");
			return;
		}
		if (msg.tipo === "ola") {
			aseprite.versao = textoOuNada(msg.versao);
			aseprite.aseprite = textoOuNada(msg.aseprite);
			if (msg.sprite !== undefined) aseprite.sprite = msg.sprite;
			return;
		}
		if (msg.tipo === "resposta") {
			const p = pendentesAseprite.get(msg.id);
			if (!p) return;
			clearTimeout(p.timer);
			pendentesAseprite.delete(msg.id);
			const resposta = msg.ok === true ? { ok: true, valor: msg.valor ?? null } : { ok: false, erro: String(msg.erro ?? "erro sem mensagem") };
			if (resposta.ok && p.nome === "sprite_atual") aseprite.sprite = resposta.valor;
			p.resolve(resposta);
			return;
		}
		if (msg.tipo === "pedido") {
			// O Aseprite pedindo algo à ponte (o contrário de um comando): { tipo: "pedido", id, nome, args }. A resposta
			// volta pela mesma conexão como { tipo: "resposta_pedido", id, ok, valor | erro }.
			const id = msg.id;
			const nome = textoOuNada(msg.nome);
			const responderPedido = (resposta) => {
				if (ws.readyState === 1) ws.send(JSON.stringify({ tipo: "resposta_pedido", id, ...resposta }));
			};
			const tratar = nome !== undefined && Object.hasOwn(pedidos, nome) ? pedidos[nome] : undefined;
			if (!tratar) {
				responderPedido({ ok: false, erro: `pedido desconhecido: ${nome}` });
				return;
			}
			const args = msg.args && typeof msg.args === "object" && !Array.isArray(msg.args) ? msg.args : {};
			Promise.resolve()
				.then(() => tratar(args))
				.then(
					(valor) => responderPedido({ ok: true, valor: valor ?? null }),
					(erro) => responderPedido({ ok: false, erro: erro?.message ?? String(erro) }),
				);
			log(`[aseprite] pedido ${nome}`);
			return;
		}
		if (msg.tipo === "evento") {
			const nome = textoOuNada(msg.nome);
			if (!nome) return;
			const dadosEvento = msg.dados && typeof msg.dados === "object" ? msg.dados : {};
			if (nome === "sprite") {
				aseprite.sprite = dadosEvento;
				return;
			}
			emitir(nome, dadosEvento);
			if (nome === "folha_salva") {
				const args = typeof dadosEvento.folha === "string" ? { folha: dadosEvento.folha } : {};
				const ids = avisarStudios("recarregar_folhas", args);
				log(`[aseprite] folha_salva ${args.folha ?? ""} → recarregar_folhas em ${ids.length} Studio(s) (${ids.join(", ") || "nenhum"})`);
			}
		}
	}

	function comandoAseprite(nome, args = {}) {
		const ws = aseprite.ws;
		if (!ws || ws.readyState !== 1) {
			return Promise.resolve({ ok: false, erro: "o Aseprite não está conectado (abra o Aseprite com a extensão Diorama)", semConexao: true });
		}
		const id = `a${proximoAseprite++}`;
		return new Promise((resolve) => {
			const timer = setTimeout(() => {
				pendentesAseprite.delete(id);
				resolve({
					ok: false,
					erro: `o Aseprite não respondeu em ${ESPERA_ASEPRITE_MS / 1000} s (um diálogo aberto no Aseprite, como o de permissão, segura os comandos)`,
					tempo: true,
				});
			}, ESPERA_ASEPRITE_MS);
			pendentesAseprite.set(id, { resolve, timer, nome });
			ws.send(JSON.stringify({ tipo: "comando", id, nome, args }), (erro) => {
				if (!erro || !pendentesAseprite.has(id)) return;
				clearTimeout(timer);
				pendentesAseprite.delete(id);
				resolve({ ok: false, erro: `não deu para mandar o comando ao Aseprite: ${erro.message}`, semConexao: true });
			});
		});
	}

	async function asepriteComandoPost(req) {
		const corpo = await lerJson(req);
		if (typeof corpo.nome !== "string" || corpo.nome === "") throw new ErroHttp(400, "comando sem nome");
		if (corpo.args !== undefined && corpo.args !== null && (typeof corpo.args !== "object" || Array.isArray(corpo.args))) {
			throw new ErroHttp(400, "args precisa ser um objeto");
		}
		const r = await comandoAseprite(corpo.nome, corpo.args ?? {});
		const status = r.semConexao ? 503 : r.tempo ? 504 : 200;
		return { status, json: { ok: r.ok, ...(r.ok ? { valor: r.valor } : { erro: r.erro }) } };
	}

	// ----------------------------------------------------------------------------------------------------------
	// WebSocket

	const wss = new WebSocketServer({ noServer: true, maxPayload: WS_MAXIMO });
	const vivoWs = new WeakMap();
	const batimento = setInterval(() => {
		for (const ws of wss.clients) {
			if (vivoWs.get(ws) === false) {
				ws.terminate();
				continue;
			}
			vivoWs.set(ws, false);
			try {
				ws.ping();
			} catch {
				// a conexão já caiu
			}
		}
	}, 20_000);
	batimento.unref();

	wss.on("connection", (ws, req) => {
		const url = new URL(req.url, "http://127.0.0.1");
		const cliente = url.searchParams.get("cliente") ?? "observador";
		vivoWs.set(ws, true);
		ws.on("pong", () => vivoWs.set(ws, true));
		if (cliente === "aseprite") {
			const anterior = aseprite.ws;
			aseprite.ws = ws;
			aseprite.conectado_em = new Date().toISOString();
			aseprite.sprite = undefined;
			if (anterior && anterior !== ws) {
				// As respostas dos comandos pendentes viriam pela conexão velha, que vai fechar.
				falharPendentesAseprite("outra conexão do Aseprite entrou antes da resposta");
				anterior.close(4000, "outra conexão do Aseprite entrou");
			}
			log("[aseprite] conectou");
			emitir("aseprite_conectou", {});
			ws.on("message", (dados) => aoMensagemAseprite(ws, dados));
			ws.on("close", () => {
				if (aseprite.ws !== ws) return;
				aseprite.ws = undefined;
				aseprite.sprite = undefined;
				log("[aseprite] saiu");
				falharPendentesAseprite("o Aseprite desconectou antes de responder");
				emitir("aseprite_saiu", {});
			});
		} else {
			observadoresWs.add(ws);
			ws.on("close", () => observadoresWs.delete(ws));
		}
		ws.on("error", (e) => log(`[ws] ${cliente}: ${e.message}`));
	});

	/** Liga o WebSocket ao servidor. `recusar(req)` devolve o motivo para recusar o upgrade (Origin de página web...). */
	function aoAtualizar(servidor, recusar = () => undefined) {
		servidor.on("upgrade", (req, socket, cabeca) => {
			socket.on("error", () => {}); // conexão que cai no meio do aperto de mão não derruba a ponte
			let url;
			try {
				url = new URL(req.url, "http://127.0.0.1");
			} catch {
				url = undefined;
			}
			if (!url || url.pathname !== "/ws") {
				socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
				return;
			}
			const motivo = recusar(req);
			if (motivo) {
				log(`[ws] recusado: ${motivo}`);
				const corpo = JSON.stringify({ erro: `recusado: ${motivo}` });
				socket.end(
					`HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(corpo)}\r\n\r\n${corpo}`,
				);
				return;
			}
			wss.handleUpgrade(req, socket, cabeca, (ws) => wss.emit("connection", ws, req));
		});
	}

	// ----------------------------------------------------------------------------------------------------------
	// Rotas (o formato de diorama_ponte.mjs: [método, caminho, (grupos, req, busca, res) => resposta])

	const rotas = [
		["POST", /^\/studio\/presenca$/, (_g, req) => presencaPost(req)],
		["GET", /^\/studio\/presenca$/, () => ({ json: [...sessoes.values()].filter((s) => viva(s)).map((s) => resumoSessao(s)) })],
		["GET", /^\/studio\/proximo$/, (_g, _req, busca, res) => proximo(busca, res)],
		["POST", /^\/studio\/comandos$/, (_g, req) => comandoPost(req)],
		["POST", /^\/studio\/respostas\/([^/]+)$/, ([id], req) => respostaPost(id, req)],
		["GET", /^\/studio\/respostas\/([^/]+)$/, ([id], _req, busca, res) => respostaGet(id, busca, res)],
		["GET", /^\/aseprite\/estado$/, () => ({ json: estadoAseprite() })],
		["POST", /^\/aseprite\/comandos$/, (_g, req) => asepriteComandoPost(req)],
		["GET", /^\/eventos$/, (_g, _req, busca, res) => buscarEventos(busca, res)],
	];

	/** Rotas que não saem no log do terminal quando dão certo (são chamadas a cada poucos segundos). */
	const silenciosas = [/^\/studio\/presenca$/, /^\/studio\/proximo$/, /^\/plugin\/versao$/, /^\/eventos$/];

	function fechar() {
		clearInterval(limpeza);
		clearInterval(batimento);
		for (const ws of wss.clients) ws.terminate();
		wss.close();
	}

	return {
		rotas,
		silenciosas,
		emitir,
		aoAtualizar,
		fechar,
		estadoAseprite,
		sessoesVivas: () => [...sessoes.values()].filter((s) => viva(s)).map((s) => resumoSessao(s)),
		comandoAseprite,
		enfileirar,
	};
}
