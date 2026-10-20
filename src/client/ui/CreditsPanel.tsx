import Vide, { cleanup } from "@rbxts/vide";
import { UserInputService } from "@rbxts/services";
import { Graal } from "shared/graal";
import { t } from "./i18n";
import { BODY, Hint, LABEL, PillButton, place, px, SERIF } from "./kit";
import { themeColor, themed } from "./theme";
import { MenuPanel } from "./MenuPanel";
import { ThemeColorName } from "./themes/types";

// Nomes próprios: não se traduzem.
const GAME_NAME = "Haywood Valley";
const AUTHOR = "VitorPezzete";
/** Quem desenhou as cabeças e os corpos (os autores das peças) e quem assina os moldes dos corpos. */
const CONTRIBUTORS = [...Graal.authors, "Qwertzilla"].join(", ");
const BUBBLE_PACK = "Cozy People Asset Pack";
const BUBBLE_ARTIST = "shubibubi";

// Medidas em pixels de arte, dentro do painel.
const PANEL = new Vector2(300, 214);
const PAGE = { x: 12, y: 26, w: 276, h: 156 };
const BACK = { x: 232, y: 188, w: 56 };

type LineStyle = "title" | "heading" | "name";

/** Estilo de cada linha: fonte, tamanho, cor e altura da caixa. */
const STYLES: Record<LineStyle, { font: Font; size: number; color: ThemeColorName; height: number }> = {
	title: { font: SERIF, size: 12, color: "text", height: 14 },
	heading: { font: LABEL, size: 5, color: "accent", height: 7 },
	name: { font: BODY, size: 8, color: "text", height: 10 },
};

interface Line {
	y: number;
	style: LineStyle;
	text: () => string;
	lines?: number;
}

/** As linhas da página, de cima para baixo; `y` é a altura dentro do pergaminho e `lines`, quantas linhas a caixa tem. */
const LINES: Line[] = [
	{ y: 8, style: "title", text: () => GAME_NAME },
	{ y: 28, style: "heading", text: () => t("credits.createdBy") },
	{ y: 37, style: "name", text: () => AUTHOR },
	{ y: 55, style: "heading", text: () => t("credits.characters") },
	{ y: 64, style: "name", text: () => CONTRIBUTORS, lines: 2 },
	{ y: 92, style: "heading", text: () => t("credits.bubbles") },
	{ y: 101, style: "name", text: () => BUBBLE_PACK },
	{ y: 111, style: "name", text: () => t("credits.by", { author: BUBBLE_ARTIST }) },
	{ y: 129, style: "heading", text: () => t("credits.madeWith") },
	{ y: 138, style: "name", text: () => t("credits.tools") },
];

const HINTS: Hint[] = [{ keys: [Enum.KeyCode.Backspace], label: "common.back" }];

/** Créditos: quem fez o jogo e a arte de terceiros que ele usa, num pergaminho dentro do painel. */
export function CreditsPanel({ k, onClose }: { k: () => number; onClose: () => void }) {
	// A tecla que abriu o painel não conta.
	let armed = false;
	task.defer(() => {
		armed = true;
	});
	cleanup(
		UserInputService.InputBegan.Connect((input, processed) => {
			if (processed || !armed) return;
			const key = input.KeyCode;
			// O Esc fica de fora: o Roblox abre o menu dele com essa tecla.
			if (key === Enum.KeyCode.Backspace || key === Enum.KeyCode.Space || key === Enum.KeyCode.Return) {
				onClose();
			}
		}),
	);

	return (
		<MenuPanel k={k} title={() => t("menu.credits")} size={PANEL} hints={HINTS} onClose={onClose}>
			<imagelabel
				{...themed("card", k)}
				Name="Page"
				Position={place(k, PAGE.x, PAGE.y)}
				Size={px(k, PAGE.w, PAGE.h)}
				ZIndex={34}
			>
				{LINES.map((line) => {
					const style = STYLES[line.style];
					return (
						<textlabel
							BackgroundTransparency={1}
							Position={place(k, 6, line.y)}
							Size={px(k, PAGE.w - 12, style.height * (line.lines ?? 1))}
							FontFace={style.font}
							Text={line.text}
							TextWrapped={line.lines !== undefined}
							TextColor3={() => themeColor(style.color)}
							TextSize={() => style.size * k()}
							ZIndex={35}
						/>
					);
				})}
			</imagelabel>
			<PillButton
				k={k}
				text={() => t("common.back")}
				x={BACK.x}
				y={BACK.y}
				width={BACK.w}
				zIndex={34}
				onPress={onClose}
			/>
		</MenuPanel>
	);
}
