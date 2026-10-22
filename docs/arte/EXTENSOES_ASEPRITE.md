# Extensões de terceiros do Aseprite, sem janela

Pedido do usuário em 2026-10-22: que o Claude consiga usar as extensões que ele instalou no Aseprite. Elas só
funcionam por janelas (`Dialog`) e pelo pincel de quem desenha; este documento diz o que cada uma faz, o que ficou
chamável em modo lote (`aseprite -b`) e o que não deu.

- **Adaptador**: `aseprite/adaptadores/extensoes.lua` (Lua, nosso). Carrega o código das extensões de onde o Aseprite
  as instalou, `%APPDATA%\Aseprite\extensions\<pasta>`, sem copiar nada para o repositório e sem mudar os arquivos
  delas. Recusa se a extensão faltar ou mudar de versão.
- **Entrada de linha de comando**: `aseprite/adaptadores/rodar.lua` (lê `--script-param acao=` e `opcoes=`).
- **Comando**: `tools/aseprite_extensoes.mjs` (`npm run aseprite:extensoes`), que roda o Aseprite em lote.
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

**Não exposto**: instalar a matriz no Aseprite (`saveDitherAsExtension` cria a extensão `user_generated_dithers` na
pasta de extensões do usuário: é instalar extensão, só com o pedido dele; o mapa sai em PNG com `mapa = true` +
`imagem_png`); a biblioteca de matrizes instaladas (renomear, apagar: não há nenhuma); a sequência
(`bm_buffer.aseprite`, um arquivo que o Brush Manager escreve pela janela); "usar como pincel" (põe `app.activeBrush`,
que em lote não pinta nada: o adaptador carimba no lugar).

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

**Não exposto**: favoritos, etiquetas, grupos, recentes, atalhos, cache, procurar duplicados, renomear em lote (tudo
janela e preferências); pincéis de várias camadas (`applyMultiLayerBrush` lê as partes pela janela; o adaptador usa o
pincel achatado); giro pela direção do traço (precisa do traço do mouse; `angulo` por chamada faz o mesmo à mão);
"pincel vivo" traço a traço (vira o `pincel.efeito`, sobre a camada inteira ou um retângulo); criar pincel por seleção,
por grade, por quadros e a prévia de ladrilho sem emenda (janelas de `brush_create.lua`; `pincel.criar` e
`livebrush.conjunto` cobrem o útil).

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

**Não exposto**: os conjuntos salvos (`brushsets.json`, vazio hoje) e a janela de conjuntos; os atalhos; o pincel
ativo do Aseprite (`set_brush`/`get_brush`). Nada disso tem sentido sem alguém pintando.

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

**Não exposto**: duplicar e deslocar, duplicar e girar, redimensionar a cópia da seleção (copiam e colam como
seleção flutuante e a movem com `MoveMask`/`Scroll`, que precisam do editor); folha de sprites da seleção, exportar
seleção, exportar camadas, quadros a partir da seleção (trocam de aba com `GoToNextTab` para voltar ao arquivo); centrar
a prévia e o xadrez (só a tela); deslocar matiz/saturação/valor (age nas cores marcadas na paleta da janela e lê
`Color(app.pixelColor)`, que fora dela não é cor; para isso, o `adjust_hsl` do MCP `aseprite` ou o comando
`HueSaturation`).

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

## Quando uma extensão atualizar

`node tools/aseprite_extensoes.mjs verificar` diz qual mudou. Antes de aceitar a versão nova: copiar a pasta para a
cópia de segurança, conferir se as funções que o adaptador usa (as listas em `algoDG`, `algoBM`, `FUNCOES_LB` e os
`CarbsToolbar_MAIN_*` chamados) continuam com o mesmo nome e os mesmos parâmetros, rodar as ações numa cópia de teste,
e só então trocar a versão em `EXTENSOES` no topo de `extensoes.lua`.
