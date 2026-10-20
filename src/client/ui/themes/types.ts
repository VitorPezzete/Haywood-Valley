// O formato dos temas da interface (decisão do usuário em 2026-10-17: os kits Celeiro e Graal entram
// no jogo, trocáveis nas Configurações). Os arquivos celeiro.ts e graal.ts são gerados pelos scripts
// draw_ui_<X>.lua (pasta Aseprite/ui_propostas), com as mesmas peças, cores e medidas; a lista comum
// está em ui_propostas/PAPEIS.md. Tema sem alguma peça não compila.

import { UiTheme } from "shared/settings";

/** Uma peça da folha do tema; `slice` = [esquerda, cima, direita, baixo] nas peças que esticam. */
export interface ThemePiece {
	x: number;
	y: number;
	w: number;
	h: number;
	slice?: [number, number, number, number];
}

export type ThemePieceName =
	| "panel"
	| "card"
	| "well"
	| "stage"
	| "titleBar"
	| "tab"
	| "tabActive"
	| "buttonPrimary"
	| "buttonPrimaryHover"
	| "buttonPrimaryPressed"
	| "buttonSecondary"
	| "buttonSecondaryHover"
	| "buttonSecondaryPressed"
	| "iconButton"
	| "iconButtonHover"
	| "iconButtonPressed"
	| "cell"
	| "cellChosen"
	| "cursor"
	| "scrollTrack"
	| "sliderTrack"
	| "swatchFrame"
	| "swatchFill"
	| "preset"
	| "presetChosen"
	| "textField"
	| "textFieldFocus"
	| "tooltip"
	| "key"
	| "dialog"
	| "nameTag"
	| "backdrop"
	| "scrollThumb"
	| "sliderKnob"
	| "starOn"
	| "starOff"
	| "originalMark"
	| "menuPointer"
	| "textCaret"
	| ThemeIcon;

export type ThemeIcon =
	| "iconDice"
	| "iconUndo"
	| "iconRedo"
	| "iconRotateLeft"
	| "iconRotateRight"
	| "iconStar"
	| "iconChest"
	| "iconPlus"
	| "iconOk"
	| "iconBack"
	| "iconNext"
	| "iconDropdown"
	| "iconGender"
	| "iconHead"
	| "iconBody"
	| "iconHair"
	| "iconFace"
	| "iconOutfit"
	| "iconSettings"
	| "iconCredits"
	| "iconSound"
	| "iconLanguage";

export type ThemeColorName =
	| "text"
	| "textSoft"
	| "textOnTitle"
	| "textOnTab"
	| "textOnPrimary"
	| "textOnSecondary"
	| "textOnField"
	| "textOnKey"
	| "placeholder"
	| "accent"
	| "screenTint";

export type ThemeMetricName =
	| "panelPadding"
	| "cardPadding"
	| "tabHeight"
	| "tabActiveHeight"
	| "tabOverlap"
	| "buttonHeight"
	| "pressedOffset"
	| "cellSize"
	| "cursorOutset"
	| "iconSize";

export interface UiThemeData {
	name: UiTheme;
	/** Tamanho da folha, em pixels. */
	atlasSize: Vector2;
	pieces: Record<ThemePieceName, ThemePiece>;
	/** Cores em RRGGBB. */
	colors: Record<ThemeColorName, string>;
	metrics: Record<ThemeMetricName, number>;
}
