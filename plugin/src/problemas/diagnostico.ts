// O diagnóstico inteiro: lê tudo pela ponte (mapas, catálogo, assets, folhas), confere o place, e devolve a
// lista de problemas ordenada por gravidade. Yielda (chama a ponte): rodar de um task.spawn.
import { lerAssets, lerCatalogo, lerMapa, listarFolhas, listarMapas, Mapa } from "../ponte";
import { problemasDoPlace } from "../servidor/place";
import { verificarAssets } from "./assets";
import { folhasConhecidas, verificarCatalogo } from "./catalogo";
import { verificarMapas } from "./mapas";
import { PESO_DA_GRAVIDADE, Problema } from "./tipos";
import { carregarIdsGraal } from "./visual";

export interface Diagnostico {
	problemas: Problema[];
	/** A ponte não respondeu: só o place foi conferido. */
	ponteFora: boolean;
	/** O erro da ponte, quando houve. */
	erroPonte?: string;
	/** Quantos mapas e blocos foram lidos. */
	mapas: number;
	blocos: number;
	/** Quando terminou, "HH:MM:SS". */
	quando: string;
}

function ordenar(lista: Problema[]) {
	// Comparador ao estilo Lua (true quando a vem antes de b).
	lista.sort((a, b) => {
		const pa = PESO_DA_GRAVIDADE[a.gravidade];
		const pb = PESO_DA_GRAVIDADE[b.gravidade];
		if (pa !== pb) return pa < pb;
		if (a.grupo !== b.grupo) return a.grupo < b.grupo;
		return a.onde < b.onde;
	});
}

export function diagnosticar(): Diagnostico {
	const problemas = new Array<Problema>();
	let ponteFora = false;
	let erroPonte: string | undefined;
	let mapasLidos = 0;
	let blocosLidos = 0;

	// Place: não depende da ponte.
	for (const v of problemasDoPlace()) {
		problemas.push({
			gravidade: v.nivel === "erro" ? "erro" : v.nivel === "aviso" ? "aviso" : "info",
			grupo: "place",
			onde: v.onde,
			oQue: v.texto,
			comoCorrigir: v.correcao ?? "",
		});
	}

	const resumo = listarMapas();
	// Os ids de cabeças e corpos do jogo, para conferir o visual dos moradores (sem a ponte, vale a cópia).
	if (resumo.ok) carregarIdsGraal();
	if (!resumo.ok) {
		ponteFora = true;
		erroPonte = resumo.erro;
		problemas.push({
			gravidade: "aviso",
			grupo: "ponte",
			onde: "ponte",
			oQue: `a ponte não respondeu: ${resumo.erro}`,
			comoCorrigir: "Só o place foi conferido. Rode npm run diorama:ponte e diagnostique de novo.",
		});
	} else {
		// Folhas conhecidas: as da ponte, ou as do jogo.
		const folhas = listarFolhas();
		const conhecidas = folhasConhecidas(folhas.ok ? folhas.valor.map((f) => f.nome) : undefined);
		if (!folhas.ok) {
			problemas.push({ gravidade: "info", grupo: "ponte", onde: "GET /folhas", oQue: `não deu para listar as folhas: ${folhas.erro}`, comoCorrigir: "Valem as do jogo (casa, castelo)." });
		}

		// Mapas.
		const mapas = new Array<Mapa>();
		for (const item of resumo.valor) {
			const mapa = lerMapa(item.id);
			if (!mapa.ok) {
				problemas.push({ gravidade: "erro", grupo: "mapas", onde: `mapa ${item.id}`, oQue: `não deu para ler: ${mapa.erro}`, comoCorrigir: "Confira a pasta diorama/mapas/<id> e o terminal da ponte." });
				continue;
			}
			mapasLidos += 1;
			blocosLidos += mapa.valor.blocos.size();
			mapas.push(mapa.valor);
		}
		for (const p of verificarMapas(mapas, conhecidas)) problemas.push(p);

		// Catálogo: as peças e os fundos juntos (as peças citam os fundos pela id).
		const lidos: Partial<Record<"pecas" | "fundos", unknown>> = {};
		for (const nome of ["pecas", "fundos"] as Array<"pecas" | "fundos">) {
			const catalogo = lerCatalogo(nome);
			if (!catalogo.ok) {
				problemas.push({
					gravidade: catalogo.status === 404 ? "info" : "aviso",
					grupo: "catalogo",
					onde: `diorama/catalogo/${nome}.json`,
					oQue: catalogo.status === 404 ? "o arquivo ainda não existe." : `não deu para ler: ${catalogo.erro}`,
					comoCorrigir: catalogo.status === 404 ? "Semeie com node tools/diorama_lib/semear_catalogo.mjs ou crie pelo Catálogo." : "Confira o JSON.",
				});
				continue;
			}
			lidos[nome] = catalogo.valor;
		}
		if (lidos.pecas !== undefined) {
			for (const p of verificarCatalogo(lidos.pecas, lidos.fundos, conhecidas)) problemas.push(p);
		}

		// Assets.
		const assets = lerAssets();
		if (!assets.ok) {
			problemas.push({
				gravidade: assets.status === 404 ? "aviso" : "erro",
				grupo: "assets",
				onde: "assets/registro.json",
				oQue: assets.status === 404 ? "o registro não existe." : `não deu para ler: ${assets.erro}`,
				comoCorrigir: "O registro é a fonte de src/shared/assets.ts; sem ele o jogo não tem ids.",
			});
		} else {
			for (const p of verificarAssets(assets.valor.registro)) problemas.push(p);
		}
	}

	ordenar(problemas);
	return { problemas, ponteFora, erroPonte, mapas: mapasLidos, blocos: blocosLidos, quando: os.date("%H:%M:%S") };
}

/** Resumo em uma linha. */
export function resumir(d: Diagnostico): string {
	let erros = 0;
	let avisos = 0;
	let infos = 0;
	for (const p of d.problemas) {
		if (p.gravidade === "erro") erros += 1;
		else if (p.gravidade === "aviso") avisos += 1;
		else infos += 1;
	}
	const lidos = d.ponteFora ? "sem a ponte" : `${d.mapas} mapa(s), ${d.blocos} bloco(s)`;
	if (erros === 0 && avisos === 0) return `Nada a corrigir (${lidos}; ${infos} nota(s)). ${d.quando}`;
	return `${erros} erro(s), ${avisos} aviso(s), ${infos} nota(s) (${lidos}). ${d.quando}`;
}
