-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
-- A hora do jogo. Este é o único lugar de onde ela sai: o tom do dia, as luzes e as janelas de noite leem
-- `gameHour()`. Hoje é um relógio de teste (decisão do usuário em 2026-10-18: o tempo de verdade do jogo vem
-- depois); para trocar a fonte, mudar só este arquivo.
local Workspace = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services").Workspace
--* Quanto dura um dia inteiro do relógio de teste, em segundos de jogo: uns 10 minutos. 
local DAY_SECONDS = 600
--* A hora em que o relógio de teste estava no instante 0 do relógio do servidor. 
local HOUR_AT_ZERO = 6
--[[
	*
	 * Atributo do Workspace que fixa a hora, para testar: um número de 0 a 24 (`workspace:SetAttribute("HoraTeste",
	 * 21)`). Posto no servidor, vale para todos; no cliente, só para ele. Tirar o atributo volta ao relógio.
	 
]]
local HOUR_TEST_ATTRIBUTE = "HoraTeste"
--[[
	*
	 * Atributo do Workspace com quantos segundos o relógio de teste está adiantado (o dormir pula a noite: o servidor
	 * soma aqui o que falta até a manhã, `FixtureService`). Vale para todos, porque todos leem o mesmo relógio.
	 
]]
local CLOCK_OFFSET_ATTRIBUTE = "RelogioDesvio"
--* A hora em que quem dorme acorda. 
local WAKE_HOUR = 6
--[[
	*
	 * A hora do jogo agora, de 0 (meia-noite) a 24, com fração. Sai do relógio do servidor
	 * (`GetServerTimeNow`), que é o mesmo em todos os clientes: todos veem a mesma hora sem mandar nada pela rede.
	 
]]
local function gameHour()
	local fixed = Workspace:GetAttribute(HOUR_TEST_ATTRIBUTE)
	if type(fixed) == "number" then
		return fixed % 24
	end
	local offset = Workspace:GetAttribute(CLOCK_OFFSET_ATTRIBUTE)
	local days = (Workspace:GetServerTimeNow() + (if type(offset) == "number" then offset else 0)) / DAY_SECONDS
	return (HOUR_AT_ZERO + (days % 1) * 24) % 24
end
--[[
	*
	 * Quantos segundos do relógio de teste faltam de agora até a próxima `WAKE_HOUR` (pular a noite). Dormir de manhã
	 * cedo, antes dela, acorda nela mesma.
	 
]]
local function secondsUntilWake()
	local hours = (((WAKE_HOUR - gameHour()) % 24) + 24) % 24
	return (hours / 24) * DAY_SECONDS
end
return {
	gameHour = gameHour,
	secondsUntilWake = secondsUntilWake,
	DAY_SECONDS = DAY_SECONDS,
	HOUR_TEST_ATTRIBUTE = HOUR_TEST_ATTRIBUTE,
	CLOCK_OFFSET_ATTRIBUTE = CLOCK_OFFSET_ATTRIBUTE,
	WAKE_HOUR = WAKE_HOUR,
}
