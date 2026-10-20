# Conexões: Claude, Studio, Aseprite e o plugin (2026-10-20)

Pedido do usuário em 2026-10-20: o plugin se atualiza sozinho, e Claude, Studio e Aseprite ficam ligados, com um MCP para o Claude e um plugin para o Aseprite. A ponte (`tools/diorama_ponte.mjs`, `127.0.0.1:34873`) é o centro: todo mundo fala com ela, ninguém fala direto com ninguém. Só escuta em 127.0.0.1.

```
Claude ──(MCP stdio)── tools/diorama_mcp.mjs ──HTTP──┐
                                                       ├── ponte 127.0.0.1:34873 ──HTTP long-poll── plugin Diorama (cada Studio aberto)
Aseprite ──(extensão Lua, WebSocket /ws)──────────────┘                          └── disco: diorama/, assets/, plugin/out, src/
```

## 1. Plugin que se atualiza sozinho

O plugin instalado (`%LOCALAPPDATA%\Roblox\Plugins\Diorama.rbxm`) é uma **casca** estável: cria a barra, os botões e os widgets uma vez e nunca mais muda. O resto (as ferramentas) é um **pacote** que a casca carrega:

- Ao abrir, a casca pede `GET /plugin/versao` à ponte. Com a ponte no ar, baixa `GET /plugin/pacote`, monta a árvore de ModuleScripts (com `Source`) dentro de uma pasta filha do próprio script do plugin e faz `require` de `app`. Sem a ponte, usa o pacote embutido no `.rbxm` (o que foi compilado junto).
- `app` exporta `iniciar(ambiente) → parar()`. `ambiente` = `{ plugin, botao(id, nome, descricao, icone) → PluginToolbarButton, widget(id, opcoes) → DockWidgetPluginGui, versao, origem: "ponte" | "embutido" }`. Botões e widgets são criados pela casca e guardados por id entre recargas (o Studio não deixa criar dois widgets com o mesmo id nem apagar botão); a casca limpa os filhos do widget antes de entregar de novo.
- A casca consulta `GET /plugin/versao` a cada 2 s. Hash diferente: `parar()` do pacote velho, destrói a pasta dele, monta o novo, `iniciar` de novo. Erro no pacote novo: mostra no Output (`[Diorama]`) e volta ao anterior.
- `ambiente.plugin` é o objeto `plugin` de verdade (os módulos não têm o global `plugin`).
- A ponte monta o pacote de `plugin/out` + `plugin/include` + os módulos de `node_modules/@rbxts` que o `plugin/default.project.json` lista, e refaz o hash quando algum arquivo de `plugin/out` muda (com espera de 300 ms). `npm run diorama:ponte -- --plugin-watch` também roda o `rbxtsc -w` do plugin.

```
GET /plugin/versao  → { "hash": "a1b2c3…", "gerado_em": "2026-10-20T12:00:00Z", "versao": "0.4.0" }
GET /plugin/pacote  → { "hash": "…", "versao": "0.4.0", "arvore": No }
No = { "nome": "app", "classe": "ModuleScript" | "Folder", "fonte"?: "…", "filhos"?: No[] }
```

A raiz da árvore é uma `Folder` chamada `Diorama`, com os mesmos filhos que o `.rbxm` tem dentro do script raiz (`app`, `ferramentas`, `rbxts_include`…), para o `TS.import(script, script.Parent, …)` funcionar igual.

## 2. Canal do Studio

Cada plugin aberto (pode haver vários Studios) se apresenta e busca comandos por long-poll:

```
POST /studio/presenca   { "sessao": "<guid gerado ao carregar>", "place": "<nome>", "placeId": 0, "versao": "0.4.0", "modo": "edicao" | "run" | "cliente" | "servidor" }   (a cada 5 s)
GET  /studio/presenca   → [ { sessao, place, placeId, versao, modo, visto_ha_ms } ]   (some depois de 15 s sem presença)
GET  /studio/proximo?sessao=<s>&espera=25   → 200 { "id": "c17", "tipo": "…", "args": {…} } ou 204 (nada no tempo)
POST /studio/respostas/<id>   { "ok": true, "valor": … } ou { "ok": false, "erro": "…" }
```

Quem manda (MCP, Aseprite, curl):

```
POST /studio/comandos   { "tipo": "…", "args": {…}, "sessao"?: "<s>" }   → { "id": "c17" }   (sem sessao: a mais recente em modo edicao)
GET  /studio/respostas/<id>?espera=30   → { "ok": …, "valor"|"erro" } ou 202 { "pendente": true }
```

Comandos (o plugin responde `ok: false, erro: "comando desconhecido"` aos que não tem):

| tipo | args | valor |
|---|---|---|
| `ping` | — | `{ versao, origem, sessao }` |
| `estado` | — | place, modo, selecção (caminhos), ferramentas abertas, atributos de teste |
| `abrir_ferramenta` | `{ id }` | `true` |
| `abrir_mapa` | `{ id }` | resumo do mapa aberto no editor |
| `testar_mapa` | `{ id, celula?: [x, y] }` | grava `InteriorTeste`/`InteriorTesteCelula` |
| `parar_teste` | — | limpa os atributos |
| `diagnosticar` | — | a lista do painel Problemas |
| `autoteste` | `{ ferramentas?: string[] }` | relatório por ferramenta: montou?, instâncias, erros capturados no Output durante a montagem, conferências próprias de cada ferramenta |
| `output` | `{ desde?: number, filtro?: string }` | mensagens do Output (com número de ordem) |
| `recarregar_folhas` | `{ folha? }` | relê as folhas locais (prévia sem enviar, seção 4) |
| `executar_luau` | `{ codigo }` | só se o usuário ligar "Permitir executar Luau" no painel Conexão (desligado por padrão) |

## 3. Canal do Aseprite

A extensão do Aseprite (`aseprite/diorama/`, instalada em `%APPDATA%\Aseprite\extensions\diorama`) abre um WebSocket em `ws://127.0.0.1:34873/ws?cliente=aseprite` (o Aseprite 1.3 tem `WebSocket` na API Lua) e reconecta sozinha a cada 3 s.

```
ponte → Aseprite   { "tipo": "comando", "id": "a5", "nome": "…", "args": {…} }
Aseprite → ponte   { "tipo": "resposta", "id": "a5", "ok": true, "valor": … } | { …, "ok": false, "erro": "…" }
Aseprite → ponte   { "tipo": "evento", "nome": "folha_salva", "dados": { "folha": "casa" } }
Aseprite → ponte   { "tipo": "ola", "versao": "0.1.0", "aseprite": "1.3.x" }
```

HTTP para quem manda: `GET /aseprite/estado` → `{ conectado, versao, sprite? }`; `POST /aseprite/comandos { nome, args }` → espera a resposta até 30 s e devolve `{ ok, valor|erro }`.

| nome | args | o que faz |
|---|---|---|
| `ping` | — | versão |
| `sprite_atual` | — | arquivo, tamanho, camadas, quadros, seleção |
| `abrir` | `{ arquivo }` | abre um PNG/aseprite do repositório (caminho relativo à raiz) |
| `abrir_regiao` | `{ folha, area: [coluna, linha, largura, altura] }` | abre um sprite novo com aquela região de `diorama/folhas/<folha>.png` (tiles de 16 px), com a grade de 16 px ligada e o nome `folha@c,l` |
| `salvar_regiao` | `{ folha?, area? }` | grava o sprite atual de volta na região de onde veio (lida do nome, se faltar `area`), salva a folha e solta o evento `folha_salva` |
| `exportar` | `{ arquivo }` | salva o sprite atual como PNG |
| `paleta` | — | as cores da paleta atual em `#RRGGBB` |

A ponte repassa `folha_salva` ao Studio como `recarregar_folhas` e aos ouvintes de `GET /eventos`.

## 4. Prévia local das folhas no Studio

Uma folha editada no Aseprite ainda não está no Roblox. As ferramentas Mapas e Catálogo ganham a opção "Folhas locais": em vez do `rbxassetid`, montam uma `EditableImage` com os pixels de `GET /imagens/diorama/folhas/<folha>_<metade>.png.rgba` e usam `ImageContent = Content.fromObject(...)`. `recarregar_folhas` refaz as imagens. Sem `EditableImage` (place sem permissão, memória), cai no id do Roblox com aviso.

## 5. Eventos

```
GET /eventos?desde=<n>&espera=25   → { "proximo": n2, "eventos": [ { "n": 41, "tipo": "folha_salva" | "pacote_novo" | "mapa_gravado" | "gerado" | "studio_entrou" | "studio_saiu" | "aseprite_conectou" | "aseprite_saiu", "dados": {…}, "em": "…" } ] }
```

## 6. MCP do Claude

`tools/diorama_mcp.mjs` (stdio, `@modelcontextprotocol/sdk`), registrado no `.mcp.json` como `diorama`. Se a ponte não responde em `/status`, sobe a ponte em segundo plano (processo separado, que continua depois). Ferramentas:

- Ponte e disco: `ponte_status`, `mapas_listar`, `mapa_ler`, `mapa_gravar_bloco`, `mapa_gerar`, `catalogo_ler`, `catalogo_gravar`, `assets_listar`, `assets_faltam`, `eventos`.
- Studio: `studio_sessoes`, `studio_comando` (genérico: `tipo`, `args`, `sessao?`, espera a resposta), e os atalhos `studio_abrir_mapa`, `studio_testar_mapa`, `studio_autoteste`, `studio_diagnosticar`, `studio_output`.
- Aseprite: `aseprite_estado`, `aseprite_comando` (genérico) e os atalhos `aseprite_abrir_regiao`, `aseprite_salvar_regiao`.

Cada ferramenta devolve texto curto com o JSON da resposta; erro de conexão vira mensagem dizendo o que ligar (ponte, Studio com o plugin, Aseprite com a extensão).
