-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local exports = {}
-- A escolha do interior mudou para shared/interiorChoice.ts, para o servidor saber em que mapa os
-- jogadores estão (as peças que se empurram e se carregam são dele). Este módulo continua com os nomes de
-- antes para o cliente.
local _interiorChoice = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiorChoice")
exports.interiorTest = _interiorChoice.interiorTest
exports.START_INTERIOR = _interiorChoice.START_INTERIOR
exports.startInterior = _interiorChoice.startInterior
return exports
