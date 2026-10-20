-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
-- O tema da interface que o jogador escolheu nas Configurações (Celeiro, o padrão, ou Graal, que
-- aparece como "Clássico"), e as peças, cores e medidas dele para as telas. Os dados de cada tema
-- vêm de themes/<tema>.ts, gerado pelo draw_ui_<X>.lua (pasta Aseprite/ui_propostas).
local _charm = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "charm", "src")
local computed = _charm.computed
local subscribe = _charm.subscribe
local source = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "vide", "src").source
local ASSETS = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "assets").ASSETS
local settings = TS.import(script, script.Parent.Parent, "state", "settings").settings
local Celeiro = TS.import(script, script.Parent, "themes", "celeiro").Celeiro
local Graal = TS.import(script, script.Parent, "themes", "graal").Graal
local THEMES = {
	celeiro = Celeiro,
	graal = Graal,
}
--[[
	*
	 * A folha de cada tema, enviada ao Roblox (ui_atlas_<tema>.png). Depois de rodar de novo o script de
	 * um tema, enviar a folha nova e trocar o id no registro (ui.tema.<tema> em assets/registro.json; `npm run assets`).
	 
]]
local THEME_ATLASES = {
	celeiro = ASSETS["ui.tema.celeiro"],
	graal = ASSETS["ui.tema.graal"],
}
for name, id in pairs(THEME_ATLASES) do
	if id == "" then
		warn(`[theme] a folha do tema {name} ainda não tem id no registro (ui.tema.{name})`)
	end
end
--* O tema em uso, para quem lê de fora do Vide (Charm). 
local themeName = computed(function()
	return settings().theme
end)
--[[
	*
	 * O tema em uso como fonte do Vide: as telas leem por aqui, então trocar o tema nas Configurações
	 * redesenha tudo na hora. Chamar `theme()` dentro de funções de propriedade.
	 
]]
local theme = source(settings().theme)
subscribe(themeName, function(value)
	return theme(value)
end)
local function themeData()
	return THEMES[theme()]
end
local function piece(name)
	return themeData().pieces[name]
end
local function themeColor(name)
	return Color3.fromHex(themeData().colors[name])
end
local function metric(name)
	return themeData().metrics[name]
end
--* Tamanho da peça, em pixels de arte. 
local function pieceSize(name)
	local p = piece(name)
	return Vector2.new(p.w, p.h)
end
--[[
	*
	 * Propriedades de um `imagelabel` (ou `imagebutton`) com a peça `name` do tema em uso. Peça com
	 * `slice` estica pelo 9-slice do Roblox, com os cantos fixos na escala `k`; sem `slice`, mostra o
	 * recorte inteiro no tamanho que a imagem tiver. `name` pode ser uma função, para peças que mudam de
	 * estado (normal, em cima, apertado).
	 
]]
local function themed(name, k)
	local _name = name
	local which = if type(_name) == "function" then name else function()
		return name
	end
	return {
		BackgroundTransparency = 1,
		Image = function()
			return THEME_ATLASES[theme()]
		end,
		ImageRectOffset = function()
			local p = piece(which())
			return Vector2.new(p.x, p.y)
		end,
		ImageRectSize = function()
			local p = piece(which())
			return Vector2.new(p.w, p.h)
		end,
		ResampleMode = Enum.ResamplerMode.Pixelated,
		ScaleType = function()
			return if piece(which()).slice then Enum.ScaleType.Slice else Enum.ScaleType.Stretch
		end,
		SliceCenter = function()
			local p = piece(which())
			local s = p.slice or { 0, 0, 0, 0 }
			return Rect.new(s[1], s[2], p.w - s[3], p.h - s[4])
		end,
		SliceScale = k,
	}
end
return {
	themeData = themeData,
	piece = piece,
	themeColor = themeColor,
	metric = metric,
	pieceSize = pieceSize,
	themed = themed,
	THEME_ATLASES = THEME_ATLASES,
	themeName = themeName,
	theme = theme,
}
