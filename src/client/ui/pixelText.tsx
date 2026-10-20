// Texto na fonte de pixel das pranchas do kit (decisão do usuário em 2026-10-17): cada letra é uma
// imagem da folha pixel_font.png (tools/pixel_font.py), pintada por ImageColor3, então o texto sai
// igual às pranchas e nítido em qualquer ampliação. Serve para qualquer texto traduzido; letra que a
// fonte não tem vira "?".

import Vide, { derive } from "@rbxts/vide";
import { ASSETS } from "shared/assets";
import { PIXEL_FONT_CELL, PIXEL_FONT_GLYPHS, PIXEL_FONT_ORIGIN, PIXEL_FONT_VARIANT_HEIGHT } from "shared/pixelFont";

const WHITE = new Color3(1, 1, 1);

/** A folha da fonte (Aseprite/pixel_font.png); o id no registro (ui.fonte_pixel). */
export const PIXEL_FONT_IMAGE = ASSETS["ui.fonte_pixel"];

/** Altura das maiúsculas e distância entre linhas, em pixels de arte. */
export const CAP_HEIGHT = 7;
export const LINE_HEIGHT = 11;

const VARIANT_NORMAL = 0;
const VARIANT_BOLD = 1;
const VARIANT_OUTLINE = 2;

export type TextAlign = "left" | "center" | "right";

function glyphOf(ch: string) {
	return PIXEL_FONT_GLYPHS[ch] ?? PIXEL_FONT_GLYPHS["?"];
}

function charsOf(text: string) {
	const out: string[] = [];
	for (const [, code] of utf8.codes(text)) out.push(utf8.char(code));
	return out;
}

/** Largura do texto em pixels de arte, como o textW das pranchas. */
export function textWidth(text: string, bold = false) {
	let width = 0;
	for (const ch of charsOf(text)) width += glyphOf(ch)[2] + 1 + (bold ? 1 : 0);
	return math.max(0, width - 1);
}

interface Placed {
	ch: string;
	x: number;
	y: number;
}

/** As letras com o lugar de cada uma (x a partir da esquerda da caixa, y no topo das maiúsculas da linha). */
function layout(
	text: string,
	bold: boolean,
	width: number | undefined,
	align: TextAlign,
	wrap: boolean,
	lineHeight: number,
) {
	const lines: string[][] = [];
	if (wrap && width !== undefined) {
		let line: string[] = [];
		for (const word of text.split(" ")) {
			const trial = line.size() > 0 ? [...line, " ", ...charsOf(word)] : charsOf(word);
			if (line.size() > 0 && textWidth(trial.join(""), bold) > width) {
				lines.push(line);
				line = charsOf(word);
			} else {
				line = trial;
			}
		}
		lines.push(line);
	} else {
		lines.push(charsOf(text));
	}
	const placed: Placed[] = [];
	lines.forEach((line, row) => {
		const lineWidth = textWidth(line.join(""), bold);
		let x = 0;
		if (width !== undefined && align === "center") x = math.floor((width - lineWidth) / 2);
		else if (width !== undefined && align === "right") x = width - lineWidth;
		for (const ch of line) {
			if (ch !== " ") placed.push({ ch, x, y: row * lineHeight });
			x += glyphOf(ch)[2] + 1 + (bold ? 1 : 0);
		}
	});
	return { placed, lines: lines.size() };
}

export interface PixelTextProps {
	k: () => number;
	text: () => string;
	/** Cor da letra; sem cor, a camada não aparece. */
	color: () => Color3 | undefined;
	/** Cópia da letra um pixel abaixo, nesta cor. */
	shadow?: () => Color3 | undefined;
	/** Contorno do negrito, nesta cor (o texto fica em negrito). */
	outline?: () => Color3 | undefined;
	/** Degradê de cima para baixo por cima da cor. */
	gradient?: ColorSequence | (() => ColorSequence);
	bold?: boolean;
	align?: TextAlign;
	/** Largura da caixa, em pixels de arte; o alinhamento e a quebra de linha usam ela. */
	width?: number;
	wrap?: boolean;
	lineHeight?: number;
	/** Letras criadas, no máximo. */
	maxChars?: number;
	name?: string;
	position?: UDim2 | (() => UDim2);
	zIndex?: number;
	transparency?: () => number;
}

/** Um texto na fonte de pixel. */
export function PixelText(props: PixelTextProps) {
	const { k } = props;
	const bold = props.bold === true || props.outline !== undefined;
	const align = props.align ?? "left";
	const max = props.maxChars ?? 32;
	const z = props.zIndex ?? 1;
	const fade = props.transparency ?? (() => 0);
	const lineHeight = props.lineHeight ?? LINE_HEIGHT;
	const placed = derive(() => layout(props.text(), bold, props.width, align, props.wrap === true, lineHeight));

	const pool = (
		variant: number,
		dy: number,
		color: () => Color3 | undefined,
		layer: number,
		gradient?: ColorSequence | (() => ColorSequence),
	) => {
		const labels: ImageLabel[] = [];
		for (let index = 0; index < max; index++) {
			labels.push(
				<imagelabel
					BackgroundTransparency={1}
					Image={PIXEL_FONT_IMAGE}
					ImageRectSize={PIXEL_FONT_CELL}
					ImageRectOffset={() => {
						const item = placed().placed[index];
						if (!item) return Vector2.zero;
						const [gx, gy] = glyphOf(item.ch);
						return new Vector2(gx, gy + variant * PIXEL_FONT_VARIANT_HEIGHT);
					}}
					ImageColor3={() => color() ?? WHITE}
					ImageTransparency={fade}
					ResampleMode="Pixelated"
					Visible={() => placed().placed[index] !== undefined && color() !== undefined}
					Position={() => {
						const item = placed().placed[index];
						if (!item) return new UDim2();
						return UDim2.fromOffset(
							(item.x - PIXEL_FONT_ORIGIN.X) * k(),
							(item.y + dy - PIXEL_FONT_ORIGIN.Y) * k(),
						);
					}}
					Size={() => UDim2.fromOffset(PIXEL_FONT_CELL.X * k(), PIXEL_FONT_CELL.Y * k())}
					ZIndex={z + layer}
				>
					{gradient && <uigradient Color={gradient} Rotation={90} />}
				</imagelabel> as ImageLabel,
			);
		}
		return labels;
	};

	return (
		<frame
			Name={props.name ?? "PixelText"}
			BackgroundTransparency={1}
			Position={props.position}
			Size={() => UDim2.fromOffset((props.width ?? 0) * k(), placed().lines * lineHeight * k())}
			ZIndex={z}
		>
			{props.outline && pool(VARIANT_OUTLINE, 0, props.outline, 0)}
			{props.shadow && pool(bold ? VARIANT_BOLD : VARIANT_NORMAL, 1, props.shadow, 0)}
			{pool(bold ? VARIANT_BOLD : VARIANT_NORMAL, 0, props.color, 1, props.gradient)}
		</frame>
	);
}
