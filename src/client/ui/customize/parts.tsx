// Peças da tela de personalizar que as duas disposições usam (celeiro.tsx e graal.tsx): o boneco
// desenhado na interface, o botão do kit com texto na fonte de pixel, a grade com rolagem, a barra de
// cor, as cores prontas, o visual salvo, o campo do nome, os cartões de gênero, a dica e o cursor.
// Tudo em pixels de arte de um palco de 480×270; `at(x, y)` converte para a tela. As medidas que
// mudam de uma prancha para a outra entram como opções.

import Vide, { action, cleanup, derive, source, untrack } from "@rbxts/vide";
import {
	channelsOfRgb,
	colorOfRgb,
	lookGender,
	ORIGINAL,
	originalRgb,
	partRgb,
	withBody,
	withGender,
	withPickedHead,
} from "shared/appearance";
import { Graal } from "shared/graal";
import { NAME_MAX, cleanName } from "shared/names";
import { withOutfitPalette } from "shared/outfitPalette";
import { decodeSavedLook } from "shared/playerData";
import { saveLook, toggleFavorite } from "client/state/playerData";
import {
	FIGURE,
	FigureLayer,
	figureLayers,
	GRAAL_CELL,
	HEAD_Y,
	headLayers,
	layerPosition,
	layerRect,
	MAX_FIGURE_LAYERS,
} from "client/world/graalArt";
import { keyName, t } from "../i18n";
import { px, WHITE } from "../kit";
import { PixelText, TextAlign, textWidth } from "../pixelText";
import { metric, piece, pieceSize, themeColor, themed } from "../theme";
import { ThemePieceName } from "../themes/types";
import { Customize, GENDERS, Grid, GridSpec, poolSize, range, SPARE_ROWS, STYLE_KEY, STYLES } from "./state";

type Dynamic<T> = T | (() => T);

export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface LabelOptions {
	width?: number;
	align?: TextAlign;
	bold?: boolean;
	wrap?: boolean;
	lineHeight?: number;
	gradient?: ColorSequence | (() => ColorSequence);
	maxChars?: number;
	zIndex?: number;
	/** Com esta função, o texto fica num quadro que aparece e some. */
	visible?: () => boolean;
}

export interface IconOptions {
	tint?: Dynamic<Color3>;
	transparency?: () => number;
	visible?: () => boolean;
}

export interface ButtonProps {
	kind: "primary" | "secondary" | "icon";
	box: Dynamic<Box>;
	text?: () => string;
	icon?: () => ThemePieceName | undefined;
	/** A tinta do texto; `main` diz se o botão aparece como o principal. */
	ink?: (main: boolean) => Ink;
	chosen?: () => boolean;
	/** Como o escolhido aparece: como o principal (padrão) ou afundado. */
	chosenStyle?: "primary" | "pressed";
	onPress: () => void;
	/** Botão direito. */
	onSecondary?: () => void;
	/** A dica que aparece com o mouse em cima. */
	tip?: () => string;
	visible?: () => boolean;
	zIndex?: number;
	/** Espaço entre o ícone e o texto. */
	gap?: number;
	/** Altura da face do botão (sem a borda de baixo). */
	face?: number;
	contentX?: number;
	iconX?: number;
	textX?: number;
	iconRight?: boolean;
	iconDy?: number;
	iconTint?: Dynamic<Color3>;
	iconFade?: () => number;
}

/** Camadas de uma cabeça, no máximo: a inteira, o cabelo, a pele, os olhos e 3 enfeites. */
const MAX_HEAD_LAYERS = 7;

/** As cores de um texto: a letra e a sombra de 1 px embaixo (como nas pranchas). */
export interface Ink {
	color: Color3;
	shadow?: Color3;
	/** Contorno do negrito. */
	outline?: Color3;
}

/** Retângulos de cor chapada, em pixels de arte: x, y, largura, altura, cor e, se tiver, a opacidade (0 a 1). */
export type Rect = [x: number, y: number, w: number, h: number, color: Color3, alpha?: number];

/** Como a grade aparece na prancha do tema. */
export interface GridLook {
	/** O poço em volta da grade. */
	well: Box;
	/** Margem do recorte da rolagem dentro do poço. */
	inset: number;
	/** Canto da primeira célula, a partir do poço. */
	origin: Vector2;
	/** Lugar da estrela de favorito dentro da célula. */
	star: Vector2;
	/** O trilho da barra de rolagem e a folga do puxador dentro dele. */
	track: Box;
	thumbPad: number;
	/** A tinta do aviso de lista vazia. */
	emptyInk: Dynamic<Ink>;
}

export interface PresetLook {
	/** Quanto a moldura da escolhida sai para fora. */
	chosenOutset: number;
	/** Lugar da marca da original. */
	mark: Vector2;
}

export interface SavedLook {
	/** A peça da vaga vazia. */
	empty: ThemePieceName;
	clip: Box;
	figureAt: Vector2;
	plusAt: Vector2;
	plusTint?: Color3;
}

export interface NameLook {
	padX: number;
	textY: number;
	caretGap: number;
	caretY: number;
	ink: Ink;
	placeholder: Ink;
}

export interface GenderCard {
	w: number;
	h: number;
	gap: number;
}

export function makeParts(ctx: Customize, visibleIcons: Partial<Record<ThemePieceName, Vector2>> = {}) {
	const { k } = ctx;
	const at = (x: number, y: number) => () => UDim2.fromOffset(x * k(), y * k());
	const isPointer = (input: InputObject) =>
		input.UserInputType === Enum.UserInputType.MouseButton1 || input.UserInputType === Enum.UserInputType.Touch;
	function read<T>(value: Dynamic<T>): T {
		return typeIs(value, "function") ? (value as () => T)() : (value as T);
	}

	/** O tamanho do desenho de um ícone: o tema guarda cada ícone centrado num quadro de 16, como o `pad` dos scripts. */
	const iconVisible = (name: ThemePieceName) => visibleIcons[name] ?? pieceSize(name);
	/** Onde o desenho do ícone começa dentro do quadro dele. */
	const iconInset = (name: ThemePieceName) => {
		const size = pieceSize(name);
		const seen = iconVisible(name);
		return new Vector2(math.floor((size.X - seen.X) / 2), math.floor((size.Y - seen.Y) / 2));
	};

	/** Um texto na fonte de pixel no ponto (x, y) do pai, com a cor e a sombra de `ink`. */
	const label = (
		text: () => string,
		x: Dynamic<number>,
		y: Dynamic<number>,
		ink: Dynamic<Ink>,
		options: LabelOptions = {},
	): Vide.Node => {
		const inkNow = () => read(ink);
		// Com a tinta numa função, a sombra pode ir e vir (a tinta muda com o tema).
		const shadow = typeIs(ink, "function") ? () => inkNow().shadow : ink.shadow ? () => ink.shadow : undefined;
		const node = (
			<PixelText
				k={k}
				text={text}
				color={() => inkNow().color}
				shadow={shadow}
				outline={inkNow().outline ? () => inkNow().outline ?? WHITE : undefined}
				position={() => UDim2.fromOffset(read(x) * k(), read(y) * k())}
				width={options.width}
				align={options.align}
				bold={options.bold}
				wrap={options.wrap}
				lineHeight={options.lineHeight}
				gradient={options.gradient}
				maxChars={options.maxChars}
				zIndex={options.zIndex ?? 20}
			/>
		);
		if (options.visible) {
			const visible = options.visible;
			return (
				<frame BackgroundTransparency={1} Size={UDim2.fromScale(1, 1)} Visible={visible} ZIndex={options.zIndex ?? 20}>
					{node}
				</frame>
			);
		}
		return node;
	};

    /**
     * Uma letra com contorno de 1 px sem negrito (o R, o G e o B do Clássico): quatro cópias na cor do
     * contorno, uma para cada lado, e a letra por cima.
     */
	const outlinedLabel = (text: string, x: number, y: number, color: Color3, outline: Color3, zIndex: number) => [
		...[
			[-1, 0],
			[1, 0],
			[0, -1],
			[0, 1],
		].map(([dx, dy]) => label(() => text, x + dx, y + dy, { color: outline }, { zIndex, maxChars: 2 })),
		label(() => text, x, y, { color }, { zIndex: zIndex + 2, maxChars: 2 }),
	];

	/** Um ícone do tema com o canto do quadro em (x, y). */
	const icon = (
		name: Dynamic<ThemePieceName>,
		x: Dynamic<number>,
		y: Dynamic<number>,
		zIndex: number,
		options: IconOptions = {},
	) => {
		const which = () => read(name);
		return (
			<imagelabel
				{...themed(which, k)}
				Position={() => UDim2.fromOffset(read(x) * k(), read(y) * k())}
				Size={() => {
					const size = pieceSize(which());
					return UDim2.fromOffset(size.X * k(), size.Y * k());
				}}
				ImageColor3={options.tint ?? WHITE}
				ImageTransparency={options.transparency ?? 0}
				Visible={options.visible ?? true}
				ZIndex={zIndex}
			/>
		);
	};

	/** Um ícone com o desenho (não o quadro) começando em (x, y), como os `blit` das pranchas. */
	const iconSeen = (
		name: ThemePieceName,
		x: Dynamic<number>,
		y: Dynamic<number>,
		zIndex: number,
		options: IconOptions = {},
	) =>
		icon(
			name,
			() => read(x) - iconInset(name).X,
			() => read(y) - iconInset(name).Y,
			zIndex,
			options,
		);

	/** Retângulos chapados (cercas e sombras dos palcos), ampliados `zoom` vezes. */
	const rects = (list: Rect[], zoom: number, zIndex: number) =>
		list.map(([x, y, w, h, color, alpha]) => (
			<frame
				BackgroundColor3={color}
				BackgroundTransparency={1 - (alpha ?? 1)}
				BorderSizePixel={0}
				Position={at(x * zoom, y * zoom)}
				Size={px(k, w * zoom, h * zoom)}
				ZIndex={zIndex}
			/>
		));

	/** Um boneco desenhado na interface: uma imagem por camada possível, escondidas as que o visual não usa. */
	const figure = (
		layers: () => FigureLayer[],
		count: number,
		zoom: number,
		zIndex: number,
		rect: (layer: FigureLayer) => Vector2,
		top = 0,
		place = (layer: FigureLayer) => layerPosition(layer),
	) =>
		range(count).map((index) => (
			<imagelabel
				BackgroundTransparency={1}
				Position={() => {
					const layer = layers()[index];
					const position = layer ? place(layer) : Vector2.zero;
					return UDim2.fromOffset(position.X * zoom * k(), (position.Y - top) * zoom * k());
				}}
				Size={px(k, GRAAL_CELL.X * zoom, GRAAL_CELL.Y * zoom)}
				Visible={() => layers()[index] !== undefined}
				Image={() => layers()[index]?.image ?? ""}
				ImageColor3={() => layers()[index]?.color ?? WHITE}
				ImageRectSize={GRAAL_CELL}
				ImageRectOffset={() => {
					const layer = layers()[index];
					return layer ? rect(layer) : Vector2.zero;
				}}
				ResampleMode="Pixelated"
				ZIndex={zIndex}
			/>
		));

	const frontStill = (layer: FigureLayer) => layerRect(layer, 0, 0, 2, false);

    /**
     * Botão do kit do tema, com os estados normal, em cima e apertado, e ícone e texto na face (por
     * padrão centrados, como o `button` das pranchas; `contentX`, `textX` e `iconX` põem cada um no
     * lugar). O conteúdo desce `pressedOffset` quando apertado. Escolhido, aparece como o principal ou,
     * com `chosenStyle: "pressed"`, afundado.
     */
	const button = (props: ButtonProps) => {
		const hovered = source(false);
		const pressed = source(false);
		const z = props.zIndex ?? 13;
		const box = () => read(props.box);
		const chosen = () => props.chosen?.() === true;
		const sunk = () => chosen() && props.chosenStyle === "pressed";
		const main = () => props.kind === "primary" || (chosen() && props.chosenStyle !== "pressed");
		const pieceName = () => {
			const base = props.kind === "icon" ? "iconButton" : main() ? "buttonPrimary" : "buttonSecondary";
			return `${base}${pressed() || sunk() ? "Pressed" : hovered() ? "Hover" : ""}` as ThemePieceName;
		};
		const drop = () => (pressed() || sunk() ? metric("pressedOffset") : 0);
		const iconName = () => props.icon?.();
		const iconSize = () => {
			const name = iconName();
			return name ? iconVisible(name) : Vector2.zero;
		};
		const textW = () => (props.text ? textWidth(props.text()) : 0);
		const gap = () => (props.text && iconName() ? (props.gap ?? 3) : 0);
		const face = () => props.face ?? box().h - 3;
		const startX = () => props.contentX ?? math.floor((box().w - (textW() + iconSize().X + gap())) / 2);
		const iconX = () => props.iconX ?? (props.iconRight ? startX() + textW() + gap() : startX());
		const textX = () => props.textX ?? (props.iconRight ? startX() : startX() + iconSize().X + gap());
		const ink = () =>
			props.ink?.(main()) ?? { color: main() ? themeColor("textOnPrimary") : themeColor("textOnSecondary") };
		return (
			<imagebutton
				{...themed(pieceName, k)}
				AutoButtonColor={false}
				Position={() => UDim2.fromOffset(box().x * k(), box().y * k())}
				Size={() => UDim2.fromOffset(box().w * k(), box().h * k())}
				Visible={props.visible ?? true}
				ZIndex={z}
				MouseEnter={(x, y) => {
					hovered(true);
					if (props.tip) ctx.showHint(props.tip(), x, y);
				}}
				MouseLeave={() => {
					hovered(false);
					pressed(false);
					ctx.tooltip(undefined);
				}}
				InputBegan={(input) => {
					if (isPointer(input)) pressed(true);
					if (input.UserInputType === Enum.UserInputType.MouseButton2) props.onSecondary?.();
				}}
				InputEnded={(input) => {
					if (isPointer(input)) pressed(false);
				}}
				Activated={props.onPress}
			>
				<frame
					BackgroundTransparency={1}
					Position={() => UDim2.fromOffset(0, drop() * k())}
					Size={UDim2.fromScale(1, 1)}
					ZIndex={z + 1}
				>
					{props.icon &&
						icon(
							() => iconName() ?? "iconOk",
							() => iconX() - (iconName() ? iconInset(iconName()!).X : 0),
							() =>
								math.floor((face() - iconSize().Y) / 2) +
								(props.iconDy ?? 0) -
								(iconName() ? iconInset(iconName()!).Y : 0),
							z + 2,
							{ tint: props.iconTint, transparency: props.iconFade, visible: () => iconName() !== undefined },
						)}
					{props.text && label(props.text, textX, () => math.floor((face() - 7) / 2), ink, { zIndex: z + 2 })}
				</frame>
			</imagebutton>
		);
	};

    /**
     * O seletor de estilo da aba `tabIndex` (Cabeça ou Corpo), em (x, y): o nome "Estilo" e o botão duplo
     * Aeko | Original do kit, com o estilo marcado aparecendo como escolhido (`chosenStyle`). Vale para a
     * peça escolhida, e a grade embaixo mostra as peças nele. A tecla (`STYLE_KEY`) aparece na dica.
     */
	const styleSwitch = (
		tabIndex: number,
		x: number,
		y: number,
		h: number,
		options: {
			labelInk: Dynamic<Ink>;
			ink?: (main: boolean) => Ink;
			chosenStyle?: "primary" | "pressed";
			zIndex?: number;
		},
	) => {
		const which = ctx.grids[tabIndex - 1];
		const title = () => t("customize.style");
		const startX = () => x + textWidth(title()) + 5;
		const buttonW = (slot: number) => 6 + textWidth(t(STYLES[slot].name)) + 6;
		const buttonX = (slot: number) => (slot === 0 ? startX() : startX() + buttonW(0));
		const tip = () => t("customize.styleHelp", { key: keyName(STYLE_KEY) });
		return [
			label(title, x, y + math.floor((h - 3 - 7) / 2), options.labelInk, { zIndex: options.zIndex }),
			...STYLES.map((item, slot) =>
				button({
					kind: "secondary",
					box: () => ({ x: buttonX(slot), y, w: buttonW(slot), h }),
					text: () => t(item.name),
					ink: options.ink,
					chosen: () => ctx.styleOf(which.kind) === item.style,
					chosenStyle: options.chosenStyle,
					onPress: () => ctx.setStyle(which.kind, item.style),
					tip,
					zIndex: options.zIndex,
				}),
			),
		];
	};

	/** O foco do teclado em volta da área `box`, em pixels de arte, no pai. */
	const cursorFrame = (box: () => Box | undefined, zIndex: number) => (
		<imagelabel
			{...themed("cursor", k)}
			Visible={() => box() !== undefined}
			Position={() => {
				const b = box();
				const out = metric("cursorOutset");
				return b ? UDim2.fromOffset((b.x - out) * k(), (b.y - out) * k()) : new UDim2();
			}}
			Size={() => {
				const b = box();
				const out = metric("cursorOutset");
				return b ? UDim2.fromOffset((b.w + out * 2) * k(), (b.h + out * 2) * k()) : new UDim2();
			}}
			ZIndex={zIndex}
		/>
	);

	/** A folga das células dentro do recorte da rolagem, e o recorte. */
	const gridView = (spec: GridSpec, look: GridLook) => {
		const pad = new Vector2(look.origin.X - look.inset, look.origin.Y - look.inset);
		return {
			pad,
			x: look.well.x + look.inset,
			y: look.well.y + look.inset,
			w: pad.X * 2 + (spec.columns - 1) * spec.stepX + spec.w,
			h: look.well.h - look.inset * 2,
		};
	};

    /**
     * A grade com rolagem de cabeças ou corpos da aba `tabIndex`, no poço, com a barra de rolagem e o
     * aviso de lista vazia. As células à mostra são as de sempre, reaproveitadas ao rolar.
     */
	const grid = (tabIndex: number, look: GridLook, zIndex: number) => {
		const which = ctx.grids[tabIndex - 1];
		const { spec } = which;
		const isHead = tabIndex === 1;
		const view = gridView(spec, look);
		ctx.setGridView(view.h, view.pad.Y);
		const poolRows = () => ctx.visibleRows(which) + SPARE_ROWS;
		const canvasH = () => {
			const rows = ctx.rowsOf(which);
			return rows > 0 ? view.pad.Y * 2 + (rows - 1) * spec.stepY + spec.h : 0;
		};

		const cell = (slot: number) => {
			const row = () => which.firstRow() + math.floor(slot / spec.columns);
			const piece = () => {
				if (math.floor(slot / spec.columns) >= poolRows()) return undefined;
				return ctx.listOf(which)[row() * spec.columns + (slot % spec.columns)];
			};
			// A miniatura só refaz o desenho com a aba dela aberta e quando muda o que ela mostra: a peça e as
			// cores (e, no corpo, a cabeça desenhada em cima; a roupa do cartão vem da paleta, que só depende do
			// cabelo e da pele) e o estilo marcado da cabeça e do corpo. Antes, as duas grades refaziam umas 60 miniaturas a cada mudança no visual, até
			// escondidas, e arrastar uma barra de cor travava a tela (visto em 2026-10-17). A cabeça aparece com
			// o cabelo, os olhos e os enfeites que o artista pintou e a pele do boneco (decisão do usuário em
			// 2026-10-17), do jeito que vem ao ser escolhida (withPickedHead).
			const key = derive(() => {
				if (ctx.tab() !== tabIndex) return "";
				const value = piece();
				if (value === undefined) return "";
				const now = ctx.look();
				if (isHead) return `${value}|${now.skinRgb}|${now.headStyle}`;
				const colors = `${now.skinRgb}|${now.hairRgb}|${now.eyesRgb}|${now.detail0Rgb}|${now.detail1Rgb}|${now.detail2Rgb}`;
				return `${value}|${now.head}|${colors}|${now.headStyle}|${now.bodyStyle}`;
			});
			const layers = derive((): FigureLayer[] => {
				if (key() === "") return [];
				return untrack(() => {
					const value = piece();
					if (value === undefined) return [];
					return isHead
						? headLayers(withPickedHead(ctx.look(), value))
						: figureLayers(withOutfitPalette(withBody(ctx.look(), value), value));
				});
			});
			const favorite = () => {
				const value = piece();
				return value !== undefined && ctx.favoriteIds(which).includes(which.pieceId(value));
			};
			const hovered = source(false);
			const chosen = () => piece() === which.chosen();
			const index = () => row() * spec.columns + (slot % spec.columns);
			const star = pieceSize("starOn");
			return (
				<imagebutton
					{...themed(() => (chosen() ? "cellChosen" : "cell"), k)}
					AutoButtonColor={false}
					Position={() =>
						UDim2.fromOffset(
							(view.pad.X + (slot % spec.columns) * spec.stepX) * k(),
							(view.pad.Y + row() * spec.stepY) * k(),
						)
					}
					Size={px(k, spec.w, spec.h)}
					Visible={() => piece() !== undefined}
					ZIndex={zIndex + 1}
					MouseEnter={() => {
						hovered(true);
						if (ctx.tab() !== tabIndex || piece() === undefined) return;
						ctx.part(1);
						which.index(index());
					}}
					MouseLeave={() => hovered(false)}
					Activated={() => {
						const value = piece();
						if (value !== undefined) which.choose(value);
					}}
				>
					<frame
						BackgroundTransparency={1}
						Position={at(
							(spec.w - FIGURE.X) / 2,
							isHead ? (spec.h - GRAAL_CELL.Y) / 2 : (spec.h - FIGURE.Y) / 2,
						)}
						Size={px(k, FIGURE.X, isHead ? GRAAL_CELL.Y : FIGURE.Y)}
						ZIndex={zIndex + 2}
					>
						{figure(
							layers,
							isHead ? MAX_HEAD_LAYERS : MAX_FIGURE_LAYERS,
							1,
							zIndex + 2,
							frontStill,
							isHead ? HEAD_Y : 0,
						)}
					</frame>
					<imagebutton
						{...themed(() => (favorite() ? "starOn" : "starOff"), k)}
						AutoButtonColor={false}
						Position={at(look.star.X, look.star.Y)}
						Size={px(k, star.X, star.Y)}
						Visible={() => favorite() || hovered() || (ctx.part() === 1 && which.index() === index())}
						ZIndex={zIndex + 4}
						Activated={() => {
							const value = piece();
							if (value !== undefined) toggleFavorite(which.kind, which.pieceId(value));
						}}
					/>
				</imagebutton>
			);
		};

		// O puxador: o do Clássico estica com o tamanho da lista; o do Celeiro é a peça inteira.
		const thumb = () => {
			const size = pieceSize("scrollThumb");
			const fixed = piece("scrollThumb").slice === undefined;
			const total = canvasH();
			const inner = look.track.h - look.thumbPad * 2;
			const height = fixed ? size.Y : math.clamp(total > 0 ? (view.h / total) * inner : inner, 12, inner);
			const max = math.max(1, total - view.h);
			const top = (math.clamp(which.scrollY(), 0, max) / max) * (inner - height);
			const width = fixed ? size.X : look.track.w - 2;
			return {
				top: math.floor(top),
				height: math.floor(height),
				width,
				x: math.floor((look.track.w - width) / 2),
			};
		};
		let trackRef: GuiObject | undefined;

		return (
			<frame BackgroundTransparency={1} Size={UDim2.fromScale(1, 1)} ZIndex={zIndex}>
				<imagelabel
					{...themed("well", k)}
					Position={at(look.well.x, look.well.y)}
					Size={px(k, look.well.w, look.well.h)}
					ZIndex={zIndex}
				/>
				<scrollingframe
					BackgroundTransparency={1}
					BorderSizePixel={0}
					Position={at(view.x, view.y)}
					Size={px(k, view.w, view.h)}
					CanvasSize={() => UDim2.fromOffset(0, canvasH() * k())}
					ScrollBarThickness={0}
					ScrollingDirection="Y"
					ElasticBehavior="Never"
					ZIndex={zIndex + 1}
				>
					{action((instance: ScrollingFrame) => {
						which.scroller = instance;
						cleanup(
							instance.GetPropertyChangedSignal("CanvasPosition").Connect(() => {
								const rowNow = math.floor(instance.CanvasPosition.Y / k() / spec.stepY);
								if (rowNow !== which.firstRow()) which.firstRow(rowNow);
								which.scrollY(instance.CanvasPosition.Y / k());
							}),
						);
					})}
					{range(poolSize(spec)).map(cell)}
				</scrollingframe>
				{label(
					() => t("customize.noFavorites"),
					look.well.x + 10,
					look.well.y + math.floor(look.well.h / 2) - 8,
					look.emptyInk,
					{
						width: look.well.w - 20,
						align: "center",
						wrap: true,
						maxChars: 64,
						zIndex: zIndex + 2,
						visible: () => ctx.favoritesOnly() && ctx.listOf(which).size() === 0,
					},
				)}
				<imagelabel
					{...themed("scrollTrack", k)}
					Position={at(look.track.x, look.track.y)}
					Size={px(k, look.track.w, look.track.h)}
					ZIndex={zIndex + 2}
					InputBegan={(input) => {
						if (isPointer(input) && trackRef) ctx.startScrollDrag(which, trackRef, input.Position.Y);
					}}
				>
					{action((instance: ImageLabel) => {
						trackRef = instance;
					})}
					<imagelabel
						{...themed("scrollThumb", k)}
						Visible={() => ctx.rowsOf(which) > ctx.visibleRows(which)}
						Position={() => UDim2.fromOffset(thumb().x * k(), (look.thumbPad + thumb().top) * k())}
						Size={() => UDim2.fromOffset(thumb().width * k(), thumb().height * k())}
						ZIndex={zIndex + 3}
					/>
				</imagelabel>
			</frame>
		);
	};

	/** Onde está o foco do teclado na grade (a célula do cursor, já com a rolagem), no pai do poço. */
	const gridFocus = (tabIndex: number, look: GridLook): Box | undefined => {
		const which = ctx.grids[tabIndex - 1];
		if (ctx.tab() !== tabIndex || ctx.part() !== 1 || ctx.listOf(which).size() === 0) return undefined;
		const { spec } = which;
		const row = math.floor(which.index() / spec.columns);
		const y = look.well.y + look.origin.Y + row * spec.stepY - which.scrollY();
		if (y < look.well.y - spec.h / 2 || y > look.well.y + look.well.h - spec.h / 2) return undefined;
		return {
			x: look.well.x + look.origin.X + (which.index() % spec.columns) * spec.stepX,
			y,
			w: spec.w,
			h: spec.h,
		};
	};

	/** "id{sep}por autor" da peça. */
	const creditOf = (id: string, author: string, sep: string) =>
		id === "" ? "" : `${id}${sep}${t("credits.by", { author })}`;

    /**
     * O crédito da linha de informação: a peça sob o cursor nas grades, a cabeça nas abas de cabelo e
     * rosto, o corpo na de roupa.
     */
	const infoCredit = (sep: string) => {
		const index = ctx.tab();
		const grid = ctx.gridOf(index);
		if (grid) {
			const value = ctx.listOf(grid)[grid.index()];
			return value !== undefined ? creditOf(grid.pieceId(value), grid.pieceAuthor(value), sep) : "";
		}
		if (index === 3 || index === 4) {
			const head = Graal.heads[ctx.look().head];
			return head ? creditOf(head.id, head.author, sep) : "";
		}
		if (index === 5) {
			const body = Graal.bodies[ctx.look().body];
			return body ? creditOf(body.id, body.author, sep) : "";
		}
		return "";
	};

	/** O nome do artista do filtro, ou "" (todos). */
	const authorName = (which: Grid) => ctx.viewOf(which).authors[which.author()] ?? "";

	/** A cor da parte de agora, e os três canais dela. */
	const currentRgb = () => {
		const key = ctx.rgbKey();
		return key !== undefined ? (partRgb(ctx.look(), key) ?? 0) : 0;
	};
	const channels = derive(() => channelsOfRgb(currentRgb()));

    /**
     * Barra de um canal (0 R, 1 G, 2 B) em `box`, pintada pelo UIGradient com a cor de agora indo de 0 a
     * 255 no canal, com o puxador 2 pixels acima do trilho (`knobInset` é a margem do curso dentro dele);
     * arrastar ou tocar muda o canal.
     */
	const channelTrack = (channel: number, box: Box, zIndex: number, knobInset: number) => {
		let track: GuiObject | undefined;
		const knob = pieceSize("sliderKnob");
		const colorWith = (value: number) => {
			const c = channels();
			const parts = [c[0], c[1], c[2]];
			parts[channel] = value;
			return Color3.fromRGB(parts[0], parts[1], parts[2]);
		};
		const knobX = () =>
			box.x + knobInset + math.floor((channels()[channel] * (box.w - 1 - knobInset * 2)) / 255) - 3;
		return [
			<imagebutton
				{...themed("sliderTrack", k)}
				AutoButtonColor={false}
				Position={at(box.x, box.y)}
				Size={px(k, box.w, box.h)}
				ZIndex={zIndex}
				MouseEnter={() => {
					if (ctx.rgbKey() !== undefined) ctx.part(3 + channel);
				}}
				InputBegan={(input) => {
					if (track && isPointer(input)) ctx.startColorDrag(channel, track, input.Position.X);
				}}
			>
				{action((instance: ImageButton) => {
					track = instance;
				})}
				<uigradient Color={() => new ColorSequence(colorWith(0), colorWith(255))} />
			</imagebutton>,
			<imagelabel
				{...themed("sliderKnob", k)}
				Position={() => UDim2.fromOffset(knobX() * k(), (box.y - 2) * k())}
				Size={px(k, knob.X, knob.Y)}
				ZIndex={zIndex + 1}
			/>,
		];
	};
	const channelValue = (channel: number) => () => tostring(channels()[channel]);
	/** A cor de agora em hexadecimal, com ou sem o "#" (o Clássico mostra, o Celeiro não). */
	const hexText = (hash: boolean) => () => string.format(hash ? "#%06X" : "%06X", currentRgb());

	/** A cor pronta `index` (0 = a original) e se é a escolhida. */
	const presetColor = (index: number) => () => {
		if (index === 0) {
			const key = ctx.rgbKey();
			const original = key !== undefined ? originalRgb(ctx.look(), key) : undefined;
			return colorOfRgb(original ?? 0xffffff);
		}
		return colorOfRgb(ctx.presets()[index - 1] ?? 0xffffff);
	};
	const presetChosen = (index: number) => () => {
		const key = ctx.rgbKey();
		if (!key) return false;
		return index === 0 ? ctx.look()[key] === ORIGINAL : ctx.look()[key] === ctx.presets()[index - 1];
	};

    /**
     * Uma cor pronta de `size` em (x, y); a escolhida ganha a moldura por cima (`chosenOutset` para
     * fora) e a primeira, a original, a marca em `mark`.
     */
	const preset = (index: number, x: number, y: number, size: number, zIndex: number, look: PresetLook) => {
		const chosenSize = size + look.chosenOutset * 2;
		return (
			<imagebutton
				BackgroundTransparency={1}
				AutoButtonColor={false}
				Position={at(x, y)}
				Size={px(k, size, size)}
				Visible={() => index < ctx.swatchCount() && ctx.paintable()}
				ZIndex={zIndex}
				MouseEnter={(mx, my) => {
					ctx.part(6);
					ctx.cursor(index);
					if (index === 0) ctx.showHint(t("customize.original"), mx, my);
				}}
				MouseLeave={() => ctx.tooltip(undefined)}
				Activated={() => {
					ctx.part(6);
					ctx.cursor(index);
					ctx.choose();
				}}
			>
				<imagelabel
					{...themed("swatchFill", k)}
					Position={at(1, 1)}
					Size={px(k, size - 2, size - 2)}
					ImageColor3={presetColor(index)}
					ZIndex={zIndex}
				/>
				<imagelabel {...themed("preset", k)} Size={UDim2.fromScale(1, 1)} ZIndex={zIndex + 1} />
				<imagelabel
					{...themed("presetChosen", k)}
					Position={at(-look.chosenOutset, -look.chosenOutset)}
					Size={px(k, chosenSize, chosenSize)}
					Visible={presetChosen(index)}
					ZIndex={zIndex + 2}
				/>
				{index === 0 ? icon("originalMark", look.mark.X, look.mark.Y, zIndex + 3) : undefined}
			</imagebutton>
		);
	};

	/** A amostra grande da cor de agora em `box`: o miolo pintado `fillInset` para dentro e a moldura por cima. */
	const swatch = (box: Box, fillInset: number, zIndex: number) => [
		<imagelabel
			{...themed("swatchFill", k)}
			Position={at(box.x + fillInset, box.y + fillInset)}
			Size={px(k, box.w - fillInset * 2, box.h - fillInset * 2)}
			ImageColor3={() => colorOfRgb(currentRgb())}
			ZIndex={zIndex}
		/>,
		<imagelabel
			{...themed("swatchFrame", k)}
			Position={at(box.x, box.y)}
			Size={px(k, box.w, box.h)}
			ZIndex={zIndex + 1}
		/>,
	];

    /**
     * Um visual salvo em `box`: na vaga cheia, o boneco recortado em `clip` com o canto em `figureAt`
     * (dentro do recorte); na vazia, a peça `empty` com o mais em `plusAt`. Clique na vaga vazia guarda
     * o visual de agora; na cheia, veste; botão direito ou segurar apaga.
     */
	const savedSlot = (slot: number, box: Box, look: SavedLook, zIndex: number) => {
		const stored = derive(() => decodeSavedLook(ctx.saved().savedLooks[slot] ?? ""));
		const layers = derive(() => {
			const value = stored();
			return value ? figureLayers(value) : [];
		});
		return (
			<imagebutton
				{...themed(() => (stored() ? "cell" : look.empty), k)}
				AutoButtonColor={false}
				Position={at(box.x, box.y)}
				Size={px(k, box.w, box.h)}
				ZIndex={zIndex}
				MouseEnter={(x, y) => ctx.showHint(t(stored() ? "customize.savedWear" : "customize.savedEmpty"), x, y)}
				MouseLeave={() => ctx.tooltip(undefined)}
				Activated={() => {
					const value = stored();
					if (value) ctx.set(value);
					else saveLook(slot, ctx.look());
				}}
				InputBegan={(input) => {
					if (input.UserInputType === Enum.UserInputType.MouseButton2 && stored()) saveLook(slot, undefined);
				}}
				TouchLongPress={() => {
					if (stored()) saveLook(slot, undefined);
				}}
			>
				<frame
					BackgroundTransparency={1}
					ClipsDescendants={true}
					Position={at(look.clip.x, look.clip.y)}
					Size={px(k, look.clip.w, look.clip.h)}
					Visible={() => stored() !== undefined}
					ZIndex={zIndex + 1}
				>
					<frame
						BackgroundTransparency={1}
						Position={at(look.figureAt.X, look.figureAt.Y)}
						Size={px(k, FIGURE.X, FIGURE.Y)}
						ZIndex={zIndex + 1}
					>
						{figure(layers, MAX_FIGURE_LAYERS, 1, zIndex + 1, frontStill)}
					</frame>
				</frame>
				{icon("iconPlus", look.plusAt.X, look.plusAt.Y, zIndex + 1, {
					tint: look.plusTint ? () => look.plusTint ?? WHITE : undefined,
					visible: () => stored() === undefined,
				})}
			</imagebutton>
		);
	};
	const savedCount = () => ctx.saved().savedLooks.filter((text) => text !== "").size();

    /**
     * O campo do nome em `box`: a caixa de texto do Roblox recebe a digitação (com a letra transparente) e
     * o nome aparece por cima na fonte de pixel, com o cursor piscando quando o campo está em foco. O
     * texto fica em (`padX`, `textY`) e o cursor `caretGap` depois dele, na altura `caretY`.
     */
	const nameField = (box: Dynamic<Box>, look: NameLook, zIndex: number) => {
		const where = () => read(box);
		const focused = source(false);
		const blink = source(true);
		const shown = () => (ctx.name() === "" && !focused() ? t("customize.namePlaceholder") : ctx.name());
		return (
			<imagelabel
				{...themed(() => (focused() ? "textFieldFocus" : "textField"), k)}
				Position={() => UDim2.fromOffset(where().x * k(), where().y * k())}
				Size={() => UDim2.fromOffset(where().w * k(), where().h * k())}
				ZIndex={zIndex}
			>
				<textbox
					Name="NameBox"
					BackgroundTransparency={1}
					Size={UDim2.fromScale(1, 1)}
					Text={ctx.name()}
					ClearTextOnFocus={false}
					TextTransparency={1}
					TextSize={() => 8 * k()}
					ZIndex={zIndex + 3}
				>
					{action((boxInstance: TextBox) => {
						const update = () => {
							// O campo não passa de NAME_MAX letras; espaços e o resto se limpam no nome guardado.
							const [count] = utf8.len(boxInstance.Text);
							const cut =
								typeIs(count, "number") && count > NAME_MAX
									? utf8.offset(boxInstance.Text, NAME_MAX + 1)
									: undefined;
							if (cut !== undefined) {
								boxInstance.Text = boxInstance.Text.sub(1, cut - 1);
								return;
							}
							const clean = cleanName(boxInstance.Text);
							ctx.name(clean);
							ctx.characterName(clean);
						};
						cleanup(boxInstance.GetPropertyChangedSignal("Text").Connect(update));
						cleanup(boxInstance.Focused.Connect(() => focused(true)));
						cleanup(boxInstance.FocusLost.Connect(() => focused(false)));
						update();
					})}
				</textbox>
				{label(
					shown,
					look.padX,
					look.textY,
					() => (ctx.name() === "" && !focused() ? look.placeholder : look.ink),
					{ maxChars: NAME_MAX + 4, zIndex: zIndex + 1 },
				)}
				<imagelabel
					{...themed("textCaret", k)}
					Visible={() => focused() && blink()}
					Position={() =>
						UDim2.fromOffset((look.padX + textWidth(ctx.name()) + look.caretGap) * k(), look.caretY * k())
					}
					Size={() => {
						const size = pieceSize("textCaret");
						return UDim2.fromOffset(size.X * k(), size.Y * k());
					}}
					ZIndex={zIndex + 2}
				>
					{action(() => {
						let running = true;
						task.spawn(() => {
							while (running) {
								task.wait(0.5);
								blink(!blink());
							}
						});
						cleanup(() => {
							running = false;
						});
					})}
				</imagelabel>
			</imagelabel>
		);
	};

	/** Os dois cartões da aba Gênero, lado a lado, centrados em `area`, com o boneco ampliado duas vezes. */
	const genderCards = (area: Box, card: GenderCard, nameInk: Dynamic<Ink>, zIndex: number) => {
		const left = area.x + math.floor((area.w - card.w * 2 - card.gap) / 2);
		const zoom = 2;
		return GENDERS.map((item, slot) => {
			const layers = derive(() => figureLayers(withGender(ctx.look(), item.gender)));
			const x = left + slot * (card.w + card.gap);
			return (
				<imagebutton
					{...themed(() => (lookGender(ctx.look()) === item.gender ? "cellChosen" : "card"), k)}
					AutoButtonColor={false}
					Position={at(x, area.y)}
					Size={px(k, card.w, card.h)}
					ZIndex={zIndex}
					MouseEnter={() => {
						if (ctx.tab() !== 0) return;
						ctx.part(1);
						ctx.cursor(slot);
					}}
					Activated={() => ctx.setGender(item.gender)}
				>
					<frame
						BackgroundTransparency={1}
						Position={at(math.floor((card.w - FIGURE.X * zoom) / 2), 4)}
						Size={px(k, FIGURE.X * zoom, FIGURE.Y * zoom)}
						ZIndex={zIndex + 1}
					>
						{figure(layers, MAX_FIGURE_LAYERS, zoom, zIndex + 1, frontStill)}
					</frame>
					{label(() => t(item.name), 0, card.h - 16, nameInk, {
						width: card.w,
						align: "center",
						zIndex: zIndex + 2,
					})}
				</imagebutton>
			);
		});
	};
	const genderFocus = (area: Box, card: GenderCard): Box | undefined => {
		if (ctx.tab() !== 0 || ctx.part() !== 1) return undefined;
		const left = area.x + math.floor((area.w - card.w * 2 - card.gap) / 2);
		return { x: left + ctx.cursor() * (card.w + card.gap), y: area.y, w: card.w, h: card.h };
	};

	/** A dica flutuante, em cima do mouse, no pai `root`, na peça de dica do tema. */
	const tooltip = (root: () => GuiObject | undefined, ink: Dynamic<Ink>, zIndex: number) => (
		<imagelabel
			{...themed("tooltip", k)}
			Visible={() => ctx.tooltip() !== undefined}
			AnchorPoint={new Vector2(0.5, 1)}
			Position={() => {
				const tip = ctx.tooltip();
				const frame = root();
				if (!tip || !frame) return new UDim2();
				const origin = frame.AbsolutePosition;
				return UDim2.fromOffset(tip.x - origin.X, tip.y - origin.Y - 2 * k());
			}}
			Size={() => UDim2.fromOffset((textWidth(ctx.tooltip()?.text ?? "") + 10) * k(), pieceSize("tooltip").Y * k())}
			ZIndex={zIndex}
		>
			{label(() => ctx.tooltip()?.text ?? "", 5, 3, ink, { maxChars: 64, zIndex: zIndex + 1 })}
		</imagelabel>
	);

	return {
		at,
		label,
		outlinedLabel,
		icon,
		iconSeen,
		iconVisible,
		rects,
		figure,
		frontStill,
		button,
		styleSwitch,
		cursorFrame,
		grid,
		gridFocus,
		infoCredit,
		authorName,
		channelTrack,
		channelValue,
		hexText,
		currentRgb,
		preset,
		swatch,
		savedSlot,
		savedCount,
		nameField,
		genderCards,
		genderFocus,
		tooltip,
	};
}

export type Parts = ReturnType<typeof makeParts>;
