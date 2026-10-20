// Diagnóstico do registro de assets (GET /assets = assets/registro.json, formato em tools/assets.mjs):
// chaves sem id (o jogo avisa [Som], [Luz], [Água], [Pecas] em tempo de jogo e segue sem a imagem) e o mesmo id
// em chaves diferentes (duas imagens com o mesmo id: uma delas está errada).
import { Problema } from "./tipos";

interface EntradaAsset {
	tipo?: unknown;
	id?: unknown;
	arquivo?: unknown;
}

export function verificarAssets(conteudo: unknown): Problema[] {
	const problemas = new Array<Problema>();
	const onde = "assets/registro.json";
	if (!typeIs(conteudo, "table")) {
		problemas.push({ gravidade: "erro", grupo: "assets", onde, oQue: "o registro não é um objeto JSON.", comoCorrigir: "Confira o arquivo; o formato está no topo de tools/assets.mjs." });
		return problemas;
	}
	const registro = conteudo as { formato?: unknown; assets?: unknown; antigos?: unknown };
	if (registro.formato !== 1) {
		problemas.push({
			gravidade: "aviso",
			grupo: "assets",
			onde,
			oQue: `formato ${tostring(registro.formato)} (o plugin conhece o 1).`,
			comoCorrigir: "Se o formato mudou, atualize o diagnóstico (plugin/src/problemas/assets.ts).",
		});
	}
	if (!typeIs(registro.assets, "table")) {
		problemas.push({ gravidade: "erro", grupo: "assets", onde, oQue: "não há a seção \"assets\".", comoCorrigir: "Confira o arquivo." });
		return problemas;
	}
	const assets = registro.assets as Record<string, EntradaAsset>;
	const porId = new Map<number, string[]>();
	const semId = new Array<string>();
	let total = 0;
	for (const [chave, entrada] of pairs(assets)) {
		total += 1;
		const nome = tostring(chave);
		if (!typeIs(entrada, "table")) {
			problemas.push({ gravidade: "erro", grupo: "assets", onde: `${onde}: ${nome}`, oQue: "a entrada não é um objeto.", comoCorrigir: "Cada chave tem { tipo, id, arquivo?, origem?, nota? }." });
			continue;
		}
		const id = entrada.id;
		if (id === undefined || id === "") {
			semId.push(nome);
			continue;
		}
		if (!typeIs(id, "number") || id !== math.floor(id) || id <= 0) {
			problemas.push({
				gravidade: "erro",
				grupo: "assets",
				onde: `${onde}: ${nome}`,
				oQue: `o id "${tostring(id)}" não é um número inteiro positivo.`,
				comoCorrigir: "O id do Roblox é um número (ex.: 101792482061813), ou \"\" enquanto não foi enviado.",
			});
			continue;
		}
		const lista = porId.get(id) ?? [];
		lista.push(nome);
		porId.set(id, lista);
		if (entrada.tipo !== "imagem" && entrada.tipo !== "som") {
			problemas.push({
				gravidade: "aviso",
				grupo: "assets",
				onde: `${onde}: ${nome}`,
				oQue: `tipo "${tostring(entrada.tipo)}" desconhecido (imagem ou som).`,
				comoCorrigir: "Corrija o tipo no registro.",
			});
		}
	}
	for (const [id, chaves] of porId) {
		if (chaves.size() > 1) {
			problemas.push({
				gravidade: "aviso",
				grupo: "assets",
				onde: `${onde}: ${chaves.join(", ")}`,
				oQue: `o id ${id} aparece em ${chaves.size()} chaves.`,
				comoCorrigir: "Duas chaves com o mesmo id mostram a mesma imagem; uma delas provavelmente recebeu o id errado.",
			});
		}
	}
	if (semId.size() > 0) {
		const mostrar = semId.size() > 12 ? `${semId.filter((_, i) => i < 12).join(", ")}… (+${semId.size() - 12})` : semId.join(", ");
		problemas.push({
			gravidade: "aviso",
			grupo: "assets",
			onde,
			oQue: `${semId.size()} de ${total} chave(s) sem id: ${mostrar}.`,
			comoCorrigir: "Envie as imagens (ferramenta Assets ou upload_image do MCP) e rode npm run assets -- --importar. O jogo avisa e segue sem elas.",
		});
	}
	return problemas;
}
