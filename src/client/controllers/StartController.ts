import { Controller, OnStart } from "@flamework/core";
import { subscribe } from "@rbxts/charm";
import { ContentProvider, Players, StarterGui } from "@rbxts/services";
import { mount, source } from "@rbxts/vide";
import { encodeLook } from "shared/appearance";
import { Events } from "client/network";
import { look, screen } from "client/state/screen";
import { LOGO, TITLE, UiArt } from "client/ui/art";
import { OPEN_SECONDS, StartScreen } from "client/ui/StartScreen";
import { CHARACTER_ATLASES, FACE_SHEET } from "client/world/characterArt";
import { GRASS_TILE, Sprites } from "client/world/sprites";
import { DialogueController } from "./DialogueController";
import { MovementController } from "./MovementController";

/** Abertura do jogo: carrega as imagens, mostra o menu inicial e a personalização, e começa a partida. */
@Controller()
export class StartController implements OnStart {
	constructor(
		private movement: MovementController,
		private dialogue: DialogueController,
	) {}

	onStart() {
		// O personagem não anda por trás do menu.
		const release = this.movement.hold();
		// A lista de jogadores e o chat do Roblox ficariam por cima do menu e da tela de personalizar.
		StarterGui.SetCoreGuiEnabled(Enum.CoreGuiType.PlayerList, false);
		StarterGui.SetCoreGuiEnabled(Enum.CoreGuiType.Chat, false);

		// O Vide lê `source`, não os átomos do Charm: este espelha o átomo da tela.
		const stage = source(screen());
		subscribe(screen, (value) => stage(value));

		const playerGui = Players.LocalPlayer.WaitForChild("PlayerGui");
		const unmount = mount(
			() =>
				StartScreen({
					stage,
					onNewGame: () => screen("customize"),
					onQuit: () => Players.LocalPlayer.Kick("Até a próxima!"),
					onCustomized: (confirmed) => {
						if (!confirmed) {
							screen("menu");
							return;
						}
						Events.setLook.fire(encodeLook(look()));
						screen("playing");
					},
				}),
			playerGui,
		);

		subscribe(screen, (value) => {
			if (value !== "playing") return;
			release();
			StarterGui.SetCoreGuiEnabled(Enum.CoreGuiType.PlayerList, true);
			StarterGui.SetCoreGuiEnabled(Enum.CoreGuiType.Chat, true);
			// Tira a tela depois que o véu termina de abrir e dá as boas-vindas.
			task.delay(OPEN_SECONDS + 0.4, () => {
				unmount();
				this.dialogue.say([
					{ name: "Dica", text: "Bem-vindo ao vale! Use W, A, S e D para andar." },
					{ name: "Dica", text: "Árvores, arbustos e pedras bloqueiam o caminho. A plantação, não." },
				]);
			});
		});

		// A arte do mundo carrega por trás da tela de título; o menu só aparece com tudo pronto.
		const images = [
			UiArt.cursorHand.image,
			LOGO.image,
			TITLE.back,
			TITLE.front,
			Sprites.oak.image,
			GRASS_TILE.image,
			...CHARACTER_ATLASES,
			FACE_SHEET,
		];
		ContentProvider.PreloadAsync(images.filter((image) => image !== ""));
		screen("menu");
	}
}
