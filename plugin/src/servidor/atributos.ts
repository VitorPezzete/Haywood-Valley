// Os atributos de desenvolvimento do Workspace que o jogo lê (seção 12.19 da especificação), com leitura
// reativa e gravação num passo do ChangeHistoryService (Ctrl+Z desfaz).
//
// Nomes copiados do jogo (o plugin não importa o src/): INTERIOR_TEST_ATTRIBUTE e INTERIOR_TEST_CELL_ATTRIBUTE
// (shared/interiors/types.ts), ACTIONS_TEST_ATTRIBUTE (shared/interiorMap.ts), BUDGET_ATTRIBUTE, PHONE_ATTRIBUTE
// e PANEL_FOR_ALL_ATTRIBUTE (client/controllers/DevToolsController.ts), HOUSE_SLOT_TEST_ATTRIBUTE
// (server/services/MapService.ts), HOUR_TEST_ATTRIBUTE e CLOCK_OFFSET_ATTRIBUTE (shared/clock.ts).
import { ChangeHistoryService, RunService, Workspace } from "@rbxts/services";
import { source } from "@rbxts/vide";
import { aoParar } from "../ambiente";

export type TipoAtributo = "texto" | "booleano" | "numero" | "celular";

export interface DefinicaoAtributo {
	nome: string;
	titulo: string;
	descricao: string;
	tipo: TipoAtributo;
	/** Texto de exemplo no campo. */
	dica?: string;
}

export const ATRIBUTO_INTERIOR_TESTE = "InteriorTeste";
export const ATRIBUTO_INTERIOR_CELULA = "InteriorTesteCelula";
export const ATRIBUTO_ACOES_TESTE = "AcoesTeste";
export const ATRIBUTO_ORCAMENTO = "OrcamentoTeste";
export const ATRIBUTO_CELULAR = "CelularTeste";
export const ATRIBUTO_PAINEL_PARA_TODOS = "PainelParaTodos";
export const ATRIBUTO_CASA_LUGAR = "CasaLugarTeste";
export const ATRIBUTO_HORA = "HoraTeste";
export const ATRIBUTO_RELOGIO_DESVIO = "RelogioDesvio";

/** Os tamanhos de celular mais comuns, em pontos, deitados (o jogo é em paisagem). `true` é o comum do jogo. */
export const CELULARES: Array<{ titulo: string; valor: true | string }> = [
	{ titulo: "Comum (844×390)", valor: true },
	{ titulo: "iPhone Pro Max (932×430)", valor: "932x430" },
	{ titulo: "Android (915×412)", valor: "915x412" },
	{ titulo: "Android pequeno (800×360)", valor: "800x360" },
	{ titulo: "iPad (1180×820)", valor: "1180x820" },
];

export const ATRIBUTOS: DefinicaoAtributo[] = [
	{
		nome: ATRIBUTO_INTERIOR_TESTE,
		titulo: "Teste de interior",
		descricao: "Id de um mapa gerado (npm run diorama:jogo). Com ele, o jogo entra direto no mapa, sem menu nem personalização.",
		tipo: "texto",
		dica: "ex.: casa_teste_v2_l",
	},
	{
		nome: ATRIBUTO_INTERIOR_CELULA,
		titulo: "Célula do teste",
		descricao: "\"x,y\" em células do bloco (0 a 63): onde o personagem começa no teste. Vazio: o começo do gerador.",
		tipo: "texto",
		dica: "ex.: 12,20",
	},
	{
		nome: ATRIBUTO_ACOES_TESTE,
		titulo: "Peças de teste das ações",
		descricao: "Um pote, um caixote, um baú e uma piscina de água funda no piso livre mais perto do começo, só no mapa inicial.",
		tipo: "booleano",
	},
	{
		nome: ATRIBUTO_ORCAMENTO,
		titulo: "Painel de orçamento",
		descricao: "Mostra o painel de desempenho (imagens, instâncias, tempo por quadro, memória, rede). No jogo: Ctrl+Shift+O.",
		tipo: "booleano",
	},
	{
		nome: ATRIBUTO_CELULAR,
		titulo: "Prévia de celular",
		descricao: "A tela do jogo num retângulo do tamanho de um celular, ampliado pelo inteiro que cabe. No jogo: Ctrl+Shift+P.",
		tipo: "celular",
		dica: "LxA, ex.: 844x390",
	},
	{
		nome: ATRIBUTO_PAINEL_PARA_TODOS,
		titulo: "Painel para qualquer jogador",
		descricao: "Fora do Studio, deixa qualquer jogador abrir o painel de orçamento (teste com amigos num servidor privado).",
		tipo: "booleano",
	},
	{
		nome: ATRIBUTO_CASA_LUGAR,
		titulo: "Lugar da casa",
		descricao: "O primeiro lugar de casa a dar (1 a 200): põe a casa longe da origem para conferir o desenho lá.",
		tipo: "numero",
		dica: "ex.: 200",
	},
	{
		nome: ATRIBUTO_HORA,
		titulo: "Hora fixa",
		descricao: "Fixa a hora do jogo (0 a 24). Tirar o atributo volta ao relógio.",
		tipo: "numero",
		dica: "ex.: 21",
	},
	{
		nome: ATRIBUTO_RELOGIO_DESVIO,
		titulo: "Desvio do relógio",
		descricao: "Segundos que o relógio de teste está adiantado (o servidor grava quando alguém dorme).",
		tipo: "numero",
		dica: "ex.: 3600",
	},
];

export function definicao(nome: string): DefinicaoAtributo | undefined {
	return ATRIBUTOS.find((d) => d.nome === nome);
}

export function lerAtributo(nome: string): AttributeValue | undefined {
	const [ok, valor] = pcall(() => Workspace.GetAttribute(nome));
	return ok ? (valor as AttributeValue | undefined) : undefined;
}

const fontes = new Map<string, () => AttributeValue | undefined>();

/** Fonte do Vide com o valor atual do atributo; acompanha mudanças feitas por qualquer um (Studio, jogo, Ctrl+Z). */
export function fonteAtributo(nome: string): () => AttributeValue | undefined {
	const existente = fontes.get(nome);
	if (existente) return existente;
	const fonte = source<AttributeValue | undefined>(lerAtributo(nome));
	// A conexão sai quando o pacote para: sem isso, cada recarga deixava uma conexão viva por atributo no
	// Workspace, presa à fonte do pacote velho (achado em 2026-10-20).
	const [ok, conexao] = pcall(() => Workspace.GetAttributeChangedSignal(nome).Connect(() => fonte(lerAtributo(nome))));
	if (ok) {
		aoParar(conexao as RBXScriptConnection);
		aoParar(() => fontes.delete(nome));
	}
	fontes.set(nome, fonte);
	return fonte;
}

/** O valor como texto para mostrar ("(vazio)" quando não existe). */
export function textoDoValor(valor: AttributeValue | undefined): string {
	if (valor === undefined) return "(vazio)";
	if (typeIs(valor, "string")) return `"${valor}"`;
	return tostring(valor);
}

export interface ResultadoGravacao {
	ok: boolean;
	/** Mensagem para o usuário: erro, ou aviso (gravou, mas sem passo de desfazer). */
	mensagem?: string;
}

/**
 * Grava o atributo no Workspace dentro de um passo do ChangeHistoryService, para o Ctrl+Z desfazer. `undefined`
 * apaga o atributo. Durante o Play o histórico não funciona (e a mudança some no Stop): grava assim mesmo e avisa.
 */
export function gravarAtributo(nome: string, valor: AttributeValue | undefined): ResultadoGravacao {
	const titulo = definicao(nome)?.titulo ?? nome;
	const rodando = RunService.IsRunning();
	let identificador: string | undefined;
	if (!rodando) {
		const [ok, id] = pcall(() => ChangeHistoryService.TryBeginRecording(`Diorama.${nome}`, `Diorama: ${titulo}`));
		if (ok) identificador = id as string | undefined;
	}
	const [gravou, erro] = pcall(() => Workspace.SetAttribute(nome, valor));
	if (identificador !== undefined) {
		const operacao = gravou ? Enum.FinishRecordingOperation.Commit : Enum.FinishRecordingOperation.Cancel;
		pcall(() => ChangeHistoryService.FinishRecording(identificador as string, operacao));
	}
	if (!gravou) return { ok: false, mensagem: `não deu para gravar ${nome}: ${tostring(erro)}` };
	if (rodando) {
		return { ok: true, mensagem: `${nome} gravado na sessão de Play: vale agora, mas some no Stop.` };
	}
	if (identificador === undefined) {
		return { ok: true, mensagem: `${nome} gravado, mas sem passo de desfazer (outra gravação estava aberta).` };
	}
	return { ok: true };
}

/** Lê "x,y" como célula do bloco, como o jogo (`decodeCell`). */
export function lerCelula(texto: string): [number, number] | undefined {
	const [x, y] = texto.match("^%s*(%d+)%s*,%s*(%d+)%s*$");
	const cx = tonumber(x);
	const cy = tonumber(y);
	return cx !== undefined && cy !== undefined ? [cx, cy] : undefined;
}

/** Lê "LxA" como o jogo (`parsePhone`): largura e altura em pontos, mínimo 200 × 150. */
export function lerCelular(texto: string): [number, number] | undefined {
	const [w, h] = texto.match("^%s*(%d+)%s*[xX×]%s*(%d+)%s*$");
	const largura = tonumber(w);
	const altura = tonumber(h);
	if (largura === undefined || altura === undefined || largura < 200 || altura < 150) return undefined;
	return [largura, altura];
}
