// Mapas: o editor do bloco (docs/diorama/ARQUITETURA.md, ESPECIFICACAO.md seção 12). À esquerda, os mapas da ponte,
// novo, salvar, gerar e testar; no centro, a barra de pincéis e camadas e o canvas (mapas/canvas.tsx); à direita,
// as abas Tiles (paleta), Peças (catálogo), Marcadores e Log. O bloco em si é um objeto mutável (mapas/bloco.ts) fora
// do Vide: quem o muda sobe `versao` (células) ou `versaoMarcadores`, e o canvas redesenha só o que mudou.
//
// Atalhos (com o widget focado e nenhum campo de texto ativo): B pincel, R retângulo, G balde, E borracha,
// I conta-gotas; 1/2/3 camada chão/objeto/frente, 4 terreno; Ctrl+Z/Ctrl+Y; Ctrl+S salva; +/− zoom; Esc cancela.
import Vide, { effect, For, mount, source } from "@rbxts/vide";
import { cleanup } from "@rbxts/vide";
import { RunService, UserInputService, Workspace } from "@rbxts/services";
import { avisoImagens, carregarImagensFolhas, erroPonte, imagensFolhas, mapaAberto, mapas as listaMapas, ponteLigada, recarregarMapas } from "../estado";
import * as ponte from "../ponte";
import { Abas, AreaTexto, Botao, Campo, Coluna, ESPACO, Linha, Lista, Painel, Rotulo, Separador, Titulo, Tom } from "../ui/kit";
import { Alternar, Ciclo } from "../ui/kit";
import { Amostra, Legenda } from "../ui/extras";
import { abrirWidget } from "../widget";
import { avisosDoBloco, CAMADA_TERRENO, desempacotar, empacotar, idValido, ModeloBloco, TERRENOS, TITULOS_CAMADA } from "../mapas/bloco";
import { CanvasBloco, Fantasma, Imagens, Modificadores } from "../mapas/canvas";
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

export const DESCRICAO =
	"Editor do bloco: camadas, pincéis, carimbo de peças do catálogo, exterior, entradas, saídas, zonas, moradores e nascimento. Salva na ponte, gera o módulo do jogo e testa no Play.";

const ESQUERDA = 190;
const DIREITA = 330;
const BARRA = 58;
const ATRIBUTO_TESTE = "InteriorTeste";
const ATRIBUTO_CELULA = "InteriorTesteCelula";

const OPACIDADES = [
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

	const ferramenta = source<Ferramenta>("pincel");
	const camada = source(0);
	const zoom = source(2);
	const grade = source(true);
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

	const mensagem = source("Escolha um mapa à esquerda ou crie um novo.");
	const tomMensagem = source<Tom>("fraco");
	const log = source("");
	const ocupado = source(false);
	const confirmarDescarte = source<string | undefined>(undefined);
	const abaDireita = source("tiles");
	const idNovo = source("");

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
		if (hist.fecharLote()) sujo(true);
		subir();
	};
	let pincelando = false;
	let arrasto: [number, number] | undefined;

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
				sujo(true);
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
		if (f === "pincel") {
			hist.iniciarLote();
			pintar(modelo, hist, cam, x, y, carimboAtual()!);
			pincelando = true;
			subir();
		} else if (f === "borracha") {
			hist.iniciarLote();
			apagar(modelo, hist, cam, x, y);
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
		if (ferramenta() === "borracha") apagar(modelo, hist, camada(), x, y);
		else {
			const c = carimboAtual();
			if (c) pintar(modelo, hist, camada(), x, y, c);
		}
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
				sujo(true);
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

	const desfazer = () => {
		const passo = hist.desfazer(modelo);
		if (!passo) return avisar("Nada para desfazer.", "fraco");
		sujo(true);
		if (passo.tipo === "marcadores") versaoMarcadores(versaoMarcadores() + 1);
		subir();
	};
	const refazer = () => {
		const passo = hist.refazer(modelo);
		if (!passo) return avisar("Nada para refazer.", "fraco");
		sujo(true);
		if (passo.tipo === "marcadores") versaoMarcadores(versaoMarcadores() + 1);
		subir();
	};

	// ------------------------------------------------------------------ ponte: mapas, assets, catálogo

	const trocarModelo = (novo: ModeloBloco) => {
		modelo = novo;
		hist.limpar();
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
	const atualizarTudo = () => {
		if (ocupado()) return;
		ocupado(true);
		task.spawn(() => {
			const r = carregarLista();
			carregarImagens();
			carregarCatalogo();
			ocupado(false);
			if (!r.ok) avisar(r.erro, "erro");
			else avisar(`${r.valor.size()} mapa(s) na ponte.`, "normal");
		});
	};
	atualizarTudo();

	const abrirMapa = (id: string) => {
		if (ocupado()) return;
		if (sujo() && confirmarDescarte() !== id) {
			confirmarDescarte(id);
			return avisar(`"${modelo.mapa}" tem mudanças não salvas. Clique de novo em "${id}" para descartá-las.`);
		}
		confirmarDescarte(undefined);
		ocupado(true);
		task.spawn(() => {
			const r = ponte.lerMapa(id);
			ocupado(false);
			if (!r.ok) return avisar(`Não abriu "${id}": ${r.erro}`, "erro");
			const bloco = r.valor.blocos.find((b) => typeIs(b.bloco, "table") && b.bloco[0] === 0 && b.bloco[1] === 0);
			const novo = bloco ? ModeloBloco.deJson(bloco.conteudo) : ModeloBloco.novo(id);
			novo.mapa = id;
			trocarModelo(novo);
			const ret = novo.retanguloPintado();
			avisar(
				bloco
					? `"${id}" aberto: ${ret ? `${ret[2]} × ${ret[3]} células pintadas a partir de (${ret[0]}, ${ret[1]})` : "bloco vazio"}${novo.carimboLido ? `, carimbo ${novo.carimboLido}` : ""}.`
					: `"${id}" não tem o bloco 0_0; começando um vazio.`,
				"ok",
			);
		});
	};

	const criarMapa = () => {
		const id = idNovo().gsub("%s", "")[0];
		if (!idValido(id)) return avisar("Id inválido: só letras minúsculas, números e _.");
		if (listaMapas().some((m) => m.id === id)) return abrirMapa(id);
		if (sujo() && confirmarDescarte() !== id) {
			confirmarDescarte(id);
			return avisar(`"${modelo.mapa}" tem mudanças não salvas. Clique de novo em "Novo" para descartá-las.`);
		}
		confirmarDescarte(undefined);
		trocarModelo(ModeloBloco.novo(id));
		sujo(true);
		avisar(`Mapa "${id}" criado; salve para ele existir na ponte.`, "ok");
	};

	const salvar = (depois?: () => void) => {
		if (modelo.mapa === "") return avisar("Nenhum mapa aberto.");
		if (ocupado()) return;
		ocupado(true);
		task.spawn(() => {
			const avisos = avisosDoBloco(
				modelo,
				listaMapas().map((m) => m.id),
			);
			const r = ponte.gravarBloco(modelo.mapa, modelo.bloco[0], modelo.bloco[1], modelo.paraJson());
			ocupado(false);
			if (!r.ok) return avisar(`Não salvou: ${r.erro}`, "erro");
			sujo(false);
			carregarLista();
			avisar(`Salvo em ${r.valor.arquivo}.${avisos.size() > 0 ? ` Avisos: ${avisos.join(" ")}` : ""}`, avisos.size() > 0 ? "aviso" : "ok");
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
		Workspace.SetAttribute(ATRIBUTO_TESTE, modelo.mapa);
		Workspace.SetAttribute(ATRIBUTO_CELULA, c ? `${c[0]},${c[1]}` : undefined);
		// Não há API pública de plugin para o Play Solo; RunService.Run() (modo Run, sem jogador) não serve ao teste.
		avisar(
			`Workspace.${ATRIBUTO_TESTE} = "${modelo.mapa}"${c ? `, ${ATRIBUTO_CELULA} = "${c[0]},${c[1]}"` : ""}. Dê Play (F5) no Studio; o mapa precisa estar gerado e sincronizado pelo Rojo.`,
			"ok",
		);
	};
	const pararTeste = () => {
		Workspace.SetAttribute(ATRIBUTO_TESTE, undefined);
		Workspace.SetAttribute(ATRIBUTO_CELULA, undefined);
		if (RunService.IsRunning()) {
			// `RunService.Stop` falta nos tipos do @rbxts/types (segurança de plugin); existe no Studio.
			const [ok] = pcall(() => (RunService as unknown as { Stop(this: unknown): void }).Stop());
			avisar(ok ? "Atributos limpos; sessão parada." : "Atributos limpos; pare a sessão à mão (Stop).", ok ? "ok" : "aviso");
		} else avisar("Atributos de teste limpos.", "ok");
	};

	// ------------------------------------------------------------------ título e teclado

	effect(() => {
		const gui = props.gui;
		if (!gui) return;
		const id = mapaAberto();
		(gui as unknown as { Title: string }).Title = `Diorama: Mapas${id !== undefined ? ` — ${id}` : ""}${sujo() ? " *" : ""}`;
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
			if (UserInputService.GetFocusedTextBox() !== undefined) return;
			const ctrl = UserInputService.IsKeyDown(Enum.KeyCode.LeftControl) || UserInputService.IsKeyDown(Enum.KeyCode.RightControl);
			const k = input.KeyCode;
			if (ctrl && k === Enum.KeyCode.Z) return desfazer();
			if (ctrl && k === Enum.KeyCode.Y) return refazer();
			if (ctrl && k === Enum.KeyCode.S) return salvar();
			if (ctrl) return;
			if (k === Enum.KeyCode.One) return camada(0);
			if (k === Enum.KeyCode.Two) return camada(1);
			if (k === Enum.KeyCode.Three) return camada(2);
			if (k === Enum.KeyCode.Four) return camada(CAMADA_TERRENO);
			if (k === Enum.KeyCode.Equals || k === Enum.KeyCode.KeypadPlus) return zoom(math.min(3, zoom() + 1));
			if (k === Enum.KeyCode.Minus || k === Enum.KeyCode.KeypadMinus) return zoom(math.max(1, zoom() - 1));
			if (k === Enum.KeyCode.Escape) {
				pedido(undefined);
				arrasto = undefined;
				previa(undefined);
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

	// ------------------------------------------------------------------ interface

	return (
		<Painel margem={4}>
			{/* Esquerda: mapas e ações */}
			<frame Name="Esquerda" Size={new UDim2(0, ESQUERDA, 1, 0)} BackgroundTransparency={1}>
				<Coluna espaco={4}>
					<Titulo texto="Mapas" ordem={0} />
					<Rotulo
						texto={() => (ponteLigada() ? "Ponte ligada." : (erroPonte() ?? "Ponte: verificando..."))}
						tom={() => (ponteLigada() ? "ok" : "erro")}
						ordem={1}
					/>
					<Botao texto={() => (ocupado() ? "Aguarde..." : "Atualizar")} desligado={ocupado} aoClicar={atualizarTudo} ordem={2} />
					<Lista tamanho={new UDim2(1, 0, 0, 170)} espaco={2} ordem={3}>
						<For each={() => listaMapas()}>
							{(m: ponte.ResumoMapa, i: () => number) => (
								<Botao texto={m.id} ativo={() => mapaAberto() === m.id} aoClicar={() => abrirMapa(m.id)} largura={new UDim(1, -10)} ordem={i()} />
							)}
						</For>
					</Lista>
					<Linha espaco={4}>
						<Campo valor={idNovo} dica="id_do_mapa" aoConfirmar={criarMapa} largura={new UDim(0, ESQUERDA - 62)} ordem={0} />
						<Botao texto="Novo" aoClicar={criarMapa} ordem={1} />
					</Linha>
					<Separador ordem={5} />
					<Botao texto={() => `Salvar (Ctrl+S)${sujo() ? " *" : ""}`} principal={true} desligado={ocupado} aoClicar={() => salvar()} largura={new UDim(1, 0)} ordem={6} />
					<Botao texto="Gerar para o jogo" desligado={ocupado} aoClicar={gerar} largura={new UDim(1, 0)} ordem={7} />
					<Botao texto="Testar (atributos)" aoClicar={testar} largura={new UDim(1, 0)} ordem={8} />
					<Botao texto="Parar teste" aoClicar={pararTeste} largura={new UDim(1, 0)} ordem={9} />
					<Rotulo texto="Testar grava InteriorTeste e InteriorTesteCelula (a última célula clicada, senão o nascimento) no Workspace; dê Play." tom="fraco" ordem={10} />
					<Separador ordem={11} />
					<Linha espaco={4}>
						<Botao texto="Desfazer" aoClicar={desfazer} ordem={0} />
						<Botao texto="Refazer" aoClicar={refazer} ordem={1} />
					</Linha>
					<Rotulo texto={mensagem} tom={tomMensagem} ordem={13} />
					<Rotulo texto={avisoImagens} tom="aviso" ordem={14} />
				</Coluna>
			</frame>

			{/* Centro: barra e canvas */}
			<frame
				Name="Centro"
				Position={UDim2.fromOffset(ESQUERDA + ESPACO, 0)}
				Size={new UDim2(1, -(ESQUERDA + DIREITA + 2 * ESPACO), 1, 0)}
				BackgroundTransparency={1}
			>
				<frame Name="Barra" Size={new UDim2(1, 0, 0, BARRA)} BackgroundTransparency={1}>
					<Coluna espaco={2}>
						<Linha espaco={3}>
							{(["pincel", "retangulo", "balde", "borracha", "contagotas"] as Ferramenta[]).map((f, i) => (
								<Botao texto={NOME_DA_FERRAMENTA[f]} ativo={() => ferramenta() === f} aoClicar={() => ferramenta(f)} ordem={i} />
							))}
							<Legenda texto="" largura={6} ordem={9} />
							{TITULOS_CAMADA.map((titulo, i) => (
								<Botao texto={`${i + 1} ${titulo}`} ativo={() => camada() === i} aoClicar={() => camada(i)} ordem={10 + i} />
							))}
						</Linha>
						<Linha espaco={3}>
							<Botao texto="−" aoClicar={() => zoom(math.max(1, zoom() - 1))} ordem={0} />
							<Legenda texto={() => `${zoom()}×`} largura={24} ordem={1} />
							<Botao texto="+" aoClicar={() => zoom(math.min(3, zoom() + 1))} ordem={2} />
							<Alternar texto="Grade" valor={grade} ordem={3} />
							<Ciclo rotulo="Outras camadas" opcoes={OPACIDADES} valor={opacidade} ordem={4} />
							<frame Size={new UDim2(0, 0, 0, 24)} AutomaticSize={Enum.AutomaticSize.X} BackgroundTransparency={1} Visible={() => camada() === CAMADA_TERRENO} LayoutOrder={5}>
								<Linha espaco={3}>
									{TERRENOS.map((t, i) => (
										<Amostra cor={t.cor} texto={t.nome} ativo={() => terrenoAtivo() === t.codigo} aoClicar={() => terrenoAtivo(t.codigo)} ordem={i} />
									))}
								</Linha>
							</frame>
						</Linha>
					</Coluna>
				</frame>
				<frame Name="AreaCanvas" Position={UDim2.fromOffset(0, BARRA)} Size={new UDim2(1, 0, 1, -BARRA - 40)} BackgroundTransparency={1}>
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
					/>
				</frame>
				<frame Name="Rodape" Position={new UDim2(0, 0, 1, -38)} Size={new UDim2(1, 0, 0, 38)} BackgroundTransparency={1}>
					<Coluna espaco={0}>
						<Rotulo texto={linhaCelula} mono={true} ordem={0} />
						<Rotulo texto={linhaEstado} tom={() => (pedido() ? "aviso" : "fraco")} ordem={1} />
					</Coluna>
				</frame>
			</frame>

			{/* Direita: abas */}
			<frame Name="Direita" Position={new UDim2(1, -DIREITA, 0, 0)} Size={new UDim2(0, DIREITA, 1, 0)} BackgroundTransparency={1}>
				<frame Size={new UDim2(1, 0, 0, 28)} BackgroundTransparency={1}>
					<Abas abas={ABAS_DIREITA} aberta={abaDireita} />
				</frame>
				<frame Name="Conteudo" Position={UDim2.fromOffset(0, 32)} Size={new UDim2(1, 0, 1, -32)} BackgroundTransparency={1}>
					<frame Size={UDim2.fromScale(1, 1)} BackgroundTransparency={1} Visible={() => abaDireita() === "tiles"}>
						<Paleta imagens={imagens} selecao={selecao} />
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
						<PainelMarcadores modelo={modeloAtual} versao={versaoMarcadores} hist={hist} pedido={pedido} aoMudar={() => sujo(true)} aviso={avisar} />
					</frame>
					<frame Size={UDim2.fromScale(1, 1)} BackgroundTransparency={1} Visible={() => abaDireita() === "log"}>
						<AreaTexto texto={() => (log() === "" ? "O log do gerador aparece aqui." : log())} />
					</frame>
				</frame>
			</frame>
		</Painel>
	);
}

export function abrir(plugin: Plugin) {
	return abrirWidget(plugin, { id: "mapas", titulo: "Mapas", largura: 1100, altura: 700, larguraMinima: 800, alturaMinima: 480 }, (gui) =>
		mount(() => <PainelMapas gui={gui} />, gui),
	);
}
