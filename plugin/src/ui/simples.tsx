// Peças da janela única (2026-10-20) para a "simplicidade extrema": botão grande com ícone e explicação, estado
// vazio (uma frase e um botão do que fazer), a dobra "Avançado" (fechada por padrão, lembrada em Configurações),
// a bolinha de estado e os ícones do próprio Studio no tema claro ou escuro.
import Vide, { source } from "@rbxts/vide";
import { avancado, definirAvancado } from "../config";
import { caminhoIcone, IconeStudio } from "../secoes";
import { Botao, cor, FONTE, FONTE_NEGRITO, Rotulo, tema, TEXTO, Tom } from "./kit";

type Derivable<T> = T | (() => T);

function ler<T>(valor: Derivable<T>): T {
	return typeIs(valor, "function") ? (valor as () => T)() : (valor as T);
}

/** Um ícone do Studio (studio_svg_textures), que troca com o tema. */
export function Icone(props: { icone: IconeStudio; tamanho?: number; posicao?: UDim2; ancora?: Vector2; ordem?: number; transparencia?: Derivable<number> }) {
	const lado = props.tamanho ?? 20;
	return (
		<imagelabel
			Name="Icone"
			BackgroundTransparency={1}
			Size={UDim2.fromOffset(lado, lado)}
			Position={props.posicao}
			AnchorPoint={props.ancora}
			Image={() => caminhoIcone(props.icone, tema().Name)}
			ImageTransparency={() => ler(props.transparencia ?? 0)}
			ScaleType={Enum.ScaleType.Fit}
			LayoutOrder={props.ordem}
		/>
	);
}

/**
 * Botão grande, para as ações principais de uma tela (a tela inicial, "Testar este mapa", "Verificar tudo"): título
 * em negrito, uma linha de explicação embaixo e, se houver, o atalho à direita do título.
 */
export function BotaoGrande(props: {
	titulo: Derivable<string>;
	explicacao?: Derivable<string>;
	icone?: IconeStudio;
	aoClicar: () => void;
	principal?: boolean;
	desligado?: Derivable<boolean>;
	largura?: Derivable<UDim>;
	ordem?: number;
	nome?: string;
}) {
	const passando = source(false);
	const fundo = props.principal ? Enum.StudioStyleGuideColor.MainButton : Enum.StudioStyleGuideColor.Button;
	const modificador = () => {
		if (ler(props.desligado ?? false)) return Enum.StudioStyleGuideModifier.Disabled;
		if (passando()) return Enum.StudioStyleGuideModifier.Hover;
		return Enum.StudioStyleGuideModifier.Default;
	};
	const corTexto = () => tema().GetColor(Enum.StudioStyleGuideColor.ButtonText, modificador());
	const recuo = props.icone ? 40 : 12;
	return (
		<textbutton
			Name={props.nome ?? "BotaoGrande"}
			AutoButtonColor={false}
			Text=""
			Size={() => new UDim2(ler(props.largura ?? new UDim(1, 0)), new UDim(0, props.explicacao !== undefined ? 54 : 40))}
			BackgroundColor3={() => tema().GetColor(fundo, modificador())}
			BorderSizePixel={0}
			LayoutOrder={props.ordem}
			Activated={() => {
				if (!ler(props.desligado ?? false)) props.aoClicar();
			}}
			MouseEnter={() => passando(true)}
			MouseLeave={() => passando(false)}
		>
			<uicorner CornerRadius={new UDim(0, 4)} />
			<uistroke Color={() => tema().GetColor(Enum.StudioStyleGuideColor.ButtonBorder, modificador())} Thickness={1} />
			{props.icone ? <Icone icone={props.icone} tamanho={22} posicao={new UDim2(0, 10, 0.5, 0)} ancora={new Vector2(0, 0.5)} /> : undefined}
			<textlabel
				Name="Titulo"
				BackgroundTransparency={1}
				Position={new UDim2(0, recuo, 0, props.explicacao !== undefined ? 7 : 0)}
				Size={new UDim2(1, -recuo - 8, 0, props.explicacao !== undefined ? 20 : 40)}
				FontFace={FONTE_NEGRITO}
				Text={props.titulo}
				TextSize={TEXTO + 2}
				TextColor3={corTexto}
				TextXAlignment={Enum.TextXAlignment.Left}
				TextTruncate={Enum.TextTruncate.AtEnd}
			/>
			{props.explicacao !== undefined ? (
				<textlabel
					Name="Explicacao"
					BackgroundTransparency={1}
					Position={new UDim2(0, recuo, 0, 28)}
					Size={new UDim2(1, -recuo - 8, 0, 18)}
					FontFace={FONTE}
					Text={props.explicacao}
					TextSize={TEXTO - 1}
					TextColor3={corTexto}
					TextTransparency={0.25}
					TextXAlignment={Enum.TextXAlignment.Left}
					TextTruncate={Enum.TextTruncate.AtEnd}
				/>
			) : undefined}
		</textbutton>
	);
}

/**
 * Estado vazio ou erro: uma frase e, se houver, um botão do que fazer. Some quando `visivel` é falso.
 */
export function Vazio(props: {
	texto: Derivable<string>;
	botao?: Derivable<string>;
	aoClicar?: () => void;
	tom?: Derivable<Tom>;
	visivel?: Derivable<boolean>;
	ordem?: number;
}) {
	return (
		<frame
			Name="Vazio"
			BackgroundColor3={cor(Enum.StudioStyleGuideColor.Mid)}
			BackgroundTransparency={0.5}
			BorderSizePixel={0}
			Size={new UDim2(1, 0, 0, 0)}
			AutomaticSize={Enum.AutomaticSize.Y}
			Visible={() => ler(props.visivel ?? true)}
			LayoutOrder={props.ordem}
		>
			<uicorner CornerRadius={new UDim(0, 4)} />
			<uipadding PaddingTop={new UDim(0, 8)} PaddingBottom={new UDim(0, 8)} PaddingLeft={new UDim(0, 10)} PaddingRight={new UDim(0, 10)} />
			<uilistlayout FillDirection={Enum.FillDirection.Vertical} SortOrder={Enum.SortOrder.LayoutOrder} Padding={new UDim(0, 6)} />
			<Rotulo texto={props.texto} tom={props.tom ?? "normal"} ordem={0} />
			{props.botao !== undefined && props.aoClicar ? <Botao texto={props.botao} principal={true} aoClicar={props.aoClicar} ordem={1} /> : undefined}
		</frame>
	);
}

/**
 * A dobra "Avançado": um botão "Avançado ▸" que mostra ou esconde o conteúdo. O estado é um só para a janela
 * inteira (Configurações → "Mostrar opções avançadas") e fica guardado.
 */
export function DobraAvancado(props: { children?: Vide.Node; ordem?: number; rotulo?: string }) {
	return (
		<frame Name="Avancado" BackgroundTransparency={1} Size={new UDim2(1, 0, 0, 0)} AutomaticSize={Enum.AutomaticSize.Y} LayoutOrder={props.ordem}>
			<uilistlayout FillDirection={Enum.FillDirection.Vertical} SortOrder={Enum.SortOrder.LayoutOrder} Padding={new UDim(0, 6)} />
			<BotaoAvancado rotulo={props.rotulo} ordem={0} />
			<frame Name="Conteudo" BackgroundTransparency={1} Size={new UDim2(1, 0, 0, 0)} AutomaticSize={Enum.AutomaticSize.Y} Visible={avancado} LayoutOrder={1}>
				<uilistlayout FillDirection={Enum.FillDirection.Vertical} SortOrder={Enum.SortOrder.LayoutOrder} Padding={new UDim(0, 6)} />
				{props.children}
			</frame>
		</frame>
	);
}

/** Só o botão "Avançado ▸/▾" (para painéis que escondem coisas espalhadas, não um bloco só). */
export function BotaoAvancado(props: { ordem?: number; rotulo?: string }) {
	return (
		<Botao
			texto={() => `${avancado() ? "▾" : "▸"} ${props.rotulo ?? "Avançado"}`}
			ativo={avancado}
			aoClicar={() => definirAvancado(!avancado())}
			ordem={props.ordem}
		/>
	);
}

export type CorEstado = "verde" | "amarelo" | "vermelho" | "cinza";

const CORES: Record<CorEstado, Color3> = {
	verde: Color3.fromRGB(62, 186, 98),
	amarelo: Color3.fromRGB(235, 180, 40),
	vermelho: Color3.fromRGB(226, 72, 64),
	cinza: Color3.fromRGB(140, 140, 140),
};

/** A bolinha de estado (verde, amarela, vermelha ou cinza). */
export function Ponto(props: { cor: Derivable<CorEstado>; tamanho?: number; ordem?: number; posicao?: UDim2; ancora?: Vector2 }) {
	const lado = props.tamanho ?? 10;
	return (
		<frame
			Name="Ponto"
			Size={UDim2.fromOffset(lado, lado)}
			Position={props.posicao}
			AnchorPoint={props.ancora}
			BackgroundColor3={() => CORES[ler(props.cor)]}
			BorderSizePixel={0}
			LayoutOrder={props.ordem}
		>
			<uicorner CornerRadius={new UDim(1, 0)} />
		</frame>
	);
}

/** Uma linha "● texto" com a cor do estado, para listas de conexões. */
export function LinhaEstado(props: { cor: Derivable<CorEstado>; texto: Derivable<string>; ordem?: number }) {
	return (
		<frame Name="LinhaEstado" BackgroundTransparency={1} Size={new UDim2(1, 0, 0, 0)} AutomaticSize={Enum.AutomaticSize.Y} LayoutOrder={props.ordem}>
			<Ponto cor={props.cor} posicao={UDim2.fromOffset(2, 4)} />
			<frame BackgroundTransparency={1} Position={UDim2.fromOffset(18, 0)} Size={new UDim2(1, -18, 0, 0)} AutomaticSize={Enum.AutomaticSize.Y}>
				<Rotulo texto={props.texto} />
			</frame>
		</frame>
	);
}

/** Um cartão: fundo levemente destacado, com título opcional; os filhos empilham. */
export function Cartao(props: { children?: Vide.Node; titulo?: Derivable<string>; ordem?: number; visivel?: Derivable<boolean>; nome?: string }) {
	return (
		<frame
			Name={props.nome ?? "Cartao"}
			BackgroundColor3={cor(Enum.StudioStyleGuideColor.Item)}
			BorderSizePixel={0}
			Size={new UDim2(1, 0, 0, 0)}
			AutomaticSize={Enum.AutomaticSize.Y}
			Visible={() => ler(props.visivel ?? true)}
			LayoutOrder={props.ordem}
		>
			<uicorner CornerRadius={new UDim(0, 4)} />
			<uistroke Color={cor(Enum.StudioStyleGuideColor.Border)} Thickness={1} />
			<uipadding PaddingTop={new UDim(0, 8)} PaddingBottom={new UDim(0, 8)} PaddingLeft={new UDim(0, 10)} PaddingRight={new UDim(0, 10)} />
			<uilistlayout FillDirection={Enum.FillDirection.Vertical} SortOrder={Enum.SortOrder.LayoutOrder} Padding={new UDim(0, 6)} />
			{props.titulo !== undefined ? <Rotulo texto={props.titulo} negrito={true} ordem={-1} /> : undefined}
			{props.children}
		</frame>
	);
}
