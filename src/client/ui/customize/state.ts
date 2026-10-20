// O que a tela de personalizar faz, sem o desenho: o visual escolhido, as abas, as grades, o teclado, as
// cores, o histórico e os visuais salvos. Cada tema monta a tela à sua maneira (celeiro.tsx e
// graal.tsx, com a disposição da prancha dele) usando este estado.

import { batch, cleanup, source, Source } from "@rbxts/vide";
import { subscribe } from "@rbxts/charm";
import { GuiService, RunService, UserInputService } from "@rbxts/services";
import {
	channelsOfRgb,
	CLOTH_KEYS,
	ColorKey,
	DETAIL_KEYS,
	Look,
	lookBody,
	lookGender,
	lookHead,
	ORIGINAL,
	originalRgb,
	partRgb,
	rgbOfChannels,
	withBody,
	withGender,
	withHead,
	withPickedHead,
	withStyle,
} from "shared/appearance";
import { ClothKind, fitsGender, Gender, Graal, PieceStyle } from "shared/graal";
import { TextKey } from "shared/i18n/en";
import { withOutfitPalette } from "shared/outfitPalette";
import { playerData, toggleFavorite } from "client/state/playerData";
import { characterName, look as chosenLook } from "client/state/screen";
import { BLINK_MAX, BLINK_MIN, BLINK_TIME, TURN_ORDER, WALK_FPS, WALK_FRAMES } from "client/world/graalArt";
import { t } from "../i18n";
import { ThemePieceName } from "../themes/types";

/** As abas do painel. */
export const TABS_LIST: { title: TextKey; icon: ThemePieceName }[] = [
	{ title: "tab.gender", icon: "iconGender" },
	{ title: "tab.head", icon: "iconHead" },
	{ title: "tab.body", icon: "iconBody" },
	{ title: "tab.hair", icon: "iconHair" },
	{ title: "tab.face", icon: "iconFace" },
	{ title: "tab.outfit", icon: "iconOutfit" },
];

export const GENDERS: { gender: Gender; name: TextKey }[] = [
	{ gender: 0, name: "gender.male" },
	{ gender: 1, name: "gender.female" },
];

export interface GridSpec {
	columns: number;
	/** Tamanho da célula, em pixels de arte. */
	w: number;
	h: number;
	/** Distância de uma célula à seguinte. */
	stepX: number;
	stepY: number;
}

/** Grades com rolagem: cabeças de frente no tamanho do jogo; corpos no boneco inteiro. As duas pranchas usam células de 36 a cada 40. */
export const HEAD_GRID: GridSpec = { columns: 7, w: 36, h: 36, stepX: 40, stepY: 40 };
export const BODY_GRID: GridSpec = { columns: 7, w: 36, h: 52, stepX: 40, stepY: 56 };

/** Fileiras a mais que a grade desenha além das que cabem, para a rolagem não mostrar buraco. */
export const SPARE_ROWS = 2;

/** Células criadas por grade: as que cabem na grade mais alta das pranchas, mais as de folga. */
export const poolSize = (spec: GridSpec) => spec.columns * (math.ceil(150 / spec.stepY) + SPARE_ROWS);

// Cores prontas: 11 por parte, que com a original fazem as 12 amostras do Clássico (prancha B). O
// Celeiro mostra as 5 primeiras na faixa de baixo das grades (as do cabelo são as da prancha A).
export const SKIN_PRESETS = [
	0xffe3c6, 0xf6d2b0, 0xe8b48c, 0xd09a6e, 0xb07850, 0x8c5a3c, 0x6a4030, 0x4a2c22, 0xa8e0a0, 0x9ec8f0, 0xc8a8e8,
];
/** As peles de gente; as últimas são de fantasia e o Aleatório não sorteia. */
const NATURAL_SKINS = 8;
export const HAIR_PRESETS = [
	0x2a1e1a, 0x6b3a1e, 0xd38b27, 0xffdd7c, 0xf4eedc, 0xd06030, 0x9a9aa8, 0x8070d8, 0x3c64c8, 0x50a060, 0xe070a0,
];
export const EYES_PRESETS = [
	0x3a2a24, 0x6a4030, 0x3c8cff, 0x58b0d8, 0x58a858, 0x8660c4, 0xd04848, 0xe8a040, 0x9a9aa8, 0x2a2630, 0xe070a0,
];
export const CLOTHES_PRESETS = [
	0xe25448, 0xf0b43c, 0x4cb262, 0x409cac, 0x5a62b4, 0x7f86d8, 0xb45ca0, 0xf4eedc, 0x8f93a0, 0x34357a, 0x28242c,
];

export const FACE_PARTS: { key: ColorKey; name: TextKey; title: TextKey; presets: number[] }[] = [
	{ key: "skinRgb", name: "part.skin", title: "customize.skinColor", presets: SKIN_PRESETS },
	{ key: "eyesRgb", name: "part.eyes", title: "customize.eyesColor", presets: EYES_PRESETS },
];

/** O nome e o título da cor de cada tipo de parte da roupa. */
const CLOTH_NAMES: Record<ClothKind, TextKey> = {
	shirt: "part.shirt",
	sleeves: "part.sleeves",
	pants: "part.pants",
	skirt: "part.skirt",
	dress: "part.dress",
	shoes: "part.shoes",
	belt: "part.belt",
	trim: "part.trim",
};
const CLOTH_TITLES: Record<ClothKind, TextKey> = {
	shirt: "customize.shirtColor",
	sleeves: "customize.sleevesColor",
	pants: "customize.pantsColor",
	skirt: "customize.skirtColor",
	dress: "customize.dressColor",
	shoes: "customize.shoesColor",
	belt: "customize.beltColor",
	trim: "customize.trimColor",
};

const CHANNEL_STEP = 5;
/** Quantos passos o Desfazer guarda. */
const HISTORY = 80;

/** A tecla que troca o estilo da peça da aba aberta (Aeko ou Original): V de versão, livre no personalizar. */
export const STYLE_KEY = Enum.KeyCode.V;

/** Os botões do seletor de estilo, na ordem em que aparecem. */
export const STYLES: { style: PieceStyle; name: TextKey }[] = [
	{ style: 0, name: "customize.styleAeko" },
	{ style: 1, name: "customize.styleOriginal" },
];

/** Partes do painel que o teclado percorre em cada aba, de cima para baixo. */
export type PanelPart = number;

export function range(count: number) {
	const list: number[] = [];
	for (let index = 0; index < count; index++) list.push(index);
	return list;
}

function withValue(look: Look, key: ColorKey, value: number) {
	const changed = { ...look };
	changed[key] = value;
	return changed;
}

export interface GridView {
	authors: string[];
	lists: number[][];
}

/** Os artistas das peças que servem ao gênero, com "" (todos) na frente, e as peças de cada um. */
function byAuthor(pieces: readonly { author: string; gender?: Gender }[], gender: Gender): GridView {
	const authors = [""];
	const lists: number[][] = [[]];
	pieces.forEach((piece, index) => {
		if (!fitsGender(piece, gender)) return;
		lists[0].push(index);
		let at = authors.indexOf(piece.author);
		if (at < 0) {
			at = authors.size();
			authors.push(piece.author);
			lists.push([]);
		}
		lists[at].push(index);
	});
	return { authors, lists };
}

export interface Grid {
	kind: "head" | "body";
	spec: GridSpec;
	/** O filtro de cada gênero. */
	views: GridView[];
	/** O artista do filtro (0 = todos), a célula do cursor, a primeira fileira à mostra e a rolagem. */
	author: Source<number>;
	index: Source<number>;
	firstRow: Source<number>;
	scrollY: Source<number>;
	chosen: () => number;
	choose: (piece: number) => void;
	pieceId: (piece: number) => string;
	pieceAuthor: (piece: number) => string;
	/** A rolagem desenhada, quando a grade está na tela. */
	scroller?: ScrollingFrame;
}

export interface Tooltip {
	text: string;
	x: number;
	y: number;
}

/** O estado e as ações da tela de personalizar. `onDone(true)` confirma, `onDone(false)` volta ao menu. */
export function createCustomize(k: () => number, onDone: (confirmed: boolean) => void) {
	const look = source(chosenLook());
	const tab = source(0);
	const part = source<PanelPart>(1);
	const cursor = source<number>(lookGender(look()));
	const turn = source(0);
	const walkFrame = source(0);
	const closed = source(false);
	const name = source(characterName());
	const hairPart = source(0);
	const facePart = source(0);
	const clothPart = source(0);
	const favoritesOnly = source(false);
	const tooltip = source<Tooltip | undefined>(undefined);
	const saved = source(playerData());
	cleanup(subscribe(playerData, (value) => saved(value)));

	/** A área à mostra da grade e a folga em cima e embaixo das células, em pixels de arte: a disposição do tema diz. */
	let gridHeight = 148;
	let gridPad = 0;
    /**
     * Se as abas de grade têm a faixa de cor embaixo (o Celeiro): na Cabeça, a cor do cabelo; no Corpo,
     * a da parte da roupa escolhida. O Clássico pinta só nas abas de cor.
     */
	const colorStrip = source(false);
	/** Quantas amostras (com a original) a disposição mostra na aba aberta. */
	let swatchLimit = () => 12;

	// Desfazer e Refazer: cada mudança do visual entra no histórico.
	const history = [look()];
	let historyAt = 0;
	const apply = (changed: Look) => {
		look(changed);
		chosenLook(changed);
	};
	const set = (changed: Look) => {
		while (history.size() > historyAt + 1) history.pop();
		history.push(changed);
		if (history.size() > HISTORY) history.shift();
		historyAt = history.size() - 1;
		apply(changed);
	};
	const undo = () => {
		if (historyAt <= 0) return;
		historyAt -= 1;
		apply(history[historyAt]);
	};
	const redo = () => {
		if (historyAt >= history.size() - 1) return;
		historyAt += 1;
		apply(history[historyAt]);
	};

	const grids: Grid[] = [
		{
			kind: "head",
			spec: HEAD_GRID,
			views: [byAuthor(Graal.heads, 0), byAuthor(Graal.heads, 1)],
			author: source(0),
			index: source(0),
			firstRow: source(0),
			scrollY: source(0),
			chosen: () => look().head,
			choose: (piece) => set(withPickedHead(look(), piece)),
			pieceId: (piece) => Graal.heads[piece]?.id ?? "",
			pieceAuthor: (piece) => Graal.heads[piece]?.author ?? "",
		},
		{
			kind: "body",
			spec: BODY_GRID,
			views: [byAuthor(Graal.bodies, 0), byAuthor(Graal.bodies, 1)],
			author: source(0),
			index: source(0),
			firstRow: source(0),
			scrollY: source(0),
			chosen: () => look().body,
			choose: (piece) => {
				if (piece !== look().body) set(withOutfitPalette(withBody(look(), piece), piece));
			},
			pieceId: (piece) => Graal.bodies[piece]?.id ?? "",
			pieceAuthor: (piece) => Graal.bodies[piece]?.author ?? "",
		},
	];

	/** As abas 1 e 2 são as grades de cabeças e de corpos. */
	const gridOf = (index: number) => (index >= 1 && index <= 2 ? grids[index - 1] : undefined);
	const viewOf = (grid: Grid) => grid.views[lookGender(look())];
	const favoriteIds = (grid: Grid) => (grid.kind === "head" ? saved().favoriteHeads : saved().favoriteBodies);
	const listOf = (grid: Grid) => {
		const list = viewOf(grid).lists[grid.author()] ?? [];
		if (!favoritesOnly()) return list;
		const favorites = favoriteIds(grid);
		return list.filter((piece) => favorites.includes(grid.pieceId(piece)));
	};
	const rowsOf = (grid: Grid) => math.ceil(listOf(grid).size() / grid.spec.columns);
	const visibleRows = (grid: Grid) => math.max(1, math.floor(gridHeight / grid.spec.stepY));

	/** Rola a grade para a fileira do cursor aparecer inteira. */
	const reveal = (grid: Grid) => {
		const scroller = grid.scroller;
		if (!scroller) return;
		const row = math.floor(grid.index() / grid.spec.columns);
		const top = row * grid.spec.stepY;
		const bottom = top + grid.spec.h + gridPad * 2;
		const view = scroller.CanvasPosition.Y / k();
		if (top < view) scroller.CanvasPosition = new Vector2(0, top * k());
		else if (bottom > view + gridHeight) scroller.CanvasPosition = new Vector2(0, (bottom - gridHeight) * k());
	};
	const pointAtChosen = (grid: Grid) => {
		grid.index(math.max(0, listOf(grid).indexOf(grid.chosen())));
		task.defer(() => reveal(grid));
	};

	const clothCount = () => lookBody(look())?.cloths.size() ?? 0;
	const detailCount = () => lookHead(look())?.details.size() ?? 0;

	/** A cor que o seletor da aba aberta muda. */
	const rgbKey = (): ColorKey | undefined => {
		if (tab() === 1) return colorStrip() ? "hairRgb" : undefined;
		if (tab() === 2) {
			// O corpo novo pode ter menos partes que a escolhida: vale a primeira.
			const index = clothPart() < clothCount() ? clothPart() : 0;
			return colorStrip() && index < clothCount() ? CLOTH_KEYS[index] : undefined;
		}
		if (tab() === 3) {
			return hairPart() === 0 ? "hairRgb" : hairPart() <= detailCount() ? DETAIL_KEYS[hairPart() - 1] : undefined;
		}
		if (tab() === 4) return FACE_PARTS[facePart()].key;
		if (tab() === 5) return clothPart() < clothCount() ? CLOTH_KEYS[clothPart()] : undefined;
		return undefined;
	};
	const paintable = () => {
		const key = rgbKey();
		return key !== undefined && originalRgb(look(), key) !== undefined;
	};
	const presets = () => {
		const index = tab();
		if (index === 1 || (index === 3 && hairPart() === 0)) return HAIR_PRESETS;
		return index === 4 ? FACE_PARTS[facePart()].presets : CLOTHES_PRESETS;
	};
	const swatchCount = () => math.min(presets().size() + 1, swatchLimit());

	/** O título da cor de agora: "Cor do cabelo", "Cor da camisa"... */
	const colorTitle = (): TextKey => {
		const index = tab();
		if (index === 1 || (index === 3 && hairPart() === 0)) return "customize.hairColor";
		if (index === 2 || index === 5) {
			const part = clothPart() < clothCount() ? clothPart() : 0;
			const kind = Graal.bodies[look().body]?.clothKinds[part];
			return kind !== undefined ? CLOTH_TITLES[kind] : "customize.outfitColor";
		}
		return index === 4 ? FACE_PARTS[facePart()].title : "customize.color";
	};

	const setChannel = (key: ColorKey, channel: number, value: number) => {
		const channels = channelsOfRgb(partRgb(look(), key) ?? 0xffffff);
		channels[channel] = value;
		set(withValue(look(), key, rgbOfChannels(channels[0], channels[1], channels[2])));
	};

	/** A cor da parte de agora volta à do artista. */
	const restore = () => {
		const key = rgbKey();
		if (key && paintable()) set(withValue(look(), key, ORIGINAL));
	};

	/** As partes que a aba `index` tem, na ordem do teclado. Na aba Gênero, a grade são os dois cartões. */
	const partsOf = (index: number): PanelPart[] => {
		if (index === 0) return [1];
		if (index <= 2) return colorStrip() ? [0, 1, 3, 4, 5, 6] : [0, 1];
		return [2, 3, 4, 5, 6];
	};

	const pickCount = () =>
		tab() === 3 ? 1 + detailCount() : tab() === 4 ? FACE_PARTS.size() : math.max(clothCount(), 1);
	const pickValue = () => (tab() === 3 ? hairPart() : tab() === 4 ? facePart() : clothPart());
	/** O nome da parte `index` da aba de cor aberta: Cabelo, Detalhe 1, Pele, Olhos, Camisa, Calça... */
	const pickName = (index: number) => {
		if (tab() === 3) return index === 0 ? t("part.hair") : t("part.detail", { n: index });
		if (tab() === 4) return FACE_PARTS[index] ? t(FACE_PARTS[index].name) : "";
		const kinds = Graal.bodies[look().body]?.clothKinds ?? [];
		const kind = kinds[index];
		if (kind === undefined) return t("part.cloth", { n: index + 1 });
		const name = t(CLOTH_NAMES[kind]);
		// tipo repetido no mesmo corpo (duas camisas, uma por cima da outra): Camisa, Camisa 2
		let n = 0;
		for (let i = 0; i <= index; i++) if (kinds[i] === kind) n++;
		return n > 1 ? t("part.numbered", { name, n }) : name;
	};
	const setPick = (value: number) =>
		tab() === 3 ? hairPart(value) : tab() === 4 ? facePart(value) : clothPart(value);

	const setGender = (gender: Gender) => {
		if (gender === lookGender(look())) return;
		batch(() => {
			const changed = withGender(look(), gender);
			set(changed.body !== look().body ? withOutfitPalette(changed, changed.body) : changed);
			for (const grid of grids) {
				grid.author(0);
				pointAtChosen(grid);
			}
		});
	};

    /**
     * O estilo da cabeça ou do corpo (Aeko ou Original). Vale para a peça escolhida, e a grade mostra as
     * peças nele; escolher outra peça ou o Aleatório mantêm o estilo marcado (decisões do usuário em
     * 2026-10-18). A troca entra no histórico do Desfazer.
     */
	const styleOf = (kind: "head" | "body") => (kind === "head" ? look().headStyle : look().bodyStyle);
	const setStyle = (kind: "head" | "body", style: PieceStyle) => {
		if (style !== styleOf(kind)) set(withStyle(look(), kind, style));
	};
	/** A tecla do estilo: troca o da peça da aba aberta (Cabeça ou Corpo). */
	const toggleStyle = () => {
		const grid = gridOf(tab());
		if (!grid) return;
		const at = STYLES.findIndex((item) => item.style === styleOf(grid.kind));
		setStyle(grid.kind, STYLES[(at + 1) % STYLES.size()].style);
	};

    /**
     * Um visual sorteado do gênero escolhido: cabeça, corpo, cabelo e pele, e a roupa combinando. Os
     * estilos não são sorteados: cada peça vem no que está marcado.
     */
	const random = new Random();
	const randomize = () => {
		const gender = lookGender(look());
		const heads = viewOf(grids[0]).lists[0];
		const bodies = viewOf(grids[1]).lists[0];
		if (heads.size() === 0 || bodies.size() === 0) return;
		const head = heads[random.NextInteger(0, heads.size() - 1)];
		const body = bodies[random.NextInteger(0, bodies.size() - 1)];
		let changed = withHead({ ...look(), gender }, head);
		changed.hairRgb =
			random.NextNumber() < 0.4 ? ORIGINAL : HAIR_PRESETS[random.NextInteger(0, HAIR_PRESETS.size() - 1)];
		changed.skinRgb = random.NextNumber() < 0.5 ? ORIGINAL : SKIN_PRESETS[random.NextInteger(0, NATURAL_SKINS - 1)];
		changed = withOutfitPalette(withBody(changed, body), body);
		set(changed);
		for (const grid of grids) pointAtChosen(grid);
	};

	const focusPart = (target: PanelPart) => {
		part(target);
		cursor(target === 2 ? pickValue() : target === 1 && tab() === 0 ? lookGender(look()) : 0);
	};

	const openTab = (index: number) => {
		const wrapped = (index + TABS_LIST.size()) % TABS_LIST.size();
		batch(() => {
			tab(wrapped);
			const grid = gridOf(wrapped);
			if (grid) pointAtChosen(grid);
			if (clothPart() >= clothCount()) clothPart(0);
			if (hairPart() > detailCount()) hairPart(0);
			focusPart(partsOf(wrapped).includes(1) ? 1 : partsOf(wrapped)[0]);
		});
	};

	const choose = () => {
		const at = part();
		const grid = gridOf(tab());
		if (at === 1 && tab() === 0) {
			setGender(cursor() === 1 ? 1 : 0);
		} else if (at === 1 && grid) {
			const piece = listOf(grid)[grid.index()];
			if (piece !== undefined) grid.choose(piece);
		} else if (at === 6) {
			const key = rgbKey();
			if (!key || !paintable()) return;
			set(withValue(look(), key, cursor() === 0 ? ORIGINAL : presets()[cursor() - 1]));
		}
	};

	const favoriteAtCursor = () => {
		const grid = gridOf(tab());
		if (!grid || part() !== 1) return;
		const piece = listOf(grid)[grid.index()];
		if (piece !== undefined) toggleFavorite(grid.kind, grid.pieceId(piece));
	};

	const toggleFavoritesOnly = () => {
		favoritesOnly(!favoritesOnly());
		for (const grid of grids) {
			grid.index(0);
			if (grid.scroller) grid.scroller.CanvasPosition = Vector2.zero;
		}
	};

	const nextAuthor = (grid: Grid, step: number) => {
		const authors = viewOf(grid).authors.size();
		grid.author((grid.author() + step + authors) % authors);
		pointAtChosen(grid);
	};

	const move = (dx: number, dy: number) => {
		const parts = partsOf(tab());
		const at = part();
		const grid = gridOf(tab());
		if (at === 1 && grid) {
			const count = listOf(grid).size();
			if (count === 0) {
				if (dy < 0) focusPart(0);
				else if (dy > 0 && colorStrip()) focusPart(3);
				return;
			}
			const columns = grid.spec.columns;
			if (dy < 0 && grid.index() < columns) {
				focusPart(0);
				return;
			}
			// Da última fileira, para baixo vai à faixa de cor (no Celeiro).
			if (dy > 0 && colorStrip() && math.floor(grid.index() / columns) >= math.floor((count - 1) / columns)) {
				focusPart(3);
				return;
			}
			grid.index(math.clamp(grid.index() + dx + dy * columns, 0, count - 1));
			reveal(grid);
			return;
		}
		if (at === 1 && tab() === 0) {
			cursor((cursor() + dx + GENDERS.size()) % GENDERS.size());
			return;
		}
		if (dy !== 0) {
			const target = parts[math.clamp(parts.indexOf(at) + dy, 0, parts.size() - 1)];
			if (target !== at) focusPart(target);
			return;
		}
		if (at === 0 && grid) {
			nextAuthor(grid, dx);
		} else if (at === 2) {
			const value = (pickValue() + dx + pickCount()) % pickCount();
			setPick(value);
			cursor(value);
		} else if (at === 6) {
			cursor((cursor() + dx + swatchCount()) % swatchCount());
		} else {
			const key = rgbKey();
			if (!key || !paintable()) return;
			const channel = at - 3;
			setChannel(key, channel, math.clamp(channelsOfRgb(partRgb(look(), key) ?? 0)[channel] + dx * CHANNEL_STEP, 0, 255));
		}
	};

	const rotate = (step: number) => turn((turn() + step + TURN_ORDER.size()) % TURN_ORDER.size());

	// Arrastar uma barra de cor ou o puxador da rolagem com o mouse ou o dedo.
	let dragging: { channel: number; track: GuiObject } | undefined;
	let draggingScroll: { grid: Grid; track: GuiObject } | undefined;
	const dragTo = (x: number) => {
		const key = rgbKey();
		if (!dragging || !key || !paintable()) return;
		const { track, channel } = dragging;
		const inner = track.AbsoluteSize.X - 4 * k();
		const fraction = math.clamp((x - track.AbsolutePosition.X - 2 * k()) / math.max(inner, 1), 0, 1);
		setChannel(key, channel, fraction * 255);
	};
	const scrollTo = (y: number) => {
		if (!draggingScroll) return;
		const { grid, track } = draggingScroll;
		const scroller = grid.scroller;
		if (!scroller) return;
		const fraction = math.clamp((y - track.AbsolutePosition.Y) / math.max(track.AbsoluteSize.Y, 1), 0, 1);
		const max = math.max(0, scroller.AbsoluteCanvasSize.Y - scroller.AbsoluteSize.Y);
		scroller.CanvasPosition = new Vector2(0, fraction * max);
	};
	const startColorDrag = (channel: number, track: GuiObject, x: number) => {
		part(3 + channel);
		dragging = { channel, track };
		dragTo(x);
	};
	const startScrollDrag = (grid: Grid, track: GuiObject, y: number) => {
		draggingScroll = { grid, track };
		scrollTo(y);
	};

	let nextBlink = os.clock() + random.NextNumber(BLINK_MIN, BLINK_MAX);
	cleanup(
		RunService.Heartbeat.Connect(() => {
			const now = os.clock();
			const walk = math.floor(now * WALK_FPS) % WALK_FRAMES;
			if (walk !== walkFrame()) walkFrame(walk);
			if (now >= nextBlink + BLINK_TIME) nextBlink = now + random.NextNumber(BLINK_MIN, BLINK_MAX);
			const shut = now >= nextBlink;
			if (shut !== closed()) closed(shut);
		}),
	);

	cleanup(
		UserInputService.InputBegan.Connect((input, processed) => {
			if (processed) return;
			const key = input.KeyCode;
			if (key === Enum.KeyCode.A || key === Enum.KeyCode.Left) move(-1, 0);
			else if (key === Enum.KeyCode.D || key === Enum.KeyCode.Right) move(1, 0);
			else if (key === Enum.KeyCode.W || key === Enum.KeyCode.Up) move(0, -1);
			else if (key === Enum.KeyCode.S || key === Enum.KeyCode.Down) move(0, 1);
			else if (key === Enum.KeyCode.Space) choose();
			else if (key === Enum.KeyCode.Q) openTab(tab() - 1);
			else if (key === Enum.KeyCode.E) openTab(tab() + 1);
			else if (key === Enum.KeyCode.R) rotate(1);
			else if (key === Enum.KeyCode.Z) undo();
			else if (key === Enum.KeyCode.Y) redo();
			else if (key === Enum.KeyCode.F) favoriteAtCursor();
			else if (key === STYLE_KEY) toggleStyle();
			else if (key === Enum.KeyCode.Return) onDone(true);
			else if (key === Enum.KeyCode.Backspace) onDone(false);
		}),
	);
	cleanup(
		UserInputService.InputChanged.Connect((input) => {
			const kind = input.UserInputType;
			if (kind !== Enum.UserInputType.MouseMovement && kind !== Enum.UserInputType.Touch) return;
			if (dragging) dragTo(input.Position.X);
			if (draggingScroll) scrollTo(input.Position.Y);
		}),
	);
	cleanup(
		UserInputService.InputEnded.Connect((input) => {
			const kind = input.UserInputType;
			if (kind === Enum.UserInputType.MouseButton1 || kind === Enum.UserInputType.Touch) {
				dragging = undefined;
				draggingScroll = undefined;
			}
		}),
	);

    /**
     * A disposição do tema diz como é a tela: se as grades têm a faixa de cor e quantas amostras cabem.
     * Chamar ao montar; o foco volta para o começo da aba aberta.
     */
	const useLayout = (options: { colorStrip: boolean; swatchLimit: () => number }) => {
		colorStrip(options.colorStrip);
		swatchLimit = options.swatchLimit;
		openTab(tab());
	};

    /**
     * Mostra a dica `text` em cima do mouse. O MouseEnter dá a posição na tela inteira, com a barra do
     * Roblox; as posições da interface começam embaixo dela.
     */
	const showHint = (text: string, x: number, y: number) => {
		const [inset] = GuiService.GetGuiInset();
		tooltip({ text, x: x - inset.X, y: y - inset.Y - 6 * k() });
	};

	return {
		k,
		onDone,
		look,
		set,
		undo,
		redo,
		randomize,
		tab,
		openTab,
		part,
		focusPart,
		cursor,
		move,
		choose,
		turn,
		rotate,
		walkFrame,
		closed,
		name,
		saved,
		favoritesOnly,
		toggleFavoritesOnly,
		grids,
		gridOf,
		viewOf,
		listOf,
		rowsOf,
		favoriteIds,
		visibleRows,
		nextAuthor,
		setGridView: (height: number, pad: number) => {
			gridHeight = height;
			gridPad = pad;
		},
		gridHeight: () => gridHeight,
		colorStrip,
		useLayout,
		hairPart,
		facePart,
		clothPart,
		clothCount,
		detailCount,
		rgbKey,
		paintable,
		presets,
		swatchCount,
		colorTitle,
		restore,
		pickCount,
		pickValue,
		pickName,
		setPick,
		setGender,
		styleOf,
		setStyle,
		startColorDrag,
		startScrollDrag,
		tooltip,
		showHint,
		characterName,
	};
}

export type Customize = ReturnType<typeof createCustomize>;
