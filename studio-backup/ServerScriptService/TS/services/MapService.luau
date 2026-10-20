-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local Reflect = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Reflect
local Service = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Service
local _services = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services")
local Players = _services.Players
local Workspace = _services.Workspace
local CHARACTER_SCALE = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "character").CHARACTER_SCALE
local _interiorChoice = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiorChoice")
local arrivalCell = _interiorChoice.arrivalCell
local cellOfPoint = _interiorChoice.cellOfPoint
local chosenInterior = _interiorChoice.chosenInterior
local decodeCell = _interiorChoice.decodeCell
local encodeCell = _interiorChoice.encodeCell
local exitAt = _interiorChoice.exitAt
local isHouse = _interiorChoice.isHouse
local MAP_ATTRIBUTE = _interiorChoice.MAP_ATTRIBUTE
local MAP_CELL_ATTRIBUTE = _interiorChoice.MAP_CELL_ATTRIBUTE
local MAP_OWNER_ATTRIBUTE = _interiorChoice.MAP_OWNER_ATTRIBUTE
local MAP_SLOT_ATTRIBUTE = _interiorChoice.MAP_SLOT_ATTRIBUTE
local MAX_HOUSE_SLOTS = _interiorChoice.MAX_HOUSE_SLOTS
local mapCellPoint = _interiorChoice.mapCellPoint
local mapCorner = _interiorChoice.mapCorner
local mapData = _interiorChoice.mapData
local placeOf = _interiorChoice.placeOf
local Events = TS.import(script, game:GetService("ServerScriptService"), "TS", "network").Events
--* Quantas células em volta da saída ainda valem: o servidor vê o personagem um pouco atrasado. 
local EXIT_SLACK = 1
--* Por quanto tempo o servidor espera ver o personagem chegar à saída, em segundos. 
local EXIT_WAIT = 0.75
--* Intervalo mínimo entre duas viagens do mesmo jogador, em segundos. 
local TRAVEL_COOLDOWN = 1
--* Quanto esperar o avatar ser reduzido (`CharacterService`) antes de pôr o personagem no lugar. 
local SCALE_TIMEOUT = 10
--[[
	*
	 * Em que mapa do Diorama cada jogador está e as ligações entre os mapas (seção 12.17 da especificação), como
	 * os `LINK` do Graal: um mapa por vez para cada jogador, gravado no atributo `Mapa` do jogador. Cada mapa fica
	 * num lugar próprio do mundo (`mapCenter`), então os jogadores de mapas diferentes nunca se esbarram.
	 *
	 * - Ao entrar, o jogador vai ao mapa de começo (o teste `InteriorTeste`, ou o de começo do jogo), na célula de
	 *   começo; ao renascer, volta à célula em que chegou ao mapa (`MapaCelula`).
	 * - O cliente que pisa numa saída pede a viagem (`takeExit`); o servidor confere que o personagem está mesmo
	 *   na saída do mapa em que ele está e que o destino existe no jogo, solta o que ele segura, grava o mapa novo e
	 *   leva o personagem à chegada pedida.
	 * - A casa (`HOUSE_MAPS`) é de cada jogador: quem entra nela vai à cópia do dono (hoje sempre a própria), num
	 *   lugar do mundo só dela (`MapaDono` e `MapaLugar` no jogador). O lugar fica reservado enquanto o dono está no
	 *   servidor.
	 
]]
--* Quanto esperar o cliente receber a volta do destino antes de levar o personagem, em segundos. 
local STREAM_TIMEOUT = 2
--* Atributo do Workspace, só para testes: o primeiro lugar de casa a dar. 
local HOUSE_SLOT_TEST_ATTRIBUTE = "CasaLugarTeste"
local MapService
do
	MapService = setmetatable({}, {
		__tostring = function()
			return "MapService"
		end,
	})
	MapService.__index = MapService
	function MapService.new(...)
		local self = setmetatable({}, MapService)
		return self:constructor(...) or self
	end
	function MapService:constructor(pieces)
		self.pieces = pieces
		self.lastTravel = {}
		self.slots = {}
	end
	function MapService:onStart()
		Players.PlayerAdded:Connect(function(player)
			return self:join(player)
		end)
		Players.PlayerRemoving:Connect(function(player)
			local _lastTravel = self.lastTravel
			local _player = player
			_lastTravel[_player] = nil
			-- O lugar da casa fica livre quando o dono sai e ninguém mais está nela.
			local owner = player.UserId
			task.defer(function()
				local _exp = Players:GetPlayers()
				-- ▼ ReadonlyArray.some ▼
				local _result = false
				local _callback = function(other)
					return other:GetAttribute(MAP_OWNER_ATTRIBUTE) == owner
				end
				for _k, _v in _exp do
					if _callback(_v, _k - 1, _exp) then
						_result = true
						break
					end
				end
				-- ▲ ReadonlyArray.some ▲
				local inside = _result
				if not inside and Players:GetPlayerByUserId(owner) == nil then
					self.slots[owner] = nil
				end
			end)
		end)
		for _, player in Players:GetPlayers() do
			self:join(player)
		end
		Events.takeExit:connect(function(player)
			return task.spawn(function()
				return self:takeExit(player)
			end)
		end)
	end
	function MapService:join(player)
		local start = chosenInterior()
		if start and player:GetAttribute(MAP_ATTRIBUTE) == nil then
			player:SetAttribute(MAP_CELL_ATTRIBUTE, encodeCell(start.cell))
			self:setPlace(player, start.data.id)
		end
		player.CharacterAdded:Connect(function(character)
			return self:place(player, character)
		end)
		if player.Character then
			self:place(player, player.Character)
		end
	end
	function MapService:slotFor(owner)
		local _slots = self.slots
		local _owner = owner
		local known = _slots[_owner]
		if known ~= nil then
			return known
		end
		local used = {}
		for _, slot in self.slots do
			used[slot] = true
		end
		-- Teste: `workspace:SetAttribute("CasaLugarTeste", 200)` antes do Play põe a casa a partir desse lugar (o mais
		-- longe da origem é o 199, à direita, e o 200, à esquerda), para conferir o desenho longe da origem.
		local test = Workspace:GetAttribute(HOUSE_SLOT_TEST_ATTRIBUTE)
		local slot = if type(test) == "number" and test >= 1 and test <= MAX_HOUSE_SLOTS then math.floor(test) else 1
		while true do
			local _slot = slot
			local _condition = used[_slot] ~= nil
			if _condition then
				_condition = slot < MAX_HOUSE_SLOTS
			end
			if not _condition then
				break
			end
			slot += 1
		end
		local _slots_1 = self.slots
		local _owner_1 = owner
		local _slot = slot
		_slots_1[_owner_1] = _slot
		return slot
	end
	function MapService:setPlace(player, id)
		local owner = if isHouse(id) then player.UserId else 0
		player:SetAttribute(MAP_OWNER_ATTRIBUTE, owner)
		player:SetAttribute(MAP_SLOT_ATTRIBUTE, if owner > 0 then self:slotFor(owner) else 0)
		player:SetAttribute(MAP_ATTRIBUTE, id)
	end
	function MapService:place(player, character)
		task.spawn(function()
			local root = character:WaitForChild("HumanoidRootPart", 10)
			local _result = root
			if _result ~= nil then
				_result = _result:IsA("BasePart")
			end
			if not _result then
				return nil
			end
			local started = os.clock()
			while character:GetScale() > CHARACTER_SCALE * 1.5 and os.clock() - started < SCALE_TIMEOUT do
				task.wait()
			end
			if character.Parent == nil then
				return nil
			end
			local place = placeOf(player)
			local data = place and mapData(place.id)
			if not place or not data then
				return nil
			end
			local cell = decodeCell(player:GetAttribute(MAP_CELL_ATTRIBUTE)) or data.spawn
			self:move(character, data, cell, place.slot)
		end)
	end
	function MapService:move(character, data, cell, slot, travel)
		if travel == nil then
			travel = false
		end
		local root = character:FindFirstChild("HumanoidRootPart")
		local _result = root
		if _result ~= nil then
			_result = _result:IsA("BasePart")
		end
		local height = if _result then math.max(root.Position.Y, 1) else 1
		local point = mapCellPoint(data.id, cell[1], cell[2], slot)
		-- Na viagem, com o streaming, o lugar novo fica longe (os mapas a `MAP_SPACING` uns dos outros): o servidor
		-- pede que o cliente receba a volta do destino antes de levar o personagem (o jeito que a documentação do
		-- streaming manda para levar alguém longe). Ao nascer não: o cliente acabou de entrar e o pedido atrasava o
		-- personagem além dos 3 s em que o próprio cliente o leva (visto no Studio em 2026-10-18).
		local player = if travel then Players:GetPlayerFromCharacter(character) else nil
		if player then
			pcall(function()
				return player:RequestStreamAroundAsync(point, STREAM_TIMEOUT)
			end)
		end
		if character.Parent == nil then
			return nil
		end
		character:PivotTo(CFrame.new(Vector3.new(point.X, height, point.Z)))
		local _result_1 = root
		if _result_1 ~= nil then
			_result_1 = _result_1:IsA("BasePart")
		end
		if _result_1 then
			root.AssemblyLinearVelocity = Vector3.zero
		end
	end
	function MapService:takeExit(player)
		local refuse = function(why)
			warn(`[Mapa] {player.Name}: saída recusada ({why})`)
			Events.exitRefused:fire(player)
		end
		local now = os.clock()
		local _lastTravel = self.lastTravel
		local _player = player
		local _condition = _lastTravel[_player]
		if _condition == nil then
			_condition = -math.huge
		end
		if now - _condition < TRAVEL_COOLDOWN then
			return refuse("pedido repetido")
		end
		local place = placeOf(player)
		local data = place and mapData(place.id)
		local character = player.Character
		local _root = character
		if _root ~= nil then
			_root = _root:FindFirstChild("HumanoidRootPart")
		end
		local root = _root
		local _condition_1 = not place or not data or not character
		if not _condition_1 then
			local _result = root
			if _result ~= nil then
				_result = _result:IsA("BasePart")
			end
			_condition_1 = not _result
		end
		if _condition_1 then
			return refuse("sem mapa ou sem personagem")
		end
		local corner = mapCorner(data.id, place.slot)
		-- O cliente para na saída e o servidor vê o personagem com um atraso: confere de novo por um instante.
		local _lastTravel_1 = self.lastTravel
		local _player_1 = player
		_lastTravel_1[_player_1] = now
		local exitNear = function()
			local _binding = cellOfPoint(corner, root.Position)
			local cx = _binding[1]
			local cy = _binding[2]
			for dy = -EXIT_SLACK, EXIT_SLACK do
				for dx = -EXIT_SLACK, EXIT_SLACK do
					local found = exitAt(data, cx + dx, cy + dy)
					if found then
						return found
					end
				end
			end
			return nil
		end
		local exit = exitNear()
		while not exit and os.clock() - now < EXIT_WAIT and root.Parent ~= nil do
			task.wait(0.05)
			exit = exitNear()
		end
		if not exit then
			local _binding = cellOfPoint(corner, root.Position)
			local cx = _binding[1]
			local cy = _binding[2]
			return refuse(`longe de uma saída de "{data.id}" (célula {cx},{cy})`)
		end
		if player:GetAttribute(MAP_ATTRIBUTE) ~= data.id then
			return refuse("o mapa mudou no caminho")
		end
		local target = mapData(exit.map)
		if not target then
			return refuse(`o destino "{exit.map}" não foi gerado para o jogo`)
		end
		self.pieces:leaveMap(player)
		local cell = arrivalCell(target, exit.arrival)
		player:SetAttribute(MAP_CELL_ATTRIBUTE, encodeCell(cell))
		self:setPlace(player, target.id)
		local _self = self
		local _result = placeOf(player)
		if _result ~= nil then
			_result = _result.slot
		end
		local _condition_2 = _result
		if _condition_2 == nil then
			_condition_2 = 0
		end
		_self:move(character, target, cell, _condition_2, true)
		print(`[Mapa] {player.Name}: {data.id} → {target.id} ({encodeCell(cell)})`)
	end
	do
		-- (Flamework) MapService metadata
		Reflect.defineMetadata(MapService, "identifier", "server/services/MapService@MapService")
		Reflect.defineMetadata(MapService, "flamework:parameters", { "server/services/PieceService@PieceService" })
		Reflect.defineMetadata(MapService, "flamework:implements", { "$:flamework@OnStart" })
	end
end
-- (Flamework) MapService decorators
Reflect.decorate(MapService, "$:flamework@Service", Service, {})
return {
	MapService = MapService,
}
