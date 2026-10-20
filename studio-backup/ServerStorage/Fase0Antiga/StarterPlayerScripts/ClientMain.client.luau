local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local StarterGui = game:GetService("StarterGui")

local World = require(ReplicatedStorage:WaitForChild("Config"):WaitForChild("World"))
local Crops = require(ReplicatedStorage.Config:WaitForChild("Crops"))
local Remotes = ReplicatedStorage:WaitForChild("Remotes")

local Controllers = script.Parent:WaitForChild("Controllers")
local Camera2D = require(Controllers:WaitForChild("Camera2D"))
local InputController = require(Controllers:WaitForChild("InputController"))
local MapRenderer = require(Controllers:WaitForChild("MapRenderer"))
local PlotView = require(Controllers:WaitForChild("PlotView"))
local UIController = require(Controllers:WaitForChild("UIController"))

local TILE = World.TILE_SIZE
local PLANT_CROP = "wheat" -- Fase 0: só existe trigo
local DEBUG_INTERVAL = 0.5

local stats = nil

for _, coreGui in { Enum.CoreGuiType.Backpack, Enum.CoreGuiType.Health, Enum.CoreGuiType.EmotesMenu, Enum.CoreGuiType.PlayerList } do
	StarterGui:SetCoreGuiEnabled(coreGui, false)
end

local ui = UIController.init()
MapRenderer.init(ui.terrain)
PlotView.init(ui.markers, ui.cover, ui.objects)

local function formatTime(seconds: number): string
	seconds = math.max(0, math.ceil(seconds))
	return string.format("%d:%02d", seconds // 60, seconds % 60)
end

-- Tile da minha fazenda sob um ponto da tela: coordenadas locais e o tile (nil = grama).
local function myFarmTileAt(screen: Vector2): (number?, number?, PlotView.Tile?)
	local slot = PlotView.mySlot
	local plot = slot and PlotView.plots[slot]
	if not slot or not plot then
		return nil, nil, nil
	end
	local lx, ly = World.toLocal(slot, Camera2D.screenToTile(screen))
	if not World.inFarm(lx, ly, plot.size) then
		return nil, nil, nil
	end
	return lx, ly, PlotView.tileAt(slot, lx, ly)
end

local function centerOnMyFarm()
	if PlotView.mySlot then
		local middle = World.FARM_MAX / 2
		Camera2D.centerOnTile(World.toWorld(PlotView.mySlot, middle, middle))
	end
end

-- O clique decide a ação pelo estado do tile; o servidor valida de novo.
InputController.onClick = function(screen: Vector2)
	local lx, ly, tile = myFarmTileAt(screen)
	if not lx then
		return
	end
	if not tile then
		Remotes.TileAction:FireServer("plow", lx, ly)
	elseif tile.kind == "soil" then
		local crop = Crops[PLANT_CROP]
		if stats and (stats.inventory[PLANT_CROP] or 0) >= crop.seedCost then
			Remotes.TileAction:FireServer("plant", lx, ly, PLANT_CROP)
		else
			UIController.toast(`Sem {crop.name:lower()} para plantar`)
		end
	elseif tile.kind == "crop" then
		local remaining = (tile.readyAt :: number) - workspace:GetServerTimeNow()
		if remaining <= 0 then
			Remotes.TileAction:FireServer("harvest", lx, ly)
		else
			UIController.toast(`Ainda crescendo: {formatTime(remaining)}`)
		end
	end
end

Remotes.Snapshot.OnClientEvent:Connect(function(snapshot)
	stats = snapshot.stats
	PlotView.load(snapshot)
	UIController.setStats(stats)
	centerOnMyFarm()
end)

Remotes.PlotChanged.OnClientEvent:Connect(function(slot, info)
	PlotView.setPlot(slot, info)
end)

Remotes.TileChanged.OnClientEvent:Connect(function(slot, record)
	PlotView.setTile(slot, record)
end)

Remotes.StatsChanged.OnClientEvent:Connect(function(newStats)
	stats = newStats
	UIController.setStats(stats)
end)

local function updateHover(now: number)
	local cursor = InputController.cursor()
	local lx, ly, tile
	if cursor then
		lx, ly, tile = myFarmTileAt(cursor)
	end
	if not lx or not ly then
		ui.hover.Visible = false
		UIController.setHint(nil)
		return
	end

	local tx, ty = World.toWorld(PlotView.mySlot :: number, lx, ly)
	ui.hover.Position = UDim2.fromOffset(tx * TILE, ty * TILE)
	ui.hover.Visible = true

	if not tile then
		UIController.setHint("Clique para arar")
	elseif tile.kind == "soil" then
		UIController.setHint(`Clique para plantar {Crops[PLANT_CROP].name:lower()}`)
	elseif tile.kind == "crop" then
		local name = Crops[tile.crop :: string].name
		local remaining = (tile.readyAt :: number) - now
		if remaining <= 0 then
			UIController.setHint(`{name} pronto! Clique para colher`)
		else
			UIController.setHint(`{name}: pronto em {formatTime(remaining)}`)
		end
	end
end

local frames, elapsed = 0, 0

RunService.RenderStepped:Connect(function(dt)
	local camera = workspace.CurrentCamera
	if camera then
		Camera2D.setViewport(camera.ViewportSize)
	end
	InputController.update(dt)

	local origin = Camera2D.origin()
	ui.root.Position = UDim2.fromOffset(origin.X, origin.Y)
	ui.scale.Scale = Camera2D.scale()

	local now = workspace:GetServerTimeNow()
	MapRenderer.update()
	PlotView.update(now)
	updateHover(now)

	frames += 1
	elapsed += dt
	if elapsed >= DEBUG_INTERVAL then
		UIController.setDebug(`{math.round(frames / elapsed)} fps  •  {MapRenderer.activeCount} tiles  •  {PlotView.cropCount} culturas  •  {Camera2D.tilePx} px/tile`)
		frames, elapsed = 0, 0
	end
end)

InputController.start()
Remotes.ClientReady:FireServer()
