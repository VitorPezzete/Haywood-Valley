// Problemas: diagnóstico com um clique. Lê os mapas, o catálogo e os assets pela ponte, confere o place, e lista
// cada problema com a gravidade, onde, o quê e como corrigir. Filtros por grupo e por gravidade. Com a ponte
// fora, avisa no topo e confere só o place. Lógica em plugin/src/problemas/ (diagnostico.ts chama o resto).
import Vide, { For, mount, source } from "@rbxts/vide";
import { diagnosticar, Diagnostico, resumir } from "../problemas/diagnostico";
import { Gravidade, Grupo, Problema, TITULO_DO_GRUPO } from "../problemas/tipos";
import { copiarTexto } from "../ui/copiar";
import { AreaTexto, Botao, Coluna, Lista, Painel, Rotulo, Titulo, Tom } from "../ui/kit";
import { Aviso, Bloco, Etiqueta, Fileira, Preenche, TextoCurto } from "../ui/kit";
import { abrirWidget } from "../widget";

export const DESCRICAO = "Diagnóstico dos mapas, do catálogo e dos assets: o que está inconsistente e onde.";

const GRUPOS: Grupo[] = ["mapas", "catalogo", "assets", "place", "ponte"];
const GRAVIDADES: Gravidade[] = ["erro", "aviso", "info"];
const TITULO_DA_GRAVIDADE: Record<Gravidade, string> = { erro: "Erros", aviso: "Avisos", info: "Notas" };

function tomDaGravidade(g: Gravidade): Tom {
	if (g === "erro") return "erro";
	if (g === "aviso") return "aviso";
	return "fraco";
}

/** Os problemas como texto, para copiar. */
function textoDosProblemas(lista: Problema[]): string {
	return lista.map((p) => `[${p.gravidade}] ${TITULO_DO_GRUPO[p.grupo]} · ${p.onde}\n  ${p.oQue}${p.comoCorrigir !== "" ? `\n  → ${p.comoCorrigir}` : ""}`).join("\n");
}

export function PainelProblemas() {
	const rodando = source(false);
	const resultado = source<Diagnostico | undefined>(undefined);
	const grupos = source<ReadonlySet<Grupo>>(new Set<Grupo>(GRUPOS));
	const gravidades = source<ReadonlySet<Gravidade>>(new Set<Gravidade>(GRAVIDADES));
	const mensagem = source("");
	const copia = source("");

	const filtrados = () => {
		const d = resultado();
		if (!d) return [];
		return d.problemas.filter((p) => grupos().has(p.grupo) && gravidades().has(p.gravidade));
	};
	const contar = (predicado: (p: Problema) => boolean) => {
		const d = resultado();
		return d ? d.problemas.filter(predicado).size() : 0;
	};

	function rodar() {
		if (rodando()) return;
		rodando(true);
		mensagem("Diagnosticando...");
		copia("");
		task.spawn(() => {
			const [ok, valor] = pcall(diagnosticar);
			if (ok) {
				const d = valor as Diagnostico;
				resultado(d);
				mensagem(resumir(d));
			} else {
				mensagem(`O diagnóstico falhou: ${tostring(valor)}`);
				warn(`[Diorama] diagnóstico falhou: ${tostring(valor)}`);
			}
			rodando(false);
		});
	}

	const alternarGrupo = (g: Grupo) => {
		const novo = new Set<Grupo>([...grupos()]);
		if (novo.has(g)) novo.delete(g);
		else novo.add(g);
		grupos(novo);
	};
	const alternarGravidade = (g: Gravidade) => {
		const novo = new Set<Gravidade>([...gravidades()]);
		if (novo.has(g)) novo.delete(g);
		else novo.add(g);
		gravidades(novo);
	};
	const copiar = () => {
		const t = textoDosProblemas(filtrados());
		if (t === "") {
			mensagem("Nada para copiar.");
			return;
		}
		if (copiarTexto(t)) {
			mensagem("Lista copiada para a área de transferência.");
		} else {
			copia(copia() !== "" ? "" : t);
			mensagem(copia() !== "" ? "O Studio não tem setclipboard: o texto está abaixo (clique, Ctrl+A, Ctrl+C). Clique de novo para voltar à lista." : "");
		}
	};

	rodar();

	return (
		<Painel>
			<Coluna tamanho={UDim2.fromScale(1, 1)}>
				<Titulo texto="Problemas" ordem={0} />
				<Aviso
					texto={() => {
						const d = resultado();
						return d && d.ponteFora ? `A ponte não respondeu (${d.erroPonte ?? "?"}): só o place foi conferido. Rode npm run diorama:ponte e diagnostique de novo.` : "";
					}}
					tom="aviso"
					ordem={1}
				/>
				<Fileira ordem={2}>
					<Botao texto={() => (rodando() ? "Diagnosticando..." : "Diagnosticar")} aoClicar={rodar} desligado={rodando} principal={true} ordem={0} />
					<Botao texto="Copiar lista" aoClicar={copiar} ordem={1} />
				</Fileira>
				<Rotulo texto={mensagem} ordem={3} />
				<Fileira ordem={4} espaco={2}>
					{GRAVIDADES.map((g, i) => (
						<Botao
							texto={() => `${TITULO_DA_GRAVIDADE[g]} (${contar((p) => p.gravidade === g)})`}
							ativo={() => gravidades().has(g)}
							aoClicar={() => alternarGravidade(g)}
							ordem={i}
						/>
					))}
				</Fileira>
				<Fileira ordem={5} espaco={2}>
					{GRUPOS.map((g, i) => (
						<Botao
							texto={() => `${TITULO_DO_GRUPO[g]} (${contar((p) => p.grupo === g)})`}
							ativo={() => grupos().has(g)}
							aoClicar={() => alternarGrupo(g)}
							ordem={i}
						/>
					))}
				</Fileira>
				<Preenche ordem={6} visivel={() => copia() !== ""}>
					<AreaTexto texto={copia} tamanho={UDim2.fromScale(1, 1)} />
				</Preenche>
				<Preenche ordem={7} visivel={() => copia() === ""}>
					<Lista tamanho={UDim2.fromScale(1, 1)} espaco={4}>
						<For each={filtrados}>
							{(p, indice) => (
								<Bloco ordem={indice()} espaco={1}>
									<Fileira ordem={0}>
										<Etiqueta texto={p.gravidade} tom={tomDaGravidade(p.gravidade)} ordem={0} />
										<Etiqueta texto={TITULO_DO_GRUPO[p.grupo]} tom="fraco" ordem={1} />
										<TextoCurto texto={p.onde} negrito={true} ordem={2} />
									</Fileira>
									<Rotulo texto={p.oQue} ordem={1} />
									{p.comoCorrigir !== "" ? <Rotulo texto={`Como corrigir: ${p.comoCorrigir}`} tom="fraco" ordem={2} /> : undefined}
								</Bloco>
							)}
						</For>
						<Rotulo
							texto={() => {
								const d = resultado();
								if (!d) return "";
								if (d.problemas.size() === 0) return "Nenhum problema encontrado.";
								return filtrados().size() === 0 ? "Nada com estes filtros." : "";
							}}
							tom="fraco"
							ordem={100000}
						/>
					</Lista>
				</Preenche>
			</Coluna>
		</Painel>
	);
}

export function abrir(plugin: Plugin) {
	return abrirWidget(plugin, { id: "problemas", titulo: "Problemas", largura: 640, altura: 520 }, (gui) =>
		mount(() => <PainelProblemas />, gui),
	);
}
