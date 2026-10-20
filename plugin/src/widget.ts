// A janela única do Diorama e as seções dela (2026-10-20). A casca cria um botão e um DockWidgetPluginGui; aqui o
// pacote guarda a janela, o quadro de cada seção (criado pela moldura, ui/janela.tsx) e monta o painel da seção na
// primeira vez que ela fica à vista (montar o editor de mapas é caro; não vale fazer para uma seção fechada).
//
// O nome do arquivo ficou "widget.ts" porque os painéis e o canal importavam daqui (`mostrar`, `widgetVisivel`...);
// as funções mantêm os nomes, agora valendo para seções. Todo id passa por `resolverSecao`, então os nomes antigos
// das ferramentas ("mapas", "catalogo", "servidor"...) continuam funcionando.
//
// Este módulo não importa os painéis (eles importam daqui): `app.ts` entrega a lista.
import { source } from "@rbxts/vide";
import { aoParar, ambiente } from "./ambiente";
import { resolverSecao } from "./secoes";

/** O que um painel recebe ao montar. */
export interface ContextoSecao {
	plugin: Plugin;
	/** A janela (para foco do teclado, título e Enabled). */
	gui: DockWidgetPluginGui;
}

export interface SecaoMontavel {
	id: string;
	nome: string;
	/** Monta o painel no quadro da seção e devolve a função que o desmonta. */
	montar: (quadro: Frame, contexto: ContextoSecao) => () => void;
}

/** Compatibilidade com o formato das ferramentas de antes (o README antigo e outros agentes citam). */
export type OpcoesWidget = { titulo: string; largura?: number; altura?: number; larguraMinima?: number; alturaMinima?: number };

interface Registro {
	secao: SecaoMontavel;
	quadro?: Frame;
	desmontar?: () => void;
	/** O erro da última montagem, se falhou. */
	erro?: string;
}

const registros = new Map<string, Registro>();
const ordem = new Array<string>();
let gui: DockWidgetPluginGui | undefined;
let botao: PluginToolbarButton | undefined;

/** A seção à vista na janela. */
export const secaoAberta = source("mapa");
/** A janela está aberta (Enabled)? Espelho reativo para a moldura. */
export const janelaAberta = source(false);

/** Desmonta o painel (o Vide só encerra os efeitos; as instâncias saem com ClearAllChildren). */
function desmontarRegistro(r: Registro) {
	if (r.desmontar) {
		const [ok, erro] = pcall(r.desmontar);
		if (!ok) warn(`[Diorama] erro ao desmontar ${r.secao.nome}: ${tostring(erro)}`);
		r.desmontar = undefined;
	}
	if (r.quadro) {
		const q = r.quadro;
		pcall(() => q.ClearAllChildren());
	}
}

/**
 * Pega da casca o botão e a janela e registra as seções (sem montar). Com a casca da janela única, ela já liga o
 * clique; com uma casca anterior (até o Studio reiniciar), o pacote pede um botão "Diorama" novo e liga ele mesmo.
 */
export function prepararJanela(lista: ReadonlyArray<SecaoMontavel>): DockWidgetPluginGui {
	const a = ambiente();
	if (a.janela) {
		gui = a.janela.gui;
		botao = a.janela.botao;
	} else {
		gui = a.widget("Diorama_janela", { titulo: "", largura: 980, altura: 660, larguraMinima: 420, alturaMinima: 320 });
		botao = a.botao("diorama", "Diorama", "Abre o Diorama numa janela só.", "");
		const g = gui;
		aoParar(botao.Click.Connect(() => (g.Enabled = !g.Enabled)));
	}
	for (const secao of lista) {
		registros.set(secao.id, { secao });
		ordem.push(secao.id);
	}
	const g = gui;
	janelaAberta(g.Enabled);
	aoParar(
		g.GetPropertyChangedSignal("Enabled").Connect(() => {
			janelaAberta(g.Enabled);
			botao?.SetActive(g.Enabled);
			if (g.Enabled) garantirMontada(secaoAberta());
		}),
	);
	botao.SetActive(g.Enabled);
	return g;
}

/** A moldura (ui/janela.tsx) entrega o quadro de cada seção quando o cria. */
export function definirQuadro(id: string, quadro: Frame) {
	const r = registros.get(id);
	if (r) r.quadro = quadro;
}

/**
 * Monta o painel da seção, se ainda não está montado. Devolve o erro, se a montagem falhou (o quadro fica com uma
 * mensagem no lugar do painel).
 */
export function garantirMontada(idOuApelido: string): string | undefined {
	const id = resolverSecao(idOuApelido);
	const r = registros.get(id);
	if (!r) return `seção desconhecida: ${idOuApelido}`;
	if (r.desmontar) return undefined;
	if (!r.quadro || !gui) return `a seção ${r.secao.nome} ainda não tem quadro (a janela não montou)`;
	const quadro = r.quadro;
	const contexto: ContextoSecao = { plugin: ambiente().plugin, gui };
	const [ok, resultado] = pcall(() => r.secao.montar(quadro, contexto));
	if (!ok || !typeIs(resultado, "function")) {
		r.erro = ok ? "montar não devolveu a função de desmontar" : tostring(resultado);
		warn(`[Diorama] a seção ${r.secao.nome} não montou: ${r.erro}`);
		pcall(() => quadro.ClearAllChildren());
		const aviso = new Instance("TextLabel");
		aviso.Size = UDim2.fromScale(1, 1);
		aviso.BackgroundTransparency = 1;
		aviso.TextWrapped = true;
		aviso.TextSize = 15;
		aviso.TextXAlignment = Enum.TextXAlignment.Left;
		aviso.TextYAlignment = Enum.TextYAlignment.Top;
		aviso.Text = `${r.secao.nome} não abriu: ${r.erro}\n\nRecarregue o plugin (salve qualquer arquivo do plugin com a ponte no ar) ou veja o Output.`;
		aviso.Parent = quadro;
		return r.erro;
	}
	r.erro = undefined;
	r.desmontar = resultado as () => void;
	return undefined;
}

/** Abre a janela na seção (e monta o painel). Devolve o erro da montagem, se houve. */
export function mostrar(idOuApelido: string): string | undefined {
	const id = resolverSecao(idOuApelido);
	if (!registros.has(id)) return `seção desconhecida: ${idOuApelido}`;
	secaoAberta(id);
	if (gui) gui.Enabled = true;
	return garantirMontada(id);
}

/** Abre a janela fechada ou fecha a aberta. */
export function alternarJanela() {
	if (gui) gui.Enabled = !gui.Enabled;
}

/** Compatibilidade: alternar uma "ferramenta" agora é abrir a seção ou fechar a janela. */
export function alternar(idOuApelido: string) {
	if (gui && gui.Enabled && secaoAberta() === resolverSecao(idOuApelido)) gui.Enabled = false;
	else mostrar(idOuApelido);
}

/** A janela única. */
export function janela(): DockWidgetPluginGui | undefined {
	return gui;
}

/** O botão da barra. */
export function botaoDaBarra(): PluginToolbarButton | undefined {
	return botao;
}

/** O quadro da seção (onde o painel monta). */
export function quadro(idOuApelido: string): Frame | undefined {
	return registros.get(resolverSecao(idOuApelido))?.quadro;
}

/** O painel da seção está montado? */
export function montada(idOuApelido: string): boolean {
	return registros.get(resolverSecao(idOuApelido))?.desmontar !== undefined;
}

/** O erro da última montagem da seção, se falhou. */
export function erroDeMontagem(idOuApelido: string): string | undefined {
	return registros.get(resolverSecao(idOuApelido))?.erro;
}

/** Desmonta o painel da seção (o quadro continua; mostrar de novo monta outra vez). */
export function desmontar(idOuApelido: string) {
	const r = registros.get(resolverSecao(idOuApelido));
	if (r) desmontarRegistro(r);
}

/**
 * A seção está à vista (janela aberta e seção escolhida)? Os laços dos painéis param de trabalhar quando não está
 * (o Testar relê o modo do Studio de segundo em segundo, o Output refaz o texto).
 */
export function secaoVisivel(idOuApelido: string): boolean {
	return gui !== undefined && gui.Enabled && secaoAberta() === resolverSecao(idOuApelido);
}

/** O nome de antes, para os painéis que já o usavam. */
export const widgetVisivel = secaoVisivel;

/** As seções com o painel montado. */
export function secoesMontadas(): string[] {
	const lista = new Array<string>();
	for (const id of ordem) if (registros.get(id)?.desmontar !== undefined) lista.push(id);
	return lista;
}

/** A seção à vista, se a janela está aberta (lista de uma ou nenhuma, como `ferramentas_abertas` antes). */
export function ferramentasAbertas(): string[] {
	return gui !== undefined && gui.Enabled ? [secaoAberta()] : [];
}

/** Desmonta todos os painéis e esquece os registros. Chamado quando o pacote para (recarga ou Studio fechando). */
export function desmontarTodos() {
	for (const [, r] of registros) desmontarRegistro(r);
	registros.clear();
	ordem.clear();
}

/** Os ids das seções, na ordem da navegação. */
export function idsFerramentas(): string[] {
	return [...ordem];
}
export const idsSecoes = idsFerramentas;
