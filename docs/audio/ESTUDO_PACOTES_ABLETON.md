# Estudo dos pacotes do Ableton Live 12 Suite para o Haywood Valley

Levantamento feito em 2026-10-20 no PC do usuário, só leitura. O inventário bruto está em
`docs/audio/pacotes_ableton.json`, com cada preset, drum rack, demo song e contagem por pasta.

Abreviações de caminho usadas abaixo:

- `CL/` = `C:\ProgramData\Ableton\Live 12 Suite\Resources\Core Library\` (no navegador do Live: Packs > Core Library, e os presets de cada instrumento em Instruments > nome do instrumento).
- `FP/` = `C:\Users\Szortek\Documents\Ableton\Factory Packs\` (no navegador: Packs > nome do pack).

## Resumo

- Versão instalada: **Live 12 Suite 12.2.1** (pasta de preferências `%APPDATA%\Ableton\Live 12.2.1`).
- **26 pastas de pack** em `Factory Packs`, que são **25 packs distintos**: `Designer Drums` e `Designer Drums-1` são o mesmo pack (id `www.ableton.com/32`, rev 29204). A pasta sem sufixo é uma instalação incompleta: faltam nela 111 arquivos (metadados, lições e 104 presets de percussão sintetizada) e não tem nenhum arquivo que a `-1` não tenha. Usar a `Designer Drums-1`.
- **Tamanho dos packs: 41,3 GB** (38,5 GiB). Os maiores: Orchestral Woodwinds (7,5 GB), Session Drums Studio (6,4 GB), Session Drums Club (4,8 GB), Orchestral Strings (4,3 GB), Loopmasters Mixtape (3,6 GB), Orchestral Brass (3,1 GB) e Orchestral Mallets (2,9 GB).
- **Core Library** (a biblioteca básica, vem com o Live): 2,1 GB, 3.508 samples, 90 drum racks, 810 instrument racks, 2.148 presets de device, 350 clips MIDI, 219 grooves, 146 racks de efeito. É a maior fonte útil para o jogo.
- **Builtin** (277 MB): os devices nativos, 438 samples de apoio (modelos de amp, impulsos) e 22 devices Max for Live nativos (Drum Synth, LFO, Shaper, Envelope Follower, Note Echo, Euclidean etc.).
- **Os packs instalados são todos da época do Live 9** (revisões 25156 a 30634). Nenhum dos packs que entraram na Suite a partir do Live 10, 11 e 12 está instalado (por exemplo Granulator III, Upright Piano, Lost and Found, Inspired by Nature; ver Lacunas).
- **User Library**: só pastas vazias e o script `Remote Scripts\AbletonMCP\__init__.py` (o lado do Live do MCP do Ableton). Nenhum preset, sample ou clip do usuário.
- **Live Recordings**: duas pastas `Temp Project` (19 e 20/10) sem nenhum `.als` nem áudio. **Cloud Manager** vazio. **`Documents\Max 9`** vazio (o Max for Live usa o Max embutido em `Resources\Max`). Não sobrou nada dos projetos antigos do jogo.

Pack extra versus biblioteca básica: a Core Library e os devices nativos vêm com qualquer Live 12 Suite. Os 25 packs foram instalados à parte (são conteúdo da Suite 9 e packs Max for Live gratuitos da mesma época).

### Instrumentos e efeitos nativos do Suite que importam

Conferidos em `Resources\Builtin\Devices`:

- Instrumentos: **Operator** (FM), **Wavetable**, **Drift**, **Meld**, **Analog**, **Collision** (percussão física: marimba, glock, caixinha de música), **Tension** (cordas físicas: violão, harpa, banjo, kalimba), **Electric** (piano elétrico), **Sampler**, **Simpler**, **Drum Rack**, **Drum Sampler**, **Drum Synth** (DS Kick, DS Clang, DS FM etc.), **Impulse**.
- Efeitos úteis para o jogo: Reverb, Hybrid Reverb, Echo, Delay, Auto Filter, EQ Eight, Redux (tem o preset `Chiptune Filter`), Roar (preset `Circuit Bent Toy`), Vinyl Distortion, Corpus, Resonators, Spectral Resonator, Spectral Time, Grain Delay, Chorus-Ensemble, Utility, Limiter.
- **Granulator III não está instalado.** O único granulador é o `ml.Granulator` antigo do pack Granulator by Monolake (palpite: é o Granulator da época do Live 9, pode não abrir bem no Max 9; conferir).

## Tabela de todos os packs

Contagens: DR = drum racks; IR = instrument racks (inclui hits de bateria salvos como rack); Pr = presets de device (`.adv`); Sa = samples; Cl = clips; Gr = grooves; Demo = demo songs e kits em `.als`; Li = lições; M4L = devices Max for Live.

| Pack | Autor | Versão | Tamanho | DR | IR | Pr | Sa | Cl | Gr | Demo | Li | M4L | Gênero e clima | Nota | Motivo |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Core Library | Ableton | 4.0 | 2,10 GB | 90 | 810 | 2148 | 3508 | 350 | 219 | 0 | 16 | 0 | tudo um pouco | **5** | Caixinha de música, thumb piano, piano de casa, flautas, foley de madeira, vento e floresta, presets de Tension/Collision/Operator. |
| Orchestral Woodwinds | Ableton | 9.0 | 7,54 GB | 0 | 69 | 0 | 40 | 0 | 0 | 0 | 1 | 0 | orquestral, pastoral | **5** | Flauta, oboé, clarinete e fagote: a voz das trilhas de fazenda. |
| Orchestral Mallets | Ableton | 9.0 | 2,88 GB | 0 | 20 | 0 | 16 | 0 | 0 | 0 | 1 | 0 | orquestral, brilhante | **5** | Glockenspiel, crotales, marimba, vibrafone, xilofone: música e interface do tema Clássico. |
| Orchestral Strings | Ableton | 9.0 | 4,32 GB | 0 | 38 | 0 | 16 | 0 | 0 | 0 | 1 | 0 | orquestral | **4** | Pizzicato e legato para base das faixas da ilha e do título. |
| Latin Percussion | Ableton | 9.0 | 1,02 GB | 23 | 348 | 0 | 345 | 258 | 0 | 0 | 1 | 0 | percussão acústica | **4** | Wood blocks, claves, guiro, caxixi, chimes: interface Celeiro, passos na grama, brilho do tema Clássico. |
| Grand Piano | e-instruments | 9.1 | 1,52 GB | 0 | 23 | 0 | 4 | 0 | 0 | 4 | 1 | 0 | piano | **4** | Piano de cauda com versões suaves (Mellow) para a sala de dia e de noite. |
| Designer Drums (`-1`) | Ableton | 9.0 | 33 MB | 16 | 249 | 0 | 0 | 64 | 0 | 0 | 1 | 0 | bateria sintetizada | **3** | Tudo feito em Operator, sem sample: sinos FM, triângulo, madeira para cliques de interface. |
| Sound Objects Lite | Ableton | 9.0 | 642 MB | 0 | 79 | 97 | 286 | 0 | 0 | 0 | 1 | 0 | objetos afinados, experimental | **3** | Cerâmica, vidro, sinos de vento e "Breath Hose": cristal do tema Clássico, sopro do fogão, vento. |
| Designer Drums (sem sufixo) | Ableton | 9.0 | 31 MB | 16 | 145 | 0 | 0 | 64 | 0 | 0 | 0 | 0 | idem | 0 | Cópia incompleta da `-1`. |
| Samplification | Ableton | 9.1 | 972 MB | 2 | 94 | 83 | 828 | 120 | 0 | 7 | 1 | 0 | variado | 2 | Alaúde (Basilica Lute), cordas pizzicato, samples de Sound Objects; o resto é eletrônico. |
| Loopmasters Mixtape | Ableton (vários selos) | 9.0 | 3,57 GB | 57 | 32 | 16 | 3833 | 2289 | 0 | 24 | 1 | 0 | dance, hip-hop, 8-bit | 2 | Loops 8-bit (Discovery Sound "8 Bit Family"), violão acústico e cordas reais; quase todo o resto é música de pista. |
| Guitar and Bass | Ableton | 9.0 | 1,13 GB | 3 | 17 | 0 | 29 | 60 | 0 | 10 | 1 | 0 | guitarra elétrica, baixo | 2 | Baixo elétrico/fretless para a base; a guitarra é elétrica, não violão. |
| Orchestral Brass | Ableton | 9.0 | 3,06 GB | 0 | 35 | 0 | 15 | 0 | 0 | 0 | 1 | 0 | orquestral, épico | 2 | Trompa solo serve para o título e a tarde; o resto pesa demais. |
| Digicussion 1 | Uppercussion | 1.0 | 164 MB | 50 | 0 | 0 | 800 | 17 | 0 | 0 | 1 | 0 | percussão digital | 2 | Batidas de madeira e cliques curtos para interface e passos. |
| Session Drums Studio | Ableton | 9.0 | 6,37 GB | 12 | 371 | 0 | 343 | 50 | 0 | 0 | 1 | 0 | bateria acústica | 1 | Bateria real; só serve baixinha numa faixa mais animada. |
| Session Drums Club | Ableton | 9.0 | 4,77 GB | 8 | 242 | 0 | 224 | 20 | 0 | 0 | 1 | 0 | bateria acústica | 1 | Idem. |
| Konkrete Breaks | Soniccouture | 1.0 | 181 MB | 15 | 0 | 0 | 859 | 101 | 0 | 5 | 1 | 0 | breaks glitch | 1 | Só os rangidos de guzheng (`Gu-Creaker1`) servem para o baú. |
| Vinyl Classics | Zero-G | 9.0 | 911 MB | 0 | 0 | 0 | 428 | 426 | 0 | 53 | 1 | 0 | disco, trip-hop, funk | 1 | Loops de disco; no máximo a textura de vinil. |
| Schwarzonator 2 | Henrik Schwarz | 1.0 | 1 MB | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 2 | gerador de acordes (M4L) | 1 | Ajuda a achar harmonias; não gera som. |
| Granulator by Monolake | Monolake | 1.0 | 3 MB | 0 | 0 | 7 | 1 | 0 | 0 | 0 | 1 | 2 | granular (M4L) | 1 | Granulador antigo; o Granulator III faria melhor. |
| PitchDrop by Mormo | Mormo | 1.0 | 1 MB | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 1 | 1 | efeito (M4L) | 1 | Queda de afinação; talvez no som de "recusado". |
| KJ Sawka Mad Beatz | Ableton | 9.0 | 474 MB | 11 | 4 | 0 | 527 | 337 | 14 | 0 | 1 | 0 | drum and bass, dubstep | 0 | Fora do clima. |
| The Forge by Hecq | Hecq | 9.0 | 1,16 GB | 4 | 26 | 0 | 170 | 104 | 0 | 18 | 1 | 8 | IDM, industrial | 0 | Fora do clima. |
| Unnatural Selection | Ableton | 9.0 | 217 MB | 0 | 0 | 0 | 156 | 156 | 0 | 2 | 1 | 0 | eletrônico | 0 | Fora do clima. |
| Solid Sounds | Ableton | 9.0 | 310 MB | 0 | 140 | 0 | 309 | 186 | 0 | 0 | 0 | 0 | eletrônico | 0 | Fora do clima. |
| Instant Haus by Alexkid | Alexkid | 1.0 | 6 MB | 0 | 1 | 0 | 60 | 0 | 0 | 0 | 1 | 1 | gerador de house (M4L) | 0 | Fora do clima. |
| Kapture | Richie Hawtin / Liine | 1.0 | 8 MB | 0 | 0 | 0 | 12 | 0 | 0 | 0 | 1 | 1 | utilitário (M4L) | 0 | Salva estados de parâmetros; não faz som. |

Observações: nos packs orquestrais e no Grand Piano os "samples" são poucos arquivos enormes (`Samples/Combined`), que os racks recortam. Na Core Library, as 2 "demo songs" do scan são os modelos de faixa em `Defaults`, não músicas.

## Por necessidade do jogo

São 29 chaves `som.*` e `musica.*` em `assets/registro.json`. **16 estão sem id**: `som.vento`, `som.passo_tabua`, `som.passo_grama`, `som.passo_pedra`, `som.bau_abre`, `som.bau_fecha`, `som.fogao_acende`, `som.interface.celeiro`, `som.interface.graal` e as 7 músicas. As outras 13 já têm id da biblioteca do Roblox (ou, no `som.mar_longe`, enviado pelo usuário).

Regra para tudo o que segue (detalhe em **Licença**): sample tocado sozinho e sem alteração não pode virar som do jogo. Preset de instrumento tocado com notas nossas é uso normal. Por isso os efeitos abaixo começam por síntese (Operator, Collision, Drift, Tension, Designer Drums) e usam samples só em camadas e transformados.

### Músicas (todas sem id)

Ideia geral: mesma tonalidade e andamento parecido entre `ilha_manha`, `ilha_dia` e `ilha_tarde`, porque a troca de período é um fade de 8 s no meio da faixa (`MUSIC_PERIOD_FADE`). As faixas de lugar (`breathe`) tocam uma vez inteiras e somem nos últimos 4 s: compor com começo e fim, 1,5 a 3 min. As de tela (`loop`) precisam emendar sem corte: exportar um número exato de compassos e levar a cauda do reverb para o começo (renderizar duas voltas e cortar a segunda). Reverbs da própria Core Library que combinam: `CL/Devices/Audio Effects/Reverb/Room/Wooden Room.adv` (sala) e `CL/Devices/Audio Effects/Reverb/Hall/Wooden Hall.adv` (título).

**`musica.titulo`** (laço; a vila com a fazenda, câmera passeando; acolhedor, uns 90 a 100 BPM, tom maior)
1. `FP/Orchestral Woodwinds/Sounds/Concert Flute/Concert Flute Solo Legato Vibrato.adg`: melodia principal.
2. `FP/Orchestral Strings/Sounds/Strings Ensemble/Strings Ensemble Pizzicato.adg`: acompanhamento saltitante.
3. `CL/Devices/Instruments/Tension/Guitar & Plucked/Nylon Basic Guitar.adv`: violão dedilhado por baixo (é modelo físico, sem sample).
4. `FP/Orchestral Mallets/Sounds/Glockenspiel/Glockenspiel.adg`: brilho na volta do tema; `FP/Orchestral Brass/Sounds/French Horn/French Horn Solo Legato.adg` numa segunda parte, se quiser algo mais "abertura".

**`musica.personalizar`** (laço; montar o personagem; leve, brincalhão, mais baixo que o título)
1. `CL/Racks/Instrument Racks/Piano & Keys/Music Box.adg` ou, sintetizado, `CL/Devices/Instruments/Collision/Mallets/Music Box Basic.adv`.
2. `CL/Racks/Instrument Racks/Plucked/Thumb Piano Tiny.adg`: ostinato curto.
3. `CL/Devices/Instruments/Collision/Mallets/Marimba Classic.adv`: baixo e acordes em marimba.
4. `FP/Orchestral Strings/Sounds/Violin/Violin Solo Pizzicato.adg`: contracanto.

**`musica.ilha_manha`** (respira; 5h às 8h, ilha com mar; esparso, calmo)
1. `FP/Orchestral Woodwinds/Sounds/Oboe/Oboe Solo Legato.adg` ou `FP/Orchestral Woodwinds/Sounds/Clarinet/Bb Clarinet Solo Legato.adg`: frase lenta.
2. `CL/Devices/Instruments/Tension/Guitar & Plucked/Harp Soft.adv`: arpejos.
3. `FP/Orchestral Mallets/Sounds/Vibraphone/Vibraphone.adg`: acordes com pedal.
4. `CL/Racks/Instrument Racks/Pad/Sea Pad.adg`: cama bem baixa (some atrás do ambiente).

**`musica.ilha_dia`** (respira; 8h às 17h; a faixa mais animada, pulso de trabalho)
1. `CL/Devices/Instruments/Tension/Guitar & Plucked/Banjo.adv` ou `CL/Devices/Instruments/Tension/Guitar & Plucked/Steel Picked Guitar.adv`: base rítmica.
2. `FP/Orchestral Mallets/Sounds/Marimba/Marimba.adg`: riff.
3. `FP/Orchestral Woodwinds/Sounds/Concert Flute/Concert Flute Solo Staccato.adg`: melodia; `FP/Orchestral Strings/Sounds/Double Bass/Double Bass Solo Pizzicato.adg` no baixo.
4. `FP/Latin Percussion/Drums/Instrument Kits/Shaker & Maracas.adg`: percussão leve; para um toque de ilha, `CL/Racks/Instrument Racks/Mallets/Steel Pan.adg`.

**`musica.ilha_tarde`** (respira; 17h às 19h; quente, mais lento, fim do dia)
1. `FP/Orchestral Woodwinds/Sounds/Clarinet/Bb Clarinet Solo Legato Vibrato.adg`: melodia.
2. `FP/Orchestral Strings/Sounds/Cello/Cello Solo Legato.adg`: linha de baixo cantada.
3. `FP/Orchestral Brass/Sounds/French Horn/French Horn Solo Legato.adg`: notas longas no fim.
4. `CL/Devices/Instruments/Tension/Guitar & Plucked/Nylon Basic Guitar.adv`: acordes.

**`musica.sala_dia`** (respira; dentro de casa, de dia; aconchegante)
1. `FP/Grand Piano/Sounds/Grand Piano Solo/Grand Piano Equal Mellow Solo.adg`: piano principal.
2. `CL/Racks/Instrument Racks/Piano & Keys/Ac Piano Upright.adg` (multisample `Upright Home Piano`): alternativa de piano de casa, mais íntimo.
3. `FP/Orchestral Mallets/Sounds/Vibraphone/Vibraphone.adg` ou `CL/Devices/Instruments/Electric/Piano & Keys/Wurli Soft Piano.adv`: segunda voz.
4. `CL/Devices/Instruments/Tension/Guitar & Plucked/Nylon Basic Guitar.adv`: base.

**`musica.sala_noite`** (respira; dentro de casa, à noite; volume 0,35, quase canção de ninar)
1. `FP/Grand Piano/Sounds/Grand Piano Production/Grand Piano Stretch Mellow Production.adg`, com Reverb longo e pouco ataque.
2. `CL/Racks/Instrument Racks/Piano & Keys/Childhood Home Piano.adg`: piano de casa meio desafinado; com `CL/Devices/Audio Effects/Vinyl Distortion` dá um ar de lembrança.
3. `CL/Racks/Instrument Racks/Piano & Keys/Music Box.adg`: retoma o tema do título em caixinha de música.
4. `FP/Orchestral Strings/Sounds/Strings Ensemble/Strings Ensemble Legato.adg`: notas longas e bem baixas.

Para um aceno ao Graal (opcional, numa faixa futura): `CL/Devices/Instruments/Drift/Synth Lead/Game Console.adv`, `CL/Devices/Instruments/Operator/Components/Square 8 Waveforms.adv` e o efeito `CL/Devices/Audio Effects/Redux/Chiptune Filter.adv`.

### Interface (sem id): um arquivo por kit, 8 sons em trechos

O `UI_SOUNDS` toca cada som por `region` dentro de um arquivo só. Sugestão: os 8 sons espaçados de 1 em 1 s, na ordem `click, focus, open, close, change, confirm, back, refused`, e depois preencher `region` em `src/shared/sounds.ts`.

**`som.interface.celeiro`** (madeira e papel)
1. `FP/Designer Drums-1/Drums/Drum Hits/Rim/Sidestick Wood.adg` e `FP/Designer Drums-1/Drums/Drum Hits/Clap/Percussion Wood Clap.adg`: cliques de madeira sintetizados (Operator, sem sample), bons para `click` e `focus`.
2. `FP/Latin Percussion/Drums/Drum Hits/Wood/Wood Block B Hi.adg`, `.../Wood Block B Mid.adg` e `.../Claves A 1.adg`: `change` e `back` em alturas diferentes.
3. `CL/Racks/Instrument Racks/Mallets/Marimba Maple.adg` ou `CL/Devices/Instruments/Collision/Mallets/Marimba Classic.adv`: `confirm` (duas notas subindo) e `refused` (duas notas descendo, meio tom).
4. `CL/Samples/Loops/Texture/Paper LDre.wav`: um pedaço de folha de papel em camada por baixo do `open` e do `close`, recortado, com EQ e afinação mudada.

**`som.interface.graal`** (sinos e cristal)
1. `FP/Latin Percussion/Drums/Drum Hits/Bell/Chimes A Finger up.adg` e `.../Chimes A Finger dn.adg`: varredura de chimes para `open` e `close`.
2. `FP/Orchestral Mallets/Sounds/Crotales/Crotales.adg` e `FP/Orchestral Mallets/Sounds/Glockenspiel/Glockenspiel Brass Hits.adg`: `click`, `focus`, `confirm`.
3. `CL/Devices/Instruments/Collision/Mallets/Glockenspiel Basic.adv` e `CL/Devices/Instruments/Operator/Mallets/Bells Tinkle Toy.adv`: versões sintetizadas, sem sample.
4. `CL/Racks/Instrument Racks/Mallets/Faux Microtonal Glass Mallet.adg` ou `FP/Sound Objects Lite/Sounds/Ambient & Evolving/Morphing Glass.adg`: o "cristal" do `change`; `FP/Designer Drums-1/Drums/Drum Hits/Bell/FM Prayer Bell.adg` para `refused`, mais grave.

### Efeitos e ambiente sem id

**`som.vento`** (laço de fundo; volume até 0,2 no exterior)
1. `CL/Devices/Instruments/Operator/Effects/Wind Machine.adv`: vento sintetizado; segurar uma nota longa e automatizar o filtro em rajadas lentas. Sem problema de licença.
2. `CL/Devices/Instruments/Operator/Effects/S&H Filtered Noise.adv` com `CL/Devices/Audio Effects/Auto Filter/Crashing Waves.adv`: ruído com filtro passeando.
3. `CL/Samples/Loops/Texture/Wind Air God.wav`: só como camada, filtrada e esticada (Warp), misturada com o sintetizado.
4. `FP/Sound Objects Lite/Simpler/Experimental/Breath Hose(Loop).adv`: sopro mais "de mangueira", baixo e filtrado, para as rajadas.

**`som.passo_tabua`** (uma variação; o jogo sorteia o pitch em ±6%)
1. `CL/Samples/One Shots/Drums/Wood/Wood Clog Medium.wav` em camada com `CL/Samples/One Shots/Drums/Kick/Kick Door.aif` (peso), com EQ e envelope curtos.
2. `FP/Designer Drums-1/Drums/Drum Hits/Kick/Kick Wood.adg`: batida de madeira sintetizada como corpo do passo.
3. `CL/Samples/One Shots/Drums/Wood/Wood Under The Rug.wav` ou `.../Wood Feel.wav`: variações.
4. `FP/Digicussion 1/Samples/One Shots/Strike/Wooden Grounded 08.aif`: ataque.

**`som.passo_grama`**
1. `CL/Samples/One Shots/Drums/Hihat/Hihat Closed Grassy.wav`, bem filtrado (passa-baixa) e mais grave.
2. `CL/Samples/One Shots/Drums/Shaker/Shaker SeedPodBangle.wav`: farfalhar curto.
3. `FP/Latin Percussion/Drums/Drum Hits/Shaker/Caxixi 1 Hand.adg`: grãos.
4. `CL/Samples/Loops/Texture/Grainy Sand.aif`: um recorte de 100 a 150 ms em camada.

**`som.passo_pedra`**
1. `CL/Samples/Loops/Texture/Grainy Sand.aif`: recorte mais áspero (cascalho), em camada com um ataque seco.
2. `CL/Samples/One Shots/Drums/Misc Percussion/Perc Foley Tap.wav`: o toque duro.
3. `CL/Samples/One Shots/Drums/Kick/Kick Dark Stone.wav`: corpo grave, bem baixo.
4. `FP/Sound Objects Lite/Simpler/Mallets/Ground Plate 1.adv`: superfície dura, só o transiente.

**`som.bau_abre`**
1. `FP/Konkrete Breaks/Samples/Konkrete 3/GuZheng 2 Kit Samples/Percussion/Gu-Creaker1.aif`: rangido de dobradiça, afinado para baixo.
2. `FP/Latin Percussion/Drums/Drum Hits/Wood/Guiro A Long.adg`, lento e grave: rangido de madeira.
3. `CL/Samples/One Shots/FX/Foley Door Lock.wav`: o trinco no começo.
4. `CL/Samples/One Shots/Drums/Wood/Wood Scrape.aif`: arrasto da tampa.

**`som.bau_fecha`**
1. `CL/Samples/One Shots/Drums/Wood/Wood Resonant Knock.wav` com `CL/Samples/One Shots/Drums/Kick/Kick Door.aif`: a batida da tampa.
2. `CL/Samples/One Shots/FX/Foley Door Lock.wav`: o trinco no fim.
3. `FP/Designer Drums-1/Drums/Drum Hits/Tom/Low Floor.adg`: corpo grave sintetizado.

**`som.fogao_acende`**
1. `CL/Devices/Instruments/Operator/Components/Noise Hit Attack.adv` com Auto Filter abrindo: o "fuuf" do gás, sintetizado.
2. `FP/Sound Objects Lite/Simpler/Experimental/Breath Hose.adv`: sopro curto.
3. `CL/Samples/One Shots/FX/Riser Whoosh Up.wav` ou `.../Swell Short Noise.wav`, encurtados e graves.
4. `CL/Samples/Loops/Texture/Crackle Vinyl Pop.wav`: estalos na cauda, para emendar com o som da lareira.

### Sons que já têm id (Roblox)

Ficam como estão. Se um dia forem trocados por versões próprias, o ponto de partida é este:

| Chave | O que há nos packs |
|---|---|
| `som.passaros` | Nada bom. `CL/Samples/Loops/Texture/Forest Ambience.wav` (conferir de ouvido se tem pássaros); o preset `Many Birds` é um efeito de frequency shifter, não pássaro. |
| `som.grilos` | Nada gravado. Dá para sintetizar no Operator (seno agudo com tremolo); o preset de efeito `CL/Devices/Audio Effects/Beat Repeat/Insect.adv` ajuda a picotar. |
| `som.mar_longe`, `som.mar` | `CL/Racks/Instrument Racks/Evolving/Seashore Pad.adg` e ruído com `Crashing Waves.adv`; ondas reais, nenhuma. |
| `som.lareira` (e `fogao`) | `CL/Samples/Loops/Texture/Crackle Tuning.wav`, `Crackle Vinyl Pop.wav` e os `RF Crackle` do Konkrete Breaks, sobre ruído grave. |
| `som.torneira`, `som.respingo`, `som.passo_agua.*`, `som.nadar` | `CL/Samples/One Shots/FX/Blip Water.wav`, `CL/Samples/One Shots/Drums/FX Hit/FX Water.wav`, `CL/Samples/Loops/Texture/Sink Noise.wav`, os `Sink Drain` do Sound Objects Lite. |
| `som.porta` | `Foley Door Lock.wav` e `Wood Resonant Knock.wav`. |
| `som.pote_quebra` | `CL/Samples/One Shots/FX/Broken Glass.wav`, `CL/Samples/One Shots/Drums/Misc Percussion/Perc Pot 1.wav`, `FP/Sound Objects Lite/Sounds/Mallets/Ceramic Tiles.adg`. |

## Lacunas

O que nenhum pack instalado cobre bem:

1. **Natureza gravada.** Só há `Forest Ambience.wav`, `Wind Air God.wav`, `Rain and Train.wav` e `Cat Purring.wav` na Core Library. Pássaros, grilos, mar e fogo de verdade continuam vindo da biblioteca do Roblox (como hoje) ou de gravação própria.
2. **Animais de fazenda** (galinha, vaca, ovelha, porco, cachorro): nada. Vai ser preciso para o núcleo de Hay Day.
3. **Foley das ferramentas** (enxada, regador, machado, picareta, vara de pesca, colheita): nada específico. O pacote do boneco já tem essas animações; o som vai ter de ser montado com camadas de percussão e síntese, ou gravado.
4. **Passos por piso**: não há biblioteca de passos; o que está acima é improviso com percussão.
5. **Chiptune**: não há instrumento de 8 bits pronto. Dá para fazer com Operator (ondas quadradas em `Operator/Components`), Drift (`Game Console`, `Crunch Arcade`), Redux (`Chiptune Filter`) e os loops "8 Bit Family" do Loopmasters Mixtape como referência.
6. **Instrumentos folk reais**: violão, ukulele, acordeão, gaita, ocarina e banjo só existem como modelo físico (Tension) ou síntese (`Operator/Winds/Ocarina Basic.adv`, `Analog/Synth Keys/Accordion Unisono Pad.adv`). Violino solo real existe (Orchestral Strings).
7. **Piano de armário/feltro**: só o `Ac Piano Upright` e o `Childhood Home Piano` da Core Library.
8. **Granulador moderno**: Granulator III ausente.

Packs da Ableton que valeria baixar. Todos os desta lista existem; se cada um vem com a Suite 12 sem custo é o que eu lembro, e precisa ser confirmado no navegador do Live, em Packs > "Available Packs" (os que a licença dá direito aparecem ali para instalar):

| Pack | Para quê | Certeza de que vem na Suite |
|---|---|---|
| Granulator III | texturas, vento e água granulares a partir de qualquer som | alta |
| Upright Piano | piano de armário para a sala | alta |
| Lost and Found | instrumentos feitos de objetos de casa e brinquedos: interface Celeiro, percussão aconchegante | alta |
| Inspired by Nature (Dillon Bastan) | devices Max for Live que geram música por regras da natureza (Tree Tone e outros) | alta |
| Mood Reel | texturas cinematográficas para pads e transições | média |
| String Quartet e Brass Quartet (Spitfire Audio) | quarteto de cordas e de metais mais íntimo que os orquestrais | média |
| Drone Lab | camadas de fundo | média |

Palpites, não confirmados: um pack oficial da Ableton de chiptune ou de gravações de campo de natureza. Não lembro de nenhum com certeza; para esses sons, a saída mais segura é gravação própria ou bibliotecas com licença de uso em jogos (por exemplo CC0), guardando o link e o texto da licença como foi feito com o Cozy People.

## Licença

Texto conferido no EULA instalado com o Live (`C:\ProgramData\Ableton\Live 12 Suite\Legal\Ableton_Live_EULA_Third_Party_URL_Logo.pdf`, arquivo de 09/06/2025), seção 5(3). O que ela diz, resumido:

- **(a)** Presets, samples, loops, frases e exemplos são para uso com o Live, como instrumentos musicais e elementos de sound design, e para compor música. Não podem ser revendidos, sublicenciados ou distribuídos, nem servir para montar outro pack ou biblioteca de samples.
- **(b)** "Use of unmodified materials appearing in isolation including, but not limited to, in film or game soundtracks, is not permitted without obtaining a separate license." Material isolado (sample, loop, STEM) não pode ser distribuído nem licenciado como conteúdo avulso, mesmo que faça parte de uma composição.
- **(c)** Pode criar composições originais com esse material, desde que acrescente material próprio e transforme o que usou de forma significativa.
- **(d)** Demo songs não podem entrar na sua música, nem alteradas.
- Seção 8(3): se a licença acabar, músicas que contêm esse material não podem mais ser distribuídas sem licença separada.
- Material de terceiros dentro dos packs pode ter termos próprios, que prevalecem ("Unless other license terms (e.g. terms of Third-Party Content) prevail").

O que isso quer dizer para o jogo:

- **Música**: compor com os instrumentos e presets (tocar notas nossas no Grand Piano, na flauta, no Tension) é o uso previsto. Usar loop ou clip pronto só se for bem transformado e misturado com material nosso. Não usar demo songs, nem os `.als` de construction kits como base.
- **Efeitos sonoros**: um sample da Core Library tocado sozinho, como veio, como som de botão ou de baú cai no item (b) e não é permitido. Preferir síntese (Operator, Collision, Drift, Tension, Designer Drums); quando usar sample, em camadas, recortado, com EQ, afinação e envelope próprios.
- **Enviar ao Roblox**: o arquivo enviado é a nossa mixagem final. Não enviar sample solto do pack.

A conferir (não está claro no texto, e não vou inventar):

- Se um efeito de jogo feito de um sample transformado conta como "sound design element" permitido no item (a). A leitura mais segura é a de cima; para certeza, perguntar ao suporte da Ableton.
- Os termos próprios dos packs de terceiros instalados: Grand Piano (e-instruments), Vinyl Classics (Zero-G), Konkrete Breaks (Soniccouture), Digicussion (Uppercussion), The Forge (Hecq) e os selos do Loopmasters Mixtape. A pasta dos packs não traz nenhum texto de licença próprio.
- O EULA em vigor no site da Ableton pode ser mais novo que o arquivo instalado.

## Próximos passos

1. **Antes de tudo**: no Live, abrir Packs > Available Packs e instalar Granulator III, Upright Piano e Lost and Found, se aparecerem. Apagar a pasta `Designer Drums` sem sufixo só se o usuário quiser (é a cópia incompleta).
2. **Guardar os projetos** num lugar com cópia (os de antes se perderam): um `.als` por faixa e um por kit de efeitos, com File > Collect All and Save.
3. **Com o MCP do Ableton** (servidor `ableton` no `.mcp.json`; o script do Live já está em `User Library\Remote Scripts\AbletonMCP`), para cada faixa: `set_tempo`, `create_midi_track`, achar o preset com `get_browser_tree` e `get_browser_items_at_path`, carregar com `load_instrument_or_effect`, escrever a parte com `create_clip` e `add_notes_to_clip`, ouvir com `fire_clip`, ajustar com `get_device_parameters` e `set_device_parameter`, e montar a forma com `duplicate_to_arrangement` e `create_locator`. O MCP não exporta áudio: o usuário exporta em File > Export Audio/Video (Ctrl+Shift+R). O servidor tem ferramentas de coleta de dados (`set_dataset_consent`, `submit_intent`, `rate_last_action`); com a variável `ABLETON_MCP_DISABLE_TELEMETRY` do `.mcp.json`, a gravação do conjunto de dados fica desligada (conferido em `MCP_Server/server.py`), e o consentimento só pode vir do próprio usuário.
4. **Ordem sugerida**: primeiro os 7 efeitos sem id (curtos, destravam o jogo), depois os dois kits de interface, depois `ilha_dia`, `sala_dia`, `titulo`, e por fim as variações (`ilha_manha`, `ilha_tarde`, `sala_noite`, `personalizar`).
5. **Exportar**: WAV 44,1 kHz; laços cortados no compasso; efeitos pelo lugar (passos, baú, fogão) em mono, música e ambiente em estéreo (palpite: conferir como o Roblox trata estéreo num som posicionado).
6. **Enviar e registrar**: o envio ao Roblox usa a conta do usuário, então pedir o aval dele. Gravar cada id em `assets/registro.json`, rodar `npm run assets`, preencher os `region` dos kits de interface em `src/shared/sounds.ts`, e conferir no Studio de ouvido.
7. Registrar em `assets/LICENCAS.md`, seção Sons, de onde saiu cada som (preset, pack, o que foi transformado).
