# Plano de recuperação (2026-10-20)

O que se perdeu na formatação, o que já voltou e como o resto está sendo refeito. Escrito para o usuário corrigir na volta: cada **(palpite)** é uma decisão tomada sem poder perguntar.

## Situação

| | Estado |
|---|---|
| Código do jogo (`src/`) | **Recuperado.** Refeito em TypeScript a partir do Luau do place; compila idêntico (128 módulos). Branch `recuperacao-studio`, commit `23f779a`. Falta levar ao `main`. |
| Scripts do place (`studio-backup/`) | **Guardados** no mesmo branch. |
| Imagens do jogo | **Recuperadas** (185, em `Documents\Haywood-Valley-recuperado\artes`). Entram no repositório por `assets/`. |
| Sons (29) | Só no Roblox; o jogo toca normalmente. Projetos do Ableton perdidos. |
| Plugin Diorama, ponte, especificação, roteiro | **Perdidos.** Em reconstrução (abaixo). |
| Geradores (`tools/*.mjs`, `tools/*.py`, `draw_*.lua`, `hv_paint.lua`) | **Perdidos.** Em reconstrução os que o jogo exige; os de arte por script (`draw_*.lua`) ficam para depois. |
| Peças cruas dos contribuidores, `.aseprite`, `mapa_folhas.json` do guia do Aeko, `PLANO_OTIMIZACAO.md`, `ESTUDO_SONS.md` | **Perdidos.** As peças voltam desempacotadas das folhas; o resto, só pelas conversas antigas. |
| Notion | Não acessível nesta sessão (precisa autorizar o MCP). As decisões de lá não foram lidas. |

## Como está sendo refeito

Tudo em `docs/diorama/ARQUITETURA.md` (decisões) e nos documentos que cada parte gera. Em ordem:

1. **Especificação e roteiro** (`docs/diorama/ESPECIFICACAO.md`, `ROTEIRO.md`, `DUVIDAS.md`): reconstruídos do que o jogo cita. A numeração das seções que o código cita (12.3, 12.9, 12.12, 12.14, 12.17, 12.20) foi mantida; as outras são **(palpite)**.
2. **Registro de assets** (`assets/registro.json`, `tools/assets.mjs`): refeito do `assets.ts`; o gerador reproduz o arquivo atual byte a byte.
3. **Folhas do Graal** (`tools/graal_unpack.py`, `tools/graal_pack.py`): as peças dos contribuidores voltam recortadas das folhas; o empacotador reproduz as folhas e o `graalData.ts`.
4. **Estudo do Aeko** (`tools/estudo_aeko.py`, `estilo_aeko.py`, `comparar_estilos.py`, `docs/arte/ESTUDO_AEKO.md`): a paleta do Aeko, a recolorização das peças e o sistema de nota e comparação por contribuidor. O gabarito é a folha no estilo Aeko que sobreviveu. **(palpite: o que a ferramenta original media)**
5. **Gerador e importador** (`tools/diorama_jogo.mjs`, `diorama_importar.mjs`): os 14 mapas voltam para blocos JSON (formato 1, novo **(palpite)**) e o gerador os reproduz byte a byte. Exterior por engenharia reversa (`docs/diorama/EXTERIOR.md`).
6. **Plugin** (`plugin/`) e **ponte** (`tools/diorama_ponte.mjs`): esqueleto com barra, widgets, cliente da ponte e as ferramentas Conexão e Suporte; depois Mapas (editor), Catálogo, Assets, Servidor e Problemas.
7. **CLAUDE.md e README**: reescritos para o estado novo.

## O que você precisa decidir na volta

- Licenças: as folhas dos contribuidores do Graal podem ficar num repositório público? (Hoje o jogo os credita.) As do Cozy People não entram.
- O formato do bloco JSON e a numeração das seções novas da especificação.
- O que o Diorama tinha além do que o jogo deixa ver (a lista de ferramentas em ARQUITETURA.md é a minha).
- O que o "sistema de nota e comparação" do estudo do Aeko media de verdade.
- Levar `recuperacao-studio` ao `main`.
- Salvar as conversas antigas do claude.ai (Ctrl+S) em `Haywood-Valley-recuperado\sessoes\`: é de lá que podem sair o plugin original, o `hv_paint.lua`, o `faces_spec.py` e as decisões.
