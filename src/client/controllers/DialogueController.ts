import { Controller, OnStart } from "@flamework/core";
import { Players, RunService, UserInputService } from "@rbxts/services";
import { mount, source } from "@rbxts/vide";
import { DialogueBox, DialogueLine } from "client/ui/DialogueBox";
import { MovementController } from "./MovementController";

/** Letras por segundo com que a fala aparece. */
const SPEED = 45;

const ADVANCE_KEYS = new Set<Enum.KeyCode>([Enum.KeyCode.Space, Enum.KeyCode.Return, Enum.KeyCode.E]);

function lengthOf(text: string) {
	const [count] = utf8.len(text);
	return typeIs(count, "number") ? count : text.size();
}

/**
 * Conversas na tela: mostra uma fala por vez, letra a letra. O jogador avança com Espaço, Enter,
 * E ou clique; o primeiro toque completa a fala, o segundo passa para a próxima. Enquanto houver
 * fala, o personagem fica parado.
 */
@Controller()
export class DialogueController implements OnStart {
	private queue = new Array<DialogueLine>();
	private line = source<DialogueLine | undefined>(undefined);
	private shown = source(0);
	private release?: () => void;

	constructor(private movement: MovementController) {}

	onStart() {
		const waiting = () => {
			const current = this.line();
			return current !== undefined && this.shown() >= lengthOf(current.text);
		};
		const playerGui = Players.LocalPlayer.WaitForChild("PlayerGui");
		mount(() => DialogueBox({ line: this.line, shown: this.shown, waiting }), playerGui);

		RunService.Heartbeat.Connect((dt) => {
			const current = this.line();
			if (current && this.shown() < lengthOf(current.text)) this.shown(this.shown() + dt * SPEED);
		});

		UserInputService.InputBegan.Connect((input, processed) => {
			if (processed || this.line() === undefined) return;
			const click =
				input.UserInputType === Enum.UserInputType.MouseButton1 || input.UserInputType === Enum.UserInputType.Touch;
			if (click || ADVANCE_KEYS.has(input.KeyCode)) this.advance();
		});
	}

	/** Põe falas na fila; começam assim que as anteriores terminarem. */
	say(lines: DialogueLine[]) {
		for (const item of lines) this.queue.push(item);
		if (this.line() === undefined) this.next();
	}

	private advance() {
		const current = this.line();
		if (!current) return;
		const total = lengthOf(current.text);
		if (this.shown() < total) this.shown(total);
		else this.next();
	}

	private next() {
		const following = this.queue.shift();
		this.shown(0);
		this.line(following);
		if (following) {
			this.release ??= this.movement.hold();
		} else {
			this.release?.();
			this.release = undefined;
		}
	}
}
