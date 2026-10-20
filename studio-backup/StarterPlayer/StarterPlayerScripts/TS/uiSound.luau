-- Compiled with roblox-ts v3.0.0
-- O som da interface, para os componentes do Vide, que não recebem controllers: o `SoundController` liga quem
-- toca (`setUiSoundPlayer`), e a interface só chama `uiSound("click")`. Sem quem toque, não faz nada.
local player
local function setUiSoundPlayer(play)
	player = play
end
--* Toca o som `name` do kit do tema em uso (Celeiro ou Clássico). 
local function uiSound(name)
	local _result = player
	if _result ~= nil then
		_result(name)
	end
end
return {
	setUiSoundPlayer = setUiSoundPlayer,
	uiSound = uiSound,
}
