// O que fica salvo de cada jogador entre uma partida e outra (DataStore, PlayerDataService): o
// personagem (visual e nome, para o Continuar do menu), as cabeças e os corpos favoritos e os visuais
// salvos da tela de personalizar, a decoração da casa e a fazenda do lote do mundo. Peças são guardadas pelo
// id, não pela posição na lista, para continuarem certas quando chegarem peças novas.

import { CLOTH_KEYS, DEFAULT_LOOK, DETAIL_KEYS, Look, ORIGINAL, ColorKey } from "./appearance";
import { Graal } from "./graal";
import { LEGACY_PIECE_STYLE, PieceStyle } from "./pieceStyle";
import { emptyDecor, PlayerDecor } from "./decor";
import { emptyFarm, PlayerFarm } from "./farm";

/**
 * Versão do formato salvo (o campo `v`). A 1 (sem o campo) é a de antes de 2026-10-23; a 2 acrescentou a fazenda
 * (`farm`), e o salvo da 1 se lê igual, com a fazenda vazia. Quem grava guarda os campos que não conhece (o salvo de
 * uma versão mais nova passa por um servidor velho sem perder nada); os servidores de antes da 2 ainda não fazem isso:
 * ao publicar a 2, fechar os servidores antigos, que gravariam o salvo sem a fazenda.
 */
export const PLAYER_DATA_VERSION = 2;

export interface PlayerData {
	v: number;
	favoriteHeads: string[];
	favoriteBodies: string[];
	savedLooks: string[];
	character: string;
	characterName: string;
	decor: PlayerDecor;
	farm: PlayerFarm;
}

/** Quantos visuais salvos cada jogador tem. */
export const SAVED_LOOKS = 4;
/** Favoritos de cada tipo, no máximo. */
export const MAX_FAVORITES = 300;
/** Tamanho máximo de um id de peça e do texto de um visual salvo. */
export const MAX_ID = 64;
export const MAX_SAVED_LOOK = 256;

export function emptyPlayerData(): PlayerData {
	const savedLooks = new Array<string>();
	for (let index = 0; index < SAVED_LOOKS; index++) savedLooks.push("");
	return {
		v: PLAYER_DATA_VERSION,
		favoriteHeads: [],
		favoriteBodies: [],
		savedLooks,
		character: "",
		characterName: "",
		decor: emptyDecor(),
		farm: emptyFarm(),
	};
}

/** As cores de um visual, na ordem guardada no texto. */
const COLOR_KEYS: ColorKey[] = ["skinRgb", "hairRgb", "eyesRgb", ...DETAIL_KEYS, ...CLOTH_KEYS];

/** A letra de cada estilo no texto salvo, na ordem de `PieceStyle`: a do Aeko e a original. */
const STYLE_CODES = ["a", "o"];

function styleOfCode(code: string | undefined): PieceStyle {
	const at = code !== undefined ? STYLE_CODES.indexOf(code) : -1;
	return at >= 0 ? (at as PieceStyle) : LEGACY_PIECE_STYLE;
}

/**
 * Um visual como texto estável: "gênero|id da cabeça|id do corpo|cor,cor,...|estilos", com o estilo da
 * cabeça e o do corpo em uma letra cada (`STYLE_CODES`, "ao" = cabeça do Aeko e corpo original).
 */
export function encodeSavedLook(look: Look) {
	const head = Graal.heads[look.head]?.id ?? "";
	const body = Graal.bodies[look.body]?.id ?? "";
	const colors = COLOR_KEYS.map((key) => tostring(look[key])).join(",");
	const styles = `${STYLE_CODES[look.headStyle] ?? ""}${STYLE_CODES[look.bodyStyle] ?? ""}`;
	return `${look.gender}|${head}|${body}|${colors}|${styles}`;
}

/**
 * Lê o texto de `encodeSavedLook`. Peça que não existe mais ou valor fora do lugar devolve `undefined`.
 * O texto de antes dos estilos (sem o último campo) e estilo desconhecido ficam no estilo do Aeko.
 */
export function decodeSavedLook(text: string): Look | undefined {
	if (text === "" || text.size() > MAX_SAVED_LOOK) return undefined;
	const [gender, headId, bodyId, colors, styles] = text.split("|") as (string | undefined)[];
	const head = Graal.heads.findIndex((piece) => piece.id === headId);
	const body = Graal.bodies.findIndex((piece) => piece.id === bodyId);
	if (head < 0 || body < 0 || colors === undefined) return undefined;
	const look: Look = {
		...DEFAULT_LOOK,
		gender: gender === "1" ? 1 : 0,
		head,
		body,
		headStyle: styleOfCode(styles?.sub(1, 1)),
		bodyStyle: styleOfCode(styles?.sub(2, 2)),
	};
	const values = colors.split(",");
	for (let index = 0; index < COLOR_KEYS.size(); index++) {
		const value = tonumber(values[index]);
		look[COLOR_KEYS[index]] =
			value !== undefined && value === math.floor(value) && value >= ORIGINAL && value <= 0xffffff
				? value
				: ORIGINAL;
	}
	return look;
}

/** Se o texto pode ser um id de peça do tipo `kind`. */
export function isPieceId(kind: "head" | "body", id: unknown): id is string {
	if (!typeIs(id, "string") || id.size() > MAX_ID) return false;
	const list: ReadonlyArray<{ id: string }> = kind === "head" ? Graal.heads : Graal.bodies;
	return list.some((piece) => piece.id === id);
}
