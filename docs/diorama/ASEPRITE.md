# Extensão Diorama do Aseprite (2026-10-20)

Liga o Aseprite à ponte do Diorama (`tools/diorama_ponte.mjs`), conforme a seção 3 de `CONEXOES.md`. Com ela, o Claude (pelo MCP) e o Studio pedem ao Aseprite para abrir um pedaço de uma folha do Aeko, e o que for salvo volta para a folha e para as duas metades que o Roblox recebe, sem mexer em nenhum outro pixel.

- Código: `aseprite/diorama/` (`package.json` e `diorama.lua`, um arquivo só; ver "Permissões"). Desde a 0.4.0 (2026-10-22), os itens "Girar (RotSprite)…" e "Limpar doubles e jaggies…" carregam por `dofile` os módulos de `aseprite/pixel/`: **a instalação copia os dois para `<extensão>/pixel/`** e a extensão usa essa cópia (a versão dos módulos casa com a da extensão; mudar os módulos pede `npm run aseprite:instalar` e reabrir o Aseprite). Sem a cópia (o `diorama.lua` carregado por `dofile` num teste em lote), usa os do repositório, pela Raiz do repositório. O `dofile` não passa pelas permissões do Aseprite (elas valem só para `io` e `os`), e os módulos não usam `io` nem `os`: nenhuma pergunta nova de permissão. Testes: `npm run teste:pixel` (inclui um caso que carrega o `diorama.lua` com um plugin de mentira e confere os dois itens do menu).
- Desde a 0.5.0 (2026-10-22), o submenu **Ferramentas** (seção "Ferramentas" abaixo): as janelas ficam em `aseprite/diorama/janelas.lua` e chamam as ações de `aseprite/adaptadores/ferramentas.lua` (`docs/arte/EXTENSOES_ASEPRITE.md`, "Ferramentas nossas"), que a instalação copia, com o `extensoes.lua` que o carrega, para `<extensão>/adaptadores/`. A biblioteca de pincéis, conjuntos e matrizes do usuário fica em `%APPDATA%\Aseprite\diorama\pinceis\` (Configurações…). Testes: `npm run teste:aseprite`.
- Instalada em `%APPDATA%\Aseprite\extensions\diorama`.
- Versão mínima: Aseprite 1.3 (usa `WebSocket`, `json`, `Image(imagem, retângulo)`, `sprite.properties`). Conferida no 1.3.18.6, a da Steam.

## Instalar

```
npm run aseprite:instalar
```

Copia `aseprite/diorama/` para a pasta de extensões (desde a 0.4.0, também `aseprite/pixel/rotsprite.lua` e `limpeza.lua` para `<extensão>/pixel/`; desde a 0.5.0, `aseprite/adaptadores/extensoes.lua` e `ferramentas.lua` para `<extensão>/adaptadores/`), guarda o `__pref.lua` que já estiver lá (as preferências) e grava o `__info.json` que o Aseprite usa para desinstalar. O Aseprite só lê extensões ao abrir: se ele estiver aberto, fechar e abrir de novo (o instalador avisa). `--destino <pasta>` instala em outra pasta de extensões (ex. um Aseprite portátil).

Desde a 0.5.0 também **instala as matrizes de dithering no Aseprite** (pedido do usuário): um Aseprite em lote (`-b`, um processo só, que termina sozinho; não mexe no Aseprite aberto) põe o conjunto inicial na biblioteca se ela não tem matriz nenhuma (Bayer 2x2, 4x4 e 8x8, Ruído azul 8x8 e 16x16, Linhas 4x4, Xadrez 2x2) e grava a extensão `user_generated_dithers` (um `.bmp` por matriz, `package.json` com `contributes.ditheringMatrices`, `__info.json`) direto em `%APPDATA%\Aseprite\extensions\`. Uma `user_generated_dithers` que já existia (o Dithering Generator instala uma com esse nome) é copiada antes para `%APPDATA%\Aseprite\diorama\backup\` e as matrizes dela ficam; as nossas têm ids `hv_<nome>`. Depois de reiniciar, elas aparecem nas listas de matrizes de pontilhado do Aseprite (a da ferramenta Degradê e a da conversão para indexado). `--pinceis <pasta>` usa outra biblioteca (padrão: `HV_PINCEIS` ou `%APPDATA%\Aseprite\diorama\pinceis`); `--sem-matrizes` instala só a extensão. O botão "Instalar no Aseprite…" da janela Matrizes de dithering faz o mesmo depois de criar matrizes novas.

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
| Girar (RotSprite)… | (0.4.0) Gira a camada ativa (no quadro ativo, ou só a seleção) em qualquer ângulo sem criar cor (`aseprite/pixel/rotsprite.lua`, `docs/arte/PLANO_ROTSPRITE.md`). Diálogo: ângulo (graus, no sentido do relógio), pivô (centro, pé ou um ponto do sprite), redução (`centro` ou `maioria`), limpeza (órfãos e doubles que o giro criou), cor de linha (`auto` ou `#RRGGBB`), manter o tamanho, só a seleção. O resultado vai para uma camada nova `<camada> <ângulo>°` logo acima; o original fica; Ctrl+Z desfaz. A última escolha fica guardada. |
| Limpar doubles e jaggies… | (0.4.0) Tira *doubles*, relata ou corrige *jaggies* e pixels órfãos na camada ativa (`aseprite/pixel/limpeza.lua`, `docs/arte/PLANO_LIMPEZA_LINHAS.md`). Diálogo: cor de linha (`#010000`, lista separada por vírgula ou `auto`), doubles, jaggies e órfãos (relatar, corrigir, não), só a seleção, resultado em camada nova (`<camada> limpa`) ou na mesma, e o PNG do relatório ampliado com os defeitos marcados (gravado em `%TEMP%\diorama-ponte` e aberto). A prévia no pé do diálogo mostra quantos de cada defeito e a nota, refeita a cada mudança. Ctrl+Z desfaz. |
| Ferramentas ▸ | (0.5.0) O submenu com as ferramentas de pincel, cópia, exportação, cor e pontilhado. Seção "Ferramentas" abaixo. |
| Configurações… | (Até a 0.4.0, "Raiz do repositório…".) A pasta do repositório (padrão `C:\Users\Szortek\Documents\Haywood-Valley`), o endereço da ponte (padrão `ws://127.0.0.1:34873/ws?cliente=aseprite`) e, desde a 0.5.0, a pasta dos pincéis e matrizes (padrão `%APPDATA%\Aseprite\diorama\pinceis`). Mudar o endereço reconecta. |

Ao abrir, a extensão conecta sozinha e, se a ponte não estiver no ar, tenta de novo a cada 3 s. Ao conectar, manda `{ "tipo": "ola", "versao": "0.2.0", "aseprite": "1.3.18.6", "sprite"?: {…} }` (o sprite aberto, se houver).

Reconexão: o WebSocket do Aseprite 1.3.18 não percebe quando a ponte cai (nenhum `CLOSE` chega ao Lua) e não volta sozinho. Por isso um relógio de 3 s manda um ping enquanto está conectado; quando o ping falha, ou enquanto está desconectado, refaz a conexão com o mesmo objeto (`close` + `connect`). Recriar o objeto pediria de novo a permissão do WebSocket. Medido: a ponte cai e volta, e o `ola` chega de novo em 4 a 7 s.

Desde a 0.2.0 (2026-10-20): há um relógio só, criado na primeira conexão; o menu para e religa o mesmo relógio, e desligar e ligar pelo menu reaproveita o mesmo objeto WebSocket (antes cada religada criava um objeto novo e pedia a permissão de novo). Só uma troca de endereço (Raiz do repositório…) cria outro objeto, e as mensagens do velho são ignoradas. Uma resposta que o `json` não consegue codificar volta como `ok: false` em vez de derrubar o estado da conexão (antes o erro de codificação era tomado por socket morto e a ponte esperava 30 s).

O sprite aberto por "Abrir região" lembra a folha e a área (propriedade `diorama` do sprite e o próprio nome). "Salvar região" lê dali; o tamanho do sprite tem de continuar igual ao da área. O Ctrl+S do Aseprite **não** grava na folha: ele pergunta onde salvar um `.aseprite`, como qualquer sprite novo. Para gravar na folha é o item do menu (ou o comando `salvar_regiao`).

### Como o "Aplicar estilo Aeko…" funciona

1. Achata o sprite atual (camadas visíveis do quadro atual) numa imagem RGBA.
2. Com a ponte conectada: pede a pasta temporária dela (pedido `temporaria`, `%TEMP%\diorama-ponte`), grava ali `<nome>_<hora>.png` e pede `estilo_aeko { entrada, saida, opcoes }` (`CONEXOES.md`, seção 3). A ponte confere caminhos e opções e roda o Python (`PONTE.md`, "Estilo Aeko"); a resposta chega pelo WebSocket e a extensão abre `<nome>_<hora>.<estilo>.png` (e a prévia, se pedida) com `OpenFile` (sem sequência).
3. Sem a ponte: pergunta se pode rodar o Python direto (`io.popen`, o que faz o Aseprite pedir a permissão de executar programas), na pasta `%TEMP%\diorama-ponte`, com o mesmo script e as mesmas opções.

O arquivo aberto mora na pasta temporária: para guardar, "Salvar como…" para onde quiser. Enquanto a ferramenta roda (2 a 20 s, conforme o tamanho), o Aseprite continua livre; o resultado abre quando a resposta chega.

## Ferramentas (0.5.0)

Pedido do usuário em 2026-10-22: "faça as ferramentas que ficaram de fora e instale elas", para usar **com janela** o que `aseprite/adaptadores/ferramentas.lua` faz em lote no lugar das janelas do Brush Manager PRO, do Live Brush, do Carbs Toolbar e do Dithering Generator (código nosso; nada das extensões de terceiros foi copiado). Menu **Arquivo > Diorama > Ferramentas** (um grupo dentro de Diorama; se o Aseprite não aceitar grupo dentro de grupo, os itens aparecem direto em Diorama, depois de um separador).

Regras comuns: tudo age no sprite ativo, no quadro atual; o que mexe no sprite roda numa transação só ("Diorama: …"), então **um Ctrl+Z desfaz tudo**, inclusive a camada nova; o resultado vai para uma **camada nova** logo acima da ativa quando faz sentido (`pincel`, `traço`, `cópias`, `pontilhado`, `sombra`, com número se o nome já existe); o arquivo nunca é gravado. Cada diálogo lembra a última escolha. Um erro vira um aviso com o motivo (sem sprite, camada vazia, nada na seleção…). Os itens que precisam de sprite ficam cinza sem um aberto. Dá para pôr atalho de teclado em qualquer item (Editar > Atalhos de teclado, procurar pelo nome).

| Item | Como usar |
|---|---|
| Biblioteca de pincéis… | Procurar por texto, filtrar por grupo, só favoritos ★, ordenar (nome, usados há pouco, mais usados, criação); escolher o pincel na lista e ver a prévia. **Pintar com ele** põe o pincel no lápis do Aseprite (pincel de imagem; o de várias camadas vai achatado) e fecha. **Carimbar…** abre o carimbo (abaixo). **Tornar ativo** faz dele o pincel ativo. Organizar: ★ Favorito, Nome/grupo/etiquetas… (também descrição e ponto de apoio), Apagar (avisa se um conjunto usa), **Novo pincel…** (da seleção, com a forma dela, ou da camada inteira; só a camada ativa, as visíveis achatadas ou **várias camadas**: uma parte por camada visível; cortar o vazio; grupo, etiquetas, ponto de apoio, favorito), Renomear em lote… (`grama_%02d`, por grupo/etiqueta/texto), Importar… (um `.aseprite` com fatias, como as bibliotecas do Brush Manager; uma parte por camada se marcado) e Ver todos (prancha ampliada 4x, aberta como sprite). |
| Carimbar… (de dentro da biblioteca ou dos conjuntos) | Onde: no centro da seleção (ou do sprite), espalhado na seleção (quantos), ou nos pontos digitados `x,y; x,y`. Resultado em camada nova ou na ativa. Pincel de várias camadas: casar as partes com as camadas de mesmo nome (cria as que faltam), camadas novas, ou tudo numa camada. Tamanho, ângulo, espelho, variação ao acaso de tamanho, ângulo e espelho, giro (RotSprite, simples ou vizinho) e semente (0 = ao acaso). |
| Carimbar ao longo de um traço… | Escolher o pincel (da biblioteca, um conjunto ou o pincel ativo) e o caminho. **Camada-guia** (o jeito mais simples): numa camada só para isso (de preferência chamada `guia`, que já vem escolhida), desenhar o traço com o lápis, 1 px, em qualquer cor; cada risco separado é um traço. A guia fica escondida depois (desmarcável). **Contorno da seleção**: a borda de dentro da seleção vira um traço fechado (laço, varinha, retângulo). **Pontos digitados**: `x,y; x,y; …`, com "fechar". Cada carimbo **gira pela direção do traço** (0° = o pincel como foi desenhado, para um traço que vai para a direita); "Sentido: ao contrário" vira o sentido (a guia aberta vai da esquerda para a direita, ou de cima para baixo; a fechada, no sentido do relógio). Espaçamento (0 = meio pincel), somar ao ângulo, arredondar a 45° ou 90°, curvas suaves / bem suaves / sem suavizar, tamanho, desvio para os lados, variação de ângulo e tamanho, ordem dos pincéis de um conjunto, partes de um pincel de várias camadas, giro e semente. |
| Conjuntos e pincel ativo… | Escolher o conjunto (prévia dos pincéis em fila). Como troca: ordem (em frente, para trás, vai e volta, ao acaso, sempre o primeiro), repetir cada um, tamanho e ângulo ao acaso, girar a cada troca, espelho ao acaso; **Guardar estas opções no conjunto**. Usar: **Tornar pincel ativo**, **Próximo no lápis** (põe o próximo da ordem no lápis e fecha), Recomeçar a ordem, Carimbar… (o carimbo acima, com estas opções). Organizar: **Novo da seleção…** (cortar em cada desenho separado, numa grade ou um por quadro; as visíveis achatadas ou só a camada ativa), **Novo de pincéis…** (todos de um grupo, ou nomes `a, b, c`), Apagar. |
| Próximo pincel do conjunto ativo | Sem janela: o próximo pincel do ativo, já sorteado/girado pelas opções, vai para o lápis. Com um atalho de teclado, é o "trocar de pincel a cada traço" do Live Brush: pintar, apertar o atalho, pintar de novo. |
| Copiar deslocando… | Área: a seleção (com a forma dela) ou, sem seleção, o que está desenhado. Camadas (a ativa, as visíveis, todas), quadros (o atual ou todos), cópias na mesma camada ou numa nova. Para onde (8 direções, encostada mais o espaço, ou dx/dy em px), quantas cópias em fila, repetir pela tela toda, mover (apaga o original). |
| Copiar girando… | Mesma área, camadas, quadros e destino. Ângulo (horário; 90°, 180° e 270° exatos, os outros pelo RotSprite), quantas cópias (a k-ésima gira k vezes), onde fica (no lugar, ou ao lado à direita/embaixo/à esquerda/em cima com espaço), girar o próprio, espelhar antes. |
| Copiar redimensionando… | Mesma área, camadas, quadros e destino. Tamanho em % ou largura/altura em px (0 = proporcional), vizinho mais próximo (sem cor nova), onde fica, manter o original. |
| Exportar seleção… | A seleção (ou o sprite) num PNG: as camadas visíveis achatadas, só a ativa, ou um PNG por camada; o quadro atual ou todos; ampliar N vezes; abrir depois. |
| Exportar camadas… | Um PNG por camada (visíveis ou todas) e quadro numa pasta (padrão `<pasta do sprite>\<nome>_camadas`), nome com `{camada}`, `{quadro}`, `{nome}`, cortar o vazio, só a seleção, ampliar. |
| Exportar folha de sprites… | Os quadros (todos, uma linha por tag, ou uma tag) lado a lado, colunas, espaço, ampliar, só a camada ativa, só a seleção, JSON com onde ficou cada quadro e a duração, abrir depois. |
| Quadros da seleção (sprite novo)… | Cada célula da grade dentro da seleção vira um quadro de um sprite novo, gravado onde escolher e aberto (as camadas vêm junto, ou achatadas); duração de cada quadro. |
| Ajustar matiz, saturação e valor… | Em quais cores: a de frente, a de fundo, as duas, **as marcadas na paleta** (marcar antes de abrir; com duas ou mais marcadas, já vem escolhido), uma lista `#rrggbb, …` ou todas; pegar parecidas (tolerância). Matiz (−180 a 180°), saturação e valor (−100 a 100). Mudar a paleta e/ou os pixels, em todas as camadas ou só na ativa, em todos os quadros ou só no atual, só dentro da seleção. A cor de frente e a de fundo acompanham. Num sprite indexado os pixels seguem a paleta. |
| Matrizes de dithering… | Escolher a matriz (prévia: a densidade de 0 a 100% da esquerda para a direita). Aplicar: **preencher** numa densidade, **faixa** (a densidade vai do começo ao fim, na horizontal ou de cima para baixo) ou **degradê** pontilhado da cor de frente para a de fundo; na cor escolhida; na seleção (com a forma dela) ou no sprite inteiro; em camada nova, em camada nova **só sobre o desenho da camada ativa** (sombra pontilhada), na camada ativa, ou apagando na camada ativa (transparência pontilhada). Biblioteca: **Nova matriz…** (Bayer, ruído azul com semente, linhas, xadrez, da seleção em cinza, ou a sequência dos quadros de um sprite salvo, cada quadro um nível), Apagar, **Instalar no Aseprite…** (grava `user_generated_dithers` na pasta de extensões; reiniciar o Aseprite). Na primeira vez, se a biblioteca não tem matrizes, cria o conjunto inicial. |

### O traço: por que a camada-guia

Das três fontes de caminho, a camada-guia é a que se usa sem pensar em coordenadas: desenha-se o traço onde se quer, com as ferramentas de sempre (lápis, linha, curva), e ele fica no arquivo para refazer. O `caminho.da_camada` ordena os pixels: cada pedaço ligado (8 vizinhos) é um traço; um aberto vira o caminho mais longo entre as duas pontas (passa pelas escadas e pelos cantos de uma linha sem pixel-perfect sem voltar), um fechado vira uma volta inteira. O contorno da seleção serve para enfeitar a borda de uma forma; os pontos digitados, para um traço exato. Linha grossa funciona, mas o caminho passa pelo meio dela; o mais limpo é 1 px.

### A biblioteca: onde e por quê

`%APPDATA%\Aseprite\diorama\pinceis\` (Configurações… muda; a variável `HV_PINCEIS` também), com `biblioteca.json`, `imagens\`, `matrizes\` e `estado.json` (o pincel ativo e o uso). Fora do repositório porque ele é público e pincel recortado de arte de terceiros (folhas do Aeko, peças do Graal) não pode ir para lá (`assets/LICENCAS.md`); fora da pasta da extensão porque cada `npm run aseprite:instalar` apaga a extensão antes de copiar. É a mesma pasta que as ações em lote usam por padrão (`docs/arte/EXTENSOES_ASEPRITE.md`), então o Claude e as janelas veem os mesmos pincéis.

### Permissões

Quem lê e grava a biblioteca e os PNGs é o `ferramentas.lua` (e o `extensoes.lua` lê os JSON). O Aseprite pede permissão de arquivo por script, então na primeira vez que uma ferramenta lê ou grava aparece o aviso para `adaptadores\ferramentas.lua` (e, talvez, para `adaptadores\extensoes.lua`): marcar **"Dar confiança total a este script"** resolve de vez. As janelas (`janelas.lua`) não usam `io` nem `os`.

### Testes (2026-10-22)

`npm run teste:aseprite` (`tools/testes/aseprite.test.mjs` + `aseprite/testes/janelas.lua`, um processo `-b` só, uns 5 s): carrega o `diorama.lua` com um plugin de mentira e troca `Dialog` por um de mentira que segue um roteiro (preenche os campos, chama os `onchange`, clica nos botões, desenha os canvas da prévia), e roda **cada item do menu de ponta a ponta** numa cópia da vaca, com a biblioteca numa pasta temporária: os 13 itens registrados no grupo Ferramentas; pincel da seleção, de várias camadas e de um sprite novo; filtro, favorito, editar, renomear em lote, tornar ativo, pintar com ele; carimbo no centro (girado e ampliado) e de várias camadas casando as camadas; traço por camada-guia em arco (ângulos subindo à esquerda e descendo à direita, guia escondida e de volta no Ctrl+Z), pelo contorno da seleção e por pontos; conjunto por ilhas com a ordem vai e volta (1, 2, 3, 2, 1 no "Próximo"), de pincéis de um grupo, apagar; as três cópias; as quatro exportações; matiz/saturação/valor com a cor de frente acompanhando; matrizes iniciais, sombra só sobre o desenho e dentro da seleção, faixa, degradê, nova (ruído azul, sequência), apagar, instalar cancelado não grava, e instalar numa pasta de teste (lido de volta do `.bmp`); um Ctrl+Z volta o sprite ao que era; os avisos de erro (guia vazia, nada a mudar). Os PNGs ampliados 8x ficam na pasta temporária e foram conferidos a olho. O `npm run teste:pixel` continua passando (25 casos).

**Não testado**: as janelas de verdade (o desenho dos campos, os cliques, o canvas real), o submenu dentro de Diorama (se o Aseprite não aceitar grupo dentro de grupo, os itens vão para Diorama), o pincel no lápis pintando de fato (`app.brush` em lote não pinta), o aviso de permissão e as matrizes aparecendo nas listas de pontilhado depois de reiniciar. Precisam de alguém clicando no Aseprite aberto.

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
- O que não foi conferido com o Aseprite aberto (na 0.5.0, também as janelas das Ferramentas: ver "Ferramentas > Testes"): os itens do menu e os diálogos (abrir região, salvar pelo menu, raiz do repositório e, na 0.4.0, Girar e Limpar, cujo trabalho foi conferido pelas mesmas chamadas `R.girar`/`L.limpar` em lote) não foram clicados; só se sabe que foram registrados sem erro (o `init` chega até o fim e conecta). O diálogo de permissão como o usuário vai vê-lo também não (o teste usou a confiança gravada de antemão). O aviso `app.tip` do "Salvar região" cai num `app.alert` se a função não aceitar os argumentos; não foi visto.
