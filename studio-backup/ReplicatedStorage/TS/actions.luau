-- Compiled with roblox-ts v3.0.0
-- As ações do boneco que os outros jogadores precisam ver e que não saem do mapa: empurrar (contra a
-- parede ou o móvel seguro), segurar, puxar e sentar (para que lado o boneco virou sentado). Deitar e nadar
-- cada cliente tira sozinho do lugar em que o boneco parou; carregar, da peça que o servidor diz que está com ele.
--* Atributo do jogador com a ação de agora, em `encodeAction`. O servidor grava o que o cliente dele pede. 
local ACTION_ATTRIBUTE = "Action"
local BODY_ACTIONS = {
	["push"] = true,
	["grab"] = true,
	["pull"] = true,
	["sit"] = true,
}
local function encodeAction(kind, facing)
	return if kind == nil then "" else `{kind}:{facing}`
end
--* Lê o atributo; texto estranho conta como nenhuma ação. 
local function parseAction(value)
	local _value = value
	local _condition = not (type(_value) == "string")
	if not _condition then
		_condition = value == ""
	end
	if _condition then
		return nil
	end
	local kind, facing = string.match(value, "^(%a+):([0-3])$")
	if not (type(kind) == "string") or not (BODY_ACTIONS[kind] ~= nil) then
		return nil
	end
	local _object = {
		kind = kind,
	}
	local _left = "facing"
	local _condition_1 = tonumber(facing)
	if _condition_1 == nil then
		_condition_1 = 2
	end
	_object[_left] = _condition_1
	return _object
end
--* Se o par que o cliente mandou é uma ação que existe (ou nenhuma, com `kind` vazio). 
local function isAction(kind, facing)
	local _kind = kind
	local _condition = type(_kind) == "string"
	if _condition then
		local _condition_1 = kind == ""
		if not _condition_1 then
			local _kind_1 = kind
			_condition_1 = BODY_ACTIONS[_kind_1] ~= nil
		end
		_condition = _condition_1
		if _condition then
			local _facing = facing
			_condition = type(_facing) == "number"
			if _condition then
				_condition = facing >= 0 and facing <= 3 and facing % 1 == 0
			end
		end
	end
	return _condition
end
--[[
	*
	 * Quanto tempo andando contra o que bloqueia, em segundos, até o boneco fazer força para empurrar; contra
	 * uma peça que se move, ela desliza uma célula (como no Graal, sem tecla).
	 
]]
local PUSH_AFTER = 0.4
--[[
	*
	 * Sentado, um toque numa direção (mais curto que isto, em segundos) só vira o boneco para esse lado, sem
	 * levantar; segurar a direção mais que isto levanta e anda (pedido do usuário em 2026-10-18, como no Graal).
	 
]]
local SIT_TURN_HOLD = 0.25
--* Depois que a peça deslizou, quem continua andando contra ela empurra de novo sem esperar, por este tempo. 
local PUSH_STREAK = 0.6
return {
	encodeAction = encodeAction,
	parseAction = parseAction,
	isAction = isAction,
	ACTION_ATTRIBUTE = ACTION_ATTRIBUTE,
	PUSH_AFTER = PUSH_AFTER,
	SIT_TURN_HOLD = SIT_TURN_HOLD,
	PUSH_STREAK = PUSH_STREAK,
}
