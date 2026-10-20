// Do bloco JSON (formato 1, docs/diorama/GERADOR.md) para o `InteriorData` que o jogo recebe e para o texto do
// módulo src/shared/interiors/<mapa>.ts. As derivações (paleta, caixa, bloqueios, ações, tiles de uma cor só,
// exterior) estão descritas em GERADOR.md; cada uma foi conferida contra os 14 módulos que sobreviveram.
import { acaoDoTile, tileBloqueia } from "./catalogo.mjs";
import { carimboDoBloco } from "./carimbo.mjs";
import {
	acaoDoTerreno,
	caixaDasCelulas,
	celulasDeRunsImportados,
	comporExterior,
	runsDoExterior,
} from "./exterior.mjs";
import { corChapada } from "./folhas.mjs";

export const CAMADAS = ["chao", "objeto", "frente"];

/** As camadas do bloco como mapas "x,y" → [folha, coluna, linha], e a caixa que as três cobrem. */
function lerCamadas(bloco) {
	const camadas = CAMADAS.map(() => new Map());
	let caixa;
	CAMADAS.forEach((nome, n) => {
		for (const [x, y, folha, col, row] of bloco.camadas?.[nome] ?? []) {
			camadas[n].set(`${x},${y}`, [folha, col, row]);
			caixa = caixa
				? { x0: Math.min(caixa.x0, x), y0: Math.min(caixa.y0, y), x1: Math.max(caixa.x1, x), y1: Math.max(caixa.y1, y) }
				: { x0: x, y0: y, x1: x, y1: y };
		}
	});
	return { camadas, caixa };
}

function mesmoTile(a, b) {
	return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

/**
 * Gera o `InteriorData` de um bloco. Devolve { data, avisos }. `carimbo` é o texto de 12 hex que vai em `stamp`
 * (ver carimbo.mjs: o do bloco, se o conteúdo não mudou desde que ele foi gravado; senão um novo).
 */
export function gerarInterior(bloco) {
	const avisos = [];
	const { camadas, caixa: caixaCamadas } = lerCamadas(bloco);

	// O exterior: as células com terreno, o que cada uma mostra e os recortes já juntados.
	let exterior;
	if (bloco.exterior) {
		if (bloco.exterior.runs_importados) {
			// Recortes crus guardados pelo importador (a grade dupla não explicou o mapa): o gerador só os copia.
			const caixa = bloco.exterior.caixa_importada;
			const { celulas, quadrantesDe } = celulasDeRunsImportados(bloco.exterior.runs_importados, caixa);
			exterior = { celulas, quadrantesDe, caixa, runs: bloco.exterior.runs_importados, crus: true };
		} else {
			const { celulas, quadrantesDe, avisos: mais } = comporExterior(bloco.exterior);
			avisos.push(...mais);
			exterior = { celulas, quadrantesDe, caixa: caixaDasCelulas(celulas) };
		}
	}

	// A caixa do mapa: as três camadas e as células com terreno.
	let caixa = caixaCamadas;
	if (exterior?.caixa) {
		const e = exterior.caixa;
		const ec = { x0: e.x, y0: e.y, x1: e.x + e.width - 1, y1: e.y + e.height - 1 };
		caixa = caixa
			? { x0: Math.min(caixa.x0, ec.x0), y0: Math.min(caixa.y0, ec.y0), x1: Math.max(caixa.x1, ec.x1), y1: Math.max(caixa.y1, ec.y1) }
			: ec;
	}
	if (!caixa) throw new Error(`o bloco de ${bloco.mapa} não tem nada pintado`);
	const x = caixa.x0;
	const y = caixa.y0;
	const width = caixa.x1 - caixa.x0 + 1;
	const height = caixa.y1 - caixa.y0 + 1;

	// A paleta: os tiles na ordem de primeira aparição, camada por camada (chão, objeto, frente), em ordem de leitura.
	const tiles = [];
	const numeroDe = new Map();
	const numero = (tile) => {
		const chave = tile.join(",");
		let n = numeroDe.get(chave);
		if (n === undefined) {
			tiles.push(tile);
			n = tiles.length;
			numeroDe.set(chave, n);
		}
		return n;
	};
	const layers = camadas.map((camada) => {
		const linhas = [];
		for (let j = 0; j < height; j++) {
			const linha = [];
			for (let i = 0; i < width; i++) {
				const tile = camada.get(`${x + i},${y + j}`);
				linha.push(tile ? numero(tile) : 0);
			}
			linhas.push(linha.join(" "));
		}
		return linhas;
	});

	// Os tiles de uma cor só, lidos da folha.
	const flat = [];
	tiles.forEach((tile, n) => {
		const cor = corChapada(tile[0], tile[1], tile[2]);
		if (cor !== undefined) flat.push([n + 1, cor]);
	});

	// Bloqueios e ações, célula a célula.
	const mais = new Set((bloco.bloqueios?.mais ?? []).map(([a, b]) => `${a},${b}`));
	const menos = new Set((bloco.bloqueios?.menos ?? []).map(([a, b]) => `${a},${b}`));
	const acoesExtra = new Map((bloco.acoes ?? []).map(([a, b, codigo]) => [`${a},${b}`, codigo]));
	const blocks = [];
	const actions = [];
	for (let j = 0; j < height; j++) {
		let linhaBloqueio = "";
		let linhaAcao = "";
		for (let i = 0; i < width; i++) {
			const chave = `${x + i},${y + j}`;
			const pintados = camadas.map((camada) => camada.get(chave)).filter((t) => t !== undefined);
			const terreno = exterior?.celulas.get(chave);
			let bloqueia;
			if (pintados.length > 0) bloqueia = pintados.some((t) => tileBloqueia(t[0], t[1], t[2]));
			else bloqueia = terreno === undefined;
			if (mais.has(chave)) bloqueia = true;
			if (menos.has(chave)) bloqueia = false;
			linhaBloqueio += bloqueia ? "#" : ".";

			let acao = ".";
			if (pintados.length > 0) {
				const topo = pintados[pintados.length - 1];
				acao = acaoDoTile(topo[0], topo[1], topo[2]);
			} else if (terreno) {
				acao = acaoDoTerreno(exterior.quadrantesDe.get(chave) ?? []);
			}
			if (acoesExtra.has(chave)) acao = acoesExtra.get(chave);
			linhaAcao += acao;
		}
		blocks.push(linhaBloqueio);
		actions.push(linhaAcao);
	}

	const data = {
		id: bloco.mapa,
		stamp: carimboDoBloco(bloco).carimbo,
		x,
		y,
		width,
		height,
		tiles,
		flat: flat.length > 0 ? flat : undefined,
		layers,
		blocks,
		actions,
		backdrop: [bloco.vazio[0], bloco.vazio[1], bloco.vazio[2]],
		spawn: [bloco.nascimento[0], bloco.nascimento[1]],
	};
	if (exterior) {
		const caixaMapa = { x, y, width, height };
		if (exterior.crus) {
			let tilesTerreno = 0;
			let layersTerreno = 0;
			for (const pilha of exterior.celulas.values()) {
				tilesTerreno++;
				layersTerreno += pilha.filter((t) => t !== undefined).length;
			}
			// Os recortes crus têm i e j relativos à caixa importada; a caixa de hoje pode ser outra.
			const dx = exterior.caixa.x - x;
			const dy = exterior.caixa.y - y;
			data.terrain = {
				tiles: tilesTerreno,
				layers: layersTerreno,
				runs: exterior.runs.map((r) => [r[0], r[1] + dx, r[2] + dy, ...r.slice(3)]),
			};
		} else {
			data.terrain = runsDoExterior(exterior.celulas, caixaMapa);
		}
	}
	if (bloco.entradas?.length) data.entries = bloco.entradas.map((e) => ({ name: e.nome, x: e.x, y: e.y }));
	if (bloco.saidas?.length) {
		data.exits = bloco.saidas.map((s) => {
			const exit = { x: s.x, y: s.y, width: s.largura, height: s.altura, map: s.mapa };
			if (s.chegada !== undefined) exit.arrival = s.chegada;
			return exit;
		});
	}
	if (bloco.zonas?.length) {
		data.zones = bloco.zonas.map((z) => ({ name: z.nome, areas: z.areas.map((a) => [...a]), props: { ...(z.props ?? {}) } }));
	}
	if (bloco.moradores?.length) {
		data.residents = bloco.moradores.map((m) => ({
			name: m.nome,
			x: m.x,
			y: m.y,
			facing: m.olhando,
			look: m.visual,
			pose: m.pose,
		}));
	}
	if (mesmoTile(data.backdrop, data.backdrop) && !bloco.folhas.includes(data.backdrop[0])) {
		avisos.push(`a folha do vazio (${data.backdrop[0]}) não está em folhas`);
	}
	return { data, avisos };
}

// ---------------------------------------------------------------------------------------------------------------
// O texto do módulo

/** Largura da linha e do tab, como o .prettierrc do jogo: as listas longas são preenchidas até 120 colunas. */
const LARGURA = 120;
const TAB = 4;

function aspas(texto) {
	return JSON.stringify(texto);
}

function tileTs([folha, col, row]) {
	return `[${aspas(folha)}, ${col}, ${row}]`;
}

function hex(cor) {
	return "0x" + cor.toString(16).padStart(6, "0");
}

/** Preenche linhas com `itens` separados por ", " até a largura, com `tabs` de recuo; cada linha termina em vírgula. */
function preencher(itens, tabs) {
	const linhas = [];
	let atual = [];
	let soma = 0;
	for (const item of itens) {
		// A largura da linha com o item: o recuo, os itens, ", " entre eles e a vírgula do fim.
		const largura = tabs * TAB + soma + item.length + 2 * atual.length + 1;
		if (atual.length > 0 && largura > LARGURA) {
			linhas.push("\t".repeat(tabs) + atual.join(", ") + ",");
			atual = [];
			soma = 0;
		}
		soma += item.length;
		atual.push(item);
	}
	if (atual.length > 0) linhas.push("\t".repeat(tabs) + atual.join(", ") + ",");
	return linhas;
}

/** Uma lista numa linha só quando cabe na largura (como o prettier); senão aberta e preenchida. */
function listaPreenchida(nome, itens, tabs) {
	const t = "\t".repeat(tabs);
	const umaLinha = `${t}${nome}: [${itens.join(", ")}],`;
	if (tabs * TAB + umaLinha.length - tabs <= LARGURA) return [umaLinha];
	return [`${t}${nome}: [`, ...preencher(itens, tabs + 1), `${t}],`];
}

function listaDeTextos(nome, textos, tabs) {
	const t = "\t".repeat(tabs);
	return [`${t}${nome}: [`, ...textos.map((s) => `${t}\t${aspas(s)},`), `${t}],`];
}

function objeto(campos, tabs) {
	const t = "\t".repeat(tabs);
	return [`${t}{`, ...campos.map(([nome, valor]) => `${t}\t${nome}: ${valor},`), `${t}},`];
}

function valorChegada(arrival) {
	return typeof arrival === "string" ? aspas(arrival) : `[${arrival[0]}, ${arrival[1]}]`;
}

/** O texto de src/shared/interiors/<mapa>.ts, com o fim de linha pedido. */
export function textoModulo(data, eol = "\r\n") {
	const linhas = [
		`import type { InteriorData } from "./types";`,
		`// Gerado por tools/diorama_jogo.mjs (npm run diorama:jogo -- ${data.id}) a partir de`,
		`// diorama/mapas/${data.id}/blocos/0_0.json. Não editar: pintar no Diorama e gerar de novo.`,
		``,
		`export const interior: InteriorData = {`,
		`\tid: ${aspas(data.id)},`,
		`\tstamp: ${aspas(data.stamp)},`,
		`\tx: ${data.x},`,
		`\ty: ${data.y},`,
		`\twidth: ${data.width},`,
		`\theight: ${data.height},`,
		...listaPreenchida("tiles", data.tiles.map(tileTs), 1),
	];
	if (data.flat) linhas.push(...listaPreenchida("flat", data.flat.map(([n, cor]) => `[${n}, ${hex(cor)}]`), 1));
	linhas.push(`\tlayers: [`);
	for (const camada of data.layers) {
		linhas.push(`\t\t[`, ...camada.map((s) => `\t\t\t${aspas(s)},`), `\t\t],`);
	}
	linhas.push(`\t],`);
	linhas.push(...listaDeTextos("blocks", data.blocks, 1));
	linhas.push(...listaDeTextos("actions", data.actions, 1));
	linhas.push(`\tbackdrop: ${tileTs(data.backdrop)},`);
	linhas.push(`\tspawn: [${data.spawn[0]}, ${data.spawn[1]}],`);
	if (data.terrain) {
		linhas.push(`\tterrain: {`, `\t\ttiles: ${data.terrain.tiles},`, `\t\tlayers: ${data.terrain.layers},`);
		linhas.push(...listaPreenchida("runs", data.terrain.runs.map((r) => `[${r.join(", ")}]`), 2));
		linhas.push(`\t},`);
	}
	if (data.entries) {
		linhas.push(`\tentries: [`);
		for (const e of data.entries) linhas.push(...objeto([["name", aspas(e.name)], ["x", e.x], ["y", e.y]], 2));
		linhas.push(`\t],`);
	}
	if (data.exits) {
		linhas.push(`\texits: [`);
		for (const e of data.exits) {
			const campos = [
				["x", e.x],
				["y", e.y],
				["width", e.width],
				["height", e.height],
				["map", aspas(e.map)],
			];
			if (e.arrival !== undefined) campos.push(["arrival", valorChegada(e.arrival)]);
			linhas.push(...objeto(campos, 2));
		}
		linhas.push(`\t],`);
	}
	if (data.zones) {
		linhas.push(`\tzones: [`);
		for (const z of data.zones) {
			const areas = `[${z.areas.map((a) => `[${a.join(", ")}]`).join(", ")}]`;
			const props = Object.entries(z.props);
			linhas.push(`\t\t{`, `\t\t\tname: ${aspas(z.name)},`, `\t\t\tareas: ${areas},`);
			if (props.length === 0) linhas.push(`\t\t\tprops: {},`);
			else linhas.push(`\t\t\tprops: {`, ...props.map(([k, v]) => `\t\t\t\t${k}: ${aspas(v)},`), `\t\t\t},`);
			linhas.push(`\t\t},`);
		}
		linhas.push(`\t],`);
	}
	if (data.residents) {
		linhas.push(`\tresidents: [`);
		for (const r of data.residents) {
			linhas.push(
				...objeto(
					[
						["name", aspas(r.name)],
						["x", r.x],
						["y", r.y],
						["facing", r.facing],
						["look", aspas(r.look)],
						["pose", aspas(r.pose)],
					],
					2,
				),
			);
		}
		linhas.push(`\t],`);
	}
	linhas.push(`};`, ``);
	return linhas.join(eol);
}

/** O texto de src/shared/interiors/index.ts: os mapas (ids em ordem alfabética) e as folhas. */
export function textoIndex(ids, folhas, eol = "\r\n") {
	const ordenados = [...ids].sort();
	const linhas = [
		`import type { InteriorData, InteriorSheet } from "./types";`,
		`// Gerado por tools/diorama_jogo.mjs: os interiores que o jogo conhece e as folhas do Aeko no Roblox.`,
		`// Não editar: cada \`npm run diorama:jogo\` refaz esta lista com os módulos da pasta.`,
		``,
		`import { ASSETS } from "../assets";`,
		...ordenados.map((id, n) => `import { interior as map${n} } from "./${id}";`),
		``,
		`/** As metades de cada folha (ids no registro de assets, aeko.<folha>.<metade>). */`,
		`export const INTERIOR_SHEETS: Record<string, InteriorSheet> = {`,
		...[...folhas].sort().map((f) => `\t${f}: [ASSETS[${aspas(`aeko.${f}.0`)}], ASSETS[${aspas(`aeko.${f}.1`)}]],`),
		`};`,
		``,
		`/**`,
		` * As imagens do exterior (a junção: a folha de 16 px da grade dupla e as formas de 32 px da equipe), na ordem`,
		` * do número \`imagem\` de \`terrain.runs\` (ids no registro de assets, exterior.<arquivo>).`,
		` */`,
		`export const EXTERIOR_SHEETS = [ASSETS["exterior.folha_juncao"], ASSETS["exterior.forma_equipe_32"]];`,
		``,
		`export const INTERIORS: Record<string, InteriorData> = {`,
		...ordenados.map((id, n) => `\t${id}: map${n},`),
		`};`,
		``,
	];
	return linhas.join(eol);
}
