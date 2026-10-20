-- Câmera 2D virtual. Posição em pixels do mundo (64 por tile).
-- O zoom é guardado como "pixels de tela por tile", sempre inteiro, e a origem do mundo
-- é arredondada: assim toda borda de tile cai em pixel inteiro e não aparecem frestas.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local World = require(ReplicatedStorage.Config.World)

local TILE = World.TILE_SIZE
local WORLD_PX = World.WORLD_TILES * TILE
local MIN_TILE_PX = math.floor(TILE * World.ZOOM_MIN)
local MAX_TILE_PX = math.floor(TILE * World.ZOOM_MAX)

local Camera2D = {
	x = WORLD_PX / 2,
	y = WORLD_PX / 2,
	tilePx = TILE,
	viewport = Vector2.new(1280, 720),
}

function Camera2D.scale(): number
	return Camera2D.tilePx / TILE
end

-- Mantém a vista dentro do mapa; se o mapa for menor que a tela, centraliza.
local function clamp()
	local scale = Camera2D.scale()
	local halfW = Camera2D.viewport.X / 2 / scale
	local halfH = Camera2D.viewport.Y / 2 / scale
	Camera2D.x = if halfW * 2 >= WORLD_PX then WORLD_PX / 2 else math.clamp(Camera2D.x, halfW, WORLD_PX - halfW)
	Camera2D.y = if halfH * 2 >= WORLD_PX then WORLD_PX / 2 else math.clamp(Camera2D.y, halfH, WORLD_PX - halfH)
end

function Camera2D.setViewport(viewport: Vector2)
	if viewport ~= Camera2D.viewport then
		Camera2D.viewport = viewport
		clamp()
	end
end

-- Posição na tela do ponto (0, 0) do mundo.
function Camera2D.origin(): Vector2
	local scale = Camera2D.scale()
	return Vector2.new(
		math.round(Camera2D.viewport.X / 2 - Camera2D.x * scale),
		math.round(Camera2D.viewport.Y / 2 - Camera2D.y * scale)
	)
end

function Camera2D.screenToWorld(screen: Vector2): Vector2
	return (screen - Camera2D.origin()) / Camera2D.scale()
end

function Camera2D.screenToTile(screen: Vector2): (number, number)
	local world = Camera2D.screenToWorld(screen)
	return math.floor(world.X / TILE), math.floor(world.Y / TILE)
end

-- Desloca o conteúdo na tela por (dx, dy) pixels, como ao arrastar o mapa.
function Camera2D.panScreen(dx: number, dy: number)
	local scale = Camera2D.scale()
	Camera2D.x -= dx / scale
	Camera2D.y -= dy / scale
	clamp()
end

-- Aproxima (direction = 1) ou afasta (-1) mantendo fixo o ponto do mundo sob `screen`.
function Camera2D.zoomAt(screen: Vector2, direction: number)
	local anchor = Camera2D.screenToWorld(screen)
	local step = math.max(2, math.round(Camera2D.tilePx * 0.1))
	Camera2D.tilePx = math.clamp(Camera2D.tilePx + direction * step, MIN_TILE_PX, MAX_TILE_PX)
	local scale = Camera2D.scale()
	Camera2D.x = anchor.X - (screen.X - Camera2D.viewport.X / 2) / scale
	Camera2D.y = anchor.Y - (screen.Y - Camera2D.viewport.Y / 2) / scale
	clamp()
end

function Camera2D.centerOnTile(tx: number, ty: number)
	Camera2D.x = (tx + 0.5) * TILE
	Camera2D.y = (ty + 0.5) * TILE
	clamp()
end

-- Faixa de tiles visíveis (inclusiva), com `margin` tiles de folga, limitada ao mapa.
function Camera2D.visibleTiles(margin: number): (number, number, number, number)
	local x0, y0 = Camera2D.screenToTile(Vector2.zero)
	local x1, y1 = Camera2D.screenToTile(Camera2D.viewport)
	local last = World.WORLD_TILES - 1
	return math.max(x0 - margin, 0), math.max(y0 - margin, 0), math.min(x1 + margin, last), math.min(y1 + margin, last)
end

return Camera2D
