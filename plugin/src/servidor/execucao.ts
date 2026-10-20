// Estado de execução do Studio (edição, Run, Play) e os botões Run/Stop. O RunService tem `Run()`, `Pause()` e
// `Stop()` para plugins (PluginSecurity): `Run()` entra no modo Run (o servidor roda, sem jogador); não há API
// pública para o Play com jogador (F5), que fica para o botão do Studio ou para o MCP (start_stop_play).
//
// Durante o Play o Studio carrega o plugin de novo dentro da sessão (cliente e servidor), além do que continua
// na edição. Qual instância recebe o clique é o Studio quem decide; por isso cada função confere o modo na hora.
import { Players, RunService } from "@rbxts/services";

export type Modo = "edicao" | "run" | "cliente" | "servidor" | "desconhecido";

/** Em que modo esta instância do plugin está. */
export function modoAtual(): Modo {
	const [ok, modo] = pcall((): Modo => {
		if (RunService.IsEdit()) return "edicao";
		if (RunService.IsRunMode()) return "run";
		if (RunService.IsRunning()) return RunService.IsClient() ? "cliente" : "servidor";
		return "desconhecido";
	});
	return ok ? (modo as Modo) : "desconhecido";
}

export function descricaoModo(modo: Modo): string {
	switch (modo) {
		case "edicao":
			return "Editando (nada roda).";
		case "run":
			return "Run: o servidor roda, sem jogador.";
		case "cliente":
			return "Play: esta é a sessão do cliente (há jogador).";
		case "servidor":
			return "Play: esta é a sessão do servidor.";
		default:
			return "Modo desconhecido.";
	}
}

export interface ResultadoComando {
	ok: boolean;
	mensagem: string;
}

/** Entra no modo Run (RunService:Run()). Só faz sentido na edição. */
export function rodar(): ResultadoComando {
	if (modoAtual() !== "edicao") return { ok: false, mensagem: "Já está rodando; pare primeiro." };
	const [ok, erro] = pcall(() => RunService.Run());
	if (!ok) return { ok: false, mensagem: `RunService:Run() falhou: ${tostring(erro)}. Use o botão Run do Studio.` };
	return { ok: true, mensagem: "Run pedido ao Studio." };
}

/** Para a sessão (RunService:Stop()). */
export function parar(): ResultadoComando {
	const [ok, erro] = pcall(() => RunService.Stop());
	if (!ok) return { ok: false, mensagem: `RunService:Stop() falhou: ${tostring(erro)}. Use o botão Stop do Studio.` };
	return { ok: true, mensagem: "Stop pedido ao Studio." };
}

/** Pausa a sessão (RunService:Pause()). */
export function pausar(): ResultadoComando {
	const [ok, erro] = pcall(() => RunService.Pause());
	if (!ok) return { ok: false, mensagem: `RunService:Pause() falhou: ${tostring(erro)}.` };
	return { ok: true, mensagem: "Pause pedido ao Studio." };
}

export interface InfoJogador {
	nome: string;
	/** É o jogador local desta sessão (só no cliente). */
	local: boolean;
	mapa?: string;
	celula?: string;
	dono?: number;
	lugar?: number;
	/** Posição do personagem, se existe. */
	posicao?: Vector3;
}

function textoOuNada(valor: unknown): string | undefined {
	return typeIs(valor, "string") ? valor : undefined;
}

function numeroOuNada(valor: unknown): number | undefined {
	return typeIs(valor, "number") ? valor : undefined;
}

/**
 * Os jogadores da sessão com os atributos que o MapService grava (`Mapa`, `MapaCelula`, `MapaDono`, `MapaLugar`).
 * Na edição não há jogador; no Play, o jogador local vem primeiro.
 */
export function jogadores(): InfoJogador[] {
	const lista = new Array<InfoJogador>();
	const [ok] = pcall(() => {
		// Na edição e no servidor LocalPlayer é nil; os tipos dizem Player, então o cast.
		const localPlayer = Players.LocalPlayer as Player | undefined;
		for (const jogador of Players.GetPlayers()) {
			const personagem = jogador.Character;
			const raiz = personagem?.FindFirstChild("HumanoidRootPart") as BasePart | undefined;
			lista.push({
				nome: jogador.Name,
				local: jogador === localPlayer,
				mapa: textoOuNada(jogador.GetAttribute("Mapa")),
				celula: textoOuNada(jogador.GetAttribute("MapaCelula")),
				dono: numeroOuNada(jogador.GetAttribute("MapaDono")),
				lugar: numeroOuNada(jogador.GetAttribute("MapaLugar")),
				posicao: raiz?.Position,
			});
		}
	});
	if (!ok) return [];
	lista.sort((a, b) => (a.local && !b.local ? true : false));
	return lista;
}

/** Uma linha por jogador, para o painel. */
export function descreverJogadores(lista: InfoJogador[], modo: Modo): string {
	if (modo === "edicao") return "Na edição não há jogador. Dê Play para ver o mapa e a célula.";
	if (lista.size() === 0) return modo === "run" ? "Run: sem jogador." : "Nenhum jogador na sessão ainda.";
	return lista
		.map((j) => {
			const partes = new Array<string>();
			partes.push(`${j.nome}${j.local ? " (local)" : ""}`);
			partes.push(`Mapa = ${j.mapa ?? "(ainda sem mapa)"}`);
			if (j.celula !== undefined) partes.push(`MapaCelula = ${j.celula}`);
			if (j.dono !== undefined && j.dono > 0) partes.push(`dono ${j.dono}, lugar ${j.lugar ?? "?"}`);
			if (j.posicao) {
				partes.push(`em (${math.floor(j.posicao.X)}, ${math.floor(j.posicao.Y)}, ${math.floor(j.posicao.Z)})`);
			}
			return partes.join(" · ");
		})
		.join("\n");
}
