// O carimbo (`stamp`) de um mapa: 12 hex que o jogo imprime ao montar o interior, para o autor conferir no Output
// que o Studio está com o mapa gerado por último. O algoritmo original se perdeu e os 14 carimbos antigos não saíram
// de nenhum hash que tentamos (ver docs/diorama/GERADOR.md): então o bloco guarda `carimbo` e `carimbo_conteudo`,
// o hash do conteúdo quando o carimbo foi gravado. Enquanto o conteúdo não muda, vale o carimbo guardado (o antigo,
// no que o importador trouxe); quando muda, o carimbo passa a ser o hash novo e o gerador regrava os dois no bloco.
import { createHash } from "node:crypto";

/** Campos do bloco que não entram no hash: o próprio carimbo e o que é só anotação. */
const FORA = new Set(["carimbo", "carimbo_conteudo", "nota", "notas"]);

function canonico(valor) {
	if (Array.isArray(valor)) return valor.map(canonico);
	if (valor && typeof valor === "object") {
		const saida = {};
		for (const chave of Object.keys(valor).sort()) {
			if (FORA.has(chave)) continue;
			saida[chave] = canonico(valor[chave]);
		}
		return saida;
	}
	return valor;
}

/** O hash de 12 hex do conteúdo do bloco (sha256 do JSON canônico, chaves em ordem, sem o carimbo). */
export function hashDoConteudo(bloco) {
	return createHash("sha256").update(JSON.stringify(canonico(bloco))).digest("hex").slice(0, 12);
}

/**
 * O carimbo que vale para o bloco: { carimbo, conteudo, mudou }. `mudou` diz que o bloco precisa ser regravado com
 * `carimbo` e `carimbo_conteudo` novos.
 */
export function carimboDoBloco(bloco) {
	const conteudo = hashDoConteudo(bloco);
	if (typeof bloco.carimbo === "string" && /^[0-9a-f]{12}$/.test(bloco.carimbo) && bloco.carimbo_conteudo === conteudo) {
		return { carimbo: bloco.carimbo, conteudo, mudou: false };
	}
	return { carimbo: conteudo, conteudo, mudou: true };
}
