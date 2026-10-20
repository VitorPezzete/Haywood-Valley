// Desfazer e refazer por lote (12.11): uma pincelada, um retângulo ou um balde é um passo, com a lista de células
// que mudaram (camada, índice, antes, depois). Mudanças nos marcadores entram como um passo com a cópia de antes e
// de depois (são poucos). O histórico não sobe a versão do canvas: quem chama faz isso depois.
import { copiarMarcadores, Marcadores, ModeloBloco } from "./bloco";

export interface MudancaCelula {
	camada: number;
	indice: number;
	antes: number | string;
	depois: number | string;
}

export type Passo =
	| { tipo: "celulas"; mudancas: MudancaCelula[] }
	| { tipo: "marcadores"; antes: Marcadores; depois: Marcadores };

const LIMITE = 200;

export class Historico {
	private readonly pilhaDesfazer = new Array<Passo>();
	private readonly pilhaRefazer = new Array<Passo>();
	private lote?: Map<number, MudancaCelula>;

	limpar() {
		this.pilhaDesfazer.clear();
		this.pilhaRefazer.clear();
		this.lote = undefined;
	}

	podeDesfazer() {
		return this.pilhaDesfazer.size() > 0;
	}

	podeRefazer() {
		return this.pilhaRefazer.size() > 0;
	}

	/** Começa um lote; mudanças registradas até `fecharLote` viram um passo só. Reentrante: um lote aberto continua. */
	iniciarLote() {
		if (!this.lote) this.lote = new Map();
	}

	/** Registra uma célula que mudou. Sem lote aberto, vira um passo sozinha. */
	registrar(camada: number, indice: number, antes: number | string, depois: number | string) {
		if (antes === depois) return;
		if (!this.lote) {
			this.empilhar({ tipo: "celulas", mudancas: [{ camada, indice, antes, depois }] });
			return;
		}
		const chave = camada * 4096 + indice;
		const existente = this.lote.get(chave);
		if (existente) existente.depois = depois;
		else this.lote.set(chave, { camada, indice, antes, depois });
	}

	/** Fecha o lote e devolve se alguma célula mudou de fato. */
	fecharLote() {
		const lote = this.lote;
		this.lote = undefined;
		if (!lote) return false;
		const mudancas = new Array<MudancaCelula>();
		for (const [, m] of lote) if (m.antes !== m.depois) mudancas.push(m);
		if (mudancas.size() === 0) return false;
		this.empilhar({ tipo: "celulas", mudancas });
		return true;
	}

	/** Um passo de marcadores: chame com a cópia de antes (feita antes da mudança) e o modelo já mudado. */
	registrarMarcadores(antes: Marcadores, modelo: ModeloBloco) {
		this.empilhar({ tipo: "marcadores", antes, depois: copiarMarcadores(modelo.marcadores) });
	}

	private empilhar(passo: Passo) {
		this.pilhaDesfazer.push(passo);
		this.pilhaRefazer.clear();
		while (this.pilhaDesfazer.size() > LIMITE) this.pilhaDesfazer.shift();
	}

	/** Desfaz um passo no modelo; devolve o passo (para quem chama saber o que redesenhar), ou nada. */
	desfazer(modelo: ModeloBloco): Passo | undefined {
		this.fecharLote();
		const passo = this.pilhaDesfazer.pop();
		if (!passo) return undefined;
		this.aplicar(modelo, passo, true);
		this.pilhaRefazer.push(passo);
		return passo;
	}

	refazer(modelo: ModeloBloco): Passo | undefined {
		this.fecharLote();
		const passo = this.pilhaRefazer.pop();
		if (!passo) return undefined;
		this.aplicar(modelo, passo, false);
		this.pilhaDesfazer.push(passo);
		return passo;
	}

	private aplicar(modelo: ModeloBloco, passo: Passo, voltar: boolean) {
		if (passo.tipo === "celulas") {
			for (const m of passo.mudancas) modelo.definir(m.camada, m.indice, voltar ? m.antes : m.depois);
		} else {
			modelo.marcadores = copiarMarcadores(voltar ? passo.antes : passo.depois);
		}
	}
}
