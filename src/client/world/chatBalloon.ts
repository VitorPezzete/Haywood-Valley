// O balão de fala do chat, que substitui o balão do Roblox em cima do personagem: o corpo e o
// rabinho dos balões de emoticon do Cozy People (folha chat_bubble.png, tools/chat_bubble.py), com o
// texto dentro e, quando o personagem está reagindo, o rosto da reação à esquerda do texto.
//
// É um cartão como os outros objetos do mundo (card.ts), com uma diferença: o canvas do SurfaceGui
// é medido em pixels da tela (o pixel de arte vezes o zoom do mundo), e não em pixels de arte, para a
// letra ser desenhada no tamanho em que aparece e sair nítida. As peças da folha são ampliadas pelo
// mesmo zoom, com `Pixelated`, então continuam do tamanho do resto da arte.
import { TextService, Workspace } from "@rbxts/services";
import { ART_PX_PER_STUD, LOOK, SCREEN_UP, VIEW_DEPTH_PER_PX } from "shared/view";
import { worldZoom } from "client/state/camera";
import { CHAT_TAIL_OVERLAP, ChatArt, chatFaceStep, ChatSlice, Piece } from "client/ui/art";
import { BODY } from "client/ui/kit";
import { cardCFrame } from "./card";
import { SURFACE_MAX_DISTANCE } from "./ground";

// Medidas em pixels de arte.

/** Altura da linha do texto. A letra é a BODY (Montserrat Medium), que tem os acentos. */
const TEXT_SIZE = 8;
/** Largura em que o texto quebra a linha, e quantas linhas cabem; o que passa disso termina em "…". */
const MAX_TEXT_WIDTH = 112;
const MAX_LINES = 3;
/** Da borda de fora do corpo até o texto: dos lados, em cima e embaixo (com a linha de sombra). */
const PAD_X = 5;
const PAD_TOP = 3;
const PAD_BOTTOM = 4;
/** O corpo nunca fica mais estreito que o do balão de reação. */
const MIN_WIDTH = 14;
/** O rosto da reação fica à esquerda do texto, com esta folga até ele. */
const FACE_X = PAD_X - 1;
const FACE_GAP = 2;
/** Tinta do texto: o contorno do balão bem mais escuro, porque o do balão é claro demais para letra. */
const INK = Color3.fromRGB(62, 52, 48);
/**
 * Folga entre o pixel mais alto do boneco (`figureHeight`, que já conta o penteado) e a ponta do
 * rabinho. Com o Curto e o Rabo de cavalo, a ponta fica 41 pixels acima do chão; com o Espetado, 47.
 */
const CLEARANCE = 2;
/**
 * Quanto o balão vem para perto da câmera, medido em pixels de chão: o que está em pé até esta
 * distância à frente do personagem (árvore, arbusto, plantação) passa a ser desenhado antes do balão,
 * então não cobre o texto. O balão encolhe na mesma proporção e continua do mesmo tamanho na tela.
 * Na profundidade comprimida do desenho (`VIEW_DEPTH_PER_PX`).
 */
const LIFT_PX = 160;
const LIFT = LIFT_PX * VIEW_DEPTH_PER_PX;
const THICKNESS = 0.05;

/** Quanto tempo a fala fica à mostra: um tanto fixo e mais um pouco por letra, entre o mínimo e o máximo. */
const SECONDS_BASE = 3;
const SECONDS_PER_LETTER = 0.08;
const SECONDS_MIN = 4;
const SECONDS_MAX = 12;
/** O fim da fala, em que o balão vai sumindo. */
const FADE_SECONDS = 0.4;
/**
 * A reação que chega logo depois da fala ainda põe o rosto no balão. A de quem fala chega quase
 * sempre antes (ela sai na hora; a fala espera o filtro do Roblox), mas pode vir um pouco depois.
 */
const FACE_GRACE = 0.5;

/** Peça da folha num `ImageLabel`, sem esticar. */
function pieceLabel(parent: Instance, piece: Piece, zIndex: number) {
	const label = new Instance("ImageLabel");
	label.BackgroundTransparency = 1;
	label.Image = piece.image;
	label.ImageRectOffset = piece.offset;
	label.ImageRectSize = piece.size;
	label.ResampleMode = Enum.ResamplerMode.Pixelated;
	label.ZIndex = zIndex;
	label.Parent = parent;
	return label;
}

/**
 * O balão do chat de um personagem. A fala nova substitui a que estiver à mostra; o texto é medido
 * antes de aparecer (`TextService`), para o balão ter o tamanho do texto em pixels de arte inteiros.
 */
export class ChatBalloon {
	private readonly part: Part;
	private readonly gui: SurfaceGui;
	private readonly body: ImageLabel;
	private readonly tail: ImageLabel;
	private readonly face: ImageLabel;
	private readonly clip: Frame;
	private readonly label: TextLabel;

	private serial = 0;
	private text = "";
	private pendingSeconds = 0;
	private measuring = false;
	private bounds?: Vector2;
	private measuredZoom = 0;
	private size = Vector2.zero;
	private withFace = false;
	private faceBubble = -1;
	private reaction = -1;
	private openedAt = -1;
	private seconds = 0;
	private transparency = -1;
	private scale = 0;
	private destroyed = false;

	constructor(parent: Instance, name: string) {
		const part = new Instance("Part");
		part.Name = name;
		part.Anchored = true;
		part.CanCollide = false;
		part.CanQuery = false;
		part.CanTouch = false;
		part.CastShadow = false;
		part.Transparency = 1;
		part.Size = new Vector3(1, 1, THICKNESS);

		const gui = new Instance("SurfaceGui");
		gui.Face = Enum.NormalId.Front;
		gui.SizingMode = Enum.SurfaceGuiSizingMode.FixedSize;
		gui.LightInfluence = 0;
		gui.MaxDistance = SURFACE_MAX_DISTANCE;
		gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling;
		// O texto é do jogador, já filtrado e traduzido pelo chat do Roblox: a tradução automática não mexe.
		gui.AutoLocalize = false;
		gui.Enabled = false;
		gui.Parent = part;

		const body = pieceLabel(gui, ChatArt.body, 1);
		body.ScaleType = Enum.ScaleType.Slice;
		const slice = ChatSlice.body;
		body.SliceCenter = new Rect(
			slice.left,
			slice.top,
			ChatArt.body.size.X - slice.right,
			ChatArt.body.size.Y - slice.bottom,
		);
		// O rabinho cobre a borda de baixo do corpo, onde ele sai.
		const tail = pieceLabel(gui, ChatArt.tail, 2);
		const face = pieceLabel(gui, ChatArt.face, 3);
		face.Visible = false;

		// O texto que passa das linhas que cabem fica cortado na borda desta moldura.
		const clip = new Instance("Frame");
		clip.BackgroundTransparency = 1;
		clip.ClipsDescendants = true;
		clip.ZIndex = 3;
		clip.Parent = gui;

		const label = new Instance("TextLabel");
		label.BackgroundTransparency = 1;
		label.FontFace = BODY;
		label.TextColor3 = INK;
		label.LineHeight = 1;
		// O chat do Roblox entrega o texto com <, > e & já trocados por entidades: com RichText eles
		// voltam a aparecer como estão, e ninguém consegue formatar o texto dos outros.
		label.RichText = true;
		label.TextWrapped = true;
		label.TextXAlignment = Enum.TextXAlignment.Center;
		label.TextYAlignment = Enum.TextYAlignment.Top;
		label.AutoLocalize = false;
		label.ZIndex = 3;
		label.Parent = clip;

		part.Parent = parent;
		this.part = part;
		this.gui = gui;
		this.body = body;
		this.tail = tail;
		this.face = face;
		this.clip = clip;
		this.label = label;
	}

	show(text: string) {
		this.serial++;
		this.text = text;
		const [letters] = utf8.len(text);
		const count = typeIs(letters, "number") ? letters : text.size();
		this.pendingSeconds = math.clamp(SECONDS_BASE + count * SECONDS_PER_LETTER, SECONDS_MIN, SECONDS_MAX);
		this.measure(true);
	}

	hide() {
		this.serial++;
		this.measuring = false;
		this.close();
	}

	conceal() {
		if (this.gui.Enabled) this.gui.Enabled = false;
	}

	destroy() {
		this.destroyed = true;
		this.serial++;
		this.part.Destroy();
	}

	update(now: number, ground: Vector3, height: number, reaction: number) {
		this.reaction = reaction;
		if (this.openedAt < 0) return false;
		const age = now - this.openedAt;
		if (age >= this.seconds) {
			this.close();
			return false;
		}

		// O zoom do mundo mudou (o jogador aproximou ou afastou, ou a janela mudou de tamanho): o texto é
		// medido de novo nele.
		if (!this.measuring && worldZoom() !== this.measuredZoom) this.measure(false);

		if (reaction >= 0) {
			if (!this.withFace && age < FACE_GRACE) {
				this.withFace = true;
				this.layout();
			}
			if (this.withFace) this.showFace(reaction);
		}

		// O balão salta para o lugar, como o de reação, mas não flutua: o texto ficaria tremendo.
		const hop = age < 0.08 ? -2 : age < 0.16 ? 1 : 0;
		const anchor = new Vector2(math.floor(this.size.X / 2), this.size.Y);
		this.place(
			cardCFrame(this.size, anchor, ground).add(SCREEN_UP.mul((height + CLEARANCE + hop) / ART_PX_PER_STUD)),
		);
		this.fade(math.clamp((age - (this.seconds - FADE_SECONDS)) / FADE_SECONDS, 0, 1));
		this.gui.Enabled = true;
		return true;
	}

	private close() {
		this.openedAt = -1;
		this.gui.Enabled = false;
	}

	private measure(fresh: boolean) {
		const zoom = worldZoom();
		const serial = this.serial;
		const text = this.text;
		this.measuring = true;
		task.spawn(() => {
			const params = new Instance("GetTextBoundsParams");
			params.Text = text;
			params.Font = BODY;
			params.Size = TEXT_SIZE * zoom;
			params.Width = MAX_TEXT_WIDTH * zoom;
			params.RichText = true;
			const [ok, result] = pcall(() => TextService.GetTextBoundsAsync(params));
			params.Destroy();
			if (this.destroyed || serial !== this.serial) return;
			this.measuring = false;
			if (!ok) {
				warn(`[chat] could not measure the balloon text: ${result}`);
				return;
			}
			this.bounds = result;
			this.measuredZoom = zoom;
			if (fresh) {
				this.label.Text = text;
				this.openedAt = os.clock();
				this.seconds = this.pendingSeconds;
				this.withFace = this.reaction >= 0;
				this.faceBubble = -1;
				if (this.withFace) this.showFace(this.reaction);
				this.fade(0);
			}
			this.layout();
		});
	}

	private layout() {
		const bounds = this.bounds;
		if (!bounds) return;
		const zoom = this.measuredZoom;
		const at = (x: number, y: number) => UDim2.fromOffset(x * zoom, y * zoom);

		const lines = math.max(1, math.round(bounds.Y / (TEXT_SIZE * zoom)));
		const cut = lines > MAX_LINES;
		const textHeight = math.min(lines, MAX_LINES) * TEXT_SIZE;
		const textWidth = cut ? MAX_TEXT_WIDTH : math.clamp(math.ceil(bounds.X / zoom), 1, MAX_TEXT_WIDTH);
		const faceWidth = this.withFace ? ChatArt.face.size.X + FACE_GAP : 0;
		const width = math.max(PAD_X * 2 + faceWidth + textWidth, MIN_WIDTH);
		const bodyHeight = PAD_TOP + textHeight + PAD_BOTTOM;
		const tail = ChatArt.tail.size;
		this.size = new Vector2(width, bodyHeight + tail.Y - CHAT_TAIL_OVERLAP);

		this.gui.CanvasSize = this.size.mul(zoom);
		this.body.Size = at(width, bodyHeight);
		this.body.SliceScale = zoom;
		this.tail.Position = at(math.floor((width - tail.X) / 2), bodyHeight - CHAT_TAIL_OVERLAP);
		this.tail.Size = at(tail.X, tail.Y);

		const face = ChatArt.face.size;
		this.face.Visible = this.withFace;
		this.face.Position = at(FACE_X, PAD_TOP + math.floor((textHeight - face.Y) / 2));
		this.face.Size = at(face.X, face.Y);

		const areaX = PAD_X + faceWidth;
		const areaWidth = width - PAD_X - areaX;
		this.clip.Position = at(areaX, PAD_TOP);
		this.clip.Size = at(areaWidth, textHeight);
		// O rótulo tem a largura em que o texto foi medido, para quebrar as linhas nos mesmos lugares,
		// centrado na área do texto; cada linha fica centrada nele, então nenhuma sai da área.
		this.label.Size = UDim2.fromOffset(MAX_TEXT_WIDTH * zoom, textHeight * zoom);
		this.label.Position = UDim2.fromOffset(math.floor(((areaWidth - MAX_TEXT_WIDTH) * zoom) / 2), 0);
		this.label.TextSize = TEXT_SIZE * zoom;
		this.label.TextTruncate = cut ? Enum.TextTruncate.AtEnd : Enum.TextTruncate.None;
		this.scale = 0;
	}

	private showFace(bubble: number) {
		if (bubble < 0 || bubble === this.faceBubble) return;
		this.faceBubble = bubble;
		this.face.ImageRectOffset = ChatArt.face.offset.add(chatFaceStep(bubble));
	}

	private fade(alpha: number) {
		if (alpha === this.transparency) return;
		this.transparency = alpha;
		this.body.ImageTransparency = alpha;
		this.tail.ImageTransparency = alpha;
		this.face.ImageTransparency = alpha;
		this.label.TextTransparency = alpha;
	}

	private place(at: CFrame) {
		let center = at.Position;
		let scale = 1;
		const camera = Workspace.CurrentCamera;
		if (camera) {
			const eye = camera.CFrame.Position;
			const depth = center.sub(eye).Dot(LOOK);
			// Antes de a câmera do jogo assumir, ela pode estar em qualquer lugar: aí não aproxima.
			if (depth > LIFT * 4) {
				scale = (depth - LIFT) / depth;
				center = eye.add(center.sub(eye).mul(scale));
			}
		}
		if (math.abs(scale - this.scale) > 1e-5) {
			this.scale = scale;
			this.part.Size = new Vector3(
				(this.size.X / ART_PX_PER_STUD) * scale,
				(this.size.Y / ART_PX_PER_STUD) * scale,
				THICKNESS,
			);
		}
		this.part.CFrame = at.Rotation.add(center);
	}
}
