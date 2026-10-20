# MCP do Diorama

`tools/diorama_mcp.mjs`, `npm run diorama:mcp`. Servidor MCP (stdio, `@modelcontextprotocol/sdk`) que dá ao Claude Code as rotas da ponte (`tools/diorama_ponte.mjs`, `http://127.0.0.1:34873`) como ferramentas: mapas, catálogo, assets e geradores no disco; comandos ao plugin Diorama no Studio; comandos à extensão do Aseprite. É a seção 6 de `CONEXOES.md`. O MCP só fala HTTP com a ponte; quem fala com o Studio e o Aseprite é ela.

```
Claude Code ──stdio── tools/diorama_mcp.mjs ──HTTP── ponte 127.0.0.1:34873 ── disco, plugin Diorama (Studio), extensão (Aseprite)
```

## Como o Claude Code carrega

A entrada `diorama` do `.mcp.json` na raiz:

```json
"diorama": { "command": "C:\\Program Files\\nodejs\\node.exe", "args": ["tools/diorama_mcp.mjs"] }
```

O caminho é relativo porque o Claude Code sobe os servidores stdio no diretório em que a sessão foi aberta, que é a raiz do repositório (onde está o `.mcp.json`). Aberto de uma subpasta, `tools/diorama_mcp.mjs` não seria achado; nesse caso, troque pelo caminho absoluto. Servidor novo ou mudado no `.mcp.json`, ou mudança em `tools/diorama_mcp.mjs`, só vale numa sessão nova do Claude Code (sair e abrir de novo); na primeira vez ele pergunta se aprova o servidor do projeto. `/mcp` dentro do Claude Code mostra se `diorama` conectou e lista as ferramentas, que aparecem como `mcp__diorama__<nome>`.

`DIORAMA_PONTE` (variável de ambiente) muda o endereço da ponte; o padrão é `http://127.0.0.1:34873`.

## A ponte sobe sozinha

Ao abrir, e sempre que um pedido não conecta, o MCP confere `GET /status`. Se a ponte não responde, ele roda `node tools/diorama_ponte.mjs` destacado (processo separado, sem janela, que continua depois que a sessão do Claude fecha), espera até 5 s e segue; o resultado da ferramenta seguinte começa com "A ponte não estava no ar; subi-a em segundo plano". Para parar essa ponte: fechar o processo `node` de `tools/diorama_ponte.mjs` (Gerenciador de Tarefas, ou `Get-NetTCPConnection -LocalPort 34873` para achar o PID).

Se a ponte cai no meio de um pedido (2026-10-20): um `GET` é repetido depois de subir a ponte; um `POST`, `PUT` ou `DELETE` não é repetido (um gerador ou um comando ao Studio rodaria duas vezes), e a ferramenta diz que não dá para saber se o pedido foi feito. Se ela reinicia enquanto `studio_*` espera a resposta, a ponte nova não conhece mais o comando (guarda tudo em memória) e a ferramenta diz isso, em vez de esperar até o limite. Todo pedido leva o cabeçalho `X-Diorama: 1`, que a ponte exige em `POST`/`PUT`/`DELETE` (`PONTE.md`, "Quem pode falar com a ponte"); um `403` vira a mensagem de que a ponte recusou e por quê.

Uma ponte que já estava no ar continua sendo usada como está, mesmo que `tools/diorama_ponte.mjs` tenha mudado no disco. Rota que a ponte em execução não conhece (`404 rota desconhecida`) vira a mensagem "a ponte ainda não tem esta rota (...): atualize": feche a ponte e chame qualquer ferramenta, ou suba com `npm run diorama:ponte`.

## Resultado das ferramentas

Texto curto dizendo o que aconteceu, uma linha em branco e o JSON da resposta da ponte, indentado (listas de números e textos numa linha só, como as células `[x, y, folha, coluna, linha]`). Acima de 20 mil caracteres o JSON é cortado, com um aviso antes e depois que diz como pedir menos (`resumo`, `id`, `filtro`) ou qual arquivo ler do disco. Erro (da ponte, do Studio, do Aseprite, de validação) volta com `isError` e a dica do que ligar. O MCP nunca escreve em stdout fora do protocolo; o diagnóstico vai para stderr com `[diorama-mcp]`.

## Ferramentas

### Ponte e disco (só precisam da ponte)

| Ferramenta | Argumentos | Rota | O que faz |
|---|---|---|---|
| `ponte_status` | — | `GET /status` | versão, raiz, pastas, Rojo, contagens, mapas gerados |
| `mapas_listar` | — | `GET /mapas` | id, nome e blocos de cada mapa |
| `mapa_ler` | `id`, `bloco?` (`"0_0"`), `resumo?` | `GET /mapas/<id>` | `mapa.json` e blocos; `resumo` troca células e terreno por contagens |
| `mapa_gravar_bloco` | `id`, `bloco` (o bloco inteiro) | `PUT /mapas/<id>/blocos/<bx>_<by>` | confere o mínimo do formato 1 antes de mandar; as coordenadas vêm de `bloco.bloco`; os `avisos` da ponte (bloco sem `nascimento`) saem no texto |
| `mapa_gerar` | `id` (ou `"decorar"`) | `POST /gerar/<id>`, `POST /gerar/decorar` | roda o gerador; devolve `ok`, `codigo`, `log` (até 120 s) |
| `catalogo_ler` | `nome`, `id?`, `resumo?` | `GET /catalogo/<nome>` | `id` devolve só os itens com esse id; `resumo`, as chaves e os ids das listas |
| `catalogo_gravar` | `nome`, `conteudo` | `PUT /catalogo/<nome>` | grava o catálogo inteiro |
| `assets_listar` | `filtro?`, `antigos?` | `GET /assets` | o registro, filtrado por pedaço da chave |
| `assets_faltam` | — | `GET /assets` | chaves sem id do Roblox (igual a `npm run assets -- --faltam`), separadas em `imagens` e `sons`, com o que fazer em cada caso: imagem pela ferramenta Assets do plugin; som não passa por ela (os sem arquivo serão refeitos, item 19 de `DUVIDAS.md`) |
| `eventos` | `desde?`, `espera?` (0–25 s) | `GET /eventos` | eventos da ponte; passar o `proximo` de volta em `desde` |

### Studio (ponte + Studio aberto com o plugin Diorama)

Os comandos vão por `POST /studio/comandos` e a resposta é esperada com `GET /studio/respostas/<id>?espera=30`, repetido enquanto vier `202`, até o limite (60 s; 120 s no `autoteste`; `limite_s` muda). Sem `sessao`, a ponte escolhe a sessão mais recente em modo edição.

| Ferramenta | Argumentos | Comando |
|---|---|---|
| `studio_sessoes` | — | `GET /studio/presenca` |
| `studio_comando` | `tipo`, `args?`, `sessao?`, `limite_s?` | qualquer um da tabela da seção 2 de `CONEXOES.md` |
| `studio_abrir_mapa` | `id` | `abrir_mapa` |
| `studio_testar_mapa` | `id`, `celula?` `[x, y]` | `testar_mapa` (desfazer: `studio_comando` com `parar_teste`) |
| `studio_autoteste` | `ferramentas?` | `autoteste` |
| `studio_diagnosticar` | — | `diagnosticar` |
| `studio_output` | `desde?`, `filtro?`, `limite?` | `output` |

`comando desconhecido` vindo do plugin vira a dica de recompilar o plugin (`npm run plugin:compile`; a ponte entrega o pacote novo). Quando o limite passa, a mensagem diz se o plugin chegou a buscar o comando (então está ocupado ou travou) ou não (Studio num diálogo, em Play ou sem o canal), e não repete o comando: a resposta ainda pode chegar em `GET /studio/respostas/<id>`. Comando que o plugin buscou e nunca respondeu falha quando a sessão sai (`PONTE.md`).

### Aseprite (ponte + Aseprite aberto com a extensão Diorama)

| Ferramenta | Argumentos | Rota / comando |
|---|---|---|
| `aseprite_estado` | — | `GET /aseprite/estado` |
| `aseprite_comando` | `nome`, `args?` | `POST /aseprite/comandos` (qualquer um da seção 3) |
| `aseprite_abrir_regiao` | `folha`, `area` `[coluna, linha, largura, altura]` | `abrir_regiao` |
| `aseprite_salvar_regiao` | `folha?`, `area?` | `salvar_regiao` |

### Exemplos

```
ponte_status {}
mapa_ler { "id": "teste_d_destino", "resumo": true }
mapa_gravar_bloco { "id": "teste_d_destino", "bloco": { "versao": 1, "mapa": "teste_d_destino", "bloco": [0, 0], "folhas": ["casa"], "vazio": ["casa", 0, 2], "camadas": { "chao": [[0, 0, "casa", 0, 2]], "objeto": [], "frente": [] } } }
mapa_gerar { "id": "teste_d_destino" }
catalogo_ler { "nome": "pecas", "id": "chair" }
assets_listar { "filtro": "ui." }
studio_comando { "tipo": "ping" }
studio_testar_mapa { "id": "teste_d_destino", "celula": [5, 10] }
studio_output { "filtro": "[Diorama]" }
aseprite_abrir_regiao { "folha": "casa", "area": [0, 2, 4, 4] }
eventos { "desde": 0, "espera": 25 }
```

Fluxo típico de um mapa: `mapa_ler` → editar o bloco → `mapa_gravar_bloco` → `mapa_gerar` → (Rojo ligado) `studio_testar_mapa` → Play no Studio → `studio_output`.

## Como testar

Sem o Claude Code, com um cliente MCP em Node (o SDK traz `Client` e `StdioClientTransport`):

```js
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const transporte = new StdioClientTransport({ command: process.execPath, args: ["tools/diorama_mcp.mjs"], cwd: "<raiz do repositório>" });
const cliente = new Client({ name: "teste", version: "0" });
await cliente.connect(transporte);
console.log((await cliente.listTools()).tools.map((t) => t.name));
console.log(await cliente.callTool({ name: "ponte_status", arguments: {} }));
await cliente.close();
```

Rodar de dentro da raiz (ou de um script que resolve o SDK pelo `node_modules` do repositório). Para testar a subida automática sem mexer na ponte do dia a dia, passe `env: { ...process.env, DIORAMA_PONTE: "http://127.0.0.1:34999" }` ao transporte: o MCP sobe uma ponte nessa porta (feche-a depois). No Claude Code, `/mcp` mostra o estado do servidor.
