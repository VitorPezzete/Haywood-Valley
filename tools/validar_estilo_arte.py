"""Validação de tools/estilo_aeko_arte.py (2026-10-20).

Duas provas, nos três estilos:

(a) **Objetos estragados.** Objetos dos gabaritos (peças do Graal no estilo Aeko e janelas das folhas do Aeko para o
    aeko; os objetos da equipe, com as árvores, e janelas das folhas de tiles dela para o equipe; todos para o
    aeko+equipe; as janelas vão sem contorno, como tiles) são estragados de um jeito
    realista e passam pela ferramenta. Estragos: `borrar` (gaussiano σ = 1 dentro da silhueta), `degrade` (luz
    vertical suave por cima, como um degradê de pincel macio), `saturar` (croma × 1,5, sombras puxadas para o azul e
    luzes para o amarelo, ruído de ±2 em L: mais cores e mais saturadas), `sem_contorno` (a beirada escura some) e
    `tudo` (os quatro). Para cada um: a nota de aderência ao estilo (`nota_estilo`) do estragado e da devolvida, e a
    nota contra o original (a de comparar_estilos.py: `10 × (0,5·max(0, 1 − ΔE/10) + 0,3·iguais + 0,2·paleta)`, com o
    pixel que só um dos dois tem contando como ΔE 10), também do estragado e da devolvida.
(b) **Imagens de fora.** Quatro artes desenhadas aqui com o Pillow, em outro estilo: uma árvore com degradê liso e
    antisserrilhado, um baú de cores chapadas sem contorno sobre fundo branco, um botão de interface com degradê,
    sombra e texto, e uma poção com brilho, ampliada 2× sobre fundo cinza. Ficam em estudo/estilo_arte/fora/ com as
    prévias de cada estilo.
(c) **O par antes → depois da MADX** (Haywood-Valley-recuperado/equipe/arvores_antes_depois_madx.png): as árvores
    lisas do "antes" passam pela ferramenta e são comparadas com o "depois" que a equipe desenhou à mão, com as
    silhuetas alinhadas pela maior sobreposição.

Grava estudo/estilo_arte/validacao.json e validacao.md (só números). As folhas de antes | estragado | devolvido dos
objetos (arte da equipe e dos contribuidores) vão para fora do repositório, em
Documents/Haywood-Valley-recuperado/aeko/validacao/.

Uso:
    python -I tools/validar_estilo_arte.py [--amostra N] [--estilos aeko,equipe,aeko+equipe] [--sem-folhas]
        [--parametros <json>] [--rotulo <texto>]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")  # uma thread só: o OpenBLAS reserva memória por thread
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import estilo_aeko as ea  # noqa: E402
import estilo_aeko_arte as arte  # noqa: E402
import estudo_aeko as es  # noqa: E402

SAIDA = ea.RAIZ / "estudo" / "estilo_arte"
FORA_DO_REPO = Path(r"C:\Users\Szortek\Documents\Haywood-Valley-recuperado\aeko\validacao")
ESTRAGOS = ("borrar", "degrade", "saturar", "sem_contorno", "tudo")
DE_MAXIMO = 10.0


# --- estragos ----------------------------------------------------------------------------------------------


def _so_dentro(rgba: np.ndarray, novo_rgb: np.ndarray) -> np.ndarray:
    saida = rgba.copy()
    m = rgba[..., 3] > 0
    saida[m, :3] = np.clip(np.rint(novo_rgb[m]), 0, 255).astype(np.uint8)
    return saida


def borrar(rgba: np.ndarray, sigma: float = 1.0) -> np.ndarray:
    """Gaussiano só com as cores de dentro (pré-multiplicado pela máscara): a silhueta não muda."""
    from scipy import ndimage

    m = (rgba[..., 3] > 0).astype(float)
    rgb = rgba[..., :3].astype(float)
    soma = np.stack([ndimage.gaussian_filter(rgb[..., c] * m, sigma) for c in range(3)], -1)
    peso = ndimage.gaussian_filter(m, sigma)[..., None]
    return _so_dentro(rgba, soma / np.maximum(peso, 1e-6))


def degrade(rgba: np.ndarray) -> np.ndarray:
    """Luz vertical suave: +14 de L no alto, −14 embaixo, e um borrão leve que espalha os tons."""
    lab = ea.srgb_para_lab(rgba[..., :3])
    h = rgba.shape[0]
    ys = np.linspace(1, -1, h)[:, None]
    lab[..., 0] = np.clip(lab[..., 0] + 14 * ys, 0, 100)
    return borrar(_so_dentro(rgba, ea.lab_para_srgb(lab).astype(float)), 0.6)


def saturar(rgba: np.ndarray, semente: int = 7) -> np.ndarray:
    """Croma × 1,5; sombra para o azul (−25° no escuro), luz para o amarelo (+15° no claro); ruído de ±2 em L."""
    lab = ea.srgb_para_lab(rgba[..., :3])
    croma = np.hypot(lab[..., 1], lab[..., 2]) * 1.5
    matiz = np.arctan2(lab[..., 2], lab[..., 1])
    t = np.clip(lab[..., 0] / 100, 0, 1)
    matiz = matiz + np.radians(-25 * (1 - t) + 15 * t)
    lab[..., 1] = croma * np.cos(matiz)
    lab[..., 2] = croma * np.sin(matiz)
    lab[..., 0] += np.random.default_rng(semente).uniform(-2, 2, lab.shape[:2])
    return _so_dentro(rgba, ea.lab_para_srgb(lab).astype(float))


def sem_contorno(rgba: np.ndarray) -> np.ndarray:
    """A beirada escura (L < 35) some: a arte como se tivesse sido desenhada sem contorno."""
    saida = rgba.copy()
    a = rgba[..., 3] > 0
    beirada = a & ~arte._vizinhos4(a, False)
    escura = ea.srgb_para_lab(rgba[..., :3])[..., 0] < 35
    saida[beirada & escura] = 0
    return saida


def estragar(rgba: np.ndarray, como: str) -> np.ndarray:
    if como == "tudo":
        return borrar(saturar(degrade(sem_contorno(rgba))), 0.7)
    return {"borrar": borrar, "degrade": degrade, "saturar": saturar, "sem_contorno": sem_contorno}[como](rgba)


# --- nota contra o original --------------------------------------------------------------------------------


def nota_contra(original: np.ndarray, feita: np.ndarray) -> dict:
    """A nota de comparar_estilos.py sobre a união das duas silhuetas (pixel só de um lado: ΔE 10, diferente)."""
    mo, mf = original[..., 3] > 0, feita[..., 3] > 0
    uniao = mo | mf
    ambos = mo & mf
    g = original[..., :3][ambos]
    r = feita[..., :3][ambos]
    de = np.zeros(int(uniao.sum()))
    de[: len(g)] = np.minimum(np.linalg.norm(ea.srgb_para_lab(g) - ea.srgb_para_lab(r), axis=1), DE_MAXIMO) if len(g) else 0
    de[len(g) :] = DE_MAXIMO
    iguais = float((g == r).all(1).sum() / max(1, uniao.sum()))
    cores_o = ea.srgb_para_lab(np.unique(original[..., :3][mo], axis=0))
    cores_f, cont = np.unique(r, axis=0, return_counts=True)
    perto = np.array([np.linalg.norm(cores_o - c, axis=1).min() <= arte.JND for c in ea.srgb_para_lab(cores_f)]) if len(cores_f) else np.zeros(0, bool)
    paleta = float((cont * perto).sum() / max(1, uniao.sum()))
    po, pf = original[..., :3].max(-1) <= 4, feita[..., :3].max(-1) <= 4
    po &= mo
    pf &= mf
    tp = int((po & pf).sum())
    f1 = 2 * tp / max(1, 2 * tp + int((po & ~pf).sum()) + int((~po & pf).sum()))
    d = float(de.mean()) if len(de) else 0.0
    nota = 10 * (0.5 * max(0.0, 1 - d / DE_MAXIMO) + 0.3 * iguais + 0.2 * paleta)
    return {"nota": round(nota, 2), "dE": round(d, 2), "iguais": round(iguais, 3), "paleta": round(paleta, 3), "contorno_f1": round(f1, 3)}


# --- os objetos --------------------------------------------------------------------------------------------


def com_folga(rgba: np.ndarray, folga: int = 1) -> np.ndarray:
    """Uma moldura transparente em volta (o contorno por fora precisa de lugar)."""
    return np.pad(rgba, ((folga, folga), (folga, folga), (0, 0)))


def objetos(amostra: int) -> dict[str, list[tuple[str, np.ndarray, str]]]:
    """Por conjunto: (rótulo, RGBA, contorno a pedir). As janelas das folhas (tiles) vão sem contorno."""
    rng = np.random.default_rng(5)

    def sortear(lista):
        return [lista[i] for i in sorted(rng.choice(len(lista), min(amostra, len(lista)), replace=False))] if lista else []

    graal = es.unidades_graal(amostra, ea.ARTES_RECUPERADAS, "graal.{estilo}.{n}.png")["graal_aeko"]
    janelas = sortear([j for j in es.unidades_aeko() if 0.4 <= (j[..., 3] > 0).mean() <= 0.9])
    janelas_equipe = sortear(es.unidades_folhas_equipe())
    equipe = es.objetos_da_equipe(es.REFERENCIA_PADRAO)
    return {
        "graal_aeko": [(f"peça {i}", com_folga(o), "externo") for i, o in enumerate(graal)],
        "aeko_folhas": [(f"janela {i}", j, "nao") for i, j in enumerate(janelas)],
        "equipe": [(f"{c} {i}", com_folga(o), "nao" if c == "terreno" else "externo") for i, (c, o) in enumerate(equipe)],
        "equipe_folhas": [(f"janela {i}", j, "nao") for i, j in enumerate(janelas_equipe)],
    }


CONJUNTOS_DO_ESTILO = {
    "aeko": ("graal_aeko", "aeko_folhas"),
    "equipe": ("equipe", "equipe_folhas"),
    "aeko+equipe": ("graal_aeko", "aeko_folhas", "equipe", "equipe_folhas"),
}


# --- o par antes → depois da MADX ----------------------------------------------------------------------------


def alinhar(a: np.ndarray, b: np.ndarray, raio: int = 8) -> tuple[np.ndarray, np.ndarray]:
    """As duas imagens numa tela comum, com b deslocada para a maior sobreposição das silhuetas (IoU)."""
    h = max(a.shape[0], b.shape[0]) + 2 * raio
    w = max(a.shape[1], b.shape[1]) + 2 * raio
    ta = np.zeros((h, w, 4), np.uint8)
    ta[raio : raio + a.shape[0], raio : raio + a.shape[1]] = a
    ma = ta[..., 3] > 0
    melhor = (-1.0, None)
    for dy in range(0, h - b.shape[0] + 1):
        for dx in range(0, w - b.shape[1] + 1):
            tb = np.zeros((h, w, 4), np.uint8)
            tb[dy : dy + b.shape[0], dx : dx + b.shape[1]] = b
            mb = tb[..., 3] > 0
            iou = (ma & mb).sum() / max(1, (ma | mb).sum())
            if iou > melhor[0]:
                melhor = (iou, tb)
    return ta, melhor[1]


def par_madx(estilos: list[str], parametros: dict | None) -> dict:
    """Roda o antes da MADX em cada estilo e compara com o depois (a transformação que a equipe fez à mão)."""
    if not es.MADX.exists():
        return {}
    par = es.arvores_madx()
    saida: dict = {}
    for i, (antes, depois) in enumerate(zip(par["antes"], par["depois"])):
        nome = ("rosa", "verde")[i] if i < 2 else str(i)
        base_a, base_d = alinhar(depois, antes)
        registro = {"antes_contra_depois": nota_contra(base_a, base_d)}
        for estilo in estilos:
            a = arte.alvo(estilo, 0.5)
            feita, resumo = arte.estilizar_com_nota(com_folga(antes), a, "auto", None, "externo", "auto", None, parametros)
            ta, tf = alinhar(depois, feita)
            registro[estilo] = {"nota_estilo": resumo["nota"], "contra_depois": nota_contra(ta, tf),
                                "nota_estilo_depois": arte.nota_estilo(depois, a)[0]}
            FORA_DO_REPO.mkdir(parents=True, exist_ok=True)
            arte.previa([antes, depois, feita], 4, ["antes (MADX)", "depois (MADX)", f"ferramenta: {estilo}"]).save(
                FORA_DO_REPO / f"madx.{nome}.{estilo.replace('+', '_')}.png")
        saida[nome] = registro
    return saida


# --- imagens de fora ---------------------------------------------------------------------------------------


def _fonte(tamanho: int):
    for caminho in (r"C:\Windows\Fonts\arialbd.ttf", r"C:\Windows\Fonts\arial.ttf"):
        if os.path.exists(caminho):
            return ImageFont.truetype(caminho, tamanho)
    return ImageFont.load_default()


def desenhar_fora(pasta: Path) -> dict[str, Path]:
    """As quatro artes de outro estilo, desenhadas a 4× e reduzidas com LANCZOS (antisserrilhado de verdade)."""
    pasta.mkdir(parents=True, exist_ok=True)
    k = 4
    caminhos = {}

    # 1. árvore: copa redonda com degradê radial liso, tronco com degradê horizontal; fundo transparente
    w, h = 48 * k, 60 * k
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    tronco = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(tronco)
    for x in range(20 * k, 28 * k):
        t = (x - 20 * k) / (8 * k)
        cor = (int(150 - 70 * t), int(100 - 50 * t), int(60 - 30 * t), 255)
        d.line([(x, 34 * k), (x, 58 * k)], fill=cor)
    im.alpha_composite(tronco)
    ys, xs = np.mgrid[0:h, 0:w]
    cx, cy, r = 24 * k, 22 * k, 20 * k
    dist = np.hypot(xs - cx, ys - cy) / r
    luz = np.clip(1 - np.hypot(xs - (cx - 7 * k), ys - (cy - 8 * k)) / (1.6 * r), 0, 1)
    copa = np.zeros((h, w, 4), np.uint8)
    dentro = dist <= 1
    copa[..., 0] = np.clip(30 + 120 * luz, 0, 255)
    copa[..., 1] = np.clip(90 + 140 * luz, 0, 255)
    copa[..., 2] = np.clip(40 + 60 * luz, 0, 255)
    copa[..., 3] = np.where(dentro, 255, 0)
    im.alpha_composite(Image.fromarray(copa))
    caminhos["arvore_degrade"] = pasta / "arvore_degrade.png"
    im.resize((48, 60), Image.LANCZOS).save(caminhos["arvore_degrade"])

    # 2. baú: cores chapadas, sem contorno, fundo branco
    im = Image.new("RGB", (36, 32), (255, 255, 255))
    d = ImageDraw.Draw(im)
    d.rectangle([3, 12, 32, 29], fill=(176, 104, 48))  # corpo
    d.rectangle([3, 5, 32, 12], fill=(200, 128, 64))  # tampa
    d.rectangle([3, 12, 32, 13], fill=(130, 70, 30))  # junta
    d.rectangle([7, 5, 9, 29], fill=(230, 190, 60))  # faixas de metal
    d.rectangle([26, 5, 28, 29], fill=(230, 190, 60))
    d.rectangle([16, 11, 19, 16], fill=(250, 220, 90))  # fechadura
    d.rectangle([17, 13, 18, 14], fill=(90, 60, 20))
    d.rectangle([3, 26, 32, 29], fill=(140, 80, 36))  # base mais escura
    caminhos["bau_chapado"] = pasta / "bau_chapado.png"
    im.save(caminhos["bau_chapado"])

    # 3. botão de interface: degradê vertical, cantos redondos, sombra borrada, texto; fundo transparente
    w, h = 72 * k, 30 * k
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    sombra = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(sombra).rounded_rectangle([4 * k, 6 * k, 68 * k, 28 * k], radius=6 * k, fill=(0, 0, 0, 140))
    im.alpha_composite(sombra.filter(ImageFilter.GaussianBlur(2 * k)))
    corpo = np.zeros((h, w, 4), np.uint8)
    t = np.linspace(0, 1, h)[:, None]
    corpo[..., 0] = (70 + 40 * (1 - t)).astype(np.uint8)
    corpo[..., 1] = (120 + 70 * (1 - t)).astype(np.uint8)
    corpo[..., 2] = (200 + 50 * (1 - t)).astype(np.uint8)
    mascara = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mascara).rounded_rectangle([2 * k, 2 * k, 66 * k, 24 * k], radius=6 * k, fill=255)
    corpo[..., 3] = np.array(mascara)
    im.alpha_composite(Image.fromarray(corpo))
    ImageDraw.Draw(im).text((34 * k, 13 * k), "JOGAR", fill=(255, 255, 255, 255), font=_fonte(11 * k), anchor="mm")
    caminhos["botao_sombra"] = pasta / "botao_sombra.png"
    im.resize((72, 30), Image.LANCZOS).save(caminhos["botao_sombra"])

    # 4. poção: vidro com brilho, líquido magenta saturado, rolha; fundo cinza chapado; ampliada 2× no fim
    w, h = 24 * k, 32 * k
    im = Image.new("RGBA", (w, h), (128, 128, 128, 255))
    d = ImageDraw.Draw(im)
    d.ellipse([3 * k, 10 * k, 21 * k, 30 * k], fill=(200, 220, 235, 255))
    d.rectangle([9 * k, 4 * k, 15 * k, 12 * k], fill=(200, 220, 235, 255))
    liquido = np.zeros((h, w, 4), np.uint8)
    ys, xs = np.mgrid[0:h, 0:w]
    dentro = (np.hypot(xs - 12 * k, ys - 20 * k) <= 8 * k) & (ys >= 17 * k)
    tt = (ys - 17 * k) / (11 * k)
    liquido[..., 0] = np.clip(240 - 90 * tt, 0, 255)
    liquido[..., 1] = np.clip(40 - 20 * tt, 0, 255)
    liquido[..., 2] = np.clip(200 - 40 * tt, 0, 255)
    liquido[..., 3] = np.where(dentro, 255, 0)
    im.alpha_composite(Image.fromarray(liquido))
    d = ImageDraw.Draw(im)
    d.rectangle([9 * k, 1 * k, 15 * k, 5 * k], fill=(150, 100, 60, 255))
    d.ellipse([6 * k, 13 * k, 9 * k, 19 * k], fill=(255, 255, 255, 230))
    pequena = im.convert("RGB").resize((24, 32), Image.LANCZOS)
    caminhos["pocao_ampliada"] = pasta / "pocao_ampliada.png"
    pequena.resize((48, 64), Image.NEAREST).save(caminhos["pocao_ampliada"])
    return caminhos


# --- rodada ------------------------------------------------------------------------------------------------


def folha_de_linhas(linhas: list[list[np.ndarray]], rotulos: list[str], escala: int = 3) -> Image.Image:
    imagens = [arte.previa(l, escala) for l in linhas]
    largura = max(i.width for i in imagens) + 170
    folha = Image.new("RGBA", (largura, sum(i.height for i in imagens)), (255, 255, 255, 255))
    d = ImageDraw.Draw(folha)
    y = 0
    for im, rot in zip(imagens, rotulos):
        d.text((6, y + 20), rot, fill=(20, 20, 20, 255))
        folha.paste(im, (170, y))
        y += im.height
    return folha


def main() -> int:
    ap = argparse.ArgumentParser(description="Valida tools/estilo_aeko_arte.py.")
    ap.add_argument("--amostra", type=int, default=24, help="peças do Graal e janelas das folhas por rodada")
    ap.add_argument("--estilos", default=",".join(arte.ESTILOS))
    ap.add_argument("--sem-folhas", action="store_true")
    ap.add_argument("--parametros", help="JSON que sobrepõe PARAMETROS")
    ap.add_argument("--rotulo", default="")
    args = ap.parse_args()
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    parametros = json.loads(args.parametros) if args.parametros else None
    estilos = [e for e in args.estilos.split(",") if e]
    inicio = time.time()
    SAIDA.mkdir(parents=True, exist_ok=True)

    conjuntos = objetos(args.amostra)
    resultado: dict = {"rotulo": args.rotulo, "parametros": parametros or {}, "objetos": {}, "fora": {}}
    for estilo in estilos:
        a = arte.alvo(estilo, 0.5)
        for nome in CONJUNTOS_DO_ESTILO[estilo]:
            linhas_folha, rotulos_folha = [], []
            for rotulo, original, contorno in conjuntos[nome]:
                for como in ESTRAGOS:
                    if como == "sem_contorno" and contorno == "nao":
                        continue
                    estragado = estragar(original, como)
                    feita, resumo = arte.estilizar_com_nota(estragado, a, "auto", None, contorno, "auto", None, parametros)
                    registro = {
                        "estilo_estragado": arte.nota_estilo(estragado, a, contorno != "nao")[0],
                        "estilo_devolvida": resumo["nota"],
                        "tentativas": len(resumo["tentativas"]),
                        "contra_original_estragado": nota_contra(original, estragado)["nota"],
                        "contra_original_devolvida": nota_contra(original, feita),
                    }
                    resultado["objetos"].setdefault(estilo, {}).setdefault(nome, {}).setdefault(como, []).append(registro)
                    if not args.sem_folhas and len(linhas_folha) < 60:
                        linhas_folha.append([original, estragado, feita])
                        rotulos_folha.append(f"{rotulo} · {como}\nestilo {registro['estilo_estragado']:.1f} → {resumo['nota']:.1f}")
            if linhas_folha:
                FORA_DO_REPO.mkdir(parents=True, exist_ok=True)
                folha_de_linhas(linhas_folha, rotulos_folha).save(FORA_DO_REPO / f"{estilo.replace('+', '_')}.{nome}.png")
            print(f"{estilo} · {nome}: {time.time() - inicio:.0f} s", file=sys.stderr)

    resultado["madx"] = par_madx(estilos, parametros)
    print(f"madx: {time.time() - inicio:.0f} s", file=sys.stderr)

    pasta_fora = SAIDA / "fora"
    for nome, caminho in desenhar_fora(pasta_fora).items():
        for estilo in estilos:
            saida = pasta_fora / f"{nome}.{estilo.replace('+', '_')}.png"
            resumo = arte.aplicar(caminho, saida, estilo, 0.5, com_previa=not args.sem_folhas, parametros=parametros)
            antes = arte.ler_rgba(caminho)
            antes = arte.tirar_fundo(arte.reduzir(antes, arte.detectar_escala(antes)), "auto")[0]
            resultado["fora"].setdefault(nome, {})[estilo] = {
                "nota_antes": arte.nota_estilo(antes, arte.alvo(estilo, 0.5))[0], "nota": resumo["nota"],
                "tentativas": len(resumo["tentativas"]), "partes": resumo["partes"], "cores": [resumo["cores_antes"], resumo["cores_depois"]],
            }

    # resumo
    linhas = [f"# Validação de estilo_aeko_arte.py{(' — ' + args.rotulo) if args.rotulo else ''}", "",
              "Gerado por `tools/validar_estilo_arte.py`. Nota de estilo: `nota_estilo` contra o alvo (0–10). Contra o original: a nota de "
              "comparar_estilos.py sobre a união das silhuetas.", "",
              "## (a) Objetos estragados", "",
              "| estilo | conjunto | estrago | objetos | estilo: estragado → devolvido | ≥ 8 | contra o original: estragado → devolvido | ΔE devolvido | contorno F1 |",
              "|---|---|---|---|---|---|---|---|---|"]
    medias = {}
    for estilo, por_conjunto in resultado["objetos"].items():
        todas = []
        for nome, por_estrago in por_conjunto.items():
            for como, regs in por_estrago.items():
                e0 = np.mean([r["estilo_estragado"] for r in regs])
                e1 = np.mean([r["estilo_devolvida"] for r in regs])
                passa = np.mean([r["estilo_devolvida"] >= 8 for r in regs])
                c0 = np.mean([r["contra_original_estragado"] for r in regs])
                c1 = np.mean([r["contra_original_devolvida"]["nota"] for r in regs])
                de = np.mean([r["contra_original_devolvida"]["dE"] for r in regs])
                f1 = np.mean([r["contra_original_devolvida"]["contorno_f1"] for r in regs])
                todas.extend(r["estilo_devolvida"] for r in regs)
                linhas.append(f"| {estilo} | {nome} | {como} | {len(regs)} | {e0:.2f} → **{e1:.2f}** | {100 * passa:.0f} % | {c0:.2f} → {c1:.2f} | {de:.2f} | {f1:.2f} |")
        medias[estilo] = {"media": float(np.mean(todas)), "minima": float(np.min(todas)), "passa": float(np.mean([n >= 8 for n in todas]))}
    linhas += ["", "| estilo | nota de estilo média (devolvidas) | menor | ≥ 8 |", "|---|---|---|---|"]
    for estilo, m in medias.items():
        linhas.append(f"| {estilo} | {m['media']:.2f} | {m['minima']:.2f} | {100 * m['passa']:.0f} % |")
    linhas += ["", "## (b) Imagens de fora", "", "| imagem | estilo | nota antes | nota depois | tentativas | cores antes → depois |", "|---|---|---|---|---|---|"]
    for nome, por_estilo in resultado["fora"].items():
        for estilo, r in por_estilo.items():
            linhas.append(f"| {nome} | {estilo} | {r['nota_antes']:.2f} | **{r['nota']:.2f}** | {r['tentativas']} | {r['cores'][0]} → {r['cores'][1]} |")
    if resultado["madx"]:
        linhas += ["", "## (c) O par antes → depois da MADX", "",
                   "O antes passa pela ferramenta e é comparado com o depois que a equipe desenhou (silhuetas alinhadas pela maior "
                   "sobreposição). Nota contra o depois: a mesma de (a).", "",
                   "| árvore | antes contra o depois | estilo | nota de estilo da devolvida | nota de estilo do depois | devolvida contra o depois | ΔE | paleta |",
                   "|---|---|---|---|---|---|---|---|"]
        for nome, r in resultado["madx"].items():
            for estilo in estilos:
                e = r[estilo]
                linhas.append(f"| {nome} | {r['antes_contra_depois']['nota']:.2f} | {estilo} | {e['nota_estilo']:.2f} | {e['nota_estilo_depois']:.2f} | "
                              f"**{e['contra_depois']['nota']:.2f}** | {e['contra_depois']['dE']:.2f} | {e['contra_depois']['paleta']:.2f} |")
    resultado["medias"] = medias
    resultado["segundos"] = round(time.time() - inicio, 1)
    (SAIDA / "validacao.json").write_text(json.dumps(resultado, ensure_ascii=False, indent=1, default=float), encoding="utf8")
    (SAIDA / "validacao.md").write_text("\n".join(linhas) + "\n", encoding="utf8")
    print("\n".join(linhas))
    print(f"({resultado['segundos']} s)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
