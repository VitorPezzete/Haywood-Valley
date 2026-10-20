import { Players } from "@rbxts/services";

/**
 * O nome da tela preta da abertura, que o script de `ReplicatedFirst` põe antes de tudo
 * (`assets/first/Abertura.client.luau`, fase 1 do `PLANO_OTIMIZACAO.md`, item 7). O mesmo nome fica nos dois.
 */
export const OPENING_GUI = "Abertura";

/** Tira a tela preta da abertura: a tela do jogo já está montada por baixo dela. */
export function closeOpening() {
	Players.LocalPlayer.FindFirstChild("PlayerGui")?.FindFirstChild(OPENING_GUI)?.Destroy();
}
