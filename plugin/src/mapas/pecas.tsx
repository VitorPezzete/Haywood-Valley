// A lista de peças do catálogo (`GET /catalogo/pecas`), com miniatura, filtro por nome e a forma escolhida. Clicar
// numa peça liga a ferramenta "peça": o canvas mostra a fantasma pela regra de fundos (12.14) e de encaixe (12.12)
// e o motivo da recusa aparece aqui embaixo. Sem catálogo na ponte, mostra "sem catálogo".
import Vide, { source } from "@rbxts/vide";
import { For } from "@rbxts/vide";
import { Botao, Campo, Coluna, cor, Linha, Rotulo, TEXTO, tema } from "../ui/kit";
import type { Imagens } from "./canvas";
import type { Catalogo, Peca } from "./regras";
import { METADE, TILE_PX } from "./zonas";
import { conteudo } from "../folhasLocais";

export interface PropsPecas {
	catalogo: () => Catalogo | undefined;
	erro: () => string | undefined;
	imagens: () => Imagens;
	selecionada: Vide.Source<Peca | undefined>;
	forma: Vide.Source<number>;
	motivo: () => string;
}

const MINIATURA = 32;

/** A miniatura: o retângulo do ícone na folha (só a parte que fica na mesma metade). */
function Miniatura(props: { peca: Peca; imagens: () => Imagens }) {
	const [c, l, w, h] = props.peca.icone;
	const metade = c >= METADE ? 1 : 0;
	const largura = math.min(w, METADE - (c % METADE));
	return (
		<imagelabel
			Name="Miniatura"
			Size={UDim2.fromOffset(MINIATURA, MINIATURA)}
			BackgroundColor3={Color3.fromRGB(20, 20, 24)}
			BorderSizePixel={0}
			ImageContent={() => conteudo(props.imagens()[props.peca.folha]?.[metade])}
			ImageRectOffset={new Vector2((c % METADE) * TILE_PX, l * TILE_PX)}
			ImageRectSize={new Vector2(math.max(1, largura) * TILE_PX, math.max(1, h) * TILE_PX)}
			ResampleMode={Enum.ResamplerMode.Pixelated}
			ScaleType={Enum.ScaleType.Fit}
		/>
	);
}

function ItemPeca(props: { peca: Peca; imagens: () => Imagens; ativo: () => boolean; aoClicar: () => void; ordem: () => number }) {
	const passando = source(false);
	const modificador = () => (props.ativo() ? Enum.StudioStyleGuideModifier.Selected : passando() ? Enum.StudioStyleGuideModifier.Hover : Enum.StudioStyleGuideModifier.Default);
	return (
		<textbutton
			Name={props.peca.id}
			AutoButtonColor={false}
			Size={new UDim2(1, -10, 0, MINIATURA + 6)}
			BackgroundColor3={() => tema().GetColor(Enum.StudioStyleGuideColor.Button, modificador())}
			BorderSizePixel={0}
			Text=""
			LayoutOrder={props.ordem}
			Activated={props.aoClicar}
			MouseEnter={() => passando(true)}
			MouseLeave={() => passando(false)}
		>
			<uicorner CornerRadius={new UDim(0, 3)} />
			<uistroke Color={() => tema().GetColor(Enum.StudioStyleGuideColor.ButtonBorder, modificador())} Thickness={1} />
			<frame Size={UDim2.fromOffset(MINIATURA, MINIATURA)} Position={UDim2.fromOffset(3, 3)} BackgroundTransparency={1}>
				<Miniatura peca={props.peca} imagens={props.imagens} />
			</frame>
			<textlabel
				BackgroundTransparency={1}
				Size={new UDim2(1, -(MINIATURA + 12), 1, 0)}
				Position={UDim2.fromOffset(MINIATURA + 9, 0)}
				FontFace={Font.fromEnum(Enum.Font.SourceSans)}
				TextSize={TEXTO}
				TextColor3={() => tema().GetColor(Enum.StudioStyleGuideColor.ButtonText, modificador())}
				TextXAlignment={Enum.TextXAlignment.Left}
				TextTruncate={Enum.TextTruncate.AtEnd}
				Text={`${props.peca.nome}  (${props.peca.id}${props.peca.tipo !== "" ? ", " + props.peca.tipo : ""}${props.peca.regras ? "" : ", livre"})`}
			/>
		</textbutton>
	);
}

export function PainelPecas(props: PropsPecas) {
	const filtro = source("");
	const filtradas = () => {
		const cat = props.catalogo();
		if (!cat) return [];
		const f = filtro().lower();
		if (f === "") return cat.pecas;
		return cat.pecas.filter((p) => p.nome.lower().find(f, 1, true)[0] !== undefined || p.id.lower().find(f, 1, true)[0] !== undefined);
	};
	const textoForma = () => {
		const p = props.selecionada();
		if (!p) return "Nenhuma peça escolhida.";
		const n = p.forms.size();
		const forma = p.forms[props.forma()];
		const olhar = forma?.facing;
		return `${p.nome}: forma ${props.forma() + 1} de ${n}${olhar !== undefined ? ` (olha ${["cima", "esquerda", "baixo", "direita"][olhar] ?? olhar})` : ""}, ${forma?.variants.size() ?? 0} variante(s)${p.regras ? "" : "; carimba sem regras"}.`;
	};
	return (
		<frame Name="Pecas" Size={UDim2.fromScale(1, 1)} BackgroundTransparency={1}>
			<Coluna tamanho={new UDim2(1, 0, 0, 96)}>
				<Rotulo
					texto={() => {
						const cat = props.catalogo();
						if (cat) return `${cat.pecas.size()} peça(s), ${cat.fundos.size()} tipo(s) de fundo.`;
						return props.erro() ?? "Carregando o catálogo...";
					}}
					tom={() => (props.catalogo() ? "normal" : "aviso")}
					ordem={0}
				/>
				<Campo valor={filtro} dica="filtrar por nome ou id" aoConfirmar={(t) => filtro(t)} ordem={1} />
				<Linha espaco={4}>
					<Botao
						texto="Forma anterior"
						desligado={() => (props.selecionada()?.forms.size() ?? 0) < 2}
						aoClicar={() => {
							const p = props.selecionada();
							if (p) props.forma((props.forma() - 1 + p.forms.size()) % p.forms.size());
						}}
						ordem={0}
					/>
					<Botao
						texto="Próxima forma"
						desligado={() => (props.selecionada()?.forms.size() ?? 0) < 2}
						aoClicar={() => {
							const p = props.selecionada();
							if (p) props.forma((props.forma() + 1) % p.forms.size());
						}}
						ordem={1}
					/>
				</Linha>
				<Rotulo texto={textoForma} tom="fraco" ordem={3} />
			</Coluna>
			<scrollingframe
				Name="Lista"
				Size={new UDim2(1, 0, 1, -150)}
				Position={UDim2.fromOffset(0, 100)}
				BackgroundColor3={cor(Enum.StudioStyleGuideColor.InputFieldBackground)}
				BorderSizePixel={0}
				CanvasSize={new UDim2(0, 0, 0, 0)}
				AutomaticCanvasSize={Enum.AutomaticSize.Y}
				ScrollingDirection={Enum.ScrollingDirection.Y}
				ScrollBarThickness={8}
				ScrollBarImageColor3={cor(Enum.StudioStyleGuideColor.ScrollBar)}
			>
				<uilistlayout FillDirection={Enum.FillDirection.Vertical} SortOrder={Enum.SortOrder.LayoutOrder} Padding={new UDim(0, 2)} />
				<uipadding PaddingLeft={new UDim(0, 2)} PaddingTop={new UDim(0, 2)} />
				<For each={filtradas}>
					{(peca: Peca, indice: () => number) => (
						<ItemPeca
							peca={peca}
							imagens={props.imagens}
							ativo={() => props.selecionada() === peca}
							aoClicar={() => {
								props.selecionada(peca);
								props.forma(0);
							}}
							ordem={indice}
						/>
					)}
				</For>
			</scrollingframe>
			<frame Size={new UDim2(1, 0, 0, 46)} Position={new UDim2(0, 0, 1, -46)} BackgroundTransparency={1}>
				<Rotulo texto={props.motivo} tom={() => (props.motivo() === "" ? "fraco" : "aviso")} />
			</frame>
		</frame>
	);
}
