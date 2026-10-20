# Etapa G do Diorama: folhas e recortes (reconstruída em 2026-10-20)

O que o usuário disse em 2026-10-20: "Vinha a G, que arrumava as folhas e recortes: o sofá veio com a parte do
fundo e do chão, e a G era a fase que ia arrumar isso e permitir recolorir o sofá sem perder a textura, entre
outros." O resto do conteúdo da G se perdeu com a formatação; o que segue é a reconstrução, feita com o usuário
fora. Decisões minhas e palpites estão marcados **(palpite)**.

Em uma frase: `tools/recortes.py` tira cada peça das folhas do Aeko do fundo, pixel a pixel, e separa a peça em
partes pintáveis com uma máscara em cinza por parte, no mesmo esquema das peças do Graal (`shared/graal.ts`).
No jogo (2026-10-20), o Decorar já pinta as peças com recorte (seção "No jogo", no fim). Nada foi enviado ao
Roblox: a folha `recortes.0` está sem id, à espera do aval do usuário. Nada em `plugin/` mudou.

## Como rodar

Na raiz, com o Python que tem pillow e numpy (`C:\Users\Szortek\AppData\Local\Programs\Python\Python312\python.exe`):

```
python -I tools/recortes.py                 tudo (uns 3 minutos): recortes, máscaras, prévias, recortes.json, pecas.json
python -I tools/recortes.py chair casa42    só essas peças (não regrava recortes.json nem pecas.json)
python -I tools/recortes.py --validar       só a conferência com o gabarito
python -I tools/recortes.py --evolucao      a tabela de evolução abaixo
python -I tools/recortes.py --sintetico     a validação sintética
python -I tools/recortes.py --montar        a folha montada (assets/recortes/recortes_0.png) e src/shared/recortes.ts
```

Opções: `--sem-catalogo` (não grava `pecas.json`), `--sem-previas`. Depois de rodar, `npm run diorama:jogo -- --decorar --conferir` continua dizendo "igual": o campo novo não entra no `decorCatalog.ts`, e `node plugin/teste/ciclos.mjs` continua gravando `pecas.json` byte a byte igual.

## O que sai

| Caminho | O que é |
|---|---|
| `diorama/recortes/<folha>/<id>.png` | O recorte RGBA da peça, transparente fora dela, com **1 pixel de folga** em volta da área (como `acoes.carregaveis`): o canto do recorte fica em (coluna × 16 − 1, linha × 16 − 1) da folha. Ids com `@` e `,` viram `_` no nome (`casa@45,20` → `casa_45_20.png`). |
| `diorama/recortes/<folha>/<id>/base.png` | A peça inteira nas cores originais (igual ao recorte; fica ao lado das máscaras, como no Graal). |
| `diorama/recortes/<folha>/<id>/parte_<n>.png` | A máscara da parte `n`: cinza onde é a parte (branco = a cor escolhida cheia, cinza = a sombra), transparente fora. |
| `diorama/recortes/recortes.json` | Por peça: área, arquivo, tamanho, método, fundo casado (textura, deslocamento, pixels), células sem fundo, `borda_aberta`, `pixels_peca`, `confianca`, `incertos` (e até 48 coordenadas), notas, partes (n, pintável, pixels, cor média, tom de referência, rampa, matiz, arquivo, erro de volta em ΔE). Mais o método usado, o gabarito, a evolução e a validação sintética. |
| `diorama/recortes/extras.json` | Peças que não estão em `pecas.json` mas entram no recorte: os dois sofás (abaixo). |
| `diorama/catalogo/pecas.json` | Campo novo `recorte` em cada peça recortada: `{ arquivo, folga, base, partes: [{ n, arquivo, referencia, cor_media, pixels }] }`. Nenhum outro campo mudou (conferido carregando as duas versões e tirando o campo). |
| `estudo/recortes/<id>.png` | A prévia de conferência, 4×: original da folha, recortado, incertos (em magenta), cada máscara, e três recolorações da parte maior (azul, verde, vinho). |
| `assets/recortes/recortes_<n>.png` | A folha montada (`--montar`): base e máscaras de cada peça, chave `recortes.<n>` no registro, **sem id** (não enviada). |
| `src/shared/recortes.ts` | Gerado pelo `--montar`: onde estão a base e as máscaras de cada recorte na folha, a cor original de cada parte e, por peça do Decorar, o recorte de cada direção e variante. |
| `estudo/recortes/montada/recortes.json` | O mapa da folha montada, por id de peça (fora do git, `--montar`). |
| `tools/recortes.py`, `tools/recortes_lib/` | O comando; `folhas.py` (folhas, texturas de fundo, zonas), `recorte.py` (o recorte), `partes.py` (partes e máscaras), `previa.py`, `validar.py` (o gabarito). |

**Peças recortadas: 42.** As 40 de `pecas.json` que não são piso (todas menos o `rug`, que é tapete: móveis, camas, baús, o fogão, as luzes, as janelas, o quadro, a tocha e o abajur) e os 2 sofás de `extras.json`. Ids diferentes com a mesma área (`chair` e `casa8`, `bed` e `casa@4,24`, `pot` e `casa42`, `window` e `casa@40,25`, `casa46` e `casa@45,20`…) saem iguais; o json marca `mesma_area_que`.

**Os sofás (palpite).** O sofá que o usuário citou não está no catálogo. Pus dois em `extras.json`: `sofa`, a área `casa` [10–15, 20–21] que `SEAT_FACING` chama de sofá (ESPECIFICACAO.md), e `sofa_dourado`, `casa` [71–78, 30–31], o sofá dourado de frente, que é o que de fato vem com o piso atrás. No dourado, as células [72–77, 30] são de outras peças que o Aeko encaixou no vão (uma prateleira, um quadrado azul, cadeiras), então ficam de fora (`excluir`). Os dois saem em `diorama/recortes/casa/`. Quando o catálogo ganhar o sofá, é só passar a entrada de `extras.json` para `pecas.json`.

## O método do recorte

As folhas são opacas: o "transparente" das exportações do Aeko é um quadriculado cinza claro pintado. O Aeko desenhou cada peça por cima de um chão ou de uma parede, e esses fundos existem limpos em outro lugar da folha (os tipos de `fundos.json`). Então, numa célula da peça, é fundo o pixel igual ao do fundo que estava atrás; o resto é a peça. Passo a passo (`tools/recortes_lib/recorte.py`):

1. **Casar o fundo.** Cada tipo de fundo vira uma textura periódica: o retângulo dos tiles dele, com os tiles de fora marcados como inválidos (`taco` e `azul_escuro` têm tiles soltos: viram duas texturas). Para cada textura, conto os pixels iguais em todos os deslocamentos, **em pixels e não só em tiles** (o piso atrás do pote não começa no canto da textura). Ficam de fora: as texturas que têm tile dentro da própria peça (a estante vazia não é fundo da estante), o preto e os quase pretos (canal máximo abaixo de `2c`: o contorno da cadeira é `120606`, o da janela `2a1812`) e os **móveis vazios** de `fundos.json` (`estante_vazia`, `adega_vazia`, `prateleira_banheiro`, `agua_banheira`: são fundos para pôr coisas pequenas em cima no Decorar, nunca estão atrás de um móvel) **(palpite)**.
2. **O fundo chega à borda.** Só conta o pixel igual que se liga à borda da área (ou às células excluídas) por outros pixels iguais. Sem isso, a madeira da cadeira casava com a da estante e a cadeira sumia.
3. **Escolher por célula.** A célula fica com o casamento da peça inteira, a não ser que outro case com 4 pixels a mais (peça encostada na parede tem parede em cima e piso embaixo). Célula com menos de 8 pixels casados fica sem fundo (é toda peça).
4. **Classes de fundo por peça (palpite).** Cada textura é `piso` (zonas `chao`, `frente`, água) ou `parede` (o resto: papel, lambri, viga, pedra). As cadeiras (zona `senta`) só aceitam piso: o encosto da cadeira de lado é a mesma tábua da parede (`parede_tabuas`), pixel a pixel, e nenhuma regra de pixel separa os dois. As outras peças aceitam piso e parede. Uma peça de `extras.json` pode mandar com `fundos_atras`.
5. **Inundar.** O piso atrás da peça é feito das cores da textura mas nem sempre na mesma ordem (o Aeko recompôs as faixas: atrás do pote há `974818`, que não existe no piso limpo). A partir do que casou, o fundo se espalha pelos vizinhos com cor a até 8 por canal **das cores que casaram** (não da textura inteira: a madeira da moldura da janela também está no lambri, mas não atrás da janela), sem atravessar o contorno.
6. **Sombra do piso.** O pixel escuro colado no fundo com cor a até 24 da textura inteira (`67300c` no piso claro, `3c1e18` no escuro: a sombra que o Aeko pôs no piso junto da peça) também é fundo. Uma camada só.
7. **Quadriculado.** O quadriculado das exportações que chega à borda é fundo.
8. **Limpar.** Pedaços de até 4 pixels soltos da peça, nas cores do fundo, viram fundo; furos de fundo de até 6 pixels dentro da peça viram peça (cor igual por acaso). Furos de 7 a 24 pixels ficam transparentes e contam como incertos.
9. **Contorno por fora.** Onde um pixel da peça que não é contorno encosta no fundo e o fundo ali é escuro (abaixo de `70` no canal máximo), esse pixel do fundo vira o preto `010000`: o contorno passa por fora. É o que o gabarito fez à mão. (Pintar de preto a borda da peça, como a ferramenta do estilo do Aeko faz nas peças do Graal, foi testado e não é o que o gabarito faz.)
10. **Folga.** Onde a peça encosta na borda da área sem contorno (o pote encosta nas laterais do tile), o pixel de folga do lado de fora recebe o preto.

**Confiança** = 1 − incertos / pixels da peça; incertos são os pixels que a limpeza, a sombra e o contorno decidiram, não o casamento. **`borda_aberta`** = fração da borda da área que ficou na peça sem ser contorno: alta numa peça que não enche a área é sinal de fundo não reconhecido (ver limitações).

## Os números

**Gabarito** (`assets/acoes/carregaveis.png`, as peças que o jogo já recortou à mão, áreas de `CARRY_RECTS` em `client/world/pieces.ts`): **99,93 % dos pixels iguais** (2922 de 2924; igual = os dois transparentes, ou os dois opacos com a mesma cor), casa42 e casa43 100 %, casa67 99,67 %. Os 2 pixels que faltam são os cantos de cima do caixote: pretos na folha, transparentes no gabarito; um preto de quina não se distingue do contorno pela cor e deixei como está.

**Evolução** (`--evolucao`). O gabarito tem só 3 peças, todas no mesmo piso de madeira; acertar nele não bastou. A última coluna compara a silhueta de cada passo com a do recorte final (conferido a olho nas prévias das 42 peças), por área: mostra as peças que o gabarito não vê.

| passo | o que mudou | gabarito | casa42 | casa43 | casa67 | IoU com o final | peças longe do final (IoU < 0,9) |
|---|---|---|---|---|---|---|---|
| 1 | tile de fundo alinhado à grade, um para a peça inteira | 86,29 % | 86,4 | 81,7 | 94,8 | 0,851 | 19 |
| 2 | textura de fundo com deslocamento em pixels | 85,74 % | 86,4 | 81,7 | 92,2 | 0,853 | 17 |
| 3 | + escolha por célula | 85,74 % | 86,4 | 81,7 | 92,2 | 0,837 | 20 |
| 4 | + inundar pelas cores da textura (tolerância 12) | 97,09 % | 98,7 | 98,3 | 91,8 | 0,729 | 18 |
| 5 | + limpeza (ciscos e furos) | 97,71 % | 98,7 | 98,3 | 94,8 | 0,731 | 18 |
| 6 | + folga com contorno onde a peça encosta na borda | 99,42 % | 99,6 | 99,1 | 99,7 | 0,731 | 18 |
| 7 | + contorno por fora | 99,59 % | 100 | 99,1 | 99,7 | 0,764 | 16 |
| 8 | tolerância 20 (pega a sombra `3c1e18`) | 99,93 % | 100 | 100 | 99,7 | 0,746 | 16 |
| 9 | fundo ligado à borda, quase preto é contorno, inunda só pelas cores que casaram (tolerância 8), sem móveis vazios atrás, cadeira só no piso | 99,25 % | 99,1 | 99,1 | 99,7 | 0,994 | 0 |
| 10 | + sombra do piso colada no fundo (**final**) | **99,93 %** | 100 | 100 | 99,7 | 1 | 0 |

Até o passo 8 o gabarito subia enquanto as outras peças pioravam: com a paleta da textura inteira, a inundação comia a cadeira (madeira igual à da estante e da parede), o encosto das cadeiras de lado e a moldura da janela 2 (a mesma madeira do lambri). O passo 9 consertou isso e custou 0,7 ponto no gabarito (a sombra do piso deixou de ser fundo); o 10 devolveu os 0,7.

**Validação sintética** (`--sintetico`): cada peça recortada colada sobre três fundos conhecidos (casa: `tabua`, `xadrez_claro`, `papel_azul`; castelo: `laje_escura`, `marmore_losango`, `face_pedra`; só os que a classe da peça aceita), num deslocamento sorteado, e recortada de novo: **98 casos, 99,72 % dos pixels iguais em média, mínimo 93,8 %**. Os 11 casos abaixo de 99 % são todos fogo e luz (a tocha da casa, a do castelo sobre a pedra, a lareira, o abajur): o laranja e o amarelo do fogo encostam no fundo sem contorno. Isso mede se o método separa a peça de um fundo que ele conhece; não mede se o primeiro recorte estava certo.

**Partes**: 115 partes pintáveis nas 42 peças (de 0 no tile preto da lareira a 6 nas luzes e no quadro); pintar cada máscara com o tom de referência devolve a peça com **ΔE médio de 2,8** (o máximo, 19,7, é numa chama, onde a rampa gira do vermelho ao amarelo). O sofá de cima é uma parte só (tecido laranja e encosto marrom são a mesma rampa); o dourado tem 3 (o tecido dourado; uma faixa laranja-clara junto do vão das células excluídas, que pode ser resto de fundo **(palpite)**; e a madeira escura dos arabescos).

## As partes e as máscaras (palpite: não há gabarito)

`tools/recortes_lib/partes.py`. Uma parte é uma rampa num lugar: os tons do mesmo matiz que fazem o degradê de um material. O que o estudo do Aeko mediu (ESTUDO_AEKO.md, seção 1) guiou as regras: a sombra desce para o preto perdendo croma, quase sem girar o matiz.

1. Cada cor vira um ponto em Lab: matiz, croma e s = log(croma / (L + 10)), que fica parecido ao longo de uma rampa. Cores de croma abaixo de 7 são neutras (metal, branco). O contorno (quase preto) é a parte 0, fixa.
2. Distância entre cores: a corda entre os matizes no croma médio geométrico (o matiz pesa menos no escuro, e menos ainda abaixo de L 45, porque o Aeko gira o matiz da sombra mais escura: o roxo da coberta escurece para um vinho) e a diferença de s; neutras entre si só pela diferença de L (o metal do fogão é uma rampa só); tons que se encostam muito na peça ficam até 50 % mais perto.
3. Agrupamento por ligação simples (a rampa é uma corrente de tons vizinhos), até a distância passar de 1, com uma trava: dois grupos só se juntam se os tons claros deles combinam, a não ser que um seja só sombra (tom claro abaixo de L 35). Sem a trava, a corrente juntava a madeira do caixote com as maçãs. A ligação média ponderada, testada antes, separava a sombra lateral da coberta da cama.
4. Cada grupo se separa no espaço: pedaços distantes da mesma rampa viram partes diferentes (a moldura e o rosto do quadro são o mesmo laranja), a não ser que usem os tons na mesma proporção (as almofadas do sofá, separadas pelo contorno, continuam uma parte). Pedaços pequenos ficam com o grande mais perto.
5. Até 6 partes pintáveis por peça, cada uma com pelo menos 6 pixels e 2 % da peça; o resto fica na base, sem máscara (parte −1 no json).

A máscara: `ImageColor3` multiplica a imagem pela cor, então o cinza de cada pixel é quanto ele vale do tom de referência B da parte (o tom mais claro com pelo menos 5 % dos pixels): g = (p · B) / (B · B), em sRGB, cortado em [0, 1]. Pintar com B devolve o original (erro no json); pintar com outra cor mantém as sombras e a textura (o pontilhado, as tábuas, as costuras), porque só o tom muda. O que se perde é o giro de matiz da rampa (a sombra fica da mesma cor, mais escura) e o brilho acima de B (cortado no branco).

## Limitações e o que é palpite

- **Fundo que não está em `fundos.json` fica na peça.** O piso escuro entre os pés da cadeira (`chair`, `casa8`) e da mesa (`table`), os cantos azul-acinzentados do barril do castelo (`castelo68`, `919eaa`, que viraram até uma "parte" própria) e os cantos pretos do sofá de cima e do caixote. O `borda_aberta` do json aponta onde olhar (barril 1,0; sofá 0,95; mesa 0,92). Conserto: acrescentar esses pisos a `fundos.json` (mudar `fundos.json` muda o `decorCatalog.ts`, então é decisão do usuário) ou uma lista de cores de fundo por peça em `extras.json`.
- **A regra "cadeira só no piso"** é um palpite para um caso que os pixels não resolvem; vale para a zona `senta` inteira.
- **Luzes.** O fogo é recortado e ganha partes, mas recolorir chama não faz sentido; o plugin deveria marcar as luzes como não pintáveis (ou só a moldura). As tiras animadas (`casa@1,0`, 4 quadros) são recortadas como uma imagem; o jogo troca o quadro pelo deslocamento, então serve.
- **Partes demais ou de menos** em algumas peças: o quadro tem 6 (a madeira de cima é outra parte da madeira dos lados), as camas separam a cabeceira dos pés. O plugin deveria deixar juntar e separar partes à mão e guardar isso no catálogo.
- **Variantes do Decorar.** O recorte é da `area` da peça; as variantes do Decorar que apontam para outros tiles da folha (a cadeira sobre o xadrez, linhas 22–23) não são recortadas à parte. Com o recorte, elas deixam de ser necessárias (abaixo).
- **Os dois sofás** de `extras.json` (ids, áreas e as células excluídas do dourado) são leitura minha da folha.

## No jogo (feito em 2026-10-20)

**Folha montada e registro.** `python -I tools/recortes.py --montar` (depois de um `tools/recortes.py` completo, que grava `recortes.json`) monta as peças numa folha só: `assets/recortes/recortes_<n>.png`, de 1024 × 1024; cada peça vira um bloco com a base e, à direita, as máscaras, do mesmo tamanho, com 1 pixel entre elas; os blocos entram em prateleiras por altura; peças com a mesma área usam o mesmo bloco. Hoje tudo cabe em **uma folha, com 372 das 1024 linhas usadas**. Cortar cada máscara ao retângulo da parte economizaria metade da área das máscaras (49 %, medido), se um dia faltar. No registro, a chave é `recortes.0` (`tipo: imagem`, **`id: ""`**, origem `tools/recortes.py --montar`, nota de licença); `npm run assets` pôs a chave em `assets.ts` (e a lista `ASSET_LISTS.recortes`). Como `acoes.carregaveis`, é arte derivada do Aeko: **não foi enviada; precisa do aval do usuário**.

**`src/shared/recortes.ts`** (gerado pelo mesmo `--montar`, não editar): `RECORTES`, a lista dos recortes que o Decorar usa (`{ id, sheet, base: [x, y, w, h], parts: [[x, y, w, h], …], colors: [cor original de cada parte, 0xRRGGBB] }`), e `DECOR_RECORTES`, por peça do catálogo do Decorar, `{ parts, forms }`: o número de partes pintáveis e, por direção e variante do `decorCatalog.ts`, o índice do recorte (−1 = sem recorte, vão os tiles). A variante cujas células são a área de uma peça recortada usa esse recorte (o pote sobre o taco usa `casa43`; a janela amarela, `casa@62,24`; as cadeiras de lado, `casa9` e `casa11`); a que não é (a cadeira sobre o xadrez, que mistura linhas da folha) usa o de uma irmã do mesmo tamanho, porque o recorte não traz piso. Saem **8 peças pintáveis** (cadeira 1 parte, mesa 1, pote 2, quadro 6, janela 2, estante 4, cama 4, luminária 1) em 12 recortes. O tapete é piso e a tocha não casa com nenhuma área (a célula de baixo dela é a parede, `casa` 41,30): ficam como antes, sem cor. Quando `decorCatalog.ts` ou `recortes.json` mudarem, rodar o `--montar` de novo.

**A cena** (`client/world/pieces.ts`, `decorImages`). Com o recorte na variante, a peça posta (e a que segue o mouse) é a imagem da base, 1 pixel acima e à esquerda da célula (a folga), e, como filhas dela (no canvas `Sibling`, a filha vem por cima), a máscara de cada parte com cor escolhida, com `ImageColor3` = a cor; a parte na cor original não ganha máscara. O tom do dia (`tint.ts`) multiplica a cor de cada imagem como a de qualquer outra; a luminária fica fora do tom, como antes. Peça com tile animado não usa recorte. **Sem id em `recortes.0`**, a peça vai nos tiles como antes, sem as cores, e o Output avisa uma vez (`[Decor] a folha das peças recortadas ainda não tem id…`).

**O Decorar** (`DecorController`, `DecorHud`). Com uma peça pintável na mão, aparece o painel **Cor**, em cima do painel do Decorar, à direita: as partes (cada uma na cor que vai ter, com o número; tocar escolhe) e a paleta, a original primeiro (a cor da arte com um "x": tira a cor) e 9 cores tiradas das próprias peças do Aeko (`DECOR_PALETTE` em `shared/decor.ts`: vermelho, laranja, dourado, verde, turquesa, azul, lilás, marrom, cinza). No teclado, **V** passa à próxima parte e **C** à próxima cor. Recolhido (celular), a fileira ganha dois botões: a parte (tocar passa à próxima) e a cor dela (tocar passa à próxima). A cor escolhida vale para a próxima peça posta daquela peça do inventário (até sair do jogo). Clicar numa peça posta já a seleciona (pega para mudar de lugar): com ela na mão, mudar a cor pinta a peça posta na hora (`decorPaint`, no máximo a cada 0,25 s), sem precisar soltar.

**O servidor** (`DecorService`). `decorPlace` traz as cores e `decorPaint` (novo) pinta uma peça posta; o texto é o de `encodeColors` (`"c45b43,-,2cacb0"`, o `-` é a original, as originais do fim somem). `parseColors` recusa mais cores que as partes da peça (`decorParts`), texto maior que 7 letras por parte e cor que não seja 6 letras hexadecimais (0xRRGGBB); pedido recusado é ignorado. As cores vão a todos na casa (`decorChanged` ganhou o campo) e ficam no salvo.

**O salvo** (`PlayerData.decor`, DataStore `PlayerData_v1`, mesmo nome). `DECOR_SAVE_VERSION` passou de 1 a **2**: a peça é `"item forma x y cores"` (o campo das cores some quando a peça está toda na cor original, então uma peça sem cor sai igual à da versão 1). Lendo a 1, as peças vêm na cor original e a próxima gravação já grava a 2; nada se perde. Ao ler, cor estragada vira a original e parte a mais é esquecida, sem jogar a peça fora. `DECOR_MAX_TEXT` foi de 4000 a 8000: a peça mais longa, o quadro com as 6 partes pintadas, tem 58 letras com o `;`, e 120 peças dão 6959. Uma versão **mais nova** que a do servidor (um servidor velho ainda no ar depois de uma atualização futura) agora fica guardada como veio e volta intacta na gravação; a casa fica sem decoração e o Decorar recusa (`decor.refuse.newer`) até o jogador entrar num servidor novo. **Cuidado nesta atualização:** os servidores que ainda rodam o código de antes descartam a versão 2 (eles só aceitam a 1) e gravariam a decoração vazia por cima; ao publicar, fechar os servidores antigos (Shut Down All Servers ou Migrate To Latest Update) para nenhum jogador passar de um servidor novo para um velho.

**O que falta.**
- **Enviar `recortes.0`** (`assets/recortes/recortes_0.png`) com o aval do usuário e pôr o id no registro (`npm run assets -- --importar …` ou à mão, e `npm run assets`). Sem isso, as cores ficam salvas e conferidas, mas a cena desenha os tiles.
- Conferir no jogo: a folga de 1 pixel (a base alinhada com a célula), a ordem das máscaras sobre a base, o tom do dia nas máscaras e as cores da paleta em cada peça (a máscara corta no branco; uma cor mais clara que a referência perde o brilho).
- As luzes (a luminária) ainda se pintam; o plugin deveria marcar o que não se pinta (abaixo).
- As variantes por fundo do Decorar continuam valendo para as peças com recorte (a regra 12.14 decide onde a peça cabe); com o recorte, elas poderiam deixar de ser necessárias. As peças que se levantam (`CARRY_RECTS`) podem passar a usar o mesmo recorte: casa42 e casa43 saem iguais ao gabarito pixel a pixel, e o casa67 só difere nos 2 cantos.

**O plugin.** A ferramenta Catálogo mostra o recorte e as partes de cada peça, deixa juntar e separar partes, marcar uma parte como não pintável e acertar o fundo de uma peça que ficou com piso (gravando em campos novos de `pecas.json`, como `recorte`); o carimbo do editor de Mapas pode pôr a peça recortada com cores; a ferramenta Assets lista as folhas `recortes_<n>` como o que falta enviar.
