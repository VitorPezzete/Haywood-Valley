-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local Reflect = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Reflect
local Service = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Service
local _services = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services")
local Players = _services.Players
local TextService = _services.TextService
local _names = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "names")
local cleanName = _names.cleanName
local NAME_ATTRIBUTE = _names.NAME_ATTRIBUTE
local NAME_MAX_BYTES = _names.NAME_MAX_BYTES
local Events = TS.import(script, game:GetService("ServerScriptService"), "TS", "network").Events
local _rateLimit = TS.import(script, game:GetService("ServerScriptService"), "TS", "rateLimit")
local RATE = _rateLimit.RATE
local RateLimiter = _rateLimit.RateLimiter
--[[
	*
	 * Guarda o nome do personagem de cada jogador num atributo, para todos os clientes poderem mostrar.
	 * Texto escrito por jogador só aparece para os outros depois de passar pelo filtro do Roblox; se o
	 * filtro falhar, o nome antigo fica. Quem não escolheu nome usa o nome de exibição do Roblox.
	 
]]
local NameService
do
	NameService = setmetatable({}, {
		__tostring = function()
			return "NameService"
		end,
	})
	NameService.__index = NameService
	function NameService.new(...)
		local self = setmetatable({}, NameService)
		return self:constructor(...) or self
	end
	function NameService:constructor()
	end
	function NameService:onStart()
		Players.PlayerAdded:Connect(function(player)
			return self:setDefault(player)
		end)
		for _, player in Players:GetPlayers() do
			self:setDefault(player)
		end
		-- O filtro do Roblox também tem limite: no máximo `RATE.setName` por segundo.
		local limit = RateLimiter.new(RATE.setName)
		Events.setName:connect(function(player, text)
			if not limit:allow(player) then
				return nil
			end
			-- O texto vem do cliente: conferir o tamanho antes de qualquer trabalho.
			local _text = text
			local _condition = not (type(_text) == "string")
			if not _condition then
				_condition = #text > NAME_MAX_BYTES
			end
			if _condition then
				return nil
			end
			local name = cleanName(text)
			if name == "" then
				return nil
			end
			local ok, filtered = pcall(function()
				return TextService:FilterStringAsync(name, player.UserId):GetNonChatStringForBroadcastAsync()
			end)
			if ok and type(filtered) == "string" and filtered ~= "" then
				player:SetAttribute(NAME_ATTRIBUTE, filtered)
			end
		end)
	end
	function NameService:setDefault(player)
		if player:GetAttribute(NAME_ATTRIBUTE) == nil then
			player:SetAttribute(NAME_ATTRIBUTE, player.DisplayName)
		end
	end
	do
		-- (Flamework) NameService metadata
		Reflect.defineMetadata(NameService, "identifier", "server/services/NameService@NameService")
		Reflect.defineMetadata(NameService, "flamework:implements", { "$:flamework@OnStart" })
	end
end
-- (Flamework) NameService decorators
Reflect.decorate(NameService, "$:flamework@Service", Service, {})
return {
	NameService = NameService,
}
