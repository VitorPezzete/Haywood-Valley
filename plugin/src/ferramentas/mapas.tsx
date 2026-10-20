// Mapa: o editor do bloco (docs/diorama/ARQUITETURA.md, ESPECIFICACAO.md seção 12), a seção principal da janela
// única (2026-10-20). Em cima, a barra (salvar, desfazer, pincéis, camadas, zoom, "⋯ Mais"); no meio, o canvas
// (mapas/canvas.tsx) e o painel Tiles / Peças / Marcadores (/ Log no Avançado), à direita com a janela larga e
// embaixo com a estreita; no rodapé, a mensagem e a célula sob o mouse. Sem mapa aberto, a tela inicial: abrir,
// novo mapa, verificar tudo. A lista de mapas também está no seletor do cabeçalho da janela (ui/janela.tsx).
// O bloco em si é um objeto mutável (mapas/bloco.ts) fora do Vide: quem o muda sobe `versao` (células) ou
// `versaoMarcadores`, e o canvas redesenha só o que mudou.
//
// "⋯ Mais" (2026-10-20): duplicar, renomear e apagar o mapa, o orçamento de desempenho (mapas/orcamento.ts) e
// "Gerar para o jogo".
//
// Atalhos (com o widget focado e nenhum campo de texto ativo): B pincel, R retângulo, G balde, E borracha,
// I conta-gotas; 1/2/3 camada chão/objeto/frente, 4 terreno; Ctrl+Z/Ctrl+Y; Ctrl+S salva; +/− zoom; Esc cancela.
//
// Proteções contra perder trabalho (2026-10-20): o mapa sujo vira um rascunho nas configurações do plugin quando o
// painel desmonta (recarga do pacote, Studio fechando) ou o widget fecha, e o painel oferece recuperá-lo; salvar
// confere antes se o bloco mudou no disco desde que foi aberto (outro programa gravou) e pede um segundo clique
// para sobrescrever; uma mudança feita enquanto o salvamento ia pela ponte deixa o mapa sujo. O último mapa, a
// ferramenta, a camada e o zoom ficam guardados entre as sessões.
import Vide, { action, effect, For, mount, source, untrack } from "@rbxts/vide";
import { cleanup } from "@rbxts/vide";
import { HttpService, RunService, UserInputService } from "@rbxts/services";
import { avisoImagens, carregarImagensFolhas, erroPonte, imagensFolhas, mapaAberto, mapaSujo, mapas as listaMapas, ponteLigada, recarregarMapas } from "../estado";
import { avancado, gradePadrao, lembrarMapa, zoomPadrao } from "../config";
import { ContextoSecao, mostrar, secaoVisivel } from "../widget";
import { acoesDe } from "../simulacao";
import { BotaoAvancado, BotaoGrande, Cartao, Vazio } from "../ui/simples";
import { orcamentoDoMapa } from "../mapas/orcamento";
import { Fileira, Preenche } from "../ui/kit";
import { gravarConfig, lerConfig } from "../ambiente";
import { canonico } from "../canonico";
import { abrirNoAseprite } from "../aseprite";
import { argNumero, argTexto, registrarAcoes } from "../simulacao";
import { ATRIBUTO_INTERIOR_CELULA, ATRIBUTO_INTERIOR_TESTE, gravarAtributo } from "../servidor/atributos";
import { AvisoFolhaSalva } from "../ui/alternarFolhas";
import * as ponte from "../ponte";
import { AreaTexto, Botao, Campo, Coluna, ESPACO, Linha, Lista, Painel, Rotulo, Separador, TextoCurto, Titulo, Tom } from "../ui/kit";
import { Alternar, Ciclo } from "../ui/kit";
import { Amostra, Legenda } from "../ui/extras";
import { AlternarFolhasLocais } from "../ui/alternarFolhas";
import { avisosDoBloco, CAMADA_TERRENO, desempacotar, empacotar, idValido, ModeloBloco, TERRENOS, TITULOS_CAMADA } from "../mapas/bloco";
import { CanvasBloco, Fantasma, Imagens, Modificadores } from "../mapas/canvas";
import { registrarControle, resumirModelo } from "../mapas/controle";
import { Historico } from "../mapas/historico";
import { PainelMarcadores, PedidoPosicao } from "../mapas/marcadores";
import { Paleta, SelecaoPaleta } from "../mapas/paleta";
import { PainelPecas } from "../mapas/pecas";
import {
	apagar,
	balde,
	Carimbo,
	carimboServe,
	carimboUnico,
	contaGotas,
	Ferramenta,
	NOME_DA_FERRAMENTA,
	pintar,
	retangulo,
	TECLA_DA_FERRAMENTA,
} from "../mapas/pinceis";
import { carimbarPeca, Catalogo, celulasDoPlano, normalizarCatalogo, Peca, planejarPeca } from "../mapas/regras";
import { DESCRICAO_ZONA, Tile, zonaDoTile } from "../mapas/zonas";


/** Largura do painel Tiles / Peças / Marcadores ao lado do canvas (janela larga). */
const DIREITA = 330;
/** Abaixo desta largura do corpo, o painel vai para baixo do canvas. */
const LARGURA_LADO_A_LADO = 720;
/** Os rascunhos dos mapas sujos (`{ [mapa]: { mapa, json, em, base? } }`) e as escolhas lembradas do editor (plugin:SetSetting). */
const CHAVE_RASCUNHOS = "Diorama_mapas_rascunhos";
const CHAVE_LEMBRAR = "Diorama_mapas_lembrar";

interface Rascunho {
	mapa: string;
	/** O bloco (`paraJson`) em JSON. */
	json: string;
	/** os.time() de quando foi guardado. */
	em: number;
	/** O bloco como estava no disco quando o mapa foi aberto (JSON canônico), para a conferência de conflito. */
	base?: string;
}

interface Lembrado {
	mapa?: string;
	ferramenta?: string;
	camada?: number;
	zoom?: number;
	aba?: string;
}

/** Os rascunhos guardados, pelo id do mapa (os estragados ficam de fora). */
function lerRascunhos(): Record<string, Rascunho> {
	const saida: Record<string, Rascunho> = {};
	const r = lerConfig<unknown>(CHAVE_RASCUNHOS, undefined);
	if (!typeIs(r, "table")) return saida;
	for (const [chave, valor] of pairs(r as Record<string, unknown>)) {
		if (!typeIs(chave, "string") || !typeIs(valor, "table")) continue;
		const t = valor as Partial<Rascunho>;
		if (!typeIs(t.mapa, "string") || !typeIs(t.json, "string") || !typeIs(t.em, "number")) continue;
		saida[chave] = { mapa: t.mapa, json: t.json, em: t.em, base: typeIs(t.base, "string") ? t.base : undefined };
	}
	return saida;
}

/** Os rascunhos como lista, do mais novo para o mais velho. */
function listaDeRascunhos(): Rascunho[] {
	const lista = new Array<Rascunho>();
	for (const [, r] of pairs(lerRascunhos())) lista.push(r);
	lista.sort((a, b) => a.em > b.em);
	return lista;
}

function lerLembrado(): Lembrado {
	const r = lerConfig<unknown>(CHAVE_LEMBRAR, undefined);
	return typeIs(r, "table") ? (r as Lembrado) : {};
}

const OPCOES_OPACIDADE = [
	{ valor: 0, texto: "opacas" },
	{ valor: 0.5, texto: "50%" },
	{ valor: 0.8, texto: "20%" },
	{ valor: 1, texto: "ocultas" },
];

const ABAS_DIREITA = [
	{ id: "tiles", titulo: "Tiles" },
	{ id: "pecas", titulo: "Peças" },
	{ id: "marcadores", titulo: "Marcadores" },
	{ id: "log", titulo: "Log" },
];

export function PainelMapas(props: { gui?: DockWidgetPluginGui }) {
	// ------------------------------------------------------------------ estado
	let modelo = ModeloBloco.novo("");
	const modeloAtual = () => modelo;
	const versao = source(0);
	const versaoMarcadores = source(0);
	const hist = new Historico();
	const sujo = source(false);
	/** Sobe a cada mudança no bloco: o salvamento só limpa `sujo` se nada mudou enquanto a ponte gravava. */
	let mudancas = 0;
	const marcarSujo = () => {
		mudancas++;
		sujo(true);
	};
	/** O bloco como estava no disco quando foi aberto (ou salvo por último), em JSON canônico; nada = mapa novo. */
	let baseDisco: string | undefined;
	/** O mapa cujo salvamento foi recusado por conflito: o próximo Salvar desse mapa sobrescreve. */
	let sobrescrever: string | undefined;
	/** Os rascunhos de sessões anteriores, esperando o autor recuperar ou descartar (o mais novo primeiro). */
	const rascunhosPendentes = source<Rascunho[]>(listaDeRascunhos());
	/** Os mapas cujo rascunho foi escrito nesta sessão (descartar as mudanças deles apaga o rascunho também). */
	const escritosNestaSessao = new Set<string>();

	const lembrado = lerLembrado();
	const ferramentaInicial = lembrado.ferramenta;
	const ferramenta = source<Ferramenta>(
		ferramentaInicial === "retangulo" || ferramentaInicial === "balde" || ferramentaInicial === "borracha" || ferramentaInicial === "contagotas"
			? ferramentaInicial
			: "pincel",
	);
	const camada = source(typeIs(lembrado.camada, "number") && lembrado.camada >= 0 && lembrado.camada <= CAMADA_TERRENO ? lembrado.camada : 0);
	// Zoom e grade começam como Configurações manda (o zoom não é mais lembrado por mapa).
	const zoom = source(zoomPadrao());
	const grade = source(gradePadrao());
	const opacidade = source(0.5);
	// As imagens das folhas são compartilhadas com o Catálogo (estado.ts); o canvas lê o mesmo tipo.
	const imagens: () => Imagens = () => imagensFolhas();
	const selecao = source<SelecaoPaleta | undefined>(undefined);
	const terrenoAtivo = source("g");
	const celula = source<[number, number] | undefined>(undefined);
	const ultimoClique = source<[number, number] | undefined>(undefined);
	const previa = source<[number, number, number, number] | undefined>(undefined);
	const pedido = source<PedidoPosicao | undefined>(undefined);

	const catalogo = source<Catalogo | undefined>(undefined);
	const erroCatalogo = source<string | undefined>(undefined);
	const peca = source<Peca | undefined>(undefined);
	const forma = source(0);
	const motivoPeca = source("");

	const mensagem = source("Escolha um mapa ou crie um novo.");
	const tomMensagem = source<Tom>("fraco");
	const log = source("");
	const ocupado = source(false);
	const confirmarDescarte = source<string | undefined>(undefined);
	const abaDireita = source(
		lembrado.aba === "pecas" || lembrado.aba === "marcadores" || lembrado.aba === "log" ? lembrado.aba : "tiles",
	);
	const idNovo = source("");
	/** A tela inicial pedida com um mapa aberto ("abrir" ou "novo"); sem mapa, ela aparece sempre. */
	const inicio = source<"abrir" | "novo" | undefined>(undefined);
	/** O "⋯ Mais" aberto e o que ele está fazendo. */
	const maisAberto = source(false);
	const acaoMais = source<"duplicar" | "renomear" | "apagar" | "orcamento" | undefined>(undefined);
	const nomeMais = source("");
	const textoOrcamento = source("");
	/** A tela inicial está à vista? (sem mapa aberto, ou pedida pelo seletor do cabeçalho). */
	const telaInicial = () => mapaAberto() === undefined || inicio() !== undefined;

	const avisar = (texto: string, tom: Tom = "aviso") => {
		mensagem(texto);
		tomMensagem(tom);
	};

	// ------------------------------------------------------------------ carimbo e fantasma

	let cacheSelecao: SelecaoPaleta | undefined;
	let cacheCarimbo: Carimbo | undefined;
	let cacheTerreno = "";
	let cacheCarimboTerreno: Carimbo | undefined;
	const carimboAtual = (): Carimbo | undefined => {
		if (camada() === CAMADA_TERRENO) {
			const t = terrenoAtivo();
			if (!cacheCarimboTerreno || cacheTerreno !== t) {
				cacheTerreno = t;
				cacheCarimboTerreno = carimboUnico(t);
			}
			return cacheCarimboTerreno;
		}
		const s = selecao();
		if (!s) return undefined;
		if (s !== cacheSelecao) {
			cacheSelecao = s;
			const valores = new Array<number>();
			for (let j = 0; j < s.altura; j++) {
				for (let i = 0; i < s.largura; i++) valores.push(empacotar(s.folha, s.c0 + i, s.l0 + j));
			}
			cacheCarimbo = { largura: s.largura, altura: s.altura, valores };
		}
		return cacheCarimbo;
	};

	let cacheCelulasDe: Carimbo | undefined;
	let cacheCelulas: Fantasma["celulas"] = [];
	const celulasDoCarimbo = (c: Carimbo) => {
		if (c === cacheCelulasDe) return cacheCelulas;
		cacheCelulasDe = c;
		cacheCelulas = [];
		for (let j = 0; j < c.altura; j++) {
			for (let i = 0; i < c.largura; i++) {
				const v = c.valores[j * c.largura + i];
				if (typeIs(v, "number")) {
					const tile = desempacotar(v);
					if (tile) cacheCelulas.push({ dx: i, dy: j, tile });
				} else {
					const t = TERRENOS.find((e) => e.codigo === v);
					cacheCelulas.push({ dx: i, dy: j, cor: t ? t.cor : Color3.fromRGB(255, 0, 255) });
				}
			}
		}
		return cacheCelulas;
	};
	let cacheChavePeca = "";
	let cacheCelulasPeca: Fantasma["celulas"] = [];
	const celulasBorracha: Fantasma["celulas"] = [{ dx: 0, dy: 0, cor: Color3.fromRGB(240, 80, 80) }];

	const fantasma = (): Fantasma | undefined => {
		versao();
		const c = celula();
		if (!c || pedido()) return undefined;
		const f = ferramenta();
		if (f === "contagotas") return undefined;
		if (f === "peca") {
			const p = peca();
			const cat = catalogo();
			if (!p || !cat) return undefined;
			const plano = planejarPeca(cat, modelo, p, forma(), c[0], c[1]);
			const chave = `${p.id}/${plano.forma}/${plano.variante}`;
			if (chave !== cacheChavePeca) {
				cacheChavePeca = chave;
				cacheCelulasPeca = celulasDoPlano(p, plano);
			}
			return { x: plano.x, y: plano.y, celulas: cacheCelulasPeca, transparencia: plano.ok ? 0.3 : 0.75 };
		}
		if (f === "borracha") return { x: c[0], y: c[1], celulas: celulasBorracha, transparencia: 0.5 };
		const carimbo = carimboAtual();
		if (!carimbo) return undefined;
		return { x: c[0], y: c[1], celulas: celulasDoCarimbo(carimbo), transparencia: 0.45 };
	};

	// ------------------------------------------------------------------ pintura

	const subir = () => versao(versao() + 1);
	const fecharLote = () => {
		if (hist.fecharLote()) marcarSujo();
		subir();
	};
	let pincelando = false;
	let arrasto: [number, number] | undefined;
	// A pincelada em andamento: onde começou, a última célula e as origens de carimbo já pintadas. Um carimbo maior
	// que 1 × 1 se repete alinhado ao começo (antes, arrastar um 2 × 2 o pintava de novo a cada célula, deslocado, e
	// borrava o padrão); e o mouse rápido não deixa buracos (as células entre duas leituras são preenchidas em linha).
	let tracoOrigem: [number, number] = [0, 0];
	let tracoUltima: [number, number] = [0, 0];
	const tracoFeitas = new Set<number>();
	const pincelarCelula = (x: number, y: number) => {
		if (ferramenta() === "borracha") return apagar(modelo, hist, camada(), x, y);
		const c = carimboAtual();
		if (!c) return;
		if (c.largura === 1 && c.altura === 1) return pintar(modelo, hist, camada(), x, y, c);
		const ox = tracoOrigem[0] + math.floor((x - tracoOrigem[0]) / c.largura) * c.largura;
		const oy = tracoOrigem[1] + math.floor((y - tracoOrigem[1]) / c.altura) * c.altura;
		const chave = (oy + 128) * 512 + (ox + 128);
		if (tracoFeitas.has(chave)) return;
		tracoFeitas.add(chave);
		pintar(modelo, hist, camada(), ox, oy, c);
	};
	const comecarTraco = (x: number, y: number) => {
		tracoOrigem = [x, y];
		tracoUltima = [x, y];
		tracoFeitas.clear();
		pincelarCelula(x, y);
	};
	/** Da última célula da pincelada até (x, y), em linha (Bresenham), sem repetir a de partida. */
	const continuarTraco = (x: number, y: number) => {
		let [cx, cy] = tracoUltima;
		const dx = math.abs(x - cx);
		const dy = -math.abs(y - cy);
		const sx = cx < x ? 1 : -1;
		const sy = cy < y ? 1 : -1;
		let erro = dx + dy;
		while (cx !== x || cy !== y) {
			const e2 = 2 * erro;
			if (e2 >= dy) {
				erro += dy;
				cx += sx;
			}
			if (e2 <= dx) {
				erro += dx;
				cy += sy;
			}
			pincelarCelula(cx, cy);
		}
		tracoUltima = [x, y];
	};

	const pegar = (x: number, y: number) => {
		const r = contaGotas(modelo, camada(), x, y);
		if (!r) return avisar("Nada nesta célula.", "fraco");
		if (typeIs(r.valor, "string")) {
			terrenoAtivo(r.valor);
			avisar(`Terreno: ${TERRENOS.find((t) => t.codigo === r.valor)?.nome ?? r.valor}.`, "normal");
			return;
		}
		const tile = desempacotar(r.valor);
		if (!tile) return;
		selecao({ folha: tile[0], c0: tile[1], l0: tile[2], largura: 1, altura: 1 });
		if (r.camada !== camada()) camada(r.camada);
		avisar(`Tile ${tile[0]} [${tile[1]}, ${tile[2]}] da camada ${TITULOS_CAMADA[r.camada]}.`, "normal");
	};

	const carimbar = (x: number, y: number) => {
		const p = peca();
		const cat = catalogo();
		if (!p || !cat) return avisar("Escolha uma peça na aba Peças.");
		const plano = planejarPeca(cat, modelo, p, forma(), x, y);
		if (!plano.ok) {
			motivoPeca(plano.motivo ?? "não cabe aqui.");
			avisar(plano.motivo ?? "A peça não cabe aqui.");
			return;
		}
		motivoPeca("");
		hist.iniciarLote();
		carimbarPeca(modelo, hist, p, plano);
		fecharLote();
		avisar(`${p.nome} carimbada em (${plano.x}, ${plano.y}).`, "ok");
	};

	const aoPressionar = (x: number, y: number, botao: 1 | 2, mod: Modificadores) => {
		ultimoClique([x, y]);
		const p = pedido();
		if (p) {
			if (botao !== 1) {
				pedido(undefined);
				avisar("Posicionamento cancelado.", "fraco");
				return;
			}
			if (p.tipo === "celula") {
				p.aplicar(x, y, x, y);
				pedido(undefined);
				marcarSujo();
				avisar(`${p.rotulo}: (${x}, ${y}).`, "ok");
			} else {
				arrasto = [x, y];
				previa([x, y, x, y]);
			}
			return;
		}
		if (botao === 2 || ferramenta() === "contagotas" || mod.alt) return pegar(x, y);
		const cam = camada();
		const f = ferramenta();
		if (f === "pincel" || f === "balde" || f === "retangulo") {
			const c = carimboAtual();
			if (!carimboServe(c, cam)) return avisar(cam === CAMADA_TERRENO ? "Escolha um terreno." : "Escolha um tile na paleta (aba Tiles).");
		}
		if (f === "pincel" || f === "borracha") {
			hist.iniciarLote();
			comecarTraco(x, y);
			pincelando = true;
			subir();
		} else if (f === "retangulo") {
			arrasto = [x, y];
			previa([x, y, x, y]);
		} else if (f === "balde") {
			hist.iniciarLote();
			balde(modelo, hist, cam, x, y, carimboAtual());
			fecharLote();
		} else if (f === "peca") {
			carimbar(x, y);
		}
	};
	const aoArrastar = (x: number, y: number) => {
		if (arrasto) {
			previa([arrasto[0], arrasto[1], x, y]);
			return;
		}
		if (!pincelando) return;
		continuarTraco(x, y);
		subir();
	};
	const aoSoltar = (x: number, y: number) => {
		if (arrasto) {
			const [x0, y0] = arrasto;
			arrasto = undefined;
			previa(undefined);
			const ax = math.min(x0, x);
			const ay = math.min(y0, y);
			const bx = math.max(x0, x);
			const by = math.max(y0, y);
			const p = pedido();
			if (p) {
				p.aplicar(ax, ay, bx, by);
				pedido(undefined);
				marcarSujo();
				avisar(`${p.rotulo}: [${ax}, ${ay}] – [${bx}, ${by}].`, "ok");
				return;
			}
			hist.iniciarLote();
			retangulo(modelo, hist, camada(), ax, ay, bx, by, ferramenta() === "borracha" ? undefined : carimboAtual());
			fecharLote();
			return;
		}
		if (pincelando) {
			pincelando = false;
			fecharLote();
		}
	};
	const aoMover = (c: [number, number] | undefined) => {
		celula(c);
		if (c && ferramenta() === "peca") {
			const p = peca();
			const cat = catalogo();
			if (p && cat) motivoPeca(planejarPeca(cat, modelo, p, forma(), c[0], c[1]).motivo ?? "");
		}
	};

	/** Cancela o posicionamento e o arrasto em andamento (o marcador que eles mudariam pode ter saído do bloco). */
	const cancelarPedidos = () => {
		pedido(undefined);
		arrasto = undefined;
		previa(undefined);
		if (pincelando) {
			pincelando = false;
			fecharLote();
		}
	};
	const desfazer = () => {
		cancelarPedidos();
		const passo = hist.desfazer(modelo);
		if (!passo) return avisar("Nada para desfazer.", "fraco");
		marcarSujo();
		if (passo.tipo === "marcadores") versaoMarcadores(versaoMarcadores() + 1);
		subir();
	};
	const refazer = () => {
		cancelarPedidos();
		const passo = hist.refazer(modelo);
		if (!passo) return avisar("Nada para refazer.", "fraco");
		marcarSujo();
		if (passo.tipo === "marcadores") versaoMarcadores(versaoMarcadores() + 1);
		subir();
	};

	// ------------------------------------------------------------------ ponte: mapas, assets, catálogo

	/** Quanto levou a última abertura de mapa: a leitura da ponte e a montagem no canvas (ms). */
	let tempos: { ponte_ms: number; montar_ms: number } | undefined;
	/** O último redesenho do canvas (ms) e se foi inteiro. */
	let ultimoRedesenho: { ms: number; tudo: boolean } | undefined;
	const trocarModelo = (novo: ModeloBloco, base: string | undefined) => {
		// Trocar um mapa sujo é descartar as mudanças dele: o rascunho que esta sessão escreveu para ele sai também.
		if (sujo() && escritosNestaSessao.has(modelo.mapa)) {
			escritosNestaSessao.delete(modelo.mapa);
			const todos = lerRascunhos();
			delete todos[modelo.mapa];
			gravarConfig(CHAVE_RASCUNHOS, todos);
		}
		pincelando = false;
		arrasto = undefined;
		hist.limpar();
		modelo = novo;
		baseDisco = base;
		sobrescrever = undefined;
		sujo(false);
		pedido(undefined);
		previa(undefined);
		mapaAberto(novo.mapa === "" ? undefined : novo.mapa);
		versaoMarcadores(versaoMarcadores() + 1);
		subir();
	};

	const carregarLista = recarregarMapas;
	const carregarImagens = carregarImagensFolhas;
	const carregarCatalogo = () => {
		const r = ponte.lerCatalogo("pecas");
		if (!r.ok) {
			catalogo(undefined);
			erroCatalogo(r.status === 404 ? "Sem catálogo: diorama/catalogo/pecas.json não existe na ponte." : `Catálogo: ${r.erro}`);
			return;
		}
		const fundos = ponte.lerCatalogo("fundos");
		const { catalogo: cat, avisos } = normalizarCatalogo(r.valor, fundos.ok ? fundos.valor : undefined);
		catalogo(cat);
		erroCatalogo(avisos.size() > 0 ? avisos.join(" ") : undefined);
		if (avisos.size() > 0) warn("[Diorama] catálogo:", avisos.join("\n"));
	};

	/** O bloco 0_0 de um mapa lido da ponte, ou nada. */
	const blocoDe = (m: ponte.Mapa) => m.blocos.find((b) => typeIs(b.bloco, "table") && b.bloco[0] === 0 && b.bloco[1] === 0);

	/** Lê o mapa pela ponte e o põe no editor. Yielda. Devolve o erro, se houve. */
	const carregarMapa = (id: string): string | undefined => {
		ocupado(true);
		const inicio = os.clock();
		const r = ponte.lerMapa(id);
		const lido = os.clock();
		if (!r.ok) {
			if (r.status === 404) {
				// O mapa sumiu do disco (apagado por fora): a lista à esquerda estava velha.
				avisar(`"${id}" não existe mais na ponte (apagado no disco?); a lista foi atualizada.`, "erro");
				carregarLista();
			} else avisar(`Não abriu "${id}": ${r.erro}`, "erro");
			ocupado(false);
			return r.erro;
		}
		ocupado(false);
		const bloco = blocoDe(r.valor);
		const novo = bloco ? ModeloBloco.deJson(bloco.conteudo) : ModeloBloco.novo(id);
		novo.mapa = id;
		trocarModelo(novo, bloco ? canonico(bloco.conteudo) : undefined);
		tempos = { ponte_ms: math.floor((lido - inicio) * 1000), montar_ms: math.floor((os.clock() - lido) * 1000) };
		const ret = novo.retanguloPintado();
		avisar(
			bloco
				? `"${id}" aberto: ${ret ? `${ret[2]} × ${ret[3]} células pintadas a partir de (${ret[0]}, ${ret[1]})` : "bloco vazio"}${novo.carimboLido ? `, carimbo ${novo.carimboLido}` : ""}.`
				: `"${id}" não tem o bloco 0_0; começando um vazio.`,
			"ok",
		);
		return undefined;
	};

	const abrirMapa = (id: string) => {
		if (ocupado()) return;
		if (sujo() && confirmarDescarte() !== id) {
			confirmarDescarte(id);
			return avisar(`"${modelo.mapa}" tem mudanças não salvas. Clique de novo em "${id}" para descartá-las.`);
		}
		confirmarDescarte(undefined);
		task.spawn(carregarMapa, id);
	};

	// ------------------------------------------------------------------ rascunhos

	/** Guarda o mapa sujo como rascunho (nas configurações do plugin, um por mapa). Não yielda. */
	const guardarRascunho = () => {
		if (!sujo() || modelo.mapa === "") return false;
		const [ok, json] = pcall(() => HttpService.JSONEncode(modelo.paraJson()));
		if (!ok) {
			warn(`[Diorama] não deu para guardar o rascunho de "${modelo.mapa}": ${tostring(json)}`);
			return false;
		}
		const todos = lerRascunhos();
		todos[modelo.mapa] = { mapa: modelo.mapa, json: json as string, em: os.time(), base: baseDisco };
		gravarConfig(CHAVE_RASCUNHOS, todos);
		escritosNestaSessao.add(modelo.mapa);
		return true;
	};
	/** Tira o rascunho do mapa (salvo, descartado ou recuperado). */
	const esquecerRascunho = (id: string) => {
		escritosNestaSessao.delete(id);
		const todos = lerRascunhos();
		if (todos[id] !== undefined) {
			delete todos[id];
			gravarConfig(CHAVE_RASCUNHOS, todos);
		}
		rascunhosPendentes(rascunhosPendentes().filter((r) => r.mapa !== id));
	};
	const rascunhoPendente = () => rascunhosPendentes()[0];
	const recuperarRascunho = () => {
		const r = rascunhoPendente();
		if (!r) return;
		if (sujo() && confirmarDescarte() !== `rascunho:${r.mapa}`) {
			confirmarDescarte(`rascunho:${r.mapa}`);
			return avisar(`"${modelo.mapa}" tem mudanças não salvas. Clique de novo em "Recuperar" para trocá-las pelo rascunho.`);
		}
		confirmarDescarte(undefined);
		const [ok, json] = pcall(() => HttpService.JSONDecode(r.json) as ponte.Bloco);
		if (!ok || !typeIs(json, "table")) {
			esquecerRascunho(r.mapa);
			return avisar("O rascunho guardado não abre (JSON estragado); descartado.", "erro");
		}
		const novo = ModeloBloco.deJson(json);
		novo.mapa = r.mapa;
		trocarModelo(novo, r.base);
		marcarSujo();
		esquecerRascunho(r.mapa);
		avisar(`Rascunho de "${r.mapa}" recuperado; salve para ele valer no disco.`, "ok");
	};
	const descartarRascunho = () => {
		const r = rascunhoPendente();
		if (!r) return;
		esquecerRascunho(r.mapa);
		avisar(`Rascunho de "${r.mapa}" descartado.`, "fraco");
	};
	const textoRascunho = () => {
		const r = rascunhoPendente();
		if (!r) return "";
		const mais = rascunhosPendentes().size() - 1;
		return `Mudanças não salvas de "${r.mapa}" guardadas em ${os.date("%d/%m %H:%M", r.em)} (o painel foi recarregado ou o Studio fechou com elas)${mais > 0 ? `; e mais ${mais} rascunho(s)` : ""}.`;
	};
	// Desmontar (recarga do pacote, Studio fechando) com mudança não salva: vira rascunho.
	cleanup(() => {
		if (guardarRascunho()) print(`[Diorama] Mapas: as mudanças não salvas de "${modelo.mapa}" ficaram guardadas como rascunho; abra Mapas para recuperar.`);
	});

	// ------------------------------------------------------------------ salvar, gerar, testar

	const criarMapa = () => {
		const id = idNovo().gsub("%s", "")[0];
		if (!idValido(id)) return avisar("Id inválido: só letras minúsculas, números e _.");
		if (listaMapas().some((m) => m.id === id)) return abrirMapa(id);
		if (sujo() && confirmarDescarte() !== id) {
			confirmarDescarte(id);
			return avisar(`"${modelo.mapa}" tem mudanças não salvas. Clique de novo em "Novo" para descartá-las.`);
		}
		confirmarDescarte(undefined);
		trocarModelo(ModeloBloco.novo(id), undefined);
		marcarSujo();
		avisar(`Mapa "${id}" criado; salve para ele existir na ponte.`, "ok");
	};

	/** Resultado do último salvamento (o `simular salvar` espera e devolve). */
	let ultimoSalvar: { ok: boolean; mensagem: string } | undefined;
	const salvar = (depois?: () => void) => {
		if (modelo.mapa === "") return avisar("Nenhum mapa aberto.");
		if (ocupado()) return;
		ocupado(true);
		ultimoSalvar = undefined;
		const id = modelo.mapa;
		const json = modelo.paraJson();
		const versaoSalva = mudancas;
		const forcar = sobrescrever === id;
		const terminar = (ok: boolean, mensagem: string, tom: Tom) => {
			ocupado(false);
			ultimoSalvar = { ok, mensagem };
			avisar(mensagem, tom);
		};
		task.spawn(() => {
			// Conflito: o bloco mudou no disco desde que foi aberto (outro programa, o MCP, outro Studio gravou)?
			if (!forcar) {
				const disco = ponte.lerMapa(id);
				if (!disco.ok && disco.status !== 404) return terminar(false, `Não salvou: não deu para conferir o disco (${disco.erro}).`, "erro");
				const bloco = disco.ok ? blocoDe(disco.valor) : undefined;
				const atual = bloco ? canonico(bloco.conteudo) : undefined;
				if (atual !== baseDisco) {
					sobrescrever = id;
					return terminar(
						false,
						atual === undefined
							? `"${id}" sumiu do disco desde que foi aberto. Clique em Salvar de novo para gravá-lo assim mesmo.`
							: `O bloco de "${id}" mudou no disco desde que foi aberto (outro programa gravou). Clique em Salvar de novo para sobrescrever, ou reabra o mapa (perde as mudanças daqui).`,
						"aviso",
					);
				}
			}
			const avisos = avisosDoBloco(
				modelo,
				listaMapas().map((m) => m.id),
			);
			const r = ponte.gravarBloco(id, json.bloco[0], json.bloco[1], json);
			if (!r.ok) return terminar(false, `Não salvou: ${r.erro}`, "erro");
			sobrescrever = undefined;
			// A base passa a ser o que a ponte gravou (ela normaliza o bloco; ler de volta evita um falso conflito).
			const relido = ponte.lerMapa(id);
			const bloco = relido.ok ? blocoDe(relido.valor) : undefined;
			if (modelo.mapa === id) baseDisco = bloco ? canonico(bloco.conteudo) : canonico(json);
			const mudouNoMeio = mudancas !== versaoSalva || modelo.mapa !== id;
			if (!mudouNoMeio) {
				sujo(false);
				esquecerRascunho(id);
			}
			carregarLista();
			terminar(
				true,
				`Salvo em ${r.valor.arquivo}.${mudouNoMeio ? " Houve mudanças enquanto salvava: salve de novo." : ""}${avisos.size() > 0 ? ` Avisos: ${avisos.join(" ")}` : ""}`,
				mudouNoMeio || avisos.size() > 0 ? "aviso" : "ok",
			);
			if (depois) depois();
		});
	};

	const gerar = () => {
		if (modelo.mapa === "") return avisar("Nenhum mapa aberto.");
		const rodar = () => {
			if (ocupado()) return;
			ocupado(true);
			abaDireita("log");
			log(`Gerando ${modelo.mapa}...`);
			task.spawn(() => {
				const r = ponte.gerarMapa(modelo.mapa);
				ocupado(false);
				if (!r.ok) {
					log(r.erro);
					return avisar(`Gerar: ${r.erro}`, "erro");
				}
				log(r.valor.log);
				avisar(r.valor.ok ? `Gerado: src/shared/interiors/${modelo.mapa}.ts (veja o Log).` : "O gerador falhou; veja o Log.", r.valor.ok ? "ok" : "erro");
			});
		};
		if (sujo()) salvar(rodar);
		else rodar();
	};

	const testar = () => {
		if (modelo.mapa === "") return avisar("Nenhum mapa aberto.");
		const c = ultimoClique() ?? modelo.marcadores.nascimento;
		// Pelo ChangeHistoryService, como a aba Atributos do Servidor (Ctrl+Z desfaz).
		const r1 = gravarAtributo(ATRIBUTO_INTERIOR_TESTE, modelo.mapa);
		const r2 = gravarAtributo(ATRIBUTO_INTERIOR_CELULA, c ? `${c[0]},${c[1]}` : undefined);
		if (!r1.ok || !r2.ok) return avisar(r1.mensagem ?? r2.mensagem ?? "Não gravou os atributos.", "erro");
		// Não há API pública de plugin para o Play Solo; RunService.Run() (modo Run, sem jogador) não serve ao teste.
		avisar(
			`Workspace.${ATRIBUTO_INTERIOR_TESTE} = "${modelo.mapa}"${c ? `, ${ATRIBUTO_INTERIOR_CELULA} = "${c[0]},${c[1]}"` : ""}. Dê Play (F5) no Studio; o mapa precisa estar gerado e sincronizado pelo Rojo.`,
			"ok",
		);
	};
	const pararTeste = () => {
		gravarAtributo(ATRIBUTO_INTERIOR_TESTE, undefined);
		gravarAtributo(ATRIBUTO_INTERIOR_CELULA, undefined);
		if (RunService.IsRunning()) {
			// `RunService.Stop` falta nos tipos do @rbxts/types (segurança de plugin); existe no Studio.
			const [ok] = pcall(() => (RunService as unknown as { Stop(this: unknown): void }).Stop());
			avisar(ok ? "Atributos limpos; sessão parada." : "Atributos limpos; pare a sessão à mão (Stop).", ok ? "ok" : "aviso");
		} else avisar("Atributos de teste limpos.", "ok");
	};

	// ------------------------------------------------------------------ abrir no começo

	const atualizarTudo = (depois?: () => void) => {
		if (ocupado()) return;
		ocupado(true);
		task.spawn(() => {
			const r = carregarLista();
			carregarImagens();
			carregarCatalogo();
			ocupado(false);
			if (!r.ok) avisar(r.erro, "erro");
			else avisar(`${r.valor.size()} mapa(s) na ponte.`, "normal");
			if (depois) depois();
		});
	};
	// Na montagem: a lista, as imagens e o catálogo; depois reabre o último mapa (se não há rascunho esperando).
	atualizarTudo(() => {
		const ultimo = lembrarMapa() ? lembrado.mapa : undefined;
		if (modelo.mapa !== "" || rascunhosPendentes().some((r) => r.mapa === ultimo) || ultimo === undefined) return;
		if (!listaMapas().some((m) => m.id === ultimo)) return;
		carregarMapa(ultimo);
	});

	// Lembra o mapa, a ferramenta, a camada, o zoom e a aba (gravado só quando muda).
	// Sem mapa aberto (a montagem, a desmontagem), fica o último lembrado: senão o painel esqueceria o mapa a
	// cada recarga.
	let ultimoMapa = lembrado.mapa;
	effect(() => {
		const aberto = mapaAberto();
		if (aberto !== undefined) ultimoMapa = aberto;
		const atual: Lembrado = { mapa: ultimoMapa, ferramenta: ferramenta(), camada: camada(), zoom: zoom(), aba: abaDireita() };
		untrack(() => gravarConfig(CHAVE_LEMBRAR, atual));
	});

	// Fechar o widget com mudança não salva: as mudanças continuam no editor, mas viram rascunho também (o Studio
	// pode fechar antes de o widget abrir de novo).
	if (props.gui) {
		const gui = props.gui;
		cleanup(
			gui.GetPropertyChangedSignal("Enabled").Connect(() => {
				if (gui.Enabled || !sujo()) return;
				if (guardarRascunho()) warn(`[Diorama] Mapas fechado com mudanças não salvas em "${modelo.mapa}": continuam no editor (e guardadas como rascunho). Salve com Ctrl+S.`);
			}),
		);
	}

	/** "Abrir no Aseprite" da paleta: a seleção vira um sprite no Aseprite (pela ponte). Yielda. */
	const abrirSelecaoNoAseprite = (s: SelecaoPaleta) => {
		avisar(`Abrindo ${s.folha} [${s.c0}, ${s.l0}] no Aseprite...`, "fraco");
		const r = abrirNoAseprite(s.folha, s.c0, s.l0, s.largura, s.altura);
		avisar(r.mensagem, r.ok ? "ok" : "erro");
		return r;
	};

	// ------------------------------------------------------------------ o editor visto de fora

	/** Espera o painel terminar uma leitura ou gravação da ponte (até `segundos`). Yielda. */
	const esperarLivre = (segundos = 15) => {
		const limite = os.clock() + segundos;
		while (ocupado() && os.clock() < limite) task.wait();
	};

	// O controle de fora (canal do Studio: abrir_mapa; autoteste).
	cleanup(
		registrarControle({
			clicar: (id) => {
				inicio(undefined);
				abrirMapa(id);
				return confirmarDescarte() === id ? mensagem() : undefined;
			},
			inicio: (modo) => {
				inicio(modo);
				if (modo === "novo") idNovo("");
			},
			salvar: () => {
				esperarLivre(10);
				salvar();
				task.wait();
				esperarLivre(30);
				return ultimoSalvar ?? { ok: false, mensagem: mensagem() };
			},
			celulaDeTeste: () => ultimoClique() ?? modelo.marcadores.nascimento,
			contexto: () => ({
				celula: celula(),
				ultimo_clique: ultimoClique(),
				ferramenta: ferramenta(),
				camada: TITULOS_CAMADA[camada()],
				tile_escolhido: selecao() ? `${selecao()!.folha} [${selecao()!.c0}, ${selecao()!.l0}] ${selecao()!.largura}×${selecao()!.altura}` : undefined,
				peca: ferramenta() === "peca" ? peca()?.id : undefined,
				nao_salvo: sujo(),
			}),
			ocupado: () => ocupado(),
			abrir: (id, descartar) => {
				if (sujo() && !descartar) return { ok: false, erro: `o editor tem mudanças não salvas em "${modelo.mapa}"` };
				// Espera outra leitura em andamento terminar (o botão Atualizar, por exemplo).
				esperarLivre(10);
				confirmarDescarte(undefined);
				const erro = carregarMapa(id);
				if (erro !== undefined) return { ok: false, erro };
				return { ok: true, resumo: resumirModelo(modelo, sujo(), tempos) };
			},
			modelo: () => modelo,
			resumo: () => resumirModelo(modelo, sujo(), tempos),
			sujo: () => sujo(),
		}),
	);

	// As ações dos cliques, para o comando `simular` e o autoteste (simulacao.ts): cada uma chama o que o clique
	// chamaria. Os marcadores registram as deles em `acoesMarcadores` (o painel Marcadores as preenche).
	const acoesMarcadores: Record<string, (args: Record<string, unknown>) => unknown> = {};
	const estadoDoEditor = () => ({
		resumo: resumirModelo(modelo, sujo(), tempos),
		ferramenta: ferramenta(),
		camada: camada(),
		zoom: zoom(),
		mensagem: mensagem(),
		pedido: pedido()?.rotulo,
		ocupado: ocupado(),
		rascunhos_pendentes: rascunhosPendentes().map((r) => r.mapa),
		rascunhos_guardados: listaDeRascunhos().map((r) => r.mapa),
		redesenho: ultimoRedesenho,
		desfazer: hist.podeDesfazer(),
		refazer: hist.podeRefazer(),
	});
	const naCelula = (args: Record<string, unknown>): [number, number] => [argNumero(args, "x"), argNumero(args, "y")];
	cleanup(
		registrarAcoes("mapas", {
			estado: () => estadoDoEditor(),
			aba: (args) => abaDireita(argTexto(args, "id")),
			ferramenta: (args) => {
				const f = argTexto(args, "f") as Ferramenta;
				if (NOME_DA_FERRAMENTA[f] === undefined) error(`ferramenta desconhecida: ${f}`, 0);
				ferramenta(f);
				return f;
			},
			camada: (args) => {
				const n = argNumero(args, "n");
				if (n < 0 || n > CAMADA_TERRENO) error("camada de 0 a 3", 0);
				camada(n);
				return n;
			},
			terreno: (args) => terrenoAtivo(argTexto(args, "codigo")),
			tile: (args) => {
				const s: SelecaoPaleta = {
					folha: argTexto(args, "folha"),
					c0: argNumero(args, "c"),
					l0: argNumero(args, "l"),
					largura: typeIs(args.w, "number") ? args.w : 1,
					altura: typeIs(args.h, "number") ? args.h : 1,
				};
				selecao(s);
				return s;
			},
			pressionar: (args) => {
				const [x, y] = naCelula(args);
				aoPressionar(x, y, args.botao === 2 ? 2 : 1, { ctrl: false, shift: false, alt: args.alt === true });
				return estadoDoEditor();
			},
			arrastar: (args) => {
				const [x, y] = naCelula(args);
				aoArrastar(x, y);
				return true;
			},
			soltar: (args) => {
				const [x, y] = naCelula(args);
				aoSoltar(x, y);
				return estadoDoEditor();
			},
			/** Pressiona em (x, y), arrasta pelos pontos de `por` ([[x, y], ...]) e solta no último. */
			traco: (args) => {
				const [x, y] = naCelula(args);
				aoPressionar(x, y, 1, { ctrl: false, shift: false, alt: false });
				let fim: [number, number] = [x, y];
				if (typeIs(args.por, "table")) {
					for (const p of args.por as Array<[number, number]>) {
						aoArrastar(p[0], p[1]);
						fim = [p[0], p[1]];
					}
				}
				aoSoltar(fim[0], fim[1]);
				return estadoDoEditor();
			},
			desfazer: () => {
				desfazer();
				return estadoDoEditor();
			},
			refazer: () => {
				refazer();
				return estadoDoEditor();
			},
			pecas: () => (catalogo()?.pecas ?? []).map((p) => ({ id: p.id, nome: p.nome, regras: p.regras, tipo: p.tipo })),
			peca: (args) => {
				const id = argTexto(args, "id");
				const p = catalogo()?.pecas.find((x) => x.id === id);
				if (!p) error(`peça desconhecida no catálogo: ${id}`, 0);
				peca(p);
				forma(typeIs(args.forma, "number") ? args.forma : 0);
				ferramenta("peca");
				return p.nome;
			},
			marcador: (args) => {
				const acao = argTexto(args, "acao");
				const f = acoesMarcadores[acao];
				if (!f) error(`ação de marcador desconhecida: ${acao}`, 0);
				return f(args);
			},
			novo: (args) => {
				idNovo(argTexto(args, "id"));
				criarMapa();
				return estadoDoEditor();
			},
			/** Como o clique na lista: com mudança não salva, o primeiro clique só pede confirmação. */
			clicar_mapa: (args) => {
				abrirMapa(argTexto(args, "id"));
				task.wait();
				esperarLivre();
				return estadoDoEditor();
			},
			/** Salva e espera. `pintar_durante: [x, y]`: um clique de pincel enquanto a ponte grava (o mapa fica sujo). */
			salvar: (args) => {
				salvar();
				if (typeIs(args.pintar_durante, "table")) {
					const [x, y] = args.pintar_durante as [number, number];
					aoPressionar(x, y, 1, { ctrl: false, shift: false, alt: false });
					aoSoltar(x, y);
				}
				task.wait();
				esperarLivre();
				return { salvar: ultimoSalvar, estado: estadoDoEditor() };
			},
			testar: () => {
				testar();
				return mensagem();
			},
			parar_teste: () => {
				pararTeste();
				return mensagem();
			},
			aseprite: () => {
				const s = selecao();
				if (!s) error("nenhuma seleção na paleta", 0);
				return abrirSelecaoNoAseprite(s);
			},
			guardar_rascunho: () => guardarRascunho(),
			reler_rascunhos: () => {
				rascunhosPendentes(listaDeRascunhos().filter((r) => !escritosNestaSessao.has(r.mapa)));
				return rascunhosPendentes().map((r) => r.mapa);
			},
			recuperar_rascunho: () => {
				recuperarRascunho();
				return estadoDoEditor();
			},
			descartar_rascunho: () => {
				descartarRascunho();
				return estadoDoEditor();
			},
			esquecer_rascunho: (args) => {
				esquecerRascunho(argTexto(args, "mapa"));
				return true;
			},
		}),
	);

	// ------------------------------------------------------------------ título e teclado

	// O cabeçalho da janela mostra o mapa e o "*" (ui/janela.tsx); aqui só o espelho do sujo.
	effect(() => mapaSujo(sujo()));
	cleanup(() => {
		mapaAberto(undefined);
		mapaSujo(false);
	});

	let focado = props.gui === undefined;
	if (props.gui) {
		cleanup(
			props.gui.WindowFocused.Connect(() => {
				focado = true;
			}),
		);
		cleanup(
			props.gui.WindowFocusReleased.Connect(() => {
				focado = false;
			}),
		);
	}
	cleanup(
		UserInputService.InputBegan.Connect((input) => {
			if (!focado || input.UserInputType !== Enum.UserInputType.Keyboard) return;
			// A janela tem várias seções: os atalhos do editor só valem com o Mapa à vista e a tela inicial fechada.
			if (!secaoVisivel("mapa") || telaInicial()) return;
			if (UserInputService.GetFocusedTextBox() !== undefined) return;
			const ctrl = UserInputService.IsKeyDown(Enum.KeyCode.LeftControl) || UserInputService.IsKeyDown(Enum.KeyCode.RightControl);
			const k = input.KeyCode;
			if (ctrl && k === Enum.KeyCode.Z) return desfazer();
			if (ctrl && k === Enum.KeyCode.Y) return refazer();
			if (ctrl && k === Enum.KeyCode.S) return salvar();
			if (ctrl) return;
			if (k === Enum.KeyCode.Escape && maisAberto()) return maisAberto(false);
			if (k === Enum.KeyCode.One) return camada(0);
			if (k === Enum.KeyCode.Two) return camada(1);
			if (k === Enum.KeyCode.Three) return camada(2);
			if (k === Enum.KeyCode.Four) return camada(CAMADA_TERRENO);
			if (k === Enum.KeyCode.Equals || k === Enum.KeyCode.KeypadPlus) return zoom(math.min(3, zoom() + 1));
			if (k === Enum.KeyCode.Minus || k === Enum.KeyCode.KeypadMinus) return zoom(math.max(1, zoom() - 1));
			if (k === Enum.KeyCode.Escape) {
				cancelarPedidos();
				if (ferramenta() === "peca") ferramenta("pincel");
				return;
			}
			for (const [tecla, f] of TECLA_DA_FERRAMENTA) if (k === tecla) ferramenta(f);
		}),
	);

	// ------------------------------------------------------------------ textos da barra

	const textoTile = (tile: Tile | undefined) => (tile ? `${tile[0]}[${tile[1]},${tile[2]}]` : "—");
	const linhaCelula = () => {
		versao();
		const c = celula();
		if (!c) return "Célula: —";
		const [x, y] = c;
		const topo = modelo.topo(x, y);
		const terreno = modelo.terreno[modelo.indice(x, y)];
		return `(${x}, ${y})  chão ${textoTile(modelo.tile(0, x, y))}  objeto ${textoTile(modelo.tile(1, x, y))}  frente ${textoTile(modelo.tile(2, x, y))}  terreno ${terreno === "" ? "—" : terreno}  ·  ${topo ? DESCRICAO_ZONA[zonaDoTile(topo)] : "sem tile"}${modelo.bloqueia(x, y) ? " · bloqueia" : ""}`;
	};
	const linhaEstado = () => {
		const p = pedido();
		if (p) return `Clique${p.tipo === "retangulo" ? " e arraste" : ""} no canvas para posicionar: ${p.rotulo} (Esc cancela).`;
		const f = ferramenta();
		if (f === "peca") return `Peça: ${peca()?.nome ?? "nenhuma"} — clique no canvas para carimbar.`;
		return `${NOME_DA_FERRAMENTA[f]} na camada ${TITULOS_CAMADA[camada()]}.`;
	};

	// ------------------------------------------------------------------ "⋯ Mais": duplicar, renomear, apagar, orçamento

	/** Mapa sujo não se duplica nem se renomeia: a cópia sairia do disco, não do editor. */
	const exigirSalvo = () => {
		if (modelo.mapa === "") {
			avisar("Nenhum mapa aberto.");
			return false;
		}
		if (sujo()) {
			avisar("Salve o mapa antes (Ctrl+S).");
			return false;
		}
		return true;
	};
	/** Grava o bloco aberto com outro id. Yielda. */
	const gravarComo = (novo: string): string | undefined => {
		const json = modelo.paraJson();
		json.mapa = novo;
		const r = ponte.gravarBloco(novo, json.bloco[0], json.bloco[1], json);
		return r.ok ? undefined : r.erro;
	};
	const idDoCampo = () => nomeMais().gsub("%s", "")[0];
	const duplicarMapa = () => {
		if (!exigirSalvo() || ocupado()) return;
		const novo = idDoCampo();
		if (!idValido(novo)) return avisar("Nome inválido: só letras minúsculas, números e _.");
		if (listaMapas().some((m) => m.id === novo)) return avisar(`Já existe um mapa "${novo}".`);
		ocupado(true);
		task.spawn(() => {
			const erro = gravarComo(novo);
			carregarLista();
			ocupado(false);
			if (erro !== undefined) return avisar(`Não duplicou: ${erro}`, "erro");
			acaoMais(undefined);
			carregarMapa(novo);
			avisar(`Cópia "${novo}" criada e aberta.`, "ok");
		});
	};
	const renomearMapa = () => {
		if (!exigirSalvo() || ocupado()) return;
		const antigo = modelo.mapa;
		const novo = idDoCampo();
		if (!idValido(novo)) return avisar("Nome inválido: só letras minúsculas, números e _.");
		if (novo === antigo) return avisar("É o mesmo nome.");
		if (listaMapas().some((m) => m.id === novo)) return avisar(`Já existe um mapa "${novo}".`);
		ocupado(true);
		task.spawn(() => {
			const erro = gravarComo(novo);
			if (erro !== undefined) {
				ocupado(false);
				return avisar(`Não renomeou: ${erro}`, "erro");
			}
			const apagou = ponte.apagarMapa(antigo);
			carregarLista();
			ocupado(false);
			acaoMais(undefined);
			carregarMapa(novo);
			avisar(
				apagou.ok
					? `"${antigo}" agora é "${novo}". Saídas de outros mapas que levavam a "${antigo}" precisam do nome novo; gere de novo para o jogo.`
					: `Cópia "${novo}" criada, mas "${antigo}" não saiu: ${apagou.erro}`,
				apagou.ok ? "ok" : "aviso",
			);
		});
	};
	let confirmarApagar: string | undefined;
	const apagarMapaAberto = () => {
		const id = modelo.mapa;
		if (id === "" || ocupado()) return;
		if (confirmarApagar !== id) {
			confirmarApagar = id;
			return avisar(`Apagar "${id}" do disco? Clique em "Apagar" de novo para confirmar (o git guarda a última versão salva).`);
		}
		confirmarApagar = undefined;
		ocupado(true);
		task.spawn(() => {
			const r = ponte.apagarMapa(id);
			ocupado(false);
			if (!r.ok && r.status !== 404) return avisar(`Não apagou: ${r.erro}`, "erro");
			esquecerRascunho(id);
			sujo(false);
			trocarModelo(ModeloBloco.novo(""), undefined);
			carregarLista();
			acaoMais(undefined);
			maisAberto(false);
			avisar(`"${id}" apagado. O módulo gerado do jogo (src/shared/interiors/${id}.ts) continua até você apagá-lo.`, "ok");
		});
	};
	const mostrarOrcamento = () => {
		if (modelo.mapa === "") return avisar("Nenhum mapa aberto.");
		const o = orcamentoDoMapa(modelo);
		textoOrcamento(
			`${o.frase}\nPor camada: chão ${o.imagens[0]} (${o.celulas[0]} células), objeto ${o.imagens[1]} (${o.celulas[1]}), frente ${o.imagens[2]} (${o.celulas[2]}). Estimativa do editor; o número exato está no painel do jogo (Ctrl+Shift+O no Play).`,
		);
		acaoMais("orcamento");
	};
	const escolherAcaoMais = (a: "duplicar" | "renomear" | "apagar") => {
		confirmarApagar = undefined;
		nomeMais(a === "duplicar" ? `${modelo.mapa}_copia` : modelo.mapa);
		acaoMais(acaoMais() === a ? undefined : a);
	};
	const verificarTudo = () => {
		const ja = acoesDe("verificar") !== undefined;
		mostrar("verificar");
		if (ja) task.spawn(() => acoesDe("verificar")?.rodar({}));
	};
	const criarDaTelaInicial = () => {
		criarMapa();
		if (mapaAberto() !== undefined && mapaAberto() === idNovo().gsub("%s", "")[0]) inicio(undefined);
	};

	// ------------------------------------------------------------------ interface

	/** Largura do corpo (canvas + painel), para pôr o painel ao lado ou embaixo. */
	const larguraCorpo = source(1000);
	const ladoALado = () => larguraCorpo() >= LARGURA_LADO_A_LADO;
	const tamCanvas = () => (ladoALado() ? new UDim2(1, -(DIREITA + ESPACO), 1, 0) : new UDim2(1, 0, 0.55, -ESPACO / 2));
	const posLado = () => (ladoALado() ? new UDim2(1, -DIREITA, 0, 0) : new UDim2(0, 0, 0.55, ESPACO / 2));
	const tamLado = () => (ladoALado() ? new UDim2(0, DIREITA, 1, 0) : new UDim2(1, 0, 0.45, -ESPACO / 2));
	const abasDoLado = () => (avancado() ? ABAS_DIREITA : ABAS_DIREITA.filter((a) => a.id !== "log"));
	effect(() => {
		if (!avancado() && abaDireita() === "log") abaDireita("tiles");
	});
	const linhaSimples = () => {
		versao();
		const c = celula();
		if (!c) return "";
		const topo = modelo.topo(c[0], c[1]);
		return `${topo ? DESCRICAO_ZONA[zonaDoTile(topo)] : "vazio"}${modelo.bloqueia(c[0], c[1]) ? " · bloqueia" : ""}`;
	};

	return (
		<Painel margem={4}>
			{/* O editor */}
			<frame Name="Editor" Size={UDim2.fromScale(1, 1)} BackgroundTransparency={1} Visible={() => !telaInicial()}>
				<Coluna tamanho={UDim2.fromScale(1, 1)} espaco={4}>
					{/* Rascunho esperando */}
					<Coluna espaco={2} ordem={0} visivel={() => rascunhosPendentes().size() > 0}>
						<Rotulo texto={textoRascunho} tom="aviso" ordem={0} />
						<Linha espaco={4} ordem={1}>
							<Botao texto="Recuperar" principal={true} aoClicar={recuperarRascunho} ordem={0} />
							<Botao texto="Descartar" aoClicar={descartarRascunho} ordem={1} />
						</Linha>
					</Coluna>
					{/* Barra: quebra linha na janela estreita */}
					<Fileira ordem={1} espaco={3}>
						<Botao texto={() => (ocupado() ? "Aguarde..." : `Salvar Ctrl+S${sujo() ? " *" : ""}`)} principal={true} desligado={ocupado} aoClicar={() => salvar()} ordem={0} />
						<Botao texto="↶ Ctrl+Z" aoClicar={desfazer} ordem={1} />
						<Botao texto="↷ Ctrl+Y" aoClicar={refazer} ordem={2} />
						<Legenda texto="" largura={4} ordem={3} />
						{(["pincel", "retangulo", "balde", "borracha", "contagotas"] as Ferramenta[]).map((f, i) => (
							<Botao texto={NOME_DA_FERRAMENTA[f]} ativo={() => ferramenta() === f} aoClicar={() => ferramenta(f)} ordem={10 + i} />
						))}
						<Legenda texto="" largura={4} ordem={19} />
						{TITULOS_CAMADA.map((titulo, i) => (
							<Botao texto={`${i + 1} ${titulo}`} ativo={() => camada() === i} aoClicar={() => camada(i)} ordem={20 + i} />
						))}
						<Legenda texto="" largura={4} ordem={29} />
						<Botao texto="−" aoClicar={() => zoom(math.max(1, zoom() - 1))} ordem={30} />
						<Legenda texto={() => `${zoom()}×`} largura={22} ordem={31} />
						<Botao texto="+" aoClicar={() => zoom(math.min(3, zoom() + 1))} ordem={32} />
						<Alternar texto="Grade" valor={grade} ordem={33} />
						<Ciclo rotulo="Outras camadas" opcoes={OPCOES_OPACIDADE} valor={opacidade} ordem={34} />
						<Botao texto="⋯ Mais" ativo={maisAberto} aoClicar={() => maisAberto(!maisAberto())} ordem={40} />
					</Fileira>
					{/* Terrenos (camada 4) */}
					<Fileira ordem={2} espaco={3} visivel={() => camada() === CAMADA_TERRENO}>
						{TERRENOS.map((t, i) => (
							<Amostra cor={t.cor} texto={t.nome} ativo={() => terrenoAtivo() === t.codigo} aoClicar={() => terrenoAtivo(t.codigo)} ordem={i} />
						))}
					</Fileira>
					{/* ⋯ Mais */}
					<Cartao ordem={3} visivel={maisAberto} nome="Mais">
						<Fileira ordem={0} espaco={3}>
							<Botao texto="Duplicar" ativo={() => acaoMais() === "duplicar"} aoClicar={() => escolherAcaoMais("duplicar")} ordem={0} />
							<Botao texto="Renomear" ativo={() => acaoMais() === "renomear"} aoClicar={() => escolherAcaoMais("renomear")} ordem={1} />
							<Botao texto="Apagar" ativo={() => acaoMais() === "apagar"} aoClicar={() => escolherAcaoMais("apagar")} ordem={2} />
							<Botao texto="Orçamento" ativo={() => acaoMais() === "orcamento"} aoClicar={mostrarOrcamento} ordem={3} />
							<Botao texto="Gerar para o jogo" desligado={ocupado} aoClicar={gerar} ordem={4} />
							<Botao texto="Tela inicial" aoClicar={() => inicio("abrir")} ordem={5} />
						</Fileira>
						<Fileira ordem={1} visivel={() => acaoMais() === "duplicar" || acaoMais() === "renomear"}>
							<TextoCurto texto={() => (acaoMais() === "duplicar" ? "Nome da cópia:" : "Nome novo:")} tom="fraco" ordem={0} />
							<Campo
								valor={nomeMais}
								dica="nome_do_mapa"
								largura={new UDim(0, 180)}
								aoConfirmar={() => (acaoMais() === "duplicar" ? duplicarMapa() : renomearMapa())}
								ordem={1}
							/>
							<Botao
								texto={() => (acaoMais() === "duplicar" ? "Duplicar" : "Renomear")}
								principal={true}
								desligado={ocupado}
								aoClicar={() => (acaoMais() === "duplicar" ? duplicarMapa() : renomearMapa())}
								ordem={2}
							/>
						</Fileira>
						<Fileira ordem={2} visivel={() => acaoMais() === "apagar"}>
							<TextoCurto texto={() => `Apagar "${mapaAberto() ?? ""}" do disco?`} ordem={0} />
							<Botao texto="Apagar" principal={true} desligado={ocupado} aoClicar={apagarMapaAberto} ordem={1} />
						</Fileira>
						<Rotulo texto={() => (acaoMais() === "orcamento" ? textoOrcamento() : "")} ordem={3} />
					</Cartao>
					{/* Corpo: canvas e o painel Tiles / Peças / Marcadores */}
					<Preenche ordem={4}>
						<frame Name="Corpo" Size={UDim2.fromScale(1, 1)} BackgroundTransparency={1}>
							{action((f: Frame) => {
								larguraCorpo(f.AbsoluteSize.X);
								f.GetPropertyChangedSignal("AbsoluteSize").Connect(() => larguraCorpo(f.AbsoluteSize.X));
							})}
							<frame Name="AreaCanvas" Size={tamCanvas} BackgroundTransparency={1}>
								<CanvasBloco
									modelo={modeloAtual}
									versao={versao}
									versaoMarcadores={versaoMarcadores}
									zoom={zoom}
									grade={grade}
									camadaAtiva={camada}
									opacidadeInativa={opacidade}
									imagens={imagens}
									fantasma={fantasma}
									previa={previa}
									aoMover={aoMover}
									aoPressionar={aoPressionar}
									aoArrastar={aoArrastar}
									aoSoltar={aoSoltar}
									aoRedesenhar={(ms, tudo) => {
										ultimoRedesenho = { ms: math.floor(ms * 10) / 10, tudo };
									}}
								/>
							</frame>
							<frame Name="Direita" Position={posLado} Size={tamLado} BackgroundTransparency={1}>
								<frame Size={new UDim2(1, 0, 0, 28)} BackgroundTransparency={1}>
									<Linha espaco={2}>
										<For each={abasDoLado}>
											{(aba, i) => <Botao texto={aba.titulo} ativo={() => abaDireita() === aba.id} aoClicar={() => abaDireita(aba.id)} ordem={i()} />}
										</For>
									</Linha>
								</frame>
								<frame Name="Conteudo" Position={UDim2.fromOffset(0, 32)} Size={new UDim2(1, 0, 1, -32)} BackgroundTransparency={1}>
									<frame Size={UDim2.fromScale(1, 1)} BackgroundTransparency={1} Visible={() => abaDireita() === "tiles"}>
										<Paleta imagens={imagens} selecao={selecao} aviso={(texto) => avisar(texto)} aoAseprite={(s) => task.spawn(abrirSelecaoNoAseprite, s)} />
									</frame>
									<frame Size={UDim2.fromScale(1, 1)} BackgroundTransparency={1} Visible={() => abaDireita() === "pecas"}>
										<PainelPecas
											catalogo={catalogo}
											erro={erroCatalogo}
											imagens={imagens}
											selecionada={(valor?: Peca) => {
												if (valor !== undefined) {
													peca(valor);
													ferramenta("peca");
													motivoPeca("");
												}
												return peca();
											}}
											forma={forma}
											motivo={motivoPeca}
										/>
									</frame>
									<frame Size={UDim2.fromScale(1, 1)} BackgroundTransparency={1} Visible={() => abaDireita() === "marcadores"}>
										<PainelMarcadores
											modelo={modeloAtual}
											versao={versaoMarcadores}
											hist={hist}
											pedido={pedido}
											aoMudar={marcarSujo}
											aviso={avisar}
											acoes={acoesMarcadores}
										/>
									</frame>
									<frame Size={UDim2.fromScale(1, 1)} BackgroundTransparency={1} Visible={() => abaDireita() === "log"}>
										<AreaTexto texto={() => (log() === "" ? "O log do gerador aparece aqui." : log())} />
									</frame>
								</frame>
							</frame>
						</frame>
					</Preenche>
					{/* Rodapé */}
					<Coluna espaco={0} ordem={5}>
						<Rotulo texto={mensagem} tom={tomMensagem} ordem={0} />
						<Rotulo texto={linhaEstado} tom={() => (pedido() ? "aviso" : "fraco")} ordem={1} />
						<Rotulo texto={() => (avancado() ? linhaCelula() : linhaSimples())} tom="fraco" ordem={2} />
						<Rotulo texto={avisoImagens} tom="aviso" ordem={3} />
						<AvisoFolhaSalva horizontal={true} ordem={4} />
					</Coluna>
				</Coluna>
			</frame>

			{/* Tela inicial: sem mapa aberto (ou pedida pelo seletor do cabeçalho) */}
			<frame Name="Inicio" Size={UDim2.fromScale(1, 1)} BackgroundTransparency={1} Visible={telaInicial}>
				<Lista tamanho={UDim2.fromScale(1, 1)} espaco={8}>
					<uipadding PaddingTop={new UDim(0, 8)} PaddingLeft={new UDim(0, 8)} PaddingRight={new UDim(0, 14)} PaddingBottom={new UDim(0, 8)} />
					<Titulo texto={() => (mapaAberto() !== undefined ? `Mapa aberto: ${mapaAberto()}` : "Nenhum mapa aberto")} ordem={0} />
					<Coluna espaco={2} ordem={1} visivel={() => rascunhosPendentes().size() > 0}>
						<Rotulo texto={textoRascunho} tom="aviso" ordem={0} />
						<Linha espaco={4} ordem={1}>
							<Botao
								texto="Recuperar"
								principal={true}
								aoClicar={() => {
									inicio(undefined);
									recuperarRascunho();
								}}
								ordem={0}
							/>
							<Botao texto="Descartar" aoClicar={descartarRascunho} ordem={1} />
						</Linha>
					</Coluna>
					<BotaoGrande titulo="Abrir mapa" explicacao="Escolha um da lista abaixo." principal={true} aoClicar={() => inicio("abrir")} ordem={2} nome="AbrirMapa" />
					<BotaoGrande
						titulo="Novo mapa"
						explicacao="Um mapa vazio de 64 × 64 células."
						aoClicar={() => {
							idNovo("");
							inicio("novo");
						}}
						ordem={3}
						nome="NovoMapa"
					/>
					<BotaoGrande titulo="Verificar tudo" explicacao="Procura erros nos mapas, nas peças e nas imagens." aoClicar={verificarTudo} ordem={4} nome="VerificarTudo" />
					<Botao texto="Voltar ao mapa" aoClicar={() => inicio(undefined)} ordem={5} desligado={() => mapaAberto() === undefined} />
					<Separador ordem={6} />
					{/* Novo mapa */}
					<Coluna espaco={4} ordem={7} visivel={() => inicio() === "novo"}>
						<Rotulo texto="Nome do mapa novo (letras minúsculas, números e _):" negrito={true} ordem={0} />
						<Fileira ordem={1}>
							<Campo valor={idNovo} dica="casa_do_ze" aoConfirmar={criarDaTelaInicial} largura={new UDim(0, 200)} ordem={0} />
							<Botao texto="Criar (Enter)" principal={true} aoClicar={criarDaTelaInicial} ordem={1} />
						</Fileira>
					</Coluna>
					{/* Abrir mapa */}
					<Coluna espaco={4} ordem={8} visivel={() => inicio() !== "novo"}>
						<Fileira ordem={0}>
							<TextoCurto texto="Mapas" negrito={true} ordem={0} />
							<Botao texto={() => (ocupado() ? "Aguarde..." : "Atualizar")} desligado={ocupado} aoClicar={() => atualizarTudo()} ordem={1} />
						</Fileira>
						<Vazio
							texto={() => (ponteLigada() ? "" : (erroPonte() ?? "A ponte está desligada."))}
							botao="Tentar de novo"
							aoClicar={() => atualizarTudo()}
							tom="aviso"
							visivel={() => !ponteLigada() && !ocupado()}
							ordem={1}
						/>
						<Vazio
							texto="Ainda não há mapas. Crie o primeiro."
							botao="Novo mapa"
							aoClicar={() => inicio("novo")}
							visivel={() => ponteLigada() && listaMapas().size() === 0 && !ocupado()}
							ordem={2}
						/>
						<Fileira ordem={3} espaco={4}>
							<For each={() => listaMapas()}>
								{(m: ponte.ResumoMapa, i: () => number) => (
									<Botao
										texto={m.id}
										ativo={() => mapaAberto() === m.id}
										aoClicar={() => {
											inicio(undefined);
											abrirMapa(m.id);
											if (confirmarDescarte() === m.id) inicio("abrir");
										}}
										ordem={i()}
									/>
								)}
							</For>
						</Fileira>
					</Coluna>
					<Rotulo texto={mensagem} tom={tomMensagem} ordem={9} />
					<BotaoAvancado ordem={10} />
					<Rotulo
						texto={() =>
							avancado()
								? "Atalhos do editor: B pincel, R retângulo, G balde, E borracha, I conta-gotas, 1–4 camadas, +/− zoom, Ctrl+S salvar, Ctrl+Z/Ctrl+Y desfazer/refazer, Esc cancela."
								: ""
						}
						tom="fraco"
						ordem={11}
					/>
				</Lista>
			</frame>
		</Painel>
	);
}

export function montar(quadro: Frame, contexto: ContextoSecao) {
	return mount(() => <PainelMapas gui={contexto.gui} />, quadro);
}
