"""som.interface.celeiro e som.interface.graal: os dois kits de interface, 8 sons cada num arquivo só.

60 BPM (um tempo = um segundo), cada som começa num segundo inteiro, na ordem de `UiSound` em `shared/sounds.ts`:
click, focus, open, close, change, confirm, back, refused. `trechos` dá o `region` de cada um (início exato na
primeira nota; o fim já conta a cauda curta do instrumento).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import GM, Partitura  # noqa: E402

ORDEM = ["click", "focus", "open", "close", "change", "confirm", "back", "refused"]


def _kit(chave: str, titulo: str, sons: dict, cauda: float, semente: int) -> Partitura:
    p = Partitura(chave, titulo, 60, (4, 4), "sem tom fixo", 2, False, 0.3, semente)
    p.trechos = []
    for i, nome in enumerate(ORDEM):
        fim = 0.0
        for papel, notas in sons[nome]:
            p.add(papel, [[a, i + t, d, v] for a, t, d, v in notas])
            fim = max(fim, max(t + d for _, t, d, _ in notas))
        dur = round(min(0.4, max(0.06, fim + cauda)), 3)
        p.trechos.append({"nome": nome, "inicio_s": float(i), "fim_s": round(i + dur, 3)})
    return p


def celeiro() -> Partitura:
    B, BG, CL, GU = GM["bloco_agudo"], GM["bloco_grave"], GM["claves"], GM["guiro_curto"]
    sons = {
        # um toque seco de madeira, com o bloco por baixo para dar corpo
        "click": [("sfx_madeira", [[76, 0, 0.04, 92]]), ("percussao_latina", [[B, 0, 0.05, 46]])],
        # mais leve e mais agudo que o click (passar o mouse por cima)
        "focus": [("sfx_madeira", [[83, 0, 0.03, 56]])],
        # duas notas subindo na marimba, com o raspar de papel (guiro curto, bem baixo)
        "open": [("marimba", [[67, 0, 0.12, 72], [74, 0.06, 0.18, 82]]), ("sfx_madeira", [[72, 0, 0.03, 58]]),
                 ("percussao_latina", [[GU, 0, 0.08, 28]])],
        # o espelho do open: descendo, um toque de madeira no fim
        "close": [("marimba", [[74, 0, 0.1, 76], [67, 0.06, 0.16, 68]]), ("sfx_madeira", [[65, 0.06, 0.04, 64]])],
        # trocar de aba ou de opção: bloco agudo e uma nota curta
        "change": [("percussao_latina", [[B, 0, 0.05, 64]]), ("marimba", [[79, 0, 0.08, 56]])],
        # três notas subindo (Dó–Mi–Sol): "pronto!"
        "confirm": [("marimba", [[72, 0, 0.1, 76], [76, 0.07, 0.1, 82], [79, 0.14, 0.16, 92]]),
                    ("sfx_madeira", [[79, 0, 0.03, 52]])],
        # voltar: claves e duas notas descendo, mais curto que o close
        "back": [("percussao_latina", [[CL, 0, 0.05, 50]]), ("marimba", [[74, 0, 0.08, 64], [69, 0.06, 0.12, 58]])],
        # "não": dois golpes graves com trítono, o segundo meio tom abaixo e mais forte
        "refused": [("marimba", [[58, 0, 0.1, 80], [64, 0, 0.1, 72], [57, 0.12, 0.14, 86], [63, 0.12, 0.14, 76]]),
                    ("sfx_madeira", [[48, 0, 0.05, 78], [46, 0.12, 0.06, 86]]),
                    ("percussao_latina", [[BG, 0.12, 0.05, 40]])],
    }
    p = _kit("som.interface.celeiro", "Interface Celeiro", sons, 0.1, 3101)
    p.observacoes = """
Kit do tema Celeiro (fazenda, madeira, quente). Oito sons num arquivo, um por segundo; o `region` de cada um está em `trechos` (passar para UI_SOUNDS.celeiro em shared/sounds.ts).
Ideia de cada um: click = toque seco de madeira; focus = o mesmo, mais leve e agudo (volume 0,3 no jogo); open = marimba subindo uma quinta com um raspar de papel; close = o espelho, descendo; change = bloco agudo; confirm = Dó–Mi–Sol rápido na marimba; back = claves e duas notas descendo; refused = dois golpes graves com trítono, o segundo meio tom abaixo ("não").
Precisam aguentar mil repetições: nada de cauda longa, nada de reverb grande.
No Live: sfx_madeira = Operator de madeira (Designer Drums "Sidestick Wood" ou "Percussion Wood Clap"), release curto (até 80 ms); marimba = "Marimba Maple" ou Collision "Marimba Classic" com decay curto; percussão latina: Wood Block B Hi/Mid, Claves A, Guiro curto (papel). Exportar mono; um fade de 5 ms no fim de cada trecho evita estalo no corte.
""".strip()
    return p


def graal() -> Partitura:
    sons = {
        "click": [("sfx_click", [[84, 0, 0.03, 76]]), ("chip_quadrada", [[96, 0, 0.02, 34]])],
        "focus": [("chip_triangulo", [[84, 0, 0.03, 44]])],
        # varredura de sinos subindo (Dó–Mi–Sol–Dó) com a quadrada uma oitava abaixo, bem baixa
        "open": [("glockenspiel", [[84, 0, 0.1, 70], [88, 0.04, 0.1, 72], [91, 0.08, 0.1, 76], [96, 0.12, 0.16, 80]]),
                 ("chip_quadrada", [[72, 0, 0.03, 36], [76, 0.04, 0.03, 36], [79, 0.08, 0.03, 38], [84, 0.12, 0.05, 40]])],
        "close": [("glockenspiel", [[91, 0, 0.1, 72], [88, 0.04, 0.1, 68], [84, 0.08, 0.1, 66], [79, 0.12, 0.14, 62]]),
                  ("chip_quadrada", [[79, 0, 0.03, 34], [76, 0.04, 0.03, 32], [72, 0.08, 0.03, 32], [67, 0.12, 0.05, 30]])],
        # o "cristal": crotales com um brilho de sino por cima
        "change": [("crotales", [[88, 0, 0.12, 62]]), ("sfx_sino", [[95, 0, 0.08, 40]])],
        # o "plim-plim" de RPG antigo: quarta subindo, quadrada e glockenspiel juntos
        "confirm": [("chip_quadrada", [[79, 0, 0.06, 60], [84, 0.07, 0.14, 66]]),
                    ("glockenspiel", [[91, 0, 0.08, 64], [96, 0.07, 0.16, 74]])],
        "back": [("chip_triangulo", [[76, 0, 0.05, 56], [72, 0.06, 0.08, 52]]), ("sfx_sino", [[84, 0, 0.06, 30]])],
        # "não": zumbido grave repetido (bzz-bzzt) com um sino abafado em trítono
        "refused": [("chip_quadrada", [[48, 0, 0.07, 70], [48, 0.1, 0.12, 74]]),
                    ("chip_triangulo", [[36, 0, 0.07, 60], [36, 0.1, 0.12, 62]]),
                    ("sfx_sino", [[60, 0, 0.12, 40], [66, 0, 0.12, 34]])],
    }
    p = _kit("som.interface.graal", "Interface Clássico", sons, 0.1, 3102)
    p.observacoes = """
Kit do tema Clássico (o Graal; no jogo não aparece esse nome): RPG antigo, sinos e cristal, chip discreto. Oito sons num arquivo, um por segundo; `trechos` dá o `region` de cada um (UI_SOUNDS.graal em shared/sounds.ts).
Ideia de cada um: click = estalo curto com um fio de quadrada; focus = um "tic" de triângulo (volume 0,3); open = varredura de sinos subindo, quadrada uma oitava abaixo; close = descendo; change = crotales (o cristal); confirm = quarta subindo em quadrada e glockenspiel, o "plim-plim" clássico; back = duas notas de triângulo descendo; refused = zumbido grave repetido com sino em trítono ("não").
No Live: chip_quadrada = Operator "Square 8 Waveforms" ou Drift "Game Console" com o Redux "Chiptune Filter" bem leve; chip_triangulo = Operator triângulo; glockenspiel e crotales dos Orchestral Mallets (ou Collision "Glockenspiel Basic", sem sample); sfx_sino = "Bells Tinkle Toy" (Operator); sfx_click = Designer Drums. A quadrada nunca na frente: é tempero. Release curto (até 100 ms nos sinos); fade de 5 ms no fim de cada trecho.
""".strip()
    return p


def todas() -> list[Partitura]:
    return [celeiro(), graal()]


if __name__ == "__main__":
    for p in todas():
        p.salvar()
