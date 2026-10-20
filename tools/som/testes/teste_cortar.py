"""Teste do cortar.py com um WAV sintético feito a partir do mapa (2026-10-20).

    python -I tools/som/testes/teste_cortar.py

Pega as peças de teste de tools/som/mapa_do_set.json (ou, sem mapa, duas inventadas nos mesmos
lugares) e acrescenta, num mapa temporário, três peças sintéticas: um laço com a emenda quebrada
(musica.*), um kit com trechos (som.*) e uma peça do portfólio. Gera o "export" do Arrangement
inteiro com sinais conhecidos, roda o cortar.py para pastas temporárias e confere duração, pico,
fades e emenda. Não toca no Live nem nas pastas do jogo.
"""

import json
import math
import os
import shutil
import sys
import tempfile

import numpy as np
import soundfile as sf

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(AQUI))
import cortar  # noqa: E402

SR = 48000


def peca(chave, inicio_s, dur_s, laco, cauda_s=0.0, trechos=None, teste=False):
    voltas = 2 if laco else 1
    fim_s = inicio_s + voltas * dur_s
    return {"chave": chave, "laco": laco, "cauda_s": cauda_s, "inicio_s": inicio_s, "fim_s": fim_s,
            "duracao_s": dur_s, "voltas": voltas,
            "corte_inicio_s": inicio_s + dur_s if laco else inicio_s,
            "corte_fim_s": fim_s if laco else fim_s + cauda_s,
            "trechos": trechos or [], "teste": teste}


def main() -> int:
    real = os.path.join(os.path.dirname(AQUI), "mapa_do_set.json")
    pecas = []
    if os.path.exists(real):
        with open(real, encoding="utf-8") as f:
            pecas = [p for p in json.load(f)["pecas"] if p.get("teste")]
    if not pecas:
        pecas = [peca("teste.piano", 0.0, 32 / 3, True, teste=True), peca("teste.bateria", 30.0, 48 / 7, False, 1.5, teste=True)]
    fim = max(p["corte_fim_s"] for p in pecas) + 4.0
    pecas += [peca("musica.teste_laco_quebrado", fim, 4.0, True),
              peca("som.teste_kit", fim + 12.0, 3.0, False, 0.5,
                   [{"nome": "click", "inicio_s": 0.0, "fim_s": 0.25}, {"nome": "focus", "inicio_s": 1.0, "fim_s": 1.3}]),
              peca("portfolio.teste.abertura", fim + 18.0, 5.0, False, 1.0)]
    total = max(p["corte_fim_s"] for p in pecas) + 2.0

    t = np.arange(int(total * SR)) / SR
    x = np.zeros((len(t), 2))
    for p in pecas:
        a = int(round(p["inicio_s"] * SR))
        b = int(round((p["fim_s"] + p["cauda_s"]) * SR))
        tt = t[a:b] - p["inicio_s"]
        if p["laco"]:
            # periódico na duração da volta: emenda limpa
            k = round(220 * p["duracao_s"])
            s = 0.3 * np.sin(2 * math.pi * k / p["duracao_s"] * tt) + 0.1 * np.sin(2 * math.pi * 3 * k / p["duracao_s"] * tt)
            if "quebrado" in p["chave"]:
                # mais uma onda lenta que não fecha na volta: contínua no export, mas o fim da
                # segunda volta não bate com o começo dela (salto na emenda)
                s = s + 0.3 * np.sin(2 * math.pi * 0.37 * tt)
        else:
            env = np.where(tt < p["duracao_s"], 1.0, np.exp(-(tt - p["duracao_s"]) * 6))
            s = 0.25 * env * np.sin(2 * math.pi * 440 * tt)
        x[a:b, 0] += s
        x[a:b, 1] += 0.8 * s

    tmp = tempfile.mkdtemp(prefix="hv_cortar_")
    mapa = os.path.join(tmp, "mapa.json")
    with open(mapa, "w", encoding="utf-8") as f:
        json.dump({"pecas": pecas}, f)
    export = os.path.join(tmp, "export.wav")
    sf.write(export, x, SR, subtype="PCM_24")
    saidas = {k: os.path.join(tmp, k) for k in ("jogo", "wav", "portfolio", "testes")}
    rc = cortar.main([export, "--mapa", mapa, "--saida-jogo", saidas["jogo"], "--saida-wav-jogo", saidas["wav"],
                      "--saida-portfolio", saidas["portfolio"], "--incluir-testes", "--saida-testes", saidas["testes"]])
    falhas = []
    if rc != 0:
        falhas.append(f"cortar.py saiu com {rc}")
    with open(os.path.join(tmp, "cortes.json"), encoding="utf-8") as f:
        resumo = {p["chave"]: p for p in json.load(f)["pecas"]}
    alvo = 10 ** (-1 / 20)
    for p in pecas:
        r = resumo.get(p["chave"])
        if r is None:
            falhas.append(f"{p['chave']}: não cortada")
            continue
        ogg = [a for a in r["arquivos"] if a.endswith(".ogg")]
        wav = [a for a in r["arquivos"] if a.endswith(".wav")]
        if not ogg or not wav:
            falhas.append(f"{p['chave']}: faltam arquivos {r['arquivos']}")
            continue
        y, sr = sf.read(wav[0], always_2d=True)
        esperado = p["corte_fim_s"] - p["corte_inicio_s"]
        if sr != SR or abs(len(y) / SR - esperado) > 1.5 / SR:
            falhas.append(f"{p['chave']}: duração {len(y) / SR:.4f} s, esperado {esperado:.4f} s ({sr} Hz)")
        pico = np.max(np.abs(y))
        if abs(pico - alvo) > 1e-3:
            falhas.append(f"{p['chave']}: pico {pico:.4f}, esperado {alvo:.4f}")
        if p["laco"]:
            # o salto da emenda tem de caber no passo normal entre amostras vizinhas ali perto
            salto = np.max(np.abs(y[0] - y[-1]))
            n = int(0.01 * SR)
            passo = max(np.abs(np.diff(y[-n:], axis=0)).max(), np.abs(np.diff(y[:n], axis=0)).max())
            if salto > 1.5 * passo:
                falhas.append(f"{p['chave']}: emenda com salto {salto:.4f} (passo normal {passo:.4f})")
            cruzou = "emenda_cruzada_ms" in r
            if cruzou != ("quebrado" in p["chave"]):
                falhas.append(f"{p['chave']}: cruzamento {'feito' if cruzou else 'não feito'} sem motivo")
        else:
            if np.max(np.abs(y[0])) > 1e-4 or np.max(np.abs(y[-1])) > 1e-4:
                falhas.append(f"{p['chave']}: pontas sem fade ({y[0]}, {y[-1]})")
        yo, sro = sf.read(ogg[0], always_2d=True)
        if sro != SR or abs(len(yo) - len(y)) > 2:
            falhas.append(f"{p['chave']}: ogg com {len(yo)} amostras a {sro} Hz, wav com {len(y)}")
        if p["trechos"] != r["trechos"]:
            falhas.append(f"{p['chave']}: trechos não passaram para o resumo")
    destinos = {"musica.teste_laco_quebrado": "jogo", "som.teste_kit": "jogo", "portfolio.teste.abertura": "portfolio"}
    for chave, d in destinos.items():
        if not os.path.exists(os.path.join(saidas[d], chave + ".ogg")):
            falhas.append(f"{chave}: .ogg não está em {saidas[d]}")
    if not os.path.exists(os.path.join(saidas["wav"], "som.teste_kit.wav")):
        falhas.append("som.teste_kit: .wav do jogo não está na pasta de WAV")
    if falhas:
        print("pasta do teste (mantida):", tmp)
        print("FALHOU:\n  " + "\n  ".join(falhas))
        return 1
    shutil.rmtree(tmp, ignore_errors=True)
    print(f"OK: {len(pecas)} peças cortadas e conferidas")
    return 0


if __name__ == "__main__":
    sys.exit(main())
