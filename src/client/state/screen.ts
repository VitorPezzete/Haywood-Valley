import { atom } from "@rbxts/charm";
import { DEFAULT_LOOK, Look } from "shared/appearance";

export type Screen = "loading" | "menu" | "customize" | "playing";

/** Em que tela o jogador está: carregando, no menu inicial, personalizando o personagem ou jogando. */
export const screen = atom<Screen>("loading");

/** O visual montado na tela de personalizar. */
export const look = atom<Look>(DEFAULT_LOOK);

/** O nome escrito na tela de personalizar, ainda sem filtro; vazio quando o jogador não escreveu. */
export const characterName = atom("");
