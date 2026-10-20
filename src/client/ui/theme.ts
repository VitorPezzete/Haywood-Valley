// O tema da interface que o jogador escolheu nas Configurações (Celeiro, o padrão, ou Graal, que
// aparece como "Clássico"), e as peças, cores e medidas dele para as telas. Os dados de cada tema
// vêm de themes/<tema>.ts, gerado pelo draw_ui_<X>.lua (pasta Aseprite/ui_propostas).

import { computed, subscribe } from "@rbxts/charm";
import { source } from "@rbxts/vide";
import { ASSETS } from "shared/assets";
import { UiTheme } from "shared/settings";
import { settings } from "client/state/settings";
import { Celeiro } from "./themes/celeiro";
import { Graal } from "./themes/graal";
import { ThemeColorName, ThemeMetricName, ThemePieceName, UiThemeData } from "./themes/types";

const THEMES: Record<UiTheme, UiThemeData> = { celeiro: Celeiro, graal: Graal };

/**
 * A folha de cada tema, enviada ao Roblox (ui_atlas_<tema>.png). Depois de rodar de novo o script de
 * um tema, enviar a folha nova e trocar o id no registro (ui.tema.<tema> em assets/registro.json; `npm run assets`).
 */
export const THEME_ATLASES: Record<UiTheme, string> = {
	celeiro: ASSETS["ui.tema.celeiro"],
	graal: ASSETS["ui.tema.graal"],
};
for (const [name, id] of pairs(THEME_ATLASES)) {
	if (id === "") warn(`[theme] a folha do tema ${name} ainda não tem id no registro (ui.tema.${name})`);
}

/** O tema em uso, para quem lê de fora do Vide (Charm). */
export const themeName = computed(() => settings().theme);

/**
 * O tema em uso como fonte do Vide: as telas leem por aqui, então trocar o tema nas Configurações
 * redesenha tudo na hora. Chamar `theme()` dentro de funções de propriedade.
 */
export const theme = source(settings().theme);
subscribe(themeName, (value) => theme(value));

export function themeData() {
	return THEMES[theme()];
}

export function piece(name: ThemePieceName) {
	return themeData().pieces[name];
}

export function themeColor(name: ThemeColorName) {
	return Color3.fromHex(themeData().colors[name]);
}

export function metric(name: ThemeMetricName) {
	return themeData().metrics[name];
}

/** Tamanho da peça, em pixels de arte. */
export function pieceSize(name: ThemePieceName) {
	const p = piece(name);
	return new Vector2(p.w, p.h);
}

/**
 * Propriedades de um `imagelabel` (ou `imagebutton`) com a peça `name` do tema em uso. Peça com
 * `slice` estica pelo 9-slice do Roblox, com os cantos fixos na escala `k`; sem `slice`, mostra o
 * recorte inteiro no tamanho que a imagem tiver. `name` pode ser uma função, para peças que mudam de
 * estado (normal, em cima, apertado).
 */
export function themed(name: ThemePieceName | (() => ThemePieceName), k: () => number) {
	const which = typeIs(name, "function") ? name : () => name;
	return {
		BackgroundTransparency: 1,
		Image: () => THEME_ATLASES[theme()],
		ImageRectOffset: () => {
			const p = piece(which());
			return new Vector2(p.x, p.y);
		},
		ImageRectSize: () => {
			const p = piece(which());
			return new Vector2(p.w, p.h);
		},
		ResampleMode: Enum.ResamplerMode.Pixelated,
		ScaleType: () => (piece(which()).slice ? Enum.ScaleType.Slice : Enum.ScaleType.Stretch),
		SliceCenter: () => {
			const p = piece(which());
			const s = p.slice ?? [0, 0, 0, 0];
			return new Rect(s[0], s[1], p.w - s[2], p.h - s[3]);
		},
		SliceScale: k,
	};
}
