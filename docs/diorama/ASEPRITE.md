# Extensão Diorama do Aseprite (2026-10-20)

Liga o Aseprite à ponte do Diorama (`tools/diorama_ponte.mjs`), conforme a seção 3 de `CONEXOES.md`. Com ela, o Claude (pelo MCP) e o Studio pedem ao Aseprite para abrir um pedaço de uma folha do Aeko, e o que for salvo volta para a folha e para as duas metades que o Roblox recebe, sem mexer em nenhum outro pixel.

- Código: `aseprite/diorama/` (`package.json` e `diorama.lua`, um arquivo só; ver "Permissões").
- Instalada em `%APPDATA%\Aseprite\extensions\diorama`.
- Versão mínima: Aseprite 1.3 (usa `WebSocket`, `json`, `Image(imagem, retângulo)`, `sprite.properties`). Conferida no 1.3.18.6, a da Steam.

## Instalar

```
npm run aseprite:instalar
```

Copia `aseprite/diorama/` para a pasta de extensões, guarda o `__pref.lua` que já estiver lá (as preferências) e grava o `__info.json` que o Aseprite usa para desinstalar. O Aseprite só lê extensões ao abrir: se ele estiver aberto, fechar e abrir de novo (o instalador avisa). `--destino <pasta>` instala em outra pasta de extensões (ex. um Aseprite portátil).

### Permissões

O Aseprite pede licença na primeira vez que um script abre um WebSocket ou grava um arquivo. Com a extensão, isso aparece **ao abrir o Aseprite** (o WebSocket da ponte) e, se a confiança não for total, **na primeira vez que uma região é salva** (gravar a folha). Marcar "Dar confiança total a este script" (ou "Não perguntar de novo") resolve de vez; o Aseprite guarda a resposta em `aseprite.ini`, seção `[script_access]`, pela chave SHA-1 do caminho do `diorama.lua`. Por isso a extensão é um arquivo só: dois arquivos seriam duas perguntas. Reinstalar no mesmo lugar não pergunta de novo.

Enquanto o diálogo de permissão estiver aberto, o comando que o provocou não responde (a ponte desiste depois de 30 s).

## Usar

Menu **Arquivo > Diorama**:

| Item | O que faz |
|---|---|
| Conectar/desconectar da ponte | Liga e desliga o WebSocket. Fica marcado enquanto conectado. A escolha vale para a próxima vez que o Aseprite abrir. |
| Abrir região da folha… | Escolhe a folha (as de `diorama/folhas`, sem as metades `_0`/`_1`) e a área em tiles de 16 px (coluna, linha, largura, altura). Abre um sprite novo `folha@coluna,linha`, com a grade de 16 px ligada e a paleta com as cores da região. |
| Salvar região na folha | Grava o sprite atual (camadas visíveis do quadro atual, achatadas) de volta na região de onde veio, regrava `diorama/folhas/<folha>.png` e as metades `<folha>_0.png`/`_1.png`, e avisa a ponte (`folha_salva`), que manda o Studio recarregar a prévia. |
| Raiz do repositório… | A pasta do repositório (padrão `C:\Users\Szortek\Documents\Haywood-Valley`) e o endereço da ponte (padrão `ws://127.0.0.1:34873/ws?cliente=aseprite`). Mudar o endereço reconecta. |

Ao abrir, a extensão conecta sozinha e, se a ponte não estiver no ar, tenta de novo a cada 3 s. Ao conectar, manda `{ "tipo": "ola", "versao": "0.1.0", "aseprite": "1.3.18.6" }`.

Reconexão: o WebSocket do Aseprite 1.3.18 não percebe quando a ponte cai (nenhum `CLOSE` chega ao Lua) e não volta sozinho. Por isso um relógio de 3 s manda um ping enquanto está conectado; quando o ping falha, ou enquanto está desconectado, refaz a conexão com o mesmo objeto (`close` + `connect`). Recriar o objeto pediria de novo a permissão do WebSocket. Medido: a ponte cai e volta, e o `ola` chega de novo em 4 a 7 s.

O sprite aberto por "Abrir região" lembra a folha e a área (propriedade `diorama` do sprite e o próprio nome). "Salvar região" lê dali; o tamanho do sprite tem de continuar igual ao da área. O Ctrl+S do Aseprite **não** grava na folha: ele pergunta onde salvar um `.aseprite`, como qualquer sprite novo. Para gravar na folha é o item do menu (ou o comando `salvar_regiao`).

## Comandos

Mensagens do contrato (`CONEXOES.md`, seção 3): a ponte manda `{ "tipo": "comando", "id", "nome", "args" }`, a extensão responde `{ "tipo": "resposta", "id", "ok": true, "valor" }` ou `{ …, "ok": false, "erro" }`. Caminhos de arquivo são relativos à raiz do repositório; caminho absoluto também é aceito.

| nome | args | valor |
|---|---|---|
| `ping` | — | `{ versao, aseprite, raiz }` |
| `sprite_atual` | — | `{ arquivo, nome, largura, altura, modo, camadas, camada, quadros, quadro, modificado, selecao?: [x, y, l, a], origem?: { folha, area } }`; sem sprite aberto, a resposta vem sem `valor` |
| `abrir` | `{ arquivo }` | o mesmo de `sprite_atual`, do sprite aberto. Abre só o arquivo pedido, nunca a sequência (`casa_0.png` não puxa `casa_1.png`) |
| `abrir_regiao` | `{ folha, area: [coluna, linha, largura, altura] }` | o mesmo de `sprite_atual`, do sprite novo |
| `salvar_regiao` | `{ folha?, area? }` | `{ folha, area, pixels, arquivos }`: quantos pixels mudaram e quais PNG foram gravados (nenhum, se nada mudou). Depois da resposta, se algum pixel mudou, solta o evento `{ "tipo": "evento", "nome": "folha_salva", "dados": { folha, area, pixels } }` |
| `exportar` | `{ arquivo }` | `{ arquivo }` (caminho absoluto). PNG: só o quadro atual, achatado; outra extensão (`.aseprite`, `.gif`): `saveCopyAs` do sprite inteiro. Sem extensão, vira `.png`. Cria a pasta se faltar |
| `paleta` | — | lista de cores `#RRGGBB` da paleta do sprite atual (o índice 0 primeiro) |
| `pixel` (extra) | `{ x, y, cor? }` | `{ x, y, cor: "#RRGGBBAA" }`. Sem `cor`, lê a cor vista (camadas achatadas); com `cor` (`#RRGGBB` ou `#RRGGBBAA`), pinta na camada ativa, com desfazer. Não está no contrato; serve para teste e para o `aseprite_comando` genérico do MCP |

Comando sem nome conhecido: `ok: false, erro: "comando desconhecido: <nome>"`.

Detalhes de `salvar_regiao`:

- Sem `folha`/`area`, usa a origem do sprite (o que `abrir_regiao` gravou ou o nome `folha@coluna,linha`, com largura e altura tiradas do tamanho do sprite).
- Copia os pixels trocando (inclusive a transparência), sem misturar com o que havia.
- A folha inteira é regravada só se algum pixel mudou. As metades (`_0` = colunas 0 a 1023, `_1` = 1024 a 2047) recebem o mesmo recorte de cada lado; só é gravada a metade que a área toca e que mudou. Uma área que cruza o meio grava as duas.
- As folhas e as metades precisam ser PNG RGBA (são). O Aseprite grava o PNG com um bloco `sRGB` que o original não tinha; os pixels são os mesmos.

## Testar

Lógica, sem interface (o Aseprite em modo `-b` não tem WebSocket, mas roda os comandos): `dofile` do `diorama.lua` devolve uma tabela com `executar(nome, args)` e `definir("raiz", pasta)`. Exemplo:

```lua
local M = dofile(app.params.ext)
M.definir("raiz", app.params.raiz)       -- uma cópia de diorama/folhas, para não mexer na do repositório
print(json.encode(M.executar("abrir_regiao", { folha = "casa", area = { 0, 20, 2, 2 } })))
```

```
Aseprite.exe -b --script-param ext=<...>\diorama.lua --script-param raiz=<cópia> --script teste.lua
```

De ponta a ponta, com a interface: um servidor Node com `ws` faz o papel da ponte numa porta separada, e a extensão aponta para ele pela variável de ambiente `DIORAMA_PONTE_URL` (vale mais que a preferência):

```
set DIORAMA_PONTE_URL=ws://127.0.0.1:34875/ws?cliente=aseprite
"C:\Program Files (x86)\Steam\steamapps\common\Aseprite\Aseprite.exe"
```

O servidor usado em 2026-10-20 (fica fora do repositório, na pasta temporária da sessão) manda, em ordem: `ping`, `sprite_atual`, `abrir_regiao casa [0,20,2,2]`, `pixel` (lê e pinta (5,7)), `exportar` para um PNG fora do repositório, `paleta`, `salvar_regiao`, confere que `casa.png` e `casa_0.png` mudaram só em (5,327) e `casa_1.png` não mudou, que veio o `folha_salva`, que salvar de novo não grava nada, `abrir casa_1.png`, uma área fora da folha, um comando desconhecido, derruba a conexão e espera o `ola` de novo; no fim faz `git checkout -- diorama/folhas`.

Com a variável `DIORAMA_LOG=<arquivo>`, a extensão anota nesse arquivo o que acontece com a conexão (tentativas, abre, fecha, ping que falhou). Os erros dentro dos comandos voltam na resposta (`ok: false`).

Também foi conferido contra a ponte de verdade (a 0.4.0, subida numa porta separada, `node tools/diorama_ponte.mjs --porta 34876`): `GET /aseprite/estado` mostra a extensão conectada, `POST /aseprite/comandos` com `ping`, `abrir_regiao castelo [4,2,3,2]`, `sprite_atual`, `pixel`, `salvar_regiao` e um comando desconhecido respondem, e o `folha_salva` aparece em `GET /eventos`.

Para testar sem fechar o Aseprite do usuário, o teste usou uma cópia portátil: a pasta do Aseprite copiada para outro lugar com um `aseprite.ini` ao lado do `.exe` (o Aseprite passa a guardar configuração e extensões nessa pasta), a extensão instalada com `--destino <cópia>\extensions` e a confiança total gravada de antemão no `aseprite.ini` da cópia (seção `[script_access]`, SHA-1 do caminho do `diorama.lua`, valor 31), para o diálogo de permissão não travar o teste.

## Limitações

- Aseprite 1.3 ou mais novo. O 1.2 não tem `WebSocket` nem `json`.
- O WebSocket só funciona com a interface aberta: em modo `-b` (o MCP `aseprite` deste projeto) a extensão nem é carregada.
- Só folhas RGBA; sprite de região em modo indexado ou cinza é achatado para RGBA ao salvar.
- `salvar_regiao` grava o quadro atual; outros quadros do sprite são ignorados.
- Um comando por vez: enquanto o Aseprite está num diálogo modal (inclusive o de permissão), as mensagens esperam.
- Uma queda da ponte leva até uns 7 s para ser notada (dois tiques do relógio).
- O que não foi conferido com o Aseprite aberto: os itens do menu e os diálogos (abrir região, salvar pelo menu, raiz do repositório) não foram clicados; só se sabe que foram registrados sem erro (o `init` chega até o fim e conecta). O diálogo de permissão como o usuário vai vê-lo também não (o teste usou a confiança gravada de antemão). O aviso `app.tip` do "Salvar região" cai num `app.alert` se a função não aceitar os argumentos; não foi visto.
