-- Espelho local dos lotes (preenchido pelos eventos do servidor) e o desenho deles:
-- contorno e placa de cada lote, solo arado e culturas.
-- Arte provisória: solo e culturas são blocos de cor; o estágio muda tamanho e cor.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local World = require(ReplicatedStorage.Config.World)
local Camera2D = require(script.Parent.Camera2D)
local UIController = require(script.Parent.UIController)

local TILE = World.TILE_SIZE
local MARGIN = 1
local READY_STAGE = 4

local SOIL_COLOR = Color3.fromHex("7A4A28")
local SOIL_INSET = 2
local MINE_COLOR = Color3.fromHex("FFD968")
local OTHER_COLOR = Color3.fromHex("7A4520")
local VACANT_COLOR = Color3.fromHex("E2A860")
local OUTLINE = Color3.fromHex("3E2218")

-- Um por estágio: semente, broto, crescendo, pronto.
local STAGES = {
	{ size = Vector2.new(14, 10), color = Color3.fromHex("5A3520") },
	{ size = Vector2.new(20, 26), color = Color3.fromHex("5CAE38") },
	{ size = Vector2.new(32, 42), color = Color3.fromHex("B6E26A") },
	{ size = Vector2.new(44, 54), color = Color3.fromHex("FFD968") },
}
local READY_GLOW = Color3.fromHex("FFF0A0")

export type Tile = { kind: string, crop: string?, plantedAt: number?, readyAt: number? }
export type Plot = { ownerId: number, ownerName: string, size: number, tiles: { [number]: Tile } }
type View = { soil: ImageLabel, crop: ImageLabel?, stage: number }

local PlotView = {
	plots = {} :: { [number]: Plot },
	mySlot = nil :: number?,
	cropCount = 0,
}

local coverLayer: Frame
local objectLayer: Frame
local views: { [number]: { [number]: View } } = {}
local soilFree: { ImageLabel } = {}
local cropFree: { ImageLabel } = {}
local markers: { [number]: { rect: Frame, sign: TextLabel, border: { Frame } } } = {}
local dirty = true
local lastX0, lastY0, lastX1, lastY1

local function newLabel(parent: Frame): ImageLabel
	local label = Instance.new("ImageLabel")
	label.BorderSizePixel = 0
	label.ResampleMode = Enum.ResamplerMode.Pixelated
	label.Parent = parent
	return label
end

local function acquireSoil(tx: number, ty: number): ImageLabel
	local label = table.remove(soilFree)
	if not label then
		label = newLabel(coverLayer)
		label.BackgroundColor3 = SOIL_COLOR
		label.Size = UDim2.fromOffset(TILE - SOIL_INSET * 2, TILE - SOIL_INSET * 2)
	end
	label.Position = UDim2.fromOffset(tx * TILE + SOIL_INSET, ty * TILE + SOIL_INSET)
	label.Visible = true
	return label
end

-- Pivô no centro da base, e ZIndex pela linha: quem está mais abaixo desenha na frente.
local function acquireCrop(tx: number, ty: number): ImageLabel
	local label = table.remove(cropFree)
	if not label then
		label = newLabel(objectLayer)
		label.AnchorPoint = Vector2.new(0.5, 1)
		UIController.addBorder(label, 2, OUTLINE)
	end
	label.Position = UDim2.fromOffset(tx * TILE + TILE / 2, ty * TILE + TILE - 6)
	label.ZIndex = ty
	label.Visible = true
	PlotView.cropCount += 1
	return label
end

local function releaseCrop(view: View)
	if view.crop then
		view.crop.Visible = false
		table.insert(cropFree, view.crop)
		view.crop = nil
		PlotView.cropCount -= 1
	end
end

local function refreshMarker(slot: number)
	local marker = markers[slot]
	local plot = PlotView.plots[slot]
	local size = if plot then plot.size else World.FARM_START
	local margin = World.farmMargin(size)
	local tx, ty = World.toWorld(slot, margin, margin)

	marker.rect.Position = UDim2.fromOffset(tx * TILE, ty * TILE)
	marker.rect.Size = UDim2.fromOffset(size * TILE, size * TILE)
	marker.sign.Position = UDim2.fromOffset(tx * TILE, ty * TILE - 60)
	marker.sign.Size = UDim2.fromOffset(size * TILE, 48)

	local color = VACANT_COLOR
	if plot then
		color = if slot == PlotView.mySlot then MINE_COLOR else OTHER_COLOR
		marker.sign.Text = `Fazenda de {plot.ownerName}`
	else
		marker.sign.Text = "Terreno à venda"
	end
	for _, frame in marker.border do
		frame.BackgroundColor3 = color
	end
end

function PlotView.init(markerLayer: Frame, cover: Frame, objects: Frame)
	coverLayer = cover
	objectLayer = objects

	for slot = 1, World.SLOT_COUNT do
		local rect = Instance.new("Frame")
		rect.Name = `Plot{slot}`
		rect.BackgroundColor3 = Color3.new(1, 1, 1)
		rect.BackgroundTransparency = 0.88
		rect.BorderSizePixel = 0
		rect.Parent = markerLayer

		local sign = Instance.new("TextLabel")
		sign.Name = `Sign{slot}`
		sign.BackgroundTransparency = 1
		sign.FontFace = Font.fromEnum(Enum.Font.FredokaOne)
		sign.TextSize = 40
		sign.TextColor3 = Color3.new(1, 1, 1)
		sign.TextStrokeColor3 = OUTLINE
		sign.TextStrokeTransparency = 0
		sign.Parent = markerLayer

		markers[slot] = { rect = rect, sign = sign, border = UIController.addBorder(rect, 6, VACANT_COLOR) }
		refreshMarker(slot)
	end
end

local function toTile(record): Tile
	return { kind = record.k, crop = record.c, plantedAt = record.p, readyAt = record.r }
end

function PlotView.load(snapshot)
	PlotView.plots = {}
	PlotView.mySlot = snapshot.slot
	for _, entry in snapshot.plots do
		local tiles = {}
		for _, record in entry.tiles do
			tiles[record.i] = toTile(record)
		end
		PlotView.plots[entry.slot] = { ownerId = entry.ownerId, ownerName = entry.ownerName, size = entry.size, tiles = tiles }
	end
	for slot = 1, World.SLOT_COUNT do
		refreshMarker(slot)
	end
	dirty = true
end

-- `info` nil = lote liberado. Um lote que troca de dono começa vazio.
function PlotView.setPlot(slot: number, info)
	local current = PlotView.plots[slot]
	if not info then
		PlotView.plots[slot] = nil
	elseif current and current.ownerId == info.ownerId then
		current.size = info.size
		current.ownerName = info.ownerName
	else
		PlotView.plots[slot] = { ownerId = info.ownerId, ownerName = info.ownerName, size = info.size, tiles = {} }
		if info.ownerId == Players.LocalPlayer.UserId then
			PlotView.mySlot = slot
		end
	end
	refreshMarker(slot)
	dirty = true
end

function PlotView.setTile(slot: number, record)
	local plot = PlotView.plots[slot]
	if plot then
		plot.tiles[record.i] = toTile(record)
		dirty = true
	end
end

function PlotView.tileAt(slot: number, lx: number, ly: number): Tile?
	local plot = PlotView.plots[slot]
	return plot and plot.tiles[World.tileIndex(lx, ly)]
end

-- Estágio 1 a 4 de uma cultura; 4 = pronta para colher.
function PlotView.stageOf(tile: Tile, now: number): number
	local plantedAt, readyAt = tile.plantedAt :: number, tile.readyAt :: number
	if now >= readyAt then
		return READY_STAGE
	end
	local progress = math.clamp((now - plantedAt) / (readyAt - plantedAt), 0, 1)
	return math.min(READY_STAGE - 1, math.floor(progress * (READY_STAGE - 1)) + 1)
end

local function reconcile(x0: number, y0: number, x1: number, y1: number)
	for slot, slotViews in views do
		local plot = PlotView.plots[slot]
		for index, view in slotViews do
			local tx, ty = World.toWorld(slot, World.fromIndex(index))
			local tile = plot and plot.tiles[index]
			if not tile or tx < x0 or tx > x1 or ty < y0 or ty > y1 then
				releaseCrop(view)
				view.soil.Visible = false
				table.insert(soilFree, view.soil)
				slotViews[index] = nil
			end
		end
	end

	for slot, plot in PlotView.plots do
		local slotViews = views[slot]
		if not slotViews then
			slotViews = {}
			views[slot] = slotViews
		end
		for index, tile in plot.tiles do
			local tx, ty = World.toWorld(slot, World.fromIndex(index))
			if tx >= x0 and tx <= x1 and ty >= y0 and ty <= y1 then
				local view = slotViews[index]
				if not view then
					view = { soil = acquireSoil(tx, ty), stage = 0 }
					slotViews[index] = view
				end
				if tile.kind == "crop" and not view.crop then
					view.crop = acquireCrop(tx, ty)
					view.stage = 0
				elseif tile.kind ~= "crop" then
					releaseCrop(view)
				end
			end
		end
	end
end

function PlotView.update(now: number)
	local x0, y0, x1, y1 = Camera2D.visibleTiles(MARGIN)
	if dirty or x0 ~= lastX0 or y0 ~= lastY0 or x1 ~= lastX1 or y1 ~= lastY1 then
		lastX0, lastY0, lastX1, lastY1 = x0, y0, x1, y1
		dirty = false
		reconcile(x0, y0, x1, y1)
	end

	local glow = 0.5 + 0.5 * math.sin(now * 5)
	for slot, slotViews in views do
		local plot = PlotView.plots[slot]
		for index, view in slotViews do
			local crop = view.crop
			if crop then
				local stage = PlotView.stageOf(plot.tiles[index], now)
				if stage ~= view.stage then
					view.stage = stage
					crop.Size = UDim2.fromOffset(STAGES[stage].size.X, STAGES[stage].size.Y)
					crop.BackgroundColor3 = STAGES[stage].color
				end
				if stage == READY_STAGE then
					crop.BackgroundColor3 = STAGES[stage].color:Lerp(READY_GLOW, glow)
				end
			end
		end
	end
end

return PlotView
