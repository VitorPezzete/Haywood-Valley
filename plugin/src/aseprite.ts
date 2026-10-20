// "Abrir no Aseprite" (CONEXOES.md, seção 3): pede à ponte que o Aseprite abra uma região de uma folha do Aeko
// (`POST /aseprite/comandos { nome: "abrir_regiao", args: { folha, area: [coluna, linha, largura, altura] } }`). O
// Aseprite abre um sprite novo com a região, com a grade de 16 px e o nome `folha@c,l`; "salvar_regiao" (lá) grava
// de volta na folha e a ponte avisa o Studio (`recarregar_folhas`). Yielda até o Aseprite responder (até 30 s).
import { pedirJson } from "./ponte";

export interface ResultadoAseprite {
	ok: boolean;
	mensagem: string;
}

export function abrirNoAseprite(folha: string, coluna: number, linha: number, largura: number, altura: number): ResultadoAseprite {
	const area = [coluna, linha, math.max(1, largura), math.max(1, altura)];
	const r = pedirJson<{ ok: boolean; erro?: string }>("POST", "/aseprite/comandos", { nome: "abrir_regiao", args: { folha, area } });
	const onde = `${folha} [${coluna}, ${linha}] ${area[2]} × ${area[3]}`;
	if (!r.ok) {
		// 503: o Aseprite não está conectado à ponte; a mensagem da ponte já diz o que fazer.
		return { ok: false, mensagem: `Aseprite: ${r.erro}` };
	}
	if (r.valor.ok === false) return { ok: false, mensagem: `O Aseprite recusou abrir ${onde}: ${r.valor.erro ?? "?"}` };
	return { ok: true, mensagem: `${onde} aberto no Aseprite (lá, "Salvar região na folha" grava de volta).` };
}

/**
 * "Abrir recorte no Aseprite": abre um PNG do repositório pelo comando `abrir` da extensão (`{ arquivo }`, relativo à
 * raiz do repositório que a extensão conhece). Para o recorte da etapa G (`diorama/recortes/<folha>/<id>.png`); o
 * que se salvar lá fica no arquivo, e `python tools/recortes.py` refaz o recorte por cima. Yielda.
 */
export function abrirArquivoNoAseprite(arquivo: string): ResultadoAseprite {
	const r = pedirJson<{ ok: boolean; erro?: string }>("POST", "/aseprite/comandos", { nome: "abrir", args: { arquivo } });
	if (!r.ok) return { ok: false, mensagem: `Aseprite: ${r.erro}` };
	if (r.valor.ok === false) return { ok: false, mensagem: `O Aseprite recusou abrir ${arquivo}: ${r.valor.erro ?? "?"}` };
	return { ok: true, mensagem: `${arquivo} aberto no Aseprite.` };
}
