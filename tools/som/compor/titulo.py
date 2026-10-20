"""musica.titulo: "O vale acorda". Ré maior, 96 BPM, 4/4, 32 compassos em laço (80 s).

Forma: introdução (1–4, violão e pizzicato, brilho do glockenspiel) | A (5–12, flauta) | B (13–20, a trompa canta,
a flauta responde em cima, cordas entram) | A' (21–28, flauta com o glockenspiel dobrando, clímax no compasso 26) |
volta (29–32, desce até Mi m7–Lá7 e emenda na introdução).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import Harmonia, Partitura, contorno, dinamica, figura, limpar, mel, sustentado, transpor


def compor() -> Partitura:
    p = Partitura("musica.titulo", "O vale acorda", 96, (4, 4), "Ré maior", 32, True, 0.0, semente=9601)
    c = p.c
    h = Harmonia(
        "Dmaj7 | G/D | Dmaj7 | A7sus4 A7 |"
        "D | Bm7 | Gmaj7 | A | D/F# | G | Em7 A7 | D |"
        "Bm | F#m7 | Gmaj7 | D/F# | Em7 | Bm7 | Gmaj7 | Asus4 A |"
        "D | Bm7 | Gmaj7 | A | D/F# | G | Em7 A7 | D |"
        "Gmaj7 | A/G | F#m7 Bm7 | Em7 A7",
        p.tc,
    )

    # ------------------------------------------------ flauta: tema A, contracanto do B, tema A', volta
    anac, _ = mel("A4:0.5 B4:0.5", c(4) + 3, 74)
    tema_a, _ = mel(
        "D5:1.5 C#5:0.5 D5:1 F#5:1 | A5:2 F#5:1 D5:1 | E5:1.5 F#5:0.5 G5:1 F#5:0.5 E5:0.5 |"
        " E5:3 A4:0.5 B4:0.5 | D5:1.5 C#5:0.5 D5:1 A5:1 | B5:2> A5:1 G5:1 |"
        " F#5:1 G5:0.5 F#5:0.5 E5:1 C#5:1 | D5:3 r:1".replace("|", ""),
        c(5), 80, art=0.95,
    )
    contra_b, _ = mel(
        "r:4 r:2 E6:1 C#6:1 D6:2 r:2 r:2 A5:1 D6:1 r:2 B5:2 A5:2 r:2 r:2 B5:1 C#6:1"
        " E6:1 D6:1 C#6:1 A4:0.5 B4:0.5",
        c(13), 62, art=0.97,
    )
    tema_a2, _ = mel(
        "D5:1.5 C#5:0.5 D5:1 F#5:1 A5:1.5 B5:0.5 A5:1 F#5:1 E5:1.5 F#5:0.5 G5:1 A5:0.5 B5:0.5"
        " C#6:1.5> B5:0.5 A5:1 A4:0.5 B4:0.5 D5:1.5 C#5:0.5 D5:1 A5:1 D6:2> B5:1 G5:1"
        " F#5:1 G5:0.5 F#5:0.5 E5:1 C#5:1 D5:2 r:2",
        c(21), 86, art=0.95,
    )
    volta, _ = mel("D6:1.5 C#6:0.5 B5:1 A5:1 G5:1.5 A5:0.5 E5:2 F#5:2 D5:2 E5:2 G5:1 C#5:1", c(29), 70, art=0.97)
    flauta = contorno(anac + tema_a, 0.6) + contorno(contra_b, 0.4) + contorno(tema_a2, 0.6) + contorno(volta, 0.4)
    flauta = dinamica(flauta, [(c(29), 1.0), (c(32) + 4, 0.8)])
    p.add("flauta", flauta)

    # ------------------------------------------------ trompa: a melodia do B, notas longas no fim do A' e na volta
    trompa_b, _ = mel(
        "F#4:1.5 G4:0.5 A4:1 B4:1 C#5:1.5 B4:0.5 A4:2 B4:1.5 A4:0.5 G4:1 F#4:1 A4:3 r:1"
        " G4:1.5 A4:0.5 B4:1 D5:1 D5:2> B4:1 A4:1 B4:1.5 C#5:0.5 D5:1 E5:1 D5:2 C#5:2",
        c(13), 78, art=0.98,
    )
    trompa_fim, _ = mel("F#4:4 G4:2 B4:2 B4:2 A4:2 F#4:4 B4:4 A4:2 C#5:2 A4:2 F#4:2 G4:3.5", c(25), 56, art=0.97)
    p.add("trompa", contorno(trompa_b, 0.7) + dinamica(trompa_fim, [(c(25), 0.9), (c(28), 1.0), (c(32), 0.8)]))

    # ------------------------------------------------ violão: dedilhado em colcheias o tempo todo
    fig_violao = [(0, "R", 2, 1.0), (0.5, "0", 1.0, 0.72), (1, "1", 1.0, 0.78), (1.5, "2", 1.0, 0.72),
                  (2, "F", 2, 0.9), (2.5, "1", 1.0, 0.7), (3, "2", 1.0, 0.75), (3.5, "0", 0.5, 0.66)]
    violao = figura(h, 0, p.total, p.tc, fig_violao, 55, 74, 3, 40, 52, 70)
    violao = dinamica(violao, [(0, 0.85), (c(5), 0.9), (c(13), 0.8), (c(21), 1.0), (c(29), 0.9), (c(32) + 4, 0.8)])
    canto = flauta + trompa_b + trompa_fim
    p.add("violao", limpar(violao, canto))

    # ------------------------------------------------ pizzicato: entra no compasso 3, saltitante ("um-pá")
    fig_pizz = [(0, "R", 0.5, 1.0), (1, "0", 0.4, 0.75), (1, "1", 0.4, 0.7), (2, "F", 0.5, 0.85),
                (3, "0", 0.4, 0.75), (3, "1", 0.4, 0.7), (3.5, "1", 0.3, 0.55)]
    fig_pizz_b = [(0, "R", 0.5, 1.0), (1, "0", 0.4, 0.7), (2, "1", 0.4, 0.75), (3, "2", 0.4, 0.7)]
    pizz = figura(h, c(3), c(13), p.tc, fig_pizz, 55, 69, 2, 38, 50, 68)
    pizz += figura(h, c(13), c(21), p.tc, fig_pizz_b, 57, 74, 3, 38, 50, 60)
    pizz += figura(h, c(21), c(29), p.tc, fig_pizz, 55, 69, 2, 38, 50, 74)
    pizz += figura(h, c(29), p.total, p.tc, fig_pizz_b, 57, 74, 3, 38, 50, 62)
    p.add("cordas_pizzicato", limpar(pizz, canto))

    # ------------------------------------------------ cordas ligadas: cama no B, no A' e na volta
    cordas = sustentado(h, c(13), c(21), 54, 74, 3, 48) + sustentado(h, c(21), p.total, 54, 76, 3, 54)
    cordas = dinamica(cordas, [(c(13), 0.8), (c(17), 1.0), (c(21), 0.95), (c(28), 1.05), (c(32), 0.75)])
    p.add("cordas_legato", limpar(cordas, canto))

    # ------------------------------------------------ glockenspiel: brilho na introdução, dobra o A', eco na volta
    glock, _ = mel("r:2 A6:1 F#6:1 r:4 r:2 F#6:1 A6:1 r:2 E7:1 C#7:1", c(1), 54)
    dobra = [n for n in transpor(tema_a2, 12) if n[1] < c(25)]
    glock += [[n[0], n[1], 0.5, n[3] * 0.62] for n in dobra]
    eco, _ = mel("D7:1.5 C#7:0.5 B6:1 A6:1", c(29), 46)
    glock += eco
    p.add("glockenspiel", glock)

    for papel, tj, vj in [("flauta", 0.015, 5), ("trompa", 0.02, 5), ("violao", 0.012, 6),
                          ("cordas_pizzicato", 0.01, 6), ("cordas_legato", 0.02, 4), ("glockenspiel", 0.01, 5)]:
        p.humanizar(papel, tj, vj)

    p.extra["modo"] = "loop"
    p.observacoes = """
Laço da tela de título (a vila com a fazenda na diagonal, câmera passeando). Acolhedor, de abertura de jogo, sem pressa.
Forma: introdução 1–4 (violão, pizzicato a partir do 3, glockenspiel) | A 5–12 (flauta) | B 13–20 (trompa canta, flauta responde em sextas, cordas por baixo) | A' 21–28 (flauta e glockenspiel, clímax em Ré6 no compasso 26) | volta 29–32 (Sol7M–Lá/Sol–Fá#m7 Si m7–Mi m7 Lá7) que cai na introdução.
O laço fecha no compasso 32: nenhuma nota passa do fim; a volta termina em Lá7 e a introdução abre em Ré7M. Renderizar duas voltas e cortar a segunda (a cauda do reverb fica no começo).
Instrumentos: flauta solo legato com vibrato; trompa solo legato (só no B e notas longas no fim); violão de náilon (Tension) dedilhado; cordas em pizzicato (ensemble); cordas legato bem baixas; glockenspiel.
No Live: reverb "Wooden Hall"; cordas legato 4–6 dB abaixo do resto; glockenspiel com pouco ataque. A trompa pode parecer "abertura demais": se pesar, trocar por clarinete na mesma trilha.
""".strip()
    return p


if __name__ == "__main__":
    compor().salvar()
