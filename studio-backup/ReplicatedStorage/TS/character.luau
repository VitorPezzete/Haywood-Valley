-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local ART_PX_PER_STUD = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "view").ART_PX_PER_STUD
--[[
	*
	 * O avatar do Roblox tem uns 5 studs de altura; nesta escala fica com cerca de 40 pixels de arte,
	 * e uns 16 de largura, perto dos 14 do boneco desenhado por cima dele.
	 
]]
local CHARACTER_SCALE = 8 / ART_PX_PER_STUD
--[[
	*
	 * O passo do Graal, em pixels de arte por segundo: 0,5 tile por quadro (o padrão do
	 * `player.defaultwalkspeed`, segundo o Stefan, criador do Graal, nos fóruns da GraalOnline), a 20
	 * quadros por segundo (o cliente do Graal anda em quadros de 0,05 s, o mesmo tempo de cada quadro do
	 * walk.gani): 10 tiles de 16 pixels por segundo. Pedido do usuário em 2026-10-17; antes era a metade.
	 
]]
local WALK_PX_PER_SECOND = 160
--* Em studs por segundo, andando de lado; na direção da câmera o `MovementController` compensa a inclinação. 
local WALK_SPEED = WALK_PX_PER_SECOND / ART_PX_PER_STUD
return {
	CHARACTER_SCALE = CHARACTER_SCALE,
	WALK_PX_PER_SECOND = WALK_PX_PER_SECOND,
	WALK_SPEED = WALK_SPEED,
}
