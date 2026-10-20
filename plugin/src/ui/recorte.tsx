// Um recorte de uma folha do Aeko desenhado com as duas metades de 1024×512: o retângulo em tiles vira
// ImageLabel com ImageRectOffset e ResampleMode Pixelated. Um recorte que atravessa a coluna 63→64 sai em dois
// ImageLabel lado a lado. Serve para a miniatura da lista e para a prévia da peça.
import Vide from "@rbxts/vide";
import type { Metades } from "../catalogo/folhas";
import { COLUNAS_METADE, Retangulo, TILE } from "../catalogo/formato";
import { cor } from "./kit";
import { conteudo } from "../folhasLocais";

/**
 * `caixa` é o tamanho em pixels da tela em que o recorte tem de caber; a escala é a maior que cabe (inteira quando
 * dá, para o pixel ficar nítido; fracionária quando a peça é grande demais).
 */
export function Recorte(props: {
	metades: () => Metades | undefined;
	retangulo: () => Retangulo | undefined;
	caixa: number;
	ordem?: number;
}) {
	const escala = () => {
		const r = props.retangulo();
		if (!r) return 1;
		const bruta = math.min(props.caixa / (r.w * TILE), props.caixa / (r.h * TILE));
		return bruta >= 1 ? math.floor(bruta) : bruta;
	};
	// As duas partes: a da metade em que o retângulo começa e, se ele atravessa, a da outra metade.
	const parte = (indice: 0 | 1) => {
		const r = props.retangulo();
		const metades = props.metades();
		if (!r || !metades) return undefined;
		const inicioMetade = r.c < COLUNAS_METADE ? 0 : 1;
		const metade = inicioMetade + indice;
		if (metade > 1) return undefined;
		const c0 = math.max(r.c, metade * COLUNAS_METADE);
		const c1 = math.min(r.c + r.w, (metade + 1) * COLUNAS_METADE);
		if (c1 <= c0) return undefined;
		return {
			imagem: metades[metade as 0 | 1],
			deslocamento: new Vector2((c0 - metade * COLUNAS_METADE) * TILE, r.l * TILE),
			tamanho: new Vector2((c1 - c0) * TILE, r.h * TILE),
			x: (c0 - r.c) * TILE,
		};
	};
	const imagem = (indice: 0 | 1) => (
		<imagelabel
			Name={`Parte${indice}`}
			BackgroundTransparency={1}
			Visible={() => parte(indice) !== undefined}
			ImageContent={() => conteudo(parte(indice)?.imagem)}
			ImageRectOffset={() => parte(indice)?.deslocamento ?? Vector2.zero}
			ImageRectSize={() => parte(indice)?.tamanho ?? Vector2.zero}
			ResampleMode={Enum.ResamplerMode.Pixelated}
			Position={() => UDim2.fromOffset((parte(indice)?.x ?? 0) * escala(), 0)}
			Size={() => {
				const p = parte(indice);
				return p ? UDim2.fromOffset(p.tamanho.X * escala(), p.tamanho.Y * escala()) : UDim2.fromOffset(0, 0);
			}}
		/>
	);
	return (
		<frame
			Name="Recorte"
			BackgroundColor3={cor(Enum.StudioStyleGuideColor.InputFieldBackground)}
			BorderSizePixel={0}
			Size={UDim2.fromOffset(props.caixa, props.caixa)}
			ClipsDescendants={true}
			LayoutOrder={props.ordem}
		>
			<frame
				Name="Centro"
				BackgroundTransparency={1}
				AnchorPoint={new Vector2(0.5, 0.5)}
				Position={UDim2.fromScale(0.5, 0.5)}
				Size={() => {
					const r = props.retangulo();
					return r ? UDim2.fromOffset(r.w * TILE * escala(), r.h * TILE * escala()) : UDim2.fromOffset(0, 0);
				}}
			>
				{imagem(0)}
				{imagem(1)}
			</frame>
		</frame>
	);
}
