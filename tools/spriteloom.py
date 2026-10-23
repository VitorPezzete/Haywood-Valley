"""Pede sprites ao Spriteloom (servidor local de IA, ws://127.0.0.1:8765) sem o painel do Aseprite (2026-10-22).

Uso (com o Python do próprio Spriteloom, que tem websockets e Pillow):
    C:\\Users\\Szortek\\AI\\Spriteloom\\.venv\\Scripts\\python.exe -I tools/spriteloom.py
        --assunto "white farm hen ..." [--vista "3/4 view"] [--extra "..."] [--tamanho 32x32]
        [--variantes 2] [--fundo auto|remove|keep] [--paleta aeko|auto|<png>] [--cores 96]
        [--semente N] [--saida PASTA]

O texto vai montado como no painel (plugin/prompt.lua do Spriteloom: a vista vira uma frase que
o FLUX.2 Klein entende). --paleta aeko prende o resultado às cores mais usadas das folhas do Aeko
(diorama/folhas), as do jogo. As variações saem em <saida>/<data>_<assunto>_<n>.png, mais um
.json com o pedido e as sementes. Fechar o socket cancela o pedido no servidor: este script
espera o resultado com o socket aberto. O servidor faz um pedido por vez.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import collections
import datetime as _dt
import glob
import json
import os
import re
import sys

from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
URL = "ws://127.0.0.1:8765"
SAIDA = os.path.join(os.path.expanduser("~"), "Documents", "Haywood-Valley-recuperado", "novas", "spriteloom")

# Os mesmos modelos de frase do painel (Spriteloom 1.0.0, plugin/prompt.lua).
VISTAS = {
    "Side view": "A %s, seen exactly from the side at eye level, in strict left-facing profile: its full side is"
                 " shown in full color with clear detail and shading, not a black silhouette, the front face cannot"
                 " be seen. A flat 2D side-scroller game object. The camera does not look down at it.",
    "Front view": "A %s, seen straight from the front at eye level, head-on, perfectly centered.",
    "3/4 view": "A %s in classic three-quarter view game perspective, seen from slightly above.",
    "Top-down": "A %s seen directly from above, flat top-down game view.",
    "Custom (text only)": "",
}


def montar_texto(vista: str, assunto: str, extra: str) -> str:
    modelo = VISTAS[vista]
    if not modelo:
        return f"{assunto}, {extra}" if extra else assunto
    texto = modelo % assunto
    return f"{texto} {extra}" if extra else texto


def paleta_aeko(n: int) -> list[list[int]]:
    """As n cores mais usadas nas folhas do Aeko (sem transparente), com o preto do contorno."""
    cont = collections.Counter()
    for arq in glob.glob(os.path.join(RAIZ, "diorama", "folhas", "*.png")):
        img = Image.open(arq).convert("RGBA")
        for (r, g, b, a), k in collections.Counter(img.getdata()).items():
            if a == 255:
                cont[(r, g, b)] += k
    if not cont:
        raise SystemExit("não achei as folhas do Aeko em diorama/folhas")
    cores = [c for c, _ in cont.most_common(n)]
    if (1, 0, 0) not in cores:
        cores = [(1, 0, 0)] + cores[: n - 1]
    return [list(c) for c in cores]


def paleta_png(caminho: str, n: int) -> list[list[int]]:
    img = Image.open(caminho).convert("RGBA")
    cont = collections.Counter(p[:3] for p in img.getdata() if p[3] == 255)
    return [list(c) for c, _ in cont.most_common(n)]


async def pedir(pedido: dict, tempo_max: float) -> dict:
    import websockets
    async with websockets.connect(URL, max_size=None, ping_interval=None, open_timeout=10) as ws:
        await ws.send(json.dumps({"type": "ping"}))
        pong = json.loads(await ws.recv())
        if pong.get("model") != "ready":
            raise SystemExit(f"o modelo ainda está carregando ({pong}); espere a bolinha verde")
        await ws.send(json.dumps(pedido))
        ultimo = -1.0
        while True:
            msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=tempo_max))
            tipo = msg.get("type")
            if tipo == "progress":
                if msg.get("stage"):
                    print(f"  {msg['stage']}", flush=True)
                elif msg.get("value", 0) - ultimo >= 0.1:
                    ultimo = msg["value"]
                    print(f"  {ultimo * 100:.0f}%", flush=True)
            elif tipo == "result":
                return msg
            elif tipo == "error":
                raise SystemExit(f"o Spriteloom recusou: {msg.get('message')}")


def main(argv=None) -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--modo", default="generate", choices=["generate", "edit", "instruct"],
                    help="generate: do zero; edit: muda --imagem pela instrução; instruct: outra vista de --imagem")
    ap.add_argument("--imagem", default=None, help="PNG de entrada (edit e instruct); o tamanho dele vira o da saída")
    ap.add_argument("--assunto", required=True, help="no generate, o que desenhar; no edit/instruct, a instrução")
    ap.add_argument("--vista", default="3/4 view", choices=list(VISTAS))
    ap.add_argument("--extra", default="")
    ap.add_argument("--tamanho", default="32x32")
    ap.add_argument("--variantes", type=int, default=2)
    ap.add_argument("--fundo", default="auto", choices=["auto", "remove", "keep"])
    ap.add_argument("--paleta", default="aeko", help="aeko, auto ou um PNG de onde tirar as cores")
    ap.add_argument("--cores", type=int, default=96, help="quantas cores da paleta mandar (até 256)")
    ap.add_argument("--simetria", action="store_true")
    ap.add_argument("--semente", type=int, default=None)
    ap.add_argument("--saida", default=SAIDA)
    ap.add_argument("--tempo-max", type=float, default=1800, help="segundos sem resposta antes de desistir")
    args = ap.parse_args(argv)

    quadros = []
    if args.modo == "generate":
        w, h = (int(v) for v in args.tamanho.lower().split("x"))
        texto = montar_texto(args.vista, args.assunto, args.extra)
    else:
        if not args.imagem:
            ap.error(f"--modo {args.modo} precisa de --imagem")
        import io
        entrada = Image.open(args.imagem).convert("RGBA")
        w, h = entrada.size
        buf = io.BytesIO()
        entrada.save(buf, format="PNG")
        quadros = [{"image": base64.b64encode(buf.getvalue()).decode("ascii")}]
        # como o painel: no edit a instrução vai sozinha (o Extra só vale no generate e no instruct)
        texto = args.assunto if args.modo == "edit" else (f"{args.assunto}, {args.extra}" if args.extra else args.assunto)
    if args.paleta == "auto":
        paleta = None
    elif args.paleta == "aeko":
        paleta = paleta_aeko(min(256, args.cores))
    else:
        paleta = paleta_png(args.paleta, min(256, args.cores))

    agora = _dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    pedido = {"id": f"hv-{agora}", "mode": args.modo, "prompt": texto, "target_size": [w, h], "frames": quadros,
              "variants": args.variantes, "symmetry": args.simetria, "background": args.fundo,
              "seed": args.semente, "palette": paleta}
    print(f"pedido: {w}x{h}, {args.variantes} variação(ões), paleta {args.paleta}"
          f"{f' ({len(paleta)} cores)' if paleta else ''}\ntexto: {texto}", flush=True)

    resposta = asyncio.run(pedir(pedido, args.tempo_max))
    os.makedirs(args.saida, exist_ok=True)
    nome = re.sub(r"[^a-z0-9]+", "_", args.assunto.lower()).strip("_")[:32]
    arquivos = []
    for i, d in enumerate(resposta.get("images", [])):
        img = Image.frombytes("RGBA", (int(d["w"]), int(d["h"])), base64.b64decode(d["px"]))
        caminho = os.path.join(args.saida, f"{agora}_{nome}_{i + 1}.png")
        img.save(caminho)
        arquivos.append(caminho)
        print(f"salvo: {caminho} ({img.width}x{img.height})", flush=True)
    registro = {k: v for k, v in pedido.items() if k not in ("palette", "frames")}
    registro["imagem"] = args.imagem
    registro.update(paleta_origem=args.paleta, cores=len(paleta) if paleta else None,
                    sementes=resposta.get("seeds"), arquivos=arquivos)
    with open(os.path.join(args.saida, f"{agora}_{nome}.json"), "w", encoding="utf-8") as f:
        json.dump(registro, f, ensure_ascii=False, indent=1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
