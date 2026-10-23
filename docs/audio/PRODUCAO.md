# Produção dos sons no Ableton (2026-10-20)

Pedido do usuário: fazer no Ableton todos os sons possíveis para o jogo e, para o portfólio dele, peças inspiradas nas trilhas e aberturas de Bleach, One Piece, Naruto e Dragon Ball. Base: `ESTUDO_PACOTES_ABLETON.md`.

## Como funciona

1. **Partituras** em JSON (formato abaixo): uma por música ou por som. Compor é separado de montar.
2. **Montagem** (`tools/som/ableton_montar.py`): fala direto com o Remote Script do AbletonMCP (socket `127.0.0.1:9877`, um JSON por pedido), cria as trilhas por **papel** (instrumento), carrega o preset de cada papel (`tools/som/instrumentos.json`), escreve cada peça num clipe e a coloca no **Arrangement**, uma depois da outra, com 4 compassos de silêncio entre elas e um **locator** no começo de cada uma (`<chave> | <bpm> BPM | <duração s>`).
3. **Andamento**: o Live tem um tempo só e o MCP não muda o tempo por trecho. O set fica em **120 BPM** e cada peça é escrita no andamento dela, convertida: um tempo da peça a `T` BPM vale `120 / T` tempos do set. A peça soa no andamento certo.
4. **Exportar**: o MCP não exporta áudio. O usuário exporta o Arrangement inteiro uma vez (Ctrl+Shift+R, WAV 48 kHz 24 bits, do começo ao fim) e `tools/som/cortar.py <export.wav>` corta um arquivo por peça pelos locators gravados em `tools/som/mapa_do_set.json` (WAV + OGG Vorbis), já nos nomes do registro (`assets/sons/<chave>.ogg`) ou do portfólio.
5. Nada é enviado ao Roblox (usa a conta do usuário).

## Formato da partitura

```jsonc
{
  "chave": "musica.titulo",            // jogo: a chave do registro; portfólio: "portfolio.<franquia>.<nome>"
  "titulo": "Vila ao amanhecer",
  "bpm": 92,
  "compasso": [4, 4],
  "tom": "Ré maior",
  "compassos": 32,                     // duração total; o fim tem de fechar o laço quando "laco": true
  "laco": true,                        // música em laço (o fim emenda no começo sem estalo)
  "cauda_s": 2.0,                      // segundos depois do fim para o reverb morrer (som sem laço)
  "trilhas": [
    {
      "papel": "piano",                // um papel da lista abaixo
      "notas": [[60, 0.0, 1.0, 90], [64, 1.0, 0.5, 80]]   // [altura MIDI, início em tempos da peça, duração em tempos, velocidade 1–127]
    }
  ],
  "observacoes": "intenção, estrutura, o que ouvir"
}
```

Sons curtos (efeitos, interface) usam o mesmo formato; um **kit** de interface é uma partitura só, com cada som num trecho, e a lista dos trechos em `"trechos": [{"nome": "click", "inicio_s": 0.0, "fim_s": 0.25}, …]` (o jogo recorta pelo `region`).

## Papéis (vocabulário fixo; a montagem liga cada um a um preset do Live)

Teclas e cordas dedilhadas: `piano`, `piano_suave`, `celesta`, `caixinha_de_musica`, `harpa`, `violao`, `guitarra_limpa`, `guitarra_distorcida`, `baixo_eletrico`, `koto` (corda japonesa dedilhada, modelo físico).
Orquestra: `cordas_legato`, `cordas_staccato`, `cordas_pizzicato`, `violoncelo`, `contrabaixo`, `metais`, `trompa`, `trompete`, `trombone`, `flauta`, `flautim`, `oboe`, `clarinete`, `fagote`, `shakuhachi` (flauta soprosa).
Percussão afinada: `glockenspiel`, `marimba`, `vibrafone`, `xilofone`, `sinos_tubulares`, `crotales`.
Bateria e percussão (mapa GM: 35/36 bumbo, 37 aro, 38/40 caixa, 39 palma, 42 chimbal fechado, 44 pedal, 46 aberto, 49/57 prato de ataque, 51/59 condução, 52 china, 41/43/45/47/48/50 tons, 54 pandeirola, 56 cowbell): `bateria_rock`, `bateria_leve`, `percussao_latina`, `taiko` (tambores graves japoneses; notas 36–48), `percussao_orquestral` (tímpanos 36–53, bumbo de orquestra, pratos).
Sintetizadores: `pad`, `pad_quente`, `lead`, `baixo_synth`, `chip_quadrada`, `chip_triangulo`, `chip_ruido`, `arpejo`.
Efeitos (patches de síntese para sons do jogo): `sfx_madeira`, `sfx_metal`, `sfx_ruido` (vento, sopro, chiado: notas longas), `sfx_ruido_curto` (rajadas curtas: asas, terra, folhas, água), `sfx_fogo`, `sfx_bolha`, `sfx_click` (interface), `sfx_sino` (interface), `sfx_grave` (impacto), `sfx_ferramenta` (o metal das ferramentas).
Vozes (2026-10-23, os animais): `voz_grave` e `voz_nasal` (vozes sintetizadas com portamento: notas ligadas deslizam), `assobio` (pios).

## Regras de composição

- **Originais.** As peças do portfólio são **inspiradas no estilo** (instrumentação, andamento, harmonia, forma, energia) das trilhas citadas; nenhuma melodia, progressão marcante, letra ou trecho reconhecível das obras originais. Títulos próprios. No portfólio, apresentar como "inspirado em", nunca como cover ou trilha oficial.
- **Licença dos packs** (EULA, seção 5(3)): compor com os instrumentos é o uso normal; nunca deixar um sample sozinho, do jeito que veio, como o som inteiro. Efeitos do jogo saem de síntese ou de camadas transformadas.
- Velocidade varia (nada de tudo em 100); dinâmica e respiração; voicings que caibam no instrumento; nada fora da extensão do instrumento.

## Montagem (2026-10-20)

Ferramentas em `tools/som/` (Python 3.12 com numpy, scipy e soundfile: `%LOCALAPPDATA%\Programs\Python\Python312\python.exe -I`):

| Arquivo | O que faz |
|---|---|
| `ableton.py` | Cliente do socket do AbletonMCP (`127.0.0.1:9877`): manda o pedido, lê até o JSON fechar, reconecta se cair. Também `criar_locator` e `apagar_locator` (ver Limitações). `python -I tools/som/ableton.py get_session_info` serve para conferir à mão. |
| `instrumentos.json` | Papel → camadas → preset (uri e caminho no navegador), efeitos com parâmetros, ganho, tradução de notas dos kits. |
| `ableton_montar.py` | Partituras → trilhas, clipes no Arrangement, locators e `mapa_do_set.json`. |
| `gravar.py` | Grava o Arrangement pela saída do próprio Live (Resampling), em tempo real, sem o diálogo de exportar; usa os comandos `hv_*` de `remote_script/gravacao.py`. Ver **Gravar** abaixo. |
| `cortar.py` | Export do Arrangement → um WAV e um OGG por peça. |
| `testes/` | `teste_piano.json` (90 BPM, em laço), `teste_bateria.json` (140 BPM) e `teste_cortar.py` (WAV sintético). |

### Como rodar

1. Live aberto com o AbletonMCP como Control Surface. Montar (continua de onde o mapa parou; peça cuja chave já está no mapa é pulada): `python -I tools/som/ableton_montar.py assets/musica/partituras/a.json b.json …`. `--seco` mostra o que faria sem tocar no Live; `--offset N` começa no compasso N do set; `--teste` marca as peças como teste; `--limpar` esquece as peças não-teste do mapa (para depois de apagá-las à mão no Live).
2. No Live: File > Export Audio/Video, Rendered Track = Main, **do começo do Arrangement (1.1.1) até depois do último locator**, WAV, 48 kHz, 24 bits. Se o export começar em outro ponto, passar `--inicio-export <segundo do set>` ao cortador.
3. `python -I tools/som/cortar.py <export.wav> --saida-portfolio <pasta>`: `musica.*` e `som.*` vão para `assets/sons/<chave>.ogg` (o WAV vai para `assets/sons/wav/`, fora do git); `portfolio.*` vão para a pasta do portfólio (WAV e OGG). Os trechos dos kits e o ganho aplicado ficam em `tools/som/cortes.json`. Peças de teste só com `--incluir-testes --saida-testes <pasta>`.
4. `python -I tools/som/testes/teste_cortar.py` confere o cortador sem o Live.

### Como a montagem lê a partitura

- **Tempo** = semínima, como no Live: um compasso de 6/8 tem 3 tempos, um de 3/4 também. `bpm` é em semínimas por minuto.
- O set fica em 120 BPM e 4/4; cada peça é escrita com as durações multiplicadas por `120 / bpm`. A peça começa sempre num compasso do set; depois dela vêm a `cauda_s` e mais 4 compassos de silêncio. Se a última nota passa do fim (`compassos`), a peça vai até ela e o montador avisa.
- **Laço** (`"laco": true`): o clipe vai **duas vezes seguidas** e o corte pega a segunda volta, que já começa com a cauda do reverb da primeira; o fim desemboca no começo. O cortador ainda mede o salto entre a última e a primeira amostra e, se passar de 4 vezes o passo normal entre amostras, cruza os últimos 20 ms com o áudio de logo antes do começo (a duração não muda). Laço não leva fade; o resto leva 5 ms nas pontas. O pico vai a −1 dBFS só por ganho.
- Cada papel vira uma trilha MIDI com o nome do papel (ou `papel:camada`), criada na primeira vez e reaproveitada pelo nome. A cadeia é instrumento > efeitos > EQ Eight, cujo `Output Gain` é o ganho relativo do papel (os valores são **palpite**, a acertar de ouvido: não há comando para o volume da trilha nem para os envios, por isso o reverb vai na própria trilha).
- Nota que a tabela de um kit não tem é **descartada**, e o montador avisa (`descartadas` no mapa).

### Papéis e presets escolhidos

Conferidos em 2026-10-20: cada preset carregou numa trilha de teste e o device apareceu com o nome certo; os 9 efeitos também. Nenhum tem arpejador ou acorde; os racks orquestrais e de guitarra têm `MidiNoteLength`/`MidiPitcher` (soltura, articulação) e os kits do Session Drums têm `MidiRandom` (alternância de amostras), que fazem parte do instrumento.

| Papel | Preset (pack) | Efeitos | Ganho (dB) |
|---|---|---|---|
| piano / piano_suave | Grand Piano Equal Solo / Equal Mellow Solo (Grand Piano) | Reverb Wooden Room | 0 |
| celesta | Celeste (Core, uma amostra) | Medium Concert | −2 |
| caixinha_de_musica | Music Box (Core) | Wooden Room | −2 |
| harpa | Harp Concert (Core) | Medium Concert | 0 |
| violao | Nylon Basic Guitar (Tension, modelo físico) | Wooden Room | 0 |
| guitarra_limpa / guitarra_distorcida | Guitar / Guitar-Dual Amped Heavy (Guitar and Bass) | Wooden Room / nenhum | −2 / −4 |
| baixo_eletrico | Electric Bass (Guitar and Bass) | Glue "Bass - Punch" | −1 |
| koto | Koto (Tension) | Medium Concert | 0 |
| cordas_legato / _staccato / _pizzicato | Strings Ensemble Legato / Staccato / Pizzicato (Orchestral Strings) | Medium Concert | −2 / −2 / 0 |
| violoncelo / contrabaixo | Cello Solo Legato / Double Bass Section Legato | Medium Concert | 0 |
| metais / trompa / trompete / trombone | Brass Ensemble Legato / French Horn Solo Legato / Trumpet Solo Legato / Trombone Section Legato (Orchestral Brass) | Medium Concert | −3 / −1 / −2 / −2 |
| flauta / flautim / oboe / clarinete / fagote | Concert Flute, Piccolo, Oboe e Bb Clarinet Solo Legato Vibrato; Bassoon Solo Legato (Orchestral Woodwinds) | Medium Concert | 0 (flautim −3) |
| shakuhachi | **Indian Flute** (Core; flauta indiana amostrada) | Concert Hall | 0 |
| glockenspiel, marimba, vibrafone, xilofone, sinos_tubulares, crotales | os do Orchestral Mallets | Medium Concert (sinos: Concert Hall) | −3, 0, −1, −2, −3, −4 |
| bateria_rock | Kit-BigPunchy (Session Drums Club) | Glue "Drum - Gentle Two Buss", Drums Room | −2 |
| bateria_leve | Kit-BrushSizzle (vassourinha, Session Drums Club) | Wooden Room | −2 |
| percussao_latina | 5 camadas: Latin Pop (congas, bongôs), Timbales A, Bells & Triangle, Wood A (Latin Percussion), Percussion Core Kit (Core) | Wooden Room | −2 a −4 |
| taiko | **surdo** (Surdo Cuica Whistle Snap, Latin Percussion) + tímpano na mesma nota, −6 dB | Saturator "A Bit Warmer", Concert Hall | 0 |
| percussao_orquestral | Timpani (Orchestral Mallets) + surdo (bumbo) + Cymbals (Latin Percussion) + Bells & Triangle | Medium Concert | 0 a −6 |
| pad / pad_quente | Analog Soft Pad (Wavetable) / Warm Analog Pad (Drift) | Medium Concert | −6 |
| lead / baixo_synth | Sweet Lead (Analog + Operator) / Basic Analog Bass (Analog) | Wooden Room / nenhum | −5 / −4 |
| chip_quadrada | **Game Console** (Drift) | Redux "Chiptune Filter" | −8 |
| chip_triangulo | **Triangle Waveforms** (Operator) | Redux "Chiptune Filter" | −4 |
| chip_ruido | **Noise Hit Attack** (Operator; o ruído não muda com a nota) | Redux "Low Sample Rate" | −8 |
| arpejo | FM Basic Pluck (Operator), sem arpejador: as notas vêm da partitura | Wooden Room | −5 |
| sfx_madeira / sfx_click / sfx_grave | Wood Perc 1 / Pitch Stick / Thump (Designer Drums, feitos em Operator; nota 60 = afinação original, **palpite**) | Wooden Room (grave: + Saturator) | 0 / −2 / 0 |
| sfx_metal / sfx_sino | Metallic Hit / Bells Tinkle Toy (Operator) | Wooden Room / Medium Concert | −4 |
| sfx_ruido | Wind Machine (Operator): nota longa; a altura move o filtro | nenhum | −6 |
| sfx_fogo | S&H Filtered Noise (Operator) | Saturator "A Bit Warmer" | −6 |
| sfx_bolha | Water Pluck (Wavetable) | Wooden Room | −4 |
| sfx_ruido_curto (2026-10-23) | Wind Machine (Operator), com o release das quatro fontes em 0,55 e o filtro abrindo na hora (`Fe Attack` 0) | nenhum | +4 |
| sfx_ferramenta (2026-10-23) | Gardening Fork 2 (Sound Objects Lite, Simpler; sempre em camada) | Wooden Room | −4 |
| voz_grave (2026-10-23) | Portamento Male (Operator), `Pe On` 0, `Glide Time` 0,64, `Ae Attack` 0,05, `Ae Peak` 1 | Wooden Room | −4 |
| voz_nasal (2026-10-23) | Portamento Female Nasal (Operator), `Pe On` 0, `Glide Time` 0,62, `Ae Attack` 0,05, `Ae Peak` 1 | Wooden Room | −4 |
| assobio (2026-10-23) | Whistler Winds (Operator; o envelope de altura dá a subidinha do pio) | Wooden Room | −6 |

Os parâmetros do próprio instrumento ficam em `parametros_instrumento` da camada (`instrumentos.json`), ajustados quando a trilha é criada (2026-10-23).

**Notas dos kits** (lidas do `ReceivingNote` de cada pad nos `.adg`; nota fora da tabela é descartada):

- `bateria_rock` e `bateria_leve`: GM traduzido para os kits do Session Drums. Não há palma: 39 vira aro (37). 52 china, 53 cúpula, 55 splash, 56 cowbell, 57 e 59 vão para os pads equivalentes do kit. No rock, 48 e 50 viram o tom de 10" (o kit tem 4 tons) e 54 é a pandeirola do kit; na vassourinha, 54 não existe. 58 não existe em nenhum dos dois.
- `percussao_latina` (GM): 60/61 bongô agudo/grave, 62/63/64 conga abafada/aberta/tumba, 65/66 timbal agudo/grave, 56 cowbell, 67/68 agogô, 69 cabasa, 70 e 82 shaker, 71/72 apito, 73/74 guiro (vira cabasa curta: não há guiro nesses kits), 75 claves, 76/77 wood block, 54 pandeirola, 58 vibraslap, 80/81 triângulo, 84 sinos de dedo.
- `taiko` (36–48): 36–40 surdo aberto, 41–44 surdo abafado, 45–47 surdo de dedo, 48 aro do surdo; todas tocam também um tímpano na própria altura, mais baixo, para dar corpo.
- `percussao_orquestral`: 35 bumbo, **36–53 tímpanos na própria altura**, e os pratos fora do GM, porque 49/51/52 caem nos tímpanos: **55 prato suspenso, 57 pratos a dois, 58 gongo, 80/81 triângulo abafado/aberto**.

**O que não existe nos packs instalados e o que entrou no lugar**: koto só por modelo físico (Tension `Koto`; há também `FM Koto` no Operator). Shakuhachi não há: `Indian Flute` (alternativa: `Alto Flute Solo Legato`). Taiko não há: surdo com tímpano por baixo. Chiptune não há: Drift e Operator com Redux. Bumbo de orquestra não há: surdo aberto. Trombone solo não há (só naipe e trombone baixo solo). Os `sfx_*` são todos síntese (Operator, Wavetable, Designer Drums em Operator), nenhum sample sozinho.

### Gravar (`gravar.py`)

`python -I tools/som/gravar.py --inicio <tempo antes da 1ª peça> --faders 0.5 [--fim T] [--copiar-para arq.wav]`, depois `python -I tools/som/cortar.py <arq.wav> --inicio-export <o que o gravar disse> --cauda-auto --passa-altas 40 --trechos-limpos --so <chaves>`.

- **`--faders 0.5`**: a gravação é PCM de 24 bits; trilha nova nasce em 0,85 e as faixas cheias clipam (o cortador acusa). O valor vale para todas as trilhas do set.
- **Isca do braço** (2026-10-23): o Live arma a trilha MIDI em que um instrumento é carregado pelo navegador, e o montador deixa armada a última trilha que montou; a gravação gravava um clipe MIDI vazio por cima dos clipes dela. O `gravar.py` cria antes uma trilha `zz_isca` com um instrumento (o braço vai para ela), depois a de gravação, confere que nenhuma outra está armada e apaga as duas no fim. O `gravacao.py` também passou a selecionar a trilha de gravação (vale quando o Live reler o Remote Script).
- A gravação começa uns 2 a 3 tempos antes do pedido (o `posicionar` para um compasso antes): deixar 2 compassos vazios antes da primeira peça (`--offset 3` no montador num set limpo). Com `--inicio` abaixo de 4 a janela de espera ficava vazia (corrigido).
- O arquivo sai na taxa do Live (44,1 kHz neste PC); o cortador converte para 48 kHz.
- **`--passa-altas 40`** (2026-10-23): o Thump (`sfx_grave`, com Saturator) e o Wind Machine deixam grave abaixo de 40 Hz e um pouco de DC; nos efeitos baixinhos o ganho de normalização (+20 a +33 dB) os trazia para -20 dB. Filtra o export inteiro, com fase zero, antes de cortar.
- **`--trechos-limpos`** (2026-10-23): nos kits, cada trecho vai até o som cair 40 dB abaixo do pico dele (no máximo 30 ms antes do seguinte), com um fade de até 60 ms, e o vão vira silêncio. Os fins novos vão para `cortes.json` e são os do `region` em `shared/sounds.ts` (os da partitura são só a intenção).
- Para refazer uma peça: `hv_delete_arrangement_clip` em cada trilha dela (no início de cada volta), `Ableton.apagar_locator`, tirar a peça do mapa e montar de novo (vai para o fim do set); gravar só o trecho novo.

### Leva de 2026-10-23 (animais, fazenda, ambiente, vila): o que se aprendeu

- **Set limpo**: o set do portfólio foi fechado; o mapa dele está em `tools/som/mapa_do_set.portfolio.json` e o `mapa_do_set.json` de hoje é o da leva (começa no compasso 3).
- **Portamento do Operator** (medido na gravação, sem ouvir): `Glide Time` 0,55 desliza em menos de 30 ms; 0,68 levou uns 0,3 s; 0,9, uns 3 s por oitava. Só desliza com as notas ligadas (sobrepostas); notas soltas retomam o ataque, e é assim que o cacarejo e o balido pulsam. As vozes "Portamento" sobem uns 10 dB nos primeiros 0,4 s (o `Ae Peak` 0,62 cresce até o sustain): `Ae Peak` 1 tira isso. O Drift (`Legato On`, `Glide Time`) também desliza; o Meld "Don't Laugh" é mono legato de fábrica.
- **Wind Machine (`sfx_ruido`) é de uma voz e segura uns segundos**: nota nova rouba a anterior e reabre o filtro devagar (`Fe Attack` 0,784), e cada nota curta vira um sopro longo. Uma cama de notas longas que se cruzam fazia um "fuuu" a cada nota nova, e nos kits a cauda de um trecho entrava no seguinte. Por isso o `sfx_ruido_curto` (o mesmo patch, release curto e filtro aberto na hora) e, para camas (rio, folhas, zumbido da máquina), rajadas curtas sorteadas uma atrás da outra (`_textura` em `compor/fazenda.py`). O `som.vento` antigo ainda usa notas longas: ouvir se o "fuuu" aparece.
- **O que conferir de ouvido**: só a forma de onda foi medida (ataque, altura, níveis, emendas, espectrograma). O timbre dos bichos é o ponto mais incerto.

### Limitações do AbletonMCP 1.7.1 (descobertas na montagem)

- Não há comando para **apagar clipe do Arrangement**, apagar trilha ou device, mudar volume ou envio da trilha, nem exportar áudio (os `hv_*` do `remote_script/gravacao.py` cobrem apagar clipe e trilha, volume, mudo e gravar; device e braço continuam sem comando). Por isso as duas peças de teste continuam no set (de 0 a 38 s, marcadas `"teste": true` no mapa; a primeira peça de verdade começa no tempo 96 do set, compasso 25) e há uma trilha `zz_teste_carga (apagar)` com os devices do teste de carga, que pode ser apagada à mão.
- `create_locator` muda a cabeça de leitura e cria o locator no mesmo tique, mas a cabeça só anda no tique seguinte: o locator caía onde a cabeça estava. `Ableton.criar_locator` move a cabeça num pedido antes. O mesmo atraso permite **apagar** um locator (`Ableton.apagar_locator`).
- `get_browser_categories` e `get_browser_items` estão no despacho, mas a função não existe no script; usar `get_browser_tree` e `get_browser_items_at_path`.
- Carregar um instrumento numa trilha que já tem um **troca** o instrumento; efeitos entram no fim da cadeia.
- Os `uri` com `FileId` dependem do banco do navegador; se o Live refizer o banco, o montador procura o preset pelo `caminho`.
- Pôr um clipe no Arrangement por cima de outro na mesma trilha substitui o de baixo (visto ao rodar o teste duas vezes).
- O libsndfile 1.2.2 estoura a pilha ao gravar Vorbis de uma vez no Windows; o `cortar.py` grava em blocos.
