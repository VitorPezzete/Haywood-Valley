-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local subscribe = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "charm", "src").subscribe
local UserInputService = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services").UserInputService
local source = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "vide", "src").source
local translate = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "i18n", "locales").translate
local locale = TS.import(script, script.Parent.Parent, "state", "settings").locale
-- O Vide só acompanha `source`: este espelha o idioma do Charm, como o StartController faz com a tela.
local current = source(locale())
subscribe(locale, function(value)
	return current(value)
end)
--* O idioma em que a interface está agora. Lido dentro de uma função de propriedade, ela acompanha a troca. 
local function uiLocale()
	return current()
end
--[[
	*
	 * O texto da chave no idioma atual. Na interface, sempre dentro de função, para trocar de idioma na
	 * hora: `Text={() => t("menu.settings")}`.
	 
]]
local function t(key, args)
	return translate(current(), key, args)
end
--* Teclas cujo nome se traduz; as letras vêm do teclado do jogador. 
local KEY_TEXT = {
	[Enum.KeyCode.Space] = "key.space",
	[Enum.KeyCode.Return] = "key.enter",
	[Enum.KeyCode.Backspace] = "key.backspace",
}
--* Nome de uma tecla para mostrar ao jogador. As letras seguem o teclado dele: no AZERTY, o W aparece como Z. 
local function keyName(code)
	local _code = code
	local text = KEY_TEXT[_code]
	if text ~= nil then
		return t(text)
	end
	local label = UserInputService:GetStringForKeyCode(code)
	return if label ~= "" then string.upper(label) else code.Name
end
return {
	uiLocale = uiLocale,
	t = t,
	keyName = keyName,
}
