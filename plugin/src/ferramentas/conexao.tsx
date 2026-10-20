// Conexão: a versão do plugin, o GET /status da ponte (versão, pastas, Rojo em 34872, quantos mapas), o que dá
// para dizer do MCP do Studio (nada de dentro: só o texto), o estado do place (servidor/place.ts) e os caminhos
// do repositório e do plugin, com um botão que os copia (setclipboard por pcall; sem ela, o texto fica
// selecionável para Ctrl+C).
import Vide, { For, mount, source } from "@rbxts/vide";
import { erroPonte, ponteLigada, statusPonte } from "../estado";
import { BASE, COMO_LIGAR, status } from "../ponte";
import { resumirPlace, Verificacao, verificarPlace } from "../servidor/place";
import { copiarTexto } from "../ui/copiar";
import { AreaTexto, Botao, Coluna, Lista, Painel, Rotulo, Separador, Titulo, Tom } from "../ui/kit";
import { Aviso, Bloco, Etiqueta, Fileira, Preenche, TextoCurto } from "../ui/kit";
import { DATA_VERSAO, VERSAO } from "../versao";
import { abrirWidget } from "../widget";

const PASTAS = ["mapas", "catalogo", "folhas", "assets", "docs"];
/** Onde o .rbxm do plugin é gravado por npm run plugin:build (o Studio não deixa ler a variável de ambiente). */
const CAMINHO_PLUGIN = "%LOCALAPPDATA%\\Roblox\\Plugins\\Diorama.rbxm";

function tomDoNivel(nivel: Verificacao["nivel"]): Tom {
	if (nivel === "erro") return "erro";
	if (nivel === "aviso") return "aviso";
	if (nivel === "ok") return "ok";
	return "fraco";
}

export function PainelConexao() {
	const verificando = source(false);
	const ultima = source("nunca");
	const place = source<Verificacao[]>([]);
	const resumoPlace = source("");
	const mensagem = source("");
	const copia = source("");

	function verificar() {
		if (verificando()) return;
		verificando(true);
		task.spawn(() => {
			const r = status();
			statusPonte(r.ok ? r.valor : undefined);
			const lista = verificarPlace();
			place(lista.filter((v) => v.nivel !== "ok"));
			resumoPlace(resumirPlace(lista));
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
		if (!s) return "Rojo: sem informação (a ponte é quem faz o ping na porta 34872).";
		if (!s.rojo.ligado) return `Rojo: nada respondeu na porta ${s.rojo.porta}. Rode \`npm run serve\` e clique em Connect no plugin do Rojo.`;
		return `Rojo: servindo na porta ${s.rojo.porta}${s.rojo.projeto !== undefined ? ` (projeto ${s.rojo.projeto})` : ""}.`;
	};
	const tomRojo = () => (statusPonte()?.rojo.ligado ? "ok" : "aviso");
	const linhaPasta = (nome: string) => () => {
		const pasta = statusPonte()?.pastas[nome];
		if (!pasta) return `${nome}: ?`;
		return `${nome}: ${pasta.caminho}${pasta.existe ? "" : " (não existe)"}`;
	};
	const tomPasta = (nome: string) => () => (statusPonte()?.pastas[nome]?.existe ? "normal" : "fraco");

	/** Os caminhos, um por linha, para copiar. */
	const caminhos = () => {
		const s = statusPonte();
		const linhas = new Array<string>();
		linhas.push(`Ponte: ${BASE}`);
		linhas.push(`Rojo: http://127.0.0.1:${s?.rojo.porta ?? 34872}`);
		linhas.push(`Plugin: ${CAMINHO_PLUGIN}`);
		if (s) {
			linhas.push(`Raiz: ${s.raiz}`);
			for (const nome of PASTAS) {
				const pasta = s.pastas[nome];
				if (pasta) linhas.push(`${nome}: ${s.raiz}\\${pasta.caminho}${pasta.existe ? "" : "  (não existe)"}`);
			}
		} else {
			linhas.push("Raiz: (a ponte não respondeu; os caminhos do repositório vêm dela)");
		}
		return linhas.join("\n");
	};
	const copiarCaminhos = () => {
		const t = caminhos();
		if (copiarTexto(t)) {
			mensagem("Caminhos copiados para a área de transferência.");
			copia("");
		} else {
			copia(copia() !== "" ? "" : t);
			mensagem(copia() !== "" ? "O Studio não abre o Explorer nem tem setclipboard: selecione o texto abaixo e dê Ctrl+C." : "");
		}
	};

	return (
		<Painel>
			<Coluna tamanho={UDim2.fromScale(1, 1)}>
				<Titulo texto="Conexão" ordem={0} />
				<Rotulo texto={`Plugin Diorama ${VERSAO} (${DATA_VERSAO}).`} tom="fraco" ordem={1} />
				<Rotulo texto={linhaPonte} tom={() => (ponteLigada() ? "ok" : "erro")} ordem={2} />
				<Rotulo texto={linhaRojo} tom={tomRojo} ordem={3} />
				<Rotulo
					texto="MCP do Studio: o plugin não tem como ver se o MCP está ligado (ele fala com o Studio por fora). O Claude confere pelo list_roblox_studios; o plugin só fala com a ponte."
					tom="fraco"
					ordem={4}
				/>
				<Separador ordem={5} />
				<Fileira ordem={6}>
					<TextoCurto texto="Place:" negrito={true} ordem={0} />
					<TextoCurto texto={resumoPlace} ordem={1} />
				</Fileira>
				<Preenche ordem={7} visivel={() => copia() === ""}>
					<Lista tamanho={UDim2.fromScale(1, 1)} espaco={2}>
						<Rotulo texto="Pastas na raiz do repositório:" negrito={true} ordem={0} />
						{PASTAS.map((nome, i) => (
							<Rotulo texto={linhaPasta(nome)} tom={tomPasta(nome)} ordem={1 + i} />
						))}
						<Rotulo
							texto={() => {
								const s = statusPonte();
								return s ? `${s.mapas} mapa(s), ${s.folhas} folha(s).` : "";
							}}
							ordem={20}
						/>
						<Rotulo texto={() => `Raiz: ${statusPonte()?.raiz ?? "?"}`} tom="fraco" ordem={21} />
						<Rotulo texto={`Plugin: ${CAMINHO_PLUGIN}`} tom="fraco" ordem={22} />
						<Separador ordem={23} />
						<Rotulo texto="Place (o que não está ok; a lista inteira fica na aba Place do Servidor):" negrito={true} ordem={24} />
						<For each={place}>
							{(v, indice) => (
								<Bloco ordem={25 + indice()} espaco={1}>
									<Fileira ordem={0}>
										<Etiqueta texto={v.nivel} tom={tomDoNivel(v.nivel)} ordem={0} />
										<TextoCurto texto={v.onde} negrito={true} ordem={1} />
									</Fileira>
									<Rotulo texto={v.texto} tom={tomDoNivel(v.nivel)} ordem={1} />
									{v.correcao !== undefined ? <Rotulo texto={v.correcao} tom="fraco" ordem={2} /> : undefined}
								</Bloco>
							)}
						</For>
					</Lista>
				</Preenche>
				<Preenche ordem={8} visivel={() => copia() !== ""}>
					<AreaTexto texto={copia} tamanho={UDim2.fromScale(1, 1)} />
				</Preenche>
				<Aviso texto={mensagem} tom="normal" ordem={9} />
				<Separador ordem={10} />
				<Fileira ordem={11}>
					<Botao texto={() => (verificando() ? "Verificando..." : "Tentar de novo")} aoClicar={verificar} desligado={verificando} principal={true} ordem={0} />
					<Botao texto={() => (copia() !== "" ? "Voltar" : "Abrir pasta (copiar caminhos)")} aoClicar={copiarCaminhos} ordem={1} />
					<TextoCurto texto={() => `Última verificação: ${ultima()}`} tom="fraco" ordem={2} />
				</Fileira>
			</Coluna>
		</Painel>
	);
}

export function abrir(plugin: Plugin) {
	return abrirWidget(plugin, { id: "conexao", titulo: "Conexão", largura: 480, altura: 440 }, (gui) =>
		mount(() => <PainelConexao />, gui),
	);
}
