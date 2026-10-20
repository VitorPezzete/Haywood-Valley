-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local _vide = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "vide", "src")
local Vide = _vide
local cleanup = _vide.cleanup
local _kit = TS.import(script, script.Parent, "kit")
local LABEL = _kit.LABEL
local px = _kit.px
local screenScale = _kit.screenScale
local _theme = TS.import(script, script.Parent, "theme")
local themeColor = _theme.themeColor
local themed = _theme.themed
--* A plaquinha da zona: altura e largura mínima, em pixels de arte; ela cresce com o nome. 
local ZONE_TAG = Vector2.new(40, 13)
--* Folga da plaquinha até o canto de cima à esquerda, abaixo da barra do Roblox. 
local ZONE_MARGIN = Vector2.new(8, 6)
--[[
	*
	 * O que o `MapController` mostra por cima do jogo: o véu preto curto da troca de mapa e, no canto de cima à
	 * esquerda, a plaquinha com o nome da zona em que o jogador acabou de entrar (a peça `nameTag` do tema, a
	 * mesma da caixa de diálogo).
	 
]]
local function MapHud(_param)
	local veil = _param.veil
	local zoneName = _param.zoneName
	local zoneFade = _param.zoneFade
	local _binding = screenScale()
	local k = _binding.k
	local _attributes = table.clone(themed("nameTag", k))
	setmetatable(_attributes, nil)
	_attributes.Name = "Zone"
	_attributes.Position = function()
		return UDim2.fromOffset(ZONE_MARGIN.X * k(), ZONE_MARGIN.Y * k())
	end
	_attributes.Size = px(k, ZONE_TAG.X, ZONE_TAG.Y)
	_attributes.AutomaticSize = "X"
	_attributes.ImageTransparency = zoneFade
	_attributes.Visible = function()
		return zoneFade() < 1
	end
	local gui = (Vide.jsx("screengui", {
		Name = "MapHud",
		ResetOnSpawn = false,
		DisplayOrder = 45,
		AutoLocalize = false,
		IgnoreGuiInset = false,
	}, Vide.jsx("imagelabel", _attributes, Vide.jsx("uipadding", {
		PaddingLeft = function()
			return UDim.new(0, 10 * k())
		end,
		PaddingRight = function()
			return UDim.new(0, 8 * k())
		end,
	}), Vide.jsx("textlabel", {
		BackgroundTransparency = 1,
		Size = function()
			return UDim2.new(0, 0, 1, 0)
		end,
		AutomaticSize = "X",
		FontFace = LABEL,
		Text = zoneName,
		TextColor3 = function()
			return themeColor("textOnTitle")
		end,
		TextTransparency = zoneFade,
		TextSize = function()
			return 6 * k()
		end,
	})), Vide.jsx("frame", {
		Name = "Veil",
		Position = function()
			return UDim2.fromOffset(0, -80)
		end,
		Size = function()
			return UDim2.new(1, 0, 1, 160)
		end,
		BackgroundColor3 = Color3.new(0, 0, 0),
		BorderSizePixel = 0,
		BackgroundTransparency = veil,
		Visible = function()
			return veil() < 1
		end,
		ZIndex = 10,
	})))
	cleanup(gui)
	return gui
end
return {
	MapHud = MapHud,
}
