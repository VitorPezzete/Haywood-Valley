-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local EN = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "i18n", "en").EN
local PT_BR = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "i18n", "ptBR").PT_BR
--* Idiomas do jogo, pelo código do Roblox. O primeiro é a língua de origem. 
local LOCALES = { "en-us", "pt-br" }
local SOURCE_LOCALE = "en-us"
--* O nome de cada idioma escrito nele mesmo; não se traduz, para quem caiu num idioma que não lê achar o seu. 
local LOCALE_NAMES = {
	["en-us"] = "English",
	["pt-br"] = "Português (Brasil)",
}
local STRINGS = {
	["en-us"] = EN,
	["pt-br"] = PT_BR,
}
--* Valores das variáveis de um texto, pelo nome entre chaves. 
--* Troca cada {nome} do modelo pelo valor; o que não tem valor fica como está. O valor entra sem ser relido. 
local function formatText(template, args)
	if not args then
		return template
	end
	local result = string.gsub(template, "{(%w+)}", function(name)
		local value = args[name]
		return if value ~= nil then tostring(value) else nil
	end)
	return result
end
--* O texto da chave no idioma; faltando, o inglês; faltando também, a própria chave. 
local function translate(locale, key, args)
	local texts = STRINGS[locale]
	local _condition = texts[key]
	if _condition == nil then
		_condition = EN[key]
		if _condition == nil then
			_condition = key
		end
	end
	local template = _condition
	return formatText(template, args)
end
--* Se `key` é uma chave que existe (para chaves montadas, como `hair.<id>`). 
local function isTextKey(key)
	return EN[key] ~= nil
end
--[[
	*
	 * O idioma do jogo para um idioma do Roblox (`Player.LocaleId`, como "pt-br"): o mesmo código, ou a
	 * mesma língua de outra região (pt-pt vira pt-br), ou o inglês.
	 
]]
local function resolveLocale(robloxId)
	local id = string.lower(robloxId)
	for _, locale in LOCALES do
		if locale == id then
			return locale
		end
	end
	local language = string.split(id, "-")[1]
	for _, locale in LOCALES do
		if string.split(locale, "-")[1] == language then
			return locale
		end
	end
	return SOURCE_LOCALE
end
return {
	formatText = formatText,
	translate = translate,
	isTextKey = isTextKey,
	resolveLocale = resolveLocale,
	LOCALES = LOCALES,
	SOURCE_LOCALE = SOURCE_LOCALE,
	LOCALE_NAMES = LOCALE_NAMES,
}
