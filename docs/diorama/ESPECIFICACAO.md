# Diorama: especificação (reconstruída em 2026-10-20)

A especificação original se perdeu na formatação. Esta foi refeita do que o jogo (`src/`) exige e cita: os tipos dos mapas gerados, as regras copiadas do plugin para `shared/decor.ts`, os comentários dos controllers e serviços, e os 14 módulos de `src/shared/interiors/`. As decisões de formato e de arquitetura estão em `ARQUITETURA.md` e valem sobre este texto. O que o jogo não deixa ver está marcado **(palpite)**; o que precisa de resposta do usuário está em `DUVIDAS.md`.

Os números das seções 12.3, 12.9, 12.12, 12.14, 12.17 e 12.20 são os que o código cita. Os demais números da seção 12 são **(palpite)**, escolhidos para encaixar entre eles. Cada regra cita o arquivo do jogo de onde saiu.

## 1. Visão

O Diorama é o plugin de Roblox Studio em que os mapas do Haywood Valley são pintados: interiores (casa, castelo) com as folhas de tiles do Aeko, exteriores (grama, caminho, areia, mar) e tudo o que o jogo precisa saber de um mapa (bloqueios, ações, ligações, zonas, moradores, começo). O plugin grava o mapa num bloco JSON pela ponte; o gerador transforma o bloco num módulo TypeScript (`src/shared/interiors/<mapa>.ts`) que o jogo compila. O jogo nunca lê o bloco nem o plugin: só o módulo gerado (`shared/interiors/types.ts`, cabeçalho).

Técnica do jogo (CLAUDE.md, "Arquitetura do mundo"): mundo 3D com chão plano, câmera fixa de cima em 3/4, tiles de 16 px deitados no chão num `SurfaceGui`, 32 pixels de arte por stud. O mapa do Diorama é desenhado por `client/world/interior.ts` (`buildInterior`).

## 2. Vocabulário

| Termo | O que é | Onde no jogo |
|---|---|---|
| Folha | Uma imagem de tiles do Aeko, 2048 × 512 = 128 colunas × 32 linhas de 16 px; no Roblox, duas metades de 1024 × 512 (colunas 0–63 e 64–127) | `InteriorSheet`, `INTERIOR_SHEETS` (`casa`, `castelo`) |
| Tile | Uma célula de 16 × 16 de uma folha: `[folha, coluna, linha]` | `InteriorTile` |
| Bloco | 64 × 64 células; o mapa que o jogo recebe é o bloco `0_0` | `BLOCK_TILES` em `interiorChoice.ts` |
| Célula | Uma posição do bloco, `(x, y)` de 0 a 63; toda coordenada do mapa (começo, entradas, saídas, zonas, moradores) é em células do bloco | `InteriorMap.inside`, `blocks()` em `interiorChoice.ts` |
| Camadas | Chão, objeto e frente, de baixo para cima, como no Graal | `InteriorLayers` |
| Zona da folha | O comportamento de um tile pelo retângulo da folha em que está (chão, bloqueia, senta, deita, água…) | `ZONES`, `tileZone` em `interiorMap.ts` |
| Zona do mapa | Um retângulo com nome e propriedades livres (`musica`, `ambiente`) dentro do mapa | `InteriorZone` |
| Tipo de tile (Graal) | 3 senta, 4 cama cima, 5 cama baixo, 6 água rasa, 11 água funda | `TileKind` |
| Região / peça do catálogo | Um retângulo de uma folha com id, tipo e regras (`casa8`, `casa@56,25`) | `PIECE_DEFS`, `LIGHT_TILES`, `DECOR_ITEMS` |
| Carimbo (ferramenta) | Pôr uma peça do catálogo no mapa com a regra de fundos (12.14) | `planDecor` em `decor.ts` |
| Carimbo (campo) | O hash de 12 hex do conteúdo do bloco, `InteriorData.stamp` | `SceneController.build` imprime |
| Vazio | O tile `[folha, 0, 2]`, preto, fundo de tudo | `backdrop`, `tileZone` → `"vazio"` |
| Ligação | Entrada (ponto com nome) e saída (retângulo que leva a outro mapa), como o `LINK` do Graal | `InteriorEntry`, `InteriorExit` |
| Morador | Um boneco posto no mapa, com visual salvo e pose | `InteriorResident` |

## 3. O jogo como consumidor

O que o jogo lê de um mapa (`shared/interiors/types.ts`):

- `INTERIORS[id]`: `InteriorData` de cada módulo gerado; `INTERIOR_SHEETS`: as metades de cada folha (chaves `aeko.<folha>.<metade>` do registro de assets); `EXTERIOR_SHEETS`: as imagens do exterior na ordem do número `imagem` de `terrain.runs` (`exterior.folha_juncao`, `exterior.forma_equipe_32`). Tudo em `shared/interiors/index.ts`, gerado.
- Atributos do `Workspace` que o jogo lê: `InteriorTeste`, `InteriorTesteCelula` (12.9), `AcoesTeste` (12.15), `CasaLugarTeste` (`MapService`), `HoraTeste`, `RelogioDesvio` (`shared/clock.ts`), e os de desenvolvimento `OrcamentoTeste`, `CelularTeste`, `PainelParaTodos` (`DevToolsController`).
- Atributos do jogador que o servidor grava: `Mapa`, `MapaCelula`, `MapaDono`, `MapaLugar` (12.17), `Action`, `Look`, `CharacterName`.
- Tudo o que o cliente e o servidor derivam do mapa (peças móveis, baús, fogões, luzes, janelas, bloqueios dos moradores) sai do próprio `InteriorData`, pelos tiles: o plugin não precisa gravar nada disso (12.15, 12.16).
- Mensagens no Output com prefixo: `[Interior]`, `[Mapa]`, `[Moradores]`, `[Pecas]`, `[Fixos]`, `[Decorar]`, `[Luz]`, `[Água]`, `[Som]`, `[graalArt]`.

## 4–11. Resumo **(palpite de numeração e de conteúdo)**

4. **Folhas e assets**: as folhas do Aeko e as demais imagens entram no Roblox pelo registro (`assets/registro.json` → `shared/assets.ts`); o jogo avisa uma vez por imagem sem id e segue sem ela (`water.ts`, `lights.ts`, `pieces.ts`).
5. **Studio e Rojo**: o Studio só recebe código pelo Rojo (porta 34872); o plugin não edita scripts.
6. **Ponte**: HTTP em `127.0.0.1:34873` (`ARQUITETURA.md`, "Ponte").
7. **Catálogo**: zonas, regiões e fundos em `diorama/catalogo/` (`ARQUITETURA.md`, "Catálogo"); o que o jogo já lista entra como semente (12.5).
8. **Geradores**: `diorama_jogo.mjs` (bloco → módulo; `--decorar` → `decorCatalog.ts`), `diorama_importar.mjs` (módulo → bloco).
9. **Testar**: atributos de desenvolvimento e Play pelo MCP do Studio (12.19).
10. **Diagnóstico**: a lista de problemas que o jogo avisa (12.19).
11. **Limites**: bloco de 64 × 64; coordenadas 0–63 (`DecorService.isCell`); folha de 128 × 32 tiles; nomes de mapa com letras minúsculas, números e `_`; nomes de entrada com letras minúsculas, números, `-` e `_` (`InteriorEntry`).

## 12. O editor de mapas

### 12.1 Folhas do Aeko e tiles de 16 px **(palpite de número)**

- Uma folha tem 128 colunas × 32 linhas de tiles de 16 × 16 (`InteriorTile`: coluna 0 a 127, linha 0 a 31). No Roblox ela vai em duas metades de 1024 × 512 (`InteriorSheet`); um recorte de várias células nunca passa da coluna 63 para a 64 (`HALF_COLS` e `mergeCells` em `client/world/interior.ts`). O plugin mostra a folha inteira; o gerador e o jogo cuidam das metades.
- Folhas conhecidas: `casa` e `castelo`. As duas têm as mesmas zonas, menos a linha 0 das colunas 32 a 63 (12.4).
- O tile `[folha, 0, 2]` é o vazio: preto, de uma cor só, fundo do canvas inteiro (`backdrop`). A coluna 0 das linhas 0–3 é "o vazio e o claro da prancha" (`interiorMap.ts`, comentário de `ANIMATION_FRAMES`).
- **Tiles animados**: a zona `[1–15, 0–3]`; cada coluna é um tile animado de 4 quadros, um por linha (o quadro n é a linha n da mesma coluna). O plugin deve mostrar a coluna como um tile só e deixar o autor pintar qualquer das 4 linhas: o jogo começa a animação na linha pintada, para patinhos lado a lado não boiarem juntos (`interior.ts`, `animate`). São as chamas, o fogo da lareira, os patinhos, a torneira da banheira (`casa`, coluna 5; fechada vira `[casa, 68, 19]`, `TAP_CLOSED`) e a água do fosso do castelo. 4 quadros por segundo (`TILE_ANIMATION_FPS`, "como pediu o usuário").
- **Tiles de uma cor só** (`flat`): o gerador lê o PNG da folha e marca, na paleta do mapa, os tiles cujos 256 pixels têm a mesma cor, com a cor em `0xRRGGBB` (`InteriorData.flat`: `[índice na paleta, cor]`). Só eles cobrem um retângulo esticados; o jogo estica o recorte do meio (8 × 8, a 4 pixels da borda: `FLAT_INSET`, `FLAT_SIZE`), porque o `ScaleType.Tile` do Roblox não repete um recorte (conferido no Studio em 2026-10-18). Exemplos no `teste_d_destino`: o vazio (`0x010000`), as tábuas lisas da parede (`0x9d4818`), o papel (`0x1e558b`).

### 12.2 Camadas chão, objeto e frente **(palpite de número)**

- Três camadas, de baixo para cima: chão, objeto e frente, como no Graal (`InteriorLayers`). Os tiles do Aeko são opacos, então cada célula mostra só o tile de cima: `frente ?? objeto ?? chão` (`InteriorMap.ground`, `topAt` em `interior.ts`). Tudo o que o jogo deriva por célula (zona, tipo, bloqueio, baú, luz, janela) usa esse tile de cima.
- No jogo, as três camadas vão deitadas no chão, num `SurfaceGui` só, e o boneco fica por cima de todo tile do mapa (`buildInterior`, "As três camadas"). O comentário de `InteriorLayers` diz que "a frente é desenhada por cima do boneco que passa atrás": é a intenção do Graal, não o que o jogo faz hoje (ver `DUVIDAS.md`).
- O autor pinta o vazio à mão onde quer que o mapa exista sem tile (o `teste_d_destino` tem a borda de vazio pintada no chão); o resto do canvas é o `backdrop`.
- O cômodo da ferramenta do Diorama (`comodo_ferramenta`) põe a parede na camada de objeto; a casa de teste (`casa_teste_v2_l`, decodificada) tem a parede no chão. O plugin só olha a parede na camada de objeto; o jogo aceita as duas (`wallAt` em `decor.ts`). O plugin novo deve aceitar as duas também (12.13).

### 12.3 Formato do bloco

O bloco JSON está definido em `ARQUITETURA.md` ("Bloco (formato 1)"); esta seção diz o que o gerador tira dele, conferido nos 14 módulos. O gerador tem de reproduzir os módulos byte a byte.

**`InteriorData`** (`shared/interiors/types.ts`), campo a campo:

| Campo | Como é derivado | Evidência |
|---|---|---|
| `id` | O `mapa` do bloco | todos |
| `stamp` | O `carimbo`: 12 hex | `teste_d_destino` `161e726893c1` |
| `x`, `y`, `width`, `height` | O retângulo pintado dentro do bloco: a caixa das três camadas **e** das células com terreno | `exterior_32`: `tiles: []`, 33 × 33 só pelo terreno; `teste_d_ligacoes`: 31 × 31 por um 2 × 2 de terreno em (29, 29) |
| `tiles` | A paleta: o `vazio` primeiro (índice 1); depois cada tile na ordem da primeira aparição, varrendo a camada de chão inteira em ordem de leitura, depois a de objeto, depois a de frente | `teste_d_destino`: os índices 2–17 são o piso (chão, linhas 9–13); o 18 é o canto da parede (objeto, linha 2) |
| `flat` | `[índice, cor]` dos tiles da paleta que têm uma cor só (lidos do PNG); ausente quando não há nenhum | `exterior_32` não tem |
| `layers` | Três listas de `height` linhas, cada linha `width` índices separados por espaço; `0` é célula vazia; só o retângulo `x, y, width, height` | todos |
| `blocks` | `height` linhas de `width` caracteres: `#` bloqueia, `.` passa (12.8) | todos |
| `actions` | `height` linhas: `3`, `4`, `5` (do tipo de tile), `~` mar fundo e `6` mar raso do exterior, `.` nada (12.8) | `exterior_ilha` |
| `backdrop` | O `vazio` do bloco, como tile | sempre `[folha, 0, 2]` |
| `spawn` | O `nascimento` | — |
| `terrain` | `{ tiles, layers, runs }` do exterior (12.7); ausente sem exterior | `exterior_32`, `exterior_ilha`, `teste_d_ligacoes` |
| `entries`, `exits`, `zones`, `residents` | Copiados (12.17, 12.20); ausentes quando vazios | — |

Observações:

- O módulo gerado começa com `import type { InteriorData } from "./types";`, o cabeçalho "Gerado por tools/diorama_jogo.mjs (npm run diorama:jogo -- <mapa>) a partir de diorama/mapas/<mapa>/blocos/0_0.json. Não editar: pintar no Diorama e gerar de novo." e `export const interior: InteriorData = { … }`. Em 2026-10-20 os módulos (e `index.ts`) ganharam um comentário na primeira linha ("Reconstruído … a partir do Luau compilado"); se o gerador novo o reproduz ou se a linha sai antes de comparar, ver `DUVIDAS.md`.
- `index.ts` lista os módulos em ordem alfabética (`map0`, `map1`…), `INTERIOR_SHEETS`, `EXTERIOR_SHEETS` e `INTERIORS`.
- Os mapas ficam lado a lado no mundo pela ordem alfabética do id, a `MAP_SPACING` = 512 studs (`mapCenter` em `interiorChoice.ts`); as casas dos jogadores, nos lugares 1 a 200 dos dois lados. Trocar o id de um mapa muda o lugar de todos.

### 12.4 Zonas das folhas **(palpite de número)**

`ZONES` em `shared/interiorMap.ts` ("cópia de `AEKO_ZONES` do catálogo do Diorama, `plugin/src/generated/catalogoAeko.ts`"): `[c0, l0, c1, l1, zona]`, vale a primeira que contém o tile.

| Colunas | Linhas | Zona |
|---|---|---|
| 0–15 | 0–3 | `animado` |
| 0–15 | 4–9 | `agua` (funda, tipo 11) |
| 0–15 | 10–11 | `agua_rasa` (tipo 6) |
| 0–15 | 12–17 | `lava` |
| 0–15 | 18–19 | `fere` |
| 0–15 | 20–23 | `senta` (tipo 3) |
| 0–15 | 24–25 | `deita` (tipo 4) |
| 0–15 | 26–31 | `normal` (piso) |
| 16–31 | 0–31 | `sem_pecas` |
| 32–63 | 0 | `frente` na `casa`; **`chao` no `castelo`** (a exceção da linha 0) |
| 32–63 | 1–19 | `chao` (piso) |
| 32–63 | 20–31 | `bloqueia` |
| 64–127 | 16–31 | `bloqueia` |
| 64–127 | 0–15 | `sem_pecas` |

Mais: `[folha, 0, 2]` é `vazio` antes de qualquer zona; tile fora de todas é `chao`. `tileKind`: `agua_rasa` → 6, `senta` → 3, `deita` → 4, `agua` → 11, o resto 0. Piso em que se pisa e onde uma peça pousa: `chao` ou `normal` (`isFloorZone`). A zona `deita` só marca o tipo 4; o tipo 5 (coberta) não vem de zona nenhuma: nos mapas de hoje ele só aparece nas células das peças do catálogo (`DecorCell.action` `"5"`, a cama do Decorar) — ver `DUVIDAS.md`.

O catálogo (`diorama/catalogo/zonas.json`) é a fonte destas zonas; o gerador copia para o jogo. Mudar uma zona é mudar o catálogo e gerar.

**Para onde olha quem senta** (`SEAT_FACING`, conferido nas folhas em 2026-10-17; `Facing`: 0 cima, 1 esquerda, 2 baixo, 3 direita): `casa` [0–1, 20–21] → 2; [2, 20–21] → 3; [0–1, 22–23] → 0; [2, 22–23] → 1; vaso [3–5, 20–23] → 1; vaso [6–8, 20–23] → 3; sofá [10–15, 20–21] → 2; `castelo` cadeira de pedra [0–1, 20–22] → 2. Assento fora da lista (as almofadas do castelo) senta virado para onde o boneco chegou. O catálogo guarda isso por região; o plugin usa para o morador sentado (12.20).

### 12.5 Catálogo de peças **(palpite de número)**

O que o jogo já lista, e que o catálogo tem de conter (ids como o jogo cita):

- **Peças móveis** (`shared/pieceDefs.ts`, "cada uma é uma região do catálogo do Diorama, o id é o de lá"): `casa8` cadeira 2 × 2 [0, 20]; `casa9` cadeira 1 × 2 [2, 20]; `casa10a` [0, 22] e `casa10b` [0, 23] 2 × 1; `casa11` [2, 22] 1 × 2; `castelo14` cadeira de pedra 2 × 3 [0, 20]; `casa42` e `casa43` potes 2 × 2 [37, 20] e [37, 22] (família `pot`, variantes 0 e 1); `casa67` caixote 2 × 1 [54, 20]; `casa46`, `casa47`, `casa64` baús 2 × 2 [45, 20], [45, 22], [47, 22]; `castelo68` barril 2 × 3 [61, 20]. Campos: `kind`, `blocks`, `lift`, `breaks`, `weight`, `family`, `variant`.
- **Luzes** (`client/world/lightTiles.ts`, regiões de `catalogoPecas_*.ts`, "gerado do `mapa_folhas.json` do guia do Aeko"): tocha `casa` [1, 0–3]; abajur `casa` [64, 31]; tocha `castelo` [8–9, 0–3] (coluna 8); lareira `castelo` [10–11, 0–3] (coluna 10); lareira `casa` [58, 31] (a lareira com chaminé `casa@56,25` acende só pelo halo: a folha não tem quadro de fogo para ela, conferido em 2026-10-18); tocha de parede `casa` [64, 28]; vidro de noite `castelo` [56, 31]. Fontes de luz sem o tom do dia (`SOURCE_TILES`): `casa` [1, 0–3], [64, 31]; `castelo` [8–13, 0–3], [55–57, 29–31].
- **Janelas com versão de noite** (`WINDOWS`): dia [40, 25] ↔ noite [78, 19], 3 × 3; [62, 24] ↔ [78, 22], 3 × 3; [43, 25] ↔ [81, 19], 4 × 3; [44, 28] ↔ [81, 22], 4 × 3; só na `casa`. A janela com vaso (`casa@55,25`) não tem versão de noite.
- **Baús e fogão** (`shared/fixtures.ts`, do `mapa_folhas.json`): baús 2 × 2 fechado/aberto célula a célula (`casa` [45–46, 20–21] → [47–48, 22] + [45–46, 24]; `casa` [45–46, 22–23] → [47–48, 22–23]; `castelo` [64–65, 16–17] → [66–67, 18] + [64–65, 20]; `castelo` [64–65, 18–19] → [66–67, 18–19]); fogão `casa79` [61–63, 27–31], coluna apagada [63, 27–30] ↔ acesa [64, 27–30] (`casa80` boca, `casa183` forno). Os baús grandes do castelo (4 × 4 fechados, 4 × 6 abertos) ficam de fora ("a confirmar").
- **Inventário do Decorar** (`shared/decorCatalog.ts`, gerado por `--decorar`): `chair`, `table`, `pot`, `rug`, `picture`, `window`, `shelf`, `bed`, `torch`, `lamp`, todos da `casa`, com `icon` `[coluna, linha, largura, altura]`, `forms` (direção; `facing` quando é assento) e `variants` (12.14).
- **Fundos** (`DECOR_BACKGROUNDS`): 25 tipos da `casa` e 23 do `castelo`, cada um com a lista de tiles (`linha × 128 + coluna`). Só os da `casa` têm nome traduzido (`decor.bg.<id>` em `i18n`); os demais aparecem como "outra coisa".

Campos de uma região no catálogo (`ARQUITETURA.md`): nome, id, folha, retângulo, camada sugerida, tipo, ação (`3`/`4`/`5`), bloqueio, variantes, encaixe, fundos exigidos.

### 12.6 Ferramentas de pintura **(palpite)**

Pincel de um tile, retângulo, balde, borracha e conta-gotas, por camada; a camada ativa recebe o tile escolhido na folha. Não há nada no jogo que determine o comportamento delas; `ARQUITETURA.md` lista o conjunto.

### 12.7 Exterior: grama, caminho, areia e mar **(palpite de número)**

O que o jogo mostra (`shared/interiors/types.ts` `ExteriorRun`, `client/world/interior.ts` "O exterior", `client/world/water.ts`):

- O bloco guarda o terreno por célula (`exterior.terreno`, códigos) e os decalques (`exterior.decalques`). O gerador compõe o exterior em `terrain.runs`: uma lista de recortes de imagem já juntados, que o cliente só desenha. "Os recortes têm só pixels opacos ou transparentes: empilhados, dão os mesmos pixels que o plugin compõe (`plugin/src/exterior.ts`)." Ou seja: o plugin compõe a imagem do exterior na tela (base + encontros + decalque por célula) e o gerador reproduz a mesma composição em recortes.
- `ExteriorRun` = `[imagem, i, j, w, h, sx, sy, sw, sh, z, quadros, dx, dy]`: a imagem (índice em `EXTERIOR_SHEETS`), o canto e o tamanho em células **do retângulo do mapa** (não do bloco), o recorte em pixels, a camada (`z` 0 base; 1 em diante encontros e decalques; `ZIndex = z + 1`), os quadros e o passo do recorte por quadro.
- Regra dos recortes (lida dos módulos): um retângulo de células de um tile de uma cor só vira um recorte de 8 × 8 a 4 pixels do canto do tile, esticado (`sx = coluna × 16 + 4`, `sy = linha × 16 + 4`); qualquer outro é cópia 1:1 (`sw = w × 16`, `sh = h × 16`), contínuo na imagem. Recorte animado: `quadros > 1` e o recorte anda `(dx, dy)` pixels por quadro, todos no mesmo quadro (4 por segundo, o mesmo relógio dos tiles animados e do mar de fora).
- `terrain.tiles` = número de células com terreno; `terrain.layers` = número de recortes célula × camada antes de juntar (`exterior_32`: 1089 = 33 × 33 e 1217; `teste_d_ligacoes`: 4 e 4). São só estatística para o Output.
- Imagens: `exterior.folha_juncao` ("a folha de 16 px da grade dupla") e `exterior.forma_equipe_32` ("as formas de 32 px da equipe"). Na folha da junção, pelos módulos e por `water.ts`: linha 36 = base do mar fundo (`DEEP_BASE`), linha 37 = base do mar raso (`SHALLOW_BASE`), linha 38 = base da grama (`sy` 612); as bases têm variantes nas colunas 0–3; a linha 41 guarda um padrão de 2 × 2 tiles (caminho ou areia, **palpite**) que o `exterior_32` repete; a linha 46 tem decalques de 32 × 32 (`sx` 128 e 160); as linhas 8–11 têm os decalques animados de 16 px do mar (4 quadros, `dy` 64); a linha 44 tem um decalque animado de 32 × 32 (4 quadros, `dx` 32). A `forma_equipe_32` tem as bordas de 32 px (cantos e lados de uma área) usadas no `exterior_32` em volta do retângulo de caminho. O detalhe fica para `EXTERIOR.md` (engenharia reversa do gerador).
- **Mar de fora**: no mapa com exterior, a margem do canvas é de 64 × 32 tiles (`SEA_MARGIN`) e o mar fundo enche tudo fora do retângulo do mapa (`createSea`: `mar.infinito.0–3`, 512 × 512 por quadro, repetidas com `ScaleType.Tile`); o vazio cobre só o retângulo. Sem exterior, a margem é 48 × 26 (`DEFAULT_MARGIN`) e o vazio enche o canvas.
- O exterior é desenhado nas células sem tile; onde há tile, o tile cobre. `backdrop` continua `[casa, 0, 2]` nos mapas de exterior.
- **Bloqueio e ação no exterior**: o terreno nunca bloqueia (`exterior_ilha`: `blocks` todo `.`, inclusive no mar). O mar fundo marca `~` em `actions` (tipo 11: nada) e o mar raso marca `6` (tipo 6: os pés na água) (`InteriorMap.kind`: "o gerador marca a célula (não há tile de chão)"). Como o bloco distingue mar fundo de raso não se vê no jogo (`ARQUITETURA.md` tem só o código `m`): ver `DUVIDAS.md`.

### 12.8 Bloqueios e ações derivados **(palpite de número)**

- `blocks`: `#` quando o tile de cima da célula (12.2) está na zona `vazio` ou `bloqueia`; `.` nos demais, inclusive água (a água não bloqueia: `InteriorMap.kind`, comentário) e terreno. Evidência no `teste_d_destino`: vazio `#`, parede [34–43, 25–31] `#`, piso `.`. Se `sem_pecas` bloqueia, não se vê nos mapas de hoje (todos usam só `chao`, `bloqueia`, `vazio`, `senta`, `deita`, `animado`): `ARQUITETURA.md` deixa como palpite.
- Fora do retângulo do mapa tudo bloqueia (`InteriorMap.blocked`; o cliente põe uma volta de bloqueio em torno do retângulo).
- `actions`: `3`, `4`, `5` pelo tipo de tile do tile de cima; `~` e `6` do exterior; `.` nos demais. A água das folhas **não** entra em `actions`: o jogo tira o tipo 11 e 6 da zona do tile de chão, só quando o tile de cima é o próprio chão (`InteriorMap.kind`).
- Moradores: a célula de cada um bloqueia (e, de quem deita, a coluna da cama); isso é feito no jogo (`InteriorMap.residentCells`, `ResidentController`), não no gerador. Em `ARQUITETURA.md`, `blocks` "nos moradores" é palpite; nos módulos de hoje (`moradores_jogo`) não dá para separar.
- `bloqueios.mais` e `.menos` (ajustes à mão): **palpite** de `ARQUITETURA.md`; nenhum mapa de hoje precisa deles.

### 12.9 O jogo recebe o mapa

- **Gerar**: `npm run diorama:jogo -- <mapa>` escreve `src/shared/interiors/<mapa>.ts` e refaz `index.ts` (`types.ts`, cabeçalho; `index.ts`, cabeçalho). `npx rbxtsc` compila e o Rojo leva ao Studio.
- **Teste de interior** (`shared/interiorChoice.ts`, `interiorTest`): com o atributo `InteriorTeste` do `Workspace` = id de um mapa gerado, o jogo entra direto no interior, sem menu nem personalização; `InteriorTesteCelula` = `"x,y"` (células do bloco) escolhe onde o personagem começa; sem ele, vale o `spawn`. Lido uma vez, no começo, pelo cliente e pelo servidor (os dois chegam ao mesmo mapa). Avisos: mapa não gerado (lista os que o jogo conhece), célula mal escrita, célula que bloqueia (cai no `spawn`).
- **Jogo normal**: `START_INTERIOR` = `casa_teste_v2_l` (pedido do usuário em 2026-10-17, a casa de teste v2 no lugar da cena do protótipo); `undefined` volta à cena antiga. O teste vale mais que o começo (`chosenInterior`).
- **No servidor** (`MapService.join`): ao entrar, o jogador recebe `Mapa` = o mapa escolhido e `MapaCelula` = a célula; o personagem é levado à célula depois de o avatar ser reduzido. A casa (`HOUSE_MAPS` = o mapa de começo) ganha `MapaDono` e `MapaLugar`.
- **Montagem** (`SceneController.build`, `buildInterior`): imprime `[Interior] <chave> (<stamp>): N tiles em M imagens no chão (exterior: …); K bloqueios; I instâncias; montado em T ms`. O `stamp` é como se confere no Output que o mapa montado é o gerado por último.
- **Avisos ao montar**: folha desconhecida ("rode npm run diorama:jogo de novo"), imagem do exterior sem id, personagem que nasceu fora do bloco (`MapController.checkSpawn`, 0–63).
- **Peças de teste das ações** (`AcoesTeste` = true, `InteriorMap.addTest`): um pote, um caixote, um baú e uma piscina de água funda 5 × 4 postos no piso livre mais perto do começo, só no mapa em que o jogo começa (`actionsStart`). Não fazem parte do mapa.

### 12.10 Nascimento **(palpite de número)**

- `nascimento` → `spawn`, uma célula do bloco. Deve ser piso livre: o jogo não confere o `spawn` em si, mas toda chegada que bloqueia cai nele (`arrivalCell`), e a célula de teste que bloqueia também. O plugin confere antes de salvar (`ARQUITETURA.md`, Problemas: "célula de nascimento bloqueada").
- Ao renascer, o jogador volta à célula em que chegou ao mapa (`MapaCelula`), não ao `spawn` (`MapService.place`).

### 12.11 Desfazer e refazer **(palpite)**

Pilha de estados do bloco; nada no jogo determina. `ARQUITETURA.md` o lista entre as ferramentas.

### 12.12 Encaixe: janela e quadro na parede (`encaixe.ts`)

Copiado para `shared/decor.ts` ("a coluna onde o jogador aponta e a altura tirada da parede do cômodo"). No catálogo gerado, a variante que encaixa traz `snap: DecorSnap = [tipo, linha, papel?]`, `tipo` `"quadro"` ou `"janela"`, `linha` a distância do topo da parede, `papel` `"azul"` ou `"amarelo"` só para janela (`decorCatalog.ts`).

Regra (`planDecor`, ramo `variant.snap`):

1. A coluna é a apontada: `x = canto da primeira variante + variant.dx`, com o canto centrado na célula apontada (`cornerFor`: `ax − floor((w − 1) / 2)`).
2. A altura vem da parede: `top = topAbove(mapa, ax, ay)`, a linha do topo da parede de fundo acima da célula apontada (12.13); sem topo, recusa `decor.refuse.noWall` ("vai na parede do fundo de um cômodo: aponte dentro de um cômodo"). `y = top + snap.linha + variant.dy`.
3. Para cada célula da peça, a parede sob ela (`wallAt`: objeto, senão chão) tem de ter o mesmo topo (`topAbove(tx, ty) === top`), senão `decor.refuse.crossWall` ("não passa de uma parede a outra"); e tem de ser papel: para quadro, papel azul ou amarelo (`isPaper`); para janela, o papel da variante (`isBluePaper` [34–36, 27–29] ∪ [38–39, 27–29]; `isYellowPaper` [54–55, 21–22]). Se não é papel, `decor.refuse.wall` ("só no papel de parede, nas 3 linhas sob a viga"); se é papel mas do outro tipo (janela), `decor.refuse.paper`.
4. Das variantes que encaixam, fica a que combina melhor com o fundo (`betterFit`), **sem recusar por fundo** ("como no plugin"): a peça de parede nunca é recusada por conflito de fundo.
5. A primeira recusa de encaixe é guardada; se nenhuma variante encaixa, ela é o motivo.

Peças com encaixe hoje: `picture` (`["quadro", 2]`, 3 × 3), `window` (`["janela", 2, "azul"]` [40, 25] e `["janela", 2, "amarelo"]` [62, 24]), `torch` (`["quadro", 3]`, 1 × 2: a chama [1, 0] sobre o suporte [41, 30]). A `lamp` (abajur [64, 31]) não encaixa: fica onde o fundo é `papel_amarelo`.

No plugin, o carimbo de uma região com encaixe se comporta igual: a coluna do mouse, a linha calculada da parede do cômodo sob o mouse, e a peça fantasma aparece meio transparente onde cabe e bem apagada onde não cabe (`DecorController`, `GHOST_OK` 0,3 e `GHOST_REFUSED` 0,75, "como no carimbo do Diorama").

### 12.13 Paredes e detecção (`detectar.ts`, `paredes.ts`) **(palpite de número)**

O jogo copiou só o que o inventário usa (`decor.ts`, "a parede"). Todos os tiles são da `casa`:

- Topo da parede (`isTopStrip`): [34–39, 25] e [41–42, 28]. Topo da chaminé (`isChimneyTop`): [56–60, 25]; chaminé inteira: [56–60, 25–31]. Pilar (`isPillar`): [32–33, 24–31]. Linha de cima por dentro (`isTopRowInside`): topo, topo da chaminé ou [32–33, 25]. Cantos de cima (`isTopCorner`): [40, 28] e [43, 28].
- Parede de baixo (`isBottomWall`): [41–42, 31]; linha de baixo (`isBottomRow`): ela mais [40, 31] e [43, 31]. Pontas de parede de 1 e 2 tiles (`isWallEnd`): [42, 30], [41, 29], [42, 29].
- Vazio (`isVoid`): [0, 2] e [58, 16–18]. Face da parede (`isFaceTile`): [34–39, 26–31] e [54–56, 20–23] menos [54–55, 20].
- `wallAt(x, y)`: a peça de parede da célula é a da camada de objeto ou, sem ela, a do chão (o plugin original só olhava a de objeto; o novo deve olhar as duas).
- `sharedTop(x, y)`: a linha que dois cômodos empilhados dividem conta como topo do de baixo: a célula é parede de baixo ou ponta e a célula logo abaixo é face, chaminé ou pilar.
- `topAbove(x, y)`: sobe da célula até a linha de cima do mapa; devolve a linha em que acha topo por dentro, canto de cima ou topo dividido; para (sem topo) ao cruzar uma linha de baixo que não seja a própria célula de partida, ou ao achar célula sem tile ou vazio.

Isto é o que o plugin precisa para o encaixe. O que mais `detectar.ts` e `paredes.ts` faziam (detectar cômodos inteiros, pintar paredes com uma ferramenta própria) é **palpite** de `ARQUITETURA.md` ("paredes 12.13").

### 12.14 Carimbo e fundos (`fundos.ts`)

A regra do carimbo do plugin, copiada para `shared/decor.ts` (`fitOf` = `fitAt` do plugin, `betterFit`, `planDecor`) e as tabelas que o gerador `--decorar` escreve em `decorCatalog.ts`.

**Tabelas**:

- `DECOR_BACKGROUNDS`: tipos de fundo, `[folha, id, tiles]`, tiles como `linha × 128 + coluna`. Um tile pode ter mais de um tipo (`typesOf`).
- `DECOR_EXACT`: listas de tiles que entram embaixo de uma célula **sem costura** (o tile de baixo é desenhado pela própria peça, então qualquer destes é "exato").
- `DECOR_TYPE_SETS`: conjuntos de tipos de fundo aceitos **com costura**.
- `DecorCell` = `[dx, dy, coluna, linha, camada, exige, tipos, ação, bloqueia]`: `exige` é 1 + índice em `DECOR_EXACT` (0 = nada exigido), `tipos` é 1 + índice em `DECOR_TYPE_SETS` (0 = os tipos da variante), `ação` `"3"`/`"4"`/`"5"`/`"."`, `bloqueia` 0/1.
- `DecorVariant` = `{ w, h, dx, dy, types, snap?, cells }`: `dx, dy` deslocam a variante em relação à primeira; `types` são os tipos de fundo que a variante foi desenhada para (índices em `DECOR_BACKGROUNDS`). `DecorForm` = `{ facing?, variants }`: uma direção da peça (a cadeira de frente, de lado…). `DecorItem` = `{ id, sheet, icon, forms }`.

**Fundo, célula a célula** (`fitOf`): para cada célula da variante com `exige ≠ 0`, o tile que está embaixo (`under`: o tile de cima do mapa, `InteriorMap.ground`):

- sem tile: ignora;
- o próprio tile da célula, ou um da lista `DECOR_EXACT[exige − 1]`, na mesma folha: **exata**;
- senão, se o tile tem algum tipo de fundo entre os aceitos (`DECOR_TYPE_SETS[tipos − 1]`, ou `variant.types` quando `tipos` = 0; conjunto vazio aceita tudo): **costura**;
- senão: **conflito**; o primeiro tile em conflito fica guardado para o motivo.

**Escolha da variante** (`betterFit`): menos conflitos; empate, mais exatas; empate, mais células conferidas (exatas + costuras). Entre as variantes da direção escolhida, a melhor vence.

**Recusa**: peça do chão (sem `snap`) com conflito na melhor variante → `decor.refuse.background` ("{peça} precisa de {até 3 tipos da variante}; aqui há {tipo do tile em conflito}"), com a peça já no lugar calculado. Depois, para cada célula da variante escolhida: fora do mapa ou sobre vazio → `decor.refuse.outside`; sobre saída → `decor.refuse.door`; sobre peça (móvel, decoração, morador) → `decor.refuse.blocked`; célula sem exigência de fundo (`exige` = 0) de **peça de parede** (todos os `types` em `WALL_BACKGROUNDS`: `papel_azul`, `poste`, `viga`, `lambri`, `papel_amarelo`, `lambri_amarelo`, `parede_tabuas`, `face_pedra`, `topo_bege`, `muralha_lado`) pede parede do mesmo tipo embaixo ("o rabo do peixe nas tábuas"), senão `decor.refuse.background`; de **peça do chão** pede piso livre (`freeFloor`: não bloqueia, tipo 0, zona `chao` ou `normal`), senão `decor.refuse.blocked`; célula que bloqueia com jogador em cima → `decor.refuse.player` (só o servidor sabe).

**Posição**: o canto da primeira variante centra a peça na célula apontada (`cornerFor`); a variante escolhida soma o `dx, dy` dela. O jogo grava só `item forma ax ay` (onde o jogador apontou) e refaz a variante e o canto ao carregar, "então um mapa redesenhado não deixa peça em cima de parede: a que não couber mais volta ao inventário" (`PlayerDecor`).

**No plugin**: o carimbo de uma região aplica a mesma regra sobre as camadas do bloco, mostra a fantasma (12.12), escolhe a variante de menos conflitos e recusa com o motivo quando nenhuma serve; `ARQUITETURA.md` deixa as "variantes" e os "fundos exigidos" como campos da região no catálogo, e o gerador `--decorar` tem de reproduzir `decorCatalog.ts` a partir deles.

### 12.15 Peças móveis, baús e fogões no mapa **(palpite de número)**

Nada disso é gravado pelo plugin: o jogo acha tudo nos tiles. O plugin só precisa deixar o autor pintar as regiões inteiras.

- **Peças móveis** (`InteriorMap.findPieces`): cada lugar da camada de objeto em que uma peça de `PIECE_DEFS` aparece inteira e na ordem da folha, sem nada na frente, com piso de verdade (`chao`/`normal`) em todas as células do chão, vira uma peça com id `<def.id>@x,y`. Onde ela estava, o jogo mostra o piso da camada de chão e não bloqueia (`origin`). A peça pintada sobre parede ou balcão (sem piso embaixo) fica onde está, como tile.
- **Variante pelo piso** (`shared/pieceFloors.ts`, gerado por `tools/acoes_fundos.py`, perdido): por família (`pot`), um algarismo por tile da zona de piso (colunas 32–63, linhas 1–19) dizendo a versão que combina com ele; `PieceBoard.variantFor` vota pelas células do chão.
- **Baús e fogões fixos** (`findFixtures`): baú 2 × 2 cujos tiles de cima batem com uma das listas (fechado ou aberto; aberto no mapa começa aberto), id `chest@x,y`; fogão pela coluna da direita [63 ou 64, 27–30] com [62, linha] à esquerda, id `stove@esquerda,y`, aceso só com a coluna toda acesa. O estado vale só para a sessão.
- **Torneira** (`InteriorMap.taps`): toda célula com o tile de cima na coluna 5 das linhas 0–3 da `casa`.

### 12.16 Luzes e janelas **(palpite de número)**

Também derivado dos tiles (`lightTiles.ts`, `lights.ts`): cada tile de `LIGHT_TILES` acende um halo (lareira, tocha, abajur, janela de noite) no centro dado; as janelas de `WINDOWS` trocam o recorte inteiro pela versão de noite e recebem a mancha do sol de dia e a da lua à noite (pedido do usuário em 2026-10-18). O plugin pode mostrar no catálogo quais regiões acendem luz, mas não grava nada.

### 12.17 Ligações e zonas

Formato (`shared/interiors/types.ts`), copiado do bloco:

- **Entrada** `InteriorEntry = { name, x, y }`: um ponto de chegada com nome (letras minúsculas, números, `-` e `_`), em células do bloco. Nomes nos mapas de hoje: `entrada`, `porta_casa`, `porta`, `porta_dos_fundos`.
- **Saída** `InteriorExit = { x, y, width, height, map, arrival? }`: um retângulo (células do bloco), o mapa de destino (id do Diorama) e a chegada: o nome de uma entrada de lá, uma célula `[x, y]` de lá, ou nada. "Como o `LINK` do Graal."
- **Zona** `InteriorZone = { name, areas, props }`: retângulos `[x0, y0, x1, y1]` inclusivos e propriedades livres de texto. O nome é uma chave de texto do jogo (`zone.…`, traduzida: hoje só `zone.island`) ou o texto que o autor escreveu (`Sala`, `Quarto grande`).

**Chegada** (`arrivalCell` em `interiorChoice.ts`): célula pedida, se não bloqueia; senão a entrada com o nome pedido (ou `entrada` quando não há chegada), se não bloqueia; senão o `spawn`, com aviso `[Mapa]` quando a chegada pedida não existe ou bloqueia.

**Servidor** (`MapService.takeExit`): o cliente que pisa numa saída pede `takeExit`; o servidor recusa (`exitRefused`, aviso `[Mapa] … saída recusada (motivo)`) se o pedido vem a menos de 1 s do anterior, se o jogador não tem mapa ou personagem, se o personagem não está numa saída (com folga de 1 célula, esperando até 0,75 s), se o mapa mudou no caminho, ou se o destino não foi gerado (`o destino "<mapa>" não foi gerado para o jogo`). Aceito: solta a peça que ele segura, grava `MapaCelula` e `Mapa` (e dono/lugar se o destino é casa), pede o streaming do lugar novo e leva o personagem. Imprime `[Mapa] <nome>: <de> → <para> (<x,y>)`.

**Cliente** (`MapController`): a saída só dispara depois de o jogador ter saído de todas as saídas uma vez (para não voltar quem chega numa porta) e com a tela do jogo à mostra; o véu fecha em 0,15 s, o pedido vai, o `SceneController` monta o mapa novo quando `Mapa` muda, espera o personagem chegar (até 1,5 s, senão o próprio cliente o põe na chegada) e o véu abre em 0,25 s. Sem resposta em 3 s, o véu abre. A zona é a primeira da lista cujo retângulo contém a célula do pé (`zoneAt`); ao entrar numa zona, o nome aparece no canto por 3 s. Só muda quando o pé muda de célula.

**Som** (`SoundController.placeProps`, `shared/sounds.ts`): `props.ambiente` escolhe o perfil de ambiente (`casa`, `exterior`, `mar`) e `props.musica` o lugar da música (`ilha`, `sala`); sem zona, valem os de `MAP_SOUND_PROPS` do mapa (`exterior_ilha`: mar/ilha; `casa_teste_v2_l`: casa/sala) e, fora da lista, `exterior` com terreno, `casa` sem. Ambiente desconhecido avisa e vale `exterior`. O Decorar recusa peça sobre saída (`decor.refuse.door`).

**Validações que o plugin deve fazer antes de salvar** (as que o jogo só avisa em tempo de jogo): saída para mapa que não existe ou não foi gerado; chegada com nome que o destino não tem; chegada (nome ou célula) que bloqueia; retângulo de saída ou zona fora do bloco; nome de entrada com caracteres fora do permitido; nome de zona que começa com `zone.` sem tradução em `i18n`.

Mapas de hoje: `teste_d_origem` → `teste_d_destino` (chegada `porta_casa`), zona `Sala` com `musica: sala`; `casa_teste_v2_l` ↔ `exterior_ilha` (chegadas `porta_casa` e `porta`), zona `zone.island` com `ambiente: mar`, `musica: ilha`; `teste_d_ligacoes` com `entrada`, `porta_dos_fundos` e zona `Quarto grande` sem propriedades.

### 12.18 Salvar na ponte e o carimbo **(palpite de número)**

O plugin grava o bloco com `PUT /mapas/<id>/blocos/<bx>_<by>` e pode pedir `POST /gerar/<id>`. O `carimbo` é o hash de 12 hex do conteúdo do bloco, que o gerador copia para `stamp`; o jogo o imprime ao montar (12.9), então o autor confere no Output que o Studio está com o mapa gerado por último. Como o hash é calculado (algoritmo e o que entra) não se vê no jogo: ver `DUVIDAS.md`.

### 12.19 Testar no Studio e problemas **(palpite de número)**

- O plugin grava `InteriorTeste` e `InteriorTesteCelula` no `Workspace` e dá Play (12.9). Outros atributos úteis: `AcoesTeste` (peças de teste), `CasaLugarTeste` (o lugar da casa a partir de um número, para conferir o desenho longe da origem), `HoraTeste`, `RelogioDesvio` (relógio), `OrcamentoTeste`, `CelularTeste`, `PainelParaTodos` (`DevToolsController`).
- Problemas que o jogo avisa e o plugin deve apontar antes: imagem sem id no registro; folha desconhecida; mapa de saída não gerado; chegada inexistente ou bloqueada; morador com visual que não abre; tile fora da folha; nascimento bloqueado; personagem fora do bloco; ambiente desconhecido.

### 12.20 Moradores

Formato (`InteriorResident`, "o objeto `morador` do Diorama"): `{ name, x, y, facing, look, pose }`.

- `name`: nome próprio, não se traduz; guardado para o diálogo que vem depois.
- `x, y`: a célula do pé, do bloco.
- `facing`: 0 cima, 1 esquerda, 2 baixo, 3 direita. Sentado, "olha para onde o Diorama guardou (o lado do assento, ou o que o autor girou)": o plugin propõe o `SEAT_FACING` do assento (12.4) e deixa girar. Deitado, o jogo ignora: fica de frente (2), com a cabeça no travesseiro.
- `look`: o visual salvo, texto de `encodeSavedLook` (`shared/playerData.ts`): `gênero|id da cabeça|id do corpo|cores|estilos`. Gênero 0 masculino, 1 feminino; ids de cabeça e corpo são os dos contribuidores em `graalData.ts` (`zar160black`, `jen34`, `aly2`, `bea-masc6g`…); cores são 12 números separados por vírgula (pele, cabelo, olhos, 3 enfeites, 6 partes da roupa, na ordem `COLOR_KEYS`), `-1` = a cor original da peça, senão `0xRRGGBB` em decimal; estilos são duas letras, a da cabeça e a do corpo, `a` Aeko ou `o` original. Exemplo: `1|aly2|beasbody|-1,3368652,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1|oo`.
- `pose`: `idle` (de pé), `sit` (num assento), `lie` (numa cama).

**O que o jogo faz** (`ResidentController`, "etapa F do Diorama, seção 12.20"): desenha cada morador como um jogador (`puppet.ts`), parado, sentado ou deitado (pelo `ActionController.lieResident`, com a cabeça no travesseiro e a coberta por cima); pisca, pega o tom do dia e a luz dos halos. Ninguém o atravessa: a célula dele tem bloqueio (12.8) e as peças e o Decorar a recusam. Fora da tela não tem boneco. Só as folhas dos visuais dos moradores do mapa são pré-carregadas. Imprime `[Moradores] <mapa>: N morador(es), M folha(s)`.

**Validações** (do jogo; o plugin confere antes): `decodeSavedLook` recusa texto vazio ou grande demais, cabeça ou corpo que não existem e cores fora de `-1…0xffffff` → aviso `[Moradores] <mapa>: o visual de <nome> não abre (<texto>); o morador fica de fora`. Deitado: a célula é a de uma cama (tipo 4 ou 5 em `actions`); `bedFor` sobe pela coluna do tipo 5 até o travesseiro (tipo 4) ou desce do 4 até o último 4; sem cama, o morador fica em pé na célula. Sentado: nada é conferido; convém que a célula seja tipo 3. A célula não deve ser bloqueada nem repetida entre moradores.

**No plugin**: ferramenta de pôr morador numa célula com nome, visual (escolhido como na tela de personalizar: cabeça, corpo, cores, estilos) e pose, mostrando o boneco no mapa. "Os moradores ainda não andam nem falam (os moradores vivos vêm depois, 12.20)": andar, falar e horário são de uma etapa seguinte (`ROTEIRO.md`).

Mapa de hoje: `moradores_jogo` (26 × 33), com Tião (idle, 1), Rosa (sit, 2), Lia (lie), Bento (idle, 2).
