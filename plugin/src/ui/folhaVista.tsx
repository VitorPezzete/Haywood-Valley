// A folha inteira do Aeko (128×32 tiles) numa área rolável com zoom inteiro: as duas metades de 1024×512 como
// ImageLabel pixelado, a grade, as zonas (12.4) como cores por cima, os destaques (as regiões do catálogo ou os
// tiles de um fundo), o retângulo selecionado, o tile sob o mouse e o arrasto para marcar um retângulo novo.
// Um botão transparente por cima de tudo recebe o mouse; as coordenadas vêm de MouseMoved, no mesmo espaço do
// AbsolutePosition do widget.
import Vide, { For, source } from "@rbxts/vide";
import type { Metades } from "../catalogo/folhas";
import { CatalogoZonas, COLUNAS, COLUNAS_METADE, COR_DA_ZONA, LINHAS, Retangulo, TILE } from "../catalogo/formato";
import { cor } from "./kit";

type Derivable<T> = T | (() => T);

export interface Destaque {
	retangulo: Retangulo;
	cor: Color3;
	/** 0 a 1; padrão 0,75 (bem transparente). */
	transparencia?: number;
}

export interface TileSobMouse {
	c: number;
	l: number;
}

/** O zoom mais alto que faz sentido num widget: 2048 × 8 = 16384 px de canvas. */
export const ZOOM_MAXIMO = 8;

export function FolhaVista(props: {
	folha: () => string;
	metades: () => Metades | undefined;
	zoom: () => number;
	grade: () => boolean;
	mostrarZonas: () => boolean;
	zonas: () => CatalogoZonas;
	selecao: () => Retangulo | undefined;
	destaques: () => Destaque[];
	aoPassar: (tile: TileSobMouse | undefined) => void;
	aoClicar: (tile: TileSobMouse) => void;
	aoArrastar: (r: Retangulo) => void;
	tamanho?: Derivable<UDim2>;
	posicao?: Derivable<UDim2>;
	ordem?: number;
}) {
	const px = () => TILE * props.zoom();
	const canvas = () => UDim2.fromOffset(COLUNAS * px(), LINHAS * px());
	const posTile = (c: number, l: number) => UDim2.fromOffset(c * px(), l * px());
	const tamRet = (r: Retangulo) => UDim2.fromOffset(r.w * px(), r.h * px());

	const sobMouse = source<TileSobMouse | undefined>(undefined);
	const inicioArrasto = source<TileSobMouse | undefined>(undefined);
	const arrasto = () => {
		const a = inicioArrasto();
		const b = sobMouse();
		if (!a || !b) return undefined;
		return normalizar(a, b);
	};

	let botao: TextButton | undefined;

	function tileEm(x: number, y: number): TileSobMouse | undefined {
		if (!botao) return undefined;
		const relativo = new Vector2(x, y).sub(botao.AbsolutePosition);
		const c = math.floor(relativo.X / px());
		const l = math.floor(relativo.Y / px());
		if (c < 0 || l < 0 || c >= COLUNAS || l >= LINHAS) return undefined;
		return { c, l };
	}

	function mover(x: number, y: number) {
		const tile = tileEm(x, y);
		const antes = sobMouse();
		if (antes?.c === tile?.c && antes?.l === tile?.l) return;
		sobMouse(tile);
		props.aoPassar(tile);
	}

	function soltar() {
		const a = inicioArrasto();
		const b = sobMouse();
		inicioArrasto(undefined);
		if (!a) return;
		if (!b || (a.c === b.c && a.l === b.l)) props.aoClicar(a);
		else props.aoArrastar(normalizar(a, b));
	}

	// As zonas gerais e, por cima delas, as exceções desta folha (zonas.json: as exceções valem antes das zonas).
	const zonasDaFolha = () => {
		const cat = props.zonas();
		const lista = cat.zonas.map((z) => ({ c0: z.c0, l0: z.l0, c1: z.c1, l1: z.l1, zona: z.zona, excecao: false }));
		for (const e of cat.excecoes) {
			if (e.folha === "*" || e.folha === props.folha()) lista.unshift({ c0: e.area[0], l0: e.area[1], c1: e.area[2], l1: e.area[3], zona: e.zona, excecao: true });
		}
		return lista;
	};

	// A grade: uma linha fina por coluna e por linha de tiles; a da coluna 64 (a divisa das metades) mais forte.
	const linhasGrade = new Array<defined>();
	for (let i = 1; i < COLUNAS; i++) {
		linhasGrade.push(
			(<frame
				Name={`V${i}`}
				BackgroundColor3={i === COLUNAS_METADE ? Color3.fromRGB(255, 80, 80) : Color3.fromRGB(0, 0, 0)}
				BackgroundTransparency={i % 8 === 0 ? 0.35 : 0.65}
				BorderSizePixel={0}
				Position={() => UDim2.fromOffset(i * px(), 0)}
				Size={() => UDim2.fromOffset(1, LINHAS * px())}
				ZIndex={2000}
			/>) as defined,
		);
	}
	for (let j = 1; j < LINHAS; j++) {
		linhasGrade.push(
			(<frame
				Name={`H${j}`}
				BackgroundColor3={Color3.fromRGB(0, 0, 0)}
				BackgroundTransparency={j % 8 === 0 ? 0.35 : 0.65}
				BorderSizePixel={0}
				Position={() => UDim2.fromOffset(0, j * px())}
				Size={() => UDim2.fromOffset(COLUNAS * px(), 1)}
				ZIndex={2000}
			/>) as defined,
		);
	}

	return (
		<scrollingframe
			Name="FolhaVista"
			Size={props.tamanho ?? UDim2.fromScale(1, 1)}
			Position={props.posicao}
			BackgroundColor3={cor(Enum.StudioStyleGuideColor.Dark)}
			BorderSizePixel={0}
			CanvasSize={canvas}
			AutomaticCanvasSize={Enum.AutomaticSize.None}
			ScrollingDirection={Enum.ScrollingDirection.XY}
			ScrollBarThickness={10}
			ScrollBarImageColor3={cor(Enum.StudioStyleGuideColor.ScrollBar)}
			LayoutOrder={props.ordem}
		>
			<frame Name="Folha" BackgroundTransparency={1} Size={canvas}>
				{/* As duas metades da folha. */}
				{([0, 1] as const).map((metade) => (
					<imagelabel
						Name={`Metade${metade}`}
						BackgroundColor3={Color3.fromRGB(0, 0, 0)}
						BackgroundTransparency={() => (props.metades() ? 1 : 0.5)}
						BorderSizePixel={0}
						Image={() => props.metades()?.[metade] ?? ""}
						ResampleMode={Enum.ResamplerMode.Pixelated}
						Position={() => UDim2.fromOffset(metade * COLUNAS_METADE * px(), 0)}
						Size={() => UDim2.fromOffset(COLUNAS_METADE * px(), LINHAS * px())}
						ZIndex={1}
					/>
				))}
				{/* As zonas: vale a primeira, então a primeira fica por cima. */}
				<frame Name="Zonas" BackgroundTransparency={1} Size={UDim2.fromScale(1, 1)} Visible={props.mostrarZonas} ZIndex={1000}>
					<For each={zonasDaFolha}>
						{(zona, indice) => (
							<frame
								Name={zona.zona}
								BackgroundColor3={COR_DA_ZONA[zona.zona] ?? Color3.fromRGB(255, 255, 255)}
								BackgroundTransparency={0.55}
								BorderSizePixel={0}
								Position={() => posTile(zona.c0, zona.l0)}
								Size={() => tamRet({ c: zona.c0, l: zona.l0, w: zona.c1 - zona.c0 + 1, h: zona.l1 - zona.l0 + 1 })}
								ZIndex={() => 1000 + 500 - indice()}
							/>
						)}
					</For>
					{/* O tile vazio (zonas.json `vazio`) vale antes de qualquer zona. */}
					<frame
						Name="vazio"
						BackgroundColor3={COR_DA_ZONA.vazio}
						BackgroundTransparency={0.3}
						BorderSizePixel={0}
						Position={() => posTile(props.zonas().vazio[0], props.zonas().vazio[1])}
						Size={() => tamRet({ c: 0, l: 0, w: 1, h: 1 })}
						ZIndex={1600}
					/>
				</frame>
				<frame Name="Grade" BackgroundTransparency={1} Size={UDim2.fromScale(1, 1)} Visible={props.grade} ZIndex={2000}>
					{linhasGrade}
				</frame>
				<frame Name="Destaques" BackgroundTransparency={1} Size={UDim2.fromScale(1, 1)} ZIndex={3000}>
					<For each={props.destaques}>
						{(d) => (
							<frame
								Name="Destaque"
								BackgroundColor3={d.cor}
								BackgroundTransparency={d.transparencia ?? 0.75}
								BorderSizePixel={0}
								Position={() => posTile(d.retangulo.c, d.retangulo.l)}
								Size={() => tamRet(d.retangulo)}
								ZIndex={3000}
							>
								<uistroke Color={d.cor} Thickness={1} Transparency={0.2} />
							</frame>
						)}
					</For>
				</frame>
				<frame
					Name="SobMouse"
					BackgroundColor3={Color3.fromRGB(255, 255, 255)}
					BackgroundTransparency={0.7}
					BorderSizePixel={0}
					Visible={() => sobMouse() !== undefined}
					Position={() => {
						const t = sobMouse();
						return t ? posTile(t.c, t.l) : UDim2.fromOffset(0, 0);
					}}
					Size={() => UDim2.fromOffset(px(), px())}
					ZIndex={3900}
				/>
				<frame
					Name="Selecao"
					BackgroundColor3={Color3.fromRGB(255, 230, 0)}
					BackgroundTransparency={0.85}
					BorderSizePixel={0}
					Visible={() => props.selecao() !== undefined}
					Position={() => {
						const r = props.selecao();
						return r ? posTile(r.c, r.l) : UDim2.fromOffset(0, 0);
					}}
					Size={() => {
						const r = props.selecao();
						return r ? tamRet(r) : UDim2.fromOffset(0, 0);
					}}
					ZIndex={4000}
				>
					<uistroke Color={Color3.fromRGB(255, 230, 0)} Thickness={2} />
				</frame>
				<frame
					Name="Arrasto"
					BackgroundColor3={Color3.fromRGB(80, 200, 255)}
					BackgroundTransparency={0.7}
					BorderSizePixel={0}
					Visible={() => arrasto() !== undefined}
					Position={() => {
						const r = arrasto();
						return r ? posTile(r.c, r.l) : UDim2.fromOffset(0, 0);
					}}
					Size={() => {
						const r = arrasto();
						return r ? tamRet(r) : UDim2.fromOffset(0, 0);
					}}
					ZIndex={4100}
				>
					<uistroke Color={Color3.fromRGB(80, 200, 255)} Thickness={2} />
				</frame>
				<textbutton
					Name="Captura"
					BackgroundTransparency={1}
					Text=""
					AutoButtonColor={false}
					Size={UDim2.fromScale(1, 1)}
					ZIndex={5000}
					action={(b: TextButton) => {
						botao = b;
					}}
					MouseMoved={mover}
					MouseButton1Down={(x, y) => {
						mover(x, y);
						inicioArrasto(sobMouse());
					}}
					MouseButton1Up={(x, y) => {
						mover(x, y);
						soltar();
					}}
					MouseLeave={() => {
						soltar();
						sobMouse(undefined);
						props.aoPassar(undefined);
					}}
				/>
			</frame>
		</scrollingframe>
	);
}

function normalizar(a: TileSobMouse, b: TileSobMouse): Retangulo {
	const c = math.min(a.c, b.c);
	const l = math.min(a.l, b.l);
	return { c, l, w: math.abs(a.c - b.c) + 1, h: math.abs(a.l - b.l) + 1 };
}
