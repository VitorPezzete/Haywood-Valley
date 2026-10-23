# Plano de assets do mundo principal (2026-10-23)

Pedido do usuário: "pegar os sprites e separar para planejar os assets do mundo principal". A base é o mapa do Mundo da Luz de *A Link to the Past* que a equipe passou (uso liberado pelo usuário em 2026-10-23, jurídico consultado; ver `CLAUDE.md`), para ser refeito e refinado no estilo da equipe, do Aeko ou aeko+equipe. As imagens ficam fora do repositório, em `Documents\Haywood-Valley-recuperado\mundo\`:

- `mundo_principal_base_alttp_1x.png`: o *rip* em PNG, pixel 1:1 (4110×5136, com as linhas de separação de 2 px).
- `mundo_principal_limpo.png`: o mesmo sem as linhas (4096×5120 = 256×320 tiles de 16 px).
- `tiles_unicos.png` e `tiles_unicos.json`: os tiles diferentes, do mais usado ao menos usado, com um exemplo de onde aparece cada um; `grade_tiles.npy`: o mapa como grade de índices.
- `tiles_<grupo>.png`: os tiles separados por grupo de cor (abaixo).
- `recortes/`: as regiões (vila, castelo, montanha, floresta, deserto, lago, pântano, palácio do leste…).
- `nossa_ilha_exterior.gif`: a nossa ilha (`exterior_ilha`) como está no jogo hoje, referência do estilo atual.

## Os números

70.687 tiles de 16 px no mapa, **9.961 diferentes**. O número é alto porque o ALttP guarda cada combinação pronta (penhasco + grama + sombra, borda de água em cada ângulo) como um tile próprio. Para o Haywood não é preciso refazer os 9.961: o que se desenha são **conjuntos** (um material com as bordas dele, no esquema de *autotile* de 47 peças ou de 16 peças de Wang) e **objetos**. Os 9.961 servem de checklist de casos de borda.

| Grupo (por cor dominante) | Tiles diferentes | Usos no mapa |
|---|---|---|
| grama e campo | 1.894 | 16.512 |
| penhasco e terra | 2.811 | 15.945 |
| montanha e deserto | 1.834 | 13.990 |
| floresta e árvores | 696 | 7.484 |
| água | 636 | 7.432 |
| transições de grama | 874 | 4.514 |
| outros objetos | 451 | 1.890 |
| pedra, construção e neve | 268 | 1.277 |
| abismo e caverna | 209 | 804 |
| telhados, flores e detalhes | 216 | 470 |
| margem de água | 72 | 369 |

O agrupamento é automático pela cor: serve para navegar, não é a classificação final.

## Lista de assets a desenhar

Prioridade: **P1** = reino de Haywood (campos, floresta temperada, vila, fazenda inicial, rio), onde o jogo começa; **P2** = os outros biomas do plano dos 13; **P3** = marcos e especiais. Tamanho em tiles de 16 px.

### Terreno (conjuntos com bordas)

| Asset | Onde no mapa base | Biomas do Haywood | Prioridade |
|---|---|---|---|
| Grama lisa + grama com textura + tufos | todo o centro | Campos, Floresta | P1 |
| Grama alta (cortável) | campos e beira de mata | Campos, Savana | P1 |
| Estrada de terra (com bordas e cruzamentos) | ligando vila, castelo, casas | todos | P1 |
| Calçada de pedra / lajotas | vila do oeste, castelo | cidades e vilas | P1 |
| Canteiro de terra arada | hortas da vila | fazendas (D01–D24) | P1 |
| Areia de deserto (com marcas) | deserto do sudoeste | Deserto, Savana | P2 |
| Chão de montanha (oliva) | montanha do norte | Montanhas, Taiga | P2 |
| Nuvem / neve no alto | topo da montanha | Neve e tundra | P2 |
| Abismo com estrelas | buraco da montanha | Terras mágicas, Twilight Isle | P3 |
| Pântano (grama escura + poças) | sul, perto das estátuas | Pântano | P2 |

### Relevo

| Asset | Onde | Prioridade |
|---|---|---|
| Penhasco em degraus de 1 a 2 tiles (bordas, cantos internos e externos, sombra) | por todo o mapa | P1 |
| Paredão alto listrado (montanha) | montanha do norte | P2 |
| Escada de pedra e escada de madeira no penhasco | vila, palácio, montanha | P1 |
| Entrada de caverna (em 2 tamanhos) | penhascos | P1 |
| Rampa / descida | montanha, deserto | P2 |

### Água

| Asset | Onde | Prioridade |
|---|---|---|
| Água rasa e funda (conjunto com margem) | rio, lago do sudeste | P1 (o rio do Haywood) |
| Margem com pedras / barranco de terra | rio e lago | P1 |
| Água escura do fosso | castelo | P3 |
| Cachoeira | canto nordeste, lago | P2 |
| Ponte de madeira, ponte de pedra, ponte de corda | rio, castelo, montanha | P1 (madeira), P2 |
| Píer / escada para a água | lago | P2 |

Já existem no jogo: o mar animado e a areia da ilha (`agua.*`, `mar.infinito.*`, `exterior.*`).

### Vegetação

| Asset | Onde | Prioridade |
|---|---|---|
| Árvore grande redonda (2×2) | campos, beira de estrada | P1 (temos a do atlas e as da equipe) |
| Árvore de mata fechada (borda contínua de floresta) | Floresta do noroeste | P1 |
| Tronco oco caído (passagem) | Floresta do noroeste | P2 |
| Toco de árvore | floresta | P1 |
| Arbusto (cortável) e arbusto escuro | por toda parte | P1 |
| Cerca viva / sebe | vila | P1 |
| Árvore rosa / florida | vila | P1 (temos a cerejeira da equipe) |
| Árvore dourada / de fruta | perto do palácio do leste | P2 |
| Canteiros de flores (rosa, laranja, branca) | vila, castelo | P1 |
| Palmeira | (nossa ilha) | P2, já existe |

### Construções

| Asset | Onde | Prioridade |
|---|---|---|
| Casa de telhado vermelho (2 tamanhos) | vila, casas soltas | P1 |
| Casa de telhado azul (3 tamanhos) | vila | P1 |
| Cabana / galpão de madeira | floresta, vila | P1 |
| Celeiro e estábulo (o ALttP não tem; vêm do Hay Day) | — | P1 |
| Poço | (ver a vila) | P1 |
| Praça com estátua / cata-vento | centro da vila | P1 |
| Cercas de madeira (baixa, de estacas) e portões | vila, fazendas | P1 |
| Castelo (muralha, torres, portão, jardim, fosso) | centro | P3 (capital de Haywood) |
| Igreja / santuário | norte do castelo | P2 |
| Cemitério (lápides, cerca de ferro) | norte do castelo | P2 |
| Templo de pedra com pisos e estátuas | palácio do leste | P2 |
| Templo do deserto (piso escuro, estátuas com escadaria) | deserto | P2 |
| Torre no alto da montanha | montanha | P3 |

### Decoração e objetos soltos

| Asset | Onde | Prioridade |
|---|---|---|
| Pedras (pequena, média, grande pesada) | por toda parte | P1 |
| Placa de madeira, poste | estradas, vila | P1 |
| Estátuas de pedra (gárgula, pilar) | pântano, palácio do leste | P2 |
| Montinhos de terra / buracos | campo de montinhos | P2 |
| Ossos e caveiras | deserto | P2 |
| Cristais / pedras azuis | montanha | P2 |
| Círculo de pedras (portal) | topo da montanha | P3 |
| Potes, barris, caixotes | (temos do Aeko) | P1, já existe |

## O que o mapa base não tem (e o mundo do Haywood precisa)

O Mundo da Luz do ALttP cobre campos, floresta, montanha, deserto, lago e pântano. Do plano dos 13 biomas e do núcleo de fazenda (Hay Day + Stardew) faltam:

| Bioma / sistema | Assets que faltam | Prioridade |
|---|---|---|
| **Fazenda (24 distritos, 200 lotes)** | celeiro, silo, estábulo, galinheiro, curral, chiqueiro, cercas de lote, portão de lote, terra arada, canteiros por fase de cada cultura, espantalho, regador/bebedouro, caixa de venda, moinho de vento, padaria e máquinas de produção, caminho de lote, placa do lote | **P1** |
| **Cidades e vilas** | mercado, barracas, pousada (a cada ≤ 12 min), poste de luz, fonte, quadro de avisos, estação de trem (Brasa Line), porto e píer, oficinas | P1 (Haywood), P2 (outros reinos) |
| **Floresta temperada** | variações de árvore por estação (primavera, verão, outono, inverno), cogumelos, troncos, ninhos | P1 |
| **Taiga e pinhais** | pinheiro (vários), pinheiro com neve, cabana de lenhador, tocos | P2 |
| **Neve e tundra** | neve (conjunto com bordas), gelo, lago congelado, árvores nuas, cidade de Candeia (casas com neve), trenó / trilho de trenó | P2 |
| **Montanhas** | mina (entrada, trilhos, vagão), pedras com minério, cristais | P2 |
| **Deserto e oásis** | cacto, palmeira de oásis, poço de oásis, ruínas, tendas de caravana | P2 |
| **Savana e terra vermelha** | terra vermelha (conjunto), baobá, capim seco, cupinzeiro | P2 |
| **Selva tropical** | árvores tropicais, cipós, folhagem grande, ruínas na mata, palafitas | P2 |
| **Pântano** | árvore de mangue, nenúfar, juncos, casa em palafita, ponte de tábuas | P2 |
| **Terras vulcânicas** | rocha vulcânica, lava (animada), cinzas, fumarola, cidade de Brasalta | P2 |
| **Costa, praias e recifes** | areia (temos), recife de coral, rochas na água, conchas, coqueiro, farol, cais | P2 |
| **Mar e arquipélagos** | mar (temos), ilhas pequenas, barco / navio, boias | P2 |
| **Terras mágicas / Twilight Isle** | grama e flores mágicas, cristais, árvores luminosas, o Véu (anel de névoa animado), torre de magos (Auréola) | P3 |
| **Viagens** | trilhos e estação (trem), dirigível e torre de pouso, portais, placas de direção | P2 |
| **Estações do ano** | versão de cada terreno e árvore por estação (recolorir) | P1 para Haywood |

## Como desenhar (fluxo)

1. **Conjuntos de terreno**: a equipe desenha a peça base e as bordas; o Diorama monta as combinações (o mesmo esquema da grama/caminho/areia do exterior, `docs/diorama/EXTERIOR.md`). Assim os 9.961 viram poucas dezenas de conjuntos.
2. **Objetos**: rascunho (o recorte do mapa base, ou o Spriteloom para o que o ALttP não tem, como celeiro e estábulo), depois estilo da equipe/Aeko (`tools/estilo_aeko_arte.py`, nota mínima 8) e limpeza de linhas (`aseprite/pixel/limpeza.lua`).
3. **Mudar só a cor** (estações, variações): recolorir, não pedir à IA (a IA redesenha; ver a árvore de outono de 2026-10-23).
4. Começar pelo **P1**, o reino de Haywood.
