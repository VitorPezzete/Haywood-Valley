import Vide, { action, cleanup, source } from "@rbxts/vide";
import { subscribe } from "@rbxts/charm";
import { UserInputService } from "@rbxts/services";
import { TextKey } from "shared/i18n/en";
import { LOCALE_NAMES } from "shared/i18n/locales";
import {
	DEFAULT_SETTINGS,
	LANGUAGE_CHOICES,
	Settings,
	TEXT_SPEED_ORDER,
	TextSpeed,
	UI_THEMES,
	UiTheme,
	VOLUME_STEP,
} from "shared/settings";
import { settings } from "client/state/settings";
import { t, uiLocale } from "./i18n";
import { BODY, Hint, LABEL, PillButton, place, px, ThemeButton } from "./kit";
import { MenuPanel } from "./MenuPanel";
import { metric, pieceSize, themeColor, themed } from "./theme";

// Medidas em pixels de arte, dentro do painel.
const PANEL = new Vector2(300, 210);
const ROW = { x: 12, y: 26, w: 276, h: 20, step: 24 };
/** Onde começam os controles, dentro da linha. */
const CONTROL_X = 116;
const ARROW_W = 20;
const VALUE_W = 108;
const TRACK = { w: 116, h: 12 };
const HELP = { x: 12, y: 150, w: 276, h: 26 };
const BUTTONS_Y = 184;

const ROW_COUNT = 5;
const ROW_LABELS: TextKey[] = [
	"settings.language",
	"settings.music",
	"settings.effects",
	"settings.textSpeed",
	"settings.theme",
];
const ROW_ABOUT: TextKey[] = [
	"settings.about.language",
	"settings.about.music",
	"settings.about.effects",
	"settings.about.textSpeed",
	"settings.about.theme",
];

const SPEED_TEXT: Record<TextSpeed, TextKey> = {
	slow: "textSpeed.slow",
	normal: "textSpeed.normal",
	fast: "textSpeed.fast",
	instant: "textSpeed.instant",
};

const THEME_TEXT: Record<UiTheme, TextKey> = {
	celeiro: "theme.celeiro",
	graal: "theme.graal",
};

const HINTS: Hint[] = [
	{ keys: [Enum.KeyCode.W, Enum.KeyCode.S], label: "hint.navigate" },
	{ keys: [Enum.KeyCode.A, Enum.KeyCode.D], label: "hint.change" },
	{ keys: [Enum.KeyCode.R], label: "hint.reset" },
	{ keys: [Enum.KeyCode.Backspace], label: "common.back" },
];

type Volume = "music" | "effects";

/** O valor seguinte (ou anterior) de uma lista, dando a volta. */
function cycle<T extends defined>(list: readonly T[], value: T, direction: number) {
	const size = list.size();
	return list[(list.indexOf(value) + direction + size) % size];
}

/** A linha que tem o volume `kind`. */
function volumeRow(kind: Volume) {
	return kind === "music" ? 1 : 2;
}

/**
 * Configurações: idioma, volume da música e dos efeitos, velocidade do texto e o tema da interface, no
 * kit do tema em uso. Cada linha é um cartão com o nome à esquerda e o controle à direita (setas em
 * volta do valor, ou barra), e o cursor do tema marca a linha em foco; embaixo, o que ela faz. W e S trocam de linha, A e D mudam o valor, R restaura o padrão e
 * Backspace volta. Tudo aplica na hora. Não depende da tela de título, para um menu de pausa usar.
 */
export function SettingsPanel({ k, onClose }: { k: () => number; onClose: () => void }) {
	// O Vide lê `source`: este espelha o átomo das configurações.
	const current = source(settings());
	cleanup(subscribe(settings, (value) => current(value)));
	const focus = source(0);

	const change = (patch: Partial<Settings>) => settings({ ...settings(), ...patch });

	const step = (row: number, direction: number) => {
		const now = settings();
		if (row === 0) change({ language: cycle(LANGUAGE_CHOICES, now.language, direction) });
		else if (row === 1) change({ music: math.clamp(now.music + direction * VOLUME_STEP, 0, 100) });
		else if (row === 2) change({ effects: math.clamp(now.effects + direction * VOLUME_STEP, 0, 100) });
		else if (row === 3) change({ textSpeed: cycle(TEXT_SPEED_ORDER, now.textSpeed, direction) });
		else if (row === 4) change({ theme: cycle(UI_THEMES, now.theme, direction) });
	};

	// Sem pedir confirmação: são só cinco valores, todos à vista.
	const reset = () => settings(DEFAULT_SETTINGS);

	// Arrastar uma barra com o mouse: qual volume e o trilho dele na tela.
	let dragging: { kind: Volume; track: GuiObject } | undefined;
	const dragTo = (x: number) => {
		if (!dragging) return;
		const { kind, track } = dragging;
		const inner = track.AbsoluteSize.X - 4 * k();
		const fraction = math.clamp((x - track.AbsolutePosition.X - 2 * k()) / math.max(inner, 1), 0, 1);
		if (kind === "music") change({ music: math.round(fraction * 100) });
		else change({ effects: math.round(fraction * 100) });
	};

	// A tecla que abriu o painel não conta.
	let armed = false;
	task.defer(() => {
		armed = true;
	});
	cleanup(
		UserInputService.InputBegan.Connect((input, processed) => {
			if (processed || !armed) return;
			const key = input.KeyCode;
			if (key === Enum.KeyCode.W || key === Enum.KeyCode.Up) {
				focus((focus() - 1 + ROW_COUNT) % ROW_COUNT);
			} else if (key === Enum.KeyCode.S || key === Enum.KeyCode.Down) {
				focus((focus() + 1) % ROW_COUNT);
			} else if (key === Enum.KeyCode.A || key === Enum.KeyCode.Left) {
				step(focus(), -1);
			} else if (key === Enum.KeyCode.D || key === Enum.KeyCode.Right) {
				step(focus(), 1);
			} else if (key === Enum.KeyCode.Space || key === Enum.KeyCode.Return) {
				// Nas barras, Espaço não faz nada: o valor anda com A e D.
				if (focus() === 0 || focus() === 3 || focus() === 4) step(focus(), 1);
			} else if (key === Enum.KeyCode.R) {
				reset();
			} else if (key === Enum.KeyCode.Backspace) {
				onClose();
			}
		}),
	);
	cleanup(
		UserInputService.InputChanged.Connect((input) => {
			const kind = input.UserInputType;
			if (dragging && (kind === Enum.UserInputType.MouseMovement || kind === Enum.UserInputType.Touch)) {
				dragTo(input.Position.X);
			}
		}),
	);
	cleanup(
		UserInputService.InputEnded.Connect((input) => {
			const kind = input.UserInputType;
			if (kind === Enum.UserInputType.MouseButton1 || kind === Enum.UserInputType.Touch) dragging = undefined;
		}),
	);

	/** O texto do valor de uma linha com setas. */
	const valueText = (row: number) => {
		if (row === 0) {
			const choice = current().language;
			return choice === "auto" ? t("language.auto") : LOCALE_NAMES[choice];
		}
		if (row === 4) return t(THEME_TEXT[current().theme]);
		return t(SPEED_TEXT[current().textSpeed]);
	};

	/** Setas em volta do valor: clicar numa seta anda para um lado, clicar no valor anda para a frente. */
	const cycler = (row: number) => {
		const press = (direction: number) => () => {
			focus(row);
			step(row, direction);
		};
		return [
			<ThemeButton
				k={k}
				kind="icon"
				position={place(k, CONTROL_X, 1)}
				size={px(k, ARROW_W, 18)}
				icon={() => "iconBack"}
				zIndex={36}
				onPress={press(-1)}
			/>,
			<imagebutton
				{...themed("textField", k)}
				Name="Value"
				AutoButtonColor={false}
				Position={place(k, CONTROL_X + ARROW_W + 2, 1)}
				Size={px(k, VALUE_W, 18)}
				ZIndex={36}
				Activated={press(1)}
			>
				<textlabel
					BackgroundTransparency={1}
					Size={UDim2.fromScale(1, 1)}
					FontFace={LABEL}
					Text={() => valueText(row)}
					TextColor3={() => themeColor("textOnField")}
					TextSize={() => 5 * k()}
					ZIndex={37}
				/>
			</imagebutton>,
			<ThemeButton
				k={k}
				kind="icon"
				position={place(k, CONTROL_X + ARROW_W + 2 + VALUE_W + 2, 1)}
				size={px(k, ARROW_W, 18)}
				icon={() => "iconNext"}
				zIndex={36}
				onPress={press(1)}
			/>,
		];
	};

	/** Barra de volume, que anda com A e D ou arrastando. */
	const slider = (kind: Volume) => {
		const value = () => current()[kind];
		let track: ImageButton | undefined;
		const fill = () => {
			// O trilho do tema é claro: a parte cheia vai na cor de destaque até o meio do puxador, o resto
			// na cor apagada.
			const f = math.clamp((2 + (value() / 100) * (TRACK.w - 4)) / TRACK.w, 0.001, 0.998);
			const full = themeColor("accent");
			const empty = themeColor("placeholder");
			return new ColorSequence([
				new ColorSequenceKeypoint(0, full),
				new ColorSequenceKeypoint(f, full),
				new ColorSequenceKeypoint(f + 0.001, empty),
				new ColorSequenceKeypoint(1, empty),
			]);
		};
		const knob = () => pieceSize("sliderKnob");
		return [
			<imagebutton
				{...themed("sliderTrack", k)}
				Name="Track"
				AutoButtonColor={false}
				Position={place(k, CONTROL_X, (ROW.h - TRACK.h) / 2)}
				Size={px(k, TRACK.w, TRACK.h)}
				ZIndex={36}
				InputBegan={(input) => {
					const inputType = input.UserInputType;
					if (
						track &&
						(inputType === Enum.UserInputType.MouseButton1 || inputType === Enum.UserInputType.Touch)
					) {
						focus(volumeRow(kind));
						dragging = { kind, track };
						dragTo(input.Position.X);
					}
				}}
			>
				{action((instance: ImageButton) => {
					track = instance;
				})}
				<uigradient Color={fill} />
			</imagebutton>,
			<imagelabel
				{...themed("sliderKnob", k)}
				Name="Knob"
				AnchorPoint={new Vector2(0.5, 0.5)}
				Position={() =>
					UDim2.fromOffset(
						math.round(CONTROL_X + 2 + (value() / 100) * (TRACK.w - 4)) * k(),
						(ROW.h / 2) * k(),
					)
				}
				Size={() => UDim2.fromOffset(knob().X * k(), knob().Y * k())}
				ZIndex={37}
			/>,
			<textlabel
				BackgroundTransparency={1}
				Position={place(k, CONTROL_X + TRACK.w + 4, 0)}
				Size={px(k, 32, ROW.h)}
				FontFace={LABEL}
				Text={() => `${value()}%`}
				TextColor3={() => themeColor("text")}
				TextSize={() => 5 * k()}
				TextXAlignment="Right"
				ZIndex={36}
			/>,
		];
	};

	const row = (label: TextKey, index: number) => (
		<imagelabel
			{...themed("card", k)}
			Name={`Row${index}`}
			Position={place(k, ROW.x, ROW.y + index * ROW.step)}
			Size={px(k, ROW.w, ROW.h)}
			ZIndex={34}
			MouseEnter={() => focus(index)}
		>
			<textlabel
				BackgroundTransparency={1}
				Position={place(k, 8, 0)}
				Size={px(k, CONTROL_X - 12, ROW.h)}
				FontFace={LABEL}
				Text={() => t(label)}
				TextColor3={() => themeColor("text")}
				TextSize={() => 5 * k()}
				TextXAlignment="Left"
				ZIndex={35}
			/>
			{index === 1 ? slider("music") : index === 2 ? slider("effects") : cycler(index)}
		</imagelabel>
	);

	/** O que a linha em foco faz; no idioma automático, também o idioma que ele escolheu. */
	const about = () => {
		if (focus() === 0 && current().language === "auto") {
			return t("settings.about.languageAuto", { language: LOCALE_NAMES[uiLocale()] });
		}
		return t(ROW_ABOUT[focus()]);
	};

	return (
		<MenuPanel k={k} title={() => t("menu.settings")} size={PANEL} hints={HINTS} onClose={onClose}>
			{ROW_LABELS.map(row)}
			<imagelabel
				{...themed("cursor", k)}
				Name="Focus"
				Position={() => {
					const out = metric("cursorOutset");
					return UDim2.fromOffset((ROW.x - out) * k(), (ROW.y - out + focus() * ROW.step) * k());
				}}
				Size={() => {
					const out = metric("cursorOutset");
					return UDim2.fromOffset((ROW.w + out * 2) * k(), (ROW.h + out * 2) * k());
				}}
				ZIndex={38}
			/>
			<imagelabel
				{...themed("well", k)}
				Name="Help"
				Position={place(k, HELP.x, HELP.y)}
				Size={px(k, HELP.w, HELP.h)}
				ZIndex={34}
			>
				<textlabel
					BackgroundTransparency={1}
					Position={place(k, 6, 4)}
					Size={px(k, HELP.w - 12, HELP.h - 8)}
					FontFace={BODY}
					Text={about}
					TextColor3={() => themeColor("text")}
					TextSize={() => 8 * k()}
					TextWrapped={true}
					TextXAlignment="Left"
					TextYAlignment="Center"
					ZIndex={35}
				/>
			</imagelabel>
			<PillButton
				k={k}
				text={() => t("settings.defaults")}
				x={HELP.x}
				y={BUTTONS_Y}
				width={110}
				zIndex={34}
				onPress={reset}
			/>
			<PillButton
				k={k}
				text={() => t("common.back")}
				x={PANEL.X - HELP.x - 56}
				y={BUTTONS_Y}
				width={56}
				zIndex={34}
				onPress={onClose}
			/>
		</MenuPanel>
	);
}
