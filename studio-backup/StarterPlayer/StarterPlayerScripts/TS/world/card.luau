-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local _view = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "view")
local ART_PX_PER_STUD = _view.ART_PX_PER_STUD
local LOOK = _view.LOOK
local SCREEN_RIGHT = _view.SCREEN_RIGHT
local SCREEN_UP = _view.SCREEN_UP
local groundOffset = _view.groundOffset
local toView = _view.toView
local SURFACE_MAX_DISTANCE = TS.import(script, script.Parent, "ground").SURFACE_MAX_DISTANCE
local THICKNESS = 0.05
--[[
	*
	 * Onde fica um cartão de frente para a câmera cujo ponto `anchor` cai sobre `position` no chão.
	 * A borda de baixo do sprite encosta no chão. Como todos os cartões são paralelos, o Roblox
	 * desenha por último o que tem a base mais perto da câmera, que é a ordem certa. Fica na profundidade
	 * comprimida do desenho (`toView`), como o chão.
	 
]]
local function cardCFrame(size, anchor, position)
	local _position = position
	local _arg0 = groundOffset(size.X / 2 - anchor.X, size.Y - anchor.Y)
	local bottom = _position + _arg0
	local _arg0_1 = size.Y / 2 / ART_PX_PER_STUD
	local _arg0_2 = SCREEN_UP * _arg0_1
	local center = bottom + _arg0_2
	-- A face Front fica virada para a câmera.
	return CFrame.fromMatrix(toView(center), SCREEN_RIGHT * (-1), SCREEN_UP, LOOK)
end
--* Um objeto em pé: um Part fino, de frente para a câmera, com o primeiro quadro do sprite num SurfaceGui. 
local function createCard(parent, name, sprite, position)
	local _binding = sprite
	local size = _binding.size
	local part = Instance.new("Part")
	part.Name = name
	part.Anchored = true
	part.CanCollide = false
	part.CanQuery = false
	part.CanTouch = false
	part.CastShadow = false
	part.Transparency = 1
	part.Size = Vector3.new(size.X / ART_PX_PER_STUD, size.Y / ART_PX_PER_STUD, THICKNESS)
	part.CFrame = cardCFrame(size, sprite.anchor, position)
	local gui = Instance.new("SurfaceGui")
	gui.Face = Enum.NormalId.Front
	gui.SizingMode = Enum.SurfaceGuiSizingMode.FixedSize
	gui.CanvasSize = size
	gui.LightInfluence = 0
	gui.MaxDistance = SURFACE_MAX_DISTANCE
	gui.Parent = part
	local image = Instance.new("ImageLabel")
	image.BackgroundTransparency = 1
	image.Size = UDim2.fromScale(1, 1)
	image.Image = sprite.image
	image.ImageRectOffset = sprite.frames[1]
	image.ImageRectSize = size
	image.ResampleMode = Enum.ResamplerMode.Pixelated
	image.Parent = gui
	part.Parent = parent
	return {
		part = part,
		image = image,
	}
end
return {
	cardCFrame = cardCFrame,
	createCard = createCard,
}
