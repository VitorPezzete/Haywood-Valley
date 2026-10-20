-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local _vide = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "vide", "src")
local Vide = _vide
local cleanup = _vide.cleanup
local _kit = TS.import(script, script.Parent, "kit")
local DESIGN = _kit.DESIGN
local Hints = _kit.Hints
local place = _kit.place
local px = _kit.px
local SERIF = _kit.SERIF
local _theme = TS.import(script, script.Parent, "theme")
local themeColor = _theme.themeColor
local themed = _theme.themed
--[[
	*
	 * Painel de menu no kit do tema (Celeiro ou Clássico): fundo escurecido na cor do tema, o painel com a
	 * faixa de título, e as dicas de tecla no canto da tela (fora do palco, no mesmo lugar das do menu).
	 * Clicar fora fecha; o painel é botão para segurar os cliques de dentro. O conteúdo usa as camadas
	 * 34 a 38.
	 
]]
local function MenuPanel(_param)
	local k = _param.k
	local title = _param.title
	local size = _param.size
	local hints = _param.hints
	local onClose = _param.onClose
	local children = _param.children
	local left = math.floor((DESIGN.X - size.X) / 2)
	local top = math.floor((DESIGN.Y - size.Y) / 2)
	local _attributes = table.clone(themed("panel", k))
	setmetatable(_attributes, nil)
	_attributes.Name = "Panel"
	_attributes.AutoButtonColor = false
	_attributes.Position = place(k, left, top)
	_attributes.Size = px(k, size.X, size.Y)
	_attributes.ZIndex = 32
	local _attributes_1 = table.clone(themed("titleBar", k))
	setmetatable(_attributes_1, nil)
	_attributes_1.Name = "Header"
	_attributes_1.AnchorPoint = Vector2.new(0.5, 0.5)
	_attributes_1.Position = function()
		return UDim2.new(0.5, 0, 0, 4 * k())
	end
	_attributes_1.Size = px(k, math.min(size.X - 40, 160), 18)
	_attributes_1.ZIndex = 33
	local root = (Vide.jsx("textbutton", {
		Name = "MenuPanel",
		AutoButtonColor = false,
		Text = "",
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = function()
			return themeColor("screenTint")
		end,
		BackgroundTransparency = 0.35,
		ZIndex = 30,
		Activated = onClose,
	}, Vide.jsx("frame", {
		Name = "Stage",
		BackgroundTransparency = 1,
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = px(k, DESIGN.X, DESIGN.Y),
		ZIndex = 31,
	}, Vide.jsx("imagebutton", _attributes, Vide.jsx("imagelabel", _attributes_1, Vide.jsx("textlabel", {
		Name = "Title",
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		FontFace = SERIF,
		Text = title,
		TextColor3 = function()
			return themeColor("textOnTitle")
		end,
		TextSize = function()
			return 10 * k()
		end,
		ZIndex = 34,
	})), children)), Vide.jsx(Hints, {
		k = k,
		hints = hints,
		zIndex = 40,
	})))
	-- O Show do Vide só tira o painel da tela (Parent = nil), sem destruir; os eventos ligados pelas
	-- propriedades seguram as instâncias. Destrói no fim do quadro, porque o Vide mexe no Parent
	-- depois de encerrar o painel, e Parent de instância destruída não muda mais.
	cleanup(function()
		return task.defer(function()
			return root:Destroy()
		end)
	end)
	return root
end
return {
	MenuPanel = MenuPanel,
}
