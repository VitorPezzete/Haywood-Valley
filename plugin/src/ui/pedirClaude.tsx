// A caixa "Pedir ao Claude" (ia.ts; contrato em CONEXOES.md, seção 7): a conversa da sessão, o campo e "Enviar",
// "pensando…" enquanto espera e, quando a resposta traz uma proposta, a lista das mudanças com Aplicar / Cancelar.
// Nada muda sem o Aplicar.
import Vide, { For, source } from "@rbxts/vide";
import { avancado } from "../config";
import { ContextoPedido, conversa, decidir, enviarPedido, limparConversa, Mensagem, pensando, propostaPendente } from "../ia";
import { ICONE_CLAUDE } from "../secoes";
import { Botao, Campo, cor, Fileira, Preenche, Rotulo, Titulo } from "./kit";
import { Icone } from "./simples";

function quemDiz(m: Mensagem) {
	if (m.quem === "voce") return "Você";
	if (m.quem === "claude") return "Claude";
	return "Diorama";
}

function textoDaMensagem(m: Mensagem) {
	const linhas = new Array<string>();
	if (m.texto !== "") linhas.push(m.texto);
	if (m.proposta) {
		linhas.push(m.proposta.resumo !== "" ? `Proposta: ${m.proposta.resumo}` : "Proposta:");
		for (const mudanca of m.proposta.mudancas) linhas.push(`  • ${mudanca}`);
		if (m.decisao === "aplicada") linhas.push("→ Aplicada.");
		else if (m.decisao === "cancelada") linhas.push("→ Cancelada.");
	}
	return linhas.join("\n");
}

export function PainelClaude(props: { contexto: () => ContextoPedido; aoFechar: () => void }) {
	const texto = source("");
	const enviar = () => {
		const t = texto();
		if (t === "" || pensando()) return;
		texto("");
		const contexto = props.contexto();
		task.spawn(enviarPedido, t, contexto);
	};
	const linhaContexto = () => {
		const c = props.contexto();
		const partes = [`seção ${c.secao}`];
		if (c.mapa !== undefined) partes.push(`mapa ${c.mapa}`);
		const celula = c.selecao.celula;
		if (typeIs(celula, "table")) partes.push(`célula (${(celula as number[])[0]}, ${(celula as number[])[1]})`);
		if (c.problemas.size() > 0) partes.push(`${c.problemas.size()} problema(s) do Verificar`);
		return `Vai junto: ${partes.join(", ")}.`;
	};
	return (
		<frame Name="PedirClaude" Size={UDim2.fromScale(1, 1)} BackgroundColor3={cor(Enum.StudioStyleGuideColor.MainBackground)} BorderSizePixel={0}>
			<uistroke Color={cor(Enum.StudioStyleGuideColor.Border)} Thickness={1} />
			<uipadding PaddingTop={new UDim(0, 8)} PaddingBottom={new UDim(0, 8)} PaddingLeft={new UDim(0, 10)} PaddingRight={new UDim(0, 10)} />
			<uilistlayout FillDirection={Enum.FillDirection.Vertical} SortOrder={Enum.SortOrder.LayoutOrder} Padding={new UDim(0, 6)} />
			<Fileira ordem={0}>
				<Icone icone={ICONE_CLAUDE} tamanho={20} ordem={0} />
				<Titulo texto="Pedir ao Claude" ordem={1} />
			</Fileira>
			<Rotulo
				texto="Peça em português. O Claude explica; quando o pedido muda algo, ele mostra o que vai fazer e só aplica depois do seu OK."
				tom="fraco"
				ordem={1}
			/>
			<Preenche ordem={2}>
				<scrollingframe
					Name="Conversa"
					Size={UDim2.fromScale(1, 1)}
					BackgroundColor3={cor(Enum.StudioStyleGuideColor.InputFieldBackground)}
					BorderSizePixel={0}
					CanvasSize={new UDim2(0, 0, 0, 0)}
					AutomaticCanvasSize={Enum.AutomaticSize.Y}
					ScrollingDirection={Enum.ScrollingDirection.Y}
					ScrollBarThickness={8}
					ScrollBarImageColor3={cor(Enum.StudioStyleGuideColor.ScrollBar)}
					CanvasPosition={() => {
						// Rola para o fim quando chega mensagem.
						conversa();
						return new Vector2(0, 1e6);
					}}
				>
					<uipadding PaddingTop={new UDim(0, 6)} PaddingBottom={new UDim(0, 6)} PaddingLeft={new UDim(0, 6)} PaddingRight={new UDim(0, 14)} />
					<uilistlayout FillDirection={Enum.FillDirection.Vertical} SortOrder={Enum.SortOrder.LayoutOrder} Padding={new UDim(0, 8)} />
					<Rotulo
						texto={() =>
							conversa().size() === 0
								? 'Exemplos: "o que está errado neste mapa?", "põe uma zona Cozinha na área do fogão com música sala", "por que o pote não aparece no jogo?"'
								: ""
						}
						tom="fraco"
						ordem={0}
					/>
					<For each={conversa}>
						{(m, i) => (
							<frame Name="Mensagem" BackgroundTransparency={1} Size={new UDim2(1, 0, 0, 0)} AutomaticSize={Enum.AutomaticSize.Y} LayoutOrder={1 + i()}>
								<uilistlayout FillDirection={Enum.FillDirection.Vertical} SortOrder={Enum.SortOrder.LayoutOrder} Padding={new UDim(0, 1)} />
								<Rotulo texto={quemDiz(m)} negrito={true} tom={m.quem === "sistema" ? "aviso" : m.quem === "claude" ? "ok" : "normal"} ordem={0} />
								<Rotulo texto={textoDaMensagem(m)} ordem={1} />
							</frame>
						)}
					</For>
					<Rotulo texto={() => (pensando() ? "Claude está pensando…" : "")} tom="fraco" ordem={100000} />
				</scrollingframe>
			</Preenche>
			{/* A proposta à espera do OK */}
			<frame
				Name="Proposta"
				BackgroundColor3={cor(Enum.StudioStyleGuideColor.WarningText)}
				BackgroundTransparency={0.85}
				BorderSizePixel={0}
				Size={new UDim2(1, 0, 0, 0)}
				AutomaticSize={Enum.AutomaticSize.Y}
				Visible={() => propostaPendente() !== undefined}
				LayoutOrder={3}
			>
				<uipadding PaddingTop={new UDim(0, 6)} PaddingBottom={new UDim(0, 6)} PaddingLeft={new UDim(0, 6)} PaddingRight={new UDim(0, 6)} />
				<uilistlayout FillDirection={Enum.FillDirection.Vertical} SortOrder={Enum.SortOrder.LayoutOrder} Padding={new UDim(0, 6)} />
				<Rotulo
					texto={() => {
						const p = propostaPendente()?.proposta;
						return p ? `O Claude quer fazer ${p.mudancas.size()} mudança(s). Aplicar?` : "";
					}}
					negrito={true}
					ordem={0}
				/>
				<Fileira ordem={1}>
					<Botao texto="Aplicar" principal={true} desligado={pensando} aoClicar={() => task.spawn(decidir, true)} ordem={0} />
					<Botao texto="Cancelar" aoClicar={() => task.spawn(decidir, false)} ordem={1} />
				</Fileira>
			</frame>
			<Fileira ordem={4}>
				<Campo valor={texto} dica="O que você quer? (Enter envia)" aoConfirmar={enviar} aoVivo={true} largura={new UDim(1, -76)} ordem={0} />
				<Botao texto={() => (pensando() ? "…" : "Enviar")} principal={true} desligado={pensando} aoClicar={enviar} largura={new UDim(0, 68)} ordem={1} />
			</Fileira>
			<Fileira ordem={5}>
				<Botao texto="Limpar conversa" aoClicar={limparConversa} ordem={0} />
				<Botao texto="Fechar (Esc)" aoClicar={props.aoFechar} ordem={1} />
			</Fileira>
			<Rotulo texto={() => (avancado() ? linhaContexto() : "")} tom="fraco" ordem={6} />
		</frame>
	);
}
