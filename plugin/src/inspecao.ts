// O comando `inspecionar` do canal (CONEXOES.md, seção 2): o que o plugin tem vivo agora, para achar vazamento e
// lentidão sem clicar. Os widgets ficam em PluginGuiService (o `execute_luau` do MCP do Studio também os vê), mas
// as estruturas internas do pacote (o que espera o `parar`, as folhas locais, os ouvintes do Output, as pastas de
// pacotes velhos na casca) só se veem daqui.
import { Stats } from "@rbxts/services";
import { pendentesAoParar } from "./ambiente";
import { folhasCarregadas } from "./folhasLocais";
import { controleMapas } from "./mapas/controle";
import { mensagens, quantosOuvintes } from "./servidor/output";
import { resolverSecao } from "./secoes";
import { ferramentasAbertas, idsFerramentas, janela, montada, quadro, secaoAberta } from "./widget";

export interface NoResumo {
	nome: string;
	classe: string;
	/** Descendentes (sem contar a própria instância). */
	n: number;
	filhos?: NoResumo[];
}

/** A árvore resumida: cada nó com o número de descendentes, até `profundidade` níveis e `largura` filhos por nó. */
export function resumirArvore(instancia: Instance, profundidade: number, largura = 12): NoResumo {
	const no: NoResumo = { nome: instancia.Name, classe: instancia.ClassName, n: instancia.GetDescendants().size() };
	if (profundidade > 0) {
		const filhos = instancia.GetChildren();
		// Os maiores primeiro: é onde as instâncias estão.
		const lista = filhos.map((f) => ({ f, n: f.GetDescendants().size() }));
		lista.sort((a, b) => a.n > b.n);
		no.filhos = lista.filter((_, i) => i < largura).map((x) => resumirArvore(x.f, profundidade - 1, largura));
		if (filhos.size() > largura) no.filhos.push({ nome: `(+${filhos.size() - largura} outros)`, classe: "", n: 0 });
	}
	return no;
}

/** As pastas `Pacote_<hash>` montadas na casca: deve haver só uma (a do pacote em uso), ou nenhuma no embutido. */
function pacotesNaCasca(): string[] {
	let atual: Instance | undefined = script;
	while (atual && !atual.IsA("Script")) atual = atual.Parent;
	if (!atual) return [];
	return atual
		.GetChildren()
		.filter((c) => c.Name.sub(1, 7) === "Pacote_")
		.map((c) => c.Name);
}

/**
 * `ferramenta`: a árvore de uma seção ("mapa", "pecas"…, ou o nome antigo) ou, com "janela", da janela inteira (a
 * moldura, a navegação e as seções).
 */
export function inspecionar(ferramenta?: string, profundidade = 3) {
	const gui = janela();
	const secoes: Record<string, { visivel: boolean; montada: boolean; instancias: number }> = {};
	for (const id of idsFerramentas()) {
		const q = quadro(id);
		secoes[id] = { visivel: gui !== undefined && gui.Enabled && secaoAberta() === id, montada: montada(id), instancias: q ? q.GetDescendants().size() : 0 };
	}
	const [, memoriaTotal] = pcall(() => Stats.GetTotalMemoryUsageMb());
	const [, memoriaGui] = pcall(() => Stats.GetMemoryUsageMbForTag(Enum.DeveloperMemoryTag.Gui));
	const resultado: Record<string, unknown> = {
		janela: gui
			? {
					nome: gui.Name,
					aberta: gui.Enabled,
					titulo: (gui as unknown as { Title: string }).Title,
					instancias: gui.GetDescendants().size(),
					filhos: gui.GetChildren().map((c) => c.Name),
				}
			: undefined,
		secao_aberta: secaoAberta(),
		secoes,
		abertas: ferramentasAbertas(),
		pacotes_na_casca: pacotesNaCasca(),
		ao_parar: pendentesAoParar(),
		ouvintes_output: quantosOuvintes(),
		mensagens_output: mensagens().size(),
		folhas_locais_carregadas: folhasCarregadas(),
		memoria_lua_kb: math.floor(collectgarbage("count")),
		memoria_studio_mb: typeIs(memoriaTotal, "number") ? math.floor(memoriaTotal) : undefined,
		memoria_gui_mb: typeIs(memoriaGui, "number") ? math.floor(memoriaGui * 10) / 10 : undefined,
		mapa: controleMapas()?.resumo(),
	};
	if (ferramenta !== undefined) {
		const alvo = ferramenta === "janela" ? gui : quadro(resolverSecao(ferramenta));
		if (!alvo) error(`seção desconhecida: ${ferramenta}`, 0);
		resultado.arvore = resumirArvore(alvo, profundidade);
	}
	return resultado;
}
