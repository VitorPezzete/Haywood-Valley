-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local Reflect = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Reflect
local Controller = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Controller
local _services = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services")
local Players = _services.Players
local Workspace = _services.Workspace
local _interiorChoice = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiorChoice")
local actionsStart = _interiorChoice.actionsStart
local mapCorner = _interiorChoice.mapCorner
local mapData = _interiorChoice.mapData
local placeOf = _interiorChoice.placeOf
local InteriorMap = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiorMap").InteriorMap
local _view = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "view")
local cellToWorld = _view.cellToWorld
local groundOffset = _view.groundOffset
local snapToArtPx = _view.snapToArtPx
local createCard = TS.import(script, script.Parent.Parent, "world", "card").createCard
local createCollider = TS.import(script, script.Parent.Parent, "world", "collider").createCollider
local _perf = TS.import(script, script.Parent.Parent, "perf")
local perfBegin = _perf.perfBegin
local perfEnd = _perf.perfEnd
local _ground = TS.import(script, script.Parent.Parent, "world", "ground")
local createGround = _ground.createGround
local GroundLayer = _ground.GroundLayer
local LIVE_Z_OFFSET = _ground.LIVE_Z_OFFSET
local buildInterior = TS.import(script, script.Parent.Parent, "world", "interior").buildInterior
local _interiorTest = TS.import(script, script.Parent.Parent, "world", "interiorTest")
local interiorTest = _interiorTest.interiorTest
local startInterior = _interiorTest.startInterior
local Occlusion = TS.import(script, script.Parent.Parent, "world", "occlusion").Occlusion
local Sprites = TS.import(script, script.Parent.Parent, "world", "sprites").Sprites
local Wind = TS.import(script, script.Parent.Parent, "world", "wind").Wind
--* Grama em volta da origem: cobre a tela com a câmera afastada (768 de altura) andando pela cena toda. 
local GROUND_CANVAS = Vector2.new(4096, 2048)
-- Canteiro de teste, em células.
local FIELD = {
	i0 = 1,
	i1 = 5,
	j0 = 0,
	j1 = 3,
}
local PROPS = { {
	name = "Oak",
	sprite = Sprites.oak,
	shadow = Sprites.oakShadow,
	hides = "tree",
	footprint = Vector2.new(16, 8),
	at = { { -156, 79 }, { -70, -78 }, { -36, -62 }, { 150, -52 }, { 236, 20 }, { -250, -10 }, { 150, 205 } },
}, {
	name = "Bush",
	sprite = Sprites.bush,
	shadow = Sprites.bushShadow,
	hides = "block",
	footprint = Vector2.new(34, 12),
	at = { { 214, 62 }, { -186, -39 }, { 120, 142 } },
}, {
	name = "Rock",
	sprite = Sprites.rock,
	shadow = Sprites.rockShadow,
	footprint = Vector2.new(18, 8),
	at = { { 204, 120 }, { -44, -95 } },
}, {
	name = "Pebble",
	sprite = Sprites.pebble,
	shadow = Sprites.pebbleShadow,
	at = { { 224, 127 }, { -58, -90 }, { -120, 40 } },
} }
-- Enfeites espalhados pela grama, com sorteio fixo para a cena sair sempre igual.
local SCATTER = { {
	name = "Tuft",
	sprite = Sprites.tuft,
	count = 46,
}, {
	name = "Daisy",
	sprite = Sprites.daisy,
	count = 14,
}, {
	name = "Poppy",
	sprite = Sprites.poppy,
	count = 9,
} }
local SCATTER_SEED = 7
local SCATTER_HALF = Vector2.new(520, 250)
local function insideField(position)
	local margin = 0.8
	local i = position.X / cellToWorld(1, 0).X
	local j = position.Z / cellToWorld(0, 1).Z
	return i > FIELD.i0 - margin and i < FIELD.i1 + margin and j > FIELD.j0 - margin and j < FIELD.j1 + margin
end
--[[
	*
	 * O mapa em que o jogador está: um mapa do Diorama (interior, exterior ou os dois), montado em `buildInterior`.
	 * Cada cliente monta só o mapa do próprio jogador (o atributo `Mapa`, que o servidor grava) e troca de mapa
	 * quando o jogador passa por uma saída (`enter`, chamado pelo `MapController`); quem desenha algo do mapa
	 * (luzes, peças, sombras) se inscreve em `onMapChanged`. Sem nenhum mapa gerado, a cena fixa do protótipo:
	 * chão de grama, um canteiro com trigo e alguns objetos.
	 
]]
local SceneController
do
	SceneController = setmetatable({}, {
		__tostring = function()
			return "SceneController"
		end,
	})
	SceneController.__index = SceneController
	function SceneController.new(...)
		local self = setmetatable({}, SceneController)
		return self:constructor(...) or self
	end
	function SceneController:constructor()
		self.mapSlot = 0
		self.wind = Wind.new()
		self.occlusion = Occlusion.new()
		self.listeners = {}
	end
	function SceneController:onInit()
		self.world = Instance.new("Folder")
		self.world.Name = "World"
		self.world.Parent = Workspace
		-- O mapa que o servidor já deu ao jogador; sem ele ainda, o de começo (o teste do Diorama vale mais; sem
		-- ele, o interior de começo do jogo normal, a casa de teste). O servidor chega à mesma escolha.
		local place = placeOf(Players.LocalPlayer)
		local _condition = (place and mapData(place.id))
		if _condition == nil then
			local _result = (interiorTest() or startInterior())
			if _result ~= nil then
				_result = _result.data
			end
			_condition = _result
		end
		local start = _condition
		if start then
			local _self = self
			local _result = place
			if _result ~= nil then
				_result = _result.id
			end
			_self:build(start, if _result == start.id then place else nil)
			return nil
		end
		self.ground = createGround(self.world, Vector3.zero, GROUND_CANVAS)
		self.live = createGround(self.world, Vector3.zero, GROUND_CANVAS, false, LIVE_Z_OFFSET, "vivo")
	end
	function SceneController:mapImages()
		local images = {}
		local _folder = self.interior
		if _folder ~= nil then
			_folder = _folder.folder
		end
		local folder = _folder
		if folder then
			for _, child in folder:GetDescendants() do
				if child:IsA("ImageLabel") and child.Image ~= "" then
					local _image = child.Image
					images[_image] = true
				end
			end
		end
		local list = {}
		for image in images do
			table.insert(list, image)
		end
		return list
	end
	function SceneController:onMapChanged(listener)
		local _listeners = self.listeners
		local _listener = listener
		table.insert(_listeners, _listener)
	end
	function SceneController:enter(place)
		local data = mapData(place.id)
		if not data or (place.key == self.mapKey and place.slot == self.mapSlot) or not self.interior then
			return false
		end
		self.interior:destroy()
		self:build(data, place)
		for _, listener in self.listeners do
			listener()
		end
		return true
	end
	function SceneController:build(data, place)
		local start = actionsStart(data)
		local _result = place
		if _result ~= nil then
			_result = _result.slot
		end
		local _condition = _result
		if _condition == nil then
			_condition = 0
		end
		self.mapSlot = _condition
		local _result_1 = place
		if _result_1 ~= nil then
			_result_1 = _result_1.key
		end
		local _condition_1 = _result_1
		if _condition_1 == nil then
			_condition_1 = data.id
		end
		self.mapKey = _condition_1
		self.map = InteriorMap.new(data, start.cell, start.test)
		self.interior = buildInterior(self.world, data, mapCorner(data.id, self.mapSlot), self.map)
		self.ground = self.interior.ground
		self.live = self.interior.live
		self.mapId = data.id
		local s = self.interior.stats
		print(`[Interior] {self.mapKey} ({data.stamp}): {s.tiles} tiles em {s.groundImages} imagens no chão` .. (if s.terrainTiles > 0 then ` (exterior: {s.terrainTiles} tiles, {s.terrainLayers} recortes em {s.terrainImages} imagens, {s.terrainAnimated} animadas)` else "") .. `; {s.colliders} bloqueios; {s.instances} instâncias; montado em {string.format("%.1f", s.buildMs)} ms`)
	end
	function SceneController:onStart()
		if self.interior then
			return nil
		end
		do
			local i = FIELD.i0
			local _shouldIncrement = false
			while true do
				if _shouldIncrement then
					i += 1
				else
					_shouldIncrement = true
				end
				if not (i <= FIELD.i1) then
					break
				end
				do
					local j = FIELD.j0
					local _shouldIncrement_1 = false
					while true do
						if _shouldIncrement_1 then
							j += 1
						else
							_shouldIncrement_1 = true
						end
						if not (j <= FIELD.j1) then
							break
						end
						local position = cellToWorld(i, j)
						self.ground:addFlat(Sprites.soil, position, GroundLayer.Soil)
						local age = i - FIELD.i0
						local wheat = if age <= 1 then Sprites.wheat1 elseif age <= 2 then Sprites.wheat2 else Sprites.wheat3
						local image = self:place("Wheat", wheat, position)
						-- O trigo crescido cobre o personagem; o broto, não.
						if wheat ~= Sprites.wheat1 then
							self.occlusion:add(image, wheat, position, "block")
						end
					end
				end
			end
		end
		for _, prop in PROPS do
			for _1, _binding in prop.at do
				local x = _binding[1]
				local y = _binding[2]
				local position = groundOffset(x, y)
				if prop.shadow then
					self.ground:addFlat(prop.shadow, position, GroundLayer.Shadow)
				end
				local image = self:place(prop.name, prop.sprite, position)
				if prop.hides then
					self.occlusion:add(image, prop.sprite, position, prop.hides)
				end
				if prop.footprint then
					createCollider(self.world, prop.name, position, prop.footprint)
				end
			end
		end
		local random = Random.new(SCATTER_SEED)
		for _, item in SCATTER do
			do
				local n = 0
				local _shouldIncrement = false
				while true do
					if _shouldIncrement then
						n += 1
					else
						_shouldIncrement = true
					end
					if not (n < item.count) then
						break
					end
					local x = random:NextInteger(-SCATTER_HALF.X, SCATTER_HALF.X)
					local y = random:NextInteger(-SCATTER_HALF.Y, SCATTER_HALF.Y)
					local position = groundOffset(x, y)
					if not insideField(position) then
						self:place(item.name, item.sprite, position)
					end
				end
			end
		end
	end
	function SceneController:onRender(dt)
		local now = os.clock()
		local started = perfBegin("Vento")
		self.wind:update(now)
		perfEnd("Vento", started)
		started = perfBegin("Tiles")
		local _result = self.interior
		if _result ~= nil then
			_result:animate(now)
		end
		perfEnd("Tiles", started)
		started = perfBegin("Oclusao")
		local _root = Players.LocalPlayer.Character
		if _root ~= nil then
			_root = _root:FindFirstChild("HumanoidRootPart")
		end
		local root = _root
		local _occlusion = self.occlusion
		local _result_1 = root
		if _result_1 ~= nil then
			_result_1 = _result_1:IsA("BasePart")
		end
		_occlusion:update(if _result_1 then snapToArtPx(Vector3.new(root.Position.X, 0, root.Position.Z)) else nil, dt)
		perfEnd("Oclusao", started)
	end
	function SceneController:place(name, sprite, position)
		local _binding = createCard(self.world, name, sprite, position)
		local image = _binding.image
		self.wind:add(image, sprite, position)
		return image
	end
	do
		-- (Flamework) SceneController metadata
		Reflect.defineMetadata(SceneController, "identifier", "client/controllers/SceneController@SceneController")
		Reflect.defineMetadata(SceneController, "flamework:implements", { "$:flamework@OnInit", "$:flamework@OnStart", "$:flamework@OnRender" })
	end
end
-- (Flamework) SceneController decorators
Reflect.decorate(SceneController, "$:flamework@Controller", Controller, {})
return {
	SceneController = SceneController,
}
