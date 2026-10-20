"""Compõe todas as partituras do jogo (2026-10-20): JSON em `assets/musica/partituras/`, prévia MIDI em
`assets/musica/midi/`, e confere tudo com `verificar.py`.

Uso: python -I tools/som/compor/compor.py [peça ...]   (sem argumento, todas)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import importlib  # noqa: E402

PECAS = ["titulo", "personalizar", "ilha", "sala", "interface", "efeitos"]


def main() -> int:
    escolhidas = sys.argv[1:] or PECAS
    for nome in escolhidas:
        mod = importlib.import_module(nome)
        for p in mod.todas() if hasattr(mod, "todas") else [mod.compor()]:
            p.salvar()
            print(f"{p.chave:32} {p.duracao_s():8.2f} s  {sum(len(n) for n in p.trilhas.values()):5} notas")
    import verificar

    return verificar.main()


if __name__ == "__main__":
    sys.exit(main())
