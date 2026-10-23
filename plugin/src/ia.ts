// "Pedir ao Claude" (decisão do usuário, 2026-10-20): pedir coisas à IA de dentro do Diorama. A IA explica e, quando
// o pedido muda algo, manda uma proposta (o resumo e a lista das mudanças) que só vale depois do OK do autor.
// Contrato com a ponte em docs/diorama/CONEXOES.md, seção 7; o back-end é a ponte (tools/diorama_lib/ia.mjs), que roda
// o Claude Code do PC. Com uma ponte antiga, sem as rotas, o pedido volta com "Ainda não disponível: atualize a ponte".
//
//   POST /ia/pedidos { texto, contexto: { mapa, secao, selecao, problemas }, modo: "agir", sessao } → { id }
//   GET  /ia/pedidos/<id>?espera=30 → { estado: "pensando" | "proposta" | "feito" | "erro", resposta, proposta? }
//        (202 enquanto pensa)
//   POST /ia/pedidos/<id>/confirmar { aceitar } → o mesmo formato do GET
//   POST /ia/pedidos/<id>/cancelar → para o pedido que está pensando (a ponte mata o processo do Claude)
//
// A conversa fica no módulo: dura a sessão do Studio (some numa recarga do pacote, como o resto do estado).
import { HttpService } from "@rbxts/services";
import { source } from "@rbxts/vide";
import { ambienteSeHouver } from "./ambiente";
import { pedir } from "./ponte";

export interface Proposta {
	resumo: string;
	mudancas: string[];
}

export interface Mensagem {
	n: number;
	quem: "voce" | "claude" | "sistema";
	texto: string;
	/** A proposta que veio nesta resposta (e o que o autor decidiu). */
	proposta?: Proposta;
	decisao?: "aplicada" | "cancelada";
	/** O id do pedido na ponte (para confirmar a proposta). */
	pedido?: string;
}

export interface ContextoPedido {
	mapa?: string;
	secao: string;
	selecao: Record<string, unknown>;
	problemas: string[];
}

/** A conversa da sessão, da mais velha para a mais nova. */
export const conversa = source<Mensagem[]>([]);
/** Esperando a IA? (o painel mostra "pensando…" e não deixa enviar outro). */
export const pensando = source(false);
/** O pedido com proposta esperando Aplicar ou Cancelar. */
export const propostaPendente = source<Mensagem | undefined>(undefined);
/** O pedido que está pensando (para o "Parar"). */
let pedidoAtual: string | undefined;

const MAXIMO = 40;
let contador = 0;
const NAO_DISPONIVEL = "Ainda não disponível: atualize a ponte (ela ainda não tem o Claude). O pedido não foi enviado.";

function anotar(m: Omit<Mensagem, "n">): Mensagem {
	contador++;
	const nova = { ...m, n: contador } as Mensagem;
	const lista = [...conversa(), nova];
	conversa(lista.size() > MAXIMO ? lista.filter((_, i) => i >= lista.size() - MAXIMO) : lista);
	return nova;
}

function trocar(m: Mensagem, mudanca: Partial<Mensagem>) {
	conversa(conversa().map((x) => (x.n === m.n ? { ...x, ...mudanca } : x)));
}

interface RespostaIa {
	id?: string;
	estado?: "pensando" | "proposta" | "feito" | "erro";
	resposta?: string;
	/** O autor parou o pedido ou cancelou a proposta. */
	cancelado?: boolean;
	proposta?: { resumo?: string; mudancas?: unknown[] };
}

type Lido = { ok: true; status: number; valor: RespostaIa } | { ok: false; erro: string; naoDisponivel: boolean };

function chamar(metodo: "GET" | "POST", rota: string, corpo?: unknown): Lido {
	const r = pedir(metodo, rota, corpo !== undefined ? HttpService.JSONEncode(corpo) : undefined);
	if (!r.ok) {
		// 404/405/501: a ponte não conhece a rota (ainda não tem o back-end da IA).
		const naoDisponivel = r.status === 404 || r.status === 405 || r.status === 501;
		return { ok: false, erro: naoDisponivel ? NAO_DISPONIVEL : r.erro, naoDisponivel };
	}
	if (r.valor.corpo === "") return { ok: true, status: r.valor.status, valor: {} };
	const [decodificou, valor] = pcall(() => HttpService.JSONDecode(r.valor.corpo) as RespostaIa);
	if (!decodificou || !typeIs(valor, "table")) return { ok: false, erro: "a ponte respondeu algo que não é JSON", naoDisponivel: false };
	return { ok: true, status: r.valor.status, valor: valor as RespostaIa };
}

function lerProposta(p: RespostaIa["proposta"]): Proposta | undefined {
	if (!typeIs(p, "table")) return undefined;
	const mudancas = new Array<string>();
	if (typeIs(p.mudancas, "table")) for (const m of p.mudancas) if (typeIs(m, "string")) mudancas.push(m);
	return { resumo: typeIs(p.resumo, "string") ? p.resumo : "", mudancas };
}

/** Espera o pedido sair de "pensando" (long-poll de 20 s, como o canal do Studio, abaixo do limite do RequestAsync; até 5 min). Yielda. */
function esperar(id: string): Lido {
	const limite = os.clock() + 300;
	while (os.clock() < limite) {
		const r = chamar("GET", `/ia/pedidos/${HttpService.UrlEncode(id)}?espera=20`);
		if (!r.ok) return r;
		if (r.status !== 202 && r.valor.estado !== "pensando") return r;
	}
	return { ok: false, erro: "o Claude não respondeu em 5 minutos.", naoDisponivel: false };
}

/** Mostra a resposta (texto e, se vier, a proposta). */
function receber(id: string, r: Lido) {
	if (!r.ok) {
		anotar({ quem: "sistema", texto: r.erro });
		return;
	}
	const v = r.valor;
	if (v.cancelado === true) {
		anotar({ quem: "sistema", texto: v.resposta ?? "Pedido parado; nada mudou." });
		return;
	}
	if (v.estado === "erro") {
		anotar({ quem: "sistema", texto: `O Claude não conseguiu: ${v.resposta ?? "erro sem mensagem"}` });
		return;
	}
	const proposta = v.estado === "proposta" ? lerProposta(v.proposta) : undefined;
	const m = anotar({ quem: "claude", texto: v.resposta ?? (proposta ? "" : "(sem resposta)"), proposta, pedido: id });
	if (proposta) propostaPendente(m);
}

/** Envia um pedido e espera a resposta. Yielda (chamar de um task.spawn). */
export function enviarPedido(texto: string, contexto: ContextoPedido) {
	const limpo = texto.gsub("^%s+", "")[0].gsub("%s+$", "")[0];
	if (limpo === "" || pensando()) return;
	const pendente = propostaPendente();
	if (pendente) {
		// Um pedido novo deixa a proposta anterior para trás (cancelada na ponte).
		cancelarSemEsperar(pendente);
	}
	anotar({ quem: "voce", texto: limpo });
	pensando(true);
	// `sessao`: este Studio. A ponte só reabre o mapa (e o Claude só fala com o Studio) desta sessão; sem ela, um
	// "abrir_mapa { descartar: true }" iria ao Studio mais recente, que pode ser outro (o place do autor). 2026-10-23.
	const r = chamar("POST", "/ia/pedidos", { texto: limpo, contexto, modo: "agir", sessao: ambienteSeHouver()?.sessao });
	if (!r.ok) {
		pensando(false);
		anotar({ quem: "sistema", texto: r.erro });
		return;
	}
	const id = r.valor.id;
	if (!typeIs(id, "string") || id === "") {
		pensando(false);
		anotar({ quem: "sistema", texto: "A ponte não devolveu o id do pedido." });
		return;
	}
	pedidoAtual = id;
	const resposta = esperar(id);
	pedidoAtual = undefined;
	pensando(false);
	receber(id, resposta);
}

/** Para o pedido que está pensando (o botão "Parar"): a ponte mata o processo; a espera volta com "cancelado". */
export function pararPedido() {
	const id = pedidoAtual;
	if (id === undefined || !pensando()) return;
	task.spawn(() => chamar("POST", `/ia/pedidos/${HttpService.UrlEncode(id)}/cancelar`, {}));
}

function cancelarSemEsperar(m: Mensagem) {
	trocar(m, { decisao: "cancelada" });
	propostaPendente(undefined);
	if (m.pedido !== undefined) task.spawn(() => chamar("POST", `/ia/pedidos/${HttpService.UrlEncode(m.pedido!)}/confirmar`, { aceitar: false }));
}

/** Aplica ou cancela a proposta pendente. Yielda (aplicar espera o resultado). */
export function decidir(aceitar: boolean) {
	const m = propostaPendente();
	if (!m || m.pedido === undefined) return;
	if (!aceitar) {
		cancelarSemEsperar(m);
		anotar({ quem: "sistema", texto: "Proposta cancelada; nada mudou." });
		return;
	}
	propostaPendente(undefined);
	trocar(m, { decisao: "aplicada" });
	pensando(true);
	const r = chamar("POST", `/ia/pedidos/${HttpService.UrlEncode(m.pedido)}/confirmar`, { aceitar: true });
	let final = r;
	pedidoAtual = m.pedido;
	if (r.ok && (r.status === 202 || r.valor.estado === "pensando")) final = esperar(m.pedido);
	pedidoAtual = undefined;
	pensando(false);
	if (!final.ok) {
		anotar({ quem: "sistema", texto: final.erro });
		return;
	}
	if (final.valor.cancelado === true) anotar({ quem: "sistema", texto: final.valor.resposta ?? "Aplicação parada." });
	else if (final.valor.estado === "erro") anotar({ quem: "sistema", texto: `Não aplicou: ${final.valor.resposta ?? "erro sem mensagem"}` });
	else anotar({ quem: "claude", texto: final.valor.resposta ?? "Feito." });
}

/** Limpa a conversa (o botão "Limpar"). */
export function limparConversa() {
	const p = propostaPendente();
	if (p) cancelarSemEsperar(p);
	conversa([]);
}
