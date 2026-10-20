"""Estudo da paleta e do estilo do Aeko (reconstrução de 2026-10-20).

Mede a paleta do Aeko nas folhas de tiles (casa e castelo) e nas peças dos contribuidores já no estilo dele
(graal.aeko.<n>.png), compara com as mesmas peças no estilo original (graal.original.<n>.png) e escreve
docs/arte/ESTUDO_AEKO.md com os números, mais as imagens de referência em estudo/aeko/:

- `paleta_tiles.png`: as rampas dos tiles, uma família de matiz por linha, tons em ordem de luminosidade;
- `rampas_pecas.png`: rampas de cabelo e pele de peças de exemplo, original em cima e Aeko embaixo;
- `histogramas.png`: luminosidade, croma e tons por parte (tiles, peças Aeko, peças originais);
- `contorno.png`: cabeças ampliadas nos dois estilos, para ver o contorno e a redução de tons.

As folhas de tiles recuperadas são exportações com fundo quadriculado (F7F7F7/E6E6E6) e rótulos; só contam
os tiles de 16×16 sem pixel do quadriculado. O que a ferramenta perdida fazia está deduzido no documento
(ver também o cabeçalho de estilo_aeko.py); o resumo das notas vem de estudo/comparacao/notas.json, se existir.

Uso:
    python -I tools/estudo_aeko.py [--amostra N] [--artes <pasta>] [--saida estudo/aeko] [--doc docs/arte/ESTUDO_AEKO.md]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import estilo_aeko as ea  # noqa: E402

SAIDA_PADRAO = ea.RAIZ / "estudo" / "aeko"
DOC_PADRAO = ea.RAIZ / "docs" / "arte" / "ESTUDO_AEKO.md"
FOLHAS_DE_TILES = ("aeko.casa.0", "aeko.casa.1", "aeko.castelo.0", "aeko.castelo.1")
QUADRICULADO = {(0xF7, 0xF7, 0xF7), (0xE6, 0xE6, 0xE6)}
TILE = 16
# as séries dos gráficos (paleta categórica validada, em ordem fixa): tiles, peças Aeko, peças originais
SERIES = {"tiles": (42, 120, 214), "aeko": (235, 104, 52), "original": (27, 175, 122)}
TEXTO = (30, 30, 30)
TEXTO_FRACO = (110, 110, 110)
EXEMPLOS = ["aly1pink-4", "aly1green-3", "alexxx1green", "daisy1", "daisy6", "zar160black", "jen34", "raskit1"]
NOMES_DE_MATIZ = [(20, "vermelho"), (45, "laranja"), (70, "amarelo-terra"), (100, "amarelo"), (160, "verde"), (210, "ciano"), (280, "azul"), (330, "roxo"), (361, "rosa")]


def nome_do_matiz(h: float) -> str:
    h %= 360
    for limite, nome in NOMES_DE_MATIZ:
        if h < limite:
            return nome
    return "vermelho"


FONTES = [Path(r"C:\Windows\Fonts\segoeui.ttf"), Path(r"C:\Windows\Fonts\arial.ttf"), Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")]


def _fonte(tamanho: int):
    """Uma fonte com acentos e símbolos (a padrão do Pillow não tem ç, Δ, ≥)."""
    for caminho in FONTES:
        if caminho.exists():
            return ImageFont.truetype(str(caminho), tamanho)
    try:
        return ImageFont.load_default(size=tamanho)
    except TypeError:
        return ImageFont.load_default()


def lch(lab: np.ndarray):
    return lab[..., 0], np.hypot(lab[..., 1], lab[..., 2]), np.degrees(np.arctan2(lab[..., 2], lab[..., 1])) % 360


# --- os tiles ----------------------------------------------------------------------------------------


def cores_dos_tiles(pasta: Path) -> Counter:
    """As cores (RGB → pixels) dos tiles de 16×16 que não têm pixel do quadriculado nem são vazios."""
    contagem: Counter = Counter()
    for nome in FOLHAS_DE_TILES:
        im = np.array(Image.open(pasta / f"{nome}.png").convert("RGBA"))
        quad = np.zeros(im.shape[:2], bool)
        for c in QUADRICULADO:
            quad |= (im[..., 0] == c[0]) & (im[..., 1] == c[1]) & (im[..., 2] == c[2]) & (im[..., 3] > 0)
        for y in range(0, im.shape[0], TILE):
            for x in range(0, im.shape[1], TILE):
                bloco = im[y : y + TILE, x : x + TILE]
                if quad[y : y + TILE, x : x + TILE].any():
                    continue
                opaco = bloco[bloco[..., 3] > 0][:, :3]
                if len(opaco) == 0:
                    continue
                contagem.update(map(tuple, opaco))
    return contagem


def familias(cores: np.ndarray, pesos: np.ndarray, limiar: float) -> np.ndarray:
    lab = ea.srgb_para_lab(cores)
    return ea._familias(lab[:, 1:], pesos, limiar)


def rampa(cores: np.ndarray, pesos: np.ndarray, minimo: float) -> list[dict]:
    """Os tons de uma família com peso relevante, em ordem de L: L, C, h, rgb, peso."""
    lab = ea.srgb_para_lab(cores)
    lum, croma, matiz = lch(lab)
    total = pesos.sum()
    tons = [dict(L=float(lum[i]), C=float(croma[i]), h=float(matiz[i]), rgb=tuple(int(v) for v in cores[i]), peso=float(pesos[i] / total)) for i in range(len(cores)) if pesos[i] >= minimo * total]
    return sorted(tons, key=lambda t: t["L"])


def degraus(tons: list[dict]) -> list[float]:
    return [b["L"] - a["L"] for a, b in zip(tons, tons[1:])]


def estudo_dos_tiles(contagem: Counter) -> dict:
    cores = np.array(list(contagem.keys()), float)
    pesos = np.array(list(contagem.values()), float)
    lab = ea.srgb_para_lab(cores)
    lum, croma, matiz = lch(lab)
    total = pesos.sum()
    preto = (cores.max(1) <= 4)
    cinza = (croma < 6) & ~preto
    cromatico = ~preto & ~cinza
    fam = np.full(len(cores), -1)
    fam[cromatico] = familias(cores[cromatico], pesos[cromatico], 8.0)
    lista = []
    for g in np.unique(fam[cromatico]):
        sel = fam == g
        if pesos[sel].sum() < 0.004 * total:
            continue
        tons = rampa(cores[sel], pesos[sel], 0.03)
        if len(tons) < 2:
            continue
        hm = float(np.average(matiz[sel], weights=pesos[sel]))
        lista.append(dict(nome=nome_do_matiz(hm), matiz=hm, pixels=float(pesos[sel].sum() / total), tons=tons, degraus=degraus(tons), croma=float(np.average(croma[sel], weights=pesos[sel]))))
    lista.sort(key=lambda f: -f["pixels"])
    tons_cinza = rampa(cores[cinza], pesos[cinza], 0.03) if cinza.any() else []
    todos_degraus = [d for f in lista for d in f["degraus"]]
    return dict(
        cores=len(cores), pixels=int(total), preto=float(pesos[preto].sum() / total), cinza=float(pesos[cinza].sum() / total),
        croma_medio=float(np.average(croma[cromatico], weights=pesos[cromatico])), l_p5=float(np.percentile(lum, 5)), l_p95=float(np.percentile(lum, 95)),
        familias=lista, cinzas=tons_cinza, degrau_mediano=float(np.median(todos_degraus)) if todos_degraus else 0.0,
        tons_por_familia=float(np.mean([len(f["tons"]) for f in lista])) if lista else 0.0,
        deslocamento_matiz=float(np.median([f["tons"][-1]["h"] - f["tons"][0]["h"] for f in lista if abs(f["tons"][-1]["h"] - f["tons"][0]["h"]) < 180])) if lista else 0.0,
        croma_escuro_claro=(float(np.mean([f["tons"][0]["C"] for f in lista])), float(np.mean([f["tons"][-1]["C"] for f in lista]))) if lista else (0.0, 0.0),
        lum_todas=np.repeat(lum, np.maximum(1, (pesos / 50).astype(int))), croma_todas=np.repeat(croma[cromatico], np.maximum(1, (pesos[cromatico] / 50).astype(int))),
    )


# --- as peças ----------------------------------------------------------------------------------------


def estudo_das_pecas(pecas: list[ea.Peca], folhas: ea.Folhas) -> dict:
    """Por estilo: cores por peça, tons por parte, degraus de L, croma, contorno."""
    st = {estilo: defaultdict(list) for estilo in ea.ESTILOS}
    exemplos = {}
    for peca in pecas:
        for estilo in ea.ESTILOS:
            im = ea.montar(peca, folhas, estilo)
            f = im.f
            opaco = f[..., 3] > 0
            rgb = f[..., :3]
            s = st[estilo]
            s["cores"].append(len(np.unique(rgb[opaco], axis=0)))
            preto = opaco & (rgb.max(-1) <= 4)
            s["preto"].append(float(preto.sum() / max(1, opaco.sum())))
            dentro = ea._vizinhos_4(opaco, "")
            borda = opaco & ~dentro
            if borda.any():
                s["borda_preta"].append(float((borda & preto).sum() / borda.sum()))
                s["borda_lum"].append(float(np.mean(ea.srgb_para_lab(rgb[borda])[:, 0])))
            lab_todos = ea.srgb_para_lab(rgb[opaco & ~preto])
            s["lum"].extend(lab_todos[::7, 0].tolist())
            s["croma"].extend(np.hypot(lab_todos[::7, 1], lab_todos[::7, 2]).tolist())
            for parte in np.unique(im.partes[opaco & ~preto]):
                if parte in ("r", ""):
                    continue
                m = opaco & ~preto & (im.partes == parte)
                if m.sum() < 30:
                    continue
                cores, cont = np.unique(rgb[m], axis=0, return_counts=True)
                tons = rampa(cores.astype(float), cont.astype(float), 0.02)
                tipo = parte[0]
                s[f"tons_{tipo}"].append(len(tons))
                s[f"degraus_{tipo}"].extend(degraus(tons))
                if tons:
                    s[f"croma_{tipo}"].append(float(np.mean([t["C"] for t in tons])))
                if len(tons) >= 2 and abs(tons[-1]["h"] - tons[0]["h"]) < 180 and tons[0]["C"] > 8:
                    s[f"matiz_{tipo}"].append(tons[-1]["h"] - tons[0]["h"])
                if peca.id in EXEMPLOS and tipo in "hs":
                    exemplos[(peca.id, tipo, estilo)] = tons
    return dict(estilos=st, exemplos=exemplos)


# --- as imagens --------------------------------------------------------------------------------------


def _swatches(desenho: ImageDraw.ImageDraw, tons: list[dict], x: int, y: int, lado: int, fonte, rotulo: bool = True) -> int:
    for t in tons:
        desenho.rectangle([x, y, x + lado - 1, y + lado - 1], fill=t["rgb"])
        if rotulo:
            desenho.text((x + 1, y + lado + 2), ea.hexa(t["rgb"]), fill=TEXTO_FRACO, font=fonte)
        x += lado + 3
    return x


def desenhar_paleta(tiles: dict, caminho: Path) -> None:
    lado = 46
    fonte = _fonte(11)
    fam = tiles["familias"][:14]
    linhas = fam + ([dict(nome="cinzas", tons=tiles["cinzas"], pixels=tiles["cinza"], degraus=degraus(tiles["cinzas"]))] if tiles["cinzas"] else [])
    altura = 40 + len(linhas) * (lado + 34)
    largura = 250 + max(len(f["tons"]) for f in linhas) * (lado + 3) + 20
    im = Image.new("RGB", (largura, altura), (255, 255, 255))
    d = ImageDraw.Draw(im)
    d.text((10, 10), "Paleta do Aeko nos tiles (casa e castelo): famílias de matiz, tons em ordem de L", fill=TEXTO, font=_fonte(14))
    y = 40
    for f in linhas:
        passo = f"ΔL mediano {np.median(f['degraus']):.1f}" if f["degraus"] else ""
        d.text((10, y + 4), f"{f['nome']} · {len(f['tons'])} tons · {100 * f['pixels']:.1f} %", fill=TEXTO, font=fonte)
        d.text((10, y + 22), passo, fill=TEXTO_FRACO, font=fonte)
        _swatches(d, f["tons"], 250, y, lado, fonte)
        y += lado + 34
    im.save(caminho)


def desenhar_rampas_pecas(exemplos: dict, caminho: Path) -> None:
    lado = 46
    fonte = _fonte(11)
    chaves = sorted({(pid, tipo) for pid, tipo, _ in exemplos}, key=lambda k: (EXEMPLOS.index(k[0]), k[1]))
    altura = 40 + len(chaves) * (2 * (lado + 18) + 10)
    largura = 240 + 12 * (lado + 3) + 20
    im = Image.new("RGB", (largura, altura), (255, 255, 255))
    d = ImageDraw.Draw(im)
    d.text((10, 10), "Rampas de peças: original (em cima) e Aeko (embaixo), tons com ≥ 2 % dos pixels da parte", fill=TEXTO, font=_fonte(14))
    y = 40
    for pid, tipo in chaves:
        d.text((10, y + 6), f"{pid} · {'cabelo' if tipo == 'h' else 'pele'}", fill=TEXTO, font=fonte)
        for i, estilo in enumerate(ea.ESTILOS[::-1]):
            tons = exemplos.get((pid, tipo, estilo), [])
            d.text((130, y + 6 + i * (lado + 18)), estilo, fill=TEXTO_FRACO, font=fonte)
            _swatches(d, tons[:12], 240, y + i * (lado + 18), lado, fonte)
        y += 2 * (lado + 18) + 10
    im.save(caminho)


def _barras(d: ImageDraw.ImageDraw, caixa, series: dict[str, np.ndarray], rotulos: list[str], titulo: str, fonte):
    """Barras agrupadas, finas, com 2 px de folga, legenda e rótulos de eixo."""
    x0, y0, x1, y1 = caixa
    d.text((x0, y0 - 22), titulo, fill=TEXTO, font=fonte)
    maximo = max(float(v.max()) for v in series.values()) or 1.0
    n = len(rotulos)
    grupo = (x1 - x0) / n
    largura = max(2, int((grupo - 6) / len(series)) - 2)
    d.line([x0, y1, x1, y1], fill=(200, 200, 200))
    for i, rot in enumerate(rotulos):
        gx = x0 + i * grupo + 3
        for j, (nome, valores) in enumerate(series.items()):
            h = int((y1 - y0 - 4) * valores[i] / maximo)
            bx = int(gx + j * (largura + 2))
            if h > 0:
                d.rounded_rectangle([bx, y1 - h, bx + largura, y1], radius=2, fill=SERIES[nome])
        d.text((gx, y1 + 4), rot, fill=TEXTO_FRACO, font=fonte)
    lx = x0
    for nome in series:
        d.rectangle([lx, y0 - 6, lx + 10, y0 + 4], fill=SERIES[nome])
        d.text((lx + 14, y0 - 8), nome, fill=TEXTO, font=fonte)
        lx += 14 + 8 * len(nome) + 16


def desenhar_histogramas(tiles: dict, pecas: dict, caminho: Path) -> None:
    fonte = _fonte(11)
    im = Image.new("RGB", (1000, 760), (255, 255, 255))
    d = ImageDraw.Draw(im)
    d.text((10, 8), "Histogramas (fração dos pixels, cada série normalizada)", fill=TEXTO, font=_fonte(14))
    st = pecas["estilos"]

    def hist(v, bins, lim):
        h, _ = np.histogram(np.asarray(v, float), bins=bins, range=lim)
        return h / max(1, h.sum())

    series = {"tiles": hist(tiles["lum_todas"], 10, (0, 100)), "aeko": hist(st["aeko"]["lum"], 10, (0, 100)), "original": hist(st["original"]["lum"], 10, (0, 100))}
    _barras(d, (60, 70, 960, 240), series, [f"{i * 10}" for i in range(10)], "Luminosidade L (Lab), sem o contorno preto", fonte)
    series = {"tiles": hist(tiles["croma_todas"], 10, (0, 100)), "aeko": hist(st["aeko"]["croma"], 10, (0, 100)), "original": hist(st["original"]["croma"], 10, (0, 100))}
    _barras(d, (60, 310, 960, 480), series, [f"{i * 10}" for i in range(10)], "Croma (Lab)", fonte)
    tons = {}
    for estilo in ("aeko", "original"):
        v = np.array(st[estilo]["tons_h"] + st[estilo]["tons_s"] + st[estilo]["tons_e"], float)
        tons[estilo] = hist(np.clip(v, 1, 9), 9, (0.5, 9.5))
    _barras(d, (60, 550, 960, 720), tons, [str(i) for i in range(1, 9)] + ["9+"], "Tons por parte (cabelo, pele e olhos; tons com ≥ 2 % dos pixels)", fonte)
    im.save(caminho)


def desenhar_contorno(pecas: list[ea.Peca], folhas: ea.Folhas, caminho: Path) -> None:
    escala = 6
    fonte = _fonte(12)
    por_id = {p.id: p for p in pecas}
    ids = [i for i in EXEMPLOS if i in por_id][:6]
    linhas = []
    for pid in ids:
        p = por_id[pid]
        paineis = []
        for estilo in ("original", "aeko"):
            f = ea.montar(p, folhas, estilo).f
            celula = Image.fromarray(f[2 * ea.CELULA : 3 * ea.CELULA])  # de frente
            fundo = Image.new("RGBA", celula.size, (236, 236, 236, 255))
            fundo.alpha_composite(celula)
            paineis.append(fundo.convert("RGB").resize((ea.CELULA * escala, ea.CELULA * escala), Image.NEAREST))
        linha = Image.new("RGB", (160 + 2 * (ea.CELULA * escala + 8), ea.CELULA * escala + 8), (255, 255, 255))
        ImageDraw.Draw(linha).text((8, 8), f"{pid}\noriginal | Aeko", fill=TEXTO, font=fonte)
        linha.paste(paineis[0], (160, 4))
        linha.paste(paineis[1], (160 + ea.CELULA * escala + 8, 4))
        linhas.append(linha)
    im = Image.new("RGB", (linhas[0].width, sum(li.height for li in linhas)), (255, 255, 255))
    y = 0
    for li in linhas:
        im.paste(li, (0, y))
        y += li.height
    im.save(caminho)


# --- o documento -------------------------------------------------------------------------------------

EVOLUCAO = [
    ("1", "só o contorno preto (borda e resto escuro) e os tons como estão", "3,26", "—"),
    ("2", "+ fusão de tons por Ward normalizado em Lab (limiar 3)", "3,54", "pior: funde tons grandes que o Aeko manteve"),
    ("3", "Ward com limiar 1,5", "3,25", "quase nada"),
    ("4", "famílias de matiz (a, b) + partição ótima em L (Jenks), degraus 7/13/9", "3,31", "pele piora: a rampa se parte pelo croma"),
    ("5", "famílias pela corda de matiz (croma geométrico), sem os ajustes lineares", "3,13", ""),
    ("6", "degrau da pele 26, tons pequenos contam na amplitude, sem o preto-na-parte", "3,06", ""),
    ("7", "croma por L (pele escura +20 %, olhos claros −10 %), beirada da célula não é contorno", "3,02", "nas 947 peças: ΔE 3,04; a nota está no resumo"),
    ("8", "grade final nas 947 peças: família de matiz 20 e limiar do preto 40", "3,02", "+0,01 de nota cada; degrau do cabelo 6 e dos olhos 14 pioram"),
]


def pct(v: float) -> str:
    return f"{100 * v:.1f} %"


def escrever_documento(tiles: dict, pecas: dict, n_pecas: int, caminho: Path, comparacao: dict | None) -> None:
    st = pecas["estilos"]
    a, o = st["aeko"], st["original"]

    def media(lista):
        return float(np.mean(lista)) if len(lista) else float("nan")

    def mediana(lista):
        return float(np.median(lista)) if len(lista) else float("nan")

    fam_linhas = ["| família | pixels | tons | ΔL mediano | croma médio | croma escuro → claro | matiz escuro → claro |", "|---|---|---|---|---|---|---|"]
    for f in tiles["familias"][:14]:
        t0, t1 = f["tons"][0], f["tons"][-1]
        fam_linhas.append(f"| {f['nome']} ({f['matiz']:.0f}°) | {pct(f['pixels'])} | {len(f['tons'])} | {mediana(f['degraus']):.1f} | {f['croma']:.0f} | {t0['C']:.0f} → {t1['C']:.0f} | {t0['h']:.0f}° → {t1['h']:.0f}° |")

    partes = [("h", "cabelo"), ("s", "pele"), ("e", "olhos"), ("d", "enfeites"), ("c", "roupa")]
    parte_linhas = ["| parte | tons (orig → Aeko) | ΔL entre tons (orig → Aeko) | croma médio (orig → Aeko) | matiz escuro→claro (orig → Aeko) |", "|---|---|---|---|---|"]
    for k, nome in partes:
        parte_linhas.append(
            f"| {nome} | {media(o[f'tons_{k}']):.1f} → {media(a[f'tons_{k}']):.1f} | {mediana(o[f'degraus_{k}']):.1f} → {mediana(a[f'degraus_{k}']):.1f} | "
            f"{media(o[f'croma_{k}']):.0f} → {media(a[f'croma_{k}']):.0f} | {mediana(o[f'matiz_{k}']):+.1f}° → {mediana(a[f'matiz_{k}']):+.1f}° |"
        )

    evol = ["| passo | o que mudou | ΔE médio (200 peças) | observação |", "|---|---|---|---|"] + [f"| {p} | {q} | {r} | {s} |" for p, q, r, s in EVOLUCAO]

    if comparacao:
        r = comparacao["resumo"]
        por_autor = defaultdict(list)
        for reg in comparacao["pecas"]:
            por_autor[reg["autor"]].append(reg["nota"])
        ranking = sorted(((au, np.mean(ns), len(ns)) for au, ns in por_autor.items()), key=lambda t: -t[1])
        resumo = [
            f"Rodada de `tools/comparar_estilos.py` sobre {r['pecas']} peças: **nota média {r['nota_media']:.2f}**, ΔE médio {r['dE_medio']:.2f}, "
            f"pixels iguais {pct(r['iguais_medio'])}, na paleta do gabarito (a um JND) {pct(r['paleta_medio'])}, F1 do contorno {r['preto_f1_medio']:.3f}.",
            "",
            "Ranking \"Aeko + equipe\" (média das notas por contribuidor, só os com 5 peças ou mais; a tabela inteira está em `estudo/comparacao/notas.md`):",
            "",
            "| # | autor | peças | nota média |",
            "|---|---|---|---|",
        ] + [f"| {i} | {au} | {n} | {nota:.2f} |" for i, (au, nota, n) in enumerate([t for t in ranking if t[2] >= 5], 1)]
    else:
        resumo = ["(estudo/comparacao/notas.json ainda não existe: rodar `python -I tools/comparar_estilos.py`.)"]

    texto = f"""# Estudo: a paleta do Aeko, e o Aeko + equipe

Gerado por `tools/estudo_aeko.py` em 2026-10-20, a partir do que sobreviveu à formatação: as folhas de tiles do
Aeko (`aeko.casa.0/1`, `aeko.castelo.0/1`), as {n_pecas} peças dos contribuidores do Graal nos dois estilos
(`graal.aeko.<n>.png` e `graal.original.<n>.png`, casadas célula a célula) e `src/shared/graalData.ts` e
`graalDataOriginal.ts`. As imagens estão em `estudo/aeko/`. O que é dedução sobre a ferramenta perdida
(`tools/estilo_aeko.py`, que recoloria as peças da equipe na paleta do Aeko) está marcado **(palpite)**.

Em uma frase: nos tiles, o Aeko pinta com poucas cores ({tiles['cores']} em quatro folhas), contorno preto puro e
rampas que descem para o preto perdendo croma, quase sem girar o matiz; nas peças da equipe, a ferramenta perdida não
aplicava essa paleta, e sim o jeito dela: pôs o contorno preto e reduziu os tons de cada parte à metade
(degraus de L duas vezes maiores), mantendo o matiz e o croma do contribuidor.

## 1. A paleta do Aeko nos tiles

Só os tiles de 16×16 sem pixel do quadriculado das exportações ({tiles['pixels']:,} pixels).

- **{tiles['cores']} cores** distintas. O preto do contorno (`010000`) é {pct(tiles['preto'])} dos pixels; cinzas
  (croma < 6) {pct(tiles['cinza'])}.
- Croma médio das cores com matiz: **{tiles['croma_medio']:.0f}** (Lab). Luminosidade entre {tiles['l_p5']:.0f} e {tiles['l_p95']:.0f} (p5–p95).
- Famílias de matiz ({len(tiles['familias'])} com mais de 0,4 % dos pixels): em média **{tiles['tons_por_familia']:.1f} tons** por família
  (tons com ≥ 3 % dos pixels da família; uma família junta as rampas de vários objetos do mesmo matiz, então é
  mais que uma rampa), **ΔL mediano de {tiles['degrau_mediano']:.1f}** entre tons vizinhos de uma família.
- Sombra: o tom mais escuro de cada família tem croma {tiles['croma_escuro_claro'][0]:.0f} e o mais claro {tiles['croma_escuro_claro'][1]:.0f} (em média):
  a sombra do Aeko vai na direção do preto, perdendo croma, não de uma cor saturada; o matiz gira
  {tiles['deslocamento_matiz']:+.0f}° do escuro para o claro (mediana das famílias), ou seja, quase não há hue shift (as exceções
  estão na tabela: o amarelo esverdeia ao clarear, o azul vai para o roxo ao escurecer). O contorno é preto
  puro em volta de tudo, não um escuro da própria cor — nas peças originais dos contribuidores o contorno é um
  escuro da cor da parte (ver a seção 2).

{chr(10).join(fam_linhas)}

![rampas dos tiles](../../estudo/aeko/paleta_tiles.png)

## 2. As peças: original × Aeko

Medido nas {n_pecas} peças (camada f de cada uma), separando as partes pelas máscaras (cabelo h, pele s, olhos e,
enfeites d, roupa c). Pixels pretos (contorno) fora das contas de tons.

- Cores por peça: **{media(o['cores']):.0f} no original → {media(a['cores']):.0f} no Aeko**.
- Contorno: no original, {pct(media(o['borda_preta']))} dos pixels da borda da silhueta são pretos (L médio da borda
  {media(o['borda_lum']):.0f}); no Aeko, **{pct(media(a['borda_preta']))}**. O preto é {pct(media(a['preto']))} dos pixels de uma
  peça no Aeko, {pct(media(o['preto']))} no original.
- Tons por parte, degraus e croma:

{chr(10).join(parte_linhas)}

Leitura: a ferramenta cortou os tons pela metade e dobrou os degraus de L (uns 8 no cabelo, 11 na pele);
o croma e o matiz das partes ficaram os do contribuidor (a diferença média de cor entre os dois
estilos, fora o contorno, é de 3 a 5 de ΔE, e a projeção dessa diferença na direção da cor mais próxima da
paleta dos tiles é zero). Nenhuma cor das peças no estilo Aeko aparece nos tiles, a não ser o preto.

![rampas de peças](../../estudo/aeko/rampas_pecas.png)

![histogramas](../../estudo/aeko/histogramas.png)

![contorno](../../estudo/aeko/contorno.png)

## 3. O que a ferramenta perdida fazia (dedução)

1. **Contorno preto `010000`**: todo pixel opaco que encosta na transparência (97 % deles no gabarito) e os
   pixels fora das máscaras com canal máximo abaixo de ~36 (o contorno escuro que o contribuidor pintou).
   O `01` no vermelho vem de converter o preto por Lab e voltar **(palpite)**. O alfa não muda nunca.
2. **Redução de tons por parte**: cada parte pintável perde metade dos tons; os que se fundem viram
   aproximadamente a média ponderada em Lab (é a melhor das hipóteses testadas: médias em RGB, RGB linear,
   HSV, mediana e moda saem piores). O critério de fusão **não foi recuperado**: nenhum limiar de ΔL, ΔE ou
   RGB separa os pares que se fundiram dos que não (70 % de acerto no melhor caso), duas cabeças com a mesma
   forma e os mesmos degraus (aly1pink-4 e aly1green-3) saíram com 1 e 3 tons de cabelo, e os quantizadores
   do Pillow (median cut, octree, max coverage) não reproduzem o gabarito (0 % de pixels iguais). Pode ter
   sido um k-means com inicialização instável **(palpite)**.
3. **Sem paleta fixa**: as cores não foram encaixadas na paleta dos tiles.
4. **Pequenos ajustes**: pele escura mais saturada (+20 % de croma em L 30–50), olhos claros menos (−10 %),
   cabelo com o contraste de L ampliado uns 10 %.
5. **Resto intocado**: o que fica fora das máscaras e não é escuro sai igual (ΔE médio 0,3).

A reconstrução (`tools/estilo_aeko.py`) faz 1, 3, 4 e 5 como medido, e para 2 usa famílias de matiz (corda em
(a, b) de Lab) com partição ótima em L (Jenks), K = round(amplitude de L / degrau) + 1, degrau 7 no cabelo, 26
na pele e 9 no resto. Com os agrupamentos do próprio gabarito (o "oráculo") e as médias em Lab o ΔE médio
ficaria em 2,6: é o teto do método "fundir e tirar a média"; o que falta é a cor exata que a ferramenta dava a
cada grupo.

## 4. Evolução da recolorização

{chr(10).join(evol)}

## 5. Nota e comparação (resumo)

{chr(10).join(resumo)}
"""
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(texto, encoding="utf8")


def main() -> int:
    ap = argparse.ArgumentParser(description="Estudo da paleta do Aeko.")
    ap.add_argument("--amostra", type=int, default=0, help="quantas peças medir (0 = todas)")
    ap.add_argument("--artes", type=Path, default=ea.ARTES_RECUPERADAS)
    ap.add_argument("--padrao", default="graal.{estilo}.{n}.png")
    ap.add_argument("--saida", type=Path, default=SAIDA_PADRAO)
    ap.add_argument("--doc", type=Path, default=DOC_PADRAO)
    args = ap.parse_args()
    args.saida.mkdir(parents=True, exist_ok=True)

    print("tiles...", file=sys.stderr)
    tiles = estudo_dos_tiles(cores_dos_tiles(args.artes))
    desenhar_paleta(tiles, args.saida / "paleta_tiles.png")

    pecas = ea.ler_pecas()
    folhas = ea.Folhas(args.artes, args.padrao)
    escolhidas = pecas
    if args.amostra and args.amostra < len(pecas):
        rng = np.random.default_rng(1)
        idx = set(rng.choice(len(pecas), args.amostra, replace=False).tolist())
        escolhidas = [p for i, p in enumerate(pecas) if i in idx or p.id in EXEMPLOS]
    print(f"peças ({len(escolhidas)})...", file=sys.stderr)
    estudo = estudo_das_pecas(escolhidas, folhas)
    desenhar_rampas_pecas(estudo["exemplos"], args.saida / "rampas_pecas.png")
    desenhar_histogramas(tiles, estudo, args.saida / "histogramas.png")
    desenhar_contorno(pecas, folhas, args.saida / "contorno.png")

    comparacao = None
    notas = ea.RAIZ / "estudo" / "comparacao" / "notas.json"
    if notas.exists():
        comparacao = json.loads(notas.read_text(encoding="utf8"))
    escrever_documento(tiles, estudo, len(escolhidas), args.doc, comparacao)
    print(f"{args.doc}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
