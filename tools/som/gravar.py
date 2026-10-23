"""Grava o Arrangement do Live inteiro num arquivo de áudio, sem o diálogo de exportar (2026-10-20).

Uso:
    python -I tools/som/gravar.py [--inicio TEMPO] [--fim TEMPO] [--folga 4] [--faders 0.5] [--copiar-para ARQUIVO.wav]

Usa os comandos hv_* que tools/som/remote_script/gravacao.py acrescenta ao Remote Script do AbletonMCP:
arma uma trilha de áudio "zz_gravacao" com a entrada no Resampling (a saída do próprio Live) e o
monitor desligado, grava do tempo 0 até o fim da última peça do mapa (tools/som/mapa_do_set.json) mais
uma folga, em tempo real, e copia o arquivo gravado (o Live o põe na pasta Samples/Recorded do projeto)
para tools/som/gravacoes/. Depois: python -I tools/som/cortar.py <arquivo> [destinos].

A trilha de gravação é apagada no fim (é o jeito de o Live soltar o arquivo); a próxima gravação cria outra.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import shutil
import sys
import time

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from ableton import Ableton, ErroAbleton, manter_acordado  # noqa: E402

MAPA = os.path.join(AQUI, "mapa_do_set.json")
SAIDA = os.path.join(AQUI, "gravacoes")
TRILHA = "zz_gravacao"
ISCA = "zz_isca"
ISCA_URI = "query:Sounds#Winds:FileId_6608"  # Ocarina Basic (Operator): leve; só para levar o braço
TEMPO_SET = 120.0


def fim_do_mapa() -> float:
    with open(MAPA, encoding="utf-8") as f:
        mapa = json.load(f)
    # O corte vai até a cauda: o fim do corte (em segundos) convertido para tempos do set.
    fins = [max(p.get("fim_tempo", 0.0), p.get("corte_fim_s", 0.0) * TEMPO_SET / 60.0) for p in mapa.get("pecas", [])]
    return max(fins or [0.0])


def posicionar(live: Ableton, inicio: float) -> None:
    """Deixa o Live parado logo antes de `inicio`.

    O hv_record_range para e chama continue_playing, que retoma de onde o último play parou: pôr a
    agulha com o Live parado não adianta (em 2026-10-20 ele voltou a 5172 com a agulha em 4100, e o
    start_playing saiu do 0). Então: toca, pula para um compasso antes enquanto toca (o pulo espera o
    compasso), espera chegar e para ali. O começo exato vem do clipe gravado."""
    alvo = max(0.0, inicio - 4.0)
    live.pedir("start_playback")
    time.sleep(0.3)
    live.pedir("set_current_song_time", {"time": alvo})
    for _ in range(40):
        time.sleep(0.25)
        agora = live.pedir("get_session_info")["current_song_time"]
        # Com inicio < 4 o alvo é o 0 e a janela [alvo, inicio) ficava vazia (2026-10-23): pelo menos 2 tempos.
        if alvo - 0.5 <= agora < max(inicio, alvo + 2.0):
            break
    else:
        live.pedir("stop_playback")
        raise RuntimeError(f"a agulha não chegou ao tempo {alvo:g} (está em {agora:.1f})")
    live.pedir("stop_playback")
    time.sleep(0.5)


def apagar_trilha(live: Ableton, ti: int) -> None:
    # Com o Live ocupado o Remote Script desiste em 10 s, mas a trilha some depois.
    antes = live.pedir("get_session_info")["track_count"]
    try:
        live.pedir("hv_delete_track", {"track_index": ti})
    except ErroAbleton as e:
        if "Timeout" not in str(e):
            raise
        for _ in range(60):
            time.sleep(1.0)
            if live.pedir("get_session_info")["track_count"] < antes:
                return
        raise


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--inicio", type=float, default=0.0, help="tempo do set onde a gravação começa")
    ap.add_argument("--fim", type=float, default=None, help="tempo do set onde para (padrão: fim do mapa + folga)")
    ap.add_argument("--folga", type=float, default=4.0, help="tempos a mais depois do fim")
    ap.add_argument("--copiar-para", default=None)
    # 2026-10-23: a gravação é PCM de 24 bits e trilha nova nasce em 0,85; acima de uns 0,5 as faixas cheias
    # clipam. --faders põe todas as trilhas (menos a da gravação) nesse valor antes de gravar.
    ap.add_argument("--faders", type=float, default=None, help="volume de todas as trilhas antes de gravar (0,5)")
    args = ap.parse_args(argv)

    fim = args.fim if args.fim is not None else fim_do_mapa() + args.folga
    duracao = (fim - args.inicio) * 60.0 / TEMPO_SET
    print(f"gravar do tempo {args.inicio:g} ao {fim:g} do set: {duracao / 60:.1f} min em tempo real", flush=True)

    with Ableton() as live:
        if args.faders is not None:
            n = live.pedir("get_session_info")["track_count"]
            for i in range(n):
                live.pedir("hv_set_track_volume", {"track_index": i, "value": args.faders})
            print(f"faders das {n} trilhas em {args.faders:g}", flush=True)
        # O Live arma a trilha MIDI em que um instrumento é carregado pelo navegador, e o montador deixa armada a
        # última trilha que montou: em 2026-10-23 a gravação gravou um clipe MIDI vazio por cima dos clipes dela (e
        # não há comando para desarmar). Uma isca: uma trilha MIDI com um instrumento qualquer leva o braço para
        # ela, e é apagada no fim junto com a de gravação. A isca vem antes da trilha de gravação: carregar o
        # instrumento desarma as outras (o braço é exclusivo), e o hv_record_setup arma a de gravação sem desarmar.
        isca = live.pedir("create_midi_track", {"index": -1})["index"]
        live.pedir("set_track_name", {"track_index": isca, "name": ISCA})
        live.pedir("load_instrument_or_effect", {"track_index": isca, "uri": ISCA_URI})
        trilha = live.pedir("hv_record_setup", {"name": TRILHA})
        ti = trilha["track_index"]
        armadas = [i for i in range(live.pedir("get_session_info")["track_count"])
                   if i not in (ti, isca) and live.pedir("get_track_info", track_index=i).get("arm")]
        if armadas:
            apagar_trilha(live, ti)
            apagar_trilha(live, isca)
            print(f"trilhas armadas além da gravação: {armadas}; não gravei (gravaria por cima delas)", flush=True)
            return 1
        print(f"trilha {ti} '{trilha['name']}' com entrada {trilha['input']}, armada", flush=True)
        posicionar(live, args.inicio)
        live.pedir("hv_record_range", {"start": args.inicio, "end": fim})
        time.sleep(1.5)
        agora = live.pedir("get_session_info")["current_song_time"]
        if not (args.inicio - 32 <= agora <= args.inicio + 16):
            live.pedir("hv_record_stop")
            apagar_trilha(live, ti)
            print(f"a gravação começou no tempo {agora:.1f}, longe do {args.inicio:g}; parei", flush=True)
            return 1
        inicio_real = time.time()
        ultimo = -60.0
        while True:
            time.sleep(1.0)
            st = live.pedir("hv_record_status")
            agora = time.time() - inicio_real
            if agora - ultimo >= 30:
                print(f"  {agora / 60:5.1f} min: tempo {st.get('agora', 0):.1f} de {fim:g}", flush=True)
                ultimo = agora
            if not st.get("ativo") and agora > 2:
                if st.get("erro"):
                    print("erro na gravação:", st["erro"], flush=True)
                    return 1
                break
            if agora > duracao + 120:
                live.pedir("hv_record_stop")
                print("passou do tempo esperado; parei", flush=True)
                break
        time.sleep(2.0)
        clips = live.pedir("hv_arrangement_audio_clips", {"track_index": ti})["clips"]
        # Armada, a trilha segura o arquivo (o Live já abre o da próxima tomada) e não há comando para
        # desarmar: apagar a trilha solta o arquivo, que continua no disco (conferido em 2026-10-20).
        apagar_trilha(live, ti)
        n = live.pedir("get_session_info")["track_count"]
        for i in range(n - 1, -1, -1):
            if live.pedir("get_track_info", track_index=i)["name"] == ISCA:
                apagar_trilha(live, i)

    # A gravação pode começar alguns tempos depois do pedido (em 2026-10-20 começou no 8,15 em vez do 0);
    # o arquivo cobre do início do clipe ao fim, e o cortador recebe o atraso por --inicio-export.
    gravados = [c for c in clips if c.get("arquivo")]
    if not gravados:
        print("o Live não devolveu o arquivo gravado; clipes da trilha:", json.dumps(clips, ensure_ascii=False))
        return 1
    clipe = min(gravados, key=lambda c: c["inicio"])
    origem = clipe["arquivo"]
    inicio_export_s = clipe["inicio"] * 60.0 / TEMPO_SET
    os.makedirs(SAIDA, exist_ok=True)
    destino = args.copiar_para or os.path.join(SAIDA, f"arranjo_{_dt.datetime.now():%Y%m%d_%H%M}.wav")
    # O Live ainda segura o arquivo por alguns segundos depois de parar.
    for tentativa in range(60):
        try:
            shutil.copyfile(origem, destino)
            break
        except PermissionError:
            time.sleep(1.0)
    else:
        print("o Live não soltou o arquivo em 60 s:", origem)
        return 1
    print(f"gravado: {origem}\ncopiado para: {destino}", flush=True)
    print(f"o arquivo começa no tempo {clipe['inicio']:.3f} do set: cortar com --inicio-export {inicio_export_s:.4f}",
          flush=True)
    return 0


if __name__ == "__main__":
    manter_acordado(True)
    try:
        raise SystemExit(main())
    finally:
        manter_acordado(False)
