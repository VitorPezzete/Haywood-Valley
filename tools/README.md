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

## Diorama: `diorama_ponte.mjs` e os demais

Ver `docs/diorama/ARQUITETURA.md`.
