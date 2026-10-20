// As seções da janela única do Diorama (2026-10-20), na ordem da navegação. A definição de cada uma (nome, ícone,
// descrição) está em ../secoes.ts; aqui, só a função que monta o painel. Cada seção mora em
// plugin/src/ferramentas/<arquivo>.tsx e exporta `montar(quadro, contexto)`, que monta o painel no quadro da seção e
// devolve a função que o desmonta (ver ../widget.ts).
//
// Para acrescentar uma seção: a definição em SECOES (secoes.ts), o arquivo com o painel e `montar`, e uma entrada
// em MONTAR aqui.
//
// A lista fica em ferramentas/index.ts (e não em ferramentas.ts ao lado da pasta) porque o Rojo não aceita um
// arquivo e uma pasta com o mesmo nome: viravam dois irmãos chamados "ferramentas" e o require pegava a pasta.
import { SECOES } from "../secoes";
import type { ContextoSecao, SecaoMontavel } from "../widget";
import * as ajuda from "./ajuda";
import * as arte from "./arte";
import * as catalogo from "./catalogo";
import * as configuracoes from "./configuracoes";
import * as mapas from "./mapas";
import * as testar from "./testar";
import * as verificar from "./verificar";

const MONTAR: Record<string, (quadro: Frame, contexto: ContextoSecao) => () => void> = {
	mapa: mapas.montar,
	pecas: catalogo.montar,
	arte: arte.montar,
	testar: testar.montar,
	verificar: verificar.montar,
	ajuda: ajuda.montar,
	configuracoes: configuracoes.montar,
};

export const SECOES_MONTAVEIS: SecaoMontavel[] = SECOES.map((s) => ({ id: s.id, nome: s.nome, montar: MONTAR[s.id] }));
