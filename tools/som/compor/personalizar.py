"""musica.personalizar: "Diante do espelho". Sol maior, 112 BPM, 4/4, 40 compassos em laço (85,7 s).

Forma: introdução (1–4, ostinato e marimba) | A (5–12, caixinha de música) | A' (13–20, o pizzicato responde nas
pausas, blocos de madeira) | B (21–28, Mi menor, o pizzicato canta e a caixinha responde em cima) | A'' (29–36,
tudo) | final (37–40, ecos do tema, Ré7 que volta à introdução).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import GM, Harmonia, Partitura, contorno, dinamica, figura, limpar, linha_baixo, mel  # noqa: E402


def compor() -> Partitura:
    p = Partitura("musica.personalizar", "Diante do espelho", 112, (4, 4), "Sol maior", 40, True, 0.0,
                  semente=11240)
    c = p.c
    a_harm = "G | Bm7 | Cmaj7 | D | G/B | C | Am7 D7 | G |"
    h = Harmonia(
        "G | Cmaj7 | G | D7 |" + a_harm + a_harm +
        "Em | Em/D | C | G/B | Am7 | Bm7 | C | D7sus4 D7 |" + a_harm +
        "G | Em7 | Am7 | D7",
        p.tc,
    )

    # ------------------------------------------------ caixinha de música: o tema (saltitante, com pausas de respiro)
    tema = (
        "D5:0.5 G5:0.5 B5:0.5 r:0.5 A5:0.5 G5:0.5 r:0.5 D5:0.5 | F#5:1 A5:0.5 F#5:0.5 D5:1 r:1 |"
        " E5:0.5 G5:0.5 B5:0.5 r:0.5 C6:0.5 B5:0.5 r:0.5 G5:0.5 | A5:1.5 F#5:0.5 D5:1 r:1 |"
        " D5:0.5 G5:0.5 B5:0.5 r:0.5 D6:0.5 B5:0.5 r:0.5 G5:0.5 | E6:1 D6:0.5 C6:0.5 G5:1 E5:1 |"
    )
    fim_1 = " A5:0.5 C6:0.5 B5:0.5 A5:0.5 F#5:0.5 A5:0.5 C6:0.5 F#5:0.5 | G5:2 r:2"
    fim_2 = " A5:0.5 C6:0.5 B5:0.5 A5:0.5 F#5:0.5 A5:0.5 D6:0.5 C6:0.5 | B5:1 G5:0.5 D5:0.5 G5:1 r:1"
    cx = []
    for ini, fim, vel in [(5, fim_1, 72), (13, fim_2, 70), (29, fim_1, 78)]:
        n, _ = mel((tema + fim).replace("|", ""), c(ini), vel, art=0.9)
        cx += contorno(n, 0.5)
    resposta_b, _ = mel(
        "r:3 B5:0.5 E6:0.5 G6:1 F#6:0.5 r:1.5 D6:0.5 B5:0.5 r:3 C6:0.5 E6:0.5 D6:1 B5:0.5 r:2.5"
        " r:3 C6:0.5 E6:0.5 D6:1 F#6:0.5 r:2.5 r:2 E6:0.5 D6:0.5 C6:0.5 B5:0.5 A5:1 r:3",
        c(21), 58, art=0.9,
    )
    ecos, _ = mel(
        "D5:0.5 G5:0.5 B5:0.5 r:2.5 r:2 E5:0.5 G5:0.5 B5:0.5 r:0.5 C6:0.5 A5:0.5 E5:0.5 r:2.5"
        " r:2 F#5:0.5 A5:0.5 C6:0.5 D6:0.5",
        c(37), 62, art=0.9,
    )
    cx += resposta_b + dinamica(ecos, [(c(37), 1.0), (c(40), 0.85)])
    p.add("caixinha_de_musica", cx)

    # ------------------------------------------------ pizzicato: respostas no A', a melodia do B, contracanto no A''
    respostas, _ = mel(
        "r:4 r:2 B4:0.5 A4:0.5 F#4:0.5 A4:0.5 r:4 r:2 F#4:0.5 G4:0.5 A4:0.5 C5:0.5"
        " r:4 r:4 r:4 r:2 D5:0.5 C5:0.5 B4:0.5 A4:0.5",
        c(13), 66,
    )
    melodia_b, _ = mel(
        "B4:0.5 E5:0.5 G5:0.5 E5:0.5 B4:0.5 E5:0.5 G5:1 | F#5:0.5 E5:0.5 D5:0.5 B4:0.5 D5:1 r:1 |"
        " C5:0.5 E5:0.5 G5:0.5 E5:0.5 C6:1 B5:1 | B5:0.5 A5:0.5 G5:0.5 D5:0.5 G5:1 r:1 |"
        " A5:0.5 G5:0.5 E5:0.5 C5:0.5 E5:0.5 A5:0.5 r:1 | B5:0.5 A5:0.5 F#5:0.5 D5:0.5 F#5:0.5 B5:0.5 r:1 |"
        " C6:0.5 B5:0.5 A5:0.5 G5:0.5 E5:1 G5:1 | G5:1.5 A5:0.5 F#5:1 r:1".replace("|", ""),
        c(21), 76,
    )
    contra, _ = mel(
        "G4:1 r:1 B4:1 r:1 F#4:1 r:1 A4:1 r:1 E4:1 r:1 G4:1 r:1 F#4:1 r:1 A4:0.5 B4:0.5 C5:0.5 r:0.5"
        " B4:1 r:1 D5:1 r:1 C5:1 r:1 E5:1 r:1 C5:1 r:1 F#4:1 r:1 G4:1 B4:0.5 A4:0.5 G4:1 r:1",
        c(29), 58,
    )
    p.add("cordas_pizzicato", respostas + contorno(melodia_b, 0.6) + contra)

    # ------------------------------------------------ celesta: o ostinato (no Live, um "thumb piano" pequeno)
    fig_ost = [(0, "0", 0.45, 0.85), (0.5, "2", 0.45, 0.6), (1, "1", 0.45, 0.7), (1.5, "2", 0.45, 0.6),
               (2, "0", 0.45, 0.8), (2.5, "2", 0.45, 0.6), (3, "1", 0.45, 0.7), (3.5, "T", 0.45, 0.55)]
    ost = figura(h, 0, c(21), p.tc, fig_ost, 60, 76, 3, vel=58)
    fig_ost_b = [(0, "0", 0.45, 0.8), (1.5, "1", 0.45, 0.6), (2.5, "2", 0.45, 0.6), (3, "1", 0.45, 0.55)]
    ost += figura(h, c(21), c(29), p.tc, fig_ost_b, 60, 76, 3, vel=50)
    ost += figura(h, c(29), p.total, p.tc, fig_ost, 60, 76, 3, vel=60)
    ost = dinamica(ost, [(0, 0.9), (c(5), 0.8), (c(13), 0.9), (c(29), 1.0), (c(37), 0.95)])

    # ------------------------------------------------ marimba: baixo nos tempos 1 e 3, acordes nos 2 e 4
    fig_mar = [(0, "R", 0.9, 1.0), (1, "0", 0.4, 0.62), (1, "1", 0.4, 0.58), (2, "F", 0.9, 0.85),
               (3, "0", 0.4, 0.62), (3, "1", 0.4, 0.58)]
    mar = figura(h, 0, c(21), p.tc, fig_mar, 59, 71, 2, 45, 57, 70)
    mar += linha_baixo(h, c(21), c(29), p.tc, [(0, "R", 0.9, 1.0), (1.5, "F", 0.4, 0.7), (2, "O", 0.9, 0.8),
                                                (3, "R", 0.4, 0.7), (3.5, "A", 0.4, 0.75)], 45, 60, 66)
    mar += figura(h, c(29), p.total, p.tc, fig_mar, 59, 71, 2, 45, 57, 74)

    canto = cx + melodia_b
    p.add("celesta", limpar(ost, canto))
    p.add("marimba", limpar(mar, canto))

    # ------------------------------------------------ percussão leve: blocos de madeira no A', cabasa no B, tudo no A''
    perc = []
    for bar in range(13, 21):
        perc += [[GM["bloco_agudo"], c(bar) + 1, 0.1, 40], [GM["bloco_agudo"], c(bar) + 3, 0.1, 44]]
    for bar in range(21, 29):
        perc += [[GM["cabasa"], c(bar) + i * 0.5, 0.1, 26 + (8 if i % 2 else 0)] for i in range(8)]
    for bar in range(29, 37):
        perc += [[GM["bloco_agudo"], c(bar) + 1, 0.1, 44], [GM["bloco_grave"], c(bar) + 3, 0.1, 46]]
        perc += [[GM["shaker"], c(bar) + i * 0.5, 0.1, 22 + (10 if i % 2 else 0)] for i in range(8)]
    perc += [[GM["bloco_agudo"], c(40) + 3, 0.1, 40], [GM["bloco_agudo"], c(40) + 3.5, 0.1, 46]]
    p.add("percussao_latina", perc)

    for papel, tj, vj in [("caixinha_de_musica", 0.012, 5), ("cordas_pizzicato", 0.012, 6), ("celesta", 0.01, 5),
                          ("marimba", 0.01, 6), ("percussao_latina", 0.008, 5)]:
        p.humanizar(papel, tj, vj)

    p.extra["modo"] = "loop"
    p.observacoes = """
Laço da tela de personalizar o boneco. Leve e brincalhão, mais baixo que o título (volume 0,4 no jogo); não pode cansar quem fica minutos escolhendo cabelo.
Forma: introdução 1–4 | A 5–12 (caixinha) | A' 13–20 (o pizzicato responde nas pausas da caixinha; blocos de madeira) | B 21–28 (Mi menor: o pizzicato canta, a caixinha responde no agudo, marimba anda com notas de passagem, cabasa) | A'' 29–36 (tema, contracanto do pizzicato, shaker) | final 37–40 (ecos do tema sobre Sol–Mi m7–Lá m7–Ré7, dois toques de bloco puxando a volta).
Laço: termina em Ré7 e volta à introdução em Sol; nenhuma nota passa do fim. Renderizar duas voltas e cortar a segunda.
Instrumentos: caixinha de música (Music Box), celesta no lugar do thumb piano (se a montagem deixar, trocar o preset da trilha por "Thumb Piano Tiny": o ostinato foi escrito para ele), marimba (Marimba Classic), pizzicato (o estudo indica violino solo pizzicato; o papel é o do ensemble), percussão latina baixinha (blocos 76/77, cabasa 69, shaker 82).
No Live: ostinato um pouco atrás da caixinha (−4 dB), marimba seca, reverb de sala curto.
""".strip()
    return p


if __name__ == "__main__":
    compor().salvar()
