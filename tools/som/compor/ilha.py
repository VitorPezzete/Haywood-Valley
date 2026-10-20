"""musica.ilha_manha, musica.ilha_dia, musica.ilha_tarde: "Maré mansa", a mesma peça em três luzes.

Fá maior com a quarta aumentada da escala lídia (Sol/Fá, Sol/Si: o "flutuar" da ilha), 92 BPM, 4/4, 52 compassos
(135,7 s), modo "breathe" (toca inteira, para, volta depois). As três versões têm o mesmo andamento, a mesma harmonia
compasso a compasso e o mesmo tema, para o fade de 8 s da troca de período soar como a mesma música mudando de luz.
Se um dia o `MusicController` começar a versão nova na mesma posição (`TimePosition`), a troca fica perfeita.

Forma: introdução 1–4 (Fá7M–Sol/Fá) | A 5–12 | A2 13–20 (fecha em Fá) | B 21–28 (Sib7M–Dó/Sib, sobe) |
ponte 29–36 (Mib7M–Sib/Ré: o sétimo grau abaixado, sol baixo) | A3 37–44 | coda 45–52 (ecos, Fá add9).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import (GM, Harmonia, Partitura, contorno, dinamica, figura, limpar, linha_baixo, linha_guia,  # noqa: E402
                 mel, rasgueado, sustentado, transpor, voz)

BPM = 92
COMPASSOS = 52
TOM = "Fá maior (com Si natural, lídio)"

HARM = (
    "Fmaj7 | G/F | Fmaj7 | G/F |"
    "Fmaj7 | C/E | Dm7 | Am7 | Bbmaj7 | F/A | Gm7 | C7sus4 C7 |"
    "Fmaj7 | C/E | Dm7 | Am7 | Bbmaj7 | G/B | Csus4 C | Fadd9 |"
    "Bbmaj7 | C/Bb | Am7 | Dm7 | Bbmaj7 | C/Bb | Dm7 | Gsus4 G |"
    "Ebmaj7 | Bb/D | Fmaj7/C | F | Ebmaj7 | Bb/D | Gm7 | C7sus4 C7 |"
    "Fmaj7 | C/E | Dm7 | Am7 | Bbmaj7 | G/B | Csus4 C | Fadd9 |"
    "Fmaj7 | G/F | Bbmaj7 | C/Bb | Am7 | Dm7 | Gm7 C7sus4 | Fadd9"
)

# ---------------------------------------------------------------- o tema, versão do dia (a mais articulada)
A_INI = ("A4:0.5 C5:0.5 E5:1 r:0.5 D5:0.5 C5:0.5 D5:0.5 | E5:1.5 G5:0.5 r:0.5 G4:0.5 C5:1 |"
         " F5:1 E5:0.5 D5:0.5 r:0.5 A4:0.5 C5:0.5 D5:0.5 | E5:2.5 r:0.5 Bb4:0.5 C5:0.5 |")
A_FIM1 = ("D5:0.5 F5:0.5 A5:1 r:0.5 G5:0.5 F5:0.5 G5:0.5 | A5:1.5 C6:0.5 r:0.5 C5:0.5 F5:1 |"
          " Bb5:1 A5:0.5 G5:0.5 r:0.5 D5:0.5 F5:0.5 G5:0.5 | F5:2 E5:1 F4:0.5 G4:0.5")
A_FIM2 = ("D5:0.5 F5:0.5 A5:1 r:0.5 Bb5:0.5 A5:0.5 G5:0.5 | B5:1.5 A5:0.5 r:0.5 G5:0.5 D5:1 |"
          " F5:1 G5:0.5 F5:0.5 E5:1 D5:0.5 E5:0.5 | F5:2.5 r:1.5")
A_FIM3 = ("D5:0.5 F5:0.5 A5:1 r:0.5 C6:0.5 Bb5:0.5 A5:0.5 | B5:1.5 D6:0.5 r:0.5 B5:0.5 G5:1 |"
          " F5:1 G5:0.5 F5:0.5 E5:1 G5:0.5 E5:0.5 | F5:2.5 r:1.5")
B = ("r:0.5 F5:0.5 A5:0.5 F5:0.5 D6:1 C6:1 | C6:1.5 Bb5:0.5 G5:1 E5:1 | A5:1 G5:0.5 E5:0.5 C5:1 E5:1 |"
     " F5:2 D5:1.5 r:0.5 | r:0.5 F5:0.5 A5:0.5 F5:0.5 D6:1 C6:1 | C6:1.5 D6:0.5 E6:2 | D6:1 C6:1 A5:1 F5:1 |"
     " G5:2 B5:2")
PONTE = ("G5:2 Bb5:2 | F5:3 D5:1 | E5:2 G5:1 A5:1 | A5:3 r:1 | G5:2 Bb5:1 D6:1 | C6:2 Bb5:1 F5:1 |"
         " G5:1.5 A5:0.5 Bb5:1 D6:1 |")
PONTE_FIM_PICK = " C6:2 Bb5:1.5 G4:0.5"
PONTE_FIM = " C6:2 Bb5:2"
CODA = ("A5:0.5 C6:0.5 E6:1 r:2 | D6:0.5 B5:0.5 G5:1 r:2 | A5:0.5 F5:0.5 D5:1 r:2 | G5:0.5 E5:0.5 C5:1 r:2 |"
        " E5:2 C5:2 | D5:2 F5:2 | Bb5:1 A5:1 G5:2 | F5:4")

# ---------------------------------------------------------------- o mesmo tema sem as notas de passagem (manhã, tarde)
M_A_INI = "A4:1 C5:1 E5:1.5 D5:0.5 | E5:2 G5:1 C5:1 | F5:1.5 E5:0.5 D5:2 | E5:3 r:1 |"
M_A_FIM1 = "D5:1 F5:1 A5:1.5 G5:0.5 | A5:2 C6:1 F5:1 | Bb5:1.5 A5:0.5 G5:2 | F5:2 E5:2"
M_A_FIM2 = "D5:1 F5:1 A5:1 Bb5:1 | B5:2 A5:1 G5:1 | F5:2 E5:2 | F5:4"
M_B = ("r:1 A5:1 D6:1 C6:1 | C6:2 G5:1 E5:1 | A5:1 E5:1 C5:2 | F5:2 D5:2 | r:1 A5:1 D6:1 C6:1 | C6:1 D6:1 E6:2 |"
       " D6:1 C6:1 A5:1 F5:1 | G5:2 B5:2")
M_CODA_1 = "A5:1 C6:1 E6:2 | D6:1 B5:1 G5:2"
M_CODA_2 = "A5:1 F5:1 D5:2 | G5:1 E5:1 C5:2"
M_CODA_3 = "E5:2 C5:2 | D5:2 F5:2 | Bb5:1 A5:1 G5:2 | F5:4"


def _m(texto: str, t0: float, vel: float, art: float = 0.92):
    notas, _ = mel(texto.replace("|", ""), t0, vel, art)
    return notas


def _base(chave: str, titulo: str, semente: int):
    p = Partitura(chave, titulo, BPM, (4, 4), TOM, COMPASSOS, False, 3.0, semente)
    h = Harmonia(HARM, p.tc)
    p.extra["modo"] = "breathe"
    p.extra["familia"] = "ilha"
    return p, h, p.c


def _acorde_final(h, t, lo, hi, n, vel, dur, rolado=0.0):
    vozes = voz(None, h.em(t + 1e-6), lo, hi, n)
    return [[a, t + i * rolado, dur - i * rolado, vel] for i, a in enumerate(vozes)]


# ======================================================================== manhã

def manha() -> Partitura:
    p, h, c = _base("musica.ilha_manha", "Maré mansa (manhã)", 5205)

    oboe = _m(M_A_INI + M_A_FIM1, c(5), 64, 0.97)
    oboe += _m(M_A_INI + M_A_FIM2, c(13), 68, 0.97)
    oboe += _m(PONTE + PONTE_FIM, c(29), 66, 0.98)
    oboe += _m(M_A_INI + M_A_FIM2, c(37), 72, 0.97)
    oboe += _m(M_CODA_1, c(45), 62, 0.97) + _m(M_CODA_3, c(49), 60, 0.98)
    oboe = dinamica(contorno(oboe, 0.6), [(c(45), 1.0), (c(52) + 4, 0.8)])
    p.add("oboe", oboe)

    # harpa: arpejo que sobe e desce; no B, a melodia no agudo e o arpejo mais ralo por baixo
    fig = [(0, "R", 3.5, 0.9), (0.5, "0", 1.5, 0.6), (1, "1", 1.5, 0.62), (1.5, "2", 1.5, 0.66),
           (2, "3", 1.5, 0.7), (2.5, "2", 1.2, 0.6), (3, "1", 1.2, 0.58), (3.5, "0", 0.5, 0.52)]
    fig_rala = [(0, "R", 3, 0.85), (1, "0", 1.5, 0.55), (2, "1", 1.5, 0.55), (3, "2", 1, 0.5)]
    harpa = figura(h, 0, c(21), p.tc, fig, 53, 77, 4, 41, 53, 62)
    harpa += figura(h, c(21), c(29), p.tc, fig_rala, 53, 70, 3, 41, 53, 56)
    harpa += figura(h, c(29), c(45), p.tc, fig, 53, 77, 4, 41, 53, 64)
    harpa += figura(h, c(45), c(52), p.tc, fig_rala, 53, 72, 3, 41, 53, 56)
    harpa = dinamica(harpa, [(0, 0.85), (c(5), 0.9), (c(13), 1.0), (c(37), 1.05), (c(45), 0.95), (c(52), 0.8)])
    melodia_harpa = contorno(_m(M_B, c(21), 70, 1.0), 0.5) + contorno(_m(M_CODA_2, c(47), 60, 1.0), 0.4)
    final = _acorde_final(h, c(52), 41, 77, 6, 52, 4, rolado=0.12)
    canto = oboe + melodia_harpa
    p.add("harpa", limpar(harpa, canto) + melodia_harpa + final)

    # vibrafone: acordes longos com pedal, fora do primeiro A (fica mais vazio)
    vib = sustentado(h, c(3), c(5), 60, 76, 3, 40) + sustentado(h, c(13), c(52), 60, 76, 3, 42)
    vib += _acorde_final(h, c(52), 60, 76, 3, 36, 4)
    vib = dinamica(vib, [(c(13), 0.9), (c(21), 1.0), (c(29), 1.05), (c(45), 0.95), (c(52), 0.85)])
    vib = limpar(limpar(vib, canto), harpa)
    p.add("vibrafone", vib)

    # pad: cama quase inaudível (some atrás do ambiente)
    pad = sustentado(h, 0, c(52), 55, 72, 3, 32) + _acorde_final(h, c(52), 55, 72, 3, 28, 4)
    pad = dinamica(pad, [(0, 0.8), (c(13), 1.0), (c(29), 1.15), (c(37), 1.0), (c(52), 0.8)])
    p.add("pad_quente", limpar(pad, canto + harpa + vib))

    for papel, tj, vj in [("oboe", 0.015, 4), ("harpa", 0.015, 6), ("vibrafone", 0.02, 4), ("pad_quente", 0.0, 2)]:
        p.humanizar(papel, tj, vj)
    p.observacoes = """
Manhã na ilha (5h às 8h): esparsa e calma, o sol nascendo sobre o mar. Mesma peça das versões dia e tarde (mesmos 92 BPM, harmonia e compassos), em outra luz.
Forma: introdução 1–4 (harpa e cama; vibrafone no 3) | A 5–12 (oboé sozinho com a harpa) | A2 13–20 (entra o vibrafone) | B 21–28 (o oboé respira, a harpa canta no agudo) | ponte 29–36 (oboé em notas longas sobre Mib7M–Sib/Ré) | A3 37–44 | coda 45–52 (oboé, a harpa responde nos compassos 47–48, acorde final rolado em Fá add9).
Começo e fim musicais (modo "breathe": toca uma vez, some nos últimos 4 s e o ambiente fica sozinho de 1 a 3 min). Cauda de 3 s para o último acorde.
Instrumentos: oboé solo legato (ou clarinete, mais escuro), harpa (Tension "Harp Soft"), vibrafone com pedal (notas longas; motor desligado ou bem lento), pad (Sea Pad) muito baixo.
No Live: vibrafone e pad 6–8 dB abaixo; reverb de sala grande e úmida; nada de graves pesados (o mar do ambiente já ocupa o grave).
""".strip()
    return p


# ======================================================================== dia

def dia() -> Partitura:
    p, h, c = _base("musica.ilha_dia", "Maré mansa (dia)", 5206)

    fl = _m("F4:0.5 G4:0.5", c(4) + 3, 72)
    fl += _m(A_INI + A_FIM1, c(5), 80, 0.82)
    fl += _m(A_INI + A_FIM2, c(13), 82, 0.85)
    fl += _m(B, c(21), 86, 0.92)
    fl += _m(PONTE + PONTE_FIM_PICK, c(29), 74, 0.98)
    fl += _m(A_INI + A_FIM3, c(37), 88, 0.85)
    fl += _m(CODA, c(45), 76, 0.9)
    fl = dinamica(contorno(fl, 0.6), [(c(45), 1.0), (c(52) + 4, 0.78)])
    p.add("flauta", fl)

    # marimba: o riff 3+3+2 (o balanço da ilha); na ponte, rufos lentos; na coda, só o esqueleto
    riff = [(0, "0", 0.4, 0.9), (0.75, "1", 0.4, 0.7), (1.5, "2", 0.4, 0.75), (2, "1", 0.4, 0.8),
            (2.75, "2", 0.4, 0.7), (3.5, "0", 0.4, 0.65)]
    esqueleto = [(0, "0", 0.4, 0.85), (1.5, "2", 0.4, 0.7), (2.75, "1", 0.4, 0.65)]
    mar = figura(h, 0, c(29), p.tc, riff, 57, 72, 3, vel=66)
    rufos = []
    for a, d, ac in h.trechos:
        if c(29) <= a < c(37):
            vz = voz(None, ac, 60, 74, 2)
            k = 0
            while k * 0.25 < d - 0.01:
                rufos.append([vz[k % 2], a + k * 0.25, 0.22, 34 + (6 if k % 4 == 0 else 0)])
                k += 1
    mar += rufos
    mar += figura(h, c(37), c(45), p.tc, riff, 57, 72, 3, vel=70)
    mar += figura(h, c(45), c(52), p.tc, esqueleto, 57, 72, 3, vel=58)
    mar += _acorde_final(h, c(52), 57, 72, 3, 50, 2)
    mar = dinamica(mar, [(0, 0.9), (c(5), 0.95), (c(21), 1.05), (c(37), 1.08), (c(45), 0.9), (c(52), 0.8)])

    # violão: "bum, tchi-ca" (baixo e rasgueado); ponte em meio tempo
    vio = []
    vz = None
    for bar in range(3, COMPASSOS + 1):
        t = c(bar)
        meio = 29 <= bar <= 36
        golpes = [(0, "R"), (2, "S")] if meio else [(0, "R"), (1, "S"), (1.5, "s"), (2, "F"), (3, "S"), (3.5, "s")]
        if bar == COMPASSOS:
            golpes = [(0, "R"), (0, "S")]
        for pos, g in golpes:
            ac = h.em(t + pos + 1e-6)
            vz = voz(vz, ac, 52, 71, 4)
            fim_ac = next(a + d for a, d, x in h.trechos if x is ac)
            if g in "RF":
                alt = ac.baixo if g == "R" else ac.pc(5)
                b = min((x for x in range(40, 53) if x % 12 == alt), key=lambda x: abs(x - 45))
                vio.append([b, t + pos, min(0.9, fim_ac - t - pos), 70])
            else:
                dur = 4 if bar == COMPASSOS else (1.8 if meio else 0.4)
                vio += rasgueado(vz, t + pos, min(dur, fim_ac - t - pos), 62 if g == "S" else 46, g == "S")
    vio = dinamica(vio, [(c(3), 0.85), (c(5), 0.95), (c(21), 1.05), (c(29), 0.85), (c(37), 1.05), (c(45), 0.9)])

    canto = fl
    p.add("marimba", limpar(mar, canto))
    p.add("violao", limpar(vio, canto))

    # contrabaixo em pizzicato: sincopado, com nota de aproximação no fim do compasso
    ritmo = [(0, "R", 1.2, 1.0), (1.5, "F", 0.45, 0.7), (2, "R", 0.9, 0.85), (3.5, "A", 0.45, 0.72)]
    meio_tempo = [(0, "R", 1.9, 0.9), (2, "F", 1.9, 0.8)]
    cb = linha_baixo(h, c(5), c(29), p.tc, ritmo, 31, 50, 76)
    cb += linha_baixo(h, c(29), c(37), p.tc, meio_tempo, 31, 50, 70)
    cb += linha_baixo(h, c(37), c(52), p.tc, ritmo, 31, 50, 78)
    cb += [[41, c(52), 3.5, 70]]
    cb = dinamica(cb, [(c(45), 1.0), (c(52), 0.85)])
    p.add("contrabaixo", cb)

    # percussão leve: shaker em colcheias, conga discreta, claves marcando as partes, bongô no B
    perc = []
    for bar in range(3, COMPASSOS):
        t = c(bar)
        meio = 29 <= bar <= 36
        coda = bar >= 45
        sh = 22 if coda else 26
        perc += [[GM["shaker"], t + i * 0.5, 0.1, sh + (12 if i % 2 else 0)] for i in range(8)]
        if 5 <= bar and not meio and not coda:
            perc += [[GM["conga_abafada"], t + 1, 0.15, 44], [GM["conga_aberta"], t + 2.5, 0.2, 52],
                     [GM["conga_aberta"], t + 3, 0.2, 48], [GM["conga_grave"], t + 3.5, 0.25, 50]]
        if 21 <= bar <= 28:
            perc += [[GM["bongo_agudo"], t + 0.5 + i, 0.1, 34] for i in range(4)]
        if meio and bar % 2 == 1:
            perc += [[GM["conga_grave"], t, 0.3, 40]]
    for bar in (5, 13, 21, 29, 37, 45):
        perc.append([GM["claves"], c(bar), 0.1, 52])
    perc.append([GM["triangulo"], c(52), 1.5, 40])
    perc = dinamica(perc, [(c(3), 0.8), (c(5), 1.0), (c(45), 0.9), (c(51), 0.7)])
    p.add("percussao_latina", perc)

    for papel, tj, vj in [("flauta", 0.012, 5), ("marimba", 0.008, 6), ("violao", 0.008, 5),
                          ("contrabaixo", 0.01, 5), ("percussao_latina", 0.008, 6)]:
        p.humanizar(papel, tj, vj)
    p.observacoes = """
Dia na ilha (8h às 17h): a versão mais animada, pulso de trabalho, sem pressa. Mesma peça das versões manhã e tarde.
Forma: introdução 1–4 (riff de marimba; violão e shaker no 3) | A 5–12 (flauta articulada; entra o contrabaixo e a conga) | A2 13–20 | B 21–28 (flauta mais alta e ligada, bongô) | ponte 29–36 (meio tempo: flauta longa, marimba em rufos, violão só no 1 e no 3) | A3 37–44 (a variação mais alta, Si natural no 42) | coda 45–52 (ecos da flauta, riff só no esqueleto, triângulo no último acorde).
O riff da marimba é 3+3+2 (colcheia pontuada, colcheia pontuada, colcheia): o balanço de ilha, sem bateria. Modo "breathe", cauda de 3 s.
Instrumentos: flauta solo staccato no A e legato no B e na ponte (o estudo indica "Concert Flute Solo Staccato"), marimba, violão no lugar do banjo/aço (se a montagem deixar, "Steel Picked Guitar" ou "Banjo" do Tension soam mais de ilha), contrabaixo em pizzicato ("Double Bass Solo Pizzicato"), percussão latina baixa (shaker 82, congas 62/63/64, bongô 60, claves 75, triângulo 81).
No Live: percussão 8–10 dB abaixo da flauta; um toque de steel pan dobrando a marimba no B ficaria bem (Steel Pan.adg), se houver uma trilha livre.
""".strip()
    return p


# ======================================================================== tarde

def tarde() -> Partitura:
    p, h, c = _base("musica.ilha_tarde", "Maré mansa (tarde)", 5207)

    cl = _m("G4:1", c(4) + 3, 60, 0.98)
    cl += _m(M_A_INI + M_A_FIM1, c(5), 70, 1.0)
    cl += _m(M_A_INI + M_A_FIM2, c(13), 72, 1.0)
    cl = transpor(cl, -12)
    cl += _m(M_B, c(21), 76, 1.0)
    cl3 = _m(M_A_INI + M_A_FIM2, c(37), 74, 1.0) + _m(" ".join([M_CODA_1, M_CODA_2, M_CODA_3]), c(45), 66, 1.0)
    cl += transpor(cl3, -12)
    cl = dinamica(contorno(cl, 0.7), [(c(45), 1.0), (c(52) + 4, 0.78)])
    p.add("clarinete", cl)

    # trompa: a ponte (uma oitava abaixo da flauta do dia) e notas longas no fim
    tp = transpor(_m(PONTE + PONTE_FIM, c(29), 70, 1.0), -12)
    tp += _m("C5:4 A4:4 D5:2 C5:2 A4:4", c(49), 50, 0.98)
    tp = dinamica(tp, [(c(29), 0.9), (c(33), 1.05), (c(36), 0.9), (c(49), 1.0), (c(52) + 4, 0.75)])
    p.add("trompa", tp)

    canto = cl + tp

    # violão: arpejo lento (semínimas e colcheias), deixando soar
    fig = [(0, "R", 2.5, 0.9), (1, "0", 2.0, 0.6), (1.5, "1", 1.5, 0.55), (2, "2", 1.5, 0.62), (3, "1", 1.0, 0.5)]
    vio = figura(h, 0, c(52), p.tc, fig, 55, 72, 3, 40, 52, 64)
    vio += _acorde_final(h, c(52), 40, 71, 5, 54, 4, rolado=0.1)
    vio = dinamica(vio, [(0, 0.9), (c(13), 1.0), (c(29), 0.9), (c(37), 1.0), (c(45), 0.9), (c(52), 0.8)])
    p.add("violao", limpar(vio, canto))

    # violoncelo: baixo cantado; na ponte, a linha de terças e sétimas contra a trompa
    ritmo = [(0, "R", 1.9, 1.0), (2, "F", 1.4, 0.8), (3.5, "A", 0.45, 0.72)]
    vc = [[53, c(3), 3.9, 52], [55, c(4), 3.9, 54]]
    vc += linha_baixo(h, c(5), c(29), p.tc, ritmo, 36, 55, 68)
    vc += linha_guia(h, c(29), c(37), 53, 65, 62, inicio=57)
    vc += linha_baixo(h, c(37), c(45), p.tc, ritmo, 36, 55, 70)
    vc += linha_baixo(h, c(45), c(52), p.tc, [(0, "R", 3.9, 0.9)], 36, 55, 60)
    vc += [[41, c(52), 3.9, 54]]
    p.add("violoncelo", limpar(vc, canto))

    # cordas: cama quente a partir do A3
    cordas = sustentado(h, c(37), c(52), 55, 72, 3, 38) + _acorde_final(h, c(52), 55, 72, 3, 34, 4)
    cordas = dinamica(cordas, [(c(37), 0.85), (c(41), 1.0), (c(48), 1.0), (c(52), 0.8)])
    p.add("cordas_legato", limpar(cordas, canto))

    for papel, tj, vj in [("clarinete", 0.018, 4), ("trompa", 0.02, 4), ("violao", 0.015, 6),
                          ("violoncelo", 0.015, 4), ("cordas_legato", 0.02, 3)]:
        p.humanizar(papel, tj, vj)
    p.observacoes = """
Tarde na ilha (17h às 19h): quente, fim do dia, parece mais lenta. Mesma peça das versões manhã e dia, mesmos 92 BPM: a lentidão vem do acompanhamento em meio tempo (arpejo de semínimas, baixo em mínimas) e da melodia uma oitava abaixo, no registro grave do clarinete.
Forma: introdução 1–4 (violão; violoncelo no 3) | A 5–12 e A2 13–20 (clarinete no grave) | B 21–28 (o clarinete sobe à oitava original) | ponte 29–36 (a trompa canta, o violoncelo responde com terças e sétimas) | A3 37–44 (entram as cordas) | coda 45–52 (clarinete, trompa em notas longas, acorde final rolado).
Modo "breathe", cauda de 3 s.
Instrumentos: clarinete solo legato com vibrato, violoncelo solo legato, trompa solo legato, violão de náilon (Tension), cordas legato bem baixas.
No Live: o clarinete grave pode embolar com o violoncelo; se embolar, cortar 200–300 Hz no violoncelo. Trompa com reverb mais longo que o resto.
""".strip()
    return p


def todas() -> list[Partitura]:
    return [manha(), dia(), tarde()]


if __name__ == "__main__":
    for p in todas():
        p.salvar()
