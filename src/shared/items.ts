// Os itens e as moedas do jogador (fase 1, terceiro passo do `docs/mundo/MAPA_MUNDO.md`, 2026-10-23): o inventário
// que a fazenda enche e esvazia. Vale no cliente (que mostra e pede) e no servidor (`InventoryService`, que confere,
// grava em `PlayerData.inventory` e manda só ao dono, pelo evento `inventoryChanged`: 200 clientes não precisam saber
// quantas sementes cada um tem, então nada disso vai em atributo).
//
// **Números provisórios** (decididos sem o usuário em 2026-10-23, que pediu para seguir sem esperar; a página de
// balanceamento do Notion não estava acessível nesta sessão): o trigo é o do Hay Day (colher dá 2, vende por 3), a
// semente é comprada como no Stardew (2 moedas), e o jogador novo começa com 10 sementes e nenhuma moeda. Trocar aqui;
// o resto do código lê destes números.

/** Um item: a chave do nome, o preço de venda e o de compra (em moedas; sem o campo, não se vende ou não se compra). */
export interface ItemDef {
	name: ItemNameKey;
	sell?: number;
	buy?: number;
	/**
	 * O desenho do ícone: um sprite do protótipo (`client/world/sprites.ts`, a folha `mundo.atlas`), sem arte nova. A
	 * semente usa o broto (`wheat1`), o trigo o trigo pronto (`wheat3`).
	 */
	icon: "wheat1" | "wheat2" | "wheat3";
}

/** As chaves de texto dos nomes (em `shared/i18n/en.ts`); aqui como tipo próprio para não importar o idioma. */
export type ItemNameKey = "item.semente_trigo" | "item.trigo";

/** Os itens pelo id estável (o que fica salvo). Id que sair daqui some do salvo na próxima gravação. */
export const ITEMS: Record<string, ItemDef> = {
	semente_trigo: { name: "item.semente_trigo", buy: 2, icon: "wheat1" },
	trigo: { name: "item.trigo", sell: 3, icon: "wheat3" },
};
/** A ordem do painel e do texto salvo. */
export const ITEM_ORDER: ReadonlyArray<string> = ["semente_trigo", "trigo"];

/** Quantos de cada item o jogador guarda, no máximo (o celeiro e o silo do Hay Day vêm depois; colher além disso é recusado). */
export const ITEM_MAX = 999;
/** Moedas, no máximo. */
export const COINS_MAX = 999999999;
/** Comprar sementes vai de tantas em tantas (um toque no botão). */
export const BUY_STACK = 5;
/** O que o jogador novo ganha (e quem tem um salvo de antes do inventário, formato 2 ou anterior). */
export const STARTING_ITEMS: ReadonlyArray<[string, number]> = [["semente_trigo", 10]];
export const STARTING_COINS = 0;

/** Versão do formato salvo do inventário; muda quando o texto mudar de jeito. */
export const INVENTORY_SAVE_VERSION = 1;
const INVENTORY_READS = new Set([1]);
/** Tamanho máximo do texto dos itens no salvo. */
const ITEMS_MAX_TEXT = 4000;

/** O que fica salvo em `PlayerData.inventory`: os itens no texto de `encodeItems` e as moedas. */
export interface PlayerInventory {
	v: number;
	items: string;
	coins: number;
}

export function itemDef(id: string): ItemDef | undefined {
	return ITEMS[id];
}

const isCount = (value: number | undefined, max: number): value is number =>
	value !== undefined && value === math.floor(value) && value >= 0 && value <= max;

/** Os itens como texto estável: "id=n,id=n" na ordem de `ITEM_ORDER`, sem os que são zero. */
export function encodeItems(items: ReadonlyMap<string, number>) {
	const parts = new Array<string>();
	for (const id of ITEM_ORDER) {
		const count = items.get(id) ?? 0;
		if (count > 0) parts.push(`${id}=${count}`);
	}
	return parts.join(",");
}

/** Lê o texto de `encodeItems`, jogando fora o que não for item conhecido nem quantidade válida. */
export function decodeItems(text: unknown) {
	const items = new Map<string, number>();
	if (!typeIs(text, "string") || text === "" || text.size() > ITEMS_MAX_TEXT) return items;
	for (const entry of text.split(",")) {
		const [id, n] = entry.split("=") as (string | undefined)[];
		const count = tonumber(n);
		if (id === undefined || ITEMS[id] === undefined || !isCount(count, ITEM_MAX) || count === 0) continue;
		items.set(id, count);
	}
	return items;
}

/** O inventário de quem começa: `STARTING_ITEMS` e `STARTING_COINS`. */
export function startingInventory(): PlayerInventory {
	const items = new Map<string, number>();
	for (const [id, count] of STARTING_ITEMS) items.set(id, count);
	return { v: INVENTORY_SAVE_VERSION, items: encodeItems(items), coins: STARTING_COINS };
}

/** Se o inventário foi salvo por uma versão do jogo mais nova que esta: fica como veio e não se mexe nele. */
export function inventoryIsNewer(inventory: PlayerInventory) {
	return inventory.v > INVENTORY_SAVE_VERSION;
}

/**
 * Lê o salvo. Sem inventário (jogador novo, ou o salvo dos formatos 1 e 2, de antes de 2026-10-23) é o de começo,
 * com as sementes: a fazenda de quem já jogava o esqueleto também precisa delas. Um inventário de versão mais nova
 * fica como veio (a gravação deste servidor o devolve sem perder nada); um que não é do formato fica vazio.
 */
export function sanitizeInventory(value: unknown): PlayerInventory {
	if (value === undefined) return startingInventory();
	const inventory: PlayerInventory = { v: INVENTORY_SAVE_VERSION, items: "", coins: 0 };
	if (!typeIs(value, "table")) return inventory;
	const saved = value as { v?: unknown; items?: unknown; coins?: unknown };
	if (!typeIs(saved.v, "number") || !typeIs(saved.items, "string") || !typeIs(saved.coins, "number")) return inventory;
	if (saved.v > INVENTORY_SAVE_VERSION && saved.v === math.floor(saved.v)) {
		return { v: saved.v, items: saved.items, coins: saved.coins };
	}
	if (!INVENTORY_READS.has(saved.v)) return inventory;
	inventory.items = encodeItems(decodeItems(saved.items));
	inventory.coins = isCount(saved.coins, COINS_MAX) ? saved.coins : 0;
	return inventory;
}
