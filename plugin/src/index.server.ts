// Casca do plugin Diorama (docs/diorama/CONEXOES.md, seção 1). É o Script raiz do .rbxm (o Rojo transforma a
// pasta out/ no Script "Diorama" porque este arquivo vira out/init.server.luau) e é a única parte que o Studio só
// relê ao reiniciar. Ela cria a barra "Diorama" e guarda botões e widgets por id; o resto do plugin (as
// ferramentas) é um pacote que ela carrega e troca a quente:
//
// - Ao abrir, pede `GET /plugin/versao` à ponte. Com a ponte no ar, baixa `GET /plugin/pacote`, monta a árvore de
//   ModuleScripts numa pasta filha deste script e faz `require` de `app`. Sem a ponte, usa o pacote embutido no
//   .rbxm (os ModuleScripts irmãos deste código, compilados junto).
// - A cada 2 s pergunta o hash de novo. Mudou: monta o novo, `parar()` do velho, limpa os widgets, `iniciar` do
//   novo. Se o novo falha, avisa no Output e volta ao anterior; o mesmo hash não é tentado de novo.
//
// Este arquivo não importa nada do pacote (nem o runtime do roblox-ts para valores): o que ele importasse ficaria
// preso à versão do .rbxm.
import type { Ambiente, OpcoesWidgetCasca } from "./ambiente";

const HttpService = game.GetService("HttpService");
const BASE = "http://127.0.0.1:34873";
/** De quanto em quanto tempo a casca confere se a ponte tem um pacote novo, em segundos. */
const INTERVALO = 2;

interface No {
	nome: string;
	classe: string;
	fonte?: string;
	filhos?: No[];
}

interface Pacote {
	hash: string;
	versao: string;
	arvore: No;
}

interface App {
	iniciar: (ambiente: Ambiente) => () => void;
}

interface Carregado {
	app: App;
	parar?: () => void;
	/** A pasta montada (só no pacote da ponte; o embutido é o próprio script). */
	pasta?: Instance;
	hash?: string;
	versao: string;
	origem: "ponte" | "embutido";
}

const sessao = HttpService.GenerateGUID(false);
const barra = plugin.CreateToolbar("Diorama");
const botoes = new Map<string, PluginToolbarButton>();
const widgets = new Map<string, DockWidgetPluginGui>();

function aviso(texto: string) {
	warn(`[Diorama] ${texto}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Botões e widgets: criados uma vez, guardados por id

function botao(id: string, nome: string, descricao: string, icone: string): PluginToolbarButton {
	const existente = botoes.get(id);
	if (existente) {
		existente.SetActive(false);
		return existente;
	}
	const novo = barra.CreateButton(id, descricao, icone, nome);
	// Deixa clicar mesmo sem a viewport (no editor de scripts); a propriedade falta nos tipos do @rbxts/types.
	pcall(() => {
		(novo as unknown as { ClickableWhenViewportHidden: boolean }).ClickableWhenViewportHidden = true;
	});
	botoes.set(id, novo);
	return novo;
}

function widget(id: string, opcoes: OpcoesWidgetCasca): DockWidgetPluginGui {
	let gui = widgets.get(id);
	if (gui) {
		gui.ClearAllChildren();
	} else {
		const info = new DockWidgetPluginGuiInfo(
			Enum.InitialDockState.Float,
			false,
			false,
			opcoes.largura ?? 360,
			opcoes.altura ?? 420,
			opcoes.larguraMinima ?? 240,
			opcoes.alturaMinima ?? 160,
		);
		const [ok, criado] = pcall(() => plugin.CreateDockWidgetPluginGuiAsync(id, info));
		gui = ok ? (criado as DockWidgetPluginGui) : plugin.CreateDockWidgetPluginGui(id, info);
		gui.Name = id;
		gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling;
		widgets.set(id, gui);
	}
	// `Title` existe no PluginGui, mas falta nos tipos do @rbxts/types.
	(gui as unknown as { Title: string }).Title = `Diorama: ${opcoes.titulo}`;
	return gui;
}

function limparWidgets() {
	for (const [, gui] of widgets) pcall(() => gui.ClearAllChildren());
	for (const [, b] of botoes) pcall(() => b.SetActive(false));
}

// ---------------------------------------------------------------------------------------------------------------
// Ponte

function pedir(rota: string): [true, string] | [false, string] {
	const [ok, resposta] = pcall(() => HttpService.RequestAsync({ Url: BASE + rota, Method: "GET" }));
	if (!ok) return [false, tostring(resposta)];
	const r = resposta as RequestAsyncResponse;
	if (!r.Success) return [false, `${r.StatusCode} ${r.StatusMessage}: ${r.Body.sub(1, 200)}`];
	return [true, r.Body];
}

function pedirJson<T>(rota: string): [true, T] | [false, string] {
	const [ok, corpo] = pedir(rota);
	if (!ok) return [false, corpo];
	const [decodificou, valor] = pcall(() => HttpService.JSONDecode(corpo));
	if (!decodificou) return [false, `resposta que não é JSON: ${tostring(valor)}`];
	return [true, valor as T];
}

// ---------------------------------------------------------------------------------------------------------------
// Montar e carregar

function montarNo(no: No, pai: Instance) {
	let instancia: Instance;
	if (no.classe === "ModuleScript") {
		const m = new Instance("ModuleScript");
		(m as unknown as { Source: string }).Source = no.fonte ?? "";
		instancia = m;
	} else {
		instancia = new Instance("Folder");
	}
	instancia.Name = no.nome;
	for (const filho of no.filhos ?? []) montarNo(filho, instancia);
	instancia.Parent = pai;
	return instancia;
}

function exigirApp(modulo: Instance | undefined): [true, App] | [false, string] {
	if (!modulo || !modulo.IsA("ModuleScript")) return [false, "o pacote não tem o ModuleScript app"];
	const [ok, app] = pcall(() => require(modulo));
	if (!ok) return [false, `require(app) falhou: ${tostring(app)}`];
	if (!typeIs(app, "table") || !typeIs((app as App).iniciar, "function")) return [false, "app não exporta iniciar"];
	return [true, app as App];
}

/** Baixa e monta o pacote da ponte (sem iniciar). */
function carregarDaPonte(pacote: Pacote): [true, Carregado] | [false, string] {
	if (!typeIs(pacote.arvore, "table")) return [false, "pacote sem árvore"];
	const [montou, pasta] = pcall(() => {
		const raiz = montarNo({ nome: `Pacote_${pacote.hash}`, classe: "Folder", filhos: pacote.arvore.filhos }, script);
		return raiz;
	});
	if (!montou) return [false, `não deu para montar o pacote: ${tostring(pasta)}`];
	const instancia = pasta as Instance;
	const [ok, app] = exigirApp(instancia.FindFirstChild("app"));
	if (!ok) {
		instancia.Destroy();
		return [false, app];
	}
	return [true, { app, pasta: instancia, hash: pacote.hash, versao: tostring(pacote.versao), origem: "ponte" }];
}

function carregarEmbutido(): [true, Carregado] | [false, string] {
	const [ok, app] = exigirApp(script.FindFirstChild("app"));
	if (!ok) return [false, app];
	let versao = "?";
	const modulo = script.FindFirstChild("versao");
	if (modulo && modulo.IsA("ModuleScript")) {
		const [lido, v] = pcall(() => require(modulo) as { VERSAO?: string });
		if (lido && typeIs(v, "table") && typeIs(v.VERSAO, "string")) versao = v.VERSAO;
	}
	return [true, { app, versao, origem: "embutido" }];
}

// ---------------------------------------------------------------------------------------------------------------
// Iniciar, parar e trocar

let atual: Carregado | undefined;
/** O hash que falhou por último: não é tentado de novo até a ponte servir outro. */
let falhou: string | undefined;
let vivo = true;

function iniciar(c: Carregado): string | undefined {
	limparWidgets();
	const ambiente: Ambiente = { plugin, botao, widget, versao: c.versao, hash: c.hash, origem: c.origem, sessao };
	const [ok, parar] = pcall(() => c.app.iniciar(ambiente));
	if (!ok) return tostring(parar);
	if (!typeIs(parar, "function")) return "iniciar não devolveu a função parar";
	c.parar = parar as () => void;
	return undefined;
}

function parar(c: Carregado) {
	if (!c.parar) return;
	const [ok, erro] = pcall(c.parar);
	c.parar = undefined;
	if (!ok) aviso(`erro ao parar o pacote ${c.versao}: ${tostring(erro)}`);
}

/** Troca o pacote em execução pelo novo; se o novo não inicia, volta ao anterior. */
function trocar(novo: Carregado): boolean {
	const anterior = atual;
	if (anterior) parar(anterior);
	const erro = iniciar(novo);
	if (erro === undefined) {
		atual = novo;
		if (anterior && anterior.pasta) anterior.pasta.Destroy();
		print(`[Diorama] pacote ${novo.versao}${novo.hash !== undefined ? ` (${novo.hash})` : ""} carregado: ${novo.origem}.`);
		return true;
	}
	aviso(`o pacote ${novo.versao}${novo.hash !== undefined ? ` (${novo.hash})` : ""} não iniciou: ${erro}`);
	parar(novo);
	if (novo.pasta) novo.pasta.Destroy();
	if (anterior) {
		const erroAnterior = iniciar(anterior);
		if (erroAnterior !== undefined) {
			aviso(`e o anterior também não voltou: ${erroAnterior}`);
			atual = undefined;
		} else {
			atual = anterior;
			aviso(`voltou ao pacote anterior (${anterior.versao}, ${anterior.origem}).`);
		}
	}
	return false;
}

/** Confere o hash da ponte e troca se mudou. `primeira`: sem ponte, carrega o embutido. */
function verificar(primeira: boolean) {
	const [ok, versao] = pedirJson<{ hash?: string }>("/plugin/versao");
	const hash = ok && typeIs(versao, "table") && typeIs(versao.hash, "string") ? versao.hash : undefined;
	if (hash !== undefined && hash !== atual?.hash && hash !== falhou) {
		const [baixou, pacote] = pedirJson<Pacote>("/plugin/pacote");
		if (baixou) {
			const [montou, novo] = carregarDaPonte(pacote);
			if (montou && trocar(novo)) {
				falhou = undefined;
				return;
			}
			if (!montou) aviso(`pacote da ponte (${pacote.hash}): ${novo}`);
			falhou = pacote.hash;
		} else if (primeira) {
			aviso(`não deu para baixar o pacote da ponte: ${pacote}`);
		}
	}
	if (primeira && atual === undefined) {
		const [carregou, embutido] = carregarEmbutido();
		if (!carregou) {
			aviso(`o pacote embutido não carregou: ${embutido}`);
			return;
		}
		trocar(embutido);
	}
}

plugin.Unloading.Connect(() => {
	vivo = false;
	if (atual) parar(atual);
});

verificar(true);
task.spawn(() => {
	while (vivo) {
		task.wait(INTERVALO);
		if (!vivo) break;
		const [ok, erro] = pcall(() => verificar(false));
		if (!ok) aviso(`erro ao conferir o pacote: ${tostring(erro)}`);
	}
});
