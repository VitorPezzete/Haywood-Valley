// O nome que o jogador dá ao personagem na tela de personalizar.

/** Atributo do `Player` com o nome do personagem, já filtrado pelo Roblox. */
export const NAME_ATTRIBUTE = "CharacterName";
/** Letras no nome, no máximo. */
export const NAME_MAX = 16;
/** Bytes que o servidor aceita receber antes de olhar o texto: um nome cheio de acentos cabe folgado. */
export const NAME_MAX_BYTES = NAME_MAX * 4;

/**
 * O nome sem quebras de linha nem caracteres de controle, com os espaços juntados, sem espaço nas
 * pontas e cortado em `NAME_MAX` letras. Pode voltar vazio.
 */
export function cleanName(text: string) {
	const [flat] = text.gsub("%c", " ");
	const [single] = flat.gsub("%s+", " ");
	const [trimmed] = single.gsub("^%s+", "");
	const [clean] = trimmed.gsub("%s+$", "");
	const [count] = utf8.len(clean);
	if (!typeIs(count, "number")) return "";
	if (count <= NAME_MAX) return clean;
	const cut = utf8.offset(clean, NAME_MAX + 1);
	return cut !== undefined ? clean.sub(1, cut - 1) : clean;
}
