-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local worldToArtPx = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "view").worldToArtPx
--* Quadros por segundo do ciclo de vento. 
local WIND_FPS = 4
--* Distância na tela, em pixels de arte, entre duas rajadas: o vento atravessa o mapa em onda. 
local GUST_LENGTH = 220
--* Troca os quadros de tudo o que balança ao vento. 
local Wind
do
	Wind = setmetatable({}, {
		__tostring = function()
			return "Wind"
		end,
	})
	Wind.__index = Wind
	function Wind.new(...)
		local self = setmetatable({}, Wind)
		return self:constructor(...) or self
	end
	function Wind:constructor()
		self.swaying = {}
	end
	function Wind:add(image, sprite, position)
		if #sprite.frames < 2 then
			return nil
		end
		local px = worldToArtPx(position)
		local delay = ((px.X + px.Y * 2) / GUST_LENGTH) * #sprite.frames
		local _swaying = self.swaying
		local _arg0 = {
			image = image,
			sprite = sprite,
			delay = delay,
			shown = 0,
		}
		table.insert(_swaying, _arg0)
	end
	function Wind:update(clock)
		local step = clock * WIND_FPS
		for _, item in self.swaying do
			local count = #item.sprite.frames
			local frame = math.floor(step + item.delay) % count
			if frame == item.shown then
				continue
			end
			item.shown = frame
			item.image.ImageRectOffset = item.sprite.frames[frame + 1]
		end
	end
end
return {
	Wind = Wind,
}
