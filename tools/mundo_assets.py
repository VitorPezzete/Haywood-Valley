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

Segunda rodada (2026-10-23): as fontes que tinham ficado de fora (folhas da gablaxian ainda não usadas, a folha mista
de tiles, a folha de peças da vila) e as regiões do Mundo da Luz e das Trevas (`alttp_vgmaps/`, sem as dungeons):
fonte "img" (recorte de PNG com o fundo tirado), o conjunto de degraus do penhasco (`folha_degraus`), materiais por cor
nas regiões, a madeira marrom-quente (MADEIRA_EQUIPE) e as folhas de comparação em páginas de até 1800 px.

Uso:
    python -I tools/mundo_assets.py tudo [--raiz PASTA] [--so nome1,nome2] [--prioridade P1] [--rodada segunda]
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

# --- segunda rodada (2026-10-23): as fontes que tinham ficado de fora e as regiões ---------------------------------
# Regra do usuário: nada de asset que não existe nas fontes; só separar, melhorar e estilizar. Fontes novas:
# fonte ("img", arquivo relativo a mundo/, recorte (x, y, l, a) | lista de recortes lado a lado | None). Opções:
# "fundo": "borda" (padrão nas imagens sem transparência: some o fundo ligado à moldura, cores claras da moldura) |
# "manter" (pedaço de chão: fica como está) ; "fundo_hex": as cores do fundo, quando a moldura tem mais que o fundo;
# "manter_comp": "borda" (só as partes que encostam na moldura: a sebe em volta dos objetos) | "maior" (só a maior
# parte: tira o pedaço da árvore vizinha). "melhoria": "madeira", "madeira_pedra", "pedra" (o melhorado das
# construções e objetos; sem ela, só o estilo). Prefere-se PNG; os JPEG (`folha_casas_vila_hero_of_swords.jpg`,
# `folha_tiles_por_peca_comparacao.jpg`) não deram peça que não exista em PNG.
P = "alttp_vgmaps/LegendOfZelda-ALinkToThePast-"
M_KAK = P + "LightWorld-KakarikoVillage.png"
M_DM = P + "LightWorld-DeathMountain(West).png"
M_CAS = P + "LightWorld-HyruleCastle.png"
M_DES = P + "LightWorld-DesertOfMystery.png"
M_PAN = P + "LightWorld-GreatSwamp.png"
M_LAG = P + "LightWorld-LakeHylia.png"
M_VIL = P + "DarkWorld-VillageOfOutcasts.png"
M_CAV = P + "DarkWorld-SkullWoods.png"
M_PTR = P + "DarkWorld-SwampOfEvil.png"
MISTA = "alttp_outras_fontes/folha_tiles_mundo_mista.png"
VILA = "alttp_outras_fontes/folha_tiles_por_peca_vila.png"
VILA_FUNDO = ["ffffff", "489848", "2f8f2f"]  # o branco da folha e a grama embaixo das peças
G1 = "alttp_outras_fontes/gablaxian_pecas/peca_001_194x249_em_0_0.png"

CONJUNTOS.update({
    # o chão do cemitério (Mundo da Luz, ao norte do castelo): a grama com o caminho de pedra cinza
    "cemiterio_chao": {"tipo": "lista", "cores": None, "proibe": {"c0c0a0", "f0f0f0"}, "exige": {"385038", "688068"}, "minimo": 32,
                       "quantos": 24,
                       "regiao": (2048, 1088, 2560, 1472)},
    # Grande Pântano: a grama alta escura (288038, 489048) contra a grama
    # (as transições das regiões não caem nos quadrantes de 8 px como as do Mundo da Luz: o Wang de cantos saía com
    # 10 a 14 peças faltando, então estes saem como lista dos tiles de borda mais usados)
    "pantano_grama_alta": {"tipo": "lista", "cores": None, "exige_todos": [{"288038", "489048"}, {"48a048"}], "minimo": 12, "quantos": 32,
                           "regiao": (0, 0, 1024, 1024), "mapa": M_PAN},
    # Deserto: as bordas da areia contra o barranco
    "deserto_penhasco": {"tipo": "lista", "cores": None, "exige_todos": [{"908040", "a09040", "686828"}, {"483828", "604828", "282828"}],
                         "minimo": 40, "quantos": 40, "regiao": (0, 0, 1024, 1024), "mapa": M_DES},
    # Montanha da Morte (oeste): o chão da montanha contra o paredão
    "montanha_penhasco": {"tipo": "lista", "cores": None, "exige_todos": [{"807030", "686828"}, {"503020", "382018", "684820"}],
                          "minimo": 40, "quantos": 48, "regiao": (0, 0, 1024, 1024), "mapa": M_DM},
    # Castelo por fora: o piso verde-claro do caminho e do pátio
    "castelo_piso": {"tipo": "lista", "cores": None, "exige": {"80c090", "b8f0c0", "508070"}, "minimo": 160, "quantos": 24,
                     "regiao": (0, 0, 1024, 1024), "mapa": M_CAS},
    # Lago Hylia: água funda contra a rasa (as manchas claras do lago)
    "agua_funda_rasa": {"tipo": "lista", "cores": None, "exige_todos": [{"3860b0"}, {"5880c0"}], "minimo": 12, "quantos": 32,
                        "regiao": (0, 0, 1024, 1024), "mapa": M_LAG},
    # Mundo das Trevas: o caminho claro da Vila dos Excluídos contra o chão oliva
    "trevas_caminho": {"tipo": "lista", "cores": None, "exige_todos": [{"d0d098", "c0c088"}, {"908850"}], "minimo": 12, "quantos": 32,
                       "regiao": (0, 0, 1024, 1024), "mapa": M_VIL},
    # Floresta das Caveiras: a grama clara contra a terra
    "trevas_floresta_chao": {"tipo": "lista", "cores": None, "exige_todos": [{"a8b870"}, {"908850", "909058"}], "minimo": 12,
                             "quantos": 32, "regiao": (0, 0, 1024, 1024), "mapa": M_CAV},
    # Pântano do Mal: o brejo verde-escuro contra o chão
    "trevas_pantano": {"tipo": "lista", "cores": None, "exige_todos": [{"006030", "005028"}, {"907850", "908850"}], "minimo": 12,
                       "quantos": 32, "regiao": (0, 0, 1024, 1024), "mapa": M_PTR},
})

R2 = "segunda"
ASSETS += [
    # terreno, P1
    {"nome": "praca_lajotas", "categoria": "terreno", "bioma": "vila (praça)", "fonte": ("img", G1, (120, 152, 74, 48)), "fundo": "manter"},
    {"nome": "praca_lajotas_clara", "categoria": "terreno", "bioma": "vila (praça)", "fonte": ("img", G1, (120, 199, 74, 50)), "fundo": "manter"},
    {"nome": "grama_alta", "categoria": "terreno", "bioma": "campos, floresta, pântano", "fonte": ("img", MISTA, (0, 112, 32, 16)), "fundo": "manter"},
    {"nome": "mancha_terra_grama", "categoria": "terreno", "bioma": "campos, fazenda", "fonte": ("img", MISTA, (0, 0, 48, 48)), "fundo": "manter"},
    {"nome": "terra_pedrinhas", "categoria": "terreno", "bioma": "estradas, fazenda", "fonte": ("img", MISTA, (0, 48, 48, 32)), "fundo": "manter"},
    {"nome": "mancha_terra", "categoria": "terreno", "bioma": "campos (terra cavada)", "fonte": ("gablaxian", 69, None)},
    {"nome": "ilhota_grama", "categoria": "terreno", "bioma": "rio, lagoas", "fonte": ("gablaxian", 52, None)},
    {"nome": "lagoa_pequena", "categoria": "terreno", "bioma": "campos, floresta", "fonte": ("gablaxian", 55, None)},
    {"nome": "escada_barranco", "categoria": "terreno", "bioma": "vila, campos (degrau)", "fonte": ("img", M_KAK, (432, 256, 48, 48)), "fundo": "manter"},
    {"nome": "entrada_caverna_degrau", "categoria": "terreno", "bioma": "campos, vila", "fonte": ("img", M_KAK, (160, 160, 64, 64)), "fundo": "manter"},
    {"nome": "penhasco_degraus_conjunto", "categoria": "terreno", "bioma": "campos, vila, floresta", "fonte": ("degraus",)},
    {"nome": "cemiterio_chao", "categoria": "terreno", "bioma": "cemitério das cidades", "fonte": ("conjunto", "cemiterio_chao")},
    # terreno, P2 (regiões)
    {"nome": "pantano_grama_alta", "categoria": "terreno", "bioma": "Pântano", "fonte": ("conjunto", "pantano_grama_alta"), "prioridade": P2},
    {"nome": "deserto_penhasco", "categoria": "terreno", "bioma": "Deserto e oásis", "fonte": ("conjunto", "deserto_penhasco"), "prioridade": P2},
    {"nome": "montanha_penhasco", "categoria": "terreno", "bioma": "Montanhas", "fonte": ("conjunto", "montanha_penhasco"), "prioridade": P2},
    {"nome": "castelo_piso", "categoria": "terreno", "bioma": "castelo (por fora)", "fonte": ("conjunto", "castelo_piso"), "prioridade": P2},
    {"nome": "agua_funda_rasa", "categoria": "terreno", "bioma": "lago, costa", "fonte": ("conjunto", "agua_funda_rasa"), "prioridade": P2},
    {"nome": "trevas_caminho", "categoria": "terreno", "bioma": "Terras sombrias (vila)", "fonte": ("conjunto", "trevas_caminho"), "prioridade": P2},
    {"nome": "trevas_floresta_chao", "categoria": "terreno", "bioma": "Terras sombrias (floresta)", "fonte": ("conjunto", "trevas_floresta_chao"), "prioridade": P2},
    {"nome": "trevas_pantano", "categoria": "terreno", "bioma": "Terras sombrias (pântano)", "fonte": ("conjunto", "trevas_pantano"), "prioridade": P2},
    {"nome": "trevas_chao_desenho", "categoria": "terreno", "bioma": "Terras sombrias", "fonte": ("img", MISTA, (128, 32, 64, 96)), "fundo": "manter", "prioridade": P2},
    {"nome": "monte_aneis", "categoria": "terreno", "bioma": "Montanhas", "fonte": ("img", MISTA, (64, 64, 48, 80)), "fundo": "manter", "prioridade": P2},
    {"nome": "entrada_caverna", "categoria": "terreno", "bioma": "Montanhas", "fonte": ("img", M_DM, (432, 384, 64, 48)), "fundo": "manter", "prioridade": P2},
    {"nome": "entrada_caverna_viga", "categoria": "terreno", "bioma": "Montanhas", "fonte": ("img", M_DM, (624, 624, 64, 48)), "fundo": "manter", "prioridade": P2},
    {"nome": "entrada_caverna_telhado", "categoria": "terreno", "bioma": "Montanhas", "fonte": ("img", M_DM, (96, 728, 64, 48)), "fundo": "manter", "prioridade": P2},
    {"nome": "escada_madeira_penhasco", "categoria": "terreno", "bioma": "Montanhas", "fonte": ("img", M_DM, (464, 848, 48, 80)), "fundo": "manter", "prioridade": P2},
    # vegetação, P1
    {"nome": "sebe_cercado", "categoria": "vegetacao", "bioma": "vila (sebe com cantos, pontas e aberturas)", "fonte": ("img", G1, (64, 0, 130, 152)), "manter_comp": "borda",
     "ja_tem": "sebe_horizontal/sebe_vertical (trechos); este traz os cantos e as pontas"},
    {"nome": "arbustos_quatro", "categoria": "vegetacao", "bioma": "vila, campos", "fonte": ("img", G1, (143, 60, 33, 34)), "manter_comp": "grandes"},
    {"nome": "brotos_grama", "categoria": "vegetacao", "bioma": "campos", "fonte": ("img", G1, (96, 150, 30, 22))},
    {"nome": "arbusto_trevo", "categoria": "vegetacao", "bioma": "campos, vila", "fonte": ("img", MISTA, (0, 80, 16, 16))},
    {"nome": "moita_rosa_dupla", "categoria": "vegetacao", "bioma": "vila", "fonte": ("img", VILA, (149, 88, 28, 36)), "fundo_hex": VILA_FUNDO, "paleta": "vegetacao_rosa"},
    {"nome": "arbusto_laranja", "categoria": "vegetacao", "bioma": "vila, castelo (jardim)", "fonte": ("img", VILA, (121, 92, 20, 28)), "fundo_hex": VILA_FUNDO},
    {"nome": "flor_branca_grande", "categoria": "vegetacao", "bioma": "campos", "fonte": ("gablaxian", 24, None)},
    {"nome": "flor_laranja", "categoria": "vegetacao", "bioma": "campos", "fonte": ("gablaxian", 34, None)},
    {"nome": "broto", "categoria": "vegetacao", "bioma": "campos", "fonte": ("gablaxian", 33, None)},
    {"nome": "planta_grande", "categoria": "vegetacao", "bioma": "floresta", "fonte": ("gablaxian", 8, None)},
    {"nome": "tronco_caido", "categoria": "vegetacao", "bioma": "floresta", "fonte": ("gablaxian", 11, (0, 30, 50, 50)), "melhoria": "madeira"},
    {"nome": "toco_oco", "categoria": "vegetacao", "bioma": "floresta", "fonte": ("gablaxian", 11, (0, 80, 50, 48)), "melhoria": "madeira"},
    {"nome": "toco_grande", "categoria": "vegetacao", "bioma": "floresta", "fonte": ("img", MISTA, (32, 144, 32, 32)), "melhoria": "madeira"},
    {"nome": "toco_buraco", "categoria": "vegetacao", "bioma": "floresta", "fonte": ("img", MISTA, (32, 176, 32, 32)), "melhoria": "madeira"},
    # vegetação, P2
    {"nome": "arbusto_seco", "categoria": "vegetacao", "bioma": "Terras sombrias", "fonte": ("img", MISTA, (0, 128, 16, 16)), "prioridade": P2},
    {"nome": "arvore_roxa", "categoria": "vegetacao", "bioma": "Terras sombrias, Terras mágicas", "fonte": ("gablaxian", 15, None), "prioridade": P2},
    {"nome": "arvore_manchada", "categoria": "vegetacao", "bioma": "Terras sombrias", "fonte": ("gablaxian", 26, None), "prioridade": P2},
    {"nome": "arvore_trevas", "categoria": "vegetacao", "bioma": "Terras sombrias", "fonte": ("img", M_VIL, (862, 48, 68, 76)), "manter_comp": "maior", "prioridade": P2},
    {"nome": "arvore_rosa_trevas", "categoria": "vegetacao", "bioma": "Terras sombrias", "fonte": ("img", M_VIL, (344, 134, 72, 82)), "manter_comp": "maior", "prioridade": P2},
    {"nome": "flor_roxa_trevas", "categoria": "vegetacao", "bioma": "Terras sombrias", "fonte": ("img", M_VIL, (144, 512, 16, 16)), "prioridade": P2},
    {"nome": "cacto", "categoria": "vegetacao", "bioma": "Deserto e oásis", "fonte": ("img", M_DES, (576, 256, 16, 24)), "prioridade": P2},
    {"nome": "planta_seca_deserto", "categoria": "vegetacao", "bioma": "Deserto e oásis", "fonte": ("img", M_DES, (608, 320, 16, 16)), "prioridade": P2},
    # construções, P1
    {"nome": "cerca_troncos", "categoria": "construcoes", "bioma": "fazenda, vila", "fonte": ("img", MISTA, (192, 80, 64, 48)), "melhoria": "madeira"},
    {"nome": "casa_verde", "categoria": "construcoes", "bioma": "vila", "fonte": ("gablaxian", 90, None), "melhoria": "madeira"},
    {"nome": "casa_sebe", "categoria": "construcoes", "bioma": "vila, fazenda", "fonte": ("gablaxian", 83, None)},
    {"nome": "ponte_pedra", "categoria": "construcoes", "bioma": "rio", "fonte": ("img", M_CAS, (440, 736, 144, 160)), "fundo": "manter", "melhoria": "pedra"},
    # construções, P2
    {"nome": "tenda", "categoria": "construcoes", "bioma": "Deserto e oásis, Terras sombrias", "fonte": ("img", MISTA, (192, 48, 32, 32)), "prioridade": P2, "melhoria": "madeira"},
    {"nome": "casa_trevas_caveira", "categoria": "construcoes", "bioma": "Terras sombrias (vila)", "fonte": ("gablaxian", 81, None), "prioridade": P2},
    {"nome": "casa_trevas", "categoria": "construcoes", "bioma": "Terras sombrias (vila)", "fonte": ("gablaxian", 101, None), "prioridade": P2},
    {"nome": "escada_pedra", "categoria": "construcoes", "bioma": "castelo, templos", "fonte": ("gablaxian", 19, None), "prioridade": P2},
    {"nome": "portao_castelo", "categoria": "construcoes", "bioma": "castelo", "fonte": ("img", M_CAS, (448, 592, 128, 80)), "fundo": "manter", "prioridade": P2},
    {"nome": "ponte_corda", "categoria": "construcoes", "bioma": "Montanhas", "fonte": ("img", M_DM, (304, 72, 288, 48)),
     "fundo_hex": ["306060", "ffffff", "b8f0e0", "807030"], "fundo_global": ["306060", "ffffff", "b8f0e0"], "prioridade": P2, "melhoria": "madeira"},
    {"nome": "entrada_mina", "categoria": "construcoes", "bioma": "Montanhas", "fonte": ("img", M_DM, (272, 912, 64, 64)), "fundo": "manter", "prioridade": P2, "melhoria": "madeira"},
    {"nome": "estatua_deserto", "categoria": "construcoes", "bioma": "Deserto e oásis (templo)", "fonte": ("img", M_DES, (112, 136, 64, 104)), "fundo": "manter", "prioridade": P2},
    # objetos, P1
    {"nome": "estaca_madeira", "categoria": "objetos", "bioma": "vila, fazenda", "fonte": ("img", G1, (88, 24, 26, 26)), "manter_comp": "maior", "melhoria": "madeira"},
    {"nome": "placa_larga", "categoria": "objetos", "bioma": "vila, estradas", "fonte": ("img", G1, (117, 24, 38, 26)), "manter_comp": "maior", "melhoria": "madeira"},
    {"nome": "estatua_gargula", "categoria": "objetos", "bioma": "vila (praça), templos", "fonte": ("img", G1, (86, 78, 38, 54)), "manter_comp": "maior", "melhoria": "pedra"},
    {"nome": "cata_vento_quadros", "categoria": "objetos", "bioma": "vila (praça)", "fonte": ("img", VILA, [(240, 82, 34, 57), (273, 82, 34, 57), (305, 82, 34, 57)]),
     "fundo_hex": VILA_FUNDO, "manter_comp": "maior",
     "melhoria": "madeira_pedra", "ja_tem": "cata_vento_praca (um quadro): estes são os três quadros da animação"},
    {"nome": "pote_vermelho", "categoria": "objetos", "bioma": "vila, fazenda", "fonte": ("gablaxian", 13, None), "ja_tem": "potes do Aeko"},
    {"nome": "bau_grande", "categoria": "objetos", "bioma": "todos", "fonte": ("gablaxian", 7, None), "ja_tem": "baús do Aeko (casa, castelo)"},
    {"nome": "bau_pequeno", "categoria": "objetos", "bioma": "todos", "fonte": ("gablaxian", 14, None), "ja_tem": "baús do Aeko (casa, castelo)"},
    {"nome": "pedra_grande", "categoria": "objetos", "bioma": "todos (pede luva)", "fonte": ("gablaxian", 58, None), "melhoria": "pedra"},
    {"nome": "pedra_grande_escura", "categoria": "objetos", "bioma": "todos (pede luva forte)", "fonte": ("gablaxian", 67, None), "melhoria": "pedra"},
    {"nome": "pedras_quatro", "categoria": "objetos", "bioma": "campos", "fonte": ("img", MISTA, (0, 176, 32, 32)), "melhoria": "pedra"},
    {"nome": "estaca_redonda", "categoria": "objetos", "bioma": "vila, campos (martelo)", "fonte": ("img", MISTA, (32, 96, 16, 16)), "melhoria": "madeira"},
    {"nome": "buraco", "categoria": "objetos", "bioma": "todos", "fonte": ("img", MISTA, (16, 128, 16, 16))},
    {"nome": "cascalho", "categoria": "objetos", "bioma": "campos, estradas", "fonte": ("img", MISTA, (32, 128, 16, 16)), "melhoria": "pedra"},
    {"nome": "buraco_pedra", "categoria": "objetos", "bioma": "vila, campos", "fonte": ("img", M_KAK, (78, 190, 36, 36)), "melhoria": "pedra"},
    {"nome": "monte_terra", "categoria": "objetos", "bioma": "campos, fazenda", "fonte": ("gablaxian", 63, None)},
    # objetos, P2
    {"nome": "pedra_caveira", "categoria": "objetos", "bioma": "Terras sombrias", "fonte": ("gablaxian", 17, None), "prioridade": P2},
    {"nome": "rocha_menta_grande", "categoria": "objetos", "bioma": "Pântano", "fonte": ("gablaxian", 43, None), "prioridade": P2, "melhoria": "pedra"},
    {"nome": "pedra_inscrita", "categoria": "objetos", "bioma": "Deserto, templos", "fonte": ("gablaxian", 62, None), "prioridade": P2},
    {"nome": "estatua_coruja", "categoria": "objetos", "bioma": "templos", "fonte": ("gablaxian", 61, None), "prioridade": P2, "melhoria": "pedra"},
    {"nome": "estatuas_dragao", "categoria": "objetos", "bioma": "templos, Terras sombrias", "fonte": ("gablaxian", 116, (0, 0, 92, 72)), "manter_comp": "grandes", "prioridade": P2},
    {"nome": "estatua_vila_trevas", "categoria": "objetos", "bioma": "Terras sombrias (praça)", "fonte": ("img", M_VIL, (484, 396, 40, 70)), "manter_comp": "maior", "prioridade": P2},
    {"nome": "postes_pedra", "categoria": "objetos", "bioma": "castelo, templos", "fonte": ("gablaxian", 72, None), "prioridade": P2, "melhoria": "pedra"},
    {"nome": "pedra_montanha", "categoria": "objetos", "bioma": "Montanhas", "fonte": ("img", M_DM, (118, 86, 36, 36)), "prioridade": P2},
    {"nome": "ossada", "categoria": "objetos", "bioma": "Deserto e oásis", "fonte": ("img", M_DES, (576, 374, 48, 42)), "prioridade": P2},
    {"nome": "estaca_agua", "categoria": "objetos", "bioma": "Pântano, lago", "fonte": ("img", M_PAN, (336, 256, 16, 16)), "prioridade": P2, "melhoria": "madeira"},
    {"nome": "costelas", "categoria": "objetos", "bioma": "Terras sombrias (floresta)", "fonte": ("img", M_CAV, (314, 138, 56, 146)), "prioridade": P2},
    {"nome": "caveira_pedra", "categoria": "objetos", "bioma": "Terras sombrias (floresta)", "fonte": ("img", M_CAV, (672, 90, 36, 40)), "manter_comp": "maior", "prioridade": P2},
]
_I2 = next(i for i, a in enumerate(ASSETS) if a["nome"] == "praca_lajotas")
for _i, _a in enumerate(ASSETS):
    _a.setdefault("rodada", R2 if _i >= _I2 else "primeira")
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

    def indices(self, conj) -> set:
        """Os materiais vêm como índices da paleta (o Mundo da Luz) ou como cor "rrggbb" (os mapas das regiões, cada
        um com a paleta dele): a cor vira todos os índices da paleta com ela."""
        saida = set()
        for c in conj or ():
            if isinstance(c, str):
                rgb = [int(c[i:i + 2], 16) for i in (0, 2, 4)]
                saida |= {int(i) for i in np.where((self.pal == rgb).all(-1))[0]}
            else:
                saida.add(int(c))
        return saida


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
    A, B, N = mapa.indices(c["A"]), mapa.indices(c["B"]), mapa.indices(c["neutros"])
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
    permitido[list(mapa.indices(c["cores"])) if c.get("cores") else slice(None)] = True
    escolhidos = []
    grupos = [mapa.indices(g) for g in (c.get("exige_todos") or [c["exige"]])]
    proibe = list(mapa.indices(c.get("proibe")))
    for chave, (n, (tx, ty)) in mapa.tiles_da_regiao(c.get("regiao", REGIAO_P1)).items():
        t = np.frombuffer(chave, np.uint8).reshape(T, T)
        if not permitido[t].all() or np.isin(t, proibe).any():
            continue
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


def tirar_fundo_rgb(rgba: np.ndarray, fundo_hex=None, bordas: str = "clrb") -> np.ndarray:
    """Recorte de uma imagem sem transparência (as folhas e os mapas das regiões, cada um com a paleta dele) → RGBA:
    some o fundo ligado à moldura. O fundo são as cores `fundo_hex` ou, sem elas, as cores da moldura que não são
    escuras (o contorno, luminância < 60, segura a inundação, como em `tirar_chao`)."""
    rgb = rgba[..., :3]
    chave = (rgb[..., 0].astype(np.int32) << 16) | (rgb[..., 1].astype(np.int32) << 8) | rgb[..., 2]
    if fundo_hex:
        fundo = {int(h, 16) for h in fundo_hex}
    else:
        moldura = np.concatenate([chave[0], chave[-1], chave[:, 0], chave[:, -1]])
        fundo = set(int(v) for v in np.unique(moldura))
    escuro = _luminancia(rgb.astype(float)) < 60
    pode = np.isin(chave, list(fundo)) & ~escuro & (rgba[..., 3] > 0)
    rotulos, _ = ndimage.label(pode)
    lados = {"c": rotulos[0], "b": rotulos[-1], "l": rotulos[:, 0], "r": rotulos[:, -1]}
    borda = set(np.unique(np.concatenate([lados[k] for k in bordas]))) - {0}
    saida = rgba.copy()
    saida[np.isin(rotulos, list(borda)), 3] = 0
    saida[saida[..., 3] == 0] = 0
    return saida


def manter_componentes(rgba: np.ndarray, modo: str) -> np.ndarray:
    """Modo "borda": só as partes opacas (ligadas em 8 direções) que encostam na moldura do recorte; "maior": só a
    maior parte; "grandes": as de pelo menos 10% da maior (tira as sobras das peças vizinhas)."""
    rot, n = ndimage.label(rgba[..., 3] > 0, structure=np.ones((3, 3)))
    if n <= 1:
        return rgba
    if modo == "borda":
        manter = set(np.unique(np.concatenate([rot[0], rot[-1], rot[:, 0], rot[:, -1]]))) - {0}
    elif modo == "grandes":
        tam = ndimage.sum(np.ones_like(rot), rot, range(1, n + 1))
        manter = {i + 1 for i, t in enumerate(tam) if t >= 0.1 * tam.max()}
    else:
        tam = ndimage.sum(np.ones_like(rot), rot, range(1, n + 1))
        manter = {int(np.argmax(tam)) + 1}
    saida = rgba.copy()
    saida[~np.isin(rot, list(manter))] = 0
    return saida


def recorte_img(raiz: Path, a: dict):
    """Fonte ("img", arquivo, recorte | [recortes] | None): PNG das folhas recebidas ou dos mapas das regiões."""
    _, arquivo, ret = a["fonte"]
    im = Image.open(raiz / arquivo)
    tem_alfa = im.mode in ("RGBA", "LA") or "transparency" in im.info
    base = np.array(im.convert("RGBA"))
    rets = ret if isinstance(ret, list) else [ret]
    partes = []
    for r in rets:
        p = base if r is None else base[r[1]:r[1] + r[3], r[0]:r[0] + r[2]]
        p = p.copy()
        if tem_alfa:
            p[p[..., 3] < 128] = 0
            p[p[..., 3] >= 128, 3] = 255
        elif a.get("fundo", "borda") != "manter":
            p = tirar_fundo_rgb(p, a.get("fundo_hex"))
        if a.get("fundo_global"):
            # cores que somem em qualquer lugar (o céu entre as tábuas da ponte de corda, fechado pelas cordas)
            ch = (p[..., 0].astype(np.int32) << 16) | (p[..., 1].astype(np.int32) << 8) | p[..., 2]
            p[np.isin(ch, [int(h, 16) for h in a["fundo_global"]])] = 0
        if a.get("manter_comp"):
            p = manter_componentes(p, a["manter_comp"])
        partes.append(p if a.get("fundo") == "manter" else aparar(p))
    img = partes[0] if len(partes) == 1 else lado_a_lado(partes, 2)
    return img, {"tipo": "recorte", "arquivo": Path(arquivo).name, "recorte": ret,
                 "fundo": a.get("fundo", "transparente" if tem_alfa else "borda")}


# O conjunto de degraus (o barranco baixo, de um sentido só, que se pula; 2026-10-23, segunda rodada). Cortado do
# barranco de Kakariko, tile a tile: ponta esquerda (sobe na diagonal), meio, escada, meio depois da escada e ponta
# direita (sobe na diagonal). O anel da gablaxian (002) não está na grade de 16 px e o degrau tem frente e costas
# (Wang e blob supõem peças que valem giradas), então o conjunto é de pedaços com a mesma linha de base, que emendam.
DEGRAUS = [("ponta_esquerda", (336, 224, 64, 80)), ("meio", (400, 256, 32, 48)), ("escada", (432, 256, 48, 48)),
           ("meio_2", (480, 256, 32, 48)), ("ponta_direita", (720, 176, 96, 128))]
DEGRAUS_MONTAGEM = ["ponta_esquerda", "meio", "meio", "escada", "meio_2", "meio_2", "ponta_direita"]


def folha_degraus(raiz: Path):
    mapa = Mapa(raiz, M_KAK)
    # o tile mais comum do mapa é a grama lisa: completa em cima as peças mais baixas
    cont = {k: [n, xy] for k, (n, xy) in mapa.tiles_da_regiao((0, 0, mapa.tw * T, mapa.th * T)).items()}
    gx, gy = max(cont.values(), key=lambda v: v[0])[1]
    grama = mapa.tile_rgba(gx, gy)
    ok = mapa.indices({"48a048", "307030", "604828", "483828", "282828", "806038", "908048"})
    altura = max(r[3] for _, r in DEGRAUS)
    pecas, info = [], []
    x = 0
    for nome, (px, py, l, h) in DEGRAUS:
        idx, rgb = mapa.recorte(px, py, l, h)
        rgb = rgb.copy()
        # tile com outra coisa (placa, sebe, flor, calçada) vira grama; a escada fica como está
        for ty in range(0, h if nome != "escada" else 0, T):
            for tx in range(0, l, T):
                if not np.isin(idx[ty:ty + T, tx:tx + T], list(ok)).all():
                    rgb[ty:ty + T, tx:tx + T] = grama[..., :3]
        p = np.zeros((altura, l, 4), np.uint8)
        for ty in range(0, altura - h, T):
            for tx in range(0, l, T):
                p[ty:ty + T, tx:tx + T] = grama
        p[altura - h:, :, :3] = rgb
        p[altura - h:, :, 3] = 255
        pecas.append(p)
        info.append({"peca": nome, "x": x, "largura": l, "mapa_px": [px, py, l, h]})
        x += l
    return np.concatenate(pecas, axis=1), {"tipo": "recorte", "arquivo": Path(M_KAK).name, "esquema": "degraus",
                                           "pecas": info, "montagem": DEGRAUS_MONTAGEM}


def montagem_degraus(folha: np.ndarray, info: dict) -> np.ndarray:
    por_nome = {p["peca"]: folha[:, p["x"]:p["x"] + p["largura"]] for p in info["pecas"]}
    return np.concatenate([por_nome[n] for n in info["montagem"]], axis=1)


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
    ind = {k: v for k, v in ind.items() if k in ordem}  # asset tirado da lista sai do índice
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
            d["fonte"] = {"tipo": "mapa (região)" if c.get("mapa") else "mapa do Mundo da Luz", **info}
        elif f[0] == "gablaxian":
            img, nome = gablaxian(raiz, f[1], f[2])
            d["fonte"] = {"tipo": "gablaxian", "arquivo": nome, "recorte": f[2]}
        elif f[0] == "img":
            img, d["fonte"] = recorte_img(raiz, a)
        elif f[0] == "degraus":
            img, d["fonte"] = folha_degraus(raiz)
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
        if d["fonte"].get("esquema") == "degraus":
            Image.fromarray(montagem_degraus(img, d["fonte"])).save(caminho(raiz, a, "montagem_original"))
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
        elif a.get("melhoria"):
            m = a["melhoria"]
            feita, nota = (_so_pedra(raiz, a, orig) if m == "pedra" else _madeira_pedra(m == "madeira_pedra")(raiz, a, orig))
        if feita is None:
            # sem melhoria (ou tirada): some o melhorado antigo
            caminho(raiz, a, "melhorado").unlink(missing_ok=True)
            d.pop("melhorado", None)
            d.pop("melhoria", None)
            continue
        Image.fromarray(feita).save(caminho(raiz, a, "melhorado"))
        if d.get("fonte", {}).get("esquema") == "wang16_cantos":
            Image.fromarray(montagem_wang(feita)).save(caminho(raiz, a, "montagem_melhorado"))
        if d.get("fonte", {}).get("esquema") == "degraus":
            Image.fromarray(montagem_degraus(feita, d["fonte"])).save(caminho(raiz, a, "montagem_melhorado"))
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

# A madeira das construções (o bege e o oliva do ALttP) vai para uma rampa de madeira marrom-quente, pelo brilho. A
# primeira rampa (2026-10-23) saiu dos troncos das árvores da equipe (4c2b3b, 6b444b, 985d50: matiz 330 a 10, ameixa)
# e deixou a madeira de casa_madeira, galpao_madeira, portal_madeira, poco_madeira e das cercas vermelho-rosada
# (correção pedida na segunda rodada). Esta junta os móveis de madeira do Aeko (cadeiras, camas e armário da folha
# `casa`: 2a1812, 5b300c, 793c18, 8d5a1a, aa6d3c) com a terra e a placa "NOME" da equipe (956538, c89769, ebbc6d):
# matiz entre 15 e 37 graus. Conferido nas folhas: com os meios 733c18/b66d42 do Aeko ficava laranja; com os
# troncos claros da equipe (765142, a7795a), ainda rosado.
MADEIRA_EQUIPE = [[0x2a, 0x18, 0x12], [0x5b, 0x30, 0x0c], [0x79, 0x3c, 0x18], [0x8d, 0x5a, 0x1a], [0x95, 0x65, 0x38],
                  [0xaa, 0x6d, 0x3c], [0xc8, 0x97, 0x69], [0xeb, 0xbc, 0x6d]]
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


def _so_pedra(raiz, a, orig):
    base = _estilo_de(raiz, a)
    feita = trocar_rampa(base, mascara_de_matiz(base, 110, 175, 0.12), np.array(PEDRA_EQUIPE, np.uint8), True)
    return feita, "pedra verde-menta no cinza da equipe"


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
    # segunda rodada (2026-10-23)
    "penhasco_degraus_conjunto": ("melhorado", "",
                                  "pedaços do barranco de Kakariko (ponta esquerda, meio, escada, meio, ponta direita) com a mesma linha de base; "
                                  "a montagem (L M M escada M M R) emenda sem costura. Não é Wang nem blob: o degrau tem frente e costas"),
    "escada_barranco": ("melhorado", "", "a escada de pedra no degrau; também está no conjunto de degraus"),
    "entrada_caverna_degrau": ("melhorado", "", "a boca de caverna embaixo do degrau de Kakariko"),
    "cemiterio_chao": ("melhorado", "", "um tile só: o chão do cemitério do ALttP é a grama com um calçamento de pedra que se repete"),
    "praca_lajotas": ("melhorado", "a borda de pedrinhas é solta (a peça da folha): a equipe decide se vira conjunto de bordas", ""),
    "praca_lajotas_clara": ("melhorado", "idem praca_lajotas", ""),
    "pantano_grama_alta": ("estilo", "", "lista dos tiles de borda da grama alta do pântano (o Wang de cantos não fechava: as bordas das regiões não caem nos quadrantes de 8 px)"),
    "agua_funda_rasa": ("estilo", "", "lista das bordas entre a água funda e a rasa do Lago Hylia"),
    "castelo_piso": ("estilo", "", "lista do piso do caminho e do pátio do castelo"),
    "deserto_penhasco": ("original", "sem cor de areia de deserto na arte da equipe: aguardando as cores", "lista das bordas da areia contra o barranco"),
    "montanha_penhasco": ("original", "sem cor de montanha na arte da equipe: aguardando", "lista das bordas do chão da montanha contra o paredão"),
    "trevas_caminho": ("original", "sem cores das Terras sombrias na arte da equipe: aguardando", "poucos tiles: o caminho da vila é alinhado no tile"),
    "trevas_floresta_chao": ("original", "sem cores das Terras sombrias na arte da equipe: aguardando", ""),
    "trevas_pantano": ("original", "sem cores das Terras sombrias na arte da equipe: aguardando", "poucos tiles: o brejo encosta no chão em poucas formas"),
    "trevas_chao_desenho": ("original", "sem cores das Terras sombrias na arte da equipe: aguardando", ""),
    "monte_aneis": ("original", "sem cor de montanha na arte da equipe", ""),
    "entrada_caverna": ("original", "sem cor de montanha na arte da equipe (é o paredão da Montanha da Morte)", ""),
    "entrada_caverna_viga": ("original", "idem entrada_caverna", ""),
    "entrada_caverna_telhado": ("original", "idem entrada_caverna", ""),
    "escada_madeira_penhasco": ("original", "idem entrada_caverna", ""),
    "sebe_cercado": ("estilo", "linha 5,7: a limpeza lê o pontilhado claro da sebe como serrilhado; o desenho é o do ALttP, conferir à mão", "cantos, pontas e aberturas da sebe (a sebe em volta da praça da gablaxian)"),
    "arvore_roxa": ("estilo", "copa de anéis (o usuário recusou copa lisa): redesenhar a copa em tufos", ""),
    "arvore_manchada": ("estilo", "copa de anéis: redesenhar a copa em tufos", ""),
    "arvore_trevas": ("estilo", "copa de anéis: redesenhar a copa em tufos", ""),
    "arvore_rosa_trevas": ("estilo", "copa de anéis: redesenhar a copa em tufos", ""),
    "cata_vento_quadros": ("melhorado", "a grama embaixo do pedestal veio junto nos três quadros (na folha a peça está sobre a grama): tirar à mão", "os três quadros da animação do cata-vento"),
    "pedra_caveira": ("estilo", "o quadrado de terra atrás das caveiras é da peça na folha: tirar à mão se for objeto solto", ""),
    "ponte_corda": ("melhorado", "", "o céu entre as tábuas foi tirado; as pontas trazem o paredão da montanha"),
    "casa_sebe": ("estilo", "", "a pedra verde é a sebe: sem a troca para cinza"),
    "estatua_vila_trevas": ("estilo", "", ""),
    "estaca_agua": ("melhorado", "", "com a marola da água em volta"),
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
        if d.get("nota_linha") is not None and d["nota_linha"] < 8 and "linha" not in mao:
            d["mao_da_equipe"] = (mao + "; " if mao else "") + f"linha {d['nota_linha']}: serrilhado que a limpeza não resolveu, acertar à mão"
    gravar_indice(raiz, ind)


# --- comparar ------------------------------------------------------------------------------------------------


def _xadrez(w, h, lado=8):
    y, x = np.mgrid[0:h, 0:w]
    c = ((x // lado + y // lado) % 2).astype(bool)
    img = np.zeros((h, w, 3), np.uint8)
    img[c] = (70, 70, 74)
    img[~c] = (58, 58, 62)
    return img


ALTURA_FOLHA = 1800  # as folhas de comparação se dividem para abrir no celular (segunda rodada)


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
        def alt(linha):
            return max(i.shape[0] for i in linha[1] if i is not None) * linha[2] + 30

        for velha in [*(raiz / "assets").glob(f"_comparar_{cat}_*.png"), raiz / "assets" / f"_comparar_{cat}.png"]:
            velha.unlink(missing_ok=True)
        paginas, atual, h = [], [], 24
        for ln in linhas:
            if atual and h + alt(ln) > ALTURA_FOLHA:
                paginas.append(atual)
                atual, h = [], 24
            atual.append(ln)
            h += alt(ln)
        paginas.append(atual)
        for n, pag in enumerate(paginas, 1):
            largura = max(sum((i.shape[1] * e + 16) if i is not None else 40 for i in imgs) for _, imgs, e in pag) + 16
            largura = max(largura, 520)
            altura = sum(alt(ln) for ln in pag) + 24
            tela = Image.fromarray(_xadrez(largura, altura))
            dr = ImageDraw.Draw(tela)
            dr.text((8, 4), f"{cat} ({n}/{len(paginas)}): original | estilo | melhorado", fill=(255, 255, 255))
            y = 22
            for rot, imgs, e in pag:
                dr.text((8, y), rot, fill=(255, 230, 120))
                x = 8
                for i in imgs:
                    if i is None:
                        x += 40
                        continue
                    im = Image.fromarray(i).resize((i.shape[1] * e, i.shape[0] * e), Image.NEAREST)
                    tela.paste(im, (x, y + 14), im)
                    x += i.shape[1] * e + 16
                y += alt((rot, imgs, e))
            saida = raiz / "assets" / f"_comparar_{cat}_{n}.png"
            tela.save(saida)
            print(f"folha {saida} {tela.size[0]}×{tela.size[1]}")


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
    ap.add_argument("--rodada", default="", help="primeira | segunda (só os assets daquela rodada)")
    args = ap.parse_args()
    raiz = Path(args.raiz)
    assets = [a for a in ASSETS if a["prioridade"] == args.prioridade or args.prioridade == "todas"]
    if args.rodada:
        assets = [a for a in assets if a["rodada"] == args.rodada]
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
