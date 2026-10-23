import { Controller, OnStart } from "@flamework/core";
import { subscribe } from "@rbxts/charm";
import { ContentProvider, Players, StarterGui } from "@rbxts/services";
import { mount, source } from "@rbxts/vide";
import { encodeLook, lookGender } from "shared/appearance";
import { MISSING_IMAGE } from "shared/assets";
import { decodeSavedLook } from "shared/playerData";
import { playerData } from "client/state/playerData";
import { Events } from "client/network";
import { characterName, look, screen } from "client/state/screen";
import { ChatArt, LOGO, TITLE, TITLE_WATER } from "client/ui/art";
import { THEME_ATLASES } from "client/ui/theme";
import { settings } from "client/state/settings";
import { keyName, t } from "client/ui/i18n";
import { OPEN_SECONDS, StartScreen } from "client/ui/StartScreen";
import { figureLayers } from "client/world/graalArt";
import { FACE_SHEET } from "client/world/characterArt";
import { interiorTest } from "client/world/interiorTest";
import { worldTest } from "shared/world";
import { GRASS_TILE, Sprites } from "client/world/sprites";
import { closeOpening } from "client/ui/opening";
import { DialogueController } from "./DialogueController";
import { MovementController } from "./MovementController";
import { SceneController } from "./SceneController";

/** Abertura do jogo: carrega as imagens, mostra o menu inicial e a personalização, e começa a partida. */
@Controller()
export class StartController implements OnStart {
	constructor(
		private movement: MovementController,
		private dialogue: DialogueController,
		private scene: SceneController,
	) {}

	onStart() {
		if (interiorTest() || worldTest()) {
			this.startInteriorTest();
			closeOpening();
			return;
		}

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
					onContinue: () => {
						const data = playerData();
						const saved = decodeSavedLook(data.character);
						if (!saved) return;
						look(saved);
						if (data.characterName !== "") characterName(data.characterName);
						Events.setLook.fire(encodeLook(saved));
						if (characterName() !== "") Events.setName.fire(characterName());
						screen("playing");
					},
					onNewGame: () => {
						// Quem já tem personagem começa a personalizar a partir dele.
						const saved = decodeSavedLook(playerData().character);
						if (saved) look(saved);
						if (playerData().characterName !== "" && characterName() === "") {
							characterName(playerData().characterName);
						}
						screen("customize");
					},
					onQuit: () => Players.LocalPlayer.Kick(t("menu.quitMessage")),
					onCustomized: (confirmed) => {
						if (!confirmed) {
							screen("menu");
							return;
						}
						Events.setLook.fire(encodeLook(look()));
						if (characterName() !== "") Events.setName.fire(characterName());
						screen("playing");
					},
				}),
			playerGui,
		);
		// A tela de carregar do jogo já está montada: a tela preta da abertura (`ReplicatedFirst`) sai.
		closeOpening();

		subscribe(screen, (value) => {
			if (value !== "playing") return;
			release();
			StarterGui.SetCoreGuiEnabled(Enum.CoreGuiType.PlayerList, true);
			StarterGui.SetCoreGuiEnabled(Enum.CoreGuiType.Chat, true);
			// Tira a tela depois que o véu termina de abrir e dá as boas-vindas.
			task.delay(OPEN_SECONDS + 0.4, () => {
				unmount();
				// O nome é o que o próprio jogador escreveu: só ele vê esta fala.
				const name = characterName() !== "" ? characterName() : Players.LocalPlayer.DisplayName;
				const keys = {
					name,
					up: keyName(Enum.KeyCode.W),
					left: keyName(Enum.KeyCode.A),
					down: keyName(Enum.KeyCode.S),
					right: keyName(Enum.KeyCode.D),
				};
				this.dialogue.say([
					{
						name: () => t("dialogue.tip"),
						text: () => t(lookGender(look()) === 1 ? "tip.welcomeGirl" : "tip.welcomeBoy", keys),
					},
					{ name: () => t("dialogue.tip"), text: () => t("tip.obstacles") },
					{ name: () => t("dialogue.tip"), text: () => t("tip.actions", { key: keyName(Enum.KeyCode.F) }) },
				]);
			});
		});

		// Folha ainda não enviada fica com o id 0, que não carrega; não adianta pedir.
		const loadable = (image: string) => image !== "" && image !== MISSING_IMAGE;

		// O personagem salvo pode estar em outro estilo de peça (Aeko ou Original) que o visual inicial: as
		// folhas dele carregam por trás assim que os dados do jogador chegam, para o Continuar já achar prontas.
		let savedPreloaded = false;
		const preloadSaved = () => {
			const saved = decodeSavedLook(playerData().character);
			if (savedPreloaded || !saved) return;
			savedPreloaded = true;
			const sheets = figureLayers(saved)
				.map((layer) => layer.image)
				.filter(loadable);
			task.spawn(() => ContentProvider.PreloadAsync(sheets));
		};
		subscribe(playerData, preloadSaved);
		preloadSaved();

		// A arte do mundo carrega por trás da tela de título; o menu só aparece com tudo pronto.
		const images = [
			THEME_ATLASES[settings().theme],
			LOGO.image,
			TITLE.image,
			...TITLE_WATER.map((strip) => strip.image),
			Sprites.oak.image,
			GRASS_TILE.image,
			...figureLayers(look()).map((layer) => layer.image),
			FACE_SHEET,
			ChatArt.body.image,
		];
		ContentProvider.PreloadAsync(images.filter(loadable));
		screen("menu");

		// Com o menu à mostra, as folhas do mapa de nascer carregam por trás (o mapa já está montado, atrás do menu):
		// quando o véu abre, o chão já está pronto (fase 1 do `PLANO_OTIMIZACAO.md`, item 7).
		task.spawn(() => ContentProvider.PreloadAsync(this.scene.mapImages().filter(loadable)));
	}

	private startInteriorTest() {
		let dressed = false;
		const dress = () => {
			const saved = decodeSavedLook(playerData().character);
			if (dressed || !saved) return;
			dressed = true;
			look(saved);
			Events.setLook.fire(encodeLook(saved));
		};
		subscribe(playerData, dress);
		dress();
		screen("playing");
	}
}
