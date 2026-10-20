// JSON canônico (chaves em ordem alfabética), para comparar dois valores lidos de JSON sem depender da ordem das
// tabelas do Luau. O editor de Mapas usa para saber se o bloco mudou no disco desde que foi aberto; o autoteste,
// para conferir a ida e volta de um bloco. Uma tabela vazia vale "{}" (o JSONDecode não distingue [] de {}).
export function canonico(v: unknown): string {
	if (typeIs(v, "table")) {
		const chaves = new Array<string>();
		let lista = true;
		let n = 0;
		for (const [k] of pairs(v as object)) {
			n++;
			if (!typeIs(k, "number")) lista = false;
			chaves.push(tostring(k));
		}
		if (n === 0) return "{}";
		if (lista) {
			const partes = new Array<string>();
			for (const x of v as defined[]) partes.push(canonico(x));
			return `[${partes.join(",")}]`;
		}
		chaves.sort();
		const partes = new Array<string>();
		for (const k of chaves) partes.push(`${k}:${canonico((v as Record<string, unknown>)[k])}`);
		return `{${partes.join(",")}}`;
	}
	if (typeIs(v, "string")) return `"${v}"`;
	return tostring(v);
}
