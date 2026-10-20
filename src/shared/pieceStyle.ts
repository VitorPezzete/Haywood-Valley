// O estilo das cabeças e dos corpos dos contribuidores. Cada peça existe em duas versões, com o mesmo
// desenho: a do Aeko (as cores recoloridas na paleta do Aeko por tools/estilo_aeko.py, o padrão do jogo
// desde 2026-10-17) e a original (as cores com que o contribuidor pintou). O jogador escolhe por peça,
// na cabeça e no corpo (pedido do usuário em 2026-10-18).

/** As versões de uma peça. O número é o que vai no texto do visual (`encodeLook`): não renumerar. */
export type PieceStyle = 0 | 1;

/** Quantos estilos existem. */
export const PIECE_STYLES = 2;

/**
 * O estilo com que as peças aparecem para quem ainda não escolheu: trocar esta linha muda o padrão do
 * jogo inteiro (o visual inicial, os padrões de cada gênero). Visual salvo antes do estilo por peça
 * continua no estilo do Aeko, o único que existia (`LEGACY_PIECE_STYLE`).
 */
export const DEFAULT_PIECE_STYLE: PieceStyle = 0;

/** O estilo dos visuais gravados antes de 2026-10-18, quando só havia o do Aeko. */
export const LEGACY_PIECE_STYLE: PieceStyle = 0;

/** Se `value` é um estilo que existe. */
export function isPieceStyle(value: unknown): value is PieceStyle {
	return typeIs(value, "number") && value === math.floor(value) && value >= 0 && value < PIECE_STYLES;
}
