// A lista de ferramentas da barra "Diorama", na ordem dos botões. Cada ferramenta mora em
// plugin/src/ferramentas/<id>.tsx e exporta `WIDGET` (título e tamanho do widget) e `montar(gui, plugin)`, que
// monta o painel no widget e devolve a função que o desmonta (ver ../widget.ts).
// Para acrescentar uma ferramenta: criar o arquivo com o painel, `WIDGET` e `montar`, e pôr uma entrada aqui.
//
// A lista fica em ferramentas/index.ts (e não em ferramentas.ts ao lado da pasta) porque o Rojo não aceita um
// arquivo e uma pasta com o mesmo nome: viravam dois irmãos chamados "ferramentas" e o require pegava a pasta.
// O roblox-ts compila index.ts para init.luau, e a pasta vira o ModuleScript "ferramentas" com os painéis dentro.
import type { OpcoesWidget } from "../widget";
import * as assets from "./assets";
import * as catalogo from "./catalogo";
import * as conexao from "./conexao";
import * as mapas from "./mapas";
import * as problemas from "./problemas";
import * as servidor from "./servidor";
import * as suporte from "./suporte";

export interface Ferramenta {
	/** Id estável: nome do arquivo, id do botão e do widget. */
	id: string;
	/** Texto do botão na barra. */
	nome: string;
	/** Dica do botão (tooltip). */
	descricao: string;
	/** Imagem do botão (`rbxassetid://...`); vazio mostra só o texto. */
	icone: string;
	widget: OpcoesWidget;
	/** Monta o painel no widget e devolve a função que o desmonta. */
	montar: (gui: DockWidgetPluginGui, plugin: Plugin) => () => void;
}

export const FERRAMENTAS: Ferramenta[] = [
	{ id: "mapas", nome: "Mapas", descricao: mapas.DESCRICAO, icone: "", widget: mapas.WIDGET, montar: mapas.montar },
	{ id: "catalogo", nome: "Catálogo", descricao: catalogo.DESCRICAO, icone: "", widget: catalogo.WIDGET, montar: catalogo.montar },
	{ id: "assets", nome: "Assets", descricao: assets.DESCRICAO, icone: "", widget: assets.WIDGET, montar: assets.montar },
	{
		id: "conexao",
		nome: "Conexão",
		descricao: "Ponte (127.0.0.1:34873), recarga do plugin, canal do Studio, Aseprite, Rojo (34872) e pastas do repositório.",
		icone: "",
		widget: conexao.WIDGET,
		montar: conexao.montar,
	},
	{ id: "servidor", nome: "Servidor", descricao: servidor.DESCRICAO, icone: "", widget: servidor.WIDGET, montar: servidor.montar },
	{ id: "problemas", nome: "Problemas", descricao: problemas.DESCRICAO, icone: "", widget: problemas.WIDGET, montar: problemas.montar },
	{
		id: "suporte",
		nome: "Suporte",
		descricao: "A especificação, o roteiro e os demais documentos de docs/diorama dentro do Studio.",
		icone: "",
		widget: suporte.WIDGET,
		montar: suporte.montar,
	},
];
