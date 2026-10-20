-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local _vide = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "vide", "src")
local Vide = _vide
local action = _vide.action
local cleanup = _vide.cleanup
local source = _vide.source
local subscribe = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "charm", "src").subscribe
local UserInputService = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services").UserInputService
local LOCALE_NAMES = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "i18n", "locales").LOCALE_NAMES
local _settings = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "settings")
local DEFAULT_SETTINGS = _settings.DEFAULT_SETTINGS
local LANGUAGE_CHOICES = _settings.LANGUAGE_CHOICES
local TEXT_SPEED_ORDER = _settings.TEXT_SPEED_ORDER
local UI_THEMES = _settings.UI_THEMES
local VOLUME_STEP = _settings.VOLUME_STEP
local settings = TS.import(script, script.Parent.Parent, "state", "settings").settings
local _i18n = TS.import(script, script.Parent, "i18n")
local t = _i18n.t
local uiLocale = _i18n.uiLocale
local _kit = TS.import(script, script.Parent, "kit")
local BODY = _kit.BODY
local LABEL = _kit.LABEL
local PillButton = _kit.PillButton
local place = _kit.place
local px = _kit.px
local ThemeButton = _kit.ThemeButton
local MenuPanel = TS.import(script, script.Parent, "MenuPanel").MenuPanel
local _theme = TS.import(script, script.Parent, "theme")
local metric = _theme.metric
local pieceSize = _theme.pieceSize
local themeColor = _theme.themeColor
local themed = _theme.themed
-- Medidas em pixels de arte, dentro do painel.
local PANEL = Vector2.new(300, 210)
local ROW = {
	x = 12,
	y = 26,
	w = 276,
	h = 20,
	step = 24,
}
--* Onde começam os controles, dentro da linha. 
local CONTROL_X = 116
local ARROW_W = 20
local VALUE_W = 108
local TRACK = {
	w = 116,
	h = 12,
}
local HELP = {
	x = 12,
	y = 150,
	w = 276,
	h = 26,
}
local BUTTONS_Y = 184
local ROW_COUNT = 5
local ROW_LABELS = { "settings.language", "settings.music", "settings.effects", "settings.textSpeed", "settings.theme" }
local ROW_ABOUT = { "settings.about.language", "settings.about.music", "settings.about.effects", "settings.about.textSpeed", "settings.about.theme" }
local SPEED_TEXT = {
	slow = "textSpeed.slow",
	normal = "textSpeed.normal",
	fast = "textSpeed.fast",
	instant = "textSpeed.instant",
}
local THEME_TEXT = {
	celeiro = "theme.celeiro",
	graal = "theme.graal",
}
local HINTS = { {
	keys = { Enum.KeyCode.W, Enum.KeyCode.S },
	label = "hint.navigate",
}, {
	keys = { Enum.KeyCode.A, Enum.KeyCode.D },
	label = "hint.change",
}, {
	keys = { Enum.KeyCode.R },
	label = "hint.reset",
}, {
	keys = { Enum.KeyCode.Backspace },
	label = "common.back",
} }
--* O valor seguinte (ou anterior) de uma lista, dando a volta. 
local function cycle(list, value, direction)
	local size = #list
	local _exp = list
	local _list = list
	local _value = value
	return _exp[((table.find(_list, _value) or 0) - 1 + direction + size) % size + 1]
end
--* A linha que tem o volume `kind`. 
local function volumeRow(kind)
	return if kind == "music" then 1 else 2
end
--[[
	*
	 * Configurações: idioma, volume da música e dos efeitos, velocidade do texto e o tema da interface, no
	 * kit do tema em uso. Cada linha é um cartão com o nome à esquerda e o controle à direita (setas em
	 * volta do valor, ou barra), e o cursor do tema marca a linha em foco; embaixo, o que ela faz. W e S trocam de linha, A e D mudam o valor, R restaura o padrão e
	 * Backspace volta. Tudo aplica na hora. Não depende da tela de título, para um menu de pausa usar.
	 
]]
local function SettingsPanel(_param)
	local k = _param.k
	local onClose = _param.onClose
	-- O Vide lê `source`: este espelha o átomo das configurações.
	local current = source(settings())
	cleanup(subscribe(settings, function(value)
		return current(value)
	end))
	local focus = source(0)
	local change = function(patch)
		local _object = table.clone(settings())
		setmetatable(_object, nil)
		for _k, _v in patch do
			_object[_k] = _v
		end
		return settings(_object)
	end
	local step = function(row, direction)
		local now = settings()
		if row == 0 then
			change({
				language = cycle(LANGUAGE_CHOICES, now.language, direction),
			})
		elseif row == 1 then
			change({
				music = math.clamp(now.music + direction * VOLUME_STEP, 0, 100),
			})
		elseif row == 2 then
			change({
				effects = math.clamp(now.effects + direction * VOLUME_STEP, 0, 100),
			})
		elseif row == 3 then
			change({
				textSpeed = cycle(TEXT_SPEED_ORDER, now.textSpeed, direction),
			})
		elseif row == 4 then
			change({
				theme = cycle(UI_THEMES, now.theme, direction),
			})
		end
	end
	-- Sem pedir confirmação: são só cinco valores, todos à vista.
	local reset = function()
		return settings(DEFAULT_SETTINGS)
	end
	-- Arrastar uma barra com o mouse: qual volume e o trilho dele na tela.
	local dragging
	local dragTo = function(x)
		if not dragging then
			return nil
		end
		local _binding = dragging
		local kind = _binding.kind
		local track = _binding.track
		local inner = track.AbsoluteSize.X - 4 * k()
		local fraction = math.clamp((x - track.AbsolutePosition.X - 2 * k()) / math.max(inner, 1), 0, 1)
		if kind == "music" then
			change({
				music = math.round(fraction * 100),
			})
		else
			change({
				effects = math.round(fraction * 100),
			})
		end
	end
	-- A tecla que abriu o painel não conta.
	local armed = false
	task.defer(function()
		armed = true
	end)
	cleanup(UserInputService.InputBegan:Connect(function(input, processed)
		if processed or not armed then
			return nil
		end
		local key = input.KeyCode
		if key == Enum.KeyCode.W or key == Enum.KeyCode.Up then
			focus((focus() - 1 + ROW_COUNT) % ROW_COUNT)
		elseif key == Enum.KeyCode.S or key == Enum.KeyCode.Down then
			focus((focus() + 1) % ROW_COUNT)
		elseif key == Enum.KeyCode.A or key == Enum.KeyCode.Left then
			step(focus(), -1)
		elseif key == Enum.KeyCode.D or key == Enum.KeyCode.Right then
			step(focus(), 1)
		elseif key == Enum.KeyCode.Space or key == Enum.KeyCode.Return then
			-- Nas barras, Espaço não faz nada: o valor anda com A e D.
			if focus() == 0 or focus() == 3 or focus() == 4 then
				step(focus(), 1)
			end
		elseif key == Enum.KeyCode.R then
			reset()
		elseif key == Enum.KeyCode.Backspace then
			onClose()
		end
	end))
	cleanup(UserInputService.InputChanged:Connect(function(input)
		local kind = input.UserInputType
		if dragging and (kind == Enum.UserInputType.MouseMovement or kind == Enum.UserInputType.Touch) then
			dragTo(input.Position.X)
		end
	end))
	cleanup(UserInputService.InputEnded:Connect(function(input)
		local kind = input.UserInputType
		if kind == Enum.UserInputType.MouseButton1 or kind == Enum.UserInputType.Touch then
			dragging = nil
		end
	end))
	--* O texto do valor de uma linha com setas. 
	local valueText = function(row)
		if row == 0 then
			local choice = current().language
			return if choice == "auto" then t("language.auto") else LOCALE_NAMES[choice]
		end
		if row == 4 then
			return t(THEME_TEXT[current().theme])
		end
		return t(SPEED_TEXT[current().textSpeed])
	end
	--* Setas em volta do valor: clicar numa seta anda para um lado, clicar no valor anda para a frente. 
	local cycler = function(row)
		local press = function(direction)
			return function()
				focus(row)
				step(row, direction)
			end
		end
		local _exp = Vide.jsx(ThemeButton, {
			k = k,
			kind = "icon",
			position = place(k, CONTROL_X, 1),
			size = px(k, ARROW_W, 18),
			icon = function()
				return "iconBack"
			end,
			zIndex = 36,
			onPress = press(-1),
		})
		local _attributes = table.clone(themed("textField", k))
		setmetatable(_attributes, nil)
		_attributes.Name = "Value"
		_attributes.AutoButtonColor = false
		_attributes.Position = place(k, CONTROL_X + ARROW_W + 2, 1)
		_attributes.Size = px(k, VALUE_W, 18)
		_attributes.ZIndex = 36
		_attributes.Activated = press(1)
		return { _exp, Vide.jsx("imagebutton", _attributes, Vide.jsx("textlabel", {
			BackgroundTransparency = 1,
			Size = UDim2.fromScale(1, 1),
			FontFace = LABEL,
			Text = function()
				return valueText(row)
			end,
			TextColor3 = function()
				return themeColor("textOnField")
			end,
			TextSize = function()
				return 5 * k()
			end,
			ZIndex = 37,
		})), Vide.jsx(ThemeButton, {
			k = k,
			kind = "icon",
			position = place(k, CONTROL_X + ARROW_W + 2 + VALUE_W + 2, 1),
			size = px(k, ARROW_W, 18),
			icon = function()
				return "iconNext"
			end,
			zIndex = 36,
			onPress = press(1),
		}) }
	end
	--* Barra de volume, que anda com A e D ou arrastando. 
	local slider = function(kind)
		local value = function()
			return current()[kind]
		end
		local track
		local fill = function()
			-- O trilho do tema é claro: a parte cheia vai na cor de destaque até o meio do puxador, o resto
			-- na cor apagada.
			local f = math.clamp((2 + (value() / 100) * (TRACK.w - 4)) / TRACK.w, 0.001, 0.998)
			local full = themeColor("accent")
			local empty = themeColor("placeholder")
			return ColorSequence.new({ ColorSequenceKeypoint.new(0, full), ColorSequenceKeypoint.new(f, full), ColorSequenceKeypoint.new(f + 0.001, empty), ColorSequenceKeypoint.new(1, empty) })
		end
		local knob = function()
			return pieceSize("sliderKnob")
		end
		local _attributes = table.clone(themed("sliderTrack", k))
		setmetatable(_attributes, nil)
		_attributes.Name = "Track"
		_attributes.AutoButtonColor = false
		_attributes.Position = place(k, CONTROL_X, (ROW.h - TRACK.h) / 2)
		_attributes.Size = px(k, TRACK.w, TRACK.h)
		_attributes.ZIndex = 36
		_attributes.InputBegan = function(input)
			local inputType = input.UserInputType
			if track and (inputType == Enum.UserInputType.MouseButton1 or inputType == Enum.UserInputType.Touch) then
				focus(volumeRow(kind))
				dragging = {
					kind = kind,
					track = track,
				}
				dragTo(input.Position.X)
			end
		end
		local _exp = Vide.jsx("imagebutton", _attributes, action(function(instance)
			track = instance
		end), Vide.jsx("uigradient", {
			Color = fill,
		}))
		local _attributes_1 = table.clone(themed("sliderKnob", k))
		setmetatable(_attributes_1, nil)
		_attributes_1.Name = "Knob"
		_attributes_1.AnchorPoint = Vector2.new(0.5, 0.5)
		_attributes_1.Position = function()
			return UDim2.fromOffset(math.round(CONTROL_X + 2 + (value() / 100) * (TRACK.w - 4)) * k(), (ROW.h / 2) * k())
		end
		_attributes_1.Size = function()
			return UDim2.fromOffset(knob().X * k(), knob().Y * k())
		end
		_attributes_1.ZIndex = 37
		return { _exp, Vide.jsx("imagelabel", _attributes_1), Vide.jsx("textlabel", {
			BackgroundTransparency = 1,
			Position = place(k, CONTROL_X + TRACK.w + 4, 0),
			Size = px(k, 32, ROW.h),
			FontFace = LABEL,
			Text = function()
				return `{value()}%`
			end,
			TextColor3 = function()
				return themeColor("text")
			end,
			TextSize = function()
				return 5 * k()
			end,
			TextXAlignment = "Right",
			ZIndex = 36,
		}) }
	end
	local row = function(label, index)
		local _attributes = table.clone(themed("card", k))
		setmetatable(_attributes, nil)
		_attributes.Name = `Row{index}`
		_attributes.Position = place(k, ROW.x, ROW.y + index * ROW.step)
		_attributes.Size = px(k, ROW.w, ROW.h)
		_attributes.ZIndex = 34
		_attributes.MouseEnter = function()
			return focus(index)
		end
		return Vide.jsx("imagelabel", _attributes, Vide.jsx("textlabel", {
			BackgroundTransparency = 1,
			Position = place(k, 8, 0),
			Size = px(k, CONTROL_X - 12, ROW.h),
			FontFace = LABEL,
			Text = function()
				return t(label)
			end,
			TextColor3 = function()
				return themeColor("text")
			end,
			TextSize = function()
				return 5 * k()
			end,
			TextXAlignment = "Left",
			ZIndex = 35,
		}), if index == 1 then slider("music") elseif index == 2 then slider("effects") else cycler(index))
	end
	--* O que a linha em foco faz; no idioma automático, também o idioma que ele escolheu. 
	local about = function()
		if focus() == 0 and current().language == "auto" then
			return t("settings.about.languageAuto", {
				language = LOCALE_NAMES[uiLocale()],
			})
		end
		return t(ROW_ABOUT[focus() + 1])
	end
	-- ▼ ReadonlyArray.map ▼
	local _newValue = table.create(#ROW_LABELS)
	for _k, _v in ROW_LABELS do
		_newValue[_k] = row(_v, _k - 1, ROW_LABELS)
	end
	-- ▲ ReadonlyArray.map ▲
	local _attributes = table.clone(themed("cursor", k))
	setmetatable(_attributes, nil)
	_attributes.Name = "Focus"
	_attributes.Position = function()
		local out = metric("cursorOutset")
		return UDim2.fromOffset((ROW.x - out) * k(), (ROW.y - out + focus() * ROW.step) * k())
	end
	_attributes.Size = function()
		local out = metric("cursorOutset")
		return UDim2.fromOffset((ROW.w + out * 2) * k(), (ROW.h + out * 2) * k())
	end
	_attributes.ZIndex = 38
	local _exp = Vide.jsx("imagelabel", _attributes)
	local _attributes_1 = table.clone(themed("well", k))
	setmetatable(_attributes_1, nil)
	_attributes_1.Name = "Help"
	_attributes_1.Position = place(k, HELP.x, HELP.y)
	_attributes_1.Size = px(k, HELP.w, HELP.h)
	_attributes_1.ZIndex = 34
	return Vide.jsx(MenuPanel, {
		k = k,
		title = function()
			return t("menu.settings")
		end,
		size = PANEL,
		hints = HINTS,
		onClose = onClose,
	}, _newValue, _exp, Vide.jsx("imagelabel", _attributes_1, Vide.jsx("textlabel", {
		BackgroundTransparency = 1,
		Position = place(k, 6, 4),
		Size = px(k, HELP.w - 12, HELP.h - 8),
		FontFace = BODY,
		Text = about,
		TextColor3 = function()
			return themeColor("text")
		end,
		TextSize = function()
			return 8 * k()
		end,
		TextWrapped = true,
		TextXAlignment = "Left",
		TextYAlignment = "Center",
		ZIndex = 35,
	})), Vide.jsx(PillButton, {
		k = k,
		text = function()
			return t("settings.defaults")
		end,
		x = HELP.x,
		y = BUTTONS_Y,
		width = 110,
		zIndex = 34,
		onPress = reset,
	}), Vide.jsx(PillButton, {
		k = k,
		text = function()
			return t("common.back")
		end,
		x = PANEL.X - HELP.x - 56,
		y = BUTTONS_Y,
		width = 56,
		zIndex = 34,
		onPress = onClose,
	}))
end
return {
	SettingsPanel = SettingsPanel,
}
