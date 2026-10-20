// As cabeças e os corpos dos contribuidores, no formato do Graal, lidos dos textos de graalData.ts
// (gerado por tools/graal_pack.py). Cada peça vem em camadas: a peça inteira nas cores originais e uma
// máscara em cinza por parte pintável (pele, cabelo, olhos, enfeites, partes da roupa), com o degradê e
// os detalhes da parte, para o jogo pintar com qualquer cor sem perder as sombras. Cada peça existe em
// dois estilos (pieceStyle.ts): o do Aeko (graalData.ts) e o original (graalDataOriginal.ts).

import { GRAAL_BODIES, GRAAL_HEADS } from "./graalData";
import { GRAAL_BODIES_ORIGINAL, GRAAL_HEADS_ORIGINAL, GRAAL_LAYERS_ORIGINAL } from "./graalDataOriginal";

/** 0 masculino, 1 feminino. */
export type Gender = 0 | 1;

/** O tipo de uma parte da roupa, tirado do lugar dela no corpo (tools/graal_pack.py, cloth_kind). */
export type ClothKind = "shirt" | "sleeves" | "pants" | "skirt" | "dress" | "shoes" | "belt" | "trim";
const CLOTH_KIND_OF_CODE: Record<string, ClothKind | undefined> = {
	t: "shirt",
	m: "sleeves",
	p: "pants",
	k: "skirt",
	v: "dress",
	s: "shoes",
	b: "belt",
	d: "trim",
};

/** Partes da roupa que um corpo pode ter, no máximo. */
export const MAX_CLOTHS = 6;
/** Enfeites de cor própria que uma cabeça pode ter, no máximo. */
export const MAX_DETAILS = 3;

export type PieceStyle = import("./pieceStyle").PieceStyle;

export type GraalTint = "skin" | "hair" | "eyes" | "cloth" | "detail";

export interface GraalLayer {
	code: string;
	sheet: number;
	cell: number;
	blink: boolean;
	tint?: GraalTint;
	part?: number;
}

export interface GraalHead {
	id: string;
	author: string;
	style: PieceStyle;
	gender?: Gender;
	top: number;
	skin?: number;
	hair?: number;
	eyes?: number;
	details: number[];
	layers: GraalLayer[];
}

export interface GraalBody {
	id: string;
	author: string;
	style: PieceStyle;
	gender?: Gender;
	skin?: number;
	cloths: number[];
	clothKinds: ClothKind[];
	layers: GraalLayer[];
}

export type GraalPiece = GraalHead | GraalBody;

const TINT_OF_CODE: Record<string, GraalTint | undefined> = { s: "skin", h: "hair", e: "eyes" };
const GENDER_OF_CODE: Record<string, Gender | undefined> = { m: 0, f: 1 };

function hex(text: string | undefined) {
	return text !== undefined && text !== "" ? tonumber(text, 16) : undefined;
}

function layerOf(text: string) {
	const [code, sheet, cell, blink] = text.split(":");
	const layer: GraalLayer = { code, sheet: tonumber(sheet) ?? 0, cell: tonumber(cell) ?? 0, blink: blink === "1" };
	const kind = code.sub(1, 1);
	if (kind === "c" || kind === "d") {
		layer.tint = kind === "c" ? "cloth" : "detail";
		layer.part = tonumber(code.sub(2)) ?? 0;
	} else {
		layer.tint = TINT_OF_CODE[code];
	}
	return layer;
}

/** Cores RRGGBB separadas por vírgula. */
function colorsOf(text: string | undefined) {
	const colors = new Array<number>();
	if (text !== undefined && text !== "") {
		for (const color of text.split(",")) colors.push(hex(color) ?? 0xffffff);
	}
	return colors;
}

function layersOf(text: string): GraalLayer[] {
	return text === "" ? [] : text.split(";").map(layerOf);
}

function headOf(text: string): GraalHead {
	const [id, author, gender, top, skin, hair, eyes, details, layers] = text.split("|");
	return {
		id,
		author,
		style: 0,
		gender: GENDER_OF_CODE[gender],
		top: tonumber(top) ?? 0,
		skin: hex(skin),
		hair: hex(hair),
		eyes: hex(eyes),
		details: colorsOf(details),
		layers: layersOf(layers ?? ""),
	};
}

function bodyOf(text: string): GraalBody {
	const fields = text.split("|");
	// sem o campo dos tipos (dados gravados antes de 2026-10-17), toda parte é "detalhe"
	const [id, author, gender, skin, cloths] = fields;
	const kinds = fields.size() >= 7 ? fields[5] : "";
	const layers = fields[fields.size() >= 7 ? 6 : 5] ?? "";
	const colors = colorsOf(cloths);
	const codes = kinds === "" ? [] : kinds.split(",");
	return {
		id,
		author,
		style: 0,
		gender: GENDER_OF_CODE[gender],
		skin: hex(skin),
		cloths: colors,
		clothKinds: colors.map((_, index) => CLOTH_KIND_OF_CODE[codes[index] ?? "d"] ?? "trim"),
		layers: layersOf(layers),
	};
}

const heads = GRAAL_HEADS.map(headOf);
const bodies = GRAAL_BODIES.map(bodyOf);

/**
 * As camadas da peça no estilo original: as mesmas folhas e células (as folhas originais são casadas
 * célula a célula com as do Aeko), menos as de GRAAL_LAYERS_ORIGINAL, que trocam a camada do mesmo tipo.
 */
function originalLayers(id: string, layers: GraalLayer[]) {
	const swaps = GRAAL_LAYERS_ORIGINAL[id];
	if (swaps === undefined) return layers;
	const changed = [...layers];
	for (const swap of layersOf(swaps)) {
		const at = changed.findIndex((layer) => layer.code === swap.code);
		if (at >= 0) changed[at] = swap;
	}
	return changed;
}

/**
 * A cabeça no estilo original: o topo e as cores base de GRAAL_HEADS_ORIGINAL (cabeça sem a linha é igual
 * nos dois estilos) e as camadas das folhas originais.
 */
function originalHead(head: GraalHead): GraalHead {
	const changed: GraalHead = { ...head, style: 1, layers: originalLayers(head.id, head.layers) };
	const text = GRAAL_HEADS_ORIGINAL[head.id];
	if (text !== undefined) {
		const [top, skin, hair, eyes, details] = text.split("|");
		changed.top = tonumber(top) ?? head.top;
		changed.skin = hex(skin);
		changed.hair = hex(hair);
		changed.eyes = hex(eyes);
		changed.details = colorsOf(details);
	}
	return changed;
}

/** O corpo no estilo original: a pele e as cores da roupa de GRAAL_BODIES_ORIGINAL; os tipos da roupa são os mesmos. */
function originalBody(body: GraalBody): GraalBody {
	const changed: GraalBody = { ...body, style: 1, layers: originalLayers(body.id, body.layers) };
	const text = GRAAL_BODIES_ORIGINAL[body.id];
	if (text !== undefined) {
		const [skin, cloths] = text.split("|");
		changed.skin = hex(skin);
		changed.cloths = colorsOf(cloths);
	}
	return changed;
}

const headsOriginal = heads.map(originalHead);
const bodiesOriginal = bodies.map(originalBody);

/** Os autores, na ordem em que aparecem nas cabeças e depois nos corpos (para os créditos e o filtro). */
const authors = new Array<string>();
for (const piece of [...heads, ...bodies]) {
	if (!authors.includes(piece.author)) authors.push(piece.author);
}

/** Se a peça aparece para quem escolheu o gênero `gender`: as dele e as que servem aos dois. */
export function fitsGender(piece: { gender?: Gender }, gender: Gender) {
	return piece.gender === undefined || piece.gender === gender;
}

/**
 * O boneco com que cada gênero começa, escolhido em 2026-10-17 (o usuário deixou a escolha comigo): o
 * masculino de cabelo preto e jaqueta vermelha, o feminino de coques rosa e vestido azul com casaco
 * vermelho. Na ordem masculino, feminino.
 */
const DEFAULT_HEADS = ["zar160black", "jen34"];
const DEFAULT_BODIES = ["zar73body", "zar15body"];

/** A peça padrão do gênero, se existir e servir a ele; senão a primeira só do gênero, senão a primeira que serve. */
function firstOf(pieces: ReadonlyArray<GraalPiece>, gender: Gender, wanted: string) {
	const chosen = pieces.findIndex((piece) => piece.id === wanted && fitsGender(piece, gender));
	if (chosen >= 0) return chosen;
	const own = pieces.findIndex((piece) => piece.gender === gender);
	if (own >= 0) return own;
	return math.max(0, pieces.findIndex((piece) => fitsGender(piece, gender)));
}

export const Graal = {
	heads,
	bodies,
	authors,
	head: (index: number, style: PieceStyle): GraalHead | undefined => (style === 1 ? headsOriginal : heads)[index],
	body: (index: number, style: PieceStyle): GraalBody | undefined => (style === 1 ? bodiesOriginal : bodies)[index],
	defaultHead: [firstOf(heads, 0, DEFAULT_HEADS[0]), firstOf(heads, 1, DEFAULT_HEADS[1])],
	defaultBody: [firstOf(bodies, 0, DEFAULT_BODIES[0]), firstOf(bodies, 1, DEFAULT_BODIES[1])],
};
