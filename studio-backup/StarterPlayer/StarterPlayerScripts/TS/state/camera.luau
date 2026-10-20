-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local atom = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "charm", "src").atom
--[[
	*
	 * O zoom do mundo agora: quantos pixels do `ViewportSize` vale um pixel de arte. É inteiro em pixels
	 * físicos; numa tela com escala de 125% fica fracionário aqui (3,2 para 4 físicos). O `CameraController`
	 * escreve; o que desenha texto no mundo (o balão do chat) mede o canvas com ele para a letra sair nítida.
	 * Não é o `k` da interface (`ui/kit.tsx`), que não muda com o zoom do mundo.
	 
]]
local worldZoom = atom(1)
--[[
	*
	 * O que a tela mostra agora, em pixels de arte do chão (`worldToArtPx`): o meio (o pé do jogador) e a metade da
	 * largura e da altura. O `CameraController` escreve a cada quadro; quem precisa saber se algo está na tela (os
	 * bonecos de outros jogadores, `CharacterController`) lê. É um objeto comum, não um átomo: muda a cada quadro.
	 * Até a primeira escrita, a tela é infinita (tudo conta como à mostra).
	 
]]
local worldView = {
	center = Vector2.zero,
	half = Vector2.new(math.huge, math.huge),
}
return {
	worldZoom = worldZoom,
	worldView = worldView,
}
