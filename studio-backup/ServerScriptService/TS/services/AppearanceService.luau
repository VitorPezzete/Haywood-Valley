-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local Reflect = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Reflect
local Service = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Service
local Players = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services").Players
local _appearance = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "appearance")
local DEFAULT_LOOK = _appearance.DEFAULT_LOOK
local encodeLook = _appearance.encodeLook
local LOOK_ATTRIBUTE = _appearance.LOOK_ATTRIBUTE
local parseLook = _appearance.parseLook
local Events = TS.import(script, game:GetService("ServerScriptService"), "TS", "network").Events
local _rateLimit = TS.import(script, game:GetService("ServerScriptService"), "TS", "rateLimit")
local RATE = _rateLimit.RATE
local RateLimiter = _rateLimit.RateLimiter
--* Guarda o visual escolhido por cada jogador num atributo, para todos os clientes desenharem igual. 
local AppearanceService
do
	AppearanceService = setmetatable({}, {
		__tostring = function()
			return "AppearanceService"
		end,
	})
	AppearanceService.__index = AppearanceService
	function AppearanceService.new(...)
		local self = setmetatable({}, AppearanceService)
		return self:constructor(...) or self
	end
	function AppearanceService:constructor()
	end
	function AppearanceService:onStart()
		Players.PlayerAdded:Connect(function(player)
			return self:setDefault(player)
		end)
		for _, player in Players:GetPlayers() do
			self:setDefault(player)
		end
		-- O visual vai num atributo que chega aos 200 clientes: no máximo `RATE.setLook` por segundo.
		local limit = RateLimiter.new(RATE.setLook)
		Events.setLook:connect(function(player, text)
			if not limit:allow(player) then
				return nil
			end
			-- Só entra cabeça e corpo que o catálogo tem e cor válida; o texto é regravado a partir do que foi lido.
			local look = parseLook(text)
			if look then
				player:SetAttribute(LOOK_ATTRIBUTE, encodeLook(look))
			end
		end)
	end
	function AppearanceService:setDefault(player)
		if player:GetAttribute(LOOK_ATTRIBUTE) == nil then
			player:SetAttribute(LOOK_ATTRIBUTE, encodeLook(DEFAULT_LOOK))
		end
	end
	do
		-- (Flamework) AppearanceService metadata
		Reflect.defineMetadata(AppearanceService, "identifier", "server/services/AppearanceService@AppearanceService")
		Reflect.defineMetadata(AppearanceService, "flamework:implements", { "$:flamework@OnStart" })
	end
end
-- (Flamework) AppearanceService decorators
Reflect.decorate(AppearanceService, "$:flamework@Service", Service, {})
return {
	AppearanceService = AppearanceService,
}
