// Catálogo: as folhas do Aeko inteiras (abas casa/castelo, zoom, grade, zonas como cor por cima), as peças de
// diorama/catalogo/pecas.json com miniatura, filtro e formulário (os campos do gerador: id, nome, folha, area,
// tipo, camada, bloqueia, acao/acoes, nota, e o `decorar` com formas, variantes e células), os tipos de fundo de
// fundos.json, a criação de peça arrastando na folha, os problemas do catálogo no rodapé, salvar na ponte
// (PUT /catalogo/<nome>) e o botão que roda o gerador --decorar (POST /gerar/decorar).
// O formato dos JSON está em ../catalogo/formato.ts (o do gerador, GERADOR.md); a folha, em ../ui/folhaVista.tsx.
// O que o plugin não edita (movel, fixo, luz, noite) aparece como texto e volta igual no arquivo.
import { HttpService } from "@rbxts/services";
import Vide, { batch, effect, For, mount, source, untrack } from "@rbxts/vide";
import { carregarMetades, Metades } from "../catalogo/folhas";
import {
	ACOES,
	CAMADAS,
	Camada,
	catalogoParaJson,
	CatalogoZonas,
	celulasDoTexto,
	contem,
	copiarPeca,
	COR_DA_ZONA,
	DESCRICAO_DA_ZONA,
	ENCAIXES,
	FOLHAS,
	FormaPeca,
	Fundo,
	fundoParaJson,
	lerCatalogo,
	lerFundo,
	lerPeca,
	lerZonas,
	NOME_DA_ACAO,
	NOME_DA_CAMADA,
	novaPeca,
	novoFundo,
	PAPEIS,
	Peca,
	pecaParaJson,
	Retangulo,
	retanguloTexto,
	textoDasCelulas,
	tileColunaLinha,
	tileNumero,
	TIPOS_SUGERIDOS,
	VariantePeca,
	varianteDaArea,
	zonaDoTile,
	ZONAS_PADRAO,
} from "../catalogo/formato";
import { Problema, problemasDoCatalogo } from "../catalogo/problemas";
import { gerarDecorar, gravarCatalogo, lerCatalogo as lerCatalogoPonte } from "../ponte";
import { Destaque, FolhaVista, TileSobMouse, ZOOM_MAXIMO } from "../ui/folhaVista";
import {
	Alternar,
	Botao,
	Campo,
	CampoMulti,
	Ciclo,
	cor,
	Escolha,
	ESPACO,
	Fileira,
	Linha,
	LinhaCampo,
	Lista,
	Marcas,
	Painel,
	Rotulo,
	Separador,
	tema,
	TextoCurto,
	TEXTO,
	Titulo,
} from "../ui/kit";
import { Recorte } from "../ui/recorte";
import { abrirWidget } from "../widget";

export const DESCRICAO =
	"As folhas do Aeko, as zonas e as peças com id, tipo, camada, ações e as formas do Decorar. Criar e editar peças e fundos e salvar em diorama/catalogo.";

// Medidas do painel, em pixels da tela.
const CABECALHO = 3 * (TEXTO + 10) + 2 * ESPACO;
const RODAPE = 100;
const ESQUERDA = 300;
const MINIATURA = 32;
/** A folha ocupa esta fração do meio; o formulário fica com o resto. */
const FRACAO_FOLHA = 0.42;
const MEIO_PERDIDO = CABECALHO + RODAPE + 2 * ESPACO;

const COR_DO_TIPO: Record<string, Color3> = {
	movel: Color3.fromRGB(80, 200, 120),
	parede: Color3.fromRGB(200, 120, 80),
	janela: Color3.fromRGB(120, 180, 255),
	quadro: Color3.fromRGB(230, 170, 60),
	tapete: Color3.fromRGB(200, 80, 160),
	cama: Color3.fromRGB(150, 230, 120),
	bau: Color3.fromRGB(160, 100, 220),
	fogao: Color3.fromRGB(255, 120, 60),
	luz: Color3.fromRGB(255, 240, 80),
	piso: Color3.fromRGB(220, 210, 140),
	fundo: Color3.fromRGB(150, 150, 150),
	outro: Color3.fromRGB(255, 255, 255),
};
const COR_FUNDO_SELECIONADO = Color3.fromRGB(80, 220, 255);
const COR_FUNDO_OUTRO = Color3.fromRGB(120, 120, 200);

const OPCOES_FOLHA = FOLHAS.map((f) => ({ id: f, titulo: f }));
const OPCOES_CAMADA = CAMADAS.map((c) => ({ id: tostring(c), titulo: `${c} ${NOME_DA_CAMADA[c]}` }));
const OPCOES_TIPO = TIPOS_SUGERIDOS.map((t) => ({ id: t, titulo: t }));
const OPCOES_ACAO = [{ id: "", titulo: "(sem campo)" }, ...ACOES.map((a) => ({ id: a, titulo: NOME_DA_ACAO[a] ?? a }))];
const OPCOES_BLOQUEIA = [
	{ valor: "", texto: "(sem campo)" },
	{ valor: "sim", texto: "sim" },
	{ valor: "nao", texto: "não" },
];
const OPCOES_OLHANDO = [
	{ id: "", titulo: "nenhum" },
	{ id: "0", titulo: "0 cima" },
	{ id: "1", titulo: "1 esquerda" },
	{ id: "2", titulo: "2 baixo" },
	{ id: "3", titulo: "3 direita" },
];
const OPCOES_ENCAIXE = [{ id: "", titulo: "nenhum" }, ...ENCAIXES.map((e) => ({ id: e, titulo: e }))];
const OPCOES_PAPEL = [{ id: "", titulo: "qualquer" }, ...PAPEIS.map((p) => ({ id: p, titulo: p }))];

/** Os campos de uma variante no formulário, cada um uma fonte. As células ficam em texto (formato.ts). */
interface FormVariante {
	chave: number;
	w: Vide.Source<string>;
	h: Vide.Source<string>;
	dx: Vide.Source<string>;
	dy: Vide.Source<string>;
	fundos: Vide.Source<string[]>;
	encTipo: Vide.Source<string>;
	encLinha: Vide.Source<string>;
	encPapel: Vide.Source<string>;
	celulas: Vide.Source<string>;
	erroCelulas: Vide.Source<string>;
}

interface FormForma {
	chave: number;
	olhando: Vide.Source<string>;
	variantes: Vide.Source<FormVariante[]>;
}

let proximaChave = 1;
function formVariante(v: VariantePeca): FormVariante {
	return {
		chave: proximaChave++,
		w: source(tostring(v.w)),
		h: source(tostring(v.h)),
		dx: source(tostring(v.dx)),
		dy: source(tostring(v.dy)),
		fundos: source([...v.fundos]),
		encTipo: source(v.encaixe?.tipo ?? ""),
		encLinha: source(tostring(v.encaixe?.linha ?? 0)),
		encPapel: source(v.encaixe?.papel ?? ""),
		celulas: source(textoDasCelulas(v.celulas)),
		erroCelulas: source(""),
	};
}

function formForma(f: FormaPeca): FormForma {
	return { chave: proximaChave++, olhando: source(f.olhando === undefined ? "" : tostring(f.olhando)), variantes: source(f.variantes.map(formVariante)) };
}

function inteiroOu(texto: string, padrao: number): number {
	const n = tonumber(texto);
	return n === undefined ? padrao : math.floor(n);
}

/** As linhas de um campo de várias linhas, sem as vazias e sem o \r. */
function linhasDe(texto: string): string[] {
	const saida = new Array<string>();
	for (const linha of texto.split("\n")) {
		const limpa = linha.gsub("\r", "")[0];
		if (limpa !== "") saida.push(limpa);
	}
	return saida;
}

export function PainelCatalogo() {
	// Estado geral
	const metades = source<Record<string, Metades>>({});
	const folha = source<string>(FOLHAS[0]);
	const zoom = source(2);
	const grade = source(true);
	const verZonas = source(false);
	const zonas = source<CatalogoZonas>(ZONAS_PADRAO);
	const pecas = source<Peca[]>([]);
	const fundos = source<Fundo[]>([]);
	let extrasPecas: Record<string, unknown> = {};
	let ordemPecas = new Array<string>();
	let extrasFundos: Record<string, unknown> = {};
	let ordemFundos = new Array<string>();
	const revisao = source(0);
	const sujoPecas = source(false);
	const sujoFundos = source(false);
	const aba = source<"pecas" | "fundos" | "zonas" | "log">("pecas");
	const filtroTexto = source("");
	const filtroTipo = source("");
	const filtroFolha = source("");
	const pecaSel = source<Peca | undefined>(undefined);
	const fundoSel = source<Fundo | undefined>(undefined);
	const sobMouse = source<TileSobMouse | undefined>(undefined);
	const status = source("Carregando...");
	const log = source("Ainda não rodou o gerador.");
	const ocupado = source(false);

	const bump = () => revisao(untrack(revisao) + 1);

	// Formulário da peça
	let carregando = false;
	const fId = source("");
	const fNome = source("");
	const fFolha = source<string>(FOLHAS[0]);
	const fC = source("0");
	const fL = source("0");
	const fW = source("1");
	const fH = source("1");
	const fTipo = source("outro");
	const fCamada = source("1");
	const fBloqueia = source("");
	const fAcao = source("");
	const fAcoes = source("");
	const fNota = source("");
	const fTemDecorar = source(false);
	const fFormas = source<FormForma[]>([]);
	const fExtras = source("");

	// Formulário do fundo
	const gId = source("");
	const gFolha = source<string>(FOLHAS[0]);

	function carregarPeca(p: Peca) {
		carregando = true;
		batch(() => {
			fId(p.id);
			fNome(p.nome);
			fFolha(p.folha);
			fC(tostring(p.area.c));
			fL(tostring(p.area.l));
			fW(tostring(p.area.w));
			fH(tostring(p.area.h));
			fTipo(p.tipo);
			fCamada(tostring(p.camada));
			fBloqueia(p.bloqueia === undefined ? "" : p.bloqueia ? "sim" : "nao");
			fAcao(p.acao ?? "");
			fAcoes(p.acoes ? p.acoes.join("\n") : "");
			fNota(p.nota ?? "");
			fTemDecorar(p.decorar !== undefined);
			fFormas(p.decorar ? p.decorar.formas.map(formForma) : []);
			const chaves = new Array<string>();
			for (const [k] of pairs(p.extras)) chaves.push(k as string);
			const [ok, texto] = pcall(() => HttpService.JSONEncode(p.extras));
			fExtras(chaves.size() > 0 ? `${chaves.join(", ")}: ${ok ? texto : "?"}` : "");
		});
		carregando = false;
	}

	function carregarFundo(f: Fundo) {
		carregando = true;
		batch(() => {
			gId(f.id);
			gFolha(f.folha);
		});
		carregando = false;
	}

	function selecionarPeca(p: Peca | undefined) {
		carregando = true;
		pecaSel(p);
		carregando = false;
		if (p) {
			carregarPeca(p);
			folha(p.folha);
		}
	}

	function selecionarFundo(f: Fundo | undefined) {
		carregando = true;
		fundoSel(f);
		carregando = false;
		if (f) {
			carregarFundo(f);
			folha(f.folha);
		}
	}

	/** A área que o formulário descreve agora (o que a folha destaca). */
	const areaDoFormulario = (): Retangulo | undefined => {
		const p = pecaSel();
		if (!p) return undefined;
		return {
			c: inteiroOu(fC(), p.area.c),
			l: inteiroOu(fL(), p.area.l),
			w: math.max(1, inteiroOu(fW(), p.area.w)),
			h: math.max(1, inteiroOu(fH(), p.area.h)),
		};
	};

	/** Lê as formas do formulário; a variante cujo texto de células não parse mantém as células de antes. */
	function formasDoFormulario(p: Peca): FormaPeca[] {
		return fFormas().map((f, fi) => {
			const anteriorForma = p.decorar?.formas[fi];
			const olhando = f.olhando();
			return {
				olhando: olhando === "" ? undefined : inteiroOu(olhando, 0),
				variantes: f.variantes().map((v, vi) => {
					const anterior = anteriorForma?.variantes[vi];
					const lido = celulasDoTexto(v.celulas());
					v.erroCelulas(lido.erros.size() > 0 ? lido.erros.join("; ") : "");
					const celulas = lido.erros.size() > 0 && anterior ? anterior.celulas : lido.celulas;
					const encTipo = v.encTipo();
					const encPapel = v.encPapel();
					return {
						w: math.max(1, inteiroOu(v.w(), anterior?.w ?? 1)),
						h: math.max(1, inteiroOu(v.h(), anterior?.h ?? 1)),
						dx: inteiroOu(v.dx(), 0),
						dy: inteiroOu(v.dy(), 0),
						fundos: [...v.fundos()],
						encaixe:
							encTipo === ""
								? undefined
								: {
										tipo: encTipo as "quadro" | "janela",
										linha: inteiroOu(v.encLinha(), 0),
										papel: encPapel === "" ? undefined : (encPapel as "azul" | "amarelo"),
									},
						celulas,
					};
				}),
			};
		});
	}

	// Cada mudança no formulário vai para a peça selecionada (menos enquanto o formulário está sendo preenchido).
	effect(() => {
		// Lê tudo, para o efeito acompanhar cada fonte, inclusive as das formas e variantes.
		const dados = {
			id: fId(),
			nome: fNome(),
			folha: fFolha(),
			c: fC(),
			l: fL(),
			w: fW(),
			h: fH(),
			tipo: fTipo(),
			camada: fCamada(),
			bloqueia: fBloqueia(),
			acao: fAcao(),
			acoes: fAcoes(),
			nota: fNota(),
			temDecorar: fTemDecorar(),
		};
		for (const f of fFormas()) {
			f.olhando();
			for (const v of f.variantes()) {
				v.w();
				v.h();
				v.dx();
				v.dy();
				v.fundos();
				v.encTipo();
				v.encLinha();
				v.encPapel();
				v.celulas();
			}
		}
		if (carregando) return;
		const p = untrack(pecaSel);
		if (!p) return;
		p.id = dados.id;
		p.nome = dados.nome;
		p.folha = dados.folha;
		p.area = {
			c: inteiroOu(dados.c, p.area.c),
			l: inteiroOu(dados.l, p.area.l),
			w: math.max(1, inteiroOu(dados.w, p.area.w)),
			h: math.max(1, inteiroOu(dados.h, p.area.h)),
		};
		p.tipo = dados.tipo !== "" ? dados.tipo : "outro";
		const camada = inteiroOu(dados.camada, p.camada);
		p.camada = camada >= 0 && camada <= 2 ? (camada as Camada) : p.camada;
		p.bloqueia = dados.bloqueia === "" ? undefined : dados.bloqueia === "sim";
		p.acao = dados.acao === "" ? undefined : dados.acao;
		const linhas = linhasDe(dados.acoes);
		p.acoes = linhas.size() > 0 ? linhas : undefined;
		p.nota = dados.nota !== "" ? dados.nota : undefined;
		p.decorar = dados.temDecorar ? { formas: untrack(() => formasDoFormulario(p)) } : undefined;
		sujoPecas(true);
		bump();
	});

	effect(() => {
		const dados = { id: gId(), folha: gFolha() };
		if (carregando) return;
		const f = untrack(fundoSel);
		if (!f) return;
		f.id = dados.id;
		f.folha = dados.folha;
		sujoFundos(true);
		bump();
	});

	// Ponte

	function carregar() {
		if (ocupado()) return;
		ocupado(true);
		status("Carregando o catálogo pela ponte...");
		task.spawn(() => {
			const avisos = new Array<string>();
			const m = carregarMetades();
			metades(m.metades);
			if (m.erro !== undefined) avisos.push(`imagens das folhas: ${m.erro}`);

			const rz = lerCatalogoPonte<unknown>("zonas");
			if (rz.ok) zonas(lerZonas(rz.valor));
			else {
				zonas(ZONAS_PADRAO);
				avisos.push(rz.status === 404 ? "zonas.json não existe (valem as zonas do jogo)" : `zonas: ${rz.erro}`);
			}

			const rp = lerCatalogoPonte<unknown>("pecas");
			if (rp.ok) {
				const lido = lerCatalogo(rp.valor, "pecas", lerPeca);
				pecas(lido.itens);
				extrasPecas = lido.extras;
				ordemPecas = lido.ordem;
				if (lido.descartadas > 0) avisos.push(`${lido.descartadas} peça(s) sem id ou area descartada(s)`);
			} else {
				pecas([]);
				extrasPecas = {};
				ordemPecas = [];
				avisos.push(rp.status === 404 ? "pecas.json não existe ainda (catálogo vazio)" : `peças: ${rp.erro}`);
			}

			const rf = lerCatalogoPonte<unknown>("fundos");
			if (rf.ok) {
				const lido = lerCatalogo(rf.valor, "fundos", lerFundo);
				fundos(lido.itens);
				extrasFundos = lido.extras;
				ordemFundos = lido.ordem;
				if (lido.descartadas > 0) avisos.push(`${lido.descartadas} fundo(s) sem id descartado(s)`);
			} else {
				fundos([]);
				extrasFundos = {};
				ordemFundos = [];
				avisos.push(rf.status === 404 ? "fundos.json não existe ainda" : `fundos: ${rf.erro}`);
			}

			selecionarPeca(undefined);
			selecionarFundo(undefined);
			sujoPecas(false);
			sujoFundos(false);
			bump();
			status(
				`${pecas().size()} peça(s), ${fundos().size()} fundo(s), ${zonas().zonas.size()} zona(s).` +
					(avisos.size() > 0 ? ` Avisos: ${avisos.join("; ")}.` : ""),
			);
			ocupado(false);
		});
	}

	function salvarPecas() {
		if (ocupado()) return;
		ocupado(true);
		status("Salvando pecas.json...");
		task.spawn(() => {
			const r = gravarCatalogo("pecas", catalogoParaJson("pecas", pecas().map(pecaParaJson), extrasPecas, ordemPecas));
			if (r.ok) {
				sujoPecas(false);
				status(`Peças salvas em ${r.valor.arquivo}. Rode "Gerar decorCatalog" para o jogo receber.`);
			} else {
				status(`Não salvou as peças: ${r.erro}`);
			}
			ocupado(false);
		});
	}

	function salvarFundos() {
		if (ocupado()) return;
		ocupado(true);
		status("Salvando fundos.json...");
		task.spawn(() => {
			const r = gravarCatalogo("fundos", catalogoParaJson("fundos", fundos().map(fundoParaJson), extrasFundos, ordemFundos));
			if (r.ok) {
				sujoFundos(false);
				status(`Fundos salvos em ${r.valor.arquivo}.`);
			} else {
				status(`Não salvou os fundos: ${r.erro}`);
			}
			ocupado(false);
		});
	}

	function gerar() {
		if (ocupado()) return;
		ocupado(true);
		aba("log");
		log("Rodando npm run diorama:jogo -- --decorar (até 120 s)...");
		status("Gerando decorCatalog.ts...");
		task.spawn(() => {
			const r = gerarDecorar();
			if (r.ok) {
				log(r.valor.log);
				status(r.valor.ok ? "decorCatalog.ts gerado." : `O gerador saiu com código ${r.valor.codigo ?? "?"}: veja o log.`);
			} else {
				log(r.erro);
				status(`Não rodou o gerador: ${r.erro}`);
			}
			ocupado(false);
		});
	}

	// Edição

	function criarPeca(r: Retangulo) {
		const p = novaPeca(folha(), r);
		pecas([...pecas(), p]);
		sujoPecas(true);
		bump();
		selecionarPeca(p);
		aba("pecas");
		status(`Peça nova ${p.id} em ${retanguloTexto(r)}: preencha os campos.`);
	}

	function apagarPeca() {
		const p = pecaSel();
		if (!p) return;
		pecas(pecas().filter((x) => x !== p));
		selecionarPeca(undefined);
		sujoPecas(true);
		bump();
		status(`Peça ${p.id} apagada (ainda não salva).`);
	}

	function duplicarPeca() {
		const p = pecaSel();
		if (!p) return;
		const copia = copiarPeca(p);
		copia.id = `${p.id}_copia`;
		pecas([...pecas(), copia]);
		sujoPecas(true);
		bump();
		selecionarPeca(copia);
	}

	function criarFundo() {
		const f = novoFundo(folha());
		fundos([...fundos(), f]);
		sujoFundos(true);
		bump();
		selecionarFundo(f);
		aba("fundos");
		status("Fundo novo: dê um id e clique nos tiles da folha.");
	}

	function apagarFundo() {
		const f = fundoSel();
		if (!f) return;
		fundos(fundos().filter((x) => x !== f));
		selecionarFundo(undefined);
		sujoFundos(true);
		bump();
	}

	function alternarTileDoFundo(c: number, l: number) {
		const f = fundoSel();
		if (!f) return;
		const n = tileNumero(c, l);
		const i = f.tiles.indexOf(n);
		if (i >= 0) f.tiles.remove(i);
		else f.tiles.push(n);
		sujoFundos(true);
		bump();
	}

	function ligarTilesDoFundo(r: Retangulo) {
		const f = fundoSel();
		if (!f) return;
		for (let l = r.l; l < r.l + r.h; l++) {
			for (let c = r.c; c < r.c + r.w; c++) {
				const n = tileNumero(c, l);
				if (!f.tiles.includes(n)) f.tiles.push(n);
			}
		}
		sujoFundos(true);
		bump();
	}

	// Formas e variantes do Decorar

	function ligarDecorar() {
		const p = pecaSel();
		if (!p) return;
		if (fFormas().size() === 0) fFormas([formForma({ variantes: [varianteDaArea(p)] })]);
		fTemDecorar(true);
	}

	function adicionarForma() {
		const p = pecaSel();
		if (!p) return;
		fFormas([...fFormas(), formForma({ variantes: [varianteDaArea(p)] })]);
	}

	function removerForma(f: FormForma) {
		fFormas(fFormas().filter((x) => x !== f));
	}

	function adicionarVariante(f: FormForma) {
		const p = pecaSel();
		if (!p) return;
		f.variantes([...f.variantes(), formVariante(varianteDaArea(p))]);
	}

	function removerVariante(f: FormForma, v: FormVariante) {
		f.variantes(f.variantes().filter((x) => x !== v));
	}

	/** Refaz as células da variante a partir da área da peça (uma por tile), mantendo w, h, dx, dy, fundos e encaixe. */
	function refazerCelulas(v: FormVariante) {
		const p = pecaSel();
		if (!p) return;
		v.celulas(textoDasCelulas(varianteDaArea(p).celulas));
	}

	// O que a folha mostra

	const pecasDaFolha = () => {
		revisao();
		return pecas().filter((p) => p.folha === folha());
	};

	// Os destaques são reaproveitados enquanto não mudam, para o `For` da folha não recriar os quadros a cada
	// tecla digitada no formulário (ele compara os objetos por identidade).
	const cacheDestaquePeca = new Map<Peca, Destaque>();
	const cacheDestaqueTile = new Map<string, Destaque>();
	const destaques = (): Destaque[] => {
		revisao();
		if (aba() === "fundos") {
			const lista = new Array<Destaque>();
			const sel = fundoSel();
			for (const f of fundos()) {
				if (f.folha !== folha()) continue;
				for (const tile of f.tiles) {
					const [c, l] = tileColunaLinha(tile);
					const corTile = f === sel ? COR_FUNDO_SELECIONADO : COR_FUNDO_OUTRO;
					const chave = `${f.folha}/${f.id}/${tile}/${f === sel ? 1 : 0}`;
					let d = cacheDestaqueTile.get(chave);
					if (!d) {
						d = { retangulo: { c, l, w: 1, h: 1 }, cor: corTile, transparencia: f === sel ? 0.45 : 0.8 };
						cacheDestaqueTile.set(chave, d);
					}
					lista.push(d);
				}
			}
			return lista;
		}
		if (aba() === "pecas") {
			const sel = pecaSel();
			const lista = new Array<Destaque>();
			for (const p of pecasDaFolha()) {
				if (p === sel) continue;
				const corPeca = COR_DO_TIPO[p.tipo] ?? COR_DO_TIPO.outro;
				let d = cacheDestaquePeca.get(p);
				if (!d || d.retangulo !== p.area || d.cor !== corPeca) {
					d = { retangulo: p.area, cor: corPeca, transparencia: 0.8 };
					cacheDestaquePeca.set(p, d);
				}
				lista.push(d);
			}
			return lista;
		}
		return [];
	};

	const selecao = () => (aba() === "pecas" ? areaDoFormulario() : undefined);

	const pecaEm = (c: number, l: number): Peca | undefined => {
		let melhor: Peca | undefined;
		for (const p of pecasDaFolha()) {
			if (!contem(p.area, c, l)) continue;
			if (!melhor || p.area.w * p.area.h < melhor.area.w * melhor.area.h) melhor = p;
		}
		return melhor;
	};

	const fundoEm = (c: number, l: number): Fundo | undefined => {
		const n = tileNumero(c, l);
		return fundos().find((f) => f.folha === folha() && f.tiles.includes(n));
	};

	const linhaDoMouse = () => {
		revisao();
		const t = sobMouse();
		if (!t) return "Passe o mouse pela folha: coordenadas, zona, peça e fundo do tile.";
		const partes = [`Tile [${t.c}, ${t.l}] (${tileNumero(t.c, t.l)})`, `zona ${zonaDoTile(zonas(), folha(), t.c, t.l)}`];
		const p = pecaEm(t.c, t.l);
		if (p) partes.push(`peça ${p.id}${p.nome !== "" ? ` (${p.nome})` : ""}`);
		const f = fundoEm(t.c, t.l);
		if (f) partes.push(`fundo ${f.id}`);
		return partes.join(" · ");
	};

	function clicarNaFolha(t: TileSobMouse) {
		if (aba() === "fundos") {
			if (fundoSel()) alternarTileDoFundo(t.c, t.l);
			else status("Crie ou selecione um fundo para marcar os tiles dele.");
			return;
		}
		if (aba() === "zonas") {
			status(`Tile [${t.c}, ${t.l}]: zona ${zonaDoTile(zonas(), folha(), t.c, t.l)}.`);
			return;
		}
		const p = pecaEm(t.c, t.l);
		if (p) {
			selecionarPeca(p);
			aba("pecas");
		} else {
			status(`Tile [${t.c}, ${t.l}] sem peça. Arraste um retângulo para criar uma; com uma peça selecionada, o arrasto redesenha a área dela.`);
		}
	}

	function arrastarNaFolha(r: Retangulo) {
		if (aba() === "fundos") {
			if (fundoSel()) ligarTilesDoFundo(r);
			else status("Crie ou selecione um fundo para marcar os tiles dele.");
			return;
		}
		if (aba() === "zonas") return;
		const p = pecaSel();
		if (p) {
			batch(() => {
				fC(tostring(r.c));
				fL(tostring(r.l));
				fW(tostring(r.w));
				fH(tostring(r.h));
			});
			status(`Área de ${p.id} agora é ${retanguloTexto(r)}.`);
		} else {
			criarPeca(r);
		}
	}

	// Listas

	const pecasFiltradas = () => {
		revisao();
		const texto = filtroTexto().lower();
		const tipo = filtroTipo();
		const f = filtroFolha();
		return pecas().filter((p) => {
			if (f !== "" && p.folha !== f) return false;
			if (tipo !== "" && p.tipo !== tipo) return false;
			if (texto !== "" && p.id.lower().find(texto, 1, true)[0] === undefined && p.nome.lower().find(texto, 1, true)[0] === undefined) return false;
			return true;
		});
	};

	const fundosFiltrados = () => {
		revisao();
		const texto = filtroTexto().lower();
		const f = filtroFolha();
		return fundos().filter((x) => {
			if (f !== "" && x.folha !== f) return false;
			if (texto !== "" && x.id.lower().find(texto, 1, true)[0] === undefined) return false;
			return true;
		});
	};

	// As opções de fundo do formulário (reaproveitadas enquanto o id não muda, pelo mesmo motivo dos destaques).
	const cacheOpcaoFundo = new Map<Fundo, { id: string; titulo: string }>();
	const fundosDaFolhaDoFormulario = () => {
		revisao();
		const lista = new Array<{ id: string; titulo: string }>();
		for (const f of fundos()) {
			if (f.folha !== fFolha() || f.id === "") continue;
			let o = cacheOpcaoFundo.get(f);
			if (!o || o.id !== f.id) {
				o = { id: f.id, titulo: f.id };
				cacheOpcaoFundo.set(f, o);
			}
			lista.push(o);
		}
		return lista;
	};

	const problemas = (): Problema[] => {
		revisao();
		return problemasDoCatalogo(pecas(), fundos());
	};

	const nomesDasZonas = () => {
		const vistos = new Array<string>();
		for (const z of zonas().zonas) if (!vistos.includes(z.zona)) vistos.push(z.zona);
		for (const e of zonas().excecoes) if (!vistos.includes(e.zona)) vistos.push(e.zona);
		if (!vistos.includes("vazio")) vistos.unshift("vazio");
		return vistos;
	};

	const linhasDasZonas = () => {
		const z = zonas();
		const linhas = new Array<string>();
		linhas.push(`vazio: [${z.vazio[0]}, ${z.vazio[1]}]`);
		linhas.push(`bloqueiam: ${z.bloqueiam.join(", ")}`);
		const acoes = new Array<string>();
		for (const [zona, codigo] of pairs(z.acoes)) acoes.push(`${zona} → ${codigo}`);
		linhas.push(`ações por zona: ${acoes.size() > 0 ? acoes.join(", ") : "nenhuma"}`);
		for (const e of z.excecoes) linhas.push(`exceção ${e.folha}: colunas ${e.area[0]}–${e.area[2]}, linhas ${e.area[1]}–${e.area[3]} → ${e.zona}${e.nota !== undefined ? ` (${e.nota})` : ""}`);
		for (const r of z.zonas) linhas.push(`colunas ${r.c0}–${r.c1}, linhas ${r.l0}–${r.l1} → ${r.zona}`);
		return linhas;
	};

	function irAoProblema(p: Problema) {
		if (p.origem === "peca") {
			const peca = pecas().find((x) => x.id === p.id);
			if (peca) {
				selecionarPeca(peca);
				aba("pecas");
			}
		} else {
			const fundo = fundos().find((x) => x.id === p.id);
			if (fundo) {
				selecionarFundo(fundo);
				aba("fundos");
			}
		}
	}

	carregar();

	const metadesDaFolha = () => metades()[folha()];
	const campoNumero = (valor: Vide.Source<string>) => <Campo valor={valor} largura={new UDim(0, 48)} />;

	// Posições do meio (folha em cima, formulário embaixo), à direita da lista.
	const direitaX = ESQUERDA + ESPACO;
	const posFolha = UDim2.fromOffset(direitaX, CABECALHO + ESPACO);
	const tamFolha = new UDim2(1, -direitaX, FRACAO_FOLHA, -FRACAO_FOLHA * MEIO_PERDIDO);
	const posForm = new UDim2(0, direitaX, FRACAO_FOLHA, CABECALHO + 2 * ESPACO - FRACAO_FOLHA * MEIO_PERDIDO);
	const tamForm = new UDim2(1, -direitaX, 1 - FRACAO_FOLHA, -(1 - FRACAO_FOLHA) * MEIO_PERDIDO - ESPACO);

	return (
		<Painel>
			{/* Cabeçalho: três linhas. */}
			<frame Name="Cabecalho" BackgroundTransparency={1} Size={new UDim2(1, 0, 0, CABECALHO)}>
				<uilistlayout FillDirection={Enum.FillDirection.Vertical} SortOrder={Enum.SortOrder.LayoutOrder} Padding={new UDim(0, ESPACO)} />
				<Fileira ordem={0}>
					<Titulo texto="Catálogo" ordem={0} />
					<TextoCurto texto="Folha:" tom="fraco" ordem={1} />
					{FOLHAS.map((f, i) => (
						<Botao texto={f} ativo={() => folha() === f} aoClicar={() => folha(f)} ordem={2 + i} />
					))}
					<TextoCurto texto="Zoom:" tom="fraco" ordem={10} />
					<Botao texto="−" aoClicar={() => zoom(math.max(1, zoom() - 1))} ordem={11} />
					<TextoCurto texto={() => `${zoom()}×`} ordem={12} />
					<Botao texto="+" aoClicar={() => zoom(math.min(ZOOM_MAXIMO, zoom() + 1))} ordem={13} />
					<Alternar texto="Grade" valor={grade} ordem={14} />
					<Alternar texto="Zonas" valor={verZonas} ordem={15} />
				</Fileira>
				<Fileira ordem={1}>
					<Botao texto="Recarregar" aoClicar={carregar} desligado={ocupado} ordem={0} />
					<Botao texto={() => (sujoPecas() ? "Salvar peças *" : "Salvar peças")} aoClicar={salvarPecas} desligado={ocupado} principal={true} ordem={1} />
					<Botao texto={() => (sujoFundos() ? "Salvar fundos *" : "Salvar fundos")} aoClicar={salvarFundos} desligado={ocupado} ordem={2} />
					<Botao texto="Gerar decorCatalog" aoClicar={gerar} desligado={ocupado} ordem={3} />
					<Botao texto="Nova peça (1×1 no tile 0,0)" aoClicar={() => criarPeca({ c: 0, l: 0, w: 1, h: 1 })} ordem={4} />
					<Botao texto="Novo fundo" aoClicar={criarFundo} ordem={5} />
				</Fileira>
				<Fileira ordem={2}>
					<TextoCurto texto={linhaDoMouse} ordem={0} />
					<TextoCurto texto={status} tom="fraco" ordem={1} />
				</Fileira>
			</frame>

			{/* Esquerda: abas e listas. */}
			<frame Name="Esquerda" BackgroundTransparency={1} Position={UDim2.fromOffset(0, CABECALHO + ESPACO)} Size={new UDim2(0, ESQUERDA, 1, -MEIO_PERDIDO)}>
				<uilistlayout FillDirection={Enum.FillDirection.Vertical} SortOrder={Enum.SortOrder.LayoutOrder} Padding={new UDim(0, ESPACO)} />
				<Linha espaco={2} ordem={0}>
					<Botao texto={() => `Peças (${pecasFiltradas().size()})`} ativo={() => aba() === "pecas"} aoClicar={() => aba("pecas")} ordem={0} />
					<Botao texto={() => `Fundos (${fundosFiltrados().size()})`} ativo={() => aba() === "fundos"} aoClicar={() => aba("fundos")} ordem={1} />
					<Botao texto="Zonas" ativo={() => aba() === "zonas"} aoClicar={() => aba("zonas")} ordem={2} />
					<Botao texto="Log" ativo={() => aba() === "log"} aoClicar={() => aba("log")} ordem={3} />
				</Linha>
				<Campo valor={filtroTexto} dica="filtrar por id ou nome (Enter)" aoConfirmar={(t) => filtroTexto(t)} ordem={1} />
				<Escolha opcoes={[{ id: "", titulo: "todas" }, ...OPCOES_FOLHA]} valor={filtroFolha} rotulo="Folha:" ordem={2} />
				<Escolha opcoes={[{ id: "", titulo: "todos" }, ...OPCOES_TIPO]} valor={filtroTipo} rotulo="Tipo:" ordem={3} />
				{/* As quatro listas existem sempre; só uma fica visível. O UIFlexItem faz a lista ocupar o que sobra
				    embaixo dos filtros (que quebram linha); o tamanho em offset é só o valor de partida. */}
				<frame Name="Listas" BackgroundTransparency={1} Size={new UDim2(1, 0, 1, -(3 * (TEXTO + 10) + 60 + 5 * ESPACO))} LayoutOrder={4}>
					<uiflexitem FlexMode={Enum.UIFlexMode.Fill} />
					<Lista espaco={2}>
						{/* Peças */}
						<frame Name="ListaPecas" BackgroundTransparency={1} Size={new UDim2(1, 0, 0, 0)} AutomaticSize={Enum.AutomaticSize.Y} Visible={() => aba() === "pecas"}>
							<uilistlayout FillDirection={Enum.FillDirection.Vertical} SortOrder={Enum.SortOrder.LayoutOrder} Padding={new UDim(0, 2)} />
							<For each={pecasFiltradas}>
								{(p, indice) => (
									<LinhaPeca
										peca={p}
										revisao={revisao}
										metades={() => metades()[p.folha]}
										selecionada={() => pecaSel() === p}
										aoClicar={() => selecionarPeca(p)}
										ordem={indice()}
									/>
								)}
							</For>
						</frame>
						{/* Fundos */}
						<frame Name="ListaFundos" BackgroundTransparency={1} Size={new UDim2(1, 0, 0, 0)} AutomaticSize={Enum.AutomaticSize.Y} Visible={() => aba() === "fundos"}>
							<uilistlayout FillDirection={Enum.FillDirection.Vertical} SortOrder={Enum.SortOrder.LayoutOrder} Padding={new UDim(0, 2)} />
							<For each={fundosFiltrados}>
								{(f, indice) => (
									<Botao
										texto={() => {
											revisao();
											return `${f.folha} · ${f.id === "" ? "(sem id)" : f.id} · ${f.tiles.size()} tile(s)`;
										}}
										largura={new UDim(1, -10)}
										ativo={() => fundoSel() === f}
										aoClicar={() => selecionarFundo(f)}
										ordem={indice()}
									/>
								)}
							</For>
						</frame>
						{/* Zonas: legenda e lista de retângulos */}
						<frame Name="ListaZonas" BackgroundTransparency={1} Size={new UDim2(1, 0, 0, 0)} AutomaticSize={Enum.AutomaticSize.Y} Visible={() => aba() === "zonas"}>
							<uilistlayout FillDirection={Enum.FillDirection.Vertical} SortOrder={Enum.SortOrder.LayoutOrder} Padding={new UDim(0, 2)} />
							<Rotulo texto="Legenda (ligue 'Zonas' no cabeçalho para ver por cima da folha):" negrito={true} ordem={0} />
							<For each={nomesDasZonas}>
								{(nome, indice) => (
									<frame Name={nome} BackgroundTransparency={1} Size={new UDim2(1, 0, 0, TEXTO + 6)} LayoutOrder={1 + indice()}>
										<frame BackgroundColor3={COR_DA_ZONA[nome] ?? Color3.fromRGB(255, 255, 255)} BorderSizePixel={0} Size={UDim2.fromOffset(14, 14)} Position={UDim2.fromOffset(2, 3)} />
										<textlabel
											BackgroundTransparency={1}
											Position={UDim2.fromOffset(22, 0)}
											Size={new UDim2(1, -22, 1, 0)}
											Text={`${nome}: ${DESCRICAO_DA_ZONA[nome] ?? ""}`}
											TextSize={TEXTO}
											FontFace={Font.fromEnum(Enum.Font.SourceSans)}
											TextColor3={cor(Enum.StudioStyleGuideColor.MainText)}
											TextXAlignment={Enum.TextXAlignment.Left}
											TextTruncate={Enum.TextTruncate.AtEnd}
										/>
									</frame>
								)}
							</For>
							<Rotulo texto="zonas.json (o vazio e as exceções valem antes; depois o primeiro retângulo que contém o tile; fora de todos é chao):" negrito={true} ordem={1000} />
							<For each={linhasDasZonas}>{(linha, indice) => <Rotulo texto={linha} mono={true} ordem={1001 + indice()} />}</For>
							<Rotulo texto="As zonas se editam no JSON (diorama/catalogo/zonas.json); o jogo tem a cópia em interiorMap.ts." tom="fraco" ordem={5000} />
						</frame>
						{/* Log do gerador */}
						<frame Name="ListaLog" BackgroundTransparency={1} Size={new UDim2(1, 0, 0, 0)} AutomaticSize={Enum.AutomaticSize.Y} Visible={() => aba() === "log"}>
							<Rotulo texto={log} mono={true} />
						</frame>
					</Lista>
				</frame>
			</frame>

			{/* Direita, em cima: a folha. */}
			<FolhaVista
				folha={folha}
				metades={metadesDaFolha}
				zoom={zoom}
				grade={grade}
				mostrarZonas={verZonas}
				zonas={zonas}
				selecao={selecao}
				destaques={destaques}
				aoPassar={(t) => sobMouse(t)}
				aoClicar={clicarNaFolha}
				aoArrastar={arrastarNaFolha}
				posicao={posFolha}
				tamanho={tamFolha}
			/>

			{/* Direita, embaixo: o formulário da peça ou do fundo. */}
			<Lista posicao={posForm} tamanho={tamForm}>
				{/* Peça */}
				<frame Name="FormPeca" BackgroundTransparency={1} Size={new UDim2(1, -12, 0, 0)} AutomaticSize={Enum.AutomaticSize.Y} Visible={() => aba() === "pecas"}>
					<uilistlayout FillDirection={Enum.FillDirection.Vertical} SortOrder={Enum.SortOrder.LayoutOrder} Padding={new UDim(0, ESPACO)} />
					<Rotulo
						texto={() => (pecaSel() ? `Peça ${fId()}` : "Nenhuma peça selecionada: clique numa da lista ou numa região da folha, ou arraste um retângulo na folha para criar.")}
						negrito={true}
						ordem={0}
					/>
					<frame Name="Campos" BackgroundTransparency={1} Size={new UDim2(1, 0, 0, 0)} AutomaticSize={Enum.AutomaticSize.Y} Visible={() => pecaSel() !== undefined} LayoutOrder={1}>
						<uilistlayout FillDirection={Enum.FillDirection.Vertical} SortOrder={Enum.SortOrder.LayoutOrder} Padding={new UDim(0, ESPACO)} />
						<Fileira ordem={0}>
							<Recorte metades={() => metades()[fFolha()]} retangulo={areaDoFormulario} caixa={96} ordem={0} />
							<frame BackgroundTransparency={1} Size={new UDim2(1, -96 - ESPACO, 0, 0)} AutomaticSize={Enum.AutomaticSize.Y} LayoutOrder={1}>
								<uilistlayout FillDirection={Enum.FillDirection.Vertical} SortOrder={Enum.SortOrder.LayoutOrder} Padding={new UDim(0, ESPACO)} />
								<LinhaCampo rotulo="Id" ordem={0}>
									<Campo valor={fId} largura={new UDim(0, 200)} />
									<TextoCurto texto="(como o jogo cita: casa8, casa@56,25, chair)" tom="fraco" />
								</LinhaCampo>
								<LinhaCampo rotulo="Nome" ordem={1}>
									<Campo valor={fNome} largura={new UDim(0, 300)} />
								</LinhaCampo>
								<LinhaCampo rotulo="Folha" ordem={2}>
									<Escolha opcoes={OPCOES_FOLHA} valor={fFolha} />
								</LinhaCampo>
								<LinhaCampo rotulo="Área" ordem={3}>
									<TextoCurto texto="col" tom="fraco" />
									{campoNumero(fC)}
									<TextoCurto texto="lin" tom="fraco" />
									{campoNumero(fL)}
									<TextoCurto texto="larg" tom="fraco" />
									{campoNumero(fW)}
									<TextoCurto texto="alt" tom="fraco" />
									{campoNumero(fH)}
									<TextoCurto texto="(ou arraste na folha)" tom="fraco" />
								</LinhaCampo>
							</frame>
						</Fileira>
						<LinhaCampo rotulo="Tipo" ordem={1}>
							<Campo valor={fTipo} largura={new UDim(0, 110)} />
							<Escolha opcoes={OPCOES_TIPO} valor={fTipo} />
						</LinhaCampo>
						<LinhaCampo rotulo="Camada" ordem={2}>
							<Escolha opcoes={OPCOES_CAMADA} valor={fCamada} />
							<TextoCurto texto="(sugerida: onde a peça pousa no mapa)" tom="fraco" />
						</LinhaCampo>
						<LinhaCampo rotulo="Bloqueia" ordem={3}>
							<Ciclo rotulo="Bloqueia" opcoes={OPCOES_BLOQUEIA} valor={fBloqueia} />
							<TextoCurto texto="(informação para o plugin; o bloqueio do mapa vem da zona)" tom="fraco" />
						</LinhaCampo>
						<LinhaCampo rotulo="Ação" ordem={4}>
							<Escolha opcoes={OPCOES_ACAO} valor={fAcao} />
							<TextoCurto texto="(um código para a peça toda; entra em actions do mapa)" tom="fraco" />
						</LinhaCampo>
						<LinhaCampo rotulo="Ações por linha" ordem={5}>
							<frame BackgroundTransparency={1} Size={new UDim2(1, 0, 0, 0)} AutomaticSize={Enum.AutomaticSize.Y}>
								<uilistlayout FillDirection={Enum.FillDirection.Vertical} SortOrder={Enum.SortOrder.LayoutOrder} Padding={new UDim(0, 2)} />
								<CampoMulti valor={fAcoes} dica={"4444\n5555 (uma linha por linha da peça, um código por coluna; vazio = sem o campo)"} mono={true} altura={TEXTO * 3 + 12} ordem={0} />
							</frame>
						</LinhaCampo>
						<LinhaCampo rotulo="Nota" ordem={6}>
							<Campo valor={fNota} largura={new UDim(0, 400)} />
						</LinhaCampo>
						<Rotulo texto={() => (fExtras() !== "" ? `Outros campos (preservados; editar no JSON): ${fExtras()}` : "")} tom="fraco" mono={true} ordem={7} />
						<Separador ordem={8} />

						{/* Decorar: formas, variantes e células */}
						<Fileira ordem={9}>
							<Rotulo texto="Decorar (inventário do jogo, 12.12 e 12.14)" negrito={true} ordem={0} />
						</Fileira>
						<Fileira ordem={10}>
							<Botao texto={() => (fTemDecorar() ? "☑ Entra no Decorar" : "☐ Entra no Decorar")} ativo={fTemDecorar} aoClicar={() => (fTemDecorar() ? fTemDecorar(false) : ligarDecorar())} ordem={0} />
							<Botao texto="Adicionar forma" aoClicar={adicionarForma} desligado={() => !fTemDecorar()} ordem={1} />
							<TextoCurto texto={() => (fTemDecorar() ? `${fFormas().size()} forma(s)` : "sem decorar: a peça não entra em decorCatalog.ts")} tom="fraco" ordem={2} />
						</Fileira>
						<frame Name="Formas" BackgroundTransparency={1} Size={new UDim2(1, 0, 0, 0)} AutomaticSize={Enum.AutomaticSize.Y} Visible={fTemDecorar} LayoutOrder={11}>
							<uilistlayout FillDirection={Enum.FillDirection.Vertical} SortOrder={Enum.SortOrder.LayoutOrder} Padding={new UDim(0, ESPACO)} />
							<For each={fFormas}>
								{(f, fi) => (
									<frame
										Name="Forma"
										BackgroundColor3={cor(Enum.StudioStyleGuideColor.CategoryItem)}
										BorderSizePixel={0}
										Size={new UDim2(1, 0, 0, 0)}
										AutomaticSize={Enum.AutomaticSize.Y}
										LayoutOrder={fi()}
									>
										<uipadding PaddingTop={new UDim(0, 4)} PaddingBottom={new UDim(0, 4)} PaddingLeft={new UDim(0, 4)} PaddingRight={new UDim(0, 4)} />
										<uilistlayout FillDirection={Enum.FillDirection.Vertical} SortOrder={Enum.SortOrder.LayoutOrder} Padding={new UDim(0, 4)} />
										<Fileira ordem={0}>
											<TextoCurto texto={() => `Forma ${fi() + 1}`} negrito={true} ordem={0} />
											<Escolha opcoes={OPCOES_OLHANDO} valor={f.olhando} rotulo="olhando:" ordem={1} />
											<Botao texto="Adicionar variante" aoClicar={() => adicionarVariante(f)} ordem={2} />
											<Botao texto="Remover forma" aoClicar={() => removerForma(f)} ordem={3} />
										</Fileira>
										<For each={f.variantes}>
											{(v, vi) => (
												<frame
													Name="Variante"
													BackgroundColor3={cor(Enum.StudioStyleGuideColor.Item)}
													BorderSizePixel={0}
													Size={new UDim2(1, 0, 0, 0)}
													AutomaticSize={Enum.AutomaticSize.Y}
													LayoutOrder={1 + vi()}
												>
													<uipadding PaddingTop={new UDim(0, 4)} PaddingBottom={new UDim(0, 4)} PaddingLeft={new UDim(0, 4)} PaddingRight={new UDim(0, 4)} />
													<uilistlayout FillDirection={Enum.FillDirection.Vertical} SortOrder={Enum.SortOrder.LayoutOrder} Padding={new UDim(0, 4)} />
													<Fileira ordem={0}>
														<TextoCurto texto={() => `Variante ${vi() + 1}`} negrito={true} ordem={0} />
														<TextoCurto texto="w" tom="fraco" ordem={1} />
														<Campo valor={v.w} largura={new UDim(0, 40)} ordem={2} />
														<TextoCurto texto="h" tom="fraco" ordem={3} />
														<Campo valor={v.h} largura={new UDim(0, 40)} ordem={4} />
														<TextoCurto texto="dx" tom="fraco" ordem={5} />
														<Campo valor={v.dx} largura={new UDim(0, 40)} ordem={6} />
														<TextoCurto texto="dy" tom="fraco" ordem={7} />
														<Campo valor={v.dy} largura={new UDim(0, 40)} ordem={8} />
														<Botao texto="Remover variante" aoClicar={() => removerVariante(f, v)} ordem={9} />
													</Fileira>
													<LinhaCampo rotulo="Fundos" ordem={1}>
														<Marcas opcoes={fundosDaFolhaDoFormulario} valor={v.fundos} vazio="(nenhum fundo desta folha em fundos.json)" />
													</LinhaCampo>
													<LinhaCampo rotulo="Encaixe" ordem={2}>
														<Escolha opcoes={OPCOES_ENCAIXE} valor={v.encTipo} />
														<TextoCurto texto="linha" tom="fraco" />
														<Campo valor={v.encLinha} largura={new UDim(0, 40)} />
														<TextoCurto texto="papel" tom="fraco" />
														<Escolha opcoes={OPCOES_PAPEL} valor={v.encPapel} />
													</LinhaCampo>
													<Rotulo
														texto="Células, uma por linha: dx dy coluna linha camada acao livre|bloqueia [exatos:1575,1702] [fundos:xadrez_claro,xadrez_escuro]"
														tom="fraco"
														ordem={3}
													/>
													<CampoMulti valor={v.celulas} mono={true} altura={TEXTO * 6 + 12} ordem={4} />
													<Fileira ordem={5}>
														<Botao texto="Refazer células pela área (uma por tile)" aoClicar={() => refazerCelulas(v)} ordem={0} />
														<TextoCurto texto={() => (v.erroCelulas() !== "" ? `Células não lidas (valem as de antes): ${v.erroCelulas()}` : "")} tom="erro" ordem={1} />
													</Fileira>
												</frame>
											)}
										</For>
									</frame>
								)}
							</For>
						</frame>
						<Separador ordem={12} />
						<Fileira ordem={13}>
							<Botao texto="Duplicar peça" aoClicar={duplicarPeca} ordem={0} />
							<Botao texto="Apagar peça" aoClicar={apagarPeca} ordem={1} />
							<TextoCurto texto="(apagar não pede confirmação; só vale depois de Salvar peças)" tom="fraco" ordem={2} />
						</Fileira>
					</frame>
				</frame>

				{/* Fundo */}
				<frame Name="FormFundo" BackgroundTransparency={1} Size={new UDim2(1, -12, 0, 0)} AutomaticSize={Enum.AutomaticSize.Y} Visible={() => aba() === "fundos"}>
					<uilistlayout FillDirection={Enum.FillDirection.Vertical} SortOrder={Enum.SortOrder.LayoutOrder} Padding={new UDim(0, ESPACO)} />
					<Rotulo
						texto={() => (fundoSel() ? `Fundo ${gId()}` : "Nenhum fundo selecionado: clique num da lista ou em 'Novo fundo'.")}
						negrito={true}
						ordem={0}
					/>
					<frame Name="Campos" BackgroundTransparency={1} Size={new UDim2(1, 0, 0, 0)} AutomaticSize={Enum.AutomaticSize.Y} Visible={() => fundoSel() !== undefined} LayoutOrder={1}>
						<uilistlayout FillDirection={Enum.FillDirection.Vertical} SortOrder={Enum.SortOrder.LayoutOrder} Padding={new UDim(0, ESPACO)} />
						<LinhaCampo rotulo="Id" ordem={0}>
							<Campo valor={gId} largura={new UDim(0, 200)} dica="papel_azul" />
							<TextoCurto texto="(único dentro da folha; a ordem dos fundos no arquivo é a dos índices do Decorar)" tom="fraco" />
						</LinhaCampo>
						<LinhaCampo rotulo="Folha" ordem={1}>
							<Escolha opcoes={OPCOES_FOLHA} valor={gFolha} />
						</LinhaCampo>
						<Rotulo
							texto={() => {
								revisao();
								const f = fundoSel();
								if (!f) return "";
								const lista = f.tiles
									.map((n) => {
										const [c, l] = tileColunaLinha(n);
										return `[${c},${l}]`;
									})
									.join(" ");
								return `${f.tiles.size()} tile(s): ${lista === "" ? "nenhum" : lista}`;
							}}
							mono={true}
							ordem={2}
						/>
						<Rotulo texto="Na folha: clique num tile para ligar ou desligar; arraste para ligar todos os do retângulo. No arquivo, cada tile é linha × 128 + coluna." tom="fraco" ordem={3} />
						<Fileira ordem={4}>
							<Botao
								texto="Limpar tiles"
								aoClicar={() => {
									const f = fundoSel();
									if (!f) return;
									f.tiles.clear();
									sujoFundos(true);
									bump();
								}}
								ordem={0}
							/>
							<Botao texto="Apagar fundo" aoClicar={apagarFundo} ordem={1} />
						</Fileira>
					</frame>
				</frame>

				<frame Name="FormOutros" BackgroundTransparency={1} Size={new UDim2(1, -12, 0, 0)} AutomaticSize={Enum.AutomaticSize.Y} Visible={() => aba() === "zonas" || aba() === "log"}>
					<Rotulo texto={() => (aba() === "zonas" ? "Passe o mouse pela folha para ver a zona de cada tile." : "O log do gerador está na lista à esquerda.")} tom="fraco" />
				</frame>
			</Lista>

			{/* Rodapé: problemas. */}
			<frame
				Name="Rodape"
				BackgroundTransparency={1}
				AnchorPoint={new Vector2(0, 1)}
				Position={UDim2.fromScale(0, 1)}
				Size={new UDim2(1, 0, 0, RODAPE)}
			>
				<Rotulo texto={() => `Problemas do catálogo: ${problemas().size()}`} negrito={true} />
				<Lista posicao={UDim2.fromOffset(0, TEXTO + 6)} tamanho={new UDim2(1, 0, 1, -(TEXTO + 6))} espaco={1}>
					<For each={problemas}>
						{(p, indice) => <Botao texto={p.texto} largura={new UDim(1, -10)} aoClicar={() => irAoProblema(p)} ordem={indice()} />}
					</For>
				</Lista>
			</frame>
		</Painel>
	);
}

/** Uma peça na lista: miniatura, id e nome. */
function LinhaPeca(props: {
	peca: Peca;
	revisao: () => number;
	metades: () => Metades | undefined;
	selecionada: () => boolean;
	aoClicar: () => void;
	ordem?: number;
}) {
	const passando = source(false);
	const modificador = () => {
		if (props.selecionada()) return Enum.StudioStyleGuideModifier.Selected;
		if (passando()) return Enum.StudioStyleGuideModifier.Hover;
		return Enum.StudioStyleGuideModifier.Default;
	};
	const area = () => {
		props.revisao();
		return props.peca.area;
	};
	return (
		<textbutton
			Name="LinhaPeca"
			AutoButtonColor={false}
			Text=""
			Size={new UDim2(1, -10, 0, MINIATURA + 4)}
			BackgroundColor3={() => tema().GetColor(Enum.StudioStyleGuideColor.Item, modificador())}
			BorderSizePixel={0}
			LayoutOrder={props.ordem}
			Activated={props.aoClicar}
			MouseEnter={() => passando(true)}
			MouseLeave={() => passando(false)}
		>
			<frame BackgroundTransparency={1} Position={UDim2.fromOffset(2, 2)} Size={UDim2.fromOffset(MINIATURA, MINIATURA)}>
				<Recorte metades={props.metades} retangulo={area} caixa={MINIATURA} />
			</frame>
			<textlabel
				BackgroundTransparency={1}
				Position={UDim2.fromOffset(MINIATURA + 8, 0)}
				Size={new UDim2(1, -(MINIATURA + 8), 0.5, 0)}
				Text={() => {
					props.revisao();
					return props.peca.id;
				}}
				TextSize={TEXTO}
				FontFace={Font.fromEnum(Enum.Font.SourceSansBold)}
				TextColor3={() => tema().GetColor(Enum.StudioStyleGuideColor.MainText, modificador())}
				TextXAlignment={Enum.TextXAlignment.Left}
				TextTruncate={Enum.TextTruncate.AtEnd}
			/>
			<textlabel
				BackgroundTransparency={1}
				Position={new UDim2(0, MINIATURA + 8, 0.5, 0)}
				Size={new UDim2(1, -(MINIATURA + 8), 0.5, 0)}
				Text={() => {
					props.revisao();
					const p = props.peca;
					const partes = [`${p.folha} ${retanguloTexto(p.area)}`, p.tipo, `camada ${p.camada}`];
					if (p.decorar) partes.push(`decorar ${p.decorar.formas.size()} forma(s)`);
					if (p.nome !== "") partes.push(p.nome);
					return partes.join(" · ");
				}}
				TextSize={TEXTO - 2}
				FontFace={Font.fromEnum(Enum.Font.SourceSans)}
				TextColor3={() => tema().GetColor(Enum.StudioStyleGuideColor.DimmedText, modificador())}
				TextXAlignment={Enum.TextXAlignment.Left}
				TextTruncate={Enum.TextTruncate.AtEnd}
			/>
		</textbutton>
	);
}

export function abrir(plugin: Plugin) {
	return abrirWidget(plugin, { id: "catalogo", titulo: "Catálogo", largura: 1000, altura: 720, larguraMinima: 640, alturaMinima: 400 }, (gui) =>
		mount(() => <PainelCatalogo />, gui),
	);
}
