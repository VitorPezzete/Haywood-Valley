// O registro de assets (assets/registro.json, GET /assets) como o plugin o lê. O formato é o do topo de
// tools/assets.mjs (formato 1): `assets` e `antigos` são objetos chave → { tipo, id, arquivo?, origem?, nota? }.
// O JSONDecode do Roblox perde a ordem das chaves, então a lista sai em ordem alfabética.

export interface EntradaRegistro {
	chave: string;
	/** "imagem" ou "som" (texto livre no arquivo). */
	tipo: string;
	/** O id no Roblox, ou `undefined` enquanto não foi enviado. */
	id?: number;
	arquivo?: string;
	origem?: string;
	nota?: string;
	/** Está em `antigos` (não entra em assets.ts). */
	antigo: boolean;
}

export interface Registro {
	formato?: number;
	notas: string[];
	entradas: EntradaRegistro[];
}

function texto(v: unknown): string | undefined {
	return typeIs(v, "string") ? v : undefined;
}

function lerId(v: unknown): number | undefined {
	if (typeIs(v, "number") && v > 0) return v;
	if (typeIs(v, "string")) {
		const n = tonumber(v.gsub("^rbxassetid://", "")[0]);
		if (n !== undefined && n > 0) return n;
	}
	return undefined;
}

function lerGrupo(grupo: unknown, antigo: boolean, saida: EntradaRegistro[]) {
	if (!typeIs(grupo, "table")) return;
	for (const [chave, bruto] of pairs(grupo as Record<string, unknown>)) {
		if (!typeIs(chave, "string") || !typeIs(bruto, "table")) continue;
		const e = bruto as Record<string, unknown>;
		saida.push({
			chave,
			tipo: texto(e.tipo) ?? "?",
			id: lerId(e.id),
			arquivo: texto(e.arquivo),
			origem: texto(e.origem),
			nota: texto(e.nota),
			antigo,
		});
	}
}

export function lerRegistro(bruto: unknown): Registro {
	const entradas = new Array<EntradaRegistro>();
	const notas = new Array<string>();
	let formato: number | undefined;
	if (typeIs(bruto, "table")) {
		const r = bruto as Record<string, unknown>;
		formato = typeIs(r.formato, "number") ? r.formato : undefined;
		if (typeIs(r.notas, "table")) for (const n of r.notas as unknown[]) if (typeIs(n, "string")) notas.push(n);
		lerGrupo(r.assets, false, entradas);
		lerGrupo(r.antigos, true, entradas);
	}
	entradas.sort((a, b) => a.chave < b.chave);
	return { formato, notas, entradas };
}

export function idTexto(e: EntradaRegistro): string {
	return e.id === undefined ? "" : `rbxassetid://${e.id}`;
}

export interface RecorteSugerido {
	/** Caminho do PNG a partir da raiz do repositório, sem o .png. */
	caminho: string;
	x: number;
	y: number;
	w: number;
	h: number;
	/** Por que este recorte. */
	motivo: string;
}

/**
 * O que a ponte consegue servir para esta entrada (GET /imagens/<caminho>.rgba): qualquer PNG de assets/ ou
 * diorama/folhas/. `diorama/folhas/<nome>_<n>.png` é a metade n (1024 px de largura) de `<nome>.png`, que existe
 * como arquivo e também como recorte da folha inteira; o resto é o arquivo inteiro (w e h 0), que só cabe numa
 * EditableImage se tiver até 1024×1024.
 */
export function recorteSugerido(e: EntradaRegistro): RecorteSugerido | undefined {
	if (e.tipo !== "imagem" || e.arquivo === undefined) return undefined;
	const caminho = e.arquivo.gsub("\\", "/")[0];
	const [semPng] = caminho.match("^(.-)%.png$");
	if (semPng === undefined) return undefined;
	const limpo = tostring(semPng);
	const [nome] = limpo.match("^diorama/folhas/([%w_%-%.]+)$");
	if (nome !== undefined) {
		const [base, n] = tostring(nome).match("^(.-)_(%d+)$");
		if (base !== undefined && n !== undefined) {
			const metade = tonumber(n) ?? 0;
			return { caminho: `diorama/folhas/${base}`, x: metade * 1024, y: 0, w: 1024, h: 512, motivo: `metade ${metade} de ${base}.png` };
		}
		return { caminho: limpo, x: 0, y: 0, w: 0, h: 0, motivo: `a folha ${nome}.png inteira (0 = tamanho todo)` };
	}
	if (limpo.match("^assets/")[0] !== undefined) {
		return { caminho: limpo, x: 0, y: 0, w: 0, h: 0, motivo: `${e.arquivo} inteiro (0 = tamanho todo)` };
	}
	return undefined;
}
