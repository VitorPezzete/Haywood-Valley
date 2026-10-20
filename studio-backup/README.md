# Cópia do Studio (2026-10-20)

Scripts copiados do place "Haywood Valley" (placeId 122468356222519) em 2026-10-20, depois que a formatação do PC levou o `src/` mais novo. O GitHub tinha parado em 11/10; este é o estado do jogo antes da formatação.

- `ReplicatedStorage/TS`, `ServerScriptService/TS` e `StarterPlayer/StarterPlayerScripts/TS` são o Luau compilado pelo roblox-ts de `src/shared`, `src/server` e `src/client`. Servem de referência para reconstruir o TypeScript: `npx rbxtsc` deve gerar exatamente estes arquivos.
- `ReplicatedFirst/Abertura` e `StarterPlayer/StarterCharacterScripts` foram escritos direto em Luau; a versão em uso está em `luau/`.
- `ServerStorage/Fase0Antiga` são os scripts da Fase 0, guardados no place e desligados.
- Os pacotes (`rbxts_include`) ficaram de fora: são idênticos aos de `node_modules`.

Não editar: é registro do que estava no Studio.
