// A lista de ferramentas da barra "Diorama", na ordem dos botões. Cada ferramenta mora em
// plugin/src/ferramentas/<id>.tsx e exporta `abrir(plugin)`, que cria ou alterna o widget dela (ver ../widget.ts).
// Para acrescentar uma ferramenta: criar o arquivo com o painel e `abrir`, e pôr uma entrada em FERRAMENTAS.
//
// A lista fica em ferramentas/index.ts (e não em ferramentas.ts ao lado da pasta) porque o Rojo não aceita um
// arquivo e uma pasta com o mesmo nome: viravam dois irmãos chamados "ferramentas" e o require pegava a pasta.
// O roblox-ts compila index.ts para init.luau, e a pasta vira o ModuleScript "ferramentas" com os painéis dentro.
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
	/** Abre (ou alterna) o widget da ferramenta e o devolve. */
	abrir: (plugin: Plugin) => DockWidgetPluginGui;
}

export const FERRAMENTAS: Ferramenta[] = [
	{ id: "mapas", nome: "Mapas", descricao: mapas.DESCRICAO, icone: "", abrir: mapas.abrir },
	{ id: "catalogo", nome: "Catálogo", descricao: catalogo.DESCRICAO, icone: "", abrir: catalogo.abrir },
	{ id: "assets", nome: "Assets", descricao: assets.DESCRICAO, icone: "", abrir: assets.abrir },
	{
		id: "conexao",
		nome: "Conexão",
		descricao: "Estado da ponte (127.0.0.1:34873), do Rojo (34872) e das pastas do repositório.",
		icone: "",
		abrir: conexao.abrir,
	},
	{ id: "servidor", nome: "Servidor", descricao: servidor.DESCRICAO, icone: "", abrir: servidor.abrir },
	{ id: "problemas", nome: "Problemas", descricao: problemas.DESCRICAO, icone: "", abrir: problemas.abrir },
	{
		id: "suporte",
		nome: "Suporte",
		descricao: "A especificação, o roteiro e os demais documentos de docs/diorama dentro do Studio.",
		icone: "",
		abrir: suporte.abrir,
	},
];
