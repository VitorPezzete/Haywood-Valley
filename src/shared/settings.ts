// Escolhas da tela de Configurações. Ficam aqui porque o salvamento, quando existir, vai guardá-las no servidor.

import { LOCALES } from "./i18n/locales";

/** O idioma escolhido: "auto" segue o idioma do Roblox do jogador. */
export type Language = "auto" | (typeof LOCALES)[number];
export type TextSpeed = "slow" | "normal" | "fast" | "instant";
/**
 * O kit da interface (decisão do usuário em 2026-10-17): Celeiro (fazenda, o padrão) e Graal (janela de
 * jogo online; para o jogador aparece como "Clássico", porque o jogo não usa o nome Graal). A terceira
 * proposta, Aurora, ficou de fora a pedido do usuário.
 */
export type UiTheme = "celeiro" | "graal";

export interface Settings {
	language: Language;
	music: number;
	effects: number;
	textSpeed: TextSpeed;
	theme: UiTheme;
}

export const DEFAULT_SETTINGS: Settings = {
	language: "auto",
	music: 80,
	effects: 80,
	textSpeed: "normal",
	theme: "celeiro",
};

/** A ordem em que as setas percorrem cada escolha. */
export const LANGUAGE_CHOICES: Language[] = ["auto", ...LOCALES];
export const TEXT_SPEED_ORDER: TextSpeed[] = ["slow", "normal", "fast", "instant"];
export const UI_THEMES: UiTheme[] = ["celeiro", "graal"];

/** Letras por segundo no diálogo; "instant" mostra a fala inteira de uma vez. */
export const TEXT_SPEEDS: Record<TextSpeed, number> = {
	slow: 25,
	normal: 45,
	fast: 80,
	instant: math.huge,
};

/** Quanto A e D mudam um volume. */
export const VOLUME_STEP = 10;

/** Nome de cada SoundGroup em SoundService. */
export const SOUND_GROUPS = {
	music: "Music",
	effects: "Effects",
} as const;
