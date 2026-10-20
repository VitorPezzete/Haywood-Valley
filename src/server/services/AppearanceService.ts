import { OnStart, Service } from "@flamework/core";
import { Players } from "@rbxts/services";
import { DEFAULT_LOOK, encodeLook, LOOK_ATTRIBUTE, parseLook } from "shared/appearance";
import { Events } from "server/network";
import { RATE, RateLimiter } from "server/rateLimit";

/** Guarda o visual escolhido por cada jogador num atributo, para todos os clientes desenharem igual. */
@Service()
export class AppearanceService implements OnStart {
	onStart() {
		Players.PlayerAdded.Connect((player) => this.setDefault(player));
		for (const player of Players.GetPlayers()) this.setDefault(player);

		// O visual vai num atributo que chega aos 200 clientes: no máximo `RATE.setLook` por segundo.
		const limit = new RateLimiter(RATE.setLook);
		Events.setLook.connect((player, text) => {
			if (!limit.allow(player)) return;
			// Só entra cabeça e corpo que o catálogo tem e cor válida; o texto é regravado a partir do que foi lido.
			const look = parseLook(text);
			if (look) player.SetAttribute(LOOK_ATTRIBUTE, encodeLook(look));
		});
	}

	private setDefault(player: Player) {
		if (player.GetAttribute(LOOK_ATTRIBUTE) === undefined) {
			player.SetAttribute(LOOK_ATTRIBUTE, encodeLook(DEFAULT_LOOK));
		}
	}
}
