-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local Reflect = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Reflect
local Service = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Service
local Players = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services").Players
local _actions = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "actions")
local ACTION_ATTRIBUTE = _actions.ACTION_ATTRIBUTE
local encodeAction = _actions.encodeAction
local isAction = _actions.isAction
local _interiorChoice = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiorChoice")
local actionsStart = _interiorChoice.actionsStart
local cellOfPoint = _interiorChoice.cellOfPoint
local mapCorner = _interiorChoice.mapCorner
local mapData = _interiorChoice.mapData
local placeOf = _interiorChoice.placeOf
local InteriorMap = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiorMap").InteriorMap
local _pieces = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "pieces")
local canLift = _pieces.canLift
local canPull = _pieces.canPull
local canPush = _pieces.canPush
local dirStep = _pieces.dirStep
local frontSpot = _pieces.frontSpot
local handlingOf = _pieces.handlingOf
local PIECE_REACH = _pieces.PIECE_REACH
local PieceBoard = _pieces.PieceBoard
local TAP_REACH = _pieces.TAP_REACH
local THROW_CELLS = _pieces.THROW_CELLS
local worldToArtPx = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "view").worldToArtPx
local Events = TS.import(script, game:GetService("ServerScriptService"), "TS", "network").Events
local _rateLimit = TS.import(script, game:GetService("ServerScriptService"), "TS", "rateLimit")
local RATE = _rateLimit.RATE
local RateLimiter = _rateLimit.RateLimiter
--[[
	*
	 * Um mapa com as peças dele: cada mapa tem as suas, montadas quando o primeiro jogador chega. A casa de cada
	 * jogador é uma cópia própria (`key` "<mapa>#<dono>"), com a decoração dele.
	 
]]
--[[
	*
	 * As ações do boneco que passam pelo servidor. A ação de empurrar, segurar e puxar é só desenho: o
	 * servidor confere o pedido e grava no atributo `Action` do jogador, que os outros clientes leem.
	 *
	 * As peças móveis do interior (`shared/pieces.ts`) são dele: cada pedido de segurar, puxar, empurrar (andando contra),
	 * levantar, pôr no chão ou jogar é conferido (a peça existe, está perto do jogador, o destino é piso livre
	 * sem outra peça nem outro jogador) e o resultado vai para quem está no mesmo mapa. A posição vale só para a
	 * sessão. Cada mapa tem as suas peças (`Room`); o mapa de cada jogador é o atributo `Mapa` (`MapService`).
	 
]]
local PieceService
do
	PieceService = setmetatable({}, {
		__tostring = function()
			return "PieceService"
		end,
	})
	PieceService.__index = PieceService
	function PieceService.new(...)
		local self = setmetatable({}, PieceService)
		return self:constructor(...) or self
	end
	function PieceService:constructor()
		self.rooms = {}
		self.limit = RateLimiter.new(RATE.pieces)
		self.actionLimit = RateLimiter.new(RATE.setAction)
		self.created = {}
		self.nextDecor = 1
	end
	function PieceService:onStart()
		Events.setAction:connect(function(player, kind, facing)
			if not self.actionLimit:allow(player) or not isAction(kind, facing) then
				return nil
			end
			local value = if kind == "" then "" else encodeAction(kind, facing)
			if player:GetAttribute(ACTION_ATTRIBUTE) ~= value then
				player:SetAttribute(ACTION_ATTRIBUTE, value)
			end
		end)
		Players.PlayerRemoving:Connect(function(player)
			self:leaveMap(player)
			-- A casa vazia de um dono que saiu é esquecida (a decoração dela já está no salvo dele).
			task.defer(function()
				for key, room in self.rooms do
					if room.owner > 0 and #self:playersIn(room) == 0 and Players:GetPlayerByUserId(room.owner) == nil then
						self.rooms[key] = nil
					end
				end
			end)
		end)
		Events.piecesReady:connect(function(player)
			local room = self:roomOf(player)
			if not room then
				return nil
			end
			for _, state in room.board:all() do
				if not room.board:untouched(state) then
					self:send(room, state, player)
				end
			end
			for _, _binding in room.board.map.taps do
				local x = _binding[1]
				local y = _binding[2]
				local _closedTaps = room.closedTaps
				local _arg0 = room.board.map:key(x, y)
				if _closedTaps[_arg0] ~= nil then
					Events.tapChanged:fire(player, room.key, x, y, false)
				end
			end
			for _, state in room.board.decor do
				self:sendDecor(room, state, player)
			end
		end)
		Events.toggleTap:connect(function(player, x, y)
			return self:request(player, function(room)
				return self:toggleTap(room, player, x, y)
			end)
		end)
		Events.grabPiece:connect(function(player, id)
			return self:request(player, function(room)
				return self:grab(room, player, id)
			end)
		end)
		Events.releasePiece:connect(function(player, id)
			return self:request(player, function(room)
				return self:release(room, player, id)
			end)
		end)
		Events.stepPiece:connect(function(player, id, dx, dy)
			return self:request(player, function(room)
				return self:step(room, player, id, dx, dy)
			end)
		end)
		Events.pushPiece:connect(function(player, id, dx, dy)
			return self:request(player, function(room)
				return self:push(room, player, id, dx, dy)
			end)
		end)
		Events.liftPiece:connect(function(player, id)
			return self:request(player, function(room)
				return self:lift(room, player, id)
			end)
		end)
		Events.placePiece:connect(function(player, id, x, y)
			return self:request(player, function(room)
				return self:place(room, player, id, x, y)
			end)
		end)
		Events.throwPiece:connect(function(player, id, facing)
			return self:request(player, function(room)
				return self:throw(room, player, id, facing)
			end)
		end)
	end
	function PieceService:onRoomCreated(listener)
		local _created = self.created
		local _listener = listener
		table.insert(_created, _listener)
	end
	function PieceService:roomOf(player)
		local place = placeOf(player)
		local data = place and mapData(place.id)
		if not place or not data then
			return nil
		end
		local _rooms = self.rooms
		local _key = place.key
		local room = _rooms[_key]
		if not room then
			local start = actionsStart(data)
			room = {
				key = place.key,
				id = data.id,
				owner = place.owner,
				board = PieceBoard.new(InteriorMap.new(data, start.cell, start.test)),
				corner = mapCorner(data.id, place.slot),
				closedTaps = {},
			}
			local _rooms_1 = self.rooms
			local _key_1 = place.key
			local _room = room
			_rooms_1[_key_1] = _room
			print(`[Pecas] {place.key}: {#room.board:all()} peça(s) móvel(is)`)
			for _, listener in self.created do
				listener(room)
			end
		end
		return room
	end
	function PieceService:houseOf(owner)
		for _, room in self.rooms do
			if room.owner == owner then
				return room
			end
		end
		return nil
	end
	function PieceService:playersIn(room)
		local _exp = Players:GetPlayers()
		-- ▼ ReadonlyArray.filter ▼
		local _newValue = {}
		local _callback = function(player)
			local _result = placeOf(player)
			if _result ~= nil then
				_result = _result.key
			end
			return _result == room.key
		end
		local _length = 0
		for _k, _v in _exp do
			if _callback(_v, _k - 1, _exp) == true then
				_length += 1
				_newValue[_length] = _v
			end
		end
		-- ▲ ReadonlyArray.filter ▲
		return _newValue
	end
	function PieceService:newDecorKey()
		local _original = self.nextDecor
		self.nextDecor += 1
		return _original
	end
	function PieceService:sendDecor(room, state, to, removed)
		if removed == nil then
			removed = false
		end
		local args = { room.key, state.key, if removed then "" else state.item.id, state.form, state.variant, state.x, state.y, state.ax, state.ay }
		if to then
			Events.decorChanged:fire(to, unpack(args))
		else
			Events.decorChanged:fire(self:playersIn(room), unpack(args))
		end
	end
	function PieceService:sendPiece(room, state)
		self:send(room, state)
	end
	function PieceService:leaveMap(player)
		local room = self:roomOf(player)
		local _state = room
		if _state ~= nil then
			_state = _state.board:heldBy(player.UserId)
		end
		local state = _state
		if room and state then
			self:release(room, player, state.spot.id)
		end
	end
	function PieceService:request(player, handle)
		if not self.limit:allow(player) then
			return nil
		end
		local room = self:roomOf(player)
		if room then
			handle(room)
		end
	end
	function PieceService:feetOf(room, player)
		local _root = player.Character
		if _root ~= nil then
			_root = _root:FindFirstChild("HumanoidRootPart")
		end
		local root = _root
		local _result = root
		if _result ~= nil then
			_result = _result:IsA("BasePart")
		end
		if not _result then
			return nil
		end
		local _exp = worldToArtPx(root.Position)
		local _arg0 = worldToArtPx(room.corner)
		return _exp - _arg0
	end
	function PieceService:near(room, player, state)
		local feet = self:feetOf(room, player)
		if not feet then
			return false
		end
		local x = math.floor(feet.X / 16)
		local y = math.floor(feet.Y / 16)
		local def = state.spot.def
		local dx = math.max(state.x - x, 0, x - (state.x + def.w - 1))
		local dy = math.max(state.y - y, 0, y - (state.y + def.h - 1))
		return dx <= PIECE_REACH and dy <= PIECE_REACH
	end
	function PieceService:someoneAt(room, x, y, except)
		for _, player in self:playersIn(room) do
			if player == except then
				continue
			end
			local _root = player.Character
			if _root ~= nil then
				_root = _root:FindFirstChild("HumanoidRootPart")
			end
			local root = _root
			local _result = root
			if _result ~= nil then
				_result = _result:IsA("BasePart")
			end
			if not _result then
				continue
			end
			local _binding = cellOfPoint(room.corner, root.Position)
			local cx = _binding[1]
			local cy = _binding[2]
			if cx == x and cy == y then
				return true
			end
		end
		return false
	end
	function PieceService:send(room, state, to)
		local args = { room.key, state.spot.id, state.x, state.y, state.mode, state.holder, state.variant }
		if to then
			Events.pieceChanged:fire(to, unpack(args))
		else
			Events.pieceChanged:fire(self:playersIn(room), unpack(args))
		end
	end
	function PieceService:free(room, player, id)
		local _pieces_1 = room.board.pieces
		local _id = id
		local state = _pieces_1[_id]
		if not state or state.mode ~= 0 then
			return nil
		end
		if room.board:heldBy(player.UserId) then
			return nil
		end
		return if self:near(room, player, state) then state else nil
	end
	function PieceService:own(room, player, id, mode)
		local _pieces_1 = room.board.pieces
		local _id = id
		local state = _pieces_1[_id]
		return if state and state.mode == mode and state.holder == player.UserId then state else nil
	end
	function PieceService:grab(room, player, id)
		local state = self:free(room, player, id)
		if not state or not canPull(handlingOf(player), state.spot.def) then
			return nil
		end
		state.mode = 1
		state.holder = player.UserId
		self:send(room, state)
	end
	function PieceService:release(room, player, id)
		local _pieces_1 = room.board.pieces
		local _id = id
		local state = _pieces_1[_id]
		if not state or state.holder ~= player.UserId then
			return nil
		end
		-- Carregada e solta (o jogador saiu, caiu na água): volta para onde estava, se ainda couber.
		if state.mode == 2 and not room.board:fits(state, state.x, state.y) then
			state.mode = 3
		elseif state.mode ~= 3 then
			state.mode = 0
		end
		state.holder = 0
		self:send(room, state)
	end
	function PieceService:step(room, player, id, dx, dy)
		local state = self:own(room, player, id, 1)
		if not state or not self:unitStep(dx, dy) or self:towardPlayer(room, player, state, dx, dy) <= 0 then
			return nil
		end
		self:slide(room, player, state, dx, dy)
	end
	function PieceService:push(room, player, id, dx, dy)
		local state = self:free(room, player, id)
		if not state or not self:unitStep(dx, dy) or not canPush(handlingOf(player), state.spot.def) then
			return nil
		end
		if self:towardPlayer(room, player, state, dx, dy) >= 0 then
			return nil
		end
		self:slide(room, player, state, dx, dy)
	end
	function PieceService:unitStep(dx, dy)
		local _dx = dx
		local _condition = type(_dx) == "number"
		if _condition then
			local _dy = dy
			_condition = type(_dy) == "number"
			if _condition then
				_condition = math.abs(dx) + math.abs(dy) == 1 and dx % 1 == 0 and dy % 1 == 0
			end
		end
		return _condition
	end
	function PieceService:towardPlayer(room, player, state, dx, dy)
		local feet = self:feetOf(room, player)
		if not feet then
			return 0
		end
		local def = state.spot.def
		local center = Vector2.new(state.x + def.w / 2, state.y + def.h / 2) * 16
		local toFeet = feet - center
		return toFeet.X * dx + toFeet.Y * dy
	end
	function PieceService:slide(room, player, state, dx, dy)
		local x = state.x + dx
		local y = state.y + dy
		if not self:near(room, player, state) then
			return nil
		end
		if not room.board:fits(state, x, y, function(cx, cy)
			return self:someoneAt(room, cx, cy, player)
		end) then
			return nil
		end
		state.variant = room.board:variantFor(state, x, y)
		state.x = x
		state.y = y
		self:send(room, state)
	end
	function PieceService:lift(room, player, id)
		local state = self:free(room, player, id)
		if not state or not canLift(handlingOf(player), state.spot.def) then
			return nil
		end
		state.mode = 2
		state.holder = player.UserId
		self:send(room, state)
	end
	function PieceService:place(room, player, id, x, y)
		local state = self:own(room, player, id, 2)
		local _condition = not state
		if not _condition then
			local _x = x
			_condition = not (type(_x) == "number")
			if not _condition then
				local _y = y
				_condition = not (type(_y) == "number")
				if not _condition then
					_condition = x % 1 ~= 0 or y % 1 ~= 0
				end
			end
		end
		if _condition then
			return nil
		end
		local feet = self:feetOf(room, player)
		if not feet then
			return nil
		end
		-- Só logo em volta do pé: o retângulo da peça encosta na célula do pé ou fica a uma célula dela.
		local fx = math.floor(feet.X / 16)
		local fy = math.floor(feet.Y / 16)
		local def = state.spot.def
		local gapX = math.max(x - fx, 0, fx - (x + def.w - 1))
		local gapY = math.max(y - fy, 0, fy - (y + def.h - 1))
		if gapX > 2 or gapY > 2 then
			return nil
		end
		if not room.board:fits(state, x, y, function(cx, cy)
			return self:someoneAt(room, cx, cy, player)
		end) then
			return nil
		end
		state.variant = room.board:variantFor(state, x, y)
		state.x = x
		state.y = y
		state.mode = 0
		state.holder = 0
		self:send(room, state)
	end
	function PieceService:throw(room, player, id, facing)
		local state = self:own(room, player, id, 2)
		local feet = self:feetOf(room, player)
		local _condition = not state or not feet
		if not _condition then
			local _facing = facing
			_condition = not (type(_facing) == "number")
			if not _condition then
				_condition = facing < 0 or facing > 3 or facing % 1 ~= 0
			end
		end
		if _condition then
			return nil
		end
		local def = state.spot.def
		local dir = facing
		local _binding = dirStep(dir)
		local sx = _binding[1]
		local sy = _binding[2]
		local _binding_1 = frontSpot(feet, dir, def.w, def.h)
		local x = _binding_1[1]
		local y = _binding_1[2]
		local occupied = function(cx, cy)
			return self:someoneAt(room, cx, cy, player)
		end
		if not room.board:fits(state, x, y, occupied) then
			if not def.breaks then
				return nil
			end
			self:land(room, state, player, x, y, 3)
			return nil
		end
		for n = 0, THROW_CELLS - 1 do
			if not room.board:fits(state, x + sx, y + sy, occupied) then
				break
			end
			x += sx
			y += sy
		end
		self:land(room, state, player, x, y, if def.breaks then 3 else 0)
	end
	function PieceService:land(room, state, player, x, y, mode)
		if mode == 0 then
			state.variant = room.board:variantFor(state, x, y)
		end
		state.x = x
		state.y = y
		state.mode = mode
		state.holder = 0
		Events.pieceThrown:fire(self:playersIn(room), room.key, state.spot.id, player.UserId, x, y, mode, state.variant)
	end
	function PieceService:toggleTap(room, player, x, y)
		local map = room.board.map
		local _x = x
		local _condition = not (type(_x) == "number")
		if not _condition then
			local _y = y
			_condition = not (type(_y) == "number")
			if not _condition then
				_condition = not map:isTap(x, y)
			end
		end
		if _condition then
			return nil
		end
		local feet = self:feetOf(room, player)
		if not feet then
			return nil
		end
		local dx = math.abs(math.floor(feet.X / 16) - x)
		local dy = math.abs(math.floor(feet.Y / 16) - y)
		if dx > TAP_REACH or dy > TAP_REACH then
			return nil
		end
		local key = map:key(x, y)
		local open = room.closedTaps[key] ~= nil
		if open then
			room.closedTaps[key] = nil
		else
			room.closedTaps[key] = true
		end
		Events.tapChanged:fire(self:playersIn(room), room.key, x, y, open)
	end
	do
		-- (Flamework) PieceService metadata
		Reflect.defineMetadata(PieceService, "identifier", "server/services/PieceService@PieceService")
		Reflect.defineMetadata(PieceService, "flamework:implements", { "$:flamework@OnStart" })
	end
end
-- (Flamework) PieceService decorators
Reflect.decorate(PieceService, "$:flamework@Service", Service, {})
return {
	PieceService = PieceService,
}
