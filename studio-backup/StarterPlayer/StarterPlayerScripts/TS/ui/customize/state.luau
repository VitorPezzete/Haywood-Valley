-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
-- O que a tela de personalizar faz, sem o desenho: o visual escolhido, as abas, as grades, o teclado, as
-- cores, o histórico e os visuais salvos. Cada tema monta a tela à sua maneira (celeiro.tsx e
-- graal.tsx, com a disposição da prancha dele) usando este estado.
local _vide = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "vide", "src")
local batch = _vide.batch
local cleanup = _vide.cleanup
local source = _vide.source
local subscribe = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "charm", "src").subscribe
local _services = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services")
local GuiService = _services.GuiService
local RunService = _services.RunService
local UserInputService = _services.UserInputService
local _appearance = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "appearance")
local channelsOfRgb = _appearance.channelsOfRgb
local CLOTH_KEYS = _appearance.CLOTH_KEYS
local DETAIL_KEYS = _appearance.DETAIL_KEYS
local lookBody = _appearance.lookBody
local lookGender = _appearance.lookGender
local lookHead = _appearance.lookHead
local ORIGINAL = _appearance.ORIGINAL
local originalRgb = _appearance.originalRgb
local partRgb = _appearance.partRgb
local rgbOfChannels = _appearance.rgbOfChannels
local withBody = _appearance.withBody
local withGender = _appearance.withGender
local withHead = _appearance.withHead
local withPickedHead = _appearance.withPickedHead
local withStyle = _appearance.withStyle
local _graal = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "graal")
local fitsGender = _graal.fitsGender
local Graal = _graal.Graal
local withOutfitPalette = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "outfitPalette").withOutfitPalette
local _playerData = TS.import(script, script.Parent.Parent.Parent, "state", "playerData")
local playerData = _playerData.playerData
local toggleFavorite = _playerData.toggleFavorite
local _screen = TS.import(script, script.Parent.Parent.Parent, "state", "screen")
local characterName = _screen.characterName
local chosenLook = _screen.look
local _graalArt = TS.import(script, script.Parent.Parent.Parent, "world", "graalArt")
local BLINK_MAX = _graalArt.BLINK_MAX
local BLINK_MIN = _graalArt.BLINK_MIN
local BLINK_TIME = _graalArt.BLINK_TIME
local TURN_ORDER = _graalArt.TURN_ORDER
local WALK_FPS = _graalArt.WALK_FPS
local WALK_FRAMES = _graalArt.WALK_FRAMES
local t = TS.import(script, script.Parent.Parent, "i18n").t
--* As abas do painel. 
local TABS_LIST = { {
	title = "tab.gender",
	icon = "iconGender",
}, {
	title = "tab.head",
	icon = "iconHead",
}, {
	title = "tab.body",
	icon = "iconBody",
}, {
	title = "tab.hair",
	icon = "iconHair",
}, {
	title = "tab.face",
	icon = "iconFace",
}, {
	title = "tab.outfit",
	icon = "iconOutfit",
} }
local GENDERS = { {
	gender = 0,
	name = "gender.male",
}, {
	gender = 1,
	name = "gender.female",
} }
--* Grades com rolagem: cabeças de frente no tamanho do jogo; corpos no boneco inteiro. As duas pranchas usam células de 36 a cada 40. 
local HEAD_GRID = {
	columns = 7,
	w = 36,
	h = 36,
	stepX = 40,
	stepY = 40,
}
local BODY_GRID = {
	columns = 7,
	w = 36,
	h = 52,
	stepX = 40,
	stepY = 56,
}
--* Fileiras a mais que a grade desenha além das que cabem, para a rolagem não mostrar buraco. 
local SPARE_ROWS = 2
--* Células criadas por grade: as que cabem na grade mais alta das pranchas, mais as de folga. 
local poolSize = function(spec)
	return spec.columns * (math.ceil(150 / spec.stepY) + SPARE_ROWS)
end
-- Cores prontas: 11 por parte, que com a original fazem as 12 amostras do Clássico (prancha B). O
-- Celeiro mostra as 5 primeiras na faixa de baixo das grades (as do cabelo são as da prancha A).
local SKIN_PRESETS = { 0xffe3c6, 0xf6d2b0, 0xe8b48c, 0xd09a6e, 0xb07850, 0x8c5a3c, 0x6a4030, 0x4a2c22, 0xa8e0a0, 0x9ec8f0, 0xc8a8e8 }
--* As peles de gente; as últimas são de fantasia e o Aleatório não sorteia. 
local NATURAL_SKINS = 8
local HAIR_PRESETS = { 0x2a1e1a, 0x6b3a1e, 0xd38b27, 0xffdd7c, 0xf4eedc, 0xd06030, 0x9a9aa8, 0x8070d8, 0x3c64c8, 0x50a060, 0xe070a0 }
local EYES_PRESETS = { 0x3a2a24, 0x6a4030, 0x3c8cff, 0x58b0d8, 0x58a858, 0x8660c4, 0xd04848, 0xe8a040, 0x9a9aa8, 0x2a2630, 0xe070a0 }
local CLOTHES_PRESETS = { 0xe25448, 0xf0b43c, 0x4cb262, 0x409cac, 0x5a62b4, 0x7f86d8, 0xb45ca0, 0xf4eedc, 0x8f93a0, 0x34357a, 0x28242c }
local FACE_PARTS = { {
	key = "skinRgb",
	name = "part.skin",
	title = "customize.skinColor",
	presets = SKIN_PRESETS,
}, {
	key = "eyesRgb",
	name = "part.eyes",
	title = "customize.eyesColor",
	presets = EYES_PRESETS,
} }
--* O nome e o título da cor de cada tipo de parte da roupa. 
local CLOTH_NAMES = {
	shirt = "part.shirt",
	sleeves = "part.sleeves",
	pants = "part.pants",
	skirt = "part.skirt",
	dress = "part.dress",
	shoes = "part.shoes",
	belt = "part.belt",
	trim = "part.trim",
}
local CLOTH_TITLES = {
	shirt = "customize.shirtColor",
	sleeves = "customize.sleevesColor",
	pants = "customize.pantsColor",
	skirt = "customize.skirtColor",
	dress = "customize.dressColor",
	shoes = "customize.shoesColor",
	belt = "customize.beltColor",
	trim = "customize.trimColor",
}
local CHANNEL_STEP = 5
--* Quantos passos o Desfazer guarda. 
local HISTORY = 80
--* A tecla que troca o estilo da peça da aba aberta (Aeko ou Original): V de versão, livre no personalizar. 
local STYLE_KEY = Enum.KeyCode.V
--* Os botões do seletor de estilo, na ordem em que aparecem. 
local STYLES = { {
	style = 0,
	name = "customize.styleAeko",
}, {
	style = 1,
	name = "customize.styleOriginal",
} }
--* Partes do painel que o teclado percorre em cada aba, de cima para baixo. 
local function range(count)
	local list = {}
	do
		local index = 0
		local _shouldIncrement = false
		while true do
			if _shouldIncrement then
				index += 1
			else
				_shouldIncrement = true
			end
			if not (index < count) then
				break
			end
			local _index = index
			table.insert(list, _index)
		end
	end
	return list
end
local function withValue(look, key, value)
	local _object = table.clone(look)
	setmetatable(_object, nil)
	local changed = _object
	changed[key] = value
	return changed
end
--* Os artistas das peças que servem ao gênero, com "" (todos) na frente, e as peças de cada um. 
local function byAuthor(pieces, gender)
	local authors = { "" }
	local lists = { {} }
	-- ▼ ReadonlyArray.forEach ▼
	local _callback = function(piece, index)
		if not fitsGender(piece, gender) then
			return nil
		end
		local _exp = lists[1]
		local _index = index
		table.insert(_exp, _index)
		local _author = piece.author
		local at = (table.find(authors, _author) or 0) - 1
		if at < 0 then
			at = #authors
			local _author_1 = piece.author
			table.insert(authors, _author_1)
			table.insert(lists, {})
		end
		local _exp_1 = lists[at + 1]
		local _index_1 = index
		table.insert(_exp_1, _index_1)
	end
	for _k, _v in pieces do
		_callback(_v, _k - 1, pieces)
	end
	-- ▲ ReadonlyArray.forEach ▲
	return {
		authors = authors,
		lists = lists,
	}
end
--* O estado e as ações da tela de personalizar. `onDone(true)` confirma, `onDone(false)` volta ao menu. 
local function createCustomize(k, onDone)
	local look = source(chosenLook())
	local tab = source(0)
	local part = source(1)
	local cursor = source(lookGender(look()))
	local turn = source(0)
	local walkFrame = source(0)
	local closed = source(false)
	local name = source(characterName())
	local hairPart = source(0)
	local facePart = source(0)
	local clothPart = source(0)
	local favoritesOnly = source(false)
	local tooltip = source(nil)
	local saved = source(playerData())
	cleanup(subscribe(playerData, function(value)
		return saved(value)
	end))
	--* A área à mostra da grade e a folga em cima e embaixo das células, em pixels de arte: a disposição do tema diz. 
	local gridHeight = 148
	local gridPad = 0
	--[[
		*
		     * Se as abas de grade têm a faixa de cor embaixo (o Celeiro): na Cabeça, a cor do cabelo; no Corpo,
		     * a da parte da roupa escolhida. O Clássico pinta só nas abas de cor.
		     
	]]
	local colorStrip = source(false)
	--* Quantas amostras (com a original) a disposição mostra na aba aberta. 
	local swatchLimit = function()
		return 12
	end
	-- Desfazer e Refazer: cada mudança do visual entra no histórico.
	local history = { look() }
	local historyAt = 0
	local apply = function(changed)
		look(changed)
		chosenLook(changed)
	end
	local set = function(changed)
		while #history > historyAt + 1 do
			history[#history] = nil
		end
		local _changed = changed
		table.insert(history, _changed)
		if #history > HISTORY then
			table.remove(history, 1)
		end
		historyAt = #history - 1
		apply(changed)
	end
	local undo = function()
		if historyAt <= 0 then
			return nil
		end
		historyAt -= 1
		apply(history[historyAt + 1])
	end
	local redo = function()
		if historyAt >= #history - 1 then
			return nil
		end
		historyAt += 1
		apply(history[historyAt + 1])
	end
	local grids = { {
		kind = "head",
		spec = HEAD_GRID,
		views = { byAuthor(Graal.heads, 0), byAuthor(Graal.heads, 1) },
		author = source(0),
		index = source(0),
		firstRow = source(0),
		scrollY = source(0),
		chosen = function()
			return look().head
		end,
		choose = function(piece)
			return set(withPickedHead(look(), piece))
		end,
		pieceId = function(piece)
			local _result = Graal.heads[piece + 1]
			if _result ~= nil then
				_result = _result.id
			end
			local _condition = _result
			if _condition == nil then
				_condition = ""
			end
			return _condition
		end,
		pieceAuthor = function(piece)
			local _result = Graal.heads[piece + 1]
			if _result ~= nil then
				_result = _result.author
			end
			local _condition = _result
			if _condition == nil then
				_condition = ""
			end
			return _condition
		end,
	}, {
		kind = "body",
		spec = BODY_GRID,
		views = { byAuthor(Graal.bodies, 0), byAuthor(Graal.bodies, 1) },
		author = source(0),
		index = source(0),
		firstRow = source(0),
		scrollY = source(0),
		chosen = function()
			return look().body
		end,
		choose = function(piece)
			if piece ~= look().body then
				set(withOutfitPalette(withBody(look(), piece), piece))
			end
		end,
		pieceId = function(piece)
			local _result = Graal.bodies[piece + 1]
			if _result ~= nil then
				_result = _result.id
			end
			local _condition = _result
			if _condition == nil then
				_condition = ""
			end
			return _condition
		end,
		pieceAuthor = function(piece)
			local _result = Graal.bodies[piece + 1]
			if _result ~= nil then
				_result = _result.author
			end
			local _condition = _result
			if _condition == nil then
				_condition = ""
			end
			return _condition
		end,
	} }
	--* As abas 1 e 2 são as grades de cabeças e de corpos. 
	local gridOf = function(index)
		return if index >= 1 and index <= 2 then grids[index] else nil
	end
	local viewOf = function(grid)
		return grid.views[lookGender(look()) + 1]
	end
	local favoriteIds = function(grid)
		return if grid.kind == "head" then saved().favoriteHeads else saved().favoriteBodies
	end
	local listOf = function(grid)
		local list = viewOf(grid).lists[grid.author() + 1] or {}
		if not favoritesOnly() then
			return list
		end
		local favorites = favoriteIds(grid)
		-- ▼ ReadonlyArray.filter ▼
		local _newValue = {}
		local _callback = function(piece)
			local _arg0 = grid.pieceId(piece)
			return table.find(favorites, _arg0) ~= nil
		end
		local _length = 0
		for _k, _v in list do
			if _callback(_v, _k - 1, list) == true then
				_length += 1
				_newValue[_length] = _v
			end
		end
		-- ▲ ReadonlyArray.filter ▲
		return _newValue
	end
	local rowsOf = function(grid)
		return math.ceil(#listOf(grid) / grid.spec.columns)
	end
	local visibleRows = function(grid)
		return math.max(1, math.floor(gridHeight / grid.spec.stepY))
	end
	--* Rola a grade para a fileira do cursor aparecer inteira. 
	local reveal = function(grid)
		local scroller = grid.scroller
		if not scroller then
			return nil
		end
		local row = math.floor(grid.index() / grid.spec.columns)
		local top = row * grid.spec.stepY
		local bottom = top + grid.spec.h + gridPad * 2
		local view = scroller.CanvasPosition.Y / k()
		if top < view then
			scroller.CanvasPosition = Vector2.new(0, top * k())
		elseif bottom > view + gridHeight then
			scroller.CanvasPosition = Vector2.new(0, (bottom - gridHeight) * k())
		end
	end
	local pointAtChosen = function(grid)
		local _grid = grid
		local _exp = listOf(grid)
		local _arg0 = grid.chosen()
		_grid.index(math.max(0, (table.find(_exp, _arg0) or 0) - 1))
		task.defer(function()
			return reveal(grid)
		end)
	end
	local clothCount = function()
		local _result = lookBody(look())
		if _result ~= nil then
			_result = #_result.cloths
		end
		local _condition = _result
		if _condition == nil then
			_condition = 0
		end
		return _condition
	end
	local detailCount = function()
		local _result = lookHead(look())
		if _result ~= nil then
			_result = #_result.details
		end
		local _condition = _result
		if _condition == nil then
			_condition = 0
		end
		return _condition
	end
	--* A cor que o seletor da aba aberta muda. 
	local rgbKey = function()
		if tab() == 1 then
			return if colorStrip() then "hairRgb" else nil
		end
		if tab() == 2 then
			-- O corpo novo pode ter menos partes que a escolhida: vale a primeira.
			local index = if clothPart() < clothCount() then clothPart() else 0
			return if colorStrip() and index < clothCount() then CLOTH_KEYS[index + 1] else nil
		end
		if tab() == 3 then
			return if hairPart() == 0 then "hairRgb" elseif hairPart() <= detailCount() then DETAIL_KEYS[hairPart()] else nil
		end
		if tab() == 4 then
			return FACE_PARTS[facePart() + 1].key
		end
		if tab() == 5 then
			return if clothPart() < clothCount() then CLOTH_KEYS[clothPart() + 1] else nil
		end
		return nil
	end
	local paintable = function()
		local key = rgbKey()
		return key ~= nil and originalRgb(look(), key) ~= nil
	end
	local presets = function()
		local index = tab()
		if index == 1 or (index == 3 and hairPart() == 0) then
			return HAIR_PRESETS
		end
		return if index == 4 then FACE_PARTS[facePart() + 1].presets else CLOTHES_PRESETS
	end
	local swatchCount = function()
		return math.min(#presets() + 1, swatchLimit())
	end
	--* O título da cor de agora: "Cor do cabelo", "Cor da camisa"... 
	local colorTitle = function()
		local index = tab()
		if index == 1 or (index == 3 and hairPart() == 0) then
			return "customize.hairColor"
		end
		if index == 2 or index == 5 then
			local part = if clothPart() < clothCount() then clothPart() else 0
			local _kind = Graal.bodies[look().body + 1]
			if _kind ~= nil then
				_kind = _kind.clothKinds[part + 1]
			end
			local kind = _kind
			return if kind ~= nil then CLOTH_TITLES[kind] else "customize.outfitColor"
		end
		return if index == 4 then FACE_PARTS[facePart() + 1].title else "customize.color"
	end
	local setChannel = function(key, channel, value)
		local _condition = partRgb(look(), key)
		if _condition == nil then
			_condition = 0xffffff
		end
		local channels = channelsOfRgb(_condition)
		channels[channel + 1] = value
		set(withValue(look(), key, rgbOfChannels(channels[1], channels[2], channels[3])))
	end
	--* A cor da parte de agora volta à do artista. 
	local restore = function()
		local key = rgbKey()
		if key and paintable() then
			set(withValue(look(), key, ORIGINAL))
		end
	end
	--* As partes que a aba `index` tem, na ordem do teclado. Na aba Gênero, a grade são os dois cartões. 
	local partsOf = function(index)
		if index == 0 then
			return { 1 }
		end
		if index <= 2 then
			return if colorStrip() then { 0, 1, 3, 4, 5, 6 } else { 0, 1 }
		end
		return { 2, 3, 4, 5, 6 }
	end
	local pickCount = function()
		return if tab() == 3 then 1 + detailCount() elseif tab() == 4 then #FACE_PARTS else math.max(clothCount(), 1)
	end
	local pickValue = function()
		return if tab() == 3 then hairPart() elseif tab() == 4 then facePart() else clothPart()
	end
	--* O nome da parte `index` da aba de cor aberta: Cabelo, Detalhe 1, Pele, Olhos, Camisa, Calça... 
	local pickName = function(index)
		if tab() == 3 then
			return if index == 0 then t("part.hair") else t("part.detail", {
				n = index,
			})
		end
		if tab() == 4 then
			return if FACE_PARTS[index + 1] then t(FACE_PARTS[index + 1].name) else ""
		end
		local _result = Graal.bodies[look().body + 1]
		if _result ~= nil then
			_result = _result.clothKinds
		end
		local _condition = _result
		if _condition == nil then
			_condition = {}
		end
		local kinds = _condition
		local kind = kinds[index + 1]
		if kind == nil then
			return t("part.cloth", {
				n = index + 1,
			})
		end
		local name = t(CLOTH_NAMES[kind])
		-- tipo repetido no mesmo corpo (duas camisas, uma por cima da outra): Camisa, Camisa 2
		local n = 0
		do
			local i = 0
			local _shouldIncrement = false
			while true do
				if _shouldIncrement then
					i += 1
				else
					_shouldIncrement = true
				end
				if not (i <= index) then
					break
				end
				if kinds[i + 1] == kind then
					n += 1
				end
			end
		end
		return if n > 1 then t("part.numbered", {
			name = name,
			n = n,
		}) else name
	end
	local setPick = function(value)
		return if tab() == 3 then hairPart(value) elseif tab() == 4 then facePart(value) else clothPart(value)
	end
	local setGender = function(gender)
		if gender == lookGender(look()) then
			return nil
		end
		batch(function()
			local changed = withGender(look(), gender)
			set(if changed.body ~= look().body then withOutfitPalette(changed, changed.body) else changed)
			for _, grid in grids do
				grid.author(0)
				pointAtChosen(grid)
			end
		end)
	end
	--[[
		*
		     * O estilo da cabeça ou do corpo (Aeko ou Original). Vale para a peça escolhida, e a grade mostra as
		     * peças nele; escolher outra peça ou o Aleatório mantêm o estilo marcado (decisões do usuário em
		     * 2026-10-18). A troca entra no histórico do Desfazer.
		     
	]]
	local styleOf = function(kind)
		return if kind == "head" then look().headStyle else look().bodyStyle
	end
	local setStyle = function(kind, style)
		if style ~= styleOf(kind) then
			set(withStyle(look(), kind, style))
		end
	end
	--* A tecla do estilo: troca o da peça da aba aberta (Cabeça ou Corpo). 
	local toggleStyle = function()
		local grid = gridOf(tab())
		if not grid then
			return nil
		end
		-- ▼ ReadonlyArray.findIndex ▼
		local _callback = function(item)
			return item.style == styleOf(grid.kind)
		end
		local _result = -1
		for _i, _v in STYLES do
			if _callback(_v, _i - 1, STYLES) == true then
				_result = _i - 1
				break
			end
		end
		-- ▲ ReadonlyArray.findIndex ▲
		local at = _result
		setStyle(grid.kind, STYLES[(at + 1) % #STYLES + 1].style)
	end
	--[[
		*
		     * Um visual sorteado do gênero escolhido: cabeça, corpo, cabelo e pele, e a roupa combinando. Os
		     * estilos não são sorteados: cada peça vem no que está marcado.
		     
	]]
	local random = Random.new()
	local randomize = function()
		local gender = lookGender(look())
		local heads = viewOf(grids[1]).lists[1]
		local bodies = viewOf(grids[2]).lists[1]
		if #heads == 0 or #bodies == 0 then
			return nil
		end
		local head = heads[random:NextInteger(0, #heads - 1) + 1]
		local body = bodies[random:NextInteger(0, #bodies - 1) + 1]
		local _object = table.clone(look())
		setmetatable(_object, nil)
		_object.gender = gender
		local changed = withHead(_object, head)
		changed.hairRgb = if random:NextNumber() < 0.4 then ORIGINAL else HAIR_PRESETS[random:NextInteger(0, #HAIR_PRESETS - 1) + 1]
		changed.skinRgb = if random:NextNumber() < 0.5 then ORIGINAL else SKIN_PRESETS[random:NextInteger(0, NATURAL_SKINS - 1) + 1]
		changed = withOutfitPalette(withBody(changed, body), body)
		set(changed)
		for _, grid in grids do
			pointAtChosen(grid)
		end
	end
	local focusPart = function(target)
		part(target)
		cursor(if target == 2 then pickValue() elseif target == 1 and tab() == 0 then lookGender(look()) else 0)
	end
	local openTab = function(index)
		local wrapped = (index + #TABS_LIST) % #TABS_LIST
		batch(function()
			tab(wrapped)
			local grid = gridOf(wrapped)
			if grid then
				pointAtChosen(grid)
			end
			if clothPart() >= clothCount() then
				clothPart(0)
			end
			if hairPart() > detailCount() then
				hairPart(0)
			end
			focusPart(if table.find(partsOf(wrapped), 1) ~= nil then 1 else partsOf(wrapped)[1])
		end)
	end
	local choose = function()
		local at = part()
		local grid = gridOf(tab())
		if at == 1 and tab() == 0 then
			setGender(if cursor() == 1 then 1 else 0)
		elseif at == 1 and grid then
			local piece = listOf(grid)[grid.index() + 1]
			if piece ~= nil then
				grid.choose(piece)
			end
		elseif at == 6 then
			local key = rgbKey()
			if not key or not paintable() then
				return nil
			end
			set(withValue(look(), key, if cursor() == 0 then ORIGINAL else presets()[cursor()]))
		end
	end
	local favoriteAtCursor = function()
		local grid = gridOf(tab())
		if not grid or part() ~= 1 then
			return nil
		end
		local piece = listOf(grid)[grid.index() + 1]
		if piece ~= nil then
			toggleFavorite(grid.kind, grid.pieceId(piece))
		end
	end
	local toggleFavoritesOnly = function()
		favoritesOnly(not favoritesOnly())
		for _, grid in grids do
			grid.index(0)
			if grid.scroller then
				grid.scroller.CanvasPosition = Vector2.zero
			end
		end
	end
	local nextAuthor = function(grid, step)
		local authors = #viewOf(grid).authors
		grid.author((grid.author() + step + authors) % authors)
		pointAtChosen(grid)
	end
	local move = function(dx, dy)
		local parts = partsOf(tab())
		local at = part()
		local grid = gridOf(tab())
		if at == 1 and grid then
			local count = #listOf(grid)
			if count == 0 then
				if dy < 0 then
					focusPart(0)
				elseif dy > 0 and colorStrip() then
					focusPart(3)
				end
				return nil
			end
			local columns = grid.spec.columns
			if dy < 0 and grid.index() < columns then
				focusPart(0)
				return nil
			end
			-- Da última fileira, para baixo vai à faixa de cor (no Celeiro).
			if dy > 0 and colorStrip() and math.floor(grid.index() / columns) >= math.floor((count - 1) / columns) then
				focusPart(3)
				return nil
			end
			grid.index(math.clamp(grid.index() + dx + dy * columns, 0, count - 1))
			reveal(grid)
			return nil
		end
		if at == 1 and tab() == 0 then
			cursor((cursor() + dx + #GENDERS) % #GENDERS)
			return nil
		end
		if dy ~= 0 then
			local target = parts[math.clamp((table.find(parts, at) or 0) - 1 + dy, 0, #parts - 1) + 1]
			if target ~= at then
				focusPart(target)
			end
			return nil
		end
		if at == 0 and grid then
			nextAuthor(grid, dx)
		elseif at == 2 then
			local value = (pickValue() + dx + pickCount()) % pickCount()
			setPick(value)
			cursor(value)
		elseif at == 6 then
			cursor((cursor() + dx + swatchCount()) % swatchCount())
		else
			local key = rgbKey()
			if not key or not paintable() then
				return nil
			end
			local channel = at - 3
			local _condition = partRgb(look(), key)
			if _condition == nil then
				_condition = 0
			end
			setChannel(key, channel, math.clamp(channelsOfRgb(_condition)[channel + 1] + dx * CHANNEL_STEP, 0, 255))
		end
	end
	local rotate = function(step)
		return turn((turn() + step + #TURN_ORDER) % #TURN_ORDER)
	end
	-- Arrastar uma barra de cor ou o puxador da rolagem com o mouse ou o dedo.
	local dragging
	local draggingScroll
	local dragTo = function(x)
		local key = rgbKey()
		if not dragging or not key or not paintable() then
			return nil
		end
		local _binding = dragging
		local track = _binding.track
		local channel = _binding.channel
		local inner = track.AbsoluteSize.X - 4 * k()
		local fraction = math.clamp((x - track.AbsolutePosition.X - 2 * k()) / math.max(inner, 1), 0, 1)
		setChannel(key, channel, fraction * 255)
	end
	local scrollTo = function(y)
		if not draggingScroll then
			return nil
		end
		local _binding = draggingScroll
		local grid = _binding.grid
		local track = _binding.track
		local scroller = grid.scroller
		if not scroller then
			return nil
		end
		local fraction = math.clamp((y - track.AbsolutePosition.Y) / math.max(track.AbsoluteSize.Y, 1), 0, 1)
		local max = math.max(0, scroller.AbsoluteCanvasSize.Y - scroller.AbsoluteSize.Y)
		scroller.CanvasPosition = Vector2.new(0, fraction * max)
	end
	local startColorDrag = function(channel, track, x)
		part(3 + channel)
		dragging = {
			channel = channel,
			track = track,
		}
		dragTo(x)
	end
	local startScrollDrag = function(grid, track, y)
		draggingScroll = {
			grid = grid,
			track = track,
		}
		scrollTo(y)
	end
	local nextBlink = os.clock() + random:NextNumber(BLINK_MIN, BLINK_MAX)
	cleanup(RunService.Heartbeat:Connect(function()
		local now = os.clock()
		local walk = math.floor(now * WALK_FPS) % WALK_FRAMES
		if walk ~= walkFrame() then
			walkFrame(walk)
		end
		if now >= nextBlink + BLINK_TIME then
			nextBlink = now + random:NextNumber(BLINK_MIN, BLINK_MAX)
		end
		local shut = now >= nextBlink
		if shut ~= closed() then
			closed(shut)
		end
	end))
	cleanup(UserInputService.InputBegan:Connect(function(input, processed)
		if processed then
			return nil
		end
		local key = input.KeyCode
		if key == Enum.KeyCode.A or key == Enum.KeyCode.Left then
			move(-1, 0)
		elseif key == Enum.KeyCode.D or key == Enum.KeyCode.Right then
			move(1, 0)
		elseif key == Enum.KeyCode.W or key == Enum.KeyCode.Up then
			move(0, -1)
		elseif key == Enum.KeyCode.S or key == Enum.KeyCode.Down then
			move(0, 1)
		elseif key == Enum.KeyCode.Space then
			choose()
		elseif key == Enum.KeyCode.Q then
			openTab(tab() - 1)
		elseif key == Enum.KeyCode.E then
			openTab(tab() + 1)
		elseif key == Enum.KeyCode.R then
			rotate(1)
		elseif key == Enum.KeyCode.Z then
			undo()
		elseif key == Enum.KeyCode.Y then
			redo()
		elseif key == Enum.KeyCode.F then
			favoriteAtCursor()
		elseif key == STYLE_KEY then
			toggleStyle()
		elseif key == Enum.KeyCode.Return then
			onDone(true)
		elseif key == Enum.KeyCode.Backspace then
			onDone(false)
		end
	end))
	cleanup(UserInputService.InputChanged:Connect(function(input)
		local kind = input.UserInputType
		if kind ~= Enum.UserInputType.MouseMovement and kind ~= Enum.UserInputType.Touch then
			return nil
		end
		if dragging then
			dragTo(input.Position.X)
		end
		if draggingScroll then
			scrollTo(input.Position.Y)
		end
	end))
	cleanup(UserInputService.InputEnded:Connect(function(input)
		local kind = input.UserInputType
		if kind == Enum.UserInputType.MouseButton1 or kind == Enum.UserInputType.Touch then
			dragging = nil
			draggingScroll = nil
		end
	end))
	--[[
		*
		     * A disposição do tema diz como é a tela: se as grades têm a faixa de cor e quantas amostras cabem.
		     * Chamar ao montar; o foco volta para o começo da aba aberta.
		     
	]]
	local useLayout = function(options)
		colorStrip(options.colorStrip)
		swatchLimit = options.swatchLimit
		openTab(tab())
	end
	--[[
		*
		     * Mostra a dica `text` em cima do mouse. O MouseEnter dá a posição na tela inteira, com a barra do
		     * Roblox; as posições da interface começam embaixo dela.
		     
	]]
	local showHint = function(text, x, y)
		local inset = GuiService:GetGuiInset()
		tooltip({
			text = text,
			x = x - inset.X,
			y = y - inset.Y - 6 * k(),
		})
	end
	return {
		k = k,
		onDone = onDone,
		look = look,
		set = set,
		undo = undo,
		redo = redo,
		randomize = randomize,
		tab = tab,
		openTab = openTab,
		part = part,
		focusPart = focusPart,
		cursor = cursor,
		move = move,
		choose = choose,
		turn = turn,
		rotate = rotate,
		walkFrame = walkFrame,
		closed = closed,
		name = name,
		saved = saved,
		favoritesOnly = favoritesOnly,
		toggleFavoritesOnly = toggleFavoritesOnly,
		grids = grids,
		gridOf = gridOf,
		viewOf = viewOf,
		listOf = listOf,
		rowsOf = rowsOf,
		favoriteIds = favoriteIds,
		visibleRows = visibleRows,
		nextAuthor = nextAuthor,
		setGridView = function(height, pad)
			gridHeight = height
			gridPad = pad
		end,
		gridHeight = function()
			return gridHeight
		end,
		colorStrip = colorStrip,
		useLayout = useLayout,
		hairPart = hairPart,
		facePart = facePart,
		clothPart = clothPart,
		clothCount = clothCount,
		detailCount = detailCount,
		rgbKey = rgbKey,
		paintable = paintable,
		presets = presets,
		swatchCount = swatchCount,
		colorTitle = colorTitle,
		restore = restore,
		pickCount = pickCount,
		pickValue = pickValue,
		pickName = pickName,
		setPick = setPick,
		setGender = setGender,
		styleOf = styleOf,
		setStyle = setStyle,
		startColorDrag = startColorDrag,
		startScrollDrag = startScrollDrag,
		tooltip = tooltip,
		showHint = showHint,
		characterName = characterName,
	}
end
return {
	range = range,
	createCustomize = createCustomize,
	TABS_LIST = TABS_LIST,
	GENDERS = GENDERS,
	HEAD_GRID = HEAD_GRID,
	BODY_GRID = BODY_GRID,
	SPARE_ROWS = SPARE_ROWS,
	poolSize = poolSize,
	SKIN_PRESETS = SKIN_PRESETS,
	HAIR_PRESETS = HAIR_PRESETS,
	EYES_PRESETS = EYES_PRESETS,
	CLOTHES_PRESETS = CLOTHES_PRESETS,
	FACE_PARTS = FACE_PARTS,
	STYLE_KEY = STYLE_KEY,
	STYLES = STYLES,
}
