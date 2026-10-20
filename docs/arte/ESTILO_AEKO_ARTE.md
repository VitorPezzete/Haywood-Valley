# Arte nova nos estilos do jogo: aeko, equipe e aeko + equipe

`tools/estilo_aeko_arte.py`, refeito em 2026-10-20. A ferramenta que o usuário usava para fazer artes novas no estilo do
Aeko se perdeu na formatação; esta foi reconstruída a partir do que dá para medir nos gabaritos (o estudo está em
`ESTUDO_AEKO.md`, seções 1 a 3 para o Aeko e 6 para a equipe e a mistura). Ela pega **qualquer arte** (de outro
estilo, lisa, com degradê, com mais cores, sem contorno, ampliada) e devolve no estilo pedido, com uma nota de 0 a 10
de aderência a esse estilo; abaixo da nota mínima, ajusta e tenta de novo.

Não confundir com `tools/estilo_aeko.py`, que só recolore as peças do Graal (depende das máscaras de `graalData.ts`).

## Os três estilos

| estilo | gabarito (onde os números foram medidos) |
|---|---|
| `aeko` | as folhas do Aeko (`diorama/folhas/casa.png` e `castelo.png`) e as peças do Graal no estilo Aeko |
| `equipe` | a arte que a equipe fez sem a mão do Aeko: `Documents\Haywood-Valley-recuperado\aeko\referencia_estilo_equipe.png`, as duas imagens de árvores e as duas folhas de tiles de `Documents\Haywood-Valley-recuperado\equipe\` (fora do repositório; aqui só entram números e a paleta) |
| `aeko+equipe` | a mistura dos dois, com o peso `--mistura` (0 = só equipe, 1 = só Aeko; padrão 0,5) |

O que muda entre eles, em resumo (os números estão em `ESTUDO_AEKO.md`, seção 6, e em `tools/estilos_arte.json`):

- **aeko**: contorno preto `010000` igual em tudo, paleta fechada das folhas (442 cores: as 451 do estudo menos as que aparecem em menos de 4 pixels), uns 4 tons por rampa com
  degraus de ~8,5 de L, sombra que desce ao preto perdendo croma.
- **equipe**: contorno escuro mas não um preto só (`000000`, `080808`, `121212`…; nas árvores e no capim, um escuro da
  própria cor; nos terrenos, nenhum), cores fora da paleta do Aeko (só ~30 % dos pixels a um JND dela), objetos com
  mais cores e mais tons (5,2 por rampa) e mais textura (folhagem picada), folhas de tiles mais econômicas (6 cores por
  janela de 32×32, degraus de 12 de L).
- **aeko+equipe**: cada número é `m·aeko + (1−m)·equipe`; a paleta é a união das duas, com as cores do lado de menor
  peso um pouco mais longe na hora de prender; o contorno conta como acerto `m` vezes "é preto" e `1−m` vezes "é
  escuro". Como era a mistura da ferramenta original é **palpite**.

## Usar

```
python -I tools/estilo_aeko_arte.py <entrada.png> <saida.png> [opções]
```

| opção | valores | o que faz |
|---|---|---|
| `--estilo` | `aeko` (padrão), `equipe`, `aeko+equipe` | o alvo |
| `--mistura` | 0 a 1 (padrão 0,5) | só no `aeko+equipe`: 0 = só equipe, 1 = só Aeko |
| `--fundo` | `auto` (padrão), `nenhum`, `#RRGGBB` | o que vira transparente. `auto`: se a imagem tem transparência, o alfa (corte em 128); se não, a cor mais comum da moldura de 1 px, só onde ela está ligada à moldura (um furo da mesma cor no meio fica). `#RRGGBB`: essa cor em qualquer lugar. O antisserrilhado contra o fundo também sai. O alfa sai sempre 0 ou 255 |
| `--paleta` | `auto` (padrão), `estilo`, `livre`, `aeko`, `equipe`, ou um PNG | `auto`: livre, e presa à paleta do alvo se a nota pedir; `estilo`: presa desde o começo; `livre`: nunca presa; `aeko`/`equipe`: presa a essa; um PNG: presa às cores dele |
| `--tons` | 1 a 16 | máximo de tons por família de matiz (padrão: o do alvo, arredondado para cima) |
| `--contorno` | `externo` (padrão), `todos`, `nao` | `externo`: 1 px em volta da silhueta; se a beirada já é um contorno (escura e bem mais escura que o vizinho de dentro em metade dela ou mais) ela é repintada no lugar; se não, o contorno vai por fora, nos pixels transparentes que encostam na silhueta, para não comer o desenho. `todos`: também as linhas escuras de dentro. `nao`: sem contorno (tiles, terrenos) |
| `--cor-contorno` | `auto` (padrão), `preto`, `escuro` | `auto`: preto `010000` no aeko; no equipe, o que a arte já tem (escuro com cor vira `escuro`, o resto vira o preto da equipe). `escuro`: um escuro da cor vizinha (L × 0,35, croma × 0,7), como as árvores da equipe |
| `--escala` | `auto` (padrão) ou N | arte ampliada por um inteiro (blocos N×N) é reduzida antes e ampliada de volta no fim |
| `--nota-minima` | 0 a 10 (padrão 8) | abaixo dela a ferramenta tenta de novo |
| `--exigir` | | sai com código 3 se não chegou à nota mínima (sem ela, sai 0 e só avisa) |
| `--previa` | | grava `<saida>.previa.png`: antes \| depois, ampliados 4×, sobre xadrez |
| `--json` | | escreve o resumo numa linha JSON no fim (a ponte usa) |
| `--parametros` | JSON | sobrepõe `PARAMETROS` (para experimentar) |

Exemplo de saída:

```
estudo\estilo_arte\fora\arvore_degrade.png → saida.png
  estilo aeko; escala 1×, fundo alfa, paleta auto
  cores 517 → 5 em 2 famílias (tons: 3, 1)
  contorno externo (preto, por fora): 146 pixels
  nota 10.00 (mínima 8) em 4 tentativa(s): paleta 10.0, contorno 10.0, tons por rampa 10.0, degrau de L 10.0, croma da sombra 10.0
```

### No Aseprite

**Arquivo > Diorama > Aplicar estilo Aeko…** (extensão Diorama 0.3.0; instalar com `npm run aseprite:instalar` e
reabrir o Aseprite). O diálogo tem as mesmas opções; o sprite atual (camadas visíveis do quadro atual) vai para a
pasta temporária da ponte, a ponte roda a ferramenta e o resultado **abre como sprite novo** (o atual não muda), com a
nota num aviso e, abaixo da mínima, o que faltou. Sem a ponte no ar, a extensão oferece rodar o Python direto. Detalhes
em `docs/diorama/ASEPRITE.md`; a rota da ponte é `POST /estilo/aeko` (`docs/diorama/PONTE.md`).

### Capturas de tela

`desamostrar_captura` (no módulo) devolve a 1 pixel por pixel uma captura de pixel art com ampliação fracionária e
JPEG: acha a grade pela energia das bordas (Fourier; numa grade sem perdas, pelas trocas de cor que caem todas no mesmo
resíduo, `grade_inteira`), toma a mediana do miolo de cada célula e junta as cores a menos de ΔE 5. É como o estudo lê
as árvores da equipe. Não está na linha de comando: a ferramenta espera arte de verdade (ou ampliada por inteiro).

## Como ela faz

1. Escala (`--escala`) e fundo (`--fundo`), como acima.
2. **Famílias de matiz**: as cores se agrupam pela corda entre os ângulos de matiz em (a, b) de Lab (a mesma de
   `estilo_aeko.py`); as quase cinza (croma < 7) são uma família à parte. Com mais de 200 cores, por faixas de 3° de
   matiz (arte borrada tem milhares).
3. **Rampas**: em cada família, a escala de L se parte em K tons pela partição ótima em 1-D (Jenks), com
   K = round(amplitude de L ÷ degrau do alvo) + 1, no máximo `--tons` (a amplitude vai do percentil 2 ao 98 de L,
   ponderado pelos pixels: num degradê cada cor tem menos de 1 % e contar só as cores grandes achatava a copa num tom
   só). Cada tom é a média em Lab dos pixels dele; o
   matiz é puxado (força 0,5) para o da família com o giro medido do escuro ao claro, e o croma do tom mais escuro para
   a fração medida do mais saturado (a sombra desce ao escuro perdendo croma). Croma acima de 60 é comprimido.
4. **Paleta**: cada tom vai para a cor mais perto da paleta (sem repetir cor na mesma rampa nem inverter a ordem de L).
5. **Contorno**, como na tabela.
6. **Nota e escada.** A nota (`nota_estilo`) mede a arte produzida contra o alvo: 35 % paleta (pixels a um JND da
   paleta do alvo), 25 % contorno (fração da beirada que é contorno do alvo ÷ a do gabarito, até 1), e três limites de
   um lado só: 15 % tons por família (no máximo alvo + 1), 15 % degrau de L (no mínimo alvo − 2) e 10 % croma da sombra
   (no máximo alvo + 0,15). As tentativas sobem da menor intervenção para a maior e **a primeira que chega à mínima é a
   entregue** (para mexer o menos possível no desenho):
   1. só fundo e contorno, as cores como estão;
   2. cada cor presa à paleta, sem reduzir tons;
   3. rampas com um tom a mais que o alvo, livres; 4. as mesmas, presas;
   5. rampas com os tons do alvo, presas; 6. um tom a menos, degrau 25 % maior, sombra com força 1;
   7. dois a menos, degrau 50 % maior.

   As duas primeiras só valem se a entrada já tem as cores concentradas: as K = tons do alvo + 1 cores mais usadas de
   cada família cobrem 60 % ou mais dos pixels (`cobertura_de_cores`; os gabaritos ficam em 0,92 a 0,97 de mediana,
   arte borrada ou com degradê abaixo de 0,35). Se o contorno tira menos de 0,8 numa tentativa, as seguintes usam a cor
   de contorno do alvo. Nenhuma chegando, entrega a de maior nota e avisa o que faltou.

A **nota mínima é 8 nos três estilos**. No aeko foi pedido pelo usuário; no aeko+equipe e no equipe a validação
mostrou que 8 é alcançável em todos os casos testados (com 7 no equipe, 21 % dos objetos estragados paravam entre 7 e
8 sem chegar ao jeito da equipe).

## Validação

`python -I tools/validar_estilo_arte.py [--amostra N]` grava `estudo/estilo_arte/validacao.md` e `.json` (só números);
as folhas antes | estragado | devolvido de objetos dos gabaritos vão para `Documents\Haywood-Valley-recuperado\aeko\validacao\`
(fora do repositório, porque mostram a arte da equipe e dos contribuidores). Três provas, nos três estilos:

- **(a) objetos estragados**: objetos dos gabaritos estragados de cinco jeitos (borrar, degradê, saturar, sem
  contorno, tudo junto) e devolvidos; nota de estilo e nota contra o original (a de `comparar_estilos.py`:
  `10 × (0,5·max(0, 1 − ΔE/10) + 0,3·iguais + 0,2·paleta)`, sobre a união das silhuetas).
- **(b) imagens de fora**: quatro artes desenhadas com o Pillow em outro estilo (árvore com degradê liso e
  antisserrilhado, baú chapado sem contorno sobre branco, botão com degradê, sombra e texto, poção com brilho ampliada
  2× sobre cinza), em `estudo/estilo_arte/fora/` com as prévias.
- **(c) o par antes → depois da MADX**: as árvores lisas do "antes" passam pela ferramenta e são comparadas com o
  "depois" que a equipe desenhou à mão.

### Resultado (rodada final)

16 peças do Graal e 16 janelas por conjunto, os 63 objetos da equipe (com as árvores), 5 estragos (as janelas sem o
"sem contorno", porque tile não tem contorno); 456 s. A tabela inteira está em `estudo/estilo_arte/validacao.md`.

| estilo | casos | nota de estilo: estragado → devolvido (média) | devolvidos ≥ 8 | menor nota |
|---|---|---|---|---|
| aeko | 144 | 3,8 → **9,62** | **144 de 144** | 8,03 |
| equipe | 376 | 5,7 → **9,22** | 374 de 376 | 7,69 (duas janelas de tiles borradas) |
| aeko+equipe | 520 | 5,1 → **9,26** | 519 de 520 | 7,90 (uma janela de tiles borrada) |

Nos três casos abaixo de 8 a ferramenta entrega a melhor tentativa e avisa o que faltou.

Contra o original (média por estrago, estragado → devolvido): "sem contorno" na equipe **8,73 → 8,20** (ΔE 1,5;
silhueta e contorno voltam, as cores ficam); no aeko+equipe 8,73 → 8,46. Borrar, degradê, saturar e tudo junto ficam
entre 0,4 e 3,8 antes e depois (ΔE 5 a 9): a ferramenta põe no estilo, mas não devolve o desenho que o estrago apagou.
No aeko, as peças do Graal "sem contorno" caem de 8,49 para 4,24, porque o estilo aeko prende as cores à paleta das
folhas e as peças no estilo Aeko não usam essa paleta (`ESTUDO_AEKO.md`, seção 3): elas são recoloridas.

Imagens de fora (nota de estilo antes → depois; cores antes → depois):

| imagem | aeko | equipe | aeko+equipe | cores |
|---|---|---|---|---|
| árvore com degradê liso | 2,97 → **10,00** | 3,32 → **9,96** | 3,35 → **10,00** | 517 → 9 |
| baú chapado sem contorno, fundo branco | 3,98 → **10,00** | 4,73 → **9,94** | 4,83 → **10,00** | 7 → 6 ou 7 |
| botão com degradê, sombra e texto | 1,26 → **10,00** | 2,88 → **10,00** | 2,37 → **8,05** | 473 → 7 ou 8 |
| poção ampliada 2× sobre cinza | 2,07 → **9,39** | 1,95 → **9,07** | 2,06 → **8,84** | 222 → 12 a 16 |

O par da MADX (nota contra o "depois" desenhado pela equipe; o "antes" contra o "depois" tira 2,66 na rosa e 2,52 na
verde): no estilo equipe a devolvida tira 2,68 e 2,10, com 90 % e 76 % dos pixels a um JND das cores do "depois" (o
"antes" cru: 27 %); nota de estilo da devolvida 9,19 e 10,00, mais alta que a do próprio "depois" (8,01 e 6,37). No
aeko tira 0,44 e 1,00: o estilo aeko leva a árvore para a paleta e o contorno do Aeko, longe do que a equipe fez.

### Evolução

| rodada | o que mudou | estilo médio (aeko / equipe / mistura) | ≥ 8 no equipe | sem contorno, contra o original (aeko / equipe) |
|---|---|---|---|---|
| 0 | nota com tolerância dos dois lados nas rampas | — | — | — (os próprios gabaritos tiravam ~8 e as partes de rampa davam ~0,5 em tudo: trocada por limites de um lado só) |
| 1 | alvos medidos, nota com limites de um lado só, ajuste pelo pior pedaço da nota | 9,56 / 8,93 / 9,42 | 79 % (mínima 7) | 5,02 / 5,39 (estragado: 8,49 / 8,73) |
| 2 | escada da menor intervenção; beirada escura (L < 40) repintada no lugar | 9,52 / 8,64 / 9,35 | 68 % | 5,33 / 5,86 |
| 3 | contorno existente = escuro **e** mais escuro que o vizinho de dentro (L < 45, contraste 5) | 9,56 / 8,95 / 9,44 | 79 % | 5,34 / 5,93 |
| 4 | as tentativas sem rampa exigem cores concentradas (cobertura ≥ 0,6) | 9,58 / 8,96 / 9,45 | 79 % | 5,93 / 6,46 |
| 5 | sem rampa também com mais tons que o alvo (a nota cobra); nota mínima 8 no equipe | — / 9,41 / — | 100 % | — / 8,22 |
| 6 | a mesma da 5, com 16 peças e 16 janelas por conjunto e os três estilos | 9,59 / 9,39 / 9,43 | 99 % (374 de 376) | 4,24 / 8,22 (o aeko recolore as peças para a paleta das folhas) |
| final | amplitude de L pelos percentis 2–98 (a árvore com degradê saía com a copa num tom só e nota 10: a nota não cobra tons de menos) | 9,62 / 9,22 / 9,26 | 99 % (374 de 376) | 4,24 / 8,20 |

As rodadas 1 a 5 usaram 6 peças e 6 janelas por conjunto (os 63 objetos da equipe sempre); a 6 e a final, 16. A nota de estilo não
subiu mais entre a 4 e a final: o que mudou depois foi o que a nota não vê (mexer menos no desenho, a copa em faixas).

### O que a validação mostra

- A nota de estilo sobe de 2 a 7 (estragados e imagens de fora) para 8 a 10 em todos os casos: a ferramenta põe a arte
  no estilo.
- A nota **contra o original** só volta de verdade quando o estrago é de estilo (contorno faltando, cores tremidas): no
  "sem contorno" a arte volta quase igual. Borrão e degradê apagam desenho que a ferramenta não tem como inventar de
  volta: ela tira o degradê e põe o contorno, mas o detalhe perdido continua perdido, e a nota contra o original fica
  perto da do estragado.
- No par da MADX a ferramenta não chega ao "depois": o artista trocou a copa lisa de bolinhas por folhagem picada
  (textura nova), tirou a sombra preta do chão e trocou o contorno preto da copa por um escuro da própria cor. A
  ferramenta acerta a paleta e o contorno do estilo, mas não desenha textura: a nota contra o "depois" fica perto da do
  "antes".

## O que é palpite

- Como era a ferramenta original: só sobreviveu o resultado (as folhas, as peças e a arte da equipe). Os três estilos,
  a nota mínima 8 e a mistura com peso vêm do que o usuário contou em 2026-10-20; o resto (Jenks, famílias de matiz,
  a escada, os pesos e limites da nota, a cobertura) é desta reconstrução.
- A mistura aeko+equipe: média ponderada dos números, união das paletas com distância penalizada, contorno pesado por
  pixel.
- A nota: pesos (35/25/15/15/10) e limites escolhidos para que os gabaritos tirem 9 ou mais no próprio estilo e uns 5 a
  6 no outro (`ESTUDO_AEKO.md`, seção 6; as peças do Graal no estilo Aeko ficam em 7,7 no aeko porque não usam a
  paleta das folhas). A nota não cobra tons de menos: uma rampa achatada num tom só não perde nota.
- A ferramenta não faz textura (folhagem, tufos, ruído de pincel) nem redesenha forma: o que a equipe faz à mão ao
  passar uma arte lisa para o estilo dela (o par da MADX) fica para o artista.
