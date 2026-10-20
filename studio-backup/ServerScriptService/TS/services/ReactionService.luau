-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local Reflect = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Reflect
local Service = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Service
local Players = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services").Players
local _interiorChoice = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiorChoice")
local INTERIOR_TILE = _interiorChoice.INTERIOR_TILE
local placeOf = _interiorChoice.placeOf
local _moods = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "moods")
local isReaction = _moods.isReaction
local REACTION_COOLDOWN = _moods.REACTION_COOLDOWN
local worldToArtPx = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "view").worldToArtPx
local Events = TS.import(script, game:GetService("ServerScriptService"), "TS", "network").Events
--[[
	*
	 * Até quantos tiles de distância uma reação chega a outro jogador do mesmo mapa (seção 6.3 do
	 * `PLANO_OTIMIZACAO.md`): mais longe, o boneco nem está na tela dele.
	 
]]
local REACH_TILES = 30
--[[
	*
	 * Reações de rosto dos jogadores. Quem decide que o rosto reagiu é o cliente do próprio jogador
	 * (esbarrou, falou no chat, encontrou alguém); o servidor só confere e repassa. A reação dura
	 * poucos segundos e não é estado do jogo, então quem entra depois não precisa saber dela.
	 
]]
local ReactionService
do
	ReactionService = setmetatable({}, {
		__tostring = function()
			return "ReactionService"
		end,
	})
	ReactionService.__index = ReactionService
	function ReactionService.new(...)
		local self = setmetatable({}, ReactionService)
		return self:constructor(...) or self
	end
	function ReactionService:constructor()
		self.last = {}
	end
	function ReactionService:onStart()
		Players.PlayerRemoving:Connect(function(player)
			local _last = self.last
			local _player = player
			-- ▼ Map.delete ▼
			local _valueExisted = _last[_player] ~= nil
			_last[_player] = nil
			-- ▲ Map.delete ▲
			return _valueExisted
		end)
		Events.react:connect(function(player, reaction, bubble)
			if not isReaction(reaction) then
				return nil
			end
			local now = os.clock()
			-- Uma folga pequena: o cliente já espera o intervalo inteiro, e a rede varia.
			local _last = self.last
			local _player = player
			local _condition = _last[_player]
			if _condition == nil then
				_condition = -math.huge
			end
			if now - _condition < REACTION_COOLDOWN * 0.8 then
				return nil
			end
			local _last_1 = self.last
			local _player_1 = player
			_last_1[_player_1] = now
			-- Quem reagiu já mostrou a própria reação na hora; vai só a quem está no mesmo mapa (a mesma cópia da casa) e
			-- perto, não ao servidor inteiro.
			local targets = self:nearby(player)
			if #targets > 0 then
				Events.reacted:fire(targets, player.UserId, reaction, bubble == true)
			end
		end)
	end
	function ReactionService:nearby(player)
		local _key = placeOf(player)
		if _key ~= nil then
			_key = _key.key
		end
		local key = _key
		local _root = player.Character
		if _root ~= nil then
			_root = _root:FindFirstChild("HumanoidRootPart")
		end
		local root = _root
		local _result = root
		if _result ~= nil then
			_result = _result:IsA("BasePart")
		end
		local from = if _result then worldToArtPx(root.Position) else nil
		local reach = REACH_TILES * INTERIOR_TILE
		local targets = {}
		for _, other in Players:GetPlayers() do
			local _condition = other == player
			if not _condition then
				local _result_1 = placeOf(other)
				if _result_1 ~= nil then
					_result_1 = _result_1.key
				end
				_condition = _result_1 ~= key
			end
			if _condition then
				continue
			end
			local _otherRoot = other.Character
			if _otherRoot ~= nil then
				_otherRoot = _otherRoot:FindFirstChild("HumanoidRootPart")
			end
			local otherRoot = _otherRoot
			local _condition_1 = from
			if _condition_1 then
				local _result_1 = otherRoot
				if _result_1 ~= nil then
					_result_1 = _result_1:IsA("BasePart")
				end
				_condition_1 = _result_1
				if _condition_1 then
					_condition_1 = (worldToArtPx(otherRoot.Position) - from).Magnitude > reach
				end
			end
			if _condition_1 then
				continue
			end
			table.insert(targets, other)
		end
		return targets
	end
	do
		-- (Flamework) ReactionService metadata
		Reflect.defineMetadata(ReactionService, "identifier", "server/services/ReactionService@ReactionService")
		Reflect.defineMetadata(ReactionService, "flamework:implements", { "$:flamework@OnStart" })
	end
end
-- (Flamework) ReactionService decorators
Reflect.decorate(ReactionService, "$:flamework@Service", Service, {})
return {
	ReactionService = ReactionService,
}
