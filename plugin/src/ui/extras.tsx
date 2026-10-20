// Peças de interface que só o editor de mapas usa: uma legenda de largura fixa, um quadro de tamanho fixo para
// peças posicionadas à mão, uma lista rolável com um item selecionado e a amostra de cor (terreno, camada).
// O resto (Fileira, Bloco, TextoCurto, Alternar, Ciclo, CampoMulti...) está em kit.tsx.
import Vide, { For, source } from "@rbxts/vide";
import { Botao, cor, FONTE, tema, TEXTO } from "./kit";

type Derivable<T> = T | (() => T);

function ler<T>(valor: Derivable<T>): T {
	return typeIs(valor, "function") ? (valor as () => T)() : (valor as T);
}

/** Um rótulo curto de uma linha com largura fixa, para legendas ao lado de campos (não quebra, não cresce). */
export function Legenda(props: { texto: Derivable<string>; largura?: number; ordem?: number; fraco?: boolean }) {
	return (
		<textlabel
			Name="Legenda"
			BackgroundTransparency={1}
			Size={new UDim2(0, props.largura ?? 70, 0, TEXTO + 10)}
			FontFace={FONTE}
			Text={props.texto}
			TextSize={TEXTO}
			TextColor3={() => tema().GetColor(props.fraco ? Enum.StudioStyleGuideColor.DimmedText : Enum.StudioStyleGuideColor.MainText)}
			TextXAlignment={Enum.TextXAlignment.Left}
			TextTruncate={Enum.TextTruncate.AtEnd}
			LayoutOrder={props.ordem}
		/>
	);
}

/** Quadro com borda e tamanho dado; os filhos se posicionam à mão ou com um layout próprio. */
export function Quadro(props: {
	children?: Vide.Node;
	tamanho: Derivable<UDim2>;
	posicao?: Derivable<UDim2>;
	ordem?: number;
	visivel?: Derivable<boolean>;
	fundoEscuro?: boolean;
}) {
	return (
		<frame
			Name="Quadro"
			Size={props.tamanho}
			Position={props.posicao}
			BackgroundColor3={cor(props.fundoEscuro ? Enum.StudioStyleGuideColor.Dark : Enum.StudioStyleGuideColor.Mid)}
			BorderSizePixel={0}
			LayoutOrder={props.ordem}
			Visible={props.visivel ?? true}
			ClipsDescendants={true}
		>
			<uistroke Color={cor(Enum.StudioStyleGuideColor.Border)} Thickness={1} />
			{props.children}
		</frame>
	);
}

/**
 * Lista rolável de itens com um selecionado (por identidade). `itens` é reativa: um item novo ganha botão, um
 * removido perde o dele; o texto de cada botão é reavaliado quando `texto` lê fontes.
 */
export function ListaSelecao<T>(props: {
	itens: () => T[];
	texto: (item: T) => string;
	selecionado: Vide.Source<T | undefined>;
	altura?: number;
	ordem?: number;
}) {
	return (
		<scrollingframe
			Name="ListaSelecao"
			Size={new UDim2(1, 0, 0, props.altura ?? 120)}
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
			<uilistlayout FillDirection={Enum.FillDirection.Vertical} SortOrder={Enum.SortOrder.LayoutOrder} Padding={new UDim(0, 2)} />
			<For each={props.itens}>
				{(item: T, indice: () => number) => (
					<Botao
						texto={() => props.texto(item)}
						ativo={() => props.selecionado() === item}
						aoClicar={() => props.selecionado(item)}
						largura={new UDim(1, -10)}
						ordem={indice()}
					/>
				)}
			</For>
		</scrollingframe>
	);
}

/** Um botão pequeno de cor chapada (amostra de terreno, de camada), marcado quando ativo. */
export function Amostra(props: { cor: Color3; texto: Derivable<string>; ativo: Derivable<boolean>; aoClicar: () => void; ordem?: number }) {
	const passando = source(false);
	return (
		<textbutton
			Name="Amostra"
			AutoButtonColor={false}
			Size={new UDim2(0, 0, 0, TEXTO + 10)}
			AutomaticSize={Enum.AutomaticSize.X}
			BackgroundColor3={cor(Enum.StudioStyleGuideColor.Button)}
			BorderSizePixel={0}
			FontFace={FONTE}
			Text={() => `   ${ler(props.texto)}`}
			TextSize={TEXTO}
			TextColor3={cor(Enum.StudioStyleGuideColor.ButtonText)}
			LayoutOrder={props.ordem}
			Activated={props.aoClicar}
			MouseEnter={() => passando(true)}
			MouseLeave={() => passando(false)}
		>
			<uipadding PaddingLeft={new UDim(0, 8)} PaddingRight={new UDim(0, 8)} />
			<uicorner CornerRadius={new UDim(0, 3)} />
			<uistroke
				Color={() =>
					tema().GetColor(
						Enum.StudioStyleGuideColor.ButtonBorder,
						ler(props.ativo) ? Enum.StudioStyleGuideModifier.Selected : passando() ? Enum.StudioStyleGuideModifier.Hover : Enum.StudioStyleGuideModifier.Default,
					)
				}
				Thickness={() => (ler(props.ativo) ? 2 : 1)}
			/>
			<frame Size={UDim2.fromOffset(10, 10)} Position={new UDim2(0, 2, 0.5, -5)} BackgroundColor3={props.cor} BorderSizePixel={0} />
		</textbutton>
	);
}
