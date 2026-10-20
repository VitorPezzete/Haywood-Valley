-- Compiled with roblox-ts v3.0.0
-- Que tiles das folhas do Aeko acendem uma luz e que janelas têm versão de noite. As regiões são as do
-- catálogo do Diorama (plugin/src/generated/catalogoPecas_*.ts, gerado do `mapa_folhas.json` do guia do
-- Aeko), que o jogo não importa: o id de cada peça vai no comentário. Só tiles oficiais, inteiros e sem
-- mudar nenhum pixel: a janela de noite é outra região da mesma folha.
--* Os halos da folha de luzes (`Aseprite\iluminacao\folha_luzes.png`). 
--[[
	*
	 * As luzes, pelos tiles que as mostram. O fogo azul do braseiro (`castelo@12,0`) fica sem halo: as faixas são
	 * de fogo laranja.
	 *
	 * A lareira com chaminé da casa (`casa@56,25`) não tem quadro de fogo na folha do Aeko: o `[2,0-3]` da zona
	 * animada é o rabo do gato dormindo no piso (conferido na folha em 2026-10-18; o guia só diz que o fogo e o
	 * gato usam a mesma rampa de laranja). A pedido do usuário, ela acende só pelo halo, na boca da fornalha.
	 
]]
local LIGHT_TILES = { {
	sheet = "casa",
	area = { 1, 0, 1, 3 },
	kind = "tocha",
	center = { 8, 10 },
	floor = true,
}, {
	sheet = "casa",
	area = { 64, 31, 64, 31 },
	kind = "abajur",
	center = { 8, 10 },
	floor = true,
}, {
	sheet = "castelo",
	area = { 8, 0, 9, 3 },
	col = 8,
	kind = "tocha",
	center = { 16, 8 },
	floor = true,
}, {
	sheet = "castelo",
	area = { 10, 0, 11, 3 },
	col = 10,
	kind = "lareira",
	center = { 16, 8 },
}, {
	sheet = "casa",
	area = { 58, 31, 58, 31 },
	kind = "lareira",
	center = { 8, 8 },
}, {
	sheet = "casa",
	area = { 64, 28, 64, 28 },
	kind = "tocha",
	center = { 8, 4 },
}, {
	sheet = "castelo",
	area = { 56, 31, 56, 31 },
	kind = "janela_noite",
	center = { 8, 16 },
	nightOnly = true,
	hangs = true,
} }
--[[
	*
	 * As fontes de luz, que ficam na cor cheia à noite, sem o tom do dia (pedido do usuário em 2026-10-18): só o
	 * fogo, a lâmpada e o vidro aceso; a parede em volta escurece com o resto. [folha, c0, l0, c1, l1].
	 
]]
local SOURCE_TILES = { { "casa", 1, 0, 1, 3 }, { "casa", 64, 31, 64, 31 }, { "castelo", 8, 0, 13, 3 }, { "castelo", 55, 29, 57, 31 } }
--* Se o tile é uma fonte de luz (fogo, lâmpada, vidro aceso), que não recebe o tom do dia. 
local function isLightSource(tile)
	local _binding = tile
	local sheet = _binding[1]
	local col = _binding[2]
	local row = _binding[3]
	for _, _binding_1 in SOURCE_TILES do
		local s = _binding_1[1]
		local c0 = _binding_1[2]
		local l0 = _binding_1[3]
		local c1 = _binding_1[4]
		local l1 = _binding_1[5]
		if s == sheet and col >= c0 and col <= c1 and row >= l0 and row <= l1 then
			return true
		end
	end
	return false
end
--* A luz que o tile acende, ou nada. 
local function lightOf(tile)
	local _binding = tile
	local sheet = _binding[1]
	local col = _binding[2]
	local row = _binding[3]
	for _, light in LIGHT_TILES do
		local _binding_1 = light.area
		local c0 = _binding_1[1]
		local l0 = _binding_1[2]
		local c1 = _binding_1[3]
		local l1 = _binding_1[4]
		if light.sheet == sheet and col >= c0 and col <= c1 and row >= l0 and row <= l1 and (light.col == nil or light.col == col) then
			return light
		end
	end
	return nil
end
--[[
	*
	 * As janelas da casa com versão de noite na folha (casa, colunas 78 a 84): a região de dia e a de noite,
	 * do mesmo tamanho e com o mesmo desenho em volta. Os tiles de noite também são reconhecidos: a casa de
	 * teste usa o canto de cima da cortina verde de noite ([81,22]), igual pixel a pixel ao de dia ([44,28]).
	 * A janela com vaso de flor no parapeito (`casa@55,25`, que troca [44,26-27]) não tem versão de noite e
	 * fica como está.
	 
]]
local WINDOWS = { {
	day = { 40, 25 },
	night = { 78, 19 },
	size = { 3, 3 },
}, {
	day = { 62, 24 },
	night = { 78, 22 },
	size = { 3, 3 },
}, {
	day = { 43, 25 },
	night = { 81, 19 },
	size = { 4, 3 },
}, {
	day = { 44, 28 },
	night = { 81, 22 },
	size = { 4, 3 },
} }
local WINDOW_SHEET = "casa"
--* O recorte do vidro de noite de cada janela de `WINDOWS`, na mesma ordem (`folha_luzes_v2.png`). 
local WINDOW_GLASS = { "vidro_simples_azul", "vidro_simples_amarelo", "vidro_cortina_vermelha", "vidro_cortina_verde" }
--* O canto de cima da região de noite da janela do grupo, na folha da casa. 
local function windowNightOrigin(group)
	return WINDOWS[group + 1].night
end
--* Uma célula de janela: o grupo (as do mesmo grupo se juntam numa imagem só) e o tile de dia e de noite. 
--* O tile de janela com as duas versões, ou nada se o tile não é de janela. 
local function windowOf(tile)
	local _binding = tile
	local sheet = _binding[1]
	local col = _binding[2]
	local row = _binding[3]
	if sheet ~= WINDOW_SHEET then
		return nil
	end
	for group = 0, #WINDOWS - 1 do
		local _binding_1 = WINDOWS[group + 1]
		local day = _binding_1.day
		local night = _binding_1.night
		local size = _binding_1.size
		for _, _binding_2 in { { day, night, true }, { night, day, false } } do
			local from = _binding_2[1]
			local other = _binding_2[2]
			local isDay = _binding_2[3]
			local dc = col - from[1]
			local dl = row - from[2]
			if dc < 0 or dl < 0 or dc >= size[1] or dl >= size[2] then
				continue
			end
			local mine = { sheet, col, row }
			local theirs = { sheet, other[1] + dc, other[2] + dl }
			return {
				group = group,
				day = if isDay then mine else theirs,
				night = if isDay then theirs else mine,
			}
		end
	end
	return nil
end
return {
	isLightSource = isLightSource,
	lightOf = lightOf,
	windowNightOrigin = windowNightOrigin,
	windowOf = windowOf,
	LIGHT_TILES = LIGHT_TILES,
	WINDOW_GLASS = WINDOW_GLASS,
}
