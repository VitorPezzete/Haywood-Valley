"""Importa peças cruas do Graal (cabeça e corpo de um contribuidor) para contribuidores/pecas. **A REFAZER.**

O script original se perdeu na formatação de 2026-10-20 e não tem fonte sobrevivente; graalData.ts só diz
que ele existia ("Gerado por tools/graal_import.py → tools/graal_pack.py"). Este arquivo guarda o contrato
que ele cumpria, para quem o refizer. Tudo abaixo que não vem do código do jogo está marcado (palpite).

Entrada (o que o contribuidor manda, no formato do Graal):
- cabeça: um PNG de células de 32×32 com as 4 direções (cima, esquerda, baixo, direita), a vista de cima e,
  quando há, o olho fechado de lado (palpite: a disposição das células no PNG do Graal; o jogo só exige as
  5 ou 8 células na ordem de graal_common.py);
- corpo: um PNG com as 22 linhas do molde do Graal × 4 direções (graalArt.ts, BODY_ROWS), células de 32×32,
  e o gani do contribuidor quando ele muda a disposição (palpite: o importador lia o gani para achar as
  células; o jogo usa os ganis padrão de graalArt.ts);
- generos.json: { "<id>": "m" | "f" | "u" } (citado no comentário de GRAAL_HEADS).

O que ele produzia, por peça (é o que graal_pack.py lê; formato em graal_unpack.py):
- a camada `f`: a peça inteira nas cores do contribuidor (estilo `original`);
- uma máscara em cinza por parte pintável, com o degradê e os detalhes da parte, para o jogo pintar com
  `ImageColor3`: `s` pele, `h` cabelo, `e` olhos, `d0..d2` enfeites de cor própria (cabeça); `s` pele, `h`
  cabelo, `c0..c5` partes da roupa (corpo). Cada máscara é cinza onde a parte é e transparente no resto;
  a cor base da parte (RRGGBB) e, no corpo, o tipo de cada parte (t camisa, m mangas, p calça, k saia,
  v vestido, s sapatos, b cinto, d detalhe; graal.ts, "tirado do lugar dela no corpo") vão para peca.json
  (palpite: a parte era achada por agrupamento de cores e o tipo pela posição no molde);
- o estilo `aeko`: as mesmas camadas recoloridas na paleta do Aeko por tools/estilo_aeko.py (pieceStyle.ts).

Depois, `python tools/graal_pack.py` e `python tools/graal_pack.py --original --casar-com pack_aeko --pasta pack_original`
montam as folhas e os módulos.

Uso previsto:
    python tools/graal_import.py <pasta do contribuidor> --autor <autor> [--generos generos.json] [--saida contribuidores/pecas]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # graal_common.py, mesmo com `python -I`
from graal_common import PECAS  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description="Importa peças cruas do Graal para contribuidores/pecas (a refazer).")
    ap.add_argument("entrada", type=Path, help="pasta com os PNGs (e ganis) do contribuidor")
    ap.add_argument("--autor", required=True, help="nome do contribuidor, como nos créditos do jogo")
    ap.add_argument("--generos", type=Path, help="generos.json: id → m, f ou u")
    ap.add_argument("--saida", type=Path, default=PECAS)
    args = ap.parse_args()
    print(
        f"graal_import.py ainda não foi refeito: as peças de {args.autor} em {args.entrada} não foram importadas.\n"
        "O contrato (entrada, camadas, máscaras, peca.json) está no cabeçalho deste arquivo; as peças que já\n"
        "existiam voltam das folhas com `python tools/graal_unpack.py`.",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())
