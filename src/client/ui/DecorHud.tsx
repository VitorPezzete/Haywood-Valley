import Vide, { cleanup } from "@rbxts/vide";
import { UserInputService } from "@rbxts/services";
import { decorColor3, DecorId, decorItem, DECOR_ORDER, DECOR_ORIGINAL, DECOR_PALETTE } from "shared/decor";
import { TextKey } from "shared/i18n/en";
import { sheetRect } from "client/world/interior";
import { t } from "./i18n";
import { BODY, ButtonKind, Hints, LABEL, px, screenScale, ThemeButton } from "./kit";
import { themeColor, themed } from "./theme";
import { ThemePieceName } from "./themes/types";

/** O painel aberto do Decorar, em pixels de arte: canto, altura e a folga de baixo; cada vaga do inventário e o espaço entre elas. */
const PANEL = { x: 8, height: 72, bottom: 8, pad: 6 };
const SLOT = 28;
const SLOT_GAP = 2;
const ICON = 22;
const PANEL_WIDTH = PANEL.pad * 2 + DECOR_ORDER.size() * (SLOT + SLOT_GAP) - SLOT_GAP;
/** A fileira recolhida: cada ícone (e cada botão de ícone do kit), o espaço entre eles e a folga em volta. */
const STRIP = { cell: 20, gap: 2, pad: 4, bottom: 8 };
const STRIP_BUTTONS = 4;
const STRIP_WIDTH = STRIP.pad * 2 + (DECOR_ORDER.size() + STRIP_BUTTONS) * (STRIP.cell + STRIP.gap) - STRIP.gap;
const STRIP_HEIGHT = STRIP.cell + STRIP.pad * 2;
/** Os botões em cima do painel aberto (girar, guardar, pronto) e o botão Decorar no canto de cima à direita. */
const BUTTON = new Vector2(64, 18);
const OPEN_BUTTON = new Vector2(72, 20);
/** O botão de recolher, no canto de cima à direita do painel aberto. */
const COLLAPSE = 20;
/**
 * O painel Cor (etapa G), em cima do painel aberto, encostado à direita dele (à esquerda ficam os botões Girar,
 * Guardar e Pronto): as partes da peça numa fileira e a paleta em duas, a original primeiro. Cada amostra e a folga.
 */
const SWATCH = new Vector2(18, 14);
const SWATCH_GAP = 2;
const PALETTE_COLUMNS = 5;
const PAINT = {
	width: 6 * 2 + PALETTE_COLUMNS * (SWATCH.X + SWATCH_GAP) - SWATCH_GAP,
	height: 72,
	gap: 6,
	pad: 6,
	/** As partes pintáveis de uma peça, no máximo (tools/recortes_lib/partes.py). */
	parts: 6,
	rows: [26, 42],
	keys: 59,
};
/** No painel recolhido, os dois botões de pintar (a parte e a cor) vêm depois dos outros. */
const STRIP_PAINT = 2;

/** O texto de baixo do painel: o que fazer, ou por que a peça não cabe. */
export interface DecorStatus {
	key: TextKey;
	/** O nome da peça. */
	piece?: TextKey;
	/** Os fundos que a peça pede. */
	wanted?: TextKey[];
	/** O que tem embaixo. */
	found?: TextKey;
}

/** O texto do aviso, traduzido: as chaves de dentro (a peça, o fundo pedido, o que tem embaixo) também. */
export function statusText(status: DecorStatus) {
	return t(status.key, {
		piece: status.piece ? t(status.piece) : "",
		wanted: (status.wanted ?? []).map((key) => t(key)).join(", "),
		found: status.found ? t(status.found) : "",
	});
}

type ModeButton = [TextKey, () => void, ButtonKind];

export interface DecorHudProps {
	/** Se o jogador está na própria casa (o botão Decorar aparece). */
	available: () => boolean;
	/** Se o modo Decorar está ligado. */
	active: () => boolean;
	/** Se o painel está recolhido na fileira de ícones. */
	collapsed: () => boolean;
	chosen: () => DecorId | undefined;
	/** Quantas de cada peça sobram. */
	stock: () => ReadonlyMap<DecorId, number>;
	status: () => DecorStatus;
	onChoose: (id: DecorId) => void;
	onRotate: () => void;
	onStore: () => void;
	onToggle: () => void;
	onCollapse: (collapsed: boolean) => void;
	/** Quantas partes pintáveis tem a peça na mão (0: o painel Cor some), a escolhida e a cor de cada uma. */
	paintParts: () => number;
	paintPart: () => number;
	shownColors: () => readonly number[];
	/** A cor escolhida para a parte escolhida, ou `DECOR_ORIGINAL`; e a cor da arte nessa parte. */
	paintColor: () => number;
	originalColor: () => number;
	onPart: (part: number) => void;
	onColor: (color: number) => void;
	onNextPart: () => void;
	onNextColor: () => void;
}

/** Uma amostra de cor que se toca: a célula do tema (marcada quando escolhida) com a cor dentro. */
function Swatch(
	k: () => number,
	name: string,
	position: () => UDim2,
	size: Vector2,
	color: () => Color3,
	chosen: () => boolean,
	onPress: () => void,
	visible: () => boolean = () => true,
	label?: () => string,
) {
	return (
		<imagebutton
			{...themed(() => (chosen() ? "cellChosen" : "cell"), k)}
			Name={name}
			AutoButtonColor={false}
			Position={position}
			Size={() => UDim2.fromOffset(size.X * k(), size.Y * k())}
			Visible={visible}
			ZIndex={21}
			Activated={onPress}
		>
			<frame
				BackgroundColor3={color}
				BorderSizePixel={0}
				Position={() => UDim2.fromOffset(3 * k(), 3 * k())}
				Size={() => new UDim2(1, -6 * k(), 1, -6 * k())}
				ZIndex={22}
			/>
			{label ? (
				<textlabel
					BackgroundTransparency={1}
					Size={UDim2.fromScale(1, 1)}
					FontFace={LABEL}
					Text={label}
					TextColor3={new Color3(1, 1, 1)}
					TextStrokeTransparency={0.3}
					TextSize={() => 5 * k()}
					ZIndex={23}
				/>
			) : undefined}
		</imagebutton>
	);
}

/**
 * O painel Cor do Decorar: as partes pintáveis da peça na mão (cada uma na cor que vai ter; tocar escolhe) e a
 * paleta (a original, que tira a cor, e `DECOR_PALETTE`). No teclado, a linha de baixo lembra as teclas.
 */
function PaintPanel(props: DecorHudProps, k: () => number) {
	const indices = new Array<number>();
	for (let part = 0; part < PAINT.parts; part++) indices.push(part);
	const parts = indices.map((part) =>
		Swatch(
			k,
			`Part_${part + 1}`,
			at(k, PAINT.pad + part * (12 + SWATCH_GAP), 8),
			new Vector2(12, 14),
			() => decorColor3(props.shownColors()[part] ?? 0xffffff),
			() => props.paintPart() === part,
			() => props.onPart(part),
			() => part < props.paintParts(),
			() => tostring(part + 1),
		),
	);
	const options = [DECOR_ORIGINAL, ...DECOR_PALETTE];
	const swatches = options.map((color, index) => {
		const column = index % PALETTE_COLUMNS;
		const row = math.floor(index / PALETTE_COLUMNS);
		const original = color === DECOR_ORIGINAL;
		return Swatch(
			k,
			original ? "Original" : `Color_${index}`,
			at(k, PAINT.pad + column * (SWATCH.X + SWATCH_GAP), PAINT.rows[row] ?? 0),
			SWATCH,
			// A original mostra a cor da arte na parte escolhida, com a marca "x" (tira a cor escolhida).
			() => decorColor3(original ? props.originalColor() : color),
			() => props.paintColor() === color,
			() => props.onColor(color),
			undefined,
			original ? () => "x" : undefined,
		);
	});
	return (
		<imagelabel
			{...themed("panel", k)}
			Name="Paint"
			Position={() =>
				new UDim2(
					0,
					(PANEL.x + PANEL_WIDTH - PAINT.width) * k(),
					1,
					-(PANEL.bottom + PANEL.height + PAINT.gap + PAINT.height) * k(),
				)
			}
			Size={px(k, PAINT.width, PAINT.height)}
			Visible={() => props.paintParts() > 0}
			Active={true}
			ZIndex={20}
		>
			<imagelabel {...themed("titleBar", k)} Position={at(k, 0, -6)} Size={px(k, 56, 14)} ZIndex={21}>
				<textlabel
					BackgroundTransparency={1}
					Size={UDim2.fromScale(1, 1)}
					FontFace={LABEL}
					Text={() => t("decor.paint.title")}
					TextColor3={() => themeColor("textOnTitle")}
					TextSize={() => 6 * k()}
					ZIndex={22}
				/>
			</imagelabel>
			{parts}
			{swatches}
			<textlabel
				Name="Keys"
				BackgroundTransparency={1}
				Position={at(k, PAINT.pad, PAINT.keys)}
				Size={px(k, PAINT.width - PAINT.pad * 2, 8)}
				FontFace={BODY}
				Text={() => t("decor.paint.keys")}
				TextXAlignment="Left"
				TextColor3={() => themeColor("text")}
				TextSize={() => 5 * k()}
				Visible={UserInputService.KeyboardEnabled}
				ZIndex={21}
			/>
		</imagelabel>
	);
}

/** Posição em pixels de arte dentro de um quadro. */
function at(k: () => number, x: number, y: number) {
	return () => UDim2.fromOffset(x * k(), y * k());
}

/** A vaga de uma peça do inventário: o ícone recortado da folha (apagado quando acabou) e, no painel aberto, quantas sobram. */
function Slot(
	props: DecorHudProps,
	k: () => number,
	id: DecorId,
	x: number,
	y: number,
	size: number,
	icon: number,
	count: boolean,
) {
	const item = decorItem(id)!;
	const [col, row, w, h] = item.icon;
	const art = sheetRect([item.sheet, col, row], w, h);
	const left = () => props.stock().get(id) ?? 0;
	return (
		<imagebutton
			{...themed(() => (props.chosen() === id ? "cellChosen" : "cell"), k)}
			Name={`Slot_${id}`}
			AutoButtonColor={false}
			Position={at(k, x, y)}
			Size={px(k, size, size)}
			ZIndex={21}
			Activated={() => props.onChoose(id)}
		>
			<imagelabel
				BackgroundTransparency={1}
				Image={art.image}
				ImageRectOffset={art.offset}
				ImageRectSize={art.size}
				ResampleMode={Enum.ResamplerMode.Pixelated}
				ScaleType={Enum.ScaleType.Fit}
				ImageTransparency={() => (left() > 0 ? 0 : 0.6)}
				AnchorPoint={new Vector2(0.5, 0.5)}
				Position={UDim2.fromScale(0.5, 0.5)}
				Size={px(k, icon, icon)}
				ZIndex={22}
			/>
			{count ? (
				<textlabel
					BackgroundTransparency={1}
					AnchorPoint={new Vector2(1, 1)}
					Position={() => new UDim2(1, -2 * k(), 1, -1 * k())}
					Size={px(k, 20, 7)}
					FontFace={LABEL}
					Text={() => `x${left()}`}
					TextXAlignment="Right"
					TextColor3={() => themeColor("text")}
					TextSize={() => 5 * k()}
					ZIndex={23}
				/>
			) : undefined}
		</imagebutton>
	);
}

/**
 * A interface do Decorar (`DecorController`), no kit do tema: o botão Decorar no canto de cima à direita (só na
 * própria casa) e, com o modo ligado, o painel embaixo à esquerda. Aberto: as peças do inventário de teste (o
 * ícone recortado da folha e quantas sobram), o aviso (cabe, ou o motivo da recusa), os botões Girar, Guardar e
 * Pronto e o de recolher; no teclado, as dicas com as teclas no canto. Recolhido (o padrão no celular, pedido do
 * usuário em 2026-10-18): uma fileira de ícones com as peças e os botões de ícone girar, guardar, pronto e abrir, e
 * o aviso numa linha em cima dela; tocar no botão de abrir mostra o painel inteiro.
 *
 * Com uma peça que se pinta na mão (etapa G), o painel aberto ganha o painel Cor (`PaintPanel`) e a fileira
 * recolhida, dois botões no fim: a parte (com o número) e a cor dela, que a cada toque passam à próxima.
 */
export function DecorHud(props: DecorHudProps) {
	const { k } = screenScale();
	const iconButton = (index: number, icon: ThemePieceName, onPress: () => void) => (
		<ThemeButton
			k={k}
			kind="icon"
			position={at(k, STRIP.pad + (DECOR_ORDER.size() + index) * (STRIP.cell + STRIP.gap), STRIP.pad)}
			size={px(k, STRIP.cell, STRIP.cell)}
			icon={() => icon}
			zIndex={21}
			onPress={onPress}
		/>
	);

	const gui = (
		<screengui Name="DecorHud" ResetOnSpawn={false} DisplayOrder={42} AutoLocalize={false} IgnoreGuiInset={false}>
			<frame
				Name="Open"
				BackgroundTransparency={1}
				Size={UDim2.fromScale(1, 1)}
				Visible={() => props.available() && !props.active()}
			>
				<ThemeButton
					k={k}
					kind="secondary"
					position={() => new UDim2(1, -(OPEN_BUTTON.X + 8) * k(), 0, 8 * k())}
					size={px(k, OPEN_BUTTON.X, OPEN_BUTTON.Y)}
					text={() => t("decor.button")}
					onPress={props.onToggle}
				/>
			</frame>
			<frame
				Name="Mode"
				BackgroundTransparency={1}
				Size={UDim2.fromScale(1, 1)}
				Visible={() => props.active() && !props.collapsed()}
			>
				<imagelabel
					{...themed("panel", k)}
					Name="Panel"
					Position={() => new UDim2(0, PANEL.x * k(), 1, -(PANEL.bottom + PANEL.height) * k())}
					Size={px(k, PANEL_WIDTH, PANEL.height)}
					Active={true}
					ZIndex={20}
				>
					<imagelabel {...themed("titleBar", k)} Position={at(k, 0, -6)} Size={px(k, 96, 14)} ZIndex={21}>
						<textlabel
							BackgroundTransparency={1}
							Size={UDim2.fromScale(1, 1)}
							FontFace={LABEL}
							Text={() => t("decor.title")}
							TextColor3={() => themeColor("textOnTitle")}
							TextSize={() => 6 * k()}
							ZIndex={22}
						/>
					</imagelabel>
					<ThemeButton
						k={k}
						kind="icon"
						position={at(k, PANEL_WIDTH - COLLAPSE - 2, -8)}
						size={px(k, COLLAPSE, COLLAPSE)}
						icon={() => "iconDropdown"}
						zIndex={22}
						onPress={() => props.onCollapse(true)}
					/>
					{DECOR_ORDER.map((id, index) =>
						Slot(props, k, id, PANEL.pad + index * (SLOT + SLOT_GAP), 12, SLOT, ICON, true),
					)}
					<textlabel
						Name="Status"
						BackgroundTransparency={1}
						Position={at(k, 8, 45)}
						Size={px(k, PANEL_WIDTH - 16, 22)}
						FontFace={BODY}
						Text={() => statusText(props.status())}
						TextWrapped={true}
						TextXAlignment="Left"
						TextYAlignment="Top"
						TextColor3={() => themeColor("text")}
						TextSize={() => 7 * k()}
						ZIndex={21}
					/>
				</imagelabel>
				{[
					["decor.hint.rotate", props.onRotate, "secondary"] as ModeButton,
					["decor.hint.store", props.onStore, "secondary"] as ModeButton,
					["decor.hint.exit", props.onToggle, "primary"] as ModeButton,
				].map(([label, onPress, kind], index) => (
					<ThemeButton
						k={k}
						kind={kind}
						position={() =>
							new UDim2(
								0,
								(PANEL.x + index * (BUTTON.X + 4)) * k(),
								1,
								-(PANEL.bottom + PANEL.height + BUTTON.Y + 10) * k(),
							)
						}
						size={px(k, BUTTON.X, BUTTON.Y)}
						text={() => t(label)}
						onPress={onPress}
					/>
				))}
				{PaintPanel(props, k)}
				<Hints
					k={k}
					hints={[
						{ keys: [Enum.KeyCode.R], label: "decor.hint.rotate" },
						{ keys: [Enum.KeyCode.X], label: "decor.hint.store" },
						{ keys: [Enum.KeyCode.B], label: "decor.hint.exit" },
					]}
				/>
			</frame>
			<frame
				Name="Strip"
				BackgroundTransparency={1}
				Size={UDim2.fromScale(1, 1)}
				Visible={() => props.active() && props.collapsed()}
			>
				<imagelabel
					{...themed("panel", k)}
					Name="Row"
					Position={() => new UDim2(0, PANEL.x * k(), 1, -(STRIP.bottom + STRIP_HEIGHT) * k())}
					Size={() =>
						UDim2.fromOffset(
							(STRIP_WIDTH + (props.paintParts() > 0 ? STRIP_PAINT * (STRIP.cell + STRIP.gap) : 0)) * k(),
							STRIP_HEIGHT * k(),
						)
					}
					Active={true}
					ZIndex={20}
				>
					{DECOR_ORDER.map((id, index) =>
						Slot(props, k, id, STRIP.pad + index * (STRIP.cell + STRIP.gap), STRIP.pad, STRIP.cell, 16, false),
					)}
					{iconButton(0, "iconRotateRight", props.onRotate)}
					{iconButton(1, "iconChest", props.onStore)}
					{iconButton(2, "iconOk", props.onToggle)}
					{iconButton(3, "iconNext", () => props.onCollapse(false))}
					{/* Pintar, com a peça que se pinta na mão: a parte (tocar passa à próxima) e a cor dela (tocar passa à próxima). */}
					{Swatch(
						k,
						"PaintPart",
						at(k, STRIP.pad + (DECOR_ORDER.size() + STRIP_BUTTONS) * (STRIP.cell + STRIP.gap), STRIP.pad),
						new Vector2(STRIP.cell, STRIP.cell),
						() => decorColor3(props.shownColors()[props.paintPart()] ?? 0xffffff),
						() => false,
						props.onNextPart,
						() => props.paintParts() > 0,
						() => `${props.paintPart() + 1}/${props.paintParts()}`,
					)}
					{Swatch(
						k,
						"PaintColor",
						at(k, STRIP.pad + (DECOR_ORDER.size() + STRIP_BUTTONS + 1) * (STRIP.cell + STRIP.gap), STRIP.pad),
						new Vector2(STRIP.cell, STRIP.cell),
						() => decorColor3(props.shownColors()[props.paintPart()] ?? 0xffffff),
						() => true,
						props.onNextColor,
						() => props.paintParts() > 0,
					)}
				</imagelabel>
				<imagelabel
					{...themed("tooltip", k)}
					Name="Line"
					Position={() => new UDim2(0, PANEL.x * k(), 1, -(STRIP.bottom + STRIP_HEIGHT + 16) * k())}
					Size={px(k, 0, 14)}
					AutomaticSize="X"
					ZIndex={20}
				>
					<uipadding PaddingLeft={() => new UDim(0, 5 * k())} PaddingRight={() => new UDim(0, 5 * k())} />
					<textlabel
						BackgroundTransparency={1}
						AutomaticSize="X"
						Size={() => new UDim2(0, 0, 1, 0)}
						FontFace={BODY}
						Text={() => statusText(props.status())}
						TextColor3={() => themeColor("text")}
						TextSize={() => 7 * k()}
						ZIndex={21}
					/>
				</imagelabel>
			</frame>
		</screengui>
	) as ScreenGui;
	cleanup(gui);
	return gui;
}
