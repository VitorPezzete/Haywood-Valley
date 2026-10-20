"""As folhas do Aeko, os tipos de fundo como texturas e o catálogo de peças.

As folhas (diorama/folhas/<folha>.png, 2048 × 512, tiles de 16) são opacas: o vazio das exportações do
Aeko é um quadriculado cinza claro pintado nos pixels. Tile = linha × 128 + coluna, como em fundos.json.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image

RAIZ = Path(__file__).resolve().parents[2]
FOLHAS = RAIZ / "diorama" / "folhas"
CATALOGO = RAIZ / "diorama" / "catalogo"
TILE = 16
COLUNAS = 128
LINHAS = 32

#: O preto do contorno do Aeko (010000: o 1 no vermelho é dele, ESTUDO_AEKO.md).
PRETO = 0x010000
#: As cores do quadriculado das exportações (o "transparente" pintado na folha).
QUADRICULADO = {0xF7F7F7, 0xE6E6E6, 0xFEFFFF}


def chave(rgb: np.ndarray) -> np.ndarray:
    """RGB (…, 3) → inteiro 0xRRGGBB, para comparar pixels de uma vez."""
    rgb = rgb.astype(np.int32)
    return (rgb[..., 0] << 16) | (rgb[..., 1] << 8) | rgb[..., 2]


def rgb_de(k: np.ndarray) -> np.ndarray:
    k = np.asarray(k, dtype=np.int32)
    return np.stack([(k >> 16) & 255, (k >> 8) & 255, k & 255], axis=-1).astype(np.uint8)


@dataclass
class Folha:
    nome: str
    rgb: np.ndarray  # (512, 2048, 3) uint8
    k: np.ndarray  # (512, 2048) int32

    def tile_k(self, coluna: int, linha: int) -> np.ndarray:
        return self.k[linha * TILE : (linha + 1) * TILE, coluna * TILE : (coluna + 1) * TILE]

    def quadriculado(self, coluna: int, linha: int) -> bool:
        return set(np.unique(self.tile_k(coluna, linha)).tolist()) <= QUADRICULADO


_folhas: dict[str, Folha] = {}


def folha(nome: str) -> Folha:
    if nome not in _folhas:
        rgb = np.array(Image.open(FOLHAS / f"{nome}.png").convert("RGB"))
        _folhas[nome] = Folha(nome, rgb, chave(rgb))
    return _folhas[nome]


@dataclass
class Textura:
    """Um tipo de fundo (fundos.json) como textura periódica: o retângulo dos tiles dele na folha.

    Um tipo cujos tiles não são vizinhos vira várias texturas (uma por grupo de tiles vizinhos). `valido` marca
    os pixels que são do tipo (o retângulo pode ter tiles de fora, num grupo em L).
    """

    id: str
    folha: str
    tiles: set[int]
    k: np.ndarray
    valido: np.ndarray
    origem: tuple[int, int]  # (coluna, linha) do canto
    paleta: set[int] = field(default_factory=set)
    classe: str = "piso"  # "piso", "parede" ou "movel" (classe_do_fundo)


def _grupos(tiles: set[int]) -> list[set[int]]:
    resto = set(tiles)
    grupos = []
    while resto:
        t = resto.pop()
        grupo = {t}
        pilha = [t]
        while pilha:
            u = pilha.pop()
            c, l = u % COLUNAS, u // COLUNAS
            for v in ((l * COLUNAS + c + 1), (l * COLUNAS + c - 1), ((l + 1) * COLUNAS + c), ((l - 1) * COLUNAS + c)):
                if v in resto:
                    resto.remove(v)
                    grupo.add(v)
                    pilha.append(v)
        grupos.append(grupo)
    return grupos


#: Fundos que são móveis vazios (a estante, a adega, a prateleira, a água da banheira): servem para pôr coisas
#: pequenas em cima no Decorar, não estão atrás de um móvel. Ficam fora do recorte (palpite).
FUNDOS_DE_MOVEL = {"estante_vazia", "adega_vazia", "prateleira_banheiro", "agua_banheira"}


def zona_do_tile(nome: str, coluna: int, linha: int) -> str:
    """A zona do tile pelas regras de zonas.json (exceções primeiro, depois a primeira zona que cobre)."""
    z = json.loads((CATALOGO / "zonas.json").read_text(encoding="utf-8"))
    for e in z.get("excecoes", []):
        c0, l0, c1, l1 = e["area"]
        if e["folha"] == nome and c0 <= coluna <= c1 and l0 <= linha <= l1:
            return e["zona"]
    for c0, l0, c1, l1, zona in z["zonas"]:
        if c0 <= coluna <= c1 and l0 <= linha <= l1:
            return zona
    return "sem_pecas"


def classe_do_fundo(nome: str, id_: str, tiles: set[int]) -> str:
    """piso (zonas de chão, água) ou parede (o resto: papel, lambri, viga, pedra), ou movel (FUNDOS_DE_MOVEL)."""
    if id_.split("#")[0] in FUNDOS_DE_MOVEL:
        return "movel"
    zonas = {zona_do_tile(nome, t % COLUNAS, t // COLUNAS) for t in tiles}
    return "piso" if zonas <= {"chao", "frente", "agua", "agua_rasa"} else "parede"


def texturas(nome: str) -> list[Textura]:
    """As texturas de fundo de uma folha, de fundos.json (sem o `vazio`, que é o preto do contorno)."""
    f = folha(nome)
    dados = json.loads((CATALOGO / "fundos.json").read_text(encoding="utf-8"))
    saida = []
    for fundo in dados["fundos"]:
        if fundo["folha"] != nome or fundo["id"] == "vazio":
            continue
        for n, grupo in enumerate(_grupos(set(fundo["tiles"]))):
            cs = [t % COLUNAS for t in grupo]
            ls = [t // COLUNAS for t in grupo]
            c0, l0, c1, l1 = min(cs), min(ls), max(cs), max(ls)
            k = f.k[l0 * TILE : (l1 + 1) * TILE, c0 * TILE : (c1 + 1) * TILE].copy()
            valido = np.zeros(k.shape, dtype=bool)
            for t in grupo:
                c, l = t % COLUNAS - c0, t // COLUNAS - l0
                valido[l * TILE : (l + 1) * TILE, c * TILE : (c + 1) * TILE] = True
            id_ = fundo["id"] if n == 0 else f"{fundo['id']}#{n}"
            tex = Textura(id_, nome, grupo, k, valido, (c0, l0))
            tex.paleta = set(np.unique(k[valido]).tolist())
            tex.classe = classe_do_fundo(nome, id_, grupo)
            saida.append(tex)
    return saida


def catalogo() -> dict:
    return json.loads((CATALOGO / "pecas.json").read_text(encoding="utf-8"))
