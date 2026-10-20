// Verificar (janela única, 2026-10-20; antes a ferramenta Problemas): um botão "Verificar tudo" e a lista do que
// está errado, cada item com "como corrigir" e um botão que leva ao lugar (o mapa, a peça, a imagem, o place, a
// ponte). Lê os mapas, o catálogo e os assets pela ponte e confere o place (problemas/diagnostico.ts). Os filtros e o
// "Copiar lista" ficam no Avançado. Em cima, o orçamento de desempenho do mapa aberto (mapas/orcamento.ts).
import Vide, { cleanup, For, mount, source } from "@rbxts/vide";
import { avancado, definirAvancado } from "../config";
import { mapaAberto, ultimosProblemas } from "../estado";
import { controleMapas } from "../mapas/controle";
import { orcamentoDoMapa } from "../mapas/orcamento";
import { diagnosticar, Diagnostico, resumir } from "../problemas/diagnostico";
import { Gravidade, Grupo, Problema, TITULO_DO_GRUPO } from "../problemas/tipos";
import { esperarAcoes, registrarAcoes } from "../simulacao";
import { copiarTexto } from "../ui/copiar";
import { sobreposicao } from "../ui/janela";
import { AreaTexto, Bloco, Botao, Coluna, Etiqueta, Fileira, Lista, Painel, Preenche, Rotulo, Titulo, Tom } from "../ui/kit";
import { BotaoAvancado, BotaoGrande, Cartao, Vazio } from "../ui/simples";
import { ContextoSecao, mostrar } from "../widget";

const GRUPOS: Grupo[] = ["mapas", "catalogo", "assets", "place", "ponte"];
const GRAVIDADES: Gravidade[] = ["erro", "aviso", "info"];
const TITULO_DA_GRAVIDADE: Record<Gravidade, string> = { erro: "Erros", aviso: "Avisos", info: "Notas" };
const NOME_DA_GRAVIDADE: Record<Gravidade, string> = { erro: "erro", aviso: "aviso", info: "nota" };

function tomDaGravidade(g: Gravidade): Tom {
	if (g === "erro") return "erro";
	if (g === "aviso") return "aviso";
	return "fraco";
}

/** Os problemas como texto, para copiar e para o contexto do Claude. */
function textoDosProblemas(lista: Problema[]): string {
	return lista.map((p) => `[${p.gravidade}] ${TITULO_DO_GRUPO[p.grupo]} · ${p.onde}\n  ${p.oQue}${p.comoCorrigir !== "" ? `\n  → ${p.comoCorrigir}` : ""}`).join("\n");
}

/** Abre o mapa no editor (como o seletor do cabeçalho). Yielda. */
function irAoMapa(id: string) {
	mostrar("mapa");
	const limite = os.clock() + 5;
	let c = controleMapas();
	while (!c && os.clock() < limite) {
		task.wait(0.05);
		c = controleMapas();
	}
	c?.clicar(id);
}

/** Seleciona a peça na seção Peças. O id pode ter vírgula ("casa@56,25"); o resto do "onde" vai sendo cortado. Yielda. */
function irAPeca(texto: string) {
	mostrar("pecas");
	const acoes = esperarAcoes("pecas");
	if (!acoes) return;
	let candidato = texto;
	while (candidato !== "") {
		const [ok] = pcall(() => acoes.selecionar({ id: candidato }));
		if (ok) return;
		const [corte] = candidato.find(", [^,]*$");
		if (corte === undefined) return;
		candidato = candidato.sub(1, corte - 1);
	}
}

/** Para onde o botão "Ir" leva, ou nada. */
function destino(p: Problema): { rotulo: string; ir: () => void } | undefined {
	if (p.grupo === "mapas") {
		const [id] = p.onde.match("^mapa ([%w_]+)");
		if (id !== undefined) return { rotulo: "Abrir o mapa", ir: () => task.spawn(irAoMapa, tostring(id)) };
	}
	if (p.grupo === "catalogo") {
		const [resto] = p.onde.match("pecas%.json: (.+)$");
		if (resto !== undefined) return { rotulo: "Ver a peça", ir: () => task.spawn(irAPeca, tostring(resto)) };
		return { rotulo: "Abrir Peças", ir: () => mostrar("pecas") };
	}
	if (p.grupo === "assets") {
		const [chave] = p.onde.match("registro%.json: ([^,]+)");
		return {
			rotulo: "Ver em Arte",
			ir: () => {
				mostrar("arte");
				if (chave !== undefined) task.spawn(() => esperarAcoes("arte")?.filtrar({ texto: tostring(chave) }));
			},
		};
	}
	if (p.grupo === "place") {
		return {
			rotulo: "Ver o place",
			ir: () => {
				definirAvancado(true);
				mostrar("testar");
				task.spawn(() => esperarAcoes("testar")?.aba({ id: "place" }));
			},
		};
	}
	if (p.grupo === "ponte") return { rotulo: "Ver conexões", ir: () => sobreposicao("estado") };
	return undefined;
}

export function PainelVerificar() {
	const rodando = source(false);
	const resultado = source<Diagnostico | undefined>(undefined);
	const grupos = source<ReadonlySet<Grupo>>(new Set<Grupo>(GRUPOS));
	const gravidades = source<ReadonlySet<Gravidade>>(new Set<Gravidade>(GRAVIDADES));
	const mensagem = source("");
	const copia = source("");
	const orcamento = source("");

	const filtrados = () => {
		const d = resultado();
		if (!d) return [];
		// Sem o Avançado, os filtros não aparecem: mostra tudo.
		if (!avancado()) return d.problemas;
		return d.problemas.filter((p) => grupos().has(p.grupo) && gravidades().has(p.gravidade));
	};
	const contar = (predicado: (p: Problema) => boolean) => {
		const d = resultado();
		return d ? d.problemas.filter(predicado).size() : 0;
	};
	const resumoCurto = () => {
		const d = resultado();
		if (!d) return rodando() ? "Verificando…" : "";
		const erros = contar((p) => p.gravidade === "erro");
		const avisos = contar((p) => p.gravidade === "aviso");
		if (erros === 0 && avisos === 0) return "Tudo certo.";
		const partes = new Array<string>();
		if (erros > 0) partes.push(`${erros} erro(s)`);
		if (avisos > 0) partes.push(`${avisos} aviso(s)`);
		return erros > 0 ? `${partes.join(" e ")}. Comece pelos erros.` : `${partes.join(" e ")}; nada impede o jogo de rodar.`;
	};

	const atualizarOrcamento = () => {
		const c = controleMapas();
		orcamento(c && mapaAberto() !== undefined ? orcamentoDoMapa(c.modelo()).frase : "");
	};

	function rodar() {
		if (rodando()) return;
		rodando(true);
		mensagem("");
		copia("");
		atualizarOrcamento();
		task.spawn(() => {
			const [ok, valor] = pcall(diagnosticar);
			if (ok) {
				const d = valor as Diagnostico;
				resultado(d);
				mensagem(avancado() ? resumir(d) : "");
				ultimosProblemas(d.problemas.filter((p) => p.gravidade !== "info").map((p) => `[${p.gravidade}] ${p.onde}: ${p.oQue}`));
			} else {
				mensagem(`A verificação falhou: ${tostring(valor)}`);
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
		if (t === "") return mensagem("Nada para copiar.");
		if (copiarTexto(t)) mensagem("Lista copiada.");
		else {
			copia(copia() !== "" ? "" : t);
			mensagem(copia() !== "" ? "O Studio não copia sozinho: selecione o texto abaixo e dê Ctrl+C. Clique de novo para voltar." : "");
		}
	};

	rodar();

	// "Verificar tudo" visto de fora (simulacao.ts): roda e espera o resultado.
	cleanup(
		registrarAcoes("verificar", {
			rodar: () => {
				const limite = os.clock() + 30;
				while (rodando() && os.clock() < limite) task.wait();
				rodar();
				task.wait();
				while (rodando() && os.clock() < limite) task.wait();
				const d = resultado();
				return { mensagem: resumoCurto(), problemas: d ? d.problemas.size() : 0, mostrados: filtrados().size(), orcamento: orcamento() };
			},
			/** O botão "Ir" do problema de número `n` (da lista mostrada, a partir de 1). */
			ir: (args) => {
				const n = typeIs(args.n, "number") ? args.n : 1;
				const p = filtrados()[n - 1];
				if (!p) error(`não há problema ${n}`, 0);
				const d = destino(p);
				if (!d) error("este problema não tem lugar para ir", 0);
				d.ir();
				return { onde: p.onde, foi: d.rotulo };
			},
		}),
	);

	return (
		<Painel>
			<Coluna tamanho={UDim2.fromScale(1, 1)}>
				<Titulo texto="Verificar" ordem={0} />
				<BotaoGrande
					titulo={() => (rodando() ? "Verificando…" : "Verificar tudo")}
					explicacao="Mapas, peças, imagens e o place."
					principal={true}
					desligado={rodando}
					aoClicar={rodar}
					ordem={1}
					nome="VerificarTudo"
				/>
				<Rotulo
					texto={resumoCurto}
					tom={() => (contar((p) => p.gravidade === "erro") > 0 ? "erro" : contar((p) => p.gravidade === "aviso") > 0 ? "aviso" : "ok")}
					negrito={true}
					ordem={2}
				/>
				<Vazio
					texto={() => {
						const d = resultado();
						return d && d.ponteFora ? "A ponte está desligada: só deu para conferir o place." : "";
					}}
					botao="Como ligar a ponte"
					aoClicar={() => sobreposicao("estado")}
					tom="aviso"
					visivel={() => resultado()?.ponteFora === true}
					ordem={3}
				/>
				<Cartao titulo="Peso do mapa aberto" ordem={4} visivel={() => orcamento() !== ""}>
					<Rotulo texto={orcamento} ordem={0} />
				</Cartao>
				<Rotulo texto={mensagem} tom="fraco" ordem={5} />
				<BotaoAvancado ordem={6} rotulo="Avançado: filtros e copiar" />
				<Bloco ordem={7} visivel={avancado}>
					<Fileira ordem={0} espaco={2}>
						{GRAVIDADES.map((g, i) => (
							<Botao texto={() => `${TITULO_DA_GRAVIDADE[g]} (${contar((p) => p.gravidade === g)})`} ativo={() => gravidades().has(g)} aoClicar={() => alternarGravidade(g)} ordem={i} />
						))}
					</Fileira>
					<Fileira ordem={1} espaco={2}>
						{GRUPOS.map((g, i) => (
							<Botao texto={() => `${TITULO_DO_GRUPO[g]} (${contar((p) => p.grupo === g)})`} ativo={() => grupos().has(g)} aoClicar={() => alternarGrupo(g)} ordem={i} />
						))}
						<Botao texto="Copiar lista" aoClicar={copiar} ordem={10} />
					</Fileira>
				</Bloco>
				<Preenche ordem={8} visivel={() => copia() !== ""}>
					<AreaTexto texto={copia} tamanho={UDim2.fromScale(1, 1)} />
				</Preenche>
				<Preenche ordem={9} visivel={() => copia() === ""}>
					<Lista tamanho={UDim2.fromScale(1, 1)} espaco={6}>
						<For each={filtrados}>
							{(p, indice) => {
								const d = destino(p);
								return (
									<Bloco ordem={indice()} espaco={2}>
										<Fileira ordem={0}>
											<Etiqueta texto={NOME_DA_GRAVIDADE[p.gravidade]} tom={tomDaGravidade(p.gravidade)} ordem={0} />
											<Rotulo texto={p.onde} negrito={true} largura={new UDim(1, -70)} ordem={1} />
										</Fileira>
										<Rotulo texto={p.oQue} ordem={1} />
										{p.comoCorrigir !== "" ? <Rotulo texto={`Como corrigir: ${p.comoCorrigir}`} tom="fraco" ordem={2} /> : undefined}
										{d ? <Botao texto={`${d.rotulo} →`} aoClicar={d.ir} ordem={3} /> : undefined}
									</Bloco>
								);
							}}
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

export function montar(quadro: Frame, _contexto: ContextoSecao) {
	return mount(() => <PainelVerificar />, quadro);
}
