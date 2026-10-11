import Vide, { cleanup, Show, source, spring } from "@rbxts/vide";
import { RunService, UserInputService } from "@rbxts/services";
import { Screen } from "client/state/screen";
import { LOGO, TITLE, TITLE_CLOUDS, UiArt } from "./art";
import { CustomizeScreen } from "./CustomizeScreen";
import { art, BODY, Hints, INK, px, screenScale, SERIF, WHITE } from "./kit";

const SKY_TOP = Color3.fromRGB(46, 150, 236);
const SKY_BOTTOM = Color3.fromRGB(120, 200, 250);

/** Segundos que a tela leva para sumir depois de o jogo começar. */
export const OPEN_SECONDS = 1;
const VERSION = "Versão 0.1";

type Panel = "settings" | "credits";

interface Entry {
	label: string;
	action: "new" | "quit" | Panel;
}

const MENU: Entry[] = [
	{ label: "Começar novo jogo", action: "new" },
	{ label: "Configurações", action: "settings" },
	{ label: "Créditos", action: "credits" },
	{ label: "Sair", action: "quit" },
];

const PANELS: Record<Panel, { title: string; body: string }> = {
	settings: {
		title: "Configurações",
		body: "Ainda não há o que ajustar.\nSom e controles chegam nas próximas versões.",
	},
	credits: {
		title: "Créditos",
		body: "Haywood Valley\n\nCriação e direção: VitorPezzete\n\nPersonagens: Cozy People Asset Pack, de shubibubi.\n\nFeito no Roblox com roblox-ts, Flamework, Vide e Charm.",
	},
};

interface Props {
	stage: () => Screen;
	onNewGame: () => void;
	onQuit: () => void;
	/** Chamado ao sair da tela de personalizar: `true` para começar o jogo, `false` para voltar ao menu. */
	onCustomized: (confirmed: boolean) => void;
}

/**
 * Tela de título: uma cena ilustrada com nuvens passando, a logo no alto e o menu no canto de
 * baixo. Mostra "Carregando" até as imagens chegarem, abre a personalização do personagem e some
 * quando o jogo começa.
 */
export function StartScreen({ stage, onNewGame, onQuit, onCustomized }: Props) {
	const { viewport, k } = screenScale();

	// A cena cobre a tela inteira com ampliação inteira; o que sobra é cortado à direita e em cima.
	const cover = () => math.max(1, math.ceil(math.max(viewport().X / TITLE.size.X, viewport().Y / TITLE.size.Y)));

	const clock = source(os.clock());
	cleanup(RunService.RenderStepped.Connect(() => clock(os.clock())));

	// Véu preto atrás da tela de personalizar (0 fechado, 1 aberto). Quando o jogo começa, ele abre
	// e revela o mundo.
	const [veil] = spring(() => (stage() === "customize" ? 0 : 1), OPEN_SECONDS, 1);
	// O título some de uma vez ao começar o jogo: nessa hora o véu ainda cobre a tela.
	const gone = () => (stage() === "playing" ? 1 : 0);

	const selected = source(0);
	const panel = source<Panel | undefined>(undefined);

	const choose = (index: number) => {
		const { action } = MENU[index];
		if (action === "new") onNewGame();
		else if (action === "quit") onQuit();
		else panel(action);
	};

	cleanup(
		UserInputService.InputBegan.Connect((input, processed) => {
			if (processed || stage() !== "menu") return;
			const key = input.KeyCode;
			if (panel() !== undefined) {
				if (key === Enum.KeyCode.Escape || key === Enum.KeyCode.Backspace || key === Enum.KeyCode.Space || key === Enum.KeyCode.Return) {
					panel(undefined);
				}
			} else if (key === Enum.KeyCode.W || key === Enum.KeyCode.Up) {
				selected((selected() - 1 + MENU.size()) % MENU.size());
			} else if (key === Enum.KeyCode.S || key === Enum.KeyCode.Down) {
				selected((selected() + 1) % MENU.size());
			} else if (key === Enum.KeyCode.Space || key === Enum.KeyCode.Return) {
				choose(selected());
			}
		}),
	);

	const ROW = 21;

	const cloud = (spot: (typeof TITLE_CLOUDS)[number]) => {
		const width = spot.piece.size.X;
		const lap = TITLE.size.X + width;
		return (
			<imagelabel
				{...art(spot.piece)}
				Name="Cloud"
				ZIndex={2}
				ImageTransparency={gone}
				Size={() => UDim2.fromOffset(width * cover(), spot.piece.size.Y * cover())}
				Position={() => {
					// Atravessa a cena da esquerda para a direita e volta a entrar pelo outro lado.
					const x = ((spot.start + clock() * spot.speed) % lap) - width;
					return UDim2.fromOffset(math.round(x * cover()), spot.y * cover());
				}}
			/>
		);
	};

	const entry = (item: Entry, index: number) => (
		<textbutton
			Name={item.label}
			BackgroundTransparency={1}
			LayoutOrder={index}
			AutomaticSize="X"
			Size={() => UDim2.fromOffset(0, ROW * k())}
			FontFace={SERIF}
			Text={item.label}
			TextColor3={WHITE}
			TextSize={() => 12 * k()}
			TextXAlignment="Left"
			TextTransparency={() => math.max(gone(), selected() === index ? 0 : 0.1)}
			MouseEnter={() => selected(index)}
			Activated={() => choose(index)}
		>
			<uistroke Color={INK} Thickness={k} Transparency={() => math.max(gone(), 0.45)} />
		</textbutton>
	);

	const gui = (
		<screengui Name="StartScreen" IgnoreGuiInset={true} ResetOnSpawn={false} DisplayOrder={100}>
			<frame Name="Sky" Size={UDim2.fromScale(1, 1)} BorderSizePixel={0} BackgroundColor3={WHITE} BackgroundTransparency={gone}>
				<uigradient Rotation={90} Color={new ColorSequence(SKY_TOP, SKY_BOTTOM)} />
			</frame>

			<frame
				Name="Scene"
				BackgroundTransparency={1}
				ClipsDescendants={true}
				AnchorPoint={new Vector2(0, 1)}
				Position={UDim2.fromScale(0, 1)}
				Size={() => UDim2.fromOffset(TITLE.size.X * cover(), TITLE.size.Y * cover())}
			>
				<imagelabel
					Name="Back"
					BackgroundTransparency={1}
					Size={UDim2.fromScale(1, 1)}
					Image={TITLE.back}
					ResampleMode="Pixelated"
					ZIndex={1}
					ImageTransparency={gone}
				/>
				{TITLE_CLOUDS.map(cloud)}
				<imagelabel
					Name="Front"
					BackgroundTransparency={1}
					Size={UDim2.fromScale(1, 1)}
					Image={TITLE.front}
					ResampleMode="Pixelated"
					ZIndex={3}
					ImageTransparency={gone}
				/>
			</frame>

			<imagelabel
				Name="Logo"
				BackgroundTransparency={1}
				AnchorPoint={new Vector2(0.5, 0)}
				Position={() => new UDim2(0.5, 0, 0, 16 * k())}
				Image={LOGO.image}
				ResampleMode="Pixelated"
				ZIndex={4}
				ImageTransparency={gone}
				Size={px(k, LOGO.size.X, LOGO.size.Y)}
			/>

			<Show when={() => stage() === "loading"}>
				{() => (
					<textlabel
						Name="Loading"
						BackgroundTransparency={1}
						AnchorPoint={new Vector2(0, 1)}
						Position={() => new UDim2(0, 26 * k(), 1, -30 * k())}
						AutomaticSize="XY"
						FontFace={SERIF}
						Text="Carregando..."
						TextColor3={WHITE}
						TextSize={() => 12 * k()}
						ZIndex={5}
					>
						<uistroke Color={INK} Thickness={k} Transparency={0.45} />
					</textlabel>
				)}
			</Show>

			<Show when={() => stage() === "menu"}>
				{() => (
					<frame
						Name="Menu"
						BackgroundTransparency={1}
						AnchorPoint={new Vector2(0, 1)}
						Position={() => new UDim2(0, 26 * k(), 1, -22 * k())}
						AutomaticSize="XY"
						ZIndex={5}
					>
						<uilistlayout SortOrder="LayoutOrder" />
						{MENU.map(entry)}
						<frame Name="Cursor" BackgroundTransparency={1} LayoutOrder={-1} Size={UDim2.fromOffset(0, 0)}>
							<imagelabel
								{...art(UiArt.cursorHand)}
								AnchorPoint={new Vector2(1, 0.5)}
								ImageTransparency={gone}
								Size={px(k, UiArt.cursorHand.size.X, UiArt.cursorHand.size.Y)}
								Position={() => {
									// A mãozinha balança de leve ao lado do item escolhido.
									const sway = math.round(math.sin(clock() * 5) * 1.5) * k();
									return UDim2.fromOffset(-3 * k() + sway, math.round((selected() + 0.5) * ROW) * k());
								}}
							/>
						</frame>
					</frame>
				)}
			</Show>

			<textlabel
				Name="Version"
				BackgroundTransparency={1}
				AnchorPoint={new Vector2(0, 1)}
				Position={() => new UDim2(0, 24 * k(), 1, -6 * k())}
				AutomaticSize="XY"
				FontFace={BODY}
				Text={VERSION}
				TextColor3={WHITE}
				TextSize={() => 6 * k()}
				TextTransparency={() => math.max(gone(), 0.1)}
				ZIndex={5}
			/>

			<Show when={() => stage() === "menu"}>
				{() => (
					<Hints
						k={k}
						hints={[
							{ keys: ["W", "S"], label: "Navegar" },
							{ keys: ["Espaço"], label: "Selecionar" },
						]}
					/>
				)}
			</Show>

			<frame
				Name="Veil"
				Size={UDim2.fromScale(1, 1)}
				BorderSizePixel={0}
				BackgroundColor3={Color3.fromRGB(0, 0, 0)}
				BackgroundTransparency={veil}
				ZIndex={8}
			/>

			<Show when={() => stage() === "customize"}>{() => <CustomizeScreen k={k} onDone={onCustomized} />}</Show>

			<Show when={() => panel() !== undefined && stage() === "menu"}>
				{() => (
					<textbutton
						Name="Panel"
						AutoButtonColor={false}
						Text=""
						Size={UDim2.fromScale(1, 1)}
						BackgroundColor3={INK}
						BackgroundTransparency={0.45}
						ZIndex={30}
						Activated={() => panel(undefined)}
					>
						<frame
							AnchorPoint={new Vector2(0.5, 0.5)}
							Position={UDim2.fromScale(0.5, 0.5)}
							Size={px(k, 230, 130)}
							BackgroundColor3={INK}
							BackgroundTransparency={0.08}
							ZIndex={31}
						>
							<uicorner CornerRadius={() => new UDim(0, 4 * k())} />
							<uipadding
								PaddingTop={() => new UDim(0, 12 * k())}
								PaddingLeft={() => new UDim(0, 14 * k())}
								PaddingRight={() => new UDim(0, 14 * k())}
								PaddingBottom={() => new UDim(0, 10 * k())}
							/>
							<textlabel
								BackgroundTransparency={1}
								Size={() => new UDim2(1, 0, 0, 18 * k())}
								FontFace={SERIF}
								Text={() => PANELS[panel() ?? "credits"].title}
								TextColor3={WHITE}
								TextSize={() => 12 * k()}
								TextXAlignment="Left"
								ZIndex={32}
							/>
							<textlabel
								BackgroundTransparency={1}
								Position={() => UDim2.fromOffset(0, 24 * k())}
								Size={() => new UDim2(1, 0, 1, -42 * k())}
								FontFace={BODY}
								Text={() => PANELS[panel() ?? "credits"].body}
								TextColor3={WHITE}
								TextSize={() => 8 * k()}
								TextWrapped={true}
								TextXAlignment="Left"
								TextYAlignment="Top"
								ZIndex={32}
							/>
							<textlabel
								BackgroundTransparency={1}
								AnchorPoint={new Vector2(1, 1)}
								Position={UDim2.fromScale(1, 1)}
								AutomaticSize="XY"
								FontFace={BODY}
								Text="Clique ou Espaço para voltar"
								TextColor3={WHITE}
								TextTransparency={0.3}
								TextSize={() => 6 * k()}
								ZIndex={32}
							/>
						</frame>
					</textbutton>
				)}
			</Show>
		</screengui>
	) as ScreenGui;
	// Desmontar o Vide só encerra os efeitos; a tela precisa ser destruída à parte.
	cleanup(gui);
	return gui;
}
