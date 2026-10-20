// Suporte: os documentos de docs/diorama/*.md dentro do Studio. A lista vem de GET /docs; o texto, de GET /docs/<nome>.
import Vide, { cleanup, For, mount, source } from "@rbxts/vide";
import { argTexto, registrarAcoes } from "../simulacao";
import { COMO_LIGAR, lerDoc, listarDocs } from "../ponte";
import { AreaTexto, Botao, Coluna, ESPACO, Lista, Painel, Rotulo, Titulo } from "../ui/kit";
import type { OpcoesWidget } from "../widget";

/** Largura da coluna com a lista de documentos. */
const LARGURA_LISTA = 170;
/** Altura somada do título, do subtítulo, do aviso e do botão acima e abaixo da lista. */
const TEXTO_CABECALHO = 18 + 4 + 16 + 16 + 24 + 10;

export function PainelSuporte() {
	const docs = source<Array<{ nome: string }>>([]);
	const aberto = source<string | undefined>(undefined);
	const texto = source("Escolha um documento à esquerda.");
	const aviso = source("");
	const carregando = source(false);

	function recarregar() {
		task.spawn(() => {
			const r = listarDocs();
			if (r.ok) {
				docs(r.valor.map((nome) => ({ nome })));
				aviso(r.valor.size() === 0 ? "Nenhum .md em docs/diorama." : "");
			} else {
				docs([]);
				aviso(r.erro);
			}
		});
	}

	function abrirDoc(nome: string) {
		if (carregando()) return;
		carregando(true);
		aberto(nome);
		texto(`Carregando ${nome}.md...`);
		task.spawn(() => {
			const r = lerDoc(nome);
			texto(r.ok ? r.valor : `Não deu para ler ${nome}.md: ${r.erro}\n${COMO_LIGAR}`);
			carregando(false);
		});
	}

	recarregar();

	// Abrir um documento visto de fora (simulacao.ts): devolve o tamanho do texto mostrado.
	cleanup(
		registrarAcoes("suporte", {
			abrir: (args) => {
				abrirDoc(argTexto(args, "nome"));
				const limite = os.clock() + 10;
				task.wait();
				while (carregando() && os.clock() < limite) task.wait();
				return { nome: aberto(), caracteres: texto().size() };
			},
		}),
	);

	return (
		<Painel>
			<Coluna tamanho={new UDim2(0, LARGURA_LISTA, 1, 0)}>
				<Titulo texto="Suporte" ordem={0} />
				<Rotulo texto="docs/diorama" tom="fraco" ordem={1} />
				<Lista tamanho={new UDim2(1, 0, 1, -(TEXTO_CABECALHO + ESPACO * 3))} espaco={2} ordem={2}>
					<For each={docs}>
						{(doc, indice) => (
							<Botao
								texto={doc.nome}
								largura={new UDim(1, -10)}
								ativo={() => aberto() === doc.nome}
								aoClicar={() => abrirDoc(doc.nome)}
								ordem={indice()}
							/>
						)}
					</For>
				</Lista>
				<Rotulo texto={aviso} tom="erro" ordem={3} />
				<Botao texto="Recarregar lista" aoClicar={recarregar} ordem={4} />
			</Coluna>
			<AreaTexto
				texto={texto}
				posicao={UDim2.fromOffset(LARGURA_LISTA + ESPACO, 0)}
				tamanho={new UDim2(1, -(LARGURA_LISTA + ESPACO), 1, 0)}
			/>
		</Painel>
	);
}

export const WIDGET: OpcoesWidget = { titulo: "Suporte", largura: 720, altura: 520 };

export function montar(gui: DockWidgetPluginGui) {
	return mount(() => <PainelSuporte />, gui);
}
