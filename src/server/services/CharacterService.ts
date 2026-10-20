import { OnStart, Service } from "@flamework/core";
import { Players, StarterPlayer } from "@rbxts/services";
import { CHARACTER_SCALE, WALK_SPEED } from "shared/character";

/**
 * Prepara o personagem do Roblox de cada jogador. Ele fica invisível e reduzido à escala do mundo:
 * só anda e colide. Quem aparece é o sprite, desenhado em cada cliente.
 *
 * Desde a fase 1 do `PLANO_OTIMIZACAO.md` (2026-10-18) o personagem é mínimo: o `StarterCharacter` do
 * `default.project.json` (um `HumanoidRootPart` de 2 × 2 × 1 e o `Humanoid` R15 com `HipHeight` 2, sem juntas nem
 * malhas), `LoadCharacterAppearance` desligado (o avatar da conta não é baixado) e um `Animate` vazio (o Roblox não
 * anima ninguém). Na escala de 25%, o pé de colisão fica igual ao do avatar de antes (0,5 × 0,25 stud, a raiz a
 * 0,75 do chão, medido no Studio em 2026-10-18), então o andar e a colisão não mudam.
 */
@Service()
export class CharacterService implements OnStart {
	onStart() {
		Players.PlayerAdded.Connect((player) => this.watch(player));
		for (const player of Players.GetPlayers()) this.watch(player);
	}

	private watch(player: Player) {
		player.CharacterAdded.Connect((character) => this.prepare(character));
		// Sem o personagem mínimo (um place sem o StarterCharacter do projeto), o avatar inteiro chega depois: a escala
		// vai de novo quando ele termina de carregar, senão os acessórios ficariam no tamanho original.
		player.CharacterAppearanceLoaded.Connect((character) => this.scale(character));
		if (player.Character) this.prepare(player.Character);
	}

	private scale(character: Model) {
		if (math.abs(character.GetScale() - CHARACTER_SCALE) > 1e-4) character.ScaleTo(CHARACTER_SCALE);
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
		const root = character.FindFirstChild("HumanoidRootPart");
		if (root?.IsA("BasePart") && !character.PrimaryPart) character.PrimaryPart = root;
		// Sem a aparência da conta, nada mais chega depois: a escala vai já.
		if (!StarterPlayer.LoadCharacterAppearance) this.scale(character);
		humanoid.WalkSpeed = WALK_SPEED;
		humanoid.UseJumpPower = false;
		humanoid.JumpHeight = 0;
		humanoid.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None;
	}
}
