import Vide, { cleanup, Show } from "@rbxts/vide";
import { CeleiroLayout } from "./customize/celeiro";
import { GraalLayout } from "./customize/graal";
import { makeParts } from "./customize/parts";
import { createCustomize } from "./customize/state";
import { DESIGN, px } from "./kit";
import { theme, themeColor } from "./theme";

const INK = Color3.fromHex("#0A0F0C");

/**
 * Personalização do personagem, no kit de interface do tema escolhido nas Configurações. Cada tema tem
 * a disposição da prancha dele (customize/celeiro.tsx e customize/graal.tsx); o estado (o visual, as
 * abas, o histórico, o teclado) fica em customize/state.ts e continua o mesmo quando o tema muda no
 * meio da tela. À esquerda, o boneco grande andando no lugar, girar, Aleatório, Desfazer e Refazer e
 * os visuais salvos; à direita, as abas: gênero, cabeça e corpo (grades com rolagem, filtro por
 * artista e favoritos), cabelo, rosto e roupa (cores em RGB, com as cores prontas e a original);
 * embaixo, o nome, Voltar e Continuar. Favoritos e visuais salvos ficam guardados entre as partidas
 * (PlayerDataService). Tudo serve para mouse, toque e teclado.
 */
export function CustomizeScreen({ k, onDone }: { k: () => number; onDone: (confirmed: boolean) => void }) {
	const ctx = createCustomize(k, onDone);
	const parts = makeParts(ctx);

	let root: Frame | undefined;
	root = (
		<frame
			Name="Customize"
			BackgroundTransparency={1}
			AnchorPoint={new Vector2(0.5, 0.5)}
			Position={UDim2.fromScale(0.5, 0.5)}
			Size={px(k, DESIGN.X, DESIGN.Y)}
			ZIndex={10}
		>
			<frame
				Name="Backdrop"
				AnchorPoint={new Vector2(0.5, 0.5)}
				Position={UDim2.fromScale(0.5, 0.5)}
				Size={UDim2.fromScale(6, 6)}
				BackgroundColor3={() => themeColor("screenTint")}
				BorderSizePixel={0}
				ZIndex={1}
			/>
			<Show when={() => theme() === "celeiro"}>{() => <CeleiroLayout ctx={ctx} />}</Show>
			<Show when={() => theme() === "graal"}>{() => <GraalLayout ctx={ctx} />}</Show>
			{parts.tooltip(
				() => root,
				() => (theme() === "graal" ? { color: themeColor("text"), shadow: INK } : { color: themeColor("text") }),
				40,
			)}
		</frame>
	) as Frame;
	// O Show do Vide só tira a tela do lugar (Parent = nil), sem destruir; destrói no fim do quadro,
	// depois de o Vide mexer no Parent (como no MenuPanel).
	cleanup(() => task.defer(() => root?.Destroy()));
	return root;
}
