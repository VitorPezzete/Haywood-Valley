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

Uso: python -I tools/mundo_mapa.py [mundo | reinos | fase1 | tabela | jogo [--conferir] | conjuntos | objetos | plano |
    tudo] [--raiz <pasta>]

`jogo` grava os módulos do jogo em src/shared/world/ (plano.ts, terreno.ts, fase1.ts, objetos.ts e mapa.ts, o mundo
inteiro; ver as seções "Para o jogo" e "O mundo inteiro"). `plano` desenha o mapa.ts sobre os biomas em
`esboco_mundo_jogo_v1.png` (na --raiz), para conferir estradas, rios, lagos, cidades e distritos.
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
    # O trecho de cima para antes do Portão Leste (2026-10-23): o portal fica nas linhas 186 a 188, logo acima da
    # avenida (189 a 194), e a sebe passava por baixo dele.
    obj.append(("muro_v", 127, 64, 1, 122, ""))
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
CERCAS = {"sebe_lote", "sebe_h", "sebe_v", "muro_h", "muro_v", "cerca", "cerca_h", "cerca_v"}
VEGETACAO = {"arvore_grande", "arvore_pequena", "arvore_pequena_rosa", "moita_grande", "moita_cruz", "arbusto", "toco",
             "pedra_leve", "flores_brancas", "mata_bloco", "morro", "lago_anel", "canteiro_flores_rosa"}
# O que bloqueia o passo na fase 0: as construções (existentes ou a criar) ocupam o retângulo da marca.
# O espantalho bloqueia desde 2026-10-23 (achado do agente da fazenda): no lote ele fica dentro de um canteiro de terra,
# e sem bloquear o canteiro dava para cultivar e o trigo saía por cima da marca; bloqueando, `plotOpen` o tira.
BLOQUEIAM = {"casa_vermelha", "casa_azul", "casa_madeira", "casa_azul_media", "casa_azul_grande", "casa_vermelha_loja",
             "galpao_madeira", "casa_fazenda", "celeiro", "galinheiro", "mirante", "barraca", "caixa_venda",
             "quadro_pedidos", "carroca", "poco_madeira", "poco_pedra", "cata_vento_praca", "bebedouro", "espantalho"}
# As zonas com nome e as propriedades de som delas (`ambiente` e `musica`, como as zonas do Diorama; os perfis e as
# músicas estão em src/shared/sounds.ts). 2026-10-23: o campo (`campo`, com as camadas campoDia e campoNoite) em tudo o
# que é roça e beira de rio; a cidade e o centro do distrito com o ambiente de fora de sempre e a música da vila.
CAMPO = {"ambiente": "campo"}
VILA = {"ambiente": "exterior", "musica": "vila"}
ZONAS_F1 = [
    ("Alto do Mirante", (0, 0, 63, 63), CAMPO),
    ("Ribeira", (0, 64, 127, 255), VILA),
    ("Ribeira (em obras: fase 2)", (0, 256, 127, 575), {"ambiente": "exterior"}),
    ("Ponte do Lume", (128, 0, 191, 63), CAMPO),
    ("Rio Lume", (128, 64, 191, 575), CAMPO),
    ("Parada da estrada", (192, 0, 255, 63), CAMPO),
    ("Centro do distrito D03", (192, 64, 255, 319), VILA),
    ("Margem do Lume", (192, 320, 255, 575), CAMPO),
    ("Estrada do Leste", (256, 0, 575, 63), CAMPO),
    ("Bosque do Lume", (576, 0, 767, 63), CAMPO),
    ("Lote A", (256, 64, 511, 319), CAMPO),
    ("Lote B", (512, 64, 767, 319), CAMPO),
    ("Lote C", (256, 320, 511, 575), CAMPO),
    ("Lote D", (512, 320, 767, 575), CAMPO),
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
                         "textura": mundo["texturas_grandes"].get(cod, ""), "tom": "", "bloqueia": cod == "m"})
    # Os terrenos lisos dos biomas sem arte (mundo.json, `terrenos_lisos`, 2026-10-23): o recorte de 4 × 4 px de uma
    # cor só mais claro da folha_juncao, pintado com a cor do bioma (ImageColor3 = cor / cor do recorte).
    lum = folha[..., :3].astype(int).sum(-1)
    claro = None
    for yy in range(folha.shape[0] - 4):
        for xx in range(0, folha.shape[1] - 4):
            b = folha[yy:yy + 4, xx:xx + 4]
            if (b[..., 3] == 255).all() and (b == b[0, 0]).all() and (claro is None or lum[yy, xx] > claro[0]):
                claro = (lum[yy, xx], xx, yy, b[0, 0, :3].astype(int))
    _, cx, cy, branco = claro
    for t in mundo.get("terrenos_lisos", []):
        alvo = [int(t["cor"][i:i + 2], 16) for i in (1, 3, 5)]
        tom = [min(255, round(c * 255 / max(1, b))) for c, b in zip(alvo, branco)]
        terrenos.append({"codigo": t["codigo"], "nome": t["nome"], "nivel": 6, "base": -1, "acao": ".",
                         "liso": [int(cx), int(cy), 4], "cor": t["cor"], "textura": "",
                         "tom": "#%02x%02x%02x" % tuple(tom), "bloqueia": bool(t.get("bloqueia", False))})
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
        " * o recorte liso [x, y, lado] (só a cor que mais aparece na base), a cor e a chave da textura grande no registro;",
        " * `tint`: a ImageColor3 do recorte liso (os terrenos dos biomas sem arte; \"\" nos outros); `blocks`: não se anda. */",
        "export interface WorldTerrain {",
        "\tcode: string;",
        "\tname: string;",
        "\tlevel: number;",
        "\tbase: number;",
        "\taction: string;",
        "\tflat: [x: number, y: number, size: number];",
        "\tcolor: string;",
        "\ttexture: string;",
        "\ttint: string;",
        "\tblocks: boolean;",
        "}",
        "",
        "export const WORLD_TERRAINS: WorldTerrain[] = [",
    ]
    for t in terrenos:
        linhas.append(
            f"\t{{ code: {_ts(t['codigo'])}, name: {_ts(t['nome'])}, level: {t['nivel']}, base: {t['base']}, "
            f"action: {_ts(t['acao'])}, flat: {_ts(t['liso'])}, color: {_ts(t['cor'])}, texture: {_ts(t['textura'])}, "
            f"tint: {_ts(t['tom'])}, blocks: {_ts(t['bloqueia'])} }},")
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


CAMINHO = (TERRA, CALCADA)


def vaos_porteira() -> list[tuple[int, int, int, int]]:
    """As porteiras da cerca de cada fazenda (2026-10-23): um vão de 2 tiles no lado da cerca que dá para a trilha do
    portão (à direita nos lotes A e C, à esquerda nos B e D), nas duas primeiras linhas da trilha. Células
    inclusivas [x0, y0, x1, y1], desde o canto da fase."""
    vaos = []
    for _, (lx, ly) in LOTES_F1.items():
        fx, fy = lx + 96, ly + 96
        x0 = fx + 62 if lx == 256 else fx
        vaos.append((x0, fy + 28, x0 + 1, fy + 29))
    return vaos


def linhas_fase1(g: np.ndarray, obj: list, objetos: dict) -> tuple[list[tuple], dict]:
    """Sebes, muros e cercas em trechos retos (2026-10-23; antes não bloqueavam): o contorno vira os quatro lados (os
    tipos de linha de `linhas` no catálogo; os lados com a largura da peça vertical, em tiles), e cada lado perde os
    vãos: o do meio de baixo do contorno (`vao_baixo`), onde cruza um caminho (terra ou calçada dos dois lados da
    linha) ou a água, e as porteiras das cercas das fazendas (`vaos_porteira`). Devolve os trechos (tipo, x, y, w, h,
    rótulo; o rótulo no primeiro trecho do objeto) e quantas células de vão de cada tipo."""
    cat = {o["tipo"]: o for o in _catalogo("mundo")["objetos"]["lista"]}
    porteiras = vaos_porteira()
    contagem = {"contorno": 0, "caminho": 0, "agua": 0, "porteira": 0}

    def espessura(tipo: str) -> int:
        t = objetos["tipos"][tipo]
        return max(1, -(-objetos["recortes"][t["v"]]["recorte"][2] // 16)) if "v" in t else 1

    def caminho(x: int, y: int) -> bool:
        return 0 <= x < LW and 0 <= y < LH and g[y, x] in CAMINHO

    def agua(x: int, y: int) -> bool:
        return 0 <= x < LW and 0 <= y < LH and g[y, x] == AGUA

    def porteira(x0: int, y0: int, x1: int, y1: int) -> bool:
        return any(a <= x1 and x0 <= c and b <= y1 and y0 <= d for a, b, c, d in porteiras)

    trechos = []
    for tp, x, y, w, h, rot in obj:
        if tp not in CERCAS:
            continue
        o = cat[tp]
        lados = []  # (tipo, horizontal, x, y, comprimento, espessura, vão de baixo)
        if o.get("forma") == "contorno":
            th, tv = o["linhas"]["h"], o["linhas"]["v"]
            k = espessura(tv)
            vao = int(o.get("vao_baixo", 0))
            lados += [(th, True, x, y, w, 1, 0), (th, True, x, y + h - 1, w, 1, vao),
                      (tv, False, x, y, h, k, 0), (tv, False, x + w - k, y, h, k, 0)]
        elif "h" in o:
            lados.append((tp, True, x, y, max(w, 1), 1, 0))
        else:
            lados.append((tp, False, x, y, max(h, 1), espessura(tp), 0))
        rotulo = rot
        for tipo, horizontal, lx, ly, comp, k, vao in lados:
            # O vão de baixo no meio, como o desenho do contorno fazia (worldMap.ts): à esquerda, (comp - vão) // 2.
            esquerda = (comp - vao) // 2
            abertos = []
            for n in range(comp):
                if horizontal:
                    cx, cy = lx + n, ly
                    celulas = (cx, cy, cx, cy)
                    if vao > 0 and esquerda > 0 and esquerda <= n < esquerda + vao:
                        motivo = "contorno"
                    elif agua(cx, cy):
                        motivo = "agua"
                    elif caminho(cx, cy - 1) and caminho(cx, cy + 1):
                        motivo = "caminho"
                    else:
                        motivo = None
                else:
                    cx, cy = lx, ly + n
                    celulas = (cx, cy, cx + k - 1, cy)
                    if any(agua(cx + i, cy) for i in range(k)):
                        motivo = "agua"
                    elif caminho(cx - 1, cy) and caminho(cx + k, cy):
                        motivo = "caminho"
                    else:
                        motivo = None
                if motivo is None and porteira(*celulas):
                    motivo = "porteira"
                if motivo:
                    contagem[motivo] += 1
                abertos.append(motivo is not None)
            n = 0
            while n < comp:
                if abertos[n]:
                    n += 1
                    continue
                m = n
                while m < comp and not abertos[m]:
                    m += 1
                if horizontal:
                    trechos.append((tipo, lx + n, ly, m - n, 1, rotulo))
                else:
                    trechos.append((tipo, lx, ly + n, k, m - n, rotulo))
                rotulo = ""
                n = m
    return trechos, contagem


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
    # Sebes, muros e cercas: partidos em trechos retos, sem os vãos; cada trecho é uma marca e um bloqueio.
    trechos, vaos = linhas_fase1(g, obj, objetos)
    tipos = sorted((set(tipos) - CERCAS) | {t[0] for t in trechos})
    for tp, x, y, w, h, rot in trechos:
        marcas.append([tipos.index(tp), int(x), int(y), int(w), int(h), rot])
        bloqueios.append([int(x), int(y), int(x + w - 1), int(y + h - 1)])
    for tp, x, y, w, h, rot in obj:
        if tp == "cerca_max" or tp in CERCAS:
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
        "/**",
        " * As zonas com nome (a plaquinha ao entrar): nome, [x0, y0, x1, y1] inclusivos e as propriedades de som (`ambiente`,",
        " * `musica`, como as zonas do Diorama).",
        " */",
        "export const PHASE1_ZONES: [",
        "\tname: string,",
        "\tarea: [x0: number, y0: number, x1: number, y1: number],",
        "\tprops: Record<string, string>,",
        "][] = [",
    ]
    def props_ts(p: dict) -> str:
        return "{ " + ", ".join(f"{k}: {_ts(v)}" for k, v in p.items()) + " }"

    linhas += [f"\t[{_ts(n)}, {_ts(list(a))}, {props_ts(p)}]," for n, a, p in ZONAS_F1]
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
    stats = {"marcas": len(marcas), "bloqueios": len(bloqueios), "trechos": len(trechos), "vaos": vaos, **info,
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
        "/**",
        " * O que bloqueia em cada cartão do catálogo: retângulos [x, y, w, h] em pixels da imagem (a célula cujo meio cai",
        " * dentro bloqueia), para o gerador do mundo inteiro pôr os bloqueios dos objetos que ele mesmo espalha (2026-10-23;",
        " * os da fase 1 já vêm prontos em fase1.ts).",
        " */",
        "export const WORLD_OBJECT_BLOCKS: Record<string, [x: number, y: number, w: number, h: number][]> = {",
    ]
    for nome in sorted(tipos):
        t = tipos[nome]
        if t["forma"] == "cartao" and t["bloqueio"]:
            linhas.append(f"\t{nome}: {_ts([list(map(int, b)) for b in t['bloqueio']])},")
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
    mapa = plano_mundo(raiz, cls, k, lugares)
    saidas = {
        "plano.ts": modulo_plano(cls, k, lugares),
        "terreno.ts": modulo_terreno(exterior, mundo),
        "fase1.ts": fase1,
        "objetos.ts": modulo_objetos(objetos),
        "mapa.ts": modulo_mapa(mapa),
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
    print(f"mundo: {len(mapa['estradas'])} estradas ({mapa['n_trilhas']} trilhas), {len(mapa['rios'])} rios, "
          f"{len(mapa['lagos'])} lagos, {len(mapa['pontes'])} pontes, {len(mapa['cidades'])} cidades, "
          f"{len(mapa['distritos'])} distritos, {len(mapa['lotes'])} lotes, {len(mapa['pois'])} lugares")
    if conferir and diferentes:
        print(f"diferentes do gerado: {', '.join(diferentes)} (rode npm run mundo:jogo)")
        return 1
    return 0


# --- O mundo inteiro: fases 2 a 9 (MAPA_MUNDO.md §12, 2026-10-23) -----------------------------------------------
# Pedido do usuário: "faça o mapa todo", "expanda para além do reino Haywood, faça tudo", e o que não tem arte fica
# como lugar marcado ("não cria, deixe sem criar"). O mundo não vira dado por célula (518 mil blocos): este gerador grava
# só o **plano compacto** em src/shared/world/mapa.ts (estradas, rios, lagos, pontes, cidades, distritos, lotes e
# lugares, em tiles do mundo) e o jogo tira cada célula disso na hora (src/shared/world/blocks.ts), com o bioma e o
# reino por bloco de plano.ts. A fase 1 continua vindo de fase1.ts, célula a célula.
#
# - **Estradas**: as ligações dos documentos dos reinos e do plano (ROTAS), de lugar em lugar, com uma curva leve por
#   semente; as costuras com a fase 1 saem dos pontos onde as estradas dela chegam à borda (Portão Norte e estrada do
#   Leste). Lugares longe da rede ganham uma trilha até ela (`ligacoes_mundo`).
# - **Rios**: lidos à mão do plano (RIOS, em pixels do plano, 1 px = 32 tiles); o Lume passa pelos pontos do rio da
#   fase 1 (RIO). Lagos: as manchas azuis do plano viram elipses (`lagos_mundo`).
# - **Cidades**: a caixa do plano (capital 54 blocos, cidade 31, vila 13, cidade livre 34), alinhada aos blocos, como a
#   Ribeira da fase 1 (442–472 × 763–793: o canto nordeste é a cidade da fase 1).
# - **Distritos**: lotes de 4 × 4 blocos em pares de colunas (como A/B e C/D da fase 1), avenidas de 6 tiles entre
#   eles, centro do distrito do lado da cidade. O D03 continua os 4 lotes da fase 1 (E a L ao leste e ao sul); os demais
#   saem perto do ponto do plano, empurrados até caberem em terra, longe de água, cidades e estradas.

P1_TX, P1_TY = BX0 * 64, BY0 * 64
# Onde as estradas da fase 1 chegam à borda dela (em tiles do mundo): a estrada de Moinhos (Portão Norte, colunas 60–67)
# e a estrada do Leste (linhas 28–35).
COSTURA_NORTE = [("t", P1_TX + 64, P1_TY - 200), ("t", P1_TX + 64, P1_TY + 8)]
COSTURA_LESTE = [("t", P1_TX + LW - 8, P1_TY + 32), ("t", P1_TX + LW + 200, P1_TY + 32)]

# (largura em tiles, lugares ou pontos ("t", x, y) em tiles do mundo). Das tabelas "Estradas e linhas" de cada reino
# e do desenho do plano (as tracejadas cor de terra).
ROTAS: list[tuple[int, list]] = [
    # Haywood
    (8, ["Haywood", "Four Winds Inn", "Clover Inn", "Moinhos"]),
    (8, ["Moinhos", *COSTURA_NORTE]),
    (6, ["Moinhos", "Cais do Anzol", "Beech Plateau"]),
    (8, ["Haywood", "Arraial do Mirante", "Porto Rubro"]),
    (8, ["Haywood", "Sítio dos Pomares", "Carvalhal", "Povoado da Lamparina", "Fog Inn", "Brumário"]),
    (6, ["Carvalhal", "Capão das Colmeias", "Deer Glade"]),
    (8, ["Moinhos", "Porteira", "Pouso do Baobá", "Mesa Alta"]),
    (6, ["Four Winds Inn", "Pouso do Feno", "Porteira"]),
    (6, [*COSTURA_LESTE, "Capão das Colmeias"]),
    (8, ["Haywood", "Roça do Cacau", "Ferradura"]),
    # Verdália
    (8, ["Ferradura", "Pé de Sumaúma", "Remanso", "Porto Mangue"]),
    (8, ["Ferradura", "Clareira da Onça", "Comporta"]),
    (6, ["Porto Mangue", "Dossel", "Lodaçal", "Brumário"]),
    # Marésia
    (8, ["Gaivotas", "Arraial das Redes", "Anil", "Coqueiral", "Porto Mangue"]),
    (8, ["Gaivotas", "Comporta"]),
    (8, ["Comporta", "Salinas", "Anil"]),
    (8, ["Porto Gelo", "Polar Lighthouse", "Gaivotas"]),
    # Invernia
    (8, ["Arraial da Resina", "Pinhal", "Log Bridge", "Ice Pass", "Termal", "Retiro das Renas", "Candeia"]),
    (8, ["Pinhal", "Passagem da Serraria", "Frozen Passage", "Cais da Ponte de Gelo", "Candeia"]),
    (6, ["Termal", "Posto Polar", "Ice Cave", "Porto Gelo"]),
    (8, ["Candeia", "Comporta"]),
    (6, ["Candeia", "Pesqueiro dos Lagos"]),
    (6, ["Passagem da Serraria", "Sawmill Pass", "Galena"]),
    # Galena e Brasalta
    (6, ["Galena", "Cais de Galena"]),
    (6, ["Galena", "Garimpo", "Porto Basalto"]),
    (8, ["Galena", "Ponte de Ferro", "Bocafunda"]),
    (8, ["Bocafunda", "Fire Temple", "Brasalta"]),
    (6, ["Brasalta", "Vinha da Cinza"]),
    (8, ["Brasalta", "Crimson Fort", "Crimson Pass", "Garganta Rubra"]),
    (6, ["Porto Basalto", "Boca do Carvão", "Bocafunda"]),
    # Terracota e Miragem
    (8, ["Mesa Alta", "Haras do Sol", "Garganta Rubra"]),
    (8, ["Mesa Alta", "Cupinzal", "Cacimba"]),
    (8, ["Porto Rubro", "Crimson Crossroads Inn", "Crimson Pass"]),
    (6, ["Cacimba", "Paragem das Caravanas", "Miragem"]),
    (6, ["Miragem", "Duna Alta"]),
    (6, ["Crimson Fort", "Raiders' Camp", "Miragem"]),
    (6, ["Garganta Rubra", "Poço Seco"]),
    # Brumário, Twilight Isle, Porto Franco
    (6, ["Brumário", "Lodaçal"]),
    (6, ["North Pier", "Auréola", "Cais da Cachoeira", "Veil Gate"]),
    (6, ["Auréola", "Lapidário", "Crystal Grottoes"]),
    (6, ["Auréola", "Chapéu-de-Sapo"]),
    (6, ["Porto Franco", "Isle of Sails"]),
]


def _rio_f1(*idx):
    return [("t", P1_TX + RIO[i][0], P1_TY + RIO[i][1]) for i in idx]


# (nome, meia largura em tiles, seco, pontos em pixels do plano ou ("t", x, y) em tiles). Lidos do plano à mão
# (as linhas azuis): o Lume desce da capital por Moinhos e pelo Mirror Lake e entra na Ribeira pelo canto nordeste,
# onde vira o rio da fase 1 (os pontos de RIO); o Clear Creek e o Black River fecham o pântano; o White River separa a
# tundra da costa; o Tide Canal liga Comporta a Anil; o rio de Verdália sobe da Ferradura à costa leste; o Log River e o
# Cold River descem do Ice Pass; o Dry Riverbed (seco) chega ao Great Oasis.
RIOS: list[tuple[str, int, bool, list]] = [
    ("Rio Lume", 4, False, [(835, 1162), (842, 1243), (849, 1300), (856, 1338), (889, 1368), (953, 1400),
                            (986, 1410), (996, 1418), (975, 1465), (955, 1505), *_rio_f1(0, 1, 2),
                            *_rio_f1(7, 8, 9), (925, 1570), (915, 1600)]),
    ("Clear Creek", 3, False, [(1325, 1042), (1327, 1180), (1327, 1310), (1340, 1400), (1352, 1494), (1356, 1530)]),
    ("Black River", 4, False, [(1325, 1042), (1400, 1044), (1475, 1046), (1550, 1048), (1625, 1050)]),
    ("White River", 3, False, [(1163, 74), (1166, 150), (1160, 300), (1155, 458), (1152, 510)]),
    ("Tide Canal", 3, False, [(1240, 495), (1300, 470), (1380, 420), (1468, 365)]),
    ("Rio da Ferradura", 4, False, [(1265, 830), (1310, 780), (1360, 740), (1423, 676), (1491, 619), (1560, 575),
                                    (1625, 545)]),
    ("Log River", 4, False, [(400, 245), (360, 280), (320, 306), (265, 318), (200, 315), (110, 312), (25, 318)]),
    ("Cold River", 3, False, [(425, 250), (470, 290), (540, 300), (627, 330), (640, 390), (625, 428)]),
    ("Dry Riverbed", 3, True, [(205, 1170), (195, 1215), (180, 1260), (165, 1285)]),
]

LADO_CIDADE = {"capital": 54, "cidade": 31, "vila": 13, "livre": 34}
# A cidade de cada distrito (o "Cidade e distância" da §5): o centro do distrito fica do lado dela.
CIDADE_DISTRITO = {
    "D01": "Haywood", "D02": "Moinhos", "D03": "Ribeira", "D04": "Carvalhal", "D05": "Capão das Colmeias",
    "D06": "Pinhal", "D07": "Passagem da Serraria", "D08": "Termal", "D09": "Pesqueiro dos Lagos", "D10": "Bocafunda",
    "D11": "Galena", "D12": "Miragem", "D13": "Cacimba", "D14": "Mesa Alta", "D15": "Pouso do Baobá",
    "D16": "Ferradura", "D17": "Dossel", "D18": "Brumário", "D19": "Vinha da Cinza", "D20": "Anil", "D21": "Gaivotas",
    "D22": "Porto Franco", "D23": "Laranjal", "D24": "Auréola",
}
# Colunas de lotes por quantidade (sempre pares, como A/B da fase 1: cada par tem uma avenida N-S no meio).
COLUNAS_LOTES = {16: 4, 12: 4, 10: 2, 8: 4, 6: 2}
# O D03 continua os 4 lotes da fase 1 (A a D, colunas 0–1 e linhas 0–1): 4 × 3, com E–H ao leste e I–L ao sul.
D03_ORIGEM = (P1_TX + 256, P1_TY + 64)
D03_NOMES = {(0, 0): "A", (1, 0): "B", (0, 1): "C", (1, 1): "D", (2, 0): "E", (3, 0): "F", (2, 1): "G", (3, 1): "H",
             (0, 2): "I", (1, 2): "J", (2, 2): "K", (3, 2): "L"}
CENTRO_DISTRITO = (48, 32)  # o terreiro do centro do distrito, em tiles

# O que cada tipo de lugar do plano vira no jogo: (tipo da marca, largura, altura, categoria, bloqueia). Sem arte, tudo
# é lugar marcado (categoria "criar": não existe; "construcao": refeito, sem id). Nada: só a zona com o nome.
POI_FORMA = {
    "pousada": ("casa_azul_grande", 6, 9, "construcao", True), "ruina": ("ruina", 12, 10, "criar", True),
    "toca": ("toca", 6, 4, "criar", True), "chefe": ("covil", 16, 12, "criar", True),
    "mirante": ("mirante", 4, 5, "criar", True), "forte": ("forte", 24, 16, "criar", True),
    "pesca": ("pier", 6, 3, "criar", False), "cachoeira": ("cachoeira", 10, 6, "criar", True),
    "templo": ("templo", 20, 16, "criar", True), "masmorra": ("masmorra", 10, 8, "criar", True),
    "mina": ("mina", 8, 6, "criar", True), "termas": ("termas", 12, 8, "criar", True),
    "farol": ("farol", 4, 6, "criar", True), "arvore": ("arvore_gigante", 10, 10, "vegetacao", True),
    "passo": ("placa", 1, 1, "construcao", True), "acampamento": ("acampamento", 12, 8, "criar", True),
    "tesouro": ("tesouro", 2, 2, "criar", False), "feira": ("feira", 20, 12, "criar", True),
    "cemiterio": ("cemiterio", 16, 12, "criar", True), "ponte": ("ponte", 9, 5, "criar", False),
    "portal": ("portal", 8, 8, "criar", True), "vulcao": ("vulcao", 24, 24, "criar", True),
    "porto": ("pier", 6, 3, "criar", False),
}
CIDADES = ("capital", "cidade", "vila", "livre")


def _lugar_tiles(lugares: dict, p) -> tuple[float, float]:
    if isinstance(p, tuple) and p and p[0] == "t":
        return float(p[1]), float(p[2])
    if isinstance(p, tuple):
        return p[0] * TILES_PX, p[1] * TILES_PX
    l = lugares[p]
    return l["mx"] * TILES_PX, l["my"] * TILES_PX


def _onda(pts: list, nomes: list) -> list:
    """Uma curva leve entre dois lugares (determinística): trechos longos ganham pontos no meio, deslocados para o
    lado até 8% do trecho (no máximo 120 tiles)."""
    out = [pts[0]]
    for i, (a, b) in enumerate(zip(pts, pts[1:])):
        livre = isinstance(nomes[i], str) and isinstance(nomes[i + 1], str)
        L = float(np.hypot(b[0] - a[0], b[1] - a[1]))
        n = int(np.ceil(L / 800)) if livre and L > 600 else 1
        nx, ny = (-(b[1] - a[1]) / L, (b[0] - a[0]) / L) if L > 0 else (0, 0)
        for k in range(1, n):
            t = k / n
            amp = min(120.0, 0.08 * L / n)
            off = ((_semente("onda", nomes[i], nomes[i + 1], k) % 1000) / 1000 - 0.5) * 2 * amp
            out.append((a[0] + (b[0] - a[0]) * t + nx * off, a[1] + (b[1] - a[1]) * t + ny * off))
        out.append(b)
    return out


def _dist_seg(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
    qx, qy = ax + t * dx, ay + t * dy
    return float(np.hypot(px - qx, py - qy)), (qx, qy)


def _terra_frac(cls, a, b) -> float:
    """A fração do segmento (em tiles) que passa por terra no plano."""
    n = max(2, int(np.hypot(b[0] - a[0], b[1] - a[1]) / 16))
    ok = 0
    for k in range(n + 1):
        x = (a[0] + (b[0] - a[0]) * k / n) / TILES_PX
        y = (a[1] + (b[1] - a[1]) * k / n) / TILES_PX
        ix, iy = int(min(LADO - 1, max(0, x))), int(min(LADO - 1, max(0, y)))
        ok += cls[iy, ix] not in (13, 14)
    return ok / (n + 1)


def lagos_mundo(raiz: str, cls, lugares: dict) -> list:
    """As manchas azuis de lago do plano em terra (a cor do Mirror Lake e dos lagos claros), cheias o bastante para
    não serem linha nem letra, viram elipses pelos momentos: [nome, cx, cy, rx, ry, ângulo] em tiles. O nome é o do
    lugar de pesca ou oásis mais perto (até 40 px); os oásis sem mancha ganham um lago pequeno."""
    im = np.array(plano_etapa(raiz)).astype(np.int32)
    terra = (cls != 13) & (cls != 14)
    m = ((np.abs(im - np.array([77, 144, 204])).sum(-1) <= 30) |
         (np.abs(im - np.array([110, 170, 230])).sum(-1) <= 12)) & terra
    m = ndimage.binary_closing(m, iterations=1)
    lab, n = ndimage.label(m, structure=np.ones((3, 3)))
    lagos = []
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        sub = lab[sl] == i
        a = int(sub.sum())
        h, w = sub.shape
        if a < 20 or a / (w * h) < 0.3:
            continue
        ys, xs = np.nonzero(sub)
        xs = xs + sl[1].start + 0.5
        ys = ys + sl[0].start + 0.5
        cx, cy = xs.mean(), ys.mean()
        cov = np.cov(np.vstack([xs - cx, ys - cy]))
        val, vec = np.linalg.eigh(cov)
        rx, ry = 2 * np.sqrt(max(val[1], 0.25)), 2 * np.sqrt(max(val[0], 0.25))
        ang = float(np.arctan2(vec[1, 1], vec[0, 1]))
        lagos.append([cx, cy, rx, ry, ang])
    perto = [l for l in lugares.values() if l["tipo"] in ("pesca", "oasis")]
    saida = []
    usados = set()
    for cx, cy, rx, ry, ang in lagos:
        nome = ""
        melhor = 40.0
        for l in perto:
            d = float(np.hypot(l["mx"] - cx, l["my"] - cy))
            if d < melhor:
                melhor, nome = d, l["nome"]
        usados.add(nome)
        saida.append([nome, round(cx * TILES_PX), round(cy * TILES_PX), round(rx * TILES_PX), round(ry * TILES_PX),
                      round(ang, 3)])
    for l in perto:
        if l["tipo"] == "oasis" and l["nome"] not in usados:
            saida.append([l["nome"], round(l["mx"] * TILES_PX), round(l["my"] * TILES_PX), 40, 30, 0.0])
    saida.sort(key=lambda t: (t[2], t[1]))
    return saida


def cidades_mundo(lugares: dict, k) -> list:
    """As caixas das cidades em células do mundo, alinhadas aos blocos: [nome, tipo, x0, y0, x1, y1, reino]."""
    saida = []
    for l in lugares.values():
        if l["tipo"] not in CIDADES:
            continue
        lado = LADO_CIDADE[l["tipo"]]
        bx0 = l["bloco_x"] - lado // 2
        by0 = l["bloco_y"] - lado // 2
        saida.append([l["nome"], l["tipo"], bx0 * 64, by0 * 64, (bx0 + lado) * 64 - 1, (by0 + lado) * 64 - 1,
                      l["reino_id"]])
    return saida


def _rasterizar_linhas(linhas: list, raio_px: float) -> np.ndarray:
    """Pixels do plano a até `raio_px` de alguma das polilinhas (em tiles)."""
    img = Image.new("L", (LADO, LADO), 0)
    d = ImageDraw.Draw(img)
    for pts in linhas:
        p = [(x / TILES_PX, y / TILES_PX) for x, y in pts]
        d.line(p, fill=255, width=max(1, int(raio_px * 2)))
        for x, y in p:
            d.ellipse((x - raio_px, y - raio_px, x + raio_px, y + raio_px), fill=255)
    return np.array(img) > 0


def distritos_mundo(lugares: dict, cls, cidades: list, rios: list, lagos: list, estradas: list) -> tuple[list, list]:
    """Os distritos e os lotes. Cada distrito: cols × linhas lotes de 256 × 256 (pares de colunas), alinhado aos
    blocos, o mais perto possível do ponto do plano onde cabe: em terra (com folga), longe dos rios, lagos, cidades,
    estradas, da fase 1 e dos outros distritos. Devolve os distritos [nome, código, x0, y0, cols, linhas, centro (4),
    cidade] e os lotes [nome, distrito, x0, y0, lado] (lado 0: coluna da esquerda do par, a trilha vai à direita)."""
    proibido = (cls == 13) | (cls == 14)
    proibido = ndimage.binary_dilation(proibido, iterations=3)
    proibido |= _rasterizar_linhas([r["pts"] for r in rios], 2.5)
    proibido |= _rasterizar_linhas([e[1] for e in estradas], 1.2)
    for _, cx, cy, rx, ry, _ in lagos:
        x0, y0 = int((cx - rx) / TILES_PX) - 2, int((cy - ry) / TILES_PX) - 2
        x1, y1 = int((cx + rx) / TILES_PX) + 3, int((cy + ry) / TILES_PX) + 3
        proibido[max(0, y0):y1, max(0, x0):x1] = True
    for _, _, x0, y0, x1, y1, _ in cidades:
        proibido[max(0, y0 // 32 - 2):y1 // 32 + 3, max(0, x0 // 32 - 2):x1 // 32 + 3] = True
    proibido[BY0 * 2 - 2:(BY0 * 64 + LH) // 32 + 2, BX0 * 2 - 2:(BX0 * 64 + LW) // 32 + 2] = True
    distritos, lotes = [], []
    ordem = sorted((l for l in lugares.values() if l["tipo"] == "distrito"), key=lambda l: l["nome"])
    for l in ordem:
        codigo = l["nome"][:3]
        n = int(l["lotes"])
        cols = COLUNAS_LOTES[n]
        linhas = n // cols
        cidade = lugares[CIDADE_DISTRITO[codigo]]
        if codigo == "D03":
            ox, oy = D03_ORIGEM
            px0, py0 = ox // TILES_PX, oy // TILES_PX
            proibido[py0 - 4:py0 + linhas * 8 + 4, px0 - 4:px0 + cols * 8 + 4] = True
        else:
            wpx, hpx = cols * 8, linhas * 8
            cx, cy = l["mx"], l["my"]
            achou = None
            for r in range(0, 140, 2):
                cand = []
                for dx in range(-r, r + 1, 2):
                    for dy in range(-r, r + 1, 2):
                        if max(abs(dx), abs(dy)) == r:
                            cand.append((dx * dx + dy * dy, dx, dy))
                for _, dx, dy in sorted(cand):
                    x0 = int(round((cx + dx - wpx / 2) / 2)) * 2
                    y0 = int(round((cy + dy - hpx / 2) / 2)) * 2
                    if x0 < 4 or y0 < 4 or x0 + wpx > LADO - 4 or y0 + hpx > LADO - 4:
                        continue
                    if not proibido[y0 - 3:y0 + hpx + 3, x0 - 3:x0 + wpx + 3].any():
                        achou = (x0, y0)
                        break
                if achou:
                    break
            if not achou:
                raise SystemExit(f"distrito {l['nome']}: sem lugar em terra perto do ponto do plano")
            ox, oy = achou[0] * TILES_PX, achou[1] * TILES_PX
            proibido[achou[1] - 4:achou[1] + hpx + 4, achou[0] - 4:achou[0] + wpx + 4] = True
        W, H = cols * 256, linhas * 256
        # O centro do distrito do lado da cidade (o D03 tem o da fase 1).
        if codigo == "D03":
            centro = [P1_TX + 204, P1_TY + 156, P1_TX + 239, P1_TY + 179]
        else:
            ccx, ccy = cidade["mx"] * TILES_PX, cidade["my"] * TILES_PX
            dx, dy = ccx - (ox + W / 2), ccy - (oy + H / 2)
            cw, ch = CENTRO_DISTRITO
            if abs(dx) * H >= abs(dy) * W:
                x = ox - cw - 2 if dx < 0 else ox + W + 2
                y = oy + H // 2 - ch // 2
                centro = [x, y, x + cw - 1, y + ch - 1]
            else:
                y = oy - ch - 2 if dy < 0 else oy + H + 2
                x = ox + W // 2 - cw // 2
                centro = [x, y, x + cw - 1, y + ch - 1]
        di = len(distritos)
        distritos.append([l["nome"], codigo, ox, oy, cols, linhas, *centro, cidade["nome"]])
        for r in range(linhas):
            for c in range(cols):
                nome = D03_NOMES[(c, r)] if codigo == "D03" else f"{codigo}-{chr(65 + r * cols + c)}"
                lotes.append([nome, di, ox + c * 256, oy + r * 256, c % 2])
    # A ordem em que o servidor dá os lotes: o D03 (A a L), depois os distritos do mais perto ao mais longe dele.
    d03 = next(d for d in distritos if d[1] == "D03")
    cx3, cy3 = d03[2] + d03[4] * 128, d03[3] + d03[5] * 128

    def chave(lote):
        d = distritos[lote[1]]
        if d[1] == "D03":
            return (0, "ABCDEFGHIJKL".index(lote[0]))
        return (float(np.hypot(d[2] + d[4] * 128 - cx3, d[3] + d[5] * 128 - cy3)), lote[3], lote[2])
    lotes.sort(key=chave)
    return distritos, lotes


def pois_mundo(lugares: dict, cls) -> list:
    """Os lugares do plano que não são cidade nem distrito: [nome, tipo, marca, x0, y0, w, h, categoria, bloqueia]
    (em células; marca "" quando o lugar é só a zona com o nome, ou quando o ponto cai no mar)."""
    saida = []
    for l in lugares.values():
        if l["tipo"] in CIDADES or l["tipo"] == "distrito":
            continue
        forma = POI_FORMA.get(l["tipo"])
        x, y = l["tile_x"], l["tile_y"]
        mar = cls[int(min(LADO - 1, l["my"])), int(min(LADO - 1, l["mx"]))] in (13, 14)
        if forma is None or mar:
            saida.append([l["nome"], l["tipo"], "", x, y, 0, 0, "", 0])
            continue
        tipo, w, h, cat, bl = forma
        saida.append([l["nome"], l["tipo"], tipo, x - w // 2, y - h // 2, w, h, cat, int(bl)])
    return saida


def ligacoes_mundo(lugares: dict, cls, estradas: list, distritos: list, pois: list, cidades: list) -> list:
    """Trilhas até a rede: cada centro de distrito (6 tiles), cada cidade e vila fora das rotas (6) e cada lugar com
    construção (4) a mais de 100 tiles de uma estrada ganha um trecho reto até o ponto mais perto dela, se o trecho
    passa por terra (90%) e mede até 4.800 tiles."""
    novas = []

    def mais_perto(x, y):
        melhor = (1e18, None)
        for _, pts in estradas + novas:
            for a, b in zip(pts, pts[1:]):
                d, q = _dist_seg(x, y, *a, *b)
                if d < melhor[0]:
                    melhor = (d, q)
        return melhor

    alvos = []
    for d in distritos:
        if d[1] == "D03":
            continue
        alvos.append((6, (d[6] + d[8]) / 2, (d[7] + d[9]) / 2))
    for c in cidades:
        alvos.append((6, (c[2] + c[4]) / 2, (c[3] + c[5]) / 2))
    for p in pois:
        if p[2]:
            alvos.append((4, p[3] + p[5] / 2, p[4] + p[6] + 2))
    for w, x, y in alvos:
        d, q = mais_perto(x, y)
        if q is None or d < 100 or d > 4800:
            continue
        if _terra_frac(cls, (x, y), q) < 0.9:
            continue
        novas.append((w, [(x, y), q]))
    return novas


def pontes_mundo(estradas: list, rios: list) -> list:
    """Onde uma estrada cruza um rio com água (fora da fase 1): a ponte como lugar marcado, [tipo, x0, y0, w, h]. A
    ponte de madeira refeita é deitada e de leste a oeste; numa estrada de norte a sul a ponte fica "a criar"."""
    saida = []
    for w, pts in estradas:
        for a, b in zip(pts, pts[1:]):
            for r in rios:
                if r["seco"]:
                    continue
                for c, d in zip(r["pts"], r["pts"][1:]):
                    den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0])
                    if den == 0:
                        continue
                    t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den
                    u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den
                    if not (0 <= t <= 1 and 0 <= u <= 1):
                        continue
                    x, y = a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])
                    if P1_TX - 16 <= x < P1_TX + LW + 16 and P1_TY - 16 <= y < P1_TY + LH + 16:
                        continue
                    hw = r["meia"]
                    if abs(b[0] - a[0]) >= abs(b[1] - a[1]):
                        tw, th, tipo = 2 * hw + 3, 5, "ponte_madeira"
                    else:
                        tw, th, tipo = 5, 2 * hw + 3, "ponte"
                    saida.append([tipo, int(round(x - tw / 2)), int(round(y - th / 2)), tw, th])
    return saida


def plano_mundo(raiz: str, cls, k, lista: list) -> dict:
    """O plano compacto do mundo inteiro (tudo em tiles do mundo), para mapa.ts e para o esboço."""
    lugares = {l["nome"]: l for l in lista}
    estradas = []
    for w, rota in ROTAS:
        pts = [_lugar_tiles(lugares, p) for p in rota]
        estradas.append((w, _onda(pts, rota)))
    rios = []
    for nome, meia, seco, pts in RIOS:
        rios.append({"nome": nome, "meia": meia, "seco": seco, "pts": [_lugar_tiles(lugares, p) for p in pts]})
    lagos = lagos_mundo(raiz, cls, lugares)
    cidades = cidades_mundo(lugares, k)
    distritos, lotes = distritos_mundo(lugares, cls, cidades, rios, lagos, estradas)
    pois = pois_mundo(lugares, cls)
    trilhas = ligacoes_mundo(lugares, cls, estradas, distritos, pois, cidades)
    pontes = pontes_mundo(estradas + trilhas, rios)
    return {"estradas": estradas + trilhas, "rios": rios, "lagos": lagos, "cidades": cidades,
            "distritos": distritos, "lotes": lotes, "pois": pois, "pontes": pontes, "n_trilhas": len(trilhas)}


def modulo_mapa(p: dict) -> str:
    def plano(pts):
        return ", ".join(f"{int(round(x))}, {int(round(y))}" for x, y in pts)

    L = [
        _cabecalho("O mundo inteiro em dados compactos (docs/mundo/MAPA_MUNDO.md §12): estradas, rios, lagos, pontes,"),
        "// cidades, distritos, lotes e lugares, em células do mundo (tiles de 16 px desde o canto noroeste). O chão de cada",
        "// célula sai disso no jogo (src/shared/world/blocks.ts); a fase 1 continua em fase1.ts.",
        "",
        "/** As estradas e trilhas: [largura em tiles, x0, y0, x1, y1, ...] (uma polilinha). */",
        "export const WORLD_ROADS: number[][] = [",
    ]
    L += [f"\t[{w}, {plano(pts)}]," for w, pts in p["estradas"]]
    L += ["];", "", "/** Os rios: [nome, meia largura, seco, [x0, y0, x1, y1, ...]]. */",
          "export const WORLD_RIVERS: [name: string, halfWidth: number, dry: boolean, points: number[]][] = ["]
    L += [f"\t[{_ts(r['nome'])}, {r['meia']}, {_ts(r['seco'])}, [{plano(r['pts'])}]]," for r in p["rios"]]
    L += ["];", "", "/** Os lagos (elipses): [nome, centro x, centro y, raio x, raio y, ângulo em radianos]. */",
          "export const WORLD_LAKES: [name: string, cx: number, cy: number, rx: number, ry: number, angle: number][] = ["]
    L += [f"\t{_ts(l)}," for l in p["lagos"]]
    L += ["];", "", "/** As pontes onde uma estrada cruza um rio: [tipo da marca, x0, y0, largura, altura]. */",
          "export const WORLD_BRIDGES: [kind: string, x: number, y: number, w: number, h: number][] = ["]
    L += [f"\t{_ts(b)}," for b in p["pontes"]]
    L += ["];", "",
          "/** As cidades (a caixa do plano, alinhada aos blocos): [nome, tipo, x0, y0, x1, y1 (inclusivos), reino]. */",
          "export const WORLD_TOWNS: [name: string, kind: string, x0: number, y0: number, x1: number, y1: number, realm: number][] = ["]
    L += [f"\t{_ts(c)}," for c in p["cidades"]]
    L += ["];", "",
          "/**",
          " * Os distritos de fazenda: [nome, código, x0, y0, colunas, linhas de lotes (256 × 256 cada), o centro do distrito",
          " * (x0, y0, x1, y1), a cidade].",
          " */",
          "export const WORLD_DISTRICTS: [name: string, code: string, x: number, y: number, cols: number, rows: number, cx0: number, cy0: number, cx1: number, cy1: number, city: string][] = ["]
    L += [f"\t{_ts(d)}," for d in p["distritos"]]
    L += ["];", "",
          "/**",
          " * Os lotes (as vagas de fazenda), na ordem em que o servidor os dá (o D03 primeiro, depois os distritos do mais",
          " * perto ao mais longe dele): [nome, distrito, x0, y0, lado] (lado 0: coluna da esquerda do par, a trilha vai à",
          " * direita; 1: a da direita).",
          " */",
          "export const WORLD_PLOTS: [name: string, district: number, x: number, y: number, side: number][] = ["]
    L += [f"\t{_ts(l)}," for l in p["lotes"]]
    L += ["];", "",
          "/**",
          " * Os lugares do plano que não são cidade nem distrito: [nome, tipo, marca, x0, y0, w, h, categoria, bloqueia]",
          " * (marca \"\": só a zona com o nome).",
          " */",
          "export const WORLD_POIS: [name: string, kind: string, mark: string, x: number, y: number, w: number, h: number, category: string, blocks: number][] = ["]
    L += [f"\t{_ts(q)}," for q in p["pois"]]
    L += ["];", ""]
    return "\n".join(L)


def esboco_mundo_jogo(raiz: str, cls, p: dict) -> str:
    """O plano compacto desenhado sobre os biomas (para conferir o que o jogo gera): 1 px = 16 tiles."""
    E = 2
    cores = np.array([(150, 196, 100), (60, 124, 70), (62, 94, 74), (233, 238, 243), (138, 126, 114),
                      (227, 201, 138), (200, 135, 74), (46, 110, 62), (95, 107, 69), (78, 58, 54), (220, 200, 150),
                      (120, 180, 110), (159, 143, 224), (40, 60, 110), (44, 92, 130)], np.uint8)
    img = Image.fromarray(cores[cls]).resize((LADO * E, LADO * E), Image.NEAREST)
    d = ImageDraw.Draw(img)
    s = E / TILES_PX
    for _, cx, cy, rx, ry, _ in p["lagos"]:
        d.ellipse(((cx - rx) * s, (cy - ry) * s, (cx + rx) * s, (cy + ry) * s), fill=(70, 130, 210))
    for r in p["rios"]:
        d.line([(x * s, y * s) for x, y in r["pts"]], fill=(160, 140, 90) if r["seco"] else (40, 100, 220), width=3)
    for w, pts in p["estradas"]:
        d.line([(x * s, y * s) for x, y in pts], fill=(120, 70, 30), width=3 if w >= 8 else 2 if w >= 6 else 1)
    for c in p["cidades"]:
        d.rectangle((c[2] * s, c[3] * s, c[4] * s, c[5] * s), outline=(30, 30, 30), width=2)
        d.text((c[2] * s + 3, c[3] * s + 2), c[0], fill=(0, 0, 0))
    for di in p["distritos"]:
        x0, y0 = di[2] * s, di[3] * s
        d.rectangle((x0, y0, x0 + di[4] * 256 * s, y0 + di[5] * 256 * s), outline=(200, 40, 40), width=2)
        d.rectangle((di[6] * s, di[7] * s, di[8] * s, di[9] * s), fill=(200, 40, 40))
        d.text((x0 + 2, y0 + 2), di[1], fill=(120, 0, 0))
    for q in p["pois"]:
        if q[2]:
            d.rectangle((q[3] * s - 2, q[4] * s - 2, q[3] * s + 2, q[4] * s + 2), fill=(230, 60, 160))
    for b in p["pontes"]:
        d.rectangle((b[1] * s - 2, b[2] * s - 2, b[1] * s + 3, b[2] * s + 3), fill=(255, 255, 0))
    x0, y0 = P1_TX * s, P1_TY * s
    d.rectangle((x0, y0, x0 + LW * s, y0 + LH * s), outline=(255, 0, 0), width=2)
    out = os.path.join(raiz, "esboco_mundo_jogo_v1.png")
    img.save(out, optimize=True)
    return out


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
    ap.add_argument("acao", nargs="?", default="tudo", choices=["mundo", "reinos", "fase1", "tabela", "jogo", "conjuntos", "objetos", "plano", "tudo"])
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
    if a.acao == "plano":
        print(esboco_mundo_jogo(a.raiz, cls, plano_mundo(a.raiz, cls, k, lugares)))
        return 0
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
