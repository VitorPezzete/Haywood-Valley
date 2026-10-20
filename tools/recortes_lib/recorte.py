"""Tirar uma peça do fundo, pixel a pixel.

O Aeko desenhou cada peça por cima de um chão ou de uma parede que existem "limpos" em outro lugar da folha
(os tipos de fundo de fundos.json). Então o que é fundo, numa célula da peça, é o pixel igual ao do fundo
que estava atrás; o resto é a peça. Os passos (opções de `Metodo`; a explicação de cada um e a tabela de
evolução estão em docs/diorama/RECORTES.md):

1. Casar o fundo: cada tipo de fundo vira uma textura periódica e se procura, em todos os deslocamentos em
   pixels, onde ela acerta mais pixels; o contorno (quase preto) nunca é fundo; texturas com tile dentro da
   peça e as classes que a peça não aceita (`classes`) ficam de fora.
2. Só conta o pixel igual que chega à borda da área por outros pixels iguais (`ligado_a_borda`).
3. Escolher por célula (`por_celula`, `vantagem`, `minimo_celula`).
4. Inundar pelas cores que casaram, com tolerância (`inundar`, `paleta_casada`, `tolerancia`).
5. Sombra escura do piso colada no fundo (`sombra`); quadriculado das exportações ligado à borda.
6. Limpar ciscos e furos (`limpeza`).
7. Contorno por fora: o fundo escuro colado num pixel colorido da peça vira 010000 (`contorno`).
8. Folga de 1 pixel em volta, com preto onde a peça encosta na borda sem contorno (`folga`).
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

from .folhas import PRETO, QUADRICULADO, TILE, Folha, Textura, rgb_de


@dataclass(frozen=True)
class Metodo:
    nome: str = "final"
    deslocamento_livre: bool = True  # passo 1: deslocamento em pixels (False: só tiles alinhados)
    por_celula: bool = True  # passo 2
    uniao_global: bool = True  # pixel igual ao casamento da peça inteira também é fundo
    inundar: bool = True  # passo 2b: espalhar o fundo pelas cores da paleta dele
    paleta_casada: bool = True  # a paleta da inundação são as cores que casaram, não a textura inteira
    sombra: bool = True  # passo 2c: a sombra escura do piso colada no fundo também é fundo
    tolerancia_sombra: int = 24
    tolerancia: int = 8  # diferença máxima por canal para uma cor contar como "da paleta do fundo"
    limpeza: bool = True  # passo 3
    contorno: str = "cantos"  # passo 4: "nenhum", "cantos", "escuros" (borda escura vira preto), "todos"
    folga: bool = True  # passo 5
    minimo_celula: int = 8  # pixels iguais para a célula ter fundo
    candidatos: int = 6  # deslocamentos de cada textura que passam para a segunda conta
    ligado_a_borda: bool = True  # passo 1b: só conta o pixel igual que chega à borda da área por pixels iguais
    limiar_contorno: int = 0x2C  # canal máximo do contorno (quase preto: 120606 da cadeira, 2a1812 da janela)
    prior: bool = True  # as classes de fundo por peça (tools/recortes.py, classes_atras); sem ele, vale qualquer fundo
    vantagem: int = 4  # quanto o casamento da célula precisa passar o da peça para valer
    furo_max: int = 6  # furos de fundo até este tamanho viram peça
    cisco_max: int = 4  # pedaços de peça até este tamanho, nas cores do fundo, viram fundo
    escuro_max: int = 0x70  # canal máximo para a borda virar contorno


METODO = Metodo()


@dataclass
class Casamento:
    textura: str
    dy: int
    dx: int
    iguais: int

    def json(self):
        return {"fundo": self.textura, "deslocamento": [self.dx, self.dy], "iguais": self.iguais}


@dataclass
class Recorte:
    rgba: np.ndarray  # (H + 2, W + 2, 4): a área com 1 pixel de folga em volta
    peca: np.ndarray  # bool, mesmo tamanho
    incertos: np.ndarray  # bool, mesmo tamanho
    celulas: list[list[Casamento | None]]
    geral: Casamento | None
    metodo: str
    origem_px: tuple[int, int]  # (x, y) do canto do recorte na folha (a área menos 1)
    notas: list[str] = field(default_factory=list)

    @property
    def confianca(self) -> float:
        n = int(self.peca.sum())
        return 1.0 if n == 0 else round(1.0 - float(self.incertos.sum()) / n, 3)


def componentes(mascara: np.ndarray) -> tuple[np.ndarray, int]:
    """Rótulos 4-conexos (1..n) de uma máscara pequena."""
    h, w = mascara.shape
    rot = np.zeros((h, w), dtype=np.int32)
    n = 0
    for y0 in range(h):
        for x0 in range(w):
            if not mascara[y0, x0] or rot[y0, x0]:
                continue
            n += 1
            rot[y0, x0] = n
            fila = deque([(y0, x0)])
            while fila:
                y, x = fila.popleft()
                for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                    if 0 <= yy < h and 0 <= xx < w and mascara[yy, xx] and not rot[yy, xx]:
                        rot[yy, xx] = n
                        fila.append((yy, xx))
    return rot, n


def vizinhos4(mascara: np.ndarray) -> np.ndarray:
    """Pixels que têm algum vizinho 4-conexo na máscara."""
    v = np.zeros_like(mascara)
    v[1:, :] |= mascara[:-1, :]
    v[:-1, :] |= mascara[1:, :]
    v[:, 1:] |= mascara[:, :-1]
    v[:, :-1] |= mascara[:, 1:]
    return v


def _casar(Y: np.ndarray, tex: Textura, livre: bool, h: int, w: int, ignorar: np.ndarray, limiar: int):
    """Pixels iguais por deslocamento e por célula: (n_desl, h, w) e a lista dos deslocamentos (dy, dx)."""
    H, W = Y.shape
    ph, pw = tex.k.shape
    reps_y = (H + ph) // ph + 1
    reps_x = (W + pw) // pw + 1
    k = np.tile(tex.k, (reps_y, reps_x))[: H + ph - 1, : W + pw - 1]
    v = np.tile(tex.valido, (reps_y, reps_x))[: H + ph - 1, : W + pw - 1]
    jk = sliding_window_view(k, (H, W))
    jv = sliding_window_view(v, (H, W))
    nao_preto = ~contorno_de(Y, limiar) & ~ignorar
    desl = []
    contas = []
    passos_y = range(ph) if livre else range(0, ph, TILE)
    passos_x = np.arange(pw) if livre else np.arange(0, pw, TILE)
    for dy in passos_y:
        iguais = (jk[dy, passos_x] == Y[None]) & jv[dy, passos_x] & nao_preto[None]
        contas.append(iguais.reshape(len(passos_x), h, TILE, w, TILE).sum(axis=(2, 4)))
        desl.extend((dy, int(dx)) for dx in passos_x)
    return np.concatenate(contas, axis=0), desl


def contorno_de(k: np.ndarray, limiar: int = 0x2C) -> np.ndarray:
    """Pixels de contorno: o preto 010000 e os quase pretos (a cadeira da casa usa 120606 no contorno)."""
    r, g, b = (k >> 16) & 255, (k >> 8) & 255, k & 255
    return (np.maximum(np.maximum(r, g), b) < limiar) | (k == PRETO)


def _perto_da_paleta(Y: np.ndarray, paleta: set[int], tolerancia: int) -> np.ndarray:
    """Pixels cuja cor está a até `tolerancia` (por canal) de alguma cor da paleta."""
    cores, inv = np.unique(Y, return_inverse=True)
    if not paleta:
        return np.zeros(Y.shape, dtype=bool)
    p = rgb_de(np.array(sorted(paleta))).astype(np.int32)
    c = rgb_de(cores).astype(np.int32)
    perto = (np.abs(c[:, None, :] - p[None, :, :]).max(axis=2) <= tolerancia).any(axis=1)
    return perto[inv.reshape(Y.shape)]


def _fundo_previsto(tex: Textura, dy: int, dx: int, H: int, W: int):
    ph, pw = tex.k.shape
    ys = (np.arange(H) + dy) % ph
    xs = (np.arange(W) + dx) % pw
    return tex.k[np.ix_(ys, xs)], tex.valido[np.ix_(ys, xs)]


def recortar(
    f: Folha,
    area: list[int],
    texs: list[Textura],
    metodo: Metodo = METODO,
    excluir: set[tuple[int, int]] | None = None,
    classes: frozenset[str] = frozenset({"piso", "parede"}),
) -> Recorte:
    """Recorta a peça da área [coluna, linha, largura, altura]; `excluir` são células (coluna, linha) da área que
    são de outra peça (ficam transparentes); `classes` são as classes de fundo que podem estar atrás dela."""
    c, l, w, h = area
    fora = np.zeros((h * TILE, w * TILE), dtype=bool)
    for ec, el in excluir or ():
        fora[(el - l) * TILE : (el - l + 1) * TILE, (ec - c) * TILE : (ec - c + 1) * TILE] = True
    H, W = h * TILE, w * TILE
    Y = f.k[l * TILE : l * TILE + H, c * TILE : c * TILE + W]
    proprios = {(l + j) * 128 + c + i for j in range(h) for i in range(w)}
    usaveis = [t for t in texs if not (t.tiles & proprios) and t.classe in classes]

    nao_preto = ~contorno_de(Y, metodo.limiar_contorno) & ~fora

    # 1. casar: as contas cruas de cada textura em cada deslocamento, e os candidatos (os melhores deslocamentos
    # de cada textura na peça inteira e em cada célula)
    candidatos: dict[tuple[str, int, int], Textura] = {}
    for tex in usaveis:
        contas, desl = _casar(Y, tex, metodo.deslocamento_livre, h, w, fora, metodo.limiar_contorno)
        total = contas.sum(axis=(1, 2))
        for n in np.argsort(-total, kind="stable")[: metodo.candidatos]:
            if total[n] > 0:
                candidatos[(tex.id, *desl[int(n)])] = tex
        if metodo.por_celula:
            plano = contas.reshape(len(desl), -1)
            for n in np.unique(np.argmax(plano, axis=0)):
                if plano[n].max() > 0:
                    candidatos[(tex.id, *desl[int(n)])] = tex

    # O fundo de verdade está atrás da peça e chega à borda da área (ou ao vão das células excluídas): os pixels
    # iguais por acaso no meio da peça (a madeira da cadeira igual à da estante) não contam.
    borda = np.zeros((H, W), dtype=bool)
    borda[0, :] = borda[-1, :] = borda[:, 0] = borda[:, -1] = True
    borda |= vizinhos4(fora)
    mascaras: dict[tuple[str, int, int], np.ndarray] = {}
    contas_cel: dict[tuple[str, int, int], np.ndarray] = {}
    for chave, tex in candidatos.items():
        prev, val = _fundo_previsto(tex, chave[1], chave[2], H, W)
        m = (prev == Y) & val & nao_preto
        if metodo.ligado_a_borda:
            rot, n = componentes(m)
            ok = np.unique(rot[borda & m])
            m = np.isin(rot, ok[ok > 0])
        mascaras[chave] = m
        contas_cel[chave] = m.reshape(h, TILE, w, TILE).sum(axis=(1, 3))
    geral: Casamento | None = None
    for chave, cc in contas_cel.items():
        t = int(cc.sum())
        if t > 0 and (geral is None or t > geral.iguais):
            geral = Casamento(chave[0], chave[1], chave[2], t)
    por_id = {t.id: t for t in usaveis}

    # 2. escolher por célula
    celulas: list[list[Casamento | None]] = [[None] * w for _ in range(h)]
    chave_geral = (geral.textura, geral.dy, geral.dx) if geral else None
    escolhas: list[list[tuple[str, int, int] | None]] = [[None] * w for _ in range(h)]
    for j in range(h):
        for i in range(w):
            if fora[j * TILE, i * TILE]:
                continue
            escolha = None
            if chave_geral is not None and contas_cel[chave_geral][j, i] >= metodo.minimo_celula:
                escolha = chave_geral
            if metodo.por_celula:
                for chave, cc in contas_cel.items():
                    v = int(cc[j, i])
                    base = int(contas_cel[escolha][j, i]) + metodo.vantagem if escolha else metodo.minimo_celula - 1
                    if v > base:
                        escolha = chave
            if escolha is not None:
                escolhas[j][i] = escolha
                celulas[j][i] = Casamento(escolha[0], escolha[1], escolha[2], int(contas_cel[escolha][j, i]))

    fundo = np.zeros((H, W), dtype=bool)
    paleta: set[int] = set()
    tem_fundo = np.zeros((H, W), dtype=bool)
    for j in range(h):
        for i in range(w):
            ch = escolhas[j][i]
            if ch is None:
                continue
            paleta |= candidatos[ch].paleta
            sl = (slice(j * TILE, (j + 1) * TILE), slice(i * TILE, (i + 1) * TILE))
            fundo[sl] |= mascaras[ch][sl]
            tem_fundo[sl] = True
    if metodo.uniao_global and chave_geral is not None:
        paleta |= candidatos[chave_geral].paleta
        fundo |= mascaras[chave_geral] & tem_fundo
    fundo &= nao_preto
    fundo &= ~fora
    # O quadriculado das exportações do Aeko é o transparente pintado: é fundo onde chega à borda da área.
    quad = np.isin(Y, np.array(sorted(QUADRICULADO), dtype=np.int32)) & ~fora
    if quad.any():
        rot_q, _ = componentes(quad)
        ok = np.unique(rot_q[borda & quad])
        fundo |= np.isin(rot_q, ok[ok > 0])

    # 2b. inundar pela paleta: o piso atrás da peça nem sempre é a textura na mesma ordem (o Aeko recompôs as
    # tábuas e as faixas), mas é feito das mesmas cores. A partir do que casou, o fundo se espalha pelos
    # vizinhos que têm cor da paleta dos fundos escolhidos, sem atravessar o preto do contorno.
    paleta_textura = set(paleta)
    if metodo.inundar and fundo.any():
        if metodo.paleta_casada:
            # só as cores que casaram de fato (a madeira da moldura também está no lambri, mas não atrás da janela)
            paleta = set(np.unique(Y[fundo]).tolist())
        na_paleta = _perto_da_paleta(Y, paleta, metodo.tolerancia) & nao_preto
        fila = deque(zip(*np.nonzero(fundo)))
        while fila:
            y, x = fila.popleft()
            for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= yy < H and 0 <= xx < W and na_paleta[yy, xx] and not fundo[yy, xx] and not fora[yy, xx]:
                    fundo[yy, xx] = True
                    fila.append((yy, xx))
    # 2c. sombra do piso: o pixel escuro colado no fundo, com cor perto da textura inteira (a sombra que o Aeko pôs
    # no piso junto da peça: 67300c no piso claro, 3c1e18 no escuro), também é fundo. Uma camada só, sem espalhar.
    sombra = np.zeros((H, W), dtype=bool)
    if metodo.sombra and fundo.any():
        rgb_y = rgb_de(Y).astype(np.int32)
        sombra = (
            ~fundo
            & ~fora
            & nao_preto
            & vizinhos4(fundo)
            & (rgb_y.max(axis=2) < metodo.escuro_max)
            & _perto_da_paleta(Y, paleta_textura, metodo.tolerancia_sombra)
        )
        fundo |= sombra
    peca = ~fundo & ~fora
    incertos = np.zeros((H, W), dtype=bool)
    incertos |= sombra
    notas: list[str] = []

    # 3. limpar
    if metodo.limpeza:
        rot, n = componentes(peca)
        tamanhos = np.bincount(rot.ravel(), minlength=n + 1)
        maior = int(np.argmax(tamanhos[1:]) + 1) if n else 0
        for r in range(1, n + 1):
            if r == maior or tamanhos[r] > metodo.cisco_max:
                continue
            px = rot == r
            if all(int(v) in paleta for v in np.unique(Y[px])):
                peca[px] = False
                incertos[px] = True
        rot, n = componentes(~peca)
        borda = set(np.unique(np.concatenate([rot[0], rot[-1], rot[:, 0], rot[:, -1]])).tolist())
        tamanhos = np.bincount(rot.ravel(), minlength=n + 1)
        for r in range(1, n + 1):
            if r in borda:
                continue
            px = rot == r
            if (px & fora).any():
                continue
            if tamanhos[r] <= metodo.furo_max:
                peca[px] = True
                incertos[px] = True
            elif tamanhos[r] <= 4 * metodo.furo_max:
                incertos[px] = True  # vão de verdade ou cor igual por acaso: não dá para saber
                notas.append(f"furo de {int(tamanhos[r])} px mantido transparente")

    # monta o recorte com a folga
    rgb = rgb_de(Y)
    saida = np.zeros((H + 2, W + 2, 4), dtype=np.uint8)
    saida[1:-1, 1:-1, :3] = rgb
    saida[1:-1, 1:-1, 3] = np.where(peca, 255, 0)
    peca_f = np.zeros((H + 2, W + 2), dtype=bool)
    peca_f[1:-1, 1:-1] = peca
    inc_f = np.zeros((H + 2, W + 2), dtype=bool)
    inc_f[1:-1, 1:-1] = incertos & peca  # o que virou fundo não aparece; conta o que ficou
    inc_f[1:-1, 1:-1] |= incertos & ~peca & vizinhos4(peca)
    preto = rgb_de(np.array(PRETO))

    # 4. fechar o contorno
    if metodo.contorno == "cantos":
        # O contorno do Aeko fecha a peça: pixel da peça que não é preto não encosta no fundo. Onde encosta, e o
        # fundo ali é escuro (a sombra que o Aeko pôs no piso junto da peça), o gabarito pinta esse pixel do
        # piso de preto: o contorno passa por fora. Encostado só no preto da peça, o pixel escuro fica fundo.
        k = (saida[..., 0].astype(np.int32) << 16) | (saida[..., 1].astype(np.int32) << 8) | saida[..., 2]
        colorida = peca_f & ~contorno_de(k, metodo.limiar_contorno)
        dentro = np.zeros_like(colorida)
        dentro[1:-1, 1:-1] = True
        canto = dentro & ~peca_f & vizinhos4(colorida) & (saida[..., :3].max(axis=2) < metodo.escuro_max)
        saida[canto, :3] = preto
        saida[canto, 3] = 255
        peca_f |= canto
        inc_f |= canto
    elif metodo.contorno != "nenhum":
        dentro = np.zeros((H + 2, W + 2), dtype=bool)
        dentro[1:-1, 1:-1] = True
        lado_de_fora = ~peca_f & dentro
        silhueta = peca_f & vizinhos4(lado_de_fora)
        k = (saida[..., 0].astype(np.int32) << 16) | (saida[..., 1].astype(np.int32) << 8) | saida[..., 2]
        silhueta &= ~contorno_de(k, metodo.limiar_contorno)
        if metodo.contorno == "escuros":
            silhueta &= saida[..., :3].max(axis=2) < metodo.escuro_max
        saida[silhueta, :3] = preto
        inc_f |= silhueta

    # 5. folga
    if metodo.folga:
        k = (saida[..., 0].astype(np.int32) << 16) | (saida[..., 1].astype(np.int32) << 8) | saida[..., 2]
        aberta = peca_f & ~contorno_de(k, metodo.limiar_contorno)
        for lado in range(4):
            if lado == 0:
                src, dst = (1, slice(1, -1)), (0, slice(1, -1))
            elif lado == 1:
                src, dst = (-2, slice(1, -1)), (-1, slice(1, -1))
            elif lado == 2:
                src, dst = (slice(1, -1), 1), (slice(1, -1), 0)
            else:
                src, dst = (slice(1, -1), -2), (slice(1, -1), -1)
            m = aberta[src]
            alvo = saida[dst]
            alvo[m, :3] = preto
            alvo[m, 3] = 255
            saida[dst] = alvo
            pf = peca_f[dst]
            pf[m] = True
            peca_f[dst] = pf

    return Recorte(
        rgba=saida,
        peca=peca_f,
        incertos=inc_f,
        celulas=celulas,
        geral=geral,
        metodo=metodo.nome,
        origem_px=(c * TILE - 1, l * TILE - 1),
        notas=notas,
    )
