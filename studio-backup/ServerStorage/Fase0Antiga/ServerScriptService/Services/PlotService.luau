-- Dono da verdade sobre lotes, tiles e inventário. O cliente só pede ações;
-- tudo é validado aqui e o resultado é replicado.
-- Fase 0: nada é salvo (DataStore entra na Fase 1) e o lote é liberado quando o jogador sai.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local World = require(ReplicatedStorage.Config.World)
local Crops = require(ReplicatedStorage.Config.Crops)
local Remotes = ReplicatedStorage.Remotes

local MAX_ACTIONS_PER_SECOND = 20
local START_INVENTORY = { wheat = 4 }

type Tile = { kind: string, crop: string?, plantedAt: number?, readyAt: number? }
type Plot = { ownerId: number, ownerName: string, size: number, tiles: { [number]: Tile } }
type Stats = { xp: number, inventory: { [string]: number } }

local PlotService = {}

local plots: { [number]: Plot } = {}
local slotOf: { [Player]: number } = {}
local stats: { [Player]: Stats } = {}
local budget: { [Player]: { second: number, count: number } } = {}

-- Tabelas com índices numéricos esparsos não sobrevivem a um RemoteEvent,
-- então cada tile viaja como registro com o próprio índice.
local function serializeTile(index: number, tile: Tile)
	return { i = index, k = tile.kind, c = tile.crop, p = tile.plantedAt, r = tile.readyAt }
end

local function plotInfo(plot: Plot)
	return { ownerId = plot.ownerId, ownerName = plot.ownerName, size = plot.size }
end

local function withinBudget(player: Player): boolean
	local second = math.floor(os.clock())
	local b = budget[player]
	if not b or b.second ~= second then
		budget[player] = { second = second, count = 1 }
		return true
	end
	b.count += 1
	return b.count <= MAX_ACTIONS_PER_SECOND
end

local function isInteger(value: any): boolean
	return typeof(value) == "number" and value == value and value % 1 == 0
end

local function onTileAction(player: Player, action: any, lx: any, ly: any, cropId: any)
	if typeof(action) ~= "string" or not isInteger(lx) or not isInteger(ly) then
		return
	end
	if not withinBudget(player) then
		return
	end

	local slot = slotOf[player]
	local plot = slot and plots[slot]
	local playerStats = stats[player]
	if not plot or not playerStats or not World.inFarm(lx, ly, plot.size) then
		return
	end

	local index = World.tileIndex(lx, ly)
	local tile = plot.tiles[index]
	local now = workspace:GetServerTimeNow()
	local statsChanged = false

	if action == "plow" then
		if tile then
			return
		end
		tile = { kind = "soil" }
	elseif action == "plant" then
		local crop = typeof(cropId) == "string" and Crops[cropId] or nil
		if not crop or not tile or tile.kind ~= "soil" then
			return
		end
		local owned = playerStats.inventory[cropId] or 0
		if owned < crop.seedCost then
			return
		end
		playerStats.inventory[cropId] = owned - crop.seedCost
		statsChanged = true
		tile = { kind = "crop", crop = cropId, plantedAt = now, readyAt = now + crop.growTime }
	elseif action == "harvest" then
		if not tile or tile.kind ~= "crop" or not tile.crop or not tile.readyAt or now < tile.readyAt then
			return
		end
		local crop = Crops[tile.crop]
		playerStats.inventory[tile.crop] = (playerStats.inventory[tile.crop] or 0) + crop.yield
		playerStats.xp += crop.xp
		statsChanged = true
		tile = { kind = "soil" }
	else
		return
	end

	plot.tiles[index] = tile
	Remotes.TileChanged:FireAllClients(slot, serializeTile(index, tile))
	if statsChanged then
		Remotes.StatsChanged:FireClient(player, playerStats)
	end
end

local function onClientReady(player: Player)
	local list = {}
	for slot, plot in plots do
		local tiles = {}
		for index, tile in plot.tiles do
			table.insert(tiles, serializeTile(index, tile))
		end
		local info = plotInfo(plot) :: any
		info.slot = slot
		info.tiles = tiles
		table.insert(list, info)
	end
	Remotes.Snapshot:FireClient(player, { plots = list, slot = slotOf[player], stats = stats[player] })
end

local function onPlayerAdded(player: Player)
	stats[player] = { xp = 0, inventory = table.clone(START_INVENTORY) }

	-- Sem lote livre, o jogador entra só como visitante.
	for slot = 1, World.SLOT_COUNT do
		if not plots[slot] then
			local plot: Plot = { ownerId = player.UserId, ownerName = player.DisplayName, size = World.FARM_START, tiles = {} }
			plots[slot] = plot
			slotOf[player] = slot
			Remotes.PlotChanged:FireAllClients(slot, plotInfo(plot))
			break
		end
	end
end

local function onPlayerRemoving(player: Player)
	local slot = slotOf[player]
	if slot then
		plots[slot] = nil
		Remotes.PlotChanged:FireAllClients(slot, nil)
	end
	slotOf[player] = nil
	stats[player] = nil
	budget[player] = nil
end

function PlotService.start()
	Remotes.TileAction.OnServerEvent:Connect(onTileAction)
	Remotes.ClientReady.OnServerEvent:Connect(onClientReady)
	Players.PlayerAdded:Connect(onPlayerAdded)
	Players.PlayerRemoving:Connect(onPlayerRemoving)
	for _, player in Players:GetPlayers() do
		onPlayerAdded(player)
	end
end

return PlotService
