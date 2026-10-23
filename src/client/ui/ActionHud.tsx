import Vide, { cleanup } from "@rbxts/vide";
import { UserInputService } from "@rbxts/services";
import { TextKey } from "shared/i18n/en";
import { TextArgs } from "shared/i18n/locales";
import { t } from "./i18n";
import { Hints, px, screenScale, ThemeButton } from "./kit";

/** O botão de ação na tela de toque, em pixels de arte: largura, altura e a folga da borda da direita e de baixo. */
const BUTTON = new Vector2(100, 22);
const BUTTON_MARGIN = new Vector2(10, 58);

/**
 * A ação do boneco na tela (`ActionController`): no teclado, a dica com a tecla F e o que ela faz, no canto de
 * baixo à direita; na tela de toque, um botão do kit do tema, acima do canto onde o Roblox põe o pulo, que vale
 * enquanto fica apertado (segurar o móvel). Os dois só aparecem quando há o que fazer.
 */
export function ActionHud({
	prompt,
	args,
	visible,
	onDown,
	onUp,
}: {
	/** A chave do texto da ação de agora, ou nada quando não há o que fazer. */
	prompt: () => TextKey | undefined;
	/** Os valores do texto da ação (as sementes que sobram, na de plantar). */
	args: () => TextArgs | undefined;
	visible: () => boolean;
	onDown: () => void;
	onUp: () => void;
}) {
	const { k } = screenScale();
	const shown = () => visible() && prompt() !== undefined;
	const label = () => prompt() ?? "action.grab";

	const gui = (
		<screengui Name="ActionHud" IgnoreGuiInset={true} ResetOnSpawn={false} DisplayOrder={40} AutoLocalize={false}>
			<frame
				Name="Keys"
				BackgroundTransparency={1}
				Size={UDim2.fromScale(1, 1)}
				Visible={() => shown() && UserInputService.KeyboardEnabled}
			>
				<Hints k={k} hints={[{ keys: [Enum.KeyCode.F], label, args }]} />
			</frame>
			<frame
				Name="Touch"
				BackgroundTransparency={1}
				Size={UDim2.fromScale(1, 1)}
				Visible={() => shown() && UserInputService.TouchEnabled}
			>
				<ThemeButton
					k={k}
					kind="primary"
					position={() =>
						new UDim2(1, -(BUTTON.X + BUTTON_MARGIN.X) * k(), 1, -(BUTTON.Y + BUTTON_MARGIN.Y) * k())
					}
					size={px(k, BUTTON.X, BUTTON.Y)}
					text={() => t(label(), args())}
					onPress={() => {}}
					onDown={onDown}
					onUp={onUp}
				/>
			</frame>
		</screengui>
	) as ScreenGui;
	cleanup(gui);
	return gui;
}
