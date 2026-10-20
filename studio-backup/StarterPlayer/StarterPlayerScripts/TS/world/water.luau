-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
-- A água do exterior que não vem dos tiles do mapa: o mar fundo em volta do mapa (a ilha no meio do mar) e o
-- boneco andando na água rasa (a água cobrindo os pés, a onda em volta e o respingo a cada passo). As
-- imagens saem de `Aseprite\exterior_teste\juncao\mar_infinito\gerar_mar_infinito.py`, com as peças e as
-- cores da junção. Sem o id de uma imagem, vale o que dá com a folha da junção já enviada (o mar parado, a água
-- sobre os pés sem a onda nem o respingo) e o Output avisa uma vez.
local _assets = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "assets")
local ASSET_LISTS = _assets.ASSET_LISTS
local ASSETS = _assets.ASSETS
local EXTERIOR_SHEETS = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiors").EXTERIOR_SHEETS
local FEET = TS.import(script, script.Parent, "graalArt").FEET
local TILE_PX = 16
--[[
	*
	 * `mar_infinito_q0.png` a `_q3.png` (512 × 512 cada): o mar fundo da junção, que repete sem costura, um quadro
	 * por imagem, com os decalques do mar fundo no quadro de mesmo número. Um quadro por imagem porque o
	 * `ScaleType.Tile` do Roblox não repete um recorte: com `ImageRectSize`, ele estica o recorte na imagem toda
	 * (conferido no Studio em 2026-10-18). Os ids vêm do registro (mar.infinito.0 a 3; o quadro 3 é igual ao 1, o
	 * mesmo arquivo e o mesmo id).
	 
]]
local SEA_SHEETS = ASSET_LISTS["mar.infinito"]
local SEA_TILE = 512
--* Sem a folha do mar: a base do mar fundo da junção (linha 36 da `folha_juncao.png`, uma cor só), esticada. 
local DEEP_BASE = Vector2.new(0, 36 * TILE_PX)
--[[
	*
	 * `agua_rasa_boneco.png` (128 × 56), em células de 32 × 14 com a sola na última linha e o pé no meio: linha 0 a
	 * volta de trás da onda (4 quadros), 1 a água da frente com a volta da frente (4), 2 e 3 o respingo do pé
	 * esquerdo e do direito (3 cada). O id no registro (agua.rasa_boneco).
	 
]]
local WADE_SHEET = ASSETS["agua.rasa_boneco"]
local WADE_CELL = Vector2.new(32, 14)
--* O canto da célula na tela do boneco (48 × 48): o meio sobre o pé, a última linha na sola. 
local WADE_AT = Vector2.new(FEET.X - WADE_CELL.X / 2, FEET.Y + 1 - WADE_CELL.Y)
local WADE_FRAMES = 4
local SPLASH_FRAMES = 3
--* Quadros por segundo do respingo: os 3 cabem nos 0,2 s de um passo (`WALK_STEP_PX` × 4 a 160 pixels por segundo). 
local SPLASH_FPS = 15
--* Linhas da folha: a volta de trás, a água da frente, o respingo esquerdo e o direito. 
--* Sem a folha: a base do mar raso da junção (linha 37, uma cor só), esticada sobre os pés. 
local SHALLOW_BASE = Vector2.new(0, 37 * TILE_PX)
--* A faixa de água sem a folha, na tela do boneco: 28 × 6 pixels, da linha 42 até a sola. 
local WADE_BAND_AT = Vector2.new(FEET.X - 14, FEET.Y - 5)
local WADE_BAND = Vector2.new(28, 6)
local warned = {}
local function warnOnce(key, text)
	local _key = key
	if warned[_key] ~= nil then
		return nil
	end
	local _key_1 = key
	warned[_key_1] = true
	warn(text)
end
--[[
	*
	 * O mar fundo em volta do mapa: uma imagem por quadro, do tamanho do canvas do chão, com a imagem de 512 × 512
	 * repetida (`ScaleType.Tile`, sem recorte); trocar de quadro é mostrar outra. Fica por baixo de tudo no canvas;
	 * o mapa cobre o meio. Pega o tom do dia sozinho (está na pasta `World`).
	 
]]
local function createSea(parent, zIndex)
	local label = function(name)
		local image = Instance.new("ImageLabel")
		image.Name = name
		image.BackgroundTransparency = 1
		image.Size = UDim2.fromScale(1, 1)
		image.ResampleMode = Enum.ResamplerMode.Pixelated
		image.ZIndex = zIndex
		return image
	end
	-- ▼ ReadonlyArray.every ▼
	local _result = true
	local _callback = function(id)
		return id ~= ""
	end
	for _k, _v in SEA_SHEETS do
		if not _callback(_v, _k - 1, SEA_SHEETS) then
			_result = false
			break
		end
	end
	-- ▲ ReadonlyArray.every ▲
	local animated = _result
	local labels = {}
	if animated then
		-- ▼ ReadonlyArray.forEach ▼
		local _callback_1 = function(id, frame)
			local image = label(`Sea{frame}`)
			image.Image = id
			image.ScaleType = Enum.ScaleType.Tile
			image.TileSize = UDim2.fromOffset(SEA_TILE, SEA_TILE)
			image.Visible = frame == 0
			image.Parent = parent
			table.insert(labels, image)
		end
		for _k, _v in SEA_SHEETS do
			_callback_1(_v, _k - 1, SEA_SHEETS)
		end
		-- ▲ ReadonlyArray.forEach ▲
	else
		warnOnce("sea", "[Água] mar_infinito_q0..3.png ainda sem id (mar.infinito em assets/registro.json): o mar de fora fica parado")
		-- A base do mar fundo tem uma cor só: esticar o recorte de 16 × 16 dá os mesmos pixels que repeti-lo.
		local image = label("Sea")
		local _condition = EXTERIOR_SHEETS[1]
		if _condition == nil then
			_condition = ""
		end
		image.Image = _condition
		image.ImageRectOffset = DEEP_BASE
		image.ImageRectSize = Vector2.new(TILE_PX, TILE_PX)
		image.Parent = parent
		table.insert(labels, image)
	end
	local shown = 0
	return {
		labels = labels,
		animate = function(self, tick)
			if not animated then
				return nil
			end
			local frame = tick % #labels
			if frame == shown then
				return nil
			end
			labels[shown + 1].Visible = false
			labels[frame + 1].Visible = true
			shown = frame
		end,
	}
end
--* Se a folha da água rasa tem id; sem ela, só a faixa de água sobre os pés. 
local function hasWadeSheet()
	if WADE_SHEET == "" then
		warnOnce("wade", "[Água] agua_rasa_boneco.png ainda sem id (agua.rasa_boneco em assets/registro.json): sem a onda e o respingo")
	end
	return WADE_SHEET ~= ""
end
--* A imagem e o recorte de uma célula da folha da água rasa; sem a folha, a base do mar raso da junção. 
local function wadeImage(row, frame)
	if WADE_SHEET == "" then
		local _condition = EXTERIOR_SHEETS[1]
		if _condition == nil then
			_condition = ""
		end
		return { _condition, SHALLOW_BASE, Vector2.new(TILE_PX, TILE_PX) }
	end
	return { WADE_SHEET, Vector2.new(frame * WADE_CELL.X, row * WADE_CELL.Y), WADE_CELL }
end
return {
	createSea = createSea,
	hasWadeSheet = hasWadeSheet,
	wadeImage = wadeImage,
	SEA_SHEETS = SEA_SHEETS,
	WADE_SHEET = WADE_SHEET,
	WADE_CELL = WADE_CELL,
	WADE_AT = WADE_AT,
	WADE_FRAMES = WADE_FRAMES,
	SPLASH_FRAMES = SPLASH_FRAMES,
	SPLASH_FPS = SPLASH_FPS,
	WADE_BAND_AT = WADE_BAND_AT,
	WADE_BAND = WADE_BAND,
}
