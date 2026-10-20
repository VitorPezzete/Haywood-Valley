// O caminho de volta: de um módulo gerado (src/shared/interiors/<mapa>.ts, o `InteriorData`) para o bloco JSON do
// formato 1, para reabrir no Diorama os mapas que sobreviveram à formatação. O que o jogo deriva (paleta, caixa,
// `blocks`, `actions`, `flat`, `terrain.runs`) não vai para o bloco; o que a derivação não reproduz vira ajuste
// (`bloqueios.mais/menos`, `acoes`) ou, no exterior, os recortes crus (`exterior.runs_importados`).
import { hashDoConteudo } from "./carimbo.mjs";
import { decomporRuns } from "./exterior.mjs";
import { CAMADAS, gerarInterior } from "./gerar.mjs";

function celulasDaCamada(data, n) {
	const lista = [];
	data.layers[n].forEach((linha, j) => {
		linha.split(" ").forEach((parte, i) => {
			const numero = Number(parte);
			if (numero === 0) return;
			const [folha, col, row] = data.tiles[numero - 1];
			lista.push([data.x + i, data.y + j, folha, col, row]);
		});
	});
	return lista;
}

/** Monta o bloco de um `InteriorData`. Devolve { bloco, avisos }. */
export function blocoDoInterior(data) {
	const avisos = [];
	const folhas = new Set([data.backdrop[0]]);
	for (const [folha] of data.tiles) folhas.add(folha);
	const bloco = {
		versao: 1,
		mapa: data.id,
		bloco: [0, 0],
		folhas: [...folhas].sort(),
		vazio: [data.backdrop[0], data.backdrop[1], data.backdrop[2]],
		camadas: Object.fromEntries(CAMADAS.map((nome, n) => [nome, celulasDaCamada(data, n)])),
	};
	const caixa = { x: data.x, y: data.y, width: data.width, height: data.height };
	if (data.terrain) {
		try {
			bloco.exterior = decomporRuns(data.terrain.runs, caixa);
		} catch (erro) {
			avisos.push(`exterior: ${erro.message}; guardando os recortes crus`);
			bloco.exterior = { runs_importados: data.terrain.runs, caixa_importada: caixa };
		}
	}
	bloco.nascimento = [data.spawn[0], data.spawn[1]];
	if (data.entries) bloco.entradas = data.entries.map((e) => ({ nome: e.name, x: e.x, y: e.y }));
	if (data.exits) {
		bloco.saidas = data.exits.map((e) => {
			const saida = { x: e.x, y: e.y, largura: e.width, altura: e.height, mapa: e.map };
			if (e.arrival !== undefined) saida.chegada = e.arrival;
			return saida;
		});
	}
	if (data.zones) bloco.zonas = data.zones.map((z) => ({ nome: z.name, areas: z.areas.map((a) => [...a]), props: { ...z.props } }));
	if (data.residents) {
		bloco.moradores = data.residents.map((r) => ({
			nome: r.name,
			x: r.x,
			y: r.y,
			olhando: r.facing,
			visual: r.look,
			pose: r.pose,
		}));
	}
	bloco.carimbo = data.stamp;

	// O exterior recomposto tem de dar os mesmos recortes; senão ficam os crus.
	if (bloco.exterior && !bloco.exterior.runs_importados) {
		const { data: tentativa } = gerarInterior({ ...bloco, nascimento: bloco.nascimento });
		const iguais =
			JSON.stringify(tentativa.terrain?.runs) === JSON.stringify(data.terrain.runs) &&
			tentativa.terrain?.tiles === data.terrain.tiles &&
			tentativa.terrain?.layers === data.terrain.layers;
		if (!iguais) {
			avisos.push("exterior: a grade dupla não reproduz os recortes do módulo; guardando os recortes crus");
			bloco.exterior = { runs_importados: data.terrain.runs, caixa_importada: caixa };
		}
	}

	// Bloqueios e ações que a derivação não explica viram ajustes à mão.
	const { data: derivado } = gerarInterior(bloco);
	if (derivado.x !== data.x || derivado.y !== data.y || derivado.width !== data.width || derivado.height !== data.height) {
		avisos.push(`a caixa derivada (${derivado.x}, ${derivado.y}, ${derivado.width} × ${derivado.height}) difere da do módulo`);
	}
	const mais = [];
	const menos = [];
	const acoes = [];
	for (let j = 0; j < data.height; j++) {
		for (let i = 0; i < data.width; i++) {
			const quer = data.blocks[j][i];
			const tem = derivado.blocks[j]?.[i];
			if (quer !== tem) (quer === "#" ? mais : menos).push([data.x + i, data.y + j]);
			const acaoQuer = data.actions[j][i];
			if (acaoQuer !== derivado.actions[j]?.[i]) acoes.push([data.x + i, data.y + j, acaoQuer]);
		}
	}
	if (mais.length > 0 || menos.length > 0) {
		bloco.bloqueios = {};
		if (mais.length > 0) bloco.bloqueios.mais = mais;
		if (menos.length > 0) bloco.bloqueios.menos = menos;
		avisos.push(`bloqueios que a zona não explica: ${mais.length} a mais, ${menos.length} a menos`);
	}
	if (acoes.length > 0) {
		bloco.acoes = acoes;
		avisos.push(`ações que o catálogo não explica: ${acoes.length}`);
	}
	bloco.carimbo_conteudo = hashDoConteudo(bloco);
	return { bloco, avisos };
}
