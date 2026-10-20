// Painel provisório das ferramentas que ainda não existem. Cada ferramenta tem o próprio arquivo em
// plugin/src/ferramentas/<id>.tsx; para preencher uma, troque o painel lá e deixe `abrir` como está.
import Vide from "@rbxts/vide";
import { Coluna, Painel, Rotulo, Titulo } from "../ui/kit";

export function PainelEmConstrucao(props: { nome: string; descricao: string; arquivo: string }) {
	return (
		<Painel>
			<Coluna>
				<Titulo texto={props.nome} ordem={0} />
				<Rotulo texto="Em construção." tom="aviso" ordem={1} />
				<Rotulo texto={props.descricao} ordem={2} />
				<Rotulo texto={`Painel em plugin/src/ferramentas/${props.arquivo}.`} tom="fraco" ordem={3} />
			</Coluna>
		</Painel>
	);
}
