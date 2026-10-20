"""Etapa G do Diorama: recortar as peças das folhas do Aeko do fundo e preparar as máscaras para recolorir.

As peças das folhas vêm presas ao que estava atrás delas (o sofá traz o piso). Para cada peça do catálogo
(diorama/catalogo/pecas.json: móveis, camas, baús, o fogão, luzes, janelas, o quadro, a tocha e o abajur; os
tapetes são piso e ficam de fora) e de diorama/recortes/extras.json, este script:

1. tira a peça do fundo pixel a pixel (tools/recortes_lib/recorte.py) e grava o recorte RGBA com 1 pixel de
   folga em volta (como a folha acoes.carregaveis): diorama/recortes/<folha>/<id>.png;
2. separa as partes pintáveis pela cor (rampas, tools/recortes_lib/partes.py) e grava, como as peças do
   Graal, a peça base e uma máscara em cinza por parte: diorama/recortes/<folha>/<id>/base.png e parte_<n>.png;
3. grava o resumo em diorama/recortes/recortes.json (área, método, confiança, pixels incertos, partes), a
   prévia de conferência em estudo/recortes/<id>.png e o campo `recorte` de cada peça em pecas.json (só
   acrescenta esse campo; os outros ficam como estão, e `npm run diorama:jogo -- --decorar` sai igual);
4. confere o método contra o gabarito feito à mão (assets/acoes/carregaveis.png).

Uso (na raiz do repositório):
    python -I tools/recortes.py                 tudo
    python -I tools/recortes.py chair casa42    só essas peças (não mexe em pecas.json nem no resto do json)
    python -I tools/recortes.py --validar       só a conferência com o gabarito
    python -I tools/recortes.py --evolucao      a tabela de evolução do método contra o gabarito
    python -I tools/recortes.py --sintetico     a validação sintética (peças coladas em fundos conhecidos)
    python -I tools/recortes.py --montar        a proposta da folha montada (estudo/recortes/montada/, não enviada)
Opções: --sem-catalogo (não grava pecas.json), --sem-previas.

docs/diorama/RECORTES.md explica o método, os números e como o jogo e o plugin vão usar.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import asdict, replace

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recortes_lib import folhas as F  # noqa: E402
from recortes_lib import partes as P  # noqa: E402
from recortes_lib import previa as PV  # noqa: E402
from recortes_lib import recorte as R  # noqa: E402
from recortes_lib import validar as V  # noqa: E402

SAIDA = F.RAIZ / "diorama" / "recortes"
PREVIAS = F.RAIZ / "estudo" / "recortes"
EXTRAS = SAIDA / "extras.json"
#: Tipos do catálogo que são piso (não se recortam).
PISOS = {"tapete", "piso", "fundo"}

#: Os passos do método, na ordem em que foram acrescentados (a tabela de RECORTES.md). Até o 8 o método só
#: olhava o gabarito; o 9 veio de conferir a olho as outras peças (as cadeiras e a janela 2 sumiam).
_SEM = dict(prior=False, limiar_contorno=1, ligado_a_borda=False, paleta_casada=False, sombra=False)
EVOLUCAO = [
    R.Metodo("1. tile de fundo alinhado à grade, um para a peça inteira", deslocamento_livre=False, por_celula=False,
             uniao_global=False, inundar=False, limpeza=False, contorno="nenhum", folga=False, **_SEM),
    R.Metodo("2. textura de fundo com deslocamento em pixels", por_celula=False, uniao_global=False, inundar=False,
             limpeza=False, contorno="nenhum", folga=False, **_SEM),
    R.Metodo("3. + escolha por célula", inundar=False, limpeza=False, contorno="nenhum", folga=False, **_SEM),
    R.Metodo("4. + inundar pelas cores da textura (tolerância 12)", tolerancia=12, limpeza=False, contorno="nenhum",
             folga=False, **_SEM),
    R.Metodo("5. + limpeza (ciscos e furos)", tolerancia=12, contorno="nenhum", folga=False, **_SEM),
    R.Metodo("6. + folga com contorno onde a peça encosta na borda", tolerancia=12, contorno="nenhum", **_SEM),
    R.Metodo("7. + contorno por fora (o escuro do piso colado na peça vira preto)", tolerancia=12, **_SEM),
    R.Metodo("8. tolerância 20 (a sombra 3c1e18 do piso escuro)", tolerancia=20, **_SEM),
    R.Metodo("9. fundo ligado à borda, quase preto é contorno, inunda só pelas cores que casaram (tolerância 8), "
             "sem móveis vazios atrás, cadeira só no piso", sombra=False),
    R.Metodo("10. + sombra do piso colada no fundo (final)"),
]


def rel(caminho) -> str:
    return os.path.relpath(caminho, F.RAIZ).replace(os.sep, "/")


def pecas_a_recortar(catalogo: dict) -> list[dict]:
    lista = [dict(p, origem="pecas.json") for p in catalogo["pecas"] if p.get("tipo") not in PISOS]
    if EXTRAS.exists():
        extras = json.loads(EXTRAS.read_text(encoding="utf-8"))
        lista += [dict(p, origem="extras.json") for p in extras["pecas"]]
    return lista


def chave_area(p: dict):
    return (p["folha"], tuple(p["area"]), tuple(tuple(c) for c in p.get("excluir", [])))


#: Os fundos da validação sintética, por folha: um piso claro, um piso de outro desenho e uma parede.
SINTETICOS = {"casa": ["tabua", "xadrez_claro", "papel_azul"], "castelo": ["laje_escura", "marmore_losango", "face_pedra"]}


def sintetico(catalogo: dict, metodo: R.Metodo = R.METODO) -> dict:
    """Validação sem gabarito: cola cada peça recortada sobre fundos conhecidos (SINTETICOS, num deslocamento
    sorteado), recorta de novo e compara a silhueta com a da peça colada. Mede se o método separa a peça de
    um fundo que ele conhece; não mede se o primeiro recorte estava certo."""
    rng = np.random.default_rng(20261020)
    unicas = {}
    for p in pecas_a_recortar(catalogo):
        unicas.setdefault(chave_area(p), p)
    linhas = []
    for p in unicas.values():
        f = F.folha(p["folha"])
        texs = F.texturas(p["folha"])
        excluir = {tuple(c) for c in p.get("excluir", [])}
        classes = classes_de(p, metodo)
        r = R.recortar(f, p["area"], texs, metodo, excluir, classes)
        alvo = r.peca[1:-1, 1:-1]
        cor = F.chave(r.rgba[1:-1, 1:-1, :3])
        c, l, w, h = p["area"]
        H, W = alvo.shape
        for nome in SINTETICOS[p["folha"]]:
            tex = next(t for t in texs if t.id == nome)
            if tex.classe not in classes:
                continue
            ph, pw = tex.k.shape
            dy, dx = int(rng.integers(ph)), int(rng.integers(pw))
            ys = (np.arange(H) + dy) % ph
            xs = (np.arange(W) + dx) % pw
            fundo = tex.k[np.ix_(ys, xs)]
            colado = np.where(alvo, cor, fundo)
            k2 = f.k.copy()
            k2[l * 16 : l * 16 + H, c * 16 : c * 16 + W] = colado
            f2 = F.Folha(f.nome, F.rgb_de(k2), k2)
            r2 = R.recortar(f2, p["area"], texs, metodo, excluir, classes)
            novo = r2.peca[1:-1, 1:-1]
            linhas.append({
                "id": p["id"],
                "fundo": nome,
                "iguais": round(float((novo == alvo).mean()), 4),
                "iou": round(float((novo & alvo).sum() / max(1, (novo | alvo).sum())), 4),
            })
    iguais = [x["iguais"] for x in linhas]
    return {
        "casos": len(linhas),
        "iguais_media": round(float(np.mean(iguais)), 4),
        "iguais_min": round(float(np.min(iguais)), 4),
        "abaixo_de_99": [x for x in linhas if x["iguais"] < 0.99],
    }


def validar(metodo: R.Metodo, catalogo: dict) -> dict:
    por_id = {p["id"]: p for p in catalogo["pecas"]}
    gab = V.gabarito()
    linhas = {}
    iguais = total = 0
    for id_, g in gab.items():
        p = por_id[id_]
        r = R.recortar(F.folha(p["folha"]), p["area"], F.texturas(p["folha"]), metodo, None, classes_de(p, metodo))
        c = V.comparar(r.rgba, g)
        linhas[id_] = c
        iguais += c["iguais"]
        total += c["pixels"]
    return {"pecas": linhas, "iguais": iguais, "pixels": total, "taxa": round(iguais / total, 4)}


def evolucao(catalogo: dict) -> list[dict]:
    """Cada passo contra o gabarito e, nas outras peças (uma por área), a IoU da silhueta contra o recorte final,
    que foi conferido a olho nas prévias: mostra o que o gabarito sozinho não pega (as peças que somem)."""
    unicas = {}
    for p in pecas_a_recortar(catalogo):
        unicas.setdefault(chave_area(p), p)

    def silhuetas(m):
        out = {}
        for k, p in unicas.items():
            excluir = {tuple(c) for c in p.get("excluir", [])}
            r = R.recortar(F.folha(p["folha"]), p["area"], F.texturas(p["folha"]), m, excluir, classes_de(p, m))
            out[k] = r.peca[1:-1, 1:-1]
        return out

    final = silhuetas(R.METODO)
    saida = []
    for m in EVOLUCAO:
        v = validar(m, catalogo)
        s = silhuetas(m)
        ious = [float((s[k] & final[k]).sum() / max(1, (s[k] | final[k]).sum())) for k in unicas]
        saida.append({
            "passo": m.nome,
            "taxa": v["taxa"],
            **{k: c["taxa"] for k, c in v["pecas"].items()},
            "iou_final_media": round(float(np.mean(ious)), 3),
            "pecas_longe_do_final": sum(1 for x in ious if x < 0.9),
        })
    return saida


def gravar_png(arr: np.ndarray, caminho) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(arr, "RGBA").save(caminho, optimize=True)


def nome_arquivo(id_: str) -> str:
    # os ids do catálogo têm @ e vírgula (casa@56,25): valem no Windows e no git, mas o @ fica de fora por clareza
    return id_.replace("@", "_").replace(",", "_")


def classes_atras(p: dict) -> frozenset[str]:
    """Que fundos podem estar atrás da peça (palpite): as cadeiras (zona `senta`) ficam no chão, longe da parede
    (sem isso, o encosto da cadeira de lado casava com as tábuas da parede); o resto pode ter piso e parede.
    `fundos_atras` na peça (extras.json) manda."""
    if "fundos_atras" in p:
        return frozenset(p["fundos_atras"])
    c, l = p["area"][:2]
    return frozenset({"piso"}) if F.zona_do_tile(p["folha"], c, l) == "senta" else frozenset({"piso", "parede"})


def classes_de(p: dict, metodo: R.Metodo) -> frozenset[str]:
    return classes_atras(p) if metodo.prior else frozenset({"piso", "parede", "movel"})


def processar(p: dict, metodo: R.Metodo, previas: bool) -> dict:
    f = F.folha(p["folha"])
    excluir = {tuple(c) for c in p.get("excluir", [])}
    classes = classes_de(p, metodo)
    r = R.recortar(f, p["area"], F.texturas(p["folha"]), metodo, excluir, classes)
    partes = P.separar(r.rgba)

    nome = nome_arquivo(p["id"])
    pasta = SAIDA / p["folha"]
    arq = pasta / f"{nome}.png"
    gravar_png(r.rgba, arq)
    sub = pasta / nome
    sub.mkdir(parents=True, exist_ok=True)
    for velho in sub.glob("parte_*.png"):
        velho.unlink()
    gravar_png(r.rgba, sub / "base.png")
    partes_json = []
    for parte in partes:
        arquivo = None
        if parte.mascara is not None:
            caminho = sub / f"parte_{parte.n}.png"
            gravar_png(parte.mascara, caminho)
            arquivo = rel(caminho)
        partes_json.append(parte.json(arquivo))

    if previas:
        x0, y0 = r.origem_px
        h, w = r.rgba.shape[:2]
        orig = np.zeros((h, w, 3), dtype=np.uint8)
        ys = slice(max(y0, 0), min(y0 + h, f.rgb.shape[0]))
        xs = slice(max(x0, 0), min(x0 + w, f.rgb.shape[1]))
        orig[ys.start - y0 : ys.stop - y0, xs.start - x0 : xs.stop - x0] = f.rgb[ys, xs]
        titulo = f"{p['id']} ({p.get('nome', '')}) {p['folha']} {p['area']}  confiança {r.confianca:.3f}"
        img = PV.montar(orig, r.rgba, r.incertos, partes, titulo)
        PREVIAS.mkdir(parents=True, exist_ok=True)
        img.save(PREVIAS / f"{nome}.png", optimize=True)

    sem_fundo = sum(1 for linha in r.celulas for c in linha if c is None) - len(excluir)
    # borda aberta: pixels da borda da área que ficaram na peça sem ser contorno. Alta numa peça que não enche a
    # área, é sinal de fundo que não foi reconhecido (o piso entre os pés da cadeira, que não está em fundos.json)
    dentro = r.rgba[1:-1, 1:-1]
    anel = np.zeros(dentro.shape[:2], dtype=bool)
    anel[0, :] = anel[-1, :] = anel[:, 0] = anel[:, -1] = True
    for ec, el in excluir:
        c0, l0 = p["area"][:2]
        anel[(el - l0) * 16 : (el - l0 + 1) * 16, (ec - c0) * 16 : (ec - c0 + 1) * 16] = False
    aberta = anel & (dentro[..., 3] > 0) & ~R.contorno_de(F.chave(dentro[..., :3]), metodo.limiar_contorno)
    borda_aberta = round(float(aberta.sum() / max(1, anel.sum())), 3)
    incertos = [[int(x), int(y)] for y, x in zip(*np.nonzero(r.incertos))]
    return {
        "folha": p["folha"],
        "area": p["area"],
        **({"excluir": p["excluir"]} if p.get("excluir") else {}),
        "origem": p["origem"],
        "arquivo": rel(arq),
        "base": rel(sub / "base.png"),
        "folga": 1,
        "tamanho": [int(r.rgba.shape[1]), int(r.rgba.shape[0])],
        "metodo": r.metodo,
        "fundos_atras": sorted(classes),
        "fundo": r.geral.json() if r.geral else None,
        "celulas_sem_fundo": sem_fundo,
        "borda_aberta": borda_aberta,
        "pixels_peca": int(r.peca.sum()),
        "confianca": r.confianca,
        "incertos": len(incertos),
        "incertos_xy": incertos if len(incertos) <= 48 else incertos[:48] + [["…", len(incertos) - 48]],
        "notas": sorted(set(r.notas)),
        "partes": partes_json,
    }


#: Tamanho da folha montada (o maior que o Roblox mostra sem reduzir).
FOLHA_MONTADA = 1024


def montar(resumo: dict) -> dict:
    """Proposta da folha montada (não é enviada): cada peça vira um bloco com a base e, à direita, as máscaras das
    partes, do mesmo tamanho, lado a lado; os blocos entram em prateleiras de altura decrescente, folha a folha.
    Peças com a mesma área (cadeira e casa8) usam o mesmo bloco. Grava em estudo/recortes/montada/."""
    blocos = []
    vistos = {}
    for id_, info in resumo["pecas"].items():
        chave = (info["folha"], tuple(info["area"]))
        if chave in vistos:
            vistos[chave].append(id_)
            continue
        vistos[chave] = [id_]
        imgs = [np.array(Image.open(F.RAIZ / info["base"]).convert("RGBA"))]
        imgs += [np.array(Image.open(F.RAIZ / q["arquivo"]).convert("RGBA")) for q in info["partes"] if q.get("arquivo")]
        blocos.append((chave, imgs))
    blocos.sort(key=lambda b: (-b[1][0].shape[0], -len(b[1]) * b[1][0].shape[1]))
    folhas: list[np.ndarray] = []
    mapa = {}
    x = y = altura = 0
    for chave, imgs in blocos:
        h, w = imgs[0].shape[:2]
        largura = w * len(imgs) + (len(imgs) - 1)
        if x + largura > FOLHA_MONTADA:
            x, y, altura = 0, y + altura + 1, 0
        if not folhas or y + h > FOLHA_MONTADA:
            folhas.append(np.zeros((FOLHA_MONTADA, FOLHA_MONTADA, 4), dtype=np.uint8))
            x = y = altura = 0
        for i, img in enumerate(imgs):
            folhas[-1][y : y + h, x + i * (w + 1) : x + i * (w + 1) + w] = img
        registro = {"folha": len(folhas) - 1, "base": [x, y, w, h], "partes": [[x + i * (w + 1), y, w, h] for i in range(1, len(imgs))]}
        for id_ in vistos[chave]:
            mapa[id_] = registro
        x += largura + 1
        altura = max(altura, h)
    pasta = PREVIAS / "montada"
    pasta.mkdir(parents=True, exist_ok=True)
    for n, folha in enumerate(folhas):
        usada = int(np.nonzero(folha[..., 3].any(axis=1))[0].max()) + 1
        Image.fromarray(folha, "RGBA").save(pasta / f"recortes_{n}.png", optimize=True)
        print(f"recortes_{n}.png: {usada} de {FOLHA_MONTADA} linhas usadas")
    dados = {"nota": "Proposta (não enviada): chaves de registro diorama.recortes.<n>; retângulos [x, y, largura, altura].",
             "folhas": len(folhas), "pecas": mapa}
    (pasta / "recortes.json").write_text(
        json.dumps(dados, ensure_ascii=False, indent="\t") + "\n", encoding="utf-8", newline="\n"
    )
    return dados


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("ids", nargs="*")
    ap.add_argument("--validar", action="store_true")
    ap.add_argument("--evolucao", action="store_true")
    ap.add_argument("--sintetico", action="store_true")
    ap.add_argument("--montar", action="store_true")
    ap.add_argument("--sem-catalogo", action="store_true")
    ap.add_argument("--sem-previas", action="store_true")
    args = ap.parse_args()

    caminho_cat = F.CATALOGO / "pecas.json"
    texto_cat = caminho_cat.read_text(encoding="utf-8")
    catalogo = json.loads(texto_cat)
    metodo = R.METODO

    if args.montar:
        montar(json.loads((SAIDA / "recortes.json").read_text(encoding="utf-8")))
        return 0
    if args.sintetico:
        print(json.dumps(sintetico(catalogo), ensure_ascii=False, indent=1))
        return 0
    if args.validar or args.evolucao:
        if args.evolucao:
            for linha in evolucao(catalogo):
                print(json.dumps(linha, ensure_ascii=False))
        v = validar(metodo, catalogo)
        print(json.dumps(v, ensure_ascii=False, indent=1))
        return 0

    todas = pecas_a_recortar(catalogo)
    escolhidas = [p for p in todas if not args.ids or p["id"] in args.ids]
    if args.ids and len(escolhidas) != len(set(args.ids)):
        faltam = set(args.ids) - {p["id"] for p in escolhidas}
        print(f"ids desconhecidos: {', '.join(sorted(faltam))}", file=sys.stderr)
        return 1

    resultado = {}
    primeira_de_area: dict = {}
    for p in escolhidas:
        info = processar(p, metodo, not args.sem_previas)
        k = chave_area(p)
        if k in primeira_de_area:
            info["mesma_area_que"] = primeira_de_area[k]
        else:
            primeira_de_area[k] = p["id"]
        resultado[p["id"]] = info
        print(f"{p['id']:16s} {p['folha']:8s} {str(p['area']):18s} confiança {info['confianca']:.3f}  "
              f"incertos {info['incertos']:3d}  partes {sum(1 for q in info['partes'] if q['pintavel'])}")

    if args.ids:
        print("(só algumas peças: recortes.json e pecas.json não foram regravados)")
        return 0

    v = validar(metodo, catalogo)
    resumo = {
        "versao": 1,
        "nota": "Gerado por tools/recortes.py (etapa G do Diorama). Recortes RGBA com 1 pixel de folga em volta da área "
        "(o canto do recorte fica em (coluna × 16 − 1, linha × 16 − 1) da folha). Confiança = 1 − incertos / pixels da "
        "peça; incertos são os pixels que a limpeza e o contorno decidiram, não o casamento com o fundo. Partes: 0 é o "
        "contorno (fixo), −1 as cores pequenas demais para pintar (ficam na base), 1.. as pintáveis, com a máscara em "
        "cinza (branco = a cor escolhida cheia). Ver docs/diorama/RECORTES.md.",
        "metodo": asdict(metodo),
        "gabarito": v,
        "sintetico": sintetico(catalogo),
        "evolucao": evolucao(catalogo),
        "pecas": resultado,
    }
    (SAIDA / "recortes.json").write_text(
        json.dumps(resumo, ensure_ascii=False, indent="\t") + "\n", encoding="utf-8", newline="\n"
    )

    if not args.sem_catalogo:
        for peca in catalogo["pecas"]:
            info = resultado.get(peca["id"])
            if info is None or info["origem"] != "pecas.json":
                continue
            peca["recorte"] = {
                "arquivo": info["arquivo"],
                "folga": 1,
                "base": info["base"],
                "partes": [
                    {k: q[k] for k in ("n", "arquivo", "referencia", "cor_media", "pixels")}
                    for q in info["partes"]
                    if q["pintavel"]
                ],
            }
        novo = json.dumps(catalogo, ensure_ascii=False, indent="\t") + "\n"
        if novo != texto_cat:
            caminho_cat.write_text(novo, encoding="utf-8", newline="\n")
            print("pecas.json: campo recorte gravado")
    print(f"gabarito: {v['taxa'] * 100:.2f} % dos pixels iguais ({v['iguais']} de {v['pixels']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
