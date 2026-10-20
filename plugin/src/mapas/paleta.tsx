// A paleta de tiles: a folha inteira (128 × 32 tiles, as duas metades lado a lado) rolável e com zoom, onde se
// escolhe um tile ou arrasta um retângulo de tiles (vira o carimbo). Mostra a coluna, a linha e a zona do tile sob
// o mouse e da seleção.
import Vide, { effect, source } from "@rbxts/vide";
import { Botao, cor, Linha, Rotulo } from "../ui/kit";
import { Legenda } from "../ui/extras";
import type { Imagens } from "./canvas";
import { COLUNAS, DESCRICAO_ZONA, ehAnimado, FOLHAS_CONHECIDAS, LINHAS, METADE, TILE_PX, zonaDoTile } from "./zonas";
import { conteudo } from "../folhasLocais";

/** Um retângulo de tiles de uma folha (coluna, linha, largura, altura). */
export interface SelecaoPaleta {
	folha: string;
	c0: number;
	l0: number;
	largura: number;
	altura: number;
}

export interface PropsPaleta {
	imagens: () => Imagens;
	selecao: Vide.Source<SelecaoPaleta | undefined>;
	ordem?: number;
}

const FOLHA_PX_X = COLUNAS * TILE_PX;
const FOLHA_PX_Y = LINHAS * TILE_PX;
const ALTURA_CABECALHO = 60;

export function Paleta(props: PropsPaleta) {
	const folha = source<string>(props.selecao()?.folha ?? FOLHAS_CONHECIDAS[0]);
	const zoom = source(2);
	const sobMouse = source<[number, number] | undefined>(undefined);
	let arrasto: [number, number] | undefined;
	let pressionado = false;

	const mundo = new Instance("Frame");
	mundo.Name = "Folha";
	mundo.BackgroundColor3 = Color3.fromRGB(40, 40, 44);
	mundo.BorderSizePixel = 0;
	mundo.Size = UDim2.fromOffset(FOLHA_PX_X, FOLHA_PX_Y);
	const escala = new Instance("UIScale");
	escala.Parent = mundo;
	effect(() => {
		escala.Scale = zoom();
	});

	const metades = [0, 1].map((m) => {
		const label = new Instance("ImageLabel");
		label.Name = `Metade${m}`;
		label.BackgroundTransparency = 1;
		label.BorderSizePixel = 0;
		label.Position = UDim2.fromOffset(m * METADE * TILE_PX, 0);
		label.Size = UDim2.fromOffset(METADE * TILE_PX, FOLHA_PX_Y);
		label.ResampleMode = Enum.ResamplerMode.Pixelated;
		label.ScaleType = Enum.ScaleType.Stretch;
		label.Parent = mundo;
		return label;
	});
	effect(() => {
		const par = props.imagens()[folha()];
		metades.forEach((label, m) => {
			label.ImageContent = conteudo(par ? par[m] : undefined);
		});
	});

	const quadroSelecao = new Instance("Frame");
	quadroSelecao.BackgroundColor3 = Color3.fromRGB(255, 255, 255);
	quadroSelecao.BackgroundTransparency = 0.75;
	quadroSelecao.BorderSizePixel = 0;
	quadroSelecao.Visible = false;
	quadroSelecao.ZIndex = 2;
	const bordaSelecao = new Instance("UIStroke");
	bordaSelecao.Color = Color3.fromRGB(255, 230, 80);
	bordaSelecao.Thickness = 1;
	bordaSelecao.Parent = quadroSelecao;
	quadroSelecao.Parent = mundo;

	const quadroCursor = new Instance("Frame");
	quadroCursor.BackgroundTransparency = 1;
	quadroCursor.Size = UDim2.fromOffset(TILE_PX, TILE_PX);
	quadroCursor.Visible = false;
	quadroCursor.ZIndex = 3;
	const bordaCursor = new Instance("UIStroke");
	bordaCursor.Color = Color3.fromRGB(255, 255, 255);
	bordaCursor.Thickness = 1;
	bordaCursor.Parent = quadroCursor;
	quadroCursor.Parent = mundo;

	const entrada = new Instance("Frame");
	entrada.Name = "Entrada";
	entrada.BackgroundTransparency = 1;
	entrada.Size = UDim2.fromScale(1, 1);
	entrada.ZIndex = 4;
	entrada.Parent = mundo;

	effect(() => {
		const s = props.selecao();
		if (!s || s.folha !== folha()) {
			quadroSelecao.Visible = false;
			return;
		}
		quadroSelecao.Position = UDim2.fromOffset(s.c0 * TILE_PX, s.l0 * TILE_PX);
		quadroSelecao.Size = UDim2.fromOffset(s.largura * TILE_PX, s.altura * TILE_PX);
		quadroSelecao.Visible = true;
	});
	effect(() => {
		const c = sobMouse();
		if (!c) quadroCursor.Visible = false;
		else {
			quadroCursor.Position = UDim2.fromOffset(c[0] * TILE_PX, c[1] * TILE_PX);
			quadroCursor.Visible = true;
		}
	});

	const tileDe = (posicao: Vector3): [number, number] | undefined => {
		const abs = mundo.AbsolutePosition;
		const tam = mundo.AbsoluteSize;
		if (tam.X <= 0) return undefined;
		const escalaReal = tam.X / FOLHA_PX_X;
		const c = math.floor((posicao.X - abs.X) / (TILE_PX * escalaReal));
		const l = math.floor((posicao.Y - abs.Y) / (TILE_PX * escalaReal));
		if (c < 0 || l < 0 || c >= COLUNAS || l >= LINHAS) return undefined;
		return [c, l];
	};
	const selecionar = (a: [number, number], b: [number, number]) => {
		const c0 = math.min(a[0], b[0]);
		const l0 = math.min(a[1], b[1]);
		props.selecao({ folha: folha(), c0, l0, largura: math.abs(a[0] - b[0]) + 1, altura: math.abs(a[1] - b[1]) + 1 });
	};
	entrada.InputBegan.Connect((input) => {
		if (input.UserInputType !== Enum.UserInputType.MouseButton1) return;
		const t = tileDe(input.Position);
		if (!t) return;
		pressionado = true;
		arrasto = t;
		selecionar(t, t);
	});
	entrada.InputChanged.Connect((input) => {
		if (input.UserInputType !== Enum.UserInputType.MouseMovement) return;
		const t = tileDe(input.Position);
		sobMouse(t);
		if (pressionado && arrasto && t) selecionar(arrasto, t);
	});
	entrada.InputEnded.Connect((input) => {
		if (input.UserInputType === Enum.UserInputType.MouseButton1) pressionado = false;
	});
	entrada.MouseLeave.Connect(() => sobMouse(undefined));

	const descricao = (c: number, l: number) => {
		const tile: [string, number, number] = [folha(), c, l];
		const zona = zonaDoTile(tile);
		return `[${c}, ${l}] ${DESCRICAO_ZONA[zona]}${ehAnimado(tile) ? " (quadro " + tostring(l) + ")" : ""}`;
	};
	const linhaMouse = () => {
		const t = sobMouse();
		return t ? `Mouse: ${descricao(t[0], t[1])}` : "Mouse: —";
	};
	const linhaSelecao = () => {
		const s = props.selecao();
		if (!s) return "Seleção: nenhuma (clique ou arraste na folha).";
		const base = `Seleção: ${s.folha} ${descricao(s.c0, s.l0)}`;
		return s.largura === 1 && s.altura === 1 ? base : `${base}, carimbo de ${s.largura} × ${s.altura}`;
	};

	return (
		<frame Name="Paleta" Size={UDim2.fromScale(1, 1)} BackgroundTransparency={1} LayoutOrder={props.ordem}>
			<frame Name="Cabecalho" Size={new UDim2(1, 0, 0, ALTURA_CABECALHO)} BackgroundTransparency={1}>
				<Linha espaco={4}>
					{FOLHAS_CONHECIDAS.map((nome, i) => (
						<Botao texto={nome} ativo={() => folha() === nome} aoClicar={() => folha(nome)} ordem={i} />
					))}
					<Legenda texto="" largura={8} ordem={10} />
					<Botao texto="−" aoClicar={() => zoom(math.max(1, zoom() - 1))} ordem={11} />
					<Legenda texto={() => `${zoom()}×`} largura={26} ordem={12} />
					<Botao texto="+" aoClicar={() => zoom(math.min(4, zoom() + 1))} ordem={13} />
				</Linha>
				<frame Size={new UDim2(1, 0, 0, 34)} Position={UDim2.fromOffset(0, 26)} BackgroundTransparency={1}>
					<Rotulo texto={linhaMouse} tom="fraco" ordem={0} />
					<Rotulo texto={linhaSelecao} ordem={1} />
					<uilistlayout FillDirection={Enum.FillDirection.Vertical} SortOrder={Enum.SortOrder.LayoutOrder} Padding={new UDim(0, 0)} />
				</frame>
			</frame>
			<scrollingframe
				Name="Rolagem"
				Size={new UDim2(1, 0, 1, -ALTURA_CABECALHO)}
				Position={UDim2.fromOffset(0, ALTURA_CABECALHO)}
				BackgroundColor3={cor(Enum.StudioStyleGuideColor.Dark)}
				BorderSizePixel={0}
				CanvasSize={() => UDim2.fromOffset(FOLHA_PX_X * zoom() + 16, FOLHA_PX_Y * zoom() + 16)}
				ScrollingDirection={Enum.ScrollingDirection.XY}
				ScrollBarThickness={10}
				ScrollBarImageColor3={cor(Enum.StudioStyleGuideColor.ScrollBar)}
				ElasticBehavior={Enum.ElasticBehavior.Never}
			>
				{mundo}
			</scrollingframe>
		</frame>
	);
}
