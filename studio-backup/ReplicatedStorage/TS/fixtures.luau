-- Compiled with roblox-ts v3.0.0
-- O que se usa com a tecla de ação sem sair do lugar (etapa E do roteiro do Diorama, item 17): o baú, que abre e
-- fecha, e o fogão, que acende para cozinhar. Só tiles das folhas do Aeko, trocados célula a célula pela versão
-- da mesma folha (o baú aberto, a boca e o forno acesos), sem mudar pixel. O estado vale só para a sessão, como a
-- torneira. Vale no cliente (desenho, dica) e no servidor (que confere e manda a todos).
--* Uma célula do que se usa: o tile desligado (baú fechado, fogão apagado) e o ligado. 
--* Um baú ou um fogão do mapa: fica onde o mapa o pôs. 
--[[
	*
	 * Os baús pequenos das folhas, 2 × 2, fechado e aberto célula a célula, do `mapa_folhas.json` do guia: o
	 * vermelho aberto é a tampa aberta [47-48,22] (a mesma do azul) sobre a frente [45-46,24]. Os baús grandes do
	 * castelo (4 × 4 fechados, 4 × 6 abertos) não trocam no lugar e ficam de fora (a confirmar).
	 
]]
local CHESTS = { {
	sheet = "casa",
	closed = { { 45, 20 }, { 46, 20 }, { 45, 21 }, { 46, 21 } },
	open = { { 47, 22 }, { 48, 22 }, { 45, 24 }, { 46, 24 } },
}, {
	sheet = "casa",
	closed = { { 45, 22 }, { 46, 22 }, { 45, 23 }, { 46, 23 } },
	open = { { 47, 22 }, { 48, 22 }, { 47, 23 }, { 48, 23 } },
}, {
	sheet = "castelo",
	closed = { { 64, 16 }, { 65, 16 }, { 64, 17 }, { 65, 17 } },
	open = { { 66, 18 }, { 67, 18 }, { 64, 20 }, { 65, 20 } },
}, {
	sheet = "castelo",
	closed = { { 64, 18 }, { 65, 18 }, { 64, 19 }, { 65, 19 } },
	open = { { 66, 18 }, { 67, 18 }, { 66, 19 }, { 67, 19 } },
} }
local CHEST_CELLS = { { 0, 0 }, { 1, 0 }, { 0, 1 }, { 1, 1 } }
--[[
	*
	 * O fogão da casa (`casa79`, [61-63,27-31]): a coluna da direita apagada [63,27-30] troca pela acesa [64,27-30]
	 * (`casa80`, a boca acesa, e `casa183`, o forno aceso). A folha não tem fumaça nem panela.
	 
]]
local STOVE_SHEET = "casa"
local STOVE_OFF_COL = 63
local STOVE_ON_COL = 64
local STOVE_ROWS = { 27, 28, 29, 30 }
local STOVE_WIDTH = 3
local function same(tile, sheet, col, row)
	return tile ~= nil and tile[1] == sheet and tile[2] == col and tile[3] == row
end
--* O baú 2 × 2 cujas células (pelo `tileAt` de cada uma) batem com um da lista, fechado ou aberto. 
local function matchChest(tileAt)
	for _, chest in CHESTS do
		for _1, open in { false, true } do
			local cells = if open then chest.open else chest.closed
			-- ▼ ReadonlyArray.every ▼
			local _result = true
			local _callback = function(_param, i)
				local dx = _param[1]
				local dy = _param[2]
				return same(tileAt(dx, dy), chest.sheet, cells[i + 1][1], cells[i + 1][2])
			end
			for _k, _v in CHEST_CELLS do
				if not _callback(_v, _k - 1, CHEST_CELLS) then
					_result = false
					break
				end
			end
			-- ▲ ReadonlyArray.every ▲
			local fits = _result
			if not fits then
				continue
			end
			-- ▼ ReadonlyArray.map ▼
			local _newValue = table.create(#CHEST_CELLS)
			local _callback_1 = function(_param, i)
				local dx = _param[1]
				local dy = _param[2]
				return {
					dx = dx,
					dy = dy,
					off = { chest.sheet, chest.closed[i + 1][1], chest.closed[i + 1][2] },
					on = { chest.sheet, chest.open[i + 1][1], chest.open[i + 1][2] },
				}
			end
			for _k, _v in CHEST_CELLS do
				_newValue[_k] = _callback_1(_v, _k - 1, CHEST_CELLS)
			end
			-- ▲ ReadonlyArray.map ▲
			local list = _newValue
			return {
				cells = list,
				open = open,
			}
		end
	end
	return nil
end
--* O baú de uma peça móvel (`casa46`, `casa47`, `casa64`): as células fechado e aberto e se ela é a aberta. 
local function chestOfPiece(def)
	if def.kind ~= "chest" then
		return nil
	end
	return matchChest(function(dx, dy)
		return if dx < def.w and dy < def.h then { def.sheet, def.col + dx, def.row + dy } else nil
	end)
end
--[[
	*
	 * Os baús e fogões fixos do mapa, pelo tile que aparece em cada célula (`InteriorMap.ground`). As peças móveis
	 * (o baú que se puxa) ficam de fora: o mapa mostra o piso onde elas estavam, e elas abrem pelo id da peça.
	 
]]
local function findFixtures(map)
	local fixtures = {}
	local claimed = {}
	do
		local _y = map.y
		local _shouldIncrement = false
		while true do
			local y = _y
			if _shouldIncrement then
				y += 1
			else
				_shouldIncrement = true
			end
			if not (y < map.y + map.height) then
				break
			end
			do
				local _x = map.x
				local _shouldIncrement_1 = false
				while true do
					local x = _x
					if _shouldIncrement_1 then
						x += 1
					else
						_shouldIncrement_1 = true
					end
					if not (x < map.x + map.width) then
						break
					end
					local _arg0 = map:key(x, y)
					if claimed[_arg0] ~= nil then
						_x = x
						continue
					end
					local chest = matchChest(function(dx, dy)
						local _arg0_1 = map:key(x + dx, y + dy)
						return if claimed[_arg0_1] ~= nil then nil else map:ground(x + dx, y + dy)
					end)
					if chest then
						for _, cell in chest.cells do
							local _arg0_1 = map:key(x + cell.dx, y + cell.dy)
							claimed[_arg0_1] = true
						end
						local _arg0_1 = {
							id = `chest@{x},{y}`,
							kind = "chest",
							x = x,
							y = y,
							w = 2,
							h = 2,
							cells = chest.cells,
							startsOn = chest.open,
						}
						table.insert(fixtures, _arg0_1)
						_x = x
						continue
					end
					-- O fogão: a coluna da direita (apagada ou acesa), com a chapa ou o forno [62, linha] à esquerda.
					local tile = map:ground(x, y)
					local _condition = not tile or tile[1] ~= STOVE_SHEET or (tile[2] ~= STOVE_OFF_COL and tile[2] ~= STOVE_ON_COL)
					if not _condition then
						local _arg0_1 = tile[3]
						_condition = not (table.find(STOVE_ROWS, _arg0_1) ~= nil)
					end
					if _condition then
						_x = x
						continue
					end
					if not same(map:ground(x - 1, y), STOVE_SHEET, STOVE_OFF_COL - 1, tile[3]) then
						_x = x
						continue
					end
					-- Desce pela coluna enquanto for fogão; o de cima é o canto.
					local cells = {}
					-- Aceso só com a coluna toda acesa: a boca acesa e o forno apagado do mapa contam como apagado (o primeiro F
					-- acende tudo).
					local startsOn = true
					do
						local dy = 0
						local _shouldIncrement_2 = false
						while true do
							if _shouldIncrement_2 then
								dy += 1
							else
								_shouldIncrement_2 = true
							end
							local below = map:ground(x, y + dy)
							local _condition_1 = not below or below[1] ~= STOVE_SHEET
							if not _condition_1 then
								local _arg0_1 = below[3]
								_condition_1 = not (table.find(STOVE_ROWS, _arg0_1) ~= nil)
							end
							if _condition_1 then
								break
							end
							if below[2] ~= STOVE_OFF_COL and below[2] ~= STOVE_ON_COL then
								break
							end
							if not same(map:ground(x - 1, y + dy), STOVE_SHEET, STOVE_OFF_COL - 1, below[3]) then
								break
							end
							if below[2] ~= STOVE_ON_COL then
								startsOn = false
							end
							local _arg0_1 = map:key(x, y + dy)
							claimed[_arg0_1] = true
							local _arg0_2 = {
								dx = STOVE_WIDTH - 1,
								dy = dy,
								off = { STOVE_SHEET, STOVE_OFF_COL, below[3] },
								on = { STOVE_SHEET, STOVE_ON_COL, below[3] },
							}
							table.insert(cells, _arg0_2)
						end
					end
					-- O retângulo é o fogão inteiro (três colunas), para usar de frente para qualquer parte dele.
					local left = x - (STOVE_WIDTH - 1)
					local _arg0_1 = {
						id = `stove@{left},{y}`,
						kind = "stove",
						x = left,
						y = y,
						w = STOVE_WIDTH,
						h = #cells,
						cells = cells,
						startsOn = startsOn,
					}
					table.insert(fixtures, _arg0_1)
					_x = x
				end
			end
			_y = y
		end
	end
	return fixtures
end
--* Distância máxima, em células, entre o pé do jogador e o baú ou o fogão que ele usa (o servidor confere). 
local FIXTURE_REACH = 2
--[[
	*
	 * O baú que é peça móvel se abre com um toque em F; segurar F mais que isto segura a peça para puxar (como antes).
	 * Em segundos.
	 
]]
local CHEST_TAP_SECONDS = 0.3
--[[
	*
	 * Cozinhar (a confirmar com o inventário): o fogão aceso por este tempo, em segundos, chama o gancho de cozinhar do
	 * servidor (`FixtureService.cook`), que hoje só avisa no Output: ainda não há receitas, ingredientes nem itens.
	 
]]
local COOK_SECONDS = 6
--* Se o retângulo (x, y, w, h) está a até `reach` células da célula (cx, cy). 
local function nearCells(cx, cy, x, y, w, h, reach)
	local dx = math.max(x - cx, 0, cx - (x + w - 1))
	local dy = math.max(y - cy, 0, cy - (y + h - 1))
	return dx <= reach and dy <= reach
end
return {
	chestOfPiece = chestOfPiece,
	findFixtures = findFixtures,
	nearCells = nearCells,
	FIXTURE_REACH = FIXTURE_REACH,
	CHEST_TAP_SECONDS = CHEST_TAP_SECONDS,
	COOK_SECONDS = COOK_SECONDS,
}
