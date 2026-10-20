-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
-- Os balões de reação, na folha de rostos do boneco do Cozy People (cozy_faces.png, de
-- tools/cozy_faces.py). O resto daquele boneco está em legacy/cozy-people/characterArt.ts.txt.
local _faces = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "faces")
local BUBBLE_COLUMNS = _faces.BUBBLE_COLUMNS
local BUBBLE_ORIGIN = _faces.BUBBLE_ORIGIN
local BUBBLE_SIZE = _faces.BUBBLE_SIZE
local ASSETS = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "assets").ASSETS
--[[
	*
	 * Folha de rostos (cozy_faces.png), montada por tools/cozy_faces.py: as peças de olhos, bocas e
	 * efeitos em tiras e, embaixo, os balões de reação. O id no registro (boneco.rostos).
	 
]]
local FACE_SHEET = ASSETS["boneco.rostos"]
local BUBBLE_FRAME = Vector2.new(BUBBLE_SIZE, BUBBLE_SIZE)
--* Canto do balão `bubble` na folha de rostos. 
local function bubbleOffset(bubble)
	local _vector2 = Vector2.new((bubble % BUBBLE_COLUMNS) * BUBBLE_SIZE, math.floor(bubble / BUBBLE_COLUMNS) * BUBBLE_SIZE)
	return BUBBLE_ORIGIN + _vector2
end
return {
	bubbleOffset = bubbleOffset,
	FACE_SHEET = FACE_SHEET,
	BUBBLE_FRAME = BUBBLE_FRAME,
}
