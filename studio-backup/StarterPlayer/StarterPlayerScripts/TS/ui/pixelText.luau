-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
-- Texto na fonte de pixel das pranchas do kit (decisão do usuário em 2026-10-17): cada letra é uma
-- imagem da folha pixel_font.png (tools/pixel_font.py), pintada por ImageColor3, então o texto sai
-- igual às pranchas e nítido em qualquer ampliação. Serve para qualquer texto traduzido; letra que a
-- fonte não tem vira "?".
local _vide = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "vide", "src")
local Vide = _vide
local derive = _vide.derive
local ASSETS = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "assets").ASSETS
local _pixelFont = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "pixelFont")
local PIXEL_FONT_CELL = _pixelFont.PIXEL_FONT_CELL
local PIXEL_FONT_GLYPHS = _pixelFont.PIXEL_FONT_GLYPHS
local PIXEL_FONT_ORIGIN = _pixelFont.PIXEL_FONT_ORIGIN
local PIXEL_FONT_VARIANT_HEIGHT = _pixelFont.PIXEL_FONT_VARIANT_HEIGHT
local WHITE = Color3.new(1, 1, 1)
--* A folha da fonte (Aseprite/pixel_font.png); o id no registro (ui.fonte_pixel). 
local PIXEL_FONT_IMAGE = ASSETS["ui.fonte_pixel"]
--* Altura das maiúsculas e distância entre linhas, em pixels de arte. 
local CAP_HEIGHT = 7
local LINE_HEIGHT = 11
local VARIANT_NORMAL = 0
local VARIANT_BOLD = 1
local VARIANT_OUTLINE = 2
local function glyphOf(ch)
	return PIXEL_FONT_GLYPHS[ch] or PIXEL_FONT_GLYPHS["?"]
end
local function charsOf(text)
	local out = {}
	for _, code in utf8.codes(text) do
		local _arg0 = utf8.char(code)
		table.insert(out, _arg0)
	end
	return out
end
--* Largura do texto em pixels de arte, como o textW das pranchas. 
local function textWidth(text, bold)
	if bold == nil then
		bold = false
	end
	local width = 0
	for _, ch in charsOf(text) do
		width += glyphOf(ch)[3] + 1 + (if bold then 1 else 0)
	end
	return math.max(0, width - 1)
end
--* As letras com o lugar de cada uma (x a partir da esquerda da caixa, y no topo das maiúsculas da linha). 
local function layout(text, bold, width, align, wrap, lineHeight)
	local lines = {}
	if wrap and width ~= nil then
		local line = {}
		for _, word in string.split(text, " ") do
			local _result
			if #line > 0 then
				local _array = {}
				local _length = #_array
				local _lineLength = #line
				table.move(line, 1, _lineLength, _length + 1, _array)
				_length += _lineLength
				_array[_length + 1] = " "
				local _array_1 = charsOf(word)
				table.move(_array_1, 1, #_array_1, _length + 2, _array)
				_result = _array
			else
				_result = charsOf(word)
			end
			local trial = _result
			if #line > 0 and textWidth(table.concat(trial, ""), bold) > width then
				local _line = line
				table.insert(lines, _line)
				line = charsOf(word)
			else
				line = trial
			end
		end
		local _line = line
		table.insert(lines, _line)
	else
		local _arg0 = charsOf(text)
		table.insert(lines, _arg0)
	end
	local placed = {}
	-- ▼ ReadonlyArray.forEach ▼
	local _callback = function(line, row)
		local lineWidth = textWidth(table.concat(line, ""), bold)
		local x = 0
		if width ~= nil and align == "center" then
			x = math.floor((width - lineWidth) / 2)
		elseif width ~= nil and align == "right" then
			x = width - lineWidth
		end
		for _, ch in line do
			if ch ~= " " then
				local _arg0 = {
					ch = ch,
					x = x,
					y = row * lineHeight,
				}
				table.insert(placed, _arg0)
			end
			x += glyphOf(ch)[3] + 1 + (if bold then 1 else 0)
		end
	end
	for _k, _v in lines do
		_callback(_v, _k - 1, lines)
	end
	-- ▲ ReadonlyArray.forEach ▲
	return {
		placed = placed,
		lines = #lines,
	}
end
--* Um texto na fonte de pixel. 
local function PixelText(props)
	local _binding = props
	local k = _binding.k
	local bold = props.bold == true or props.outline ~= nil
	local align = props.align or "left"
	local _condition = props.maxChars
	if _condition == nil then
		_condition = 32
	end
	local max = _condition
	local _condition_1 = props.zIndex
	if _condition_1 == nil then
		_condition_1 = 1
	end
	local z = _condition_1
	local fade = props.transparency or (function()
		return 0
	end)
	local _condition_2 = props.lineHeight
	if _condition_2 == nil then
		_condition_2 = LINE_HEIGHT
	end
	local lineHeight = _condition_2
	local placed = derive(function()
		return layout(props.text(), bold, props.width, align, props.wrap == true, lineHeight)
	end)
	local pool = function(variant, dy, color, layer, gradient)
		local labels = {}
		do
			local _index = 0
			local _shouldIncrement = false
			while true do
				local index = _index
				if _shouldIncrement then
					index += 1
				else
					_shouldIncrement = true
				end
				if not (index < max) then
					break
				end
				local _arg0 = Vide.jsx("imagelabel", {
					BackgroundTransparency = 1,
					Image = PIXEL_FONT_IMAGE,
					ImageRectSize = PIXEL_FONT_CELL,
					ImageRectOffset = function()
						local item = placed().placed[index + 1]
						if not item then
							return Vector2.zero
						end
						local _binding_1 = glyphOf(item.ch)
						local gx = _binding_1[1]
						local gy = _binding_1[2]
						return Vector2.new(gx, gy + variant * PIXEL_FONT_VARIANT_HEIGHT)
					end,
					ImageColor3 = function()
						return color() or WHITE
					end,
					ImageTransparency = fade,
					ResampleMode = "Pixelated",
					Visible = function()
						return placed().placed[index + 1] ~= nil and color() ~= nil
					end,
					Position = function()
						local item = placed().placed[index + 1]
						if not item then
							return UDim2.new()
						end
						return UDim2.fromOffset((item.x - PIXEL_FONT_ORIGIN.X) * k(), (item.y + dy - PIXEL_FONT_ORIGIN.Y) * k())
					end,
					Size = function()
						return UDim2.fromOffset(PIXEL_FONT_CELL.X * k(), PIXEL_FONT_CELL.Y * k())
					end,
					ZIndex = z + layer,
				}, gradient and Vide.jsx("uigradient", {
					Color = gradient,
					Rotation = 90,
				}))
				table.insert(labels, _arg0)
				_index = index
			end
		end
		return labels
	end
	local _attributes = {}
	local _condition_3 = props.name
	if _condition_3 == nil then
		_condition_3 = "PixelText"
	end
	_attributes.Name = _condition_3
	_attributes.BackgroundTransparency = 1
	_attributes.Position = props.position
	_attributes.Size = function()
		local _condition_4 = props.width
		if _condition_4 == nil then
			_condition_4 = 0
		end
		return UDim2.fromOffset(_condition_4 * k(), placed().lines * lineHeight * k())
	end
	_attributes.ZIndex = z
	return Vide.jsx("frame", _attributes, props.outline and pool(VARIANT_OUTLINE, 0, props.outline, 0), props.shadow and pool(if bold then VARIANT_BOLD else VARIANT_NORMAL, 1, props.shadow, 0), pool(if bold then VARIANT_BOLD else VARIANT_NORMAL, 0, props.color, 1, props.gradient))
end
return {
	textWidth = textWidth,
	PixelText = PixelText,
	PIXEL_FONT_IMAGE = PIXEL_FONT_IMAGE,
	CAP_HEIGHT = CAP_HEIGHT,
	LINE_HEIGHT = LINE_HEIGHT,
}
