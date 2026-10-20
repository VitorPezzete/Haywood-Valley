// O que faz o rosto do personagem reagir sozinho. O jogador não escolhe reação: ela vem do que
// acontece com ele (ficar parado, esbarrar, encontrar alguém, falar no chat). Cada situação aponta
// para uma reação de `Faces.reactions` pelo id; se a folha de rostos não tiver essa reação, a
// situação simplesmente não muda o rosto.

import { Faces } from "./faces";

export interface Mood {
	/** Índice em `Faces.reactions`, ou -1 se a folha não tem essa reação. */
	reaction: number;
	/** Se o balão da reação sobe em cima da cabeça. */
	bubble: boolean;
}

function mood(id: string, bubble: boolean): Mood {
	return { reaction: Faces.reactions.findIndex((reaction) => reaction.id === id), bubble };
}

export const Moods = {
	/** Entrou no jogo, ou outro jogador chegou perto. */
	greet: mood("sorriso", false),
	/** Andou contra uma árvore ou pedra. */
	bump: mood("ai", false),
	/** Parado há um bom tempo: os olhos pesam. */
	drowsy: mood("tedio", false),
	/** Parado há muito tempo: dormiu. */
	sleep: mood("dormindo", true),
	/** Falou no chat. */
	talk: mood("falando", false),
	/** Andando há um tempo sem parar. */
	stroll: mood("cantando", true),
	/** Acabou de trocar uma peça na tela de personalizar. */
	pleased: mood("sorriso", false),
};

/** Segundos parado até os olhos pesarem e até dormir. Todo cliente conta isso para todo jogador. */
export const DROWSY_AFTER = 40;
export const SLEEP_AFTER = 60;

/** Tempo mínimo entre duas reações disparadas pelo mesmo jogador, em segundos. */
export const REACTION_COOLDOWN = 0.6;

/** Se `value` é o índice de uma reação que existe. */
export function isReaction(value: unknown): value is number {
	return typeIs(value, "number") && value === math.floor(value) && value >= 0 && value < Faces.reactions.size();
}

/**
 * O que o jogador escreve no chat também mexe no rosto. `has` são trechos que podem estar em
 * qualquer lugar do texto (carinhas, risada comprida); `words` são palavras inteiras. Vale a
 * primeira linha que casar, então as mais específicas vêm antes.
 *
 * As palavras valem em qualquer idioma da interface: cada jogador escreve na língua dele, então
 * cada linha junta português e inglês.
 */
const CHAT: { reaction: string; has?: string[]; words?: string[] }[] = [
	{ reaction: "choro", has: [":'(", "t_t", ";-;", ";_;"], words: ["buaa", "chorando", "cry", "crying"] },
	{ reaction: "bravo", has: [">:("], words: ["grr", "aff", "raiva", "ugh", "angry"] },
	{ reaction: "apaixonado", has: ["<3"], words: ["s2", "amo", "amei", "love", "luv"] },
	{ reaction: "risada", has: ["kkk", "haha", "hehe", "rsrs", ":d", "lmao", "rofl"], words: ["lol", "xd"] },
	{ reaction: "piscadinha", has: [";)", ";d", ";-)"] },
	{ reaction: "triste", has: [":(", ":/"], words: ["poxa", "triste", "sad"] },
	{ reaction: "surpresa", has: [":o", "!!"], words: ["nossa", "eita", "uau", "wow", "whoa", "woah", "omg"] },
	{ reaction: "dormindo", has: ["zzz"], words: ["sono", "sleepy"] },
	{ reaction: "duvida", has: ["??"], words: ["hein", "huh"] },
	{ reaction: "sorriso", has: [":)", "(:", "=)", "^^"], words: ["oi", "olá", "ola", "opa", "hi", "hello", "hey"] },
];

const CHAT_MOODS = CHAT.map((entry) => ({
	mood: mood(entry.reaction, true),
	has: entry.has ?? [],
	words: new Set(entry.words ?? []),
}));

/** A reação que um texto do chat pede; sem nada especial nele, a de falar. */
export function chatMood(text: string): Mood {
	const lower = text.lower();
	// Palavra é tudo o que não é espaço nem pontuação; as letras acentuadas ficam dentro dela.
	const words = new Array<string>();
	for (const [word] of lower.gmatch("[^%s%p]+")) words.push(word as string);

	for (const entry of CHAT_MOODS) {
		if (entry.mood.reaction < 0) continue;
		for (const piece of entry.has) {
			if (lower.find(piece, 1, true)[0] !== undefined) return entry.mood;
		}
		for (const word of words) {
			if (entry.words.has(word)) return entry.mood;
		}
	}
	return Moods.talk;
}
