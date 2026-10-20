# Acrescenta ao Remote Script do AbletonMCP (1.7.1) os comandos que o Haywood Valley precisa e o pacote não tem
# (2026-10-20): gravar a saída do próprio Live (Resampling) no Arrangement, em tempo real, para tirar o áudio das
# peças sem o diálogo de exportar; e as faxinas que faltam (apagar clipe do arranjo e trilha, volume e mudo).
#
# Uso: python -I tools/som/remote_script/gravacao.py [--script <__init__.py>]
# O Live só relê o Remote Script quando o Control Surface é escolhido de novo (None → AbletonMCP) ou ao reabrir.
# Rodar de novo não duplica nada: o bloco fica entre marcadores e é trocado inteiro.
import argparse
import os
import re
import shutil

PADRAO = os.path.join(
    os.environ.get("USERPROFILE", r"C:\Users\Szortek"),
    r"Documents\Ableton\User Library\Remote Scripts\AbletonMCP\__init__.py",
)

COMANDOS = [
    "hv_record_setup",
    "hv_record_range",
    "hv_record_status",
    "hv_record_stop",
    "hv_arrangement_audio_clips",
    "hv_delete_arrangement_clip",
    "hv_delete_track",
    "hv_set_track_volume",
    "hv_set_track_mute",
]

INICIO = "    # >>> haywood-valley: gravacao\n"
FIM = "    # <<< haywood-valley: gravacao\n"

METODOS = INICIO + r'''    # Gravar a saída do Live pelo Resampling, para exportar peça por peça sem o diálogo (Haywood Valley).
    def _hv_track(self, track_index):
        if track_index < 0 or track_index >= len(self._song.tracks):
            raise IndexError("Track index out of range")
        return self._song.tracks[track_index]

    def _hv_record_setup(self, name):
        """Acha ou cria a trilha de áudio de gravação, com a entrada no Resampling, monitor desligado e armada."""
        song = self._song
        track, index = None, -1
        for i, t in enumerate(song.tracks):
            if t.name == name and not t.has_midi_input:
                track, index = t, i
                break
        if track is None:
            song.create_audio_track(-1)
            index = len(song.tracks) - 1
            track = song.tracks[index]
            track.name = name
        chosen = None
        for routing in track.available_input_routing_types:
            if routing.display_name.lower().startswith("resampling"):
                chosen = routing
                break
        if chosen is None:
            raise Exception("Resampling não está entre as entradas da trilha de áudio")
        track.input_routing_type = chosen
        try:
            # 2 = Off: a trilha não toca o que grava (senão realimenta o master).
            track.current_monitoring_state = 2
        except Exception:
            pass
        track.arm = True
        return {"track_index": index, "name": track.name, "input": chosen.display_name}

    def _hv_record_range(self, start, end):
        """Grava de `start` a `end` (tempos do set) nas trilhas armadas e para sozinho. Volta na hora; ver status."""
        song = self._song
        rec = getattr(self, "_hv_rec", None) or {}
        if rec.get("ativo"):
            raise Exception("já está gravando")
        start, end = float(start), float(end)
        if end <= start:
            raise ValueError("fim antes do começo")
        song.stop_playing()
        song.loop = False
        try:
            song.metronome = False
        except Exception:
            pass
        song.current_song_time = start
        song.record_mode = True
        song.continue_playing()
        self._hv_rec = {"ativo": True, "inicio": start, "fim": end, "comecou": time.time(), "erro": None}
        self.schedule_message(1, self._hv_tick)
        return dict(self._hv_rec)

    def _hv_tick(self):
        rec = getattr(self, "_hv_rec", None)
        if not rec or not rec.get("ativo"):
            return
        song = self._song
        try:
            if song.current_song_time >= rec["fim"] or not song.is_playing:
                self._hv_finish()
                return
        except Exception as e:
            rec["erro"] = str(e)
            self._hv_finish()
            return
        self.schedule_message(1, self._hv_tick)

    def _hv_finish(self):
        song = self._song
        rec = self._hv_rec
        rec["parou_em"] = song.current_song_time
        song.record_mode = False
        song.stop_playing()
        rec["ativo"] = False
        rec["terminou"] = time.time()

    def _hv_record_stop(self):
        rec = getattr(self, "_hv_rec", None)
        if rec and rec.get("ativo"):
            self._hv_finish()
        return dict(getattr(self, "_hv_rec", None) or {})

    def _hv_record_status(self):
        song = self._song
        rec = dict(getattr(self, "_hv_rec", None) or {})
        rec["tocando"] = song.is_playing
        rec["agora"] = song.current_song_time
        rec["gravando"] = song.record_mode
        return rec

    def _hv_arrangement_audio_clips(self, track_index):
        track = self._hv_track(track_index)
        clips = []
        for clip in track.arrangement_clips:
            clips.append({
                "nome": clip.name,
                "inicio": clip.start_time,
                "fim": clip.end_time,
                "arquivo": getattr(clip, "file_path", None),
                "audio": clip.is_audio_clip,
            })
        return {"track_index": track_index, "clips": clips}

    def _hv_delete_arrangement_clip(self, track_index, start_time, tolerance=1e-3):
        track = self._hv_track(track_index)
        removed = 0
        for clip in list(track.arrangement_clips):
            if abs(clip.start_time - float(start_time)) < tolerance:
                track.delete_clip(clip)
                removed += 1
        return {"removidos": removed}

    def _hv_delete_track(self, track_index):
        self._hv_track(track_index)
        self._song.delete_track(track_index)
        return {"apagada": track_index, "trilhas": len(self._song.tracks)}

    def _hv_set_track_volume(self, track_index, value):
        track = self._hv_track(track_index)
        track.mixer_device.volume.value = max(0.0, min(1.0, float(value)))
        return {"volume": track.mixer_device.volume.value}

    def _hv_set_track_mute(self, track_index, mute):
        track = self._hv_track(track_index)
        track.mute = bool(mute)
        return {"mute": track.mute}
''' + FIM

DESPACHO = r'''                        # >>> haywood-valley: despacho
                        elif command_type == "hv_record_setup":
                            result = self._hv_record_setup(params.get("name", "zz_gravacao"))
                        elif command_type == "hv_record_range":
                            result = self._hv_record_range(params.get("start", 0.0), params.get("end", 0.0))
                        elif command_type == "hv_record_status":
                            result = self._hv_record_status()
                        elif command_type == "hv_record_stop":
                            result = self._hv_record_stop()
                        elif command_type == "hv_arrangement_audio_clips":
                            result = self._hv_arrangement_audio_clips(params.get("track_index", 0))
                        elif command_type == "hv_delete_arrangement_clip":
                            result = self._hv_delete_arrangement_clip(params.get("track_index", 0), params.get("start_time", 0.0))
                        elif command_type == "hv_delete_track":
                            result = self._hv_delete_track(params.get("track_index", -1))
                        elif command_type == "hv_set_track_volume":
                            result = self._hv_set_track_volume(params.get("track_index", 0), params.get("value", 0.85))
                        elif command_type == "hv_set_track_mute":
                            result = self._hv_set_track_mute(params.get("track_index", 0), params.get("mute", True))
                        # <<< haywood-valley: despacho
'''


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--script", default=PADRAO)
    args = parser.parse_args()
    path = args.script
    text = open(path, encoding="utf-8").read()
    backup = path + ".antes_hv.bak"
    if not os.path.exists(backup):
        shutil.copyfile(path, backup)

    # Tira o que uma rodada anterior pôs, para trocar inteiro.
    text = re.sub(re.escape(INICIO) + r".*?" + re.escape(FIM), "", text, flags=re.S)
    text = re.sub(r"                        # >>> haywood-valley: despacho\n.*?                        # <<< haywood-valley: despacho\n", "", text, flags=re.S)
    text = text.replace(', "hv_record_setup": 30.0}', "}")
    for name in COMANDOS:
        text = text.replace('    "%s",\n' % name, "")
        text = text.replace(', "%s"' % name, "")

    if "import time" not in text:
        text = text.replace("import json", "import json\nimport time", 1)

    # Capacidades anunciadas no aperto de mão.
    text = text.replace("SCRIPT_CAPABILITIES = [\n", "SCRIPT_CAPABILITIES = [\n" + "".join('    "%s",\n' % c for c in COMANDOS), 1)

    # Comandos que rodam na thread principal do Live.
    anchor = '"create_locator"]:'
    if anchor not in text:
        raise SystemExit("não achei a lista de comandos da thread principal")
    text = text.replace(anchor, '"create_locator"' + "".join(', "%s"' % c for c in COMANDOS) + "]:", 1)

    # Despacho, logo depois do create_locator.
    locator = "                            result = self._create_locator(name, time_val)\n"
    if locator not in text:
        raise SystemExit("não achei o despacho do create_locator")
    text = text.replace(locator, locator + DESPACHO, 1)

    # Métodos, antes do _create_locator.
    method = "    def _create_locator(self, name, time_val):\n"
    text = text.replace(method, METODOS + "\n" + method, 1)

    # Gravar dura bem mais que o tempo padrão da fila.
    text = text.replace('long_running_commands = {"create_audio_clip": 60.0}', 'long_running_commands = {"create_audio_clip": 60.0, "hv_record_setup": 30.0}', 1)

    compile(text, path, "exec")
    open(path, "w", encoding="utf-8", newline="\n").write(text)
    print("Remote Script atualizado:", path)
    print("Escolher o Control Surface de novo (None -> AbletonMCP) para o Live reler.")


if __name__ == "__main__":
    main()
