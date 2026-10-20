-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
-- As cabeças e os corpos dos contribuidores, no formato do Graal, lidos dos textos de graalData.ts
-- (gerado por tools/graal_pack.py). Cada peça vem em camadas: a peça inteira nas cores originais e uma
-- máscara em cinza por parte pintável (pele, cabelo, olhos, enfeites, partes da roupa), com o degradê e
-- os detalhes da parte, para o jogo pintar com qualquer cor sem perder as sombras. Cada peça existe em
-- dois estilos (pieceStyle.ts): o do Aeko (graalData.ts) e o original (graalDataOriginal.ts).
local _graalData = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "graalData")
local GRAAL_BODIES = _graalData.GRAAL_BODIES
local GRAAL_HEADS = _graalData.GRAAL_HEADS
local _graalDataOriginal = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "graalDataOriginal")
local GRAAL_BODIES_ORIGINAL = _graalDataOriginal.GRAAL_BODIES_ORIGINAL
local GRAAL_HEADS_ORIGINAL = _graalDataOriginal.GRAAL_HEADS_ORIGINAL
local GRAAL_LAYERS_ORIGINAL = _graalDataOriginal.GRAAL_LAYERS_ORIGINAL
--* 0 masculino, 1 feminino. 
--* O tipo de uma parte da roupa, tirado do lugar dela no corpo (tools/graal_pack.py, cloth_kind). 
local CLOTH_KIND_OF_CODE = {
	t = "shirt",
	m = "sleeves",
	p = "pants",
	k = "skirt",
	v = "dress",
	s = "shoes",
	b = "belt",
	d = "trim",
}
--* Partes da roupa que um corpo pode ter, no máximo. 
local MAX_CLOTHS = 6
--* Enfeites de cor própria que uma cabeça pode ter, no máximo. 
local MAX_DETAILS = 3
local TINT_OF_CODE = {
	s = "skin",
	h = "hair",
	e = "eyes",
}
local GENDER_OF_CODE = {
	m = 0,
	f = 1,
}
local function hex(text)
	return if text ~= nil and text ~= "" then tonumber(text, 16) else nil
end
local function layerOf(text)
	local _binding = string.split(text, ":")
	local code = _binding[1]
	local sheet = _binding[2]
	local cell = _binding[3]
	local blink = _binding[4]
	local _object = {
		code = code,
	}
	local _left = "sheet"
	local _condition = tonumber(sheet)
	if _condition == nil then
		_condition = 0
	end
	_object[_left] = _condition
	local _left_1 = "cell"
	local _condition_1 = tonumber(cell)
	if _condition_1 == nil then
		_condition_1 = 0
	end
	_object[_left_1] = _condition_1
	_object.blink = blink == "1"
	local layer = _object
	local kind = string.sub(code, 1, 1)
	if kind == "c" or kind == "d" then
		layer.tint = if kind == "c" then "cloth" else "detail"
		local _condition_2 = tonumber(string.sub(code, 2))
		if _condition_2 == nil then
			_condition_2 = 0
		end
		layer.part = _condition_2
	else
		layer.tint = TINT_OF_CODE[code]
	end
	return layer
end
--* Cores RRGGBB separadas por vírgula. 
local function colorsOf(text)
	local colors = {}
	if text ~= nil and text ~= "" then
		for _, color in string.split(text, ",") do
			local _condition = hex(color)
			if _condition == nil then
				_condition = 0xffffff
			end
			table.insert(colors, _condition)
		end
	end
	return colors
end
local function layersOf(text)
	local _result
	if text == "" then
		_result = {}
	else
		local _exp = string.split(text, ";")
		-- ▼ ReadonlyArray.map ▼
		local _newValue = table.create(#_exp)
		for _k, _v in _exp do
			_newValue[_k] = layerOf(_v, _k - 1, _exp)
		end
		-- ▲ ReadonlyArray.map ▲
		_result = _newValue
	end
	return _result
end
local function headOf(text)
	local _binding = string.split(text, "|")
	local id = _binding[1]
	local author = _binding[2]
	local gender = _binding[3]
	local top = _binding[4]
	local skin = _binding[5]
	local hair = _binding[6]
	local eyes = _binding[7]
	local details = _binding[8]
	local layers = _binding[9]
	local _object = {
		id = id,
		author = author,
		style = 0,
		gender = GENDER_OF_CODE[gender],
	}
	local _left = "top"
	local _condition = tonumber(top)
	if _condition == nil then
		_condition = 0
	end
	_object[_left] = _condition
	_object.skin = hex(skin)
	_object.hair = hex(hair)
	_object.eyes = hex(eyes)
	_object.details = colorsOf(details)
	local _left_1 = "layers"
	local _condition_1 = layers
	if _condition_1 == nil then
		_condition_1 = ""
	end
	_object[_left_1] = layersOf(_condition_1)
	return _object
end
local function bodyOf(text)
	local fields = string.split(text, "|")
	-- sem o campo dos tipos (dados gravados antes de 2026-10-17), toda parte é "detalhe"
	local _binding = fields
	local id = _binding[1]
	local author = _binding[2]
	local gender = _binding[3]
	local skin = _binding[4]
	local cloths = _binding[5]
	local kinds = if #fields >= 7 then fields[6] else ""
	local _condition = fields[(if #fields >= 7 then 6 else 5) + 1]
	if _condition == nil then
		_condition = ""
	end
	local layers = _condition
	local colors = colorsOf(cloths)
	local codes = if kinds == "" then {} else string.split(kinds, ",")
	local _object = {
		id = id,
		author = author,
		style = 0,
		gender = GENDER_OF_CODE[gender],
		skin = hex(skin),
		cloths = colors,
	}
	local _left = "clothKinds"
	-- ▼ ReadonlyArray.map ▼
	local _newValue = table.create(#colors)
	local _callback = function(_, index)
		local _exp = CLOTH_KIND_OF_CODE
		local _condition_1 = codes[index + 1]
		if _condition_1 == nil then
			_condition_1 = "d"
		end
		local _condition_2 = _exp[_condition_1]
		if _condition_2 == nil then
			_condition_2 = "trim"
		end
		return _condition_2
	end
	for _k, _v in colors do
		_newValue[_k] = _callback(_v, _k - 1, colors)
	end
	-- ▲ ReadonlyArray.map ▲
	_object[_left] = _newValue
	_object.layers = layersOf(layers)
	return _object
end
-- ▼ ReadonlyArray.map ▼
local _newValue = table.create(#GRAAL_HEADS)
for _k, _v in GRAAL_HEADS do
	_newValue[_k] = headOf(_v, _k - 1, GRAAL_HEADS)
end
-- ▲ ReadonlyArray.map ▲
local heads = _newValue
-- ▼ ReadonlyArray.map ▼
local _newValue_1 = table.create(#GRAAL_BODIES)
for _k, _v in GRAAL_BODIES do
	_newValue_1[_k] = bodyOf(_v, _k - 1, GRAAL_BODIES)
end
-- ▲ ReadonlyArray.map ▲
local bodies = _newValue_1
--[[
	*
	 * As camadas da peça no estilo original: as mesmas folhas e células (as folhas originais são casadas
	 * célula a célula com as do Aeko), menos as de GRAAL_LAYERS_ORIGINAL, que trocam a camada do mesmo tipo.
	 
]]
local function originalLayers(id, layers)
	local swaps = GRAAL_LAYERS_ORIGINAL[id]
	if swaps == nil then
		return layers
	end
	local _array = {}
	local _length = #_array
	table.move(layers, 1, #layers, _length + 1, _array)
	local changed = _array
	for _, swap in layersOf(swaps) do
		-- ▼ ReadonlyArray.findIndex ▼
		local _callback = function(layer)
			return layer.code == swap.code
		end
		local _result = -1
		for _i, _v in changed do
			if _callback(_v, _i - 1, changed) == true then
				_result = _i - 1
				break
			end
		end
		-- ▲ ReadonlyArray.findIndex ▲
		local at = _result
		if at >= 0 then
			changed[at + 1] = swap
		end
	end
	return changed
end
--[[
	*
	 * A cabeça no estilo original: o topo e as cores base de GRAAL_HEADS_ORIGINAL (cabeça sem a linha é igual
	 * nos dois estilos) e as camadas das folhas originais.
	 
]]
local function originalHead(head)
	local _object = table.clone(head)
	setmetatable(_object, nil)
	_object.style = 1
	_object.layers = originalLayers(head.id, head.layers)
	local changed = _object
	local text = GRAAL_HEADS_ORIGINAL[head.id]
	if text ~= nil then
		local _binding = string.split(text, "|")
		local top = _binding[1]
		local skin = _binding[2]
		local hair = _binding[3]
		local eyes = _binding[4]
		local details = _binding[5]
		local _condition = tonumber(top)
		if _condition == nil then
			_condition = head.top
		end
		changed.top = _condition
		changed.skin = hex(skin)
		changed.hair = hex(hair)
		changed.eyes = hex(eyes)
		changed.details = colorsOf(details)
	end
	return changed
end
--* O corpo no estilo original: a pele e as cores da roupa de GRAAL_BODIES_ORIGINAL; os tipos da roupa são os mesmos. 
local function originalBody(body)
	local _object = table.clone(body)
	setmetatable(_object, nil)
	_object.style = 1
	_object.layers = originalLayers(body.id, body.layers)
	local changed = _object
	local text = GRAAL_BODIES_ORIGINAL[body.id]
	if text ~= nil then
		local _binding = string.split(text, "|")
		local skin = _binding[1]
		local cloths = _binding[2]
		changed.skin = hex(skin)
		changed.cloths = colorsOf(cloths)
	end
	return changed
end
-- ▼ ReadonlyArray.map ▼
local _newValue_2 = table.create(#heads)
for _k, _v in heads do
	_newValue_2[_k] = originalHead(_v, _k - 1, heads)
end
-- ▲ ReadonlyArray.map ▲
local headsOriginal = _newValue_2
-- ▼ ReadonlyArray.map ▼
local _newValue_3 = table.create(#bodies)
for _k, _v in bodies do
	_newValue_3[_k] = originalBody(_v, _k - 1, bodies)
end
-- ▲ ReadonlyArray.map ▲
local bodiesOriginal = _newValue_3
--* Os autores, na ordem em que aparecem nas cabeças e depois nos corpos (para os créditos e o filtro). 
local authors = {}
local _array = {}
local _length = #_array
local _headsLength = #heads
table.move(heads, 1, _headsLength, _length + 1, _array)
_length += _headsLength
table.move(bodies, 1, #bodies, _length + 1, _array)
for _, piece in _array do
	local _author = piece.author
	if not (table.find(authors, _author) ~= nil) then
		local _author_1 = piece.author
		table.insert(authors, _author_1)
	end
end
--* Se a peça aparece para quem escolheu o gênero `gender`: as dele e as que servem aos dois. 
local function fitsGender(piece, gender)
	return piece.gender == nil or piece.gender == gender
end
--[[
	*
	 * O boneco com que cada gênero começa, escolhido em 2026-10-17 (o usuário deixou a escolha comigo): o
	 * masculino de cabelo preto e jaqueta vermelha, o feminino de coques rosa e vestido azul com casaco
	 * vermelho. Na ordem masculino, feminino.
	 
]]
local DEFAULT_HEADS = { "zar160black", "jen34" }
local DEFAULT_BODIES = { "zar73body", "zar15body" }
--* A peça padrão do gênero, se existir e servir a ele; senão a primeira só do gênero, senão a primeira que serve. 
local function firstOf(pieces, gender, wanted)
	-- ▼ ReadonlyArray.findIndex ▼
	local _callback = function(piece)
		return piece.id == wanted and fitsGender(piece, gender)
	end
	local _result = -1
	for _i, _v in pieces do
		if _callback(_v, _i - 1, pieces) == true then
			_result = _i - 1
			break
		end
	end
	-- ▲ ReadonlyArray.findIndex ▲
	local chosen = _result
	if chosen >= 0 then
		return chosen
	end
	-- ▼ ReadonlyArray.findIndex ▼
	local _callback_1 = function(piece)
		return piece.gender == gender
	end
	local _result_1 = -1
	for _i, _v in pieces do
		if _callback_1(_v, _i - 1, pieces) == true then
			_result_1 = _i - 1
			break
		end
	end
	-- ▲ ReadonlyArray.findIndex ▲
	local own = _result_1
	if own >= 0 then
		return own
	end
	-- ▼ ReadonlyArray.findIndex ▼
	local _callback_2 = function(piece)
		return fitsGender(piece, gender)
	end
	local _result_2 = -1
	for _i, _v in pieces do
		if _callback_2(_v, _i - 1, pieces) == true then
			_result_2 = _i - 1
			break
		end
	end
	-- ▲ ReadonlyArray.findIndex ▲
	return math.max(0, _result_2)
end
local Graal = {
	heads = heads,
	bodies = bodies,
	authors = authors,
	head = function(index, style)
		return (if style == 1 then headsOriginal else heads)[index + 1]
	end,
	body = function(index, style)
		return (if style == 1 then bodiesOriginal else bodies)[index + 1]
	end,
	defaultHead = { firstOf(heads, 0, DEFAULT_HEADS[1]), firstOf(heads, 1, DEFAULT_HEADS[2]) },
	defaultBody = { firstOf(bodies, 0, DEFAULT_BODIES[1]), firstOf(bodies, 1, DEFAULT_BODIES[2]) },
}
return {
	fitsGender = fitsGender,
	MAX_CLOTHS = MAX_CLOTHS,
	MAX_DETAILS = MAX_DETAILS,
	Graal = Graal,
}
