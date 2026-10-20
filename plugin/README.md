# Plugin Diorama

Editor de mapas e ferramentas de desenvolvimento do Haywood Valley dentro do Roblox Studio. É um projeto roblox-ts separado do jogo (sem Flamework), com interface em Vide, que compila para `%LOCALAPPDATA%\Roblox\Plugins\Diorama.rbxm`. Ele fala com o disco do repositório pela **ponte** (`tools/diorama_ponte.mjs`), um servidor HTTP local. A arquitetura inteira está em `docs/diorama/ARQUITETURA.md`; as rotas da ponte, em `docs/diorama/PONTE.md`; o formato dos blocos e do catálogo (o do gerador, que o plugin lê e grava), em `docs/diorama/GERADOR.md`.

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

O `.rbxm` instalado é uma **casca** (`src/index.server.ts`): cria a barra "Diorama", guarda os botões e os widgets por id e carrega o **pacote** (todo o resto, com entrada em `src/app.ts`). O Studio só relê o `.rbxm` ao reiniciar; o pacote, não:

- Ao abrir, a casca pede `GET /plugin/versao` à ponte. Com a ponte no ar, baixa `GET /plugin/pacote` (a árvore de `plugin/out` + `include` + `vide` e `services`), monta os ModuleScripts numa pasta `Pacote_<hash>` dentro do próprio script e chama `app.iniciar(ambiente)`. Sem a ponte, usa o pacote embutido no `.rbxm`.
- A cada 2 s a casca pergunta o hash de novo. Mudou: `parar()` do pacote velho, limpa os widgets, `iniciar` do novo. Se o novo falha (erro no `require` ou no `iniciar`), o Output mostra `[Diorama] o pacote … não iniciou: …` e a casca volta ao anterior; o mesmo hash não é tentado de novo.
- O Output mostra `[Diorama] pacote 0.4.0 (<hash>) carregado: ponte.` a cada troca.

Fluxo de trabalho: com a ponte rodando, `npm run plugin:compile` (ou `npm run diorama:ponte -- --plugin-watch`, que roda o `rbxtsc -w` junto) e o Studio troca o pacote sozinho em uns 2 s. `npm run plugin:build` só é preciso quando a casca (`index.server.ts`) muda, e aí é preciso reiniciar o Studio; ele também atualiza o pacote embutido, que vale quando a ponte não está no ar (e na sessão do cliente do Play, que não tem HTTP).

Regras que a recarga impõe ao código do pacote:

- Nenhum módulo usa o global `plugin` (só existe na casca): `ambiente().plugin` (`src/ambiente.ts`), ou o `plugin` que `montar(gui, plugin)` recebe.
- Nada de efeito no carregamento do módulo (conectar sinal, `task.spawn` de laço): faça no `iniciar` ou no painel, e guarde a conexão com `aoParar(...)` (`ambiente.ts`) para o `parar()` desfazer. Senão a versão velha continua viva depois da troca.
- `plugin:SetSetting` não aceita `.` na chave (aceita sem erro e não guarda nada). Use `lerConfig`/`gravarConfig` de `ambiente.ts`, que trocam os pontos por `_`.

Na primeira chamada à ponte o Studio pode perguntar se o plugin pode acessar `127.0.0.1`; aceite. Se a barra "Diorama" não aparecer, olhe o Output. A versão está em `plugin/src/versao.ts` e na ferramenta Conexão (com a origem do pacote e o hash).

## Rodar a ponte

```
npm run diorama:ponte    # HTTP em http://127.0.0.1:34873; Ctrl+C encerra
```

Só escuta em 127.0.0.1, sem autenticação. A ferramenta **Conexão** mostra se ela está respondendo. Sem a ponte, o plugin abre, mas cada painel mostra a mensagem "A ponte não respondeu...".

## Onde está cada coisa

| Caminho | O que é |
|---|---|
| `plugin/tsconfig.json` | Projeto roblox-ts do plugin: `rootDir` `src`, `outDir` `out`, JSX do Vide, sem Flamework. `typeRoots` aponta para o `node_modules/@rbxts` da raiz (e para um `plugin/node_modules/@rbxts` que não existe, porque o roblox-ts exige essa entrada). |
| `plugin/default.project.json` | Árvore do Rojo: a pasta `out/` vira o Script raiz `Diorama` (por causa do `init.server.luau`), com `rbxts_include` (runtime do roblox-ts) e só os pacotes que o plugin importa (`vide`, `services`) dentro dele. Só `rojo build`; nunca `rojo serve` com este projeto. |
| `plugin/src/index.server.ts` | A **casca** (o Script raiz do `.rbxm`): barra, botões e widgets por id, carga do pacote da ponte ou do embutido, troca a quente com volta ao anterior. Não importa nada do pacote. |
| `plugin/src/app.ts` | Entrada do pacote: `iniciar(ambiente) → parar`. Liga o tema, o filtro do Output, as ferramentas (`widget.ts`), o teleporte pendente e o canal do Studio. |
| `plugin/src/ambiente.ts` | O que a casca entrega (`plugin`, `botao`, `widget`, `versao`, `hash`, `origem`, `sessao`), `aoParar`/`encerrar` (o que desfazer na troca) e `lerConfig`/`gravarConfig`. Sem dependências: todos podem importar. |
| `plugin/src/canal.ts` | Canal do Studio (`CONEXOES.md`, seção 2): presença a cada 5 s, long-poll de comandos, a tabela de comandos, o interruptor "Permitir executar Luau" e o `estadoCanal` que a Conexão mostra. |
| `plugin/src/autoteste.ts` | O comando `autoteste`: abre cada ferramenta, conta instâncias, pega os erros do Output e roda as conferências de cada uma (abaixo). |
| `plugin/src/autotesteEdicao.ts` | A parte do autoteste que mexe nos painéis como o autor (pincel, traço, carimbo, desfazer, peça, marcadores, salvar, conflito, rascunho, mapa apagado; Catálogo sem gravar; atributos do Servidor). |
| `plugin/src/simulacao.ts` | O registro das ações dos painéis (`registrarAcoes(ferramenta, { nome: (args) => … })`): cada painel montado registra as funções que os cliques dele chamam, e o comando `simular` e o autoteste chamam as mesmas. |
| `plugin/src/inspecao.ts` | O comando `inspecionar`: os widgets (aberto, montado, instâncias), as pastas `Pacote_*` na casca, o que espera o `parar`, os ouvintes do Output, as folhas locais, a memória e, com `ferramenta`, a árvore resumida do widget. |
| `plugin/src/aseprite.ts` | "Abrir no Aseprite": `POST /aseprite/comandos { nome: "abrir_regiao", args: { folha, area } }` pela ponte, com a mensagem pronta para o painel. |
| `plugin/src/canonico.ts` | JSON canônico (chaves em ordem), para saber se um arquivo mudou no disco e para comparar blocos no autoteste. |
| `plugin/src/folhasLocais.ts` | Prévia local das folhas (`CONEXOES.md`, seção 4): uma EditableImage por metade, ids falsos `local://<folha>/<metade>` e `conteudo(id)`, que converte qualquer id em `Content` para `ImageContent`. |
| `plugin/src/ferramentas/index.ts` | A lista `FERRAMENTAS` (`{ id, nome, descricao, icone, widget, montar }`), na ordem dos botões. Fica em `ferramentas/index.ts`, e não em `ferramentas.ts`, porque o Rojo não aceita arquivo e pasta com o mesmo nome. |
| `plugin/src/ferramentas/<id>.tsx` | Uma ferramenta por arquivo: o painel (componente Vide), `WIDGET` (título e tamanho) e `montar(gui, plugin)`. **Mapas**, **Catálogo**, **Assets**, **Conexão**, **Servidor**, **Problemas** e **Suporte**. `emConstrucao.tsx` é o painel provisório para uma ferramenta nova. |
| `plugin/src/widget.ts` | `prepararFerramentas`: pede à casca o widget e o botão de cada ferramenta, liga o botão ao widget e monta o painel na primeira vez que o widget fica à vista. `mostrar`, `alternar`, `montada`, `desmontar`, `widgetVisivel` (os laços dos painéis param quando o widget está fechado), `ferramentasAbertas`. |
| `plugin/src/ponte.ts` | Cliente da ponte: uma função tipada por rota, devolvendo `Resultado<T>` (`{ ok, valor }` ou `{ ok, erro, status? }`), nunca lançando erro. Os tipos do bloco (`Bloco`, `Saida`, `Chegada`), `lerAssets` (o registro e o mapa chave → `rbxassetid://`), `lerImagem` (qualquer PNG de `assets/` e `diorama/folhas/`), `lerIdsGraal`. As fontes `ponteLigada` e `erroPonte` moram aqui (e `estado.ts` as reexporta) para não haver ciclo entre os dois módulos. |
| `plugin/src/estado.ts` | Fontes do Vide compartilhadas entre as ferramentas (status da ponte, lista de mapas, mapa aberto, imagens das folhas) e as leituras que mais de uma ferramenta faz: `recarregarMapas()`, `carregarImagensFolhas()` (com os ids de reserva de `assets/registro.json`). |
| `plugin/src/versao.ts` | A versão do plugin, mostrada na Conexão. |
| `plugin/src/plugin.d.ts` | Traz os globais de plugin (`plugin`, `settings()`) dos tipos do roblox-ts. |
| `plugin/src/ui/kit.tsx` | As peças de interface no tema do Studio, todas com `ordem` (LayoutOrder): caixas (`Painel`, `Coluna`, `Linha`, `Fileira`, `Bloco`, `Preenche`, `Espaco`, `Lista`), textos (`Rotulo`, `Titulo`, `TextoCurto`, `Etiqueta`, `Aviso`, `Separador`), controles (`Botao`, `Interruptor`, `Alternar`, `Ciclo`, `Escolha`, `Marcas`, `Abas`), campos (`Campo`, `CampoMulti`, `CaixaTexto`, `AreaTexto`, `LinhaCampo`) e `cor(...)` para qualquer cor do guia de estilo, reativa ao tema. |
| `plugin/src/ui/extras.tsx` | O que só o editor de mapas usa: `Legenda` (rótulo de largura fixa), `Quadro`, `ListaSelecao`, `Amostra`. |
| `plugin/src/ui/folhaVista.tsx`, `recorte.tsx` | A folha inteira do Aeko rolável com zoom, grade, zonas e destaques (Catálogo); um recorte de uma folha pelas duas metades (miniaturas). |
| `plugin/src/ui/alternarFolhas.tsx` | O interruptor "Folhas locais", o mesmo em Mapas, Catálogo e Conexão. |
| `plugin/src/ui/copiar.ts` | `copiarTexto`: tenta `setclipboard` por pcall; sem ela, os painéis mostram o texto para Ctrl+C. |
| `plugin/src/mapas/` | O editor do bloco: `bloco.ts` (o modelo de 64 × 64 células, `deJson`/`paraJson` no formato do gerador, os seis terrenos, os marcadores), `canvas.tsx` (o canvas com pools de ImageLabel), `pinceis.ts`, `historico.ts` (desfazer/refazer), `paleta.tsx` (os tiles), `pecas.tsx` (as peças do catálogo), `regras.ts` (o catálogo lido de `pecas.json`/`fundos.json` e as regras de fundo 12.14 e encaixe 12.12, cópia de `src/shared/decor.ts`), `marcadores.tsx` (nascimento, entradas, saídas, zonas, moradores), `zonas.ts` (cópia das zonas do jogo), `controle.ts` (o editor visto de fora: o painel registra `abrir(id)` e o resumo do bloco aberto, que o canal e o autoteste usam). |
| `plugin/src/catalogo/` | `formato.ts` (o formato de `pecas.json`, `fundos.json` e `zonas.json` como o gerador os lê: leitura defensiva, gravação com os campos não editados preservados, as células em texto), `folhas.ts` (as metades das folhas no Roblox), `problemas.ts` (os problemas do rodapé do Catálogo). |
| `plugin/src/assets/` | `registro.ts` (o `assets/registro.json` como lista, e o recorte sugerido para cada entrada), `enviar.ts` (EditableImage + `CreateAssetAsync`, experimental). |
| `plugin/src/servidor/` | `execucao.ts` (modo do Studio, Run/Pause/Stop, jogadores), `atributos.ts` (os atributos de desenvolvimento do Workspace), `place.ts` (a conferência do place), `output.ts` (o filtro vivo do Output), `teleporte.ts` (o teleporte pendente entre as sessões). |
| `plugin/src/problemas/` | O diagnóstico: `diagnostico.ts` (junta tudo), `mapas.ts`, `catalogo.ts`, `assets.ts`, `visual.ts` (o visual dos moradores; os ids vêm de `GET /graal/ids`, com a cópia de reserva), `zonas.ts`, `tipos.ts`. |
| `plugin/teste/ciclos.mjs` | Os ciclos de identidade no Node: transpila `formato.ts`, `bloco.ts` e `zonas.ts` com o `typescript` da raiz e um simulacro dos globais do roblox-ts, grava o catálogo e os 14 blocos pelo código do plugin (os blocos pela `gravarBloco` da ponte) e confere que `--decorar` e `diorama:jogo -- <mapa>` não mudam nada em `src/`. Restaura os arquivos no fim (`--manter` deixa, `--catalogo`, `--blocos`, `--mapa <id>` escolhem). |
| `plugin/out/`, `plugin/include/` | Saída do roblox-ts; fora do git. |

## Como acrescentar uma ferramenta

1. Crie `plugin/src/ferramentas/<id>.tsx` com o painel e a função `abrir`:

   ```tsx
   import Vide, { mount } from "@rbxts/vide";
   import { Coluna, Painel, Titulo } from "../ui/kit";
   import type { OpcoesWidget } from "../widget";

   export const DESCRICAO = "O que a ferramenta faz (vira a dica do botão).";

   export function PainelExemplo() {
   	return (
   		<Painel>
   			<Coluna>
   				<Titulo texto="Exemplo" />
   			</Coluna>
   		</Painel>
   	);
   }

   export const WIDGET: OpcoesWidget = { titulo: "Exemplo", largura: 480, altura: 360 };

   export function montar(gui: DockWidgetPluginGui) {
   	return mount(() => <PainelExemplo />, gui);
   }
   ```

2. Acrescente a entrada em `FERRAMENTAS`, em `plugin/src/ferramentas/index.ts`.
3. `npm run plugin:compile` com a ponte no ar (o Studio troca o pacote sozinho). O botão novo aparece na barra na troca; a casca cria botões novos sem reiniciar.

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

- **Rascunhos**: um mapa com mudança não salva vira rascunho nas configurações do plugin (`Diorama_mapas_rascunhos`, um por mapa) quando o painel desmonta (recarga do pacote, Studio fechando) ou o widget de Mapas fecha (com aviso no Output). Ao abrir de novo, a coluna esquerda mostra "Mudanças não salvas de …" com **Recuperar** e **Descartar**. Salvar o mapa, ou descartar as mudanças dele (abrir outro com o segundo clique), apaga o rascunho.
- **Conflito com o disco**: Salvar (Mapas, e "Salvar peças"/"Salvar fundos" no Catálogo) relê o arquivo antes e compara com o que foi aberto; se outro programa, o MCP ou outro Studio gravou nesse meio-tempo, recusa e diz; o segundo clique sobrescreve. Uma mudança feita enquanto a ponte gravava deixa o mapa (ou o catálogo) sujo, com "Houve mudanças enquanto salvava: salve de novo".
- **Recarregar** no Catálogo com mudança não salva pede um segundo clique.
- **Lembrar**: o último mapa, a ferramenta, a camada, o zoom e a aba da direita (`Diorama_mapas_lembrar`); o painel reabre o mapa sozinho, a não ser que haja rascunho dele esperando.
- **Pincel**: arrastar um carimbo maior que 1 × 1 repete o padrão alinhado ao começo do traço (antes, carimbava de novo a cada célula, deslocado); o mouse rápido não deixa buracos (as células entre duas leituras entram em linha). Desfazer cancela um posicionamento de marcador pendente.
- **Paleta**: o campo "ir para" aceita `34,25`, `casa 40,25` ou `40,25,3,3` (seleciona e rola até lá); **Abrir no Aseprite** abre a seleção num sprite do Aseprite (pela ponte; lá, "Salvar região na folha" grava de volta). O Catálogo tem o mesmo botão para a peça selecionada.
- **Folha salva no Aseprite**: quando a ponte avisa (`recarregar_folhas`), Mapas e Catálogo dizem qual folha e quando; com "Folhas locais" desligado, o aviso traz **Ver folhas locais**.
- **Filtros ao vivo**: o filtro de peças (Mapas, aba Peças) e o do Catálogo respondem a cada letra, sem Enter.
- **Atalhos à vista**: os botões mostram B, R, G, E, I, 1–4, Ctrl+S, Ctrl+Z e Ctrl+Y.
- **Canvas mais leve**: o vazio pintado no chão ([folha, 0, 2], uma cor só) vira uma faixa por sequência numa linha, esticando o miolo de 8 × 8 do tile (o truque do jogo para tiles de uma cor). `casa_teste_v2_l` aberta: 5574 → 3886 instâncias no widget; abrir leva uns 20–80 ms de ponte e 50 ms de montagem.
- **Output do Servidor**: o buffer não é mais copiado a cada mensagem, e o texto da aba é refeito em lote (no máximo a cada 0,25 s) e só com a aba e o widget à vista.

## Canal do Studio e autoteste

Com a ponte e o Studio abertos, o plugin aceita comandos pela ponte (`docs/diorama/CONEXOES.md`, seção 2; rotas em `docs/diorama/PONTE.md`). Pelo terminal:

```
curl -s http://127.0.0.1:34873/studio/presenca                       # os Studios conectados (sessao, place, modo)
curl -s -X POST http://127.0.0.1:34873/studio/comandos -H "Content-Type: application/json" \
     -d '{"tipo":"autoteste","sessao":"<sessao>"}'                     # → { "id": "c3" }
curl -s "http://127.0.0.1:34873/studio/respostas/c3?espera=50"
```

Com mais de um Studio aberto, mande sempre a `sessao` (sem ela, vai para o mais recente na edição). `executar_luau` só roda com "Permitir executar Luau" ligado no painel Conexão (desligado por padrão).

O **autoteste** (`{ "tipo": "autoteste", "args": { "ferramentas"?: [...], "espera"?: 2, "remontar"?: true, "edicao"?: false } }`) abre o widget de cada ferramenta (e o fecha de novo, se estava fechado), espera um quadro, conta as instâncias, espera as leituras da ponte e junta os erros e avisos que o Output recebeu nesse tempo. Conferências de cada uma:

- **Mapas**: abre `teste_d_destino` e `casa_teste_v2_l` pelo editor e confere, por camada, as células desenhadas no canvas contra as do bloco e de onde vem a imagem dos tiles (id do Roblox ou EditableImage); salva o bloco aberto como `zz_autoteste`, reabre no editor, compara o JSON, apaga o mapa e volta ao original; monta a folha da casa em EditableImage e lê um pixel de volta. Com mudança não salva no editor, pula os mapas.
- **Mapas, edição** (`autotesteEdicao.ts`; `"edicao": false` pula): num mapa novo `zz_autoteste_edicao`, pincel numa célula, traço rápido sem buracos, carimbo 2 × 2 arrastado, desfazer/refazer, borracha por camada, peça com regras recusada sobre o vazio e peça livre carimbada, nascimento, saída com destino e chegada, desfazer que cancela o posicionamento, salvar, pintar durante o salvamento (fica sujo), conflito com o disco (recusa e depois sobrescreve), rascunho ao desmontar e montar o painel, mapa apagado no disco; apaga o mapa no fim e volta ao que estava aberto.
- **Catálogo**: lê `pecas.json` e `fundos.json`, conta, roda os problemas do catálogo e confere que a folha está à vista; na edição, cria uma peça e confere que "Recarregar" pede o segundo clique e então descarta (não grava nada em `diorama/catalogo`).
- **Assets**: o registro e quantos estão sem id. **Problemas**: o diagnóstico inteiro. **Servidor**: os atributos de teste, a conferência do place e (edição) gravar e limpar `AcoesTeste` e `HoraTeste`, voltando ao que estava. **Suporte**: a lista de documentos e o `ESPECIFICACAO.md` inteiro e rolável. **Conexão**: `GET /status`.
- Sem `ferramentas`, devolve também `studio`: as conferências dos itens 20 a 27 de `DUVIDAS.md`.

Para testar uma mudança: `npm run plugin:compile`, esperar o Output mostrar o pacote novo e mandar o autoteste com `"remontar": true`.

Comandos de diagnóstico (2026-10-20), para testar sem clicar:

- `inspecionar { ferramenta?, profundidade? }`: os widgets (aberto, montado, instâncias), `pacotes_na_casca` (deve haver uma pasta só), `ao_parar` (o que o `parar` vai desfazer), os ouvintes do Output, as folhas locais carregadas, a memória Lua e a do Studio, o resumo do mapa aberto (com `tempos` da última abertura) e, com `ferramenta`, a árvore do widget com o número de descendentes de cada nó (os maiores primeiro).
- `simular { ferramenta, acao, args? }`: chama a ação do painel como o clique chamaria (abre o widget antes). `acao: "acoes"` lista as de cada ferramenta. **Mapas**: `estado`, `aba`, `ferramenta {f}`, `camada {n}`, `terreno {codigo}`, `tile {folha, c, l, w?, h?}`, `pressionar/arrastar/soltar {x, y}`, `traco {x, y, por?: [[x, y], …]}`, `desfazer`, `refazer`, `pecas`, `peca {id, forma?}`, `marcador {acao: nascimento | nova_entrada | nova_saida | nova_zona | novo_morador | aplicar_entrada | aplicar_saida | aba | lista, …}`, `novo {id}`, `clicar_mapa {id}`, `salvar {pintar_durante?: [x, y]}`, `testar`, `parar_teste`, `aseprite`, `guardar_rascunho`, `reler_rascunhos`, `recuperar_rascunho`, `descartar_rascunho`, `esquecer_rascunho {mapa}`. **Catálogo**: `estado`, `criar_peca {folha?, c, l, w, h}`, `selecionar {id}`, `apagar_peca`, `recarregar`, `salvar_pecas`, `salvar_fundos`. **Servidor**: `aba {id}`, `output {contem?}`. **Problemas**: `rodar`. **Suporte**: `abrir {nome}`.
- `ciclar_widget { ferramenta, vezes?, desmontar? }`: abre e fecha o widget (e desmonta o painel a cada volta, como numa recarga) e devolve as instâncias e a memória Lua antes e depois.

Medido em 2026-10-20 no Studio de teste: abrir e fechar Mapas, Catálogo, Servidor e Assets 8 vezes com desmontagem deixa as mesmas instâncias e a memória Lua oscilando sem crescer; 5 recargas do pacote deixam uma pasta `Pacote_*` só e `ao_parar` igual. A conexão de cada atributo de teste ao Workspace (`fonteAtributo`) não saía na recarga e ficava viva presa ao pacote velho; agora sai pelo `aoParar`.
