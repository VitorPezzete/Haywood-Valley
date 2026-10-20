import { OnStart, Service } from "@flamework/core";
import { Players, TextService } from "@rbxts/services";
import { cleanName, NAME_ATTRIBUTE, NAME_MAX_BYTES } from "shared/names";
import { Events } from "server/network";
import { RATE, RateLimiter } from "server/rateLimit";

/**
 * Guarda o nome do personagem de cada jogador num atributo, para todos os clientes poderem mostrar.
 * Texto escrito por jogador só aparece para os outros depois de passar pelo filtro do Roblox; se o
 * filtro falhar, o nome antigo fica. Quem não escolheu nome usa o nome de exibição do Roblox.
 */
@Service()
export class NameService implements OnStart {
	onStart() {
		Players.PlayerAdded.Connect((player) => this.setDefault(player));
		for (const player of Players.GetPlayers()) this.setDefault(player);

		// O filtro do Roblox também tem limite: no máximo `RATE.setName` por segundo.
		const limit = new RateLimiter(RATE.setName);
		Events.setName.connect((player, text) => {
			if (!limit.allow(player)) return;
			// O texto vem do cliente: conferir o tamanho antes de qualquer trabalho.
			if (!typeIs(text, "string") || text.size() > NAME_MAX_BYTES) return;
			const name = cleanName(text);
			if (name === "") return;
			const [ok, filtered] = pcall(() =>
				TextService.FilterStringAsync(name, player.UserId).GetNonChatStringForBroadcastAsync(),
			);
			if (ok && typeIs(filtered, "string") && filtered !== "") player.SetAttribute(NAME_ATTRIBUTE, filtered);
		});
	}

	private setDefault(player: Player) {
		if (player.GetAttribute(NAME_ATTRIBUTE) === undefined) {
			player.SetAttribute(NAME_ATTRIBUTE, player.DisplayName);
		}
	}
}
