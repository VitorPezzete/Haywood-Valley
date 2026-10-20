import Vide, { cleanup, derive, Show, source, spring } from "@rbxts/vide";
import { subscribe } from "@rbxts/charm";
import { RunService, UserInputService } from "@rbxts/services";
import { TextKey } from "shared/i18n/en";
import { decodeSavedLook } from "shared/playerData";
import { playerData } from "client/state/playerData";
import { Screen } from "client/state/screen";
import { LOGO, TITLE, TITLE_SHADOW_SLOPE, TITLE_SHADOWS, TITLE_WATER, TITLE_WATER_FPS, WaterStrip } from "./art";
import { CreditsPanel } from "./CreditsPanel";
import { CustomizeScreen } from "./CustomizeScreen";
import { t } from "./i18n";
import { art, BODY, Hints, INK, px, screenScale, SERIF, ThemeButton, WHITE } from "./kit";
import { SettingsPanel } from "./SettingsPanel";
import { pieceSize, themed } from "./theme";
import { ThemePieceName } from "./themes/types";

/** O fundo enquanto a cena não carrega: o verde da grama. */
const GRASS = Color3.fromRGB(86, 150, 62);
/** A cor das sombras de nuvem e o quanto elas deixam ver. */
const SHADOW = Color3.fromRGB(12, 34, 30);
const SHADOW_TRANSPARENCY = 0.8;

/** Segundos que a tela leva para sumir depois de o jogo começar. */
export const OPEN_SECONDS = 1;
/** Número da versão; o texto em volta vem da tradução. */
const VERSION = "0.1";

type Panel = "settings" | "credits";

interface Entry {
	label: TextKey;
	action: "play" | "edit" | "quit" | Panel;
	icon: ThemePieceName;
}

/**
 * As opções do menu. Cada jogador tem um personagem só (decisão do usuário em 2026-10-17): a primeira
 * opção é Começar para quem é novo (abre a tela de personalizar) e Continuar para quem já tem
 * personagem salvo (entra direto). Quem já tem personagem também vê Editar personagem, que abre a tela
 * de personalizar a partir dele.
 */
const MENU: Entry[] = [
	{ label: "menu.start", action: "play", icon: "iconNext" },
	{ label: "menu.editCharacter", action: "edit", icon: "iconHead" },
	{ label: "menu.settings", action: "settings", icon: "iconSettings" },
	{ label: "menu.credits", action: "credits", icon: "iconCredits" },
	{ label: "menu.quit", action: "quit", icon: "iconBack" },
];

/** O painel do menu, no canto de baixo à direita, em pixels de arte. */
const MENU_PANEL = { w: 136, inner: 10, button: 22, step: 26, right: 12, bottom: 30 };

interface Props {
	stage: () => Screen;
	/** Entrar no jogo com o personagem salvo. */
	onContinue: () => void;
	/** Abrir a tela de personalizar. */
	onNewGame: () => void;
	onQuit: () => void;
	/** Chamado ao sair da tela de personalizar: `true` para começar o jogo, `false` para voltar ao menu. */
	onCustomized: (confirmed: boolean) => void;
}

/**
 * Tela de título: a vila com a fazenda vista na diagonal (pedido do usuário em 2026-10-17), com a
 * câmera passeando devagar, a água do rio correndo e sombras de nuvem passando; a logo no alto e o
 * menu num painel do tema no canto de baixo à direita. Mostra "Carregando" até as imagens chegarem,
 * abre a personalização do personagem e some quando o jogo começa.
 */
export function StartScreen({ stage, onContinue, onNewGame, onQuit, onCustomized }: Props) {
	const { viewport, k } = screenScale();

	// A vista de 480×270 cobre a tela inteira com ampliação inteira; o que sobra é cortado nas bordas.
	const cover = () => math.max(1, math.ceil(math.max(viewport().X / TITLE.view.X, viewport().Y / TITLE.view.Y)));

	const opened = os.clock();
	const clock = source(os.clock());
	cleanup(RunService.RenderStepped.Connect(() => clock(os.clock())));

	// Véu preto atrás da tela de personalizar (0 fechado, 1 aberto). Quando o jogo começa, ele abre
	// e revela o mundo.
	const [veil] = spring(() => (stage() === "customize" ? 0 : 1), OPEN_SECONDS, 1);
	// O título some de uma vez ao começar o jogo: nessa hora o véu ainda cobre a tela.
	const gone = () => (stage() === "playing" ? 1 : 0);

	// O que está salvo do jogador: com personagem, o menu mostra Continuar e Editar personagem.
	const saved = source(playerData());
	cleanup(subscribe(playerData, (value) => saved(value)));
	const savedLook = derive(() => decodeSavedLook(saved().character));
	const entries = derive(() => MENU.filter((entry) => entry.action !== "edit" || savedLook() !== undefined));
	/** O texto de uma opção: a primeira diz Continuar para quem já tem personagem. */
	const labelOf = (item: Entry): TextKey =>
		item.action === "play" && savedLook() !== undefined ? "menu.continue" : item.label;

	const selected = source(0);
	const panel = source<Panel | undefined>(undefined);
	// Fecha no fim do quadro: a mesma tecla não chega ao menu e não reabre o painel.
	const close = () => task.defer(() => panel(undefined));

	const choose = (index: number) => {
		const entry = entries()[index];
		if (!entry) return;
		const { action } = entry;
		if (action === "play") {
			if (savedLook() !== undefined) onContinue();
			else onNewGame();
		} else if (action === "edit") onNewGame();
		else if (action === "quit") onQuit();
		else panel(action);
	};

	cleanup(
		UserInputService.InputBegan.Connect((input, processed) => {
			// Com um painel aberto, as teclas são dele.
			if (processed || stage() !== "menu" || panel() !== undefined) return;
			const key = input.KeyCode;
			const count = entries().size();
			if (key === Enum.KeyCode.W || key === Enum.KeyCode.Up) {
				selected((selected() - 1 + count) % count);
			} else if (key === Enum.KeyCode.S || key === Enum.KeyCode.Down) {
				selected((selected() + 1) % count);
			} else if (key === Enum.KeyCode.Space || key === Enum.KeyCode.Return) {
				choose(selected());
			}
		}),
	);

	/**
     * Onde a câmera está: o canto de cima à esquerda do que a tela mostra, em pixels da cena. Ela vai de
     * `panFrom` a `panTo` e volta, mais devagar nas pontas; a tela pode mostrar menos que 480×270, e
     * aí o recorte fica no meio da vista.
     */
	const camera = () => {
		const phase = ((clock() - opened) / TITLE.panSeconds) % 2;
		const along = (1 - math.cos(math.pi * (phase > 1 ? 2 - phase : phase))) / 2;
		const view = TITLE.panFrom.Lerp(TITLE.panTo, along);
		const shown = viewport().div(cover());
		const corner = view.add(TITLE.view.sub(shown).div(2));
		return new Vector2(
			math.clamp(corner.X, 0, math.max(TITLE.size.X - shown.X, 0)),
			math.clamp(corner.Y, 0, math.max(TITLE.size.Y - shown.Y, 0)),
		);
	};

	/** Uma faixa do rio: os quadros da água trocam por cima da que está desenhada na cena. */
	const water = (strip: WaterStrip) => (
		<imagelabel
			Name="Water"
			BackgroundTransparency={1}
			Position={() => UDim2.fromOffset(strip.at.X * cover(), strip.at.Y * cover())}
			Size={() => UDim2.fromOffset(strip.size.X * cover(), strip.size.Y * cover())}
			Image={strip.image}
			ImageRectSize={strip.size}
			ImageRectOffset={() => strip.frames[math.floor(clock() * TITLE_WATER_FPS) % strip.frames.size()]}
			ResampleMode="Pixelated"
			ImageTransparency={gone}
			ZIndex={2}
		/>
	);

	const shadow = (spot: (typeof TITLE_SHADOWS)[number]) => {
		const width = spot.piece.size.X;
		const lap = TITLE.size.X + width;
		return (
			<imagelabel
				{...art(spot.piece)}
				Name="CloudShadow"
				ZIndex={3}
				ImageColor3={SHADOW}
				ImageTransparency={() => math.max(gone(), SHADOW_TRANSPARENCY)}
				Size={() => UDim2.fromOffset(width * cover(), spot.piece.size.Y * cover())}
				Position={() => {
					// Atravessa a cena da esquerda para a direita, descendo um pouco, e volta a entrar pelo outro lado.
					const x = ((spot.start + clock() * spot.speed) % lap) - width;
					const y = spot.y + (x + width) * TITLE_SHADOW_SLOPE;
					return UDim2.fromOffset(math.round(x * cover()), math.round(y * cover()));
				}}
			/>
		);
	};

	/** Um botão do menu, na posição `index` da lista que aparece agora. */
	const entry = (item: Entry) => {
		const index = () => entries().indexOf(item);
		return (
			<frame BackgroundTransparency={1} Size={UDim2.fromScale(1, 1)} Visible={() => index() >= 0} ZIndex={6}>
				<ThemeButton
					k={k}
					kind={() => (index() === 0 ? "primary" : "secondary")}
					position={() =>
						UDim2.fromOffset(
							MENU_PANEL.inner * k(),
							(MENU_PANEL.inner + math.max(index(), 0) * MENU_PANEL.step) * k(),
						)
					}
					size={px(k, MENU_PANEL.w - MENU_PANEL.inner * 2, MENU_PANEL.button)}
					icon={() => item.icon}
					text={() => t(labelOf(item))}
					font={SERIF}
					textSize={9}
					chosen={() => selected() === index()}
					fade={gone}
					zIndex={7}
					onHover={(hovered) => {
						// O Roblox avisa a entrada do mouse mesmo com o painel por cima: com um painel aberto, o menu
						// guarda o item que o abriu.
						if (hovered && panel() === undefined) selected(index());
					}}
					onPress={() => choose(index())}
				/>
			</frame>
		);
	};

	const panelHeight = () =>
		MENU_PANEL.inner * 2 + entries().size() * MENU_PANEL.step - (MENU_PANEL.step - MENU_PANEL.button);

	const gui = (
		<screengui Name="StartScreen" IgnoreGuiInset={true} ResetOnSpawn={false} DisplayOrder={100} AutoLocalize={false}>
			<frame
				Name="Scene"
				Size={UDim2.fromScale(1, 1)}
				BorderSizePixel={0}
				BackgroundColor3={GRASS}
				BackgroundTransparency={gone}
				ClipsDescendants={true}
			>
				<frame
					Name="World"
					BackgroundTransparency={1}
					Position={() => {
						const at = camera().mul(-cover());
						return UDim2.fromOffset(math.round(at.X), math.round(at.Y));
					}}
					Size={() => UDim2.fromOffset(TITLE.size.X * cover(), TITLE.size.Y * cover())}
				>
					<imagelabel
						Name="Village"
						BackgroundTransparency={1}
						Size={UDim2.fromScale(1, 1)}
						Image={TITLE.image}
						ResampleMode="Pixelated"
						ZIndex={1}
						ImageTransparency={gone}
					/>
					{TITLE_WATER.map(water)}
					{TITLE_SHADOWS.map(shadow)}
				</frame>
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
						Text={() => t("title.loading")}
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
					<imagelabel
						{...themed("panel", k)}
						Name="Menu"
						AnchorPoint={new Vector2(1, 1)}
						Position={() => new UDim2(1, -MENU_PANEL.right * k(), 1, -MENU_PANEL.bottom * k())}
						Size={() => UDim2.fromOffset(MENU_PANEL.w * k(), panelHeight() * k())}
						ImageTransparency={gone}
						ZIndex={5}
					>
						{MENU.map(entry)}
						<imagelabel
							{...themed("menuPointer", k)}
							Name="Pointer"
							AnchorPoint={new Vector2(1, 0.5)}
							ImageTransparency={() => (panel() !== undefined ? 1 : gone())}
							Size={() => {
								const size = pieceSize("menuPointer");
								return UDim2.fromOffset(size.X * k(), size.Y * k());
							}}
							Position={() => {
								// A mãozinha balança de leve ao lado do botão escolhido.
								const sway = math.round(math.sin(clock() * 5) * 1.5) * k();
								const y = MENU_PANEL.inner + selected() * MENU_PANEL.step + MENU_PANEL.button / 2;
								return UDim2.fromOffset(2 * k() + sway, y * k());
							}}
							ZIndex={9}
						/>
					</imagelabel>
				)}
			</Show>

			<textlabel
				Name="Version"
				BackgroundTransparency={1}
				AnchorPoint={new Vector2(0, 1)}
				Position={() => new UDim2(0, 24 * k(), 1, -6 * k())}
				AutomaticSize="XY"
				FontFace={BODY}
				Text={() => t("title.version", { version: VERSION })}
				TextColor3={WHITE}
				TextSize={() => 6 * k()}
				TextTransparency={() => math.max(gone(), 0.1)}
				ZIndex={5}
			/>

			<Show when={() => stage() === "menu" && panel() === undefined}>
				{() => (
					<Hints
						k={k}
						hints={[
							{ keys: [Enum.KeyCode.W, Enum.KeyCode.S], label: "hint.navigate" },
							{ keys: [Enum.KeyCode.Space], label: "hint.select" },
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

			<Show when={() => stage() === "menu" && panel() === "settings"}>
				{() => <SettingsPanel k={k} onClose={close} />}
			</Show>

			<Show when={() => stage() === "menu" && panel() === "credits"}>
				{() => <CreditsPanel k={k} onClose={close} />}
			</Show>
		</screengui>
	) as ScreenGui;
	// Desmontar o Vide só encerra os efeitos; a tela precisa ser destruída à parte.
	cleanup(gui);
	return gui;
}
