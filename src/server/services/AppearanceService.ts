import { OnStart, Service } from "@flamework/core";
import { Players } from "@rbxts/services";
import { DEFAULT_LOOK, encodeLook, LOOK_ATTRIBUTE, parseLook } from "shared/appearance";
import { Events } from "server/network";

/** Guarda o visual escolhido por cada jogador num atributo, para todos os clientes desenharem igual. */
@Service()
export class AppearanceService implements OnStart {
	onStart() {
		Players.PlayerAdded.Connect((player) => this.setDefault(player));
		for (const player of Players.GetPlayers()) this.setDefault(player);

		Events.setLook.connect((player, text) => {
			// Só entra o que o catálogo tem; o texto é regravado a partir do que foi lido.
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
