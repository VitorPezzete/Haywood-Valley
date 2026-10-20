# Plugin Diorama

Editor de mapas e ferramentas de desenvolvimento do Haywood Valley dentro do Roblox Studio. É um projeto roblox-ts separado do jogo (sem Flamework), com interface em Vide, que compila para `%LOCALAPPDATA%\Roblox\Plugins\Diorama.rbxm`. Ele fala com o disco do repositório pela **ponte** (`tools/diorama_ponte.mjs`), um servidor HTTP local. A arquitetura inteira está em `docs/diorama/ARQUITETURA.md`; as rotas da ponte, em `docs/diorama/PONTE.md`.

## Compilar e instalar

Tudo pela raiz do repositório (precisa do Node e do Rojo do Aftman no PATH, como `npm run serve`):

```
npm run plugin:build     # compila plugin/src → plugin/out e gera %LOCALAPPDATA%\Roblox\Plugins\Diorama.rbxm
npm run plugin:compile   # só o roblox-ts (plugin/out), sem o .rbxm
npm run plugin:watch     # roblox-ts recompilando a cada mudança; depois, rode plugin:build para gerar o .rbxm
```

O Studio lê a pasta `Plugins` ao abrir. Depois de um `plugin:build` com o Studio aberto, use **Plugins › Plugins Folder** ou, mais rápido, salve o `.rbxm` de novo e o Studio recarrega o plugin sozinho (o `Unloading` fecha os widgets antigos). Se a barra "Diorama" não aparecer, olhe o Output: o plugin imprime `[Diorama] plugin carregado com N ferramentas`.

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
| `plugin/src/index.server.ts` | Entrada. O roblox-ts exige o nome `index.server.ts` e emite `init.server.luau`. Cria a barra "Diorama" com um botão por ferramenta. |
| `plugin/src/ferramentas/index.ts` | A lista `FERRAMENTAS` (`{ id, nome, descricao, icone, abrir }`), na ordem dos botões. Fica em `ferramentas/index.ts`, e não em `ferramentas.ts`, porque o Rojo não aceita arquivo e pasta com o mesmo nome. |
| `plugin/src/ferramentas/<id>.tsx` | Uma ferramenta por arquivo: o painel (componente Vide) e `abrir(plugin)`. **Conexão** e **Suporte** funcionam; Mapas, Catálogo, Assets, Servidor e Problemas mostram o painel de `emConstrucao.tsx`. |
| `plugin/src/widget.ts` | `abrirWidget(plugin, opcoes, montar)`: cria o `DockWidgetPluginGui` da ferramenta na primeira vez, alterna `Enabled` nas seguintes e guarda o tamanho em `plugin:SetSetting`. A posição e o encaixe o Studio guarda sozinho pelo id do widget. |
| `plugin/src/ponte.ts` | Cliente da ponte: uma função tipada por rota, devolvendo `Resultado<T>` (`{ ok, valor }` ou `{ ok, erro }`), nunca lançando erro. Atualiza `ponteLigada` e `erroPonte`. |
| `plugin/src/estado.ts` | Fontes do Vide compartilhadas entre as ferramentas (ponte ligada, último status, mapa e bloco abertos). |
| `plugin/src/ui/kit.tsx` | Peças de interface no tema do Studio: `Painel`, `Coluna`, `Linha`, `Rotulo`, `Titulo`, `Separador`, `Botao`, `Campo`, `Lista`, `Abas`, `AreaTexto`, e `cor(...)` para qualquer cor do guia de estilo, reativa ao tema. |
| `plugin/src/plugin.d.ts` | Traz os globais de plugin (`plugin`, `settings()`) dos tipos do roblox-ts. |
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

Para preencher uma das ferramentas "em construção", troque o painel no arquivo dela e deixe `abrir` como está.

## Regras e armadilhas

- As funções de `ponte.ts` yieldam (`HttpService:RequestAsync`). Chame-as dentro de `task.spawn`, de um clique ou de outro evento; nunca de dentro de um `effect` do Vide.
- Vale o mesmo que no jogo: não criar elementos com propriedades reativas de dentro de uma função usada como filho. Use `For`, `Show` ou crie tudo de uma vez e alterne `Visible`.
- Os tipos do `@rbxts/types` não trazem `PluginGui.Title` nem `PluginToolbarButton.ClickableWhenViewportHidden`; `widget.ts` e `index.server.ts` fazem um cast.
- Para pixels das folhas, `lerFolha` em `ponte.ts` devolve um `buffer` RGBA pronto para `EditableImage:WritePixelsBuffer`.
- O MCP do Studio e o Rojo não são usados pelo plugin; o plugin só fala com a ponte (e a ponte faz o ping no Rojo).
