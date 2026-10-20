# Diorama: dúvidas para o usuário (2026-10-20)

O que a reconstrução não conseguiu tirar do código. Responder aqui ou corrigir direto em `ESPECIFICACAO.md` e `ARQUITETURA.md`.

## Respostas do usuário (2026-10-20)

- **1 a 13**: não lembra. Os palpites ficam como estão até haver motivo para mudar.
- **14**: depois da F vinha a **G: arrumar as folhas e os recortes**. Exemplo dado: o sofá veio da folha com a parte do fundo e do chão junto; a G separa a peça do fundo e permite **recolorir o sofá sem perder a textura**, "entre outros" (ver `ROTEIRO.md`).
- **15**: o `mapa_folhas.json` não tem cópia.
- **16**: não lembra; adivinhar ou refazer a folha de junção.
- **17**: sim, os baús grandes do castelo abrem no lugar.
- **18**: sim. A folha `acoes.carregaveis` já estava enviada (id 93474418849511 no registro), nada a fazer.
- **19**: os sons e músicas sem id se perderam; serão refeitos (ver `docs/audio/ESTUDO_PACOTES_ABLETON.md`).
- Pedido junto: o plugin se atualiza sozinho e as conexões vão além da ponte: Claude, Studio e Aseprite ligados, com um MCP para o Claude e um plugin para o Aseprite (`CONEXOES.md`).

## Formato do bloco (não mudei `ARQUITETURA.md`)

1. **Mar raso no exterior**: o jogo distingue mar fundo (`~`, nada) de mar raso (`6`, os pés na água) em `actions` (`exterior_ilha`), mas o bloco de `ARQUITETURA.md` só tem o código `m` para mar. O raso era pintado (outro código) ou derivado da distância à terra?
2. **Camada de frente sobre o boneco**: `InteriorLayers` diz que "a frente é desenhada por cima do boneco que passa atrás", mas `buildInterior` põe as três camadas no mesmo `SurfaceGui`, embaixo do boneco. A frente deveria cobrir o boneco (como no Graal) e isso ficou para depois, ou o comentário está errado?
3. **`sem_pecas` bloqueia?** Nenhum mapa de hoje usa a zona. `ARQUITETURA.md` deixou como palpite.
4. **Tipo 5 (coberta da cama)** só aparece em `actions` pelo catálogo do Decorar (a cama posta); a zona `deita` das folhas dá só o tipo 4. Como o Diorama marcava o 5 nas camas pintadas no mapa (`moradores_jogo` tem Lia deitada)? Pela região do catálogo com `ação: 5`?
5. **Carimbo (hash)**: algoritmo e o que entra (as camadas só, ou tudo). Precisa ser o mesmo para os 14 `stamp` baterem.
6. **Bloqueios à mão** (`bloqueios.mais/menos`): existiam, ou o bloqueio era só derivado?
7. **Vários blocos por mapa**: o jogo só recebe `0_0`. O plugin tinha blocos vizinhos (o mapa de 64 × 64 por bloco da página do Notion)?
8. **Nome de zona**: `Sala` e `Quarto grande` são texto livre, `zone.island` é chave traduzida. O plugin oferecia as chaves ou o autor escrevia à mão?
8a. **Primeira linha dos módulos**: os 14 módulos e `index.ts` têm hoje o comentário "Reconstruído em 2026-10-20…" na linha do `import`. O gerador novo reproduz essa linha (para bater byte a byte) ou ela sai dos módulos antes da comparação?

## Numeração da especificação

9. Confirmar os números escolhidos: 12.1 folhas, 12.2 camadas, 12.4 zonas, 12.5 catálogo, 12.6 pincéis, 12.7 exterior, 12.8 bloqueios e ações, 12.10 nascimento, 12.11 desfazer, 12.13 paredes, 12.15 peças e fixos, 12.16 luzes, 12.18 salvar e carimbo, 12.19 testar. Só 12.3, 12.9, 12.12, 12.14, 12.17 e 12.20 são certos.
10. O que `detectar.ts` e `paredes.ts` faziam além do que `decor.ts` copiou (detectar cômodos? pintar paredes inteiras?).
11. A palavra "carimbo" é usada para a ferramenta (12.14) e para o hash (`stamp`). Era assim no original?

## Roteiro

12. O conteúdo das etapas A a D e dos itens 1 a 16 da etapa E.
13. E1: "os mapas no mundo" (título em `interiorChoice.ts`) ou "peças que se empurram e carregam" (meu palpite inicial)? Ligações/zonas e exterior eram de que etapa?
14. O que vinha depois de F no roteiro original (moradores vivos, visita, inventário: ordem?).

## Catálogo e folhas

15. `mapa_folhas.json` do guia do Aeko se perdeu: as regiões voltam só do que o jogo lista (12.5) ou há outra fonte?
16. A linha 41 da `folha_juncao` é caminho ou areia? E as linhas 8–11 (decalques animados de 16 px) e 44/46 (decalques de 32 px)?
17. Os baús grandes do castelo ficam fora do abrir no lugar ("a confirmar" em `fixtures.ts`).

## Pendências do jogo citadas no código

18. Enviar a folha `acoes.carregaveis` (peça derivada, sem aval).
19. Os ids que faltam no registro (o jogo avisa `[Som]`, `[Luz]`, `[Água]`, `[Pecas]` em tempo de jogo): conferir `assets/registro.json` depois de `npm run assets -- --importar`.

## Plugin: o que não deu para conferir sem o Studio (2026-10-20)

O plugin compila (`npm run plugin:build`) e a lógica pura passa nos ciclos de `plugin/teste/ciclos.mjs`, mas estes pontos só se conferem com o Studio aberto:

20. **Coordenadas do mouse num DockWidgetPluginGui**: a folha do Catálogo (`ui/folhaVista.tsx`) e a paleta do editor (`mapas/paleta.tsx`) tiram a célula sob o mouse de `MouseMoved`/`InputChanged` menos o `AbsolutePosition` do elemento. Num widget flutuante, os dois podem estar em espaços diferentes (o plugin gui tem a própria origem); se a célula sair deslocada, trocar por `gui:GetRelativeMousePosition()` ou pelo `InputObject.Position` relativo ao `AbsolutePosition` do widget.
21. **UIFlexItem em modo Fill** dentro de um `UIListLayout` vertical (`Preenche` no kit, as listas do Catálogo e do Servidor): precisa de uma versão do Studio com flex layouts; se o elemento não esticar, voltar ao tamanho em offset.
22. **Atalhos de teclado** do editor de Mapas (`UserInputService.InputBegan` filtrado por `WindowFocused` do widget): conferir se o widget recebe foco ao clicar e se Ctrl+S/Ctrl+Z não disparam também os do Studio.
23. **`AssetService:CreateAssetAsync`** (envio de imagem pelo Studio, `assets/enviar.ts`): a assinatura e os resultados (`Enum.CreateAssetResult`) foram tirados da documentação; o Studio pode pedir permissão na primeira chamada e a API é marcada como experimental. O envio usa a conta logada e só roda depois da confirmação no painel.
24. **`EditableImage` e `Content.fromObject`** para a prévia da imagem preparada: dependem de o place permitir imagens editáveis.
25. **`setclipboard`** (`ui/copiar.ts`) não existe no Studio; o botão de copiar caminhos cai na área de texto selecionável.
26. **`RunService.Stop()`** de dentro de um plugin para parar a sessão de teste (`ferramentas/mapas.tsx`, `servidor/execucao.ts`): pode exigir permissão de plugin.
27. **`JSONEncode` e tabelas vazias**: o Roblox manda `[]` para `props: {}`; a ponte desfaz. Se outra tabela vazia aparecer no bloco (por exemplo `bloqueios: {}`), conferir se o gerador a aceita.
28. **Gerador com bloco sem `nascimento`**: o plugin avisa, mas salva; `tools/diorama_lib/gerar.mjs` lê `bloco.nascimento[0]` sem conferir e falha com um erro pouco claro. Decidir se o gerador assume `[0, 0]` com aviso (o jogo cai em [0, 0]) ou se a ponte recusa o bloco.

### Conferido no Studio de teste (2026-10-20)

O plugin rodou num Studio de teste (place local `teste_plugin.rbxl`) com a casca nova e o autoteste do canal (`plugin/README.md`, "Canal do Studio e autoteste"); as sete ferramentas montam sem erro no Output e passam nas conferências.

- **20**: conferido em 2026-10-20 só em parte: o DockWidgetPluginGui tem `GetRelativeMousePosition`, mas o deslocamento da célula sob o mouse só se confere com o mouse de verdade (o MCP do Studio não move o mouse dentro de widgets). Continua aberto.
- **21**: conferido em 2026-10-20: os `UIFlexItem` esticam (o `Preenche` do Servidor ficou com 430 px num widget de 496, o do Problemas com 350, a lista do Catálogo com 285 num de 665).
- **22**: não conferido (precisa de teclado de verdade no widget).
- **23**: conferido em 2026-10-20 só que `AssetService.CreateAssetAsync` existe nesta versão do Studio; o envio não foi feito (usa a conta do usuário).
- **24**: conferido em 2026-10-20: o place local permite `EditableImage`; as duas metades de 1024×512 da casa montam (1 048 576 pixels), o pixel lido de volta bate com o do disco, e `ImageContent = Content.fromObject(imagem)` funciona no canvas de Mapas (as "Folhas locais" usam isso). Um place publicado pode exigir a permissão de APIs de imagem editável; aí a prévia cai no id do Roblox com aviso.
- **25**: conferido em 2026-10-20: `setclipboard` não existe no Studio; o plugin mostra o texto para Ctrl+C, como previsto.
- **26**: conferido em 2026-10-20 só que `RunService.Stop` existe para o plugin; não foi chamado durante um Play.
- **27**: conferido em 2026-10-20: `JSONEncode({ props = {}, lista = {} })` dá `{"lista":[],"props":[]}`. O gerador aceita `bloqueios: []` (lê `bloco.bloqueios?.mais`, que fica `undefined`), e a ida e volta de `casa_teste_v2_l` pelo editor e pela ponte não muda o JSON.
- **28**: não é do Studio e continua aberto (decisão do gerador).
- Achado novo: `plugin:SetSetting` com `.` na chave não dá erro e não guarda nada; as chaves do plugin passaram a ser `Diorama_…`. O teleporte pendente do Servidor (`diorama.servidor.teleportePendente`) nunca tinha funcionado por isso.
- Achado novo: na sessão do cliente do Play o Studio recusa HTTP ao plugin ("Http requests can only be executed by game server"); lá vale o pacote embutido e o canal não liga.
