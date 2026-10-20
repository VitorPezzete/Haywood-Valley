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
