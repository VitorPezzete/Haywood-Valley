import Vide, { cleanup } from "@rbxts/vide";
import { LABEL, px, screenScale } from "./kit";
import { themeColor, themed } from "./theme";

/** A plaquinha da zona: altura e largura mínima, em pixels de arte; ela cresce com o nome. */
const ZONE_TAG = new Vector2(40, 13);
/** Folga da plaquinha até o canto de cima à esquerda, abaixo da barra do Roblox. */
const ZONE_MARGIN = new Vector2(8, 6);

/**
 * O que o `MapController` mostra por cima do jogo: o véu preto curto da troca de mapa e, no canto de cima à
 * esquerda, a plaquinha com o nome da zona em que o jogador acabou de entrar (a peça `nameTag` do tema, a
 * mesma da caixa de diálogo).
 */
export function MapHud({
	veil,
	zoneName,
	zoneFade,
}: {
	/** Transparência do véu: 1 aberto, 0 fechado. */
	veil: () => number;
	zoneName: () => string;
	/** Transparência da plaquinha. */
	zoneFade: () => number;
}) {
	const { k } = screenScale();
	const gui = (
		<screengui Name="MapHud" ResetOnSpawn={false} DisplayOrder={45} AutoLocalize={false} IgnoreGuiInset={false}>
			<imagelabel
				{...themed("nameTag", k)}
				Name="Zone"
				Position={() => UDim2.fromOffset(ZONE_MARGIN.X * k(), ZONE_MARGIN.Y * k())}
				Size={px(k, ZONE_TAG.X, ZONE_TAG.Y)}
				AutomaticSize="X"
				ImageTransparency={zoneFade}
				Visible={() => zoneFade() < 1}
			>
				<uipadding PaddingLeft={() => new UDim(0, 10 * k())} PaddingRight={() => new UDim(0, 8 * k())} />
				<textlabel
					BackgroundTransparency={1}
					Size={() => new UDim2(0, 0, 1, 0)}
					AutomaticSize="X"
					FontFace={LABEL}
					Text={zoneName}
					TextColor3={() => themeColor("textOnTitle")}
					TextTransparency={zoneFade}
					TextSize={() => 6 * k()}
				/>
			</imagelabel>
			<frame
				Name="Veil"
				Position={() => UDim2.fromOffset(0, -80)}
				Size={() => new UDim2(1, 0, 1, 160)}
				BackgroundColor3={new Color3(0, 0, 0)}
				BorderSizePixel={0}
				BackgroundTransparency={veil}
				Visible={() => veil() < 1}
				ZIndex={10}
			/>
		</screengui>
	) as ScreenGui;
	cleanup(gui);
	return gui;
}
