# Plano: refazer os assets do ALttP no estilo do jogo (2026-10-23)

Pedido do usuário: "Faça um plano desses assets, separe eles para o mapa, e vá refazendo eles conforme o estilo a se seguir." Depois: "pode pegar os assets também e tentar melhorar eles" e, por fim, "não cria não": só se separa, melhora e estiliza o que **vem das fontes** (ALttP Luz e Trevas, regiões, folhas recebidas, arte da equipe). Bioma sem asset nas fontes fica registrado como **sem asset, aguardando** (seção 6), sem desenhar nem recolorir para inventar.

O uso do *A Link to the Past* como base foi liberado pelo usuário em 2026-10-23, com o jurídico consultado (`CLAUDE.md`, seção Arte). **Nenhuma imagem do ALttP entra no repositório**: aqui ficam só este texto, os números e a ferramenta (`tools/mundo_assets.py`). As imagens ficam em `Documents\Haywood-Valley-recuperado\mundo\assets\`.

Complementa `PLANO_ASSETS_MUNDO.md` (a lista geral dos assets do mundo e o que o mapa base não tem).

## 1. Estilo a seguir

| Grupo | Estilo | Paleta | Contorno |
|---|---|---|---|
| Terreno, água, costa, manchas de chão | `equipe` | as cores de `equipe\mundo_recortes\` (folhas de grama sobre terra e sobre areia, manchas, ilha, mar, tufo) | sem contorno |
| Árvores, arbustos, sebes, plantas | `equipe` | árvores, palmeira, tufo e grama da equipe; o rosa só com a cerejeira (`arvore_rosa`) | escuro da própria cor |
| Construções, cercas, placas, poço, pontes, estátuas, objetos | `aeko+equipe` (mistura 0,5) | presa à paleta do alvo (`--paleta estilo`) | o do alvo (preto do Aeko) |

- Nota de estilo mínima 8 (`tools/estilo_aeko_arte.py`).
- Limpeza de linhas (`aseprite/pixel/limpeza.lua`): só *doubles* e *jaggies*; **órfãos só relatados**, nunca corrigidos (a correção pintou de preto as patas laranja da galinha em 2026-10-23). O terreno não passa pela limpeza (não tem linha).
- Três versões de cada asset: `_original` (o recorte), `_estilo` (ferramenta de estilo + limpeza) e `_melhorado` (ajustes desta etapa, seção 4). O índice diz qual usar (`recomendado`).

## 2. Como os conjuntos de terreno estão montados

O Mundo da Luz (4096×4096, pixel 1:1, grade exata de 16 px, PNG indexado de 111 cores) guarda cada combinação de borda como um tile próprio. A ferramenta classifica cada tile pela cor (índices da paleta do mapa) e monta a folha de cada material:

- **Wang de cantos de 16 peças ("dual grid")**: cada quadrante de 8×8 do tile é do material A ou do B (o que tiver mais pixels). A peça de código `c` (canto superior esquerdo = 1, superior direito = 2, inferior esquerdo = 4, inferior direito = 8; bit ligado = A) fica na coluna `c % 4`, linha `c // 4`; as linhas 5 e 6 são variações do miolo de A e de B. As bordas do ALttP mudam de material a cada 8 px, então 16 peças cobrem o que o *autotile* de 47 cobriria com tiles de 16 (o 47 sai deste montando cada tile com 4 quadrantes).
- **Escolha das peças**: entre os tiles de cada código, vale o que mais aparece **encostado, no próprio mapa**, nos tiles escolhidos para os códigos vizinhos (otimização por coordenadas a partir do mais usado). Só o mais usado de cada código não fechava as emendas.
- **Peças que o mapa não tem**: espelhadas de outra (a luz do ALttP vem de cima e da esquerda; o espelho pode inverter um sombreado) ou compostas por quadrantes (as diagonais 6 e 9). O índice lista quais são (`sinteticas`).
- **Montagem de teste**: `<conjunto>_montagem_original.png` e `_montagem_melhorado.png` pintam uma mancha com bordas retas, cantos de fora, de dentro e um furo; peça que falta sai em magenta.
- **Lista**: o que não é de dois materiais (penhasco, calçada, copa da mata, chão de deserto e de montanha) sai como os tiles mais usados da região, oito por linha. Serve de checklist; a equipe monta o conjunto.

Materiais (índice da paleta do mapa → cor): grama 0 `48a048`, 106 `307030`; terra 109 `908048`, 104 `806038`, 102 `604828`; barranco 102, 103 `483828`, 104, 105 `282828`; água 2 `3860b0`, 16 `5880c0`, 29 `70b8ff`, 11 `304880`; calçada 12 `80c090`, 18 `508070`, 20 `a8e8b0`; copa 108 `305830`, 110 `286840`.

Região P1 no Mundo da Luz: x de 0 a 3072, y de 1536 a 3072 (a vila do oeste, o castelo, a casa do herói, o rio e a mata ao sul do castelo).

## 3. Lista de assets

Prioridade: **P1** = reino de Haywood (campos, floresta temperada, vila tipo Kakariko, fazenda, rio); **P2** = os outros biomas, só com o que as fontes têm. Notas: estilo / linha (0 a 10; "–" = sem linha). Rec. = versão recomendada.

### 3.1 P1, terreno (9)

| Asset | Fonte | Esquema | Bioma | Notas | Rec. | Já tem na equipe / mão da equipe |
|---|---|---|---|---|---|---|
| `grama_terra` | mapa, grama × terra | Wang 16 (7 espelhada, 6 e 9 por quadrantes) | campos, fazenda, estradas | 10 / – | melhorado | A da equipe (`terreno_grama_sobre_terra`) é mancha arredondada; esta é a borda irregular de estrada. Montagem fecha. |
| `grama_calcada` | mapa, lajotas da vila | lista (24) | vila | 9,5 / – | melhorado | Calçada alinhada no tile, sem conjunto de bordas: a equipe define a borda (meia lajota). |
| `grama_variacoes` | mapa, só grama e flores | lista (15) | campos, floresta | 10 / – | melhorado | `tufo_grama` e o miolo da folha da equipe. |
| `penhasco_degraus` | mapa, barranco de 1 a 2 tiles | lista (64) | campos, floresta, rio | 10 / – | melhorado | Não é conjunto pronto: montar a partir do anel. |
| `penhasco_morro_anel` | gablaxian 002 | anel com as 8 direções | campos (morro) | 10 / – | melhorado | A ferramenta de estilo achata as faixas do barranco; o recolorido mantém. |
| `agua_grama` | mapa inteiro (lagoas do pântano) | Wang 16 (1, 2, 13, 14 espelhadas; 6 e 9 compostas) | rio, lagoas | 10 / – | melhorado | No Mundo da Luz a água quase não encosta direto na grama. Falta a animação da borda (a da ilha da equipe, `ilha_quadros`). |
| `agua_penhasco` | mapa inteiro, água × barranco | Wang 16, **faltam 1, 2, 4, 8, 6, 9** | rio com barranco | 9,1 / – | melhorado | O ALttP faz a curva da água em diagonal: os cantos de fora não existem. Usar o anel; a equipe desenha os cantos. |
| `lago_penhasco_anel` | gablaxian 006 | anel | rio, lago | 10 / – | melhorado | A ferramenta de estilo escurece a água; o recolorido mantém. |
| `mata_copa` | mapa inteiro, copa contínua | lista (40) | floresta temperada (mata fechada) | 8,3 / – | melhorado | Copa de anéis lisos, não de tufos (a referência é a árvore do Caramel): redesenhar. |

### 3.2 P1, vegetação (13)

| Asset | Fonte | Bioma | Notas | Rec. | Já tem / mão da equipe |
|---|---|---|---|---|---|
| `arvore_grande` | gablaxian 005 | campos, vila, floresta | 10 / 7,3 | melhorado (4 estações) | A equipe já tem `arvore_verde/rosa/outono` em tufos. A copa do ALttP é de anéis concêntricos e tem *jaggies*: redesenhar a copa no jeito da equipe. |
| `mata_bloco` | gablaxian 078 | borda de mata | 10 / 7,6 | estilo | Mesma copa: refazer com a árvore da equipe. |
| `arvore_pequena` | gablaxian 064 | vila, campos | 9,7 / 10 | melhorado (4 estações) | |
| `arvore_pequena_rosa` | gablaxian 064 | vila | 9,2 / 10 | estilo | `arvore_rosa` (grande). |
| `moita_grande` | gablaxian 010 | campos, floresta | 10 / 9,3 | melhorado (4 estações) | |
| `moita_cruz` | gablaxian 016 | campos, floresta | 9,6 / 7,7 | estilo | Linha abaixo de 8: acertar à mão. |
| `arbusto` (cortável) | mapa (139, 163) | todos | 9,9 / 10 | estilo | |
| `toco` | gablaxian 011 | floresta | 9,6 / 10 | estilo | |
| `sebe_horizontal` | mapa, vila | vila, fazenda | 9,4 / 10 | estilo | |
| `sebe_vertical` | mapa, vila | vila, fazenda | 9,9 / 10 | estilo | Trecho que se repete (sem a ponta de cima). |
| `sebe_rosa` | gablaxian 039 | vila | 9,6 / 10 | estilo | |
| `canteiro_flores_rosa` | gablaxian 073 | vila | 9,6 / 10 | estilo | |
| `flores_brancas` | mapa (140, 164) | campos | 8,4 / 10 | estilo | |

### 3.3 P1, construções (13)

| Asset | Fonte | Bioma | Notas | Rec. | Melhorado |
|---|---|---|---|---|---|
| `casa_vermelha` | gablaxian 075 | vila | 10 / 10 | melhorado | madeira e pedra da equipe; telhado em vermelho, azul, verde e laranja |
| `casa_azul` | gablaxian 075 | vila | 10 / 10 | melhorado | idem, telhado azul, vermelho, verde e laranja |
| `casa_azul_grande` | gablaxian 082 | vila | 10 / 10 | melhorado | madeira e pedra |
| `casa_azul_media` | gablaxian 089 | vila | 10 / 10 | melhorado | madeira e pedra |
| `casa_vermelha_loja` | gablaxian 104 | vila | 10 / 10 | melhorado | madeira e pedra |
| `casa_madeira` | gablaxian 103 | vila, floresta | 10 / 10 | melhorado | madeira e pedra |
| `galpao_madeira` | gablaxian 096 | fazenda, floresta | 9,6 / 10 | melhorado | madeira |
| `portal_madeira` | gablaxian 003 | entrada da vila | 8,4 / 10 | melhorado | madeira |
| `poco_madeira` | gablaxian 003 | vila, fazenda | 10 / 10 | melhorado | madeira |
| `poco_pedra` | gablaxian 001 | vila | 10 / 10 | melhorado | pedra cinza |
| `ponte_madeira` | gablaxian 068 | rio | 10 / 10 | melhorado | madeira |
| `cerca_estacas` | mapa, vila | vila, fazenda | 10 / 10 | melhorado | madeira |
| `cerca_pecas` | gablaxian 064 | fazenda | 9,9 / 10 | melhorado | madeira |

O ALttP não tem celeiro, silo, estábulo, galinheiro, curral, moinho: ver a seção 6.

### 3.4 P1, objetos (8)

| Asset | Fonte | Bioma | Notas | Rec. |
|---|---|---|---|---|
| `placa` | mapa (20, 104) | estradas, vila | 10 / 10 | melhorado (a equipe tem a placa "NOME" de lote) |
| `cata_vento_praca` | gablaxian 001 | praça da vila | 10 / 10 | melhorado |
| `banco_madeira` | mapa, vila | vila | 10 / 10 | melhorado |
| `banco_pedra` | gablaxian 073 | vila | 10 / 10 | melhorado |
| `bebedouro` | mapa, vila | fazenda, vila | 10 / 10 | melhorado |
| `pedra_leve` | mapa (136, 180) | todos | 10 / 10 | melhorado |
| `pedra_escura` (pede luva) | mapa (131, 79) | todos | 9,6 / 10 | melhorado |
| `canteiro_potes` | mapa, vila | vila, fazenda | 10 / 10 | melhorado (potes: os do Aeko já existem) |

A escada de pedra no barranco, a entrada de caverna e a ponte de pedra entraram na segunda rodada (seção 8); o castelo inteiro continua P3.

### 3.5 P2, só das fontes (12)

| Asset | Fonte | Bioma | Notas | Rec. | Mão da equipe |
|---|---|---|---|---|---|
| `areia_deserto` | mapa, Deserto | Deserto e oásis | 10 / – | original | A paleta da equipe não tem areia de deserto: o estilo puxa para a terra laranja. Aguardando as cores. |
| `montanha_chao` | mapa, Montanha da Morte | Montanhas | 10 / – | original | Sem cores de montanha na equipe. |
| `pantano_chao` | mapa, Grande Pântano | Pântano | 9,5 / – | estilo | |
| `gelo_agua` | Ilha de Gelo (Mundo das Trevas) | Neve e tundra (lago congelado) | 8,9 / – | original | Borda diagonal: o Wang fecha mal (faltam 10 peças). Base para redesenhar. |
| `arvore_vermelha` | gablaxian 001 | floresta (outono) | 9,6 / 7,9 | estilo | Copa de anéis; a equipe tem `arvore_outono`. |
| `arvore_dourada` | gablaxian 001 | floresta (fruta) | 10 / 7,9 | estilo | Copa de anéis; o amarelo some na paleta da equipe. |
| `tronco_oco` | gablaxian 039 | floresta temperada | 10 / 10 | melhorado | |
| `lapide` | mapa, cemitério | cemitério das cidades | 10 / 10 | estilo | |
| `cerca_pedra_poste` | mapa, cemitério | cemitério, castelo | 10 / 10 | melhorado | |
| `portao_ferro` | mapa, cemitério | cemitério, castelo | 10 / 9,9 | estilo | |
| `estatua_pequena` | gablaxian 029 | pântano, templos | 9,5 / 10 | melhorado | |
| `estatua_rosto` | gablaxian 030 | pântano, templos | 9,5 / 10 | melhorado | |

Contagem: **P1 = 43** (9 terreno, 13 vegetação, 13 construções, 8 objetos); **P2 = 12** (4 terreno, 3 vegetação, 3 objetos, 2 construções).

## 4. O que é o "melhorado"

- **Terreno do P1**: cada cor do ALttP vai para a cor da equipe do mesmo papel (`PAPEIS_TERRENO`: grama `52995b`/`2f7c5c`, terra `956538`/`7c5634`/`604e2e`, água `5289ff`/`72b3f0`/`2b70e2`/`cee7ff`, barranco nos marrons e `323f33` no lugar do preto, calçada em bege). A forma fica intacta. É a versão recomendada: a ferramenta de estilo, presa à paleta curta da equipe, achata as faixas do barranco e escurece a água.
- **Árvores e moita**: quatro estações (verão, primavera, outono, inverno) trocando a rampa da copa pelas rampas das árvores da equipe; a sombra no chão acompanha (folhas, pétalas, neve).
- **Construções e objetos**: a madeira (bege e oliva do ALttP) vai, pelo brilho mais perto, para uma rampa de madeira marrom-quente: os escuros e meios dos móveis de madeira do Aeko (folha `casa`: `2a1812`, `5b300c`, `793c18`, `8d5a1a`, `aa6d3c`) com a terra e a placa "NOME" da equipe (`956538`, `c89769`, `ebbc6d`), matiz entre 15 e 37 graus. A rampa da primeira rodada vinha dos troncos das árvores da equipe (`4c2b3b`, `6b444b`, `985d50`, matiz de ameixa) e deixou a madeira vermelho-rosada (corrigido na segunda rodada, seção 8.1). A pedra verde-menta vai para o cinza das pedras da ilha da equipe. As duas casas de exemplo ganham o telhado em quatro cores.
- Não houve melhorado onde o recolorido piorava: o rosa (fica o estilo, só com a cerejeira na paleta), a lápide (a pedra bege caía na madeira) e o terreno do P2 (as cores do deserto, da montanha e do gelo não têm papel na arte da equipe).

## 5. O que a conversão automática não resolve (mão da equipe)

1. **Copa das árvores**: o ALttP desenha a copa em anéis concêntricos lisos; o usuário recusou copa lisa e a referência é a do Caramel (tufos, vãos escuros), como as árvores da equipe. `arvore_grande`, `mata_bloco`, `mata_copa`, `arvore_vermelha`, `arvore_dourada`: usar a forma e o tamanho, redesenhar a copa. A linha delas fica entre 7,3 e 7,9.
2. **Cantos da água no barranco** (`agua_penhasco`): faltam os cantos de fora e as diagonais.
3. **Penhasco em degraus**: montado na segunda rodada a partir do barranco de Kakariko (seção 8.4); faltam nas fontes os degraus de lado e de costas e os cantos de dentro.
4. **Borda da calçada**: alinhada no tile no ALttP; decidir a borda.
5. **Animação da água na margem**: no jeito da ilha da equipe (`mundo\ilha_quadros\`, espuma e areia molhada subindo e descendo).
6. **Cores dos biomas P2**: a arte da equipe não tem areia de deserto, rocha de montanha nem gelo; o estilo puxa para as cores que existem.
7. `moita_cruz` (linha 7,7): acertar os *jaggies* da borda.

## 6. Sem asset nas fontes (aguardando)

Pelo pedido do usuário ("não cria não"), nada foi desenhado nem recolorido para estes; ficam aguardando arte da equipe ou decisão:

| Bioma / sistema | O que falta |
|---|---|
| Fazenda (24 distritos) | celeiro, silo, estábulo, galinheiro, curral, chiqueiro, moinho, espantalho, terra arada por fase, caixa de venda, máquinas |
| Neve e tundra (Invernia) | neve com bordas, árvores com neve, casas com neve (só há o gelo da Ilha de Gelo e as nuvens do alto da montanha) |
| Taiga e pinhais | pinheiros, cabana de lenhador |
| Savana e terra vermelha (Terracota) | terra vermelha, baobá, capim seco, cupinzeiro |
| Deserto e oásis | palmeira de oásis (o chão, as bordas, o cacto, a planta seca, as ossadas, a estátua do templo e a tenda existem nas fontes e entraram na segunda rodada) |
| Selva tropical (Verdália) | árvores tropicais, cipó, folhagem grande, palafitas |
| Terras vulcânicas (Brasalta) | rocha vulcânica, lava, cinza, fumarola |
| Costa e recifes (Marésia) | coral, conchas, farol, cais (areia e mar já existem na equipe) |
| Terras mágicas / Twilight Isle | grama e flores mágicas, cristais, árvores luminosas, o Véu |
| Viagens | trilhos, estação, dirigível |

## 7. Ferramenta e arquivos

`python -I tools/mundo_assets.py tudo [--prioridade P1|P2|todas] [--so a,b]` faz, em ordem: `separar`, `estilo`, `limpar` (um processo `-b` do Aseprite só, curto), `melhorar`, `avaliar` (a recomendação e as notas de mão da equipe, `AVALIACAO`), `comparar`. `lista` mostra a lista. Coordenadas, materiais e escolhas estão no topo do script.

Em `Documents\Haywood-Valley-recuperado\mundo\assets\`:

- `<categoria>\<nome>_original.png`, `_estilo.png`, `_melhorado.png`; nos conjuntos de Wang, `_montagem_original.png` e `_montagem_melhorado.png`.
- `_comparar_<categoria>_<n>.png` (terreno 1 a 5, vegetação 1 a 4, construções 1 a 4, objetos 1 a 4): original | estilo | melhorado, ampliados, com as notas e a recomendação; cada página tem até 1800 px de altura, para abrir no celular. Substituem as folhas únicas da primeira rodada.
- `_indice.json`: por asset, categoria, bioma, prioridade, fonte (tiles do mapa, peça da gablaxian ou recorte), arquivos, opções e nota de estilo, limpeza (nota de linha antes e depois, doubles e jaggies corrigidos, órfãos relatados), melhoria, recomendação, o que a equipe já tem e o que precisa de mão da equipe.
- `_paleta_*.png`: as cores da equipe usadas como paleta de cada grupo.

As fontes que tinham chegado no fim foram usadas na segunda rodada (seção 8).

## 8. Segunda rodada (2026-10-23)

Pedido: corrigir a madeira; separar o que ficou de fora das outras fontes; a escada no barranco, a entrada de caverna e o conjunto de degraus; os conjuntos de terreno e os objetos das regiões do Mundo da Luz e das Trevas (sem dungeons); tudo melhorado e estilizado, com folhas menores. A regra continua: **nada que não exista nas fontes**. `python -I tools/mundo_assets.py tudo --prioridade todas --rodada segunda` refaz só esta rodada.

### 8.1 Madeira corrigida

`casa_madeira`, `galpao_madeira`, `portal_madeira` (o pórtico), `poco_madeira`, `cerca_estacas` e `cerca_pecas` (e todo melhorado com madeira) saíam vermelho-rosados: a rampa (`MADEIRA_EQUIPE`) era a dos troncos das árvores da equipe, que são cor de ameixa (matiz 330 a 10). Trocada pela rampa da seção 4 (móveis do Aeko com a terra e a placa da equipe). Conferido nas folhas com três rampas: só com os meios do Aeko (`733c18`, `b66d42`) ficava laranja; com os claros dos troncos da equipe (`765142`, `a7795a`), ainda rosado; a escolhida lê como madeira marrom.

### 8.2 Fontes usadas

- `gablaxian_pecas` (177 peças): entraram as de mundo que faltavam. Ficaram de fora as de dungeon e interior (pisos de ouro, molduras, colunas roxas, a moldura de diálogo), o logo e o alfabeto, a Pedra-Tartaruga e a pirâmide (marcos, P3) e as de inimigo.
- `folha_objetos_overworld_2.png` é a mesma imagem da folha da gablaxian (conferido pixel a pixel).
- `folha_tiles_mundo_mista.png` (PNG): grama alta, mancha de terra, terra com pedrinhas, toco grande, toco com buraco, cerca de troncos, tenda, pedras, cascalho, buraco, estaca, arbusto seco, o chão desenhado das Terras sombrias, monte de anéis.
- `folha_tiles_por_peca_vila.png` (PNG, fundo branco): os três quadros do cata-vento, a moita rosa dupla, o arbusto laranja.
- `folha_casas_vila_hero_of_swords.jpg` e `folha_tiles_por_peca_comparacao.jpg`: não deram peça que não exista em PNG (casas, sebes, árvores e o resto estão na gablaxian ou nos mapas).
- `folha_interior_templo_hero_of_swords*.png`: interior de templo (dungeon), fora do mundo.
- Regiões (`alttp_vgmaps\`): Kakariko, Montanha da Morte (oeste), Castelo, Deserto, Grande Pântano, Lago Hylia, Vila dos Excluídos, Floresta das Caveiras, Pântano do Mal; o cemitério no mapa do Mundo da Luz.

### 8.3 O que entrou (87 assets; 142 no total)

Nota estilo / linha; rec. = versão recomendada (o índice tem todas as notas). Notas de estilo da rodada entre 8,35 e 10.

**P1, terreno (12)**: `praca_lajotas` e `praca_lajotas_clara` (gablaxian 001), `grama_alta`, `mancha_terra_grama`, `terra_pedrinhas` (mista), `mancha_terra` (069), `ilhota_grama` (052), `lagoa_pequena` (055), `escada_barranco` e `entrada_caverna_degrau` (Kakariko), `penhasco_degraus_conjunto` (seção 8.4), `cemiterio_chao` (um tile só: o chão do cemitério é a grama com um calçamento que se repete). Todos 10 / –, melhorado (recolorido papel a papel).

**P1, vegetação (14)**: `sebe_cercado` (a sebe da praça com cantos, pontas e aberturas; 8,9 / 5,7, estilo), `arbustos_quatro`, `brotos_grama`, `arbusto_trevo`, `moita_rosa_dupla`, `arbusto_laranja` (9,0 / 8,9), `flor_branca_grande`, `flor_laranja`, `broto`, `planta_grande` (estilo); `tronco_caido`, `toco_oco`, `toco_grande`, `toco_buraco` (madeira, melhorado).

**P1, construções (4)**: `cerca_troncos`, `casa_verde` (madeira), `ponte_pedra` (a ponte do castelo, pedra no cinza), melhorado; `casa_sebe` (estilo: o verde é a sebe, não pedra).

**P1, objetos (15)**: `estaca_madeira`, `placa_larga`, `estaca_redonda` (madeira), `estatua_gargula`, `pedra_grande`, `pedra_grande_escura`, `pedras_quatro`, `cascalho`, `buraco_pedra` (pedra no cinza), `cata_vento_quadros` (os três quadros da animação), melhorado; `pote_vermelho`, `bau_grande`, `bau_pequeno`, `buraco`, `monte_terra` (estilo). Todos 10 / 10, menos o cata-vento (9,1 / 1,0, ver 8.5).

**P2, terreno (14)**: listas das bordas, porque nas regiões o Wang de cantos saía com 10 a 14 peças faltando (as transições não caem nos quadrantes de 8 px): `pantano_grama_alta`, `agua_funda_rasa` (Lago Hylia), `castelo_piso` (estilo); `deserto_penhasco`, `montanha_penhasco`, `trevas_caminho`, `trevas_floresta_chao`, `trevas_pantano`, `trevas_chao_desenho`, `monte_aneis`, `entrada_caverna`, `entrada_caverna_viga`, `entrada_caverna_telhado`, `escada_madeira_penhasco` (original: a arte da equipe não tem as cores do deserto, da montanha nem das Terras sombrias).

**P2, vegetação (8)**: `cacto` e `planta_seca_deserto` (Deserto), `arbusto_seco`, `flor_roxa_trevas`, `arvore_roxa`, `arvore_manchada`, `arvore_trevas`, `arvore_rosa_trevas` (estilo).

**P2, construções (8)**: `tenda`, `ponte_corda` (o céu entre as tábuas tirado), `entrada_mina` (madeira, melhorado); `casa_trevas_caveira`, `casa_trevas`, `escada_pedra`, `portao_castelo`, `estatua_deserto` (estilo).

**P2, objetos (12)**: `rocha_menta_grande`, `estatua_coruja`, `postes_pedra` (pedra), `estaca_agua` (madeira), melhorado; `pedra_caveira`, `pedra_inscrita`, `estatuas_dragao`, `estatua_vila_trevas`, `pedra_montanha`, `ossada`, `costelas`, `caveira_pedra` (estilo).

### 8.4 Degraus do penhasco

`penhasco_degraus_conjunto`: cinco pedaços do barranco de Kakariko, com a mesma linha de base e grama completando em cima: ponta esquerda (sobe na diagonal, 4×5 tiles), meio (2×3), escada (3×3), meio depois da escada (2×3) e ponta direita (sobe na diagonal, 6×8). `_montagem_original.png` e `_montagem_melhorado.png` montam ponta, meio, meio, escada, meio, meio, ponta: a emenda fecha sem costura. **Não é Wang nem blob**: o degrau do ALttP tem frente e costas (só se pula para baixo), então não vale girado nem espelhado, e o anel da gablaxian (002) não está na grade de 16 px. As fontes não têm degrau virado para os lados nem para cima, nem canto de dentro.

### 8.5 Mão da equipe

1. **Copas de anéis** também em `arvore_roxa`, `arvore_manchada`, `arvore_trevas`, `arvore_rosa_trevas` (linha 2,6 a 5,8 nas três primeiras): usar forma e tamanho, redesenhar a copa em tufos.
2. `cata_vento_quadros`: a grama embaixo do pedestal veio junto nos três quadros (a peça está sobre a grama na folha) e derruba a nota de linha (1,0); no melhorado ela ficou cinza junto com a pedra. Tirar a grama à mão.
3. `sebe_cercado`: linha 5,7 porque a limpeza lê o pontilhado claro da sebe como serrilhado; conferir à mão.
4. `pedra_caveira`: o quadrado de terra atrás das caveiras faz parte da peça; tirar se for objeto solto.
5. `praca_lajotas`: a borda de pedrinhas é solta; decidir se vira conjunto de bordas (como a calçada, seção 5.4).
6. **Cores dos biomas P2**: deserto, montanha e Terras sombrias seguem no original até a equipe ter as cores (seção 5.6).
7. Os conjuntos das regiões são listas, não Wang: a equipe monta as bordas, como em `penhasco_degraus`.
