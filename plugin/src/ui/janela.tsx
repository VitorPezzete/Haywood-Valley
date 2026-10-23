// A moldura da janela única do Diorama (2026-10-20): o cabeçalho (o mapa aberto, "Pedir ao Claude" e o indicador
// de estado), a navegação lateral com as seções e o quadro de cada seção, onde widget.ts monta o painel na primeira
// vez que a seção fica à vista. Por cima, uma sobreposição de cada vez: a lista de mapas, os detalhes do estado
// (ponte, canal do Studio, Aseprite, Rojo) ou a caixa "Pedir ao Claude".
//
// Atalhos com a janela focada: Ctrl+K abre o Claude; Esc fecha a sobreposição; Ctrl+1 a Ctrl+7 trocam de seção.
import { Selection, UserInputService } from "@rbxts/services";
import Vide, { action, cleanup, For, mount, source, untrack } from "@rbxts/vide";
import { ambienteSeHouver } from "../ambiente";
import { estadoCanal } from "../canal";
import { definirUltimaSecao } from "../config";
import { mapaAberto, mapaSujo, mapas, recarregarMapas, statusPonte, ultimosProblemas } from "../estado";
import { ContextoPedido, conversa, decidir, enviarPedido, limparConversa, pararPedido, pensando, propostaPendente } from "../ia";
import { controleMapas } from "../mapas/controle";
import { COMO_LIGAR, enderecoPonte, erroPonte, ponteLigada, status } from "../ponte";
import { DefinicaoSecao, ICONE_CLAUDE, SECOES } from "../secoes";
import { modoAtual } from "../servidor/execucao";
import { acoesDe, argTexto, registrarAcoes } from "../simulacao";
import { VERSAO } from "../versao";
import { definirQuadro, janelaAberta, mostrar, secaoAberta } from "../widget";
import { copiarTexto } from "./copiar";
import { Botao, cor, FONTE, FONTE_NEGRITO, Lista, Rotulo, Separador, tema, TEXTO, Titulo } from "./kit";
import { PainelClaude } from "./pedirClaude";
import { CorEstado, Icone, LinhaEstado, Ponto } from "./simples";

const CABECALHO = 38;
const NAV = 78;
const ITEM_NAV = 54;

type Sobreposicao = "mapas" | "estado" | "claude" | undefined;

/** A sobreposição aberta (exportada para o canal e o autoteste abrirem a caixa do Claude sem clicar). */
export const sobreposicao = source<Sobreposicao>(undefined);
/** Já houve uma conferência da ponte nesta sessão? (antes dela, o indicador fica cinza: "Verificando…"). */
const conferiu = source(false);

interface Geral {
	cor: CorEstado;
	frase: string;
}

/** O estado geral do indicador do cabeçalho: uma cor e uma frase. */
export function estadoGeral(): Geral {
	if (!conferiu() && !ponteLigada()) return { cor: "cinza", frase: "Verificando…" };
	if (!ponteLigada()) return { cor: "vermelho", frase: "Ponte desligada" };
	const a = statusPonte()?.aseprite;
	if (a !== undefined && !a.conectado) return { cor: "amarelo", frase: "Aseprite desligado" };
	const canal = estadoCanal();
	if (!canal.ligado && modoAtual() !== "cliente") return { cor: "amarelo", frase: "Canal do Studio desligado" };
	return { cor: "verde", frase: "Tudo ligado" };
}

/** Confere a ponte (GET /status) e atualiza o indicador. Yielda. */
export function conferirConexoes() {
	const r = status();
	statusPonte(r.ok ? r.valor : undefined);
	conferiu(true);
	return r;
}

/** O contexto que vai junto de cada pedido ao Claude. */
function contextoDoPedido(): ContextoPedido {
	const selecao: Record<string, unknown> = {};
	const c = controleMapas();
	if (c) {
		const ctx = c.contexto();
		for (const [k, v] of pairs(ctx)) selecao[k as string] = v;
	}
	const studio = new Array<string>();
	pcall(() => {
		for (const i of Selection.Get()) if (studio.size() < 10) studio.push(i.GetFullName());
	});
	if (studio.size() > 0) selecao.studio = studio;
	const problemas = untrack(ultimosProblemas) ?? [];
	return {
		mapa: untrack(mapaAberto),
		secao: untrack(secaoAberta),
		selecao,
		problemas: problemas.filter((_, i) => i < 30),
	};
}

/** Espera o editor de mapas registrar o controle (a seção acabou de montar). Yielda. */
function esperarControle() {
	const limite = os.clock() + 5;
	let c = controleMapas();
	while (!c && os.clock() < limite) {
		task.wait(0.05);
		c = controleMapas();
	}
	return c;
}

/** Vai à tela inicial do Mapa ("abrir" mostra a lista de mapas; "novo", o campo do nome). */
export function irAoInicio(modo: "abrir" | "novo") {
	sobreposicao(undefined);
	mostrar("mapa");
	task.spawn(() => esperarControle()?.inicio(modo));
}

/** "Verificar tudo" de qualquer lugar: abre o Verificar e roda o diagnóstico. */
export function verificarTudo() {
	sobreposicao(undefined);
	const montadaAntes = acoesDe("verificar") !== undefined;
	mostrar("verificar");
	// Ao montar, o Verificar já roda sozinho; montado, roda de novo.
	if (montadaAntes) task.spawn(() => acoesDe("verificar")?.rodar({}));
}

// ------------------------------------------------------------------ peças da moldura

function ItemNavegacao(props: { secao: DefinicaoSecao; ordem: number; aoClicar: () => void }) {
	const passando = source(false);
	const ativo = () => secaoAberta() === props.secao.id;
	return (
		<textbutton
			Name={`Nav_${props.secao.id}`}
			AutoButtonColor={false}
			Text=""
			Size={new UDim2(1, 0, 0, ITEM_NAV)}
			BackgroundColor3={() =>
				tema().GetColor(
					Enum.StudioStyleGuideColor.Item,
					ativo() ? Enum.StudioStyleGuideModifier.Selected : passando() ? Enum.StudioStyleGuideModifier.Hover : Enum.StudioStyleGuideModifier.Default,
				)
			}
			BackgroundTransparency={() => (ativo() || passando() ? 0 : 1)}
			BorderSizePixel={0}
			LayoutOrder={props.ordem}
			Activated={props.aoClicar}
			MouseEnter={() => passando(true)}
			MouseLeave={() => passando(false)}
		>
			<frame
				Name="Marca"
				Size={new UDim2(0, 3, 1, -12)}
				Position={UDim2.fromOffset(0, 6)}
				BackgroundColor3={cor(Enum.StudioStyleGuideColor.MainButton)}
				BorderSizePixel={0}
				Visible={ativo}
			/>
			<Icone icone={props.secao.icone} tamanho={22} posicao={new UDim2(0.5, 0, 0, 7)} ancora={new Vector2(0.5, 0)} />
			<textlabel
				Name="Nome"
				BackgroundTransparency={1}
				Position={new UDim2(0, 2, 0, 32)}
				Size={new UDim2(1, -4, 0, 16)}
				FontFace={() => (ativo() ? FONTE_NEGRITO : FONTE)}
				Text={props.secao.nome}
				TextSize={TEXTO - 2}
				TextColor3={() => tema().GetColor(ativo() ? Enum.StudioStyleGuideColor.BrightText : Enum.StudioStyleGuideColor.MainText)}
				TextTruncate={Enum.TextTruncate.AtEnd}
			/>
		</textbutton>
	);
}

/** Botão do cabeçalho com ícone opcional (o texto encolhe com a janela). */
function BotaoCabecalho(props: {
	nome: string;
	texto: () => string;
	icone?: DefinicaoSecao["icone"];
	ponto?: () => CorEstado;
	ativo: () => boolean;
	aoClicar: () => void;
	largura: () => number;
	ordem: number;
}) {
	const passando = source(false);
	const recuo = props.icone || props.ponto ? 28 : 8;
	return (
		<textbutton
			Name={props.nome}
			AutoButtonColor={false}
			Text=""
			Size={() => UDim2.fromOffset(props.largura(), CABECALHO - 10)}
			BackgroundColor3={() =>
				tema().GetColor(
					Enum.StudioStyleGuideColor.Button,
					props.ativo() ? Enum.StudioStyleGuideModifier.Selected : passando() ? Enum.StudioStyleGuideModifier.Hover : Enum.StudioStyleGuideModifier.Default,
				)
			}
			BorderSizePixel={0}
			LayoutOrder={props.ordem}
			Activated={props.aoClicar}
			MouseEnter={() => passando(true)}
			MouseLeave={() => passando(false)}
		>
			<uicorner CornerRadius={new UDim(0, 4)} />
			<uistroke Color={cor(Enum.StudioStyleGuideColor.ButtonBorder)} Thickness={1} />
			{props.icone ? <Icone icone={props.icone} tamanho={18} posicao={new UDim2(0, 6, 0.5, 0)} ancora={new Vector2(0, 0.5)} /> : undefined}
			{props.ponto ? <Ponto cor={props.ponto} tamanho={11} posicao={new UDim2(0, 10, 0.5, 0)} ancora={new Vector2(0, 0.5)} /> : undefined}
			<textlabel
				BackgroundTransparency={1}
				Position={UDim2.fromOffset(recuo, 0)}
				Size={new UDim2(1, -recuo - 6, 1, 0)}
				FontFace={FONTE}
				Text={props.texto}
				TextSize={TEXTO}
				TextColor3={cor(Enum.StudioStyleGuideColor.ButtonText)}
				TextXAlignment={Enum.TextXAlignment.Left}
				TextTruncate={Enum.TextTruncate.AtEnd}
			/>
		</textbutton>
	);
}

/** Uma caixa por cima do conteúdo, com borda e sombra leve. */
function Caixa(props: { children?: Vide.Node; posicao: () => UDim2; tamanho: () => UDim2; ancora?: Vector2; nome: string; visivel: () => boolean }) {
	return (
		<frame
			Name={props.nome}
			Position={props.posicao}
			Size={props.tamanho}
			AnchorPoint={props.ancora}
			BackgroundColor3={cor(Enum.StudioStyleGuideColor.MainBackground)}
			BorderSizePixel={0}
			Visible={props.visivel}
			Active={true}
			ZIndex={50}
		>
			<uistroke Color={cor(Enum.StudioStyleGuideColor.Border)} Thickness={1} />
			<uicorner CornerRadius={new UDim(0, 4)} />
			{props.children}
		</frame>
	);
}

// ------------------------------------------------------------------ detalhes do estado

function DetalhesEstado() {
	const mensagem = source("");
	const conferindo = source(false);
	const tentar = () => {
		if (conferindo()) return;
		conferindo(true);
		mensagem("Conferindo…");
		task.spawn(() => {
			const r = conferirConexoes();
			conferindo(false);
			mensagem(r.ok ? "" : "A ponte continua desligada.");
		});
	};
	const caminhoCmd = () => {
		const raiz = statusPonte()?.raiz;
		return raiz !== undefined ? `${raiz}\\Diorama.cmd` : "C:\\Users\\<você>\\Documents\\Haywood-Valley\\Diorama.cmd";
	};
	const copiarCaminho = () => {
		const t = caminhoCmd();
		mensagem(copiarTexto(t) ? "Caminho copiado." : `O Studio não copia sozinho; o caminho é: ${t}`);
	};
	const amb = ambienteSeHouver();
	return (
		<Lista tamanho={UDim2.fromScale(1, 1)} espaco={6}>
			<uipadding PaddingTop={new UDim(0, 8)} PaddingBottom={new UDim(0, 8)} PaddingLeft={new UDim(0, 10)} PaddingRight={new UDim(0, 14)} />
			<Titulo texto="Conexões" ordem={0} />
			<LinhaEstado
				cor={() => (ponteLigada() ? "verde" : "vermelho")}
				texto={() =>
					ponteLigada()
						? `Ponte ligada${statusPonte() ? ` (versão ${statusPonte()!.versao})` : ""}. É o programa que liga o Studio aos arquivos do jogo.`
						: "Ponte desligada: sem ela o Diorama não abre nem salva mapas."
				}
				ordem={1}
			/>
			<frame Name="ComoLigar" BackgroundTransparency={1} Size={new UDim2(1, 0, 0, 0)} AutomaticSize={Enum.AutomaticSize.Y} Visible={() => !ponteLigada()} LayoutOrder={2}>
				<uilistlayout FillDirection={Enum.FillDirection.Vertical} SortOrder={Enum.SortOrder.LayoutOrder} Padding={new UDim(0, 4)} />
				<Rotulo texto="Para ligar: dê dois cliques em Diorama.cmd, na pasta do repositório. Deixe a janela preta aberta." negrito={true} ordem={0} />
				<Botao texto="Copiar o caminho do Diorama.cmd" aoClicar={copiarCaminho} ordem={1} />
			</frame>
			<LinhaEstado
				cor={() => {
					if (!ponteLigada()) return "cinza";
					const a = statusPonte()?.aseprite;
					return a === undefined ? "cinza" : a.conectado ? "verde" : "amarelo";
				}}
				texto={() => {
					const a = statusPonte()?.aseprite;
					if (!ponteLigada() || a === undefined) return "Aseprite: sem notícia (precisa da ponte).";
					return a.conectado ? `Aseprite conectado (extensão ${a.versao ?? "?"}).` : "Aseprite desligado: abra o Aseprite; a extensão Diorama conecta sozinha.";
				}}
				ordem={3}
			/>
			<LinhaEstado
				cor={() => (estadoCanal().ligado ? "verde" : modoAtual() === "cliente" ? "cinza" : "amarelo")}
				texto={() => {
					const e = estadoCanal();
					if (e.ligado) return `Canal do Studio ligado: o Claude pode pedir coisas a este Studio (${e.atendidos} pedido(s) atendido(s)).`;
					return modoAtual() === "cliente" ? "Canal do Studio: não existe na janela do jogador do Play." : "Canal do Studio desligado (liga junto com a ponte).";
				}}
				ordem={4}
			/>
			<LinhaEstado
				cor={() => (statusPonte()?.rojo.ligado ? "verde" : "cinza")}
				texto={() => {
					const s = statusPonte();
					if (!s) return "Rojo: sem notícia (precisa da ponte).";
					return s.rojo.ligado ? "Rojo ligado: o jogo recebe o código novo." : "Rojo desligado: só faz falta para testar no jogo (npm run serve e Connect).";
				}}
				ordem={5}
			/>
			<Separador ordem={6} />
			<Rotulo
				texto={() => `Diorama ${VERSAO}${amb ? ` · pacote ${amb.origem === "ponte" ? "da ponte (atualiza sozinho)" : "embutido"}` : ""} · ponte em ${enderecoPonte()}`}
				tom="fraco"
				ordem={7}
			/>
			<Rotulo texto={() => (!ponteLigada() ? (erroPonte() ?? COMO_LIGAR) : "")} tom="fraco" ordem={8} />
			<Rotulo texto={mensagem} tom="aviso" ordem={9} />
			<frame BackgroundTransparency={1} Size={new UDim2(1, 0, 0, TEXTO + 10)} LayoutOrder={10}>
				<uilistlayout FillDirection={Enum.FillDirection.Horizontal} SortOrder={Enum.SortOrder.LayoutOrder} Padding={new UDim(0, 6)} />
				<Botao texto={() => (conferindo() ? "Conferindo…" : "Tentar de novo")} principal={true} desligado={conferindo} aoClicar={tentar} ordem={0} />
				<Botao
					texto="Configurações"
					aoClicar={() => {
						sobreposicao(undefined);
						mostrar("configuracoes");
						definirUltimaSecao("configuracoes");
					}}
					ordem={1}
				/>
			</frame>
		</Lista>
	);
}

// ------------------------------------------------------------------ lista de mapas

function ListaDeMapas() {
	const mensagem = source("");
	const carregando = source(false);
	const atualizar = () => {
		if (carregando()) return;
		carregando(true);
		task.spawn(() => {
			const r = recarregarMapas();
			carregando(false);
			mensagem(r.ok ? (r.valor.size() === 0 ? "Nenhum mapa ainda. Crie o primeiro." : "") : (erroPonte() ?? r.erro));
		});
	};
	atualizar();
	const escolher = (id: string) => {
		mensagem("Abrindo…");
		mostrar("mapa");
		definirUltimaSecao("mapa");
		task.spawn(() => {
			const c = esperarControle();
			if (!c) return mensagem("O editor não abriu; veja o Output.");
			const pergunta = c.clicar(id);
			if (pergunta !== undefined) mensagem(pergunta);
			else {
				mensagem("");
				sobreposicao(undefined);
			}
		});
	};
	return (
		<frame Size={UDim2.fromScale(1, 1)} BackgroundTransparency={1}>
			<uipadding PaddingTop={new UDim(0, 8)} PaddingBottom={new UDim(0, 8)} PaddingLeft={new UDim(0, 8)} PaddingRight={new UDim(0, 8)} />
			<uilistlayout FillDirection={Enum.FillDirection.Vertical} SortOrder={Enum.SortOrder.LayoutOrder} Padding={new UDim(0, 6)} />
			<frame BackgroundTransparency={1} Size={new UDim2(1, 0, 0, TEXTO + 10)} LayoutOrder={0}>
				<uilistlayout FillDirection={Enum.FillDirection.Horizontal} SortOrder={Enum.SortOrder.LayoutOrder} Padding={new UDim(0, 6)} />
				<Botao texto="+ Novo mapa" principal={true} aoClicar={() => irAoInicio("novo")} ordem={0} />
				<Botao texto={() => (carregando() ? "Atualizando…" : "Atualizar")} desligado={carregando} aoClicar={atualizar} ordem={1} />
			</frame>
			<Rotulo texto={mensagem} tom="aviso" ordem={1} />
			<frame Name="Mapas" BackgroundTransparency={1} Size={new UDim2(1, 0, 1, -(TEXTO + 16) - 30)} LayoutOrder={2}>
				<uiflexitem FlexMode={Enum.UIFlexMode.Fill} />
				<Lista tamanho={UDim2.fromScale(1, 1)} espaco={2}>
					<For each={mapas}>
						{(m, i) => (
							<Botao
								texto={() => `${m.id}${mapaAberto() === m.id ? (mapaSujo() ? "  (aberto, não salvo)" : "  (aberto)") : ""}`}
								ativo={() => mapaAberto() === m.id}
								aoClicar={() => escolher(m.id)}
								largura={new UDim(1, -10)}
								ordem={i()}
							/>
						)}
					</For>
				</Lista>
			</frame>
		</frame>
	);
}

// ------------------------------------------------------------------ a janela

function Janela(props: { gui: DockWidgetPluginGui; secoes: ReadonlyArray<DefinicaoSecao> }) {
	const largura = source(props.gui.AbsoluteSize.X);
	const altura = source(props.gui.AbsoluteSize.Y);
	const estreita = () => largura() < 640;

	const abrirSecao = (id: string) => {
		sobreposicao(undefined);
		mostrar(id);
		definirUltimaSecao(id);
	};
	const alternarSobreposicao = (qual: Sobreposicao) => sobreposicao(sobreposicao() === qual ? undefined : qual);

	// O título da janela: o mapa aberto e o "*" de não salvo.
	const atualizarTitulo = () => {
		const id = mapaAberto();
		(props.gui as unknown as { Title: string }).Title = `Diorama${id !== undefined ? ` — ${id}${mapaSujo() ? " *" : ""}` : ""}`;
	};

	// Confere as conexões de 5 em 5 s enquanto a janela está aberta (o canal já mantém ponteLigada em dia).
	let vivo = true;
	cleanup(() => {
		vivo = false;
		(props.gui as unknown as { Title: string }).Title = "Diorama";
	});
	task.spawn(() => {
		while (vivo) {
			if (props.gui.Enabled) pcall(conferirConexoes);
			task.wait(5);
		}
	});

	// Teclado (com a janela focada e nenhum campo de texto ativo, menos o Esc).
	let focado = false;
	cleanup(props.gui.WindowFocused.Connect(() => (focado = true)));
	cleanup(props.gui.WindowFocusReleased.Connect(() => (focado = false)));
	cleanup(
		UserInputService.InputBegan.Connect((input) => {
			if (!focado || input.UserInputType !== Enum.UserInputType.Keyboard) return;
			const ctrl = UserInputService.IsKeyDown(Enum.KeyCode.LeftControl) || UserInputService.IsKeyDown(Enum.KeyCode.RightControl);
			const k = input.KeyCode;
			if (k === Enum.KeyCode.Escape && sobreposicao() !== undefined) return sobreposicao(undefined);
			if (!ctrl) return;
			if (k === Enum.KeyCode.K) return alternarSobreposicao("claude");
			const numeros: Enum.KeyCode[] = [Enum.KeyCode.One, Enum.KeyCode.Two, Enum.KeyCode.Three, Enum.KeyCode.Four, Enum.KeyCode.Five, Enum.KeyCode.Six, Enum.KeyCode.Seven];
			const i = numeros.indexOf(k);
			if (i >= 0 && props.secoes[i] && UserInputService.GetFocusedTextBox() === undefined) abrirSecao(props.secoes[i].id);
		}),
	);

	// "Pedir ao Claude" visto de fora (simulacao.ts; `simular { ferramenta: "claude", acao }`, 2026-10-23): os mesmos
	// passos dos cliques da caixa. `enviar` e `aplicar` não esperam o Claude (pode levar minutos): `estado` diz onde está.
	cleanup(
		registrarAcoes("claude", {
			abrir: () => {
				props.gui.Enabled = true;
				sobreposicao("claude");
				return true;
			},
			fechar: () => {
				sobreposicao(undefined);
				return true;
			},
			enviar: (args) => {
				const texto = argTexto(args, "texto");
				if (pensando()) error("o Claude ainda está pensando; espere ou pare o pedido", 0);
				sobreposicao("claude");
				task.spawn(enviarPedido, texto, contextoDoPedido());
				return true;
			},
			aplicar: () => {
				if (!propostaPendente()) error("não há proposta esperando o Aplicar", 0);
				task.spawn(decidir, true);
				return true;
			},
			cancelar: () => {
				if (!propostaPendente()) error("não há proposta esperando", 0);
				decidir(false);
				return true;
			},
			parar: () => {
				pararPedido();
				return true;
			},
			limpar: () => {
				limparConversa();
				return true;
			},
			estado: () => ({
				aberta: props.gui.Enabled && sobreposicao() === "claude",
				pensando: pensando(),
				proposta: propostaPendente()?.proposta,
				conversa: conversa().map((m) => ({ quem: m.quem, texto: m.texto, proposta: m.proposta, decisao: m.decisao })),
				contexto: contextoDoPedido(),
			}),
		}),
	);

	const larguraClaude = () => (largura() >= 760 ? 190 : 92);
	const larguraEstado = () => (largura() >= 760 ? 190 : largura() >= 520 ? 150 : 44);
	const larguraDireita = () => larguraClaude() + larguraEstado() + 6 + 8;
	const principais = props.secoes.filter((s) => !s.rodape);
	const rodape = props.secoes.filter((s) => s.rodape === true);

	return (
		<frame
			Name="Diorama"
			Size={UDim2.fromScale(1, 1)}
			BackgroundColor3={cor(Enum.StudioStyleGuideColor.MainBackground)}
			BorderSizePixel={0}
		>
			{action((f: Frame) => {
				const medir = () => {
					largura(f.AbsoluteSize.X);
					altura(f.AbsoluteSize.Y);
				};
				medir();
				f.GetPropertyChangedSignal("AbsoluteSize").Connect(medir);
				janelaAberta();
				atualizarTitulo();
			})}
			{/* Cabeçalho */}
			<frame
				Name="Cabecalho"
				Size={new UDim2(1, 0, 0, CABECALHO)}
				BackgroundColor3={cor(Enum.StudioStyleGuideColor.Titlebar)}
				BorderSizePixel={0}
				ZIndex={2}
			>
				<frame Name="Linha" Position={new UDim2(0, 0, 1, -1)} Size={new UDim2(1, 0, 0, 1)} BackgroundColor3={cor(Enum.StudioStyleGuideColor.Border)} BorderSizePixel={0} />
				<frame Name="Esquerda" BackgroundTransparency={1} Position={UDim2.fromOffset(6, 5)} Size={() => new UDim2(1, -larguraDireita() - 6, 1, -10)}>
					<BotaoCabecalho
						nome="SeletorMapa"
						texto={() => {
							atualizarTitulo();
							const id = mapaAberto();
							return id !== undefined ? `${id}${mapaSujo() ? " *" : ""}  ▾` : "Escolher mapa  ▾";
						}}
						icone={SECOES[0].icone}
						ativo={() => sobreposicao() === "mapas"}
						aoClicar={() => alternarSobreposicao("mapas")}
						largura={() => math.max(120, math.min(340, largura() - larguraDireita() - 12))}
						ordem={0}
					/>
				</frame>
				<frame Name="Direita" BackgroundTransparency={1} AnchorPoint={new Vector2(1, 0)} Position={new UDim2(1, -6, 0, 5)} Size={() => new UDim2(0, larguraDireita(), 1, -10)}>
					<uilistlayout
						FillDirection={Enum.FillDirection.Horizontal}
						HorizontalAlignment={Enum.HorizontalAlignment.Right}
						SortOrder={Enum.SortOrder.LayoutOrder}
						Padding={new UDim(0, 6)}
					/>
					<BotaoCabecalho
						nome="PedirClaude"
						texto={() => (largura() >= 760 ? "Pedir ao Claude  Ctrl+K" : "Claude")}
						icone={ICONE_CLAUDE}
						ativo={() => sobreposicao() === "claude"}
						aoClicar={() => alternarSobreposicao("claude")}
						largura={larguraClaude}
						ordem={0}
					/>
					<BotaoCabecalho
						nome="Estado"
						texto={() => (larguraEstado() > 60 ? estadoGeral().frase : "")}
						ponto={() => estadoGeral().cor}
						ativo={() => sobreposicao() === "estado"}
						aoClicar={() => alternarSobreposicao("estado")}
						largura={larguraEstado}
						ordem={1}
					/>
				</frame>
			</frame>

			{/* Navegação */}
			<frame
				Name="Navegacao"
				Position={UDim2.fromOffset(0, CABECALHO)}
				Size={new UDim2(0, NAV, 1, -CABECALHO)}
				BackgroundColor3={cor(Enum.StudioStyleGuideColor.Titlebar)}
				BorderSizePixel={0}
			>
				<frame Name="Linha" Position={new UDim2(1, -1, 0, 0)} Size={new UDim2(0, 1, 1, 0)} BackgroundColor3={cor(Enum.StudioStyleGuideColor.Border)} BorderSizePixel={0} />
				<frame Name="Principais" BackgroundTransparency={1} Position={UDim2.fromOffset(0, 4)} Size={new UDim2(1, -1, 1, -(ITEM_NAV * rodape.size() + 8))}>
					<uilistlayout FillDirection={Enum.FillDirection.Vertical} SortOrder={Enum.SortOrder.LayoutOrder} Padding={new UDim(0, 2)} />
					{principais.map((s, i) => (
						<ItemNavegacao secao={s} ordem={i} aoClicar={() => abrirSecao(s.id)} />
					))}
				</frame>
				<frame Name="Rodape" BackgroundTransparency={1} AnchorPoint={new Vector2(0, 1)} Position={new UDim2(0, 0, 1, -4)} Size={new UDim2(1, -1, 0, ITEM_NAV * rodape.size())}>
					<uilistlayout FillDirection={Enum.FillDirection.Vertical} SortOrder={Enum.SortOrder.LayoutOrder} />
					{rodape.map((s, i) => (
						<ItemNavegacao secao={s} ordem={i} aoClicar={() => abrirSecao(s.id)} />
					))}
				</frame>
			</frame>

			{/* Conteúdo: um quadro por seção; só o da seção aberta fica à vista. */}
			<frame Name="Conteudo" Position={UDim2.fromOffset(NAV, CABECALHO)} Size={new UDim2(1, -NAV, 1, -CABECALHO)} BackgroundTransparency={1} ClipsDescendants={true}>
				{props.secoes.map((s) => (
					<frame Name={`Secao_${s.id}`} Size={UDim2.fromScale(1, 1)} BackgroundTransparency={1} Visible={() => secaoAberta() === s.id}>
						{action((q: Frame) => definirQuadro(s.id, q))}
					</frame>
				))}
			</frame>

			{/* Sobreposições: o fundo pega o clique fora da caixa e fecha. */}
			<textbutton
				Name="Fora"
				Text=""
				AutoButtonColor={false}
				BackgroundColor3={Color3.fromRGB(0, 0, 0)}
				BackgroundTransparency={() => (sobreposicao() === "claude" && estreita() ? 0.6 : 0.85)}
				BorderSizePixel={0}
				Position={UDim2.fromOffset(0, CABECALHO)}
				Size={new UDim2(1, 0, 1, -CABECALHO)}
				Visible={() => sobreposicao() !== undefined}
				ZIndex={40}
				Activated={() => sobreposicao(undefined)}
			/>
			<Caixa
				nome="CaixaMapas"
				posicao={() => UDim2.fromOffset(6, CABECALHO - 2)}
				tamanho={() => UDim2.fromOffset(math.min(380, largura() - 12), math.min(460, altura() - CABECALHO - 10))}
				visivel={() => sobreposicao() === "mapas"}
			>
				<ListaDeMapas />
			</Caixa>
			<Caixa
				nome="CaixaEstado"
				ancora={new Vector2(1, 0)}
				posicao={() => new UDim2(1, -6, 0, CABECALHO - 2)}
				tamanho={() => UDim2.fromOffset(math.min(400, largura() - 12), math.min(380, altura() - CABECALHO - 10))}
				visivel={() => sobreposicao() === "estado"}
			>
				<DetalhesEstado />
			</Caixa>
			<Caixa
				nome="CaixaClaude"
				ancora={new Vector2(1, 0)}
				posicao={() => new UDim2(1, 0, 0, CABECALHO)}
				tamanho={() => new UDim2(0, estreita() ? largura() : math.min(460, largura() * 0.5), 1, -CABECALHO)}
				visivel={() => sobreposicao() === "claude"}
			>
				<PainelClaude contexto={contextoDoPedido} aoFechar={() => sobreposicao(undefined)} />
			</Caixa>
		</frame>
	);
}

/** Monta a moldura na janela e devolve a função que a desmonta. */
export function montarJanela(gui: DockWidgetPluginGui, secoes: ReadonlyArray<DefinicaoSecao>): () => void {
	const desmontar = mount(() => <Janela gui={gui} secoes={secoes} />, gui);
	return () => {
		desmontar();
		sobreposicao(undefined);
		for (const filho of gui.GetChildren()) if (filho.Name === "Diorama") filho.Destroy();
	};
}
