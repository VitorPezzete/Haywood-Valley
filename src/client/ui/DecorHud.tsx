import Vide, { cleanup } from "@rbxts/vide";
import { DecorId, decorItem, DECOR_ORDER } from "shared/decor";
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
					Size={px(k, STRIP_WIDTH, STRIP_HEIGHT)}
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
