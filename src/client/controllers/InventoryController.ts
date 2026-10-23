import { Controller, OnStart } from "@flamework/core";
import { subscribe } from "@rbxts/charm";
import { Players, UserInputService } from "@rbxts/services";
import { mount, source } from "@rbxts/vide";
import { BUY_STACK, decodeItems } from "shared/items";
import { Events } from "client/network";
import { inventory } from "client/state/inventory";
import { screen } from "client/state/screen";
import { INVENTORY_KEY, InventoryHud } from "client/ui/InventoryHud";

/**
 * O inventário no cliente (fase 1, terceiro passo do `docs/mundo/MAPA_MUNDO.md`, 2026-10-23; regras em
 * `shared/items.ts`, servidor em `InventoryService`). Guarda no átomo `client/state/inventory.ts` o que o servidor
 * manda (`inventoryChanged`, só ao dono), pede o estado ao ligar (`inventoryReady`) e mostra o `InventoryHud` com o
 * jogo rodando: a tecla I ou o botão Itens abre e fecha; vender e comprar vão ao servidor, que confere e responde com o
 * inventário novo (nada muda aqui antes da resposta).
 */
@Controller()
export class InventoryController implements OnStart {
	private open = source(false);

	onStart() {
		// Espelho do átomo para o Vide (só acompanha `source`).
		const state = source(inventory());
		subscribe(inventory, (value) => state(value));
		const playing = source(screen() === "playing");
		subscribe(screen, (value) => {
			playing(value === "playing");
			if (value !== "playing") this.open(false);
		});

		Events.inventoryChanged.connect((items, coins) => {
			inventory({ ready: true, items: decodeItems(items), coins });
		});
		Events.inventoryReady.fire();

		UserInputService.InputBegan.Connect((input, processed) => {
			if (processed || input.KeyCode !== INVENTORY_KEY || screen() !== "playing") return;
			this.open(!this.open());
		});

		mount(
			() =>
				InventoryHud({
					available: playing,
					open: () => this.open(),
					count: (item) => state().items.get(item) ?? 0,
					coins: () => state().coins,
					onToggle: () => this.open(!this.open()),
					onSell: (item) => {
						const count = inventory().items.get(item) ?? 0;
						if (count > 0) Events.sellItem.fire(item, count);
					},
					onBuy: (item) => Events.buyItem.fire(item, BUY_STACK),
				}),
			Players.LocalPlayer.WaitForChild("PlayerGui"),
		);
	}
}
