#!/usr/bin/env node
// `npm run mundo:jogo [-- --conferir]`: grava (ou só confere) os módulos do mapa do mundo em src/shared/world/
// (plano.ts, terreno.ts, fase1.ts) a partir do plano, pelo `tools/mundo_mapa.py jogo`. O Python não está no PATH do
// Git Bash nem do npm: este script acha o interpretador de %LOCALAPPDATA%\Programs\Python\Python312 (ou o do
// PATH) e o roda com -I. Precisa do plano em Documents\Haywood-Valley-recuperado\mundo (`--raiz` muda).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const local = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Programs", "Python", "Python312", "python.exe") : "";
const python = local && existsSync(local) ? local : "python";
const resultado = spawnSync(python, ["-I", join(RAIZ, "tools", "mundo_mapa.py"), "jogo", ...process.argv.slice(2)], {
	stdio: "inherit",
	cwd: RAIZ,
});
if (resultado.error) {
	console.error(`não consegui rodar o Python (${python}): ${resultado.error.message}`);
	process.exit(1);
}
process.exit(resultado.status ?? 1);
