-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
-- Aparência do personagem. O cliente monta um visual (`Look`) na tela de personalizar; o servidor
-- confere e guarda como atributo do jogador, que chega a todos os clientes.
local _graal = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "graal")
local fitsGender = _graal.fitsGender
local Graal = _graal.Graal
local MAX_CLOTHS = _graal.MAX_CLOTHS
local MAX_DETAILS = _graal.MAX_DETAILS
local _pieceStyle = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "pieceStyle")
local DEFAULT_PIECE_STYLE = _pieceStyle.DEFAULT_PIECE_STYLE
local LEGACY_PIECE_STYLE = _pieceStyle.LEGACY_PIECE_STYLE
local PIECE_STYLES = _pieceStyle.PIECE_STYLES
--* Valores de uma cor 0xRRGGBB. 
local RGB_COUNT = 0x1000000
--* Cor guardada como -1: a parte fica com a cor com que foi desenhada. 
local ORIGINAL = -1
--* A cor de um valor 0xRRGGBB. 
local function colorOfRgb(rgb)
	return Color3.fromRGB(bit32.band((bit32.arshift(rgb, 16)), 0xff), bit32.band((bit32.arshift(rgb, 8)), 0xff), bit32.band(rgb, 0xff))
end
--* Os três canais de um valor 0xRRGGBB, de 0 a 255. 
local function channelsOfRgb(rgb)
	return { bit32.band((bit32.arshift(rgb, 16)), 0xff), bit32.band((bit32.arshift(rgb, 8)), 0xff), bit32.band(rgb, 0xff) }
end
--* O valor 0xRRGGBB de três canais de 0 a 255. 
local function rgbOfChannels(r, g, b)
	return (bit32.lshift(math.clamp(math.round(r), 0, 255), 16)) + (bit32.lshift(math.clamp(math.round(g), 0, 255), 8)) + math.clamp(math.round(b), 0, 255)
end
--[[
	*
	 * O visual de um personagem, montado com as cabeças e os corpos dos contribuidores (`Graal`). Cada
	 * cor é 0xRRGGBB ou `ORIGINAL` (-1), a cor com que a parte foi desenhada.
	 
]]
--* A chave da parte `index` da roupa. 
local CLOTH_KEYS = { "cloth0Rgb", "cloth1Rgb", "cloth2Rgb", "cloth3Rgb", "cloth4Rgb", "cloth5Rgb" }
local _arg0 = #CLOTH_KEYS == MAX_CLOTHS
assert(_arg0)
--* A chave do enfeite `index` da cabeça. 
local DETAIL_KEYS = { "detail0Rgb", "detail1Rgb", "detail2Rgb" }
local _arg0_1 = #DETAIL_KEYS == MAX_DETAILS
assert(_arg0_1)
--[[
	*
	 * Cada escolha e quantos valores ela aceita, a partir do menor. A ordem é a do texto guardado no
	 * atributo.
	 
]]
local _array = { {
	key = "gender",
	min = 0,
	count = function()
		return 2
	end,
}, {
	key = "head",
	min = 0,
	count = function()
		return #Graal.heads
	end,
}, {
	key = "body",
	min = 0,
	count = function()
		return #Graal.bodies
	end,
}, {
	key = "skinRgb",
	min = ORIGINAL,
	count = function()
		return RGB_COUNT + 1
	end,
}, {
	key = "hairRgb",
	min = ORIGINAL,
	count = function()
		return RGB_COUNT + 1
	end,
}, {
	key = "eyesRgb",
	min = ORIGINAL,
	count = function()
		return RGB_COUNT + 1
	end,
} }
local _length = #_array
-- ▼ ReadonlyArray.map ▼
local _newValue = table.create(#DETAIL_KEYS)
local _callback = function(key)
	return {
		key = key,
		min = ORIGINAL,
		count = function()
			return RGB_COUNT + 1
		end,
	}
end
for _k, _v in DETAIL_KEYS do
	_newValue[_k] = _callback(_v, _k - 1, DETAIL_KEYS)
end
-- ▲ ReadonlyArray.map ▲
local _Length = #_newValue
table.move(_newValue, 1, _Length, _length + 1, _array)
_length += _Length
-- ▼ ReadonlyArray.map ▼
local _newValue_1 = table.create(#CLOTH_KEYS)
local _callback_1 = function(key)
	return {
		key = key,
		min = ORIGINAL,
		count = function()
			return RGB_COUNT + 1
		end,
	}
end
for _k, _v in CLOTH_KEYS do
	_newValue_1[_k] = _callback_1(_v, _k - 1, CLOTH_KEYS)
end
-- ▲ ReadonlyArray.map ▲
local _Length_1 = #_newValue_1
table.move(_newValue_1, 1, _Length_1, _length + 1, _array)
_length += _Length_1
_array[_length + 1] = {
	key = "headStyle",
	min = 0,
	count = function()
		return PIECE_STYLES
	end,
}
_array[_length + 2] = {
	key = "bodyStyle",
	min = 0,
	count = function()
		return PIECE_STYLES
	end,
}
local FIELDS = _array
--* Quantos valores tinha o texto antes dos estilos. 
local FIELDS_BEFORE_STYLES = #FIELDS - 2
--* O visual com que todo jogador começa: masculino, a cabeça e o corpo padrão, tudo nas cores originais. 
local DEFAULT_LOOK = {
	gender = 0,
	head = Graal.defaultHead[1],
	body = Graal.defaultBody[1],
	skinRgb = ORIGINAL,
	hairRgb = ORIGINAL,
	eyesRgb = ORIGINAL,
	detail0Rgb = ORIGINAL,
	detail1Rgb = ORIGINAL,
	detail2Rgb = ORIGINAL,
	cloth0Rgb = ORIGINAL,
	cloth1Rgb = ORIGINAL,
	cloth2Rgb = ORIGINAL,
	cloth3Rgb = ORIGINAL,
	cloth4Rgb = ORIGINAL,
	cloth5Rgb = ORIGINAL,
	headStyle = DEFAULT_PIECE_STYLE,
	bodyStyle = DEFAULT_PIECE_STYLE,
}
--* A cabeça do visual, no estilo escolhido para ela. 
local function lookHead(look)
	return Graal.head(look.head, look.headStyle)
end
--* O corpo do visual, no estilo escolhido para ele. 
local function lookBody(look)
	return Graal.body(look.body, look.bodyStyle)
end
--[[
	*
	 * O mesmo visual com a cabeça ou o corpo em outro estilo. As cores escolhidas ficam; as que estão na
	 * original passam a ser as do estilo novo.
	 
]]
local function withStyle(look, piece, style)
	local _result
	if piece == "head" then
		local _object = table.clone(look)
		setmetatable(_object, nil)
		_object.headStyle = style
		_result = _object
	else
		local _object = table.clone(look)
		setmetatable(_object, nil)
		_object.bodyStyle = style
		_result = _object
	end
	return _result
end
--* O mesmo visual com outro corpo: as partes da roupa são outras, então voltam à cor original. 
local function withBody(look, body)
	local _object = table.clone(look)
	setmetatable(_object, nil)
	_object.body = body
	local changed = _object
	for _, key in CLOTH_KEYS do
		changed[key] = ORIGINAL
	end
	return changed
end
--* O mesmo visual com outra cabeça: os enfeites são outros, então voltam à cor original. 
local function withHead(look, head)
	local _object = table.clone(look)
	setmetatable(_object, nil)
	_object.head = head
	local changed = _object
	if head ~= look.head then
		for _, key in DETAIL_KEYS do
			changed[key] = ORIGINAL
		end
	end
	return changed
end
--[[
	*
	 * A cabeça escolhida na grade: vem com o cabelo, os olhos e os enfeites que o artista pintou, e a pele do
	 * boneco continua (decisão do usuário em 2026-10-17). A grade mostra cada cabeça assim.
	 
]]
local function withPickedHead(look, head)
	local changed = withHead(look, head)
	changed.hairRgb = ORIGINAL
	changed.eyesRgb = ORIGINAL
	for _, key in DETAIL_KEYS do
		changed[key] = ORIGINAL
	end
	return changed
end
--* O gênero do visual. 
local function lookGender(look)
	return if look.gender == 1 then 1 else 0
end
--[[
	*
	 * O mesmo visual com outro gênero. Cabeça e corpo que não servem ao gênero novo trocam pelos padrão
	 * dele; as cores escolhidas ficam.
	 
]]
local function withGender(look, gender)
	local _object = table.clone(look)
	setmetatable(_object, nil)
	_object.gender = gender
	local changed = _object
	local head = Graal.heads[look.head + 1]
	if not head or not fitsGender(head, gender) then
		changed = withHead(changed, Graal.defaultHead[gender + 1])
	end
	local body = Graal.bodies[look.body + 1]
	if not body or not fitsGender(body, gender) then
		changed = withBody(changed, Graal.defaultBody[gender + 1])
	end
	return changed
end
--[[
	*
	 * A cor original de uma parte no visual, no estilo da peça. A pele vem da cabeça, se ela tem pele, senão
	 * do corpo: pintando as duas com ela, cabeça e corpo ficam com o mesmo tom.
	 
]]
local function originalRgb(look, key)
	local head = lookHead(look)
	local body = lookBody(look)
	if key == "skinRgb" then
		local _result = head
		if _result ~= nil then
			_result = _result.skin
		end
		local _condition = _result
		if _condition == nil then
			local _result_1 = body
			if _result_1 ~= nil then
				_result_1 = _result_1.skin
			end
			_condition = _result_1
		end
		return _condition
	end
	if key == "hairRgb" then
		local _result = head
		if _result ~= nil then
			_result = _result.hair
		end
		return _result
	end
	if key == "eyesRgb" then
		local _result = head
		if _result ~= nil then
			_result = _result.eyes
		end
		return _result
	end
	local _key = key
	local detail = (table.find(DETAIL_KEYS, _key) or 0) - 1
	if detail >= 0 then
		local _result = head
		if _result ~= nil then
			_result = _result.details[detail + 1]
		end
		return _result
	end
	local _result = body
	if _result ~= nil then
		local _exp = _result.cloths
		local _key_1 = key
		_result = _exp[table.find(CLOTH_KEYS, _key_1) or 0]
	end
	return _result
end
--* A cor que pinta a parte `key`: a escolhida ou a original. `undefined` se a peça não tem a parte. 
local function partRgb(look, key)
	local original = originalRgb(look, key)
	if original == nil then
		return nil
	end
	return if look[key] == ORIGINAL then original else look[key]
end
--* Atributo do `Player` com o visual, no formato de `encodeLook`. 
local LOOK_ATTRIBUTE = "Look"
--* Limite do texto de um visual: bem acima do maior que `encodeLook` produz. 
local MAX_LOOK_TEXT = #FIELDS * 9 + 16
--* O visual como texto: os valores na ordem de `FIELDS`, separados por vírgula. 
local function encodeLook(look)
	-- ▼ ReadonlyArray.map ▼
	local _newValue_2 = table.create(#FIELDS)
	local _callback_2 = function(field)
		return tostring(look[field.key])
	end
	for _k, _v in FIELDS do
		_newValue_2[_k] = _callback_2(_v, _k - 1, FIELDS)
	end
	-- ▲ ReadonlyArray.map ▲
	return table.concat(_newValue_2, ",")
end
--[[
	*
	 * Lê o texto de `encodeLook`. Devolve `undefined` se faltar valor ou se algum não existir. O texto de
	 * antes dos estilos (sem os dois últimos valores) vale, com as peças no estilo do Aeko.
	 
]]
local function parseLook(text)
	local _text = text
	if not (type(_text) == "string") then
		return nil
	end
	-- O texto vem do cliente: conferir o tamanho antes de dividir.
	if #text > MAX_LOOK_TEXT then
		return nil
	end
	local parts = string.split(text, ",")
	if #parts ~= #FIELDS and #parts ~= FIELDS_BEFORE_STYLES then
		return nil
	end
	local _object = table.clone(DEFAULT_LOOK)
	setmetatable(_object, nil)
	_object.headStyle = LEGACY_PIECE_STYLE
	_object.bodyStyle = LEGACY_PIECE_STYLE
	local look = _object
	for index = 0, #parts - 1 do
		local field = FIELDS[index + 1]
		local value = tonumber(parts[index + 1])
		if value == nil or value ~= math.floor(value) then
			return nil
		end
		if value < field.min or value >= field.min + field.count() then
			return nil
		end
		look[field.key] = value
	end
	return look
end
return {
	colorOfRgb = colorOfRgb,
	channelsOfRgb = channelsOfRgb,
	rgbOfChannels = rgbOfChannels,
	lookHead = lookHead,
	lookBody = lookBody,
	withStyle = withStyle,
	withBody = withBody,
	withHead = withHead,
	withPickedHead = withPickedHead,
	lookGender = lookGender,
	withGender = withGender,
	originalRgb = originalRgb,
	partRgb = partRgb,
	encodeLook = encodeLook,
	parseLook = parseLook,
	ORIGINAL = ORIGINAL,
	CLOTH_KEYS = CLOTH_KEYS,
	DETAIL_KEYS = DETAIL_KEYS,
	DEFAULT_LOOK = DEFAULT_LOOK,
	LOOK_ATTRIBUTE = LOOK_ATTRIBUTE,
}
