import Vide, { cleanup, Show, source } from "@rbxts/vide";
import { RunService } from "@rbxts/services";
import { Slice, UiArt } from "./art";
import { BODY, INK, LABEL, px, screenScale, sliced, WHITE } from "./kit";

export interface DialogueLine {
	/** Quem fala; aparece na etiqueta roxa. */
	name: string;
	text: string;
}

// Medidas em pixels de arte.
const BOX = new Vector2(420, 64);
const MARGIN_BOTTOM = 14;
const RIBBON = new Vector2(104, 16);

interface Props {
	line: () => DialogueLine | undefined;
	/** Quantas letras da fala já apareceram. */
	shown: () => number;
	/** Se a fala já apareceu inteira e espera o jogador avançar. */
	waiting: () => boolean;
}

/** Caixa de diálogo: pergaminho embaixo da tela, fala letra a letra e etiqueta com o nome de quem fala. */
export function DialogueBox({ line, shown, waiting }: Props) {
	const { k } = screenScale();
	const clock = source(os.clock());
	cleanup(RunService.RenderStepped.Connect(() => clock(os.clock())));

	return (
		<screengui Name="Dialogue" IgnoreGuiInset={true} ResetOnSpawn={false} DisplayOrder={50}>
			<Show when={() => line() !== undefined}>
				{() => (
					<imagelabel
						{...sliced(UiArt.parchment, Slice.parchment, k)}
						Name="Box"
						AnchorPoint={new Vector2(0.5, 1)}
						Position={() => new UDim2(0.5, 0, 1, -MARGIN_BOTTOM * k())}
						Size={px(k, BOX.X, BOX.Y)}
					>
						<textlabel
							Name="Text"
							BackgroundTransparency={1}
							Position={() => UDim2.fromOffset(12 * k(), 9 * k())}
							Size={() => new UDim2(1, -24 * k(), 1, -22 * k())}
							FontFace={BODY}
							Text={() => line()?.text ?? ""}
							MaxVisibleGraphemes={shown}
							TextColor3={INK}
							TextSize={() => 9 * k()}
							TextWrapped={true}
							TextXAlignment="Left"
							TextYAlignment="Top"
							LineHeight={1.25}
						/>
						<textlabel
							Name="More"
							BackgroundTransparency={1}
							AnchorPoint={new Vector2(0, 1)}
							Position={() => new UDim2(0, 12 * k(), 1, -5 * k())}
							AutomaticSize="XY"
							FontFace={LABEL}
							Text="▼"
							TextColor3={INK}
							TextSize={() => 5 * k()}
							// Pisca quando a fala terminou e espera o jogador.
							TextTransparency={() => (waiting() && clock() % 0.8 < 0.5 ? 0.2 : 1)}
						/>
						<imagelabel
							{...sliced(UiArt.ribbon, Slice.ribbon, k)}
							Name="Name"
							AnchorPoint={new Vector2(1, 0.5)}
							Position={() => new UDim2(1, 4 * k(), 1, -8 * k())}
							Size={px(k, RIBBON.X, RIBBON.Y)}
							ZIndex={2}
						>
							<textlabel
								BackgroundTransparency={1}
								Position={() => UDim2.fromOffset(10 * k(), 0)}
								Size={() => new UDim2(1, -12 * k(), 1, 0)}
								FontFace={LABEL}
								Text={() => line()?.name ?? ""}
								TextColor3={WHITE}
								TextSize={() => 6 * k()}
								ZIndex={3}
							/>
						</imagelabel>
					</imagelabel>
				)}
			</Show>
		</screengui>
	);
}
