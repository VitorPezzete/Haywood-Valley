"""Separar uma peça recortada em partes pintáveis pela cor, e as máscaras em cinza para recolorir.

Uma parte é uma **rampa** num lugar: os tons do mesmo matiz que fazem o degradê de um material (o tecido do
sofá, a madeira, o metal). O Aeko sombreia descendo para o preto e perdendo croma, quase sem girar o matiz
(ESTUDO_AEKO.md, seção 1), então ao longo de uma rampa o matiz fica e a razão croma / luminosidade fica
parecida; dois materiais de matiz parecido (o laranja do tecido e o marrom da madeira) se separam por essa
razão. O contorno (o preto 010000 e os quase pretos) é uma parte fixa, que não se pinta.

O agrupamento (palpite: não há gabarito de partes; conferido a olho nas prévias de estudo/recortes/):

1. Cada cor da peça vira um ponto em Lab: matiz h, croma C, s = log(croma / (L + 10)). Cores de croma abaixo
   de CROMA_NEUTRO são neutras (cinza, metal, branco).
2. Distância entre duas cores coloridas: √((corda / ESCALA_CORDA)² + (Δs / ESCALA_SAT)²), com a corda entre os
   matizes no croma médio geométrico (no escuro, de pouco croma, o matiz pesa menos, e abaixo de ESCURO_L de
   luminosidade pesa menos ainda: o Aeko gira o matiz da sombra mais escura); entre neutras, só a
   diferença de L; neutra com colorida, só se a colorida for quase neutra. Tons que se encostam muito na peça
   (o degradê de uma mesma superfície) ficam mais perto (AFINIDADE). Agrupamento aglomerativo com ligação média
   ponderada pelos pixels, até a distância passar de 1.
3. Cada grupo de cores se separa no espaço: pedaços distantes da mesma rampa (a moldura e o rosto do quadro)
   viram partes diferentes, a não ser que usem os tons na mesma proporção (as almofadas do sofá, separadas
   pelo contorno, continuam uma parte só). Pedaços pequenos ficam com o pedaço grande mais perto.
4. Parte com menos de MIN_PIXELS pixels (ou menos de 2 % da peça), ou além das MAX_PARTES maiores, não é
   pintável: fica na base.

A máscara segue as peças do Graal (`shared/graal.ts`): o jogo desenha a peça inteira (base.png) e, quando o
jogador escolhe uma cor para a parte, desenha por cima a máscara da parte com `ImageColor3` = a cor. O
`ImageColor3` multiplica a imagem pela cor, então a máscara guarda, em cinza, quanto cada pixel vale do tom
de referência da rampa (branco = a cor escolhida cheia, cinza = a sombra): g = (p · B) / (B · B), com B o tom
mais claro que tem pelo menos 5 % dos pixels da parte. Pintar a máscara com B devolve a peça quase igual (o
erro dessa volta está no json, em ΔE).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .folhas import PRETO

CROMA_NEUTRO = 7.0
ESCALA_CORDA = 12.0  # unidades de Lab na corda entre os matizes
ESCALA_SAT = 0.45
ESCALA_NEUTRO_L = 120.0  # os cinzas são uma rampa só (o metal do fogão vai do quase preto ao branco)
AFINIDADE = 0.5  # quanto a vizinhança aproxima dois tons
LIMIAR_GRUPO = 1.0  # distância máxima para juntar dois grupos de tons
SO_SOMBRA_L = 35.0  # grupo cujo tom claro fica abaixo disto é só sombra e pode entrar em qualquer rampa vizinha
LIGACAO = "simples"  # "simples" (a rampa é uma corrente de tons vizinhos) ou "media" (ponderada pelos pixels)
ESCURO_L = 45.0  # abaixo desta luminosidade, a diferença de matiz conta proporcionalmente menos
MIN_PIXELS = 6
MAX_PARTES = 6
MIN_PEDACO = 12  # pedaço separado no espaço que pode virar parte própria
FRACAO_PEDACO = 0.08
SEMELHANCA = 0.5  # interseção dos histogramas de tons para dois pedaços serem a mesma parte
LIMIAR_PRETO = 0x2C  # canal máximo abaixo disso é contorno (o mesmo de recorte.contorno_de)


def srgb_para_lab(rgb: np.ndarray) -> np.ndarray:
    c = rgb.astype(np.float64) / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]])
    xyz = c @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > (6 / 29) ** 3, np.cbrt(xyz), xyz / (3 * (6 / 29) ** 2) + 4 / 29)
    L = 116 * f[..., 1] - 16
    a = 500 * (f[..., 0] - f[..., 1])
    b = 200 * (f[..., 1] - f[..., 2])
    return np.stack([L, a, b], axis=-1)


def delta_e(rgb1: np.ndarray, rgb2: np.ndarray) -> np.ndarray:
    return np.linalg.norm(srgb_para_lab(rgb1) - srgb_para_lab(rgb2), axis=-1)


@dataclass
class Parte:
    n: int  # 1.. pintáveis; 0 o contorno; -1 as cores pequenas demais (ficam na base)
    pintavel: bool
    cores: list[int]  # 0xRRGGBB, do mais escuro para o mais claro
    pixels: int
    referencia: int  # o tom que a máscara põe em branco
    media: int  # a cor da rampa mais perto da média (em Lab, ponderada pelos pixels)
    mascara: np.ndarray | None = None  # (H, W, 4) uint8: cinza com alfa só nos pixels da parte
    erro_de: float = 0.0  # ΔE médio de pintar a máscara com a referência contra o original
    matiz: float | None = None

    def json(self, arquivo: str | None) -> dict:
        d = {
            "n": self.n,
            "pintavel": self.pintavel,
            "pixels": self.pixels,
            "cor_media": f"#{self.media:06x}",
            "referencia": f"#{self.referencia:06x}",
            "rampa": [f"#{c:06x}" for c in self.cores],
        }
        if self.matiz is not None:
            d["matiz"] = round(self.matiz)
        if arquivo:
            d["arquivo"] = arquivo
            d["erro_volta_de"] = round(self.erro_de, 2)
        return d


def _cluster(lab: np.ndarray, pesos: np.ndarray, vizinhanca: np.ndarray) -> list[list[int]]:
    """Agrupamento aglomerativo das cores (ligação simples: a rampa é uma corrente de tons); listas de índices.

    `vizinhanca[i, j]`: pares de pixels 4-vizinhos entre as duas cores, sobre os pixels da cor menos usada.
    """
    L, a, b = lab[:, 0], lab[:, 1], lab[:, 2]
    C = np.hypot(a, b)
    h = np.arctan2(b, a)
    s = np.log((C + 0.5) / (L + 10))
    neutro = C < CROMA_NEUTRO
    n = len(lab)

    def dist(i: int, j: int) -> float:
        if neutro[i] and neutro[j]:
            return abs(L[i] - L[j]) / ESCALA_NEUTRO_L
        if neutro[i] or neutro[j]:
            # um neutro só entra numa rampa colorida pelo lado escuro e pouco saturado dela
            k = j if neutro[i] else i
            return 1.5 if C[k] > 2.2 * CROMA_NEUTRO else abs(s[i] - s[j]) / ESCALA_SAT
        corda = 2 * np.sqrt(C[i] * C[j]) * abs(np.sin((h[i] - h[j]) / 2))
        # no escuro o Aeko gira o matiz da sombra (o roxo da coberta escurece para um vinho): pesa menos
        corda *= min(1.0, (min(L[i], L[j]) + 5) / ESCURO_L)
        return float(np.hypot(corda / ESCALA_CORDA, (s[i] - s[j]) / ESCALA_SAT))

    d = np.zeros((n, n))
    for i in range(n):
        for j in range(i + 1, n):
            d[i, j] = d[j, i] = dist(i, j) * (1 - AFINIDADE * min(1.0, vizinhanca[i, j]))

    def luz(g: list[int]) -> int:
        """O tom claro que dá a cor da rampa: o mais claro com pelo menos 5 % dos pixels do grupo."""
        tot = pesos[g].sum()
        bons = [i for i in g if pesos[i] >= 0.05 * tot] or g
        return max(bons, key=lambda i: L[i])

    grupos = [[i] for i in range(n)]
    while len(grupos) > 1:
        luzes = [luz(g) for g in grupos]
        melhor = (0, 0, 9e9)
        for x in range(len(grupos)):
            for y in range(x + 1, len(grupos)):
                gx, gy = grupos[x], grupos[y]
                lx, ly = luzes[x], luzes[y]
                # a corrente de tons não junta duas rampas de cor diferente (a madeira e as maçãs do caixote): os
                # tons claros dos dois grupos têm de combinar, a não ser que um deles seja só sombra
                if min(L[lx], L[ly]) >= SO_SOMBRA_L and dist(lx, ly) > 1.0:
                    continue
                bloco = d[np.ix_(gx, gy)]
                if LIGACAO == "simples":
                    v = float(bloco.min())
                else:
                    w = np.outer(pesos[gx], pesos[gy])
                    v = float((bloco * w).sum() / w.sum())
                if v < melhor[2]:
                    melhor = (x, y, v)
        x, y, v = melhor
        if v > LIMIAR_GRUPO:
            break
        grupos[x] = grupos[x] + grupos[y]
        del grupos[y]
    return grupos


def _componentes8(m: np.ndarray) -> tuple[np.ndarray, int]:
    h, w = m.shape
    rot = np.zeros((h, w), dtype=np.int32)
    n = 0
    for y0 in range(h):
        for x0 in range(w):
            if not m[y0, x0] or rot[y0, x0]:
                continue
            n += 1
            rot[y0, x0] = n
            pilha = [(y0, x0)]
            while pilha:
                y, x = pilha.pop()
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        yy, xx = y + dy, x + dx
                        if 0 <= yy < h and 0 <= xx < w and m[yy, xx] and not rot[yy, xx]:
                            rot[yy, xx] = n
                            pilha.append((yy, xx))
    return rot, n


def _regioes(idx: np.ndarray, grupo: list[int], ncores: int) -> list[np.ndarray]:
    """As regiões de um grupo de cores (passo 3 do agrupamento)."""
    m = np.isin(idx, grupo)
    rot, n = _componentes8(m)
    if n <= 1:
        return [m]
    tam = np.bincount(rot.ravel(), minlength=n + 1)
    total = int(m.sum())
    grandes = [r for r in range(1, n + 1) if tam[r] >= max(MIN_PEDACO, FRACAO_PEDACO * total)]
    if len(grandes) <= 1:
        return [m]
    ys, xs = np.mgrid[0 : m.shape[0], 0 : m.shape[1]]
    centros = {r: (ys[rot == r].mean(), xs[rot == r].mean()) for r in range(1, n + 1)}
    dono = {r: r for r in grandes}
    for r in range(1, n + 1):
        if r not in dono:
            cy, cx = centros[r]
            dono[r] = min(grandes, key=lambda g: (centros[g][0] - cy) ** 2 + (centros[g][1] - cx) ** 2)
    hist = {}
    for g in grandes:
        sel = np.isin(rot, [r for r in range(1, n + 1) if dono[r] == g])
        hgr = np.bincount(idx[sel], minlength=ncores).astype(np.float64)
        hist[g] = (hgr / hgr.sum(), sel)
    pai = {g: g for g in grandes}

    def raiz(g):
        while pai[g] != g:
            g = pai[g]
        return g

    for i, g1 in enumerate(grandes):
        for g2 in grandes[i + 1 :]:
            if np.minimum(hist[g1][0], hist[g2][0]).sum() >= SEMELHANCA:
                pai[raiz(g2)] = raiz(g1)
    saida: dict[int, np.ndarray] = {}
    for g in grandes:
        r = raiz(g)
        saida[r] = saida.get(r, np.zeros_like(m)) | hist[g][1]
    return list(saida.values())


def separar(rgba: np.ndarray) -> list[Parte]:
    """As partes de uma peça recortada: [contorno, parte 1, parte 2, …, fixas] (as pintáveis por tamanho)."""
    op = rgba[..., 3] > 0
    k = (rgba[..., 0].astype(np.int32) << 16) | (rgba[..., 1].astype(np.int32) << 8) | rgba[..., 2]
    preto = op & ((rgba[..., :3].max(axis=2) < LIMIAR_PRETO) | (k == PRETO))
    colorido = op & ~preto
    cores, inv, contas = np.unique(k[colorido], return_inverse=True, return_counts=True)
    idx = np.full(k.shape, -1, dtype=np.int64)
    idx[colorido] = inv.ravel()
    total = int(op.sum())
    partes: list[Parte] = [Parte(0, False, [int(c) for c in np.unique(k[preto])], int(preto.sum()), PRETO, PRETO)]
    if len(cores) == 0:
        return partes

    nc = len(cores)
    viz = np.zeros((nc, nc))
    for a_, b_ in ((idx[:, :-1], idx[:, 1:]), (idx[:-1, :], idx[1:, :])):
        ok = (a_ >= 0) & (b_ >= 0) & (a_ != b_)
        np.add.at(viz, (a_[ok], b_[ok]), 1)
    viz = (viz + viz.T) / np.maximum(np.minimum.outer(contas, contas).astype(np.float64), 1)

    rgb = np.stack([(cores >> 16) & 255, (cores >> 8) & 255, cores & 255], axis=-1)
    lab = srgb_para_lab(rgb)
    regioes = [m for g in _cluster(lab, contas.astype(np.float64), viz) for m in _regioes(idx, g, nc)]
    regioes.sort(key=lambda m: -int(m.sum()))

    n = 0
    fixo = np.zeros(k.shape, dtype=bool)
    p = rgba[..., :3].astype(np.float64)
    for dentro in regioes:
        px = int(dentro.sum())
        if not (px >= MIN_PIXELS and px >= 0.02 * total and n < MAX_PARTES):
            fixo |= dentro
            continue
        usados, quantos = np.unique(idx[dentro], return_counts=True)
        ordem = sorted(range(len(usados)), key=lambda i: lab[usados[i], 0])
        media_lab = (lab[usados] * quantos[:, None]).sum(axis=0) / px
        perto = usados[int(np.argmin(np.linalg.norm(lab[usados] - media_lab, axis=1)))]
        candidatos = [i for i in ordem if quantos[i] >= 0.05 * px] or ordem
        ref = usados[candidatos[-1]]
        C = float(np.hypot(*media_lab[1:]))
        matiz = float(np.degrees(np.arctan2(media_lab[2], media_lab[1])) % 360) if C >= CROMA_NEUTRO else None
        n += 1
        parte = Parte(n, True, [int(cores[usados[i]]) for i in ordem], px, int(cores[ref]), int(cores[perto]), matiz=matiz)
        B = rgb[ref].astype(np.float64)
        cinza = np.round(np.clip((p @ B) / float(B @ B), 0, 1) * 255).astype(np.uint8)
        mascara = np.zeros(rgba.shape, dtype=np.uint8)
        for canal in range(3):
            mascara[..., canal] = np.where(dentro, cinza, 0)
        mascara[..., 3] = np.where(dentro, 255, 0)
        parte.mascara = mascara
        volta = np.round(cinza[dentro, None].astype(np.float64) / 255 * B[None]).clip(0, 255)
        parte.erro_de = float(delta_e(volta, rgba[..., :3][dentro]).mean())
        partes.append(parte)
    if fixo.any():
        fk = sorted(int(c) for c in np.unique(k[fixo]))
        partes.append(Parte(-1, False, fk, int(fixo.sum()), fk[0], fk[0]))
    return partes


def pintar(rgba: np.ndarray, partes: list[Parte], cores: dict[int, tuple[int, int, int]]) -> np.ndarray:
    """O que o jogo mostra: a base e, por cima, a máscara de cada parte com cor escolhida × a cor."""
    saida = rgba.copy()
    for parte in partes:
        if parte.mascara is None or parte.n not in cores:
            continue
        m = parte.mascara
        dentro = m[..., 3] > 0
        cor = np.array(cores[parte.n], dtype=np.float64)
        saida[dentro, :3] = np.round(m[dentro, :3].astype(np.float64) / 255 * cor).clip(0, 255).astype(np.uint8)
    return saida
