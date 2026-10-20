// As imagens das folhas do Aeko no Roblox: duas metades de 1024×512 por folha, chaves `aeko.<folha>.0` e `.1`
// no registro de assets. A carga é compartilhada com o editor de Mapas (`estado.ts`: `imagensFolhas`,
// `carregarImagensFolhas`); aqui ficam só o tipo e a conta de qual metade uma coluna cai.
import { avisoImagens, carregarImagensFolhas, imagensFolhas } from "../estado";
import { COLUNAS_METADE, TILE } from "./formato";

export type Metades = [string, string];

/**
 * Relê o registro pela ponte e devolve as metades de cada folha; a que faltar no registro fica com a reserva.
 * Yielda: chamar de um task.spawn. Nunca falha: sem ponte, devolve só as reservas e o erro.
 */
export function carregarMetades(): { metades: Record<string, Metades>; erro?: string } {
	carregarImagensFolhas();
	const metades: Record<string, Metades> = {};
	for (const [folha, par] of pairs(imagensFolhas())) if (par) metades[folha] = par;
	const aviso = avisoImagens();
	return { metades, erro: aviso !== "" ? aviso : undefined };
}

/** Em que metade e em que x (em pixels da metade) fica a coluna. */
export function metadeDaColuna(c: number): { metade: 0 | 1; x: number } {
	const metade = c >= COLUNAS_METADE ? 1 : 0;
	return { metade, x: (c - metade * COLUNAS_METADE) * TILE };
}
