-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
-- A tela de personalizar no Clássico (tema graal), igual à prancha B (Aseprite/ui_propostas/B_graal,
-- tela_personalizar_B.png e tela_personalizar_B_cor.png, desenhadas por draw_ui_B.lua): à esquerda,
-- a janela do personagem (a placa do título, o palco com a cerca, o nome e os visuais salvos); à
-- direita, a janela com as abas em cima, a barra de ferramentas (favoritos e artista, ou as partes
-- da aba de cor, e o dado, desfazer e refazer), a grade ou o cartão de cor, a linha de informação, as
-- teclas e Voltar e Continuar. Medidas e cores tiradas do script.
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
local _i18n = TS.import(script, script.Parent.Parent, "i18n")
local keyName = _i18n.keyName
local t = _i18n.t
local px = TS.import(script, script.Parent.Parent, "kit").px
local textWidth = TS.import(script, script.Parent.Parent, "pixelText").textWidth
local _theme = TS.import(script, script.Parent.Parent, "theme")
local metric = _theme.metric
local themed = _theme.themed
local makeParts = TS.import(script, script.Parent, "parts").makeParts
local _state = TS.import(script, script.Parent, "state")
local range = _state.range
local TABS_LIST = _state.TABS_LIST
-- Paleta Ponte, como no script.
local hex = function(value)
	return Color3.fromHex(value)
end
local INK = hex("#0A0F0C")
local N0 = hex("#0E1913")
local C0 = hex("#8F93A0")
local C1 = hex("#C9CBD4")
local C2 = hex("#F4EEDC")
--* mix(C2, branco, 0,6): o texto dos botões de pervinca. 
local C3 = Color3.fromRGB(251, 248, 241)
local O4 = hex("#FFDD7C")
local V0 = hex("#211E45")
local V1 = hex("#34357A")
local V2 = hex("#5A62B4")
local M1 = hex("#1E4D36")
--* mix(F2, C2, 0,55): a sombra do texto dos botões verdes. 
local F3 = Color3.fromRGB(199, 229, 177)
local PLACEHOLDER = hex("#696A80")
local CHANNEL_INK = { Color3.fromRGB(226, 84, 72), hex("#8FDB7C"), hex("#B6BBF2") }
local CHANNEL_NAMES = { "R", "G", "B" }
--* A madeira do mundo (P.R.wood do hv_paint.lua), do escuro ao claro. 
local WOOD = { hex("#3A2024"), hex("#5E3428"), hex("#865032"), hex("#AE7444"), hex("#D29C5E"), hex("#EEC488") }
local TEXT = {
	color = C2,
	shadow = INK,
}
local LIGHT = {
	color = C1,
	shadow = INK,
}
local SOFT = {
	color = C0,
	shadow = INK,
}
--* Texto dos botões: creme com sombra violeta nos de pervinca, tinta com sombra clara nos verdes. 
local buttonInk = function(main)
	return if main then {
		color = INK,
		shadow = F3,
	} else {
		color = C3,
		shadow = V0,
	}
end
--* O tamanho do desenho de cada ícone (a folha guarda todos num quadro de 16). 
local ICONS = {
	iconDice = Vector2.new(14, 14),
	iconUndo = Vector2.new(14, 14),
	iconRedo = Vector2.new(14, 14),
	iconRotateLeft = Vector2.new(14, 15),
	iconRotateRight = Vector2.new(14, 15),
	iconStar = Vector2.new(14, 13),
	iconChest = Vector2.new(16, 13),
	iconPlus = Vector2.new(13, 13),
	iconBack = Vector2.new(14, 14),
	iconNext = Vector2.new(14, 14),
	iconDropdown = Vector2.new(12, 7),
	iconGender = Vector2.new(16, 14),
	iconHead = Vector2.new(14, 14),
	iconBody = Vector2.new(14, 14),
	iconHair = Vector2.new(14, 14),
	iconFace = Vector2.new(14, 14),
	iconOutfit = Vector2.new(14, 13),
}
-- Medidas da prancha, em pixels de arte.
local LEFT = {
	x = 4,
	y = 9,
	w = 146,
	h = 254,
}
local STAGE = {
	x = 12,
	y = 19,
	w = 130,
	h = 154,
}
--* O palco: um pedaço do mundo de 42×50, ampliado 3 vezes dentro do poço. 
local SCENE = {
	x = 14,
	y = 21,
	w = 42,
	h = 50,
	zoom = 3,
}
local RIGHT = {
	x = 155,
	y = 34,
	w = 321,
	h = 229,
}
--* Abas: a inativa começa em y 5; a ativa sobe a 2 e entra 5 no painel. 
local TAB = {
	x = 165,
	step = 50,
	w = 48,
	top = 5,
	activeTop = 2,
}
--* O miolo da janela da direita. 
local IX = 163
local IY = 42
local IR = 467
--* A área da grade e do cartão de cor. 
local AREA = {
	x = IX,
	y = 67,
	w = IR - IX + 1,
	h = 148,
}
--[[
	*
	 * O seletor de estilo (Aeko | Original) das abas Cabeça e Corpo, no alto da área, em cima da grade (pedido
	 * do usuário em 2026-10-18): a grade fica com o resto.
	 
]]
local STYLE_ROW = {
	y = AREA.y,
	h = 20,
}
local GRID_Y = STYLE_ROW.y + STYLE_ROW.h + 2
local GRID_WELL = {
	x = AREA.x,
	y = GRID_Y,
	w = AREA.w,
	h = AREA.y + AREA.h - GRID_Y,
}
local GRID_LOOK = {
	well = GRID_WELL,
	origin = Vector2.new(6, 5),
	inset = 2,
	track = {
		x = 453,
		y = GRID_WELL.y + 3,
		w = 12,
		h = GRID_WELL.h - 6,
	},
	thumbPad = 2,
	star = Vector2.new(26, -1),
	emptyInk = LIGHT,
}
local GENDER_AREA = {
	x = AREA.x,
	y = AREA.y + 4,
	w = AREA.w,
	h = 140,
}
local GENDER_CARD = {
	w = 112,
	h = 140,
	gap = 24,
}
--* As ferramentas, no canto da barra: dado, desfazer e refazer. 
local TOOLS_X = 402
local TOOL_STEP = 23
--* As fileiras R, G e B do cartão de cor, e as cores prontas. 
local ROW_Y = function(channel)
	return AREA.y + 10 + channel * 19
end
local SWATCH = {
	x = AREA.x + 66,
	y = AREA.y + 90,
	size = 16,
	step = 19,
	count = 12,
}
local FOOT_Y = 234
--* A cerca do palco (a `fence` do script): tábuas, contorno e a sombra no chão, em pixels do palco. 
local function fenceRects()
	local shadow = { { 0, 15, SCENE.w, 2, N0, 90 / 255 } }
	local outline = {}
	local rails = {}
	local posts = {}
	local rows = { WOOD[1], WOOD[5], WOOD[4], WOOD[3], WOOD[1] }
	-- ▼ ReadonlyArray.forEach ▼
	local _callback = function(color, row)
		local _arg0 = { 0, 5 + row, SCENE.w, 1, color }
		table.insert(rails, _arg0)
		local _arg0_1 = { 0, 10 + row, SCENE.w, 1, color }
		table.insert(rails, _arg0_1)
	end
	for _k, _v in rows do
		_callback(_v, _k - 1, rows)
	end
	-- ▲ ReadonlyArray.forEach ▲
	for _, x in { 1, 13, 25, 37 } do
		local _arg0 = { x - 1, 17, 1, 1, N0, 90 / 255 }
		local _arg1 = { x + 3, 17, 1, 1, N0, 90 / 255 }
		local _arg2 = { x, 17, 3, 2, N0, 90 / 255 }
		-- ▼ Array.push ▼
		table.insert(shadow, _arg0)
		table.insert(shadow, _arg1)
		table.insert(shadow, _arg2)
		-- ▲ Array.push ▲
		local _arg0_1 = { x - 1, 4, 5, 12, WOOD[1] }
		local _arg1_1 = { x, 3, 3, 14, WOOD[1] }
		local _arg2_1 = { x + 1, 2, 1, 1, WOOD[1] }
		-- ▼ Array.push ▼
		table.insert(outline, _arg0_1)
		table.insert(outline, _arg1_1)
		table.insert(outline, _arg2_1)
		-- ▲ Array.push ▲
		local _arg0_2 = { x, 4, 1, 12, WOOD[5] }
		local _arg1_2 = { x + 1, 3, 1, 13, WOOD[4] }
		local _arg2_2 = { x + 2, 4, 1, 12, WOOD[3] }
		-- ▼ Array.push ▼
		table.insert(posts, _arg0_2)
		table.insert(posts, _arg1_2)
		table.insert(posts, _arg2_2)
		-- ▲ Array.push ▲
	end
	return {
		shadow = shadow,
		outline = outline,
		rails = rails,
		posts = posts,
	}
end
--* Quebra `text` em duas linhas: as palavras que cabem em `width` e o resto. 
local function twoLines(text, width)
	local words = string.split(text, " ")
	local first = ""
	local used = 0
	for _, word in words do
		local trial = if first == "" then word else `{first} {word}`
		if first ~= "" and textWidth(trial) > width then
			break
		end
		first = trial
		used += 1
	end
	local rest = {}
	do
		local index = used
		local _shouldIncrement = false
		while true do
			if _shouldIncrement then
				index += 1
			else
				_shouldIncrement = true
			end
			if not (index < #words) then
				break
			end
			local _arg0 = words[index + 1]
			table.insert(rest, _arg0)
		end
	end
	return { first, table.concat(rest, " ") }
end
--* A disposição do Clássico. 
local function GraalLayout(_param)
	local ctx = _param.ctx
	local _binding = ctx
	local k = _binding.k
	local P = makeParts(ctx, ICONS)
	local _binding_1 = P
	local at = _binding_1.at
	local label = _binding_1.label
	-- ---------- palco: o mundo de 42×50 com a cerca, flores e o boneco andando no lugar
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
		ImageRectOffset = Vector2.new(212, 96),
		ImageRectSize = Vector2.new(SCENE.w, SCENE.h),
		ResampleMode = "Pixelated",
		Size = UDim2.fromScale(1, 1),
		ZIndex = 1,
	}), P.rects(fence.shadow, SCENE.zoom, 2), P.rects(fence.outline, SCENE.zoom, 3), P.rects(fence.rails, SCENE.zoom, 4), P.rects(fence.posts, SCENE.zoom, 5), atlasBit(375, 311, 5, 13, 2, 12, 6), atlasBit(274, 311, 5, 13, 36, 14, 6), atlasBit(168, 311, 12, 14, -3, 36, 6), atlasBit(220, 311, 14, 14, 33, 37, 6), atlasBit(397, 311, 5, 13, 38, 30, 6), atlasBit(62, 337, 24, 6, 9, 43, 7), Vide.jsx("frame", {
		BackgroundTransparency = 1,
		Position = at(-3 * SCENE.zoom, 1 * SCENE.zoom),
		Size = px(k, 48 * SCENE.zoom, 48 * SCENE.zoom),
		ZIndex = 8,
	}, P.figure(previewLayers, MAX_FIGURE_LAYERS, SCENE.zoom, 8, function(layer)
		return layerRect(layer, 1, ctx.walkFrame(), TURN_ORDER[ctx.turn() + 1], ctx.closed())
	end, 0, function(layer)
		return layerPosition(layer, 1, ctx.walkFrame(), TURN_ORDER[ctx.turn() + 1])
	end))))
	-- ---------- janela da esquerda
	local title = function()
		return t("customize.title")
	end
	local plateW = function()
		return textWidth(title(), true) + 26
	end
	local plateX = function()
		return LEFT.x + math.floor((LEFT.w - plateW()) / 2)
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
		return UDim2.fromOffset(plateX() * k(), 2 * k())
	end
	_attributes_1.Size = function()
		return UDim2.fromOffset(plateW() * k(), 15 * k())
	end
	_attributes_1.ZIndex = 5
	local _exp_1 = Vide.jsx("imagelabel", _attributes_1, label(title, 13, 4, {
		color = O4,
		shadow = INK,
	}, {
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
			x = STAGE.x + 5,
			y = 150,
			w = 20,
			h = 20,
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
			x = STAGE.x + STAGE.w - 25,
			y = 150,
			w = 20,
			h = 20,
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
	local _exp_5 = label(function()
		return t("customize.name")
	end, 13, 182, LIGHT, {
		zIndex = 4,
	})
	local _exp_6 = P.nameField({
		x = 38,
		y = 176,
		w = 104,
		h = 18,
	}, {
		ink = TEXT,
		placeholder = {
			color = PLACEHOLDER,
			shadow = INK,
		},
		padX = 5,
		textY = 6,
		caretGap = 1,
		caretY = 4,
	}, 4)
	local _exp_7 = P.rects({ { 12, 198, 130, 1, INK }, { 12, 199, 130, 1, V1 } }, 1, 4)
	local _exp_8 = P.iconSeen("iconChest", 12, 202, 4)
	local _exp_9 = label(function()
		return t("customize.saved")
	end, 31, 206, TEXT, {
		zIndex = 4,
	})
	local _exp_10 = label(savedText, function()
		return 142 - textWidth(savedText())
	end, 206, SOFT, {
		zIndex = 4,
	})
	local _exp_11 = range(SAVED_LOOKS)
	-- ▼ ReadonlyArray.map ▼
	local _newValue = table.create(#_exp_11)
	local _callback = function(slot)
		return P.savedSlot(slot, {
			x = 12 + slot * 33,
			y = 218,
			w = 31,
			h = 36,
		}, {
			empty = "well",
			clip = {
				x = 2,
				y = 2,
				w = 27,
				h = 32,
			},
			figureAt = Vector2.new(-10, -2),
			plusAt = Vector2.new(8, 10),
			plusTint = V2,
		}, 4)
	end
	for _k, _v in _exp_11 do
		_newValue[_k] = _callback(_v, _k - 1, _exp_11)
	end
	-- ▲ ReadonlyArray.map ▲
	local left = { _exp, _exp_1, stage, _exp_2, _exp_3, _exp_4, _exp_5, _exp_6, _exp_7, _exp_8, _exp_9, _exp_10, _newValue }
	-- ---------- abas: a inativa fica atrás da janela; a ativa, na frente, entrando nela
	local tabButton = function(index)
		local item = TABS_LIST[index + 1]
		local active = function()
			return ctx.tab() == index
		end
		local top = function()
			return if active() then TAB.activeTop else TAB.top
		end
		local seen = ICONS[item.icon] or Vector2.new(16, 16)
		local text = function()
			return t(item.title)
		end
		local _attributes_3 = table.clone(themed(function()
			return if active() then "tabActive" else "tab"
		end, k))
		setmetatable(_attributes_3, nil)
		_attributes_3.AutoButtonColor = false
		_attributes_3.Position = function()
			return UDim2.fromOffset((TAB.x + index * TAB.step) * k(), top() * k())
		end
		_attributes_3.Size = function()
			return UDim2.fromOffset(TAB.w * k(), (if active() then metric("tabActiveHeight") else metric("tabHeight")) * k())
		end
		_attributes_3.ZIndex = function()
			return if active() then 3 else 1
		end
		_attributes_3.Activated = function()
			return ctx.openTab(index)
		end
		return Vide.jsx("imagebutton", _attributes_3, P.iconSeen(item.icon, math.floor((TAB.w - seen.X) / 2), function()
			return TAB.activeTop + (if active() then 8 else 7) + math.floor((14 - seen.Y) / 2) - top()
		end, 2, {
			transparency = function()
				return if active() then 0 else 0.45
			end,
		}), label(text, function()
			return TAB.w / 2 - math.floor(textWidth(text()) / 2)
		end, function()
			return 25 - top()
		end, function()
			return {
				color = if active() then O4 else C0,
				shadow = INK,
			}
		end, {
			zIndex = 3,
		}))
	end
	-- ---------- barra de ferramentas
	local currentGrid = function()
		return ctx.gridOf(ctx.tab())
	end
	local authorText = function()
		local grid = currentGrid()
		local name = if grid then P.authorName(grid) else ""
		return t("customize.artist", {
			name = if name == "" then t("customize.everyone") else name,
		})
	end
	local changeAuthor = function(step)
		local grid = currentGrid()
		if not grid then
			return nil
		end
		ctx.part(0)
		ctx.nextAuthor(grid, step)
	end
	local pickW = function()
		return math.min(48, math.floor(238 / math.max(ctx.pickCount(), 1)) - 2)
	end
	local _exp_12 = P.button({
		kind = "secondary",
		box = {
			x = IX,
			y = IY,
			w = 76,
			h = 20,
		},
		icon = function()
			return "starOn"
		end,
		text = function()
			return t("customize.onlyFavorites")
		end,
		ink = buttonInk,
		chosen = ctx.favoritesOnly,
		chosenStyle = "pressed",
		onPress = ctx.toggleFavoritesOnly,
		tip = function()
			return t("customize.favoritesHelp")
		end,
		zIndex = 1,
	})
	local _attributes_3 = table.clone(themed("textField", k))
	setmetatable(_attributes_3, nil)
	_attributes_3.AutoButtonColor = false
	_attributes_3.Position = at(IX + 80, IY + 1)
	_attributes_3.Size = px(k, 108, 18)
	_attributes_3.ZIndex = 1
	_attributes_3.MouseEnter = function(x, y)
		return ctx.showHint(t("customize.artistHelp"), x, y)
	end
	_attributes_3.MouseLeave = function()
		return ctx.tooltip(nil)
	end
	_attributes_3.Activated = function()
		return changeAuthor(1)
	end
	_attributes_3.InputBegan = function(input)
		if input.UserInputType == Enum.UserInputType.MouseButton2 then
			changeAuthor(-1)
		end
	end
	local _exp_13 = Vide.jsx("frame", {
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Visible = function()
			return currentGrid() ~= nil
		end,
		ZIndex = 4,
	}, _exp_12, Vide.jsx("imagebutton", _attributes_3, label(authorText, 5, 5, TEXT, {
		zIndex = 2,
	}), label(function()
		return "▾"
	end, 98, 6, LIGHT, {
		zIndex = 2,
	})))
	local _exp_14 = range(#CLOTH_KEYS)
	-- ▼ ReadonlyArray.map ▼
	local _newValue_1 = table.create(#_exp_14)
	local _callback_1 = function(index)
		return P.button({
			kind = "secondary",
			box = function()
				return {
					x = IX + index * (pickW() + 2),
					y = IY,
					w = pickW(),
					h = 20,
				}
			end,
			text = function()
				return ctx.pickName(index)
			end,
			ink = buttonInk,
			chosen = function()
				return ctx.pickValue() == index
			end,
			chosenStyle = "pressed",
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
	for _k, _v in _exp_14 do
		_newValue_1[_k] = _callback_1(_v, _k - 1, _exp_14)
	end
	-- ▲ ReadonlyArray.map ▲
	local toolbar = { _exp_13, _newValue_1, P.button({
		kind = "icon",
		box = {
			x = TOOLS_X,
			y = IY,
			w = 20,
			h = 20,
		},
		icon = function()
			return "iconDice"
		end,
		onPress = ctx.randomize,
		tip = function()
			return t("customize.random")
		end,
		zIndex = 4,
	}), P.button({
		kind = "icon",
		box = {
			x = TOOLS_X + TOOL_STEP,
			y = IY,
			w = 20,
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
	}), P.button({
		kind = "icon",
		box = {
			x = TOOLS_X + TOOL_STEP * 2,
			y = IY,
			w = 20,
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
	}) }
	-- ---------- cartão de cor das abas Cabelo, Rosto e Roupa
	local partName = function()
		return ctx.pickName(ctx.pickValue())
	end
	local hex6 = P.hexText(true)
	local hint = derive(function()
		return twoLines(t("customize.colorHint"), 76)
	end)
	local _attributes_4 = table.clone(themed("card", k))
	setmetatable(_attributes_4, nil)
	_attributes_4.Position = at(AREA.x, AREA.y)
	_attributes_4.Size = px(k, AREA.w, AREA.h)
	_attributes_4.ZIndex = 1
	local _exp_15 = Vide.jsx("imagelabel", _attributes_4)
	local _exp_16 = P.swatch({
		x = AREA.x + 10,
		y = AREA.y + 10,
		w = 44,
		h = 44,
	}, 1, 1)
	local _exp_17 = label(partName, function()
		return AREA.x + 32 - math.floor(textWidth(partName()) / 2)
	end, AREA.y + 60, TEXT, {
		zIndex = 3,
	})
	local _exp_18 = label(hex6, function()
		return AREA.x + 32 - math.floor(textWidth(hex6()) / 2)
	end, AREA.y + 71, SOFT, {
		zIndex = 3,
	})
	local _exp_19 = range(3)
	-- ▼ ReadonlyArray.map ▼
	local _newValue_2 = table.create(#_exp_19)
	local _callback_2 = function(channel)
		local y = ROW_Y(channel)
		local value = P.channelValue(channel)
		local _array = {}
		local _length = #_array
		local _array_1 = P.outlinedLabel(CHANNEL_NAMES[channel + 1], AREA.x + 66, y + 3, CHANNEL_INK[channel + 1], INK, 3)
		local _Length = #_array_1
		table.move(_array_1, 1, _Length, _length + 1, _array)
		_length += _Length
		local _array_2 = P.channelTrack(channel, {
			x = AREA.x + 76,
			y = y + 2,
			w = 168,
			h = 10,
		}, 3, 2)
		local _Length_1 = #_array_2
		table.move(_array_2, 1, _Length_1, _length + 1, _array)
		_length += _Length_1
		local _attributes_5 = table.clone(themed("textField", k))
		setmetatable(_attributes_5, nil)
		_attributes_5.Position = at(AREA.x + 250, y)
		_attributes_5.Size = px(k, 30, 14)
		_attributes_5.ZIndex = 3
		_array[_length + 1] = Vide.jsx("imagelabel", _attributes_5)
		_array[_length + 2] = label(value, function()
			return AREA.x + 276 - textWidth(value())
		end, y + 4, TEXT, {
			zIndex = 4,
		})
		return _array
	end
	for _k, _v in _exp_19 do
		_newValue_2[_k] = _callback_2(_v, _k - 1, _exp_19)
	end
	-- ▲ ReadonlyArray.map ▲
	local _exp_20 = label(function()
		return t("customize.presetsLong")
	end, AREA.x + 66, AREA.y + 78, TEXT, {
		zIndex = 3,
	})
	local _exp_21 = range(SWATCH.count)
	-- ▼ ReadonlyArray.map ▼
	local _newValue_3 = table.create(#_exp_21)
	local _callback_3 = function(index)
		return P.preset(index, SWATCH.x + index * SWATCH.step, SWATCH.y, SWATCH.size, 3, {
			chosenOutset = 0,
			mark = Vector2.new(-3, -3),
		})
	end
	for _k, _v in _exp_21 do
		_newValue_3[_k] = _callback_3(_v, _k - 1, _exp_21)
	end
	-- ▲ ReadonlyArray.map ▲
	local colorCard = (Vide.jsx("frame", {
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Visible = function()
			return ctx.tab() >= 3
		end,
		ZIndex = 4,
	}, _exp_15, Vide.jsx("frame", {
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Visible = ctx.paintable,
		ZIndex = 2,
	}, _exp_16, _exp_17, _exp_18, _newValue_2, _exp_20, _newValue_3, P.icon("originalMark", AREA.x + 66, AREA.y + 114, 3), label(function()
		return t("customize.originalLegend")
	end, AREA.x + 76, AREA.y + 114, LIGHT, {
		zIndex = 3,
	}), P.button({
		kind = "secondary",
		box = {
			x = AREA.x + AREA.w - 92,
			y = AREA.y + AREA.h - 30,
			w = 82,
			h = 20,
		},
		icon = function()
			return "iconRotateLeft"
		end,
		text = function()
			return t("customize.restore")
		end,
		ink = buttonInk,
		onPress = ctx.restore,
		zIndex = 3,
	}), label(function()
		return hint()[1]
	end, AREA.x + 10, AREA.y + AREA.h - 22, SOFT, {
		maxChars = 40,
		zIndex = 3,
	}), label(function()
		return hint()[2]
	end, AREA.x + 10, AREA.y + AREA.h - 12, SOFT, {
		maxChars = 40,
		zIndex = 3,
	})), label(function()
		return t("customize.nothingToPaint")
	end, AREA.x + 10, AREA.y + 10, LIGHT, {
		width = AREA.w - 20,
		wrap = true,
		maxChars = 64,
		zIndex = 2,
		visible = function()
			return not ctx.paintable()
		end,
	})))
	-- ---------- linha de informação, teclas e botões finais
	local infoRight = function()
		local grid = currentGrid()
		if grid then
			return t(if grid.kind == "head" then "customize.countHeads" else "customize.countBodies", {
				n = #ctx.listOf(grid),
			})
		end
		return if ctx.tab() >= 3 then t(ctx.colorTitle()) else ""
	end
	local keyText = { function()
		return keyName(Enum.KeyCode.Q)
	end, function()
		return keyName(Enum.KeyCode.E)
	end, function()
		return keyName(Enum.KeyCode.Space)
	end }
	--* Tecla de uma letra tem 11 de largura; a de palavra, o texto e 4 de cada lado. 
	local keyW = function(text)
		return if #text <= 1 then math.max(11, textWidth(text) + 6) else textWidth(text) + 8
	end
	local keyX
	keyX = { function()
		return IX + 2
	end, function()
		return IX + 2 + keyW(keyText[1]()) + 2
	end, function()
		return keyX[2]() + keyW(keyText[2]()) + 4 + textWidth(t("hint.tabs")) + 8
	end }
	local keyCap = function(slot)
		local _attributes_5 = table.clone(themed("key", k))
		setmetatable(_attributes_5, nil)
		_attributes_5.Position = function()
			return UDim2.fromOffset(keyX[slot + 1]() * k(), (FOOT_Y + 3) * k())
		end
		_attributes_5.Size = function()
			return UDim2.fromOffset(keyW(keyText[slot + 1]()) * k(), 14 * k())
		end
		_attributes_5.ZIndex = 4
		return Vide.jsx("imagelabel", _attributes_5, label(keyText[slot + 1], function()
			return math.floor((keyW(keyText[slot + 1]()) - textWidth(keyText[slot + 1]())) / 2)
		end, 2, TEXT, {
			zIndex = 2,
		}))
	end
	local footer = { label(function()
		return P.infoCredit("  ")
	end, IX + 2, AREA.y + AREA.h + 5, LIGHT, {
		maxChars = 40,
		zIndex = 4,
	}), label(infoRight, function()
		return IR - 1 - textWidth(infoRight())
	end, AREA.y + AREA.h + 5, SOFT, {
		zIndex = 4,
	}), keyCap(0), keyCap(1), label(function()
		return t("hint.tabs")
	end, function()
		return keyX[2]() + keyW(keyText[2]()) + 4
	end, FOOT_Y + 6, SOFT, {
		zIndex = 4,
	}), keyCap(2), label(function()
		return t("hint.choose")
	end, function()
		return keyX[3]() + keyW(keyText[3]()) + 4
	end, FOOT_Y + 6, SOFT, {
		zIndex = 4,
	}), P.button({
		kind = "secondary",
		box = {
			x = IR - 86 - 4 - 66 + 1,
			y = FOOT_Y,
			w = 66,
			h = 20,
		},
		icon = function()
			return "iconBack"
		end,
		text = function()
			return t("common.back")
		end,
		ink = buttonInk,
		onPress = function()
			return ctx.onDone(false)
		end,
		zIndex = 4,
	}), P.button({
		kind = "primary",
		box = {
			x = IR - 86 + 1,
			y = FOOT_Y,
			w = 86,
			h = 20,
		},
		icon = function()
			return "iconNext"
		end,
		iconRight = true,
		iconTint = function()
			return M1
		end,
		text = function()
			return t("common.continue")
		end,
		ink = buttonInk,
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
		if tab <= 2 then
			return if part == 0 then {
				x = IX + 80,
				y = IY + 1,
				w = 108,
				h = 18,
			} else P.gridFocus(tab, GRID_LOOK)
		end
		if part == 2 then
			return {
				x = IX + ctx.cursor() * (pickW() + 2),
				y = IY,
				w = pickW(),
				h = 20,
			}
		end
		if not ctx.paintable() then
			return nil
		end
		if part == 6 then
			return {
				x = SWATCH.x + ctx.cursor() * SWATCH.step,
				y = SWATCH.y,
				w = SWATCH.size,
				h = SWATCH.size,
			}
		end
		return {
			x = AREA.x + 62,
			y = ROW_Y(part - 3) - 2,
			w = 222,
			h = 18,
		}
	end
	local _exp_22 = left
	local _exp_23 = range(#TABS_LIST)
	-- ▼ ReadonlyArray.map ▼
	local _newValue_4 = table.create(#_exp_23)
	for _k, _v in _exp_23 do
		_newValue_4[_k] = tabButton(_v, _k - 1, _exp_23)
	end
	-- ▲ ReadonlyArray.map ▲
	local _attributes_5 = table.clone(themed("panel", k))
	setmetatable(_attributes_5, nil)
	_attributes_5.Position = at(RIGHT.x, RIGHT.y)
	_attributes_5.Size = px(k, RIGHT.w, RIGHT.h)
	_attributes_5.ZIndex = 2
	local root = (Vide.jsx("frame", {
		Name = "Classic",
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		ZIndex = 2,
	}, _exp_22, _newValue_4, Vide.jsx("imagelabel", _attributes_5), toolbar, Vide.jsx("frame", {
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Visible = function()
			return ctx.tab() == 0
		end,
		ZIndex = 4,
	}, P.genderCards(GENDER_AREA, GENDER_CARD, TEXT, 1)), Vide.jsx("frame", {
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Visible = function()
			return ctx.tab() == 1
		end,
		ZIndex = 4,
	}, P.styleSwitch(1, IX + 2, STYLE_ROW.y, STYLE_ROW.h, {
		labelInk = TEXT,
		ink = buttonInk,
		chosenStyle = "pressed",
		zIndex = 1,
	}), P.grid(1, GRID_LOOK, 1)), Vide.jsx("frame", {
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Visible = function()
			return ctx.tab() == 2
		end,
		ZIndex = 4,
	}, P.styleSwitch(2, IX + 2, STYLE_ROW.y, STYLE_ROW.h, {
		labelInk = TEXT,
		ink = buttonInk,
		chosenStyle = "pressed",
		zIndex = 1,
	}), P.grid(2, GRID_LOOK, 1)), colorCard, footer, P.cursorFrame(focus, 8)))
	ctx.useLayout({
		colorStrip = false,
		swatchLimit = function()
			return SWATCH.count
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
	GraalLayout = GraalLayout,
}
