import Vide, { cleanup, source } from "@rbxts/vide";
import { Workspace } from "@rbxts/services";
import { subscribe } from "@rbxts/charm";
import { TextKey } from "shared/i18n/en";
import { TextArgs } from "shared/i18n/locales";
import { screenDensity } from "shared/view";
import { phonePreview, phoneScale } from "client/state/phone";
import { uiSound } from "client/uiSound";
import { Border, Piece } from "./art";
import { keyName, t } from "./i18n";
import { metric, pieceSize, themeColor, themed } from "./theme";
import { ThemePieceName } from "./themes/types";

export const INK = Color3.fromRGB(26, 24, 48);
export const WHITE = Color3.fromRGB(255, 255, 255);
export const CREAM = Color3.fromRGB(255, 242, 204);
/** Tinta da opção escolhida e da aba aberta. */
export const CHOSEN = Color3.fromRGB(214, 190, 255);
// As três abaixo saem da paleta do draw_ui.lua.
/** Fundo claro dos campos: o nome e os valores das Configurações. */
export const PALE = Color3.fromRGB(238, 241, 248);
/** Parte cheia das barras de volume. */
export const PURPLE = Color3.fromHex("#7038E0");
/** Títulos dos créditos sobre o pergaminho. */
export const CLAY_DARK = Color3.fromHex("#9C5850");

/** Títulos de painel e itens do menu. */
export const SERIF = new Font("rbxasset://fonts/families/Merriweather.json", Enum.FontWeight.Bold);
/** Rótulos curtos e botões, em fonte de pixel. */
export const LABEL = new Font("rbxasset://fonts/families/PressStart2P.json");
/** Texto corrido. A Gotham SSm saiu do Roblox; a Montserrat é a substituta oficial e tem os acentos. */
export const BODY = new Font("rbxasset://fonts/families/Montserrat.json", Enum.FontWeight.Medium);

/** A interface é desenhada para uma tela de 480×270 pixels de arte. */
export const DESIGN = new Vector2(480, 270);

/**
 * Medidas da tela. `k` é quantos pixels do `ViewportSize` vale um pixel de arte: inteiro em pixels
 * físicos, para a pixel art não borrar, e o maior que ainda deixa o desenho de 480×270 caber. Numa tela
 * com escala de 125% (`screenDensity`), fica fracionário aqui e a interface sai um pouco menor (pedido do
 * usuário em 2026-10-17). Chamar dentro de um componente.
 */
export function screenScale() {
	const camera = Workspace.CurrentCamera!;
	const real = source(camera.ViewportSize);
	cleanup(camera.GetPropertyChangedSignal("ViewportSize").Connect(() => real(camera.ViewportSize)));
	// A prévia de celular (ferramenta de desenvolvimento, `client/state/phone.ts`): o `k` e a tela como no celular,
	// ampliados pelo inteiro que cabe na tela de agora.
	const phone = source(phonePreview());
	cleanup(subscribe(phonePreview, (value) => phone(value)));
	const scaleOf = (size: Vector2) => {
		const density = screenDensity(size);
		return { density, physical: size.mul(density) };
	};
	const viewport = () => {
		const p = phone();
		if (!p) return real();
		const { density, physical } = scaleOf(real());
		return p.mul(phoneScale(p, physical) / density);
	};
	const k = () => {
		const p = phone();
		const { density, physical } = scaleOf(real());
		if (p) {
			return (math.max(1, math.floor(math.min(p.X / DESIGN.X, p.Y / DESIGN.Y))) * phoneScale(p, physical)) / density;
		}
		return math.max(1, math.floor(math.min(physical.X / DESIGN.X, physical.Y / DESIGN.Y))) / density;
	};
	return { viewport, k };
}

/** Propriedades de um `imagelabel` que mostra uma peça da folha, sem esticar. */
export function art(piece: Piece) {
	return {
		BackgroundTransparency: 1,
		Image: piece.image,
		ImageRectOffset: piece.offset,
		ImageRectSize: piece.size,
		ResampleMode: Enum.ResamplerMode.Pixelated,
	};
}

/** Propriedades de um `imagelabel` com uma peça fatiada em 9: os cantos ficam fixos e o miolo estica. */
export function sliced(piece: Piece, border: Border, k: () => number) {
	return {
		...art(piece),
		ScaleType: Enum.ScaleType.Slice,
		SliceCenter: new Rect(border.left, border.top, piece.size.X - border.right, piece.size.Y - border.bottom),
		SliceScale: k,
	};
}

/** Tamanho em pixels de arte. */
export function px(k: () => number, width: number, height: number) {
	return () => UDim2.fromOffset(width * k(), height * k());
}

/** Posição em pixels de arte. */
export function place(k: () => number, x: number, y: number) {
	return () => UDim2.fromOffset(x * k(), y * k());
}

/**
 * Botão com texto, preso pelo canto de cima à esquerda, no kit do tema (o botão comum; com `tint`,
 * aparece como escolhido quando a cor for a de escolhido).
 */
export function PillButton({
	k,
	text,
	x,
	y,
	width,
	zIndex,
	onPress,
	tint,
}: {
	k: () => number;
	text: () => string;
	x: number;
	y: number;
	width: number;
	zIndex?: number;
	onPress: () => void;
	tint?: () => Color3;
}) {
	return (
		<ThemeButton
			k={k}
			kind="secondary"
			position={place(k, x, y)}
			size={px(k, width, 18)}
			text={text}
			chosen={tint ? () => tint() === CHOSEN : undefined}
			zIndex={zIndex}
			onPress={onPress}
		/>
	);
}

/** Uma dica: as teclas e a chave do texto do que elas fazem (numa função, quando muda com o que se pode fazer). */
export interface Hint {
	keys: Enum.KeyCode[];
	label: TextKey | (() => TextKey);
	/** Os valores do texto (as sementes que sobram na dica de plantar, 2026-10-23). */
	args?: () => TextArgs | undefined;
}

/** Dicas de tecla no canto de baixo à direita, no kit do tema: as teclas e o que elas fazem. */
export function Hints({
	hints,
	k,
	fade,
	zIndex = 20,
}: {
	hints: Hint[];
	k: () => number;
	fade?: () => number;
	zIndex?: number;
}) {
	const transparency = fade ?? (() => 0);
	return (
		<frame
			Name="Hints"
			BackgroundTransparency={1}
			AnchorPoint={new Vector2(1, 1)}
			Position={() => new UDim2(1, -6 * k(), 1, -5 * k())}
			AutomaticSize="XY"
			ZIndex={zIndex}
		>
			<uilistlayout FillDirection="Horizontal" SortOrder="LayoutOrder" Padding={() => new UDim(0, 5 * k())} />
			{hints.map((hint, order) => (
				<imagelabel
					{...themed("tooltip", k)}
					LayoutOrder={order}
					AutomaticSize="X"
					Size={() => UDim2.fromOffset(0, 18 * k())}
					ImageTransparency={transparency}
					ZIndex={zIndex}
				>
					<uilistlayout
						FillDirection="Horizontal"
						VerticalAlignment="Center"
						SortOrder="LayoutOrder"
						Padding={() => new UDim(0, 2 * k())}
					/>
					<uipadding PaddingLeft={() => new UDim(0, 4 * k())} PaddingRight={() => new UDim(0, 6 * k())} />
					{hint.keys.map((key, index) => (
						<imagelabel
							{...themed("key", k)}
							LayoutOrder={index}
							AutomaticSize="X"
							Size={() => UDim2.fromOffset(0, 14 * k())}
							ImageTransparency={transparency}
							ZIndex={zIndex + 1}
						>
							<uipadding
								PaddingLeft={() => new UDim(0, 4 * k())}
								PaddingRight={() => new UDim(0, 4 * k())}
								PaddingBottom={() => new UDim(0, 3 * k())}
							/>
							<textlabel
								BackgroundTransparency={1}
								AutomaticSize="X"
								Size={new UDim2(0, 0, 1, 0)}
								FontFace={LABEL}
								Text={() => keyName(key)}
								TextColor3={() => themeColor("textOnKey")}
								TextSize={() => 5 * k()}
								TextTransparency={transparency}
								ZIndex={zIndex + 2}
							/>
						</imagelabel>
					))}
					<textlabel
						BackgroundTransparency={1}
						LayoutOrder={99}
						AutomaticSize="X"
						Size={new UDim2(0, 0, 1, 0)}
						FontFace={BODY}
						Text={() => t(typeIs(hint.label, "function") ? hint.label() : hint.label, hint.args?.())}
						TextColor3={() => themeColor("text")}
						TextSize={() => 8 * k()}
						TextTransparency={transparency}
						ZIndex={zIndex + 1}
					/>
				</imagelabel>
			))}
		</frame>
	);
}

export type ButtonKind = "primary" | "secondary" | "icon";

export interface ThemeButtonProps {
	k: () => number;
	/** Principal, comum ou só ícone; numa função, quando muda. */
	kind: ButtonKind | (() => ButtonKind);
	position: UDim2 | (() => UDim2);
	size: UDim2 | (() => UDim2);
	text?: () => string;
	icon?: () => ThemePieceName;
	font?: Font;
	/** Tamanho do texto, em pixels de arte (5 por padrão). */
	textSize?: number;
	/** Aparece como o principal enquanto for `true`. */
	chosen?: () => boolean;
	fade?: () => number;
	zIndex?: number;
	onPress: () => void;
	onHover?: (hovered: boolean) => void;
	onDown?: () => void;
	onUp?: () => void;
}

/**
 * Botão no kit do tema em uso (Celeiro ou Clássico), com os estados normal, em cima e apertado; o
 * ícone e o texto descem `pressedOffset` quando apertado.
 */
export function ThemeButton(props: ThemeButtonProps) {
	const { k } = props;
	const hovered = source(false);
	const pressed = source(false);
	const z = props.zIndex ?? 13;
	const fade = props.fade ?? (() => 0);
	const kind = () => (typeIs(props.kind, "function") ? props.kind() : props.kind);
	const main = () => kind() === "primary" || props.chosen?.() === true;
	const pieceName = () => {
		const base = kind() === "icon" ? "iconButton" : main() ? "buttonPrimary" : "buttonSecondary";
		return `${base}${pressed() ? "Pressed" : hovered() ? "Hover" : ""}` as ThemePieceName;
	};
	const ink = () => (main() ? themeColor("textOnPrimary") : themeColor("textOnSecondary"));
	const isPointer = (input: InputObject) =>
		input.UserInputType === Enum.UserInputType.MouseButton1 || input.UserInputType === Enum.UserInputType.Touch;

	return (
		<imagebutton
			{...themed(pieceName, k)}
			AutoButtonColor={false}
			Position={props.position}
			Size={props.size}
			ImageTransparency={fade}
			ZIndex={z}
			MouseEnter={() => {
				hovered(true);
				props.onHover?.(true);
			}}
			MouseLeave={() => {
				hovered(false);
				if (pressed()) props.onUp?.();
				pressed(false);
				props.onHover?.(false);
			}}
			InputBegan={(input) => {
				if (!isPointer(input)) return;
				pressed(true);
				props.onDown?.();
			}}
			InputEnded={(input) => {
				if (!isPointer(input)) return;
				if (pressed()) props.onUp?.();
				pressed(false);
			}}
			Activated={() => {
				uiSound("click");
				props.onPress();
			}}
		>
			<frame
				BackgroundTransparency={1}
				Position={() => UDim2.fromOffset(0, (pressed() ? metric("pressedOffset") : 0) * k())}
				Size={UDim2.fromScale(1, 1)}
				ZIndex={z + 1}
			>
				<uilistlayout
					FillDirection="Horizontal"
					HorizontalAlignment="Center"
					VerticalAlignment="Center"
					SortOrder="LayoutOrder"
					Padding={() => new UDim(0, 4 * k())}
				/>
				<imagelabel
					{...themed(() => props.icon?.() ?? "iconOk", k)}
					LayoutOrder={0}
					Visible={() => props.icon?.() !== undefined}
					Size={() => {
						const size = pieceSize(props.icon?.() ?? "iconOk");
						return UDim2.fromOffset(size.X * k(), size.Y * k());
					}}
					ImageTransparency={fade}
					ZIndex={z + 2}
				/>
				<textlabel
					BackgroundTransparency={1}
					LayoutOrder={1}
					Visible={() => props.text !== undefined}
					AutomaticSize="X"
					Size={() => UDim2.fromOffset(0, 14 * k())}
					FontFace={props.font ?? LABEL}
					Text={() => props.text?.() ?? ""}
					TextColor3={ink}
					TextSize={() => (props.textSize ?? 5) * k()}
					TextTransparency={fade}
					ZIndex={z + 2}
				/>
			</frame>
		</imagebutton>
	);
}
