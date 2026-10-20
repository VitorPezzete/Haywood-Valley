// Conferência do place aberto no Studio, usada pela aba "Place" do Servidor e pelo diagnóstico de Problemas:
//
// - Os scripts da Fase 0 antiga (Luau) ficam guardados em ServerStorage.Fase0Antiga, onde não rodam. Se voltam a
//   aparecer em ServerScriptService, StarterPlayerScripts ou ReplicatedStorage (pastas Config e Remotes), o place
//   foi reaberto de uma versão anterior (CLAUDE.md, "Compilar e sincronizar").
// - O que o Rojo monta (default.project.json da raiz): ReplicatedFirst.Abertura, StarterCharacterScripts.Animate
//   e Health, e as pastas TS em ReplicatedStorage, ServerScriptService e StarterPlayerScripts (o código do jogo).
// - ServerStorage.__Rojo_SessionLock existe enquanto o plugin do Rojo está conectado a este place.
//
// Tudo é só leitura; nada aqui muda o place.
import { ReplicatedFirst, ReplicatedStorage, ServerScriptService, ServerStorage, StarterPlayer } from "@rbxts/services";

export type Nivel = "ok" | "info" | "aviso" | "erro";

export interface Verificacao {
	nivel: Nivel;
	/** Onde no place (caminho da instância). */
	onde: string;
	/** O que foi visto. */
	texto: string;
	/** Como corrigir, quando não está ok. */
	correcao?: string;
}

/** Nome da pasta em que os scripts antigos ficam guardados. */
export const PASTA_FASE0 = "Fase0Antiga";
/** Nome da pasta do código compilado pelo roblox-ts, em cada serviço. */
export const PASTA_TS = "TS";
/** Instância que o plugin do Rojo cria enquanto está conectado. */
export const TRAVA_ROJO = "__Rojo_SessionLock";
/** Pastas da Fase 0 que não podem voltar a ReplicatedStorage. */
const PASTAS_ANTIGAS_REPLICADAS = ["Config", "Remotes"];

function filho(pai: Instance | undefined, nome: string): Instance | undefined {
	if (!pai) return undefined;
	const [ok, achado] = pcall(() => pai.FindFirstChild(nome));
	return ok ? (achado as Instance | undefined) : undefined;
}

function caminho(instancia: Instance): string {
	const [ok, nome] = pcall(() => instancia.GetFullName());
	return ok ? (nome as string) : instancia.Name;
}

/** Quantos descendentes são scripts (ModuleScript, Script ou LocalScript). */
function contarScripts(pasta: Instance): { modulos: number; scripts: number } {
	let modulos = 0;
	let scripts = 0;
	for (const descendente of pasta.GetDescendants()) {
		if (descendente.IsA("ModuleScript")) modulos += 1;
		else if (descendente.IsA("LuaSourceContainer")) scripts += 1;
	}
	return { modulos, scripts };
}

/** Os nomes dos scripts que estão guardados na Fase0Antiga (para reconhecê-los se reaparecerem). */
function nomesDaFase0(guardados: Instance | undefined): Set<string> {
	const nomes = new Set<string>();
	if (!guardados) return nomes;
	for (const item of guardados.GetChildren()) nomes.add(item.Name);
	return nomes;
}

/** Scripts soltos num serviço (fora da pasta TS e do que o Rojo monta), e os que têm nome da Fase 0. */
function scriptsSoltos(servico: Instance, permitidos: Set<string>, antigos: Set<string>): { soltos: string[]; daFase0: string[] } {
	const soltos = new Array<string>();
	const daFase0 = new Array<string>();
	for (const item of servico.GetChildren()) {
		if (permitidos.has(item.Name)) continue;
		if (antigos.has(item.Name)) {
			daFase0.push(item.Name);
			continue;
		}
		if (item.IsA("LuaSourceContainer") || item.IsA("Folder")) soltos.push(`${item.Name} (${item.ClassName})`);
	}
	return { soltos, daFase0 };
}

/** Roda todas as conferências. Nunca lança erro: um erro vira uma verificação de nível "erro". */
export function verificarPlace(): Verificacao[] {
	const lista = new Array<Verificacao>();
	const [ok, erro] = pcall(() => conferir(lista));
	if (!ok) {
		lista.push({
			nivel: "erro",
			onde: "plugin",
			texto: `a conferência do place falhou: ${tostring(erro)}`,
			correcao: "Veja o Output; pode ser uma permissão do Studio.",
		});
	}
	return lista;
}

function conferir(lista: Verificacao[]) {
	const starterScripts = filho(StarterPlayer, "StarterPlayerScripts");
	const starterCharacter = filho(StarterPlayer, "StarterCharacterScripts");

	// 1. A Fase 0 antiga guardada.
	const guardados = filho(ServerStorage, PASTA_FASE0);
	const antigos = nomesDaFase0(guardados);
	if (guardados) {
		lista.push({
			nivel: "ok",
			onde: caminho(guardados),
			texto: `os scripts da Fase 0 antiga estão guardados aqui (${guardados.GetChildren().size()} item(ns)), onde não rodam.`,
		});
	} else {
		lista.push({
			nivel: "info",
			onde: `ServerStorage.${PASTA_FASE0}`,
			texto: "a pasta com os scripts da Fase 0 antiga não está no place.",
			correcao: "Normal se o place foi limpo; se os scripts antigos sumiram sem querer, reabra a versão de 2026-10-09.",
		});
	}

	// 2. Scripts antigos que reapareceram no lugar errado.
	const lugares: Array<[string, Instance | undefined, string[]]> = [
		["ServerScriptService", ServerScriptService, [PASTA_TS]],
		["StarterPlayer.StarterPlayerScripts", starterScripts, [PASTA_TS]],
	];
	for (const [nome, servico, permitidos] of lugares) {
		if (!servico) continue;
		const { soltos, daFase0 } = scriptsSoltos(servico, new Set(permitidos), antigos);
		if (daFase0.size() > 0) {
			lista.push({
				nivel: "erro",
				onde: nome,
				texto: `scripts da Fase 0 antiga voltaram para cá: ${daFase0.join(", ")}.`,
				correcao: `O place foi reaberto de uma versão anterior. Mova-os para ServerStorage.${PASTA_FASE0} (ou apague) e salve.`,
			});
		}
		if (soltos.size() > 0) {
			lista.push({
				nivel: "aviso",
				onde: nome,
				texto: `há scripts ou pastas fora de ${PASTA_TS}: ${soltos.join(", ")}.`,
				correcao: "O jogo só roda o que o Rojo monta; o que está solto aqui não vem do repositório.",
			});
		}
	}
	for (const nome of PASTAS_ANTIGAS_REPLICADAS) {
		const pasta = filho(ReplicatedStorage, nome);
		if (pasta) {
			lista.push({
				nivel: "erro",
				onde: caminho(pasta),
				texto: `a pasta ${nome} da Fase 0 antiga está de volta em ReplicatedStorage.`,
				correcao: `O place foi reaberto de uma versão anterior. Mova para ServerStorage.${PASTA_FASE0} ou apague.`,
			});
		}
	}
	// Scripts da Fase 0 também em ReplicatedStorage (fora das pastas TS e rbxts_include).
	{
		const { daFase0 } = scriptsSoltos(ReplicatedStorage, new Set([PASTA_TS, "rbxts_include"]), antigos);
		if (daFase0.size() > 0) {
			lista.push({
				nivel: "erro",
				onde: "ReplicatedStorage",
				texto: `scripts da Fase 0 antiga voltaram para cá: ${daFase0.join(", ")}.`,
				correcao: `Mova-os para ServerStorage.${PASTA_FASE0} ou apague, e salve o place.`,
			});
		}
	}

	// 3. O que o Rojo monta fora das pastas TS.
	const esperados: Array<[string, Instance | undefined, string, string]> = [
		["ReplicatedFirst.Abertura", ReplicatedFirst, "Abertura", "LocalScript"],
		["StarterPlayer.StarterCharacterScripts.Animate", starterCharacter, "Animate", "LocalScript"],
		["StarterPlayer.StarterCharacterScripts.Health", starterCharacter, "Health", "Script"],
	];
	for (const [nome, pai, nomeFilho, classe] of esperados) {
		const item = filho(pai, nomeFilho);
		if (item) {
			const certo = item.ClassName === classe;
			lista.push({
				nivel: certo ? "ok" : "aviso",
				onde: nome,
				texto: certo ? `existe (${classe}).` : `existe, mas é ${item.ClassName} em vez de ${classe}.`,
				correcao: certo ? undefined : "O Rojo deveria ter montado a classe certa; confira o default.project.json.",
			});
		} else {
			lista.push({
				nivel: "erro",
				onde: nome,
				texto: "não existe no place.",
				correcao: "Suba o Rojo (npm run serve) e conecte o plugin do Rojo; ele monta este script.",
			});
		}
	}

	// 4. As pastas TS (o código compilado).
	const pastasTs: Array<[string, Instance | undefined, string]> = [
		["ReplicatedStorage.TS", ReplicatedStorage, "o código compartilhado (out/shared)"],
		["ServerScriptService.TS", ServerScriptService, "os serviços do servidor (out/server)"],
		["StarterPlayer.StarterPlayerScripts.TS", starterScripts, "os controllers do cliente (out/client)"],
	];
	for (const [nome, pai, descricao] of pastasTs) {
		const pasta = filho(pai, PASTA_TS);
		if (!pasta) {
			lista.push({
				nivel: "erro",
				onde: nome,
				texto: `não existe: ${descricao} não chegou ao Studio.`,
				correcao: "Compile (npx rbxtsc), suba o Rojo (npm run serve) e conecte o plugin do Rojo.",
			});
			continue;
		}
		const { modulos, scripts } = contarScripts(pasta);
		lista.push({
			nivel: modulos + scripts > 0 ? "ok" : "aviso",
			onde: nome,
			texto: `${modulos} módulo(s) e ${scripts} script(s): ${descricao}.`,
			correcao: modulos + scripts > 0 ? undefined : "A pasta está vazia: compile e sincronize de novo.",
		});
	}
	const include = filho(ReplicatedStorage, "rbxts_include");
	if (!include) {
		lista.push({
			nivel: "erro",
			onde: "ReplicatedStorage.rbxts_include",
			texto: "o runtime do roblox-ts (e os pacotes) não está no place.",
			correcao: "Sem ele nada do jogo roda. Sincronize pelo Rojo.",
		});
	}

	// 5. Rojo conectado?
	const trava = filho(ServerStorage, TRAVA_ROJO);
	lista.push(
		trava
			? { nivel: "ok", onde: caminho(trava), texto: "o plugin do Rojo está conectado a este place." }
			: {
					nivel: "aviso",
					onde: `ServerStorage.${TRAVA_ROJO}`,
					texto: "o plugin do Rojo não está conectado: mudanças no código não chegam ao Studio.",
					correcao: "Rode npm run serve e clique em Connect no plugin do Rojo.",
				},
	);
}

/** Só as verificações que não estão ok. */
export function problemasDoPlace(): Verificacao[] {
	return verificarPlace().filter((v) => v.nivel !== "ok");
}

/** Resumo em uma linha: quantos erros, avisos e ok. */
export function resumirPlace(lista: Verificacao[]): string {
	let erros = 0;
	let avisos = 0;
	let ok = 0;
	for (const v of lista) {
		if (v.nivel === "erro") erros += 1;
		else if (v.nivel === "aviso") avisos += 1;
		else if (v.nivel === "ok") ok += 1;
	}
	if (erros === 0 && avisos === 0) return `Place em ordem (${ok} conferência(s) ok).`;
	return `${erros} erro(s), ${avisos} aviso(s), ${ok} ok.`;
}
