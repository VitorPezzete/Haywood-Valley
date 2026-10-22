# Plano de design: RotSprite nosso (2026-10-22)

Pedido do usuário: "fazer o RotSprite" (girar pixel art sem borrar nem criar cores), porque a rotação do Aseprite tem defeitos conhecidos (distorção no RotSprite dele, giros de 90° que saem tortos em algumas versões) e eu, que desenho por script, preciso girar peças, pincéis e quadros de animação sem estragar o traço.

## Objetivo

Girar uma imagem de pixel art em qualquer ângulo **sem criar cor nova**, mantendo linhas de 1 px como linhas de 1 px, contorno fechado e silhueta legível. Rodar dentro do Aseprite (Lua), em lote para mim (MCP `aseprite`, `run_lua_script`) e no menu para o usuário (extensão Diorama).

## Algoritmo

Base: o RotSprite de Xenowhirl (2007), em três passos, com melhorias.

1. **Ampliar 8× com Scale2x (EPX) três vezes.** O Scale2x olha os 4 vizinhos e só copia cor que já existe: as diagonais viram degraus suaves sem misturar cores. Comparação de cor: igualdade exata por padrão; opção `tolerancia` (distância no OKLab) para arte com ruído de compressão.
2. **Girar a imagem 8× pelo vizinho mais próximo** em torno do pivô (padrão: centro da área; opção `pivo = {x, y}` em pixels da imagem original, ou o pé do sprite). A tela de saída cresce para caber a imagem girada (opção `recortar = true` mantém o tamanho).
3. **Reduzir de volta a 1×.** Para cada pixel de saída, olhar o bloco 8×8 correspondente e escolher a cor:
   - padrão `centro`: a amostra do centro do bloco (o original);
   - `maioria`: a cor mais frequente no bloco, com desempate pela mais perto do centro; segura melhor linhas finas;
   - transparência: o pixel só é opaco se a maioria do bloco for opaca (evita franja).
4. **Limpeza opcional** (`limpar = true`, padrão): pixels órfãos criados pelo giro (1 px isolado de uma cor que não está em nenhum vizinho) voltam para a cor da maioria dos vizinhos; o contorno é reconferido pelo removedor de *doubles* (`docs/arte/PLANO_LIMPEZA_LINHAS.md`), só nos pixels que o giro mexeu.

Casos exatos, sem passar pelos passos acima: 0°, 90°, 180° e 270° (troca de linhas e colunas, pixel por pixel), espelhos horizontal e vertical. Ângulos são normalizados (−90 = 270).

## Interface

Lua: `aseprite/pixel/rotsprite.lua`.

```lua
local R = dofile([[...\aseprite\pixel\rotsprite.lua]])
R.girar_imagem(img, angulo, opcoes) -> Image, info   -- puro, sem sprite
R.girar{ arquivo?, camada, quadro?, angulo, pivo?, area?, reducao = "centro"|"maioria",
         tolerancia?, limpar?, recortar?, saida_camada?, png?, png_escala? } -> info
R.folha{ ..., angulos = {0, 45, 90, ...} | passos = 8 } -> info  -- uma tira com o sprite girado em N ângulos
```

`info` diz o tamanho final, o deslocamento aplicado, quantas cores existiam antes e depois (tem de ser igual ou menor) e quantos pixels a limpeza mexeu.

Menu (extensão Diorama, `aseprite/diorama/diorama.lua`): Arquivo > Diorama > **Girar (RotSprite)…** com ângulo, pivô, redução e limpeza; resultado numa camada nova (o original fica).

## Testes

- 0°, 360°: imagem idêntica. 90°, 180°, 270°: igual à rotação exata pixel a pixel.
- Nenhuma cor nova em nenhum ângulo (0 a 359, de 15 em 15) em três imagens: a vaca (`Haywood-Valley-recuperado/novas/vaca/vaca.aseprite`), uma linha diagonal de 1 px, um quadrado com contorno.
- Ida e volta (girar 30° e −30°) perde no máximo uma fração pequena dos pixels (medir e registrar).
- Comparar a 45° com o RotSprite do Aseprite (`app.command.Rotate`, preferência de algoritmo RotSprite): contar pixels órfãos e *doubles* nos dois; o nosso tem de ter menos ou igual.
- Sprite indexado e RGB; camada com célula deslocada (posição ≠ 0).

## Fora do escopo

Girar mantendo animação entre quadros com interpolação; escala não inteira (o algoritmo serve, mas fica para depois).

## Implementado (2026-10-22)

- Código: `aseprite/pixel/rotsprite.lua` (usa `aseprite/pixel/limpeza.lua`, que ele carrega da mesma pasta). Testes: `aseprite/pixel/testes.lua`, rodados por `npm run teste:pixel` (`tools/testes/pixel.test.mjs`: acha o Aseprite pelo `ASEPRITE_PATH`, pelo `.mcp.json` ou na Steam, roda em `-b`, copia a vaca para uma pasta temporária e deixa lá os PNGs ampliados de conferência).
- Menu: Arquivo > Diorama > **Girar (RotSprite)…** (extensão 0.4.0; `docs/diorama/ASEPRITE.md`).

Exemplo (MCP `aseprite`, `run_lua_script` com `filename` = o `.aseprite`):

```lua
local R = dofile([[C:\Users\Szortek\Documents\Haywood-Valley\aseprite\pixel\rotsprite.lua]])
local info = R.girar{ camada = "corpo_e_cabeca", angulo = 30, pivo = "pe", png = [[C:\...\corpo30.png]], png_escala = 6 }
print(info.camada, info.largura, info.altura, info.cores_antes, info.cores_depois, info.limpeza.orfaos, info.limpeza.doubles)
-- R.girar{ ..., salvar = true } grava o arquivo; o run_lua_script não grava sozinho.
```

Opções além das do plano: `espelho = "h" | "v"` (antes do giro), `opacidade = "maioria" | "amostra"` (ver abaixo), `cores_linha` (padrão `"auto"`, a cor de linha que a limpeza confere), `paleta` (indexado), `salvar`; em `folha`, `novo_sprite` (padrão true: abre a tira num sprite novo, com a grade do tamanho da célula). `R.girar_grade` faz o mesmo sobre a grade da limpeza (`L.grade`). O ângulo é **positivo no sentido do relógio**, como o Rotate do Aseprite. `pivo`: `"centro"` (padrão, o centro da célula ou da área), `"pe"` (meio da base do que é opaco) ou `{x, y}` em coordenadas contínuas (o canto de cima à esquerda do pixel 0 é 0,0), do sprite em `girar`/`folha` e da imagem em `girar_imagem`. `info.deslocamento` é onde o canto da imagem girada fica em relação ao da original; `girar` já põe a célula nova nesse lugar (`info.posicao`).

## O que mudou na implementação

- **Comparação com o RotSprite do Aseprite.** Em lote (`-b`) o `app.command.Rotate` com ângulo livre não faz nada: com seleção ele chama o editor (`startSelectionTransformation`, que não existe sem interface), e sem seleção só gira de 90 em 90. Mudar a preferência de algoritmo também gravaria no `aseprite.ini` do usuário, com o Aseprite dele aberto. O teste usa então uma **réplica** do algoritmo do Aseprite 1.3, lida no código da v1.3.15 (`src/doc/algorithm/rotsprite.cpp` e `rotate.cpp`) e escrita em `testes.lua` (`rotspriteAseprite`): Scale2x três vezes repetindo o pixel da borda, paralelogramo com os cantos truncados para inteiro e a volta a 1× pelo `scale_image`, que anda (8L−1)/(L−1) pixels por pixel com arredondamento (não pega o centro do bloco; é a distorção conhecida dele). A conta é a mesma; a posição de um ou outro pixel pode diferir da do Aseprite de verdade.
- **Borda no Scale2x**: fora da imagem conta como transparente (o Aseprite repete o pixel da borda). Para um sprite, o que está fora da célula é transparente de verdade; repetir a borda deixava quinas quadradas onde a célula encosta no conteúdo.
- **Giro e redução num passo só**: a imagem 8× girada não é montada; para cada pixel de saída, as 64 amostras do bloco 8×8 são levadas de volta pelo giro inverso até a imagem 8× (vizinho mais próximo). É o mesmo resultado, com 1/64 da memória.
- **Transparência**: a regra "opaco só se a maioria do bloco for opaca" vale para as duas reduções (o plano a punha como um terceiro item). Com `centro`, se o centro cai no transparente mas a maioria do bloco é opaca, o pixel pega a cor opaca mais frequente do bloco. `opacidade = "amostra"` desliga a regra (o RotSprite original: só a amostra do centro).
- **"Só nos pixels que o giro mexeu"** virou: os órfãos que já existiam no original (mesma cor, no pixel de origem ou a 1 px dele, como o brilho de 1 px no olho da vaca) ficam; os doubles cujo pixel de origem já era double no original ficam protegidos. O resto passa pela limpeza (órfãos primeiro, depois doubles). A cor de linha padrão é `"auto"` (a vaca dá `#010000`).
- **Limpeza da linha nos casos exatos**: 0°, 90°, 180°, 270° e os espelhos não passam pela limpeza (a imagem é a mesma, só trocada de lugar).

## Resultados dos testes (2026-10-22, Aseprite 1.3.18.6, `npm run teste:pixel`: 25 casos, 25 passam)

- 0°, 360°, −360°, 720°: idênticas, deslocamento 0. 90°, 180°, 270°, −90°, 450°: iguais à rotação exata pixel a pixel (vaca, linha diagonal, quadrado com contorno). Espelhos h e v exatos.
- Nenhuma cor nova de 0° a 345°, de 15 em 15 (24 ângulos), nas três imagens, com as reduções `centro` e `maioria` (conferido pela info e por uma contagem independente). `tolerancia = 0.02` com ruído no miolo também não cria cor.
- Ida e volta (30° e depois −30° em volta do mesmo pivô): vaca 126 de 973 pixels diferentes (12,9%), linha diagonal 2 de 16 (12,5%), quadrado 10 de 80 (12,5%). O que se perde fica na borda (a silhueta anda meio pixel) e em detalhes de 1 px; o limite do teste é 20%.
- A 45°, contra a réplica do RotSprite do Aseprite (órfãos / doubles da cor `#010000` / pedaços da linha):

  | imagem | original | nosso (padrão) | nosso sem limpeza | nosso `maioria` | Aseprite |
  |---|---|---|---|---|---|
  | vaca 48×36 | 14 / 1 / 1 | 8 / 0 / 3 | 15 / 29 / 3 | 7 / 0 / 3 | 19 / 25 / 4 |
  | linha diagonal | 0 / 0 / 1 | 0 / 0 / 1 | 0 / 0 / 1 | 0 / 0 / 1 | 4 / 0 / 8 |
  | quadrado com contorno | 0 / 0 / 1 | 0 / 0 / 1 | 0 / 5 / 1 | 0 / 0 / 1 | 0 / 1 / 1 |

  Os órfãos da vaca original (14) são de propósito (o brilho do olho e detalhes de 1 px); a limpeza do giro guarda os que vêm deles, por isso o nosso ainda tem 8. A linha diagonal girada a 45° pelo Aseprite vira 8 pedaços soltos; a nossa continua uma linha só. Os 3 pedaços da vaca girada são o contorno do corpo (225 px) e dois pedaços em cima, na região dos chifres e da orelha (27 e 2 px), que se soltam no giro mesmo sem a limpeza (na réplica do Aseprite, 4); no original o contorno é um pedaço só (288 px).
- Sprite RGB e indexado com a célula em (20, 13): 90° na camada nova igual à rotação exata e com o centro no mesmo lugar; Ctrl+Z (`app.undo`) tira a camada; 37° com pivô no pé e `maioria`: nenhum índice novo (quadrado 12×10 → 17×16; indexado 9×6 → 12×11).
- `folha{ passos = 8 }`: tira de 8 células do mesmo tamanho, pivô no mesmo lugar, nenhuma cor nova. `recortar = true` mantém 12×10.
- Tempo: a vaca (48×36) a 33° com limpeza, 0,13 s.
- A olho (PNGs `rotsprite_45_*.png`, `rotsprite_ida_volta.png`, `rotsprite_folha_*.png` na pasta do teste): a vaca a 45° mantém o contorno fechado e de 1 px; a réplica do Aseprite sai mais estreita e com o contorno quebrado nas pernas. No quadrado a 45° as quinas viram pontas de 2×2 px (o Scale2x arredonda a quina para um bloco); a limpeza não mexe em bloco 2×2 de propósito.
