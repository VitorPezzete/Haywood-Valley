-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
-- Decorar a casa (etapa E2 do roteiro do Diorama, aprovada pelo usuário: "decorar no jogo com as mesmas regras
-- de encaixe e de fundo do Diorama"). As peças do inventário de teste (`decorCatalog.ts`, gerado) são postas
-- sobre o mapa com a regra do carimbo do plugin (seção 12.14 da especificação): cada variante é conferida
-- contra o tile que está embaixo de cada célula (exata, costura ou conflito) e fica a de menos conflitos; sem
-- variante sem conflito, a peça é recusada com o motivo. Janela e quadro encaixam na parede como no plugin
-- (seção 12.12, `encaixe.ts`): a coluna onde o jogador aponta e a altura tirada da parede do cômodo. O mesmo
-- código vale no cliente (a peça meio transparente e o aviso) e no servidor (que confere cada pedido).
-- Este módulo não importa o plugin: as regras foram copiadas de plugin/src/fundos.ts, encaixe.ts, detectar.ts e
-- paredes.ts (só as que o inventário usa) e as tabelas vêm do gerador.
local tileZone = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiorMap").tileZone
local _decorCatalog = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "decorCatalog")
local DECOR_BACKGROUNDS = _decorCatalog.DECOR_BACKGROUNDS
local DECOR_EXACT = _decorCatalog.DECOR_EXACT
local DECOR_ITEMS = _decorCatalog.DECOR_ITEMS
local DECOR_TYPE_SETS = _decorCatalog.DECOR_TYPE_SETS
--[[
	*
	 * O inventário de teste: quantas de cada peça o jogador tem para pôr na casa. Guardar uma peça devolve a ela.
	 * Quando houver itens de verdade, só esta tabela (e quem a lê, `stockOf`) muda.
	 
]]
local TEST_INVENTORY = {
	chair = 4,
	table = 1,
	pot = 3,
	rug = 2,
	picture = 2,
	window = 2,
	shelf = 1,
	bed = 1,
	torch = 2,
	lamp = 2,
}
--* A ordem das peças no inventário (a do catálogo gerado). 
-- ▼ ReadonlyArray.map ▼
local _newValue = table.create(#DECOR_ITEMS)
local _callback = function(item)
	return item.id
end
for _k, _v in DECOR_ITEMS do
	_newValue[_k] = _callback(_v, _k - 1, DECOR_ITEMS)
end
-- ▲ ReadonlyArray.map ▲
local DECOR_ORDER = _newValue
--* Versão do formato salvo da decoração (`PlayerData.decor`); muda quando o texto mudar de jeito. 
local DECOR_SAVE_VERSION = 1
--* Peças postas, no máximo, em cada mapa; e o tamanho máximo do texto salvo de um mapa. 
local DECOR_MAX_PIECES = 120
local DECOR_MAX_TEXT = 4000
--* Mapas com decoração salva, no máximo, por jogador. 
local DECOR_MAX_MAPS = 8
local byId = {}
for _, item in DECOR_ITEMS do
	local _id = item.id
	byId[_id] = item
end
--* A peça do inventário pelo id, ou nada. 
local function decorItem(id)
	local _id = id
	local _result
	if type(_id) == "string" then
		local _id_1 = id
		_result = byId[_id_1]
	else
		_result = nil
	end
	return _result
end
--* O nome da peça para o jogador (`decor.item.<id>`). 
local function decorItemKey(id)
	return `decor.item.{id}`
end
--* Uma peça posta pelo jogador num mapa. 
local function decorVariant(state)
	local form = state.item.forms[state.form + 1] or state.item.forms[1]
	return form.variants[state.variant + 1] or form.variants[1]
end
--* O tile da folha que a célula da peça mostra. 
local function decorTile(item, cell)
	return { item.sheet, cell[3], cell[4] }
end
--* O tipo de tile do Graal de uma célula da peça (a cadeira senta, a cama deita). 
local function decorKind(cell)
	local code = cell[8]
	return if code == "3" then 3 elseif code == "4" then 4 elseif code == "5" then 5 else 0
end
-- ------------------------------------------------------------------ o fundo (plugin/src/fundos.ts)
--* Os tipos de fundo (índices em DECOR_BACKGROUNDS) de cada tile, pela chave "folha,linha*128+coluna". 
local typesOf = {}
-- ▼ ReadonlyArray.forEach ▼
local _callback_1 = function(_param, index)
	local sheet = _param[1]
	local tiles = _param[3]
	for _, tile in tiles do
		local key = `{sheet},{tile}`
		local list = typesOf[key] or {}
		local _index = index
		if not (table.find(list, _index) ~= nil) then
			local _index_1 = index
			table.insert(list, _index_1)
		end
		typesOf[key] = list
	end
end
for _k, _v in DECOR_BACKGROUNDS do
	_callback_1(_v, _k - 1, DECOR_BACKGROUNDS)
end
-- ▲ ReadonlyArray.forEach ▲
-- ▼ ReadonlyArray.map ▼
local _newValue_1 = table.create(#DECOR_EXACT)
local _callback_2 = function(list)
	local _set = {}
	for _, _v in list do
		_set[_v] = true
	end
	return _set
end
for _k, _v in DECOR_EXACT do
	_newValue_1[_k] = _callback_2(_v, _k - 1, DECOR_EXACT)
end
-- ▲ ReadonlyArray.map ▲
local exactSets = _newValue_1
local function tileTypes(tile)
	local _arg0 = `{tile[1]},{tile[3] * 128 + tile[2]}`
	return typesOf[_arg0]
end
--* A chave do nome de um tipo de fundo (`decor.bg.<id>`), ou a do "outra coisa". 
local function backgroundKey(index)
	local entry = if index ~= nil then DECOR_BACKGROUNDS[index + 1] else nil
	-- Só os fundos da folha da casa têm nome traduzido (`decor.bg.<id>`); o resto é "outra coisa".
	return if entry and entry[1] == "casa" then `decor.bg.{entry[2]}` else "decor.bg.other"
end
--* Como a variante combina com o que está embaixo, célula a célula (`fitAt` do plugin). 
local function fitOf(item, variant, x, y, under)
	local fit = {
		exact = 0,
		seams = 0,
		conflicts = 0,
		checked = 0,
	}
	for _, cell in variant.cells do
		local need = cell[6]
		if need == 0 then
			continue
		end
		local tile = under(x + cell[1], y + cell[2])
		if not tile then
			continue
		end
		fit.checked += 1
		if tile[1] == item.sheet and tile[2] == cell[3] and tile[3] == cell[4] then
			fit.exact += 1
			continue
		end
		local _condition = tile[1] == item.sheet
		if _condition then
			local _result = exactSets[need]
			if _result ~= nil then
				local _arg0 = tile[3] * 128 + tile[2]
				_result = _result[_arg0] ~= nil
			end
			_condition = _result
		end
		if _condition then
			fit.exact += 1
			continue
		end
		local accepted = if cell[7] > 0 then DECOR_TYPE_SETS[cell[7]] else variant.types
		local types = tileTypes(tile)
		local _condition_1 = #accepted == 0
		if not _condition_1 then
			local _condition_2 = types ~= nil
			if _condition_2 then
				-- ▼ ReadonlyArray.some ▼
				local _result = false
				local _callback_3 = function(t)
					local _t = t
					return table.find(accepted, _t) ~= nil
				end
				for _k, _v in types do
					if _callback_3(_v, _k - 1, types) then
						_result = true
						break
					end
				end
				-- ▲ ReadonlyArray.some ▲
				_condition_2 = _result
			end
			_condition_1 = _condition_2
		end
		if _condition_1 then
			fit.seams += 1
			continue
		end
		fit.conflicts += 1
		if not fit.found then
			fit.found = tile
		end
	end
	return fit
end
--* Se a encaixa melhor que b: menos conflitos, mais células exatas, mais células conferidas (`betterFit`). 
local function betterFit(a, b)
	if a.conflicts ~= b.conflicts then
		return a.conflicts < b.conflicts
	end
	if a.exact ~= b.exact then
		return a.exact > b.exact
	end
	return a.exact + a.seams > b.exact + b.seams
end
-- ------------------------------------------------------------------ a parede (plugin/src/encaixe.ts, detectar.ts, paredes.ts)
local at = function(tile, c0, l0, c1, l1)
	return tile ~= nil and tile[1] == "casa" and tile[2] >= c0 and tile[2] <= c1 and tile[3] >= l0 and tile[3] <= l1
end
local isTile = function(tile, col, row)
	return at(tile, col, row, col, row)
end
local isTopStrip = function(t)
	return at(t, 34, 25, 39, 25) or at(t, 41, 28, 42, 28)
end
local isChimneyTop = function(t)
	return at(t, 56, 25, 60, 25)
end
local isChimney = function(t)
	return at(t, 56, 25, 60, 31)
end
local isPillar = function(t)
	return at(t, 32, 24, 33, 31)
end
local isTopRowInside = function(t)
	return isTopStrip(t) or isChimneyTop(t) or at(t, 32, 25, 33, 25)
end
local isTopCorner = function(t)
	return isTile(t, 40, 28) or isTile(t, 43, 28)
end
local isBottomWall = function(t)
	return at(t, 41, 31, 42, 31)
end
local isBottomRow = function(t)
	return isBottomWall(t) or isTile(t, 40, 31) or isTile(t, 43, 31)
end
local isVoid = function(t)
	return isTile(t, 0, 2) or at(t, 58, 16, 58, 18)
end
local isBluePaper = function(t)
	return at(t, 34, 27, 36, 29) or at(t, 38, 27, 39, 29)
end
local isYellowPaper = function(t)
	return at(t, 54, 21, 55, 22)
end
local isPaper = function(t)
	return isBluePaper(t) or isYellowPaper(t)
end
local isFaceTile = function(t)
	return at(t, 34, 26, 39, 31) or (at(t, 54, 20, 56, 23) and not at(t, 54, 20, 55, 20))
end
--* As pontas de parede de 1 e de 2 tiles. 
local isWallEnd = function(t)
	return isTile(t, 42, 30) or isTile(t, 41, 29) or isTile(t, 42, 29)
end
--[[
	*
	 * A peça de parede da célula: a da camada de objeto ou, sem ela, a do chão. O cômodo da ferramenta do Diorama põe
	 * a parede na camada de objeto; a casa de teste (`casa_teste_v2_l`, decodificada) tem a parede no chão. O plugin
	 * só olha a de objeto; aqui valem as duas.
	 
]]
local function wallAt(map, x, y)
	return map:tile(1, x, y) or map:tile(0, x, y)
end
--* A linha que dois cômodos empilhados dividem, servindo de topo ao de baixo (`sharedTop`). 
local function sharedTop(map, x, y)
	local wall = wallAt(map, x, y)
	if not isBottomWall(wall) and not isWallEnd(wall) then
		return false
	end
	local below = wallAt(map, x, y + 1)
	return isFaceTile(below) or isChimney(below) or isPillar(below)
end
--* A linha do topo da parede de fundo acima da célula, ou nada se sair do cômodo antes (`topAbove`). 
local function topAbove(map, x, y)
	do
		local row = y
		local _shouldIncrement = false
		while true do
			if _shouldIncrement then
				row -= 1
			else
				_shouldIncrement = true
			end
			if not (row >= map.y) then
				break
			end
			local wall = wallAt(map, x, row)
			if isTopRowInside(wall) or isTopCorner(wall) or sharedTop(map, x, row) then
				return row
			end
			if row ~= y and isBottomRow(wall) then
				return nil
			end
			if wall == nil or isVoid(wall) then
				return nil
			end
		end
	end
	return nil
end
-- ------------------------------------------------------------------ pôr a peça
--* O motivo de uma recusa: a chave do texto e as chaves que entram nele (traduzidas por quem mostra). 
--* O que o tabuleiro de peças diz de uma célula, para a decoração não cobrir peça, jogador nem saída. 
--* O canto da primeira variante para quem aponta a célula (ax, ay): a peça fica centrada no ponto. 
local function cornerFor(variant, ax, ay)
	return { ax - math.floor((variant.w - 1) / 2), ay - math.floor((variant.h - 1) / 2) }
end
--[[
	*
	 * Os fundos de parede: a peça cujos tipos de fundo são todos de parede (a luminária no papel, o peixe nas tábuas) é
	 * de parede, e a célula dela sem exigência de fundo pede parede do mesmo tipo embaixo, não piso.
	 
]]
local WALL_BACKGROUNDS = {
	["papel_azul"] = true,
	["poste"] = true,
	["viga"] = true,
	["lambri"] = true,
	["papel_amarelo"] = true,
	["lambri_amarelo"] = true,
	["parede_tabuas"] = true,
	["face_pedra"] = true,
	["topo_bege"] = true,
	["muralha_lado"] = true,
}
local function isWallVariant(variant)
	local _condition = #variant.types > 0
	if _condition then
		local _exp = variant.types
		-- ▼ ReadonlyArray.every ▼
		local _result = true
		local _callback_3 = function(index)
			local _result_1 = DECOR_BACKGROUNDS[index + 1]
			if _result_1 ~= nil then
				_result_1 = _result_1[2]
			end
			local _condition_1 = _result_1
			if _condition_1 == nil then
				_condition_1 = ""
			end
			return WALL_BACKGROUNDS[_condition_1] ~= nil
		end
		for _k, _v in _exp do
			if not _callback_3(_v, _k - 1, _exp) then
				_result = false
				break
			end
		end
		-- ▲ ReadonlyArray.every ▲
		_condition = _result
	end
	return _condition
end
--* Piso em que a peça pode pousar: não bloqueia, não é assento, cama nem água, e é piso das folhas. 
local function freeFloor(map, x, y)
	if map:blocked(x, y) or map:kind(x, y) ~= 0 then
		return false
	end
	local top = map:ground(x, y)
	if not top then
		return false
	end
	local zone = tileZone(top)
	return zone == "chao" or zone == "normal"
end
--[[
	*
	 * Onde e em que variante a peça `item` (na direção `form`) fica para quem aponta a célula (ax, ay) do bloco, ou
	 * por que não fica. `ignore` é a peça posta que está sendo movida; `someoneAt` diz se há um jogador na célula
	 * (só o servidor sabe; a peça que bloqueia não cai em cima de ninguém).
	 *
	 * - Peça da parede (janela, quadro): cada variante encaixa pela regra dela (a coluna apontada, a altura da
	 *   parede do cômodo, o papel certo); das que encaixam, fica a que combina melhor com o fundo, sem recusar por
	 *   ele (como no plugin).
	 * - Peça do chão: cada variante no lugar apontado; fica a de menos conflitos de fundo; com conflito, recusa
	 *   com o motivo. Célula sem exigência de fundo precisa de piso livre embaixo.
	 * - Toda peça: dentro do mapa, sem cobrir outra peça, uma saída nem (se bloqueia) um jogador.
	 
]]
local function planDecor(board, item, formIndex, ax, ay, ignore, someoneAt)
	local map = board.map
	local form = item.forms[formIndex + 1]
	local piece = decorItemKey(item.id)
	local refuse = function(refusal, x, y)
		if x == nil then
			x = ax
		end
		if y == nil then
			y = ay
		end
		return {
			ok = false,
			variant = 0,
			x = x,
			y = y,
			refusal = refusal,
		}
	end
	if not form then
		return refuse({
			key = "decor.refuse.blocked",
		})
	end
	local under = function(x, y)
		return map:ground(x, y)
	end
	local best
	local snapError
	local snapped = false
	local _exp = form.variants
	-- ▼ ReadonlyArray.forEach ▼
	local _callback_3 = function(variant, index)
		local _binding = cornerFor(form.variants[1], ax, ay)
		local cx = _binding[1]
		local cy = _binding[2]
		local x = cx + variant.dx
		local y = cy + variant.dy
		if variant.snap then
			snapped = true
			local _binding_1 = variant.snap
			local kind = _binding_1[1]
			local row = _binding_1[2]
			local paper = _binding_1[3]
			local top = topAbove(map, ax, ay)
			if top == nil then
				snapError = snapError or {
					key = "decor.refuse.noWall",
					piece = piece,
				}
				return nil
			end
			y = top + row + variant.dy
			for _, cell in variant.cells do
				local tx = x + cell[1]
				local ty = y + cell[2]
				local current = wallAt(map, tx, ty)
				if topAbove(map, tx, ty) ~= top then
					snapError = snapError or {
						key = "decor.refuse.crossWall",
						piece = piece,
					}
					return nil
				end
				local ok = if kind == "janela" then (if paper == "amarelo" then isYellowPaper(current) else isBluePaper(current)) else isPaper(current)
				if not ok then
					snapError = snapError or {
						key = if kind == "janela" and isPaper(current) then "decor.refuse.paper" else "decor.refuse.wall",
						piece = piece,
					}
					return nil
				end
			end
		end
		local fit = fitOf(item, variant, x, y, under)
		if not best or betterFit(fit, best.fit) then
			best = {
				variant = index,
				x = x,
				y = y,
				fit = fit,
			}
		end
	end
	for _k, _v in _exp do
		_callback_3(_v, _k - 1, _exp)
	end
	-- ▲ ReadonlyArray.forEach ▲
	local chosen = best
	if not chosen then
		return refuse(snapError or {
			key = "decor.refuse.wall",
			piece = piece,
		})
	end
	local variant = form.variants[chosen.variant + 1]
	local wallPiece = isWallVariant(variant)
	local _binding = chosen
	local x = _binding.x
	local y = _binding.y
	if not snapped and chosen.fit.conflicts > 0 then
		local _result
		if chosen.fit.found then
			local _result_1 = tileTypes(chosen.fit.found)
			if _result_1 ~= nil then
				_result_1 = _result_1[1]
			end
			_result = _result_1
		else
			_result = nil
		end
		local found = _result
		local wanted = {}
		for _, kind in variant.types do
			if #wanted < 3 then
				local _arg0 = backgroundKey(kind)
				table.insert(wanted, _arg0)
			end
		end
		return refuse({
			key = "decor.refuse.background",
			piece = piece,
			wanted = wanted,
			found = backgroundKey(found),
		}, x, y)
	end
	for _, cell in variant.cells do
		local cx = x + cell[1]
		local cy = y + cell[2]
		if not map:inside(cx, cy) then
			return refuse({
				key = "decor.refuse.outside",
				piece = piece,
			}, x, y)
		end
		local tile = under(cx, cy)
		if not tile or isVoid(tile) then
			return refuse({
				key = "decor.refuse.outside",
				piece = piece,
			}, x, y)
		end
		if board:isExit(cx, cy) then
			return refuse({
				key = "decor.refuse.door",
				piece = piece,
			}, x, y)
		end
		if board:occupiedByPiece(cx, cy, ignore) then
			return refuse({
				key = "decor.refuse.blocked",
				piece = piece,
			}, x, y)
		end
		-- A célula sem exigência de fundo: a da peça de parede pede a mesma parede embaixo (o rabo do peixe nas tábuas);
		-- a da peça do chão (a mesa, a estante, o miolo da cama) pousa em piso livre.
		if not snapped and cell[6] == 0 then
			if wallPiece then
				local types = tileTypes(tile)
				local _condition = types == nil
				if not _condition then
					-- ▼ ReadonlyArray.some ▼
					local _result = false
					local _callback_4 = function(t)
						local _types = variant.types
						local _t = t
						return table.find(_types, _t) ~= nil
					end
					for _k, _v in types do
						if _callback_4(_v, _k - 1, types) then
							_result = true
							break
						end
					end
					-- ▲ ReadonlyArray.some ▲
					_condition = not _result
				end
				if _condition then
					local _exp_1 = variant.types
					-- ▼ ReadonlyArray.filter ▼
					local _newValue_2 = {}
					local _callback_4 = function(_, i)
						return i < 3
					end
					local _length = 0
					for _k, _v in _exp_1 do
						if _callback_4(_v, _k - 1, _exp_1) == true then
							_length += 1
							_newValue_2[_length] = _v
						end
					end
					-- ▲ ReadonlyArray.filter ▲
					-- ▼ ReadonlyArray.map ▼
					local _newValue_3 = table.create(#_newValue_2)
					local _callback_5 = function(t)
						return backgroundKey(t)
					end
					for _k, _v in _newValue_2 do
						_newValue_3[_k] = _callback_5(_v, _k - 1, _newValue_2)
					end
					-- ▲ ReadonlyArray.map ▲
					local wanted = _newValue_3
					local _object = {
						key = "decor.refuse.background",
						piece = piece,
						wanted = wanted,
					}
					local _left = "found"
					local _result = types
					if _result ~= nil then
						_result = _result[1]
					end
					_object[_left] = backgroundKey(_result)
					return refuse(_object, x, y)
				end
			elseif not freeFloor(map, cx, cy) then
				return refuse({
					key = "decor.refuse.blocked",
					piece = piece,
				}, x, y)
			end
		end
		local _condition = cell[9] == 1
		if _condition then
			local _result = someoneAt
			if _result ~= nil then
				_result = _result(cx, cy)
			end
			_condition = _result
		end
		if _condition then
			return refuse({
				key = "decor.refuse.player",
				piece = piece,
			}, x, y)
		end
	end
	return {
		ok = true,
		variant = chosen.variant,
		x = x,
		y = y,
	}
end
-- ------------------------------------------------------------------ o que fica salvo
--* Uma peça salva: a peça, a direção e onde o jogador apontou. 
--* Uma peça móvel da casa (pote, cadeira, baú) que o jogador mudou de lugar no Decorar. 
--* A decoração de um mapa no salvo: as peças postas e as móveis mudadas de lugar, em texto. 
--[[
	*
	 * A decoração de um jogador no DataStore (`PlayerData.decor`): a versão do formato e, por mapa (o id do Diorama),
	 * as peças em texto. Peça: "item forma x y", separadas por ";". Peça móvel: "id x y variante". A variante e o
	 * canto das postas saem de novo do mapa ao carregar, então um mapa redesenhado não deixa peça em cima de parede:
	 * a que não couber mais volta ao inventário.
	 
]]
local function emptyDecor()
	return {
		v = DECOR_SAVE_VERSION,
		maps = {},
	}
end
local isInt = function(value)
	return value ~= nil and value == math.floor(value) and value >= 0 and value < 1024
end
local function encodePlaced(list)
	-- ▼ ReadonlyArray.map ▼
	local _newValue_2 = table.create(#list)
	local _callback_3 = function(p)
		return `{p.item} {p.form} {p.ax} {p.ay}`
	end
	for _k, _v in list do
		_newValue_2[_k] = _callback_3(_v, _k - 1, list)
	end
	-- ▲ ReadonlyArray.map ▲
	return table.concat(_newValue_2, ";")
end
local function decodePlaced(text)
	local list = {}
	local _text = text
	local _condition = not (type(_text) == "string")
	if not _condition then
		_condition = text == "" or #text > DECOR_MAX_TEXT
	end
	if _condition then
		return list
	end
	for _, entry in string.split(text, ";") do
		local _binding = string.split(entry, " ")
		local id = _binding[1]
		local form = _binding[2]
		local ax = _binding[3]
		local ay = _binding[4]
		local item = decorItem(id)
		local f = tonumber(form)
		local x = tonumber(ax)
		local y = tonumber(ay)
		if not item or not isInt(f) or f >= #item.forms or not isInt(x) or not isInt(y) then
			continue
		end
		if #list < DECOR_MAX_PIECES then
			local _arg0 = {
				item = item.id,
				form = f,
				ax = x,
				ay = y,
			}
			table.insert(list, _arg0)
		end
	end
	return list
end
local function encodeMoved(list)
	-- ▼ ReadonlyArray.map ▼
	local _newValue_2 = table.create(#list)
	local _callback_3 = function(p)
		return `{p.id} {p.x} {p.y} {p.variant}`
	end
	for _k, _v in list do
		_newValue_2[_k] = _callback_3(_v, _k - 1, list)
	end
	-- ▲ ReadonlyArray.map ▲
	return table.concat(_newValue_2, ";")
end
local function decodeMoved(text)
	local list = {}
	local _text = text
	local _condition = not (type(_text) == "string")
	if not _condition then
		_condition = text == "" or #text > DECOR_MAX_TEXT
	end
	if _condition then
		return list
	end
	for _, entry in string.split(text, ";") do
		local _binding = string.split(entry, " ")
		local id = _binding[1]
		local x = _binding[2]
		local y = _binding[3]
		local variant = _binding[4]
		local cx = tonumber(x)
		local cy = tonumber(y)
		local v = tonumber(variant)
		if id == nil or #id > 64 or not isInt(cx) or not isInt(cy) or not isInt(v) then
			continue
		end
		if #list < DECOR_MAX_PIECES then
			local _arg0 = {
				id = id,
				x = cx,
				y = cy,
				variant = v,
			}
			table.insert(list, _arg0)
		end
	end
	return list
end
--* Lê o salvo, jogando fora o que não for do formato (versão desconhecida, mapa demais, texto grande demais). 
local function sanitizeDecor(value)
	local decor = emptyDecor()
	local _value = value
	if not (type(_value) == "table") then
		return decor
	end
	local saved = value
	local _condition = saved.v ~= DECOR_SAVE_VERSION
	if not _condition then
		local _maps = saved.maps
		_condition = not (type(_maps) == "table")
	end
	if _condition then
		return decor
	end
	local count = 0
	for map, entry in pairs(saved.maps) do
		if not (type(map) == "string") or #map > 64 or not (type(entry) == "table") or count >= DECOR_MAX_MAPS then
			continue
		end
		local e = entry
		decor.maps[map] = {
			placed = encodePlaced(decodePlaced(e.placed)),
			moved = encodeMoved(decodeMoved(e.moved)),
		}
		count += 1
	end
	return decor
end
--* Quantas de cada peça o jogador ainda tem para pôr, contando as postas em todos os mapas salvos. 
local function stockOf(decor)
	local stock = {}
	for _, id in DECOR_ORDER do
		local _condition = TEST_INVENTORY[id]
		if _condition == nil then
			_condition = 0
		end
		stock[id] = _condition
	end
	for _, entry in pairs(decor.maps) do
		for _1, placed in decodePlaced(entry.placed) do
			local _exp = placed.item
			local _item = placed.item
			local _condition = stock[_item]
			if _condition == nil then
				_condition = 0
			end
			stock[_exp] = _condition - 1
		end
	end
	return stock
end
return {
	decorItem = decorItem,
	decorItemKey = decorItemKey,
	decorVariant = decorVariant,
	decorTile = decorTile,
	decorKind = decorKind,
	planDecor = planDecor,
	emptyDecor = emptyDecor,
	encodePlaced = encodePlaced,
	decodePlaced = decodePlaced,
	encodeMoved = encodeMoved,
	decodeMoved = decodeMoved,
	sanitizeDecor = sanitizeDecor,
	stockOf = stockOf,
	TEST_INVENTORY = TEST_INVENTORY,
	DECOR_ORDER = DECOR_ORDER,
	DECOR_SAVE_VERSION = DECOR_SAVE_VERSION,
	DECOR_MAX_PIECES = DECOR_MAX_PIECES,
	DECOR_MAX_TEXT = DECOR_MAX_TEXT,
	DECOR_MAX_MAPS = DECOR_MAX_MAPS,
}
