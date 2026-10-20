import { atom, computed } from "@rbxts/charm";
import { Players } from "@rbxts/services";
import { resolveLocale } from "shared/i18n/locales";
import { DEFAULT_SETTINGS, Settings } from "shared/settings";

/** As escolhas da tela de Configurações. Valem só nesta sessão, até existir o salvamento. */
export const settings = atom<Settings>(DEFAULT_SETTINGS);

/**
 * O idioma do Roblox do jogador: o da conta ao entrar e, se ele trocar o idioma no menu do Roblox
 * durante a partida, o novo (SettingsController).
 */
export const robloxLocale = atom(Players.LocalPlayer.LocaleId);

/** O idioma em que o jogo aparece. */
export const locale = computed(() => {
	const choice = settings().language;
	return choice === "auto" ? resolveLocale(robloxLocale()) : choice;
});
