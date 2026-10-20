"""musica.sala_dia e musica.sala_noite: "Chá na janela", a mesma valsa de casa de dia e de noite.

Mib maior, 3/4, 88 BPM, 60 compassos (122,7 s), modo "breathe". As duas versões têm o mesmo andamento, a mesma
harmonia e a mesma forma (a troca dia/noite é um fade de 8 s).

Forma: introdução 1–4 | A 5–20 (o tema da casa; o Láb m6 do compasso 18 é a nota de saudade) | B 21–36 (vai para
Láb maior e cita o tema do título, "O vale acorda", adaptado a 3/4: a casa lembra o vale) | A' 37–52 | coda 53–60.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import (Harmonia, Partitura, contorno, dinamica, figura, limpar, linha_guia, mel,  # noqa: E402
                 segunda_voz, simplificar, sustentado, transpor, voz)

BPM = 88
COMPASSOS = 60
TOM = "Mi bemol maior (B em Lá bemol maior)"

A_HARM = ("Eb | Bb/D | Cm7 | Gm/Bb | Abmaj7 | Eb/G | Fm7 | Bb7 |"
          "Eb | Bb/D | Cm7 | Eb7 | Abmaj7 | Abm6 | Fm7:2 Bb7:1 | Eb |")
HARM = (
    "Ebmaj7 | Abmaj7/Eb | Ebmaj7 | Bb7sus4 |" + A_HARM +
    "Ab | Fm7 | Dbmaj7 | Eb | Ab/C | Db | Bbm7:2 Eb7:1 | Ab |"
    "Dbmaj7 | Cm7 | Bbm7 | Eb7 | Abmaj7 | Abm6 | Eb/Bb | Bb7 |" + A_HARM +
    "Abmaj7 | Abm6 | Eb/G | Cm7 | Fm7 | Bb7sus4 | Ebmaj7 | Ebmaj9"
)

A_MEL = ("Eb5:1.5 F5:0.5 G5:1 | F5:2 D5:1 | Eb5:1.5 D5:0.5 C5:1 | D5:2 Bb4:1 |"
         " C5:1 Eb5:1 G5:1 | Bb5:2 G5:1 | Ab5:1 G5:1 F5:1 | F5:2 Bb4:1 |"
         " Eb5:1.5 F5:0.5 G5:1 | Bb5:1.5 Ab5:0.5 F5:1 | G5:1.5 F5:0.5 Eb5:1 | G5:2 Db5:1 |"
         " C5:1.5 Eb5:0.5 Ab5:1 | Cb6:2 Ab5:1 | Ab5:1 G5:1 F5:1 |")
A_FIM_PARA_B = " Eb5:2 Eb5:0.5 F5:0.5"
A_FIM = " Eb5:3"
# o tema do título (Ré maior, 4/4) em Láb maior e 3/4: 5-6 | 1. 7 1 | 5 3 1 | 2 3 4 3 2 | 2 ... | 1 7 1 5 | 6 5 4 | 3 4 3 2 7 | 1
CITACAO = ("Ab5:1.5 G5:0.5 Ab5:1 | Eb6:1.5 C6:0.5 Ab5:1 | Bb5:1 C6:0.5 Db6:0.5 C6:0.5 Bb5:0.5 |"
           " Bb5:2 Eb5:0.5 F5:0.5 | Ab5:1 G5:0.5 Ab5:0.5 Eb6:1 | F6:1.5 Eb6:0.5 Db6:1 |"
           " C6:1 Db6:0.5 C6:0.5 G5:1 | Ab5:3 |")
VOLTA_B = ("F5:1.5 Ab5:0.5 C6:1 | Bb5:2 G5:1 | Ab5:1.5 F5:0.5 Db5:1 | G5:2 Eb5:1 |"
           " C6:1.5 Bb5:0.5 G5:1 | F5:1.5 Eb5:0.5 Cb5:1 | Bb4:1 Eb5:1 G5:1 | F5:1 Ab5:1 Bb4:1")
CODA = ("C6:1.5 Bb5:0.5 G5:1 | Cb6:2 Ab5:1 | G5:1.5 F5:0.5 Eb5:1 | Eb5:1 G5:1 C6:1 |"
        " Ab5:2 G5:0.5 F5:0.5 | F5:3 | G5:2 F5:1 | Eb5:3")


def _m(texto: str, t0: float, vel: float, art: float = 0.95):
    notas, _ = mel(texto.replace("|", ""), t0, vel, art)
    return notas


def _base(chave: str, titulo: str, semente: int):
    p = Partitura(chave, titulo, BPM, (3, 4), TOM, COMPASSOS, False, 4.0, semente)
    p.extra["modo"] = "breathe"
    p.extra["familia"] = "sala"
    return p, Harmonia(HARM, p.tc), p.c


def _final(h, t, lo, hi, n, vel, dur, rolado=0.0):
    vz = voz(None, h.em(t + 1e-6), lo, hi, n)
    return [[a, t + i * rolado, dur - i * rolado, vel] for i, a in enumerate(vz)]


# ======================================================================== dia

def dia() -> Partitura:
    p, h, c = _base("musica.sala_dia", "Chá na janela (dia)", 8801)

    # piano, mão direita: o tema; no B, acordes leves por baixo do vibrafone
    md = _m("Bb4:1", c(4) + 2, 62)
    md += _m(A_MEL + A_FIM_PARA_B, c(5), 72)
    md += _m("r:2 Bb4:1", c(36), 60)
    md += _m(A_MEL + A_FIM, c(37), 76)
    md += _m(CODA, c(53), 68, 0.97)
    md = contorno(md, 0.6)
    md = dinamica(md, [(c(5), 0.95), (c(13), 1.0), (c(17), 1.08), (c(20), 0.95), (c(37), 1.0), (c(45), 1.08),
                       (c(53), 1.0), (c(58), 0.85), (c(60) + 3, 0.75)])
    # na volta do A, a mão direita ganha uma segunda voz (terças e sextas) a partir do 45
    md2 = segunda_voz([n for n in md if c(45) <= n[1] < c(53)], h, fator=0.7)

    # piano, mão esquerda: arpejo de colcheias no A, valsa (baixo, acorde, acorde) no B e na coda
    arpejo = [(0, "R", 2.9, 0.95), (0.5, "0", 1.0, 0.58), (1, "1", 1.0, 0.62), (1.5, "2", 1.0, 0.6),
              (2, "1", 0.9, 0.55), (2.5, "0", 0.5, 0.5)]
    valsa = [(0, "R", 1.9, 0.95), (1, "0", 0.8, 0.55), (1, "1", 0.8, 0.55), (1, "2", 0.8, 0.55),
             (2, "0", 0.8, 0.5), (2, "1", 0.8, 0.5), (2, "2", 0.8, 0.5)]
    me = figura(h, 0, c(21), p.tc, arpejo, 51, 67, 3, 36, 50, 62)
    me += figura(h, c(21), c(37), p.tc, valsa, 55, 70, 3, 36, 50, 56)
    me += figura(h, c(37), c(53), p.tc, arpejo, 51, 67, 3, 36, 50, 64)
    me += figura(h, c(53), c(60), p.tc, valsa, 55, 69, 3, 36, 50, 56)
    me += _final(h, c(60), 39, 72, 6, 50, 3, rolado=0.08)
    me = dinamica(me, [(0, 0.85), (c(5), 0.95), (c(21), 0.9), (c(37), 1.0), (c(53), 0.95), (c(60), 0.8)])

    # vibrafone: a citação do título no B; no A' notas longas do acorde por cima, bem baixas
    vib = contorno(_m(CITACAO + VOLTA_B, c(21), 70, 1.0), 0.5)
    vib = [n for n in vib if n[0] <= 89]
    vib_cama = sustentado(h, c(41), c(53), 70, 84, 2, 36)

    canto = md + vib
    p.add("piano", md + md2 + limpar(me, canto))
    p.add("vibrafone", vib + limpar(vib_cama, md + md2))

    # violão: dedilhado leve no B (a mão esquerda do piano faz a valsa) e no A'
    dedo = [(0, "R", 1.5, 0.8), (1, "0", 1.0, 0.6), (1.5, "1", 1.0, 0.55), (2, "2", 0.9, 0.58)]
    vio = figura(h, c(21), c(53), p.tc, dedo, 55, 71, 3, 40, 52, 54)
    p.add("violao", limpar(vio, canto + md2))

    # violoncelo: no A' e na coda, a linha de terças e sétimas (o contracanto de quem está em casa)
    vc = linha_guia(h, c(37), c(60), 50, 64, 58, inicio=55)
    vc += [[51, c(60), 2.9, 50]]
    vc = dinamica(vc, [(c(37), 0.85), (c(45), 1.0), (c(53), 0.95), (c(60), 0.8)])
    p.add("violoncelo", limpar(vc, canto + md2))

    for papel, tj, vj in [("piano", 0.015, 6), ("vibrafone", 0.015, 5), ("violao", 0.015, 5),
                          ("violoncelo", 0.02, 4)]:
        p.humanizar(papel, tj, vj)
    p.observacoes = """
Dentro de casa, de dia: aconchegante, valsa lenta de piano, chá na janela. Mesma peça da versão de noite (mesmos 88 BPM, 3/4, harmonia e compassos).
Forma: introdução 1–4 (piano) | A 5–20 (tema da casa em Mib; no compasso 18 o Láb m6 com Dób na melodia, a nota de saudade) | B 21–36 (Láb maior: o vibrafone cita o tema do título adaptado a 3/4, o piano vira valsa, entra o violão) | A' 37–52 (piano com segunda voz a partir do 45, violoncelo em terças e sétimas, vibrafone em notas longas por cima) | coda 53–60 (acorde final de Mib7M(9) rolado).
Modo "breathe", cauda de 4 s (o piano tem de morrer de verdade).
Instrumentos: piano (Grand Piano Equal Mellow; o Ac Piano Upright de casa também serve), vibrafone (ou Wurli Soft Piano), violão de náilon (Tension), violoncelo solo legato.
No Live: reverb "Wooden Room"; pedal de sustentação não existe na partitura (as notas já têm o tamanho certo); vibrafone com motor bem lento.
""".strip()
    return p


# ======================================================================== noite

def noite() -> Partitura:
    p, h, c = _base("musica.sala_noite", "Chá na janela (noite)", 8802)

    # piano suave: o tema sem as notas de passagem; no A' uma oitava abaixo (canção de ninar)
    md = simplificar(_m("Bb4:1", c(4) + 2, 54) + _m(A_MEL + A_FIM, c(5), 62, 0.98), 1.0)
    md += transpor(simplificar(_m(A_MEL + A_FIM, c(37), 58, 0.98), 1.0), -12)
    md += simplificar(_m(CODA, c(53), 56, 0.98), 1.0)
    md = contorno(md, 0.5)
    md = dinamica(md, [(c(5), 0.95), (c(17), 1.05), (c(20), 0.9), (c(37), 0.95), (c(53), 0.95), (c(60) + 3, 0.7)])

    # mão esquerda: baixo longo no 1 e um acorde no 2, segurados (nada de valsa marcada)
    figura_noite = [(0, "R", 2.9, 0.9), (1, "0", 1.9, 0.5), (1, "1", 1.9, 0.48)]
    me = figura(h, 0, c(37), p.tc, figura_noite, 55, 67, 2, 36, 50, 50)
    me += figura(h, c(37), c(53), p.tc, figura_noite, 46, 58, 2, 31, 43, 48)
    me += figura(h, c(53), c(60), p.tc, figura_noite, 55, 67, 2, 36, 50, 48)
    me += _final(h, c(60), 39, 70, 5, 42, 3, rolado=0.12)

    # caixinha de música: a citação do título no B (a lembrança do vale) e o fim da coda
    cx = contorno(_m(CITACAO + VOLTA_B, c(21), 60, 1.0), 0.4)
    cx += _m("G6:2 F6:1 Eb6:3", c(59), 46, 1.0)
    cx = dinamica(cx, [(c(21), 0.95), (c(25), 1.05), (c(29), 0.95), (c(36), 0.85)])

    canto = md + cx
    p.add("piano_suave", md + limpar(me, canto))
    p.add("caixinha_de_musica", cx)

    # cordas: notas longas, quase só presença, a partir do segundo meio do A
    cordas = sustentado(h, c(13), c(60), 55, 72, 3, 30) + _final(h, c(60), 55, 72, 3, 26, 3)
    cordas = dinamica(cordas, [(c(13), 0.7), (c(21), 1.0), (c(29), 1.15), (c(37), 0.85), (c(53), 1.05),
                               (c(60), 0.7)])
    p.add("cordas_legato", limpar(cordas, canto))

    for papel, tj, vj in [("piano_suave", 0.02, 5), ("caixinha_de_musica", 0.015, 4), ("cordas_legato", 0.02, 3)]:
        p.humanizar(papel, tj, vj)
    p.observacoes = """
Dentro de casa, à noite (volume 0,35 no jogo): quase canção de ninar. Mesma peça da versão de dia, mesma harmonia e mesmos compassos, só que mais vazia: o tema sem as notas de passagem, a mão esquerda segura em vez de valsar.
Forma: introdução 1–4 | A 5–20 (piano suave) | B 21–36 (a caixinha de música lembra o tema do título; o piano só segura baixo e acorde) | A' 37–52 (o tema uma oitava abaixo, no meio do piano) | coda 53–60 (a caixinha fecha com Sol–Fá–Mib).
Modo "breathe", cauda de 4 s.
Instrumentos: piano suave (Grand Piano Stretch Mellow Production, pouco ataque, reverb longo; ou "Childhood Home Piano" com Vinyl Distortion bem leve, para soar como lembrança), caixinha de música, cordas legato muito baixas.
No Live: cordas 10 dB abaixo do piano; a caixinha com reverb mais longo que o piano, um pouco à direita.
""".strip()
    return p


def todas() -> list[Partitura]:
    return [dia(), noite()]


if __name__ == "__main__":
    for p in todas():
        p.salvar()
