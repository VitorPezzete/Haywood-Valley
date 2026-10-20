// O tom do dia e a força das luzes conforme a hora (decisão do usuário em 2026-10-17 e 18, com as prévias
// de `Aseprite\iluminacao\previas_v2`). O tom multiplica a cor de tudo o que é desenhado no mundo
// (`ImageColor3`); a luz do próprio Roblox não entra nas imagens. As cores saem do `luzes.json` da versão 2
// (`Aseprite\exterior_teste\v2`), que o `gerar_exterior.py` grava; a madrugada não estava nas prévias.

/** Um ponto do dia: a hora, o tom e a força das luzes desenhadas em pixel (0 apagadas, 1 inteiras). */
interface DayPoint {
	hour: number;
	name: string;
	tone: Color3;
	lights: number;
}

const NIGHT = Color3.fromHex("#8c90bc");
const DAWN = Color3.fromHex("#aaa6cc");
const MORNING = Color3.fromHex("#ffe4b4");
const NOON = Color3.fromHex("#ffffff");
const AFTERNOON = Color3.fromHex("#fff0dc");
const SUNSET = Color3.fromHex("#ffc8a0");

/**
 * Os pontos do dia, em ordem de hora; entre dois, o tom e a força vão de um ao outro em linha reta.
 * - Noite (#8c90bc, luzes inteiras): a mais escura das prévias, pedida pelo usuário ("noite mais escura").
 * - Madrugada (#aaa6cc, 0,7): o clarão antes do sol. Não estava nas prévias da versão 2; a da versão 1
 *   (#7d8cc0) ficava mais escura que a noite nova e perdia o degrau das rampas, então esta é a passagem
 *   da noite para a manhã, mais azulada.
 * - Manhã (#ffe4b4, 0): mais dourada, pedido do usuário.
 * - Meio-dia (#ffffff, 0): a arte como foi pintada.
 * - Tarde (#fff0dc, 0,35) e pôr do sol (#ffc8a0, 0,7).
 * As horas de teste das capturas (7, 12, 17, 19 e 23) caem em cheio na manhã, no meio-dia, na tarde, no pôr
 * do sol e na noite.
 */
const DAY: DayPoint[] = [
	{ hour: 0, name: "noite", tone: NIGHT, lights: 1 },
	{ hour: 4, name: "noite", tone: NIGHT, lights: 1 },
	{ hour: 5.5, name: "madrugada", tone: DAWN, lights: 0.7 },
	{ hour: 7, name: "manhã", tone: MORNING, lights: 0 },
	{ hour: 9, name: "manhã", tone: MORNING, lights: 0 },
	{ hour: 11, name: "meio-dia", tone: NOON, lights: 0 },
	{ hour: 14, name: "meio-dia", tone: NOON, lights: 0 },
	{ hour: 17, name: "tarde", tone: AFTERNOON, lights: 0.35 },
	{ hour: 19, name: "pôr do sol", tone: SUNSET, lights: 0.7 },
	{ hour: 20.5, name: "noite", tone: NIGHT, lights: 1 },
	{ hour: 24, name: "noite", tone: NIGHT, lights: 1 },
];

/**
 * Com as luzes acima desta força, as janelas mostram a versão de noite da folha do Aeko e a lua entra pela
 * janela: das 19h45 às 4h45, mais ou menos. No pôr do sol (0,7) o céu ainda é claro.
 */
const NIGHT_WINDOWS_FROM = 0.85;

/**
 * A luz do sol que entra pelas janelas e desenha no piso a mancha da janela (pedido do usuário em 2026-10-18):
 * [hora, força]. Mais forte de manhã e à tarde, quando o sol vem baixo, mais fraca ao meio-dia, nenhuma à noite.
 */
const SUN: [number, number][] = [
	[0, 0],
	[5.5, 0],
	[6.5, 0.5],
	[8, 0.8],
	[10, 0.55],
	[12, 0.35],
	[14, 0.45],
	[16.5, 0.75],
	[18.5, 0.85],
	[19.5, 0.5],
	[20, 0],
	[24, 0],
];
/** Das 18h às 20h, a mancha do sol fica alaranjada e mais comprida (o recorte `janela_poente`). */
const DUSK_FROM = 18;
const DUSK_UNTIL = 20;
/** O sol atravessa o céu entre estas horas: a mancha vai de um lado (-1, manhã) ao outro (+1, tarde). */
const SUN_EAST = 6.5;
const SUN_WEST = 18.5;

/** A força do sol pelas janelas na hora `h` (0 a 24). */
function sunAt(h: number) {
	for (let i = 0; i < SUN.size() - 1; i++) {
		const [h0, s0] = SUN[i];
		const [h1, s1] = SUN[i + 1];
		if (h >= h0 && h <= h1) return h1 > h0 ? s0 + ((s1 - s0) * (h - h0)) / (h1 - h0) : s0;
	}
	return 0;
}

/** O tom e a força das luzes na hora `hour` (0 a 24). */
export function daylightAt(hour: number) {
	const h = ((hour % 24) + 24) % 24;
	let a = DAY[0];
	let b = DAY[DAY.size() - 1];
	for (let i = 0; i < DAY.size() - 1; i++) {
		if (h >= DAY[i].hour && h <= DAY[i + 1].hour) {
			a = DAY[i];
			b = DAY[i + 1];
			break;
		}
	}
	const t = b.hour > a.hour ? (h - a.hour) / (b.hour - a.hour) : 0;
	const lights = a.lights + (b.lights - a.lights) * t;
	return {
		hour: h,
		tone: a.tone.Lerp(b.tone, t),
		lights,
		night: lights >= NIGHT_WINDOWS_FROM,
		name: t < 0.5 ? a.name : b.name,
		sun: sunAt(h),
		sunSide: math.clamp(((h - SUN_EAST) / (SUN_WEST - SUN_EAST)) * 2 - 1, -1, 1),
		dusk: h >= DUSK_FROM && h < DUSK_UNTIL,
	};
}
