-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local _vide = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "vide", "src")
local Vide = _vide
local cleanup = _vide.cleanup
local UserInputService = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services").UserInputService
local Graal = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "graal").Graal
local t = TS.import(script, script.Parent, "i18n").t
local _kit = TS.import(script, script.Parent, "kit")
local BODY = _kit.BODY
local LABEL = _kit.LABEL
local PillButton = _kit.PillButton
local place = _kit.place
local px = _kit.px
local SERIF = _kit.SERIF
local _theme = TS.import(script, script.Parent, "theme")
local themeColor = _theme.themeColor
local themed = _theme.themed
local MenuPanel = TS.import(script, script.Parent, "MenuPanel").MenuPanel
-- Nomes próprios: não se traduzem.
local GAME_NAME = "Haywood Valley"
local AUTHOR = "VitorPezzete"
--* Quem desenhou as cabeças e os corpos (os autores das peças) e quem assina os moldes dos corpos. 
local _array = {}
local _length = #_array
local _array_1 = Graal.authors
local _Length = #_array_1
table.move(_array_1, 1, _Length, _length + 1, _array)
_length += _Length
_array[_length + 1] = "Qwertzilla"
local CONTRIBUTORS = table.concat(_array, ", ")
local BUBBLE_PACK = "Cozy People Asset Pack"
local BUBBLE_ARTIST = "shubibubi"
-- Medidas em pixels de arte, dentro do painel.
local PANEL = Vector2.new(300, 214)
local PAGE = {
	x = 12,
	y = 26,
	w = 276,
	h = 156,
}
local BACK = {
	x = 232,
	y = 188,
	w = 56,
}
--* Estilo de cada linha: fonte, tamanho, cor e altura da caixa. 
local STYLES = {
	title = {
		font = SERIF,
		size = 12,
		color = "text",
		height = 14,
	},
	heading = {
		font = LABEL,
		size = 5,
		color = "accent",
		height = 7,
	},
	name = {
		font = BODY,
		size = 8,
		color = "text",
		height = 10,
	},
}
--* As linhas da página, de cima para baixo; `y` é a altura dentro do pergaminho e `lines`, quantas linhas a caixa tem. 
local LINES = { {
	y = 8,
	style = "title",
	text = function()
		return GAME_NAME
	end,
}, {
	y = 28,
	style = "heading",
	text = function()
		return t("credits.createdBy")
	end,
}, {
	y = 37,
	style = "name",
	text = function()
		return AUTHOR
	end,
}, {
	y = 55,
	style = "heading",
	text = function()
		return t("credits.characters")
	end,
}, {
	y = 64,
	style = "name",
	text = function()
		return CONTRIBUTORS
	end,
	lines = 2,
}, {
	y = 92,
	style = "heading",
	text = function()
		return t("credits.bubbles")
	end,
}, {
	y = 101,
	style = "name",
	text = function()
		return BUBBLE_PACK
	end,
}, {
	y = 111,
	style = "name",
	text = function()
		return t("credits.by", {
			author = BUBBLE_ARTIST,
		})
	end,
}, {
	y = 129,
	style = "heading",
	text = function()
		return t("credits.madeWith")
	end,
}, {
	y = 138,
	style = "name",
	text = function()
		return t("credits.tools")
	end,
} }
local HINTS = { {
	keys = { Enum.KeyCode.Backspace },
	label = "common.back",
} }
--* Créditos: quem fez o jogo e a arte de terceiros que ele usa, num pergaminho dentro do painel. 
local function CreditsPanel(_param)
	local k = _param.k
	local onClose = _param.onClose
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
		-- O Esc fica de fora: o Roblox abre o menu dele com essa tecla.
		if key == Enum.KeyCode.Backspace or key == Enum.KeyCode.Space or key == Enum.KeyCode.Return then
			onClose()
		end
	end))
	local _attributes = table.clone(themed("card", k))
	setmetatable(_attributes, nil)
	_attributes.Name = "Page"
	_attributes.Position = place(k, PAGE.x, PAGE.y)
	_attributes.Size = px(k, PAGE.w, PAGE.h)
	_attributes.ZIndex = 34
	-- ▼ ReadonlyArray.map ▼
	local _newValue = table.create(#LINES)
	local _callback = function(line)
		local style = STYLES[line.style]
		local _attributes_1 = {
			BackgroundTransparency = 1,
			Position = place(k, 6, line.y),
		}
		local _exp = PAGE.w - 12
		local _exp_1 = style.height
		local _condition = line.lines
		if _condition == nil then
			_condition = 1
		end
		_attributes_1.Size = px(k, _exp, _exp_1 * _condition)
		_attributes_1.FontFace = style.font
		_attributes_1.Text = line.text
		_attributes_1.TextWrapped = line.lines ~= nil
		_attributes_1.TextColor3 = function()
			return themeColor(style.color)
		end
		_attributes_1.TextSize = function()
			return style.size * k()
		end
		_attributes_1.ZIndex = 35
		return Vide.jsx("textlabel", _attributes_1)
	end
	for _k, _v in LINES do
		_newValue[_k] = _callback(_v, _k - 1, LINES)
	end
	-- ▲ ReadonlyArray.map ▲
	return Vide.jsx(MenuPanel, {
		k = k,
		title = function()
			return t("menu.credits")
		end,
		size = PANEL,
		hints = HINTS,
		onClose = onClose,
	}, Vide.jsx("imagelabel", _attributes, _newValue), Vide.jsx(PillButton, {
		k = k,
		text = function()
			return t("common.back")
		end,
		x = BACK.x,
		y = BACK.y,
		width = BACK.w,
		zIndex = 34,
		onPress = onClose,
	}))
end
return {
	CreditsPanel = CreditsPanel,
}
