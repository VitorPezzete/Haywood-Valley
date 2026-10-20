// As seções da janela única do Diorama (2026-10-20: "o Diorama tá muito separado, devia ser tudo em um só"). Antes
// eram sete ferramentas, cada uma com um botão e um widget; agora é um botão, uma janela e uma navegação lateral.
// Os ids antigos continuam valendo como apelido (canal do Studio, `simular`, autoteste, MCP).
//
// Sem dependências: canal, simulação, widget e janela importam daqui sem ciclo.

export interface IconeStudio {
	/** Caminho dentro de `content/studio_svg_textures/Shared/<grupo>/<Tema>/<tamanho>/<nome>.png`. */
	grupo: string;
	tamanho: "Standard" | "Medium" | "Large";
	nome: string;
}

export interface DefinicaoSecao {
	/** Id estável: o comando `abrir_ferramenta`/`simular`, o autoteste e o registro das ações usam. */
	id: string;
	/** Nome curto na navegação. */
	nome: string;
	/** Para que serve, em uma frase (vai para a Ajuda e para o `inspecionar`). */
	descricao: string;
	icone: IconeStudio;
	/** Fica embaixo, separada das outras (Configurações). */
	rodape?: boolean;
}

export const SECOES: ReadonlyArray<DefinicaoSecao> = [
	{ id: "mapa", nome: "Mapa", descricao: "Pintar e editar o mapa aberto.", icone: { grupo: "Ribbon", tamanho: "Medium", nome: "RibbonTerrain" } },
	{ id: "pecas", nome: "Peças", descricao: "As peças das folhas: recorte, cores, tipo e o Decorar.", icone: { grupo: "Ribbon", tamanho: "Medium", nome: "RibbonToolbox" } },
	{ id: "arte", nome: "Arte", descricao: "Folhas de tiles, Aseprite e as imagens do jogo.", icone: { grupo: "Ribbon", tamanho: "Medium", nome: "RibbonColor" } },
	{ id: "testar", nome: "Testar", descricao: "Testar o mapa no jogo com um clique.", icone: { grupo: "Ribbon", tamanho: "Standard", nome: "RibbonPlaySmall" } },
	{ id: "verificar", nome: "Verificar", descricao: "Achar o que está errado e ir direto ao lugar.", icone: { grupo: "Alerts", tamanho: "Standard", nome: "Success" } },
	{ id: "ajuda", nome: "Ajuda", descricao: "Guia rápido, atalhos e os documentos do Diorama.", icone: { grupo: "Alerts", tamanho: "Standard", nome: "Question" } },
	{
		id: "configuracoes",
		nome: "Configurações",
		descricao: "Ponte, folhas locais, opções avançadas e padrões.",
		icone: { grupo: "Navigation", tamanho: "Standard", nome: "Settings" },
		rodape: true,
	},
];

/** Os ids de antes da janela única (as sete ferramentas) e outros apelidos, para o canal e o autoteste. */
export const APELIDOS: Readonly<Record<string, string>> = {
	mapas: "mapa",
	catalogo: "pecas",
	assets: "arte",
	servidor: "testar",
	problemas: "verificar",
	suporte: "ajuda",
	conexao: "configuracoes",
	config: "configuracoes",
};

/** O id da seção, aceitando os apelidos (os nomes antigos das ferramentas). */
export function resolverSecao(id: string): string {
	return APELIDOS[id] ?? id;
}

/** O ícone do Studio no tema dado ("Light" ou "Dark"). */
export function caminhoIcone(icone: IconeStudio, tema: string): string {
	const pasta = tema === "Dark" ? "Dark" : "Light";
	return `rbxasset://studio_svg_textures/Shared/${icone.grupo}/${pasta}/${icone.tamanho}/${icone.nome}.png`;
}

/** O ícone do botão da barra (o mesmo que a casca usa). */
export function iconeDoBotao(tema: string): string {
	const pasta = tema === "Dark" ? "Dark" : "Light";
	return `rbxasset://studio_svg_textures/Lua/Terrain/${pasta}/Large/Terrain_Paint.png`;
}

/** O ícone do "Pedir ao Claude". */
export const ICONE_CLAUDE: IconeStudio = { grupo: "Ribbon", tamanho: "Medium", nome: "RibbonAI" };
