-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local Reflect = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Reflect
local Service = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Service
local _services = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services")
local Players = _services.Players
local StarterPlayer = _services.StarterPlayer
local _character = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "character")
local CHARACTER_SCALE = _character.CHARACTER_SCALE
local WALK_SPEED = _character.WALK_SPEED
--[[
	*
	 * Prepara o personagem do Roblox de cada jogador. Ele fica invisível e reduzido à escala do mundo:
	 * só anda e colide. Quem aparece é o sprite, desenhado em cada cliente.
	 *
	 * Desde a fase 1 do `PLANO_OTIMIZACAO.md` (2026-10-18) o personagem é mínimo: o `StarterCharacter` do
	 * `default.project.json` (um `HumanoidRootPart` de 2 × 2 × 1 e o `Humanoid` R15 com `HipHeight` 2, sem juntas nem
	 * malhas), `LoadCharacterAppearance` desligado (o avatar da conta não é baixado) e um `Animate` vazio (o Roblox não
	 * anima ninguém). Na escala de 25%, o pé de colisão fica igual ao do avatar de antes (0,5 × 0,25 stud, a raiz a
	 * 0,75 do chão, medido no Studio em 2026-10-18), então o andar e a colisão não mudam.
	 
]]
local CharacterService
do
	CharacterService = setmetatable({}, {
		__tostring = function()
			return "CharacterService"
		end,
	})
	CharacterService.__index = CharacterService
	function CharacterService.new(...)
		local self = setmetatable({}, CharacterService)
		return self:constructor(...) or self
	end
	function CharacterService:constructor()
	end
	function CharacterService:onStart()
		Players.PlayerAdded:Connect(function(player)
			return self:watch(player)
		end)
		for _, player in Players:GetPlayers() do
			self:watch(player)
		end
	end
	function CharacterService:watch(player)
		player.CharacterAdded:Connect(function(character)
			return self:prepare(character)
		end)
		-- Sem o personagem mínimo (um place sem o StarterCharacter do projeto), o avatar inteiro chega depois: a escala
		-- vai de novo quando ele termina de carregar, senão os acessórios ficariam no tamanho original.
		player.CharacterAppearanceLoaded:Connect(function(character)
			return self:scale(character)
		end)
		if player.Character then
			self:prepare(player.Character)
		end
	end
	function CharacterService:scale(character)
		if math.abs(character:GetScale() - CHARACTER_SCALE) > 1e-4 then
			character:ScaleTo(CHARACTER_SCALE)
		end
	end
	function CharacterService:prepare(character)
		local hideOne = function(instance)
			if instance:IsA("BasePart") or instance:IsA("Decal") then
				instance.Transparency = 1
			end
		end
		for _, descendant in character:GetDescendants() do
			hideOne(descendant)
		end
		character.DescendantAdded:Connect(hideOne)
		local humanoid = character:FindFirstChildOfClass("Humanoid") or (character:WaitForChild("Humanoid", 5))
		if not humanoid then
			return nil
		end
		local root = character:FindFirstChild("HumanoidRootPart")
		local _result = root
		if _result ~= nil then
			_result = _result:IsA("BasePart")
		end
		local _condition = _result
		if _condition then
			_condition = not character.PrimaryPart
		end
		if _condition then
			character.PrimaryPart = root
		end
		-- Sem a aparência da conta, nada mais chega depois: a escala vai já.
		if not StarterPlayer.LoadCharacterAppearance then
			self:scale(character)
		end
		humanoid.WalkSpeed = WALK_SPEED
		humanoid.UseJumpPower = false
		humanoid.JumpHeight = 0
		humanoid.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None
	end
	do
		-- (Flamework) CharacterService metadata
		Reflect.defineMetadata(CharacterService, "identifier", "server/services/CharacterService@CharacterService")
		Reflect.defineMetadata(CharacterService, "flamework:implements", { "$:flamework@OnStart" })
	end
end
-- (Flamework) CharacterService decorators
Reflect.decorate(CharacterService, "$:flamework@Service", Service, {})
return {
	CharacterService = CharacterService,
}
