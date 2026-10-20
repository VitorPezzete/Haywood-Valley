// Arte (janela única, 2026-10-20): as folhas de tiles e o Aseprite em cima (abrir a folha inteira no Aseprite,
// "Folhas locais" para ver no Studio o que acabou de salvar lá, o aviso de folha salva) e, embaixo, "Imagens e
// sons": o registro de assets (ferramentas/assets.tsx), com o que falta enviar ao Roblox e o envio.
import Vide, { mount, source } from "@rbxts/vide";
import { abrirNoAseprite } from "../aseprite";
import { FOLHAS_DO_JOGO, ponteLigada, statusPonte } from "../estado";
import { AlternarFolhasLocais, AvisoFolhaSalva } from "../ui/alternarFolhas";
import { Botao, Coluna, Fileira, Painel, Preenche, Rotulo, TextoCurto, Titulo, Tom } from "../ui/kit";
import { Cartao, LinhaEstado } from "../ui/simples";
import type { ContextoSecao } from "../widget";
import { PainelAssets } from "./assets";

/** Uma folha do Aeko tem 128 × 32 tiles de 16 px. */
const COLUNAS = 128;
const LINHAS = 32;

export function PainelArte() {
	const mensagem = source("");
	const tom = source<Tom>("normal");
	const abrindo = source(false);

	const abrirFolha = (folha: string) => {
		if (abrindo()) return;
		abrindo(true);
		mensagem(`Abrindo ${folha} no Aseprite…`);
		tom("fraco");
		task.spawn(() => {
			const r = abrirNoAseprite(folha, 0, 0, COLUNAS, LINHAS);
			abrindo(false);
			mensagem(r.ok ? `${folha} aberta no Aseprite. Lá, "Salvar região na folha" grava de volta e o Studio atualiza.` : r.mensagem);
			tom(r.ok ? "ok" : "erro");
		});
	};

	const aseprite = () => statusPonte()?.aseprite;

	return (
		<Painel>
			<Coluna tamanho={UDim2.fromScale(1, 1)}>
				<Titulo texto="Arte" ordem={0} />
				<Cartao titulo="Folhas de tiles" ordem={1}>
					<LinhaEstado
						cor={() => (!ponteLigada() || aseprite() === undefined ? "cinza" : aseprite()!.conectado ? "verde" : "amarelo")}
						texto={() => {
							const a = aseprite();
							if (!ponteLigada() || a === undefined) return "Aseprite: sem notícia (a ponte está desligada).";
							return a.conectado ? "Aseprite conectado." : "Aseprite desligado: abra o Aseprite; a extensão Diorama conecta sozinha.";
						}}
						ordem={0}
					/>
					<Fileira ordem={1}>
						<TextoCurto texto="Abrir no Aseprite:" tom="fraco" ordem={0} />
						{FOLHAS_DO_JOGO.map((f, i) => (
							<Botao texto={f} desligado={() => abrindo() || aseprite()?.conectado !== true} aoClicar={() => abrirFolha(f)} ordem={1 + i} />
						))}
						<AlternarFolhasLocais ordem={10} />
					</Fileira>
					<Rotulo
						texto="Para editar só um pedaço, escolha os tiles em Mapa → Tiles (ou a peça em Peças) e use “Abrir no Aseprite” lá. Folhas locais mostra no Studio o que você salvou, antes de enviar ao Roblox."
						tom="fraco"
						ordem={2}
					/>
					<Rotulo texto={mensagem} tom={tom} ordem={3} />
					<AvisoFolhaSalva ordem={4} />
				</Cartao>
				<Rotulo texto="Imagens e sons" negrito={true} ordem={2} />
				<Preenche ordem={3}>
					<PainelAssets />
				</Preenche>
			</Coluna>
		</Painel>
	);
}

export function montar(quadro: Frame, _contexto: ContextoSecao) {
	return mount(() => <PainelArte />, quadro);
}
