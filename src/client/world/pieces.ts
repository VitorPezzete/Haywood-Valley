import { ContentProvider } from "@rbxts/services";
import { ART_PX_PER_STUD, groundOffset, LOOK, SCREEN_UP, VIEW_DEPTH_PER_PX } from "shared/view";
import { ASSETS } from "shared/assets";
import { decorVariant } from "shared/decor";
import { ANIMATION_FRAMES, isAnimated } from "shared/interiorMap";
import { PieceBoard, STEP_SECONDS, THROW_SECONDS } from "shared/pieces";
import { Card, cardCFrame, createCard } from "./card";
import { createCollider } from "./collider";
import { GroundLayer } from "./ground";
import { INTERIOR_TILE, Interior, sheetRect, TILE_ANIMATION_FPS } from "./interior";
import { isLightSource } from "./lightTiles";
import { NO_TINT_ATTRIBUTE } from "./tint";

type PieceState = ReturnType<PieceBoard["all"]>[number];
type DecorState = Parameters<typeof decorVariant>[0];
type DecorVariant = ReturnType<typeof decorVariant>;

/** Quanto o objeto jogado sobe no meio do voo, em pixels de arte. */
const THROW_ARC = 20;
/**
 * A base do objeto carregado fica 35 pixels acima da sola (no carry.gani, o objeto de 32 tem o canto 20
 * pixels acima do topo da tela de 48): o voo começa daí.
 */
const CARRIED_HEIGHT = 35;
/** O pote quebrado some aos poucos, em segundos. */
const BREAK_FADE = 0.4;
/**
 * A folha dos cacos do pote, como no Graal: Aseprite/acoes/cacos_pote.png (4 quadros de 64 × 40, a base do
 * pote no meio da borda de baixo), feita por acoes/cacos_pote.py com o desenho e as cores do pote do Aeko.
 * Sem id, o pote quebrado só some aos poucos, e o Output avisa uma vez. A folha é pré-carregada quando o
 * interior monta: antes, o primeiro pote jogado sumia enquanto ela ainda baixava (visto em 2026-10-18). O id no
 * registro (acoes.cacos_pote).
 */
const POT_SHARDS = ASSETS["acoes.cacos_pote"];
const SHARDS_FRAME = new Vector2(64, 40);
const SHARDS_FRAMES = 4;
/** Quadros dos cacos por segundo; o último fica no chão `SHARDS_REST` segundos e some aos poucos. */
const SHARDS_FPS = 8;
const SHARDS_REST = 0.6;
let warnedShards = false;
/**
 * A folha das peças que se levantam, recortadas do fundo (Aseprite/acoes/carregaveis.png, de
 * acoes/carregaveis.py): o tile do Aeko é opaco e traz o piso, que acima da cabeça cortava o cabelo e no
 * voo aparecia como um quadrado. Peça derivada, ainda sem o aval do usuário para enviar: sem id, vai o tile
 * original, posto acima da cabeça sem cobri-la (`PieceArt.cutout`), e o Output avisa uma vez. O id no registro
 * (acoes.carregaveis).
 */
const CARRY_SHEET = ASSETS["acoes.carregaveis"];
/**
 * O recorte de cada peça na folha, [x, y, largura, altura] em pixels (acoes/carregaveis.json): o tile com 1
 * pixel de folga em volta, onde entra o contorno que faltava na borda do tile.
 */
const CARRY_RECTS: Record<string, [number, number, number, number] | undefined> = {
	casa42: [0, 0, 34, 34],
	casa43: [36, 0, 34, 34],
	casa67: [72, 0, 34, 18],
};
let warnedCarry = false;
/** O objeto em voo vem um pouco para perto da câmera, para passar por cima de quem o jogou. */
const FLIGHT_NUDGE = 4 * VIEW_DEPTH_PER_PX;

/** Recorte da folha de uma peça inteira: a imagem que vai no chão, acima da cabeça ou no ar. */
export interface PieceArt {
	image: string;
	offset: Vector2;
	size: Vector2;
	/** Recorte sem o piso: vai por cima da cabeça. */
	cutout?: boolean;
}

interface Drawn {
	id: string;
	label: ImageLabel;
	flying: boolean;
	cell?: Vector2;
	slide?: { from: Vector2; started: number };
	collider?: Part;
	colliderBase?: CFrame;
	colliderCell?: Vector2;
}

interface Flight {
	card: Card;
	from: Vector3;
	to: Vector3;
	size: Vector2;
	started: number;
	breaks: boolean;
	done: () => void;
}

interface DecorDrawn {
	labels: ImageLabel[];
	colliders: Part[];
}

/** Atributo da imagem de um tile animado de peça posta: a linha da folha em que ele foi pintado (o primeiro quadro). */
const DECOR_ANIM_ATTRIBUTE = "DecorAnim";

/**
 * As imagens de uma peça do Decorar com o canto na célula (x, y) do bloco, no canvas do chão: as células que são
 * vizinhas na folha (na mesma metade) viram um recorte só, sem mudar pixel. Serve à peça posta e à peça meio
 * transparente que segue o mouse.
 */
export function decorImages(
	interior: Interior,
	item: DecorState["item"],
	variant: DecorVariant,
	x: number,
	y: number,
	zIndex: number,
) {
	const cells = new Map<number, [number, number]>();
	for (const cell of variant.cells) cells.set(cell[1] * 64 + cell[0], [cell[2], cell[3]]);
	const taken = new Set<number>();
	const sheetAt = (dx: number, dy: number) => (taken.has(dy * 64 + dx) ? undefined : cells.get(dy * 64 + dx));

	const labels = new Array<ImageLabel>();
	const origin = interior.canvasOf(0, 0);
	for (const cell of variant.cells) {
		const [dx, dy, col, row] = cell;
		if (taken.has(dy * 64 + dx)) continue;
		const half = math.floor(col / 64);
		// O tile animado (a chama da tocha) fica sozinho numa imagem, que troca de quadro (`PieceView.update`).
		const animated = isAnimated([item.sheet, col, row]);
		const follows = (i: number, j: number) => {
			const found = sheetAt(dx + i, dy + j);
			return found !== undefined && found[0] === col + i && found[1] === row + j && math.floor(found[0] / 64) === half;
		};
		let w = 1;
		while (!animated && follows(w, 0)) w++;
		let h = 1;
		let more = !animated;
		while (more) {
			for (let i = 0; i < w && more; i++) more = follows(i, h);
			if (more) h++;
		}
		for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) taken.add((dy + j) * 64 + dx + i);

		const art = sheetRect([item.sheet, col, row], w, h);
		const label = new Instance("ImageLabel");
		label.Name = `Decor_${item.id}`;
		label.BackgroundTransparency = 1;
		label.ResampleMode = Enum.ResamplerMode.Pixelated;
		label.Image = art.image;
		label.ImageRectOffset = art.offset;
		label.ImageRectSize = art.size;
		label.Size = UDim2.fromOffset(art.size.X, art.size.Y);
		const at = origin.add(new Vector2(x + dx, y + dy).mul(INTERIOR_TILE));
		label.Position = UDim2.fromOffset(math.round(at.X), math.round(at.Y));
		label.ZIndex = zIndex;
		if (animated) label.SetAttribute(DECOR_ANIM_ATTRIBUTE, row);
		// A chama da tocha e a lâmpada postas ficam na cor cheia à noite, como as do mapa (`tint.ts`).
		if (isLightSource([item.sheet, col, row])) label.SetAttribute(NO_TINT_ATTRIBUTE, true);
		// Na camada viva do chão, com as peças móveis: mudar uma peça não refaz o canvas grande dos tiles.
		label.Parent = interior.live.gui;
		labels.push(label);
	}
	return labels;
}

/**
 * Desenha as peças móveis de um interior (`shared/pieces.ts`) e os bloqueios delas. Cada peça é uma imagem
 * no canvas do chão, na camada `Piece`, acima dos tiles e abaixo das sombras e do boneco, com o recorte
 * inteiro da folha; o chão embaixo dela já mostra o piso (`buildInterior` com o mapa). A peça que bloqueia
 * tem um bloqueio invisível do tamanho dela, que anda junto.
 */
export class PieceView {
	private drawn = new Map<string, Drawn>();
	private flights = new Array<Flight>();
	private decorDrawn = new Map<number, DecorDrawn>();
	/** O quadro dos tiles animados das peças postas; -1 força a troca no próximo `update`. */
	private decorTick = -1;

	constructor(
		private board: PieceBoard,
		private interior: Interior,
	) {
		for (const state of board.all()) this.refresh(state);
		// As folhas que só aparecem quando alguém quebra ou levanta uma peça: baixam já, para não faltarem na hora.
		const sheets = [POT_SHARDS, CARRY_SHEET].filter((id) => id !== "");
		if (sheets.size() > 0) task.spawn(() => ContentProvider.PreloadAsync(sheets));
	}

	/** Desenha (de novo) uma peça posta pelo Decorar, com os bloqueios dela. */
	refreshDecor(state: DecorState) {
		this.removeDecor(state.key);
		// A peça nova entra já no quadro de agora da animação.
		this.decorTick = -1;
		const variant = decorVariant(state);
		const labels = decorImages(this.interior, state.item, variant, state.x, state.y, GroundLayer.Piece);

		const blocking = new Set<number>();
		for (const cell of variant.cells) {
			if (cell[8] === 1) blocking.add(cell[1] * 64 + cell[0]);
		}
		const colliders = new Array<Part>();
		const taken = new Set<number>();
		for (const cell of variant.cells) {
			const [dx, dy] = cell;
			const key = dy * 64 + dx;
			if (!blocking.has(key) || taken.has(key)) continue;
			const free = (i: number, j: number) =>
				blocking.has((dy + j) * 64 + dx + i) && !taken.has((dy + j) * 64 + dx + i);
			let w = 1;
			while (free(w, 0)) w++;
			let h = 1;
			let more = true;
			while (more) {
				for (let i = 0; i < w && more; i++) more = free(i, h);
				if (more) h++;
			}
			for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) taken.add((dy + j) * 64 + dx + i);
			const base = this.interior
				.cellCorner(state.x + dx, state.y + dy)
				.add(groundOffset((w * INTERIOR_TILE) / 2, h * INTERIOR_TILE));
			colliders.push(
				createCollider(this.interior.folder, `Decor_${state.key}`, base, new Vector2(w, h).mul(INTERIOR_TILE)),
			);
		}
		this.decorDrawn.set(state.key, { labels, colliders });
	}

	removeDecor(key: number) {
		const drawn = this.decorDrawn.get(key);
		if (!drawn) return;
		for (const label of drawn.labels) label.Destroy();
		for (const part of drawn.colliders) part.Destroy();
		this.decorDrawn.delete(key);
	}

	/** Deixa meio transparente uma peça posta (chave numérica) ou móvel (id). */
	dim(key: number | string, transparency: number) {
		if (typeIs(key, "number")) {
			for (const label of this.decorDrawn.get(key)?.labels ?? []) label.ImageTransparency = transparency;
		} else if (typeIs(key, "string")) {
			const drawn = this.drawn.get(key);
			if (drawn) drawn.label.ImageTransparency = transparency;
		}
	}

	private art(state: PieceState): PieceArt {
		const def = this.board.defOf(state);
		return sheetRect([def.sheet, def.col, def.row], def.w, def.h);
	}

	/** O recorte da peça levantada ou em voo: o da folha recortada, se ela tem id e a peça está nela. */
	carriedArt(state: PieceState): PieceArt {
		const def = this.board.defOf(state);
		const rect = CARRY_RECTS[def.id];
		if (CARRY_SHEET !== "" && rect) {
			return {
				image: CARRY_SHEET,
				offset: new Vector2(rect[0], rect[1]),
				size: new Vector2(rect[2], rect[3]),
				cutout: true,
			};
		}
		if (!warnedCarry) {
			warnedCarry = true;
			warn(
				"[Pecas] a folha das peças recortadas ainda não tem id (acoes.carregaveis em assets/registro.json): vai o tile com o piso",
			);
		}
		return this.art(state);
	}

	/**
	 * Põe a peça onde o tabuleiro diz. Com `slide`, um passo de uma célula desliza; com `solid`, o bloqueio
	 * vale já durante o deslize.
	 */
	refresh(state: PieceState, slide = false, solid = false) {
		let drawn = this.drawn.get(state.spot.id);
		if (!drawn) {
			const label = new Instance("ImageLabel");
			label.Name = `Piece_${state.spot.id}`;
			label.BackgroundTransparency = 1;
			label.ResampleMode = Enum.ResamplerMode.Pixelated;
			label.ZIndex = GroundLayer.Piece;
			// Na camada viva do chão: a peça desliza e voa sem refazer o canvas grande dos tiles.
			label.Parent = this.interior.live.gui;
			drawn = { id: state.spot.id, label, flying: false };
			this.drawn.set(state.spot.id, drawn);
		}
		const art = this.art(state);
		drawn.label.Image = art.image;
		drawn.label.ImageRectOffset = art.offset;
		drawn.label.ImageRectSize = art.size;
		drawn.label.Size = UDim2.fromOffset(art.size.X, art.size.Y);
		const onFloor = state.mode === 0 || state.mode === 1;
		drawn.label.Visible = onFloor && !drawn.flying;

		const cell = new Vector2(state.x, state.y);
		const last = drawn.cell;
		drawn.cell = cell;
		const moved = last !== undefined ? last.sub(cell).Magnitude : 0;
		const near = moved > 0.5 && moved <= 1.01;
		drawn.slide = slide && onFloor && near && last ? { from: last, started: os.clock() } : undefined;
		this.placeLabel(drawn, drawn.slide ? drawn.slide.from : cell);

		if (state.spot.def.blocks && onFloor && !drawn.flying) {
			if (!drawn.collider) {
				const def = state.spot.def;
				const base = this.interior
					.cellCorner(state.x, state.y)
					.add(groundOffset((def.w * INTERIOR_TILE) / 2, def.h * INTERIOR_TILE));
				drawn.collider = createCollider(
					this.interior.folder,
					`Piece_${state.spot.id}`,
					base,
					new Vector2(def.w, def.h).mul(INTERIOR_TILE),
				);
				drawn.colliderBase = drawn.collider.CFrame;
				drawn.colliderCell = cell;
			}
			this.placeCollider(drawn, drawn.slide ? drawn.slide.from : cell);
			// Deslizando, o bloqueio só volta no fim: quem puxa anda junto e não pode esbarrar nele.
			drawn.collider.CanCollide = solid || drawn.slide === undefined;
		} else if (drawn.collider) {
			drawn.collider.Destroy();
			drawn.collider = undefined;
		}
	}

	private placeLabel(drawn: Drawn, cell: Vector2) {
		const origin = this.interior.canvasOf(0, 0);
		const at = origin.add(cell.mul(INTERIOR_TILE));
		drawn.label.Position = UDim2.fromOffset(math.round(at.X), math.round(at.Y));
	}

	private placeCollider(drawn: Drawn, cell: Vector2) {
		if (!drawn.collider || !drawn.colliderBase || !drawn.colliderCell) return;
		const delta = cell.sub(drawn.colliderCell).mul(INTERIOR_TILE);
		drawn.collider.CFrame = drawn.colliderBase.add(groundOffset(delta.X, delta.Y));
	}

	/** Joga a peça de `from` (no chão, sob quem a carrega) até a célula dela no tabuleiro; `breaks`, ela quebra ao cair. */
	fly(state: PieceState, from: Vector3, breaks: boolean) {
		const drawn = this.drawn.get(state.spot.id);
		if (drawn) {
			drawn.flying = true;
			drawn.label.Visible = false;
			drawn.collider?.Destroy();
			drawn.collider = undefined;
		}
		const art = this.carriedArt(state);
		const def = state.spot.def;
		const anchor = new Vector2(art.size.X / 2, art.size.Y);
		const to = this.interior
			.cellCorner(state.x, state.y)
			.add(groundOffset((def.w * INTERIOR_TILE) / 2, def.h * INTERIOR_TILE));
		const card = createCard(
			this.interior.folder,
			`Thrown_${state.spot.id}`,
			{ image: art.image, size: art.size, anchor, frames: [art.offset] },
			from,
		);
		this.flights.push({
			card,
			from,
			to,
			size: art.size,
			started: os.clock(),
			breaks,
			done: () => {
				if (drawn) drawn.flying = false;
				this.refresh(state);
			},
		});
	}

	/** Os cacos do pote depois do voo; devolve se ainda há o que mostrar. */
	private shatter(flight: Flight, now: number) {
		const since = now - flight.started - THROW_SECONDS;
		if (POT_SHARDS === "") {
			if (!warnedShards) {
				warnedShards = true;
				warn(
					"[Pecas] a folha dos cacos do pote ainda não tem id (acoes.cacos_pote em assets/registro.json): o pote só some",
				);
			}
			const faded = math.clamp(since / BREAK_FADE, 0, 1);
			flight.card.image.ImageTransparency = faded;
			return faded < 1;
		}
		const image = flight.card.image;
		if (image.Image !== POT_SHARDS) {
			// O cartão passa a ter o tamanho do quadro dos cacos, com a base no mesmo ponto do chão.
			image.Image = POT_SHARDS;
			image.ImageRectSize = SHARDS_FRAME;
			const gui = image.Parent as SurfaceGui;
			gui.CanvasSize = SHARDS_FRAME;
			flight.card.part.Size = new Vector3(
				SHARDS_FRAME.X / ART_PX_PER_STUD,
				SHARDS_FRAME.Y / ART_PX_PER_STUD,
				flight.card.part.Size.Z,
			);
			// O voo põe o cartão no lugar a cada quadro, pela medida dele.
			flight.size = SHARDS_FRAME;
		}
		const frame = math.min(math.floor(since * SHARDS_FPS), SHARDS_FRAMES - 1);
		image.ImageRectOffset = new Vector2(frame * SHARDS_FRAME.X, 0);
		const faded = math.clamp((since - SHARDS_FRAMES / SHARDS_FPS - SHARDS_REST) / BREAK_FADE, 0, 1);
		image.ImageTransparency = faded;
		return faded < 1;
	}

	update(now: number) {
		const tick = math.floor(now * TILE_ANIMATION_FPS);
		const decorTick = this.decorTick;
		this.decorTick = tick;
		if (tick !== decorTick) {
			for (const [, drawn] of this.decorDrawn) {
				for (const label of drawn.labels) {
					const row = label.GetAttribute(DECOR_ANIM_ATTRIBUTE);
					if (!typeIs(row, "number")) continue;
					const y = ((row + tick) % ANIMATION_FRAMES) * INTERIOR_TILE;
					if (label.ImageRectOffset.Y !== y) label.ImageRectOffset = new Vector2(label.ImageRectOffset.X, y);
				}
			}
		}

		for (const [, drawn] of this.drawn) {
			const slide = drawn.slide;
			if (!slide) continue;
			const state = this.board.pieces.get(drawn.id);
			if (!state) continue;
			const to = new Vector2(state.x, state.y);
			const t = math.clamp((now - slide.started) / STEP_SECONDS, 0, 1);
			// Em pixels de arte inteiros, para a peça não ficar entre dois pixels.
			const px = slide.from.mul(INTERIOR_TILE).Lerp(to.mul(INTERIOR_TILE), t);
			const cell = new Vector2(math.round(px.X), math.round(px.Y)).div(INTERIOR_TILE);
			this.placeLabel(drawn, cell);
			this.placeCollider(drawn, cell);
			if (t >= 1) {
				drawn.slide = undefined;
				if (drawn.collider) drawn.collider.CanCollide = true;
			}
		}

		for (let index = this.flights.size() - 1; index >= 0; index--) {
			const flight = this.flights[index];
			const t = math.clamp((now - flight.started) / THROW_SECONDS, 0, 1);
			const ground = flight.from.Lerp(flight.to, t);
			const height = CARRIED_HEIGHT * (1 - t) + THROW_ARC * 4 * t * (1 - t);
			flight.card.part.CFrame = cardCFrame(flight.size, new Vector2(flight.size.X / 2, flight.size.Y), ground)
				.add(SCREEN_UP.mul(math.round(height) / ART_PX_PER_STUD))
				.sub(LOOK.mul(FLIGHT_NUDGE));
			if (t < 1) continue;
			if (flight.breaks) {
				if (this.shatter(flight, now)) continue;
			}
			flight.card.part.Destroy();
			this.flights.remove(index);
			flight.done();
		}
	}
}
