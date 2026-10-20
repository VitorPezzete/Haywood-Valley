import { OnStart, Service } from "@flamework/core";
import { Players } from "@rbxts/services";
import { INTERIOR_TILE, placeOf } from "shared/interiorChoice";
import { isReaction, REACTION_COOLDOWN } from "shared/moods";
import { worldToArtPx } from "shared/view";
import { Events } from "server/network";

/**
 * Até quantos tiles de distância uma reação chega a outro jogador do mesmo mapa (seção 6.3 do
 * `PLANO_OTIMIZACAO.md`): mais longe, o boneco nem está na tela dele.
 */
const REACH_TILES = 30;

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
			// Quem reagiu já mostrou a própria reação na hora; vai só a quem está no mesmo mapa (a mesma cópia da casa) e
			// perto, não ao servidor inteiro.
			const targets = this.nearby(player);
			if (targets.size() > 0) Events.reacted.fire(targets, player.UserId, reaction, bubble === true);
		});
	}

	private nearby(player: Player) {
		const key = placeOf(player)?.key;
		const root = player.Character?.FindFirstChild("HumanoidRootPart");
		const from = root?.IsA("BasePart") ? worldToArtPx(root.Position) : undefined;
		const reach = REACH_TILES * INTERIOR_TILE;
		const targets: Player[] = [];
		for (const other of Players.GetPlayers()) {
			if (other === player || placeOf(other)?.key !== key) continue;
			const otherRoot = other.Character?.FindFirstChild("HumanoidRootPart");
			if (from && otherRoot?.IsA("BasePart") && worldToArtPx(otherRoot.Position).sub(from).Magnitude > reach) continue;
			targets.push(other);
		}
		return targets;
	}
}
