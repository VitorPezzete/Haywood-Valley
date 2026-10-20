"""Confere as partituras de `assets/musica/partituras/` (2026-10-20).

Papéis do vocabulário, alturas na extensão de cada instrumento, durações e velocidades válidas, nada além de
`compassos`, instrumentos de uma voz sem notas sobrepostas, laço que fecha (sem buraco na emenda), trechos dos
kits e dos passos separados por pelo menos 0,3 s de silêncio e com as notas dentro deles, versões de um mesmo lugar
com o mesmo andamento, compasso, tom e tamanho. Sai com código 1 se houver erro.

Uso: python -I tools/som/compor/verificar.py
"""
from __future__ import annotations

import json
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import PAPEIS, PARTITURAS  # noqa: E402

OBRIGATORIAS = ["chave", "titulo", "bpm", "compasso", "tom", "compassos", "laco", "cauda_s", "trilhas", "observacoes"]
FAMILIAS = {
    "ilha": ["musica.ilha_manha", "musica.ilha_dia", "musica.ilha_tarde"],
    "sala": ["musica.sala_dia", "musica.sala_noite"],
}
# (mínimo, máximo) em segundos, pela chave
DURACOES = {
    "musica.titulo": (60, 120), "musica.personalizar": (60, 120),
    "musica.ilha_manha": (90, 180), "musica.ilha_dia": (90, 180), "musica.ilha_tarde": (90, 180),
    "musica.sala_dia": (90, 180), "musica.sala_noite": (90, 180),
    "som.vento": (20, 40),
}


def conferir(caminho: Path) -> tuple[list[str], list[str], dict]:
    erros: list[str] = []
    avisos: list[str] = []
    d = json.loads(caminho.read_text(encoding="utf-8"))
    for k in OBRIGATORIAS:
        if k not in d:
            erros.append(f"falta o campo {k}")
    if erros:
        return erros, avisos, d
    if d["chave"] != caminho.stem:
        erros.append(f"chave {d['chave']} diferente do arquivo")
    num, den = d["compasso"]
    tc = num * 4 / den
    total = d["compassos"] * tc
    seg = 60 / d["bpm"]
    todas: list[tuple[str, list]] = []
    for tr in d["trilhas"]:
        papel = tr["papel"]
        if papel not in PAPEIS:
            erros.append(f"papel fora do vocabulário: {papel}")
            continue
        lo, hi, _, _, mono = PAPEIS[papel]
        notas = tr["notas"]
        if not notas:
            avisos.append(f"{papel}: trilha vazia")
        for n in notas:
            if len(n) != 4:
                erros.append(f"{papel}: nota mal formada {n}")
                continue
            alt, t, dur, vel = n
            if not isinstance(alt, int) or not lo <= alt <= hi:
                erros.append(f"{papel}: altura {alt} fora de [{lo}, {hi}] em t={t}")
            if t < 0:
                erros.append(f"{papel}: começa antes do zero ({t})")
            if dur <= 0:
                erros.append(f"{papel}: duração {dur} em t={t}")
            if not isinstance(vel, int) or not 1 <= vel <= 127:
                erros.append(f"{papel}: velocidade {vel} em t={t}")
            if t + dur > total + 1e-6:
                erros.append(f"{papel}: nota passa do fim ({t} + {dur} > {total})")
            todas.append((papel, n))
        if mono:
            ord_ = sorted(notas, key=lambda n: n[1])
            for a, b in zip(ord_, ord_[1:]):
                if a[1] + a[2] > b[1] + 0.001:
                    erros.append(f"{papel} (uma voz): notas sobrepostas em t={a[1]} e t={b[1]}")
        vels = [n[3] for n in notas]
        if d["chave"].startswith("musica.") and len(vels) > 8 and statistics.pstdev(vels) < 3:
            avisos.append(f"{papel}: velocidades quase iguais (desvio {statistics.pstdev(vels):.1f})")

    dur_s = total * seg
    if d["chave"] in DURACOES:
        a, b = DURACOES[d["chave"]]
        if not a <= dur_s <= b:
            erros.append(f"duração {dur_s:.1f} s fora de [{a}, {b}]")
    if d.get("duracao_s") is not None and abs(d["duracao_s"] - dur_s) > 0.01:
        erros.append(f"duracao_s {d['duracao_s']} não bate com {dur_s:.3f}")

    if d["laco"] and todas:
        # a emenda: o silêncio no fim mais o do começo não pode passar de um compasso (meio, se for efeito)
        fim_som = max(n[1] + n[2] for _, n in todas)
        ini_som = min(n[1] for _, n in todas)
        buraco = (total - fim_som) + ini_som
        limite = tc if d["chave"].startswith("musica.") else tc / 2
        if buraco > limite + 1e-6:
            erros.append(f"laço com {buraco:.2f} tempos de silêncio na emenda")
    if not d["laco"] and d["cauda_s"] <= 0:
        avisos.append("sem laço e sem cauda_s")

    if "trechos" in d:
        tre = d["trechos"]
        for x in tre:
            if not x["inicio_s"] < x["fim_s"]:
                erros.append(f"trecho {x['nome']}: início depois do fim")
            if x["fim_s"] > dur_s + 1e-6:
                erros.append(f"trecho {x['nome']}: passa do fim da peça")
        for a, b in zip(tre, tre[1:]):
            if b["inicio_s"] - a["fim_s"] < 0.3 - 1e-6:
                erros.append(f"trechos {a['nome']} e {b['nome']}: só {b['inicio_s'] - a['fim_s']:.3f} s de silêncio")
        for x in tre:
            dentro = [n for _, n in todas if x["inicio_s"] - 1e-6 <= n[1] * seg < x["fim_s"]]
            if not dentro:
                erros.append(f"trecho {x['nome']}: sem notas")
                continue
            primeiro = min(n[1] for n in dentro) * seg
            if abs(primeiro - x["inicio_s"]) > 0.002:
                erros.append(f"trecho {x['nome']}: a primeira nota está em {primeiro:.3f}, não em {x['inicio_s']}")
            ultimo = max((n[1] + n[2]) * seg for n in dentro)
            if ultimo > x["fim_s"] + 1e-6:
                erros.append(f"trecho {x['nome']}: nota acaba em {ultimo:.3f}, depois do fim {x['fim_s']}")
        for _, n in todas:
            s = n[1] * seg
            if not any(x["inicio_s"] - 1e-6 <= s < x["fim_s"] for x in tre):
                erros.append(f"nota fora de qualquer trecho em {s:.3f} s")
    return erros, avisos, d


def choques(d: dict, minimo: float = 0.75) -> list[str]:
    """Pares de notas longas (as duas com pelo menos `minimo` tempos) a meio tom (ou 9ª menor) uma da outra,
    soando juntas por pelo menos meio tempo. Não é erro (passagem e apojatura existem): é para ouvir com atenção."""
    longas = []
    for tr in d["trilhas"]:
        if PAPEIS[tr["papel"]][3] or tr["papel"].startswith("sfx_"):
            continue
        longas += [(tr["papel"], n) for n in tr["notas"] if n[2] >= minimo]
    achados = []
    for i, (pa, a) in enumerate(longas):
        for pb, b in longas[i + 1:]:
            junto = min(a[1] + a[2], b[1] + b[2]) - max(a[1], b[1])
            if junto < 0.5:
                continue
            iv = abs(a[0] - b[0])
            if iv in (1, 13, 25):
                c = int(max(a[1], b[1]) // (d["compasso"][0] * 4 / d["compasso"][1])) + 1
                achados.append(f"compasso {c}: {pa} {a[0]} x {pb} {b[0]}")
    return achados


def main() -> int:
    if "--choques" in sys.argv:
        for arq in sorted(PARTITURAS.glob("*.json")):
            d = json.loads(arq.read_text(encoding="utf-8"))
            if not arq.stem.startswith("musica."):
                continue
            ach = choques(d)
            print(f"{arq.stem}: {len(ach)} choques")
            for a in ach[:40]:
                print("   ", a)
        return 0
    arquivos = sorted(PARTITURAS.glob("*.json"))
    if not arquivos:
        print("nenhuma partitura")
        return 1
    total_erros = 0
    dados = {}
    for arq in arquivos:
        erros, avisos, d = conferir(arq)
        dados[arq.stem] = d
        n = sum(len(t["notas"]) for t in d.get("trilhas", []))
        papeis = ", ".join(t["papel"] for t in d.get("trilhas", []))
        dur = d.get("duracao_s", "?")
        print(f"{'ERRO' if erros else 'ok  '} {arq.stem:30} {dur:>7} s  {n:5} notas  {papeis}")
        for e in erros:
            print(f"       erro: {e}")
        for a in avisos:
            print(f"       aviso: {a}")
        total_erros += len(erros)
    for nome, chaves in FAMILIAS.items():
        presentes = [dados[c] for c in chaves if c in dados]
        if len(presentes) < 2:
            continue
        for campo in ["bpm", "compasso", "tom", "compassos"]:
            valores = {json.dumps(x[campo], ensure_ascii=False) for x in presentes}
            if len(valores) > 1:
                print(f"ERRO família {nome}: {campo} diferente entre as versões ({', '.join(valores)})")
                total_erros += 1
    print(f"\n{len(arquivos)} partituras, {total_erros} erros")
    return 1 if total_erros else 0


if __name__ == "__main__":
    sys.exit(main())
