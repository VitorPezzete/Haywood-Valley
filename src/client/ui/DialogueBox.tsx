import Vide, { cleanup, Show, source } from "@rbxts/vide";
import { RunService } from "@rbxts/services";
import { BODY, LABEL, px, screenScale } from "./kit";
import { themeColor, themed } from "./theme";

export interface DialogueLine {
	/** Quem fala; aparece na plaquinha. Numa função, para trocar de idioma na hora. */
	name: () => string;
	text: () => string;
}

// Medidas em pixels de arte.
const BOX = new Vector2(420, 64);
const MARGIN_BOTTOM = 14;
/** A plaquinha do nome: altura e largura mínima; ela cresce com o nome. */
const NAME_TAG = new Vector2(40, 13);

interface Props {
	line: () => DialogueLine | undefined;
	/** Quantas letras da fala já apareceram. */
	shown: () => number;
	/** Se a fala já apareceu inteira e espera o jogador avançar. */
	waiting: () => boolean;
}

/** Caixa de diálogo no kit do tema: embaixo da tela, fala letra a letra e a plaquinha com o nome de quem fala. */
export function DialogueBox({ line, shown, waiting }: Props) {
	const { k } = screenScale();
	const clock = source(os.clock());
	cleanup(RunService.RenderStepped.Connect(() => clock(os.clock())));

	return (
		<screengui Name="Dialogue" IgnoreGuiInset={true} ResetOnSpawn={false} DisplayOrder={50} AutoLocalize={false}>
			<Show when={() => line() !== undefined}>
				{() => (
					<imagelabel
						{...themed("dialog", k)}
						Name="Box"
						AnchorPoint={new Vector2(0.5, 1)}
						Position={() => new UDim2(0.5, 0, 1, -MARGIN_BOTTOM * k())}
						Size={px(k, BOX.X, BOX.Y)}
					>
						<textlabel
							Name="Text"
							BackgroundTransparency={1}
							Position={() => UDim2.fromOffset(12 * k(), 11 * k())}
							Size={() => new UDim2(1, -24 * k(), 1, -24 * k())}
							FontFace={BODY}
							Text={() => line()?.text() ?? ""}
							MaxVisibleGraphemes={shown}
							TextColor3={() => themeColor("text")}
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
							TextColor3={() => themeColor("accent")}
							TextSize={() => 5 * k()}
							// Pisca quando a fala terminou e espera o jogador.
							TextTransparency={() => (waiting() && clock() % 0.8 < 0.5 ? 0.2 : 1)}
						/>
						<imagelabel
							{...themed("nameTag", k)}
							Name="Name"
							AnchorPoint={new Vector2(0, 0.5)}
							Position={() => UDim2.fromOffset(10 * k(), 0)}
							Size={px(k, NAME_TAG.X, NAME_TAG.Y)}
							AutomaticSize="X"
							ZIndex={2}
						>
							<uipadding
								PaddingLeft={() => new UDim(0, 10 * k())}
								PaddingRight={() => new UDim(0, 6 * k())}
							/>
							<textlabel
								BackgroundTransparency={1}
								Size={() => new UDim2(0, 0, 1, 0)}
								AutomaticSize="X"
								FontFace={LABEL}
								Text={() => line()?.name() ?? ""}
								TextColor3={() => themeColor("textOnTitle")}
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
