// Orçamento de desempenho de um mapa (2026-10-20), contra as metas do CLAUDE.md ("Desempenho": 1.000 a 2.500
// imagens por cena no celular fraco, até 400 cartões, reservatório de 12 bonecos). É uma estimativa feita no
// editor, sem rodar o jogo: o jogo junta células vizinhas que são vizinhas na folha num retângulo só (`mergeCells`
// em client/world/interior.ts); aqui se juntam as da mesma linha (o jogo junta também na vertical, então o número
// real fica igual ou menor). O número exato está no DevPanel do jogo (Ctrl+Shift+O no Play).
import type { ModeloBloco } from "./bloco";

export const META_IMAGENS = 2500;
export const META_IMAGENS_BOA = 1000;
export const META_BONECOS = 12;

export interface Orcamento {
	/** Células com tile, por camada (chão, objeto, frente). */
	celulas: [number, number, number];
	/** Imagens estimadas (faixas da mesma linha juntadas), por camada, e o total. */
	imagens: [number, number, number];
	total: number;
	moradores: number;
	/** "boa", "atencao" (acima de 1.000) ou "alta" (acima de 2.500). */
	nivel: "boa" | "atencao" | "alta";
	/** Uma frase para a interface. */
	frase: string;
}

export function orcamentoDoMapa(modelo: ModeloBloco): Orcamento {
	const celulas: [number, number, number] = [0, 0, 0];
	const imagens: [number, number, number] = [0, 0, 0];
	for (const camada of [0, 1, 2] as const) {
		for (let y = 0; y < 64; y++) {
			let anterior: [string, number, number] | undefined;
			for (let x = 0; x < 64; x++) {
				const t = modelo.tile(camada, x, y);
				if (!t) {
					anterior = undefined;
					continue;
				}
				celulas[camada]++;
				// Continua a faixa se for o tile à direita do anterior na mesma folha e linha.
				const continua = anterior !== undefined && anterior[0] === t[0] && anterior[1] + 1 === t[1] && anterior[2] === t[2];
				if (!continua) imagens[camada]++;
				anterior = [t[0], t[1], t[2]];
			}
		}
	}
	const total = imagens[0] + imagens[1] + imagens[2];
	const moradores = modelo.marcadores.moradores.size();
	const nivel = total > META_IMAGENS ? "alta" : total > META_IMAGENS_BOA ? "atencao" : "boa";
	const partes = [`≈ ${total} imagens (meta: até ${META_IMAGENS_BOA}, no máximo ${META_IMAGENS})`];
	if (moradores > 0) partes.push(`${moradores} morador(es) (o jogo guarda até ${META_BONECOS} bonecos prontos)`);
	const frase =
		nivel === "boa"
			? `Leve: ${partes.join("; ")}.`
			: nivel === "atencao"
				? `Pesado para celular fraco: ${partes.join("; ")}. Junte áreas de um tile só ou tire camadas escondidas.`
				: `Pesado demais: ${partes.join("; ")}. Divida o mapa ou simplifique o chão.`;
	return { celulas, imagens, total, moradores, nivel, frase };
}
