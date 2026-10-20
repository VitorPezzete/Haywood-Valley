// As ações do boneco que os outros jogadores precisam ver e que não saem do mapa: empurrar (contra a
// parede ou o móvel seguro), segurar, puxar e sentar (para que lado o boneco virou sentado). Deitar e nadar
// cada cliente tira sozinho do lugar em que o boneco parou; carregar, da peça que o servidor diz que está com ele.

/** Atributo do jogador com a ação de agora, em `encodeAction`. O servidor grava o que o cliente dele pede. */
export const ACTION_ATTRIBUTE = "Action";

export type BodyAction = "push" | "grab" | "pull" | "sit";

export interface ActionState {
	kind: BodyAction;
	facing: number;
}

const BODY_ACTIONS = new Set<string>(["push", "grab", "pull", "sit"]);

export function encodeAction(kind: BodyAction | undefined, facing: number) {
	return kind === undefined ? "" : `${kind}:${facing}`;
}

/** Lê o atributo; texto estranho conta como nenhuma ação. */
export function parseAction(value: unknown): ActionState | undefined {
	if (!typeIs(value, "string") || value === "") return undefined;
	const [kind, facing] = value.match("^(%a+):([0-3])$");
	if (!typeIs(kind, "string") || !BODY_ACTIONS.has(kind)) return undefined;
	return { kind: kind as BodyAction, facing: tonumber(facing) ?? 2 };
}

/** Se o par que o cliente mandou é uma ação que existe (ou nenhuma, com `kind` vazio). */
export function isAction(kind: unknown, facing: unknown) {
	return (
		typeIs(kind, "string") &&
		(kind === "" || BODY_ACTIONS.has(kind)) &&
		typeIs(facing, "number") &&
		facing >= 0 &&
		facing <= 3 &&
		facing % 1 === 0
	);
}

/**
 * Quanto tempo andando contra o que bloqueia, em segundos, até o boneco fazer força para empurrar; contra
 * uma peça que se move, ela desliza uma célula (como no Graal, sem tecla).
 */
export const PUSH_AFTER = 0.4;
/**
 * Sentado, um toque numa direção (mais curto que isto, em segundos) só vira o boneco para esse lado, sem
 * levantar; segurar a direção mais que isto levanta e anda (pedido do usuário em 2026-10-18, como no Graal).
 */
export const SIT_TURN_HOLD = 0.25;
/** Depois que a peça deslizou, quem continua andando contra ela empurra de novo sem esperar, por este tempo. */
export const PUSH_STREAK = 0.6;
