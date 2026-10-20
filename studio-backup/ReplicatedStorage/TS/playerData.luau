-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
-- O que fica salvo de cada jogador entre uma partida e outra (DataStore, PlayerDataService): o
-- personagem (visual e nome, para o Continuar do menu), as cabeças e os corpos favoritos e os visuais
-- salvos da tela de personalizar, e a decoração da casa. Peças são guardadas pelo
-- id, não pela posição na lista, para continuarem certas quando chegarem peças novas.
local _appearance = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "appearance")
local CLOTH_KEYS = _appearance.CLOTH_KEYS
local DEFAULT_LOOK = _appearance.DEFAULT_LOOK
local DETAIL_KEYS = _appearance.DETAIL_KEYS
local ORIGINAL = _appearance.ORIGINAL
local Graal = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "graal").Graal
local LEGACY_PIECE_STYLE = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "pieceStyle").LEGACY_PIECE_STYLE
local emptyDecor = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "decor").emptyDecor
--* Quantos visuais salvos cada jogador tem. 
local SAVED_LOOKS = 4
--* Favoritos de cada tipo, no máximo. 
local MAX_FAVORITES = 300
--* Tamanho máximo de um id de peça e do texto de um visual salvo. 
local MAX_ID = 64
local MAX_SAVED_LOOK = 256
local function emptyPlayerData()
	local savedLooks = {}
	for index = 0, SAVED_LOOKS - 1 do
		table.insert(savedLooks, "")
	end
	return {
		favoriteHeads = {},
		favoriteBodies = {},
		savedLooks = savedLooks,
		character = "",
		characterName = "",
		decor = emptyDecor(),
	}
end
--* As cores de um visual, na ordem guardada no texto. 
local _array = { "skinRgb", "hairRgb", "eyesRgb" }
local _length = #_array
local _dETAIL_KEYSLength = #DETAIL_KEYS
table.move(DETAIL_KEYS, 1, _dETAIL_KEYSLength, _length + 1, _array)
_length += _dETAIL_KEYSLength
table.move(CLOTH_KEYS, 1, #CLOTH_KEYS, _length + 1, _array)
local COLOR_KEYS = _array
--* A letra de cada estilo no texto salvo, na ordem de `PieceStyle`: a do Aeko e a original. 
local STYLE_CODES = { "a", "o" }
local function styleOfCode(code)
	local _result
	if code ~= nil then
		local _code = code
		_result = (table.find(STYLE_CODES, _code) or 0) - 1
	else
		_result = -1
	end
	local at = _result
	return if at >= 0 then at else LEGACY_PIECE_STYLE
end
--[[
	*
	 * Um visual como texto estável: "gênero|id da cabeça|id do corpo|cor,cor,...|estilos", com o estilo da
	 * cabeça e o do corpo em uma letra cada (`STYLE_CODES`, "ao" = cabeça do Aeko e corpo original).
	 
]]
local function encodeSavedLook(look)
	local _result = Graal.heads[look.head + 1]
	if _result ~= nil then
		_result = _result.id
	end
	local _condition = _result
	if _condition == nil then
		_condition = ""
	end
	local head = _condition
	local _result_1 = Graal.bodies[look.body + 1]
	if _result_1 ~= nil then
		_result_1 = _result_1.id
	end
	local _condition_1 = _result_1
	if _condition_1 == nil then
		_condition_1 = ""
	end
	local body = _condition_1
	-- ▼ ReadonlyArray.map ▼
	local _newValue = table.create(#COLOR_KEYS)
	local _callback = function(key)
		return tostring(look[key])
	end
	for _k, _v in COLOR_KEYS do
		_newValue[_k] = _callback(_v, _k - 1, COLOR_KEYS)
	end
	-- ▲ ReadonlyArray.map ▲
	local colors = table.concat(_newValue, ",")
	local _condition_2 = STYLE_CODES[look.headStyle + 1]
	if _condition_2 == nil then
		_condition_2 = ""
	end
	local _condition_3 = STYLE_CODES[look.bodyStyle + 1]
	if _condition_3 == nil then
		_condition_3 = ""
	end
	local styles = `{_condition_2}{_condition_3}`
	return `{look.gender}|{head}|{body}|{colors}|{styles}`
end
--[[
	*
	 * Lê o texto de `encodeSavedLook`. Peça que não existe mais ou valor fora do lugar devolve `undefined`.
	 * O texto de antes dos estilos (sem o último campo) e estilo desconhecido ficam no estilo do Aeko.
	 
]]
local function decodeSavedLook(text)
	if text == "" or #text > MAX_SAVED_LOOK then
		return nil
	end
	local _binding = string.split(text, "|")
	local gender = _binding[1]
	local headId = _binding[2]
	local bodyId = _binding[3]
	local colors = _binding[4]
	local styles = _binding[5]
	local _exp = Graal.heads
	-- ▼ ReadonlyArray.findIndex ▼
	local _callback = function(piece)
		return piece.id == headId
	end
	local _result = -1
	for _i, _v in _exp do
		if _callback(_v, _i - 1, _exp) == true then
			_result = _i - 1
			break
		end
	end
	-- ▲ ReadonlyArray.findIndex ▲
	local head = _result
	local _exp_1 = Graal.bodies
	-- ▼ ReadonlyArray.findIndex ▼
	local _callback_1 = function(piece)
		return piece.id == bodyId
	end
	local _result_1 = -1
	for _i, _v in _exp_1 do
		if _callback_1(_v, _i - 1, _exp_1) == true then
			_result_1 = _i - 1
			break
		end
	end
	-- ▲ ReadonlyArray.findIndex ▲
	local body = _result_1
	if head < 0 or body < 0 or colors == nil then
		return nil
	end
	local _object = table.clone(DEFAULT_LOOK)
	setmetatable(_object, nil)
	_object.gender = if gender == "1" then 1 else 0
	_object.head = head
	_object.body = body
	local _left = "headStyle"
	local _result_2 = styles
	if _result_2 ~= nil then
		_result_2 = string.sub(_result_2, 1, 1)
	end
	_object[_left] = styleOfCode(_result_2)
	local _left_1 = "bodyStyle"
	local _result_3 = styles
	if _result_3 ~= nil then
		_result_3 = string.sub(_result_3, 2, 2)
	end
	_object[_left_1] = styleOfCode(_result_3)
	local look = _object
	local values = string.split(colors, ",")
	for index = 0, #COLOR_KEYS - 1 do
		local value = tonumber(values[index + 1])
		look[COLOR_KEYS[index + 1]] = if value ~= nil and value == math.floor(value) and value >= ORIGINAL and value <= 0xffffff then value else ORIGINAL
	end
	return look
end
--* Se o texto pode ser um id de peça do tipo `kind`. 
local function isPieceId(kind, id)
	local _id = id
	local _condition = not (type(_id) == "string")
	if not _condition then
		_condition = #id > MAX_ID
	end
	if _condition then
		return false
	end
	local list = if kind == "head" then Graal.heads else Graal.bodies
	-- ▼ ReadonlyArray.some ▼
	local _result = false
	local _callback = function(piece)
		return piece.id == id
	end
	for _k, _v in list do
		if _callback(_v, _k - 1, list) then
			_result = true
			break
		end
	end
	-- ▲ ReadonlyArray.some ▲
	return _result
end
return {
	emptyPlayerData = emptyPlayerData,
	encodeSavedLook = encodeSavedLook,
	decodeSavedLook = decodeSavedLook,
	isPieceId = isPieceId,
	SAVED_LOOKS = SAVED_LOOKS,
	MAX_FAVORITES = MAX_FAVORITES,
	MAX_ID = MAX_ID,
	MAX_SAVED_LOOK = MAX_SAVED_LOOK,
}
