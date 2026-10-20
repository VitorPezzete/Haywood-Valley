// As Configurações do Diorama (seção ⚙ da janela única, 2026-10-20): o que antes ficava espalhado pelos painéis.
// Tudo numa chave só das configurações do plugin (`Diorama_config`, uma tabela), lida quando o pacote inicia.
// "Folhas locais" e "Permitir executar Luau" continuam nas chaves deles (folhasLocais.ts, canal.ts), porque o
// canal e a prévia das folhas as leem antes de qualquer painel montar; a seção Configurações mostra as duas.
import Vide, { source } from "@rbxts/vide";
import { gravarConfig, lerConfig } from "./ambiente";
import { BASE, definirEnderecoPonte } from "./ponte";

const CHAVE = "Diorama_config";

export interface Config {
	/** Mostrar as opções avançadas (campos técnicos: ids, coordenadas, JSON, abas de depuração). */
	avancado: boolean;
	/** Zoom do canvas ao abrir o editor (1 a 3). */
	zoomPadrao: number;
	/** A grade do canvas começa ligada? */
	gradePadrao: boolean;
	/** Reabrir o último mapa ao abrir o Diorama. */
	lembrarMapa: boolean;
	/** A seção aberta por último. */
	secao: string;
	/** Endereço da ponte (o pacote; a casca sempre usa o padrão para baixar o pacote). */
	enderecoPonte: string;
}

export const PADRAO: Readonly<Config> = {
	avancado: false,
	zoomPadrao: 2,
	gradePadrao: true,
	lembrarMapa: true,
	secao: "mapa",
	enderecoPonte: BASE,
};

export const avancado = source(PADRAO.avancado);
export const zoomPadrao = source(PADRAO.zoomPadrao);
export const gradePadrao = source(PADRAO.gradePadrao);
export const lembrarMapa = source(PADRAO.lembrarMapa);
export const ultimaSecao = source(PADRAO.secao);
export const enderecoConfigurado = source(PADRAO.enderecoPonte);

function atual(): Config {
	return {
		avancado: avancado(),
		zoomPadrao: zoomPadrao(),
		gradePadrao: gradePadrao(),
		lembrarMapa: lembrarMapa(),
		secao: ultimaSecao(),
		enderecoPonte: enderecoConfigurado(),
	};
}

function guardar() {
	gravarConfig(CHAVE, atual());
}

/** Lê as configurações guardadas (no `iniciar` do pacote). */
export function carregarConfig() {
	const lido = lerConfig<unknown>(CHAVE, undefined);
	const t = typeIs(lido, "table") ? (lido as Partial<Config>) : {};
	avancado(t.avancado === true);
	zoomPadrao(typeIs(t.zoomPadrao, "number") && t.zoomPadrao >= 1 && t.zoomPadrao <= 3 ? math.floor(t.zoomPadrao) : PADRAO.zoomPadrao);
	gradePadrao(t.gradePadrao !== false);
	lembrarMapa(t.lembrarMapa !== false);
	ultimaSecao(typeIs(t.secao, "string") && t.secao !== "" ? t.secao : PADRAO.secao);
	const endereco = typeIs(t.enderecoPonte, "string") && enderecoValido(t.enderecoPonte) ? t.enderecoPonte : PADRAO.enderecoPonte;
	enderecoConfigurado(endereco);
	definirEnderecoPonte(endereco);
}

/** Um endereço http(s) sem barra no fim. */
export function enderecoValido(texto: string): boolean {
	return texto.match("^https?://[%w%.%-]+:?%d*$")[0] !== undefined;
}

export function definirAvancado(v: boolean) {
	avancado(v);
	guardar();
}
export function definirZoomPadrao(v: number) {
	zoomPadrao(math.clamp(math.floor(v), 1, 3));
	guardar();
}
export function definirGradePadrao(v: boolean) {
	gradePadrao(v);
	guardar();
}
export function definirLembrarMapa(v: boolean) {
	lembrarMapa(v);
	guardar();
}
export function definirUltimaSecao(id: string) {
	if (ultimaSecao() === id) return;
	ultimaSecao(id);
	guardar();
}
/** Troca o endereço da ponte; devolve false (e não muda nada) se o texto não é um endereço. */
export function definirEndereco(texto: string): boolean {
	const limpo = texto.gsub("^%s+", "")[0].gsub("%s+$", "")[0].gsub("/+$", "")[0];
	if (!enderecoValido(limpo)) return false;
	enderecoConfigurado(limpo);
	definirEnderecoPonte(limpo);
	guardar();
	return true;
}

/** Volta tudo desta tabela ao padrão (a seção Configurações também desliga Folhas locais e Executar Luau). */
export function restaurarPadroes() {
	avancado(PADRAO.avancado);
	zoomPadrao(PADRAO.zoomPadrao);
	gradePadrao(PADRAO.gradePadrao);
	lembrarMapa(PADRAO.lembrarMapa);
	enderecoConfigurado(PADRAO.enderecoPonte);
	definirEnderecoPonte(PADRAO.enderecoPonte);
	guardar();
}

/** Uma fonte de fachada para os interruptores do kit: ler lê a fonte; escrever chama `definir`. */
export function fachada<T>(fonte: () => T, definir: (v: T) => void): Vide.Source<T> {
	return ((novo?: T) => {
		if (novo === undefined) return fonte();
		definir(novo);
		return novo;
	}) as Vide.Source<T>;
}
