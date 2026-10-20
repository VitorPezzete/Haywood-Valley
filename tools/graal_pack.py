"""Empacota as peças dos contribuidores nas folhas graal_<n>.png e grava graalData.ts (reconstrução de 2026-10-20).

Uso (na raiz do repositório):
    python tools/graal_pack.py
        estilo do Aeko: contribuidores/pecas/**/aeko → contribuidores/pack_aeko/graal_<n>.png + src/shared/graalData.ts
    python tools/graal_pack.py --original --casar-com pack_aeko --pasta pack_original
        estilo original: contribuidores/pecas/**/original → contribuidores/pack_original/graal_<n>.png
        + src/shared/graalDataOriginal.ts, com as folhas casadas célula a célula com as do Aeko
Opções: --pecas <pasta> (contribuidores/pecas), --contribuidores <pasta>, --src <pasta dos .ts> (src/shared),
--sem-folhas (grava só o .ts).

Como empacota (deduzido de graalData.ts; o resultado reproduz os módulos e as folhas de 2026-10-18):

- As peças entram por autor (ordem alfabética) e id (ordem natural: bea2 antes de bea10), cabeças antes de
  corpos; as camadas de cada peça na ordem de peca.json, que é a ordem de desenho.
- Cada camada é um bloco de células (graal_common.py): 5 ou 8 na cabeça (8 quando a imagem tem o olho fechado,
  256 × 32), 88 no corpo. Um bloco com os mesmos pixels de um já gravado não é gravado de novo: a camada aponta
  para a célula dele (é assim que peças de cores iguais dividem a pele e os olhos).
- Bloco novo vai para a primeira folha em que cabe, depois do que ela já tem ("primeiro que cabe", folha a
  folha): as cabeças de 5 células preenchem o fim de uma folha onde um bloco de 8 não coube. Nenhum bloco
  atravessa folhas; uma folha tem 1024 células.
- O topo da cabeça é a linha mais alta com pixel nas 4 direções da camada `f`. As cores base vêm de peca.json.

- --original: cada camada fica na mesma folha e célula do estilo do Aeko, então as camadas de graalData.ts
  valem para os dois estilos. Quando duas peças dividem um bloco no Aeko mas os blocos originais diferem, a
  primeira (na ordem acima) fica na célula e a outra é realocada e vai para GRAAL_LAYERS_ORIGINAL. A célula
  da realocação é a que o graalDataOriginal.ts existente já dava a essa camada (para não mudar de lugar o
  que já foi enviado ao Roblox; a ordem das 4 realocações de 2026-10-18 não é a das peças, veio de rodadas
  seguidas), e, sem isso, o fim da última folha; blocos realocados iguais dividem a célula. Dentro de uma
  peça, as realocações saem na ordem das células.
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))  # graal_common.py, mesmo com `python -I`
from graal_common import (  # noqa: E402
    CELULAS_POR_FOLHA,
    CONTRIBUIDORES,
    PECAS,
    SRC,
    Bloco,
    Cabeca,
    Camada,
    Corpo,
    Peca,
    campos_cabeca_original,
    campos_corpo_original,
    chave_ts,
    codificar_cabeca,
    codificar_camada_cabeca,
    codificar_camada_corpo,
    codificar_corpo,
    decodificar_cabeca,
    decodificar_corpo,
    folha_vazia,
    gravar_bloco,
    gravar_texto,
    imagem_para_bloco,
    ler_lista_ts,
    ler_registro_ts,
    listar_pecas,
    topo_de,
)

Posicao = tuple[int, int]  # folha, célula


def hash_bloco(bloco: Bloco) -> bytes:
    return hashlib.sha1(bloco.tobytes()).digest() + bytes([bloco.shape[0]])


class Alocador:
    """Primeiro que cabe, folha a folha, com um bloco igual apontando para o já gravado."""

    def __init__(self) -> None:
        self.cursores: list[int] = []
        self.por_hash: dict[bytes, Posicao] = {}

    def alocar(self, h: bytes, n: int) -> tuple[Posicao, bool]:
        if h in self.por_hash:
            return self.por_hash[h], False
        for i, cursor in enumerate(self.cursores):
            if cursor + n <= CELULAS_POR_FOLHA:
                self.cursores[i] = cursor + n
                pos = (i, cursor)
                break
        else:
            self.cursores.append(n)
            pos = (len(self.cursores) - 1, 0)
        self.por_hash[h] = pos
        return pos, True

    @property
    def fim(self) -> Posicao:
        return (len(self.cursores) - 1, self.cursores[-1]) if self.cursores else (0, 0)


@dataclass
class CamadaPeca:
    tipo: str
    arquivo: str


def camadas_de(peca: Peca) -> list[CamadaPeca]:
    return [CamadaPeca(c["tipo"], c["arquivo"]) for c in peca.dados["camadas"]]


def bloco_de(peca: Peca, camada: CamadaPeca, estilo: str) -> Bloco:
    caminho = peca.pasta / estilo / camada.arquivo
    if not caminho.is_file() and estilo != "aeko":
        # Peça ainda sem o estilo: vale a imagem do Aeko.
        caminho = peca.pasta / "aeko" / camada.arquivo
    return imagem_para_bloco(caminho, peca.corpo)


class Folhas:
    def __init__(self) -> None:
        self.folhas: dict[int, object] = {}

    def gravar(self, pos: Posicao, bloco: Bloco) -> None:
        if pos[0] not in self.folhas:
            self.folhas[pos[0]] = folha_vazia()
        gravar_bloco(self.folhas[pos[0]], pos[1], bloco)

    def salvar(self, pasta: Path, quantas: int) -> None:
        pasta.mkdir(parents=True, exist_ok=True)
        for n in range(quantas):
            folha = self.folhas.get(n)
            if folha is None:
                folha = folha_vazia()
            Image.fromarray(folha, "RGBA").save(pasta / f"graal_{n}.png")


def montar_cabeca(peca: Peca, estilo: str, camadas: list[Camada], topo: int) -> Cabeca:
    cores = peca.dados["estilos"].get(estilo) or peca.dados["estilos"]["aeko"]
    return Cabeca(
        peca.id,
        peca.autor,
        peca.dados["genero"],
        topo,
        cores.get("pele", ""),
        cores.get("cabelo", ""),
        cores.get("olhos", ""),
        list(cores.get("detalhes", [])),
        camadas,
    )


def montar_corpo(peca: Peca, estilo: str, camadas: list[Camada]) -> Corpo:
    cores = peca.dados["estilos"].get(estilo) or peca.dados["estilos"]["aeko"]
    return Corpo(peca.id, peca.autor, peca.dados["genero"], cores.get("pele", ""), list(cores.get("roupa", [])), list(peca.dados.get("tipos_roupa", [])), camadas)


def texto_graal_data(cabecas: list[Cabeca], corpos: list[Corpo], folhas: int) -> str:
    def lista(itens: list[str]) -> str:
        return "[" + ", ".join('"' + t + '"' for t in itens) + "]"

    return (
        "// Gerado por tools/graal_import.py → tools/graal_pack.py (pasta Aseprite) a partir das peças dos contribuidores.\n"
        "// Não editar à mão: rodar o script de novo.\n"
        "/** Quantas folhas graal_<n>.png existem; os ids enviados ficam em GRAAL_SHEETS (client/world/graalArt.ts). */\n"
        f"export const GRAAL_SHEET_COUNT = {folhas};\n"
        "/**\n"
        ' * Uma cabeça por texto: "id|autor|gênero|topo|pele|cabelo|olhos|detalhes|camadas". gênero: m, f ou u\n'
        ' * (generos.json). detalhes: as cores base de d0..dN separadas por ",", ou vazio.\n'
        " * topo: a linha mais alta com pixel nas 4 direções (0..31). pele, cabelo e olhos: a cor base (RRGGBB) da\n"
        ' * parte, ou vazio se a cabeça não tem a parte. camadas: separadas por ";", cada uma "tipo:folha:célula:piscada",\n'
        " * tipo f, h, s, e ou d0..d2; piscada 1 se o bloco tem as 3 células do olho fechado.\n"
        " */\n"
        f"export const GRAAL_HEADS: readonly string[] = {lista([codificar_cabeca(h) for h in cabecas])};\n"
        "/**\n"
        ' * Um corpo por texto: "id|autor|gênero|pele|roupa|tipos|camadas". gênero: m, f ou u. pele: a cor base ou vazio. roupa: as cores\n'
        ' * base das partes c0..cN, separadas por ",", ou vazio. tipos: o tipo de cada parte, na mesma ordem (t camisa, m mangas, p calça,\n'
        ' * k saia, v vestido, s sapatos, b cinto, d detalhe). camadas: ";", cada uma "tipo:folha:célula", tipo f, s, h, c0..c5.\n'
        " */\n"
        f"export const GRAAL_BODIES: readonly string[] = {lista([codificar_corpo(b) for b in corpos])};\n"
    )


def registro_ts(nome: str, itens: dict[str, str]) -> str:
    linhas = "".join(f'\t{chave_ts(k)}: "{v}",\n' for k, v in itens.items())
    return f"export const {nome}: Readonly<Record<string, string>> = {{\n{linhas}}};\n"


def texto_graal_data_original(
    casar_com: str, pasta: str, folhas: int, cabecas: dict[str, str], corpos: dict[str, str], camadas: dict[str, str]
) -> str:
    return (
        f"// Gerado por tools/graal_pack.py --original --casar-com {casar_com} --pasta {pasta} (pasta Aseprite).\n"
        "// Não editar à mão: rodar o script de novo.\n"
        "//\n"
        f"// O estilo original das peças (as cores dos contribuidores). As folhas dele (contribuidores/{pasta}) são\n"
        f"// casadas célula a célula com as do estilo do Aeko ({casar_com}): cada camada de cada peça fica na mesma folha\n"
        "// e na mesma célula, então as camadas, a piscada e os tipos da roupa de graalData.ts valem para os dois.\n"
        "// Aqui fica só o que muda: o topo da cabeça, as cores base das partes e as poucas camadas que não cabem\n"
        "// na célula do Aeko (GRAAL_LAYERS_ORIGINAL). Peça que não aparece aqui tem esses campos iguais aos de\n"
        "// graalData.ts.\n"
        "/** Quantas folhas o estilo original tem (as mesmas posições de GRAAL_SHEET_COUNT). */\n"
        f"export const GRAAL_ORIGINAL_SHEET_COUNT = {folhas};\n"
        "/**\n"
        ' * Por id de cabeça: "topo|pele|cabelo|olhos|detalhes", os campos 4 a 8 de GRAAL_HEADS, no mesmo formato\n'
        ' * (cores RRGGBB, vazio sem a parte; detalhes separados por ",", na ordem d0, d1...).\n'
        " */\n"
        + registro_ts("GRAAL_HEADS_ORIGINAL", cabecas)
        + "/**\n"
        ' * Por id de corpo: "pele|roupa", os campos 4 e 5 de GRAAL_BODIES, no mesmo formato (roupa: as cores base\n'
        ' * de c0..cN separadas por ",").\n'
        " */\n"
        + registro_ts("GRAAL_BODIES_ORIGINAL", corpos)
        + "/**\n"
        ' * Camadas que no original ficam em outro lugar, por id de cabeça ou de corpo: "camada;camada", cada uma\n'
        ' * no formato das camadas de graalData.ts (cabeça "tipo:folha:célula:piscada", corpo "tipo:folha:célula").\n'
        " * O estilo do Aeko grava uma vez só o bloco igual de duas peças; quando no original esses blocos diferem,\n"
        " * o de uma delas vai para células livres das mesmas folhas. No estilo original, a camada daqui substitui\n"
        " * a de mesmo tipo de graalData.ts; as outras camadas da peça ficam onde estão.\n"
        " */\n"
        + registro_ts("GRAAL_LAYERS_ORIGINAL", camadas)
    )


def dicas_de(src: Path) -> dict[tuple[str, str], Posicao]:
    """As realocações do graalDataOriginal.ts existente: (id, tipo) → (folha, célula)."""
    caminho = src / "graalDataOriginal.ts"
    if not caminho.is_file():
        return {}
    dicas: dict[tuple[str, str], Posicao] = {}
    for id_, texto in ler_registro_ts(caminho.read_text(encoding="utf-8"), "GRAAL_LAYERS_ORIGINAL").items():
        for parte in texto.split(";"):
            campos = parte.split(":")
            dicas.setdefault((id_, campos[0]), (int(campos[1]), int(campos[2])))
    return dicas


def empacotar(args) -> int:
    pecas = listar_pecas(args.pecas)
    cabecas = [p for p in pecas if not p.corpo]
    corpos = [p for p in pecas if p.corpo]
    if not pecas:
        raise SystemExit(f"nenhuma peça em {args.pecas}")
    print(f"{len(cabecas)} cabeças e {len(corpos)} corpos em {args.pecas}")

    # 1. A alocação do estilo do Aeko (no modo --original, só para saber as células).
    aeko = Alocador()
    folhas = Folhas()
    posicoes: dict[tuple[str, int], Posicao] = {}  # (id, índice da camada) → posição
    tamanhos: dict[tuple[str, int], int] = {}  # (id, índice da camada) → células do bloco
    topos_aeko: dict[str, int] = {}
    for peca in [*cabecas, *corpos]:
        for i, camada in enumerate(camadas_de(peca)):
            bloco = bloco_de(peca, camada, "aeko")
            pos, novo = aeko.alocar(hash_bloco(bloco), bloco.shape[0])
            posicoes[(peca.id, i)] = pos
            tamanhos[(peca.id, i)] = bloco.shape[0]
            if novo and not args.original and not args.sem_folhas:
                folhas.gravar(pos, bloco)
            if not peca.corpo and camada.tipo == "f" and peca.id not in topos_aeko:
                topos_aeko[peca.id] = topo_de(bloco)
    quantas = len(aeko.cursores)

    def camada_saida(peca: Peca, camada: CamadaPeca, pos: Posicao, n: int) -> Camada:
        return Camada(camada.tipo, pos[0], pos[1], (not peca.corpo) and n == 8)

    if not args.original:
        lista_cabecas = []
        for peca in cabecas:
            camadas = [camada_saida(peca, c, posicoes[(peca.id, i)], tamanhos[(peca.id, i)]) for i, c in enumerate(camadas_de(peca))]
            lista_cabecas.append(montar_cabeca(peca, "aeko", camadas, topos_aeko.get(peca.id, 0)))
        lista_corpos = [montar_corpo(peca, "aeko", [camada_saida(peca, c, posicoes[(peca.id, i)], 88) for i, c in enumerate(camadas_de(peca))]) for peca in corpos]
        texto = texto_graal_data(lista_cabecas, lista_corpos, quantas)
        gravar_texto(args.src / "graalData.ts", texto)
        print(f"{args.src / 'graalData.ts'}: {quantas} folhas, {len(aeko.por_hash)} blocos")
        if not args.sem_folhas:
            folhas.salvar(args.contribuidores / args.pasta, quantas)
            print(f"{args.contribuidores / args.pasta}: graal_0.png a graal_{quantas - 1}.png")
        return 0

    # 2. O estilo original, casado célula a célula com o Aeko.
    conferir_aeko(args, posicoes)
    dicas = dicas_de(args.src)
    dono: dict[Posicao, bytes] = {}  # a posição do Aeko → o hash do bloco original gravado nela
    realocados: dict[bytes, Posicao] = {}
    ocupadas: set[Posicao] = set()
    for (folha, cursor) in enumerate(aeko.cursores):
        ocupadas.update((folha, c) for c in range(cursor))
    fim = aeko.fim
    trocas: dict[str, list[tuple[Posicao, Camada]]] = {}
    cabecas_original: dict[str, str] = {}
    corpos_original: dict[str, str] = {}

    def realocar(peca: Peca, camada: CamadaPeca, h: bytes, bloco: Bloco) -> Posicao:
        nonlocal fim
        n = bloco.shape[0]
        if h in realocados:
            return realocados[h]
        dica = dicas.get((peca.id, camada.tipo))
        if dica is not None and dica[1] + n <= CELULAS_POR_FOLHA and not any((dica[0], c) in ocupadas for c in range(dica[1], dica[1] + n)):
            pos = dica
        else:
            if fim[1] + n > CELULAS_POR_FOLHA:
                fim = (fim[0] + 1, 0)
            pos = fim
        celulas = {(pos[0], c) for c in range(pos[1], pos[1] + n)}
        ocupadas.update(celulas)
        # O fim avança para depois de tudo o que já foi usado na última folha.
        fim = max(fim, (pos[0], pos[1] + n))
        realocados[h] = pos
        if not args.sem_folhas:
            folhas.gravar(pos, bloco)
        return pos

    for peca in [*cabecas, *corpos]:
        camadas_saida: list[Camada] = []
        topo_original = 0
        for i, camada in enumerate(camadas_de(peca)):
            bloco = bloco_de(peca, camada, "original")
            h = hash_bloco(bloco)
            pos = posicoes[(peca.id, i)]
            if not peca.corpo and camada.tipo == "f" and i == next((j for j, c in enumerate(camadas_de(peca)) if c.tipo == "f"), -1):
                topo_original = topo_de(bloco)
            if pos not in dono:
                dono[pos] = h
                if not args.sem_folhas:
                    folhas.gravar(pos, bloco)
            elif dono[pos] != h:
                nova = realocar(peca, camada, h, bloco)
                trocas.setdefault(peca.id, []).append((nova, camada_saida(peca, camada, nova, bloco.shape[0])))
                pos = nova
            camadas_saida.append(camada_saida(peca, camada, pos, bloco.shape[0]))
        if peca.corpo:
            corpo = montar_corpo(peca, "original", camadas_saida)
            corpo_aeko = montar_corpo(peca, "aeko", camadas_saida)
            valor = campos_corpo_original(corpo.pele, corpo.roupa)
            if valor != campos_corpo_original(corpo_aeko.pele, corpo_aeko.roupa):
                corpos_original[peca.id] = valor
        else:
            cabeca = montar_cabeca(peca, "original", camadas_saida, topo_original)
            cabeca_aeko = montar_cabeca(peca, "aeko", camadas_saida, topos_aeko.get(peca.id, 0))
            valor = campos_cabeca_original(cabeca.topo, cabeca.pele, cabeca.cabelo, cabeca.olhos, cabeca.detalhes)
            if valor != campos_cabeca_original(cabeca_aeko.topo, cabeca_aeko.pele, cabeca_aeko.cabelo, cabeca_aeko.olhos, cabeca_aeko.detalhes):
                cabecas_original[peca.id] = valor

    camadas_original: dict[str, str] = {}
    for peca in [*cabecas, *corpos]:
        if peca.id in trocas:
            itens = sorted(trocas[peca.id], key=lambda t: t[0])
            codificar = codificar_camada_corpo if peca.corpo else codificar_camada_cabeca
            camadas_original[peca.id] = ";".join(codificar(c) for _, c in itens)
    quantas_original = max(quantas, fim[0] + 1)
    texto = texto_graal_data_original(args.casar_com, args.pasta, quantas_original, cabecas_original, corpos_original, camadas_original)
    gravar_texto(args.src / "graalDataOriginal.ts", texto)
    print(
        f"{args.src / 'graalDataOriginal.ts'}: {len(cabecas_original)} cabeças e {len(corpos_original)} corpos com campos próprios, "
        f"{sum(len(v) for v in trocas.values())} camadas realocadas em {len(trocas)} peças"
    )
    if not args.sem_folhas:
        folhas.salvar(args.contribuidores / args.pasta, quantas_original)
        print(f"{args.contribuidores / args.pasta}: graal_0.png a graal_{quantas_original - 1}.png")
    return 0


def conferir_aeko(args, posicoes: dict[tuple[str, int], Posicao]) -> None:
    """Avisa se o graalData.ts existente não bate com a alocação recalculada: o pacote do Aeko está desatualizado."""
    caminho = args.src / "graalData.ts"
    if not caminho.is_file():
        print(f"aviso: {caminho} não existe; rodar o pacote do Aeko antes", file=sys.stderr)
        return
    texto = caminho.read_text(encoding="utf-8")
    gravado: dict[tuple[str, int], Posicao] = {}
    for t in ler_lista_ts(texto, "GRAAL_HEADS"):
        h = decodificar_cabeca(t)
        for i, c in enumerate(h.camadas):
            gravado[(h.id, i)] = (c.folha, c.celula)
    for t in ler_lista_ts(texto, "GRAAL_BODIES"):
        b = decodificar_corpo(t)
        for i, c in enumerate(b.camadas):
            gravado[(b.id, i)] = (c.folha, c.celula)
    if gravado != posicoes:
        diferentes = sum(1 for k, v in posicoes.items() if gravado.get(k) != v)
        print(
            f"aviso: {diferentes} camada(s) em outra célula em {caminho}: rodar `python tools/graal_pack.py` (estilo do Aeko) "
            f"antes, senão as folhas de {args.casar_com} e {args.pasta} não casam",
            file=sys.stderr,
        )


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--pecas", type=Path, default=PECAS)
    ap.add_argument("--contribuidores", type=Path, default=CONTRIBUIDORES, help="onde fica a pasta do pacote")
    ap.add_argument("--pasta", default=None, help="nome da pasta do pacote (pack_aeko; com --original, pack_original)")
    ap.add_argument("--src", type=Path, default=SRC, help="onde gravar graalData.ts / graalDataOriginal.ts")
    ap.add_argument("--original", action="store_true", help="empacotar o estilo original, casado com o do Aeko")
    ap.add_argument("--casar-com", default="pack_aeko", help="o pacote do Aeko com que o original é casado (só o nome, para o cabeçalho)")
    ap.add_argument("--sem-folhas", action="store_true", help="gravar só o .ts, sem as folhas")
    args = ap.parse_args()
    if args.pasta is None:
        args.pasta = "pack_original" if args.original else "pack_aeko"
    return empacotar(args)


if __name__ == "__main__":
    sys.exit(main())
