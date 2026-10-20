-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local _charm = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "charm", "src")
local atom = _charm.atom
local computed = _charm.computed
local Players = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services").Players
local resolveLocale = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "i18n", "locales").resolveLocale
local DEFAULT_SETTINGS = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "settings").DEFAULT_SETTINGS
--* As escolhas da tela de Configurações. Valem só nesta sessão, até existir o salvamento. 
local settings = atom(DEFAULT_SETTINGS)
--[[
	*
	 * O idioma do Roblox do jogador: o da conta ao entrar e, se ele trocar o idioma no menu do Roblox
	 * durante a partida, o novo (SettingsController).
	 
]]
local robloxLocale = atom(Players.LocalPlayer.LocaleId)
--* O idioma em que o jogo aparece. 
local locale = computed(function()
	local choice = settings().language
	return if choice == "auto" then resolveLocale(robloxLocale()) else choice
end)
return {
	settings = settings,
	robloxLocale = robloxLocale,
	locale = locale,
}
