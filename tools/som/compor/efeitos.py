"""Os efeitos sem id (som.vento, som.passo_*, som.bau_*, som.fogao_acende) e os substitutos opcionais
(som.<chave>.nosso) dos que hoje vêm da biblioteca do Roblox.

Todos a 60 BPM (um tempo = um segundo), para os tempos das notas já serem os segundos do arquivo. Nada de
sample sozinho: cada som é feito de camadas de síntese (`sfx_*`) e percussão, com alturas e velocidades que
imitam o objeto. Os sorteios usam a semente de cada peça (sai igual toda vez).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import GM, Partitura  # noqa: E402


def _sfx(chave, titulo, segundos, semente, laco=False, cauda=0.4) -> Partitura:
    """Laços em 4/4 (compassos de 4 s); efeitos de uma vez em 1/4 (compassos de 1 s), para o arquivo não levar
    segundos de silêncio no fim."""
    if laco:
        return Partitura(chave, titulo, 60, (4, 4), "sem tom", max(1, int(-(-segundos // 4))), laco, cauda, semente)
    return Partitura(chave, titulo, 60, (1, 4), "sem tom", max(1, int(-(-segundos // 1))), laco, cauda, semente)


def _trechos(p: Partitura, nomes: list[str], cauda: float):
    """Um trecho por variação, começando em cada segundo inteiro; o fim é a última nota mais a cauda."""
    p.trechos = []
    for i, nome in enumerate(nomes):
        fim = max(n[1] + n[2] for notas in p.trilhas.values() for n in notas if i <= n[1] < i + 1)
        p.trechos.append({"nome": nome, "inicio_s": float(i), "fim_s": round(min(fim + cauda, i + 0.7), 3)})


def _rangido(t0: float, dur: float, alturas: tuple[int, int, int], vel: tuple[int, int], rnd, passo=0.028):
    """Dobradiça: uma rajada de estalinhos de madeira cuja altura sobe e desce (o "nheeec" feito de cliques)."""
    notas = []
    n = max(2, int(dur / passo))
    a, b, c = alturas
    for i in range(n):
        x = i / (n - 1)
        alt = a + (b - a) * (x / 0.5) if x < 0.5 else b + (c - b) * ((x - 0.5) / 0.5)
        t = t0 + i * passo + rnd.uniform(-0.004, 0.004) * (i > 0)
        v = vel[0] + (vel[1] - vel[0]) * (1 - abs(x - 0.45) * 1.6) + rnd.uniform(-4, 4)
        notas.append([int(round(alt + rnd.uniform(-0.6, 0.6))), round(t, 4), 0.022, max(8, v)])
    return notas


# ======================================================================== vento (laço)

def vento() -> Partitura:
    p = _sfx("som.vento", "Vento", 32, 4401, laco=True, cauda=0.0)
    r = p.rnd
    ruido = [[43, 0, 32, 46], [55, 0, 32, 30]]  # a cama: duas faixas de ruído, grave e média, o laço inteiro
    t = 1.6
    while t < 27.5:  # rajadas: sem pulso, cada uma com sua altura (= o filtro) e força
        dur = r.uniform(3.0, 6.5)
        if t + dur > 30.0:
            dur = 30.0 - t
        ruido.append([r.randint(57, 72), round(t, 3), round(dur, 3), r.randint(30, 70)])
        t += r.uniform(2.2, 5.2)
    for t0 in (r.uniform(6, 9), r.uniform(18, 22)):  # dois assobios finos, bem baixos
        ruido.append([r.randint(79, 86), round(t0, 3), round(r.uniform(2.0, 3.2), 3), r.randint(18, 28)])
    p.add("sfx_ruido", ruido)
    p.extra["modo"] = "laço de ambiente"
    p.observacoes = """
Vento de fundo do exterior (AMBIENCE_LAYERS.vento, volume até 0,2). Laço de 32 s sem pulso: uma cama contínua (duas notas longas, grave e média) e rajadas de 3 a 6,5 s em tempos e forças sorteados; dois assobios finos e baixos. Nenhuma rajada perto da emenda (a emenda cai numa calmaria).
A altura de cada nota no sfx_ruido é o filtro: mais aguda, mais "assobio"; mais grave, mais "sopro".
No Live: Operator "Wind Machine" (ou "S&H Filtered Noise") com ataque de 1,5 s e release de 2 s, o filtro seguindo a nota (key tracking) e um LFO bem lento no corte; Auto Filter "Crashing Waves" depois, misturado pela metade. Opcional: "Wind Air God.wav" esticado e filtrado como camada de fundo (nunca sozinho).
Laço: renderizar duas voltas (64 s) e cortar de 32 s a 64 s, assim a cauda das notas que acabam no fim já está no começo.
""".strip()
    return p


# ======================================================================== passos (4 variações cada)

def passo_tabua() -> Partitura:
    p = _sfx("som.passo_tabua", "Passo na tábua", 4, 4402, cauda=0.3)
    CA = GM["conga_abafada"]
    for i, (corpo, vel, grave, cong, rangido) in enumerate(
            [(50, 84, 36, 40, False), (52, 76, 38, 34, False), (49, 90, 35, 44, False), (53, 80, 37, 38, True)]):
        t = float(i)
        p.add("sfx_madeira", [[corpo, t, 0.06, vel], [corpo + 3, t + 0.035, 0.04, vel * 0.5]])
        p.add("percussao_latina", [[CA, t, 0.06, cong]])
        p.add("sfx_grave", [[grave, t, 0.07, 40]])
        if rangido:
            p.add("sfx_madeira", [[70, t + 0.06, 0.03, 22], [72, t + 0.075, 0.03, 18]])
    _trechos(p, ["passo_1", "passo_2", "passo_3", "passo_4"], 0.1)
    p.observacoes = """
Passo no piso de tábua (dentro de casa). Quatro variações em trechos (passo_1 a passo_4); o jogo ainda sorteia o tom em ±6%. Para usar as quatro, EFFECTS.passoTabua em shared/sounds.ts vira quatro SoundSpec com o `region` de cada trecho.
Cada passo: calcanhar e ponta (dois toques de madeira a 35 ms), conga abafada por baixo (o oco do assoalho) e um grave curto (peso). A variação 4 tem um rangido mínimo da tábua.
No Live: sfx_madeira = Designer Drums "Kick Wood" ou Operator de madeira, decay curto (60–90 ms), um pouco de ressonância em 200–400 Hz; sfx_grave = "Low Floor" (Designer Drums) bem baixo; conga abafada da Latin Percussion com o ataque amaciado. Mono, sem reverb (o jogo põe o lugar).
""".strip()
    return p


def passo_grama() -> Partitura:
    p = _sfx("som.passo_grama", "Passo na grama", 4, 4403, cauda=0.12)
    CB, MA = GM["cabasa"], GM["maracas"]
    for i, (alto, medio, v, atraso) in enumerate([(74, 67, 54, 0.02), (76, 66, 48, 0.025), (72, 68, 58, 0.018),
                                                  (75, 65, 50, 0.03)]):
        t = float(i)
        p.add("sfx_ruido", [[alto, t, 0.09, v], [medio, t + atraso, 0.07, v - 14]])
        p.add("percussao_latina", [[CB, t, 0.06, 30 + i * 2], [MA, t + atraso + 0.01, 0.05, 22]])
        p.add("sfx_grave", [[40 + (i % 2), t, 0.05, 22]])
    _trechos(p, ["passo_1", "passo_2", "passo_3", "passo_4"], 0.08)
    p.observacoes = """
Passo na grama (exterior). Quatro variações em trechos. Farfalhar: duas rajadas curtas de ruído (uma aguda, outra média, 20–30 ms depois), cabasa e maracas bem baixas como grãos, e um baque quase inaudível.
No Live: sfx_ruido com filtro passa-banda (o tom da nota é o centro), envelope de 80–100 ms; cabasa e maracas da Latin Percussion (ou "Caxixi 1 Hand") com passa-baixa em 6 kHz; "Hihat Closed Grassy" filtrado é um bom ingrediente extra. Mono, sem reverb.
""".strip()
    return p


def passo_pedra() -> Partitura:
    p = _sfx("som.passo_pedra", "Passo na pedra", 4, 4404, cauda=0.1)
    CL = GM["claves"]
    for i, (ruido, v, grave) in enumerate([(62, 56, 38), (64, 50, 39), (60, 60, 37), (63, 54, 38)]):
        t = float(i)
        p.add("percussao_latina", [[CL, t, 0.03, 34 + i]])
        p.add("sfx_ruido", [[ruido, t, 0.06, v], [ruido + 4, t + 0.025, 0.04, v - 16]])
        p.add("sfx_click", [[70 + i, t, 0.02, 38]])
        p.add("sfx_grave", [[grave, t, 0.05, 40]])
    _trechos(p, ["passo_1", "passo_2", "passo_3", "passo_4"], 0.08)
    p.observacoes = """
Passo na pedra (caminho, castelo). Quatro variações em trechos. Toque duro e seco (claves baixas e um clique), o "crec" do cascalho em duas rajadas de ruído curtas, e um corpo grave pequeno.
No Live: sfx_ruido com ataque zero e decay de 50 ms, um pouco de distorção (Roar ou Saturator) para virar pedrisco; "Grainy Sand.aif" recortado (100 ms) em camada ajuda; sfx_grave = "Kick Dark Stone" bem baixo. Mono, sem reverb.
""".strip()
    return p


# ======================================================================== baú e fogão

def bau_abre() -> Partitura:
    p = _sfx("som.bau_abre", "Baú abre", 1.2, 4405, cauda=0.4)
    r = p.rnd
    p.add("sfx_metal", [[84, 0, 0.03, 72], [79, 0.025, 0.03, 50], [91, 0.15, 0.32, 18]])
    p.add("sfx_madeira", _rangido(0.12, 0.42, (62, 70, 65), (28, 50), r))
    p.add("percussao_latina", [[GM["guiro_longo"], 0.12, 0.4, 30]])
    p.add("sfx_madeira", [[50, 0.62, 0.08, 66], [58, 0.7, 0.03, 28]])
    p.add("sfx_grave", [[38, 0.62, 0.1, 44]])
    p.observacoes = """
Baú abrindo: o trinco (dois cliques de metal), a dobradiça rangendo enquanto a tampa sobe (uma rajada de estalinhos de madeira cuja altura sobe e desce, com um guiro longo bem baixo por baixo e um fio de metal agudo), e a tampa batendo para trás (baque de madeira e grave) com uma tremidinha no fim. Uns 0,8 s.
No Live: o rangido sai melhor com o sfx_madeira de decay bem curto (20 ms) e um pouco de ressonância (Resonators ou Corpus "Wood"); se quiser mais "nheeec", trocar o guiro pelo "Gu-Creaker1" (Konkrete Breaks) afinado para baixo, em camada. sfx_metal = Operator metálico curto (DS Clang serve). Mono.
""".strip()
    return p


def bau_fecha() -> Partitura:
    p = _sfx("som.bau_fecha", "Baú fecha", 1.0, 4406, cauda=0.4)
    r = p.rnd
    p.add("sfx_madeira", _rangido(0.0, 0.2, (68, 66, 62), (26, 40), r))
    p.add("sfx_madeira", [[48, 0.26, 0.1, 108], [60, 0.31, 0.03, 34], [57, 0.34, 0.03, 24]])
    p.add("sfx_grave", [[36, 0.26, 0.14, 92]])
    p.add("percussao_latina", [[GM["conga_grave"], 0.26, 0.1, 50]])
    p.add("sfx_metal", [[86, 0.42, 0.03, 70], [81, 0.445, 0.03, 48]])
    p.observacoes = """
Baú fechando: rangido curto descendo, a tampa batendo (madeira forte, grave e conga grave juntos), a tremida da tampa e o trinco no fim. Uns 0,5 s.
No Live: o baque precisa de corpo em 100–200 Hz (sfx_grave = "Low Floor" ou "Kick Door" em camada) e pouco agudo; o trinco é o mesmo metal do abrir. Mono.
""".strip()
    return p


def fogao_acende() -> Partitura:
    p = _sfx("som.fogao_acende", "Fogão acende", 2.0, 4407, cauda=0.6)
    r = p.rnd
    p.add("sfx_ruido", [[86, 0, 0.12, 82], [45, 0.18, 0.6, 72]])
    p.add("sfx_click", [[90, 0, 0.02, 60], [88, 0.05, 0.02, 40]])
    fogo = [[50, 0.2, 1.0, 84], [48, 1.0, 0.8, 46]]
    for _ in range(10):
        fogo.append([r.randint(74, 92), round(r.uniform(0.45, 1.6), 3), 0.02, r.randint(26, 56)])
    p.add("sfx_fogo", fogo)
    p.add("sfx_grave", [[33, 0.2, 0.15, 50]])
    p.observacoes = """
Fogão acendendo: o fósforo riscado (ruído agudo curto e dois cliques), o "fuuf" do fogo pegando (ruído grave abrindo e a chama crescendo no sfx_fogo, um grave curto por baixo), os primeiros estalos e a chama assentando, que emenda no laço da lareira (o fogão usa o som da lareira, PLACED.fogao). Uns 1,8 s.
No Live: o "fuuf" = Operator "Noise Hit Attack" com Auto Filter abrindo em 300 ms; a chama = ruído com filtro passa-banda e um pouco de Saturator; estalos = sfx_fogo de 20 ms (ou "Crackle Vinyl Pop.wav" recortado, em camada). Mono.
""".strip()
    return p


# ======================================================================== substitutos opcionais (.nosso)

def porta() -> Partitura:
    p = _sfx("som.porta.nosso", "Porta (nossa)", 3.6, 4410, cauda=0.3)
    r = p.rnd
    p.add("sfx_metal", [[82, 0.1, 0.03, 70], [77, 0.13, 0.03, 50], [84, 3.12, 0.03, 66], [79, 3.145, 0.03, 46]])
    p.add("sfx_madeira", _rangido(0.22, 0.6, (60, 67, 63), (24, 44), r))
    p.add("sfx_madeira", _rangido(2.55, 0.35, (66, 63, 60), (22, 36), r))
    p.add("sfx_madeira", [[47, 3.0, 0.1, 100], [58, 3.05, 0.03, 30]])
    p.add("sfx_grave", [[36, 3.0, 0.15, 84]])
    p.add("sfx_ruido", [[52, 0.3, 0.9, 22]])
    p.extra["regiao_no_jogo"] = [0.1, 3.45]
    p.observacoes = """
Substituto opcional de som.porta (hoje da biblioteca do Roblox, EFFECTS.porta com region [0.1, 3.45]). Mesma linha do tempo do original para o `region` continuar valendo: maçaneta em 0,1 s, a porta abrindo e rangendo, um sopro de ar, e de 2,55 s a 3,15 s a porta voltando, batendo e o trinco. Só trocar se ficar melhor que o atual.
No Live: as mesmas camadas do baú (madeira curta com ressonância, metal curto, grave), a batida mais grave e mais cheia que a do baú. Mono.
""".strip()
    return p


def pote_quebra() -> Partitura:
    p = _sfx("som.pote_quebra.nosso", "Pote quebra (nosso)", 2.8, 4411, cauda=0.4)
    r = p.rnd
    p.add("sfx_grave", [[40, 0.1, 0.12, 100]])
    p.add("sfx_madeira", [[55, 0.1, 0.05, 90]])
    p.add("sfx_ruido", [[70, 0.1, 0.25, 70]])
    cacos = [[r.randint(84, 100), round(0.1 + r.uniform(0, 0.4) ** 1.6, 3), round(r.uniform(0.03, 0.08), 3),
              r.randint(40, 80)] for _ in range(12)]
    p.add("sfx_sino", cacos)
    resto = []
    for i in range(22):
        x = i / 21
        t = 0.2 + 1.9 * x ** 1.5 + r.uniform(-0.02, 0.02)
        resto.append([r.randint(70, 95), round(t, 3), 0.02, int(70 - 50 * x + r.uniform(-6, 6))])
    p.add("sfx_click", resto)
    p.extra["regiao_no_jogo"] = [0.1, 2.6]
    p.observacoes = """
Substituto opcional de som.pote_quebra (EFFECTS.poteQuebra, region [0.1, 2.6]): o impacto em 0,1 s (grave, corpo de barro e um estouro de ruído), cacos de cerâmica agudos nos primeiros 0,4 s, e os pedacinhos caindo e quicando cada vez mais espaçados e baixos até 2,1 s.
No Live: sfx_sino = sino curto e inarmônico (Collision ou "Ceramic Tiles.adg" do Sound Objects Lite); sfx_click = cliques de 20 ms com afinação aleatória. Mono.
""".strip()
    return p


def respingo() -> Partitura:
    p = _sfx("som.respingo.nosso", "Respingo (nosso)", 1.2, 4412, cauda=0.2)
    r = p.rnd
    p.add("sfx_ruido", [[72, 0, 0.35, 76], [60, 0.02, 0.25, 50]])
    bolhas = [[60 + i * 4, round(i * 0.02, 3), 0.05, 60 - i * 3] for i in range(6)]
    bolhas += [[r.randint(80, 96), round(r.uniform(0.3, 0.95), 3), 0.04, r.randint(30, 60)] for _ in range(7)]
    p.add("sfx_bolha", bolhas)
    p.extra["regiao_no_jogo"] = [0, 1.1]
    p.observacoes = """
Substituto opcional de som.respingo (EFFECTS.respingo, region [0, 1.1]): o "tchá" (ruído agudo e médio), uma escadinha de bolhas subindo e gotas caindo até 1 s.
No Live: sfx_bolha = seno com queda rápida de afinação (Operator, pitch envelope de +12 a 0 em 30 ms) — é o "plic" de gota; sfx_ruido com passa-banda e envelope de 300 ms. Mono.
""".strip()
    return p


def lareira() -> Partitura:
    p = _sfx("som.lareira.nosso", "Lareira (nossa)", 16, 4413, laco=True, cauda=0.0)
    r = p.rnd
    p.add("sfx_ruido", [[36, 0, 16, 34]])
    fogo = [[43, 0, 16, 50]]
    t = 0.8
    while t < 13.5:  # labaredas: ondas lentas de chama, sem pulso
        dur = r.uniform(1.5, 3.0)
        fogo.append([r.randint(50, 55), round(t, 3), round(min(dur, 15.0 - t), 3), r.randint(30, 45)])
        t += r.uniform(2.0, 3.6)
    estalos = sorted(round(r.uniform(0.3, 15.7), 3) for _ in range(60))
    fogo += [[r.randint(72, 96), x, 0.02, r.randint(18, 70)] for x in estalos]
    p.add("sfx_fogo", fogo)
    p.add("sfx_madeira", [[r.randint(60, 70), round(r.uniform(0.5, 15.5), 3), 0.03, r.randint(50, 80)]
                          for _ in range(6)])
    p.extra["modo"] = "laço pelo lugar"
    p.observacoes = """
Substituto opcional de som.lareira (PLACED.lareira e PLACED.fogao, laço). 16 s: um rumor grave contínuo, a chama (nota longa e labaredas lentas sorteadas), 60 estalos espalhados sem pulso e 6 estouros de lenha (madeira).
No Live: sfx_fogo = ruído rosa com passa-banda que acompanha a nota e Saturator; estalos de 20 ms com afinação aleatória ("Crackle Tuning.wav" em camada ajuda). Laço: renderizar duas voltas e cortar a segunda (32 s → de 16 a 32 s). Estéreo leve ou mono (é som posicionado).
""".strip()
    return p


def torneira() -> Partitura:
    p = _sfx("som.torneira.nosso", "Torneira (nossa)", 18, 4414, cauda=0.3)
    r = p.rnd
    p.add("sfx_metal", _rangido(0.0, 0.3, (80, 88, 86), (30, 48), r)
          + _rangido(14.3, 0.3, (88, 84, 80), (28, 44), r))
    p.add("sfx_ruido", [[70, 0.25, 0.35, 40], [70, 0.6, 1.0, 60], [70, 1.6, 11.8, 66], [58, 1.6, 11.8, 44],
                        [70, 14.0, 0.8, 60], [58, 14.0, 0.7, 40]])
    bolhas = [[60, 0.3, 0.1, 50], [64, 0.45, 0.1, 45], [62, 0.7, 0.08, 40]]
    bolhas += [[r.randint(58, 80), round(r.uniform(2.1, 12.8), 3), round(r.uniform(0.05, 0.1), 3), r.randint(25, 50)]
               for _ in range(30)]
    bolhas += [[84, 15.2, 0.05, 40], [86, 15.9, 0.05, 32], [83, 16.8, 0.05, 24]]
    p.add("sfx_bolha", bolhas)
    p.extra["regioes_no_jogo"] = {"abre": [0, 1.6], "laco": [2, 13], "fecha": [14, 17.4]}
    p.observacoes = """
Substituto opcional de som.torneira, na mesma linha do tempo do arquivo de hoje, para os recortes de shared/sounds.ts continuarem valendo: abre = 0 a 1,6 s (o registro rangendo e a água começando), laço = 2 a 13 s (água correndo estável com gorgolejos sorteados; PLACED.torneira faz o laço nesse trecho), fecha = 14 a 17,4 s (água, o registro fechando e três gotas).
No Live: sfx_ruido = ruído com passa-banda em 2–4 kHz e um pouco de modulação lenta (água), o grave em 58 dá o corpo; sfx_bolha = o "plic" (seno com queda rápida de afinação); sfx_metal curto e agudo para o registro. Mono.
""".strip()
    return p


def todas() -> list[Partitura]:
    return [vento(), passo_tabua(), passo_grama(), passo_pedra(), bau_abre(), bau_fecha(), fogao_acende(),
            porta(), pote_quebra(), respingo(), lareira(), torneira()]


if __name__ == "__main__":
    for p in todas():
        p.salvar()
