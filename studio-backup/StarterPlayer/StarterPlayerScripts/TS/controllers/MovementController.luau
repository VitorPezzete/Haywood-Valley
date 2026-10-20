-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local Reflect = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Reflect
local Controller = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Controller
local _services = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services")
local Players = _services.Players
local RunService = _services.RunService
local source = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "vide", "src").source
local WALK_SPEED = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "character").WALK_SPEED
local CAMERA_PITCH = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "view").CAMERA_PITCH
local SIN_PITCH = math.sin(CAMERA_PITCH)
--[[
	*
	 * Deixa o personagem do jogador parado enquanto uma tela está na frente (menu, personalização,
	 * diálogo). Este Studio não tem mais o `PlayerModule` em `PlayerScripts`, então o jeito é a
	 * velocidade: ela é conferida a cada quadro porque o servidor também a ajusta ao carregar o avatar.
	 
]]
local MovementController
do
	MovementController = setmetatable({}, {
		__tostring = function()
			return "MovementController"
		end,
	})
	MovementController.__index = MovementController
	function MovementController.new(...)
		local self = setmetatable({}, MovementController)
		return self:constructor(...) or self
	end
	function MovementController:constructor()
		self.holds = 0
		self.holding = source(false)
	end
	function MovementController:onStart()
		Players.LocalPlayer.CharacterAdded:Connect(function(character)
			return self:trim(character)
		end)
		local character = Players.LocalPlayer.Character
		if character then
			task.spawn(function()
				return self:trim(character)
			end)
		end
		RunService.Heartbeat:Connect(function()
			local _humanoid = Players.LocalPlayer.Character
			if _humanoid ~= nil then
				_humanoid = _humanoid:FindFirstChildOfClass("Humanoid")
			end
			local humanoid = _humanoid
			if not humanoid then
				return nil
			end
			-- Na tela, um stud em direção à câmera vale menos que um stud de lado (a câmera está a 70°):
			-- a velocidade cresce nessa direção para o passo na tela ser o mesmo nas quatro direções,
			-- como no Graal (pedido do usuário em 2026-10-17).
			local move = humanoid.MoveDirection
			local onScreen = math.sqrt(move.X * move.X + (move.Z * SIN_PITCH) ^ 2)
			local speed = if self.holds > 0 then 0 elseif onScreen > 0.01 then WALK_SPEED / onScreen else WALK_SPEED
			if math.abs(humanoid.WalkSpeed - speed) > 1e-3 then
				humanoid.WalkSpeed = speed
			end
		end)
	end
	function MovementController:trim(character)
		local humanoid = character:FindFirstChildOfClass("Humanoid") or (character:WaitForChild("Humanoid", 5))
		if not humanoid then
			return nil
		end
		for _, state in { Enum.HumanoidStateType.Climbing, Enum.HumanoidStateType.Swimming, Enum.HumanoidStateType.FallingDown, Enum.HumanoidStateType.Ragdoll, Enum.HumanoidStateType.Seated, Enum.HumanoidStateType.Flying, Enum.HumanoidStateType.Jumping } do
			humanoid:SetStateEnabled(state, false)
		end
	end
	function MovementController:hold()
		self.holds += 1
		self.holding(true)
		local released = false
		return function()
			if released then
				return nil
			end
			released = true
			self.holds -= 1
			self.holding(self.holds > 0)
		end
	end
	do
		-- (Flamework) MovementController metadata
		Reflect.defineMetadata(MovementController, "identifier", "client/controllers/MovementController@MovementController")
		Reflect.defineMetadata(MovementController, "flamework:implements", { "$:flamework@OnStart" })
	end
end
-- (Flamework) MovementController decorators
Reflect.decorate(MovementController, "$:flamework@Controller", Controller, {})
return {
	MovementController = MovementController,
}
