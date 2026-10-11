import Vide, { cleanup, source } from "@rbxts/vide";
import { Workspace } from "@rbxts/services";
import { Border, Piece, Slice, UiArt } from "./art";

export const INK = Color3.fromRGB(26, 24, 48);
export const WHITE = Color3.fromRGB(255, 255, 255);
export const CREAM = Color3.fromRGB(255, 242, 204);

/** Títulos de painel e itens do menu. */
export const SERIF = new Font("rbxasset://fonts/families/Merriweather.json", Enum.FontWeight.Bold);
/** Rótulos curtos e botões, em fonte de pixel. */
export const LABEL = new Font("rbxasset://fonts/families/PressStart2P.json");
/** Texto corrido. */
export const BODY = new Font("rbxasset://fonts/families/GothamSSm.json", Enum.FontWeight.Medium);

/** A interface é desenhada para uma tela de 480×270 pixels de arte. */
export const DESIGN = new Vector2(480, 270);

/**
 * Medidas da tela. `k` é quantos pixels de tela vale um pixel de arte: inteiro, para a pixel art
 * não borrar, e o maior que ainda deixa o desenho de 480×270 caber. Chamar dentro de um componente.
 */
export function screenScale() {
	const camera = Workspace.CurrentCamera!;
	const viewport = source(camera.ViewportSize);
	cleanup(camera.GetPropertyChangedSignal("ViewportSize").Connect(() => viewport(camera.ViewportSize)));
	const k = () => math.max(1, math.floor(math.min(viewport().X / DESIGN.X, viewport().Y / DESIGN.Y)));
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

interface Hint {
	keys: string[];
	label: string;
}

/** Dicas de tecla no canto de baixo à direita: as teclas em relevo e o que elas fazem. */
export function Hints({ hints, k, fade }: { hints: Hint[]; k: () => number; fade?: () => number }) {
	const transparency = fade ?? (() => 0);
	return (
		<frame
			Name="Hints"
			BackgroundTransparency={1}
			AnchorPoint={new Vector2(1, 1)}
			Position={() => new UDim2(1, -6 * k(), 1, -5 * k())}
			AutomaticSize="XY"
			ZIndex={20}
		>
			<uilistlayout FillDirection="Horizontal" SortOrder="LayoutOrder" Padding={() => new UDim(0, 5 * k())} />
			{hints.map((hint, order) => (
				<imagelabel
					{...sliced(UiArt.hintBack, Slice.hintBack, k)}
					LayoutOrder={order}
					AutomaticSize="X"
					Size={() => UDim2.fromOffset(0, 18 * k())}
					ImageTransparency={() => math.max(transparency(), 0.15)}
					ZIndex={20}
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
							{...sliced(UiArt.keycap, Slice.keycap, k)}
							LayoutOrder={index}
							AutomaticSize="X"
							Size={() => UDim2.fromOffset(0, 14 * k())}
							ImageTransparency={transparency}
							ZIndex={21}
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
								Text={key}
								TextColor3={WHITE}
								TextSize={() => 5 * k()}
								TextTransparency={transparency}
								ZIndex={22}
							/>
						</imagelabel>
					))}
					<textlabel
						BackgroundTransparency={1}
						LayoutOrder={99}
						AutomaticSize="X"
						Size={new UDim2(0, 0, 1, 0)}
						FontFace={BODY}
						Text={hint.label}
						TextColor3={WHITE}
						TextSize={() => 8 * k()}
						TextTransparency={transparency}
						ZIndex={21}
					/>
				</imagelabel>
			))}
		</frame>
	);
}
