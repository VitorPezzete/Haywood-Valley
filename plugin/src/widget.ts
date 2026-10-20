// Os widgets das ferramentas. A casca cria cada DockWidgetPluginGui uma vez (pelo id) e o entrega de novo, vazio,
// a cada pacote; aqui o pacote liga o botão da barra ao widget e monta o painel da ferramenta na primeira vez que o
// widget fica à vista (montar o editor de Mapas é caro; não vale fazer para um widget fechado).
//
// O botão alterna o widget; fechar pelo X também desmarca o botão. A posição, o encaixe e o tamanho o próprio Studio
// guarda pelo id do widget (`Diorama_<id>`), que por isso é estável.
import { aoParar, ambiente } from "./ambiente";
import type { Ferramenta } from "./ferramentas";

export interface OpcoesWidget {
	titulo: string;
	largura?: number;
	altura?: number;
	larguraMinima?: number;
	alturaMinima?: number;
}

interface Registro {
	ferramenta: Ferramenta;
	gui: DockWidgetPluginGui;
	botao: PluginToolbarButton;
	desmontar?: () => void;
	/** O erro da última montagem, se falhou. */
	erro?: string;
}

const registros = new Map<string, Registro>();
/** Os ids na ordem da barra. */
const ordem = new Array<string>();

/** Desmonta o painel (o Vide só encerra os efeitos; as instâncias saem com ClearAllChildren). */
function desmontarRegistro(r: Registro) {
	if (r.desmontar) {
		const [ok, erro] = pcall(r.desmontar);
		if (!ok) warn(`[Diorama] erro ao desmontar ${r.ferramenta.nome}: ${tostring(erro)}`);
		r.desmontar = undefined;
	}
	pcall(() => r.gui.ClearAllChildren());
}

/**
 * Monta o painel da ferramenta, se ainda não está montado. Devolve o erro, se a montagem falhou (o widget fica
 * com uma mensagem no lugar do painel).
 */
export function garantirMontada(id: string): string | undefined {
	const r = registros.get(id);
	if (!r) return `ferramenta desconhecida: ${id}`;
	if (r.desmontar) return undefined;
	const [ok, resultado] = pcall(() => r.ferramenta.montar(r.gui, ambiente().plugin));
	if (!ok || !typeIs(resultado, "function")) {
		r.erro = ok ? "montar não devolveu a função de desmontar" : tostring(resultado);
		warn(`[Diorama] a ferramenta ${r.ferramenta.nome} não montou: ${r.erro}`);
		pcall(() => r.gui.ClearAllChildren());
		const aviso = new Instance("TextLabel");
		aviso.Size = UDim2.fromScale(1, 1);
		aviso.TextWrapped = true;
		aviso.TextXAlignment = Enum.TextXAlignment.Left;
		aviso.TextYAlignment = Enum.TextYAlignment.Top;
		aviso.Text = `A ferramenta ${r.ferramenta.nome} não montou:\n${r.erro}`;
		aviso.Parent = r.gui;
		return r.erro;
	}
	r.erro = undefined;
	r.desmontar = resultado as () => void;
	return undefined;
}

/** Liga botões e widgets às ferramentas. Chamado por `app.iniciar`. */
export function prepararFerramentas(lista: ReadonlyArray<Ferramenta>) {
	const a = ambiente();
	for (const ferramenta of lista) {
		const gui = a.widget(`Diorama_${ferramenta.id}`, ferramenta.widget);
		const botao = a.botao(`diorama_${ferramenta.id}`, ferramenta.nome, ferramenta.descricao, ferramenta.icone);
		const r: Registro = { ferramenta, gui, botao };
		registros.set(ferramenta.id, r);
		ordem.push(ferramenta.id);
		aoParar(botao.Click.Connect(() => alternar(ferramenta.id)));
		aoParar(
			gui.GetPropertyChangedSignal("Enabled").Connect(() => {
				botao.SetActive(gui.Enabled);
				if (gui.Enabled) garantirMontada(ferramenta.id);
			}),
		);
		botao.SetActive(gui.Enabled);
		// O Studio restaura o widget aberto da sessão anterior; e numa recarga o widget aberto continua aberto.
		if (gui.Enabled) garantirMontada(ferramenta.id);
	}
}

/** Mostra o widget da ferramenta (e monta o painel). Devolve o erro da montagem, se houve. */
export function mostrar(id: string): string | undefined {
	const r = registros.get(id);
	if (!r) return `ferramenta desconhecida: ${id}`;
	r.gui.Enabled = true;
	return garantirMontada(id);
}

/** Abre o widget fechado ou fecha o aberto. */
export function alternar(id: string) {
	const r = registros.get(id);
	if (!r) return;
	if (r.gui.Enabled) r.gui.Enabled = false;
	else mostrar(id);
}

/** O widget da ferramenta. */
export function widget(id: string): DockWidgetPluginGui | undefined {
	return registros.get(id)?.gui;
}

/** O painel está montado? */
export function montada(id: string): boolean {
	return registros.get(id)?.desmontar !== undefined;
}

/** O erro da última montagem da ferramenta, se falhou. */
export function erroDeMontagem(id: string): string | undefined {
	return registros.get(id)?.erro;
}

/** Desmonta o painel da ferramenta (o widget continua; abrir de novo monta outra vez). */
export function desmontar(id: string) {
	const r = registros.get(id);
	if (r) desmontarRegistro(r);
}

/**
 * O widget da ferramenta está à vista (criado e com `Enabled`)? Para os laços dos painéis (o Servidor relê o modo
 * e os jogadores de segundo em segundo) pararem de trabalhar enquanto o usuário fechou o widget.
 */
export function widgetVisivel(id: string): boolean {
	const gui = registros.get(id)?.gui;
	return gui !== undefined && gui.Enabled;
}

/** Ids das ferramentas com o widget à vista. */
export function ferramentasAbertas(): string[] {
	const lista = new Array<string>();
	for (const [id, r] of registros) if (r.gui.Enabled) lista.push(id);
	return lista;
}

/** Desmonta todos os painéis e esquece os registros. Chamado quando o pacote para (recarga ou Studio fechando). */
export function desmontarTodos() {
	for (const [, r] of registros) desmontarRegistro(r);
	registros.clear();
	ordem.clear();
}

/** Os ids das ferramentas, na ordem da barra. */
export function idsFerramentas(): string[] {
	return [...ordem];
}
