// O pacote do plugin Diorama: tudo o que a casca (index.server.ts) carrega e troca a quente. `iniciar(ambiente)`
// liga as ferramentas aos botões e widgets que a casca guarda, o filtro do Output, o tema e o canal do Studio, e
// devolve `parar`, que desfaz tudo (docs/diorama/CONEXOES.md, seção 1).
import { aoParar, Ambiente, definirAmbiente, encerrar } from "./ambiente";
import { iniciarCanal } from "./canal";
import { carregarConfigFolhas, liberarFolhasLocais } from "./folhasLocais";
import { FERRAMENTAS } from "./ferramentas";
import { modoAtual } from "./servidor/execucao";
import { ligarOutput } from "./servidor/output";
import { aplicarPendente } from "./servidor/teleporte";
import { ligarTema } from "./ui/kit";
import { desmontarTodos, prepararFerramentas } from "./widget";

function parar() {
	desmontarTodos();
	liberarFolhasLocais();
	encerrar();
}

export function iniciar(ambiente: Ambiente): () => void {
	definirAmbiente(ambiente);
	const [ok, erro] = pcall(() => {
		ligarTema();
		// O buffer do Output começa a encher quando o pacote carrega, não só quando o painel Servidor abre.
		ligarOutput();
		carregarConfigFolhas();
		prepararFerramentas(FERRAMENTAS);
		if (modoAtual() === "edicao") {
			const [aplicou, erroTeleporte] = pcall(() => aplicarPendente(ambiente.plugin));
			if (!aplicou) warn(`[Diorama] teleporte pendente: ${tostring(erroTeleporte)}`);
		}
		aoParar(iniciarCanal());
	});
	if (!ok) {
		// Desfaz o que chegou a ligar antes de a casca voltar ao pacote anterior.
		parar();
		error(erro, 0);
	}
	print(`[Diorama] ${FERRAMENTAS.size()} ferramentas prontas (pacote ${ambiente.versao}, ${ambiente.origem}).`);
	return parar;
}
