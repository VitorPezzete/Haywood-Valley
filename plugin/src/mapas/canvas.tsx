// O canvas do bloco: 64 × 64 células de 16 px num ScrollingFrame, com zoom inteiro por UIScale (a arte fica nítida:
// ImageLabel com ResampleMode Pixelated), as três camadas de tiles e a de terreno sobrepostas, grade, marcadores,
// a peça fantasma do pincel e o cursor. Só as células não vazias têm instância: cada camada tem um pool de ImageLabel
// (ou Frame colorido, no terreno) agrupado em chunks de 8 × 8 células, criado por demanda e reaproveitado. O modelo
// marca as células sujas; quem pinta sobe `versao` e o canvas redesenha só essas.
//
// A interface é construída à mão (Instance.new e eventos), não pelo Vide: milhares de ImageLabel com propriedades
// reativas seriam caros, e o canvas muda por lotes, não por célula.
import Vide, { cleanup, effect, source } from "@rbxts/vide";
import { UserInputService } from "@rbxts/services";
import { cor } from "../ui/kit";
import { CAMADA_TERRENO, CELULAS, corDoTerreno, desempacotar, LADO, ModeloBloco } from "./bloco";
import { METADE, Tile, TILE_PX } from "./zonas";
import { conteudo } from "../folhasLocais";

/** Ids das metades de cada folha (`rbxassetid://...`), pela chave `aeko.<folha>.<metade>` do registro de assets. */
export type Imagens = Record<string, [string, string] | undefined>;

export interface CelulaFantasma {
	dx: number;
	dy: number;
	tile?: Tile;
	cor?: Color3;
}

/** O que o pincel vai pôr, desenhado meio transparente onde o mouse está (12.12: 0,3 onde cabe, 0,75 onde não). */
export interface Fantasma {
	x: number;
	y: number;
	celulas: CelulaFantasma[];
	transparencia: number;
}

export interface Modificadores {
	ctrl: boolean;
	shift: boolean;
	alt: boolean;
}

export interface PropsCanvas {
	/** O modelo atual (não reativo: quem troca o modelo sobe `versao` e `versaoMarcadores`). */
	modelo: () => ModeloBloco;
	versao: () => number;
	versaoMarcadores: () => number;
	zoom: () => number;
	grade: () => boolean;
	camadaAtiva: () => number;
	/** Transparência das camadas que não estão ativas (0 = opacas, 1 = invisíveis). */
	opacidadeInativa: () => number;
	imagens: () => Imagens;
	fantasma: () => Fantasma | undefined;
	/** Retângulo [x0, y0, x1, y1] (inclusivo) sendo arrastado, ou nada. */
	previa: () => [number, number, number, number] | undefined;
	aoMover: (celula: [number, number] | undefined) => void;
	aoPressionar: (x: number, y: number, botao: 1 | 2, modificadores: Modificadores) => void;
	aoArrastar: (x: number, y: number) => void;
	aoSoltar: (x: number, y: number) => void;
}

const MUNDO_PX = LADO * TILE_PX;
const CHUNK = 8;
const CHUNK_PX = CHUNK * TILE_PX;
const COR_SEM_IMAGEM = Color3.fromRGB(255, 0, 255);

export const CORES_MARCADOR = {
	nascimento: Color3.fromRGB(255, 220, 60),
	entrada: Color3.fromRGB(90, 230, 120),
	saida: Color3.fromRGB(240, 80, 80),
	zona: Color3.fromRGB(170, 110, 255),
	morador: Color3.fromRGB(80, 210, 240),
};

/** Instâncias por célula, agrupadas em chunks de 8 × 8, criadas por demanda e reaproveitadas quando a célula esvazia. */
class Pool<T extends GuiObject> {
	private readonly chunks = new Map<number, Frame>();
	private readonly itens = new Map<number, T>();
	private readonly livres = new Array<T>();

	constructor(
		private readonly pai: Frame,
		private readonly criar: () => T,
	) {}

	private chunk(indice: number) {
		const cx = math.floor((indice % LADO) / CHUNK);
		const cy = math.floor(math.floor(indice / LADO) / CHUNK);
		const chave = cy * CHUNK + cx;
		let frame = this.chunks.get(chave);
		if (!frame) {
			frame = new Instance("Frame");
			frame.Name = `Chunk_${cx}_${cy}`;
			frame.BackgroundTransparency = 1;
			frame.BorderSizePixel = 0;
			frame.Position = UDim2.fromOffset(cx * CHUNK_PX, cy * CHUNK_PX);
			frame.Size = UDim2.fromOffset(CHUNK_PX, CHUNK_PX);
			frame.Parent = this.pai;
			this.chunks.set(chave, frame);
		}
		return frame;
	}

	definir(indice: number, atualizar: (item: T) => void) {
		let item = this.itens.get(indice);
		if (!item) {
			item = this.livres.pop() ?? this.criar();
			const x = indice % LADO;
			const y = math.floor(indice / LADO);
			item.Position = UDim2.fromOffset((x % CHUNK) * TILE_PX, (y % CHUNK) * TILE_PX);
			item.Parent = this.chunk(indice);
			item.Visible = true;
			this.itens.set(indice, item);
		}
		atualizar(item);
	}

	remover(indice: number) {
		const item = this.itens.get(indice);
		if (!item) return;
		this.itens.delete(indice);
		item.Visible = false;
		this.livres.push(item);
	}

	limpar() {
		for (const [indice] of this.itens) this.remover(indice);
	}

	paraCada(f: (item: T) => void) {
		for (const [, item] of this.itens) f(item);
	}
}

function novoRotuloTile() {
	const label = new Instance("ImageLabel");
	label.BackgroundTransparency = 1;
	label.BackgroundColor3 = COR_SEM_IMAGEM;
	label.BorderSizePixel = 0;
	label.Size = UDim2.fromOffset(TILE_PX, TILE_PX);
	label.ImageRectSize = new Vector2(TILE_PX, TILE_PX);
	label.ResampleMode = Enum.ResamplerMode.Pixelated;
	label.ScaleType = Enum.ScaleType.Stretch;
	return label;
}

function novoQuadroTerreno() {
	const frame = new Instance("Frame");
	frame.BorderSizePixel = 0;
	frame.Size = UDim2.fromOffset(TILE_PX, TILE_PX);
	return frame;
}

/** Aponta o ImageLabel para o tile na metade certa da folha; sem id da imagem, mostra um quadrado magenta. */
export function aplicarTile(label: ImageLabel, tile: Tile, imagens: Imagens) {
	const par = imagens[tile[0]];
	const id = par ? par[tile[1] >= METADE ? 1 : 0] : undefined;
	if (id === undefined || id === "") {
		label.ImageContent = Content.none;
		label.SetAttribute("SemImagem", true);
		label.BackgroundTransparency = 0.4;
	} else {
		label.ImageContent = conteudo(id);
		label.SetAttribute("SemImagem", undefined);
		label.BackgroundTransparency = 1;
	}
	label.ImageRectOffset = new Vector2((tile[1] % METADE) * TILE_PX, tile[2] * TILE_PX);
}

function caixa(pai: Frame, x: number, y: number, largura: number, altura: number, tom: Color3, texto: string, ordem: number) {
	const frame = new Instance("Frame");
	frame.BackgroundColor3 = tom;
	frame.BackgroundTransparency = 0.7;
	frame.BorderSizePixel = 0;
	frame.Position = UDim2.fromOffset(x * TILE_PX, y * TILE_PX);
	frame.Size = UDim2.fromOffset(largura * TILE_PX, altura * TILE_PX);
	frame.ZIndex = ordem;
	const borda = new Instance("UIStroke");
	borda.Color = tom;
	borda.Thickness = 1;
	borda.Parent = frame;
	if (texto !== "") {
		const label = new Instance("TextLabel");
		label.BackgroundTransparency = 1;
		label.Size = UDim2.fromScale(1, 1);
		label.FontFace = Font.fromEnum(Enum.Font.SourceSansBold);
		label.TextSize = 8;
		label.TextColor3 = Color3.fromRGB(255, 255, 255);
		label.TextStrokeTransparency = 0.3;
		label.TextXAlignment = Enum.TextXAlignment.Left;
		label.TextYAlignment = Enum.TextYAlignment.Top;
		label.Text = texto;
		label.Parent = frame;
	}
	frame.Parent = pai;
}

export function CanvasBloco(props: PropsCanvas) {
	const mundo = new Instance("Frame");
	mundo.Name = "Mundo";
	mundo.BackgroundColor3 = Color3.fromRGB(12, 12, 14);
	mundo.BorderSizePixel = 0;
	mundo.Size = UDim2.fromOffset(MUNDO_PX, MUNDO_PX);
	const escala = new Instance("UIScale");
	escala.Parent = mundo;
	effect(() => {
		escala.Scale = math.max(1, math.floor(props.zoom()));
	});

	const camadaFrame = (nome: string, z: number) => {
		const frame = new Instance("Frame");
		frame.Name = nome;
		frame.BackgroundTransparency = 1;
		frame.BorderSizePixel = 0;
		frame.Size = UDim2.fromScale(1, 1);
		frame.ZIndex = z;
		frame.Parent = mundo;
		return frame;
	};
	const quadroTerreno = camadaFrame("Terreno", 1);
	const quadrosTiles = [camadaFrame("Chao", 2), camadaFrame("Objeto", 3), camadaFrame("Frente", 4)];
	const quadroGrade = camadaFrame("Grade", 5);
	const quadroMarcadores = camadaFrame("Marcadores", 6);
	const quadroFantasma = camadaFrame("Fantasma", 7);
	const quadroPrevia = camadaFrame("Previa", 8);
	const quadroCursor = camadaFrame("Cursor", 9);
	const quadroEntrada = camadaFrame("Entrada", 10);

	const poolTerreno = new Pool(quadroTerreno, novoQuadroTerreno);
	const poolsTiles = quadrosTiles.map((q) => new Pool(q, novoRotuloTile));
	const transparencia = [0, 0, 0, 0];

	// A grade: 63 linhas verticais e 63 horizontais de 1 px (escalam com o zoom).
	for (let i = 1; i < LADO; i++) {
		for (const vertical of [true, false]) {
			const linha = new Instance("Frame");
			linha.BackgroundColor3 = Color3.fromRGB(255, 255, 255);
			linha.BackgroundTransparency = i % CHUNK === 0 ? 0.6 : 0.85;
			linha.BorderSizePixel = 0;
			linha.Position = vertical ? UDim2.fromOffset(i * TILE_PX, 0) : UDim2.fromOffset(0, i * TILE_PX);
			linha.Size = vertical ? UDim2.fromOffset(1, MUNDO_PX) : UDim2.fromOffset(MUNDO_PX, 1);
			linha.Parent = quadroGrade;
		}
	}
	effect(() => {
		quadroGrade.Visible = props.grade();
	});

	// O cursor: a célula sob o mouse.
	const cursor = new Instance("Frame");
	cursor.BackgroundTransparency = 1;
	cursor.Size = UDim2.fromOffset(TILE_PX, TILE_PX);
	cursor.Visible = false;
	const bordaCursor = new Instance("UIStroke");
	bordaCursor.Color = Color3.fromRGB(255, 255, 255);
	bordaCursor.Thickness = 1;
	bordaCursor.Parent = cursor;
	cursor.Parent = quadroCursor;

	// A prévia do retângulo.
	const previa = new Instance("Frame");
	previa.BackgroundColor3 = Color3.fromRGB(255, 255, 255);
	previa.BackgroundTransparency = 0.8;
	previa.BorderSizePixel = 0;
	previa.Visible = false;
	const bordaPrevia = new Instance("UIStroke");
	bordaPrevia.Color = Color3.fromRGB(255, 255, 255);
	bordaPrevia.Thickness = 1;
	bordaPrevia.Parent = previa;
	previa.Parent = quadroPrevia;
	effect(() => {
		const r = props.previa();
		if (!r) {
			previa.Visible = false;
			return;
		}
		const x0 = math.min(r[0], r[2]);
		const y0 = math.min(r[1], r[3]);
		const x1 = math.max(r[0], r[2]);
		const y1 = math.max(r[1], r[3]);
		previa.Position = UDim2.fromOffset(x0 * TILE_PX, y0 * TILE_PX);
		previa.Size = UDim2.fromOffset((x1 - x0 + 1) * TILE_PX, (y1 - y0 + 1) * TILE_PX);
		previa.Visible = true;
	});

	// ------------------------------------------------------------------ redesenho das células

	const desenharCelula = (modelo: ModeloBloco, indice: number, imagens: Imagens) => {
		for (let camada = 0; camada < 3; camada++) {
			const tile = desempacotar(modelo.camadas[camada as 0 | 1 | 2][indice]);
			const pool = poolsTiles[camada];
			if (!tile) pool.remover(indice);
			else {
				const t = transparencia[camada];
				pool.definir(indice, (label) => {
					aplicarTile(label, tile, imagens);
					label.ImageTransparency = t;
				});
			}
		}
		const codigo = modelo.terreno[indice];
		const tom = corDoTerreno(codigo);
		if (!tom) poolTerreno.remover(indice);
		else {
			const t = transparencia[CAMADA_TERRENO];
			poolTerreno.definir(indice, (frame) => {
				frame.BackgroundColor3 = tom;
				frame.BackgroundTransparency = t;
			});
		}
	};

	let ultimasImagens: Imagens | undefined;
	let ultimoModelo: ModeloBloco | undefined;
	effect(() => {
		props.versao();
		const imagens = props.imagens();
		const modelo = props.modelo();
		const tudo = modelo.tudoSujo || imagens !== ultimasImagens || modelo !== ultimoModelo;
		ultimasImagens = imagens;
		ultimoModelo = modelo;
		if (tudo) {
			for (const pool of poolsTiles) pool.limpar();
			poolTerreno.limpar();
			for (let i = 0; i < CELULAS; i++) desenharCelula(modelo, i, imagens);
			modelo.tudoSujo = false;
		} else {
			for (const i of modelo.sujos) desenharCelula(modelo, i, imagens);
		}
		modelo.sujos.clear();
	});

	effect(() => {
		const ativa = props.camadaAtiva();
		const inativa = math.clamp(props.opacidadeInativa(), 0, 1);
		for (let camada = 0; camada <= CAMADA_TERRENO; camada++) transparencia[camada] = camada === ativa ? 0 : inativa;
		poolsTiles.forEach((pool, camada) => {
			pool.paraCada((label) => {
				label.ImageTransparency = transparencia[camada];
			});
		});
		poolTerreno.paraCada((frame) => {
			frame.BackgroundTransparency = transparencia[CAMADA_TERRENO];
		});
	});

	// ------------------------------------------------------------------ marcadores

	effect(() => {
		props.versaoMarcadores();
		const m = props.modelo().marcadores;
		quadroMarcadores.ClearAllChildren();
		m.zonas.forEach((z, i) => {
			z.areas.forEach((a, j) => {
				caixa(quadroMarcadores, math.min(a[0], a[2]), math.min(a[1], a[3]), math.abs(a[2] - a[0]) + 1, math.abs(a[3] - a[1]) + 1, CORES_MARCADOR.zona, j === 0 ? z.nome : "", 1 + i);
			});
		});
		m.saidas.forEach((s) => caixa(quadroMarcadores, s.x, s.y, s.largura, s.altura, CORES_MARCADOR.saida, `→${s.mapa}`, 50));
		for (const e of m.entradas) caixa(quadroMarcadores, e.x, e.y, 1, 1, CORES_MARCADOR.entrada, e.nome, 60);
		for (const r of m.moradores) caixa(quadroMarcadores, r.x, r.y, 1, 1, CORES_MARCADOR.morador, r.nome, 70);
		if (m.nascimento) caixa(quadroMarcadores, m.nascimento[0], m.nascimento[1], 1, 1, CORES_MARCADOR.nascimento, "N", 80);
	});

	// ------------------------------------------------------------------ fantasma

	const rotulosFantasma = new Array<ImageLabel>();
	let ultimasCelulas: CelulaFantasma[] | undefined;
	effect(() => {
		const f = props.fantasma();
		const imagens = props.imagens();
		if (!f) {
			quadroFantasma.Visible = false;
			return;
		}
		quadroFantasma.Visible = true;
		quadroFantasma.Position = UDim2.fromOffset(f.x * TILE_PX, f.y * TILE_PX);
		if (f.celulas !== ultimasCelulas || imagens !== ultimasImagens) {
			ultimasCelulas = f.celulas;
			while (rotulosFantasma.size() < f.celulas.size()) {
				const label = novoRotuloTile();
				label.Parent = quadroFantasma;
				rotulosFantasma.push(label);
			}
			rotulosFantasma.forEach((label, i) => {
				const c = f.celulas[i];
				if (!c) {
					label.Visible = false;
					return;
				}
				label.Position = UDim2.fromOffset(c.dx * TILE_PX, c.dy * TILE_PX);
				if (c.tile) aplicarTile(label, c.tile, imagens);
				else {
					label.ImageContent = Content.none;
					label.SetAttribute("SemImagem", true);
					label.BackgroundTransparency = 0.4;
					label.BackgroundColor3 = c.cor ?? COR_SEM_IMAGEM;
				}
				label.Visible = true;
			});
		}
		rotulosFantasma.forEach((label, i) => {
			if (i < f.celulas.size()) {
				label.ImageTransparency = f.transparencia;
				if (label.GetAttribute("SemImagem") === true) label.BackgroundTransparency = math.max(0.4, f.transparencia);
			}
		});
	});

	// ------------------------------------------------------------------ mouse

	const celulaCursor = source<[number, number] | undefined>(undefined);
	effect(() => {
		const c = celulaCursor();
		if (!c) cursor.Visible = false;
		else {
			cursor.Position = UDim2.fromOffset(c[0] * TILE_PX, c[1] * TILE_PX);
			cursor.Visible = true;
		}
	});

	const celulaDe = (posicao: Vector3): [number, number] | undefined => {
		const abs = mundo.AbsolutePosition;
		const tam = mundo.AbsoluteSize;
		if (tam.X <= 0) return undefined;
		const escalaReal = tam.X / MUNDO_PX;
		const x = math.floor((posicao.X - abs.X) / (TILE_PX * escalaReal));
		const y = math.floor((posicao.Y - abs.Y) / (TILE_PX * escalaReal));
		if (x < 0 || y < 0 || x >= LADO || y >= LADO) return undefined;
		return [x, y];
	};

	let pressionado = false;
	let ultimaCelula: [number, number] | undefined;
	const modificadores = (): Modificadores => ({
		ctrl: UserInputService.IsKeyDown(Enum.KeyCode.LeftControl) || UserInputService.IsKeyDown(Enum.KeyCode.RightControl),
		shift: UserInputService.IsKeyDown(Enum.KeyCode.LeftShift) || UserInputService.IsKeyDown(Enum.KeyCode.RightShift),
		alt: UserInputService.IsKeyDown(Enum.KeyCode.LeftAlt) || UserInputService.IsKeyDown(Enum.KeyCode.RightAlt),
	});

	quadroEntrada.InputBegan.Connect((input) => {
		const botao =
			input.UserInputType === Enum.UserInputType.MouseButton1 ? 1 : input.UserInputType === Enum.UserInputType.MouseButton2 ? 2 : undefined;
		if (botao === undefined) return;
		const c = celulaDe(input.Position);
		if (!c) return;
		if (botao === 1) {
			pressionado = true;
			ultimaCelula = c;
		}
		props.aoPressionar(c[0], c[1], botao, modificadores());
	});
	quadroEntrada.InputChanged.Connect((input) => {
		if (input.UserInputType !== Enum.UserInputType.MouseMovement) return;
		const c = celulaDe(input.Position);
		const anterior = celulaCursor();
		if ((c === undefined) !== (anterior === undefined) || (c && anterior && (c[0] !== anterior[0] || c[1] !== anterior[1]))) {
			celulaCursor(c);
			props.aoMover(c);
		}
		if (pressionado && c && (!ultimaCelula || c[0] !== ultimaCelula[0] || c[1] !== ultimaCelula[1])) {
			ultimaCelula = c;
			props.aoArrastar(c[0], c[1]);
		}
	});
	quadroEntrada.MouseLeave.Connect(() => {
		celulaCursor(undefined);
		props.aoMover(undefined);
	});
	const soltar = (input: InputObject) => {
		if (input.UserInputType !== Enum.UserInputType.MouseButton1 || !pressionado) return;
		pressionado = false;
		const c = celulaDe(input.Position) ?? ultimaCelula;
		if (c) props.aoSoltar(c[0], c[1]);
	};
	quadroEntrada.InputEnded.Connect(soltar);
	// Soltar o botão fora do canvas também encerra a pincelada.
	cleanup(UserInputService.InputEnded.Connect(soltar));

	return (
		<scrollingframe
			Name="Canvas"
			Size={UDim2.fromScale(1, 1)}
			BackgroundColor3={cor(Enum.StudioStyleGuideColor.Dark)}
			BorderSizePixel={0}
			CanvasSize={() => {
				const z = math.max(1, math.floor(props.zoom()));
				return UDim2.fromOffset(MUNDO_PX * z + 16, MUNDO_PX * z + 16);
			}}
			ScrollingDirection={Enum.ScrollingDirection.XY}
			ScrollBarThickness={10}
			ScrollBarImageColor3={cor(Enum.StudioStyleGuideColor.ScrollBar)}
			ElasticBehavior={Enum.ElasticBehavior.Never}
		>
			{mundo}
		</scrollingframe>
	);
}
