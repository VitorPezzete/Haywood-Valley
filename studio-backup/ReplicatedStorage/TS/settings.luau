-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
-- Escolhas da tela de Configurações. Ficam aqui porque o salvamento, quando existir, vai guardá-las no servidor.
local LOCALES = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "i18n", "locales").LOCALES
--* O idioma escolhido: "auto" segue o idioma do Roblox do jogador. 
--[[
	*
	 * O kit da interface (decisão do usuário em 2026-10-17): Celeiro (fazenda, o padrão) e Graal (janela de
	 * jogo online; para o jogador aparece como "Clássico", porque o jogo não usa o nome Graal). A terceira
	 * proposta, Aurora, ficou de fora a pedido do usuário.
	 
]]
local DEFAULT_SETTINGS = {
	language = "auto",
	music = 80,
	effects = 80,
	textSpeed = "normal",
	theme = "celeiro",
}
--* A ordem em que as setas percorrem cada escolha. 
local _array = { "auto" }
local _length = #_array
table.move(LOCALES, 1, #LOCALES, _length + 1, _array)
local LANGUAGE_CHOICES = _array
local TEXT_SPEED_ORDER = { "slow", "normal", "fast", "instant" }
local UI_THEMES = { "celeiro", "graal" }
--* Letras por segundo no diálogo; "instant" mostra a fala inteira de uma vez. 
local TEXT_SPEEDS = {
	slow = 25,
	normal = 45,
	fast = 80,
	instant = math.huge,
}
--* Quanto A e D mudam um volume. 
local VOLUME_STEP = 10
--* Nome de cada SoundGroup em SoundService. 
local SOUND_GROUPS = {
	music = "Music",
	effects = "Effects",
}
return {
	DEFAULT_SETTINGS = DEFAULT_SETTINGS,
	LANGUAGE_CHOICES = LANGUAGE_CHOICES,
	TEXT_SPEED_ORDER = TEXT_SPEED_ORDER,
	UI_THEMES = UI_THEMES,
	TEXT_SPEEDS = TEXT_SPEEDS,
	VOLUME_STEP = VOLUME_STEP,
	SOUND_GROUPS = SOUND_GROUPS,
}
