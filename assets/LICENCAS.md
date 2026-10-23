# Licenças dos assets (2026-10-20)

O repositório é público. O que é de terceiros só entra com licença que cubra uso comercial fora do jogo de origem
(regra do CLAUDE.md), e o texto da licença fica guardado junto do pacote. Os textos guardados se perderam na
formatação; esta página registra o que se sabe e o que é **palpite** para o usuário decidir.

## Cozy People Asset Pack (shubibubi)

Licença comercial comprada em 2026-10-10: pode modificar, **não pode redistribuir** o pacote. Por isso ficam fora
do repositório (sem `arquivo` em `assets/registro.json`; as cópias recuperadas estão em
`Documents\Haywood-Valley-recuperado\artes\`):

- `antiga.cozy_walk_1` a `_7`: as folhas do boneco do Cozy, usadas até o boneco do Graal entrar. Não entram.
- `boneco.rostos` (`cozy_faces.png`): os olhos, bocas e efeitos são desenho nosso (`tools/cozy_faces.py`, perdido), mas
  os 15 emoticons de balão vêm do pacote. **Palpite:** fora do repositório até separar os emoticons; o jogo ainda usa o
  id (reações e balões).
- `ui.chat` (`chat_bubble.png`): "o corpo e o rabinho dos balões de emoticon do Cozy People" (`client/world/chatBalloon.ts`).
  **Dúvida:** pode ser redesenho no estilo, e não cópia; fica fora até o usuário confirmar.

## Contribuidores do Graal (`graal.aeko.*`, `graal.original.*`, `contribuidores/`)

As 840 cabeças e 107 corpos de 35 contribuidores da comunidade do Graal (alexxx, aly, arne, bea, bear, buichi, cae,
caua, chan, daisy, dj, dubz, ena, enigma, erick, frank, gong, jen, jhonny, kuroi, lee, nima, nuckzz, pooka,
qwertzilla, raskit, remix, roy, seraphim, sully, tal, trisha, wally, zael, zar, zara, zeus). O jogo credita os autores
(`Graal.authors` em `src/shared/graal.ts`), e a regra do CLAUDE.md é pacote a pacote: entra o que a página do pacote
libera por escrito para qualquer projeto e que é desenho do próprio autor; não entra o que é edição dos sprites-base do
Graal nem o que só diz "grátis". Os links e os textos de cada pacote se perderam com o PC.

As peças foram aceitas uma a uma antes da formatação, então o critério foi aplicado; sem os textos não dá para provar.
**Decisão do usuário em 2026-10-23:** `contribuidores/` (as peças desempacotadas e as 144 folhas montadas) entra no
repositório público, que foi ao `main` no mesmo dia. Se algum texto de licença for recuperado, guardá-lo em
`contribuidores/pecas/<autor>/`.

## Tiles do Aeko (`aeko.*`, `exterior.folha_juncao`, `mar.infinito.*`, `acoes.*`)

As folhas da casa e do castelo (`diorama/folhas/`), a folha da junção e as peças derivadas delas (o mar fundo, os
cacos do pote, as peças carregáveis recortadas) são tiles do Aeko, também da comunidade do Graal. Mesma dúvida de
licença que os contribuidores. **Palpite:** ficam no repositório, porque o Diorama e o jogo (interiores) dependem delas
e `diorama/` é versionado (docs/diorama/ARQUITETURA.md); se o usuário preferir, basta acrescentar `diorama/folhas/` e as
pastas de `assets/` ao `.gitignore`, que o registro continua apontando para elas.

## Arte própria

Tudo o mais em `assets/` (mundo, interface, título, luz, fonte) é desenhado por script nosso (`draw_*.lua`, `tools/*.py`
da pasta Aseprite) ou à mão; `exterior.forma_equipe_32` é desenho da equipe (**palpite**).

## Sons

`som.*` e `musica.*` só têm id. Os de 10 dígitos (9112831284 etc.) são da biblioteca de áudio do Roblox; o
`som.mar_longe` (78025480791776) foi enviado pelo usuário. Os projetos do Ableton se perderam.
