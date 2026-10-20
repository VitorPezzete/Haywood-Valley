-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
-- Peças da tela de personalizar que as duas disposições usam (celeiro.tsx e graal.tsx): o boneco
-- desenhado na interface, o botão do kit com texto na fonte de pixel, a grade com rolagem, a barra de
-- cor, as cores prontas, o visual salvo, o campo do nome, os cartões de gênero, a dica e o cursor.
-- Tudo em pixels de arte de um palco de 480×270; `at(x, y)` converte para a tela. As medidas que
-- mudam de uma prancha para a outra entram como opções.
local _vide = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "vide", "src")
local Vide = _vide
local action = _vide.action
local cleanup = _vide.cleanup
local derive = _vide.derive
local source = _vide.source
local untrack = _vide.untrack
local _appearance = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "appearance")
local channelsOfRgb = _appearance.channelsOfRgb
local colorOfRgb = _appearance.colorOfRgb
local lookGender = _appearance.lookGender
local ORIGINAL = _appearance.ORIGINAL
local originalRgb = _appearance.originalRgb
local partRgb = _appearance.partRgb
local withBody = _appearance.withBody
local withGender = _appearance.withGender
local withPickedHead = _appearance.withPickedHead
local Graal = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "graal").Graal
local _names = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "names")
local NAME_MAX = _names.NAME_MAX
local cleanName = _names.cleanName
local withOutfitPalette = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "outfitPalette").withOutfitPalette
local decodeSavedLook = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "playerData").decodeSavedLook
local _playerData = TS.import(script, script.Parent.Parent.Parent, "state", "playerData")
local saveLook = _playerData.saveLook
local toggleFavorite = _playerData.toggleFavorite
local _graalArt = TS.import(script, script.Parent.Parent.Parent, "world", "graalArt")
local FIGURE = _graalArt.FIGURE
local figureLayers = _graalArt.figureLayers
local GRAAL_CELL = _graalArt.GRAAL_CELL
local HEAD_Y = _graalArt.HEAD_Y
local headLayers = _graalArt.headLayers
local layerPosition = _graalArt.layerPosition
local layerRect = _graalArt.layerRect
local MAX_FIGURE_LAYERS = _graalArt.MAX_FIGURE_LAYERS
local _i18n = TS.import(script, script.Parent.Parent, "i18n")
local keyName = _i18n.keyName
local t = _i18n.t
local _kit = TS.import(script, script.Parent.Parent, "kit")
local px = _kit.px
local WHITE = _kit.WHITE
local _pixelText = TS.import(script, script.Parent.Parent, "pixelText")
local PixelText = _pixelText.PixelText
local textWidth = _pixelText.textWidth
local _theme = TS.import(script, script.Parent.Parent, "theme")
local metric = _theme.metric
local piece = _theme.piece
local pieceSize = _theme.pieceSize
local themeColor = _theme.themeColor
local themed = _theme.themed
local _state = TS.import(script, script.Parent, "state")
local GENDERS = _state.GENDERS
local poolSize = _state.poolSize
local range = _state.range
local SPARE_ROWS = _state.SPARE_ROWS
local STYLE_KEY = _state.STYLE_KEY
local STYLES = _state.STYLES
--* Camadas de uma cabeça, no máximo: a inteira, o cabelo, a pele, os olhos e 3 enfeites. 
local MAX_HEAD_LAYERS = 7
--* As cores de um texto: a letra e a sombra de 1 px embaixo (como nas pranchas). 
--* Retângulos de cor chapada, em pixels de arte: x, y, largura, altura, cor e, se tiver, a opacidade (0 a 1). 
--* Como a grade aparece na prancha do tema. 
local function makeParts(ctx, visibleIcons)
	if visibleIcons == nil then
		visibleIcons = {}
	end
	local _binding = ctx
	local k = _binding.k
	local at = function(x, y)
		return function()
			return UDim2.fromOffset(x * k(), y * k())
		end
	end
	local isPointer = function(input)
		return input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch
	end
	local function read(value)
		local _value = value
		return if type(_value) == "function" then value() else value
	end
	--* O tamanho do desenho de um ícone: o tema guarda cada ícone centrado num quadro de 16, como o `pad` dos scripts. 
	local iconVisible = function(name)
		return visibleIcons[name] or pieceSize(name)
	end
	--* Onde o desenho do ícone começa dentro do quadro dele. 
	local iconInset = function(name)
		local size = pieceSize(name)
		local seen = iconVisible(name)
		return Vector2.new(math.floor((size.X - seen.X) / 2), math.floor((size.Y - seen.Y) / 2))
	end
	--* Um texto na fonte de pixel no ponto (x, y) do pai, com a cor e a sombra de `ink`. 
	local label = function(text, x, y, ink, options)
		if options == nil then
			options = {}
		end
		local inkNow = function()
			return read(ink)
		end
		-- Com a tinta numa função, a sombra pode ir e vir (a tinta muda com o tema).
		local _ink = ink
		local shadow = if type(_ink) == "function" then function()
			return inkNow().shadow
		end elseif ink.shadow then function()
			return ink.shadow
		end else nil
		local _attributes = {
			k = k,
			text = text,
			color = function()
				return inkNow().color
			end,
			shadow = shadow,
			outline = if inkNow().outline then function()
				return inkNow().outline or WHITE
			end else nil,
			position = function()
				return UDim2.fromOffset(read(x) * k(), read(y) * k())
			end,
			width = options.width,
			align = options.align,
			bold = options.bold,
			wrap = options.wrap,
			lineHeight = options.lineHeight,
			gradient = options.gradient,
			maxChars = options.maxChars,
		}
		local _condition = options.zIndex
		if _condition == nil then
			_condition = 20
		end
		_attributes.zIndex = _condition
		local node = (Vide.jsx(PixelText, _attributes))
		if options.visible then
			local visible = options.visible
			local _attributes_1 = {
				BackgroundTransparency = 1,
				Size = UDim2.fromScale(1, 1),
				Visible = visible,
			}
			local _condition_1 = options.zIndex
			if _condition_1 == nil then
				_condition_1 = 20
			end
			_attributes_1.ZIndex = _condition_1
			return Vide.jsx("frame", _attributes_1, node)
		end
		return node
	end
	--[[
		*
		     * Uma letra com contorno de 1 px sem negrito (o R, o G e o B do Clássico): quatro cópias na cor do
		     * contorno, uma para cada lado, e a letra por cima.
		     
	]]
	local outlinedLabel = function(text, x, y, color, outline, zIndex)
		local _array = {}
		local _length = #_array
		local _exp = { { -1, 0 }, { 1, 0 }, { 0, -1 }, { 0, 1 } }
		-- ▼ ReadonlyArray.map ▼
		local _newValue = table.create(#_exp)
		local _callback = function(_param)
			local dx = _param[1]
			local dy = _param[2]
			return label(function()
				return text
			end, x + dx, y + dy, {
				color = outline,
			}, {
				zIndex = zIndex,
				maxChars = 2,
			})
		end
		for _k, _v in _exp do
			_newValue[_k] = _callback(_v, _k - 1, _exp)
		end
		-- ▲ ReadonlyArray.map ▲
		local _Length = #_newValue
		table.move(_newValue, 1, _Length, _length + 1, _array)
		_length += _Length
		_array[_length + 1] = label(function()
			return text
		end, x, y, {
			color = color,
		}, {
			zIndex = zIndex + 2,
			maxChars = 2,
		})
		return _array
	end
	--* Um ícone do tema com o canto do quadro em (x, y). 
	local icon = function(name, x, y, zIndex, options)
		if options == nil then
			options = {}
		end
		local which = function()
			return read(name)
		end
		local _attributes = table.clone(themed(which, k))
		setmetatable(_attributes, nil)
		_attributes.Position = function()
			return UDim2.fromOffset(read(x) * k(), read(y) * k())
		end
		_attributes.Size = function()
			local size = pieceSize(which())
			return UDim2.fromOffset(size.X * k(), size.Y * k())
		end
		_attributes.ImageColor3 = options.tint or WHITE
		_attributes.ImageTransparency = options.transparency or 0
		_attributes.Visible = options.visible or true
		_attributes.ZIndex = zIndex
		return Vide.jsx("imagelabel", _attributes)
	end
	--* Um ícone com o desenho (não o quadro) começando em (x, y), como os `blit` das pranchas. 
	local iconSeen = function(name, x, y, zIndex, options)
		if options == nil then
			options = {}
		end
		return icon(name, function()
			return read(x) - iconInset(name).X
		end, function()
			return read(y) - iconInset(name).Y
		end, zIndex, options)
	end
	--* Retângulos chapados (cercas e sombras dos palcos), ampliados `zoom` vezes. 
	local rects = function(list, zoom, zIndex)
		-- ▼ ReadonlyArray.map ▼
		local _newValue = table.create(#list)
		local _callback = function(_param)
			local x = _param[1]
			local y = _param[2]
			local w = _param[3]
			local h = _param[4]
			local color = _param[5]
			local alpha = _param[6]
			local _attributes = {
				BackgroundColor3 = color,
			}
			local _condition = alpha
			if _condition == nil then
				_condition = 1
			end
			_attributes.BackgroundTransparency = 1 - _condition
			_attributes.BorderSizePixel = 0
			_attributes.Position = at(x * zoom, y * zoom)
			_attributes.Size = px(k, w * zoom, h * zoom)
			_attributes.ZIndex = zIndex
			return Vide.jsx("frame", _attributes)
		end
		for _k, _v in list do
			_newValue[_k] = _callback(_v, _k - 1, list)
		end
		-- ▲ ReadonlyArray.map ▲
		return _newValue
	end
	--* Um boneco desenhado na interface: uma imagem por camada possível, escondidas as que o visual não usa. 
	local figure = function(layers, count, zoom, zIndex, rect, top, place)
		if top == nil then
			top = 0
		end
		if place == nil then
			place = function(layer)
				return layerPosition(layer)
			end
		end
		local _exp = range(count)
		-- ▼ ReadonlyArray.map ▼
		local _newValue = table.create(#_exp)
		local _callback = function(index)
			return Vide.jsx("imagelabel", {
				BackgroundTransparency = 1,
				Position = function()
					local layer = layers()[index + 1]
					local position = if layer then place(layer) else Vector2.zero
					return UDim2.fromOffset(position.X * zoom * k(), (position.Y - top) * zoom * k())
				end,
				Size = px(k, GRAAL_CELL.X * zoom, GRAAL_CELL.Y * zoom),
				Visible = function()
					return layers()[index + 1] ~= nil
				end,
				Image = function()
					local _result = layers()[index + 1]
					if _result ~= nil then
						_result = _result.image
					end
					local _condition = _result
					if _condition == nil then
						_condition = ""
					end
					return _condition
				end,
				ImageColor3 = function()
					local _result = layers()[index + 1]
					if _result ~= nil then
						_result = _result.color
					end
					local _condition = _result
					if _condition == nil then
						_condition = WHITE
					end
					return _condition
				end,
				ImageRectSize = GRAAL_CELL,
				ImageRectOffset = function()
					local layer = layers()[index + 1]
					return if layer then rect(layer) else Vector2.zero
				end,
				ResampleMode = "Pixelated",
				ZIndex = zIndex,
			})
		end
		for _k, _v in _exp do
			_newValue[_k] = _callback(_v, _k - 1, _exp)
		end
		-- ▲ ReadonlyArray.map ▲
		return _newValue
	end
	local frontStill = function(layer)
		return layerRect(layer, 0, 0, 2, false)
	end
	--[[
		*
		     * Botão do kit do tema, com os estados normal, em cima e apertado, e ícone e texto na face (por
		     * padrão centrados, como o `button` das pranchas; `contentX`, `textX` e `iconX` põem cada um no
		     * lugar). O conteúdo desce `pressedOffset` quando apertado. Escolhido, aparece como o principal ou,
		     * com `chosenStyle: "pressed"`, afundado.
		     
	]]
	local button = function(props)
		local hovered = source(false)
		local pressed = source(false)
		local _condition = props.zIndex
		if _condition == nil then
			_condition = 13
		end
		local z = _condition
		local box = function()
			return read(props.box)
		end
		local chosen = function()
			local _result = props.chosen
			if _result ~= nil then
				_result = _result()
			end
			return _result == true
		end
		local sunk = function()
			return chosen() and props.chosenStyle == "pressed"
		end
		local main = function()
			return props.kind == "primary" or (chosen() and props.chosenStyle ~= "pressed")
		end
		local pieceName = function()
			local base = if props.kind == "icon" then "iconButton" elseif main() then "buttonPrimary" else "buttonSecondary"
			return `{base}{if pressed() or sunk() then "Pressed" elseif hovered() then "Hover" else ""}`
		end
		local drop = function()
			return if pressed() or sunk() then metric("pressedOffset") else 0
		end
		local iconName = function()
			local _result = props.icon
			if _result ~= nil then
				_result = _result()
			end
			return _result
		end
		local iconSize = function()
			local name = iconName()
			return if name then iconVisible(name) else Vector2.zero
		end
		local textW = function()
			return if props.text then textWidth(props.text()) else 0
		end
		local gap = function()
			local _result
			if props.text and iconName() then
				local _condition_1 = props.gap
				if _condition_1 == nil then
					_condition_1 = 3
				end
				_result = _condition_1
			else
				_result = 0
			end
			return _result
		end
		local face = function()
			local _condition_1 = props.face
			if _condition_1 == nil then
				_condition_1 = box().h - 3
			end
			return _condition_1
		end
		local startX = function()
			local _condition_1 = props.contentX
			if _condition_1 == nil then
				_condition_1 = math.floor((box().w - (textW() + iconSize().X + gap())) / 2)
			end
			return _condition_1
		end
		local iconX = function()
			local _condition_1 = props.iconX
			if _condition_1 == nil then
				_condition_1 = (if props.iconRight then startX() + textW() + gap() else startX())
			end
			return _condition_1
		end
		local textX = function()
			local _condition_1 = props.textX
			if _condition_1 == nil then
				_condition_1 = (if props.iconRight then startX() else startX() + iconSize().X + gap())
			end
			return _condition_1
		end
		local ink = function()
			local _result = props.ink
			if _result ~= nil then
				_result = _result(main())
			end
			local _condition_1 = _result
			if _condition_1 == nil then
				_condition_1 = {
					color = if main() then themeColor("textOnPrimary") else themeColor("textOnSecondary"),
				}
			end
			return _condition_1
		end
		local _attributes = table.clone(themed(pieceName, k))
		setmetatable(_attributes, nil)
		_attributes.AutoButtonColor = false
		_attributes.Position = function()
			return UDim2.fromOffset(box().x * k(), box().y * k())
		end
		_attributes.Size = function()
			return UDim2.fromOffset(box().w * k(), box().h * k())
		end
		_attributes.Visible = props.visible or true
		_attributes.ZIndex = z
		_attributes.MouseEnter = function(x, y)
			hovered(true)
			if props.tip then
				ctx.showHint(props.tip(), x, y)
			end
		end
		_attributes.MouseLeave = function()
			hovered(false)
			pressed(false)
			ctx.tooltip(nil)
		end
		_attributes.InputBegan = function(input)
			if isPointer(input) then
				pressed(true)
			end
			if input.UserInputType == Enum.UserInputType.MouseButton2 then
				local _result = props.onSecondary
				if _result ~= nil then
					_result()
				end
			end
		end
		_attributes.InputEnded = function(input)
			if isPointer(input) then
				pressed(false)
			end
		end
		_attributes.Activated = props.onPress
		return Vide.jsx("imagebutton", _attributes, Vide.jsx("frame", {
			BackgroundTransparency = 1,
			Position = function()
				return UDim2.fromOffset(0, drop() * k())
			end,
			Size = UDim2.fromScale(1, 1),
			ZIndex = z + 1,
		}, props.icon and icon(function()
			return iconName() or "iconOk"
		end, function()
			return iconX() - (if iconName() then iconInset(iconName()).X else 0)
		end, function()
			local _exp = math.floor((face() - iconSize().Y) / 2)
			local _condition_1 = props.iconDy
			if _condition_1 == nil then
				_condition_1 = 0
			end
			return _exp + _condition_1 - (if iconName() then iconInset(iconName()).Y else 0)
		end, z + 2, {
			tint = props.iconTint,
			transparency = props.iconFade,
			visible = function()
				return iconName() ~= nil
			end,
		}), props.text and label(props.text, textX, function()
			return math.floor((face() - 7) / 2)
		end, ink, {
			zIndex = z + 2,
		})))
	end
	--[[
		*
		     * O seletor de estilo da aba `tabIndex` (Cabeça ou Corpo), em (x, y): o nome "Estilo" e o botão duplo
		     * Aeko | Original do kit, com o estilo marcado aparecendo como escolhido (`chosenStyle`). Vale para a
		     * peça escolhida, e a grade embaixo mostra as peças nele. A tecla (`STYLE_KEY`) aparece na dica.
		     
	]]
	local styleSwitch = function(tabIndex, x, y, h, options)
		local which = ctx.grids[tabIndex]
		local title = function()
			return t("customize.style")
		end
		local startX = function()
			return x + textWidth(title()) + 5
		end
		local buttonW = function(slot)
			return 6 + textWidth(t(STYLES[slot + 1].name)) + 6
		end
		local buttonX = function(slot)
			return if slot == 0 then startX() else startX() + buttonW(0)
		end
		local tip = function()
			return t("customize.styleHelp", {
				key = keyName(STYLE_KEY),
			})
		end
		local _array = { label(title, x, y + math.floor((h - 3 - 7) / 2), options.labelInk, {
			zIndex = options.zIndex,
		}) }
		local _length = #_array
		-- ▼ ReadonlyArray.map ▼
		local _newValue = table.create(#STYLES)
		local _callback = function(item, slot)
			return button({
				kind = "secondary",
				box = function()
					return {
						x = buttonX(slot),
						y = y,
						w = buttonW(slot),
						h = h,
					}
				end,
				text = function()
					return t(item.name)
				end,
				ink = options.ink,
				chosen = function()
					return ctx.styleOf(which.kind) == item.style
				end,
				chosenStyle = options.chosenStyle,
				onPress = function()
					return ctx.setStyle(which.kind, item.style)
				end,
				tip = tip,
				zIndex = options.zIndex,
			})
		end
		for _k, _v in STYLES do
			_newValue[_k] = _callback(_v, _k - 1, STYLES)
		end
		-- ▲ ReadonlyArray.map ▲
		table.move(_newValue, 1, #_newValue, _length + 1, _array)
		return _array
	end
	--* O foco do teclado em volta da área `box`, em pixels de arte, no pai. 
	local cursorFrame = function(box, zIndex)
		local _attributes = table.clone(themed("cursor", k))
		setmetatable(_attributes, nil)
		_attributes.Visible = function()
			return box() ~= nil
		end
		_attributes.Position = function()
			local b = box()
			local out = metric("cursorOutset")
			return if b then UDim2.fromOffset((b.x - out) * k(), (b.y - out) * k()) else UDim2.new()
		end
		_attributes.Size = function()
			local b = box()
			local out = metric("cursorOutset")
			return if b then UDim2.fromOffset((b.w + out * 2) * k(), (b.h + out * 2) * k()) else UDim2.new()
		end
		_attributes.ZIndex = zIndex
		return Vide.jsx("imagelabel", _attributes)
	end
	--* A folga das células dentro do recorte da rolagem, e o recorte. 
	local gridView = function(spec, look)
		local pad = Vector2.new(look.origin.X - look.inset, look.origin.Y - look.inset)
		return {
			pad = pad,
			x = look.well.x + look.inset,
			y = look.well.y + look.inset,
			w = pad.X * 2 + (spec.columns - 1) * spec.stepX + spec.w,
			h = look.well.h - look.inset * 2,
		}
	end
	--[[
		*
		     * A grade com rolagem de cabeças ou corpos da aba `tabIndex`, no poço, com a barra de rolagem e o
		     * aviso de lista vazia. As células à mostra são as de sempre, reaproveitadas ao rolar.
		     
	]]
	local grid = function(tabIndex, look, zIndex)
		local which = ctx.grids[tabIndex]
		local _binding_1 = which
		local spec = _binding_1.spec
		local isHead = tabIndex == 1
		local view = gridView(spec, look)
		ctx.setGridView(view.h, view.pad.Y)
		local poolRows = function()
			return ctx.visibleRows(which) + SPARE_ROWS
		end
		local canvasH = function()
			local rows = ctx.rowsOf(which)
			return if rows > 0 then view.pad.Y * 2 + (rows - 1) * spec.stepY + spec.h else 0
		end
		local cell = function(slot)
			local row = function()
				return which.firstRow() + math.floor(slot / spec.columns)
			end
			local piece = function()
				if math.floor(slot / spec.columns) >= poolRows() then
					return nil
				end
				return ctx.listOf(which)[row() * spec.columns + (slot % spec.columns) + 1]
			end
			-- A miniatura só refaz o desenho com a aba dela aberta e quando muda o que ela mostra: a peça e as
			-- cores (e, no corpo, a cabeça desenhada em cima; a roupa do cartão vem da paleta, que só depende do
			-- cabelo e da pele) e o estilo marcado da cabeça e do corpo. Antes, as duas grades refaziam umas 60 miniaturas a cada mudança no visual, até
			-- escondidas, e arrastar uma barra de cor travava a tela (visto em 2026-10-17). A cabeça aparece com
			-- o cabelo, os olhos e os enfeites que o artista pintou e a pele do boneco (decisão do usuário em
			-- 2026-10-17), do jeito que vem ao ser escolhida (withPickedHead).
			local key = derive(function()
				if ctx.tab() ~= tabIndex then
					return ""
				end
				local value = piece()
				if value == nil then
					return ""
				end
				local now = ctx.look()
				if isHead then
					return `{value}|{now.skinRgb}|{now.headStyle}`
				end
				local colors = `{now.skinRgb}|{now.hairRgb}|{now.eyesRgb}|{now.detail0Rgb}|{now.detail1Rgb}|{now.detail2Rgb}`
				return `{value}|{now.head}|{colors}|{now.headStyle}|{now.bodyStyle}`
			end)
			local layers = derive(function()
				if key() == "" then
					return {}
				end
				return untrack(function()
					local value = piece()
					if value == nil then
						return {}
					end
					return if isHead then headLayers(withPickedHead(ctx.look(), value)) else figureLayers(withOutfitPalette(withBody(ctx.look(), value), value))
				end)
			end)
			local favorite = function()
				local value = piece()
				local _condition = value ~= nil
				if _condition then
					local _exp = ctx.favoriteIds(which)
					local _arg0 = which.pieceId(value)
					_condition = table.find(_exp, _arg0) ~= nil
				end
				return _condition
			end
			local hovered = source(false)
			local chosen = function()
				return piece() == which.chosen()
			end
			local index = function()
				return row() * spec.columns + (slot % spec.columns)
			end
			local star = pieceSize("starOn")
			local _attributes = table.clone(themed(function()
				return if chosen() then "cellChosen" else "cell"
			end, k))
			setmetatable(_attributes, nil)
			_attributes.AutoButtonColor = false
			_attributes.Position = function()
				return UDim2.fromOffset((view.pad.X + (slot % spec.columns) * spec.stepX) * k(), (view.pad.Y + row() * spec.stepY) * k())
			end
			_attributes.Size = px(k, spec.w, spec.h)
			_attributes.Visible = function()
				return piece() ~= nil
			end
			_attributes.ZIndex = zIndex + 1
			_attributes.MouseEnter = function()
				hovered(true)
				if ctx.tab() ~= tabIndex or piece() == nil then
					return nil
				end
				ctx.part(1)
				which.index(index())
			end
			_attributes.MouseLeave = function()
				return hovered(false)
			end
			_attributes.Activated = function()
				local value = piece()
				if value ~= nil then
					which.choose(value)
				end
			end
			local _exp = Vide.jsx("frame", {
				BackgroundTransparency = 1,
				Position = at((spec.w - FIGURE.X) / 2, if isHead then (spec.h - GRAAL_CELL.Y) / 2 else (spec.h - FIGURE.Y) / 2),
				Size = px(k, FIGURE.X, if isHead then GRAAL_CELL.Y else FIGURE.Y),
				ZIndex = zIndex + 2,
			}, figure(layers, if isHead then MAX_HEAD_LAYERS else MAX_FIGURE_LAYERS, 1, zIndex + 2, frontStill, if isHead then HEAD_Y else 0))
			local _attributes_1 = table.clone(themed(function()
				return if favorite() then "starOn" else "starOff"
			end, k))
			setmetatable(_attributes_1, nil)
			_attributes_1.AutoButtonColor = false
			_attributes_1.Position = at(look.star.X, look.star.Y)
			_attributes_1.Size = px(k, star.X, star.Y)
			_attributes_1.Visible = function()
				return favorite() or hovered() or (ctx.part() == 1 and which.index() == index())
			end
			_attributes_1.ZIndex = zIndex + 4
			_attributes_1.Activated = function()
				local value = piece()
				if value ~= nil then
					toggleFavorite(which.kind, which.pieceId(value))
				end
			end
			return Vide.jsx("imagebutton", _attributes, _exp, Vide.jsx("imagebutton", _attributes_1))
		end
		-- O puxador: o do Clássico estica com o tamanho da lista; o do Celeiro é a peça inteira.
		local thumb = function()
			local size = pieceSize("scrollThumb")
			local fixed = piece("scrollThumb").slice == nil
			local total = canvasH()
			local inner = look.track.h - look.thumbPad * 2
			local height = if fixed then size.Y else math.clamp(if total > 0 then (view.h / total) * inner else inner, 12, inner)
			local max = math.max(1, total - view.h)
			local top = (math.clamp(which.scrollY(), 0, max) / max) * (inner - height)
			local width = if fixed then size.X else look.track.w - 2
			return {
				top = math.floor(top),
				height = math.floor(height),
				width = width,
				x = math.floor((look.track.w - width) / 2),
			}
		end
		local trackRef
		local _attributes = table.clone(themed("well", k))
		setmetatable(_attributes, nil)
		_attributes.Position = at(look.well.x, look.well.y)
		_attributes.Size = px(k, look.well.w, look.well.h)
		_attributes.ZIndex = zIndex
		local _exp = Vide.jsx("imagelabel", _attributes)
		local _exp_1 = action(function(instance)
			which.scroller = instance
			cleanup(instance:GetPropertyChangedSignal("CanvasPosition"):Connect(function()
				local rowNow = math.floor(instance.CanvasPosition.Y / k() / spec.stepY)
				if rowNow ~= which.firstRow() then
					which.firstRow(rowNow)
				end
				which.scrollY(instance.CanvasPosition.Y / k())
			end))
		end)
		local _exp_2 = range(poolSize(spec))
		-- ▼ ReadonlyArray.map ▼
		local _newValue = table.create(#_exp_2)
		for _k, _v in _exp_2 do
			_newValue[_k] = cell(_v, _k - 1, _exp_2)
		end
		-- ▲ ReadonlyArray.map ▲
		local _exp_3 = Vide.jsx("scrollingframe", {
			BackgroundTransparency = 1,
			BorderSizePixel = 0,
			Position = at(view.x, view.y),
			Size = px(k, view.w, view.h),
			CanvasSize = function()
				return UDim2.fromOffset(0, canvasH() * k())
			end,
			ScrollBarThickness = 0,
			ScrollingDirection = "Y",
			ElasticBehavior = "Never",
			ZIndex = zIndex + 1,
		}, _exp_1, _newValue)
		local _exp_4 = label(function()
			return t("customize.noFavorites")
		end, look.well.x + 10, look.well.y + math.floor(look.well.h / 2) - 8, look.emptyInk, {
			width = look.well.w - 20,
			align = "center",
			wrap = true,
			maxChars = 64,
			zIndex = zIndex + 2,
			visible = function()
				return ctx.favoritesOnly() and #ctx.listOf(which) == 0
			end,
		})
		local _attributes_1 = table.clone(themed("scrollTrack", k))
		setmetatable(_attributes_1, nil)
		_attributes_1.Position = at(look.track.x, look.track.y)
		_attributes_1.Size = px(k, look.track.w, look.track.h)
		_attributes_1.ZIndex = zIndex + 2
		_attributes_1.InputBegan = function(input)
			if isPointer(input) and trackRef then
				ctx.startScrollDrag(which, trackRef, input.Position.Y)
			end
		end
		local _exp_5 = action(function(instance)
			trackRef = instance
		end)
		local _attributes_2 = table.clone(themed("scrollThumb", k))
		setmetatable(_attributes_2, nil)
		_attributes_2.Visible = function()
			return ctx.rowsOf(which) > ctx.visibleRows(which)
		end
		_attributes_2.Position = function()
			return UDim2.fromOffset(thumb().x * k(), (look.thumbPad + thumb().top) * k())
		end
		_attributes_2.Size = function()
			return UDim2.fromOffset(thumb().width * k(), thumb().height * k())
		end
		_attributes_2.ZIndex = zIndex + 3
		return Vide.jsx("frame", {
			BackgroundTransparency = 1,
			Size = UDim2.fromScale(1, 1),
			ZIndex = zIndex,
		}, _exp, _exp_3, _exp_4, Vide.jsx("imagelabel", _attributes_1, _exp_5, Vide.jsx("imagelabel", _attributes_2)))
	end
	--* Onde está o foco do teclado na grade (a célula do cursor, já com a rolagem), no pai do poço. 
	local gridFocus = function(tabIndex, look)
		local which = ctx.grids[tabIndex]
		if ctx.tab() ~= tabIndex or ctx.part() ~= 1 or #ctx.listOf(which) == 0 then
			return nil
		end
		local _binding_1 = which
		local spec = _binding_1.spec
		local row = math.floor(which.index() / spec.columns)
		local y = look.well.y + look.origin.Y + row * spec.stepY - which.scrollY()
		if y < look.well.y - spec.h / 2 or y > look.well.y + look.well.h - spec.h / 2 then
			return nil
		end
		return {
			x = look.well.x + look.origin.X + (which.index() % spec.columns) * spec.stepX,
			y = y,
			w = spec.w,
			h = spec.h,
		}
	end
	--* "id{sep}por autor" da peça. 
	local creditOf = function(id, author, sep)
		return if id == "" then "" else `{id}{sep}{t("credits.by", {
			author = author,
		})}`
	end
	--[[
		*
		     * O crédito da linha de informação: a peça sob o cursor nas grades, a cabeça nas abas de cabelo e
		     * rosto, o corpo na de roupa.
		     
	]]
	local infoCredit = function(sep)
		local index = ctx.tab()
		local grid = ctx.gridOf(index)
		if grid then
			local value = ctx.listOf(grid)[grid.index() + 1]
			return if value ~= nil then creditOf(grid.pieceId(value), grid.pieceAuthor(value), sep) else ""
		end
		if index == 3 or index == 4 then
			local head = Graal.heads[ctx.look().head + 1]
			return if head then creditOf(head.id, head.author, sep) else ""
		end
		if index == 5 then
			local body = Graal.bodies[ctx.look().body + 1]
			return if body then creditOf(body.id, body.author, sep) else ""
		end
		return ""
	end
	--* O nome do artista do filtro, ou "" (todos). 
	local authorName = function(which)
		local _condition = ctx.viewOf(which).authors[which.author() + 1]
		if _condition == nil then
			_condition = ""
		end
		return _condition
	end
	--* A cor da parte de agora, e os três canais dela. 
	local currentRgb = function()
		local key = ctx.rgbKey()
		local _result
		if key ~= nil then
			local _condition = partRgb(ctx.look(), key)
			if _condition == nil then
				_condition = 0
			end
			_result = _condition
		else
			_result = 0
		end
		return _result
	end
	local channels = derive(function()
		return channelsOfRgb(currentRgb())
	end)
	--[[
		*
		     * Barra de um canal (0 R, 1 G, 2 B) em `box`, pintada pelo UIGradient com a cor de agora indo de 0 a
		     * 255 no canal, com o puxador 2 pixels acima do trilho (`knobInset` é a margem do curso dentro dele);
		     * arrastar ou tocar muda o canal.
		     
	]]
	local channelTrack = function(channel, box, zIndex, knobInset)
		local track
		local knob = pieceSize("sliderKnob")
		local colorWith = function(value)
			local c = channels()
			local parts = { c[1], c[2], c[3] }
			parts[channel + 1] = value
			return Color3.fromRGB(parts[1], parts[2], parts[3])
		end
		local knobX = function()
			return box.x + knobInset + math.floor((channels()[channel + 1] * (box.w - 1 - knobInset * 2)) / 255) - 3
		end
		local _attributes = table.clone(themed("sliderTrack", k))
		setmetatable(_attributes, nil)
		_attributes.AutoButtonColor = false
		_attributes.Position = at(box.x, box.y)
		_attributes.Size = px(k, box.w, box.h)
		_attributes.ZIndex = zIndex
		_attributes.MouseEnter = function()
			if ctx.rgbKey() ~= nil then
				ctx.part(3 + channel)
			end
		end
		_attributes.InputBegan = function(input)
			if track and isPointer(input) then
				ctx.startColorDrag(channel, track, input.Position.X)
			end
		end
		local _exp = Vide.jsx("imagebutton", _attributes, action(function(instance)
			track = instance
		end), Vide.jsx("uigradient", {
			Color = function()
				return ColorSequence.new(colorWith(0), colorWith(255))
			end,
		}))
		local _attributes_1 = table.clone(themed("sliderKnob", k))
		setmetatable(_attributes_1, nil)
		_attributes_1.Position = function()
			return UDim2.fromOffset(knobX() * k(), (box.y - 2) * k())
		end
		_attributes_1.Size = px(k, knob.X, knob.Y)
		_attributes_1.ZIndex = zIndex + 1
		return { _exp, Vide.jsx("imagelabel", _attributes_1) }
	end
	local channelValue = function(channel)
		return function()
			return tostring(channels()[channel + 1])
		end
	end
	--* A cor de agora em hexadecimal, com ou sem o "#" (o Clássico mostra, o Celeiro não). 
	local hexText = function(hash)
		return function()
			return string.format(if hash then "#%06X" else "%06X", currentRgb())
		end
	end
	--* A cor pronta `index` (0 = a original) e se é a escolhida. 
	local presetColor = function(index)
		return function()
			if index == 0 then
				local key = ctx.rgbKey()
				local original = if key ~= nil then originalRgb(ctx.look(), key) else nil
				local _condition = original
				if _condition == nil then
					_condition = 0xffffff
				end
				return colorOfRgb(_condition)
			end
			local _condition = ctx.presets()[index]
			if _condition == nil then
				_condition = 0xffffff
			end
			return colorOfRgb(_condition)
		end
	end
	local presetChosen = function(index)
		return function()
			local key = ctx.rgbKey()
			if not key then
				return false
			end
			return if index == 0 then ctx.look()[key] == ORIGINAL else ctx.look()[key] == ctx.presets()[index]
		end
	end
	--[[
		*
		     * Uma cor pronta de `size` em (x, y); a escolhida ganha a moldura por cima (`chosenOutset` para
		     * fora) e a primeira, a original, a marca em `mark`.
		     
	]]
	local preset = function(index, x, y, size, zIndex, look)
		local chosenSize = size + look.chosenOutset * 2
		local _attributes = table.clone(themed("swatchFill", k))
		setmetatable(_attributes, nil)
		_attributes.Position = at(1, 1)
		_attributes.Size = px(k, size - 2, size - 2)
		_attributes.ImageColor3 = presetColor(index)
		_attributes.ZIndex = zIndex
		local _exp = Vide.jsx("imagelabel", _attributes)
		local _attributes_1 = table.clone(themed("preset", k))
		setmetatable(_attributes_1, nil)
		_attributes_1.Size = UDim2.fromScale(1, 1)
		_attributes_1.ZIndex = zIndex + 1
		local _exp_1 = Vide.jsx("imagelabel", _attributes_1)
		local _attributes_2 = table.clone(themed("presetChosen", k))
		setmetatable(_attributes_2, nil)
		_attributes_2.Position = at(-look.chosenOutset, -look.chosenOutset)
		_attributes_2.Size = px(k, chosenSize, chosenSize)
		_attributes_2.Visible = presetChosen(index)
		_attributes_2.ZIndex = zIndex + 2
		return Vide.jsx("imagebutton", {
			BackgroundTransparency = 1,
			AutoButtonColor = false,
			Position = at(x, y),
			Size = px(k, size, size),
			Visible = function()
				return index < ctx.swatchCount() and ctx.paintable()
			end,
			ZIndex = zIndex,
			MouseEnter = function(mx, my)
				ctx.part(6)
				ctx.cursor(index)
				if index == 0 then
					ctx.showHint(t("customize.original"), mx, my)
				end
			end,
			MouseLeave = function()
				return ctx.tooltip(nil)
			end,
			Activated = function()
				ctx.part(6)
				ctx.cursor(index)
				ctx.choose()
			end,
		}, _exp, _exp_1, Vide.jsx("imagelabel", _attributes_2), if index == 0 then icon("originalMark", look.mark.X, look.mark.Y, zIndex + 3) else nil)
	end
	--* A amostra grande da cor de agora em `box`: o miolo pintado `fillInset` para dentro e a moldura por cima. 
	local swatch = function(box, fillInset, zIndex)
		local _attributes = table.clone(themed("swatchFill", k))
		setmetatable(_attributes, nil)
		_attributes.Position = at(box.x + fillInset, box.y + fillInset)
		_attributes.Size = px(k, box.w - fillInset * 2, box.h - fillInset * 2)
		_attributes.ImageColor3 = function()
			return colorOfRgb(currentRgb())
		end
		_attributes.ZIndex = zIndex
		local _exp = Vide.jsx("imagelabel", _attributes)
		local _attributes_1 = table.clone(themed("swatchFrame", k))
		setmetatable(_attributes_1, nil)
		_attributes_1.Position = at(box.x, box.y)
		_attributes_1.Size = px(k, box.w, box.h)
		_attributes_1.ZIndex = zIndex + 1
		return { _exp, Vide.jsx("imagelabel", _attributes_1) }
	end
	--[[
		*
		     * Um visual salvo em `box`: na vaga cheia, o boneco recortado em `clip` com o canto em `figureAt`
		     * (dentro do recorte); na vazia, a peça `empty` com o mais em `plusAt`. Clique na vaga vazia guarda
		     * o visual de agora; na cheia, veste; botão direito ou segurar apaga.
		     
	]]
	local savedSlot = function(slot, box, look, zIndex)
		local stored = derive(function()
			local _condition = ctx.saved().savedLooks[slot + 1]
			if _condition == nil then
				_condition = ""
			end
			return decodeSavedLook(_condition)
		end)
		local layers = derive(function()
			local value = stored()
			return if value then figureLayers(value) else {}
		end)
		local _attributes = table.clone(themed(function()
			return if stored() then "cell" else look.empty
		end, k))
		setmetatable(_attributes, nil)
		_attributes.AutoButtonColor = false
		_attributes.Position = at(box.x, box.y)
		_attributes.Size = px(k, box.w, box.h)
		_attributes.ZIndex = zIndex
		_attributes.MouseEnter = function(x, y)
			return ctx.showHint(t(if stored() then "customize.savedWear" else "customize.savedEmpty"), x, y)
		end
		_attributes.MouseLeave = function()
			return ctx.tooltip(nil)
		end
		_attributes.Activated = function()
			local value = stored()
			if value then
				ctx.set(value)
			else
				saveLook(slot, ctx.look())
			end
		end
		_attributes.InputBegan = function(input)
			if input.UserInputType == Enum.UserInputType.MouseButton2 and stored() then
				saveLook(slot, nil)
			end
		end
		_attributes.TouchLongPress = function()
			if stored() then
				saveLook(slot, nil)
			end
		end
		return Vide.jsx("imagebutton", _attributes, Vide.jsx("frame", {
			BackgroundTransparency = 1,
			ClipsDescendants = true,
			Position = at(look.clip.x, look.clip.y),
			Size = px(k, look.clip.w, look.clip.h),
			Visible = function()
				return stored() ~= nil
			end,
			ZIndex = zIndex + 1,
		}, Vide.jsx("frame", {
			BackgroundTransparency = 1,
			Position = at(look.figureAt.X, look.figureAt.Y),
			Size = px(k, FIGURE.X, FIGURE.Y),
			ZIndex = zIndex + 1,
		}, figure(layers, MAX_FIGURE_LAYERS, 1, zIndex + 1, frontStill))), icon("iconPlus", look.plusAt.X, look.plusAt.Y, zIndex + 1, {
			tint = if look.plusTint then function()
				return look.plusTint or WHITE
			end else nil,
			visible = function()
				return stored() == nil
			end,
		}))
	end
	local savedCount = function()
		local _exp = ctx.saved().savedLooks
		-- ▼ ReadonlyArray.filter ▼
		local _newValue = {}
		local _callback = function(text)
			return text ~= ""
		end
		local _length = 0
		for _k, _v in _exp do
			if _callback(_v, _k - 1, _exp) == true then
				_length += 1
				_newValue[_length] = _v
			end
		end
		-- ▲ ReadonlyArray.filter ▲
		return #_newValue
	end
	--[[
		*
		     * O campo do nome em `box`: a caixa de texto do Roblox recebe a digitação (com a letra transparente) e
		     * o nome aparece por cima na fonte de pixel, com o cursor piscando quando o campo está em foco. O
		     * texto fica em (`padX`, `textY`) e o cursor `caretGap` depois dele, na altura `caretY`.
		     
	]]
	local nameField = function(box, look, zIndex)
		local where = function()
			return read(box)
		end
		local focused = source(false)
		local blink = source(true)
		local shown = function()
			return if ctx.name() == "" and not focused() then t("customize.namePlaceholder") else ctx.name()
		end
		local _attributes = table.clone(themed(function()
			return if focused() then "textFieldFocus" else "textField"
		end, k))
		setmetatable(_attributes, nil)
		_attributes.Position = function()
			return UDim2.fromOffset(where().x * k(), where().y * k())
		end
		_attributes.Size = function()
			return UDim2.fromOffset(where().w * k(), where().h * k())
		end
		_attributes.ZIndex = zIndex
		local _exp = Vide.jsx("textbox", {
			Name = "NameBox",
			BackgroundTransparency = 1,
			Size = UDim2.fromScale(1, 1),
			Text = ctx.name(),
			ClearTextOnFocus = false,
			TextTransparency = 1,
			TextSize = function()
				return 8 * k()
			end,
			ZIndex = zIndex + 3,
		}, action(function(boxInstance)
			local update = function()
				-- O campo não passa de NAME_MAX letras; espaços e o resto se limpam no nome guardado.
				local count = utf8.len(boxInstance.Text)
				local cut = if type(count) == "number" and count > NAME_MAX then utf8.offset(boxInstance.Text, NAME_MAX + 1) else nil
				if cut ~= nil then
					local _text = boxInstance.Text
					local _arg1 = cut - 1
					boxInstance.Text = string.sub(_text, 1, _arg1)
					return nil
				end
				local clean = cleanName(boxInstance.Text)
				ctx.name(clean)
				ctx.characterName(clean)
			end
			cleanup(boxInstance:GetPropertyChangedSignal("Text"):Connect(update))
			cleanup(boxInstance.Focused:Connect(function()
				return focused(true)
			end))
			cleanup(boxInstance.FocusLost:Connect(function()
				return focused(false)
			end))
			update()
		end))
		local _exp_1 = label(shown, look.padX, look.textY, function()
			return if ctx.name() == "" and not focused() then look.placeholder else look.ink
		end, {
			maxChars = NAME_MAX + 4,
			zIndex = zIndex + 1,
		})
		local _attributes_1 = table.clone(themed("textCaret", k))
		setmetatable(_attributes_1, nil)
		_attributes_1.Visible = function()
			return focused() and blink()
		end
		_attributes_1.Position = function()
			return UDim2.fromOffset((look.padX + textWidth(ctx.name()) + look.caretGap) * k(), look.caretY * k())
		end
		_attributes_1.Size = function()
			local size = pieceSize("textCaret")
			return UDim2.fromOffset(size.X * k(), size.Y * k())
		end
		_attributes_1.ZIndex = zIndex + 2
		return Vide.jsx("imagelabel", _attributes, _exp, _exp_1, Vide.jsx("imagelabel", _attributes_1, action(function()
			local running = true
			task.spawn(function()
				while running do
					task.wait(0.5)
					blink(not blink())
				end
			end)
			cleanup(function()
				running = false
			end)
		end)))
	end
	--* Os dois cartões da aba Gênero, lado a lado, centrados em `area`, com o boneco ampliado duas vezes. 
	local genderCards = function(area, card, nameInk, zIndex)
		local left = area.x + math.floor((area.w - card.w * 2 - card.gap) / 2)
		local zoom = 2
		-- ▼ ReadonlyArray.map ▼
		local _newValue = table.create(#GENDERS)
		local _callback = function(item, slot)
			local layers = derive(function()
				return figureLayers(withGender(ctx.look(), item.gender))
			end)
			local x = left + slot * (card.w + card.gap)
			local _attributes = table.clone(themed(function()
				return if lookGender(ctx.look()) == item.gender then "cellChosen" else "card"
			end, k))
			setmetatable(_attributes, nil)
			_attributes.AutoButtonColor = false
			_attributes.Position = at(x, area.y)
			_attributes.Size = px(k, card.w, card.h)
			_attributes.ZIndex = zIndex
			_attributes.MouseEnter = function()
				if ctx.tab() ~= 0 then
					return nil
				end
				ctx.part(1)
				ctx.cursor(slot)
			end
			_attributes.Activated = function()
				return ctx.setGender(item.gender)
			end
			return Vide.jsx("imagebutton", _attributes, Vide.jsx("frame", {
				BackgroundTransparency = 1,
				Position = at(math.floor((card.w - FIGURE.X * zoom) / 2), 4),
				Size = px(k, FIGURE.X * zoom, FIGURE.Y * zoom),
				ZIndex = zIndex + 1,
			}, figure(layers, MAX_FIGURE_LAYERS, zoom, zIndex + 1, frontStill)), label(function()
				return t(item.name)
			end, 0, card.h - 16, nameInk, {
				width = card.w,
				align = "center",
				zIndex = zIndex + 2,
			}))
		end
		for _k, _v in GENDERS do
			_newValue[_k] = _callback(_v, _k - 1, GENDERS)
		end
		-- ▲ ReadonlyArray.map ▲
		return _newValue
	end
	local genderFocus = function(area, card)
		if ctx.tab() ~= 0 or ctx.part() ~= 1 then
			return nil
		end
		local left = area.x + math.floor((area.w - card.w * 2 - card.gap) / 2)
		return {
			x = left + ctx.cursor() * (card.w + card.gap),
			y = area.y,
			w = card.w,
			h = card.h,
		}
	end
	--* A dica flutuante, em cima do mouse, no pai `root`, na peça de dica do tema. 
	local tooltip = function(root, ink, zIndex)
		local _attributes = table.clone(themed("tooltip", k))
		setmetatable(_attributes, nil)
		_attributes.Visible = function()
			return ctx.tooltip() ~= nil
		end
		_attributes.AnchorPoint = Vector2.new(0.5, 1)
		_attributes.Position = function()
			local tip = ctx.tooltip()
			local frame = root()
			if not tip or not frame then
				return UDim2.new()
			end
			local origin = frame.AbsolutePosition
			return UDim2.fromOffset(tip.x - origin.X, tip.y - origin.Y - 2 * k())
		end
		_attributes.Size = function()
			local _result = ctx.tooltip()
			if _result ~= nil then
				_result = _result.text
			end
			local _condition = _result
			if _condition == nil then
				_condition = ""
			end
			return UDim2.fromOffset((textWidth(_condition) + 10) * k(), pieceSize("tooltip").Y * k())
		end
		_attributes.ZIndex = zIndex
		return Vide.jsx("imagelabel", _attributes, label(function()
			local _result = ctx.tooltip()
			if _result ~= nil then
				_result = _result.text
			end
			local _condition = _result
			if _condition == nil then
				_condition = ""
			end
			return _condition
		end, 5, 3, ink, {
			maxChars = 64,
			zIndex = zIndex + 1,
		}))
	end
	return {
		at = at,
		label = label,
		outlinedLabel = outlinedLabel,
		icon = icon,
		iconSeen = iconSeen,
		iconVisible = iconVisible,
		rects = rects,
		figure = figure,
		frontStill = frontStill,
		button = button,
		styleSwitch = styleSwitch,
		cursorFrame = cursorFrame,
		grid = grid,
		gridFocus = gridFocus,
		infoCredit = infoCredit,
		authorName = authorName,
		channelTrack = channelTrack,
		channelValue = channelValue,
		hexText = hexText,
		currentRgb = currentRgb,
		preset = preset,
		swatch = swatch,
		savedSlot = savedSlot,
		savedCount = savedCount,
		nameField = nameField,
		genderCards = genderCards,
		genderFocus = genderFocus,
		tooltip = tooltip,
	}
end
return {
	makeParts = makeParts,
}
