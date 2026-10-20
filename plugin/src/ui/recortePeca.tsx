// A seção "Recorte" do Catálogo (etapa G, docs/diorama/RECORTES.md): o original da folha, o recorte, a máscara de
// cada parte e a prévia recolorida, todos montados em EditableImage com os pixels da ponte; um seletor de cor por
// parte pintável (paleta curta + campo #RRGGBB + "original"), "Restaurar cores" e "Abrir recorte no Aseprite".
//
// A prévia é o que o jogo faria: a base e, para cada parte com cor escolhida, a máscara por cima com
// `ImageColor3` = a cor. Parte sem cor escolhida fica sem máscara (a base já tem a cor original).
//
// As imagens de uma peça são criadas ao selecioná-la e destruídas ao trocar de peça ou desmontar o painel. As cores
// escolhidas são só da prévia: nada é gravado em pecas.json (guardar a cor é coisa do Decorar do jogo).
import Vide, { cleanup, effect, For, source, untrack } from "@rbxts/vide";
import { abrirArquivoNoAseprite } from "../aseprite";
import type { Peca } from "../catalogo/formato";
import {
	corDoHex,
	hexDaCor,
	ImagemMontada,
	montarImagem,
	montarOriginal,
	motivoNaoPintavel,
	opacosDe,
	PALETA,
	ParteRecorte,
	RecortePeca,
	recorteDaPeca,
} from "../catalogo/recortes";
import { Botao, Campo, cor, ESPACO, Fileira, Rotulo, TEXTO, TextoCurto } from "./kit";

/** Tamanho (px da tela) da caixa de cada imagem. */
const CAIXA = 112;
const AMOSTRA = 16;

interface ItemParte {
	parte: ParteRecorte;
	mascara: ImagemMontada;
	/** A cor escolhida; `undefined` = original (sem máscara na prévia). */
	cor: Vide.Source<Color3 | undefined>;
	hex: Vide.Source<string>;
	erroHex: Vide.Source<string>;
	/** O ImageLabel da máscara na prévia (o autoteste lê o ImageColor3). */
	rotuloPrevia?: ImageLabel;
}

type Situacao = "nenhuma" | "sem" | "carregando" | "pronto" | "erro";

interface Carga {
	peca: Peca;
	recorte: RecortePeca;
	original?: ImagemMontada;
	recorteImg: ImagemMontada;
	base: ImagemMontada;
	itens: ItemParte[];
	naoPintavel?: string;
	avisos: string[];
}

export interface EstadoRecorte {
	peca?: string;
	situacao: Situacao;
	erro?: string;
	nao_pintavel?: string;
	arquivo?: string;
	/** Pixels opacos lidos de volta de cada EditableImage. */
	original?: number;
	recorte?: number;
	base?: number;
	partes: Array<{ n: number; mascara: number; cor?: string; image_color3?: string; visivel?: boolean }>;
	avisos: string[];
}

export interface ControleRecorte {
	estado: () => EstadoRecorte;
	/** Espera a carga da peça selecionada terminar (até `segundos`). Yielda. */
	esperar: (segundos?: number) => EstadoRecorte;
	/** Escolhe a cor de uma parte (`#RRGGBB`), ou volta ao original (`undefined`). */
	pintar: (n: number, hex: string | undefined) => EstadoRecorte;
	restaurar: () => EstadoRecorte;
	/** "Abrir recorte no Aseprite"; devolve a mensagem. Yielda. */
	abrirNoAseprite: () => string;
}

function destruir(c: Carga | undefined) {
	if (!c) return;
	for (const m of [c.original, c.recorteImg, c.base]) if (m) pcall(() => m.imagem.Destroy());
	for (const item of c.itens) pcall(() => item.mascara.imagem.Destroy());
}

function hexDe(c: Color3 | undefined): string | undefined {
	return c ? hexDaCor(c) : undefined;
}

export function RecortePecaVista(props: {
	peca: () => Peca | undefined;
	/** Todas as peças do catálogo (para achar a luz cuja área contém a da peça). */
	pecas: () => Peca[];
	aoStatus: (mensagem: string) => void;
	aoMontar?: (controle: ControleRecorte) => void;
	ordem?: number;
}) {
	const situacao = source<Situacao>("nenhuma");
	const erro = source("");
	const carga = source<Carga | undefined>(undefined);
	const itens = source<ItemParte[]>([]);
	let geracao = 0;

	function carregar(p: Peca | undefined, minha: number) {
		const recorte = p ? recorteDaPeca(p) : undefined;
		if (!p || !recorte) {
			if (minha !== geracao) return;
			situacao(p ? "sem" : "nenhuma");
			return;
		}
		const montadas = new Array<ImagemMontada>();
		const falhar = (mensagem: string) => {
			for (const m of montadas) pcall(() => m.imagem.Destroy());
			if (minha !== geracao) return;
			erro(mensagem);
			situacao("erro");
		};
		const recorteImg = montarImagem(recorte.arquivo);
		if (typeIs(recorteImg, "string")) return falhar(recorteImg);
		montadas.push(recorteImg);
		const base = montarImagem(recorte.base);
		if (typeIs(base, "string")) return falhar(base);
		montadas.push(base);
		const avisos = new Array<string>();
		const original = montarOriginal(p, recorteImg.largura, recorteImg.altura, recorte.folga);
		if (typeIs(original, "string")) avisos.push(`original: ${original}`);
		else montadas.push(original);
		const lista = new Array<ItemParte>();
		for (const parte of recorte.partes) {
			const mascara = montarImagem(parte.arquivo);
			if (typeIs(mascara, "string")) return falhar(mascara);
			montadas.push(mascara);
			lista.push({ parte, mascara, cor: source<Color3 | undefined>(undefined), hex: source(""), erroHex: source("") });
		}
		if (minha !== geracao) {
			for (const m of montadas) pcall(() => m.imagem.Destroy());
			return;
		}
		const nova: Carga = {
			peca: p,
			recorte,
			original: typeIs(original, "string") ? undefined : original,
			recorteImg,
			base,
			itens: lista,
			naoPintavel: motivoNaoPintavel(p, untrack(props.pecas)),
			avisos,
		};
		const velha = untrack(carga);
		carga(nova);
		itens(lista);
		situacao("pronto");
		destruir(velha);
	}

	// Trocar de peça: descarta a carga velha (as imagens dela saem quando a nova entrar) e carrega a nova fora do
	// efeito (a ponte yielda).
	effect(() => {
		const p = props.peca();
		geracao++;
		const minha = geracao;
		untrack(() => {
			const velha = carga();
			if (velha && velha.peca !== p) {
				itens([]);
				carga(undefined);
				destruir(velha);
			}
			if (!p) {
				situacao("nenhuma");
				return;
			}
			situacao(recorteDaPeca(p) ? "carregando" : "sem");
			erro("");
		});
		task.defer(() => {
			if (minha === geracao) carregar(p, minha);
		});
	});
	cleanup(() => {
		geracao++;
		destruir(untrack(carga));
	});

	const pintavel = () => {
		const c = carga();
		return c !== undefined && c.naoPintavel === undefined;
	};

	function pintar(item: ItemParte, c: Color3 | undefined) {
		item.cor(c);
		item.hex(c ? hexDaCor(c) : "");
		item.erroHex("");
	}

	function restaurar() {
		for (const item of untrack(itens)) pintar(item, undefined);
	}

	// Escala comum a todas as caixas: inteira quando cabe (pixel nítido), fracionária quando a peça é grande.
	const escala = () => {
		const c = carga();
		if (!c) return 1;
		const bruta = math.min(CAIXA / c.recorteImg.largura, CAIXA / c.recorteImg.altura);
		return bruta >= 1 ? math.floor(bruta) : bruta;
	};
	const tamanhoImagem = () => {
		const c = carga();
		if (!c) return UDim2.fromOffset(0, 0);
		return UDim2.fromOffset(math.floor(c.recorteImg.largura * escala()), math.floor(c.recorteImg.altura * escala()));
	};
	const conteudo = (m: ImagemMontada | undefined) => (m ? Content.fromObject(m.imagem) : Content.none);

	/** Uma imagem centrada na caixa (as camadas da prévia vão como filhos). */
	const camada = (nome: string, imagem: () => Content, filhos?: Vide.Node, z = 1) => (
		<imagelabel
			Name={nome}
			BackgroundTransparency={1}
			AnchorPoint={new Vector2(0.5, 0.5)}
			Position={UDim2.fromScale(0.5, 0.5)}
			Size={tamanhoImagem}
			ImageContent={imagem}
			ResampleMode={Enum.ResamplerMode.Pixelated}
			ZIndex={z}
		>
			{filhos}
		</imagelabel>
	);

	const caixa = (titulo: Vide.Derivable<string>, conteudoCaixa: Vide.Node, ordem: number, visivel?: () => boolean) => (
		<frame
			Name="Caixa"
			BackgroundTransparency={1}
			Size={UDim2.fromOffset(CAIXA, CAIXA + TEXTO + 4)}
			LayoutOrder={ordem}
			Visible={visivel ?? true}
		>
			<frame
				Name="Fundo"
				BackgroundColor3={cor(Enum.StudioStyleGuideColor.InputFieldBackground)}
				BorderSizePixel={0}
				Size={UDim2.fromOffset(CAIXA, CAIXA)}
				ClipsDescendants={true}
			>
				{conteudoCaixa}
			</frame>
			<textlabel
				BackgroundTransparency={1}
				Position={UDim2.fromOffset(0, CAIXA + 2)}
				Size={UDim2.fromOffset(CAIXA, TEXTO)}
				Text={titulo}
				TextSize={TEXTO - 2}
				FontFace={Font.fromEnum(Enum.Font.SourceSans)}
				TextColor3={cor(Enum.StudioStyleGuideColor.DimmedText)}
				TextTruncate={Enum.TextTruncate.AtEnd}
			/>
		</frame>
	);

	const linhaSituacao = () => {
		const c = carga();
		switch (situacao()) {
			case "nenhuma":
				return "";
			case "sem":
				return "sem recorte (rode python tools/recortes.py)";
			case "carregando":
				return "Montando o recorte pela ponte...";
			case "erro":
				return `Não montou o recorte: ${erro()}`;
			case "pronto": {
				if (!c) return "";
				const n = c.itens.size();
				const partes = `${n} parte(s) pintável(is), folga ${c.recorte.folga} px, ${c.recorteImg.largura} × ${c.recorteImg.altura} px · ${c.recorte.arquivo}`;
				const aviso = c.avisos.size() > 0 ? ` · ${c.avisos.join("; ")}` : "";
				if (c.naoPintavel !== undefined) return `${partes} · não pintável: ${c.naoPintavel}${aviso}`;
				if (n === 0) return `${partes} · nada a pintar (tudo ficou na base)${aviso}`;
				return `${partes}${aviso}`;
			}
		}
	};

	const controle: ControleRecorte = {
		estado: () => {
			const c = untrack(carga);
			return {
				peca: untrack(props.peca)?.id,
				situacao: untrack(situacao),
				erro: untrack(erro) !== "" ? untrack(erro) : undefined,
				nao_pintavel: c?.naoPintavel,
				arquivo: c?.recorte.arquivo,
				original: c?.original ? opacosDe(c.original) : undefined,
				recorte: c ? opacosDe(c.recorteImg) : undefined,
				base: c ? opacosDe(c.base) : undefined,
				partes: (c?.itens ?? []).map((item) => ({
					n: item.parte.n,
					mascara: opacosDe(item.mascara),
					cor: hexDe(untrack(item.cor)),
					image_color3: item.rotuloPrevia ? hexDaCor(item.rotuloPrevia.ImageColor3) : undefined,
					visivel: item.rotuloPrevia?.Visible,
				})),
				avisos: c?.avisos ?? [],
			};
		},
		esperar: (segundos = 15) => {
			const limite = os.clock() + segundos;
			task.wait();
			while (untrack(situacao) === "carregando" && os.clock() < limite) task.wait(0.05);
			return controle.estado();
		},
		pintar: (n, hex) => {
			const item = untrack(itens).find((i) => i.parte.n === n);
			if (!item) error(`a peça não tem a parte ${n}`, 0);
			if (!untrack(pintavel)) error("peça não pintável (luz ou fogo)", 0);
			if (hex === undefined) pintar(item, undefined);
			else {
				const c = corDoHex(hex);
				if (!c) error(`cor inválida: ${hex} (use #RRGGBB)`, 0);
				pintar(item, c);
			}
			return controle.estado();
		},
		restaurar: () => {
			restaurar();
			return controle.estado();
		},
		abrirNoAseprite: () => abrirAseprite(true),
	};
	props.aoMontar?.(controle);

	function abrirAseprite(esperar: boolean): string {
		const c = untrack(carga);
		const p = untrack(props.peca);
		const recorte = c?.recorte ?? (p ? recorteDaPeca(p) : undefined);
		if (!recorte) {
			const m = "Esta peça não tem recorte (rode python tools/recortes.py).";
			props.aoStatus(m);
			return m;
		}
		props.aoStatus(`Abrindo ${recorte.arquivo} no Aseprite...`);
		const rodar = () => {
			const r = abrirArquivoNoAseprite(recorte.arquivo);
			props.aoStatus(r.mensagem);
			return r.mensagem;
		};
		if (esperar) return rodar();
		task.spawn(rodar);
		return "";
	}

	return (
		<frame Name="RecortePeca" BackgroundTransparency={1} Size={new UDim2(1, 0, 0, 0)} AutomaticSize={Enum.AutomaticSize.Y} LayoutOrder={props.ordem}>
			<uilistlayout FillDirection={Enum.FillDirection.Vertical} SortOrder={Enum.SortOrder.LayoutOrder} Padding={new UDim(0, ESPACO)} />
			<Fileira ordem={0}>
				<TextoCurto texto="Recorte e cores (etapa G)" negrito={true} ordem={0} />
				<Botao texto="Restaurar cores" aoClicar={restaurar} desligado={() => situacao() !== "pronto" || !pintavel()} ordem={1} />
				<Botao texto="Abrir recorte no Aseprite" aoClicar={() => abrirAseprite(false)} desligado={() => situacao() === "sem" || situacao() === "nenhuma"} ordem={2} />
			</Fileira>
			<Rotulo texto={linhaSituacao} tom={() => (situacao() === "erro" ? "erro" : "fraco")} ordem={1} />

			{/* As imagens: original, recorte, cada máscara e a prévia. */}
			<Fileira ordem={2} visivel={() => situacao() === "pronto"}>
				{caixa("Original (folha)", camada("Original", () => conteudo(carga()?.original)), 0)}
				{caixa("Recorte", camada("Recorte", () => conteudo(carga()?.recorteImg)), 1)}
				<frame Name="Mascaras" BackgroundTransparency={1} Size={new UDim2(0, 0, 0, CAIXA + TEXTO + 4)} AutomaticSize={Enum.AutomaticSize.X} LayoutOrder={2}>
					<uilistlayout FillDirection={Enum.FillDirection.Horizontal} SortOrder={Enum.SortOrder.LayoutOrder} Padding={new UDim(0, ESPACO)} />
					<For each={itens}>
						{(item, i) =>
							caixa(
								`Parte ${item.parte.n} (máscara)`,
								camada(`Mascara${item.parte.n}`, () => Content.fromObject(item.mascara.imagem)),
								i(),
							)
						}
					</For>
				</frame>
				{caixa(
					() => (itens().some((i) => i.cor() !== undefined) ? "Prévia recolorida" : "Prévia (cores originais)"),
					camada(
						"Previa",
						() => conteudo(carga()?.base),
						<For each={itens}>
							{(item) => {
								const rotulo = (
									<imagelabel
										Name={`Previa${item.parte.n}`}
										BackgroundTransparency={1}
										Size={UDim2.fromScale(1, 1)}
										ImageContent={Content.fromObject(item.mascara.imagem)}
										ImageColor3={() => item.cor() ?? item.parte.referencia}
										Visible={() => item.cor() !== undefined}
										ResampleMode={Enum.ResamplerMode.Pixelated}
										ZIndex={2 + item.parte.n}
									/>
								) as ImageLabel;
								item.rotuloPrevia = rotulo;
								return rotulo;
							}}
						</For>,
					),
					3,
				)}
			</Fileira>

			{/* Um seletor por parte pintável. */}
			<frame
				Name="Seletores"
				BackgroundTransparency={1}
				Size={new UDim2(1, 0, 0, 0)}
				AutomaticSize={Enum.AutomaticSize.Y}
				Visible={() => situacao() === "pronto" && pintavel()}
				LayoutOrder={3}
			>
				<uilistlayout FillDirection={Enum.FillDirection.Vertical} SortOrder={Enum.SortOrder.LayoutOrder} Padding={new UDim(0, 2)} />
				<For each={itens}>
					{(item, i) => {
						// O campo grava `hex` quando o foco sai; aqui a cor segue o texto (vazio = original).
						effect(() => {
							const texto = item.hex();
							untrack(() => {
								if (texto === "") {
									if (item.cor() !== undefined) item.cor(undefined);
									item.erroHex("");
									return;
								}
								const c = corDoHex(texto);
								if (!c) return item.erroHex("use #RRGGBB");
								item.erroHex("");
								if (hexDe(item.cor()) !== hexDaCor(c)) item.cor(c);
							});
						});
						return (
							<Fileira ordem={i()} espaco={4}>
								<TextoCurto texto={`Parte ${item.parte.n}`} negrito={true} ordem={0} />
								<frame
									Name="Atual"
									BackgroundColor3={() => item.cor() ?? item.parte.referencia}
									BorderSizePixel={0}
									Size={UDim2.fromOffset(AMOSTRA + 4, AMOSTRA + 4)}
									LayoutOrder={1}
								>
									<uistroke Color={cor(Enum.StudioStyleGuideColor.Border)} Thickness={1} />
								</frame>
								{PALETA.map((p, j) => (
									<textbutton
										Name={`Cor_${p.nome}`}
										Text=""
										AutoButtonColor={true}
										BackgroundColor3={p.cor}
										BorderSizePixel={0}
										Size={UDim2.fromOffset(AMOSTRA, AMOSTRA)}
										LayoutOrder={2 + j}
										Activated={() => pintar(item, p.cor)}
									>
										<uistroke
											Color={() => (hexDe(item.cor()) === hexDaCor(p.cor) ? cor(Enum.StudioStyleGuideColor.MainText)() : cor(Enum.StudioStyleGuideColor.Border)())}
											Thickness={() => (hexDe(item.cor()) === hexDaCor(p.cor) ? 2 : 1)}
										/>
									</textbutton>
								))}
								<Campo valor={item.hex} dica={item.parte.referenciaHex} largura={new UDim(0, 80)} ordem={100} />
								<Botao texto="original" aoClicar={() => pintar(item, undefined)} ativo={() => item.cor() === undefined} ordem={101} />
								<TextoCurto
									texto={() =>
										item.erroHex() !== ""
											? item.erroHex()
											: `ref ${item.parte.referenciaHex} · ${item.parte.pixels} px`
									}
									tom={() => (item.erroHex() !== "" ? "erro" : "fraco")}
									ordem={102}
								/>
							</Fileira>
						);
					}}
				</For>
			</frame>
		</frame>
	);
}
