-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local _vide = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "vide", "src")
local Vide = _vide
local cleanup = _vide.cleanup
local derive = _vide.derive
local Show = _vide.Show
local source = _vide.source
local spring = _vide.spring
local subscribe = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "charm", "src").subscribe
local _services = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services")
local RunService = _services.RunService
local UserInputService = _services.UserInputService
local decodeSavedLook = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "playerData").decodeSavedLook
local playerData = TS.import(script, script.Parent.Parent, "state", "playerData").playerData
local _art = TS.import(script, script.Parent, "art")
local LOGO = _art.LOGO
local TITLE = _art.TITLE
local TITLE_SHADOW_SLOPE = _art.TITLE_SHADOW_SLOPE
local TITLE_SHADOWS = _art.TITLE_SHADOWS
local TITLE_WATER = _art.TITLE_WATER
local TITLE_WATER_FPS = _art.TITLE_WATER_FPS
local CreditsPanel = TS.import(script, script.Parent, "CreditsPanel").CreditsPanel
local CustomizeScreen = TS.import(script, script.Parent, "CustomizeScreen").CustomizeScreen
local t = TS.import(script, script.Parent, "i18n").t
local _kit = TS.import(script, script.Parent, "kit")
local art = _kit.art
local BODY = _kit.BODY
local Hints = _kit.Hints
local INK = _kit.INK
local px = _kit.px
local screenScale = _kit.screenScale
local SERIF = _kit.SERIF
local ThemeButton = _kit.ThemeButton
local WHITE = _kit.WHITE
local SettingsPanel = TS.import(script, script.Parent, "SettingsPanel").SettingsPanel
local _theme = TS.import(script, script.Parent, "theme")
local pieceSize = _theme.pieceSize
local themed = _theme.themed
--* O fundo enquanto a cena não carrega: o verde da grama. 
local GRASS = Color3.fromRGB(86, 150, 62)
--* A cor das sombras de nuvem e o quanto elas deixam ver. 
local SHADOW = Color3.fromRGB(12, 34, 30)
local SHADOW_TRANSPARENCY = 0.8
--* Segundos que a tela leva para sumir depois de o jogo começar. 
local OPEN_SECONDS = 1
--* Número da versão; o texto em volta vem da tradução. 
local VERSION = "0.1"
--[[
	*
	 * As opções do menu. Cada jogador tem um personagem só (decisão do usuário em 2026-10-17): a primeira
	 * opção é Começar para quem é novo (abre a tela de personalizar) e Continuar para quem já tem
	 * personagem salvo (entra direto). Quem já tem personagem também vê Editar personagem, que abre a tela
	 * de personalizar a partir dele.
	 
]]
local MENU = { {
	label = "menu.start",
	action = "play",
	icon = "iconNext",
}, {
	label = "menu.editCharacter",
	action = "edit",
	icon = "iconHead",
}, {
	label = "menu.settings",
	action = "settings",
	icon = "iconSettings",
}, {
	label = "menu.credits",
	action = "credits",
	icon = "iconCredits",
}, {
	label = "menu.quit",
	action = "quit",
	icon = "iconBack",
} }
--* O painel do menu, no canto de baixo à direita, em pixels de arte. 
local MENU_PANEL = {
	w = 136,
	inner = 10,
	button = 22,
	step = 26,
	right = 12,
	bottom = 30,
}
--[[
	*
	 * Tela de título: a vila com a fazenda vista na diagonal (pedido do usuário em 2026-10-17), com a
	 * câmera passeando devagar, a água do rio correndo e sombras de nuvem passando; a logo no alto e o
	 * menu num painel do tema no canto de baixo à direita. Mostra "Carregando" até as imagens chegarem,
	 * abre a personalização do personagem e some quando o jogo começa.
	 
]]
local function StartScreen(_param)
	local stage = _param.stage
	local onContinue = _param.onContinue
	local onNewGame = _param.onNewGame
	local onQuit = _param.onQuit
	local onCustomized = _param.onCustomized
	local _binding = screenScale()
	local viewport = _binding.viewport
	local k = _binding.k
	-- A vista de 480×270 cobre a tela inteira com ampliação inteira; o que sobra é cortado nas bordas.
	local cover = function()
		return math.max(1, math.ceil(math.max(viewport().X / TITLE.view.X, viewport().Y / TITLE.view.Y)))
	end
	local opened = os.clock()
	local clock = source(os.clock())
	cleanup(RunService.RenderStepped:Connect(function()
		return clock(os.clock())
	end))
	-- Véu preto atrás da tela de personalizar (0 fechado, 1 aberto). Quando o jogo começa, ele abre
	-- e revela o mundo.
	local veil = spring(function()
		return if stage() == "customize" then 0 else 1
	end, OPEN_SECONDS, 1)
	-- O título some de uma vez ao começar o jogo: nessa hora o véu ainda cobre a tela.
	local gone = function()
		return if stage() == "playing" then 1 else 0
	end
	-- O que está salvo do jogador: com personagem, o menu mostra Continuar e Editar personagem.
	local saved = source(playerData())
	cleanup(subscribe(playerData, function(value)
		return saved(value)
	end))
	local savedLook = derive(function()
		return decodeSavedLook(saved().character)
	end)
	local entries = derive(function()
		-- ▼ ReadonlyArray.filter ▼
		local _newValue = {}
		local _callback = function(entry)
			return entry.action ~= "edit" or savedLook() ~= nil
		end
		local _length = 0
		for _k, _v in MENU do
			if _callback(_v, _k - 1, MENU) == true then
				_length += 1
				_newValue[_length] = _v
			end
		end
		-- ▲ ReadonlyArray.filter ▲
		return _newValue
	end)
	--* O texto de uma opção: a primeira diz Continuar para quem já tem personagem. 
	local labelOf = function(item)
		return if item.action == "play" and savedLook() ~= nil then "menu.continue" else item.label
	end
	local selected = source(0)
	local panel = source(nil)
	-- Fecha no fim do quadro: a mesma tecla não chega ao menu e não reabre o painel.
	local close = function()
		return task.defer(function()
			return panel(nil)
		end)
	end
	local choose = function(index)
		local entry = entries()[index + 1]
		if not entry then
			return nil
		end
		local _binding_1 = entry
		local action = _binding_1.action
		if action == "play" then
			if savedLook() ~= nil then
				onContinue()
			else
				onNewGame()
			end
		elseif action == "edit" then
			onNewGame()
		elseif action == "quit" then
			onQuit()
		else
			panel(action)
		end
	end
	cleanup(UserInputService.InputBegan:Connect(function(input, processed)
		-- Com um painel aberto, as teclas são dele.
		if processed or stage() ~= "menu" or panel() ~= nil then
			return nil
		end
		local key = input.KeyCode
		local count = #entries()
		if key == Enum.KeyCode.W or key == Enum.KeyCode.Up then
			selected((selected() - 1 + count) % count)
		elseif key == Enum.KeyCode.S or key == Enum.KeyCode.Down then
			selected((selected() + 1) % count)
		elseif key == Enum.KeyCode.Space or key == Enum.KeyCode.Return then
			choose(selected())
		end
	end))
	--[[
		*
		     * Onde a câmera está: o canto de cima à esquerda do que a tela mostra, em pixels da cena. Ela vai de
		     * `panFrom` a `panTo` e volta, mais devagar nas pontas; a tela pode mostrar menos que 480×270, e
		     * aí o recorte fica no meio da vista.
		     
	]]
	local camera = function()
		local phase = ((clock() - opened) / TITLE.panSeconds) % 2
		local along = (1 - math.cos(math.pi * (if phase > 1 then 2 - phase else phase))) / 2
		local view = TITLE.panFrom:Lerp(TITLE.panTo, along)
		local _exp = viewport()
		local _arg0 = cover()
		local shown = _exp / _arg0
		local _arg0_1 = (TITLE.view - shown) / 2
		local corner = view + _arg0_1
		return Vector2.new(math.clamp(corner.X, 0, math.max(TITLE.size.X - shown.X, 0)), math.clamp(corner.Y, 0, math.max(TITLE.size.Y - shown.Y, 0)))
	end
	--* Uma faixa do rio: os quadros da água trocam por cima da que está desenhada na cena. 
	local water = function(strip)
		return Vide.jsx("imagelabel", {
			Name = "Water",
			BackgroundTransparency = 1,
			Position = function()
				return UDim2.fromOffset(strip.at.X * cover(), strip.at.Y * cover())
			end,
			Size = function()
				return UDim2.fromOffset(strip.size.X * cover(), strip.size.Y * cover())
			end,
			Image = strip.image,
			ImageRectSize = strip.size,
			ImageRectOffset = function()
				return strip.frames[math.floor(clock() * TITLE_WATER_FPS) % #strip.frames + 1]
			end,
			ResampleMode = "Pixelated",
			ImageTransparency = gone,
			ZIndex = 2,
		})
	end
	local shadow = function(spot)
		local width = spot.piece.size.X
		local lap = TITLE.size.X + width
		local _attributes = table.clone(art(spot.piece))
		setmetatable(_attributes, nil)
		_attributes.Name = "CloudShadow"
		_attributes.ZIndex = 3
		_attributes.ImageColor3 = SHADOW
		_attributes.ImageTransparency = function()
			return math.max(gone(), SHADOW_TRANSPARENCY)
		end
		_attributes.Size = function()
			return UDim2.fromOffset(width * cover(), spot.piece.size.Y * cover())
		end
		_attributes.Position = function()
			-- Atravessa a cena da esquerda para a direita, descendo um pouco, e volta a entrar pelo outro lado.
			local x = ((spot.start + clock() * spot.speed) % lap) - width
			local y = spot.y + (x + width) * TITLE_SHADOW_SLOPE
			return UDim2.fromOffset(math.round(x * cover()), math.round(y * cover()))
		end
		return Vide.jsx("imagelabel", _attributes)
	end
	--* Um botão do menu, na posição `index` da lista que aparece agora. 
	local entry = function(item)
		local index = function()
			local _exp = entries()
			local _item = item
			return (table.find(_exp, _item) or 0) - 1
		end
		return Vide.jsx("frame", {
			BackgroundTransparency = 1,
			Size = UDim2.fromScale(1, 1),
			Visible = function()
				return index() >= 0
			end,
			ZIndex = 6,
		}, Vide.jsx(ThemeButton, {
			k = k,
			kind = function()
				return if index() == 0 then "primary" else "secondary"
			end,
			position = function()
				return UDim2.fromOffset(MENU_PANEL.inner * k(), (MENU_PANEL.inner + math.max(index(), 0) * MENU_PANEL.step) * k())
			end,
			size = px(k, MENU_PANEL.w - MENU_PANEL.inner * 2, MENU_PANEL.button),
			icon = function()
				return item.icon
			end,
			text = function()
				return t(labelOf(item))
			end,
			font = SERIF,
			textSize = 9,
			chosen = function()
				return selected() == index()
			end,
			fade = gone,
			zIndex = 7,
			onHover = function(hovered)
				-- O Roblox avisa a entrada do mouse mesmo com o painel por cima: com um painel aberto, o menu
				-- guarda o item que o abriu.
				if hovered and panel() == nil then
					selected(index())
				end
			end,
			onPress = function()
				return choose(index())
			end,
		}))
	end
	local panelHeight = function()
		return MENU_PANEL.inner * 2 + #entries() * MENU_PANEL.step - (MENU_PANEL.step - MENU_PANEL.button)
	end
	local _exp = Vide.jsx("imagelabel", {
		Name = "Village",
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Image = TITLE.image,
		ResampleMode = "Pixelated",
		ZIndex = 1,
		ImageTransparency = gone,
	})
	-- ▼ ReadonlyArray.map ▼
	local _newValue = table.create(#TITLE_WATER)
	for _k, _v in TITLE_WATER do
		_newValue[_k] = water(_v, _k - 1, TITLE_WATER)
	end
	-- ▲ ReadonlyArray.map ▲
	-- ▼ ReadonlyArray.map ▼
	local _newValue_1 = table.create(#TITLE_SHADOWS)
	for _k, _v in TITLE_SHADOWS do
		_newValue_1[_k] = shadow(_v, _k - 1, TITLE_SHADOWS)
	end
	-- ▲ ReadonlyArray.map ▲
	local gui = (Vide.jsx("screengui", {
		Name = "StartScreen",
		IgnoreGuiInset = true,
		ResetOnSpawn = false,
		DisplayOrder = 100,
		AutoLocalize = false,
	}, Vide.jsx("frame", {
		Name = "Scene",
		Size = UDim2.fromScale(1, 1),
		BorderSizePixel = 0,
		BackgroundColor3 = GRASS,
		BackgroundTransparency = gone,
		ClipsDescendants = true,
	}, Vide.jsx("frame", {
		Name = "World",
		BackgroundTransparency = 1,
		Position = function()
			local _exp_1 = camera()
			local _arg0 = -cover()
			local at = _exp_1 * _arg0
			return UDim2.fromOffset(math.round(at.X), math.round(at.Y))
		end,
		Size = function()
			return UDim2.fromOffset(TITLE.size.X * cover(), TITLE.size.Y * cover())
		end,
	}, _exp, _newValue, _newValue_1)), Vide.jsx("imagelabel", {
		Name = "Logo",
		BackgroundTransparency = 1,
		AnchorPoint = Vector2.new(0.5, 0),
		Position = function()
			return UDim2.new(0.5, 0, 0, 16 * k())
		end,
		Image = LOGO.image,
		ResampleMode = "Pixelated",
		ZIndex = 4,
		ImageTransparency = gone,
		Size = px(k, LOGO.size.X, LOGO.size.Y),
	}), Vide.jsx(Show, {
		when = function()
			return stage() == "loading"
		end,
	}, function()
		return Vide.jsx("textlabel", {
			Name = "Loading",
			BackgroundTransparency = 1,
			AnchorPoint = Vector2.new(0, 1),
			Position = function()
				return UDim2.new(0, 26 * k(), 1, -30 * k())
			end,
			AutomaticSize = "XY",
			FontFace = SERIF,
			Text = function()
				return t("title.loading")
			end,
			TextColor3 = WHITE,
			TextSize = function()
				return 12 * k()
			end,
			ZIndex = 5,
		}, Vide.jsx("uistroke", {
			Color = INK,
			Thickness = k,
			Transparency = 0.45,
		}))
	end), Vide.jsx(Show, {
		when = function()
			return stage() == "menu"
		end,
	}, function()
		local _attributes = table.clone(themed("panel", k))
		setmetatable(_attributes, nil)
		_attributes.Name = "Menu"
		_attributes.AnchorPoint = Vector2.new(1, 1)
		_attributes.Position = function()
			return UDim2.new(1, -MENU_PANEL.right * k(), 1, -MENU_PANEL.bottom * k())
		end
		_attributes.Size = function()
			return UDim2.fromOffset(MENU_PANEL.w * k(), panelHeight() * k())
		end
		_attributes.ImageTransparency = gone
		_attributes.ZIndex = 5
		-- ▼ ReadonlyArray.map ▼
		local _newValue_2 = table.create(#MENU)
		for _k, _v in MENU do
			_newValue_2[_k] = entry(_v, _k - 1, MENU)
		end
		-- ▲ ReadonlyArray.map ▲
		local _attributes_1 = table.clone(themed("menuPointer", k))
		setmetatable(_attributes_1, nil)
		_attributes_1.Name = "Pointer"
		_attributes_1.AnchorPoint = Vector2.new(1, 0.5)
		_attributes_1.ImageTransparency = function()
			return if panel() ~= nil then 1 else gone()
		end
		_attributes_1.Size = function()
			local size = pieceSize("menuPointer")
			return UDim2.fromOffset(size.X * k(), size.Y * k())
		end
		_attributes_1.Position = function()
			-- A mãozinha balança de leve ao lado do botão escolhido.
			local sway = math.round(math.sin(clock() * 5) * 1.5) * k()
			local y = MENU_PANEL.inner + selected() * MENU_PANEL.step + MENU_PANEL.button / 2
			return UDim2.fromOffset(2 * k() + sway, y * k())
		end
		_attributes_1.ZIndex = 9
		return Vide.jsx("imagelabel", _attributes, _newValue_2, Vide.jsx("imagelabel", _attributes_1))
	end), Vide.jsx("textlabel", {
		Name = "Version",
		BackgroundTransparency = 1,
		AnchorPoint = Vector2.new(0, 1),
		Position = function()
			return UDim2.new(0, 24 * k(), 1, -6 * k())
		end,
		AutomaticSize = "XY",
		FontFace = BODY,
		Text = function()
			return t("title.version", {
				version = VERSION,
			})
		end,
		TextColor3 = WHITE,
		TextSize = function()
			return 6 * k()
		end,
		TextTransparency = function()
			return math.max(gone(), 0.1)
		end,
		ZIndex = 5,
	}), Vide.jsx(Show, {
		when = function()
			return stage() == "menu" and panel() == nil
		end,
	}, function()
		return Vide.jsx(Hints, {
			k = k,
			hints = { {
				keys = { Enum.KeyCode.W, Enum.KeyCode.S },
				label = "hint.navigate",
			}, {
				keys = { Enum.KeyCode.Space },
				label = "hint.select",
			} },
		})
	end), Vide.jsx("frame", {
		Name = "Veil",
		Size = UDim2.fromScale(1, 1),
		BorderSizePixel = 0,
		BackgroundColor3 = Color3.fromRGB(0, 0, 0),
		BackgroundTransparency = veil,
		ZIndex = 8,
	}), Vide.jsx(Show, {
		when = function()
			return stage() == "customize"
		end,
	}, function()
		return Vide.jsx(CustomizeScreen, {
			k = k,
			onDone = onCustomized,
		})
	end), Vide.jsx(Show, {
		when = function()
			return stage() == "menu" and panel() == "settings"
		end,
	}, function()
		return Vide.jsx(SettingsPanel, {
			k = k,
			onClose = close,
		})
	end), Vide.jsx(Show, {
		when = function()
			return stage() == "menu" and panel() == "credits"
		end,
	}, function()
		return Vide.jsx(CreditsPanel, {
			k = k,
			onClose = close,
		})
	end)))
	-- Desmontar o Vide só encerra os efeitos; a tela precisa ser destruída à parte.
	cleanup(gui)
	return gui
end
return {
	StartScreen = StartScreen,
	OPEN_SECONDS = OPEN_SECONDS,
}
