// O editor de Mapas visto de fora: o painel aberto se registra aqui, e o canal do Studio (abrir_mapa) e o autoteste
// o usam para abrir um mapa e ler o que está no editor, sem clicar. Só existe enquanto o painel está montado.
import type { ModeloBloco } from "./bloco";

export interface ResumoMapaAberto {
	id: string;
	carimbo?: string;
	/** [x, y, largura, altura] do que está pintado, ou nada. */
	retangulo?: [number, number, number, number];
	/** Células não vazias por camada. */
	celulas: { chao: number; objeto: number; frente: number; terreno: number };
	marcadores: { entradas: number; saidas: number; zonas: number; moradores: number; nascimento?: [number, number] };
	sujo: boolean;
}

export interface ControleMapas {
	/** Abre o mapa no editor e espera a leitura (yielda). Recusa se há mudança não salva, a não ser com `descartar`. */
	abrir: (id: string, descartar?: boolean) => { ok: true; resumo: ResumoMapaAberto } | { ok: false; erro: string };
	/** O modelo do bloco aberto. */
	modelo: () => ModeloBloco;
	resumo: () => ResumoMapaAberto;
	sujo: () => boolean;
}

let atual: ControleMapas | undefined;

/** O painel registra o controle ao montar; a função devolvida o tira (no cleanup do painel). */
export function registrarControle(c: ControleMapas): () => void {
	atual = c;
	return () => {
		if (atual === c) atual = undefined;
	};
}

export function controleMapas(): ControleMapas | undefined {
	return atual;
}

/** O resumo de um modelo (o que o editor tem aberto). */
export function resumirModelo(modelo: ModeloBloco, sujo: boolean): ResumoMapaAberto {
	const contar = (lista: ReadonlyArray<number | string>) => {
		let n = 0;
		for (const v of lista) if (v !== 0 && v !== "") n++;
		return n;
	};
	const m = modelo.marcadores;
	return {
		id: modelo.mapa,
		carimbo: modelo.carimboLido,
		retangulo: modelo.retanguloPintado(),
		celulas: {
			chao: contar(modelo.camadas[0]),
			objeto: contar(modelo.camadas[1]),
			frente: contar(modelo.camadas[2]),
			terreno: contar(modelo.terreno),
		},
		marcadores: {
			entradas: m.entradas.size(),
			saidas: m.saidas.size(),
			zonas: m.zonas.size(),
			moradores: m.moradores.size(),
			nascimento: m.nascimento,
		},
		sujo,
	};
}
