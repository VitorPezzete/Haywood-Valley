// Testar (janela única, 2026-10-20): o que antes era a ferramenta Servidor, reduzido a um botão. "Testar este mapa"
// salva o mapa (se preciso), gera o módulo do jogo (src/shared/interiors/<mapa>.ts), grava InteriorTeste e
// InteriorTesteCelula no Workspace (a última célula clicada no canvas, senão o nascimento) e diz para apertar Play.
// O Play com jogador não tem API para plugins: o autor aperta F5.
//
// "Testar onde o jogador está" (durante o Play): guarda o mapa e a célula do jogador para o próximo teste
// (servidor/teleporte.ts). As abas de antes (Execução, Atributos, Place, Output) ficam no Avançado
// (ferramentas/servidor.tsx).
import Vide, { cleanup, mount, source } from "@rbxts/vide";
import { RunService } from "@rbxts/services";
import { avancado } from "../config";
import { mapaAberto, recarregarMapas, statusPonte } from "../estado";
import { controleMapas } from "../mapas/controle";
import * as ponte from "../ponte";
import { ATRIBUTO_INTERIOR_CELULA, ATRIBUTO_INTERIOR_TESTE, fonteAtributo, gravarAtributo, textoDoValor } from "../servidor/atributos";
import { descricaoModo, jogadores, Modo, modoAtual } from "../servidor/execucao";
import { aplicarPendente, pendente, teleportar } from "../servidor/teleporte";
import { AcaoSimulada, registrarAcoes } from "../simulacao";
import { irAoInicio } from "../ui/janela";
import { AreaTexto, Botao, Coluna, Fileira, Painel, Preenche, Rotulo, Titulo, Tom } from "../ui/kit";
import { BotaoAvancado, BotaoGrande, Cartao, Vazio } from "../ui/simples";
import { ContextoSecao, garantirMontada, widgetVisivel } from "../widget";
import { ServidorAvancado } from "./servidor";

/** De quanto em quanto tempo o painel relê o modo do Studio e o teleporte pendente, em segundos. */
const INTERVALO = 1;

function tomDoModo(modo: Modo): Tom {
	if (modo === "edicao") return "normal";
	if (modo === "desconhecido") return "aviso";
	return "ok";
}

/** Espera o editor de mapas registrar o controle (monta a seção Mapa, se preciso). Yielda. */
function controleDoEditor() {
	if (!controleMapas()) garantirMontada("mapa");
	const limite = os.clock() + 5;
	let c = controleMapas();
	while (!c && os.clock() < limite) {
		task.wait(0.05);
		c = controleMapas();
	}
	return c;
}

export function PainelTestar(props: { plugin: Plugin }) {
	const modo = source<Modo>(modoAtual());
	const mensagem = source("");
	const tom = source<Tom>("normal");
	const log = source("");
	const testando = source(false);
	const textoPendente = source("");
	const valorTeste = fonteAtributo(ATRIBUTO_INTERIOR_TESTE);
	const valorCelula = fonteAtributo(ATRIBUTO_INTERIOR_CELULA);
	const avisar = (texto: string, t: Tom = "normal") => {
		mensagem(texto);
		tom(t);
	};

	// Relê o modo (o Studio não avisa o plugin quando entra no Play) e aplica o teleporte guardado na edição.
	let vivo = true;
	cleanup(() => {
		vivo = false;
	});
	task.spawn(() => {
		while (vivo) {
			if (widgetVisivel("testar")) {
				const atual = modoAtual();
				if (atual !== modo()) modo(atual);
				const aplicado = aplicarPendente(props.plugin);
				if (aplicado !== undefined) avisar(aplicado, "ok");
				const p = pendente(props.plugin);
				textoPendente(p ? `Guardado para o próximo teste: ${p.mapa}${p.celula !== "" ? ` em ${p.celula}` : ""}.` : "");
			}
			task.wait(INTERVALO);
		}
	});
	task.spawn(() => recarregarMapas());

	/** Salva (se preciso), gera e grava os atributos. Yielda. `gerar: false` pula o gerador (o autoteste). */
	const testarEsteMapa = (gerar = true): { ok: boolean; mensagem: string } => {
		if (testando()) return { ok: false, mensagem: "Já está testando." };
		testando(true);
		const terminar = (ok: boolean, texto: string, t: Tom) => {
			testando(false);
			avisar(texto, t);
			return { ok, mensagem: texto };
		};
		const c = controleDoEditor();
		const id = mapaAberto();
		if (!c || id === undefined) return terminar(false, "Abra um mapa primeiro.", "aviso");
		if (c.sujo()) {
			avisar("Salvando o mapa…", "fraco");
			const s = c.salvar();
			if (!s.ok) return terminar(false, `Não salvou: ${s.mensagem}`, "erro");
		}
		if (gerar) {
			avisar("Gerando o mapa para o jogo…", "fraco");
			const r = ponte.gerarMapa(id);
			if (!r.ok) return terminar(false, `Não gerou: ${r.erro}`, "erro");
			log(r.valor.log);
			if (!r.valor.ok) return terminar(false, "O gerador falhou. Abra o Avançado para ver o log.", "erro");
		}
		const celula = c.celulaDeTeste();
		const r1 = gravarAtributo(ATRIBUTO_INTERIOR_TESTE, id);
		const r2 = gravarAtributo(ATRIBUTO_INTERIOR_CELULA, celula ? `${celula[0]},${celula[1]}` : undefined);
		if (!r1.ok || !r2.ok) return terminar(false, r1.mensagem ?? r2.mensagem ?? "Não gravou os atributos.", "erro");
		const rojo = statusPonte()?.rojo;
		const dica = rojo && !rojo.ligado ? " O Rojo está desligado: o jogo só recebe o mapa gerado com ele ligado (npm run serve e Connect)." : "";
		return terminar(true, `Pronto: aperte Play (F5). O jogo começa em "${id}"${celula ? `, na célula (${celula[0]}, ${celula[1]})` : ""}.${dica}`, dica === "" ? "ok" : "aviso");
	};

	const pararTeste = () => {
		gravarAtributo(ATRIBUTO_INTERIOR_TESTE, undefined);
		gravarAtributo(ATRIBUTO_INTERIOR_CELULA, undefined);
		if (RunService.IsRunning()) {
			// `RunService.Stop` falta nos tipos do @rbxts/types (segurança de plugin); existe no Studio.
			const [ok] = pcall(() => (RunService as unknown as { Stop(this: unknown): void }).Stop());
			avisar(ok ? "Teste desligado e sessão parada." : "Teste desligado; pare a sessão no Studio (Stop).", ok ? "ok" : "aviso");
		} else avisar("Teste desligado: o próximo Play começa no mapa normal do jogo.", "ok");
	};

	const ondeOJogadorEsta = () => {
		const j = jogadores().find((x) => x.mapa !== undefined);
		if (!j || j.mapa === undefined) return avisar("Nenhum jogador num mapa ainda.", "aviso");
		const r = teleportar(props.plugin, j.mapa, j.celula ?? "");
		avisar(r.ok ? `Guardado: o próximo teste começa em "${j.mapa}"${j.celula !== undefined ? ` (${j.celula})` : ""}. Pare o Play.` : r.mensagem, r.ok ? "ok" : "erro");
	};

	const linhaAtual = () => {
		const v = valorTeste();
		if (v === undefined) return "Nenhum teste ligado: o Play abre o jogo normal.";
		const c = valorCelula();
		return `Teste ligado: o Play abre "${textoDoValor(v)}"${c !== undefined ? ` na célula ${textoDoValor(c)}` : ""}.`;
	};

	// As ações vistas de fora (simulacao.ts); o Avançado acrescenta `aba` e `output`.
	const acoes: Record<string, AcaoSimulada> = {
		estado: () => ({ modo: modo(), mapa: mapaAberto(), mensagem: mensagem(), teste: valorTeste(), celula: valorCelula() }),
		testar: (args) => testarEsteMapa(args.gerar !== false),
		parar_teste: () => {
			pararTeste();
			return mensagem();
		},
		/** "Guardar onde o jogador está" (só durante o Play, na sessão do servidor). */
		guardar_jogador: () => {
			if (modoAtual() === "edicao") error("só durante o Play", 0);
			ondeOJogadorEsta();
			return { mensagem: mensagem(), pendente: textoPendente() };
		},
	};
	cleanup(registrarAcoes("testar", acoes));

	return (
		<Painel>
			<Coluna tamanho={UDim2.fromScale(1, 1)}>
				<Titulo texto="Testar no jogo" ordem={0} />
				<Rotulo texto={() => descricaoModo(modo())} tom={() => tomDoModo(modo())} ordem={1} />
				<Vazio
					texto="Abra um mapa para testar."
					botao="Abrir mapa"
					aoClicar={() => irAoInicio("abrir")}
					visivel={() => mapaAberto() === undefined}
					ordem={2}
				/>
				<BotaoGrande
					titulo={() => (testando() ? "Preparando…" : mapaAberto() !== undefined ? `Testar "${mapaAberto()}"` : "Testar este mapa")}
					explicacao="Salva, gera para o jogo e deixa o Play pronto. Depois aperte F5."
					principal={true}
					desligado={() => testando() || mapaAberto() === undefined || modo() !== "edicao"}
					aoClicar={() => task.spawn(testarEsteMapa, true)}
					ordem={3}
					nome="TestarEsteMapa"
				/>
				<Rotulo texto={mensagem} tom={tom} ordem={4} />
				<Rotulo texto={() => (modo() !== "edicao" ? "Durante o Play, pare a sessão para testar de novo." : "")} tom="fraco" ordem={5} />
				<Fileira ordem={6}>
					<Botao texto="Desligar o teste" aoClicar={pararTeste} ordem={0} />
					<Botao texto="Guardar onde o jogador está" desligado={() => modo() === "edicao"} aoClicar={ondeOJogadorEsta} ordem={1} />
				</Fileira>
				<Cartao ordem={7}>
					<Rotulo texto={linhaAtual} ordem={0} />
					<Rotulo texto={textoPendente} tom="ok" ordem={1} />
				</Cartao>
				<BotaoAvancado ordem={8} rotulo="Avançado: atributos, place, Output" />
				<Preenche ordem={9} visivel={avancado}>
					<ServidorAvancado plugin={props.plugin} modo={modo} mensagem={mensagem} acoes={acoes} />
				</Preenche>
				<Preenche ordem={10} visivel={() => avancado() && log() !== ""}>
					<AreaTexto texto={log} tamanho={UDim2.fromScale(1, 1)} />
				</Preenche>
			</Coluna>
		</Painel>
	);
}

export function montar(quadro: Frame, contexto: ContextoSecao) {
	return mount(() => <PainelTestar plugin={contexto.plugin} />, quadro);
}
