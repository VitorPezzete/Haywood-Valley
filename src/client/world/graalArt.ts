// O boneco do jogador, no formato do Graal, com as cabeças e os corpos dos contribuidores (zar, jen,
// raskit, daisy e os outros dos créditos). Tela de 32×48: a cabeça em cima, o corpo 16 pixels abaixo
// dela e por baixo da cabeça, como no Graal. 4 direções, parado e andando, e a cabeça pisca. Cada peça
// vem em camadas (graal.ts): a peça inteira nas cores originais e, por cima, uma máscara em cinza por
// parte pintável, com o degradê e os detalhes da parte, que só aparece quando o jogador escolhe uma cor
// para ela e recebe essa cor por `ImageColor3`.
import { CLOTH_KEYS, colorOfRgb, DETAIL_KEYS, Look, lookBody, lookHead, ORIGINAL } from "shared/appearance";
import { ASSET_LISTS } from "shared/assets";
import { GraalBody, GraalHead, GraalLayer } from "shared/graal";
import { GRAAL_SHEET_COUNT } from "shared/graalData";
import { GRAAL_ORIGINAL_SHEET_COUNT } from "shared/graalDataOriginal";
import { PieceStyle } from "shared/pieceStyle";

/**
 * Quantas das primeiras `count` folhas de uma lista ainda não têm id no registro (o "" no lugar, ou a lista mais
 * curta que as folhas que o pacote montou).
 */
function missingSheets(sheets: readonly string[], count: number) {
	let missing = 0;
	for (let i = 0; i < count; i++) {
		if ((sheets[i] ?? "") === "") missing++;
	}
	return missing;
}

/**
 * Folhas graal_<n>.png no estilo do Aeko, montadas por tools/graal_pack.py (pasta Aseprite) em
 * contribuidores/pack_aeko. Células de 32×32, 32 por linha. Os ids vêm do registro (assets/registro.json, chaves
 * graal.aeko.<n>): depois de rodar o script e enviar só as folhas novas, `npm run assets -- --importar` traz os ids
 * do contribuidores/pack_aeko/enviadas.json para o registro. O estilo original tem as folhas casadas célula a célula
 * com estas em contribuidores/pack_original (chaves graal.original.<n>).
 */
export const GRAAL_SHEETS: readonly string[] = ASSET_LISTS["graal.aeko"];
{
	const missing = missingSheets(GRAAL_SHEETS, GRAAL_SHEET_COUNT);
	if (missing > 0) {
		warn(`[graalArt] ${missing} folha(s) do boneco sem id no registro (graal.aeko em assets/registro.json)`);
	}
}

/**
 * Folhas graal_<n>.png no estilo original (as cores dos contribuidores), em contribuidores/pack_original,
 * casadas célula a célula com as de GRAAL_SHEETS: a camada de uma peça fica na mesma folha e na mesma
 * célula nos dois estilos (as poucas exceções estão em GRAAL_LAYERS_ORIGINAL, graalDataOriginal.ts). Os
 * ids, na ordem, vêm do registro (graal.original.<n>; enviadas em 2026-10-18).
 */
export const GRAAL_SHEETS_ORIGINAL: readonly string[] = ASSET_LISTS["graal.original"];
{
	const missing = missingSheets(GRAAL_SHEETS_ORIGINAL, GRAAL_ORIGINAL_SHEET_COUNT);
	if (missing > 0) {
		warn(
			`[graalArt] ${missing} folha(s) do estilo original sem id no registro (graal.original em assets/registro.json)`,
		);
	}
}

/** As folhas das peças do estilo `style`. */
export function sheetsOf(style: PieceStyle) {
	return style === 1 ? GRAAL_SHEETS_ORIGINAL : GRAAL_SHEETS;
}

/**
 * A tela do boneco, em pixels de arte: a mesma área do Graal, para as posições das animações dele valerem
 * como estão (de lado, a cabeça e o corpo vão até 6 pixels para o lado).
 */
export const FIGURE = new Vector2(48, 48);
/** Uma célula das folhas: um quadro da cabeça ou do corpo. */
export const GRAAL_CELL = new Vector2(32, 32);
/** O ponto da tela que fica sobre o chão: a sola de quem está de frente ou de lado, no meio da sombra do Graal. */
export const FEET = new Vector2(24, 47);
const SHEET_COLUMNS = 32;

/** Para onde o boneco olha, na ordem das colunas do corpo e dos quadros da cabeça. "Baixo" é virado para a câmera. */
export const enum Facing {
	Up = 0,
	Left = 1,
	Down = 2,
	Right = 3,
}

/**
 * As animações do boneco, como os ganis padrão do Graal (ver as poses abaixo): parado e andando, sentado,
 * deitado, empurrando, segurando, puxando, carregando (andando e parado) e levantando um objeto.
 */
export const enum Anim {
	Idle = 0,
	Walk = 1,
	Sit = 2,
	Lie = 3,
	Push = 4,
	Grab = 5,
	Pull = 6,
	Carry = 7,
	CarryIdle = 8,
	Lift = 9,
}

/** A célula da cabeça vista de cima, depois das 4 direções: para deitar e dormir. */
export const HEAD_TOP = 4;
/**
 * O corpo traz as 22 linhas do molde do Graal (todas as peças seguem o mesmo): 0 parado, 1 a 5 andar,
 * 6 a 9 golpe, 10 a 14 segurar, puxar e empurrar, 15 braços soltos, 16 a 18 andar sem braços
 * (carregar), 19 e 20 sentar e cair, 21 braços para cima, deitado e sombra. As linhas de cada
 * animação estão nas poses abaixo.
 */
export const BODY_ROWS = 22;

type Spot = [number, number];

/**
 * Uma pose do Graal: a linha do corpo e, por direção (cima, esquerda, baixo, direita), o canto da célula do
 * corpo e o da cabeça na tela de 48×48 (y negativo sobe acima dela, como no sentar do Graal).
 */
interface Pose {
	row: number;
	/** A célula [linha, coluna] do corpo em cada direção, quando não é a da linha `row`. */
	cells?: Spot[];
	body: Spot[];
	head: Spot[];
	/** Os braços para cima, por cima da cabeça (carregando). */
	hands?: boolean;
	/** Onde vai o objeto carregado, em cada direção. */
	item?: Spot[];
	/** Só a cabeça: o corpo fica escondido. */
	noBody?: boolean;
}

/** A mesma linha do corpo nas 4 direções. */
function cellsOf(row: number): Spot[] {
	return [
		[row, 0],
		[row, 1],
		[row, 2],
		[row, 3],
	];
}

/**
 * Parado, como no idle.gani do Graal: o corpo em y 16 e a cabeça em y 2, entrando 18 pixels no corpo
 * (com a cabeça em 0, como antes, sobrava uma falha no pescoço); de lado, os dois vão 4 pixels para o
 * lado, para o desenho ficar em cima da sombra.
 */
const IDLE: Pose = {
	row: 0,
	body: [
		[8, 16],
		[12, 16],
		[8, 16],
		[4, 16],
	],
	head: [
		[8, 2],
		[12, 2],
		[8, 2],
		[4, 2],
	],
};

const WALK_A: Pose = {
	row: 4,
	body: [
		[8, 16],
		[12, 16],
		[8, 16],
		[2, 16],
	],
	head: [
		[8, 4],
		[12, 0],
		[8, 2],
		[4, 0],
	],
};
const WALK_B: Pose = {
	row: 5,
	body: [
		[8, 17],
		[10, 16],
		[8, 20],
		[4, 16],
	],
	head: [
		[8, 0],
		[12, 2],
		[8, 0],
		[4, 2],
	],
};
const WALK_C: Pose = {
	row: 3,
	body: [
		[8, 17],
		[12, 18],
		[8, 16],
		[2, 18],
	],
	head: [
		[8, 4],
		[12, 2],
		[8, 4],
		[4, 2],
	],
};
const WALK_D: Pose = {
	row: 2,
	body: [
		[8, 16],
		[12, 14],
		[8, 16],
		[2, 14],
	],
	head: [
		[8, 2],
		[12, 0],
		[8, 2],
		[4, 0],
	],
};
const WALK_E: Pose = {
	row: 1,
	body: [
		[8, 15],
		[10, 16],
		[8, 14],
		[4, 16],
	],
	head: [
		[8, 0],
		[10, 0],
		[8, 0],
		[6, 0],
	],
};
/**
 * O andar, como no walk.gani padrão do Graal (lido em 2026-10-17 do visualizador de ganis do
 * dustyshouri): 8 quadros nas linhas 4, 5, 4, 3, 2, 1, 2, 3 do corpo, ida e volta, com braço e perna
 * alternando, e em cada quadro a posição do corpo e da cabeça (a cabeça segue o ombro, o corpo balança
 * e, de lado, vai 2 pixels para os lados). Sem tempo no arquivo, cada quadro dura o padrão do Graal,
 * 0,05 s: 20 por segundo.
 */
const WALK = [WALK_A, WALK_B, WALK_A, WALK_C, WALK_D, WALK_E, WALK_D, WALK_C];
export const WALK_FRAMES = WALK.size();
export const WALK_FPS = 20;
/**
 * Pixels de arte andados em cada quadro do andar: no passo do Graal (`WALK_PX_PER_SECOND`, 160) e a 20
 * quadros por segundo, 8. O jogo troca o quadro pela distância andada, não pelo relógio: o andar acompanha
 * o boneco em qualquer velocidade (mais devagar para cima na tela, raspando numa parede) e o pé não
 * escorrega.
 */
export const WALK_STEP_PX = 8;
/** A altura da cabeça na tela, parado: a grade de cabeças sobe esse tanto para a cabeça ficar no meio. */
export const HEAD_Y = IDLE.head[0][1];

/**
 * Sentado, como no sit.gani do Graal (lido em 2026-10-17 do visualizador do dustyshouri): de costas, o corpo
 * de levantar (linha 14); de lado, as células de sentar da linha 20 e, de frente, a da 19. O corpo e a
 * cabeça sobem 8 a 10 pixels, para o boneco ficar em cima do assento, que a vista em 3/4 desenha mais alto.
 */
const SIT: Pose = {
	row: 19,
	cells: [
		[14, 0],
		[20, 1],
		[19, 3],
		[20, 3],
	],
	body: [
		[8, 6],
		[8, 8],
		[8, 10],
		[8, 8],
	],
	head: [
		[8, -4],
		[16, -6],
		[8, -6],
		[0, -6],
	],
};

/**
 * Deitado na cama: só a cabeça, de frente e de olho fechado, sobre o travesseiro; a coberta da cama (os
 * próprios tiles da parte de baixo dela) vai por cima do corpo. O corpo deitado do molde (linha 21, 48×32)
 * fica de lado, atravessado, e não serve à cama em pé do Aeko: debaixo da coberta, não aparece.
 */
const LIE: Pose = {
	row: 0,
	noBody: true,
	body: IDLE.body,
	head: [
		[8, 8],
		[8, 8],
		[8, 8],
		[8, 8],
	],
};

/**
 * Segurando, como no grab.gani: os braços para a frente (linha 10; de costas, a 13) e a cabeça inclinada
 * para o lado do móvel.
 */
const GRAB: Pose = {
	row: 10,
	cells: [
		[13, 0],
		[10, 1],
		[10, 2],
		[10, 3],
	],
	body: [
		[8, 16],
		[10, 16],
		[8, 16],
		[6, 16],
	],
	head: [
		[8, 2],
		[8, 2],
		[8, 6],
		[8, 2],
	],
};

/**
 * Puxando, como no pull.gani: a linha 13, com a cabeça jogada para trás. De costas, o Graal usa o corpo
 * de braços para cima (linha 21) com 48 pixels de altura, mas as folhas guardam só 32 (graal_pack.py deixa
 * os 16 de baixo de fora): sem as pernas, fica a pose de segurar de costas.
 */
const PULL: Pose = {
	row: 13,
	body: [
		[8, 16],
		[8, 16],
		[8, 16],
		[8, 16],
	],
	head: [
		[8, 2],
		[16, 2],
		[8, 4],
		[0, 2],
	],
};

/**
 * Empurrando, contra a parede ou um móvel. O visualizador não tem o push.gani: como no Graal, o corpo
 * alterna as linhas de empurrar do molde (10, 11, 12 e 11), na posição do segurar, inclinado para a frente.
 */
const PUSH = [10, 11, 12, 11].map((row): Pose => ({ ...GRAB, row, cells: cellsOf(row) }));
export const PUSH_FRAMES = PUSH.size();
/** Quadros de empurrar por segundo: devagar, como quem faz força. */
export const PUSH_FPS = 6;

const ITEM_LOW: Spot[] = [
	[8, -20],
	[8, -22],
	[8, -20],
	[8, -22],
];
const ITEM_HIGH: Spot[] = [
	[8, -22],
	[8, -22],
	[8, -22],
	[8, -22],
];
const ITEM_DOWN: Spot[] = [
	[8, -18],
	[8, -20],
	[8, -18],
	[8, -20],
];

/**
 * Carregando, como no carry.gani: o andar sem braços (linhas 16 a 20) e os braços para cima (linha 15)
 * por cima da cabeça, segurando o objeto 20 pixels acima dela. 8 quadros, no passo do andar.
 */
const CARRY_A: Pose = {
	row: 17,
	hands: true,
	body: [
		[8, 16],
		[10, 14],
		[8, 16],
		[6, 14],
	],
	head: [
		[8, 2],
		[12, 0],
		[8, 2],
		[4, 0],
	],
	item: ITEM_LOW,
};
const CARRY_B: Pose = {
	row: 18,
	hands: true,
	body: [
		[8, 16],
		[10, 14],
		[8, 16],
		[6, 14],
	],
	head: [
		[8, 4],
		[12, 2],
		[8, 4],
		[4, 2],
	],
	item: ITEM_DOWN,
};
const CARRY_C: Pose = {
	row: 16,
	hands: true,
	body: [
		[8, 16],
		[10, 16],
		[8, 16],
		[6, 16],
	],
	head: [
		[8, 0],
		[12, 0],
		[8, 0],
		[4, 0],
	],
	item: ITEM_HIGH,
};
const CARRY_D: Pose = {
	...CARRY_A,
	cells: [
		[19, 0],
		[17, 1],
		[19, 2],
		[17, 3],
	],
};
const CARRY_E: Pose = {
	...CARRY_B,
	cells: [
		[20, 0],
		[18, 1],
		[20, 2],
		[18, 3],
	],
};
const CARRY = [CARRY_A, CARRY_B, CARRY_A, CARRY_C, CARRY_D, CARRY_E, CARRY_D, CARRY_C];
export const CARRY_FRAMES = CARRY.size();

/** Levantando o objeto do chão (linha 14, braços para a frente), antes de ir para cima da cabeça. */
const LIFT: Pose = {
	row: 14,
	body: IDLE.body,
	head: IDLE.head,
	item: [
		[8, 4],
		[0, 8],
		[8, 18],
		[16, 8],
	],
};

/** A pose do quadro `frame` da animação. */
function poseOf(anim: Anim, frame: number): Pose {
	switch (anim) {
		case Anim.Walk:
			return WALK[frame % WALK_FRAMES];
		case Anim.Sit:
			return SIT;
		case Anim.Lie:
			return LIE;
		case Anim.Push:
			return PUSH[frame % PUSH_FRAMES];
		case Anim.Grab:
			return GRAB;
		case Anim.Pull:
			return PULL;
		case Anim.Carry:
			return CARRY[frame % CARRY_FRAMES];
		case Anim.CarryIdle:
			return CARRY_C;
		case Anim.Lift:
			return LIFT;
		default:
			return IDLE;
	}
}

/** O que a pose desenha além da cabeça e do corpo: os braços por cima da cabeça e o objeto carregado. */
export function poseExtras(anim: Anim, frame: number, facing: Facing) {
	const pose = poseOf(anim, frame);
	const [hx, hy] = pose.head[facing];
	return {
		hands: pose.hands === true,
		handsCell: 15 * 4 + facing,
		handsAt: new Vector2(hx, hy),
		item: pose.item ? new Vector2(pose.item[facing][0], pose.item[facing][1]) : undefined,
		noBody: pose.noBody === true,
	};
}

/** Quanto a cabeça sobe na pose, em relação a quem está parado: os balões sobem junto. */
export function poseRise(anim: Anim, facing: Facing) {
	return IDLE.head[facing][1] - poseOf(anim, 0).head[facing][1];
}

/**
 * A tela do boneco no mundo: a de 48×48 do Graal com 32 pixels a mais em cima, para o que a pose põe acima
 * dela (a cabeça de quem senta, o objeto carregado apoiado no alto da cabeça, que com a cabeça de 32 sobe até
 * uns 30 pixels acima da tela). As posições das poses descem esse tanto.
 */
export const ACTOR_TOP = 32;
export const ACTOR_FIGURE = new Vector2(FIGURE.X, FIGURE.Y + ACTOR_TOP);
export const ACTOR_FEET = new Vector2(FEET.X, FEET.Y + ACTOR_TOP);

/** Camadas de um boneco, no máximo: no corpo a inteira, a pele e 6 partes da roupa; na cabeça a inteira, o cabelo, a pele, os olhos e 3 enfeites. */
export const MAX_FIGURE_LAYERS = 15;

/** Cada boneco pisca a cada 3 a 6 segundos, de olho fechado por um instante. */
export const BLINK_MIN = 3;
export const BLINK_MAX = 6;
export const BLINK_TIME = 0.15;

/** Uma camada do boneco: a folha, o bloco, a cor que multiplica a imagem e se é da cabeça ou do corpo. */
export interface FigureLayer {
	image: string;
	color: Color3;
	head: boolean;
	/** A primeira célula do bloco da camada na folha. */
	cell: number;
	/** Se a camada muda na piscada. */
	blink: boolean;
}

const WHITE = new Color3(1, 1, 1);

const KEY_OF_TINT = {
	skin: "skinRgb",
	hair: "hairRgb",
	eyes: "eyesRgb",
} as const;

/**
 * A cor que pinta a máscara da camada, ou nada se ela não aparece. A camada inteira (sem `tint`)
 * aparece sempre, sem tinta. A máscara de uma parte só aparece com cor escolhida: na cor original, o
 * desenho embaixo já mostra a parte como ela é. A pele e o cabelo desenhados no corpo (cabelo comprido,
 * trança) são a exceção: na cor original, seguem os da cabeça, para os dois saírem com o mesmo tom.
 */
function tintOf(look: Look, layer: GraalLayer, head: boolean): Color3 | undefined {
	if (layer.tint === undefined) return WHITE;
	const key =
		layer.tint === "cloth"
			? CLOTH_KEYS[layer.part ?? 0]
			: layer.tint === "detail"
				? DETAIL_KEYS[layer.part ?? 0]
				: KEY_OF_TINT[layer.tint];
	if (key === undefined) return undefined;
	const chosen = look[key];
	if (chosen !== ORIGINAL) return colorOfRgb(chosen);
	// Pele e cabelo desenhados no corpo seguem os da cabeça (no estilo dela), para combinarem.
	if ((layer.tint === "skin" || layer.tint === "hair") && !head) {
		const headPiece = lookHead(look);
		const headColor = layer.tint === "skin" ? headPiece?.skin : headPiece?.hair;
		if (headColor !== undefined) return colorOfRgb(headColor);
	}
	return undefined;
}

/** As camadas da peça, nas folhas do estilo dela. */
function pushLayers(layers: FigureLayer[], look: Look, piece: GraalHead | GraalBody, head: boolean) {
	const sheets = sheetsOf(piece.style);
	for (const layer of piece.layers) {
		const color = tintOf(look, layer, head);
		if (color) {
			layers.push({ image: sheets[layer.sheet] ?? "", color, head, cell: layer.cell, blink: layer.blink });
		}
	}
}

/** As camadas de um visual, de baixo para cima: o corpo e depois a cabeça, cada um no estilo escolhido para ele. */
export function figureLayers(look: Look): FigureLayer[] {
	const layers = new Array<FigureLayer>();
	const body = lookBody(look);
	if (body) pushLayers(layers, look, body, false);
	const head = lookHead(look);
	if (head) pushLayers(layers, look, head, true);
	return layers;
}

/** As camadas só da cabeça, para os ícones da tela de personalizar. */
export function headLayers(look: Look): FigureLayer[] {
	const layers = new Array<FigureLayer>();
	const head = lookHead(look);
	if (head) pushLayers(layers, look, head, true);
	return layers;
}

function cellOffset(cell: number) {
	return new Vector2((cell % SHEET_COLUMNS) * GRAAL_CELL.X, math.floor(cell / SHEET_COLUMNS) * GRAAL_CELL.Y);
}

/**
 * Canto da camada na folha (`ImageRectOffset`), no quadro `frame` da animação, na direção `facing`.
 * `closed` mostra o olho fechado nas camadas da cabeça que mudam na piscada (de costas não há olho).
 */
export function layerRect(layer: FigureLayer, anim: Anim, frame: number, facing: Facing, closed: boolean) {
	if (layer.head) {
		// O bloco da cabeça: as 4 direções, a vista de cima (HEAD_TOP) e, com piscada, o olho fechado de lado e de frente.
		const blinking = closed && layer.blink && facing !== Facing.Up;
		return cellOffset(layer.cell + (blinking ? HEAD_TOP + facing : facing));
	}
	const pose = poseOf(anim, frame);
	const [row, col] = pose.cells ? pose.cells[facing] : [pose.row, facing];
	return cellOffset(layer.cell + row * 4 + col);
}

/** Canto, na folha, de uma célula do bloco da camada (no corpo, linha * 4 + coluna). */
export function layerCell(layer: FigureLayer, index: number) {
	return cellOffset(layer.cell + index);
}

/**
 * Onde a imagem da camada fica dentro da tela de 48×48, no quadro `frame` da animação, na direção
 * `facing`: a posição do Graal para o corpo ou a cabeça (ver IDLE e WALK). Sem isso a cabeça ficava
 * parada enquanto o corpo andava, com uma falha no pescoço.
 */
export function layerPosition(layer: FigureLayer, anim = Anim.Idle, frame = 0, facing = Facing.Down) {
	const pose = poseOf(anim, frame);
	const [x, y] = (layer.head ? pose.head : pose.body)[facing];
	return new Vector2(x, y);
}

/**
 * Altura do boneco, em pixels de arte acima da sola: até o pixel mais alto da cabeça. Os balões
 * ficam acima dela, então um penteado alto não fica coberto.
 */
export function figureHeight(look: Look) {
	const head = lookHead(look);
	return FEET.Y - (head ? HEAD_Y + head.top : IDLE.body[2][1]);
}

/** Direção de cada quarto de volta, começando na direita e girando para baixo da tela. */
const FACING_OF_SECTOR = [Facing.Right, Facing.Down, Facing.Left, Facing.Up];
const SECTOR_OF_FACING = [3, 2, 1, 0];
/** Quem já olha para uma direção só troca quando o movimento passa do quarto com esta folga, em graus. */
const FACING_SLACK = 10;

/**
 * A direção de quem anda `right` para a direita e `down` para baixo da tela. Na diagonal fica a que
 * já estava, como no Graal, e só troca quando o movimento sai dela com folga, para não tremer.
 */
export function facingOf(right: number, down: number, current: Facing): Facing {
	const angle = math.deg(math.atan2(down, right));
	const center = SECTOR_OF_FACING[current] * 90;
	const off = math.abs(((angle - center + 540) % 360) - 180);
	if (off <= 45 + FACING_SLACK) return current;
	const sector = ((math.round(angle / 90) % 4) + 4) % 4;
	return FACING_OF_SECTOR[sector];
}

/** Ordem em que a prévia da tela de personalizar gira. */
export const TURN_ORDER = [Facing.Down, Facing.Left, Facing.Up, Facing.Right];
