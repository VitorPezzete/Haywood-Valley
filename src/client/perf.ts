// Medidas de desempenho do cliente (fase 0 do `PLANO_OTIMIZACAO.md`, seção 9.1). Cada sistema que roda a cada
// quadro abre e fecha um rótulo (`perfBegin`, `perfEnd`): o rótulo aparece no MicroProfiler do Roblox (Ctrl+F6
// no Studio) sempre, e o tempo é somado aqui só enquanto o painel de desempenho está ligado (`perfOn`), para
// não gastar nada à toa. O `DevToolsController` lê e zera as somas a cada meio segundo.

/** Os sistemas medidos, na ordem em que o painel mostra. */
export const PERF_SYSTEMS = [
	"Bonecos",
	"Moradores",
	"Baloes",
	"Tom",
	"Luzes",
	"Tiles",
	"Vento",
	"Oclusao",
	"Camera",
	"Acoes",
	"Mapa",
	"Humor",
	"Decorar",
	"Som",
] as const;
export type PerfSystem = (typeof PERF_SYSTEMS)[number];

interface Sum {
	total: number;
	worst: number;
	calls: number;
}

const sums = new Map<PerfSystem, Sum>();
for (const name of PERF_SYSTEMS) sums.set(name, { total: 0, worst: 0, calls: 0 });

/** O nome de cada rótulo no MicroProfiler, feito uma vez só (sem montar texto a cada quadro). */
const PROFILE_NAMES = new Map<PerfSystem, string>();
for (const name of PERF_SYSTEMS) PROFILE_NAMES.set(name, `HV ${name}`);

let on = false;

/** Liga ou desliga a soma dos tempos (o rótulo do MicroProfiler vale sempre). */
export function setPerfOn(value: boolean) {
	on = value;
	if (!value) for (const [, sum] of sums) resetSum(sum);
}

/** Se a soma dos tempos está ligada (o painel de desempenho à mostra). */
export function perfOn() {
	return on;
}

function resetSum(sum: Sum) {
	sum.total = 0;
	sum.worst = 0;
	sum.calls = 0;
}

/** Abre o rótulo do sistema; devolve a hora de começo (0 com a soma desligada), para o `perfEnd`. */
export function perfBegin(name: PerfSystem) {
	debug.profilebegin(PROFILE_NAMES.get(name)!);
	return on ? os.clock() : 0;
}

/** Fecha o rótulo aberto por `perfBegin` e soma o tempo dele. */
export function perfEnd(name: PerfSystem, started: number) {
	debug.profileend();
	if (!on || started === 0) return;
	const ms = (os.clock() - started) * 1000;
	const sum = sums.get(name)!;
	sum.total += ms;
	sum.calls += 1;
	if (ms > sum.worst) sum.worst = ms;
}

/** Uma leitura de um sistema: a média por quadro e a vez mais lenta, em milissegundos. */
export interface PerfReading {
	name: PerfSystem;
	perFrameMs: number;
	worstMs: number;
}

/** Lê as somas desde a última leitura, divididas pelos `frames` quadros do período, e zera. */
export function takePerf(frames: number) {
	const readings = new Array<PerfReading>();
	const count = math.max(frames, 1);
	for (const name of PERF_SYSTEMS) {
		const sum = sums.get(name)!;
		readings.push({ name, perFrameMs: sum.total / count, worstMs: sum.worst });
		resetSum(sum);
	}
	return readings;
}

/**
 * Atributo dos `SurfaceGui` deitados no chão, com o papel de cada um: "fixo" (os tiles parados, o canvas grande),
 * "vivo" (a camada viva: sombras, tiles animados, halos) e "mar" (o mar de fora, embaixo de tudo). O painel conta
 * em quantos quadros por segundo cada um teve alguma imagem mudada, o que obriga o Roblox a refazer o desenho
 * dele (página do `SurfaceGui`).
 */
export const CANVAS_ROLE_ATTRIBUTE = "Chao";
