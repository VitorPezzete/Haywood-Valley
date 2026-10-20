-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local ContentProvider = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services").ContentProvider
local _view = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "view")
local ART_PX_PER_STUD = _view.ART_PX_PER_STUD
local groundOffset = _view.groundOffset
local LOOK = _view.LOOK
local SCREEN_UP = _view.SCREEN_UP
local VIEW_DEPTH_PER_PX = _view.VIEW_DEPTH_PER_PX
local ASSETS = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "assets").ASSETS
local decorVariant = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "decor").decorVariant
local _interiorMap = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiorMap")
local ANIMATION_FRAMES = _interiorMap.ANIMATION_FRAMES
local isAnimated = _interiorMap.isAnimated
local _pieces = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "pieces")
local STEP_SECONDS = _pieces.STEP_SECONDS
local THROW_SECONDS = _pieces.THROW_SECONDS
local _card = TS.import(script, script.Parent, "card")
local cardCFrame = _card.cardCFrame
local createCard = _card.createCard
local createCollider = TS.import(script, script.Parent, "collider").createCollider
local GroundLayer = TS.import(script, script.Parent, "ground").GroundLayer
local _interior = TS.import(script, script.Parent, "interior")
local INTERIOR_TILE = _interior.INTERIOR_TILE
local sheetRect = _interior.sheetRect
local TILE_ANIMATION_FPS = _interior.TILE_ANIMATION_FPS
local isLightSource = TS.import(script, script.Parent, "lightTiles").isLightSource
local NO_TINT_ATTRIBUTE = TS.import(script, script.Parent, "tint").NO_TINT_ATTRIBUTE
--* Quanto o objeto jogado sobe no meio do voo, em pixels de arte. 
local THROW_ARC = 20
--[[
	*
	 * A base do objeto carregado fica 35 pixels acima da sola (no carry.gani, o objeto de 32 tem o canto 20
	 * pixels acima do topo da tela de 48): o voo começa daí.
	 
]]
local CARRIED_HEIGHT = 35
--* O pote quebrado some aos poucos, em segundos. 
local BREAK_FADE = 0.4
--[[
	*
	 * A folha dos cacos do pote, como no Graal: Aseprite/acoes/cacos_pote.png (4 quadros de 64 × 40, a base do
	 * pote no meio da borda de baixo), feita por acoes/cacos_pote.py com o desenho e as cores do pote do Aeko.
	 * Sem id, o pote quebrado só some aos poucos, e o Output avisa uma vez. A folha é pré-carregada quando o
	 * interior monta: antes, o primeiro pote jogado sumia enquanto ela ainda baixava (visto em 2026-10-18). O id no
	 * registro (acoes.cacos_pote).
	 
]]
local POT_SHARDS = ASSETS["acoes.cacos_pote"]
local SHARDS_FRAME = Vector2.new(64, 40)
local SHARDS_FRAMES = 4
--* Quadros dos cacos por segundo; o último fica no chão `SHARDS_REST` segundos e some aos poucos. 
local SHARDS_FPS = 8
local SHARDS_REST = 0.6
local warnedShards = false
--[[
	*
	 * A folha das peças que se levantam, recortadas do fundo (Aseprite/acoes/carregaveis.png, de
	 * acoes/carregaveis.py): o tile do Aeko é opaco e traz o piso, que acima da cabeça cortava o cabelo e no
	 * voo aparecia como um quadrado. Peça derivada, ainda sem o aval do usuário para enviar: sem id, vai o tile
	 * original, posto acima da cabeça sem cobri-la (`PieceArt.cutout`), e o Output avisa uma vez. O id no registro
	 * (acoes.carregaveis).
	 
]]
local CARRY_SHEET = ASSETS["acoes.carregaveis"]
--[[
	*
	 * O recorte de cada peça na folha, [x, y, largura, altura] em pixels (acoes/carregaveis.json): o tile com 1
	 * pixel de folga em volta, onde entra o contorno que faltava na borda do tile.
	 
]]
local CARRY_RECTS = {
	casa42 = { 0, 0, 34, 34 },
	casa43 = { 36, 0, 34, 34 },
	casa67 = { 72, 0, 34, 18 },
}
local warnedCarry = false
--* O objeto em voo vem um pouco para perto da câmera, para passar por cima de quem o jogou. 
local FLIGHT_NUDGE = 4 * VIEW_DEPTH_PER_PX
--* Recorte da folha de uma peça inteira: a imagem que vai no chão, acima da cabeça ou no ar. 
--* Atributo da imagem de um tile animado de peça posta: a linha da folha em que ele foi pintado (o primeiro quadro). 
local DECOR_ANIM_ATTRIBUTE = "DecorAnim"
--[[
	*
	 * As imagens de uma peça do Decorar com o canto na célula (x, y) do bloco, no canvas do chão: as células que são
	 * vizinhas na folha (na mesma metade) viram um recorte só, sem mudar pixel. Serve à peça posta e à peça meio
	 * transparente que segue o mouse.
	 
]]
local function decorImages(interior, item, variant, x, y, zIndex)
	local cells = {}
	for _, cell in variant.cells do
		local _arg0 = cell[2] * 64 + cell[1]
		local _arg1 = { cell[3], cell[4] }
		cells[_arg0] = _arg1
	end
	local taken = {}
	local sheetAt = function(dx, dy)
		local _arg0 = dy * 64 + dx
		local _result
		if taken[_arg0] ~= nil then
			_result = nil
		else
			local _arg0_1 = dy * 64 + dx
			_result = cells[_arg0_1]
		end
		return _result
	end
	local labels = {}
	local origin = interior:canvasOf(0, 0)
	for _, cell in variant.cells do
		local _binding = cell
		local dx = _binding[1]
		local dy = _binding[2]
		local col = _binding[3]
		local row = _binding[4]
		local _arg0 = dy * 64 + dx
		if taken[_arg0] ~= nil then
			continue
		end
		local half = math.floor(col / 64)
		-- O tile animado (a chama da tocha) fica sozinho numa imagem, que troca de quadro (`PieceView.update`).
		local animated = isAnimated({ item.sheet, col, row })
		local follows = function(i, j)
			local found = sheetAt(dx + i, dy + j)
			return found ~= nil and found[1] == col + i and found[2] == row + j and math.floor(found[1] / 64) == half
		end
		local w = 1
		while not animated and follows(w, 0) do
			w += 1
		end
		local h = 1
		local more = not animated
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
					more = follows(i, h)
				end
			end
			if more then
				h += 1
			end
		end
		do
			local j = 0
			local _shouldIncrement = false
			while true do
				if _shouldIncrement then
					j += 1
				else
					_shouldIncrement = true
				end
				if not (j < h) then
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
						if not (i < w) then
							break
						end
						local _arg0_1 = (dy + j) * 64 + dx + i
						taken[_arg0_1] = true
					end
				end
			end
		end
		local art = sheetRect({ item.sheet, col, row }, w, h)
		local label = Instance.new("ImageLabel")
		label.Name = `Decor_{item.id}`
		label.BackgroundTransparency = 1
		label.ResampleMode = Enum.ResamplerMode.Pixelated
		label.Image = art.image
		label.ImageRectOffset = art.offset
		label.ImageRectSize = art.size
		label.Size = UDim2.fromOffset(art.size.X, art.size.Y)
		local _arg0_1 = Vector2.new(x + dx, y + dy) * INTERIOR_TILE
		local at = origin + _arg0_1
		label.Position = UDim2.fromOffset(math.round(at.X), math.round(at.Y))
		label.ZIndex = zIndex
		if animated then
			label:SetAttribute(DECOR_ANIM_ATTRIBUTE, row)
		end
		-- A chama da tocha e a lâmpada postas ficam na cor cheia à noite, como as do mapa (`tint.ts`).
		if isLightSource({ item.sheet, col, row }) then
			label:SetAttribute(NO_TINT_ATTRIBUTE, true)
		end
		-- Na camada viva do chão, com as peças móveis: mudar uma peça não refaz o canvas grande dos tiles.
		label.Parent = interior.live.gui
		table.insert(labels, label)
	end
	return labels
end
--[[
	*
	 * Desenha as peças móveis de um interior (`shared/pieces.ts`) e os bloqueios delas. Cada peça é uma imagem
	 * no canvas do chão, na camada `Piece`, acima dos tiles e abaixo das sombras e do boneco, com o recorte
	 * inteiro da folha; o chão embaixo dela já mostra o piso (`buildInterior` com o mapa). A peça que bloqueia
	 * tem um bloqueio invisível do tamanho dela, que anda junto.
	 
]]
local PieceView
do
	PieceView = setmetatable({}, {
		__tostring = function()
			return "PieceView"
		end,
	})
	PieceView.__index = PieceView
	function PieceView.new(...)
		local self = setmetatable({}, PieceView)
		return self:constructor(...) or self
	end
	function PieceView:constructor(board, interior)
		self.board = board
		self.interior = interior
		self.drawn = {}
		self.flights = {}
		self.decorDrawn = {}
		self.decorTick = -1
		for _, state in board:all() do
			self:refresh(state)
		end
		-- As folhas que só aparecem quando alguém quebra ou levanta uma peça: baixam já, para não faltarem na hora.
		local _exp = { POT_SHARDS, CARRY_SHEET }
		-- ▼ ReadonlyArray.filter ▼
		local _newValue = {}
		local _callback = function(id)
			return id ~= ""
		end
		local _length = 0
		for _k, _v in _exp do
			if _callback(_v, _k - 1, _exp) == true then
				_length += 1
				_newValue[_length] = _v
			end
		end
		-- ▲ ReadonlyArray.filter ▲
		local sheets = _newValue
		if #sheets > 0 then
			task.spawn(function()
				return ContentProvider:PreloadAsync(sheets)
			end)
		end
	end
	function PieceView:refreshDecor(state)
		self:removeDecor(state.key)
		-- A peça nova entra já no quadro de agora da animação.
		self.decorTick = -1
		local variant = decorVariant(state)
		local labels = decorImages(self.interior, state.item, variant, state.x, state.y, GroundLayer.Piece)
		local blocking = {}
		for _, cell in variant.cells do
			if cell[9] == 1 then
				local _arg0 = cell[2] * 64 + cell[1]
				blocking[_arg0] = true
			end
		end
		local colliders = {}
		local taken = {}
		for _, cell in variant.cells do
			local _binding = cell
			local dx = _binding[1]
			local dy = _binding[2]
			local key = dy * 64 + dx
			if not (blocking[key] ~= nil) or taken[key] ~= nil then
				continue
			end
			local free = function(i, j)
				local _arg0 = (dy + j) * 64 + dx + i
				local _condition = blocking[_arg0] ~= nil
				if _condition then
					local _arg0_1 = (dy + j) * 64 + dx + i
					_condition = not (taken[_arg0_1] ~= nil)
				end
				return _condition
			end
			local w = 1
			while free(w, 0) do
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
						more = free(i, h)
					end
				end
				if more then
					h += 1
				end
			end
			do
				local j = 0
				local _shouldIncrement = false
				while true do
					if _shouldIncrement then
						j += 1
					else
						_shouldIncrement = true
					end
					if not (j < h) then
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
							if not (i < w) then
								break
							end
							local _arg0 = (dy + j) * 64 + dx + i
							taken[_arg0] = true
						end
					end
				end
			end
			local _exp = self.interior:cellCorner(state.x + dx, state.y + dy)
			local _arg0 = groundOffset((w * INTERIOR_TILE) / 2, h * INTERIOR_TILE)
			local base = _exp + _arg0
			local _arg0_1 = createCollider(self.interior.folder, `Decor_{state.key}`, base, Vector2.new(w, h) * INTERIOR_TILE)
			table.insert(colliders, _arg0_1)
		end
		local _decorDrawn = self.decorDrawn
		local _key = state.key
		local _arg1 = {
			labels = labels,
			colliders = colliders,
		}
		_decorDrawn[_key] = _arg1
	end
	function PieceView:removeDecor(key)
		local _decorDrawn = self.decorDrawn
		local _key = key
		local drawn = _decorDrawn[_key]
		if not drawn then
			return nil
		end
		for _, label in drawn.labels do
			label:Destroy()
		end
		for _, part in drawn.colliders do
			part:Destroy()
		end
		local _decorDrawn_1 = self.decorDrawn
		local _key_1 = key
		_decorDrawn_1[_key_1] = nil
	end
	function PieceView:dim(key, transparency)
		local _key = key
		if type(_key) == "number" then
			local _decorDrawn = self.decorDrawn
			local _key_1 = key
			local _result = _decorDrawn[_key_1]
			if _result ~= nil then
				_result = _result.labels
			end
			local _condition = _result
			if _condition == nil then
				_condition = {}
			end
			for _, label in _condition do
				label.ImageTransparency = transparency
			end
		else
			local _key_1 = key
			if type(_key_1) == "string" then
				local _drawn = self.drawn
				local _key_2 = key
				local drawn = _drawn[_key_2]
				if drawn then
					drawn.label.ImageTransparency = transparency
				end
			end
		end
	end
	function PieceView:art(state)
		local def = self.board:defOf(state)
		return sheetRect({ def.sheet, def.col, def.row }, def.w, def.h)
	end
	function PieceView:carriedArt(state)
		local def = self.board:defOf(state)
		local rect = CARRY_RECTS[def.id]
		if CARRY_SHEET ~= "" and rect then
			return {
				image = CARRY_SHEET,
				offset = Vector2.new(rect[1], rect[2]),
				size = Vector2.new(rect[3], rect[4]),
				cutout = true,
			}
		end
		if not warnedCarry then
			warnedCarry = true
			warn("[Pecas] a folha das peças recortadas ainda não tem id (acoes.carregaveis em assets/registro.json): vai o tile com o piso")
		end
		return self:art(state)
	end
	function PieceView:refresh(state, slide, solid)
		if slide == nil then
			slide = false
		end
		if solid == nil then
			solid = false
		end
		local _drawn = self.drawn
		local _id = state.spot.id
		local drawn = _drawn[_id]
		if not drawn then
			local label = Instance.new("ImageLabel")
			label.Name = `Piece_{state.spot.id}`
			label.BackgroundTransparency = 1
			label.ResampleMode = Enum.ResamplerMode.Pixelated
			label.ZIndex = GroundLayer.Piece
			-- Na camada viva do chão: a peça desliza e voa sem refazer o canvas grande dos tiles.
			label.Parent = self.interior.live.gui
			drawn = {
				id = state.spot.id,
				label = label,
				flying = false,
			}
			local _drawn_1 = self.drawn
			local _id_1 = state.spot.id
			local _drawn_2 = drawn
			_drawn_1[_id_1] = _drawn_2
		end
		local art = self:art(state)
		drawn.label.Image = art.image
		drawn.label.ImageRectOffset = art.offset
		drawn.label.ImageRectSize = art.size
		drawn.label.Size = UDim2.fromOffset(art.size.X, art.size.Y)
		local onFloor = state.mode == 0 or state.mode == 1
		drawn.label.Visible = onFloor and not drawn.flying
		local cell = Vector2.new(state.x, state.y)
		local last = drawn.cell
		drawn.cell = cell
		local moved = if last ~= nil then (last - cell).Magnitude else 0
		local near = moved > 0.5 and moved <= 1.01
		drawn.slide = if slide and onFloor and near and last then {
			from = last,
			started = os.clock(),
		} else nil
		self:placeLabel(drawn, if drawn.slide then drawn.slide.from else cell)
		if state.spot.def.blocks and onFloor and not drawn.flying then
			if not drawn.collider then
				local def = state.spot.def
				local _exp = self.interior:cellCorner(state.x, state.y)
				local _arg0 = groundOffset((def.w * INTERIOR_TILE) / 2, def.h * INTERIOR_TILE)
				local base = _exp + _arg0
				drawn.collider = createCollider(self.interior.folder, `Piece_{state.spot.id}`, base, Vector2.new(def.w, def.h) * INTERIOR_TILE)
				drawn.colliderBase = drawn.collider.CFrame
				drawn.colliderCell = cell
			end
			self:placeCollider(drawn, if drawn.slide then drawn.slide.from else cell)
			-- Deslizando, o bloqueio só volta no fim: quem puxa anda junto e não pode esbarrar nele.
			drawn.collider.CanCollide = solid or drawn.slide == nil
		elseif drawn.collider then
			drawn.collider:Destroy()
			drawn.collider = nil
		end
	end
	function PieceView:placeLabel(drawn, cell)
		local origin = self.interior:canvasOf(0, 0)
		local _arg0 = cell * INTERIOR_TILE
		local at = origin + _arg0
		drawn.label.Position = UDim2.fromOffset(math.round(at.X), math.round(at.Y))
	end
	function PieceView:placeCollider(drawn, cell)
		if not drawn.collider or not drawn.colliderBase or not drawn.colliderCell then
			return nil
		end
		local _cell = cell
		local _colliderCell = drawn.colliderCell
		local delta = (_cell - _colliderCell) * INTERIOR_TILE
		local _colliderBase = drawn.colliderBase
		local _arg0 = groundOffset(delta.X, delta.Y)
		drawn.collider.CFrame = _colliderBase + _arg0
	end
	function PieceView:fly(state, from, breaks)
		local _drawn = self.drawn
		local _id = state.spot.id
		local drawn = _drawn[_id]
		if drawn then
			drawn.flying = true
			drawn.label.Visible = false
			local _result = drawn.collider
			if _result ~= nil then
				_result:Destroy()
			end
			drawn.collider = nil
		end
		local art = self:carriedArt(state)
		local def = state.spot.def
		local anchor = Vector2.new(art.size.X / 2, art.size.Y)
		local _exp = self.interior:cellCorner(state.x, state.y)
		local _arg0 = groundOffset((def.w * INTERIOR_TILE) / 2, def.h * INTERIOR_TILE)
		local to = _exp + _arg0
		local card = createCard(self.interior.folder, `Thrown_{state.spot.id}`, {
			image = art.image,
			size = art.size,
			anchor = anchor,
			frames = { art.offset },
		}, from)
		local _flights = self.flights
		local _arg0_1 = {
			card = card,
			from = from,
			to = to,
			size = art.size,
			started = os.clock(),
			breaks = breaks,
			done = function()
				if drawn then
					drawn.flying = false
				end
				self:refresh(state)
			end,
		}
		table.insert(_flights, _arg0_1)
	end
	function PieceView:shatter(flight, now)
		local since = now - flight.started - THROW_SECONDS
		if POT_SHARDS == "" then
			if not warnedShards then
				warnedShards = true
				warn("[Pecas] a folha dos cacos do pote ainda não tem id (acoes.cacos_pote em assets/registro.json): o pote só some")
			end
			local faded = math.clamp(since / BREAK_FADE, 0, 1)
			flight.card.image.ImageTransparency = faded
			return faded < 1
		end
		local image = flight.card.image
		if image.Image ~= POT_SHARDS then
			-- O cartão passa a ter o tamanho do quadro dos cacos, com a base no mesmo ponto do chão.
			image.Image = POT_SHARDS
			image.ImageRectSize = SHARDS_FRAME
			local gui = image.Parent
			gui.CanvasSize = SHARDS_FRAME
			flight.card.part.Size = Vector3.new(SHARDS_FRAME.X / ART_PX_PER_STUD, SHARDS_FRAME.Y / ART_PX_PER_STUD, flight.card.part.Size.Z)
			-- O voo põe o cartão no lugar a cada quadro, pela medida dele.
			flight.size = SHARDS_FRAME
		end
		local frame = math.min(math.floor(since * SHARDS_FPS), SHARDS_FRAMES - 1)
		image.ImageRectOffset = Vector2.new(frame * SHARDS_FRAME.X, 0)
		local faded = math.clamp((since - SHARDS_FRAMES / SHARDS_FPS - SHARDS_REST) / BREAK_FADE, 0, 1)
		image.ImageTransparency = faded
		return faded < 1
	end
	function PieceView:update(now)
		local tick = math.floor(now * TILE_ANIMATION_FPS)
		local decorTick = self.decorTick
		self.decorTick = tick
		if tick ~= decorTick then
			for _, drawn in self.decorDrawn do
				for _1, label in drawn.labels do
					local row = label:GetAttribute(DECOR_ANIM_ATTRIBUTE)
					if not (type(row) == "number") then
						continue
					end
					local y = ((row + tick) % ANIMATION_FRAMES) * INTERIOR_TILE
					if label.ImageRectOffset.Y ~= y then
						label.ImageRectOffset = Vector2.new(label.ImageRectOffset.X, y)
					end
				end
			end
		end
		for _, drawn in self.drawn do
			local slide = drawn.slide
			if not slide then
				continue
			end
			local _pieces_1 = self.board.pieces
			local _id = drawn.id
			local state = _pieces_1[_id]
			if not state then
				continue
			end
			local to = Vector2.new(state.x, state.y)
			local t = math.clamp((now - slide.started) / STEP_SECONDS, 0, 1)
			-- Em pixels de arte inteiros, para a peça não ficar entre dois pixels.
			local px = (slide.from * INTERIOR_TILE):Lerp(to * INTERIOR_TILE, t)
			local cell = Vector2.new(math.round(px.X), math.round(px.Y)) / INTERIOR_TILE
			self:placeLabel(drawn, cell)
			self:placeCollider(drawn, cell)
			if t >= 1 then
				drawn.slide = nil
				if drawn.collider then
					drawn.collider.CanCollide = true
				end
			end
		end
		for index = #self.flights - 1, 0, -1 do
			local flight = self.flights[index + 1]
			local t = math.clamp((now - flight.started) / THROW_SECONDS, 0, 1)
			local ground = flight.from:Lerp(flight.to, t)
			local height = CARRIED_HEIGHT * (1 - t) + THROW_ARC * 4 * t * (1 - t)
			local _exp = cardCFrame(flight.size, Vector2.new(flight.size.X / 2, flight.size.Y), ground)
			local _arg0 = math.round(height) / ART_PX_PER_STUD
			local _arg0_1 = SCREEN_UP * _arg0
			local _arg0_2 = LOOK * FLIGHT_NUDGE
			flight.card.part.CFrame = _exp + _arg0_1 - _arg0_2
			if t < 1 then
				continue
			end
			if flight.breaks then
				if self:shatter(flight, now) then
					continue
				end
			end
			flight.card.part:Destroy()
			local _flights = self.flights
			local _index = index
			table.remove(_flights, _index + 1)
			flight.done()
		end
	end
end
return {
	decorImages = decorImages,
	PieceView = PieceView,
}
