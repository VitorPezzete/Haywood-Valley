import Vide, { cleanup, derive, source } from "@rbxts/vide";
import { RunService, UserInputService } from "@rbxts/services";
import {
	BLUSH_COLORS,
	clampLook,
	EYE_COLORS,
	HAIR_COLORS,
	LIP_COLORS,
	Look,
	lookCount,
	PALETTE_COLUMNS,
	SKIN_COLORS,
	TIE_COLOR,
} from "shared/appearance";
import { FACE_CELL, FACE_ORIGIN, Faces } from "shared/faces";
import { Moods } from "shared/moods";
import { FRAME, WALK_FRAMES, Wardrobe, WardrobePiece } from "shared/wardrobe";
import { look as chosenLook } from "client/state/screen";
import {
	BLINK_POSE,
	CHARACTER_FRAME,
	CharacterLayer,
	headLayers,
	layerExtent,
	layerOf,
	layerOffset,
	layerPosition,
	layerRect,
	layerShows,
	lookLayers,
	MAX_HEAD_LAYERS,
	MAX_LAYERS,
	WALK_FPS,
} from "client/world/characterArt";
import { Facing } from "client/world/sprites";
import { Slice, UiArt } from "./art";
import { art, DESIGN, Hints, INK, LABEL, px, SERIF, sliced, WHITE } from "./kit";

// Medidas em pixels de arte, dentro de um palco de 480×270.
const CARD = { x: 6, y: 4, w: 172, h: 240 };
const PANEL = { x: 183, y: 4, w: 291, h: 240 };
/** Lado das peças do cartão: células quadradas e anéis de cor. */
const SLOT = 26;
/** Grade de opções do painel: 8 colunas. */
const CELL = 26;
const GAP = new Vector2(8, 5);
const GRID = new Vector2(15, 28);
/** Fileira das cores prontas da peça escolhida, embaixo da grade. */
const SUB = { x: 15, y: 164, cell: 24, step: 27 };
/** A mesma fileira quando as opções são muitas (as 14 cores de olho): células menores. */
const SUB_SMALL = { cell: 17, step: 19, from: 11 };
/** Quantas vezes o boneco da prévia é ampliado. */
const PREVIEW_ZOOM = 3;

// Onde fica cada peça dentro do cartão: três à esquerda da prévia, três anéis à direita e duas
// fileiras de acessórios embaixo.
const LEFT = 12;
const RIGHT = CARD.w - 12 - SLOT;
const ROWS = [32, 72, 112];
const ACCESSORY_X = [13, 53, 93, 133];
const ACCESSORY_Y = [167, 203];

const PURPLE = Color3.fromRGB(122, 74, 196);
/** Tinta da célula que guarda a escolha atual. */
const CHOSEN = Color3.fromRGB(214, 190, 255);

/** Canto do recorte das miniaturas dentro do quadro de 32×32: a cabeça ou o corpo. */
const HEAD = new Vector2(6, 6);
const TORSO = new Vector2(6, 12);
/** Meio do rosto no quadro, para as miniaturas de olhos, boca e maquiagem, que mostram só ele ampliado. */
const FACE_FOCUS = new Vector2(16.5, 18.5);
const FACE_ZOOM = 2;
/** Camadas de uma miniatura: as do corpo têm o corpo e a peça; as da cabeça, a cabeça, o cabelo e o laço. */
const TORSO_LAYERS = 2;
const HEAD_LAYERS = MAX_HEAD_LAYERS + 2;
/** Quanto tempo a prévia fica de olhos fechados ao piscar, em segundos. */
const BLINK_SECONDS = 0.13;
/** O rosto que o boneco faz logo depois de uma troca, e por quanto tempo. */
const PLEASED_POSE = Moods.pleased.reaction >= 0 ? Faces.reactions[Moods.pleased.reaction].poses[0] : undefined;
const PLEASED_SECONDS = 0.9;

/** As cores prontas das roupas do pacote, na ordem das folhas. */
const CLOTHES_COLORS = ["Preto", "Azul", "Azul claro", "Marrom", "Verde", "Verde claro", "Rosa", "Roxo", "Vermelho", "Branco"];
/** Ordem em que o boneco da prévia gira. */
const TURN = [Facing.Front, Facing.Left, Facing.Back, Facing.Right];

/** Uma escolha do visual e as opções dela. */
interface Category {
	title: string;
	key: keyof Look;
	/** Células da grade: o maior número de opções que a escolha pode ter. */
	cells: number;
	/** Nas escolhas de cor, a cor de cada opção; `undefined` é a opção "sem". */
	swatch?: (value: number) => Color3 | undefined;
	/** Camadas da miniatura de uma opção. Sem isto, a opção aparece só como cor. */
	layers?: (value: number, look: Look) => CharacterLayer[];
	region?: Vector2;
	/** Em vez de `region`: o ponto do quadro que fica no meio da miniatura, ampliada `zoom` vezes. */
	focus?: Vector2;
	zoom?: number;
	/** Nome da opção, mostrado embaixo da grade. */
	name: (value: number, look: Look) => string;
	/** Aviso quando a escolha não aparece no boneco por causa de outra peça. */
	note?: (look: Look) => string | undefined;
}

/** Uma peça do cartão: abre no painel a grade da escolha principal e, se houver, a das cores dela. */
interface Slot {
	label: string;
	main: Category;
	sub?: Category;
	/** Anel com a cor escolhida, em vez de célula com miniatura. */
	ring?: boolean;
	/** Cor do anel quando ela não é a escolha principal da peça. */
	tint?: (look: Look) => Color3;
	x: number;
	y: number;
}

/** O visual com uma escolha trocada. */
function withValue(look: Look, key: keyof Look, value: number): Look {
	const changed = { ...look };
	changed[key] = value;
	return changed;
}

/** A peça de uma escolha opcional, em que 0 é "sem". */
function pick(pieces: WardrobePiece[], value: number) {
	return value > 0 ? pieces[value - 1] : undefined;
}

function colorName(piece: WardrobePiece | undefined, value: number) {
	return piece && piece.variants === CLOTHES_COLORS.size() ? CLOTHES_COLORS[value] : `Cor ${value + 1}`;
}

const body = (look: Look) => layerOf(Wardrobe.body.block, SKIN_COLORS[look.skin]);
/** A cabeça sem cabelo, com os olhos, a boca e a maquiagem do visual. */
const face = (look: Look) => headLayers(look);

/** Escolha de uma peça opcional que só tem uma cor: chapéu, máscara e brinco. */
function accessory(title: string, key: keyof Look, pieces: WardrobePiece[], none: string): Category {
	return {
		title,
		key,
		cells: pieces.size() + 1,
		region: HEAD,
		layers: (value, look) => {
			const piece = pick(pieces, value);
			return piece ? [...face(look), layerOf(piece.block)] : face(look);
		},
		name: (value) => pick(pieces, value)?.name ?? none,
	};
}

/** Escolha de cor numa paleta. */
function colors(title: string, key: keyof Look, palette: Color3[]): Category {
	return {
		title,
		key,
		cells: palette.size(),
		swatch: (value) => palette[value],
		name: (value) => `Tom ${value + 1}`,
	};
}

/** Maquiagem: uma camada do rosto tingida, com a primeira opção sendo ficar sem. */
function makeup(title: string, key: keyof Look, palette: Color3[], none: string): Category {
	return {
		title,
		key,
		cells: palette.size() + 1,
		focus: FACE_FOCUS,
		zoom: FACE_ZOOM,
		layers: (value, look) => face(withValue(look, key, value)),
		name: (value) => (value > 0 ? `Tom ${value}` : none),
	};
}

/** Formato dos olhos e boca: peças de rosto, mostradas de perto. */
function facePiece(title: string, key: "eyeStyle" | "mouth", names: { name: string }[]): Category {
	return {
		title,
		key,
		cells: names.size(),
		focus: FACE_FOCUS,
		zoom: FACE_ZOOM,
		layers: (value, look) => face(withValue(look, key, value)),
		name: (value) => names[value].name,
	};
}

const coversLegs = (look: Look) => (Wardrobe.top[look.top].full ? "Esta roupa já cobre as pernas." : undefined);

const HAIR: Category = {
	title: "Cabelo",
	key: "hair",
	cells: Wardrobe.hair.size() + 1,
	region: HEAD,
	layers: (value, look) => {
		const hair = pick(Wardrobe.hair, value);
		if (!hair) return face(look);
		const layers = [...face(look), layerOf(hair.block, HAIR_COLORS[look.hairColor])];
		if (hair.extraBlock !== undefined) layers.push(layerOf(hair.extraBlock, TIE_COLOR));
		return layers;
	},
	name: (value) => pick(Wardrobe.hair, value)?.name ?? "Careca",
};

const BEARD: Category = {
	title: "Barba",
	key: "beard",
	cells: 2,
	region: HEAD,
	layers: (value, look) =>
		value > 0 ? [...face(look), layerOf(Wardrobe.beard.block, HAIR_COLORS[look.hairColor])] : face(look),
	name: (value) => (value > 0 ? "Com barba" : "Sem barba"),
};

const TOP: Category = {
	title: "Roupa",
	key: "top",
	cells: Wardrobe.top.size(),
	region: TORSO,
	layers: (value, look) => [body(look), layerOf(Wardrobe.top[value].block + (value === look.top ? look.topColor : 0))],
	name: (value) => Wardrobe.top[value].name,
};

const TOP_COLOR: Category = {
	title: "Cor da roupa",
	key: "topColor",
	cells: CLOTHES_COLORS.size(),
	region: TORSO,
	layers: (value, look) => [body(look), layerOf(Wardrobe.top[look.top].block + value)],
	name: (value, look) => colorName(Wardrobe.top[look.top], value),
};

const BOTTOM: Category = {
	title: "Parte de baixo",
	key: "bottom",
	cells: Wardrobe.bottom.size(),
	region: TORSO,
	layers: (value, look) => [
		body(look),
		layerOf(Wardrobe.bottom[value].block + (value === look.bottom ? look.bottomColor : 0)),
	],
	name: (value) => Wardrobe.bottom[value].name,
	note: coversLegs,
};

const BOTTOM_COLOR: Category = {
	title: "Cor de baixo",
	key: "bottomColor",
	cells: CLOTHES_COLORS.size(),
	region: TORSO,
	layers: (value, look) => [body(look), layerOf(Wardrobe.bottom[look.bottom].block + value)],
	name: (value, look) => colorName(Wardrobe.bottom[look.bottom], value),
	note: coversLegs,
};

const SHOES: Category = {
	title: "Sapato",
	key: "shoes",
	cells: Wardrobe.shoes.variants + 1,
	region: TORSO,
	layers: (value, look) => (value > 0 ? [body(look), layerOf(Wardrobe.shoes.block + value - 1)] : [body(look)]),
	name: (value) => (value > 0 ? colorName(Wardrobe.shoes, value - 1) : "Descalço"),
	note: (look) => (Wardrobe.top[look.top].shoes ? "Esta roupa já vem com sapato." : undefined),
};

const GLASSES: Category = {
	title: "Óculos",
	key: "glasses",
	cells: Wardrobe.glasses.size() + 1,
	region: HEAD,
	layers: (value, look) => {
		const glasses = pick(Wardrobe.glasses, value);
		if (!glasses) return face(look);
		return [...face(look), layerOf(glasses.block + (value === look.glasses ? look.glassesColor : 0))];
	},
	name: (value) => pick(Wardrobe.glasses, value)?.name ?? "Sem óculos",
};

const GLASSES_COLOR: Category = {
	title: "Cor dos óculos",
	key: "glassesColor",
	cells: CLOTHES_COLORS.size(),
	region: HEAD,
	layers: (value, look) => {
		const glasses = pick(Wardrobe.glasses, look.glasses);
		return glasses ? [...face(look), layerOf(glasses.block + value)] : face(look);
	},
	name: (value, look) => colorName(pick(Wardrobe.glasses, look.glasses), value),
};

const EYE_STYLE = facePiece("Olhos", "eyeStyle", Faces.eyes);
const MOUTH: Category = {
	...facePiece("Boca", "mouth", Faces.mouths),
	note: (look) => (look.mask > 0 ? "A máscara cobre a boca." : undefined),
};

// A ordem é a de Q e E: as três peças da esquerda, os três anéis da direita e os acessórios.
const SLOTS: Slot[] = [
	{ label: "Cabelo", main: HAIR, x: LEFT, y: ROWS[0] },
	{ label: "Roupa", main: TOP, sub: TOP_COLOR, x: LEFT, y: ROWS[1] },
	{ label: "Baixo", main: BOTTOM, sub: BOTTOM_COLOR, x: LEFT, y: ROWS[2] },
	{ label: "Cor", main: colors("Cor do cabelo", "hairColor", HAIR_COLORS), ring: true, x: RIGHT, y: ROWS[0] },
	{
		label: "Olhos",
		main: EYE_STYLE,
		sub: colors("Cor dos olhos", "eyes", EYE_COLORS),
		ring: true,
		tint: (look) => EYE_COLORS[look.eyes],
		x: RIGHT,
		y: ROWS[1],
	},
	{ label: "Pele", main: colors("Cor da pele", "skin", SKIN_COLORS), ring: true, x: RIGHT, y: ROWS[2] },
	{ label: "Sapato", main: SHOES, x: ACCESSORY_X[0], y: ACCESSORY_Y[0] },
	{ label: "Óculos", main: GLASSES, sub: GLASSES_COLOR, x: ACCESSORY_X[1], y: ACCESSORY_Y[0] },
	{ label: "Chapéu", main: accessory("Chapéu", "hat", Wardrobe.hat, "Sem chapéu"), x: ACCESSORY_X[2], y: ACCESSORY_Y[0] },
	{ label: "Máscara", main: accessory("Máscara", "mask", Wardrobe.mask, "Sem máscara"), x: ACCESSORY_X[3], y: ACCESSORY_Y[0] },
	{ label: "Brinco", main: accessory("Brinco", "earring", Wardrobe.earring, "Sem brinco"), x: ACCESSORY_X[0], y: ACCESSORY_Y[1] },
	{ label: "Barba", main: BEARD, x: ACCESSORY_X[1], y: ACCESSORY_Y[1] },
	{ label: "Blush", main: makeup("Blush", "blush", BLUSH_COLORS, "Sem blush"), x: ACCESSORY_X[2], y: ACCESSORY_Y[1] },
	{ label: "Boca", main: MOUTH, sub: makeup("Batom", "lipstick", LIP_COLORS, "Sem batom"), x: ACCESSORY_X[3], y: ACCESSORY_Y[1] },
];

function range(count: number) {
	const list: number[] = [];
	for (let index = 0; index < count; index++) list.push(index);
	return list;
}

interface Props {
	k: () => number;
	/** `true` ao confirmar, `false` ao voltar para o menu. */
	onDone: (confirmed: boolean) => void;
}

/**
 * Personalização do personagem. À esquerda, o cartão com a prévia andando no lugar e as peças em
 * volta dela; à direita, as opções da peça aberta e, embaixo, as cores prontas dela. Cada opção
 * aplica na hora.
 */
export function CustomizeScreen({ k, onDone }: Props) {
	const look = source(chosenLook());
	const open = source(0);
	/** 0 é a grade principal; 1 é a fileira de cores da peça. */
	const section = source(0);
	const cursor = source(look()[SLOTS[0].main.key]);
	const facing = source<Facing>(Facing.Front);
	const walkFrame = source(0);
	const blinking = source(false);
	const pleased = source(false);
	let pleasedUntil = 0;

	const slot = () => SLOTS[open()];
	const category = () => (section() === 1 ? slot().sub! : slot().main);
	const count = () => lookCount(category().key, look());
	/** Quantas cores a fileira de baixo mostra; uma cor só não é escolha. */
	const subCount = (which: Slot) => {
		const total = which.sub ? lookCount(which.sub.key, look()) : 0;
		return total > 1 ? total : 0;
	};

	const openSlot = (index: number) => {
		const wrapped = (index + SLOTS.size()) % SLOTS.size();
		// A secao volta antes de trocar a peca: nem toda peca tem fileira de cores.
		section(0);
		open(wrapped);
		cursor(look()[SLOTS[wrapped].main.key]);
	};
	const point = (where: number, value: number) => {
		section(where);
		cursor(value);
	};
	const apply = () => {
		const value = cursor();
		if (value >= count()) return;
		const changed = { ...look() };
		changed[category().key] = value;
		// Trocar de peça pode deixar a cor escolhida fora do que a peça nova tem.
		const result = clampLook(changed);
		look(result);
		chosenLook(result);
		pleasedUntil = os.clock() + PLEASED_SECONDS;
	};
	const move = (dx: number, dy: number) => {
		const total = count();
		if (dx !== 0) {
			cursor((cursor() + dx + total) % total);
			return;
		}
		if (section() === 1) {
			// Da fileira de cores só se sobe, para a última linha da grade.
			if (dy < 0) point(0, lookCount(slot().main.key, look()) - 1);
			return;
		}
		const target = cursor() + dy * PALETTE_COLUMNS;
		if (target >= 0 && target < total) cursor(target);
		else if (dy > 0 && subCount(slot()) > 0) point(1, look()[slot().sub!.key]);
	};
	const turn = (step: number) => {
		facing(TURN[(TURN.indexOf(facing()) + step + TURN.size()) % TURN.size()]);
	};

	let nextBlink = os.clock() + 2;
	cleanup(
		RunService.Heartbeat.Connect(() => {
			const now = os.clock();
			const frame = math.floor(now * WALK_FPS) % WALK_FRAMES;
			if (frame !== walkFrame()) walkFrame(frame);
			// A prévia pisca como o boneco no jogo.
			if (now >= nextBlink + BLINK_SECONDS) nextBlink = now + 2.5 + math.random() * 3.5;
			const closed = now >= nextBlink;
			if (closed !== blinking()) blinking(closed);
			const happy = now < pleasedUntil;
			if (happy !== pleased()) pleased(happy);
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
			else if (key === Enum.KeyCode.Space) apply();
			// Não é o Tab: o Roblox já usa essa tecla para a lista de jogadores.
			else if (key === Enum.KeyCode.Q) openSlot(open() - 1);
			else if (key === Enum.KeyCode.E) openSlot(open() + 1);
			else if (key === Enum.KeyCode.R) turn(1);
			else if (key === Enum.KeyCode.Return) onDone(true);
			// O Esc fica de fora: o Roblox abre o menu dele com essa tecla.
			else if (key === Enum.KeyCode.Backspace) onDone(false);
		}),
	);

	const at = (x: number, y: number) => () => UDim2.fromOffset(x * k(), y * k());
	const cellAt = (index: number) =>
		new Vector2(
			GRID.X + (index % PALETTE_COLUMNS) * (CELL + GAP.X),
			GRID.Y + math.floor(index / PALETTE_COLUMNS) * (CELL + GAP.Y),
		);
	/** Lado e passo das células da fileira de baixo: menores quando a escolha tem muitas opções. */
	const subSize = (which: Slot) => ((which.sub?.cells ?? 0) >= SUB_SMALL.from ? SUB_SMALL : SUB);
	const subAt = (which: Slot, index: number) => new Vector2(SUB.x + index * subSize(which).step, SUB.y);
	/** Canto e lado da opção sob o cursor. */
	const pointed = () =>
		section() === 1
			? { origin: subAt(slot(), cursor()), side: subSize(slot()).cell }
			: { origin: cellAt(cursor()), side: CELL };

	/**
	 * Miniatura de um conjunto de camadas, parada de frente. Mostra a cabeça ou o corpo no tamanho
	 * do jogo, ou só o rosto ampliado quando a escolha é de olhos, boca ou maquiagem.
	 */
	const icon = (layers: () => CharacterLayer[], kind: Category, inset: number, side: number) => {
		const zoom = kind.zoom ?? 1;
		// A miniatura ampliada fica um pouco mais para dentro, para a borda da célula continuar à vista.
		const pad = zoom > 1 ? math.max(inset, 3) : inset;
		const span = (side - pad * 2) / zoom;
		const region = kind.focus
			? new Vector2(math.round(kind.focus.X - span / 2), math.round(kind.focus.Y - span / 2))
			: (kind.region ?? HEAD);
		return (
			<frame
				BackgroundTransparency={1}
				ClipsDescendants={true}
				Position={at(pad, pad)}
				Size={px(k, side - pad * 2, side - pad * 2)}
				ZIndex={14}
			>
				{range(kind.region === TORSO ? TORSO_LAYERS : HEAD_LAYERS).map((index) => {
					const layer = () => layers()[index];
					return (
						<imagelabel
							BackgroundTransparency={1}
							Position={() => {
								const corner = layer()?.face ? FACE_ORIGIN : Vector2.zero;
								return UDim2.fromOffset((corner.X - region.X) * zoom * k(), (corner.Y - region.Y) * zoom * k());
							}}
							Size={() => {
								const extent = (layer()?.face ? FACE_CELL : FRAME) * zoom * k();
								return UDim2.fromOffset(extent, extent);
							}}
							Visible={() => layer() !== undefined}
							Image={() => layer()?.image ?? ""}
							ImageColor3={() => layer()?.color ?? WHITE}
							ImageRectSize={() => {
								const current = layer();
								return current ? layerRect(current) : CHARACTER_FRAME;
							}}
							ImageRectOffset={() => {
								const current = layer();
								return current ? layerOffset(current, 0, Facing.Front) : Vector2.zero;
							}}
							ResampleMode="Pixelated"
							ZIndex={14}
						/>
					);
				})}
			</frame>
		);
	};

	// O boneco da prévia: uma imagem por camada possível. As do corpo mostram o mesmo quadro do
	// andar; as do rosto acompanham a cabeça.
	const previewLayers = derive(() =>
		lookLayers(look(), pleased() && PLEASED_POSE ? PLEASED_POSE : blinking() ? BLINK_POSE : undefined),
	);
	const previewLayer = (index: number) => {
		const layer = () => previewLayers()[index];
		return (
			<imagelabel
				BackgroundTransparency={1}
				Position={() => {
					const current = layer();
					return current ? layerPosition(current, walkFrame()) : UDim2.fromScale(0, 0);
				}}
				Size={() => {
					const current = layer();
					return current ? layerExtent(current) : UDim2.fromScale(1, 1);
				}}
				Visible={() => {
					const current = layer();
					return current !== undefined && layerShows(current, facing());
				}}
				Image={() => layer()?.image ?? ""}
				ImageColor3={() => layer()?.color ?? WHITE}
				ImageRectSize={() => {
					const current = layer();
					return current ? layerRect(current) : CHARACTER_FRAME;
				}}
				ImageRectOffset={() => {
					const current = layer();
					return current ? layerOffset(current, walkFrame(), facing()) : Vector2.zero;
				}}
				ResampleMode="Pixelated"
				ZIndex={14}
			/>
		);
	};

	/** Uma peça do cartão: o nome em cima e a célula (ou o anel) com a escolha atual. */
	const slotButton = (which: Slot, index: number) => {
		const { main } = which;
		const chosen = derive(() => main.layers?.(look()[main.key], look()) ?? []);
		return (
			<frame BackgroundTransparency={1} Position={at(which.x, which.y)} Size={px(k, SLOT, SLOT)} ZIndex={13}>
				<textlabel
					BackgroundTransparency={1}
					AnchorPoint={new Vector2(0.5, 1)}
					Position={() => new UDim2(0.5, 0, 0, -2 * k())}
					Size={px(k, 40, 7)}
					FontFace={LABEL}
					Text={which.label}
					TextColor3={INK}
					TextSize={() => 5 * k()}
					ZIndex={13}
				/>
				{which.ring ? (
					<imagebutton
						{...art(UiArt.dot)}
						Position={at(3, 3)}
						Size={px(k, SLOT - 6, SLOT - 6)}
						ImageColor3={() => which.tint?.(look()) ?? main.swatch?.(look()[main.key]) ?? WHITE}
						ZIndex={13}
						Activated={() => openSlot(index)}
					/>
				) : (
					<imagebutton
						{...sliced(UiArt.slot, Slice.slot, k)}
						Size={UDim2.fromScale(1, 1)}
						ZIndex={13}
						Activated={() => openSlot(index)}
					>
						{icon(chosen, main, 3, SLOT)}
					</imagebutton>
				)}
				{which.ring ? (
					<imagelabel
						BackgroundTransparency={1}
						Size={UDim2.fromScale(1, 1)}
						Image={UiArt.ring.image}
						ImageRectSize={UiArt.ring.size}
						ImageRectOffset={() => (open() === index ? UiArt.ringSelected : UiArt.ring).offset}
						ResampleMode="Pixelated"
						ZIndex={14}
					/>
				) : (
					<imagelabel
						{...sliced(UiArt.slotSelected, Slice.slotSelected, k)}
						Position={at(-2, -2)}
						Size={px(k, SLOT + 4, SLOT + 4)}
						Visible={() => open() === index}
						ZIndex={15}
					/>
				)}
			</frame>
		);
	};

	/** Uma opção do painel: célula com a cor ou com a miniatura da peça. */
	const option = (kind: Category, slotIndex: number, where: number, value: number, origin: Vector2, side: number) => {
		const swatch = kind.swatch?.(value);
		const layers = kind.layers ? derive(() => kind.layers!(value, look())) : undefined;
		return (
			<imagebutton
				{...sliced(UiArt.slot, Slice.slot, k)}
				Position={at(origin.X, origin.Y)}
				Size={px(k, side, side)}
				Visible={() => value < lookCount(kind.key, look())}
				ImageColor3={() => (look()[kind.key] === value ? CHOSEN : WHITE)}
				ZIndex={13}
				MouseEnter={() => {
					if (open() === slotIndex) point(where, value);
				}}
				Activated={() => {
					point(where, value);
					apply();
				}}
			>
				{swatch ? (
					<imagelabel
						{...sliced(UiArt.swatch, Slice.swatch, k)}
						Position={at(2, 2)}
						Size={px(k, side - 4, side - 4)}
						ImageColor3={swatch}
						ZIndex={14}
					/>
				) : undefined}
				{layers ? icon(layers, kind, 2, side) : undefined}
			</imagebutton>
		);
	};

	// As grades de todas as peças existem o tempo todo e só as da peça aberta aparecem: o Vide não
	// deixa criar elementos com propriedades reativas de dentro de um efeito.
	const grids = (which: Slot, index: number) => (
		<frame
			Name={which.main.key}
			BackgroundTransparency={1}
			Size={UDim2.fromScale(1, 1)}
			Visible={() => open() === index}
			ZIndex={12}
		>
			{range(which.main.cells).map((value) => option(which.main, index, 0, value, cellAt(value), CELL))}
			{which.sub ? (
				<frame BackgroundTransparency={1} Size={UDim2.fromScale(1, 1)} Visible={() => subCount(which) > 0} ZIndex={12}>
					<textlabel
						BackgroundTransparency={1}
						Position={at(SUB.x, SUB.y - 10)}
						Size={px(k, 120, 8)}
						FontFace={LABEL}
						Text={which.sub.title}
						TextColor3={INK}
						TextSize={() => 5 * k()}
						TextXAlignment="Left"
						ZIndex={13}
					/>
					{range(which.sub.cells).map((value) =>
						option(which.sub!, index, 1, value, subAt(which, value), subSize(which).cell),
					)}
				</frame>
			) : undefined}
		</frame>
	);

	const pill = (text: string, x: number, y: number, width: number, onPress: () => void) => (
		<imagebutton
			{...sliced(UiArt.pill, Slice.pill, k)}
			AnchorPoint={new Vector2(0.5, 0)}
			Position={at(x, y)}
			Size={px(k, width, 18)}
			ZIndex={13}
			Activated={onPress}
		>
			<textlabel
				BackgroundTransparency={1}
				Size={UDim2.fromScale(1, 1)}
				FontFace={LABEL}
				Text={text}
				TextColor3={INK}
				TextSize={() => 5 * k()}
				ZIndex={14}
			/>
		</imagebutton>
	);

	return (
		<frame
			Name="Customize"
			BackgroundTransparency={1}
			AnchorPoint={new Vector2(0.5, 0.5)}
			Position={UDim2.fromScale(0.5, 0.5)}
			Size={px(k, DESIGN.X, DESIGN.Y)}
			ZIndex={10}
		>
			<imagelabel {...sliced(UiArt.card, Slice.card, k)} Name="Card" Position={at(CARD.x, CARD.y)} Size={px(k, CARD.w, CARD.h)} ZIndex={11}>
				<imagelabel
					{...sliced(UiArt.purpleBar, Slice.purpleBar, k)}
					Position={at(2, 2)}
					Size={px(k, CARD.w - 4, 18)}
					ClipsDescendants={true}
					ZIndex={12}
				>
					<imagelabel
						{...art(UiArt.purpleDiamonds)}
						AnchorPoint={new Vector2(1, 0)}
						Position={() => new UDim2(1, 0, 0, k())}
						Size={px(k, UiArt.purpleDiamonds.size.X, UiArt.purpleDiamonds.size.Y)}
						ZIndex={12}
					/>
					<textlabel
						BackgroundTransparency={1}
						Position={at(6, 0)}
						Size={() => new UDim2(1, 0, 1, 0)}
						FontFace={SERIF}
						Text="Personagem"
						TextColor3={WHITE}
						TextSize={() => 12 * k()}
						TextXAlignment="Left"
						ZIndex={13}
					/>
				</imagelabel>

				<imagelabel
					{...art(UiArt.glow)}
					AnchorPoint={new Vector2(0.5, 0.5)}
					Position={at(CARD.w / 2, 84)}
					Size={px(k, UiArt.glow.size.X, UiArt.glow.size.Y)}
					ZIndex={12}
				/>
				{/* O boneco ocupa a parte de baixo do quadro, então o quadro sobe para ele cair no meio do brilho. */}
				<frame
					Name="Preview"
					BackgroundTransparency={1}
					AnchorPoint={new Vector2(0.5, 0.5)}
					Position={at(CARD.w / 2, 66)}
					Size={px(k, FRAME * PREVIEW_ZOOM, FRAME * PREVIEW_ZOOM)}
					ZIndex={14}
				>
					{range(MAX_LAYERS).map(previewLayer)}
				</frame>
				{pill("<", CARD.w / 2 - 22, 120, 22, () => turn(-1))}
				{pill(">", CARD.w / 2 + 22, 120, 22, () => turn(1))}

				<imagelabel {...sliced(UiArt.clay, Slice.clay, k)} Name="Accessories" Position={at(3, 147)} Size={px(k, CARD.w - 6, CARD.h - 150)} ZIndex={11} />
				<imagelabel
					{...sliced(UiArt.woodBar, Slice.woodBar, k)}
					AnchorPoint={new Vector2(0.5, 0)}
					Position={at(CARD.w / 2, 141)}
					Size={px(k, 96, 14)}
					ZIndex={12}
				>
					<textlabel
						BackgroundTransparency={1}
						Size={() => new UDim2(1, 0, 0, 12 * k())}
						FontFace={LABEL}
						Text="Acessórios"
						TextColor3={INK}
						TextSize={() => 5 * k()}
						ZIndex={13}
					/>
				</imagelabel>

				{SLOTS.map(slotButton)}
			</imagelabel>

			<imagelabel
				{...sliced(UiArt.clay, Slice.clay, k)}
				Name="Options"
				Position={at(PANEL.x, PANEL.y)}
				Size={px(k, PANEL.w, PANEL.h)}
				ZIndex={11}
			>
				<imagelabel {...sliced(UiArt.woodBar, Slice.woodBar, k)} Size={px(k, PANEL.w, 18)} ZIndex={12}>
					<imagelabel
						{...art(UiArt.woodGrain)}
						Position={at(3, 1)}
						Size={px(k, PANEL.w - 6, 15)}
						ScaleType="Tile"
						TileSize={px(k, UiArt.woodGrain.size.X, UiArt.woodGrain.size.Y)}
						ZIndex={12}
					/>
					<textlabel
						BackgroundTransparency={1}
						Position={at(6, 0)}
						Size={() => new UDim2(1, 0, 0, 16 * k())}
						FontFace={SERIF}
						Text={() => slot().main.title}
						TextColor3={INK}
						TextSize={() => 12 * k()}
						TextXAlignment="Left"
						ZIndex={13}
					/>
				</imagelabel>

				{SLOTS.map(grids)}

				<textlabel
					Name="Choice"
					BackgroundTransparency={1}
					Position={at(GRID.X, 198)}
					Size={px(k, 180, 8)}
					FontFace={LABEL}
					Text={() => category().name(math.min(cursor(), count() - 1), look())}
					TextColor3={INK}
					TextSize={() => 5 * k()}
					TextXAlignment="Left"
					ZIndex={13}
				/>
				<textlabel
					Name="Note"
					BackgroundTransparency={1}
					Position={at(GRID.X, 210)}
					Size={px(k, 150, 8)}
					FontFace={LABEL}
					Text={() => category().note?.(look()) ?? ""}
					TextColor3={PURPLE}
					TextSize={() => 5 * k()}
					TextXAlignment="Left"
					ZIndex={13}
				/>
				{pill("Voltar", PANEL.w - 103, 214, 44, () => onDone(false))}
				{pill("Continuar", PANEL.w - 46, 214, 62, () => onDone(true))}

				<imagelabel
					{...sliced(UiArt.slotSelected, Slice.slotSelected, k)}
					Name="Selected"
					Size={() => UDim2.fromOffset((pointed().side + 4) * k(), (pointed().side + 4) * k())}
					Position={() => UDim2.fromOffset((pointed().origin.X - 2) * k(), (pointed().origin.Y - 2) * k())}
					ZIndex={15}
				/>
				<imagelabel
					{...art(UiArt.cursorHand)}
					Name="Hand"
					AnchorPoint={new Vector2(1, 0.5)}
					Size={px(k, UiArt.cursorHand.size.X, UiArt.cursorHand.size.Y)}
					Position={() =>
						UDim2.fromOffset((pointed().origin.X + 3) * k(), (pointed().origin.Y + pointed().side / 2) * k())
					}
					ZIndex={16}
				/>
			</imagelabel>

			<Hints
				k={k}
				hints={[
					{ keys: ["Espaço"], label: "Escolher" },
					{ keys: ["Q", "E"], label: "Peça" },
					{ keys: ["R"], label: "Girar" },
					{ keys: ["Enter"], label: "Continuar" },
					{ keys: ["Backspace"], label: "Voltar" },
				]}
			/>
		</frame>
	);
}
