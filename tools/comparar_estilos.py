"""Nota e comparação: quão perto a recolorização de tools/estilo_aeko.py chega do gabarito (reconstrução de 2026-10-20).

Para cada peça (cabeça ou corpo, de cada contribuidor) compara três versões da camada f: a original (a entrada),
o estilo Aeko que sobreviveu nas folhas recuperadas (o gabarito, resultado da ferramenta perdida) e o estilo
Aeko refeito por estilo_aeko.py. Grava em estudo/comparacao/:

- `folhas/<autor>[.<página>].png`: uma linha por peça (original | Aeko gabarito | Aeko refeito), as 4 direções
  paradas, ampliadas 4×, com o id e a nota. Com `--peca <id>` grava `folhas/peca.<id>.png` com o bloco inteiro.
- `notas.json`: por peça, as medidas e a nota; `nota_manual` e `comentario` ficam vazios para o usuário
  preencher, e são preservados quando o script roda de novo.
- `notas.md`: a tabela por autor e peça, e o ranking "Aeko + equipe" (a média por contribuidor).

As medidas, sobre os pixels opacos da peça (o alfa é igual nos dois estilos):
- `iguais`: fração dos pixels com exatamente a mesma cor do gabarito;
- `dE`: a distância média de cor em CIELAB (ΔE76) ao gabarito;
- `paleta`: fração dos pixels refeitos cuja cor fica a menos de um JND (ΔE 2,3) de alguma cor do gabarito da
  mesma peça (aderência à paleta do Aeko, sem cobrar a posição);
- `preto`: F1 do contorno preto (os pixels que viram preto no gabarito contra os que viram preto aqui).

A nota, de 0 a 10: `10 × (0,5 × max(0, 1 − dE/10) + 0,3 × iguais + 0,2 × paleta)`; o gabarito contra si mesmo
tira 10. (Pesos escolhidos aqui, em 2026-10-20: o que a ferramenta perdida media é palpite.)

Uso:
    python -I tools/comparar_estilos.py                 todas as peças
    python -I tools/comparar_estilos.py --autor zar     só um autor
    python -I tools/comparar_estilos.py --peca jen34    uma peça, com a folha do bloco inteiro
    python -I tools/comparar_estilos.py --sem-folhas    só as notas (mais rápido)
Opções: --artes <pasta>, --padrao <nome>, --saida <pasta> (estudo/comparacao), --parametros <json> (sobrepõe
PARAMETROS de estilo_aeko.py, para experimentar).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import estilo_aeko as ea  # noqa: E402

SAIDA_PADRAO = ea.RAIZ / "estudo" / "comparacao"
ESCALA = 4
LINHAS_POR_PAGINA = 24
PESOS_DA_NOTA = {"dE": 0.5, "iguais": 0.3, "paleta": 0.2}
DE_MAXIMO = 10.0
JND = 2.3  # a menor diferença de cor que se nota (ΔE76)


def medir(gabarito: np.ndarray, refeito: np.ndarray) -> dict:
    """As medidas de uma peça refeita contra o gabarito (as duas RGBA com o mesmo alfa)."""
    m = gabarito[..., 3] > 0
    g = gabarito[m][:, :3]
    r = refeito[m][:, :3]
    iguais = float((g == r).all(1).mean()) if len(g) else 1.0
    de = float(np.linalg.norm(ea.srgb_para_lab(g) - ea.srgb_para_lab(r), axis=1).mean()) if len(g) else 0.0
    # aderência à paleta: a cor do pixel refeito está a menos de um JND (ΔE 2,3) de alguma cor do gabarito
    cores_g = ea.srgb_para_lab(np.unique(g, axis=0))
    cores_r, inversa, contagem = np.unique(r, axis=0, return_inverse=True, return_counts=True)
    lab_r = ea.srgb_para_lab(cores_r)
    perto = np.zeros(len(cores_r), bool)
    for inicio in range(0, len(cores_r), 256):
        d = np.linalg.norm(lab_r[inicio : inicio + 256, None, :] - cores_g[None, :, :], axis=2)
        perto[inicio : inicio + 256] = d.min(1) <= JND
    paleta = float((contagem * perto).sum() / contagem.sum()) if len(r) else 1.0
    pg = g.max(1) <= 4
    pr = r.max(1) <= 4
    tp = int((pg & pr).sum())
    f1 = 2 * tp / max(1, 2 * tp + int((pg & ~pr).sum()) + int((~pg & pr).sum()))
    return {"iguais": round(iguais, 4), "dE": round(de, 3), "paleta": round(paleta, 4), "preto": round(f1, 4)}


def nota_de(medidas: dict) -> float:
    n = PESOS_DA_NOTA["dE"] * max(0.0, 1 - medidas["dE"] / DE_MAXIMO)
    n += PESOS_DA_NOTA["iguais"] * medidas["iguais"] + PESOS_DA_NOTA["paleta"] * medidas["paleta"]
    return round(10 * n, 2)


FONTES = [Path(r"C:\Windows\Fonts\segoeui.ttf"), Path(r"C:\Windows\Fonts\arial.ttf"), Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")]


def _fonte(tamanho: int):
    """Uma fonte com acentos e símbolos (a padrão do Pillow não tem ç nem Δ)."""
    for caminho in FONTES:
        if caminho.exists():
            return ImageFont.truetype(str(caminho), tamanho)
    try:
        return ImageFont.load_default(size=tamanho)
    except TypeError:  # Pillow antigo
        return ImageFont.load_default()


def _ampliar(bloco: np.ndarray, celulas: list[int]) -> Image.Image:
    """As células pedidas, lado a lado, sobre fundo quadriculado, ampliadas."""
    partes = [bloco[c * ea.CELULA : (c + 1) * ea.CELULA] for c in celulas]
    im = Image.fromarray(np.concatenate(partes, 1))
    fundo = Image.new("RGBA", im.size, (230, 230, 230, 255))
    xadrez = np.array(fundo)
    ys, xs = np.mgrid[0 : im.height, 0 : im.width]
    xadrez[((ys // 8) + (xs // 8)) % 2 == 1, :3] = 245
    fundo = Image.fromarray(xadrez)
    fundo.alpha_composite(im)
    return fundo.resize((im.width * ESCALA, im.height * ESCALA), Image.NEAREST)


def linha_da_peca(peca: ea.Peca, original, gabarito, refeito, rotulo: str, celulas: list[int]) -> Image.Image:
    paineis = [_ampliar(b, celulas) for b in (original, gabarito, refeito)]
    largura_rotulo = 176
    folga = 8
    largura = largura_rotulo + sum(p.width for p in paineis) + folga * 3
    altura = max(p.height for p in paineis) + folga
    im = Image.new("RGB", (largura, altura), (255, 255, 255))
    desenho = ImageDraw.Draw(im)
    fonte = _fonte(13)
    y = folga // 2
    for i, texto in enumerate(rotulo.split("\n")):
        desenho.text((6, y + 4 + i * 16), texto, fill=(20, 20, 20), font=fonte)
    x = largura_rotulo
    for painel in paineis:
        im.paste(painel.convert("RGB"), (x, y))
        x += painel.width + folga
    return im


def cabecalho(largura: int) -> Image.Image:
    im = Image.new("RGB", (largura, 22), (240, 240, 240))
    d = ImageDraw.Draw(im)
    fonte = _fonte(13)
    d.text((6, 4), "peça / nota", fill=(0, 0, 0), font=fonte)
    x = 176
    for titulo in ("original", "Aeko (gabarito)", "Aeko refeito (estilo_aeko.py)"):
        d.text((x + 4, 4), titulo, fill=(0, 0, 0), font=fonte)
        x += 4 * ea.CELULA * ESCALA + 8
    return im


def empilhar(imagens: list[Image.Image]) -> Image.Image:
    largura = max(i.width for i in imagens)
    altura = sum(i.height for i in imagens)
    saida = Image.new("RGB", (largura, altura), (255, 255, 255))
    y = 0
    for im in imagens:
        saida.paste(im, (0, y))
        y += im.height
    return saida


def escrever_markdown(registros: list[dict], caminho: Path) -> None:
    por_autor: dict[str, list[dict]] = defaultdict(list)
    for r in registros:
        por_autor[r["autor"]].append(r)
    ranking = sorted(
        ((a, float(np.mean([r["nota"] for r in rs])), len(rs)) for a, rs in por_autor.items()), key=lambda t: -t[1]
    )
    media = float(np.mean([r["nota"] for r in registros]))
    linhas = [
        "# Notas da recolorização (estilo original → estilo Aeko)",
        "",
        f"Peças: {len(registros)} ({sum(r['tipo'] == 'cabeca' for r in registros)} cabeças, "
        f"{sum(r['tipo'] == 'corpo' for r in registros)} corpos). Nota média: **{media:.2f}**. "
        f"ΔE médio: {np.mean([r['dE'] for r in registros]):.2f}; pixels iguais: "
        f"{100 * np.mean([r['iguais'] for r in registros]):.1f} %; na paleta do gabarito: "
        f"{100 * np.mean([r['paleta'] for r in registros]):.1f} %; F1 do contorno: "
        f"{np.mean([r['preto'] for r in registros]):.3f}.",
        "",
        "Nota = 10 × (0,5 × max(0, 1 − ΔE/10) + 0,3 × iguais + 0,2 × paleta). `nota_manual` e `comentario` são do",
        "usuário, em notas.json. Gerado por tools/comparar_estilos.py.",
        "",
        "## Aeko + equipe: ranking por contribuidor (média das notas das peças)",
        "",
        "| # | autor | peças | nota média | ΔE médio | iguais | nota manual (média) |",
        "|---|---|---|---|---|---|---|",
    ]
    for i, (autor, nota, n) in enumerate(ranking, 1):
        rs = por_autor[autor]
        manuais = [float(r["nota_manual"]) for r in rs if str(r.get("nota_manual", "")).strip() != ""]
        manual = f"{np.mean(manuais):.1f}" if manuais else ""
        linhas.append(
            f"| {i} | {autor} | {n} | {nota:.2f} | {np.mean([r['dE'] for r in rs]):.2f} | "
            f"{100 * np.mean([r['iguais'] for r in rs]):.0f} % | {manual} |"
        )
    linhas += ["", "## Por peça", ""]
    for autor, _nota, _n in ranking:
        linhas += [f"### {autor}", "", "| peça | tipo | nota | ΔE | iguais | paleta | contorno | nota manual | comentário |", "|---|---|---|---|---|---|---|---|---|"]
        for r in sorted(por_autor[autor], key=lambda r: (r["tipo"], r["id"])):
            linhas.append(
                f"| {r['id']} | {r['tipo']} | {r['nota']:.2f} | {r['dE']:.2f} | {100 * r['iguais']:.0f} % | "
                f"{100 * r['paleta']:.0f} % | {r['preto']:.2f} | {r.get('nota_manual', '')} | {r.get('comentario', '')} |"
            )
        linhas.append("")
    caminho.write_text("\n".join(linhas), encoding="utf8")


def main() -> int:
    ap = argparse.ArgumentParser(description="Compara a recolorização com o gabarito e dá nota.")
    ap.add_argument("--autor")
    ap.add_argument("--peca")
    ap.add_argument("--sem-folhas", action="store_true")
    ap.add_argument("--artes", type=Path, default=ea.ARTES_RECUPERADAS)
    ap.add_argument("--padrao", default="graal.{estilo}.{n}.png")
    ap.add_argument("--saida", type=Path, default=SAIDA_PADRAO)
    ap.add_argument("--parametros", help="JSON que sobrepõe PARAMETROS de estilo_aeko.py")
    args = ap.parse_args()
    parametros = json.loads(args.parametros) if args.parametros else None

    pecas = ea.ler_pecas()
    if args.peca:
        pecas = [p for p in pecas if p.id == args.peca]
    if args.autor:
        pecas = [p for p in pecas if p.autor == args.autor]
    if not pecas:
        ap.error("nenhuma peça escolhida")
    folhas = ea.Folhas(args.artes, args.padrao)
    saida = args.saida
    (saida / "folhas").mkdir(parents=True, exist_ok=True)

    antigas: dict[str, dict] = {}
    caminho_json = saida / "notas.json"
    if caminho_json.exists():
        try:
            antigas = {r["id"]: r for r in json.loads(caminho_json.read_text(encoding="utf8"))["pecas"]}
        except (ValueError, KeyError):
            antigas = {}

    registros = []
    por_autor: dict[str, list[Image.Image]] = defaultdict(list)
    for i, peca in enumerate(pecas):
        original = ea.montar(peca, folhas, "original")
        gabarito = ea.montar(peca, folhas, "aeko").f
        refeito = ea.recolorir(original, parametros)
        medidas = medir(gabarito, refeito)
        nota = nota_de(medidas)
        antiga = antigas.get(peca.id, {})
        registros.append(
            {
                "id": peca.id,
                "autor": peca.autor,
                "tipo": peca.tipo,
                **medidas,
                "nota": nota,
                "nota_manual": antiga.get("nota_manual", ""),
                "comentario": antiga.get("comentario", ""),
            }
        )
        if not args.sem_folhas:
            rotulo = f"{peca.id}\n{peca.autor} · {peca.tipo}\nnota {nota:.1f}\nΔE {medidas['dE']:.2f} · iguais {100 * medidas['iguais']:.0f} %"
            if args.peca:
                n = original.f.shape[0] // ea.CELULA
                paginas = [list(range(j, min(j + 4, n))) for j in range(0, n, 4)]
                linhas = [cabecalho(176 + 3 * (4 * ea.CELULA * ESCALA + 8))]
                for celulas in paginas:
                    linhas.append(linha_da_peca(peca, original.f, gabarito, refeito, rotulo if celulas[0] == 0 else "", celulas))
                empilhar(linhas).save(saida / "folhas" / f"peca.{peca.id}.png")
            else:
                por_autor[peca.autor].append(linha_da_peca(peca, original.f, gabarito, refeito, rotulo, [0, 1, 2, 3]))
        if (i + 1) % 50 == 0:
            print(f"{i + 1}/{len(pecas)}", file=sys.stderr)

    if not args.sem_folhas and not args.peca:
        for autor, linhas in por_autor.items():
            paginas = [linhas[j : j + LINHAS_POR_PAGINA] for j in range(0, len(linhas), LINHAS_POR_PAGINA)]
            for k, pagina in enumerate(paginas):
                nome = f"{autor}.png" if len(paginas) == 1 else f"{autor}.{k + 1}.png"
                empilhar([cabecalho(pagina[0].width)] + pagina).save(saida / "folhas" / nome)

    if not args.peca and not args.autor:
        # a rodada inteira substitui o conjunto; uma parcial só atualiza o que rodou
        todos = registros
    else:
        novos = {r["id"]: r for r in registros}
        todos = [novos.get(r["id"], r) for r in antigas.values()] + [r for r in registros if r["id"] not in antigas]
    resumo = {
        "nota_media": round(float(np.mean([r["nota"] for r in todos])), 3),
        "dE_medio": round(float(np.mean([r["dE"] for r in todos])), 3),
        "iguais_medio": round(float(np.mean([r["iguais"] for r in todos])), 4),
        "paleta_medio": round(float(np.mean([r["paleta"] for r in todos])), 4),
        "preto_f1_medio": round(float(np.mean([r["preto"] for r in todos])), 4),
        "pecas": len(todos),
    }
    caminho_json.write_text(
        json.dumps({"nota": "10 × (0,5·max(0, 1 − dE/10) + 0,3·iguais + 0,2·paleta)", "resumo": resumo, "pecas": todos}, ensure_ascii=False, indent=1),
        encoding="utf8",
    )
    escrever_markdown(todos, saida / "notas.md")
    print(json.dumps(resumo, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
