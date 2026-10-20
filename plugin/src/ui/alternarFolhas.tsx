// O interruptor "Folhas locais" (docs/diorama/CONEXOES.md, seção 4), o mesmo em Mapas e no Catálogo: ligado, as
// folhas aparecem com os pixels do disco (EditableImage) em vez dos ids do Roblox. Ligar ou desligar recarrega as
// imagens das duas ferramentas (estado.ts).
//
// `AvisoFolhaSalva`: quando o Aseprite salva uma folha (a ponte manda `recarregar_folhas`), diz qual e quando; com
// "Folhas locais" desligado, o Studio continua mostrando a imagem do Roblox (a antiga), e o aviso traz o botão para
// ver a nova.
import Vide from "@rbxts/vide";
import { definirFolhasLocais } from "../estado";
import { folhaSalva, folhasLocais } from "../folhasLocais";
import { Alternar, Botao, Coluna, Linha, Rotulo } from "./kit";

export function AlternarFolhasLocais(props: { ordem?: number }) {
	// Uma fonte de fachada: lê o interruptor e, ao escrever, grava e recarrega as imagens (yielda: fora do clique).
	const valor = ((novo?: boolean) => {
		if (novo === undefined) return folhasLocais();
		task.spawn(definirFolhasLocais, novo);
		return novo;
	}) as Vide.Source<boolean>;
	return <Alternar texto="Folhas locais" valor={valor} ordem={props.ordem} />;
}

export function AvisoFolhaSalva(props: { ordem?: number; horizontal?: boolean }) {
	const texto = () => {
		const f = folhaSalva();
		if (!f) return "";
		const quando = os.date("%H:%M:%S", f.em);
		return f.aplicada || folhasLocais()
			? `Folha ${f.folha} salva no Aseprite às ${quando}: já está à vista (folhas locais).`
			: `Folha ${f.folha} salva no Aseprite às ${quando}: o Studio ainda mostra a imagem do Roblox.`;
	};
	const tom = () => (folhasLocais() ? "ok" : "aviso");
	const botoes = (ordem: number) => [
		<Botao
			texto="Ver folhas locais"
			desligado={folhasLocais}
			aoClicar={() => {
				task.spawn(definirFolhasLocais, true);
				const f = folhaSalva();
				if (f) folhaSalva({ ...f, aplicada: true });
			}}
			ordem={ordem}
		/>,
		<Botao texto="Ok" aoClicar={() => folhaSalva(undefined)} ordem={ordem + 1} />,
	];
	if (props.horizontal) {
		return (
			<Linha espaco={4} ordem={props.ordem} visivel={() => folhaSalva() !== undefined}>
				<Rotulo texto={texto} tom={tom} largura={new UDim(1, -170)} ordem={0} />
				{botoes(1)}
			</Linha>
		);
	}
	return (
		<Coluna espaco={2} ordem={props.ordem} visivel={() => folhaSalva() !== undefined}>
			<Rotulo texto={texto} tom={tom} ordem={0} />
			<Linha espaco={4} ordem={1}>
				{botoes(0)}
			</Linha>
		</Coluna>
	);
}
