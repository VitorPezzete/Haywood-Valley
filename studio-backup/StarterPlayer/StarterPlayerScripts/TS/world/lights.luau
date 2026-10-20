-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
-- As luzes em pixel, no estilo do Aeko (decisão do usuário em 2026-10-17): um halo em faixas, cada faixa
-- com uma cor da paleta do Aeko e uma transparência só, sem degradê liso, deitado no chão por cima dos tiles.
-- A força da hora (`shared/daylight.ts`) multiplica a opacidade de todas as faixas; o halo não recebe o tom do
-- dia, porque ele é a própria luz. A tocha e a lareira tremem em 3 quadros. Quem está dentro de um halo (o
-- boneco) clareia e esquenta como o chão embaixo dele (`lightAt`).
--
-- Pelas janelas (pedido do usuário em 2026-10-18): de dia, a mancha do sol no piso logo abaixo, no formato da
-- janela, que escorrega para um lado de manhã e para o outro à tarde e fica alaranjada e comprida no pôr do
-- sol; de noite, a mancha azulada da lua, e o vidro da janela de noite fica na cor cheia. E o fogo da lareira
-- da casa, peça derivada (`Aseprite\iluminacao\fogo_lareira`).
local ASSETS = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "assets").ASSETS
local worldToArtPx = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "view").worldToArtPx
local GroundLayer = TS.import(script, script.Parent, "ground").GroundLayer
local _interior = TS.import(script, script.Parent, "interior")
local INTERIOR_TILE = _interior.INTERIOR_TILE
local sheetRect = _interior.sheetRect
local TILE_ANIMATION_FPS = _interior.TILE_ANIMATION_FPS
local _lightTiles = TS.import(script, script.Parent, "lightTiles")
local lightOf = _lightTiles.lightOf
local WINDOW_GLASS = _lightTiles.WINDOW_GLASS
local windowNightOrigin = _lightTiles.windowNightOrigin
local windowOf = _lightTiles.windowOf
local NO_TINT_ATTRIBUTE = TS.import(script, script.Parent, "tint").NO_TINT_ATTRIBUTE
--[[
	*
	 * A folha dos halos, `Aseprite\iluminacao\folha_luzes.png` (montada por `iluminacao\folha_luzes.py`, que também
	 * imprime `LIGHT_FRAMES`), enviada em 2026-10-18 (id no registro, luz.folha). Sem o id, os halos
	 * ficam de fora e o Output avisa; o tom do dia e as janelas de noite funcionam sem ela.
	 
]]
local LIGHT_SHEET = ASSETS["luz.folha"]
--[[
	*
	 * A folha 2, `Aseprite\iluminacao\folha_luzes_v2.png`: os recortes da folha 1 nos mesmos lugares, mais a mancha
	 * do sol, a do pôr do sol e o vidro de noite de cada janela (id no registro, luz.folha_v2). Sem o id, vale a
	 * folha 1, sem o sol pelas janelas e sem o vidro na cor cheia, e o Output avisa.
	 
]]
local LIGHT_SHEET_V2 = ASSETS["luz.folha_v2"]
--[[
	*
	 * O fogo da lareira da casa, `Aseprite\iluminacao\fogo_lareira\fogo_lareira.png` (4 quadros de 48 × 32 lado a
	 * lado, a boca da fornalha inteira, [57-59, 30-31] da folha da casa; id no registro, luz.fogo_lareira). Sem o id,
	 * a lareira fica sem fogo desenhado (só o halo) e o Output avisa.
	 
]]
local FIRE_SHEET = ASSETS["luz.fogo_lareira"]
local FIRE_TILE = { "casa", 57, 30 }
local FIRE_SIZE = Vector2.new(48, 32)
local FIRE_FRAMES = 4
--* O recorte de cada halo na folha 1 (e nos mesmos lugares na 2): o tamanho e o canto de cada quadro. 
local LIGHT_FRAMES = {
	lareira = {
		size = Vector2.new(104, 80),
		frames = { Vector2.new(2, 2), Vector2.new(108, 2), Vector2.new(214, 2) },
	},
	tocha = {
		size = Vector2.new(64, 50),
		frames = { Vector2.new(320, 2), Vector2.new(386, 2), Vector2.new(2, 84) },
	},
	abajur = {
		size = Vector2.new(44, 36),
		frames = { Vector2.new(68, 84) },
	},
	janela_noite = {
		size = Vector2.new(56, 30),
		frames = { Vector2.new(114, 84) },
	},
	janela_lua = {
		size = Vector2.new(56, 30),
		frames = { Vector2.new(172, 84) },
	},
}
--* Os recortes que só a folha 2 tem. 
local LIGHT_FRAMES_V2 = {
	janela_sol = {
		size = Vector2.new(56, 30),
		frames = { Vector2.new(2, 136) },
	},
	janela_poente = {
		size = Vector2.new(56, 44),
		frames = { Vector2.new(60, 136) },
	},
	vidro_simples_azul = {
		size = Vector2.new(48, 48),
		frames = { Vector2.new(118, 136) },
	},
	vidro_simples_amarelo = {
		size = Vector2.new(48, 48),
		frames = { Vector2.new(168, 136) },
	},
	vidro_cortina_vermelha = {
		size = Vector2.new(64, 48),
		frames = { Vector2.new(218, 136) },
	},
	vidro_cortina_verde = {
		size = Vector2.new(64, 48),
		frames = { Vector2.new(284, 136) },
	},
}
--* A imagem e o recorte de um tipo: da folha 2 quando ela tem id, senão da 1, ou nada. 
local function artOf(kind)
	local old = LIGHT_FRAMES[kind]
	if LIGHT_SHEET_V2 ~= "" then
		local art = old or LIGHT_FRAMES_V2[kind]
		local _result
		if art then
			local _object = {
				image = LIGHT_SHEET_V2,
			}
			for _k, _v in art do
				_object[_k] = _v
			end
			_result = _object
		else
			_result = nil
		end
		return _result
	end
	local _result
	if old and LIGHT_SHEET ~= "" then
		local _object = {
			image = LIGHT_SHEET,
		}
		for _k, _v in old do
			_object[_k] = _v
		end
		_result = _object
	else
		_result = nil
	end
	return _result
end
--[[
	*
	 * As faixas de cada halo, de dentro para fora: o raio em pixels de arte, a cor e a opacidade (o `luzes.json` da
	 * versão 2, em `Aseprite\exterior_teste\v2`, e o `folha_luzes_v2.json`). Servem para clarear quem está em cima
	 * do halo com a mesma faixa que o chão mostra. A janela é um retângulo: dentro dele vale a primeira faixa.
	 
]]
local HALO_BANDS = {
	lareira = { { 9, Color3.fromHex("#ffdd99"), 0.38 }, { 18, Color3.fromHex("#ffad30"), 0.3 }, { 27, Color3.fromHex("#ff9000"), 0.22 }, { 38, Color3.fromHex("#e4620c"), 0.13 }, { 48, Color3.fromHex("#9d4818"), 0.07 } },
	tocha = { { 6, Color3.fromHex("#ffdd99"), 0.38 }, { 13, Color3.fromHex("#ffad30"), 0.28 }, { 20, Color3.fromHex("#e4620c"), 0.16 }, { 28, Color3.fromHex("#9d4818"), 0.08 } },
	abajur = { { 5, Color3.fromHex("#ffffec"), 0.45 }, { 11, Color3.fromHex("#ffdd99"), 0.27 }, { 18, Color3.fromHex("#eaaf66"), 0.13 } },
	janela_noite = { { 0, Color3.fromHex("#ffdd99"), 0.36 } },
	janela_lua = { { 0, Color3.fromHex("#c9d1e4"), 0.27 } },
	janela_sol = { { 0, Color3.fromHex("#ffdd99"), 0.48 } },
	janela_poente = { { 0, Color3.fromHex("#ff9000"), 0.4 } },
}
--* O círculo de luz no chão, visto em 3/4, fica mais largo que alto (`achatamento_vertical`). 
local FLATTEN = 0.75
--* Abaixo desta força o halo some de vez, em vez de ficar quase transparente. 
local LIGHT_OFF = 0.02
--* Até quantas fileiras abaixo da janela (e da luz de parede) se procura o piso. 
local FLOOR_REACH = 6
--* A luz de parede fica com o centro estes pixels abaixo do alto da primeira célula de piso. 
local FLOOR_LIGHT_DROP = 4
--* Quanto a mancha do sol escorrega para o lado, no máximo (de manhã para a esquerda, à tarde para a direita). 
local SUN_SLIDE_PX = 2 * INTERIOR_TILE
--* Quando o halo acende: com a força das luzes, só de noite (janela acesa, lua), com o sol, ou no pôr do sol. 
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
	 * Procura no interior os tiles que acendem uma luz (`LIGHT_TILES`), as janelas e a lareira, e põe os halos na
	 * camada viva do chão (`Interior.live`), acima dos tiles e das sombras; o vidro de noite e o fogo vão logo acima
	 * dos tiles. Tudo o que muda fica fora do canvas grande dos tiles parados.
	 
]]
local function buildLights(interior)
	local halos = {}
	--* O fogo de cada lareira, que troca de quadro. 
	local fires = {}
	local _binding = interior.area
	local ax = _binding.x
	local ay = _binding.y
	local width = _binding.width
	local height = _binding.height
	if LIGHT_SHEET == "" and LIGHT_SHEET_V2 == "" then
		warnOnce("sheet", "[Luz] a folha dos halos ainda não tem id (luz.folha em assets/registro.json; arquivo " .. "Aseprite\\iluminacao\\folha_luzes.png): sem halos; o tom do dia e as janelas de noite funcionam")
	end
	if LIGHT_SHEET_V2 == "" then
		warnOnce("v2", "[Luz] a folha 2 das luzes ainda não tem id (luz.folha_v2 em assets/registro.json; arquivo " .. "Aseprite\\iluminacao\\folha_luzes_v2.png): sem o sol pelas janelas e sem o vidro de noite na cor cheia")
	end
	local add = function(kind, canvasCenter, mode, hangs)
		local art = artOf(kind)
		if not art then
			return nil
		end
		local _canvasCenter = canvasCenter
		local _vector2 = Vector2.new(art.size.X / 2, if hangs then 0 else art.size.Y / 2)
		local corner = _canvasCenter - _vector2
		local rounded = Vector2.new(math.round(corner.X), math.round(corner.Y))
		local label = Instance.new("ImageLabel")
		label.Name = `Light_{kind}`
		label.BackgroundTransparency = 1
		label.Image = art.image
		label.ImageRectOffset = art.frames[1]
		label.ImageRectSize = art.size
		label.Size = UDim2.fromOffset(art.size.X, art.size.Y)
		label.Position = UDim2.fromOffset(rounded.X, rounded.Y)
		label.ResampleMode = Enum.ResamplerMode.Pixelated
		label.ZIndex = GroundLayer.Light
		label.Visible = false
		label:SetAttribute(NO_TINT_ATTRIBUTE, true)
		label.Parent = interior.live.gui
		local halo = {
			label = label,
			kind = kind,
			mode = mode,
			frames = art.frames,
			size = art.size,
			base = rounded,
			corner = rounded,
			power = 0,
			phase = #halos,
			frame = -1,
		}
		table.insert(halos, halo)
		return halo
	end
	--* A primeira fileira de piso livre abaixo de (x, y), até `FLOOR_REACH` fileiras, ou nada. 
	local floorBelow = function(x, y)
		do
			local fy = y + 1
			local _shouldIncrement = false
			while true do
				if _shouldIncrement then
					fy += 1
				else
					_shouldIncrement = true
				end
				if not (fy <= y + FLOOR_REACH and fy < ay + height) then
					break
				end
				if not interior:blocked(x, fy) then
					return fy
				end
			end
		end
		return nil
	end
	--* O halo do tile (x, y) que acende uma luz, ou nada. A luz de parede desce até o piso logo abaixo dela. 
	local tileLight = function(tile, x, y)
		local light = lightOf(tile)
		if not light then
			return nil
		end
		local _exp = interior:canvasOf(x, y)
		local _vector2 = Vector2.new(light.center[1], light.center[2])
		local at = _exp + _vector2
		if light.floor then
			local fy = floorBelow(x, y)
			if fy ~= nil then
				at = Vector2.new(at.X, interior:canvasOf(x, fy).Y + FLOOR_LIGHT_DROP)
			end
		end
		return add(light.kind, at, if light.nightOnly == true then "night" else "lights", light.hangs == true)
	end
	--* A lua, o sol e o pôr do sol de uma janela das colunas x0 a x1 com a fileira de baixo em y1. 
	local windowLights = function(x0, x1, y1)
		local added = {}
		-- O piso: a primeira célula livre abaixo do meio da janela (a parede embaixo dela bloqueia).
		local fy = floorBelow(math.floor((x0 + x1 + 1) / 2), y1)
		if fy == nil then
			return added
		end
		local top = interior:canvasOf(x0, fy)
		local anchor = Vector2.new(top.X + ((x1 - x0 + 1) * INTERIOR_TILE) / 2, top.Y)
		for _, _binding_1 in { { "janela_lua", "night" }, { "janela_sol", "sun" }, { "janela_poente", "dusk" } } do
			local kind = _binding_1[1]
			local mode = _binding_1[2]
			local halo = add(kind, anchor, mode, true)
			if halo then
				table.insert(added, halo)
			end
		end
		return added
	end
	-- Os tiles que acendem.
	local fireplaces = 0
	do
		local y = ay
		local _shouldIncrement = false
		while true do
			if _shouldIncrement then
				y += 1
			else
				_shouldIncrement = true
			end
			if not (y < ay + height) then
				break
			end
			do
				local x = ax
				local _shouldIncrement_1 = false
				while true do
					if _shouldIncrement_1 then
						x += 1
					else
						_shouldIncrement_1 = true
					end
					if not (x < ax + width) then
						break
					end
					local tile = interior:topTile(x, y)
					if not tile then
						continue
					end
					if tile[1] == FIRE_TILE[1] and tile[2] == FIRE_TILE[2] and tile[3] == FIRE_TILE[3] then
						fireplaces += 1
						if FIRE_SHEET ~= "" then
							local at = interior:canvasOf(x, y)
							local label = Instance.new("ImageLabel")
							label.Name = "Fire"
							label.BackgroundTransparency = 1
							label.Image = FIRE_SHEET
							label.ImageRectSize = FIRE_SIZE
							label.ImageRectOffset = Vector2.zero
							label.Size = UDim2.fromOffset(FIRE_SIZE.X, FIRE_SIZE.Y)
							label.Position = UDim2.fromOffset(at.X, at.Y)
							label.ResampleMode = Enum.ResamplerMode.Pixelated
							label.ZIndex = GroundLayer.Piece
							-- O fogo é a própria luz: na cor cheia à noite.
							label:SetAttribute(NO_TINT_ATTRIBUTE, true)
							label.Parent = interior.live.gui
							table.insert(fires, label)
						end
					end
					tileLight(tile, x, y)
				end
			end
		end
	end
	if fireplaces > 0 and FIRE_SHEET == "" then
		warnOnce("fire", "[Luz] o fogo da lareira ainda não tem id (luz.fogo_lareira em assets/registro.json; arquivo " .. "Aseprite\\iluminacao\\fogo_lareira\\fogo_lareira.png): a lareira fica só com o halo")
	end
	-- As janelas: cada janela é um grupo de células de janela vizinhas; a lua, o sol e o pôr do sol caem no
	-- primeiro piso livre embaixo do meio dela.
	local isWindow = function(x, y)
		local tile = interior:topTile(x, y)
		return tile ~= nil and windowOf(tile) ~= nil
	end
	local seen = {}
	do
		local y = ay
		local _shouldIncrement = false
		while true do
			if _shouldIncrement then
				y += 1
			else
				_shouldIncrement = true
			end
			if not (y < ay + height) then
				break
			end
			do
				local x = ax
				local _shouldIncrement_1 = false
				while true do
					if _shouldIncrement_1 then
						x += 1
					else
						_shouldIncrement_1 = true
					end
					if not (x < ax + width) then
						break
					end
					local _arg0 = y * 1000 + x
					local _condition = seen[_arg0] ~= nil
					if not _condition then
						_condition = not isWindow(x, y)
					end
					if _condition then
						continue
					end
					-- A janela inteira, por busca em largura (com `while`: a fila cresce dentro do laço).
					local x0 = x
					local x1 = x
					local y1 = y
					local queue = { { x, y } }
					local _arg0_1 = y * 1000 + x
					seen[_arg0_1] = true
					local index = 0
					while index < #queue do
						local _exp = queue
						local _original = index
						index += 1
						local _binding_1 = _exp[_original + 1]
						local cx = _binding_1[1]
						local cy = _binding_1[2]
						x0 = math.min(x0, cx)
						x1 = math.max(x1, cx)
						y1 = math.max(y1, cy)
						for _, _binding_2 in { { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 } } do
							local dx = _binding_2[1]
							local dy = _binding_2[2]
							local nx = cx + dx
							local ny = cy + dy
							local _arg0_2 = ny * 1000 + nx
							local _condition_1 = seen[_arg0_2] ~= nil
							if not _condition_1 then
								_condition_1 = not isWindow(nx, ny)
							end
							if _condition_1 then
								continue
							end
							local _arg0_3 = ny * 1000 + nx
							seen[_arg0_3] = true
							local _arg0_4 = { nx, ny }
							table.insert(queue, _arg0_4)
						end
					end
					windowLights(x0, x1, y1)
				end
			end
		end
	end
	-- O vidro de noite de cada imagem de janela, na cor cheia por cima dela (só com a folha 2).
	local glasses = {}
	local glassShown = false
	local addGlass = function(win)
		local art = artOf(WINDOW_GLASS[win.group + 1])
		if not art then
			return nil
		end
		local _binding_1 = windowNightOrigin(win.group)
		local oc = _binding_1[1]
		local ol = _binding_1[2]
		local _exp = art.frames[1]
		local _arg0 = Vector2.new(win.night[2] - oc, win.night[3] - ol) * INTERIOR_TILE
		local offset = _exp + _arg0
		local label = Instance.new("ImageLabel")
		label.Name = "NightGlass"
		label.BackgroundTransparency = 1
		label.Image = art.image
		label.ImageRectOffset = offset
		label.Position = UDim2.fromOffset(win.canvas.X, win.canvas.Y)
		label.Size = UDim2.fromOffset(win.w * INTERIOR_TILE, win.h * INTERIOR_TILE)
		-- A imagem de janela é um pedaço contínuo da folha: o vidro de noite, o pedaço do mesmo tamanho.
		label.ImageRectSize = Vector2.new(win.w, win.h) * INTERIOR_TILE
		label.ResampleMode = Enum.ResamplerMode.Pixelated
		label.ZIndex = GroundLayer.Piece
		label.Visible = glassShown
		label:SetAttribute(NO_TINT_ATTRIBUTE, true)
		label.Parent = interior.live.gui
		table.insert(glasses, label)
		return label
	end
	for _, win in interior.windows do
		addGlass(win)
	end
	--[[
		*
		     * As luzes de fora do mapa (as peças postas no Decorar, o fogão aceso), por dono: os halos e, nas janelas, a
		     * versão de noite por cima da de dia e o vidro aceso. Trocar as células de um dono refaz as dele.
		     
	]]
	local extras = {}
	--* As imagens de janela de noite das peças postas, que aparecem só de noite (as do mapa trocam no `setNight`). 
	local nightWindows = {}
	local dropExtra = function(key)
		local _key = key
		local old = extras[_key]
		if not old then
			return nil
		end
		local _key_1 = key
		extras[_key_1] = nil
		for _, halo in old.halos do
			halo.label:Destroy()
			local index = (table.find(halos, halo) or 0) - 1
			if index >= 0 then
				table.remove(halos, index + 1)
			end
		end
		for _, label in old.labels do
			label:Destroy()
			for _1, list in { glasses, nightWindows } do
				local index = (table.find(list, label) or 0) - 1
				if index >= 0 then
					table.remove(list, index + 1)
				end
			end
		end
	end
	-- Do chão do mundo para o canvas: o canto da célula (ax, ay) é um ponto conhecido dos dois.
	local _exp = interior:canvasOf(ax, ay)
	local _arg0 = worldToArtPx(interior:cellCorner(ax, ay))
	local canvasZero = _exp - _arg0
	local lights
	lights = {
		count = #halos,
		version = 0,
		update = function(self, day, now)
			local tick = math.floor(now * TILE_ANIMATION_FPS)
			local slide = math.round(day.sunSide * SUN_SLIDE_PX)
			for _, halo in halos do
				local power = day.lights
				if halo.mode == "night" then
					power = if day.night then day.lights else 0
				elseif halo.mode == "sun" then
					power = if day.dusk then 0 else day.sun
				elseif halo.mode == "dusk" then
					power = if day.dusk then day.sun else 0
				end
				local shown = power > LIGHT_OFF
				local newPower = if shown then power else 0
				if newPower ~= halo.power then
					halo.power = newPower
					lights.version += 1
				end
				if halo.label.Visible ~= shown then
					halo.label.Visible = shown
				end
				if not shown then
					continue
				end
				local transparency = 1 - power
				if math.abs(halo.label.ImageTransparency - transparency) > 0.004 then
					halo.label.ImageTransparency = transparency
				end
				if halo.mode == "sun" or halo.mode == "dusk" then
					local _base = halo.base
					local _vector2 = Vector2.new(slide, 0)
					local corner = _base + _vector2
					if corner ~= halo.corner then
						halo.corner = corner
						lights.version += 1
						halo.label.Position = UDim2.fromOffset(corner.X, corner.Y)
					end
				end
				local frame = (tick + halo.phase) % #halo.frames
				if frame ~= halo.frame then
					halo.frame = frame
					halo.label.ImageRectOffset = halo.frames[frame + 1]
				end
			end
			if day.night ~= glassShown then
				glassShown = day.night
				for _, glass in glasses do
					glass.Visible = day.night
				end
				for _, night in nightWindows do
					night.Visible = day.night
				end
			end
			for _, fire in fires do
				local offset = Vector2.new((tick % FIRE_FRAMES) * FIRE_SIZE.X, 0)
				if fire.ImageRectOffset ~= offset then
					fire.ImageRectOffset = offset
				end
			end
		end,
		lightAt = function(self, position, tone)
			local _arg0_1 = worldToArtPx(position)
			local at = canvasZero + _arg0_1
			local color
			for _, halo in halos do
				if halo.power <= 0 then
					continue
				end
				local bands = HALO_BANDS[halo.kind]
				local band
				if bands[1][1] == 0 then
					-- A janela: o retângulo do halo.
					local inside = at.X >= halo.corner.X and at.Y >= halo.corner.Y and at.X < halo.corner.X + halo.size.X and at.Y < halo.corner.Y + halo.size.Y
					band = if inside then bands[1] else nil
				else
					local _corner = halo.corner
					local _arg0_2 = halo.size / 2
					local center = _corner + _arg0_2
					local d = math.sqrt((at.X - center.X) ^ 2 + ((at.Y - center.Y) / FLATTEN) ^ 2)
					-- ▼ ReadonlyArray.find ▼
					local _callback = function(_param)
						local radius = _param[1]
						return d < radius
					end
					local _result
					for _i, _v in bands do
						if _callback(_v, _i - 1, bands) == true then
							_result = _v
							break
						end
					end
					-- ▲ ReadonlyArray.find ▲
					band = _result
				end
				if not band then
					continue
				end
				-- A mesma mistura do halo sobre o chão: a cor da faixa por cima, com a opacidade dela vezes a força.
				color = (color or tone):Lerp(band[2], band[3] * halo.power)
			end
			return color
		end,
		setExtra = function(self, key, cells)
			dropExtra(key)
			lights.version += 1
			if #cells == 0 then
				return nil
			end
			local own = {
				halos = {},
				labels = {},
			}
			-- As células de janela, juntas: o retângulo delas é uma janela (a peça posta é uma janela só).
			local win
			for _, _binding_1 in cells do
				local x = _binding_1[1]
				local y = _binding_1[2]
				local tile = _binding_1[3]
				local halo = tileLight(tile, x, y)
				if halo then
					local _exp_1 = own.halos
					table.insert(_exp_1, halo)
				end
				local info = windowOf(tile)
				if not info then
					continue
				end
				if not win then
					win = {
						x0 = x,
						y0 = y,
						x1 = x,
						y1 = y,
						info = info,
					}
				end
				win.x1 = math.max(win.x1, x)
				win.y1 = math.max(win.y1, y)
				if x <= win.x0 and y <= win.y0 then
					win.x0 = x
					win.y0 = y
					win.info = info
				end
			end
			if win then
				for _, halo in windowLights(win.x0, win.x1, win.y1) do
					local _exp_1 = own.halos
					table.insert(_exp_1, halo)
				end
				local w = win.x1 - win.x0 + 1
				local h = win.y1 - win.y0 + 1
				local canvas = interior:canvasOf(win.x0, win.y0)
				-- A versão de noite da mesma folha, por cima da de dia (que a peça posta desenha), só de noite.
				local rect = sheetRect(win.info.night, w, h)
				local night = Instance.new("ImageLabel")
				night.Name = "NightWindow"
				night.BackgroundTransparency = 1
				night.Image = rect.image
				night.ImageRectOffset = rect.offset
				night.ImageRectSize = rect.size
				night.Size = UDim2.fromOffset(rect.size.X, rect.size.Y)
				night.Position = UDim2.fromOffset(canvas.X, canvas.Y)
				night.ResampleMode = Enum.ResamplerMode.Pixelated
				night.ZIndex = GroundLayer.Piece
				night.Visible = glassShown
				night.Parent = interior.live.gui
				table.insert(nightWindows, night)
				local _exp_1 = own.labels
				table.insert(_exp_1, night)
				local glass = addGlass({
					canvas = canvas,
					w = w,
					h = h,
					group = win.info.group,
					night = win.info.night,
				})
				if glass then
					local _exp_2 = own.labels
					table.insert(_exp_2, glass)
				end
			end
			local _key = key
			extras[_key] = own
		end,
		destroy = function(self)
			for _, halo in halos do
				halo.label:Destroy()
			end
			local _array = {}
			local _length = #_array
			local _glassesLength = #glasses
			table.move(glasses, 1, _glassesLength, _length + 1, _array)
			_length += _glassesLength
			local _firesLength = #fires
			table.move(fires, 1, _firesLength, _length + 1, _array)
			_length += _firesLength
			table.move(nightWindows, 1, #nightWindows, _length + 1, _array)
			for _, label in _array do
				label:Destroy()
			end
			table.clear(halos)
			table.clear(extras)
		end,
	}
	return lights
end
return {
	buildLights = buildLights,
	LIGHT_SHEET = LIGHT_SHEET,
	LIGHT_SHEET_V2 = LIGHT_SHEET_V2,
	FIRE_SHEET = FIRE_SHEET,
}
