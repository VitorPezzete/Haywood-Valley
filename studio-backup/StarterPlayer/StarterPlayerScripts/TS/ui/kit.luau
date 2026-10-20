-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local _vide = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "vide", "src")
local Vide = _vide
local cleanup = _vide.cleanup
local source = _vide.source
local Workspace = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services").Workspace
local subscribe = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "charm", "src").subscribe
local screenDensity = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "view").screenDensity
local _phone = TS.import(script, script.Parent.Parent, "state", "phone")
local phonePreview = _phone.phonePreview
local phoneScale = _phone.phoneScale
local uiSound = TS.import(script, script.Parent.Parent, "uiSound").uiSound
local _i18n = TS.import(script, script.Parent, "i18n")
local keyName = _i18n.keyName
local t = _i18n.t
local _theme = TS.import(script, script.Parent, "theme")
local metric = _theme.metric
local pieceSize = _theme.pieceSize
local themeColor = _theme.themeColor
local themed = _theme.themed
local INK = Color3.fromRGB(26, 24, 48)
local WHITE = Color3.fromRGB(255, 255, 255)
local CREAM = Color3.fromRGB(255, 242, 204)
--* Tinta da opção escolhida e da aba aberta. 
local CHOSEN = Color3.fromRGB(214, 190, 255)
-- As três abaixo saem da paleta do draw_ui.lua.
--* Fundo claro dos campos: o nome e os valores das Configurações. 
local PALE = Color3.fromRGB(238, 241, 248)
--* Parte cheia das barras de volume. 
local PURPLE = Color3.fromHex("#7038E0")
--* Títulos dos créditos sobre o pergaminho. 
local CLAY_DARK = Color3.fromHex("#9C5850")
--* Títulos de painel e itens do menu. 
local SERIF = Font.new("rbxasset://fonts/families/Merriweather.json", Enum.FontWeight.Bold)
--* Rótulos curtos e botões, em fonte de pixel. 
local LABEL = Font.new("rbxasset://fonts/families/PressStart2P.json")
--* Texto corrido. A Gotham SSm saiu do Roblox; a Montserrat é a substituta oficial e tem os acentos. 
local BODY = Font.new("rbxasset://fonts/families/Montserrat.json", Enum.FontWeight.Medium)
--* A interface é desenhada para uma tela de 480×270 pixels de arte. 
local DESIGN = Vector2.new(480, 270)
--[[
	*
	 * Medidas da tela. `k` é quantos pixels do `ViewportSize` vale um pixel de arte: inteiro em pixels
	 * físicos, para a pixel art não borrar, e o maior que ainda deixa o desenho de 480×270 caber. Numa tela
	 * com escala de 125% (`screenDensity`), fica fracionário aqui e a interface sai um pouco menor (pedido do
	 * usuário em 2026-10-17). Chamar dentro de um componente.
	 
]]
local function screenScale()
	local camera = Workspace.CurrentCamera
	local real = source(camera.ViewportSize)
	cleanup(camera:GetPropertyChangedSignal("ViewportSize"):Connect(function()
		return real(camera.ViewportSize)
	end))
	-- A prévia de celular (ferramenta de desenvolvimento, `client/state/phone.ts`): o `k` e a tela como no celular,
	-- ampliados pelo inteiro que cabe na tela de agora.
	local phone = source(phonePreview())
	cleanup(subscribe(phonePreview, function(value)
		return phone(value)
	end))
	local scaleOf = function(size)
		local density = screenDensity(size)
		return {
			density = density,
			physical = size * density,
		}
	end
	local viewport = function()
		local p = phone()
		if not p then
			return real()
		end
		local _binding = scaleOf(real())
		local density = _binding.density
		local physical = _binding.physical
		local _arg0 = phoneScale(p, physical) / density
		return p * _arg0
	end
	local k = function()
		local p = phone()
		local _binding = scaleOf(real())
		local density = _binding.density
		local physical = _binding.physical
		if p then
			return (math.max(1, math.floor(math.min(p.X / DESIGN.X, p.Y / DESIGN.Y))) * phoneScale(p, physical)) / density
		end
		return math.max(1, math.floor(math.min(physical.X / DESIGN.X, physical.Y / DESIGN.Y))) / density
	end
	return {
		viewport = viewport,
		k = k,
	}
end
--* Propriedades de um `imagelabel` que mostra uma peça da folha, sem esticar. 
local function art(piece)
	return {
		BackgroundTransparency = 1,
		Image = piece.image,
		ImageRectOffset = piece.offset,
		ImageRectSize = piece.size,
		ResampleMode = Enum.ResamplerMode.Pixelated,
	}
end
--* Propriedades de um `imagelabel` com uma peça fatiada em 9: os cantos ficam fixos e o miolo estica. 
local function sliced(piece, border, k)
	local _object = table.clone(art(piece))
	setmetatable(_object, nil)
	_object.ScaleType = Enum.ScaleType.Slice
	_object.SliceCenter = Rect.new(border.left, border.top, piece.size.X - border.right, piece.size.Y - border.bottom)
	_object.SliceScale = k
	return _object
end
--* Tamanho em pixels de arte. 
local function px(k, width, height)
	return function()
		return UDim2.fromOffset(width * k(), height * k())
	end
end
--* Posição em pixels de arte. 
local function place(k, x, y)
	return function()
		return UDim2.fromOffset(x * k(), y * k())
	end
end
--[[
	*
	 * Botão com texto, preso pelo canto de cima à esquerda, no kit do tema (o botão comum; com `tint`,
	 * aparece como escolhido quando a cor for a de escolhido).
	 
]]
local ThemeButton
local function PillButton(_param)
	local k = _param.k
	local text = _param.text
	local x = _param.x
	local y = _param.y
	local width = _param.width
	local zIndex = _param.zIndex
	local onPress = _param.onPress
	local tint = _param.tint
	return Vide.jsx(ThemeButton, {
		k = k,
		kind = "secondary",
		position = place(k, x, y),
		size = px(k, width, 18),
		text = text,
		chosen = if tint then function()
			return tint() == CHOSEN
		end else nil,
		zIndex = zIndex,
		onPress = onPress,
	})
end
--* Uma dica: as teclas e a chave do texto do que elas fazem (numa função, quando muda com o que se pode fazer). 
--* Dicas de tecla no canto de baixo à direita, no kit do tema: as teclas e o que elas fazem. 
local function Hints(_param)
	local hints = _param.hints
	local k = _param.k
	local fade = _param.fade
	local zIndex = _param.zIndex
	if zIndex == nil then
		zIndex = 20
	end
	local transparency = fade or (function()
		return 0
	end)
	local _exp = Vide.jsx("uilistlayout", {
		FillDirection = "Horizontal",
		SortOrder = "LayoutOrder",
		Padding = function()
			return UDim.new(0, 5 * k())
		end,
	})
	-- ▼ ReadonlyArray.map ▼
	local _newValue = table.create(#hints)
	local _callback = function(hint, order)
		local _attributes = table.clone(themed("tooltip", k))
		setmetatable(_attributes, nil)
		_attributes.LayoutOrder = order
		_attributes.AutomaticSize = "X"
		_attributes.Size = function()
			return UDim2.fromOffset(0, 18 * k())
		end
		_attributes.ImageTransparency = transparency
		_attributes.ZIndex = zIndex
		local _exp_1 = Vide.jsx("uilistlayout", {
			FillDirection = "Horizontal",
			VerticalAlignment = "Center",
			SortOrder = "LayoutOrder",
			Padding = function()
				return UDim.new(0, 2 * k())
			end,
		})
		local _exp_2 = Vide.jsx("uipadding", {
			PaddingLeft = function()
				return UDim.new(0, 4 * k())
			end,
			PaddingRight = function()
				return UDim.new(0, 6 * k())
			end,
		})
		local _exp_3 = hint.keys
		-- ▼ ReadonlyArray.map ▼
		local _newValue_1 = table.create(#_exp_3)
		local _callback_1 = function(key, index)
			local _attributes_1 = table.clone(themed("key", k))
			setmetatable(_attributes_1, nil)
			_attributes_1.LayoutOrder = index
			_attributes_1.AutomaticSize = "X"
			_attributes_1.Size = function()
				return UDim2.fromOffset(0, 14 * k())
			end
			_attributes_1.ImageTransparency = transparency
			_attributes_1.ZIndex = zIndex + 1
			return Vide.jsx("imagelabel", _attributes_1, Vide.jsx("uipadding", {
				PaddingLeft = function()
					return UDim.new(0, 4 * k())
				end,
				PaddingRight = function()
					return UDim.new(0, 4 * k())
				end,
				PaddingBottom = function()
					return UDim.new(0, 3 * k())
				end,
			}), Vide.jsx("textlabel", {
				BackgroundTransparency = 1,
				AutomaticSize = "X",
				Size = UDim2.new(0, 0, 1, 0),
				FontFace = LABEL,
				Text = function()
					return keyName(key)
				end,
				TextColor3 = function()
					return themeColor("textOnKey")
				end,
				TextSize = function()
					return 5 * k()
				end,
				TextTransparency = transparency,
				ZIndex = zIndex + 2,
			}))
		end
		for _k, _v in _exp_3 do
			_newValue_1[_k] = _callback_1(_v, _k - 1, _exp_3)
		end
		-- ▲ ReadonlyArray.map ▲
		return Vide.jsx("imagelabel", _attributes, _exp_1, _exp_2, _newValue_1, Vide.jsx("textlabel", {
			BackgroundTransparency = 1,
			LayoutOrder = 99,
			AutomaticSize = "X",
			Size = UDim2.new(0, 0, 1, 0),
			FontFace = BODY,
			Text = function()
				local _label = hint.label
				return t(if type(_label) == "function" then hint.label() else hint.label)
			end,
			TextColor3 = function()
				return themeColor("text")
			end,
			TextSize = function()
				return 8 * k()
			end,
			TextTransparency = transparency,
			ZIndex = zIndex + 1,
		}))
	end
	for _k, _v in hints do
		_newValue[_k] = _callback(_v, _k - 1, hints)
	end
	-- ▲ ReadonlyArray.map ▲
	return Vide.jsx("frame", {
		Name = "Hints",
		BackgroundTransparency = 1,
		AnchorPoint = Vector2.new(1, 1),
		Position = function()
			return UDim2.new(1, -6 * k(), 1, -5 * k())
		end,
		AutomaticSize = "XY",
		ZIndex = zIndex,
	}, _exp, _newValue)
end
--[[
	*
	 * Botão no kit do tema em uso (Celeiro ou Clássico), com os estados normal, em cima e apertado; o
	 * ícone e o texto descem `pressedOffset` quando apertado.
	 
]]
function ThemeButton(props)
	local _binding = props
	local k = _binding.k
	local hovered = source(false)
	local pressed = source(false)
	local _condition = props.zIndex
	if _condition == nil then
		_condition = 13
	end
	local z = _condition
	local fade = props.fade or (function()
		return 0
	end)
	local kind = function()
		local _kind = props.kind
		return if type(_kind) == "function" then props.kind() else props.kind
	end
	local main = function()
		local _condition_1 = kind() == "primary"
		if not _condition_1 then
			local _result = props.chosen
			if _result ~= nil then
				_result = _result()
			end
			_condition_1 = _result == true
		end
		return _condition_1
	end
	local pieceName = function()
		local base = if kind() == "icon" then "iconButton" elseif main() then "buttonPrimary" else "buttonSecondary"
		return `{base}{if pressed() then "Pressed" elseif hovered() then "Hover" else ""}`
	end
	local ink = function()
		return if main() then themeColor("textOnPrimary") else themeColor("textOnSecondary")
	end
	local isPointer = function(input)
		return input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch
	end
	local _attributes = table.clone(themed(pieceName, k))
	setmetatable(_attributes, nil)
	_attributes.AutoButtonColor = false
	_attributes.Position = props.position
	_attributes.Size = props.size
	_attributes.ImageTransparency = fade
	_attributes.ZIndex = z
	_attributes.MouseEnter = function()
		hovered(true)
		local _result = props.onHover
		if _result ~= nil then
			_result(true)
		end
	end
	_attributes.MouseLeave = function()
		hovered(false)
		if pressed() then
			local _result = props.onUp
			if _result ~= nil then
				_result()
			end
		end
		pressed(false)
		local _result = props.onHover
		if _result ~= nil then
			_result(false)
		end
	end
	_attributes.InputBegan = function(input)
		if not isPointer(input) then
			return nil
		end
		pressed(true)
		local _result = props.onDown
		if _result ~= nil then
			_result()
		end
	end
	_attributes.InputEnded = function(input)
		if not isPointer(input) then
			return nil
		end
		if pressed() then
			local _result = props.onUp
			if _result ~= nil then
				_result()
			end
		end
		pressed(false)
	end
	_attributes.Activated = function()
		uiSound("click")
		props.onPress()
	end
	local _exp = Vide.jsx("uilistlayout", {
		FillDirection = "Horizontal",
		HorizontalAlignment = "Center",
		VerticalAlignment = "Center",
		SortOrder = "LayoutOrder",
		Padding = function()
			return UDim.new(0, 4 * k())
		end,
	})
	local _attributes_1 = table.clone(themed(function()
		local _result = props.icon
		if _result ~= nil then
			_result = _result()
		end
		local _condition_1 = _result
		if _condition_1 == nil then
			_condition_1 = "iconOk"
		end
		return _condition_1
	end, k))
	setmetatable(_attributes_1, nil)
	_attributes_1.LayoutOrder = 0
	_attributes_1.Visible = function()
		local _result = props.icon
		if _result ~= nil then
			_result = _result()
		end
		return _result ~= nil
	end
	_attributes_1.Size = function()
		local _result = props.icon
		if _result ~= nil then
			_result = _result()
		end
		local _condition_1 = _result
		if _condition_1 == nil then
			_condition_1 = "iconOk"
		end
		local size = pieceSize(_condition_1)
		return UDim2.fromOffset(size.X * k(), size.Y * k())
	end
	_attributes_1.ImageTransparency = fade
	_attributes_1.ZIndex = z + 2
	return Vide.jsx("imagebutton", _attributes, Vide.jsx("frame", {
		BackgroundTransparency = 1,
		Position = function()
			return UDim2.fromOffset(0, (if pressed() then metric("pressedOffset") else 0) * k())
		end,
		Size = UDim2.fromScale(1, 1),
		ZIndex = z + 1,
	}, _exp, Vide.jsx("imagelabel", _attributes_1), Vide.jsx("textlabel", {
		BackgroundTransparency = 1,
		LayoutOrder = 1,
		Visible = function()
			return props.text ~= nil
		end,
		AutomaticSize = "X",
		Size = function()
			return UDim2.fromOffset(0, 14 * k())
		end,
		FontFace = props.font or LABEL,
		Text = function()
			local _result = props.text
			if _result ~= nil then
				_result = _result()
			end
			local _condition_1 = _result
			if _condition_1 == nil then
				_condition_1 = ""
			end
			return _condition_1
		end,
		TextColor3 = ink,
		TextSize = function()
			local _condition_1 = props.textSize
			if _condition_1 == nil then
				_condition_1 = 5
			end
			return _condition_1 * k()
		end,
		TextTransparency = fade,
		ZIndex = z + 2,
	})))
end
return {
	screenScale = screenScale,
	art = art,
	sliced = sliced,
	px = px,
	place = place,
	PillButton = PillButton,
	Hints = Hints,
	ThemeButton = ThemeButton,
	INK = INK,
	WHITE = WHITE,
	CREAM = CREAM,
	CHOSEN = CHOSEN,
	PALE = PALE,
	PURPLE = PURPLE,
	CLAY_DARK = CLAY_DARK,
	SERIF = SERIF,
	LABEL = LABEL,
	BODY = BODY,
	DESIGN = DESIGN,
}
