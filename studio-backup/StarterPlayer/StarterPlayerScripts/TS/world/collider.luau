-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local _view = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "view")
local ART_PX_PER_STUD = _view.ART_PX_PER_STUD
local GROUND_STUDS_PER_PX = _view.GROUND_STUDS_PER_PX
local SCREEN_RIGHT = _view.SCREEN_RIGHT
local TOWARD_CAMERA = _view.TOWARD_CAMERA
local groundOffset = _view.groundOffset
local HEIGHT = 3
--[[
	*
	 * Bloqueio invisível no pé de um objeto. `footprint` é a área que ele ocupa no chão, em pixels de
	 * arte na tela: largura e profundidade, a partir da base do sprite para trás.
	 
]]
local function createCollider(parent, name, position, footprint)
	local part = Instance.new("Part")
	part.Name = `{name}Collider`
	part.Anchored = true
	part.CanQuery = false
	part.CanTouch = false
	part.CastShadow = false
	part.Transparency = 1
	part.Size = Vector3.new(footprint.X / ART_PX_PER_STUD, HEIGHT, footprint.Y * GROUND_STUDS_PER_PX)
	local _position = position
	local _arg0 = groundOffset(0, -footprint.Y / 2)
	local _vector3 = Vector3.new(0, HEIGHT / 2, 0)
	local center = _position + _arg0 + _vector3
	-- Alinhado com a tela: X para a direita, Z para o lado da câmera.
	part.CFrame = CFrame.fromMatrix(center, SCREEN_RIGHT, Vector3.yAxis, TOWARD_CAMERA)
	part.Parent = parent
	return part
end
return {
	createCollider = createCollider,
}
