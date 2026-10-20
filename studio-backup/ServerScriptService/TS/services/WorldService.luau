-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local Reflect = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Reflect
local Service = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Service
local _services = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services")
local Lighting = _services.Lighting
local Workspace = _services.Workspace
local _interiorChoice = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiorChoice")
local MAP_SPACING = _interiorChoice.MAP_SPACING
local worldSpan = _interiorChoice.worldSpan
local FLOOR_SIZE = 2048
local FLOOR_THICKNESS = 4
--* Prepara o que todos os jogadores compartilham: o piso em que se anda e a iluminação. 
local WorldService
do
	WorldService = setmetatable({}, {
		__tostring = function()
			return "WorldService"
		end,
	})
	WorldService.__index = WorldService
	function WorldService.new(...)
		local self = setmetatable({}, WorldService)
		return self:constructor(...) or self
	end
	function WorldService:constructor()
	end
	function WorldService:onStart()
		self:clearTemplate()
		self:createFloor()
		self:setupLighting()
	end
	function WorldService:clearTemplate()
		local _result = Workspace:FindFirstChild("Baseplate")
		if _result ~= nil then
			_result:Destroy()
		end
		for _, child in Workspace:GetChildren() do
			if not child:IsA("SpawnLocation") then
				continue
			end
			child.Transparency = 1
			child.CanCollide = false
			for _1, decal in child:GetChildren() do
				if decal:IsA("Decal") then
					decal.Transparency = 1
				end
			end
		end
	end
	function WorldService:createFloor()
		-- Os mapas compartilhados em volta da origem e as casas dos jogadores dos dois lados deles (`mapCenter`). O
		-- Roblox não aceita Part com mais de 2048 studs de lado: o piso é feito de pedaços lado a lado.
		local _binding = worldSpan()
		local first = _binding[1]
		local last = _binding[2]
		local left = math.min(-FLOOR_SIZE / 2, first - 2 * MAP_SPACING)
		local right = math.max(FLOOR_SIZE / 2, last + 2 * MAP_SPACING)
		-- Com o streaming ligado, cada Part chega ao cliente pelo lugar do centro dele: um pedaço de 2048 studs com o
		-- centro longe ficaria de fora e o personagem cairia. O modelo persistente vai inteiro a todo cliente.
		local model = Instance.new("Model")
		model.Name = "Floor"
		model.ModelStreamingMode = Enum.ModelStreamingMode.Persistent
		local x = left
		local index = 0
		while x < right do
			local width = math.min(FLOOR_SIZE, right - x)
			local floor = Instance.new("Part")
			floor.Name = if index == 0 then "Floor" else `Floor{index}`
			floor.Anchored = true
			floor.Transparency = 1
			floor.CastShadow = false
			floor.Size = Vector3.new(width, FLOOR_THICKNESS, FLOOR_SIZE)
			floor.Position = Vector3.new(x + width / 2, -FLOOR_THICKNESS / 2, 0)
			floor.CanTouch = false
			floor.Parent = model
			x += width
			index += 1
		end
		model.Parent = Workspace
	end
	function WorldService:setupLighting()
		for _, child in Lighting:GetChildren() do
			if child:IsA("PostEffect") then
				child.Enabled = false
			end
			if child:IsA("Atmosphere") then
				child.Density = 0
				child.Haze = 0
			end
		end
	end
	do
		-- (Flamework) WorldService metadata
		Reflect.defineMetadata(WorldService, "identifier", "server/services/WorldService@WorldService")
		Reflect.defineMetadata(WorldService, "flamework:implements", { "$:flamework@OnStart" })
	end
end
-- (Flamework) WorldService decorators
Reflect.decorate(WorldService, "$:flamework@Service", Service, {})
return {
	WorldService = WorldService,
}
