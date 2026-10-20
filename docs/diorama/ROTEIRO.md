# Diorama: roteiro (reconstruído em 2026-10-20)

O roteiro original tinha etapas de A a F. O jogo cita E (ações no lugar, item 17), E1, E2 (decorar a casa) e F (moradores). A a D são **(palpite)**: o que precisou existir antes para E ser possível. Cada etapa diz o que entregou pelo que o jogo mostra e cita a fonte.

## A. Pintar **(palpite)**

Pintar um mapa com as folhas do Aeko em três camadas (chão, objeto, frente), com o vazio, os tiles animados e os de uma cor só reconhecidos. Entregou: o formato do bloco (12.3) e os mapas `exemplo_comodo` e `comodo_ferramenta` (20 × 31, o cômodo da ferramenta, com a parede na camada de objeto: `decor.ts`, `wallAt`).

## B. Catálogo **(palpite)**

As zonas das folhas (12.4) e as regiões com id, tipo e regras (12.5), geradas em `plugin/src/generated/catalogoAeko.ts` e `catalogoPecas_<n>.ts` a partir do `mapa_folhas.json` do guia do Aeko (`lightTiles.ts`, `fixtures.ts`). O carimbo de peça com a regra de fundos (12.14) e o encaixe na parede (12.12, 12.13) e as ferramentas `fundos.ts`, `encaixe.ts`, `detectar.ts`, `paredes.ts`. Entregou: os ids que o jogo cita (`casa8`, `casa42`, `casa@56,25`…).

## C. Ponte e gerador **(palpite)**

A ponte no disco (`diorama/mapas/<mapa>/blocos/0_0.json`) e o gerador `tools/diorama_jogo.mjs` que escreve `src/shared/interiors/<mapa>.ts` e `index.ts` (`types.ts`, cabeçalho). Entregou: `blocks`, `actions`, `flat`, `stamp` e a paleta derivados.

## D. Teste no jogo **(palpite)**

O jogo monta o mapa (`buildInterior`), com os atributos `InteriorTeste` e `InteriorTesteCelula` (12.9), o bloqueio em volta e o Output com o `stamp`. Entregou: `casa_teste_v2` e as variações (`_atual`, `_l`, `_menor`), `banheiro_equipe`, `castelo_passagem`.

## E. Ações no lugar (item 17: baú e fogão)

Confirmado em `shared/fixtures.ts` ("etapa E do roteiro do Diorama, item 17") e `FixtureService`: o baú abre e fecha, o fogão acende e apaga, trocando tiles célula a célula pela versão da mesma folha; dormir na cama passa a noite quando todos dormem. O estado vale só para a sessão, como a torneira. Cozinhar chama um gancho que hoje só avisa no Output. Os itens 1–16 da etapa E não aparecem no código **(palpite: sentar, deitar, nadar, água rasa, empurrar, segurar e puxar, levantar, carregar, pôr no chão, jogar, torneira; `ActionController`, cabeçalho)**.

## E1. Os mapas no mundo e as peças que se empurram e carregam **(palpite de conteúdo)**

Confirmado só pelo título em `interiorChoice.ts` ("os mapas no mundo (etapa E1)"): cada mapa num lugar só dele (`MAP_SPACING` 512), o atributo `Mapa` do jogador, o servidor sabendo em que mapa está cada um (`MapService`) e as peças móveis por mapa (`PieceService`, `Room`). As peças que se seguram, puxam, levantam e jogam (`pieceDefs.ts`, `pieces.ts`, `PieceBoard`) vieram junto ou antes; o código não diz em que etapa.

## E2. Decorar a casa

Confirmado em `decor.ts` ("etapa E2 do roteiro do Diorama, aprovada pelo usuário: 'decorar no jogo com as mesmas regras de encaixe e de fundo do Diorama'"), `DecorController` e `DecorService`: o dono da casa (`HOUSE_MAPS` = `casa_teste_v2_l`, uma cópia por dono, até 200 casas por servidor, decisão do usuário em 2026-10-18) põe peças do inventário de teste, move, gira e guarda, e muda de lugar as peças móveis; o servidor confere com a mesma regra e grava em `PlayerData.decor`. O catálogo do Decorar sai do gerador `--decorar` (`decorCatalog.ts`).

## F. Moradores

Confirmado em `ResidentController` e `puppet.ts` ("etapa F do Diorama, seção 12.20"): o objeto `morador` no bloco, desenhado como um jogador, parado, sentado ou deitado, com bloqueio; o mapa `moradores_jogo`. As ligações e zonas (12.17, `MapService`, `MapController`, mapas `teste_d_*`, `exterior_ilha` ↔ `casa_teste_v2_l`) e o exterior (12.7, `exterior_32`, `exterior_ilha`) estão prontos no jogo; o código não diz se foram parte de E1, de F ou de uma etapa entre elas.

## O que vem depois (o que o código anuncia)

- **Moradores vivos** (12.20, `ResidentController`): andar, falar (o nome já fica guardado para o diálogo, `DialogueController.say`), horários.
- **Visitar a casa de outro** (`DecorService`, `interiorChoice.ts`): "é só o servidor gravar o dono e o lugar dela no visitante"; o visitante vê a decoração, só o dono decora.
- **Inventário e itens** (`fixtures.ts`, `FixtureService.cook`, `decor.ts` `TEST_INVENTORY`): receitas e ingredientes do fogão; o que tem dentro do baú; o inventário de verdade no lugar do de teste ("só esta tabela e `stockOf` mudam"); a luva como item que muda o que o jogador puxa e levanta (`pieces.ts`, `handlingOf`, pedido do usuário em 2026-10-17).
- **A confirmar** no código: os baús grandes do castelo (4 × 4 / 4 × 6) ficam fora do abrir no lugar (`fixtures.ts`); o tempo de cozinhar (`COOK_SECONDS`) depende do inventário; a folha das peças recortadas (`acoes.carregaveis`) ainda sem o aval do usuário para enviar (`client/world/pieces.ts`).
- **Reconstrução** (`docs/PLANO_RECUPERACAO.md`): o gerador e o importador (os 14 mapas voltam a blocos), o plugin novo com as sete ferramentas de `ARQUITETURA.md`, `EXTERIOR.md`.
