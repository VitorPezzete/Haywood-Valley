// As regras do carimbo de peça do catálogo: fundos (12.14: exata, costura, conflito; a variante de menos conflitos;
// recusa com motivo) e encaixe de janela e quadro na parede (12.12: a coluna apontada, a altura tirada da parede do
// cômodo). Cópia de `fitOf`, `betterFit`, `planDecor`, `wallAt`, `sharedTop` e `topAbove` de src/shared/decor.ts,
// adaptada ao catálogo JSON da ponte (`GET /catalogo/pecas` e `/catalogo/fundos`) e ao modelo do bloco. O jogo e
// o plugin não se importam; mudar a regra num é mudar no outro.
//
// O catálogo é o do gerador (docs/diorama/GERADOR.md; a leitura está em ../catalogo/formato.ts): `normalizarCatalogo`
// transforma as peças em formas/variantes/células com os índices que `decorCatalog.ts` usa (as listas de tiles exatos
// e de tipos de fundo numeradas na ordem em que aparecem) e sintetiza uma variante de uma célula por tile para as
// peças sem `decorar` (móveis, baús, luzes, janelas, camas), com a ação de `acao`/`acoes` e o bloqueio da peça.
import { Catalogo as CatalogoLido, lerCatalogo, lerFundo, lerPeca, Peca as PecaCatalogo, tileNumero } from "../catalogo/formato";
import { CAMADA_TERRENO, empacotar, ModeloBloco } from "./bloco";
import { Historico } from "./historico";
import { gravar } from "./pinceis";
import { ehPiso, mesmoTile, Tile, zonaDoTile } from "./zonas";

// ------------------------------------------------------------------ o catálogo

export interface Fundo {
	folha: string;
	id: string;
	/** Tiles como linha × 128 + coluna. */
	tiles: number[];
}

/** [dx, dy, coluna, linha, camada, exige (1 + índice em exatos; 0 nada), tipos (1 + índice em conjuntos; 0 os da variante), ação, bloqueia]. */
export type CelulaPeca = [number, number, number, number, number, number, number, string, number];

export type Encaixe = [tipo: "quadro" | "janela", linha: number, papel?: "azul" | "amarelo"];

export interface VariantePeca {
	w: number;
	h: number;
	dx: number;
	dy: number;
	/** Índices em `fundos`. */
	types: number[];
	snap?: Encaixe;
	cells: CelulaPeca[];
}

export interface FormaPeca {
	facing?: number;
	variants: VariantePeca[];
}

export interface Peca {
	id: string;
	nome: string;
	folha: string;
	/** [coluna, linha, largura, altura] da miniatura na folha. */
	icone: [number, number, number, number];
	tipo: string;
	/** Camada sugerida (0 chão, 1 objeto, 2 frente). */
	camada: number;
	/** Aplica as regras de fundo e piso; paredes, pisos e fundos carimbam livres. */
	regras: boolean;
	forms: FormaPeca[];
}

export interface Catalogo {
	pecas: Peca[];
	fundos: Fundo[];
	exatos: number[][];
	conjuntos: number[][];
}

/** Os tipos de região que carimbam sem regra (são o próprio chão ou a própria parede). */
const TIPOS_LIVRES = new Set(["parede", "piso", "fundo", "chao", "chão", "vazio", "frente", "terreno", "agua", "água"]);

/**
 * Lê `GET /catalogo/pecas` e `GET /catalogo/fundos` no formato do gerador. Devolve o catálogo e os avisos (peças
 * ignoradas e por quê). A peça sem `decorar` ganha uma forma com uma variante de uma célula por tile da área.
 */
export function normalizarCatalogo(pecasJson: unknown, fundosJson: unknown): { catalogo: Catalogo; avisos: string[] } {
	const avisos = new Array<string>();
	const lidoFundos: CatalogoLido<ReturnType<typeof lerFundo> & defined> = lerCatalogo(fundosJson, "fundos", lerFundo);
	const lidoPecas: CatalogoLido<PecaCatalogo> = lerCatalogo(pecasJson, "pecas", lerPeca);
	if (lidoFundos.descartadas > 0) avisos.push(`${lidoFundos.descartadas} fundo(s) sem id ignorado(s).`);
	if (lidoPecas.descartadas > 0) avisos.push(`${lidoPecas.descartadas} peça(s) sem id ou área ignorada(s).`);
	const fundos: Fundo[] = lidoFundos.itens.map((f) => ({ folha: f.folha, id: f.id, tiles: [...f.tiles] }));

	// Um id de fundo existe nas duas folhas (vazio, taco, tapete_azul...): vale o da folha da peça; senão o primeiro.
	const indiceDoFundo = (id: string, folha: string): number | undefined => {
		const daFolha = fundos.findIndex((f) => f.id === id && f.folha === folha);
		if (daFolha >= 0) return daFolha;
		const qualquer = fundos.findIndex((f) => f.id === id);
		return qualquer >= 0 ? qualquer : undefined;
	};
	const indicesDeFundos = (ids: string[], folha: string, onde: string) => {
		const saida = new Array<number>();
		for (const id of ids) {
			const i = indiceDoFundo(id, folha);
			if (i !== undefined) saida.push(i);
			else avisos.push(`${onde}: fundo "${id}" não existe em fundos.json.`);
		}
		return saida;
	};

	// As listas de exatos e de conjuntos de tipos, numeradas na ordem em que aparecem (como decorar.mjs).
	const exatos = new Array<number[]>();
	const conjuntos = new Array<number[]>();
	const indiceExatos = new Map<string, number>();
	const indiceConjuntos = new Map<string, number>();
	const internar = (tabela: number[][], mapa: Map<string, number>, valores: number[]) => {
		const chave = valores.join(",");
		let n = mapa.get(chave);
		if (n === undefined) {
			tabela.push(valores);
			n = tabela.size();
			mapa.set(chave, n);
		}
		return n;
	};

	const pecas = new Array<Peca>();
	for (const p of lidoPecas.itens) {
		const forms = new Array<FormaPeca>();
		if (p.decorar) {
			for (const forma of p.decorar.formas) {
				const variants = new Array<VariantePeca>();
				for (const v of forma.variantes) {
					if (v.celulas.size() === 0) continue;
					const cells: CelulaPeca[] = v.celulas.map((c) => [
						c.dx,
						c.dy,
						c.coluna,
						c.linha,
						c.camada,
						c.exatos !== undefined ? internar(exatos, indiceExatos, c.exatos) : 0,
						c.fundos !== undefined ? internar(conjuntos, indiceConjuntos, indicesDeFundos(c.fundos, p.folha, p.id)) : 0,
						c.acao,
						c.bloqueia ? 1 : 0,
					]);
					const snap: Encaixe | undefined = v.encaixe ? [v.encaixe.tipo, v.encaixe.linha, v.encaixe.papel] : undefined;
					variants.push({ w: v.w, h: v.h, dx: v.dx, dy: v.dy, types: indicesDeFundos(v.fundos, p.folha, p.id), snap, cells });
				}
				if (variants.size() > 0) forms.push({ facing: forma.olhando, variants });
			}
		}
		if (forms.size() === 0) {
			// Sem Decorar: uma célula por tile da área, com a ação por célula (acoes) ou da peça (acao) e o bloqueio.
			const cells = new Array<CelulaPeca>();
			for (let j = 0; j < p.area.h; j++) {
				for (let i = 0; i < p.area.w; i++) {
					const linha = p.acoes?.[j];
					const codigo = linha !== undefined && linha.size() > i ? linha.sub(i + 1, i + 1) : (p.acao ?? ".");
					cells.push([i, j, p.area.c + i, p.area.l + j, p.camada, 0, 0, codigo, p.bloqueia === true ? 1 : 0]);
				}
			}
			forms.push({ variants: [{ w: p.area.w, h: p.area.h, dx: 0, dy: 0, types: [], cells }] });
		}
		const regras = !TIPOS_LIVRES.has(p.tipo.lower());
		pecas.push({
			id: p.id,
			nome: p.nome !== "" ? p.nome : p.id,
			folha: p.folha,
			icone: [p.area.c, p.area.l, p.area.w, p.area.h],
			tipo: p.tipo,
			camada: p.camada,
			regras,
			forms,
		});
	}
	return { catalogo: { pecas, fundos, exatos, conjuntos }, avisos };
}

export { tileNumero };

// ------------------------------------------------------------------ o fundo (fitOf, betterFit)

interface Encaixamento {
	exatas: number;
	costuras: number;
	conflitos: number;
	conferidas: number;
	achado?: Tile;
}

/** Os tipos de fundo (índices em `fundos`) do tile. */
export function tiposDoTile(cat: Catalogo, tile: Tile): number[] | undefined {
	const chave = tile[2] * 128 + tile[1];
	const saida = new Array<number>();
	cat.fundos.forEach((f, i) => {
		if (f.folha === tile[0] && f.tiles.includes(chave)) saida.push(i);
	});
	return saida.size() > 0 ? saida : undefined;
}

function nomeDoFundo(cat: Catalogo, indice: number | undefined) {
	const f = indice !== undefined ? cat.fundos[indice] : undefined;
	return f ? f.id : "outra coisa";
}

function encaixamentoDe(cat: Catalogo, peca: Peca, variante: VariantePeca, x: number, y: number, embaixo: (x: number, y: number) => Tile | undefined): Encaixamento {
	const e: Encaixamento = { exatas: 0, costuras: 0, conflitos: 0, conferidas: 0 };
	for (const cell of variante.cells) {
		const exige = cell[5];
		if (exige === 0) continue;
		const tile = embaixo(x + cell[0], y + cell[1]);
		if (!tile) continue;
		e.conferidas++;
		if (tile[0] === peca.folha && tile[1] === cell[2] && tile[2] === cell[3]) {
			e.exatas++;
			continue;
		}
		const exatos = cat.exatos[exige - 1];
		if (tile[0] === peca.folha && exatos !== undefined && exatos.includes(tile[2] * 128 + tile[1])) {
			e.exatas++;
			continue;
		}
		const aceitos = cell[6] > 0 ? (cat.conjuntos[cell[6] - 1] ?? []) : variante.types;
		const tipos = tiposDoTile(cat, tile);
		if (aceitos.size() === 0 || (tipos !== undefined && tipos.some((t) => aceitos.includes(t)))) {
			e.costuras++;
			continue;
		}
		e.conflitos++;
		if (!e.achado) e.achado = tile;
	}
	return e;
}

/** a encaixa melhor que b: menos conflitos, mais exatas, mais conferidas. */
function melhor(a: Encaixamento, b: Encaixamento) {
	if (a.conflitos !== b.conflitos) return a.conflitos < b.conflitos;
	if (a.exatas !== b.exatas) return a.exatas > b.exatas;
	return a.exatas + a.costuras > b.exatas + b.costuras;
}

// ------------------------------------------------------------------ a parede (wallAt, sharedTop, topAbove)

type T = Tile | undefined;
const em = (t: T, c0: number, l0: number, c1: number, l1: number) =>
	t !== undefined && t[0] === "casa" && t[1] >= c0 && t[1] <= c1 && t[2] >= l0 && t[2] <= l1;
const eh = (t: T, col: number, row: number) => em(t, col, row, col, row);
const ehTopo = (t: T) => em(t, 34, 25, 39, 25) || em(t, 41, 28, 42, 28);
const ehTopoChamine = (t: T) => em(t, 56, 25, 60, 25);
const ehChamine = (t: T) => em(t, 56, 25, 60, 31);
const ehPilar = (t: T) => em(t, 32, 24, 33, 31);
const ehLinhaDeCimaDentro = (t: T) => ehTopo(t) || ehTopoChamine(t) || em(t, 32, 25, 33, 25);
const ehCantoDeCima = (t: T) => eh(t, 40, 28) || eh(t, 43, 28);
const ehParedeDeBaixo = (t: T) => em(t, 41, 31, 42, 31);
const ehLinhaDeBaixo = (t: T) => ehParedeDeBaixo(t) || eh(t, 40, 31) || eh(t, 43, 31);
const ehVazio = (t: T) => eh(t, 0, 2) || em(t, 58, 16, 58, 18);
const ehPapelAzul = (t: T) => em(t, 34, 27, 36, 29) || em(t, 38, 27, 39, 29);
const ehPapelAmarelo = (t: T) => em(t, 54, 21, 55, 22);
const ehPapel = (t: T) => ehPapelAzul(t) || ehPapelAmarelo(t);
const ehFace = (t: T) => em(t, 34, 26, 39, 31) || (em(t, 54, 20, 56, 23) && !em(t, 54, 20, 55, 20));
const ehPontaDeParede = (t: T) => eh(t, 42, 30) || eh(t, 41, 29) || eh(t, 42, 29);

/** A peça de parede da célula: a da camada de objeto ou, sem ela, a do chão (as duas valem, 12.13). */
export function paredeEm(modelo: ModeloBloco, x: number, y: number) {
	return modelo.tile(1, x, y) ?? modelo.tile(0, x, y);
}

function topoDividido(modelo: ModeloBloco, x: number, y: number) {
	const parede = paredeEm(modelo, x, y);
	if (!ehParedeDeBaixo(parede) && !ehPontaDeParede(parede)) return false;
	const abaixo = paredeEm(modelo, x, y + 1);
	return ehFace(abaixo) || ehChamine(abaixo) || ehPilar(abaixo);
}

/** A linha do topo da parede de fundo acima da célula, ou nada se sair do cômodo antes. */
export function topoAcima(modelo: ModeloBloco, x: number, y: number): number | undefined {
	for (let linha = y; linha >= 0; linha--) {
		const parede = paredeEm(modelo, x, linha);
		if (ehLinhaDeCimaDentro(parede) || ehCantoDeCima(parede) || topoDividido(modelo, x, linha)) return linha;
		if (linha !== y && ehLinhaDeBaixo(parede)) return undefined;
		if (parede === undefined || ehVazio(parede)) return undefined;
	}
	return undefined;
}

// ------------------------------------------------------------------ pôr a peça (planDecor)

export interface Plano {
	ok: boolean;
	forma: number;
	variante: number;
	x: number;
	y: number;
	motivo?: string;
}

const FUNDOS_DE_PAREDE = new Set([
	"papel_azul",
	"poste",
	"viga",
	"lambri",
	"papel_amarelo",
	"lambri_amarelo",
	"parede_tabuas",
	"face_pedra",
	"topo_bege",
	"muralha_lado",
]);

function ehVarianteDeParede(cat: Catalogo, v: VariantePeca) {
	return v.types.size() > 0 && v.types.every((i) => FUNDOS_DE_PAREDE.has(cat.fundos[i]?.id ?? ""));
}

/** O canto da primeira variante para quem aponta (ax, ay): a peça fica centrada no ponto. */
export function cantoPara(v: VariantePeca, ax: number, ay: number): [number, number] {
	return [ax - math.floor((v.w - 1) / 2), ay - math.floor((v.h - 1) / 2)];
}

function nomes(cat: Catalogo, tipos: number[]) {
	const saida = new Array<string>();
	for (const t of tipos) if (saida.size() < 3) saida.push(nomeDoFundo(cat, t));
	return saida.join(", ");
}

/**
 * Onde e em que variante a peça fica para quem aponta a célula (ax, ay), ou por que não fica. Peça de parede
 * (com encaixe): cada variante encaixa pela regra dela; das que encaixam, a que combina melhor com o fundo, sem
 * recusar por ele. Peça do chão: a de menos conflitos; com conflito, recusa. Toda peça: dentro do bloco, não
 * sobre vazio, saída nem morador; célula sem exigência de fundo pede piso livre (ou a parede do tipo, se a peça é
 * de parede). Peça com `regras: false` só é centrada no ponto.
 */
export function planejarPeca(cat: Catalogo, modelo: ModeloBloco, peca: Peca, formaIndice: number, ax: number, ay: number): Plano {
	const forma = peca.forms[formaIndice] ?? peca.forms[0];
	const recusar = (motivo: string, x = ax, y = ay): Plano => ({ ok: false, forma: formaIndice, variante: 0, x, y, motivo });
	if (!forma) return recusar("a peça não tem formas.");
	if (!peca.regras) {
		const [cx, cy] = cantoPara(forma.variants[0], ax, ay);
		return { ok: true, forma: formaIndice, variante: 0, x: cx, y: cy };
	}
	const embaixo = (x: number, y: number) => modelo.topo(x, y);
	let escolhida: { variante: number; x: number; y: number; e: Encaixamento } | undefined;
	let erroEncaixe: string | undefined;
	let encaixou = false;
	forma.variants.forEach((variante, indice) => {
		const [cx, cy] = cantoPara(forma.variants[0], ax, ay);
		const x = cx + variante.dx;
		let y = cy + variante.dy;
		if (variante.snap) {
			encaixou = true;
			const [tipo, linha, papel] = variante.snap;
			const topo = topoAcima(modelo, ax, ay);
			if (topo === undefined) {
				erroEncaixe = erroEncaixe ?? `${peca.nome} vai na parede do fundo de um cômodo: aponte dentro de um cômodo.`;
				return;
			}
			y = topo + linha + variante.dy;
			for (const cell of variante.cells) {
				const tx = x + cell[0];
				const ty = y + cell[1];
				const atual = paredeEm(modelo, tx, ty);
				if (topoAcima(modelo, tx, ty) !== topo) {
					erroEncaixe = erroEncaixe ?? `${peca.nome} não passa de uma parede a outra.`;
					return;
				}
				const serve = tipo === "janela" ? (papel === "amarelo" ? ehPapelAmarelo(atual) : ehPapelAzul(atual)) : ehPapel(atual);
				if (!serve) {
					erroEncaixe =
						erroEncaixe ??
						(tipo === "janela" && ehPapel(atual)
							? `${peca.nome} pede papel ${papel ?? "azul"}; aqui o papel é de outra cor.`
							: `${peca.nome} só vai no papel de parede, nas 3 linhas sob a viga.`);
					return;
				}
			}
		}
		const e = encaixamentoDe(cat, peca, variante, x, y, embaixo);
		if (!escolhida || melhor(e, escolhida.e)) escolhida = { variante: indice, x, y, e };
	});
	const fim = escolhida as { variante: number; x: number; y: number; e: Encaixamento } | undefined;
	if (!fim) return recusar(erroEncaixe ?? `${peca.nome} só vai na parede.`);
	const variante = forma.variants[fim.variante];
	const deParede = ehVarianteDeParede(cat, variante);
	const { x, y } = fim;
	if (!encaixou && fim.e.conflitos > 0) {
		const achado = fim.e.achado ? tiposDoTile(cat, fim.e.achado)?.[0] : undefined;
		return recusar(`${peca.nome} precisa de ${nomes(cat, variante.types)}; aqui há ${nomeDoFundo(cat, achado)}.`, x, y);
	}
	for (const cell of variante.cells) {
		const cx = x + cell[0];
		const cy = y + cell[1];
		if (!modelo.dentro(cx, cy)) return recusar(`${peca.nome} sai do bloco.`, x, y);
		const tile = embaixo(cx, cy);
		if (!tile || ehVazio(tile)) return recusar(`${peca.nome} não vai sobre o vazio: pinte o chão antes.`, x, y);
		if (modelo.ehSaida(cx, cy)) return recusar(`${peca.nome} não vai sobre uma saída.`, x, y);
		if (modelo.ocupada(cx, cy)) return recusar(`${peca.nome} não vai sobre um morador.`, x, y);
		if (!encaixou && cell[5] === 0) {
			if (deParede) {
				const tipos = tiposDoTile(cat, tile);
				if (tipos === undefined || !tipos.some((t) => variante.types.includes(t))) {
					return recusar(`${peca.nome} precisa de ${nomes(cat, variante.types)}; aqui há ${nomeDoFundo(cat, tipos?.[0])}.`, x, y);
				}
			} else if (!modelo.pisoLivre(cx, cy)) {
				const topo = modelo.topo(cx, cy);
				const zona = topo ? zonaDoTile(topo) : undefined;
				return recusar(
					zona !== undefined && ehPiso(zona) ? `${peca.nome} pede piso livre: há algo em (${cx}, ${cy}).` : `${peca.nome} pede piso embaixo; em (${cx}, ${cy}) há ${zona ?? "nada"}.`,
					x,
					y,
				);
			}
		}
	}
	return { ok: true, forma: formaIndice, variante: fim.variante, x, y };
}

/** Grava a variante planejada no modelo (cada célula na camada dela) e registra no histórico. */
export function carimbarPeca(modelo: ModeloBloco, hist: Historico, peca: Peca, plano: Plano) {
	const forma = peca.forms[plano.forma] ?? peca.forms[0];
	const variante = forma?.variants[plano.variante];
	if (!variante) return;
	for (const cell of variante.cells) {
		const camada = cell[4] === CAMADA_TERRENO ? peca.camada : cell[4];
		gravar(modelo, hist, camada, plano.x + cell[0], plano.y + cell[1], empacotar(peca.folha, cell[2], cell[3]));
	}
}

/** As células da variante do plano como tiles relativos ao canto, para a fantasma do canvas. */
export function celulasDoPlano(peca: Peca, plano: Plano): Array<{ dx: number; dy: number; tile: Tile }> {
	const forma = peca.forms[plano.forma] ?? peca.forms[0];
	const variante = forma?.variants[plano.variante];
	if (!variante) return [];
	return variante.cells.map((c) => ({ dx: c[0], dy: c[1], tile: [peca.folha, c[2], c[3]] as Tile }));
}

export { mesmoTile };
