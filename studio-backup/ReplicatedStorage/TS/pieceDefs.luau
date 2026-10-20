-- Compiled with roblox-ts v3.0.0
-- As peças dos interiores que o jogador pode segurar e puxar, empurrar ou levantar e carregar. Só peças
-- inteiras e pequenas das folhas do Aeko: cadeira, pote, caixote, baú e barril. Cada uma é uma região do
-- catálogo do Diorama (plugin/src/generated/catalogoAeko.ts, o id é o de lá), com a área copiada de lá:
-- o jogo não importa do plugin. Peça nova: acrescentar aqui, com a área da região no catálogo.
--* Para que lado olha quem senta, na ordem das direções do boneco (`Facing`): 0 cima, 1 esquerda, 2 baixo, 3 direita. 
local PIECE_DEFS = { {
	id = "casa8",
	kind = "chair",
	sheet = "casa",
	col = 0,
	row = 20,
	w = 2,
	h = 2,
	blocks = false,
	lift = false,
	breaks = false,
	weight = 1,
}, {
	id = "casa9",
	kind = "chair",
	sheet = "casa",
	col = 2,
	row = 20,
	w = 1,
	h = 2,
	blocks = false,
	lift = false,
	breaks = false,
	weight = 1,
}, {
	id = "casa10a",
	kind = "chair",
	sheet = "casa",
	col = 0,
	row = 22,
	w = 2,
	h = 1,
	blocks = false,
	lift = false,
	breaks = false,
	weight = 1,
}, {
	id = "casa10b",
	kind = "chair",
	sheet = "casa",
	col = 0,
	row = 23,
	w = 2,
	h = 1,
	blocks = false,
	lift = false,
	breaks = false,
	weight = 1,
}, {
	id = "casa11",
	kind = "chair",
	sheet = "casa",
	col = 2,
	row = 22,
	w = 1,
	h = 2,
	blocks = false,
	lift = false,
	breaks = false,
	weight = 1,
}, {
	id = "castelo14",
	kind = "chair",
	sheet = "castelo",
	col = 0,
	row = 20,
	w = 2,
	h = 3,
	blocks = false,
	lift = false,
	breaks = false,
	weight = 1,
}, {
	id = "casa42",
	kind = "pot",
	sheet = "casa",
	col = 37,
	row = 20,
	w = 2,
	h = 2,
	blocks = true,
	lift = true,
	breaks = true,
	weight = 1,
	family = "pot",
	variant = 0,
}, {
	id = "casa43",
	kind = "pot",
	sheet = "casa",
	col = 37,
	row = 22,
	w = 2,
	h = 2,
	blocks = true,
	lift = true,
	breaks = true,
	weight = 1,
	family = "pot",
	variant = 1,
}, {
	id = "casa67",
	kind = "crate",
	sheet = "casa",
	col = 54,
	row = 20,
	w = 2,
	h = 1,
	blocks = true,
	lift = true,
	breaks = false,
	weight = 1,
}, {
	id = "casa46",
	kind = "chest",
	sheet = "casa",
	col = 45,
	row = 20,
	w = 2,
	h = 2,
	blocks = true,
	lift = false,
	breaks = false,
	weight = 2,
}, {
	id = "casa47",
	kind = "chest",
	sheet = "casa",
	col = 45,
	row = 22,
	w = 2,
	h = 2,
	blocks = true,
	lift = false,
	breaks = false,
	weight = 2,
}, {
	id = "casa64",
	kind = "chest",
	sheet = "casa",
	col = 47,
	row = 22,
	w = 2,
	h = 2,
	blocks = true,
	lift = false,
	breaks = false,
	weight = 2,
}, {
	id = "castelo68",
	kind = "barrel",
	sheet = "castelo",
	col = 61,
	row = 20,
	w = 2,
	h = 3,
	blocks = true,
	lift = false,
	breaks = false,
	weight = 2,
} }
--* A peça pelo id do catálogo. 
local function pieceDef(id)
	-- ▼ ReadonlyArray.find ▼
	local _callback = function(def)
		return def.id == id
	end
	local _result
	for _i, _v in PIECE_DEFS do
		if _callback(_v, _i - 1, PIECE_DEFS) == true then
			_result = _v
			break
		end
	end
	-- ▲ ReadonlyArray.find ▲
	return _result
end
--* As versões de uma família, na ordem de `variant`. 
local function familyDefs(family)
	-- ▼ ReadonlyArray.filter ▼
	local _newValue = {}
	local _callback = function(def)
		return def.family == family
	end
	local _length = 0
	for _k, _v in PIECE_DEFS do
		if _callback(_v, _k - 1, PIECE_DEFS) == true then
			_length += 1
			_newValue[_length] = _v
		end
	end
	-- ▲ ReadonlyArray.filter ▲
	local defs = _newValue
	table.sort(defs, function(a, b)
		local _condition = a.variant
		if _condition == nil then
			_condition = 0
		end
		local _condition_1 = b.variant
		if _condition_1 == nil then
			_condition_1 = 0
		end
		return _condition < _condition_1
	end)
	return defs
end
return {
	pieceDef = pieceDef,
	familyDefs = familyDefs,
	PIECE_DEFS = PIECE_DEFS,
}
