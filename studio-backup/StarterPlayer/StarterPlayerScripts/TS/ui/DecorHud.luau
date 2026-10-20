-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local _vide = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "vide", "src")
local Vide = _vide
local cleanup = _vide.cleanup
local _decor = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "decor")
local decorItem = _decor.decorItem
local DECOR_ORDER = _decor.DECOR_ORDER
local sheetRect = TS.import(script, script.Parent.Parent, "world", "interior").sheetRect
local t = TS.import(script, script.Parent, "i18n").t
local _kit = TS.import(script, script.Parent, "kit")
local BODY = _kit.BODY
local Hints = _kit.Hints
local LABEL = _kit.LABEL
local px = _kit.px
local screenScale = _kit.screenScale
local ThemeButton = _kit.ThemeButton
local _theme = TS.import(script, script.Parent, "theme")
local themeColor = _theme.themeColor
local themed = _theme.themed
--* O painel aberto do Decorar, em pixels de arte: canto, altura e a folga de baixo; cada vaga do inventário e o espaço entre elas. 
local PANEL = {
	x = 8,
	height = 72,
	bottom = 8,
	pad = 6,
}
local SLOT = 28
local SLOT_GAP = 2
local ICON = 22
local PANEL_WIDTH = PANEL.pad * 2 + #DECOR_ORDER * (SLOT + SLOT_GAP) - SLOT_GAP
--* A fileira recolhida: cada ícone (e cada botão de ícone do kit), o espaço entre eles e a folga em volta. 
local STRIP = {
	cell = 20,
	gap = 2,
	pad = 4,
	bottom = 8,
}
local STRIP_BUTTONS = 4
local STRIP_WIDTH = STRIP.pad * 2 + (#DECOR_ORDER + STRIP_BUTTONS) * (STRIP.cell + STRIP.gap) - STRIP.gap
local STRIP_HEIGHT = STRIP.cell + STRIP.pad * 2
--* Os botões em cima do painel aberto (girar, guardar, pronto) e o botão Decorar no canto de cima à direita. 
local BUTTON = Vector2.new(64, 18)
local OPEN_BUTTON = Vector2.new(72, 20)
--* O botão de recolher, no canto de cima à direita do painel aberto. 
local COLLAPSE = 20
--* O texto de baixo do painel: o que fazer, ou por que a peça não cabe. 
--* O texto do aviso, traduzido: as chaves de dentro (a peça, o fundo pedido, o que tem embaixo) também. 
local function statusText(status)
	local _exp = status.key
	local _object = {
		piece = if status.piece then t(status.piece) else "",
	}
	local _left = "wanted"
	local _exp_1 = (status.wanted or {})
	-- ▼ ReadonlyArray.map ▼
	local _newValue = table.create(#_exp_1)
	local _callback = function(key)
		return t(key)
	end
	for _k, _v in _exp_1 do
		_newValue[_k] = _callback(_v, _k - 1, _exp_1)
	end
	-- ▲ ReadonlyArray.map ▲
	_object[_left] = table.concat(_newValue, ", ")
	_object.found = if status.found then t(status.found) else ""
	return t(_exp, _object)
end
--* Posição em pixels de arte dentro de um quadro. 
local function at(k, x, y)
	return function()
		return UDim2.fromOffset(x * k(), y * k())
	end
end
--* A vaga de uma peça do inventário: o ícone recortado da folha (apagado quando acabou) e, no painel aberto, quantas sobram. 
local function Slot(props, k, id, x, y, size, icon, count)
	local item = decorItem(id)
	local _binding = item.icon
	local col = _binding[1]
	local row = _binding[2]
	local w = _binding[3]
	local h = _binding[4]
	local art = sheetRect({ item.sheet, col, row }, w, h)
	local left = function()
		local _exp = props.stock()
		local _id = id
		local _condition = _exp[_id]
		if _condition == nil then
			_condition = 0
		end
		return _condition
	end
	local _attributes = table.clone(themed(function()
		return if props.chosen() == id then "cellChosen" else "cell"
	end, k))
	setmetatable(_attributes, nil)
	_attributes.Name = `Slot_{id}`
	_attributes.AutoButtonColor = false
	_attributes.Position = at(k, x, y)
	_attributes.Size = px(k, size, size)
	_attributes.ZIndex = 21
	_attributes.Activated = function()
		return props.onChoose(id)
	end
	return Vide.jsx("imagebutton", _attributes, Vide.jsx("imagelabel", {
		BackgroundTransparency = 1,
		Image = art.image,
		ImageRectOffset = art.offset,
		ImageRectSize = art.size,
		ResampleMode = Enum.ResamplerMode.Pixelated,
		ScaleType = Enum.ScaleType.Fit,
		ImageTransparency = function()
			return if left() > 0 then 0 else 0.6
		end,
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = px(k, icon, icon),
		ZIndex = 22,
	}), if count then (Vide.jsx("textlabel", {
		BackgroundTransparency = 1,
		AnchorPoint = Vector2.new(1, 1),
		Position = function()
			return UDim2.new(1, -2 * k(), 1, -1 * k())
		end,
		Size = px(k, 20, 7),
		FontFace = LABEL,
		Text = function()
			return `x{left()}`
		end,
		TextXAlignment = "Right",
		TextColor3 = function()
			return themeColor("text")
		end,
		TextSize = function()
			return 5 * k()
		end,
		ZIndex = 23,
	})) else nil)
end
--[[
	*
	 * A interface do Decorar (`DecorController`), no kit do tema: o botão Decorar no canto de cima à direita (só na
	 * própria casa) e, com o modo ligado, o painel embaixo à esquerda. Aberto: as peças do inventário de teste (o
	 * ícone recortado da folha e quantas sobram), o aviso (cabe, ou o motivo da recusa), os botões Girar, Guardar e
	 * Pronto e o de recolher; no teclado, as dicas com as teclas no canto. Recolhido (o padrão no celular, pedido do
	 * usuário em 2026-10-18): uma fileira de ícones com as peças e os botões de ícone girar, guardar, pronto e abrir, e
	 * o aviso numa linha em cima dela; tocar no botão de abrir mostra o painel inteiro.
	 
]]
local function DecorHud(props)
	local _binding = screenScale()
	local k = _binding.k
	local iconButton = function(index, icon, onPress)
		return Vide.jsx(ThemeButton, {
			k = k,
			kind = "icon",
			position = at(k, STRIP.pad + (#DECOR_ORDER + index) * (STRIP.cell + STRIP.gap), STRIP.pad),
			size = px(k, STRIP.cell, STRIP.cell),
			icon = function()
				return icon
			end,
			zIndex = 21,
			onPress = onPress,
		})
	end
	local _exp = Vide.jsx("frame", {
		Name = "Open",
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Visible = function()
			return props.available() and not props.active()
		end,
	}, Vide.jsx(ThemeButton, {
		k = k,
		kind = "secondary",
		position = function()
			return UDim2.new(1, -(OPEN_BUTTON.X + 8) * k(), 0, 8 * k())
		end,
		size = px(k, OPEN_BUTTON.X, OPEN_BUTTON.Y),
		text = function()
			return t("decor.button")
		end,
		onPress = props.onToggle,
	}))
	local _attributes = table.clone(themed("panel", k))
	setmetatable(_attributes, nil)
	_attributes.Name = "Panel"
	_attributes.Position = function()
		return UDim2.new(0, PANEL.x * k(), 1, -(PANEL.bottom + PANEL.height) * k())
	end
	_attributes.Size = px(k, PANEL_WIDTH, PANEL.height)
	_attributes.Active = true
	_attributes.ZIndex = 20
	local _attributes_1 = table.clone(themed("titleBar", k))
	setmetatable(_attributes_1, nil)
	_attributes_1.Position = at(k, 0, -6)
	_attributes_1.Size = px(k, 96, 14)
	_attributes_1.ZIndex = 21
	local _exp_1 = Vide.jsx("imagelabel", _attributes_1, Vide.jsx("textlabel", {
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		FontFace = LABEL,
		Text = function()
			return t("decor.title")
		end,
		TextColor3 = function()
			return themeColor("textOnTitle")
		end,
		TextSize = function()
			return 6 * k()
		end,
		ZIndex = 22,
	}))
	local _exp_2 = Vide.jsx(ThemeButton, {
		k = k,
		kind = "icon",
		position = at(k, PANEL_WIDTH - COLLAPSE - 2, -8),
		size = px(k, COLLAPSE, COLLAPSE),
		icon = function()
			return "iconDropdown"
		end,
		zIndex = 22,
		onPress = function()
			return props.onCollapse(true)
		end,
	})
	-- ▼ ReadonlyArray.map ▼
	local _newValue = table.create(#DECOR_ORDER)
	local _callback = function(id, index)
		return Slot(props, k, id, PANEL.pad + index * (SLOT + SLOT_GAP), 12, SLOT, ICON, true)
	end
	for _k, _v in DECOR_ORDER do
		_newValue[_k] = _callback(_v, _k - 1, DECOR_ORDER)
	end
	-- ▲ ReadonlyArray.map ▲
	local _exp_3 = Vide.jsx("imagelabel", _attributes, _exp_1, _exp_2, _newValue, Vide.jsx("textlabel", {
		Name = "Status",
		BackgroundTransparency = 1,
		Position = at(k, 8, 45),
		Size = px(k, PANEL_WIDTH - 16, 22),
		FontFace = BODY,
		Text = function()
			return statusText(props.status())
		end,
		TextWrapped = true,
		TextXAlignment = "Left",
		TextYAlignment = "Top",
		TextColor3 = function()
			return themeColor("text")
		end,
		TextSize = function()
			return 7 * k()
		end,
		ZIndex = 21,
	}))
	local _exp_4 = { { "decor.hint.rotate", props.onRotate, "secondary" }, { "decor.hint.store", props.onStore, "secondary" }, { "decor.hint.exit", props.onToggle, "primary" } }
	-- ▼ ReadonlyArray.map ▼
	local _newValue_1 = table.create(#_exp_4)
	local _callback_1 = function(_param, index)
		local label = _param[1]
		local onPress = _param[2]
		local kind = _param[3]
		return Vide.jsx(ThemeButton, {
			k = k,
			kind = kind,
			position = function()
				return UDim2.new(0, (PANEL.x + index * (BUTTON.X + 4)) * k(), 1, -(PANEL.bottom + PANEL.height + BUTTON.Y + 10) * k())
			end,
			size = px(k, BUTTON.X, BUTTON.Y),
			text = function()
				return t(label)
			end,
			onPress = onPress,
		})
	end
	for _k, _v in _exp_4 do
		_newValue_1[_k] = _callback_1(_v, _k - 1, _exp_4)
	end
	-- ▲ ReadonlyArray.map ▲
	local _exp_5 = Vide.jsx("frame", {
		Name = "Mode",
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Visible = function()
			return props.active() and not props.collapsed()
		end,
	}, _exp_3, _newValue_1, Vide.jsx(Hints, {
		k = k,
		hints = { {
			keys = { Enum.KeyCode.R },
			label = "decor.hint.rotate",
		}, {
			keys = { Enum.KeyCode.X },
			label = "decor.hint.store",
		}, {
			keys = { Enum.KeyCode.B },
			label = "decor.hint.exit",
		} },
	}))
	local _attributes_2 = table.clone(themed("panel", k))
	setmetatable(_attributes_2, nil)
	_attributes_2.Name = "Row"
	_attributes_2.Position = function()
		return UDim2.new(0, PANEL.x * k(), 1, -(STRIP.bottom + STRIP_HEIGHT) * k())
	end
	_attributes_2.Size = px(k, STRIP_WIDTH, STRIP_HEIGHT)
	_attributes_2.Active = true
	_attributes_2.ZIndex = 20
	-- ▼ ReadonlyArray.map ▼
	local _newValue_2 = table.create(#DECOR_ORDER)
	local _callback_2 = function(id, index)
		return Slot(props, k, id, STRIP.pad + index * (STRIP.cell + STRIP.gap), STRIP.pad, STRIP.cell, 16, false)
	end
	for _k, _v in DECOR_ORDER do
		_newValue_2[_k] = _callback_2(_v, _k - 1, DECOR_ORDER)
	end
	-- ▲ ReadonlyArray.map ▲
	local _exp_6 = Vide.jsx("imagelabel", _attributes_2, _newValue_2, iconButton(0, "iconRotateRight", props.onRotate), iconButton(1, "iconChest", props.onStore), iconButton(2, "iconOk", props.onToggle), iconButton(3, "iconNext", function()
		return props.onCollapse(false)
	end))
	local _attributes_3 = table.clone(themed("tooltip", k))
	setmetatable(_attributes_3, nil)
	_attributes_3.Name = "Line"
	_attributes_3.Position = function()
		return UDim2.new(0, PANEL.x * k(), 1, -(STRIP.bottom + STRIP_HEIGHT + 16) * k())
	end
	_attributes_3.Size = px(k, 0, 14)
	_attributes_3.AutomaticSize = "X"
	_attributes_3.ZIndex = 20
	local gui = (Vide.jsx("screengui", {
		Name = "DecorHud",
		ResetOnSpawn = false,
		DisplayOrder = 42,
		AutoLocalize = false,
		IgnoreGuiInset = false,
	}, _exp, _exp_5, Vide.jsx("frame", {
		Name = "Strip",
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Visible = function()
			return props.active() and props.collapsed()
		end,
	}, _exp_6, Vide.jsx("imagelabel", _attributes_3, Vide.jsx("uipadding", {
		PaddingLeft = function()
			return UDim.new(0, 5 * k())
		end,
		PaddingRight = function()
			return UDim.new(0, 5 * k())
		end,
	}), Vide.jsx("textlabel", {
		BackgroundTransparency = 1,
		AutomaticSize = "X",
		Size = function()
			return UDim2.new(0, 0, 1, 0)
		end,
		FontFace = BODY,
		Text = function()
			return statusText(props.status())
		end,
		TextColor3 = function()
			return themeColor("text")
		end,
		TextSize = function()
			return 7 * k()
		end,
		ZIndex = 21,
	})))))
	cleanup(gui)
	return gui
end
return {
	statusText = statusText,
	DecorHud = DecorHud,
}
