import { Networking } from "@flamework/networking";

interface ClientToServerEvents {
	/** O visual montado na tela de personalizar, no texto de `encodeLook`. */
	setLook(look: string): void;
	/** O rosto do jogador reagiu a alguma coisa: índice em `Faces.reactions` e se o balão aparece. */
	react(reaction: number, bubble: boolean): void;
}

interface ServerToClientEvents {
	/** Um jogador reagiu; cada cliente mostra o rosto (e o balão) no boneco dele. */
	reacted(userId: number, reaction: number, bubble: boolean): void;
}

export const GlobalEvents = Networking.createEvent<ClientToServerEvents, ServerToClientEvents>();
