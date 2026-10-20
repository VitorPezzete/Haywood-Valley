-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local Reflect = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Reflect
local Controller = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Controller
local _services = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services")
local Players = _services.Players
local RunService = _services.RunService
local UserInputService = _services.UserInputService
local Workspace = _services.Workspace
local _view = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "view")
local ART_PX_PER_STUD = _view.ART_PX_PER_STUD
local CAMERA_MAX_DISTANCE = _view.CAMERA_MAX_DISTANCE
local CAMERA_MIN_FOV = _view.CAMERA_MIN_FOV
local LOOK = _view.LOOK
local SCREEN_RIGHT = _view.SCREEN_RIGHT
local SCREEN_UP = _view.SCREEN_UP
local screenDensity = _view.screenDensity
local snapToArtPx = _view.snapToArtPx
local toView = _view.toView
local worldToArtPx = _view.worldToArtPx
local zoomRange = _view.zoomRange
local _perf = TS.import(script, script.Parent.Parent, "perf")
local perfBegin = _perf.perfBegin
local perfEnd = _perf.perfEnd
local _camera = TS.import(script, script.Parent.Parent, "state", "camera")
local worldView = _camera.worldView
local worldZoom = _camera.worldZoom
local _phone = TS.import(script, script.Parent.Parent, "state", "phone")
local phonePreview = _phone.phonePreview
local phoneScale = _phone.phoneScale
local screen = TS.import(script, script.Parent.Parent, "state", "screen").screen
--* Quanto a pinça precisa abrir ou fechar, desde o começo, para cada passo de zoom. 
local PINCH_STEP = 1.3
--* Arredonda para que o alvo caia num pixel inteiro da tela, senão a arte treme ao andar. 
local function snapToScreen(value, studsPerScreenPx, viewportLength)
	local half = viewportLength / 2
	return (math.round(value / studsPerScreenPx + half) - half) * studsPerScreenPx
end
--[[
	*
	 * Câmera fixa, de cima em 3/4, que segue o personagem, com zoom em múltiplos inteiros do pixel de arte,
	 * como no Graal: o padrão mostra uns 540 pixels de arte de altura, e o jogador aproxima e afasta com a
	 * roda do mouse ou a pinça, de 270 até 768 de altura (`zoomRange`). O zoom é inteiro em pixels físicos
	 * (`screenDensity`), também numa tela com escala de 125%. Ela olha para o mundo desenhado, de profundidade
	 * comprimida (`toView`), e anda paralela a ele.
	 
]]
local CameraController
do
	CameraController = setmetatable({}, {
		__tostring = function()
			return "CameraController"
		end,
	})
	CameraController.__index = CameraController
	function CameraController.new(...)
		local self = setmetatable({}, CameraController)
		return self:constructor(...) or self
	end
	function CameraController:constructor()
	end
	function CameraController:onStart()
		RunService:BindToRenderStep("WorldCamera", Enum.RenderPriority.Camera.Value + 1, function()
			return self:update()
		end)
		UserInputService.InputChanged:Connect(function(input, processed)
			if processed or input.UserInputType ~= Enum.UserInputType.MouseWheel then
				return nil
			end
			if input.Position.Z ~= 0 then
				self:step(if input.Position.Z > 0 then 1 else -1)
			end
		end)
		UserInputService.TouchPinch:Connect(function(_positions, scale, _velocity, state, processed)
			if state == Enum.UserInputState.Begin then
				self.pinchFrom = if processed then nil else self:zoom()
			end
			local from = self.pinchFrom
			if from == nil then
				return nil
			end
			if state == Enum.UserInputState.End or state == Enum.UserInputState.Cancel then
				self.pinchFrom = nil
			end
			-- Abrir os dedos aproxima: cada `PINCH_STEP` de abertura é um zoom a mais.
			local steps = math.floor(math.log(scale) / math.log(PINCH_STEP) + 0.5)
			self:choose(from + steps)
		end)
	end
	function CameraController:physicalHeight()
		local phone = phonePreview()
		if phone then
			return phone.Y
		end
		local camera = Workspace.CurrentCamera
		if not camera then
			return 1080
		end
		return camera.ViewportSize.Y * screenDensity(camera.ViewportSize)
	end
	function CameraController:zoom()
		local range = zoomRange(self:physicalHeight())
		local _condition = self.chosen
		if _condition == nil then
			_condition = range.standard
		end
		return math.clamp(_condition, range.farthest, range.closest)
	end
	function CameraController:step(direction)
		self:choose(self:zoom() + direction)
	end
	function CameraController:choose(zoom)
		if screen() ~= "playing" then
			return nil
		end
		local range = zoomRange(self:physicalHeight())
		self.chosen = math.clamp(zoom, range.farthest, range.closest)
	end
	function CameraController:update()
		local started = perfBegin("Camera")
		self:follow()
		perfEnd("Camera", started)
	end
	function CameraController:follow()
		local camera = Workspace.CurrentCamera
		if not camera then
			return nil
		end
		-- As contas são em pixels físicos: o pixel de arte vale `zoom` deles, inteiro, e a câmera se alinha a eles.
		local density = screenDensity(camera.ViewportSize)
		local viewport = camera.ViewportSize * density
		-- Na prévia de celular, o zoom do celular ampliado pelo inteiro que cabe nesta tela (`phoneScale`).
		local phone = phonePreview()
		local zoom = self:zoom() * (if phone then phoneScale(phone, viewport) else 1)
		-- O que mede canvas em pixels da tela (o balão do chat) usa os pixels do ViewportSize.
		if worldZoom() ~= zoom / density then
			worldZoom(zoom / density)
		end
		local studsPerScreenPx = 1 / (ART_PX_PER_STUD * zoom)
		-- O campo de visão é o que enquadra a tela à distância máxima; se o Roblox não aceitar um
		-- valor tão pequeno, a câmera chega mais perto.
		local halfHeight = (viewport.Y * studsPerScreenPx) / 2
		local fov = math.max(CAMERA_MIN_FOV, math.deg(2 * math.atan(halfHeight / CAMERA_MAX_DISTANCE)))
		local distance = halfHeight / math.tan(math.rad(fov) / 2)
		local _root = Players.LocalPlayer.Character
		if _root ~= nil then
			_root = _root:FindFirstChild("HumanoidRootPart")
		end
		local root = _root
		-- O mesmo arredondamento do sprite do personagem, para os dois andarem juntos.
		local _result = root
		if _result ~= nil then
			_result = _result:IsA("BasePart")
		end
		local feet = if _result then snapToArtPx(Vector3.new(root.Position.X, 0, root.Position.Z)) else Vector3.zero
		local target = toView(feet)
		-- O retângulo da tela em pixels de arte, para quem esconde o que está fora dela.
		worldView.center = worldToArtPx(feet)
		local _arg0 = 2 * zoom
		worldView.half = viewport / _arg0
		local _arg0_1 = snapToScreen(target:Dot(SCREEN_RIGHT), studsPerScreenPx, viewport.X)
		local _exp = SCREEN_RIGHT * _arg0_1
		local _arg0_2 = snapToScreen(target:Dot(SCREEN_UP), studsPerScreenPx, viewport.Y)
		local _arg0_3 = SCREEN_UP * _arg0_2
		local _arg0_4 = target:Dot(LOOK)
		local _arg0_5 = LOOK * _arg0_4
		local focus = _exp + _arg0_3 + _arg0_5
		camera.CameraType = Enum.CameraType.Scriptable
		camera.FieldOfView = fov
		local _arg0_6 = LOOK * distance
		camera.CFrame = CFrame.fromMatrix(focus - _arg0_6, SCREEN_RIGHT, SCREEN_UP, LOOK * (-1))
		camera.Focus = CFrame.new(focus)
	end
	do
		-- (Flamework) CameraController metadata
		Reflect.defineMetadata(CameraController, "identifier", "client/controllers/CameraController@CameraController")
		Reflect.defineMetadata(CameraController, "flamework:implements", { "$:flamework@OnStart" })
	end
end
-- (Flamework) CameraController decorators
Reflect.decorate(CameraController, "$:flamework@Controller", Controller, {})
return {
	CameraController = CameraController,
}
