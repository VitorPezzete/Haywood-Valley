# Extensões de terceiros do Aseprite, sem janela

Pedido do usuário em 2026-10-22: que o Claude consiga usar as extensões que ele instalou no Aseprite. Elas só
funcionam por janelas (`Dialog`) e pelo pincel de quem desenha; este documento diz o que cada uma faz, o que ficou
chamável em modo lote (`aseprite -b`) e o que não deu.

- **Adaptador**: `aseprite/adaptadores/extensoes.lua` (Lua, nosso). Carrega o código das extensões de onde o Aseprite
  as instalou, `%APPDATA%\Aseprite\extensions\<pasta>`, sem copiar nada para o repositório e sem mudar os arquivos
  delas. Recusa se a extensão faltar ou mudar de versão.
- **Entrada de linha de comando**: `aseprite/adaptadores/rodar.lua` (lê `--script-param acao=` e `opcoes=`).
- **Comando**: `tools/aseprite_extensoes.mjs` (`npm run aseprite:extensoes`), que roda o Aseprite em lote.
- **Ferramentas nossas**: `aseprite/adaptadores/ferramentas.lua` (2026-10-22), carregado pelo adaptador: o que as
  extensões só fazem com janela, refeito em código nosso com a API do Aseprite. Seção "Ferramentas nossas" abaixo.
  **Com janela**, as mesmas ações estão em Arquivo > Diorama > Ferramentas (extensão Diorama 0.5.0, 2026-10-22; uso em
  `docs/diorama/ASEPRITE.md`, seção "Ferramentas"): a instalação copia `extensoes.lua` e `ferramentas.lua` para dentro
  da extensão.
- **Cópia de segurança** das quatro pastas, antes de qualquer coisa: `Documents\Haywood-Valley-recuperado\backup_extensoes_aseprite\2026-10-22\` (fora do git).

## Como chamar

Pelo MCP `aseprite` (o jeito principal), com `run_lua_script` e um `dofile`:

```lua
local E = dofile([[C:\Users\Szortek\Documents\Haywood-Valley\aseprite\adaptadores\extensoes.lua]])
local r = E.dithering.preencher{
	arquivo = [[C:\tmp\vaca.aseprite]],          -- ou passe o arquivo no `filename` do run_lua_script e omita aqui
	camada = "sombra", abaixo_de = "detalhes",   -- criada se não existir
	ruido = "blue", densidade = 6, cor = "#3a2a1a",
	mascara_camada = "corpo_e_cabeca",           -- só sobre o que já está desenhado nessa camada
	png = [[C:\tmp\vaca_previa.png]], png_escala = 8,
}
print(json.encode(r))
```

`E.chamar("dithering.preencher", {...})` faz o mesmo pelo nome. `E.verificar()` diz se as quatro estão instaladas, na
versão conhecida e se o adaptador carrega o código delas. `E.ACOES` lista as ações.

Pela linha de comando (Node em `C:\Program Files\nodejs`, fora do PATH do Git Bash):

```
node tools/aseprite_extensoes.mjs verificar
node tools/aseprite_extensoes.mjs dithering.preencher C:\tmp\vaca.aseprite "{\"camada\":\"sombra\",\"densidade\":5}"
node tools/aseprite_extensoes.mjs pincel.carimbar C:\tmp\vaca.aseprite @opcoes.json
```

O comando grava as opções num `.json` temporário (o Windows estraga aspas em JSON na linha de comando), chama
`Aseprite.exe -b --script-param acao=... --script-param opcoes=<json> --script rodar.lua` e imprime o resultado em
JSON (código 0) ou o erro (código 1). O Aseprite é o de `ASEPRITE_PATH`, o do `.mcp.json` ou o da Steam. Nada abre ou
fecha o Aseprite que o usuário tem aberto.

### O alvo (vale para toda ação que desenha)

| Opção | O quê |
|---|---|
| `arquivo` | o `.aseprite`. Sem ele, o sprite ativo (o `filename` do `run_lua_script`). |
| `camada` | nome da camada. Nas ações que criam desenho, criada no topo se não existir (sem `camada`, uma camada nova com o nome da ação). Nos efeitos sobre o que já existe (`pincel.efeito`, `livebrush.girar`, `carbs.*`), tem de existir. |
| `abaixo_de` / `acima_de` | põe a camada recém-criada junto de outra. |
| `quadro` | número do quadro (1). |
| `x`, `y` / `retangulo` | onde: `{x, y, largura, altura}` ou `{x=, y=, largura=, altura=}`. |
| `modo` | `"compor"` (padrão, por cima), `"substituir"` (troca os pixels) ou `"apagar"` (apaga onde a imagem gerada tem pixel: transparência pontilhada). |
| `mascara` / `mascara_camada` | `"conteudo"` (só sobre o que já está na camada), `"vazio"` (só no vazio) ou o nome de outra camada cujo desenho limita. |
| `saida` | grava noutro arquivo. Sem ela, grava no próprio; `salvar = false` não grava. |
| `png`, `png_escala` | exporta o sprite achatado (camadas visíveis) depois da ação. |
| `imagem_png` | grava só a imagem gerada (o ladrilho, o pincel transformado) antes de colar. |
| `semente` | sorteios repetíveis. |

Cores: `"#rrggbb"`, `"#rrggbbaa"`, `{r, g, b, a}` ou um índice da paleta. Sprites RGB e indexados (a cor vai para a
mais próxima da paleta); cinza converte pela luminância. Tilemap não. Cada ação devolve uma tabela simples (vira o
JSON do comando) e roda numa transação (um desfazer só, se for aberta no Aseprite com janela).

## Dithering Generator 1.0.0 (sodedromme)

**O que é**: gera faixas de dithering (densidade indo de um valor a outro, numa cor ou em degradê de várias cores) e
matrizes de limiar (Bayer 2/4/8, ruído azul, branco, meio-tom, linhas), mostra a prévia e põe o resultado como pincel
do Aseprite ou instala a matriz como "matriz de dithering" do Aseprite (uma extensão nova, `user_generated_dithers`).

**Funções úteis** (todas em `brush_algo.lua`, um módulo puro que o adaptador carrega inteiro):
`generateScatterDither` (a faixa e o degradê multicor), `generateThresholdMatrix` (o mapa de limiar), `buildTiledBrush`
(escala e acréscimo do ladrilho), `applyFractalNoise`, `invertImage`, `createScaledImage`, `generateMapFromList` (mapa a
partir de uma sequência de imagens). O resto de `dithering_generator.lua` é janela: prévia, predefinições, sorteio dos
parâmetros, temas, ajuda, biblioteca de matrizes.

| Ação | Opções próprias |
|---|---|
| `dithering.faixa` | `comprimento`, `largura` (ou `retangulo`), `inicio` e `fim` (densidade 0 a 100), `ruido`, `angulo`, `dx`, `dy`, `inverter`, `cor`; `cores = {...}` (2 ou mais) vira degradê; `padrao = origem` repete uma imagem no lugar da cor; `vertical`. |
| `dithering.gradiente` | a faixa com `cores` obrigatório; sem retângulo, o sprite todo. Bom para céu, água, chão em degradê. |
| `dithering.matriz` | o ladrilho: `ruido`, `tamanho` (2, 4, 8, 16; padrão 16 no azul e no branco, 8 nos outros), `densidade` 1 a 17, `angulo`, `dx`, `dy`, `inverter`, `cor`, `escala` 1 a 16, `acrescimo` 0 a 16; `mapa = true` devolve o mapa de limiar em cinza, `fractal` mistura ruído nele. Sem alvo, só grava `imagem_png`. |
| `dithering.preencher` | enche o `retangulo` (padrão: o sprite) com o ladrilho, preso à grade do sprite (dois preenchimentos vizinhos casam). Com `mascara_camada`, sombra pontilhada dentro de uma forma; com `modo = "apagar"`, transparência pontilhada. |

Ruídos: `bayer`, `blue`, `white`, `halftone`, `lines_h`, `lines_v`, `lines_d`, `none`.

**Não exposto pelo código dele, refeito em código nosso** (seção "Ferramentas nossas"): a biblioteca de matrizes
(`matriz.gravar`, `listar`, `ler`, `apagar`; `matriz.preencher` e `matriz.faixa` aplicam uma matriz salva), a
sequência de níveis (`matriz.sequencia`, de quadros de um `.aseprite` ou de PNGs, no lugar do `bm_buffer.aseprite`) e
"instalar a matriz": `matriz.extensao` **gera** a pasta `user_generated_dithers` (package.json e um .bmp por matriz,
no formato que a extensão instala) num diretório de saída; `matriz.instalar` grava direto na pasta de extensões (o
`npm run aseprite:instalar` faz isso, com o pedido do usuário de 2026-10-22). "Usar como pincel" (põe o pincel do
Aseprite, que em lote não pinta nada) existe só com janela: "Pintar com ele" e "Próximo no lápis" das Ferramentas.

## Brush Manager PRO 0.9.7.1 (sodedromme)

**O que é**: biblioteca de pincéis em `.aseprite` com fatias (cada fatia é um pincel), com favoritos, etiquetas,
grupos, recentes, atalhos, e transformações aplicadas ao pincel na hora de pintar (escala, giro, espelho, recolorir
pela cor de frente e de fundo ou por um mapa de cores, variação de cor sorteada, contorno, cobertura, densidade
pontilhada) e "pincéis vivos" que mexem no traço recém-pintado (grafite, estilhaço, glitch, onda, zigue-zague, espiral,
círculo, magia, negativo, contorno vivo, seleção).

**Funções úteis** (em `brush_algo.lua` e `brush_utils.lua`, módulos puros ligados por `Algo.init(Utils)`):
`createScaledImage`, `createRotatedImage`, `getRandomTransformedImage`, `transformImageSimple`,
`createSmartRecolorImage`, `applyColorJitterToImage`, `addOutlineToImage`, `applyRadialDensity`, `applyCoverageOffset`,
`generateTileVariation`, `applyOutlineToCanvas` e os `apply*ToCanvas` dos pincéis vivos. `brush_manager_pro.lua`,
`brush_ui.lua` e `brush_create.lua` são janela, preferências e cache.

Bibliotecas que ele lê, na ordem: `%APPDATA%\Aseprite\scripts\user_dithers_pro.aseprite`, as de exemplo em
`sources\` da extensão (`brush_source_starter_pack`, `dither_starter`, `multi_layer_starter`: 19 pincéis hoje),
`scripts\user_brushes_pro.aseprite` e os caminhos de `%APPDATA%\Aseprite\brush_manager_paths_pro.txt`. O usuário
ainda não tem biblioteca própria.

| Ação | Opções próprias |
|---|---|
| `pincel.bibliotecas` | lista os arquivos de biblioteca. |
| `pincel.listar` | os pincéis (nome, tamanho, biblioteca); `biblioteca` = nome ou caminho. |
| `pincel.imagem` | o pincel transformado em `imagem_png` (com `x`/`y`/`pontos`, carimba). |
| `pincel.carimbar` | o pincel em cada um dos `pontos` (`{{x,y},...}`; `espacamento` preenche o caminho entre eles), com `ancora` (`centro`, `base`, `topo_esquerda`... nove) e as transformações abaixo, sorteadas de novo a cada carimbo. |
| `pincel.efeito` | um pincel vivo aplicado de uma vez ao que já está na `camada`: `tipo` = `contorno`, `grafite`, `estilhaco`, `glitch`, `onda`, `zigue`, `espiral`, `circulo`, `magia`, `negativo`; `forca` 0 a 100, `tamanho` (grafite e magia), `cor` (contorno), `retangulo` limita. |
| `pincel.variacoes` | `quantidade` variações lado a lado de um ladrilho: `deslocar` (pixels que saem do lugar), `expandir`, `transformar` (gira e espelha), `cor = {h, s, v, harmonico, alfa}`, `espaco`. |
| `pincel.criar` | acrescenta um pincel (`nome`, `origem`) a uma `biblioteca` no formato dele (cria o arquivo se faltar). Para aparecer no Brush Manager do usuário, a biblioteca é `%APPDATA%\Aseprite\scripts\user_brushes_pro.aseprite`: só com o aval dele. |

O pincel vem de `pincel = "nome"` (com `biblioteca` opcional) ou de `origem`:
`{ png = caminho }` ou `{ arquivo?, camada?, quadro?, retangulo? | fatia? }` (sem `arquivo`, o do alvo; só `camada`, o
que está desenhado nela; sem `camada`, o sprite achatado).

Transformações (todas opcionais, na ordem do Brush Manager): `espelhar` (`flip_h`, `flip_v`, `cw`, `ccw`),
`aleatorio` (`all`, `flip_h`, `flip_v`, `flip_hv`, `rot`), `recolorir = { modo, frente, fundo, cores, ruido, angulo,
densidade, inverter }` com modo `frente_fundo` (terço escuro vira a frente, claro vira o fundo), `harmonico` (degradê
entre as duas pela luminância), `mapa` (luminância vira índice em `cores`) ou `gradiente` (`cores` ao longo da largura,
pontilhado), `variacao_cor = { h, s, v, harmonico, alfa }`, `contorno = cor`, `cobertura = { largura, altura, grade }`,
`escala` (número ou `{x, y}`), `densidade = { valor 1 a 17, angulo, esmaecer, inverter, ruido, cor }`, `angulo`.

**Não exposto pelo código dele, refeito em código nosso** (seção "Ferramentas nossas"): favoritos, etiquetas,
grupos, recentes, procurar duplicados e renomear (um e em lote) viram a biblioteca nossa (`biblioteca.*`, em JSON); os
pincéis de várias camadas (uma parte por camada, casadas pelo nome, como o "multi layer" dele; `biblioteca.importar`
traz os da biblioteca dele, inclusive o `multi_layer_starter`); o giro pela direção do traço (`biblioteca.traco`: um
caminho de pontos no lugar do mouse). **Continua de fora**: atalhos, cache e a prévia de ladrilho (só fazem sentido com
alguém pintando); "pincel vivo" traço a traço (vira o `pincel.efeito`, sobre a camada inteira ou um retângulo); as
transformações dele (recolorir, contorno, densidade) não entram no carimbo nosso: para usá-las, gravar o pincel com
`biblioteca.imagem` em PNG e carimbar com `pincel.carimbar{ origem = { png = ... } }`.

## Live Brush 2.1.1 (Devkidd)

**O que é**: conjuntos de pincéis (cortados de uma grade, de regiões separadas da seleção ou de quadros), trocados a
cada traço (em frente, para trás, vai e volta, sorteado), com tamanho, giro, espelho e deslocamento sorteados, e
recoloridos quando muda a cor de frente ou de fundo. Também gera "folhas giradas" (cada célula girada um pouco mais).

**Funções úteis**: `rotate_image` (giro por vizinho mais próximo numa tela quadrada, sem misturar cores),
`apply_colors`, `get_flipped_image`, `find_disjoint_selection_rects`. Todas são `local` dentro de `LiveBrush.lua`, que
abre janelas ao carregar: o adaptador lê o arquivo, troca as duas janelas (`LiveBrushSetDialog`, `LiveBrushHelpDialog`)
por tabelas vazias e acrescenta, **só na memória**, uma linha `return { ... }` que entrega essas quatro funções. A
troca de pincel por traço (em `on_sprite_change`, presa à janela) foi refeita no adaptador com as funções dele.

| Ação | Opções próprias |
|---|---|
| `livebrush.girar` | gira no lugar o `retangulo` (padrão: o desenho da `camada`) por `angulo` graus. |
| `livebrush.folha_girada` | cada célula de `grade = {largura, altura}` dentro do `retangulo` girada por passo × índice (passo = 360 / células). |
| `livebrush.conjunto` | corta o conjunto da `origem` por `grade`, `regioes = {{x,y,w,h},...}` ou `quadros = {1,2,...}`; `imagens_png = "C:/tmp/p_%d.png"` grava cada um. |
| `livebrush.carimbar` | o conjunto nos `pontos`: `sequencia` (`fixo`, `frente`, `tras`, `vaivem`, `aleatorio`), `repeticao`, `tamanho = {x%, y%}`, `tamanho_aleatorio = {min%, max%}`, `travar_proporcao`, `espelhar_h`/`_v`, `espelho_aleatorio_h`/`_v`, `rotacao`, `rotacao_passo`, `rotacao_aleatoria = {min, max}`, `deslocamento_aleatorio`, `cor_frente`/`cor_fundo` (pincel com transparência vira silhueta na cor de frente; opaco troca a primeira cor pela de fundo e as outras pela de frente, como ele faz), `ancora`. |

**Não exposto pelo código dele, refeito em código nosso** (seção "Ferramentas nossas"): conjuntos salvos com nome
(`conjunto.gravar`, `listar`, `ler`, `apagar`, `carimbar`; o `brushsets.json` dele não é lido) e o "pincel ativo" como
estado num arquivo (`ativo.definir`, `carimbar`, `ajustar`, `ler`, `limpar`), para a sequência e o giro continuarem de
uma chamada para a outra. **Continua de fora**: os atalhos e o pincel ativo do próprio Aseprite (`set_brush`), que em
lote não pinta.

## Carbs Toolbar 4.0.1 (CarbsCode)

**O que é**: uma barra com dezenas de atalhos: grade e xadrez pela seleção, grade isométrica 2:1/3:1/4:1, encolher a
seleção ao conteúdo, cortar e centralizar, quadros e sprite novo a partir da seleção, folha de sprites da seleção,
redimensionar cópia, exportar seleção/camadas/fatias (PNG, folha, GIF), duplicar e deslocar ou girar a seleção,
aumentar a tela pela seleção, contorno por fora e por dentro, sombra, deslocar matiz/saturação/valor da paleta,
paleta em pixels, pixels como texto.

**Como roda sem janela**: `carbs-toolbar.lua` define funções globais `CarbsToolbar_MAIN_*` e monta a janela no fim. O
adaptador carrega o arquivo (e os `lib/cc_*.lua`) num ambiente próprio com uma `Dialog` de mentira, que guarda o
valor de cada campo em `.data` (a espessura do contorno, as cores da grade isométrica, as opções de exportação; o
adaptador muda antes de cada chamada), o plugin dado como aberto (para as funções lerem esses campos) e um `app`
sobreposto: cor de frente, área de transferência e avisos ficam no adaptador, sem tocar o Aseprite do usuário. Em
lote, o comando `RemoveFrameTag` derruba o Aseprite (falha de segmentação, 2026-10-22); o `app.command` sobreposto o
troca pelo `deleteTag` da API. As funções chamadas são as dele; quase todas usam comandos do Aseprite (Outline,
ModifySelection, Fill, CanvasSize, ExportSpriteSheet, SaveFileCopyAs), que rodam em lote. `lib/cc_patterns.lua` são os
desenhos das grades isométricas; `lib/cc_image.lua`, `cc_utils.lua`, utilidades de imagem, seleção e arquivos;
`cc_tabs.lua` e `cc_themes.lua`, janela.

| Ação | Opções próprias |
|---|---|
| `carbs.contorno` | contorno por fora (`espessura` px, `cor`) na `camada`; `retangulo` limita. |
| `carbs.contorno_interno` | pinta a borda de dentro do desenho (usa a cor de frente de verdade por um instante e devolve). |
| `carbs.sombra` | contorno só para um lado (a "Quick Shadow"). |
| `carbs.encolher_selecao` | o retângulo do desenho dentro do `retangulo` (não grava). |
| `carbs.expandir_tela` | aumenta a tela por `largura`/`altura` (ou `retangulo`) em `cima`, `baixo`, `esquerda`, `direita`. |
| `carbs.grade_iso` | camada nova com grade `proporcao` = `2:1`, `3:1`, `4:1` em `cor1`/`cor2`, acima da `camada`; `nome_camada`. |
| `carbs.paleta_em_pixels` | as cores da paleta, uma por pixel, a partir do canto do `retangulo` (a largura dá as colunas). |
| `carbs.fatia` | fatia do `retangulo`, com `nome` e `cor`. |
| `carbs.exportar_fatias` | `formato` = `png`, `folha` ou `gif`, para a pasta do `.aseprite` (`<nome>_<fatia>_...`); `quadro_unico`, `tag_atual`, `camadas_separadas`, `numeros_absolutos`, `gif_tag_atual`, `gif_tags_separadas`, `gif_camadas_separadas`. Não grava o sprite; devolve os arquivos novos. |
| `carbs.pixels_texto` | os pixels do `retangulo` como texto (tabela Lua com `x`, `y` e, com `cores = true`, as cores), devolvido em `texto` em vez de ir para a área de transferência. |
| `carbs.grade` | a grade do sprite no `retangulo`; sem ele, 16 px. |

**Não exposto pelo código dele, refeito em código nosso** (seção "Ferramentas nossas"): duplicar e deslocar, duplicar
e girar, redimensionar a cópia (`copia.*`: nas imagens das células, sem colar flutuante); folha de sprites da área,
exportar seleção, exportar camadas (`exportar.*`) e quadros a partir da seleção (`quadros.da_selecao`), sem trocar de
aba; matiz/saturação/valor em cores escolhidas, na paleta e nos pixels (`cores.ajustar`). **Continua de fora**: centrar
a prévia e o xadrez (só mexem na tela do editor).

## Ferramentas nossas (o que as extensões só fazem com janela)

`aseprite/adaptadores/ferramentas.lua`, pedido do usuário em 2026-10-22 ("adicionar ferramentas ou extensão ou
modificar que arrume essas coisas que ficaram de fora"). Código nosso, com a API do Aseprite; nada das extensões foi
copiado e nenhuma delas precisa estar instalada, menos `matriz.gravar` com `ruido` (usa o mapa de limiar do Dithering
Generator pelo adaptador) e `biblioteca.importar` pelo **nome** de uma biblioteca do Brush Manager (com o caminho do
arquivo, não). As ações valem como as outras: `E.chamar("biblioteca.traco", {...})`, `E.biblioteca.traco{...}`, o
`rodar.lua` e `node tools/aseprite_extensoes.mjs biblioteca.traco <arquivo> @opcoes.json`. O alvo (`arquivo`, `camada`,
`quadro`, `saida`, `salvar`, `png`, `png_escala`, `modo`, `mascara`, `mascara_camada`, `abaixo_de`/`acima_de`) é o da
tabela "O alvo" acima.

### A biblioteca (pasta)

Uma pasta guarda pincéis, conjuntos e matrizes: `pasta` em cada chamada; sem ela, a variável de ambiente `HV_PINCEIS`;
sem as duas, **`%APPDATA%\Aseprite\diorama\pinceis\`** (criada na primeira gravação). Até a manhã de 2026-10-22 o
padrão era `aseprite/pinceis/` no repositório; mudou com as janelas (extensão Diorama 0.5.0) porque o repositório é
público e a biblioteca do usuário vai ter pincel recortado de arte de terceiros, e porque as janelas e o Claude devem
ver a mesma biblioteca. `aseprite/pinceis/` ficou inteira no `.gitignore`. Dentro:

- `biblioteca.json` (chaves em ordem e tabulação, para diferenças limpas): `pinceis`, `conjuntos`,
  `matrizes`. Cada pincel: `id` (do nome; fica mesmo se renomear), `nome`, `largura`, `altura`, `partes` (`png`,
  `camada` nas de várias camadas, `opacidade`/`mistura` só quando não são as de sempre), `favorito`, `etiquetas`,
  `grupo`, `ancora`, `descricao`, `criado`.
- `imagens/<id>/<n>[_<camada>].png`, `imagens/conjuntos/<id>/<item>/...`, `matrizes/<id>.png` (cinza: o valor é o
  limiar).
- `estado.json` e `ativo/`: o pincel ativo e o uso de cada pincel (vezes e última vez, para "recentes"); mudam a
  cada carimbo.

O JSON grava acentos como estão (UTF-8). Até 2026-10-22 o `%c` do escape pegava bytes de acento no Lua do Aseprite e
um nome como "Ruído" voltava estragado; corrigido (só os controles ASCII viram `\uXXXX`).

### Pincéis: `biblioteca.*` (no lugar da janela do Brush Manager PRO)

| Ação | Opções |
|---|---|
| `biblioteca.criar` | `nome`, `origem` = `{ arquivo?, camada? \| camadas = {...} \| todas_camadas = true, quadro?, retangulo? \| fatia? \| selecao = true (a forma da seleção), aparar? }` ou `{ png }`; `etiquetas`, `grupo`, `favorito`, `ancora`, `descricao`; `substituir = true`. Com `camadas`/`todas_camadas`, **pincel de várias camadas**: uma parte por camada, com o nome dela. Sem retângulo nem fatia, corta o vazio em volta. |
| `biblioteca.importar` | `biblioteca` (caminho de um `.aseprite` com fatias, como os do Brush Manager, ou o nome dele), `pinceis` = {nomes}, `camadas = true` (uma parte por camada), `grupo`, `etiquetas`, `prefixo`, `substituir`. |
| `biblioteca.listar` | filtros `texto`, `etiqueta`, `etiquetas` (todas), `grupo`, `favoritos`; `ordenar` = `nome`, `recentes`, `usos`, `criado`; `favoritos_primeiro`, `limite`. |
| `biblioteca.editar` | `pincel` (id ou nome), `novo_nome`, `favorito`, `etiquetas` (troca), `mais_etiquetas`, `menos_etiquetas`, `grupo` (`""` tira), `ancora`, `descricao`. |
| `biblioteca.renomear` | `pincel` + `nome`, ou em lote: filtros + `padrao` (`"grama_%02d"`) e `inicio`. O id e os arquivos ficam. |
| `biblioteca.apagar` | `pincel`; recusa se um conjunto usa (`forcar = true` tira de lá). |
| `biblioteca.grupos`, `biblioteca.duplicados` | grupos e etiquetas com a contagem; pincéis de pixels iguais. |
| `biblioteca.previa` | prancha dos pincéis filtrados em `png` (`colunas`, `espaco`, `escala`, `fundo`). |
| `biblioteca.imagem` | o pincel (transformado, se pedido) em `png`; `partes_png = "C:/x/p_%s.png"` grava cada parte. |
| `biblioteca.carimbar` | `pincel` \| `pinceis` = {...} \| `conjunto` \| `origem`; `pontos` = `{{x, y[, graus]}, ...}`, `caminho` (traço) ou `tracos` = `{ { pontos, fechado }, ... }` (vários traços seguidos, a ordem dos pincéis continua de um para o outro; é o que `caminho.*` devolve). |
| `biblioteca.traco` | o carimbar com `caminho` (ou `tracos`) obrigatório e o **giro pela direção do traço** ligado. |
| `caminho.da_camada` | os traços desenhados numa camada-guia (`camada`, padrão a ativa; `quadro`): cada pedaço ligado vira um traço; aberto, o caminho mais longo entre as pontas (esquerda para a direita, ou de cima para baixo); fechado, uma volta no sentido do relógio. `inverter`, `minimo` (px). Devolve `tracos`. |
| `caminho.da_selecao` | o contorno de dentro da seleção do sprite ativo como traço(s) fechado(s). `inverter`, `minimo`. |
| `biblioteca.pasta` | a pasta em uso. |

**Opções do carimbo** (valem para `biblioteca.carimbar`/`traco`, `conjunto.carimbar` e `ativo.*`):

- Traço: `caminho` = `{{x, y}, ...}`, amostrado a cada `espacamento` px de comprimento (padrão: metade do lado menor
  do pincel); cada carimbo gira pela direção do trecho (`girar_pelo_traco`, ligado quando há `caminho`; 0° = o pincel
  como está desenhado, para um traço que vai para a direita; 90° = para baixo). `suavizar` (px, padrão = espaçamento)
  tira a direção da corda em volta do ponto, para curvas sem tranco; `0` usa o trecho. `fechado = true` liga o fim ao
  começo. `angulo_base` soma um ângulo fixo à direção; `passo_angulo` (45, 90) arredonda o ângulo (90 é sem perda).
- Sorteio (com `semente`): `jitter = { posicao = px, lateral = px (para os lados do traço), angulo = graus,
  escala = % }`, `escala_aleatoria = {min, max}` (multiplicador; `travar_proporcao = false` sorteia x e y à parte),
  `angulo_aleatorio = {min, max}`, `espelho_aleatorio_h`/`_v`.
- Fixas: `escala` (número ou `{x, y}`), `espelhar_h`/`_v`, `angulo`, `rotacao_passo` (soma a cada carimbo), `cor`
  (silhueta na cor), `trocar_cores = {{"#de", "#para"}, ...}`, `ancora` (as nove do adaptador; padrão `centro`).
- Troca de pincel por carimbo, com vários (`pinceis` ou `conjunto`): `sequencia` = `fixo`, `frente` (padrão), `tras`,
  `vaivem`, `aleatorio`; `repeticao` = n.
- Giro: `giro` = `rotsprite` (padrão: o `aseprite/pixel/rotsprite.lua` do repositório, se estiver lá; senão o
  `simples`), `simples` (Scale2x 4× e a amostra do centro de cada bloco, deste arquivo) ou `vizinho` (vizinho mais
  próximo direto). 90°, 180° e 270° são sempre exatos.
- Várias camadas: cada parte vai para a camada de mesmo nome, criada se faltar (perto de `acima_de`/`abaixo_de`, com a
  opacidade e a mistura da origem); `mapa_camadas = { linha = "contorno" }` troca nomes; `camadas_modo` = `casar`
  (padrão), `novas` (camadas novas a cada chamada) ou `uma` (tudo na `camada` do alvo). Parte sem camada própria vai
  para a `camada` do alvo.
- O resultado traz `carimbos`, `pixels`, `angulos` (até 64, em graus inteiros), `camadas`, `comprimento` do traço e
  `pinceis_usados`; `imagem_png` grava o primeiro carimbo.

```lua
local E = dofile([[C:\Users\Szortek\Documents\Haywood-Valley\aseprite\adaptadores\extensoes.lua]])
E.biblioteca.criar{ nome = "Orelha", origem = { arquivo = [[C:\tmp\vaca.aseprite]], camadas = { "corpo_e_cabeca", "detalhes" },
                    retangulo = { 4, 4, 10, 8 } }, etiquetas = { "vaca" }, grupo = "animais", favorito = true }
E.biblioteca.traco{ arquivo = [[C:\tmp\cerca.aseprite]], camada = "grama", pincel = "tufo", caminho = { {0, 40}, {30, 34}, {64, 40} },
                    espacamento = 6, jitter = { lateral = 2, angulo = 15 }, semente = 3 }
E.biblioteca.listar{ etiqueta = "vaca", ordenar = "recentes" }
E.biblioteca.renomear{ grupo = "grama", padrao = "grama_%02d" }
```

### Conjuntos: `conjunto.*` (no lugar dos conjuntos do Live Brush)

| Ação | Opções |
|---|---|
| `conjunto.gravar` | `nome`; os pincéis vêm de `pinceis` = {ids ou nomes da biblioteca} ou da `origem` cortada por `grade` = {l, a}, `regioes` = {{x,y,w,h}, ...}, `quadros` = {1, 2, ...} ou `separar = true` (cada ilha de pixels; `minimo` px); `opcoes` = as opções de carimbo que o conjunto leva (sequencia, escala_aleatoria, jitter...); `substituir`. |
| `conjunto.listar`, `conjunto.ler` | `ler`: as opções e os itens; `imagens_png = "C:/x/c_%d.png"` grava cada um. |
| `conjunto.carimbar` | `conjunto` + `pontos`, `caminho` ou `tracos`; as opções da chamada passam por cima das salvas. |
| `conjunto.editar` | sem recortar de novo: `opcoes` (troca todas), `mais_opcoes` (mescla), `menos_opcoes` = {chaves}, `novo_nome`, `descricao`. |
| `conjunto.apagar` | apaga a entrada e as imagens próprias (os pincéis da biblioteca ficam). |

### Pincel ativo: `ativo.*` (estado em arquivo, para encadear chamadas)

`ativo.definir{ pincel | pinceis | conjunto | origem, ...opções de carimbo }` grava em `estado.json`;
`ativo.carimbar{ arquivo, pontos | caminho, ... }` usa o ativo e guarda onde a sequência parou, o giro acumulado
(`rotacao_passo`) e o sorteio (`semente` + número da chamada), então chamadas seguidas continuam como um traço só
(`indice` no resultado: o último pincel usado); `ativo.ajustar` mescla opções (`remover` = {chaves},
`reiniciar = true` volta a sequência); `ativo.ler`, `ativo.limpar`. `ativo.proximo` avança a sequência sem carimbar e
devolve o pincel seguinte (já com as opções sorteadas; `png` grava a imagem): com janela, é o "Próximo pincel do
conjunto ativo", que põe esse pincel no lápis do Aseprite.

```lua
E.ativo.definir{ conjunto = "Pernas", sequencia = "vaivem", rotacao_passo = 90 }
E.ativo.carimbar{ arquivo = [[C:\tmp\tela.aseprite]], camada = "pernas", pontos = { {10, 30} } }   -- pincel 1, 0°
E.ativo.carimbar{ arquivo = [[C:\tmp\tela.aseprite]], camada = "pernas", pontos = { {30, 30} } }   -- pincel 2, 90°
```

### Cópias, exportações, quadros e cores (no lugar do que o Carbs Toolbar faz pelo editor)

Área: `retangulo`, `fatia` ou `selecao = true` (a seleção do sprite ativo, com a forma dela; o `.aseprite` não guarda
seleção, então só serve com o sprite aberto por script). Camadas: `camada`, ou `camadas` = {nomes} | `"todas"` |
`"visiveis"`. Quadros: `quadro`, ou `quadros` = {...} | `"todos"`.

| Ação | Opções |
|---|---|
| `copia.deslocar` | `dx`/`dy`, ou `direcao` (`cima`, `baixo`, `esquerda`, `direita`, `cima_esquerda`...) com `deslocamento` = {x%, y%} do tamanho da área (100: encostada) e `espaco`; `vezes` cópias em fila; `preencher = true` repete a área no sprite todo; `mover = true` apaga o original; `camada_destino`; `modo`. |
| `copia.girar` | `angulo` (graus, sentido do relógio) ou `sentido` = `horario` \| `anti_horario`; `vezes` (a k-ésima gira k vezes); onde: centrada no original (padrão), `dx`/`dy`, `ao_lado` = `direita`/`esquerda`/`baixo`/`cima` com `espaco`, ou `x`/`y`; `no_lugar = true`; `espelhar_h`/`_v`; `giro`; `camada_destino`. |
| `copia.redimensionar` | `escala` (0.25, 0.5, 2, 4... ou {x, y}) ou `largura`/`altura`; vizinho mais próximo; como o Carbs, o original sai e a cópia fica centrada nele, `manter_original = true` deixa os dois; onde, como no girar. |
| `exportar.selecao` | a área em `png` (padrão com `{camada}`, `{quadro}`, `{nome}`); `camadas` limita, `separar_camadas = true` faz um PNG por camada; `escala`. Não muda o sprite. |
| `exportar.camadas` | um PNG por camada e quadro em `pasta_saida` (padrão `<pasta do sprite>/<nome>_camadas`), `nome` = `"{camada}_{quadro}.png"`, `aparar`, `retangulo`/`fatia`, `incluir_vazias`, `escala`. |
| `exportar.folha` | folha de sprites da área: `quadros`, `tag` ou todos, em `colunas` (padrão uma linha), ou `por_tag = true` (uma linha por tag); `camada` (só ela) ou `camadas`; `espaco`, `escala`; `png`; `json` grava onde ficou cada quadro e a duração. |
| `quadros.da_selecao` | sprite novo em `saida` (gravado e fechado) com cada célula de `grade` = {l, a} da área como um quadro; sem `grade`, a área num quadro (o "sprite novo da seleção"); as camadas vêm junto (`achatar = true` faz uma só); `duracao` ms, `manter_vazios`. |
| `cores.ajustar` | `h` (graus), `s`, `v` (pontos percentuais) nas `cores` = {"#rrggbb", ...} e/ou `indices` = {paleta}; sem as duas, todas. `paleta` e `pixels` (padrão sim; num indexado os pixels seguem a paleta), `camada(s)`, `quadros`, `retangulo`, `tolerancia` (distância RGB). Cinza recusa. Devolve as `mudancas` (de, para). |

```lua
E.copia.deslocar{ arquivo = [[C:\tmp\cerca.aseprite]], camadas = "todas", retangulo = { 0, 0, 16, 16 }, direcao = "direita", vezes = 5 }
E.copia.girar{ arquivo = [[C:\tmp\item.aseprite]], camada = "item", retangulo = { 0, 0, 16, 16 }, angulo = 45, vezes = 7, ao_lado = "direita", espaco = 2 }
E.exportar.folha{ arquivo = [[C:\tmp\anim.aseprite]], retangulo = { 0, 0, 32, 32 }, por_tag = true, png = [[C:\tmp\folha.png]], json = [[C:\tmp\folha.json]] }
E.cores.ajustar{ arquivo = [[C:\tmp\vaca.aseprite]], cores = { "#eddacd" }, tolerancia = 40, v = -30, camada = "corpo_e_cabeca" }
```

### Matrizes de dithering: `matriz.*` (no lugar da biblioteca e do "instalar" do Dithering Generator)

Uma matriz é uma imagem em cinza: o valor (0 a 255) de cada célula é o limiar; com densidade d% acende onde
valor < d × 256 / 100 (0% nada, 100% tudo).

| Ação | Opções |
|---|---|
| `matriz.gravar` | `nome` e a fonte: `bayer` = 2 \| 4 \| 8 \| 16 (nossa), `ruido_azul` = 4 a 32 (nossa: void-and-cluster de Ulichney, repetível pela `semente`), `linhas` = 2 \| 4 \| 8 \| 16 (nossa: linhas horizontais que acendem uma a uma na ordem de Bayer), `xadrez` (nossa, 2 níveis), `ruido` (o mapa do Dithering Generator: `blue`, `white`, `halftone`, `lines_*`..., com `tamanho`, `angulo`, `dx`, `dy`, `inverter`, `fractal`), `png` (mapa em cinza, ou o .bmp de uma extensão de matrizes) ou `origem`; `normalizar = true` espalha os níveis; `substituir`; `imagem_png`. |
| `matriz.sequencia` | a matriz de uma sequência de níveis, do menos cheio ao mais cheio: os quadros de `arquivo` (`camada`, `quadros`, `retangulo`) ou `pngs` = {...}; o limiar de cada pixel é o primeiro nível em que ele acende. `inverter`; `nome`. Devolve quantos pixels nunca acendem e quantos apagam depois de acesos. |
| `matriz.listar`, `matriz.ler`, `matriz.apagar` | `ler`: `png` com `png_escala` (8). |
| `matriz.preencher` | `matriz` (ou `bayer` = n, sem biblioteca), `densidade` 0 a 100, `cor`, `retangulo` \| `fatia` \| `selecao = true` (a forma da seleção), `dx`/`dy`, `inverter`, e o alvo (máscara, `modo = "apagar"`...). Presa à grade do sprite. |
| `matriz.faixa` | densidade de `inicio` a `fim` ao longo da área (`vertical`), na `cor`; com `cores` = {2 ou mais}, degradê cheio entre elas. |
| `matriz.extensao` | **gera, sem instalar**, `<saida>/user_generated_dithers/` (`nome_pacote`, `nome_exibido`): `package.json` com `contributes.ditheringMatrices` e um `.bmp` indexado por matriz (paleta cinza, índice = nível em ordem, 0 a n-1, 255 transparente; ids `hv_<id>`). Se a pasta já existe ali, troca as entradas de mesmo id e guarda as outras. Grava também o `__info.json` (a lista de arquivos que o Aseprite usa para desinstalar; `info = false` não grava). Para usar: copiar a pasta para `%APPDATA%\Aseprite\extensions\` (ou compactar como `.aseprite-extension`) e reiniciar o Aseprite, com o aval do usuário. |
| `matriz.iniciais` | põe o conjunto inicial (Bayer 2x2, 4x4, 8x8, Ruído azul 8x8 e 16x16, Linhas 4x4, Xadrez 2x2) se a biblioteca não tem nenhuma matriz; `completar = true` acrescenta as que faltam mesmo havendo outras. |
| `matriz.instalar` | `matriz.iniciais` (`iniciais = false` pula) e `matriz.extensao` direto na pasta de extensões (`saida`, padrão `%APPDATA%\Aseprite\extensions`). Pedido do usuário em 2026-10-22: o `npm run aseprite:instalar` e o botão "Instalar no Aseprite…" chamam. Reiniciar o Aseprite depois. |

```lua
E.matriz.gravar{ nome = "Bayer 4", bayer = 4 }
E.matriz.sequencia{ nome = "Tijolinho", arquivo = [[C:\tmp\niveis.aseprite]] }   -- cada quadro, um nível
E.matriz.faixa{ arquivo = [[C:\tmp\ceu.aseprite]], camada = "ceu", matriz = "Bayer 4", cores = { "#203060", "#5070b0", "#e0a070" }, vertical = true }
E.matriz.extensao{ saida = [[C:\tmp\matrizes]] }
```

### O que ainda não dá, e por quê

- **Pintar com o mouse** (traço vivo, pincel ativo do Aseprite, atalhos): em lote não há editor nem cursor. O mais
  próximo é o `caminho` (a lista de pontos do traço) e o pincel ativo em arquivo. Com janela (Ferramentas da extensão
  Diorama), o pincel vai para o lápis ("Pintar com ele", "Próximo pincel do conjunto ativo", que aceita atalho).
- **Instalar** a matriz ou uma extensão: só com o pedido do usuário (o de 2026-10-22 cobre as matrizes:
  `matriz.instalar`, chamado pelo `npm run aseprite:instalar`). O `.aseprite-extension` (um zip) não sai daqui: o Lua do
  Aseprite não compacta.
- **Seleção salva no arquivo**: o `.aseprite` não guarda seleção; `selecao = true` só com o sprite aberto por script.
- **Centrar a prévia, xadrez, cache e prévia de ladrilho**: só existem na tela do editor.

## Por que não pela ponte nem pelo MCP `diorama`

As ações gravam arquivos onde as opções mandam (`saida`, `png`, `imagem_png`, `imagens_png`, `biblioteca`, a pasta
do sprite nas exportações do Carbs). Uma rota `POST /aseprite/extensoes` na ponte teria de conferir cada caminho como
o `POST /estilo/aeko` confere os dele (dentro do repositório ou da pasta temporária, sem link, sem sobrescrever), e
isso não fica simples; o `run_lua_script` do MCP `aseprite` e o comando acima já dão tudo. Fica para quando alguém
precisar chamar do Studio ou do plugin.

## Licenças (resumo; os textos estão em cada pasta)

- **Brush Manager PRO** e **Dithering Generator** (sodedromme, EULA, "Proprietary"): uso em computadores próprios para
  fazer arte no Aseprite; a arte feita é de quem fez, inclusive comercial; cópia de segurança pessoal permitida;
  proibido redistribuir, revender, subir em repositório ou site público, e modificar ou descompilar para distribuir
  um produto concorrente.
- **Live Brush** (Devkidd): uso pessoal, profissional e comercial; proibido redistribuir, empacotar noutro produto e
  distribuir versões modificadas; modificar só para uso pessoal.
- **Carbs Toolbar** (CarbsCode, "All Rights Reserved"): uso pessoal e profissional; mudanças só para uso interno, sem
  redistribuir; proibido copiar ou distribuir o script ou partes dele sem permissão, imitar a barra a ponto de
  confundir, **usar a ferramenta para treinar IA** e para NFT. Pede crédito às fontes.

Por isso o repositório só tem o adaptador (código nosso, que chama o deles de onde está instalado), os nomes das
funções e os nomes dos campos da janela. Nada do código delas foi copiado para cá; a arte que sai das ações é do
usuário. Não colar trechos das extensões em documentos, comentários ou conversas que vão para o repositório.

## Testes (2026-10-22)

Em lote, numa cópia de `Haywood-Valley-recuperado\novas\vaca\vaca.aseprite` (48×36, 13 camadas) na pasta temporária,
nunca o original: as 26 ações (mais o `verificar`), cada uma exportada em PNG ampliado 8 vezes e conferida a olho (sombra pontilhada só
dentro do corpo, transparência pontilhada, faixa, degradê de céu por baixo da vaca com `abaixo_de`, ladrilho de meio-tom,
mapa de limiar, pincéis da biblioteca recoloridos, rabo espelhado com contorno, os dez efeitos, variações de ladrilho,
giros e folha girada, carimbos com sorteio e sequência, recolorir do Live Brush, contorno/contorno interno/sombra do
Carbs, tela maior, grade isométrica, paleta em pixels, fatia exportada em PNG, folha e GIF, pixels em texto). Também numa
cópia indexada da vaca, pelo `run_lua_script` do MCP, pelo comando Node (JSON de ida e volta) e os erros: camada que
não existe, ruído desconhecido, ação desconhecida, extensão ausente e versão diferente.

Ferramentas nossas (2026-10-22), também em lote, em cópias numa pasta temporária e com uma biblioteca temporária
(`pasta`), cada resultado exportado em PNG ampliado e conferido a olho: biblioteca (criar de camada, de várias camadas e
de PNG; listar com filtros e recentes; editar, renomear em lote, duplicados, apagar, prévia), importação do
`multi_layer_starter` do Brush Manager (o orbe de 4 camadas), traço em círculo, em L e em onda com setas apontando pelo
traço (com `passo_angulo`, `jitter` e `suavizar = 0`), carimbo de várias camadas casando e criando camadas, a vaca
inteira (13 camadas) carimbada pela metade; conjuntos por regiões, grade, ilhas e de pincéis, com `vaivem`, escala
sorteada e `rotacao_passo`; pincel ativo encadeado (0°, 90°, 180°, 270° em quatro chamadas) e com traço; cópias
deslocadas, em padrão, giradas 90° ao lado e 30°, redimensionadas, com seleção em L e num sprite indexado; exportação
de seleção, camadas e folha (por linhas, por tag, só uma camada, com JSON), quadros da seleção; ajuste de cor em RGB
com tolerância e em indexado pela paleta; matrizes Bayer, ruído azul do Dithering Generator e feita à mão por
sequência, preenchimento (12/25/50/75% exatos), faixas, a pasta de extensão gerada (e lida de volta), e os erros (nome
repetido, pincel em uso, camada que falta, modo e giro desconhecidos, sem área, sem matriz). Pelo `run_lua_script` do
MCP e pelo comando Node também.

Com janela (extensão Diorama 0.5.0, 2026-10-22): `npm run teste:aseprite` roda cada item de Arquivo > Diorama >
Ferramentas de ponta a ponta com um `Dialog` de mentira (o que foi coberto e o que não, em `docs/diorama/ASEPRITE.md`,
"Ferramentas > Testes"). Além das ações novas (`caminho.*`, `tracos`, `conjunto.editar`, `ativo.proximo`, as matrizes
nossas, `matriz.iniciais`, `matriz.instalar` numa pasta de teste e lida de volta do `.bmp`), ele achou o escape de JSON
que estragava acentos (corrigido, ver "A biblioteca").

O teste achou um defeito do Lua do Aseprite: `math.tointeger(0.8)` devolve 0 em vez de falhar. O `rodar.lua` usava
isso para converter os números do JSON, e toda opção quebrada vinda da linha de comando (`escala: 0.5`) virava inteira;
corrigido ali e no `ferramentas.lua`.

## Quando uma extensão atualizar

`node tools/aseprite_extensoes.mjs verificar` diz qual mudou. Antes de aceitar a versão nova: copiar a pasta para a
cópia de segurança, conferir se as funções que o adaptador usa (as listas em `algoDG`, `algoBM`, `FUNCOES_LB` e os
`CarbsToolbar_MAIN_*` chamados) continuam com o mesmo nome e os mesmos parâmetros, rodar as ações numa cópia de teste,
e só então trocar a versão em `EXTENSOES` no topo de `extensoes.lua`.
