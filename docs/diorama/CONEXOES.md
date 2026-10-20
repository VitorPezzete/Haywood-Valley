# Conexões: Claude, Studio, Aseprite e o plugin (2026-10-20)

> **O que mudou na implementação (2026-10-20, conferido no Studio de teste).** O contrato abaixo vale, com estes acréscimos e correções; cada um está também no lugar dele no texto.
>
> 1. `ambiente` tem também `hash` (do pacote da ponte) e `sessao`. A sessão é gerada pela **casca** ao carregar e é a mesma entre recargas, para o long-poll continuar a fila do pacote anterior (seção 2). Os widgets são criados todos no `iniciar` (fechados, com o estado que o Studio restaura) e o painel só é montado quando o widget fica à vista.
> 2. Prévia local (seção 4): as metades vêm de `GET /folhas/<folha>.rgba?x=0|1024&y=0&w=1024&h=512`, recortes de `diorama/folhas/<folha>.png`, e não de `/imagens/diorama/folhas/<folha>_<metade>.png.rgba`. Motivo: o Aseprite (`salvar_regiao`) grava a folha inteira; os arquivos `<folha>_<metade>.png` são cópias da recuperação e não acompanhariam a edição.
> 3. Canal do Studio: `POST /studio/respostas/<id>` aceita `{ "devolver": true }` (o pacote parou enquanto o comando chegava; ele volta para a frente da fila). `POST /studio/comandos` responde `503` quando não há Studio conectado (ou a sessão pedida não está). Um long-poll novo da mesma sessão encerra o anterior com `204`.
> 4. Na sessão do **cliente** do Play o Studio recusa HTTP ("Http requests can only be executed by game server"): lá a casca fica com o pacote embutido e o canal não liga; o modo `cliente` nunca aparece na presença. A instância do servidor do Play se apresenta como `servidor`.
> 5. Argumentos a mais: `abrir_mapa { descartar? }` (abre mesmo com mudança não salva), `autoteste { espera?, remontar? }`, `output { limite? }` (devolve `{ mensagens: [{ n, nivel, hora, texto }], proximo }`), `recarregar_folhas { ligar?, desligar?, pixel?: [x, y] }` (liga/desliga "Folhas locais"; `pixel` devolve esse pixel lido da EditableImage). O autoteste devolve ainda `studio`: as conferências dos itens 20–27 de `DUVIDAS.md`.
> 6. Rota nova da ponte: `DELETE /mapas/<id>` (o autoteste apaga o mapa temporário `zz_autoteste`).
> 7. `GET /eventos` sem `desde` devolve na hora tudo o que está guardado (os últimos 500). No `/ws`, um cliente que não é o Aseprite (`?cliente=observador`) recebe cada evento como `{ "tipo": "evento", "nome": "<tipo do evento>", "n": 41, "dados": {…}, "em": "…" }` (o formato do evento que o Aseprite manda). O `ola` do Aseprite pode trazer `sprite`, e um `{ "tipo": "evento", "nome": "sprite", "dados": {…} }` só atualiza o `sprite` de `/aseprite/estado`, sem virar evento.
> 8. As configurações do plugin (`plugin:SetSetting`) não podem ter `.` na chave: o Studio aceita sem erro e não guarda nada. As chaves são `Diorama_folhasLocais`, `Diorama_permitirLuau`, `Diorama_servidor_teleportePendente`.
> 9. Revisão de segurança e robustez (2026-10-20, ponte 0.5.0, MCP 0.2.0, extensão 0.2.0; detalhes em `PONTE.md`): a ponte recusa com `403` pedidos e upgrades de WebSocket de páginas web (`Origin` de site, `Sec-Fetch-Site` de outro site, `Host` que não é local, preflight `OPTIONS`) e, com a exigência ligada, `POST`/`PUT`/`DELETE` sem `X-Diorama: 1` (item 29 de `DUVIDAS.md`). Nomes reservados do Windows e links no caminho dão `400`; o que ela grava vai por temporário e renomeação. Comando que o plugin buscou e não respondeu falha quando a sessão sai; long-poll que cai na entrega devolve o comando à fila; a troca de conexão do Aseprite falha na hora os comandos pendentes. O MCP não repete `POST`/`PUT`/`DELETE` quando a ponte cai no meio e diz quando a ponte reiniciou e esqueceu o comando. A extensão grava as folhas por temporário, confere as metades antes de gravar e tem um relógio de reconexão só.

Pedido do usuário em 2026-10-20: o plugin se atualiza sozinho, e Claude, Studio e Aseprite ficam ligados, com um MCP para o Claude e um plugin para o Aseprite. A ponte (`tools/diorama_ponte.mjs`, `127.0.0.1:34873`) é o centro: todo mundo fala com ela, ninguém fala direto com ninguém. Só escuta em 127.0.0.1.

```
Claude ──(MCP stdio)── tools/diorama_mcp.mjs ──HTTP──┐
                                                       ├── ponte 127.0.0.1:34873 ──HTTP long-poll── plugin Diorama (cada Studio aberto)
Aseprite ──(extensão Lua, WebSocket /ws)──────────────┘                          └── disco: diorama/, assets/, plugin/out, src/
```

## 1. Plugin que se atualiza sozinho

O plugin instalado (`%LOCALAPPDATA%\Roblox\Plugins\Diorama.rbxm`) é uma **casca** estável: cria a barra, os botões e os widgets uma vez e nunca mais muda. O resto (as ferramentas) é um **pacote** que a casca carrega:

- Ao abrir, a casca pede `GET /plugin/versao` à ponte. Com a ponte no ar, baixa `GET /plugin/pacote`, monta a árvore de ModuleScripts (com `Source`) dentro de uma pasta filha do próprio script do plugin e faz `require` de `app`. Sem a ponte, usa o pacote embutido no `.rbxm` (o que foi compilado junto).
- `app` exporta `iniciar(ambiente) → parar()`. `ambiente` = `{ plugin, botao(id, nome, descricao, icone) → PluginToolbarButton, widget(id, opcoes) → DockWidgetPluginGui, versao, hash?, origem: "ponte" | "embutido", sessao }` (`hash` e `sessao`: item 1 da nota do topo). Botões e widgets são criados pela casca e guardados por id entre recargas (o Studio não deixa criar dois widgets com o mesmo id nem apagar botão); a casca limpa os filhos do widget antes de entregar de novo.
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
Aseprite → ponte   { "tipo": "pedido", "id": "x1", "nome": "estilo_aeko", "args": { "entrada", "saida", "opcoes" } }
ponte → Aseprite   { "tipo": "resposta_pedido", "id": "x1", "ok": true, "valor": … } | { …, "ok": false, "erro": "…" }
```

Os pedidos (desde 2026-10-20, extensão 0.3.0) vão no sentido contrário dos comandos: a extensão pede e a ponte responde. Há dois: `temporaria` (`{ pasta }`, a pasta temporária da ponte, onde a extensão grava o sprite) e `estilo_aeko` (roda a ferramenta de estilo, o mesmo de `POST /estilo/aeko` em `PONTE.md`). É o que o menu "Arquivo > Diorama > Aplicar estilo Aeko…" usa.

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

Uma folha editada no Aseprite ainda não está no Roblox. As ferramentas Mapas e Catálogo ganham a opção "Folhas locais": em vez do `rbxassetid`, montam uma `EditableImage` por metade com os pixels de `GET /folhas/<folha>.rgba?x=0|1024&y=0&w=1024&h=512` (item 2 da nota do topo) e usam `ImageContent = Content.fromObject(...)`. `recarregar_folhas` refaz as imagens. Sem `EditableImage` (place sem permissão, memória), cai no id do Roblox com aviso.

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

## 7. IA: "Pedir ao Claude" (2026-10-20)

Decisão do usuário: pedir coisas à IA de dentro do Diorama, e a IA **age com confirmação**. No plugin, o botão "Pedir ao Claude" (Ctrl+K) no cabeçalho da janela abre a caixa (`plugin/src/ia.ts`, `ui/pedirClaude.tsx`). O back-end é da ponte e **ainda não existe**: enquanto as rotas respondem 404, 405 ou 501, o plugin mostra "Ainda não disponível: atualize a ponte" e não guarda nada. Contrato (todas as rotas com `X-Diorama: 1`, como os demais POST):

```
POST /ia/pedidos
     { "texto": "põe uma zona Cozinha na área do fogão",
       "contexto": { "mapa": "casa_teste_v2_l" | null,
                     "secao": "mapa" | "pecas" | "arte" | "testar" | "verificar" | "ajuda" | "configuracoes",
                     "selecao": { "celula": [x, y], "ultimo_clique": [x, y], "ferramenta": "pincel", "camada": "Chão",
                                  "tile_escolhido": "casa [36, 16] 1×1", "peca": "chair", "nao_salvo": false,
                                  "studio": ["Workspace.Part", …] },
                     "problemas": ["[erro] mapa x, bloco 0_0: …", …] },
       "modo": "agir" }
     → 200/201 { "id": "p7" }

GET  /ia/pedidos/<id>?espera=30
     → 202 { "estado": "pensando" }                       (ainda pensando; o plugin pergunta de novo)
     → 200 { "estado": "proposta", "resposta": "texto",
             "proposta": { "resumo": "Criar a zona Cozinha", "mudancas": ["zona Cozinha em [10,4]–[18,9]", "musica=sala"] } }
     → 200 { "estado": "feito", "resposta": "texto" }     (só explicou, ou já aplicou o que não muda nada)
     → 200 { "estado": "erro", "resposta": "o que deu errado" }

POST /ia/pedidos/<id>/confirmar  { "aceitar": true | false }
     → o mesmo formato do GET ("feito" ou "erro" depois de aplicar; pode voltar 202 "pensando" e o plugin espera)
```

- `selecao` só traz as chaves que existem no momento (sem mapa aberto, não há `celula`); `problemas` é a lista do último "Verificar tudo" da sessão (até 30, sem as notas).
- O plugin manda `espera=20` (abaixo do limite do `RequestAsync`, como o long-poll do canal do Studio) e repete até 5 minutos; a ponte deve aceitar qualquer `espera` até 30.
- **Nada muda sem o OK**: quando o pedido muda algo (mapa, catálogo, arquivos), a resposta é `"proposta"` e a ponte só aplica depois de `confirmar { aceitar: true }`. `aceitar: false` descarta. Um pedido novo enquanto há proposta pendente cancela a anterior (`aceitar: false`).
- Como a IA aplica: pelas mesmas rotas da ponte (gravar bloco, catálogo) ou pelo canal do Studio (`abrir_mapa`, `simular`…). Depois de gravar um bloco aberto no editor, a ponte pode mandar `abrir_mapa { id, descartar: true }` ao Studio para o editor reler.
- `GET /status` deve ganhar um campo `ia` (por exemplo `{ "ligada": true }`) quando o back-end existir: o autoteste do plugin só manda o pedido de teste ("Ainda não disponível") enquanto esse campo falta.
