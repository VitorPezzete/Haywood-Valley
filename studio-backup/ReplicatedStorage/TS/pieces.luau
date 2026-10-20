-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
-- Onde está cada peça móvel de um interior durante a sessão, e as regras para ela mudar de lugar. O
-- servidor guarda a verdade (PieceService) e confere cada pedido; cada cliente tem uma cópia igual, que ele
-- usa para desenhar, colidir e saber onde o boneco senta. A posição vale só para a sessão; no Decorar
-- (shared/decor.ts), o dono da casa muda as peças de lugar de vez, e o tabuleiro guarda também as peças que ele
-- pôs (`decor`), que bloqueiam, sentam e deitam como os tiles do mapa.
local _interiorMap = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiorMap")
local seatFacing = _interiorMap.seatFacing
local tileKind = _interiorMap.tileKind
local _decor = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "decor")
local decorKind = _decor.decorKind
local decorTile = _decor.decorTile
local decorVariant = _decor.decorVariant
local familyDefs = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "pieceDefs").familyDefs
local _pieceFloors = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "pieceFloors")
local FLOOR_COL0 = _pieceFloors.FLOOR_COL0
local FLOOR_COLS = _pieceFloors.FLOOR_COLS
local FLOOR_ROW0 = _pieceFloors.FLOOR_ROW0
local FLOOR_ROWS = _pieceFloors.FLOOR_ROWS
local PIECE_FLOORS = _pieceFloors.PIECE_FLOORS
--* Passo do boneco e da peça ao puxar ou empurrar, em células. 
local STEP_CELLS = 1
--* Quanto dura um passo de puxar ou empurrar, em segundos. 
local STEP_SECONDS = 0.3
--* Até quantas células além da frente do boneco voa o objeto jogado. 
local THROW_CELLS = 3
--* Quanto dura o voo do objeto jogado, em segundos. 
local THROW_SECONDS = 0.4
--* Distância máxima, em células, entre o pé do jogador e a peça que ele mexe (o servidor confere). 
local PIECE_REACH = 2
--[[
	*
	 * Distância máxima, em células, entre o pé do jogador e a torneira que ele abre e fecha: a banheira tem 4
	 * fileiras e 5 colunas, e a torneira fica na ponta esquerda da segunda; de baixo da banheira, ela fica a 3.
	 
]]
local TAP_REACH = 4
--[[
	*
	 * O que um jogador consegue fazer com as peças: empurrar andando, puxar (com F), levantar, e até que peso
	 * (`PieceDef.weight`). É o ponto único para uma luva virar item depois (pedido do usuário em 2026-10-17):
	 * hoje todo jogador tem as mãos de começo, que puxam e levantam tudo. O servidor e o cliente perguntam aqui.
	 
]]
--* As mãos de quem começa o jogo: puxam e levantam tudo o que existe hoje. 
local BARE_HANDS = {
	pull = true,
	lift = true,
	strength = 2,
}
--* O que o jogador consegue fazer com as peças (sem luva por enquanto: as mãos de começo). 
local function handlingOf(player)
	local _ = player
	local _1 = nil
	return BARE_HANDS
end
--* Empurrar andando contra a peça: só as que bloqueiam (a cadeira não: o boneco sobe nela). 
local function canPush(handling, def)
	return def.blocks and def.weight <= handling.strength
end
local function canPull(handling, def)
	return handling.pull and def.weight <= handling.strength
end
local function canLift(handling, def)
	return handling.lift and def.lift and def.weight <= handling.strength
end
--* O passo de uma direção do boneco, em células: x para a direita, y para baixo. 
local function dirStep(dir)
	return if dir == 0 then { 0, -1 } elseif dir == 1 then { -1, 0 } elseif dir == 2 then { 0, 1 } else { 1, 0 }
end
--[[
	*
	 * Onde fica uma peça de `w` × `h` células posta logo à frente de quem tem o pé em `feet` (pixels de arte a
	 * partir do canto do bloco) e olha para `dir`: encostada na célula do pé, centrada nele.
	 
]]
local function frontSpot(feet, dir, w, h)
	local cx = math.floor(feet.X / 16)
	local cy = math.floor(feet.Y / 16)
	-- Para cima e para baixo, centrada no pé; para os lados, com a fileira de baixo na do pé.
	local left = math.floor(feet.X / 16 - w / 2 + 0.5)
	if dir == 0 then
		return { left, cy - h }
	end
	if dir == 2 then
		return { left, cy + 1 }
	end
	if dir == 1 then
		return { cx - w, cy - h + 1 }
	end
	return { cx + 1, cy - h + 1 }
end
local PieceBoard
do
	PieceBoard = setmetatable({}, {
		__tostring = function()
			return "PieceBoard"
		end,
	})
	PieceBoard.__index = PieceBoard
	function PieceBoard.new(...)
		local self = setmetatable({}, PieceBoard)
		return self:constructor(...) or self
	end
	function PieceBoard:constructor(map)
		self.map = map
		self.pieces = {}
		self.order = {}
		self.decor = {}
		self.decorCells = {}
		for _, spot in map.spots do
			local _object = {
				spot = spot,
				x = spot.x,
				y = spot.y,
				mode = 0,
				holder = 0,
			}
			local _left = "variant"
			local _condition = spot.def.variant
			if _condition == nil then
				_condition = 0
			end
			_object[_left] = _condition
			local state = _object
			local _pieces = self.pieces
			local _id = spot.id
			_pieces[_id] = state
			local _exp = self.order
			table.insert(_exp, state)
		end
	end
	function PieceBoard:all()
		return self.order
	end
	function PieceBoard:defOf(state)
		local family = state.spot.def.family
		if family == nil then
			return state.spot.def
		end
		return familyDefs(family)[state.variant + 1] or state.spot.def
	end
	function PieceBoard:at(x, y, ignore)
		for _, state in self.order do
			if state == ignore or (state.mode ~= 0 and state.mode ~= 1) then
				continue
			end
			local def = state.spot.def
			if x >= state.x and y >= state.y and x < state.x + def.w and y < state.y + def.h then
				return state
			end
		end
		return nil
	end
	function PieceBoard:setDecor(state)
		self:removeDecor(state.key)
		local _decor_1 = self.decor
		local _key = state.key
		local _state = state
		_decor_1[_key] = _state
		for _, cell in decorVariant(state).cells do
			local _decorCells = self.decorCells
			local _arg0 = self.map:key(state.x + cell[1], state.y + cell[2])
			local _arg1 = { state, cell }
			_decorCells[_arg0] = _arg1
		end
	end
	function PieceBoard:removeDecor(key)
		local _decor_1 = self.decor
		local _key = key
		local state = _decor_1[_key]
		if not state then
			return nil
		end
		local _decor_2 = self.decor
		local _key_1 = key
		_decor_2[_key_1] = nil
		for _, cell in decorVariant(state).cells do
			local cellKey = self.map:key(state.x + cell[1], state.y + cell[2])
			local _result = self.decorCells[cellKey]
			if _result ~= nil then
				_result = _result[1]
			end
			if _result == state then
				self.decorCells[cellKey] = nil
			end
		end
		return state
	end
	function PieceBoard:decorAt(x, y)
		local _decorCells = self.decorCells
		local _arg0 = self.map:key(x, y)
		return _decorCells[_arg0]
	end
	function PieceBoard:occupiedByPiece(x, y, ignore)
		if self:at(x, y) or self.map:residentAt(x, y) then
			return true
		end
		local decor = self:decorAt(x, y)
		return decor ~= nil and decor[1].key ~= ignore
	end
	function PieceBoard:isExit(x, y)
		local _exp = (self.map.data.exits or {})
		-- ▼ ReadonlyArray.some ▼
		local _result = false
		local _callback = function(exit)
			return x >= exit.x and y >= exit.y and x < exit.x + exit.width and y < exit.y + exit.height
		end
		for _k, _v in _exp do
			if _callback(_v, _k - 1, _exp) then
				_result = true
				break
			end
		end
		-- ▲ ReadonlyArray.some ▲
		return _result
	end
	function PieceBoard:top(x, y)
		local decor = self:decorAt(x, y)
		if decor then
			return decorTile(decor[1].item, decor[2])
		end
		local piece = self:at(x, y)
		if piece then
			return self:tileOf(piece, x, y)
		end
		return self.map:ground(x, y)
	end
	function PieceBoard:tileOf(state, x, y)
		local def = self:defOf(state)
		return { def.sheet, def.col + (x - state.x), def.row + (y - state.y) }
	end
	function PieceBoard:blocked(x, y)
		if self.map:blocked(x, y) or self.map:residentAt(x, y) then
			return true
		end
		local decor = self:decorAt(x, y)
		if decor and decor[2][9] == 1 then
			return true
		end
		local piece = self:at(x, y)
		return piece ~= nil and piece.spot.def.blocks
	end
	function PieceBoard:kind(x, y)
		local decor = self:decorAt(x, y)
		if decor then
			return decorKind(decor[2])
		end
		local piece = self:at(x, y)
		if piece then
			return if piece.spot.def.kind == "chair" then tileKind(self:tileOf(piece, x, y)) else 0
		end
		return self.map:kind(x, y)
	end
	function PieceBoard:seatFacing(x, y)
		local decor = self:decorAt(x, y)
		if decor then
			-- A cadeira posta olha para onde a forma dela diz (de frente, de lado).
			local _facing = decor[1].item.forms[decor[1].form + 1]
			if _facing ~= nil then
				_facing = _facing.facing
			end
			local facing = _facing
			return if facing ~= nil then facing else seatFacing(decorTile(decor[1].item, decor[2]))
		end
		local piece = self:at(x, y)
		if piece then
			return seatFacing(self:tileOf(piece, x, y))
		end
		local tile = self.map:ground(x, y)
		return if tile then seatFacing(tile) else nil
	end
	function PieceBoard:fits(state, x, y, occupied)
		local def = state.spot.def
		do
			local j = 0
			local _shouldIncrement = false
			while true do
				if _shouldIncrement then
					j += 1
				else
					_shouldIncrement = true
				end
				if not (j < def.h) then
					break
				end
				do
					local i = 0
					local _shouldIncrement_1 = false
					while true do
						if _shouldIncrement_1 then
							i += 1
						else
							_shouldIncrement_1 = true
						end
						if not (i < def.w) then
							break
						end
						local cx = x + i
						local cy = y + j
						local _condition = not self.map:freeFloor(cx, cy)
						if _condition then
							local _origin = self.map.origin
							local _arg0 = self.map:key(cx, cy)
							_condition = not (_origin[_arg0] ~= nil)
						end
						if _condition then
							return false
						end
						if self:at(cx, cy, state) or self:decorAt(cx, cy) then
							return false
						end
						local _result = occupied
						if _result ~= nil then
							_result = _result(cx, cy)
						end
						if _result then
							return false
						end
					end
				end
			end
		end
		return true
	end
	function PieceBoard:variantFor(state, x, y)
		local family = state.spot.def.family
		local floors = if family ~= nil then PIECE_FLOORS[family] else nil
		if not floors then
			return state.variant
		end
		local votes = {}
		local def = state.spot.def
		do
			local j = 0
			local _shouldIncrement = false
			while true do
				if _shouldIncrement then
					j += 1
				else
					_shouldIncrement = true
				end
				if not (j < def.h) then
					break
				end
				do
					local i = 0
					local _shouldIncrement_1 = false
					while true do
						if _shouldIncrement_1 then
							i += 1
						else
							_shouldIncrement_1 = true
						end
						if not (i < def.w) then
							break
						end
						local floor = self.map:tile(0, x + i, y + j)
						local text = if floor then floors[floor[1]] else nil
						if not floor or text == nil then
							continue
						end
						local col = floor[2] - FLOOR_COL0
						local row = floor[3] - FLOOR_ROW0
						if col < 0 or row < 0 or col >= FLOOR_COLS or row >= FLOOR_ROWS then
							continue
						end
						local index = row * FLOOR_COLS + col + 1
						local variant = tonumber(string.sub(text, index, index))
						if variant ~= nil then
							local _condition = votes[variant]
							if _condition == nil then
								_condition = 0
							end
							votes[variant] = _condition + 1
						end
					end
				end
			end
		end
		local best = state.variant
		local most = 0
		for variant, count in votes do
			if count > most or (count == most and variant == state.variant) then
				best = variant
				most = count
			end
		end
		return best
	end
	function PieceBoard:set(id, x, y, mode, holder, variant)
		local _pieces = self.pieces
		local _id = id
		local state = _pieces[_id]
		if not state then
			return nil
		end
		state.x = x
		state.y = y
		state.mode = mode
		state.holder = holder
		state.variant = variant
		return state
	end
	function PieceBoard:heldBy(userId)
		for _, state in self.order do
			if state.holder == userId and (state.mode == 1 or state.mode == 2) then
				return state
			end
		end
		return nil
	end
	function PieceBoard:untouched(state)
		local _condition = state.x == state.spot.x and state.y == state.spot.y and state.mode == 0
		if _condition then
			local _exp = state.variant
			local _condition_1 = state.spot.def.variant
			if _condition_1 == nil then
				_condition_1 = 0
			end
			_condition = _exp == _condition_1
		end
		return _condition
	end
end
return {
	handlingOf = handlingOf,
	canPush = canPush,
	canPull = canPull,
	canLift = canLift,
	dirStep = dirStep,
	frontSpot = frontSpot,
	STEP_CELLS = STEP_CELLS,
	STEP_SECONDS = STEP_SECONDS,
	THROW_CELLS = THROW_CELLS,
	THROW_SECONDS = THROW_SECONDS,
	PIECE_REACH = PIECE_REACH,
	TAP_REACH = TAP_REACH,
	BARE_HANDS = BARE_HANDS,
	PieceBoard = PieceBoard,
}
