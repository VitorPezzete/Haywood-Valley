-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local INTERIOR_TILE = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiorChoice").INTERIOR_TILE
local _interiorMap = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiorMap")
local ANIMATION_FRAMES = _interiorMap.ANIMATION_FRAMES
local isAnimated = _interiorMap.isAnimated
local _interiors = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiors")
local EXTERIOR_SHEETS = _interiors.EXTERIOR_SHEETS
local INTERIOR_SHEETS = _interiors.INTERIOR_SHEETS
local _view = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "view")
local groundOffset = _view.groundOffset
local snapToArtPx = _view.snapToArtPx
local createCollider = TS.import(script, script.Parent, "collider").createCollider
local _ground = TS.import(script, script.Parent, "ground")
local createGround = _ground.createGround
local GroundLayer = _ground.GroundLayer
local LIVE_Z_OFFSET = _ground.LIVE_Z_OFFSET
local UNDER_Z_OFFSET = _ground.UNDER_Z_OFFSET
local _lightTiles = TS.import(script, script.Parent, "lightTiles")
local isLightSource = _lightTiles.isLightSource
local windowOf = _lightTiles.windowOf
local NO_TINT_ATTRIBUTE = TS.import(script, script.Parent, "tint").NO_TINT_ATTRIBUTE
local createSea = TS.import(script, script.Parent, "water").createSea
--* Colunas de cada metade: a folha de 128 colunas foi enviada em duas imagens de 1024 × 512. 
local HALF_COLS = 64
--[[
	*
	 * Vazio em volta do mapa, em tiles, para a tela não mostrar o céu com o personagem na borda. Com a câmera
	 * no mais longe, a tela mostra até 768 pixels de arte de altura, uns 1370 de largura em 16:9 (`zoomRange`).
	 
]]
local DEFAULT_MARGIN = Vector2.new(48, 26)
--[[
	*
	 * A margem dos mapas com exterior, cheia de mar: 1024 × 512 pixels de arte em cada lado, para o mar ir até a
	 * borda da tela com a câmera no mais longe (até uns 845 de altura, `FARTHEST_SLACK`), em telas até 2,4 : 1.
	 
]]
local SEA_MARGIN = Vector2.new(64, 32)
--[[
	*
	 * Quadros por segundo dos tiles animados (chamas, patinhos, torneira): 4, como pediu o usuário. O Graal não
	 * diz o ritmo dos tiles animados dele; 4 por segundo é o do vento das árvores do jogo (`wind.ts`).
	 
]]
local TILE_ANIMATION_FPS = 4
--[[
	*
	 * O recorte do meio de um tile de uma cor só que se estica num retângulo: 8 × 8, longe da borda, para a
	 * amostragem não pegar o tile vizinho. O `ScaleType.Tile` do Roblox não repete um recorte (estica o recorte na
	 * imagem toda, conferido no Studio em 2026-10-18), então só o tile de uma cor só cobre mais de uma célula.
	 
]]
local FLAT_INSET = 4
local FLAT_SIZE = Vector2.new(8, 8)
-- Ordem no canvas do chão: o mar de fora (nos mapas com exterior) e o vazio embaixo de tudo, os tiles por
-- cima, a sombra do personagem acima deles.
local SEA_Z = GroundLayer.Grass - 1
local BACKDROP_Z = GroundLayer.Grass
local TILE_Z = GroundLayer.Soil
--* Um retângulo de células que vira uma imagem só. 
local warned = {}
--[[
	*
	 * Junta as células em retângulos que viram uma imagem cada: um pedaço contínuo da folha (as células vizinhas
	 * no mapa são vizinhas na folha, na mesma metade), copiado como está, ou tiles de uma cor só, todos da mesma
	 * cor (`flatOf`), que viram o recorte do meio de um deles esticado. Guloso: em ordem de leitura, cresce para a
	 * direita e depois para baixo, e fica com o maior dos dois.
	 
]]
local function mergeCells(width, height, cellTile, flatOf)
	if flatOf == nil then
		flatOf = function()
			return nil
		end
	end
	local used = {}
	local runs = {}
	local free = function(x, y)
		local _condition = x < width and y < height
		if _condition then
			local _arg0 = y * width + x
			_condition = not (used[_arg0] ~= nil)
		end
		return _condition
	end
	local contiguous = function(tile, x, y, dc, dl)
		if not free(x, y) then
			return false
		end
		local other = cellTile(x, y)
		return other ~= nil and other[1] == tile[1] and other[2] == tile[2] + dc and other[3] == tile[3] + dl and math.floor(other[2] / HALF_COLS) == math.floor(tile[2] / HALF_COLS)
	end
	local sameColor = function(color, x, y)
		if not free(x, y) then
			return false
		end
		local other = cellTile(x, y)
		return other ~= nil and flatOf(other) == color
	end
	local grow = function(fits, x, y)
		local w = 1
		while fits(x + w, y, w, 0) do
			w += 1
		end
		local h = 1
		local more = true
		while more do
			do
				local i = 0
				local _shouldIncrement = false
				while true do
					if _shouldIncrement then
						i += 1
					else
						_shouldIncrement = true
					end
					if not (i < w and more) then
						break
					end
					more = fits(x + i, y + h, i, h)
				end
			end
			if more then
				h += 1
			end
		end
		return { w, h }
	end
	do
		local y = 0
		local _shouldIncrement = false
		while true do
			if _shouldIncrement then
				y += 1
			else
				_shouldIncrement = true
			end
			if not (y < height) then
				break
			end
			do
				local x = 0
				local _shouldIncrement_1 = false
				while true do
					if _shouldIncrement_1 then
						x += 1
					else
						_shouldIncrement_1 = true
					end
					if not (x < width) then
						break
					end
					local _arg0 = y * width + x
					if used[_arg0] ~= nil then
						continue
					end
					local tile = cellTile(x, y)
					if not tile then
						continue
					end
					local _binding = grow(function(cx, cy, i, j)
						return contiguous(tile, cx, cy, i, j)
					end, x, y)
					local cw = _binding[1]
					local ch = _binding[2]
					local run = {
						x = x,
						y = y,
						w = cw,
						h = ch,
						tile = tile,
						flat = false,
					}
					local color = flatOf(tile)
					if color ~= nil then
						local _binding_1 = grow(function(cx, cy)
							return sameColor(color, cx, cy)
						end, x, y)
						local fw = _binding_1[1]
						local fh = _binding_1[2]
						if fw * fh > cw * ch then
							run = {
								x = x,
								y = y,
								w = fw,
								h = fh,
								tile = tile,
								flat = true,
							}
						end
					end
					do
						local j = 0
						local _shouldIncrement_2 = false
						while true do
							if _shouldIncrement_2 then
								j += 1
							else
								_shouldIncrement_2 = true
							end
							if not (j < run.h) then
								break
							end
							do
								local i = 0
								local _shouldIncrement_3 = false
								while true do
									if _shouldIncrement_3 then
										i += 1
									else
										_shouldIncrement_3 = true
									end
									if not (i < run.w) then
										break
									end
									local _arg0_1 = (y + j) * width + x + i
									used[_arg0_1] = true
								end
							end
						end
					end
					local _run = run
					table.insert(runs, _run)
				end
			end
		end
	end
	return runs
end
--[[
	*
	 * A imagem e o canto, na metade da folha, de `w` × `h` tiles a partir do tile `tile`: um recorte contínuo
	 * da folha, sem mudar nenhum pixel (o recorte não pode passar da coluna 63 para a 64, de uma metade a outra).
	 
]]
local function sheetRect(tile, w, h)
	if w == nil then
		w = 1
	end
	if h == nil then
		h = 1
	end
	local _binding = tile
	local sheet = _binding[1]
	local col = _binding[2]
	local row = _binding[3]
	local halves = INTERIOR_SHEETS[sheet]
	return {
		image = if halves then halves[(if col < HALF_COLS then 0 else 1) + 1] else "",
		offset = Vector2.new((col % HALF_COLS) * INTERIOR_TILE, row * INTERIOR_TILE),
		size = Vector2.new(w, h) * INTERIOR_TILE,
	}
end
--* Uma imagem com o recorte da folha, sem mudar nenhum pixel: só tiles inteiros de 16 × 16. 
local function tileImage(parent, run, at, zIndex)
	local _binding = run.tile
	local sheet = _binding[1]
	local col = _binding[2]
	local row = _binding[3]
	local halves = INTERIOR_SHEETS[sheet]
	if not halves and not (warned[sheet] ~= nil) then
		warned[sheet] = true
		warn(`[Interior] folha desconhecida: {sheet}; rode npm run diorama:jogo de novo`)
	end
	local label = Instance.new("ImageLabel")
	label.BackgroundTransparency = 1
	label.Position = UDim2.fromOffset(at.X, at.Y)
	label.Size = UDim2.fromOffset(run.w * INTERIOR_TILE, run.h * INTERIOR_TILE)
	label.Image = if halves then halves[(if col < HALF_COLS then 0 else 1) + 1] else ""
	local corner = Vector2.new((col % HALF_COLS) * INTERIOR_TILE, row * INTERIOR_TILE)
	if run.flat then
		-- Uma cor só: o meio do tile esticado dá os mesmos pixels que repeti-lo.
		local _vector2 = Vector2.new(FLAT_INSET, FLAT_INSET)
		label.ImageRectOffset = corner + _vector2
		label.ImageRectSize = FLAT_SIZE
	else
		label.ImageRectOffset = corner
		label.ImageRectSize = Vector2.new(run.w, run.h) * INTERIOR_TILE
	end
	label.ResampleMode = Enum.ResamplerMode.Pixelated
	label.ZIndex = zIndex
	label.Parent = parent
	return label
end
--[[
	*
	 * Monta no mundo um interior pintado no Diorama, com a técnica do jogo. `origin` é o canto de cima à
	 * esquerda da célula (0, 0) do bloco, no chão (vai para o pixel de arte mais perto). Cada tile tem 16
	 * pixels: meio stud de largura e meia célula do chão de fundo.
	 *
	 * - **As três camadas** vão deitadas no chão, como no Graal (a arte já vem em 3/4): um `SurfaceGui` só, com
	 *   o `ZOffset` do chão, então o boneco fica por cima de todo tile do mapa. Os tiles do Aeko são opacos, então
	 *   cada célula mostra só o tile de cima: a frente sobre o objeto, o objeto sobre o chão. O vazio preto é o
	 *   fundo do canvas inteiro (uma imagem esticada do tile, que tem uma cor só) e não é desenhado célula a
	 *   célula; os demais tiles se juntam em retângulos (`mergeCells`). No mapa com exterior, o vazio cobre só o
	 *   retângulo do mapa e o mar fundo (`water.ts`) enche o resto do canvas: a ilha fica no meio do mar.
	 * - **Bloqueio**: as células que bloqueiam, mais uma volta em torno do retângulo do mapa, juntadas em
	 *   retângulos, cada um um bloqueio invisível de `collider.ts`.
	 * - **Peças móveis** (com `map`, `shared/interiorMap.ts`): onde uma peça que se segura ou carrega estava, o
	 *   chão mostra o piso da camada de baixo e não bloqueia; a peça é desenhada e bloqueia à parte
	 *   (`client/world/pieces.ts`), para poder mudar de lugar. Os tiles do teste das ações (a água) também vêm dele.
	 
]]
local function buildInterior(parent, data, origin, map)
	local started = os.clock()
	local corner = snapToArtPx(origin)
	local _binding = data
	local width = _binding.width
	local height = _binding.height
	local margin = if data.terrain then SEA_MARGIN else DEFAULT_MARGIN
	local folder = Instance.new("Folder")
	folder.Name = `Interior_{data.id}`
	-- Uma lista por camada com o número de cada célula do retângulo (0 vazia), em ordem de leitura.
	local tiles = 0
	local _exp = data.layers
	-- ▼ ReadonlyArray.map ▼
	local _newValue = table.create(#_exp)
	local _callback = function(rows)
		local cells = {}
		for _, row in rows do
			for _1, part in string.split(row, " ") do
				local _condition = tonumber(part)
				if _condition == nil then
					_condition = 0
				end
				local n = _condition
				if n ~= 0 then
					tiles += 1
				end
				table.insert(cells, n)
			end
		end
		return cells
	end
	for _k, _v in _exp do
		_newValue[_k] = _callback(_v, _k - 1, _exp)
	end
	-- ▲ ReadonlyArray.map ▲
	local layers = _newValue
	local numberAt = function(layer, x, y)
		return layers[layer + 1][y * width + x + 1]
	end
	local tileOf = function(n)
		return if n == 0 then nil else data.tiles[n]
	end
	local _binding_1 = data.backdrop
	local voidSheet = _binding_1[1]
	local voidCol = _binding_1[2]
	local voidRow = _binding_1[3]
	local isVoid = function(tile)
		return tile[1] == voidSheet and tile[2] == voidCol and tile[3] == voidRow
	end
	-- Os tiles de uma cor só (o gerador leu os PNG): só eles cobrem um retângulo esticados.
	local flatColors = {}
	for _, _binding_2 in data.flat or {} do
		local n = _binding_2[1]
		local color = _binding_2[2]
		local _binding_3 = data.tiles[n]
		local sheet = _binding_3[1]
		local col = _binding_3[2]
		local row = _binding_3[3]
		local _arg0 = `{sheet},{col},{row}`
		flatColors[_arg0] = color
	end
	local flatOf = function(tile)
		local _arg0 = `{tile[1]},{tile[2]},{tile[3]}`
		return flatColors[_arg0]
	end
	--* Canto de cima à esquerda da célula (x, y) do bloco, no chão. 
	local cellCorner = function(x, y)
		local _arg0 = groundOffset(x * INTERIOR_TILE, y * INTERIOR_TILE)
		return corner + _arg0
	end
	-- O chão: o canvas cobre o retângulo do mapa e a margem, com o vazio de fundo.
	local _vector2 = Vector2.new(width, height)
	local _arg0 = margin * 2
	local canvasCells = _vector2 + _arg0
	local canvas = canvasCells * INTERIOR_TILE
	local _exp_1 = cellCorner(data.x - margin.X, data.y - margin.Y)
	local _arg0_1 = groundOffset(canvas.X / 2, canvas.Y / 2)
	local center = _exp_1 + _arg0_1
	local ground = createGround(folder, center, canvas, false)
	ground.part.Name = "InteriorGround"
	-- A camada viva, no mesmo plano e do mesmo tamanho, desenhada logo depois do chão (ver `Interior.live`).
	local live = createGround(folder, center, canvas, false, LIVE_Z_OFFSET, "vivo")
	live.part.Name = "InteriorLive"
	-- Com exterior, o mar fundo enche um canvas próprio por baixo do chão (troca de quadro sem refazer o chão) e o
	-- vazio cobre só o retângulo do mapa (o preto entre os cômodos); sem exterior, o vazio enche o canvas, como antes.
	local under = if data.terrain then createGround(folder, center, canvas, false, UNDER_Z_OFFSET, "mar") else nil
	if under then
		under.part.Name = "InteriorSea"
	end
	local sea = if under then createSea(under.gui, SEA_Z) else nil
	local backdrop = if sea then tileImage(ground.gui, {
		x = 0,
		y = 0,
		w = width,
		h = height,
		tile = data.backdrop,
		flat = true,
	}, margin * INTERIOR_TILE, BACKDROP_Z) else tileImage(ground.gui, {
		x = 0,
		y = 0,
		w = canvasCells.X,
		h = canvasCells.Y,
		tile = data.backdrop,
		flat = true,
	}, Vector2.zero, BACKDROP_Z)
	backdrop.Name = "Backdrop"
	local _result = sea
	if _result ~= nil then
		_result = #_result.labels
	end
	local _condition = _result
	if _condition == nil then
		_condition = 0
	end
	local groundImages = 1 + _condition
	--* O tile que aparece na célula (x, y) do retângulo: o da camada de cima, ou o do mapa das ações. 
	local topAt = function(x, y)
		if map then
			return map:ground(data.x + x, data.y + y)
		end
		local n = 0
		for _, layer in { 2, 1, 0 } do
			n = numberAt(layer, x, y)
			if n ~= 0 then
				break
			end
		end
		return tileOf(n)
	end
	-- As janelas com versão de noite ficam fora das imagens juntadas com o resto: juntadas só entre as do
	-- mesmo par de regiões (dia e noite), cada imagem troca o recorte inteiro quando escurece.
	local windowCells = {}
	local windowGroups = 0
	do
		local y = 0
		local _shouldIncrement = false
		while true do
			if _shouldIncrement then
				y += 1
			else
				_shouldIncrement = true
			end
			if not (y < height) then
				break
			end
			do
				local x = 0
				local _shouldIncrement_1 = false
				while true do
					if _shouldIncrement_1 then
						x += 1
					else
						_shouldIncrement_1 = true
					end
					if not (x < width) then
						break
					end
					local tile = topAt(x, y)
					local win = if tile and not isAnimated(tile) then windowOf(tile) else nil
					if not win then
						continue
					end
					local _arg0_2 = y * width + x
					windowCells[_arg0_2] = win
					windowGroups = math.max(windowGroups, win.group + 1)
				end
			end
		end
	end
	local windows = {}
	do
		local _group = 0
		local _shouldIncrement = false
		while true do
			local group = _group
			if _shouldIncrement then
				group += 1
			else
				_shouldIncrement = true
			end
			if not (group < windowGroups) then
				break
			end
			local runs = mergeCells(width, height, function(x, y)
				local _arg0_2 = y * width + x
				local win = windowCells[_arg0_2]
				return if win and win.group == group then win.day else nil
			end)
			for _, run in runs do
				local _arg0_2 = run.y * width + run.x
				local night = windowCells[_arg0_2].night
				local label = tileImage(ground.gui, run, Vector2.new(margin.X + run.x, margin.Y + run.y) * INTERIOR_TILE, TILE_Z)
				local _arg0_3 = {
					label = label,
					run = run,
					day = run.tile,
					night = night,
					group = group,
				}
				table.insert(windows, _arg0_3)
				groundImages += 1
			end
			_group = group
		end
	end
	local showingNight = false
	-- Os tiles animados ficam fora das imagens juntadas: cada um é uma imagem que troca de quadro, na camada viva.
	local liveImages = 0
	local animated = {}
	if map then
		do
			local y = 0
			local _shouldIncrement = false
			while true do
				if _shouldIncrement then
					y += 1
				else
					_shouldIncrement = true
				end
				if not (y < height) then
					break
				end
				do
					local x = 0
					local _shouldIncrement_1 = false
					while true do
						if _shouldIncrement_1 then
							x += 1
						else
							_shouldIncrement_1 = true
						end
						if not (x < width) then
							break
						end
						local tile = map:ground(data.x + x, data.y + y)
						if not tile or not isAnimated(tile) then
							continue
						end
						local run = {
							x = x,
							y = y,
							w = 1,
							h = 1,
							tile = tile,
							flat = false,
						}
						local label = tileImage(live.gui, run, Vector2.new(margin.X + x, margin.Y + y) * INTERIOR_TILE, TILE_Z)
						liveImages += 1
						-- A chama acesa fica na cor cheia à noite (`tint.ts`).
						if isLightSource(tile) then
							label:SetAttribute(NO_TINT_ATTRIBUTE, true)
						end
						local _arg0_2 = map:key(data.x + x, data.y + y)
						local _arg1 = {
							label = label,
							tile = tile,
						}
						animated[_arg0_2] = _arg1
						groundImages += 1
					end
				end
			end
		end
	end
	-- As fontes de luz (a lâmpada, o vidro aceso) se juntam só entre si: elas ficam sem o tom do dia.
	local stillTile = function(x, y)
		local _condition_1 = map
		if _condition_1 then
			local _arg0_2 = map:key(data.x + x, data.y + y)
			_condition_1 = animated[_arg0_2] ~= nil
		end
		if _condition_1 then
			return nil
		end
		local _arg0_2 = y * width + x
		if windowCells[_arg0_2] ~= nil then
			return nil
		end
		local tile = topAt(x, y)
		return if tile and not isVoid(tile) then tile else nil
	end
	for _, source in { false, true } do
		local runs = mergeCells(width, height, function(x, y)
			local tile = stillTile(x, y)
			return if tile and isLightSource(tile) == source then tile else nil
		end, flatOf)
		for _1, run in runs do
			local label = tileImage(ground.gui, run, Vector2.new(margin.X + run.x, margin.Y + run.y) * INTERIOR_TILE, TILE_Z)
			if source then
				label:SetAttribute(NO_TINT_ATTRIBUTE, true)
			end
			groundImages += 1
		end
	end
	-- O exterior (a grama, o caminho, a areia e o mar do Diorama): as imagens que o gerador já juntou, nas
	-- células sem tile, numa moldura própria acima do vazio, com as camadas de recorte em ordem (a base embaixo,
	-- os encontros e o decalque por cima). Os recortes têm só pixels opacos ou transparentes: empilhados, dão os
	-- mesmos pixels que o plugin compõe (`plugin/src/exterior.ts`).
	local terrainAnimated = {}
	local terrainImages = 0
	if data.terrain then
		local frameIn = function(gui)
			local holder = Instance.new("Frame")
			holder.Name = "Terrain"
			holder.BackgroundTransparency = 1
			holder.Size = UDim2.fromScale(1, 1)
			holder.ZIndex = TILE_Z
			holder.Parent = gui
			return holder
		end
		local holder = frameIn(ground.gui)
		local liveHolder
		-- O recorte animado vai para a camada viva (por cima do chão inteiro) só se nenhum recorte parado da mesma
		-- célula fica acima dele (z maior, ou o mesmo z criado depois); senão ele fica no chão, na ordem certa.
		-- Nos mapas de hoje (2026-10-18) todos os animados podem ir.
		local staticTop = {}
		local runs = data.terrain.runs
		-- ▼ ReadonlyArray.forEach ▼
		local _callback_1 = function(_param, index)
			local i = _param[2]
			local j = _param[3]
			local w = _param[4]
			local h = _param[5]
			local z = _param[10]
			local frames = _param[11]
			if frames > 1 then
				return nil
			end
			do
				local b = j
				local _shouldIncrement = false
				while true do
					if _shouldIncrement then
						b += 1
					else
						_shouldIncrement = true
					end
					if not (b < j + h) then
						break
					end
					do
						local a = i
						local _shouldIncrement_1 = false
						while true do
							if _shouldIncrement_1 then
								a += 1
							else
								_shouldIncrement_1 = true
							end
							if not (a < i + w) then
								break
							end
							local key = b * 100000 + a
							local _condition_1 = staticTop[key]
							if _condition_1 == nil then
								_condition_1 = -math.huge
							end
							local _arg1 = math.max(_condition_1, z * 100000 + index)
							staticTop[key] = _arg1
						end
					end
				end
			end
		end
		for _k, _v in runs do
			_callback_1(_v, _k - 1, runs)
		end
		-- ▲ ReadonlyArray.forEach ▲
		local canGoLive = function(i, j, w, h, z, index)
			do
				local b = j
				local _shouldIncrement = false
				while true do
					if _shouldIncrement then
						b += 1
					else
						_shouldIncrement = true
					end
					if not (b < j + h) then
						break
					end
					do
						local a = i
						local _shouldIncrement_1 = false
						while true do
							if _shouldIncrement_1 then
								a += 1
							else
								_shouldIncrement_1 = true
							end
							if not (a < i + w) then
								break
							end
							local _arg0_2 = b * 100000 + a
							local top = staticTop[_arg0_2]
							if top ~= nil and top > z * 100000 + index then
								return false
							end
						end
					end
				end
			end
			return true
		end
		-- ▼ ReadonlyArray.forEach ▼
		local _callback_2 = function(_param, index)
			local image = _param[1]
			local i = _param[2]
			local j = _param[3]
			local w = _param[4]
			local h = _param[5]
			local sx = _param[6]
			local sy = _param[7]
			local sw = _param[8]
			local sh = _param[9]
			local z = _param[10]
			local frames = _param[11]
			local dx = _param[12]
			local dy = _param[13]
			local _condition_1 = EXTERIOR_SHEETS[image + 1]
			if _condition_1 == nil then
				_condition_1 = ""
			end
			local id = _condition_1
			local _condition_2 = id == ""
			if _condition_2 then
				local _arg0_2 = `exterior{image}`
				_condition_2 = not (warned[_arg0_2] ~= nil)
			end
			if _condition_2 then
				local _arg0_2 = `exterior{image}`
				warned[_arg0_2] = true
				warn(`[Interior] a imagem {image} do exterior não tem id; rode npm run diorama:jogo de novo`)
			end
			local label = Instance.new("ImageLabel")
			label.BackgroundTransparency = 1
			label.Position = UDim2.fromOffset((margin.X + i) * INTERIOR_TILE, (margin.Y + j) * INTERIOR_TILE)
			label.Size = UDim2.fromOffset(w * INTERIOR_TILE, h * INTERIOR_TILE)
			label.Image = id
			label.ImageRectOffset = Vector2.new(sx, sy)
			label.ImageRectSize = Vector2.new(sw, sh)
			-- O recorte é do tamanho do retângulo (cópia 1:1), ou menor quando é de uma cor só e se estica nele (o
			-- gerador só junta assim recortes de uma cor só; o Tile do Roblox não repete um recorte).
			label.ResampleMode = Enum.ResamplerMode.Pixelated
			label.ZIndex = z + 1
			local parent = holder
			if frames > 1 then
				local _arg0_2 = {
					label = label,
					offset = Vector2.new(sx, sy),
					step = Vector2.new(dx, dy),
					frames = frames,
				}
				table.insert(terrainAnimated, _arg0_2)
				if canGoLive(i, j, w, h, z, index) then
					if liveHolder == nil then
						liveHolder = frameIn(live.gui)
					end
					parent = liveHolder
					liveImages += 1
				end
			end
			label.Parent = parent
			terrainImages += 1
		end
		for _k, _v in runs do
			_callback_2(_v, _k - 1, runs)
		end
		-- ▲ ReadonlyArray.forEach ▲
		groundImages += terrainImages
	end
	-- Os bloqueios, numa grade com uma volta a mais em cada lado: fora do mapa não se anda.
	local blockedLocal = function(i, j)
		local _result_1
		if map then
			_result_1 = map:blocked(data.x + i, data.y + j)
		else
			local _condition_1 = i < 0 or j < 0 or i >= width or j >= height
			if not _condition_1 then
				local _exp_2 = data.blocks[j + 1]
				local _arg0_2 = i + 1
				local _arg1 = i + 1
				_condition_1 = string.sub(_exp_2, _arg0_2, _arg1) == "#"
			end
			_result_1 = _condition_1
		end
		return _result_1
	end
	local gridW = width + 2
	local gridH = height + 2
	local taken = {}
	local solid = function(i, j)
		local _condition_1 = i < gridW and j < gridH
		if _condition_1 then
			local _arg0_2 = j * gridW + i
			_condition_1 = not (taken[_arg0_2] ~= nil)
			if _condition_1 then
				_condition_1 = blockedLocal(i - 1, j - 1)
			end
		end
		return _condition_1
	end
	local colliders = 0
	do
		local j = 0
		local _shouldIncrement = false
		while true do
			if _shouldIncrement then
				j += 1
			else
				_shouldIncrement = true
			end
			if not (j < gridH) then
				break
			end
			do
				local i = 0
				local _shouldIncrement_1 = false
				while true do
					if _shouldIncrement_1 then
						i += 1
					else
						_shouldIncrement_1 = true
					end
					if not (i < gridW) then
						break
					end
					if not solid(i, j) then
						continue
					end
					local w = 1
					while solid(i + w, j) do
						w += 1
					end
					local h = 1
					local more = true
					while more do
						do
							local k = 0
							local _shouldIncrement_2 = false
							while true do
								if _shouldIncrement_2 then
									k += 1
								else
									_shouldIncrement_2 = true
								end
								if not (k < w and more) then
									break
								end
								more = solid(i + k, j + h)
							end
						end
						if more then
							h += 1
						end
					end
					do
						local b = 0
						local _shouldIncrement_2 = false
						while true do
							if _shouldIncrement_2 then
								b += 1
							else
								_shouldIncrement_2 = true
							end
							if not (b < h) then
								break
							end
							do
								local a = 0
								local _shouldIncrement_3 = false
								while true do
									if _shouldIncrement_3 then
										a += 1
									else
										_shouldIncrement_3 = true
									end
									if not (a < w) then
										break
									end
									local _arg0_2 = (j + b) * gridW + i + a
									taken[_arg0_2] = true
								end
							end
						end
					end
					-- A base do bloqueio é o meio da borda de baixo do retângulo.
					local _exp_2 = cellCorner(data.x + i - 1, data.y + j - 1)
					local _arg0_2 = groundOffset((w * INTERIOR_TILE) / 2, h * INTERIOR_TILE)
					local base = _exp_2 + _arg0_2
					createCollider(folder, "Interior", base, Vector2.new(w, h) * INTERIOR_TILE)
					colliders += 1
				end
			end
		end
	end
	folder.Parent = parent
	-- O quadro da animação já mostrado: os tiles só mudam quando ele muda (4 vezes por segundo), não a cada quadro.
	local shownTick = -1
	local _object = {
		folder = folder,
		ground = ground,
		live = live,
		cellCenter = function(self, x, y)
			local _exp_2 = cellCorner(x, y)
			local _arg0_2 = groundOffset(INTERIOR_TILE / 2, INTERIOR_TILE / 2)
			return _exp_2 + _arg0_2
		end,
		cellCorner = function(self, x, y)
			return cellCorner(x, y)
		end,
		canvasOf = function(self, x, y)
			return Vector2.new(margin.X + x - data.x, margin.Y + y - data.y) * INTERIOR_TILE
		end,
		animate = function(self, now)
			-- O quadro de cada tile começa na linha em que ele foi pintado: os patinhos lado a lado não boiam juntos.
			local tick = math.floor(now * TILE_ANIMATION_FPS)
			if tick == shownTick then
				return nil
			end
			shownTick = tick
			for _, cell in animated do
				local _binding_2 = cell.still or cell.tile
				local sheet = _binding_2[1]
				local col = _binding_2[2]
				local row = _binding_2[3]
				local frame = if cell.still then row else (cell.tile[3] + tick) % ANIMATION_FRAMES
				local rect = sheetRect({ sheet, col, frame })
				if cell.label.ImageRectOffset ~= rect.offset then
					cell.label.ImageRectOffset = rect.offset
				end
				if cell.label.Image ~= rect.image then
					cell.label.Image = rect.image
				end
			end
			-- O mar e os decalques do exterior: todos no mesmo quadro, como no plugin; o mar de fora junto.
			for _, item in terrainAnimated do
				local _offset = item.offset
				local _step = item.step
				local _arg0_2 = tick % item.frames
				local offset = _offset + (_step * _arg0_2)
				if item.label.ImageRectOffset ~= offset then
					item.label.ImageRectOffset = offset
				end
			end
			local _result_1 = sea
			if _result_1 ~= nil then
				_result_1:animate(tick)
			end
		end,
		setAnimatedTile = function(self, x, y, tile)
			local _result_1
			if map then
				local _arg0_2 = map:key(x, y)
				_result_1 = animated[_arg0_2]
			else
				_result_1 = nil
			end
			local cell = _result_1
			if cell then
				cell.still = tile
			end
			-- A torneira fechada ou aberta aparece já no próximo quadro.
			shownTick = -1
		end,
		blocked = function(self, x, y)
			return blockedLocal(x - data.x, y - data.y)
		end,
		area = {
			x = data.x,
			y = data.y,
			width = width,
			height = height,
		},
	}
	local _left = "windows"
	-- ▼ ReadonlyArray.map ▼
	local _newValue_1 = table.create(#windows)
	local _callback_1 = function(win)
		return {
			canvas = Vector2.new(margin.X + win.run.x, margin.Y + win.run.y) * INTERIOR_TILE,
			w = win.run.w,
			h = win.run.h,
			group = win.group,
			night = win.night,
		}
	end
	for _k, _v in windows do
		_newValue_1[_k] = _callback_1(_v, _k - 1, windows)
	end
	-- ▲ ReadonlyArray.map ▲
	_object[_left] = _newValue_1
	function _object:topTile(x, y)
		local i = x - data.x
		local j = y - data.y
		if i < 0 or j < 0 or i >= width or j >= height then
			return nil
		end
		return topAt(i, j)
	end
	function _object:setNight(night)
		if night == showingNight then
			return nil
		end
		showingNight = night
		for _, win in windows do
			-- A versão de noite tem o mesmo tamanho e a mesma disposição: o recorte do retângulo inteiro muda junto.
			local rect = sheetRect(if night then win.night else win.day)
			win.label.Image = rect.image
			win.label.ImageRectOffset = rect.offset
		end
	end
	local _left_1 = "stats"
	local _object_1 = {
		tiles = tiles,
		groundImages = groundImages,
		colliders = colliders,
		windowImages = #windows,
	}
	local _left_2 = "terrainTiles"
	local _result_1 = data.terrain
	if _result_1 ~= nil then
		_result_1 = _result_1.tiles
	end
	local _condition_1 = _result_1
	if _condition_1 == nil then
		_condition_1 = 0
	end
	_object_1[_left_2] = _condition_1
	local _left_3 = "terrainLayers"
	local _result_2 = data.terrain
	if _result_2 ~= nil then
		_result_2 = _result_2.layers
	end
	local _condition_2 = _result_2
	if _condition_2 == nil then
		_condition_2 = 0
	end
	_object_1[_left_3] = _condition_2
	_object_1.terrainImages = terrainImages
	_object_1.terrainAnimated = #terrainAnimated
	_object_1.liveImages = liveImages
	_object_1.instances = #folder:GetDescendants() + 1
	_object_1.buildMs = (os.clock() - started) * 1000
	_object[_left_1] = _object_1
	function _object:destroy()
		folder:Destroy()
	end
	return _object
end
return {
	sheetRect = sheetRect,
	buildInterior = buildInterior,
	INTERIOR_TILE = INTERIOR_TILE,
	TILE_ANIMATION_FPS = TILE_ANIMATION_FPS,
}
