"""Cliente do Remote Script AbletonMCP (2026-10-20).

O script do Live (User Library/Remote Scripts/AbletonMCP/__init__.py, versão 1.7.1)
escuta em 127.0.0.1:9877. Cada pedido é um JSON {"type": ..., "params": {...}} e cada
resposta é um JSON {"status": "success"|"error", "result"|"message": ...}, sem
delimitador: o cliente lê até o JSON fechar.

Uso como módulo:
    from ableton import Ableton
    with Ableton() as live:
        info = live.pedir("get_session_info")

Uso na linha de comando (para conferir à mão):
    python -I tools/som/ableton.py get_session_info
    python -I tools/som/ableton.py get_track_info '{"track_index": 0}'

Comandos que o script anuncia mas não tem (a função não existe no __init__.py 1.7.1):
get_browser_categories e get_browser_items. Usar get_browser_tree e
get_browser_items_at_path. Telemetria (set_dataset_consent, submit_intent,
rate_last_action, record_audition) nunca é chamada daqui.
"""

from __future__ import annotations

import json
import os
import socket
import sys
import time

HOST = "127.0.0.1"
PORT = 9877

# Comandos de coleta de dados do servidor MCP: o consentimento só pode vir do usuário.
PROIBIDOS = {"set_dataset_consent", "submit_intent", "rate_last_action", "record_audition",
             "prefer_candidate", "reject_last_action"}


class ErroAbleton(RuntimeError):
    """O Live respondeu com erro, ou não respondeu."""


class Ableton:
    def __init__(self, host: str = HOST, port: int = PORT, tempo_limite: float = 60.0,
                 tentativas: int = 3):
        self.host = host
        self.port = port
        self.tempo_limite = tempo_limite
        self.tentativas = tentativas
        self._sock: socket.socket | None = None
        self._decoder = json.JSONDecoder()

    # Conexão ---------------------------------------------------------------

    def conectar(self) -> None:
        self.fechar()
        try:
            s = socket.create_connection((self.host, self.port), timeout=5.0)
        except OSError as e:
            raise ErroAbleton(
                f"Não consegui conectar ao Live em {self.host}:{self.port} ({e}). "
                "O Live está aberto, com o AbletonMCP escolhido em Preferências > Link, Tempo & MIDI > Control Surface?"
            ) from e
        s.settimeout(self.tempo_limite)
        self._sock = s

    def fechar(self) -> None:
        if self._sock is not None:
            try:
                self._sock.close()
            except OSError:
                pass
            self._sock = None

    def __enter__(self) -> "Ableton":
        self.conectar()
        return self

    def __exit__(self, *_exc) -> None:
        self.fechar()

    # Pedido ----------------------------------------------------------------

    def _ler_resposta(self) -> dict:
        assert self._sock is not None
        buf = b""
        while True:
            try:
                parte = self._sock.recv(65536)
            except socket.timeout as e:
                raise ErroAbleton(f"O Live não respondeu em {self.tempo_limite:.0f} s") from e
            if not parte:
                raise ConnectionError("o Live fechou a conexão")
            buf += parte
            try:
                texto = buf.decode("utf-8")
            except UnicodeDecodeError:
                continue  # caractere de vários bytes cortado no meio: esperar o resto
            try:
                obj, fim = self._decoder.raw_decode(texto.lstrip())
            except json.JSONDecodeError:
                continue  # JSON ainda incompleto
            return obj

    def pedir_bruto(self, tipo: str, params: dict | None = None) -> dict:
        """Manda o pedido e devolve a resposta inteira (com status)."""
        if tipo in PROIBIDOS:
            raise ErroAbleton(f"'{tipo}' é telemetria: não é chamado por este cliente")
        msg = json.dumps({"type": tipo, "params": params or {}}).encode("utf-8")
        ultimo: Exception | None = None
        for tentativa in range(self.tentativas):
            try:
                if self._sock is None:
                    self.conectar()
                assert self._sock is not None
                self._sock.sendall(msg)
                return self._ler_resposta()
            except (ConnectionError, OSError) as e:
                # Caiu (o Live fecha a conexão depois de um erro de protocolo): reconectar.
                ultimo = e
                self.fechar()
                time.sleep(0.5 * (tentativa + 1))
        raise ErroAbleton(f"'{tipo}': conexão com o Live caiu {self.tentativas} vezes ({ultimo})")

    def pedir(self, tipo: str, params: dict | None = None, **kw) -> dict:
        """Manda o pedido e devolve o `result`; erro do Live vira ErroAbleton."""
        if kw:
            params = {**(params or {}), **kw}
        r = self.pedir_bruto(tipo, params)
        if r.get("status") != "success":
            raise ErroAbleton(f"'{tipo}' {json.dumps(params or {}, ensure_ascii=False)[:200]}: {r.get('message')}")
        return r.get("result", {})

    # Locators ----------------------------------------------------------------
    # O create_locator do script muda current_song_time e chama set_or_delete_cue no mesmo
    # tique do Live, mas a cabeça de leitura só anda no tique seguinte: o locator caía onde a
    # cabeça estava antes (visto em 2026-10-20). Mover a cabeça num pedido separado resolve.

    def locators(self) -> list[dict]:
        s = self.pedir("get_session_snapshot", include_notes=False, include_params=False)
        return s.get("cue_points", [])

    def criar_locator(self, nome: str, tempo: float) -> dict:
        self.pedir("set_current_song_time", time=float(tempo))
        r = self.pedir("create_locator", name=nome, time=float(tempo))
        if abs(r["time"] - tempo) > 1e-3:
            raise ErroAbleton(f"locator '{nome}' caiu em {r['time']}, não em {tempo}")
        return r

    def apagar_locator(self, tempo: float) -> bool:
        """Apaga o locator que está em `tempo` (não há comando para isso: põe a cabeça em cima
        dele e pede um locator 0,002 tempo adiante; o set_or_delete_cue, rodando com a cabeça
        ainda no lugar velho, alterna o que existe, e o script reclama de não achar o novo)."""
        if not any(abs(c["time"] - tempo) < 1e-6 for c in self.locators()):
            return False
        self.pedir("set_current_song_time", time=float(tempo))
        self.pedir_bruto("create_locator", {"name": "", "time": float(tempo) + 0.002})
        restantes = self.locators()
        if any(abs(c["time"] - tempo) < 1e-6 for c in restantes):
            raise ErroAbleton(f"não consegui apagar o locator em {tempo}")
        sobra = [c for c in restantes if abs(c["time"] - (tempo + 0.002)) < 1e-4]
        if sobra:
            raise ErroAbleton(f"apagar o locator em {tempo} deixou um novo em {sobra[0]['time']}")
        return True


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 1
    tipo = argv[0]
    params = json.loads(argv[1]) if len(argv) > 1 else {}
    with Ableton() as live:
        r = live.pedir_bruto(tipo, params)
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(r, ensure_ascii=False, indent=1))
    return 0 if r.get("status") == "success" else 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))


def manter_acordado(ligar: bool) -> None:
    """Pede ao Windows para não suspender enquanto grava (em 2026-10-20 o notebook suspendeu no meio
    de uma gravação de 20 min, com o usuário fora). Vale só enquanto este processo pede."""
    if os.name != "nt":
        return
    import ctypes
    ES_CONTINUOUS, ES_SYSTEM_REQUIRED, ES_AWAYMODE_REQUIRED = 0x80000000, 0x00000001, 0x00000040
    estado = ES_CONTINUOUS | (ES_SYSTEM_REQUIRED | ES_AWAYMODE_REQUIRED if ligar else 0)
    ctypes.windll.kernel32.SetThreadExecutionState(estado)
