// Gerado por tools/mundo_mapa.py (`npm run mundo:jogo`) a partir do plano do mundo; não editar à mão.
// Fontes: diorama/catalogo/exterior.json (a folha_juncao) e diorama/catalogo/mundo.json.

/** Um terreno do chão: código, nome, nível (quem fica por cima na junção), linha da base na folha_juncao, ação,
 * o recorte liso [x, y, lado] (só a cor que mais aparece na base), a cor e a chave da textura grande no registro. */
export interface WorldTerrain {
	code: string;
	name: string;
	level: number;
	base: number;
	action: string;
	flat: [x: number, y: number, size: number];
	color: string;
	texture: string;
}

export const WORLD_TERRAINS: WorldTerrain[] = [
	{ code: "m", name: "mar fundo", level: 0, base: 36, action: "~", flat: [4, 580, 8], color: "#3d4f7f", texture: "" },
	{ code: "r", name: "mar raso", level: 1, base: 37, action: "6", flat: [4, 596, 8], color: "#5f74a9", texture: "" },
	{ code: "a", name: "areia", level: 2, base: 38, action: ".", flat: [4, 612, 8], color: "#b1925e", texture: "" },
	{ code: "c", name: "caminho", level: 3, base: 39, action: ".", flat: [4, 628, 8], color: "#aa5b36", texture: "" },
	{ code: "t", name: "terra", level: 4, base: 40, action: ".", flat: [0, 640, 4], color: "#8c5b4a", texture: "mundo.base.terra" },
	{ code: "g", name: "grama", level: 5, base: 41, action: ".", flat: [0, 656, 4], color: "#4b7e52", texture: "mundo.base.grama" },
];

/** As junções da folha_juncao: [de cima, de baixo, primeira linha, quadros, quanto o recorte desce por quadro]. */
export const WORLD_JUNCTIONS: [over: string, under: string, row: number, frames: number, dy: number][] = [
	["g", "a", 0, 1, 0],
	["g", "t", 4, 1, 0],
	["a", "r", 8, 4, 64],
	["r", "m", 24, 1, 0],
	["c", "a", 28, 1, 0],
	["t", "a", 32, 1, 0],
];

/** Os decalques espalhados por semente: grupo → [id, x, y, largura, altura (células), quantos por mil células]. */
export const WORLD_DECALS: Record<string, [id: string, sx: number, sy: number, w: number, h: number, perMille: number][]> = {
	grama: [
		["flor_1", 128, 736, 2, 2, 1.2],
		["flor_2", 160, 736, 2, 2, 1.2],
		["pedras_pequenas", 32, 704, 2, 2, 0.6],
	],
	capim: [
		["flor_1", 128, 736, 2, 2, 6],
		["flor_2", 160, 736, 2, 2, 6],
	],
};

/** A chave no registro da folha dos conjuntos da equipe (1024 × 1024, desenho wang16_4x6). */
export const WORLD_SETS_SHEET = "mundo.conjuntos";
/** Os conjuntos da equipe (Wang de 16 em 4 × 6 tiles): [id, terreno A, terreno B, canto x, canto y na folha]. */
export const WORLD_SETS: [id: string, a: string, b: string, x: number, y: number][] = [
	["grama_terra", "t", "g", 0, 0],
	["agua_grama", "r", "g", 64, 0],
	["grama_calcada", "g", "a", 128, 0],
	["mata_copa", "k", "g", 192, 0],
];

/** O grupo do registro com os 4 quadros da água do rio (1024 × 1024). */
export const WORLD_RIVER_FRAMES = "mundo.agua_rio";
