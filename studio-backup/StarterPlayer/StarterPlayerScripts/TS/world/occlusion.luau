-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local worldToArtPx = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "view").worldToArtPx
local _graalArt = TS.import(script, script.Parent, "graalArt")
local FEET = _graalArt.FEET
local FIGURE = _graalArt.FIGURE
--* Da sola dos pés até a borda de baixo do cartão do personagem. 
local FEET_TO_BOTTOM = FIGURE.Y - FEET.Y
--* Transparência de um objeto quando o jogador está atrás dele. 
local FADED = 0.55
--* Quanto da diferença some por segundo: a troca leva uns 0,3 s. 
local FADE_RATE = 10
-- Corpo do personagem na tela, em pixels de arte a partir dos pés.
local BODY_HALF_WIDTH = 10
local BODY_TOP = 40
local BODY_BOTTOM = 2
-- Árvore dentro do recorte: copa em cima, tronco estreito embaixo.
local CANOPY_HEIGHT = 0.62
local CANOPY_INSET = 0.08
local TRUNK_HALF_WIDTH = 0.1
-- Objeto baixo e cheio (arbusto, plantação): o recorte inteiro, menos uma margem.
local BLOCK_INSET = 0.12
--* Silhueta aproximada do objeto, usada para saber se ele cobre o jogador. 
local function overlaps(box, min, max)
	return box.min.X < max.X and box.max.X > min.X and box.min.Y < max.Y and box.max.Y > min.Y
end
local function boxesOf(silhouette, corner, base, size)
	local _binding = size
	local w = _binding.X
	local h = _binding.Y
	if silhouette == "block" then
		local _object = {}
		local _left = "min"
		local _corner = corner
		local _vector2 = Vector2.new(w * BLOCK_INSET, 0)
		_object[_left] = _corner + _vector2
		local _left_1 = "max"
		local _corner_1 = corner
		local _vector2_1 = Vector2.new(w * (1 - BLOCK_INSET), h)
		_object[_left_1] = _corner_1 + _vector2_1
		return { _object }
	end
	local split = corner.Y + h * CANOPY_HEIGHT
	return { {
		min = Vector2.new(corner.X + w * CANOPY_INSET, corner.Y),
		max = Vector2.new(corner.X + w * (1 - CANOPY_INSET), split),
	}, {
		min = Vector2.new(base.X - w * TRUNK_HALF_WIDTH, split),
		max = Vector2.new(base.X + w * TRUNK_HALF_WIDTH, corner.Y + h),
	} }
end
--[[
	*
	 * Deixa meio transparente o objeto que está cobrindo o jogador. Só vale para o que a cena registra
	 * aqui: o que é alto ou cheio o bastante para esconder o personagem. Pedra e enfeite nunca somem.
	 
]]
local Occlusion
do
	Occlusion = setmetatable({}, {
		__tostring = function()
			return "Occlusion"
		end,
	})
	Occlusion.__index = Occlusion
	function Occlusion.new(...)
		local self = setmetatable({}, Occlusion)
		return self:constructor(...) or self
	end
	function Occlusion:constructor()
		self.occluders = {}
	end
	function Occlusion:add(image, sprite, position, silhouette)
		local base = worldToArtPx(position)
		local _occluders = self.occluders
		local _object = {
			image = image,
			bottomY = base.Y + sprite.size.Y - sprite.anchor.Y,
			alpha = 0,
		}
		local _left = "boxes"
		local _exp = silhouette
		local _anchor = sprite.anchor
		_object[_left] = boxesOf(_exp, base - _anchor, base, sprite.size)
		table.insert(_occluders, _object)
	end
	function Occlusion:update(player, dt)
		local feet = if player then worldToArtPx(player) else nil
		local _bodyMin = feet
		if _bodyMin ~= nil then
			local _vector2 = Vector2.new(-BODY_HALF_WIDTH, -BODY_TOP)
			_bodyMin = _bodyMin + _vector2
		end
		local bodyMin = _bodyMin
		local _bodyMax = feet
		if _bodyMax ~= nil then
			local _vector2 = Vector2.new(BODY_HALF_WIDTH, -BODY_BOTTOM)
			_bodyMax = _bodyMax + _vector2
		end
		local bodyMax = _bodyMax
		local blend = math.min(1, dt * FADE_RATE)
		for _, item in self.occluders do
			local target = 0
			if feet and bodyMin and bodyMax and item.bottomY > feet.Y + FEET_TO_BOTTOM then
				for _1, box in item.boxes do
					if overlaps(box, bodyMin, bodyMax) then
						target = FADED
						break
					end
				end
			end
			local gap = target - item.alpha
			if gap == 0 then
				continue
			end
			item.alpha = if math.abs(gap) < 0.01 then target else item.alpha + gap * blend
			item.image.ImageTransparency = item.alpha
		end
	end
end
return {
	Occlusion = Occlusion,
}
