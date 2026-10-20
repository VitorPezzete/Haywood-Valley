// Prévia local das folhas (docs/diorama/CONEXOES.md, seção 4). Uma folha editada no Aseprite ainda não está no
// Roblox; com "Folhas locais" ligado, Mapas e Catálogo mostram os pixels do disco: cada metade de 1024×512 vira uma
// EditableImage preenchida com `GET /folhas/<folha>.rgba?x=…&w=1024&h=512` (a folha inteira, diorama/folhas/<folha>.png,
// que é o arquivo que o Aseprite grava), e os ImageLabel usam `ImageContent = Content.fromObject(imagem)`.
//
// Para não mudar o tipo das imagens em todo o plugin (`[id, id]` por folha), uma metade local ganha o id falso
// `local://<folha>/<metade>`; `conteudo(id)` converte qualquer id em `Content`. `recarregar_folhas` reescreve os
// pixels nas mesmas EditableImage, e os ImageLabel mostram a mudança sem serem tocados.
//
// Sem EditableImage (place sem permissão, orçamento de memória), a carga falha e estado.ts cai no id do Roblox com
// aviso.
import { AssetService } from "@rbxts/services";
import { source } from "@rbxts/vide";
import { gravarConfig, lerConfig } from "./ambiente";
import { lerFolha } from "./ponte";

// Sem ponto: o plugin:SetSetting do Studio ignora em silêncio as chaves com "." (conferido em 2026-10-20).
const CHAVE = "Diorama_folhasLocais";
const LARGURA_METADE = 1024;
const ALTURA = 512;
const PREFIXO = "local://";

/** O interruptor "Folhas locais" (guardado em plugin:SetSetting). */
export const folhasLocais = source(false);

/** As EditableImage de cada folha carregada: [metade 0, metade 1]. */
const editaveis = new Map<string, [EditableImage, EditableImage]>();

export function carregarConfigFolhas() {
	folhasLocais(lerConfig<unknown>(CHAVE, false) === true);
}

export function gravarConfigFolhas(valor: boolean) {
	folhasLocais(valor);
	gravarConfig(CHAVE, valor);
}

export function idLocal(folha: string, metade: number) {
	return `${PREFIXO}${folha}/${metade}`;
}

/** O `Content` de um id (`rbxassetid://…`, `local://<folha>/<metade>` ou vazio). */
export function conteudo(id: string | undefined): Content {
	if (id === undefined || id === "") return Content.none;
	if (id.sub(1, PREFIXO.size()) === PREFIXO) {
		const [folha, metade] = id.sub(PREFIXO.size() + 1).match("^(.+)/(%d)$");
		const par = folha !== undefined ? editaveis.get(tostring(folha)) : undefined;
		const imagem = par ? par[tonumber(metade) === 1 ? 1 : 0] : undefined;
		return imagem ? Content.fromObject(imagem) : Content.none;
	}
	return Content.fromUri(id);
}

export interface ResultadoFolha {
	ok: boolean;
	folha: string;
	/** Pixels escritos nas duas metades (0 se falhou). */
	pixels: number;
	erro?: string;
}

function criarImagem(): EditableImage | string {
	const [ok, imagem] = pcall(() => AssetService.CreateEditableImage({ Size: new Vector2(LARGURA_METADE, ALTURA) }));
	if (!ok) return `CreateEditableImage falhou: ${tostring(imagem)}`;
	if (imagem === undefined) return "CreateEditableImage devolveu nil (orçamento de memória de imagens editáveis esgotado)";
	return imagem as EditableImage;
}

/**
 * Lê as duas metades da folha pela ponte e as escreve nas EditableImage dela (criando-as na primeira vez). Yielda.
 */
export function carregarFolha(folha: string): ResultadoFolha {
	let par = editaveis.get(folha);
	if (!par) {
		const a = criarImagem();
		if (typeIs(a, "string")) return { ok: false, folha, pixels: 0, erro: a };
		const b = criarImagem();
		if (typeIs(b, "string")) {
			a.Destroy();
			return { ok: false, folha, pixels: 0, erro: b };
		}
		par = [a, b];
		editaveis.set(folha, par);
	}
	let pixels = 0;
	for (const metade of [0, 1]) {
		const r = lerFolha(folha, metade * LARGURA_METADE, 0, LARGURA_METADE, ALTURA);
		if (!r.ok) return { ok: false, folha, pixels, erro: `folha ${folha}, metade ${metade}: ${r.erro}` };
		const imagem = par[metade];
		const [escreveu, erro] = pcall(() =>
			imagem.WritePixelsBuffer(Vector2.zero, new Vector2(r.valor.largura, r.valor.altura), r.valor.pixels),
		);
		if (!escreveu) return { ok: false, folha, pixels, erro: `WritePixelsBuffer: ${tostring(erro)}` };
		pixels += r.valor.largura * r.valor.altura;
	}
	return { ok: true, folha, pixels };
}

/** As folhas que já têm EditableImage. */
export function folhasCarregadas(): string[] {
	const lista = new Array<string>();
	for (const [folha] of editaveis) lista.push(folha);
	return lista;
}

/** Relê os pixels da folha (ou de todas as carregadas). Yielda. */
export function recarregarFolhas(folha?: string): ResultadoFolha[] {
	const lista = folha !== undefined ? [folha] : folhasCarregadas();
	return lista.map((f) => carregarFolha(f));
}

/** Lê um pixel de volta da EditableImage (o autoteste confere que os pixels chegaram): [r, g, b, a] de 0 a 255. */
export function lerPixel(folha: string, x: number, y: number): [number, number, number, number] | undefined {
	const par = editaveis.get(folha);
	if (!par) return undefined;
	const metade = x >= LARGURA_METADE ? 1 : 0;
	const [ok, b] = pcall(() => par[metade].ReadPixelsBuffer(new Vector2(x - metade * LARGURA_METADE, y), new Vector2(1, 1)));
	if (!ok) return undefined;
	const dados = b as buffer;
	return [buffer.readu8(dados, 0), buffer.readu8(dados, 1), buffer.readu8(dados, 2), buffer.readu8(dados, 3)];
}

/** Destrói as EditableImage (o pacote parou). */
export function liberarFolhasLocais() {
	for (const [, par] of editaveis) {
		pcall(() => par[0].Destroy());
		pcall(() => par[1].Destroy());
	}
	editaveis.clear();
}
