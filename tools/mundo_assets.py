"""Separa os assets do mundo a partir do mapa de A Link to the Past e os refaz no estilo do jogo (2026-10-23).

O usuário liberou o ALttP como base de trabalho (CLAUDE.md, seção Arte; jurídico consultado) e pediu: "Faça um plano
desses assets, separe eles para o mapa, e vá refazendo eles conforme o estilo a se seguir". O plano, a lista e as
regras de estilo estão em docs/mundo/PLANO_REFAZER_ALTTP.md. Nenhuma imagem do ALttP entra no repositório: este
script só lê e grava em `Documents\\Haywood-Valley-recuperado\\mundo\\` (`--raiz`).

Etapas (cada uma lê o que a anterior gravou; `tudo` faz todas em ordem):

- `separar`: grava `assets/<categoria>/<nome>_original.png` em tamanho real e com fundo transparente.
  - Terreno: a folha de cada conjunto, montada com os tiles do Mundo da Luz (grade exata de 16 px). Os conjuntos de
    dois materiais saem no esquema de Wang de cantos (16 peças, "dual grid"): cada quadrante de 8×8 do tile é de um
    material ou do outro, e a peça de código c (canto superior esquerdo = 1, superior direito = 2, inferior esquerdo =
    4, inferior direito = 8; bit ligado = material A) fica na coluna c % 4 e na linha c // 4. Para cada código vale o
    tile mais usado no mapa. As linhas de baixo são variações do miolo de A e de B. Penhasco, água com penhasco e
    copa de mata não são de dois materiais: a folha traz os tiles mais usados da região P1, oito por linha.
  - Objetos: as peças já separadas da gablaxian (`alttp_outras_fontes/gablaxian_pecas`) quando há; senão o recorte do
    mapa, com o fundo (chão) tirado por inundação a partir da moldura que para no contorno escuro.
- `estilo`: `<nome>_estilo.png` pela ferramenta de estilo (`estilo_aeko_arte.py`): `equipe` para terreno e
  vegetação (paleta tirada da arte da equipe, `equipe/mundo_recortes`; chão sem contorno; vegetação com contorno
  escuro da própria cor) e `aeko+equipe` para construções e objetos. Nota mínima 8.
- `limpar`: passa o `_estilo` (menos o terreno, que não tem linha) pela limpeza de linhas do Aseprite
  (`aseprite/pixel/limpeza.lua`, num processo `-b` só, curto): doubles e jaggies corrigidos, órfãos só relatados (a
  correção de órfãos estragou detalhes coloridos em 2026-10-23: as patas laranja da galinha viraram pretas).
- `melhorar`: `<nome>_melhorado.png`, ajustes feitos aqui (ver MELHORIAS): terreno recolorido papel a papel nas cores
  da equipe; árvores nas quatro estações; casas com outra cor de telhado.
- `comparar`: `assets/_comparar_<categoria>.png` (original | estilo | melhorado, ampliados) e `assets/_indice.json`.

Uso:
    python -I tools/mundo_assets.py tudo [--raiz PASTA] [--so nome1,nome2] [--prioridade P1]
    python -I tools/mundo_assets.py separar|estilo|limpar|melhorar|comparar ...
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import estilo_aeko_arte as est  # noqa: E402

RAIZ_REPO = Path(__file__).resolve().parent.parent
RAIZ_PADRAO = Path.home() / "Documents" / "Haywood-Valley-recuperado" / "mundo"
MAPA_LUZ = "alttp_vgmaps/LegendOfZelda-ALinkToThePast-LightWorld.png"
GABLAXIAN = "alttp_outras_fontes/gablaxian_pecas"
EQUIPE = Path.home() / "Documents" / "Haywood-Valley-recuperado" / "equipe" / "mundo_recortes"
LIMPEZA = RAIZ_REPO / "aseprite" / "pixel" / "limpeza.lua"
T = 16  # tile do ALttP

# Região P1 no Mundo da Luz (pixels): a vila do oeste, o castelo, a casa do herói, o rio e a mata ao sul do castelo.
# O reino de Haywood (campos, floresta temperada, vila, fazenda, rio) sai daqui.
REGIAO_P1 = (0, 1536, 3072, 3072)

# Índices da paleta do mapa (PNG indexado, 111 cores) por material, conferidos nos tiles em 2026-10-23.
GRAMA = {0, 106}  # 48a048 e o verde escuro dos tufos e da beira (307030)
TERRA = {109, 104, 102}  # 908048, 806038 e as pedrinhas 604828
PENHASCO = {102, 103, 104, 105}  # o barranco: 604828, 483828, 806038 e o contorno 282828
AGUA = {2, 16, 29, 11}  # 3860b0, 5880c0, o brilho 70b8ff e o fundo da margem 304880
CALCADA = {12, 18, 20}  # as lajotas da vila: 80c090, 508070, a8e8b0
COPA = {108, 110}  # a copa da mata: 305830 e 286840
TRONCO = {14, 28, 105}
FLORES = {8, 107}  # a flor branca e o verde claro dela

# Os conjuntos de terreno. tipo "wang": dois materiais (A e B) mais os neutros, que podem aparecer e não contam;
# tipo "lista": os tiles mais usados que só têm as cores `cores` e têm pelo menos `minimo` pixels de `exige`.
CONJUNTOS = {
    "grama_terra": {"tipo": "wang", "A": TERRA, "B": GRAMA, "neutros": set()},
    # a calçada da vila é alinhada no tile (as lajotas já trazem a grama entre elas): sai como lista
    "grama_calcada": {"tipo": "lista", "cores": CALCADA | GRAMA | {21, 105, 24}, "exige": CALCADA, "minimo": 40, "quantos": 24},
    # no Mundo da Luz a água quase nunca encosta direto na grama: só nas lagoas do pântano (P2), com 3860a8 e 388038
    "agua_grama": {"tipo": "wang", "A": AGUA | {66}, "B": GRAMA | {47}, "neutros": {21, 105}, "regiao": (0, 0, 4096, 4096)},
    "grama_variacoes": {"tipo": "lista", "cores": GRAMA | FLORES, "exige": GRAMA, "minimo": 256, "quantos": 24},
    "penhasco_degraus": {"tipo": "lista", "cores": GRAMA | PENHASCO | TERRA, "exige": {103}, "minimo": 20, "quantos": 64},
    # o rio do P1 tem barranco dos dois lados: água contra o barranco, com a linha 282828 neutra
    "agua_penhasco": {"tipo": "wang", "A": AGUA, "B": {102, 103, 104}, "neutros": {105}, "regiao": (0, 0, 4096, 4096)},
    "mata_copa": {"tipo": "lista", "cores": COPA | TRONCO | GRAMA, "exige": COPA, "minimo": 128, "quantos": 40,
                  "regiao": (0, 0, 4096, 4096)},
    # P2 (só o que as fontes têm; sem recolorir para criar bioma). cores None: qualquer cor no tile.
    "areia_deserto": {"tipo": "lista", "cores": None, "exige": {1, 13}, "minimo": 160, "quantos": 32, "regiao": (0, 3072, 1024, 4096)},
    "montanha_chao": {"tipo": "lista", "cores": None, "exige": {3, 4, 5}, "minimo": 160, "quantos": 40, "regiao": (1536, 0, 3584, 1024)},
    "pantano_chao": {"tipo": "lista", "cores": None, "exige": {6, 15}, "minimo": 24, "quantos": 32, "regiao": (1536, 3072, 2560, 4096)},
    # a Ilha de Gelo do Mundo das Trevas: placas de gelo na água verde-escura (o lago congelado de Invernia)
    "gelo_agua": {"tipo": "wang", "A": {3, 4, 5, 7, 8, 9}, "B": {0, 1, 33}, "neutros": set(), "regiao": (0, 0, 1024, 1024),
                  "mapa": "alttp_vgmaps/LegendOfZelda-ALinkToThePast-DarkWorld-IceIsland.png"},
}

# Os assets. fonte: ("conjunto", nome) | ("gablaxian", n, (x, y, l, a) ou None) | ("mapa", x, y, l, a).
# estilo: "equipe" (terreno e vegetação) ou "aeko+equipe" (construções e objetos). ja_tem: o que a equipe já tem
# no estilo dela (equipe/mundo_recortes) e cobre o mesmo papel.
P1 = "P1"
P2 = "P2"
ASSETS = [
    # terreno
    {"nome": "grama_terra", "categoria": "terreno", "bioma": "campos, fazenda, todos", "fonte": ("conjunto", "grama_terra"),
     "ja_tem": "terreno_grama_sobre_terra (borda arredondada, cantos de dentro e de fora): a da equipe já serve de mancha; esta dá a borda irregular de estrada"},
    {"nome": "grama_calcada", "categoria": "terreno", "bioma": "vila", "fonte": ("conjunto", "grama_calcada"), "ja_tem": ""},
    {"nome": "grama_variacoes", "categoria": "terreno", "bioma": "campos, floresta", "fonte": ("conjunto", "grama_variacoes"),
     "ja_tem": "tufo_grama e o miolo das folhas de grama"},
    {"nome": "penhasco_degraus", "categoria": "terreno", "bioma": "campos, floresta, rio", "fonte": ("conjunto", "penhasco_degraus"), "ja_tem": ""},
    {"nome": "penhasco_morro_anel", "categoria": "terreno", "bioma": "campos (morro com todas as bordas)", "fonte": ("gablaxian", 2, None), "ja_tem": ""},
    {"nome": "agua_grama", "categoria": "terreno", "bioma": "rio, lagoas", "fonte": ("conjunto", "agua_grama"),
     "ja_tem": "manchas_terreno_lagoa (lagoa na areia) e ilha_areia_agua_rasa: a cor da água da equipe vale"},
    {"nome": "agua_penhasco", "categoria": "terreno", "bioma": "rio com barranco", "fonte": ("conjunto", "agua_penhasco"), "ja_tem": ""},
    {"nome": "lago_penhasco_anel", "categoria": "terreno", "bioma": "rio, lago (barranco em volta da água)", "fonte": ("gablaxian", 6, None), "ja_tem": ""},
    {"nome": "mata_copa", "categoria": "terreno", "bioma": "floresta temperada (mata fechada)", "fonte": ("conjunto", "mata_copa"), "ja_tem": ""},
    # vegetação
    {"nome": "arvore_grande", "categoria": "vegetacao", "bioma": "campos, vila, floresta", "fonte": ("gablaxian", 5, (1, 1, 64, 80)),
     "ja_tem": "arvore_verde/rosa/outono (mesmo papel, já no estilo; esta serve de segunda forma, mais baixa)"},
    {"nome": "mata_bloco", "categoria": "vegetacao", "bioma": "floresta temperada (borda de mata)", "fonte": ("gablaxian", 78, None), "ja_tem": ""},
    {"nome": "arvore_pequena", "categoria": "vegetacao", "bioma": "vila, campos", "fonte": ("gablaxian", 64, (0, 3, 31, 32)), "ja_tem": ""},
    {"nome": "arvore_pequena_rosa", "categoria": "vegetacao", "bioma": "vila", "fonte": ("gablaxian", 64, (31, 3, 31, 32)), "paleta": "vegetacao_rosa", "ja_tem": "arvore_rosa (grande)"},
    {"nome": "moita_grande", "categoria": "vegetacao", "bioma": "campos, floresta", "fonte": ("gablaxian", 10, None), "ja_tem": ""},
    {"nome": "moita_cruz", "categoria": "vegetacao", "bioma": "campos, floresta", "fonte": ("gablaxian", 16, None), "ja_tem": ""},
    {"nome": "arbusto", "categoria": "vegetacao", "bioma": "todos (cortável)", "fonte": ("mapa", 2224, 2608, 16, 16), "ja_tem": ""},
    {"nome": "toco", "categoria": "vegetacao", "bioma": "floresta", "fonte": ("gablaxian", 11, (1, 1, 32, 32)), "ja_tem": ""},
    {"nome": "sebe_horizontal", "categoria": "vegetacao", "bioma": "vila, fazenda", "fonte": ("mapa", 320, 1624, 112, 24), "ja_tem": ""},
    {"nome": "sebe_vertical", "categoria": "vegetacao", "bioma": "vila, fazenda", "fonte": ("mapa", 751, 1652, 17, 78), "paredes": {34}, "bordas": "lrb", "ja_tem": ""},
    {"nome": "sebe_rosa", "categoria": "vegetacao", "bioma": "vila", "fonte": ("gablaxian", 39, (1, 52, 24, 80)), "paleta": "vegetacao_rosa", "ja_tem": ""},
    {"nome": "canteiro_flores_rosa", "categoria": "vegetacao", "bioma": "vila", "fonte": ("gablaxian", 73, (51, 1, 80, 24)), "paleta": "vegetacao_rosa", "ja_tem": ""},
    {"nome": "flores_brancas", "categoria": "vegetacao", "bioma": "campos", "fonte": ("mapa", 2240, 2624, 16, 16), "ja_tem": ""},
    # construções
    {"nome": "casa_vermelha", "categoria": "construcoes", "bioma": "vila", "fonte": ("gablaxian", 75, (5, 24, 96, 96)), "ja_tem": ""},
    {"nome": "casa_azul", "categoria": "construcoes", "bioma": "vila", "fonte": ("gablaxian", 75, (3, 122, 96, 96)), "ja_tem": ""},
    {"nome": "casa_azul_grande", "categoria": "construcoes", "bioma": "vila", "fonte": ("gablaxian", 82, None), "ja_tem": ""},
    {"nome": "casa_azul_media", "categoria": "construcoes", "bioma": "vila", "fonte": ("gablaxian", 89, None), "ja_tem": ""},
    {"nome": "casa_vermelha_loja", "categoria": "construcoes", "bioma": "vila", "fonte": ("gablaxian", 104, None), "ja_tem": ""},
    {"nome": "casa_madeira", "categoria": "construcoes", "bioma": "vila, floresta", "fonte": ("gablaxian", 103, None), "ja_tem": ""},
    {"nome": "galpao_madeira", "categoria": "construcoes", "bioma": "fazenda, floresta", "fonte": ("gablaxian", 96, (0, 0, 62, 70)), "ja_tem": ""},
    {"nome": "portal_madeira", "categoria": "construcoes", "bioma": "vila (entrada)", "fonte": ("gablaxian", 3, (1, 1, 80, 40)), "ja_tem": ""},
    {"nome": "poco_madeira", "categoria": "construcoes", "bioma": "vila, fazenda", "fonte": ("gablaxian", 3, (8, 60, 28, 30)), "ja_tem": ""},
    {"nome": "poco_pedra", "categoria": "construcoes", "bioma": "vila", "fonte": ("gablaxian", 1, (146, 94, 30, 32)), "ja_tem": ""},
    {"nome": "ponte_madeira", "categoria": "construcoes", "bioma": "rio", "fonte": ("gablaxian", 68, None), "ja_tem": ""},
    {"nome": "cerca_estacas", "categoria": "construcoes", "bioma": "vila, fazenda", "fonte": ("mapa", 496, 1768, 64, 24), "ja_tem": ""},
    {"nome": "cerca_pecas", "categoria": "construcoes", "bioma": "fazenda", "fonte": ("gablaxian", 64, (63, 1, 32, 48)), "ja_tem": ""},
    # objetos
    {"nome": "placa", "categoria": "objetos", "bioma": "estradas, vila", "fonte": ("mapa", 320, 1664, 16, 16),
     "ja_tem": "mancha_areia_placa (placa \"NOME\" de lote)"},
    {"nome": "cata_vento_praca", "categoria": "objetos", "bioma": "vila (praça)", "fonte": ("gablaxian", 1, (65, 151, 25, 55)), "ja_tem": ""},
    {"nome": "banco_madeira", "categoria": "objetos", "bioma": "vila", "fonte": ("mapa", 336, 1966, 32, 20), "ja_tem": ""},
    {"nome": "banco_pedra", "categoria": "objetos", "bioma": "vila", "fonte": ("gablaxian", 73, (1, 8, 48, 16)), "ja_tem": ""},
    {"nome": "bebedouro", "categoria": "objetos", "bioma": "fazenda, vila", "fonte": ("mapa", 317, 2319, 40, 19), "ja_tem": ""},
    {"nome": "pedra_leve", "categoria": "objetos", "bioma": "todos", "fonte": ("mapa", 2176, 2880, 16, 16), "ja_tem": ""},
    {"nome": "canteiro_potes", "categoria": "objetos", "bioma": "vila, fazenda", "fonte": ("mapa", 328, 1880, 90, 48), "ja_tem": "potes do Aeko"},
]
ASSETS += [
    {"nome": "areia_deserto", "categoria": "terreno", "bioma": "Deserto e oásis", "fonte": ("conjunto", "areia_deserto"), "prioridade": P2, "ja_tem": "areia da ilha (eed382) é outra areia"},
    {"nome": "montanha_chao", "categoria": "terreno", "bioma": "Montanhas", "fonte": ("conjunto", "montanha_chao"), "prioridade": P2, "ja_tem": ""},
    {"nome": "pantano_chao", "categoria": "terreno", "bioma": "Pântano", "fonte": ("conjunto", "pantano_chao"), "prioridade": P2, "ja_tem": ""},
    {"nome": "gelo_agua", "categoria": "terreno", "bioma": "Neve e tundra (lago congelado)", "fonte": ("conjunto", "gelo_agua"), "prioridade": P2, "ja_tem": ""},
    {"nome": "arvore_vermelha", "categoria": "vegetacao", "bioma": "Floresta (outono), Terras mágicas", "fonte": ("gablaxian", 1, (0, 80, 64, 80)), "prioridade": P2, "ja_tem": "arvore_outono"},
    {"nome": "arvore_dourada", "categoria": "vegetacao", "bioma": "Floresta (fruta), Savana", "fonte": ("gablaxian", 1, (0, 161, 64, 80)), "prioridade": P2, "ja_tem": ""},
    {"nome": "tronco_oco", "categoria": "vegetacao", "bioma": "Floresta temperada", "fonte": ("gablaxian", 39, (141, 67, 64, 48)), "prioridade": P2, "ja_tem": ""},
    {"nome": "pedra_escura", "categoria": "objetos", "bioma": "todos (pedra que pede luva)", "fonte": ("mapa", 2096, 1264, 16, 16), "prioridade": P1, "ja_tem": ""},
    {"nome": "lapide", "categoria": "objetos", "bioma": "cemitério das cidades", "fonte": ("mapa", 2176, 1232, 32, 32), "prioridade": P2, "ja_tem": ""},
    {"nome": "cerca_pedra_poste", "categoria": "construcoes", "bioma": "cemitério, castelo", "fonte": ("mapa", 2096, 1216, 16, 16), "prioridade": P2, "ja_tem": ""},
    {"nome": "portao_ferro", "categoria": "construcoes", "bioma": "cemitério, castelo", "fonte": ("mapa", 2364, 1378, 34, 32), "prioridade": P2, "ja_tem": ""},
    {"nome": "estatua_pequena", "categoria": "objetos", "bioma": "Pântano, templos", "fonte": ("gablaxian", 29, None), "prioridade": P2, "ja_tem": ""},
    {"nome": "estatua_rosto", "categoria": "objetos", "bioma": "Pântano, templos", "fonte": ("gablaxian", 30, None), "prioridade": P2, "ja_tem": ""},
]
for _a in ASSETS:
    _a.setdefault("prioridade", P1)
    _a.setdefault("estilo", "equipe" if _a["categoria"] in ("terreno", "vegetacao") else "aeko+equipe")

# Paletas da equipe por grupo (os PNGs de equipe/mundo_recortes de onde saem as cores).
PALETAS = {
    "terreno": ["terreno_grama_sobre_terra.png", "terreno_grama_sobre_areia.png", "manchas_terreno_lagoa.png",
                "ilha_areia_agua_rasa.png", "mar_fundo.png", "tufo_grama.png"],
    "vegetacao": ["arvore_verde.png", "arvore_rosa.png", "palmeira.png", "tufo_grama.png", "terreno_grama_sobre_terra.png"],
    # o rosa do ALttP (vermelho-rosado) caía no laranja da palmeira com a paleta toda (2026-10-23): só a cerejeira
    "vegetacao_rosa": ["arvore_rosa.png"],
}


# --- leitura -------------------------------------------------------------------------------------------------


class Mapa:
    def __init__(self, raiz: Path, arquivo: str = MAPA_LUZ):
        im = Image.open(raiz / arquivo)
        self.idx = np.array(im)
        self.pal = np.array(im.getpalette(), np.uint8).reshape(-1, 3)
        self.rgb = self.pal[self.idx]
        h, w = self.idx.shape
        self.th, self.tw = h // T, w // T
        # cada tile como bytes, para contar os iguais
        blocos = self.idx.reshape(self.th, T, self.tw, T).swapaxes(1, 2)
        self.blocos = blocos
        chaves = blocos.reshape(self.th, self.tw, T * T)
        self.chave = np.empty((self.th, self.tw), object)
        for j in range(self.th):
            for i in range(self.tw):
                self.chave[j, i] = chaves[j, i].tobytes()

    def tiles_da_regiao(self, regiao):
        """{bytes do tile: (contagem, (tx, ty) do primeiro)} na região (pixels)."""
        x0, y0, x1, y1 = regiao
        cont: dict = {}
        for ty in range(y0 // T, y1 // T):
            for tx in range(x0 // T, x1 // T):
                k = self.chave[ty, tx]
                if k in cont:
                    cont[k][0] += 1
                else:
                    cont[k] = [1, (tx, ty)]
        return cont

    def tile_rgba(self, tx, ty):
        rgb = self.rgb[ty * T:(ty + 1) * T, tx * T:(tx + 1) * T]
        return np.dstack([rgb, np.full((T, T), 255, np.uint8)])

    def recorte(self, x, y, l, a):
        return self.idx[y:y + a, x:x + l], self.rgb[y:y + a, x:x + l]


def _luminancia(pal):
    return pal @ np.array([0.299, 0.587, 0.114])


# --- terreno -------------------------------------------------------------------------------------------------


def _codigo_wang(t: np.ndarray, permitido, emA, emB):
    """Código de Wang de cantos do tile (TL1 + TR2 + BL4 + BR8, bit = quadrante de 8×8 com mais A que B), ou -1."""
    if not permitido[t].all():
        return -1
    a, b = emA[t], emB[t]
    if not a.any() and not b.any():
        return -1
    codigo = 0
    for bit, (qy, qx) in zip((1, 2, 4, 8), ((0, 0), (0, 1), (1, 0), (1, 1))):
        if a[qy * 8:qy * 8 + 8, qx * 8:qx * 8 + 8].sum() > b[qy * 8:qy * 8 + 8, qx * 8:qx * 8 + 8].sum():
            codigo |= bit
    return codigo


def _casam(c1: int, c2: int, horizontal: bool) -> bool:
    """c1 à esquerda (ou em cima) de c2: os cantos do lado comum têm de ser iguais."""
    if horizontal:
        return ((c1 >> 1) & 1) == (c2 & 1) and ((c1 >> 3) & 1) == ((c2 >> 2) & 1)
    return ((c1 >> 2) & 1) == (c2 & 1) and ((c1 >> 3) & 1) == ((c2 >> 1) & 1)


def folha_wang(mapa: Mapa, c: dict):  # noqa: C901
    """
    Folha 4 colunas: 4 linhas de Wang (código = TL1 + TR2 + BL4 + BR8, bit = material A) e 2 de variações.

    Para cada código vale o tile que mais aparece encostado, no próprio mapa, nos tiles escolhidos para os códigos
    que casam com ele (otimização por coordenadas a partir do mais usado): assim as peças da folha vêm de trechos que
    o ALttP já monta juntos, e as emendas fecham. Só o mais usado de cada código não fechava (2026-10-23).
    """
    regiao = c.get("regiao", REGIAO_P1)
    A, B, N = c["A"], c["B"], c["neutros"]
    permitido = np.zeros(256, bool)
    for s in (A, B, N):
        permitido[list(s)] = True
    emA = np.zeros(256, bool)
    emA[list(A)] = True
    emB = np.zeros(256, bool)
    emB[list(B)] = True
    x0, y0, x1, y1 = regiao
    ty0, tx0, ty1, tx1 = y0 // T, x0 // T, y1 // T, x1 // T
    codigos = {}
    grade = np.full((ty1 - ty0, tx1 - tx0), -1)
    chaves = mapa.chave[ty0:ty1, tx0:tx1]
    freq: dict = {}
    onde: dict = {}
    for j in range(ty1 - ty0):
        for i in range(tx1 - tx0):
            k = chaves[j, i]
            if k not in codigos:
                codigos[k] = _codigo_wang(np.frombuffer(k, np.uint8).reshape(T, T), permitido, emA, emB)
            grade[j, i] = codigos[k]
            if codigos[k] >= 0:
                freq[k] = freq.get(k, 0) + 1
                onde.setdefault(k, (tx0 + i, ty0 + j))
    vizinhos: dict = {}
    for j in range(grade.shape[0]):
        for i in range(grade.shape[1]):
            if grade[j, i] < 0:
                continue
            for dj, di, hor in ((0, 1, True), (1, 0, False)):
                jj, ii = j + dj, i + di
                if jj < grade.shape[0] and ii < grade.shape[1] and grade[jj, ii] >= 0 and _casam(grade[j, i], grade[jj, ii], hor):
                    par = (chaves[j, i], chaves[jj, ii], hor)
                    vizinhos[par] = vizinhos.get(par, 0) + 1
    candidatos: dict = {}
    for k, n in freq.items():
        candidatos.setdefault(codigos[k], []).append((n, k))
    for cod in candidatos:
        candidatos[cod] = [k for _, k in sorted(candidatos[cod], key=lambda x: -x[0])[:16]]
    escolha = {cod: ks[0] for cod, ks in candidatos.items()}

    def pontos(cod, k):
        s = 0.0
        for outro, ko in escolha.items():
            if outro == cod:
                continue
            for hor in (True, False):
                if _casam(cod, outro, hor):
                    s += vizinhos.get((k, ko, hor), 0)
                if _casam(outro, cod, hor):
                    s += vizinhos.get((ko, k, hor), 0)
        return s + 0.01 * np.log1p(freq[k])

    for _ in range(6):
        mudou = False
        for cod, ks in candidatos.items():
            melhor = max(ks, key=lambda k: pontos(cod, k))
            if melhor != escolha[cod]:
                escolha[cod], mudou = melhor, True
        if not mudou:
            break
    melhores = {cod: (freq[k], *onde[k]) for cod, k in escolha.items()}
    miolos = {cod: [(freq[k], *onde[k]) for k in candidatos.get(cod, [])] for cod in (15, 0)}
    relatorio = {}
    folha = np.zeros((6 * T, 4 * T, 4), np.uint8)
    for codigo in range(16):
        if codigo in melhores:
            _, tx, ty = melhores[codigo]
            r, col = codigo // 4, codigo % 4
            folha[r * T:(r + 1) * T, col * T:(col + 1) * T] = mapa.tile_rgba(tx, ty)
            relatorio[codigo] = {"tile": [tx, ty], "usos": melhores[codigo][0],
                                 "encaixes": int(pontos(codigo, escolha[codigo]))}
    # variações: os 4 miolos mais usados de A (linha 4) e de B (linha 5)
    for linha, codigo in ((4, 15), (5, 0)):
        for col, (_, tx, ty) in enumerate(sorted(miolos[codigo], reverse=True)[:4]):
            folha[linha * T:(linha + 1) * T, col * T:(col + 1) * T] = mapa.tile_rgba(tx, ty)
    sinteticas = completar_wang(folha, set(melhores))
    faltam = [k for k in range(16) if k not in melhores and k not in sinteticas]
    return folha, {"esquema": "wang16_cantos", "pecas": relatorio, "faltam": faltam, "sinteticas": sinteticas,
                   "variacoes_A": len(miolos[15]), "variacoes_B": len(miolos[0])}


def _espelho_codigo(cod: int, h: bool, v: bool) -> int:
    tl, tr, bl, br = cod & 1, (cod >> 1) & 1, (cod >> 2) & 1, (cod >> 3) & 1
    if h:
        tl, tr, bl, br = tr, tl, br, bl
    if v:
        tl, tr, bl, br = bl, br, tl, tr
    return tl | tr << 1 | bl << 2 | br << 3


def completar_wang(folha: np.ndarray, tem: set) -> dict:
    """
    Preenche na folha as peças de Wang que o mapa não tem: primeiro espelhando uma que existe (a luz do ALttP vem de
    cima e da esquerda, então o espelho pode inverter um sombreado: conferir); depois compondo por quadrantes de 8×8,
    cada quadrante tirado de uma peça que concorda com ele e com os dois quadrantes vizinhos (as diagonais 6 e 9).
    Devolve {código: como foi feita}.
    """
    def peca(c):
        r, k = c // 4, c % 4
        return folha[r * T:(r + 1) * T, k * T:(k + 1) * T]

    feitas = {}
    for cod in range(16):
        if cod in tem:
            continue
        for h, v, nome in ((True, False, "espelho horizontal"), (False, True, "espelho vertical"), (True, True, "giro 180")):
            base = _espelho_codigo(cod, h, v)
            if base in tem:
                p = peca(base)
                p = p[:, ::-1] if h else p
                p = p[::-1] if v else p
                peca(cod)[...] = p
                feitas[cod] = f"{nome} da {base}"
                break
    existentes = tem | set(feitas)
    quadrantes = {0: (0, 0), 1: (0, 1), 2: (1, 0), 3: (1, 1)}  # bit -> (linha, coluna) do quadrante
    vizinhos = {0: (1, 2), 1: (0, 3), 2: (0, 3), 3: (1, 2)}
    for cod in range(16):
        if cod in existentes:
            continue
        partes = []
        for q in range(4):
            quer = [q, *vizinhos[q]]
            fonte = next((c for c in sorted(tem) + sorted(feitas) if all(((c >> b) & 1) == ((cod >> b) & 1) for b in quer)), None)
            if fonte is None:
                partes = None
                break
            partes.append((q, fonte))
        if partes:
            for q, fonte in partes:
                qy, qx = quadrantes[q]
                peca(cod)[qy * 8:qy * 8 + 8, qx * 8:qx * 8 + 8] = peca(fonte)[qy * 8:qy * 8 + 8, qx * 8:qx * 8 + 8]
            feitas[cod] = "quadrantes de " + ", ".join(str(f) for _, f in partes)
    return feitas


# Cantos (1 = material A) de uma montagem de teste: uma mancha com bordas retas, cantos de fora e de dentro e um furo.
CANTOS_TESTE = [
    "000000000000",
    "001111110000",
    "011111111000",
    "011100111000",
    "011100111110",
    "011111111110",
    "001111001110",
    "000110000000",
    "000000000000",
]


def montagem_wang(folha: np.ndarray) -> np.ndarray:
    """Pinta CANTOS_TESTE com as peças da folha (dual grid: cada tile pega os 4 cantos em volta). Peça que falta sai
    em magenta. Serve para ver se as emendas fecham."""
    cantos = np.array([[int(ch) for ch in linha] for linha in CANTOS_TESTE])
    h, w = cantos.shape[0] - 1, cantos.shape[1] - 1
    saida = np.zeros((h * T, w * T, 4), np.uint8)
    for j in range(h):
        for i in range(w):
            cod = cantos[j, i] * 1 + cantos[j, i + 1] * 2 + cantos[j + 1, i] * 4 + cantos[j + 1, i + 1] * 8
            r, col = cod // 4, cod % 4
            peca = folha[r * T:(r + 1) * T, col * T:(col + 1) * T]
            if peca[..., 3].max() == 0:
                peca = np.zeros((T, T, 4), np.uint8)
                peca[...] = (255, 0, 255, 255)
            saida[j * T:(j + 1) * T, i * T:(i + 1) * T] = peca
    return saida


def folha_lista(mapa: Mapa, c: dict):
    permitido = np.zeros(256, bool)
    permitido[list(c["cores"]) if c.get("cores") else slice(None)] = True
    escolhidos = []
    for chave, (n, (tx, ty)) in mapa.tiles_da_regiao(c.get("regiao", REGIAO_P1)).items():
        t = np.frombuffer(chave, np.uint8).reshape(T, T)
        if not permitido[t].all():
            continue
        grupos = c.get("exige_todos") or [c["exige"]]
        if all(np.isin(t, list(g)).sum() >= c["minimo"] for g in grupos):
            escolhidos.append((n, tx, ty))
    escolhidos.sort(reverse=True)
    escolhidos = escolhidos[:c["quantos"]]
    col = 8
    linhas = max(1, -(-len(escolhidos) // col))
    folha = np.zeros((linhas * T, col * T, 4), np.uint8)
    for i, (_, tx, ty) in enumerate(escolhidos):
        r, k = divmod(i, col)
        folha[r * T:(r + 1) * T, k * T:(k + 1) * T] = mapa.tile_rgba(tx, ty)
    return folha, {"esquema": "lista_por_uso", "tiles": [[tx, ty, n] for n, tx, ty in escolhidos]}


# --- objetos -------------------------------------------------------------------------------------------------


def tirar_chao(idx: np.ndarray, rgb: np.ndarray, pal: np.ndarray, paredes=frozenset(), bordas: str = "clrb") -> np.ndarray:
    """Recorte do mapa → RGBA: some o chão ligado à moldura (inundação que para nas cores escuras do contorno e nas
    `paredes`, índices a mais que fecham o objeto, como o verde escuro da sebe). `bordas`: de que lados da moldura a
    inundação começa (c = cima, l = esquerda, r = direita, b = baixo); a sebe vertical continua para cima no mapa e o
    miolo dela é da cor da grama, então ali a inundação não começa em cima)."""
    escuro = _luminancia(pal.astype(float)) < 60
    escuro[list(paredes)] = True
    chao = np.zeros(256, bool)
    chao[list(GRAMA | TERRA | CALCADA | FLORES | {72, 15, 47})] = True
    pode = chao[idx] & ~escuro[idx]
    rotulos, _ = ndimage.label(pode)
    lados = {"c": rotulos[0], "b": rotulos[-1], "l": rotulos[:, 0], "r": rotulos[:, -1]}
    borda = set(np.unique(np.concatenate([lados[k] for k in bordas]))) - {0}
    fundo = np.isin(rotulos, list(borda))
    alfa = np.where(fundo, 0, 255).astype(np.uint8)
    return np.dstack([rgb, alfa])


def aparar(rgba: np.ndarray) -> np.ndarray:
    op = rgba[..., 3] > 0
    if not op.any():
        return rgba
    ys, xs = np.where(op)
    return rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def gablaxian(raiz: Path, n: int, ret):
    pasta = raiz / GABLAXIAN
    arq = next(pasta.glob(f"peca_{n:03d}_*.png"))
    a = np.array(Image.open(arq).convert("RGBA"))
    if ret:
        x, y, l, h = ret
        a = a[y:y + h, x:x + l]
    a = a.copy()
    a[a[..., 3] < 128] = 0
    a[a[..., 3] >= 128, 3] = 255
    return aparar(a), arq.name


# --- caminhos ------------------------------------------------------------------------------------------------


def caminho(raiz: Path, a: dict, tipo: str) -> Path:
    return raiz / "assets" / a["categoria"] / f"{a['nome']}_{tipo}.png"


def ler_indice(raiz: Path) -> dict:
    arq = raiz / "assets" / "_indice.json"
    if arq.exists():
        return {d["asset"]: d for d in json.loads(arq.read_text(encoding="utf8"))}
    return {}


def gravar_indice(raiz: Path, ind: dict):
    arq = raiz / "assets" / "_indice.json"
    ordem = [a["nome"] for a in ASSETS]
    lista = sorted(ind.values(), key=lambda d: ordem.index(d["asset"]) if d["asset"] in ordem else 999)
    arq.write_text(json.dumps(lista, ensure_ascii=False, indent=1), encoding="utf8")


def entrada(ind: dict, a: dict, raiz: Path) -> dict:
    d = ind.setdefault(a["nome"], {"asset": a["nome"]})
    d.update({"categoria": a["categoria"], "bioma": a["bioma"], "prioridade": a["prioridade"], "estilo_alvo": a["estilo"],
              "ja_tem_equipe": a.get("ja_tem", ""), "original": str(caminho(raiz, a, "original"))})
    return d


# --- etapas --------------------------------------------------------------------------------------------------


def separar(raiz: Path, assets: list):
    mapas = {MAPA_LUZ: Mapa(raiz)}

    def mapa_de(arquivo):
        if arquivo not in mapas:
            mapas[arquivo] = Mapa(raiz, arquivo)
        return mapas[arquivo]

    mapa = mapas[MAPA_LUZ]
    ind = ler_indice(raiz)
    for a in assets:
        f = a["fonte"]
        d = entrada(ind, a, raiz)
        if f[0] == "conjunto":
            c = CONJUNTOS[f[1]]
            m = mapa_de(c.get("mapa", MAPA_LUZ))
            img, info = folha_wang(m, c) if c["tipo"] == "wang" else folha_lista(m, c)
            info["mapa"] = Path(c.get("mapa", MAPA_LUZ)).name
            d["fonte"] = {"tipo": "mapa do Mundo da Luz", **info}
        elif f[0] == "gablaxian":
            img, nome = gablaxian(raiz, f[1], f[2])
            d["fonte"] = {"tipo": "gablaxian", "arquivo": nome, "recorte": f[2]}
        else:
            _, x, y, l, h = f
            idx, rgb = mapa.recorte(x, y, l, h)
            img = aparar(tirar_chao(idx, rgb, mapa.pal, a.get("paredes", set()), a.get("bordas", "clrb")))
            d["fonte"] = {"tipo": "recorte do mapa do Mundo da Luz", "px": [x, y, l, h]}
        saida = caminho(raiz, a, "original")
        saida.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(img).save(saida)
        if d["fonte"].get("esquema") == "wang16_cantos":
            Image.fromarray(montagem_wang(img)).save(caminho(raiz, a, "montagem_original"))
        d["tamanho"] = [int(img.shape[1]), int(img.shape[0])]
        print(f"separado {a['categoria']}/{a['nome']} {img.shape[1]}×{img.shape[0]}")
    gravar_indice(raiz, ind)


def paleta_png(raiz: Path, grupo: str) -> Path:
    """Junta as cores dos PNGs da equipe do grupo numa tira (a ferramenta de estilo lê a paleta de um PNG)."""
    saida = raiz / "assets" / f"_paleta_{grupo}.png"
    cores = []
    for nome in PALETAS[grupo]:
        im = np.array(Image.open(EQUIPE / nome).convert("RGBA"))
        cores.append(im[..., :3][im[..., 3] > 0])
    u = np.unique(np.concatenate(cores), axis=0)
    tira = np.dstack([u[None, :, :], np.full((1, len(u)), 255, np.uint8)])
    saida.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(tira.astype(np.uint8)).save(saida)
    return saida


def opcoes_de_estilo(raiz: Path, a: dict) -> dict:
    if a["categoria"] == "terreno":
        return {"estilo": "equipe", "paleta": str(paleta_png(raiz, "terreno")), "contorno": "nao", "fundo": "nenhum"}
    if a["categoria"] == "vegetacao":
        return {"estilo": "equipe", "paleta": str(paleta_png(raiz, a.get("paleta", "vegetacao"))), "contorno": "externo",
                "cor_contorno": "escuro", "fundo": "nenhum"}
    # paleta "estilo": presa à paleta do alvo desde a primeira tentativa (com "auto" a primeira tentativa, só contorno,
    # já passava de 8 e as cores do ALttP ficavam como estavam)
    return {"estilo": "aeko+equipe", "mistura": 0.5, "paleta": "estilo", "contorno": "externo", "cor_contorno": "auto",
            "fundo": "nenhum"}


def estilo(raiz: Path, assets: list):
    ind = ler_indice(raiz)
    for a in assets:
        d = entrada(ind, a, raiz)
        o = opcoes_de_estilo(raiz, a)
        r = est.aplicar(caminho(raiz, a, "original"), caminho(raiz, a, "estilo"), escala="1", nota_minima=8.0, **o)
        d["estilo"] = str(caminho(raiz, a, "estilo"))
        d["opcoes_estilo"] = {k: (Path(v).name if k == "paleta" and os.path.isfile(str(v)) else v) for k, v in o.items()}
        d["nota_estilo"] = round(float(r["nota"]), 2)
        d["chegou_8"] = bool(r["chegou"])
        d["cores"] = [int(r["cores_antes"]), int(r["cores_depois"])]
        print(f"estilo {a['nome']}: nota {r['nota']:.2f}{'' if r['chegou'] else ' (abaixo de 8)'}")
    gravar_indice(raiz, ind)


LUA_LIMPAR = r"""
local L = dofile(app.params["limpeza"])
for linha in io.lines(app.params["lista"]) do
  local entrada, saida = linha:match("^(.-)|(.-)$")
  local img = Image{ fromFile = entrada }
  local antes = L.analisar_imagem(img, { cores_linha = "auto", jaggies = "relatar", orfaos = "relatar" })
  local nova, rel = L.limpar_imagem(img, { cores_linha = "auto", doubles = true, jaggies = "corrigir", orfaos = "relatar" })
  nova:saveAs(saida)
  local depois = rel.depois and rel.depois.nota or rel.nota
  print(string.format("REL|%s|%s|%s|%d|%d|%d|%d|%s", entrada, tostring(antes.nota), tostring(depois),
    rel.doubles.corrigidos, rel.jaggies.corrigidos, rel.orfaos.encontrados, rel.mudados, table.concat(rel.cores_linha, " ")))
end
print("FIM")
"""


def achar_aseprite() -> str | None:
    if os.environ.get("ASEPRITE_PATH") and os.path.exists(os.environ["ASEPRITE_PATH"]):
        return os.environ["ASEPRITE_PATH"]
    try:
        mcp = json.loads((RAIZ_REPO / ".mcp.json").read_text(encoding="utf8"))
        p = mcp["mcpServers"]["aseprite"]["env"]["ASEPRITE_PATH"]
        if os.path.exists(p):
            return p
    except (OSError, KeyError, ValueError):
        pass
    p = r"C:\Program Files (x86)\Steam\steamapps\common\Aseprite\Aseprite.exe"
    return p if os.path.exists(p) else None


def limpar(raiz: Path, assets: list):
    """Um processo -b só para todos (testes do Aseprite em lote: poucos e curtos, um por vez)."""
    ase = achar_aseprite()
    if not ase:
        print("sem Aseprite: limpeza pulada")
        return
    ind = ler_indice(raiz)
    alvos = [a for a in assets if a["categoria"] != "terreno"]
    pasta = raiz / "assets"
    lista = pasta / "_limpar_lista.txt"
    script = pasta / "_limpar.lua"
    lista.write_text("\n".join(f"{caminho(raiz, a, 'estilo')}|{caminho(raiz, a, 'estilo')}" for a in alvos) + "\n", encoding="utf8")
    script.write_text(LUA_LIMPAR, encoding="utf8")
    r = subprocess.run([ase, "-b", "--script-param", f"limpeza={LIMPEZA}", "--script-param", f"lista={lista}",
                        "--script", str(script)], capture_output=True, text=True, encoding="utf8", timeout=600)
    por_arquivo = {}
    for linha in (r.stdout or "").splitlines():
        if linha.startswith("REL|"):
            _, arq, antes, depois, dbl, jag, orf, mud, cores = linha.split("|")
            por_arquivo[os.path.normcase(arq)] = {"nota_linha_antes": float(antes), "nota_linha": float(depois),
                                                  "doubles": int(dbl), "jaggies": int(jag), "orfaos_relatados": int(orf),
                                                  "pixels_mudados": int(mud), "cor_linha": cores}
    for a in alvos:
        d = entrada(ind, a, raiz)
        rel = por_arquivo.get(os.path.normcase(str(caminho(raiz, a, "estilo"))))
        if rel:
            d["limpeza"] = rel
            d["nota_linha"] = rel["nota_linha"]
            print(f"limpo {a['nome']}: linha {rel['nota_linha_antes']} → {rel['nota_linha']} ({rel['pixels_mudados']} px)")
        else:
            print(f"limpeza sem resultado para {a['nome']}")
    for arq in (lista, script):
        arq.unlink(missing_ok=True)
    if "FIM" not in (r.stdout or ""):
        print(r.stdout[-2000:], r.stderr[-2000:])
    gravar_indice(raiz, ind)


# --- melhorar ------------------------------------------------------------------------------------------------

# Terreno: cada cor do ALttP vai para a cor da equipe do mesmo papel (medidas em equipe/mundo_recortes, 2026-10-23).
# Grama: 52995b (miolo), 4c8c61 e 2f7c5c (tufos, beira); terra: 956538, 604e2e, c89769; água: 72b3f0 (rasa),
# 5289ff, 2b70e2 (funda), cee7ff (brilho/espuma); barranco: a terra escura da equipe e 323f33 no lugar do preto.
PAPEIS_TERRENO = {
    "48a048": "52995b", "307030": "2f7c5c", "408040": "4c8c61", "ffffff": "f4f0e0",
    "908048": "956538", "806038": "7c5634", "604828": "604e2e", "483828": "4a3a2a", "282828": "323f33",
    "3860b0": "5289ff", "5880c0": "72b3f0", "70b8ff": "cee7ff", "304880": "2b70e2",
    "80c090": "c8b89a", "508070": "8c7a68", "a8e8b0": "e8dcc0",
    "305830": "1f6852", "286840": "287f59", "605030": "6b444b", "907040": "936551",
}


def _hex(c):
    return "%02x%02x%02x" % tuple(int(v) for v in c[:3])


def recolorir(rgba: np.ndarray, mapa_cores: dict, tolerancia: float = 24.0) -> np.ndarray:
    """Cada cor vai para o papel da cor de `mapa_cores` mais perto (distância RGB até `tolerancia`): as peças da
    gablaxian têm o mesmo desenho do mapa com valores de cor um pouco diferentes."""
    de = np.array([[int(k[i:i + 2], 16) for i in (0, 2, 4)] for k in mapa_cores], float)
    para = np.array([[int(v[i:i + 2], 16) for i in (0, 2, 4)] for v in mapa_cores.values()], np.uint8)
    saida = rgba.copy()
    op = rgba[..., 3] > 0
    cores = np.unique(rgba[op][:, :3], axis=0)
    for c in cores:
        dist = np.linalg.norm(de - c.astype(float), axis=1)
        i = int(np.argmin(dist))
        if dist[i] <= tolerancia:
            m = op & (rgba[..., :3] == c).all(-1)
            saida[m, :3] = para[i]
    return saida


def rampa_de(rgba: np.ndarray, mascara: np.ndarray):
    """Cores da máscara ordenadas da mais escura à mais clara, com a contagem."""
    cores, n = np.unique(rgba[mascara][:, :3], axis=0, return_counts=True)
    ordem = np.argsort(_luminancia(cores.astype(float)))
    return cores[ordem], n[ordem]


def trocar_rampa(rgba: np.ndarray, mascara: np.ndarray, rampa_nova: np.ndarray, por_brilho: bool = False) -> np.ndarray:
    """
    Cada cor da máscara vai para uma cor da rampa nova: na mesma posição relativa (a copa inteira vira a rampa
    inteira) ou, com `por_brilho`, na de brilho mais perto (a madeira clara continua clara; pela posição, as paredes
    bege viravam a ponta escura da rampa, 2026-10-23).
    """
    cores, _ = rampa_de(rgba, mascara)
    saida = rgba.copy()
    k = len(rampa_nova)
    lum_nova = _luminancia(np.asarray(rampa_nova, float))
    for i, c in enumerate(cores):
        if por_brilho:
            alvo = rampa_nova[int(np.argmin(np.abs(lum_nova - _luminancia(c.astype(float)))))]
        else:
            alvo = rampa_nova[min(k - 1, int(round(i * (k - 1) / max(1, len(cores) - 1))))]
        m = mascara & (rgba[..., :3] == c).all(-1)
        saida[m, :3] = alvo
    return saida


def mascara_de_matiz(rgba: np.ndarray, h0: float, h1: float, sat_min=0.18) -> np.ndarray:
    rgb = rgba[..., :3].astype(float) / 255
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = np.where(mx - mn == 0, 1, mx - mn)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    s = np.where(mx == 0, 0, (mx - mn) / np.where(mx == 0, 1, mx))
    if h0 <= h1:
        dentro = (h >= h0) & (h <= h1)
    else:
        dentro = (h >= h0) | (h <= h1)
    return dentro & (s >= sat_min) & (rgba[..., 3] > 0) & (mx > 0.12)


def rampa_equipe(arquivo: str, h0: float, h1: float) -> np.ndarray:
    im = np.array(Image.open(EQUIPE / arquivo).convert("RGBA"))
    cores, n = rampa_de(im, mascara_de_matiz(im, h0, h1))
    return cores[n >= 40]


def lado_a_lado(imgs: list[np.ndarray], gap: int = 4) -> np.ndarray:
    h = max(i.shape[0] for i in imgs)
    w = sum(i.shape[1] for i in imgs) + gap * (len(imgs) - 1)
    saida = np.zeros((h, w, 4), np.uint8)
    x = 0
    for i in imgs:
        saida[h - i.shape[0]:, x:x + i.shape[1]] = i
        x += i.shape[1] + gap
    return saida


def melhorar(raiz: Path, assets: list):
    ind = ler_indice(raiz)
    for a in assets:
        d = entrada(ind, a, raiz)
        orig = np.array(Image.open(caminho(raiz, a, "original")).convert("RGBA"))
        feita = None
        nota = ""
        if a["categoria"] == "terreno" and a["prioridade"] == P1:
            # só o P1: os papéis são os materiais do reino de Haywood; a areia do deserto, o chão da montanha e o
            # gelo não têm cor na arte da equipe (e mapeá-los nos papéis de grama/terra estraga, 2026-10-23)
            feita = recolorir(orig, PAPEIS_TERRENO)
            nota = "recolorido papel a papel nas cores da equipe (grama, terra, água, barranco), forma do original intacta"
        elif a["nome"] in MELHORIAS:
            feita, nota = MELHORIAS[a["nome"]](raiz, a, orig)
        if feita is None:
            continue
        Image.fromarray(feita).save(caminho(raiz, a, "melhorado"))
        if d.get("fonte", {}).get("esquema") == "wang16_cantos":
            Image.fromarray(montagem_wang(feita)).save(caminho(raiz, a, "montagem_melhorado"))
        d["melhorado"] = str(caminho(raiz, a, "melhorado"))
        d["melhoria"] = nota
        print(f"melhorado {a['nome']}: {nota}")
    gravar_indice(raiz, ind)


def _estilo_de(raiz, a):
    return np.array(Image.open(caminho(raiz, a, "estilo")).convert("RGBA"))


def _estacoes(raiz, a, orig):
    """Árvore nas quatro estações: a copa (verde) recolorida com as rampas das árvores da equipe."""
    base = _estilo_de(raiz, a)
    copa = mascara_de_matiz(base, 75, 175)
    verao = trocar_rampa(base, copa, rampa_equipe("arvore_verde.png", 75, 175))
    primavera = trocar_rampa(base, copa, rampa_equipe("arvore_rosa.png", 290, 345))
    outono = trocar_rampa(base, copa, rampa_equipe("arvore_outono.png", 15, 45))
    inverno_rampa = np.array([[0x3a, 0x4a, 0x5a], [0x6a, 0x7e, 0x90], [0xa8, 0xbc, 0xcc], [0xdc, 0xe8, 0xf0], [0xf6, 0xfa, 0xff]], np.uint8)
    inverno = trocar_rampa(base, copa, inverno_rampa)
    return lado_a_lado([verao, primavera, outono, inverno]), "quatro estações (verão, primavera, outono, inverno) por recolorir a copa com as rampas da equipe"


def _telhado(h0, h1, rampas):
    def f(raiz, a, orig):
        base = _estilo_de(raiz, a)
        tel = mascara_de_matiz(base, h0, h1, 0.15)
        variantes = [base] + [trocar_rampa(base, tel, np.array(r, np.uint8)) for r in rampas]
        return lado_a_lado(variantes), "variações de cor do telhado (a primeira é a do estilo)"
    return f


TELHA_VERDE = [[0x18, 0x46, 0x44], [0x28, 0x7f, 0x59], [0x36, 0x99, 0x5b], [0x63, 0xae, 0x65], [0x8c, 0xc0, 0x7b]]
TELHA_VERMELHA = [[0x4c, 0x2b, 0x3b], [0x8a, 0x3a, 0x3a], [0xb0, 0x50, 0x48], [0xd0, 0x70, 0x58], [0xe8, 0x98, 0x78]]
TELHA_AZUL = [[0x1c, 0x2c, 0x5a], [0x2b, 0x50, 0xa0], [0x3e, 0x70, 0xc8], [0x5f, 0x93, 0xe0], [0x8c, 0xb8, 0xf0]]
TELHA_MARROM = [[0x36, 0x1d, 0x00], [0x5e, 0x32, 0x00], [0x87, 0x48, 0x00], [0xa7, 0x59, 0x00], [0xcf, 0x6e, 0x00]]

# A madeira das construções (o bege e o oliva do ALttP) vai para a rampa de madeira da equipe (troncos das árvores,
# placa e terra da folha de terreno); a pedra verde-menta do ALttP, para o cinza das pedras da ilha da equipe.
MADEIRA_EQUIPE = [[0x4c, 0x2b, 0x3b], [0x6b, 0x44, 0x4b], [0x84, 0x5e, 0x4a], [0x98, 0x5d, 0x50], [0xb0, 0x79, 0x53],
                  [0xc8, 0x97, 0x69], [0xeb, 0xbc, 0x6d]]
PEDRA_EQUIPE = [[0x2e, 0x2a, 0x30], [0x55, 0x50, 0x4f], [0x76, 0x72, 0x71], [0x93, 0x93, 0x93], [0xae, 0xa8, 0xa8], [0xd3, 0xcf, 0xcf]]


def _madeira_pedra(pedra: bool, telhado=None):
    def f(raiz, a, orig):
        base = _estilo_de(raiz, a)
        # as máscaras saem do estilo, antes de trocar a madeira (o marrom-ameixa da madeira da equipe cairia no
        # telhado vermelho)
        tel = mascara_de_matiz(base, telhado[0], telhado[1], 0.22) if telhado else None
        feita = trocar_rampa(base, mascara_de_matiz(base, 18, 62, 0.2), np.array(MADEIRA_EQUIPE, np.uint8), True)
        nota = "madeira na rampa da equipe"
        if pedra:
            feita = trocar_rampa(feita, mascara_de_matiz(feita, 110, 175, 0.12), np.array(PEDRA_EQUIPE, np.uint8), True)
            nota += ", pedra verde-menta no cinza da equipe"
        if telhado:
            rampas = telhado[2]
            feita = lado_a_lado([feita] + [trocar_rampa(feita, tel, np.array(r, np.uint8), True) for r in rampas])
            nota += "; variações de cor do telhado (a primeira é a do estilo)"
        return feita, nota
    return f


MELHORIAS = {
    "arvore_grande": _estacoes,
    "arvore_pequena": _estacoes,
    "moita_grande": _estacoes,
    "casa_vermelha": _madeira_pedra(True, (335, 12, [TELHA_AZUL, TELHA_VERDE, TELHA_MARROM])),
    "casa_azul": _madeira_pedra(True, (195, 245, [TELHA_VERMELHA, TELHA_VERDE, TELHA_MARROM])),
    "casa_azul_grande": _madeira_pedra(True),
    "casa_azul_media": _madeira_pedra(True),
    "casa_vermelha_loja": _madeira_pedra(True),
    "casa_madeira": _madeira_pedra(True),
    "galpao_madeira": _madeira_pedra(False),
    "portal_madeira": _madeira_pedra(False),
    "poco_madeira": _madeira_pedra(False),
    "poco_pedra": _madeira_pedra(True),
    "pedra_escura": _madeira_pedra(True),
    "cerca_pedra_poste": _madeira_pedra(True),
    "estatua_pequena": _madeira_pedra(True),
    "estatua_rosto": _madeira_pedra(True),
    "tronco_oco": _madeira_pedra(False),
    "ponte_madeira": _madeira_pedra(False),
    "cerca_estacas": _madeira_pedra(False),
    "cerca_pecas": _madeira_pedra(False),
    "placa": _madeira_pedra(False),
    "cata_vento_praca": _madeira_pedra(True),
    "banco_madeira": _madeira_pedra(False),
    "banco_pedra": _madeira_pedra(True),
    "bebedouro": _madeira_pedra(False),
    "pedra_leve": _madeira_pedra(True),
    "canteiro_potes": _madeira_pedra(False),
}


# --- avaliação (olhando as folhas de comparação, 2026-10-23) --------------------------------------------------

# Qual versão usar e o que precisa de mão da equipe. Sem entrada: o melhorado, se houver; senão o estilo.
AVALIACAO = {
    "grama_terra": ("melhorado", "", "Wang de 16 fecha (montagem de teste); 7 espelhada, 6 e 9 por quadrantes"),
    "grama_calcada": ("melhorado", "a calçada é alinhada no tile, sem conjunto de bordas: a equipe define a borda (meia lajota)", ""),
    "grama_variacoes": ("melhorado", "", ""),
    "penhasco_degraus": ("melhorado", "é a lista dos tiles mais usados, não um conjunto pronto: a equipe monta o conjunto de degraus a partir do anel", ""),
    "penhasco_morro_anel": ("melhorado", "a ferramenta de estilo achata as faixas do barranco (estilo ruim); o recolorido mantém", ""),
    "agua_grama": ("melhorado", "a água da equipe é animada na borda (ilha_quadros): falta a animação", "Wang de 16 fecha; vem das lagoas do pântano"),
    "agua_penhasco": ("melhorado", "faltam os cantos de fora da água (1, 2, 4, 8) e as diagonais: o ALttP faz a curva em diagonal; usar o anel", ""),
    "lago_penhasco_anel": ("melhorado", "a ferramenta de estilo escurece a água e achata o barranco; o recolorido mantém", ""),
    "mata_copa": ("melhorado", "lista de tiles; a copa do ALttP é de anéis lisos, não de tufos (referência do Caramel): redesenhar", ""),
    "arvore_grande": ("melhorado", "copa de anéis concêntricos (o usuário recusou copa lisa; a da equipe é em tufos): redesenhar a copa no jeito da arvore_verde da equipe", "quatro estações por recolorir"),
    "mata_bloco": ("estilo", "mesma copa de anéis: redesenhar com a árvore da equipe", ""),
    "arvore_pequena": ("melhorado", "", "quatro estações por recolorir"),
    "arvore_pequena_rosa": ("estilo", "", ""),
    "moita_grande": ("melhorado", "", "quatro estações por recolorir"),
    "sebe_rosa": ("estilo", "", ""),
    "canteiro_flores_rosa": ("estilo", "", ""),
    "casa_vermelha": ("melhorado", "", "madeira e pedra da equipe; telhado em 4 cores"),
    "casa_azul": ("melhorado", "", "madeira e pedra da equipe; telhado em 4 cores"),
    "cata_vento_praca": ("melhorado", "", ""),
    "areia_deserto": ("original", "a paleta da equipe não tem areia de deserto nem marcas de duna: o estilo puxa para a terra laranja; aguardando as cores da equipe para o deserto", "lista de tiles"),
    "montanha_chao": ("original", "sem cores de montanha na arte da equipe (o estilo vira terra laranja e ameixa): aguardando", "lista de tiles"),
    "pantano_chao": ("estilo", "", "lista de tiles"),
    "gelo_agua": ("original", "as placas de gelo do ALttP têm borda diagonal e o Wang de cantos fecha mal; sem cor de gelo na arte da equipe: base para a equipe redesenhar", ""),
    "arvore_vermelha": ("estilo", "mesma copa de anéis da arvore_grande: a equipe já tem a arvore_outono", ""),
    "arvore_dourada": ("estilo", "mesma copa de anéis", ""),
}


def avaliar(raiz: Path, assets: list):
    ind = ler_indice(raiz)
    for a in assets:
        d = entrada(ind, a, raiz)
        rec, mao, obs = AVALIACAO.get(a["nome"], (None, "", ""))
        if rec is None:
            rec = "melhorado" if caminho(raiz, a, "melhorado").exists() else "estilo"
        d["recomendado"] = rec
        d["mao_da_equipe"] = mao
        d["obs"] = obs
        if d.get("nota_linha") is not None and d["nota_linha"] < 8:
            d["mao_da_equipe"] = (mao + "; " if mao else "") + f"linha {d['nota_linha']}: jaggies na copa (anéis), acertar à mão"
    gravar_indice(raiz, ind)


# --- comparar ------------------------------------------------------------------------------------------------


def _xadrez(w, h, lado=8):
    y, x = np.mgrid[0:h, 0:w]
    c = ((x // lado + y // lado) % 2).astype(bool)
    img = np.zeros((h, w, 3), np.uint8)
    img[c] = (70, 70, 74)
    img[~c] = (58, 58, 62)
    return img


def comparar(raiz: Path, assets: list):
    ind = ler_indice(raiz)
    categorias = []
    for a in assets:
        if a["categoria"] not in categorias:
            categorias.append(a["categoria"])
    for cat in categorias:
        linhas = []
        for a in [x for x in assets if x["categoria"] == cat]:
            imgs = []
            for tipo in ("original", "estilo", "melhorado"):
                p = caminho(raiz, a, tipo)
                imgs.append(np.array(Image.open(p).convert("RGBA")) if p.exists() else None)
            d = ind.get(a["nome"], {})
            maior = max(i.shape[1] for i in imgs[:2] if i is not None)
            esc = 3 if maior <= 120 else 2 if maior <= 260 else 1
            rot = f"{a['nome']}  estilo {d.get('nota_estilo', '-')}  linha {d.get('nota_linha', '-')}  rec: {d.get('recomendado', '-')}"
            linhas.append((rot, imgs, esc))
        largura = max(sum((i.shape[1] * e + 16) if i is not None else 40 for i in imgs) for _, imgs, e in linhas) + 16
        largura = max(largura, 520)
        altura = sum(max(i.shape[0] for i in imgs if i is not None) * e + 30 for _, imgs, e in linhas) + 24
        tela = Image.fromarray(_xadrez(largura, altura))
        dr = ImageDraw.Draw(tela)
        dr.text((8, 4), f"{cat}: original | estilo | melhorado", fill=(255, 255, 255))
        y = 22
        for rot, imgs, e in linhas:
            dr.text((8, y), rot, fill=(255, 230, 120))
            x = 8
            for i in imgs:
                if i is None:
                    x += 40
                    continue
                im = Image.fromarray(i).resize((i.shape[1] * e, i.shape[0] * e), Image.NEAREST)
                tela.paste(im, (x, y + 14), im)
                x += i.shape[1] * e + 16
            y += max(i.shape[0] for i in imgs if i is not None) * e + 30
        saida = raiz / "assets" / f"_comparar_{cat}.png"
        tela.save(saida)
        print(f"folha {saida}")


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    ap = argparse.ArgumentParser(description="Separa os assets do mundo (base ALttP) e os refaz no estilo do jogo.")
    ap.add_argument("etapa", choices=["separar", "estilo", "limpar", "melhorar", "avaliar", "comparar", "tudo", "lista"])
    ap.add_argument("--raiz", default=str(RAIZ_PADRAO), help="a pasta mundo/ (fora do repositório)")
    ap.add_argument("--so", default="", help="só estes assets (nomes separados por vírgula)")
    ap.add_argument("--prioridade", default="P1")
    args = ap.parse_args()
    raiz = Path(args.raiz)
    assets = [a for a in ASSETS if a["prioridade"] == args.prioridade or args.prioridade == "todas"]
    if args.so:
        nomes = set(args.so.split(","))
        assets = [a for a in assets if a["nome"] in nomes]
    if args.etapa == "lista":
        for a in assets:
            print(f"{a['prioridade']} {a['categoria']:12} {a['nome']:24} {a['estilo']:12} {a['bioma']}")
        return 0
    etapas = ["separar", "estilo", "limpar", "melhorar", "avaliar", "comparar"] if args.etapa == "tudo" else [args.etapa]
    for e in etapas:
        {"separar": separar, "estilo": estilo, "limpar": limpar, "melhorar": melhorar, "avaliar": avaliar,
         "comparar": comparar}[e](raiz, assets)
    return 0


if __name__ == "__main__":
    sys.exit(main())
