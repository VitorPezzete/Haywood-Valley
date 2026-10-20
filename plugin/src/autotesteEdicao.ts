// A parte do autoteste que mexe nos painéis como o autor mexeria (comando `simular`, simulacao.ts): pincela,
// desfaz, troca de camada, carimba peça, cria marcadores, salva, provoca conflito com o disco, recarrega o painel
// com mudança não salva e recupera o rascunho, apaga o mapa por fora. Tudo num mapa temporário
// (`zz_autoteste_edicao`), apagado no fim; o editor volta ao mapa que estava aberto.
//
// O Catálogo é testado sem gravar (outro programa pode estar mexendo em diorama/catalogo agora): criar uma peça
// deixa o catálogo sujo; "Recarregar" pede um segundo clique e só então descarta.
import type { Conferencia } from "./autoteste";
import type { ResumoMapaAberto } from "./mapas/controle";
import { controleMapas } from "./mapas/controle";
import * as ponte from "./ponte";
import { ATRIBUTO_ACOES_TESTE, ATRIBUTO_HORA, gravarAtributo, lerAtributo } from "./servidor/atributos";
import { AcaoSimulada, acoesDe, esperarAcoes } from "./simulacao";
import { desmontar, mostrar } from "./widget";

export const MAPA_EDICAO = "zz_autoteste_edicao";

interface EstadoEditor {
	resumo: ResumoMapaAberto;
	ferramenta: string;
	camada: number;
	mensagem: string;
	pedido?: string;
	ocupado: boolean;
	rascunhos_pendentes: string[];
	rascunhos_guardados: string[];
}

function conferir(lista: Conferencia[], nome: string, ok: boolean, detalhe: string) {
	lista.push({ nome, ok, detalhe });
}

/** As células do chão, objeto e frente do editor, em texto curto. */
function celulas(e: EstadoEditor) {
	const c = e.resumo.celulas;
	return `chão ${c.chao}, objeto ${c.objeto}, frente ${c.frente}`;
}

export function conferenciasEdicaoMapas(lista: Conferencia[]) {
	let acoes = acoesDe("mapas");
	const c = controleMapas();
	if (!acoes || !c) return conferir(lista, "edição", false, "o painel Mapas não registrou as ações");
	const original = c.modelo().mapa;
	const a = (nome: string, args: Record<string, unknown> = {}) => (acoes![nome] as AcaoSimulada)(args);
	const estado = () => a("estado") as EstadoEditor;
	const esperarLivre = () => {
		const limite = os.clock() + 15;
		while (estado().ocupado && os.clock() < limite) task.wait();
	};

	// Restos de uma execução anterior que parou no meio.
	ponte.apagarMapa(MAPA_EDICAO);
	a("esquecer_rascunho", { mapa: MAPA_EDICAO });

	// 1. Mapa novo.
	let e = a("novo", { id: MAPA_EDICAO }) as EstadoEditor;
	conferir(lista, "edição: mapa novo", e.resumo.id === MAPA_EDICAO && e.resumo.sujo, `${e.resumo.id}, sujo ${e.resumo.sujo}`);

	// 2. Pincel numa célula.
	a("camada", { n: 0 });
	a("ferramenta", { f: "pincel" });
	a("tile", { folha: "casa", c: 36, l: 16 });
	e = a("traco", { x: 5, y: 5 }) as EstadoEditor;
	conferir(lista, "edição: pincel numa célula", e.resumo.celulas.chao === 1, celulas(e));

	// 3. Mouse rápido: de (10, 10) a (14, 10) numa leitura só; as células do meio entram (antes ficavam buracos).
	e = a("traco", { x: 10, y: 10, por: [[14, 10]] }) as EstadoEditor;
	conferir(lista, "edição: traço sem buracos", e.resumo.celulas.chao === 6, `${celulas(e)} (esperado chão 6: 1 + 5 em linha)`);

	// 4. Carimbo 2 × 2 arrastado por 4 células: repete alinhado ao começo (2 carimbos = 8 células; antes, 10 borradas).
	a("tile", { folha: "casa", c: 36, l: 16, w: 2, h: 2 });
	e = a("traco", { x: 20, y: 20, por: [[21, 20], [22, 20], [23, 20]] }) as EstadoEditor;
	conferir(lista, "edição: carimbo 2 × 2 arrastado", e.resumo.celulas.chao === 14, `${celulas(e)} (esperado chão 14: 6 + 2 carimbos de 4)`);

	// 5. Desfazer e refazer.
	const d1 = a("desfazer") as EstadoEditor;
	const r1 = a("refazer") as EstadoEditor;
	const d2 = a("desfazer") as EstadoEditor;
	conferir(
		lista,
		"edição: desfazer e refazer",
		d1.resumo.celulas.chao === 6 && r1.resumo.celulas.chao === 14 && d2.resumo.celulas.chao === 6,
		`desfaz ${d1.resumo.celulas.chao}, refaz ${r1.resumo.celulas.chao}, desfaz ${d2.resumo.celulas.chao} (esperado 6, 14, 6)`,
	);

	// 6. Borracha e troca de camada (a borracha só apaga a camada ativa).
	a("ferramenta", { f: "borracha" });
	a("camada", { n: 1 });
	const naObjeto = a("traco", { x: 5, y: 5 }) as EstadoEditor;
	a("camada", { n: 0 });
	const naChao = a("traco", { x: 5, y: 5 }) as EstadoEditor;
	conferir(
		lista,
		"edição: borracha por camada",
		naObjeto.resumo.celulas.chao === 6 && naChao.resumo.celulas.chao === 5 && naChao.camada === 0,
		`na camada objeto: chão ${naObjeto.resumo.celulas.chao}; na de chão: ${naChao.resumo.celulas.chao} (esperado 6 e 5)`,
	);

	// 7. Peça do catálogo: a com regras é recusada sobre o vazio; a livre carimba.
	const pecas = a("pecas") as Array<{ id: string; regras: boolean }>;
	const comRegras = pecas.find((p) => p.regras);
	const livre = pecas.find((p) => !p.regras);
	if (comRegras) {
		a("peca", { id: comRegras.id });
		const antes = estado();
		const depois = a("pressionar", { x: 40, y: 40 }) as EstadoEditor;
		const recusou = depois.resumo.celulas.objeto === antes.resumo.celulas.objeto && depois.resumo.celulas.chao === antes.resumo.celulas.chao;
		conferir(lista, `edição: peça ${comRegras.id} sobre o vazio`, recusou, `recusada: ${depois.mensagem}`);
	} else conferir(lista, "edição: peça com regras", true, "pulado: o catálogo não tem peça com regras");
	if (livre) {
		a("peca", { id: livre.id });
		const antes = estado();
		const depois = a("pressionar", { x: 40, y: 40 }) as EstadoEditor;
		const total = (x: EstadoEditor) => x.resumo.celulas.chao + x.resumo.celulas.objeto + x.resumo.celulas.frente;
		conferir(lista, `edição: peça livre ${livre.id}`, total(depois) > total(antes), `${depois.mensagem} (${celulas(depois)})`);
		a("desfazer");
	} else conferir(lista, "edição: peça livre", true, "pulado: o catálogo não tem peça sem regras");
	a("ferramenta", { f: "pincel" });
	a("tile", { folha: "casa", c: 36, l: 16 });

	// 8. Marcadores: nascimento, uma saída com destino e chegada; desfazer com posicionamento pendente o cancela.
	a("marcador", { acao: "nascimento" });
	e = a("pressionar", { x: 10, y: 10 }) as EstadoEditor;
	const nasc = e.resumo.marcadores.nascimento;
	conferir(lista, "edição: nascimento", nasc !== undefined && nasc[0] === 10 && nasc[1] === 10, nasc ? `(${nasc[0]}, ${nasc[1]})` : "sem nascimento");
	a("marcador", { acao: "nova_saida" });
	a("traco", { x: 0, y: 0, por: [[1, 1]] });
	a("marcador", { acao: "aplicar_saida", mapa: "teste_d_destino", chegada: "porta_casa" });
	e = estado();
	conferir(lista, "edição: saída", e.resumo.marcadores.saidas === 1, `${e.resumo.marcadores.saidas} saída(s)`);
	a("marcador", { acao: "nova_entrada" });
	const comPedido = estado();
	const desfeito = a("desfazer") as EstadoEditor;
	conferir(
		lista,
		"edição: desfazer cancela o posicionamento",
		comPedido.pedido !== undefined && desfeito.pedido === undefined && desfeito.resumo.marcadores.entradas === 0,
		`pedido antes "${comPedido.pedido ?? "—"}", depois "${desfeito.pedido ?? "—"}"; ${desfeito.resumo.marcadores.entradas} entrada(s)`,
	);

	// 9. Salvar o mapa novo.
	let s = a("salvar") as { salvar?: { ok: boolean; mensagem: string }; estado: EstadoEditor };
	conferir(lista, "edição: salvar", s.salvar?.ok === true && !s.estado.resumo.sujo, s.salvar?.mensagem ?? "sem resposta");

	// 10. Uma pincelada enquanto a ponte grava: o mapa continua sujo (antes ficava limpo e a pincelada se perdia).
	s = a("salvar", { pintar_durante: [30, 30] }) as typeof s;
	const sujoDepois = s.estado.resumo.sujo;
	conferir(lista, "edição: pintar durante o salvamento", s.salvar?.ok === true && sujoDepois, `sujo depois: ${sujoDepois}; ${s.salvar?.mensagem ?? ""}`);
	a("salvar");

	// 11. Conflito: outro programa grava o bloco; Salvar recusa, o segundo Salvar sobrescreve.
	const lido = ponte.lerMapa(MAPA_EDICAO);
	if (lido.ok && lido.valor.blocos[0]) {
		const bloco = lido.valor.blocos[0].conteudo;
		bloco.nota = "gravado por fora (autoteste)";
		const gravou = ponte.gravarBloco(MAPA_EDICAO, 0, 0, bloco);
		a("traco", { x: 31, y: 31 });
		const primeiro = a("salvar") as typeof s;
		const segundo = a("salvar") as typeof s;
		conferir(
			lista,
			"edição: conflito com o disco",
			gravou.ok && primeiro.salvar?.ok === false && segundo.salvar?.ok === true && !segundo.estado.resumo.sujo,
			`1º: ${primeiro.salvar?.mensagem ?? "?"} | 2º: ${segundo.salvar?.ok === true ? "sobrescreveu" : (segundo.salvar?.mensagem ?? "?")}`,
		);
	} else conferir(lista, "edição: conflito com o disco", false, `não deu para ler o mapa salvo: ${lido.ok ? "sem bloco" : lido.erro}`);

	// 12. Rascunho: pinta, desmonta o painel (como uma recarga do pacote), monta de novo e recupera.
	a("traco", { x: 33, y: 33 });
	const antesDaRecarga = estado();
	desmontar("mapas");
	mostrar("mapas");
	acoes = esperarAcoes("mapas");
	if (!acoes) return conferir(lista, "edição: rascunho", false, "o painel não voltou depois de desmontar");
	esperarLivre();
	const pendentes = estado().rascunhos_pendentes;
	const recuperado = a("recuperar_rascunho") as EstadoEditor;
	conferir(
		lista,
		"edição: rascunho ao recarregar",
		pendentes.includes(MAPA_EDICAO) && recuperado.resumo.id === MAPA_EDICAO && recuperado.resumo.sujo && recuperado.resumo.celulas.chao === antesDaRecarga.resumo.celulas.chao,
		`pendentes [${pendentes.join(", ")}]; recuperado ${recuperado.resumo.id} com ${celulas(recuperado)} (antes ${celulas(antesDaRecarga)})`,
	);
	s = a("salvar") as typeof s;
	conferir(lista, "edição: salvar tira o rascunho", !s.estado.rascunhos_guardados.includes(MAPA_EDICAO), `guardados [${s.estado.rascunhos_guardados.join(", ")}]`);

	// 13. O mapa apagado por fora: abrir avisa e atualiza a lista.
	ponte.apagarMapa(MAPA_EDICAO);
	e = a("clicar_mapa", { id: MAPA_EDICAO }) as EstadoEditor;
	conferir(lista, "edição: mapa apagado no disco", e.mensagem.find("não existe mais", 1, true)[0] !== undefined, e.mensagem);

	// Volta ao mapa de antes.
	const c2 = controleMapas();
	if (c2 && original !== "" && original !== MAPA_EDICAO) c2.abrir(original, true);
	ponte.apagarMapa(MAPA_EDICAO);
	a("esquecer_rascunho", { mapa: MAPA_EDICAO });
}

export function conferenciasEdicaoCatalogo(lista: Conferencia[]) {
	const acoes = esperarAcoes("catalogo");
	if (!acoes) return conferir(lista, "edição do catálogo", false, "o painel Catálogo não registrou as ações");
	type Estado = { pecas: number; sujo_pecas: boolean; status: string; ocupado: boolean };
	const a = (nome: string, args: Record<string, unknown> = {}) => (acoes[nome] as AcaoSimulada)(args) as Estado;
	let e = a("estado");
	const limite = os.clock() + 10;
	while (e.ocupado && os.clock() < limite) {
		task.wait(0.1);
		e = a("estado");
	}
	if (e.sujo_pecas) return conferir(lista, "edição do catálogo", true, "pulado: o catálogo tem mudanças não salvas");
	const n = e.pecas;
	const criado = a("criar_peca", { folha: "casa", c: 100, l: 30, w: 2, h: 1 });
	const primeiro = a("recarregar");
	const segundo = a("recarregar");
	conferir(
		lista,
		"edição: criar peça e recarregar",
		criado.pecas === n + 1 && criado.sujo_pecas && primeiro.pecas === n + 1 && segundo.pecas === n && !segundo.sujo_pecas,
		`${n} → ${criado.pecas} (sujo); 1º Recarregar: ${primeiro.pecas} ("${primeiro.status}"); 2º: ${segundo.pecas}`,
	);
}

/** O que a aba Atributos do Servidor faz ao gravar e limpar (gravarAtributo, com passo de desfazer). */
export function conferenciasEdicaoServidor(lista: Conferencia[]) {
	const antes = [lerAtributo(ATRIBUTO_ACOES_TESTE), lerAtributo(ATRIBUTO_HORA)];
	const g1 = gravarAtributo(ATRIBUTO_ACOES_TESTE, true);
	const g2 = gravarAtributo(ATRIBUTO_HORA, 7.5);
	const lidos = [lerAtributo(ATRIBUTO_ACOES_TESTE), lerAtributo(ATRIBUTO_HORA)];
	gravarAtributo(ATRIBUTO_ACOES_TESTE, antes[0]);
	gravarAtributo(ATRIBUTO_HORA, antes[1]);
	const depois = [lerAtributo(ATRIBUTO_ACOES_TESTE), lerAtributo(ATRIBUTO_HORA)];
	conferir(
		lista,
		"gravar e limpar atributos",
		g1.ok && g2.ok && lidos[0] === true && lidos[1] === 7.5 && depois[0] === antes[0] && depois[1] === antes[1],
		`gravados ${tostring(lidos[0])}, ${tostring(lidos[1])}; de volta a ${tostring(depois[0])}, ${tostring(depois[1])}`,
	);
}
