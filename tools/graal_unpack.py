"""Desempacota as folhas graal_<n>.png nas peças dos contribuidores (reconstrução de 2026-10-20).

As peças cruas se perderam na formatação; o que sobrou são as folhas enviadas ao Roblox (baixadas de lá) e
os dois módulos que as descrevem, src/shared/graalData.ts e graalDataOriginal.ts. Este script lê os módulos,
recorta cada camada de cada peça das folhas dos dois estilos e grava:

    contribuidores/pecas/<autor>/<id>/peca.json
    contribuidores/pecas/<autor>/<id>/aeko/<camada>.png
    contribuidores/pecas/<autor>/<id>/original/<camada>.png

A imagem de uma camada é o bloco da folha (graal_common.py): cabeça 32·N × 32 (N = 5, ou 8 quando a camada
muda na piscada), corpo 128 × 704. O nome é o tipo da camada (f, h, s, e, d0.., c0..); quando o mesmo tipo
aparece duas vezes na peça (alguns corpos têm duas camadas de cabelo), a segunda é `<tipo>.2.png`.

peca.json (formato 1):
    {
      "formato": 1,
      "tipo": "cabeca" | "corpo",
      "id": "4alexxx", "autor": "alexxx", "genero": "m" | "f" | "u",
      "camadas": [ { "tipo": "f", "arquivo": "f.png", "piscada": false }, ... ],   // na ordem de desenho
      "tipos_roupa": ["t", "k", ...],                                               // só corpo: o tipo de c0..cN
      "estilos": {
        "aeko":     { "pele": "FFAE77", "cabelo": "4C4C88", "olhos": "72759A", "detalhes": [] },   // cabeça
        "original": { ... }                                                                       // ou, no corpo,
      }                                                                                           // { "pele", "roupa": [] }
    }
O topo da cabeça não fica aqui: o pacote o calcula da camada `f` (a linha mais alta com pixel nas 4 direções),
o que reproduz os 840 valores de graalData.ts. As cores base (pele, cabelo, olhos, detalhes, roupa) vinham do
importador perdido e não dá para recalculá-las com certeza: ficam copiadas de graalData.ts.

Uso:
    python tools/graal_unpack.py                       lê contribuidores/pack_aeko e pack_original (graal_<n>.png)
    python tools/graal_unpack.py --recuperado <pasta>  lê <pasta>/graal.aeko.<n>.png e graal.original.<n>.png
Opções: --src <pasta dos .ts> (src/shared), --saida <pasta> (contribuidores/pecas), --pack-aeko, --pack-original.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # graal_common.py, mesmo com `python -I`
from graal_common import (  # noqa: E402
    CONTRIBUIDORES,
    CORPO_CELULAS,
    ESTILOS,
    PECAS,
    SRC,
    Camada,
    Folhas,
    bloco_para_imagem,
    decodificar_cabeca,
    decodificar_corpo,
    gravar_json,
    ler_lista_ts,
    ler_registro_ts,
    tamanho_bloco_cabeca,
)


def nomes_de_arquivo(camadas: list[Camada]) -> list[str]:
    """f.png, h.png...; a segunda camada de um mesmo tipo vira h.2.png."""
    vistos: dict[str, int] = {}
    nomes = []
    for c in camadas:
        vistos[c.tipo] = vistos.get(c.tipo, 0) + 1
        nomes.append(f"{c.tipo}.png" if vistos[c.tipo] == 1 else f"{c.tipo}.{vistos[c.tipo]}.png")
    return nomes


def camadas_do_original(camadas: list[Camada], trocas: str | None) -> list[Camada]:
    """As camadas no estilo original: as mesmas, menos as de GRAAL_LAYERS_ORIGINAL (troca a primeira do mesmo tipo)."""
    if not trocas:
        return camadas
    saida = list(camadas)
    for parte in trocas.split(";"):
        campos = parte.split(":")
        nova = Camada(campos[0], int(campos[1]), int(campos[2]), len(campos) > 3 and campos[3] == "1")
        for i, c in enumerate(saida):
            if c.tipo == nova.tipo:
                saida[i] = nova
                break
        else:
            print(f"  aviso: {parte} troca uma camada que a peça não tem", file=sys.stderr)
    return saida


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--src", type=Path, default=SRC, help="pasta com graalData.ts e graalDataOriginal.ts")
    ap.add_argument("--saida", type=Path, default=PECAS, help="onde gravar as peças")
    ap.add_argument("--pack-aeko", type=Path, default=CONTRIBUIDORES / "pack_aeko")
    ap.add_argument("--pack-original", type=Path, default=CONTRIBUIDORES / "pack_original")
    ap.add_argument("--recuperado", type=Path, help="pasta com graal.aeko.<n>.png e graal.original.<n>.png (as imagens baixadas do Roblox)")
    args = ap.parse_args()

    dados = (args.src / "graalData.ts").read_text(encoding="utf-8")
    dados_original = (args.src / "graalDataOriginal.ts").read_text(encoding="utf-8")
    cabecas = [decodificar_cabeca(t) for t in ler_lista_ts(dados, "GRAAL_HEADS")]
    corpos = [decodificar_corpo(t) for t in ler_lista_ts(dados, "GRAAL_BODIES")]
    cabecas_original = ler_registro_ts(dados_original, "GRAAL_HEADS_ORIGINAL")
    corpos_original = ler_registro_ts(dados_original, "GRAAL_BODIES_ORIGINAL")
    camadas_original = ler_registro_ts(dados_original, "GRAAL_LAYERS_ORIGINAL")

    if args.recuperado:
        folhas = {
            "aeko": Folhas(args.recuperado, lambda n: f"graal.aeko.{n}.png"),
            "original": Folhas(args.recuperado, lambda n: f"graal.original.{n}.png"),
        }
    else:
        folhas = {
            "aeko": Folhas(args.pack_aeko, lambda n: f"graal_{n}.png"),
            "original": Folhas(args.pack_original, lambda n: f"graal_{n}.png"),
        }

    ids = set()
    for peca in [*cabecas, *corpos]:
        if peca.id in ids:
            raise SystemExit(f"id repetido: {peca.id}")
        ids.add(peca.id)

    total_camadas = 0
    for h in cabecas:
        pasta = args.saida / h.autor / h.id
        nomes = nomes_de_arquivo(h.camadas)
        por_estilo = {"aeko": h.camadas, "original": camadas_do_original(h.camadas, camadas_original.get(h.id))}
        for estilo in ESTILOS:
            (pasta / estilo).mkdir(parents=True, exist_ok=True)
            for camada, nome in zip(por_estilo[estilo], nomes):
                bloco = folhas[estilo].bloco(camada.folha, camada.celula, tamanho_bloco_cabeca(camada.piscada))
                bloco_para_imagem(bloco, corpo=False).save(pasta / estilo / nome)
                total_camadas += 1
        if h.id in cabecas_original:
            topo, pele, cabelo, olhos, detalhes = cabecas_original[h.id].split("|")
            original = {"pele": pele, "cabelo": cabelo, "olhos": olhos, "detalhes": detalhes.split(",") if detalhes else []}
        else:
            original = {"pele": h.pele, "cabelo": h.cabelo, "olhos": h.olhos, "detalhes": list(h.detalhes)}
        gravar_json(
            pasta / "peca.json",
            {
                "formato": 1,
                "tipo": "cabeca",
                "id": h.id,
                "autor": h.autor,
                "genero": h.genero,
                "camadas": [{"tipo": c.tipo, "arquivo": n, "piscada": c.piscada} for c, n in zip(h.camadas, nomes)],
                "estilos": {
                    "aeko": {"pele": h.pele, "cabelo": h.cabelo, "olhos": h.olhos, "detalhes": list(h.detalhes)},
                    "original": original,
                },
            },
        )

    for b in corpos:
        pasta = args.saida / b.autor / b.id
        nomes = nomes_de_arquivo(b.camadas)
        por_estilo = {"aeko": b.camadas, "original": camadas_do_original(b.camadas, camadas_original.get(b.id))}
        for estilo in ESTILOS:
            (pasta / estilo).mkdir(parents=True, exist_ok=True)
            for camada, nome in zip(por_estilo[estilo], nomes):
                bloco = folhas[estilo].bloco(camada.folha, camada.celula, CORPO_CELULAS)
                bloco_para_imagem(bloco, corpo=True).save(pasta / estilo / nome)
                total_camadas += 1
        if b.id in corpos_original:
            pele, roupa = corpos_original[b.id].split("|")
            original = {"pele": pele, "roupa": roupa.split(",") if roupa else []}
        else:
            original = {"pele": b.pele, "roupa": list(b.roupa)}
        gravar_json(
            pasta / "peca.json",
            {
                "formato": 1,
                "tipo": "corpo",
                "id": b.id,
                "autor": b.autor,
                "genero": b.genero,
                "camadas": [{"tipo": c.tipo, "arquivo": n} for c, n in zip(b.camadas, nomes)],
                "tipos_roupa": list(b.tipos),
                "estilos": {"aeko": {"pele": b.pele, "roupa": list(b.roupa)}, "original": original},
            },
        )

    print(f"{len(cabecas)} cabeças e {len(corpos)} corpos, {total_camadas} imagens de camada, em {args.saida}")
    print(f"camadas em outro lugar no original: {len(camadas_original)} ({', '.join(camadas_original)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
