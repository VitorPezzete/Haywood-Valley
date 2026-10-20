import { chestOfPiece, findFixtures } from "shared/fixtures";
import { PieceBoard } from "shared/pieces";
import { createCard } from "./card";
import { GroundLayer } from "./ground";
import { INTERIOR_TILE, Interior, sheetRect } from "./interior";

type Fixture = ReturnType<typeof findFixtures>[number];
type FixtureCell = Fixture["cells"][number];
type Tile = FixtureCell["on"];

/**
 * O que aparece de um baú ou fogão mexido: as imagens por cima dos tiles, o cartão da tampa em pé (o baú grande
 * aberto) e as células acesas (para as luzes).
 */
interface Shown {
	labels: ImageLabel[];
	card?: Part;
	cells: [number, number, Tile][];
}

/**
 * Desenha os baús e fogões do mapa (`shared/fixtures.ts`) no estado da sessão: o mapa fica como está (o canvas
 * grande não muda) e, por cima, na camada viva, os tiles da versão de agora (o baú aberto, a boca acesa) só nas
 * células que mudaram. A peça móvel que é baú abre no lugar; mudou de lugar, fecha.
 *
 * O baú grande aberto tem a tampa em pé nas duas linhas acima dele: ela vai num cartão de frente para a câmera com
 * a base na borda de cima do baú (como a coberta da cama, `ActionController.coverCard`), e quem passa atrás do baú
 * fica atrás da tampa. As células dessas linhas no mapa não mudam: fechar tira o cartão e elas voltam a aparecer.
 */
export class FixtureView {
	private byId = new Map<string, Fixture>();
	/** Ligado ou desligado, por id; sem entrada, o estado de começo. */
	private state = new Map<string, boolean>();
	/** Os baús que são peças móveis, abertos, com a célula onde abriram. */
	private pieces = new Map<string, Vector2>();
	private shown = new Map<string, Shown>();
	readonly fixtures: Fixture[];

	constructor(
		private board: PieceBoard,
		private interior: Interior,
	) {
		this.fixtures = findFixtures(board.map);
		for (const fixture of this.fixtures) {
			this.byId.set(fixture.id, fixture);
			// O baú grande pintado aberto: a tampa do mapa fica deitada; em pé, só no cartão.
			if (fixture.startsOn && fixture.cells.some((cell) => cell.upright)) {
				this.draw(fixture.id, fixture.x, fixture.y, fixture.cells, true, true);
			}
		}
	}

	fixture(id: string) {
		return this.byId.get(id);
	}

	/** O baú ou fogão que ocupa a célula (x, y) do bloco. */
	fixtureAt(x: number, y: number) {
		for (const fixture of this.fixtures) {
			if (x >= fixture.x && y >= fixture.y && x < fixture.x + fixture.w && y < fixture.y + fixture.h) {
				return fixture;
			}
		}
		return undefined;
	}

	isOn(fixture: Fixture) {
		return this.state.get(fixture.id) ?? fixture.startsOn;
	}

	/** Se a peça móvel `id` é um baú e está aberto agora. */
	pieceOpen(id: string) {
		const state = this.board.pieces.get(id);
		const chest = state && chestOfPiece(this.board.defOf(state));
		if (!chest) return false;
		return this.pieces.has(id) !== chest.open;
	}

	set(id: string, on: boolean) {
		const fixture = this.byId.get(id);
		if (fixture) {
			this.state.set(id, on);
			this.draw(id, fixture.x, fixture.y, fixture.cells, on, true);
			return;
		}
		const piece = this.board.pieces.get(id);
		const chest = piece && chestOfPiece(this.board.defOf(piece));
		if (!piece || !chest) return;
		if (on && piece.mode === 0) {
			this.pieces.set(id, new Vector2(piece.x, piece.y));
			// A peça desenhada fechada mostra a versão aberta, e a aberta a fechada.
			this.draw(id, piece.x, piece.y, chest.cells, !chest.open, false);
		} else {
			this.pieces.delete(id);
			this.clear(id);
		}
	}

	/** Se o baú ou fogão `id` (fixo do mapa ou peça móvel) está aberto ou aceso agora. */
	isOpen(id: string) {
		const fixture = this.byId.get(id);
		return fixture ? this.isOn(fixture) : this.pieceOpen(id);
	}

	/**
	 * O retângulo (x, y, w, h) de `id` no bloco: o do baú fixo fechado ou do fogão, ou o da peça móvel onde ela está.
	 * É de onde sai o som: as células desenhadas não servem, porque voltar ao estado pintado no mapa não desenha nada.
	 */
	area(id: string): [number, number, number, number] | undefined {
		const fixture = this.byId.get(id);
		if (fixture) return [fixture.x, fixture.y, fixture.w, fixture.h];
		const piece = this.board.pieces.get(id);
		if (!piece) return undefined;
		const def = this.board.defOf(piece);
		return [piece.x, piece.y, def.w, def.h];
	}

	/** As células acesas de `id`, com o tile de agora. */
	cellsOf(id: string) {
		return this.shown.get(id)?.cells ?? [];
	}

	/** Fecha os baús-peça que saíram do lugar; devolve os ids deles. */
	update() {
		const closed = new Array<string>();
		for (const [id, at] of this.pieces) {
			const piece = this.board.pieces.get(id);
			if (piece && piece.mode === 0 && piece.x === at.X && piece.y === at.Y) continue;
			closed.push(id);
		}
		for (const id of closed) {
			this.pieces.delete(id);
			this.clear(id);
		}
		return closed;
	}

	destroy() {
		for (const [id] of this.shown) this.clear(id);
	}

	private clear(id: string) {
		const shown = this.shown.get(id);
		if (!shown) return;
		for (const label of shown.labels) label.Destroy();
		shown.card?.Destroy();
		this.shown.delete(id);
	}

	private draw(id: string, x: number, y: number, cells: readonly FixtureCell[], on: boolean, skipSame: boolean) {
		this.clear(id);
		const shown: Shown = { labels: [], cells: [] };
		const origin = this.interior.canvasOf(0, 0);
		const lid = new Array<[number, number, Tile]>();
		for (const cell of cells) {
			const cx = x + cell.dx;
			const cy = y + cell.dy;
			const tile = on ? cell.on : cell.off;
			// Sem tile desligado, a célula mostra o mapa como está.
			if (!tile) continue;
			if (on && cell.upright) {
				// A tampa em pé vai sempre para o cartão, mesmo pintada aberta no mapa (lá ela fica deitada).
				lid.push([cx, cy, tile]);
				continue;
			}
			const under = this.board.map.ground(cx, cy);
			if (skipSame && under && under[0] === tile[0] && under[1] === tile[1] && under[2] === tile[2]) continue;
			shown.cells.push([cx, cy, tile]);
			const rect = sheetRect(tile);
			const label = new Instance("ImageLabel");
			label.Name = `Fixture_${id}`;
			label.BackgroundTransparency = 1;
			label.Image = rect.image;
			label.ImageRectOffset = rect.offset;
			label.ImageRectSize = rect.size;
			label.Size = UDim2.fromOffset(INTERIOR_TILE, INTERIOR_TILE);
			const at = origin.add(new Vector2(cx, cy).mul(INTERIOR_TILE));
			label.Position = UDim2.fromOffset(at.X, at.Y);
			label.ResampleMode = Enum.ResamplerMode.Pixelated;
			// Na camada viva, acima das peças (criada depois delas): mexer não refaz o canvas grande dos tiles.
			label.ZIndex = GroundLayer.Piece;
			label.Parent = this.interior.live.gui;
			shown.labels.push(label);
		}
		if (lid.size() > 0) {
			shown.card = this.lidCard(id, lid);
			for (const cell of lid) shown.cells.push(cell);
		}
		this.shown.set(id, shown);
	}

	/**
	 * A tampa em pé: um cartão do tamanho das células, com a base na borda de baixo delas (a de cima do baú). Os
	 * tiles ficam nos mesmos pixels da tela em que estariam no chão; o cartão só muda a ordem com os bonecos.
	 */
	private lidCard(id: string, cells: [number, number, Tile][]) {
		let x0 = math.huge;
		let y0 = math.huge;
		let x1 = -math.huge;
		let y1 = -math.huge;
		for (const [x, y] of cells) {
			x0 = math.min(x0, x);
			y0 = math.min(y0, y);
			x1 = math.max(x1, x);
			y1 = math.max(y1, y);
		}
		const size = new Vector2(x1 - x0 + 1, y1 - y0 + 1).mul(INTERIOR_TILE);
		const card = createCard(
			this.interior.folder,
			`FixtureLid_${id}`,
			{ image: "", size, anchor: new Vector2(0, size.Y), frames: [Vector2.zero] },
			this.interior.cellCorner(x0, y1 + 1),
		);
		card.image.Visible = false;
		const gui = card.image.Parent;
		for (const [x, y, tile] of cells) {
			const rect = sheetRect(tile);
			const label = new Instance("ImageLabel");
			label.Name = `Fixture_${id}`;
			label.BackgroundTransparency = 1;
			label.Image = rect.image;
			label.ImageRectOffset = rect.offset;
			label.ImageRectSize = rect.size;
			label.ResampleMode = Enum.ResamplerMode.Pixelated;
			label.Position = UDim2.fromOffset((x - x0) * INTERIOR_TILE, (y - y0) * INTERIOR_TILE);
			label.Size = UDim2.fromOffset(INTERIOR_TILE, INTERIOR_TILE);
			label.Parent = gui;
		}
		return card.part;
	}
}
