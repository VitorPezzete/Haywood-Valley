// Os problemas do catálogo, para o rodapé da ferramenta Catálogo: id repetido, área fora da folha, ações com o
// tamanho errado, variante sem células ou com célula fora da folha, fundo exigido que não existe na folha, peça de
// parede sem fundo exigido, fundo repetido na folha ou sem tiles. O diagnóstico da ferramenta Problemas
// (../problemas/catalogo.ts) faz as mesmas contas a partir do JSON cru; aqui elas rodam sobre as peças em edição.
import { COLUNAS, dentroDaFolha, FOLHAS, Fundo, LINHAS, Peca, retanguloTexto, TIPOS_QUE_PEDEM_FUNDO } from "./formato";

export interface Problema {
	/** "peca" ou "fundo", e o id, para selecionar ao clicar. */
	origem: "peca" | "fundo";
	id: string;
	texto: string;
}

export function problemasDoCatalogo(pecas: Peca[], fundos: Fundo[]): Problema[] {
	const lista = new Array<Problema>();
	const idsPecas = new Map<string, number>();
	for (const p of pecas) idsPecas.set(p.id, (idsPecas.get(p.id) ?? 0) + 1);
	const chavesFundos = new Map<string, number>();
	for (const f of fundos) chavesFundos.set(`${f.folha}/${f.id}`, (chavesFundos.get(`${f.folha}/${f.id}`) ?? 0) + 1);
	const fundoExiste = (folha: string, id: string) => fundos.some((f) => f.folha === folha && f.id === id);

	const repetidos = new Set<string>();
	for (const p of pecas) {
		const peca = (texto: string) => lista.push({ origem: "peca", id: p.id, texto: `${p.id}: ${texto}` });
		if ((idsPecas.get(p.id) ?? 0) > 1 && !repetidos.has(p.id)) {
			repetidos.add(p.id);
			lista.push({ origem: "peca", id: p.id, texto: `id repetido: ${p.id} (${idsPecas.get(p.id)} peças)` });
		}
		if (!(FOLHAS as ReadonlyArray<string>).includes(p.folha)) peca(`folha desconhecida "${p.folha}"`);
		if (!dentroDaFolha(p.area)) peca(`área ${retanguloTexto(p.area)} sai da folha (${COLUNAS}×${LINHAS})`);
		if (p.acoes !== undefined && (p.acoes.size() !== p.area.h || p.acoes.some((linha) => linha.size() !== p.area.w))) {
			peca(`ações com ${p.acoes.size()} linha(s); a área é ${p.area.w}×${p.area.h} (uma linha por linha, um código por coluna)`);
		}
		if (p.acao !== undefined && p.acao.size() !== 1) peca(`ação "${p.acao}" não é um código de um caractere`);
		if (p.decorar) {
			if (p.decorar.formas.size() === 0) peca("decorar sem formas (a peça não entra no inventário)");
			p.decorar.formas.forEach((forma, fi) => {
				if (forma.variantes.size() === 0) peca(`forma ${fi + 1} sem variantes`);
				forma.variantes.forEach((v, vi) => {
					const onde = `forma ${fi + 1}, variante ${vi + 1}`;
					if (v.celulas.size() === 0) peca(`${onde} sem células`);
					if (v.celulas.some((c) => c.coluna < 0 || c.linha < 0 || c.coluna >= COLUNAS || c.linha >= LINHAS)) peca(`${onde} tem célula com tile fora da folha`);
					if (v.celulas.some((c) => c.dx < 0 || c.dy < 0 || c.dx >= v.w || c.dy >= v.h)) peca(`${onde} tem célula fora de ${v.w}×${v.h}`);
					for (const id of v.fundos) if (!fundoExiste(p.folha, id)) peca(`${onde} exige o fundo "${id}", que não existe na ${p.folha}`);
					for (const c of v.celulas) {
						for (const id of c.fundos ?? []) {
							if (!fundoExiste(p.folha, id)) peca(`${onde}, célula (${c.dx}, ${c.dy}) aceita o fundo "${id}", que não existe na ${p.folha}`);
						}
					}
					if (v.encaixe && v.encaixe.tipo === "janela" && v.encaixe.papel === undefined) peca(`${onde}: encaixe de janela sem papel (azul ou amarelo)`);
				});
			});
			if (TIPOS_QUE_PEDEM_FUNDO.includes(p.tipo) && !p.decorar.formas.some((f) => f.variantes.some((v) => v.fundos.size() > 0))) {
				peca(`tipo "${p.tipo}" pede fundo exigido e nenhuma variante tem`);
			}
		}
	}

	const repetidosFundos = new Set<string>();
	for (const f of fundos) {
		const chave = `${f.folha}/${f.id}`;
		if ((chavesFundos.get(chave) ?? 0) > 1 && !repetidosFundos.has(chave)) {
			repetidosFundos.add(chave);
			lista.push({ origem: "fundo", id: f.id, texto: `fundo repetido na ${f.folha}: ${f.id}` });
		}
		if (f.id === "") lista.push({ origem: "fundo", id: f.id, texto: "fundo sem id" });
		if (f.tiles.size() === 0) lista.push({ origem: "fundo", id: f.id, texto: `fundo ${f.id} (${f.folha}) sem tiles` });
		if (!(FOLHAS as ReadonlyArray<string>).includes(f.folha)) lista.push({ origem: "fundo", id: f.id, texto: `fundo ${f.id}: folha desconhecida "${f.folha}"` });
		if (f.tiles.some((t) => t < 0 || t >= COLUNAS * LINHAS)) lista.push({ origem: "fundo", id: f.id, texto: `fundo ${f.id}: tile fora da folha` });
	}
	return lista;
}
