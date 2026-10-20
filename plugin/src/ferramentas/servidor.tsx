// Servidor: o estado do Studio (edição, Run, Play) com Run/Pause/Stop, os atributos de desenvolvimento do
// Workspace (InteriorTeste, célula, AcoesTeste, painel de orçamento, prévia de celular, painel para todos, lugar
// da casa, hora, desvio do relógio) com Ctrl+Z, a conferência do place (Fase 0 antiga fora do lugar, pastas TS,
// Rojo conectado), o filtro do Output pelos prefixos do jogo e, durante o Play, o mapa e a célula de cada
// jogador e o "teleportar" (deixa InteriorTeste e InteriorTesteCelula prontos para o próximo teste).
//
// Lógica em plugin/src/servidor/: execucao.ts, atributos.ts, place.ts, output.ts, teleporte.ts.
//
// Desde a janela única (2026-10-20) isto é o "Avançado" da seção Testar (ferramentas/testar.tsx): as abas
// Execução, Atributos, Place e Output, montadas dentro dela. Quem registra as ações é o Testar.
import Vide, { cleanup, effect, For, source, untrack } from "@rbxts/vide";
import { mapas as mapasConhecidos } from "../estado";
import {
	ATRIBUTO_INTERIOR_CELULA,
	ATRIBUTO_INTERIOR_TESTE,
	ATRIBUTOS,
	CELULARES,
	DefinicaoAtributo,
	fonteAtributo,
	gravarAtributo,
	lerCelula,
	lerCelular,
	textoDoValor,
} from "../servidor/atributos";
import { descreverJogadores, descricaoModo, jogadores, Modo, parar, pausar, rodar } from "../servidor/execucao";
import { filtrar, Filtro, ligarOutput, limparMensagens, mensagens, Nivel as NivelOutput, PREFIXOS, textoDasMensagens, versaoOutput } from "../servidor/output";
import { resumirPlace, Verificacao, verificarPlace } from "../servidor/place";
import { descartarPendente, pendente, teleportar } from "../servidor/teleporte";
import { copiarTexto } from "../ui/copiar";
import { AcaoSimulada, argTexto } from "../simulacao";
import { Abas, AreaTexto, Botao, Campo, Coluna, Lista, Rotulo, Separador, Tom } from "../ui/kit";
import { Aviso, Bloco, Etiqueta, Fileira, Interruptor, Preenche, TextoCurto } from "../ui/kit";
import { widgetVisivel } from "../widget";

const ABAS = [
	{ id: "execucao", titulo: "Execução" },
	{ id: "atributos", titulo: "Atributos" },
	{ id: "place", titulo: "Place" },
	{ id: "output", titulo: "Output" },
];

/** De quanto em quanto tempo o painel relê o modo, os jogadores e o teleporte pendente, em segundos. */
const INTERVALO = 1;

function tomDoNivel(nivel: Verificacao["nivel"]): Tom {
	if (nivel === "erro") return "erro";
	if (nivel === "aviso") return "aviso";
	if (nivel === "ok") return "ok";
	return "fraco";
}

function tomDoModo(modo: Modo): Tom {
	if (modo === "edicao") return "normal";
	if (modo === "desconhecido") return "aviso";
	return "ok";
}

// ------------------------------------------------------------------ aba Execução

function AbaExecucao(props: { plugin: Plugin; modo: () => Modo; visivel: () => boolean; mensagem: Vide.Source<string> }) {
	const textoJogadores = source("");
	const textoPendente = source("");
	const campoMapa = source("");
	const campoCelula = source("");

	const atualizar = () => {
		textoJogadores(descreverJogadores(jogadores(), props.modo()));
		const p = pendente(props.plugin);
		textoPendente(p ? `Teleporte guardado para o próximo teste: ${p.mapa}${p.celula !== "" ? ` em ${p.celula}` : ""}.` : "");
	};
	let vivo = true;
	cleanup(() => {
		vivo = false;
	});
	task.spawn(() => {
		while (vivo) {
			if (props.visivel() && widgetVisivel("servidor")) {
				const [ok] = pcall(atualizar);
				if (!ok) textoJogadores("(não deu para ler os jogadores)");
			}
			task.wait(INTERVALO);
		}
	});

	const comando = (acao: () => { ok: boolean; mensagem: string }) => {
		const r = acao();
		props.mensagem(r.mensagem);
		if (!r.ok) warn(`[Diorama] ${r.mensagem}`);
	};

	const usarMapaDoJogador = () => {
		const lista = jogadores();
		const j = lista.find((x) => x.mapa !== undefined);
		if (!j || j.mapa === undefined) {
			props.mensagem("Nenhum jogador com mapa ainda.");
			return;
		}
		campoMapa(j.mapa);
		campoCelula(j.celula ?? "");
	};

	const teleportarAgora = () => {
		const mapa = campoMapa().gsub("^%s+", "")[0].gsub("%s+$", "")[0];
		if (mapa === "") {
			props.mensagem("Diga o id do mapa (ou escolha um da lista).");
			return;
		}
		const celula = campoCelula().gsub("%s", "")[0];
		if (celula !== "" && lerCelula(celula) === undefined) {
			props.mensagem(`A célula precisa ser "x,y"; veio "${celula}".`);
			return;
		}
		const r = teleportar(props.plugin, mapa, celula);
		props.mensagem(r.mensagem);
		atualizar();
	};

	return (
		<Bloco visivel={props.visivel} tamanho={UDim2.fromScale(1, 1)} nome="Execucao">
			<Lista tamanho={UDim2.fromScale(1, 1)}>
				<Rotulo texto={() => descricaoModo(props.modo())} tom={() => tomDoModo(props.modo())} negrito={true} ordem={0} />
				<Fileira ordem={1}>
					<Botao texto="Run (sem jogador)" aoClicar={() => comando(rodar)} desligado={() => props.modo() !== "edicao"} principal={true} ordem={0} />
					<Botao texto="Pausar" aoClicar={() => comando(pausar)} desligado={() => props.modo() === "edicao"} ordem={1} />
					<Botao texto="Stop" aoClicar={() => comando(parar)} desligado={() => props.modo() === "edicao"} ordem={2} />
				</Fileira>
				<Rotulo
					texto="O Play com jogador (F5) não tem API para plugins: use o botão do Studio ou o start_stop_play do MCP. O Run roda só o servidor."
					tom="fraco"
					ordem={2}
				/>
				<Separador ordem={3} />
				<Rotulo texto="Jogadores (atributos Mapa, MapaCelula, MapaDono, MapaLugar do MapService)" negrito={true} ordem={4} />
				<Rotulo texto={textoJogadores} mono={true} ordem={5} />
				<Separador ordem={6} />
				<Rotulo texto="Teleportar (próximo teste)" negrito={true} ordem={7} />
				<Rotulo
					texto="O jogo lê InteriorTeste e InteriorTesteCelula uma vez, no começo: isto deixa os dois prontos para o próximo Play. Na edição grava na hora; no Play guarda e a edição aplica."
					tom="fraco"
					ordem={8}
				/>
				<Fileira ordem={9}>
					<TextoCurto texto="Mapa:" ordem={0} />
					<Campo valor={campoMapa} dica="id do mapa" largura={new UDim(0, 200)} ordem={1} />
					<TextoCurto texto="Célula:" ordem={2} />
					<Campo valor={campoCelula} dica="x,y (opcional)" largura={new UDim(0, 110)} ordem={3} />
				</Fileira>
				<Fileira ordem={10}>
					<For each={mapasConhecidos}>
						{(mapa, indice) => <Botao texto={mapa.id} ativo={() => campoMapa() === mapa.id} aoClicar={() => campoMapa(mapa.id)} ordem={indice()} />}
					</For>
				</Fileira>
				<Fileira ordem={11}>
					<Botao texto="Usar o mapa do jogador" aoClicar={usarMapaDoJogador} desligado={() => props.modo() === "edicao"} ordem={0} />
					<Botao texto="Teleportar" aoClicar={teleportarAgora} principal={true} ordem={1} />
					<Botao
						texto="Descartar pedido guardado"
						aoClicar={() => {
							descartarPendente(props.plugin);
							atualizar();
							props.mensagem("Pedido descartado.");
						}}
						ordem={2}
					/>
				</Fileira>
				<Aviso texto={textoPendente} tom="ok" ordem={12} />
			</Lista>
		</Bloco>
	);
}

// ------------------------------------------------------------------ aba Atributos

function EditorAtributo(props: { def: DefinicaoAtributo; ordem: number; mensagem: Vide.Source<string> }) {
	const { def } = props;
	const valor = fonteAtributo(def.nome);
	const campo = source("");

	const gravar = (novo: AttributeValue | undefined) => {
		const r = gravarAtributo(def.nome, novo);
		props.mensagem(r.mensagem ?? (r.ok ? `${def.nome} = ${textoDoValor(novo)}.` : `erro ao gravar ${def.nome}`));
	};
	const gravarCampo = () => {
		const texto = campo().gsub("^%s+", "")[0].gsub("%s+$", "")[0];
		if (texto === "") {
			gravar(undefined);
			return;
		}
		if (def.tipo === "numero") {
			const n = tonumber(texto);
			if (n === undefined) {
				props.mensagem(`${def.nome}: "${texto}" não é um número.`);
				return;
			}
			gravar(n);
			return;
		}
		if (def.tipo === "celular") {
			if (lerCelular(texto) === undefined) {
				props.mensagem(`${def.nome}: escreva "LxA" em pontos, pelo menos 200x150 (veio "${texto}").`);
				return;
			}
			gravar(texto);
			return;
		}
		if (def.nome === ATRIBUTO_INTERIOR_CELULA && lerCelula(texto) === undefined) {
			props.mensagem(`${def.nome}: escreva "x,y" (veio "${texto}").`);
			return;
		}
		gravar(texto);
	};

	const comCampo = def.tipo !== "booleano";
	return (
		<Bloco ordem={props.ordem} espaco={2}>
			<Rotulo texto={`${def.titulo} (${def.nome})`} negrito={true} ordem={0} />
			<Rotulo texto={def.descricao} tom="fraco" ordem={1} />
			<Rotulo texto={() => `Agora: ${textoDoValor(valor())}`} ordem={2} />
			{def.tipo === "booleano" ? (
				<Fileira ordem={3}>
					<Interruptor ligado={() => valor() === true} aoMudar={(ligado) => gravar(ligado ? true : undefined)} ordem={0} />
				</Fileira>
			) : undefined}
			{def.tipo === "celular" ? (
				<Fileira ordem={3}>
					<Botao texto="Desligar" ativo={() => valor() === undefined} aoClicar={() => gravar(undefined)} ordem={0} />
					{CELULARES.map((c, i) => (
						<Botao texto={c.titulo} ativo={() => valor() === c.valor} aoClicar={() => gravar(c.valor)} ordem={1 + i} />
					))}
				</Fileira>
			) : undefined}
			{def.nome === ATRIBUTO_INTERIOR_TESTE ? (
				<Fileira ordem={3}>
					<Botao texto="Desligar" ativo={() => valor() === undefined} aoClicar={() => gravar(undefined)} ordem={0} />
					<For each={mapasConhecidos}>
						{(mapa, indice) => <Botao texto={mapa.id} ativo={() => valor() === mapa.id} aoClicar={() => gravar(mapa.id)} ordem={1 + indice()} />}
					</For>
				</Fileira>
			) : undefined}
			{comCampo ? (
				<Fileira ordem={4}>
					<Campo valor={campo} dica={def.dica} largura={new UDim(0, 180)} aoConfirmar={gravarCampo} ordem={0} />
					<Botao texto="Gravar" aoClicar={gravarCampo} ordem={1} />
					<Botao texto="Limpar" aoClicar={() => gravar(undefined)} ordem={2} />
				</Fileira>
			) : undefined}
			<Separador ordem={5} />
		</Bloco>
	);
}

function AbaAtributos(props: { visivel: () => boolean; mensagem: Vide.Source<string> }) {
	return (
		<Bloco visivel={props.visivel} tamanho={UDim2.fromScale(1, 1)} nome="Atributos">
			<Rotulo
				texto="Atributos do Workspace que o jogo lê. Cada gravação é um passo do histórico (Ctrl+Z desfaz). Durante o Play a mudança vale só até o Stop."
				tom="fraco"
				ordem={0}
			/>
			<Preenche ordem={1}>
				<Lista tamanho={UDim2.fromScale(1, 1)}>
					{ATRIBUTOS.map((def, i) => (
						<EditorAtributo def={def} ordem={i} mensagem={props.mensagem} />
					))}
				</Lista>
			</Preenche>
		</Bloco>
	);
}

// ------------------------------------------------------------------ aba Place

function AbaPlace(props: { visivel: () => boolean }) {
	const verificacoes = source<Verificacao[]>([]);
	const resumo = source("");
	const conferir = () => {
		const lista = verificarPlace();
		verificacoes(lista);
		resumo(`${resumirPlace(lista)} (${os.date("%H:%M:%S")})`);
	};
	conferir();
	return (
		<Bloco visivel={props.visivel} tamanho={UDim2.fromScale(1, 1)} nome="Place">
			<Fileira ordem={0}>
				<Botao texto="Conferir de novo" aoClicar={conferir} principal={true} ordem={0} />
				<TextoCurto texto={resumo} ordem={1} />
			</Fileira>
			<Preenche ordem={1}>
				<Lista tamanho={UDim2.fromScale(1, 1)} espaco={4}>
					<For each={verificacoes}>
						{(v, indice) => (
							<Bloco ordem={indice()} espaco={1}>
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
		</Bloco>
	);
}

// ------------------------------------------------------------------ aba Output

function AbaOutput(props: { visivel: () => boolean; mensagem: Vide.Source<string>; acoes?: Record<string, AcaoSimulada> }) {
	ligarOutput();
	const soDoJogo = source(true);
	const prefixos = source<ReadonlySet<string>>(new Set<string>());
	const niveis = source<ReadonlySet<NivelOutput>>(new Set<NivelOutput>(["info", "aviso", "erro"]));
	const contem = source("");
	const copia = source("");

	const filtro = (): Filtro => ({ prefixos: prefixos(), soDoJogo: soDoJogo(), niveis: niveis(), contem: contem() });
	const filtradas = () => filtrar(mensagens(), filtro());
	const texto = () => textoDasMensagens(filtradas());

	// O texto mostrado é refeito em lote (a cada 0,25 s, no máximo), e só com a aba e o widget à vista: antes era
	// refeito a cada linha do Output, mesmo com o widget fechado, e um jogo que imprime muito travava o Studio.
	const textoMostrado = source("");
	const contagem = source("");
	let revisaoFiltro = 0;
	effect(() => {
		filtro();
		revisaoFiltro++;
	});
	let vivo = true;
	cleanup(() => {
		vivo = false;
	});
	task.spawn(() => {
		let versaoMostrada = -1;
		let filtroMostrado = -1;
		while (vivo) {
			const versao = untrack(versaoOutput);
			if (props.visivel() && widgetVisivel("servidor") && (versao !== versaoMostrada || revisaoFiltro !== filtroMostrado)) {
				versaoMostrada = versao;
				filtroMostrado = revisaoFiltro;
				const lista = untrack(filtradas);
				textoMostrado(textoDasMensagens(lista));
				contagem(`${lista.size()} de ${untrack(mensagens).size()} mensagem(ns)`);
			}
			task.wait(0.25);
		}
	});
	if (props.acoes) {
		props.acoes.output = (args) => {
			if (typeIs(args.contem, "string")) contem(args.contem);
			task.wait(0.6);
			return { contagem: contagem(), linhas: textoMostrado() === "" ? 0 : textoMostrado().split("\n").size() };
		};
	}

	const alternarPrefixo = (p: string) => {
		const novo = new Set<string>([...prefixos()]);
		if (novo.has(p)) novo.delete(p);
		else novo.add(p);
		prefixos(novo);
	};
	const alternarNivel = (n: NivelOutput) => {
		const novo = new Set<NivelOutput>([...niveis()]);
		if (novo.has(n)) novo.delete(n);
		else novo.add(n);
		niveis(novo);
	};
	const copiar = () => {
		const t = texto();
		if (copiarTexto(t)) {
			props.mensagem("Output copiado para a área de transferência.");
			copia("");
		} else {
			copia(t);
			props.mensagem("O Studio não tem setclipboard: o texto está selecionável abaixo (clique, Ctrl+A, Ctrl+C).");
		}
	};

	return (
		<Bloco visivel={props.visivel} tamanho={UDim2.fromScale(1, 1)} nome="Output">
			<Fileira ordem={0}>
				<Interruptor ligado={soDoJogo} aoMudar={(v) => soDoJogo(v)} textoLigado="Só prefixos do jogo" textoDesligado="Tudo" ordem={0} />
				<Interruptor ligado={() => niveis().has("info")} aoMudar={() => alternarNivel("info")} textoLigado="Info" textoDesligado="Info" ordem={1} />
				<Interruptor ligado={() => niveis().has("aviso")} aoMudar={() => alternarNivel("aviso")} textoLigado="Avisos" textoDesligado="Avisos" ordem={2} />
				<Interruptor ligado={() => niveis().has("erro")} aoMudar={() => alternarNivel("erro")} textoLigado="Erros" textoDesligado="Erros" ordem={3} />
			</Fileira>
			<Fileira ordem={1} espaco={2}>
				<Botao texto="Todos" ativo={() => prefixos().size() === 0} aoClicar={() => prefixos(new Set<string>())} ordem={0} />
				{PREFIXOS.map((p, i) => (
					<Botao texto={p} ativo={() => prefixos().has(p)} aoClicar={() => alternarPrefixo(p)} ordem={1 + i} />
				))}
			</Fileira>
			<Fileira ordem={2}>
				<Campo valor={contem} dica="contém..." largura={new UDim(0, 160)} ordem={0} />
				<Botao texto="Limpar" aoClicar={limparMensagens} ordem={1} />
				<Botao texto="Copiar" aoClicar={copiar} ordem={2} />
				<TextoCurto texto={contagem} tom="fraco" ordem={3} />
			</Fileira>
			<Preenche ordem={3}>
				<AreaTexto texto={() => (copia() !== "" ? copia() : textoMostrado())} tamanho={UDim2.fromScale(1, 1)} />
			</Preenche>
		</Bloco>
	);
}

// ------------------------------------------------------------------ o Avançado do Testar

/**
 * As quatro abas de antes (Execução, Atributos, Place, Output). `modo` e `mensagem` vêm do Testar, que relê o modo
 * do Studio; `acoes` recebe `aba` e `output` (o comando `simular` da seção Testar).
 */
export function ServidorAvancado(props: { plugin: Plugin; modo: () => Modo; mensagem: Vide.Source<string>; acoes: Record<string, AcaoSimulada>; aba?: Vide.Source<string> }) {
	const aba = props.aba ?? source("execucao");
	props.acoes.aba = (args) => aba(argTexto(args, "id"));
	return (
		<Coluna tamanho={UDim2.fromScale(1, 1)} nome="ServidorAvancado">
			<Bloco ordem={0}>
				<Abas abas={ABAS} aberta={aba} />
			</Bloco>
			<Preenche ordem={1}>
				<AbaExecucao plugin={props.plugin} modo={props.modo} visivel={() => aba() === "execucao"} mensagem={props.mensagem} />
				<AbaAtributos visivel={() => aba() === "atributos"} mensagem={props.mensagem} />
				<AbaPlace visivel={() => aba() === "place"} />
				<AbaOutput visivel={() => aba() === "output"} mensagem={props.mensagem} acoes={props.acoes} />
			</Preenche>
		</Coluna>
	);
}
