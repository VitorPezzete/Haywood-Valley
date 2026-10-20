-- Culturas. Como no Hay Day, a semente é o próprio item colhido:
-- plantar gasta `seedCost` unidades e colher devolve `yield`.

export type Crop = {
	name: string,
	growTime: number, -- segundos
	level: number,
	seedCost: number,
	yield: number,
	xp: number,
}

local Crops: { [string]: Crop } = {
	wheat = { name = "Trigo", growTime = 120, level = 1, seedCost = 1, yield = 2, xp = 1 },
}

return Crops
