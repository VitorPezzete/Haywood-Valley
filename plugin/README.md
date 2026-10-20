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

## Canal do Studio e autoteste

Com a ponte e o Studio abertos, o plugin aceita comandos pela ponte (`docs/diorama/CONEXOES.md`, seção 2; rotas em `docs/diorama/PONTE.md`). Pelo terminal:

```
curl -s http://127.0.0.1:34873/studio/presenca                       # os Studios conectados (sessao, place, modo)
curl -s -X POST http://127.0.0.1:34873/studio/comandos -H "Content-Type: application/json" \
     -d '{"tipo":"autoteste","sessao":"<sessao>"}'                     # → { "id": "c3" }
curl -s "http://127.0.0.1:34873/studio/respostas/c3?espera=50"
```

Com mais de um Studio aberto, mande sempre a `sessao` (sem ela, vai para o mais recente na edição). `executar_luau` só roda com "Permitir executar Luau" ligado no painel Conexão (desligado por padrão).

O **autoteste** (`{ "tipo": "autoteste", "args": { "ferramentas"?: [...], "espera"?: 2, "remontar"?: true } }`) abre o widget de cada ferramenta (e o fecha de novo, se estava fechado), espera um quadro, conta as instâncias, espera as leituras da ponte e junta os erros e avisos que o Output recebeu nesse tempo. Conferências de cada uma:

- **Mapas**: abre `teste_d_destino` e `casa_teste_v2_l` pelo editor e confere, por camada, as células desenhadas no canvas contra as do bloco e de onde vem a imagem dos tiles (id do Roblox ou EditableImage); salva o bloco aberto como `zz_autoteste`, reabre no editor, compara o JSON, apaga o mapa e volta ao original; monta a folha da casa em EditableImage e lê um pixel de volta. Com mudança não salva no editor, pula os mapas.
- **Catálogo**: lê `pecas.json` e `fundos.json`, conta, roda os problemas do catálogo e confere que a folha está à vista.
- **Assets**: o registro e quantos estão sem id. **Problemas**: o diagnóstico inteiro. **Servidor**: os atributos de teste e a conferência do place. **Suporte**: a lista de documentos. **Conexão**: `GET /status`.
- Sem `ferramentas`, devolve também `studio`: as conferências dos itens 20 a 27 de `DUVIDAS.md`.

Para testar uma mudança: `npm run plugin:compile`, esperar o Output mostrar o pacote novo e mandar o autoteste com `"remontar": true`.
