# Ponte do Diorama

`tools/diorama_ponte.mjs`, `npm run diorama:ponte`. Servidor HTTP em `http://127.0.0.1:34873` (`--porta N` muda; `--porta 0` pega uma livre e a diz na primeira linha), sem senha, que só escuta no 127.0.0.1 e recusa pedidos de páginas web (seção "Quem pode falar com a ponte"). Lê e grava `diorama/`, `assets/` e `docs/diorama/` na raiz do repositório e roda os geradores por `npm run`. Cada pedido sai no terminal como `GET /status -> 200 (3 ms)`, menos os que se repetem a cada poucos segundos quando dão certo (`/plugin/versao`, `/studio/presenca`, `/studio/proximo`, `/eventos`). O cliente do plugin é `plugin/src/ponte.ts`.

Além do disco, a ponte é o centro das conexões de `CONEXOES.md`: serve o pacote do plugin para a recarga a quente (`/plugin/*`, código em `tools/diorama_lib/pacote.mjs`), leva comandos aos Studios (`/studio/*`), fala com o Aseprite por WebSocket (`/ws`, `/aseprite/*`) e anuncia eventos (`/eventos`); os canais estão em `tools/diorama_lib/canais.mjs` e guardam tudo em memória (reiniciar a ponte esquece sessões, comandos e eventos; o plugin se apresenta de novo em até 5 s). `npm run diorama:ponte -- --plugin-watch` roda junto o `rbxtsc -w` do plugin, com a saída prefixada por `[rbxtsc]`.

Convenções:

- Erros vêm como JSON `{ "erro": "..." }` com o status: `400` pedido ou conteúdo inválido (inclusive JSON que não é objeto onde se espera objeto, `%` mal formado no caminho e conexão que cai no meio do corpo), `403` pedido recusado (seção abaixo), `404` não existe, `405` método errado na rota, `413` corpo maior que 16 MB (pelo `Content-Length` ou ao passar do limite; o resto não é lido e a conexão fecha), `500` erro interno.
- Ids de mapa e nomes de catálogo: `[a-z0-9_]+`. Blocos: `<bx>_<by>` com inteiros não negativos de até 6 dígitos. Nomes de folha e de documento: `[A-Za-z0-9_.-]+`, sem começar com `.`. Em todos, nomes que o Windows reserva (`con`, `nul`, `aux`, `prn`, `com1`…`com9`, `lpt1`…`lpt9`, com ou sem extensão) e nomes que terminam em ponto ou espaço dão `400`.
- A ponte não segue links: um link simbólico ou junção no caminho de um mapa, bloco, catálogo, folha, imagem ou documento (ou dentro de um mapa que se quer apagar) dá `400`. Uma junção em `diorama/mapas` nem aparece em `GET /mapas`; um `mapa.json` quebrado aparece com `erro`, sem derrubar a lista.
- O que a ponte grava (blocos, `mapa.json`, catálogos, `assets/enviadas.json`) sai com tabulação e quebra de linha no fim, como o Prettier do repositório, e de uma vez: escreve num temporário `.<nome>.<pid>.<n>.tmp` na mesma pasta e renomeia por cima (no Windows, tenta de novo por até 1 s se outro programa está com o arquivo aberto). Quem lê nunca vê arquivo pela metade.
- Os geradores (`/gerar/*`, `/assets/enviadas`) rodam um de cada vez; o segundo pedido espera o primeiro.
- Os caminhos que ela devolve são relativos à raiz do repositório, com o separador do sistema.
- `DIORAMA_RAIZ` (variável de ambiente) troca a raiz do repositório; os testes (`npm run teste:ponte`, `tools/testes/ponte.test.mjs`) sobem a ponte numa cópia mínima numa pasta temporária.

## Quem pode falar com a ponte

A ponte só escuta no 127.0.0.1, mas uma página aberta no navegador também roda na máquina e poderia mandar `fetch("http://127.0.0.1:34873/...")`, postar um formulário para cá ou abrir `new WebSocket("ws://127.0.0.1:34873/ws?cliente=aseprite")`. O plugin (HttpService), o MCP (fetch do Node), o curl e a extensão do Aseprite não mandam `Origin` nem `Sec-Fetch-Site`; o navegador manda. Por isso a ponte responde `403` (e o WebSocket recusa o upgrade com `403`) quando:

- vem `Origin` e ele não é a própria ponte (`http://127.0.0.1:<porta>` ou `http://localhost:<porta>`); `Origin: null` também é recusado;
- vem `Sec-Fetch-Site` diferente de `none` e `same-origin` (pega o GET "no-cors" de `<img>` e `<script>`, que não leva `Origin`; sem isso uma página poderia consumir os comandos da fila do Studio com `/studio/proximo`);
- o `Host` não é `127.0.0.1`, `localhost` nem `[::1]` (DNS rebinding: um domínio que passa a apontar para 127.0.0.1 chega com o próprio nome no `Host`);
- o método é `OPTIONS` (a ponte não responde preflight de CORS, então o navegador nem manda o pedido de verdade com cabeçalho próprio);
- o método é `POST`, `PUT` ou `DELETE` e falta `X-Diorama: 1`, quando a exigência está ligada. Um formulário HTML não consegue mandar cabeçalho próprio. `--exigir-cabecalho` liga e `--sem-exigir-cabecalho` desliga; o padrão está em `EXIGIR_CABECALHO_PADRAO` (ver `DUVIDAS.md`, item 29) e a segunda linha do terminal diz qual vale. O MCP e o plugin (`plugin/src/ponte.ts`) mandam o cabeçalho.

Cada recusa sai no terminal como `[recusado] <método> <caminho>: <motivo>`. `executar_luau` passa pela ponte como qualquer comando, mas quem decide é o plugin: ele recusa enquanto "Permitir executar Luau" estiver desligado no painel Conexão.

Com `curl`, os exemplos deste documento que mudam algo levam o cabeçalho: `curl -X PUT -H "X-Diorama: 1" -H "Content-Type: application/json" ...`.

## `GET /status`

Versão, pastas, Rojo, contagens e os mapas já gerados. `rojo.ligado` é um ping em `http://127.0.0.1:34872/api/rojo` (700 ms); `projeto` vem do JSON do Rojo quando ele responde. `gerados` são os ids dos módulos que `src/shared/interiors/index.ts` importa (os mapas que o jogo já recebe), para o plugin saber o que ainda falta gerar.

```
GET /status

200
{
	"versao": "0.6.0",
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
	"gerados": ["banheiro_equipe", "casa_teste_v2", "..."],
	"plugin": { "hash": "7bd368c97fc0a25d", "versao": "0.4.0", "gerado_em": "2026-10-20T13:40:00.000Z", "arquivos": 84 },
	"studios": [{ "sessao": "480a4859-…", "place": "teste_plugin.rbxl", "placeId": 0, "versao": "0.4.0", "modo": "edicao", "origem": "ponte", "visto_ha_ms": 1200 }],
	"aseprite": { "conectado": false, "versao": null, "aseprite": null, "sprite": null, "conectado_em": null },
	"ia": { "ligada": true, "claude": { "achado": true, "caminho": "C:\\Users\\…\\claude.exe", "origem": "extensão (.antigravity-ide, 2.1.304)" }, "ocupada": false, "tempo_limite_s": 240 }
}
```

`plugin` é o pacote que a ponte serve agora (ou `{ "erro": "..." }` se `plugin/out` não está compilado); `studios`, as sessões vivas do canal; `aseprite`, o mesmo de `GET /aseprite/estado`; `ia`, a IA "Pedir ao Claude" (seção "IA" no fim): se o Claude Code foi achado (e onde, ou o `motivo` quando não), se há pedido rodando (`ocupada`, `pedido`) e o tempo máximo de cada fase.

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
- as chaves voltam à ordem do importador (`versao`, `mapa`, `bloco`, `folhas`, `vazio`, `camadas` `chao`/`objeto`/`frente`, `exterior`, `nascimento`, `entradas`, `saidas`, `zonas`, `moradores`, `carimbo`... e `carimbo_conteudo` por último; dentro das zonas, entradas, saídas e moradores também), porque o `JSONDecode`/`JSONEncode` do Roblox não guarda ordem (2026-10-23);
- o arquivo sai no formato do importador e do gerador (`tools/diorama_lib/json.mjs`, uma célula por linha), e o `mapa.json` também. Antes (até 2026-10-23) saía com `JSON.stringify` e tabulação: cada Salvar do editor abria cada lista num item por linha e embaralhava as chaves (o bloco do `teste_d_ligacoes` ia de 340 a 2.337 linhas por uma troca de nome de zona).

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

O bloco sem `nascimento` (ou com um que não é `[x, y]` de inteiros) é gravado, e a resposta traz `avisos` (o plugin deixa salvar sem; item 28 de `DUVIDAS.md`). O gerador põe o jogador na primeira célula livre (sem bloqueio, em ordem de leitura) ou em `[0, 0]`, e repete o aviso no log:

```
200
{ "ok": true, "arquivo": "...", "mapa": {...},
  "avisos": ["o bloco não tem nascimento: o gerador põe o jogador na primeira célula livre (ou em [0, 0]); marque o nascimento no editor"] }
```

### `DELETE /mapas/<id>/blocos/<bx>_<by>`

Apaga o arquivo do bloco e o tira do `mapa.json`. `404` se o bloco não existe. Resposta igual à do `PUT`.

### `DELETE /mapas/<id>`

Apaga a pasta inteira `diorama/mapas/<id>` (blocos e `mapa.json`). O autoteste do plugin usa para o mapa temporário `zz_autoteste`. `404` se o mapa não existe.

```
200
{ "ok": true, "pasta": "diorama\\mapas\\zz_autoteste" }
```

`PUT` e `DELETE` de bloco e de mapa soltam o evento `mapa_gravado` (`{ mapa, bloco?, arquivo?, apagado? }`); os geradores soltam `gerado` (`{ alvo, ok }`).

## Catálogo

### `GET /catalogo/<nome>`

O texto de `diorama/catalogo/<nome>.json` (`zonas`, `pecas`, `fundos`), como está no disco. `404` se não existe.

### `PUT /catalogo/<nome>`

Grava o corpo (qualquer JSON válido) em `diorama/catalogo/<nome>.json`. Se o arquivo já existe, as chaves do corpo voltam à ordem dele (itens de lista casados pelo `id`, senão pela posição; peça nova na ordem da primeira) e `[]` onde ele tinha um objeto volta a `{}`; o formato (o de `json.mjs` ou o `JSON.stringify` com tabulação) é o do arquivo. Sem isso, um "Salvar peças" sem mudança vindo do Studio reescrevia as 3.300 linhas do `pecas.json` (2026-10-23).

```
PUT /catalogo/fundos
{ "versao": 1, "fundos": [] }

200
{ "ok": true, "arquivo": "diorama\\catalogo\\fundos.json" }
```

## Folhas

### `GET /folhas`

As folhas em `diorama/folhas/*.png`, com o tamanho lido do cabeçalho do PNG. Ficam de fora os arquivos que começam com `.` (os temporários do Aseprite, `.casa.salvando.png`) e os links; um PNG que não dá para medir sai com `erro` em vez de derrubar a lista.

```
200
[
	{ "nome": "casa", "largura": 2048, "altura": 512 },
	{ "nome": "castelo", "largura": 2048, "altura": 512 }
]
```

### `GET /folhas/<nome>.rgba?x=&y=&w=&h=`

Um recorte da folha em pixels RGBA crus: `application/octet-stream`, 4 bytes por pixel, linha a linha, sem cabeçalho, do jeito que `EditableImage:WritePixelsBuffer` recebe (`buffer.fromstring(corpo)` no Luau). Os cabeçalhos `X-Largura` e `X-Altura` trazem o tamanho do recorte. Sem `x`, `y`, `w`, `h`, vem a folha inteira (2048×512×4 = 4 MB). `400` se o retângulo sai da folha (inclusive `x` ou `y` além da borda). A folha fica decodificada em memória e é relida quando o arquivo muda.

```
GET /folhas/casa.rgba?x=0&y=32&w=16&h=16

200  Content-Type: application/octet-stream  Content-Length: 1024  X-Largura: 16  X-Altura: 16
<1024 bytes>
```

### `GET /imagens/<caminho>.rgba?x=&y=&w=&h=`

O mesmo recorte RGBA para qualquer PNG de `assets/`, `diorama/folhas/` ou `diorama/recortes/`: `<caminho>` é o caminho relativo à raiz do repositório sem o `.png` (`assets/ui/atlas`, `assets/acoes/cacos_pote`, `diorama/folhas/casa`, `diorama/recortes/casa/chair/base`), com `/`. Serve para o envio pelo Studio (ferramenta Assets) cobrir o registro inteiro, não só as folhas do Aeko, e para o Catálogo montar o recorte, a base e as máscaras de cada peça (etapa G, `RECORTES.md`; `diorama/recortes/` entrou em 2026-10-20). `400` se o caminho sai dessas três pastas (o caminho é conferido depois de resolvido: `..` não passa) ou se o recorte sai da imagem; `404` se o arquivo não existe. A imagem fica decodificada em memória e é relida quando o arquivo muda.

```
GET /imagens/assets/acoes/cacos_pote.rgba?x=0&y=0&w=8&h=4

200  Content-Type: application/octet-stream  Content-Length: 128  X-Largura: 8  X-Altura: 4

GET /imagens/diorama/recortes/casa/chair/parte_1.rgba

200  Content-Type: application/octet-stream  Content-Length: 4624  X-Largura: 34  X-Altura: 34
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

## Estilo Aeko

### `POST /estilo/aeko`

Roda `tools/estilo_aeko_arte.py` (a ferramenta de arte nova nos estilos aeko, equipe e aeko+equipe; uso e opções em `docs/arte/ESTILO_AEKO_ARTE.md`) e devolve o log e o resumo. A extensão do Aseprite usa a mesma função pelo WebSocket (pedido `estilo_aeko`, `CONEXOES.md` seção 3).

```
POST /estilo/aeko
X-Diorama: 1
{ "entrada": "estudo/estilo_arte/fora/bau_chapado.png", "saida": "estudo/meu_bau.aeko.png",
  "opcoes": { "estilo": "aeko", "previa": true } }

200
{
	"ok": true, "codigo": 0,
	"log": "…\n  nota 10.00 (mínima 8) em 2 tentativa(s): …\n(saiu com código 0 em 2.1 s)\n",
	"saida": "C:\\…\\estudo\\meu_bau.aeko.png",
	"previa": "C:\\…\\estudo\\meu_bau.aeko.previa.png",
	"resumo": { "estilo": "aeko", "nota": 10.0, "nota_minima": 8.0, "chegou": true, "partes": {…}, "tentativas": […], … }
}
```

Regras (o pedido vira argumentos de um programa, então tudo é conferido antes):

- `entrada` e `saida`: `.png`, relativos à raiz ou absolutos, e só **dentro do repositório** ou da **pasta temporária da ponte** (`%TEMP%\diorama-ponte`, que `GET /status` mostra em `estilo.temporaria`); sem segmento com nome reservado do Windows e sem link no caminho (`400`). A entrada tem de existir (`404`) e não pode ser a saída (`400`). Uma saída dentro do repositório **não grava por cima** de arquivo que já existe (`409`); na pasta temporária, grava.
- `opcoes`: só estas chaves (outra dá `400`): `estilo` (`aeko`, `equipe`, `aeko+equipe`), `mistura` (0 a 1), `fundo` (`auto`, `nenhum`, `#RRGGBB`), `paleta` (`auto`, `estilo`, `livre`, `aeko`, `equipe`; um PNG como paleta só pela linha de comando), `tons` (1 a 16), `contorno` (`externo`, `todos`, `nao`), `cor_contorno` (`auto`, `preto`, `escuro`), `escala` (`auto` ou 1 a 16), `nota_minima` (0 a 10), `previa` (booleano).
- O Python roda com `-I`, sem shell, com `OPENBLAS_NUM_THREADS=1`, um pedido de cada vez, no máximo 180 s. Ele é `DIORAMA_PYTHON`, ou o `%LOCALAPPDATA%\Programs\Python\Python312\python.exe`, ou o `python` do PATH. O script é o que está ao lado da ponte (não o de `DIORAMA_RAIZ`).
- O status é `200` quando a ferramenta rodou, mesmo que ela tenha falhado: `ok` diz se saiu com código 0 e a saída existe. `resumo` é a última linha JSON do log (`--json`), com a nota, as partes, as tentativas e, se a nota mínima não foi alcançada, `chegou: false` e `faltou`.
- Solta o evento `estilo_aplicado { saida, ok, nota }` (com `origem: "aseprite"` quando veio do WebSocket).

Testado em `tools/testes/ponte.test.mjs` (caminhos e opções recusados; uma rodada de verdade com prévia, alfa binário e o `409` na segunda vez; os pedidos `temporaria` e `estilo_aeko` pelo WebSocket). Os testes que rodam o Python pulam se não houver Python com numpy, scipy e Pillow.

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

## Plugin (recarga a quente)

O plugin instalado é uma casca que baixa o resto daqui (`CONEXOES.md`, seção 1).

### `GET /plugin/versao`

```
200
{ "hash": "7bd368c97fc0a25d", "gerado_em": "2026-10-20T13:40:00.000Z", "versao": "0.4.0" }
```

`503` se `plugin/out` ainda não foi compilado (`npm run plugin:compile`). O hash (16 hex) é o SHA-256 da árvore inteira (nomes, classes e fontes). A ponte observa `plugin/out` e `plugin/include` e refaz o pacote 300 ms depois da última mudança; um hash novo sai no terminal (`[plugin] pacote 0.4.0 <hash>`) e como o evento `pacote_novo`. A casca pergunta a cada 2 s.

### `GET /plugin/pacote`

`{ "hash", "versao", "arvore" }`, com `arvore` = `{ "nome", "classe": "Folder" | "ModuleScript", "fonte"?, "filhos"? }`. A raiz é a Folder `Diorama` com os filhos do Script raiz do `.rbxm` (`app`, `ferramentas`, `rbxts_include`…), montada a partir de `plugin/default.project.json` pelas regras do Rojo (pasta com `init.luau` vira ModuleScript, `globIgnorePaths` vale, `default.project.json` dentro de uma pasta é seguido). O `init.server.luau` (a casca) e qualquer Script que não seja ModuleScript ficam de fora. Uns 780 KB de JSON sem indentação.

## Canal do Studio

Cada plugin aberto se apresenta e busca comandos por long-poll; quem manda (MCP, Aseprite, curl) põe o comando numa fila e espera a resposta. Tabela dos comandos em `CONEXOES.md`, seção 2.

### `POST /studio/presenca`

`{ "sessao", "place", "placeId", "versao", "modo", "origem" }` → `{ "ok": true, "sessao", "fila": 0 }`. O plugin manda a cada 5 s. A primeira presença de uma sessão solta `studio_entrou`; uma sessão sem presença nem long-poll há 15 s sai (`studio_saiu`) e os comandos que ela não buscou falham.

### `GET /studio/presenca`

As sessões vivas: `[{ sessao, place, placeId, versao, modo, origem, visto_ha_ms }]`.

### `GET /studio/proximo?sessao=<s>&espera=20`

`200 { "id": "c17", "tipo": "…", "args": {…} }` ou `204` depois de `espera` segundos (máximo 55) sem comando. Um long-poll novo da mesma sessão encerra o anterior com `204`; se a conexão cai antes, o comando fica na fila.

### `POST /studio/respostas/<id>`

`{ "ok": true, "valor": … }` ou `{ "ok": false, "erro": "…" }`. `{ "devolver": true }` põe o comando de volta na frente da fila (o pacote do plugin parou enquanto ele chegava).

### `POST /studio/comandos`

`{ "tipo", "args"?, "sessao"? }` → `{ "id": "c17", "sessao": "…" }`. Sem `sessao`, vai para a sessão mais recente em modo `edicao` (ou, sem nenhuma, a mais recente viva). `503` se não há Studio conectado ou a sessão pedida não está. `args`, quando vem, tem de ser um objeto. Um comando que ninguém buscou em 120 s falha. Um comando que o plugin buscou e não respondeu falha quando a sessão sai (15 s sem presença: "o Studio desta sessão saiu depois de receber o comando, sem responder") ou depois de 10 min. Se a conexão do long-poll cai entre a entrega e a escrita da resposta, o comando volta para a frente da fila.

### `GET /studio/respostas/<id>?espera=30`

A resposta (`{ ok, valor | erro }`) quando chega, ou `202 { "pendente": true, "entregue": bool }` depois de `espera` segundos. As respostas ficam guardadas 10 min. `404` para id desconhecido.

```
curl -s -X POST http://127.0.0.1:34873/studio/comandos -H "X-Diorama: 1" -H "Content-Type: application/json" -d '{"tipo":"autoteste"}'
{ "id": "c3", "sessao": "480a4859-…" }
curl -s "http://127.0.0.1:34873/studio/respostas/c3?espera=50"
```

## Aseprite

### `/ws?cliente=aseprite` (WebSocket)

A extensão do Aseprite se conecta aqui (protocolo em `CONEXOES.md`, seção 3). Uma conexão nova do Aseprite derruba a anterior (código 4000), e os comandos que esperavam resposta pela velha falham na hora. Mensagens acima de 16 MB derrubam a conexão. Upgrade com `Origin` de página web ou `Host` que não é local: `403`. A ponte manda um ping a cada 20 s e corta quem não responde. O evento `folha_salva` vira `recarregar_folhas { folha }` para cada Studio vivo em modo `edicao` e o evento de mesmo nome em `/eventos`. Qualquer outro `?cliente=` é um observador: recebe cada evento como `{ "tipo": "evento", "nome", "n", "dados", "em" }`. Desde 2026-10-20 a extensão também faz pedidos à ponte (`{ "tipo": "pedido", "id", "nome", "args" }` → `{ "tipo": "resposta_pedido", "id", "ok", "valor" | "erro" }`): `temporaria` (a pasta temporária da ponte) e `estilo_aeko` (o mesmo de `POST /estilo/aeko`); outro nome dá `ok: false, erro: "pedido desconhecido: …"`.

### `GET /aseprite/estado`

`{ "conectado", "versao", "aseprite", "sprite", "conectado_em" }`. `sprite` é o último que a extensão contou (no `ola`, num evento `sprite` ou na resposta de `sprite_atual`).

### `POST /aseprite/comandos`

`{ "nome", "args"? }` → espera a resposta até 30 s: `200 { "ok": true, "valor" }` ou `{ "ok": false, "erro" }` (também quando o Aseprite cai antes de responder); `503` sem o Aseprite conectado; `504` sem resposta no tempo (um diálogo aberto no Aseprite, como o de permissão, segura os comandos).

## Eventos

### `GET /eventos?desde=<n>&espera=25`

`{ "proximo": n2, "eventos": [{ "n", "tipo", "dados", "em" }] }`, com os eventos de número `>= desde`; sem nenhum, espera até `espera` segundos (máximo 55). Na próxima chamada, `desde=proximo`. Sem `desde`, devolve na hora os guardados (os últimos 500). Tipos: `pacote_novo`, `mapa_gravado`, `gerado`, `estilo_aplicado`, `studio_entrou`, `studio_saiu`, `aseprite_conectou`, `aseprite_saiu`, `folha_salva` e qualquer outro evento que a extensão do Aseprite mande.

## IA ("Pedir ao Claude")

Desde a ponte 0.6.0 (2026-10-20). Contrato e decisões em `CONEXOES.md`, seção 7; código em `tools/diorama_lib/ia.mjs`. A ponte roda o **Claude Code do PC** (`claude -p --output-format json`, assinatura do usuário, sem chave de API) em duas fases na mesma sessão: **proposta**, só com ferramentas de leitura, e **aplicar**, só depois do OK, com escrita limitada. Um pedido por vez. Tudo em memória (os últimos 20 pedidos); reiniciar a ponte esquece os pedidos e mata o que estiver rodando.

### `POST /ia/pedidos`

`{ "texto", "contexto"?: { "mapa", "secao", "selecao", "problemas" }, "modo"?: "agir" }` → `201 { "id": "p7" }`. O texto (até 4000 caracteres) e o contexto vão para o prompt do Claude, o contexto marcado como dado (`<contexto>…</contexto>`); do contexto só passam `mapa` (id válido ou `null`), `secao`, `selecao` (até 4 KB de JSON) e até 30 `problemas` de até 400 caracteres. Erros: `400` sem texto, texto grande demais ou `modo` que não é `agir`; `409` enquanto outro pedido está pensando ("o Claude ainda está trabalhando no pedido pN; espere ou pare esse antes."); `503` quando o Claude Code não foi achado (com o motivo). Um pedido novo cancela as propostas que esperavam o OK.

### `GET /ia/pedidos/<id>?espera=30`

Long-poll (até 30 s; sem `espera`, responde na hora). `202 { "id", "estado": "pensando", "fase" }` enquanto pensa; depois `200` com `estado` `proposta` (com `resposta` e `proposta: { resumo, mudancas[] }`), `feito` (com `resposta` e, depois de aplicar, `feito[]`, a lista do que o Claude disse que fez) ou `erro` (com `resposta`, uma frase para o autor). `cancelado: true` quando o autor parou o pedido ou cancelou a proposta; `negadas: [...]` com as ferramentas que o Claude tentou usar e a ponte não libera (a `resposta` também diz). `fase` é `proposta` ou `aplicar`. Pedido que a ponte não conhece (reiniciou, ou saiu dos 20 guardados): `410`, para o plugin não confundir com rota que não existe (`404`, que ele lê como "ponte antiga").

### `POST /ia/pedidos/<id>/confirmar`

`{ "aceitar": true | false }`. `true` numa proposta: `202` com `estado: "pensando"` e `fase: "aplicar"`, e a ponte roda a fase 2 com `--resume` da sessão da proposta; o resultado vem no `GET`. `false`: descarta a proposta (`200`, `estado: "feito"`, `cancelado: true`), ou para o pedido se ainda está pensando. Aceitar o que não é proposta (já aplicada, cancelada ou com erro): `409`. Depois de aplicar, se um bloco do mapa aberto no editor (`contexto.mapa`) foi gravado e o autor não tinha mudança não salva (`selecao.nao_salvo` diferente de `true`), a ponte manda `abrir_mapa { id, descartar: true }` ao Studio, e a resposta termina com "O editor releu o mapa."

### `POST /ia/pedidos/<id>/cancelar`

Para o pedido que está pensando: mata o processo do Claude com os filhos (`taskkill /T /F` no Windows) e responde na hora com `estado: "erro"`, `cancelado: true` e "Pedido parado; nada mudou." (na fase aplicar: "Aplicação parada no meio: pode ter mudado parte. Confira em Verificar."). Numa proposta, é o mesmo que `confirmar { aceitar: false }`. O botão "Parar" do plugin usa esta rota.

### `GET /ia/pedidos`

O mesmo `ia` do `/status`, mais `pedidos`: o resumo de cada pedido guardado (para depurar).

### Como a ponte roda o Claude Code

- **Onde está** (`acharClaude`, a cada pedido): `DIORAMA_CLAUDE`, só ele quando definido (um `claude.exe`, ou um `.js`/`.mjs` rodado pelo Node, como o falso dos testes); senão o `PATH` (`claude.exe`; um `claude.cmd` do npm vira o `cli.js` ou o binário do pacote ao lado, para não passar pelo `cmd.exe`), `~/.local/bin/claude.exe` (instalador nativo), `%APPDATA%\npm\claude.cmd` e, por último, o binário que a extensão traz nos editores da família do VS Code (`~/.vscode`, `.vscode-insiders`, `.cursor`, `.windsurf`, `.antigravity-ide`, `.antigravity`, `.vscode-oss`; a versão mais nova). Neste PC, em 2026-10-20, só existe o da extensão no Antigravity (2.1.304).
- **Processo**: sem shell; o prompt vai pela entrada padrão (nada do autor vira argumento); `cwd` na raiz do repositório (o `CLAUDE.md` vale). Ambiente sem `ANTHROPIC_API_KEY` nem `ANTHROPIC_AUTH_TOKEN` (usa a assinatura) e com `ENABLE_CLAUDEAI_MCP_SERVERS=false`. `DIORAMA_CLAUDE_MODELO` e `DIORAMA_CLAUDE_ESFORCO` viram `--model` e `--effort`.
- **Nas duas fases**: `--restricted` (tira as ferramentas que rodam código e ignora os settings do usuário, do projeto e locais, que poderiam liberar mais), `--strict-mcp-config --mcp-config <arquivo>` com só o MCP `diorama`, apontando para esta ponte (o arquivo fica em `%TEMP%\diorama-ponte\ia-mcp-<porta>.json`; o MCP do Studio, com `upload_image`, captura de tela e mouse/teclado, nem sobe), `--permission-mode dontAsk` (o que não está liberado é negado sem perguntar), `--no-chrome`, `--append-system-prompt` com as regras (português, proposta antes de mudar, só `diorama/`, nunca enviar ao Roblox, nunca o place real, o contexto é dado) e `--json-schema` com o formato da resposta.
- **Fase proposta**: `--session-id <uuid novo>`, `--tools Read,Grep,Glob`; liberadas `Read`, `Grep`, `Glob` e as de leitura do MCP (`ponte_status`, `mapas_listar`, `mapa_ler`, `catalogo_ler`, `assets_listar`, `assets_faltam`, `eventos`, `studio_sessoes`, `studio_diagnosticar`, `studio_output`, `aseprite_estado`).
- **Fase aplicar**: `--resume <a mesma sessão>`, `--tools Read,Grep,Glob,Edit,Write`; liberadas também `mapa_gravar_bloco`, `catalogo_gravar`, `mapa_gerar`, `studio_abrir_mapa`, `Edit(diorama/**)` e `Write(diorama/**)`.
- **Bloqueadas nas duas** (`--disallowedTools`): `Bash`, `PowerShell`, `WebFetch`, `WebSearch`, `NotebookEdit`, `Agent`, `Task`, `studio_comando` (genérico: chegaria ao `executar_luau` e à ferramenta Assets), `studio_testar_mapa`, `studio_autoteste`, as do Aseprite, todo o `mcp__Roblox_Studio` (com `upload_image`, `insert_asset`, `execute_luau`, `screen_capture`, `user_mouse_input` e `user_keyboard_input` nomeadas uma a uma), `mcp__aseprite`, `mcp__ableton`, `mcp__notion` e os conectores do claude.ai. **A IA nunca envia nada ao Roblox**: quando o pedido precisa, a proposta diz para o autor enviar pela seção Arte.
- **Tempo**: `DIORAMA_IA_TEMPO_S` (padrão 240 s por fase, abaixo dos 5 min que o plugin espera); passou, a ponte mata o processo e o pedido vira `erro` ("o Claude passou de 240 s e foi parado; nada mudou").
- **Erros em frase**: Claude Code não achado, não logado ("rode `claude` uma vez e entre com a sua conta"), limite de uso, opção que um Claude Code antigo não conhece ("atualize com `claude update`"), limite de passos, ou o código de saída com as últimas linhas do stderr. Na fase aplicar, os erros lembram que parte pode ter sido feita.
- O terminal mostra `[ia] p3 pedido: …`, `[ia] p3 proposta com 2 mudança(s) (6.2 s)`, `[ia] p3 aplicar: feito (11.0 s)` e as ferramentas negadas; o long-poll de `GET /ia/pedidos/<id>` não aparece quando dá certo.

Testado em `tools/testes/ponte.test.mjs` com um falso Claude Code (`tools/testes/claude_falso.mjs`, por `DIORAMA_CLAUDE`): status e recusas, explicação, proposta e aplicação na mesma sessão com as ferramentas de cada fase e o editor relendo o mapa, bloqueio do envio nas duas fases, cancelar e pedido novo, um por vez e parar (o processo morre), tempo limite, erro do Claude, Claude não achado. E de verdade, com o Claude Code 2.1.304 numa cópia de `diorama/` (2026-10-20): "liste os mapas" (os 14, só leitura, 13,8 s) e uma proposta de criar `diorama/teste_ia.txt` aplicada depois do OK (6,3 s e 11,0 s; o arquivo só apareceu depois do OK; o pedido de também criar `src/proibido.txt` o Claude deixou fora da proposta).
