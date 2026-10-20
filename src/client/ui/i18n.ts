import { subscribe } from "@rbxts/charm";
import { UserInputService } from "@rbxts/services";
import { source } from "@rbxts/vide";
import { TextKey } from "shared/i18n/en";
import { TextArgs, translate } from "shared/i18n/locales";
import { locale } from "client/state/settings";

// O Vide só acompanha `source`: este espelha o idioma do Charm, como o StartController faz com a tela.
const current = source(locale());
subscribe(locale, (value) => current(value));

/** O idioma em que a interface está agora. Lido dentro de uma função de propriedade, ela acompanha a troca. */
export function uiLocale() {
	return current();
}

/**
 * O texto da chave no idioma atual. Na interface, sempre dentro de função, para trocar de idioma na
 * hora: `Text={() => t("menu.settings")}`.
 */
export function t(key: TextKey, args?: TextArgs) {
	return translate(current(), key, args);
}

/** Teclas cujo nome se traduz; as letras vêm do teclado do jogador. */
const KEY_TEXT = new Map<Enum.KeyCode, TextKey>([
	[Enum.KeyCode.Space, "key.space"],
	[Enum.KeyCode.Return, "key.enter"],
	[Enum.KeyCode.Backspace, "key.backspace"],
]);

/** Nome de uma tecla para mostrar ao jogador. As letras seguem o teclado dele: no AZERTY, o W aparece como Z. */
export function keyName(code: Enum.KeyCode) {
	const text = KEY_TEXT.get(code);
	if (text !== undefined) return t(text);
	const label = UserInputService.GetStringForKeyCode(code);
	return label !== "" ? label.upper() : code.Name;
}
