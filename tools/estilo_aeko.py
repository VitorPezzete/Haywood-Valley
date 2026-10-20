"""Recolore uma peça do estilo original para o estilo do Aeko (reconstrução de 2026-10-20).

A ferramenta original se perdeu na formatação. Esta foi refeita a partir do que sobrou: as 72 folhas no
estilo do Aeko (o resultado dela, o gabarito), as 72 no estilo original (a entrada, casadas célula a célula)
e os textos de graalData.ts e graalDataOriginal.ts, que dizem onde fica cada camada de cada peça e a cor base
de cada parte. O que a ferramenta antiga fazia foi deduzido medindo as duas folhas (docs/arte/ESTUDO_AEKO.md
tem os números); onde a dedução não fecha, está marcado como palpite.

O que se mediu no gabarito, e o que esta versão faz:

1. **Contorno preto.** Todo pixel opaco que encosta na transparência vira preto (97 % deles no gabarito), e
   os pixels fora das máscaras das partes (o "resto": o contorno que o contribuidor pintou na cor escura da
   parte) viram preto quando são escuros (canal máximo abaixo de LIMIAR_PRETO_RESTO). O preto do Aeko é
   010000, não 000000 (a ferramenta antiga passava as cores por Lab e voltava; o 1 no vermelho é o
   arredondamento). O alfa não muda em nenhum pixel.
2. **Menos tons por parte.** Cada parte pintável (pele, cabelo, olhos, enfeites, partes da roupa, delimitadas
   pelas máscaras h/s/e/d/c da própria peça) perde metade dos tons: de 6 a 9 tons no original para 3 a 4
   no Aeko, com degraus de uns 8 de L (Lab) entre eles. Os tons que se fundem viram a média (ponderada pelos
   pixels) em Lab. Aqui a fusão é em dois passos: os tons da parte se separam em famílias de matiz (corda
   entre os ângulos de (a, b) no croma médio geométrico, FAMILIA_AB: os lábios e as sobrancelhas não entram na
   rampa da pele) e, dentro de cada família, a escala de L se parte em K classes pela partição ótima em 1-D
   (Jenks), com K = round(amplitude de L / DEGRAU do tipo) + 1 — degrau 7 no cabelo, 26 na pele (no gabarito a
   pele vira 3 tons largos: sombra, meio e luz), 9 nos olhos, enfeites e roupa. O critério exato da ferramenta
   antiga não foi recuperado (palpite): nenhum limiar simples (ΔL, ΔE, RGB) explica todas as fusões do
   gabarito, duas cabeças iguais em forma e degraus (aly1pink-4, aly1green-3) saíram com 1 e 3 tons de cabelo,
   e os quantizadores do Pillow (median cut, octree, max coverage) tampouco reproduzem. Um Ward normalizado
   em Lab foi tentado antes e saiu pior.
3. **Contraste e croma.** Depois da fusão, o cabelo tem o contraste de L ampliado em 10 % em torno da média
   da parte (AJUSTE); o croma de cada tom é multiplicado conforme o L dele (CROMA_POR_L): a pele escura ganha
   20 %, os olhos claros perdem 10 %, o cabelo claro ganha 5 %. O croma médio geral não muda.
4. **Resto intocado.** Os pixels fora das máscaras que não viram preto ficam como estão (no gabarito a
   diferença média deles é 0,3 de ΔE: nada).
5. **Sem paleta fixa.** A ferramenta antiga NÃO encaixava as cores na paleta dos tiles do Aeko: nenhuma das
   cores das peças no estilo Aeko aparece nos tiles (só o preto), e a projeção da mudança de cor na direção
   da cor mais próxima da paleta dá zero. "Estilo Aeko" é, nas peças, a redução de tons com contorno preto,
   não a paleta das casas e do castelo.

Uso:
    python -I tools/estilo_aeko.py <id da peça> [<id>...]   recolore e grava estudo/recoloridas/<autor>/<id>.png
    python -I tools/estilo_aeko.py --todas                  todas as peças
    python -I tools/estilo_aeko.py --listar [autor]         os ids
Opções: --artes <pasta> (as folhas graal.<estilo>.<n>.png; padrão: a pasta recuperada), --saida <pasta>,
        --gabarito (grava ao lado o f do estilo Aeko que sobreviveu, para comparar a olho).

O PNG gravado é a camada f (a peça inteira) no estilo do Aeko, com as células do bloco lado a lado (cabeça:
5 ou 8 células; corpo: 22 linhas × 4). As máscaras das partes (h, s, e, d, c) não mudam com o estilo além do
que o pacote regenera a partir do f, então não são gravadas aqui.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
SRC = RAIZ / "src" / "shared"
ARTES_RECUPERADAS = Path(r"C:\Users\Szortek\Documents\Haywood-Valley-recuperado\artes")
SAIDA_PADRAO = RAIZ / "estudo" / "recoloridas"

CELULA = 32
COLUNAS = 32
CABECA_CELULAS = 5
CABECA_PISCADA = 8
CABECA_TOPO = 4  # a vista de cima; depois dela vêm as 3 células de olho fechado (esquerda, baixo, direita)
CORPO_CELULAS = 88
ESTILOS = ("aeko", "original")

# A ordem em que as máscaras disputam um pixel coberto por mais de uma: a menor parte ganha.
PRIORIDADE = {"e": 0, "d": 1, "h": 2, "s": 3, "c": 4}
PRETO = np.array([1, 0, 0], np.uint8)

# Os parâmetros ajustados contra o gabarito (tools/comparar_estilos.py; a evolução está em ESTUDO_AEKO.md).
PARAMETROS = {
    "limiar_preto_resto": 40,  # canal máximo (0-255) abaixo do qual um pixel do resto vira contorno preto
    "preto_na_parte": 0,  # canal máximo abaixo do qual um pixel de uma parte encostado no resto escuro vira preto (0 desliga; piorava)
    "borda_da_celula": "",  # beiradas da célula que contam como transparência (letras c, b, e, d); nenhuma saiu melhor
    # o croma de cada tom multiplicado conforme o L do tom (pontos (L, fator), interpolados): no gabarito a pele
    # escura fica 20 % mais saturada e os olhos claros perdem 10 %
    "croma_por_l": {
        "s": [(20, 1.0), (30, 1.2), (45, 1.21), (55, 1.11), (65, 1.06), (75, 1.0), (85, 0.99), (95, 0.9)],
        "e": [(30, 1.0), (40, 1.03), (50, 1.0), (65, 0.98), (75, 0.9), (85, 0.96), (95, 1.0)],
        "h": [(50, 1.0), (65, 1.05), (75, 1.07), (85, 1.0)],
    },
    "familia_ab": 20.0,  # tons com corda de matiz (em (a, b) de Lab, no croma médio geométrico) maior que isto são de famílias diferentes
    "minimo_familia": 0.0,  # fração dos pixels da parte abaixo da qual um tom não conta para a amplitude de L
    # o degrau de L entre os tons de cada tipo de parte: K = round(amplitude / degrau) + 1
    "degrau": {"h": 7.0, "s": 26.0, "e": 9.0, "d": 9.0, "c": 9.0},
    "tons_maximo": 6,
    # ajustes lineares por tipo de parte: L' = Lp + alfa·(L − Lp) + lambda; C' = beta·C + gama + delta·(L − Lp)
    "ajuste": {
        "h": (1.10, 0.0, 1.0, 0.0, 0.0),
        "s": (1.00, 0.0, 1.0, 0.0, 0.0),
        "e": (1.00, 0.0, 1.0, 0.0, 0.0),
        "d": (1.00, 0.0, 1.0, 0.0, 0.0),
        "c": (1.00, 0.0, 1.0, 0.0, 0.0),
    },
}


# --- Lab ---------------------------------------------------------------------------------------------


def srgb_para_lab(rgb) -> np.ndarray:
    """sRGB (0-255, qualquer forma [..., 3]) → CIELAB D65."""
    rgb = np.asarray(rgb, np.float64) / 255.0
    lin = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]])
    xyz = lin @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    lum = 116 * f[..., 1] - 16
    a = 500 * (f[..., 0] - f[..., 1])
    b = 200 * (f[..., 1] - f[..., 2])
    return np.stack([lum, a, b], -1)


def lab_para_srgb(lab) -> np.ndarray:
    """CIELAB D65 → sRGB 0-255 arredondado (uint8)."""
    lab = np.asarray(lab, np.float64)
    fy = (lab[..., 0] + 16) / 116
    fx = fy + lab[..., 1] / 500
    fz = fy - lab[..., 2] / 200
    f = np.stack([fx, fy, fz], -1)
    xyz = np.where(f**3 > 0.008856, f**3, (f - 16 / 116) / 7.787) * np.array([0.95047, 1.0, 1.08883])
    m = np.array([[3.2404542, -1.5371385, -0.4985314], [-0.9692660, 1.8760108, 0.0415560], [0.0556434, -0.2040259, 1.0572252]])
    lin = np.clip(xyz @ m.T, 0, 1)
    rgb = np.where(lin <= 0.0031308, 12.92 * lin, 1.055 * lin ** (1 / 2.4) - 0.055)
    return np.clip(np.rint(rgb * 255), 0, 255).astype(np.uint8)


def hexa(rgb) -> str:
    return "%02X%02X%02X" % tuple(int(v) for v in rgb[:3])


# --- os dados das peças (graalData.ts e graalDataOriginal.ts) ------------------------------------------


@dataclass
class Camada:
    codigo: str  # f, h, s, e, d0.., c0..
    folha: int
    celula: int
    piscada: bool

    @property
    def parte(self) -> str:
        """A parte que a máscara pinta: o código inteiro (d0, c1) ou a letra (h, s, e)."""
        return self.codigo


@dataclass
class Peca:
    id: str
    autor: str
    tipo: str  # cabeca | corpo
    genero: str
    camadas: list[Camada]  # estilo Aeko (graalData.ts)
    camadas_original: list[Camada]  # as mesmas, com as trocas de GRAAL_LAYERS_ORIGINAL
    bases: dict[str, dict[str, str]] = field(default_factory=dict)  # estilo → parte → RRGGBB
    tipos_roupa: list[str] = field(default_factory=list)

    @property
    def corpo(self) -> bool:
        return self.tipo == "corpo"

    def celulas(self, camada: Camada) -> int:
        if self.corpo:
            return CORPO_CELULAS
        return CABECA_PISCADA if camada.piscada else CABECA_CELULAS

    def camadas_de(self, estilo: str) -> list[Camada]:
        return self.camadas_original if estilo == "original" else self.camadas


def _ler_lista_ts(texto: str, nome: str) -> list[str]:
    m = re.search(re.escape(nome) + r": readonly string\[\] = \[(.*?)\];", texto, re.S)
    if not m:
        raise ValueError(f"{nome} não encontrado")
    return json.loads("[" + m.group(1) + "]")


def _ler_registro_ts(texto: str, nome: str) -> dict[str, str]:
    m = re.search(re.escape(nome) + r": Readonly<Record<string, string>> = \{\n(.*?)\};", texto, re.S)
    if not m:
        raise ValueError(f"{nome} não encontrado")
    saida: dict[str, str] = {}
    for linha in m.group(1).splitlines():
        mm = re.fullmatch(r'\t(?:"((?:[^"\\]|\\.)*)"|([^":]+)): "((?:[^"\\]|\\.)*)",', linha)
        if mm:
            chave = json.loads('"' + mm.group(1) + '"') if mm.group(1) is not None else mm.group(2)
            saida[chave] = json.loads('"' + mm.group(3) + '"')
    return saida


def _camadas(texto: str) -> list[Camada]:
    saida = []
    for parte in texto.split(";"):
        if not parte:
            continue
        campos = parte.split(":")
        saida.append(Camada(campos[0], int(campos[1]), int(campos[2]), len(campos) > 3 and campos[3] == "1"))
    return saida


def _cores(texto: str) -> list[str]:
    return [c for c in texto.split(",") if c] if texto else []


def _bases_cabeca(pele: str, cabelo: str, olhos: str, detalhes: str) -> dict[str, str]:
    bases = {}
    if pele:
        bases["s"] = pele
    if cabelo:
        bases["h"] = cabelo
    if olhos:
        bases["e"] = olhos
    for i, cor in enumerate(_cores(detalhes)):
        bases[f"d{i}"] = cor
    return bases


def _bases_corpo(pele: str, roupa: str) -> dict[str, str]:
    bases = {}
    if pele:
        bases["s"] = pele
    for i, cor in enumerate(_cores(roupa)):
        bases[f"c{i}"] = cor
    return bases


def _trocar(camadas: list[Camada], trocas: str | None) -> list[Camada]:
    if not trocas:
        return list(camadas)
    novas = list(camadas)
    for troca in _camadas(trocas):
        for i, c in enumerate(novas):
            if c.codigo == troca.codigo:
                novas[i] = troca
                break
    return novas


def ler_pecas(src: Path = SRC) -> list[Peca]:
    """As 947 peças (840 cabeças e 107 corpos), na ordem de graalData.ts."""
    dados = (src / "graalData.ts").read_text(encoding="utf8")
    original = (src / "graalDataOriginal.ts").read_text(encoding="utf8")
    cabecas_o = _ler_registro_ts(original, "GRAAL_HEADS_ORIGINAL")
    corpos_o = _ler_registro_ts(original, "GRAAL_BODIES_ORIGINAL")
    trocas_o = _ler_registro_ts(original, "GRAAL_LAYERS_ORIGINAL")
    pecas = []
    for texto in _ler_lista_ts(dados, "GRAAL_HEADS"):
        pid, autor, genero, _topo, pele, cabelo, olhos, detalhes, camadas = texto.split("|")
        bases = {"aeko": _bases_cabeca(pele, cabelo, olhos, detalhes)}
        if pid in cabecas_o:
            _t, pele, cabelo, olhos, detalhes = cabecas_o[pid].split("|")
        bases["original"] = _bases_cabeca(pele, cabelo, olhos, detalhes)
        lista = _camadas(camadas)
        pecas.append(Peca(pid, autor, "cabeca", genero, lista, _trocar(lista, trocas_o.get(pid)), bases))
    for texto in _ler_lista_ts(dados, "GRAAL_BODIES"):
        campos = texto.split("|")
        pid, autor, genero, pele, roupa = campos[:5]
        tipos = campos[5].split(",") if len(campos) >= 7 and campos[5] else []
        camadas = campos[6] if len(campos) >= 7 else campos[5]
        bases = {"aeko": _bases_corpo(pele, roupa)}
        if pid in corpos_o:
            pele, roupa = corpos_o[pid].split("|")
        bases["original"] = _bases_corpo(pele, roupa)
        lista = _camadas(camadas)
        pecas.append(Peca(pid, autor, "corpo", genero, lista, _trocar(lista, trocas_o.get(pid)), bases, tipos))
    return pecas


# --- as folhas ---------------------------------------------------------------------------------------


class Folhas:
    """As folhas dos dois estilos, lidas quando pedidas. `padrao` tem {estilo} e {n}."""

    def __init__(self, pasta: Path = ARTES_RECUPERADAS, padrao: str = "graal.{estilo}.{n}.png"):
        self.pasta = Path(pasta)
        self.padrao = padrao
        self._cache: dict[tuple[str, int], np.ndarray] = {}

    def folha(self, estilo: str, n: int) -> np.ndarray:
        chave = (estilo, n)
        if chave not in self._cache:
            caminho = self.pasta / self.padrao.format(estilo=estilo, n=n)
            self._cache[chave] = np.array(Image.open(caminho).convert("RGBA"))
        return self._cache[chave]

    def bloco(self, estilo: str, camada: Camada, n: int) -> np.ndarray:
        """As n células do bloco, empilhadas: (n*32, 32, 4)."""
        folha = self.folha(estilo, camada.folha)
        celulas = []
        for i in range(n):
            c = camada.celula + i
            x, y = (c % COLUNAS) * CELULA, (c // COLUNAS) * CELULA
            celulas.append(folha[y : y + CELULA, x : x + CELULA])
        return np.concatenate(celulas, 0)


def bloco_para_imagem(bloco: np.ndarray, corpo: bool) -> Image.Image:
    """O bloco empilhado como imagem: cabeça deitada (32·N × 32), corpo em 22 linhas × 4 (128 × 704)."""
    n = bloco.shape[0] // CELULA
    celulas = [bloco[i * CELULA : (i + 1) * CELULA] for i in range(n)]
    if corpo:
        linhas = [np.concatenate(celulas[i : i + 4], 1) for i in range(0, n, 4)]
        return Image.fromarray(np.concatenate(linhas, 0))
    return Image.fromarray(np.concatenate(celulas, 1))


# --- a peça com as partes --------------------------------------------------------------------------


@dataclass
class PecaImagem:
    peca: Peca
    estilo: str
    f: np.ndarray  # (n*32, 32, 4): a peça inteira
    partes: np.ndarray  # (n*32, 32) str: a parte de cada pixel ('r' = resto, fora de toda máscara)
    mascaras: dict[str, np.ndarray]  # parte → alfa (n*32, 32) uint8, do tamanho de f


def montar(peca: Peca, folhas: Folhas, estilo: str) -> PecaImagem:
    """A camada f da peça no estilo pedido e o mapa de partes tirado das máscaras desse estilo."""
    camadas = peca.camadas_de(estilo)
    f_camada = next(c for c in camadas if c.codigo == "f")
    n = peca.celulas(f_camada)
    f = folhas.bloco(estilo, f_camada, n)
    partes = np.full(f.shape[:2], "r", dtype="<U2")
    mascaras: dict[str, np.ndarray] = {}
    outras = [c for c in camadas if c.codigo != "f"]
    # a menor prioridade pinta primeiro, para a maior ficar por cima
    for camada in sorted(outras, key=lambda c: -PRIORIDADE.get(c.codigo[0], 9)):
        m = folhas.bloco(estilo, camada, peca.celulas(camada))
        alfa = np.zeros(f.shape[:2], np.uint8)
        k = min(n, m.shape[0] // CELULA)
        alfa[: k * CELULA] = m[: k * CELULA, :, 3]
        if not peca.corpo and n == CABECA_PISCADA and m.shape[0] // CELULA == CABECA_CELULAS:
            # as células de olho fechado usam a máscara da direção (esquerda, baixo, direita)
            for i in range(1, 4):
                alfa[(CABECA_TOPO + i) * CELULA : (CABECA_TOPO + i + 1) * CELULA] = m[i * CELULA : (i + 1) * CELULA, :, 3]
        mascaras[camada.parte] = alfa
        partes[alfa > 0] = camada.parte
    partes[f[..., 3] == 0] = ""
    return PecaImagem(peca, estilo, f, partes, mascaras)


# --- a recolorização ---------------------------------------------------------------------------------


def _vizinhos_4(m: np.ndarray, borda: str) -> np.ndarray:
    """
    Se cada pixel tem os 4 vizinhos em m. `borda` diz quais beiradas da célula contam como transparência
    (letras c, b, e, d: cima, baixo, esquerda, direita); as outras contam como dentro. No gabarito, a cabeça
    que encosta no alto da célula ganha contorno ali, mas o pescoço cortado embaixo não.
    """
    n = m.shape[0] // CELULA
    saida = np.zeros_like(m)
    for i in range(n):
        cel = m[i * CELULA : (i + 1) * CELULA]
        p = np.pad(cel, 1, constant_values=True)
        if "c" in borda:
            p[0, :] = False
        if "b" in borda:
            p[-1, :] = False
        if "e" in borda:
            p[:, 0] = False
        if "d" in borda:
            p[:, -1] = False
        saida[i * CELULA : (i + 1) * CELULA] = p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]
    return saida


def _fator_de_croma(tipo: str, lum: float, p: dict) -> float:
    """O multiplicador do croma do tipo de parte no L dado, interpolado na tabela CROMA_POR_L."""
    tabela = p["croma_por_l"].get(tipo)
    if not tabela:
        return 1.0
    xs = np.array([x for x, _ in tabela], float)
    ys = np.array([y for _, y in tabela], float)
    return float(np.interp(lum, xs, ys))


def _distancia_de_matiz(c1: np.ndarray, c2: np.ndarray) -> np.ndarray:
    """
    Distância entre matizes (vetores (a, b) de Lab, formas [n, 2] e [m, 2] → [n, m]): a corda entre os dois
    ângulos no croma médio geométrico. Dois tons do mesmo matiz dão zero mesmo com cromas diferentes (uma
    rampa escurece saturando), e tons quase cinza ficam perto de tudo.
    """
    h1 = np.arctan2(c1[:, 1], c1[:, 0])[:, None]
    h2 = np.arctan2(c2[:, 1], c2[:, 0])[None, :]
    croma = np.sqrt(np.hypot(c1[:, 0], c1[:, 1])[:, None] * np.hypot(c2[:, 0], c2[:, 1])[None, :])
    return 2 * croma * np.abs(np.sin((h1 - h2) / 2))


def _familias(ab: np.ndarray, pesos: np.ndarray, limiar: float) -> np.ndarray:
    """Agrupa os tons pelo matiz (a, b de Lab), por aglomeração com centróides ponderados."""
    n = len(ab)
    grupos = {i: ([i], pesos[i], ab[i].copy()) for i in range(n)}
    while len(grupos) > 1:
        ids = list(grupos)
        centros = np.array([grupos[i][2] for i in ids])
        d = _distancia_de_matiz(centros, centros)
        np.fill_diagonal(d, np.inf)
        k = int(d.argmin())
        i, j = divmod(k, len(ids))
        if d[i, j] >= limiar:
            break
        a, b = grupos.pop(ids[i]), grupos.pop(ids[j])
        peso = a[1] + b[1]
        grupos[ids[i]] = (a[0] + b[0], peso, (a[2] * a[1] + b[2] * b[1]) / peso)
    rotulos = np.zeros(n, int)
    for g, (tons, _p, _c) in enumerate(grupos.values()):
        rotulos[tons] = g
    return rotulos


def _jenks(valores: np.ndarray, pesos: np.ndarray, k: int) -> np.ndarray:
    """Partição ótima em 1-D (soma ponderada dos quadrados, "natural breaks") de valores ordenados em k classes."""
    n = len(valores)
    if k >= n:
        return np.arange(n)
    cw = np.concatenate([[0.0], np.cumsum(pesos)])
    cx = np.concatenate([[0.0], np.cumsum(pesos * valores)])
    cxx = np.concatenate([[0.0], np.cumsum(pesos * valores**2)])

    def custo(i: int, j: int) -> float:
        w = cw[j] - cw[i]
        x = cx[j] - cx[i]
        return (cxx[j] - cxx[i]) - x * x / w if w > 0 else 0.0

    inf = float("inf")
    dp = np.full((k + 1, n + 1), inf)
    arg = np.zeros((k + 1, n + 1), int)
    dp[0, 0] = 0.0
    for c in range(1, k + 1):
        for j in range(1, n + 1):
            melhor, onde = inf, 0
            for i in range(c - 1, j):
                v = dp[c - 1, i] + custo(i, j)
                if v < melhor:
                    melhor, onde = v, i
            dp[c, j] = melhor
            arg[c, j] = onde
    rotulos = np.zeros(n, int)
    j = n
    for c in range(k, 0, -1):
        i = arg[c, j]
        rotulos[i:j] = c - 1
        j = i
    return rotulos


def _fundir_tons(lab: np.ndarray, pesos: np.ndarray, tipo: str, p: dict) -> np.ndarray:
    """
    Reduz os tons de uma parte: separa as famílias de matiz e, dentro de cada uma, parte a escala de L em
    K classes (K = round(amplitude de L / degrau do tipo) + 1, contando só os tons com pixels suficientes).
    Devolve o rótulo de cada tom.
    """
    familias = _familias(lab[:, 1:], pesos, p["familia_ab"]) if len(lab) > 1 else np.zeros(1, int)
    rotulos = np.zeros(len(lab), int)
    proximo = 0
    degrau = p["degrau"].get(tipo, 9.0)
    for fam in np.unique(familias):
        idx = np.flatnonzero(familias == fam)
        lum = lab[idx, 0]
        w = pesos[idx]
        grandes = w >= p["minimo_familia"] * pesos.sum()
        amplitude = float(lum[grandes].max() - lum[grandes].min()) if grandes.sum() >= 2 else 0.0
        k = int(np.clip(round(amplitude / degrau) + 1, 1, p["tons_maximo"]))
        ordem = np.argsort(lum)
        classes = _jenks(lum[ordem], w[ordem], k)
        rotulos[idx[ordem]] = proximo + classes
        proximo += classes.max() + 1
    return rotulos


def recolorir(imagem: PecaImagem, parametros: dict | None = None) -> np.ndarray:
    """A camada f no estilo do Aeko (RGBA, mesma forma e mesmo alfa)."""
    p = dict(PARAMETROS)
    if parametros:
        p.update(parametros)
    f = imagem.f
    partes = imagem.partes
    opaco = f[..., 3] > 0
    rgb = f[..., :3]
    maximo = rgb.max(-1).astype(int)
    saida = f.copy()

    # 1. o contorno
    dentro = _vizinhos_4(opaco, p["borda_da_celula"])
    preto = opaco & ~dentro
    resto = opaco & (partes == "r")
    preto |= resto & (maximo < p["limiar_preto_resto"])
    # pixel muito escuro de uma parte, encostado num pixel do resto escuro: é o risco do contorno que a
    # máscara pegou (palpite; ajuda pouco)
    if p["preto_na_parte"] > 0:
        escuro_resto = resto & (maximo < p["limiar_preto_resto"])
        pr = np.pad(escuro_resto, 1)
        encosta = pr[:-2, 1:-1] | pr[2:, 1:-1] | pr[1:-1, :-2] | pr[1:-1, 2:]
        preto |= opaco & (partes != "r") & (maximo < p["preto_na_parte"]) & encosta
    saida[preto, :3] = PRETO

    # 2. os tons de cada parte
    for parte in np.unique(partes[opaco & ~preto]):
        if parte == "r" or parte == "":
            continue
        m = opaco & ~preto & (partes == parte)
        pixels = rgb[m]
        cores, inversa, contagem = np.unique(pixels, axis=0, return_inverse=True, return_counts=True)
        if len(cores) == 0:
            continue
        lab = srgb_para_lab(cores)
        pesos = contagem.astype(np.float64)
        tipo = parte[0]
        rotulos = _fundir_tons(lab, pesos, tipo, p)
        alfa, lamb, beta, gama, delta = p["ajuste"].get(tipo, (1.0, 0.0, 1.0, 0.0, 0.0))
        media_l = np.average(lab[:, 0], weights=pesos)
        novas = np.zeros_like(lab)
        for g in np.unique(rotulos):
            sel = rotulos == g
            centro = np.average(lab[sel], axis=0, weights=pesos[sel])
            relativo = centro[0] - media_l
            croma = float(np.hypot(centro[1], centro[2]))
            if croma > 1e-6:
                fator = max(0.0, beta * croma + gama + delta * relativo) / croma
                centro[1:] *= fator * _fator_de_croma(tipo, float(centro[0]), p)
            centro[0] = media_l + alfa * relativo + lamb
            novas[sel] = centro
        novas_rgb = lab_para_srgb(novas)
        saida[m, :3] = novas_rgb[inversa.ravel()]
    return saida


# --- linha de comando --------------------------------------------------------------------------------


def main() -> int:
    ap = argparse.ArgumentParser(description="Recolore peças do estilo original para o estilo do Aeko.")
    ap.add_argument("ids", nargs="*", help="ids das peças")
    ap.add_argument("--todas", action="store_true")
    ap.add_argument("--listar", nargs="?", const="", metavar="AUTOR")
    ap.add_argument("--artes", type=Path, default=ARTES_RECUPERADAS, help="pasta das folhas graal.<estilo>.<n>.png")
    ap.add_argument("--padrao", default="graal.{estilo}.{n}.png", help="nome das folhas, com {estilo} e {n}")
    ap.add_argument("--saida", type=Path, default=SAIDA_PADRAO)
    ap.add_argument("--gabarito", action="store_true", help="grava também o f do estilo Aeko que sobreviveu")
    args = ap.parse_args()

    pecas = ler_pecas()
    if args.listar is not None:
        for peca in pecas:
            if not args.listar or peca.autor == args.listar:
                print(f"{peca.id}\t{peca.autor}\t{peca.tipo}")
        return 0
    escolhidas = pecas if args.todas else [p for p in pecas if p.id in set(args.ids)]
    if not escolhidas:
        ap.error("nenhuma peça escolhida (use ids, --todas ou --listar)")
    folhas = Folhas(args.artes, args.padrao)
    for peca in escolhidas:
        imagem = montar(peca, folhas, "original")
        saida = recolorir(imagem)
        pasta = args.saida / peca.autor
        pasta.mkdir(parents=True, exist_ok=True)
        bloco_para_imagem(saida, peca.corpo).save(pasta / f"{peca.id}.png")
        if args.gabarito:
            bloco_para_imagem(montar(peca, folhas, "aeko").f, peca.corpo).save(pasta / f"{peca.id}.gabarito.png")
        print(f"{peca.autor}/{peca.id}.png")
    return 0


if __name__ == "__main__":
    sys.exit(main())
