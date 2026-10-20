-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local Players = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services").Players
--[[
	*
	 * O limitador comum dos pedidos do cliente (fase 1 do `PLANO_OTIMIZACAO.md`, seção 6.4): um balde por jogador,
	 * que enche `perSecond` fichas por segundo até `burst`; cada pedido gasta uma, e o pedido sem ficha é ignorado.
	 * Um limitador por tipo de pedido, criado uma vez no serviço que atende o pedido. Assim um cliente que manda
	 * pedidos sem parar (por erro ou de propósito) não faz o servidor trabalhar nem gravar atributo que vai para os
	 * 200 clientes a cada quadro.
	 
]]
local RateLimiter
do
	RateLimiter = setmetatable({}, {
		__tostring = function()
			return "RateLimiter"
		end,
	})
	RateLimiter.__index = RateLimiter
	function RateLimiter.new(...)
		local self = setmetatable({}, RateLimiter)
		return self:constructor(...) or self
	end
	function RateLimiter:constructor(perSecond, burst)
		if burst == nil then
			burst = perSecond
		end
		self.perSecond = perSecond
		self.burst = burst
		self.buckets = {}
		Players.PlayerRemoving:Connect(function(player)
			local _buckets = self.buckets
			local _player = player
			-- ▼ Map.delete ▼
			local _valueExisted = _buckets[_player] ~= nil
			_buckets[_player] = nil
			-- ▲ Map.delete ▲
			return _valueExisted
		end)
	end
	function RateLimiter:allow(player)
		local now = os.clock()
		local _buckets = self.buckets
		local _player = player
		local bucket = _buckets[_player]
		if not bucket then
			local _buckets_1 = self.buckets
			local _player_1 = player
			local _arg1 = {
				tokens = self.burst - 1,
				at = now,
			}
			_buckets_1[_player_1] = _arg1
			return true
		end
		bucket.tokens = math.min(self.burst, bucket.tokens + (now - bucket.at) * self.perSecond)
		bucket.at = now
		if bucket.tokens < 1 then
			return false
		end
		bucket.tokens -= 1
		return true
	end
end
--[[
	*
	 * Os limites de cada pedido, por segundo (seção 6.4 do plano). O `react` tem o intervalo das reações
	 * (`REACTION_COOLDOWN`) e o `takeExit`, o dele (`MapService`).
	 
]]
local RATE = {
	setLook = 2,
	setName = 1,
	setFavorite = 10,
	saveLook = 4,
	setAction = 10,
	pieces = 20,
	decor = 8,
}
return {
	RateLimiter = RateLimiter,
	RATE = RATE,
}
