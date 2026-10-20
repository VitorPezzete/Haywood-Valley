// Conexão: mostra o GET /status da ponte (versão, pastas, Rojo em 34872, quantos mapas) e deixa tentar de novo.
// Falta ainda: estado do MCP do Studio e do place (scripts da Fase 0 fora do lugar, atributos de desenvolvimento).
import Vide, { mount, source } from "@rbxts/vide";
import { erroPonte, ponteLigada, statusPonte } from "../estado";
import { BASE, COMO_LIGAR, status } from "../ponte";
import { Botao, Coluna, Painel, Rotulo, Separador, Titulo } from "../ui/kit";
import { abrirWidget } from "../widget";

const PASTAS = ["mapas", "catalogo", "folhas", "assets", "docs"];

export function PainelConexao() {
	const verificando = source(false);
	const ultima = source("nunca");

	function verificar() {
		if (verificando()) return;
		verificando(true);
		task.spawn(() => {
			const r = status();
			statusPonte(r.ok ? r.valor : undefined);
			ultima(os.date("%H:%M:%S"));
			verificando(false);
		});
	}
	verificar();

	const linhaPonte = () => {
		if (verificando() && statusPonte() === undefined) return "Verificando...";
		const s = statusPonte();
		if (ponteLigada() && s) return `Ponte ligada em ${BASE} (versão ${s.versao}).`;
		return erroPonte() ?? `Sem resposta da ponte. ${COMO_LIGAR}`;
	};
	const linhaRojo = () => {
		const s = statusPonte();
		if (!s) return "Rojo: sem informação (a ponte é quem faz o ping).";
		if (!s.rojo.ligado) return `Rojo: nada respondeu na porta ${s.rojo.porta}. Rode \`npm run serve\` e clique em Connect no plugin do Rojo.`;
		return `Rojo: servindo na porta ${s.rojo.porta}${s.rojo.projeto !== undefined ? ` (${s.rojo.projeto})` : ""}.`;
	};
	const tomRojo = () => (statusPonte()?.rojo.ligado ? "ok" : "aviso");
	const linhaPasta = (nome: string) => () => {
		const pasta = statusPonte()?.pastas[nome];
		if (!pasta) return `${nome}: ?`;
		return `${nome}: ${pasta.caminho}${pasta.existe ? "" : " (não existe)"}`;
	};
	const tomPasta = (nome: string) => () => (statusPonte()?.pastas[nome]?.existe ? "normal" : "fraco");

	return (
		<Painel>
			<Coluna>
				<Titulo texto="Conexão" ordem={0} />
				<Rotulo texto={linhaPonte} tom={() => (ponteLigada() ? "ok" : "erro")} ordem={1} />
				<Rotulo texto={linhaRojo} tom={tomRojo} ordem={2} />
				<Separador ordem={3} />
				<Rotulo texto="Pastas na raiz do repositório:" negrito={true} ordem={4} />
				{PASTAS.map((nome, i) => (
					<Rotulo texto={linhaPasta(nome)} tom={tomPasta(nome)} ordem={5 + i} />
				))}
				<Rotulo
					texto={() => {
						const s = statusPonte();
						return s ? `${s.mapas} mapa(s), ${s.folhas} folha(s).` : "";
					}}
					ordem={20}
				/>
				<Rotulo texto={() => `Raiz: ${statusPonte()?.raiz ?? "?"}`} tom="fraco" ordem={21} />
				<Separador ordem={22} />
				<Botao texto={() => (verificando() ? "Verificando..." : "Tentar de novo")} aoClicar={verificar} desligado={verificando} principal={true} ordem={23} />
				<Rotulo texto={() => `Última verificação: ${ultima()}`} tom="fraco" ordem={24} />
			</Coluna>
		</Painel>
	);
}

export function abrir(plugin: Plugin) {
	return abrirWidget(plugin, { id: "conexao", titulo: "Conexão", largura: 420, altura: 360 }, (gui) =>
		mount(() => <PainelConexao />, gui),
	);
}
