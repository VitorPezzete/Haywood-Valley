-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local _vide = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "vide", "src")
local Vide = _vide
local cleanup = _vide.cleanup
local UserInputService = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services").UserInputService
local t = TS.import(script, script.Parent, "i18n").t
local _kit = TS.import(script, script.Parent, "kit")
local Hints = _kit.Hints
local px = _kit.px
local screenScale = _kit.screenScale
local ThemeButton = _kit.ThemeButton
--* O botão de ação na tela de toque, em pixels de arte: largura, altura e a folga da borda da direita e de baixo. 
local BUTTON = Vector2.new(100, 22)
local BUTTON_MARGIN = Vector2.new(10, 58)
--[[
	*
	 * A ação do boneco na tela (`ActionController`): no teclado, a dica com a tecla F e o que ela faz, no canto de
	 * baixo à direita; na tela de toque, um botão do kit do tema, acima do canto onde o Roblox põe o pulo, que vale
	 * enquanto fica apertado (segurar o móvel). Os dois só aparecem quando há o que fazer.
	 
]]
local function ActionHud(_param)
	local prompt = _param.prompt
	local visible = _param.visible
	local onDown = _param.onDown
	local onUp = _param.onUp
	local _binding = screenScale()
	local k = _binding.k
	local shown = function()
		return visible() and prompt() ~= nil
	end
	local label = function()
		return prompt() or "action.grab"
	end
	local gui = (Vide.jsx("screengui", {
		Name = "ActionHud",
		IgnoreGuiInset = true,
		ResetOnSpawn = false,
		DisplayOrder = 40,
		AutoLocalize = false,
	}, Vide.jsx("frame", {
		Name = "Keys",
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Visible = function()
			return shown() and UserInputService.KeyboardEnabled
		end,
	}, Vide.jsx(Hints, {
		k = k,
		hints = { {
			keys = { Enum.KeyCode.F },
			label = label,
		} },
	})), Vide.jsx("frame", {
		Name = "Touch",
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Visible = function()
			return shown() and UserInputService.TouchEnabled
		end,
	}, Vide.jsx(ThemeButton, {
		k = k,
		kind = "primary",
		position = function()
			return UDim2.new(1, -(BUTTON.X + BUTTON_MARGIN.X) * k(), 1, -(BUTTON.Y + BUTTON_MARGIN.Y) * k())
		end,
		size = px(k, BUTTON.X, BUTTON.Y),
		text = function()
			return t(label())
		end,
		onPress = function() end,
		onDown = onDown,
		onUp = onUp,
	}))))
	cleanup(gui)
	return gui
end
return {
	ActionHud = ActionHud,
}
