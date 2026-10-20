# Validação de estilo_aeko_arte.py — rodada final (2026-10-20)

Gerado por `tools/validar_estilo_arte.py`. Nota de estilo: `nota_estilo` contra o alvo (0–10). Contra o original: a nota de comparar_estilos.py sobre a união das silhuetas.

## (a) Objetos estragados

| estilo | conjunto | estrago | objetos | estilo: estragado → devolvido | ≥ 8 | contra o original: estragado → devolvido | ΔE devolvido | contorno F1 |
|---|---|---|---|---|---|---|---|---|
| aeko | graal_aeko | borrar | 16 | 3.12 → **9.49** | 100 % | 2.37 → 2.20 | 7.15 | 0.72 |
| aeko | graal_aeko | degrade | 16 | 3.22 → **9.88** | 100 % | 1.89 → 2.43 | 7.00 | 0.81 |
| aeko | graal_aeko | saturar | 16 | 4.21 → **9.70** | 100 % | 2.61 → 2.99 | 6.23 | 0.93 |
| aeko | graal_aeko | sem_contorno | 16 | 4.24 → **9.52** | 100 % | 8.49 → 4.24 | 4.52 | 0.87 |
| aeko | graal_aeko | tudo | 16 | 2.41 → **9.85** | 100 % | 0.51 → 1.69 | 8.05 | 0.74 |
| aeko | aeko_folhas | borrar | 16 | 5.58 → **9.27** | 100 % | 3.69 → 3.82 | 5.63 | 0.11 |
| aeko | aeko_folhas | degrade | 16 | 4.51 → **9.50** | 100 % | 1.72 → 2.25 | 7.36 | 0.00 |
| aeko | aeko_folhas | saturar | 16 | 2.41 → **9.66** | 100 % | 1.96 → 3.20 | 6.19 | 0.42 |
| aeko | aeko_folhas | tudo | 16 | 4.08 → **9.75** | 100 % | 0.46 → 1.29 | 8.52 | 0.00 |
| equipe | equipe | borrar | 63 | 6.42 → **9.17** | 100 % | 2.31 → 2.34 | 7.21 | 0.15 |
| equipe | equipe | degrade | 63 | 6.33 → **9.14** | 100 % | 1.61 → 1.90 | 7.72 | 0.21 |
| equipe | equipe | saturar | 63 | 4.72 → **9.11** | 100 % | 2.45 → 2.95 | 6.15 | 0.36 |
| equipe | equipe | sem_contorno | 60 | 8.09 → **9.35** | 100 % | 8.73 → 8.20 | 1.56 | 0.43 |
| equipe | equipe | tudo | 63 | 4.46 → **9.12** | 100 % | 0.50 → 1.31 | 8.44 | 0.26 |
| equipe | equipe_folhas | borrar | 16 | 5.65 → **9.05** | 88 % | 3.49 → 3.56 | 5.56 | 0.00 |
| equipe | equipe_folhas | degrade | 16 | 4.73 → **9.67** | 100 % | 1.62 → 1.81 | 7.50 | 0.00 |
| equipe | equipe_folhas | saturar | 16 | 2.56 → **9.48** | 100 % | 1.38 → 2.85 | 6.54 | 0.00 |
| equipe | equipe_folhas | tudo | 16 | 4.33 → **9.60** | 100 % | 0.37 → 1.23 | 8.59 | 0.00 |
| aeko+equipe | graal_aeko | borrar | 16 | 5.57 → **9.18** | 100 % | 2.37 → 2.69 | 6.48 | 0.72 |
| aeko+equipe | graal_aeko | degrade | 16 | 5.69 → **9.16** | 100 % | 1.89 → 2.61 | 6.67 | 0.81 |
| aeko+equipe | graal_aeko | saturar | 16 | 5.26 → **9.50** | 100 % | 2.61 → 3.13 | 5.97 | 0.93 |
| aeko+equipe | graal_aeko | sem_contorno | 16 | 5.18 → **9.28** | 100 % | 8.49 → 5.78 | 2.52 | 0.87 |
| aeko+equipe | graal_aeko | tudo | 16 | 3.82 → **9.24** | 100 % | 0.51 → 1.70 | 8.03 | 0.74 |
| aeko+equipe | aeko_folhas | borrar | 16 | 5.98 → **9.37** | 100 % | 3.69 → 3.35 | 5.78 | 0.11 |
| aeko+equipe | aeko_folhas | degrade | 16 | 5.31 → **9.00** | 100 % | 1.72 → 1.67 | 7.58 | 0.00 |
| aeko+equipe | aeko_folhas | saturar | 16 | 2.72 → **9.46** | 100 % | 1.96 → 2.59 | 6.51 | 0.42 |
| aeko+equipe | aeko_folhas | tudo | 16 | 4.75 → **9.40** | 100 % | 0.46 → 0.63 | 9.01 | 0.00 |
| aeko+equipe | equipe | borrar | 63 | 5.54 → **9.21** | 100 % | 2.31 → 2.36 | 7.08 | 0.22 |
| aeko+equipe | equipe | degrade | 63 | 5.42 → **9.17** | 100 % | 1.61 → 1.82 | 7.70 | 0.23 |
| aeko+equipe | equipe | saturar | 63 | 4.27 → **9.09** | 100 % | 2.45 → 2.64 | 6.45 | 0.34 |
| aeko+equipe | equipe | sem_contorno | 60 | 7.60 → **9.41** | 100 % | 8.73 → 8.46 | 1.33 | 0.42 |
| aeko+equipe | equipe | tudo | 63 | 3.98 → **9.17** | 100 % | 0.50 → 1.18 | 8.51 | 0.27 |
| aeko+equipe | equipe_folhas | borrar | 16 | 5.82 → **9.17** | 94 % | 3.49 → 3.75 | 5.33 | 0.00 |
| aeko+equipe | equipe_folhas | degrade | 16 | 4.94 → **9.71** | 100 % | 1.62 → 1.81 | 7.50 | 0.00 |
| aeko+equipe | equipe_folhas | saturar | 16 | 2.72 → **9.54** | 100 % | 1.38 → 2.78 | 6.64 | 0.00 |
| aeko+equipe | equipe_folhas | tudo | 16 | 4.54 → **9.53** | 100 % | 0.37 → 0.88 | 8.88 | 0.00 |

| estilo | nota de estilo média (devolvidas) | menor | ≥ 8 |
|---|---|---|---|
| aeko | 9.62 | 8.03 | 100 % |
| equipe | 9.22 | 7.69 | 99 % |
| aeko+equipe | 9.26 | 7.90 | 100 % |

## (b) Imagens de fora

| imagem | estilo | nota antes | nota depois | tentativas | cores antes → depois |
|---|---|---|---|---|---|
| arvore_degrade | aeko | 2.97 | **10.00** | 4 | 517 → 9 |
| arvore_degrade | equipe | 3.32 | **9.96** | 4 | 517 → 9 |
| arvore_degrade | aeko+equipe | 3.35 | **10.00** | 4 | 517 → 9 |
| bau_chapado | aeko | 3.98 | **10.00** | 2 | 7 → 6 |
| bau_chapado | equipe | 4.73 | **9.94** | 2 | 7 → 7 |
| bau_chapado | aeko+equipe | 4.83 | **10.00** | 2 | 7 → 7 |
| botao_sombra | aeko | 1.26 | **10.00** | 4 | 473 → 7 |
| botao_sombra | equipe | 2.88 | **10.00** | 4 | 473 → 7 |
| botao_sombra | aeko+equipe | 2.37 | **8.05** | 3 | 473 → 8 |
| pocao_ampliada | aeko | 2.07 | **9.39** | 4 | 222 → 12 |
| pocao_ampliada | equipe | 1.95 | **9.07** | 4 | 222 → 15 |
| pocao_ampliada | aeko+equipe | 2.06 | **8.84** | 4 | 222 → 16 |

## (c) O par antes → depois da MADX

O antes passa pela ferramenta e é comparado com o depois que a equipe desenhou (silhuetas alinhadas pela maior sobreposição). Nota contra o depois: a mesma de (a).

| árvore | antes contra o depois | estilo | nota de estilo da devolvida | nota de estilo do depois | devolvida contra o depois | ΔE | paleta |
|---|---|---|---|---|---|---|---|
| rosa | 2.66 | aeko | 9.82 | 3.21 | **0.44** | 9.65 | 0.13 |
| rosa | 2.66 | equipe | 9.19 | 8.01 | **2.68** | 8.69 | 0.90 |
| rosa | 2.66 | aeko+equipe | 9.38 | 7.21 | **2.68** | 8.69 | 0.90 |
| verde | 2.52 | aeko | 9.47 | 1.72 | **1.00** | 8.96 | 0.24 |
| verde | 2.52 | equipe | 10.00 | 6.37 | **2.10** | 8.86 | 0.76 |
| verde | 2.52 | aeko+equipe | 10.00 | 5.67 | **2.01** | 9.18 | 0.78 |
