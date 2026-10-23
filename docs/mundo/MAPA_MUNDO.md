# Mapa do mundo: plano de construção (2026-10-23)

Pedidos do usuário (2026-10-23): o plano do mapa do reino de Haywood como primeiro pedaço do mundo; depois "lembre de tentar fazer o mapa todo" e "expanda para além do reino Haywood, faça tudo". Este documento cobre o mundo inteiro em fases: a visão geral, a escala, como o mapa vira jogo, os biomas, os 24 distritos, as linhas de viagem, as fases e os envios. Cada reino tem o seu documento em `reinos/` (com a lista numerada de lugares, a base do ALttP e a fase de cada um):

| Documento | O que tem |
|---|---|
| [`reinos/haywood.md`](reinos/haywood.md) | o reino de Haywood e a **fase 1** (o primeiro pedaço jogável), bloco a bloco |
| [`reinos/invernia.md`](reinos/invernia.md) | Invernia (neve, taiga, norte das montanhas) |
| [`reinos/brasalta.md`](reinos/brasalta.md) | Brasalta (vulcões, sul das montanhas) |
| [`reinos/terracota.md`](reinos/terracota.md) | Terracota (savana e terra vermelha, borda do deserto) |
| [`reinos/verdalia.md`](reinos/verdalia.md) | Verdália (selva tropical) |
| [`reinos/maresia.md`](reinos/maresia.md) | Marésia (costa, praias, recifes, as ilhas do sudeste) |
| [`reinos/cidades_livres.md`](reinos/cidades_livres.md) | Auréola e a Twilight Isle, Galena, Brumário, Miragem, Porto Franco, Sotavento |

Fontes: o plano do mundo (estágio 1 da especificação, versão 3) em `Documents\Haywood-Valley-recuperado\mundo\` (`mundo_inteiro_etapa1_v3.png`, `mundo_13_biomas.png`), o mapa do Mundo da Luz do ALttP e as regiões (`alttp_vgmaps\`), os assets refeitos por outro agente (`mundo\assets\`, `PLANO_ASSETS_MUNDO.md`) e o exterior de hoje (`docs/diorama/EXTERIOR.md`, `exterior_ilha`). Decisões que este plano segue: estilo do exterior = equipe (terreno, água, vegetação) e aeko+equipe (construções e objetos); P1 = reino de Haywood; o jogador começa na fazenda inicial do reino de Haywood, não na casa de teste v2.

**Esboços** (fora do repositório, em `Documents\Haywood-Valley-recuperado\mundo\`, gerados por `tools/mundo_mapa.py`):

- `esboco_mundo_v1.png`: o mundo com as fronteiras dos reinos e das cidades livres e a cor da fase de cada região.
- `esboco_reino_<reino>_v1.png` (haywood, invernia, brasalta, terracota, verdalia, maresia) e `esboco_cidades_livres_v1.png`: cada reino com os lugares numerados (o número é o da tabela do documento do reino), a fase e a base do ALttP.
- `esboco_haywood_v1.png`: a fase 1 em blocos de 64 × 64; `esboco_haywood_maquete_v1.png`: o miolo da fase 1 em tamanho real (16 px por tile) com os assets refeitos.

`python -I tools/mundo_mapa.py tudo` refaz todos; `tabela` imprime as áreas, os lugares (com setor e bloco) e o orçamento de imagens da fase 1. Os lugares foram lidos à mão do plano; o reino de cada pixel sai do mapa dos biomas pelas regras de `reinos_raster`, e as áreas batem com a tabela do plano (Haywood 22,8 setores, Invernia 26,4, Brasalta 13,1, Terracota 13,2, Verdália 12,7, Marésia 14,3).

## 1. O plano em números

| Medida | Valor |
|---|---|
| Mundo | 13 × 13 setores; 1 setor = 4.096 tiles = **64 × 64 blocos do Diorama** = 2.048 studs |
| Lado do mundo | 53.248 tiles = 832 blocos = 26.624 studs |
| Terra | 126,5 setores (≈ 518.000 blocos); Mar Sereno 15,1 setores; mar de fora 27,4 |
| Capital | caixa de 50 a 56 blocos de lado (a de Haywood mede 54) |
| Cidade do reino | 31 blocos de lado; vila 13; cidade livre 32 a 38 |
| Lote | 256 × 256 tiles = 4 × 4 blocos; a fazenda começa com 64 × 64 no meio e cresce até 192 × 192 |
| Distrito | de 6 a 16 lotes; a caixa do D02 mede 20 × 20 blocos |
| Tela do jogo | 30 × 17 tiles no plano; no jogo, de 270 a 768 px de arte de altura (17 a 48 tiles) |
| Ritmo da estrada | um ponto a cada 1–2 min, uma parada (espantalho, barracas, fogueira) a cada ≤ 5 min, pousada ou vila a cada ≤ 12 min |

| Reino | Capital | Cidades | Área | Lotes | Distritos | Setores principais | Fase |
|---|---|---|---|---|---|---|---|
| Haywood | Haywood | Moinhos, Ribeira, Carvalhal | 22,8 | 60 | D01–D05 | F–K, 8–13 | 1–4 |
| Invernia | Candeia | Termal, Porto Gelo, Pinhal | 26,6 | 30 | D06–D09 | A–J, 1–4 | 9 |
| Brasalta | Brasalta | Bocafunda, Porto Basalto | 13,1 | 16 | D10, D19 | A–E, 6–9 | 8 |
| Terracota | Mesa Alta | Garganta Rubra, Cacimba, Porto Rubro | 13,2 | 22 | D13–D15 | C–F, 9–13 | 6 |
| Verdália | Ferradura | Dossel, Porto Mangue | 12,7 | 14 | D16, D17 | J–M, 5–8 | 7 |
| Marésia | Anil | Gaivotas, Comporta | 14,6 | 22 | D20, D21, D23 | J–M, 1–5 e as ilhas de L12 | 7 |

| Cidade livre | Por que existe | Governo | Lotes | Distrito | Setor | Fase |
|---|---|---|---|---|---|---|
| Auréola | cidade dos magos (Twilight Isle) | Ordem da Aurora | 6 | D24 | G6 | 5 |
| Brumário | cidade dos alquimistas (pântano) | Reitoria da Academia | 10 | D18 | L10 | 5 |
| Miragem | entreposto das caravanas (deserto) | Conselho das Caravanas | 8 | D12 | B11 | 6 |
| Galena | cidade dos mineiros (montanhas) | Guilda dos Mineiros | 6 | D11 | C5 | 8 |
| Porto Franco | ilha do mercado (Mar Sereno) | Conselho dos Mercadores | 6 | D22 | E6 | 8 |
| Sotavento | refúgio dos corsários (Crater Isle) | capitão eleito pelo Código | — | — | E1 | 9 |

## 2. A escala de verdade

O plano é enorme e isso decide como o mundo se constrói:

- O **Mundo da Luz inteiro do ALttP** tem 256 × 256 tiles: cabe em **um lote** (4 × 4 blocos). **Kakariko** tem 64 × 64 tiles: **um bloco**. O lado do mundo do Haywood é 208 vezes o do Mundo da Luz; a terra do mundo é a área de uns 32.000 Mundos da Luz.
- O ALttP põe alguma coisa a cada 8 a 16 tiles. O plano pede um ponto de interesse a cada 1–2 min de caminhada, isto é, a cada 300 a 600 tiles. A maquete da fase 1 mostra o efeito: em tamanho real, o lote de 256 tiles é um campo grande e a fazenda de 64 é uma ilha no meio dele.
- **Velocidade (pendente do usuário)**: o plano mede o tempo a 5 tiles/s ("on foot, 5 tiles/s; 300 tiles = 1 min"), mas o jogo anda a 10 tiles/s desde 2026-10-17 (`WALK_SPEED`). Com a geometria do plano, todos os tempos caem pela metade no jogo (um setor leva 6,8 min, não 13,65; Haywood → Moinhos, 13,5 min, não 27). Opções: manter a geometria e aceitar os tempos (o que este plano faz, porque as posições são o que o plano desenha), dobrar as distâncias (o mundo passa de 26.624 studs para 53.248 por lado), ou voltar o passo a 5 tiles/s fora das cidades.

Consequência: **o mundo não se pinta à mão**. São 93.560 blocos só no reino de Haywood, e a capital sozinha tem uns 2.900. O conteúdo vem em três camadas:

1. **Gerado** (a maior parte do chão): terreno, rios e estradas a partir do plano (bioma por pixel, polilinhas de estrada e rio, relevo), com vegetação solta, mato, recursos e manchas de capim por regras e por semente. Determinístico: o mesmo código em `src/shared` gera o bloco no cliente e confere o bloqueio no servidor.
2. **Modelos autorais** pintados no Diorama e repetidos pelo gerador: quadras de cidade (como Kakariko, um bloco cada), o miolo da fazenda, o centro de distrito, pousadas, paradas de estrada, pontes, estações, entradas de caverna. Cada modelo tem variantes; uma cidade de 31 blocos é um traçado de ruas com quadras de uns 6 a 10 modelos.
3. **Peças únicas**: castelos das capitais, masmorras, covis de chefe, marcos (Grandmother Oak, Thunder Falls, Old Anil City), pintadas uma vez.

A densidade de ALttP fica nas peças autorais (cidades, vilas, marcos, a margem das estradas); o campo entre elas é gerado com variação (bosquetes, pedras, capim, flores, recursos), como em Stardew e Hay Day.

## 3. Como o mundo vira jogo

### 3.1 Um mapa só, em blocos, com streaming

Hoje cada mapa é um bloco (`0_0`) desenhado inteiro por `buildInterior`, e os mapas ficam a `MAP_SPACING` = 512 studs um do outro no eixo X (`mapCenter`). O mundo não cabe nisso (26.624 studs de lado). Proposta:

- O **mundo é um mapa à parte** (`mundo`), num lugar próprio do Workspace, fora da fila dos interiores: canto noroeste em (−13.312, 0, −30.000), então o mundo ocupa Z de −30.000 a uns −1.660 (o bloco tem 32 studs de largura e 34,06 de fundo: 28.340 de fundo no total) e os interiores continuam em Z = 0 (piso de −1.024 a 1.024). A precisão do `float` a 30.000 studs é de uns 0,002 stud, longe do pixel de arte (1/32 stud).
- O cliente monta **só os blocos perto da câmera**: os que tocam a vista mais 16 tiles de folga. No zoom máximo (768 px de arte de altura, uns 48 × 85 tiles) são até 3 × 3 blocos; no padrão, 2 × 2. Na fase 0 (§11) a unidade montada virou o **pedaço** de 32 × 32 tiles (um quarto de bloco): o pior 3 × 3 de blocos da fase 1 tinha 4.027 imagens. Cada bloco tem o seu Part com `SurfaceGui` fixo; carregar e descarregar é criar e destruir o bloco, nunca mudar um canvas montado (a regra do plano de otimização). A camada viva e o canvas da água seguem por bloco.
- Interiores (casas, lojas, pousadas, masmorras) continuam como hoje: saídas e entradas no estilo do `LINK` do Graal, com o véu. A casa do jogador é a cópia por dono de hoje; a porta da casa da fazenda leva a ela.
- Colisão e ações: `blocks` e `actions` por bloco, do bloco autoral ou do gerador; `collider.ts` cria os bloqueios só dos blocos montados.

### 3.2 Dados

- Blocos autorais em `diorama/mapas/mundo/blocos/<bx>_<by>.json` (o formato 1 já nomeia blocos assim), com as coordenadas do mundo. Modelos em `diorama/modelos/<modelo>/blocos/0_0.json`, um bloco por modelo.
- O plano vira um módulo compacto em `src/shared/world/`: o bioma e o reino por bloco (832 × 832, em RLE), as polilinhas das estradas, rios e linhas, os lugares (o que `tools/mundo_mapa.py` já lê), a lista de onde vai cada modelo e cada peça única. O gerador de blocos (TypeScript, determinístico) produz o `InteriorData` de um bloco gerado a partir disso; o gerador do Diorama (`tools/diorama_jogo.mjs`) produz os blocos autorais.
- O Diorama mostra o bloco gerado por baixo enquanto se pinta um bloco autoral, para as bordas casarem.

### 3.3 Orçamento de imagens (a fase 1 medida)

`tools/mundo_mapa.py tabela` conta, bloco a bloco, o que a fase 1 vira no canvas fixo (bases, junções da grade dupla, decalques) e em cartões. O alvo é o do `DevPanel`: 1.000 a 2.500 imagens e até 400 cartões na tela.

| Como desenhar | Pior bloco | Média | Pior 3 × 3 | Cartões no pior 3 × 3 |
|---|---|---|---|---|
| Ingênuo: capim como terreno, cada junção uma imagem | 496 | 226 | 3.287 | 86 |
| Capim como decalque (não como terreno) | 496 | 96 | — | — |
| Capim como decalque e as quadras autorais **assadas** numa imagem de 1024 × 1024 | — | — | **1.608** | 95 |

O que isso pede:

- **Base em textura grande**: cada terreno de base vira uma textura sem emenda de 1024 × 1024 (64 × 64 tiles), e o tile da célula (x, y) é o recorte (x mod 64, y mod 64). Assim `mergeCells` junta a região inteira de um terreno num retângulo só (hoje a grama da `folha_juncao` é um padrão de 2 × 2 tiles e não junta).
- **Capim, flores e tufos como decalques**, não como terreno: terreno novo cria junção em toda a borda da mancha.
- **Assar os blocos autorais densos** (quadras de cidade, rio com pontes): o chão do modelo vira uma imagem de 1024 × 1024, uma por modelo (não por cópia). A água fica num canvas por baixo, animada, e a imagem assada tem a água transparente.
- **Bordas retas em tira**: uma tira de 64 tiles para cada borda reta (estrada, avenida), que junta num retângulo só.

### 3.4 O que muda no gerador (os conjuntos da equipe)

O exterior de hoje (`EXTERIOR.md`) já usa a grade dupla com máscara de quadrantes (bit 1 em cima à esquerda, 2 em cima à direita, 4 embaixo à esquerda, 8 embaixo à direita) e uma junção por par de terrenos. Os conjuntos refeitos (`mundo\assets\terreno\*_estilo.png`) usam a mesma máscara num desenho diferente: 4 colunas × 6 linhas, o código c na linha c div 4 e coluna c mod 4 (linhas 0–3), os miolos do terreno de cima na linha 4 e os do de baixo na linha 5 (`tools/mundo_assets.py`, `wang16_cantos`). Para aceitar isso:

1. (Na fase 0 os conjuntos ficaram em `diorama/catalogo/mundo.json`, para não mexer no catálogo do Diorama; ver §11.) `diorama/catalogo/exterior.json` ganha `conjuntos`: id, folha, desenho (`juncao_v1` para a `folha_juncao`, `wang16_4x6` para os da equipe), o par (cima, baixo) e os miolos. O gerador escolhe a junção pelo par como hoje; o miolo pela semente da célula (não mais pelo padrão 2 × 2).
2. Os **níveis** crescem: mar fundo < mar raso < água de rio < areia < terra < caminho < calçada < grama < mata (copa). Par sem conjunto: o gerador avisa e não desenha (como hoje).
3. **Penhasco** é altura, não terreno: uma camada `altura` por célula (0 a 3) e um conjunto de penhasco em autotile (o refeito `penhasco_degraus` é uma lista por uso, ainda não autotile: falta organizar em bordas, cantos internos e externos, face e sombra). Célula com face de penhasco bloqueia; escada e rampa passam.
4. **Água** no canvas de baixo (o papel `mar` de `ground.ts`, com 4 quadros), e as margens com a água transparente, para o rio animar sem refazer o canvas fixo. A espuma da areia da ilha (que o usuário gostou) vira o conjunto de costa animado.
5. **Formas de 32 px** (`forma_equipe_32`) continuam como carimbos para as manchas de terreno da equipe.

### 3.5 Fazenda e lotes

- O lote é uma **vaga**, como a casa (`MapaLugar`): o jogador recebe um lote livre no distrito que escolher, e a fazenda dele (salva em `PlayerData`) é desenhada naquele lote. O servidor tem tantos jogadores quantos lotes abertos (fase 1: 4; fase 2: 24; o Haywood inteiro: 60).
- O chão do lote (grama, sebe, avenida, placa, o mato a limpar) é do bloco; a fazenda é uma **camada própria por lote** (um `SurfaceGui` refeito só quando a fazenda muda: plantar, colher, construir), mais os cartões das construções. Assim crescer uma plantação não refaz o canvas fixo.
- A cerca cresce de 64 para 128 e 192 no meio do lote; o que fica fora dela é mato gerado que o jogador limpa para crescer.

## 4. Os 13 biomas

| Bioma | Área | Reino | Distritos | Base do ALttP | Já existe | A criar |
|---|---|---|---|---|---|---|
| Campos e planícies | 12,2 | Haywood | D01–D03 | campos do Mundo da Luz em volta do castelo, casa do Link, Kakariko | grama, terra, calçada, água de rio, penhasco (lista), árvores, sebes, casas (refeitos) | penhasco em autotile, capim como decalque, terra arada, estações |
| Floresta temperada | 10,6 | Haywood | D04, D05 | Floresta Perdida (copa em bloco, túneis, tronco oco), Bosque Sagrado; Bosque das Caveiras (DW) nas matas assombradas | copa, borda de mata, árvore grande, toco, moitas (refeitos) | borda de mata em autotile, cogumelos, colmeias, árvores por estação |
| Taiga e pinhais | 8,2 | Invernia | D06, D07 | Floresta Perdida recolorida em pinheiros; Bosque das Caveiras (DW) | — | pinheiros (com e sem neve), serraria, troncos empilhados |
| Neve e tundra | 15,9 | Invernia | D08, D09 | Ilha do Gelo / Palácio do Gelo (DW); topo da Montanha da Morte; Lago Hylia congelado | — | neve e gelo em autotile, casas com neve, estufas, aurora |
| Montanhas e cordilheiras | 11,5 | Invernia, Galena, Brasalta | D10, D11 | Montanha da Morte, oeste e leste (paredões, escadas, cavernas, pontes) | penhasco em degraus e morro (refeitos) | paredão alto, boca de mina, trilhos e vagão, terraços |
| Deserto e oásis | 8,0 | Miragem, Terracota | D12, D13 | Deserto da Miragem e o Palácio do Deserto; Pântano da Miragem (DW) | palmeira (equipe) | areia com marcas em autotile, dunas, cacto, tendas, ossos |
| Savana e terra vermelha | 10,4 | Terracota | D14, D15 | sem bioma no ALttP: campos e degraus do deserto recoloridos; Planícies da Ruína (DW) | manchas de terra laranja (equipe) | terra vermelha em autotile, baobá, capim seco, cupinzeiro, cânion |
| Selva tropical | 12,7 | Verdália | D16, D17 | Floresta Perdida (sombra), Domínio Zora (cachoeiras); Pântano do Mal (DW) | — | árvores tropicais, folhagem, cipós, kapok gigante, palafitas, pontes de cipó |
| Pântano | 6,0 | Brumário | D18 | Grande Pântano (LW); Pântano do Mal e Palácio do Pântano (DW); a cabana da bruxa | — | mangue, nenúfar, juncos, lodo, ponte de tábuas |
| Terras vulcânicas | 8,4 | Brasalta | D19 | Montanha da Morte e Rocha da Tartaruga (DW); Planícies da Ruína (DW) | — | rocha vulcânica, lava animada, cinzas, fumarola, vinhas |
| Costa, praias e recifes | 13,5 | Marésia | D20, D21 | margens e ilhotas do Lago Hylia; a nossa ilha | areia, mar, espuma animada (no jogo) | falésias, salinas, coqueiro, recife, farol, cais, canal com eclusas |
| Mar e arquipélagos | 3,3 | Marésia, Porto Franco, Sotavento | D22, D23 | o mar de hoje + ilhotas do Lago Hylia | `mar.infinito`, ilha da equipe | barcos, boias, naufrágio, redemoinho |
| Terras mágicas | 5,8 | Auréola | D24 | Bosque Sagrado, Floresta Perdida com névoa; Pirâmide do Poder (DW) | — | grama mágica, cristais, cogumelos gigantes, o Véu animado, a muralha de aurora |

O **Mundo das Trevas** do ALttP serve de base onde o lugar é sombrio: Bosque das Caveiras para as matas assombradas (Lantern Woods, Howling Grove, Will-o'-the-Wisp Trail), Pântano do Mal para Brumário, Montanha da Morte das Trevas e Rocha da Tartaruga para Brasalta, Vila dos Proscritos para Bocafunda, Planícies da Ruína para as cinzas e a terra seca, Pirâmide do Poder para o Dark Rift. Sempre refeito no estilo da equipe; o que muda só a cor (estações, versões sombrias) se recolore, não se pede à IA.

## 5. Os 24 distritos de fazenda (200 lotes)

| Distrito | Bioma | Lotes | Cidade e distância (plano) | Reino | Setor | Bloco do centro | Fase |
|---|---|---|---|---|---|---|---|
| D01 Scarecrow District | campos | 16 | Haywood, 3,0 min | Haywood | H9 | 458, 553 | 3 |
| D02 Moinhos District | campos | 12 | Moinhos, 2,6 min | Haywood | G11 | 400, 668 | 2 |
| D03 Ribeira District | campos | 12 | Ribeira, 2,6 min | Haywood | H13 | 485, 773 | 1 (4 lotes), 2 |
| D04 Carvalhal District | floresta temperada | 12 | Carvalhal, 2,6 min | Haywood | I10 | 563, 630 | 4 |
| D05 Beehives District | floresta temperada | 8 | Capão das Colmeias, 2,1 min | Haywood | J11 | 636, 698 | 4 |
| D06 Pinhal District | taiga | 8 | Pinhal, 2,1 min | Invernia | B3 | 115, 133 | 9 |
| D07 Sawmill District | taiga | 6 | Passagem da Serraria, 2,2 min | Invernia | C4 | 143, 217 | 9 |
| D08 Greenhouses District | neve | 10 | Termal, 2,6 min | Invernia | E3 | 319, 155 | 9 |
| D09 Fishery District | neve | 6 | Pesqueiro dos Lagos, 2,2 min | Invernia | H3 | 479, 180 | 9 |
| D10 Terraces District | montanhas | 6 | Bocafunda, 2,2 min | Brasalta | C7 | 189, 397 | 8 |
| D11 High Valley District | montanhas | 6 | Galena, 2,2 min | Galena | C5 | 138, 300 | 8 |
| D12 Oasis District | deserto | 8 | Miragem, 2,1 min | Miragem | B12 | 82, 704 | 6 |
| D13 Cacimba District | deserto | 6 | Cacimba, 2,2 min | Terracota | C12 | 166, 748 | 6 |
| D14 Ranches District | savana | 10 | Mesa Alta, 2,6 min | Terracota | E12 | 276, 716 | 6 |
| D15 Baobab District | savana | 6 | Pouso do Baobá, 2,2 min | Terracota | E10 | 299, 610 | 6 |
| D16 Waterfalls District | selva | 8 | Ferradura, 2,1 min | Verdália | K7 | 665, 412 | 7 |
| D17 Cocoa District | selva | 6 | Dossel, 2,2 min | Verdália | L8 | 710, 495 | 7 |
| D18 Stilt Houses District | pântano | 10 | Brumário, 2,6 min | Brumário | K11 | 703, 643 | 5 |
| D19 Ashes District | vulcânico | 10 | Vinha da Cinza, 2,6 min | Brasalta | A9 | 48, 525 | 8 |
| D20 Salt Pans District | costa | 10 | Anil, 2,6 min | Marésia | L3 | 725, 161 | 7 |
| D21 Coconut Palms District | costa | 6 | Gaivotas, 2,2 min | Marésia | K2 | 656, 78 | 7 |
| D22 Isle of Sails District | mar e arquipélagos | 6 | Porto Franco, 2,2 min | Porto Franco | E7 | 305, 400 | 8 |
| D23 Orange Tree District | mar e arquipélagos | 6 | Laranjal, 2,2 min | Marésia | L12 | 736, 751 | 7 |
| D24 Mushrooms District | terras mágicas | 6 | Auréola, 2,2 min | Auréola | G6 | 420, 360 | 5 |

Todo distrito tem o mesmo esqueleto (o do D03 na fase 1): lotes de 4 × 4 blocos encostados, avenida de 6 tiles na margem entre eles, sebe na borda de fora, e um **centro do distrito** (caixa de venda, quadro de pedidos, galpão, poço, bebedouro, espantalho, carroça) na ponta que dá para a cidade. O que muda por bioma é o chão, a sebe ou cerca e as construções (estufas no D08, palafitas no D18, salinas no D20, colmeias no D05, terraços no D10).

## 6. Estradas, linhas e travessias

| Meio | Velocidade (plano) | Onde | Como entra no jogo |
|---|---|---|---|
| Estrada principal | a pé (5 tiles/s no plano), 8 tiles de largura | liga as capitais e as cidades | polilinha do plano; o gerador desenha o chão e põe as paradas e pousadas pelo ritmo (§1); pontes e cruzamentos são modelos |
| Estrada de vila e avenida de distrito | 6 tiles | vilas, distritos | idem |
| Trilha | 3 a 4 tiles | marcos, masmorras, covis | idem, com mais curva |
| Brasa Line (trem) e ramais | 30 tiles/s | o laço em volta do Mar Sereno; Marsh Branch (Haywood → Carvalhal → Brumário), Sun Branch (→ Mesa Alta), Furnaces Branch (→ Brasalta), Tide Branch (→ Anil), Northern Express (→ Candeia), Western Line (Galena ↔ Porto Franco) | primeiro só as **estações** (modelo) e a viagem como saída com véu até a estação de destino; trilhos e trem andando depois |
| Lume Barges e balsas | 15 tiles/s | rio Lume (Haywood → Ribeira), Sails Ferry (→ Porto Franco) | píer (modelo) e viagem com véu |
| Barco de linha | 25 tiles/s, 4 min de espera | entre portos | idem |
| Caravan Route | 20 tiles/s | deserto (Miragem, Cacimba, Paragem das Caravanas) | idem, com a caravana como cartão |
| Sled Line | 15 tiles/s | Invernia | idem |
| Ice Route e Ice Bridge | a pé, só no inverno | Porto Gelo ↔ Sotavento; Frozen Bay | ponte de gelo que existe só na estação fria (camada do bloco ligada à estação) |
| Veil Gate | portal | Aurora Lookout → Cais da Cachoeira (Twilight Isle) | saída com véu, fechada até a missão do Vigia |
| Bridge of Light | a pé, em noites de aurora | Candeia → North Pier (Twilight Isle) | camada ligada à hora e ao clima |
| Mist Route e dirigível | mais tarde | Floating Isles (só de dirigível) | fase 9 |

Rios: Lume (Haywood → Moinhos → Mirror Lake → Ribeira → Lume Delta), Clear Creek (fronteira com o pântano), Black River (pântano), Log River (Pinhal), Cold River, Thaw River, White River e a Frozen Waterfall (Invernia), o Dry Riverbed (Miragem), o Tide Canal (Comporta → Anil).

## 7. Fases de construção

| Fase | O que entra | Lotes abertos | Conjuntos novos | Base do ALttP |
|---|---|---|---|---|
| 0 | Técnica: mundo em blocos com streaming, gerador de blocos a partir do plano, conjuntos da equipe no gerador (§3.4), base em textura grande, camada da fazenda e vaga de lote (§3.5). Testa com um pedaço de grama e a ilha | — | — | — |
| 1 | **Ribeira leste e 4 lotes do D03** (12 × 9 blocos, `reinos/haywood.md`) | 4 | grama, terra, calçada, água de rio, penhasco (1 degrau), mata | Kakariko (quadras), rio e pontes do castelo |
| 2 | Haywood sul: Ribeira inteira, D03, Moinhos e D02, o Lume até Mirror Lake e Cais do Anzol, Beech Plateau, Old Fort, Great Mill, Clover Inn, Porteira, Lume Delta | 24 | margem de lago, delta | Lago Hylia, Palácio do Leste (planalto) |
| 3 | Haywood norte: a capital (castelo, porto, estação), D01, Four Winds Inn, Pouso do Feno, Sítio dos Pomares, Fairground, Crows' Den e Crows' Tower, Arraial do Mirante, Aurora Lookout | 40 | fosso, muralha | Castelo de Hyrule |
| 4 | Floresta temperada: Carvalhal e D04, Capão das Colmeias e D05, Povoado da Lamparina, Lantern Woods, Covered Bridge, Lily Cemetery, Fog Inn, Grandmother Oak, Deer Glade, Boar King's Den, Old Wizard's Tower | 60 | borda de mata, mata assombrada | Floresta Perdida, Bosque das Caveiras (DW) |
| 5 | Os vizinhos do Haywood: Brumário e o pântano (D18) pela Marsh Branch; Twilight Isle e Auréola (D24) pelo Veil Gate | 76 | pântano, terras mágicas | Pântano do Mal (DW), Bosque Sagrado |
| 6 | Oeste e sudoeste: Terracota (D13–D15) e Miragem (D12); Sun Branch, Caravan Route, Porto Rubro na Brasa Line | 106 | savana, deserto | Deserto da Miragem, Planícies da Ruína (DW) |
| 7 | Leste: Verdália (D16, D17) e Marésia (D20, D21, D23); Brasa Line até Ferradura, Tide Branch, Tide Canal | 142 | selva, costa e recifes | Floresta Perdida (sombra), Domínio Zora, Lago Hylia |
| 8 | Brasalta (D10, D19), Galena (D11), Porto Franco (D22); Furnaces Branch, Western Line, Sails Ferry | 170 | vulcânico, montanha alta | Montanha da Morte (LW e DW), Rocha da Tartaruga |
| 9 | Invernia (D06–D09), Sotavento, Mar Gelado, Floating Isles; Northern Express, Sled Line, Ice Route, dirigível | 200 | neve, gelo, taiga | Ilha do Gelo (DW), Montanha da Morte com neve |

Por que nessa ordem: começa pelo Haywood (onde o jogador nasce) e anda para fora pela distância das linhas a partir dele; cada fase traz um ou dois conjuntos de terreno novos e reaproveita os anteriores (a savana é a grama recolorida, a selva parte da floresta, a costa já tem a areia e o mar do jogo). Invernia fica por último porque pede mais coisa nova (neve, gelo, taiga, trenó) e é a mais longe (Haywood → Candeia: 144 min a pé no plano).

## 8. Assets por fase

O detalhe está em cada reino. O resumo:

- **Já existe** (equipe e refeitos, 42 no índice de `mundo\assets\_indice.json`, todos com nota ≥ 8): os conjuntos grama/terra, água/grama, água/penhasco, grama/calçada, grama com variações, penhasco em degraus (lista), morro e lagoa com penhasco em anel, copa de mata; árvores, moitas, arbustos, toco, sebes, canteiros, flores; casas de telhado vermelho, azul e de madeira (6), galpão, portal, poços, ponte de madeira, cercas; placa, bancos, bebedouro, cata-vento, pedra, potes. No jogo: mar, areia, espuma, a ilha.
- **Do ALttP, a refazer** (lista em `PLANO_ASSETS_MUNDO.md`): os conjuntos de penhasco em autotile, a borda de mata, o castelo e a muralha, igreja e cemitério, templos, entradas de caverna, escadas, píer, cachoeira, os do Mundo das Trevas para os lugares sombrios.
- **A criar** (não existem no ALttP; Spriteloom, `tools/spriteloom.py`, depois estilo e limpeza de linhas): tudo de fazenda (celeiro, galinheiro, silo, estábulo, chiqueiro, casa da fazenda por fora, caixa de venda, quadro de pedidos, espantalho, carroça, terra arada, culturas por fase, moinho de vento), a cidade (barracas, muro baixo, cais, ponte de pedra, estação, poste de luz, quadro de avisos), e cada bioma novo (§4).

## 9. O que precisa de envio ao Roblox (listado, não enviado)

Tudo pela conta do usuário e só com o OK dele (e a arte derivada do ALttP com a liberação de 2026-10-23). Para as fases 0 e 1:

| Imagem | Tamanho | Quantas | Para quê |
|---|---|---|---|
| Texturas de base sem emenda: grama, terra, calçada, mata (copa) | 1024 × 1024 | 4 | §3.3 |
| Água de rio, 4 quadros | 1024 × 1024 | 4 | canvas de baixo, animado |
| Folha de conjuntos (grama/terra, água/grama, grama/calçada, penhasco organizado, borda de mata, decalques de capim e flores) | 1024 × 1024 | 1 | junções da grade dupla |
| Folha de objetos refeitos (casas, galpão, portal, poços, ponte, cercas, sebes, árvores, moitas, placas, bancos, bebedouro, cata-vento) | 1024 × 1024 | 1–2 | cartões e decalques |
| Folha de objetos novos da fase 1 (celeiro, galinheiro, casa da fazenda, caixa de venda, quadro de pedidos, espantalho, carroça, barraca, fogueira, ponte de pedra, píer, mirante, escada, muro baixo, terra arada, brotos) | 1024 × 1024 | 1–2 | idem |
| Quadras e blocos assados da fase 1 (6 quadras da cidade, rio com pontes, centro do distrito) | 1024 × 1024 | ~10 | §3.3 (opcional: sem eles o orçamento estoura nos blocos da cidade) |

Cada um entra no registro (`assets/registro.json`) sem id, `npm run assets`, e só depois de enviado volta pelo `--importar`.

**Já no registro, sem id (fase 0, 2026-10-23)**: o código do jogo já usa cada um assim que o id chegar, sem mudar nada.

| Chave | O que é | De onde sai | O jogo sem ele |
|---|---|---|---|
| `mundo.base.grama` | textura sem emenda de 1024 × 1024 da grama | a montar dos miolos de `grama_variacoes` e `grama_terra` (refeitos) | grama lisa na cor da base da folha_juncao (`#4b7e52`) |
| `mundo.base.terra` | idem, terra | miolos de `grama_terra` e `terra_pedrinhas` | terra lisa (`#8c5b4a`) |
| `mundo.base.calcada` | idem, calçada | `grama_calcada`, `praca_lajotas` | a calçada é areia (a calçada vira terreno próprio com o conjunto `grama_calcada`) |
| `mundo.base.mata` | idem, copa da mata | `mata_copa` | a mata é grama com lugar marcado |
| `mundo.agua_rio.0` a `.3` | água do rio, 4 quadros de 1024 × 1024 | a fazer (a água da equipe, `ilha_quadros`) | água lisa (mar raso e mar fundo da folha_juncao), só a espuma da margem anima |
| `mundo.conjuntos` | folha dos conjuntos da equipe, vagas de 4 × 6 tiles (Wang de 16) | **pronta**: `python -I tools/mundo_mapa.py conjuntos` grava `Haywood-Valley-recuperado\mundo\folha_conjuntos_v1.png` com `grama_terra` (vaga 0) e `agua_grama` (vaga 1); `grama_calcada` e `mata_copa` ainda são listas por uso, não Wang | as junções da folha_juncao |

As texturas grandes e a água do rio ainda **não existem** (são montagem de arte nova a partir dos refeitos): ficam listadas, sem arte feita, pela regra do usuário.

**Fase 1, objetos (2026-10-23)**: `mundo.objetos.0` | a folha dos objetos refeitos (casas, árvores, moitas, poços, ponte, bancos, placas, o morro e a lagoa, e as tiras de sebe e cerca), 1024 × 1024, uma folha só | **pronta**: `python -I tools/mundo_mapa.py objetos` grava `Haywood-Valley-recuperado\mundo\folha_objetos_v1_0.png` (arte derivada do ALttP: fica fora do repositório) | os lugares marcados de sempre. O que falta criar (casa da fazenda, celeiro, galinheiro, caixa de venda...) continua sem chave.

## 10. Decisões tomadas aqui e o que fica para o usuário

Tomadas (com a autonomia de 2026-10-23):

- O mundo é **um mapa em blocos com streaming**, longe da fila dos interiores; o chão é **gerado** a partir do plano, com **modelos autorais** e **peças únicas** do Diorama por cima (§2, §3).
- **Fase 1 = Ribeira leste + 4 lotes do D03**, 12 × 9 blocos (o porquê em `reinos/haywood.md`).
- O lote é uma vaga; a fazenda é uma camada própria por lote; o servidor abre tantas vagas quantos lotes houver.
- Capim é decalque; base em textura grande; blocos autorais densos assados.
- Ordem das fases 1 a 9 (§7). Reinos e cidades livres pelo mapa dos biomas (montanhas: Invernia acima de 3,5 setores, Galena entre 3,5 e 5,3, Brasalta abaixo; deserto: Terracota a leste de 2,05 setores).
- Nomes em inglês do plano (Four Winds Inn, Mirror Lake…) ficam como estão até o usuário decidir; no jogo vão pelas chaves de `i18n` como os demais textos.

Para o usuário:

1. **Velocidade × tempos do plano** (§2): manter a geometria (tempos pela metade), dobrar as distâncias ou mudar o passo fora das cidades.
2. **Escala**: o plano a 13 × 13 setores pede geração (§2); se o usuário preferir pintar tudo à mão, o mundo teria de encolher muito (o Mundo da Luz inteiro é um lote).
3. Tamanho do servidor na fase 1 (4 vagas) e depois (o plano tem 200 lotes; celular fraco pede bem menos jogadores por servidor).
4. Envio das imagens da §9.
5. A fronteira exata dos reinos (este plano tira dos biomas; o plano desenha faixas de fronteira que não se leem bem a 1 px = 32 tiles).

## 11. Fase 0: o que foi feito (2026-10-23)

O jogo já tem o mapa do mundo como um mapa novo (`mundo`), em blocos montados perto da câmera, com o chão gerado do plano na área da fase 1. Só se entra nele pelo teste; o começo normal do jogo (`START_INTERIOR`) não mudou.

### Onde fica cada coisa

| O quê | Onde |
|---|---|
| O plano em dados (gerado) | `src/shared/world/plano.ts` (reinos, biomas, lugares com distritos e lotes, o reino e o bioma de cada bloco em RLE), `terreno.ts` (terrenos, junções e decalques da folha_juncao; texturas grandes, água do rio e conjuntos da equipe pela chave do registro), `fase1.ts` (o terreno de cada célula da fase 1 em RLE, bloqueios, áreas fechadas, zonas, lotes, começo e os 733 lugares marcados) |
| O gerador desses módulos | `tools/mundo_mapa.py jogo` (`npm run mundo:jogo`; `-- --conferir` só compara e sai com erro se difere). Lê o plano em `Haywood-Valley-recuperado\mundo\` e os catálogos `diorama/catalogo/exterior.json` e `mundo.json` (novo: o código do esboço → terreno do jogo, as texturas grandes, a água, os conjuntos e os decalques espalhados) |
| Coordenadas, bloqueio, zonas, teste | `src/shared/world/index.ts`: célula do mundo = tile de 16 px desde o canto noroeste (0 a 53.247); `WORLD_ORIGIN` (−13.312, 0, −30.000); `worldCellPoint`, `worldCellOf`, `terrainAt`, `worldBlocked`, `worldKind`, `worldZoneAt`, `worldTest`, os lotes |
| O gerador de blocos (no jogo) | `src/shared/world/generate.ts`, `composeBlock(bx, by)`: a grade dupla do exterior (`EXTERIOR.md`) feita no jogo, determinística, com os recortes juntados em retângulos sem passar da borda de um pedaço |
| O streaming no cliente | `src/client/world/worldMap.ts` (`WorldMap`), ligado pelo `SceneController` quando o mapa do jogador é `mundo` |
| O servidor | `MapService` (leva ao mundo e dá o lote: atributo `MundoLote`, "A" a "D"), `WorldService` (piso invisível só sob a área aberta) |
| A folha dos conjuntos para enviar | `python -I tools/mundo_mapa.py conjuntos` → `Haywood-Valley-recuperado\mundo\folha_conjuntos_v1.png` |
| Os objetos (fase 1) | catálogo `diorama/catalogo/mundo.json` (`objetos`) → `src/shared/world/objetos.ts` (gerado) e os bloqueios de `fase1.ts`; a folha: `python -I tools/mundo_mapa.py objetos` → `folha_objetos_v1_0.png`; o desenho: `worldMap.ts` (`drawObject`) |
| A fazenda (fase 1) | `src/shared/farm.ts`, `FarmService`, `FarmController`, `client/world/farm.ts`; salvo em `PlayerData.farm` |

### Decisões desta fase

- **Gerar no jogo, não em módulo**: o gerador de blocos é TypeScript em `src/shared` (518 mil blocos não cabem em módulo); do Python sai só o terreno por célula (a fase 1 tem 62 kB em RLE) e o plano.
- **Pedaços de 32 × 32**: o cliente monta o bloco em 4 pedaços, cada um com o seu canvas fixo de 512 × 512, só os que tocam a vista mais 16 tiles (desmonta além de 32). Com blocos inteiros, o pior 3 × 3 da fase 1 tinha 4.027 imagens (medido abaixo).
- **Terreno de hoje, sem arte nova**: só a folha_juncao (com id). A calçada é areia; a mata, o capim e o planalto são grama com lugar marcado; o rio é mar raso com o meio fundo (bloqueia) e margem de areia de 1 célula (a folha_juncao não tem par água/grama nem água/terra). Onde o plano tem ponte, a água é rasa de margem a margem (vau; a ponte é marca). `conferir_pares`, no gerador, garante que nenhum tile junta dois terrenos sem junção.
- **Base lisa sem textura grande**: a grama e a terra da folha_juncao são um padrão de 2 × 2 tiles que não junta (2.048 imagens por bloco de grama); sem `mundo.base.*`, a base sai lisa na cor que mais aparece nela (um recorte de 4 × 4 px esticado), e as bordas continuam com textura. Com o id, o tile da célula é o recorte (x mod 64, y mod 64) da textura e a base de um pedaço junta em poucos retângulos, sem mudar código. Do mesmo jeito, `mundo.agua_rio.0-3` põe a água animada no canvas de baixo e `mundo.conjuntos` troca a junção pelo tile Wang da equipe.
- **Lugares marcados**: o que o esboço tem e que não tem arte com id (casas, árvores, cercas, o que falta criar) aparece como retângulo na cor da categoria (laranja: refeito sem id; rosa: a criar; verde: vegetação; marrom: cerca, só o contorno; cinza: fechado), com o nome ou o tipo. `MundoMarcas = false` no Workspace esconde. As construções bloqueiam o retângulo; o resto da Ribeira (fase 2) é área fechada.
- **Lote como vaga**: o servidor dá a cada jogador que entra no mundo o primeiro lote livre (A a D; `MundoLote`), devolvido quando ele sai; sem bloco pedido no teste, ele chega ao portão do lote. A camada da fazenda por lote fica para quando houver o que plantar (sem dados de fazenda nem arte, seria um canvas vazio).
- **O mundo como lugar compartilhado**: `placeOf` aceita `mundo` sem `mapData`; no mundo o `SceneController` não tem `interior` nem `map`, e `ground`/`live` são um canvas vivo que acompanha o jogador (as sombras). Peças, móveis e decoração ficam desligados no mundo; a água rasa do mundo faz o boneco andar na água (`ActionController.poseFor`); a plaquinha mostra as zonas do plano (Ribeira, Rio Lume, Lote A...). Ir e voltar entre o mundo e um interior funciona pelo `MapController` (testado mudando o atributo `Mapa` no servidor); ainda não há saída no mundo.

### Como testar

1. `npx rbxtsc` e `rojo build default.project.json -o ..\Haywood-Valley-recuperado\teste_mundo.rbxl`; abrir esse arquivo num Studio de teste (nunca o place do usuário).
2. No Workspace: `MundoTeste` = `true` (o portão do lote do jogador) ou `"bx,by"` (um bloco do mundo, 471–482 × 762–770: a célula livre mais perto do meio dele). `OrcamentoTeste = true` abre o painel de desempenho; `HoraTeste = 12` deixa a captura clara.
3. Play. O Output diz `[Mundo] mapa do mundo ligado` e avisa as chaves sem id. A pasta `Workspace.World.Mundo` tem os números nos atributos (`Pedacos`, `Blocos`, `Imagens`, `ImagensVivas`, `Bloqueios`, `Marcas`, `Cartoes`, `CompoePiorMs`, `MontaPiorMs`); o painel mostra os mesmos na linha do mapa. O jogador tem `NascerMs` (o tempo do nascer até o véu abrir, só no cliente), `MundoLote` e `Fazenda`.
4. Andar por código (Client): `require(game.ReplicatedStorage.TS.world)` dá `worldCellPoint` e `worldCellOf`; `Humanoid:MoveTo(worldCellPoint(x, y))`.

### Medido no Studio de teste (2026-10-23)

- **Compor um bloco** (`composeBlock` no cliente do Studio): média 4,4 ms, pior 7,0 ms; os 108 blocos da fase em 0,5 s. No jogo a composição é dividida entre quadros (4 ms por quadro); montar um pedaço leva até 4,7 ms.
- **Imagens por bloco**: média 143, pior 909 (o rio cruzando a cidade); os blocos de campo têm 15 a 100, a cidade e o rio 500 a 900 (as bordas da calçada em todas as ruas e as três bordas de cada margem).
- **Na tela, por pedaços** (o pior centro da fase, com a folga de 16 tiles): zoom mais longe (1366 × 768 px de arte) **2.696 imagens** em 20 pedaços, no Largo do Rio; padrão (960 × 540) 2.420 em 16 pedaços; celular (844 × 390 no zoom 2) 1.715. Com blocos inteiros seriam 4.027 no pior 3 × 3. O pior caso ainda passa um pouco das 2.500: é o canto cidade + rio, que o plano manda assar (§3.3) e que a calçada própria e a textura grande também baixam.
- **Andando** (viewport do Studio de 1463 × 850 físicos, zoom 2): Largo do Rio 1.010 imagens (8 pedaços), o vau 1.420 (9 pedaços, 231 na camada viva: a espuma), os lotes 340 a 430. Quadro de 16,7 ms (o limite de 60 do Studio), o pior 19,3 ms atravessando 4 blocos; nossos scripts 0,10 a 0,18 ms por quadro (`Mundo` 0,02). Canvas fixo refeito 0 vez por segundo; a camada viva 4 (a espuma).
- **Bloqueio e água**: andando para o leste pelo Largo, o boneco para no mar fundo do rio com os pés na água rasa; pelo vau da Ponte do Portão ele atravessa andando na água e sai na avenida; o cata-vento da praça bloqueia; 10 tiles por segundo.
- **Interiores**: `InteriorTeste` = `exterior_ilha` e `casa_teste_v2_l` (com `AcoesTeste`) montam como antes (20 peças, 2 baús e fogões, 13 halos).

### Fase 1, primeiro passo (2026-10-23): o nascer, os objetos e a fazenda

Os itens 2, 6 e 8 da lista de baixo, como estava antes deste passo.

**O nascer sem espera** (item 8). A causa, medida no Studio de teste: o `CharacterAdded` chega com o personagem **fora** do Workspace (`Parent` vazio); um quadro depois o Roblox o põe no Workspace no ponto de nascer padrão (Y = 100, sem `SpawnLocation`), por cima de qualquer posição gravada antes. `MapService.place` desistia quando via o `Parent` vazio (a conferida era para o personagem destruído), então o servidor nunca levava o personagem ao nascer quando a escala já estava pronta (sempre nos interiores; no mundo dependia da ordem dos eventos), e só a conferida do cliente aos 3 s o levava. Agora:

- `MapService.place` espera o personagem entrar no Workspace e leva na hora, já na altura de quem está em pé (`standingHeight`, `shared/character.ts`: quadril + meia raiz, 0,75 stud), sem a queda de 1 s desde Y = 100. No mundo, a célula pedida que um objeto bloqueia vira a livre mais perto (`nearestFree`), gravada de volta em `MapaCelula`.
- `MapController.settleSpawn` (no lugar da conferida de 3 s): o véu começa fechado e fecha na hora a cada nascer; o personagem fica parado até estar dentro do mapa **com o pedaço do chão debaixo dele montado** (`WorldMap.groundAt`); aí o véu abre em 0,2 s. Sem o servidor em 1,5 s, o cliente leva (aviso `[Mapa] o servidor não levou o personagem ao nascer`). O tempo fica no atributo `NascerMs` do jogador (só no cliente).
- Medido: casa de teste 44 a 90 ms do controller pronto ao véu abrir; mundo 75 a 141 ms (até 0,9 s no primeiro Play depois de abrir o Studio, com o cliente ainda carregando); renascer (`LoadCharacter`) 17 a 32 ms, com o personagem já no lugar no primeiro quadro em que o cliente o vê. Antes: 3 s, com o personagem caindo na origem.

**Objetos em cartões** (item 2). O catálogo é `diorama/catalogo/mundo.json`, `objetos` (os campos estão na `nota_campos` dele): cada tipo de lugar marcado que já tem arte refeita (`_indice.json`, o arquivo `recomendado`, só a variante 0: os `*_melhorado` têm 4 variantes lado a lado, estações ou cores de telhado), com a forma, o pé, os bloqueios em pixels da imagem e a oclusão.

| Forma | Tipos | Como fica |
|---|---|---|
| cartão (em pé, `card.ts`) | árvores, moitas, arbusto, toco, pedra, casas (6), galpão, portal, poços, cata-vento, placa, bancos, bebedouro, canteiro de potes, mata | o pé no meio da borda de baixo da marca; árvore grande com a oclusão de árvore, moitas, mata, portal e cata-vento com a cheia |
| deitado (canvas fixo do pedaço) | ponte de madeira, canteiro de flores, flores brancas, morro, lagoa | a borda de baixo da imagem na da marca |
| linha e contorno (canvas fixo) | sebes, muros (a sebe no lugar do muro, como na maquete), sebe dos lotes da cidade (vão de 5 tiles embaixo), cerca da fazenda | a tira já repetida na folha (até 576 px, um número inteiro de passos), um recorte por trecho reto dentro do pedaço, começando no passo certo |

- **Gerador** (`tools/mundo_mapa.py`): `jogo` grava também `src/shared/world/objetos.ts` (onde cada recorte fica na folha, pelo empacotamento em linha do horizonte, só com os tamanhos do índice) e tira os bloqueios de `fase1.ts` do catálogo: o tronco da árvore, as paredes da casa (a fileira dos degraus passa), os dois postes do portal. O que não tem arte (o que falta criar) bloqueia o retângulo da marca, como antes. São 619 retângulos (eram 70): `shared/world/index.ts` os guarda em baldes por bloco (`phaseBlockersIn`), senão compor um bloco ia de 5 para 100 ms. `objetos` monta a folha (fora do repositório).
- **Jogo** (`worldMap.ts`, `drawObject`): com o id de `mundo.objetos.0`, cada lugar marcado com arte vira o desenho dele; o cartão é do pedaço onde fica o pé (um por objeto), sai com o pedaço e tira o registro da oclusão. Sem o id, a marca de sempre. Os bloqueios valem com ou sem arte (são do gerador). Sebes e cercas bloqueiam desde o segundo passo (abaixo). O pedaço recebe as marcas com 2 células de folga (`MARK_MARGIN`), para a arte deitada que passa do retângulo.
- **Teste sem enviar**: `MundoObjetosTeste` (só no Studio) troca o id da folha. Copiar `folha_objetos_v1_0.png` para `%LOCALAPPDATA%\Roblox\Versions\<versão do Studio>\content\textures\hv_teste\folha_objetos.png` e pôr `MundoObjetosTeste = "rbxasset://textures/hv_teste/folha_objetos.png"`: o Studio mostra a folha de verdade sem ela ir ao Roblox (apagar a cópia depois). `MundoMarcas = "cartao"` mostra os objetos sem arte como cartões vazados do tamanho de verdade.
- Medido no Studio de teste (viewport de 1463 × 850 físicos, zoom 2, com a folha pelo teste): Largo do Rio 1.055 imagens em 8 pedaços e 12 cartões; o vau 1.502 (213 vivas) e 10 cartões; uma quadra da cidade 729 e 37 cartões; centro do D03 759 e 13; a fazenda do lote A 357 e 28; a mata 234 e 5. Compor um bloco: 4,7 a 5,2 ms. A árvore grande na frente do personagem fica 55% transparente; as casas, na frente de quem passa atrás delas.

**A camada da fazenda** (item 6). Regras em `src/shared/farm.ts`; servidor `FarmService`; cliente `FarmController` e `client/world/farm.ts`.

- **Canteiro** de 2 × 2 tiles (32 × 32 px, a célula do protótipo, o tamanho da terra arada e do trigo de `sprites.ts`) na fazenda inicial de 64 × 64 do lote (32 × 32 canteiros); dá para cultivar o que tem os 4 tiles de terra do plano (os 3 canteiros de terra do esboço: 180 por fazenda) e nada bloqueando.
- **Estados**: terra (nada guardado), arada, plantada; crescendo (de 1/3 do tempo) e pronta saem da hora em que se plantou, pelo relógio do servidor (`GetServerTimeNow`, segundos Unix, o mesmo em todo servidor: o trigo cresce com o jogador fora). Trigo: 120 s (`FARM_CROPS`); `FazendaCrescerTeste` (segundos) no Workspace para testar. Colher volta a arada; a colheita ainda não vai para lugar nenhum (sem economia).
- **Desenho**: uma camada viva por lote com dono (`createGround`, papel `vivo`, 1024 × 1024 px sobre a fazenda), por cima do canvas fixo dos pedaços: duas fileiras de `Sprites.soil` por canteiro arado e o trigo (`wheat1` plantado, `wheat2` crescendo, `wheat3` pronto), deitados (`GroundLayer.Soil`). Muda só quando o atributo muda ou um canteiro troca de estágio (conferido a cada 1 s); o chão fixo nunca é refeito. Todos veem a fazenda de todos (o atributo `Fazenda` do dono vai a todos).
- **Ação**: a tecla F (ou o botão na tela de toque) no mundo, sem peça nem móvel, mira o canteiro à frente do pé (12 px) ou debaixo dele, na própria fazenda: "Arar", "Plantar trigo", "Colher" (`action.till`, `action.plant`, `action.harvest`).
- **Servidor**: `farmTill`, `farmPlant`, `farmHarvest` passam pelo limitador (`RATE.farm` = 8 por segundo, juntos) e são conferidos (no mundo, com lote, canteiro cultivável, personagem a até 3 tiles, estado certo); o que não passa é ignorado. Grava em `PlayerData.farm` e no atributo.
- **Salvo**: `PlayerData` passou ao formato 2 (`PLAYER_DATA_VERSION`, campo `v`), com `farm = { v: FARM_SAVE_VERSION, plots }` (texto "índice,estado[,planta,hora];..."); o salvo de antes (sem `v` nem `farm`) se lê com a fazenda vazia; a fazenda salva por uma versão mais nova fica como veio. A gravação agora guarda os campos do salvo que o servidor não conhece. **Ao publicar, fechar os servidores antigos**: eles gravam só os campos que conhecem e apagariam a fazenda.
- Testado no Studio de teste (eventos disparados pelo cliente, como faria a tecla): arar 4 canteiros, plantar 2, colher cedo (recusado), arar fora da terra (recusado), o trigo nas três fases com 20 s, colher (volta a arada), 30 pedidos de uma vez (só os do limite passam); a dica "Arar"/"Colher" aparece na frente do canteiro.

### Fase 1, segundo passo (2026-10-23): sons, lote na viagem, sebes e cercas

**Sons do mundo** (`SoundController`, `FarmController.onWork`, `shared/sounds.ts`; nada tem id ainda, conferido pelos avisos do Output):

- **Fazenda**: arar, plantar e colher tocam `enxada`, `plantar` e `colher` no meio do canteiro quando o atributo `Fazenda` de um jogador muda com o mundo montado (o servidor já aceitou; nada de som pela rede). O "antes" é o que o `FarmController` ouviu da última vez (`heard`), não o cache do desenho; ao montar o mundo e ao trocar de lote só se guarda o estado. Os de outro jogador saem a `OTHER_PLAYER_VOLUME`; vale o limite de cópias.
- **Ambiente**: perfil novo `campo` (`campoDia` e `campoNoite` na frente, pássaros e grilos por baixo), por período do dia. As zonas do plano agora levam as propriedades de som do gerador (`ZONAS_F1`, terceiro campo de `PHASE1_ZONES`): campo na roça, nos lotes, na estrada e na beira do rio; `exterior` com a música `vila` na **Ribeira** e no **Centro do distrito D03**; o mapa `mundo` em `MAP_SOUND_PROPS` é campo sem música. O plugin conhece `campo` e `vila` nas listas da zona.
- **Rio**: `PLACED.rio`, um laço só que vai ao ponto de água mais perto do jogador, como o mar dos interiores; os pontos são a água da fase de 2 em 2 células (`worldWaterSample`, 1.028 pontos, lidos uma vez). Posições físicas, como as do ouvinte (o ouvinte não é a câmera, então `toView` não entra).

**Lote na viagem** (`MapService.enterWorld`): entrar no mundo pelo teste ou por uma saída de interior com o mapa `mundo` passa pelo mesmo caminho: dá o lote (o mesmo, se já tinha), grava a chegada (a célula pedida, `"lote"` ou nada para o portão do lote, ou o começo do mundo sem lote; a livre mais perto se bloqueia) e o mapa. O lote fica com o jogador enquanto ele está no servidor (como o lugar da casa: quem entra em casa e volta tem a fazenda no mesmo lote) e se solta quando ele sai. O Verificar do plugin aceita saída para `mundo` com essas chegadas.

**Sebes e cercas bloqueiam** (`linhas_fase1` em `tools/mundo_mapa.py`): o gerador parte cada contorno nos quatro lados (`linhas` no catálogo: `sebe_lote` → `sebe_h`/`sebe_v`, `cerca` → `cerca_h`/`cerca_v`, tipos novos com as mesmas tiras, a folha não muda) e cada linha em trechos retos, tirando os vãos; cada trecho é um lugar marcado e um bloqueio do mesmo tamanho (244 trechos). Vãos: o de baixo das sebes da cidade (215 células), onde a linha cruza um caminho com terra ou calçada dos dois lados (a sebe dos lotes na avenida N-S, 6), onde cruza a água (o muro da cidade no rio, 14) e a **porteira** de 2 tiles de cada cerca de fazenda, no lado da trilha do portão (à direita nos lotes A e C, à esquerda nos B e D, nas duas primeiras linhas da trilha). O vão é só a falta da linha e do bloqueio, sem arte. O trecho de cima do muro leste da cidade termina antes do Portão Leste (linhas 64 a 185), que não fica mais sobre a sebe.

Testado no Studio de teste (`MundoTeste`, Play): na trilha do lote A o boneco para na cerca fora da porteira e entra pela porteira até o miolo; a sebe do norte dos lotes para quem vem do sul e a avenida passa; o muro leste da cidade bloqueia e o Portão Leste passa; o corredor de 1 tile entre as sebes das casas da cidade passa. Com o atributo `Fazenda` mudado no servidor (arar, plantar, colher), o Output avisa `effect.enxada`, `effect.plantar` e `effect.colher` sem id; no lote, as camadas `campoDia` (meio-dia) e `campoNoite` (22h) e o `rio`; na Ribeira, a faixa `vila`. Saída de interior para o mundo: com a saída do `teste_d_origem` trocada para `mundo` no Studio de teste, o servidor deu o lote A e levou ao portão (`[Mapa] …: teste_d_origem → mundo (30566,48957, lote A)`) e o cliente montou o mundo.

### O que falta para a fase 1 ficar jogável

1. **Envios** (só com o OK do usuário, §9): `mundo.conjuntos` e `mundo.objetos.0` (as folhas estão prontas), as texturas grandes e a água do rio (a montar dos refeitos) e as quadras assadas da cidade.
2. **Objetos**: a arte do que falta criar (casa da fazenda, celeiro, galinheiro, caixa de venda, quadro de pedidos, espantalho, carroça, barraca, fogueira, ponte de pedra, píer, mirante, escada) entra no catálogo quando existir; as 4 variantes (estações, telhados) ainda não são escolhidas; a porteira da cerca da fazenda é arte a criar (o vão já existe); o cata-vento não gira (os quadros estão em `cata_vento_quadros`).
3. **Terrenos que faltam**: calçada própria (com `grama_calcada` organizado em Wang), mata e penhasco em autotile (o Alto do Mirante), terra arada própria (hoje a arada é a terra do protótipo, que tem o desenho inclinado da vista antiga); quando `agua_grama` tiver id, o gerador do plano deixa de pôr a margem de areia onde o rio encosta na grama.
4. **Modelos autorais no Diorama**: as quadras da Ribeira, o rio com as pontes, o centro do distrito, a parada e o miolo da fazenda (`diorama/modelos/`), e o gerador pondo cada modelo no bloco dele.
5. **Saídas**: a porta da casa da fazenda (a casa do jogador de hoje, cópia por dono), as lojas e a pousada da Ribeira (saídas **do** mundo). A volta do interior ao portão do lote já funciona no servidor (saída com o mapa `mundo`, segundo passo); falta pôr essa saída nos mapas do Diorama quando a casa da fazenda existir.
6. **A fazenda de verdade**: sementes e colheita no inventário, outras plantas, a cerca crescendo (64, 128, 192), construções (cartões) e o mato do lote a limpar; o trigo pronto como cartão (hoje deitado, o boneco fica sempre por cima dele).
7. **O começo do jogo** no portão do lote, no lugar de `START_INTERIOR`, quando o resto estiver no lugar.
