-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local _vide = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "vide", "src")
local Vide = _vide
local cleanup = _vide.cleanup
local Show = _vide.Show
local source = _vide.source
local RunService = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services").RunService
local _kit = TS.import(script, script.Parent, "kit")
local BODY = _kit.BODY
local LABEL = _kit.LABEL
local px = _kit.px
local screenScale = _kit.screenScale
local _theme = TS.import(script, script.Parent, "theme")
local themeColor = _theme.themeColor
local themed = _theme.themed
-- Medidas em pixels de arte.
local BOX = Vector2.new(420, 64)
local MARGIN_BOTTOM = 14
--* A plaquinha do nome: altura e largura mínima; ela cresce com o nome. 
local NAME_TAG = Vector2.new(40, 13)
--* Caixa de diálogo no kit do tema: embaixo da tela, fala letra a letra e a plaquinha com o nome de quem fala. 
local function DialogueBox(_param)
	local line = _param.line
	local shown = _param.shown
	local waiting = _param.waiting
	local _binding = screenScale()
	local k = _binding.k
	local clock = source(os.clock())
	cleanup(RunService.RenderStepped:Connect(function()
		return clock(os.clock())
	end))
	return Vide.jsx("screengui", {
		Name = "Dialogue",
		IgnoreGuiInset = true,
		ResetOnSpawn = false,
		DisplayOrder = 50,
		AutoLocalize = false,
	}, Vide.jsx(Show, {
		when = function()
			return line() ~= nil
		end,
	}, function()
		local _attributes = table.clone(themed("dialog", k))
		setmetatable(_attributes, nil)
		_attributes.Name = "Box"
		_attributes.AnchorPoint = Vector2.new(0.5, 1)
		_attributes.Position = function()
			return UDim2.new(0.5, 0, 1, -MARGIN_BOTTOM * k())
		end
		_attributes.Size = px(k, BOX.X, BOX.Y)
		local _exp = Vide.jsx("textlabel", {
			Name = "Text",
			BackgroundTransparency = 1,
			Position = function()
				return UDim2.fromOffset(12 * k(), 11 * k())
			end,
			Size = function()
				return UDim2.new(1, -24 * k(), 1, -24 * k())
			end,
			FontFace = BODY,
			Text = function()
				local _result = line()
				if _result ~= nil then
					_result = _result.text()
				end
				local _condition = _result
				if _condition == nil then
					_condition = ""
				end
				return _condition
			end,
			MaxVisibleGraphemes = shown,
			TextColor3 = function()
				return themeColor("text")
			end,
			TextSize = function()
				return 9 * k()
			end,
			TextWrapped = true,
			TextXAlignment = "Left",
			TextYAlignment = "Top",
			LineHeight = 1.25,
		})
		local _exp_1 = Vide.jsx("textlabel", {
			Name = "More",
			BackgroundTransparency = 1,
			AnchorPoint = Vector2.new(0, 1),
			Position = function()
				return UDim2.new(0, 12 * k(), 1, -5 * k())
			end,
			AutomaticSize = "XY",
			FontFace = LABEL,
			Text = "▼",
			TextColor3 = function()
				return themeColor("accent")
			end,
			TextSize = function()
				return 5 * k()
			end,
			TextTransparency = function()
				return if waiting() and clock() % 0.8 < 0.5 then 0.2 else 1
			end,
		})
		local _attributes_1 = table.clone(themed("nameTag", k))
		setmetatable(_attributes_1, nil)
		_attributes_1.Name = "Name"
		_attributes_1.AnchorPoint = Vector2.new(0, 0.5)
		_attributes_1.Position = function()
			return UDim2.fromOffset(10 * k(), 0)
		end
		_attributes_1.Size = px(k, NAME_TAG.X, NAME_TAG.Y)
		_attributes_1.AutomaticSize = "X"
		_attributes_1.ZIndex = 2
		return Vide.jsx("imagelabel", _attributes, _exp, _exp_1, Vide.jsx("imagelabel", _attributes_1, Vide.jsx("uipadding", {
			PaddingLeft = function()
				return UDim.new(0, 10 * k())
			end,
			PaddingRight = function()
				return UDim.new(0, 6 * k())
			end,
		}), Vide.jsx("textlabel", {
			BackgroundTransparency = 1,
			Size = function()
				return UDim2.new(0, 0, 1, 0)
			end,
			AutomaticSize = "X",
			FontFace = LABEL,
			Text = function()
				local _result = line()
				if _result ~= nil then
					_result = _result.name()
				end
				local _condition = _result
				if _condition == nil then
					_condition = ""
				end
				return _condition
			end,
			TextColor3 = function()
				return themeColor("textOnTitle")
			end,
			TextSize = function()
				return 6 * k()
			end,
			ZIndex = 3,
		})))
	end))
end
return {
	DialogueBox = DialogueBox,
}
