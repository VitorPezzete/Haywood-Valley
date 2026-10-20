-- Monta o ScreenGui: fundo, contêiner do mundo (com as camadas do mapa) e o HUD.
-- Hierarquia do mundo: World (posição = origem da câmera) > Scaled (UIScale = zoom) > camadas.
-- Tudo dentro de Scaled é posicionado em pixels do mundo.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local World = require(ReplicatedStorage.Config.World)

local OUTLINE = Color3.fromHex("3E2218")
local WOOD = Color3.fromHex("A0622F")
local WATER = Color3.fromHex("2F6FB0")
local FONT = Font.fromEnum(Enum.Font.FredokaOne)
local DEFAULT_HINT = "Arraste para mover  •  Role para zoom  •  Na sua fazenda, clique para arar, plantar e colher"
local TOAST_SECONDS = 1.6

local UIController = {}

local wheatLabel: TextLabel
local xpLabel: TextLabel
local hintLabel: TextLabel
local debugLabel: TextLabel
local toastLabel: TextLabel
local toastToken = 0

local function layer(parent: Instance, name: string, zIndex: number): Frame
	local frame = Instance.new("Frame")
	frame.Name = name
	frame.BackgroundTransparency = 1
	frame.Size = UDim2.fromScale(1, 1)
	frame.ZIndex = zIndex
	frame.Parent = parent
	return frame
end

local function text(parent: Instance, name: string, size: number): TextLabel
	local label = Instance.new("TextLabel")
	label.Name = name
	label.BackgroundTransparency = 1
	label.FontFace = FONT
	label.TextSize = size
	label.TextColor3 = Color3.new(1, 1, 1)
	label.TextStrokeColor3 = OUTLINE
	label.TextStrokeTransparency = 0
	label.Parent = parent
	return label
end

-- Contorno feito de quatro Frames: acompanha o tamanho do alvo e escala junto com o zoom.
function UIController.addBorder(target: GuiObject, thickness: number, color: Color3): { Frame }
	local sides = {
		{ UDim2.new(1, thickness * 2, 0, thickness), UDim2.fromOffset(-thickness, -thickness) },
		{ UDim2.new(1, thickness * 2, 0, thickness), UDim2.new(0, -thickness, 1, 0) },
		{ UDim2.new(0, thickness, 1, 0), UDim2.fromOffset(-thickness, 0) },
		{ UDim2.new(0, thickness, 1, 0), UDim2.fromScale(1, 0) },
	}
	local frames = {}
	for _, side in sides do
		local frame = Instance.new("Frame")
		frame.Name = "Border"
		frame.BorderSizePixel = 0
		frame.BackgroundColor3 = color
		frame.Size = side[1]
		frame.Position = side[2]
		frame.Parent = target
		table.insert(frames, frame)
	end
	return frames
end

function UIController.init()
	local gui = Instance.new("ScreenGui")
	gui.Name = "HaystackValley"
	gui.IgnoreGuiInset = true
	gui.ResetOnSpawn = false
	gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling

	local background = Instance.new("Frame")
	background.Name = "Background"
	background.BorderSizePixel = 0
	background.BackgroundColor3 = WATER
	background.Size = UDim2.fromScale(1, 1)
	background.Parent = gui

	local root = Instance.new("Frame")
	root.Name = "World"
	root.BackgroundTransparency = 1
	root.Size = UDim2.fromOffset(0, 0)
	root.ZIndex = 2
	root.Parent = gui

	local worldPx = World.WORLD_TILES * World.TILE_SIZE
	local scaled = Instance.new("Frame")
	scaled.Name = "Scaled"
	scaled.BackgroundTransparency = 1
	scaled.Size = UDim2.fromOffset(worldPx, worldPx)
	scaled.Parent = root

	local scale = Instance.new("UIScale")
	scale.Parent = scaled

	local effects = layer(scaled, "Effects", 5)
	local hover = Instance.new("Frame")
	hover.Name = "Hover"
	hover.BackgroundColor3 = Color3.new(1, 1, 1)
	hover.BackgroundTransparency = 0.8
	hover.BorderSizePixel = 0
	hover.Size = UDim2.fromOffset(World.TILE_SIZE, World.TILE_SIZE)
	hover.Visible = false
	hover.Parent = effects
	UIController.addBorder(hover, 3, Color3.new(1, 1, 1))

	local hud = layer(gui, "HUD", 10)

	local panel = Instance.new("Frame")
	panel.Name = "Stats"
	panel.BackgroundColor3 = WOOD
	panel.Position = UDim2.fromOffset(16, 68)
	panel.Size = UDim2.fromOffset(190, 84)
	panel.Parent = hud
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 8)
	corner.Parent = panel
	local stroke = Instance.new("UIStroke")
	stroke.Color = OUTLINE
	stroke.Thickness = 3
	stroke.Parent = panel

	wheatLabel = text(panel, "Wheat", 26)
	wheatLabel.TextXAlignment = Enum.TextXAlignment.Left
	wheatLabel.Position = UDim2.fromOffset(14, 8)
	wheatLabel.Size = UDim2.new(1, -28, 0, 32)

	xpLabel = text(panel, "XP", 26)
	xpLabel.TextXAlignment = Enum.TextXAlignment.Left
	xpLabel.Position = UDim2.fromOffset(14, 44)
	xpLabel.Size = UDim2.new(1, -28, 0, 32)

	hintLabel = text(hud, "Hint", 20)
	hintLabel.AnchorPoint = Vector2.new(0.5, 1)
	hintLabel.Position = UDim2.new(0.5, 0, 1, -16)
	hintLabel.Size = UDim2.new(1, -32, 0, 30)
	hintLabel.Text = DEFAULT_HINT

	toastLabel = text(hud, "Toast", 28)
	toastLabel.AnchorPoint = Vector2.new(0.5, 0)
	toastLabel.Position = UDim2.new(0.5, 0, 0, 110)
	toastLabel.Size = UDim2.new(1, -32, 0, 40)
	toastLabel.TextColor3 = Color3.fromHex("FFD968")
	toastLabel.Visible = false

	debugLabel = text(hud, "Debug", 16)
	debugLabel.AnchorPoint = Vector2.new(1, 0)
	debugLabel.Position = UDim2.new(1, -16, 0, 68)
	debugLabel.Size = UDim2.fromOffset(320, 22)
	debugLabel.TextXAlignment = Enum.TextXAlignment.Right

	UIController.setStats(nil)
	gui.Parent = Players.LocalPlayer:WaitForChild("PlayerGui")

	return {
		root = root,
		scale = scale,
		terrain = layer(scaled, "Terrain", 1),
		markers = layer(scaled, "Markers", 2),
		cover = layer(scaled, "Cover", 3),
		objects = layer(scaled, "Objects", 4),
		hover = hover,
	}
end

function UIController.setStats(stats)
	local wheat = stats and stats.inventory.wheat or 0
	wheatLabel.Text = `Trigo: {wheat}`
	xpLabel.Text = `XP: {stats and stats.xp or 0}`
end

-- `nil` volta para a dica padrão.
function UIController.setHint(message: string?)
	hintLabel.Text = message or DEFAULT_HINT
end

function UIController.setDebug(message: string)
	debugLabel.Text = message
end

function UIController.toast(message: string)
	toastToken += 1
	local token = toastToken
	toastLabel.Text = message
	toastLabel.Visible = true
	task.delay(TOAST_SECONDS, function()
		if token == toastToken then
			toastLabel.Visible = false
		end
	end)
end

return UIController
