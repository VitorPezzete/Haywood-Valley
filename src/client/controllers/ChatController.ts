import { Controller, OnStart } from "@flamework/core";
import { Players, TextChatService } from "@rbxts/services";
import { CharacterController } from "./CharacterController";

/** O canal público do chat do Roblox. Os outros (mensagens do sistema, cochichos, equipes) não sobem balão. */
const PUBLIC_CHANNEL = "RBXGeneral";
/** Por quanto tempo, em segundos, uma mensagem fica lembrada, para o balão não subir duas vezes. */
const SEEN_SECONDS = 60;
/** A partir de quantas mensagens lembradas as antigas são esquecidas. */
const SEEN_LIMIT = 100;

/**
 * Troca o balão de chat do Roblox, que fica em cima do personagem invisível, pelo nosso balão de fala
 * (`CharacterController.say`). A janela e a barra do chat continuam as do Roblox.
 *
 * Cada cliente desenha o balão a partir da mensagem que o chat do Roblox entregou a ele: o texto já
 * vem filtrado para este jogador (e traduzido, se ele ligou a tradução do chat). O texto nunca passa
 * pelo servidor nem por outro cliente. Mensagens do sistema, cochichos e mensagens recusadas pelo
 * filtro não sobem balão. Quem o jogador silencia com /mute deixa de ter balão: o Roblox continua
 * entregando as mensagens dele, e é a interface que precisa escondê-las.
 */
@Controller()
export class ChatController implements OnStart {
	private muted = new Set<number>();
	private seen = new Map<string, number>();

	constructor(private characters: CharacterController) {}

	onStart() {
		if (TextChatService.ChatVersion !== Enum.ChatVersion.TextChatService) {
			warn("[chat] ChatVersion is not TextChatService: chat balloons need it (set it in Studio)");
		}
		// Só os balões do Roblox saem. A configuração pode chegar depois deste controller.
		const turnOff = (child: Instance) => {
			if (child.IsA("BubbleChatConfiguration")) child.Enabled = false;
		};
		for (const child of TextChatService.GetChildren()) turnOff(child);
		TextChatService.ChildAdded.Connect(turnOff);

		TextChatService.MessageReceived.Connect((message) => this.receive(message));
		task.spawn(() => this.watchMute("RBXMuteCommand", true));
		task.spawn(() => this.watchMute("RBXUnmuteCommand", false));
	}

	private receive(message: TextChatMessage) {
		// Só a mensagem que passou pelo servidor: quem escreve recebe antes a cópia local, sem filtro.
		if (message.Status !== Enum.TextChatMessageStatus.Success) return;
		const source = message.TextSource;
		if (!source || message.TextChannel?.Name !== PUBLIC_CHANNEL) return;
		if (this.seen.has(message.MessageId)) return;
		this.remember(message.MessageId);
		if (this.muted.has(source.UserId)) return;
		const player = Players.GetPlayerByUserId(source.UserId);
		if (!player) return;
		const text = this.textOf(message);
		// Mensagem só com espaços não tem o que mostrar.
		if (text.find("%S")[0] === undefined) return;
		this.characters.say(player, text);
	}

	private textOf(message: TextChatMessage) {
		const [ok, translating] = pcall(() => TextChatService.ChatTranslationEnabled);
		return ok && translating === true && message.Translation !== "" ? message.Translation : message.Text;
	}

	private remember(id: string) {
		const now = os.clock();
		this.seen.set(id, now);
		if (this.seen.size() <= SEEN_LIMIT) return;
		for (const [old, at] of this.seen) {
			if (now - at > SEEN_SECONDS) this.seen.delete(old);
		}
	}

	private watchMute(name: string, muting: boolean) {
		const commands = TextChatService.WaitForChild("TextChatCommands", 30);
		const command = commands?.WaitForChild(name, 30);
		if (!command?.IsA("TextChatCommand")) return;
		command.Triggered.Connect((_, text) => {
			const words = new Array<string>();
			for (const [word] of text.gmatch("%S+")) words.push(word as string);
			const target = words[1];
			if (target === undefined) return;
			const wanted = (target.sub(1, 1) === "@" ? target.sub(2) : target).lower();
			for (const player of Players.GetPlayers()) {
				if (player.Name.lower() !== wanted && player.DisplayName.lower() !== wanted) continue;
				if (muting) {
					this.muted.add(player.UserId);
					this.characters.hush(player);
				} else {
					this.muted.delete(player.UserId);
				}
			}
		});
	}
}
