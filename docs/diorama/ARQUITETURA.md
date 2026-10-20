# Diorama: arquitetura da reconstrução (2026-10-20)

O plugin Diorama, a ponte, os geradores e a especificação se perderam na formatação do PC. O jogo (`src/`) sobreviveu e cita o plugin em dezenas de comentários (seções 12.3, 12.9, 12.12, 12.14, 12.17, 12.20 da especificação; etapas E, E1, E2 e F do roteiro; `plugin/src/fundos.ts`, `encaixe.ts`, `detectar.ts`, `paredes.ts`, `exterior.ts`, `generated/catalogoAeko.ts`, `generated/catalogoPecas_<n>.ts`). Esta pasta reconstrói tudo a partir do que o jogo exige. O que é palpite está marcado **(palpite)** para o usuário corrigir.

## Peças

| Peça | Onde | O que faz |
|---|---|---|
| Plugin `Diorama` | `plugin/` (roblox-ts + Vide, compila para `.rbxm` em `%LOCALAPPDATA%\Roblox\Plugins\Diorama.rbxm`) | Editor de mapas e ferramentas de desenvolvimento dentro do Studio |
| Ponte | `tools/diorama_ponte.mjs` (`npm run diorama:ponte`, HTTP em `127.0.0.1:34873`) | Lê e grava `diorama/` no disco para o plugin, serve as folhas e roda os geradores |
| Gerador do jogo | `tools/diorama_jogo.mjs` (`npm run diorama:jogo -- <mapa>`, `-- --decorar`) | Bloco JSON → `src/shared/interiors/<mapa>.ts`, `index.ts`; catálogo → `src/shared/decorCatalog.ts` |
| Importador | `tools/diorama_importar.mjs` | `src/shared/interiors/<mapa>.ts` → bloco JSON (para reabrir os 14 mapas que sobreviveram) |
| Registro de assets | `assets/registro.json`, `tools/assets.mjs` (`npm run assets`, `-- --importar`) | Chave → id do Roblox; grava `src/shared/assets.ts` |
| Catálogo do Aeko | `diorama/catalogo/*.json` → `plugin/src/generated/catalogoAeko.ts`, `catalogoPecas_<n>.ts` | Zonas das folhas, regiões (peças) com id, tipo e regras |
| Estudo do Aeko | `tools/estudo_aeko.py`, `tools/estilo_aeko.py`, `tools/comparar_estilos.py` | Paleta do Aeko, recolorir as peças dos contribuidores, nota e comparação |
| Folhas do Graal | `tools/graal_unpack.py`, `tools/graal_pack.py` | Peças dos contribuidores ↔ folhas `graal_<n>.png` + `graalData.ts` |

Dados do Diorama no disco (versionados no git): `diorama/mapas/<mapa>/blocos/<bx>_<by>.json`, `diorama/mapas/<mapa>/mapa.json`, `diorama/catalogo/`, `diorama/folhas/` (as folhas do Aeko inteiras, 2048×512, montadas das metades recuperadas em `Documents\Haywood-Valley-recuperado\artes`).

## Bloco (formato 1) — `diorama/mapas/<mapa>/blocos/<bx>_<by>.json`

Um bloco tem 64×64 células de 16 px. Um mapa pode ter vários blocos **(palpite: o jogo só recebe `0_0` hoje)**. O JSON guarda só o que o autor pintou; `blocks`, `actions`, `flat`, `x/y/width/height` e `tiles` do `InteriorData` são derivados pelo gerador.

```jsonc
{
  "versao": 1,
  "mapa": "teste_d_destino",          // id: letras minúsculas, números e _
  "bloco": [0, 0],
  "folhas": ["casa"],                  // folhas usadas (chaves de INTERIOR_SHEETS)
  "vazio": ["casa", 0, 2],             // backdrop: o tile que cobre o canvas por baixo
  "camadas": {                         // sparse: [x, y, folha, coluna, linha]; sem entrada = vazio
    "chao":   [[0, 0, "casa", 0, 2], ...],
    "objeto": [...],
    "frente": [...]
  },
  "exterior": {                        // opcional; mapas de fora
    "terreno": ["m","m","g","c", ...], // 64*64 códigos, em ordem de leitura: m mar, g grama, c caminho, a areia, "" nada
    "decalques": [{ "x": 3, "y": 4, "id": "flor_1" }]
  },
  "bloqueios": { "mais": [[x,y],...], "menos": [[x,y],...] },  // ajustes à mão sobre o derivado (palpite)
  "nascimento": [5, 10],               // spawn
  "entradas": [{ "nome": "entrada", "x": 5, "y": 10 }],
  "saidas":   [{ "x": 0, "y": 8, "largura": 1, "altura": 2, "mapa": "exterior_ilha", "chegada": "porta_casa" }],  // chegada: nome, [x,y] ou ausente
  "zonas":    [{ "nome": "zone.kitchen", "areas": [[x0,y0,x1,y1]], "props": { "musica": "sala_dia", "ambiente": "lareira" } }],
  "moradores":[{ "nome": "Tião", "x": 7, "y": 9, "olhando": 2, "visual": "0|zar1|...", "pose": "sit" }],
  "carimbo": "161e726893c1"            // hash do conteúdo acima (12 hex), vira InteriorData.stamp
}
```

Derivação (gerador): `tiles` = paleta dos tiles usados na ordem de primeira aparição (o `vazio` primeiro); `layers` = linhas de índices separados por espaço, só do retângulo pintado (bounding box das três camadas, `x/y/width/height` em células do bloco); `blocks` = `#` onde a zona do tile de cima bloqueia (zonas `bloqueia`, `sem_pecas` fora do chão **(palpite)**), nos moradores e nos `bloqueios.mais`, `.` no resto; `actions` = código do tipo de tile do Graal por célula (`3` senta, `4` cama cima, `5` cama baixo, `.` nada; água vem da zona, não entra); `flat` = tiles de uma cor só (lidos do PNG da folha); `terrain.runs` = composição do exterior (ver EXTERIOR.md); `spawn/entries/exits/zones/residents` copiados. O resultado tem de ser idêntico aos 14 módulos que existem.

## Catálogo — `diorama/catalogo/`

- `zonas.json`: as zonas das folhas do Aeko por retângulo (cópia de `ZONES` em `src/shared/interiorMap.ts`).
- `pecas.json`: regiões com nome, id (`casa@56,25` ou `casa8`, como o jogo cita), folha, retângulo, camada sugerida, tipo (parede, janela, quadro, móvel, tapete, piso, fundo…), ação (`3`/`4`/`5`), bloqueio, variantes, encaixe (`quadro`/`janela` e a linha), fundos exigidos. Semeado com o que o jogo já lista: `DECOR_ITEMS`, `DECOR_BACKGROUNDS`, `PIECE_DEFS`, `FIXTURES`, `LIGHT_TILES`.
- `fundos.json`: os tipos de fundo (`DECOR_BACKGROUNDS`).

O gerador `--decorar` tem de reproduzir `src/shared/decorCatalog.ts` a partir daqui.

## Ponte — HTTP `127.0.0.1:34873`

`GET /mapas` · `GET /mapas/<id>` (mapa.json + blocos) · `PUT /mapas/<id>/blocos/<bx>_<by>` · `GET /catalogo/<nome>` · `PUT /catalogo/<nome>` · `GET /folhas/<nome>.rgba?x=&y=&w=&h=` (pixels crus para `EditableImage`) · `POST /gerar/<id>` (roda o gerador, devolve o log) · `GET /assets` · `POST /assets/enviadas` · `GET /status` (versão, pastas, Rojo em 34872 ok?). Sem autenticação: só escuta em 127.0.0.1.

## Plugin — ferramentas (barra "Diorama")

1. **Mapas**: editor do bloco (camadas chão/objeto/frente, pincel, retângulo, balde, borracha, conta-gotas, carimbo de peça do catálogo com a regra de fundos 12.14 e o encaixe 12.12, paredes 12.13 **(palpite de número)**, exterior, entradas/saídas/zonas 12.17, moradores 12.20, nascimento), desfazer/refazer, salvar na ponte, gerar, testar (atributos `InteriorTeste` e `InteriorTesteCelula` + Play).
2. **Catálogo**: ver as folhas, as zonas e as regiões; criar e editar regiões; salvar na ponte.
3. **Assets**: o registro, o que falta enviar, enviar imagem pelo Studio (`AssetService:CreateAssetAsync` de uma `EditableImage` **(experimental)**), importar ids.
4. **Conexão**: ponte, Rojo (34872), MCP do Studio, estado do place (scripts da Fase 0 fora do lugar, atributos de desenvolvimento).
5. **Servidor**: Play/Stop, atributos (`InteriorTeste`, `DevPanel`, celular), teleportar para mapa/célula, filtro do Output (`[Interior]`, `[graalArt]`, `[Decor]`).
6. **Problemas**: diagnóstico (asset sem id, saída para mapa desconhecido, chegada inexistente, morador com visual inválido, tile fora da folha, célula de nascimento bloqueada, catálogo com id repetido).
7. **Suporte**: a especificação e o roteiro dentro do Studio, atalhos, o que mudou.
