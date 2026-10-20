// Filtro vivo do Output: guarda as mensagens de LogService.MessageOut (e o histórico que já havia) num buffer
// no módulo, com o prefixo do jogo reconhecido em cada uma ([Interior], [Mapa], [Diorama]...). O painel lê a
// fonte `mensagens` e filtra por prefixo e nível.
//
// Cada sessão (edição, cliente, servidor do Play) tem o próprio LogService: a instância do plugin que roda
// na sessão do cliente vê as mensagens do cliente; a da edição vê as da edição. O que o painel mostra depende de
// qual instância está à vista (não dá para saber de dentro; ver o relatório).
import { LogService } from "@rbxts/services";
import { source } from "@rbxts/vide";

export interface Mensagem {
	texto: string;
	tipo: Enum.MessageType;
	/** "HH:MM:SS". */
	hora: string;
	/** O prefixo entre colchetes no começo, como "[Interior]", ou nada. */
	prefixo?: string;
}

/** Prefixos que o jogo e o plugin usam no Output (seção 3 da especificação, "Mensagens no Output"). */
export const PREFIXOS: string[] = [
	"[Interior]",
	"[Mapa]",
	"[Moradores]",
	"[Decor]",
	"[Decorar]",
	"[Pecas]",
	"[Fixos]",
	"[Luz]",
	"[Água]",
	"[Som]",
	"[graalArt]",
	"[Diorama]",
];

/** Quantas mensagens ficam guardadas. */
const LIMITE = 500;

/** As mensagens guardadas, da mais antiga para a mais nova. Trocada inteira a cada mensagem nova. */
export const mensagens = source<Mensagem[]>([]);

function prefixoDe(texto: string): string | undefined {
	const [achado] = texto.match("^%s*(%[[^%]]+%])");
	return achado !== undefined ? tostring(achado) : undefined;
}

function hora(carimbo?: number): string {
	return os.date("%H:%M:%S", carimbo !== undefined ? math.floor(carimbo) : undefined);
}

function acrescentar(texto: string, tipo: Enum.MessageType, carimbo?: number) {
	const nova: Mensagem = { texto, tipo, hora: hora(carimbo), prefixo: prefixoDe(texto) };
	const atual = mensagens();
	const lista = atual.size() >= LIMITE ? atual.filter((_, i) => i >= atual.size() - LIMITE + 1) : [...atual];
	lista.push(nova);
	mensagens(lista);
}

let ligado = false;

/** Começa a ouvir o Output (uma vez por sessão) e traz o histórico que já havia. */
export function ligarOutput() {
	if (ligado) return;
	ligado = true;
	pcall(() => {
		const historico = LogService.GetLogHistory();
		for (const item of historico) acrescentar(item.message, item.messageType, item.timestamp);
	});
	pcall(() => LogService.MessageOut.Connect((texto, tipo) => acrescentar(texto, tipo)));
}

export function limparMensagens() {
	mensagens([]);
}

export type Nivel = "info" | "aviso" | "erro";

export function nivelDe(tipo: Enum.MessageType): Nivel {
	if (tipo === Enum.MessageType.MessageError) return "erro";
	if (tipo === Enum.MessageType.MessageWarning) return "aviso";
	return "info";
}

export interface Filtro {
	/** Prefixos ligados; vazio com `soDoJogo` ligado mostra todos os prefixos conhecidos. */
	prefixos: ReadonlySet<string>;
	/** Só mensagens com um prefixo conhecido (as do jogo); desligado, mostra tudo. */
	soDoJogo: boolean;
	niveis: ReadonlySet<Nivel>;
	/** Texto que a mensagem precisa conter (sem distinguir maiúsculas), ou vazio. */
	contem: string;
}

export function filtrar(lista: Mensagem[], filtro: Filtro): Mensagem[] {
	const contem = filtro.contem.lower();
	return lista.filter((m) => {
		if (!filtro.niveis.has(nivelDe(m.tipo))) return false;
		if (filtro.soDoJogo) {
			if (m.prefixo === undefined || !PREFIXOS.includes(m.prefixo)) return false;
			if (filtro.prefixos.size() > 0 && !filtro.prefixos.has(m.prefixo)) return false;
		} else if (filtro.prefixos.size() > 0 && (m.prefixo === undefined || !filtro.prefixos.has(m.prefixo))) {
			return false;
		}
		if (contem !== "" && m.texto.lower().find(contem, 1, true)[0] === undefined) return false;
		return true;
	});
}

const MARCA: Record<Nivel, string> = { info: " ", aviso: "!", erro: "X" };

/** As mensagens como texto, uma por linha: "HH:MM:SS ! texto". */
export function textoDasMensagens(lista: Mensagem[]): string {
	if (lista.size() === 0) return "";
	return lista.map((m) => `${m.hora} ${MARCA[nivelDe(m.tipo)]} ${m.texto}`).join("\n");
}
