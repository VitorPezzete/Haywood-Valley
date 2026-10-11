// Gerado por tools/cozy_faces.py (pasta Aseprite) a partir de tools/faces_spec.py.
// Não editar à mão: mudar a especificação e rodar o script de novo.

/** Uma peça de rosto. Cada camada que ela usa é o número de uma tira da folha de rostos. */
export interface FacePart {
	id: string;
	name: string;
	/** Cinza multiplicado pela cor da pele. */
	skin?: number;
	/** Cinza multiplicado pela cor dos olhos. */
	iris?: number;
	/** Cores fixas. */
	ink?: number;
	/** Cores fixas, por cima do cabelo e do chapéu. */
	fx?: number;
}

/** Um instante de uma reação: índices em `poseEyes`, `poseMouths` e `fx`. O que falta fica como o jogador escolheu. */
export interface FacePose {
	eyes?: number;
	mouth?: number;
	fx?: number;
}

export interface Reaction {
	id: string;
	name: string;
	/** Número do balão na folha. */
	bubble: number;
	poses: FacePose[];
	/** Poses por segundo; 0 quando a reação tem uma pose só. */
	rate: number;
	/** Quanto tempo a reação fica no rosto. */
	seconds: number;
}

/** Lado da célula de rosto, em pixels de arte: ela cobre a cabeça. */
export const FACE_CELL = 16;
/** Canto da célula dentro do quadro do personagem, no quadro parado. */
export const FACE_ORIGIN = new Vector2(8, 8);
/** Quanto a cabeça sobe (negativo) em cada quadro do andar. */
export const HEAD_BOB = [0, -1, -2, 0, 0, -1, -2, 0];
/** Uma tira tem a peça de frente, virada para a direita e virada para a esquerda. */
export const STRIP_SIZE = new Vector2(48, 16);
export const STRIP_COLUMNS = 5;
/** Balões de reação: lado, quantos por linha e onde começam na folha. */
export const BUBBLE_SIZE = 16;
export const BUBBLE_COLUMNS = 16;
export const BUBBLE_ORIGIN = new Vector2(0, 48);
export const BUBBLE_COUNT = 3;

export const Faces = {
	eyes: [
		{ id: "classic", name: "Clássico", iris: 0 },
		{ id: "round", name: "Redondo", iris: 1, ink: 2 },
		{ id: "white", name: "Com branco", iris: 3, ink: 4 },
	] as FacePart[],
	mouths: [
		{ id: "none", name: "Sem boca" },
		{ id: "line", name: "Risco", skin: 5 },
	] as FacePart[],
	poseEyes: [
		{ id: "closed", name: "Fechados", skin: 6 },
		{ id: "happy", name: "Felizes", skin: 7 },
	] as FacePart[],
	poseMouths: [
		{ id: "smile", name: "Sorriso", skin: 8 },
		{ id: "open", name: "Aberta", ink: 9 },
	] as FacePart[],
	fx: [
		{ id: "sweat", name: "Gota", fx: 10 },
	] as FacePart[],
	/** Os olhos fechados de piscar, em `poseEyes`. */
	blink: 0,
	defaultEyes: 0,
	defaultMouth: 0,
	reactions: [
		{ id: "smile", name: "Sorriso", bubble: 0, poses: [{ mouth: 0 }], rate: 0, seconds: 3 },
		{ id: "laugh", name: "Risada", bubble: 1, poses: [{ eyes: 1, mouth: 1 }, { eyes: 1, mouth: 0 }], rate: 4, seconds: 3 },
		{ id: "exclaim", name: "Susto", bubble: 2, poses: [{ mouth: 1, fx: 0 }], rate: 0, seconds: 2.5 },
	] as Reaction[],
};
