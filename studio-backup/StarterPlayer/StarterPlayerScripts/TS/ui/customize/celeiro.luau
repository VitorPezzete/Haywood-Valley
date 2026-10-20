-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
-- A tela de personalizar no Celeiro (tema padrão), igual à prancha A (Aseprite/ui_propostas/A_celeiro,
-- tela_personalizar_A.png, desenhada por draw_ui_A.lua): à esquerda, o painel do personagem (a faixa
-- do título, o palco com a cerca, Aleatório, Desfazer e Refazer e os visuais salvos); à direita, o
-- painel com as abas centradas em cima, o artista, o crédito e os favoritos, a grade, a faixa de cor
-- e, embaixo, o nome, Voltar e Continuar. A prancha não desenha a aba Gênero nem as abas de cor:
-- aqui elas seguem a mesma linguagem (cartões no Gênero; nas de cor, as partes numa fileira de
-- botões e o editor num poço maior, no lugar da grade e da faixa).
local _vide = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "vide", "src")
local Vide = _vide
local cleanup = _vide.cleanup
local derive = _vide.derive
local CLOTH_KEYS = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "appearance").CLOTH_KEYS
local SAVED_LOOKS = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "playerData").SAVED_LOOKS
local _graalArt = TS.import(script, script.Parent.Parent.Parent, "world", "graalArt")
local figureLayers = _graalArt.figureLayers
local layerPosition = _graalArt.layerPosition
local layerRect = _graalArt.layerRect
local MAX_FIGURE_LAYERS = _graalArt.MAX_FIGURE_LAYERS
local TURN_ORDER = _graalArt.TURN_ORDER
local _sprites = TS.import(script, script.Parent.Parent.Parent, "world", "sprites")
local GRASS_TILE = _sprites.GRASS_TILE
local Sprites = _sprites.Sprites
local t = TS.import(script, script.Parent.Parent, "i18n").t
local px = TS.import(script, script.Parent.Parent, "kit").px
local textWidth = TS.import(script, script.Parent.Parent, "pixelText").textWidth
local themed = TS.import(script, script.Parent.Parent, "theme").themed
local makeParts = TS.import(script, script.Parent, "parts").makeParts
local _state = TS.import(script, script.Parent, "state")
local range = _state.range
local TABS_LIST = _state.TABS_LIST
-- A paleta do script: madeira, papel e a noite do fundo.
local hex = function(value)
	return Color3.fromHex(value)
end
local INK = hex("#0A0F0C")
local W1 = hex("#4A2A16")
local W2 = hex("#6B3A1E")
local W3 = hex("#8A4D1F")
local W4 = hex("#A5601F")
local W5 = hex("#BE7524")
local W6 = hex("#D38B27")
local PA0 = hex("#B39A70")
local PA3 = hex("#F4EEDC")
local NIGHT = hex("#0E1913")
local CHANNEL_NAMES = { "R", "G", "B" }
local DARK = {
	color = INK,
}
local LABEL = {
	color = W2,
}
local SOFT = {
	color = W3,
}
local FAINT = {
	color = PA0,
}
--* O tamanho do desenho de cada ícone (a folha guarda todos num quadro de 16). 
local ICONS = {
	iconDice = Vector2.new(12, 13),
	iconUndo = Vector2.new(13, 12),
	iconRedo = Vector2.new(13, 12),
	iconRotateLeft = Vector2.new(15, 15),
	iconRotateRight = Vector2.new(15, 15),
	iconStar = Vector2.new(13, 13),
	iconChest = Vector2.new(14, 12),
	iconPlus = Vector2.new(6, 6),
	iconBack = Vector2.new(10, 9),
	iconNext = Vector2.new(10, 9),
	iconDropdown = Vector2.new(9, 6),
	iconGender = Vector2.new(13, 11),
	iconHead = Vector2.new(12, 12),
	iconBody = Vector2.new(11, 14),
	iconHair = Vector2.new(12, 9),
	iconFace = Vector2.new(12, 11),
	iconOutfit = Vector2.new(12, 10),
}
-- Medidas da prancha, em pixels de arte.
local LEFT = {
	x = 6,
	y = 8,
	w = 140,
	h = 256,
}
local STAGE = {
	x = 14,
	y = 20,
	w = 124,
	h = 166,
}
--* O palco: um pedaço do mundo de 38×52, ampliado 3 vezes dentro da moldura (5 pixels para dentro). 
local SCENE = {
	x = 19,
	y = 25,
	w = 38,
	h = 52,
	zoom = 3,
}
local RIGHT = {
	x = 152,
	y = 25,
	w = 322,
	h = 239,
}
--* Abas: a ativa (31 de altura) começa em y 3 e desce pela moldura; a inativa (18) em y 7. 
local TAB = {
	top = 7,
	activeTop = 3,
	height = 18,
	activeHeight = 31,
	gap = 2,
	middle = 16,
}
--* O miolo útil do painel da direita. 
local IX0 = 161
local IX1 = 464
local TOOL_Y = 36
--[[
	*
	 * O seletor de estilo (Aeko | Original) das abas Cabeça e Corpo, em cima da grade (pedido do usuário em
	 * 2026-10-18): a grade desce e perde essa altura.
	 
]]
local STYLE_ROW = {
	y = 59,
	h = 19,
}
local GRID_Y = STYLE_ROW.y + STYLE_ROW.h + 2
local GRID_LOOK = {
	well = {
		x = IX0,
		y = GRID_Y,
		w = 284,
		h = 191 - GRID_Y,
	},
	origin = Vector2.new(4, 4),
	inset = 1,
	track = {
		x = 449,
		y = GRID_Y,
		w = 10,
		h = 191 - GRID_Y,
	},
	thumbPad = 3,
	star = Vector2.new(28, -2),
	emptyInk = SOFT,
}
local ARTIST = {
	x = IX0,
	y = TOOL_Y,
	w = 112,
	h = 20,
}
--* A faixa de cor embaixo da grade. 
local STRIP = {
	x = IX0,
	y = 195,
	w = IX1 - IX0 + 1,
	h = 36,
}
local STRIP_ROW = function(channel)
	return STRIP.y + 2 + channel * 11
end
local STRIP_SWATCH = {
	x = STRIP.x + 186,
	y = STRIP.y + 15,
	size = 16,
	step = 19,
	count = 6,
}
--* O editor das abas de cor: um poço do tamanho da grade e da faixa juntas. 
local EDITOR = {
	x = IX0,
	y = 59,
	w = IX1 - IX0 + 1,
	h = 172,
}
local EDITOR_ROW = function(channel)
	return EDITOR.y + 22 + channel * 15
end
local EDITOR_SWATCH = {
	x = EDITOR.x + 10,
	y = EDITOR.y + 93,
	size = 16,
	step = 19,
	count = 12,
}
local GENDER_AREA = {
	x = IX0,
	y = 67,
	w = IX1 - IX0 + 1,
	h = 132,
}
local GENDER_CARD = {
	w = 112,
	h = 132,
	gap = 24,
}
local FOOT_Y = 234
--* A cerca do palco (como no script): duas tábuas, quatro postes, o contorno e a sombra no chão. 
local function fenceRects()
	local top = 22
	local shadow = { { 0, top + 13, SCENE.w, 1, NIGHT, 90 / 255 }, { 0, top + 14, SCENE.w, 1, NIGHT, 50 / 255 } }
	local outline = {}
	local rails = {}
	local posts = {}
	local caps = {}
	for _, y in { top + 3, top + 8 } do
		local _arg0 = { 0, y - 1, SCENE.w, 1, W1 }
		local _arg1 = { 0, y, SCENE.w, 1, W6 }
		local _arg2 = { 0, y + 1, SCENE.w, 1, W4 }
		local _arg3 = { 0, y + 2, SCENE.w, 1, W1 }
		-- ▼ Array.push ▼
		table.insert(rails, _arg0)
		table.insert(rails, _arg1)
		table.insert(rails, _arg2)
		table.insert(rails, _arg3)
		-- ▲ Array.push ▲
	end
	for _, x in { -1, 11, 23, 35 } do
		local _arg0 = { x - 1, top, 5, 13, W1 }
		local _arg1 = { x, top - 1, 3, 15, W1 }
		-- ▼ Array.push ▼
		table.insert(outline, _arg0)
		table.insert(outline, _arg1)
		-- ▲ Array.push ▲
		local _arg0_1 = { x, top, 1, 13, W6 }
		local _arg1_1 = { x + 1, top, 1, 13, W5 }
		local _arg2 = { x + 2, top, 1, 13, W3 }
		-- ▼ Array.push ▼
		table.insert(posts, _arg0_1)
		table.insert(posts, _arg1_1)
		table.insert(posts, _arg2)
		-- ▲ Array.push ▲
		local _arg0_2 = { x, top, 1, 1, W5 }
		local _arg1_2 = { x + 2, top, 1, 1, W4 }
		-- ▼ Array.push ▼
		table.insert(caps, _arg0_2)
		table.insert(caps, _arg1_2)
		-- ▲ Array.push ▲
	end
	return {
		shadow = shadow,
		outline = outline,
		rails = rails,
		posts = posts,
		caps = caps,
	}
end
--* A sombra do boneco no chão: a elipse do script, linha a linha. 
local DOLL_SHADOW = { { 12, 47, 14, 1, NIGHT, 110 / 255 }, { 8, 48, 22, 1, NIGHT, 110 / 255 }, { 7, 49, 24, 1, NIGHT, 110 / 255 }, { 8, 50, 22, 1, NIGHT, 110 / 255 }, { 12, 51, 14, 1, NIGHT, 110 / 255 } }
--* A disposição do Celeiro. 
local function CeleiroLayout(_param)
	local ctx = _param.ctx
	local _binding = ctx
	local k = _binding.k
	local P = makeParts(ctx, ICONS)
	local _binding_1 = P
	local at = _binding_1.at
	local label = _binding_1.label
	-- ---------- palco: o mundo de 38×52 com a cerca, flores e o boneco andando no lugar
	local previewLayers = derive(function()
		return figureLayers(ctx.look())
	end)
	local fence = fenceRects()
	local atlasBit = function(rx, ry, w, h, x, y, zIndex)
		return Vide.jsx("imagelabel", {
			BackgroundTransparency = 1,
			Image = Sprites.daisy.image,
			ImageRectOffset = Vector2.new(rx, ry),
			ImageRectSize = Vector2.new(w, h),
			ResampleMode = "Pixelated",
			Position = at(x * SCENE.zoom, y * SCENE.zoom),
			Size = px(k, w * SCENE.zoom, h * SCENE.zoom),
			ZIndex = zIndex,
		})
	end
	local stage = (Vide.jsx("frame", {
		Name = "Stage",
		BackgroundTransparency = 1,
		ClipsDescendants = true,
		Position = at(SCENE.x, SCENE.y),
		Size = px(k, SCENE.w * SCENE.zoom, SCENE.h * SCENE.zoom),
		ZIndex = 3,
	}, Vide.jsx("imagelabel", {
		BackgroundTransparency = 1,
		Image = GRASS_TILE.image,
		ImageRectOffset = Vector2.new(300, 150),
		ImageRectSize = Vector2.new(SCENE.w, SCENE.h),
		ResampleMode = "Pixelated",
		Size = UDim2.fromScale(1, 1),
		ZIndex = 1,
	}), P.rects(fence.shadow, SCENE.zoom, 2), P.rects(fence.outline, SCENE.zoom, 3), P.rects(fence.rails, SCENE.zoom, 4), P.rects(fence.posts, SCENE.zoom, 5), P.rects(fence.caps, SCENE.zoom, 6), atlasBit(375, 311, 19, 13, 23, 41, 7), atlasBit(273, 311, 15, 13, -3, 37, 7), atlasBit(273, 311, 15, 13, 28, 5, 7), atlasBit(375, 311, 19, 13, -6, 6, 7), P.rects(DOLL_SHADOW, SCENE.zoom, 8), Vide.jsx("frame", {
		BackgroundTransparency = 1,
		Position = at(-5 * SCENE.zoom, 2 * SCENE.zoom),
		Size = px(k, 48 * SCENE.zoom, 48 * SCENE.zoom),
		ZIndex = 9,
	}, P.figure(previewLayers, MAX_FIGURE_LAYERS, SCENE.zoom, 9, function(layer)
		return layerRect(layer, 1, ctx.walkFrame(), TURN_ORDER[ctx.turn() + 1], ctx.closed())
	end, 0, function(layer)
		return layerPosition(layer, 1, ctx.walkFrame(), TURN_ORDER[ctx.turn() + 1])
	end))))
	-- ---------- painel da esquerda
	local title = function()
		return t("customize.titleCaps")
	end
	local titleW = function()
		return textWidth(title(), true) + 20
	end
	local titleX = function()
		return LEFT.x + math.floor((LEFT.w - titleW()) / 2)
	end
	local randomW = function()
		return 5 + 12 + 4 + textWidth(t("customize.random")) + 6
	end
	local savedText = function()
		return `{P.savedCount()}/{SAVED_LOOKS}`
	end
	local _attributes = table.clone(themed("panel", k))
	setmetatable(_attributes, nil)
	_attributes.Position = at(LEFT.x, LEFT.y)
	_attributes.Size = px(k, LEFT.w, LEFT.h)
	_attributes.ZIndex = 2
	local _exp = Vide.jsx("imagelabel", _attributes)
	local _attributes_1 = table.clone(themed("titleBar", k))
	setmetatable(_attributes_1, nil)
	_attributes_1.Position = function()
		return UDim2.fromOffset(titleX() * k(), 0)
	end
	_attributes_1.Size = function()
		return UDim2.fromOffset(titleW() * k(), 18 * k())
	end
	_attributes_1.ZIndex = 5
	local _exp_1 = Vide.jsx("imagelabel", _attributes_1, label(title, 10, 5, DARK, {
		bold = true,
		zIndex = 2,
	}))
	local _attributes_2 = table.clone(themed("stage", k))
	setmetatable(_attributes_2, nil)
	_attributes_2.Position = at(STAGE.x, STAGE.y)
	_attributes_2.Size = px(k, STAGE.w, STAGE.h)
	_attributes_2.ZIndex = 4
	local _exp_2 = Vide.jsx("imagelabel", _attributes_2)
	local _exp_3 = P.button({
		kind = "icon",
		box = {
			x = LEFT.x + 1,
			y = 150,
			w = 22,
			h = 22,
		},
		icon = function()
			return "iconRotateLeft"
		end,
		onPress = function()
			return ctx.rotate(-1)
		end,
		tip = function()
			return t("customize.rotate")
		end,
		zIndex = 5,
	})
	local _exp_4 = P.button({
		kind = "icon",
		box = {
			x = LEFT.x + LEFT.w - 23,
			y = 150,
			w = 22,
			h = 22,
		},
		icon = function()
			return "iconRotateRight"
		end,
		onPress = function()
			return ctx.rotate(1)
		end,
		tip = function()
			return t("customize.rotate")
		end,
		zIndex = 5,
	})
	local _exp_5 = P.button({
		kind = "secondary",
		box = function()
			return {
				x = LEFT.x + 8,
				y = 189,
				w = randomW(),
				h = 20,
			}
		end,
		icon = function()
			return "iconDice"
		end,
		text = function()
			return t("customize.random")
		end,
		gap = 4,
		onPress = ctx.randomize,
		tip = function()
			return t("customize.randomHelp")
		end,
		zIndex = 4,
	})
	local _exp_6 = P.button({
		kind = "icon",
		box = {
			x = LEFT.x + LEFT.w - 8 - 24 - 27,
			y = 189,
			w = 24,
			h = 20,
		},
		icon = function()
			return "iconUndo"
		end,
		onPress = ctx.undo,
		tip = function()
			return t("customize.undo")
		end,
		zIndex = 4,
	})
	local _exp_7 = P.button({
		kind = "icon",
		box = {
			x = LEFT.x + LEFT.w - 8 - 24,
			y = 189,
			w = 24,
			h = 20,
		},
		icon = function()
			return "iconRedo"
		end,
		onPress = ctx.redo,
		tip = function()
			return t("customize.redo")
		end,
		zIndex = 4,
	})
	local _exp_8 = P.iconSeen("iconChest", LEFT.x + 8, 212, 4)
	local _exp_9 = label(function()
		return t("customize.saved")
	end, LEFT.x + 8 + 14 + 4, 215, LABEL, {
		zIndex = 4,
	})
	local _exp_10 = label(savedText, function()
		return LEFT.x + LEFT.w - 9 - textWidth(savedText())
	end, 215, FAINT, {
		zIndex = 4,
	})
	local _exp_11 = range(SAVED_LOOKS)
	-- ▼ ReadonlyArray.map ▼
	local _newValue = table.create(#_exp_11)
	local _callback = function(slot)
		return P.savedSlot(slot, {
			x = LEFT.x + 8 + slot * 31,
			y = 226,
			w = 28,
			h = 27,
		}, {
			empty = "cell",
			clip = {
				x = 1,
				y = 1,
				w = 26,
				h = 24,
			},
			figureAt = Vector2.new(-11, -8),
			plusAt = Vector2.new(6, 5),
		}, 4)
	end
	for _k, _v in _exp_11 do
		_newValue[_k] = _callback(_v, _k - 1, _exp_11)
	end
	-- ▲ ReadonlyArray.map ▲
	local left = { _exp, _exp_1, stage, _exp_2, _exp_3, _exp_4, _exp_5, _exp_6, _exp_7, _exp_8, _exp_9, _exp_10, _newValue }
	-- ---------- abas centradas, cada uma do tamanho do ícone e do nome
	local tabW = function(index)
		local item = TABS_LIST[index + 1]
		return 4 + (ICONS[item.icon] or Vector2.new(16, 16)).X + 3 + textWidth(t(item.title)) + 5
	end
	local tabXs = derive(function()
		local total = 0
		for _, index in range(#TABS_LIST) do
			total += tabW(index) + (if index > 0 then TAB.gap else 0)
		end
		local xs = {}
		local x = RIGHT.x + math.floor((RIGHT.w - total) / 2)
		for _, index in range(#TABS_LIST) do
			local _x = x
			table.insert(xs, _x)
			x += tabW(index) + TAB.gap
		end
		return xs
	end)
	local tabButton = function(index)
		local item = TABS_LIST[index + 1]
		local active = function()
			return ctx.tab() == index
		end
		local top = function()
			return if active() then TAB.activeTop else TAB.top
		end
		local seen = ICONS[item.icon] or Vector2.new(16, 16)
		local _attributes_3 = table.clone(themed(function()
			return if active() then "tabActive" else "tab"
		end, k))
		setmetatable(_attributes_3, nil)
		_attributes_3.AutoButtonColor = false
		_attributes_3.Position = function()
			return UDim2.fromOffset(tabXs()[index + 1] * k(), top() * k())
		end
		_attributes_3.Size = function()
			return UDim2.fromOffset(tabW(index) * k(), (if active() then TAB.activeHeight else TAB.height) * k())
		end
		_attributes_3.ZIndex = function()
			return if active() then 3 else 1
		end
		_attributes_3.Activated = function()
			return ctx.openTab(index)
		end
		return Vide.jsx("imagebutton", _attributes_3, P.iconSeen(item.icon, 4, function()
			return TAB.middle - math.floor(seen.Y / 2) - top()
		end, 2), label(function()
			return t(item.title)
		end, 4 + seen.X + 3, function()
			return TAB.middle - 3 - top()
		end, function()
			return if active() then DARK else {
				color = PA3,
				shadow = W2,
			}
		end, {
			zIndex = 3,
		}))
	end
	-- ---------- barra de cima: artista, crédito e favoritos (grades) ou as partes (abas de cor)
	local currentGrid = function()
		return ctx.gridOf(ctx.tab())
	end
	local authorText = function()
		local grid = currentGrid()
		local name = if grid then P.authorName(grid) else ""
		return if name == "" then t("customize.allArtists") else name
	end
	local changeAuthor = function(step)
		local grid = currentGrid()
		if not grid then
			return nil
		end
		ctx.part(0)
		ctx.nextAuthor(grid, step)
	end
	local favoritesW = function()
		return 5 + 13 + 3 + textWidth(t("customize.favorites")) + 6
	end
	local favoritesX = function()
		return IX1 - favoritesW() + 1
	end
	local credit = function()
		return P.infoCredit(" · ")
	end
	local pickW = function(index)
		return 6 + textWidth(ctx.pickName(index)) + 6
	end
	local pickX = function(index)
		local x = IX0
		do
			local before = 0
			local _shouldIncrement = false
			while true do
				if _shouldIncrement then
					before += 1
				else
					_shouldIncrement = true
				end
				if not (before < index) then
					break
				end
				x += pickW(before) + 4
			end
		end
		return x
	end
	local _exp_12 = Vide.jsx("frame", {
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Visible = function()
			return currentGrid() ~= nil
		end,
		ZIndex = 4,
	}, P.button({
		kind = "secondary",
		box = ARTIST,
		icon = function()
			return "iconDropdown"
		end,
		text = authorText,
		textX = 6,
		iconX = ARTIST.w - 15,
		onPress = function()
			return changeAuthor(1)
		end,
		onSecondary = function()
			return changeAuthor(-1)
		end,
		tip = function()
			return t("customize.artistHelp")
		end,
		zIndex = 1,
	}), label(credit, function()
		return ARTIST.x + ARTIST.w + math.floor((favoritesX() - ARTIST.x - ARTIST.w - textWidth(credit())) / 2)
	end, TOOL_Y + 6, SOFT, {
		maxChars = 40,
		zIndex = 1,
	}), P.button({
		kind = "secondary",
		box = function()
			return {
				x = favoritesX(),
				y = TOOL_Y,
				w = favoritesW(),
				h = 20,
			}
		end,
		icon = function()
			return "iconStar"
		end,
		text = function()
			return t("customize.favorites")
		end,
		iconDy = -1,
		iconFade = function()
			return if ctx.favoritesOnly() then 0 else 0.55
		end,
		chosen = ctx.favoritesOnly,
		onPress = ctx.toggleFavoritesOnly,
		tip = function()
			return t("customize.favoritesHelp")
		end,
		zIndex = 1,
	}))
	local _exp_13 = range(#CLOTH_KEYS)
	-- ▼ ReadonlyArray.map ▼
	local _newValue_1 = table.create(#_exp_13)
	local _callback_1 = function(index)
		return P.button({
			kind = "secondary",
			box = function()
				return {
					x = pickX(index),
					y = TOOL_Y,
					w = pickW(index),
					h = 20,
				}
			end,
			text = function()
				return ctx.pickName(index)
			end,
			chosen = function()
				return ctx.pickValue() == index
			end,
			visible = function()
				return ctx.tab() >= 3 and index < ctx.pickCount()
			end,
			onPress = function()
				ctx.part(2)
				ctx.cursor(index)
				ctx.setPick(index)
			end,
			zIndex = 4,
		})
	end
	for _k, _v in _exp_13 do
		_newValue_1[_k] = _callback_1(_v, _k - 1, _exp_13)
	end
	-- ▲ ReadonlyArray.map ▲
	local toolbar = { _exp_12, _newValue_1 }
	-- ---------- faixa de cor das grades: cabelo na aba Cabeça, a parte da roupa na aba Corpo
	local hexPlain = P.hexText(false)
	local originalW = function()
		return textWidth(t("customize.originalShort"))
	end
	local _attributes_3 = table.clone(themed("well", k))
	setmetatable(_attributes_3, nil)
	_attributes_3.Position = at(STRIP.x, STRIP.y)
	_attributes_3.Size = px(k, STRIP.w, STRIP.h)
	_attributes_3.ZIndex = 1
	local _exp_14 = Vide.jsx("imagelabel", _attributes_3)
	local _exp_15 = label(function()
		return t(ctx.colorTitle())
	end, STRIP.x + 6, STRIP.y + 4, LABEL, {
		zIndex = 2,
	})
	local _exp_16 = P.swatch({
		x = STRIP.x + 6,
		y = STRIP.y + 13,
		w = 22,
		h = 22,
	}, 3, 2)
	local _exp_17 = label(hexPlain, STRIP.x + 32, STRIP.y + 21, SOFT, {
		zIndex = 2,
	})
	local _exp_18 = range(3)
	-- ▼ ReadonlyArray.map ▼
	local _newValue_2 = table.create(#_exp_18)
	local _callback_2 = function(channel)
		local y = STRIP_ROW(channel)
		local _array = { label(function()
			return CHANNEL_NAMES[channel + 1]
		end, STRIP.x + 76, y + 2, LABEL, {
			maxChars = 2,
			zIndex = 2,
		}) }
		local _length = #_array
		local _array_1 = P.channelTrack(channel, {
			x = STRIP.x + 84,
			y = y + 2,
			w = 76,
			h = 7,
		}, 3, 1)
		local _Length = #_array_1
		table.move(_array_1, 1, _Length, _length + 1, _array)
		_length += _Length
		_array[_length + 1] = label(P.channelValue(channel), STRIP.x + 164, y + 2, LABEL, {
			maxChars = 4,
			zIndex = 2,
		})
		return _array
	end
	for _k, _v in _exp_18 do
		_newValue_2[_k] = _callback_2(_v, _k - 1, _exp_18)
	end
	-- ▲ ReadonlyArray.map ▲
	local _exp_19 = label(function()
		return t("customize.presets")
	end, STRIP.x + 184, STRIP.y + 4, LABEL, {
		zIndex = 2,
	})
	local _exp_20 = label(function()
		return t("customize.originalShort")
	end, function()
		return STRIP.x + STRIP.w - 7 - originalW()
	end, STRIP.y + 4, SOFT, {
		zIndex = 2,
	})
	local _exp_21 = P.icon("originalMark", function()
		return STRIP.x + STRIP.w - 7 - originalW() - 8
	end, STRIP.y + 4, 2)
	local _exp_22 = range(STRIP_SWATCH.count)
	-- ▼ ReadonlyArray.map ▼
	local _newValue_3 = table.create(#_exp_22)
	local _callback_3 = function(index)
		return P.preset(index, STRIP_SWATCH.x + index * STRIP_SWATCH.step, STRIP_SWATCH.y, STRIP_SWATCH.size, 3, {
			chosenOutset = 2,
			mark = Vector2.new(10, 0),
		})
	end
	for _k, _v in _exp_22 do
		_newValue_3[_k] = _callback_3(_v, _k - 1, _exp_22)
	end
	-- ▲ ReadonlyArray.map ▲
	local strip = (Vide.jsx("frame", {
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Visible = function()
			return currentGrid() ~= nil
		end,
		ZIndex = 4,
	}, _exp_14, Vide.jsx("frame", {
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Visible = ctx.paintable,
		ZIndex = 2,
	}, _exp_15, _exp_16, _exp_17, _newValue_2, _exp_19, _exp_20, _exp_21, _newValue_3), label(function()
		return t("customize.nothingToPaint")
	end, STRIP.x + 6, STRIP.y + 15, SOFT, {
		maxChars = 64,
		zIndex = 2,
		visible = function()
			return not ctx.paintable()
		end,
	})))
	-- ---------- editor das abas Cabelo, Rosto e Roupa
	local restoreW = function()
		return 5 + 15 + 3 + textWidth(t("customize.restore")) + 6
	end
	local _attributes_4 = table.clone(themed("well", k))
	setmetatable(_attributes_4, nil)
	_attributes_4.Position = at(EDITOR.x, EDITOR.y)
	_attributes_4.Size = px(k, EDITOR.w, EDITOR.h)
	_attributes_4.ZIndex = 1
	local _exp_23 = Vide.jsx("imagelabel", _attributes_4)
	local _exp_24 = label(credit, function()
		return EDITOR.x + EDITOR.w - 8 - textWidth(credit())
	end, EDITOR.y + 8, SOFT, {
		maxChars = 40,
		zIndex = 2,
	})
	local _exp_25 = label(function()
		return t(ctx.colorTitle())
	end, EDITOR.x + 8, EDITOR.y + 8, LABEL, {
		zIndex = 2,
	})
	local _exp_26 = P.swatch({
		x = EDITOR.x + 8,
		y = EDITOR.y + 21,
		w = 44,
		h = 44,
	}, 3, 2)
	local _exp_27 = label(hexPlain, function()
		return EDITOR.x + 30 - math.floor(textWidth(hexPlain()) / 2)
	end, EDITOR.y + 70, SOFT, {
		zIndex = 2,
	})
	local _exp_28 = range(3)
	-- ▼ ReadonlyArray.map ▼
	local _newValue_4 = table.create(#_exp_28)
	local _callback_4 = function(channel)
		local y = EDITOR_ROW(channel)
		local _array = { label(function()
			return CHANNEL_NAMES[channel + 1]
		end, EDITOR.x + 64, y + 2, LABEL, {
			maxChars = 2,
			zIndex = 2,
		}) }
		local _length = #_array
		local _array_1 = P.channelTrack(channel, {
			x = EDITOR.x + 74,
			y = y + 2,
			w = 180,
			h = 7,
		}, 3, 1)
		local _Length = #_array_1
		table.move(_array_1, 1, _Length, _length + 1, _array)
		_length += _Length
		_array[_length + 1] = label(P.channelValue(channel), EDITOR.x + 258, y + 2, LABEL, {
			maxChars = 4,
			zIndex = 2,
		})
		return _array
	end
	for _k, _v in _exp_28 do
		_newValue_4[_k] = _callback_4(_v, _k - 1, _exp_28)
	end
	-- ▲ ReadonlyArray.map ▲
	local _exp_29 = label(function()
		return t("customize.presetsLong")
	end, EDITOR.x + 8, EDITOR.y + 81, LABEL, {
		zIndex = 2,
	})
	local _exp_30 = range(EDITOR_SWATCH.count)
	-- ▼ ReadonlyArray.map ▼
	local _newValue_5 = table.create(#_exp_30)
	local _callback_5 = function(index)
		return P.preset(index, EDITOR_SWATCH.x + index * EDITOR_SWATCH.step, EDITOR_SWATCH.y, EDITOR_SWATCH.size, 3, {
			chosenOutset = 2,
			mark = Vector2.new(10, 0),
		})
	end
	for _k, _v in _exp_30 do
		_newValue_5[_k] = _callback_5(_v, _k - 1, _exp_30)
	end
	-- ▲ ReadonlyArray.map ▲
	local editor = (Vide.jsx("frame", {
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Visible = function()
			return ctx.tab() >= 3
		end,
		ZIndex = 4,
	}, _exp_23, _exp_24, Vide.jsx("frame", {
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Visible = ctx.paintable,
		ZIndex = 2,
	}, _exp_25, _exp_26, _exp_27, _newValue_4, _exp_29, _newValue_5, P.icon("originalMark", EDITOR.x + 8, EDITOR.y + 122, 2), label(function()
		return t("customize.originalLegend")
	end, EDITOR.x + 16, EDITOR.y + 121, SOFT, {
		zIndex = 2,
	}), label(function()
		return t("customize.colorHint")
	end, EDITOR.x + 8, EDITOR.y + 150, SOFT, {
		maxChars = 48,
		zIndex = 2,
	}), P.button({
		kind = "secondary",
		box = function()
			return {
				x = EDITOR.x + EDITOR.w - 8 - restoreW(),
				y = EDITOR.y + 144,
				w = restoreW(),
				h = 20,
			}
		end,
		icon = function()
			return "iconRotateLeft"
		end,
		text = function()
			return t("customize.restore")
		end,
		onPress = ctx.restore,
		zIndex = 3,
	})), label(function()
		return t("customize.nothingToPaint")
	end, EDITOR.x + 8, EDITOR.y + 21, SOFT, {
		width = EDITOR.w - 16,
		wrap = true,
		maxChars = 64,
		zIndex = 2,
		visible = function()
			return not ctx.paintable()
		end,
	})))
	-- ---------- rodapé: a etiqueta e o campo do nome, Voltar e Continuar
	local tagW = function()
		return 9 + textWidth(t("customize.name")) + 5
	end
	local continueW = function()
		return 7 + textWidth(t("common.continue")) + 3 + 10 + 5
	end
	local backW = function()
		return 5 + 10 + 3 + textWidth(t("common.back")) + 7
	end
	local continueX = function()
		return IX1 - continueW() + 1
	end
	local _attributes_5 = table.clone(themed("nameTag", k))
	setmetatable(_attributes_5, nil)
	_attributes_5.Position = at(IX0, FOOT_Y + 3)
	_attributes_5.Size = function()
		return UDim2.fromOffset(tagW() * k(), 13 * k())
	end
	_attributes_5.ZIndex = 4
	local footer = { Vide.jsx("imagelabel", _attributes_5, label(function()
		return t("customize.name")
	end, 9, 3, DARK, {
		zIndex = 2,
	})), P.nameField(function()
		return {
			x = IX0 + tagW() + 3,
			y = FOOT_Y,
			w = 116,
			h = 19,
		}
	end, {
		ink = DARK,
		placeholder = FAINT,
		padX = 6,
		textY = 6,
		caretGap = 2,
		caretY = 5,
	}, 4), P.button({
		kind = "secondary",
		box = function()
			return {
				x = continueX() - 5 - backW(),
				y = FOOT_Y,
				w = backW(),
				h = 20,
			}
		end,
		icon = function()
			return "iconBack"
		end,
		text = function()
			return t("common.back")
		end,
		contentX = 5,
		onPress = function()
			return ctx.onDone(false)
		end,
		zIndex = 4,
	}), P.button({
		kind = "primary",
		box = function()
			return {
				x = continueX(),
				y = FOOT_Y,
				w = continueW(),
				h = 20,
			}
		end,
		icon = function()
			return "iconNext"
		end,
		iconRight = true,
		text = function()
			return t("common.continue")
		end,
		contentX = 7,
		onPress = function()
			return ctx.onDone(true)
		end,
		zIndex = 4,
	}) }
	--* Onde está o foco do teclado. 
	local focus = function()
		local tab = ctx.tab()
		local part = ctx.part()
		if tab == 0 then
			return P.genderFocus(GENDER_AREA, GENDER_CARD)
		end
		if part == 0 then
			return ARTIST
		end
		if part == 1 then
			return if tab <= 2 then P.gridFocus(tab, GRID_LOOK) else nil
		end
		if part == 2 then
			return {
				x = pickX(ctx.cursor()),
				y = TOOL_Y,
				w = pickW(ctx.cursor()),
				h = 20,
			}
		end
		if not ctx.paintable() then
			return nil
		end
		local onStrip = tab <= 2
		if part == 6 then
			local swatches = if onStrip then STRIP_SWATCH else EDITOR_SWATCH
			return {
				x = swatches.x + ctx.cursor() * swatches.step,
				y = swatches.y,
				w = swatches.size,
				h = swatches.size,
			}
		end
		local channel = part - 3
		return if onStrip then {
			x = STRIP.x + 74,
			y = STRIP_ROW(channel),
			w = 108,
			h = 11,
		} else {
			x = EDITOR.x + 60,
			y = EDITOR_ROW(channel) - 1,
			w = 220,
			h = 13,
		}
	end
	local _exp_31 = left
	local _exp_32 = range(#TABS_LIST)
	-- ▼ ReadonlyArray.map ▼
	local _newValue_6 = table.create(#_exp_32)
	for _k, _v in _exp_32 do
		_newValue_6[_k] = tabButton(_v, _k - 1, _exp_32)
	end
	-- ▲ ReadonlyArray.map ▲
	local _attributes_6 = table.clone(themed("panel", k))
	setmetatable(_attributes_6, nil)
	_attributes_6.Position = at(RIGHT.x, RIGHT.y)
	_attributes_6.Size = px(k, RIGHT.w, RIGHT.h)
	_attributes_6.ZIndex = 2
	local root = (Vide.jsx("frame", {
		Name = "Barn",
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		ZIndex = 2,
	}, _exp_31, _newValue_6, Vide.jsx("imagelabel", _attributes_6), toolbar, Vide.jsx("frame", {
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Visible = function()
			return ctx.tab() == 0
		end,
		ZIndex = 4,
	}, P.genderCards(GENDER_AREA, GENDER_CARD, DARK, 1)), Vide.jsx("frame", {
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Visible = function()
			return ctx.tab() == 1
		end,
		ZIndex = 4,
	}, P.styleSwitch(1, IX0, STYLE_ROW.y, STYLE_ROW.h, {
		labelInk = LABEL,
		zIndex = 1,
	}), P.grid(1, GRID_LOOK, 1)), Vide.jsx("frame", {
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Visible = function()
			return ctx.tab() == 2
		end,
		ZIndex = 4,
	}, P.styleSwitch(2, IX0, STYLE_ROW.y, STYLE_ROW.h, {
		labelInk = LABEL,
		zIndex = 1,
	}), P.grid(2, GRID_LOOK, 1)), strip, editor, footer, P.cursorFrame(focus, 8)))
	-- Nas grades, a faixa mostra a original e 5 cores prontas; no editor, 12.
	ctx.useLayout({
		colorStrip = true,
		swatchLimit = function()
			return if ctx.tab() <= 2 then STRIP_SWATCH.count else EDITOR_SWATCH.count
		end,
	})
	-- O Show só tira a disposição do lugar quando o tema muda; destrói no fim do quadro (ver CLAUDE.md).
	cleanup(function()
		return task.defer(function()
			return root:Destroy()
		end)
	end)
	return root
end
return {
	CeleiroLayout = CeleiroLayout,
}
