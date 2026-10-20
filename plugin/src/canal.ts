// Canal do Studio (docs/diorama/CONEXOES.md, seção 2): o plugin se apresenta à ponte a cada 5 s
// (`POST /studio/presenca`) e busca comandos por long-poll (`GET /studio/proximo`). Cada comando roda na própria
// thread e a resposta volta por `POST /studio/respostas/<id>`. Quem manda é o MCP do Claude, o Aseprite (pela
// ponte) ou um curl.
//
// O `RequestAsync` yielda: os dois laços rodam em `task.spawn` e param quando o pacote para (`parar()` da
// recarga). Um comando que chega depois do `parar()` é devolvido à ponte (`{ devolver: true }`) para o pacote novo
// pegar; a sessão é a mesma entre recargas (a casca a gera), então o pacote novo continua a fila.
import { HttpService, Selection } from "@rbxts/services";
import { source } from "@rbxts/vide";
import { ambiente, gravarConfig, lerConfig } from "./ambiente";
import { autoteste } from "./autoteste";
import { avisoImagens, carregarImagensFolhas, definirFolhasLocais } from "./estado";
import { folhasCarregadas, folhasLocais, lerPixel, recarregarFolhas } from "./folhasLocais";
import { controleMapas } from "./mapas/controle";
import { pedir } from "./ponte";
import { diagnosticar, resumir } from "./problemas/diagnostico";
import { ATRIBUTO_INTERIOR_CELULA, ATRIBUTO_INTERIOR_TESTE, ATRIBUTOS, gravarAtributo, lerAtributo } from "./servidor/atributos";
import { modoAtual } from "./servidor/execucao";
import { mensagens, nivelDe } from "./servidor/output";
import { ferramentasAbertas, mostrar } from "./widget";

/** De quanto em quanto tempo a presença é anunciada, em segundos. */
const INTERVALO_PRESENCA = 5;
/** Quanto o long-poll espera na ponte, em segundos (abaixo do limite de tempo do RequestAsync). */
const ESPERA_POLL = 20;
// Sem ponto: o plugin:SetSetting do Studio ignora em silêncio as chaves com "." (conferido em 2026-10-20).
const CHAVE_LUAU = "Diorama_permitirLuau";

/** "Permitir executar Luau" (painel Conexão): desligado por padrão, guardado em plugin:SetSetting. */
export const permitirLuau = source(false);

export function definirPermitirLuau(valor: boolean) {
	permitirLuau(valor);
	gravarConfig(CHAVE_LUAU, valor);
}

export interface EstadoCanal {
	ligado: boolean;
	/** Comandos atendidos desde que o pacote iniciou. */
	atendidos: number;
	/** O último comando: tipo e se deu certo. */
	ultimo?: string;
	erro?: string;
}

export const estadoCanal = source<EstadoCanal>({ ligado: false, atendidos: 0 });

interface Comando {
	id: string;
	tipo: string;
	args?: Record<string, unknown>;
}

type Args = Record<string, unknown>;

function texto(v: unknown): string | undefined {
	return typeIs(v, "string") && v !== "" ? v : undefined;
}

/** Converte o que um comando devolve em algo que o JSONEncode aceita (Instance vira o caminho, vetores viram listas). */
function paraJson(v: unknown, profundidade = 0): unknown {
	if (profundidade > 20) return "…";
	if (typeIs(v, "Instance")) return v.GetFullName();
	if (typeIs(v, "Vector3")) return [v.X, v.Y, v.Z];
	if (typeIs(v, "Vector2")) return [v.X, v.Y];
	if (typeIs(v, "Color3")) return [math.round(v.R * 255), math.round(v.G * 255), math.round(v.B * 255)];
	if (typeIs(v, "EnumItem")) return tostring(v);
	if (typeIs(v, "table")) {
		const saida: Record<string, unknown> = {};
		let lista = true;
		let n = 0;
		for (const [k] of pairs(v as object)) {
			n++;
			if (!typeIs(k, "number")) lista = false;
		}
		if (lista && n > 0) {
			const arr = new Array<defined>();
			for (const item of v as defined[]) arr.push(paraJson(item, profundidade + 1) as defined);
			return arr;
		}
		for (const [k, item] of pairs(v as Record<string, unknown>)) saida[tostring(k)] = paraJson(item, profundidade + 1);
		return saida;
	}
	if (typeIs(v, "number") || typeIs(v, "string") || typeIs(v, "boolean") || v === undefined) return v;
	return tostring(v);
}

function atributosDeTeste(): Record<string, unknown> {
	const saida: Record<string, unknown> = {};
	for (const def of ATRIBUTOS) {
		const valor = lerAtributo(def.nome);
		if (valor !== undefined) saida[def.nome] = paraJson(valor);
	}
	return saida;
}

function esperarControleMapas() {
	const limite = os.clock() + 5;
	let c = controleMapas();
	while (!c && os.clock() < limite) {
		task.wait(0.1);
		c = controleMapas();
	}
	return c;
}

/** Roda o código Luau de `executar_luau`: um ModuleScript que devolve uma função, chamada com o `plugin`. */
function executarLuau(codigo: string): unknown {
	const modulo = new Instance("ModuleScript");
	modulo.Name = "DioramaExecutarLuau";
	(modulo as unknown as { Source: string }).Source = `return function(plugin)\n${codigo}\nend`;
	const [carregou, f] = pcall(() => require(modulo));
	modulo.Destroy();
	if (!carregou) error(`não compilou: ${tostring(f)}`, 0);
	if (!typeIs(f, "function")) error("o módulo não devolveu uma função", 0);
	// Só o primeiro valor devolvido (para vários, devolva uma tabela).
	const [ok, valor] = pcall(f as (p: Plugin) => unknown, ambiente().plugin);
	if (!ok) error(`erro: ${tostring(valor)}`, 0);
	return paraJson(valor);
}

const COMANDOS: Record<string, (args: Args) => unknown> = {
	ping: () => {
		const a = ambiente();
		return { versao: a.versao, hash: a.hash, origem: a.origem, sessao: a.sessao };
	},

	estado: () => {
		const a = ambiente();
		const selecao = new Array<string>();
		pcall(() => {
			for (const i of Selection.Get()) selecao.push(i.GetFullName());
		});
		return {
			place: game.Name,
			placeId: game.PlaceId,
			modo: modoAtual(),
			selecao,
			ferramentas_abertas: ferramentasAbertas(),
			atributos: atributosDeTeste(),
			mapa_aberto: controleMapas()?.resumo().id,
			folhas_locais: folhasLocais(),
			config_guardada: { folhas_locais: paraJson(lerConfig<unknown>("Diorama_folhasLocais", "(nada)")), permitir_luau: paraJson(lerConfig<unknown>(CHAVE_LUAU, "(nada)")) },
			permitir_luau: permitirLuau(),
			versao: a.versao,
			hash: a.hash,
			origem: a.origem,
		};
	},

	abrir_ferramenta: (args) => {
		const id = texto(args.id);
		if (id === undefined) error("falta id", 0);
		const erro = mostrar(id);
		if (erro !== undefined) error(erro, 0);
		return true;
	},

	abrir_mapa: (args) => {
		const id = texto(args.id);
		if (id === undefined) error("falta id", 0);
		const erro = mostrar("mapas");
		if (erro !== undefined) error(`a ferramenta Mapas não montou: ${erro}`, 0);
		const c = esperarControleMapas();
		if (!c) error("o painel Mapas não ficou pronto", 0);
		const r = c.abrir(id, args.descartar === true);
		if (!r.ok) error(r.erro, 0);
		return paraJson(r.resumo);
	},

	testar_mapa: (args) => {
		const id = texto(args.id);
		if (id === undefined) error("falta id", 0);
		const celula = args.celula;
		let textoCelula: string | undefined;
		if (typeIs(celula, "table")) {
			const [x, y] = celula as unknown[];
			if (!typeIs(x, "number") || !typeIs(y, "number")) error("celula precisa ser [x, y]", 0);
			textoCelula = `${x},${y}`;
		}
		const r1 = gravarAtributo(ATRIBUTO_INTERIOR_TESTE, id);
		if (!r1.ok) error(r1.mensagem ?? "não gravou InteriorTeste", 0);
		const r2 = gravarAtributo(ATRIBUTO_INTERIOR_CELULA, textoCelula);
		if (!r2.ok) error(r2.mensagem ?? "não gravou InteriorTesteCelula", 0);
		return { [ATRIBUTO_INTERIOR_TESTE]: id, [ATRIBUTO_INTERIOR_CELULA]: textoCelula };
	},

	parar_teste: () => {
		gravarAtributo(ATRIBUTO_INTERIOR_TESTE, undefined);
		gravarAtributo(ATRIBUTO_INTERIOR_CELULA, undefined);
		return true;
	},

	diagnosticar: () => {
		const d = diagnosticar();
		return paraJson({ ...d, resumo: resumir(d) });
	},

	autoteste: (args) => {
		const lista = typeIs(args.ferramentas, "table") ? (args.ferramentas as defined[]).filter((v): v is string => typeIs(v, "string")) : undefined;
		return paraJson(
			autoteste({
				ferramentas: lista,
				espera: typeIs(args.espera, "number") ? args.espera : undefined,
				remontar: args.remontar === true,
			}),
		);
	},

	output: (args) => {
		const desde = typeIs(args.desde, "number") ? args.desde : 0;
		const filtro = texto(args.filtro)?.lower();
		const limite = typeIs(args.limite, "number") ? args.limite : 200;
		const lista = mensagens().filter(
			(m) => m.n >= desde && (filtro === undefined || m.texto.lower().find(filtro, 1, true)[0] !== undefined),
		);
		const corte = lista.size() > limite ? lista.filter((_, i) => i >= lista.size() - limite) : lista;
		return {
			mensagens: corte.map((m) => ({ n: m.n, nivel: nivelDe(m.tipo), hora: m.hora, texto: m.texto })),
			proximo: corte.size() > 0 ? corte[corte.size() - 1].n + 1 : desde,
		};
	},

	recarregar_folhas: (args) => {
		const folha = texto(args.folha);
		// `ligar`/`desligar`: muda o interruptor "Folhas locais" (extensão do contrato, CONEXOES.md).
		if (args.ligar === true || args.desligar === true) {
			definirFolhasLocais(args.ligar === true);
			return { ativo: folhasLocais(), folhas: paraJson(folhasCarregadas()), aviso: avisoImagens() };
		}
		if (!folhasLocais()) return { ativo: false, aviso: "Folhas locais está desligado; nada a recarregar." };
		if (folhasCarregadas().size() === 0) {
			carregarImagensFolhas();
			return { ativo: true, folhas: paraJson(folhasCarregadas()) };
		}
		const resultado = recarregarFolhas(folha);
		// `pixel: [x, y]`: devolve também esse pixel lido da EditableImage (para conferir que a mudança chegou).
		let pixel: unknown;
		if (folha !== undefined && typeIs(args.pixel, "table")) {
			const [x, y] = args.pixel as number[];
			pixel = lerPixel(folha, x, y);
		}
		return { ativo: true, resultado: paraJson(resultado), pixel: paraJson(pixel) };
	},

	executar_luau: (args) => {
		if (!permitirLuau()) error('executar_luau está desligado: ligue "Permitir executar Luau" no painel Conexão do plugin', 0);
		const codigo = texto(args.codigo);
		if (codigo === undefined) error("falta codigo", 0);
		return executarLuau(codigo);
	},
};

function responder(id: string, corpo: unknown) {
	const [codificou, json] = pcall(() => HttpService.JSONEncode(corpo));
	const textoCorpo = codificou ? (json as string) : HttpService.JSONEncode({ ok: false, erro: `resposta que não vira JSON: ${tostring(json)}` });
	pedir("POST", `/studio/respostas/${id}`, textoCorpo);
}

function executar(comando: Comando) {
	const acao = COMANDOS[comando.tipo];
	let corpo: unknown;
	if (acao === undefined) corpo = { ok: false, erro: "comando desconhecido" };
	else {
		const [ok, valor] = pcall(() => acao(typeIs(comando.args, "table") ? comando.args : {}));
		corpo = ok ? { ok: true, valor } : { ok: false, erro: tostring(valor) };
	}
	responder(comando.id, corpo);
	const e = estadoCanal();
	estadoCanal({ ...e, atendidos: e.atendidos + 1, ultimo: `${comando.tipo}: ${(corpo as { ok: boolean }).ok ? "ok" : "erro"}` });
}

/** Começa a presença e o long-poll. Devolve a função que os para. */
export function iniciarCanal(): () => void {
	permitirLuau(lerConfig<unknown>(CHAVE_LUAU, false) === true);
	const a = ambiente();
	// Na sessão do cliente do Play o Studio recusa HTTP ("Http requests can only be executed by game server",
	// conferido em 2026-10-20): o canal fica desligado lá; a instância do servidor do Play se apresenta.
	if (modoAtual() === "cliente") {
		estadoCanal({ ligado: false, atendidos: 0, erro: "sem HTTP na sessão do cliente do Play" });
		return () => {};
	}
	let vivo = true;

	const presenca = () =>
		pedir(
			"POST",
			"/studio/presenca",
			HttpService.JSONEncode({
				sessao: a.sessao,
				place: game.Name,
				placeId: game.PlaceId,
				versao: a.versao,
				modo: modoAtual(),
				origem: a.origem,
			}),
		);

	task.spawn(() => {
		while (vivo) {
			const r = presenca();
			const e = estadoCanal();
			if (r.ok !== e.ligado || (!r.ok && r.erro !== e.erro)) estadoCanal({ ...e, ligado: r.ok, erro: r.ok ? undefined : r.erro });
			task.wait(INTERVALO_PRESENCA);
		}
	});

	task.spawn(() => {
		while (vivo) {
			const r = pedir("GET", `/studio/proximo?sessao=${a.sessao}&espera=${ESPERA_POLL}`);
			if (!r.ok) {
				if (vivo) task.wait(3);
				continue;
			}
			if (r.valor.status !== 200) continue;
			const [decodificou, comando] = pcall(() => HttpService.JSONDecode(r.valor.corpo) as Comando);
			if (!decodificou || !typeIs(comando, "table") || !typeIs(comando.id, "string")) continue;
			if (!vivo) {
				// O pacote parou enquanto esperava: o comando volta para a fila e o pacote novo o pega.
				pedir("POST", `/studio/respostas/${comando.id}`, HttpService.JSONEncode({ devolver: true }));
				break;
			}
			task.spawn(executar, comando);
		}
	});

	return () => {
		vivo = false;
		estadoCanal({ ligado: false, atendidos: estadoCanal().atendidos });
	};
}
