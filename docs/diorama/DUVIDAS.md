# Diorama: dúvidas para o usuário (2026-10-20)

O que a reconstrução não conseguiu tirar do código. Responder aqui ou corrigir direto em `ESPECIFICACAO.md` e `ARQUITETURA.md`.

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
