import type { UI_SOUNDS } from "shared/sounds";

export type UiSoundName = keyof (typeof UI_SOUNDS)["celeiro"];

// O som da interface, para os componentes do Vide, que não recebem controllers: o `SoundController` liga quem
// toca (`setUiSoundPlayer`), e a interface só chama `uiSound("click")`. Sem quem toque, não faz nada.
let player: ((name: UiSoundName) => void) | undefined;

export function setUiSoundPlayer(play: (name: UiSoundName) => void) {
	player = play;
}

/** Toca o som `name` do kit do tema em uso (Celeiro ou Clássico). */
export function uiSound(name: UiSoundName) {
	player?.(name);
}
