-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
-- Cores de roupa que combinam com o personagem: a partir da cor do cabelo e da pele, cada corpo recebe
-- uma paleta diferente (pedido do usuário em 2026-10-17: a grade de corpos já mostra as roupas
-- combinando, cada uma de um jeito, e o corpo escolhido vem com essas cores).
local _appearance = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "appearance")
local CLOTH_KEYS = _appearance.CLOTH_KEYS
local colorOfRgb = _appearance.colorOfRgb
local ORIGINAL = _appearance.ORIGINAL
local partRgb = _appearance.partRgb
local rgbOfChannels = _appearance.rgbOfChannels
local Graal = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "graal").Graal
--[[
	*
	 * Esquemas de cor, em voltas do círculo de matizes a partir da matiz de base: a primeira entrada pinta
	 * a parte maior da roupa, as outras os detalhes. O esquema muda de corpo para corpo.
	 
]]
local SCHEMES = { { 0.5, 0.42, 0.58 }, { 0.08, -0.08, 0.5 }, { 0.33, 0.67, 0 }, { 0, 0, 0 }, { 0.45, 0.55, 0.15 }, { 0.17, 0.83, 0.5 } }
--* Claridade de cada parte no esquema de uma cor só, para as partes não saírem iguais. 
local MONO_VALUES = { 0.55, 0.85, 0.35 }
--* Parte quase sem cor (branco, cinza, preto) fica como o artista pintou: meia, sapato, contorno. 
local NEUTRAL_SATURATION = 0.15
--* Cabelo quase sem cor (preto, branco, cinza) não dá matiz; aí a base sai da pele. 
local GRAY_HAIR = 0.12
local function hsvOf(rgb)
	local h, s, v = colorOfRgb(rgb):ToHSV()
	return {
		h = h,
		s = s,
		v = v,
	}
end
local function rgbOfHsv(h, s, v)
	local color = Color3.fromHSV(((h % 1) + 1) % 1, math.clamp(s, 0, 1), math.clamp(v, 0, 1))
	return rgbOfChannels(color.R * 255, color.G * 255, color.B * 255)
end
--* Distância de matiz, em voltas (0 a 0,5). 
local function hueGap(a, b)
	local d = math.abs(a - b) % 1
	return math.min(d, 1 - d)
end
--[[
	*
	 * As cores das partes da roupa do corpo `body` combinando com o cabelo e a pele do visual: uma por
	 * parte, na ordem cloth0, cloth1..., ou `ORIGINAL` nas partes neutras. Cada corpo usa um esquema.
	 
]]
local function outfitColors(look, body)
	-- As cores que o artista pintou, no estilo do corpo no visual: as partes neutras são outras em cada um.
	local piece = Graal.body(body, look.bodyStyle)
	if not piece then
		return {}
	end
	local _condition = partRgb(look, "hairRgb")
	if _condition == nil then
		_condition = 0x6a4030
	end
	local hair = hsvOf(_condition)
	local _condition_1 = partRgb(look, "skinRgb")
	if _condition_1 == nil then
		_condition_1 = 0xffd0b0
	end
	local skin = hsvOf(_condition_1)
	local scheme = SCHEMES[body % #SCHEMES + 1]
	-- Uma pequena variação por corpo, para dois corpos com o mesmo esquema não saírem iguais.
	local jitter = ((body * 37) % 11) / 110 - 0.05
	local baseHue = (if hair.s < GRAY_HAIR then skin.h + 0.5 + (body % 5) * 0.13 else hair.h) + jitter
	local saturation = math.clamp(math.max(hair.s, 0.3) * 0.8 + 0.2, 0.4, 0.8)
	local colors = {}
	local painted = 0
	local _exp = piece.cloths
	-- ▼ ReadonlyArray.forEach ▼
	local _callback = function(original)
		local drawn = hsvOf(original)
		if drawn.s < NEUTRAL_SATURATION then
			table.insert(colors, ORIGINAL)
			return nil
		end
		local slot = painted % #scheme
		local hue = baseHue + scheme[slot + 1]
		local value = if scheme == SCHEMES[4] then MONO_VALUES[slot + 1] elseif slot == 0 then 0.7 else 0.85
		-- Roupa da cor da pele parece pele à mostra: afasta a matiz ou a claridade.
		if hueGap(hue, skin.h) < 0.06 and math.abs(value - skin.v) < 0.2 then
			hue += 0.12
			value = if skin.v > 0.6 then value - 0.25 else value + 0.2
		end
		local _arg0 = rgbOfHsv(hue, if slot == 0 then saturation else saturation * 0.9, value)
		table.insert(colors, _arg0)
		painted += 1
	end
	for _k, _v in _exp do
		_callback(_v, _k - 1, _exp)
	end
	-- ▲ ReadonlyArray.forEach ▲
	-- Corpo todo neutro (terno cinza, roupa preta): pinta pelo menos a parte maior.
	if painted == 0 and #colors > 0 then
		colors[1] = rgbOfHsv(baseHue + scheme[1], saturation * 0.6, 0.55)
	end
	return colors
end
--* O visual com as partes da roupa pintadas por `outfitColors`. 
local function withOutfitPalette(look, body)
	local _object = table.clone(look)
	setmetatable(_object, nil)
	local changed = _object
	local colors = outfitColors(look, body)
	-- ▼ ReadonlyArray.forEach ▼
	local _callback = function(key, index)
		local _condition = colors[index + 1]
		if _condition == nil then
			_condition = ORIGINAL
		end
		changed[key] = _condition
	end
	for _k, _v in CLOTH_KEYS do
		_callback(_v, _k - 1, CLOTH_KEYS)
	end
	-- ▲ ReadonlyArray.forEach ▲
	return changed
end
return {
	outfitColors = outfitColors,
	withOutfitPalette = withOutfitPalette,
}
