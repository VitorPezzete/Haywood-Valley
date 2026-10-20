// A tela de personalizar no Clássico (tema graal), igual à prancha B (Aseprite/ui_propostas/B_graal,
// tela_personalizar_B.png e tela_personalizar_B_cor.png, desenhadas por draw_ui_B.lua): à esquerda,
// a janela do personagem (a placa do título, o palco com a cerca, o nome e os visuais salvos); à
// direita, a janela com as abas em cima, a barra de ferramentas (favoritos e artista, ou as partes
// da aba de cor, e o dado, desfazer e refazer), a grade ou o cartão de cor, a linha de informação, as
// teclas e Voltar e Continuar. Medidas e cores tiradas do script.

import Vide, { cleanup, derive } from "@rbxts/vide";
import { CLOTH_KEYS } from "shared/appearance";
import { SAVED_LOOKS } from "shared/playerData";
import { figureLayers, layerPosition, layerRect, MAX_FIGURE_LAYERS, TURN_ORDER } from "client/world/graalArt";
import { GRASS_TILE, Sprites } from "client/world/sprites";
import { keyName, t } from "../i18n";
import { px } from "../kit";
import { textWidth } from "../pixelText";
import { metric, themed } from "../theme";
import { ThemePieceName } from "../themes/types";
import { makeParts } from "./parts";
import { createCustomize, range, TABS_LIST } from "./state";

type FlatRect = [number, number, number, number, Color3, number?];

// Paleta Ponte, como no script.
const hex = (value: string) => Color3.fromHex(value);
const INK = hex("#0A0F0C");
const N0 = hex("#0E1913");
const C0 = hex("#8F93A0");
const C1 = hex("#C9CBD4");
const C2 = hex("#F4EEDC");
/** mix(C2, branco, 0,6): o texto dos botões de pervinca. */
const C3 = Color3.fromRGB(251, 248, 241);
const O4 = hex("#FFDD7C");
const V0 = hex("#211E45");
const V1 = hex("#34357A");
const V2 = hex("#5A62B4");
const M1 = hex("#1E4D36");
/** mix(F2, C2, 0,55): a sombra do texto dos botões verdes. */
const F3 = Color3.fromRGB(199, 229, 177);
const PLACEHOLDER = hex("#696A80");
const CHANNEL_INK = [Color3.fromRGB(226, 84, 72), hex("#8FDB7C"), hex("#B6BBF2")];
const CHANNEL_NAMES = ["R", "G", "B"];
/** A madeira do mundo (P.R.wood do hv_paint.lua), do escuro ao claro. */
const WOOD = [hex("#3A2024"), hex("#5E3428"), hex("#865032"), hex("#AE7444"), hex("#D29C5E"), hex("#EEC488")];

const TEXT = { color: C2, shadow: INK };
const LIGHT = { color: C1, shadow: INK };
const SOFT = { color: C0, shadow: INK };
/** Texto dos botões: creme com sombra violeta nos de pervinca, tinta com sombra clara nos verdes. */
const buttonInk = (main: boolean) => (main ? { color: INK, shadow: F3 } : { color: C3, shadow: V0 });

/** O tamanho do desenho de cada ícone (a folha guarda todos num quadro de 16). */
const ICONS: Partial<Record<ThemePieceName, Vector2>> = {
	iconDice: new Vector2(14, 14),
	iconUndo: new Vector2(14, 14),
	iconRedo: new Vector2(14, 14),
	iconRotateLeft: new Vector2(14, 15),
	iconRotateRight: new Vector2(14, 15),
	iconStar: new Vector2(14, 13),
	iconChest: new Vector2(16, 13),
	iconPlus: new Vector2(13, 13),
	iconBack: new Vector2(14, 14),
	iconNext: new Vector2(14, 14),
	iconDropdown: new Vector2(12, 7),
	iconGender: new Vector2(16, 14),
	iconHead: new Vector2(14, 14),
	iconBody: new Vector2(14, 14),
	iconHair: new Vector2(14, 14),
	iconFace: new Vector2(14, 14),
	iconOutfit: new Vector2(14, 13),
};

// Medidas da prancha, em pixels de arte.
const LEFT = { x: 4, y: 9, w: 146, h: 254 };
const STAGE = { x: 12, y: 19, w: 130, h: 154 };
/** O palco: um pedaço do mundo de 42×50, ampliado 3 vezes dentro do poço. */
const SCENE = { x: 14, y: 21, w: 42, h: 50, zoom: 3 };
const RIGHT = { x: 155, y: 34, w: 321, h: 229 };
/** Abas: a inativa começa em y 5; a ativa sobe a 2 e entra 5 no painel. */
const TAB = { x: 165, step: 50, w: 48, top: 5, activeTop: 2 };
/** O miolo da janela da direita. */
const IX = 163;
const IY = 42;
const IR = 467;
/** A área da grade e do cartão de cor. */
const AREA = { x: IX, y: 67, w: IR - IX + 1, h: 148 };
/**
 * O seletor de estilo (Aeko | Original) das abas Cabeça e Corpo, no alto da área, em cima da grade (pedido
 * do usuário em 2026-10-18): a grade fica com o resto.
 */
const STYLE_ROW = { y: AREA.y, h: 20 };
const GRID_Y = STYLE_ROW.y + STYLE_ROW.h + 2;
const GRID_WELL = { x: AREA.x, y: GRID_Y, w: AREA.w, h: AREA.y + AREA.h - GRID_Y };
const GRID_LOOK = {
	well: GRID_WELL,
	origin: new Vector2(6, 5),
	inset: 2,
	track: { x: 453, y: GRID_WELL.y + 3, w: 12, h: GRID_WELL.h - 6 },
	thumbPad: 2,
	star: new Vector2(26, -1),
	emptyInk: LIGHT,
};
const GENDER_AREA = { x: AREA.x, y: AREA.y + 4, w: AREA.w, h: 140 };
const GENDER_CARD = { w: 112, h: 140, gap: 24 };
/** As ferramentas, no canto da barra: dado, desfazer e refazer. */
const TOOLS_X = 402;
const TOOL_STEP = 23;
/** As fileiras R, G e B do cartão de cor, e as cores prontas. */
const ROW_Y = (channel: number) => AREA.y + 10 + channel * 19;
const SWATCH = { x: AREA.x + 66, y: AREA.y + 90, size: 16, step: 19, count: 12 };
const FOOT_Y = 234;

/** A cerca do palco (a `fence` do script): tábuas, contorno e a sombra no chão, em pixels do palco. */
function fenceRects() {
	const shadow: FlatRect[] = [[0, 15, SCENE.w, 2, N0, 90 / 255]];
	const outline: FlatRect[] = [];
	const rails: FlatRect[] = [];
	const posts: FlatRect[] = [];
	const rows = [WOOD[0], WOOD[4], WOOD[3], WOOD[2], WOOD[0]];
	rows.forEach((color, row) => {
		rails.push([0, 5 + row, SCENE.w, 1, color]);
		rails.push([0, 10 + row, SCENE.w, 1, color]);
	});
	for (const x of [1, 13, 25, 37]) {
		shadow.push([x - 1, 17, 1, 1, N0, 90 / 255], [x + 3, 17, 1, 1, N0, 90 / 255], [x, 17, 3, 2, N0, 90 / 255]);
		outline.push([x - 1, 4, 5, 12, WOOD[0]], [x, 3, 3, 14, WOOD[0]], [x + 1, 2, 1, 1, WOOD[0]]);
		posts.push([x, 4, 1, 12, WOOD[4]], [x + 1, 3, 1, 13, WOOD[3]], [x + 2, 4, 1, 12, WOOD[2]]);
	}
	return { shadow, outline, rails, posts };
}

/** Quebra `text` em duas linhas: as palavras que cabem em `width` e o resto. */
function twoLines(text: string, width: number) {
	const words = text.split(" ");
	let first = "";
	let used = 0;
	for (const word of words) {
		const trial = first === "" ? word : `${first} ${word}`;
		if (first !== "" && textWidth(trial) > width) break;
		first = trial;
		used++;
	}
	const rest: string[] = [];
	for (let index = used; index < words.size(); index++) rest.push(words[index]);
	return [first, rest.join(" ")] as const;
}

/** A disposição do Clássico. */
export function GraalLayout({ ctx }: { ctx: ReturnType<typeof createCustomize> }) {
	const { k } = ctx;
	const P = makeParts(ctx, ICONS);
	const { at, label } = P;

	// ---------- palco: o mundo de 42×50 com a cerca, flores e o boneco andando no lugar
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
				ImageRectOffset={new Vector2(212, 96)}
				ImageRectSize={new Vector2(SCENE.w, SCENE.h)}
				ResampleMode="Pixelated"
				Size={UDim2.fromScale(1, 1)}
				ZIndex={1}
			/>
			{P.rects(fence.shadow, SCENE.zoom, 2)}
			{P.rects(fence.outline, SCENE.zoom, 3)}
			{P.rects(fence.rails, SCENE.zoom, 4)}
			{P.rects(fence.posts, SCENE.zoom, 5)}
			{atlasBit(375, 311, 5, 13, 2, 12, 6)}
			{atlasBit(274, 311, 5, 13, 36, 14, 6)}
			{atlasBit(168, 311, 12, 14, -3, 36, 6)}
			{atlasBit(220, 311, 14, 14, 33, 37, 6)}
			{atlasBit(397, 311, 5, 13, 38, 30, 6)}
			{atlasBit(62, 337, 24, 6, 9, 43, 7)}
			<frame
				BackgroundTransparency={1}
				Position={at(-3 * SCENE.zoom, 1 * SCENE.zoom)}
				Size={px(k, 48 * SCENE.zoom, 48 * SCENE.zoom)}
				ZIndex={8}
			>
				{P.figure(
					previewLayers,
					MAX_FIGURE_LAYERS,
					SCENE.zoom,
					8,
					(layer) => layerRect(layer, 1, ctx.walkFrame(), TURN_ORDER[ctx.turn()], ctx.closed()),
					0,
					(layer) => layerPosition(layer, 1, ctx.walkFrame(), TURN_ORDER[ctx.turn()]),
				)}
			</frame>
		</frame>
	);

	// ---------- janela da esquerda
	const title = () => t("customize.title");
	const plateW = () => textWidth(title(), true) + 26;
	const plateX = () => LEFT.x + math.floor((LEFT.w - plateW()) / 2);
	const savedText = () => `${P.savedCount()}/${SAVED_LOOKS}`;

	const left = [
		<imagelabel {...themed("panel", k)} Position={at(LEFT.x, LEFT.y)} Size={px(k, LEFT.w, LEFT.h)} ZIndex={2} />,
		<imagelabel
			{...themed("titleBar", k)}
			Position={() => UDim2.fromOffset(plateX() * k(), 2 * k())}
			Size={() => UDim2.fromOffset(plateW() * k(), 15 * k())}
			ZIndex={5}
		>
			{label(title, 13, 4, { color: O4, shadow: INK }, { bold: true, zIndex: 2 })}
		</imagelabel>,
		stage,
		<imagelabel {...themed("stage", k)} Position={at(STAGE.x, STAGE.y)} Size={px(k, STAGE.w, STAGE.h)} ZIndex={4} />,
		P.button({
			kind: "icon",
			box: { x: STAGE.x + 5, y: 150, w: 20, h: 20 },
			icon: () => "iconRotateLeft",
			onPress: () => ctx.rotate(-1),
			tip: () => t("customize.rotate"),
			zIndex: 5,
		}),
		P.button({
			kind: "icon",
			box: { x: STAGE.x + STAGE.w - 25, y: 150, w: 20, h: 20 },
			icon: () => "iconRotateRight",
			onPress: () => ctx.rotate(1),
			tip: () => t("customize.rotate"),
			zIndex: 5,
		}),
		label(() => t("customize.name"), 13, 182, LIGHT, { zIndex: 4 }),
		P.nameField(
			{ x: 38, y: 176, w: 104, h: 18 },
			{
				ink: TEXT,
				placeholder: { color: PLACEHOLDER, shadow: INK },
				padX: 5,
				textY: 6,
				caretGap: 1,
				caretY: 4,
			},
			4,
		),
		P.rects(
			[
				[12, 198, 130, 1, INK],
				[12, 199, 130, 1, V1],
			],
			1,
			4,
		),
		P.iconSeen("iconChest", 12, 202, 4),
		label(() => t("customize.saved"), 31, 206, TEXT, { zIndex: 4 }),
		label(savedText, () => 142 - textWidth(savedText()), 206, SOFT, { zIndex: 4 }),
		range(SAVED_LOOKS).map((slot) =>
			P.savedSlot(
				slot,
				{ x: 12 + slot * 33, y: 218, w: 31, h: 36 },
				{
					empty: "well",
					clip: { x: 2, y: 2, w: 27, h: 32 },
					figureAt: new Vector2(-10, -2),
					plusAt: new Vector2(8, 10),
					plusTint: V2,
				},
				4,
			),
		),
	];

	// ---------- abas: a inativa fica atrás da janela; a ativa, na frente, entrando nela
	const tabButton = (index: number) => {
		const item = TABS_LIST[index];
		const active = () => ctx.tab() === index;
		const top = () => (active() ? TAB.activeTop : TAB.top);
		const seen = ICONS[item.icon] ?? new Vector2(16, 16);
		const text = () => t(item.title);
		return (
			<imagebutton
				{...themed(() => (active() ? "tabActive" : "tab"), k)}
				AutoButtonColor={false}
				Position={() => UDim2.fromOffset((TAB.x + index * TAB.step) * k(), top() * k())}
				Size={() =>
					UDim2.fromOffset(TAB.w * k(), (active() ? metric("tabActiveHeight") : metric("tabHeight")) * k())
				}
				ZIndex={() => (active() ? 3 : 1)}
				Activated={() => ctx.openTab(index)}
			>
				{P.iconSeen(
					item.icon,
					math.floor((TAB.w - seen.X) / 2),
					() => TAB.activeTop + (active() ? 8 : 7) + math.floor((14 - seen.Y) / 2) - top(),
					2,
					{ transparency: () => (active() ? 0 : 0.45) },
				)}
				{label(
					text,
					() => TAB.w / 2 - math.floor(textWidth(text()) / 2),
					() => 25 - top(),
					() => ({ color: active() ? O4 : C0, shadow: INK }),
					{ zIndex: 3 },
				)}
			</imagebutton>
		);
	};

	// ---------- barra de ferramentas
	const currentGrid = () => ctx.gridOf(ctx.tab());
	const authorText = () => {
		const grid = currentGrid();
		const name = grid ? P.authorName(grid) : "";
		return t("customize.artist", { name: name === "" ? t("customize.everyone") : name });
	};
	const changeAuthor = (step: number) => {
		const grid = currentGrid();
		if (!grid) return;
		ctx.part(0);
		ctx.nextAuthor(grid, step);
	};
	const pickW = () => math.min(48, math.floor(238 / math.max(ctx.pickCount(), 1)) - 2);

	const toolbar = [
		<frame BackgroundTransparency={1} Size={UDim2.fromScale(1, 1)} Visible={() => currentGrid() !== undefined} ZIndex={4}>
			{P.button({
				kind: "secondary",
				box: { x: IX, y: IY, w: 76, h: 20 },
				icon: () => "starOn",
				text: () => t("customize.onlyFavorites"),
				ink: buttonInk,
				chosen: ctx.favoritesOnly,
				chosenStyle: "pressed",
				onPress: ctx.toggleFavoritesOnly,
				tip: () => t("customize.favoritesHelp"),
				zIndex: 1,
			})}
			<imagebutton
				{...themed("textField", k)}
				AutoButtonColor={false}
				Position={at(IX + 80, IY + 1)}
				Size={px(k, 108, 18)}
				ZIndex={1}
				MouseEnter={(x, y) => ctx.showHint(t("customize.artistHelp"), x, y)}
				MouseLeave={() => ctx.tooltip(undefined)}
				Activated={() => changeAuthor(1)}
				InputBegan={(input) => {
					if (input.UserInputType === Enum.UserInputType.MouseButton2) changeAuthor(-1);
				}}
			>
				{label(authorText, 5, 5, TEXT, { zIndex: 2 })}
				{label(() => "▾", 98, 6, LIGHT, { zIndex: 2 })}
			</imagebutton>
		</frame>,
		range(CLOTH_KEYS.size()).map((index) =>
			P.button({
				kind: "secondary",
				box: () => ({ x: IX + index * (pickW() + 2), y: IY, w: pickW(), h: 20 }),
				text: () => ctx.pickName(index),
				ink: buttonInk,
				chosen: () => ctx.pickValue() === index,
				chosenStyle: "pressed",
				visible: () => ctx.tab() >= 3 && index < ctx.pickCount(),
				onPress: () => {
					ctx.part(2);
					ctx.cursor(index);
					ctx.setPick(index);
				},
				zIndex: 4,
			}),
		),
		P.button({
			kind: "icon",
			box: { x: TOOLS_X, y: IY, w: 20, h: 20 },
			icon: () => "iconDice",
			onPress: ctx.randomize,
			tip: () => t("customize.random"),
			zIndex: 4,
		}),
		P.button({
			kind: "icon",
			box: { x: TOOLS_X + TOOL_STEP, y: IY, w: 20, h: 20 },
			icon: () => "iconUndo",
			onPress: ctx.undo,
			tip: () => t("customize.undo"),
			zIndex: 4,
		}),
		P.button({
			kind: "icon",
			box: { x: TOOLS_X + TOOL_STEP * 2, y: IY, w: 20, h: 20 },
			icon: () => "iconRedo",
			onPress: ctx.redo,
			tip: () => t("customize.redo"),
			zIndex: 4,
		}),
	];

	// ---------- cartão de cor das abas Cabelo, Rosto e Roupa
	const partName = () => ctx.pickName(ctx.pickValue());
	const hex6 = P.hexText(true);
	const hint = derive(() => twoLines(t("customize.colorHint"), 76));
	const colorCard = (
		<frame BackgroundTransparency={1} Size={UDim2.fromScale(1, 1)} Visible={() => ctx.tab() >= 3} ZIndex={4}>
			<imagelabel {...themed("card", k)} Position={at(AREA.x, AREA.y)} Size={px(k, AREA.w, AREA.h)} ZIndex={1} />
			<frame BackgroundTransparency={1} Size={UDim2.fromScale(1, 1)} Visible={ctx.paintable} ZIndex={2}>
				{P.swatch({ x: AREA.x + 10, y: AREA.y + 10, w: 44, h: 44 }, 1, 1)}
				{label(partName, () => AREA.x + 32 - math.floor(textWidth(partName()) / 2), AREA.y + 60, TEXT, {
					zIndex: 3,
				})}
				{label(hex6, () => AREA.x + 32 - math.floor(textWidth(hex6()) / 2), AREA.y + 71, SOFT, { zIndex: 3 })}
				{range(3).map((channel) => {
					const y = ROW_Y(channel);
					const value = P.channelValue(channel);
					return [
						...P.outlinedLabel(CHANNEL_NAMES[channel], AREA.x + 66, y + 3, CHANNEL_INK[channel], INK, 3),
						...P.channelTrack(channel, { x: AREA.x + 76, y: y + 2, w: 168, h: 10 }, 3, 2),
						<imagelabel {...themed("textField", k)} Position={at(AREA.x + 250, y)} Size={px(k, 30, 14)} ZIndex={3} />,
						label(value, () => AREA.x + 276 - textWidth(value()), y + 4, TEXT, { zIndex: 4 }),
					];
				})}
				{label(() => t("customize.presetsLong"), AREA.x + 66, AREA.y + 78, TEXT, { zIndex: 3 })}
				{range(SWATCH.count).map((index) =>
					P.preset(index, SWATCH.x + index * SWATCH.step, SWATCH.y, SWATCH.size, 3, {
						chosenOutset: 0,
						mark: new Vector2(-3, -3),
					}),
				)}
				{P.icon("originalMark", AREA.x + 66, AREA.y + 114, 3)}
				{label(() => t("customize.originalLegend"), AREA.x + 76, AREA.y + 114, LIGHT, { zIndex: 3 })}
				{P.button({
					kind: "secondary",
					box: { x: AREA.x + AREA.w - 92, y: AREA.y + AREA.h - 30, w: 82, h: 20 },
					icon: () => "iconRotateLeft",
					text: () => t("customize.restore"),
					ink: buttonInk,
					onPress: ctx.restore,
					zIndex: 3,
				})}
				{label(() => hint()[0], AREA.x + 10, AREA.y + AREA.h - 22, SOFT, { maxChars: 40, zIndex: 3 })}
				{label(() => hint()[1], AREA.x + 10, AREA.y + AREA.h - 12, SOFT, { maxChars: 40, zIndex: 3 })}
			</frame>
			{label(() => t("customize.nothingToPaint"), AREA.x + 10, AREA.y + 10, LIGHT, {
				width: AREA.w - 20,
				wrap: true,
				maxChars: 64,
				zIndex: 2,
				visible: () => !ctx.paintable(),
			})}
		</frame>
	);

	// ---------- linha de informação, teclas e botões finais
	const infoRight = () => {
		const grid = currentGrid();
		if (grid) {
			return t(grid.kind === "head" ? "customize.countHeads" : "customize.countBodies", {
				n: ctx.listOf(grid).size(),
			});
		}
		return ctx.tab() >= 3 ? t(ctx.colorTitle()) : "";
	};
	const keyText = [
		() => keyName(Enum.KeyCode.Q),
		() => keyName(Enum.KeyCode.E),
		() => keyName(Enum.KeyCode.Space),
	];
	/** Tecla de uma letra tem 11 de largura; a de palavra, o texto e 4 de cada lado. */
	const keyW = (text: string) => (text.size() <= 1 ? math.max(11, textWidth(text) + 6) : textWidth(text) + 8);
	const keyX: (() => number)[] = [
		() => IX + 2,
		() => IX + 2 + keyW(keyText[0]()) + 2,
		() => keyX[1]() + keyW(keyText[1]()) + 4 + textWidth(t("hint.tabs")) + 8,
	];
	const keyCap = (slot: number) => (
		<imagelabel
			{...themed("key", k)}
			Position={() => UDim2.fromOffset(keyX[slot]() * k(), (FOOT_Y + 3) * k())}
			Size={() => UDim2.fromOffset(keyW(keyText[slot]()) * k(), 14 * k())}
			ZIndex={4}
		>
			{label(
				keyText[slot],
				() => math.floor((keyW(keyText[slot]()) - textWidth(keyText[slot]())) / 2),
				2,
				TEXT,
				{ zIndex: 2 },
			)}
		</imagelabel>
	);
	const footer = [
		label(() => P.infoCredit("  "), IX + 2, AREA.y + AREA.h + 5, LIGHT, { maxChars: 40, zIndex: 4 }),
		label(infoRight, () => IR - 1 - textWidth(infoRight()), AREA.y + AREA.h + 5, SOFT, { zIndex: 4 }),
		keyCap(0),
		keyCap(1),
		label(() => t("hint.tabs"), () => keyX[1]() + keyW(keyText[1]()) + 4, FOOT_Y + 6, SOFT, { zIndex: 4 }),
		keyCap(2),
		label(() => t("hint.choose"), () => keyX[2]() + keyW(keyText[2]()) + 4, FOOT_Y + 6, SOFT, { zIndex: 4 }),
		P.button({
			kind: "secondary",
			box: { x: IR - 86 - 4 - 66 + 1, y: FOOT_Y, w: 66, h: 20 },
			icon: () => "iconBack",
			text: () => t("common.back"),
			ink: buttonInk,
			onPress: () => ctx.onDone(false),
			zIndex: 4,
		}),
		P.button({
			kind: "primary",
			box: { x: IR - 86 + 1, y: FOOT_Y, w: 86, h: 20 },
			icon: () => "iconNext",
			iconRight: true,
			iconTint: () => M1,
			text: () => t("common.continue"),
			ink: buttonInk,
			onPress: () => ctx.onDone(true),
			zIndex: 4,
		}),
	];

	/** Onde está o foco do teclado. */
	const focus = () => {
		const tab = ctx.tab();
		const part = ctx.part();
		if (tab === 0) return P.genderFocus(GENDER_AREA, GENDER_CARD);
		if (tab <= 2) return part === 0 ? { x: IX + 80, y: IY + 1, w: 108, h: 18 } : P.gridFocus(tab, GRID_LOOK);
		if (part === 2) return { x: IX + ctx.cursor() * (pickW() + 2), y: IY, w: pickW(), h: 20 };
		if (!ctx.paintable()) return undefined;
		if (part === 6) {
			return { x: SWATCH.x + ctx.cursor() * SWATCH.step, y: SWATCH.y, w: SWATCH.size, h: SWATCH.size };
		}
		return { x: AREA.x + 62, y: ROW_Y(part - 3) - 2, w: 222, h: 18 };
	};

	const root = (
		<frame Name="Classic" BackgroundTransparency={1} Size={UDim2.fromScale(1, 1)} ZIndex={2}>
			{left}
			{range(TABS_LIST.size()).map(tabButton)}
			<imagelabel {...themed("panel", k)} Position={at(RIGHT.x, RIGHT.y)} Size={px(k, RIGHT.w, RIGHT.h)} ZIndex={2} />
			{toolbar}
			<frame BackgroundTransparency={1} Size={UDim2.fromScale(1, 1)} Visible={() => ctx.tab() === 0} ZIndex={4}>
				{P.genderCards(GENDER_AREA, GENDER_CARD, TEXT, 1)}
			</frame>
			<frame BackgroundTransparency={1} Size={UDim2.fromScale(1, 1)} Visible={() => ctx.tab() === 1} ZIndex={4}>
				{P.styleSwitch(1, IX + 2, STYLE_ROW.y, STYLE_ROW.h, {
					labelInk: TEXT,
					ink: buttonInk,
					chosenStyle: "pressed",
					zIndex: 1,
				})}
				{P.grid(1, GRID_LOOK, 1)}
			</frame>
			<frame BackgroundTransparency={1} Size={UDim2.fromScale(1, 1)} Visible={() => ctx.tab() === 2} ZIndex={4}>
				{P.styleSwitch(2, IX + 2, STYLE_ROW.y, STYLE_ROW.h, {
					labelInk: TEXT,
					ink: buttonInk,
					chosenStyle: "pressed",
					zIndex: 1,
				})}
				{P.grid(2, GRID_LOOK, 1)}
			</frame>
			{colorCard}
			{footer}
			{P.cursorFrame(focus, 8)}
		</frame>
	) as Frame;

	ctx.useLayout({ colorStrip: false, swatchLimit: () => SWATCH.count });
	// O Show só tira a disposição do lugar quando o tema muda; destrói no fim do quadro (ver CLAUDE.md).
	cleanup(() => task.defer(() => root.Destroy()));
	return root;
}
