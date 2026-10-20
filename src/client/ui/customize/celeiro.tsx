// A tela de personalizar no Celeiro (tema padrão), igual à prancha A (Aseprite/ui_propostas/A_celeiro,
// tela_personalizar_A.png, desenhada por draw_ui_A.lua): à esquerda, o painel do personagem (a faixa
// do título, o palco com a cerca, Aleatório, Desfazer e Refazer e os visuais salvos); à direita, o
// painel com as abas centradas em cima, o artista, o crédito e os favoritos, a grade, a faixa de cor
// e, embaixo, o nome, Voltar e Continuar. A prancha não desenha a aba Gênero nem as abas de cor:
// aqui elas seguem a mesma linguagem (cartões no Gênero; nas de cor, as partes numa fileira de
// botões e o editor num poço maior, no lugar da grade e da faixa).

import Vide, { cleanup, derive } from "@rbxts/vide";
import { CLOTH_KEYS } from "shared/appearance";
import { SAVED_LOOKS } from "shared/playerData";
import { figureLayers, layerPosition, layerRect, MAX_FIGURE_LAYERS, TURN_ORDER } from "client/world/graalArt";
import { GRASS_TILE, Sprites } from "client/world/sprites";
import { t } from "../i18n";
import { px } from "../kit";
import { textWidth } from "../pixelText";
import { themed } from "../theme";
import { ThemePieceName } from "../themes/types";
import { makeParts } from "./parts";
import { createCustomize, range, TABS_LIST } from "./state";

type FlatRect = [number, number, number, number, Color3, number?];

// A paleta do script: madeira, papel e a noite do fundo.
const hex = (value: string) => Color3.fromHex(value);
const INK = hex("#0A0F0C");
const W1 = hex("#4A2A16");
const W2 = hex("#6B3A1E");
const W3 = hex("#8A4D1F");
const W4 = hex("#A5601F");
const W5 = hex("#BE7524");
const W6 = hex("#D38B27");
const PA0 = hex("#B39A70");
const PA3 = hex("#F4EEDC");
const NIGHT = hex("#0E1913");

const CHANNEL_NAMES = ["R", "G", "B"];

const DARK = { color: INK };
const LABEL = { color: W2 };
const SOFT = { color: W3 };
const FAINT = { color: PA0 };

/** O tamanho do desenho de cada ícone (a folha guarda todos num quadro de 16). */
const ICONS: Partial<Record<ThemePieceName, Vector2>> = {
	iconDice: new Vector2(12, 13),
	iconUndo: new Vector2(13, 12),
	iconRedo: new Vector2(13, 12),
	iconRotateLeft: new Vector2(15, 15),
	iconRotateRight: new Vector2(15, 15),
	iconStar: new Vector2(13, 13),
	iconChest: new Vector2(14, 12),
	iconPlus: new Vector2(6, 6),
	iconBack: new Vector2(10, 9),
	iconNext: new Vector2(10, 9),
	iconDropdown: new Vector2(9, 6),
	iconGender: new Vector2(13, 11),
	iconHead: new Vector2(12, 12),
	iconBody: new Vector2(11, 14),
	iconHair: new Vector2(12, 9),
	iconFace: new Vector2(12, 11),
	iconOutfit: new Vector2(12, 10),
};

// Medidas da prancha, em pixels de arte.
const LEFT = { x: 6, y: 8, w: 140, h: 256 };
const STAGE = { x: 14, y: 20, w: 124, h: 166 };
/** O palco: um pedaço do mundo de 38×52, ampliado 3 vezes dentro da moldura (5 pixels para dentro). */
const SCENE = { x: 19, y: 25, w: 38, h: 52, zoom: 3 };
const RIGHT = { x: 152, y: 25, w: 322, h: 239 };
/** Abas: a ativa (31 de altura) começa em y 3 e desce pela moldura; a inativa (18) em y 7. */
const TAB = { top: 7, activeTop: 3, height: 18, activeHeight: 31, gap: 2, middle: 16 };
/** O miolo útil do painel da direita. */
const IX0 = 161;
const IX1 = 464;
const TOOL_Y = 36;
/**
 * O seletor de estilo (Aeko | Original) das abas Cabeça e Corpo, em cima da grade (pedido do usuário em
 * 2026-10-18): a grade desce e perde essa altura.
 */
const STYLE_ROW = { y: 59, h: 19 };
const GRID_Y = STYLE_ROW.y + STYLE_ROW.h + 2;
const GRID_LOOK = {
	well: { x: IX0, y: GRID_Y, w: 284, h: 191 - GRID_Y },
	origin: new Vector2(4, 4),
	inset: 1,
	track: { x: 449, y: GRID_Y, w: 10, h: 191 - GRID_Y },
	thumbPad: 3,
	star: new Vector2(28, -2),
	emptyInk: SOFT,
};
const ARTIST = { x: IX0, y: TOOL_Y, w: 112, h: 20 };
/** A faixa de cor embaixo da grade. */
const STRIP = { x: IX0, y: 195, w: IX1 - IX0 + 1, h: 36 };
const STRIP_ROW = (channel: number) => STRIP.y + 2 + channel * 11;
const STRIP_SWATCH = { x: STRIP.x + 186, y: STRIP.y + 15, size: 16, step: 19, count: 6 };
/** O editor das abas de cor: um poço do tamanho da grade e da faixa juntas. */
const EDITOR = { x: IX0, y: 59, w: IX1 - IX0 + 1, h: 172 };
const EDITOR_ROW = (channel: number) => EDITOR.y + 22 + channel * 15;
const EDITOR_SWATCH = { x: EDITOR.x + 10, y: EDITOR.y + 93, size: 16, step: 19, count: 12 };
const GENDER_AREA = { x: IX0, y: 67, w: IX1 - IX0 + 1, h: 132 };
const GENDER_CARD = { w: 112, h: 132, gap: 24 };
const FOOT_Y = 234;

/** A cerca do palco (como no script): duas tábuas, quatro postes, o contorno e a sombra no chão. */
function fenceRects() {
	const top = 22;
	const shadow: FlatRect[] = [
		[0, top + 13, SCENE.w, 1, NIGHT, 90 / 255],
		[0, top + 14, SCENE.w, 1, NIGHT, 50 / 255],
	];
	const outline: FlatRect[] = [];
	const rails: FlatRect[] = [];
	const posts: FlatRect[] = [];
	const caps: FlatRect[] = [];
	for (const y of [top + 3, top + 8]) {
		rails.push(
			[0, y - 1, SCENE.w, 1, W1],
			[0, y, SCENE.w, 1, W6],
			[0, y + 1, SCENE.w, 1, W4],
			[0, y + 2, SCENE.w, 1, W1],
		);
	}
	for (const x of [-1, 11, 23, 35]) {
		outline.push([x - 1, top, 5, 13, W1], [x, top - 1, 3, 15, W1]);
		posts.push([x, top, 1, 13, W6], [x + 1, top, 1, 13, W5], [x + 2, top, 1, 13, W3]);
		caps.push([x, top, 1, 1, W5], [x + 2, top, 1, 1, W4]);
	}
	return { shadow, outline, rails, posts, caps };
}

/** A sombra do boneco no chão: a elipse do script, linha a linha. */
const DOLL_SHADOW: FlatRect[] = [
	[12, 47, 14, 1, NIGHT, 110 / 255],
	[8, 48, 22, 1, NIGHT, 110 / 255],
	[7, 49, 24, 1, NIGHT, 110 / 255],
	[8, 50, 22, 1, NIGHT, 110 / 255],
	[12, 51, 14, 1, NIGHT, 110 / 255],
];

/** A disposição do Celeiro. */
export function CeleiroLayout({ ctx }: { ctx: ReturnType<typeof createCustomize> }) {
	const { k } = ctx;
	const P = makeParts(ctx, ICONS);
	const { at, label } = P;

	// ---------- palco: o mundo de 38×52 com a cerca, flores e o boneco andando no lugar
	const previewLayers = derive(() => figureLayers(ctx.look()));
	const fence = fenceRects();
	const atlasBit = (rx: number, ry: number, w: number, h: number, x: number, y: number, zIndex: number) => (
		<imagelabel
			BackgroundTransparency={1}
			Image={Sprites.daisy.image}
			ImageRectOffset={new Vector2(rx, ry)}
			ImageRectSize={new Vector2(w, h)}
			ResampleMode="Pixelated"
			Position={at(x * SCENE.zoom, y * SCENE.zoom)}
			Size={px(k, w * SCENE.zoom, h * SCENE.zoom)}
			ZIndex={zIndex}
		/>
	);
	const stage = (
		<frame
			Name="Stage"
			BackgroundTransparency={1}
			ClipsDescendants={true}
			Position={at(SCENE.x, SCENE.y)}
			Size={px(k, SCENE.w * SCENE.zoom, SCENE.h * SCENE.zoom)}
			ZIndex={3}
		>
			<imagelabel
				BackgroundTransparency={1}
				Image={GRASS_TILE.image}
				ImageRectOffset={new Vector2(300, 150)}
				ImageRectSize={new Vector2(SCENE.w, SCENE.h)}
				ResampleMode="Pixelated"
				Size={UDim2.fromScale(1, 1)}
				ZIndex={1}
			/>
			{P.rects(fence.shadow, SCENE.zoom, 2)}
			{P.rects(fence.outline, SCENE.zoom, 3)}
			{P.rects(fence.rails, SCENE.zoom, 4)}
			{P.rects(fence.posts, SCENE.zoom, 5)}
			{P.rects(fence.caps, SCENE.zoom, 6)}
			{atlasBit(375, 311, 19, 13, 23, 41, 7)}
			{atlasBit(273, 311, 15, 13, -3, 37, 7)}
			{atlasBit(273, 311, 15, 13, 28, 5, 7)}
			{atlasBit(375, 311, 19, 13, -6, 6, 7)}
			{P.rects(DOLL_SHADOW, SCENE.zoom, 8)}
			<frame
				BackgroundTransparency={1}
				Position={at(-5 * SCENE.zoom, 2 * SCENE.zoom)}
				Size={px(k, 48 * SCENE.zoom, 48 * SCENE.zoom)}
				ZIndex={9}
			>
				{P.figure(
					previewLayers,
					MAX_FIGURE_LAYERS,
					SCENE.zoom,
					9,
					(layer) => layerRect(layer, 1, ctx.walkFrame(), TURN_ORDER[ctx.turn()], ctx.closed()),
					0,
					(layer) => layerPosition(layer, 1, ctx.walkFrame(), TURN_ORDER[ctx.turn()]),
				)}
			</frame>
		</frame>
	);

	// ---------- painel da esquerda
	const title = () => t("customize.titleCaps");
	const titleW = () => textWidth(title(), true) + 20;
	const titleX = () => LEFT.x + math.floor((LEFT.w - titleW()) / 2);
	const randomW = () => 5 + 12 + 4 + textWidth(t("customize.random")) + 6;
	const savedText = () => `${P.savedCount()}/${SAVED_LOOKS}`;

	const left = [
		<imagelabel {...themed("panel", k)} Position={at(LEFT.x, LEFT.y)} Size={px(k, LEFT.w, LEFT.h)} ZIndex={2} />,
		<imagelabel
			{...themed("titleBar", k)}
			Position={() => UDim2.fromOffset(titleX() * k(), 0)}
			Size={() => UDim2.fromOffset(titleW() * k(), 18 * k())}
			ZIndex={5}
		>
			{label(title, 10, 5, DARK, { bold: true, zIndex: 2 })}
		</imagelabel>,
		stage,
		<imagelabel {...themed("stage", k)} Position={at(STAGE.x, STAGE.y)} Size={px(k, STAGE.w, STAGE.h)} ZIndex={4} />,
		P.button({
			kind: "icon",
			box: { x: LEFT.x + 1, y: 150, w: 22, h: 22 },
			icon: () => "iconRotateLeft",
			onPress: () => ctx.rotate(-1),
			tip: () => t("customize.rotate"),
			zIndex: 5,
		}),
		P.button({
			kind: "icon",
			box: { x: LEFT.x + LEFT.w - 23, y: 150, w: 22, h: 22 },
			icon: () => "iconRotateRight",
			onPress: () => ctx.rotate(1),
			tip: () => t("customize.rotate"),
			zIndex: 5,
		}),
		P.button({
			kind: "secondary",
			box: () => ({ x: LEFT.x + 8, y: 189, w: randomW(), h: 20 }),
			icon: () => "iconDice",
			text: () => t("customize.random"),
			gap: 4,
			onPress: ctx.randomize,
			tip: () => t("customize.randomHelp"),
			zIndex: 4,
		}),
		P.button({
			kind: "icon",
			box: { x: LEFT.x + LEFT.w - 8 - 24 - 27, y: 189, w: 24, h: 20 },
			icon: () => "iconUndo",
			onPress: ctx.undo,
			tip: () => t("customize.undo"),
			zIndex: 4,
		}),
		P.button({
			kind: "icon",
			box: { x: LEFT.x + LEFT.w - 8 - 24, y: 189, w: 24, h: 20 },
			icon: () => "iconRedo",
			onPress: ctx.redo,
			tip: () => t("customize.redo"),
			zIndex: 4,
		}),
		P.iconSeen("iconChest", LEFT.x + 8, 212, 4),
		label(() => t("customize.saved"), LEFT.x + 8 + 14 + 4, 215, LABEL, { zIndex: 4 }),
		label(savedText, () => LEFT.x + LEFT.w - 9 - textWidth(savedText()), 215, FAINT, { zIndex: 4 }),
		range(SAVED_LOOKS).map((slot) =>
			P.savedSlot(
				slot,
				{ x: LEFT.x + 8 + slot * 31, y: 226, w: 28, h: 27 },
				{
					empty: "cell",
					clip: { x: 1, y: 1, w: 26, h: 24 },
					figureAt: new Vector2(-11, -8),
					plusAt: new Vector2(6, 5),
				},
				4,
			),
		),
	];

	// ---------- abas centradas, cada uma do tamanho do ícone e do nome
	const tabW = (index: number) => {
		const item = TABS_LIST[index];
		return 4 + (ICONS[item.icon] ?? new Vector2(16, 16)).X + 3 + textWidth(t(item.title)) + 5;
	};
	const tabXs = derive(() => {
		let total = 0;
		for (const index of range(TABS_LIST.size())) total += tabW(index) + (index > 0 ? TAB.gap : 0);
		const xs: number[] = [];
		let x = RIGHT.x + math.floor((RIGHT.w - total) / 2);
		for (const index of range(TABS_LIST.size())) {
			xs.push(x);
			x += tabW(index) + TAB.gap;
		}
		return xs;
	});
	const tabButton = (index: number) => {
		const item = TABS_LIST[index];
		const active = () => ctx.tab() === index;
		const top = () => (active() ? TAB.activeTop : TAB.top);
		const seen = ICONS[item.icon] ?? new Vector2(16, 16);
		return (
			<imagebutton
				{...themed(() => (active() ? "tabActive" : "tab"), k)}
				AutoButtonColor={false}
				Position={() => UDim2.fromOffset(tabXs()[index] * k(), top() * k())}
				Size={() => UDim2.fromOffset(tabW(index) * k(), (active() ? TAB.activeHeight : TAB.height) * k())}
				ZIndex={() => (active() ? 3 : 1)}
				Activated={() => ctx.openTab(index)}
			>
				{P.iconSeen(item.icon, 4, () => TAB.middle - math.floor(seen.Y / 2) - top(), 2)}
				{label(
					() => t(item.title),
					4 + seen.X + 3,
					() => TAB.middle - 3 - top(),
					() => (active() ? DARK : { color: PA3, shadow: W2 }),
					{ zIndex: 3 },
				)}
			</imagebutton>
		);
	};

	// ---------- barra de cima: artista, crédito e favoritos (grades) ou as partes (abas de cor)
	const currentGrid = () => ctx.gridOf(ctx.tab());
	const authorText = () => {
		const grid = currentGrid();
		const name = grid ? P.authorName(grid) : "";
		return name === "" ? t("customize.allArtists") : name;
	};
	const changeAuthor = (step: number) => {
		const grid = currentGrid();
		if (!grid) return;
		ctx.part(0);
		ctx.nextAuthor(grid, step);
	};
	const favoritesW = () => 5 + 13 + 3 + textWidth(t("customize.favorites")) + 6;
	const favoritesX = () => IX1 - favoritesW() + 1;
	const credit = () => P.infoCredit(" · ");
	const pickW = (index: number) => 6 + textWidth(ctx.pickName(index)) + 6;
	const pickX = (index: number) => {
		let x = IX0;
		for (let before = 0; before < index; before++) x += pickW(before) + 4;
		return x;
	};

	const toolbar = [
		<frame BackgroundTransparency={1} Size={UDim2.fromScale(1, 1)} Visible={() => currentGrid() !== undefined} ZIndex={4}>
			{P.button({
				kind: "secondary",
				box: ARTIST,
				icon: () => "iconDropdown",
				text: authorText,
				textX: 6,
				iconX: ARTIST.w - 15,
				onPress: () => changeAuthor(1),
				onSecondary: () => changeAuthor(-1),
				tip: () => t("customize.artistHelp"),
				zIndex: 1,
			})}
			{label(
				credit,
				() => ARTIST.x + ARTIST.w + math.floor((favoritesX() - ARTIST.x - ARTIST.w - textWidth(credit())) / 2),
				TOOL_Y + 6,
				SOFT,
				{ maxChars: 40, zIndex: 1 },
			)}
			{P.button({
				kind: "secondary",
				box: () => ({ x: favoritesX(), y: TOOL_Y, w: favoritesW(), h: 20 }),
				icon: () => "iconStar",
				text: () => t("customize.favorites"),
				iconDy: -1,
				iconFade: () => (ctx.favoritesOnly() ? 0 : 0.55),
				chosen: ctx.favoritesOnly,
				onPress: ctx.toggleFavoritesOnly,
				tip: () => t("customize.favoritesHelp"),
				zIndex: 1,
			})}
		</frame>,
		range(CLOTH_KEYS.size()).map((index) =>
			P.button({
				kind: "secondary",
				box: () => ({ x: pickX(index), y: TOOL_Y, w: pickW(index), h: 20 }),
				text: () => ctx.pickName(index),
				chosen: () => ctx.pickValue() === index,
				visible: () => ctx.tab() >= 3 && index < ctx.pickCount(),
				onPress: () => {
					ctx.part(2);
					ctx.cursor(index);
					ctx.setPick(index);
				},
				zIndex: 4,
			}),
		),
	];

	// ---------- faixa de cor das grades: cabelo na aba Cabeça, a parte da roupa na aba Corpo
	const hexPlain = P.hexText(false);
	const originalW = () => textWidth(t("customize.originalShort"));
	const strip = (
		<frame BackgroundTransparency={1} Size={UDim2.fromScale(1, 1)} Visible={() => currentGrid() !== undefined} ZIndex={4}>
			<imagelabel {...themed("well", k)} Position={at(STRIP.x, STRIP.y)} Size={px(k, STRIP.w, STRIP.h)} ZIndex={1} />
			<frame BackgroundTransparency={1} Size={UDim2.fromScale(1, 1)} Visible={ctx.paintable} ZIndex={2}>
				{label(() => t(ctx.colorTitle()), STRIP.x + 6, STRIP.y + 4, LABEL, { zIndex: 2 })}
				{P.swatch({ x: STRIP.x + 6, y: STRIP.y + 13, w: 22, h: 22 }, 3, 2)}
				{label(hexPlain, STRIP.x + 32, STRIP.y + 21, SOFT, { zIndex: 2 })}
				{range(3).map((channel) => {
					const y = STRIP_ROW(channel);
					return [
						label(() => CHANNEL_NAMES[channel], STRIP.x + 76, y + 2, LABEL, { maxChars: 2, zIndex: 2 }),
						...P.channelTrack(channel, { x: STRIP.x + 84, y: y + 2, w: 76, h: 7 }, 3, 1),
						label(P.channelValue(channel), STRIP.x + 164, y + 2, LABEL, { maxChars: 4, zIndex: 2 }),
					];
				})}
				{label(() => t("customize.presets"), STRIP.x + 184, STRIP.y + 4, LABEL, { zIndex: 2 })}
				{label(
					() => t("customize.originalShort"),
					() => STRIP.x + STRIP.w - 7 - originalW(),
					STRIP.y + 4,
					SOFT,
					{ zIndex: 2 },
				)}
				{P.icon("originalMark", () => STRIP.x + STRIP.w - 7 - originalW() - 8, STRIP.y + 4, 2)}
				{range(STRIP_SWATCH.count).map((index) =>
					P.preset(index, STRIP_SWATCH.x + index * STRIP_SWATCH.step, STRIP_SWATCH.y, STRIP_SWATCH.size, 3, {
						chosenOutset: 2,
						mark: new Vector2(10, 0),
					}),
				)}
			</frame>
			{label(() => t("customize.nothingToPaint"), STRIP.x + 6, STRIP.y + 15, SOFT, {
				maxChars: 64,
				zIndex: 2,
				visible: () => !ctx.paintable(),
			})}
		</frame>
	);

	// ---------- editor das abas Cabelo, Rosto e Roupa
	const restoreW = () => 5 + 15 + 3 + textWidth(t("customize.restore")) + 6;
	const editor = (
		<frame BackgroundTransparency={1} Size={UDim2.fromScale(1, 1)} Visible={() => ctx.tab() >= 3} ZIndex={4}>
			<imagelabel {...themed("well", k)} Position={at(EDITOR.x, EDITOR.y)} Size={px(k, EDITOR.w, EDITOR.h)} ZIndex={1} />
			{label(credit, () => EDITOR.x + EDITOR.w - 8 - textWidth(credit()), EDITOR.y + 8, SOFT, {
				maxChars: 40,
				zIndex: 2,
			})}
			<frame BackgroundTransparency={1} Size={UDim2.fromScale(1, 1)} Visible={ctx.paintable} ZIndex={2}>
				{label(() => t(ctx.colorTitle()), EDITOR.x + 8, EDITOR.y + 8, LABEL, { zIndex: 2 })}
				{P.swatch({ x: EDITOR.x + 8, y: EDITOR.y + 21, w: 44, h: 44 }, 3, 2)}
				{label(hexPlain, () => EDITOR.x + 30 - math.floor(textWidth(hexPlain()) / 2), EDITOR.y + 70, SOFT, {
					zIndex: 2,
				})}
				{range(3).map((channel) => {
					const y = EDITOR_ROW(channel);
					return [
						label(() => CHANNEL_NAMES[channel], EDITOR.x + 64, y + 2, LABEL, { maxChars: 2, zIndex: 2 }),
						...P.channelTrack(channel, { x: EDITOR.x + 74, y: y + 2, w: 180, h: 7 }, 3, 1),
						label(P.channelValue(channel), EDITOR.x + 258, y + 2, LABEL, { maxChars: 4, zIndex: 2 }),
					];
				})}
				{label(() => t("customize.presetsLong"), EDITOR.x + 8, EDITOR.y + 81, LABEL, { zIndex: 2 })}
				{range(EDITOR_SWATCH.count).map((index) =>
					P.preset(index, EDITOR_SWATCH.x + index * EDITOR_SWATCH.step, EDITOR_SWATCH.y, EDITOR_SWATCH.size, 3, {
						chosenOutset: 2,
						mark: new Vector2(10, 0),
					}),
				)}
				{P.icon("originalMark", EDITOR.x + 8, EDITOR.y + 122, 2)}
				{label(() => t("customize.originalLegend"), EDITOR.x + 16, EDITOR.y + 121, SOFT, { zIndex: 2 })}
				{label(() => t("customize.colorHint"), EDITOR.x + 8, EDITOR.y + 150, SOFT, { maxChars: 48, zIndex: 2 })}
				{P.button({
					kind: "secondary",
					box: () => ({ x: EDITOR.x + EDITOR.w - 8 - restoreW(), y: EDITOR.y + 144, w: restoreW(), h: 20 }),
					icon: () => "iconRotateLeft",
					text: () => t("customize.restore"),
					onPress: ctx.restore,
					zIndex: 3,
				})}
			</frame>
			{label(() => t("customize.nothingToPaint"), EDITOR.x + 8, EDITOR.y + 21, SOFT, {
				width: EDITOR.w - 16,
				wrap: true,
				maxChars: 64,
				zIndex: 2,
				visible: () => !ctx.paintable(),
			})}
		</frame>
	);

	// ---------- rodapé: a etiqueta e o campo do nome, Voltar e Continuar
	const tagW = () => 9 + textWidth(t("customize.name")) + 5;
	const continueW = () => 7 + textWidth(t("common.continue")) + 3 + 10 + 5;
	const backW = () => 5 + 10 + 3 + textWidth(t("common.back")) + 7;
	const continueX = () => IX1 - continueW() + 1;
	const footer = [
		<imagelabel
			{...themed("nameTag", k)}
			Position={at(IX0, FOOT_Y + 3)}
			Size={() => UDim2.fromOffset(tagW() * k(), 13 * k())}
			ZIndex={4}
		>
			{label(() => t("customize.name"), 9, 3, DARK, { zIndex: 2 })}
		</imagelabel>,
		P.nameField(
			() => ({ x: IX0 + tagW() + 3, y: FOOT_Y, w: 116, h: 19 }),
			{ ink: DARK, placeholder: FAINT, padX: 6, textY: 6, caretGap: 2, caretY: 5 },
			4,
		),
		P.button({
			kind: "secondary",
			box: () => ({ x: continueX() - 5 - backW(), y: FOOT_Y, w: backW(), h: 20 }),
			icon: () => "iconBack",
			text: () => t("common.back"),
			contentX: 5,
			onPress: () => ctx.onDone(false),
			zIndex: 4,
		}),
		P.button({
			kind: "primary",
			box: () => ({ x: continueX(), y: FOOT_Y, w: continueW(), h: 20 }),
			icon: () => "iconNext",
			iconRight: true,
			text: () => t("common.continue"),
			contentX: 7,
			onPress: () => ctx.onDone(true),
			zIndex: 4,
		}),
	];

	/** Onde está o foco do teclado. */
	const focus = () => {
		const tab = ctx.tab();
		const part = ctx.part();
		if (tab === 0) return P.genderFocus(GENDER_AREA, GENDER_CARD);
		if (part === 0) return ARTIST;
		if (part === 1) return tab <= 2 ? P.gridFocus(tab, GRID_LOOK) : undefined;
		if (part === 2) return { x: pickX(ctx.cursor()), y: TOOL_Y, w: pickW(ctx.cursor()), h: 20 };
		if (!ctx.paintable()) return undefined;
		const onStrip = tab <= 2;
		if (part === 6) {
			const swatches = onStrip ? STRIP_SWATCH : EDITOR_SWATCH;
			return {
				x: swatches.x + ctx.cursor() * swatches.step,
				y: swatches.y,
				w: swatches.size,
				h: swatches.size,
			};
		}
		const channel = part - 3;
		return onStrip
			? { x: STRIP.x + 74, y: STRIP_ROW(channel), w: 108, h: 11 }
			: { x: EDITOR.x + 60, y: EDITOR_ROW(channel) - 1, w: 220, h: 13 };
	};

	const root = (
		<frame Name="Barn" BackgroundTransparency={1} Size={UDim2.fromScale(1, 1)} ZIndex={2}>
			{left}
			{range(TABS_LIST.size()).map(tabButton)}
			<imagelabel {...themed("panel", k)} Position={at(RIGHT.x, RIGHT.y)} Size={px(k, RIGHT.w, RIGHT.h)} ZIndex={2} />
			{toolbar}
			<frame BackgroundTransparency={1} Size={UDim2.fromScale(1, 1)} Visible={() => ctx.tab() === 0} ZIndex={4}>
				{P.genderCards(GENDER_AREA, GENDER_CARD, DARK, 1)}
			</frame>
			<frame BackgroundTransparency={1} Size={UDim2.fromScale(1, 1)} Visible={() => ctx.tab() === 1} ZIndex={4}>
				{P.styleSwitch(1, IX0, STYLE_ROW.y, STYLE_ROW.h, { labelInk: LABEL, zIndex: 1 })}
				{P.grid(1, GRID_LOOK, 1)}
			</frame>
			<frame BackgroundTransparency={1} Size={UDim2.fromScale(1, 1)} Visible={() => ctx.tab() === 2} ZIndex={4}>
				{P.styleSwitch(2, IX0, STYLE_ROW.y, STYLE_ROW.h, { labelInk: LABEL, zIndex: 1 })}
				{P.grid(2, GRID_LOOK, 1)}
			</frame>
			{strip}
			{editor}
			{footer}
			{P.cursorFrame(focus, 8)}
		</frame>
	) as Frame;

	// Nas grades, a faixa mostra a original e 5 cores prontas; no editor, 12.
	ctx.useLayout({
		colorStrip: true,
		swatchLimit: () => (ctx.tab() <= 2 ? STRIP_SWATCH.count : EDITOR_SWATCH.count),
	});
	// O Show só tira a disposição do lugar quando o tema muda; destrói no fim do quadro (ver CLAUDE.md).
	cleanup(() => task.defer(() => root.Destroy()));
	return root;
}
