// O que a casca (index.server.ts) entrega ao pacote (app.ts) e o ciclo de vida do pacote.
//
// A casca é o Script do plugin: cria a barra, os botões e os widgets uma vez e nunca muda. O pacote (todo o resto)
// pode ser trocado a quente pela ponte (docs/diorama/CONEXOES.md, seção 1). Por isso os módulos do pacote não usam
// o global `plugin` (ele só existe no Script raiz): pegam `ambiente().plugin`. E tudo o que o pacote liga fora da
// interface (conexões a sinais, laços) é guardado com `aoParar`, para `encerrar()` desfazer quando o pacote é
// trocado; sem isso, a versão velha continuaria ouvindo o Output, o tema etc. depois da troca.
//
// Este módulo não importa nada do pacote: todos podem importá-lo sem ciclo.

export interface OpcoesWidgetCasca {
	titulo: string;
	/** Tamanho inicial flutuante. */
	largura?: number;
	altura?: number;
	larguraMinima?: number;
	alturaMinima?: number;
}

export interface Ambiente {
	/** O objeto `plugin` de verdade (os módulos não têm o global). */
	plugin: Plugin;
	/** O botão da barra "Diorama" com esse id; criado na primeira vez e reaproveitado nas recargas. */
	botao: (id: string, nome: string, descricao: string, icone: string) => PluginToolbarButton;
	/** O widget com esse id; criado na primeira vez, e entregue de novo (sem filhos) nas recargas. */
	widget: (id: string, opcoes: OpcoesWidgetCasca) => DockWidgetPluginGui;
	/** Versão do pacote (o VERSAO de versao.ts) e o hash, quando veio da ponte. */
	versao: string;
	hash?: string;
	origem: "ponte" | "embutido";
	/** Id desta instância do plugin no Studio, gerado pela casca ao carregar; o mesmo entre recargas. */
	sessao: string;
}

let atual: Ambiente | undefined;

export function definirAmbiente(a: Ambiente) {
	atual = a;
}

/** O ambiente do pacote em execução. Erro se chamado antes de `iniciar` (no carregamento dos módulos). */
export function ambiente(): Ambiente {
	if (!atual) error("[Diorama] ambiente ainda não definido: chamado antes de app.iniciar");
	return atual;
}

/** O ambiente, ou nada (para quem pode rodar antes de `iniciar`). */
export function ambienteSeHouver(): Ambiente | undefined {
	return atual;
}

const aoPararLista = new Array<() => void>();

/** Guarda o que desfazer quando o pacote parar: uma função ou uma conexão. Devolve o que recebeu. */
export function aoParar<T extends RBXScriptConnection | (() => void)>(coisa: T): T {
	if (typeIs(coisa, "function")) aoPararLista.push(coisa as () => void);
	else {
		const conexao = coisa as RBXScriptConnection;
		aoPararLista.push(() => conexao.Disconnect());
	}
	return coisa;
}

/** Desfaz tudo o que foi guardado com `aoParar`, do mais novo para o mais velho. */
export function encerrar() {
	while (aoPararLista.size() > 0) {
		const f = aoPararLista.pop()!;
		const [ok, erro] = pcall(f);
		if (!ok) warn(`[Diorama] erro ao parar: ${tostring(erro)}`);
	}
}

/**
 * Lê uma configuração do plugin (plugin:GetSetting), com o padrão quando não há ou o Studio recusa. A chave não pode
 * ter ".": o Studio aceita o SetSetting sem erro e não guarda nada (conferido em 2026-10-20); por isso os pontos
 * viram "_" aqui.
 */
function chaveValida(chave: string) {
	return chave.gsub("%.", "_")[0];
}

export function lerConfig<T>(chave: string, padrao: T): T {
	const a = atual;
	if (!a) return padrao;
	const [ok, valor] = pcall(() => a.plugin.GetSetting(chaveValida(chave)));
	if (!ok) warn(`[Diorama] não deu para ler a configuração ${chave}: ${tostring(valor)}`);
	if (!ok || valor === undefined) return padrao;
	return valor as T;
}

export function gravarConfig(chave: string, valor: unknown) {
	const a = atual;
	if (!a) return;
	const [ok, erro] = pcall(() => a.plugin.SetSetting(chaveValida(chave), valor));
	if (!ok) warn(`[Diorama] não deu para guardar a configuração ${chave}: ${tostring(erro)}`);
}

/** Quantas coisas estão guardadas para desfazer no `parar` (o comando `inspecionar` mostra, para achar vazamento). */
export function pendentesAoParar() {
	return aoPararLista.size();
}
