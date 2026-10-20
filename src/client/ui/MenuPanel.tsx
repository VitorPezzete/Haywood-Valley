import Vide, { cleanup } from "@rbxts/vide";
import { DESIGN, Hint, Hints, place, px, SERIF } from "./kit";
import { themeColor, themed } from "./theme";

/**
 * Painel de menu no kit do tema (Celeiro ou Clássico): fundo escurecido na cor do tema, o painel com a
 * faixa de título, e as dicas de tecla no canto da tela (fora do palco, no mesmo lugar das do menu).
 * Clicar fora fecha; o painel é botão para segurar os cliques de dentro. O conteúdo usa as camadas
 * 34 a 38.
 */
export function MenuPanel({
	k,
	title,
	size,
	hints,
	onClose,
	children,
}: {
	k: () => number;
	title: () => string;
	/** Tamanho do painel, em pixels de arte; ele fica no meio do palco. */
	size: Vector2;
	hints: Hint[];
	onClose: () => void;
	children?: Vide.Node;
}) {
	const left = math.floor((DESIGN.X - size.X) / 2);
	const top = math.floor((DESIGN.Y - size.Y) / 2);
	const root = (
		<textbutton
			Name="MenuPanel"
			AutoButtonColor={false}
			Text=""
			Size={UDim2.fromScale(1, 1)}
			BackgroundColor3={() => themeColor("screenTint")}
			BackgroundTransparency={0.35}
			ZIndex={30}
			Activated={onClose}
		>
			<frame
				Name="Stage"
				BackgroundTransparency={1}
				AnchorPoint={new Vector2(0.5, 0.5)}
				Position={UDim2.fromScale(0.5, 0.5)}
				Size={px(k, DESIGN.X, DESIGN.Y)}
				ZIndex={31}
			>
				<imagebutton
					{...themed("panel", k)}
					Name="Panel"
					AutoButtonColor={false}
					Position={place(k, left, top)}
					Size={px(k, size.X, size.Y)}
					ZIndex={32}
				>
					<imagelabel
						{...themed("titleBar", k)}
						Name="Header"
						AnchorPoint={new Vector2(0.5, 0.5)}
						Position={() => new UDim2(0.5, 0, 0, 4 * k())}
						Size={px(k, math.min(size.X - 40, 160), 18)}
						ZIndex={33}
					>
						<textlabel
							Name="Title"
							BackgroundTransparency={1}
							Size={UDim2.fromScale(1, 1)}
							FontFace={SERIF}
							Text={title}
							TextColor3={() => themeColor("textOnTitle")}
							TextSize={() => 10 * k()}
							ZIndex={34}
						/>
					</imagelabel>
					{children}
				</imagebutton>
			</frame>
			<Hints k={k} hints={hints} zIndex={40} />
		</textbutton>
	) as TextButton;
	// O Show do Vide só tira o painel da tela (Parent = nil), sem destruir; os eventos ligados pelas
	// propriedades seguram as instâncias. Destrói no fim do quadro, porque o Vide mexe no Parent
	// depois de encerrar o painel, e Parent de instância destruída não muda mais.
	cleanup(() => task.defer(() => root.Destroy()));
	return root;
}
