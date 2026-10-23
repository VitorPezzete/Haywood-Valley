"""Envia os sons de assets/sons/*.ogg ao Roblox pelo Open Cloud e grava os ids para o registro (2026-10-23).

Uso:
    python -I tools/roblox_enviar_audio.py [--grupo 787401484] [--so CHAVE ...] [--seco]
    depois: npm run assets -- --importar tools/som/enviados_audio.json

A chave de API (Creator Hub do grupo > Open Cloud > API Keys, permissão "Assets API": Read e Write) fica
FORA do repositório: na variável ROBLOX_OPEN_CLOUD_KEY ou no arquivo %USERPROFILE%\\.haywood\\roblox_open_cloud.key
(só a chave, numa linha). O jogo é do grupo 787401484, então os sons sobem em nome dele.

O arquivo assets/sons/<chave>.ogg vira o asset da <chave> do registro; um ".nosso" no fim do nome (sons feitos
por nós para substituir os da biblioteca do Roblox) é tirado: som.lareira.nosso.ogg vai para som.lareira.
Os ids saem em tools/som/enviados_audio.json ({ "<chave>": <id> }), o formato do --importar de tools/assets.mjs.
O Roblox modera cada áudio: o id existe na hora, mas o som pode levar um tempo para tocar.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
SONS = os.path.join(RAIZ, "assets", "sons")
SAIDA = os.path.join(AQUI, "som", "enviados_audio.json")
API = "https://apis.roblox.com/assets/v1"
GRUPO = "787401484"


def ler_chave() -> str:
    chave = os.environ.get("ROBLOX_OPEN_CLOUD_KEY", "").strip()
    if not chave:
        caminho = os.path.join(os.path.expanduser("~"), ".haywood", "roblox_open_cloud.key")
        if os.path.exists(caminho):
            chave = open(caminho, encoding="utf-8").read().strip()
    if not chave:
        raise SystemExit("sem chave: ponha a chave do Open Cloud em %USERPROFILE%\\.haywood\\roblox_open_cloud.key")
    return chave


def chave_do_registro(arquivo: str) -> str:
    nome = os.path.splitext(arquivo)[0]
    return nome[: -len(".nosso")] if nome.endswith(".nosso") else nome


def pedir(metodo: str, url: str, chave: str, corpo: bytes | None = None, tipo: str | None = None) -> dict:
    req = urllib.request.Request(url, data=corpo, method=metodo, headers={"x-api-key": chave})
    if tipo:
        req.add_header("Content-Type", tipo)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{e.code} {e.reason}: {e.read().decode('utf-8', 'replace')[:400]}") from e


def enviar(caminho: str, chave_reg: str, grupo: str, chave: str) -> int:
    pedido = {
        "assetType": "Audio",
        "displayName": f"HV {chave_reg}"[:50],
        "description": f"Haywood Valley: {chave_reg}",
        "creationContext": {"creator": {"groupId": grupo}},
    }
    fronteira = uuid.uuid4().hex
    partes = [
        f"--{fronteira}\r\nContent-Disposition: form-data; name=\"request\"\r\n\r\n".encode() + json.dumps(pedido).encode() + b"\r\n",
        (f"--{fronteira}\r\nContent-Disposition: form-data; name=\"fileContent\"; filename=\"{os.path.basename(caminho)}\"\r\n"
         "Content-Type: audio/ogg\r\n\r\n").encode() + open(caminho, "rb").read() + b"\r\n",
        f"--{fronteira}--\r\n".encode(),
    ]
    op = pedir("POST", f"{API}/assets", chave, b"".join(partes), f"multipart/form-data; boundary={fronteira}")
    op_id = op.get("operationId") or op.get("path", "").split("/")[-1]
    for _ in range(90):
        if op.get("done"):
            break
        time.sleep(2)
        op = pedir("GET", f"{API}/operations/{op_id}", chave)
    if not op.get("done"):
        raise RuntimeError(f"a operação {op_id} não terminou em 3 min")
    if op.get("error"):
        raise RuntimeError(f"o Roblox recusou: {op['error']}")
    return int(op["response"]["assetId"])


def main(argv=None) -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--grupo", default=GRUPO)
    ap.add_argument("--so", nargs="*", default=None, help="só estas chaves do registro")
    ap.add_argument("--seco", action="store_true", help="só lista o que enviaria")
    args = ap.parse_args(argv)

    arquivos = sorted(f for f in os.listdir(SONS) if f.endswith(".ogg"))
    if args.so:
        arquivos = [f for f in arquivos if chave_do_registro(f) in args.so]
    feitos = json.load(open(SAIDA, encoding="utf-8")) if os.path.exists(SAIDA) else {}
    if args.seco:
        for f in arquivos:
            print(f"{f} -> {chave_do_registro(f)}{'  (já enviado: ' + str(feitos[chave_do_registro(f)]) + ')' if chave_do_registro(f) in feitos else ''}")
        return 0
    chave = ler_chave()
    erros = 0
    for f in arquivos:
        reg = chave_do_registro(f)
        if reg in feitos:
            print(f"{reg}: já enviado ({feitos[reg]}), pulado")
            continue
        try:
            asset_id = enviar(os.path.join(SONS, f), reg, args.grupo, chave)
        except Exception as e:  # segue com os outros
            erros += 1
            print(f"ERRO {reg}: {e}")
            continue
        feitos[reg] = asset_id
        json.dump(feitos, open(SAIDA, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
        print(f"{reg}: {asset_id}")
    print(f"{len(feitos)} id(s) em {SAIDA}; {erros} erro(s)")
    return 1 if erros else 0


if __name__ == "__main__":
    sys.exit(main())
