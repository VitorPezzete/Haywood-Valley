"""musica.vila: "Dia de feira". Dó maior, 108 BPM, 4/4, 32 compassos em laço (71,1 s). Leva de 2026-10-23.

A vila e o mercado de dia: mais saltitante que o título (que é a mesma vila vista de longe, de manhã), no clima da
ilha de dia (marimba, violão, percussão latina leve, sem bateria).

Forma: introdução (1–4, marimba no contratempo, violão, pizzicato no baixo) | A (5–12, a flauta canta o tema) |
A' (13–20, o clarinete repete o tema e a flauta responde em notas longas; desvio para Mi m e Lá7) | B (21–28, a
flauta canta mais ligado, o clarinete segura por baixo) | volta (29–32, a flauta sobe ao Fá agudo com o
glockenspiel dobrando e desce pelo Sol7 até a introdução).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import GM, Harmonia, Partitura, contorno, dinamica, figura, limpar, linha_baixo, mel, transpor


def compor() -> Partitura:
    p = Partitura("musica.vila", "Dia de feira", 108, (4, 4), "Dó maior", 32, True, 0.0, semente=10801)
    c = p.c
    h = Harmonia(
        "C | F/C | C | G7sus4 G7 |"
        "C | Am7 | F | G7 | C/E | F | Dm7 G7 | C |"
        "C | Am7 | F | G7 | Em7 | A7 | Dm7 G7 | C |"
        "F | G | Em7 | Am | Dm7 | G7 | Em7 A7 | Dm7 G7 |"
        "C | F | C/G | G7",
        p.tc,
    )

    # ------------------------------------------------ o tema (A), na flauta; no A' vai para o clarinete
    tema = ("G4:0.5 C5:0.5 E5:0.5 G5:0.5 E5:1 C5:1 "
            "A4:0.5 C5:0.5 E5:0.5 A5:0.5 G5:1 E5:1 "
            "F5:0.5 E5:0.5 F5:0.5 A5:0.5 C6:1.5> A5:0.5 "
            "G5:1 F5:0.5 D5:0.5 B4:1 G4:1 ")
    fim_a = ("E5:0.5 G5:0.5 C6:0.5 G5:0.5 E5:0.5 G5:0.5 C6:1> "
             "A5:1 F5:0.5 A5:0.5 C6:1 A5:1 "
             "D5:0.5 F5:0.5 A5:1 G5:0.5 F5:0.5 D5:1 "
             "C5:2 r:2")
    fim_a2 = ("G5:0.5 E5:0.5 B4:0.5 E5:0.5 G5:1 B5:1 "
              "A5:0.5 G5:0.5 E5:0.5 C#5:0.5 E5:1 A5:1 "
              "F5:0.5 E5:0.5 D5:1 B4:0.5 C5:0.5 D5:1 "
              "C5:3 r:1")
    a, _ = mel(tema + fim_a, c(5), 80, art=0.9)
    a2, _ = mel(tema + fim_a2, c(13), 78, art=0.92)
    b, _ = mel("A5:1.5 G5:0.5 F5:1 C5:1 D5:1.5 E5:0.5 G5:1 B5:1 B5:1.5 A5:0.5 G5:1 E5:1 A5:2 E5:1 C5:1 "
               "F5:1.5 E5:0.5 D5:1 A5:1 G5:1.5 F5:0.5 D5:1 B4:1 E5:1 G5:1 C#5:1 E5:1 F5:1 A5:1 G5:1 F5:0.5 D5:0.5",
               c(21), 76, art=0.97)
    volta, _ = mel("E5:1 G5:1 C6:2 A5:1 C6:1 F6:2> E6:1 D6:1 C6:1 G5:1 F5:1 D5:1 B4:1 G4:1", c(29), 82, art=0.93)
    resposta, _ = mel("r:4 r:4 A5:2 C6:2 B5:2 G5:2 B5:4 C#6:2 E6:2 D6:2 B5:2 C6:3 r:1", c(13), 60, art=0.97)
    flauta = contorno(a, 0.6) + contorno(resposta, 0.4) + contorno(b, 0.5) + contorno(volta, 0.6)
    flauta = dinamica(flauta, [(c(21), 0.95), (c(25), 1.05), (c(29), 1.0), (c(32) + 4, 0.85)])
    p.add("flauta", flauta)

    segura, _ = mel("C5:4 B4:4 B4:4 C5:4 A4:4 B4:4 B4:2 C#5:2 A4:2 B4:2", c(21), 54, art=0.97)
    clarinete = contorno(a2, 0.5) + segura
    p.add("clarinete", clarinete)
    canto = flauta + clarinete

    # ------------------------------------------------ marimba: acordes no contratempo (o balanço da feira)
    fig_marimba = [(0.5, "0", 0.25, 0.8), (0.5, "1", 0.25, 0.75), (1.5, "0", 0.25, 0.7), (1.5, "1", 0.25, 0.66),
                   (2.5, "0", 0.25, 0.8), (2.5, "1", 0.25, 0.75), (3.25, "1", 0.2, 0.55), (3.5, "0", 0.25, 0.7),
                   (3.5, "1", 0.25, 0.66)]
    marimba = figura(h, 0, p.total, p.tc, fig_marimba, 64, 79, 2, 40, 52, 62)
    marimba = dinamica(marimba, [(0, 1.05), (c(5), 0.9), (c(21), 0.8), (c(29), 1.0)])
    p.add("marimba", limpar(marimba, canto))

    # ------------------------------------------------ violão: "bum, tchi-ca" (o papel do banjo da ilha de dia)
    fig_violao = [(0, "R", 1.0, 1.0), (1, "0", 0.4, 0.7), (1, "1", 0.4, 0.7), (1, "2", 0.4, 0.7),
                  (1.5, "1", 0.3, 0.55), (1.5, "2", 0.3, 0.55), (2, "F", 1.0, 0.9),
                  (3, "0", 0.4, 0.7), (3, "1", 0.4, 0.7), (3, "2", 0.4, 0.7), (3.5, "2", 0.3, 0.5)]
    violao = figura(h, 0, p.total, p.tc, fig_violao, 52, 69, 3, 40, 52, 66)
    p.add("violao", limpar(violao, canto))

    # ------------------------------------------------ baixo em pizzicato: raiz, quinta e nota de passagem
    baixo = linha_baixo(h, 0, p.total, p.tc, [(0, "R", 0.6, 1.0), (2, "F", 0.6, 0.85), (3.5, "A", 0.35, 0.7)],
                        36, 52, 72)
    p.add("cordas_pizzicato", baixo)

    # ------------------------------------------------ percussão latina leve, a partir do tema
    perc = []
    for k in range(4, 32):
        t0 = c(k + 1)
        for i in range(8):
            perc.append([GM["shaker"], t0 + i * 0.5, 0.2, 34 if i % 2 == 0 else 24])
        perc += [[GM["conga_grave"], t0, 0.3, 46], [GM["bongo_agudo"], t0 + 1, 0.2, 40],
                 [GM["conga_aberta"], t0 + 2.5, 0.3, 44], [GM["bongo_agudo"], t0 + 3, 0.2, 38]]
        if k % 4 == 3:
            perc.append([GM["bongo_grave"], t0 + 3.5, 0.2, 40])
    perc = dinamica(perc, [(c(5), 0.9), (c(21), 0.8), (c(29), 1.0)])
    p.add("percussao_latina", perc)

    # ------------------------------------------------ glockenspiel: um brilho na introdução, dobra a volta
    glock, _ = mel("r:2 G6:1 E6:1 r:4 r:2 C7:1 G6:1 r:2 B6:1 D7:1", c(1), 50)
    glock += [[n[0], n[1], 0.5, n[3] * 0.6] for n in transpor(volta, 12) if n[1] < c(31)]
    p.add("glockenspiel", glock)

    for papel, tj, vj in [("flauta", 0.015, 5), ("clarinete", 0.015, 5), ("marimba", 0.01, 5),
                          ("violao", 0.012, 6), ("cordas_pizzicato", 0.01, 5), ("percussao_latina", 0.012, 5),
                          ("glockenspiel", 0.01, 4)]:
        p.humanizar(papel, tj, vj)

    p.extra["modo"] = "loop"
    p.observacoes = """
Laço da vila e do mercado de dia ("Dia de feira"). Mais saltitante que o título; no clima da ilha de dia, sem bateria.
Forma: introdução 1–4 (marimba no contratempo, violão "bum, tchi-ca", pizzicato no baixo, glockenspiel) | A 5–12 (flauta, o tema) | A' 13–20 (clarinete com o tema, a flauta responde em notas longas; Mi m7–Lá7 no lugar do Dó/Mi–Fá) | B 21–28 (flauta ligada, clarinete segurando por baixo, Fá–Sol–Mi m–Lá m) | volta 29–32 (a flauta sobe ao Fá6 com o glockenspiel dobrando e desce pelo Sol7).
O laço fecha no compasso 32 (Sol7 → Dó da introdução); nenhuma nota passa do fim.
À noite o mercado fecha: a vila fica só com o ambiente (MUSIC_PLACES.vila não tem a noite).
""".strip()
    return p


if __name__ == "__main__":
    compor().salvar()
