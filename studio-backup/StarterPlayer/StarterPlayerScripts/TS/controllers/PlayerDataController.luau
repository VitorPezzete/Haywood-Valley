-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local Reflect = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Reflect
local Controller = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Controller
local Players = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services").Players
local Events = TS.import(script, script.Parent.Parent, "network").Events
local playerData = TS.import(script, script.Parent.Parent, "state", "playerData").playerData
local t = TS.import(script, script.Parent.Parent, "ui", "i18n").t
--[[
	*
	 * Recebe do servidor os favoritos e os visuais salvos do jogador (PlayerDataService): ao entrar e quando o servidor
	 * recusa um pedido. Se os dados não puderam ser lidos, o jogador sai com o aviso (nada desta sessão seria gravado).
	 
]]
local PlayerDataController
do
	PlayerDataController = setmetatable({}, {
		__tostring = function()
			return "PlayerDataController"
		end,
	})
	PlayerDataController.__index = PlayerDataController
	function PlayerDataController.new(...)
		local self = setmetatable({}, PlayerDataController)
		return self:constructor(...) or self
	end
	function PlayerDataController:constructor()
	end
	function PlayerDataController:onStart()
		Events.playerDataFailed:connect(function()
			return Players.LocalPlayer:Kick(t("menu.dataFailed"))
		end)
		Events.playerData:connect(function(favoriteHeads, favoriteBodies, savedLooks, character, characterName)
			-- A decoração não vem por aqui: o cliente a recebe peça a peça (`decorChanged`, DecorService).
			playerData(function(data)
				local _object = table.clone(data)
				setmetatable(_object, nil)
				_object.favoriteHeads = favoriteHeads
				_object.favoriteBodies = favoriteBodies
				_object.savedLooks = savedLooks
				_object.character = character
				_object.characterName = characterName
				return _object
			end)
		end)
	end
	do
		-- (Flamework) PlayerDataController metadata
		Reflect.defineMetadata(PlayerDataController, "identifier", "client/controllers/PlayerDataController@PlayerDataController")
		Reflect.defineMetadata(PlayerDataController, "flamework:implements", { "$:flamework@OnStart" })
	end
end
-- (Flamework) PlayerDataController decorators
Reflect.decorate(PlayerDataController, "$:flamework@Controller", Controller, {})
return {
	PlayerDataController = PlayerDataController,
}
