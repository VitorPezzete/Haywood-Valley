-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
-- Gerado por tools/diorama_jogo.mjs: os interiores que o jogo conhece e as folhas do Aeko no Roblox.
-- Não editar: cada `npm run diorama:jogo` refaz esta lista com os módulos da pasta.
local ASSETS = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "assets").ASSETS
local map0 = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiors", "banheiro_equipe").interior
local map1 = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiors", "casa_teste_v2").interior
local map2 = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiors", "casa_teste_v2_atual").interior
local map3 = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiors", "casa_teste_v2_l").interior
local map4 = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiors", "casa_teste_v2_menor").interior
local map5 = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiors", "castelo_passagem").interior
local map6 = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiors", "comodo_ferramenta").interior
local map7 = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiors", "exemplo_comodo").interior
local map8 = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiors", "exterior_32").interior
local map9 = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiors", "exterior_ilha").interior
local map10 = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiors", "moradores_jogo").interior
local map11 = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiors", "teste_d_destino").interior
local map12 = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiors", "teste_d_ligacoes").interior
local map13 = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiors", "teste_d_origem").interior
--* As metades de cada folha (ids no registro de assets, aeko.<folha>.<metade>). 
local INTERIOR_SHEETS = {
	casa = { ASSETS["aeko.casa.0"], ASSETS["aeko.casa.1"] },
	castelo = { ASSETS["aeko.castelo.0"], ASSETS["aeko.castelo.1"] },
}
--[[
	*
	 * As imagens do exterior (a junção: a folha de 16 px da grade dupla e as formas de 32 px da equipe), na ordem
	 * do número `imagem` de `terrain.runs` (ids no registro de assets, exterior.<arquivo>).
	 
]]
local EXTERIOR_SHEETS = { ASSETS["exterior.folha_juncao"], ASSETS["exterior.forma_equipe_32"] }
local INTERIORS = {
	banheiro_equipe = map0,
	casa_teste_v2 = map1,
	casa_teste_v2_atual = map2,
	casa_teste_v2_l = map3,
	casa_teste_v2_menor = map4,
	castelo_passagem = map5,
	comodo_ferramenta = map6,
	exemplo_comodo = map7,
	exterior_32 = map8,
	exterior_ilha = map9,
	moradores_jogo = map10,
	teste_d_destino = map11,
	teste_d_ligacoes = map12,
	teste_d_origem = map13,
}
return {
	INTERIOR_SHEETS = INTERIOR_SHEETS,
	EXTERIOR_SHEETS = EXTERIOR_SHEETS,
	INTERIORS = INTERIORS,
}
