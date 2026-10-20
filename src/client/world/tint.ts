// O tom do dia nas imagens do mundo. Cada `ImageLabel` (e o texto dos balões) desenhado no mundo tem a cor
// multiplicada pelo tom da hora (`shared/daylight.ts`): `ImageColor3` = cor dela × tom. A luz do Roblox não
// entra (os `SurfaceGui` ficam com `LightInfluence = 0`), e a interface, em `ScreenGui`, fica de fora.
//
// Por que uma cor por imagem, e não um `CanvasGroup` por `SurfaceGui`: o `CanvasGroup` desenha o conteúdo
// numa textura e a refaz a cada mudança dentro dele (o boneco muda a cada quadro), gasta memória de textura
// do tamanho do canvas (o chão do interior tem uns 2560 × 1824 pixels de arte) e reamostra essa textura ao
// desenhar, o que pode borrar o pixel. O `SurfaceGui` não tem cor própria (só `Brightness`, sem cor). Já o
// `ImageColor3` é uma propriedade de cada imagem, sem textura nova: trocar o tom é um laço que muda uma cor
// por imagem, e só quando o tom muda (`TINT_INTERVAL`). O custo medido fica no Output (`[Luz]`).
const TINT_INTERVAL = 0.25;

/**
 * Atributo que deixa uma imagem fora do tom: os halos e as fontes de luz (a chama, a lâmpada, o vidro aceso),
 * que ficam na cor cheia à noite.
 */
export const NO_TINT_ATTRIBUTE = "SemTom";

type Tinted = ImageLabel | TextLabel;

/** A cor de cada imagem sem o tom: a que o código que a criou pôs nela. */
const bases = new Map<Tinted, Color3>();
/** O tom próprio de algumas imagens, no lugar do tom do dia: o boneco dentro de um halo (`setOwnTone`). */
const own = new Map<Tinted, Color3>();
let tone = new Color3(1, 1, 1);
let appliedAt = -math.huge;

/** Quanto levou a última troca de tom, em milissegundos, e em quantas imagens. */
export const tintStats = { images: 0, lastMs: 0, maxMs: 0, applies: 0 };

function times(a: Color3, b: Color3) {
	return new Color3(a.R * b.R, a.G * b.G, a.B * b.B);
}

function paint(label: Tinted, base: Color3) {
	const color = times(base, own.get(label) ?? tone);
	if (label.IsA("ImageLabel")) {
		label.ImageColor3 = color;
	} else {
		label.TextColor3 = color;
	}
}

function track(instance: Instance) {
	if (!instance.IsA("ImageLabel") && !instance.IsA("TextLabel")) return;
	if (instance.GetAttribute(NO_TINT_ATTRIBUTE) === true || bases.has(instance)) return;
	const base = instance.IsA("ImageLabel") ? instance.ImageColor3 : instance.TextColor3;
	bases.set(instance, base);
	paint(instance, base);
}

/** Tira a imagem do tom e devolve a cor dela, para que entrar de novo no mundo não tinja duas vezes. */
function untrack(instance: Instance) {
	if (!instance.IsA("ImageLabel") && !instance.IsA("TextLabel")) return;
	const base = bases.get(instance);
	if (!base) return;
	bases.delete(instance);
	own.delete(instance);
	if (instance.IsA("ImageLabel")) {
		instance.ImageColor3 = base;
	} else {
		instance.TextColor3 = base;
	}
}

/**
 * Passa a tingir tudo o que há e o que entrar em `root` (a pasta `World` do `SceneController`). A cor de
 * base de cada imagem é lida no fim do quadro em que ela entra, depois de o código que a criou pôr as
 * propriedades; quem muda a cor de uma imagem depois disso chama `setTintBase`.
 */
export function watchTint(root: Instance) {
	for (const instance of root.GetDescendants()) track(instance);
	const added = root.DescendantAdded.Connect((instance) => {
		if (!instance.IsA("ImageLabel") && !instance.IsA("TextLabel")) return;
		task.defer(() => {
			if (instance.IsDescendantOf(root)) track(instance);
		});
	});
	const removing = root.DescendantRemoving.Connect(untrack);
	return () => {
		added.Disconnect();
		removing.Disconnect();
	};
}

/**
 * Dá à imagem um tom só dela no lugar do tom do dia, ou volta ao tom do dia com nada: o boneco perto de uma luz
 * clareia e esquenta como o chão em volta. Quem chama compara antes, para não pintar a cada quadro à toa.
 */
export function setOwnTone(label: Tinted, color: Color3 | undefined) {
	if (color) {
		own.set(label, color);
	} else {
		own.delete(label);
	}
	const base = bases.get(label);
	if (base) paint(label, base);
}

/** O tom do dia em uso agora. */
export function dayTone() {
	return tone;
}

/** Muda a cor de base de uma imagem do mundo (a pintura do boneco); ela aparece já com o tom. */
export function setTintBase(label: ImageLabel, color: Color3) {
	if (bases.has(label)) {
		bases.set(label, color);
		paint(label, color);
	} else {
		label.ImageColor3 = color;
	}
}

/**
 * Pede o tom `color`. Só muda as imagens quando o tom muda de verdade (em passos de 1/255) e no máximo a cada
 * `TINT_INTERVAL` segundos: num dia de 10 minutos, o tom anda uns 2 passos por segundo nas passagens.
 */
export function setTone(color: Color3, now: number, force = false) {
	const quantized = Color3.fromRGB(math.round(color.R * 255), math.round(color.G * 255), math.round(color.B * 255));
	if (quantized === tone && !force) return;
	if (!force && now - appliedAt < TINT_INTERVAL) return;
	appliedAt = now;
	tone = quantized;
	const started = os.clock();
	let count = 0;
	for (const [label, base] of bases) {
		paint(label, base);
		count++;
	}
	const ms = (os.clock() - started) * 1000;
	tintStats.images = count;
	tintStats.lastMs = ms;
	tintStats.maxMs = math.max(tintStats.maxMs, ms);
	tintStats.applies++;
}

/** Quantas imagens o tom pinta agora. */
export function tintedCount() {
	return bases.size();
}
