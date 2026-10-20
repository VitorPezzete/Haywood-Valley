// Os interiores pintados no Diorama, como o jogo os recebe. Os módulos desta pasta (menos este) são
// gerados por tools/diorama_jogo.mjs (`npm run diorama:jogo <mapa>`) a partir do bloco que a ponte grava
// em diorama/mapas/<mapa>/blocos/0_0.json; não editar à mão. Formato do bloco: seção 12.3 da
// especificação do Diorama; o jogo, seção 12.9.

/**
 * Um tile de uma folha do Aeko: a folha pelo nome (`casa`, `castelo`, a chave de `INTERIOR_SHEETS`), a
 * coluna (0 a 127) e a linha (0 a 31) da folha inteira, como no bloco do Diorama.
 */
export type InteriorTile = [sheet: string, col: number, row: number];

/** Uma folha do Aeko no Roblox: as duas metades de 1024 × 512, colunas 0 a 63 e 64 a 127. */
export type InteriorSheet = [left: string, right: string];

/** As camadas, de baixo para cima, como no Graal. A frente é desenhada por cima do boneco que passa atrás. */
export type InteriorLayers = [floor: string[], object: string[], front: string[]];

/**
 * Uma imagem do exterior, já juntada pelo gerador: a imagem (índice de `EXTERIOR_SHEETS`), o canto e o tamanho
 * em células do retângulo do mapa, o recorte (canto e tamanho, em pixels da imagem: do tamanho do retângulo, ou
 * menor quando é de uma cor só, e então esticado nele), a camada (0 a base, por cima os encontros e o decalque), os quadros e quanto
 * o recorte anda a cada quadro (o mar e os decalques animados).
 */
export type ExteriorRun = [
	image: number,
	i: number,
	j: number,
	w: number,
	h: number,
	sx: number,
	sy: number,
	sw: number,
	sh: number,
	z: number,
	frames: number,
	dx: number,
	dy: number,
];

/** Um ponto de chegada: o nome (letras minúsculas, números, - e _) e a célula do bloco. */
export interface InteriorEntry {
	name: string;
	x: number;
	y: number;
}

/**
 * Uma saída, como o `LINK` do Graal: o retângulo (células do bloco), o mapa de destino (o id do Diorama) e a
 * chegada: o nome de uma entrada de lá, uma célula [x, y] dele, ou nada (a entrada "entrada", ou o começo).
 */
export interface InteriorExit {
	x: number;
	y: number;
	width: number;
	height: number;
	map: string;
	arrival?: string | [x: number, y: number];
}

/**
 * Uma zona com nome: os retângulos [x0, y0, x1, y1] (células do bloco, inclusivos) e as propriedades livres do
 * Diorama (`musica`, `ambiente`…), que o som vai usar. O nome é uma chave de texto do jogo (`zone.…`, traduzida)
 * ou o nome como o autor escreveu.
 */
export interface InteriorZone {
	name: string;
	areas: [x0: number, y0: number, x1: number, y1: number][];
	props: Record<string, string>;
}

/** A pose de um morador: parado (de pé), sentado num assento ou deitado numa cama. */
export type ResidentPose = "idle" | "sit" | "lie";

/**
 * Um morador (o objeto `morador` do Diorama): o nome (nome próprio, não se traduz), a célula do pé (do bloco),
 * para onde olha (o `Facing` do boneco: 0 cima, 1 esquerda, 2 baixo, 3 direita), o visual no texto do visual salvo
 * (`encodeSavedLook`: gênero|cabeça|corpo|cores|estilos) e a pose. Sentado, olha para onde o Diorama guardou (o
 * lado do assento, ou o que o autor girou); deitado, fica de frente, com a cabeça no travesseiro da cama.
 */
export interface InteriorResident {
	name: string;
	x: number;
	y: number;
	facing: number;
	look: string;
	pose: ResidentPose;
}

export interface InteriorData {
	id: string;
	stamp: string;
	x: number;
	y: number;
	width: number;
	height: number;
	tiles: InteriorTile[];
	flat?: [tile: number, color: number][];
	layers: InteriorLayers;
	blocks: string[];
	actions: string[];
	backdrop: InteriorTile;
	spawn: [x: number, y: number];
	terrain?: {
		tiles: number;
		layers: number;
		runs: ExteriorRun[];
	};
	entries?: InteriorEntry[];
	exits?: InteriorExit[];
	zones?: InteriorZone[];
	residents?: InteriorResident[];
}

/** Atributo do Workspace que liga o teste de interior: o id de um mapa gerado (`InteriorTeste = "exemplo_comodo"`). */
export const INTERIOR_TEST_ATTRIBUTE = "InteriorTeste";
/** Atributo do Workspace, opcional, com a célula do bloco onde o personagem começa no teste: "x,y". */
export const INTERIOR_TEST_CELL_ATTRIBUTE = "InteriorTesteCelula";
