import Vide, { cleanup } from "@rbxts/vide";
import { UserInputService } from "@rbxts/services";
import { BUY_STACK, ITEM_ORDER, itemDef } from "shared/items";
import { Sprites } from "client/world/sprites";
import { keyName, t } from "./i18n";
import { BODY, LABEL, px, screenScale, ThemeButton } from "./kit";
import { themeColor, themed } from "./theme";

/** O botão do inventário, em pixels de arte: tamanho e lugar (embaixo do botão Decorar, no canto de cima à direita). */
const OPEN_BUTTON = new Vector2(72, 20);
const OPEN_TOP = 32;
const MARGIN = 8;
/** O painel: largura, folga, a linha das moedas e cada linha de item (a vaga do ícone e o botão da direita). */
const PANEL = { width: 208, pad: 6, top: OPEN_TOP + OPEN_BUTTON.Y + 6, coins: 14, keys: 10 };
const ROW = { height: 26, cell: 24, icon: 20, button: new Vector2(100, 18) };
const PANEL_HEIGHT = PANEL.pad * 2 + 6 + PANEL.coins + ITEM_ORDER.size() * ROW.height + PANEL.keys;
/** A tecla que abre e fecha (Tab e Esc são do Roblox). */
export const INVENTORY_KEY = Enum.KeyCode.I;

export interface InventoryHudProps {
	/** Se o jogo está rodando (o botão aparece). */
	available: () => boolean;
	open: () => boolean;
	count: (item: string) => number;
	coins: () => number;
	onToggle: () => void;
	onSell: (item: string) => void;
	onBuy: (item: string) => void;
}

/** Posição em pixels de arte dentro de um quadro. */
function at(k: () => number, x: number, y: number) {
	return () => UDim2.fromOffset(x * k(), y * k());
}

/**
 * Uma linha do painel: o ícone (um sprite do protótipo, sem arte nova), o nome e quantos, e o botão da direita:
 * vender tudo (o item que se vende, apagado sem nenhum) ou comprar `BUY_STACK` (apagado sem moedas que bastem).
 */
function Row(props: InventoryHudProps, k: () => number, item: string, index: number) {
	const def = itemDef(item)!;
	const sprite = Sprites[def.icon];
	const y = PANEL.pad + 6 + PANEL.coins + index * ROW.height;
	const count = () => props.count(item);
	const sell = def.sell;
	const buy = def.buy;
	const usable = () =>
		sell !== undefined ? count() > 0 : buy !== undefined ? props.coins() >= buy * BUY_STACK : false;
	return (
		<frame Name={`Item_${item}`} BackgroundTransparency={1} Position={at(k, 0, y)} Size={px(k, PANEL.width, ROW.height)} ZIndex={21}>
			<imagelabel {...themed("cell", k)} Position={at(k, PANEL.pad, 1)} Size={px(k, ROW.cell, ROW.cell)} ZIndex={21}>
				<imagelabel
					BackgroundTransparency={1}
					Image={sprite.image}
					ImageRectOffset={sprite.frames[0]}
					ImageRectSize={sprite.size}
					ResampleMode={Enum.ResamplerMode.Pixelated}
					ScaleType={Enum.ScaleType.Fit}
					ImageTransparency={() => (count() > 0 ? 0 : 0.6)}
					AnchorPoint={new Vector2(0.5, 0.5)}
					Position={UDim2.fromScale(0.5, 0.5)}
					Size={px(k, ROW.icon, ROW.icon)}
					ZIndex={22}
				/>
			</imagelabel>
			<textlabel
				BackgroundTransparency={1}
				Position={at(k, PANEL.pad + ROW.cell + 5, 3)}
				Size={px(k, 70, 10)}
				FontFace={BODY}
				Text={() => t(def.name)}
				TextXAlignment="Left"
				TextColor3={() => themeColor("text")}
				TextSize={() => 7 * k()}
				ZIndex={22}
			/>
			<textlabel
				Name="Count"
				BackgroundTransparency={1}
				Position={at(k, PANEL.pad + ROW.cell + 5, 14)}
				Size={px(k, 70, 8)}
				FontFace={LABEL}
				Text={() => `x${count()}`}
				TextXAlignment="Left"
				TextColor3={() => themeColor("textSoft")}
				TextSize={() => 5 * k()}
				ZIndex={22}
			/>
			<ThemeButton
				k={k}
				kind="secondary"
				position={at(k, PANEL.width - PANEL.pad - ROW.button.X, (ROW.height - ROW.button.Y) / 2)}
				size={px(k, ROW.button.X, ROW.button.Y)}
				text={() =>
					sell !== undefined
						? t("inventory.sell", { coins: sell * count() })
						: t("inventory.buy", { count: BUY_STACK, coins: (buy ?? 0) * BUY_STACK })
				}
				fade={() => (usable() ? 0 : 0.5)}
				zIndex={22}
				onPress={() => {
					if (!usable()) return;
					if (sell !== undefined) props.onSell(item);
					else props.onBuy(item);
				}}
			/>
		</frame>
	);
}

/**
 * O inventário na tela (`InventoryController`, 2026-10-23; itens e preços em `shared/items.ts`), no kit do tema e sem
 * arte nova: o botão Itens no canto de cima à direita (embaixo do Decorar; serve ao toque) e, aberto, o painel com as
 * moedas e uma linha por item de `ITEM_ORDER` (todas criadas de uma vez; o Vide não deixa criar dentro de uma função
 * reativa). A tecla I abre e fecha; a linha de baixo lembra a tecla no teclado.
 */
export function InventoryHud(props: InventoryHudProps) {
	const { k } = screenScale();
	const gui = (
		<screengui Name="InventoryHud" ResetOnSpawn={false} DisplayOrder={41} AutoLocalize={false} IgnoreGuiInset={false}>
			<frame Name="Root" BackgroundTransparency={1} Size={UDim2.fromScale(1, 1)} Visible={props.available}>
				<ThemeButton
					k={k}
					kind={() => (props.open() ? "primary" : "secondary")}
					position={() => new UDim2(1, -(OPEN_BUTTON.X + MARGIN) * k(), 0, OPEN_TOP * k())}
					size={px(k, OPEN_BUTTON.X, OPEN_BUTTON.Y)}
					icon={() => "iconChest"}
					text={() => t("inventory.button")}
					onPress={props.onToggle}
				/>
				<imagelabel
					{...themed("panel", k)}
					Name="Panel"
					Position={() => new UDim2(1, -(PANEL.width + MARGIN) * k(), 0, PANEL.top * k())}
					Size={px(k, PANEL.width, PANEL_HEIGHT)}
					Visible={props.open}
					Active={true}
					ZIndex={20}
				>
					<imagelabel {...themed("titleBar", k)} Position={at(k, 0, -6)} Size={px(k, 96, 14)} ZIndex={21}>
						<textlabel
							BackgroundTransparency={1}
							Size={UDim2.fromScale(1, 1)}
							FontFace={LABEL}
							Text={() => t("inventory.title")}
							TextColor3={() => themeColor("textOnTitle")}
							TextSize={() => 6 * k()}
							ZIndex={22}
						/>
					</imagelabel>
					<textlabel
						Name="Coins"
						BackgroundTransparency={1}
						Position={at(k, PANEL.pad + 2, PANEL.pad + 6)}
						Size={px(k, PANEL.width - PANEL.pad * 2, PANEL.coins - 2)}
						FontFace={BODY}
						Text={() => t("inventory.coins", { coins: props.coins() })}
						TextXAlignment="Left"
						TextColor3={() => themeColor("text")}
						TextSize={() => 8 * k()}
						ZIndex={21}
					/>
					{ITEM_ORDER.map((item, index) => Row(props, k, item, index))}
					<textlabel
						Name="Keys"
						BackgroundTransparency={1}
						Position={at(k, PANEL.pad + 2, PANEL_HEIGHT - PANEL.pad - PANEL.keys + 2)}
						Size={px(k, PANEL.width - PANEL.pad * 2, PANEL.keys - 2)}
						FontFace={BODY}
						Text={() => t("inventory.keys", { key: keyName(INVENTORY_KEY) })}
						TextXAlignment="Left"
						TextColor3={() => themeColor("textSoft")}
						TextSize={() => 5 * k()}
						Visible={UserInputService.KeyboardEnabled}
						ZIndex={21}
					/>
				</imagelabel>
			</frame>
		</screengui>
	) as ScreenGui;
	cleanup(gui);
	return gui;
}
