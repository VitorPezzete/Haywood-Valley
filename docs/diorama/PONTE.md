# Ponte do Diorama

`tools/diorama_ponte.mjs`, `npm run diorama:ponte`. Servidor HTTP em `http://127.0.0.1:34873` (`--porta N` muda), sem autenticação, que só escuta no 127.0.0.1. Lê e grava `diorama/`, `assets/` e `docs/diorama/` na raiz do repositório e roda os geradores por `npm run`. Cada pedido sai no terminal como `GET /status -> 200 (3 ms)`. O cliente do plugin é `plugin/src/ponte.ts`.

Convenções:

- Erros vêm como JSON `{ "erro": "..." }` com o status: `400` pedido ou conteúdo inválido, `404` não existe, `405` método errado na rota, `413` corpo maior que 16 MB, `500` erro interno.
- Ids de mapa e nomes de catálogo: `[a-z0-9_]+`. Blocos: `<bx>_<by>` com inteiros não negativos. Nomes de folha e de documento: `[A-Za-z0-9_.-]+`.
- O que a ponte grava sai com tabulação e quebra de linha no fim, como o Prettier do repositório.
- Os caminhos que ela devolve são relativos à raiz do repositório, com o separador do sistema.

## `GET /status`

Versão, pastas, Rojo, contagens e os mapas já gerados. `rojo.ligado` é um ping em `http://127.0.0.1:34872/api/rojo` (700 ms); `projeto` vem do JSON do Rojo quando ele responde. `gerados` são os ids dos módulos que `src/shared/interiors/index.ts` importa (os mapas que o jogo já recebe), para o plugin saber o que ainda falta gerar.

```
GET /status

200
{
	"versao": "0.2.0",
	"raiz": "C:\\Users\\Szortek\\Documents\\Haywood-Valley",
	"pastas": {
		"mapas":    { "caminho": "diorama\\mapas",    "existe": true },
		"catalogo": { "caminho": "diorama\\catalogo", "existe": true },
		"folhas":   { "caminho": "diorama\\folhas",   "existe": true },
		"assets":   { "caminho": "assets",            "existe": false },
		"docs":     { "caminho": "docs\\diorama",     "existe": true }
	},
	"rojo": { "ligado": false, "porta": 34872 },
	"mapas": 14,
	"folhas": 8,
	"gerados": ["banheiro_equipe", "casa_teste_v2", "..."]
}
```

## Mapas

### `GET /mapas`

Um resumo por pasta em `diorama/mapas/`: o id, o nome (do `mapa.json`, ou o id) e os blocos que têm arquivo.

```
200
[
	{ "id": "teste_d_destino", "nome": "teste_d_destino", "blocos": [[0, 0]] }
]
```

### `GET /mapas/<id>`

O `mapa.json` (ou `null`) e todos os blocos com o conteúdo.

```
GET /mapas/teste_d_destino

200
{
	"id": "teste_d_destino",
	"mapa": { "versao": 1, "id": "teste_d_destino", "nome": "teste_d_destino", "blocos": [[0, 0]] },
	"blocos": [
		{ "bloco": [0, 0], "arquivo": "0_0.json", "conteudo": { "versao": 1, "mapa": "teste_d_destino", ... } }
	]
}
```

### `PUT /mapas/<id>/blocos/<bx>_<by>`

Grava `diorama/mapas/<id>/blocos/<bx>_<by>.json`, criando as pastas, e anota o bloco em `mapa.json` (cria o arquivo se não existe). O corpo é o bloco no formato 1 (`docs/diorama/GERADOR.md`). A validação é a mínima: `versao` 1, `mapa` igual ao id, `bloco` igual às coordenadas, `folhas` lista de nomes, `vazio` `[folha, coluna, linha]`, `camadas` só com `chao`, `objeto` e `frente`, cada célula `[x, y, folha, coluna, linha]` com x e y de 0 a 63. O resto do bloco passa sem conferir.

Antes de gravar, a ponte põe o bloco na forma em que o importador grava e o gerador faz o hash do carimbo (`normalizarBloco`), para um bloco aberto no plugin e salvo sem mudança ficar com o mesmo `carimbo`:

- `exterior.terreno` como lista de 64 × 64 códigos (o que o plugin manda, `""` para nada) vira as 64 linhas de 64 caracteres com `.`;
- `exterior.decalques` e `exterior.formas` vazios saem; um `exterior` sem terreno pintado, decalques, formas nem `runs_importados` sai inteiro;
- `zonas[].props` que veio como `[]` (o `JSONEncode` do Roblox manda `[]` para toda tabela vazia) vira `{}`.

O que mais vier (`carimbo`, `carimbo_conteudo`, `bloqueios`, `acoes`, `nota`...) é gravado como está. `plugin/teste/ciclos.mjs` confere que os 14 mapas importados, abertos e salvos pelo código do plugin por esta rota, geram o mesmo módulo.

```
PUT /mapas/teste_d_destino/blocos/0_0
{ "versao": 1, "mapa": "teste_d_destino", "bloco": [0, 0], "folhas": ["casa"], "vazio": ["casa", 0, 2],
  "camadas": { "chao": [[0, 0, "casa", 0, 2]], "objeto": [], "frente": [] } }

200
{ "ok": true, "arquivo": "diorama\\mapas\\teste_d_destino\\blocos\\0_0.json",
  "mapa": { "versao": 1, "id": "teste_d_destino", "nome": "teste_d_destino", "blocos": [[0, 0]] } }

400
{ "erro": "bloco inválido: mapa precisa ser \"teste_d_destino\" (veio undefined); ..." }
```

O formato do `mapa.json` (`versao`, `id`, `nome`, `blocos`) é palpite desta reconstrução; a ponte só mantém a lista `blocos` e preserva o resto do arquivo.

### `DELETE /mapas/<id>/blocos/<bx>_<by>`

Apaga o arquivo do bloco e o tira do `mapa.json`. `404` se o bloco não existe. Resposta igual à do `PUT`.

## Catálogo

### `GET /catalogo/<nome>`

O texto de `diorama/catalogo/<nome>.json` (`zonas`, `pecas`, `fundos`), como está no disco. `404` se não existe.

### `PUT /catalogo/<nome>`

Grava o corpo (qualquer JSON válido) em `diorama/catalogo/<nome>.json`.

```
PUT /catalogo/fundos
{ "versao": 1, "fundos": [] }

200
{ "ok": true, "arquivo": "diorama\\catalogo\\fundos.json" }
```

## Folhas

### `GET /folhas`

As folhas em `diorama/folhas/*.png`, com o tamanho lido do cabeçalho do PNG.

```
200
[
	{ "nome": "casa", "largura": 2048, "altura": 512 },
	{ "nome": "castelo", "largura": 2048, "altura": 512 }
]
```

### `GET /folhas/<nome>.rgba?x=&y=&w=&h=`

Um recorte da folha em pixels RGBA crus: `application/octet-stream`, 4 bytes por pixel, linha a linha, sem cabeçalho, do jeito que `EditableImage:WritePixelsBuffer` recebe (`buffer.fromstring(corpo)` no Luau). Os cabeçalhos `X-Largura` e `X-Altura` trazem o tamanho do recorte. Sem `x`, `y`, `w`, `h`, vem a folha inteira (2048×512×4 = 4 MB). `400` se o retângulo sai da folha. A folha fica decodificada em memória e é relida quando o arquivo muda.

```
GET /folhas/casa.rgba?x=0&y=32&w=16&h=16

200  Content-Type: application/octet-stream  Content-Length: 1024  X-Largura: 16  X-Altura: 16
<1024 bytes>
```

### `GET /imagens/<caminho>.rgba?x=&y=&w=&h=`

O mesmo recorte RGBA para qualquer PNG de `assets/` ou `diorama/folhas/`: `<caminho>` é o caminho relativo à raiz do repositório sem o `.png` (`assets/ui/atlas`, `assets/acoes/cacos_pote`, `diorama/folhas/casa`), com `/`. Serve para o envio pelo Studio (ferramenta Assets) cobrir o registro inteiro, não só as folhas do Aeko. `400` se o caminho sai dessas duas pastas (o caminho é conferido depois de resolvido: `..` não passa) ou se o recorte sai da imagem; `404` se o arquivo não existe. A imagem fica decodificada em memória e é relida quando o arquivo muda.

```
GET /imagens/assets/acoes/cacos_pote.rgba?x=0&y=0&w=8&h=4

200  Content-Type: application/octet-stream  Content-Length: 128  X-Largura: 8  X-Altura: 4
```

## Geradores

### `POST /gerar/<id>` e `POST /gerar/decorar`

Rodam `npm run diorama:jogo -- <id>` e `npm run diorama:jogo -- --decorar` na raiz e devolvem o log inteiro (stdout e stderr). O status é sempre `200`; `ok` diz se o comando saiu com código 0. Limite de 120 s. Enquanto o gerador não existir, o log diz que o script não está no `package.json`.

```
POST /gerar/teste_d_destino

200
{
	"ok": false,
	"codigo": 1,
	"log": "> npm run diorama:jogo -- teste_d_destino\nnpm error Missing script: \"diorama:jogo\"\n...\nO script \"diorama:jogo\" ainda não existe no package.json.\n\n(saiu com código 1 em 0.4 s)\n"
}
```

A ponte chama o `npm-cli.js` que vem junto do Node em uso, então funciona mesmo quando o `npm` não está no PATH do Studio.

## Assets

### `GET /assets`

O texto de `assets/registro.json`. `404` enquanto ele não existir.

### `POST /assets/enviadas`

Grava o corpo em `assets/enviadas.json` e roda `npm run assets -- --importar`. O corpo é um objeto `{ "<chave>": id }`: a chave do registro (`ui.atlas`), o caminho do arquivo (`assets/ui/atlas.png`) ou só o nome dele, como `tools/assets.mjs --importar` aceita; o id como número, `"123"` ou `"rbxassetid://123"`. `400` se não for um objeto ou se algum valor não for número nem texto. Resposta como a dos geradores (`{ ok, codigo, log }`); o log diz quais chaves o importador achou.

```
POST /assets/enviadas
{ "ui.atlas": 123456789, "assets/acoes/cacos_pote.png": "rbxassetid://987654321" }
```

## Jogo

### `GET /graal/ids`

Os ids de cabeças e corpos que o jogo conhece, lidos de `src/shared/graalData.ts` (`GRAAL_HEADS` e `GRAAL_BODIES`: o id é o texto antes do primeiro `|`). O diagnóstico do plugin confere o visual dos moradores com eles; sem a ponte, vale a cópia que o plugin carrega (`plugin/src/problemas/visual.ts`). `404` se o arquivo não existe.

```
200
{ "cabecas": ["4alexxx", "alexxx1green", "..."], "corpos": ["bea-masc1p_2", "..."] }
```

## Documentos

### `GET /docs`

Nomes (sem `.md`) dos arquivos em `docs/diorama/`.

```
200
["ARQUITETURA", "PONTE"]
```

### `GET /docs/<nome>`

O texto de `docs/diorama/<nome>.md` (`text/plain; charset=utf-8`). Aceita o nome com ou sem `.md`.
