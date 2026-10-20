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

Com `--referencia [<png>]` faz só o estudo dos três estilos da ferramenta de arte nova (aeko, equipe e aeko+equipe,
seção 6 do documento): mede as folhas do Aeko, as peças do Graal e a arte da equipe com a mesma função, grava os
alvos em tools/estilos_arte.json e a imagem estudo/estilo_arte/rampas_equipe.png (só cores). A referência padrão é
Documents/Haywood-Valley-recuperado/aeko/referencia_estilo_equipe.png, fora do repositório. A rodada normal (sem
`--referencia`) refaz as seções 1 a 5 e mantém a 6 como está.

Uso:
    python -I tools/estudo_aeko.py [--amostra N] [--artes <pasta>] [--saida estudo/aeko] [--doc docs/arte/ESTUDO_AEKO.md]
    python -I tools/estudo_aeko.py --referencia [<png>]
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


# --- os estilos: Aeko, equipe e a mistura (seção 6) -----------------------------------------------------------
#
# Mede com a mesma função (estilo_aeko_arte.medir_objeto) os gabaritos dos dois estilos da ferramenta de arte nova:
# - aeko: as folhas do Aeko em janelas de 32×32 (o quadriculado é a transparência) e a camada f de frente das peças
#   do Graal no estilo Aeko (e no original, para comparar);
# - equipe: os objetos da referência da equipe (componentes sobre o fundo chapado), as árvores da MADX (o "depois"
#   da captura antes → depois), as árvores em progresso (captura do Aseprite) e as duas folhas de tiles da equipe em
#   janelas de 32×32.
# As imagens da equipe ficam em Documents/Haywood-Valley-recuperado (aeko/ e equipe/), fora do repositório. Grava os
# alvos em tools/estilos_arte.json (números e a paleta da equipe, só cores) e escreve a seção 6 do documento.

RECUPERADO = Path(r"C:\Users\Szortek\Documents\Haywood-Valley-recuperado")
REFERENCIA_PADRAO = RECUPERADO / "aeko" / "referencia_estilo_equipe.png"
PASTA_EQUIPE = RECUPERADO / "equipe"
MADX = PASTA_EQUIPE / "arvores_antes_depois_madx.png"
EM_PROGRESSO = PASTA_EQUIPE / "arvores_em_progresso.png"
FOLHAS_EQUIPE = (PASTA_EQUIPE / "folha_tiles_1.png", PASTA_EQUIPE / "folha_tiles_2.png")
SAIDA_ESTILOS = ea.RAIZ / "estudo" / "estilo_arte"
JANELA = 32
CONJUNTOS = {
    "aeko_folhas": "folhas do Aeko (janelas 32×32)",
    "graal_aeko": "peças do Graal no estilo Aeko",
    "graal_original": "peças do Graal no original",
    "equipe": "objetos da equipe (referência e árvores)",
    "equipe_folhas": "folhas de tiles da equipe (janelas 32×32)",
}
CATEGORIAS = {
    "terreno": "terrenos", "botao": "botões", "cabeca": "cabeças e cocares", "equipamento": "equipamentos",
    "arvore": "árvores da referência", "arvore_madx": "árvores da MADX (depois)", "arvore_aseprite": "árvores em progresso",
}


def _sem_objetos_na_moldura(im: np.ndarray, fundo: np.ndarray, minimo: int) -> list:
    """Os componentes fora do fundo, sem os que encostam na moldura (a interface de uma captura)."""
    import estilo_aeko_arte as arte

    h, w = fundo.shape
    saida = []
    for fatia, m in arte.componentes(~fundo, minimo):
        if fatia[0].start == 0 or fatia[1].start == 0 or fatia[0].stop == h or fatia[1].stop == w:
            continue
        saida.append((fatia, m))
    return saida


def _recortar(im: np.ndarray, fatia, m: np.ndarray) -> np.ndarray:
    o = im[fatia].copy()
    o[..., 3] = np.where(m, 255, 0)
    o[~m, :3] = 0
    return o


def unidades_equipe(caminho: Path) -> list[tuple[str, np.ndarray]]:
    """Os objetos da referência: (categoria, RGBA). A categoria vem do tamanho e do lugar na folha."""
    import estilo_aeko_arte as arte

    im = arte.ler_rgba(caminho)
    im = arte.reduzir(im, arte.detectar_escala(im))
    rgb = im[..., :3]
    moldura = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    cores, cont = np.unique(moldura, axis=0, return_counts=True)
    fundo = (rgb == cores[cont.argmax()]).all(-1)
    altura, largura = fundo.shape
    saida = []
    for fatia, m in arte.componentes(~fundo, 24):
        cy = (fatia[0].start + fatia[0].stop) / 2 / altura
        cx = (fatia[1].start + fatia[1].stop) / 2 / largura
        grande = m.sum() >= 10_000
        if cx < 0.41 and grande:
            cat = "terreno"
        elif cx < 0.726:
            cat = "botao" if grande else "cabeca"
        else:
            cat = "equipamento" if cy < 0.535 else "arvore"
        saida.append((cat, _recortar(im, fatia, m)))
    return saida


def arvores_madx(caminho: Path = MADX) -> dict[str, list[np.ndarray]]:
    """
    O par antes → depois da MADX: a captura (ampliação de ~5,23×, JPEG) volta a 1 pixel por pixel, o fundo chapado
    sai e as quatro árvores são separadas: as duas da esquerda são o antes, as duas da direita o depois (de cima para
    baixo: a rosa e a verde). A seta e a assinatura ficam de fora.
    """
    import estilo_aeko_arte as arte

    pequena, _grade = arte.desamostrar_captura(arte.ler_rgba(caminho))
    rgb = pequena[..., :3]
    moldura = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    cores, cont = np.unique(moldura, axis=0, return_counts=True)
    limpa, _ = arte.tirar_fundo(pequena, "#" + ea.hexa(cores[cont.argmax()]), {"fundo_tolerancia": 8.0})
    h, w = limpa.shape[:2]
    saida: dict[str, list] = {"antes": [], "depois": []}
    for fatia, m in arte.componentes(limpa[..., 3] > 0, 300):
        cy = (fatia[0].start + fatia[0].stop) / 2 / h
        cx = (fatia[1].start + fatia[1].stop) / 2 / w
        if cy > 0.8 or 0.4 <= cx <= 0.55:
            continue
        saida["antes" if cx < 0.4 else "depois"].append((cy, _recortar(limpa, fatia, m)))
    return {k: [o for _cy, o in sorted(v, key=lambda t: t[0])] for k, v in saida.items()}


def arvores_aseprite(caminho: Path = EM_PROGRESSO) -> list[np.ndarray]:
    """
    As árvores da captura do Aseprite (zoom inteiro de 6×, sem perdas): o fundo são as três cores mais comuns (o
    quadriculado e o verde chapado atrás de algumas peças), na maior região ligada delas; o que encosta na moldura é
    interface e sai; as amostras de paleta são pequenas demais.
    """
    import estilo_aeko_arte as arte
    from scipy import ndimage

    pequena, _grade = arte.desamostrar_captura(arte.ler_rgba(caminho))
    rgb = pequena[..., :3]
    cores, cont = np.unique(rgb.reshape(-1, 3), axis=0, return_counts=True)
    parecido = np.zeros(rgb.shape[:2], bool)
    for c in cores[np.argsort(-cont)[:3]]:
        parecido |= (rgb == c).all(-1)
    rotulos, _n = ndimage.label(parecido)
    fundo = rotulos == np.bincount(rotulos[parecido]).argmax()
    return [_recortar(pequena, fatia, m) for fatia, m in _sem_objetos_na_moldura(pequena, fundo, 400)]


def _janelas(im: np.ndarray, minimo_opaco: float = 0.4) -> list[np.ndarray]:
    saida = []
    for y in range(0, im.shape[0], JANELA):
        for x in range(0, im.shape[1], JANELA):
            janela = im[y : y + JANELA, x : x + JANELA]
            opaco = janela[..., 3] > 0
            if opaco.mean() < minimo_opaco:
                continue
            _c, n = np.unique(janela[..., :3][opaco], axis=0, return_counts=True)
            if np.sort(n)[-2:].sum() >= 0.9 * opaco.sum():  # chapado ou xadrez de duas cores: preenchimento
                continue
            saida.append(janela.copy())
    return saida


def unidades_aeko() -> list[np.ndarray]:
    """As janelas de 32×32 das folhas do Aeko com pelo menos 40 % de pixels fora do quadriculado."""
    import estilo_aeko_arte as arte

    saida = []
    for caminho in arte.FOLHAS_AEKO:
        im = arte.ler_rgba(caminho)
        quad = np.zeros(im.shape[:2], bool)
        for q in arte.QUADRICULADO:
            quad |= (im[..., :3] == q).all(-1)
        im[quad, 3] = 0
        im[quad, :3] = 0
        saida.extend(_janelas(im))
    return saida


def unidades_folhas_equipe() -> list[np.ndarray]:
    """As janelas de 32×32 das folhas de tiles da equipe (alfa < 128 é transparente; sem preenchimentos)."""
    import estilo_aeko_arte as arte

    saida = []
    for caminho in FOLHAS_EQUIPE:
        if not caminho.exists():
            continue
        im = arte.ler_rgba(caminho)
        transparente = im[..., 3] < 128
        im[..., 3] = np.where(transparente, 0, 255)
        im[transparente, :3] = 0
        saida.extend(_janelas(im))
    return saida


def cor_de_fundo_da_referencia(caminho: Path) -> str:
    import estilo_aeko_arte as arte

    im = arte.ler_rgba(caminho)
    rgb = im[..., :3]
    moldura = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    cores, cont = np.unique(moldura, axis=0, return_counts=True)
    return ea.hexa(cores[cont.argmax()])


def unidades_graal(n: int, artes: Path, padrao: str) -> dict[str, list[np.ndarray]]:
    """A célula de frente da camada f de `n` peças sorteadas, nos dois estilos."""
    pecas = ea.ler_pecas()
    folhas = ea.Folhas(artes, padrao)
    rng = np.random.default_rng(1)
    saida: dict[str, list[np.ndarray]] = {"graal_aeko": [], "graal_original": []}
    for i in rng.choice(len(pecas), min(n, len(pecas)), replace=False):
        peca = pecas[int(i)]
        celula = 8 if peca.corpo else 2  # de frente, parado
        for estilo, chave in (("aeko", "graal_aeko"), ("original", "graal_original")):
            f = ea.montar(peca, folhas, estilo).f[celula * ea.CELULA : (celula + 1) * ea.CELULA]
            if (f[..., 3] > 0).sum() >= 40:
                saida[chave].append(f.copy())
    return saida


def resumir_conjunto(medidas: list[dict]) -> dict:
    """Os números de um conjunto: médias por objeto e, para as rampas, os valores de todas as famílias juntos."""
    import estilo_aeko_arte as arte

    def media(chave, filtro=lambda m: True):
        v = [m[chave] for m in medidas if filtro(m) and not (isinstance(m[chave], float) and np.isnan(m[chave]))]
        return float(np.mean(v)) if v else float("nan")

    fam = [f for m in medidas for f in m["familias"] if not f["neutra"]]
    dls = [b - a for f in fam for a, b in zip(f["L"], f["L"][1:])]
    razoes = [f["C"][0] / max(f["C"]) for f in fam if f["tons"] >= 3 and max(f["C"]) > 0]
    giros = [((f["h"][-1] - f["h"][0] + 180) % 360) - 180 for f in fam if f["tons"] >= 3 and f["C"][0] > 8]
    tons = [arte.resumo_rampas(m).get("tons") for m in medidas]
    tons = [t for t in tons if t is not None]
    com_borda = lambda m: m["borda_pixels"] >= 8  # noqa: E731
    return {
        "objetos": len(medidas),
        "pixels_mediana": float(np.median([m["pixels"] for m in medidas])),
        "cores_mediana": float(np.median([m["cores"] for m in medidas])),
        "cores_por_100px": float(np.median([100 * m["cores"] / m["pixels"] for m in medidas])),
        "tons": float(np.mean(tons)) if tons else float("nan"),
        "degrau": float(np.median(dls)) if dls else float("nan"),
        "croma_escuro": float(np.mean(razoes)) if razoes else float("nan"),
        "giro": float(np.median(giros)) if giros else float("nan"),
        "croma": media("croma"),
        "borda_preta": media("borda_preta", com_borda),
        "borda_tinta": media("borda_tinta", com_borda),
        "borda_escura": media("borda_escura", com_borda),
        "borda_L": media("borda_L", com_borda),
        "contorno_duplo": media("contorno_duplo", com_borda),
        "tinta_interna": media("tinta_interna"),
        "xadrez": media("xadrez"),
        "isolados": media("isolados"),
        "paleta_aeko_exata": media("paleta_exata"),
        "paleta_aeko_jnd": media("paleta_jnd"),
        "paleta_aeko_dE": media("paleta_dE"),
    }


def objetos_da_equipe(referencia: Path) -> list[tuple[str, np.ndarray]]:
    """Os objetos do estilo equipe: os da referência, as árvores da MADX (o depois) e as árvores em progresso."""
    objetos = unidades_equipe(referencia)
    if MADX.exists():
        objetos += [("arvore_madx", o) for o in arvores_madx()["depois"]]
    if EM_PROGRESSO.exists():
        objetos += [("arvore_aseprite", o) for o in arvores_aseprite()]
    return objetos


def estudo_estilos(referencia: Path, artes: Path, padrao: str, n_pecas: int = 200) -> dict:
    import estilo_aeko_arte as arte

    pal_aeko = arte.paleta_aeko()
    print("estilos: folhas do Aeko...", file=sys.stderr)
    janelas = unidades_aeko()
    print(f"  {len(janelas)} janelas; peças do Graal...", file=sys.stderr)
    graal = unidades_graal(n_pecas, artes, padrao)
    print("  arte da equipe (referência, árvores, folhas)...", file=sys.stderr)
    equipe = objetos_da_equipe(referencia)
    janelas_equipe = unidades_folhas_equipe()

    medidas = {
        "aeko_folhas": [arte.medir_objeto(j, pal_aeko, beirada_transparente=False) for j in janelas],
        "graal_aeko": [arte.medir_objeto(o, pal_aeko) for o in graal["graal_aeko"]],
        "graal_original": [arte.medir_objeto(o, pal_aeko) for o in graal["graal_original"]],
        "equipe": [arte.medir_objeto(o, pal_aeko) for _c, o in equipe],
        "equipe_folhas": [arte.medir_objeto(j, pal_aeko, beirada_transparente=False) for j in janelas_equipe],
    }
    por_categoria = {}
    for cat in CATEGORIAS:
        ms = [m for (c, _o), m in zip(equipe, medidas["equipe"]) if c == cat]
        if ms:
            por_categoria[cat] = resumir_conjunto(ms)
    conjuntos = {k: resumir_conjunto(v) for k, v in medidas.items() if v}

    # O preto da equipe: a cor mais comum entre os pixels de tinta da beirada dos objetos com contorno (sem os
    # terrenos, que não têm, e sem os botões, que têm muita beirada marrom e puxariam a cor para eles).
    tinta_borda = []
    for c, o in equipe:
        if c in ("terreno", "botao"):
            continue
        a = o[..., 3] > 0
        borda = a & ~arte._vizinhos4(a, False)
        lab = ea.srgb_para_lab(o[..., :3])
        tinta_borda.append(o[..., :3][borda & (lab[..., 0] < arte.PARAMETROS["tinta_L"])])
    tb = np.concatenate(tinta_borda)
    cores_tb, cont_tb = np.unique(tb, axis=0, return_counts=True)
    preto_equipe = ea.hexa(cores_tb[cont_tb.argmax()])
    # A paleta da equipe: as cores com pelo menos 2 pixels dos objetos e das folhas (o fundo fica de fora).
    todas = np.concatenate([o[..., :3][o[..., 3] > 0] for _c, o in equipe] + [j[..., :3][j[..., 3] > 0] for j in janelas_equipe])
    cores_e, cont_e = np.unique(todas, axis=0, return_counts=True)
    paleta_equipe = cores_e[cont_e >= 2]

    # Os alvos. Cada estilo junta as folhas e os objetos em partes iguais nas rampas (os dois são do mesmo autor); o
    # contorno vem dos objetos (as folhas quase não encostam no transparente), sem os terrenos da equipe.
    def meio(a, b, chave, casas):
        va, vb = a[chave], b[chave]
        if np.isnan(vb):
            return round(va, casas)
        return round((va + vb) / 2, casas)

    fa, fg = conjuntos["aeko_folhas"], conjuntos["graal_aeko"]
    eq, ef = conjuntos["equipe"], conjuntos.get("equipe_folhas", conjuntos["equipe"])
    sem_terreno = resumir_conjunto([m for (c, _o), m in zip(equipe, medidas["equipe"]) if c != "terreno"])
    alvos = {
        "aeko": {
            "tons": meio(fg, fa, "tons", 2), "degrau": meio(fg, fa, "degrau", 2),
            "croma_escuro": meio(fg, fa, "croma_escuro", 3), "giro": meio(fg, fa, "giro", 1),
            "borda": round(fg["borda_preta"], 3), "cor_contorno": "010000",
        },
        "equipe": {
            "tons": meio(eq, ef, "tons", 2), "degrau": meio(eq, ef, "degrau", 2),
            "croma_escuro": meio(eq, ef, "croma_escuro", 3), "giro": meio(eq, ef, "giro", 1),
            "borda": round(sem_terreno["borda_escura"], 3), "cor_contorno": preto_equipe,
        },
    }
    tolerancias = {"tons": [1.0, 3.0], "degrau": [2.0, 5.0], "croma_escuro": [0.15, 0.4]}

    # A nota de cada gabarito contra o próprio estilo e contra o outro (a nota tem de separar os dois).
    dados_temp = {"estilos": alvos, "tolerancias": tolerancias, "paletas": {"equipe": [ea.hexa(c) for c in paleta_equipe]}}
    arte._cache.clear()
    arte._cache["estilos"] = dados_temp
    notas = {}
    amostras = {
        "aeko_folhas": [(j, False) for j in janelas[::4]],
        "graal_aeko": [(o, True) for o in graal["graal_aeko"]],
        "graal_original": [(o, True) for o in graal["graal_original"]],
        "equipe": [(o, c != "terreno") for c, o in equipe],
        "equipe_folhas": [(j, False) for j in janelas_equipe[::4]],
    }
    for estilo in arte.ESTILOS:
        a = arte.alvo(estilo, 0.5)
        notas[estilo] = {k: round(float(np.mean([arte.nota_estilo(o, a, cc)[0] for o, cc in v])), 2) for k, v in amostras.items() if v}
    arte._cache.clear()

    return {
        "alvos": alvos, "tolerancias": tolerancias, "conjuntos": conjuntos, "equipe_por_categoria": por_categoria,
        "notas_proprias": notas, "paleta_equipe": [ea.hexa(c) for c in paleta_equipe], "preto_equipe": preto_equipe,
        "fundo_referencia": cor_de_fundo_da_referencia(referencia), "escala_referencia": int(arte.detectar_escala(arte.ler_rgba(referencia))),
        "exemplos_rampas": [(c, [f for f in m["familias"] if not f["neutra"]][:2]) for (c, _o), m in zip(equipe, medidas["equipe"])],
    }


def gravar_estilos(estudo: dict, referencia: Path) -> Path:
    import estilo_aeko_arte as arte

    dados = {
        "nota": "gerado por tools/estudo_aeko.py --referencia; números em docs/arte/ESTUDO_AEKO.md, seção 6",
        "gerado_em": "2026-10-20",
        "referencia": referencia.name,
        "estilos": estudo["alvos"],
        "tolerancias": estudo["tolerancias"],
        "notas_proprias": estudo["notas_proprias"],
        "conjuntos": {k: {kk: (round(vv, 4) if isinstance(vv, float) else vv) for kk, vv in v.items()} for k, v in estudo["conjuntos"].items()},
        "paletas": {"equipe": "__PALETA__"},
    }
    texto = json.dumps(dados, ensure_ascii=False, indent="\t")
    # a paleta (uma cor por linha seriam mais de mil linhas) vai numa linha só
    texto = texto.replace('"__PALETA__"', json.dumps(estudo["paleta_equipe"]))
    arte.ARQUIVO_ESTILOS.write_text(texto + "\n", encoding="utf8")
    return arte.ARQUIVO_ESTILOS


def desenhar_rampas_equipe(estudo: dict, caminho: Path) -> None:
    """Só cores: as rampas (até 2 famílias) de alguns objetos da equipe por categoria, e os alvos lado a lado."""
    lado = 30
    fonte = _fonte(11)
    linhas = []
    vistos: dict[str, int] = defaultdict(int)
    for cat, fams in estudo["exemplos_rampas"]:
        if vistos[cat] >= 3 or not fams:
            continue
        vistos[cat] += 1
        for f in fams:
            linhas.append((f"{CATEGORIAS[cat]} {vistos[cat]}", f))
    altura = 40 + len(linhas) * (lado + 8)
    largura = 200 + 12 * (lado + 3)
    im = Image.new("RGB", (largura, altura), (255, 255, 255))
    d = ImageDraw.Draw(im)
    d.text((10, 10), "Rampas da arte da equipe (tons com ≥ 3 % da família, em ordem de L)", fill=TEXTO, font=_fonte(14))
    y = 40
    for rotulo, f in linhas:
        dl = np.diff(f["L"])
        d.text((10, y + 8), f"{rotulo} · {f['tons']} tons · ΔL {np.median(dl) if len(dl) else 0:.1f}", fill=TEXTO, font=fonte)
        x = 200
        for h in f["rgb"][:12]:
            d.rectangle([x, y, x + lado - 1, y + lado - 1], fill=tuple(int(h[i : i + 2], 16) for i in (0, 2, 4)))
            x += lado + 3
        y += lado + 8
    im.save(caminho)


def secao_estilos(estudo: dict, referencia_nome: str) -> str:
    c = estudo["conjuntos"]
    al = estudo["alvos"]
    nomes = list(CONJUNTOS)

    def f(v, casas=1, pc=False):
        if isinstance(v, float) and np.isnan(v):
            return "—"
        return pct(v) if pc else f"{v:.{casas}f}"

    linhas = [
        "| medida | " + " | ".join(CONJUNTOS[k] for k in nomes) + " |",
        "|---" * (len(nomes) + 1) + "|",
    ]
    medidas = [
        ("objetos medidos", "objetos", 0, False), ("cores por objeto (mediana)", "cores_mediana", 0, False),
        ("cores por 100 pixels (mediana)", "cores_por_100px", 1, False), ("tons por família com matiz", "tons", 1, False),
        ("ΔL entre tons vizinhos (mediana)", "degrau", 1, False), ("croma do tom mais escuro ÷ o maior", "croma_escuro", 2, False),
        ("giro do matiz, escuro → claro (graus)", "giro", 0, False), ("croma médio (sem a tinta)", "croma", 0, False),
        ("beirada preta (canal ≤ 4)", "borda_preta", 0, True), ("beirada de tinta (L < 14)", "borda_tinta", 0, True),
        ("beirada escura (L < 30)", "borda_escura", 0, True), ("L médio da beirada", "borda_L", 0, False),
        ("contorno de 2 px (tinta da beirada com tinta por dentro)", "contorno_duplo", 0, True),
        ("tinta por dentro (linhas escuras)", "tinta_interna", 1, True), ("xadrez (janelas 2×2 em xadrez)", "xadrez", 1, True),
        ("pixels isolados (sem vizinho da mesma cor)", "isolados", 0, True),
        ("pixels com a cor exata da paleta do Aeko", "paleta_aeko_exata", 0, True),
        ("pixels a um JND da paleta do Aeko", "paleta_aeko_jnd", 0, True), ("ΔE médio à cor mais perto da paleta do Aeko", "paleta_aeko_dE", 1, False),
    ]
    for rotulo, chave, casas, pc in medidas:
        linhas.append(f"| {rotulo} | " + " | ".join(f(c[k][chave], casas, pc) for k in nomes) + " |")

    cat = estudo["equipe_por_categoria"]
    cat_linhas = ["| categoria | objetos | cores (mediana) | tons | ΔL | beirada escura | beirada preta | L da beirada | pixels na paleta do Aeko (JND) |", "|---|---|---|---|---|---|---|---|---|"]
    for k, v in cat.items():
        cat_linhas.append(
            f"| {CATEGORIAS[k]} | {v['objetos']} | {v['cores_mediana']:.0f} | {f(v['tons'])} | {f(v['degrau'])} | {pct(v['borda_escura'])} | "
            f"{pct(v['borda_preta'])} | {f(v['borda_L'], 0)} | {pct(v['paleta_aeko_jnd'])} |"
        )
    alvo_linhas = ["| alvo | tons | degrau de L | croma da sombra | giro | contorno (fração da beirada) | cor do contorno | paleta |", "|---|---|---|---|---|---|---|---|"]
    alvo_linhas.append(f"| aeko | {al['aeko']['tons']:.2f} | {al['aeko']['degrau']:.2f} | {al['aeko']['croma_escuro']:.2f} | {al['aeko']['giro']:+.0f}° | {pct(al['aeko']['borda'])} preta | `{al['aeko']['cor_contorno']}` | as {len(__import__('estilo_aeko_arte').paleta_aeko())} cores das folhas com 4 pixels ou mais |")
    alvo_linhas.append(f"| equipe | {al['equipe']['tons']:.2f} | {al['equipe']['degrau']:.2f} | {al['equipe']['croma_escuro']:.2f} | {al['equipe']['giro']:+.0f}° | {pct(al['equipe']['borda'])} escura | `{al['equipe']['cor_contorno']}` | as {len(estudo['paleta_equipe'])} cores da equipe (≥ 2 px) |")
    alvo_linhas.append("| aeko+equipe (m) | m·aeko + (1−m)·equipe | idem | idem | idem | idem, por pixel | a do aeko se m ≥ 0,5 | as duas, a do outro lado afastada |")
    notas = estudo["notas_proprias"]
    nota_linhas = ["| gabarito | " + " | ".join(arte_nome for arte_nome in notas) + " |", "|---" * (len(notas) + 1) + "|"]
    for k in nomes:
        nota_linhas.append(f"| {CONJUNTOS[k]} | " + " | ".join(f"{notas[e][k]:.2f}" for e in notas) + " |")

    tol = estudo["tolerancias"]
    return f"""## 6. Estilo equipe, e o Aeko + equipe

Gerado por `tools/estudo_aeko.py --referencia` em 2026-10-20. A ferramenta perdida de arte nova tinha três estilos:
**aeko** (o do Aeko: gabarito nas folhas `casa`/`castelo` e nas peças do Graal no estilo Aeko), **equipe** (a arte que a
equipe fez sem a mão do Aeko) e **aeko+equipe** (a mistura dos dois). Atenção: na seção 5, "Aeko + equipe" é o nome
antigo do ranking das peças dos contribuidores recoloridas; aqui é o terceiro estilo.

O gabarito do estilo equipe fica em `Documents\\Haywood-Valley-recuperado\\` (fora do repositório; aqui entram só os
números e a paleta, em `tools/estilos_arte.json`):

- `aeko\\{referencia_nome}`: {sum(v['objetos'] for k, v in cat.items() if not k.startswith('arvore_'))} objetos (terrenos, botões, cabeças e cocares, equipamentos, árvores) sobre
  um fundo chapado `#{estudo['fundo_referencia']}`, ampliados {estudo['escala_referencia']}× (cada pixel de arte é um bloco {estudo['escala_referencia']}×{estudo['escala_referencia']}; o estudo reduz antes de
  medir). Os objetos são os componentes 8-conexos fora do fundo, com 24 pixels ou mais; a categoria sai do tamanho e
  do lugar na folha.
- `equipe\\arvores_antes_depois_madx.png`: captura com ampliação fracionária (~5,23×) e ruído de JPEG. A ferramenta
  acha a grade pela energia das bordas (Fourier), toma a mediana do miolo de cada pixel e junta as cores a menos de
  ΔE 5 (`desamostrar_captura`). As duas árvores da direita (o "depois") entram aqui; o par antes → depois serve à
  validação (ESTILO_AEKO_ARTE.md).
- `equipe\\arvores_em_progresso.png`: captura do Aseprite em zoom 6× sem perdas (`grade_inteira`); o quadriculado e o
  verde chapado de fundo saem, a interface encosta na moldura e sai.
- `equipe\\folha_tiles_1.png` e `folha_tiles_2.png` (2048×512, nativas), em janelas de 32×32 como as do Aeko; janelas de
  uma ou duas cores (preenchimento) ficam de fora. O detalhe e os recortes da mesma pasta são pedaços ampliados dessas
  folhas e não entram de novo.

Todos os conjuntos são medidos pela mesma função (`medir_objeto` em `tools/estilo_aeko_arte.py`). Nas janelas das
folhas, o quadriculado (Aeko) ou o alfa (equipe) é a transparência e a beirada da janela não conta como borda; as peças
do Graal entram pela célula de frente da camada f ({c['graal_aeko']['objetos']} sorteadas). Tons: os de uma família de matiz
com ≥ 3 % dela, nas famílias com ≥ 8 % do objeto.

{chr(10).join(linhas)}

Por categoria dos objetos da equipe:

{chr(10).join(cat_linhas)}

![rampas da equipe](../../estudo/estilo_arte/rampas_equipe.png)

### O que muda do Aeko para a equipe

- **Contorno.** No Aeko o contorno é o preto `010000`, sempre o mesmo, em volta de tudo que encosta no transparente
  ({pct(c['graal_aeko']['borda_preta'])} da beirada das peças). Na equipe o contorno é escuro mas raramente o mesmo preto
  ({pct(c['equipe']['borda_preta'])} da beirada é preto puro; {pct(sem_borda_escura(estudo))} é escura, L < 30, sem os terrenos): pretos que variam de
  objeto para objeto (`000000`, `080808`, `121212`, `1B1B1B`; o mais comum é `{estudo['preto_equipe']}`), um marrom escuro nos
  botões e **contorno da própria cor** nas árvores, no capim e no cristal da coroa (verde-petróleo, roxo escuro; L da
  beirada {f(cat.get('arvore', {}).get('borda_L', float('nan')), 0)} nas árvores da referência, {f(cat.get('arvore_madx', {}).get('borda_L', float('nan')), 0)} nas da MADX). Os terrenos não têm contorno.
- **Cores e tons.** Os objetos da equipe têm mais cores ({c['equipe']['cores_mediana']:.0f} na mediana, contra
  {c['graal_aeko']['cores_mediana']:.0f} nas peças no estilo Aeko) e mais tons por rampa ({f(c['equipe']['tons'])} contra {f(c['graal_aeko']['tons'])} nas peças), com degraus
  de L parecidos ({f(c['equipe']['degrau'])} contra {f(c['graal_aeko']['degrau'])}); algumas cabeças têm centenas de cores (degradê liso no cabelo), o
  que o Aeko nunca faz. Já as folhas de tiles da equipe são mais econômicas que as do Aeko: {f(c['equipe_folhas']['cores_mediana'], 0)} cores por
  janela (Aeko: {f(c['aeko_folhas']['cores_mediana'], 0)}), {f(c['equipe_folhas']['tons'])} tons e degraus de {f(c['equipe_folhas']['degrau'])} (Aeko: {f(c['aeko_folhas']['tons'])} e {f(c['aeko_folhas']['degrau'])}).
- **Paleta.** Só {pct(c['equipe']['paleta_aeko_jnd'])} dos pixels dos objetos da equipe e {pct(c['equipe_folhas']['paleta_aeko_jnd'])} das folhas dela ficam a um JND
  da paleta do Aeko, contra {pct(c['aeko_folhas']['paleta_aeko_jnd'])} nas folhas do Aeko: a equipe não prende as cores à paleta dele.
- **Sombra e matiz.** Os dois descem ao escuro perdendo croma (o tom mais escuro com {f(c['equipe']['croma_escuro'], 2)} do croma do mais
  saturado nos objetos da equipe, {f(c['equipe_folhas']['croma_escuro'], 2)} nas folhas dela; {f(c['aeko_folhas']['croma_escuro'], 2)} nas folhas do Aeko, {f(c['graal_aeko']['croma_escuro'], 2)} nas peças). O
  matiz gira pouco do escuro ao claro nos dois ({f(c['equipe']['giro'], 0)}° e {f(c['equipe_folhas']['giro'], 0)}° na equipe; {f(c['aeko_folhas']['giro'], 0)}° e {f(c['graal_aeko']['giro'], 0)}° no Aeko).
- **Textura.** Os objetos da equipe têm mais pixels isolados ({pct(c['equipe']['isolados'])}, contra {pct(c['aeko_folhas']['isolados'])} nas folhas do Aeko):
  folhagem e cabelo ruidosos (a MADX passa a árvore lisa para folhagem picada). Xadrez (dithering) é raro em todos.

### Os alvos da ferramenta (`tools/estilos_arte.json`)

{chr(10).join(alvo_linhas)}

Cada alvo junta, nas rampas (tons, degrau, sombra, giro), as folhas e os objetos do mesmo autor em partes iguais:
folhas do Aeko e peças no estilo Aeko; folhas da equipe e objetos da equipe. O contorno vem dos objetos (as folhas
quase não encostam no transparente), sem os terrenos da equipe. A paleta da equipe são as cores com 2 pixels ou mais
dos objetos e das folhas dela.

**A mistura aeko+equipe (palpite)**: cada número é a média ponderada `m·aeko + (1−m)·equipe`, com `m = --mistura`
(padrão 0,5); um pixel da beirada conta como contorno `m` vezes "é preto (canal ≤ 4)" mais `1−m` vezes "é escuro
(L < 30)"; a paleta é a união das duas, e ao prender um tom a distância a uma cor do Aeko é multiplicada por
`1 + 0,5·(1−m)` e a uma da equipe por `1 + 0,5·m` (com m = 0,5 as duas pesam igual). A cor do contorno é a do aeko
com m ≥ 0,5 e a da equipe abaixo.

### A nota de aderência ao estilo

`nota_estilo` (em `tools/estilo_aeko_arte.py`) dá 0–10: 35 % paleta (pixels a um JND da paleta do alvo), 25 % contorno
(fração da beirada que é contorno do alvo ÷ a fração do gabarito, até 1), 15 % tons, 15 % degrau e 10 % croma da
sombra. Os três últimos são limites de um lado só, porque é isso que o estilo pede: no máximo alvo + {tol['tons'][0]:g} tons por
família (zera {tol['tons'][1]:g} tons acima disso), degrau de L de pelo menos alvo − {tol['degrau'][0]:g} (zera {tol['degrau'][1]:g} abaixo), sombra com no máximo
alvo + {tol['croma_escuro'][0]:g} de razão de croma (zera {tol['croma_escuro'][1]:g} acima). Menos tons, degraus maiores ou sombra mais neutra não tiram
nota. Uma versão com tolerância dos dois lados deu uns 0,5 nessas três partes em todos os conjuntos (a variação de
objeto para objeto engolia a diferença entre os estilos) e foi trocada. Pesos e limites são escolha desta
reconstrução. A nota média de cada gabarito contra cada alvo (as janelas das folhas e os terrenos sem o contorno):

{chr(10).join(nota_linhas)}

A nota separa os estilos sobretudo pela paleta e pelo contorno: as folhas do Aeko tiram {notas['aeko']['aeko_folhas']:.2f} no aeko e
{notas['equipe']['aeko_folhas']:.2f} no equipe; as folhas da equipe, {notas['equipe']['equipe_folhas']:.2f} no equipe e {notas['aeko']['equipe_folhas']:.2f} no aeko; os objetos da equipe,
{notas['equipe']['equipe']:.2f} no equipe e {notas['aeko']['equipe']:.2f} no aeko. As peças do Graal no estilo Aeko ficam no meio ({notas['aeko']['graal_aeko']:.2f} no aeko e
{notas['equipe']['graal_aeko']:.2f} no equipe): a ferramenta das peças pôs o contorno e reduziu os tons, mas não prendia as cores à paleta das
folhas (seção 3), e o alvo aeko é essa paleta fechada. As peças originais dos contribuidores caem mais no aeko
({notas['aeko']['graal_original']:.2f}), pelo contorno da própria cor e pelos tons demais.
"""


def sem_borda_escura(estudo: dict) -> float:
    return estudo["alvos"]["equipe"]["borda"]


def atualizar_secao_6(doc: Path, secao: str) -> None:
    texto = doc.read_text(encoding="utf8") if doc.exists() else ""
    i = texto.find("## 6. ")
    texto = (texto[:i] if i >= 0 else texto.rstrip() + "\n\n") + secao
    doc.write_text(texto, encoding="utf8")


def main() -> int:
    ap = argparse.ArgumentParser(description="Estudo da paleta do Aeko.")
    ap.add_argument("--amostra", type=int, default=0, help="quantas peças medir (0 = todas)")
    ap.add_argument("--artes", type=Path, default=ea.ARTES_RECUPERADAS)
    ap.add_argument("--padrao", default="graal.{estilo}.{n}.png")
    ap.add_argument("--saida", type=Path, default=SAIDA_PADRAO)
    ap.add_argument("--doc", type=Path, default=DOC_PADRAO)
    ap.add_argument("--referencia", type=Path, nargs="?", const=REFERENCIA_PADRAO,
                    help="só o estudo dos estilos (seção 6) a partir da referência da equipe; grava tools/estilos_arte.json")
    args = ap.parse_args()
    if args.referencia is not None:
        if not args.referencia.exists():
            ap.error(f"a referência não existe: {args.referencia}")
        SAIDA_ESTILOS.mkdir(parents=True, exist_ok=True)
        estudo = estudo_estilos(args.referencia, args.artes, args.padrao)
        print(gravar_estilos(estudo, args.referencia))
        desenhar_rampas_equipe(estudo, SAIDA_ESTILOS / "rampas_equipe.png")
        atualizar_secao_6(args.doc, secao_estilos(estudo, args.referencia.name))
        print(args.doc)
        return 0
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
    secao_6 = ""
    if args.doc.exists():
        antigo = args.doc.read_text(encoding="utf8")
        if "## 6. " in antigo:
            secao_6 = antigo[antigo.find("## 6. ") :]  # a seção 6 só muda com --referencia
    escrever_documento(tiles, estudo, len(escolhidas), args.doc, comparacao)
    if secao_6:
        atualizar_secao_6(args.doc, secao_6)
    print(f"{args.doc}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
