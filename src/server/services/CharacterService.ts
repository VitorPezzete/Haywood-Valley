import { OnStart, Service } from "@flamework/core";
import { Players } from "@rbxts/services";
import { CHARACTER_SCALE, WALK_SPEED } from "shared/character";

/**
 * Prepara o personagem do Roblox de cada jogador. Ele fica invisível e reduzido à escala do mundo:
 * só anda e colide. Quem aparece é o sprite, desenhado em cada cliente.
 */
@Service()
export class CharacterService implements OnStart {
	onStart() {
		Players.PlayerAdded.Connect((player) => this.watch(player));
		for (const player of Players.GetPlayers()) this.watch(player);
	}

	private watch(player: Player) {
		player.CharacterAdded.Connect((character) => this.prepare(character));
		// A escala só depois de a aparência carregar, senão os acessórios chegam no tamanho original.
		player.CharacterAppearanceLoaded.Connect((character) => character.ScaleTo(CHARACTER_SCALE));
		if (player.Character) {
			this.prepare(player.Character);
			if (player.HasAppearanceLoaded()) player.Character.ScaleTo(CHARACTER_SCALE);
		}
	}

	/** O que vale desde o primeiro instante do personagem: invisível, no passo do jogo e sem pulo. */
	private prepare(character: Model) {
		const hideOne = (instance: Instance) => {
			if (instance.IsA("BasePart") || instance.IsA("Decal")) instance.Transparency = 1;
		};
		for (const descendant of character.GetDescendants()) hideOne(descendant);
		character.DescendantAdded.Connect(hideOne);

		const humanoid = character.FindFirstChildOfClass("Humanoid") ?? (character.WaitForChild("Humanoid", 5) as Humanoid | undefined);
		if (!humanoid) return;
		humanoid.WalkSpeed = WALK_SPEED;
		humanoid.UseJumpPower = false;
		humanoid.JumpHeight = 0;
		humanoid.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None;
	}
}
