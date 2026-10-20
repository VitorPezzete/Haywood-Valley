import { atom } from "@rbxts/charm";
import { emptyPlayerData, encodeSavedLook, SAVED_LOOKS } from "shared/playerData";
import { Events } from "client/network";

/**
 * Os favoritos e os visuais salvos do jogador. O servidor guarda (PlayerDataService) e manda a versão dele ao
 * carregar e quando recusa um pedido (PlayerDataController); aqui a mudança aparece na hora, sem esperar a volta.
 */
export const playerData = atom(emptyPlayerData());

export function isFavorite(kind: "head" | "body", id: string) {
	const data = playerData();
	return (kind === "head" ? data.favoriteHeads : data.favoriteBodies).includes(id);
}

/** Marca ou desmarca a peça como favorita. */
export function toggleFavorite(kind: "head" | "body", id: string) {
	const favorite = !isFavorite(kind, id);
	playerData((data) => {
		const list = [...(kind === "head" ? data.favoriteHeads : data.favoriteBodies)];
		const at = list.indexOf(id);
		if (favorite && at < 0) list.push(id);
		if (!favorite && at >= 0) list.remove(at);
		return kind === "head" ? { ...data, favoriteHeads: list } : { ...data, favoriteBodies: list };
	});
	Events.setFavorite.fire(kind, id, favorite);
}

/** Grava o visual no espaço `slot` dos visuais salvos, ou apaga o espaço com `undefined`. */
export function saveLook(slot: number, look: Parameters<typeof encodeSavedLook>[0] | undefined) {
	if (slot < 0 || slot >= SAVED_LOOKS) return;
	const text = look ? encodeSavedLook(look) : "";
	playerData((data) => {
		const savedLooks = [...data.savedLooks];
		savedLooks[slot] = text;
		return { ...data, savedLooks };
	});
	Events.saveLook.fire(slot, text);
}
