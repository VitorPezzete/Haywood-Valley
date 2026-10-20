-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
-- O que cada célula de um interior faz, para as ações do boneco: assento, cama, água funda, bloqueio, e
-- onde estão as peças que se seguram e carregam. Vale para o cliente (pose e desenho) e para o servidor
-- (que confere os movimentos das peças).
local Workspace = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services").Workspace
local PIECE_DEFS = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "pieceDefs").PIECE_DEFS
--[[
	*
	 * Os tipos de tile do Graal que as ações usam (lista da Graal Bible): 3 cadeira (sofá, cadeira, vaso),
	 * 4 cama em cima (cabeceira e travesseiro), 5 cama embaixo (coberta), 6 água rasa ("swamp": os pés na água),
	 * 11 água funda (nada).
	 
]]
--* Comportamento de um tile pela zona da folha (formato pics1 do Graal), como no catálogo do Diorama. 
--[[
	*
	 * As zonas das folhas do Aeko, [c0, l0, c1, l1, zona]; vale a primeira. Cópia de `AEKO_ZONES` do catálogo
	 * do Diorama (plugin/src/generated/catalogoAeko.ts), que o jogo não importa; as duas folhas são iguais,
	 * menos a linha 0 das colunas 32 a 63 (frente na casa, chão no castelo).
	 
]]
local ZONES = { { 0, 0, 15, 3, "animado" }, { 0, 4, 15, 9, "agua" }, { 0, 10, 15, 11, "agua_rasa" }, { 0, 12, 15, 17, "lava" }, { 0, 18, 15, 19, "fere" }, { 0, 20, 15, 23, "senta" }, { 0, 24, 15, 25, "deita" }, { 0, 26, 15, 31, "normal" }, { 16, 0, 31, 31, "sem_pecas" }, { 32, 0, 63, 0, "frente" }, { 32, 1, 63, 19, "chao" }, { 32, 20, 63, 31, "bloqueia" }, { 64, 16, 127, 31, "bloqueia" }, { 64, 0, 127, 15, "sem_pecas" } }
local function tileZone(tile)
	local _binding = tile
	local sheet = _binding[1]
	local col = _binding[2]
	local row = _binding[3]
	if col == 0 and row == 2 then
		return "vazio"
	end
	for _, _binding_1 in ZONES do
		local c0 = _binding_1[1]
		local l0 = _binding_1[2]
		local c1 = _binding_1[3]
		local l1 = _binding_1[4]
		local zone = _binding_1[5]
		if col >= c0 and col <= c1 and row >= l0 and row <= l1 then
			return if zone == "frente" and sheet == "castelo" then "chao" else zone
		end
	end
	return "chao"
end
--[[
	*
	 * Tile animado: a zona [1-15, 0-3] das folhas (a coluna 0 é o vazio e o claro da prancha). Cada coluna tem
	 * 4 quadros, um por linha da folha: o quadro n é a linha n da mesma coluna. São as chamas, o fogo da lareira,
	 * os patinhos e a torneira da banheira, a água do fosso do castelo.
	 
]]
local ANIMATION_FRAMES = 4
local function isAnimated(tile)
	return tile[2] >= 1 and tile[2] <= 15 and tile[3] >= 0 and tile[3] < ANIMATION_FRAMES
end
--[[
	*
	 * A torneira da banheira: aberta, a água corre (os 4 quadros de [5, 0-3]); fechada, o tile da banheira com a
	 * torneira sem água correndo ([68, 19], a ponta esquerda da borda com água, que é o mesmo desenho sem o jato).
	 
]]
local TAP_SHEET = "casa"
local TAP_COL = 5
local TAP_CLOSED = { "casa", 68, 19 }
local function isTap(tile)
	return tile[1] == TAP_SHEET and tile[2] == TAP_COL and tile[3] < ANIMATION_FRAMES
end
--* Piso em que se pisa e onde uma peça pode pousar. 
local function isFloorZone(zone)
	return zone == "chao" or zone == "normal"
end
--[[
	*
	 * Para que lado olha quem senta em cada assento, pelo desenho das folhas (conferido nas folhas em
	 * 2026-10-17): a cadeira "de frente" mostra o encosto atrás do assento e quem senta olha para baixo; a "de
	 * costas" mostra as costas do encosto e quem senta olha para cima; a "de lado" de [2, 20-21] tem o encosto
	 * à esquerda (olha para a direita) e a de [2, 22-23] à direita (olha para a esquerda); o vaso de [3-5] olha
	 * para a esquerda e o de [6-8] para a direita (nota do catálogo); o sofá e a cadeira de pedra do castelo,
	 * para baixo. Assento fora da lista (as almofadas do castelo) senta virado para onde o boneco chegou.
	 
]]
local SEAT_FACING = { { "casa", 0, 20, 1, 21, 2 }, { "casa", 2, 20, 2, 21, 3 }, { "casa", 0, 22, 1, 23, 0 }, { "casa", 2, 22, 2, 23, 1 }, { "casa", 3, 20, 5, 23, 1 }, { "casa", 6, 20, 8, 23, 3 }, { "casa", 10, 20, 15, 21, 2 }, { "castelo", 0, 20, 1, 22, 2 } }
--* Para que lado olha quem senta no tile, ou nada quando o desenho não diz. 
local function seatFacing(tile)
	local _binding = tile
	local sheet = _binding[1]
	local col = _binding[2]
	local row = _binding[3]
	for _, _binding_1 in SEAT_FACING do
		local s = _binding_1[1]
		local c0 = _binding_1[2]
		local l0 = _binding_1[3]
		local c1 = _binding_1[4]
		local l1 = _binding_1[5]
		local dir = _binding_1[6]
		if s == sheet and col >= c0 and col <= c1 and row >= l0 and row <= l1 then
			return dir
		end
	end
	return nil
end
--* O tipo de tile do Graal de um tile das folhas, pela zona dele. 
local function tileKind(tile)
	local zone = tileZone(tile)
	if zone == "agua_rasa" then
		return 6
	end
	return if zone == "senta" then 3 elseif zone == "deita" then 4 elseif zone == "agua" then 11 else 0
end
--[[
	*
	 * Atributo do Workspace que liga as peças de teste das ações: um pote, um caixote, um baú e uma piscina de
	 * água funda (a água da banheira, que é a única água funda da folha da casa), postos no piso livre mais perto
	 * do começo. A posição muda quando o mapa muda; serve para testar, não é parte do mapa.
	 
]]
local ACTIONS_TEST_ATTRIBUTE = "AcoesTeste"
--* A água funda da piscina de teste: a água da banheira, "sem borda", três tiles que se repetem. 
local TEST_WATER = { { "casa", 0, 9 }, { "casa", 1, 9 }, { "casa", 2, 9 } }
local TEST_POOL = Vector2.new(5, 4)
local TEST_PIECES = { "casa42", "casa67", "casa46" }
--* Uma peça móvel do interior: qual, onde ela estava no mapa e o id que a rede usa. 
--[[
	*
	 * Um interior lido para as ações. As células são do bloco (as do Diorama, 0 a 63). As peças móveis são
	 * achadas no próprio mapa: cada lugar da camada de objeto em que aparece, inteira e na ordem da folha,
	 * uma peça de `PIECE_DEFS`, em cima de piso de verdade (a peça desenhada na parede ou no balcão, como o
	 * baú e o caixote da casa de teste, fica onde está). Onde a peça estava, o jogo desenha o piso da camada de
	 * baixo quando ela sai.
	 
]]
local InteriorMap
do
	InteriorMap = setmetatable({}, {
		__tostring = function()
			return "InteriorMap"
		end,
	})
	InteriorMap.__index = InteriorMap
	function InteriorMap.new(...)
		local self = setmetatable({}, InteriorMap)
		return self:constructor(...) or self
	end
	function InteriorMap:constructor(data, start, test)
		if test == nil then
			test = Workspace:GetAttribute(ACTIONS_TEST_ATTRIBUTE) == true
		end
		self.data = data
		self.spots = {}
		self.origin = {}
		self.extra = {}
		self.taps = {}
		self.residentCells = {}
		self.x = data.x
		self.y = data.y
		self.width = data.width
		self.height = data.height
		local _exp = data.layers
		-- ▼ ReadonlyArray.map ▼
		local _newValue = table.create(#_exp)
		local _callback = function(rows)
			local cells = {}
			for _, row in rows do
				for _1, part in string.split(row, " ") do
					local _condition = tonumber(part)
					if _condition == nil then
						_condition = 0
					end
					table.insert(cells, _condition)
				end
			end
			return cells
		end
		for _k, _v in _exp do
			_newValue[_k] = _callback(_v, _k - 1, _exp)
		end
		-- ▲ ReadonlyArray.map ▲
		self.cells = _newValue
		self:findPieces()
		self:findResidents()
		if test then
			self:addTest(start)
		end
		do
			local y = self.y
			local _shouldIncrement = false
			while true do
				if _shouldIncrement then
					y += 1
				else
					_shouldIncrement = true
				end
				if not (y < self.y + self.height) then
					break
				end
				do
					local x = self.x
					local _shouldIncrement_1 = false
					while true do
						if _shouldIncrement_1 then
							x += 1
						else
							_shouldIncrement_1 = true
						end
						if not (x < self.x + self.width) then
							break
						end
						local tile = self:ground(x, y)
						if tile and isTap(tile) then
							local _taps = self.taps
							local _arg0 = { x, y }
							table.insert(_taps, _arg0)
						end
					end
				end
			end
		end
	end
	function InteriorMap:isTap(x, y)
		local _exp = self.taps
		-- ▼ ReadonlyArray.some ▼
		local _result = false
		local _callback = function(_param)
			local tx = _param[1]
			local ty = _param[2]
			return tx == x and ty == y
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
	function InteriorMap:residentAt(x, y)
		local _residentCells = self.residentCells
		local _arg0 = self:key(x, y)
		return _residentCells[_arg0] ~= nil
	end
	function InteriorMap:key(x, y)
		return y * 1024 + x
	end
	function InteriorMap:inside(x, y)
		return x >= self.x and y >= self.y and x < self.x + self.width and y < self.y + self.height
	end
	function InteriorMap:tile(layer, x, y)
		if not self:inside(x, y) then
			return nil
		end
		local n = self.cells[layer + 1][(y - self.y) * self.width + (x - self.x) + 1]
		return if n == 0 then nil else self.data.tiles[n]
	end
	function InteriorMap:ground(x, y)
		local key = self:key(x, y)
		local extra = self.extra[key]
		if extra then
			return extra
		end
		if self.origin[key] ~= nil then
			return self:tile(0, x, y)
		end
		return self:tile(2, x, y) or self:tile(1, x, y) or self:tile(0, x, y)
	end
	function InteriorMap:blocked(x, y)
		if not self:inside(x, y) then
			return true
		end
		local key = self:key(x, y)
		if self.origin[key] ~= nil or self.extra[key] ~= nil then
			return false
		end
		local _exp = self.data.blocks[y - self.y + 1]
		local _arg0 = x - self.x + 1
		local _arg1 = x - self.x + 1
		return string.sub(_exp, _arg0, _arg1) == "#"
	end
	function InteriorMap:kind(x, y)
		if not self:inside(x, y) then
			return 0
		end
		local key = self:key(x, y)
		local extra = self.extra[key]
		if extra then
			return tileKind(extra)
		end
		if self.origin[key] ~= nil then
			return 0
		end
		local _exp = self.data.actions[y - self.y + 1]
		local _arg0 = x - self.x + 1
		local _arg1 = x - self.x + 1
		local code = string.sub(_exp, _arg0, _arg1)
		if code == "3" then
			return 3
		end
		if code == "4" then
			return 4
		end
		if code == "5" then
			return 5
		end
		-- O mar fundo do exterior: o gerador marca a célula (não há tile de chão).
		if code == "~" then
			return 11
		end
		-- A água rasa do exterior: o boneco anda com os pés na água.
		if code == "6" then
			return 6
		end
		-- A água das folhas não está em `actions`: vem da zona do tile de chão (a camada de baixo; a água não bloqueia).
		local floor = self:tile(0, x, y)
		local top = self:ground(x, y)
		if top and floor and top == floor then
			local zone = tileZone(floor)
			if zone == "agua" then
				return 11
			end
			if zone == "agua_rasa" then
				return 6
			end
		end
		return 0
	end
	function InteriorMap:freeFloor(x, y)
		if self:blocked(x, y) or self:residentAt(x, y) or self:kind(x, y) ~= 0 then
			return false
		end
		local top = self:ground(x, y)
		return top ~= nil and isFloorZone(tileZone(top))
	end
	function InteriorMap:findResidents()
		for _, resident in self.data.residents or {} do
			local _binding = resident
			local x = _binding.x
			local y = _binding.y
			local _residentCells = self.residentCells
			local _arg0 = self:key(x, y)
			_residentCells[_arg0] = true
			if resident.pose ~= "lie" then
				continue
			end
			local bed = function(cy)
				local kind = self:kind(x, cy)
				return kind == 4 or kind == 5
			end
			do
				local cy = y - 1
				local _shouldIncrement = false
				while true do
					if _shouldIncrement then
						cy -= 1
					else
						_shouldIncrement = true
					end
					if not bed(cy) then
						break
					end
					local _residentCells_1 = self.residentCells
					local _arg0_1 = self:key(x, cy)
					_residentCells_1[_arg0_1] = true
				end
			end
			do
				local cy = y + 1
				local _shouldIncrement = false
				while true do
					if _shouldIncrement then
						cy += 1
					else
						_shouldIncrement = true
					end
					if not bed(cy) then
						break
					end
					local _residentCells_1 = self.residentCells
					local _arg0_1 = self:key(x, cy)
					_residentCells_1[_arg0_1] = true
				end
			end
		end
	end
	function InteriorMap:findPieces()
		local claimed = {}
		do
			local y = self.y
			local _shouldIncrement = false
			while true do
				if _shouldIncrement then
					y += 1
				else
					_shouldIncrement = true
				end
				if not (y < self.y + self.height) then
					break
				end
				do
					local x = self.x
					local _shouldIncrement_1 = false
					while true do
						if _shouldIncrement_1 then
							x += 1
						else
							_shouldIncrement_1 = true
						end
						if not (x < self.x + self.width) then
							break
						end
						local tile = self:tile(1, x, y)
						if not tile then
							continue
						end
						for _, def in PIECE_DEFS do
							if def.sheet ~= tile[1] or def.col ~= tile[2] or def.row ~= tile[3] then
								continue
							end
							if not self:wholeAt(def, x, y, claimed) then
								continue
							end
							do
								local j = 0
								local _shouldIncrement_2 = false
								while true do
									if _shouldIncrement_2 then
										j += 1
									else
										_shouldIncrement_2 = true
									end
									if not (j < def.h) then
										break
									end
									do
										local i = 0
										local _shouldIncrement_3 = false
										while true do
											if _shouldIncrement_3 then
												i += 1
											else
												_shouldIncrement_3 = true
											end
											if not (i < def.w) then
												break
											end
											local _arg0 = self:key(x + i, y + j)
											claimed[_arg0] = true
											local _origin = self.origin
											local _arg0_1 = self:key(x + i, y + j)
											_origin[_arg0_1] = true
										end
									end
								end
							end
							local _spots = self.spots
							local _arg0 = {
								id = `{def.id}@{x},{y}`,
								def = def,
								x = x,
								y = y,
								test = false,
							}
							table.insert(_spots, _arg0)
							break
						end
					end
				end
			end
		end
	end
	function InteriorMap:wholeAt(def, x, y, claimed)
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
						local _claimed = claimed
						local _arg0 = self:key(cx, cy)
						if _claimed[_arg0] ~= nil then
							return false
						end
						local tile = self:tile(1, cx, cy)
						if not tile or tile[1] ~= def.sheet or tile[2] ~= def.col + i or tile[3] ~= def.row + j then
							return false
						end
						if self:tile(2, cx, cy) then
							return false
						end
						local floor = self:tile(0, cx, cy)
						if not floor or not isFloorZone(tileZone(floor)) then
							return false
						end
					end
				end
			end
		end
		return true
	end
	function InteriorMap:addTest(start)
		local reserved = {}
		for j = -1, 1 do
			for i = -1, 1 do
				local _arg0 = self:key(start[1] + i, start[2] + j)
				reserved[_arg0] = true
			end
		end
		local spotFor = function(w, h)
			local best
			local bestDistance = math.huge
			do
				local y = self.y + 1
				local _shouldIncrement = false
				while true do
					if _shouldIncrement then
						y += 1
					else
						_shouldIncrement = true
					end
					if not (y + h < self.y + self.height) then
						break
					end
					do
						local x = self.x + 1
						local _shouldIncrement_1 = false
						while true do
							if _shouldIncrement_1 then
								x += 1
							else
								_shouldIncrement_1 = true
							end
							if not (x + w < self.x + self.width) then
								break
							end
							local distance = math.abs(x + w / 2 - start[1]) + math.abs(y + h / 2 - start[2])
							if distance >= bestDistance then
								continue
							end
							local free = true
							do
								local j = -1
								local _shouldIncrement_2 = false
								while true do
									if _shouldIncrement_2 then
										j += 1
									else
										_shouldIncrement_2 = true
									end
									if not (j <= h and free) then
										break
									end
									do
										local i = -1
										local _shouldIncrement_3 = false
										while true do
											if _shouldIncrement_3 then
												i += 1
											else
												_shouldIncrement_3 = true
											end
											if not (i <= w and free) then
												break
											end
											local _condition = self:freeFloor(x + i, y + j)
											if _condition then
												local _arg0 = self:key(x + i, y + j)
												_condition = not (reserved[_arg0] ~= nil)
											end
											free = _condition
										end
									end
								end
							end
							if free then
								best = { x, y }
								bestDistance = distance
							end
						end
					end
				end
			end
			if best then
				do
					local j = -1
					local _shouldIncrement = false
					while true do
						if _shouldIncrement then
							j += 1
						else
							_shouldIncrement = true
						end
						if not (j <= h) then
							break
						end
						do
							local i = -1
							local _shouldIncrement_1 = false
							while true do
								if _shouldIncrement_1 then
									i += 1
								else
									_shouldIncrement_1 = true
								end
								if not (i <= w) then
									break
								end
								local _arg0 = self:key(best[1] + i, best[2] + j)
								reserved[_arg0] = true
							end
						end
					end
				end
			end
			return best
		end
		local pool = spotFor(TEST_POOL.X, TEST_POOL.Y)
		if pool then
			do
				local j = 0
				local _shouldIncrement = false
				while true do
					if _shouldIncrement then
						j += 1
					else
						_shouldIncrement = true
					end
					if not (j < TEST_POOL.Y) then
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
							if not (i < TEST_POOL.X) then
								break
							end
							local _extra = self.extra
							local _arg0 = self:key(pool[1] + i, pool[2] + j)
							local _arg1 = TEST_WATER[i % #TEST_WATER + 1]
							_extra[_arg0] = _arg1
						end
					end
				end
			end
		end
		for _, id in TEST_PIECES do
			-- ▼ ReadonlyArray.find ▼
			local _callback = function(candidate)
				return candidate.id == id
			end
			local _result
			for _i, _v in PIECE_DEFS do
				if _callback(_v, _i - 1, PIECE_DEFS) == true then
					_result = _v
					break
				end
			end
			-- ▲ ReadonlyArray.find ▲
			local def = _result
			if not def then
				continue
			end
			local at = spotFor(def.w, def.h)
			if at then
				local _spots = self.spots
				local _arg0 = {
					id = `{def.id}@{at[1]},{at[2]}`,
					def = def,
					x = at[1],
					y = at[2],
					test = true,
				}
				table.insert(_spots, _arg0)
			end
		end
	end
end
return {
	tileZone = tileZone,
	isAnimated = isAnimated,
	isTap = isTap,
	seatFacing = seatFacing,
	tileKind = tileKind,
	ANIMATION_FRAMES = ANIMATION_FRAMES,
	TAP_SHEET = TAP_SHEET,
	TAP_COL = TAP_COL,
	TAP_CLOSED = TAP_CLOSED,
	ACTIONS_TEST_ATTRIBUTE = ACTIONS_TEST_ATTRIBUTE,
	InteriorMap = InteriorMap,
}
