"""Monta partituras JSON no Arrangement do Ableton Live (2026-10-20).

Uso:
    python -I tools/som/ableton_montar.py <partitura.json> [...] [--offset COMPASSO] [--limpar] [--teste] [--seco]

O contrato (formato da partitura, papéis, andamento, exportação) está em docs/audio/PRODUCAO.md.
O que este script faz, por partitura:

1. Para cada papel (e cada camada do papel em tools/som/instrumentos.json) que recebe nota,
   acha a trilha MIDI pelo nome ("<papel>" ou "<papel>:<camada>") ou cria uma no fim do set,
   com o instrumento, os efeitos (com os parâmetros) e um EQ Eight cujo "Output Gain" é o
   ganho relativo do papel.
2. Escreve as notas num clipe no slot 0 (temporário), já no andamento do set: o set fica em
   120 BPM e um tempo (semínima) da peça a T BPM vale 120/T tempos do set. Notas em lotes.
3. Duplica o clipe para o Arrangement no lugar da peça, apaga o clipe do slot e dá ao clipe
   do arranjo o nome da chave. Peça em laço ("laco": true) vai duas vezes seguidas: o corte
   pega a segunda volta, que já começa com a cauda da primeira e por isso emenda sem estalo.
4. Cria o locator "<chave> | <bpm> BPM | <duração s>" no começo da peça.
5. Deixa 4 compassos do set de silêncio depois da peça (mais a cauda_s) antes da próxima.
6. Grava tools/som/mapa_do_set.json depois de cada peça (início e fim em tempos do set e em
   segundos, o trecho a cortar, os trechos dos kits, as trilhas usadas).

Rodar de novo continua de onde o mapa parou; peça cuja chave já está no mapa é pulada
(o AbletonMCP 1.7.1 não apaga clipe do Arrangement: para refazer uma peça, apague o clipe e o
locator à mão no Live, tire a peça do mapa e rode de novo com --offset no lugar dela).

Opções:
    --offset N   começa a primeira peça desta chamada no compasso N do set (1 = início).
    --limpar     esquece as peças do mapa que não são de teste (depois de apagá-las à mão no
                 Live) e apaga clipes esquecidos no slot temporário das trilhas de papel.
    --teste      marca as peças como "teste" no mapa (o montador real começa depois delas).
    --seco       não fala com o Live: só calcula posições e mostra o que faria.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import math
import os
import sys
import time

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)

from ableton import Ableton, ErroAbleton, manter_acordado  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(AQUI))
INSTRUMENTOS = os.path.join(AQUI, "instrumentos.json")
MAPA = os.path.join(AQUI, "mapa_do_set.json")

BPM_SET = 120.0
TEMPOS_POR_COMPASSO_SET = 4.0          # o set fica em 4/4
SEG_POR_TEMPO_SET = 60.0 / BPM_SET     # 0,5 s
SILENCIO_COMPASSOS = 4
LOTE_NOTAS = 400
SLOT_TEMP = 0


def log(*a):
    print(*a, flush=True)


# ---------------------------------------------------------------- partitura

class ErroPartitura(ValueError):
    pass


def ler_partitura(caminho: str) -> dict:
    with open(caminho, encoding="utf-8") as f:
        p = json.load(f)
    for campo in ("chave", "bpm", "compassos", "trilhas"):
        if campo not in p:
            raise ErroPartitura(f"{caminho}: falta '{campo}'")
    num, den = p.get("compasso", [4, 4])
    if num <= 0 or den not in (1, 2, 4, 8, 16):
        raise ErroPartitura(f"{caminho}: compasso inválido {p.get('compasso')}")
    if not (20 <= float(p["bpm"]) <= 400):
        raise ErroPartitura(f"{caminho}: bpm fora do razoável ({p['bpm']})")
    p["_arquivo"] = os.path.abspath(caminho)
    return p


def tempos_por_compasso(p: dict) -> float:
    """Tempos (semínimas) por compasso da peça: 6/8 dá 3, 3/4 dá 3, 4/4 dá 4."""
    num, den = p.get("compasso", [4, 4])
    return num * 4.0 / den


def notas_por_papel(p: dict) -> dict[str, list]:
    """Junta as trilhas da partitura por papel: {papel: [[altura, inicio, dur, vel], ...]}."""
    out: dict[str, list] = {}
    for t in p["trilhas"]:
        papel = t.get("papel")
        if not papel:
            raise ErroPartitura(f"{p['chave']}: trilha sem papel")
        for n in t.get("notas", []):
            if len(n) < 4:
                raise ErroPartitura(f"{p['chave']}/{papel}: nota incompleta {n}")
            out.setdefault(papel, []).append(n)
    return out


def distribuir(papel: str, cfg_papel: dict, notas: list) -> tuple[list[tuple[str, dict, list]], dict]:
    """Reparte as notas de um papel pelas camadas. Devolve [(nome da trilha, camada, notas)] e
    a contagem de notas descartadas por altura."""
    camadas = cfg_papel["camadas"]
    saida = []
    usadas: set[int] = set()
    for i, c in enumerate(camadas):
        nome = papel if len(camadas) == 1 else f"{papel}:{c.get('nome', i)}"
        lista = []
        trad = {int(k): v for k, v in c.get("traducao", {}).items()} if c.get("traducao") else None
        faixa = c.get("notas")
        for idx, (alt, ini, dur, vel, *_r) in enumerate(notas):
            alt = int(alt)
            if trad is not None:
                if alt not in trad:
                    continue
                destino = trad[alt]
            elif faixa is not None:
                if not (faixa[0] <= alt <= faixa[1]):
                    continue
                destino = alt
            else:
                destino = alt
            usadas.add(idx)
            lista.append([destino, float(ini), float(dur), int(vel)])
        if lista:
            saida.append((nome, c, lista))
    descartadas: dict[int, int] = {}
    for idx, n in enumerate(notas):
        if idx not in usadas:
            descartadas[int(n[0])] = descartadas.get(int(n[0]), 0) + 1
    return saida, descartadas


# ---------------------------------------------------------------- mapa

def ler_mapa() -> dict:
    if os.path.exists(MAPA):
        with open(MAPA, encoding="utf-8") as f:
            return json.load(f)
    return {"andamento_set": BPM_SET, "compasso_set": [4, 4], "silencio_compassos": SILENCIO_COMPASSOS,
            "proximo_inicio_tempo": 0.0, "pecas": []}


def gravar_mapa(mapa: dict) -> None:
    tmp = MAPA + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(mapa, f, ensure_ascii=False, indent=1)
    os.replace(tmp, MAPA)


def arredondar_compasso(tempo: float) -> float:
    return math.ceil(tempo / TEMPOS_POR_COMPASSO_SET - 1e-9) * TEMPOS_POR_COMPASSO_SET


def fmt_s(x: float) -> str:
    return f"{x:.1f}".replace(".", ",")


# ---------------------------------------------------------------- Live

class Montador:
    def __init__(self, live: Ableton | None, cfg: dict):
        self.live = live
        self.cfg = cfg
        self._trilhas: dict[str, int] | None = None

    def trilhas(self) -> dict[str, int]:
        if self._trilhas is None:
            n = self.live.pedir("get_session_info")["track_count"]
            self._trilhas = {}
            for i in range(n):
                nome = self.live.pedir("get_track_info", track_index=i)["name"]
                self._trilhas.setdefault(nome, i)
        return self._trilhas

    def carregar(self, ti: int, uri: str, caminho: str) -> str:
        """Carrega pelo uri; se o navegador não acha (FileId mudou), procura pelo caminho."""
        try:
            return self.carregar_uri(ti, uri)
        except ErroAbleton as e:
            if "not found" not in str(e):
                raise
        pasta, nome = caminho.rsplit("/", 1)
        r = self.live.pedir("get_browser_items_at_path", path=pasta)
        for it in r.get("items", []):
            if it["name"] == nome and it.get("uri"):
                log(f"    (uri antigo não achado; novo: {it['uri']})")
                return self.carregar_uri(ti, it["uri"])
        raise ErroAbleton(f"preset não encontrado no navegador: {caminho}")

    def carregar_uri(self, ti: int, uri: str) -> str:
        # Com o set pesado, o Remote Script desiste em 10 s mas o device entra depois; tentar de novo
        # punha o device em dobro (dois "Wooden Room" em 2026-10-20). Espera o device aparecer.
        antes = self.live.pedir("get_track_info", track_index=ti)["devices"]
        try:
            return self.live.pedir("load_instrument_or_effect", track_index=ti, uri=uri)["item_name"]
        except ErroAbleton as e:
            if "Timeout" not in str(e):
                raise
            for _ in range(60):
                time.sleep(1.0)
                devs = self.live.pedir("get_track_info", track_index=ti)["devices"]
                if [d["name"] for d in devs] != [d["name"] for d in antes]:
                    log("    (o Live demorou para carregar; seguiu)")
                    return devs[-1]["name"]
            raise

    def ajustar(self, ti: int, di: int, params: dict) -> None:
        if not params:
            return
        dev = self.live.pedir("get_device_parameters", track_index=ti, device_index=di)["device"]
        por_nome = {p["name"]: p for p in dev["parameters"]}
        for nome, valor in params.items():
            p = por_nome.get(nome)
            if p is None:
                raise ErroAbleton(f"{dev['name']}: parâmetro '{nome}' não existe")
            v = max(p["min"], min(p["max"], float(valor)))
            self.live.pedir("set_device_parameter", track_index=ti, device_index=di,
                            parameter_index=p["index"], value=v)

    def criar_trilha(self) -> int:
        # Com o Live ocupado carregando instrumentos, o Remote Script desiste em 10 s mas a trilha
        # aparece depois (visto em 2026-10-20: ficou uma "50-MIDI" vazia); adota a que aparecer.
        antes = self.live.pedir("get_session_info")["track_count"]
        try:
            return self.live.pedir("create_midi_track", index=-1)["index"]
        except ErroAbleton as e:
            if "Timeout" not in str(e):
                raise
            for _ in range(30):
                time.sleep(1.0)
                if self.live.pedir("get_session_info")["track_count"] == antes + 1:
                    log("  o Live demorou para criar a trilha; adotada a que apareceu")
                    return antes
            raise

    def preparar_trilha(self, nome: str, camada: dict) -> int:
        tr = self.trilhas()
        if nome in tr:
            ti = tr[nome]
            devs = self.live.pedir("get_track_info", track_index=ti)["devices"]
            if devs:
                return ti
            log(f"  trilha '{nome}' existe sem instrumento: carregando")
        else:
            ti = self.criar_trilha()
            self.live.pedir("set_track_name", track_index=ti, name=nome)
            tr[nome] = ti
            log(f"  trilha nova {ti}: {nome}")
        self.carregar(ti, camada["uri"], camada["caminho"])
        for e in camada.get("efeitos", []):
            self.carregar(ti, e["uri"], e["caminho"])
        self.carregar(ti, "query:AudioFx#EQ%20Eight", "audio_effects/EQ Eight")
        devs = self.live.pedir("get_track_info", track_index=ti)["devices"]
        esperado = 2 + len(camada.get("efeitos", []))
        if len(devs) != esperado:
            raise ErroAbleton(f"trilha '{nome}': esperava {esperado} devices, há {[d['name'] for d in devs]}")
        # Parâmetros do próprio instrumento (2026-10-23: portamento e envelope de altura das vozes dos animais).
        self.ajustar(ti, 0, camada.get("parametros_instrumento", {}))
        for di, e in enumerate(camada.get("efeitos", []), start=1):
            self.ajustar(ti, di, e.get("parametros", {}))
        self.ajustar(ti, len(devs) - 1, {"Output Gain": camada.get("ganho_db", 0.0)})
        log(f"    {' > '.join(d['name'] for d in devs)} (ganho {camada.get('ganho_db', 0.0):+g} dB)")
        return ti

    def limpar_slot(self, ti: int) -> None:
        info = self.live.pedir("get_track_info", track_index=ti)
        if info["clip_slots"] and info["clip_slots"][SLOT_TEMP]["has_clip"]:
            self.live.pedir("delete_clip", track_index=ti, clip_index=SLOT_TEMP)

    def escrever(self, ti: int, chave: str, notas: list, fator: float, comprimento: float,
                 inicios: list[float]) -> None:
        self.limpar_slot(ti)
        self.live.pedir("create_clip", track_index=ti, clip_index=SLOT_TEMP, length=comprimento)
        self.live.pedir("set_clip_name", track_index=ti, clip_index=SLOT_TEMP, name=chave)
        conv = []
        for alt, ini, dur, vel in notas:
            if not (0 <= alt <= 127):
                continue
            conv.append({"pitch": int(alt), "start_time": round(ini * fator, 6),
                         "duration": max(0.001, round(dur * fator, 6)),
                         "velocity": max(1, min(127, int(vel))), "mute": False})
        for i in range(0, len(conv), LOTE_NOTAS):
            self.live.pedir("add_notes_to_clip", track_index=ti, clip_index=SLOT_TEMP, notes=conv[i:i + LOTE_NOTAS])
        for k, t0 in enumerate(inicios):
            self.live.pedir("duplicate_session_clip_to_arrangement", track_index=ti, clip_index=SLOT_TEMP,
                            destination_time=t0)
        self.live.pedir("delete_clip", track_index=ti, clip_index=SLOT_TEMP)
        clips = self.live.pedir("get_arrangement_clips", track_index=ti)["clips"]
        for k, t0 in enumerate(inicios):
            achou = False
            for ci, c in enumerate(clips):
                if abs(c["start_time"] - t0) < 1e-3:
                    nome = chave if k == 0 else f"{chave} (volta {k + 1})"
                    if c["name"] != nome:
                        self.live.pedir("set_arrangement_clip_name", track_index=ti, clip_index=ci, name=nome)
                    achou = True
                    break
            if not achou:
                raise ErroAbleton(f"clipe de '{chave}' não apareceu no Arrangement em {t0} (trilha {ti})")


# ---------------------------------------------------------------- montagem

def montar(args) -> int:
    with open(INSTRUMENTOS, encoding="utf-8") as f:
        cfg = json.load(f)
    papeis = cfg["papeis"]
    partituras = [ler_partitura(c) for c in args.partituras]

    mapa = ler_mapa()
    if args.limpar:
        antes = len(mapa["pecas"])
        mapa["pecas"] = [x for x in mapa["pecas"] if x.get("teste")]
        fim = max([x["proximo_livre_tempo"] for x in mapa["pecas"]], default=0.0)
        mapa["proximo_inicio_tempo"] = fim
        log(f"--limpar: {antes - len(mapa['pecas'])} peça(s) esquecidas no mapa; próximo início no tempo {fim:g}")

    chaves = {x["chave"] for x in mapa["pecas"]}
    pos = float(mapa.get("proximo_inicio_tempo", 0.0))
    if args.offset is not None:
        pos = (args.offset - 1) * TEMPOS_POR_COMPASSO_SET
    pos = arredondar_compasso(pos)

    # Confere papéis antes de mexer no Live
    for p in partituras:
        for papel in notas_por_papel(p):
            if papel not in papeis:
                raise ErroPartitura(f"{p['chave']}: papel '{papel}' não existe em instrumentos.json")

    live = None
    if not args.seco:
        live = Ableton(tempo_limite=120)
        live.conectar()
        info = live.pedir("get_session_info")
        if abs(info["tempo"] - BPM_SET) > 1e-6:
            live.pedir("set_tempo", tempo=BPM_SET)
            log(f"andamento do set: {info['tempo']} -> {BPM_SET:g}")
        if (info["signature_numerator"], info["signature_denominator"]) != (4, 4):
            log("AVISO: o set não está em 4/4; os compassos do mapa assumem 4/4")
    m = Montador(live, cfg)

    if args.limpar and live is not None:
        for nome, ti in m.trilhas().items():
            if nome.split(":")[0] in papeis:
                m.limpar_slot(ti)

    for p in partituras:
        chave = p["chave"]
        if chave in chaves:
            log(f"{chave}: já está no mapa, pulada")
            continue
        bpm = float(p["bpm"])
        fator = BPM_SET / bpm
        tpc = tempos_por_compasso(p)
        dur_peca = p["compassos"] * tpc                       # em tempos da peça
        por_papel = notas_por_papel(p)
        ultimo = max((float(n[1]) + float(n[2]) for ns in por_papel.values() for n in ns), default=0.0)
        if ultimo > dur_peca + 1e-6:
            log(f"AVISO {chave}: a última nota acaba em {ultimo:g} tempos, depois do fim ({dur_peca:g}); "
                "a peça vai até a última nota")
            dur_peca = ultimo
        dur_set = dur_peca * fator                             # em tempos do set
        laco = bool(p.get("laco", False))
        cauda_s = float(p.get("cauda_s", 0.0 if laco else 2.0))
        voltas = 2 if laco else 1
        inicio = pos
        inicios = [inicio + k * dur_set for k in range(voltas)]
        fim = inicio + voltas * dur_set
        if laco:
            corte = (inicio + dur_set, fim)
            corte_s = (corte[0] * SEG_POR_TEMPO_SET, corte[1] * SEG_POR_TEMPO_SET)
        else:
            corte = (inicio, fim)
            corte_s = (inicio * SEG_POR_TEMPO_SET, fim * SEG_POR_TEMPO_SET + cauda_s)
        livre = arredondar_compasso(fim + cauda_s / SEG_POR_TEMPO_SET + SILENCIO_COMPASSOS * TEMPOS_POR_COMPASSO_SET)
        dur_s = dur_set * SEG_POR_TEMPO_SET
        locator = f"{chave} | {bpm:g} BPM | {fmt_s(dur_s)} s"

        log(f"{chave}: {bpm:g} BPM, {p['compassos']} compassos de {p.get('compasso', [4, 4])[0]}/{p.get('compasso', [4, 4])[1]}"
            f" = {fmt_s(dur_s)} s; set {inicio:g} a {fim:g} (compasso {inicio / 4 + 1:g}){' em laço, 2 voltas' if laco else ''}")

        trilhas_usadas = []
        descartes: dict[str, dict] = {}
        contagem = {}
        for papel, notas in por_papel.items():
            partes, desc = distribuir(papel, papeis[papel], notas)
            if desc:
                descartes[papel] = {str(k): v for k, v in sorted(desc.items())}
                log(f"  AVISO {papel}: notas sem destino no kit (altura: quantas) {descartes[papel]}")
            for nome, camada, lista in partes:
                contagem[nome] = len(lista)
                trilhas_usadas.append(nome)
                if live is None:
                    log(f"  [seco] {nome}: {len(lista)} notas")
                    continue
                ti = m.preparar_trilha(nome, camada)
                m.escrever(ti, chave, lista, fator, dur_set, inicios)
                log(f"  {nome} (trilha {ti}): {len(lista)} notas")

        if live is not None:
            live.criar_locator(locator, inicio)

        entrada = {
            "chave": chave,
            "titulo": p.get("titulo", ""),
            "partitura": os.path.relpath(p["_arquivo"], RAIZ).replace("\\", "/"),
            "bpm": bpm,
            "compasso": p.get("compasso", [4, 4]),
            "compassos": p["compassos"],
            "laco": laco,
            "cauda_s": cauda_s,
            "locator": locator,
            "inicio_tempo": inicio,
            "fim_tempo": fim,
            "inicio_s": inicio * SEG_POR_TEMPO_SET,
            "fim_s": fim * SEG_POR_TEMPO_SET,
            "duracao_s": dur_s,
            "voltas": voltas,
            "corte_inicio_s": corte_s[0],
            "corte_fim_s": corte_s[1],
            "proximo_livre_tempo": livre,
            "trechos": p.get("trechos", []),
            "trilhas": trilhas_usadas,
            "notas_por_trilha": contagem,
            "descartadas": descartes,
            "teste": bool(args.teste),
            "montado_em": _dt.datetime.now().isoformat(timespec="seconds"),
        }
        if not args.seco:
            mapa["pecas"].append(entrada)
            mapa["proximo_inicio_tempo"] = livre
            gravar_mapa(mapa)
        chaves.add(chave)
        pos = livre

    if live is not None:
        live.fechar()
    if args.seco:
        log("(seco: nada foi gravado)")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("partituras", nargs="+")
    ap.add_argument("--offset", type=float, help="compasso do set onde começa a primeira peça (1 = início)")
    ap.add_argument("--limpar", action="store_true")
    ap.add_argument("--teste", action="store_true")
    ap.add_argument("--seco", action="store_true")
    args = ap.parse_args(argv)
    sys.stdout.reconfigure(encoding="utf-8")
    try:
        return montar(args)
    except (ErroPartitura, ErroAbleton) as e:
        print(f"ERRO: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    manter_acordado(True)
    try:
        sys.exit(main())
    finally:
        manter_acordado(False)
