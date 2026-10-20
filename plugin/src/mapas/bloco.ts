// O modelo do bloco em edição (formato 1, docs/diorama/ARQUITETURA.md): 64 × 64 células, três camadas de tiles, a
// camada de terreno do exterior e os marcadores (nascimento, entradas, saídas, zonas, moradores). É um objeto
// mutável fora do Vide; quem o altera marca as células sujas e sobe a fonte de versão para o canvas redesenhar.
//
// As camadas guardam o tile empacotado num número (0 = célula vazia), para comparar e desfazer sem alocar tuplas;
// `desempacotar` devolve o `Tile`. O terreno guarda o código de cada célula ("" = nada).
import type { Bloco, Celula } from "../ponte";
import { ehPiso, FOLHAS_CONHECIDAS, Tile, TipoTile, tipoDoTile, VAZIO_COL, VAZIO_LINHA, zonaBloqueia, zonaDoTile } from "./zonas";

export const LADO = 64;
export const CELULAS = LADO * LADO;

/** As camadas de tiles, de baixo para cima; a 3 é o terreno do exterior (só nos pincéis e no canvas). */
export type CamadaTiles = 0 | 1 | 2;
export const CAMADA_TERRENO = 3;
export const NOMES_CAMADA = ["chao", "objeto", "frente", "terreno"] as const;
export const TITULOS_CAMADA = ["Chão", "Objeto", "Frente", "Terreno"] as const;

/**
 * Os códigos de terreno do exterior (12.7), os seis de diorama/catalogo/exterior.json (GERADOR.md, EXTERIOR.md), do
 * mais baixo ao mais alto: mar fundo, mar raso, areia, caminho, terra, grama. "" é célula sem terreno.
 */
export const TERRENOS: ReadonlyArray<{ codigo: string; nome: string; cor: Color3; tecla: string }> = [
	{ codigo: "", nome: "nada", cor: Color3.fromRGB(0, 0, 0), tecla: "0" },
	{ codigo: "m", nome: "mar fundo", cor: Color3.fromRGB(31, 79, 154), tecla: "M" },
	{ codigo: "r", nome: "mar raso", cor: Color3.fromRGB(79, 159, 216), tecla: "R" },
	{ codigo: "a", nome: "areia", cor: Color3.fromRGB(231, 215, 154), tecla: "A" },
	{ codigo: "c", nome: "caminho", cor: Color3.fromRGB(194, 160, 106), tecla: "C" },
	{ codigo: "t", nome: "terra", cor: Color3.fromRGB(134, 96, 58), tecla: "T" },
	{ codigo: "g", nome: "grama", cor: Color3.fromRGB(86, 158, 62), tecla: "G" },
];

/** Uma forma de 32 px carimbada no exterior (EXTERIOR.md): o plugin ainda não as edita, só preserva. */
export interface FormaExterior {
	x: number;
	y: number;
	painel: string;
	bx: number;
	by: number;
}

export function corDoTerreno(codigo: string): Color3 | undefined {
	if (codigo === "") return undefined;
	const t = TERRENOS.find((c) => c.codigo === codigo);
	return t ? t.cor : Color3.fromRGB(200, 60, 200);
}

// ------------------------------------------------------------------ tiles empacotados

/** As folhas conhecidas por índice; um nome novo (de um bloco salvo) entra no fim. */
const folhas = new Array<string>();
for (const nome of FOLHAS_CONHECIDAS) folhas.push(nome);

export function indiceDaFolha(nome: string) {
	const i = folhas.indexOf(nome);
	if (i >= 0) return i;
	folhas.push(nome);
	return folhas.size() - 1;
}

export function nomeDaFolha(indice: number) {
	return folhas[indice];
}

/** `(folha × 32 + linha) × 128 + coluna + 1`; 0 é a célula vazia. */
export function empacotar(folha: string, col: number, row: number): number {
	return (indiceDaFolha(folha) * 32 + row) * 128 + col + 1;
}

export function empacotarTile(tile: Tile) {
	return empacotar(tile[0], tile[1], tile[2]);
}

export function desempacotar(codigo: number): Tile | undefined {
	if (codigo <= 0) return undefined;
	const v = codigo - 1;
	const col = v % 128;
	const row = math.floor(v / 128) % 32;
	const folha = folhas[math.floor(v / 4096)];
	if (folha === undefined) return undefined;
	return [folha, col, row];
}

// ------------------------------------------------------------------ marcadores

export interface Entrada {
	nome: string;
	x: number;
	y: number;
}

export interface Saida {
	x: number;
	y: number;
	largura: number;
	altura: number;
	mapa: string;
	/** O nome de uma entrada de lá, uma célula [x, y] de lá, ou nada. */
	chegada?: string | [number, number];
}

export interface ZonaMapa {
	nome: string;
	/** Retângulos [x0, y0, x1, y1] inclusivos. */
	areas: Array<[number, number, number, number]>;
	props: Record<string, string>;
}

export type Pose = "idle" | "sit" | "lie";

export interface Morador {
	nome: string;
	x: number;
	y: number;
	olhando: number;
	visual: string;
	pose: Pose;
}

export interface Marcadores {
	nascimento?: [number, number];
	entradas: Entrada[];
	saidas: Saida[];
	zonas: ZonaMapa[];
	moradores: Morador[];
}

export function marcadoresVazios(): Marcadores {
	return { entradas: [], saidas: [], zonas: [], moradores: [] };
}

/** Cópia profunda dos marcadores (para o histórico). */
export function copiarMarcadores(m: Marcadores): Marcadores {
	return {
		nascimento: m.nascimento ? [m.nascimento[0], m.nascimento[1]] : undefined,
		entradas: m.entradas.map((e) => ({ nome: e.nome, x: e.x, y: e.y })),
		saidas: m.saidas.map((s) => ({
			x: s.x,
			y: s.y,
			largura: s.largura,
			altura: s.altura,
			mapa: s.mapa,
			chegada: typeIs(s.chegada, "table") ? [s.chegada[0], s.chegada[1]] : s.chegada,
		})),
		zonas: m.zonas.map((z) => {
			const props: Record<string, string> = {};
			for (const [k, v] of pairs(z.props)) props[k] = v;
			return { nome: z.nome, areas: z.areas.map((a) => [a[0], a[1], a[2], a[3]] as [number, number, number, number]), props };
		}),
		moradores: m.moradores.map((r) => ({ nome: r.nome, x: r.x, y: r.y, olhando: r.olhando, visual: r.visual, pose: r.pose })),
	};
}

// ------------------------------------------------------------------ o modelo

const inteiro = (v: unknown, minimo: number, maximo: number): number | undefined => {
	if (!typeIs(v, "number") || v !== math.floor(v) || v < minimo || v > maximo) return undefined;
	return v;
};

export class ModeloBloco {
	mapa: string;
	bloco: [number, number] = [0, 0];
	vazio: Tile = ["casa", VAZIO_COL, VAZIO_LINHA];
	/** Três camadas de 4096 tiles empacotados (0 = nada). */
	readonly camadas: [number[], number[], number[]];
	/** 4096 códigos de terreno ("" = nada). */
	readonly terreno: string[];
	decalques: Array<{ x: number; y: number; id: string }> = [];
	/** As formas de 32 px do exterior: preservadas como vieram (o editor ainda não as carimba). */
	formas: FormaExterior[] = [];
	/** Os recortes crus que o importador guardou quando a grade dupla não explicou o mapa: só preservados. */
	exteriorImportado?: { runs_importados: unknown; caixa_importada: unknown };
	/** Ajustes de bloqueio à mão sobre o derivado: preservados como vieram. */
	bloqueios?: { mais?: Array<[number, number]>; menos?: Array<[number, number]> };
	/** Ajustes de ação à mão ([x, y, código]): preservados como vieram. */
	acoes?: Array<[number, number, string]>;
	marcadores: Marcadores = marcadoresVazios();
	/**
	 * O carimbo (hash) e o hash do conteúdo como vieram do disco. Voltam no salvamento: o gerador confere se o
	 * conteúdo ainda bate com `carimbo_conteudo` e, se não, calcula um carimbo novo e regrava o bloco (GERADOR.md).
	 */
	carimboLido?: string;
	carimboConteudoLido?: string;
	/** Anotações do autor (`nota`, `notas`), que não entram no hash: preservadas. */
	nota?: unknown;
	notas?: unknown;

	/** Células que mudaram desde o último redesenho (índices), ou tudo. */
	readonly sujos = new Set<number>();
	tudoSujo = true;

	constructor(mapa: string) {
		this.mapa = mapa;
		const nova = () => {
			const a = new Array<number>(CELULAS);
			for (let i = 0; i < CELULAS; i++) a[i] = 0;
			return a;
		};
		this.camadas = [nova(), nova(), nova()];
		this.terreno = new Array<string>(CELULAS);
		for (let i = 0; i < CELULAS; i++) this.terreno[i] = "";
	}

	static novo(mapa: string) {
		return new ModeloBloco(mapa);
	}

	/** Lê um bloco do formato 1. O que não está no formato é ignorado; célula fora de 0–63 é descartada. */
	static deJson(json: Bloco): ModeloBloco {
		const m = new ModeloBloco(typeIs(json.mapa, "string") ? json.mapa : "");
		if (typeIs(json.bloco, "table")) {
			m.bloco = [inteiro(json.bloco[0], 0, 1e6) ?? 0, inteiro(json.bloco[1], 0, 1e6) ?? 0];
		}
		if (typeIs(json.vazio, "table") && typeIs(json.vazio[0], "string")) {
			m.vazio = [json.vazio[0], inteiro(json.vazio[1], 0, 127) ?? VAZIO_COL, inteiro(json.vazio[2], 0, 31) ?? VAZIO_LINHA];
		}
		const camadas = typeIs(json.camadas, "table") ? json.camadas : {};
		const ler = (lista: Celula[] | undefined, camada: CamadaTiles) => {
			if (!typeIs(lista, "table")) return;
			for (const c of lista) {
				if (!typeIs(c, "table")) continue;
				const x = inteiro(c[0], 0, LADO - 1);
				const y = inteiro(c[1], 0, LADO - 1);
				const col = inteiro(c[3], 0, 127);
				const row = inteiro(c[4], 0, 31);
				if (x === undefined || y === undefined || col === undefined || row === undefined || !typeIs(c[2], "string")) continue;
				m.camadas[camada][y * LADO + x] = empacotar(c[2], col, row);
			}
		};
		ler(camadas.chao, 0);
		ler(camadas.objeto, 1);
		ler(camadas.frente, 2);
		if (typeIs(json.exterior, "table")) {
			const terreno = json.exterior.terreno;
			if (typeIs(terreno, "table")) {
				if (terreno.size() === LADO) {
					// 64 linhas de 64 códigos, "." para nada (o formato de GERADOR.md e do importador).
					for (let y = 0; y < LADO; y++) {
						const linha = terreno[y];
						if (!typeIs(linha, "string")) continue;
						for (let x = 0; x < LADO; x++) {
							const c = linha.sub(x + 1, x + 1);
							m.terreno[y * LADO + x] = c === "." || c === "" ? "" : c;
						}
					}
				} else {
					// A lista de 64 × 64 códigos em ordem de leitura, "" (ou ".") para nada.
					for (let i = 0; i < CELULAS; i++) {
						const v = terreno[i];
						m.terreno[i] = typeIs(v, "string") && v !== "." ? v : "";
					}
				}
			}
			if (typeIs(json.exterior.decalques, "table")) {
				for (const d of json.exterior.decalques) {
					if (typeIs(d, "table") && typeIs(d.id, "string")) {
						const x = inteiro(d.x, 0, LADO - 1);
						const y = inteiro(d.y, 0, LADO - 1);
						if (x !== undefined && y !== undefined) m.decalques.push({ x, y, id: d.id });
					}
				}
			}
			if (typeIs(json.exterior.formas, "table")) {
				for (const f of json.exterior.formas) {
					if (!typeIs(f, "table") || !typeIs(f.painel, "string")) continue;
					const x = inteiro(f.x, -1, LADO);
					const y = inteiro(f.y, -1, LADO);
					if (x !== undefined && y !== undefined) m.formas.push({ x, y, painel: f.painel, bx: inteiro(f.bx, 0, 1e6) ?? 0, by: inteiro(f.by, 0, 1e6) ?? 0 });
				}
			}
			if (json.exterior.runs_importados !== undefined) {
				m.exteriorImportado = { runs_importados: json.exterior.runs_importados, caixa_importada: json.exterior.caixa_importada };
			}
		}
		if (typeIs(json.bloqueios, "table")) m.bloqueios = json.bloqueios;
		if (typeIs(json.acoes, "table")) m.acoes = json.acoes;
		if (json.nota !== undefined) m.nota = json.nota;
		if (json.notas !== undefined) m.notas = json.notas;
		if (typeIs(json.nascimento, "table")) {
			const x = inteiro(json.nascimento[0], 0, LADO - 1);
			const y = inteiro(json.nascimento[1], 0, LADO - 1);
			if (x !== undefined && y !== undefined) m.marcadores.nascimento = [x, y];
		}
		if (typeIs(json.entradas, "table")) {
			for (const e of json.entradas) {
				if (!typeIs(e, "table")) continue;
				const x = inteiro(e.x, 0, LADO - 1);
				const y = inteiro(e.y, 0, LADO - 1);
				if (x !== undefined && y !== undefined) m.marcadores.entradas.push({ nome: typeIs(e.nome, "string") ? e.nome : "entrada", x, y });
			}
		}
		if (typeIs(json.saidas, "table")) {
			for (const s of json.saidas) {
				if (!typeIs(s, "table")) continue;
				const x = inteiro(s.x, 0, LADO - 1);
				const y = inteiro(s.y, 0, LADO - 1);
				if (x === undefined || y === undefined) continue;
				let chegada: Saida["chegada"];
				if (typeIs(s.chegada, "string")) chegada = s.chegada;
				else if (typeIs(s.chegada, "table")) {
					const t = s.chegada as unknown[];
					const cx = inteiro(t[0], 0, LADO - 1);
					const cy = inteiro(t[1], 0, LADO - 1);
					if (cx !== undefined && cy !== undefined) chegada = [cx, cy];
				}
				m.marcadores.saidas.push({
					x,
					y,
					largura: inteiro(s.largura, 1, LADO) ?? 1,
					altura: inteiro(s.altura, 1, LADO) ?? 1,
					mapa: typeIs(s.mapa, "string") ? s.mapa : "",
					chegada,
				});
			}
		}
		if (typeIs(json.zonas, "table")) {
			for (const z of json.zonas) {
				if (!typeIs(z, "table")) continue;
				const areas = new Array<[number, number, number, number]>();
				if (typeIs(z.areas, "table")) {
					for (const a of z.areas) {
						if (!typeIs(a, "table")) continue;
						const x0 = inteiro(a[0], 0, LADO - 1);
						const y0 = inteiro(a[1], 0, LADO - 1);
						const x1 = inteiro(a[2], 0, LADO - 1);
						const y1 = inteiro(a[3], 0, LADO - 1);
						if (x0 !== undefined && y0 !== undefined && x1 !== undefined && y1 !== undefined) areas.push([x0, y0, x1, y1]);
					}
				}
				const props: Record<string, string> = {};
				if (typeIs(z.props, "table")) {
					for (const [k, v] of pairs(z.props as Record<string, unknown>)) {
						if (typeIs(k, "string")) props[k] = tostring(v);
					}
				}
				m.marcadores.zonas.push({ nome: typeIs(z.nome, "string") ? z.nome : "", areas, props });
			}
		}
		if (typeIs(json.moradores, "table")) {
			for (const r of json.moradores) {
				if (!typeIs(r, "table")) continue;
				const x = inteiro(r.x, 0, LADO - 1);
				const y = inteiro(r.y, 0, LADO - 1);
				if (x === undefined || y === undefined) continue;
				const pose = r.pose === "sit" || r.pose === "lie" ? r.pose : "idle";
				m.marcadores.moradores.push({
					nome: typeIs(r.nome, "string") ? r.nome : "",
					x,
					y,
					olhando: inteiro(r.olhando, 0, 3) ?? 2,
					visual: typeIs(r.visual, "string") ? r.visual : "",
					pose,
				});
			}
		}
		if (typeIs(json.carimbo, "string")) m.carimboLido = json.carimbo;
		if (typeIs(json.carimbo_conteudo, "string")) m.carimboConteudoLido = json.carimbo_conteudo;
		m.tudoSujo = true;
		return m;
	}

	/**
	 * O bloco no formato 1, pronto para `PUT /mapas/<id>/blocos/<bx>_<by>`. Grava o que leu do jeito que o importador
	 * grava (folhas em ordem alfabética, listas vazias de fora, `carimbo` e `carimbo_conteudo` como vieram), para um
	 * bloco aberto e salvo sem mudança dar o mesmo módulo no gerador. O terreno sai como a lista de 64 × 64 códigos
	 * ("" = nada); a ponte e o gerador aceitam as duas formas de GERADOR.md.
	 */
	paraJson(): Bloco {
		const lista = (camada: CamadaTiles) => {
			const saida = new Array<Celula>();
			const dados = this.camadas[camada];
			for (let i = 0; i < CELULAS; i++) {
				const tile = desempacotar(dados[i]);
				if (tile) saida.push([i % LADO, math.floor(i / LADO), tile[0], tile[1], tile[2]]);
			}
			return saida;
		};
		const bloco: Bloco = {
			versao: 1,
			mapa: this.mapa,
			bloco: [this.bloco[0], this.bloco[1]],
			folhas: this.folhasUsadas(),
			vazio: [this.vazio[0], this.vazio[1], this.vazio[2]],
			camadas: { chao: lista(0), objeto: lista(1), frente: lista(2) },
		};
		if (this.exteriorImportado) {
			bloco.exterior = { runs_importados: this.exteriorImportado.runs_importados, caixa_importada: this.exteriorImportado.caixa_importada };
		} else if (this.temTerreno() || this.decalques.size() > 0 || this.formas.size() > 0) {
			const terreno = new Array<string>(CELULAS);
			for (let i = 0; i < CELULAS; i++) terreno[i] = this.terreno[i];
			const exterior: NonNullable<Bloco["exterior"]> = { terreno };
			if (this.decalques.size() > 0) exterior.decalques = this.decalques.map((d) => ({ x: d.x, y: d.y, id: d.id }));
			if (this.formas.size() > 0) exterior.formas = this.formas.map((f) => ({ x: f.x, y: f.y, painel: f.painel, bx: f.bx, by: f.by }));
			bloco.exterior = exterior;
		}
		if (this.bloqueios) bloco.bloqueios = this.bloqueios;
		if (this.acoes) bloco.acoes = this.acoes;
		const m = this.marcadores;
		if (m.nascimento) bloco.nascimento = [m.nascimento[0], m.nascimento[1]];
		if (m.entradas.size() > 0) bloco.entradas = m.entradas.map((e) => ({ nome: e.nome, x: e.x, y: e.y }));
		if (m.saidas.size() > 0) {
			bloco.saidas = m.saidas.map((s) => {
				const saida: Saida = { x: s.x, y: s.y, largura: s.largura, altura: s.altura, mapa: s.mapa };
				if (s.chegada !== undefined) saida.chegada = typeIs(s.chegada, "table") ? [s.chegada[0], s.chegada[1]] : s.chegada;
				return saida;
			});
		}
		if (m.zonas.size() > 0) bloco.zonas = m.zonas.map((z) => ({ nome: z.nome, areas: z.areas, props: z.props }));
		if (m.moradores.size() > 0) bloco.moradores = m.moradores;
		if (this.carimboLido !== undefined) bloco.carimbo = this.carimboLido;
		if (this.carimboConteudoLido !== undefined) bloco.carimbo_conteudo = this.carimboConteudoLido;
		if (this.nota !== undefined) bloco.nota = this.nota;
		if (this.notas !== undefined) bloco.notas = this.notas;
		return bloco;
	}

	/** As folhas que o bloco usa (a do vazio e as das três camadas), em ordem alfabética, como o importador grava. */
	folhasUsadas() {
		const usadas = [this.vazio[0]];
		for (const camada of this.camadas) {
			for (let i = 0; i < CELULAS; i++) {
				const codigo = camada[i];
				if (codigo === 0) continue;
				const nome = nomeDaFolha(math.floor((codigo - 1) / 4096));
				if (nome !== undefined && !usadas.includes(nome)) usadas.push(nome);
			}
		}
		usadas.sort((a, b) => a < b);
		return usadas;
	}

	temTerreno() {
		for (let i = 0; i < CELULAS; i++) if (this.terreno[i] !== "") return true;
		return false;
	}

	// ------------------------------------------------------------------ células

	indice(x: number, y: number) {
		return y * LADO + x;
	}

	dentro(x: number, y: number) {
		return x >= 0 && y >= 0 && x < LADO && y < LADO;
	}

	/** O valor cru de uma camada: tile empacotado (0–2) ou código de terreno (3). */
	obter(camada: number, indice: number): number | string {
		return camada === CAMADA_TERRENO ? this.terreno[indice] : this.camadas[camada as CamadaTiles][indice];
	}

	/** Grava o valor cru e marca a célula suja. Não registra no histórico: isso é de quem chama (pinceis.ts). */
	definir(camada: number, indice: number, valor: number | string) {
		if (camada === CAMADA_TERRENO) this.terreno[indice] = typeIs(valor, "string") ? valor : "";
		else this.camadas[camada as CamadaTiles][indice] = typeIs(valor, "number") ? valor : 0;
		this.sujos.add(indice);
	}

	codigo(camada: CamadaTiles, x: number, y: number) {
		return this.dentro(x, y) ? this.camadas[camada][y * LADO + x] : 0;
	}

	tile(camada: CamadaTiles, x: number, y: number): Tile | undefined {
		return desempacotar(this.codigo(camada, x, y));
	}

	/** O tile de cima da célula: frente, senão objeto, senão chão (12.2). */
	topo(x: number, y: number): Tile | undefined {
		return this.tile(2, x, y) ?? this.tile(1, x, y) ?? this.tile(0, x, y);
	}

	/** Bloqueia o passo (12.8): fora do bloco, ou tile de cima em zona `vazio`/`bloqueia`, ou célula de morador. */
	bloqueia(x: number, y: number) {
		if (!this.dentro(x, y)) return true;
		if (this.bloqueios?.menos?.some((c) => c[0] === x && c[1] === y)) return false;
		if (this.bloqueios?.mais?.some((c) => c[0] === x && c[1] === y)) return true;
		const topo = this.topo(x, y);
		if (!topo) return false;
		return zonaBloqueia(zonaDoTile(topo));
	}

	/** O tipo de tile do Graal da célula, pelo tile de cima. */
	tipo(x: number, y: number): TipoTile {
		const topo = this.topo(x, y);
		return topo ? tipoDoTile(topo) : 0;
	}

	/** Piso livre: dentro, não bloqueia, tipo 0, zona de piso, sem morador. */
	pisoLivre(x: number, y: number) {
		if (this.bloqueia(x, y) || this.tipo(x, y) !== 0 || this.ocupada(x, y)) return false;
		const topo = this.topo(x, y);
		return topo !== undefined && ehPiso(zonaDoTile(topo));
	}

	ehSaida(x: number, y: number) {
		return this.marcadores.saidas.some((s) => x >= s.x && x < s.x + s.largura && y >= s.y && y < s.y + s.altura);
	}

	/** Há morador na célula. */
	ocupada(x: number, y: number) {
		return this.marcadores.moradores.some((r) => r.x === x && r.y === y);
	}

	/** O retângulo pintado (caixa das três camadas e do terreno), ou nada quando o bloco está vazio. */
	retanguloPintado(): [x: number, y: number, largura: number, altura: number] | undefined {
		let x0 = LADO;
		let y0 = LADO;
		let x1 = -1;
		let y1 = -1;
		for (let i = 0; i < CELULAS; i++) {
			if (this.camadas[0][i] === 0 && this.camadas[1][i] === 0 && this.camadas[2][i] === 0 && this.terreno[i] === "") continue;
			const x = i % LADO;
			const y = math.floor(i / LADO);
			if (x < x0) x0 = x;
			if (y < y0) y0 = y;
			if (x > x1) x1 = x;
			if (y > y1) y1 = y;
		}
		if (x1 < 0) return undefined;
		return [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
	}
}

/** Id de mapa válido para a ponte: letras minúsculas, números e `_`. */
export function idValido(id: string) {
	return id.size() > 0 && id.size() <= 64 && id.match("^[a-z0-9_]+$")[0] !== undefined;
}

/** Nome de entrada válido (12.17): letras minúsculas, números, `-` e `_`. */
export function nomeEntradaValido(nome: string) {
	return nome.size() > 0 && nome.match("^[a-z0-9_%-]+$")[0] !== undefined;
}

/** Avisos antes de salvar (12.10, 12.17, 12.20). Não impedem o salvamento. */
export function avisosDoBloco(m: ModeloBloco, mapasConhecidos: ReadonlyArray<string>): string[] {
	const avisos = new Array<string>();
	const n = m.marcadores.nascimento;
	if (!n) avisos.push("sem nascimento (o jogo cai em [0, 0]).");
	else if (m.bloqueia(n[0], n[1])) avisos.push(`nascimento em (${n[0]}, ${n[1]}) bloqueado.`);
	for (const e of m.marcadores.entradas) {
		if (!nomeEntradaValido(e.nome)) avisos.push(`entrada "${e.nome}": nome só com minúsculas, números, - e _.`);
		if (m.bloqueia(e.x, e.y)) avisos.push(`entrada "${e.nome}" em (${e.x}, ${e.y}) bloqueada.`);
	}
	m.marcadores.saidas.forEach((s, i) => {
		if (s.x + s.largura > LADO || s.y + s.altura > LADO) avisos.push(`saída ${i + 1} sai do bloco.`);
		if (s.mapa === "") avisos.push(`saída ${i + 1} sem mapa de destino.`);
		else if (mapasConhecidos.size() > 0 && !mapasConhecidos.includes(s.mapa)) avisos.push(`saída ${i + 1}: o mapa "${s.mapa}" não existe no Diorama.`);
	});
	m.marcadores.zonas.forEach((z, i) => {
		if (z.nome === "") avisos.push(`zona ${i + 1} sem nome.`);
		if (z.areas.size() === 0) avisos.push(`zona "${z.nome}" sem áreas.`);
	});
	const celulas = new Set<number>();
	for (const r of m.marcadores.moradores) {
		if (r.visual === "") avisos.push(`morador "${r.nome}" sem visual.`);
		if (m.bloqueia(r.x, r.y)) avisos.push(`morador "${r.nome}" em (${r.x}, ${r.y}) bloqueado.`);
		const chave = r.y * LADO + r.x;
		if (celulas.has(chave)) avisos.push(`dois moradores em (${r.x}, ${r.y}).`);
		celulas.add(chave);
		if (r.pose === "lie") {
			const tipo = m.tipo(r.x, r.y);
			if (tipo !== 4 && tipo !== 5) avisos.push(`morador "${r.nome}" deitado fora de uma cama.`);
		}
		if (r.pose === "sit" && m.tipo(r.x, r.y) !== 3) avisos.push(`morador "${r.nome}" sentado fora de um assento.`);
	}
	return avisos;
}
