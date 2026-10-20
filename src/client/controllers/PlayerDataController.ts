import { Controller, OnStart } from "@flamework/core";
import { Players } from "@rbxts/services";
import { Events } from "client/network";
import { playerData } from "client/state/playerData";
import { t } from "client/ui/i18n";

/**
 * Recebe do servidor os favoritos e os visuais salvos do jogador (PlayerDataService): ao entrar e quando o servidor
 * recusa um pedido. Se os dados não puderam ser lidos, o jogador sai com o aviso (nada desta sessão seria gravado).
 */
@Controller()
export class PlayerDataController implements OnStart {
	onStart() {
		Events.playerDataFailed.connect(() => Players.LocalPlayer.Kick(t("menu.dataFailed")));
		Events.playerData.connect((favoriteHeads, favoriteBodies, savedLooks, character, characterName) => {
			// A decoração não vem por aqui: o cliente a recebe peça a peça (`decorChanged`, DecorService).
			playerData((data) => ({ ...data, favoriteHeads, favoriteBodies, savedLooks, character, characterName }));
		});
	}
}
