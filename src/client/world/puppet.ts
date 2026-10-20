// O desenho de um boneco no formato do Graal, comum aos jogadores (`CharacterController`) e aos moradores
// (`ResidentController`, etapa F do Diorama, seção 12.20): o cartão com as camadas da cabeça e do corpo, os
// braços de carregar, o objeto carregado e a água rasa; vestir um visual, pôr numa pose e pintar com a luz. As
// instâncias de um boneco que sai de cena voltam a um reservatório só, que serve aos dois (seção 3.2 do
// `PLANO_OTIMIZACAO.md`).
import { Look } from "shared/appearance";
import { worldView } from "client/state/camera";
import { Card, createCard } from "./card";
import {
	ACTOR_FEET,
	ACTOR_FIGURE,
	ACTOR_TOP,
	Anim,
	Facing,
	FEET,
	figureHeight,
	FigureLayer,
	figureLayers,
	GRAAL_CELL,
	HEAD_Y,
	layerCell,
	layerPosition,
	layerRect,
	MAX_FIGURE_LAYERS,
	poseExtras,
} from "./graalArt";
import { PieceArt } from "./pieces";
import { setOwnTone, setTintBase } from "./tint";
import { hasWadeSheet, WADE_AT, WADE_BAND, WADE_BAND_AT, WADE_CELL, wadeImage } from "./water";

/** Quanto o objeto carregado (recortado do fundo) entra no cabelo, em pixels de arte: fica apoiado, sem folga. */
const CARRY_REST = 3;
/** Camadas do corpo, no máximo: a inteira, a pele, o cabelo desenhado no corpo e 6 partes da roupa. */
const MAX_BODY_LAYERS = 9;
/**
 * Nadando, o boneco afunda estes pixels de arte e o corpo mostra só as linhas de cima da célula (os
 * ombros): da água para fora, só a cabeça e os ombros, como no Graal.
 */
export const SWIM_SINK = 10;
const SWIM_SHOULDERS = 20;
/** Quantos bonecos guardados, sem dono, para reaproveitar em vez de criar de novo (seção 3.2 do plano). */
const POOL_MAX = 12;
/**
 * Folga em volta da tela, em pixels de arte, para um boneco contar como à mostra (seção 3.3 do
 * `PLANO_OTIMIZACAO.md`): 2 tiles dos lados e em cima; embaixo, o boneco inteiro com o objeto carregado e o balão
 * (o desenho sobe a partir do pé, então um pé logo abaixo da tela ainda mostra a cabeça).
 */
const OFFSCREEN_SIDE = 32;
const OFFSCREEN_BELOW = 160;

/** Se o boneco com o pé em `screenPx` (pixels de arte, `worldToArtPx`) está na tela, com a folga. */
export function puppetOnScreen(screenPx: Vector2) {
	const offset = screenPx.sub(worldView.center);
	const half = worldView.half;
	return !(
		math.abs(offset.X) > half.X + OFFSCREEN_SIDE ||
		offset.Y < -half.Y - OFFSCREEN_SIDE ||
		offset.Y > half.Y + OFFSCREEN_BELOW
	);
}

/** As instâncias de um boneco, que voltam ao reservatório quando ele sai de cena e servem a outro. */
export interface Shell {
	card: Card;
	gui: SurfaceGui;
	/** Uma imagem por camada do visual, de baixo para cima. */
	labels: ImageLabel[];
	/** Os braços de carregar, por cima da cabeça. */
	hands: ImageLabel[];
	/** O objeto carregado. */
	item: ImageLabel;
	wadeBack: ImageLabel;
	wadeFront: ImageLabel;
	splash: ImageLabel;
}

/** O que a pose decide no desenho do boneco (a `ActorPose` do `ActionController` serve). */
export interface ShellPose {
	anim: Anim;
	frame: number;
	facing: Facing;
	/** Nadando: só a cabeça e os ombros fora da água. */
	swim?: boolean;
	/** O objeto carregado, se houver. */
	item?: PieceArt;
}

/** O visual vestido num boneco: as camadas, na ordem de `Shell.labels`, e a altura dele (os balões ficam acima). */
export interface Dressed {
	layers: FigureLayer[];
	height: number;
}

/** Bonecos sem dono, prontos para servir a quem aparecer: jogador ou morador. */
const pool = new Array<Shell>();

/** Quantos bonecos estão guardados no reservatório (o painel de desempenho mostra). */
export function pooledShells() {
	return pool.size();
}

/** As instâncias de um boneco em `parent`: as do reservatório, ou novas. Começa escondido. */
export function takeShell(parent: Instance, name: string): Shell {
	const reused = pool.pop();
	if (reused) {
		reused.card.part.Name = name;
		reused.card.part.Parent = parent;
		resetShell(reused);
		return reused;
	}

	const card = createCard(
		parent,
		name,
		{ image: "", size: ACTOR_FIGURE, anchor: ACTOR_FEET, frames: [Vector2.zero] },
		Vector3.zero,
	);
	const gui = card.image.Parent as SurfaceGui;
	// O personagem pode chegar antes das partes dele: o boneco só aparece quando há onde pôr.
	gui.Enabled = false;
	// As imagens são irmãs criadas em ordem, então as de cima cobrem as de baixo. Cada uma tem uma
	// célula de 32×32: a da cabeça no alto da tela, a do corpo 16 pixels abaixo. Os braços de quem
	// carrega e o objeto carregado vão por cima da cabeça, numa camada acima.
	card.image.Size = UDim2.fromScale(GRAAL_CELL.X / ACTOR_FIGURE.X, GRAAL_CELL.Y / ACTOR_FIGURE.Y);
	card.image.ImageRectSize = GRAAL_CELL;
	const labels = [card.image];
	for (let index = 1; index < MAX_FIGURE_LAYERS; index++) {
		const label = card.image.Clone();
		label.Parent = gui;
		labels.push(label);
	}
	const hands = new Array<ImageLabel>();
	for (let index = 0; index < MAX_BODY_LAYERS; index++) {
		const label = card.image.Clone();
		label.Visible = false;
		label.ZIndex = 2;
		label.Parent = gui;
		hands.push(label);
	}
	const item = card.image.Clone();
	item.Visible = false;
	item.ZIndex = 3;
	item.ImageColor3 = new Color3(1, 1, 1);
	item.Parent = gui;

	// A água rasa: a volta de trás por baixo do corpo (ZIndex 0) e a água da frente e o respingo por cima dele.
	const wadeLabel = (labelName: string, zIndex: number) => {
		const label = card.image.Clone();
		label.Name = labelName;
		label.Visible = false;
		label.ZIndex = zIndex;
		label.ImageColor3 = new Color3(1, 1, 1);
		label.Parent = gui;
		return label;
	};
	const wadeBack = wadeLabel("WadeBack", 0);
	const wadeFront = wadeLabel("WadeFront", 2);
	const splash = wadeLabel("Splash", 2);
	const at = (label: ImageLabel, corner: Vector2, size: Vector2) => {
		label.Position = UDim2.fromScale(corner.X / ACTOR_FIGURE.X, (corner.Y + ACTOR_TOP) / ACTOR_FIGURE.Y);
		label.Size = UDim2.fromScale(size.X / ACTOR_FIGURE.X, size.Y / ACTOR_FIGURE.Y);
	};
	const sheet = hasWadeSheet();
	for (const [label, row] of [
		[wadeBack, 0],
		[wadeFront, 1],
		[splash, 2],
	] as [ImageLabel, number][]) {
		const [image, offset, size] = wadeImage(row, 0);
		label.Image = image;
		label.ImageRectOffset = offset;
		label.ImageRectSize = size;
		at(label, WADE_AT, WADE_CELL);
	}
	// Sem a folha, a água da frente é uma faixa da cor do mar raso sobre os pés.
	if (!sheet) at(wadeFront, WADE_BAND_AT, WADE_BAND);

	return { card, gui, labels, hands, item, wadeBack, wadeFront, splash };
}

/** Esconde o boneco e o que só aparece em algumas poses (o objeto, a água, os braços de carregar). */
function resetShell(shell: Shell) {
	shell.gui.Enabled = false;
	shell.item.Visible = false;
	shell.wadeBack.Visible = false;
	shell.wadeFront.Visible = false;
	shell.splash.Visible = false;
	for (const label of shell.hands) label.Visible = false;
}

/**
 * Devolve o boneco ao reservatório (até `POOL_MAX`; além disso, ele é destruído). Fora da pasta `World`: o tom do
 * dia devolve a cor de base de cada imagem e a lê de novo ao voltar.
 */
export function storeShell(shell: Shell) {
	if (pool.size() >= POOL_MAX) {
		shell.card.part.Destroy();
		return;
	}
	shell.gui.Enabled = false;
	shell.card.part.Parent = undefined;
	// A luz de quem saiu não passa a quem pegar o boneco depois.
	toneShell(shell, undefined);
	pool.push(shell);
}

/** Troca as camadas do boneco pelas do visual: o corpo e a cabeça, com cada parte pintada, olhando para `facing`. */
export function dressShell(shell: Shell, look: Look, facing: Facing): Dressed {
	const layers = figureLayers(look);
	for (let index = 0; index < shell.labels.size(); index++) {
		const label = shell.labels[index];
		const layer = layers[index] as FigureLayer | undefined;
		label.Visible = layer !== undefined;
		if (layer) {
			const position = layerPosition(layer);
			label.Position = UDim2.fromScale(position.X / ACTOR_FIGURE.X, (position.Y + ACTOR_TOP) / ACTOR_FIGURE.Y);
			label.Image = layer.image;
			// A pintura do visual, com o tom do dia por cima (`tint.ts`).
			setTintBase(label, layer.color);
			label.ImageRectOffset = layerRect(layer, Anim.Idle, 0, facing, false);
		}
	}
	// Os braços de carregar repetem as camadas do corpo, que vêm primeiro.
	for (let index = 0; index < shell.hands.size(); index++) {
		const layer = layers[index] as FigureLayer | undefined;
		const label = shell.hands[index];
		if (layer && !layer.head) {
			label.Image = layer.image;
			setTintBase(label, layer.color);
		}
	}
	return { layers, height: figureHeight(look) };
}

/**
 * Põe cada camada do boneco na pose: a célula e o lugar do corpo e da cabeça, os braços por cima da
 * cabeça e o objeto carregado; nadando, afunda e mostra só os ombros do corpo.
 */
export function poseShell(shell: Shell, dressed: Dressed, pose: ShellPose, closed: boolean) {
	const { anim, frame, facing } = pose;
	const extras = poseExtras(anim, frame, facing);
	const sink = pose.swim ? SWIM_SINK : 0;
	const place = (label: ImageLabel, at: Vector2, size: Vector2) => {
		label.Position = UDim2.fromScale(at.X / ACTOR_FIGURE.X, (at.Y + ACTOR_TOP + sink) / ACTOR_FIGURE.Y);
		label.Size = UDim2.fromScale(size.X / ACTOR_FIGURE.X, size.Y / ACTOR_FIGURE.Y);
		label.ImageRectSize = size;
	};
	const shoulders = new Vector2(GRAAL_CELL.X, SWIM_SHOULDERS);

	const layers = dressed.layers;
	for (let index = 0; index < layers.size(); index++) {
		const layer = layers[index];
		const label = shell.labels[index];
		label.ImageRectOffset = layerRect(layer, anim, frame, facing, closed);
		// Andando, o corpo e a cabeça se deslocam a cada quadro (pé no chão, cabeça no ombro).
		place(label, layerPosition(layer, anim, frame, facing), pose.swim && !layer.head ? shoulders : GRAAL_CELL);
		label.Visible = layer.head || !extras.noBody;
	}
	for (let index = 0; index < shell.hands.size(); index++) {
		const layer = layers[index] as FigureLayer | undefined;
		const label = shell.hands[index];
		const shown = extras.hands && layer !== undefined && !layer.head;
		label.Visible = shown;
		if (!shown) continue;
		label.ImageRectOffset = layerCell(layer, extras.handsCell);
		place(label, extras.handsAt, GRAAL_CELL);
	}

	const item = pose.item;
	shell.item.Visible = item !== undefined && extras.item !== undefined;
	if (item && extras.item) {
		shell.item.Image = item.image;
		shell.item.ImageRectOffset = item.offset;
		// Apoiado no alto da cabeça, no x do carry.gani, subindo e descendo com ela a cada quadro do andar:
		// a base do objeto fica no pixel mais alto da cabeça (FEET.Y - HEAD_Y - height) e, recortado do
		// fundo, entra CARRY_REST pixels no cabelo; o tile opaco (sem recorte) não entra, para não cobrir a cabeça.
		const headTop = FEET.Y - HEAD_Y - dressed.height;
		const bottom = extras.handsAt.Y + headTop + (item.cutout ? CARRY_REST : 0);
		const at = new Vector2(extras.item.X + (GRAAL_CELL.X - item.size.X) / 2, bottom - item.size.Y);
		place(shell.item, at, item.size);
	}
}

/** Pinta o boneco inteiro com a luz `lit` (`DaylightController.lightAt`), ou o devolve ao tom do dia sem ela. */
export function toneShell(shell: Shell, lit: Color3 | undefined) {
	for (const label of shell.labels) setOwnTone(label, lit);
	for (const label of shell.hands) setOwnTone(label, lit);
	setOwnTone(shell.item, lit);
	setOwnTone(shell.wadeBack, lit);
	setOwnTone(shell.wadeFront, lit);
	setOwnTone(shell.splash, lit);
}
