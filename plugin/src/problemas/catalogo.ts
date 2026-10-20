// Diagnóstico do catálogo (GET /catalogo/pecas e /catalogo/fundos), no formato do gerador (GERADOR.md e
// ../catalogo/formato.ts): id repetido, folha desconhecida, área fora da folha, ações com o tamanho errado,
// variantes do Decorar sem células ou com célula fora da folha, fundo exigido que não existe na folha, fundo
// repetido (o id de um fundo só é único dentro da folha: `vazio` e `taco` existem na casa e no castelo) e tile de
// fundo fora da folha.
import { CelulaPeca, dentroDaFolha, Fundo, lerCatalogo, lerFundo, lerPeca, Peca, retanguloTexto, TIPOS_QUE_PEDEM_FUNDO } from "../catalogo/formato";
import { COLUNAS_DA_FOLHA, LINHAS_DA_FOLHA, Problema } from "./tipos";

function erro(problemas: Problema[], onde: string, oQue: string, comoCorrigir: string) {
	problemas.push({ gravidade: "erro", grupo: "catalogo", onde, oQue, comoCorrigir });
}

function aviso(problemas: Problema[], onde: string, oQue: string, comoCorrigir: string) {
	problemas.push({ gravidade: "aviso", grupo: "catalogo", onde, oQue, comoCorrigir });
}

function celulaForaDaFolha(c: CelulaPeca) {
	return c.coluna < 0 || c.linha < 0 || c.coluna >= COLUNAS_DA_FOLHA || c.linha >= LINHAS_DA_FOLHA;
}

/**
 * Confere pecas.json e fundos.json juntos: as peças citam os fundos pela id dentro da folha. `fundos` pode faltar
 * (a ponte não o serviu): então as referências a fundos não são conferidas.
 */
export function verificarCatalogo(pecasJson: unknown, fundosJson: unknown | undefined, folhasConhecidas: ReadonlySet<string>): Problema[] {
	const problemas = new Array<Problema>();
	const arquivoPecas = "diorama/catalogo/pecas.json";
	const arquivoFundos = "diorama/catalogo/fundos.json";

	const fundos = fundosJson !== undefined ? lerCatalogo(fundosJson, "fundos", lerFundo) : undefined;
	const pecas = lerCatalogo(pecasJson, "pecas", lerPeca);
	if (pecas.descartadas > 0) {
		erro(problemas, arquivoPecas, `${pecas.descartadas} entrada(s) sem id ou sem area [coluna, linha, largura, altura].`, "Cada peça tem id (como o jogo cita: casa8, casa@56,25) e area em tiles da folha.");
	}
	if (fundos && fundos.descartadas > 0) {
		erro(problemas, arquivoFundos, `${fundos.descartadas} entrada(s) sem id.`, "Cada fundo tem folha, id e tiles (linha × 128 + coluna).");
	}
	const fundoExiste = (folha: string, id: string) => fundos === undefined || fundos.itens.some((f) => f.folha === folha && f.id === id);

	const vistos = new Map<string, number>();
	for (const p of pecas.itens) vistos.set(p.id, (vistos.get(p.id) ?? 0) + 1);
	for (const [id, vezes] of vistos) {
		if (vezes > 1) erro(problemas, `${arquivoPecas}: ${id}`, `o id aparece ${vezes} vezes.`, "Ids são únicos: o jogo e os mapas citam a peça por ele.");
	}

	for (const p of pecas.itens) verificarPeca(p, `${arquivoPecas}: ${p.id}`, folhasConhecidas, fundoExiste, problemas);

	if (fundos) {
		const chaves = new Map<string, number>();
		for (const f of fundos.itens) {
			const chave = `${f.folha}/${f.id}`;
			chaves.set(chave, (chaves.get(chave) ?? 0) + 1);
		}
		for (const [chave, vezes] of chaves) {
			if (vezes > 1) erro(problemas, `${arquivoFundos}: ${chave}`, `o fundo aparece ${vezes} vezes na mesma folha.`, "Um id de fundo é único dentro da folha.");
		}
		for (const f of fundos.itens) verificarFundo(f, `${arquivoFundos}: ${f.folha}/${f.id}`, folhasConhecidas, problemas);
	}
	return problemas;
}

function verificarPeca(p: Peca, onde: string, folhasConhecidas: ReadonlySet<string>, fundoExiste: (folha: string, id: string) => boolean, problemas: Problema[]) {
	if (!folhasConhecidas.has(p.folha)) {
		erro(problemas, onde, `folha "${p.folha}" desconhecida.`, `As folhas são as de diorama/folhas (${[...folhasConhecidas].join(", ")}).`);
	}
	if (!dentroDaFolha(p.area)) {
		erro(problemas, onde, `area ${retanguloTexto(p.area)} fora da folha (colunas 0–${COLUNAS_DA_FOLHA - 1}, linhas 0–${LINHAS_DA_FOLHA - 1}).`, "Corrija a área no Catálogo.");
	}
	if (p.acoes !== undefined) {
		if (p.acoes.size() !== p.area.h || p.acoes.some((linha) => linha.size() !== p.area.w)) {
			erro(problemas, onde, `acoes tem ${p.acoes.size()} linha(s); a peça tem ${p.area.w} × ${p.area.h}.`, "Uma linha de códigos por linha da peça, com um código por coluna.");
		}
	}
	if (p.acao !== undefined && p.acao.size() !== 1) {
		erro(problemas, onde, `acao "${p.acao}" não é um código de um caractere.`, "Use um código do Graal (3 senta, 4 cama cima, 5 cama baixo) ou acoes por linha.");
	}
	if (p.decorar) {
		if (p.decorar.formas.size() === 0) aviso(problemas, onde, "decorar sem formas: a peça não entra no inventário.", "Dê ao menos uma forma com uma variante, ou tire o decorar.");
		p.decorar.formas.forEach((forma, fi) => {
			if (forma.variantes.size() === 0) erro(problemas, onde, `forma ${fi + 1} sem variantes.`, "Cada forma tem ao menos uma variante com células.");
			forma.variantes.forEach((v, vi) => {
				const lugar = `${onde}, forma ${fi + 1}, variante ${vi + 1}`;
				if (v.celulas.size() === 0) erro(problemas, lugar, "sem células.", "Uma célula por tile da variante (dx, dy, coluna, linha, camada, acao, bloqueia).");
				for (const c of v.celulas) {
					if (celulaForaDaFolha(c)) {
						erro(problemas, lugar, `célula (${c.dx}, ${c.dy}) aponta o tile [${c.coluna}, ${c.linha}], fora da folha.`, "Tiles vão de [0, 0] a [127, 31].");
						break;
					}
				}
				for (const c of v.celulas) {
					if (c.dx < 0 || c.dy < 0 || c.dx >= v.w || c.dy >= v.h) {
						aviso(problemas, lugar, `célula (${c.dx}, ${c.dy}) fora de w × h = ${v.w} × ${v.h}.`, "Ajuste w e h ou o deslocamento da célula.");
						break;
					}
				}
				for (const id of v.fundos) {
					if (!fundoExiste(p.folha, id)) erro(problemas, lugar, `exige o fundo "${id}", que não existe na ${p.folha}.`, "Os ids são os de fundos.json da mesma folha.");
				}
				for (const c of v.celulas) {
					for (const id of c.fundos ?? []) {
						if (!fundoExiste(p.folha, id)) {
							erro(problemas, lugar, `a célula (${c.dx}, ${c.dy}) aceita o fundo "${id}", que não existe na ${p.folha}.`, "Os ids são os de fundos.json da mesma folha.");
						}
					}
				}
				if (v.encaixe && v.encaixe.tipo === "janela" && v.encaixe.papel === undefined) {
					aviso(problemas, lugar, "encaixe de janela sem papel (azul ou amarelo).", "A janela encaixa no papel de uma cor; sem papel, vale azul.");
				}
			});
		});
		if (TIPOS_QUE_PEDEM_FUNDO.includes(p.tipo) && !p.decorar.formas.some((f) => f.variantes.some((v) => v.fundos.size() > 0))) {
			aviso(problemas, onde, `tipo "${p.tipo}" sem nenhuma variante com fundo exigido.`, "Quadros e janelas encaixam no papel de parede (12.12, 12.14).");
		}
	}
}

function verificarFundo(f: Fundo, onde: string, folhasConhecidas: ReadonlySet<string>, problemas: Problema[]) {
	if (!folhasConhecidas.has(f.folha)) {
		erro(problemas, onde, `folha "${f.folha}" desconhecida.`, `As folhas são as de diorama/folhas (${[...folhasConhecidas].join(", ")}).`);
	}
	if (f.tiles.size() === 0) aviso(problemas, onde, "fundo sem tiles.", "Marque os tiles do fundo no Catálogo (clique na folha).");
	for (const tile of f.tiles) {
		if (tile < 0 || tile >= COLUNAS_DA_FOLHA * LINHAS_DA_FOLHA) {
			erro(problemas, onde, `tile ${tile} fora da folha.`, "Um tile de fundo é linha × 128 + coluna, de 0 a 4095.");
			break;
		}
	}
}

/** O conjunto de folhas conhecidas: as que a ponte lista, ou as do jogo quando a ponte não respondeu. */
export function folhasConhecidas(daPonte: string[] | undefined): ReadonlySet<string> {
	return new Set(daPonte !== undefined && daPonte.size() > 0 ? daPonte : ["casa", "castelo"]);
}
