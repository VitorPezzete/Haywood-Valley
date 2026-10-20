-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local Reflect = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Reflect
local Service = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Service
local Players = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services").Players
local _decor = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "decor")
local decodeMoved = _decor.decodeMoved
local decodePlaced = _decor.decodePlaced
local decorItem = _decor.decorItem
local decorItemKey = _decor.decorItemKey
local DECOR_MAX_PIECES = _decor.DECOR_MAX_PIECES
local DECOR_MAX_TEXT = _decor.DECOR_MAX_TEXT
local DECOR_ORDER = _decor.DECOR_ORDER
local emptyDecor = _decor.emptyDecor
local encodeMoved = _decor.encodeMoved
local encodePlaced = _decor.encodePlaced
local planDecor = _decor.planDecor
local stockOf = _decor.stockOf
local _interiorChoice = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiorChoice")
local isHouse = _interiorChoice.isHouse
local placeOf = _interiorChoice.placeOf
local Events = TS.import(script, game:GetService("ServerScriptService"), "TS", "network").Events
local _rateLimit = TS.import(script, game:GetService("ServerScriptService"), "TS", "rateLimit")
local RATE = _rateLimit.RATE
local RateLimiter = _rateLimit.RateLimiter
--[[
	*
	 * Decorar a casa (etapa E2; regras em `shared/decor.ts`): o dono da casa põe peças do inventário de teste, move,
	 * gira e guarda as que pôs, e muda de lugar as peças móveis da casa (pote, cadeira, baú). As peças fixas do mapa
	 * não saem. O servidor confere cada pedido com a mesma regra do cliente (o fundo, o encaixe na parede, sem cobrir
	 * outra peça, a porta nem um jogador), manda o resultado a quem está na casa e grava no `PlayerData` do dono
	 * (`decor`, por mapa). Ao montar a casa (`PieceService.onRoomCreated`) ou quando os dados chegam, a decoração
	 * salva volta: cada peça é posta de novo pela regra, e a que não couber mais (o mapa mudou) volta ao inventário.
	 *
	 * A visita fica para depois: quem está numa casa de outro dono vê a decoração dele (ela é da cópia), mas só o
	 * dono decora.
	 
]]
local DecorService
do
	DecorService = setmetatable({}, {
		__tostring = function()
			return "DecorService"
		end,
	})
	DecorService.__index = DecorService
	function DecorService.new(...)
		local self = setmetatable({}, DecorService)
		return self:constructor(...) or self
	end
	function DecorService:constructor(pieces, playerData)
		self.pieces = pieces
		self.playerData = playerData
		self.limit = RateLimiter.new(RATE.decor)
	end
	function DecorService:onStart()
		self.pieces:onRoomCreated(function(room)
			return self:restore(room)
		end)
		self.playerData:onLoaded(function(player)
			local room = self.pieces:houseOf(player.UserId)
			if room then
				self:restore(room)
			end
			self:sendStock(player)
		end)
		Events.decorPlace:connect(function(player, item, form, ax, ay)
			return self:request(player, function(room)
				return self:place(room, player, item, form, ax, ay)
			end)
		end)
		Events.decorMove:connect(function(player, key, form, ax, ay)
			return self:request(player, function(room)
				return self:move(room, player, key, form, ax, ay)
			end)
		end)
		Events.decorStore:connect(function(player, key)
			return self:request(player, function(room)
				return self:store(room, player, key)
			end)
		end)
		Events.decorMovePiece:connect(function(player, id, ax, ay)
			return self:request(player, function(room)
				return self:movePiece(room, player, id, ax, ay)
			end)
		end)
	end
	function DecorService:request(player, handle)
		if not self.limit:allow(player) then
			return nil
		end
		local place = placeOf(player)
		if not place or not isHouse(place.id) or place.owner ~= player.UserId then
			return self:refuse(player, {
				key = "decor.refuse.notHome",
			})
		end
		-- Antes de os dados chegarem, a decoração salva ainda não está na casa: esperar, para não gravar por cima.
		if not self.playerData:isReady(player) then
			return nil
		end
		local room = self.pieces:roomOf(player)
		if room then
			handle(room)
		end
	end
	function DecorService:refuse(player, refusal)
		Events.decorRefused:fire(player, refusal.key, refusal.piece or "", table.concat((refusal.wanted or {}), ","), refusal.found or "")
	end
	function DecorService:isCell(value)
		local _value = value
		local _condition = type(_value) == "number"
		if _condition then
			_condition = value == math.floor(value) and value >= 0 and value < 64
		end
		return _condition
	end
	function DecorService:decorOf(owner)
		return self.playerData:decorOf(owner) or emptyDecor()
	end
	function DecorService:persist(room, owner, moved)
		local decor = self:decorOf(owner)
		local entry = decor.maps[room.id] or {
			placed = "",
			moved = "",
		}
		local placed = {}
		for _, state in room.board.decor do
			local _arg0 = {
				item = state.item.id,
				form = state.form,
				ax = state.ax,
				ay = state.ay,
			}
			table.insert(placed, _arg0)
		end
		local movedList = decodeMoved(entry.moved)
		if moved then
			local _array = {}
			local _length = #_array
			-- ▼ ReadonlyArray.filter ▼
			local _newValue = {}
			local _callback = function(m)
				return m.id ~= moved.id
			end
			local _length_1 = 0
			for _k, _v in movedList do
				if _callback(_v, _k - 1, movedList) == true then
					_length_1 += 1
					_newValue[_length_1] = _v
				end
			end
			-- ▲ ReadonlyArray.filter ▲
			local _Length = #_newValue
			table.move(_newValue, 1, _Length, _length + 1, _array)
			_length += _Length
			_array[_length + 1] = moved
			movedList = _array
		end
		decor.maps[room.id] = {
			placed = encodePlaced(placed),
			moved = encodeMoved(movedList),
		}
		self.playerData:setDecor(owner, decor)
		self:sendStock(owner)
	end
	function DecorService:sendStock(player)
		local stock = stockOf(self:decorOf(player))
		local _ = Events.decorStock
		local _exp = player
		-- ▼ ReadonlyArray.map ▼
		local _newValue = table.create(#DECOR_ORDER)
		local _callback = function(id)
			local _exp_1 = id
			local _id = id
			local _condition = stock[_id]
			if _condition == nil then
				_condition = 0
			end
			return `{_exp_1}={math.max(_condition, 0)}`
		end
		for _k, _v in DECOR_ORDER do
			_newValue[_k] = _callback(_v, _k - 1, DECOR_ORDER)
		end
		-- ▲ ReadonlyArray.map ▲
		_:fire(_exp, table.concat(_newValue, ","))
	end
	function DecorService:restore(room)
		if room.owner == 0 then
			return nil
		end
		local owner = Players:GetPlayerByUserId(room.owner)
		local _condition = not owner or not self.playerData:isReady(owner)
		if not _condition then
			-- ▼ ReadonlyMap.size ▼
			local _size = 0
			for _ in room.board.decor do
				_size += 1
			end
			-- ▲ ReadonlyMap.size ▲
			_condition = _size > 0
		end
		if _condition then
			return nil
		end
		local entry = self:decorOf(owner).maps[room.id]
		if not entry then
			return nil
		end
		for _, moved in decodeMoved(entry.moved) do
			local _pieces = room.board.pieces
			local _id = moved.id
			local state = _pieces[_id]
			if not state or state.mode ~= 0 or not room.board:fits(state, moved.x, moved.y) then
				continue
			end
			room.board:set(moved.id, moved.x, moved.y, 0, 0, moved.variant)
			self.pieces:sendPiece(room, state)
		end
		local dropped = 0
		for _, saved in decodePlaced(entry.placed) do
			local item = decorItem(saved.item)
			if not item then
				continue
			end
			local plan = planDecor(room.board, item, saved.form, saved.ax, saved.ay)
			if not plan.ok then
				dropped += 1
				continue
			end
			local state = {
				key = self.pieces:newDecorKey(),
				item = item,
				form = saved.form,
				variant = plan.variant,
				x = plan.x,
				y = plan.y,
				ax = saved.ax,
				ay = saved.ay,
			}
			room.board:setDecor(state)
			self.pieces:sendDecor(room, state)
		end
		local _exp = room.key
		-- ▼ ReadonlyMap.size ▼
		local _size = 0
		for _ in room.board.decor do
			_size += 1
		end
		-- ▲ ReadonlyMap.size ▲
		print(`[Decorar] {_exp}: {_size} peça(s) posta(s) do salvo` .. (if dropped > 0 then `, {dropped} não couberam e voltaram ao inventário` else ""))
		if dropped > 0 then
			self:persist(room, owner)
		end
	end
	function DecorService:place(room, player, id, form, ax, ay)
		local item = decorItem(id)
		local _condition = not item
		if not _condition then
			local _form = form
			_condition = not (type(_form) == "number")
			if not _condition then
				_condition = item.forms[form + 1] == nil or not self:isCell(ax) or not self:isCell(ay)
			end
		end
		if _condition then
			return nil
		end
		local _exp = stockOf(self:decorOf(player))
		local _id = item.id
		local _condition_1 = _exp[_id]
		if _condition_1 == nil then
			_condition_1 = 0
		end
		if _condition_1 <= 0 then
			return self:refuse(player, {
				key = "decor.refuse.none",
				piece = decorItemKey(item.id),
			})
		end
		-- ▼ ReadonlyMap.size ▼
		local _size = 0
		for _ in room.board.decor do
			_size += 1
		end
		-- ▲ ReadonlyMap.size ▲
		if _size >= DECOR_MAX_PIECES then
			return self:refuse(player, {
				key = "decor.refuse.full",
			})
		end
		local plan = planDecor(room.board, item, form, ax, ay, nil, function(x, y)
			return self.pieces:someoneAt(room, x, y)
		end)
		if not plan.ok then
			return self:refuse(player, plan.refusal)
		end
		local state = {
			key = self.pieces:newDecorKey(),
			item = item,
			form = form,
			variant = plan.variant,
			x = plan.x,
			y = plan.y,
			ax = ax,
			ay = ay,
		}
		room.board:setDecor(state)
		if #encodePlaced(self:savedList(room)) > DECOR_MAX_TEXT then
			room.board:removeDecor(state.key)
			return self:refuse(player, {
				key = "decor.refuse.full",
			})
		end
		self.pieces:sendDecor(room, state)
		self:persist(room, player)
	end
	function DecorService:savedList(room)
		local list = {}
		for _, state in room.board.decor do
			local _arg0 = {
				item = state.item.id,
				form = state.form,
				ax = state.ax,
				ay = state.ay,
			}
			table.insert(list, _arg0)
		end
		return list
	end
	function DecorService:move(room, player, key, form, ax, ay)
		local _key = key
		local _condition = not (type(_key) == "number")
		if not _condition then
			_condition = not self:isCell(ax) or not self:isCell(ay)
		end
		if _condition then
			return nil
		end
		local _decor_1 = room.board.decor
		local _key_1 = key
		local state = _decor_1[_key_1]
		local _condition_1 = not state
		if not _condition_1 then
			local _form = form
			_condition_1 = not (type(_form) == "number")
			if not _condition_1 then
				_condition_1 = state.item.forms[form + 1] == nil
			end
		end
		if _condition_1 then
			return nil
		end
		local plan = planDecor(room.board, state.item, form, ax, ay, key, function(x, y)
			return self.pieces:someoneAt(room, x, y)
		end)
		if not plan.ok then
			return self:refuse(player, plan.refusal)
		end
		local _board = room.board
		local _object = table.clone(state)
		setmetatable(_object, nil)
		_object.form = form
		_object.variant = plan.variant
		_object.x = plan.x
		_object.y = plan.y
		_object.ax = ax
		_object.ay = ay
		_board:setDecor(_object)
		local _pieces = self.pieces
		local _exp = room
		local _decor_2 = room.board.decor
		local _key_2 = key
		_pieces:sendDecor(_exp, _decor_2[_key_2])
		self:persist(room, player)
	end
	function DecorService:store(room, player, key)
		local _key = key
		if not (type(_key) == "number") then
			return nil
		end
		local state = room.board:removeDecor(key)
		if not state then
			return nil
		end
		self.pieces:sendDecor(room, state, nil, true)
		self:persist(room, player)
	end
	function DecorService:movePiece(room, player, id, ax, ay)
		local _id = id
		local _condition = not (type(_id) == "string")
		if not _condition then
			_condition = not self:isCell(ax) or not self:isCell(ay)
		end
		if _condition then
			return nil
		end
		local _pieces = room.board.pieces
		local _id_1 = id
		local state = _pieces[_id_1]
		if not state or state.mode ~= 0 or state.spot.test then
			return nil
		end
		local def = state.spot.def
		local x = ax - math.floor((def.w - 1) / 2)
		local y = ay - math.floor((def.h - 1) / 2)
		if not room.board:fits(state, x, y, function(cx, cy)
			return self.pieces:someoneAt(room, cx, cy)
		end) then
			return self:refuse(player, {
				key = "decor.refuse.blocked",
			})
		end
		state.variant = room.board:variantFor(state, x, y)
		state.x = x
		state.y = y
		self.pieces:sendPiece(room, state)
		self:persist(room, player, {
			id = id,
			x = x,
			y = y,
			variant = state.variant,
		})
	end
	do
		-- (Flamework) DecorService metadata
		Reflect.defineMetadata(DecorService, "identifier", "server/services/DecorService@DecorService")
		Reflect.defineMetadata(DecorService, "flamework:parameters", { "server/services/PieceService@PieceService", "server/services/PlayerDataService@PlayerDataService" })
		Reflect.defineMetadata(DecorService, "flamework:implements", { "$:flamework@OnStart" })
	end
end
-- (Flamework) DecorService decorators
Reflect.decorate(DecorService, "$:flamework@Service", Service, {})
return {
	DecorService = DecorService,
}
