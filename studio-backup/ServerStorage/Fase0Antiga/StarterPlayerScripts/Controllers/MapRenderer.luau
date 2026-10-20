-- Desenha o terreno base. Só existem ImageLabels para os tiles visíveis; ao mover a
-- câmera, os que saem da tela voltam para o pool e são reaproveitados nos que entram.
-- Arte provisória: cada tile é uma cor chapada (o Image entra quando houver atlas).

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local World = require(ReplicatedStorage.Config.World)
local Camera2D = require(script.Parent.Camera2D)

local TILE = World.TILE_SIZE
local WIDTH = World.WORLD_TILES
local MARGIN = 1

local function shades(base: Color3, dark: Color3, light: Color3): { Color3 }
	return { base, base:Lerp(dark, 0.08), base:Lerp(dark, 0.18), base:Lerp(dark, 0.3), base:Lerp(light, 0.12), base:Lerp(light, 0.25) }
end

local COLORS = {
	grass = shades(Color3.fromHex("5CAE38"), Color3.fromHex("3C862C"), Color3.fromHex("86CC4A")),
	path = shades(Color3.fromHex("BC7C46"), Color3.fromHex("9A6236"), Color3.fromHex("D9A066")),
}

local MapRenderer = { activeCount = 0, pooledCount = 0 }

local layer: Frame
local active: { [number]: ImageLabel } = {}
local free: { ImageLabel } = {}
local lastX0, lastY0, lastX1, lastY1

local function acquire(tx: number, ty: number): ImageLabel
	local label = table.remove(free)
	if label then
		MapRenderer.pooledCount -= 1
	else
		label = Instance.new("ImageLabel")
		label.Size = UDim2.fromOffset(TILE, TILE)
		label.BorderSizePixel = 0
		label.ResampleMode = Enum.ResamplerMode.Pixelated
		label.Parent = layer
	end
	local variants = COLORS[World.terrainAt(tx, ty)]
	label.BackgroundColor3 = variants[math.floor(World.hash(tx, ty) * #variants) + 1]
	label.Position = UDim2.fromOffset(tx * TILE, ty * TILE)
	label.Visible = true
	return label
end

function MapRenderer.init(terrainLayer: Frame)
	layer = terrainLayer
end

function MapRenderer.update()
	local x0, y0, x1, y1 = Camera2D.visibleTiles(MARGIN)
	if x0 == lastX0 and y0 == lastY0 and x1 == lastX1 and y1 == lastY1 then
		return
	end
	lastX0, lastY0, lastX1, lastY1 = x0, y0, x1, y1

	for key, label in active do
		local tx, ty = key % WIDTH, math.floor(key / WIDTH)
		if tx < x0 or tx > x1 or ty < y0 or ty > y1 then
			label.Visible = false
			table.insert(free, label)
			active[key] = nil
			MapRenderer.activeCount -= 1
			MapRenderer.pooledCount += 1
		end
	end

	for ty = y0, y1 do
		for tx = x0, x1 do
			local key = ty * WIDTH + tx
			if not active[key] then
				active[key] = acquire(tx, ty)
				MapRenderer.activeCount += 1
			end
		end
	end
end

return MapRenderer
