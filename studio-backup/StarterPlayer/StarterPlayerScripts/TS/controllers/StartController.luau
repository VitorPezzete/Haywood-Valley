-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local Reflect = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Reflect
local Controller = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Controller
local subscribe = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "charm", "src").subscribe
local _services = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services")
local ContentProvider = _services.ContentProvider
local Players = _services.Players
local StarterGui = _services.StarterGui
local _vide = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "vide", "src")
local mount = _vide.mount
local source = _vide.source
local _appearance = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "appearance")
local encodeLook = _appearance.encodeLook
local lookGender = _appearance.lookGender
local MISSING_IMAGE = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "assets").MISSING_IMAGE
local decodeSavedLook = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "playerData").decodeSavedLook
local playerData = TS.import(script, script.Parent.Parent, "state", "playerData").playerData
local Events = TS.import(script, script.Parent.Parent, "network").Events
local _screen = TS.import(script, script.Parent.Parent, "state", "screen")
local characterName = _screen.characterName
local look = _screen.look
local screen = _screen.screen
local _art = TS.import(script, script.Parent.Parent, "ui", "art")
local ChatArt = _art.ChatArt
local LOGO = _art.LOGO
local TITLE = _art.TITLE
local TITLE_WATER = _art.TITLE_WATER
local THEME_ATLASES = TS.import(script, script.Parent.Parent, "ui", "theme").THEME_ATLASES
local settings = TS.import(script, script.Parent.Parent, "state", "settings").settings
local _i18n = TS.import(script, script.Parent.Parent, "ui", "i18n")
local keyName = _i18n.keyName
local t = _i18n.t
local _StartScreen = TS.import(script, script.Parent.Parent, "ui", "StartScreen")
local OPEN_SECONDS = _StartScreen.OPEN_SECONDS
local StartScreen = _StartScreen.StartScreen
local figureLayers = TS.import(script, script.Parent.Parent, "world", "graalArt").figureLayers
local FACE_SHEET = TS.import(script, script.Parent.Parent, "world", "characterArt").FACE_SHEET
local interiorTest = TS.import(script, script.Parent.Parent, "world", "interiorTest").interiorTest
local _sprites = TS.import(script, script.Parent.Parent, "world", "sprites")
local GRASS_TILE = _sprites.GRASS_TILE
local Sprites = _sprites.Sprites
local closeOpening = TS.import(script, script.Parent.Parent, "ui", "opening").closeOpening
--* Abertura do jogo: carrega as imagens, mostra o menu inicial e a personalização, e começa a partida. 
local StartController
do
	StartController = setmetatable({}, {
		__tostring = function()
			return "StartController"
		end,
	})
	StartController.__index = StartController
	function StartController.new(...)
		local self = setmetatable({}, StartController)
		return self:constructor(...) or self
	end
	function StartController:constructor(movement, dialogue, scene)
		self.movement = movement
		self.dialogue = dialogue
		self.scene = scene
	end
	function StartController:onStart()
		if interiorTest() then
			self:startInteriorTest()
			closeOpening()
			return nil
		end
		-- O personagem não anda por trás do menu.
		local release = self.movement:hold()
		-- A lista de jogadores e o chat do Roblox ficariam por cima do menu e da tela de personalizar.
		StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.PlayerList, false)
		StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Chat, false)
		-- O Vide lê `source`, não os átomos do Charm: este espelha o átomo da tela.
		local stage = source(screen())
		subscribe(screen, function(value)
			return stage(value)
		end)
		local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")
		local unmount = mount(function()
			return StartScreen({
				stage = stage,
				onContinue = function()
					local data = playerData()
					local saved = decodeSavedLook(data.character)
					if not saved then
						return nil
					end
					look(saved)
					if data.characterName ~= "" then
						characterName(data.characterName)
					end
					Events.setLook:fire(encodeLook(saved))
					if characterName() ~= "" then
						Events.setName:fire(characterName())
					end
					screen("playing")
				end,
				onNewGame = function()
					-- Quem já tem personagem começa a personalizar a partir dele.
					local saved = decodeSavedLook(playerData().character)
					if saved then
						look(saved)
					end
					if playerData().characterName ~= "" and characterName() == "" then
						characterName(playerData().characterName)
					end
					screen("customize")
				end,
				onQuit = function()
					return Players.LocalPlayer:Kick(t("menu.quitMessage"))
				end,
				onCustomized = function(confirmed)
					if not confirmed then
						screen("menu")
						return nil
					end
					Events.setLook:fire(encodeLook(look()))
					if characterName() ~= "" then
						Events.setName:fire(characterName())
					end
					screen("playing")
				end,
			})
		end, playerGui)
		-- A tela de carregar do jogo já está montada: a tela preta da abertura (`ReplicatedFirst`) sai.
		closeOpening()
		subscribe(screen, function(value)
			if value ~= "playing" then
				return nil
			end
			release()
			StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.PlayerList, true)
			StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Chat, true)
			-- Tira a tela depois que o véu termina de abrir e dá as boas-vindas.
			task.delay(OPEN_SECONDS + 0.4, function()
				unmount()
				-- O nome é o que o próprio jogador escreveu: só ele vê esta fala.
				local name = if characterName() ~= "" then characterName() else Players.LocalPlayer.DisplayName
				local keys = {
					name = name,
					up = keyName(Enum.KeyCode.W),
					left = keyName(Enum.KeyCode.A),
					down = keyName(Enum.KeyCode.S),
					right = keyName(Enum.KeyCode.D),
				}
				self.dialogue:say({ {
					name = function()
						return t("dialogue.tip")
					end,
					text = function()
						return t(if lookGender(look()) == 1 then "tip.welcomeGirl" else "tip.welcomeBoy", keys)
					end,
				}, {
					name = function()
						return t("dialogue.tip")
					end,
					text = function()
						return t("tip.obstacles")
					end,
				}, {
					name = function()
						return t("dialogue.tip")
					end,
					text = function()
						return t("tip.actions", {
							key = keyName(Enum.KeyCode.F),
						})
					end,
				} })
			end)
		end)
		-- Folha ainda não enviada fica com o id 0, que não carrega; não adianta pedir.
		local loadable = function(image)
			return image ~= "" and image ~= MISSING_IMAGE
		end
		-- O personagem salvo pode estar em outro estilo de peça (Aeko ou Original) que o visual inicial: as
		-- folhas dele carregam por trás assim que os dados do jogador chegam, para o Continuar já achar prontas.
		local savedPreloaded = false
		local preloadSaved = function()
			local saved = decodeSavedLook(playerData().character)
			if savedPreloaded or not saved then
				return nil
			end
			savedPreloaded = true
			local _exp = figureLayers(saved)
			-- ▼ ReadonlyArray.map ▼
			local _newValue = table.create(#_exp)
			local _callback = function(layer)
				return layer.image
			end
			for _k, _v in _exp do
				_newValue[_k] = _callback(_v, _k - 1, _exp)
			end
			-- ▲ ReadonlyArray.map ▲
			-- ▼ ReadonlyArray.filter ▼
			local _newValue_1 = {}
			local _length = 0
			for _k, _v in _newValue do
				if loadable(_v, _k - 1, _newValue) == true then
					_length += 1
					_newValue_1[_length] = _v
				end
			end
			-- ▲ ReadonlyArray.filter ▲
			local sheets = _newValue_1
			task.spawn(function()
				return ContentProvider:PreloadAsync(sheets)
			end)
		end
		subscribe(playerData, preloadSaved)
		preloadSaved()
		-- A arte do mundo carrega por trás da tela de título; o menu só aparece com tudo pronto.
		local _array = { THEME_ATLASES[settings().theme], LOGO.image, TITLE.image }
		local _length = #_array
		-- ▼ ReadonlyArray.map ▼
		local _newValue = table.create(#TITLE_WATER)
		local _callback = function(strip)
			return strip.image
		end
		for _k, _v in TITLE_WATER do
			_newValue[_k] = _callback(_v, _k - 1, TITLE_WATER)
		end
		-- ▲ ReadonlyArray.map ▲
		local _Length = #_newValue
		table.move(_newValue, 1, _Length, _length + 1, _array)
		_length += _Length
		_array[_length + 1] = Sprites.oak.image
		_array[_length + 2] = GRASS_TILE.image
		local _exp = figureLayers(look())
		-- ▼ ReadonlyArray.map ▼
		local _newValue_1 = table.create(#_exp)
		local _callback_1 = function(layer)
			return layer.image
		end
		for _k, _v in _exp do
			_newValue_1[_k] = _callback_1(_v, _k - 1, _exp)
		end
		-- ▲ ReadonlyArray.map ▲
		local _Length_1 = #_newValue_1
		table.move(_newValue_1, 1, _Length_1, _length + 3, _array)
		_length += _Length_1
		_array[_length + 3] = FACE_SHEET
		_array[_length + 4] = ChatArt.body.image
		local images = _array
		-- ▼ ReadonlyArray.filter ▼
		local _newValue_2 = {}
		local _length_1 = 0
		for _k, _v in images do
			if loadable(_v, _k - 1, images) == true then
				_length_1 += 1
				_newValue_2[_length_1] = _v
			end
		end
		-- ▲ ReadonlyArray.filter ▲
		ContentProvider:PreloadAsync(_newValue_2)
		screen("menu")
		-- Com o menu à mostra, as folhas do mapa de nascer carregam por trás (o mapa já está montado, atrás do menu):
		-- quando o véu abre, o chão já está pronto (fase 1 do `PLANO_OTIMIZACAO.md`, item 7).
		task.spawn(function()
			local _exp_1 = self.scene:mapImages()
			-- ▼ ReadonlyArray.filter ▼
			local _newValue_3 = {}
			local _length_2 = 0
			for _k, _v in _exp_1 do
				if loadable(_v, _k - 1, _exp_1) == true then
					_length_2 += 1
					_newValue_3[_length_2] = _v
				end
			end
			-- ▲ ReadonlyArray.filter ▲
			return ContentProvider:PreloadAsync(_newValue_3)
		end)
	end
	function StartController:startInteriorTest()
		local dressed = false
		local dress = function()
			local saved = decodeSavedLook(playerData().character)
			if dressed or not saved then
				return nil
			end
			dressed = true
			look(saved)
			Events.setLook:fire(encodeLook(saved))
		end
		subscribe(playerData, dress)
		dress()
		screen("playing")
	end
	do
		-- (Flamework) StartController metadata
		Reflect.defineMetadata(StartController, "identifier", "client/controllers/StartController@StartController")
		Reflect.defineMetadata(StartController, "flamework:parameters", { "client/controllers/MovementController@MovementController", "client/controllers/DialogueController@DialogueController", "client/controllers/SceneController@SceneController" })
		Reflect.defineMetadata(StartController, "flamework:implements", { "$:flamework@OnStart" })
	end
end
-- (Flamework) StartController decorators
Reflect.decorate(StartController, "$:flamework@Controller", Controller, {})
return {
	StartController = StartController,
}
