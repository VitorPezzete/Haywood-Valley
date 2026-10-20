-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local Players = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services").Players
--[[
	*
	 * O nome da tela preta da abertura, que o script de `ReplicatedFirst` põe antes de tudo
	 * (`assets/first/Abertura.client.luau`, fase 1 do `PLANO_OTIMIZACAO.md`, item 7). O mesmo nome fica nos dois.
	 
]]
local OPENING_GUI = "Abertura"
--* Tira a tela preta da abertura: a tela do jogo já está montada por baixo dela. 
local function closeOpening()
	local _result = Players.LocalPlayer:FindFirstChild("PlayerGui")
	if _result ~= nil then
		_result = _result:FindFirstChild(OPENING_GUI)
		if _result ~= nil then
			_result:Destroy()
		end
	end
end
return {
	closeOpening = closeOpening,
	OPENING_GUI = OPENING_GUI,
}
