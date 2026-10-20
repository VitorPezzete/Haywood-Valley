// Peças de interface do plugin, no tema do Studio (claro ou escuro, `settings().Studio.Theme`). Sem arte:
// só cores do guia de estilo do Studio. Cada peça devolve um elemento do Vide; as cores são funções, então
// trocam sozinhas quando o tema muda.
import Vide, { action, source } from "@rbxts/vide";

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
}) {
	return (
		<frame
			Name="Coluna"
			BackgroundTransparency={1}
			Size={props.tamanho ?? new UDim2(1, 0, 0, 0)}
			Position={props.posicao}
			AutomaticSize={props.tamanho === undefined ? Enum.AutomaticSize.Y : Enum.AutomaticSize.None}
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
export function Linha(props: { children?: Vide.Node; tamanho?: Derivable<UDim2>; espaco?: number }) {
	return (
		<frame
			Name="Linha"
			BackgroundTransparency={1}
			Size={props.tamanho ?? new UDim2(1, 0, 0, 0)}
			AutomaticSize={props.tamanho === undefined ? Enum.AutomaticSize.Y : Enum.AutomaticSize.None}
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
		<Linha espaco={2}>
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
