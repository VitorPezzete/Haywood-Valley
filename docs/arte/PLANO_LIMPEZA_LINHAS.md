# Plano de design: removedor de *doubles* e *jaggies* (2026-10-22)

Pedido do usuário: "o removedor de doubles e jaggies". São os dois defeitos de linha que mais denunciam arte feita por script ou por IA, e o modo Pixel Perfect do Aseprite só os evita no traço à mão, não numa imagem pronta.

## Definições

- **Linha**: pixels de uma mesma cor (ou de uma lista de cores, por padrão a cor do contorno: o preto `#010000` do Aeko) que formam um traço de 1 px, ligados em 8 direções.
- ***Double***: num traço de 1 px, o pixel de canto que forma um "L" (tem um vizinho da linha na horizontal e outro na vertical, e esses dois se tocam pela diagonal). Tirar o pixel não desconecta a linha; deixá-lo engrossa o traço naquele ponto.
- ***Jaggy***: num trecho de linha inclinada, os degraus (corridas horizontais ou verticais) com comprimentos irregulares, por exemplo 3-1-3-2-3 em vez de 3-3-3 ou 3-2-3-2. A regra dos pixel artists: num trecho reto as corridas são iguais, ou alternam de um jeito regular; numa curva elas só crescem ou só diminuem.

## Algoritmo

### *Doubles*

1. Para cada pixel P da cor de linha, olhar os 8 vizinhos.
2. P é *double* se: tem exatamente um vizinho da linha na horizontal (A) e um na vertical (B); A e B são vizinhos diagonais um do outro; P não é ponta de linha; e o "número de conexões" do 3×3 (como no afinamento de Zhang-Suen) continua 1 sem P, ou seja, tirar P não parte a linha.
3. Exceções que ficam: P em junção (3 ou mais ramos), P em área preenchida da mesma cor (bloco 2×2 da cor de linha), e P marcado como protegido (lista de pontos, ou máscara numa camada).
4. Substituir P pela cor certa do lado de onde ele está: a cor da maioria dos vizinhos em 4 direções que não são linha (o preenchimento de dentro, ou transparente do lado de fora). Nunca uma cor nova.
5. Repetir até não sobrar *double* (no máximo 3 passadas).

### *Jaggies*

1. Seguir cada linha de 1 px (depois de tirar os *doubles*) como cadeia de pixels, de ponta a ponta (ou em volta, se for fechada).
2. Quebrar a cadeia em trechos de direção parecida (os ângulos dos degraus mudam de lado quando o traço vira; esquinas e junções fecham trecho).
3. Em cada trecho, ler as corridas. Classificar:
   - **reto regular**: corridas iguais, ou alternando com padrão (2-1-2-1, 3-3-2-3-3-2);
   - **curva regular**: corridas só crescendo ou só diminuindo (1-1-2-3-4);
   - **jaggy**: o resto. A pontuação é quanto as corridas se afastam do padrão mais próximo.
4. **Modo relatório** (padrão): devolve cada trecho com problema (pontos, corridas, padrão sugerido) e um PNG ampliado com os pixels marcados.
5. **Modo correção** (`corrigir = true`): redesenha o trecho entre as duas pontas como a linha regular mais próxima (Bresenham para reto; para curva, corridas reordenadas em ordem monotônica), só se:
   - nenhum pixel sai mais de 1 px do lugar;
   - o trecho não encosta em outra linha ou junção;
   - as cores dos dois lados podem ser copiadas dos vizinhos (nada de cor nova).

   Fora disso, só relata.

### Pixels órfãos (extra, barato)

Pixel isolado cuja cor não aparece em nenhum dos 8 vizinhos: relatar; com `corrigir_orfaos = true`, trocar pela cor da maioria dos vizinhos.

## Interface

Lua: `aseprite/pixel/limpeza.lua`.

```lua
local L = dofile([[...\aseprite\pixel\limpeza.lua]])
L.analisar_imagem(img, opcoes) -> relatorio            -- puro
L.limpar_imagem(img, opcoes) -> Image, relatorio        -- puro
L.limpar{ arquivo?, camada, quadro?, cores_linha = {"#010000"} | "auto", area?, doubles = true,
          jaggies = "relatar"|"corrigir"|false, orfaos = "relatar"|"corrigir"|false,
          protegidos?, saida_camada?, png?, png_escala? } -> relatorio
```

`cores_linha = "auto"`: a cor mais escura que forma traços de 1 px. O relatório traz a contagem de cada defeito, as coordenadas e a nota da linha (0 a 10), para o crítico de pixel art usar depois.

Menu (extensão Diorama): Arquivo > Diorama > **Limpar doubles e jaggies…** com prévia: mostra quantos de cada defeito, aplica numa camada nova ou na mesma (desfazível).

## Testes

- Casos montados: linha diagonal com *doubles* (tem de sair 1 px e ligada), escada 3-1-3-2-3 (tem de virar regular), curva 1-1-2-3-4 (não pode mexer), junção em T e cruz (não pode mexer), bloco cheio 2×2 (não pode mexer), contorno fechado de um círculo.
- A vaca (`novas/vaca/vaca.aseprite`): relatório; o contorno dela foi feito pelo Outline do Aseprite, então se espera poucos *doubles*; conferir que a correção não abre buraco no contorno (cada componente da cor de linha continua um só).
- Nenhuma cor nova; o número de componentes conectados da cor de linha não aumenta.
- Saída do RotSprite a 30° e 45° antes e depois da limpeza.

## Fora do escopo

*Banding* e *pillow shading* (são do crítico de pixel art, que vem depois e vai usar este relatório).

## Implementado (2026-10-22)

- Código: `aseprite/pixel/limpeza.lua`. Testes: `aseprite/pixel/testes.lua`, por `npm run teste:pixel` (junto com os do RotSprite, `docs/arte/PLANO_ROTSPRITE.md`).
- Menu: Arquivo > Diorama > **Limpar doubles e jaggies…** (extensão 0.4.0; `docs/diorama/ASEPRITE.md`): cor de linha (`#010000`, uma lista separada por vírgula ou `auto`), doubles (corrigir ou não), jaggies e órfãos (relatar, corrigir, não), só a seleção, resultado numa camada nova (`<camada> limpa`) ou na mesma, e o PNG do relatório (abre no Aseprite). A prévia no pé do diálogo mostra quantos de cada defeito e a nota, e se refaz a cada mudança. Uma transação só: Ctrl+Z desfaz.

Exemplo (MCP `aseprite`, `run_lua_script` com `filename` = o `.aseprite`):

```lua
local L = dofile([[C:\Users\Szortek\Documents\Haywood-Valley\aseprite\pixel\limpeza.lua]])
local rel = L.limpar{ camada = "corpo_e_cabeca", jaggies = "corrigir", saida_camada = "corpo limpo", png = [[C:\...\relatorio.png]] }
print(rel.doubles.corrigidos, rel.jaggies.encontrados, rel.jaggies.corrigidos, rel.orfaos.encontrados, rel.nota, rel.depois and rel.depois.nota)
-- Só o relatório, sem mexer: L.analisar_imagem(app.sprite.layers[6]:cel(1).image, { jaggies = "relatar" })
-- L.limpar{ ..., salvar = true } grava o arquivo; o run_lua_script não grava sozinho.
```

O relatório: `cores_linha`, `total_linha`, `doubles { encontrados, corrigidos, pontos }`, `jaggies { encontrados, corrigidos, pontuacao, trechos = { pontos, corridas, sugerido, padrao ("reto" | "curva"), pontuacao, desvio_max, fora (os pixels fora do padrão), corrigido, motivo (por que não corrigiu) } }`, `orfaos { encontrados, da_linha, corrigidos, pontos }`, `componentes_antes/depois`, `cores_novas`, `mudados`, `nota` e, se algo mudou, `depois { doubles, jaggies, orfaos, nota }` (uma nova análise do resultado). Coordenadas: do sprite em `limpar`, da imagem em `analisar_imagem`/`limpar_imagem` (ou somadas a `origem`). No PNG: vermelho = double, amarelo = trecho com jaggy, laranja = pixel dele fora do padrão, magenta = órfão; com correção, o depois ao lado. O padrão de `orfaos` e de `jaggies` é "relatar"; o de `doubles`, corrigir.

## O que mudou na implementação

- **Quina reta não é double.** Pela definição do plano, a quina de um retângulo de contorno (e a de um contorno feito pelo Outline do Aseprite com a matriz quadrada) é um "L" e sairia, deixando o retângulo com as quinas comidas. Ficou uma exceção a mais: se os dois braços seguem retos por mais um pixel além de A e de B, é quina, não degrau.
- **Cor de quem sai.** "A maioria dos vizinhos em 4 direções que não são linha" são sempre dois (os opostos a A e a B), e empatam quando um é o miolo e o outro o fundo. Ficou um voto: os dois de lado valem 2, a diagonal de fora do "L" vale 1, e no empate fica o primeiro (o oposto a A). Fora da imagem conta como transparente.
- **Contagem de doubles.** O relatório conta o que a remoção tira, em ordem (linha a linha, até 3 passadas), numa cópia. Numa escada de 2 px de grossura, os dois pixels de um degrau são doubles, mas tirar um resolve; contar os dois daria o dobro do que a correção faz.
- **Seguir a linha.** As cadeias usam a vizinhança mista (m-adjacência): a diagonal só liga dois pixels se nenhum vizinho de lado comum aos dois é linha. Sem isso, cada "L" virava um triângulo e todo pixel de canto parecia junção. Pixels em bloco 2×2 não entram nas cadeias; encostar neles fecha a cadeia (como uma junção).
- **Divisão em trechos.** Um trecho usa um passo de lado e uma diagonal vizinha (E e NE, por exemplo); quando a linha vira para NE e N, os passos diagonais do fim servem aos dois trechos. Sem isso a divisão dependia do sentido em que a linha foi seguida, e só metade dos defeitos simétricos de um círculo aparecia.
- **Reto regular** = a palavra dos passos é equilibrada (o mesmo que ser um segmento de reta digital). Cobre os exemplos do plano (2-1-2-1, 3-3-2-3-3-2, corridas iguais) e as retas de inclinação "quebrada", e não deixa passar corridas que diferem em 2 ou mais. **Curva regular** = corridas que não descem ou que não sobem (1-1-2-3-4 passa).
- **Pontas cortadas.** A primeira e a última corrida de um trecho só contam se ali é ponta livre da linha; se o trecho continua noutro (ou para numa junção), a corrida da ponta está cortada: fica fora da conta e nunca se mexe. Trecho com menos de 3 corridas contadas não é classificado.
- **Padrão sugerido e pontuação.** Dois candidatos: a reta digital entre as duas pontas (as pontas não mudam) e as mesmas corridas em ordem crescente ou decrescente (a curva). Fica o de menor desvio somado (empate: a reta). A pontuação é esse desvio, em pixels; `desvio_max` é o maior. A correção pede `desvio_max` ≤ 1, como no plano; o lugar que fica vago pega a cor do vizinho do lado oposto ao movimento (nada de cor nova), e nenhum pixel de linha fora do trecho (e de dois pixels da cadeia de cada lado) pode encostar nos pixels mexidos.
- **Órfãos** incluem o furo transparente de 1 px. A troca vai para a cor que mais aparece nos 8 vizinhos; no empate, a que mais aparece nos 4 de lado. O RotSprite passa `orfao_legitimo` para não mexer nos órfãos que já existiam no original.
- **`cores_linha = "auto"`**: entre as cores com 8 pixels ou mais e com 60% deles fora de bloco 2×2 da mesma cor, a mais escura (luminância). Em indexado, a lista de cores vira os índices da paleta com aquela cor.
- **`area`**: a análise vê a imagem inteira (uma linha cortada pela borda da área teria pontas falsas), mas só relata e só mexe dentro dela.
- **`saida_camada`** ausente = a mesma camada; o menu usa `<camada> limpa` por padrão. `protegidos` aceita lista de pontos, uma Image (máscara), uma função ou, em `limpar`, o nome de uma camada.
- **Nota** (heurística, para o crítico de pixel art afinar depois): defeitos = doubles + desvio dos jaggies + 0,5 × órfãos da cor de linha; nota = 10 × (1 − 3 × defeitos / pixels de linha), no mínimo 0.

## Resultados dos testes (2026-10-22, Aseprite 1.3.18.6, `npm run teste:pixel`)

- Diagonal com doubles (escada de 2 px de grossura, 6 degraus): 5 doubles tirados, nenhum sobra, 1 px, um pedaço só, nenhuma cor nova.
- Escada 3-1-3-2-3 (linha livre; seguida do outro lado, sai 3-2-3-1-3): 1 jaggy, pontuação 3, sugerido 2-3-2-3-2 (reta); corrigida com 6 pixels trocados, a nova análise não acha jaggy; o modo relatório não mexe.
- Curva 1-1-2-3-4, retas 2-1-2-1-2, 3-3-2-3-3-2-3 e 4-4-4-4, junções em T, cruz e Y, bloco 2×2, quadrado com contorno: 0 pixels mexidos (doubles, jaggies e órfãos em "corrigir").
- Círculos de ponto médio (com miolo) de raio 5 e 9: 0 defeitos. Raio 14: 0 doubles e 8 jaggies de verdade (o algoritmo do ponto médio deixa um 3-1-2-1 em cada oitavo); corrigidos 16 pixels, o contorno continua fechado (as regiões de dentro e de fora não se juntam), um pedaço só, nenhuma cor nova.
- Protegidos (lista e máscara): nada muda. Órfãos: um vermelho no meio do creme vira creme, um solto no fundo vira transparente. `auto` acha `#010000` no quadrado.
- Sprite indexado com a célula em (17, 9): 5 doubles tirados numa camada nova, pontos nas coordenadas do sprite, nenhum índice novo; Ctrl+Z (`app.undo`) tira a camada; com `area` só os de dentro saem.
- A vaca (`novas/vaca/vaca.aseprite`, achatada): 288 pixels de `#010000`, 1 pedaço; **1 double, 1 jaggy** (1-2-2-2-1-1-1 no perfil do focinho, sugerido 1-2-1-2-1-2-1), 14 órfãos (nenhum da cor de linha: o brilho do olho e detalhes de 1 px no focinho, nas patas e nas manchas), nota 9,58. Corrigindo doubles e jaggies: 7 pixels, o contorno continua um pedaço só e fechado, nenhuma cor nova. Camada a camada no arquivo (13 camadas, células deslocadas), nenhuma camada parte o contorno nem ganha cor.
- Saída do RotSprite sem a limpeza dele, antes → depois desta limpeza (doubles corrigidos, jaggies em "corrigir"): a 30°, 33 doubles, 3 jaggies, 15 órfãos, nota 5,95 → 0 doubles, 1 jaggy (2 corrigidos; o terceiro, 2-1-2-2-2-1-4-1, encosta em outra linha e só é relatado), nota 9,66; a 45°, 29 doubles, 0 jaggies, 15 órfãos, nota 6,87 → 0 doubles, nota 10. Nenhuma cor nova, a linha não parte.
- A olho (PNGs `limpeza_*.png` na pasta do teste): a escada vira 2-3-2-3-2; na vaca, a correção só alisa o perfil do focinho; nos giros, o contorno fica de 1 px sem os cantos em "L".
