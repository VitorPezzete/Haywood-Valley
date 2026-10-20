import { Controller, OnStart } from "@flamework/core";
import { Players, RunService } from "@rbxts/services";
import { source } from "@rbxts/vide";
import { WALK_SPEED } from "shared/character";
import { CAMERA_PITCH } from "shared/view";

const SIN_PITCH = math.sin(CAMERA_PITCH);

/**
 * Deixa o personagem do jogador parado enquanto uma tela está na frente (menu, personalização,
 * diálogo). Este Studio não tem mais o `PlayerModule` em `PlayerScripts`, então o jeito é a
 * velocidade: ela é conferida a cada quadro porque o servidor também a ajusta ao carregar o avatar.
 */
@Controller()
export class MovementController implements OnStart {
	private holds = 0;
	/** Se alguma tela segura o personagem agora. É um `source`, para a interface poder acompanhar. */
	readonly holding = source(false);

	onStart() {
		Players.LocalPlayer.CharacterAdded.Connect((character) => this.trim(character));
		const character = Players.LocalPlayer.Character;
		if (character) task.spawn(() => this.trim(character));

		RunService.Heartbeat.Connect(() => {
			const humanoid = Players.LocalPlayer.Character?.FindFirstChildOfClass("Humanoid");
			if (!humanoid) return;
			// Na tela, um stud em direção à câmera vale menos que um stud de lado (a câmera está a 70°):
			// a velocidade cresce nessa direção para o passo na tela ser o mesmo nas quatro direções,
			// como no Graal (pedido do usuário em 2026-10-17).
			const move = humanoid.MoveDirection;
			const onScreen = math.sqrt(move.X * move.X + (move.Z * SIN_PITCH) ** 2);
			const speed = this.holds > 0 ? 0 : onScreen > 0.01 ? WALK_SPEED / onScreen : WALK_SPEED;
			if (math.abs(humanoid.WalkSpeed - speed) > 1e-3) humanoid.WalkSpeed = speed;
		});
	}

	private trim(character: Model) {
		const humanoid =
			character.FindFirstChildOfClass("Humanoid") || (character.WaitForChild("Humanoid", 5) as Humanoid | undefined);
		if (!humanoid) return;
		for (const state of [
			Enum.HumanoidStateType.Climbing,
			Enum.HumanoidStateType.Swimming,
			Enum.HumanoidStateType.FallingDown,
			Enum.HumanoidStateType.Ragdoll,
			Enum.HumanoidStateType.Seated,
			Enum.HumanoidStateType.Flying,
			Enum.HumanoidStateType.Jumping,
		]) {
			humanoid.SetStateEnabled(state, false);
		}
	}

	/** Segura o personagem parado. Devolve a função que o solta; chamar mais de uma vez não faz mal. */
	hold() {
		this.holds += 1;
		this.holding(true);
		let released = false;
		return () => {
			if (released) return;
			released = true;
			this.holds -= 1;
			this.holding(this.holds > 0);
		};
	}
}
