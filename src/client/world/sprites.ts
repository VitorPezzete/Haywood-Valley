export interface Sprite {
	image: string;
	size: Vector2;
	/** Ponto do recorte que fica sobre o ponto do chão do objeto. */
	anchor: Vector2;
	/** Canto de cada quadro dentro da folha. Mais de um quando o sprite balança ao vento. */
	frames: Vector2[];
}

// Folha world_atlas.png, gerada por draw_world.lua (pasta Aseprite).
// As linhas de `Sprites` são a saída desse script: colar de novo sempre que a folha mudar.
const ATLAS = "rbxassetid://77634984782890";

function sprite(w: number, h: number, ax: number, ay: number, cells: [number, number][]): Sprite {
	return {
		image: ATLAS,
		size: new Vector2(w, h),
		anchor: new Vector2(ax, ay),
		frames: cells.map(([x, y]) => new Vector2(x, y)),
	};
}

export const Sprites = {
	bush: sprite(53, 35, 26, 33, [[238, 138], [293, 138], [348, 138], [403, 138], [2, 274], [57, 274]]),
	bushShadow: sprite(42, 10, 18, 4, [[18, 337]]),
	daisy: sprite(19, 13, 10, 11, [[375, 311], [396, 311], [417, 311], [438, 311], [459, 311], [480, 311]]),
	oak: sprite(116, 134, 57, 131, [[2, 2], [120, 2], [238, 2], [356, 2], [2, 138], [120, 138]]),
	oakShadow: sprite(80, 24, 32, 11, [[2, 311]]),
	pebble: sprite(14, 10, 7, 9, [[2, 337]]),
	pebbleShadow: sprite(16, 4, 6, 2, [[88, 337]]),
	poppy: sprite(15, 13, 7, 11, [[273, 311], [290, 311], [307, 311], [324, 311], [341, 311], [358, 311]]),
	rock: sprite(22, 16, 11, 15, [[141, 311]]),
	rockShadow: sprite(24, 6, 10, 3, [[62, 337]]),
	soil: sprite(30, 16, 15, 8, [[84, 311]]),
	tuft: sprite(16, 14, 8, 12, [[165, 311], [183, 311], [201, 311], [219, 311], [237, 311], [255, 311]]),
	wheat1: sprite(23, 16, 11, 10, [[116, 311]]),
	wheat2: sprite(31, 24, 15, 18, [[298, 274], [331, 274], [364, 274], [397, 274], [430, 274], [463, 274]]),
	wheat3: sprite(29, 31, 14, 25, [[112, 274], [143, 274], [174, 274], [205, 274], [236, 274], [267, 274]]),
};

/** Linha da folha do personagem para cada direção em que ele olha. */
export const enum Facing {
	Front = 0,
	Left = 1,
	Right = 2,
	Back = 3,
}

/** Grama que se repete, desenhada já no espaço da tela (world_grass.png). */
export const GRASS_TILE = { image: "rbxassetid://107539880862143", size: new Vector2(512, 256) };
