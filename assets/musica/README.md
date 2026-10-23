# Música e sons do Haywood Valley (partituras)

Compostos em 2026-10-20 como partituras JSON (formato e papéis em `docs/audio/PRODUCAO.md`; instrumentos indicados em `docs/audio/ESTUDO_PACOTES_ABLETON.md`). Compor é separado de montar: `tools/som/ableton_montar.py` leva cada partitura ao Live, o usuário exporta e `tools/som/cortar.py` corta um arquivo por chave.

- `partituras/<chave>.json`: a partitura (uma nota por linha: `[altura MIDI, início em tempos, duração em tempos, velocidade]`). Além do formato, cada uma tem `duracao_s`, e as músicas têm `modo` (`loop` ou `breathe`) e, as versões de um lugar, `familia`.
- `midi/<chave>.mid`: prévia para ouvir e abrir no Live, uma trilha e um canal por papel, com o programa GM mais parecido (percussão no canal 10). O GM soa muito diferente dos presets; serve para conferir notas, forma e andamento. Os efeitos (`sfx_*`) no GM não dão ideia do som.
- Geradores em `tools/som/compor/` (um módulo por peça, `lib.py` com a teoria e o MIDI). Refazer tudo: `python -I tools/som/compor/compor.py` (com o Python 3.12 de `%LOCALAPPDATA%\Programs\Python\Python312`); uma peça só: `... compor.py ilha`. A humanização é sorteada com semente fixa: sai igual toda vez.
- Conferir: `python -I tools/som/compor/verificar.py` (papéis, extensão de cada instrumento, durações, nada além do fim, instrumentos de uma voz sem sobreposição, laço sem buraco na emenda, trechos com ≥ 0,3 s de silêncio e a primeira nota no início exato, versões de um lugar com o mesmo andamento, compasso, tom e tamanho). `--choques` lista notas longas a meio tom (ou 9ª menor) uma da outra; hoje dá zero em todas as músicas.

## Músicas

| Chave | Título | BPM | Compasso | Tom | Duração | Modo | Instrumentação | Intenção |
|---|---|---|---|---|---|---|---|---|
| `musica.titulo` | O vale acorda | 96 | 4/4 | Ré maior | 32 compassos, 80,0 s | laço | flauta, trompa, violão, cordas pizzicato, cordas legato, glockenspiel | A abertura: a vila de manhã, acolhedora, sem pressa. Intro – A (flauta) – B (trompa canta, flauta responde em sextas) – A' (com glockenspiel, clímax no Ré6) – volta que cai na intro. |
| `musica.personalizar` | Diante do espelho | 112 | 4/4 | Sol maior | 40 compassos, 85,7 s | laço | caixinha de música, cordas pizzicato, celesta (no lugar do thumb piano), marimba, percussão latina baixa | Leve e brincalhona, mais baixa que o título. Intro – A (caixinha) – A' (pizzicato responde) – B (Mi menor, o pizzicato canta) – A'' – final em Ré7. |
| `musica.ilha_manha` | Maré mansa (manhã) | 92 | 4/4 | Fá maior, com Si natural (lídio) | 52 compassos, 135,7 s + 3 s de cauda | respira | oboé, harpa, vibrafone, pad quente | O sol nascendo sobre o mar: esparsa, o tema sem notas de passagem, a harpa canta o B. |
| `musica.ilha_dia` | Maré mansa (dia) | 92 | 4/4 | idem | idem | respira | flauta, marimba, violão, contrabaixo pizzicato, percussão latina | A mais animada: riff de marimba 3+3+2 (o balanço da ilha, sem bateria), violão "bum, tchi-ca", flauta articulada; ponte em meio tempo. |
| `musica.ilha_tarde` | Maré mansa (tarde) | 92 | 4/4 | idem | idem | respira | clarinete, trompa, violão, violoncelo, cordas legato | Quente, fim do dia: tema uma oitava abaixo no clarinete, acompanhamento em meio tempo (parece mais lenta no mesmo BPM), a trompa canta a ponte. |
| `musica.sala_dia` | Chá na janela (dia) | 88 | 3/4 | Mi bemol maior (B em Lá bemol) | 60 compassos, 122,7 s + 4 s | respira | piano, vibrafone, violão, violoncelo | Valsa lenta de casa. No B, o vibrafone cita o tema do título adaptado a 3/4 (a casa lembra o vale); no A' o piano ganha segunda voz e o violoncelo faz terças e sétimas. |
| `musica.sala_noite` | Chá na janela (noite) | 88 | 3/4 | idem | idem | respira | piano suave, caixinha de música, cordas legato | Quase canção de ninar: o tema sem as notas de passagem, a mão esquerda segura em vez de valsar, a caixinha lembra o título no B, o A' uma oitava abaixo. |
| `musica.vila` | Dia de feira (2026-10-23) | 108 | 4/4 | Dó maior | 32 compassos, 71,1 s | laço | flauta, clarinete, marimba, violão, cordas pizzicato (baixo), percussão latina, glockenspiel | A vila e o mercado de dia, mais saltitante que o título: marimba no contratempo, violão "bum, tchi-ca", o clarinete repete o tema no A' e a flauta responde; volta pelo Sol7. À noite o mercado fecha (`MUSIC_PLACES.vila` sem a noite). |

As versões de um mesmo lugar têm o **mesmo andamento, a mesma harmonia compasso a compasso e o mesmo tamanho**: a troca de período (fade de 8 s, `MUSIC_PERIOD_FADE`) soa como a mesma música mudando de luz. Hoje o `MusicController` começa a versão nova do começo; se um dia ele copiar a `TimePosition` da versão que sai, a troca fica no mesmo compasso (as partituras já permitem).

Laços (título, personalizar): nenhuma nota passa do fim, a última harmonia leva à primeira. O montador põe duas voltas seguidas e o corte pega a segunda, que já começa com a cauda do reverb da primeira. Lugares (`breathe`): começo e fim musicais (introdução de 4 compassos e acorde final), porque o jogo toca a faixa inteira, some nos últimos 4 s e descansa de 60 a 180 s.

## Interface (um arquivo por kit, 8 sons)

60 BPM (um tempo = um segundo); cada som começa num segundo inteiro, na ordem de `UiSound`. Os `trechos` são o `region` de cada um em `UI_SOUNDS` (`src/shared/sounds.ts`), a preencher quando os arquivos tiverem id:

| Som | `som.interface.celeiro` (madeira, fazenda, quente) | `som.interface.graal` (tema Clássico: sinos, cristal, chip discreto) |
|---|---|---|
| click | [0, 0.15] toque seco de madeira e bloco | [0, 0.13] estalo com um fio de quadrada |
| focus | [1, 1.13] madeira leve e aguda | [1, 1.13] "tic" de triângulo |
| open | [2, 2.34] marimba subindo uma quinta, raspar de papel | [2, 2.38] varredura de sinos subindo, quadrada embaixo |
| close | [3, 3.32] o espelho, descendo | [3, 3.36] varredura descendo |
| change | [4, 4.18] bloco agudo | [4, 4.22] crotales (o cristal) |
| confirm | [5, 5.4] Dó–Mi–Sol na marimba | [5, 5.33] "plim-plim" de RPG: quarta subindo |
| back | [6, 6.28] claves e duas notas descendo | [6, 6.24] duas notas de triângulo descendo |
| refused | [7, 7.36] dois golpes graves com trítono, meio tom abaixo ("não") | [7, 7.32] zumbido grave repetido com sino em trítono |

## Efeitos sem id

| Chave | Duração | Camadas (papéis) | O que é |
|---|---|---|---|
| `som.vento` | laço de 32 s | `sfx_ruido` | Cama contínua grave e média, rajadas de 3–6,5 s sorteadas (sem pulso), dois assobios finos; a emenda cai numa calmaria. |
| `som.passo_tabua` | 4 variações | `sfx_madeira`, `percussao_latina` (conga abafada), `sfx_grave` | Calcanhar e ponta, o oco do assoalho, peso; a 4ª range de leve. |
| `som.passo_grama` | 4 variações | `sfx_ruido`, `percussao_latina` (cabasa, maracas), `sfx_grave` | Farfalhar em duas rajadas curtas e grãos. |
| `som.passo_pedra` | 4 variações | `percussao_latina` (claves), `sfx_ruido`, `sfx_click`, `sfx_grave` | Toque duro e o "crec" do cascalho. |
| `som.bau_abre` | ~0,8 s | `sfx_metal`, `sfx_madeira`, `percussao_latina` (guiro), `sfx_grave` | Trinco, dobradiça rangendo (rajada de estalinhos com altura que sobe e desce), tampa batendo para trás. |
| `som.bau_fecha` | ~0,5 s | `sfx_madeira`, `sfx_grave`, `percussao_latina` (conga grave), `sfx_metal` | Rangido curto, batida da tampa, tremida, trinco. |
| `som.fogao_acende` | ~1,8 s | `sfx_ruido`, `sfx_click`, `sfx_fogo`, `sfx_grave` | Fósforo riscado, "fuuf" do fogo pegando, estalos, chama assentando (emenda na lareira). |

Passos: os trechos são `passo_1` [0, ~0.17], `passo_2` [1, ~1.17], `passo_3` [2, ~2.17], `passo_4` [3, ~3.2] (valores exatos em cada partitura). Para usar as quatro, `EFFECTS.passoTabua` (e grama, pedra) vira quatro `SoundSpec` com o `region` de cada uma; o jogo continua sorteando o tom em ±6%.

## Substitutos opcionais (`<chave>.nosso`)

Feitos por nós para os sons que hoje vêm da biblioteca do Roblox. **Não trocam nada sozinhos**: a chave `.nosso` não existe no registro. Só valem se, ouvidos no jogo, ficarem melhores que os atuais; aí o arquivo entra no lugar do id da chave original.

| Chave | Duração | Mantém os recortes de hoje |
|---|---|---|
| `som.porta.nosso` | arquivo de 4 s | sim: `region` [0.1, 3.45] (maçaneta em 0,1 s, abre rangendo, volta e bate em 3,0 s) |
| `som.pote_quebra.nosso` | arquivo de 3 s | sim: [0.1, 2.6] (impacto em 0,1 s, cacos, pedacinhos quicando até 2,1 s) |
| `som.respingo.nosso` | arquivo de 2 s | sim: [0, 1.1] |
| `som.lareira.nosso` | laço de 16 s | laço inteiro (`PLACED.lareira` e `PLACED.fogao`) |
| `som.torneira.nosso` | arquivo de 18 s | sim: abre [0, 1.6], laço [2, 13], fecha [14, 17.4] (`PLACED.torneira`, `torneiraAbre`, `torneiraFecha`) |

`som.passaros`, `som.grilos`, `som.mar`, `som.mar_longe`, `som.nadar` e `som.passo_agua.*` ficaram de fora: natureza e água sintetizadas por notas soariam piores que o que já está no jogo.

## Leva de 2026-10-23: animais, fazenda e ambiente

Gerador `tools/som/compor/fazenda.py` (a vila em `vila.py`); `compor.py fazenda vila`. Gravados no Live com `gravar.py` e cortados com `--cauda-auto --passa-altas 40 --trechos-limpos` (ver `docs/audio/PRODUCAO.md`, "Leva de 2026-10-23"). Os trechos abaixo são os do arquivo cortado (o fim é onde o som caiu 40 dB), os mesmos do `region` em `EFFECTS` (`src/shared/sounds.ts`); todos sem id. Nada de sample sozinho: vozes do Operator, percussão e síntese.

**Animais** (vozes sintetizadas `voz_grave` e `voz_nasal`, estilizadas como nos jogos de fazenda):

| Chave | Arquivo | Trechos (s) | Efeito no jogo |
|---|---|---|---|
| `som.galinha` | 5,35 s | co_1 [0, 0.542], co_2 [1, 1.61], pergunta [2, 2.837], ovo [3, 4.314] | `galinha` (3), `galinhaOvo` |
| `som.vaca` | 4,35 s | muu_1 [0, 1.531], muu_2 [2, 3.425] | `vaca` |
| `som.ovelha` | 4,35 s | bee [0, 0.863], carneirinho [2, 2.687] | `ovelha` |
| `som.porco` | 3,35 s | oinc_1 [0, 0.438], oinc_2 [1, 1.615], fungada [2, 2.499] | `porco`, `porcoFunga` |
| `som.cachorro` | 3,35 s | au_1 [0, 0.412], au_2 [1, 1.634], arf [2, 2.699] | `cachorro` |
| `som.gato` | 2,35 s | miau [0, 0.963], miu [1, 1.703] | `gato` |
| `som.passaros_pousam` | 6,35 s | pousa_1 [0, 0.706], pousa_2 [2, 2.659], voa [4, 4.797] | `passaroPousa`, `passaroVoa` (complementam o `som.passaros` da biblioteca) |

**Ações de fazenda**:

| Chave | Arquivo | Trechos (s) | Efeito no jogo |
|---|---|---|---|
| `som.enxada` | 3,35 s | golpe_1 [0, 0.618], golpe_2 [1, 1.632], golpe_3 [2, 2.63] | `enxada` |
| `som.plantar` | 2,35 s | semente_1 [0, 0.922], semente_2 [1, 1.918] | `plantar` |
| `som.regar` | 4,35 s | rega_1 [0, 1.97], rega_2 [2, 4.32] | `regar` |
| `som.colher` | 3,35 s | colhe_1 [0, 0.97], colhe_2 [1, 1.97], colhe_3 [2, 3.32] | `colher` |
| `som.mato_corte` | 3,35 s | corte_1 [0, 0.573], corte_2 [1, 1.563], corte_3 [2, 2.569] | `matoCorte` |
| `som.machado` | 6,35 s | golpe_1 [0, 0.552], golpe_2 [1, 1.583], golpe_3 [2, 2.554], arvore_cai [3, 5.196] | `machado`, `arvoreCai` |
| `som.picareta` | 5,35 s | golpe_1 [0, 0.97], golpe_2 [1, 1.542], golpe_3 [2, 2.615], pedra_quebra [3, 3.914] | `picareta`, `pedraQuebra` |
| `som.pesca` | 8,35 s | lancar [0, 1.97], fisgar [2, 2.97], puxar [3, 5.97] (laço de 3 a 5), pegou [6, 7.363] | `pescaLancar`, `pescaFisgar`, `pescaPuxar` (uma volta, [3, 5], até haver a pesca), `pescaPegou` |
| `som.pegar_item` | 3,35 s | pega_1 [0, 0.97], pega_2 [1, 1.97], pega_3 [2, 3.244] | `pegarItem` |
| `som.moedas` | 4,35 s | poucas [0, 1.026], muitas [2, 4.215] | `moedas`, `moedasMuitas` |
| `som.nivel` | 3,35 s | nivel [0, 2.384] | `nivel` |

**Laços**:

| Chave | Duração | Uso no jogo | O que é |
|---|---|---|---|
| `som.maquina` | 4 s | `PLACED.maquina` | Máquina de produção: "tchuc-tchuc" de madeira, grave por segundo, engrenagem em semicolcheias, zumbido em rajadas, dois sopros de vapor. |
| `som.campo_dia` | 32 s | camada `campoDia` (exterior e mar, de dia) | Folhas em ondas e trilos de gafanhoto longe; um sininho de vaca distante. Sem cama: o vento é a cama. |
| `som.campo_noite` | 32 s | camada `campoNoite` (exterior e mar, à noite) | Sapos ("rrup"), a coruja duas vezes, trilos de inseto. |
| `som.rio` | 16 s | `PLACED.rio` | Correnteza em rajadas curtas de ruído em ondas lentas, bolhinhas e gorgolejos. |

`EFFECTS`, `PLACED.rio`/`maquina` e as camadas `campoDia`/`campoNoite` só têm os dados: o código que toca cada efeito (ao tocar num bicho, colher, etc.) entra quando essas mecânicas existirem.

## No Live

As `observacoes` de cada partitura dizem o preset indicado e o que ajustar (release, filtro, reverb, volume entre trilhas). Em geral: reverb "Wooden Hall" no título, "Wooden Room" na sala; percussão e camas 6–10 dB abaixo da melodia; efeitos e interface em mono, sem reverb (o jogo põe o lugar), com release curto e um fade de 5 ms no fim de cada trecho. Efeitos do jogo nunca podem ser um sample sozinho (EULA, seção 5(3)): as camadas já estão pensadas para isso.

## Para ouvir com atenção

- **Leva de 2026-10-23** (nada foi ouvido, só medido): o timbre dos bichos é o mais incerto (a vaca e o porco na voz "Portamento Male" podem soar humanos demais; trocar por fagote ou tuba seria o plano B); o cacarejo quase não cai de altura (o portamento é mais lento que o "có"); asas dos pássaros em chocalho; a vila, se o contratempo da marimba e o shaker cansarem no laço.

- **Título**: a trompa no B (compassos 13–20) pode soar "abertura de filme" demais para um jogo aconchegante; a alternativa é o clarinete na mesma linha.
- **Ilha**: a quarta aumentada (Sol/Fá na introdução, Si natural nos compassos 18 e 42) é o tempero de ilha flutuante; se soar estranho, trocar `G/F` por `Bb/F` e `G/B` por `Gm/Bb` em `tools/som/compor/ilha.py`. A ponte em Mi bemol (sétimo grau abaixado) é a parte mais "pôr do sol".
- **Ilha dia**: o violão faz o papel do banjo; com o Tension "Banjo" ou "Steel Picked Guitar" fica bem mais de ilha (a montagem liga o papel a um preset só).
- **Ilha tarde**: o clarinete no grave contra o violoncelo pode embolar.
- **Personalizar**: o ostinato foi escrito para um thumb piano (kalimba); na celesta fica mais "caixinha".
- **Sala**: a citação do título no B (vibrafone de dia, caixinha de noite) é a ideia central; confirmar se reconhece o tema. O Dó bemol do compasso 18 (Lá bemol menor com sexta) é a nota de saudade.
- **Interface**: os dois `refused` devem dizer "não" sem irritar depois da décima vez.
- **Vento** e **lareira**: dependem muito do patch (as notas só dizem quando e quão forte); ouvir a emenda do laço.
