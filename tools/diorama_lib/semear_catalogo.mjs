// Semeia diorama/catalogo/{zonas,pecas,fundos}.json com o que o jogo já lista (src/shared/decorCatalog.ts,
// pieceDefs.ts, fixtures.ts, client/world/lightTiles.ts, interiorMap.ts). Rodou uma vez em 2026-10-20; fica aqui como
// registro de onde cada campo veio. `node tools/diorama_lib/semear_catalogo.mjs` regrava os três arquivos.
import fs from "node:fs";
import path from "node:path";
import { PASTA_CATALOGO } from "./catalogo.mjs";
import { RAIZ } from "./folhas.mjs";

function literal(arquivo, nome) {
	const texto = fs.readFileSync(path.join(RAIZ, "src", arquivo), "utf8");
	const inicio = texto.indexOf(nome);
	if (inicio < 0) throw new Error(`${nome} não está em ${arquivo}`);
	const abre = texto.indexOf("[", texto.indexOf("=", inicio));
	let nivel = 0;
	for (let i = abre; i < texto.length; i++) {
		if (texto[i] === "[") nivel++;
		else if (texto[i] === "]") {
			nivel--;
			if (nivel === 0) return new Function(`return (${texto.slice(abre, i + 1)});`)();
		}
	}
	throw new Error(`${nome}: literal sem fim`);
}

const backgrounds = literal("shared/decorCatalog.ts", "export const DECOR_BACKGROUNDS");
const exact = literal("shared/decorCatalog.ts", "export const DECOR_EXACT");
const typeSets = literal("shared/decorCatalog.ts", "export const DECOR_TYPE_SETS");
const items = literal("shared/decorCatalog.ts", "export const DECOR_ITEMS");
const pieceDefs = literal("shared/pieceDefs.ts", "export const PIECE_DEFS");
const chests = literal("shared/fixtures.ts", "const CHESTS");
const lights = literal("client/world/lightTiles.ts", "export const LIGHT_TILES");
const windows = literal("client/world/lightTiles.ts", "const WINDOWS");

const NOMES_ITENS = {
	chair: "cadeira",
	table: "mesa",
	pot: "pote",
	rug: "tapete",
	picture: "quadro",
	window: "janela",
	shelf: "estante",
	bed: "cama",
	torch: "tocha",
	lamp: "abajur",
};
const TIPOS_ITENS = {
	chair: "movel",
	table: "movel",
	pot: "movel",
	rug: "tapete",
	picture: "quadro",
	window: "janela",
	shelf: "movel",
	bed: "cama",
	torch: "parede",
	lamp: "parede",
};

const pecas = [];

// As peças do inventário do Decorar (DECOR_ITEMS), com as regras de fundo e de encaixe por célula. A ordem desta
// lista é a ordem do inventário (DECOR_ORDER).
for (const item of items) {
	pecas.push({
		id: item.id,
		nome: NOMES_ITENS[item.id] ?? item.id,
		folha: item.sheet,
		area: [item.icon[0], item.icon[1], item.icon[2], item.icon[3]],
		tipo: TIPOS_ITENS[item.id] ?? "movel",
		camada: item.forms[0].variants[0].cells[0][4],
		decorar: {
			formas: item.forms.map((form) => ({
				...(form.facing !== undefined ? { olhando: form.facing } : {}),
				variantes: form.variants.map((v) => ({
					w: v.w,
					h: v.h,
					dx: v.dx,
					dy: v.dy,
					fundos: v.types.map((t) => backgrounds[t][1]),
					...(v.snap
						? { encaixe: { tipo: v.snap[0], linha: v.snap[1], ...(v.snap[2] ? { papel: v.snap[2] } : {}) } }
						: {}),
					celulas: v.cells.map(([dx, dy, col, row, layer, ex, types, action, blocks]) => ({
						dx,
						dy,
						coluna: col,
						linha: row,
						camada: layer,
						...(ex > 0 ? { exatos: exact[ex - 1] } : {}),
						...(types > 0 ? { fundos: typeSets[types - 1].map((t) => backgrounds[t][1]) } : {}),
						acao: action,
						bloqueia: blocks === 1,
					})),
				})),
			})),
		},
	});
}

// As camas pintadas no mapa (a zona `deita` só cobre as duas linhas de cima): a parte de baixo é o tipo 5 do Graal.
// (palpite: no catálogo original eram regiões com ação por célula, como as células do Decorar.)
pecas.push(
	{
		id: "casa@0,24",
		nome: "cama verde",
		folha: "casa",
		area: [0, 24, 4, 6],
		tipo: "cama",
		camada: 0,
		acoes: ["4444", "4444", "5555", "5555", "5555", "5555"],
		bloqueia: false,
	},
	{
		id: "casa@4,24",
		nome: "cama roxa",
		folha: "casa",
		area: [4, 24, 4, 6],
		tipo: "cama",
		camada: 0,
		acoes: ["4444", "4444", "5555", "5555", "5555", "5555"],
		bloqueia: false,
	},
);

// As peças móveis (PIECE_DEFS): o id é o do catálogo original.
const NOMES_MOVEIS = { chair: "cadeira", pot: "pote", crate: "caixote", chest: "baú", barrel: "barril" };
for (const def of pieceDefs) {
	pecas.push({
		id: def.id,
		nome: NOMES_MOVEIS[def.kind] ?? def.kind,
		folha: def.sheet,
		area: [def.col, def.row, def.w, def.h],
		tipo: "movel",
		camada: 1,
		bloqueia: def.blocks,
		movel: {
			tipo: def.kind,
			levanta: def.lift,
			quebra: def.breaks,
			peso: def.weight,
			...(def.family ? { familia: def.family, variante: def.variant } : {}),
		},
	});
}

// Os baús que abrem no lugar (fixtures.ts CHESTS) e o fogão.
chests.forEach((chest, n) => {
	pecas.push({
		id: `${chest.sheet}@${chest.closed[0][0]},${chest.closed[0][1]}`,
		nome: `baú ${n + 1} (fechado)`,
		folha: chest.sheet,
		area: [chest.closed[0][0], chest.closed[0][1], 2, 2],
		tipo: "bau",
		camada: 1,
		bloqueia: true,
		fixo: { tipo: "bau", aberto: chest.open },
	});
});
pecas.push({
	id: "casa79",
	nome: "fogão",
	folha: "casa",
	area: [61, 27, 3, 5],
	tipo: "fogao",
	camada: 1,
	bloqueia: true,
	fixo: { tipo: "fogao", coluna_apagada: 63, coluna_acesa: 64, linhas: [27, 28, 29, 30] },
});

// As luzes (LIGHT_TILES) e as janelas com versão de noite (WINDOWS).
for (const light of lights) {
	const [c0, l0, c1, l1] = light.area;
	pecas.push({
		id: `${light.sheet}@${c0},${l0}`,
		nome: `luz ${light.kind}`,
		folha: light.sheet,
		area: [c0, l0, c1 - c0 + 1, l1 - l0 + 1],
		tipo: "luz",
		camada: 1,
		luz: {
			tipo: light.kind,
			centro: light.center,
			...(light.col !== undefined ? { coluna: light.col } : {}),
			...(light.floor ? { chao: true } : {}),
			...(light.nightOnly ? { so_noite: true } : {}),
			...(light.hangs ? { pendurada: true } : {}),
		},
	});
}
windows.forEach((w, n) => {
	pecas.push({
		id: `casa@${w.day[0]},${w.day[1]}`,
		nome: `janela ${n + 1}`,
		folha: "casa",
		area: [w.day[0], w.day[1], w.size[0], w.size[1]],
		tipo: "janela",
		camada: 1,
		bloqueia: true,
		noite: { coluna: w.night[0], linha: w.night[1] },
	});
});

const fundos = {
	versao: 1,
	nota: "Os tipos de fundo das folhas (DECOR_BACKGROUNDS de src/shared/decorCatalog.ts): folha, id e os tiles (linha × 128 + coluna). A ordem é a dos índices que o Decorar usa.",
	fundos: backgrounds.map(([folha, id, tiles]) => ({ folha, id, tiles })),
};

const zonas = {
	versao: 1,
	nota: 'As zonas das folhas do Aeko, [c0, l0, c1, l1, zona]; vale a primeira (ZONES de src/shared/interiorMap.ts). `excecoes` vêm antes: a linha 0 das colunas 32 a 63 é chão no castelo, e as peças sob o rótulo "non-blocking" da folha do castelo não bloqueiam (palpite: o gabarito só usa as colunas 59 e 60). `bloqueiam` são as zonas que viram # em blocks (sem_pecas é palpite). `acoes` são os códigos do Graal por zona.',
	vazio: [0, 2],
	zonas: [
		[0, 0, 15, 3, "animado"],
		[0, 4, 15, 9, "agua"],
		[0, 10, 15, 11, "agua_rasa"],
		[0, 12, 15, 17, "lava"],
		[0, 18, 15, 19, "fere"],
		[0, 20, 15, 23, "senta"],
		[0, 24, 15, 25, "deita"],
		[0, 26, 15, 31, "normal"],
		[16, 0, 31, 31, "sem_pecas"],
		[32, 0, 63, 0, "frente"],
		[32, 1, 63, 19, "chao"],
		[32, 20, 63, 31, "bloqueia"],
		[64, 16, 127, 31, "bloqueia"],
		[64, 0, 127, 15, "sem_pecas"],
	],
	excecoes: [
		{ folha: "castelo", area: [32, 0, 63, 0], zona: "chao", nota: "tileZone: a linha 0 é chão no castelo" },
		{
			folha: "castelo",
			area: [57, 20, 60, 23],
			zona: "normal",
			nota: "as peças sob o rótulo non-blocking da folha (estandarte, portal vermelho e azul); castelo_passagem usa 59-60 nas passagens",
		},
	],
	bloqueiam: ["vazio", "bloqueia", "animado", "sem_pecas"],
	acoes: { senta: "3", deita: "4" },
};

const catalogoPecas = {
	versao: 1,
	nota: "As regiões das folhas que o jogo cita: id como o jogo usa (casa8, casa@56,25), folha, area [coluna, linha, largura, altura], tipo, camada sugerida (0 chão, 1 objeto, 2 frente), bloqueia, acao/acoes (códigos do Graal por célula, uma linha por linha da peça), decorar (as formas, variantes, fundos e encaixe do inventário do Decorar), movel, fixo, luz, noite. Semeado por tools/diorama_lib/semear_catalogo.mjs.",
	pecas,
};

fs.mkdirSync(PASTA_CATALOGO, { recursive: true });
for (const [nome, valor] of [
	["zonas", zonas],
	["pecas", catalogoPecas],
	["fundos", fundos],
]) {
	fs.writeFileSync(path.join(PASTA_CATALOGO, `${nome}.json`), JSON.stringify(valor, null, "\t") + "\n");
	console.log(`gravado diorama/catalogo/${nome}.json`);
}
