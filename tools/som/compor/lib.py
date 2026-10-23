"""Biblioteca das partituras do Haywood Valley (2026-10-20).

Escreve as partituras JSON do formato de `docs/audio/PRODUCAO.md` e a prévia MIDI de cada uma.
Cada peça é um módulo deste diretório que monta uma `Partitura` com notas escritas à mão (a melodia
numa notação curta, `mel`) e acompanhamentos tirados da harmonia (`Harmonia`, `voz`, `baixo_de`).

Notação de melodia (`mel`): fichas separadas por espaço, `ALTURA:DURAÇÃO[sufixos]`.
  - ALTURA: `C4` = 60, `F#5`, `Bb3`; `r` é pausa; `C5+E5` é um acorde (todas com a mesma duração).
  - DURAÇÃO em tempos (semínimas): `1`, `0.5`, `1.5`.
  - sufixos: `>` acento (+12), `<` mais leve (−12), `'` staccato (metade), `_` ligado (valor cheio).
Tempos são sempre semínimas, mesmo em 3/4.
"""
from __future__ import annotations

import json
import math
import random
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[3]
PARTITURAS = RAIZ / "assets" / "musica" / "partituras"
MIDI = RAIZ / "assets" / "musica" / "midi"

# ---------------------------------------------------------------- papéis (vocabulário de PRODUCAO.md)
# papel: (mais grave, mais agudo, programa GM da prévia, é percussão, é monofônico)
# As extensões são as do instrumento real em altura de som (o que a montagem toca), um pouco por dentro dos
# extremos. Glockenspiel e crotales soam duas oitavas acima do escrito; aqui vale o som.
PAPEIS: dict[str, tuple[int, int, int, bool, bool]] = {
    "piano": (21, 108, 0, False, False),
    "piano_suave": (21, 108, 0, False, False),
    "celesta": (60, 108, 8, False, False),
    "caixinha_de_musica": (60, 100, 10, False, False),
    "harpa": (24, 103, 46, False, False),
    "violao": (40, 83, 24, False, False),
    "guitarra_limpa": (40, 86, 27, False, False),
    "guitarra_distorcida": (40, 86, 30, False, False),
    "baixo_eletrico": (28, 67, 33, False, False),
    "koto": (43, 93, 107, False, False),
    "cordas_legato": (28, 100, 48, False, False),
    "cordas_staccato": (28, 100, 48, False, False),
    "cordas_pizzicato": (28, 96, 45, False, False),
    "violoncelo": (36, 76, 42, False, True),
    "contrabaixo": (28, 60, 43, False, True),
    "metais": (34, 84, 61, False, False),
    "trompa": (34, 77, 60, False, True),
    "trompete": (54, 82, 56, False, True),
    "trombone": (40, 72, 57, False, True),
    "flauta": (60, 96, 73, False, True),
    "flautim": (74, 108, 72, False, True),
    "oboe": (58, 91, 68, False, True),
    "clarinete": (50, 91, 71, False, True),
    "fagote": (34, 75, 70, False, True),
    "shakuhachi": (55, 86, 77, False, True),
    "glockenspiel": (72, 108, 9, False, False),
    "marimba": (45, 96, 12, False, False),
    "vibrafone": (53, 89, 11, False, False),
    "xilofone": (65, 108, 13, False, False),
    "sinos_tubulares": (60, 77, 14, False, False),
    "crotales": (72, 96, 9, False, False),
    "bateria_rock": (35, 59, 0, True, False),
    "bateria_leve": (35, 59, 0, True, False),
    "percussao_latina": (35, 82, 0, True, False),
    "taiko": (36, 48, 0, True, False),
    "percussao_orquestral": (35, 60, 0, True, False),
    "pad": (36, 96, 89, False, False),
    "pad_quente": (36, 96, 89, False, False),
    "lead": (48, 96, 80, False, True),
    "baixo_synth": (24, 60, 38, False, True),
    "chip_quadrada": (36, 96, 80, False, False),
    "chip_triangulo": (28, 84, 82, False, False),
    "chip_ruido": (24, 96, 122, False, False),
    "arpejo": (36, 96, 81, False, False),
    "sfx_madeira": (24, 108, 115, False, False),
    "sfx_metal": (24, 108, 112, False, False),
    "sfx_ruido": (24, 108, 122, False, False),
    "sfx_fogo": (24, 108, 122, False, False),
    "sfx_bolha": (24, 108, 117, False, False),
    "sfx_click": (24, 108, 115, False, False),
    "sfx_sino": (24, 108, 112, False, False),
    "sfx_grave": (24, 108, 116, False, False),
    # 2026-10-23 (animais e ferramentas): vozes com portamento (notas ligadas deslizam; por isso não são
    # "monofônicas" aqui: a sobreposição é o que faz o deslize), assobio e o metal das ferramentas.
    "voz_grave": (24, 84, 58, False, False),
    "voz_nasal": (36, 96, 68, False, False),
    "assobio": (60, 108, 78, False, False),
    "sfx_ferramenta": (24, 108, 112, False, False),
    "sfx_ruido_curto": (24, 108, 122, False, False),
}

# Mapa GM usado pelos papéis de percussão (para ler as partituras).
GM = {
    "bumbo": 36, "aro": 37, "caixa": 38, "palma": 39, "chimbal": 42, "pedal": 44, "chimbal_aberto": 46,
    "prato": 49, "conducao": 51, "pandeirola": 54, "cowbell": 56,
    "bongo_agudo": 60, "bongo_grave": 61, "conga_abafada": 62, "conga_aberta": 63, "conga_grave": 64,
    "cabasa": 69, "maracas": 70, "guiro_curto": 73, "guiro_longo": 74, "claves": 75,
    "bloco_agudo": 76, "bloco_grave": 77, "triangulo_abafado": 80, "triangulo": 81, "shaker": 82,
}

# ---------------------------------------------------------------- alturas

_LETRAS = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def altura(nome: str) -> int:
    """`C4` = 60. Aceita `#`, `b` e oitava com sinal."""
    m = re.fullmatch(r"([A-G])([#b]*)(-?\d+)", nome)
    if not m:
        raise ValueError(f"altura inválida: {nome}")
    pc = _LETRAS[m.group(1)] + m.group(2).count("#") - m.group(2).count("b")
    return 12 * (int(m.group(3)) + 1) + pc


def pc_de(nome: str) -> int:
    pc = _LETRAS[nome[0]] + nome[1:].count("#") - nome[1:].count("b")
    return pc % 12


# ---------------------------------------------------------------- melodia


def mel(texto: str, t0: float = 0.0, vel: int = 80, art: float = 0.92) -> tuple[list[list], float]:
    """Lê a notação curta (ver o cabeçalho). Devolve as notas e o tempo em que a frase acaba."""
    notas: list[list] = []
    t = t0
    for ficha in texto.split():
        m = re.fullmatch(r"(.+?):(\d+(?:\.\d+)?)([>'_<]*)", ficha)
        if not m:
            raise ValueError(f"ficha inválida: {ficha}")
        alt, dur, suf = m.group(1), float(m.group(2)), m.group(3)
        if alt != "r":
            v = vel + (12 if ">" in suf else 0) - (12 if "<" in suf else 0)
            d = dur * (0.5 if "'" in suf else (1.0 if "_" in suf else art))
            for a in alt.split("+"):
                notas.append([altura(a), t, d, v])
        t += dur
    return notas, t


def transpor(notas: list[list], semitons: int) -> list[list]:
    return [[n[0] + semitons, n[1], n[2], n[3]] for n in notas]


def deslocar(notas: list[list], tempos: float) -> list[list]:
    return [[n[0], n[1] + tempos, n[2], n[3]] for n in notas]


def contorno(notas: list[list], quanto: float = 0.5) -> list[list]:
    """Nota mais aguda sai um pouco mais forte (o jeito de quem canta): velocidade + (altura − média) × quanto."""
    if not notas:
        return notas
    media = sum(n[0] for n in notas) / len(notas)
    return [[n[0], n[1], n[2], n[3] + (n[0] - media) * quanto] for n in notas]


def dinamica(notas: list[list], pontos: list[tuple[float, float]]) -> list[list]:
    """Multiplica a velocidade por uma curva em tempos: [(tempo, fator), ...], linear entre os pontos."""
    def fator(t: float) -> float:
        if t <= pontos[0][0]:
            return pontos[0][1]
        for (a, fa), (b, fb) in zip(pontos, pontos[1:]):
            if a <= t <= b:
                return fa + (fb - fa) * ((t - a) / (b - a) if b > a else 0)
        return pontos[-1][1]

    return [[n[0], n[1], n[2], n[3] * fator(n[1])] for n in notas]


# ---------------------------------------------------------------- harmonia

QUALIDADES = {
    "": [0, 4, 7], "m": [0, 3, 7], "7": [0, 4, 7, 10], "maj7": [0, 4, 7, 11], "m7": [0, 3, 7, 10],
    "m6": [0, 3, 7, 9], "6": [0, 4, 7, 9], "sus4": [0, 5, 7], "sus2": [0, 2, 7], "7sus4": [0, 5, 7, 10],
    "add9": [0, 4, 7, 14], "maj9": [0, 4, 7, 11, 14], "m9": [0, 3, 7, 10, 14], "9": [0, 4, 7, 10, 14],
    "dim": [0, 3, 6], "m7b5": [0, 3, 6, 10], "madd9": [0, 3, 7, 14], "6/9": [0, 4, 7, 9, 14],
}


class Acorde:
    def __init__(self, simbolo: str):
        self.simbolo = simbolo
        corpo, _, baixo = simbolo.partition("/") if not simbolo.endswith("6/9") else (simbolo, "", "")
        n = 2 if len(corpo) > 1 and corpo[1] in "#b" else 1
        self.raiz = pc_de(corpo[:n])
        q = corpo[n:]
        if q not in QUALIDADES:
            raise ValueError(f"acorde desconhecido: {simbolo}")
        self.intervalos = QUALIDADES[q]
        self.baixo = pc_de(baixo) if baixo else self.raiz

    @property
    def pcs(self) -> list[int]:
        return [(self.raiz + i) % 12 for i in self.intervalos]

    def pc(self, grau: int) -> int:
        """Grau do acorde: 1 raiz, 3 terça, 5 quinta, 7 sétima (o que houver)."""
        idx = {1: 0, 3: 1, 5: 2, 7: 3}[grau]
        return (self.raiz + self.intervalos[min(idx, len(self.intervalos) - 1)]) % 12


class Harmonia:
    """Os acordes no tempo, de um texto por compasso: `"Fmaj7 | G/F | Gm7:2 C7:2"` (sem `:` divide o compasso)."""

    def __init__(self, texto: str, tempos_compasso: float, inicio: float = 0.0):
        self.trechos: list[tuple[float, float, Acorde]] = []
        t = inicio
        for compasso in [c.strip() for c in texto.split("|") if c.strip()]:
            fichas = compasso.split()
            sem_dur = [f for f in fichas if ":" not in f]
            com_dur = sum(float(f.split(":")[1]) for f in fichas if ":" in f)
            resto = (tempos_compasso - com_dur) / len(sem_dur) if sem_dur else 0
            for f in fichas:
                if ":" in f:
                    s, d = f.rsplit(":", 1)
                    d = float(d)
                else:
                    s, d = f, resto
                self.trechos.append((t, d, Acorde(s)))
                t += d
        self.fim = t

    def em(self, t: float) -> Acorde:
        for a, d, ac in self.trechos:
            if a <= t < a + d:
                return ac
        return self.trechos[-1][2]

    def __add__(self, outra: "Harmonia") -> "Harmonia":
        h = Harmonia.__new__(Harmonia)
        h.trechos = self.trechos + outra.trechos
        h.fim = max(self.fim, outra.fim)
        return h


def perto(pc: int, alvo: float, lo: int, hi: int) -> int:
    """A altura de classe `pc` dentro de [lo, hi] mais perto de `alvo`."""
    cands = [p for p in range(lo, hi + 1) if p % 12 == pc]
    if not cands:  # faixa menor que uma oitava sem essa nota: a mais perto da faixa, por cima
        cands = [p for p in range(hi + 1, hi + 13) if p % 12 == pc]
    return min(cands, key=lambda p: abs(p - alvo))


def baixo_de(ac: Acorde, anterior: int | None, lo: int = 36, hi: int = 52) -> int:
    alvo = anterior if anterior is not None else (lo + hi) / 2
    return perto(ac.baixo, alvo, lo, hi)


def voz(anterior: list[int] | None, ac: Acorde, lo: int, hi: int, n: int, sem_raiz: bool = False,
        _frouxo: bool = False) -> list[int]:
    """Vozes de cima (n notas em [lo, hi]) com a menor viagem desde `anterior`; terça (e sétima) obrigatórias."""
    from itertools import combinations

    pcs = ac.pcs
    obrig = {pcs[1]} | ({pcs[3]} if len(pcs) > 3 else set())
    if ac.intervalos[1] == 5 or ac.intervalos[1] == 2:  # sus: a quarta/segunda no lugar da terça
        obrig = {pcs[1]}
    permitidas = set(pcs) - ({ac.raiz} if sem_raiz and len(pcs) >= n else set())
    cands = [p for p in range(lo, hi + 1) if p % 12 in permitidas]
    melhor, custo_m = None, 1e9
    for comb in combinations(cands, n):
        if not obrig <= {p % 12 for p in comb}:
            continue
        if len({p % 12 for p in comb}) < min(n, len(permitidas)) - (1 if _frouxo else 0):
            continue
        ok = all(b - a >= (2 if _frouxo else 3 if a >= 55 else 5) for a, b in zip(comb, comb[1:]))
        if not ok:
            continue
        if any(b - a in (13, 25) for i, a in enumerate(comb) for b in comb[i + 1:]):
            continue  # 9ª menor entre duas vozes (a sétima maior abaixo da fundamental): soa sujo
        if anterior:
            custo = sum(abs(a - b) for a, b in zip(sorted(anterior), comb))
        else:
            custo = abs(sum(comb) / n - (lo + hi) / 2) * n
        custo += (comb[-1] - comb[0]) * 0.05  # aberto, mas não espalhado à toa
        if custo < custo_m:
            melhor, custo_m = list(comb), custo
    if melhor is None:
        if sem_raiz:  # sem saída sem a raiz (acorde suspenso numa faixa estreita): com a raiz
            return voz(anterior, ac, lo, hi, n, False)
        if not _frouxo:  # faixa estreita demais: aceita uma nota dobrada e vozes mais juntas
            return voz(anterior, ac, lo, hi, n, False, True)
        raise ValueError(f"sem voicing para {ac.simbolo} em [{lo}, {hi}] com {n}")
    return melhor


# ---------------------------------------------------------------- partitura


class Partitura:
    def __init__(self, chave: str, titulo: str, bpm: float, compasso: tuple[int, int], tom: str,
                 compassos: int, laco: bool, cauda_s: float, semente: int):
        self.chave, self.titulo, self.bpm, self.compasso, self.tom = chave, titulo, bpm, compasso, tom
        self.compassos, self.laco, self.cauda_s = compassos, laco, cauda_s
        self.trilhas: dict[str, list[list]] = {}
        self.trechos: list[dict] | None = None
        self.observacoes = ""
        self.extra: dict = {}
        self.rnd = random.Random(semente)

    @property
    def tc(self) -> float:
        """Tempos (semínimas) por compasso."""
        return self.compasso[0] * 4 / self.compasso[1]

    @property
    def total(self) -> float:
        return self.compassos * self.tc

    def seg(self, tempos: float) -> float:
        return tempos * 60 / self.bpm

    def c(self, n: float) -> float:
        """Começo do compasso n (contado de 1)."""
        return (n - 1) * self.tc

    def add(self, papel: str, notas: list[list]):
        if papel not in PAPEIS:
            raise ValueError(f"papel fora do vocabulário: {papel}")
        self.trilhas.setdefault(papel, []).extend([list(n) for n in notas])

    def humanizar(self, papel: str, t_jit: float = 0.015, v_jit: float = 6, fixar_inicio: bool = True):
        """Inícios ±t_jit tempos e velocidades ±v_jit, sorteados com a semente da peça. Nota no tempo 0 não sai antes."""
        r = self.rnd
        for n in self.trilhas.get(papel, []):
            dt = r.uniform(-t_jit, t_jit)
            if n[1] + dt < 0 or (fixar_inicio and n[1] == 0):
                dt = abs(dt) if n[1] > 0 else 0
            n[1] += dt
            n[3] += r.uniform(-v_jit, v_jit)

    def finalizar(self):
        for papel, notas in self.trilhas.items():
            lo, hi, _, perc, mono = PAPEIS[papel]
            notas.sort(key=lambda n: (n[1], n[0]))
            for n in notas:
                n[3] = int(round(max(1, min(127, n[3]))))
                if n[1] + n[2] > self.total:  # nada passa do fim (o laço fecha no compasso)
                    n[2] = self.total - n[1]
            if mono:  # instrumento de uma voz: a nota acaba antes da próxima começar
                for a, b in zip(notas, notas[1:]):
                    if a[1] + a[2] > b[1] - 0.01:
                        a[2] = max(0.03, b[1] - a[1] - 0.01)
            for n in notas:
                n[1], n[2] = round(n[1], 3), round(max(n[2], 0.01), 3)
            self.trilhas[papel] = [n for n in notas if n[2] > 0]

    def duracao_s(self) -> float:
        return round(self.seg(self.total), 3)

    def para_json(self) -> dict:
        d = {
            "chave": self.chave, "titulo": self.titulo, "bpm": self.bpm, "compasso": list(self.compasso),
            "tom": self.tom, "compassos": self.compassos, "laco": self.laco, "cauda_s": self.cauda_s,
            "duracao_s": self.duracao_s(),
        }
        d.update(self.extra)
        if self.trechos is not None:
            d["trechos"] = self.trechos
        d["trilhas"] = [{"papel": p, "notas": n} for p, n in self.trilhas.items() if n]
        d["observacoes"] = self.observacoes.strip()
        return d

    def salvar(self):
        self.finalizar()
        PARTITURAS.mkdir(parents=True, exist_ok=True)
        MIDI.mkdir(parents=True, exist_ok=True)
        (PARTITURAS / f"{self.chave}.json").write_text(json_bonito(self.para_json()), encoding="utf-8")
        midi(self, MIDI / f"{self.chave}.mid")
        return self


def json_bonito(d: dict) -> str:
    """JSON com uma nota por linha (fácil de ler e de comparar)."""
    texto = json.dumps(d, ensure_ascii=False, indent=2)
    # junta as listas de 4 números ([altura, início, duração, velocidade]) numa linha só
    texto = re.sub(r"\[\s+(-?[\d.]+),\s+(-?[\d.]+),\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]", r"[\1, \2, \3, \4]", texto)
    texto = re.sub(r"\[\s+([\d.]+),\s+([\d.]+)\s+\]", r"[\1, \2]", texto)  # compasso, regiões
    # cada trecho numa linha: {"nome": ..., "inicio_s": ..., "fim_s": ...}
    texto = re.sub(r'\{\s+("nome": "[^"]*"),\s+("inicio_s": [\d.]+),\s+("fim_s": [\d.]+)\s+\}', r"{\1, \2, \3}", texto)
    return texto + "\n"


def midi(p: Partitura, caminho: Path):
    """Prévia: uma trilha e um canal por papel (percussão no canal 10, o do GM), com o programa GM mais parecido."""
    import mido

    tpb = 480
    arq = mido.MidiFile(ticks_per_beat=tpb, type=1)
    meta = mido.MidiTrack()
    meta.append(mido.MetaMessage("track_name", name=f"{p.chave} | {p.titulo}", time=0))
    meta.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(p.bpm), time=0))
    meta.append(mido.MetaMessage("time_signature", numerator=p.compasso[0], denominator=p.compasso[1], time=0))
    meta.append(mido.MetaMessage("end_of_track", time=int(p.total * tpb)))
    arq.tracks.append(meta)
    livres = [c for c in range(16) if c != 9]
    for papel, notas in p.trilhas.items():
        if not notas:
            continue
        _, _, prog, perc, _ = PAPEIS[papel]
        canal = 9 if perc else livres.pop(0) if livres else 15
        tr = mido.MidiTrack()
        tr.append(mido.MetaMessage("track_name", name=papel, time=0))
        if not perc:
            tr.append(mido.Message("program_change", channel=canal, program=prog, time=0))
        eventos = []
        for alt, t, d, v in notas:
            a = int(round(t * tpb))
            b = max(a + 1, int(round((t + d) * tpb)))
            eventos.append((a, 1, mido.Message("note_on", channel=canal, note=alt, velocity=v)))
            eventos.append((b, 0, mido.Message("note_off", channel=canal, note=alt, velocity=0)))
        eventos.sort(key=lambda e: (e[0], e[1]))
        agora = 0
        for tick, _, msg in eventos:
            msg.time = tick - agora
            agora = tick
            tr.append(msg)
        arq.tracks.append(tr)
    arq.save(caminho)


# ---------------------------------------------------------------- ajudas de acompanhamento


def cheia(notas: list[list], ate: float) -> list[list]:
    """Corta as notas que passam de `ate`."""
    return [[n[0], n[1], min(n[2], ate - n[1]), n[3]] for n in notas if n[1] < ate]


def nota(alt: int, t: float, d: float, v: float) -> list:
    return [alt, t, d, v]


def arredondar_humano(x: float) -> float:
    return math.floor(x * 1000 + 0.5) / 1000


def figura(h: Harmonia, ini: float, fim: float, tc: float, fig: list[tuple], lo: int, hi: int, n: int,
           lo_b: int = 36, hi_b: int = 52, vel: float = 70, sem_raiz: bool = False) -> list[list]:
    """Repete uma figura de acompanhamento compasso a compasso, seguindo a harmonia.

    `fig` é uma lista de (posição no compasso em tempos, ficha, duração, fator de velocidade). Fichas:
    `R` o baixo do acorde, `F` a quinta no grave, `O` o baixo uma oitava acima, `0`..`n-1` as vozes de cima
    (de baixo para cima, conduzidas pela menor viagem), `T` a voz mais aguda.
    """
    notas: list[list] = []
    vozes: list[int] | None = None
    ultimo = None
    b = None
    t = ini
    while t < fim - 1e-9:
        for pos, ficha, dur, vf in fig:
            tt = t + pos
            if tt >= fim - 1e-9:
                continue
            ac = h.em(tt + 1e-6)
            if ac is not ultimo:
                vozes = voz(vozes, ac, lo, hi, n, sem_raiz)
                b = baixo_de(ac, b, lo_b, hi_b)
                ultimo = ac
            if ficha == "R":
                alt = b
            elif ficha == "F":
                alt = perto(ac.pc(5), b + 7, lo_b, hi_b + 7)
            elif ficha == "O":
                alt = b + 12
            elif ficha == "T":
                alt = vozes[-1]
            else:
                alt = vozes[int(ficha)]
            fim_acorde = next((a + d for a, d, x in h.trechos if x is ac), fim)
            notas.append([alt, tt, min(dur, fim - tt, fim_acorde - tt), vel * vf])
        t += tc
    return notas


def limpar(acomp: list[list], melodia: list[list], dur_min: float = 0.5, junto_min: float = 0.25) -> list[list]:
    """Tira do acompanhamento as notas a meio tom (ou meio tom e oitavas) de uma nota da melodia que soa junto:
    a sétima maior das cordas contra a fundamental cantada, a quarta suspensa contra a terça, etc."""
    fora = []
    for n in acomp:
        for m in melodia:
            if m[2] < dur_min:
                continue
            junto = min(n[1] + n[2], m[1] + m[2]) - max(n[1], m[1])
            if junto >= junto_min and abs(n[0] - m[0]) in (1, 13, 25):
                fora.append(n)
                break
    return [n for n in acomp if n not in fora]


def sustentado(h: Harmonia, ini: float, fim: float, lo: int, hi: int, n: int, vel: float,
               sem_raiz: bool = True, folga: float = 0.05) -> list[list]:
    """Um acorde por trecho da harmonia, notas ligadas (cordas, pad, trompa em bloco)."""
    notas: list[list] = []
    vozes = None
    for a, d, ac in h.trechos:
        if a + d <= ini + 1e-9 or a >= fim - 1e-9:
            continue
        s, e = max(a, ini), min(a + d, fim)
        vozes = voz(vozes, ac, lo, hi, n, sem_raiz)
        for alt in vozes:
            notas.append([alt, s, e - s - folga, vel])
    return notas


def linha_baixo(h: Harmonia, ini: float, fim: float, tc: float, ritmo: list[tuple], lo: int, hi: int,
                vel: float, aproximar: bool = True) -> list[list]:
    """Baixo: `ritmo` = [(posição, ficha, duração, fator)], fichas `R` raiz/baixo, `F` quinta, `O` oitava,
    `A` nota de aproximação (meio tom ou tom abaixo/acima do próximo baixo)."""
    notas: list[list] = []
    b = None
    t = ini
    while t < fim - 1e-9:
        for pos, ficha, dur, vf in ritmo:
            tt = t + pos
            if tt >= fim - 1e-9:
                continue
            ac = h.em(tt + 1e-6)
            if ficha == "A" and aproximar:
                prox = h.em(min(t + tc, h.fim - 1e-6) + 1e-6)
                alvo = baixo_de(prox, b, lo, hi)
                cand = [alvo - 2, alvo - 1, alvo + 1, alvo + 2]
                atual = b if b is not None else alvo
                alt = min([c for c in cand if lo <= c <= hi], key=lambda c: (abs(c - atual), c))
            else:
                b = baixo_de(ac, b, lo, hi)
                alt = {"R": b, "O": b + 12 if b + 12 <= hi else b,
                       "F": perto(ac.pc(5), b + 7, lo, hi), "A": b}[ficha]
            notas.append([alt, tt, min(dur, fim - tt), vel * vf])
        t += tc
    return notas


def segunda_voz(melodia: list[list], h: Harmonia, menor: int = 3, maior: int = 9, fator: float = 0.75,
                dur_min: float = 0.5) -> list[list]:
    """Uma voz abaixo da melodia, na nota do acorde mais aguda entre `menor` e `maior` semitons abaixo
    (terças e sextas, como quem harmoniza de ouvido). Notas curtas da melodia ficam sem par."""
    voz2 = []
    for alt, t, d, v in melodia:
        if d < dur_min:
            continue
        pcs = h.em(t + 1e-6).pcs
        cands = [alt - i for i in range(menor, maior + 1) if (alt - i) % 12 in pcs]
        if cands:
            voz2.append([max(cands), t, d, v * fator])
    return voz2


def linha_guia(h: Harmonia, ini: float, fim: float, lo: int, hi: int, vel: float, inicio: float | None = None,
               folga: float = 0.05) -> list[list]:
    """Terças e sétimas dos acordes, cada uma a mais perto da anterior: a linha cantada do violoncelo."""
    notas = []
    atual = inicio if inicio is not None else (lo + hi) / 2
    for a, d, ac in h.trechos:
        if a + d <= ini + 1e-9 or a >= fim - 1e-9:
            continue
        pcs = ac.pcs
        alvo_pcs = [pcs[1]] + ([pcs[3]] if len(pcs) > 3 else [pcs[2]])
        cands = [p for p in range(lo, hi + 1) if p % 12 in alvo_pcs and p != atual] or \
                [p for p in range(lo, hi + 1) if p % 12 in alvo_pcs]
        alt = min(cands, key=lambda p: (abs(p - atual), -p))
        s, e = max(a, ini), min(a + d, fim)
        notas.append([alt, s, e - s - folga, vel])
        atual = alt
    return notas


def rasgueado(vozes: list[int], t: float, dur: float, vel: float, abaixo: bool = True, espaco: float = 0.012):
    """Um acorde rasgueado: as cordas uma depois da outra (para baixo: grave primeiro)."""
    ordem = vozes if abaixo else list(reversed(vozes))
    return [[a, t + i * espaco, max(0.05, dur - i * espaco), vel * (1 - 0.04 * i)] for i, a in enumerate(ordem)]


def simplificar(notas: list[list], dur_min: float = 1.0) -> list[list]:
    """Tira as notas de passagem (mais curtas que `dur_min`) e estica a anterior: a mesma frase, mais calma."""
    out: list[list] = []
    for n in sorted(notas, key=lambda n: n[1]):
        if n[2] < dur_min * 0.9 and out and abs(out[-1][1] + out[-1][2] - n[1]) < 0.2:
            out[-1][2] += n[2] + (n[1] - out[-1][1] - out[-1][2])
            continue
        out.append(list(n))
    return out
