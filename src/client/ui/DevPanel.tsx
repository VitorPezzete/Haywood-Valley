import Vide, { cleanup } from "@rbxts/vide";
import { TextKey } from "shared/i18n/en";
import { PERF_SYSTEMS, PerfReading } from "client/perf";
import { t } from "./i18n";
import { BODY, LABEL, screenScale } from "./kit";
import { themeColor, themed } from "./theme";

/** O que o painel de desempenho mostra, medido pelo `DevToolsController`. */
export interface BudgetReading {
	/** O mapa em que o jogador está. */
	map: string;
	/** Imagens na tela, e quantas delas estão nos canvas do chão (fixo e vivo). */
	images: number;
	groundStill: number;
	groundLive: number;
	instances: number;
	cards: number;
	/** Bonecos desenhados, na tela e guardados para reaproveitar. */
	actorsShown: number;
	actorsOnScreen: number;
	actorsPool: number;
	frameMs: number;
	fps: number;
	worstMs: number;
	/** Tempo dos nossos scripts por quadro. */
	scriptsMs: number;
	systems: PerfReading[];
	/** Vezes por segundo em que cada canvas do chão (fixo, vivo, mar) foi refeito. */
	redraws: number[];
	memoryMb: number;
	textureMb: number;
	characterTextureMb: number;
	guiMb: number;
	luaMb: number;
	instancesMb: number;
	animationMb: number;
	receiveKbps: number;
	sendKbps: number;
}

/** O orçamento da seção 8 da especificação do Diorama: de 1.000 a 2.500 imagens e de 150 a 400 cartões. */
export const IMAGE_BUDGET = new Vector2(1000, 2500);
export const CARD_BUDGET = 400;
/**
 * Metas da seção 9.4 do `PLANO_OTIMIZACAO.md` para o celular fraco, o alvo do jogo (decisão do usuário em
 * 2026-10-18: Android de 3 GB de 2020 para cá, iPhone XR ou 11, a 30 quadros por segundo): o quadro, os nossos
 * scripts por quadro, a memória total e a de textura, e a rede recebida.
 */
const FRAME_TARGET_MS = 33;
const SCRIPTS_TARGET_MS = 6;
const MEMORY_TARGET_MB = 600;
const TEXTURE_TARGET_MB = 150;
const NETWORK_TARGET_KBPS = 30;
const PANEL = new Vector2(214, 166);
/** A linha de texto, em pixels de arte do painel. */
const LINE = 8;
/**
 * O painel nunca fica menor que esta escala: num celular o `k` da interface é 1, e a letra de 6 pixels não se
 * lê. Com 1,5, a letra fica com 9 pontos e o painel inteiro cabe na altura de um celular deitado (390 pontos).
 */
const MIN_PANEL_K = 1.5;
const WARN = Color3.fromRGB(214, 64, 52);
const SOFT = Color3.fromRGB(210, 150, 40);

function verdict(reading: BudgetReading): [TextKey, Color3 | undefined] {
	if (reading.images > IMAGE_BUDGET.Y) return ["dev.budget.over", WARN];
	if (reading.cards > CARD_BUDGET) return ["dev.budget.cardsOver", WARN];
	if (reading.images < IMAGE_BUDGET.X) return ["dev.budget.low", undefined];
	return ["dev.budget.ok", SOFT];
}

const one = (value: number) => string.format("%.1f", value);
const two = (value: number) => string.format("%.2f", value);

/**
 * As ferramentas de desenvolvimento por cima do jogo (no Studio, com o atributo de teste ou pelo gesto de quem
 * pode): o painel de desempenho no canto de cima à esquerda, com as imagens, as instâncias, os cartões, os bonecos,
 * o tempo por quadro, o tempo de cada sistema nosso (média por quadro e, entre parênteses, a vez mais lenta, em
 * ms), quantas vezes por segundo cada canvas do chão é refeito, a memória e a rede; cada linha fica vermelha
 * acima da meta do celular fraco. Na prévia de celular, o preto em volta do retângulo da tela do celular, com a
 * medida dela.
 */
export function DevPanel({
	budget,
	phoneRect,
	phoneLabel,
}: {
	budget: () => BudgetReading | undefined;
	/** O retângulo da tela do celular na prévia, em pixels da tela; nada com a prévia desligada. */
	phoneRect: () => Rect | undefined;
	phoneLabel: () => string;
}) {
	const { k } = screenScale();
	const pk = () => math.max(k(), MIN_PANEL_K);
	const reading = () => budget();

	const line = (
		row: number,
		text: () => string,
		color?: () => Color3 | undefined,
		column = 0,
		width = PANEL.X - 12,
	) => (
		<textlabel
			BackgroundTransparency={1}
			Position={() => UDim2.fromOffset((6 + column) * pk(), (12 + row * LINE) * pk())}
			Size={() => UDim2.fromOffset(width * pk(), LINE * pk())}
			FontFace={BODY}
			Text={text}
			TextXAlignment="Left"
			TextColor3={() => color?.() ?? themeColor("text")}
			TextSize={() => 6 * pk()}
			ZIndex={1002}
		/>
	);

	/** Vermelho acima da meta. */
	const over = (value: (r: BudgetReading) => number, limit: number) => () => {
		const r = reading();
		return r && value(r) > limit ? WARN : undefined;
	};

	const bar = (name: string, position: () => UDim2, size: () => UDim2) => (
		<frame
			Name={name}
			BackgroundColor3={new Color3(0, 0, 0)}
			BorderSizePixel={0}
			Position={position}
			Size={size}
			ZIndex={1000}
		/>
	);

	// Os sistemas em duas colunas, sempre na mesma ordem (`PERF_SYSTEMS`).
	const systemRows = math.ceil(PERF_SYSTEMS.size() / 2);
	const systems = PERF_SYSTEMS.map((name, index) =>
		line(
			6 + (index % systemRows),
			() => {
				const found = reading()?.systems.find((item) => item.name === name);
				return t("dev.budget.system", {
					name: t(`dev.system.${name}` as TextKey),
					ms: two(found?.perFrameMs ?? 0),
					worst: two(found?.worstMs ?? 0),
				});
			},
			undefined,
			index < systemRows ? 0 : (PANEL.X - 12) / 2,
			(PANEL.X - 12) / 2,
		),
	);
	const after = 6 + systemRows;

	const gui = (
		<screengui Name="DevTools" ResetOnSpawn={false} DisplayOrder={1000} AutoLocalize={false} IgnoreGuiInset={true}>
			<frame
				Name="Phone"
				BackgroundTransparency={1}
				Size={UDim2.fromScale(1, 1)}
				Visible={() => phoneRect() !== undefined}
			>
				{bar(
					"Top",
					() => UDim2.fromOffset(0, 0),
					() => new UDim2(1, 0, 0, phoneRect()?.Min.Y ?? 0),
				)}
				{bar(
					"Bottom",
					() => UDim2.fromOffset(0, phoneRect()?.Max.Y ?? 0),
					() => new UDim2(1, 0, 1, -(phoneRect()?.Max.Y ?? 0)),
				)}
				{bar(
					"Left",
					() => UDim2.fromOffset(0, phoneRect()?.Min.Y ?? 0),
					() => UDim2.fromOffset(phoneRect()?.Min.X ?? 0, phoneRect()?.Height ?? 0),
				)}
				{bar(
					"Right",
					() => UDim2.fromOffset(phoneRect()?.Max.X ?? 0, phoneRect()?.Min.Y ?? 0),
					() => new UDim2(1, -(phoneRect()?.Max.X ?? 0), 0, phoneRect()?.Height ?? 0),
				)}
				<textlabel
					BackgroundTransparency={1}
					Position={() => UDim2.fromOffset(phoneRect()?.Min.X ?? 0, (phoneRect()?.Max.Y ?? 0) + 2)}
					Size={() => UDim2.fromOffset(phoneRect()?.Width ?? 0, 16)}
					FontFace={LABEL}
					Text={phoneLabel}
					TextColor3={new Color3(1, 1, 1)}
					TextSize={10}
					ZIndex={1001}
				/>
			</frame>
			<imagelabel
				{...themed("tooltip", pk)}
				Name="Budget"
				Visible={() => reading() !== undefined}
				Position={() => UDim2.fromOffset(6 * pk(), 52 + 6 * pk())}
				Size={() => UDim2.fromOffset(PANEL.X * pk(), PANEL.Y * pk())}
				ZIndex={1001}
			>
				<textlabel
					BackgroundTransparency={1}
					Position={() => UDim2.fromOffset(6 * pk(), 3 * pk())}
					Size={() => UDim2.fromOffset((PANEL.X - 12) * pk(), 8 * pk())}
					FontFace={LABEL}
					Text={() => t("dev.budget.title")}
					TextXAlignment="Left"
					TextColor3={() => themeColor("text")}
					TextSize={() => 5 * pk()}
					ZIndex={1002}
				/>
				{line(0, () => t("dev.budget.map", { map: reading()?.map ?? "" }))}
				{line(
					1,
					() => {
						const r = reading();
						return t("dev.budget.imagesSplit", {
							n: tostring(r?.images ?? 0),
							still: tostring(r?.groundStill ?? 0),
							live: tostring(r?.groundLive ?? 0),
						});
					},
					over((r) => r.images, IMAGE_BUDGET.Y),
				)}
				{line(
					2,
					() =>
						t("dev.budget.counts", {
							n: tostring(reading()?.instances ?? 0),
							cards: tostring(reading()?.cards ?? 0),
						}),
					over((r) => r.cards, CARD_BUDGET),
				)}
				{line(3, () => {
					const r = reading();
					return t("dev.budget.actors", {
						shown: tostring(r?.actorsShown ?? 0),
						screen: tostring(r?.actorsOnScreen ?? 0),
						pool: tostring(r?.actorsPool ?? 0),
					});
				})}
				{line(
					4,
					() => {
						const r = reading();
						return t("dev.budget.frame", {
							ms: one(r?.frameMs ?? 0),
							fps: tostring(math.round(r?.fps ?? 0)),
							worst: one(r?.worstMs ?? 0),
						});
					},
					over((r) => r.frameMs, FRAME_TARGET_MS),
				)}
				{line(
					5,
					() => t("dev.budget.scripts", { ms: two(reading()?.scriptsMs ?? 0) }),
					over((r) => r.scriptsMs, SCRIPTS_TARGET_MS),
				)}
				{systems}
				{line(after, () => {
					const r = reading()?.redraws ?? [0, 0, 0];
					return t("dev.budget.redraws", { still: one(r[0]), live: one(r[1]), sea: one(r[2]) });
				})}
				{line(
					after + 1,
					() => {
						const r = reading();
						return t("dev.budget.memory", {
							total: tostring(math.round(r?.memoryMb ?? 0)),
							texture: tostring(math.round(r?.textureMb ?? 0)),
							character: tostring(math.round(r?.characterTextureMb ?? 0)),
						});
					},
					() => {
						const r = reading();
						return r &&
							(r.memoryMb > MEMORY_TARGET_MB || r.textureMb + r.characterTextureMb > TEXTURE_TARGET_MB)
							? WARN
							: undefined;
					},
				)}
				{line(after + 2, () => {
					const r = reading();
					return t("dev.budget.memoryMore", {
						gui: tostring(math.round(r?.guiMb ?? 0)),
						lua: tostring(math.round(r?.luaMb ?? 0)),
						inst: tostring(math.round(r?.instancesMb ?? 0)),
						anim: tostring(math.round(r?.animationMb ?? 0)),
					});
				})}
				{line(
					after + 3,
					() =>
						t("dev.budget.network", {
							recv: one(reading()?.receiveKbps ?? 0),
							send: one(reading()?.sendKbps ?? 0),
						}),
					over((r) => r.receiveKbps, NETWORK_TARGET_KBPS),
				)}
				{line(
					after + 4,
					() => {
						const r = reading();
						return r ? t(verdict(r)[0]) : "";
					},
					() => {
						const r = reading();
						return r ? verdict(r)[1] : undefined;
					},
				)}
			</imagelabel>
		</screengui>
	) as ScreenGui;
	cleanup(gui);
	return gui;
}
