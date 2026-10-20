-- Compiled with roblox-ts v3.0.0
-- O nome que o jogador dá ao personagem na tela de personalizar.
--* Atributo do `Player` com o nome do personagem, já filtrado pelo Roblox. 
local NAME_ATTRIBUTE = "CharacterName"
--* Letras no nome, no máximo. 
local NAME_MAX = 16
--* Bytes que o servidor aceita receber antes de olhar o texto: um nome cheio de acentos cabe folgado. 
local NAME_MAX_BYTES = NAME_MAX * 4
--[[
	*
	 * O nome sem quebras de linha nem caracteres de controle, com os espaços juntados, sem espaço nas
	 * pontas e cortado em `NAME_MAX` letras. Pode voltar vazio.
	 
]]
local function cleanName(text)
	local flat = string.gsub(text, "%c", " ")
	local single = string.gsub(flat, "%s+", " ")
	local trimmed = string.gsub(single, "^%s+", "")
	local clean = string.gsub(trimmed, "%s+$", "")
	local count = utf8.len(clean)
	if not (type(count) == "number") then
		return ""
	end
	if count <= NAME_MAX then
		return clean
	end
	local cut = utf8.offset(clean, NAME_MAX + 1)
	local _result
	if cut ~= nil then
		local _arg1 = cut - 1
		_result = string.sub(clean, 1, _arg1)
	else
		_result = clean
	end
	return _result
end
return {
	cleanName = cleanName,
	NAME_ATTRIBUTE = NAME_ATTRIBUTE,
	NAME_MAX = NAME_MAX,
	NAME_MAX_BYTES = NAME_MAX_BYTES,
}
