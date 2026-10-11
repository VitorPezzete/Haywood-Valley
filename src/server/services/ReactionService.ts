import { OnStart, Service } from "@flamework/core";
import { Players } from "@rbxts/services";
import { isReaction, REACTION_COOLDOWN } from "shared/moods";
import { Events } from "server/network";

/**
 * Reações de rosto dos jogadores. Quem decide que o rosto reagiu é o cliente do próprio jogador
 * (esbarrou, falou no chat, encontrou alguém); o servidor só confere e repassa. A reação dura
 * poucos segundos e não é estado do jogo, então quem entra depois não precisa saber dela.
 */
@Service()
export class ReactionService implements OnStart {
	private last = new Map<Player, number>();

	onStart() {
		Players.PlayerRemoving.Connect((player) => this.last.delete(player));

		Events.react.connect((player, reaction, bubble) => {
			if (!isReaction(reaction)) return;
			const now = os.clock();
			// Uma folga pequena: o cliente já espera o intervalo inteiro, e a rede varia.
			if (now - (this.last.get(player) ?? -math.huge) < REACTION_COOLDOWN * 0.8) return;
			this.last.set(player, now);
			// Quem reagiu já mostrou a própria reação na hora.
			Events.reacted.except(player, player.UserId, reaction, bubble === true);
		});
	}
}
