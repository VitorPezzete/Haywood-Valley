// O mapa do mundo no cliente (fase 0 do `docs/mundo/MAPA_MUNDO.md`, 2026-10-23): monta só o que está perto da câmera
// e desmonta o que ficou longe. O gerador (`shared/world/generate.ts`) compõe um bloco de 64 × 64 tiles de uma vez; o
// cliente o monta em 4 **pedaços** de 32 × 32 (`PIECE_TILES`), só os que tocam a vista. Cada pedaço é o que um
// interior com exterior é (`interior.ts`), em pequeno:
//
// - um canvas fixo de 512 × 512 (`createGround`, papel `fixo`) com as imagens já juntadas pelo gerador e os lugares
//   marcados; montado uma vez e nunca mudado (a regra do plano de otimização). Carregar e descarregar é criar e
//   destruir o pedaço.
// - a camada viva do pedaço (papel `vivo`), só com o que anima (a espuma da margem do rio), e o canvas de baixo (papel
//   `mar`) com a água do rio em 4 quadros, quando ela tiver id.
// - os bloqueios do pedaço (`collider.ts`), juntados em retângulos.
//
// Quais pedaços: os que tocam a vista (`worldView`, que o `CameraController` grava) mais `MOUNT_SLACK` tiles de folga
// (o plano: 16); desmonta além de `UNMOUNT_SLACK`. No zoom mais longe (768 px de altura, uns 85 × 48 tiles em 16:9) a
// vista com a folga toca até 3 × 3 blocos, mas só uns 20 pedaços (5 blocos). Compor um bloco e montar um pedaço é
// dividido entre quadros (`BUILD_BUDGET_MS`), o mais perto primeiro; o pedaço do jogador sai antes de tudo, sem divisão.
//
// O que é do jogador e não de um pedaço (a sombra dos bonecos) fica num canvas vivo que acompanha o jogador
// (`actors`), recriado no lugar quando ele se afasta do meio.
//
// **Objetos** (fase 1, 2026-10-23; `shared/world/objetos.ts`, gerado do catálogo `diorama/catalogo/mundo.json`): o
// lugar marcado de um tipo com arte vira, com o id da folha `mundo.objetos.<n>`, um cartão em pé (`card.ts`: o pé no
// meio da borda de baixo da marca, oclusão de árvore ou cheia), uma imagem deitada no canvas fixo (ponte, canteiro,
// o morro e a lagoa) ou, para sebes, muros e cercas, a tira já repetida deitada no canvas fixo (um recorte por trecho
// reto dentro do pedaço). O cartão é do pedaço onde fica o pé dele (um por objeto) e sai com o pedaço. Sem o id, a
// marca de sempre. Os bloqueios vêm de `fase1.ts` (o gerador já tira do catálogo: o tronco, as paredes), valendo com ou
// sem arte. Teste: `MundoObjetosTeste` (só no Studio) troca o id da folha, por exemplo por um
// `rbxasset://textures/...` copiado para a pasta `content` do Studio (a folha sem enviar ao Roblox);
// `MundoMarcas = "cartao"` mostra os objetos sem arte como cartões vazados do tamanho de verdade.

import { RunService, Workspace } from "@rbxts/services";
import { ASSET_LISTS } from "shared/assets";
import {
	BLOCK_TILES,
	blockOpen,
	PIECE_TILES,
	WORLD_MARKS_ATTRIBUTE,
	WORLD_ORIGIN,
	WORLD_TILE,
	worldCellCorner,
	worldCellOf,
	worldKind,
} from "shared/world";
import { composeBlock, missingTextures, RIVER_IMAGES, RIVER_UNDER, WorldBlock, WorldMark } from "shared/world/generate";
import { WORLD_LINES, WORLD_OBJECT_SHEET, WORLD_OBJECTS, WorldStrip } from "shared/world/objetos";
import { ART_PX_PER_STUD, groundOffset, worldToArtPx } from "shared/view";
import { worldView } from "client/state/camera";
import { cardCFrame, createCard } from "./card";
import { createCollider } from "./collider";
import { Occlusion } from "./occlusion";
import { Sprite } from "./sprites";
import { createGround, Ground, GroundLayer, LIVE_Z_OFFSET, SURFACE_MAX_DISTANCE, UNDER_Z_OFFSET } from "./ground";
import { TILE_ANIMATION_FPS } from "./interior";

/** Folga em volta da vista para montar um pedaço, em tiles (o plano: 16). */
const MOUNT_SLACK = 16;
/** Folga para desmontar: maior que a de montar, para um pedaço na beira não ir e voltar a cada passo. */
const UNMOUNT_SLACK = 32;
/** Milissegundos de montagem por quadro, no máximo, fora o pedaço do jogador. */
const BUILD_BUDGET_MS = 4;
/** Blocos compostos guardados além dos que têm pedaço montado (andar de volta não compõe de novo). */
const SPARE_BLOCKS = 6;
/** A vista antes da primeira escrita da câmera: o padrão (540 de altura em 16:9), em pixels de arte. */
const DEFAULT_HALF = new Vector2(480, 270);
/** O canvas vivo dos bonecos: o lado, e quanto o jogador pode se afastar do meio antes de recentrar (pixels). */
const ACTORS_CANVAS = 4096;
const ACTORS_RECENTER = 1024;
/** Pedaços por bloco em cada direção. */
const PIECES_PER_BLOCK = BLOCK_TILES / PIECE_TILES;
const PIECE_PX = PIECE_TILES * WORLD_TILE;
/** As cores dos lugares marcados, por categoria: o que já existe refeito (sem id), o que falta criar, as cercas. */
const MARK_COLORS: Record<string, Color3> = {
	construcao: Color3.fromRGB(205, 92, 70),
	criar: Color3.fromRGB(230, 60, 160),
	vegetacao: Color3.fromRGB(34, 110, 60),
	cerca: Color3.fromRGB(120, 80, 40),
	fechado: Color3.fromRGB(40, 40, 48),
};
const MARK_Z = 20;
/** Os objetos deitados (ponte, canteiros, sebes) no canvas fixo: acima dos tiles, abaixo das marcas. */
const OBJECT_Z = 12;
/** Atributo do Workspace, só no Studio: o id que substitui o da folha dos objetos (testar sem enviar). */
const OBJECTS_TEST_ATTRIBUTE = "MundoObjetosTeste";
/** `MundoMarcas` com este valor: os objetos sem arte viram cartões vazados do tamanho de verdade. */
const STANDING_MARKS = "cartao";

interface MountedPiece {
	px: number;
	py: number;
	folder: Folder;
	animated: { label: ImageLabel; offset: Vector2; step: Vector2; frames: number }[];
	river: ImageLabel[];
	/** O que sai junto com o pedaço e não é dele (o registro dos cartões na oclusão). */
	cleanup: (() => void)[];
	stats: { images: number; liveImages: number; colliders: number; marks: number; cards: number; buildMs: number };
}

const warned = new Set<string>();
function warnOnce(key: string, text: string) {
	if (warned.has(key)) return;
	warned.add(key);
	warn(text);
}

function key(x: number, y: number) {
	return y * 100000 + x;
}

export class WorldMap {
	readonly folder: Folder;
	/** O canvas vivo que acompanha o jogador (as sombras dos bonecos): o `live` da cena no mundo. */
	readonly actors: Ground & { recenter(center: Vector3): void };
	private pieces = new Map<number, MountedPiece>();
	private blocks = new Map<number, { data: WorldBlock; usedAt: number }>();
	private composing = new Set<number>();
	private busy = false;
	private queue = new Array<[number, number]>();
	private shownTick = -1;
	private destroyed = false;
	private marksOn: boolean;
	private standingMarks: boolean;
	/** A folha de cada índice dos objetos (o id do registro, ou o do teste no Studio). */
	private objectSheets: string[];
	private composeWorstMs = 0;
	private buildWorstMs = 0;
	private changed = true;

	constructor(
		parent: Instance,
		private readonly occlusion?: Occlusion,
	) {
		this.folder = new Instance("Folder");
		this.folder.Name = "Mundo";
		this.folder.Parent = parent;
		const marks = Workspace.GetAttribute(WORLD_MARKS_ATTRIBUTE);
		this.marksOn = marks !== false;
		this.standingMarks = marks === STANDING_MARKS;
		this.objectSheets = [...(ASSET_LISTS[WORLD_OBJECT_SHEET] ?? [])];
		const test = RunService.IsStudio() ? Workspace.GetAttribute(OBJECTS_TEST_ATTRIBUTE) : undefined;
		if (typeIs(test, "string") && test !== "") {
			this.objectSheets = this.objectSheets.map(() => test);
			if (this.objectSheets.size() === 0) this.objectSheets.push(test);
			print(`[Mundo] ${OBJECTS_TEST_ATTRIBUTE}: a folha dos objetos é ${test}`);
		} else if (this.objectSheets.every((id) => id === "")) {
			warnOnce("objetos", "[Mundo] mundo.objetos sem id: os objetos ficam como lugares marcados");
		}
		this.actors = createFollowGround(this.folder);
		const missing = missingTextures();
		if (missing.size() > 0) {
			warnOnce(
				"texturas",
				`[Mundo] sem id: ${missing.join(", ")} (assets/registro.json); a base desses terrenos sai lisa`,
			);
		}
		if (!RIVER_UNDER) warnOnce("rio", "[Mundo] mundo.agua_rio.0-3 sem id: a água do rio sai lisa, só a margem anima");
	}

	/** O tipo da célula sob um ponto do chão (6 na água rasa), para o boneco andar na água. */
	kindAt(position: Vector3) {
		const [x, y] = worldCellOf(position);
		return worldKind(x, y);
	}

	/** Se o pedaço do chão sob um ponto já está montado (o véu do nascer espera por ele, `MapController`). */
	groundAt(position: Vector3) {
		const [x, y] = worldCellOf(position);
		return this.pieces.has(key(math.floor(x / PIECE_TILES), math.floor(y / PIECE_TILES)));
	}

	/** As imagens dos pedaços montados, para pré-carregar. */
	images() {
		const images = new Set<string>();
		for (const child of this.folder.GetDescendants()) {
			if (child.IsA("ImageLabel") && child.Image !== "") images.add(child.Image);
		}
		const list = new Array<string>();
		for (const image of images) list.push(image);
		return list;
	}

	/** Os números do painel de desempenho e do teste (`DevToolsController`, atributos da pasta `Mundo`). */
	counts() {
		let images = 0;
		let live = 0;
		let colliders = 0;
		let marks = 0;
		let cards = 0;
		const blocks = new Set<number>();
		for (const [, piece] of this.pieces) {
			cards += piece.stats.cards;
			images += piece.stats.images;
			live += piece.stats.liveImages;
			colliders += piece.stats.colliders;
			marks += piece.stats.marks;
			blocks.add(key(math.floor(piece.px / PIECES_PER_BLOCK), math.floor(piece.py / PIECES_PER_BLOCK)));
		}
		return {
			pieces: this.pieces.size(),
			blocks: blocks.size(),
			images,
			live,
			colliders,
			marks,
			cards,
			composeWorstMs: this.composeWorstMs,
			buildWorstMs: this.buildWorstMs,
			queued: this.queue.size(),
		};
	}

	/**
	 * Confere quais pedaços a vista pede e monta (ou desmonta) o que falta. `focus` é o pé do jogador: o pedaço dele é
	 * montado na hora, sem dividir entre quadros, para o chão nunca faltar debaixo dele.
	 */
	update(focus?: Vector3) {
		if (this.destroyed) return;
		if (focus) this.actors.recenter(focus);
		const origin = worldToArtPx(WORLD_ORIGIN);
		const unbounded = worldView.half.X === math.huge;
		const half = unbounded ? DEFAULT_HALF : worldView.half;
		const center = unbounded && focus ? worldToArtPx(focus) : worldView.center;
		const range = (slack: number) => {
			const min = center.sub(half).sub(origin).div(WORLD_TILE).sub(new Vector2(slack, slack));
			const max = center.add(half).sub(origin).div(WORLD_TILE).add(new Vector2(slack, slack));
			return {
				x0: math.floor(min.X / PIECE_TILES),
				y0: math.floor(min.Y / PIECE_TILES),
				x1: math.floor(max.X / PIECE_TILES),
				y1: math.floor(max.Y / PIECE_TILES),
			};
		};

		// Desmonta o que ficou longe.
		const keep = range(UNMOUNT_SLACK);
		for (const [k, piece] of this.pieces) {
			if (piece.px < keep.x0 || piece.px > keep.x1 || piece.py < keep.y0 || piece.py > keep.y1) {
				for (const undo of piece.cleanup) undo();
				piece.folder.Destroy();
				this.pieces.delete(k);
				this.changed = true;
			}
		}

		// O que falta montar, do mais perto ao mais longe do meio da vista.
		const want = range(MOUNT_SLACK);
		const cx = (center.X - origin.X) / WORLD_TILE / PIECE_TILES;
		const cy = (center.Y - origin.Y) / WORLD_TILE / PIECE_TILES;
		const queue = new Array<[number, number]>();
		for (let py = want.y0; py <= want.y1; py++) {
			for (let px = want.x0; px <= want.x1; px++) {
				const open = blockOpen(math.floor(px / PIECES_PER_BLOCK), math.floor(py / PIECES_PER_BLOCK));
				if (open && !this.pieces.has(key(px, py))) queue.push([px, py]);
			}
		}
		const distance = ([px, py]: [number, number]) => (px + 0.5 - cx) ** 2 + (py + 0.5 - cy) ** 2;
		queue.sort((a, b) => distance(a) < distance(b));
		this.queue = queue;

		// O pedaço do jogador, se ainda não está montado: na hora.
		if (focus) {
			const [fx, fy] = worldCellOf(focus);
			const px = math.floor(fx / PIECE_TILES);
			const py = math.floor(fy / PIECE_TILES);
			const bx = math.floor(px / PIECES_PER_BLOCK);
			const by = math.floor(py / PIECES_PER_BLOCK);
			if (blockOpen(bx, by) && !this.pieces.has(key(px, py)) && !this.composing.has(key(bx, by))) {
				this.mount(px, py, false);
			}
		}
		if (!this.busy && this.queue.size() > 0) {
			const [px, py] = this.queue.shift()!;
			this.busy = true;
			task.spawn(() => {
				this.mount(px, py, true);
				this.busy = false;
			});
		}
		this.forget();
		if (this.changed) this.publish();
	}

	/** Os números nos atributos da pasta `Mundo`, para o teste ler de fora (Play pelo MCP do Studio). */
	private publish() {
		this.changed = false;
		const n = this.counts();
		this.folder.SetAttribute("Pedacos", n.pieces);
		this.folder.SetAttribute("Blocos", n.blocks);
		this.folder.SetAttribute("Imagens", n.images);
		this.folder.SetAttribute("ImagensVivas", n.live);
		this.folder.SetAttribute("Bloqueios", n.colliders);
		this.folder.SetAttribute("Marcas", n.marks);
		this.folder.SetAttribute("Cartoes", n.cards);
		this.folder.SetAttribute("CompoePiorMs", math.round(n.composeWorstMs * 10) / 10);
		this.folder.SetAttribute("MontaPiorMs", math.round(n.buildWorstMs * 10) / 10);
	}

	/** Troca o quadro do que anima (4 por segundo, como os tiles dos interiores); `now` em segundos. */
	animate(now: number) {
		const tick = math.floor(now * TILE_ANIMATION_FPS);
		if (tick === this.shownTick) return;
		this.shownTick = tick;
		const frame = tick % 4;
		for (const [, piece] of this.pieces) {
			for (const item of piece.animated) {
				const offset = item.offset.add(item.step.mul(tick % item.frames));
				if (item.label.ImageRectOffset !== offset) item.label.ImageRectOffset = offset;
			}
			piece.river.forEach((label, index) => {
				const visible = index === frame;
				if (label.Visible !== visible) label.Visible = visible;
			});
		}
	}

	destroy() {
		this.destroyed = true;
		for (const [, piece] of this.pieces) for (const undo of piece.cleanup) undo();
		this.folder.Destroy();
		this.pieces.clear();
		this.blocks.clear();
	}

	/** O bloco composto (do guardado, ou compondo agora; `sliced` divide a composição entre quadros). */
	private blockData(bx: number, by: number, sliced: boolean) {
		const k = key(bx, by);
		const known = this.blocks.get(k);
		if (known) {
			known.usedAt = os.clock();
			return known.data;
		}
		this.composing.add(k);
		let frameStart = os.clock();
		const data = composeBlock(
			bx,
			by,
			sliced
				? () => {
						if ((os.clock() - frameStart) * 1000 < BUILD_BUDGET_MS) return;
						task.wait();
						frameStart = os.clock();
					}
				: undefined,
		);
		this.composing.delete(k);
		this.composeWorstMs = math.max(this.composeWorstMs, data.stats.ms);
		this.blocks.set(k, { data, usedAt: os.clock() });
		return data;
	}

	/** Esquece os blocos compostos sem pedaço montado, além dos `SPARE_BLOCKS` usados por último. */
	private forget() {
		if (this.blocks.size() <= SPARE_BLOCKS) return;
		const inUse = new Set<number>();
		for (const [, piece] of this.pieces) {
			inUse.add(key(math.floor(piece.px / PIECES_PER_BLOCK), math.floor(piece.py / PIECES_PER_BLOCK)));
		}
		const spare = new Array<[number, number]>();
		for (const [k, entry] of this.blocks) if (!inUse.has(k)) spare.push([k, entry.usedAt]);
		spare.sort((a, b) => a[1] > b[1]);
		for (let i = SPARE_BLOCKS; i < spare.size(); i++) this.blocks.delete(spare[i][0]);
	}

	private mount(px: number, py: number, sliced: boolean) {
		const bx = math.floor(px / PIECES_PER_BLOCK);
		const by = math.floor(py / PIECES_PER_BLOCK);
		const data = this.blockData(bx, by, sliced);
		if (this.destroyed || this.pieces.has(key(px, py))) return;
		const piece = this.build(data, px - bx * PIECES_PER_BLOCK, py - by * PIECES_PER_BLOCK);
		this.buildWorstMs = math.max(this.buildWorstMs, piece.stats.buildMs);
		this.pieces.set(key(px, py), piece);
		this.changed = true;
	}

	/** Monta o pedaço (qx, qy) (0 ou 1) do bloco composto. */
	private build(data: WorldBlock, qx: number, qy: number): MountedPiece {
		const started = os.clock();
		const i0 = qx * PIECE_TILES;
		const j0 = qy * PIECE_TILES;
		const folder = new Instance("Folder");
		folder.Name = `Pedaco_${data.bx}_${data.by}_${qx}${qy}`;
		const corner = worldCellCorner(data.bx * BLOCK_TILES + i0, data.by * BLOCK_TILES + j0);
		const center = corner.add(groundOffset(PIECE_PX / 2, PIECE_PX / 2));
		const canvas = new Vector2(PIECE_PX, PIECE_PX);
		const ground = createGround(folder, center, canvas, false);
		ground.part.Name = "PedacoChao";
		const inPiece = (i: number, j: number) => i >= i0 && j >= j0 && i < i0 + PIECE_TILES && j < j0 + PIECE_TILES;

		// O que anima vai para a camada viva só se nenhum recorte parado da mesma célula fica acima dele; senão fica
		// parado no canvas fixo (o canvas fixo nunca muda). Com a margem de areia do gerador, a espuma é sempre o de cima.
		const staticTop = new Map<number, number>();
		data.runs.forEach(([, i, j, w, h, , , , , z, frames], index) => {
			if (frames > 1 || !inPiece(i, j)) return;
			for (let b = j; b < j + h; b++) {
				for (let a = i; a < i + w; a++) {
					const k = b * BLOCK_TILES + a;
					staticTop.set(k, math.max(staticTop.get(k) ?? -math.huge, z * 100000 + index));
				}
			}
		});
		const canGoLive = (i: number, j: number, w: number, h: number, z: number, index: number) => {
			for (let b = j; b < j + h; b++) {
				for (let a = i; a < i + w; a++) {
					const top = staticTop.get(b * BLOCK_TILES + a);
					if (top !== undefined && top > z * 100000 + index) return false;
				}
			}
			return true;
		};
		let live: Ground | undefined;
		const animated = new Array<MountedPiece["animated"][number]>();
		let images = 0;
		let liveImages = 0;
		let frozen = 0;
		data.runs.forEach(([image, i, j, w, h, sx, sy, sw, sh, z, frames, dx, dy, tint], index) => {
			if (!inPiece(i, j)) return;
			const label = new Instance("ImageLabel");
			label.BackgroundTransparency = 1;
			label.Position = UDim2.fromOffset((i - i0) * WORLD_TILE, (j - j0) * WORLD_TILE);
			label.Size = UDim2.fromOffset(w * WORLD_TILE, h * WORLD_TILE);
			label.Image = image;
			label.ImageRectOffset = new Vector2(sx, sy);
			label.ImageRectSize = new Vector2(sw, sh);
			label.ResampleMode = Enum.ResamplerMode.Pixelated;
			label.ZIndex = GroundLayer.Soil + z;
			// Os terrenos lisos dos biomas sem arte: o recorte claro pintado na cor do bioma (o tom do dia multiplica por cima).
			if (tint >= 0) label.ImageColor3 = Color3.fromHex(string.format("%06x", tint));
			let parent: SurfaceGui = ground.gui;
			if (frames > 1) {
				if (canGoLive(i, j, w, h, z, index)) {
					if (!live) {
						live = createGround(folder, center, canvas, false, LIVE_Z_OFFSET, "vivo");
						live.part.Name = "PedacoVivo";
					}
					parent = live.gui;
					animated.push({ label, offset: new Vector2(sx, sy), step: new Vector2(dx, dy), frames });
					liveImages++;
				} else {
					frozen++;
				}
			}
			label.Parent = parent;
			images++;
		});
		if (frozen > 0) warnOnce("parado", `[Mundo] ${frozen} recortes animados ficaram parados em ${folder.Name}`);

		// A água do rio no canvas de baixo, quando ela tem id (senão a água é a base lisa, no canvas fixo).
		const river = new Array<ImageLabel>();
		if (RIVER_UNDER && data.water) {
			const under = createGround(folder, center, canvas, false, UNDER_Z_OFFSET, "mar");
			under.part.Name = "PedacoAgua";
			RIVER_IMAGES.forEach((id, frame) => {
				const label = new Instance("ImageLabel");
				label.Name = `Agua${frame}`;
				label.BackgroundTransparency = 1;
				label.Size = UDim2.fromScale(1, 1);
				label.Image = id;
				label.ResampleMode = Enum.ResamplerMode.Pixelated;
				label.Visible = frame === 0;
				label.Parent = under.gui;
				river.push(label);
				images++;
			});
		}

		// Os objetos com arte (cartões e deitados) e, sem arte, os lugares marcados: o retângulo na cor da categoria e o
		// nome; nada de arte nova (regra do usuário).
		let marks = 0;
		let cards = 0;
		const cleanup = new Array<() => void>();
		const blockCorner = worldCellCorner(data.bx * BLOCK_TILES, data.by * BLOCK_TILES);
		// As marcas e os objetos deitados num quadro que corta o que passa da borda do pedaço (2026-10-23): o canvas do
		// pedaço não corta, e a marca que cruzava a borda saía nos dois pedaços, por cima de si mesma (mais escura).
		const clip = new Instance("Frame");
		clip.Name = "Recorte";
		clip.BackgroundTransparency = 1;
		clip.BorderSizePixel = 0;
		clip.Size = UDim2.fromScale(1, 1);
		clip.ClipsDescendants = true;
		clip.ZIndex = OBJECT_Z;
		clip.Parent = ground.gui;
		const piece: PieceContext = { folder, gui: clip, i0, j0, blockCorner, cleanup };
		for (const mark of data.marks) {
			const drawn = this.drawObject(mark, piece);
			if (drawn === "card") {
				cards++;
				continue;
			}
			if (drawn !== undefined) {
				if (typeIs(drawn, "number")) images += drawn;
				continue;
			}
			if (this.marksOn) {
				const x = mark.x - i0;
				const y = mark.y - j0;
				const w = math.max(mark.w, 1);
				const h = math.max(mark.h, 1);
				if (x + w <= 0 || y + h <= 0 || x >= PIECE_TILES || y >= PIECE_TILES) continue;
				const frame = new Instance("Frame");
				frame.Name = mark.kind;
				const top = y >= 0 && x >= 0;
				frame.BorderSizePixel = 0;
				frame.BackgroundColor3 = MARK_COLORS[mark.category] ?? MARK_COLORS.construcao;
				// Cercas e lugares grandes (o lote, a mata) só com o contorno: o chão continua à mostra.
				const outline =
					mark.category !== "fechado" && w >= 4 && h >= 4 && (mark.category === "cerca" || w * h >= 256);
				frame.BackgroundTransparency =
					mark.category === "fechado" ? 0.35 : outline ? 1 : mark.category === "cerca" ? 0.3 : 0.45;
				if (outline) {
					const stroke = new Instance("UIStroke");
					stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border;
					stroke.Color = frame.BackgroundColor3;
					stroke.Thickness = 2;
					stroke.Transparency = 0.2;
					stroke.Parent = frame;
				}
				frame.Position = UDim2.fromOffset(x * WORLD_TILE, y * WORLD_TILE);
				frame.Size = UDim2.fromOffset(w * WORLD_TILE, h * WORLD_TILE);
				frame.ZIndex = MARK_Z;
				// O nome só no pedaço do canto do lugar; sem nome, as construções mostram o tipo (o que vai ali).
				const name =
					mark.label !== ""
						? mark.label
						: mark.category === "criar" || (mark.category === "construcao" && w * h >= 4)
							? mark.kind
							: "";
				if (name !== "" && top) {
					const text = new Instance("TextLabel");
					text.BackgroundTransparency = 1;
					text.Size = UDim2.fromOffset(math.max(w * WORLD_TILE, 96), 12);
					text.Position = UDim2.fromOffset(0, 0);
					text.Font = Enum.Font.Code;
					text.TextSize = 10;
					text.TextColor3 = Color3.fromRGB(255, 255, 255);
					text.TextStrokeTransparency = 0.3;
					text.TextXAlignment = Enum.TextXAlignment.Left;
					text.Text = name;
					text.ZIndex = MARK_Z + 1;
					text.Parent = frame;
				}
				frame.Parent = clip;
				marks++;
			}
		}

		// Os bloqueios: as células do pedaço que bloqueiam, juntadas em retângulos (como em `interior.ts`).
		const taken = new Array<boolean>(PIECE_TILES * PIECE_TILES);
		const solid = (i: number, j: number) =>
			i < PIECE_TILES &&
			j < PIECE_TILES &&
			!taken[j * PIECE_TILES + i] &&
			data.blocked[(j0 + j) * BLOCK_TILES + i0 + i];
		let colliders = 0;
		for (let j = 0; j < PIECE_TILES; j++) {
			for (let i = 0; i < PIECE_TILES; i++) {
				if (!solid(i, j)) continue;
				let w = 1;
				while (solid(i + w, j)) w++;
				let h = 1;
				let more = true;
				while (more) {
					for (let k = 0; k < w && more; k++) more = solid(i + k, j + h);
					if (more) h++;
				}
				for (let b = 0; b < h; b++) {
					for (let a = 0; a < w; a++) taken[(j + b) * PIECE_TILES + i + a] = true;
				}
				const base = corner.add(groundOffset((i + w / 2) * WORLD_TILE, (j + h) * WORLD_TILE));
				createCollider(folder, "Mundo", base, new Vector2(w, h).mul(WORLD_TILE));
				colliders++;
			}
		}

		folder.Parent = this.folder;
		return {
			px: data.bx * PIECES_PER_BLOCK + qx,
			py: data.by * PIECES_PER_BLOCK + qy,
			folder,
			animated,
			river,
			cleanup,
			stats: { images, liveImages, colliders, marks, cards, buildMs: (os.clock() - started) * 1000 },
		};
	}

	/**
	 * Desenha o objeto do lugar marcado, se o tipo tem arte com id (ou o cartão vazado do teste). Devolve "card" para um
	 * cartão posto, "elsewhere" para o cartão de outro pedaço (o do pé), o número de imagens deitadas postas no canvas
	 * fixo, ou nada quando o lugar fica marcado.
	 */
	private drawObject(mark: WorldMark, piece: PieceContext): "card" | "elsewhere" | number | undefined {
		const object = WORLD_OBJECTS[mark.kind];
		if (object) {
			const [sheet, sx, sy, w, h, ax, ay, form, hides] = object;
			const image = this.objectSheets[sheet] ?? "";
			const standing = form === 0;
			if (image === "" && !(standing && this.standingMarks)) return undefined;
			// O pé no meio da borda de baixo da marca, em pixels do bloco.
			const baseX = (mark.x + math.max(mark.w, 1) / 2) * WORLD_TILE;
			const baseY = (mark.y + math.max(mark.h, 1)) * WORLD_TILE;
			if (!standing) {
				const label = sheetLabel(image, sx, sy, w, h);
				label.Name = mark.kind;
				label.Position = UDim2.fromOffset(
					math.floor(baseX - ax) - piece.i0 * WORLD_TILE,
					baseY - ay - piece.j0 * WORLD_TILE,
				);
				label.Parent = piece.gui;
				return 1;
			}
			// O cartão é do pedaço onde fica o pé (a célula logo acima da borda de baixo).
			const footX = math.floor((baseX - 1) / WORLD_TILE) - piece.i0;
			const footY = math.floor((baseY - 1) / WORLD_TILE) - piece.j0;
			if (footX < 0 || footY < 0 || footX >= PIECE_TILES || footY >= PIECE_TILES) return "elsewhere";
			const position = piece.blockCorner.add(groundOffset(baseX, baseY));
			const sprite: Sprite = {
				image,
				size: new Vector2(w, h),
				anchor: new Vector2(ax, ay),
				frames: [new Vector2(sx, sy)],
			};
			if (image === "") {
				const color = MARK_COLORS[mark.category] ?? MARK_COLORS.construcao;
				createHollowCard(piece.folder, mark.kind, sprite, position, color);
				return "card";
			}
			const card = createCard(piece.folder, mark.kind, sprite, position);
			if (hides > 0 && this.occlusion) {
				piece.cleanup.push(this.occlusion.add(card.image, sprite, position, hides === 1 ? "tree" : "block"));
			}
			return "card";
		}
		const line = WORLD_LINES[mark.kind];
		if (!line) return undefined;
		const ready = (strip?: WorldStrip) => strip === undefined || (this.objectSheets[strip[0]] ?? "") !== "";
		if (!ready(line.h) || !ready(line.v) || (!line.h && !line.v)) return undefined;
		let count = 0;
		const x0 = mark.x * WORLD_TILE;
		const y0 = mark.y * WORLD_TILE;
		const x1 = (mark.x + math.max(mark.w, 1)) * WORLD_TILE;
		const y1 = (mark.y + math.max(mark.h, 1)) * WORLD_TILE;
		// A tira de cima encosta a borda de baixo na da linha de células dela; a do lado, na coluna.
		const row = (strip: WorldStrip, y: number, from: number, to: number) => {
			count += this.stripRun(piece, strip, false, from, to, y + WORLD_TILE - strip[4]);
		};
		const column = (strip: WorldStrip, x: number) => {
			count += this.stripRun(piece, strip, true, y0, y1, x);
		};
		if (!line.outline) {
			if (line.h) row(line.h, y0, x0, x1);
			if (line.v) column(line.v, x0);
			return count;
		}
		// O contorno: em cima, embaixo (com o vão no meio), à esquerda e à direita (encostada na borda de dentro).
		if (line.h) {
			row(line.h, y0, x0, x1);
			const width = math.max(mark.w, 1);
			const left = math.floor((width - line.gap) / 2);
			if (line.gap > 0 && left > 0) {
				row(line.h, y1 - WORLD_TILE, x0, x0 + left * WORLD_TILE);
				row(line.h, y1 - WORLD_TILE, x1 - (width - line.gap - left) * WORLD_TILE, x1);
			} else {
				row(line.h, y1 - WORLD_TILE, x0, x1);
			}
		}
		if (line.v) {
			column(line.v, x0);
			column(line.v, x1 - line.v[3]);
		}
		return count;
	}

	/**
	 * Um trecho reto de sebe ou cerca no canvas fixo do pedaço: o recorte da tira já repetida, começando no passo certo
	 * (o desenho continua de um pedaço para o outro). `from`/`to` ao longo do trecho e `across` do outro lado, em pixels
	 * do bloco. Devolve 1 se pôs a imagem.
	 */
	private stripRun(piece: PieceContext, strip: WorldStrip, vertical: boolean, from: number, to: number, across: number) {
		const [sheet, sx, sy, w, h, step] = strip;
		const start = (vertical ? piece.j0 : piece.i0) * WORLD_TILE;
		const a = math.max(from, start);
		const b = math.min(to, start + PIECE_PX);
		const thickness = vertical ? w : h;
		const crossStart = (vertical ? piece.i0 : piece.j0) * WORLD_TILE;
		if (b <= a || across + thickness <= crossStart || across >= crossStart + PIECE_PX) return 0;
		const phase = (a - from) % step;
		const length = math.min(b - a, (vertical ? h : w) - phase);
		const image = this.objectSheets[sheet];
		const label = vertical
			? sheetLabel(image, sx, sy + phase, w, length)
			: sheetLabel(image, sx + phase, sy, length, h);
		label.Position = vertical
			? UDim2.fromOffset(across - crossStart, a - start)
			: UDim2.fromOffset(a - start, across - crossStart);
		label.Parent = piece.gui;
		return 1;
	}
}

/** O pedaço sendo montado, para quem desenha os objetos nele. */
interface PieceContext {
	folder: Folder;
	gui: GuiObject;
	/** A primeira célula do pedaço dentro do bloco. */
	i0: number;
	j0: number;
	/** O canto do bloco no chão. */
	blockCorner: Vector3;
	cleanup: (() => void)[];
}

/** Uma imagem deitada no canvas fixo: o recorte (x, y, w, h) da folha, no tamanho dele. */
function sheetLabel(image: string, x: number, y: number, w: number, h: number) {
	const label = new Instance("ImageLabel");
	label.BackgroundTransparency = 1;
	label.Size = UDim2.fromOffset(w, h);
	label.Image = image;
	label.ImageRectOffset = new Vector2(x, y);
	label.ImageRectSize = new Vector2(w, h);
	label.ResampleMode = Enum.ResamplerMode.Pixelated;
	label.ZIndex = OBJECT_Z;
	return label;
}

/**
 * O teste dos objetos sem arte (`MundoMarcas = "cartao"`): um cartão vazado (contorno e fundo meio transparente) do
 * tamanho de verdade da imagem, no lugar em que ela vai ficar, para conferir tamanhos, pés e a ordem dos cartões.
 */
function createHollowCard(parent: Instance, name: string, sprite: Sprite, position: Vector3, color: Color3) {
	const part = new Instance("Part");
	part.Name = name;
	part.Anchored = true;
	part.CanCollide = false;
	part.CanQuery = false;
	part.CanTouch = false;
	part.CastShadow = false;
	part.Transparency = 1;
	part.Size = new Vector3(sprite.size.X / ART_PX_PER_STUD, sprite.size.Y / ART_PX_PER_STUD, 0.05);
	part.CFrame = cardCFrame(sprite.size, sprite.anchor, position);
	const gui = new Instance("SurfaceGui");
	gui.Face = Enum.NormalId.Front;
	gui.SizingMode = Enum.SurfaceGuiSizingMode.FixedSize;
	gui.CanvasSize = sprite.size;
	gui.LightInfluence = 0;
	gui.MaxDistance = SURFACE_MAX_DISTANCE;
	gui.Parent = part;
	const frame = new Instance("Frame");
	frame.Size = UDim2.fromScale(1, 1);
	frame.BackgroundColor3 = color;
	frame.BackgroundTransparency = 0.6;
	frame.BorderSizePixel = 0;
	const stroke = new Instance("UIStroke");
	stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border;
	stroke.Color = color;
	stroke.Thickness = 1;
	stroke.Parent = frame;
	frame.Parent = gui;
	part.Parent = parent;
}

/**
 * Um canvas vivo que acompanha o jogador: o `Ground` de sempre, recriado no lugar novo quando o jogador se afasta
 * `ACTORS_RECENTER` pixels do meio. Quem desenha nele (a sombra dos bonecos) move cada imagem a cada quadro, então a
 * troca não aparece.
 */
function createFollowGround(parent: Instance): Ground & { recenter(center: Vector3): void } {
	const canvas = new Vector2(ACTORS_CANVAS, ACTORS_CANVAS);
	let current = createGround(parent, Vector3.zero, canvas, false, LIVE_Z_OFFSET, "vivo");
	current.part.Name = "MundoBonecos";
	let at = new Vector2(math.huge, math.huge);
	const labels = new Set<ImageLabel>();
	const ground = {
		part: current.part,
		gui: current.gui,
		addFlat(sprite: Parameters<Ground["addFlat"]>[0], position: Vector3, layer: number) {
			const label = current.addFlat(sprite, position, layer);
			labels.add(label);
			return label;
		},
		moveFlat(label: ImageLabel, sprite: Parameters<Ground["addFlat"]>[0], position: Vector3) {
			current.moveFlat(label, sprite, position);
		},
		recenter(center: Vector3) {
			const px = worldToArtPx(center);
			if (at.X !== math.huge && px.sub(at).Magnitude < ACTORS_RECENTER) return;
			at = px;
			const moved = createGround(parent, center, canvas, false, LIVE_Z_OFFSET, "vivo");
			moved.part.Name = "MundoBonecos";
			for (const label of labels) {
				if (label.Parent === undefined) labels.delete(label);
				else label.Parent = moved.gui;
			}
			current.part.Destroy();
			current = moved;
			ground.part = moved.part;
			ground.gui = moved.gui;
		},
	};
	return ground;
}
