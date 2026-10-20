// `npm run diorama:jogo -- --decorar`: do catálogo (diorama/catalogo/pecas.json e fundos.json) para
// src/shared/decorCatalog.ts, as tabelas do inventário de teste do Decorar. As listas de tiles exatos e os conjuntos
// de tipos de fundo viram tabelas (DECOR_EXACT, DECOR_TYPE_SETS) na ordem em que aparecem nas peças.
import { lerCatalogo } from "./catalogo.mjs";

const CABECALHO = `// Gerado por tools/diorama_jogo.mjs (npm run diorama:jogo -- --decorar) a partir do catálogo do Diorama
// (plugin/src/generated/catalogoAeko.ts e catalogoPecas_<n>.ts). Não editar: mudar DECOR_ITEMS no script.
// As peças do inventário de teste do Decorar, com as regras de fundo (12.14) e de encaixe (12.12) do Diorama.
/** [dx, dy, coluna, linha, camada, exige (1 + índice em DECOR_EXACT; 0 nada), tipos (1 + índice em DECOR_TYPE_SETS), ação, bloqueia]. */
export type DecorCell = readonly [
	dx: number,
	dy: number,
	column: number,
	row: number,
	layer: number,
	exact: number,
	types: number,
	action: string,
	blocks: number,
];

export type DecorSnap = readonly [kind: "quadro" | "janela", row: number, paper?: "azul" | "amarelo"];

export interface DecorVariant {
	w: number;
	h: number;
	dx: number;
	dy: number;
	types: readonly number[];
	snap?: DecorSnap;
	cells: readonly DecorCell[];
}

export interface DecorForm {
	facing?: number;
	variants: readonly DecorVariant[];
}

export interface DecorItem {
	id: string;
	sheet: string;
	/** [coluna, linha, largura, altura] na folha. */
	icon: readonly [number, number, number, number];
	forms: readonly DecorForm[];
}
`;

const lista = (numeros) => `[${numeros.join(", ")}]`;

/** O texto de src/shared/decorCatalog.ts. */
export function textoDecorCatalog(eol = "\n") {
	const fundos = lerCatalogo("fundos").fundos;
	const pecas = lerCatalogo("pecas").pecas.filter((p) => p.decorar);
	const indiceFundo = new Map(fundos.map((f, n) => [f.id, n]));
	const fundoIndice = (id) => {
		const n = indiceFundo.get(id);
		if (n === undefined) throw new Error(`tipo de fundo desconhecido no catálogo: "${id}"`);
		return n;
	};
	const exatos = [];
	const exatosIndice = new Map();
	const conjuntos = [];
	const conjuntosIndice = new Map();
	const indiceDe = (tabela, mapa, valores) => {
		const chave = JSON.stringify(valores);
		let n = mapa.get(chave);
		if (n === undefined) {
			tabela.push(valores);
			n = tabela.length;
			mapa.set(chave, n);
		}
		return n;
	};

	const linhas = [];
	for (const peca of pecas) {
		linhas.push(`\t{`, `\t\tid: ${JSON.stringify(peca.id)},`, `\t\tsheet: ${JSON.stringify(peca.folha)},`, `\t\ticon: ${lista(peca.area)},`, `\t\tforms: [`);
		for (const forma of peca.decorar.formas) {
			linhas.push(`\t\t\t{`);
			if (forma.olhando !== undefined) linhas.push(`\t\t\t\tfacing: ${forma.olhando},`);
			linhas.push(`\t\t\t\tvariants: [`);
			for (const v of forma.variantes) {
				linhas.push(`\t\t\t\t\t{`, `\t\t\t\t\t\tw: ${v.w},`, `\t\t\t\t\t\th: ${v.h},`, `\t\t\t\t\t\tdx: ${v.dx},`, `\t\t\t\t\t\tdy: ${v.dy},`);
				linhas.push(`\t\t\t\t\t\ttypes: ${lista(v.fundos.map(fundoIndice))},`);
				if (v.encaixe) {
					const partes = [JSON.stringify(v.encaixe.tipo), v.encaixe.linha];
					if (v.encaixe.papel) partes.push(JSON.stringify(v.encaixe.papel));
					linhas.push(`\t\t\t\t\t\tsnap: [${partes.join(", ")}],`);
				}
				const celulas = v.celulas.map((c) => {
					const exige = c.exatos ? indiceDe(exatos, exatosIndice, c.exatos) : 0;
					const tipos = c.fundos ? indiceDe(conjuntos, conjuntosIndice, c.fundos.map(fundoIndice)) : 0;
					return `[${c.dx}, ${c.dy}, ${c.coluna}, ${c.linha}, ${c.camada}, ${exige}, ${tipos}, ${JSON.stringify(c.acao)}, ${c.bloqueia ? 1 : 0}]`;
				});
				linhas.push(`\t\t\t\t\t\tcells: [${celulas.join(", ")}],`, `\t\t\t\t\t},`);
			}
			linhas.push(`\t\t\t\t],`, `\t\t\t},`);
		}
		linhas.push(`\t\t],`, `\t},`);
	}

	const saida = [
		...CABECALHO.split("\n"),
		`/** Os tipos de fundo das folhas: [folha, id, tiles (linha × 128 + coluna)]. */`,
		`export const DECOR_BACKGROUNDS: readonly (readonly [sheet: string, id: string, tiles: readonly number[]])[] = [`,
		...fundos.map((f) => `\t[${JSON.stringify(f.folha)}, ${JSON.stringify(f.id)}, ${lista(f.tiles)}],`),
		`];`,
		`/** Os tiles que entram embaixo de uma célula sem costura (linha × 128 + coluna, na folha da peça). */`,
		`export const DECOR_EXACT: readonly (readonly number[])[] = [${exatos.map(lista).join(", ")}];`,
		`/** Os tipos de fundo aceitos com costura (índices em DECOR_BACKGROUNDS). */`,
		`export const DECOR_TYPE_SETS: readonly (readonly number[])[] = [${conjuntos.map(lista).join(", ")}];`,
		`export const DECOR_ITEMS: readonly DecorItem[] = [`,
		...linhas,
		`];`,
		``,
	];
	return saida.join(eol);
}
