# Haywood Valley

Jogo de fazenda em pixel art no Roblox, visto de cima em 3/4. Núcleo de Hay Day (produção em tempo real), com camadas de Stardew Valley (estações, moradores, mina, pesca, casa) e Moonstone Island (ilhas, alquimia). O usuário escreve em português.

O jogo se chamava Haystack Valley até 2026-10-09. O place do Studio e a logo que está no ar ainda usam o nome antigo. As iniciais continuam HV, então `hv_paint.lua` e `hv_trees.lua` não mudam.

## Onde está cada coisa

- **Planos e decisões**: Notion, página "Haywood Valley" (https://app.notion.com/p/3f338d12f8c3815380b6d46b8e15043a), pelo MCP `notion`. Ler "Decisões" e "Visão do jogo" antes de propor arquitetura; elas valem sobre os planos antigos. Decisão nova do usuário vai para "Decisões" com a data.
- **Tarefas e assets**: bancos "Tarefas" e "Assets" na mesma página. Atualizar o status ao terminar algo.
- **Código**: este repositório.
- **Arte**: `C:\Users\Szortek\Documents\Aseprite`, gerada por scripts Lua (`draw_*.lua`, motor `hv_paint.lua`), pelo MCP `aseprite` (servidor em `Aseprite\aseprite-mcp`, ambiente criado com `uv sync`).
- **Música**: Ableton Live 12 Suite, pelo MCP `ableton` (servidor em `Documents\MCP\ableton-mcp`, telemetria desligada no `.mcp.json`). O Live só atende se o Remote Script `AbletonMCP` estiver escolhido como Control Surface nas preferências.
- **Studio**: place "Haystack Valley" (o nome antigo, até o usuário renomear no painel do Roblox), pelo MCP `Roblox_Studio`. O Studio só recebe código pelo Rojo; não editar scripts lá.

## Stack

- roblox-ts 3.0, com Flamework (serviços e controllers), Charm e charm-sync (estado), Vide (interface).
- `typescript` fixo em 5.5.3, a versão interna do roblox-ts. O transformer do Flamework exige; não atualizar.
- Números do jogo (tempos, preços, tamanhos) moram em `src/shared`. O Notion é rascunho de balanceamento.

## Estrutura

- `src/server/services`: serviços do Flamework (`@Service`).
- `src/client/controllers`: controllers do Flamework (`@Controller`).
- `src/shared`: tipos, configuração e estado compartilhado.

## Arquitetura do mundo

Técnica do jogo Caramel, com a vista do Moonstone Island: mundo 3D com um chão plano, um Part por objeto com `SurfaceGui` e `ImageLabel` (`ResampleMode = Pixelated`), câmera fixa de cima em 3/4 e o personagem do próprio Roblox. A cena é montada no cliente, fora do Vide. Só a interface fica em `ScreenGui`. Interação por `ProximityPrompt`.

Multiplayer: vários jogadores por servidor. A fazenda é de um jogador, salva por jogador e visitável; vila e demais mapas são compartilhados.

Regras que saíram do protótipo (medidas no Studio em 2026-10-08), todas em `src/shared/view.ts` e `src/client/world/`:

- **Escala**: 32 pixels de arte por stud. A célula do chão aparece como um quadrado de 32×32 pixels: tem 1 stud de largura e um pouco mais de fundo, para compensar a inclinação da câmera. O avatar do Roblox é reduzido a 25%. Em 2026-10-09 o usuário decidiu passar para tile de 16 pixels e redesenhar o mundo nessa escala; o código continua em 32 (`CELL_PX`) e a cena de teste usa a arte antiga até o tileset novo existir. A lista de tiles e a proposta de mapa (mundo compartilhado em blocos de 64×64 tiles, lotes de fazenda já marcados) estão na página "Referências, lista de tiles e mapa do mundo" do Notion.
- **Câmera**: olha para o norte (−Z), 70° acima do horizonte, no máximo a 280 studs, com campo de visão de uns 2°. É a vista de cima em 3/4 do Moonstone Island, decidida em 2026-10-09 no lugar da isométrica. Não chega a 90° porque os cartões são ordenados pela distância até a câmera. Todo o resto do mundo deriva de `SCREEN_RIGHT`, `TOWARD_CAMERA` e da inclinação, então mudar a vista é mexer só nesse arquivo. Mais longe que 300 a 400 studs, a qualidade gráfica mínima do Roblox não desenha nada. O zoom é sempre um múltiplo inteiro do pixel de arte; a tela mostra uns 270 pixels de arte de altura (`TARGET_VIEW_HEIGHT`), a mesma medida do palco da interface, então um pixel da interface vale um pixel do mundo.
- **Chão** (`ground.ts`): um Part deitado com um `SurfaceGui` cujo canvas é medido em pixels de arte. Grama, solo arado e sombras são `ImageLabel` nesse canvas, ordenados por `ZIndex`. O `ZOffset` negativo é obrigatório: o Roblox desenha os `SurfaceGui` do mais distante para o mais próximo pelo centro de cada um, e sem ele o chão cobre os objetos do fundo.
- **Objetos em pé** (`card.ts`): um Part fino de frente para a câmera, com a base do sprite no chão. A ordem entre eles vem da distância à câmera, então não criar outro `SurfaceGui` grande e transparente por cima do mundo.
- **Vento** (`wind.ts`): o que balança tem 6 quadros de um ciclo na folha; o cliente troca o quadro a 4 por segundo, com atraso conforme o lugar do objeto, para o vento atravessar o mapa em onda.
- **Objeto na frente do jogador** (`occlusion.ts`): fica 55% transparente enquanto cobre o personagem. Só o que a cena registra: árvores, arbustos e trigo crescido. Pedra e enfeite nunca somem.
- **Colisão** (`collider.ts`): bloqueio invisível no pé do objeto, criado no cliente junto com a cena. Hoje em árvores, arbustos e pedras grandes; plantação e enfeite não bloqueiam.
- **Personagem parado** (`MovementController`): telas que ficam na frente do jogo chamam `hold()` e recebem a função que solta. Este Studio não tem mais o `PlayerModule` em `PlayerScripts`, então não dá para desligar os controles por ele; o controller zera a velocidade a cada quadro.

## Interface

A referência de interface é o Moonstone Island (pedido do usuário em 2026-10-09): mesma disposição e comportamento, com arte nossa. Não recortar pixels de capturas de jogos comerciais.

- **Escala** (`ui/kit.tsx`): tudo é desenhado para 480×270 pixels de arte e ampliado por `k`, inteiro, o maior que cabe na tela. Tamanhos e posições são sempre múltiplos de `k`.
- **Peças** (`ui/art.ts`, folha gerada por `draw_ui.lua`): painéis fatiados em 9 (pergaminho, barro, cartão branco, faixas), células, teclas, botão em pílula, anéis, etiqueta roxa, mãozinha e brilho. `sliced()` e `art()` em `kit.tsx` devolvem as propriedades prontas para um `imagelabel`.
- **Fluxo** (`StartController`, átomo `state/screen.ts`): `loading` → `menu` (título com cena, logo e menu de texto) → `customize` (montar o personagem) → `playing`. O véu preto da personalização abre para revelar o jogo.
- **Cena do título** (`TITLE` e `TITLE_CLOUDS` em `ui/art.ts`): fundo, nuvens que atravessam a tela e, por cima delas, a camada da frente. As duas camadas têm o tamanho do desenho inteiro e são ampliadas até cobrir a tela.
- **Aparência** (`shared/appearance.ts`, `shared/wardrobe.ts`, `AppearanceService`): o visual é um `Look`, um número por escolha (pele, cor dos olhos, formato dos olhos, boca, cabelo e cor, roupa e cor, parte de baixo e cor, sapato, barba, óculos, chapéu, máscara, brinco, blush, batom). O cliente envia o texto de `encodeLook` pelo evento `setLook` (`shared/network.ts`, Flamework Networking); o servidor lê com `parseLook`, que recusa texto grande demais e o que o catálogo não tem, e grava no atributo `Look` do jogador. `wardrobe.ts` é gerado, não editar à mão.
- **Tela de personalizar** (`ui/CustomizeScreen.tsx`): disposição da tela de personagem do Moonstone Island, pedida pelo usuário em 2026-10-10. À esquerda, o cartão "Personagem": a prévia andando no lugar, com as peças em volta (cabelo, roupa e parte de baixo de um lado; anéis de cor do cabelo, dos olhos e da pele do outro), os botões de girar e, embaixo, a seção "Acessórios" com oito peças. À direita, o painel da peça aberta: a grade de opções e, quando a peça tem cores prontas, uma fileira com elas. Cada peça do cartão é uma entrada de `SLOTS`, que aponta para uma `Category` principal e, se houver, uma de cor. As grades de todas as peças são criadas de uma vez e só uma fica visível. O anel "Olhos" abre os formatos de olho, com a fileira das cores embaixo; a peça "Boca" abre as bocas, com a fileira do batom. As miniaturas de olhos, boca e maquiagem mostram só o rosto, ampliado duas vezes. A prévia pisca e sorri por um instante depois de cada troca.
- **Rosto** (`shared/faces.ts`, gerado; `client/world/characterArt.ts`): olhos, bocas e efeitos são peças de 16×16 que cobrem a cabeça e acompanham o sobe e desce dela (`HEAD_BOB`), em vez de blocos com o andar inteiro; assim um rosto novo não precisa ser redesenhado em cada quadro de cada animação. Cada peça tem até quatro camadas: `skin` (cinza tingido com a cor da pele), `iris` (cinza tingido com a cor dos olhos), `ink` (cores fixas) e `fx` (cores fixas, por cima do cabelo e do chapéu). A folha de rostos também traz os balões de 16×16. O usuário pediu rostos no estilo do Graal Online Classic (olho com branco e pupila, boca à vista), em 2026-10-10; a cabeça do pacote tem 12 pixels de largura, então o rosto à vista tem uns 8×3 pixels.
- **Reações do rosto** (`shared/moods.ts`, `MoodController`, `ReactionService`): o jogador não escolhe reação; o usuário recusou o menu em 2026-10-10 e quer que o rosto reaja sozinho, como os estados da cabeça do Graal. Cada cliente faz todo boneco piscar, ficar sonolento e dormir (com balão) depois de 40 e 60 segundos parado. O `MoodController` dispara as demais no boneco do próprio jogador (ao entrar, ao encontrar outro jogador, ao esbarrar num obstáculo, num passeio comprido e pelo que ele escreve no chat) e manda pelo evento `react`; o servidor confere e repassa. Outras partes do jogo chamam `MoodController.feel(mood)` quando algo acontece. Uma situação cujo id de reação não existe na folha simplesmente não muda o rosto.
- **Diálogo** (`DialogueController.say(falas)`, `ui/DialogueBox.tsx`): uma fala por vez, letra a letra; Espaço, Enter, E ou clique avança.

Armadilhas já encontradas:

- O `unmount` do Vide só encerra efeitos: a tela continua em `PlayerGui`. O componente raiz precisa de `cleanup(gui)`.
- O Vide não deixa criar elementos com propriedades reativas de dentro de uma função usada como filho (`{() => lista.map(...)}`): dá "cannot create a new reactive scope inside another reactive scope". Criar tudo de uma vez e alternar com `Visible`, ou usar `Show`.
- `next` é identificador reservado do roblox-ts; o `tsc` aceita e o `rbxtsc` recusa.
- O Roblox usa o Tab para a lista de jogadores; não dá para usar essa tecla na interface.
- **Piso de colisão**: Part invisível criado no servidor (`WorldService`).
- **Personagem**: o avatar do Roblox fica invisível e a 25% do tamanho (`CharacterService`, servidor); serve só para andar, colidir e chegar aos outros clientes. Cada cliente desenha o sprite de todos os jogadores (`CharacterController`): um cartão de 32×32 que segue o personagem, com a direção tirada da velocidade e a posição arredondada para o pixel de arte. A câmera usa o mesmo arredondamento.
- **Camadas do personagem** (`client/world/characterArt.ts`): o boneco vem do Cozy People Asset Pack (shubibubi, licença comercial comprada pelo usuário em 2026-10-10; pode modificar, não pode redistribuir o pacote). `lookLayers(look, pose)` devolve as camadas de baixo para cima: corpo, olhos (íris, pálpebra, tinta), risco da boca, blush, batom, tinta da boca, roupa, parte de baixo, sapato, cabelo, barba, brinco, óculos, máscara, chapéu e o efeito da reação; `pose` troca olhos e boca pelos de uma reação ou da piscada. São até 19 imagens por boneco. Corpo, blush, batom, cabelo e barba são cinza e recebem a cor por `ImageColor3`; por o corpo inteiro ser uma camada só, a cor de pele vale para cabeça, braços e pernas. Roupas e acessórios usam as cores prontas do pacote. Cada peça ocupa um bloco de 256×128 (8 quadros de andar por 4 direções, na ordem frente, costas, direita, esquerda); o quadro 0 é o parado.

## Arte para o mundo

- `draw_world.lua` (pasta Aseprite) pinta a folha de sprites e a grama com o `hv_paint.lua` e imprime, prontas para colar, as linhas de `Sprites` em `src/client/world/sprites.ts`. A referência de estilo para árvores e arbustos é uma árvore do Caramel que o usuário mandou em 2026-10-09: copa em tufos com borda de folhinhas, vãos escuros com galhos, tronco com casca. Ele rejeitou a copa feita de esferas lisas.
- Árvore e arbusto ficam em `hv_trees.lua`, que o `draw_world.lua` carrega (`oak`, `bush` e o número de quadros de vento). Para mudar a árvore, mexer só nesse arquivo e rodar o `draw_world.lua` de novo.
- `draw_title.lua` pinta a ilustração da tela de título em camadas de 480×270 (`title_back.png`, `title_front.png`) e as três nuvens; `tools/title_pack.py` junta as nuvens em `title_clouds.png` e imprime os recortes para `src/client/ui/art.ts`.
- O personagem sai do pacote comprado, em `Character v.2` (pasta Aseprite): `tools/cozy_atlas.py` recorta o andar de cada peça, clareia as camadas em cinza, monta as folhas `character_pack/cozy_walk_N.png` (1024×1024, 32 blocos cada) e grava `src/shared/wardrobe.ts`. Depois de rodar, enviar as folhas que mudaram e atualizar `CHARACTER_ATLASES` em `client/world/characterArt.ts`. O pacote tem ainda carregar, pular, pegar, enxada, regador, machado, picareta, pesca e espada, que o script ainda não empacota. O pacote pinta os olhos (dois traços de 1×2) também no corpo; o script apaga esses pixels, porque o rosto é desenhado por cima.
- Os rostos saem de `tools/cozy_faces.py`, que lê `tools/faces_spec.py` (os desenhos em grades de texto: estilos de olho, bocas, peças de reação, balões e reações) e grava `character_pack/cozy_faces.png` e `src/shared/faces.ts`; com `--previews` grava também folhas de conferência (cada estilo sob os 13 cabelos, no tamanho do jogo, cada reação ao lado do balão) e um relatório de pixels fora do rosto ou escondidos pelo cabelo. Os 15 emoticons de balão vêm do pacote; os demais balões são desenhados na especificação. Depois de rodar, enviar a folha e atualizar `FACE_SHEET` em `client/world/characterArt.ts`. Para um rosto novo, mexer só na especificação.
- Arte de terceiros só entra com licença que cubra uso comercial fora do jogo de origem. Em 2026-10-10 o usuário perguntou dos GFX gratuitos da comunidade do Graal (cabeças, corpos, cabelos, roupas). Vale pacote a pacote: entra o que a página do pacote libera por escrito para uso em qualquer projeto e que é desenho do próprio autor; não entra o que é edição dos sprites-base do Graal nem o que só diz "grátis" sem dizer para quê. Guardar o link e o texto da licença junto do pacote, como foi feito com o Cozy People. `Assets1`, `MoonstoneRef` e `GraalRef` são só referência.
- Antes do pacote o usuário recusou dois bonecos desenhados por script (um de 40×40 recuperado de uma folha gerada por IA, que esteve no jogo, e os rascunhos de 48×48 de 2026-10-09). Para personagem, desenho por script não serviu; `character_ref_sheet.png`, `tools/ref_sheet.py` e `tools/character_layers.py` são dessa fase e não entram mais no jogo.
- `draw_ui.lua` gera a folha da interface e a logo pequena; as linhas que ele imprime vão para `src/client/ui/art.ts`.
- Capturas do jogo rodando ficam em `capturas/`.
- O upload pelo MCP do Studio (`upload_image`) só aceita URL http: servir a pasta com `python -m http.server` em `127.0.0.1` e encerrar depois. Enviar imagem usa a conta do usuário; pedir o aval dele antes.

## Compilar e sincronizar

- `npx rbxtsc` compila `src/` para `out/`. `npm run watch` compila a cada mudança.
- O Rojo envia `out/` ao Studio, só do disco para o Studio. Versão fixa no `aftman.toml`; `npm run serve` sobe o servidor (porta 34872) e o usuário clica em Connect no plugin do Rojo no Studio. Sem o servidor rodando e o plugin conectado, nada chega ao Studio. Conferido em 2026-10-09: alterações e arquivos novos chegam sozinhos em poucos segundos.
- Sintoma "o Studio recebe arquivo novo mas não alteração": é a sessão do Studio travada, não o plugin de sync. Em 2026-10-08 e 09 a função `ScriptEditorService:UpdateSourceAsync`, que Argon e Rojo usam para alterar scripts, ficou pendurada numa sessão aberta há muito tempo e com atualização pendente. Reiniciar o Studio resolveu. Enquanto não reinicia, o contorno é apagar os `.luau` de `out/` (os arquivos, nunca a pasta inteira) e o `tsconfig.tsbuildinfo` e recompilar.
- O place salvo na nuvem ainda tem os scripts da Fase 0 em Luau. Em 2026-10-09 eles foram guardados em `ServerStorage.Fase0Antiga`, onde não rodam (o `Main` antigo desligava o personagem). Se voltarem a aparecer em `ServerScriptService`, `StarterPlayerScripts` ou `ReplicatedStorage` (pastas `Config` e `Remotes`), o place foi reaberto de uma versão anterior.
- Para conferir de ponta a ponta: Play pelo MCP do Studio, ler o Output e tirar uma captura.
- O `npx eslint` não roda: o modelo do Argon traz `.eslintrc` antigo e o ESLint instalado é o 10.
