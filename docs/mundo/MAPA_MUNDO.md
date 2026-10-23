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

- O **mundo é um mapa à parte** (`mundo`), num lugar próprio do Workspace, fora da fila dos interiores: canto noroeste em (−13.312, 0, −30.000), então o mundo ocupa Z de −30.000 a −3.376 e os interiores continuam em Z = 0. A precisão do `float` a 30.000 studs é de uns 0,002 stud, longe do pixel de arte (1/32 stud).
- O cliente monta **só os blocos perto da câmera**: os que tocam a vista mais 16 tiles de folga. No zoom máximo (768 px de arte de altura, uns 48 × 85 tiles) são até 3 × 3 blocos; no padrão, 2 × 2. Cada bloco tem o seu Part com `SurfaceGui` fixo; carregar e descarregar é criar e destruir o bloco, nunca mudar um canvas montado (a regra do plano de otimização). A camada viva e o canvas da água seguem por bloco.
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

1. `diorama/catalogo/exterior.json` ganha `conjuntos`: id, folha, desenho (`juncao_v1` para a `folha_juncao`, `wang16_4x6` para os da equipe), o par (cima, baixo) e os miolos. O gerador escolhe a junção pelo par como hoje; o miolo pela semente da célula (não mais pelo padrão 2 × 2).
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
