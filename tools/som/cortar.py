"""Corta o áudio exportado do Arrangement em um arquivo por peça (2026-10-20).

Uso:
    python -I tools/som/cortar.py <export.wav> [--saida-jogo assets/sons] [--saida-portfolio PASTA]
        [--saida-wav-jogo assets/sons/wav] [--inicio-export SEGUNDOS] [--so CHAVE ...]
        [--incluir-testes [--saida-testes PASTA]] [--qualidade-ogg 0..1]

Lê tools/som/mapa_do_set.json (gravado por ableton_montar.py). O export é o Arrangement inteiro,
do começo (tempo 0 do set) até o fim, em WAV (48 kHz, 24 bits; outra taxa é convertida para 48 kHz).
Se o export começou em outro ponto, --inicio-export diz em que segundo do set ele começa.

Por peça:
- sem laço: do locator até o fim da peça mais a cauda_s; fade de 5 ms nas duas pontas;
- em laço: a segunda volta (o montador põe duas), que já começa com a cauda da primeira; confere
  o salto entre a última amostra e a primeira e, se for grande, cruza os últimos 20 ms com o áudio
  que vem logo antes do começo (assim o fim desemboca exatamente no começo, sem mudar a duração);
- pico normalizado a -1 dBFS, só ganho (nada de compressor ou limitador);
- grava WAV 48 kHz 24 bits e OGG Vorbis.

Destino pela chave: musica.* e som.* vão para <saida-jogo>/<chave>.ogg (o WAV para
<saida-wav-jogo>/<chave>.wav, fora do git); portfolio.* vão para <saida-portfolio>/<chave>.wav e .ogg;
peças de teste só com --incluir-testes. Um resumo (arquivos, ganho, emenda, trechos dos kits)
vai para cortes.json, ao lado do mapa.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import math
import os
import sys

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))
MAPA = os.path.join(AQUI, "mapa_do_set.json")

SR = 48000
PICO_DB = -1.0
FADE_S = 0.005
CRUZA_S = 0.020
# Cauda automática (--cauda-auto), medida nos efeitos do cliente em 2026-10-20: a -40/-60 dB o reverb
# esticava um pulo a 4 s; a -30 dB, com no máximo 1 s além da partitura, o efeito acaba no fade.
CAUDA_DB = -30.0
CAUDA_MAX_S = 1.0
CAUDA_FADE_FRACAO = 0.25
CAUDA_FADE_MIN_S = 0.060
CAUDA_FADE_MAX_S = 0.250


def destino(chave: str, args) -> tuple[str | None, str | None, str]:
    """(pasta do ogg, pasta do wav, tipo) para a chave; pasta None = não grava."""
    if chave.startswith(("musica.", "som.")):
        return args.saida_jogo, args.saida_wav_jogo, "jogo"
    if chave.startswith("portfolio."):
        return args.saida_portfolio, args.saida_portfolio, "portfolio"
    if chave.startswith("trabalho."):
        return args.saida_trabalho, args.saida_trabalho, "trabalho"
    return args.saida_testes, args.saida_testes, "outro"


def ler_export(caminho: str) -> np.ndarray:
    x, sr = sf.read(caminho, dtype="float64", always_2d=True)
    if sr != SR:
        g = math.gcd(int(sr), SR)
        print(f"export em {sr} Hz: convertendo para {SR} Hz")
        x = resample_poly(x, SR // g, int(sr) // g, axis=0)
    return x


def fades(x: np.ndarray) -> np.ndarray:
    n = min(int(round(FADE_S * SR)), len(x) // 2)
    if n > 0:
        r = np.linspace(0.0, 1.0, n, endpoint=False)[:, None]
        x[:n] *= r
        x[-n:] *= r[::-1]
    return x


def salto_emenda(x: np.ndarray) -> tuple[float, float]:
    """Salto entre a última amostra e a primeira, e a variação típica entre amostras vizinhas
    perto da emenda (mediana do módulo da derivada nos 10 ms de cada lado)."""
    n = max(2, int(0.010 * SR))
    salto = float(np.max(np.abs(x[0] - x[-1])))
    viz = np.concatenate([np.abs(np.diff(x[-n:], axis=0)).max(axis=1), np.abs(np.diff(x[:n], axis=0)).max(axis=1)])
    return salto, float(np.median(viz))


def cauda_natural(audio: np.ndarray, a: int, b: int) -> int:
    """Fim do corte onde o som cai CAUDA_DB abaixo do pico (procura até CAUDA_MAX_S depois do fim
    da partitura), no máximo. Os efeitos do cliente acabavam a -12 dB no corte fixo (2026-10-20)."""
    lim = min(len(audio), b + int(CAUDA_MAX_S * SR))
    nivel = np.abs(audio[a:lim]).max(axis=1)
    pico = float(nivel.max()) if len(nivel) else 0.0
    if pico <= 0:
        return b
    acima = np.nonzero(nivel > pico * 10 ** (CAUDA_DB / 20))[0]
    ultimo = a + int(acima[-1]) if len(acima) else b
    return min(lim, max(b, ultimo))


def emendar(x: np.ndarray, antes: np.ndarray) -> np.ndarray:
    """Cruza os últimos CRUZA_S do laço com `antes` (o áudio imediatamente anterior ao começo)."""
    c = len(antes)
    r = np.linspace(0.0, 1.0, c)[:, None]
    x[-c:] = x[-c:] * (1.0 - r) + antes * r
    return x


def gravar(x: np.ndarray, pasta_ogg: str | None, pasta_wav: str | None, chave: str, qualidade: float) -> list[str]:
    feitos = []
    if pasta_wav:
        os.makedirs(pasta_wav, exist_ok=True)
        p = os.path.join(pasta_wav, chave + ".wav")
        sf.write(p, x, SR, subtype="PCM_24")
        feitos.append(p)
    if pasta_ogg:
        os.makedirs(pasta_ogg, exist_ok=True)
        p = os.path.join(pasta_ogg, chave + ".ogg")
        # Em blocos: o libsndfile 1.2.2 estoura a pilha no Windows ao codificar Vorbis de uma vez só
        # (visto em 2026-10-20 com 10 s de estéreo).
        with sf.SoundFile(p, "w", SR, x.shape[1], format="OGG", subtype="VORBIS",
                          compression_level=1.0 - qualidade) as f:
            for i in range(0, len(x), 4096):
                f.write(np.ascontiguousarray(x[i:i + 4096]))
        feitos.append(p)
    return feitos


def cortar(args) -> int:
    with open(args.mapa, encoding="utf-8") as f:
        mapa = json.load(f)
    resumo_arq = os.path.join(os.path.dirname(os.path.abspath(args.mapa)), "cortes.json")
    audio = ler_export(args.export)
    total_s = len(audio) / SR
    print(f"export: {total_s:.2f} s, {audio.shape[1]} canal(is)")

    resumo = {"export": os.path.abspath(args.export), "cortado_em": _dt.datetime.now().isoformat(timespec="seconds"),
              "pecas": []}
    erros = 0
    for p in mapa["pecas"]:
        chave = p["chave"]
        if args.so and chave not in args.so:
            continue
        if p.get("teste") and not args.incluir_testes:
            continue
        pasta_ogg, pasta_wav, tipo = destino(chave, args)
        if pasta_ogg is None and pasta_wav is None:
            print(f"{chave}: sem pasta de saída para '{tipo}' (passe --saida-portfolio ou --saida-testes); pulada")
            continue
        ini = p["corte_inicio_s"] - args.inicio_export
        fim = p["corte_fim_s"] - args.inicio_export
        a, b = int(round(ini * SR)), int(round(fim * SR))
        if args.cauda_auto and not p["laco"] and 0 <= a < b <= len(audio):
            b = cauda_natural(audio, a, b)
            fim = b / SR
        if a < 0 or b > len(audio):
            print(f"ERRO {chave}: o corte {ini:.2f}-{fim:.2f} s sai do export (0-{total_s:.2f} s)")
            erros += 1
            continue
        x = audio[a:b].copy()
        info = {"chave": chave, "inicio_s": ini, "fim_s": fim, "duracao_s": (b - a) / SR, "laco": p["laco"]}
        # A gravação é PCM de 24 bits: o que passou de 0 dBFS no master virou teto (visto em 2026-10-20
        # nas faixas do cliente). Depois da conversão de taxa o teto aparece um pouco abaixo de 1.
        teto = int((np.abs(x) >= 0.98).any(axis=1).sum())
        if teto > 8:
            info["clipping_amostras"] = teto
            print(f"ERRO {chave}: {teto} amostras no teto (clipping); grave de novo com os faders mais baixos")
            erros += 1
        if p["laco"]:
            salto, tipico = salto_emenda(x)
            info["emenda_salto"] = salto
            info["emenda_tipico"] = tipico
            if salto > max(4.0 * tipico, 1e-4):
                c = int(round(CRUZA_S * SR))
                antes = audio[a - c:a] if a >= c else np.vstack([np.zeros((c - a, audio.shape[1])), audio[:a]])
                x = emendar(x, antes)
                info["emenda_cruzada_ms"] = CRUZA_S * 1000
                salto2, _ = salto_emenda(x)
                info["emenda_salto_depois"] = salto2
                nota = f"emenda cruzada em {CRUZA_S * 1000:.0f} ms (salto {salto:.4f} -> {salto2:.4f}, típico {tipico:.4f})"
            else:
                nota = f"emenda limpa (salto {salto:.4f}, típico {tipico:.4f})"
        else:
            x = fades(x)
            nota = f"fades de {FADE_S * 1000:.0f} ms"
            if args.cauda_auto:
                # O fim some num fade de um quarto da duração (entre 60 e 250 ms), em curva quadrática.
                fade_s = min(CAUDA_FADE_MAX_S, max(CAUDA_FADE_MIN_S, CAUDA_FADE_FRACAO * len(x) / SR))
                n = min(int(fade_s * SR), len(x) // 2)
                x[-n:] *= np.linspace(1.0, 0.0, n)[:, None] ** 2
                nota += f", cauda até {CAUDA_DB:.0f} dB com fade de {fade_s * 1000:.0f} ms"
        pico = float(np.max(np.abs(x))) if len(x) else 0.0
        if pico < 1e-6:
            print(f"ERRO {chave}: corte em silêncio ({ini:.2f}-{fim:.2f} s); export certo?")
            erros += 1
            continue
        ganho = 10 ** (PICO_DB / 20) / pico
        x *= ganho
        info["ganho_db"] = 20 * math.log10(ganho)
        info["trechos"] = p.get("trechos", [])
        info["arquivos"] = [os.path.relpath(f, RAIZ).replace("\\", "/") if f.startswith(RAIZ) else f
                            for f in gravar(x, pasta_ogg, pasta_wav, chave, args.qualidade_ogg)]
        resumo["pecas"].append(info)
        print(f"{chave}: {info['duracao_s']:.2f} s, ganho {info['ganho_db']:+.1f} dB, {nota}")
        for t in info["trechos"]:
            print(f"    trecho {t.get('nome')}: {t.get('inicio_s')} a {t.get('fim_s')} s")

    with open(resumo_arq, "w", encoding="utf-8") as f:
        json.dump(resumo, f, ensure_ascii=False, indent=1)
    print(f"resumo em {resumo_arq}; {len(resumo['pecas'])} peça(s), {erros} erro(s)")
    return 1 if erros else 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("export")
    ap.add_argument("--mapa", default=MAPA, help="outro mapa (para testes)")
    ap.add_argument("--saida-jogo", default=os.path.join(RAIZ, "assets", "sons"))
    ap.add_argument("--saida-wav-jogo", default=os.path.join(RAIZ, "assets", "sons", "wav"))
    ap.add_argument("--saida-portfolio", default=None)
    # Trabalhos para clientes (trabalho.*): fora do repositório do jogo.
    ap.add_argument("--saida-trabalho", default=None)
    ap.add_argument("--saida-testes", default=None)
    ap.add_argument("--incluir-testes", action="store_true")
    ap.add_argument("--inicio-export", type=float, default=0.0)
    ap.add_argument("--cauda-auto", action="store_true",
                    help="peças sem laço vão até o som cair 30 dB abaixo do pico (até 1 s a mais), com fade no fim")
    ap.add_argument("--so", nargs="*", default=None)
    ap.add_argument("--qualidade-ogg", type=float, default=0.6, help="0 a 1 (Vorbis); 0,6 é uns 160 kbps em estéreo")
    args = ap.parse_args(argv)
    sys.stdout.reconfigure(encoding="utf-8")
    if args.incluir_testes and not args.saida_testes:
        ap.error("--incluir-testes precisa de --saida-testes")
    return cortar(args)


if __name__ == "__main__":
    sys.exit(main())
