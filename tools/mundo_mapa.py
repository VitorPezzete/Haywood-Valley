"""Mapa do mundo: lugares, reinos e esboços do plano de construção (2026-10-23).

Lê o plano do mundo (estágio 1 da especificação, versão 3) que fica fora do repositório, em
`Documents\\Haywood-Valley-recuperado\\mundo\\` (`mundo_inteiro_etapa1_v3.png` e `mundo_13_biomas.png`, os dois a
1 px = 32 tiles, 128 px por setor) e grava ali mesmo os esboços de `docs/mundo/MAPA_MUNDO.md` e de
`docs/mundo/reinos/*.md`:

- `esboco_mundo_v1.png`: o mundo com os reinos, as cidades livres e as fases de construção.
- `esboco_reino_<reino>_v1.png` (e `esboco_cidades_livres_v1.png`): cada reino com os lugares numerados, a base do
  ALttP e a fase de cada um.
- `esboco_haywood_v1.png`: o primeiro pedaço jogável (fase 1, Ribeira e o distrito D03) em blocos de 64 × 64.
- `esboco_haywood_maquete_v1.png`: o miolo da fase 1 em tamanho real (16 px por tile), montado com os assets
  refeitos em `mundo\\assets\\` (os `*_estilo.png`); o que ainda não existe sai como caixa com o nome.

Nenhuma imagem entra no repositório: este script só lê e grava na pasta `--raiz`. Os lugares (nome, tipo, posição no
plano) foram lidos do `mundo_inteiro_etapa1_v3.png` à mão; o reino de cada um sai do `mundo_13_biomas.png` pelas regras
de `reinos_raster` (as áreas batem com a tabela do plano: Haywood 22,8 setores = campos 12,2 + floresta 10,6).

Uso: python -I tools/mundo_mapa.py [mundo | reinos | fase1 | tabela | jogo [--conferir] | conjuntos | tudo] [--raiz <pasta>]

`jogo` grava os módulos do jogo em src/shared/world/ (plano.ts, terreno.ts, fase1.ts; ver a seção "Para o jogo").
`conjuntos` monta a folha dos conjuntos da equipe (folha_conjuntos_v1.png na --raiz, para enviar com o OK do usuário).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

Image.MAX_IMAGE_PIXELS = None

RAIZ_PADRAO = os.path.join(os.path.expanduser("~"), "Documents", "Haywood-Valley-recuperado", "mundo")

# --- Geometria do plano -------------------------------------------------------------------------------------------
# Nas duas imagens o mapa tem 1664 × 1664 px: 13 setores de 128 px, 1 px = 32 tiles, 1 setor = 4096 tiles = 64 blocos
# do Diorama (64 × 64 tiles cada). O canto de cima à esquerda do mapa está em (122, 134) na etapa 1 e em (71, 241) no
# mapa dos biomas.
ORIGEM_ETAPA = (122, 134)
ORIGEM_BIOMAS = (71, 241)
LADO = 1664
PX_SETOR = 128
TILES_PX = 32
COLUNAS = "ABCDEFGHIJKLM"

# Recortes de onde as posições foram lidas: origem no plano e escala da imagem ampliada.
RECORTES = {
    "m00": (102, 114, 1.5), "m01": (657, 114, 1.5), "m02": (1212, 114, 1.5),
    "m10": (102, 669, 1.5), "m11": (657, 669, 1.5), "m12": (1212, 669, 1.5),
    "m20": (102, 1224, 1.5), "m21": (657, 1224, 1.5), "m22": (1212, 1224, 1.5),
    "h": (700, 1000, 1.0), "o": (0, 0, 1.0),
}

REINOS = {
    1: ("Haywood", (214, 170, 60)), 2: ("Invernia", (110, 160, 225)), 3: ("Brasalta", (200, 80, 60)),
    4: ("Terracota", (222, 132, 52)), 5: ("Verdália", (50, 150, 80)), 6: ("Marésia", (50, 170, 190)),
    7: ("Galena", (130, 70, 190)), 8: ("Miragem", (130, 70, 190)), 9: ("Brumário", (130, 70, 190)),
    10: ("Auréola", (130, 70, 190)), 11: ("Porto Franco", (130, 70, 190)), 12: ("Sotavento", (130, 70, 190)),
}
LIVRES = {7, 8, 9, 10, 11, 12}

FASES = {
    1: ("Fase 1", (214, 48, 49)), 2: ("Fase 2", (232, 126, 4)), 3: ("Fase 3", (205, 160, 0)),
    4: ("Fase 4", (60, 150, 60)), 5: ("Fase 5", (0, 150, 150)), 6: ("Fase 6", (40, 100, 200)),
    7: ("Fase 7", (90, 70, 200)), 8: ("Fase 8", (160, 60, 170)), 9: ("Fase 9", (110, 110, 120)),
}
FASE_DO_REINO = {2: 9, 3: 8, 4: 6, 5: 7, 6: 7, 7: 8, 8: 6, 9: 5, 10: 5, 11: 8, 12: 9}

# --- Base do ALttP por tipo de lugar (LW = Mundo da Luz, DW = Mundo das Trevas) ----------------------------------
BASE_TIPO = {
    "capital": "Castelo de Hyrule (LW) + quadras de Kakariko",
    "cidade": "Kakariko (LW), quadras repetidas",
    "vila": "Kakariko em miniatura / casa do Link (LW)",
    "livre": "—",
    "distrito": "sem base (Hay Day); sebes e cercas de Kakariko",
    "pousada": "taverna de Kakariko (LW)",
    "porto": "píeres do Lago Hylia (LW)",
    "ruina": "ruínas do Palácio do Leste (LW)",
    "toca": "boca de caverna nos penhascos (LW)",
    "chefe": "covil com arena; DW da região",
    "mirante": "Spectacle Rock, Montanha da Morte (LW)",
    "forte": "muralha e portão do Castelo de Hyrule (LW)",
    "pesca": "Lago Hylia (LW)",
    "cachoeira": "Cachoeira dos Desejos / Domínio Zora (LW)",
    "templo": "Palácio do Leste (LW)",
    "masmorra": "entradas de masmorra (LW/DW)",
    "mina": "cavernas da Montanha da Morte (LW)",
    "termas": "fonte das fadas (LW)",
    "farol": "sem base (criar)",
    "arvore": "Bosque Sagrado da Floresta Perdida (LW)",
    "passo": "trilhas e escadas da Montanha da Morte (LW)",
    "acampamento": "esconderijo dos ladrões, Floresta Perdida (LW)",
    "tesouro": "ilhotas do Lago Hylia (LW)",
    "feira": "galeria de tiro e jogo de cavar (LW/DW)",
    "assombrada": "Bosque das Caveiras (DW)",
    "cemiterio": "cemitério do Santuário (LW)",
    "ponte": "pontes do rio do castelo (LW)",
    "portal": "círculo de pedras do portal (LW, topo da montanha)",
    "lugar": "—",
    "rio": "rio do Castelo ao Lago Hylia (LW)",
    "oasis": "oásis do Deserto da Miragem (LW) / Pântano da Miragem (DW)",
    "vulcao": "Montanha da Morte (DW), Rocha da Tartaruga",
    "arvoreg": "Bosque Sagrado (LW)",
}

TIPO_PT = {
    "capital": "capital", "cidade": "cidade do reino", "vila": "vila", "livre": "cidade livre",
    "distrito": "distrito de fazenda", "pousada": "pousada", "porto": "porto", "ruina": "ruína", "toca": "toca",
    "chefe": "covil de chefe", "mirante": "mirante", "forte": "forte", "pesca": "lago de pesca",
    "cachoeira": "cachoeira", "templo": "templo", "masmorra": "masmorra", "mina": "mina funda", "termas": "termas",
    "farol": "farol", "arvore": "árvore gigante", "passo": "passo de montanha", "acampamento": "acampamento",
    "tesouro": "tesouro", "feira": "feira", "assombrada": "mata assombrada", "cemiterio": "cemitério",
    "ponte": "ponte", "portal": "portal", "lugar": "lugar", "rio": "rio", "oasis": "oásis", "vulcao": "vulcão",
}

# (nome, tipo, recorte, x, y, extras). Extras: fase, base (ALttP), lotes, reino (força o reino).
LUGARES: list[tuple] = [
    # Haywood: campos e floresta temperada
    ("Haywood", "capital", "h", 254, 242, {"fase": 3, "base": "Castelo de Hyrule (LW) no alto, cidade em quadras de Kakariko, porto na Lume Cove"}),
    ("Moinhos", "cidade", "o", 979, 1472, {"fase": 2, "base": "Kakariko (LW): praça do cata-vento vira o Moinho Grande; o rio atravessa"}),
    ("Ribeira", "cidade", "o", 1037, 1690, {"fase": 2, "base": "Kakariko (LW) + foz do rio no Lago Hylia (LW); porto no mar"}),
    ("Carvalhal", "cidade", "h", 550, 343, {"fase": 4, "base": "casas na mata da Floresta Perdida (LW) + Kakariko norte"}),
    ("Arraial do Mirante", "vila", "h", 106, 205, {"fase": 3}),
    ("Pouso do Feno", "vila", "h", 190, 365, {"fase": 3, "base": "casa do Link com a horta (LW)"}),
    ("Porteira", "vila", "h", 160, 452, {"fase": 2}),
    ("Sítio dos Pomares", "vila", "h", 405, 338, {"fase": 3, "base": "pomares das casas ao sul de Kakariko (LW)"}),
    ("Cais do Anzol", "vila", "h", 415, 492, {"fase": 2, "base": "casa à beira do Lago Hylia (LW)"}),
    ("Capão das Colmeias", "vila", "h", 662, 530, {"fase": 4}),
    ("Povoado da Lamparina", "vila", "h", 688, 256, {"fase": 4}),
    ("Roça do Cacau", "vila", "h", 655, 95, {}),
    ("D01 Scarecrow District", "distrito", "h", 338, 240, {"fase": 3, "lotes": 16}),
    ("D02 Moinhos District", "distrito", "o", 922, 1470, {"fase": 2, "lotes": 12}),
    ("D03 Ribeira District", "distrito", "o", 1092, 1681, {"fase": 1, "lotes": 12}),
    ("D04 Carvalhal District", "distrito", "h", 548, 395, {"fase": 4, "lotes": 12}),
    ("D05 Beehives District", "distrito", "h", 695, 530, {"fase": 4, "lotes": 8}),
    ("Four Winds Inn", "pousada", "o", 922, 1338, {"fase": 3}),
    ("Clover Inn", "pousada", "o", 948, 1390, {"fase": 2}),
    ("Fog Inn", "pousada", "h", 750, 300, {"fase": 4, "reino": 1, "base": "taverna de Kakariko (LW) na névoa do Bosque das Caveiras (DW)"}),
    ("Lume Cove", "lugar", "h", 245, 145, {"fase": 3, "base": "praia do Lago Hylia (LW)"}),
    ("Aurora Lookout", "portal", "h", 100, 183, {"fase": 3, "base": "Spectacle Rock e o círculo de pedras do portal (LW)"}),
    ("Crows' Tower", "chefe", "h", 155, 288, {"fase": 3, "base": "Torre de Agahnim (LW), em ruína"}),
    ("Crows' Den", "toca", "o", 918, 1319, {"fase": 3}),
    ("Fairground", "feira", "h", 370, 305, {"fase": 3}),
    ("Great Mill", "lugar", "h", 285, 385, {"fase": 2, "base": "ferraria de Kakariko (LW), com roda d'água"}),
    ("Old Fort", "ruina", "h", 240, 410, {"fase": 2}),
    ("Golden Hills", "lugar", "h", 120, 497, {"base": "degraus do Deserto da Miragem (LW), em dourado"}),
    ("Mirror Lake", "pesca", "h", 408, 545, {"fase": 2}),
    ("Beech Plateau", "lugar", "h", 458, 492, {"fase": 2, "base": "planalto do Palácio do Leste (LW), com escadas"}),
    ("Fox Den", "toca", "h", 522, 510, {"fase": 2}),
    ("Grandmother Oak", "arvore", "h", 612, 420, {"fase": 4}),
    ("Deer Glade", "lugar", "h", 570, 588, {"fase": 4, "base": "Bosque Assombrado do menino da flauta (LW), sem assombro"}),
    ("Boar King's Den", "chefe", "h", 632, 628, {"fase": 4, "base": "caverna nos penhascos da Floresta Perdida (LW)"}),
    ("Lantern Woods", "assombrada", "h", 655, 305, {"fase": 4}),
    ("Covered Bridge", "ponte", "h", 660, 343, {"fase": 4}),
    ("Lily Cemetery", "cemiterio", "h", 725, 363, {"fase": 4}),
    ("Clear Creek", "rio", "h", 760, 440, {"fase": 4, "reino": 1, "base": "rio do Domínio Zora (LW)"}),
    ("Old Wizard's Tower", "ruina", "h", 540, 107, {"fase": 4, "base": "Torre de Hera (LW)"}),
    ("Wizard's Point", "lugar", "h", 510, 45, {"fase": 4}),
    ("Lume Delta", "lugar", "o", 1115, 1763, {"fase": 2, "base": "Grande Pântano (LW), em delta"}),
    # Invernia: neve, taiga e o norte das montanhas
    ("Candeia", "capital", "m01", 405, 695, {"base": "Castelo de Hyrule (LW) com neve; porto na Frozen Bay"}),
    ("Termal", "cidade", "m01", 71, 500, {"base": "Kakariko (LW) com neve, em volta das termas"}),
    ("Porto Gelo", "cidade", "m01", 752, 268, {"base": "Kakariko (LW) com neve + píeres do Lago Hylia"}),
    ("Pinhal", "cidade", "m00", 376, 510, {"base": "Kakariko (LW) entre pinheiros (Floresta Perdida recolorida)"}),
    ("Posto Polar", "vila", "m01", 320, 395, {}),
    ("Retiro das Renas", "vila", "m01", 205, 563, {}),
    ("Cais da Ponte de Gelo", "vila", "m01", 120, 617, {}),
    ("Pesqueiro dos Lagos", "vila", "m01", 638, 515, {}),
    ("Passagem da Serraria", "vila", "m00", 510, 683, {}),
    ("Arraial da Resina", "vila", "m00", 160, 740, {}),
    ("D06 Pinhal District", "distrito", "m00", 377, 430, {"lotes": 8}),
    ("D07 Sawmill District", "distrito", "m00", 461, 683, {"lotes": 6}),
    ("D08 Greenhouses District", "distrito", "m01", 155, 495, {"lotes": 10}),
    ("D09 Fishery District", "distrito", "m01", 636, 570, {"lotes": 6}),
    ("Lair of the Great Bear of Pinhal", "chefe", "m00", 288, 263, {}),
    ("Pine Fjord", "lugar", "m00", 330, 305, {}),
    ("Great Sawmill", "lugar", "m00", 462, 337, {"base": "ferraria de Kakariko (LW), maior"}),
    ("Twin Lakes", "pesca", "m00", 240, 357, {}),
    ("Log Bridge", "ponte", "m00", 512, 490, {}),
    ("Pine Tree Inn", "pousada", "m00", 490, 567, {}),
    ("Fire Watchtower", "mirante", "m00", 528, 605, {}),
    ("Howling Grove", "assombrada", "m00", 212, 578, {"base": "Bosque das Caveiras (DW), pinheiros"}),
    ("King Pine", "arvore", "m00", 222, 634, {}),
    ("The Peaks", "lugar", "m00", 672, 270, {"base": "Montanha da Morte oeste (LW), com neve"}),
    ("Ice Pass", "passo", "m00", 662, 385, {}),
    ("Ice Fort", "forte", "m00", 693, 405, {}),
    ("Watcher's Peak", "mirante", "m00", 672, 492, {}),
    ("Frozen Passage", "passo", "m00", 670, 636, {}),
    ("Griffin Nest", "chefe", "m00", 662, 673, {"base": "topo da Montanha da Morte leste (LW)"}),
    ("Sawmill Pass", "passo", "m00", 630, 782, {}),
    ("Icebound Ship", "ruina", "m01", 510, 183, {"base": "sem base (navio no gelo: criar)"}),
    ("White Peak", "chefe", "m01", 350, 253, {}),
    ("Ice Cave", "masmorra", "m01", 541, 328, {"base": "Ilha do Gelo / Palácio do Gelo (DW)"}),
    ("Ice Fox Den", "toca", "m01", 195, 408, {}),
    ("Frozen Bay", "lugar", "m01", 125, 725, {"base": "Lago Hylia (LW) congelado"}),
    ("Warm Spring", "termas", "m01", 590, 605, {}),
    ("Frozen Lakes", "pesca", "m01", 735, 518, {"base": "Lago Hylia (LW) congelado"}),
    ("Polar Lighthouse", "farol", "m02", 15, 215, {}),
    ("Frozen Waterfall", "cachoeira", "m02", 95, 463, {}),
    ("Aurora Wall", "lugar", "m01", 535, 860, {"base": "sem base (aurora: efeito)"}),
    # Brasalta: vulcões e o sul das montanhas
    ("Brasalta", "capital", "m10", 357, 752, {"base": "Castelo de Hyrule (LW) em basalto + Vila dos Proscritos (DW)"}),
    ("Bocafunda", "cidade", "m10", 625, 466, {"base": "Vila dos Proscritos (DW) entre paredões da Montanha da Morte"}),
    ("Porto Basalto", "cidade", "m10", 184, 306, {"base": "Kakariko (LW) em pedra escura + píeres"}),
    ("Boca do Carvão", "vila", "m10", 462, 466, {}),
    ("Ponte de Ferro", "vila", "m10", 625, 272, {}),
    ("Praia da Obsidiana", "vila", "m10", 703, 610, {}),
    ("Vinha da Cinza", "vila", "m10", 175, 830, {}),
    ("D10 Terraces District", "distrito", "m10", 598, 390, {"lotes": 6}),
    ("D19 Ashes District", "distrito", "m10", 175, 775, {"lotes": 10}),
    ("Fornalha Peninsula", "lugar", "m10", 200, 438, {"base": "Planícies da Ruína (DW)"}),
    ("Salamander Den", "toca", "m10", 240, 503, {}),
    ("Mount Fornalha", "vulcao", "m10", 130, 598, {}),
    ("Heart of Fornalha", "chefe", "m10", 240, 600, {"base": "cratera da Rocha da Tartaruga (DW)"}),
    ("Fire Temple", "templo", "m10", 500, 658, {"base": "Palácio das Trevas (DW)"}),
    ("Furnaces Pass", "passo", "m10", 718, 550, {}),
    ("Bocafunda Mine", "mina", "m10", 625, 527, {}),
    ("Middle Pass", "passo", "m10", 662, 355, {}),
    ("Ponte de Ferro Fort", "forte", "m10", 750, 223, {}),
    ("Vineyard Pass", "passo", "m10", 635, 690, {}),
    ("Sunset Hot Springs", "termas", "m10", 60, 737, {}),
    ("Sunset Gulf", "lugar", "m10", 175, 200, {}),
    ("Crimson Gulf", "lugar", "m10", 830, 705, {"reino": 3}),
    # Galena (cidade livre dos mineiros)
    ("Galena", "livre", "m10", 528, 102, {"base": "cavernas e escadas da Montanha da Morte oeste (LW)"}),
    ("D11 High Valley District", "distrito", "m10", 446, 100, {"lotes": 6}),
    ("Cais de Galena", "vila", "m10", 648, 122, {}),
    ("Garimpo", "vila", "m10", 355, 193, {}),
    ("Golem Den", "toca", "m10", 515, 223, {"reino": 7}),
    ("Great Range", "lugar", "m10", 510, 283, {"reino": 7, "base": "Montanha da Morte (LW)"}),
    ("Cloud Lookout", "mirante", "m00", 336, 856, {}),
    ("Deep Mine", "mina", "m00", 528, 865, {}),
    # Terracota: savana e terra vermelha, a borda leste do deserto
    ("Mesa Alta", "capital", "m21", 140, 517, {"base": "Castelo de Hyrule (LW) sobre a mesa; degraus do Deserto da Miragem (LW)"}),
    ("Garganta Rubra", "cidade", "m20", 665, 250, {"base": "Kakariko (LW) num cânion: paredões da Montanha da Morte em vermelho"}),
    ("Cacimba", "cidade", "m20", 530, 692, {"base": "Kakariko (LW) em adobe + porto"}),
    ("Porto Rubro", "cidade", "o", 711, 1222, {"base": "Kakariko (LW) em adobe + píeres"}),
    ("Poço Seco", "vila", "m20", 498, 450, {}),
    ("Haras do Sol", "vila", "m20", 768, 440, {}),
    ("Cupinzal", "vila", "m20", 750, 640, {}),
    ("Pouso do Baobá", "vila", "m21", 148, 210, {}),
    ("D13 Cacimba District", "distrito", "m20", 528, 610, {"lotes": 6}),
    ("D14 Ranches District", "distrito", "m20", 858, 515, {"lotes": 10}),
    ("D15 Baobab District", "distrito", "m21", 95, 195, {"lotes": 6}),
    ("Crimson Fort", "forte", "m20", 575, 100, {}),
    ("Crimson Pass", "passo", "m20", 685, 90, {}),
    ("Crimson Crossroads Inn", "pousada", "m20", 765, 128, {}),
    ("Stone Arch", "mirante", "m20", 500, 190, {}),
    ("Singing Walls", "ruina", "m20", 733, 180, {}),
    ("Sentinel Baobab", "arvore", "m20", 845, 218, {}),
    ("Raiders' Camp", "acampamento", "m20", 470, 240, {}),
    ("Coyote Gang", "acampamento", "m20", 605, 365, {}),
    ("Dune Fort", "forte", "m20", 443, 515, {}),
    ("Last Well Inn", "pousada", "m20", 422, 540, {}),
    ("White Salt Flat", "lugar", "m20", 462, 352, {}),
    ("Lair of the Crimson-Maned Lion", "chefe", "m20", 862, 688, {}),
    ("Hyena Den", "toca", "m21", 188, 288, {}),
    # Miragem (cidade livre das caravanas): deserto
    ("Miragem", "livre", "m20", 278, 402, {"base": "Palácio do Deserto e o oásis do Deserto da Miragem (LW)"}),
    ("D12 Oasis District", "distrito", "m20", 278, 478, {"lotes": 8}),
    ("Duna Alta", "vila", "m20", 203, 565, {}),
    ("Paragem das Caravanas", "vila", "m20", 366, 624, {}),
    ("Great Oasis", "oasis", "m20", 280, 300, {}),
    ("Well Oasis", "oasis", "m20", 378, 380, {}),
    ("Date Palm Oasis", "oasis", "m20", 288, 513, {}),
    ("Dry Riverbed", "rio", "m20", 340, 172, {"base": "leito seco: Pântano da Miragem (DW) sem água"}),
    ("Buried City", "masmorra", "m20", 213, 258, {"base": "Palácio do Deserto (LW) meio enterrado"}),
    ("Lizard Den", "toca", "m20", 175, 352, {}),
    ("Dune Line", "lugar", "m20", 432, 303, {}),
    ("Black Bay", "lugar", "m20", 165, 172, {}),
    ("Bone Coast", "lugar", "m20", 75, 517, {}),
    ("Bone Point", "lugar", "m20", 165, 828, {}),
    # Verdália: selva tropical
    ("Ferradura", "capital", "m12", 257, 437, {"base": "Castelo de Hyrule (LW) sob a copa; Domínio Zora (LW) nas cachoeiras"}),
    ("Dossel", "cidade", "m12", 571, 684, {"base": "casas nas árvores: esconderijo da Floresta Perdida (LW) em altura"}),
    ("Porto Mangue", "cidade", "m12", 679, 186, {"base": "Kakariko (LW) em palafitas + píeres"}),
    ("Clareira da Onça", "vila", "m12", 178, 150, {}),
    ("Remanso", "vila", "m12", 517, 265, {}),
    ("Pé de Sumaúma", "vila", "m12", 430, 360, {}),
    ("D16 Waterfalls District", "distrito", "m12", 362, 435, {"lotes": 8}),
    ("D17 Cocoa District", "distrito", "m12", 495, 683, {"lotes": 6}),
    ("Jaguar Temple", "templo", "m12", 238, 112, {}),
    ("Drowned Temple", "masmorra", "m12", 478, 160, {"base": "Palácio do Pântano (DW)"}),
    ("Ancestral Kapok", "arvore", "m12", 477, 407, {}),
    ("Thunder Falls", "cachoeira", "m12", 660, 465, {}),
    ("Vine Bridges", "ponte", "m12", 390, 600, {"base": "pontes de corda da Montanha da Morte (LW)"}),
    ("Anaconda Queen's Lair", "chefe", "m12", 688, 630, {"base": "Bosque das Caveiras (DW), selva"}),
    ("Blue Range", "lugar", "m02", 460, 855, {}),
    ("Turtle Beach", "lugar", "m02", 725, 890, {}),
    # Marésia: costa, praias e recifes
    ("Anil", "capital", "m02", 650, 530, {"base": "Castelo de Hyrule (LW) à beira-mar + píeres do Lago Hylia"}),
    ("Gaivotas", "cidade", "m02", 256, 252, {"base": "Kakariko (LW) no alto das falésias"}),
    ("Comporta", "cidade", "m02", 187, 713, {"base": "Kakariko (LW) com o canal e as eclusas"}),
    ("Arraial das Redes", "vila", "m02", 455, 180, {}),
    ("Salinas", "vila", "m02", 400, 632, {}),
    ("Coqueiral", "vila", "m02", 748, 800, {}),
    ("Laranjal", "vila", "m22", 527, 660, {"reino": 6}),
    ("D20 Salt Pans District", "distrito", "m02", 540, 515, {"lotes": 10}),
    ("D21 Coconut Palms District", "distrito", "m02", 335, 265, {"lotes": 6}),
    ("D23 Orange Tree District", "distrito", "m22", 575, 618, {"lotes": 6, "reino": 6}),
    ("White Cliffs", "mirante", "m02", 295, 168, {}),
    ("Smugglers' Grotto", "acampamento", "m02", 495, 152, {}),
    ("Gull Cape", "lugar", "m02", 688, 60, {}),
    ("Sea Caves", "chefe", "m02", 735, 320, {}),
    ("Crab Den", "toca", "m02", 322, 500, {}),
    ("Anil Bay", "lugar", "m02", 800, 487, {}),
    ("Old Anil City", "ruina", "m02", 830, 455, {"base": "sem base (cidade afundada: criar)"}),
    ("Sea Fort", "forte", "m02", 805, 575, {}),
    ("Tide Canal", "rio", "m02", 430, 712, {"base": "sem base (canal com eclusas: criar)"}),
    ("Coral Reef", "lugar", "m02", 755, 750, {"base": "sem base (recife: criar)"}),
    ("Crown Castle", "forte", "m22", 772, 465, {"reino": 6, "base": "Castelo de Hyrule (LW) em miniatura, numa ilha"}),
    ("Moray Reef", "lugar", "m22", 710, 572, {"reino": 6}),
    ("Orange Tree Isle", "lugar", "m22", 570, 785, {"reino": 6}),
    ("Sandbanks", "tesouro", "m22", 487, 825, {"reino": 6}),
    ("Lighthouse Isle", "farol", "m22", 835, 265, {"reino": 6}),
    ("Drowned Bell", "ruina", "m22", 758, 102, {}),
    # Brumário (cidade livre dos alquimistas): pântano
    ("Brumário", "livre", "m22", 477, 198, {"base": "Grande Pântano (LW) + Pântano do Mal (DW); a cabana da bruxa (LW)"}),
    ("D18 Stilt Houses District", "distrito", "m22", 475, 295, {"lotes": 10}),
    ("Lodaçal", "vila", "m22", 588, 57, {}),
    ("Murky Lagoon", "pesca", "m22", 600, 165, {"base": "Pântano do Mal (DW)"}),
    ("Will-o'-the-Wisp Trail", "assombrada", "m22", 700, 247, {"base": "Pântano do Mal (DW), com névoa"}),
    ("Toad King's Lair", "chefe", "m22", 582, 375, {"base": "Palácio do Pântano (DW)"}),
    ("Leech Den", "toca", "m12", 440, 838, {}),
    ("Black River", "rio", "m12", 580, 808, {}),
    # Auréola e a Twilight Isle (terras mágicas, depois do Véu)
    ("Auréola", "livre", "m11", 541, 278, {"base": "Bosque Sagrado (LW) + Pirâmide do Poder (DW) em cristal"}),
    ("D24 Mushrooms District", "distrito", "m11", 460, 280, {"lotes": 6}),
    ("North Pier", "porto", "m11", 540, 95, {}),
    ("Ruins of the First Portal", "portal", "m11", 260, 175, {}),
    ("Living Crystal Den", "toca", "m11", 545, 193, {}),
    ("Lapidário", "vila", "m11", 705, 170, {}),
    ("Crystal Grottoes", "mina", "m11", 735, 150, {}),
    ("Giant Mushroom Grove", "lugar", "m11", 485, 385, {"base": "Floresta Perdida (LW), cogumelos gigantes"}),
    ("Chapéu-de-Sapo", "vila", "m11", 387, 418, {}),
    ("Crystal Forest", "lugar", "m11", 768, 385, {}),
    ("Starlit Lake", "pesca", "m11", 658, 408, {}),
    ("Eye of Lume", "lugar", "m11", 552, 457, {}),
    ("Thousand Steps Fort", "forte", "m11", 598, 485, {}),
    ("Dark Rift", "chefe", "m11", 733, 465, {"base": "Pirâmide do Poder (DW)"}),
    ("Cais da Cachoeira", "vila", "m11", 627, 507, {}),
    ("Veil Gate", "portal", "m11", 547, 590, {}),
    # Porto Franco (mercado na ilha) e Sotavento (corsários)
    ("Porto Franco", "livre", "m11", 110, 295, {"base": "Kakariko (LW) numa ilha + feira"}),
    ("D22 Isle of Sails District", "distrito", "m11", 115, 400, {"lotes": 6}),
    ("Isle of Sails", "lugar", "m11", 108, 480, {}),
    ("Sotavento", "livre", "m01", 79, 186, {"base": "Ilha do Gelo (DW) sem gelo: cratera; esconderijo dos ladrões (LW)"}),
    ("Crater Isle", "lugar", "m01", 95, 270, {}),
    ("Deep Bay", "lugar", "m01", 110, 305, {"reino": 12}),
    ("Ship Graveyard", "masmorra", "m00", 708, 80, {"reino": 12}),
    ("Treasure Island", "tesouro", "m01", 380, 95, {"reino": 12}),
    ("Whirlpool", "lugar", "m01", 542, 90, {"reino": 12}),
]


def plano_px(recorte: str, x: float, y: float) -> tuple[float, float]:
    ox, oy, esc = RECORTES[recorte]
    return ox + x / esc, oy + y / esc


def mapa_px(px: float, py: float) -> tuple[float, float]:
    """Posição dentro do mapa (0 a 1664), a partir da posição na imagem da etapa 1."""
    return px - ORIGEM_ETAPA[0], py - ORIGEM_ETAPA[1]


def setor(mx: float, my: float) -> str:
    c = min(12, max(0, int(mx // PX_SETOR)))
    r = min(12, max(0, int(my // PX_SETOR)))
    return f"{COLUNAS[c]}{r + 1}"


# --- Reinos a partir do mapa dos biomas ------------------------------------------------------------------------
CORES_BIOMAS = np.array([
    (156, 202, 98), (58, 124, 66), (66, 100, 86), (234, 241, 250), (146, 130, 116), (234, 208, 142), (208, 152, 92),
    (32, 122, 66), (106, 118, 82), (112, 62, 54), (244, 226, 178), (60, 110, 176), (162, 142, 236), (28, 56, 100),
    (44, 110, 140)])
NOMES_BIOMAS = ["campos", "floresta temperada", "taiga", "neve", "montanhas", "deserto", "savana", "selva",
                "pântano", "vulcânico", "costa", "ilhas e lagos", "terras mágicas", "mar", "Mar Sereno"]


def biomas_raster(raiz: str) -> np.ndarray:
    im = np.array(Image.open(os.path.join(raiz, "mundo_13_biomas.png")).convert("RGB")).astype(np.int32)
    ox, oy = ORIGEM_BIOMAS
    m = im[oy:oy + LADO, ox:ox + LADO]
    d = ((m[:, :, None, :] - CORES_BIOMAS[None, None]) ** 2).sum(-1)
    cls = d.argmin(-1)
    ruim = d.min(-1) > 60
    # letreiros e linhas pequenas: pedaços de menos de 0,02 setor somem e herdam o vizinho
    for k in range(len(CORES_BIOMAS)):
        lab, n = ndimage.label(cls == k)
        if n:
            tam = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
            pequenos = np.isin(lab, np.nonzero(tam < 330)[0] + 1)
            ruim |= pequenos
    idx = ndimage.distance_transform_edt(ruim, return_distances=False, return_indices=True)
    return cls[idx[0], idx[1]]


def reinos_raster(cls: np.ndarray) -> np.ndarray:
    """0 = mar; 1–6 reinos; 7–12 cidades livres. Regras (as áreas batem com a tabela do plano):
    montanhas acima de 3,5 setores são de Invernia, abaixo de 5,3 de Brasalta e o meio é Galena; o deserto a leste de
    2,05 setores é de Terracota (Cacimba, 2,8 setores) e o resto é Miragem; as ilhas do sudeste são de Marésia."""
    yy, xx = np.mgrid[0:LADO, 0:LADO] / PX_SETOR
    k = np.zeros(cls.shape, np.int32)
    k[(cls == 0) | (cls == 1)] = 1
    k[(cls == 2) | (cls == 3)] = 2
    k[(cls == 4) & (yy < 3.5)] = 2
    k[(cls == 4) & (yy >= 3.5) & (yy < 5.3)] = 7
    k[(cls == 4) & (yy >= 5.3)] = 3
    k[cls == 9] = 3
    k[cls == 6] = 4
    k[(cls == 5) & (xx >= 2.05)] = 4
    k[(cls == 5) & (xx < 2.05)] = 8
    k[cls == 7] = 5
    k[cls == 10] = 6
    k[cls == 8] = 9
    k[cls == 12] = 10
    ilhas = cls == 11
    lab, n = ndimage.label(ilhas)
    for i in range(1, n + 1):
        ys, xs = np.nonzero(lab == i)
        cx, cy = xs.mean() / PX_SETOR, ys.mean() / PX_SETOR
        if abs(cx - 4.75) < 0.6 and abs(cy - 5.94) < 0.6:
            k[lab == i] = 11
        elif abs(cx - 4.73) < 0.6 and abs(cy - 0.80) < 0.6:
            k[lab == i] = 12
        elif cx > 9.5 and cy > 9.0:
            k[lab == i] = 6
    # lagos e ilhas soltas herdam o reino de terra mais perto
    sem = (k == 0) & ilhas
    terra = k > 0
    idx = ndimage.distance_transform_edt(~terra, return_distances=False, return_indices=True)
    k[sem] = k[idx[0], idx[1]][sem]
    return k


def reino_mais_perto(k: np.ndarray) -> np.ndarray:
    idx = ndimage.distance_transform_edt(k == 0, return_distances=False, return_indices=True)
    return k[idx[0], idx[1]]


def lugares_resolvidos(k: np.ndarray) -> list[dict]:
    perto = reino_mais_perto(k)
    saida = []
    for nome, tipo, rec, x, y, extra in LUGARES:
        px, py = plano_px(rec, x, y)
        mx, my = mapa_px(px, py)
        ix, iy = int(min(LADO - 1, max(0, mx))), int(min(LADO - 1, max(0, my)))
        reino = extra.get("reino") or int(perto[iy, ix])
        fase = extra.get("fase") or (FASE_DO_REINO.get(reino, 9) if reino != 1 else 4)
        saida.append({
            "nome": nome, "tipo": tipo, "mx": round(mx, 1), "my": round(my, 1),
            "tile_x": int(mx * TILES_PX), "tile_y": int(my * TILES_PX),
            "bloco_x": int(mx * TILES_PX) // 64, "bloco_y": int(my * TILES_PX) // 64,
            "setor": setor(mx, my), "reino": REINOS[reino][0], "reino_id": reino, "fase": fase,
            "base": extra.get("base") or BASE_TIPO.get(tipo, "—"), "lotes": extra.get("lotes"),
        })
    return saida


# --- Desenho ---------------------------------------------------------------------------------------------------
PAPEL = (241, 234, 216)
TINTA = (40, 34, 30)


def fonte(tam: int, negrito: bool = False, serifa: bool = False) -> ImageFont.FreeTypeFont:
    pasta = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts")
    nomes = (["georgiab.ttf", "georgia.ttf"] if serifa else []) + (["segoeuib.ttf"] if negrito else []) + ["segoeui.ttf", "arial.ttf"]
    for n in nomes:
        p = os.path.join(pasta, n)
        if os.path.exists(p):
            return ImageFont.truetype(p, tam)
    return ImageFont.load_default()


def texto_contorno(d: ImageDraw.ImageDraw, xy, txt, f, cor=TINTA, contorno=(255, 255, 255), anchor="la", w=2):
    d.text(xy, txt, font=f, fill=cor, anchor=anchor, stroke_width=w, stroke_fill=contorno)


def bordas(mask: np.ndarray) -> np.ndarray:
    return mask & ~ndimage.binary_erosion(mask)


def plano_etapa(raiz: str) -> Image.Image:
    im = Image.open(os.path.join(raiz, "mundo_inteiro_etapa1_v3.png")).convert("RGB")
    ox, oy = ORIGEM_ETAPA
    return im.crop((ox, oy, ox + LADO, oy + LADO))


def fase_regiao(cls: np.ndarray, k: np.ndarray) -> np.ndarray:
    """Fase de cada pixel de terra, para o esboço do mundo."""
    yy = np.mgrid[0:LADO, 0:LADO][0] / PX_SETOR
    f = np.zeros(k.shape, np.int32)
    for reino, fase in FASE_DO_REINO.items():
        f[k == reino] = fase
    hay = k == 1
    f[hay & (cls == 1)] = 4
    f[hay & (cls != 1) & (yy >= 10.3)] = 2
    f[hay & (cls != 1) & (yy < 10.3)] = 3
    return f


def esboco_mundo(raiz: str, cls, k, lugares):
    base = plano_etapa(raiz)
    branco = Image.new("RGB", base.size, PAPEL)
    base = Image.blend(base, branco, 0.35)
    f = fase_regiao(cls, k)
    cor = np.zeros((LADO, LADO, 4), np.uint8)
    for fase, (_, c) in FASES.items():
        cor[f == fase] = (*c, 70)
    base = base.convert("RGBA")
    base.alpha_composite(Image.fromarray(cor, "RGBA"))
    # fronteiras dos reinos e das cidades livres
    linhas = np.zeros((LADO, LADO, 4), np.uint8)
    for rid, (_, c) in REINOS.items():
        b = ndimage.binary_dilation(bordas(k == rid), iterations=1)
        linhas[b] = (*[int(v * 0.6) for v in c], 255)
    base.alpha_composite(Image.fromarray(linhas, "RGBA"))
    W = LADO + 80 + 700
    tela = Image.new("RGBA", (W, LADO + 220), (*PAPEL, 255))
    tela.alpha_composite(base, (60, 150))
    d = ImageDraw.Draw(tela)
    d.text((60, 30), "Haywood Valley · plano de construção do mundo (v1)", font=fonte(44, serifa=True), fill=TINTA)
    d.text((60, 92), "Sobre o plano do mundo (etapa 1, v3). Cor = fase de construção; linha = fronteira de reino ou cidade livre. "
           "1 setor = 64 × 64 blocos do Diorama = 4.096 × 4.096 tiles.", font=fonte(20), fill=TINTA)
    fg = fonte(16, True)
    for i in range(13):
        d.text((60 + i * PX_SETOR + PX_SETOR // 2, 132), COLUNAS[i], font=fg, fill=TINTA, anchor="mm")
        d.text((42, 150 + i * PX_SETOR + PX_SETOR // 2), str(i + 1), font=fg, fill=TINTA, anchor="mm")
    # a fase 1 em destaque
    f1 = next(l for l in lugares if l["nome"].startswith("D03"))
    x, y = 60 + f1["mx"] - 26, 150 + f1["my"] - 4
    d.ellipse((x - 22, y - 22, x + 22, y + 22), outline=FASES[1][1], width=5)
    texto_contorno(d, (x - 30, y + 26), "fase 1", fonte(20, True), cor=FASES[1][1], anchor="ra", w=3)
    # capitais e cidades livres
    for l in lugares:
        if l["tipo"] in ("capital", "livre"):
            x, y = 60 + l["mx"], 150 + l["my"]
            d.ellipse((x - 7, y - 7, x + 7, y + 7), fill=(255, 255, 255), outline=TINTA, width=2)
    # legenda
    lx = LADO + 120
    d.text((lx, 160), "Fases", font=fonte(30, True, serifa=True), fill=TINTA)
    txt = {
        1: "Ribeira leste + 4 lotes do D03 (12 × 9 blocos)",
        2: "Haywood sul: Ribeira, Moinhos, D02, D03, Lume, Mirror Lake",
        3: "Haywood norte: a capital, D01, a estrada dos Quatro Ventos",
        4: "Floresta temperada: Carvalhal, D04, D05, Capão",
        5: "Brumário e o pântano (D18); Twilight Isle e Auréola (D24)",
        6: "Terracota (D13–D15) e Miragem (D12)",
        7: "Verdália (D16–D17) e Marésia (D20, D21, D23)",
        8: "Brasalta (D10, D19), Galena (D11), Porto Franco (D22)",
        9: "Invernia (D06–D09), Sotavento, Mar Gelado",
    }
    lotes = {1: 4, 2: 24, 3: 40, 4: 60, 5: 76, 6: 106, 7: 142, 8: 170, 9: 200}
    y = 210
    for fase, (nome, c) in FASES.items():
        d.rectangle((lx, y + 4, lx + 30, y + 30), fill=c)
        d.text((lx + 44, y), f"{nome}", font=fonte(22, True), fill=TINTA)
        d.text((lx + 44, y + 28), txt[fase], font=fonte(17), fill=TINTA)
        d.text((lx + 44, y + 50), f"lotes abertos ao fim: {lotes[fase]}", font=fonte(15), fill=(90, 80, 70))
        y += 86
    y += 10
    d.text((lx, y), "Reinos e cidades livres", font=fonte(26, True, serifa=True), fill=TINTA)
    y += 44
    areas = {rid: (k == rid).sum() / PX_SETOR ** 2 for rid in REINOS}
    for rid, (nome, c) in REINOS.items():
        d.rectangle((lx, y + 4, lx + 22, y + 22), outline=tuple(int(v * 0.6) for v in c), width=4)
        d.text((lx + 34, y), f"{nome}: {areas[rid]:.1f} setores", font=fonte(17), fill=TINTA)
        y += 28
    out = os.path.join(raiz, "esboco_mundo_v1.png")
    tela.convert("RGB").save(out, optimize=True)
    return out


def esboco_reino(raiz: str, k, lugares, ids: list[int], nome_arq: str, titulo: str, subtitulo: str):
    mask = np.isin(k, ids)
    ys, xs = np.nonzero(mask)
    x0, x1 = max(0, xs.min() - 40), min(LADO, xs.max() + 40)
    y0, y1 = max(0, ys.min() - 40), min(LADO, ys.max() + 40)
    esc = 2 if max(x1 - x0, y1 - y0) < 720 else 1.5 if max(x1 - x0, y1 - y0) < 900 else 1
    base = plano_etapa(raiz).crop((x0, y0, x1, y1))
    sub = mask[y0:y1, x0:x1]
    branco = Image.new("RGB", base.size, PAPEL)
    apagado = Image.blend(base, branco, 0.7)
    m = Image.fromarray((sub * 255).astype(np.uint8)).filter(__import__("PIL.ImageFilter", fromlist=["x"]).GaussianBlur(2))
    base = Image.composite(base, apagado, m)
    W, H = int((x1 - x0) * esc), int((y1 - y0) * esc)
    base = base.resize((W, H), Image.LANCZOS).convert("RGBA")
    d0 = ImageDraw.Draw(base)
    # fronteira
    b = bordas(sub)
    bys, bxs = np.nonzero(b)
    for bx, by in zip(bxs[::1], bys[::1]):
        d0.rectangle((bx * esc - 1, by * esc - 1, bx * esc + 1, by * esc + 1), fill=(60, 40, 30, 255))
    # grade de setores
    for i in range(14):
        gx = (i * PX_SETOR - x0) * esc
        if 0 <= gx <= W:
            d0.line([(gx, 0), (gx, H)], fill=(80, 70, 60, 120), width=1)
        gy = (i * PX_SETOR - y0) * esc
        if 0 <= gy <= H:
            d0.line([(0, gy), (W, gy)], fill=(80, 70, 60, 120), width=1)
    meus = [l for l in lugares if l["reino_id"] in ids]
    ordem = {"capital": 0, "livre": 0, "cidade": 1, "vila": 2, "distrito": 3}
    meus.sort(key=lambda l: (ordem.get(l["tipo"], 4), l["fase"], l["my"], l["mx"]))
    fn = fonte(14, True)
    for i, l in enumerate(meus, 1):
        x, y = (l["mx"] - x0) * esc, (l["my"] - y0) * esc
        c = FASES[l["fase"]][1]
        r = 12
        d0.ellipse((x - r, y - r, x + r, y + r), fill=c, outline=(255, 255, 255), width=2)
        d0.text((x, y), str(i), font=fn, fill=(255, 255, 255), anchor="mm")
    LEG = 820
    linhas = len(meus)
    alt_leg = 150 + linhas * 24 + 40 + len(FASES) * 26
    TW, TH = W + LEG + 60, max(H + 170, alt_leg)
    tela = Image.new("RGBA", (TW, TH), (*PAPEL, 255))
    tela.alpha_composite(base, (30, 140))
    d = ImageDraw.Draw(tela)
    d.text((30, 24), titulo, font=fonte(40, serifa=True), fill=TINTA)
    d.text((30, 80), subtitulo, font=fonte(18), fill=TINTA)
    for i in range(13):
        gx = 30 + (i * PX_SETOR + PX_SETOR / 2 - x0) * esc
        if 30 <= gx <= 30 + W:
            d.text((gx, 128), COLUNAS[i], font=fonte(15, True), fill=TINTA, anchor="mm")
        gy = 140 + (i * PX_SETOR + PX_SETOR / 2 - y0) * esc
        if 140 <= gy <= 140 + H:
            d.text((18, gy), str(i + 1), font=fonte(15, True), fill=TINTA, anchor="mm")
    lx, y = W + 60, 140
    d.text((lx, y - 4), "Nº  lugar · tipo · setor · fase · base do ALttP", font=fonte(17, True), fill=TINTA)
    y += 30
    f1, f2 = fonte(15, True), fonte(14)
    for i, l in enumerate(meus, 1):
        c = FASES[l["fase"]][1]
        d.ellipse((lx, y + 2, lx + 18, y + 20), fill=c)
        d.text((lx + 9, y + 11), str(i), font=fonte(11, True), fill=(255, 255, 255), anchor="mm")
        extra = f" ({l['lotes']} lotes)" if l.get("lotes") else ""
        d.text((lx + 26, y), f"{l['nome']}{extra}", font=f1, fill=TINTA)
        w = d.textlength(f"{l['nome']}{extra}", font=f1)
        resto = f" · {TIPO_PT.get(l['tipo'], l['tipo'])} · {l['setor']} · F{l['fase']} · {l['base']}"
        while d.textlength(resto, font=f2) > LEG - 40 - w and len(resto) > 10:
            resto = resto[:-2]
        d.text((lx + 26 + w, y + 1), resto, font=f2, fill=(80, 70, 60))
        y += 24
    y += 16
    for fase, (nome, c) in FASES.items():
        if any(l["fase"] == fase for l in meus):
            d.rectangle((lx, y + 3, lx + 18, y + 19), fill=c)
            d.text((lx + 26, y), nome, font=fonte(15), fill=TINTA)
            y += 26
    out = os.path.join(raiz, nome_arq)
    tela.convert("RGB").save(out, optimize=True)
    return out


# --- Fase 1: Ribeira leste e o D03 (12 × 9 blocos) -------------------------------------------------------------
# Coordenadas locais em tiles (0..767, 0..575); o canto (0, 0) é o bloco (471, 762) do mundo = tile (30.144, 48.768),
# no setor H12. Ver docs/mundo/reinos/haywood.md, "Fase 1".
BX0, BY0 = 471, 762
LW, LH = 768, 576
GRAMA, TERRA, CALCADA, AGUA, MATA, CAPIM, SOLO, PLANALTO = 0, 1, 2, 3, 4, 5, 6, 7

RIO = [(158, -10), (166, 30), (156, 80), (166, 125), (158, 170), (140, 212), (110, 255), (64, 330), (22, 420), (-10, 480)]
LOTES_F1 = {"A": (256, 64), "B": (512, 64), "C": (256, 320), "D": (512, 320)}
QUADRAS_F1 = [(0, 1), (1, 1), (0, 2), (1, 2), (0, 3), (1, 3)]  # blocos da cidade construídos na fase 1


def _semente(*a) -> int:
    return int(hashlib.md5(repr(a).encode()).hexdigest()[:8], 16)


def _polilinha(grade, pts, meia, codigo, onde=None):
    yy, xx = np.mgrid[0:grade.shape[0], 0:grade.shape[1]]
    perto = np.zeros(grade.shape, bool)
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        dx, dy = x1 - x0, y1 - y0
        t = np.clip(((xx - x0) * dx + (yy - y0) * dy) / (dx * dx + dy * dy), 0, 1)
        perto |= np.hypot(xx - (x0 + t * dx), yy - (y0 + t * dy)) <= meia
    if onde is not None:
        perto &= onde
    grade[perto] = codigo
    return perto


def fase1_layout():
    g = np.full((LH, LW), GRAMA, np.int8)
    obj: list[tuple] = []  # (tipo, x, y, w, h, rótulo)
    yy, xx = np.mgrid[0:LH, 0:LW]
    rng = np.random.default_rng(7)
    ruido = ndimage.gaussian_filter(rng.random((LH, LW)), 9)
    ruido = (ruido - ruido.min()) / (ruido.max() - ruido.min())
    cidade = (xx < 128) & (yy >= 64)
    # capim alto (cortável) em manchas, fora da cidade; mata do Bosque do Lume no alto à direita
    g[(ruido > 0.62) & ~cidade] = CAPIM
    g[(xx > 600) & (yy < 8 + 22 * ruido)] = MATA
    # planalto do Alto do Mirante: um degrau de penhasco a noroeste, com escada e mirante em cima
    g[(((xx - 22) / 38) ** 2 + ((yy - 14) / 30) ** 2 <= 1) & (xx < 56) & (yy < 50)] = PLANALTO
    # cidade: ruas de calçada nas bordas dos blocos (4 tiles de cada lado), praça e cais
    for bx, by in QUADRAS_F1:
        x0, y0 = bx * 64, by * 64
        g[y0:y0 + 64, x0:x0 + 4] = CALCADA
        g[y0:y0 + 64, x0 + 60:x0 + 64] = CALCADA
        g[y0:y0 + 4, x0:x0 + 64] = CALCADA
        g[y0 + 60:y0 + 64, x0:x0 + 64] = CALCADA
    g[136:184, 70:122] = CALCADA                                   # Largo do Rio (bloco 1,2)
    cais = np.zeros_like(g)
    _polilinha(cais, RIO, 7, 1)
    g[(cais == 1) & cidade & (yy < 256)] = CALCADA
    agua = _polilinha(g, RIO, 4, AGUA)
    # estradas (8 tiles), avenidas (6) e trilhas (3)
    g[(xx >= 60) & (xx < 68) & (yy < 64)] = TERRA                    # estrada de Moinhos (chega ao Portão Norte)
    g[(yy >= 28) & (yy < 36) & (xx >= 60)] = TERRA                   # estrada do Leste (para Carvalhal)
    g[(yy >= 189) & (yy < 195) & (xx >= 128) & (xx < 256)] = TERRA   # avenida do Portão Leste ao centro do distrito
    g[(xx >= 220) & (xx < 226) & (yy >= 36) & (yy < 323)] = TERRA    # ligação da estrada do Leste ao centro
    g[(yy >= 317) & (yy < 323) & (xx >= 220)] = TERRA                # avenida E-O entre as fileiras de lotes
    g[(xx >= 509) & (xx < 515) & (yy >= 36)] = TERRA                 # avenida N-S entre as colunas de lotes
    g[(xx >= 204) & (xx < 240) & (yy >= 156) & (yy < 180)] = TERRA   # terreiro do centro do distrito
    g[(xx >= 230) & (xx < 254) & (yy >= 40) & (yy < 56)] = TERRA     # parada da estrada
    g[agua] = AGUA
    obj.append(("ponte_madeira", 161, 27, 9, 5, "Ponte do Lume"))
    obj.append(("ponte_madeira", 148, 187, 9, 5, "Ponte do Portão"))
    obj.append(("ponte_pedra", 90, 250, 12, 6, "Ponte da Rua (criar)"))
    obj.append(("pier", 166, 92, 6, 3, "parada do barco (criar)"))
    # lotes: cerca inicial de 64 no meio, a máxima de 192 tracejada, trilha até a avenida
    for nome, (lx, ly) in LOTES_F1.items():
        fx, fy = lx + 96, ly + 96
        g[fy:fy + 64, fx:fx + 64] = GRAMA
        g[fy + 6:fy + 58, fx + 4:fx + 60] = GRAMA
        for k in range(3):
            g[fy + 34:fy + 54, fx + 8 + k * 17:fx + 21 + k * 17] = SOLO
        if lx == 256:
            g[fy + 28:fy + 31, fx + 64:512] = TERRA
        else:
            g[fy + 28:fy + 31, 512:fx] = TERRA
        obj.append(("cerca", fx, fy, 64, 64, f"Lote {nome}" + (": casa, galinheiro e celeiro a criar" if nome == "A" else "")))
        obj.append(("cerca_max", lx + 32, ly + 32, 192, 192, ""))
        obj.append(("casa_fazenda", fx + 6, fy + 8, 7, 6, ""))
        obj.append(("celeiro", fx + 44, fy + 6, 8, 8, ""))
        obj.append(("galinheiro", fx + 26, fy + 12, 6, 4, ""))
        obj.append(("espantalho", fx + 30, fy + 42, 2, 3, ""))
        obj.append(("placa", fx + 64 if lx == 256 else fx - 2, fy + 25, 1, 1, ""))
        # mato do lote: bosquetes, pedras e arbustos para limpar (gerado)
        r = np.random.default_rng(_semente("lote", nome))
        centros = [(int(r.integers(lx + 40, lx + 216)), int(r.integers(ly + 40, ly + 216))) for _ in range(5)]
        for _ in range(120):
            if r.random() < 0.55:
                cx, cy = centros[int(r.integers(0, len(centros)))]
                px, py = int(cx + r.normal(0, 7)), int(cy + r.normal(0, 7))
                t = r.choice(["arvore_grande", "arvore_pequena", "moita_grande", "arbusto"], p=[0.35, 0.3, 0.15, 0.2])
            else:
                px, py = int(r.integers(lx + 34, lx + 222)), int(r.integers(ly + 34, ly + 222))
                t = r.choice(["pedra_leve", "arbusto", "toco", "flores_brancas", "moita_cruz"], p=[0.3, 0.3, 0.1, 0.2, 0.1])
            if fx - 6 <= px <= fx + 70 and fy - 6 <= py <= fy + 70:
                continue
            if not (0 <= px < LW and 0 <= py < LH) or g[py, px] not in (GRAMA, CAPIM):
                continue
            obj.append((str(t), px, py, 1, 1, ""))
    # sebes na borda dos lotes; muro baixo e portões da cidade
    obj.append(("sebe_h", 256, 64, 512, 1, ""))
    obj.append(("sebe_v", 254, 64, 1, 125, ""))
    obj.append(("sebe_v", 254, 195, 1, 122, ""))
    obj.append(("muro_h", 0, 63, 60, 1, ""))
    obj.append(("muro_h", 68, 63, 60, 1, ""))
    obj.append(("muro_v", 127, 64, 1, 125, ""))
    obj.append(("muro_v", 127, 195, 1, 60, ""))
    obj.append(("portal_madeira", 58, 58, 5, 3, "Portão Norte"))
    obj.append(("portal_madeira", 125, 186, 5, 3, "Portão Leste"))
    # centro do distrito D03 (Hay Day: venda, pedidos, galpão) e a parada da estrada
    obj += [
        ("caixa_venda", 207, 158, 3, 2, "caixa de venda (criar)"),
        ("quadro_pedidos", 214, 156, 4, 3, "pedidos (criar)"),
        ("galpao_madeira", 232, 154, 4, 4, "galpão"),
        ("poco_madeira", 208, 172, 2, 2, ""),
        ("bebedouro", 234, 175, 2, 1, ""),
        ("espantalho", 227, 165, 2, 3, "espantalho (criar)"),
        ("carroca", 213, 168, 4, 3, "carroça de feno (criar)"),
        ("placa", 228, 186, 1, 1, "centro do distrito D03"),
        ("arvore_grande", 202, 152, 1, 1, ""), ("arvore_grande", 244, 152, 1, 1, ""),
        ("arvore_grande", 244, 182, 1, 1, ""), ("banco_madeira", 220, 178, 2, 1, ""),
        ("mirante", 16, 2, 4, 5, "mirante (criar)"), ("escada", 34, 42, 3, 5, "escada (criar)"),
        ("barraca", 232, 41, 4, 3, "barraca (criar)"),
        ("fogueira", 241, 48, 2, 2, "fogueira (criar)"),
        ("espantalho", 249, 41, 2, 3, ""),
        ("banco_madeira", 234, 52, 2, 1, ""),
        ("placa", 226, 37, 1, 1, ""),
        ("morro", 300, 4, 7, 7, "morro"),
        ("lago_anel", 420, 6, 12, 14, "lagoa"),
        ("mata_bloco", 610, 0, 19, 11, ""), ("mata_bloco", 660, 2, 19, 11, ""), ("mata_bloco", 705, 0, 19, 11, ""),
    ]
    # cidade: quadras de Kakariko (lotes de 18 × 18 com sebe, casa, horta), praça, pousada, mercado
    tipos = ["casa_vermelha", "casa_azul", "casa_madeira", "casa_azul_media", "casa_vermelha", "casa_azul"]
    tam = {"casa_azul_grande": (6, 9), "casa_vermelha_loja": (6, 5), "casa_madeira": (6, 6), "casa_vermelha": (6, 6),
           "casa_azul": (6, 6), "casa_azul_media": (6, 6)}
    especiais = {(0, 1, 2, 2): ("casa_azul_grande", "Pousada da Ribeira"), (1, 1, 0, 0): ("casa_vermelha_loja", "loja"),
                 (0, 2, 2, 2): ("casa_vermelha_loja", "mercado"), (0, 3, 0, 0): ("casa_azul_grande", "")}
    for bx, by in QUADRAS_F1:
        if (bx, by) == (1, 2):
            continue
        for i in range(3):
            for j in range(3):
                lx, ly = bx * 64 + 5 + i * 18, by * 64 + 5 + j * 18
                if (g[ly:ly + 18, lx:lx + 18] == AGUA).any() or (g[ly + 2:ly + 16, lx + 2:lx + 16] == CALCADA).any():
                    continue
                t, rot = especiais.get((bx, by, i, j), (tipos[_semente(bx, by, i, j) % len(tipos)], ""))
                w, h = tam[t]
                obj.append(("sebe_lote", lx, ly, 17, 17, ""))
                obj.append((t, lx + 6, ly + 15 - h, w, h, rot))
                if _semente("horta", bx, by, i, j) % 3 == 0:
                    obj.append(("canteiro_flores_rosa", lx + 2, ly + 13, 5, 2, ""))
                else:
                    obj.append(("arvore_pequena", lx + 3, ly + 6, 1, 1, ""))
    obj += [
        ("barraca", 74, 140, 4, 3, "barracas (criar)"), ("barraca", 80, 140, 4, 3, ""), ("barraca", 86, 140, 4, 3, ""),
        ("barraca", 92, 140, 4, 3, ""), ("cata_vento_praca", 96, 158, 2, 4, "cata-vento"),
        ("poco_pedra", 110, 170, 2, 2, ""), ("banco_pedra", 76, 176, 3, 1, ""), ("banco_pedra", 102, 178, 3, 1, ""),
        ("canteiro_potes", 108, 150, 6, 3, ""), ("canteiro_flores_rosa", 72, 166, 5, 2, ""),
        ("arvore_pequena_rosa", 74, 158, 1, 1, ""), ("arvore_pequena_rosa", 120, 160, 1, 1, ""),
        ("pier", 116, 214, 6, 3, "cais do rio (criar)"),
    ]
    # o resto da cidade (fase 2) fica hachurado no esboço
    obj.append(("hachura", 0, 256, 128, 320, "Ribeira: o resto da cidade (fase 2)"))
    # árvores e moitas soltas fora dos lotes e da cidade (gerado, em bosquetes)
    r = np.random.default_rng(11)
    centros = [(int(r.integers(170, 760)), int(r.integers(0, 64))) for _ in range(6)] + \
              [(int(r.integers(130, 250)), int(r.integers(60, 575))) for _ in range(5)]
    for _ in range(150):
        cx, cy = centros[int(r.integers(0, len(centros)))]
        px, py = int(cx + r.normal(0, 8)), int(cy + r.normal(0, 8))
        if not (0 <= px < LW and 0 <= py < LH) or g[py, px] not in (GRAMA, CAPIM):
            continue
        if (256 <= px and 64 <= py) or (px < 128 and py >= 64) or (196 <= px < 254 and 146 <= py < 190) or g[py, px] == PLANALTO:
            continue
        t = r.choice(["arvore_grande", "arvore_pequena", "moita_grande", "arbusto", "pedra_leve", "arvore_pequena_rosa"],
                     p=[0.3, 0.25, 0.1, 0.15, 0.15, 0.05])
        obj.append((str(t), px, py, 1, 1, ""))
    return g, obj


CORES_CHAO = {GRAMA: (122, 186, 92), TERRA: (196, 152, 98), CALCADA: (188, 204, 170), AGUA: (78, 140, 214),
              MATA: (38, 104, 70), CAPIM: (150, 196, 100), SOLO: (128, 84, 52), PLANALTO: (176, 206, 120)}
CORES_OBJ = {
    "casa": (205, 92, 70), "ponte": (150, 105, 60), "cerca": (120, 80, 40), "sebe": (40, 120, 60), "muro": (130, 120, 110),
    "arvore": (34, 110, 60), "pedra": (140, 140, 140), "criar": (230, 60, 160), "outro": (90, 70, 60),
}
CRIAR = {"casa_fazenda", "celeiro", "galinheiro", "caixa_venda", "quadro_pedidos", "espantalho", "barraca", "fogueira",
         "ponte_pedra", "pier", "carroca", "mirante", "escada"}
CARTOES = {"casa_azul_grande", "casa_vermelha_loja", "casa_madeira", "casa_vermelha", "casa_azul", "casa_azul_media",
           "galpao_madeira", "poco_madeira", "poco_pedra", "portal_madeira", "cata_vento_praca", "arvore_grande",
           "arvore_pequena", "arvore_pequena_rosa", "moita_grande", "moita_cruz", "arbusto", "toco", "pedra_leve",
           "casa_fazenda", "celeiro", "galinheiro", "caixa_venda", "quadro_pedidos", "espantalho", "barraca", "fogueira",
           "placa", "banco_madeira", "banco_pedra", "bebedouro", "mata_bloco"}


def orcamento_fase1(g, obj) -> list[dict]:
    """Conta, por bloco, o que vira imagem no canvas fixo (bases juntadas, junções da grade dupla, decalques) e o que
    vira cartão. Base com textura grande (1024 × 1024) junta a região inteira; cada junção é uma imagem."""
    linhas = []
    for by in range(LH // 64):
        for bx in range(LW // 64):
            s = g[by * 64:by * 64 + 65, bx * 64:bx * 64 + 65]
            a, b, c, d = s[:-1, :-1], s[:-1, 1:], s[1:, :-1], s[1:, 1:]
            mistos = ~((a == b) & (a == c) & (a == d))
            juncoes = int(mistos.sum())
            # bases: regiões conexas de cada código (cada uma ~1 a 3 retângulos)
            bases = 0
            for k in np.unique(s):
                lab, n = ndimage.label(s[:-1, :-1] == k)
                bases += n * 2
            cart = flat = 0
            for t, x, y, w, h, _ in obj:
                if bx * 64 <= x < bx * 64 + 64 and by * 64 <= y < by * 64 + 64:
                    if t in CARTOES:
                        cart += 1
                    elif t in ("sebe_lote",):
                        flat += 4
                    elif t in ("cerca",):
                        flat += 8
                    elif t not in ("cerca_max", "hachura"):
                        flat += 1
            linhas.append({"bx": bx, "by": by, "juncoes": juncoes, "bases": bases, "planos": flat, "cartoes": cart,
                           "imagens": juncoes + bases + flat})
    return linhas


def esboco_fase1(raiz: str):
    g, obj = fase1_layout()
    E = 3
    img = np.zeros((LH, LW, 3), np.uint8)
    for c, cor in CORES_CHAO.items():
        img[g == c] = cor
    mapa = Image.fromarray(img).resize((LW * E, LH * E), Image.NEAREST).convert("RGBA")
    d = ImageDraw.Draw(mapa)
    fr = fonte(17, True)
    rotulos = []
    for t, x, y, w, h, rot in obj:
        X, Y = x * E, y * E
        if t == "hachura":
            camada = Image.new("RGBA", mapa.size, (0, 0, 0, 0))
            dc = ImageDraw.Draw(camada)
            for i in range(-h * E, w * E, 24):
                dc.line([(X + i, Y), (X + i + h * E, Y + h * E)], fill=(255, 255, 255, 120), width=3)
            corte = Image.new("L", mapa.size, 0)
            ImageDraw.Draw(corte).rectangle((X, Y, X + w * E, Y + h * E), fill=255)
            mapa.paste(camada, (0, 0), Image.composite(camada, Image.new("RGBA", mapa.size), corte).split()[3])
        elif t == "cerca":
            d.rectangle((X, Y, X + w * E, Y + h * E), outline=CORES_OBJ["cerca"], width=4)
        elif t == "cerca_max":
            for i in range(0, w * E, 18):
                for seg in (((X + i, Y), (X + i + 9, Y)), ((X + i, Y + h * E), (X + i + 9, Y + h * E)),
                            ((X, Y + i), (X, Y + i + 9)), ((X + w * E, Y + i), (X + w * E, Y + i + 9))):
                    d.line(list(seg), fill=(110, 70, 30), width=2)
        elif t in ("sebe_h", "sebe_v"):
            d.rectangle((X, Y, X + max(1, w) * E, Y + max(1, h) * E), fill=CORES_OBJ["sebe"])
        elif t == "sebe_lote":
            d.rectangle((X, Y, X + w * E, Y + h * E), outline=CORES_OBJ["sebe"], width=3)
        elif t in ("muro_h", "muro_v"):
            d.rectangle((X, Y, X + max(1, w) * E + 2, Y + max(1, h) * E + 2), fill=CORES_OBJ["muro"])
        elif t.startswith("casa_") and t != "casa_fazenda":
            cor = (70, 100, 170) if "azul" in t else (160, 110, 70) if "madeira" in t else (190, 80, 70)
            d.rectangle((X, Y, X + w * E, Y + h * E), fill=cor, outline=(40, 30, 30))
        elif t.startswith("ponte"):
            d.rectangle((X, Y, X + w * E, Y + h * E), fill=CORES_OBJ["ponte"], outline=(60, 40, 20))
        elif t in ("arvore_grande", "mata_bloco"):
            rr = 7 if t == "arvore_grande" else 14
            d.ellipse((X - rr, Y - rr, X + rr, Y + rr), fill=(30, 95, 55), outline=(20, 60, 35))
        elif t in ("arvore_pequena", "arvore_pequena_rosa", "moita_grande", "moita_cruz", "arbusto"):
            cor = (220, 140, 180) if "rosa" in t else (45, 130, 70)
            rr = 4 if t != "arbusto" else 2
            d.ellipse((X - rr, Y - rr, X + rr, Y + rr), fill=cor)
        elif t in ("pedra_leve", "toco"):
            d.rectangle((X - 2, Y - 2, X + 2, Y + 2), fill=(150, 150, 150) if t == "pedra_leve" else (110, 80, 50))
        elif t in ("flores_brancas", "canteiro_flores_rosa"):
            d.rectangle((X, Y, X + w * E, Y + h * E), fill=(250, 200, 220) if "rosa" in t else (255, 255, 255))
        elif t in ("morro", "lago_anel"):
            d.ellipse((X, Y, X + w * E, Y + h * E), fill=(120, 95, 60) if t == "morro" else (90, 70, 50))
            if t == "lago_anel":
                d.ellipse((X + 8, Y + 8, X + w * E - 8, Y + h * E - 8), fill=CORES_CHAO[AGUA])
        else:
            cor = CORES_OBJ["criar"] if t in CRIAR else CORES_OBJ["outro"]
            d.rectangle((X, Y, X + max(3, w * E), Y + max(3, h * E)), fill=cor, outline=(30, 20, 20))
        if rot:
            rotulos.append((X + w * E / 2, Y + h * E + 3, rot, t in CRIAR))
    for bx in range(0, LW + 1, 64):
        d.line([(bx * E, 0), (bx * E, LH * E)], fill=(255, 255, 255, 170), width=1)
    for by in range(0, LH + 1, 64):
        d.line([(0, by * E), (LW * E, by * E)], fill=(255, 255, 255, 170), width=1)
    fb = fonte(13)
    for bx in range(LW // 64):
        for by in range(LH // 64):
            d.text((bx * 64 * E + 4, by * 64 * E + 3), f"{bx},{by}", font=fb, fill=(255, 255, 255, 220))
    for x, y, rot, criar in rotulos:
        texto_contorno(d, (x, y), rot, fr, cor=(150, 0, 90) if criar else TINTA, anchor="ma", w=3)
    grandes = [
        ((190, 1060), "RIBEIRA"), ((560, 300), "rio Lume"), ((2000, 60), "Bosque do Lume"),
        ((1400, 132), "estrada do Leste → Carvalhal"), ((200, 50), "estrada de Moinhos ↑"),
        ((1150, 1515), "D03 · lotes A–D (4 de 12)"), ((1150, 1650), "o resto do D03 continua ao sul e a leste"),
        ((1000, 975), "avenida do distrito"), ((150, 70), "Alto do Mirante"),
    ]
    fg = fonte(26, True)
    for (x, y), t in grandes:
        texto_contorno(d, (x, y), t, fg, anchor="mm", w=4)
    LEG = 600
    tela = Image.new("RGBA", (LW * E + LEG + 60, LH * E + 170), (*PAPEL, 255))
    tela.alpha_composite(mapa, (30, 130))
    D = ImageDraw.Draw(tela)
    D.text((30, 20), "Haywood · fase 1: Ribeira leste e o distrito D03 (esboço v1)", font=fonte(42, serifa=True), fill=TINTA)
    D.text((30, 78), f"12 × 9 blocos do Diorama (768 × 576 tiles), do bloco ({BX0}, {BY0}) ao ({BX0 + 11}, {BY0 + 8}) do mundo, "
           f"setores H12/H13. 1 quadrado da grade = 1 bloco de 64 × 64 tiles = 32 × 32 studs.", font=fonte(20), fill=TINTA)
    lx, y = LW * E + 70, 140
    D.text((lx, y), "Chão", font=fonte(28, True, serifa=True), fill=TINTA)
    y += 44
    nomes = {GRAMA: "grama (conjunto da equipe)", CAPIM: "capim alto, cortável (gerado)",
             TERRA: "terra: estrada 8, avenida 6, trilha 3", CALCADA: "calçada: ruas e cais da cidade",
             AGUA: "água do rio Lume", PLANALTO: "planalto (um degrau de penhasco)", MATA: "mata fechada (copa)",
             SOLO: "terra arada (canteiros da fazenda)"}
    for c, n in nomes.items():
        D.rectangle((lx, y + 3, lx + 28, y + 27), fill=CORES_CHAO[c], outline=TINTA)
        D.text((lx + 40, y), n, font=fonte(19), fill=TINTA)
        y += 34
    y += 16
    D.text((lx, y), "Objetos", font=fonte(28, True, serifa=True), fill=TINTA)
    y += 44
    itens = [((190, 80, 70), "casa de telhado vermelho (refeita)"), ((70, 100, 170), "casa de telhado azul (refeita)"),
             ((160, 110, 70), "casa de madeira (refeita)"), (CORES_OBJ["ponte"], "ponte de madeira (refeita)"),
             (CORES_OBJ["criar"], "ainda não existe: criar"), (CORES_OBJ["outro"], "objeto refeito (poço, galpão…)"),
             (CORES_OBJ["sebe"], "sebe (refeita)"), (CORES_OBJ["muro"], "muro baixo da cidade (criar)"),
             ((30, 95, 55), "árvore grande / borda de mata (refeita)")]
    for cor, n in itens:
        D.rectangle((lx, y + 3, lx + 28, y + 27), fill=cor, outline=TINTA)
        D.text((lx + 40, y), n, font=fonte(19), fill=TINTA)
        y += 34
    D.rectangle((lx, y + 3, lx + 28, y + 27), outline=CORES_OBJ["cerca"], width=4)
    D.text((lx + 40, y), "cerca da fazenda inicial (64 × 64)", font=fonte(19), fill=TINTA)
    y += 34
    D.line([(lx, y + 15), (lx + 28, y + 15)], fill=(110, 70, 30), width=3)
    D.text((lx + 40, y), "cerca máxima (192 × 192)", font=fonte(19), fill=TINTA)
    y += 50
    notas = [
        "Lote = 4 × 4 blocos (256 × 256 tiles). A fazenda",
        "começa com 64 × 64 no meio e cresce até 192;",
        "a margem de 32 tiles leva sebe e avenida, então",
        "os lotes encostam um no outro.",
        "",
        "Autoral (Diorama): as 6 quadras da cidade,",
        "o rio com as pontes, o centro do distrito,",
        "a parada e o miolo de cada fazenda (modelo).",
        "Gerado: a grama, o capim, os bosquetes e o",
        "mato dos lotes (que o jogador limpa).",
    ]
    for n in notas:
        D.text((lx, y), n, font=fonte(18), fill=TINTA)
        y += 26
    out = os.path.join(raiz, "esboco_haywood_v1.png")
    tela.convert("RGB").save(out, optimize=True)
    return out, g, obj


# --- Maquete em tamanho real -----------------------------------------------------------------------------------
def _carregar(raiz, cat, nome):
    p = os.path.join(raiz, "assets", cat, f"{nome}_estilo.png")
    return Image.open(p).convert("RGBA") if os.path.exists(p) else None


def maquete_fase1(raiz: str, g, obj, x0=24, y0=0, x1=424, y1=232):
    T = 16
    W, H = (x1 - x0) * T, (y1 - y0) * T
    tela = Image.new("RGBA", (W, H), (0, 0, 0, 255))
    ter = {n: _carregar(raiz, "terreno", n) for n in ("grama_terra", "agua_grama", "grama_calcada", "grama_variacoes", "mata_copa")}

    def tile(im, c, r):
        return im.crop((c * T, r * T, c * T + T, r * T + T))

    grama = [tile(ter["grama_variacoes"], 0, 0)] * 10 + [tile(ter["grama_variacoes"], i, 0) for i in (1, 2, 3)]
    capim = [tile(ter["grama_variacoes"], i, 0) for i in (1, 2, 3)] + [tile(ter["grama_variacoes"], i, 1) for i in (1, 2, 3)]
    calc = [tile(ter["grama_calcada"], 0, 0), tile(ter["grama_calcada"], 1, 0)]
    copa = tile(ter["mata_copa"], 0, 0)
    for y in range(y0, y1):
        for x in range(x0, x1):
            lista = capim if g[y, x] == CAPIM else grama
            tela.alpha_composite(lista[_semente(x, y) % len(lista)], ((x - x0) * T, (y - y0) * T))

    def wang(folha, codigos, miolos):
        for y in range(y0, y1):
            for x in range(x0, x1):
                cs = [g[min(LH - 1, y + dy), min(LW - 1, x + dx)] in codigos for dy, dx in ((0, 0), (0, 1), (1, 0), (1, 1))]
                cod = cs[0] * 1 + cs[1] * 2 + cs[2] * 4 + cs[3] * 8
                if cod == 0:
                    continue
                if cod == 15:
                    t = tile(folha, miolos[_semente("a", x, y) % len(miolos)], 4)
                else:
                    t = tile(folha, cod % 4, cod // 4)
                tela.alpha_composite(t, ((x - x0) * T + T // 2, (y - y0) * T + T // 2))

    wang(ter["grama_terra"], (TERRA, SOLO), (0, 0, 0, 1, 3))
    d = ImageDraw.Draw(tela)
    for y in range(y0, y1):
        for x in range(x0, x1):
            v = g[y, x]
            px, py = (x - x0) * T, (y - y0) * T
            if v == CALCADA:
                tela.alpha_composite(calc[(x + y) % 2], (px, py))
            elif v == MATA:
                tela.alpha_composite(copa, (px, py))
            elif v == PLANALTO and (y + 1 >= LH or g[y + 1, x] != PLANALTO or x + 1 >= LW or g[y, x + 1] != PLANALTO):
                # face do penhasco (rascunho: o conjunto de penhasco ainda não está em autotile)
                for k in range(1, 3):
                    d.rectangle((px, py + k * T, px + T - 1, py + k * T + T - 1), fill=(120, 88, 56, 255))
                    d.line([(px, py + k * T + 5), (px + T, py + k * T + 5)], fill=(90, 64, 40, 255), width=2)
                    d.line([(px + (x * 7) % 12, py + k * T), (px + (x * 7) % 12, py + k * T + T)], fill=(96, 70, 44, 255), width=1)
            elif v == SOLO:
                d.rectangle((px, py, px + T - 1, py + T - 1), fill=(118, 78, 46, 255))
                d.line([(px, py + 4), (px + T, py + 4)], fill=(92, 58, 34, 255), width=2)
                d.line([(px, py + 12), (px + T, py + 12)], fill=(92, 58, 34, 255), width=2)
                if _semente("broto", x, y) % 3 == 0:
                    d.rectangle((px + 6, py + 6, px + 9, py + 9), fill=(110, 180, 70, 255))
    wang(ter["agua_grama"], (AGUA,), (1,))
    nomes_img = {
        "casa_azul_grande": ("construcoes", "casa_azul_grande"), "casa_vermelha_loja": ("construcoes", "casa_vermelha_loja"),
        "casa_madeira": ("construcoes", "casa_madeira"), "casa_vermelha": ("construcoes", "casa_vermelha"),
        "casa_azul": ("construcoes", "casa_azul"), "casa_azul_media": ("construcoes", "casa_azul_media"),
        "ponte_madeira": ("construcoes", "ponte_madeira"), "galpao_madeira": ("construcoes", "galpao_madeira"),
        "poco_madeira": ("construcoes", "poco_madeira"), "poco_pedra": ("construcoes", "poco_pedra"),
        "portal_madeira": ("construcoes", "portal_madeira"), "bebedouro": ("objetos", "bebedouro"),
        "placa": ("objetos", "placa"), "banco_madeira": ("objetos", "banco_madeira"), "banco_pedra": ("objetos", "banco_pedra"),
        "cata_vento_praca": ("objetos", "cata_vento_praca"), "canteiro_potes": ("objetos", "canteiro_potes"),
        "pedra_leve": ("objetos", "pedra_leve"), "arvore_grande": ("vegetacao", "arvore_grande"),
        "arvore_pequena": ("vegetacao", "arvore_pequena"), "arvore_pequena_rosa": ("vegetacao", "arvore_pequena_rosa"),
        "moita_grande": ("vegetacao", "moita_grande"), "moita_cruz": ("vegetacao", "moita_cruz"),
        "arbusto": ("vegetacao", "arbusto"), "toco": ("vegetacao", "toco"), "flores_brancas": ("vegetacao", "flores_brancas"),
        "canteiro_flores_rosa": ("vegetacao", "canteiro_flores_rosa"), "mata_bloco": ("vegetacao", "mata_bloco"),
        "morro": ("terreno", "penhasco_morro_anel"), "lago_anel": ("terreno", "lago_penhasco_anel"),
    }
    cache = {}
    sebe_h = _carregar(raiz, "vegetacao", "sebe_horizontal")
    sebe_v = _carregar(raiz, "vegetacao", "sebe_vertical")
    cerca_h = _carregar(raiz, "construcoes", "cerca_estacas")
    cerca_v = _carregar(raiz, "construcoes", "cerca_pecas")
    fr = fonte(22, True)
    rotulos = []

    def dentro(x, y, w, h):
        return x + w > x0 and x < x1 and y + h > y0 and y < y1

    def linha_h(im, x, y, w, passo=None):
        passo = passo or im.width
        for i in range(0, max(1, w * T - 4), passo):
            tela.alpha_composite(im, (int((x - x0) * T + i), int((y - y0) * T)))

    def linha_v(im, x, y, h, passo=None):
        passo = passo or (im.height - 4)
        for i in range(0, max(1, h * T - 4), passo):
            tela.alpha_composite(im, (int((x - x0) * T), int((y - y0) * T + i)))

    planos = [o for o in obj if o[0] in ("ponte_madeira", "lago_anel", "morro", "ponte_pedra", "pier", "canteiro_flores_rosa",
                                          "flores_brancas")]
    resto = sorted([o for o in obj if o not in planos], key=lambda o: o[2] + o[4])
    sebe_curta = sebe_h.crop((0, 0, 32, sebe_h.height))
    sebe_vc = sebe_v.crop((0, 0, sebe_v.width, 32))
    for t, x, y, w, h, rot in planos + resto:
        if not dentro(x - 6, y - 6, w + 12, h + 12):
            continue
        X, Y = (x - x0) * T, (y - y0) * T
        if t in ("sebe_h", "muro_h"):
            linha_h(sebe_curta, x, y - 1, w, 32)
        elif t in ("sebe_v", "muro_v"):
            linha_v(sebe_vc, x, y, h, 30)
        elif t == "sebe_lote":
            linha_h(sebe_curta, x, y, w, 32)
            linha_h(sebe_curta, x, y + h - 1, 6, 32)
            linha_h(sebe_curta, x + w - 6, y + h - 1, 6, 32)
            linha_v(sebe_vc, x, y, h, 30)
            linha_v(sebe_vc, x + w - 1, y, h, 30)
        elif t == "hachura":
            continue
        elif t == "cerca":
            linha_h(cerca_h, x, y - 1, w)
            linha_h(cerca_h, x, y + h - 1, w)
            linha_v(cerca_v, x, y, h)
            linha_v(cerca_v, x + w - 2, y, h)
            rotulos.append((X + w * T / 2, Y - 40, rot, False))
        elif t == "cerca_max":
            for i in range(0, w * T, 48):
                for seg in (((X + i, Y), (X + i + 24, Y)), ((X, Y + i), (X, Y + i + 24)),
                            ((X + w * T, Y + i), (X + w * T, Y + i + 24)), ((X + i, Y + h * T), (X + i + 24, Y + h * T))):
                    d.line(list(seg), fill=(250, 240, 200, 255), width=3)
        elif t in nomes_img:
            if t not in cache:
                cache[t] = _carregar(raiz, *nomes_img[t])
            im = cache[t]
            if im is None:
                continue
            if t in ("arvore_grande", "arvore_pequena", "arvore_pequena_rosa", "moita_grande", "moita_cruz", "arbusto",
                     "pedra_leve", "toco", "flores_brancas"):
                pos = (int(X - im.width / 2), int(Y - im.height + 8))
            else:
                pos = (int(X), int(Y))
            tela.alpha_composite(im, pos)
            if rot:
                rotulos.append((pos[0] + im.width / 2, pos[1] + im.height + 4, rot, False))
        else:
            d.rectangle((X, Y, X + w * T, Y + h * T), fill=(230, 60, 160, 210), outline=(80, 0, 50, 255), width=3)
            if rot:
                rotulos.append((X + w * T / 2, Y + h * T + 4, rot, True))
    for x, y, rot, criar in rotulos:
        texto_contorno(d, (x, y), rot, fr, cor=(150, 0, 90) if criar else TINTA, anchor="ma", w=4)
    for bx in range(0, LW, 64):
        if x0 < bx < x1:
            for yy in range(0, H, 24):
                d.line([((bx - x0) * T, yy), ((bx - x0) * T, yy + 10)], fill=(255, 255, 255, 160), width=2)
    for by in range(0, LH, 64):
        if y0 < by < y1:
            for xx in range(0, W, 24):
                d.line([(xx, (by - y0) * T), (xx + 10, (by - y0) * T)], fill=(255, 255, 255, 160), width=2)
    out = os.path.join(raiz, "esboco_haywood_maquete_v1.png")
    tela.convert("RGB").save(out, optimize=True)
    return out


# --- Para o jogo: src/shared/world/*.ts (fase 0 do MAPA_MUNDO.md, 2026-10-23) ------------------------------------
# `jogo` grava três módulos que o jogo lê (gerados como os interiores: não editar à mão); `jogo --conferir` só compara.
#
# - `plano.ts`: o plano do mundo em dados: reinos, biomas, lugares (com distritos e lotes) e o reino e o bioma de cada
#   bloco (832 × 832, uma linha RLE por linha de blocos).
# - `terreno.ts`: os terrenos, as junções e os decalques da folha_juncao (diorama/catalogo/exterior.json) e o que só o
#   mundo usa (diorama/catalogo/mundo.json): as texturas grandes, a água do rio e os conjuntos da equipe, por chave do
#   registro (sem id, o jogo usa a folha_juncao).
# - `fase1.ts`: a fase 1 (Ribeira leste e o D03, 12 × 9 blocos): o terreno do jogo de cada célula (uma linha RLE por
#   linha de tiles), o que bloqueia, as zonas com nome, os lotes, o começo e os lugares marcados (tudo o que ainda não
#   tem arte com id fica como marca, sem arte nova).
RAIZ_REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PASTA_JOGO = os.path.join(RAIZ_REPO, "src", "shared", "world")
CODIGOS_PLANO = {GRAMA: "grama", TERRA: "terra", CALCADA: "calcada", AGUA: "agua", MATA: "mata", CAPIM: "capim",
                 SOLO: "solo", PLANALTO: "planalto"}
# Os lugares marcados: o que cada tipo do esboço é. "construcao" e "vegetacao" já existem refeitos (sem id); "criar"
# ainda não existe (CRIAR); "cerca", sebes, cercas e muros (contorno).
CERCAS = {"sebe_lote", "sebe_h", "sebe_v", "muro_h", "muro_v", "cerca"}
VEGETACAO = {"arvore_grande", "arvore_pequena", "arvore_pequena_rosa", "moita_grande", "moita_cruz", "arbusto", "toco",
             "pedra_leve", "flores_brancas", "mata_bloco", "morro", "lago_anel", "canteiro_flores_rosa"}
# O que bloqueia o passo na fase 0: as construções (existentes ou a criar) ocupam o retângulo da marca.
BLOQUEIAM = {"casa_vermelha", "casa_azul", "casa_madeira", "casa_azul_media", "casa_azul_grande", "casa_vermelha_loja",
             "galpao_madeira", "casa_fazenda", "celeiro", "galinheiro", "mirante", "barraca", "caixa_venda",
             "quadro_pedidos", "carroca", "poco_madeira", "poco_pedra", "cata_vento_praca", "bebedouro"}
ZONAS_F1 = [
    ("Alto do Mirante", (0, 0, 63, 63)),
    ("Ribeira", (0, 64, 127, 255)),
    ("Ribeira (em obras: fase 2)", (0, 256, 127, 575)),
    ("Ponte do Lume", (128, 0, 191, 63)),
    ("Rio Lume", (128, 64, 191, 575)),
    ("Parada da estrada", (192, 0, 255, 63)),
    ("Centro do distrito D03", (192, 64, 255, 319)),
    ("Margem do Lume", (192, 320, 255, 575)),
    ("Estrada do Leste", (256, 0, 575, 63)),
    ("Bosque do Lume", (576, 0, 767, 63)),
    ("Lote A", (256, 64, 511, 319)),
    ("Lote B", (512, 64, 767, 319)),
    ("Lote C", (256, 320, 511, 575)),
    ("Lote D", (512, 320, 767, 575)),
]


def _ts(v) -> str:
    return json.dumps(v, ensure_ascii=False)


def _rle(linha) -> str:
    """"gggtt" → "g3t2": cada corrida é o código (uma letra) e o comprimento."""
    partes = []
    i = 0
    n = len(linha)
    while i < n:
        j = i
        while j < n and linha[j] == linha[i]:
            j += 1
        partes.append(f"{linha[i]}{j - i}")
        i = j
    return "".join(partes)


def _catalogo(nome: str) -> dict:
    with open(os.path.join(RAIZ_REPO, "diorama", "catalogo", f"{nome}.json"), encoding="utf-8") as f:
        return json.load(f)


def _cabecalho(descricao: str) -> str:
    return ("// Gerado por tools/mundo_mapa.py (`npm run mundo:jogo`) a partir do plano do mundo; não editar à mão.\n"
            f"// {descricao}")


def fase1_terreno_jogo(g: np.ndarray, obj: list, mundo: dict) -> tuple[np.ndarray, dict]:
    """O terreno do jogo de cada célula da fase 1 (códigos de exterior.json; "G" é grama com capim)."""
    out = np.empty(g.shape, "<U1")
    for k, nome in CODIGOS_PLANO.items():
        out[g == k] = mundo["do_plano"][nome]
    out[(g == CAPIM) & (out == "g")] = "G"
    agua = g == AGUA
    # vau: onde o plano tem ponte, a água fica rasa de margem a margem (a ponte é um lugar marcado)
    vau = np.zeros(g.shape, bool)
    for t, x, y, w, h, _ in obj:
        if t.startswith("ponte"):
            vau[max(0, y - 3):y + h + 3, max(0, x - 3):x + w + 3] = True
    fundo = ndimage.binary_erosion(agua, structure=np.ones((3, 3)), iterations=2, border_value=1) & ~vau
    margem = ndimage.binary_dilation(agua, structure=np.ones((3, 3))) & ~agua
    out[margem] = "a"
    out[agua] = "r"
    out[fundo] = "m"
    info = {"agua": int(agua.sum()), "fundo": int(fundo.sum()), "margem": int(margem.sum()), "vau": int((vau & agua).sum())}
    return out, info


def conferir_pares(t: np.ndarray, exterior: dict) -> list[str]:
    """Os tiles da grade dupla que juntariam dois terrenos sem junção no catálogo (devem ser zero)."""
    nivel = {c: d["nivel"] for c, d in exterior["terrenos"].items()}
    pares = {(j["sobre"], j["sob"]) for j in exterior["juncoes"]}
    base = np.where(t == "G", "g", t)
    ext = np.pad(base, ((0, 1), (0, 1)), mode="edge")
    q = [ext[:-1, :-1], ext[:-1, 1:], ext[1:, :-1], ext[1:, 1:]]
    misto = ~((q[0] == q[1]) & (q[0] == q[2]) & (q[0] == q[3]))
    ruins = []
    for y, x in zip(*np.nonzero(misto)):
        cods = sorted({q[k][y, x] for k in range(4)}, key=lambda c: nivel[c])
        for a, b in zip(cods, cods[1:]):
            if (b, a) not in pares:
                ruins.append(f"({x}, {y}): {b} sobre {a}")
    return ruins


def modulo_terreno(exterior: dict, mundo: dict) -> str:
    folha = np.array(Image.open(os.path.join(RAIZ_REPO, "diorama", "folhas", "folha_juncao.png")).convert("RGBA"))
    T = exterior["tile"]
    terrenos = []
    for cod, d in exterior["terrenos"].items():
        tile = folha[d["base"] * T:(d["base"] + 1) * T, 0:4 * T]
        cores, n = np.unique(tile.reshape(-1, 4), axis=0, return_counts=True)
        cor = cores[n.argmax()]
        # o recorte liso: 4 × 4 px só da cor que mais aparece (o miolo de 8 × 8 nas bases de uma cor só)
        if len(cores) == 1:
            liso = [4, d["base"] * T + 4, 8]
        else:
            igual = (tile == cor).all(-1)
            liso = None
            for yy in range(T - 4):
                for xx in range(4 * T - 4):
                    if igual[yy:yy + 4, xx:xx + 4].all():
                        liso = [xx, d["base"] * T + yy, 4]
                        break
                if liso:
                    break
        terrenos.append({"codigo": cod, "nome": d["nome"], "nivel": d["nivel"], "base": d["base"], "acao": d["acao"],
                         "liso": liso, "cor": "#%02x%02x%02x" % tuple(int(c) for c in cor[:3]),
                         "textura": mundo["texturas_grandes"].get(cod, "")})
    juncoes = [[j["sobre"], j["sob"], j["linha"], j.get("quadros", 1), j.get("dy", 0)] for j in exterior["juncoes"]]
    decalques = {}
    for grupo, lista in mundo["decalques"].items():
        if not isinstance(lista, list):
            continue
        decalques[grupo] = []
        for item in lista:
            d = exterior["decalques"][item["id"]]
            decalques[grupo].append([item["id"], d["sx"], d["sy"], d["w"], d["h"], item["por_mil"]])
    conj = mundo["conjuntos"]
    conjuntos = [[c["id"], c["a"], c["b"], (c["vaga"] % 16) * 64, (c["vaga"] // 16) * 96] for c in conj["lista"]]
    linhas = [
        _cabecalho("Fontes: diorama/catalogo/exterior.json (a folha_juncao) e diorama/catalogo/mundo.json."),
        "",
        "/** Um terreno do chão: código, nome, nível (quem fica por cima na junção), linha da base na folha_juncao, ação,",
        " * o recorte liso [x, y, lado] (só a cor que mais aparece na base), a cor e a chave da textura grande no registro. */",
        "export interface WorldTerrain {",
        "\tcode: string;",
        "\tname: string;",
        "\tlevel: number;",
        "\tbase: number;",
        "\taction: string;",
        "\tflat: [x: number, y: number, size: number];",
        "\tcolor: string;",
        "\ttexture: string;",
        "}",
        "",
        "export const WORLD_TERRAINS: WorldTerrain[] = [",
    ]
    for t in terrenos:
        linhas.append(
            f"\t{{ code: {_ts(t['codigo'])}, name: {_ts(t['nome'])}, level: {t['nivel']}, base: {t['base']}, "
            f"action: {_ts(t['acao'])}, flat: {_ts(t['liso'])}, color: {_ts(t['cor'])}, texture: {_ts(t['textura'])} }},")
    linhas += [
        "];",
        "",
        "/** As junções da folha_juncao: [de cima, de baixo, primeira linha, quadros, quanto o recorte desce por quadro]. */",
        "export const WORLD_JUNCTIONS: [over: string, under: string, row: number, frames: number, dy: number][] = [",
    ]
    linhas += [f"\t{_ts(j)}," for j in juncoes]
    linhas += [
        "];",
        "",
        "/** Os decalques espalhados por semente: grupo → [id, x, y, largura, altura (células), quantos por mil células]. */",
        "export const WORLD_DECALS: Record<string, [id: string, sx: number, sy: number, w: number, h: number, perMille: number][]> = {",
    ]
    for grupo, lista in decalques.items():
        linhas.append(f"\t{grupo}: [")
        linhas += [f"\t\t{_ts(x)}," for x in lista]
        linhas.append("\t],")
    linhas += [
        "};",
        "",
        f"/** A chave no registro da folha dos conjuntos da equipe ({conj['lado']} × {conj['lado']}, desenho {conj['desenho']}). */",
        f"export const WORLD_SETS_SHEET = {_ts(conj['folha'])};",
        "/** Os conjuntos da equipe (Wang de 16 em 4 × 6 tiles): [id, terreno A, terreno B, canto x, canto y na folha]. */",
        "export const WORLD_SETS: [id: string, a: string, b: string, x: number, y: number][] = [",
    ]
    linhas += [f"\t{_ts(c)}," for c in conjuntos]
    linhas += [
        "];",
        "",
        "/** O grupo do registro com os 4 quadros da água do rio (1024 × 1024). */",
        f"export const WORLD_RIVER_FRAMES = {_ts(mundo['agua_rio'])};",
        "",
    ]
    return "\n".join(linhas)


def modulo_fase1(g, obj, mundo, exterior, objetos: dict) -> tuple[str, dict]:
    t, info = fase1_terreno_jogo(g, obj, mundo)
    ruins = conferir_pares(t, exterior)
    if ruins:
        raise SystemExit(f"fase 1: {len(ruins)} tiles sem junção, por exemplo {ruins[:5]}")
    linhas_rle = ["".join(r) for r in t]
    tipos = sorted({o[0] for o in obj if o[0] not in ("cerca_max", "hachura")})

    def categoria(tp):
        if tp in CRIAR:
            return "criar"
        if tp in CERCAS:
            return "cerca"
        if tp in VEGETACAO:
            return "vegetacao"
        return "construcao"

    marcas = []
    bloqueios = []
    fechado = []
    for tp, x, y, w, h, rot in obj:
        if tp == "cerca_max":
            continue
        if tp == "hachura":
            fechado.append([x, y, x + w - 1, y + h - 1, rot])
            continue
        marcas.append([tipos.index(tp), int(x), int(y), int(w), int(h), rot])
        # Com arte no catálogo dos objetos, o bloqueio é o do catálogo (os pixels da imagem de verdade); sem arte (o que
        # falta criar), a construção bloqueia o retângulo da marca.
        if tp in objetos["tipos"]:
            bloqueios += bloqueios_objeto(objetos["tipos"][tp], int(x), int(y), int(w), int(h))
        elif tp in BLOQUEIAM:
            bloqueios.append([int(x), int(y), int(x + w - 1), int(y + h - 1)])
    marcas.sort(key=lambda m: (m[2], m[1]))
    lotes = []
    for nome, (lx, ly) in LOTES_F1.items():
        fx, fy = lx + 96, ly + 96
        portao = [fx + 70, fy + 29] if lx == 256 else [fx - 6, fy + 29]
        lotes.append({"name": nome, "area": [lx, ly, lx + 255, ly + 255], "farm": [fx, fy, fx + 63, fy + 63],
                      "gate": portao})
    comeco = lotes[0]["gate"]
    linhas = [
        _cabecalho("A fase 1 (docs/mundo/reinos/haywood.md §4): Ribeira leste e os 4 primeiros lotes do D03, 12 × 9 blocos."),
        "// Coordenadas em células (tiles de 16 px) a partir do canto da fase, a célula (blockX × 64, blockY × 64) do mundo.",
        "",
        "export const PHASE1 = {",
        f"\t/** O bloco do mundo no canto de cima à esquerda da fase. */",
        f"\tblockX: {BX0},",
        f"\tblockY: {BY0},",
        f"\tblocksWide: {LW // 64},",
        f"\tblocksHigh: {LH // 64},",
        f"\twidth: {LW},",
        f"\theight: {LH},",
        f"\t/** Onde o jogador começa: o portão do lote A. */",
        f"\tspawn: {_ts(comeco)} as [x: number, y: number],",
        "};",
        "",
        "/**",
        " * O terreno de cada célula, uma linha RLE por linha de células (código e comprimento): m mar fundo, r mar raso,",
        f" * a areia, t terra, g grama, G grama com capim. Água {info['agua']} células ({info['fundo']} fundas, {info['vau']} no vau),",
        f" * margem de areia {info['margem']}.",
        " */",
        "export const PHASE1_ROWS = [",
    ]
    linhas += [f"\t{_ts(_rle(r))}," for r in linhas_rle]
    linhas += [
        "];",
        "",
        "/**",
        " * O que bloqueia, além da água funda e da borda da fase: [x0, y0, x1, y1] inclusivos. Os objetos com arte, pelo",
        " * catálogo (diorama/catalogo/mundo.json, `objetos`: o tronco da árvore, as paredes da casa); as construções sem arte, o",
        " * retângulo da marca.",
        " */",
        "export const PHASE1_BLOCKERS: [x0: number, y0: number, x1: number, y1: number][] = [",
    ]
    linhas += [f"\t{_ts(b)}," for b in bloqueios]
    linhas += [
        "];",
        "",
        "/** As áreas fechadas na fase 1 (tapumes, sem passagem): [x0, y0, x1, y1, por quê]. */",
        "export const PHASE1_CLOSED: [x0: number, y0: number, x1: number, y1: number, why: string][] = [",
    ]
    linhas += [f"\t{_ts(b)}," for b in fechado]
    linhas += [
        "];",
        "",
        "/** As zonas com nome (a plaquinha ao entrar): nome e [x0, y0, x1, y1] inclusivos. */",
        "export const PHASE1_ZONES: [name: string, area: [x0: number, y0: number, x1: number, y1: number]][] = [",
    ]
    linhas += [f"\t[{_ts(n)}, {_ts(list(a))}]," for n, a in ZONAS_F1]
    linhas += [
        "];",
        "",
        "/** Os lotes (vagas de fazenda): a área de 4 × 4 blocos, a fazenda inicial de 64 × 64 e o portão (célula). */",
        "export const PHASE1_LOTS: { name: string; area: number[]; farm: number[]; gate: number[] }[] = [",
    ]
    linhas += [f"\t{{ name: {_ts(l['name'])}, area: {_ts(l['area'])}, farm: {_ts(l['farm'])}, gate: {_ts(l['gate'])} }}," for l in lotes]
    linhas += [
        "];",
        "",
        "/** Os tipos de lugar marcado e o que cada um é: construcao (refeito, sem id), vegetacao, cerca, criar (não existe). */",
        "export const PHASE1_MARK_KINDS: [kind: string, category: string][] = [",
    ]
    linhas += [f"\t[{_ts(tp)}, {_ts(categoria(tp))}]," for tp in tipos]
    linhas += [
        "];",
        "",
        "/** Os lugares marcados: [tipo (índice de PHASE1_MARK_KINDS), x, y, largura, altura, nome]. */",
        "export const PHASE1_MARKS: [kind: number, x: number, y: number, w: number, h: number, label: string][] = [",
    ]
    linhas += [f"\t{_ts(m)}," for m in marcas]
    linhas += ["];", ""]
    stats = {"marcas": len(marcas), "bloqueios": len(bloqueios), **info,
             "corridas": sum(len(_rle(r)) for r in linhas_rle)}
    return "\n".join(linhas), stats


def modulo_plano(cls, k, lugares) -> str:
    def rle_raster(r):
        linhas = []
        for by in range(0, LADO, 2):
            linha = "".join(chr(ord("a") + int(v)) for v in r[by, 0::2])
            linhas.append(_rle(linha))
        return linhas

    lados = 832
    linhas = [
        _cabecalho("O plano do mundo (docs/mundo/MAPA_MUNDO.md): reinos, biomas, lugares e o reino e o bioma de cada bloco."),
        "",
        "/** O mundo: 13 × 13 setores de 64 × 64 blocos; um bloco tem 64 × 64 tiles de 16 px. */",
        f"export const WORLD_SECTORS = 13;",
        f"export const WORLD_BLOCKS = {lados};",
        f"export const SECTOR_BLOCKS = 64;",
        f"export const SECTOR_COLUMNS = {_ts(COLUNAS)};",
        "",
        "/** Os reinos (1 a 6) e as cidades livres (7 a 12); 0 é o mar. [nome, livre, cor, área em setores]. */",
        "export const WORLD_REALMS: [name: string, free: boolean, color: string, area: number][] = [",
        f"\t[\"mar\", false, \"#3d4f7f\", {(k == 0).sum() / PX_SETOR ** 2:.2f}],",
    ]
    for rid, (nome, cor) in REINOS.items():
        linhas.append(f"\t[{_ts(nome)}, {_ts(rid in LIVRES)}, {_ts('#%02x%02x%02x' % cor)}, {(k == rid).sum() / PX_SETOR ** 2:.2f}],")
    linhas += [
        "];",
        "",
        "/** Os biomas do plano, na ordem do código (a = 0). */",
        f"export const WORLD_BIOMES = {_ts(NOMES_BIOMAS)};",
        "",
        "/** Os lugares do plano: [nome, tipo, bloco x, bloco y, setor, reino, fase, lotes (distritos; 0 nos demais)]. */",
        "export const WORLD_PLACES: [name: string, kind: string, bx: number, by: number, sector: string, realm: number, phase: number, lots: number][] = [",
    ]
    for l in lugares:
        linhas.append("\t" + _ts([l["nome"], l["tipo"], l["bloco_x"], l["bloco_y"], l["setor"], l["reino_id"], l["fase"],
                                  l["lotes"] or 0]) + ",")
    linhas += [
        "];",
        "",
        "/** O reino de cada bloco (código a = 0 mar, b = 1 Haywood...), uma linha RLE por linha de blocos. */",
        "export const REALM_ROWS = [",
    ]
    linhas += [f"\t{_ts(r)}," for r in rle_raster(k)]
    linhas += [
        "];",
        "",
        "/** O bioma de cada bloco (código a = 0, a ordem de WORLD_BIOMES), uma linha RLE por linha de blocos. */",
        "export const BIOME_ROWS = [",
    ]
    linhas += [f"\t{_ts(r)}," for r in rle_raster(cls)]
    linhas += ["];", ""]
    return "\n".join(linhas)


def folha_conjuntos(raiz: str) -> str:
    """Monta a folha dos conjuntos da equipe (mundo.json, `conjuntos`) em `<raiz>/folha_conjuntos_v1.png`, fora do
    repositório, pronta para enviar (mundo.conjuntos no registro; só com o OK do usuário). Cada conjunto vem do
    `*_melhorado.png` (ou `*_estilo.png`) de `<raiz>/assets/`; o que não é Wang de 4 × 6 tiles (64 × 96) fica de fora."""
    conj = _catalogo("mundo")["conjuntos"]
    folha = Image.new("RGBA", (conj["lado"], conj["lado"]), (0, 0, 0, 0))
    linhas = []
    for c in conj["lista"]:
        img = None
        for versao in ("melhorado", "estilo"):
            arq = os.path.join(raiz, "assets", *c["fonte"].split("/")[:-1], f"{c['fonte'].split('/')[-1]}_{versao}.png")
            if os.path.exists(arq):
                img = Image.open(arq).convert("RGBA")
                break
        if img is None:
            linhas.append(f"  {c['id']}: sem arquivo em assets/{c['fonte']}_*.png")
            continue
        if img.size != (64, 96):
            linhas.append(f"  {c['id']}: {img.size[0]} × {img.size[1]}, não é Wang de 4 × 6: fica de fora")
            continue
        folha.paste(img, ((c["vaga"] % 16) * 64, (c["vaga"] // 16) * 96))
        linhas.append(f"  {c['id']}: vaga {c['vaga']} ({versao})")
    saida = os.path.join(raiz, "folha_conjuntos_v1.png")
    folha.save(saida)
    return os.linesep.join([saida, *linhas])



# --- Objetos do mundo (MAPA_MUNDO.md §11, 2026-10-23) -------------------------------------------------------------
# `diorama/catalogo/mundo.json`, `objetos`: cada tipo de lugar marcado que já tem arte refeita vira cartão (em pé),
# deitado (no canvas fixo) ou linha/contorno (sebes e cercas, deitadas, numa tira já repetida). `jogo` grava
# src/shared/world/objetos.ts (onde cada recorte fica na folha, só com os tamanhos do _indice.json) e tira daqui os
# bloqueios de fase1.ts; `objetos` monta as folhas (imagens só em Haywood-Valley-recuperado\mundo\).
FORMAS = {"cartao": 0, "deitado": 1}
OCULTA = {"": 0, "tree": 1, "block": 2}
FOLGA_FOLHA = 2  # pixels vazios entre dois recortes da folha
# O jogo monta o mundo em pedaços de 32 × 32 tiles (512 px, worldMap.ts): um trecho de sebe dentro de um pedaço tem até
# 512 px e começa no passo da peça (até 64 px). A tira mede até 576 px, para todas caberem numa folha só.
PEDACO_PX = 512
TIRA_MAX = 576


def _indice(raiz: str) -> dict:
    with open(os.path.join(raiz, "assets", "_indice.json"), encoding="utf-8") as f:
        return {a["asset"]: a for a in json.load(f)}


def _recorte_padrao(ind: dict, asset: str) -> list[int]:
    if asset not in ind:
        raise SystemExit(f"mundo.json, objetos: o asset {asset!r} não está no _indice.json")
    w, h = ind[asset]["tamanho"]
    return [0, 0, int(w), int(h)]


def _tira(peca: dict, ind: dict, vertical: bool) -> dict:
    """Uma peça de sebe ou cerca e a tira que a repete ao longo de até `lado` pixels (um número inteiro de passos)."""
    rec = peca.get("recorte") or _recorte_padrao(ind, peca["asset"])
    passo = int(peca["passo"])
    comp = rec[3] if vertical else rec[2]
    n = max(1, (TIRA_MAX - comp) // passo + 1)
    total = (n - 1) * passo + comp
    if total < PEDACO_PX + passo - 1:
        raise SystemExit(f"objetos: a tira de {peca['asset']} (passo {passo}) não cobre um pedaço de {PEDACO_PX} px")
    w, h = (rec[2], total) if vertical else (total, rec[3])
    return {"asset": peca["asset"], "recorte": rec, "passo": passo, "vertical": vertical, "n": n, "w": w, "h": h,
            "chave": f"{peca['asset']}:{','.join(map(str, rec))}:{'v' if vertical else 'h'}:{passo}"}


def objetos_catalogo(raiz: str) -> dict:
    """O catálogo dos objetos resolvido com os tamanhos do _indice.json: os tipos e os recortes únicos a empacotar."""
    cat = _catalogo("mundo")["objetos"]
    ind = _indice(raiz)
    lado = int(cat["lado"])
    tipos = {}
    recortes = {}
    for o in cat["lista"]:
        forma = o.get("forma", "cartao")
        if forma in FORMAS:
            rec = o.get("recorte") or _recorte_padrao(ind, o["asset"])
            chave = f"{o['asset']}:{','.join(map(str, rec))}"
            recortes.setdefault(chave, {"asset": o["asset"], "recorte": rec, "w": rec[2], "h": rec[3], "chave": chave})
            pe = o.get("pe") or [rec[2] // 2, rec[3]]
            tipos[o["tipo"]] = {"forma": forma, "chave": chave, "w": rec[2], "h": rec[3], "pe": pe,
                                "bloqueio": o.get("bloqueio", []), "oculta": o.get("oculta", "")}
        else:
            t = {"forma": forma, "vao": int(o.get("vao_baixo", 0))}
            for lado_peca in ("h", "v"):
                if lado_peca in o:
                    tira = _tira(o[lado_peca], ind, lado_peca == "v")
                    recortes.setdefault(tira["chave"], tira)
                    t[lado_peca] = tira["chave"]
            tipos[o["tipo"]] = t
    return {"folha": cat["folha"], "lado": lado, "tipos": tipos, "recortes": recortes}


def empacotar(recortes: dict, lado: int) -> dict:
    """Linha do horizonte (skyline), do mais alto ao mais baixo, no ponto mais alto livre: chave → (folha, x, y).
    Determinístico (a ordem desempata pela chave)."""
    ordem = sorted(recortes.values(), key=lambda r: (-r["h"], -r["w"], r["chave"]))
    folhas: list[list[list[int]]] = []  # cada folha: segmentos [x, largura, y] da linha do horizonte
    pos = {}
    for r in ordem:
        if r["w"] > lado or r["h"] > lado:
            raise SystemExit(f"objetos: {r['chave']} ({r['w']} × {r['h']}) não cabe numa folha de {lado}")
        w, h = r["w"] + FOLGA_FOLHA, r["h"] + FOLGA_FOLHA
        colocado = False
        n = 0
        while not colocado:
            if n == len(folhas):
                folhas.append([[0, lado + FOLGA_FOLHA, 0]])
            sky = folhas[n]
            melhor = None
            for i, (sx, _, _) in enumerate(sky):
                if sx + w > lado + FOLGA_FOLHA:
                    break
                topo, x, j = 0, sx, i
                while x < sx + w and j < len(sky):
                    topo = max(topo, sky[j][2])
                    x += sky[j][1]
                    j += 1
                if topo + h <= lado + FOLGA_FOLHA and (melhor is None or (topo, sx) < melhor):
                    melhor = (topo, sx)
            if melhor is None:
                n += 1
                continue
            topo, sx = melhor
            pos[r["chave"]] = (n, sx, topo)
            resto = []
            for seg in sky:
                a, b = seg[0], seg[0] + seg[1]
                if b <= sx or a >= sx + w:
                    resto.append(seg)
                    continue
                if a < sx:
                    resto.append([a, sx - a, seg[2]])
                if b > sx + w:
                    resto.append([sx + w, b - (sx + w), seg[2]])
            resto.append([sx, w, topo + h])
            resto.sort()
            sky[:] = resto
            colocado = True
    return {"pos": pos, "folhas": len(folhas)}


def _ret_celulas(x0: float, y0: float, w: float, h: float) -> list[int]:
    """As células (inclusivas) cujo meio cai no retângulo em pixels; a do meio do retângulo se nenhuma cair."""
    cx0 = int(np.ceil((x0 - 8) / 16))
    cy0 = int(np.ceil((y0 - 8) / 16))
    cx1 = int(np.ceil((x0 + w - 8) / 16)) - 1
    cy1 = int(np.ceil((y0 + h - 8) / 16)) - 1
    if cx1 < cx0 or cy1 < cy0:
        cx0 = cx1 = int((x0 + w / 2) // 16)
        cy0 = cy1 = int((y0 + h / 2) // 16)
    return [cx0, cy0, cx1, cy1]


def bloqueios_objeto(tipo: dict, x: int, y: int, w: int, h: int) -> list[list[int]]:
    """Os bloqueios (células inclusivas, desde o canto da fase) de um objeto do catálogo posto na marca (x, y, w, h):
    o pé da imagem no meio da borda de baixo da marca, os retângulos do catálogo em pixels da imagem."""
    if tipo["forma"] != "cartao":
        return []
    bx, by = (x + w / 2) * 16, (y + h) * 16
    ix, iy = bx - tipo["pe"][0], by - tipo["pe"][1]
    return [_ret_celulas(ix + rx, iy + ry, rw, rh) for rx, ry, rw, rh in tipo["bloqueio"]]


def modulo_objetos(obj: dict) -> str:
    pk = empacotar(obj["recortes"], obj["lado"])
    pos = pk["pos"]
    linhas = [
        _cabecalho("Os objetos do mundo (diorama/catalogo/mundo.json, `objetos`): onde cada recorte fica na folha."),
        "// A folha (`mundo.objetos.<n>` no registro) sai de `python -I tools/mundo_mapa.py objetos`; sem o id, o jogo desenha",
        "// o lugar marcado (worldMap.ts). Pixels de arte; o pé é o ponto da imagem que fica no ponto do chão do objeto.",
        "",
        f"export const WORLD_OBJECT_SHEET = {_ts(obj['folha'])};",
        f"export const WORLD_OBJECT_SHEETS = {pk['folhas']};",
        "",
        "/** Forma: 0 cartão (em pé), 1 deitado (no canvas fixo). Oculta: 0 nada, 1 árvore, 2 cheio (occlusion.ts). */",
        "export const WORLD_OBJECTS: Record<",
        "\tstring,",
        "\t[sheet: number, x: number, y: number, w: number, h: number, ax: number, ay: number, form: number, hides: number]",
        "> = {",
    ]
    tipos = obj["tipos"]
    for nome in sorted(tipos):
        t = tipos[nome]
        if t["forma"] not in FORMAS:
            continue
        n, x, y = pos[t["chave"]]
        linhas.append(f"\t{nome}: [{n}, {x}, {y}, {t['w']}, {t['h']}, {t['pe'][0]}, {t['pe'][1]}, "
                      f"{FORMAS[t['forma']]}, {OCULTA[t['oculta']]}],")
    linhas += [
        "};",
        "",
        "/** Uma tira (a peça de sebe ou cerca repetida): folha, canto, largura e altura da tira, o passo e o lado da peça. */",
        "export type WorldStrip = [sheet: number, x: number, y: number, w: number, h: number, step: number, piece: number];",
        "",
        "/** Sebes, muros e cercas: linha (um lado) ou contorno (os quatro, com o vão no meio de baixo), deitados. */",
        "export const WORLD_LINES: Record<string, { outline: boolean; gap: number; h?: WorldStrip; v?: WorldStrip }> = {",
    ]
    for nome in sorted(tipos):
        t = tipos[nome]
        if t["forma"] in FORMAS:
            continue
        partes = [f"outline: {'true' if t['forma'] == 'contorno' else 'false'}", f"gap: {t['vao']}"]
        for lado in ("h", "v"):
            if lado in t:
                r = obj["recortes"][t[lado]]
                n, x, y = pos[t[lado]]
                peca = r["recorte"][3] if r["vertical"] else r["recorte"][2]
                partes.append(f"{lado}: [{n}, {x}, {y}, {r['w']}, {r['h']}, {r['passo']}, {peca}]")
        linhas.append(f"\t{nome}: {{ {', '.join(partes)} }},")
    linhas += ["};", ""]
    return "\n".join(linhas)


def folha_objetos(raiz: str) -> str:
    """Monta as folhas dos objetos em `<raiz>/folha_objetos_v1_<n>.png` (fora do repositório, prontas para enviar como
    mundo.objetos.<n>, só com o OK do usuário), com o mesmo empacotamento de objetos.ts."""
    obj = objetos_catalogo(raiz)
    ind = _indice(raiz)
    pk = empacotar(obj["recortes"], obj["lado"])
    folhas = [Image.new("RGBA", (obj["lado"], obj["lado"]), (0, 0, 0, 0)) for _ in range(pk["folhas"])]
    linhas = []
    for chave, r in sorted(obj["recortes"].items()):
        a = ind[r["asset"]]
        arq = a.get(a.get("recomendado", "estilo")) or a.get("estilo")
        img = Image.open(arq).convert("RGBA")
        x, y, w, h = r["recorte"]
        peca = img.crop((x, y, x + w, y + h))
        n, px, py = pk["pos"][chave]
        if "passo" in r:
            tira = Image.new("RGBA", (r["w"], r["h"]), (0, 0, 0, 0))
            for k in range(r["n"]):
                tira.alpha_composite(peca, (0, k * r["passo"]) if r["vertical"] else (k * r["passo"], 0))
            peca = tira
        folhas[n].alpha_composite(peca, (px, py))
        linhas.append(f"  {chave}: folha {n} em {px},{py} ({peca.width} × {peca.height}, {os.path.basename(arq)})")
    saidas = []
    for n, folha in enumerate(folhas):
        saida = os.path.join(raiz, f"folha_objetos_v1_{n}.png")
        folha.save(saida)
        saidas.append(saida)
    return os.linesep.join([*saidas, *linhas])


def exportar_jogo(raiz: str, cls, k, lugares, conferir: bool) -> int:
    exterior = _catalogo("exterior")
    mundo = _catalogo("mundo")
    g, obj = fase1_layout()
    objetos = objetos_catalogo(raiz)
    fase1, stats = modulo_fase1(g, obj, mundo, exterior, objetos)
    saidas = {
        "plano.ts": modulo_plano(cls, k, lugares),
        "terreno.ts": modulo_terreno(exterior, mundo),
        "fase1.ts": fase1,
        "objetos.ts": modulo_objetos(objetos),
    }
    diferentes = []
    for nome, texto in saidas.items():
        caminho_ts = os.path.join(PASTA_JOGO, nome)
        antes = open(caminho_ts, encoding="utf-8").read() if os.path.exists(caminho_ts) else None
        if antes != texto:
            diferentes.append(nome)
        if not conferir:
            os.makedirs(PASTA_JOGO, exist_ok=True)
            with open(caminho_ts, "w", encoding="utf-8", newline="\n") as f:
                f.write(texto)
        print(f"{'confere' if antes == texto else ('difere' if conferir else 'gravado')}: src/shared/world/{nome} "
              f"({len(texto.encode('utf-8')) // 1024} kB)")
    print(f"fase 1: {stats}")
    if conferir and diferentes:
        print(f"diferentes do gerado: {', '.join(diferentes)} (rode npm run mundo:jogo)")
        return 1
    return 0


# --- Saída ------------------------------------------------------------------------------------------------------
def tabela(lugares, cls, k):
    print("Áreas (setores):")
    for rid, (nome, _) in REINOS.items():
        print(f"  {nome}: {(k == rid).sum() / PX_SETOR ** 2:.2f}")
    for b, n in enumerate(NOMES_BIOMAS):
        print(f"  bioma {n}: {(cls == b).sum() / PX_SETOR ** 2:.2f}")
    print(json.dumps(lugares, ensure_ascii=False, indent=0))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("acao", nargs="?", default="tudo", choices=["mundo", "reinos", "fase1", "tabela", "jogo", "conjuntos", "objetos", "tudo"])
    ap.add_argument("--raiz", default=RAIZ_PADRAO)
    ap.add_argument("--conferir", action="store_true", help="com `jogo`: só compara com src/shared/world")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    if a.acao == "conjuntos":
        print(folha_conjuntos(a.raiz))
        return 0
    if a.acao == "objetos":
        print(folha_objetos(a.raiz))
        return 0
    cls = biomas_raster(a.raiz)
    k = reinos_raster(cls)
    lugares = lugares_resolvidos(k)
    if a.acao == "jogo":
        return exportar_jogo(a.raiz, cls, k, lugares, a.conferir)
    if a.acao == "tabela":
        tabela(lugares, cls, k)
        g, obj = fase1_layout()
        print(json.dumps(orcamento_fase1(g, obj)))
        return
    if a.acao in ("mundo", "tudo"):
        print(esboco_mundo(a.raiz, cls, k, lugares))
    if a.acao in ("reinos", "tudo"):
        sub = "Lugares do plano (etapa 1, v3) numerados; cor = fase de construção; a base do ALttP é para o desenho, refeito no estilo da equipe."
        for rid in range(1, 7):
            nome = REINOS[rid][0]
            arq = "esboco_reino_" + nome.lower().replace("é", "e").replace("á", "a") + "_v1.png"
            print(esboco_reino(a.raiz, k, lugares, [rid], arq, f"Reino de {nome} · esboço v1", sub))
        print(esboco_reino(a.raiz, k, lugares, [7, 8, 9, 10, 11, 12], "esboco_cidades_livres_v1.png",
                           "Cidades livres e Twilight Isle · esboço v1", sub))
    if a.acao in ("fase1", "tudo"):
        out, g, obj = esboco_fase1(a.raiz)
        print(out)
        print(maquete_fase1(a.raiz, g, obj))


if __name__ == "__main__":
    sys.exit(main())
