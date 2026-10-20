// Os recortes da etapa G (docs/diorama/RECORTES.md): o campo `recorte` que tools/recortes.py grava em cada peça de
// pecas.json, `{ arquivo, folga, base, partes: [{ n, arquivo, referencia, cor_media, pixels }] }`, e as imagens dele
// montadas em EditableImage com os pixels da ponte (`GET /imagens/diorama/recortes/...rgba`).
//
// Recolorir é como o jogo faria: a base (a peça nas cores originais) e, por cima, a máscara de cada parte com
// `ImageColor3` = a cor escolhida. A máscara é cinza (branco = a cor cheia), então `ImageColor3` = o tom de
// referência da parte devolve o original, e outra cor mantém as sombras e a textura.
//
// Luzes e fogo não se pintam (RECORTES.md, "Limitações"): a peça de tipo `luz`, com o campo `luz`, ou cuja área
// fica dentro da área de uma luz da mesma folha (a tocha e o abajur, que repetem a área de `casa@1,0` e `casa@64,31`).
import { AssetService } from "@rbxts/services";
import { lerFolha, lerImagem } from "../ponte";
import { Peca, TILE } from "./formato";

export interface ParteRecorte {
	n: number;
	/** Caminho relativo à raiz, com o `.png` (`diorama/recortes/casa/chair/parte_1.png`). */
	arquivo: string;
	/** O tom de referência: `ImageColor3` com ele devolve as cores originais. */
	referencia: Color3;
	referenciaHex: string;
	corMedia: string;
	pixels: number;
}

export interface RecortePeca {
	arquivo: string;
	folga: number;
	base: string;
	partes: ParteRecorte[];
}

/** O texto `#rrggbb` de uma cor. */
export function hexDaCor(c: Color3): string {
	return `#${c.ToHex().lower()}`;
}

/** A cor de `#RRGGBB` ou `RRGGBB` (maiúsculas ou minúsculas); `undefined` se não for isso. */
export function corDoHex(texto: string): Color3 | undefined {
	const limpo = texto.gsub("%s", "")[0];
	const [r, g, b] = limpo.match("^#?(%x%x)(%x%x)(%x%x)$");
	if (r === undefined || g === undefined || b === undefined) return undefined;
	return Color3.fromRGB(tonumber(r, 16)!, tonumber(g, 16)!, tonumber(b, 16)!);
}

/** Lê o campo `recorte` de uma peça (em `extras`, que o plugin não edita). `undefined` se não houver ou não servir. */
export function recorteDaPeca(p: Peca): RecortePeca | undefined {
	const v = p.extras.recorte;
	if (!typeIs(v, "table")) return undefined;
	const r = v as Record<string, unknown>;
	if (!typeIs(r.arquivo, "string") || !typeIs(r.base, "string")) return undefined;
	const partes = new Array<ParteRecorte>();
	if (typeIs(r.partes, "table")) {
		for (const item of r.partes as unknown[]) {
			if (!typeIs(item, "table")) continue;
			const parte = item as Record<string, unknown>;
			if (!typeIs(parte.n, "number") || !typeIs(parte.arquivo, "string")) continue;
			const referencia = typeIs(parte.referencia, "string") ? corDoHex(parte.referencia) : undefined;
			partes.push({
				n: parte.n,
				arquivo: parte.arquivo,
				referencia: referencia ?? Color3.fromRGB(255, 255, 255),
				referenciaHex: referencia ? hexDaCor(referencia) : "#ffffff",
				corMedia: typeIs(parte.cor_media, "string") ? parte.cor_media : "",
				pixels: typeIs(parte.pixels, "number") ? parte.pixels : 0,
			});
		}
	}
	return { arquivo: r.arquivo, folga: typeIs(r.folga, "number") ? r.folga : 1, base: r.base, partes };
}

function ehLuz(p: Peca): boolean {
	return p.tipo === "luz" || p.extras.luz !== undefined;
}

/**
 * Por que a peça não se pinta (luz ou fogo), ou `undefined` se pinta. `todas` serve para achar a luz cuja área
 * contém a da peça.
 */
export function motivoNaoPintavel(p: Peca, todas: ReadonlyArray<Peca>): string | undefined {
	if (ehLuz(p)) return "é uma luz (fogo e brilho não se recolorem)";
	const a = p.area;
	for (const q of todas) {
		if (q === p || q.folha !== p.folha || !ehLuz(q)) continue;
		const b = q.area;
		if (a.c >= b.c && a.l >= b.l && a.c + a.w <= b.c + b.w && a.l + a.h <= b.l + b.h) {
			return `fica na área da luz ${q.id} (fogo e brilho não se recolorem)`;
		}
	}
	return undefined;
}

/** Uma imagem montada: a EditableImage, o tamanho e quantos pixels têm alfa acima de 0. */
export interface ImagemMontada {
	imagem: EditableImage;
	largura: number;
	altura: number;
	opacos: number;
}

function contarOpacos(pixels: buffer, largura: number, altura: number): number {
	let n = 0;
	for (let i = 0; i < largura * altura; i++) if (buffer.readu8(pixels, i * 4 + 3) > 0) n++;
	return n;
}

function criarImagem(largura: number, altura: number): EditableImage | string {
	const [ok, imagem] = pcall(() => AssetService.CreateEditableImage({ Size: new Vector2(largura, altura) }));
	if (!ok) return `CreateEditableImage falhou: ${tostring(imagem)}`;
	if (imagem === undefined) return "CreateEditableImage devolveu nil (orçamento de memória de imagens editáveis esgotado)";
	return imagem as EditableImage;
}

/** Monta um PNG de `diorama/recortes/` numa EditableImage. Yielda (ponte). */
export function montarImagem(caminho: string): ImagemMontada | string {
	const r = lerImagem(caminho);
	if (!r.ok) return `${caminho}: ${r.erro}`;
	const { largura, altura, pixels } = r.valor;
	const imagem = criarImagem(largura, altura);
	if (typeIs(imagem, "string")) return imagem;
	const [ok, erro] = pcall(() => imagem.WritePixelsBuffer(Vector2.zero, new Vector2(largura, altura), pixels));
	if (!ok) {
		imagem.Destroy();
		return `WritePixelsBuffer (${caminho}): ${tostring(erro)}`;
	}
	return { imagem, largura, altura, opacos: contarOpacos(pixels, largura, altura) };
}

/**
 * O original: a área da peça na folha do disco (`diorama/folhas/<folha>.png`), com a mesma folga transparente do
 * recorte em volta, para os dois ficarem alinhados lado a lado. Yielda (ponte).
 */
export function montarOriginal(p: Peca, largura: number, altura: number, folga: number): ImagemMontada | string {
	const w = p.area.w * TILE;
	const h = p.area.h * TILE;
	const r = lerFolha(p.folha, p.area.c * TILE, p.area.l * TILE, w, h);
	if (!r.ok) return `folha ${p.folha}: ${r.erro}`;
	const imagem = criarImagem(largura, altura);
	if (typeIs(imagem, "string")) return imagem;
	const cabe = new Vector2(math.min(w, largura - folga), math.min(h, altura - folga));
	const [ok, erro] = pcall(() => {
		if (cabe.X === w && cabe.Y === h) imagem.WritePixelsBuffer(new Vector2(folga, folga), cabe, r.valor.pixels);
	});
	if (!ok) {
		imagem.Destroy();
		return `WritePixelsBuffer (original): ${tostring(erro)}`;
	}
	return { imagem, largura, altura, opacos: contarOpacos(r.valor.pixels, w, h) };
}

/** Lê os pixels opacos de volta da EditableImage (o autoteste confere que a montagem chegou). */
export function opacosDe(m: ImagemMontada): number {
	const [ok, b] = pcall(() => m.imagem.ReadPixelsBuffer(Vector2.zero, new Vector2(m.largura, m.altura)));
	if (!ok) return -1;
	return contarOpacos(b as buffer, m.largura, m.altura);
}

/** A paleta curta do seletor de cor (o Decorar do jogo deve ter uma parecida: RECORTES.md, "O Decorar"). */
export const PALETA: ReadonlyArray<{ nome: string; cor: Color3 }> = [
	{ nome: "vermelho", cor: Color3.fromRGB(196, 58, 48) },
	{ nome: "laranja", cor: Color3.fromRGB(230, 126, 34) },
	{ nome: "amarelo", cor: Color3.fromRGB(241, 196, 15) },
	{ nome: "verde", cor: Color3.fromRGB(63, 163, 77) },
	{ nome: "verde-água", cor: Color3.fromRGB(26, 188, 156) },
	{ nome: "azul", cor: Color3.fromRGB(46, 134, 222) },
	{ nome: "roxo", cor: Color3.fromRGB(142, 68, 173) },
	{ nome: "rosa", cor: Color3.fromRGB(232, 67, 147) },
	{ nome: "vinho", cor: Color3.fromRGB(128, 32, 56) },
	{ nome: "marrom", cor: Color3.fromRGB(139, 90, 43) },
	{ nome: "cinza", cor: Color3.fromRGB(149, 165, 166) },
	{ nome: "branco", cor: Color3.fromRGB(245, 245, 245) },
];
