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
| Aplicar estilo Aeko… | (0.3.0) Passa o sprite atual pela ferramenta de estilo (`tools/estilo_aeko_arte.py`, `docs/arte/ESTILO_AEKO_ARTE.md`) e **abre o resultado como sprite novo**; o atual não muda. Diálogo: estilo (`aeko`, `equipe`, `aeko+equipe`), mistura (0 = só equipe, 100 = só Aeko; só no aeko+equipe), fundo (`auto`, `nenhum` ou uma cor), paleta, tons por rampa (0 = os do estilo), contorno, cor do contorno, nota mínima (0 = a padrão, 8) e prévia (abre também a folha antes \| depois). A última escolha fica guardada. Ao terminar, mostra a nota; abaixo da mínima, um aviso com o que faltou. |
| Raiz do repositório… | A pasta do repositório (padrão `C:\Users\Szortek\Documents\Haywood-Valley`) e o endereço da ponte (padrão `ws://127.0.0.1:34873/ws?cliente=aseprite`). Mudar o endereço reconecta. |

Ao abrir, a extensão conecta sozinha e, se a ponte não estiver no ar, tenta de novo a cada 3 s. Ao conectar, manda `{ "tipo": "ola", "versao": "0.2.0", "aseprite": "1.3.18.6", "sprite"?: {…} }` (o sprite aberto, se houver).

Reconexão: o WebSocket do Aseprite 1.3.18 não percebe quando a ponte cai (nenhum `CLOSE` chega ao Lua) e não volta sozinho. Por isso um relógio de 3 s manda um ping enquanto está conectado; quando o ping falha, ou enquanto está desconectado, refaz a conexão com o mesmo objeto (`close` + `connect`). Recriar o objeto pediria de novo a permissão do WebSocket. Medido: a ponte cai e volta, e o `ola` chega de novo em 4 a 7 s.

Desde a 0.2.0 (2026-10-20): há um relógio só, criado na primeira conexão; o menu para e religa o mesmo relógio, e desligar e ligar pelo menu reaproveita o mesmo objeto WebSocket (antes cada religada criava um objeto novo e pedia a permissão de novo). Só uma troca de endereço (Raiz do repositório…) cria outro objeto, e as mensagens do velho são ignoradas. Uma resposta que o `json` não consegue codificar volta como `ok: false` em vez de derrubar o estado da conexão (antes o erro de codificação era tomado por socket morto e a ponte esperava 30 s).

O sprite aberto por "Abrir região" lembra a folha e a área (propriedade `diorama` do sprite e o próprio nome). "Salvar região" lê dali; o tamanho do sprite tem de continuar igual ao da área. O Ctrl+S do Aseprite **não** grava na folha: ele pergunta onde salvar um `.aseprite`, como qualquer sprite novo. Para gravar na folha é o item do menu (ou o comando `salvar_regiao`).

### Como o "Aplicar estilo Aeko…" funciona

1. Achata o sprite atual (camadas visíveis do quadro atual) numa imagem RGBA.
2. Com a ponte conectada: pede a pasta temporária dela (pedido `temporaria`, `%TEMP%\diorama-ponte`), grava ali `<nome>_<hora>.png` e pede `estilo_aeko { entrada, saida, opcoes }` (`CONEXOES.md`, seção 3). A ponte confere caminhos e opções e roda o Python (`PONTE.md`, "Estilo Aeko"); a resposta chega pelo WebSocket e a extensão abre `<nome>_<hora>.<estilo>.png` (e a prévia, se pedida) com `OpenFile` (sem sequência).
3. Sem a ponte: pergunta se pode rodar o Python direto (`io.popen`, o que faz o Aseprite pedir a permissão de executar programas), na pasta `%TEMP%\diorama-ponte`, com o mesmo script e as mesmas opções.

O arquivo aberto mora na pasta temporária: para guardar, "Salvar como…" para onde quiser. Enquanto a ferramenta roda (2 a 20 s, conforme o tamanho), o Aseprite continua livre; o resultado abre quando a resposta chega.

Conferido em 2026-10-20, em lote (`-b`, com `dofile` da extensão): a tradução das opções para a linha de comando e o caminho sem a ponte de ponta a ponta (um sprite de 16×16 com degradê saiu com 12 cores, nota 8,62 no estilo equipe). O caminho com a ponte foi conferido pelos testes da ponte (um cliente WebSocket fazendo os mesmos pedidos), não com o Aseprite aberto: o menu e o diálogo não foram clicados.

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
- Tudo é conferido antes de gravar qualquer arquivo (desde a 0.2.0): uma metade com tamanho errado dá erro "(nada foi gravado)" e deixa a folha como estava. Antes, a folha já tinha sido gravada quando a metade dava erro, e o `folha_salva` não saía.
- Cada PNG é gravado de uma vez: o Aseprite salva em `.<nome>.salvando.png` na mesma pasta e troca pelo original (o original passa por `.<nome>.anterior.png` e volta se a troca falhar, porque o rename do Windows não substitui arquivo existente). A ponte e o menu ignoram os arquivos que começam com `.`. Um Aseprite que fecha no meio não deixa a folha pela metade.
- Se o sprite é fechado no meio (por exemplo durante o diálogo de permissão), o comando responde "o sprite foi fechado no meio do comando" ou "nenhum sprite aberto no Aseprite"; todo comando roda dentro de `pcall`, então nenhum erro de Lua chega a derrubar a extensão.
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

Conferido em 2026-10-20 com a 0.2.0, em lote (`-b`, numa cópia de `diorama/folhas`): região que cruza o meio (`casa [63,20,2,2]`, 16 px de cada lado) grava a folha e as duas metades com os pixels certos; salvar de novo não grava nada; nenhum temporário fica na pasta; metade com tamanho errado dá erro e a folha não muda; sem sprite, `salvar_regiao` e `sprite_atual` respondem sem erro de Lua; área fora da folha, folha com `..` e comando desconhecido dão `ok: false`. A conexão nova (relógio único, objeto reaproveitado) não foi conferida com a interface aberta: o Aseprite do usuário estava aberto e o modo `-b` não tem WebSocket.

Também foi conferido contra a ponte de verdade (a 0.4.0, subida numa porta separada, `node tools/diorama_ponte.mjs --porta 34876`): `GET /aseprite/estado` mostra a extensão conectada, `POST /aseprite/comandos` com `ping`, `abrir_regiao castelo [4,2,3,2]`, `sprite_atual`, `pixel`, `salvar_regiao` e um comando desconhecido respondem, e o `folha_salva` aparece em `GET /eventos`.

Para testar sem fechar o Aseprite do usuário, o teste usou uma cópia portátil: a pasta do Aseprite copiada para outro lugar com um `aseprite.ini` ao lado do `.exe` (o Aseprite passa a guardar configuração e extensões nessa pasta), a extensão instalada com `--destino <cópia>\extensions` e a confiança total gravada de antemão no `aseprite.ini` da cópia (seção `[script_access]`, SHA-1 do caminho do `diorama.lua`, valor 31), para o diálogo de permissão não travar o teste.

## Limitações

- Aseprite 1.3 ou mais novo. O 1.2 não tem `WebSocket` nem `json`.
- O WebSocket só funciona com a interface aberta: em modo `-b` (o MCP `aseprite` deste projeto) a extensão nem é carregada.
- Só folhas RGBA; sprite de região em modo indexado ou cinza é achatado para RGBA ao salvar.
- `salvar_regiao` grava o quadro atual; outros quadros do sprite são ignorados.
- Um comando por vez: enquanto o Aseprite está num diálogo modal (inclusive o de permissão), as mensagens esperam.
- `abrir` e `exportar` aceitam caminho absoluto, como diz o contrato: quem fala com a ponte pode mandar o Aseprite abrir ou gravar PNG em qualquer pasta. A ponte só aceita pedidos locais que não venham de página web (`PONTE.md`, "Quem pode falar com a ponte"), e o WebSocket recusa `Origin` de site.
- Uma queda da ponte leva até uns 7 s para ser notada (dois tiques do relógio).
- O que não foi conferido com o Aseprite aberto: os itens do menu e os diálogos (abrir região, salvar pelo menu, raiz do repositório) não foram clicados; só se sabe que foram registrados sem erro (o `init` chega até o fim e conecta). O diálogo de permissão como o usuário vai vê-lo também não (o teste usou a confiança gravada de antemão). O aviso `app.tip` do "Salvar região" cai num `app.alert` se a função não aceitar os argumentos; não foi visto.
