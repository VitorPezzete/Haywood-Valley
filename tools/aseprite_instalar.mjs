// Instala a extensão Diorama do Aseprite: copia aseprite/diorama/ para %APPDATA%\Aseprite\extensions\diorama.
// Guarda o __pref.lua que já estiver lá (as preferências da extensão: raiz, endereço da ponte, última região).
// O Aseprite só carrega extensões ao abrir: se ele estiver aberto, é preciso fechar e abrir de novo.
//
// Uso: npm run aseprite:instalar
//      node tools/aseprite_instalar.mjs [--destino <pasta de extensões>]   (outra pasta, ex. um Aseprite portátil)

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGEM = path.join(RAIZ, "aseprite", "diorama");
const NOME = "diorama";

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

const pastaExtensoes =
	argumento("--destino") ?? path.join(process.env.APPDATA ?? path.join(process.env.USERPROFILE ?? "", "AppData", "Roaming"), "Aseprite", "extensions");
const destino = path.join(pastaExtensoes, NOME);

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

const arquivos = listar(ORIGEM);

// Apaga o que a instalação anterior pôs (menos as preferências) e copia a versão nova.
fs.mkdirSync(destino, { recursive: true });
for (const entrada of fs.readdirSync(destino)) {
	if (entrada === "__pref.lua") continue;
	fs.rmSync(path.join(destino, entrada), { recursive: true, force: true });
}
fs.cpSync(ORIGEM, destino, { recursive: true });
// O Aseprite usa este arquivo para desinstalar pelo menu Preferências > Extensões.
fs.writeFileSync(path.join(destino, "__info.json"), JSON.stringify({ installedFiles: arquivos }));

const versao = JSON.parse(fs.readFileSync(path.join(ORIGEM, "package.json"), "utf8")).version;
console.log(`Extensão Diorama ${versao} instalada em ${destino}`);
for (const arquivo of arquivos) console.log(`  ${arquivo}`);

// Avisa se o Aseprite está aberto (ele só lê as extensões ao abrir).
if (process.platform === "win32") {
	try {
		const lista = execFileSync("tasklist", ["/FI", "IMAGENAME eq Aseprite.exe", "/NH"], { encoding: "utf8" });
		if (/aseprite\.exe/i.test(lista)) {
			console.log("O Aseprite está aberto: feche e abra de novo para carregar a versão nova.");
		}
	} catch {
		// sem tasklist: só não avisa
	}
}
