"""Estilo Aeko, estilo equipe e Aeko + equipe para qualquer arte (reconstrução de 2026-10-20).

A ferramenta que o usuário usava para fazer artes novas nos estilos do jogo se perdeu na formatação. Ela tinha três
alvos, e esta também:

- **aeko**: o estilo do Aeko, o artista das folhas de tiles. Gabarito: as folhas `diorama/folhas/casa.png` e
  `castelo.png` e as peças do Graal no estilo Aeko (`graal.aeko.<n>.png`, o resultado de `estilo_aeko.py`).
- **equipe**: o estilo da arte que a equipe fez sem a mão do Aeko. Gabarito:
  `Haywood-Valley-recuperado/aeko/referencia_estilo_equipe.png` (fica fora do repositório; só a paleta e os números
  medidos entram, em `tools/estilos_arte.json`).
- **aeko+equipe**: a mistura dos dois, com o peso `--mistura` (0 = só equipe, 1 = só Aeko; padrão 0,5).

Os números de cada alvo (tons por rampa, degrau de L, croma da sombra, giro do matiz, contorno, paleta) são medidos
por `python -I tools/estudo_aeko.py --referencia <png>` e gravados em `tools/estilos_arte.json`; o porquê de cada um
está em docs/arte/ESTUDO_AEKO.md (seção 6) e o uso em docs/arte/ESTILO_AEKO_ARTE.md. Como era a ferramenta original é
palpite: só o resultado dela sobreviveu.

O que ela faz, em ordem:

1. **Escala.** Arte ampliada por um inteiro (cada pixel virou um bloco N×N, como a referência da equipe, que está a
   2×) é reduzida a 1 pixel por pixel antes de tudo e ampliada de volta no fim.
2. **Fundo.** Vira transparente. `--fundo auto`: se a imagem já tem transparência, vale o alfa (corte em 128); se não,
   a cor que mais aparece na moldura de 1 px é o fundo, e some o que tem essa cor (até ΔE `fundo_tolerancia`) e está
   ligado à moldura (um furo da mesma cor no meio do desenho fica). `--fundo #RRGGBB`: some essa cor em qualquer
   lugar. O antisserrilhado contra o fundo (pixel da beirada que é mais fundo que desenho) também some. O alfa sai
   binário: 0 ou 255.
3. **Famílias de matiz.** As cores opacas que não são tinta (L ≥ `tinta_L`) se agrupam pelo matiz (a corda entre os
   ângulos em (a, b) de Lab, a mesma de estilo_aeko.py); as quase cinza formam uma família própria.
4. **Rampas.** Em cada família, a escala de L se parte em K tons pela partição ótima em 1-D (Jenks), com
   K = round(amplitude de L / degrau) + 1, no máximo `--tons`. Cada tom é a média em Lab dos pixels dele, e a rampa
   ganha o jeito do alvo: o matiz puxado para o da família (com o giro medido do escuro ao claro) e o croma do tom
   mais escuro puxado para a fração medida do mais saturado (a sombra desce ao escuro perdendo croma).
5. **Paleta.** `--paleta auto` (padrão): livre, e presa à paleta do alvo se a nota pedir; `estilo`: presa desde o
   começo; `livre`: nunca presa; `aeko` ou `equipe`: presa a essa paleta; um PNG: presa às cores dele. Presa quer dizer
   que cada tom vai para a cor mais perto da paleta, sem repetir cor na mesma rampa nem inverter a ordem de L.
6. **Contorno.** `--contorno externo` (padrão): 1 px em volta da silhueta. Se a beirada da arte já é escura (metade ou
   mais de tinta), ela é repintada no lugar; se não, o contorno vai do lado de fora, nos pixels transparentes que
   encostam (4 vizinhos) na silhueta. `todos`: também a tinta de dentro. `nao`: sem contorno (terrenos, tiles).
   `--cor-contorno`: `preto` (`010000`, o do Aeko), `escuro` (um escuro da cor vizinha, como as árvores da equipe) ou
   `auto` (o padrão de cada estilo: preto no aeko; no equipe, o que a arte já tem).
7. **Nota e ajuste.** A arte produzida é medida contra o alvo (nota 0–10, `nota_estilo`: paleta, contorno, tons por
   rampa, degrau de L e croma da sombra, com os pesos de PESOS_NOTA). Abaixo de `--nota-minima` (padrão: 8 no aeko e
   no aeko+equipe, 7 no equipe, ver ESTILO_AEKO_ARTE.md), ela ajusta o que mais pesou na falta (prende à paleta, troca
   a cor do contorno, muda os tons, o degrau ou a força do croma) e tenta de novo, até 8 vezes; entrega a melhor e,
   se não chegou, avisa com a nota e o que faltou (saída 0 do mesmo jeito; `--exigir` faz sair com 3).

Uso:
    python -I tools/estilo_aeko_arte.py <entrada.png> <saida.png> [--estilo aeko|equipe|aeko+equipe] [--mistura 0..1]
        [--fundo auto|nenhum|#RRGGBB] [--paleta auto|estilo|livre|aeko|equipe|<arquivo.png>] [--tons N]
        [--contorno externo|todos|nao] [--cor-contorno auto|preto|escuro] [--escala auto|N]
        [--nota-minima X] [--exigir] [--previa] [--json]

`--previa` grava ao lado `<saida>.previa.png`: antes | depois, ampliados 4×, sobre xadrez. `--json` escreve no fim uma
linha JSON com o resumo (a ponte usa). O módulo também serve ao estudo (`medir_objeto`, `componentes`, `paleta_aeko`)
e à validação (`tools/validar_estilo_arte.py`).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")  # uma thread só: o OpenBLAS reserva memória por thread
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import estilo_aeko as ea  # noqa: E402  (Lab, famílias de matiz, Jenks)

RAIZ = ea.RAIZ
FOLHAS_AEKO = (RAIZ / "diorama" / "folhas" / "casa.png", RAIZ / "diorama" / "folhas" / "castelo.png")
QUADRICULADO = ((0xF7, 0xF7, 0xF7), (0xE6, 0xE6, 0xE6))  # o "transparente" das exportações do Aeko
PRETO_AEKO = (1, 0, 0)
ARQUIVO_ESTILOS = Path(__file__).resolve().with_name("estilos_arte.json")
ESTILOS = ("aeko", "equipe", "aeko+equipe")
NOTA_MINIMA_PADRAO = {"aeko": 8.0, "equipe": 8.0, "aeko+equipe": 8.0}
JND = 2.3  # a menor diferença de cor que se nota (ΔE76)
# Pesos da nota de aderência ao estilo (escolhidos aqui, em 2026-10-20: o que a ferramenta original media é palpite).
PESOS_NOTA = {"paleta": 0.35, "contorno": 0.25, "tons": 0.15, "degrau": 0.15, "sombra": 0.10}
TENTATIVAS = 8

# O que não depende do alvo. Os números de cada estilo (tons, degrau, croma da sombra, giro) vêm de estilos_arte.json.
PARAMETROS = {
    "alfa_minimo": 128,  # alfa a partir do qual o pixel é opaco
    "fundo_tolerancia": 6.0,  # ΔE ao fundo abaixo do qual o pixel é fundo (--fundo auto ou #RRGGBB)
    "tinta_L": 14.0,  # L (Lab) abaixo do qual um pixel é tinta (contorno ou linha)
    "contorno_L": 30.0,  # L abaixo do qual um pixel da beirada conta como contorno no estilo equipe
    "familia_ab": 14.0,  # corda de matiz que separa duas famílias
    "croma_neutro": 7.0,  # croma abaixo do qual a cor vai para a família dos cinzas
    "minimo_tom": 0.02,  # a amplitude de L de uma família vai do percentil 2 ao 98 (ponderado pelos pixels)
    "forca_matiz": 0.5,  # quanto o matiz de cada tom é puxado para o da família (0 = nada, 1 = todo)
    "forca_croma": 0.5,  # quanto o croma é puxado para a curva da sombra do alvo
    "croma_teto": 60.0,  # croma a partir do qual comprime
    "beirada_escura": 0.5,  # fração da beirada escura a partir da qual o contorno é repintado no lugar
    "beirada_L": 45.0,  # L abaixo do qual um pixel da beirada é escuro (um contorno borrado fica entre 20 e 45)
    "beirada_contraste": 5.0,  # e quanto ele tem de ser mais escuro que os vizinhos de dentro para ser contorno
    "cobertura_minima": 0.6,  # tentativa sem rampa: as K cores mais usadas de cada família cobrem isto da arte
    "rampa": True,  # False: cada cor fica como está (só presa à paleta, se houver), sem reduzir tons
}

# Se estilos_arte.json não existir (o estudo não rodou): os números de 2026-10-20.
ESTILOS_PADRAO = {
    "estilos": {
        "aeko": {"tons": 4.0, "degrau": 8.3, "croma_escuro": 0.66, "giro": 5.0, "borda": 0.9, "cor_contorno": "010000"},
        "equipe": {"tons": 4.8, "degrau": 7.6, "croma_escuro": 0.56, "giro": 9.0, "borda": 0.7, "cor_contorno": "080808"},
    },
    "tolerancias": {"tons": [1.0, 3.0], "degrau": [2.0, 5.0], "croma_escuro": [0.15, 0.4]},
    "paletas": {"equipe": []},
}


# --- os alvos ----------------------------------------------------------------------------------------------

_cache: dict = {}


def carregar_estilos() -> dict:
    if "estilos" not in _cache:
        if ARQUIVO_ESTILOS.exists():
            _cache["estilos"] = json.loads(ARQUIVO_ESTILOS.read_text(encoding="utf8"))
        else:
            print(f"aviso: {ARQUIVO_ESTILOS.name} não existe; usando os números padrão (rodar tools/estudo_aeko.py --referencia)", file=sys.stderr)
            _cache["estilos"] = ESTILOS_PADRAO
    return _cache["estilos"]


def paleta_aeko(minimo: int = 4) -> np.ndarray:
    """As cores (RGB, uint8) das folhas do Aeko, sem o quadriculado, com pelo menos `minimo` pixels."""
    if "aeko" not in _cache:
        cores = []
        for caminho in FOLHAS_AEKO:
            im = ler_rgba(caminho)
            rgb = im[..., :3][im[..., 3] > 0]
            c, n = np.unique(rgb, axis=0, return_counts=True)
            quad = np.zeros(len(c), bool)
            for q in QUADRICULADO:
                quad |= (c == q).all(1)
            cores.append(c[~quad & (n >= minimo)])
        _cache["aeko"] = np.unique(np.concatenate(cores), axis=0)
    return _cache["aeko"]


def paleta_equipe() -> np.ndarray:
    if "equipe" not in _cache:
        hexas = carregar_estilos().get("paletas", {}).get("equipe", [])
        _cache["equipe"] = np.array([ler_cor(h) for h in hexas], np.uint8).reshape(-1, 3)
    return _cache["equipe"]


def paleta_de_arquivo(caminho: str, fundo: str = "auto") -> np.ndarray:
    chave = os.path.abspath(caminho)
    if chave not in _cache:
        im = ler_rgba(caminho)
        im = reduzir(im, detectar_escala(im))
        im, _ = tirar_fundo(im, fundo)
        _cache[chave] = np.unique(im[..., :3][im[..., 3] > 0], axis=0)
    return _cache[chave]


def alvo(estilo: str = "aeko", mistura: float = 0.5) -> dict:
    """
    Os números do alvo e a paleta. `peso_aeko`: 1 no aeko, 0 no equipe, `mistura` no aeko+equipe. Na mistura, cada
    número é a média ponderada dos dois e a paleta é a união das duas, com a cor de cada uma afastada conforme o peso
    da outra (`penalidade`, um multiplicador da distância na hora de prender o tom; palpite).
    """
    if estilo not in ESTILOS:
        raise ValueError(f"estilo desconhecido: {estilo} (aeko, equipe ou aeko+equipe)")
    dados = carregar_estilos()
    a, e = dados["estilos"]["aeko"], dados["estilos"]["equipe"]
    w = 1.0 if estilo == "aeko" else 0.0 if estilo == "equipe" else float(np.clip(mistura, 0, 1))
    numeros = {k: w * a[k] + (1 - w) * e[k] for k in ("tons", "degrau", "croma_escuro", "giro", "borda")}
    pa, pe = paleta_aeko(), paleta_equipe()
    if w >= 1 or len(pe) == 0:
        paleta, penalidade = pa, np.ones(len(pa))
    elif w <= 0:
        paleta, penalidade = pe, np.ones(len(pe))
    else:
        paleta = np.concatenate([pa, pe])
        penalidade = np.concatenate([np.full(len(pa), 1 + 0.5 * (1 - w)), np.full(len(pe), 1 + 0.5 * w)])
    cor = a["cor_contorno"] if w >= 0.5 else e["cor_contorno"]
    return {"estilo": estilo, "peso_aeko": w, **numeros, "paleta": paleta, "penalidade": penalidade,
            "cor_contorno": ler_cor(cor), "tolerancias": dados["tolerancias"]}


# --- leitura, escala e fundo -------------------------------------------------------------------------------


def ler_rgba(caminho) -> np.ndarray:
    return np.array(Image.open(caminho).convert("RGBA"))


def detectar_escala(rgba: np.ndarray, maximo: int = 8) -> int:
    """O maior N (2..maximo) em que a imagem é toda feita de blocos N×N de uma cor só (alinhados no canto)."""
    h, w = rgba.shape[:2]
    for n in range(maximo, 1, -1):
        if h % n or w % n:
            continue
        blocos = rgba.reshape(h // n, n, w // n, n, 4)
        if (blocos == blocos[:, :1, :, :1]).all():
            return n
    return 1


def _periodo(sinal: np.ndarray, menor: float, maior: float, passo: float = 0.002) -> tuple[float, float, float]:
    """O período (em pixels da tela) mais forte do sinal, a fase (onde cai a borda) e a força relativa."""
    s = sinal - sinal.mean()
    idx = np.arange(len(s))

    def medir(p):
        v = (s * np.exp(2j * np.pi * idx / p)).sum()
        return abs(v), float(np.angle(v))

    melhor = (0.0, menor, 0.0)
    for p in np.arange(menor, maior, passo):
        f, fase = medir(p)
        if f > melhor[0]:
            melhor = (f, p, fase)
    forca, p, fase = melhor
    # Numa grade nítida (zoom inteiro, sem perdas) as bordas formam um pente perfeito, e p/2, p/3 têm a mesma força
    # que p (o período 2, a frequência de Nyquist, sai até mais forte): fica o maior múltiplo do mais forte que
    # ainda tem 60 % da força dele.
    for k in range(6, 1, -1):
        if p * k < maior:
            fk, fase_k = medir(p * k)
            if fk >= 0.6 * forca:
                p, fase = p * k, fase_k
                break
    borda = ((-fase / (2 * np.pi)) * p) % p + 0.5  # +0,5: a diferença i → i+1 mora entre os dois
    return float(p), float(borda), float(forca / max(1e-9, np.abs(s).sum()))


def grade_inteira(rgb: np.ndarray, maior: int = 12, minimo: float = 0.85) -> dict | None:
    """
    Zoom inteiro sem perdas (captura do Aseprite em 600 %, por exemplo), com a grade deslocada: em cada eixo, as
    trocas de cor entre colunas (linhas) vizinhas caem todas na mesma posição módulo n. Devolve a grade do maior n
    (≥ 2) em que pelo menos `minimo` das trocas caem num resíduo só, nos dois eixos; ou None.
    """
    def eixo(trocas: np.ndarray):
        pos = np.flatnonzero(trocas) + 1
        if len(pos) < 50:
            return None
        for n in range(maior, 1, -1):
            cont = np.bincount(pos % n, minlength=n)
            if cont.max() >= minimo * len(pos):
                return n, int(cont.argmax())
        return None

    q = rgb.astype(np.int64)
    k = (q[..., 0] << 16) | (q[..., 1] << 8) | q[..., 2]
    x = eixo((k[:, 1:] != k[:, :-1]).sum(0))
    y = eixo((k[1:] != k[:-1]).sum(1))
    if not x or not y:
        return None
    return {"px": float(x[0]), "py": float(y[0]), "bx": float(x[1]), "by": float(y[1]), "forca": 1.0, "inteira": True}


def grade_de_captura(rgb: np.ndarray, menor: float = 2.0, maior: float = 12.0) -> dict:
    """
    A grade de pixels de arte de uma captura de tela (ampliação fracionária, JPEG): o período e a fase em x e em y,
    tirados da energia das bordas (soma das diferenças entre colunas e entre linhas).
    """
    inteira = grade_inteira(rgb, int(maior))
    if inteira:
        return inteira
    a = rgb.astype(float)
    gx = np.abs(np.diff(a, axis=1)).sum(-1).sum(0)
    gy = np.abs(np.diff(a, axis=0)).sum(-1).sum(1)
    px, bx, fx = _periodo(gx, menor, maior)
    py, by, fy = _periodo(gy, menor, maior)
    return {"px": px, "py": py, "bx": bx, "by": by, "forca": min(fx, fy)}


def desamostrar_captura(rgba: np.ndarray, grade: dict | None = None, ruido: float = 5.0) -> tuple[np.ndarray, dict]:
    """
    Uma captura de pixel art de volta a 1 pixel por pixel: a mediana do miolo de cada célula da grade (sem a beirada,
    onde o JPEG e a reamostragem misturam vizinhos), e depois as cores a menos de `ruido` de ΔE de uma cor mais comum
    viram essa cor (o ruído do JPEG). Devolve a imagem pequena e a grade.
    """
    rgb = rgba[..., :3]
    g = grade or grade_de_captura(rgb)
    h, w = rgb.shape[:2]
    xs = np.arange(g["bx"] % g["px"], w - 1, g["px"])
    ys = np.arange(g["by"] % g["py"], h - 1, g["py"])
    saida = np.zeros((len(ys) - 1, len(xs) - 1, 4), np.uint8)
    for j in range(len(ys) - 1):
        y0, y1 = int(np.ceil(ys[j] + g["py"] * 0.25)), int(np.floor(ys[j + 1] - g["py"] * 0.25))
        y1 = max(y1, y0 + 1)
        for i in range(len(xs) - 1):
            x0, x1 = int(np.ceil(xs[i] + g["px"] * 0.25)), int(np.floor(xs[i + 1] - g["px"] * 0.25))
            x1 = max(x1, x0 + 1)
            bloco = rgba[y0:y1, x0:x1].reshape(-1, 4)
            saida[j, i] = np.median(bloco, axis=0)
    return juntar_ruido(saida, ruido), g


def juntar_ruido(rgba: np.ndarray, ruido: float = 5.0) -> np.ndarray:
    """Cada cor a menos de `ruido` (ΔE) de uma cor mais frequente vira ela (da mais comum para a menos)."""
    m = rgba[..., 3] > 0
    cores, inversa, cont = np.unique(rgba[..., :3][m], axis=0, return_inverse=True, return_counts=True)
    inversa = inversa.ravel()
    lab = ea.srgb_para_lab(cores)
    destino = np.arange(len(cores))
    ordem = np.argsort(-cont)
    representantes: list[int] = []
    for i in ordem:
        if representantes:
            d = np.linalg.norm(lab[representantes] - lab[i], axis=1)
            j = int(np.argmin(d))
            if d[j] < ruido:
                destino[i] = representantes[j]
                continue
        representantes.append(int(i))
    saida = rgba.copy()
    saida[..., :3][m] = cores[destino[inversa]]
    return saida


def reduzir(rgba: np.ndarray, n: int) -> np.ndarray:
    return rgba[::n, ::n].copy() if n > 1 else rgba


def ampliar(rgba: np.ndarray, n: int) -> np.ndarray:
    return np.repeat(np.repeat(rgba, n, 0), n, 1) if n > 1 else rgba


def ler_cor(texto: str) -> tuple[int, int, int]:
    t = texto.strip().lstrip("#")
    if len(t) != 6 or any(ch not in "0123456789abcdefABCDEF" for ch in t):
        raise ValueError(f"cor inválida: {texto} (esperado #RRGGBB)")
    return tuple(int(t[i : i + 2], 16) for i in (0, 2, 4))


def _vizinhos4(m: np.ndarray, fora: bool = False) -> np.ndarray:
    """Se cada pixel tem os 4 vizinhos em m (a moldura conta como `fora`)."""
    p = np.pad(m, 1, constant_values=fora)
    return p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]


def _algum_vizinho4(m: np.ndarray) -> np.ndarray:
    p = np.pad(m, 1, constant_values=False)
    return p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]


def tirar_fundo(rgba: np.ndarray, fundo: str = "auto", parametros: dict | None = None) -> tuple[np.ndarray, str]:
    """RGBA com alfa binário e o fundo transparente; devolve também o que foi tomado por fundo ("alfa", "#RRGGBB", "nenhum")."""
    p = {**PARAMETROS, **(parametros or {})}
    saida = rgba.copy()
    transparentes = rgba[..., 3] < p["alfa_minimo"]
    if fundo == "nenhum" or (fundo == "auto" and transparentes.mean() >= 0.01):
        saida[..., 3] = np.where(transparentes, 0, 255)
        saida[transparentes, :3] = 0
        return saida, "alfa" if fundo == "auto" else "nenhum"
    rgb = rgba[..., :3]
    if fundo == "auto":
        moldura = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
        cores, cont = np.unique(moldura, axis=0, return_counts=True)
        cor = cores[cont.argmax()]
        if cont.max() < 0.5 * len(moldura):
            saida[..., 3] = np.where(transparentes, 0, 255)
            saida[transparentes, :3] = 0
            return saida, "nenhum"
    else:
        cor = np.array(ler_cor(fundo))
    lab = ea.srgb_para_lab(rgb)
    lab_fundo = ea.srgb_para_lab(cor)
    parecido = (np.linalg.norm(lab - lab_fundo, axis=-1) <= p["fundo_tolerancia"]) | transparentes
    if fundo == "auto":
        from scipy import ndimage

        rotulos, _n = ndimage.label(parecido)
        ids = np.unique(np.concatenate([rotulos[0], rotulos[-1], rotulos[:, 0], rotulos[:, -1]]))
        e_fundo = np.isin(rotulos, ids[ids > 0])
    else:
        e_fundo = parecido
    # Antisserrilhado: pixel da beirada que fica no segmento fundo → vizinho de dentro, mais perto do fundo.
    opaco = ~e_fundo
    h, w = opaco.shape
    for _ in range(2):
        beirada = opaco & ~_vizinhos4(opaco, True)
        dentro = opaco & ~beirada
        if not beirada.any() or not dentro.any():
            break
        tirar = []
        for y, x in zip(*np.nonzero(beirada)):
            viz = [(y + dy, x + dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx]
            viz = [lab[a, b] for a, b in viz if 0 <= a < h and 0 <= b < w and dentro[a, b]]
            if not viz:
                continue
            q = min(viz, key=lambda c: np.linalg.norm(c - lab[y, x]))
            seg = q - lab_fundo
            t = float(np.dot(lab[y, x] - lab_fundo, seg) / max(1e-9, float(np.dot(seg, seg))))
            if t < 0.5 and np.linalg.norm(lab[y, x] - (lab_fundo + t * seg)) < 12:
                tirar.append((y, x))
        if not tirar:
            break
        for y, x in tirar:
            opaco[y, x] = False
    saida[..., 3] = np.where(opaco, 255, 0)
    saida[~opaco, :3] = 0
    return saida, "#" + ea.hexa(cor)


# --- o estilo ----------------------------------------------------------------------------------------------


def prender_rampa(lab_tons: np.ndarray, paleta_lab: np.ndarray, penalidade: np.ndarray | None = None) -> np.ndarray:
    """
    Cada tom (em ordem de L) vai para a cor mais perto da paleta (distância × penalidade da cor), sem repetir a mesma
    cor em dois tons da rampa e sem inverter a ordem de L. Devolve os índices na paleta.
    """
    if penalidade is None:
        penalidade = np.ones(len(paleta_lab))
    usados: set[int] = set()
    escolha = np.zeros(len(lab_tons), int)
    piso = -1.0
    for i in np.argsort(lab_tons[:, 0]):
        d = np.linalg.norm(paleta_lab - lab_tons[i], axis=1) * penalidade
        candidatos = [int(j) for j in np.argsort(d)[:24] if int(j) not in usados and paleta_lab[j, 0] >= piso - 1.0]
        escolha[i] = candidatos[0] if candidatos else int(np.argmin(d))
        usados.add(int(escolha[i]))
        piso = max(piso, float(paleta_lab[escolha[i], 0]))
    return escolha


def familias_rapidas(lab: np.ndarray, pesos: np.ndarray, limiar: float) -> np.ndarray:
    """
    As famílias de matiz de estilo_aeko._familias (aglomeração pela corda de matiz), que custa n³: com mais de 200
    cores (arte borrada ou com degradê tem milhares), as cores entram agrupadas em faixas de 3° de matiz, cada faixa
    com o centro ponderado em (a, b).
    """
    if len(lab) <= 200:
        return ea._familias(lab[:, 1:], pesos, limiar)
    faixa = (np.degrees(np.arctan2(lab[:, 2], lab[:, 1])) % 360 // 3).astype(int)
    ids, inversa = np.unique(faixa, return_inverse=True)
    inversa = inversa.ravel()
    p = np.bincount(inversa, pesos)
    ab = np.stack([np.bincount(inversa, pesos * lab[:, 1]), np.bincount(inversa, pesos * lab[:, 2])], 1) / p[:, None]
    return ea._familias(ab, p, limiar)[inversa]


def jenks_rapido(lum: np.ndarray, pesos: np.ndarray, k: int) -> np.ndarray:
    """A partição ótima em L (estilo_aeko._jenks, que custa k·n²) sobre L arredondado a 0,5: no máximo ~200 valores."""
    chave = np.round(lum * 2).astype(int)
    valores, inversa = np.unique(chave, return_inverse=True)
    inversa = inversa.ravel()
    p = np.bincount(inversa, pesos)
    return ea._jenks(valores / 2.0, p, k)[inversa]


def amplitude_de_l(lum: np.ndarray, pesos: np.ndarray, corte: float) -> float:
    """
    A amplitude de L de uma família, entre os percentis `corte` e 1 − `corte` ponderados pelos pixels. (Contar só as
    cores com 1 % ou mais da família, como antes, zerava a amplitude de um degradê, em que cada uma das centenas de
    cores tem menos que isso, e a copa virava um tom só.)
    """
    if len(lum) < 2:
        return 0.0
    ordem = np.argsort(lum)
    acumulado = np.cumsum(pesos[ordem]) / pesos.sum()
    baixo = lum[ordem][min(len(lum) - 1, int(np.searchsorted(acumulado, corte)))]
    alto = lum[ordem][min(len(lum) - 1, int(np.searchsorted(acumulado, 1 - corte)))]
    return float(alto - baixo)


def _rampa(lab: np.ndarray, pesos: np.ndarray, neutra: bool, p: dict) -> tuple[np.ndarray, np.ndarray]:
    """Os tons de uma família: o rótulo de cada cor e a cor (Lab) de cada tom, no jeito do alvo."""
    lum = lab[:, 0]
    amplitude = amplitude_de_l(lum, pesos, p["minimo_tom"])
    k = int(np.clip(round(amplitude / p["degrau"]) + 1, 1, p["tons"]))
    rotulos = jenks_rapido(lum, pesos, k)
    # Jenks devolve as classes em ordem de L, mas pode pular números quando k passa dos valores distintos
    _u, rotulos = np.unique(rotulos, return_inverse=True)
    rotulos = rotulos.ravel()
    k = int(rotulos.max()) + 1
    tons = np.array([np.average(lab[rotulos == g], axis=0, weights=pesos[rotulos == g]) for g in range(k)])
    if neutra:
        return rotulos, tons
    croma = np.hypot(tons[:, 1], tons[:, 2])
    matiz = np.arctan2(tons[:, 2], tons[:, 1])
    h0 = float(np.arctan2(np.average(lab[:, 2], weights=pesos), np.average(lab[:, 1], weights=pesos)))
    # posição de cada tom na rampa: 0 = o mais escuro, 1 = o mais claro
    t = (tons[:, 0] - tons[:, 0].min()) / max(1e-6, float(np.ptp(tons[:, 0]))) if k > 1 else np.full(k, 0.5)
    alvo_h = h0 + np.radians(p["giro"]) * (t - 0.5)
    matiz = matiz + p["forca_matiz"] * np.angle(np.exp(1j * (alvo_h - matiz)))
    if k > 1:
        t_max = max(1e-6, float(t[np.argmax(croma)]))
        alvo_c = croma.max() * (p["croma_escuro"] + (1 - p["croma_escuro"]) * np.clip(t / t_max, 0, 1))
        croma = croma + p["forca_croma"] * (np.minimum(alvo_c, croma) - croma)
    teto = p["croma_teto"]
    croma = np.where(croma > teto, teto + (croma - teto) * 0.35, croma)
    tons[:, 1] = croma * np.cos(matiz)
    tons[:, 2] = croma * np.sin(matiz)
    return rotulos, tons


def estilizar(rgba: np.ndarray, p: dict, contorno: str = "externo", cor_contorno="preto",
              paleta: np.ndarray | None = None, penalidade: np.ndarray | None = None) -> tuple[np.ndarray, dict]:
    """
    A arte (RGBA com alfa binário e fundo já transparente) no jeito do alvo. `p`: PARAMETROS mais os números do alvo
    (tons, degrau, croma_escuro, giro). `cor_contorno`: "preto", "escuro" ou uma cor RGB. `paleta`: RGB (n, 3) para
    prender as cores, ou None. Devolve a imagem e um resumo.
    """
    saida = rgba.copy()
    opaco = rgba[..., 3] > 0
    rgb = rgba[..., :3]
    lab_px = ea.srgb_para_lab(rgb)
    tinta = opaco & (lab_px[..., 0] < p["tinta_L"])
    resumo: dict = {"cores_antes": int(len(np.unique(rgb[opaco], axis=0))) if opaco.any() else 0}

    pintar = opaco & ~tinta if contorno == "todos" else opaco
    familias_info = []
    cores, inversa, contagem = np.unique(rgb[pintar], axis=0, return_inverse=True, return_counts=True)
    if len(cores):
        lab = ea.srgb_para_lab(cores)
        pesos = contagem.astype(float)
        neutro = np.hypot(lab[:, 1], lab[:, 2]) < p["croma_neutro"]
        familia = np.full(len(cores), -1)
        if (~neutro).any():
            familia[~neutro] = familias_rapidas(lab[~neutro], pesos[~neutro], p["familia_ab"])
        familia[neutro] = familia.max() + 1
        novas = np.zeros(len(cores), int)
        tons_todos = []
        paleta_lab = ea.srgb_para_lab(paleta) if paleta is not None and len(paleta) else None
        for g in np.unique(familia):
            sel = np.flatnonzero(familia == g)
            if p.get("rampa", True):
                rot, tons_lab = _rampa(lab[sel], pesos[sel], bool(neutro[sel[0]]), p)
            else:
                rot, tons_lab = np.arange(len(sel)), lab[sel]
            if paleta_lab is not None and p.get("rampa", True):
                idx = prender_rampa(tons_lab, paleta_lab, penalidade)
                tons_rgb = paleta[idx]
            elif paleta_lab is not None:
                pen = penalidade if penalidade is not None else np.ones(len(paleta_lab))
                idx = np.array([int(np.argmin(np.linalg.norm(paleta_lab - t, axis=1) * pen)) for t in tons_lab])
                tons_rgb = paleta[idx]
            else:
                tons_rgb = ea.lab_para_srgb(tons_lab)
            novas[sel] = len(tons_todos) + rot
            tons_todos.extend(tons_rgb.tolist())
            familias_info.append({"tons": int(len(tons_lab)), "pixels": int(pesos[sel].sum()), "neutra": bool(neutro[sel[0]])})
        tons_todos = np.array(tons_todos, np.uint8)
        saida[pintar, :3] = tons_todos[novas[inversa.ravel()]]

    if contorno != "nao" and opaco.any():
        beirada = opaco & ~_vizinhos4(opaco, False)
        escura = beirada_que_e_contorno(lab_px[..., 0], opaco, beirada, p)
        fracao_escura = float(escura[beirada].mean()) if beirada.any() else 0.0
        no_lugar = fracao_escura >= p["beirada_escura"]
        if no_lugar:
            linha = beirada.copy()
        else:
            linha = ~opaco & _algum_vizinho4(opaco)
            moldura = np.zeros_like(opaco)
            moldura[0, :] = moldura[-1, :] = moldura[:, 0] = moldura[:, -1] = True
            linha |= opaco & moldura  # na moldura da imagem não há lado de fora
        if contorno == "todos":
            linha |= tinta
        if isinstance(cor_contorno, str) and cor_contorno == "escuro":
            saida = _contorno_escuro(saida, linha, opaco)
        else:
            saida[linha, :3] = np.array(PRETO_AEKO if cor_contorno == "preto" else cor_contorno, np.uint8)
        saida[linha, 3] = 255
        nome_cor = cor_contorno if isinstance(cor_contorno, str) else "#" + ea.hexa(cor_contorno)
        resumo["contorno"] = {"modo": contorno, "cor": nome_cor, "no_lugar": bool(no_lugar), "pixels": int(linha.sum())}
    else:
        resumo["contorno"] = {"modo": "nao"}
    final = saida[..., 3] > 0
    saida[~final, :3] = 0
    resumo["cores_depois"] = int(len(np.unique(saida[..., :3][final], axis=0))) if final.any() else 0
    resumo["familias"] = familias_info
    return saida, resumo


def beirada_que_e_contorno(lum: np.ndarray, opaco: np.ndarray, beirada: np.ndarray, p: dict) -> np.ndarray:
    """
    Os pixels da beirada que já são um contorno: escuros (L < beirada_L) e bem mais escuros (`beirada_contraste`)
    que a média dos vizinhos de dentro. Só "escuro" não basta: uma arte sem contorno com a sombra encostada na beirada
    (o cabelo escuro de uma cabeça) seria tomada por contornada e perderia 1 px de silhueta.
    """
    dentro = opaco & ~beirada
    soma = np.zeros(lum.shape)
    n = np.zeros(lum.shape)
    lp = np.pad(np.where(dentro, lum, 0.0), 1)
    dp = np.pad(dentro, 1).astype(float)
    h, w = lum.shape
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
        soma += lp[1 + dy : 1 + dy + h, 1 + dx : 1 + dx + w]
        n += dp[1 + dy : 1 + dy + h, 1 + dx : 1 + dx + w]
    media_dentro = np.where(n > 0, soma / np.maximum(n, 1), 100.0)
    return beirada & (lum < p["beirada_L"]) & (lum < media_dentro - p["beirada_contraste"])


def _contorno_escuro(saida: np.ndarray, linha: np.ndarray, opaco: np.ndarray) -> np.ndarray:
    """Pinta `linha` com um escuro da cor do vizinho de dentro (L × 0,35, croma × 0,7), como as árvores da equipe."""
    lab = ea.srgb_para_lab(saida[..., :3])
    dentro = opaco & ~linha
    h, w = linha.shape
    for y, x in zip(*np.nonzero(linha)):
        viz = [lab[a, b] for a, b in ((y + dy, x + dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx)
               if 0 <= a < h and 0 <= b < w and dentro[a, b]]
        if not viz:
            saida[y, x, :3] = PRETO_AEKO
            continue
        c = min(viz, key=lambda v: v[0])
        saida[y, x, :3] = ea.lab_para_srgb(np.array([max(4.0, c[0] * 0.35), c[1] * 0.7, c[2] * 0.7]))
    return saida


def cor_contorno_auto(rgba: np.ndarray, a: dict, p: dict):
    """
    A cor do contorno quando o pedido é `auto`: no aeko (peso ≥ 0,5) o preto `010000`; no equipe, o que a beirada da
    arte já tem: escura e quase neutra → o preto da equipe; escura e com cor → um escuro da cor vizinha; clara (sem
    contorno) → o preto da equipe.
    """
    if a["peso_aeko"] >= 0.5:
        return "preto"
    opaco = rgba[..., 3] > 0
    beirada = opaco & ~_vizinhos4(opaco, False)
    if not beirada.any():
        return a["cor_contorno"]
    lab = ea.srgb_para_lab(rgba[..., :3][beirada])
    escuros = lab[:, 0] < p["contorno_L"]
    if escuros.mean() >= 0.5:
        croma = float(np.hypot(lab[escuros, 1], lab[escuros, 2]).mean())
        return "escuro" if croma > 12 else a["cor_contorno"]
    return a["cor_contorno"]


# --- a nota de aderência ao estilo -------------------------------------------------------------------------


def _criterio_contorno(rgba: np.ndarray, peso_aeko: float, p: dict) -> np.ndarray:
    """Quanto cada pixel conta como contorno: no aeko, preto (canal máximo ≤ 4); no equipe, escuro (L < contorno_L)."""
    rgb = rgba[..., :3]
    preto = rgb.max(-1) <= 4
    escuro = ea.srgb_para_lab(rgb)[..., 0] < p["contorno_L"]
    return peso_aeko * preto + (1 - peso_aeko) * escuro


def resumo_rampas(m: dict) -> dict:
    """De uma medida de medir_objeto: tons médios por família com matiz, ΔL mediano e croma da sombra."""
    fam = [f for f in m["familias"] if not f["neutra"]]
    saida = {}
    if fam:
        saida["tons"] = float(np.mean([f["tons"] for f in fam]))
    dls = [b - a for f in fam for a, b in zip(f["L"], f["L"][1:])]
    if dls:
        saida["degrau"] = float(np.median(dls))
    razoes = [f["C"][0] / max(f["C"]) for f in fam if f["tons"] >= 3 and max(f["C"]) > 0]
    if razoes:
        saida["croma_escuro"] = float(np.mean(razoes))
    giros = [((f["h"][-1] - f["h"][0] + 180) % 360) - 180 for f in fam if f["tons"] >= 3 and f["C"][0] > 8]
    if giros:
        saida["giro"] = float(np.median(giros))
    return saida


def nota_estilo(rgba: np.ndarray, a: dict, com_contorno: bool = True, parametros: dict | None = None) -> tuple[float, dict]:
    """
    Nota 0–10 de aderência da arte ao alvo `a` (de alvo()), e as partes (cada uma de 0 a 1, com o valor medido):
    - paleta: fração dos pixels a menos de um JND (ΔE 2,3) de alguma cor da paleta do alvo;
    - contorno: fração da beirada da silhueta que é contorno do alvo (_criterio_contorno), dividida pela fração do
      gabarito (borda) e limitada a 1; fora da conta com `com_contorno=False` (terrenos, tiles);
    - tons, degrau, sombra: limites de um lado só, `1 − excesso ÷ faixa`, limitado a [0, 1]. Tons por família com
      matiz: excesso = medido − (alvo + folga); ΔL mediano entre tons vizinhos: excesso = (alvo − folga) − medido;
      croma do tom mais escuro ÷ o maior da rampa: excesso = medido − (alvo + folga). Folga e faixa de cada um em
      `tolerancias` ([folga, faixa]).
    Parte que não dá para medir (arte sem rampa de 3 tons, por exemplo) sai da conta e os pesos se redistribuem.
    """
    p = {**PARAMETROS, **(parametros or {})}
    m = medir_objeto(rgba, a["paleta"])
    partes: dict = {"paleta": (m.get("paleta_jnd", 0.0), m.get("paleta_jnd", 0.0))}
    if com_contorno:
        opaco = rgba[..., 3] > 0
        beirada = opaco & ~_vizinhos4(opaco, False)
        if beirada.any():
            frac = float(_criterio_contorno(rgba, a["peso_aeko"], p)[beirada].mean())
            partes["contorno"] = (min(1.0, frac / max(1e-6, a["borda"])), frac)
    r = resumo_rampas(m)
    tol = a["tolerancias"]
    # Limites de um lado só: o estilo pede no máximo tantos tons, degrau de L no mínimo tal e sombra não mais
    # saturada que tal; ter menos tons, degraus maiores ou sombra mais neutra não tira nota.
    excesso = {
        "tons": lambda x: x - (a["tons"] + tol["tons"][0]),
        "degrau": lambda x: (a["degrau"] - tol["degrau"][0]) - x,
        "croma_escuro": lambda x: x - (a["croma_escuro"] + tol["croma_escuro"][0]),
    }
    for parte, chave in (("tons", "tons"), ("degrau", "degrau"), ("sombra", "croma_escuro")):
        if chave in r:
            partes[parte] = (float(np.clip(1 - max(0.0, excesso[chave](r[chave])) / tol[chave][1], 0, 1)), r[chave])
    total = sum(PESOS_NOTA[k] for k in partes)
    nota = 10 * sum(PESOS_NOTA[k] * v[0] for k, v in partes.items()) / total
    return round(float(nota), 2), {k: {"nota": round(v[0], 3), "medido": round(v[1], 3)} for k, v in partes.items()}


# --- prévia ------------------------------------------------------------------------------------------------


def _xadrez(w: int, h: int, lado: int = 8) -> Image.Image:
    ys, xs = np.mgrid[0:h, 0:w]
    v = np.where(((ys // lado) + (xs // lado)) % 2 == 0, 236, 250).astype(np.uint8)
    return Image.fromarray(np.dstack([v, v, v, np.full_like(v, 255)]))


def previa(imagens: list[np.ndarray], escala: int = 4, rotulos: list[str] | None = None) -> Image.Image:
    """As imagens lado a lado, ampliadas, sobre xadrez, com um rótulo em cima de cada."""
    rotulos = rotulos or [""] * len(imagens)
    paineis = []
    for arr in imagens:
        im = Image.fromarray(arr).resize((arr.shape[1] * escala, arr.shape[0] * escala), Image.NEAREST)
        fundo = _xadrez(im.width, im.height, 4 * escala)
        fundo.alpha_composite(im)
        paineis.append(fundo)
    folga, topo = 12, 18
    folha = Image.new("RGBA", (sum(pn.width for pn in paineis) + folga * (len(paineis) + 1), max(pn.height for pn in paineis) + topo + folga), (255, 255, 255, 255))
    d = ImageDraw.Draw(folha)
    x = folga
    for pn, rot in zip(paineis, rotulos):
        d.text((x, 3), rot, fill=(30, 30, 30, 255))
        folha.paste(pn, (x, topo))
        x += pn.width + folga
    return folha


# --- medidas por objeto (estudo, nota e validação) ---------------------------------------------------------


def componentes(opaco: np.ndarray, minimo: int = 24):
    """Os objetos (componentes 8-conexos) de uma máscara: lista de (fatia, máscara do objeto na fatia)."""
    from scipy import ndimage

    rotulos, _n = ndimage.label(opaco, structure=np.ones((3, 3)))
    saida = []
    for i, fatia in enumerate(ndimage.find_objects(rotulos), 1):
        m = rotulos[fatia] == i
        if m.sum() >= minimo:
            saida.append((fatia, m))
    return saida


def medir_objeto(rgba: np.ndarray, paleta: np.ndarray | None = None, beirada_transparente: bool = True) -> dict:
    """
    O que o estudo mede num objeto (RGBA, alfa > 0 = opaco): cores, contorno (preto, tinta, L e croma da beirada,
    espessura), tinta interna, rampas por família de matiz (tons com ≥ 3 % da família, nas famílias com ≥ 8 % do
    objeto; L, croma e matiz de cada tom), xadrez, pixels isolados e, com `paleta`, a aderência a ela (fração dos
    pixels com a cor exata, a um JND, e o ΔE médio à cor mais perto). `beirada_transparente`: se a beirada do recorte
    conta como transparência (não, para janelas de uma folha).
    """
    a = rgba[..., 3] > 0
    rgb = rgba[..., :3]
    borda = a & ~_vizinhos4(a, not beirada_transparente)
    lab = ea.srgb_para_lab(rgb)
    L = lab[..., 0]
    C = np.hypot(lab[..., 1], lab[..., 2])
    preto = a & (rgb.max(-1) <= 4)
    tinta = a & (L < PARAMETROS["tinta_L"])
    escuro = a & (L < PARAMETROS["contorno_L"])
    r: dict = {"pixels": int(a.sum())}
    cores, contagem = np.unique(rgb[a], axis=0, return_counts=True)
    r["cores"] = int(len(cores))
    nb = int(borda.sum())
    r["borda_pixels"] = nb
    r["borda_preta"] = float((borda & preto).sum() / max(1, nb))
    r["borda_tinta"] = float((borda & tinta).sum() / max(1, nb))
    r["borda_escura"] = float((borda & escuro).sum() / max(1, nb))
    r["borda_L"] = float(L[borda].mean()) if nb else float("nan")
    r["borda_C"] = float(C[borda].mean()) if nb else float("nan")
    pa = np.pad(a, 1, constant_values=not beirada_transparente)
    pt = np.pad(tinta, 1)
    duplo = np.zeros_like(a)
    h, w = a.shape
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        fora = ~pa[1 + dy : 1 + dy + h, 1 + dx : 1 + dx + w]
        duplo |= borda & tinta & fora & pt[1 - dy : 1 - dy + h, 1 - dx : 1 - dx + w]
    r["contorno_duplo"] = float(duplo.sum() / max(1, int((borda & tinta).sum())))
    interior = a & ~borda
    r["tinta_interna"] = float((interior & tinta).sum() / max(1, int(interior.sum())))
    q = rgb.astype(np.int64)
    k = (q[..., 0] << 16) | (q[..., 1] << 8) | q[..., 2]
    op2 = a[:-1, :-1] & a[:-1, 1:] & a[1:, :-1] & a[1:, 1:]
    xadrez = op2 & (k[:-1, :-1] == k[1:, 1:]) & (k[:-1, 1:] == k[1:, :-1]) & (k[:-1, :-1] != k[:-1, 1:])
    r["xadrez"] = float(xadrez.sum() / max(1, int(op2.sum())))
    kp = np.pad(k, 1, constant_values=-1)
    igual = (kp[:-2, 1:-1] == k) | (kp[2:, 1:-1] == k) | (kp[1:-1, :-2] == k) | (kp[1:-1, 2:] == k)
    r["isolados"] = float((interior & ~igual).sum() / max(1, int(interior.sum())))
    sel = a & ~tinta
    r["croma"] = float(C[sel].mean()) if sel.any() else float("nan")
    familias = []
    cs, ct = np.unique(rgb[sel], axis=0, return_counts=True)
    if len(cs):
        lc = ea.srgb_para_lab(cs)
        Lc, Cc = lc[:, 0], np.hypot(lc[:, 1], lc[:, 2])
        Hc = np.degrees(np.arctan2(lc[:, 2], lc[:, 1])) % 360
        wts = ct.astype(float)
        neutro = Cc < PARAMETROS["croma_neutro"]
        rot = np.full(len(cs), -1)
        if (~neutro).any():
            rot[~neutro] = familias_rapidas(lc[~neutro], wts[~neutro], 20.0)
        rot[neutro] = 10_000
        for g in np.unique(rot):
            s = rot == g
            if wts[s].sum() < 0.08 * wts.sum():
                continue
            idx = np.flatnonzero(s & (wts >= 0.03 * wts[s].sum()))
            idx = idx[np.argsort(Lc[idx])]
            familias.append({
                "neutra": bool(g == 10_000), "peso": float(wts[s].sum() / wts.sum()), "tons": int(len(idx)),
                "L": Lc[idx].round(1).tolist(), "C": Cc[idx].round(1).tolist(), "h": Hc[idx].round(1).tolist(),
                "rgb": [ea.hexa(cs[i]) for i in idx],
            })
    r["familias"] = familias
    if paleta is not None and len(paleta):
        lab_p = ea.srgb_para_lab(paleta)
        lab_c = ea.srgb_para_lab(cores)
        dmin = np.empty(len(lab_c))
        for i in range(0, len(lab_c), 256):
            dmin[i : i + 256] = np.linalg.norm(lab_c[i : i + 256, None, :] - lab_p[None, :, :], axis=2).min(1)
        tot = contagem.sum()
        r["paleta_exata"] = float(contagem[dmin < 1e-6].sum() / tot)
        r["paleta_jnd"] = float(contagem[dmin <= JND].sum() / tot)
        r["paleta_dE"] = float((contagem * dmin).sum() / tot)
    return r


# --- a ferramenta ------------------------------------------------------------------------------------------


def parametros_do_alvo(a: dict, tons: int | None = None, parametros: dict | None = None) -> dict:
    p = {**PARAMETROS, **(parametros or {})}
    p.update({"tons": int(tons) if tons else int(round(a["tons"] + 0.5)), "degrau": a["degrau"],
              "croma_escuro": a["croma_escuro"], "giro": a["giro"]})
    return p


def _paleta_pedida(paleta: str, a: dict):
    """(cores, penalidade) da paleta a que as tentativas prendem; quando prender é a escada que decide."""
    if paleta == "livre":
        return None, None
    if paleta in ("auto", "estilo"):
        return a["paleta"], a["penalidade"]
    if paleta == "aeko":
        return paleta_aeko(), None
    if paleta == "equipe":
        return paleta_equipe(), None
    return paleta_de_arquivo(paleta), None


def cobertura_de_cores(rgba: np.ndarray, k: int, p: dict) -> float:
    """
    Que fração dos pixels opacos cabe nas `k` cores mais usadas de cada família de matiz. Arte já no estilo tem
    cobertura alta (com k = tons do alvo + 1: mediana 0,92 nos objetos da equipe e 0,97 nas peças no estilo Aeko, p10
    0,66 e 0,88); arte borrada, com degradê ou com cores tremidas fica abaixo de 0,35 (as cores se espalham em
    centenas de tons de menos de 3 % cada, que a contagem de tons da nota não vê). Medido em 2026-10-20.
    """
    opaco = rgba[..., 3] > 0
    if not opaco.any():
        return 1.0
    cores, cont = np.unique(rgba[..., :3][opaco], axis=0, return_counts=True)
    lab = ea.srgb_para_lab(cores)
    pesos = cont.astype(float)
    neutro = np.hypot(lab[:, 1], lab[:, 2]) < p["croma_neutro"]
    familia = np.full(len(cores), -1)
    if (~neutro).any():
        familia[~neutro] = familias_rapidas(lab[~neutro], pesos[~neutro], p["familia_ab"])
    familia[neutro] = familia.max() + 1
    coberto = sum(np.sort(pesos[familia == g])[::-1][:k].sum() for g in np.unique(familia))
    return float(coberto / pesos.sum())


def escada(a: dict, paleta: str, tons: int | None) -> list[dict]:
    """
    As tentativas, da menor intervenção para a maior (a primeira que chega à nota mínima é a entregue, para mexer o
    menos possível no desenho):
    1. só o fundo e o contorno, as cores como estão;
    2. cada cor presa à cor mais perto da paleta do alvo, sem reduzir tons;
    3. rampas com um tom a mais que o alvo, livres; 4. as mesmas presas à paleta;
    5. rampas com os tons do alvo, presas; 6. um tom a menos, degrau 25 % maior e sombra puxada com força 1;
    7. dois a menos (no mínimo 2), degrau 50 % maior.
    As duas primeiras só valem se a entrada já tem as cores concentradas (cobertura_de_cores ≥ cobertura_minima):
    senão uma arte borrada ou com degradê passaria só pela paleta. Com --tons N, só as rampas, todas com N; --paleta livre nunca prende; estilo, aeko,
    equipe ou um PNG prendem sempre.
    """
    alvo_k = int(round(a["tons"]))
    passos = [
        {"rampa": False, "presa": False},
        {"rampa": False, "presa": True},
        {"rampa": True, "presa": False, "tons": alvo_k + 1},
        {"rampa": True, "presa": True, "tons": alvo_k + 1},
        {"rampa": True, "presa": True, "tons": alvo_k},
        {"rampa": True, "presa": True, "tons": max(2, alvo_k - 1), "degrau": 1.25, "forca_croma": 1.0},
        {"rampa": True, "presa": True, "tons": max(2, alvo_k - 2), "degrau": 1.5, "forca_croma": 1.0},
    ]
    if tons:
        passos = [{**q, "tons": int(tons)} for q in passos if q["rampa"]]
    if paleta == "livre":
        passos = [{**q, "presa": False} for q in passos]
    elif paleta != "auto":
        passos = [{**q, "presa": True} for q in passos]
    vistos, saida = set(), []
    for q in passos:
        chave = json.dumps(q, sort_keys=True)
        if chave not in vistos:
            vistos.add(chave)
            saida.append(q)
    return saida


def estilizar_com_nota(limpa: np.ndarray, a: dict, paleta: str = "auto", tons: int | None = None, contorno: str = "externo",
                       cor_contorno: str = "auto", nota_minima: float | None = None, parametros: dict | None = None) -> tuple[np.ndarray, dict]:
    """
    Estiliza subindo a escada de tentativas (escada) até a nota contra o alvo chegar à mínima. Se o contorno tirou
    menos de 0,8 numa tentativa, as seguintes usam a cor de contorno do alvo (preto no aeko). Entrega a primeira
    tentativa que chega à mínima ou, se nenhuma chega, a de maior nota, com o que faltou.
    """
    if nota_minima is None:
        nota_minima = NOTA_MINIMA_PADRAO[a["estilo"]]
    base = parametros_do_alvo(a, tons, parametros)
    cores, penalidade = _paleta_pedida(paleta, a)
    cor = cor_contorno_auto(limpa, a, base) if cor_contorno == "auto" else cor_contorno
    # as tentativas sem rampa só valem para arte que já tem as cores concentradas em poucos tons
    cobertura = cobertura_de_cores(limpa, int(round(a["tons"])) + 1, base)
    ja_concentrada = cobertura >= base["cobertura_minima"]
    tentativas = []
    melhor = None
    escolhida = None
    for i, passo in enumerate(escada(a, paleta, tons)):
        p = dict(base)
        p["rampa"] = passo["rampa"]
        if "tons" in passo:
            p["tons"] = passo["tons"]
        p["degrau"] = base["degrau"] * passo.get("degrau", 1.0)
        p["forca_croma"] = passo.get("forca_croma", base["forca_croma"])
        presa = passo["presa"] and cores is not None
        feita, resumo = estilizar(limpa, p, contorno, cor, cores if presa else None, penalidade if presa else None)
        nota, partes = nota_estilo(feita, a, contorno != "nao", p)
        valida = passo["rampa"] or ja_concentrada
        tentativas.append({"tentativa": i + 1, "nota": nota, "partes": partes, "rampa": passo["rampa"], "presa": presa,
                           "tons": p["tons"] if passo["rampa"] else None, "degrau": round(p["degrau"], 2),
                           "forca_croma": p["forca_croma"], "cor_contorno": cor if isinstance(cor, str) else "#" + ea.hexa(cor),
                           "valida": valida})
        if valida and (melhor is None or not melhor[4] or nota > melhor[2]):
            melhor = (feita, resumo, nota, partes, True)
        elif melhor is None:
            melhor = (feita, resumo, nota, partes, False)
        if valida and nota >= nota_minima:
            escolhida = (feita, resumo, nota, partes, True)
            break
        if "contorno" in partes and partes["contorno"]["nota"] < 0.8 and contorno != "nao":
            cor = "preto" if a["peso_aeko"] >= 0.5 else a["cor_contorno"]
    feita, resumo, nota, partes, _valida = escolhida or melhor
    resumo.update({"estilo": a["estilo"], "mistura": a["peso_aeko"], "nota": nota, "nota_minima": nota_minima,
                   "partes": partes, "tentativas": tentativas, "chegou": nota >= nota_minima,
                   "cobertura_entrada": round(cobertura, 3)})
    if nota < nota_minima:
        resumo["faltou"] = [k for k, v in sorted(partes.items(), key=lambda kv: kv[1]["nota"]) if v["nota"] < 0.8]
    return feita, resumo


def aplicar(entrada, saida, estilo: str = "aeko", mistura: float = 0.5, fundo: str = "auto", paleta: str = "auto",
            tons: int | None = None, contorno: str = "externo", cor_contorno: str = "auto", escala: str = "auto",
            nota_minima: float | None = None, com_previa: bool = False, parametros: dict | None = None) -> dict:
    original = ler_rgba(entrada)
    n = detectar_escala(original) if escala == "auto" else max(1, int(escala))
    pequena = reduzir(original, n)
    limpa, fundo_usado = tirar_fundo(pequena, fundo, parametros)
    a = alvo(estilo, mistura)
    feita, resumo = estilizar_com_nota(limpa, a, paleta, tons, contorno, cor_contorno, nota_minima, parametros)
    final = ampliar(feita, n)
    Path(saida).parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(final).save(saida)
    resumo.update({"entrada": str(entrada), "saida": str(saida), "escala": n, "fundo": fundo_usado, "paleta": paleta,
                   "tamanho": [int(final.shape[1]), int(final.shape[0])]})
    if com_previa:
        caminho = str(Path(saida).with_suffix("")) + ".previa.png"
        previa([pequena, feita], 4, ["antes", f"depois: {estilo} (nota {resumo['nota']:.1f})"]).save(caminho)
        resumo["previa"] = caminho
    return resumo


NOMES_DAS_PARTES = {"paleta": "paleta", "contorno": "contorno", "tons": "tons por rampa", "degrau": "degrau de L", "sombra": "croma da sombra"}


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # o console do Windows (cp1252) não tem a seta
    except (AttributeError, ValueError):
        pass
    ap = argparse.ArgumentParser(description="Passa qualquer arte para o estilo do Aeko, da equipe ou a mistura dos dois.")
    ap.add_argument("entrada")
    ap.add_argument("saida")
    ap.add_argument("--estilo", default="aeko", choices=ESTILOS)
    ap.add_argument("--mistura", type=float, default=0.5, help="aeko+equipe: 0 = só equipe, 1 = só Aeko (padrão 0,5)")
    ap.add_argument("--fundo", default="auto", help="auto, nenhum ou #RRGGBB")
    ap.add_argument("--paleta", default="auto", help="auto, estilo, livre, aeko, equipe ou um PNG de onde tirar as cores")
    ap.add_argument("--tons", type=int, default=None, help="máximo de tons por família (padrão: o do estilo)")
    ap.add_argument("--contorno", default="externo", choices=["externo", "todos", "nao"])
    ap.add_argument("--cor-contorno", default="auto", choices=["auto", "preto", "escuro"])
    ap.add_argument("--escala", default="auto", help="auto ou o fator inteiro em que a arte está ampliada")
    ap.add_argument("--nota-minima", type=float, default=None, help="padrão: 8 no aeko e no aeko+equipe, 7 no equipe")
    ap.add_argument("--exigir", action="store_true", help="sai com código 3 se a nota mínima não foi alcançada")
    ap.add_argument("--previa", action="store_true", help="grava <saida>.previa.png (antes | depois, 4×)")
    ap.add_argument("--json", action="store_true", help="escreve o resumo numa linha JSON no fim")
    ap.add_argument("--parametros", help="JSON que sobrepõe PARAMETROS (para experimentar)")
    args = ap.parse_args()
    if args.fundo not in ("auto", "nenhum"):
        try:
            ler_cor(args.fundo)
        except ValueError as erro:
            ap.error(str(erro))
    if args.tons is not None and not 1 <= args.tons <= 16:
        ap.error("--tons vai de 1 a 16")
    if not 0 <= args.mistura <= 1:
        ap.error("--mistura vai de 0 a 1")
    if args.escala != "auto" and not (args.escala.isdigit() and 1 <= int(args.escala) <= 16):
        ap.error("--escala é auto ou um inteiro de 1 a 16")
    if args.paleta not in ("auto", "estilo", "livre", "aeko", "equipe") and not os.path.isfile(args.paleta):
        ap.error(f"--paleta: {args.paleta} não existe (auto, estilo, livre, aeko, equipe ou um PNG)")
    if not os.path.isfile(args.entrada):
        ap.error(f"a entrada não existe: {args.entrada}")
    resumo = aplicar(args.entrada, args.saida, args.estilo, args.mistura, args.fundo, args.paleta, args.tons, args.contorno,
                     args.cor_contorno, args.escala, args.nota_minima, args.previa,
                     json.loads(args.parametros) if args.parametros else None)
    fam = resumo["familias"]
    estilo = args.estilo + (f" (mistura {args.mistura:g})" if args.estilo == "aeko+equipe" else "")
    print(f"{args.entrada} → {args.saida}")
    print(f"  estilo {estilo}; escala {resumo['escala']}×, fundo {resumo['fundo']}, paleta {resumo['paleta']}")
    print(f"  cores {resumo['cores_antes']} → {resumo['cores_depois']} em {len(fam)} famílias (tons: {', '.join(str(f['tons']) for f in fam) or '-'})")
    c = resumo["contorno"]
    if c["modo"] != "nao":
        print(f"  contorno {c['modo']} ({c['cor']}, {'repintado na beirada' if c['no_lugar'] else 'por fora'}): {c['pixels']} pixels")
    partes = ", ".join(f"{NOMES_DAS_PARTES[k]} {10 * v['nota']:.1f}" for k, v in resumo["partes"].items())
    print(f"  nota {resumo['nota']:.2f} (mínima {resumo['nota_minima']:g}) em {len(resumo['tentativas'])} tentativa(s): {partes}")
    if not resumo["chegou"]:
        faltou = ", ".join(NOMES_DAS_PARTES[k] for k in resumo.get("faltou", [])) or "um pouco de tudo"
        print(f"  AVISO: não chegou à nota mínima; faltou: {faltou}. Tente --paleta estilo, --tons menor ou --contorno externo.")
    if "previa" in resumo:
        print(f"  prévia: {resumo['previa']}")
    if args.json:
        print(json.dumps(resumo, ensure_ascii=False, default=float))
    return 3 if args.exigir and not resumo["chegou"] else 0


if __name__ == "__main__":
    sys.exit(main())
