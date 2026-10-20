-- Medidas do mundo e conversões de coordenadas, compartilhadas por servidor e cliente.
-- Tiles do mundo são 0-based. Dentro de um lote, as coordenadas locais (lx, ly) vão de
-- 0 a FARM_MAX-1 e não mudam quando a fazenda expande.

local World = {}

World.TILE_SIZE = 64
World.CHUNK_SIZE = 16
World.SLOT_SIZE = 32
World.SLOT_BORDER = 2
World.FARM_START = 10
World.FARM_MAX = 28

-- Protótipo: uma única zona (2×2 slots).
World.SLOTS_PER_SIDE = 2
World.SLOT_COUNT = World.SLOTS_PER_SIDE * World.SLOTS_PER_SIDE
World.WORLD_TILES = World.SLOT_SIZE * World.SLOTS_PER_SIDE

World.ZOOM_MIN = 0.6
World.ZOOM_MAX = 1.5

-- Canto superior esquerdo do slot, em tiles do mundo.
function World.slotOrigin(slot: number): (number, number)
	local i = slot - 1
	return (i % World.SLOTS_PER_SIDE) * World.SLOT_SIZE, math.floor(i / World.SLOTS_PER_SIDE) * World.SLOT_SIZE
end

function World.toLocal(slot: number, tx: number, ty: number): (number, number)
	local ox, oy = World.slotOrigin(slot)
	return tx - ox - World.SLOT_BORDER, ty - oy - World.SLOT_BORDER
end

function World.toWorld(slot: number, lx: number, ly: number): (number, number)
	local ox, oy = World.slotOrigin(slot)
	return ox + World.SLOT_BORDER + lx, oy + World.SLOT_BORDER + ly
end

-- A fazenda de lado `size` fica centralizada na área máxima.
function World.farmMargin(size: number): number
	return (World.FARM_MAX - size) / 2
end

function World.inFarm(lx: number, ly: number, size: number): boolean
	local margin = World.farmMargin(size)
	return lx >= margin and lx < margin + size and ly >= margin and ly < margin + size
end

function World.tileIndex(lx: number, ly: number): number
	return ly * World.FARM_MAX + lx
end

function World.fromIndex(index: number): (number, number)
	return index % World.FARM_MAX, math.floor(index / World.FARM_MAX)
end

-- Valor pseudoaleatório fixo por posição (0 a 1), para variar os tiles sem guardar nada.
function World.hash(tx: number, ty: number): number
	local h = bit32.bxor(tx * 73856093, ty * 19349663)
	h = bit32.bxor(h, bit32.rshift(h, 13))
	h = bit32.band(h * 40503, 0xFFFFFFFF)
	h = bit32.bxor(h, bit32.rshift(h, 16))
	return h / 4294967296
end

-- Terreno base do protótipo: estrada de terra no contorno de cada slot, grama no resto.
function World.terrainAt(tx: number, ty: number): string
	local lx, ly = tx % World.SLOT_SIZE, ty % World.SLOT_SIZE
	local last = World.SLOT_SIZE - 1
	if lx == 0 or ly == 0 or lx == last or ly == last then
		return "path"
	end
	return "grass"
end

return World
