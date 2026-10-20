// Um DockWidgetPluginGui por ferramenta: cria na primeira vez, reaproveita nas seguintes (o botão da barra
// alterna entre mostrar e esconder) e guarda o tamanho em plugin:SetSetting. A posição e o encaixe (dock) o
// próprio Studio guarda pelo id do widget; por isso o id precisa ser estável.

export interface OpcoesWidget {
	/** Id estável, só letras e números: vira o id do DockWidgetPluginGui e a chave da configuração. */
	id: string;
	titulo: string;
	/** Tamanho inicial flutuante, usado só quando ainda não há tamanho guardado. */
	largura?: number;
	altura?: number;
	larguraMinima?: number;
	alturaMinima?: number;
}

interface Aberto {
	gui: DockWidgetPluginGui;
	desmontar: () => void;
}

const abertos = new Map<string, Aberto>();

function chaveTamanho(id: string) {
	return `diorama.widget.${id}.tamanho`;
}

/**
 * Abre o widget da ferramenta. `montar` recebe o widget e devolve a função que desmonta a interface (o retorno
 * de `Vide.mount`). Se o widget já existe, só alterna `Enabled` e devolve o mesmo widget.
 */
export function abrirWidget(
	plugin: Plugin,
	opcoes: OpcoesWidget,
	montar: (gui: DockWidgetPluginGui) => () => void,
): DockWidgetPluginGui {
	const existente = abertos.get(opcoes.id);
	if (existente) {
		existente.gui.Enabled = !existente.gui.Enabled;
		return existente.gui;
	}

	const guardado = plugin.GetSetting(chaveTamanho(opcoes.id)) as { largura?: number; altura?: number } | undefined;
	const largura = guardado?.largura ?? opcoes.largura ?? 360;
	const altura = guardado?.altura ?? opcoes.altura ?? 420;
	const info = new DockWidgetPluginGuiInfo(
		Enum.InitialDockState.Float,
		true,
		false,
		largura,
		altura,
		opcoes.larguraMinima ?? 240,
		opcoes.alturaMinima ?? 160,
	);
	const gui = plugin.CreateDockWidgetPluginGuiAsync(`Diorama_${opcoes.id}`, info);
	gui.Name = `Diorama_${opcoes.id}`;
	// `Title` existe no PluginGui, mas falta nos tipos do @rbxts/types.
	(gui as unknown as { Title: string }).Title = `Diorama: ${opcoes.titulo}`;
	gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling;

	const desmontar = montar(gui);

	// Guarda o tamanho a cada mudança; o Studio chama isso também ao restaurar o widget, o que não faz mal.
	gui.GetPropertyChangedSignal("AbsoluteSize").Connect(() => {
		const tamanho = gui.AbsoluteSize;
		if (tamanho.X > 0 && tamanho.Y > 0) {
			plugin.SetSetting(chaveTamanho(opcoes.id), { largura: tamanho.X, altura: tamanho.Y });
		}
	});

	abertos.set(opcoes.id, { gui, desmontar });
	return gui;
}

/** O widget da ferramenta, se já foi criado nesta sessão. */
export function widget(id: string): DockWidgetPluginGui | undefined {
	return abertos.get(id)?.gui;
}

/**
 * O widget da ferramenta está à vista (criado e com `Enabled`)? Para os laços dos painéis (o Servidor relê o modo
 * e os jogadores de segundo em segundo) pararem de trabalhar enquanto o usuário fechou o widget.
 */
export function widgetVisivel(id: string): boolean {
	const gui = abertos.get(id)?.gui;
	return gui !== undefined && gui.Enabled;
}

/** Desmonta e destrói todos os widgets. Chamado quando o plugin descarrega (recarga ou fechamento do Studio). */
export function fecharTodos() {
	for (const [, aberto] of abertos) {
		const [ok, erro] = pcall(aberto.desmontar);
		if (!ok) warn(`[Diorama] erro ao desmontar ${aberto.gui.Name}: ${tostring(erro)}`);
		aberto.gui.Destroy();
	}
	abertos.clear();
}
