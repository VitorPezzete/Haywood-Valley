# Ferramentas

Scripts que geram partes de `src/` ou cuidam dos assets. Rodar na raiz do repositório. Os de Python precisam do Python
3.12 com Pillow e numpy; neste PC ele está em `%LOCALAPPDATA%\Programs\Python\Python312\python.exe` (não está no PATH;
`py -m pip install --user pillow numpy` se faltarem).

## Registro de assets: `assets.mjs`

`assets/registro.json` é a fonte dos ids do Roblox; `src/shared/assets.ts` é gerado dele (formato documentado no topo
do script).

| Comando | O que faz |
|---|---|
| `npm run assets` | grava `src/shared/assets.ts` (sai idêntico ao que está no git quando o registro não muda) |
| `npm run assets -- --importar <enviadas.json>` | lê `{ "<chave, arquivo ou nome>": <id> }` e põe os ids no registro; nome ambíguo (`graal_0.png` existe nos dois pacotes) é ignorado com aviso: usar a chave ou o caminho inteiro |
| `npm run assets -- --recuperar <pasta>` | copia `<pasta>/<chave>.png` (as imagens baixadas do Roblox) para o `arquivo` de cada entrada |
| `npm run assets -- --faltam` | lista as chaves sem id |

Asset novo: a entrada no registro (sem id), `npm run assets`, o uso no código; depois de enviar a imagem, o id pelo
`--importar` ou à mão no registro e `npm run assets` de novo.

## Folhas do Graal: `graal_unpack.py`, `graal_pack.py`, `graal_import.py`

As cabeças e os corpos dos contribuidores ficam em `contribuidores/pecas/<autor>/<id>/` (peca.json + uma imagem por
camada e por estilo; formato no topo de `graal_unpack.py`). As folhas `graal_<n>.png` e os módulos `graalData.ts` e
`graalDataOriginal.ts` saem delas. `contribuidores/` está no `.gitignore` (assets/LICENCAS.md).

```
python tools/graal_unpack.py                      # folhas (contribuidores/pack_aeko, pack_original) + os .ts → peças
python tools/graal_unpack.py --recuperado <pasta> # idem, lendo <pasta>/graal.aeko.<n>.png e graal.original.<n>.png
python tools/graal_pack.py                        # peças → contribuidores/pack_aeko + src/shared/graalData.ts
python tools/graal_pack.py --original --casar-com pack_aeko --pasta pack_original
                                                  # peças → contribuidores/pack_original + src/shared/graalDataOriginal.ts
python tools/graal_import.py ...                  # peças cruas do Graal → peças (A REFAZER: só o contrato, no cabeçalho)
```

Sempre o pacote do Aeko antes do original: o original é casado célula a célula com ele. Como o pacote escolhe as
células está no topo de `graal_pack.py`; a ida e volta (desempacotar as folhas de 2026-10-18 e empacotar de novo) devolve
os dois `.ts` byte a byte e as 144 folhas pixel a pixel, conferido em 2026-10-20. `--sem-folhas` grava só os `.ts`.
Depois de enviar folhas novas ao Roblox, os ids entram pelo `npm run assets -- --importar`.

## Diorama: `diorama_ponte.mjs`

A ponte entre o plugin do Studio e o disco (`npm run diorama:ponte`, HTTP em 127.0.0.1:34873). Rotas em
`docs/diorama/PONTE.md`; a arquitetura inteira, em `docs/diorama/ARQUITETURA.md`.

## Diorama: gerador e importador (`diorama_jogo.mjs`, `diorama_importar.mjs`, `diorama_lib/`)

O gerador transforma o bloco JSON de um mapa (`diorama/mapas/<mapa>/blocos/0_0.json`) no módulo
`src/shared/interiors/<mapa>.ts` (e refaz `index.ts`) e o catálogo (`diorama/catalogo/`) em
`src/shared/decorCatalog.ts`; o importador faz o caminho de volta a partir dos módulos que sobreviveram. Os dois
reproduzem byte a byte os 14 módulos, `index.ts` e `decorCatalog.ts` (conferido em 2026-10-20). Documentação em
`docs/diorama/GERADOR.md`; o exterior (grade dupla, formas de 32 px), em `docs/diorama/EXTERIOR.md`.

```
npm run diorama:jogo -- <mapa>           bloco → src/shared/interiors/<mapa>.ts (+ index.ts)
npm run diorama:jogo -- --todos          todos os mapas com bloco
npm run diorama:jogo -- --decorar        diorama/catalogo → src/shared/decorCatalog.ts
npm run diorama:jogo -- --folhas         monta diorama/folhas/casa.png e castelo.png das metades <folha>_0.png e _1.png
npm run diorama:jogo -- ... --conferir   só compara com src/, não grava (sai com 1 se difere)
npm run diorama:importar -- <mapa>       src/shared/interiors/<mapa>.ts → bloco JSON e mapa.json (round trip conferido)
npm run diorama:importar -- --todos
```

Precisam só do Node e do `pngjs` (devDependency). `diorama_lib/`: `gerar.mjs` (bloco → módulo), `importar.mjs`,
`exterior.mjs` e `juntar.mjs` (a grade dupla e a junção em retângulos), `catalogo.mjs` e `decorar.mjs`,
`folhas.mjs` e `png.mjs` (as imagens), `carimbo.mjs` (o `stamp`), `ler_ts.mjs`, `json.mjs` e
`semear_catalogo.mjs` (semeou `diorama/catalogo/{zonas,pecas,fundos}.json` das tabelas do jogo).

## Estudo do Aeko: `estudo_aeko.py`, `estilo_aeko.py`, `comparar_estilos.py`

Reconstrução (2026-10-20) das ferramentas perdidas que estudavam a paleta do Aeko e recoloriam as peças dos
contribuidores do Graal no estilo dele (`src/shared/pieceStyle.ts`). A entrada são as folhas recuperadas em
`Documents\Haywood-Valley-recuperado\artes` (`graal.aeko.<n>.png` = gabarito, `graal.original.<n>.png` = entrada,
`aeko.casa.*`, `aeko.castelo.*` = tiles) e os `.ts` de `src/shared`; `--artes <pasta>` e `--padrao graal_{n}.png`
apontam para outro lugar (por exemplo `contribuidores/pack_aeko`). O que cada uma deduz e o que é palpite está
no cabeçalho de cada script e em `docs/arte/ESTUDO_AEKO.md`.

```
python -I tools/estudo_aeko.py                      # paleta do Aeko → docs/arte/ESTUDO_AEKO.md + estudo/aeko/*.png
python -I tools/estilo_aeko.py <id> [--gabarito]    # recolore uma peça → estudo/recoloridas/<autor>/<id>.png
python -I tools/estilo_aeko.py --todas              # todas (a pasta está no .gitignore)
python -I tools/comparar_estilos.py                 # nota 0–10 por peça e por autor → estudo/comparacao/notas.{json,md}, folhas/
python -I tools/comparar_estilos.py --peca jen34    # uma peça, com o bloco inteiro na folha
python -I tools/comparar_estilos.py --parametros '{"degrau": {"h": 6}}' --sem-folhas   # experimentar parâmetros
```

**Arte nova nos estilos do jogo: `estilo_aeko_arte.py`** (2026-10-20; uso em `docs/arte/ESTILO_AEKO_ARTE.md`): passa
qualquer arte para o estilo `aeko`, `equipe` ou `aeko+equipe`, mede a nota de aderência ao estilo e ajusta até a nota
mínima (8). Os alvos vêm de `tools/estilos_arte.json`, gravado por `estudo_aeko.py --referencia`; a validação é
`validar_estilo_arte.py`. No Aseprite: Arquivo > Diorama > Aplicar estilo Aeko… (pela ponte, `POST /estilo/aeko`).

```
python -I tools/estilo_aeko_arte.py <entrada.png> <saida.png> [--estilo aeko|equipe|aeko+equipe] [--previa]
python -I tools/estudo_aeko.py --referencia          # mede os gabaritos → tools/estilos_arte.json + seção 6 do estudo
python -I tools/validar_estilo_arte.py [--amostra N] # estragados, imagens de fora e o par da MADX → estudo/estilo_arte/validacao.md
```

`estilo_aeko.py` também é o módulo que os outros dois importam (leitura dos `.ts`, folhas, Lab, partes). Para
mexer na recolorização: mudar `PARAMETROS` ou `recolorir()`, rodar o `comparar_estilos.py --sem-folhas` (20 s) e
olhar a nota média; depois o `estudo_aeko.py` de novo, que copia o resumo das notas para o documento. Em
`notas.json`, `nota_manual` e `comentario` são do usuário e sobrevivem às rodadas seguintes.
