"""A prévia de conferência de uma peça: original | recortado | incertos | partes | três recolorações, ampliada."""

from __future__ import annotations

import numpy as np
from PIL import Image, ImageDraw

from .partes import Parte, pintar

ESCALA = 4
#: As cores de exemplo das recolorações (a parte maior de cada peça).
EXEMPLOS = [("azul", (0x4A, 0x7F, 0xD8)), ("verde", (0x58, 0xB0, 0x5A)), ("vinho", (0xA8, 0x32, 0x50))]
FUNDO = (40, 40, 48)


def _xadrez(h: int, w: int, passo: int = 4) -> np.ndarray:
    yy, xx = np.mgrid[0:h, 0:w]
    claro = ((yy // passo + xx // passo) % 2) == 0
    img = np.zeros((h, w, 3), dtype=np.uint8)
    img[claro] = (208, 208, 216)
    img[~claro] = (168, 168, 180)
    return img


def _sobre(rgba: np.ndarray, fundo: np.ndarray) -> np.ndarray:
    a = (rgba[..., 3:4] > 0)
    return np.where(a, rgba[..., :3], fundo).astype(np.uint8)


def montar(original: np.ndarray, recorte: np.ndarray, incertos: np.ndarray, partes: list[Parte], titulo: str) -> Image.Image:
    h, w = recorte.shape[:2]
    xadrez = _xadrez(h, w)
    paineis: list[tuple[str, np.ndarray]] = [("original", original), ("recortado", _sobre(recorte, xadrez))]
    marca = _sobre(recorte, xadrez).copy()
    marca[incertos] = (255, 0, 255)
    paineis.append((f"incertos ({int(incertos.sum())})", marca))
    pintaveis = [p for p in partes if p.mascara is not None]
    for p in pintaveis:
        fundo = np.zeros((h, w, 3), dtype=np.uint8)
        fundo[:] = (24, 24, 64)
        paineis.append((f"parte {p.n} #{p.referencia:06x}", _sobre(p.mascara, fundo)))
    if pintaveis:
        alvo = pintaveis[0].n
        for nome, cor in EXEMPLOS:
            paineis.append((nome, _sobre(pintar(recorte, partes, {alvo: cor}), xadrez)))

    gap = 6
    topo = 14
    largura = sum(p[1].shape[1] * ESCALA + gap for p in paineis) + gap
    altura = h * ESCALA + topo + gap + 14
    img = Image.new("RGB", (max(largura, 200), altura), FUNDO)
    d = ImageDraw.Draw(img)
    d.text((gap, 2), titulo, fill=(240, 240, 240))
    x = gap
    for nome, arr in paineis:
        grande = Image.fromarray(arr).resize((arr.shape[1] * ESCALA, arr.shape[0] * ESCALA), Image.NEAREST)
        img.paste(grande, (x, topo + 14))
        d.text((x, topo + 2), nome, fill=(200, 200, 210))
        x += arr.shape[1] * ESCALA + gap
    return img
