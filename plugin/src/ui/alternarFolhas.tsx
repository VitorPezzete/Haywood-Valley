// O interruptor "Folhas locais" (docs/diorama/CONEXOES.md, seção 4), o mesmo em Mapas e no Catálogo: ligado, as
// folhas aparecem com os pixels do disco (EditableImage) em vez dos ids do Roblox. Ligar ou desligar recarrega as
// imagens das duas ferramentas (estado.ts).
import Vide from "@rbxts/vide";
import { definirFolhasLocais } from "../estado";
import { folhasLocais } from "../folhasLocais";
import { Alternar } from "./kit";

export function AlternarFolhasLocais(props: { ordem?: number }) {
	// Uma fonte de fachada: lê o interruptor e, ao escrever, grava e recarrega as imagens (yielda: fora do clique).
	const valor = ((novo?: boolean) => {
		if (novo === undefined) return folhasLocais();
		task.spawn(definirFolhasLocais, novo);
		return novo;
	}) as Vide.Source<boolean>;
	return <Alternar texto="Folhas locais" valor={valor} ordem={props.ordem} />;
}
