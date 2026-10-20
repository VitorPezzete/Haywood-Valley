# Plugin Diorama

Editor de mapas e ferramentas de desenvolvimento do Haywood Valley dentro do Roblox Studio. É um projeto roblox-ts separado do jogo (sem Flamework), com interface em Vide, que compila para `%LOCALAPPDATA%\Roblox\Plugins\Diorama.rbxm`. Ele fala com o disco do repositório pela **ponte** (`tools/diorama_ponte.mjs`), um servidor HTTP local. A arquitetura inteira está em `docs/diorama/ARQUITETURA.md`; as rotas da ponte, em `docs/diorama/PONTE.md`; o formato dos blocos e do catálogo (o do gerador, que o plugin lê e grava), em `docs/diorama/GERADOR.md`.

## Compilar e instalar

Tudo pela raiz do repositório (precisa do Node e do Rojo do Aftman no PATH, como `npm run serve`):

```
npm run plugin:build     # compila plugin/src → plugin/out e gera %LOCALAPPDATA%\Roblox\Plugins\Diorama.rbxm
npm run plugin:compile   # só o roblox-ts (plugin/out), sem o .rbxm
npm run plugin:watch     # roblox-ts recompilando a cada mudança; depois, rode plugin:build para gerar o .rbxm
node node_modules/typescript/bin/tsc --noEmit -p plugin/tsconfig.json   # só os tipos (erros dentro de node_modules/@rbxts são do pacote)
node plugin/teste/ciclos.mjs                                            # os ciclos de identidade (abaixo), sem o Studio
```

O Studio lê a pasta `Plugins` ao abrir. Depois de um `plugin:build` com o Studio aberto, use **Plugins › Plugins Folder** ou, mais rápido, salve o `.rbxm` de novo e o Studio recarrega o plugin sozinho (o `Unloading` fecha os widgets antigos). Se a barra "Diorama" não aparecer, olhe o Output: o plugin imprime `[Diorama] plugin carregado com N ferramentas`. A versão está em `plugin/src/versao.ts` e na ferramenta Conexão.

Na primeira chamada à ponte o Studio pergunta se o plugin pode acessar `127.0.0.1`; aceite.

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
| `plugin/src/index.server.ts` | Entrada. Cria a barra "Diorama" com um botão por ferramenta; na edição, liga o filtro do Output e aplica o teleporte pendente. |
| `plugin/src/ferramentas/index.ts` | A lista `FERRAMENTAS` (`{ id, nome, descricao, icone, abrir }`), na ordem dos botões. Fica em `ferramentas/index.ts`, e não em `ferramentas.ts`, porque o Rojo não aceita arquivo e pasta com o mesmo nome. |
| `plugin/src/ferramentas/<id>.tsx` | Uma ferramenta por arquivo: o painel (componente Vide) e `abrir(plugin)`. **Mapas**, **Catálogo**, **Assets**, **Conexão**, **Servidor**, **Problemas** e **Suporte**. `emConstrucao.tsx` é o painel provisório para uma ferramenta nova. |
| `plugin/src/widget.ts` | `abrirWidget(plugin, opcoes, montar)`: cria o `DockWidgetPluginGui` da ferramenta na primeira vez, alterna `Enabled` nas seguintes e guarda o tamanho em `plugin:SetSetting`. `widgetVisivel(id)` diz se o widget está à vista (os laços dos painéis param quando não está). |
| `plugin/src/ponte.ts` | Cliente da ponte: uma função tipada por rota, devolvendo `Resultado<T>` (`{ ok, valor }` ou `{ ok, erro, status? }`), nunca lançando erro. Os tipos do bloco (`Bloco`, `Saida`, `Chegada`), `lerAssets` (o registro e o mapa chave → `rbxassetid://`), `lerImagem` (qualquer PNG de `assets/` e `diorama/folhas/`), `lerIdsGraal`. As fontes `ponteLigada` e `erroPonte` moram aqui (e `estado.ts` as reexporta) para não haver ciclo entre os dois módulos. |
| `plugin/src/estado.ts` | Fontes do Vide compartilhadas entre as ferramentas (status da ponte, lista de mapas, mapa aberto, imagens das folhas) e as leituras que mais de uma ferramenta faz: `recarregarMapas()`, `carregarImagensFolhas()` (com os ids de reserva de `assets/registro.json`). |
| `plugin/src/versao.ts` | A versão do plugin, mostrada na Conexão. |
| `plugin/src/plugin.d.ts` | Traz os globais de plugin (`plugin`, `settings()`) dos tipos do roblox-ts. |
| `plugin/src/ui/kit.tsx` | As peças de interface no tema do Studio, todas com `ordem` (LayoutOrder): caixas (`Painel`, `Coluna`, `Linha`, `Fileira`, `Bloco`, `Preenche`, `Espaco`, `Lista`), textos (`Rotulo`, `Titulo`, `TextoCurto`, `Etiqueta`, `Aviso`, `Separador`), controles (`Botao`, `Interruptor`, `Alternar`, `Ciclo`, `Escolha`, `Marcas`, `Abas`), campos (`Campo`, `CampoMulti`, `CaixaTexto`, `AreaTexto`, `LinhaCampo`) e `cor(...)` para qualquer cor do guia de estilo, reativa ao tema. |
| `plugin/src/ui/extras.tsx` | O que só o editor de mapas usa: `Legenda` (rótulo de largura fixa), `Quadro`, `ListaSelecao`, `Amostra`. |
| `plugin/src/ui/folhaVista.tsx`, `recorte.tsx` | A folha inteira do Aeko rolável com zoom, grade, zonas e destaques (Catálogo); um recorte de uma folha pelas duas metades (miniaturas). |
| `plugin/src/ui/copiar.ts` | `copiarTexto`: tenta `setclipboard` por pcall; sem ela, os painéis mostram o texto para Ctrl+C. |
| `plugin/src/mapas/` | O editor do bloco: `bloco.ts` (o modelo de 64 × 64 células, `deJson`/`paraJson` no formato do gerador, os seis terrenos, os marcadores), `canvas.tsx` (o canvas com pools de ImageLabel), `pinceis.ts`, `historico.ts` (desfazer/refazer), `paleta.tsx` (os tiles), `pecas.tsx` (as peças do catálogo), `regras.ts` (o catálogo lido de `pecas.json`/`fundos.json` e as regras de fundo 12.14 e encaixe 12.12, cópia de `src/shared/decor.ts`), `marcadores.tsx` (nascimento, entradas, saídas, zonas, moradores), `zonas.ts` (cópia das zonas do jogo). |
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
   import { abrirWidget } from "../widget";

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

   export function abrir(plugin: Plugin) {
   	return abrirWidget(plugin, { id: "exemplo", titulo: "Exemplo", largura: 480, altura: 360 }, (gui) =>
   		mount(() => <PainelExemplo />, gui),
   	);
   }
   ```

2. Acrescente a entrada em `FERRAMENTAS`, em `plugin/src/ferramentas/index.ts`.
3. `npm run plugin:build`.

## Regras e armadilhas

- As funções de `ponte.ts` yieldam (`HttpService:RequestAsync`). Chame-as dentro de `task.spawn`, de um clique ou de outro evento; nunca de dentro de um `effect` do Vide.
- Vale o mesmo que no jogo: não criar elementos com propriedades reativas de dentro de uma função usada como filho. Use `For`, `Show` ou crie tudo de uma vez e alterne `Visible`.
- O roblox-ts recusa `local` (e as demais palavras reservadas do Luau) como nome de variável, e um método estático com o mesmo nome de um campo da instância (`ModeloBloco.novo`, não `vazio`). O `tsc` não acusa; só o `rbxtsc`.
- Dois módulos não podem se importar um ao outro (o `TS.import` do runtime acusa ciclo): `ponte.ts` não importa `estado.ts`.
- Os tipos do `@rbxts/types` não trazem `PluginGui.Title`, `PluginToolbarButton.ClickableWhenViewportHidden` nem `RunService.Stop`; `widget.ts`, `index.server.ts` e `servidor/execucao.ts` fazem um cast.
- O `JSONEncode` do Roblox manda `[]` para toda tabela vazia (`props: {}` vira `[]`); a ponte desfaz nos blocos. Ao gravar outro JSON, pense nisso.
- Para pixels, `lerFolha` e `lerImagem` em `ponte.ts` devolvem um `buffer` RGBA pronto para `EditableImage:WritePixelsBuffer`.
- O MCP do Studio e o Rojo não são usados pelo plugin; o plugin só fala com a ponte (e a ponte faz o ping no Rojo).
- O que não dá para conferir sem o Studio (coordenadas do mouse em DockWidget, UIFlexItem, atalhos, `CreateAssetAsync`) está em `docs/diorama/DUVIDAS.md`, itens 20 a 28.
