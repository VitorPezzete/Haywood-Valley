// Instala a extensão Diorama do Aseprite: copia aseprite/diorama/ para %APPDATA%\Aseprite\extensions\diorama.
// Desde a 0.4.0 (2026-10-22) copia também os módulos de pixel art (aseprite/pixel/rotsprite.lua e limpeza.lua) para
// <extensão>/pixel/: os itens "Girar (RotSprite)…" e "Limpar doubles e jaggies…" usam essa cópia, que casa com a
// versão da extensão (sem ela, a extensão cai nos do repositório). O testes.lua não vai.
// Desde a 0.5.0 (2026-10-22, "Ferramentas" com janela): copia aseprite/adaptadores/extensoes.lua e ferramentas.lua
// para <extensão>/adaptadores/ (o rodar.lua não vai) e instala as matrizes de dithering no Aseprite (pedido do
// usuário): um Aseprite em lote (-b, um processo só, que termina sozinho) põe o conjunto inicial na biblioteca do
// usuário se ela não tem matrizes e grava a extensão user_generated_dithers na pasta de extensões. Uma
// user_generated_dithers que já existia vai antes para %APPDATA%\Aseprite\diorama\backup\.
// Guarda o __pref.lua que já estiver lá (as preferências da extensão: raiz, endereço da ponte, última região).
// O Aseprite só carrega extensões ao abrir: se ele estiver aberto, é preciso fechar e abrir de novo.
//
// Uso: npm run aseprite:instalar
//      node tools/aseprite_instalar.mjs [--destino <pasta de extensões>]   (outra pasta, ex. um Aseprite portátil)
//                                       [--pinceis <pasta>]   (a biblioteca; padrão HV_PINCEIS ou %APPDATA%\Aseprite\diorama\pinceis)
//                                       [--sem-matrizes]      (só a extensão)

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { rodarExtensao, caminhoAseprite } from "./aseprite_extensoes.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGEM = path.join(RAIZ, "aseprite", "diorama");
const NOME = "diorama";
const PIXEL = path.join(RAIZ, "aseprite", "pixel");
const MODULOS_PIXEL = ["limpeza.lua", "rotsprite.lua"];
const ADAPTADORES = path.join(RAIZ, "aseprite", "adaptadores");
const MODULOS_ADAPTADORES = ["extensoes.lua", "ferramentas.lua"];

function argumento(nome) {
	const i = process.argv.indexOf(nome);
	if (i < 0) return undefined;
	const valor = process.argv[i + 1];
	if (valor === undefined || valor.startsWith("--")) {
		console.error(`${nome} precisa de uma pasta`);
		process.exit(2);
	}
	return valor;
}

const APPDATA = process.env.APPDATA ?? path.join(process.env.USERPROFILE ?? "", "AppData", "Roaming");
const pastaExtensoes = argumento("--destino") ?? path.join(APPDATA, "Aseprite", "extensions");
const destino = path.join(pastaExtensoes, NOME);
const pastaPinceis = argumento("--pinceis") ?? process.env.HV_PINCEIS ?? path.join(APPDATA, "Aseprite", "diorama", "pinceis");
const semMatrizes = process.argv.includes("--sem-matrizes");

if (!fs.existsSync(path.join(ORIGEM, "package.json"))) {
	console.error(`Não achei a extensão em ${ORIGEM}`);
	process.exit(1);
}

/** Arquivos da extensão, relativos à pasta dela, com "/" (o formato do __info.json do Aseprite). */
function listar(pasta, prefixo = "") {
	const saida = [];
	for (const entrada of fs.readdirSync(pasta, { withFileTypes: true })) {
		const rel = prefixo + entrada.name;
		if (entrada.isDirectory()) {
			saida.push(rel + "/", ...listar(path.join(pasta, entrada.name), rel + "/"));
		} else {
			saida.push(rel);
		}
	}
	return saida;
}

const arquivos = [
	...listar(ORIGEM),
	"pixel/",
	...MODULOS_PIXEL.map((m) => "pixel/" + m),
	"adaptadores/",
	...MODULOS_ADAPTADORES.map((m) => "adaptadores/" + m),
];
for (const m of [...MODULOS_PIXEL.map((x) => path.join(PIXEL, x)), ...MODULOS_ADAPTADORES.map((x) => path.join(ADAPTADORES, x))]) {
	if (!fs.existsSync(m)) {
		console.error(`Não achei ${m}`);
		process.exit(1);
	}
}

// Apaga o que a instalação anterior pôs (menos as preferências) e copia a versão nova.
fs.mkdirSync(destino, { recursive: true });
for (const entrada of fs.readdirSync(destino)) {
	if (entrada === "__pref.lua") continue;
	fs.rmSync(path.join(destino, entrada), { recursive: true, force: true });
}
fs.cpSync(ORIGEM, destino, { recursive: true });
fs.mkdirSync(path.join(destino, "pixel"), { recursive: true });
for (const m of MODULOS_PIXEL) fs.copyFileSync(path.join(PIXEL, m), path.join(destino, "pixel", m));
fs.mkdirSync(path.join(destino, "adaptadores"), { recursive: true });
for (const m of MODULOS_ADAPTADORES) fs.copyFileSync(path.join(ADAPTADORES, m), path.join(destino, "adaptadores", m));
// O Aseprite usa este arquivo para desinstalar pelo menu Preferências > Extensões.
fs.writeFileSync(path.join(destino, "__info.json"), JSON.stringify({ installedFiles: arquivos }));

const versao = JSON.parse(fs.readFileSync(path.join(ORIGEM, "package.json"), "utf8")).version;
console.log(`Extensão Diorama ${versao} instalada em ${destino}`);
for (const arquivo of arquivos) console.log(`  ${arquivo}`);

// As matrizes de dithering (0.5.0): o conjunto inicial na biblioteca, se ela não tem nenhuma, e a extensão
// user_generated_dithers na pasta de extensões. Um Aseprite em lote, um processo só.
async function instalarMatrizes() {
	const aseprite = caminhoAseprite();
	if (!fs.existsSync(aseprite)) {
		console.log(`Matrizes de dithering não instaladas: não achei o Aseprite (${aseprite}); defina ASEPRITE_PATH e rode de novo.`);
		return false;
	}
	const pastaMatrizes = path.join(pastaExtensoes, "user_generated_dithers");
	if (fs.existsSync(pastaMatrizes)) {
		const marca = new Date().toISOString().replace(/[:.]/g, "-");
		const copia = path.join(APPDATA, "Aseprite", "diorama", "backup", `user_generated_dithers_${marca}`);
		fs.mkdirSync(path.dirname(copia), { recursive: true });
		fs.cpSync(pastaMatrizes, copia, { recursive: true });
		console.log(`A user_generated_dithers que já existia foi copiada para ${copia}`);
	}
	const r = await rodarExtensao("matriz.instalar", { pasta: pastaPinceis, saida: pastaExtensoes }, { tempo: 120_000, aseprite });
	if (!r.ok) {
		console.error(`Matrizes de dithering não instaladas: ${r.erro}`);
		return false;
	}
	const { iniciais, extensao } = r.resultado;
	if (iniciais?.criadas?.length) console.log(`Biblioteca ${pastaPinceis}: ${iniciais.criadas.length} matrizes iniciais criadas (${iniciais.criadas.join(", ")})`);
	else console.log(`Biblioteca ${pastaPinceis}: já tinha ${iniciais?.ja_tinha ?? "?"} matriz(es)`);
	console.log(`Matrizes de dithering instaladas em ${extensao.pasta} (${extensao.matrizes}):`);
	for (const a of extensao.arquivos) console.log(`  ${path.basename(a)}`);
	return true;
}

if (!semMatrizes) await instalarMatrizes();

// Avisa se o Aseprite está aberto (ele só lê as extensões ao abrir).
if (process.platform === "win32") {
	try {
		const lista = execFileSync("tasklist", ["/FI", "IMAGENAME eq Aseprite.exe", "/NH"], { encoding: "utf8" });
		if (/aseprite\.exe/i.test(lista)) {
			console.log("O Aseprite está aberto: feche e abra de novo para carregar a versão nova (e as matrizes).");
		}
	} catch {
		// sem tasklist: só não avisa
	}
}
