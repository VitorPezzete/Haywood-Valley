-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local ASSETS = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "assets").ASSETS
-- Folha world_atlas.png, gerada por draw_world.lua (pasta Aseprite); o id no registro (mundo.atlas).
-- As linhas de `Sprites` são a saída desse script: colar de novo sempre que a folha mudar.
local ATLAS = ASSETS["mundo.atlas"]
local function sprite(w, h, ax, ay, cells)
	local _object = {
		image = ATLAS,
		size = Vector2.new(w, h),
		anchor = Vector2.new(ax, ay),
	}
	local _left = "frames"
	-- ▼ ReadonlyArray.map ▼
	local _newValue = table.create(#cells)
	local _callback = function(_param)
		local x = _param[1]
		local y = _param[2]
		return Vector2.new(x, y)
	end
	for _k, _v in cells do
		_newValue[_k] = _callback(_v, _k - 1, cells)
	end
	-- ▲ ReadonlyArray.map ▲
	_object[_left] = _newValue
	return _object
end
local Sprites = {
	bush = sprite(53, 35, 26, 33, { { 238, 138 }, { 293, 138 }, { 348, 138 }, { 403, 138 }, { 2, 274 }, { 57, 274 } }),
	bushShadow = sprite(42, 10, 18, 4, { { 18, 337 } }),
	daisy = sprite(19, 13, 10, 11, { { 375, 311 }, { 396, 311 }, { 417, 311 }, { 438, 311 }, { 459, 311 }, { 480, 311 } }),
	oak = sprite(116, 134, 57, 131, { { 2, 2 }, { 120, 2 }, { 238, 2 }, { 356, 2 }, { 2, 138 }, { 120, 138 } }),
	oakShadow = sprite(80, 24, 32, 11, { { 2, 311 } }),
	pebble = sprite(14, 10, 7, 9, { { 2, 337 } }),
	pebbleShadow = sprite(16, 4, 6, 2, { { 88, 337 } }),
	poppy = sprite(15, 13, 7, 11, { { 273, 311 }, { 290, 311 }, { 307, 311 }, { 324, 311 }, { 341, 311 }, { 358, 311 } }),
	rock = sprite(22, 16, 11, 15, { { 141, 311 } }),
	rockShadow = sprite(24, 6, 10, 3, { { 62, 337 } }),
	soil = sprite(30, 16, 15, 8, { { 84, 311 } }),
	tuft = sprite(16, 14, 8, 12, { { 165, 311 }, { 183, 311 }, { 201, 311 }, { 219, 311 }, { 237, 311 }, { 255, 311 } }),
	wheat1 = sprite(23, 16, 11, 10, { { 116, 311 } }),
	wheat2 = sprite(31, 24, 15, 18, { { 298, 274 }, { 331, 274 }, { 364, 274 }, { 397, 274 }, { 430, 274 }, { 463, 274 } }),
	wheat3 = sprite(29, 31, 14, 25, { { 112, 274 }, { 143, 274 }, { 174, 274 }, { 205, 274 }, { 236, 274 }, { 267, 274 } }),
}
--* Linha da folha do personagem para cada direção em que ele olha. 
--* Grama que se repete, desenhada já no espaço da tela (world_grass.png; mundo.grama no registro). 
local GRASS_TILE = {
	image = ASSETS["mundo.grama"],
	size = Vector2.new(512, 256),
}
return {
	Sprites = Sprites,
	GRASS_TILE = GRASS_TILE,
}
