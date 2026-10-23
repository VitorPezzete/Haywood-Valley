"""A leva de 2026-10-23: animais, ações de fazenda e ambiente do campo (Hay Day + Stardew, estilizado).

Tudo a 60 BPM (um tempo = um segundo), como em `efeitos.py`. Variações de um mesmo som vão num arquivo só (um
"kit"), cada uma num trecho que começa num segundo inteiro (`trechos`, o `region` do jogo). Laços (máquina, campo,
rio) em 4/4, com nada passando do fim.

Os animais são vozes sintetizadas (Operator "Portamento Male" e "Portamento Female Nasal", papéis `voz_grave` e
`voz_nasal`): notas ligadas deslizam umas nas outras em uns 0,15 a 0,2 s (o Glide Time medido em 2026-10-23), então
o contorno da voz é escrito como pontos (tempo, altura, força) e `_voz` os liga com uma pontinha de sobreposição.
Notas soltas (com folga entre elas) retomam o ataque: é o que faz o cacarejo e o balido "pulsarem". Nada de sample:
não há biblioteca de bichos nos pacotes, e o jeito estilizado combina com o resto do jogo.

Rajadas de ruído curtas (asas, terra, folhas, fungadas, o regador) vão no `sfx_ruido_curto`: o `sfx_ruido` (vento) segura
uns segundos depois da nota e vazava de um trecho do kit para o seguinte (medido na primeira gravação, 2026-10-23).

As ferramentas são camadas: o metal (`sfx_ferramenta`, o garfo de jardim percutido do Sound Objects), madeira,
grave, ruído (terra, folhas, água) e percussão; a recompensa (colher, pegar, moedas, nível) tem um toque afinado
de marimba, glockenspiel ou crotales, como nos jogos de fazenda.
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import GM, Partitura  # noqa: E402


# ======================================================================== ajudas

def _kit(chave, titulo, semente, cauda=0.35) -> Partitura:
    """Uma partitura de kit; os sons entram com `_som` e os trechos saem em `_fechar`."""
    p = Partitura(chave, titulo, 60, (1, 4), "sem tom", 1, False, cauda, semente)
    p._sons = []  # (nome, início, fim do slot)
    return p


def _som(p: Partitura, nome: str, inicio: float, slot: float, camadas: dict):
    """Põe um som do kit em `inicio` (segundos inteiros): `camadas` = {papel: [[altura, t, dur, vel], ...]}, com t
    contado do começo do som."""
    for papel, notas in camadas.items():
        p.add(papel, [[a, inicio + t, d, v] for a, t, d, v in notas])
    p._sons.append((nome, float(inicio), float(inicio + slot)))


def _fechar(p: Partitura, cauda: float):
    """Trechos: do início de cada som até a última nota mais a cauda (deixando 0,3 s de silêncio antes do próximo);
    o tamanho da peça é o fim do último slot."""
    p.trechos = []
    todas = [n for notas in p.trilhas.values() for n in notas]
    for nome, ini, fim_slot in p._sons:
        dentro = [n for n in todas if ini - 1e-6 <= n[1] < fim_slot - 1e-6]
        ultimo = max(n[1] + n[2] for n in dentro)
        primeiro = min(n[1] for n in dentro)
        assert abs(primeiro - ini) < 1e-6, f"{p.chave}/{nome}: a primeira nota está em {primeiro}, não em {ini}"
        fim = min(ultimo + cauda, fim_slot - 0.3)
        assert fim >= ultimo, f"{p.chave}/{nome}: o som não cabe no slot ({ultimo} > {fim_slot - 0.3})"
        p.trechos.append({"nome": nome, "inicio_s": ini, "fim_s": round(fim, 3)})
    p.compassos = int(math.ceil(max(f for _, _, f in p._sons) - 1e-9))


def _voz(pontos, fim, sobra=0.03):
    """Contorno de uma voz com portamento: [(t, altura, força), ...] vira notas ligadas (cada uma até o ponto
    seguinte mais `sobra`); a última vai até `fim`."""
    notas = []
    for i, (t, alt, vel) in enumerate(pontos):
        ate = pontos[i + 1][0] + sobra if i + 1 < len(pontos) else fim
        notas.append([alt, t, round(ate - t, 3), vel])
    return notas


def _junta(*dicts) -> dict:
    """Soma camadas de vários pedaços de som num só {papel: notas}."""
    out: dict = {}
    for d in dicts:
        for papel, notas in d.items():
            out.setdefault(papel, []).extend(notas)
    return out


def _desloca(d: dict, dt: float) -> dict:
    return {papel: [[a, t + dt, du, v] for a, t, du, v in notas] for papel, notas in d.items()}


# ======================================================================== animais

def _cacarejo(alt, vel=92):
    """Um "có": nota curta que já cai uns 5 semitons (a segunda, ligada, puxa o deslize) e um estalinho de bico."""
    return {"voz_nasal": [[alt, 0, 0.04, vel], [alt - 5, 0.025, 0.06, vel - 10]],
            "sfx_click": [[86, 0, 0.012, 22]]}


def galinha() -> Partitura:
    p = _kit("som.galinha", "Galinha", 5101)
    _som(p, "co_1", 0, 1, _junta(_cacarejo(70), _desloca(_cacarejo(67, 84), 0.16)))
    _som(p, "co_2", 1, 1, _junta(_cacarejo(71), _desloca(_cacarejo(69, 86), 0.12), _desloca(_cacarejo(68, 80), 0.24)))
    # "có... cóóó?": um cacarejo e uma subida curiosa
    _som(p, "pergunta", 2, 1, _junta(_cacarejo(69, 86),
                                     {"voz_nasal": _voz([(0.2, 65, 78), (0.3, 71, 90)], 0.55)}))
    # o "có-có-có-cocóóóc" de quem botou ovo
    _som(p, "ovo", 3, 2, _junta(_cacarejo(70), _desloca(_cacarejo(70, 88), 0.13), _desloca(_cacarejo(69, 86), 0.26),
                                {"voz_nasal": _voz([(0.42, 72, 96), (0.5, 76, 104), (0.74, 75, 96), (0.86, 69, 82)],
                                                   1.0)}))
    _fechar(p, 0.25)
    p.observacoes = """
Galinha: quatro sons num arquivo (trechos co_1, co_2, pergunta, ovo). Cada "có" é uma nota curta da voz nasal que já cai uns 5 semitons (a nota seguinte, ligada, puxa o portamento), com um estalinho de bico por baixo; as notas soltas retomam o ataque, e é isso que faz o cacarejo pulsar. "pergunta" sobe no fim; "ovo" é o có-có-có-cocóóóc de quem botou ovo (o mais comprido, 1 s).
No jogo: um trecho sorteado quando a galinha é tocada ou come; "ovo" quando o ovo fica pronto. O sorteio de tom (±5%) já dá variedade.
""".strip()
    return p


def vaca() -> Partitura:
    p = _kit("som.vaca", "Vaca", 5102)
    _som(p, "muu_1", 0, 2, {
        "voz_grave": _voz([(0, 43, 72), (0.18, 47, 94), (0.7, 46, 98), (1.1, 42, 80)], 1.35),
        "sfx_ruido_curto": [[50, 0, 0.3, 30]],
    })
    _som(p, "muu_2", 2, 2, {
        "voz_grave": _voz([(0, 45, 80), (0.12, 48, 96), (0.4, 45, 86)], 0.5)
        + _voz([(0.62, 47, 92), (0.8, 44, 90), (1.05, 40, 72)], 1.2),
        "sfx_ruido_curto": [[50, 0, 0.2, 26], [50, 0.62, 0.2, 24]],
    })
    _fechar(p, 0.4)
    p.observacoes = """
Vaca: dois mugidos (trechos muu_1, longo, 1,35 s; muu_2, "mu-uuu" em duas partes). Voz grave com portamento: começa embaixo, sobe uma terça, segura e cai no fim; um sopro de ruído grave por baixo no começo (o "m" de boca fechada).
""".strip()
    return p


def _balido(alts, vels, passo=0.05, folga=0.012):
    """Balido: notas curtas e soltas (cada uma retoma o ataque), a força alternando: o "béééé" tremido."""
    notas = []
    for i, (a, v) in enumerate(zip(alts, vels)):
        notas.append([a, round(i * passo, 3), passo - folga, v])
    return notas


def ovelha() -> Partitura:
    p = _kit("som.ovelha", "Ovelha", 5103)
    n = 14
    alts = [67] + [66] * 6 + [65] * 4 + [64] * 3
    vels = [96] + [92 if i % 2 else 76 for i in range(n - 1)]
    _som(p, "bee", 0, 2, {"voz_nasal": _balido(alts, vels), "sfx_ruido_curto": [[70, 0, 0.08, 34]]})
    n2 = 9
    alts2 = [72] + [71] * 4 + [70] * 4
    vels2 = [92] + [88 if i % 2 else 72 for i in range(n2 - 1)]
    _som(p, "carneirinho", 2, 1.5, {"voz_nasal": _balido(alts2, vels2, 0.048)})
    _fechar(p, 0.3)
    p.observacoes = """
Ovelha: "bééé" (adulta, 0,7 s) e "mééé" (carneirinho, mais agudo e curto). Notas curtíssimas e soltas da voz nasal, a força alternando a cada 50 ms: o tremido do balido; a altura desce um tom ao longo do som. Um sopro curto no começo (o "b").
""".strip()
    return p


def _oinc(base, vel=100):
    return {"voz_grave": _voz([(0, base, vel - 15), (0.06, base + 4, vel)], 0.17),
            "sfx_ruido_curto": [[55, 0, 0.12, 52]], "sfx_grave": [[40, 0, 0.06, 30]]}


def porco() -> Partitura:
    p = _kit("som.porco", "Porco", 5104)
    _som(p, "oinc_1", 0, 1, _oinc(50))
    _som(p, "oinc_2", 1, 1, _junta(_oinc(51), _desloca(_oinc(49, 92), 0.22)))
    _som(p, "fungada", 2, 1, {"sfx_ruido_curto": [[52, 0, 0.08, 70], [50, 0.1, 0.1, 60], [54, 0.22, 0.07, 55]],
                              "voz_grave": [[45, 0.05, 0.1, 60]]})
    _fechar(p, 0.25)
    p.observacoes = """
Porco: "oinc" (voz grave curta que sobe uma terça maior, com uma fungada de ruído e um grave por baixo), "oinc-oinc" e uma fungada sozinha (três sopros e um grunhido baixinho), para quando ele fuça.
""".strip()
    return p


def _au(alt, vel=105):
    return {"voz_grave": _voz([(0, alt, vel), (0.04, alt - 4, vel - 10)], 0.13),
            "sfx_ruido_curto": [[62, 0, 0.06, 45]], "sfx_grave": [[43, 0, 0.05, 45]]}


def cachorro() -> Partitura:
    p = _kit("som.cachorro", "Cachorro", 5105)
    _som(p, "au_1", 0, 1, _au(60))
    _som(p, "au_2", 1, 1, _junta(_au(61), _desloca(_au(59, 98), 0.2)))
    _som(p, "arf", 2, 1, _junta(_au(64, 96), _desloca(_au(64, 92), 0.14), _desloca(_au(63, 88), 0.28)))
    _fechar(p, 0.25)
    p.observacoes = """
Cachorro (porte pequeno, amigo): "au!" (golpe curto da voz grave que cai uma terça, sopro e grave por baixo), "au-au" e "arf-arf-arf" (mais agudo, animado: para quando ele vê o dono).
""".strip()
    return p


def gato() -> Partitura:
    p = _kit("som.gato", "Gato", 5106)
    _som(p, "miau", 0, 1, {"voz_nasal": _voz([(0, 66, 80), (0.1, 71, 96), (0.35, 70, 92), (0.55, 64, 74)], 0.66)})
    _som(p, "miu", 1, 1, {"voz_nasal": _voz([(0, 73, 80), (0.08, 76, 92), (0.25, 71, 80)], 0.36)})
    _fechar(p, 0.04)
    p.observacoes = """
Gato: "miau" (sobe uma quarta, segura e cai: mi-ÁU-u, 0,66 s) e "miu" (filhote, curto e agudo). Voz nasal com portamento.
""".strip()
    return p


def _bater_asas(n, passo, vel0, vel1, rnd, t0=0.0):
    """Asas: cada batida é um chocalho curto (shaker e maracas alternando) com um sopro grave por baixo nas batidas
    fortes. A primeira versão (só ruído) virou um "chhh" contínuo de 0,4 s na gravação de 2026-10-23."""
    perc, sopro = [], []
    for i in range(n):
        x = i / max(1, n - 1)
        v = vel0 + (vel1 - vel0) * x
        t = round(t0 + i * passo + (rnd.uniform(0, 0.006) if i else 0), 3)
        perc.append([GM["shaker"] if i % 2 == 0 else GM["maracas"], t, 0.03, round(v)])
        if i % 2 == 0:
            sopro.append([56 + rnd.randint(0, 3), t, 0.03, round(v * 0.7)])
    return {"percussao_latina": perc, "sfx_ruido_curto": sopro}


def passaros_pousam() -> Partitura:
    p = _kit("som.passaros_pousam", "Pássaros pousam", 5107)
    r = p.rnd
    _som(p, "pousa_1", 0, 2, _junta(_bater_asas(8, 0.05, 70, 30, r),
                                    {"sfx_click": [[80, 0.4, 0.015, 34]],
                                     "assobio": [[93, 0.47, 0.06, 96], [96, 0.55, 0.05, 88]]}))
    _som(p, "pousa_2", 2, 2, _junta(_bater_asas(6, 0.055, 66, 32, r),
                                    {"sfx_click": [[82, 0.33, 0.015, 30]],
                                     "assobio": [[91, 0.38, 0.05, 92], [94, 0.45, 0.05, 98], [91, 0.52, 0.07, 84]]}))
    _som(p, "voa", 4, 2, _junta({"assobio": [[95, 0, 0.05, 98], [98, 0.07, 0.045, 86]]},
                                _bater_asas(12, 0.045, 50, 74, r, 0.08)))
    _fechar(p, 0.3)
    p.observacoes = """
Pássaros: pousa_1 e pousa_2 (bater de asas que vai parando, o toquinho das patas e dois ou três pios), voa (pio e as asas acelerando e sumindo). Complementam o som.passaros da biblioteca (o canto de fundo): estes são os do bando que pousa no chão ou na cerca, perto do jogador.
As asas são batidas de chocalho (shaker e maracas alternando) com um sopro grave curto nas fortes; os pios, o assobio do Operator com a subidinha do envelope de altura.
""".strip()
    return p


# ======================================================================== ações de fazenda

def enxada() -> Partitura:
    p = _kit("som.enxada", "Enxada", 5201)
    r = p.rnd
    for i, (metal, grave, terra) in enumerate([(60, 38, 58), (62, 37, 60), (59, 39, 57)]):
        graos = [[r.randint(76, 90), round(0.08 + r.uniform(0, 0.17), 3), 0.012, r.randint(18, 34)] for _ in range(4)]
        _som(p, f"golpe_{i + 1}", i, 1, {
            "sfx_ferramenta": [[metal, 0, 0.05, 45]],
            "sfx_grave": [[grave, 0, 0.08, 88]],
            "percussao_latina": [[GM["conga_abafada"], 0, 0.06, 50]],
            "sfx_ruido_curto": [[terra, 0.01, 0.12, 72], [terra + 8, 0.05, 0.08, 46]],
            "sfx_click": graos,
        })
    _fechar(p, 0.15)
    p.observacoes = """
Enxada na terra: três golpes. O baque (grave e conga abafada), a lâmina (metal bem baixo), a terra abrindo (duas rajadas de ruído, a segunda mais aguda) e uns grãozinhos caindo (cliques baixos sorteados).
""".strip()
    return p


def plantar() -> Partitura:
    p = _kit("som.plantar", "Plantar semente", 5202)
    for i, (plim, t2) in enumerate([(84, 0.12), (81, 0.14)]):
        _som(p, f"semente_{i + 1}", i, 1, {
            "sfx_ruido_curto": [[64, 0, 0.08, 46], [60, 0.3, 0.05, 30], [60, 0.43, 0.05, 26]],
            "marimba": [[plim, t2, 0.08, 62]],
            "sfx_grave": [[45, 0.3, 0.05, 36], [45, 0.43, 0.05, 30]],
        })
    _fechar(p, 0.15)
    p.observacoes = """
Plantar: o furinho na terra (ruído curto), a semente caindo (um "plim" de marimba, agudo e curto) e dois tapinhas para cobrir (grave e ruído baixos).
""".strip()
    return p


def regar() -> Partitura:
    p = _kit("som.regar", "Regar", 5203)
    r = p.rnd
    for i in range(2):
        gotas = [[r.randint(76, 92), round(r.uniform(0.08, 1.05), 3), 0.04, r.randint(24, 48)] for _ in range(10)]
        gotas += [[88, 1.25, 0.04, 34], [85, 1.5, 0.04, 24]]
        _som(p, f"rega_{i + 1}", 2 * i, 2, {
            "sfx_ruido_curto": [[72 - i, 0, 1.1, 62], [80, 0.05, 1.0, 34], [58 + i, 0.1, 1.0, 40]],
            "sfx_bolha": gotas,
        })
    _fechar(p, 0.2)
    p.observacoes = """
Regador: a água caindo (ruído médio, um chiado agudo por cima e a terra bebendo por baixo, 1,1 s), gotas sorteadas e dois pingos no fim. Duas versões (rega_1, rega_2).
""".strip()
    return p


def colher() -> Partitura:
    p = _kit("som.colher", "Colher", 5204)
    for i, (a, b, t) in enumerate([(79, 86, 0.1), (77, 84, 0.12), (81, 88, 0.09)]):
        _som(p, f"colhe_{i + 1}", i, 1, {
            "sfx_ruido_curto": [[70, 0, 0.08, 55]],
            "sfx_bolha": [[72, t, 0.06, 80]],
            "marimba": [[a, t, 0.07, 70], [b, t + 0.06, 0.09, 64]],
            "sfx_sino": [[100, t + 0.1, 0.05, 28]],
        })
    _fechar(p, 0.2)
    p.observacoes = """
Colher: o farfalhar das folhas, o "pop!" do que sai da terra (bolha e duas notas de marimba subindo, uma quinta ou sexta) e um brilhinho de sino: a pequena recompensa. Três versões em alturas diferentes.
""".strip()
    return p


def mato_corte() -> Partitura:
    p = _kit("som.mato_corte", "Cortar mato", 5205)
    for i, (sw, sn) in enumerate([(74, 72), (76, 70), (73, 74)]):
        _som(p, f"corte_{i + 1}", i, 1, {
            "sfx_ruido_curto": [[sw, 0, 0.05, 60], [sw + 6, 0.03, 0.06, 50], [68, 0.1, 0.18, 36]],
            "sfx_click": [[sn, 0.06, 0.02, 60]],
            "sfx_madeira": [[70, 0.06, 0.02, 40]],
            "percussao_latina": [[GM["maracas"], 0.08, 0.05, 36], [GM["cabasa"], 0.12, 0.06, 30]],
        })
    _fechar(p, 0.15)
    p.observacoes = """
Cortar mato ou arbusto: o "swish" (duas rajadas de ruído subindo), o talo partindo (clique e madeira fina) e as folhas (maracas, cabasa e um farfalhar que some).
""".strip()
    return p


def _rangido(t0, dur, alturas, vel, rnd, passo=0.028):
    notas = []
    n = max(2, int(dur / passo))
    a, b, c = alturas
    for i in range(n):
        x = i / (n - 1)
        alt = a + (b - a) * (x / 0.5) if x < 0.5 else b + (c - b) * ((x - 0.5) / 0.5)
        t = t0 + i * passo + rnd.uniform(-0.004, 0.004) * (i > 0)
        v = vel[0] + (vel[1] - vel[0]) * x + rnd.uniform(-4, 4)
        notas.append([int(round(alt + rnd.uniform(-0.6, 0.6))), round(t, 4), 0.022, max(8, v)])
    return notas


def machado() -> Partitura:
    p = _kit("som.machado", "Machado", 5206)
    r = p.rnd
    for i, m in enumerate([48, 50, 47]):
        lascas = [[r.randint(80, 92), round(r.uniform(0.05, 0.2), 3), 0.012, r.randint(20, 36)] for _ in range(2)]
        _som(p, f"golpe_{i + 1}", i, 1, {
            "sfx_madeira": [[m, 0, 0.08, 110], [m + 7, 0.01, 0.05, 60]],
            "sfx_grave": [[36, 0, 0.1, 90]],
            "sfx_ferramenta": [[72, 0, 0.04, 40]],
            "percussao_latina": [[GM["conga_grave"], 0, 0.08, 55]],
            "sfx_click": lascas,
        })
    folhas = [[GM["maracas"] if k % 2 else GM["cabasa"], round(1.45 + k * 0.07 + r.uniform(0, 0.03), 3), 0.05,
               60 - k * 4] for k in range(8)]
    _som(p, "arvore_cai", 3, 3, {
        "sfx_madeira": _rangido(0.0, 0.9, (55, 60, 63), (30, 60), r)
        + [[45, 1.4, 0.12, 112], [52, 1.42, 0.06, 70], [47, 1.75, 0.06, 60]],
        "sfx_ruido_curto": [[60, 0.8, 0.6, 50], [66, 1.0, 0.4, 44], [70, 1.42, 0.6, 56]],
        "sfx_grave": [[33, 1.4, 0.3, 120], [38, 1.42, 0.2, 90], [40, 1.75, 0.08, 50]],
        "percussao_latina": [[GM["conga_grave"], 1.4, 0.1, 70]] + folhas,
    })
    _fechar(p, 0.3)
    p.observacoes = """
Machado: três golpes na madeira (madeira forte com o oco do tronco, grave, um fio de metal e duas lascas) e a árvore caindo (arvore_cai, 2,4 s: o tronco rangendo enquanto tomba, o vento da copa, o baque no chão, o quique e as folhas assentando).
""".strip()
    return p


def picareta() -> Partitura:
    p = _kit("som.picareta", "Picareta", 5207)
    r = p.rnd
    for i, m in enumerate([84, 86, 83]):
        _som(p, f"golpe_{i + 1}", i, 1, {
            "sfx_ferramenta": [[m, 0, 0.06, 100], [m + 7, 0.005, 0.04, 60]],
            "percussao_latina": [[GM["claves"], 0, 0.03, 70]],
            "sfx_grave": [[40, 0, 0.06, 60]],
            "sfx_ruido_curto": [[64, 0.01, 0.07, 55]],
            "sfx_sino": [[98, 0.02, 0.03, 26]],
        })
    caem = []
    for k in range(14):
        x = k / 13
        caem.append([r.randint(72, 94), round(0.05 + 0.85 * x ** 1.4 + r.uniform(-0.01, 0.01), 3), 0.014,
                     int(70 - 46 * x + r.uniform(-5, 5))])
    _som(p, "pedra_quebra", 3, 2, {
        "sfx_ferramenta": [[86, 0, 0.05, 100]],
        "sfx_grave": [[36, 0, 0.15, 100]],
        "sfx_ruido_curto": [[58, 0, 0.2, 90], [66, 0.03, 0.15, 70]],
        "sfx_click": caem,
        "percussao_latina": [[GM["claves"], 0.2, 0.03, 40], [GM["bloco_grave"], 0.35, 0.04, 34]],
    })
    _fechar(p, 0.3)
    p.observacoes = """
Picareta na pedra: três golpes (o metal agudo batendo, claves secas, um grave pequeno, a poeira em ruído e uma faísca) e a pedra partindo (pedra_quebra: o estalo, o "crac" grave, as pedrinhas caindo cada vez mais baixas e espaçadas).
""".strip()
    return p


def pesca() -> Partitura:
    p = _kit("som.pesca", "Pesca", 5208)
    r = p.rnd
    catraca = []
    t, gap = 0.05, 0.02
    for k in range(18):
        catraca.append([90, round(t, 3), 0.01, int(42 - k * 1.5)])
        t += gap
        gap *= 1.06
    _som(p, "lancar", 0, 2, {
        "sfx_ruido_curto": [[62, 0, 0.15, 50], [70, 0.08, 0.15, 60], [78, 0.16, 0.12, 45], [70, 0.95, 0.15, 55]],
        "sfx_click": catraca,
        "sfx_bolha": [[60, 0.95, 0.06, 90], [67, 0.97, 0.05, 60], [74, 1.0, 0.05, 40], [84, 1.2, 0.04, 30],
                      [88, 1.35, 0.04, 22]],
    })
    _som(p, "fisgar", 2, 1, {
        "sfx_bolha": [[62, 0, 0.05, 80], [58, 0.08, 0.06, 70]],
        "sfx_ruido_curto": [[68, 0, 0.1, 45]],
        "glockenspiel": [[88, 0.12, 0.15, 90], [95, 0.18, 0.25, 95]],
    })
    # puxar: a carretilha e a linha esticando; 2 s que dão laço (32 cliques por volta, puxões a cada 0,6 s)
    cliques = [[84 if k % 2 == 0 else 86, round(k * 0.0625, 4), 0.012, 44 if k % 4 == 0 else 34] for k in range(32)]
    _som(p, "puxar", 3, 2.5, {
        "sfx_click": cliques,
        "sfx_ruido_curto": [[66, 0.3, 0.15, 45], [64, 0.95, 0.15, 42], [67, 1.55, 0.15, 44]],
        "sfx_bolha": [[r.randint(62, 80), round(r.uniform(0.1, 1.85), 3), 0.05, r.randint(22, 40)] for _ in range(6)],
    })
    _som(p, "pegou", 6, 2, {
        "sfx_ruido_curto": [[72, 0, 0.25, 80], [62, 0, 0.2, 55]],
        "sfx_bolha": [[86, 0.08, 0.04, 40], [80, 0.14, 0.04, 34], [90, 0.2, 0.04, 30]],
        "marimba": [[72, 0.15, 0.1, 74], [76, 0.22, 0.1, 78], [79, 0.29, 0.1, 82], [84, 0.36, 0.3, 90]],
        "glockenspiel": [[96, 0.36, 0.4, 70]],
    })
    _fechar(p, 0.3)
    # puxar acaba no fim exato dos 2 s (para laço), não na cauda
    for x in p.trechos:
        if x["nome"] == "puxar":
            x["fim_s"] = 5.0
    p.observacoes = """
Pesca, quatro trechos: lancar (o "fiu" da vara, a carretilha soltando linha e o "ploc" da boia, 1,4 s), fisgar (a boia afunda e um "tlin!" de aviso), puxar (a carretilha recolhendo e a linha dando puxões: 2 s, de 3,0 a 5,0, feitos para laço: 32 cliques por volta), pegou (o peixe sai da água e um arpejo de marimba com glockenspiel).
""".strip()
    return p


def pegar_item() -> Partitura:
    p = _kit("som.pegar_item", "Pegar item", 5209)
    for i, (a, b) in enumerate([(76, 83), (74, 81), (77, 84)]):
        _som(p, f"pega_{i + 1}", i, 1, {
            "sfx_bolha": [[70 + i * 2, 0, 0.04, 60]],
            "marimba": [[a, 0.02, 0.06, 70], [b, 0.07, 0.12, 75]],
            "sfx_click": [[92, 0, 0.01, 30]],
        })
    _fechar(p, 0.15)
    p.observacoes = """
Pegar item: um "pop" (bolha e clique) e duas notas de marimba subindo uma quinta. Três versões; é o som que mais vai tocar, então é curto (0,35 s) e sem cauda.
""".strip()
    return p


def moedas() -> Partitura:
    p = _kit("som.moedas", "Moedas", 5210)
    r = p.rnd

    def moeda(t, alt, vel):
        return {"crotales": [[alt, t, 0.12, vel]], "sfx_metal": [[min(108, alt + 7), t, 0.02, int(vel * 0.5)]]}

    poucas = _junta(moeda(0, 91, 90), moeda(0.09, 94, 80), moeda(0.16, 89, 74),
                    {"glockenspiel": [[96, 0.25, 0.2, 70]]})
    _som(p, "poucas", 0, 2, poucas)
    muitas = []
    t = 0.0
    for k in range(9):
        muitas.append(moeda(round(t, 3), r.choice([84, 86, 89, 91, 93, 94, 96]), int(95 - k * 5)))
        t += r.uniform(0.04, 0.09)
    muitas.append({"glockenspiel": [[88, 0.75, 0.4, 80], [91, 0.75, 0.4, 76], [96, 0.75, 0.5, 84]],
                   "crotales": [[96, 0.75, 0.4, 70]]})
    _som(p, "muitas", 2, 2, _junta(*muitas))
    _fechar(p, 0.35)
    p.observacoes = """
Moedas: poucas (três moedinhas e um "tlin": vendeu algo) e muitas (nove moedas caindo e o acorde da caixa registradora em glockenspiel: venda grande, pedido entregue). Crotales com um fio de metal curto por cima: o tilintar.
""".strip()
    return p


def nivel() -> Partitura:
    p = _kit("som.nivel", "Subir de nível", 5211)
    arpejo = [[a, round(i * 0.07, 3), 0.15, 80 + i * 4] for i, a in enumerate([72, 76, 79, 84, 88])]
    harpa = [[a, round(0.02 + i * 0.03, 3), 0.6, 50 + i * 2] for i, a in enumerate([60, 64, 67, 72, 76, 79, 84, 88])]
    _som(p, "nivel", 0, 3, {
        "xilofone": arpejo,
        "harpa": harpa,
        "glockenspiel": [[96, 0.5, 0.6, 90], [100, 0.62, 0.8, 84]],
        "marimba": [[60, 0.55, 1.2, 80], [64, 0.55, 1.2, 76], [67, 0.55, 1.2, 76], [72, 0.55, 1.2, 82]],
        "cordas_pizzicato": [[48, 0.55, 0.5, 90], [55, 0.55, 0.5, 80], [64, 0.55, 0.5, 80]],
        "flauta": [[79, 0.55, 0.13, 86], [84, 0.7, 1.0, 92]],
        "crotales": [[96, 0.55, 0.4, 70], [91, 0.8, 0.4, 60], [96, 1.0, 0.5, 64]],
        "percussao_latina": [[GM["triangulo"], 0.55, 0.6, 50]],
    })
    _fechar(p, 0.5)
    p.observacoes = """
Subir de nível: arpejo de xilofone em Dó (Dó–Mi–Sol–Dó–Mi) com a harpa varrendo por baixo, e o acorde de chegada (marimba, pizzicato, flauta segurando o Dó agudo, glockenspiel, crotales e triângulo). Uns 2 s. É o único momento "fanfarra" da leva: alegre sem metais.
""".strip()
    return p


def maquina() -> Partitura:
    p = Partitura("som.maquina", "Máquina trabalhando", 60, (4, 4), "sem tom", 1, True, 0.0, 5212)
    p.add("sfx_madeira", [[50 if i % 2 == 0 else 53, i * 0.5, 0.08, 90 if i % 2 == 0 else 68] for i in range(8)])
    p.add("sfx_grave", [[38, float(i), 0.1, 60] for i in range(4)])
    p.add("sfx_click", [[78 if i % 2 else 80, i * 0.25, 0.015, 34 if i % 4 == 0 else 24] for i in range(16)])
    zumbido = [[45 + (i % 2), i * 0.125, 0.15, 34 if i % 4 else 40] for i in range(32)]
    zumbido = [n for n in zumbido if not (1.74 <= n[1] < 1.95 or 3.74 <= n[1] < 3.95)]
    p.add("sfx_ruido_curto", zumbido + [[70, 1.75, 0.2, 44], [70, 3.75, 0.2, 42]])
    p.add("sfx_metal", [[84, 0.75, 0.03, 34], [86, 2.75, 0.03, 30]])
    p.extra["modo"] = "laço pelo lugar"
    p.observacoes = """
Máquina trabalhando (padaria, ração, tear: as máquinas de produção): laço de 4 s com um pulso de 120 por minuto. "Tchuc-tchuc" de madeira (forte, fraco), um grave a cada segundo, a engrenagem tiquetaqueando em semicolcheias, o zumbido grave em rajadas de 1/8 de tempo (o Wind Machine é de uma voz: nota longa nova reabria o filtro devagar e dava um "fuuu" a cada volta), dois sopros de vapor e dois tlins de metal.
Pelo lugar (PLACED), em laço inteiro, enquanto a máquina produz.
""".strip()
    return p


# ======================================================================== ambiente

def _textura(ini, fim, alts, vels, rnd, passo=(0.08, 0.13), dur=0.18, curva=None):
    """Uma cama feita de rajadas curtas do sfx_ruido_curto (o Wind Machine é de uma voz: cada nota retoma a anterior
    na hora, com o filtro já aberto). Altura (o filtro) e força sorteadas a cada rajada: água correndo, folhas.
    `curva(t)` multiplica a força (ondas lentas). Medido em 2026-10-23: a cama de notas longas que se cruzavam
    reabria o filtro devagar a cada nota nova e fazia um "fuuu" a cada 4 s."""
    notas = []
    t = ini
    while t < fim - dur - 1e-6:
        v = rnd.uniform(*vels) * (curva(t) if curva else 1.0)
        notas.append([rnd.randint(*alts), round(t, 3), dur, max(4, round(v))])
        t += rnd.uniform(*passo)
    return notas


def campo_dia() -> Partitura:
    p = Partitura("som.campo_dia", "Campo de dia", 60, (4, 4), "sem tom", 8, True, 0.0, 5301)
    r = p.rnd
    ruido = []
    t = 1.0
    while t < 27.0:  # folhas: ondas de farfalhar, sem pulso
        dur = r.uniform(1.5, 3.0)
        pico = r.uniform(26, 40)
        ruido += _textura(t, min(t + dur, 31.5), (70, 78), (0.6 * pico, pico), r, (0.07, 0.12), 0.14,
                          lambda x, t=t, d=dur: math.sin(math.pi * min(1.0, max(0.0, (x - t) / d))) + 0.15)
        t += dur + r.uniform(2.0, 4.5)
    p.add("sfx_ruido_curto", ruido)
    trilos = []
    # gafanhotos: trilos curtos, longe; um na emenda (no 0 e perto do fim) para o laço não ter buraco
    for t0 in [0.0, 31.3] + sorted(r.uniform(1.5, 29.0) for _ in range(6)):
        n = r.randint(12, 22) if t0 < 31 else 20
        alt = r.randint(86, 92)
        v = r.randint(18, 30)
        trilos += [[alt, round(t0 + k * 0.028, 3), 0.01, v + (4 if k % 3 == 0 else 0)] for k in range(n)]
    p.add("sfx_click", trilos)
    p.add("percussao_latina", [[GM["cowbell"], round(r.uniform(12, 14), 3), 0.2, 14],
                               [GM["cowbell"], round(r.uniform(12.5, 14.5) + 0.4, 3), 0.2, 11]])
    p.extra["modo"] = "laço de ambiente"
    p.observacoes = """
Campo de dia (exterior, junto com o vento e os pássaros da biblioteca, que ficam como estão): laço de 32 s. As folhas em ondas suaves sorteadas (rajadas curtas de ruído, sem cama contínua: o vento já é a cama), seis trilos curtos de gafanhoto longe e, uma vez por volta, um sininho de vaca muito distante. Nada de pássaro (o som.passaros cobre).
""".strip()
    return p


def campo_noite() -> Partitura:
    p = Partitura("som.campo_noite", "Campo de noite", 60, (4, 4), "sem tom", 8, True, 0.0, 5302)
    r = p.rnd
    sapos = []
    for t0 in sorted(r.uniform(0.5, 30.5) for _ in range(11)):  # sapos: "rrup-rrup", longe e perto
        a = r.choice([43, 45, 46, 48])
        v = r.randint(34, 60)
        sapos += _voz([(t0, a, v), (t0 + 0.05, a + 3, v + 6)], t0 + 0.1)
        if r.random() < 0.6:
            sapos += _voz([(t0 + 0.16, a + 1, v - 4), (t0 + 0.2, a + 4, v)], t0 + 0.26)
    p.add("voz_grave", sapos)
    coruja = []
    for t0 in (r.uniform(5, 8), r.uniform(20, 24)):  # coruja: "hu... hu-huuu"
        coruja += [[62, round(t0, 3), 0.35, 44], [62, round(t0 + 0.9, 3), 0.18, 40],
                   [60, round(t0 + 1.15, 3), 0.55, 46]]
    p.add("shakuhachi", coruja)
    insetos = []
    # trilos lentos de inseto noturno; um no 0 e um até perto do fim, para a emenda do laço
    for t0 in [0.0, 31.1] + sorted(r.uniform(0.2, 30.0) for _ in range(9)):
        n = r.randint(10, 18) if t0 < 31 else 17
        alt = r.randint(88, 94)
        insetos += [[alt, round(t0 + k * 0.05, 3), 0.012, r.randint(10, 18)] for k in range(n)]
    p.add("sfx_click", insetos)
    p.extra["modo"] = "laço de ambiente"
    p.observacoes = """
Campo de noite (junto com os grilos da biblioteca): laço de 32 s. Sem cama (o vento e os grilos já são a cama): onze sapos ("rrup", às vezes "rrup-rrup", em distâncias diferentes: voz grave com portamento), a coruja duas vezes ("hu... hu-huuu", flauta indiana grave e baixa) e trilos lentos de inseto.
""".strip()
    return p


def rio() -> Partitura:
    p = Partitura("som.rio", "Rio correndo", 60, (4, 4), "sem tom", 4, True, 0.0, 5303)
    r = p.rnd
    onda = lambda x: 0.8 + 0.2 * math.sin(2 * math.pi * x / 4.0) + 0.1 * math.sin(2 * math.pi * x / 1.6)
    p.add("sfx_ruido_curto", _textura(0.0, 16.0, (60, 70), (40, 56), r, (0.07, 0.11), 0.16, onda))
    p.add("sfx_bolha", [[r.randint(62, 86), round(r.uniform(0.2, 15.8), 3), round(r.uniform(0.04, 0.08), 3),
                         r.randint(18, 45)] for _ in range(45)]
          + [[r.randint(70, 90), round(r.uniform(0.0, 15.9), 3), 0.04, r.randint(10, 22)] for _ in range(120)])
    p.extra["modo"] = "laço pelo lugar"
    p.observacoes = """
Rio correndo: laço de 16 s, posicionado no rio. A correnteza em rajadas curtas de ruído (uma a cada 70–110 ms, filtro e força sorteados, em ondas lentas de 4 s e 1,6 s), um chiado de 120 bolhinhas baixas e 45 gorgolejos (bolhas) em alturas e forças sorteadas.
""".strip()
    return p


def todas() -> list[Partitura]:
    return [galinha(), vaca(), ovelha(), porco(), cachorro(), gato(), passaros_pousam(),
            enxada(), plantar(), regar(), colher(), mato_corte(), machado(), picareta(), pesca(), pegar_item(),
            moedas(), nivel(), maquina(), campo_dia(), campo_noite(), rio()]


if __name__ == "__main__":
    for p in todas():
        p.salvar()
