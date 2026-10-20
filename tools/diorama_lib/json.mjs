// JSON legível para os blocos e o mapa.json: objetos abertos com tabs, listas de números ou textos numa linha só
// ([x, y, "casa", 0, 2]) e listas de listas com um item por linha, para o bloco de um mapa grande caber em poucas
// mil linhas e o diff do git mostrar uma célula por linha.
function simples(valor) {
	return valor === null || typeof valor !== "object";
}

function umaLinha(lista) {
	return `[${lista.map((v) => JSON.stringify(v)).join(", ")}]`;
}

export function jsonLegivel(valor, recuo = "") {
	if (simples(valor)) return JSON.stringify(valor);
	if (Array.isArray(valor)) {
		if (valor.length === 0) return "[]";
		if (valor.every(simples)) return umaLinha(valor);
		const dentro = recuo + "\t";
		return `[\n${valor.map((v) => dentro + jsonLegivel(v, dentro)).join(",\n")}\n${recuo}]`;
	}
	const chaves = Object.keys(valor).filter((k) => valor[k] !== undefined);
	if (chaves.length === 0) return "{}";
	const dentro = recuo + "\t";
	return `{\n${chaves.map((k) => `${dentro}${JSON.stringify(k)}: ${jsonLegivel(valor[k], dentro)}`).join(",\n")}\n${recuo}}`;
}

/** O texto de um arquivo JSON do Diorama: legível e com quebra de linha no fim. */
export function textoJson(valor) {
	return jsonLegivel(valor) + "\n";
}
