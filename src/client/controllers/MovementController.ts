import { Controller, OnStart } from "@flamework/core";
import { Players, RunService } from "@rbxts/services";
import { source } from "@rbxts/vide";
import { WALK_SPEED } from "shared/character";

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
		RunService.Heartbeat.Connect(() => {
			const humanoid = Players.LocalPlayer.Character?.FindFirstChildOfClass("Humanoid");
			if (!humanoid) return;
			const speed = this.holds > 0 ? 0 : WALK_SPEED;
			if (humanoid.WalkSpeed !== speed) humanoid.WalkSpeed = speed;
		});
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
