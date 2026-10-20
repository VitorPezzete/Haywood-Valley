// Peças de interface do plugin, no tema do Studio (claro ou escuro, `settings().Studio.Theme`). Sem arte:
// só cores do guia de estilo do Studio. Cada peça devolve um elemento do Vide; as cores são funções, então
// trocam sozinhas quando o tema muda. Toda peça aceita `ordem` (LayoutOrder) para viver numa `Coluna`, `Linha`,
// `Fileira` ou `Lista`.
//
// Em ordem: as caixas (Painel, Coluna, Linha, Fileira, Bloco, Preenche, Espaco, Lista), os textos (Rotulo, Titulo,
// TextoCurto, Etiqueta, Aviso, Separador), os controles (Botao, Interruptor, Alternar, Ciclo, Escolha, Marcas,
// Abas), os campos (Campo, CampoMulti, CaixaTexto, AreaTexto, LinhaCampo). O que é só do editor de mapas (Quadro,
// ListaSelecao, Amostra, Legenda) fica em extras.tsx.
import Vide, { action, For, source } from "@rbxts/vide";

type Derivable<T> = T | (() => T);

/** O tema atual do Studio, como fonte: muda quando o usuário troca o tema. */
export const tema = source(settings().Studio.Theme);
settings().Studio.ThemeChanged.Connect(() => tema(settings().Studio.Theme));

/** Cor do guia de estilo do Studio, reativa ao tema. */
export function cor(
	item: Enum.StudioStyleGuideColor,
	modificador?: Enum.StudioStyleGuideModifier,
): () => Color3 {
	return () => tema().GetColor(item, modificador);
}

export const FONTE = Font.fromEnum(Enum.Font.SourceSans);
export const FONTE_NEGRITO = Font.fromEnum(Enum.Font.SourceSansBold);
export const FONTE_MONO = Font.fromEnum(Enum.Font.Code);
/** Tamanho do texto corrido, em pixels da tela. */
export const TEXTO = 14;
/** Espaço entre peças. */
export const ESPACO = 6;

export type Tom = "normal" | "fraco" | "erro" | "ok" | "aviso";

const COR_DO_TOM: Record<Tom, Enum.StudioStyleGuideColor> = {
	normal: Enum.StudioStyleGuideColor.MainText,
	fraco: Enum.StudioStyleGuideColor.DimmedText,
	erro: Enum.StudioStyleGuideColor.ErrorText,
	ok: Enum.StudioStyleGuideColor.InfoText,
	aviso: Enum.StudioStyleGuideColor.WarningText,
};

function ler<T>(valor: Derivable<T>): T {
	return typeIs(valor, "function") ? (valor as () => T)() : (valor as T);
}

/** Fundo do widget inteiro, com margem. Põe dentro uma `Coluna`, uma `Linha` ou peças posicionadas à mão. */
export function Painel(props: { children?: Vide.Node; margem?: number }) {
	const margem = props.margem ?? ESPACO;
	return (
		<frame
			Name="Painel"
			Size={UDim2.fromScale(1, 1)}
			BackgroundColor3={cor(Enum.StudioStyleGuideColor.MainBackground)}
			BorderSizePixel={0}
		>
			<uipadding
				PaddingTop={new UDim(0, margem)}
				PaddingBottom={new UDim(0, margem)}
				PaddingLeft={new UDim(0, margem)}
				PaddingRight={new UDim(0, margem)}
			/>
			{props.children}
		</frame>
	);
}

/** Empilha os filhos de cima para baixo. Com `tamanho`, ocupa esse espaço; sem, cresce com o conteúdo. */
export function Coluna(props: {
	children?: Vide.Node;
	tamanho?: Derivable<UDim2>;
	posicao?: Derivable<UDim2>;
	espaco?: number;
	alinhamento?: Enum.HorizontalAlignment;
	ordem?: number;
	visivel?: Derivable<boolean>;
	nome?: string;
}) {
	return (
		<frame
			Name={props.nome ?? "Coluna"}
			BackgroundTransparency={1}
			Size={props.tamanho ?? new UDim2(1, 0, 0, 0)}
			Position={props.posicao}
			AutomaticSize={props.tamanho === undefined ? Enum.AutomaticSize.Y : Enum.AutomaticSize.None}
			Visible={() => ler(props.visivel ?? true)}
			LayoutOrder={props.ordem}
		>
			<uilistlayout
				FillDirection={Enum.FillDirection.Vertical}
				SortOrder={Enum.SortOrder.LayoutOrder}
				Padding={new UDim(0, props.espaco ?? ESPACO)}
				HorizontalAlignment={props.alinhamento ?? Enum.HorizontalAlignment.Left}
			/>
			{props.children}
		</frame>
	);
}

/** Põe os filhos lado a lado, da esquerda para a direita. */
export function Linha(props: {
	children?: Vide.Node;
	tamanho?: Derivable<UDim2>;
	espaco?: number;
	ordem?: number;
	visivel?: Derivable<boolean>;
}) {
	return (
		<frame
			Name="Linha"
			BackgroundTransparency={1}
			Size={props.tamanho ?? new UDim2(1, 0, 0, 0)}
			AutomaticSize={props.tamanho === undefined ? Enum.AutomaticSize.Y : Enum.AutomaticSize.None}
			Visible={() => ler(props.visivel ?? true)}
			LayoutOrder={props.ordem}
		>
			<uilistlayout
				FillDirection={Enum.FillDirection.Horizontal}
				SortOrder={Enum.SortOrder.LayoutOrder}
				VerticalAlignment={Enum.VerticalAlignment.Center}
				Padding={new UDim(0, props.espaco ?? ESPACO)}
			/>
			{props.children}
		</frame>
	);
}

/** Texto de uma ou mais linhas; quebra e cresce para baixo. */
export function Rotulo(props: {
	texto: Derivable<string>;
	tom?: Derivable<Tom>;
	negrito?: boolean;
	mono?: boolean;
	ordem?: number;
}) {
	return (
		<textlabel
			Name="Rotulo"
			BackgroundTransparency={1}
			Size={new UDim2(1, 0, 0, 0)}
			AutomaticSize={Enum.AutomaticSize.Y}
			FontFace={props.mono ? FONTE_MONO : props.negrito ? FONTE_NEGRITO : FONTE}
			Text={props.texto}
			TextSize={TEXTO}
			TextColor3={() => tema().GetColor(COR_DO_TOM[ler(props.tom ?? "normal")])}
			TextWrapped={true}
			TextXAlignment={Enum.TextXAlignment.Left}
			TextYAlignment={Enum.TextYAlignment.Top}
			LayoutOrder={props.ordem}
		/>
	);
}

/** Título de seção. */
export function Titulo(props: { texto: Derivable<string>; ordem?: number }) {
	return (
		<textlabel
			Name="Titulo"
			BackgroundTransparency={1}
			Size={new UDim2(1, 0, 0, 0)}
			AutomaticSize={Enum.AutomaticSize.Y}
			FontFace={FONTE_NEGRITO}
			Text={props.texto}
			TextSize={TEXTO + 4}
			TextColor3={cor(Enum.StudioStyleGuideColor.BrightText)}
			TextWrapped={true}
			TextXAlignment={Enum.TextXAlignment.Left}
			LayoutOrder={props.ordem}
		/>
	);
}

/** Linha fina entre seções. */
export function Separador(props: { ordem?: number }) {
	return (
		<frame
			Name="Separador"
			Size={new UDim2(1, 0, 0, 1)}
			BackgroundColor3={cor(Enum.StudioStyleGuideColor.Separator)}
			BorderSizePixel={0}
			LayoutOrder={props.ordem}
		/>
	);
}

/** Botão de texto. `principal` usa a cor de destaque do Studio; `ativo` o deixa marcado (como uma aba aberta). */
export function Botao(props: {
	texto: Derivable<string>;
	aoClicar: () => void;
	principal?: boolean;
	ativo?: Derivable<boolean>;
	desligado?: Derivable<boolean>;
	largura?: Derivable<UDim>;
	ordem?: number;
}) {
	const passando = source(false);
	const fundo = props.principal ? Enum.StudioStyleGuideColor.MainButton : Enum.StudioStyleGuideColor.Button;
	const modificador = () => {
		if (ler(props.desligado ?? false)) return Enum.StudioStyleGuideModifier.Disabled;
		if (ler(props.ativo ?? false)) return Enum.StudioStyleGuideModifier.Selected;
		if (passando()) return Enum.StudioStyleGuideModifier.Hover;
		return Enum.StudioStyleGuideModifier.Default;
	};
	return (
		<textbutton
			Name="Botao"
			AutoButtonColor={false}
			Size={() => new UDim2(ler(props.largura ?? new UDim(0, 0)), new UDim(0, TEXTO + 10))}
			AutomaticSize={props.largura === undefined ? Enum.AutomaticSize.X : Enum.AutomaticSize.None}
			BackgroundColor3={() => tema().GetColor(fundo, modificador())}
			BorderSizePixel={0}
			FontFace={FONTE}
			Text={props.texto}
			TextSize={TEXTO}
			TextColor3={() => tema().GetColor(Enum.StudioStyleGuideColor.ButtonText, modificador())}
			TextTruncate={Enum.TextTruncate.AtEnd}
			LayoutOrder={props.ordem}
			Activated={() => {
				if (!ler(props.desligado ?? false)) props.aoClicar();
			}}
			MouseEnter={() => passando(true)}
			MouseLeave={() => passando(false)}
		>
			<uipadding PaddingLeft={new UDim(0, 10)} PaddingRight={new UDim(0, 10)} />
			<uicorner CornerRadius={new UDim(0, 3)} />
			<uistroke
				Color={() => tema().GetColor(Enum.StudioStyleGuideColor.ButtonBorder, modificador())}
				Thickness={1}
			/>
		</textbutton>
	);
}

/** Campo de texto de uma linha. Grava em `valor` quando o foco sai; Enter chama `aoConfirmar`. */
export function Campo(props: {
	valor: Vide.Source<string>;
	dica?: string;
	aoConfirmar?: (texto: string) => void;
	largura?: Derivable<UDim>;
	ordem?: number;
}) {
	return (
		<textbox
			Name="Campo"
			Size={() => new UDim2(ler(props.largura ?? new UDim(1, 0)), new UDim(0, TEXTO + 10))}
			BackgroundColor3={cor(Enum.StudioStyleGuideColor.InputFieldBackground)}
			BorderSizePixel={0}
			FontFace={FONTE}
			Text={props.valor}
			PlaceholderText={props.dica ?? ""}
			PlaceholderColor3={cor(Enum.StudioStyleGuideColor.DimmedText)}
			TextSize={TEXTO}
			TextColor3={cor(Enum.StudioStyleGuideColor.MainText)}
			TextXAlignment={Enum.TextXAlignment.Left}
			ClearTextOnFocus={false}
			LayoutOrder={props.ordem}
		>
			<uipadding PaddingLeft={new UDim(0, 6)} PaddingRight={new UDim(0, 6)} />
			<uicorner CornerRadius={new UDim(0, 3)} />
			<uistroke Color={cor(Enum.StudioStyleGuideColor.InputFieldBorder)} Thickness={1} />
			{action((caixa: TextBox) => {
				caixa.FocusLost.Connect((enter) => {
					props.valor(caixa.Text);
					if (enter && props.aoConfirmar) props.aoConfirmar(caixa.Text);
				});
			})}
		</textbox>
	);
}

/** Lista rolável vertical; os filhos empilham. Ocupa `tamanho` (padrão: o que sobra do pai). */
export function Lista(props: {
	children?: Vide.Node;
	tamanho?: Derivable<UDim2>;
	posicao?: Derivable<UDim2>;
	espaco?: number;
	ordem?: number;
}) {
	return (
		<scrollingframe
			Name="Lista"
			Size={props.tamanho ?? UDim2.fromScale(1, 1)}
			Position={props.posicao}
			BackgroundTransparency={1}
			BorderSizePixel={0}
			CanvasSize={new UDim2(0, 0, 0, 0)}
			AutomaticCanvasSize={Enum.AutomaticSize.Y}
			ScrollingDirection={Enum.ScrollingDirection.Y}
			ScrollBarThickness={8}
			ScrollBarImageColor3={cor(Enum.StudioStyleGuideColor.ScrollBar)}
			LayoutOrder={props.ordem}
		>
			<uilistlayout
				FillDirection={Enum.FillDirection.Vertical}
				SortOrder={Enum.SortOrder.LayoutOrder}
				Padding={new UDim(0, props.espaco ?? ESPACO)}
			/>
			{props.children}
		</scrollingframe>
	);
}

/** Fileira de abas: um botão por aba, marcado o da aba aberta. O conteúdo fica por conta de quem chama. */
export function Abas(props: { abas: Array<{ id: string; titulo: string }>; aberta: Vide.Source<string>; ordem?: number }) {
	return (
		<Linha espaco={2} ordem={props.ordem}>
			{props.abas.map((aba, i) => (
				<Botao texto={aba.titulo} ativo={() => props.aberta() === aba.id} aoClicar={() => props.aberta(aba.id)} ordem={i} />
			))}
		</Linha>
	);
}

/** Texto comprido, rolável, em fonte de código; dá para selecionar e copiar, não para editar. */
export function AreaTexto(props: { texto: Derivable<string>; tamanho?: Derivable<UDim2>; posicao?: Derivable<UDim2>; ordem?: number }) {
	return (
		<scrollingframe
			Name="AreaTexto"
			Size={props.tamanho ?? UDim2.fromScale(1, 1)}
			Position={props.posicao}
			BackgroundColor3={cor(Enum.StudioStyleGuideColor.InputFieldBackground)}
			BorderSizePixel={0}
			CanvasSize={new UDim2(0, 0, 0, 0)}
			AutomaticCanvasSize={Enum.AutomaticSize.Y}
			ScrollingDirection={Enum.ScrollingDirection.Y}
			ScrollBarThickness={8}
			ScrollBarImageColor3={cor(Enum.StudioStyleGuideColor.ScrollBar)}
			LayoutOrder={props.ordem}
		>
			<uistroke Color={cor(Enum.StudioStyleGuideColor.InputFieldBorder)} Thickness={1} />
			<textbox
				Name="Texto"
				Size={new UDim2(1, -12, 0, 0)}
				Position={UDim2.fromOffset(6, 6)}
				AutomaticSize={Enum.AutomaticSize.Y}
				BackgroundTransparency={1}
				FontFace={FONTE_MONO}
				Text={props.texto}
				TextSize={TEXTO}
				TextColor3={cor(Enum.StudioStyleGuideColor.MainText)}
				TextWrapped={true}
				TextXAlignment={Enum.TextXAlignment.Left}
				TextYAlignment={Enum.TextYAlignment.Top}
				MultiLine={true}
				TextEditable={false}
				ClearTextOnFocus={false}
			/>
		</scrollingframe>
	);
}

// ------------------------------------------------------------------ caixas com ordem e visibilidade

/** Linha (filhos lado a lado) com ordem de layout e visibilidade reativa; quebra para a linha de baixo quando não cabe. */
export function Fileira(props: { children?: Vide.Node; ordem?: number; espaco?: number; visivel?: Derivable<boolean> }) {
	return (
		<frame
			Name="Fileira"
			BackgroundTransparency={1}
			Size={new UDim2(1, 0, 0, 0)}
			AutomaticSize={Enum.AutomaticSize.Y}
			Visible={() => ler(props.visivel ?? true)}
			LayoutOrder={props.ordem}
		>
			<uilistlayout
				FillDirection={Enum.FillDirection.Horizontal}
				SortOrder={Enum.SortOrder.LayoutOrder}
				VerticalAlignment={Enum.VerticalAlignment.Center}
				Wraps={true}
				Padding={new UDim(0, props.espaco ?? ESPACO)}
			/>
			{props.children}
		</frame>
	);
}

/**
 * Coluna com ordem de layout e visibilidade reativa. Sem `tamanho`, cresce com o conteúdo; com, ocupa o espaço
 * (para as abas de um painel: criar todas de uma vez e alternar `visivel`). É a `Coluna` com outro nome, mantida
 * porque os painéis a usam como "um bloco de uma aba".
 */
export function Bloco(props: {
	children?: Vide.Node;
	ordem?: number;
	visivel?: Derivable<boolean>;
	tamanho?: Derivable<UDim2>;
	posicao?: Derivable<UDim2>;
	espaco?: number;
	nome?: string;
}) {
	return (
		<Coluna
			nome={props.nome ?? "Bloco"}
			ordem={props.ordem}
			visivel={props.visivel}
			tamanho={props.tamanho}
			posicao={props.posicao}
			espaco={props.espaco}
		>
			{props.children}
		</Coluna>
	);
}

/**
 * Ocupa o que sobra do pai (uma `Coluna`, `Bloco` ou `Lista` com lista vertical), por um UIFlexItem em modo Fill.
 * Para a lista ou a área de texto que fica embaixo de controles de altura variável.
 */
export function Preenche(props: { children?: Vide.Node; ordem?: number; visivel?: Derivable<boolean> }) {
	return (
		<frame
			Name="Preenche"
			BackgroundTransparency={1}
			Size={new UDim2(1, 0, 0, 120)}
			Visible={() => ler(props.visivel ?? true)}
			LayoutOrder={props.ordem}
		>
			<uiflexitem FlexMode={Enum.UIFlexMode.Fill} />
			{props.children}
		</frame>
	);
}

/** Espaço vertical fixo. */
export function Espaco(props: { altura?: number; ordem?: number }) {
	return <frame Name="Espaco" BackgroundTransparency={1} Size={new UDim2(1, 0, 0, props.altura ?? ESPACO)} LayoutOrder={props.ordem} />;
}

// ------------------------------------------------------------------ textos curtos

/**
 * Texto de uma linha que ocupa só a largura do que diz (o `Rotulo` ocupa a largura inteira e, numa `Fileira`,
 * empurra o resto para baixo). Para rótulos ao lado de campos e botões; `tom="fraco"` para legendas.
 */
export function TextoCurto(props: { texto: Derivable<string>; tom?: Derivable<Tom>; negrito?: boolean; mono?: boolean; ordem?: number }) {
	return (
		<textlabel
			Name="TextoCurto"
			BackgroundTransparency={1}
			Size={new UDim2(0, 0, 0, TEXTO + 10)}
			AutomaticSize={Enum.AutomaticSize.X}
			FontFace={props.mono ? FONTE_MONO : props.negrito ? FONTE_NEGRITO : FONTE}
			Text={props.texto}
			TextSize={TEXTO}
			TextColor3={() => tema().GetColor(COR_DO_TOM[ler(props.tom ?? "normal")])}
			TextXAlignment={Enum.TextXAlignment.Left}
			LayoutOrder={props.ordem}
		>
			<uipadding PaddingRight={new UDim(0, 4)} />
		</textlabel>
	);
}

/** Etiqueta curta de uma palavra ("erro", "aviso", "ok"), com a cor do tom; cabe numa fileira ao lado de texto. */
export function Etiqueta(props: { texto: Derivable<string>; tom?: Derivable<Tom>; ordem?: number }) {
	const corDoTom = () => tema().GetColor(COR_DO_TOM[ler(props.tom ?? "normal")]);
	return (
		<textlabel
			Name="Etiqueta"
			Size={new UDim2(0, 0, 0, TEXTO + 4)}
			AutomaticSize={Enum.AutomaticSize.X}
			BackgroundColor3={cor(Enum.StudioStyleGuideColor.Tab)}
			BorderSizePixel={0}
			FontFace={FONTE_NEGRITO}
			Text={props.texto}
			TextSize={TEXTO - 2}
			TextColor3={corDoTom}
			LayoutOrder={props.ordem}
		>
			<uipadding PaddingLeft={new UDim(0, 6)} PaddingRight={new UDim(0, 6)} />
			<uicorner CornerRadius={new UDim(0, 3)} />
			<uistroke Color={corDoTom} Thickness={1} />
		</textlabel>
	);
}

/** Uma linha de aviso que some (altura zero) enquanto o texto está vazio. Tom padrão: aviso. */
export function Aviso(props: { texto: Derivable<string>; tom?: Derivable<Tom>; ordem?: number }) {
	return (
		<textlabel
			Name="Aviso"
			BackgroundTransparency={1}
			Size={new UDim2(1, 0, 0, 0)}
			AutomaticSize={Enum.AutomaticSize.Y}
			Visible={() => ler(props.texto) !== ""}
			FontFace={FONTE}
			Text={props.texto}
			TextSize={TEXTO}
			TextColor3={() => tema().GetColor(COR_DO_TOM[ler(props.tom ?? "aviso")])}
			TextWrapped={true}
			TextXAlignment={Enum.TextXAlignment.Left}
			TextYAlignment={Enum.TextYAlignment.Top}
			LayoutOrder={props.ordem}
		/>
	);
}

// ------------------------------------------------------------------ controles

/** Interruptor: um botão que mostra "Ligado"/"Desligado" (ou os textos dados) e fica marcado quando ligado. */
export function Interruptor(props: {
	ligado: Derivable<boolean>;
	aoMudar: (ligado: boolean) => void;
	textoLigado?: string;
	textoDesligado?: string;
	desligado?: Derivable<boolean>;
	ordem?: number;
}) {
	return (
		<Botao
			texto={() => (ler(props.ligado) ? (props.textoLigado ?? "Ligado") : (props.textoDesligado ?? "Desligado"))}
			ativo={() => ler(props.ligado)}
			desligado={props.desligado}
			aoClicar={() => props.aoMudar(!ler(props.ligado))}
			ordem={props.ordem}
		/>
	);
}

/** Botão que liga e desliga uma fonte booleana (☑/☐); fica marcado quando ligado. */
export function Alternar(props: { texto: Derivable<string>; valor: Vide.Source<boolean>; ordem?: number }) {
	return (
		<Botao
			texto={() => `${props.valor() ? "☑" : "☐"} ${ler(props.texto)}`}
			ativo={props.valor}
			aoClicar={() => props.valor(!props.valor())}
			ordem={props.ordem}
		/>
	);
}

/** Botão que passa para a próxima opção a cada clique; mostra `rotulo: opção`. */
export function Ciclo<T>(props: { rotulo: string; opcoes: ReadonlyArray<{ valor: T; texto: string }>; valor: Vide.Source<T>; ordem?: number }) {
	const textoDe = () => {
		const atual = props.opcoes.find((o) => o.valor === props.valor());
		return `${props.rotulo}: ${atual ? atual.texto : tostring(props.valor())}`;
	};
	return (
		<Botao
			texto={textoDe}
			aoClicar={() => {
				const i = props.opcoes.findIndex((o) => o.valor === props.valor());
				const proxima = props.opcoes[(i + 1) % props.opcoes.size()];
				if (proxima) props.valor(proxima.valor);
			}}
			ordem={props.ordem}
		/>
	);
}

/** Fileira de botões que quebra linha; só um fica marcado. */
export function Escolha(props: { opcoes: ReadonlyArray<{ id: string; titulo: string }>; valor: Vide.Source<string>; rotulo?: string; ordem?: number }) {
	return (
		<Fileira espaco={2} ordem={props.ordem}>
			{props.rotulo !== undefined ? <TextoCurto texto={props.rotulo} tom="fraco" ordem={-1} /> : undefined}
			{props.opcoes.map((opcao, i) => (
				<Botao texto={opcao.titulo} ativo={() => props.valor() === opcao.id} aoClicar={() => props.valor(opcao.id)} ordem={i} />
			))}
		</Fileira>
	);
}

/** Várias opções ligadas ao mesmo tempo (a lista de opções pode mudar). */
export function Marcas(props: {
	opcoes: () => ReadonlyArray<{ id: string; titulo: string }>;
	valor: Vide.Source<string[]>;
	rotulo?: string;
	vazio?: string;
	ordem?: number;
}) {
	const ligada = (id: string) => props.valor().includes(id);
	const alternar = (id: string) => {
		const atual = props.valor();
		props.valor(atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]);
	};
	return (
		<Fileira espaco={2} ordem={props.ordem}>
			{props.rotulo !== undefined ? <TextoCurto texto={props.rotulo} tom="fraco" ordem={-1} /> : undefined}
			<For each={props.opcoes}>
				{(opcao, indice) => <Botao texto={opcao.titulo} ativo={() => ligada(opcao.id)} aoClicar={() => alternar(opcao.id)} ordem={indice()} />}
			</For>
			<TextoCurto texto={() => (props.opcoes().size() === 0 ? (props.vazio ?? "(nenhuma opção)") : "")} tom="fraco" ordem={100000} />
		</Fileira>
	);
}

// ------------------------------------------------------------------ campos

/** Campo de texto de várias linhas, de altura fixa; grava em `valor` quando o foco sai. */
export function CampoMulti(props: { valor: Vide.Source<string>; dica?: string; altura?: number; ordem?: number; mono?: boolean }) {
	return (
		<textbox
			Name="CampoMulti"
			Size={new UDim2(1, 0, 0, props.altura ?? TEXTO * 4 + 12)}
			BackgroundColor3={cor(Enum.StudioStyleGuideColor.InputFieldBackground)}
			BorderSizePixel={0}
			FontFace={props.mono ? FONTE_MONO : FONTE}
			Text={props.valor}
			PlaceholderText={props.dica ?? ""}
			PlaceholderColor3={cor(Enum.StudioStyleGuideColor.DimmedText)}
			TextSize={TEXTO}
			TextColor3={cor(Enum.StudioStyleGuideColor.MainText)}
			TextXAlignment={Enum.TextXAlignment.Left}
			TextYAlignment={Enum.TextYAlignment.Top}
			TextWrapped={true}
			MultiLine={true}
			ClearTextOnFocus={false}
			LayoutOrder={props.ordem}
		>
			<uipadding PaddingLeft={new UDim(0, 6)} PaddingRight={new UDim(0, 6)} PaddingTop={new UDim(0, 4)} />
			<uicorner CornerRadius={new UDim(0, 3)} />
			<uistroke Color={cor(Enum.StudioStyleGuideColor.InputFieldBorder)} Thickness={1} />
			{action((caixa: TextBox) => {
				caixa.FocusLost.Connect(() => props.valor(caixa.Text));
			})}
		</textbox>
	);
}

/** Caixa de texto de várias linhas, rolável e editável, em fonte de código: para colar JSON ou listas. */
export function CaixaTexto(props: { valor: Vide.Source<string>; dica?: string; tamanho?: Derivable<UDim2>; ordem?: number }) {
	return (
		<scrollingframe
			Name="CaixaTexto"
			Size={props.tamanho ?? new UDim2(1, 0, 0, 120)}
			BackgroundColor3={cor(Enum.StudioStyleGuideColor.InputFieldBackground)}
			BorderSizePixel={0}
			CanvasSize={new UDim2(0, 0, 0, 0)}
			AutomaticCanvasSize={Enum.AutomaticSize.Y}
			ScrollingDirection={Enum.ScrollingDirection.Y}
			ScrollBarThickness={8}
			ScrollBarImageColor3={cor(Enum.StudioStyleGuideColor.ScrollBar)}
			LayoutOrder={props.ordem}
		>
			<uistroke Color={cor(Enum.StudioStyleGuideColor.InputFieldBorder)} Thickness={1} />
			<textbox
				Name="Texto"
				Size={new UDim2(1, -12, 1, -12)}
				Position={UDim2.fromOffset(6, 6)}
				AutomaticSize={Enum.AutomaticSize.Y}
				BackgroundTransparency={1}
				FontFace={FONTE_MONO}
				Text={props.valor}
				PlaceholderText={props.dica ?? ""}
				PlaceholderColor3={cor(Enum.StudioStyleGuideColor.DimmedText)}
				TextSize={TEXTO}
				TextColor3={cor(Enum.StudioStyleGuideColor.MainText)}
				TextWrapped={true}
				TextXAlignment={Enum.TextXAlignment.Left}
				TextYAlignment={Enum.TextYAlignment.Top}
				MultiLine={true}
				TextEditable={true}
				ClearTextOnFocus={false}
			>
				{action((caixa: TextBox) => {
					caixa.FocusLost.Connect(() => props.valor(caixa.Text));
				})}
			</textbox>
		</scrollingframe>
	);
}

/** Rótulo e campo lado a lado: o rótulo com largura fixa, o conteúdo com o resto (e quebrando linha). */
export function LinhaCampo(props: { rotulo: string; largura?: number; children?: Vide.Node; ordem?: number; visivel?: Derivable<boolean> }) {
	const largura = props.largura ?? 90;
	return (
		<frame
			Name="LinhaCampo"
			BackgroundTransparency={1}
			Size={new UDim2(1, 0, 0, 0)}
			AutomaticSize={Enum.AutomaticSize.Y}
			Visible={() => ler(props.visivel ?? true)}
			LayoutOrder={props.ordem}
		>
			<uilistlayout
				FillDirection={Enum.FillDirection.Horizontal}
				SortOrder={Enum.SortOrder.LayoutOrder}
				VerticalAlignment={Enum.VerticalAlignment.Center}
				Padding={new UDim(0, ESPACO)}
			/>
			<textlabel
				Name="Rotulo"
				BackgroundTransparency={1}
				Size={new UDim2(0, largura, 0, TEXTO + 10)}
				Text={props.rotulo}
				TextSize={TEXTO}
				FontFace={FONTE}
				TextColor3={cor(Enum.StudioStyleGuideColor.DimmedText)}
				TextXAlignment={Enum.TextXAlignment.Left}
				TextTruncate={Enum.TextTruncate.AtEnd}
				LayoutOrder={0}
			/>
			<frame Name="Conteudo" BackgroundTransparency={1} Size={new UDim2(1, -(largura + ESPACO), 0, 0)} AutomaticSize={Enum.AutomaticSize.Y} LayoutOrder={1}>
				<uilistlayout
					FillDirection={Enum.FillDirection.Horizontal}
					SortOrder={Enum.SortOrder.LayoutOrder}
					VerticalAlignment={Enum.VerticalAlignment.Center}
					Padding={new UDim(0, 2)}
					Wraps={true}
				/>
				{props.children}
			</frame>
		</frame>
	);
}
