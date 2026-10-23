# Reino de Haywood (2026-10-23)

O reino do sul, entre o Mar Sereno e o South Sea: campos e floresta temperada, capital Haywood, cidades Moinhos, Ribeira e Carvalhal, distritos D01 a D05. É onde o jogador começa (decisão: a fazenda inicial fica aqui, não na casa de teste v2) e o P1 do plano de assets. Visão geral do mundo, arquitetura e fases em [`../MAPA_MUNDO.md`](../MAPA_MUNDO.md).

Esboços (em `Documents\Haywood-Valley-recuperado\mundo\`): `esboco_reino_haywood_v1.png` (o reino com os lugares numerados como na §3), `esboco_haywood_v1.png` (a fase 1 em blocos) e `esboco_haywood_maquete_v1.png` (o miolo da fase 1 em tamanho real, com os assets refeitos).

## 1. Escala e recorte

| Medida | Valor |
|---|---|
| Área | 22,8 setores = campos 12,2 + floresta temperada 10,6 (medido no mapa dos biomas) = 93.560 blocos |
| Onde | setores F a K, linhas 8 a 13; blocos x 324 a 676, y 467 a 821 |
| Travessia | 59,1 min a pé no plano (29,5 min a 10 tiles/s) |
| Lotes | 60 em 5 distritos: D01 (16), D02 (12), D03 (12), D04 (12), D05 (8) |
| Cidades | a capital (54 blocos de lado), 3 cidades do reino (31), 7 vilas (13) |
| Fronteiras | norte: Mar Sereno (Lume Cove, Wizard's Point); sul: South Sea (Lume Delta); oeste: Terracota, nas Golden Hills; leste: o pântano de Brumário, no Clear Creek; nordeste: Verdália, na Roça do Cacau |

**O primeiro pedaço jogável (fase 1)** é a **Ribeira leste com os 4 primeiros lotes do D03**: 12 × 9 blocos (768 × 576 tiles), do bloco (471, 762) ao (482, 770), nos setores H12 e H13. Por quê:

- **O lugar**. O plano põe o D03 encostado na Ribeira ("Ribeira at 2.6 min"), com o rio Lume correndo entre a cidade e o distrito e a estrada do leste cruzando o rio numa ponte: fazenda, cidade, estrada, rio e pontes num canto só. A Ribeira é uma cidade do reino (31 blocos), não a capital (54, com o castelo), e fica a um passo do mar, então a fase 2 já chega à costa com o mar, a areia e a espuma que o jogo tem (o que o usuário gostou da ilha). Moinhos e o D02 seriam a outra opção, mas lá o rio atravessa o meio da cidade, longe do distrito.
- **O tamanho**. Um setor tem 64 × 64 blocos; 2 × 2 setores seriam 16.384 blocos, mais que o Haywood inteiro dá para pintar. A fase 1 tem 108 blocos, dos quais uns 15 são autorais (6 quadras da cidade, o rio com as pontes, o centro do distrito, a parada e o miolo da fazenda, que é um modelo repetido nos 4 lotes); o resto é gerado (grama, capim, bosquetes, o mato dentro dos lotes).
- **O desempenho**. O cliente monta só os blocos que tocam a vista (até 3 × 3 no zoom máximo). Medido no esboço (`tools/mundo_mapa.py tabela`): com o capim como decalque e as quadras assadas, o pior 3 × 3 da fase 1 dá **1.608 imagens e 95 cartões**, dentro do alvo (2.500 e 400). Sem essas duas medidas, 3.287 imagens: estoura. Ver `MAPA_MUNDO.md` §3.3.
- **O jogo**. 4 lotes = 4 vagas = servidores de 4 jogadores na fase 1. Do portão da fazenda A ao Largo do Rio são uns 300 tiles (30 s a 10 tiles/s): a cidade é perto como em Hay Day, e cada lote tem 256 × 256 de mato para crescer.

## 2. O reino inteiro

### Geografia

O eixo é o **vale do Lume**: o rio nasce perto da capital, desce pelo meio dos campos até Moinhos, abre no Mirror Lake e chega ao mar na Ribeira, no Lume Delta. A oeste do vale, campos abertos com bosquetes até as Golden Hills, na fronteira com a savana de Terracota. A leste, da coluna I à K, a floresta temperada: mata fechada com clareiras (Deer Glade), a Grandmother Oak, a mata assombrada (Lantern Woods), o cemitério (Lily Cemetery) e, no fim, o Clear Creek, fronteira com o pântano. A costa norte é o Mar Sereno: Lume Cove (o porto da capital), Aurora Lookout (o portal para a Twilight Isle) e Wizard's Point.

### Relevo (como o ALttP usa os penhascos)

No ALttP o penhasco guia o caminho e emoldura cada área; aqui ele faz o mesmo na escala do plano:

- O Lume corre entre **terraços de um degrau** de Haywood a Moinhos (como o rio que contorna o castelo), com escadas nas pontes e nos vaus.
- **Beech Plateau**: um planalto a leste do Mirror Lake, com escadas (como o planalto do Palácio do Leste), que se vê de longe.
- As **Golden Hills**: degraus dourados na fronteira oeste (os degraus do Deserto da Miragem, recoloridos).
- A **capital no alto**: o castelo num promontório sobre a Lume Cove, a cidade embaixo.
- A **borda da floresta** como parede, com entradas em túnel (como a Floresta Perdida); dentro dela, clareiras ligadas por trilhas.
- Marcos que se veem por cima de tudo: as torres do castelo, o Great Mill, a Grandmother Oak, a Old Wizard's Tower e a Crows' Tower.

### Estradas e linhas

| Ligação | O que tem no caminho (plano) |
|---|---|
| Haywood (Portão Sul) → Moinhos (Portão Norte), estrada principal, 17 min | ruína ou santuário (1,5 min), ponte ou vau (3), **Four Winds Inn** no cruzamento (4,7), moinho pequeno (6,3), parada com espantalho, barracas e fogueira (7,8), ruína (9,4), **Clover Inn** (11), poço ou fonte (12,6), parada (14,2), recurso para coletar (15,8) |
| Moinhos → Ribeira | estrada principal ao longo do Lume, com pousada no meio e o desvio para o Cais do Anzol |
| Haywood → Arraial do Mirante → Porto Rubro | a oeste, pela costa; a Brasa Line corre junto |
| Haywood → Sítio dos Pomares → Carvalhal → Povoado da Lamparina → Fog Inn → Brumário | a leste, com a Marsh Branch (trem) junto |
| Carvalhal → Capão das Colmeias → Deer Glade | a estrada da floresta, para o sul |
| Ribeira → estrada do Leste → D03 → floresta | a da fase 1 |
| Moinhos → Porteira → Pouso do Baobá | para Terracota |
| Lume Barges | barcaças pelo Lume, Haywood → Ribeira |
| Brasa Line | o laço do Mar Sereno passa pela capital (Porto Rubro a oeste, Roça do Cacau e Ferradura a leste); Sun Branch para Mesa Alta |

### As cidades

- **Haywood (capital, 54 blocos)**: o castelo no promontório da Lume Cove (o Castelo de Hyrule: fosso, jardins, pátio; uns 6 × 6 blocos), a cidade ao sul em quadras de Kakariko ao longo de uma avenida do portão do castelo ao Portão Sul, o porto na enseada, a estação da Brasa Line a nordeste, o D01 encostado a leste. Fase 3.
- **Moinhos (31)**: o Lume atravessa a cidade de noroeste a sudeste; rodas d'água ao longo do rio e moinhos de vento nos campos do oeste; a praça do cata-vento de Kakariko vira a praça do moinho. O D02 encosta a oeste; Portão Norte para a capital, estrada sul para a Ribeira, estrada leste para o Cais do Anzol. Fase 2.
- **Ribeira (31)**: cidade de rio e de mar; o Lume entra pelo canto nordeste e desce até o porto no sul (cais, mercado de peixe, estaleiro, o terminal das Lume Barges). O D03 encosta a leste. Fase 1 (canto nordeste) e 2 (o resto).
- **Carvalhal (31)**: cidade de madeireiros na borda da mata, casas entre carvalhos, serraria, a Covered Bridge a leste; o D04 ao sul. Fase 4.
- **Vilas (13 blocos)**: uma ou duas quadras com hortas e a sua especialidade: Pouso do Feno (feno e cavalos), Porteira (a porteira da estrada para Terracota), Sítio dos Pomares (pomares), Cais do Anzol (pesca no Mirror Lake), Arraial do Mirante (o mirante e o portal), Capão das Colmeias (mel; o D05), Povoado da Lamparina (lanternas, na borda da mata assombrada).

## 3. Lugares

O número é o do `esboco_reino_haywood_v1.png`. O bloco é o do centro do ícone no plano (1 bloco = 64 tiles; 1 px do plano = meio bloco). A Roça do Cacau fica do lado de Verdália pelo mapa dos biomas (ver `verdalia.md`).

| Nº | Lugar | Tipo | Setor | Bloco (x, y) | Fase | Base do ALttP |
|---|---|---|---|---|---|---|
| 1 | Haywood | capital | G9 | 416, 554 | 3 | Castelo de Hyrule (LW) no alto, cidade em quadras de Kakariko, porto na Lume Cove |
| 2 | Moinhos | cidade do reino | G11 | 428, 669 | 2 | Kakariko (LW): praça do cata-vento vira o Moinho Grande; o rio atravessa |
| 3 | Ribeira | cidade do reino | H13 | 457, 778 | 2 | Kakariko (LW) + foz do rio no Lago Hylia (LW); porto no mar |
| 4 | Carvalhal | cidade do reino | I10 | 564, 604 | 4 | casas na mata da Floresta Perdida (LW) + Kakariko norte |
| 5 | Porteira | vila | F11 | 369, 659 | 2 | Kakariko em miniatura / casa do Link (LW) |
| 6 | Cais do Anzol | vila | H11 | 496, 679 | 2 | casa à beira do Lago Hylia (LW) |
| 7 | Arraial do Mirante | vila | F9 | 342, 535 | 3 | Kakariko em miniatura / casa do Link (LW) |
| 8 | Sítio dos Pomares | vila | H10 | 491, 602 | 3 | pomares das casas ao sul de Kakariko (LW) |
| 9 | Pouso do Feno | vila | G10 | 384, 615 | 3 | casa do Link com a horta (LW) |
| 10 | Povoado da Lamparina | vila | J9 | 633, 561 | 4 | Kakariko em miniatura / casa do Link (LW) |
| 11 | Capão das Colmeias | vila | J11 | 620, 698 | 4 | Kakariko em miniatura / casa do Link (LW) |
| 12 | D03 Ribeira District (12 lotes) | distrito de fazenda | H13 | 485, 773 | 1 | sem base (Hay Day); sebes e cercas de Kakariko |
| 13 | D02 Moinhos District (12 lotes) | distrito de fazenda | G11 | 400, 668 | 2 | sem base (Hay Day); sebes e cercas de Kakariko |
| 14 | D01 Scarecrow District (16 lotes) | distrito de fazenda | H9 | 458, 553 | 3 | sem base (Hay Day); sebes e cercas de Kakariko |
| 15 | D04 Carvalhal District (12 lotes) | distrito de fazenda | I10 | 563, 630 | 4 | sem base (Hay Day); sebes e cercas de Kakariko |
| 16 | D05 Beehives District (8 lotes) | distrito de fazenda | J11 | 636, 698 | 4 | sem base (Hay Day); sebes e cercas de Kakariko |
| 17 | Great Mill | lugar | G10 | 431, 625 | 2 | ferraria de Kakariko (LW), com roda d'água |
| 18 | Clover Inn | pousada | G10 | 413, 628 | 2 | taverna de Kakariko (LW) |
| 19 | Old Fort | ruína | G10 | 409, 638 | 2 | ruínas do Palácio do Leste (LW) |
| 20 | Beech Plateau | lugar | I11 | 518, 679 | 2 | planalto do Palácio do Leste (LW), com escadas |
| 21 | Fox Den | toca | I11 | 550, 688 | 2 | boca de caverna nos penhascos (LW) |
| 22 | Mirror Lake | lago de pesca | H12 | 493, 705 | 2 | Lago Hylia (LW) |
| 23 | Lume Delta | lugar | H13 | 496, 814 | 2 | Grande Pântano (LW), em delta |
| 24 | Lume Cove | lugar | G8 | 411, 505 | 3 | praia do Lago Hylia (LW) |
| 25 | Aurora Lookout | portal | F9 | 339, 524 | 3 | Spectacle Rock e o círculo de pedras do portal (LW) |
| 26 | Crows' Tower | covil de chefe | F10 | 366, 577 | 3 | Torre de Agahnim (LW), em ruína |
| 27 | Fairground | feira | H10 | 474, 585 | 3 | galeria de tiro e jogo de cavar (LW/DW) |
| 28 | Crows' Den | toca | G10 | 398, 592 | 3 | boca de caverna nos penhascos (LW) |
| 29 | Four Winds Inn | pousada | G10 | 400, 602 | 3 | taverna de Kakariko (LW) |
| 30 | Wizard's Point | lugar | I8 | 544, 455 | 4 | — |
| 31 | Old Wizard's Tower | ruína | I8 | 559, 486 | 4 | Torre de Hera (LW) |
| 32 | Fog Inn | pousada | K10 | 664, 583 | 4 | taverna de Kakariko (LW) na névoa do Bosque das Caveiras (DW) |
| 33 | Lantern Woods | mata assombrada | J10 | 616, 585 | 4 | Bosque das Caveiras (DW) |
| 34 | Covered Bridge | ponte | J10 | 619, 604 | 4 | pontes do rio do castelo (LW) |
| 35 | Lily Cemetery | cemitério | K10 | 651, 614 | 4 | cemitério do Santuário (LW) |
| 36 | Grandmother Oak | árvore gigante | J11 | 595, 643 | 4 | Bosque Sagrado da Floresta Perdida (LW) |
| 37 | Clear Creek | rio | K11 | 669, 653 | 4 | rio do Domínio Zora (LW) |
| 38 | Deer Glade | lugar | I12 | 574, 727 | 4 | Bosque Assombrado do menino da flauta (LW), sem assombro |
| 39 | Boar King's Den | covil de chefe | J12 | 605, 747 | 4 | caverna nos penhascos da Floresta Perdida (LW) |

## 4. Fase 1: Ribeira leste e o D03

### 4.1 Onde e o que muda do plano

Blocos do mundo (471, 762) a (482, 770); o canto (0, 0) da fase é o tile (30.144, 48.768). Em coordenadas locais (as do esboço), `bx` 0–11 e `by` 0–8; bloco do mundo = (471 + bx, 762 + by).

O que se mexeu para caber: a ponte da estrada do leste, que no plano fica uns 11 blocos ao norte da cidade, desceu para a primeira linha de blocos; o rio corre colado ao muro leste da cidade e entra nela pelo canto nordeste (no plano ele entra pelo canto e desce por dentro, como aqui). A 1 px = 32 tiles o plano é um esquema; a ordem das coisas (cidade, rio, ponte, centro do distrito, lotes) é a dele.

### 4.2 Bloco a bloco

| Blocos (bx, by) | O que tem | Autoral ou gerado |
|---|---|---|
| (0, 0) | **Alto do Mirante**: planalto de um degrau, escada, mirante em cima; a estrada de Moinhos chega ao Portão Norte | autoral |
| (1, 0) | estrada de Moinhos, o muro e o **Portão Norte** | autoral |
| (2, 0) | **Ponte do Lume** (madeira) na estrada do Leste | autoral |
| (3, 0) | a **parada da estrada**: barraca, fogueira, espantalho, banco, placa (o "stop" do plano) | modelo `parada` |
| (4–8, 0) | campo, capim, bosquetes, o morro, a lagoa com penhasco em anel; a estrada do Leste | gerado (morro e lagoa: decalques) |
| (9–11, 0) | **Bosque do Lume**: borda de mata | gerado |
| (0–1, 1–3) | **Ribeira, canto nordeste**: 6 quadras de Kakariko (lotes de 18 × 18 com sebe, casa e horta), a **Pousada da Ribeira**, a loja, o mercado, o **Largo do Rio** (barracas, cata-vento, poço, bancos, canteiros), o cais, o **Portão Leste** | modelos `quadra_*` (assados) |
| (0–1, 4–8) | o resto da Ribeira: na fase 1, tapumes e muro ("em obras"), sem passagem | fase 2 |
| (2, 1–4) | o rio Lume, a **parada do barco** (Lume Barges), a **Ponte do Portão** na avenida | autoral |
| (3, 1–4) | o **centro do distrito D03**: caixa de venda, quadro de pedidos, galpão, poço, bebedouro, espantalho, carroça de feno, placa; a ligação com a estrada do Leste | modelo `centro_distrito` |
| (2–3, 5–8) | margem do rio, bosquetes | gerado |
| (4–7, 1–4) | **lote A** | ver abaixo |
| (8–11, 1–4) | **lote B** | idem |
| (4–7, 5–8) | **lote C** | idem |
| (8–11, 5–8) | **lote D** | idem |

Cada lote (4 × 4 blocos): sebe na borda de fora, avenida de 6 tiles na margem que encosta nos outros lotes (a E-O entre as fileiras, a N-S entre as colunas), placa e portão na avenida, trilha de 3 tiles até a cerca. No meio, a **fazenda inicial** de 64 × 64 (um modelo, `miolo_fazenda`): cerca, casa da fazenda (a porta leva à casa do jogador, o interior de hoje como cópia por dono), celeiro, galinheiro, três canteiros de terra arada, espantalho. A cerca máxima (192 × 192) fica marcada só no esboço. Fora da cerca, o mato gerado: bosquetes, pedras, arbustos, tocos, flores; o jogador limpa para crescer.

**Limites da fatia**: bloqueio invisível na borda da janela, disfarçado pela borda de mata ao norte e a leste e pelas sebes dos lotes; ao sul da cidade, tapumes. O mar fica para a fase 2.

### 4.3 Assets por bloco

| Onde | Já existe (refeito ou da equipe) | A criar |
|---|---|---|
| Todo bloco | grama (`grama_variacoes`), terra (`grama_terra`, equipe `terreno_grama_sobre_terra`), capim (tufos da `grama_variacoes`, como decalque) | textura de base 1024 × 1024 de grama e de terra; capim, flores e tufos como folha de decalques |
| Alto do Mirante (0, 0) | `penhasco_degraus`, `penhasco_morro_anel` | **penhasco em autotile** (bordas, cantos, face, sombra), escada no penhasco, mirante |
| Portões e muro (1, 0), (1, 1–3) | `portal_madeira`, `sebe_horizontal`/`vertical` | muro baixo da cidade, tapume de obra |
| Ponte do Lume, Ponte do Portão, rio (2, *) | `ponte_madeira`, `agua_grama`, `agua_penhasco` | água de rio em 4 quadros (canvas de baixo) e margens com a água transparente; píer da parada do barco |
| Parada (3, 0) | `banco_madeira`, `placa` | barraca, fogueira, espantalho |
| Quadras da Ribeira (0–1, 1–3) | casas (`casa_vermelha`, `casa_azul`, `casa_azul_media`, `casa_azul_grande`, `casa_madeira`, `casa_vermelha_loja`), `sebe_*`, `canteiro_flores_rosa`, `arvore_pequena(_rosa)`, `grama_calcada`, `cata_vento_praca`, `poco_pedra`, `banco_pedra`, `canteiro_potes` | barracas de feira, cais de pedra, ponte de pedra (Ponte da Rua), calçada como textura de base; variações de quadra (Kakariko tem casas de tamanhos e quintais diferentes) |
| Centro do distrito (3, 2) | `galpao_madeira`, `poco_madeira`, `bebedouro`, `placa`, `arvore_grande`, `banco_madeira` | **caixa de venda**, **quadro de pedidos**, espantalho, carroça de feno |
| Lotes (4–11, 1–8) | `cerca_estacas`, `cerca_pecas`, `sebe_*`, `arvore_grande`, `arvore_pequena`, `moita_grande`, `moita_cruz`, `arbusto`, `toco`, `pedra_leve`, `flores_brancas` | **celeiro**, **galinheiro**, **casa da fazenda** (por fora), terra arada (conjunto), culturas por fase, espantalho |
| Bosque do Lume (9–11, 0) | `mata_copa`, `mata_bloco` | borda de mata em autotile (copa sobre grama) |
| Morro e lagoa (4–8, 0) | `penhasco_morro_anel`, `lago_penhasco_anel` | — |

Os que faltam e não existem no ALttP (celeiro, galinheiro, casa da fazenda, caixa de venda, quadro de pedidos, espantalho, carroça, barraca, fogueira) vão pelo Spriteloom (`tools/spriteloom.py`), depois `tools/estilo_aeko_arte.py` (aeko+equipe, nota mínima 8) e a limpeza de linhas.

### 4.4 Como montar

1. **Fase 0 antes** (`MAPA_MUNDO.md` §3): o mapa `mundo` em blocos com streaming, o gerador de blocos a partir do plano, os conjuntos da equipe no gerador (`wang16_4x6`), a base em textura grande, a camada da fazenda.
2. **Plano em dados**: `tools/mundo_mapa.py` grava, além dos esboços, o módulo do plano para `src/shared/world/` (biomas, reinos, polilinhas, lugares) **(a fazer)**; o rio, as estradas e a avenida da fase 1 saem como polilinhas.
3. **Modelos no Diorama** (um bloco cada, três camadas chão/objeto/frente e o `exterior`): `quadra_casas_a`, `quadra_casas_b`, `quadra_pousada`, `quadra_largo_rio`, `quadra_cais`, `centro_distrito`, `parada`, `miolo_fazenda`. As quadras e o rio são assados (uma imagem por modelo).
4. **Blocos autorais** em `diorama/mapas/mundo/blocos/<bx>_<by>.json`: (471, 762) Alto do Mirante, (472, 762) Portão Norte, (473, 762–766) rio e pontes, e onde cada modelo vai (o gerador põe os modelos pelas posições do plano).
5. **Gerar e testar**: `npm run diorama:jogo -- mundo`, o atributo `InteriorTeste` = `mundo` com `InteriorTesteCelula` no portão do lote A; ler o Output e o `DevPanel` (imagens, cartões, tempo por quadro) no pior ponto (o Largo do Rio no zoom máximo).
6. **Envio** (só com o OK do usuário): a lista da fase 1 está em `MAPA_MUNDO.md` §9.

## 5. Fases 2 a 4

| Fase | Entra | Autoral | Gerado |
|---|---|---|---|
| 2 | Ribeira inteira (porto, mercado de peixe, estaleiro, Lume Delta), D03 (12 lotes), Moinhos e D02, o Lume até o Mirror Lake e o Cais do Anzol, Beech Plateau, Fox Den, Old Fort, Great Mill, Clover Inn, Porteira, a estrada Moinhos–Ribeira, as Golden Hills | quadras das duas cidades, porto, moinhos e rodas d'água, Old Fort, Great Mill, o planalto, a pousada | campos do vale, terraços do Lume, bosquetes |
| 3 | Haywood (castelo, cidade, porto, estação), D01, a estrada dos Quatro Ventos inteira (Four Winds Inn, paradas, pontos), Pouso do Feno, Sítio dos Pomares, Fairground, Crows' Den e Crows' Tower, Arraial do Mirante, Aurora Lookout (portal fechado), Lume Cove | castelo, quadras da capital, feira, torre, mirante | campos do norte, costa |
| 4 | Carvalhal e D04, Capão das Colmeias e D05, Povoado da Lamparina, Lantern Woods, Covered Bridge, Lily Cemetery, Fog Inn, Grandmother Oak, Deer Glade, Boar King's Den, Old Wizard's Tower, Wizard's Point, Clear Creek | cidade na mata, colmeias, cemitério, ponte coberta, os covis, a árvore gigante | a floresta (copa, trilhas, clareiras) |

Com a fase 4 o reino fica completo: 60 lotes, servidores de até 60 vagas (o tamanho real do servidor é decisão do usuário).

## 6. O que falta para o reino inteiro

Além do da fase 1: margem de lago e delta (água rasa, juncos), terraços de rio, castelo (muralha, torres, fosso, portão, jardim), igreja e cemitério, porto (cais, barcos, estaleiro), moinho de vento grande e roda d'água, estação de trem, ponte coberta, colmeias, pomar (árvores de fruta), feira (barracas, bandeirolas), torre em ruína, entradas de caverna em dois tamanhos, a mata assombrada (a mesma mata recolorida, com névoa e lanternas), a Grandmother Oak (árvore gigante, peça única), as versões por estação da grama e das árvores (recolorir).
