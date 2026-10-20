// Lê um módulo gerado src/shared/interiors/<mapa>.ts e devolve o objeto InteriorData. O módulo é um literal de
// objeto JavaScript válido (números em hex, vírgulas no fim), então basta recortar o literal e avaliá-lo.
import fs from "node:fs";

export function lerInteriorTs(caminho) {
	const texto = fs.readFileSync(caminho, "utf8");
	const inicio = texto.indexOf("export const interior: InteriorData = ");
	if (inicio < 0) throw new Error(`${caminho}: não é um módulo de interior gerado`);
	const literal = texto.slice(inicio + "export const interior: InteriorData = ".length).replace(/;\s*$/, "");
	return new Function(`return (${literal});`)();
}

/** O texto `stamp` do módulo, sem avaliar. */
export function lerCarimboTs(caminho) {
	const texto = fs.readFileSync(caminho, "utf8");
	return /stamp: "([0-9a-f]{12})"/.exec(texto)?.[1];
}
