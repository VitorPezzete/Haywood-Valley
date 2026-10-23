import { OnStart, Service } from "@flamework/core";
import { Players } from "@rbxts/services";
import {
	BUY_STACK,
	COINS_MAX,
	decodeItems,
	encodeItems,
	INVENTORY_SAVE_VERSION,
	inventoryIsNewer,
	ITEM_MAX,
	itemDef,
} from "shared/items";
import { Events } from "server/network";
import { RATE, READY_BURST, RateLimiter } from "server/rateLimit";
import { PlayerDataService } from "./PlayerDataService";

/** O inventário de um jogador nesta sessão. */
interface Held {
	items: Map<string, number>;
	coins: number;
}

/**
 * Os itens e as moedas de cada jogador (fase 1, terceiro passo do `docs/mundo/MAPA_MUNDO.md`, 2026-10-23; regras
 * e números em `shared/items.ts`). O servidor guarda a verdade em `PlayerData.inventory` e manda só ao dono
 * (`inventoryChanged`), ao carregar, a cada mudança e quando o cliente pede (`inventoryReady`, ao ligar: o evento do
 * carregar pode chegar antes de o controller ouvir). Nada em atributo: os outros 199 clientes não precisam.
 *
 * - **Quem muda**: a fazenda (`FarmService`: plantar gasta a semente, colher dá o trigo) por `take` e `give`, e a
 *   venda e a compra (`sellItem`, `buyItem`), que passam pelo limitador (`RATE.shop`) e são conferidas aqui (item que
 *   existe e se vende ou se compra, quantidade inteira que o jogador tem ou que cabe, moedas que bastam). Vende e
 *   compra de qualquer lugar por enquanto (provisório: a caixa de venda do lote é arte a criar, §7 item 2).
 * - **Salvo de versão mais nova** (`inventoryIsNewer`): fica como veio e nada o muda nesta sessão; a fazenda não
 *   planta nem colhe (gastaria ou daria itens que não teriam onde ficar).
 */
@Service()
export class InventoryService implements OnStart {
	private held = new Map<Player, Held>();

	constructor(private readonly data: PlayerDataService) {}

	onStart() {
		this.data.onLoaded((player) => this.load(player));
		for (const player of Players.GetPlayers()) if (this.data.isReady(player)) this.load(player);
		Players.PlayerRemoving.Connect((player) => this.held.delete(player));
		const ready = new RateLimiter(RATE.ready, READY_BURST);
		Events.inventoryReady.connect((player) => {
			if (ready.allow(player)) this.send(player);
		});
		const shop = new RateLimiter(RATE.shop);
		Events.sellItem.connect((player, item, count) => {
			if (shop.allow(player)) this.sell(player, item, count);
		});
		Events.buyItem.connect((player, item, count) => {
			if (shop.allow(player)) this.buy(player, item, count);
		});
	}

	/** Se o inventário do jogador está carregado e pode mudar nesta sessão. */
	isReady(player: Player) {
		return this.held.has(player);
	}

	count(player: Player, item: string) {
		return this.held.get(player)?.items.get(item) ?? 0;
	}

	/** Gasta `amount` do item; devolve se tinha (e gastou). */
	take(player: Player, item: string, amount: number) {
		const held = this.held.get(player);
		const have = held?.items.get(item) ?? 0;
		if (!held || amount <= 0 || have < amount) return false;
		if (have === amount) held.items.delete(item);
		else held.items.set(item, have - amount);
		this.commit(player, held);
		return true;
	}

	/** Dá `amount` do item; devolve se coube (nada muda se passaria de `ITEM_MAX`). */
	give(player: Player, item: string, amount: number) {
		const held = this.held.get(player);
		if (!held || amount <= 0 || itemDef(item) === undefined) return false;
		const total = (held.items.get(item) ?? 0) + amount;
		if (total > ITEM_MAX) return false;
		held.items.set(item, total);
		this.commit(player, held);
		return true;
	}

	private load(player: Player) {
		const inventory = this.data.inventoryOf(player);
		if (!inventory || !player.Parent) return;
		if (inventoryIsNewer(inventory)) {
			warn(`[Inventario] ${player.Name}: inventário salvo por uma versão mais nova (${inventory.v}); fica sem mexer`);
			return;
		}
		this.held.set(player, { items: decodeItems(inventory.items), coins: inventory.coins });
		this.send(player);
	}

	private commit(player: Player, held: Held) {
		this.data.setInventory(player, { v: INVENTORY_SAVE_VERSION, items: encodeItems(held.items), coins: held.coins });
		this.send(player);
	}

	private send(player: Player) {
		const held = this.held.get(player);
		if (held) Events.inventoryChanged.fire(player, encodeItems(held.items), held.coins);
	}

	private sell(player: Player, item: unknown, count: unknown) {
		const held = this.held.get(player);
		if (!held || !typeIs(item, "string") || !typeIs(count, "number")) return;
		const price = itemDef(item)?.sell;
		if (price === undefined || count !== math.floor(count) || count <= 0) return;
		const have = held.items.get(item) ?? 0;
		if (count > have || held.coins + price * count > COINS_MAX) return this.send(player);
		if (count === have) held.items.delete(item);
		else held.items.set(item, have - count);
		held.coins += price * count;
		this.commit(player, held);
	}

	private buy(player: Player, item: unknown, count: unknown) {
		const held = this.held.get(player);
		if (!held || !typeIs(item, "string") || !typeIs(count, "number")) return;
		const price = itemDef(item)?.buy;
		if (price === undefined || count !== math.floor(count) || count <= 0 || count % BUY_STACK !== 0) return;
		const total = (held.items.get(item) ?? 0) + count;
		if (total > ITEM_MAX || held.coins < price * count) return this.send(player);
		held.items.set(item, total);
		held.coins -= price * count;
		this.commit(player, held);
	}
}
