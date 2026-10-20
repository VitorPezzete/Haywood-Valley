-- A tela preta da abertura (fase 1 do PLANO_OTIMIZACAO.md, item 7). Roda em ReplicatedFirst, antes de tudo, para
-- a tela de carregar padrão do Roblox não aparecer enquanto o jogo e o Flamework sobem: tira a do Roblox e põe o
-- preto com a logo pequena no meio, ampliada por inteiro como a interface. O StartController a tira quando a
-- tela de carregar do jogo já está montada (OPENING_GUI em client/ui/opening.ts); se nada a tirar, ela some
-- sozinha depois de FALLBACK_SECONDS. Fica em Luau (não em TypeScript) porque o roblox-ts não compila para
-- ReplicatedFirst e este script não pode depender de nada que ainda não chegou.

local Players = game:GetService("Players")
local ReplicatedFirst = game:GetService("ReplicatedFirst")
local Workspace = game:GetService("Workspace")

-- O nome e a logo são os mesmos de client/ui/opening.ts e de LOGO em client/ui/art.ts.
local GUI_NAME = "Abertura"
local LOGO_IMAGE = "rbxassetid://130160068096699"
local LOGO_SIZE = Vector2.new(217, 98)
-- O palco da interface (DESIGN em client/ui/kit.tsx): a logo cresce pelo mesmo inteiro.
local DESIGN = Vector2.new(480, 270)
local FALLBACK_SECONDS = 60

local gui = Instance.new("ScreenGui")
gui.Name = GUI_NAME
gui.IgnoreGuiInset = true
gui.ResetOnSpawn = false
gui.AutoLocalize = false
-- Acima da tela de título (100) e abaixo das ferramentas de desenvolvimento (1000).
gui.DisplayOrder = 500

local black = Instance.new("Frame")
black.Name = "Preto"
black.BackgroundColor3 = Color3.new(0, 0, 0)
black.BorderSizePixel = 0
black.Size = UDim2.fromScale(1, 1)
black.Parent = gui

local logo = Instance.new("ImageLabel")
logo.Name = "Logo"
logo.BackgroundTransparency = 1
logo.Image = LOGO_IMAGE
logo.ResampleMode = Enum.ResamplerMode.Pixelated
logo.AnchorPoint = Vector2.new(0.5, 0.5)
logo.Position = UDim2.fromScale(0.5, 0.5)
logo.Parent = black

local function fit()
	local camera = Workspace.CurrentCamera
	local viewport = camera and camera.ViewportSize or Vector2.new(1280, 720)
	local k = math.max(1, math.floor(math.min(viewport.X / DESIGN.X, viewport.Y / DESIGN.Y)))
	logo.Size = UDim2.fromOffset(LOGO_SIZE.X * k, LOGO_SIZE.Y * k)
end
fit()

gui.Parent = Players.LocalPlayer:WaitForChild("PlayerGui")
ReplicatedFirst:RemoveDefaultLoadingScreen()

task.delay(FALLBACK_SECONDS, function()
	if gui.Parent then
		gui:Destroy()
	end
end)
