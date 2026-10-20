# Gerador e importador do Diorama (2026-10-20)

`tools/diorama_jogo.mjs` transforma o bloco JSON de um mapa em `src/shared/interiors/<mapa>.ts` (e refaz `index.ts`), e o catálogo em `src/shared/decorCatalog.ts`; `tools/diorama_importar.mjs` faz o caminho de volta a partir dos 14 módulos que sobreviveram à formatação. Código comum em `tools/diorama_lib/`. Os dois foram reconstruídos do zero contra os módulos: os 14 módulos, `index.ts` e `decorCatalog.ts` saem byte a byte iguais ao que existia (menos a cauda "Reconstruído em…" da primeira linha, que não era do gerador). O que é palpite está marcado **(palpite)**.

## Como rodar

Tudo pela raiz do repositório, só com o Node (e o `pngjs` das devDependencies, que lê as folhas):

```
npm run diorama:jogo -- <mapa>          bloco → src/shared/interiors/<mapa>.ts, e refaz index.ts
npm run diorama:jogo -- --todos         todos os mapas de diorama/mapas que têm blocos/0_0.json
npm run diorama:jogo -- --decorar       catálogo → src/shared/decorCatalog.ts
npm run diorama:jogo -- --folhas        monta diorama/folhas/casa.png e castelo.png das metades <folha>_0.png e _1.png
npm run diorama:jogo -- ... --conferir  só compara com o que está em src/, sem gravar (sai com 1 se difere)
npm run diorama:importar -- <mapa>      src/shared/interiors/<mapa>.ts → diorama/mapas/<mapa>/blocos/0_0.json e mapa.json
npm run diorama:importar -- --todos     todos os módulos da pasta
```

A ponte (`npm run diorama:ponte`) chama `npm run diorama:jogo -- <mapa>` em `POST /gerar/<mapa>` e `-- --decorar` em `POST /gerar/decorar`. O gerador só escreve em `src/` o que mudou e mantém o fim de linha do arquivo que existe (os módulos estão em CRLF, `decorCatalog.ts` em LF; arquivo novo sai em CRLF). O importador confere o round trip (gera de volta e compara) e diz `idêntico` ou `DIFERENTE`.

## Onde está cada coisa

| Caminho | O que é |
|---|---|
| `diorama/mapas/<mapa>/blocos/0_0.json` | O bloco (formato 1, abaixo). Só o que o autor pintou. |
| `diorama/mapas/<mapa>/mapa.json` | `{ versao, id, nome, folhas, blocos: [[0, 0]], data, origem }`. A ponte só exige `blocos`. |
| `diorama/folhas/` | `casa.png`, `castelo.png` (2048 × 512, as folhas inteiras do Aeko, montadas das metades `casa_0.png`, `casa_1.png`…) e `folha_juncao.png`, `forma_equipe_32.png` (o exterior). O gerador lê os pixels daqui. |
| `diorama/catalogo/zonas.json` | As zonas das folhas (`ZONES` de `interiorMap.ts`), as exceções, quais zonas bloqueiam e as ações por zona. |
| `diorama/catalogo/pecas.json` | As regiões das folhas que o jogo cita: id, folha, área, tipo, camada, bloqueio, ações por célula, as formas e variantes do Decorar, peças móveis, baús, fogão, luzes, janelas. |
| `diorama/catalogo/fundos.json` | Os tipos de fundo (`DECOR_BACKGROUNDS`). |
| `diorama/catalogo/exterior.json` | O layout das folhas do exterior: terrenos, junções, decalques, formas (`EXTERIOR.md`). |
| `tools/diorama_lib/gerar.mjs` | Bloco → `InteriorData` → texto do módulo e do `index.ts`. |
| `tools/diorama_lib/importar.mjs` | `InteriorData` → bloco. |
| `tools/diorama_lib/exterior.mjs`, `juntar.mjs` | A grade dupla e a junção em retângulos. |
| `tools/diorama_lib/catalogo.mjs`, `decorar.mjs` | Leitura dos catálogos; `decorCatalog.ts`. |
| `tools/diorama_lib/folhas.mjs`, `png.mjs` | As imagens e a cor dos tiles de uma cor só. |
| `tools/diorama_lib/carimbo.mjs` | O `stamp`. |
| `tools/diorama_lib/ler_ts.mjs` | Lê um módulo gerado (avalia o literal). |
| `tools/diorama_lib/json.mjs` | JSON legível (uma célula por linha). |
| `tools/diorama_lib/semear_catalogo.mjs` | Semeou `zonas.json`, `pecas.json` e `fundos.json` das tabelas do jogo; regravá-los é `node tools/diorama_lib/semear_catalogo.mjs`. |

## O bloco (formato 1)

O que `ARQUITETURA.md` desenha, com o que faltou. Um exemplo é `diorama/mapas/teste_d_origem/blocos/0_0.json`; um com exterior, `exterior_ilha`.

```jsonc
{
	"versao": 1,
	"mapa": "teste_d_origem",                 // id: letras minúsculas, números e _; igual ao nome da pasta
	"bloco": [0, 0],
	"folhas": ["casa"],                        // as folhas usadas (chaves de INTERIOR_SHEETS)
	"vazio": ["casa", 0, 2],                   // o backdrop: o tile que cobre o canvas por baixo
	"camadas": {                               // esparso: [x, y, folha, coluna, linha] por célula pintada
		"chao": [[0, 0, "casa", 0, 2], ...],
		"objeto": [...],
		"frente": [...]
	},
	"exterior": {                              // só nos mapas de fora (ver EXTERIOR.md)
		"terreno": ["....", "..mmmm..", ...],  // 64 linhas de 64 códigos: m mar fundo, r mar raso, a areia,
		                                       // c caminho, t terra, g grama, . nada (também aceita a lista de
		                                       // 64 × 64 códigos de ARQUITETURA.md, com "" para nada)
		"decalques": [{ "x": 21, "y": 15, "id": "flor_1" }],
		"formas": [{ "x": 6, "y": 8, "painel": "grama_areia", "bx": 1, "by": 0 }]
	},
	"bloqueios": { "mais": [[x, y]], "menos": [[x, y]] },   // ajustes à mão sobre o derivado; nenhum mapa precisa
	"acoes": [[x, y, "3"]],                                 // idem para o código de ação; nenhum mapa precisa
	"nascimento": [5, 10],
	"entradas": [{ "nome": "entrada", "x": 5, "y": 10 }],
	"saidas": [{ "x": 10, "y": 13, "largura": 2, "altura": 1, "mapa": "teste_d_destino", "chegada": "porta_casa" }],
	"zonas": [{ "nome": "Sala", "areas": [[2, 9, 9, 13]], "props": { "musica": "sala" } }],
	"moradores": [{ "nome": "Tião", "x": 9, "y": 12, "olhando": 1, "visual": "0|zar160black|...", "pose": "idle" }],
	"carimbo": "10f95da8a982",                 // vira stamp
	"carimbo_conteudo": "5ae9840d5c1b"         // o hash do conteúdo quando o carimbo foi gravado (abaixo)
}
```

`chegada` é um nome de entrada, `[x, y]` ou ausente. `pose` é `idle`, `sit` ou `lie`; `olhando` 0 cima, 1 esquerda, 2 baixo, 3 direita. Os campos `nota`/`notas` não entram no hash. Quando o exterior não cabe na grade dupla (ver EXTERIOR.md), o importador grava `"exterior": { "runs_importados": [...], "caixa_importada": { x, y, width, height } }` e o gerador copia os recortes; nenhum mapa de hoje precisou.

## O que o gerador deriva (conferido nos 14 módulos)

- **Caixa** (`x`, `y`, `width`, `height`): o menor retângulo que cobre as células das três camadas e as células com terreno (`teste_d_ligacoes`: 20 × 16 de tiles mais 2 × 2 de grama em (29, 29) dá 31 × 31).
- **Paleta** (`tiles`): os tiles na ordem de primeira aparição, camada por camada (chão inteiro em ordem de leitura, depois objeto, depois frente). O vazio só entra se foi pintado (em `castelo_passagem` não está). `layers` são as três camadas em linhas de números (1 + índice na paleta; 0 vazio), só do retângulo da caixa.
- **`flat`**: os tiles da paleta cujos 256 pixels na folha são iguais e opacos, com a cor em `0xRRGGBB`; omitido se não há nenhum. Lido de `diorama/folhas/<folha>.png`.
- **`blocks`**: por célula, `#` quando alguma das camadas pintadas tem um tile de zona que bloqueia (`zonas.json` `bloqueiam`: `vazio`, `bloqueia`, `animado` e, **(palpite)**, `sem_pecas`), ou quando a célula não tem tile nem terreno; `.` no resto, inclusive água, moradores e todo terreno (até o mar). A zona vem de `zonas.json` como `tileZone` de `interiorMap.ts`, com duas exceções por folha: a linha 0 das colunas 32–63 é chão no castelo, e as peças sob o rótulo "non-blocking" da folha do castelo (colunas 57–60, linhas 20–23) não bloqueiam (`castelo_passagem` põe as de 59–60 nas passagens entre as salas; incluí 57–58 pelo rótulo, **(palpite)**). Depois valem `bloqueios.mais` e `.menos`.
- **`actions`**: por célula, o código do tile de cima (frente, senão objeto, senão chão): `3` na zona `senta`, `4` na `deita`, e o que `pecas.json` diz por célula em `acoes` — a parte de baixo das duas camas da casa (colunas 0–7, linhas 26–29, zona `normal`) é `5` (`moradores_jogo`). Sem tile, com terreno: `~` mar fundo, `6` mar raso, `.` terra firme (EXTERIOR.md). Depois valem os ajustes de `acoes`.
- **`backdrop`**, **`spawn`**, **`entries`**, **`exits`**, **`zones`**, **`residents`**: copiados (`props` sai `{}` quando vazio; `arrival` só quando há `chegada`).
- **`terrain`**: EXTERIOR.md.
- **Texto**: tabs, 120 colunas como o `.prettierrc`; as listas de tiles, `flat` e `runs` ficam numa linha só quando cabem e senão são preenchidas até a largura; as linhas das camadas, `blocks` e `actions` uma por linha. `index.ts` lista os módulos da pasta em ordem alfabética (`map0`…), as folhas que eles usam e as duas imagens do exterior.
- **`--decorar`**: `DECOR_BACKGROUNDS` sai de `fundos.json` na ordem do arquivo; `DECOR_ITEMS`, das peças de `pecas.json` que têm `decorar`, na ordem do arquivo (a ordem do inventário); `DECOR_EXACT` e `DECOR_TYPE_SETS` são as listas `exatos` e `fundos` das células, numeradas na ordem em que aparecem (uma lista repetida reaproveita o número; uma lista vazia de `exatos` é uma exigência que nunca bate, como no original).

## O carimbo (`stamp`)

O original era "o hash de 12 hex do conteúdo do bloco"; o algoritmo se perdeu e nenhum dos 14 carimbos saiu de md5, sha1, sha256 ou sha512 do que tentei (o JSON do `InteriorData` sem o `stamp`, as camadas em texto, o bloco sem o carimbo, o texto do módulo com o `stamp` vazio). Então **(palpite, novo)**: o bloco guarda `carimbo` e `carimbo_conteudo` = sha256 (12 hex) do JSON canônico do bloco (chaves em ordem, sem `carimbo`, `carimbo_conteudo`, `nota`, `notas`). Enquanto o conteúdo dá o mesmo hash, o gerador usa o `carimbo` guardado (nos mapas importados, o antigo: os 14 `stamp` batem); quando muda, o `stamp` vira o hash novo e o gerador regrava o bloco com `carimbo` e `carimbo_conteudo` novos (não com `--conferir`). O plugin não precisa calcular nada: salva o bloco como está e o gerador cuida.

## Os catálogos

- **`zonas.json`**: `vazio` [coluna, linha]; `zonas` [[c0, l0, c1, l1, zona]] (vale a primeira); `excecoes` [{ folha, area, zona }] (antes das zonas); `bloqueiam` [zonas]; `acoes` { zona: código }.
- **`pecas.json`**: `pecas` [{ `id` (como o jogo cita: `casa8`, `casa@56,25`, ou o id do Decorar), `nome`, `folha`, `area` [coluna, linha, largura, altura], `tipo` (`movel`, `tapete`, `quadro`, `janela`, `cama`, `parede`, `bau`, `fogao`, `luz`), `camada` sugerida (0 chão, 1 objeto, 2 frente), `bloqueia`, `acao` (um código para a peça toda) ou `acoes` (uma linha de códigos por linha da peça), `decorar` { `formas`: [{ `olhando`?, `variantes`: [{ w, h, dx, dy, `fundos` [ids de fundos.json], `encaixe`? { tipo `quadro`|`janela`, linha, papel? }, `celulas`: [{ dx, dy, coluna, linha, camada, `exatos`? [tiles linha × 128 + coluna], `fundos`? [ids], acao, bloqueia }] }] }] }, `movel` { tipo, levanta, quebra, peso, familia?, variante? } (`PIECE_DEFS`), `fixo` (baús e o fogão de `fixtures.ts`), `luz` (`LIGHT_TILES`), `noite` { coluna, linha } (as janelas de `lightTiles.ts`) }]. Só `decorar` entra no `decorCatalog.ts`; `acao`/`acoes` entram em `actions`; o resto é informação para o plugin (o jogo ainda tem as cópias em `pieceDefs.ts`, `fixtures.ts`, `lightTiles.ts`, que não são geradas).
- **`fundos.json`**: `fundos` [{ folha, id, tiles }].
- **`exterior.json`**: `imagens` (a ordem de `EXTERIOR_SHEETS`), `terrenos` { código: { nome, nivel, base (linha), acao } }, `juncoes` [{ sobre, sob, linha, quadros?, dx?, dy? }], `decalques` { id: { sx, sy, w, h, quadros?, dx?, dy? } }, `formas` { painel: { x, y, blocos: [largura, altura] } }.

## Dúvidas e palpites, em resumo

1. A convenção da grade dupla (qual meia célula o desenho desloca) e a ordem entre caminho, terra e grama: EXTERIOR.md.
2. O mar raso é um código pintado (`r`), não derivado.
3. As formas de 32 px são carimbos guardados um a um; não achei regra de vizinhança.
4. `sem_pecas` bloqueia; as colunas 57–58 do castelo (linhas 20–23) não bloqueiam.
5. O tipo 5 das camas vem de `pecas.json` (`acoes`), não da zona.
6. O carimbo é novo (acima); os antigos ficam guardados e só mudam quando o conteúdo muda.
7. `terreno` em 64 linhas de 64 caracteres em vez da lista de 4096 códigos de `ARQUITETURA.md` (o gerador aceita as duas; `ARQUITETURA.md` não foi alterado).
