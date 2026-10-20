// O exterior de um bloco (grama, caminho, areia, mar) na grade dupla de 16 px: do `exterior` do bloco JSON para os
// recortes `terrain.runs` que o jogo desenha, e o caminho de volta (o importador). A engenharia reversa está em
// docs/diorama/EXTERIOR.md; o layout das folhas, em diorama/catalogo/exterior.json.
//
// Convenção da grade dupla (palpite, ver EXTERIOR.md): o tile desenhado na célula (x, y) do bloco mostra, nos seus
// quatro quadrantes, as células de terreno (x, y), (x + 1, y), (x, y + 1) e (x + 1, y + 1). A base do tile é o terreno
// mais baixo entre os quadrantes pintados; cada terreno mais alto presente vira uma camada de junção por cima, com a
// máscara dos quadrantes em que ele está. Célula carimbada com uma forma de 32 px fica fora da grade dupla.
import { lerCatalogo } from "./catalogo.mjs";
import { corChapadaEm, TILE } from "./folhas.mjs";
import { juntarCelulas } from "./juntar.mjs";

export const LADO_BLOCO = 64;
/** O miolo de um recorte de uma cor só que o jogo estica: 8 × 8 a 4 px da borda (`FLAT_INSET` de interior.ts). */
const MIOLO = 4;
const MIOLO_LADO = 8;
const QUADRANTES = [
	[0, 0],
	[1, 0],
	[0, 1],
	[1, 1],
];

function catalogo() {
	return lerCatalogo("exterior");
}

function terreno(codigo) {
	const t = catalogo().terrenos[codigo];
	if (!t) throw new Error(`terreno desconhecido no exterior: "${codigo}"`);
	return t;
}

function terrenoPorNivel(nivel) {
	for (const [codigo, t] of Object.entries(catalogo().terrenos)) if (t.nivel === nivel) return codigo;
	return undefined;
}

function terrenoPorBase(linha) {
	for (const [codigo, t] of Object.entries(catalogo().terrenos)) if (t.base === linha) return codigo;
	return undefined;
}

function juncao(sobre, sob) {
	return catalogo().juncoes.find((j) => j.sobre === sobre && j.sob === sob);
}

/** A variante do padrão de 2 × 2 na célula (x, y) do bloco: a coluna da base e a linha da junção. */
export function variante(x, y) {
	return (((y % 2) + 2) % 2) * 2 + (((x % 2) + 2) % 2);
}

/** Lê `exterior.terreno` do bloco (64 linhas de 64 códigos, ou a lista de 64 × 64 códigos) numa grade [y][x]. */
export function lerTerreno(terreno) {
	const grade = Array.from({ length: LADO_BLOCO }, () => Array(LADO_BLOCO).fill(""));
	if (!terreno) return grade;
	if (terreno.length === LADO_BLOCO * LADO_BLOCO) {
		for (let y = 0; y < LADO_BLOCO; y++) {
			for (let x = 0; x < LADO_BLOCO; x++) {
				const c = terreno[y * LADO_BLOCO + x];
				grade[y][x] = c === "." ? "" : c;
			}
		}
		return grade;
	}
	if (terreno.length !== LADO_BLOCO) throw new Error(`exterior.terreno precisa de ${LADO_BLOCO} linhas (veio ${terreno.length})`);
	terreno.forEach((linha, y) => {
		if (linha.length !== LADO_BLOCO) throw new Error(`exterior.terreno, linha ${y}: ${LADO_BLOCO} códigos (veio ${linha.length})`);
		for (let x = 0; x < LADO_BLOCO; x++) grade[y][x] = linha[x] === "." ? "" : linha[x];
	});
	return grade;
}

export function escreverTerreno(grade) {
	return grade.map((linha) => linha.map((c) => (c === "" ? "." : c)).join(""));
}

/**
 * Compõe o exterior do bloco: devolve as células com terreno (chave "x,y" do bloco → a pilha de recortes de baixo
 * para cima) e os quadrantes de cada uma (os códigos de terreno, "" sem pintura), para o bloqueio e as ações.
 * Cada recorte: { imagem (índice de `imagens`), sx, sy, quadros, dx, dy }.
 */
export function comporExterior(exterior) {
	const cat = catalogo();
	const grade = lerTerreno(exterior.terreno);
	const celulas = new Map();
	const quadrantesDe = new Map();
	const avisos = [];

	// As formas de 32 px carimbadas: cada bloco do painel ocupa 2 × 2 células, que ficam fora da grade dupla.
	const formas = new Map();
	for (const forma of exterior.formas ?? []) {
		const painel = cat.formas[forma.painel];
		if (!painel) throw new Error(`forma desconhecida no exterior: "${forma.painel}"`);
		for (const [qx, qy] of QUADRANTES) {
			formas.set(`${forma.x + qx},${forma.y + qy}`, {
				imagem: cat.imagens.indexOf("forma_equipe_32"),
				sx: painel.x + forma.bx * 2 * TILE + qx * TILE,
				sy: painel.y + forma.by * 2 * TILE + qy * TILE,
				quadros: 1,
				dx: 0,
				dy: 0,
			});
		}
	}

	const imagemJuncao = cat.imagens.indexOf("folha_juncao");
	for (let y = -1; y < LADO_BLOCO; y++) {
		for (let x = -1; x < LADO_BLOCO; x++) {
			const chave = `${x},${y}`;
			const forma = formas.get(chave);
			const quadrantes = QUADRANTES.map(([qx, qy]) => {
				const cx = x + qx;
				const cy = y + qy;
				return cx >= 0 && cy >= 0 && cx < LADO_BLOCO && cy < LADO_BLOCO ? grade[cy][cx] : "";
			});
			const pintados = quadrantes.filter((c) => c !== "");
			if (forma) {
				celulas.set(chave, [forma]);
				quadrantesDe.set(chave, quadrantes);
				continue;
			}
			if (pintados.length === 0) continue;
			if (x < 0 || y < 0) {
				avisos.push(`terreno pintado na borda do bloco: o tile (${x}, ${y}) fica fora dele`);
				continue;
			}
			const niveis = [...new Set(pintados.map((c) => terreno(c).nivel))].sort((a, b) => a - b);
			const base = terrenoPorNivel(niveis[0]);
			const v = variante(x, y);
			const pilha = [{ imagem: imagemJuncao, sx: v * TILE, sy: terreno(base).base * TILE, quadros: 1, dx: 0, dy: 0 }];
			for (let n = 1; n < niveis.length; n++) {
				const sobre = terrenoPorNivel(niveis[n]);
				const sob = terrenoPorNivel(niveis[n - 1]);
				const j = juncao(sobre, sob);
				if (!j) {
					avisos.push(`sem junção de ${terreno(sobre).nome} sobre ${terreno(sob).nome} no catálogo: o encontro em (${x}, ${y}) fica sem borda`);
					continue;
				}
				let mascara = 0;
				quadrantes.forEach((c, q) => {
					if (c !== "" && terreno(c).nivel >= niveis[n]) mascara |= 1 << q;
				});
				pilha.push({
					imagem: imagemJuncao,
					sx: mascara * TILE,
					sy: (j.linha + v) * TILE,
					quadros: j.quadros ?? 1,
					dx: j.dx ?? 0,
					dy: j.dy ?? 0,
				});
			}
			celulas.set(chave, pilha);
			quadrantesDe.set(chave, quadrantes);
		}
	}

	// Os decalques, por cima de tudo o que a célula tem (a mesma camada para as células de um decalque).
	for (const decalque of exterior.decalques ?? []) {
		const def = cat.decalques[decalque.id];
		if (!def) throw new Error(`decalque desconhecido no exterior: "${decalque.id}"`);
		let camada = 1;
		for (let j = 0; j < def.h; j++) {
			for (let i = 0; i < def.w; i++) {
				const pilha = celulas.get(`${decalque.x + i},${decalque.y + j}`);
				if (pilha) camada = Math.max(camada, pilha.length);
			}
		}
		for (let j = 0; j < def.h; j++) {
			for (let i = 0; i < def.w; i++) {
				const chave = `${decalque.x + i},${decalque.y + j}`;
				const pilha = celulas.get(chave) ?? [];
				while (pilha.length < camada) pilha.push(undefined);
				pilha.push({
					imagem: imagemJuncao,
					sx: def.sx + i * TILE,
					sy: def.sy + j * TILE,
					quadros: def.quadros ?? 1,
					dx: def.dx ?? 0,
					dy: def.dy ?? 0,
				});
				celulas.set(chave, pilha);
			}
		}
	}
	return { celulas, quadrantesDe, avisos };
}

/** Os códigos de ação de uma célula com terreno: `.` com terra, senão o do terreno mais alto entre os quadrantes. */
export function acaoDoTerreno(quadrantes) {
	let melhor;
	for (const c of quadrantes) {
		if (c === "") continue;
		if (!melhor || terreno(c).nivel > terreno(melhor).nivel) melhor = c;
	}
	return melhor ? terreno(melhor).acao : ".";
}

/** A caixa das células com terreno: { x, y, width, height } ou undefined. */
export function caixaDasCelulas(celulas) {
	let x0 = Infinity;
	let y0 = Infinity;
	let x1 = -Infinity;
	let y1 = -Infinity;
	for (const chave of celulas.keys()) {
		const [x, y] = chave.split(",").map(Number);
		x0 = Math.min(x0, x);
		y0 = Math.min(y0, y);
		x1 = Math.max(x1, x);
		y1 = Math.max(y1, y);
	}
	return x0 === Infinity ? undefined : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

const nomeImagem = (indice) => catalogo().imagens[indice];

/** As imagens dos recortes já juntados (`terrain.runs`), com i e j relativos ao retângulo `caixa` do mapa. */
export function runsDoExterior(celulas, caixa) {
	const runs = [];
	let camadas = 0;
	for (const pilha of celulas.values()) camadas = Math.max(camadas, pilha.length);
	const contiguo = (a, b, dc, dl, soCor = false) =>
		a.imagem === b.imagem &&
		a.quadros === b.quadros &&
		a.dx === b.dx &&
		a.dy === b.dy &&
		(soCor || (b.sx === a.sx + dc * TILE && b.sy === a.sy + dl * TILE));
	const corDe = (tile) => (tile.quadros > 1 ? undefined : corChapadaEm(nomeImagem(tile.imagem), tile.sx, tile.sy));
	for (let z = 0; z < camadas; z++) {
		const tileEm = (i, j) => celulas.get(`${caixa.x + i},${caixa.y + j}`)?.[z];
		for (const r of juntarCelulas(caixa.width, caixa.height, tileEm, contiguo, corDe)) {
			const t = r.tile;
			runs.push(
				r.chapado
					? [t.imagem, r.x, r.y, r.w, r.h, t.sx + MIOLO, t.sy + MIOLO, MIOLO_LADO, MIOLO_LADO, z, t.quadros, t.dx, t.dy]
					: [t.imagem, r.x, r.y, r.w, r.h, t.sx, t.sy, r.w * TILE, r.h * TILE, z, t.quadros, t.dx, t.dy],
			);
		}
	}
	let tiles = 0;
	let layers = 0;
	for (const pilha of celulas.values()) {
		tiles++;
		layers += pilha.filter((t) => t !== undefined).length;
	}
	return { tiles, layers, runs };
}

// ---------------------------------------------------------------------------------------------------------------
// O caminho de volta (o importador): de `terrain.runs` para `exterior` do bloco.

/** Abre os recortes em células: chave "x,y" do bloco → a pilha [{ imagem, sx, sy, quadros, dx, dy }] por camada z. */
export function celulasDosRuns(runs, caixa) {
	const celulas = new Map();
	for (const [imagem, i, j, w, h, sx, sy, sw, sh, z, quadros, dx, dy] of runs) {
		const esticado = sw !== w * TILE || sh !== h * TILE;
		for (let b = 0; b < h; b++) {
			for (let a = 0; a < w; a++) {
				const x = caixa.x + i + a;
				const y = caixa.y + j + b;
				const chave = `${x},${y}`;
				const pilha = celulas.get(chave) ?? [];
				let tile;
				if (esticado) {
					// Um retângulo de uma cor só: o recorte é o miolo do tile da primeira célula; as demais seguem o
					// padrão de 2 × 2 da base (só as bases de uma cor só se esticam).
					const linha = (sy - MIOLO) / TILE;
					tile = { imagem, sx: variante(x, y) * TILE, sy: linha * TILE, quadros, dx, dy, esticado: true };
				} else {
					tile = { imagem, sx: sx + a * TILE, sy: sy + b * TILE, quadros, dx, dy };
				}
				pilha[z] = tile;
				celulas.set(chave, pilha);
			}
		}
	}
	return celulas;
}

/**
 * Lê o que cada célula mostra: o terreno da base, as junções (terreno de cima e máscara), o decalque e a forma.
 * Devolve { base, juncoes: [{ sobre, sob, mascara }], decalque, forma } ou lança erro no que não reconhece.
 */
function lerCelula(chave, pilha) {
	const cat = catalogo();
	const [x, y] = chave.split(",").map(Number);
	const lido = { juncoes: [] };
	pilha.forEach((tile, z) => {
		if (!tile) return;
		if (nomeImagem(tile.imagem) === "forma_equipe_32") {
			if (z !== 0) throw new Error(`${chave}: forma fora da base`);
			for (const [nome, painel] of Object.entries(cat.formas)) {
				const dx = tile.sx - painel.x;
				const dy = tile.sy - painel.y;
				if (dx < 0 || dy < 0 || dx >= painel.blocos[0] * 2 * TILE || dy >= painel.blocos[1] * 2 * TILE) continue;
				lido.forma = { painel: nome, bx: Math.floor(dx / (2 * TILE)), by: Math.floor(dy / (2 * TILE)), qx: (dx / TILE) % 2, qy: (dy / TILE) % 2 };
				return;
			}
			throw new Error(`${chave}: forma em (${tile.sx}, ${tile.sy}) fora dos painéis do catálogo`);
		}
		const linha = tile.sy / TILE;
		const coluna = tile.sx / TILE;
		if (z === 0) {
			const base = terrenoPorBase(linha);
			if (!base) throw new Error(`${chave}: base na linha ${linha} não é de nenhum terreno`);
			if (coluna !== variante(x, y)) throw new Error(`${chave}: base com a variante ${coluna}, esperada ${variante(x, y)}`);
			lido.base = base;
			return;
		}
		for (const [id, def] of Object.entries(cat.decalques)) {
			const dx = tile.sx - def.sx;
			const dy = tile.sy - def.sy;
			if (dx < 0 || dy < 0 || dx >= def.w * TILE || dy >= def.h * TILE) continue;
			if (
				(def.quadros ?? 1) !== tile.quadros ||
				(def.dx ?? 0) !== tile.dx ||
				(def.dy ?? 0) !== tile.dy
			)
				continue;
			lido.decalque = { id, i: dx / TILE, j: dy / TILE, z };
			return;
		}
		const j = cat.juncoes.find((c) => linha >= c.linha && linha < c.linha + 4);
		if (!j) throw new Error(`${chave}: a linha ${linha} da folha não é junção nem decalque conhecido`);
		if (linha - j.linha !== variante(x, y)) throw new Error(`${chave}: junção com a variante ${linha - j.linha}, esperada ${variante(x, y)}`);
		if ((j.quadros ?? 1) !== tile.quadros || (j.dy ?? 0) !== tile.dy || (j.dx ?? 0) !== tile.dx) {
			throw new Error(`${chave}: junção na linha ${linha} com animação diferente da do catálogo`);
		}
		lido.juncoes.push({ sobre: j.sobre, sob: j.sob, mascara: coluna, z });
	});
	return lido;
}

/**
 * Recupera `exterior` do bloco (terreno, decalques, formas) a partir dos recortes. Devolve { exterior, avisos } ou
 * lança erro quando os recortes não cabem na grade dupla (então o importador guarda os recortes crus).
 */
export function decomporRuns(runs, caixa) {
	const celulas = celulasDosRuns(runs, caixa);
	const lidas = new Map();
	for (const [chave, pilha] of celulas) lidas.set(chave, lerCelula(chave, pilha));

	const grade = Array.from({ length: LADO_BLOCO }, () => Array(LADO_BLOCO).fill(""));
	const formas = [];
	const decalques = [];
	for (const [chave, lida] of lidas) {
		const [x, y] = chave.split(",").map(Number);
		if (lida.forma && lida.forma.qx === 0 && lida.forma.qy === 0) {
			formas.push({ x, y, painel: lida.forma.painel, bx: lida.forma.bx, by: lida.forma.by });
		}
		if (lida.decalque && lida.decalque.i === 0 && lida.decalque.j === 0) decalques.push({ x, y, id: lida.decalque.id });
	}
	formas.sort((a, b) => a.y - b.y || a.x - b.x);
	decalques.sort((a, b) => a.y - b.y || a.x - b.x);

	// Uma célula de terreno (x, y) está pintada se os quatro tiles em volta dela existem; o terreno dela é o que esses
	// tiles mostram no quadrante correspondente (a junção mais alta com o bit, senão a base).
	const terrenoNoQuadrante = (lida, q) => {
		let codigo = lida.base;
		for (const j of lida.juncoes) if (j.mascara & (1 << q)) codigo = j.sobre;
		return codigo;
	};
	for (let y = 0; y < LADO_BLOCO; y++) {
		for (let x = 0; x < LADO_BLOCO; x++) {
			let codigo;
			let todos = true;
			QUADRANTES.forEach(([qx, qy], q) => {
				const lida = lidas.get(`${x - qx},${y - qy}`);
				if (!lida || lida.forma) {
					todos = false;
					return;
				}
				const c = terrenoNoQuadrante(lida, q);
				if (codigo !== undefined && c !== codigo) throw new Error(`a célula (${x}, ${y}) do terreno aparece como ${codigo} e ${c}`);
				codigo = c;
			});
			if (todos && codigo !== undefined) grade[y][x] = codigo;
		}
	}
	const exterior = { terreno: escreverTerreno(grade) };
	if (decalques.length > 0) exterior.decalques = decalques;
	if (formas.length > 0) exterior.formas = formas;
	return exterior;
}

/** Estatística e células de recortes crus (`exterior.runs_importados`), para o gerador copiá-los. */
export function celulasDeRunsImportados(runs, caixa) {
	const celulas = celulasDosRuns(runs, caixa);
	const quadrantesDe = new Map();
	for (const [chave, pilha] of celulas) {
		let lida;
		try {
			lida = lerCelula(chave, pilha);
		} catch {
			quadrantesDe.set(chave, ["", "", "", ""]);
			continue;
		}
		const quadrantes = QUADRANTES.map((_, q) => {
			let codigo = lida.base ?? "";
			for (const j of lida.juncoes) if (j.mascara & (1 << q)) codigo = j.sobre;
			return codigo;
		});
		quadrantesDe.set(chave, quadrantes);
	}
	return { celulas, quadrantesDe };
}
