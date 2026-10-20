import { EN, TextKey } from "./en";
import { PT_BR } from "./ptBR";

/** Idiomas do jogo, pelo código do Roblox. O primeiro é a língua de origem. */
export const LOCALES = ["en-us", "pt-br"] as const;
export type Locale = (typeof LOCALES)[number];
export const SOURCE_LOCALE: Locale = "en-us";

/** O nome de cada idioma escrito nele mesmo; não se traduz, para quem caiu num idioma que não lê achar o seu. */
export const LOCALE_NAMES: Record<Locale, string> = {
	"en-us": "English",
	"pt-br": "Português (Brasil)",
};

const STRINGS: Record<Locale, Partial<Record<TextKey, string>>> = {
	"en-us": EN,
	"pt-br": PT_BR,
};

/** Valores das variáveis de um texto, pelo nome entre chaves. */
export type TextArgs = Record<string, string | number>;

/** Troca cada {nome} do modelo pelo valor; o que não tem valor fica como está. O valor entra sem ser relido. */
export function formatText(template: string, args?: TextArgs): string {
	if (!args) return template;
	const [result] = template.gsub("{(%w+)}", (name: string) => {
		const value = args[name];
		return value !== undefined ? tostring(value) : undefined;
	});
	return result;
}

/** O texto da chave no idioma; faltando, o inglês; faltando também, a própria chave. */
export function translate(locale: Locale, key: TextKey, args?: TextArgs): string {
	const texts = STRINGS[locale];
	const template = texts[key] ?? EN[key] ?? key;
	return formatText(template, args);
}

/** Se `key` é uma chave que existe (para chaves montadas, como `hair.<id>`). */
export function isTextKey(key: string): key is TextKey {
	return EN[key as TextKey] !== undefined;
}

/**
 * O idioma do jogo para um idioma do Roblox (`Player.LocaleId`, como "pt-br"): o mesmo código, ou a
 * mesma língua de outra região (pt-pt vira pt-br), ou o inglês.
 */
export function resolveLocale(robloxId: string): Locale {
	const id = robloxId.lower();
	for (const locale of LOCALES) {
		if (locale === id) return locale;
	}
	const language = id.split("-")[0];
	for (const locale of LOCALES) {
		if (locale.split("-")[0] === language) return locale;
	}
	return SOURCE_LOCALE;
}
