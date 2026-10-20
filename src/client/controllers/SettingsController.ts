import { Controller, OnInit, OnStart } from "@flamework/core";
import { effect } from "@rbxts/charm";
import { LocalizationService, Players, SoundService } from "@rbxts/services";
import { SOUND_GROUPS } from "shared/settings";
import { robloxLocale, settings } from "client/state/settings";

export type SoundGroupKind = keyof typeof SOUND_GROUPS;

/**
 * Aplica as Configurações: o volume da música e dos efeitos e o idioma do Roblox que o Automático
 * segue. Os grupos de som são do cliente, como a cena: todo som do jogo entra num deles.
 */
@Controller()
export class SettingsController implements OnInit, OnStart {
	private groups = new Map<SoundGroupKind, SoundGroup>();

	onInit() {
		// Antes do onStart dos outros controllers, para quem criar som já achar o grupo.
		this.groups.set("music", this.createGroup(SOUND_GROUPS.music));
		this.groups.set("effects", this.createGroup(SOUND_GROUPS.effects));
	}

	onStart() {
		effect(() => {
			const { music, effects } = settings();
			this.group("music").Volume = music / 100;
			this.group("effects").Volume = effects / 100;
		});

		task.spawn(() => {
			// O tradutor do Roblox acompanha o idioma que o jogador escolhe no menu do Roblox durante a
			// partida. Só a troca conta: ao entrar vale o idioma da conta, que o átomo já tem. O valor
			// inicial do tradutor depende dos idiomas cadastrados no painel do jogo (enquanto a língua de
			// origem lá não for o inglês, ele pode dizer português para quem tem conta em inglês) e
			// trocaria o idioma com o título já na tela.
			const [ok, translator] = pcall(() => LocalizationService.GetTranslatorForPlayerAsync(Players.LocalPlayer));
			if (!ok || !typeIs(translator, "Instance") || !translator.IsA("Translator")) return;
			translator.GetPropertyChangedSignal("LocaleId").Connect(() => robloxLocale(translator.LocaleId));
		});
	}

	group(kind: SoundGroupKind) {
		return this.groups.get(kind)!;
	}

	private createGroup(name: string) {
		const group = new Instance("SoundGroup");
		group.Name = name;
		group.Parent = SoundService;
		return group;
	}
}
