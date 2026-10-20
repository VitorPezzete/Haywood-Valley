// O importador: de src/shared/interiors/<mapa>.ts (o módulo gerado que sobreviveu) para o bloco JSON do formato 1 em
// diorama/mapas/<mapa>/blocos/0_0.json, mais diorama/mapas/<mapa>/mapa.json. Serve para reabrir no Diorama os mapas
// de antes da formatação; o gerador (tools/diorama_jogo.mjs) tem de reproduzir o módulo a partir do bloco.
//
//   npm run diorama:importar -- <mapa>      importa um mapa
//   npm run diorama:importar -- --todos     importa todos os módulos da pasta (menos index.ts e types.ts)
//
// O carimbo antigo (`stamp`) vai para o bloco como `carimbo`, com `carimbo_conteudo` (ver diorama_lib/carimbo.mjs).
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "./diorama_lib/folhas.mjs";
import { gerarInterior, textoModulo } from "./diorama_lib/gerar.mjs";
import { blocoDoInterior } from "./diorama_lib/importar.mjs";
import { textoJson } from "./diorama_lib/json.mjs";
import { lerInteriorTs } from "./diorama_lib/ler_ts.mjs";

const PASTA_MAPAS = path.join(RAIZ, "diorama", "mapas");
const PASTA_INTERIORS = path.join(RAIZ, "src", "shared", "interiors");

function importar(mapa) {
	const origem = path.join(PASTA_INTERIORS, `${mapa}.ts`);
	if (!fs.existsSync(origem)) throw new Error(`não existe src/shared/interiors/${mapa}.ts`);
	const data = lerInteriorTs(origem);
	const { bloco, avisos } = blocoDoInterior(data);
	for (const aviso of avisos) console.log(`  aviso: ${aviso}`);

	const pasta = path.join(PASTA_MAPAS, mapa);
	fs.mkdirSync(path.join(pasta, "blocos"), { recursive: true });
	fs.writeFileSync(path.join(pasta, "blocos", "0_0.json"), textoJson(bloco));
	const caminhoMapa = path.join(pasta, "mapa.json");
	const antigo = fs.existsSync(caminhoMapa) ? JSON.parse(fs.readFileSync(caminhoMapa, "utf8")) : {};
	const mapaJson = {
		versao: 1,
		id: mapa,
		nome: antigo.nome ?? mapa,
		folhas: bloco.folhas,
		blocos: [[0, 0]],
		data: new Date().toISOString().slice(0, 10),
		origem: `importado de src/shared/interiors/${mapa}.ts por tools/diorama_importar.mjs`,
	};
	fs.writeFileSync(caminhoMapa, textoJson(mapaJson));

	// Confere o round trip: o módulo gerado do bloco tem de ser o módulo lido (sem a cauda da primeira linha).
	const { data: gerado } = gerarInterior(bloco);
	const original = fs.readFileSync(origem, "utf8");
	const eol = original.includes("\r\n") ? "\r\n" : "\n";
	const limpo = original.replace(/^(import type \{ InteriorData \} from "\.\/types";)[^\r\n]*/, "$1");
	const igual = textoModulo(gerado, eol) === limpo;
	console.log(
		`${mapa}: bloco com ${Object.values(bloco.camadas).reduce((n, c) => n + c.length, 0)} células pintadas` +
			(bloco.exterior ? (bloco.exterior.runs_importados ? ", exterior em recortes crus" : ", exterior na grade dupla") : "") +
			`; gerado de volta ${igual ? "idêntico" : "DIFERENTE"}`,
	);
	return igual;
}

function main(args) {
	if (args.length === 0) {
		console.log("uso: npm run diorama:importar -- <mapa> | --todos");
		return 2;
	}
	const mapas = args.includes("--todos")
		? fs
				.readdirSync(PASTA_INTERIORS)
				.filter((nome) => nome.endsWith(".ts") && nome !== "index.ts" && nome !== "types.ts")
				.map((nome) => nome.slice(0, -3))
				.sort()
		: args;
	let falhas = 0;
	for (const mapa of mapas) if (!importar(mapa)) falhas++;
	if (mapas.length > 1) console.log(falhas === 0 ? "todos os mapas fecham o round trip" : `${falhas} mapa(s) não fecham o round trip`);
	return falhas === 0 ? 0 : 1;
}

try {
	process.exitCode = main(process.argv.slice(2));
} catch (erro) {
	console.error(`erro: ${erro.message}`);
	process.exitCode = 1;
}
