// O pacote do plugin Diorama: tudo o que a casca (index.server.ts) carrega e troca a quente. `iniciar(ambiente)`
// lê as Configurações, liga a janela única (o botão "Diorama", a moldura com o cabeçalho e a navegação, e as seções),
// o filtro do Output, o tema e o canal do Studio, e devolve `parar`, que desfaz tudo (docs/diorama/CONEXOES.md,
// seção 1).
import { aoParar, Ambiente, definirAmbiente, encerrar } from "./ambiente";
import { iniciarCanal } from "./canal";
import { carregarConfig, ultimaSecao } from "./config";
import { carregarConfigFolhas, liberarFolhasLocais } from "./folhasLocais";
import { SECOES_MONTAVEIS } from "./ferramentas";
import { resolverSecao, SECOES } from "./secoes";
import { modoAtual } from "./servidor/execucao";
import { ligarOutput } from "./servidor/output";
import { aplicarPendente } from "./servidor/teleporte";
import { montarJanela } from "./ui/janela";
import { ligarTema } from "./ui/kit";
import { desmontarTodos, garantirMontada, prepararJanela, secaoAberta } from "./widget";

function parar() {
	desmontarTodos();
	liberarFolhasLocais();
	encerrar();
}

export function iniciar(ambiente: Ambiente): () => void {
	definirAmbiente(ambiente);
	const [ok, erro] = pcall(() => {
		ligarTema();
		carregarConfig();
		// O buffer do Output começa a encher quando o pacote carrega, não só quando o Testar abre.
		ligarOutput();
		carregarConfigFolhas();
		const inicial = resolverSecao(ultimaSecao());
		secaoAberta(SECOES.some((s) => s.id === inicial) ? inicial : "mapa");
		const gui = prepararJanela(SECOES_MONTAVEIS);
		aoParar(montarJanela(gui, SECOES));
		// O Studio restaura a janela aberta da sessão anterior; e numa recarga a janela aberta continua aberta.
		if (gui.Enabled) garantirMontada(secaoAberta());
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
	print(`[Diorama] janela pronta com ${SECOES.size()} seções (pacote ${ambiente.versao}, ${ambiente.origem}).`);
	return parar;
}
