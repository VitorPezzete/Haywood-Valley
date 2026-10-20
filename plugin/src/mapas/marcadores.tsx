// Os marcadores do bloco (12.10, 12.17, 12.20): nascimento, entradas, saídas, zonas e moradores. Uma aba por tipo,
// com a lista, os campos do selecionado e o botão "Posicionar no canvas", que pede ao painel um clique (célula) ou
// um arrasto (retângulo) no canvas. Toda mudança passa por `mudar`, que registra no histórico e sobe a versão.
import Vide, { effect, source } from "@rbxts/vide";
import { Abas, Botao, Campo, Coluna, Linha, Lista, Rotulo, Separador } from "../ui/kit";
import { CampoMulti, Ciclo, Fileira, TextoCurto } from "../ui/kit";
import { idsAssets } from "../estado";
import { Legenda, ListaSelecao } from "../ui/extras";
import { copiarMarcadores, Entrada, LADO, Marcadores, ModeloBloco, Morador, Pose, Saida, ZonaMapa } from "./bloco";
import { Historico } from "./historico";
import { olharDoAssento } from "./zonas";

/** O que o painel faz com o próximo clique (ou arrasto) no canvas. */
export interface PedidoPosicao {
	tipo: "celula" | "retangulo";
	rotulo: string;
	aplicar: (x0: number, y0: number, x1: number, y1: number) => void;
}

export interface PropsMarcadores {
	modelo: () => ModeloBloco;
	versao: Vide.Source<number>;
	hist: Historico;
	pedido: Vide.Source<PedidoPosicao | undefined>;
	/** Chamado depois de cada mudança (o painel marca o bloco como sujo). */
	aoMudar: () => void;
	aviso: (texto: string) => void;
	/** Preenchido pelo painel com as ações dos botões (o comando `simular` e o autoteste as chamam). */
	acoes?: Record<string, (args: Record<string, unknown>) => unknown>;
}

const ABAS = [
	{ id: "nascimento", titulo: "Nasc." },
	{ id: "entradas", titulo: "Entradas" },
	{ id: "saidas", titulo: "Saídas" },
	{ id: "zonas", titulo: "Zonas" },
	{ id: "moradores", titulo: "Moradores" },
];

const OLHARES = [
	{ valor: 0, texto: "cima" },
	{ valor: 1, texto: "esquerda" },
	{ valor: 2, texto: "baixo" },
	{ valor: 3, texto: "direita" },
];
const POSES: Array<{ valor: Pose; texto: string }> = [
	{ valor: "idle", texto: "de pé" },
	{ valor: "sit", texto: "sentado" },
	{ valor: "lie", texto: "deitado" },
];

/**
 * Os ambientes que o jogo conhece (cópia de AMBIENCE_PROFILES em src/shared/sounds.ts, 2026-10-20; a zona com outro
 * nome fica sem ambiente). As músicas vêm do registro de assets: cada `musica.<lugar>_<período>` vira o lugar.
 */
const AMBIENTES = ["casa", "exterior", "mar"];
const MUSICAS_RESERVA = ["ilha", "sala"];
const PERIODOS = ["manha", "dia", "tarde", "noite"];

function musicasDoRegistro(): string[] {
	const lugares = new Array<string>();
	for (const [chave] of pairs(idsAssets())) {
		const [lugar, periodo] = (chave as string).match("^musica%.(.+)_(%a+)$");
		if (lugar === undefined || !PERIODOS.includes(tostring(periodo))) continue;
		if (!lugares.includes(tostring(lugar))) lugares.push(tostring(lugar));
	}
	for (const m of MUSICAS_RESERVA) if (!lugares.includes(m)) lugares.push(m);
	lugares.sort();
	return lugares;
}

function inteiro(texto: string, minimo: number, maximo: number): number | undefined {
	const n = tonumber(texto);
	if (n === undefined || n !== math.floor(n) || n < minimo || n > maximo) return undefined;
	return n;
}

function propsParaTexto(props: Record<string, string>) {
	const linhas = new Array<string>();
	for (const [k, v] of pairs(props)) linhas.push(`${k}=${v}`);
	linhas.sort();
	return linhas.join("\n");
}

function textoParaProps(texto: string) {
	const props: Record<string, string> = {};
	for (const linha of texto.split("\n")) {
		const corte = linha.find("=", 1, true)[0];
		if (corte === undefined) continue;
		const chave = linha.sub(1, corte - 1).gsub("^%s+", "")[0].gsub("%s+$", "")[0];
		const valor = linha.sub(corte + 1).gsub("^%s+", "")[0].gsub("%s+$", "")[0];
		if (chave !== "") props[chave] = valor;
	}
	return props;
}

export function PainelMarcadores(props: PropsMarcadores) {
	const aba = source("nascimento");
	const modelo = props.modelo;

	/** Aplica uma mudança nos marcadores com registro no histórico. */
	const mudar = (f: (m: Marcadores) => void) => {
		const antes = copiarMarcadores(modelo().marcadores);
		f(modelo().marcadores);
		props.hist.registrarMarcadores(antes, modelo());
		props.versao(props.versao() + 1);
		props.aoMudar();
	};
	const pedirCelula = (rotulo: string, aplicar: (x: number, y: number) => void) =>
		props.pedido({ tipo: "celula", rotulo, aplicar: (x, y) => aplicar(x, y) });
	const pedirRetangulo = (rotulo: string, aplicar: (x0: number, y0: number, x1: number, y1: number) => void) =>
		props.pedido({ tipo: "retangulo", rotulo, aplicar });

	// ------------------------------------------------------------------ nascimento

	const textoNascimento = () => {
		props.versao();
		const n = modelo().marcadores.nascimento;
		return n ? `Nascimento em (${n[0]}, ${n[1]})${modelo().bloqueia(n[0], n[1]) ? " — bloqueado!" : ""}` : "Sem nascimento.";
	};

	// ------------------------------------------------------------------ entradas

	const entradaSel = source<Entrada | undefined>(undefined);
	const eNome = source("");
	const eX = source("");
	const eY = source("");
	effect(() => {
		const e = entradaSel();
		if (!e) return;
		eNome(e.nome);
		eX(tostring(e.x));
		eY(tostring(e.y));
	});
	const aplicarEntrada = () => {
		const e = entradaSel();
		if (!e) return;
		const x = inteiro(eX(), 0, LADO - 1);
		const y = inteiro(eY(), 0, LADO - 1);
		if (x === undefined || y === undefined) return props.aviso("Entrada: x e y de 0 a 63.");
		mudar(() => {
			e.nome = eNome();
			e.x = x;
			e.y = y;
		});
	};

	// ------------------------------------------------------------------ saídas

	const saidaSel = source<Saida | undefined>(undefined);
	const sX = source("");
	const sY = source("");
	const sL = source("");
	const sA = source("");
	const sMapa = source("");
	const sChegada = source("");
	effect(() => {
		const s = saidaSel();
		if (!s) return;
		sX(tostring(s.x));
		sY(tostring(s.y));
		sL(tostring(s.largura));
		sA(tostring(s.altura));
		sMapa(s.mapa);
		sChegada(typeIs(s.chegada, "table") ? `${s.chegada[0]},${s.chegada[1]}` : (s.chegada ?? ""));
	});
	const aplicarSaida = () => {
		const s = saidaSel();
		if (!s) return;
		const x = inteiro(sX(), 0, LADO - 1);
		const y = inteiro(sY(), 0, LADO - 1);
		const l = inteiro(sL(), 1, LADO);
		const a = inteiro(sA(), 1, LADO);
		if (x === undefined || y === undefined || l === undefined || a === undefined) return props.aviso("Saída: x, y de 0 a 63; largura e altura de 1 a 64.");
		let chegada: Saida["chegada"];
		const texto = sChegada().gsub("%s", "")[0];
		if (texto !== "") {
			const [cx, cy] = texto.split(",");
			const nx = tonumber(cx);
			const ny = tonumber(cy);
			chegada = nx !== undefined && ny !== undefined ? [nx, ny] : texto;
		}
		mudar(() => {
			s.x = x;
			s.y = y;
			s.largura = l;
			s.altura = a;
			s.mapa = sMapa();
			s.chegada = chegada;
		});
	};

	// ------------------------------------------------------------------ zonas

	const zonaSel = source<ZonaMapa | undefined>(undefined);
	const areaSel = source<[number, number, number, number] | undefined>(undefined);
	const zNome = source("");
	const zProps = source("");
	effect(() => {
		const z = zonaSel();
		areaSel(undefined);
		if (!z) return;
		zNome(z.nome);
		zProps(propsParaTexto(z.props));
	});
	const aplicarZona = () => {
		const z = zonaSel();
		if (!z) return;
		mudar(() => {
			z.nome = zNome();
			z.props = textoParaProps(zProps());
		});
	};
	/** Escolher música ou ambiente numa lista (sem digitar chave=valor): muda a propriedade e aplica. */
	const valorDaProp = (chave: string) => textoParaProps(zProps())[chave] ?? "";
	const escolherProp = (chave: string, valor: string) => {
		const p = textoParaProps(zProps());
		if (valor === "") delete p[chave];
		else p[chave] = valor;
		zProps(propsParaTexto(p));
		aplicarZona();
	};

	// ------------------------------------------------------------------ moradores

	const moradorSel = source<Morador | undefined>(undefined);
	const mNome = source("");
	const mX = source("");
	const mY = source("");
	const mOlhando = source(2);
	const mVisual = source("");
	const mPose = source<Pose>("idle");
	effect(() => {
		const r = moradorSel();
		if (!r) return;
		mNome(r.nome);
		mX(tostring(r.x));
		mY(tostring(r.y));
		mOlhando(r.olhando);
		mVisual(r.visual);
		mPose(r.pose);
	});
	const aplicarMorador = () => {
		const r = moradorSel();
		if (!r) return;
		const x = inteiro(mX(), 0, LADO - 1);
		const y = inteiro(mY(), 0, LADO - 1);
		if (x === undefined || y === undefined) return props.aviso("Morador: x e y de 0 a 63.");
		mudar(() => {
			r.nome = mNome();
			r.x = x;
			r.y = y;
			r.olhando = mOlhando();
			r.visual = mVisual();
			r.pose = mPose();
		});
	};

	// Quando o modelo muda por fora (abrir outro mapa, desfazer), a seleção que não está mais na lista cai.
	effect(() => {
		props.versao();
		const m = modelo().marcadores;
		const e = entradaSel();
		if (e && !m.entradas.includes(e)) entradaSel(undefined);
		const s = saidaSel();
		if (s && !m.saidas.includes(s)) saidaSel(undefined);
		const z = zonaSel();
		if (z && !m.zonas.includes(z)) zonaSel(undefined);
		const r = moradorSel();
		if (r && !m.moradores.includes(r)) moradorSel(undefined);
	});

	// As ações dos botões, vistas de fora (simulacao.ts): cada uma faz o que o clique faria.
	const novaEntrada = () => {
		const nova: Entrada = { nome: "entrada", x: 0, y: 0 };
		mudar((m) => m.entradas.push(nova));
		entradaSel(nova);
		pedirCelula("entrada", (x, y) =>
			mudar(() => {
				nova.x = x;
				nova.y = y;
			}),
		);
		return nova;
	};
	const novaSaida = () => {
		const nova: Saida = { x: 0, y: 0, largura: 1, altura: 1, mapa: "" };
		mudar((m) => m.saidas.push(nova));
		saidaSel(nova);
		pedirRetangulo("saída", (x0, y0, x1, y1) =>
			mudar(() => {
				nova.x = x0;
				nova.y = y0;
				nova.largura = x1 - x0 + 1;
				nova.altura = y1 - y0 + 1;
			}),
		);
		return nova;
	};
	const novaZona = () => {
		const nova: ZonaMapa = { nome: "Sala", areas: [], props: {} };
		mudar((m) => m.zonas.push(nova));
		zonaSel(nova);
		pedirRetangulo("área da zona", (x0, y0, x1, y1) => mudar(() => nova.areas.push([x0, y0, x1, y1])));
		return nova;
	};
	const novoMorador = () => {
		const novo: Morador = { nome: "Morador", x: 0, y: 0, olhando: 2, visual: "", pose: "idle" };
		mudar((m) => m.moradores.push(novo));
		moradorSel(novo);
		pedirCelula("morador", (x, y) =>
			mudar(() => {
				novo.x = x;
				novo.y = y;
			}),
		);
		return novo;
	};
	const posicionarNascimento = () =>
		pedirCelula("nascimento", (x, y) =>
			mudar((m) => {
				m.nascimento = [x, y];
			}),
		);
	if (props.acoes) {
		const texto = (v: unknown) => (typeIs(v, "string") ? v : undefined);
		props.acoes.nascimento = () => posicionarNascimento();
		props.acoes.nova_entrada = () => novaEntrada().nome;
		props.acoes.nova_saida = () => {
			novaSaida();
			return true;
		};
		props.acoes.nova_zona = () => novaZona().nome;
		props.acoes.novo_morador = () => novoMorador().nome;
		/** Os campos da entrada selecionada e "Aplicar". */
		props.acoes.aplicar_entrada = (args) => {
			if (texto(args.nome) !== undefined) eNome(texto(args.nome)!);
			aplicarEntrada();
			return entradaSel();
		};
		/** Os campos da saída selecionada (mapa, chegada) e "Aplicar". */
		props.acoes.aplicar_saida = (args) => {
			if (texto(args.mapa) !== undefined) sMapa(texto(args.mapa)!);
			if (texto(args.chegada) !== undefined) sChegada(texto(args.chegada)!);
			aplicarSaida();
			return saidaSel();
		};
		props.acoes.lista = () => modelo().marcadores;
		props.acoes.aba = (args) => aba(texto(args.id) ?? "nascimento");
	}

	const linhaCampo = (rotulo: string, valor: Vide.Source<string>, aoConfirmar: () => void, ordem: number, largura = 90) => (
		<Linha espaco={4} ordem={ordem}>
			<Legenda texto={rotulo} largura={60} ordem={0} />
			<Campo valor={valor} aoConfirmar={aoConfirmar} largura={new UDim(0, largura)} ordem={1} />
		</Linha>
	);

	return (
		<frame Name="Marcadores" Size={UDim2.fromScale(1, 1)} BackgroundTransparency={1}>
			<frame Name="Topo" Size={new UDim2(1, 0, 0, 30)} BackgroundTransparency={1}>
				<Abas abas={ABAS} aberta={aba} />
			</frame>
			<Lista tamanho={new UDim2(1, 0, 1, -34)} posicao={UDim2.fromOffset(0, 34)}>
				{/* Nascimento */}
				<frame Size={new UDim2(1, 0, 0, 0)} AutomaticSize={Enum.AutomaticSize.Y} BackgroundTransparency={1} Visible={() => aba() === "nascimento"} LayoutOrder={0}>
					<Coluna>
						<Rotulo texto={textoNascimento} ordem={0} />
						<Botao
							texto="Posicionar no canvas"
							principal={true}
							aoClicar={posicionarNascimento}
							ordem={1}
						/>
						<Botao
							texto="Remover"
							aoClicar={() =>
								mudar((m) => {
									m.nascimento = undefined;
								})
							}
							ordem={2}
						/>
						<Rotulo texto="A célula precisa ser piso livre: toda chegada que bloqueia cai nela (12.10)." tom="fraco" ordem={3} />
					</Coluna>
				</frame>
				{/* Entradas */}
				<frame Size={new UDim2(1, 0, 0, 0)} AutomaticSize={Enum.AutomaticSize.Y} BackgroundTransparency={1} Visible={() => aba() === "entradas"} LayoutOrder={1}>
					<Coluna>
						<ListaSelecao
							itens={() => {
								props.versao();
								return [...modelo().marcadores.entradas];
							}}
							texto={(e) => `${e.nome} (${e.x}, ${e.y})`}
							selecionado={entradaSel}
							ordem={0}
						/>
						<Linha espaco={4} ordem={1}>
							<Botao
								texto="Nova"
								aoClicar={novaEntrada}
								ordem={0}
							/>
							<Botao
								texto="Remover"
								desligado={() => entradaSel() === undefined}
								aoClicar={() => {
									const e = entradaSel();
									if (e) mudar((m) => m.entradas.remove(m.entradas.indexOf(e)));
								}}
								ordem={1}
							/>
							<Botao
								texto="Posicionar"
								desligado={() => entradaSel() === undefined}
								aoClicar={() => {
									const e = entradaSel();
									if (e) pedirCelula("entrada", (x, y) => mudar(() => {
										e.x = x;
										e.y = y;
									}));
								}}
								ordem={2}
							/>
						</Linha>
						<Separador ordem={2} />
						{linhaCampo("Nome", eNome, aplicarEntrada, 3, 150)}
						{linhaCampo("x", eX, aplicarEntrada, 4, 60)}
						{linhaCampo("y", eY, aplicarEntrada, 5, 60)}
						<Botao texto="Aplicar" principal={true} desligado={() => entradaSel() === undefined} aoClicar={aplicarEntrada} ordem={6} />
						<Rotulo texto="Nome: minúsculas, números, - e _. Nomes dos mapas de hoje: entrada, porta_casa, porta, porta_dos_fundos." tom="fraco" ordem={7} />
					</Coluna>
				</frame>
				{/* Saídas */}
				<frame Size={new UDim2(1, 0, 0, 0)} AutomaticSize={Enum.AutomaticSize.Y} BackgroundTransparency={1} Visible={() => aba() === "saidas"} LayoutOrder={2}>
					<Coluna>
						<ListaSelecao
							itens={() => {
								props.versao();
								return [...modelo().marcadores.saidas];
							}}
							texto={(s) => `(${s.x}, ${s.y}) ${s.largura}×${s.altura} → ${s.mapa === "" ? "?" : s.mapa}`}
							selecionado={saidaSel}
							ordem={0}
						/>
						<Linha espaco={4} ordem={1}>
							<Botao
								texto="Nova"
								aoClicar={novaSaida}
								ordem={0}
							/>
							<Botao
								texto="Remover"
								desligado={() => saidaSel() === undefined}
								aoClicar={() => {
									const s = saidaSel();
									if (s) mudar((m) => m.saidas.remove(m.saidas.indexOf(s)));
								}}
								ordem={1}
							/>
							<Botao
								texto="Posicionar"
								desligado={() => saidaSel() === undefined}
								aoClicar={() => {
									const s = saidaSel();
									if (s)
										pedirRetangulo("saída", (x0, y0, x1, y1) =>
											mudar(() => {
												s.x = x0;
												s.y = y0;
												s.largura = x1 - x0 + 1;
												s.altura = y1 - y0 + 1;
											}),
										);
								}}
								ordem={2}
							/>
						</Linha>
						<Separador ordem={2} />
						{linhaCampo("x", sX, aplicarSaida, 3, 60)}
						{linhaCampo("y", sY, aplicarSaida, 4, 60)}
						{linhaCampo("largura", sL, aplicarSaida, 5, 60)}
						{linhaCampo("altura", sA, aplicarSaida, 6, 60)}
						{linhaCampo("mapa", sMapa, aplicarSaida, 7, 150)}
						{linhaCampo("chegada", sChegada, aplicarSaida, 8, 150)}
						<Botao texto="Aplicar" principal={true} desligado={() => saidaSel() === undefined} aoClicar={aplicarSaida} ordem={9} />
						<Rotulo texto={'Chegada: o nome de uma entrada do destino, uma célula "x,y" de lá, ou vazio (a entrada "entrada", senão o nascimento).'} tom="fraco" ordem={10} />
					</Coluna>
				</frame>
				{/* Zonas */}
				<frame Size={new UDim2(1, 0, 0, 0)} AutomaticSize={Enum.AutomaticSize.Y} BackgroundTransparency={1} Visible={() => aba() === "zonas"} LayoutOrder={3}>
					<Coluna>
						<ListaSelecao
							itens={() => {
								props.versao();
								return [...modelo().marcadores.zonas];
							}}
							texto={(z) => `${z.nome === "" ? "(sem nome)" : z.nome} — ${z.areas.size()} área(s)`}
							selecionado={zonaSel}
							ordem={0}
						/>
						<Linha espaco={4} ordem={1}>
							<Botao
								texto="Nova"
								aoClicar={novaZona}
								ordem={0}
							/>
							<Botao
								texto="Remover"
								desligado={() => zonaSel() === undefined}
								aoClicar={() => {
									const z = zonaSel();
									if (z) mudar((m) => m.zonas.remove(m.zonas.indexOf(z)));
								}}
								ordem={1}
							/>
						</Linha>
						<Separador ordem={2} />
						{linhaCampo("Nome", zNome, aplicarZona, 3, 150)}
						<Fileira ordem={4} espaco={2}>
							<TextoCurto texto="Música:" tom="fraco" ordem={0} />
							<Botao texto="nenhuma" ativo={() => valorDaProp("musica") === ""} desligado={() => zonaSel() === undefined} aoClicar={() => escolherProp("musica", "")} ordem={1} />
							{musicasDoRegistro().map((m, i) => (
								<Botao texto={m} ativo={() => valorDaProp("musica") === m} desligado={() => zonaSel() === undefined} aoClicar={() => escolherProp("musica", m)} ordem={2 + i} />
							))}
						</Fileira>
						<Fileira ordem={5} espaco={2}>
							<TextoCurto texto="Ambiente:" tom="fraco" ordem={0} />
							<Botao texto="nenhum" ativo={() => valorDaProp("ambiente") === ""} desligado={() => zonaSel() === undefined} aoClicar={() => escolherProp("ambiente", "")} ordem={1} />
							{AMBIENTES.map((a, i) => (
								<Botao texto={a} ativo={() => valorDaProp("ambiente") === a} desligado={() => zonaSel() === undefined} aoClicar={() => escolherProp("ambiente", a)} ordem={2 + i} />
							))}
						</Fileira>
						<Rotulo texto="Outras propriedades, uma por linha (chave=valor):" tom="fraco" ordem={6} />
						<CampoMulti valor={zProps} dica="musica=sala" mono={true} ordem={8} />
						<Botao texto="Aplicar" principal={true} desligado={() => zonaSel() === undefined} aoClicar={aplicarZona} ordem={9} />
						<Separador ordem={10} />
						<Rotulo texto="Áreas da zona:" negrito={true} ordem={11} />
						<ListaSelecao
							itens={() => {
								props.versao();
								const z = zonaSel();
								return z ? [...z.areas] : [];
							}}
							texto={(a) => `[${a[0]}, ${a[1]}] – [${a[2]}, ${a[3]}]`}
							selecionado={areaSel}
							altura={70}
							ordem={12}
						/>
						<Linha espaco={4} ordem={13}>
							<Botao
								texto="Adicionar área"
								desligado={() => zonaSel() === undefined}
								aoClicar={() => {
									const z = zonaSel();
									if (z) pedirRetangulo("área da zona", (x0, y0, x1, y1) => mudar(() => z.areas.push([x0, y0, x1, y1])));
								}}
								ordem={0}
							/>
							<Botao
								texto="Remover área"
								desligado={() => areaSel() === undefined}
								aoClicar={() => {
									const z = zonaSel();
									const a = areaSel();
									if (z && a) mudar(() => z.areas.remove(z.areas.indexOf(a)));
								}}
								ordem={1}
							/>
						</Linha>
					</Coluna>
				</frame>
				{/* Moradores */}
				<frame Size={new UDim2(1, 0, 0, 0)} AutomaticSize={Enum.AutomaticSize.Y} BackgroundTransparency={1} Visible={() => aba() === "moradores"} LayoutOrder={4}>
					<Coluna>
						<ListaSelecao
							itens={() => {
								props.versao();
								return [...modelo().marcadores.moradores];
							}}
							texto={(r) => `${r.nome === "" ? "(sem nome)" : r.nome} (${r.x}, ${r.y}) ${POSES.find((p) => p.valor === r.pose)?.texto ?? r.pose}`}
							selecionado={moradorSel}
							ordem={0}
						/>
						<Linha espaco={4} ordem={1}>
							<Botao
								texto="Novo"
								aoClicar={novoMorador}
								ordem={0}
							/>
							<Botao
								texto="Remover"
								desligado={() => moradorSel() === undefined}
								aoClicar={() => {
									const r = moradorSel();
									if (r) mudar((m) => m.moradores.remove(m.moradores.indexOf(r)));
								}}
								ordem={1}
							/>
							<Botao
								texto="Posicionar"
								desligado={() => moradorSel() === undefined}
								aoClicar={() => {
									const r = moradorSel();
									if (r)
										pedirCelula("morador", (x, y) =>
											mudar(() => {
												r.x = x;
												r.y = y;
												// Sentado num assento conhecido, propõe o lado do assento (12.20).
												const topo = modelo().topo(x, y);
												const olhar = topo && r.pose === "sit" ? olharDoAssento(topo) : undefined;
												if (olhar !== undefined) r.olhando = olhar;
											}),
										);
								}}
								ordem={2}
							/>
						</Linha>
						<Separador ordem={2} />
						{linhaCampo("Nome", mNome, aplicarMorador, 3, 150)}
						{linhaCampo("x", mX, aplicarMorador, 4, 60)}
						{linhaCampo("y", mY, aplicarMorador, 5, 60)}
						<Ciclo rotulo="Olhando" opcoes={OLHARES} valor={mOlhando} ordem={6} />
						<Ciclo rotulo="Pose" opcoes={POSES} valor={mPose} ordem={7} />
						<Rotulo texto="Visual (texto de encodeSavedLook: gênero|cabeça|corpo|cores|estilos):" tom="fraco" ordem={8} />
						<CampoMulti valor={mVisual} dica="1|aly2|beasbody|-1,3368652,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1|oo" mono={true} altura={46} ordem={9} />
						<Botao texto="Aplicar" principal={true} desligado={() => moradorSel() === undefined} aoClicar={aplicarMorador} ordem={10} />
						<Rotulo texto="Deitado: a célula precisa ser cama (tipo 4 ou 5); sentado: assento (tipo 3). A célula bloqueia para os outros." tom="fraco" ordem={11} />
					</Coluna>
				</frame>
			</Lista>
		</frame>
	);
}
