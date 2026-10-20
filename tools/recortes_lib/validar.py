"""Conferir o recorte automático contra o gabarito feito à mão: assets/acoes/carregaveis.png.

As áreas do gabarito vêm de CARRY_RECTS em src/client/world/pieces.ts ([x, y, largura, altura] na folha do
gabarito: a área da peça com 1 pixel de folga, o mesmo formato do recorte daqui); a área de cada peça na
folha do Aeko vem de pecas.json pelo id.
"""

from __future__ import annotations

import re

import numpy as np
from PIL import Image

from .folhas import RAIZ

GABARITO = RAIZ / "assets" / "acoes" / "carregaveis.png"
PIECES_TS = RAIZ / "src" / "client" / "world" / "pieces.ts"


def areas_gabarito() -> dict[str, tuple[int, int, int, int]]:
    texto = PIECES_TS.read_text(encoding="utf-8")
    bloco = texto[texto.index("CARRY_RECTS") :]
    bloco = bloco[: bloco.index("};")]
    return {m[0]: tuple(int(v) for v in m[1:]) for m in re.findall(r"(\w+): \[(\d+), (\d+), (\d+), (\d+)\]", bloco)}


def gabarito() -> dict[str, np.ndarray]:
    img = np.array(Image.open(GABARITO).convert("RGBA"))
    return {id_: img[y : y + h, x : x + w] for id_, (x, y, w, h) in areas_gabarito().items()}


def comparar(meu: np.ndarray, deles: np.ndarray) -> dict:
    """Pixels iguais (os dois transparentes, ou os dois opacos com a mesma cor), IoU da silhueta e erros."""
    a_op = meu[..., 3] > 0
    b_op = deles[..., 3] > 0
    mesma_cor = (meu[..., :3] == deles[..., :3]).all(axis=2)
    iguais = (~a_op & ~b_op) | (a_op & b_op & mesma_cor)
    uniao = (a_op | b_op).sum()
    return {
        "pixels": int(iguais.size),
        "iguais": int(iguais.sum()),
        "taxa": round(float(iguais.mean()), 4),
        "iou": round(float((a_op & b_op).sum() / uniao) if uniao else 1.0, 4),
        "sobra": int((a_op & ~b_op).sum()),  # peça aqui, fundo no gabarito
        "falta": int((~a_op & b_op).sum()),  # fundo aqui, peça no gabarito
        "cor": int((a_op & b_op & ~mesma_cor).sum()),  # os dois opacos, cor diferente
    }
