-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local atom = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "charm", "src").atom
local DEFAULT_LOOK = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "appearance").DEFAULT_LOOK
--* Em que tela o jogador está: carregando, no menu inicial, personalizando o personagem ou jogando. 
local screen = atom("loading")
--* O visual montado na tela de personalizar. 
local look = atom(DEFAULT_LOOK)
--* O nome escrito na tela de personalizar, ainda sem filtro; vazio quando o jogador não escreveu. 
local characterName = atom("")
return {
	screen = screen,
	look = look,
	characterName = characterName,
}
