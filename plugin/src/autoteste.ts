// O autoteste do plugin (comando `autoteste` do canal, docs/diorama/CONEXOES.md seção 2). Para cada ferramenta:
// abre o widget (monta o painel, se ainda não estava), espera um quadro, conta as instâncias, espera as leituras
// da ponte, guarda os erros que o Output recebeu nesse tempo e roda as conferências próprias da ferramenta. No fim
// devolve o widget ao estado em que estava (aberto ou fechado; o painel fica montado).
//
// As conferências usam a ponte de verdade. A de Mapas grava e apaga os mapas temporários `zz_autoteste` e
// `zz_autoteste_edicao`; esta, a da edição (autotesteEdicao.ts), mexe no painel como o autor mexeria.
import { canonico } from "./canonico";
import { acoesDe } from "./simulacao";
import { conferenciasEdicaoCatalogo, conferenciasEdicaoMapas, conferenciasEdicaoServidor } from "./autotesteEdicao";
import { conferenciasRecorte } from "./autotesteRecorte";
import { controleMapas, ResumoMapaAberto } from "./mapas/controle";
import { ModeloBloco } from "./mapas/bloco";
import { lerFundo, lerPeca, lerCatalogo as lerCatalogoFormato } from "./catalogo/formato";
import { problemasDoCatalogo } from "./catalogo/problemas";
import { lerRegistro } from "./assets/registro";
import { carregarFolha, folhasLocais, lerPixel, liberarFolhasLocais } from "./folhasLocais";
import * as ponte from "./ponte";
import { diagnosticar } from "./problemas/diagnostico";
import { ATRIBUTOS, lerAtributo } from "./servidor/atributos";
import { Mensagem, nivelDe, ouvirOutput } from "./servidor/output";
import { verificarPlace } from "./servidor/place";
import { AssetService, HttpService, RunService } from "@rbxts/services";
import { desmontar, erroDeMontagem, idsFerramentas, montada, mostrar, widget } from "./widget";

export interface Conferencia {
	nome: string;
	ok: boolean;
	detalhe: string;
}

export interface RelatorioFerramenta {
	id: string;
	ok: boolean;
	montou: boolean;
	/** O painel já estava montado antes do teste (então a montagem não foi testada agora). */
	ja_montada: boolean;
	erro_montagem?: string;
	/** Descendentes do widget um quadro depois de montar, e depois da espera. */
	instancias_primeiro_quadro: number;
	instancias: number;
	/** Erros (e avisos) que o Output recebeu enquanto a ferramenta era testada. */
	erros: string[];
	avisos: string[];
	conferencias: Conferencia[];
	/** UIFlexItem visíveis no widget: [com tamanho, total] (DUVIDAS.md, item 21). */
	flex: [number, number];
	/** Altura (px) de cada elemento com UIFlexItem visível, e a do widget. */
	flex_alturas: string;
	segundos: number;
}

export interface OpcoesAutoteste {
	ferramentas?: string[];
	/** Segundos de espera depois de montar, para as leituras da ponte terminarem (padrão 2). */
	espera?: number;
	/** Desmonta e monta de novo os painéis que já estavam montados. */
	remontar?: boolean;
	/** Roda também a edição simulada (autotesteEdicao.ts); padrão: sim. */
	edicao?: boolean;
}

const MAPAS_DE_TESTE = ["teste_d_destino", "casa_teste_v2_l"];
const MAPA_TEMPORARIO = "zz_autoteste";

function conferir(lista: Conferencia[], nome: string, ok: boolean, detalhe: string) {
	lista.push({ nome, ok, detalhe });
}

/** Conta as células desenhadas no canvas do editor, por camada (os itens visíveis dos chunks; uma faixa de vazio vale as células que cobre). */
function desenhadasNoCanvas(gui: Instance): Record<string, number> | undefined {
	const mundo = gui.FindFirstChild("Mundo", true);
	if (!mundo) return undefined;
	const saida: Record<string, number> = {};
	for (const nome of ["Chao", "Objeto", "Frente", "Terreno"]) {
		let n = 0;
		const camada = mundo.FindFirstChild(nome);
		if (camada) {
			for (const chunk of camada.GetChildren()) {
				for (const item of chunk.GetChildren()) {
					if (!item.IsA("GuiObject") || !item.Visible) continue;
					const celulas = item.GetAttribute("Celulas");
					n += typeIs(celulas, "number") ? celulas : 1;
				}
			}
		}
		saida[nome] = n;
	}
	return saida;
}

/** A origem da imagem de um tile do chão desenhado: "objeto" (EditableImage), "uri" (id do Roblox) ou outra. */
function origemDaImagem(gui: Instance): string | undefined {
	const chao = gui.FindFirstChild("Mundo", true)?.FindFirstChild("Chao");
	if (!chao) return undefined;
	for (const chunk of chao.GetChildren()) {
		for (const item of chunk.GetChildren()) {
			if (!item.IsA("ImageLabel") || !item.Visible) continue;
			const [ok, tipo] = pcall(() => (item.ImageContent as unknown as { SourceType: EnumItem }).SourceType);
			if (!ok) return `erro: ${tostring(tipo)}`;
			return (tipo as EnumItem).Name === "Object" ? "objeto" : (tipo as EnumItem).Name === "Uri" ? "uri" : (tipo as EnumItem).Name;
		}
	}
	return undefined;
}

function compararCanvas(lista: Conferencia[], gui: Instance, resumo: ResumoMapaAberto) {
	const origem = origemDaImagem(gui);
	if (origem !== undefined) {
		const esperada = folhasLocais() ? "objeto" : "uri";
		conferir(lista, `${resumo.id}: imagem dos tiles`, origem === esperada, `${origem === "objeto" ? "EditableImage (folhas locais)" : origem === "uri" ? "id do Roblox" : origem}; esperado ${esperada === "objeto" ? "EditableImage" : "id do Roblox"}`);
	}
	const d = desenhadasNoCanvas(gui);
	if (!d) {
		conferir(lista, `${resumo.id}: canvas`, false, "não achei o frame Mundo do canvas");
		return;
	}
	const esperado: Record<string, number> = {
		Chao: resumo.celulas.chao,
		Objeto: resumo.celulas.objeto,
		Frente: resumo.celulas.frente,
		Terreno: resumo.celulas.terreno,
	};
	const diferencas = new Array<string>();
	for (const [nome, n] of pairs(esperado)) if (d[nome] !== n) diferencas.push(`${nome} ${d[nome]} desenhadas / ${n} no bloco`);
	conferir(
		lista,
		`${resumo.id}: células desenhadas`,
		diferencas.size() === 0,
		diferencas.size() === 0
			? `chão ${d.Chao}, objeto ${d.Objeto}, frente ${d.Frente}, terreno ${d.Terreno}`
			: diferencas.join("; "),
	);
}

function conferirFolhasLocais(lista: Conferencia[]) {
	const estava = folhasLocais();
	const r = carregarFolha("casa");
	if (!r.ok) {
		conferir(lista, "folhas locais (EditableImage)", false, `não montou: ${r.erro}. Mapas e Catálogo caem no id do Roblox.`);
		return;
	}
	// Um pixel lido de volta da EditableImage tem de bater com o do disco (o tile de chão em [0, 2] da casa).
	const x = 1024 + 8;
	const y = 2 * 16 + 8;
	const lido = lerPixel("casa", x, y);
	const disco = ponte.lerFolha("casa", x, y, 1, 1);
	let detalhe = `${r.pixels} pixels escritos nas duas metades da casa`;
	let ok = true;
	if (lido && disco.ok) {
		const b = disco.valor.pixels;
		const esperado = [buffer.readu8(b, 0), buffer.readu8(b, 1), buffer.readu8(b, 2), buffer.readu8(b, 3)];
		ok = lido[0] === esperado[0] && lido[1] === esperado[1] && lido[2] === esperado[2] && lido[3] === esperado[3];
		detalhe += `; pixel (${x}, ${y}) lido ${lido.join(",")}, no disco ${esperado.join(",")}`;
	} else {
		ok = false;
		detalhe += "; não deu para ler o pixel de volta";
	}
	conferir(lista, "folhas locais (EditableImage)", ok, detalhe);
	// Desligado, as imagens não são usadas: libera a memória.
	if (!estava) liberarFolhasLocais();
}

function conferenciasMapas(gui: DockWidgetPluginGui, lista: Conferencia[], edicao: boolean) {
	const limite = os.clock() + 5;
	let c = controleMapas();
	while (!c && os.clock() < limite) {
		task.wait(0.1);
		c = controleMapas();
	}
	if (!c) {
		conferir(lista, "controle do editor", false, "o painel Mapas não registrou o controle");
		return;
	}
	if (c.sujo()) {
		conferir(lista, "mapas de teste", true, `pulado: o editor tem mudanças não salvas em "${c.modelo().mapa}"`);
		conferirFolhasLocais(lista);
		return;
	}
	for (const id of MAPAS_DE_TESTE) {
		const r = c.abrir(id);
		if (!r.ok) {
			conferir(lista, `${id}: abrir`, false, r.erro);
			continue;
		}
		task.wait();
		conferir(lista, `${id}: abrir`, true, `carimbo ${r.resumo.carimbo ?? "—"}, ${r.resumo.marcadores.saidas} saída(s), ${r.resumo.marcadores.zonas} zona(s)`);
		compararCanvas(lista, gui, r.resumo);
	}

	// Ida e volta: o bloco aberto, salvo pela ponte com outro id, reaberto no editor, tem de dar o mesmo JSON.
	const original = c.modelo().paraJson();
	const origemId = original.mapa;
	original.mapa = MAPA_TEMPORARIO;
	const gravou = ponte.gravarBloco(MAPA_TEMPORARIO, 0, 0, original);
	if (!gravou.ok) {
		conferir(lista, "salvar e reabrir", false, `PUT ${MAPA_TEMPORARIO}: ${gravou.erro}`);
	} else {
		const reaberto = c.abrir(MAPA_TEMPORARIO, true);
		if (!reaberto.ok) conferir(lista, "salvar e reabrir", false, `reabrir ${MAPA_TEMPORARIO}: ${reaberto.erro}`);
		else {
			const lido = c.modelo().paraJson();
			const igual = canonico(lido) === canonico(original);
			const daPonte = ponte.lerMapa(MAPA_TEMPORARIO);
			const doDisco = daPonte.ok && daPonte.valor.blocos[0] ? ModeloBloco.deJson(daPonte.valor.blocos[0].conteudo).paraJson() : undefined;
			const igualDisco = doDisco !== undefined && canonico(doDisco) === canonico(original);
			conferir(
				lista,
				"salvar e reabrir",
				igual && igualDisco,
				igual && igualDisco
					? `${origemId} salvo como ${MAPA_TEMPORARIO} e reaberto sem diferença`
					: `diferente depois de reabrir (editor ${igual ? "igual" : "diferente"}, disco ${igualDisco ? "igual" : "diferente"})`,
			);
		}
		const apagou = ponte.apagarMapa(MAPA_TEMPORARIO);
		conferir(lista, "apagar o temporário", apagou.ok, apagou.ok ? `${MAPA_TEMPORARIO} apagado` : apagou.erro);
		// O editor não fica num mapa que não existe mais.
		if (origemId !== "") c.abrir(origemId, true);
	}
	if (edicao) {
		const [ok, erro] = pcall(() => conferenciasEdicaoMapas(lista));
		if (!ok) conferir(lista, "edição", false, `erro: ${tostring(erro)}`);
	}
	conferirFolhasLocais(lista);
}

function conferenciasCatalogo(gui: DockWidgetPluginGui, lista: Conferencia[], edicao: boolean) {
	const rp = ponte.lerCatalogo("pecas");
	const rf = ponte.lerCatalogo("fundos");
	if (!rp.ok) conferir(lista, "pecas.json", false, rp.erro);
	if (!rf.ok) conferir(lista, "fundos.json", false, rf.erro);
	if (!rp.ok || !rf.ok) return;
	const pecas = lerCatalogoFormato(rp.valor, "pecas", lerPeca);
	const fundos = lerCatalogoFormato(rf.valor, "fundos", lerFundo);
	conferir(lista, "pecas.json", pecas.itens.size() > 0, `${pecas.itens.size()} peça(s), ${pecas.descartadas} descartada(s)`);
	conferir(lista, "fundos.json", true, `${fundos.itens.size()} fundo(s), ${fundos.descartadas} descartado(s)`);
	const problemas = problemasDoCatalogo(pecas.itens, fundos.itens);
	conferir(lista, "problemas do catálogo", true, `${problemas.size()} problema(s) nos dados`);
	const metade = gui.FindFirstChild("Metade0", true);
	conferir(lista, "folha à vista", metade !== undefined && metade.IsA("ImageLabel"), metade ? "Metade0 desenhada" : "não achei a folha no painel");
	// A seção Recorte (etapa G): só lê, então roda mesmo sem a edição.
	conferenciasRecorte(lista, pecas.itens);
	if (edicao) conferenciasEdicaoCatalogo(lista);
}

function conferenciasAssets(lista: Conferencia[]) {
	const r = ponte.lerAssets();
	if (!r.ok) return conferir(lista, "registro", false, r.erro);
	const reg = lerRegistro(r.valor.registro);
	let semId = 0;
	for (const e of reg.entradas) if (!e.antigo && e.id === undefined) semId++;
	conferir(lista, "registro", reg.entradas.size() > 0, `${reg.entradas.size()} entrada(s), ${semId} sem id (fora os antigos)`);
}

function conferenciasProblemas(lista: Conferencia[]) {
	const d = diagnosticar();
	const conta: Record<string, number> = { erro: 0, aviso: 0, info: 0 };
	for (const p of d.problemas) conta[p.gravidade] = (conta[p.gravidade] ?? 0) + 1;
	conferir(
		lista,
		"diagnóstico",
		!d.ponteFora,
		d.ponteFora
			? `ponte fora: ${d.erroPonte ?? "?"}`
			: `${d.mapas} mapa(s), ${d.blocos} bloco(s); ${conta.erro} erro(s), ${conta.aviso} aviso(s), ${conta.info} info`,
	);
}

function conferenciasServidor(lista: Conferencia[], edicao: boolean) {
	const valores = new Array<string>();
	for (const def of ATRIBUTOS) {
		const v = lerAtributo(def.nome);
		if (v !== undefined) valores.push(`${def.nome}=${tostring(v)}`);
	}
	conferir(lista, "atributos", true, valores.size() > 0 ? valores.join(", ") : "nenhum atributo de teste no Workspace");
	const place = verificarPlace();
	const conta: Record<string, number> = {};
	for (const v of place) conta[v.nivel] = (conta[v.nivel] ?? 0) + 1;
	conferir(lista, "place", true, `${game.Name}: ${conta.ok ?? 0} ok, ${conta.info ?? 0} info, ${conta.aviso ?? 0} aviso(s), ${conta.erro ?? 0} erro(s)`);
	if (edicao) conferenciasEdicaoServidor(lista);
}

function conferenciasSuporte(gui: DockWidgetPluginGui, lista: Conferencia[]) {
	const r = ponte.listarDocs();
	if (!r.ok) return conferir(lista, "documentos", false, r.erro);
	conferir(lista, "documentos", r.valor.includes("CONEXOES"), `${r.valor.size()} documento(s): ${r.valor.join(", ")}`);
	// Um documento comprido aparece inteiro e rola (antes a caixa ficava presa à primeira tela).
	const acoes = acoesDe("suporte");
	if (!acoes || !r.valor.includes("ESPECIFICACAO")) return;
	const aberto = acoes.abrir({ nome: "ESPECIFICACAO" }) as { caracteres: number };
	task.wait(0.2);
	const texto = gui.FindFirstChild("AreaTexto", true)?.FindFirstChild("Texto");
	const area = gui.FindFirstChild("AreaTexto", true);
	if (!texto || !texto.IsA("TextBox") || !area || !area.IsA("ScrollingFrame")) return conferir(lista, "texto longo", false, "não achei a área de texto");
	conferir(
		lista,
		"texto longo",
		texto.TextFits && area.AbsoluteCanvasSize.Y >= texto.TextBounds.Y,
		`ESPECIFICACAO: ${aberto.caracteres} caracteres, ${math.floor(texto.TextBounds.Y)} px de texto, área rolável de ${area.AbsoluteCanvasSize.Y} px`,
	);
}

function conferenciasConexao(lista: Conferencia[]) {
	const r = ponte.status();
	if (!r.ok) return conferir(lista, "ponte", false, r.erro);
	conferir(lista, "ponte", true, `versão ${r.valor.versao}, ${r.valor.mapas} mapa(s), Rojo ${r.valor.rojo.ligado ? "ligado" : "desligado"}`);
}

declare const setclipboard: ((texto: string) => void) | undefined;

/** Existe o membro na instância? (indexar um membro que não existe dá erro no Luau). */
function temMembro(instancia: Instance, nome: string): boolean {
	const [ok, valor] = pcall(() => (instancia as unknown as Record<string, unknown>)[nome]);
	return ok && valor !== undefined;
}

/**
 * O que só o Studio responde (docs/diorama/DUVIDAS.md, itens 20 a 27): as APIs que o plugin usa existem nesta
 * versão, o UIFlexItem estica, a EditableImage entra num ImageLabel, o JSONEncode de tabela vazia.
 */
function conferenciasStudio(relatorios: RelatorioFerramenta[]): Conferencia[] {
	const lista = new Array<Conferencia>();
	// 20: o widget tem GetRelativeMousePosition (a saída se a célula sob o mouse vier deslocada).
	const gui = widget("mapas");
	conferir(lista, "20 GetRelativeMousePosition", gui !== undefined && temMembro(gui, "GetRelativeMousePosition"), "existe no DockWidgetPluginGui (as coordenadas do mouse só se conferem com o mouse de verdade)");
	// 21: os UIFlexItem dos painéis montados esticaram (o pai tem tamanho).
	let flex = 0;
	let esticados = 0;
	for (const r of relatorios) {
		flex += r.flex[1];
		esticados += r.flex[0];
	}
	conferir(lista, "21 UIFlexItem", flex === 0 || esticados === flex, `${esticados} de ${flex} elementos com UIFlexItem visíveis têm tamanho`);
	// 23: AssetService.CreateAssetAsync existe.
	conferir(lista, "23 CreateAssetAsync", temMembro(AssetService, "CreateAssetAsync"), temMembro(AssetService, "CreateAssetAsync") ? "existe (o envio em si não foi testado)" : "não existe nesta versão");
	// 24: EditableImage num ImageLabel por Content.fromObject.
	const [criou, imagem] = pcall(() => AssetService.CreateEditableImage({ Size: new Vector2(2, 2) }));
	if (criou && imagem !== undefined) {
		const label = new Instance("ImageLabel");
		const [ok, erro] = pcall(() => {
			label.ImageContent = Content.fromObject(imagem as EditableImage);
		});
		label.Destroy();
		(imagem as EditableImage).Destroy();
		conferir(lista, "24 EditableImage + Content.fromObject", ok, ok ? "ImageContent aceitou a EditableImage" : tostring(erro));
	} else conferir(lista, "24 EditableImage + Content.fromObject", false, `CreateEditableImage: ${tostring(imagem)}`);
	// 25: setclipboard.
	const [, temClipboard] = pcall(() => setclipboard !== undefined);
	conferir(lista, "25 setclipboard", true, temClipboard === true ? "existe" : "não existe (o plugin mostra o texto para Ctrl+C, como previsto)");
	// 26: RunService.Stop existe para o plugin (chamar só faz sentido no Play).
	conferir(lista, "26 RunService.Stop", temMembro(RunService, "Stop"), temMembro(RunService, "Stop") ? "existe (não chamado: o Studio está na edição)" : "não existe");
	// 27: JSONEncode de tabela vazia.
	const json = HttpService.JSONEncode({ props: {}, lista: [] });
	conferir(lista, "27 JSONEncode de tabela vazia", true, `{ props: {}, lista: [] } vira ${json}`);
	return lista;
}

/** O elemento e todos os pais até o widget estão visíveis (uma aba escondida não conta). */
function visivelDeVerdade(g: GuiObject, raiz: Instance): boolean {
	let atual: Instance | undefined = g;
	while (atual && atual !== raiz) {
		if (atual.IsA("GuiObject") && !atual.Visible) return false;
		atual = atual.Parent;
	}
	return true;
}

function testarFerramenta(id: string, opcoes: OpcoesAutoteste): RelatorioFerramenta {
	const inicio = os.clock();
	const capturadas = new Array<Mensagem>();
	const pararDeOuvir = ouvirOutput((m) => capturadas.push(m));
	const gui = widget(id)!;
	const estavaVisivel = gui.Enabled;
	const jaMontada = montada(id);
	if (jaMontada && opcoes.remontar) desmontar(id);

	const erroMontagem = mostrar(id);
	task.wait();
	const primeiroQuadro = gui.GetDescendants().size();
	task.wait(opcoes.espera ?? 2);

	const conferencias = new Array<Conferencia>();
	if (erroMontagem === undefined) {
		const [ok, erro] = pcall(() => {
			const edicao = opcoes.edicao !== false;
			if (id === "mapas") conferenciasMapas(gui, conferencias, edicao);
			else if (id === "catalogo") conferenciasCatalogo(gui, conferencias, edicao);
			else if (id === "assets") conferenciasAssets(conferencias);
			else if (id === "problemas") conferenciasProblemas(conferencias);
			else if (id === "servidor") conferenciasServidor(conferencias, edicao);
			else if (id === "suporte") conferenciasSuporte(gui, conferencias);
			else if (id === "conexao") conferenciasConexao(conferencias);
		});
		if (!ok) conferir(conferencias, "conferências", false, `erro: ${tostring(erro)}`);
	}
	task.wait();
	pararDeOuvir();
	const instancias = gui.GetDescendants().size();
	const flex: [number, number] = [0, 0];
	const alturas = new Array<string>();
	for (const d of gui.GetDescendants()) {
		if (!d.IsA("UIFlexItem")) continue;
		const pai = d.Parent;
		if (!pai || !pai.IsA("GuiObject") || !visivelDeVerdade(pai, gui)) continue;
		flex[1]++;
		if (pai.AbsoluteSize.X > 0 && pai.AbsoluteSize.Y > 0) flex[0]++;
		alturas.push(`${pai.Name} ${math.floor(pai.AbsoluteSize.Y)}`);
	}
	if (!estavaVisivel) gui.Enabled = false;

	const erros = capturadas.filter((m) => nivelDe(m.tipo) === "erro").map((m) => m.texto);
	const avisos = capturadas.filter((m) => nivelDe(m.tipo) === "aviso").map((m) => m.texto);
	const montou = erroMontagem === undefined && montada(id);
	return {
		id,
		ok: montou && erros.size() === 0 && conferencias.every((c) => c.ok),
		montou,
		ja_montada: jaMontada && !opcoes.remontar,
		erro_montagem: erroMontagem ?? erroDeMontagem(id),
		instancias_primeiro_quadro: primeiroQuadro,
		instancias,
		erros,
		avisos,
		conferencias,
		flex,
		flex_alturas: `${alturas.join(", ")} (widget ${math.floor(gui.AbsoluteSize.Y)})`,
		segundos: math.floor((os.clock() - inicio) * 10) / 10,
	};
}

export function autoteste(opcoes: OpcoesAutoteste) {
	const todas = idsFerramentas();
	const ids = opcoes.ferramentas ?? todas;
	const relatorios = new Array<RelatorioFerramenta>();
	for (const id of ids) {
		if (!todas.includes(id)) {
			relatorios.push({
				id,
				ok: false,
				montou: false,
				ja_montada: false,
				erro_montagem: "ferramenta desconhecida",
				instancias_primeiro_quadro: 0,
				instancias: 0,
				erros: [],
				avisos: [],
				conferencias: [],
				flex: [0, 0],
				flex_alturas: "",
				segundos: 0,
			});
			continue;
		}
		relatorios.push(testarFerramenta(id, opcoes));
	}
	const falhas = relatorios.filter((r) => !r.ok).map((r) => r.id);
	const studio = opcoes.ferramentas === undefined ? conferenciasStudio(relatorios) : undefined;
	return {
		ok: falhas.size() === 0,
		resumo: falhas.size() === 0 ? `${relatorios.size()} ferramenta(s) ok` : `falharam: ${falhas.join(", ")}`,
		ferramentas: relatorios,
		studio,
	};
}
