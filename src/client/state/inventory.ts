import { atom } from "@rbxts/charm";

/**
 * O inventário do jogador (`shared/items.ts`), como o servidor mandou da última vez (`InventoryController`, evento
 * `inventoryChanged`, 2026-10-23). `ready` fica falso até a primeira resposta: antes disso a dica da fazenda não diz
 * que faltam sementes.
 */
export interface InventoryState {
	ready: boolean;
	items: ReadonlyMap<string, number>;
	coins: number;
}

export const inventory = atom<InventoryState>({ ready: false, items: new Map(), coins: 0 });

/** Quantos do item o jogador tem agora. */
export function itemCount(item: string) {
	return inventory().items.get(item) ?? 0;
}
