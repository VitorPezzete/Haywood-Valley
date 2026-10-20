-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
-- Qual interior o jogo monta e onde ele fica no mundo. Vale para o cliente (SceneController, que monta a
-- cena) e para o servidor (PieceService, que guarda as peças que os jogadores empurram e carregam): os dois
-- leem os mesmos atributos do Workspace e chegam ao mesmo mapa, na mesma posição.
local Workspace = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services").Workspace
local ACTIONS_TEST_ATTRIBUTE = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiorMap").ACTIONS_TEST_ATTRIBUTE
local INTERIORS = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiors").INTERIORS
local _types = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiors", "types")
local INTERIOR_TEST_ATTRIBUTE = _types.INTERIOR_TEST_ATTRIBUTE
local INTERIOR_TEST_CELL_ATTRIBUTE = _types.INTERIOR_TEST_CELL_ATTRIBUTE
local _view = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "view")
local groundOffset = _view.groundOffset
local snapToArtPx = _view.snapToArtPx
local worldToArtPx = _view.worldToArtPx
--* Lado do tile das folhas do Aeko, em pixels de arte: meio stud de largura (o jogo tem 32 pixels por stud). 
local INTERIOR_TILE = 16
--* O teste de interior do Diorama: o mapa e a célula do bloco onde o personagem começa. 
local cached
--[[
	*
	 * O teste de interior pedido pelo atributo `InteriorTeste` do Workspace (o id de um mapa gerado por
	 * `npm run diorama:jogo`), ou nada no jogo normal. Com ele, o jogo entra direto no interior, sem menu
	 * nem personalização (seção 12.9 da especificação do Diorama). O atributo `InteriorTesteCelula`
	 * ("x,y", células do bloco) escolhe onde o personagem começa; sem ele, vale a célula que o gerador
	 * escolheu. Lido uma vez, no começo.
	 
]]
local readTest
local function interiorTest()
	if cached == nil then
		local _condition = readTest()
		if _condition == nil then
			_condition = false
		end
		cached = _condition
	end
	return if cached == false then nil else cached
end
local blocks
function readTest()
	local id = Workspace:GetAttribute(INTERIOR_TEST_ATTRIBUTE)
	if id == nil or id == "" then
		return nil
	end
	local data = if type(id) == "string" then INTERIORS[id] else nil
	if not data then
		local known = {}
		for name in pairs(INTERIORS) do
			table.insert(known, name)
		end
		warn(`[Interior] o mapa "{tostring(id)}" não foi gerado; os que o jogo conhece: {table.concat(known, ", ")}`)
		return nil
	end
	local cell = data.spawn
	local asked = Workspace:GetAttribute(INTERIOR_TEST_CELL_ATTRIBUTE)
	if type(asked) == "string" and asked ~= "" then
		local x, y = string.match(asked, "^%s*(%d+)%s*,%s*(%d+)%s*$")
		local cx = tonumber(x)
		local cy = tonumber(y)
		if cx == nil or cy == nil then
			warn(`[Interior] {INTERIOR_TEST_CELL_ATTRIBUTE} pede "x,y", veio "{asked}"`)
		elseif blocks(data, cx, cy) then
			warn(`[Interior] a célula {cx},{cy} bloqueia; começando em {cell[1]},{cell[2]}`)
		else
			cell = { cx, cy }
		end
	end
	return {
		data = data,
		cell = cell,
	}
end
--[[
	*
	 * O interior em que o jogo normal começa, depois do menu e da personalização (pedido do usuário em
	 * 2026-10-17: a casa de teste v2 no lugar da cena do protótipo). `undefined` volta à cena antiga, que
	 * continua no SceneController.
	 
]]
local START_INTERIOR = "casa_teste_v2_l"
--* O interior de começo do jogo normal, na célula que o gerador escolheu, ou nada. 
local function startInterior()
	if START_INTERIOR == nil then
		return nil
	end
	local data = INTERIORS[START_INTERIOR]
	if not data then
		warn(`[Interior] o mapa de começo "{START_INTERIOR}" não foi gerado; usando a cena antiga`)
		return nil
	end
	return {
		data = data,
		cell = data.spawn,
	}
end
--* Se a célula (x, y) do bloco bloqueia, pelos dados do mapa. 
function blocks(data, x, y)
	local i = x - data.x
	local j = y - data.y
	local _condition = i < 0 or j < 0 or i >= data.width or j >= data.height
	if not _condition then
		local _exp = data.blocks[j + 1]
		local _arg0 = i + 1
		local _arg1 = i + 1
		_condition = string.sub(_exp, _arg0, _arg1) == "#"
	end
	return _condition
end
--* O interior em que o jogador começa: o teste do Diorama, se houver, senão o de começo do jogo normal. 
local function chosenInterior()
	return interiorTest() or startInterior()
end
-- ------------------------------------------------------------------ os mapas no mundo (etapa E1)
--[[
	*
	 * Atributo do jogador com o id do mapa em que ele está. Quem grava é o servidor (`MapService`): ao entrar, o
	 * mapa de começo; depois, o destino de cada saída que ele confere. Cada cliente monta só o mapa do próprio
	 * jogador e só desenha os jogadores do mesmo mapa.
	 
]]
local MAP_ATTRIBUTE = "Mapa"
--* Atributo do jogador com a célula do bloco ("x,y") em que ele chegou ao mapa: onde ele volta ao renascer. 
local MAP_CELL_ATTRIBUTE = "MapaCelula"
--[[
	*
	 * Cada mapa fica num lugar só dele no mundo, lado a lado na direção da direita da tela (o bloco tem 32 studs de
	 * largura e uns 34 de fundo), em ordem do id. Assim o bloqueio de um mapa nunca encosta no de outro, o servidor
	 * sabe onde está cada um, e o personagem do Roblox de quem está noutro mapa fica longe. Só no eixo X: a
	 * profundidade comprimida da câmera (`toView`) não depende de X, mas ao sul e ao norte ela perde precisão
	 * (`view.ts`).
	 *
	 * 512 studs (fase 1 do `PLANO_OTIMIZACAO.md`, seção 2.6; antes, 64): bem mais que o raio de streaming do
	 * `default.project.json` (`StreamingTargetRadius` 192) somado ao tamanho de um mapa, então o Roblox nem manda a
	 * este cliente o personagem de quem está noutro mapa ou noutra casa.
	 
]]
local MAP_SPACING = 512
--* Lado do bloco do Diorama, em tiles. 
local BLOCK_TILES = 64
local MAP_IDS = {}
for id in pairs(INTERIORS) do
	table.insert(MAP_IDS, id)
end
table.sort(MAP_IDS)
--* Os mapas que o jogo conhece, na ordem em que ficam no mundo. 
local function mapIds()
	return MAP_IDS
end
--* Os dados do mapa, ou nada se ele não foi gerado. 
local function mapData(id)
	local _id = id
	return if type(_id) == "string" then INTERIORS[id] else nil
end
--[[
	*
	 * O ponto do mundo no meio do bloco do mapa (no chão). Os mapas compartilhados ficam em volta da origem, na ordem
	 * do id; as casas (`slot` 1 em diante, uma por dono) ficam dos dois lados deles, alternando (1 à direita, 2 à
	 * esquerda, 3 à direita...), para o mundo ir só até uns 55 mil studs da origem com as 200 casas. No X o chão e os
	 * cartões ficam no pixel de arte (múltiplos de 1/32 stud), que o float guarda exato até 262 mil studs.
	 
]]
local function mapCenter(id, slot)
	if slot == nil then
		slot = 0
	end
	local shared = #MAP_IDS
	local left = -math.floor(shared / 2)
	if slot > 0 then
		local right = slot % 2 == 1
		local step = math.ceil(slot / 2)
		local at = if right then left + shared - 1 + step else left - step
		return Vector3.new(at * MAP_SPACING, 0, 0)
	end
	local _id = id
	local order = (table.find(MAP_IDS, _id) or 0) - 1
	return Vector3.new((math.max(order, 0) + left) * MAP_SPACING, 0, 0)
end
--* Canto de cima à esquerda da célula (0, 0) do bloco do mapa (no lugar `slot`), no chão, no pixel de arte. 
local function mapCorner(id, slot)
	if slot == nil then
		slot = 0
	end
	local half = (BLOCK_TILES * INTERIOR_TILE) / 2
	local _exp = mapCenter(id, slot)
	local _arg0 = groundOffset(-half, -half)
	return snapToArtPx(_exp + _arg0)
end
--* O centro da célula (x, y) do bloco do mapa (no lugar `slot`), no chão. 
local function mapCellPoint(id, x, y, slot)
	if slot == nil then
		slot = 0
	end
	local _exp = mapCorner(id, slot)
	local _arg0 = groundOffset((x + 0.5) * INTERIOR_TILE, (y + 0.5) * INTERIOR_TILE)
	return _exp + _arg0
end
-- ------------------------------------------------------------------ a casa de cada jogador (etapa E2)
--[[
	*
	 * Os mapas que são a casa de um jogador: cada jogador tem a dele, com a decoração dele (`shared/decor.ts`). O
	 * servidor monta uma cópia por dono, num lugar próprio do mundo (`MAP_SLOT_ATTRIBUTE`), então dois jogadores no
	 * mesmo servidor, cada um na sua casa, não se veem nem se esbarram. Visitar a casa de outro (mais tarde) é só o
	 * servidor gravar o dono e o lugar dela no visitante.
	 
]]
local _set = {}
for _, _v in if START_INTERIOR ~= nil then { START_INTERIOR } else {} do
	_set[_v] = true
end
local HOUSE_MAPS = _set
--* Atributo do jogador com o `UserId` do dono da casa em que ele está; 0 (ou nada) num mapa compartilhado. 
local MAP_OWNER_ATTRIBUTE = "MapaDono"
--* Atributo do jogador com o lugar no mundo da casa em que ele está (1 em diante); 0 (ou nada) num mapa compartilhado. 
local MAP_SLOT_ATTRIBUTE = "MapaLugar"
--[[
	*
	 * Casas no mundo, no máximo: uma por jogador do servidor (200, decisão do usuário em 2026-10-18); o piso do
	 * `WorldService` cobre todas.
	 
]]
local MAX_HOUSE_SLOTS = 200
--* O X do mapa mais à esquerda e o do mais à direita, com todas as casas: o piso do `WorldService` cobre os dois. 
local function worldSpan()
	local _condition = MAP_IDS[1]
	if _condition == nil then
		_condition = ""
	end
	local min = mapCenter(_condition).X
	local _condition_1 = MAP_IDS[#MAP_IDS]
	if _condition_1 == nil then
		_condition_1 = ""
	end
	local max = mapCenter(_condition_1).X
	for _, slot in { MAX_HOUSE_SLOTS - 1, MAX_HOUSE_SLOTS } do
		min = math.min(min, mapCenter("", slot).X)
		max = math.max(max, mapCenter("", slot).X)
	end
	return { min, max }
end
local function isHouse(id)
	local _id = id
	return HOUSE_MAPS[_id] ~= nil
end
--* Onde um jogador está: o mapa, o dono e o lugar da cópia (0 nos compartilhados) e a chave dessa cópia. 
local function placeKey(id, owner)
	return if owner > 0 then `{id}#{owner}` else id
end
--* O lugar em que o jogador está, pelos atributos que o servidor grava, ou nada. 
local function placeOf(player)
	local id = player:GetAttribute(MAP_ATTRIBUTE)
	if not (type(id) == "string") or mapData(id) == nil then
		return nil
	end
	local owner = player:GetAttribute(MAP_OWNER_ATTRIBUTE)
	local slot = player:GetAttribute(MAP_SLOT_ATTRIBUTE)
	local o = if type(owner) == "number" and owner > 0 then owner else 0
	local s = if type(slot) == "number" and slot > 0 then slot else 0
	return {
		id = id,
		owner = o,
		slot = s,
		key = placeKey(id, o),
	}
end
--[[
	*
	 * A célula onde chega quem vem por uma saída com a chegada `arrival`: a célula pedida, a entrada com esse nome,
	 * a entrada "entrada" (sem chegada) ou, sem nenhuma delas, o começo do gerador (`spawn`). Célula que bloqueia
	 * também cai no começo.
	 
]]
local function arrivalCell(data, arrival)
	local _condition = arrival ~= nil
	if _condition then
		local _arrival = arrival
		_condition = not (type(_arrival) == "string")
	end
	if _condition then
		if not blocks(data, arrival[1], arrival[2]) then
			return { arrival[1], arrival[2] }
		end
		warn(`[Mapa] a chegada {arrival[1]},{arrival[2]} de "{data.id}" bloqueia; indo ao começo`)
		return data.spawn
	end
	local _condition_1 = arrival
	if _condition_1 == nil then
		_condition_1 = "entrada"
	end
	local name = _condition_1
	local _entry = data.entries
	if _entry ~= nil then
		-- ▼ ReadonlyArray.find ▼
		local _callback = function(candidate)
			return candidate.name == name
		end
		local _result
		for _i, _v in _entry do
			if _callback(_v, _i - 1, _entry) == true then
				_result = _v
				break
			end
		end
		-- ▲ ReadonlyArray.find ▲
		_entry = _result
	end
	local entry = _entry
	if entry and not blocks(data, entry.x, entry.y) then
		return { entry.x, entry.y }
	end
	if arrival ~= nil then
		warn(`[Mapa] "{data.id}" não tem a entrada "{arrival}"; indo ao começo`)
	end
	return data.spawn
end
--* A saída que cobre a célula (x, y) do bloco, ou nada. 
local function exitAt(data, x, y)
	local _result = data.exits
	if _result ~= nil then
		-- ▼ ReadonlyArray.find ▼
		local _callback = function(exit)
			return x >= exit.x and y >= exit.y and x < exit.x + exit.width and y < exit.y + exit.height
		end
		local _result_1
		for _i, _v in _result do
			if _callback(_v, _i - 1, _result) == true then
				_result_1 = _v
				break
			end
		end
		-- ▲ ReadonlyArray.find ▲
		_result = _result_1
	end
	return _result
end
--* A zona com nome da célula (x, y) do bloco, ou nada. 
local function zoneAt(data, x, y)
	local _result = data.zones
	if _result ~= nil then
		-- ▼ ReadonlyArray.find ▼
		local _callback = function(zone)
			local _exp = zone.areas
			-- ▼ ReadonlyArray.some ▼
			local _result_1 = false
			local _callback_1 = function(_param)
				local x0 = _param[1]
				local y0 = _param[2]
				local x1 = _param[3]
				local y1 = _param[4]
				return x >= x0 and y >= y0 and x <= x1 and y <= y1
			end
			for _k, _v in _exp do
				if _callback_1(_v, _k - 1, _exp) then
					_result_1 = true
					break
				end
			end
			-- ▲ ReadonlyArray.some ▲
			return _result_1
		end
		local _result_1
		for _i, _v in _result do
			if _callback(_v, _i - 1, _result) == true then
				_result_1 = _v
				break
			end
		end
		-- ▲ ReadonlyArray.find ▲
		_result = _result_1
	end
	return _result
end
--[[
	*
	 * Como montar o mapa para as ações (as peças móveis e o teste delas): a célula de começo e se entram as peças de
	 * teste (`AcoesTeste`, só no mapa em que o jogo começa). O servidor e o cliente perguntam aqui, para acharem as
	 * mesmas peças com os mesmos ids.
	 
]]
local function actionsStart(data)
	local start = chosenInterior()
	if start and start.data.id == data.id then
		return {
			cell = start.cell,
			test = Workspace:GetAttribute(ACTIONS_TEST_ATTRIBUTE) == true,
		}
	end
	return {
		cell = data.spawn,
		test = false,
	}
end
--* "x,y" de uma célula, como no atributo `MapaCelula`. 
local function encodeCell(cell)
	return `{cell[1]},{cell[2]}`
end
--* A célula de um texto "x,y", ou nada. 
local function decodeCell(value)
	local _value = value
	if not (type(_value) == "string") then
		return nil
	end
	local x, y = string.match(value, "^%s*(%d+)%s*,%s*(%d+)%s*$")
	local cx = tonumber(x)
	local cy = tonumber(y)
	return if cx ~= nil and cy ~= nil then { cx, cy } else nil
end
--* A célula do bloco sob um ponto do chão, com o canto do interior em `corner`. 
local function cellOfPoint(corner, position)
	local _exp = worldToArtPx(position)
	local _arg0 = worldToArtPx(corner)
	local px = _exp - _arg0
	return { math.floor(px.X / INTERIOR_TILE), math.floor(px.Y / INTERIOR_TILE) }
end
--* O ponto do chão a (px, py) pixels de arte do canto da célula (0, 0) do bloco. 
local function pointOfCellPx(corner, px, py)
	local _corner = corner
	local _arg0 = groundOffset(px, py)
	return _corner + _arg0
end
return {
	interiorTest = interiorTest,
	startInterior = startInterior,
	chosenInterior = chosenInterior,
	mapIds = mapIds,
	mapData = mapData,
	mapCenter = mapCenter,
	mapCorner = mapCorner,
	mapCellPoint = mapCellPoint,
	worldSpan = worldSpan,
	isHouse = isHouse,
	placeKey = placeKey,
	placeOf = placeOf,
	arrivalCell = arrivalCell,
	exitAt = exitAt,
	zoneAt = zoneAt,
	actionsStart = actionsStart,
	encodeCell = encodeCell,
	decodeCell = decodeCell,
	cellOfPoint = cellOfPoint,
	pointOfCellPx = pointOfCellPx,
	INTERIOR_TILE = INTERIOR_TILE,
	START_INTERIOR = START_INTERIOR,
	MAP_ATTRIBUTE = MAP_ATTRIBUTE,
	MAP_CELL_ATTRIBUTE = MAP_CELL_ATTRIBUTE,
	MAP_SPACING = MAP_SPACING,
	HOUSE_MAPS = HOUSE_MAPS,
	MAP_OWNER_ATTRIBUTE = MAP_OWNER_ATTRIBUTE,
	MAP_SLOT_ATTRIBUTE = MAP_SLOT_ATTRIBUTE,
	MAX_HOUSE_SLOTS = MAX_HOUSE_SLOTS,
}
