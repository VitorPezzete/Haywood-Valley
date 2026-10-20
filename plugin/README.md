# Plugin Diorama

Editor de mapas e ferramentas de desenvolvimento do Haywood Valley dentro do Roblox Studio, **num botão só e numa janela só** (desde 2026-10-20; seção "A janela única", abaixo). É um projeto roblox-ts separado do jogo (sem Flamework), com interface em Vide, que compila para `%LOCALAPPDATA%\Roblox\Plugins\Diorama.rbxm`. Ele fala com o disco do repositório pela **ponte** (`tools/diorama_ponte.mjs`), um servidor HTTP local. A arquitetura inteira está em `docs/diorama/ARQUITETURA.md`; as rotas da ponte, em `docs/diorama/PONTE.md`; o formato dos blocos e do catálogo (o do gerador, que o plugin lê e grava), em `docs/diorama/GERADOR.md`.

## Compilar e instalar

Tudo pela raiz do repositório (precisa do Node e do Rojo do Aftman no PATH, como `npm run serve`):

```
npm run plugin:build     # compila plugin/src → plugin/out e gera %LOCALAPPDATA%\Roblox\Plugins\Diorama.rbxm
npm run plugin:compile   # só o roblox-ts (plugin/out), sem o .rbxm
npm run plugin:watch     # roblox-ts recompilando a cada mudança (com a ponte no ar, o Studio troca o pacote sozinho)
node node_modules/typescript/bin/tsc --noEmit -p plugin/tsconfig.json   # só os tipos (erros dentro de node_modules/@rbxts são do pacote)
node plugin/teste/ciclos.mjs                                            # os ciclos de identidade (abaixo), sem o Studio
```

## Casca, pacote e recarga a quente

O `.rbxm` instalado é uma **casca** (`src/index.server.ts`): cria a barra "Diorama" com o botão "Diorama" e a janela única (`Diorama_janela`), liga um ao outro e carrega o **pacote** (todo o resto, com entrada em `src/app.ts`). O Studio só relê o `.rbxm` ao reiniciar; o pacote, não:

- Ao abrir, a casca pede `GET /plugin/versao` à ponte. Com a ponte no ar, baixa `GET /plugin/pacote` (a árvore de `plugin/out` + `include` + `vide` e `services`), monta os ModuleScripts numa pasta `Pacote_<hash>` dentro do próprio script e chama `app.iniciar(ambiente)`. Sem a ponte, usa o pacote embutido no `.rbxm`.
- A cada 2 s a casca pergunta o hash de novo. Mudou: `parar()` do pacote velho, limpa a janela, `iniciar` do novo. Se o novo falha (erro no `require` ou no `iniciar`), o Output mostra `[Diorama] o pacote … não iniciou: …` e a casca volta ao anterior; o mesmo hash não é tentado de novo.
- O Output mostra `[Diorama] pacote 0.4.0 (<hash>) carregado: ponte.` a cada troca.

Fluxo de trabalho: com a ponte rodando, `npm run plugin:compile` (ou `npm run diorama:ponte -- --plugin-watch`, que roda o `rbxtsc -w` junto) e o Studio troca o pacote sozinho em uns 2 s. `npm run plugin:build` só é preciso quando a casca (`index.server.ts`) muda, e aí é preciso reiniciar o Studio; ele também atualiza o pacote embutido, que vale quando a ponte não está no ar (e na sessão do cliente do Play, que não tem HTTP).

Regras que a recarga impõe ao código do pacote:

- Nenhum módulo usa o global `plugin` (só existe na casca): `ambiente().plugin` (`src/ambiente.ts`), ou o `plugin` que `montar(gui, plugin)` recebe.
- Nada de efeito no carregamento do módulo (conectar sinal, `task.spawn` de laço): faça no `iniciar` ou no painel, e guarde a conexão com `aoParar(...)` (`ambiente.ts`) para o `parar()` desfazer. Senão a versão velha continua viva depois da troca.
- `plugin:SetSetting` não aceita `.` na chave (aceita sem erro e não guarda nada). Use `lerConfig`/`gravarConfig` de `ambiente.ts`, que trocam os pontos por `_`.

Na primeira chamada à ponte o Studio pode perguntar se o plugin pode acessar `127.0.0.1`; aceite. Se a barra "Diorama" não aparecer, olhe o Output. A versão está em `plugin/src/versao.ts` (0.5.0 desde a janela única), nos detalhes do indicador de estado e em Configurações → Sobre (no Avançado, com a origem do pacote e o hash).

## Rodar a ponte

Dois cliques em **`Diorama.cmd`**, na raiz do repositório (abaixo), ou pelo terminal:

```
npm run diorama:ponte    # HTTP em http://127.0.0.1:34873; Ctrl+C encerra
```

Só escuta em 127.0.0.1, sem autenticação. O **indicador de estado** no cabeçalho da janela mostra se ela está respondendo (vermelho: "Ponte desligada"). Sem a ponte, o plugin abre, e cada seção diz o que fazer numa frase com um botão.

## A janela única (2026-10-20)

Pedido do usuário: "O Diorama tá muito separado, devia ser tudo em um só, interface boa e fácil de uso, além de configurações, tem que ser uma simplicidade de uso extrema." Antes eram sete botões na barra e sete widgets (Mapas, Catálogo, Assets, Conexão, Servidor, Problemas, Suporte). Agora:

- **Um botão** "Diorama" na barra (ícone: o pincel do editor de terreno do próprio Studio, claro ou escuro conforme o tema) e **uma janela** (`Diorama_janela`, flutuante, 980 × 660 ao abrir, mínimo 420 × 320). O Studio guarda posição e tamanho pelo id.
- **Cabeçalho**: o seletor do mapa aberto ("casa_teste_v2_l *  ▾": a lista de mapas, "+ Novo mapa", "Atualizar"); **Pedir ao Claude** (Ctrl+K); e o **indicador de estado**: uma bolinha e uma frase. Verde "Tudo ligado"; amarela "Aseprite desligado" ou "Canal do Studio desligado"; vermelha "Ponte desligada"; cinza "Verificando…". Clicado, mostra os detalhes (ponte, Aseprite, canal do Studio, Rojo, versão) e, com a ponte desligada, "Para ligar: dê dois cliques em Diorama.cmd" com o botão que copia o caminho.
- **Navegação lateral** (ícones do Studio e nome curto; Ctrl+1 a Ctrl+7):

| Seção | Arquivo | O que tem |
|---|---|---|
| **Mapa** | `ferramentas/mapas.tsx` | O editor (a tela principal). Sem mapa aberto: a **tela inicial** com três ações grandes, "Abrir mapa" (a lista logo abaixo), "Novo mapa" e "Verificar tudo", e o rascunho para recuperar, se houver. Com mapa: a barra (Salvar Ctrl+S, ↶ Ctrl+Z, ↷ Ctrl+Y, pincéis com a tecla, camadas 1–4, zoom, grade, outras camadas, "⋯ Mais"), o canvas e o painel Tiles / Peças / Marcadores (/ Log no Avançado), ao lado com a janela larga (≥ 720 px de corpo) e embaixo com a estreita; no rodapé, a mensagem e o que há sob o mouse (no Avançado, as coordenadas e os tiles de cada camada). |
| **Peças** | `ferramentas/catalogo.tsx` | O Catálogo: a lista com miniatura e busca, a folha, a ficha da peça (nome, tipo, camada, **Recorte e cores**, "Entra no Decorar", duplicar, apagar, Abrir no Aseprite). "Salvar Ctrl+S" grava peças e fundos que estiverem sujos; "Mandar ao jogo" é o gerador `--decorar`. Larga: lista, folha e ficha juntas; estreita: um botão Lista / Folha / Ficha mostra uma de cada vez. No Avançado: id, folha, área, bloqueia, ação, ações por linha, nota, outros campos, formas e variantes do Decorar, as abas Fundos, Zonas e Log, os filtros de folha e tipo, "Salvar peças"/"Salvar fundos" separados, "Novo fundo" e o interruptor Folhas locais. |
| **Arte** | `ferramentas/arte.tsx` + `assets.tsx` | Em cima, **Folhas de tiles**: o estado do Aseprite, "Abrir no Aseprite: casa / castelo" (a folha inteira), Folhas locais e o aviso de folha salva. Embaixo, **Imagens e sons**: busca, "Só o que falta enviar", a lista (o nome e "ok"/"falta enviar"), a prévia e o envio em dois passos (Preparar, Enviar com confirmação). No Avançado: as colunas id/tipo/arquivo, os filtros Imagens/Sons/Antigos, o caminho e o recorte do envio, "Importar enviadas" (JSON), o log e as notas do registro. |
| **Testar** | `ferramentas/testar.tsx` (+ `servidor.tsx` no Avançado) | Um botão grande **"Testar \"<mapa>\""**: salva o mapa se preciso, gera o módulo do jogo (`POST /gerar/<mapa>`), grava `InteriorTeste` e `InteriorTesteCelula` (a última célula clicada no canvas, senão o nascimento) e diz "Pronto: aperte Play (F5)" (avisando se o Rojo está desligado). "Desligar o teste" limpa os atributos (e para a sessão, se estiver rodando); "Guardar onde o jogador está" (durante o Play) deixa o próximo teste começar no mapa e na célula do jogador. Sem mapa aberto: "Abra um mapa para testar." com o botão "Abrir mapa". No Avançado: as abas de antes, Execução, Atributos, Place e Output. |
| **Verificar** | `ferramentas/verificar.tsx` | "Verificar tudo" (roda sozinho ao abrir), o resumo em uma frase ("Tudo certo.", "2 erros e 3 avisos. Comece pelos erros."), o **peso do mapa aberto** e a lista: gravidade, onde, o quê, "Como corrigir" e um botão que **leva ao lugar** (abre o mapa, seleciona a peça em Peças, filtra a imagem em Arte, abre o place no Avançado do Testar, ou os detalhes da conexão). Ponte desligada: uma frase e "Como ligar a ponte". No Avançado: os filtros por gravidade e grupo e "Copiar lista". |
| **Ajuda** | `ferramentas/ajuda.tsx` | "Guia rápido" (escrito no plugin, funciona sem a ponte: como começar, as seções, o que é a ponte, Pedir ao Claude, o que fazer quando algo dá errado), "Atalhos" e os documentos de `docs/diorama/*.md`. |
| **⚙ Configurações** | `ferramentas/configuracoes.tsx` | Ponte (estado, como ligar, endereço com "Usar"/"Padrão", "Tentar de novo", "Copiar caminhos"); Editor de mapas (zoom ao abrir 1×/2×/3×, grade ligada ao abrir, reabrir o último mapa); Imagens (Folhas locais); Interface ("Mostrar opções avançadas"; o idioma é só português); Claude ("Permitir executar Luau"); Sobre (no Avançado: versão, pacote, sessão, caminhos); "Restaurar padrões" (pede o segundo clique). |

A antiga ferramenta **Conexão** deixou de ser seção: virou o indicador do cabeçalho mais o cartão Ponte das Configurações.

### Simplicidade (as regras que valem em todas as seções)

- **Avançado**: ids, coordenadas, JSON, hashes, as abas de depuração e os campos raros ficam atrás de "▸ Avançado". O estado é um só para a janela inteira, fechado por padrão e guardado (Configurações → "Mostrar opções avançadas" é o mesmo interruptor).
- **Estado vazio ou erro**: sempre uma frase e um botão do que fazer (`Vazio`, `ui/simples.tsx`): "Abra um mapa para testar." [Abrir mapa]; "Ainda não há mapas." [Novo mapa]; ponte desligada [Tentar de novo] / [Como ligar a ponte].
- **Atalhos à vista** nos botões (Salvar Ctrl+S, ↶ Ctrl+Z, Pincel (B), 1 Chão…, Pedir ao Claude Ctrl+K).
- **Sem rolagem horizontal**: as barras quebram linha (`Fileira`), Mapa e Peças trocam de disposição na largura estreita, o cabeçalho encolhe (o Claude vira "Claude", o indicador vira só a bolinha). Conferido em 2026-10-20 no Studio de teste: em todas as seções, nenhum elemento à vista passa da borda direita com a janela a 978 px nem a 420 px (só o canvas e a folha rolam na horizontal, de propósito).
- **Tema do Studio**: as cores vêm do guia de estilo (`cor(...)`), os ícones de `rbxasset://studio_svg_textures/...` na pasta Light ou Dark.
- **Textos** curtos e sem jargão; "ponte" ficou, explicada na Ajuda e nos detalhes do estado.

### Pedir ao Claude (2026-10-20)

Decisão do usuário: pedir coisas à IA de dentro do Diorama, e a IA **age com confirmação**. O botão do cabeçalho (Ctrl+K) abre a caixa à direita (a janela inteira, se estreita): a conversa da sessão, o campo e "Enviar" (Enter), "Claude está pensando…" enquanto espera e, quando a resposta traz uma proposta, a lista das mudanças com **Aplicar** e **Cancelar** (nada muda sem o Aplicar). O pedido leva o contexto: o mapa aberto, a seção, a célula sob o mouse e a última clicada, a ferramenta, a camada, o tile ou a peça escolhidos, se há mudança não salva, a seleção do Explorer e os problemas do último Verificar (`ia.ts`, `ui/pedirClaude.tsx`). O contrato com a ponte está em `docs/diorama/CONEXOES.md`, seção 7; **o back-end ainda não existe**: até lá, todo pedido volta com "Ainda não disponível: atualize a ponte (ela ainda não tem o Claude). O pedido não foi enviado." (o autoteste confere isso, e só manda o pedido de teste enquanto o `GET /status` não tem o campo `ia`).

### Ferramentas novas (2026-10-20)

O usuário pediu, além de organizar, "diversos outros [recursos] que você pode pensar". Entraram, cada um no lugar dele e sem poluir a tela:

- **Duplicar, renomear e apagar o mapa** (Mapa → "⋯ Mais"). Duplicar e renomear pedem o mapa salvo (a cópia sai do disco); renomear grava o novo e apaga o antigo e avisa que as saídas de outros mapas e o módulo gerado precisam do nome novo; apagar pede o segundo clique (o git guarda a última versão salva).
- **Peso do mapa** (`mapas/orcamento.ts`; Mapa → "⋯ Mais" → Orçamento, e o cartão do Verificar): as imagens que o jogo vai criar, estimadas juntando as faixas de tiles vizinhos na folha (o jogo junta também na vertical, então o real é igual ou menor), por camada, e os moradores, contra as metas do `CLAUDE.md` (até 1.000 imagens, no máximo 2.500; 12 bonecos prontos). Frase: "Leve", "Pesado para celular fraco" ou "Pesado demais", com o que fazer.
- **Música e ambiente da zona numa lista** (Mapa → Marcadores → Zonas): "Música: nenhuma | ilha | sala" (os lugares saem das chaves `musica.<lugar>_<período>` do registro) e "Ambiente: nenhum | casa | exterior | mar" (cópia de `AMBIENCE_PROFILES` de `src/shared/sounds.ts`). O campo `chave=valor` continua para as outras propriedades.
- **Testar com um clique** e **"Guardar onde o jogador está"** (Testar, acima).
- **Verificar leva ao lugar** (o botão de cada problema).
- **Abrir a folha inteira no Aseprite** (Arte).

Ficaram como ideia, porque precisam de rota nova na ponte (que outro agente mantém): **exportar o mapa como PNG** (a ponte compõe as camadas com as folhas e grava em `docs/media/`), **histórico do mapa** (`git log` e `git show` do bloco, com "voltar a esta versão"), **modelos de cômodo** (blocos pequenos em `diorama/modelos/` para carimbar), **prévia de dia e noite no canvas** (o tom de `shared/daylight.ts` por `ImageColor3` nas camadas, mais as luzes de `lightTiles.ts`) e **busca de tile por nome** (precisa de nomes no `zonas.json` ou num catálogo de tiles).

### Ligar a ponte: `Diorama.cmd`

Na raiz do repositório. Dois cliques: se a ponte já responde em `127.0.0.1:34873/status`, diz "A ponte do Diorama já está ligada" e fecha em 4 s; senão abre uma janela com o título "Diorama — ponte" e roda `C:\Program Files\nodejs\node.exe tools\diorama_ponte.mjs --plugin-watch` (o `rbxtsc -w` do plugin junto, então o Studio recebe o pacote novo sozinho). Fechar a janela desliga a ponte. Põe `C:\Program Files\nodejs` e `%USERPROFILE%\.aftman\bin` no PATH só dessa janela. O indicador do cabeçalho, os detalhes do estado, a Ajuda e as Configurações mandam para ele quando a ponte está desligada.

### Casca nova: reiniciar o Studio uma vez

A casca (`index.server.ts`) passou a criar só o botão "Diorama" e a janela, e liga o clique ela mesma (`Ambiente.janela`). Um Studio aberto com a casca anterior continua com os sete botões até reiniciar; o pacote novo funciona nela (pede o botão e a janela por `ambiente.botao`/`ambiente.widget`, e os botões velhos ficam mortos). Sem pacote nenhum (sem ponte e com o embutido quebrado), a janela mostra "O Diorama não carregou" com o motivo e "dê dois cliques em Diorama.cmd".


## Onde está cada coisa

| Caminho | O que é |
|---|---|
| `plugin/tsconfig.json` | Projeto roblox-ts do plugin: `rootDir` `src`, `outDir` `out`, JSX do Vide, sem Flamework. `typeRoots` aponta para o `node_modules/@rbxts` da raiz (e para um `plugin/node_modules/@rbxts` que não existe, porque o roblox-ts exige essa entrada). |
| `plugin/default.project.json` | Árvore do Rojo: a pasta `out/` vira o Script raiz `Diorama` (por causa do `init.server.luau`), com `rbxts_include` (runtime do roblox-ts) e só os pacotes que o plugin importa (`vide`, `services`) dentro dele. Só `rojo build`; nunca `rojo serve` com este projeto. |
| `plugin/src/index.server.ts` | A **casca** (o Script raiz do `.rbxm`): o botão "Diorama" e a janela `Diorama_janela` (criados ao carregar, ligados um ao outro, ícone que segue o tema), carga do pacote da ponte ou do embutido, troca a quente com volta ao anterior, a mensagem "O Diorama não carregou" quando não há pacote. Não importa nada do pacote. |
| `plugin/src/app.ts` | Entrada do pacote: `iniciar(ambiente) → parar`. Liga o tema, as Configurações, o filtro do Output, a janela (`widget.ts` e `ui/janela.tsx`), o teleporte pendente e o canal do Studio. |
| `plugin/src/ambiente.ts` | O que a casca entrega (`plugin`, `botao`, `widget`, `janela` (o botão e a janela únicos), `versao`, `hash`, `origem`, `sessao`), `aoParar`/`encerrar` (o que desfazer na troca) e `lerConfig`/`gravarConfig`. Sem dependências: todos podem importar. |
| `plugin/src/secoes.ts` | As sete seções (id, nome, descrição, ícone do Studio), os **apelidos** (os nomes das ferramentas de antes: `mapas` → `mapa`, `catalogo` → `pecas`, `assets` → `arte`, `servidor` → `testar`, `problemas` → `verificar`, `suporte` → `ajuda`, `conexao`/`config` → `configuracoes`) e os caminhos dos ícones. Sem dependências. |
| `plugin/src/config.ts` | As Configurações numa chave só (`Diorama_config`): avançado, zoom e grade ao abrir, reabrir o último mapa, a última seção, o endereço da ponte; `restaurarPadroes`, `fachada` (fonte que grava ao escrever). |
| `plugin/src/ui/janela.tsx` | A moldura: cabeçalho (seletor de mapa, Pedir ao Claude, indicador de estado e `estadoGeral()`), navegação, um quadro por seção, as caixas por cima (lista de mapas, detalhes do estado, Claude), os atalhos Ctrl+K, Ctrl+1–7 e Esc, o título da janela com o mapa e o "*", a conferência da ponte de 5 em 5 s com a janela aberta. |
| `plugin/src/ui/simples.tsx` | `BotaoGrande`, `Vazio` (frase + botão), `DobraAvancado`/`BotaoAvancado`, `Ponto`/`LinhaEstado` (bolinhas), `Cartao`, `Icone` (ícones do Studio por tema). |
| `plugin/src/ia.ts`, `ui/pedirClaude.tsx` | Pedir ao Claude: o cliente das rotas `/ia/pedidos` (CONEXOES.md, seção 7), a conversa da sessão, a proposta pendente, Aplicar/Cancelar; a caixa. |
| `plugin/src/mapas/orcamento.ts` | O peso do mapa (imagens estimadas por camada, moradores) contra as metas de desempenho. |
| `plugin/src/canal.ts` | Canal do Studio (`CONEXOES.md`, seção 2): presença a cada 5 s, long-poll de comandos, a tabela de comandos, o interruptor "Permitir executar Luau" e o `estadoCanal` que o indicador de estado mostra. |
| `plugin/src/autoteste.ts` | O comando `autoteste`: abre cada seção, conta instâncias, pega os erros do Output e roda as conferências de cada uma, e confere a moldura (abaixo). |
| `plugin/src/autotesteRecorte.ts` | A parte do autoteste do Catálogo que confere a seção Recorte (abaixo); só lê, então roda também com `"edicao": false`. |
| `plugin/src/autotesteEdicao.ts` | A parte do autoteste que mexe nos painéis como o autor (pincel, traço, carimbo, desfazer, peça, marcadores, salvar, conflito, rascunho, mapa apagado; Catálogo sem gravar; atributos do Servidor). |
| `plugin/src/simulacao.ts` | O registro das ações dos painéis (`registrarAcoes(secao, { nome: (args) => … })`, aceitando os apelidos): cada painel montado registra as funções que os cliques dele chamam, e o comando `simular` e o autoteste chamam as mesmas. |
| `plugin/src/inspecao.ts` | O comando `inspecionar`: a janela (aberta, título, instâncias, filhos), a seção aberta, cada seção (à vista, montada, instâncias), as pastas `Pacote_*` na casca, o que espera o `parar`, os ouvintes do Output, as folhas locais, a memória e, com `ferramenta` (uma seção ou `"janela"`), a árvore resumida. |
| `plugin/src/aseprite.ts` | "Abrir no Aseprite": `POST /aseprite/comandos { nome: "abrir_regiao", args: { folha, area } }` pela ponte, com a mensagem pronta para o painel; `abrirArquivoNoAseprite` usa o comando `abrir { arquivo }` (o recorte da etapa G). |
| `plugin/src/canonico.ts` | JSON canônico (chaves em ordem), para saber se um arquivo mudou no disco e para comparar blocos no autoteste. |
| `plugin/src/folhasLocais.ts` | Prévia local das folhas (`CONEXOES.md`, seção 4): uma EditableImage por metade, ids falsos `local://<folha>/<metade>` e `conteudo(id)`, que converte qualquer id em `Content` para `ImageContent`. |
| `plugin/src/ferramentas/index.ts` | `SECOES_MONTAVEIS`: cada seção de `secoes.ts` com a função `montar` do arquivo dela. Fica em `ferramentas/index.ts`, e não em `ferramentas.ts`, porque o Rojo não aceita arquivo e pasta com o mesmo nome. |
| `plugin/src/ferramentas/<arquivo>.tsx` | Um painel por arquivo, com `montar(quadro, contexto)`: `mapas.tsx` (Mapa), `catalogo.tsx` (Peças), `arte.tsx` e `assets.tsx` (Arte), `testar.tsx` e `servidor.tsx` (Testar e o Avançado dele), `verificar.tsx`, `ajuda.tsx`, `configuracoes.tsx`. `emConstrucao.tsx` é o painel provisório para uma seção nova. |
| `plugin/src/widget.ts` | A janela e as seções: `prepararJanela` (pega o botão e a janela da casca), `definirQuadro`, `garantirMontada` (monta o painel na primeira vez que a seção fica à vista), `mostrar(id)` (abre a janela na seção), `secaoAberta`, `secaoVisivel` (os laços dos painéis param quando a seção não está à vista; `widgetVisivel` é o mesmo), `quadro`, `montada`, `desmontar`. Todo id passa pelos apelidos. |
| `plugin/src/ponte.ts` | Cliente da ponte: uma função tipada por rota, devolvendo `Resultado<T>` (`{ ok, valor }` ou `{ ok, erro, status? }`), nunca lançando erro. Os tipos do bloco (`Bloco`, `Saida`, `Chegada`), `lerAssets` (o registro e o mapa chave → `rbxassetid://`), `lerImagem` (qualquer PNG de `assets/`, `diorama/folhas/` e `diorama/recortes/`), `lerIdsGraal`. As fontes `ponteLigada` e `erroPonte` moram aqui (e `estado.ts` as reexporta) para não haver ciclo entre os dois módulos. |
| `plugin/src/estado.ts` | Fontes do Vide compartilhadas entre as ferramentas (status da ponte, lista de mapas, mapa aberto, imagens das folhas) e as leituras que mais de uma ferramenta faz: `recarregarMapas()`, `carregarImagensFolhas()` (com os ids de reserva de `assets/registro.json`). |
| `plugin/src/versao.ts` | A versão do plugin, mostrada nos detalhes do estado e em Configurações. |
| `plugin/src/plugin.d.ts` | Traz os globais de plugin (`plugin`, `settings()`) dos tipos do roblox-ts. |
| `plugin/src/ui/kit.tsx` | As peças de interface no tema do Studio, todas com `ordem` (LayoutOrder): caixas (`Painel`, `Coluna`, `Linha`, `Fileira`, `Bloco`, `Preenche`, `Espaco`, `Lista`), textos (`Rotulo`, `Titulo`, `TextoCurto`, `Etiqueta`, `Aviso`, `Separador`), controles (`Botao`, `Interruptor`, `Alternar`, `Ciclo`, `Escolha`, `Marcas`, `Abas`), campos (`Campo`, `CampoMulti`, `CaixaTexto`, `AreaTexto`, `LinhaCampo`) e `cor(...)` para qualquer cor do guia de estilo, reativa ao tema. |
| `plugin/src/ui/extras.tsx` | O que só o editor de mapas usa: `Legenda` (rótulo de largura fixa), `Quadro`, `ListaSelecao`, `Amostra`. |
| `plugin/src/ui/folhaVista.tsx`, `recorte.tsx` | A folha inteira do Aeko rolável com zoom, grade, zonas e destaques (Catálogo); um recorte de uma folha pelas duas metades (miniaturas). |
| `plugin/src/ui/recortePeca.tsx` | A seção "Recorte e cores" do formulário do Catálogo (etapa G, abaixo). |
| `plugin/src/ui/alternarFolhas.tsx` | O interruptor "Folhas locais" (Arte, Configurações e o Avançado de Peças) e o aviso de folha salva no Aseprite. |
| `plugin/src/ui/copiar.ts` | `copiarTexto`: tenta `setclipboard` por pcall; sem ela, os painéis mostram o texto para Ctrl+C. |
| `plugin/src/mapas/` | O editor do bloco: `bloco.ts` (o modelo de 64 × 64 células, `deJson`/`paraJson` no formato do gerador, os seis terrenos, os marcadores), `canvas.tsx` (o canvas com pools de ImageLabel), `pinceis.ts`, `historico.ts` (desfazer/refazer), `paleta.tsx` (os tiles), `pecas.tsx` (as peças do catálogo), `regras.ts` (o catálogo lido de `pecas.json`/`fundos.json` e as regras de fundo 12.14 e encaixe 12.12, cópia de `src/shared/decor.ts`), `marcadores.tsx` (nascimento, entradas, saídas, zonas, moradores), `zonas.ts` (cópia das zonas do jogo), `controle.ts` (o editor visto de fora: o painel registra `abrir(id)` e o resumo do bloco aberto, que o canal e o autoteste usam). |
| `plugin/src/catalogo/` | `formato.ts` (o formato de `pecas.json`, `fundos.json` e `zonas.json` como o gerador os lê: leitura defensiva, gravação com os campos não editados preservados, as células em texto), `folhas.ts` (as metades das folhas no Roblox), `problemas.ts` (os problemas do rodapé do Catálogo), `recortes.ts` (o campo `recorte` de `pecas.json`, a montagem das imagens em EditableImage, a regra de luz não pintável, a paleta curta). |
| `plugin/src/assets/` | `registro.ts` (o `assets/registro.json` como lista, e o recorte sugerido para cada entrada), `enviar.ts` (EditableImage + `CreateAssetAsync`, experimental). |
| `plugin/src/servidor/` | `execucao.ts` (modo do Studio, Run/Pause/Stop, jogadores), `atributos.ts` (os atributos de desenvolvimento do Workspace), `place.ts` (a conferência do place), `output.ts` (o filtro vivo do Output), `teleporte.ts` (o teleporte pendente entre as sessões). |
| `plugin/src/problemas/` | O diagnóstico: `diagnostico.ts` (junta tudo), `mapas.ts`, `catalogo.ts`, `assets.ts`, `visual.ts` (o visual dos moradores; os ids vêm de `GET /graal/ids`, com a cópia de reserva), `zonas.ts`, `tipos.ts`. |
| `plugin/teste/ciclos.mjs` | Os ciclos de identidade no Node: transpila `formato.ts`, `bloco.ts` e `zonas.ts` com o `typescript` da raiz e um simulacro dos globais do roblox-ts, grava o catálogo e os 14 blocos pelo código do plugin (os blocos pela `gravarBloco` da ponte) e confere que `--decorar` e `diorama:jogo -- <mapa>` não mudam nada em `src/`. Restaura os arquivos no fim (`--manter` deixa, `--catalogo`, `--blocos`, `--mapa <id>` escolhem). |
| `plugin/out/`, `plugin/include/` | Saída do roblox-ts; fora do git. |

## Como acrescentar uma seção

1. A definição em `SECOES` (`plugin/src/secoes.ts`): id, nome curto, descrição e o ícone do Studio (`studio_svg_textures/Shared/<grupo>/<Tema>/<tamanho>/<nome>.png`).
2. O painel em `plugin/src/ferramentas/<arquivo>.tsx`:

   ```tsx
   import Vide, { mount } from "@rbxts/vide";
   import { Coluna, Painel, Titulo } from "../ui/kit";
   import type { ContextoSecao } from "../widget";

   export function PainelExemplo() {
   	return (
   		<Painel>
   			<Coluna>
   				<Titulo texto="Exemplo" ordem={0} />
   			</Coluna>
   		</Painel>
   	);
   }

   export function montar(quadro: Frame, _contexto: ContextoSecao) {
   	return mount(() => <PainelExemplo />, quadro);
   }
   ```

3. A entrada em `MONTAR`, em `plugin/src/ferramentas/index.ts`.
4. `npm run plugin:compile` com a ponte no ar: a navegação ganha o item na troca do pacote (a casca não muda). Siga as regras da simplicidade acima: o raro no Avançado, estado vazio com frase e botão, nada de largura fixa maior que 420 px.

## Regras e armadilhas

- As funções de `ponte.ts` yieldam (`HttpService:RequestAsync`). Chame-as dentro de `task.spawn`, de um clique ou de outro evento; nunca de dentro de um `effect` do Vide.
- Vale o mesmo que no jogo: não criar elementos com propriedades reativas de dentro de uma função usada como filho. Use `For`, `Show` ou crie tudo de uma vez e alterne `Visible`.
- O roblox-ts recusa `local` (e as demais palavras reservadas do Luau) como nome de variável, e um método estático com o mesmo nome de um campo da instância (`ModeloBloco.novo`, não `vazio`). O `tsc` não acusa; só o `rbxtsc`.
- Dois módulos não podem se importar um ao outro (o `TS.import` do runtime acusa ciclo): `ponte.ts` não importa `estado.ts`.
- Os tipos do `@rbxts/types` não trazem `PluginGui.Title`, `PluginToolbarButton.ClickableWhenViewportHidden` nem `RunService.Stop`; `widget.ts`, `index.server.ts` e `servidor/execucao.ts` fazem um cast.
- O `JSONEncode` do Roblox manda `[]` para toda tabela vazia (`props: {}` vira `[]`); a ponte desfaz nos blocos. Ao gravar outro JSON, pense nisso.
- Para pixels, `lerFolha` e `lerImagem` em `ponte.ts` devolvem um `buffer` RGBA pronto para `EditableImage:WritePixelsBuffer`.
- O MCP do Studio e o Rojo não são usados pelo plugin; o plugin só fala com a ponte (e a ponte faz o ping no Rojo).
- O que só se confere no Studio está em `docs/diorama/DUVIDAS.md`, itens 20 a 28, com o que já foi conferido em 2026-10-20.
- **`LayoutOrder` empatado** numa `Coluna`/`Linha`: o Studio mantém a ordem de inserção entre os empatados, então um elemento sem `ordem` (vale 0) vai parar junto do primeiro da lista. Foi assim que "Novo" e "Desfazer/Refazer" subiam para debaixo do título em Mapas e os campos dos Marcadores ficavam acima do separador (corrigido em 2026-10-20). Dê `ordem` a todo filho de uma lista.
- **`AutomaticSize` Y dentro de um `ScrollingFrame`**: o Studio prende o elemento à altura visível do quadro, e o resto some sem barra de rolagem (o `ESPECIFICACAO.md` no Suporte mostrava 476 de 4379 px). `AreaTexto` e `CaixaTexto` (kit) medem o texto com `TextService:GetTextSize` e põem a altura à mão; faça o mesmo para texto comprido.
- Pedidos à ponte que mudam algo (POST, PUT, DELETE) levam o cabeçalho `X-Diorama: 1` (`ponte.ts`); a ponte pode recusar sem ele.
- Uma ferramenta nova que tenha ações que valham testar registra-as com `registrarAcoes` (`simulacao.ts`) dentro do componente, com `cleanup(...)` em volta.

## Proteções e conveniências do editor (2026-10-20)

- **Rascunhos**: um mapa com mudança não salva vira rascunho nas configurações do plugin (`Diorama_mapas_rascunhos`, um por mapa) quando o painel desmonta (recarga do pacote, Studio fechando) ou a janela fecha (com aviso no Output). Ao abrir de novo, a tela inicial (e o topo do editor) mostra "Mudanças não salvas de …" com **Recuperar** e **Descartar**. Salvar o mapa, ou descartar as mudanças dele (abrir outro com o segundo clique), apaga o rascunho.
- **Conflito com o disco**: Salvar (Mapas, e "Salvar peças"/"Salvar fundos" no Catálogo) relê o arquivo antes e compara com o que foi aberto; se outro programa, o MCP ou outro Studio gravou nesse meio-tempo, recusa e diz; o segundo clique sobrescreve. Uma mudança feita enquanto a ponte gravava deixa o mapa (ou o catálogo) sujo, com "Houve mudanças enquanto salvava: salve de novo".
- **Recarregar** no Catálogo com mudança não salva pede um segundo clique.
- **Lembrar**: o último mapa, a ferramenta, a camada e a aba da direita (`Diorama_mapas_lembrar`); o painel reabre o mapa sozinho (se "Reabrir o último mapa" estiver ligado em Configurações), a não ser que haja rascunho dele esperando. O zoom e a grade ao abrir vêm das Configurações.
- **Pincel**: arrastar um carimbo maior que 1 × 1 repete o padrão alinhado ao começo do traço (antes, carimbava de novo a cada célula, deslocado); o mouse rápido não deixa buracos (as células entre duas leituras entram em linha). Desfazer cancela um posicionamento de marcador pendente.
- **Paleta**: o campo "ir para" aceita `34,25`, `casa 40,25` ou `40,25,3,3` (seleciona e rola até lá); **Abrir no Aseprite** abre a seleção num sprite do Aseprite (pela ponte; lá, "Salvar região na folha" grava de volta). O Catálogo tem o mesmo botão para a peça selecionada.
- **Folha salva no Aseprite**: quando a ponte avisa (`recarregar_folhas`), Mapas e Catálogo dizem qual folha e quando; com "Folhas locais" desligado, o aviso traz **Ver folhas locais**.
- **Filtros ao vivo**: o filtro de peças (Mapas, aba Peças) e o do Catálogo respondem a cada letra, sem Enter.
- **Atalhos à vista**: os botões mostram B, R, G, E, I, 1–4, Ctrl+S, Ctrl+Z e Ctrl+Y.
- **Canvas mais leve**: o vazio pintado no chão ([folha, 0, 2], uma cor só) vira uma faixa por sequência numa linha, esticando o miolo de 8 × 8 do tile (o truque do jogo para tiles de uma cor). `casa_teste_v2_l` aberta: 5574 → 3886 instâncias no widget; abrir leva uns 20–80 ms de ponte e 50 ms de montagem.
- **Output do Servidor**: o buffer não é mais copiado a cada mensagem, e o texto da aba é refeito em lote (no máximo a cada 0,25 s) e só com a aba e o widget à vista.

## Recorte e cores no Catálogo (etapa G, 2026-10-20)

A etapa G (`docs/diorama/RECORTES.md`) grava em cada peça recortada de `pecas.json` o campo `recorte` (`{ arquivo, folga, base, partes: [{ n, arquivo, referencia, cor_media, pixels }] }`) e os PNG em `diorama/recortes/<folha>/`. No formulário da peça, a seção **Recorte e cores** (`ui/recortePeca.tsx`, dados em `catalogo/recortes.ts`):

- Mostra, lado a lado e na mesma escala, o **original** (a área da folha do disco, com a mesma folga de 1 px), o **recorte**, a **máscara de cada parte** e a **prévia**. Tudo em EditableImage com os pixels de `GET /imagens/diorama/recortes/...rgba` e `GET /folhas/<folha>.rgba`, criadas ao selecionar a peça e destruídas ao trocar de peça ou desmontar o painel.
- A prévia é o que o jogo faria (RECORTES.md, "O jogo"): a base e, para cada parte com cor escolhida, a máscara por cima com `ImageColor3` = a cor. Parte sem cor escolhida fica sem máscara.
- Um seletor por parte pintável: a paleta curta (12 cores), o campo `#RRGGBB` (vale quando o foco sai; vazio = original) e "original". **Restaurar cores** volta todas ao original. As cores são só da prévia: nada vai para `pecas.json` (guardar cor por peça posta é do Decorar do jogo, `PlayerData.decor`).
- **Luzes e fogo não se pintam** (decisão minha, a partir da sugestão da etapa G): a peça de tipo `luz`, com o campo `luz`, ou cuja área fica dentro da área de uma luz da mesma folha (a `torch` e o `lamp` repetem a área de `casa@1,0` e `casa@64,31`). Elas mostram o recorte e as máscaras, sem o seletor, com o motivo na linha de situação.
- Peça sem `recorte` (hoje só o `rug`, o tapete): "sem recorte (rode python tools/recortes.py)".
- **Abrir recorte no Aseprite** abre `diorama/recortes/<folha>/<id>.png` pelo comando `abrir` da extensão (`POST /aseprite/comandos`, com `X-Diorama: 1`). O que se salvar lá fica só no arquivo do recorte; `python tools/recortes.py` refaz o recorte por cima.
- Os dois sofás de `diorama/recortes/extras.json` (`sofa`, `sofa_dourado`) não estão em `pecas.json` e por isso não aparecem no Catálogo.
- O texto "Outros campos" do formulário cita o `recorte` só pelo nome (o JSON dele tem a seção própria).

## Canal do Studio e autoteste

Com a ponte e o Studio abertos, o plugin aceita comandos pela ponte (`docs/diorama/CONEXOES.md`, seção 2; rotas em `docs/diorama/PONTE.md`). Pelo terminal:

```
curl -s http://127.0.0.1:34873/studio/presenca                       # os Studios conectados (sessao, place, modo)
curl -s -X POST http://127.0.0.1:34873/studio/comandos -H "Content-Type: application/json" \
     -d '{"tipo":"autoteste","sessao":"<sessao>"}'                     # → { "id": "c3" }
curl -s "http://127.0.0.1:34873/studio/respostas/c3?espera=50"
```

Com mais de um Studio aberto, mande sempre a `sessao` (sem ela, vai para o mais recente na edição). `executar_luau` só roda com "Permitir executar Luau" ligado em Configurações (desligado por padrão). `abrir_ferramenta` e o novo `abrir_secao` aceitam o id da seção ou o nome antigo da ferramenta.

O **autoteste** (`{ "tipo": "autoteste", "args": { "ferramentas"?: [...], "espera"?: 2, "remontar"?: true, "edicao"?: false } }`; `ferramentas` aceita os ids das seções ou os nomes antigos) abre a janela em cada seção (e volta à seção e ao estado de antes), espera um quadro, conta as instâncias, espera as leituras da ponte e junta os erros e avisos que o Output recebeu nesse tempo. Conferências de cada uma (os títulos são os de antes; as seções novas entre parênteses):

- **Mapas**: abre `teste_d_destino` e `casa_teste_v2_l` pelo editor e confere, por camada, as células desenhadas no canvas contra as do bloco e de onde vem a imagem dos tiles (id do Roblox ou EditableImage); salva o bloco aberto como `zz_autoteste`, reabre no editor, compara o JSON, apaga o mapa e volta ao original; monta a folha da casa em EditableImage e lê um pixel de volta. Com mudança não salva no editor, pula os mapas.
- **Mapas, edição** (`autotesteEdicao.ts`; `"edicao": false` pula): num mapa novo `zz_autoteste_edicao`, pincel numa célula, traço rápido sem buracos, carimbo 2 × 2 arrastado, desfazer/refazer, borracha por camada, peça com regras recusada sobre o vazio e peça livre carimbada, nascimento, saída com destino e chegada, desfazer que cancela o posicionamento, salvar, pintar durante o salvamento (fica sujo), conflito com o disco (recusa e depois sobrescreve), rascunho ao desmontar e montar o painel, mapa apagado no disco; apaga o mapa no fim e volta ao que estava aberto.
- **Catálogo**: lê `pecas.json` e `fundos.json`, conta, roda os problemas do catálogo e confere que a folha está à vista; abre o recorte de uma peça com partes (o `sofa_dourado`, se um dia estiver em `pecas.json`; senão a primeira pintável com 2 partes ou mais, hoje o `pot`), confere que o original, o recorte, a base e cada máscara montaram (pixels opacos lidos de volta > 0), que trocar a cor de uma parte muda o `ImageColor3` da máscara na prévia e que "Restaurar cores" a esconde; que uma luz (`torch`) não aceita cor; que uma peça sem recorte (`rug`) diz que não tem; na edição, cria uma peça e confere que "Recarregar" pede o segundo clique e então descarta (não grava nada em `diorama/catalogo`).
- **Assets (Arte)**: o registro e quantos estão sem id; a lista do painel e o `filtrar` ("ui.logo" acha 1); o cartão Folhas de tiles. **Problemas (Verificar)**: "Verificar tudo" pela ação `rodar` e o diagnóstico inteiro. **Servidor (Testar)**: os atributos de teste, a conferência do place, (edição) gravar e limpar `AcoesTeste` e `HoraTeste`, e "Testar este mapa" sem o gerador (`testar {gerar: false}`: grava `InteriorTeste` com o mapa aberto, "Desligar o teste" limpa, e volta ao que estava). **Suporte (Ajuda)**: a lista de documentos e o `ESPECIFICACAO.md` inteiro e rolável. **Conexão (Configurações)**: `GET /status` e o estado das Configurações.
- Sem `ferramentas`, devolve também `janela` (a moldura: uma janela só, sete itens de navegação e sete quadros, o cabeçalho com seletor, Claude e estado, as três caixas, e o Pedir ao Claude respondendo "Ainda não disponível" enquanto a ponte não anuncia a IA) e `studio` (os itens 20 a 27 de `DUVIDAS.md`).

Para testar uma mudança: `npm run plugin:compile`, esperar o Output mostrar o pacote novo e mandar o autoteste com `"remontar": true`.

Comandos de diagnóstico (2026-10-20), para testar sem clicar:

- `inspecionar { ferramenta?, profundidade? }`: a janela (aberta, título, instâncias), a seção aberta, cada seção (à vista, montada, instâncias), `pacotes_na_casca` (deve haver uma pasta só), `ao_parar` (o que o `parar` vai desfazer), os ouvintes do Output, as folhas locais carregadas, a memória Lua e a do Studio, o resumo do mapa aberto (com `tempos` da última abertura) e, com `ferramenta` (uma seção, um nome antigo ou `"janela"`), a árvore com o número de descendentes de cada nó (os maiores primeiro).
- `simular { ferramenta, acao, args? }`: chama a ação do painel como o clique chamaria (abre a janela na seção antes; `ferramenta` aceita a seção ou o nome antigo). `acao: "acoes"` lista as de cada uma. Novas em 2026-10-20: **Testar** `estado`, `testar {gerar?}`, `parar_teste` (mais `aba` e `output` do Avançado); **Verificar** `rodar`, `ir {n}` (o botão "Ir" do n-ésimo problema); **Arte** `estado`, `filtrar {texto}`; **Configurações** `estado`, `avancado {valor}`, `endereco {texto}`; **Ajuda** `abrir {nome}` (também `guia` e `atalhos`). As de antes: **Mapas**: `estado`, `aba`, `ferramenta {f}`, `camada {n}`, `terreno {codigo}`, `tile {folha, c, l, w?, h?}`, `pressionar/arrastar/soltar {x, y}`, `traco {x, y, por?: [[x, y], …]}`, `desfazer`, `refazer`, `pecas`, `peca {id, forma?}`, `marcador {acao: nascimento | nova_entrada | nova_saida | nova_zona | novo_morador | aplicar_entrada | aplicar_saida | aba | lista, …}`, `novo {id}`, `clicar_mapa {id}`, `salvar {pintar_durante?: [x, y]}`, `testar`, `parar_teste`, `aseprite`, `guardar_rascunho`, `reler_rascunhos`, `recuperar_rascunho`, `descartar_rascunho`, `esquecer_rascunho {mapa}`. **Catálogo**: `estado`, `criar_peca {folha?, c, l, w, h}`, `selecionar {id}`, `apagar_peca`, `recarregar`, `salvar_pecas`, `salvar_fundos`, `recorte` (da peça selecionada: espera a carga e devolve os pixels opacos de cada imagem, a cor e o `ImageColor3` de cada parte), `recorte_cor {n, cor?: "#RRGGBB"}` (sem `cor`, volta ao original), `recorte_restaurar`, `recorte_aseprite`. **Servidor**: `aba {id}`, `output {contem?}`. **Problemas**: `rodar`. **Suporte**: `abrir {nome}`.
- `ciclar_widget { ferramenta, vezes?, desmontar? }`: fecha e reabre a janela na seção (e desmonta o painel a cada volta, como numa recarga) e devolve as instâncias da seção e da janela e a memória Lua antes e depois.

Medido em 2026-10-20 no Studio de teste: abrir e fechar Mapas, Catálogo, Servidor e Assets 8 vezes com desmontagem deixa as mesmas instâncias e a memória Lua oscilando sem crescer; 5 recargas do pacote deixam uma pasta `Pacote_*` só e `ao_parar` igual. A conexão de cada atributo de teste ao Workspace (`fonteAtributo`) não saía na recarga e ficava viva presa ao pacote velho; agora sai pelo `aoParar`.
