"""O que graal_unpack.py e graal_pack.py têm em comum: as folhas, os textos de graalData.ts e as peças no disco.

Folhas (`graal_<n>.png`): 1024×1024, células de 32×32, 32 por linha, numeradas em ordem de leitura (0..1023).
Um bloco é uma sequência de células consecutivas de uma folha (pode virar a linha, nunca a folha):

- cabeça: 5 células (cima, esquerda, baixo, direita, vista de cima) ou 8 (mais o olho fechado de lado:
  esquerda, baixo, direita), quando a camada muda na piscada;
- corpo: 88 células, as 22 linhas do molde do Graal × 4 direções (linha * 4 + direção).

Peças no disco (`contribuidores/pecas/<autor>/<id>/`): `peca.json` e uma pasta por estilo (`aeko/`, `original/`)
com uma imagem por camada. A imagem de uma camada de cabeça é o bloco deitado (32·N × 32, N = 5 ou 8); a de
corpo tem as 22 linhas × 4 colunas (128 × 704). O formato de `peca.json` está em graal_unpack.py.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image

CELULA = 32
COLUNAS = 32
CELULAS_POR_FOLHA = COLUNAS * COLUNAS
FOLHA_PX = COLUNAS * CELULA

CABECA_CELULAS = 5
CABECA_CELULAS_PISCADA = 8
CORPO_LINHAS = 22
CORPO_COLUNAS = 4
CORPO_CELULAS = CORPO_LINHAS * CORPO_COLUNAS

RAIZ = Path(__file__).resolve().parent.parent
CONTRIBUIDORES = RAIZ / "contribuidores"
PECAS = CONTRIBUIDORES / "pecas"
SRC = RAIZ / "src" / "shared"

ESTILOS = ("aeko", "original")


def natural(texto: str):
    """Chave de ordenação natural: bea2 < bea10, bea1 < bea-masc1g (como o pacote antigo ordenava)."""
    return [int(parte) if parte.isdigit() else parte.lower() for parte in re.split(r"(\d+)", texto)]


# --- os textos de graalData.ts e graalDataOriginal.ts -------------------------------------------------


def ler_lista_ts(texto: str, nome: str) -> list[str]:
    """`export const <nome>: readonly string[] = ["...", "..."];` → a lista."""
    m = re.search(re.escape(nome) + r": readonly string\[\] = \[(.*?)\];", texto, re.S)
    if not m:
        raise ValueError(f"{nome} não encontrado")
    return json.loads("[" + m.group(1) + "]")


def ler_registro_ts(texto: str, nome: str) -> dict[str, str]:
    """`export const <nome>: Readonly<Record<string, string>> = {\\n\\tchave: "valor",\\n};` → dict, na ordem."""
    m = re.search(re.escape(nome) + r": Readonly<Record<string, string>> = \{\n(.*?)\};", texto, re.S)
    if not m:
        raise ValueError(f"{nome} não encontrado")
    saida: dict[str, str] = {}
    for linha in m.group(1).splitlines():
        if not linha.strip():
            continue
        mm = re.fullmatch(r'\t(?:"((?:[^"\\]|\\.)*)"|([^":]+)): "((?:[^"\\]|\\.)*)",', linha)
        if not mm:
            raise ValueError(f"{nome}: linha fora do formato: {linha!r}")
        chave = json.loads('"' + mm.group(1) + '"') if mm.group(1) is not None else mm.group(2)
        saida[chave] = json.loads('"' + mm.group(3) + '"')
    return saida


def ler_int(texto: str) -> int:
    return int(texto) if texto != "" else 0


@dataclass
class Camada:
    tipo: str  # f, h, s, e, d0..d2 (cabeça); f, s, h, c0..c5 (corpo)
    folha: int
    celula: int
    piscada: bool = False  # só cabeça


@dataclass
class Cabeca:
    id: str
    autor: str
    genero: str  # m, f, u
    topo: int
    pele: str
    cabelo: str
    olhos: str
    detalhes: list[str]
    camadas: list[Camada]


@dataclass
class Corpo:
    id: str
    autor: str
    genero: str
    pele: str
    roupa: list[str]
    tipos: list[str]
    camadas: list[Camada]


def _cores(texto: str) -> list[str]:
    return texto.split(",") if texto != "" else []


def decodificar_cabeca(texto: str) -> Cabeca:
    id_, autor, genero, topo, pele, cabelo, olhos, detalhes, camadas = texto.split("|")
    lista = []
    for parte in camadas.split(";") if camadas else []:
        tipo, folha, celula, piscada = parte.split(":")
        lista.append(Camada(tipo, int(folha), int(celula), piscada == "1"))
    return Cabeca(id_, autor, genero, ler_int(topo), pele, cabelo, olhos, _cores(detalhes), lista)


def decodificar_corpo(texto: str) -> Corpo:
    campos = texto.split("|")
    # Sem o campo dos tipos (dados de antes de 2026-10-17), toda parte é "d" (como graal.ts faz).
    id_, autor, genero, pele, roupa = campos[:5]
    tipos = campos[5] if len(campos) >= 7 else ""
    camadas = campos[6] if len(campos) >= 7 else campos[5]
    lista = []
    for parte in camadas.split(";") if camadas else []:
        tipo, folha, celula = parte.split(":")
        lista.append(Camada(tipo, int(folha), int(celula)))
    cores = _cores(roupa)
    tipos_lista = tipos.split(",") if tipos else ["d"] * len(cores)
    return Corpo(id_, autor, genero, pele, cores, tipos_lista, lista)


def codificar_camada_cabeca(c: Camada) -> str:
    return f"{c.tipo}:{c.folha}:{c.celula}:{1 if c.piscada else 0}"


def codificar_camada_corpo(c: Camada) -> str:
    return f"{c.tipo}:{c.folha}:{c.celula}"


def codificar_cabeca(h: Cabeca) -> str:
    camadas = ";".join(codificar_camada_cabeca(c) for c in h.camadas)
    return "|".join([h.id, h.autor, h.genero, str(h.topo), h.pele, h.cabelo, h.olhos, ",".join(h.detalhes), camadas])


def codificar_corpo(b: Corpo) -> str:
    camadas = ";".join(codificar_camada_corpo(c) for c in b.camadas)
    return "|".join([b.id, b.autor, b.genero, b.pele, ",".join(b.roupa), ",".join(b.tipos), camadas])


def campos_cabeca_original(topo: int, pele: str, cabelo: str, olhos: str, detalhes: list[str]) -> str:
    """O valor de GRAAL_HEADS_ORIGINAL: os campos 4 a 8 de GRAAL_HEADS."""
    return "|".join([str(topo), pele, cabelo, olhos, ",".join(detalhes)])


def campos_corpo_original(pele: str, roupa: list[str]) -> str:
    """O valor de GRAAL_BODIES_ORIGINAL: os campos 4 e 5 de GRAAL_BODIES."""
    return "|".join([pele, ",".join(roupa)])


def tamanho_bloco_cabeca(piscada: bool) -> int:
    return CABECA_CELULAS_PISCADA if piscada else CABECA_CELULAS


# --- folhas e blocos ---------------------------------------------------------------------------------


Bloco = np.ndarray  # (n, 32, 32, 4) uint8: as células do bloco, em ordem


class Folhas:
    """As folhas de um pacote, lidas quando precisa. `nome(n)` dá o caminho da folha n."""

    def __init__(self, pasta: Path, nome):
        self.pasta = pasta
        self.nome = nome
        self._cache: dict[int, np.ndarray] = {}

    def folha(self, n: int) -> np.ndarray:
        if n not in self._cache:
            caminho = self.pasta / self.nome(n)
            imagem = Image.open(caminho).convert("RGBA")
            if imagem.size != (FOLHA_PX, FOLHA_PX):
                raise ValueError(f"{caminho}: {imagem.size}, esperado {FOLHA_PX}×{FOLHA_PX}")
            self._cache[n] = np.array(imagem)
        return self._cache[n]

    def bloco(self, folha: int, celula: int, n: int) -> Bloco:
        return recortar_bloco(self.folha(folha), celula, n)


def recortar_bloco(folha: np.ndarray, celula: int, n: int) -> Bloco:
    if celula + n > CELULAS_POR_FOLHA:
        raise ValueError(f"bloco de {n} células na célula {celula} não cabe na folha")
    celulas = []
    for c in range(celula, celula + n):
        x = (c % COLUNAS) * CELULA
        y = (c // COLUNAS) * CELULA
        celulas.append(folha[y : y + CELULA, x : x + CELULA])
    return np.stack(celulas)


def gravar_bloco(folha: np.ndarray, celula: int, bloco: Bloco) -> None:
    for i, cel in enumerate(bloco):
        c = celula + i
        x = (c % COLUNAS) * CELULA
        y = (c // COLUNAS) * CELULA
        folha[y : y + CELULA, x : x + CELULA] = cel


def folha_vazia() -> np.ndarray:
    return np.zeros((FOLHA_PX, FOLHA_PX, 4), dtype=np.uint8)


def bloco_para_imagem(bloco: Bloco, corpo: bool) -> Image.Image:
    """Cabeça: as N células lado a lado. Corpo: 22 linhas × 4 colunas."""
    n = bloco.shape[0]
    if corpo:
        if n != CORPO_CELULAS:
            raise ValueError(f"corpo com {n} células, esperado {CORPO_CELULAS}")
        linhas = [np.concatenate(bloco[l * CORPO_COLUNAS : (l + 1) * CORPO_COLUNAS], axis=1) for l in range(CORPO_LINHAS)]
        return Image.fromarray(np.concatenate(linhas, axis=0), "RGBA")
    return Image.fromarray(np.concatenate(list(bloco), axis=1), "RGBA")


def imagem_para_bloco(caminho: Path, corpo: bool) -> Bloco:
    imagem = np.array(Image.open(caminho).convert("RGBA"))
    altura, largura = imagem.shape[:2]
    if corpo:
        if (largura, altura) != (CORPO_COLUNAS * CELULA, CORPO_LINHAS * CELULA):
            raise ValueError(f"{caminho}: {largura}×{altura}, esperado {CORPO_COLUNAS * CELULA}×{CORPO_LINHAS * CELULA}")
        celulas = [
            imagem[l * CELULA : (l + 1) * CELULA, c * CELULA : (c + 1) * CELULA]
            for l in range(CORPO_LINHAS)
            for c in range(CORPO_COLUNAS)
        ]
        return np.stack(celulas)
    n = largura // CELULA
    if altura != CELULA or largura % CELULA != 0 or n not in (CABECA_CELULAS, CABECA_CELULAS_PISCADA):
        raise ValueError(f"{caminho}: {largura}×{altura}, esperado {CABECA_CELULAS * CELULA}×32 ou {CABECA_CELULAS_PISCADA * CELULA}×32")
    return np.stack([imagem[:, c * CELULA : (c + 1) * CELULA] for c in range(n)])


def topo_de(bloco: Bloco) -> int:
    """A linha mais alta com pixel nas 4 direções (0..31); 0 se o bloco está vazio."""
    alfa = bloco[:4, :, :, 3]
    linhas = np.nonzero(alfa.any(axis=(0, 2)))[0]
    return int(linhas[0]) if len(linhas) else 0


# --- peças no disco ------------------------------------------------------------------------------------


@dataclass
class Peca:
    autor: str
    id: str
    pasta: Path
    dados: dict = field(default_factory=dict)

    @property
    def corpo(self) -> bool:
        return self.dados.get("tipo") == "corpo"


def listar_pecas(pecas: Path = PECAS) -> list[Peca]:
    """As peças, por autor (ordem alfabética) e id (ordem natural): a ordem em que o pacote as empacota."""
    lista: list[Peca] = []
    if not pecas.is_dir():
        return lista
    for pasta_autor in sorted(p for p in pecas.iterdir() if p.is_dir()):
        for pasta in sorted((p for p in pasta_autor.iterdir() if p.is_dir()), key=lambda p: natural(p.name)):
            arquivo = pasta / "peca.json"
            if not arquivo.is_file():
                continue
            dados = json.loads(arquivo.read_text(encoding="utf-8"))
            if dados.get("formato") != 1:
                raise ValueError(f"{arquivo}: formato {dados.get('formato')} desconhecido (esperado 1)")
            lista.append(Peca(pasta_autor.name, pasta.name, pasta, dados))
    return lista


def gravar_json(caminho: Path, dados) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    with open(caminho, "w", encoding="utf-8", newline="\n") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)
        f.write("\n")


def gravar_texto(caminho: Path, texto: str) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    with open(caminho, "w", encoding="utf-8", newline="\n") as f:
        f.write(texto)


def chave_ts(chave: str) -> str:
    """A chave como o Prettier a escreve num objeto: sem aspas quando é um identificador."""
    return chave if re.fullmatch(r"[A-Za-z_$][A-Za-z0-9_$]*", chave) else json.dumps(chave, ensure_ascii=False)
