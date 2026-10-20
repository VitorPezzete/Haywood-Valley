-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local Reflect = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Reflect
local Controller = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Controller
local _services = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services")
local Players = _services.Players
local RunService = _services.RunService
local _vide = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "vide", "src")
local mount = _vide.mount
local source = _vide.source
local _interiorChoice = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiorChoice")
local cellOfPoint = _interiorChoice.cellOfPoint
local decodeCell = _interiorChoice.decodeCell
local exitAt = _interiorChoice.exitAt
local MAP_ATTRIBUTE = _interiorChoice.MAP_ATTRIBUTE
local MAP_CELL_ATTRIBUTE = _interiorChoice.MAP_CELL_ATTRIBUTE
local MAP_SLOT_ATTRIBUTE = _interiorChoice.MAP_SLOT_ATTRIBUTE
local mapCellPoint = _interiorChoice.mapCellPoint
local mapCorner = _interiorChoice.mapCorner
local mapData = _interiorChoice.mapData
local placeOf = _interiorChoice.placeOf
local zoneAt = _interiorChoice.zoneAt
local EN = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "i18n", "en").EN
local Events = TS.import(script, script.Parent.Parent, "network").Events
local _perf = TS.import(script, script.Parent.Parent, "perf")
local perfBegin = _perf.perfBegin
local perfEnd = _perf.perfEnd
local screen = TS.import(script, script.Parent.Parent, "state", "screen").screen
local t = TS.import(script, script.Parent.Parent, "ui", "i18n").t
local MapHud = TS.import(script, script.Parent.Parent, "ui", "MapHud").MapHud
--* O véu preto da troca de mapa: quanto leva para fechar e para abrir, em segundos. 
local FADE_OUT = 0.15
local FADE_IN = 0.25
--* Quanto esperar o servidor levar o personagem ao destino antes de o cliente mesmo o levar. 
local ARRIVAL_TIMEOUT = 1.5
--* Sem resposta do servidor a uma saída, o véu abre de novo. 
local EXIT_TIMEOUT = 3
--* A que distância da chegada (em studs, no chão) o personagem conta como chegado. 
local ARRIVED_STUDS = 1.5
--* A plaquinha da zona: quanto aparece inteira e quanto leva para surgir e sumir, em segundos. 
local ZONE_SECONDS = 3
local ZONE_FADE = 0.3
--* Quanto depois de nascer o cliente confere se o personagem está mesmo no mapa dele. 
local SPAWN_CHECK = 3
--* Uma animação de 0 a 1 (ou de 1 a 0) de um número da tela. 
--[[
	*
	 * As ligações e as zonas do mapa no cliente (seção 12.17 da especificação do Diorama):
	 *
	 * - **Saída**: quem pisa numa saída do mapa (depois de ter saído das saídas ao menos uma vez, para não voltar
	 *   na hora quem chega numa porta) fica parado, a tela escurece e o pedido vai ao servidor (`takeExit`), que
	 *   confere e leva o personagem (`MapService`). Quando o atributo `Mapa` muda, o `SceneController` monta o mapa
	 *   novo, o cliente espera o personagem chegar e a tela clareia. Recusado, só clareia.
	 * - **Zonas**: a zona com nome em que o pé está (`zone`), com as propriedades que o som usa
	 *   (`musica`, `ambiente`); ao entrar numa zona, o nome dela aparece no canto, traduzido quando é uma chave de
	 *   texto (`zone.…`).
	 
]]
local MapController
do
	MapController = setmetatable({}, {
		__tostring = function()
			return "MapController"
		end,
	})
	MapController.__index = MapController
	function MapController.new(...)
		local self = setmetatable({}, MapController)
		return self:constructor(...) or self
	end
	function MapController:constructor(scene, movement)
		self.scene = scene
		self.movement = movement
		self.zone = source(nil)
		self.veil = source(1)
		self.zoneFade = source(1)
		self.zoneName = source("")
		self.zoneShownAt = -math.huge
		self.armed = false
		self.serial = 0
		self.veilListeners = {}
		self.seenCell = {
			x = math.huge,
			y = math.huge,
			map = "",
			slot = -1,
			exit = false,
		}
	end
	function MapController:onStart()
		if not self.scene.interior then
			return nil
		end
		mount(function()
			return MapHud({
				veil = function()
					return self.veil()
				end,
				zoneName = function()
					return self.zoneName()
				end,
				zoneFade = function()
					return self.zoneFade()
				end,
			})
		end, Players.LocalPlayer:WaitForChild("PlayerGui"))
		-- O servidor grava o dono e o lugar da casa antes do mapa: espera o fim do quadro para ler os três juntos.
		Players.LocalPlayer:GetAttributeChangedSignal(MAP_ATTRIBUTE):Connect(function()
			return task.defer(function()
				return self:follow()
			end)
		end)
		Players.LocalPlayer:GetAttributeChangedSignal(MAP_SLOT_ATTRIBUTE):Connect(function()
			return task.defer(function()
				return self:follow()
			end)
		end)
		Events.exitRefused:connect(function()
			return self:finish()
		end)
		RunService.Heartbeat:Connect(function()
			return self:tick()
		end)
		RunService.RenderStepped:Connect(function()
			return self:animate()
		end)
		Players.LocalPlayer.CharacterAdded:Connect(function(character)
			return self:checkSpawn(character)
		end)
		if Players.LocalPlayer.Character then
			self:checkSpawn(Players.LocalPlayer.Character)
		end
		self:follow()
	end
	function MapController:zoneTitle(zone)
		return if EN[zone.name] ~= nil then t(zone.name) else zone.name
	end
	function MapController:localRoot()
		local _root = Players.LocalPlayer.Character
		if _root ~= nil then
			_root = _root:FindFirstChild("HumanoidRootPart")
		end
		local root = _root
		local _result = root
		if _result ~= nil then
			_result = _result:IsA("BasePart")
		end
		return if _result then root else nil
	end
	function MapController:arrival()
		local data = mapData(self.scene.mapId)
		if not data then
			return nil
		end
		return decodeCell(Players.LocalPlayer:GetAttribute(MAP_CELL_ATTRIBUTE)) or data.spawn
	end
	function MapController:arrived()
		local root = self:localRoot()
		local cell = self:arrival()
		if not root or not cell or self.scene.mapId == nil then
			return false
		end
		local target = mapCellPoint(self.scene.mapId, cell[1], cell[2], self.scene.mapSlot)
		return Vector3.new(root.Position.X - target.X, 0, root.Position.Z - target.Z).Magnitude < ARRIVED_STUDS
	end
	function MapController:placeHere()
		local character = Players.LocalPlayer.Character
		local root = self:localRoot()
		local cell = self:arrival()
		if not character or not root or not cell or self.scene.mapId == nil then
			return nil
		end
		local point = mapCellPoint(self.scene.mapId, cell[1], cell[2], self.scene.mapSlot)
		character:PivotTo(CFrame.new(Vector3.new(point.X, math.max(root.Position.Y, 1), point.Z)))
	end
	function MapController:checkSpawn(character)
		task.delay(SPAWN_CHECK, function()
			if Players.LocalPlayer.Character ~= character or self.travel then
				return nil
			end
			local root = self:localRoot()
			local id = self.scene.mapId
			if not root or id == nil then
				return nil
			end
			local _binding = cellOfPoint(mapCorner(id, self.scene.mapSlot), root.Position)
			local x = _binding[1]
			local y = _binding[2]
			if x < 0 or y < 0 or x >= 64 or y >= 64 then
				warn(`[Mapa] o personagem nasceu fora de "{id}"; levando à chegada`)
				self:placeHere()
			end
		end)
	end
	function MapController:onVeil(listener)
		local _veilListeners = self.veilListeners
		local _listener = listener
		table.insert(_veilListeners, _listener)
	end
	function MapController:curtain(closing, seconds)
		if self.travel then
			return nil
		end
		self:fadeVeil(if closing then 0 else 1, seconds)
		for _, listener in self.veilListeners do
			listener(closing, false)
		end
	end
	function MapController:begin(asked)
		local fresh = self.travel == nil
		if not self.travel then
			self.travel = {
				since = os.clock(),
				release = self.movement:hold(),
				asked = asked,
			}
		end
		self.travel.asked = asked
		self:fadeVeil(0, FADE_OUT)
		if fresh then
			for _, listener in self.veilListeners do
				listener(true, asked)
			end
		end
	end
	function MapController:finish()
		local travel = self.travel
		if not travel then
			return nil
		end
		self.travel = nil
		self.serial += 1
		travel.release()
		self:fadeVeil(1, FADE_IN)
		for _, listener in self.veilListeners do
			listener(false, false)
		end
	end
	function MapController:follow()
		local place = placeOf(Players.LocalPlayer)
		if not place or (place.key == self.scene.mapKey and place.slot == self.scene.mapSlot) then
			return nil
		end
		self:begin(false)
		self.serial += 1
		local serial = self.serial
		task.spawn(function()
			task.wait(FADE_OUT)
			if serial ~= self.serial then
				return nil
			end
			self.scene:enter(place)
			self.armed = false
			self.zone(nil)
			local started = os.clock()
			while not self:arrived() and os.clock() - started < ARRIVAL_TIMEOUT do
				task.wait()
			end
			if serial ~= self.serial then
				return nil
			end
			if not self:arrived() then
				self:placeHere()
			end
			task.wait()
			self:finish()
		end)
	end
	function MapController:tick()
		local started = perfBegin("Mapa")
		self:check()
		perfEnd("Mapa", started)
	end
	function MapController:check()
		local now = os.clock()
		-- O servidor não respondeu à saída: abre o véu.
		local _result = self.travel
		if _result ~= nil then
			_result = _result.asked
		end
		local _condition = _result
		if _condition then
			_condition = now - self.travel.since > EXIT_TIMEOUT
		end
		if _condition then
			self:finish()
		end
		local data = mapData(self.scene.mapId)
		local root = self:localRoot()
		if not data or not root or self.travel then
			return nil
		end
		local _binding = cellOfPoint(mapCorner(data.id, self.scene.mapSlot), root.Position)
		local x = _binding[1]
		local y = _binding[2]
		-- A saída e a zona só mudam quando o pé muda de célula (seção 5.1 do `PLANO_OTIMIZACAO.md`); na mesma célula,
		-- só a saída armada que espera a tela do jogo é conferida de novo.
		local seen = self.seenCell
		if seen.x == x and seen.y == y and seen.map == data.id and seen.slot == self.scene.mapSlot then
			if not seen.exit or not self.armed then
				return nil
			end
		end
		seen.x = x
		seen.y = y
		seen.map = data.id
		seen.slot = self.scene.mapSlot
		local exit = exitAt(data, x, y)
		seen.exit = exit ~= nil
		if not exit then
			self.armed = true
		elseif self.armed and screen() == "playing" then
			self.armed = false
			self:begin(true)
			Events.takeExit:fire()
		end
		local zone = zoneAt(data, x, y)
		if zone ~= self.zone() then
			self.zone(zone)
			if zone then
				self.zoneName(MapController:zoneTitle(zone))
				self.zoneShownAt = now
			end
		end
	end
	function MapController:fadeVeil(to, seconds)
		self.veilFade = {
			from = self.veil(),
			to = to,
			started = os.clock(),
			seconds = seconds,
		}
	end
	function MapController:animate()
		local now = os.clock()
		local fade = self.veilFade
		if fade then
			local alpha = math.clamp((now - fade.started) / fade.seconds, 0, 1)
			self.veil(fade.from + (fade.to - fade.from) * alpha)
			if alpha >= 1 then
				self.veilFade = nil
			end
		end
		-- A plaquinha surge, fica e some; só aparece com o jogo à mostra.
		local age = now - self.zoneShownAt
		local shown = if age < ZONE_FADE then age / ZONE_FADE elseif age < ZONE_FADE + ZONE_SECONDS then 1 else 1 - (age - ZONE_FADE - ZONE_SECONDS) / ZONE_FADE
		local transparency = if screen() == "playing" then 1 - math.clamp(shown, 0, 1) else 1
		if transparency ~= self.zoneFade() then
			self.zoneFade(transparency)
		end
	end
	do
		-- (Flamework) MapController metadata
		Reflect.defineMetadata(MapController, "identifier", "client/controllers/MapController@MapController")
		Reflect.defineMetadata(MapController, "flamework:parameters", { "client/controllers/SceneController@SceneController", "client/controllers/MovementController@MovementController" })
		Reflect.defineMetadata(MapController, "flamework:implements", { "$:flamework@OnStart" })
	end
end
-- (Flamework) MapController decorators
Reflect.decorate(MapController, "$:flamework@Controller", Controller, {})
return {
	MapController = MapController,
}
