-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local Reflect = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Reflect
local Controller = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Controller
local _services = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services")
local ContentProvider = _services.ContentProvider
local Players = _services.Players
local RunService = _services.RunService
local SoundService = _services.SoundService
local Workspace = _services.Workspace
local gameHour = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "clock").gameHour
local _interiorChoice = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiorChoice")
local cellOfPoint = _interiorChoice.cellOfPoint
local MAP_ATTRIBUTE = _interiorChoice.MAP_ATTRIBUTE
local mapCorner = _interiorChoice.mapCorner
local mapData = _interiorChoice.mapData
local placeOf = _interiorChoice.placeOf
local zoneAt = _interiorChoice.zoneAt
local THROW_SECONDS = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "pieces").THROW_SECONDS
local _sounds = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "sounds")
local AMBIENCE_GROUP = _sounds.AMBIENCE_GROUP
local AMBIENCE_LAYERS = _sounds.AMBIENCE_LAYERS
local AMBIENCE_PERIOD_FADE = _sounds.AMBIENCE_PERIOD_FADE
local AMBIENCE_PROFILES = _sounds.AMBIENCE_PROFILES
local AMBIENCE_ZONE_FADE = _sounds.AMBIENCE_ZONE_FADE
local EFFECT_MAX = _sounds.EFFECT_MAX
local EFFECT_MIN = _sounds.EFFECT_MIN
local EFFECTS = _sounds.EFFECTS
local INTERFACE_GROUP = _sounds.INTERFACE_GROUP
local MAP_SOUND_PROPS = _sounds.MAP_SOUND_PROPS
local MAX_AMBIENT_LOOPS = _sounds.MAX_AMBIENT_LOOPS
local MAX_EFFECT_COPIES = _sounds.MAX_EFFECT_COPIES
local MUFFLE = _sounds.MUFFLE
local OTHER_PLAYER_VOLUME = _sounds.OTHER_PLAYER_VOLUME
local periodOf = _sounds.periodOf
local PLACED = _sounds.PLACED
local SWIM_STROKE_STEPS = _sounds.SWIM_STROKE_STEPS
local UI_SOUNDS = _sounds.UI_SOUNDS
local VEIL_FADE_IN = _sounds.VEIL_FADE_IN
local VEIL_FADE_OUT = _sounds.VEIL_FADE_OUT
local Events = TS.import(script, script.Parent.Parent, "network").Events
local _perf = TS.import(script, script.Parent.Parent, "perf")
local perfBegin = _perf.perfBegin
local perfEnd = _perf.perfEnd
local screen = TS.import(script, script.Parent.Parent, "state", "screen").screen
local settings = TS.import(script, script.Parent.Parent, "state", "settings").settings
local setUiSoundPlayer = TS.import(script, script.Parent.Parent, "uiSound").setUiSoundPlayer
local lightOf = TS.import(script, script.Parent.Parent, "world", "lightTiles").lightOf
local findFixtures = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "fixtures").findFixtures
--* Logo depois de trocar de mapa, os avisos de torneira são o servidor contando como elas estão: sem o clique. 
local TAP_SYNC_SECONDS = 2
--* A cada quanto o mar procura a célula de água mais perto do jogador, em segundos. 
local SEA_SEARCH_SECONDS = 0.25
--* Ao sair da tela do jogo (ou voltar a ela), o ambiente some e volta neste tempo. 
local SCREEN_FADE = 2
--* Os volumes do ambiente andam a cada tanto, em segundos (não a cada quadro): os fades são de segundos. 
local TICK_SECONDS = 0.1
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
--* Um laço de ambiente: de fundo (sem lugar) ou pelo lugar (num `Attachment`). 
--* O que o som lembra de cada boneco à mostra: se nadava e quantos passos deu. 
--[[
	*
	 * O som do mundo, todo no cliente (página "Plano de som e música" do Notion, seção 5): nada de som pela rede, e o
	 * que outro jogador faz (o pote dele quebrando, os passos dele na água) cada cliente toca quando vê acontecer.
	 *
	 * - **Ouvinte**: um Part invisível que segue o pé do personagem, sempre virado para o norte, como a câmera
	 *   (`SoundService:SetListener`). A câmera fica a até 280 studs: com ela de ouvinte, perto e longe soariam igual.
	 * - **Grupos**: `Ambience` e `Interface` dentro do `Effects` das Configurações (o `SettingsController` cria
	 *   `Music` e `Effects`).
	 * - **Ambiente de fundo**: pássaros, grilos, vento e mar distante, pela propriedade `ambiente` da zona (ou do
	 *   mapa, `MAP_SOUND_PROPS`) e pelo período do dia (`gameHour`), com troca suave. Dentro de casa, o de fora fica
	 *   baixo e abafado (`EqualizerSoundEffect` sem os agudos).
	 * - **Pelo lugar** (`LinearSquare`): a lareira, a torneira aberta e o mar ao longo da costa (um som só, que vai à
	 *   célula de água mais perto). A lareira e a torneira só se ouvem na zona delas. Fora do alcance, em pausa.
	 * - **Limites**: até `MAX_AMBIENT_LOOPS` laços audíveis (os mais altos) e `MAX_EFFECT_COPIES` cópias do mesmo efeito.
	 * - **Efeitos**: a porta no começo do véu da viagem, o pote quebrando, o respingo e a braçada na água funda, o passo
	 *   na água rasa, a torneira abrindo e fechando, e os passos em seco (ainda sem id).
	 *
	 * Som sem id não toca, e o Output avisa uma vez. A música é do `MusicController`.
	 
]]
local SoundController
do
	SoundController = setmetatable({}, {
		__tostring = function()
			return "SoundController"
		end,
	})
	SoundController.__index = SoundController
	function SoundController.new(...)
		local self = setmetatable({}, SoundController)
		return self:constructor(...) or self
	end
	function SoundController:constructor(settingsController, scene, map, characters, actions)
		self.settingsController = settingsController
		self.scene = scene
		self.map = map
		self.characters = characters
		self.actions = actions
		self.background = {}
		self.placed = {}
		self.water = {}
		self.seaSearchAt = 0
		self.closedTaps = {}
		self.stovesOn = {}
		self.mapChangedAt = 0
		self.copies = {}
		self.walkers = {}
		self.places = {}
		self.random = Random.new()
		self.veil = 1
		self.veilTarget = 1
		self.screenGain = 0
		self.muffled = 0
		self.lastProfile = ""
		self.pending = 0
		self.audible = {}
		self.kept = {}
		self.props = {
			ambiente = "exterior",
		}
		self.propsReady = false
	end
	function SoundController:onStart()
		self.folder = Instance.new("Folder")
		self.folder.Name = "Sound"
		self.folder.Parent = Workspace
		self.host = self:makePart("SoundEmitters")
		self.listener = self:makePart("SoundListener")
		SoundService:SetListener(Enum.ListenerType.ObjectCFrame, self.listener)
		self.effectsGroup = self.settingsController:group("effects")
		self.ambienceGroup = self:childGroup(AMBIENCE_GROUP)
		self.interfaceGroup = self:childGroup(INTERFACE_GROUP)
		for name, def in pairs(AMBIENCE_LAYERS) do
			if def.id == "" then
				continue
			end
			local sound = self:makeSound(`Ambience_{name}`, def, self.folder, self.ambienceGroup)
			sound.Looped = true
			local muffle = Instance.new("EqualizerSoundEffect")
			muffle.LowGain = 0
			muffle.MidGain = 0
			muffle.HighGain = 0
			muffle.Parent = sound
			local _background = self.background
			local _arg1 = {
				name = name,
				sound = sound,
				def = def,
				target = 0,
				level = 0,
				fade = AMBIENCE_ZONE_FADE,
				aim = 0,
				span = 1,
				heard = 0,
				started = false,
				muffle = muffle,
			}
			_background[name] = _arg1
		end
		setUiSoundPlayer(function(name)
			return self:ui(name)
		end)
		self:preload()
		self.mapChangedAt = os.clock()
		self:buildPlaced()
		self.scene:onMapChanged(function()
			self.mapChangedAt = os.clock()
			table.clear(self.walkers)
			self:buildPlaced()
		end)
		self.map:onVeil(function(closing, exit)
			if closing and exit then
				self:play("porta")
			end
			self.veilTarget = if closing then 0 else 1
		end)
		self.characters:onActorFrame(function(player, at, pose, moving, stepped)
			return self:actorFrame(player, at, pose, moving, stepped)
		end)
		local here = function(map)
			return map == self.scene.mapKey
		end
		Events.tapChanged:connect(function(map, x, y, open)
			if not here(map) or not self.scene.map then
				return nil
			end
			local key = self.scene.map:key(x, y)
			if open == not (self.closedTaps[key] ~= nil) then
				return nil
			end
			if open then
				self.closedTaps[key] = nil
			else
				self.closedTaps[key] = true
			end
			if os.clock() - self.mapChangedAt < TAP_SYNC_SECONDS or not self.scene.interior then
				return nil
			end
			self:play(if open then "torneiraAbre" else "torneiraFecha", self.scene.interior:cellCenter(x, y))
		end)
		-- O baú abrindo e fechando e o fogão acendendo, onde mudou; o fogão aceso soa enquanto estiver aceso.
		self.actions:onFixture(function(id, on, cells)
			local stove = string.sub(id, 1, 6) == "stove@"
			if stove then
				if on then
					local _stovesOn = self.stovesOn
					local _id = id
					_stovesOn[_id] = true
				else
					local _stovesOn = self.stovesOn
					local _id = id
					_stovesOn[_id] = nil
				end
			end
			local interior = self.scene.interior
			if #cells == 0 or not interior or os.clock() - self.mapChangedAt < TAP_SYNC_SECONDS then
				return nil
			end
			local at = interior:cellCenter(cells[1][1], cells[1][2])
			if stove then
				if on then
					self:play("fogaoAcende", at)
				end
				return nil
			end
			local fixtures = self.actions:currentFixtures()
			local _fixture = fixtures
			if _fixture ~= nil then
				_fixture = _fixture:fixture(id)
			end
			local fixture = _fixture
			local _result
			if fixture then
				_result = fixtures:isOn(fixture)
			else
				local _result_1 = fixtures
				if _result_1 ~= nil then
					_result_1 = _result_1:pieceOpen(id)
				end
				local _condition = _result_1
				if _condition == nil then
					_condition = on
				end
				_result = _condition
			end
			local open = _result
			self:play(if open then "bauAbre" else "bauFecha", at)
		end)
		Events.pieceThrown:connect(function(map, _id, holder, x, y, mode)
			if not here(map) or mode ~= 3 then
				return nil
			end
			-- Quebra ao cair, no fim do voo (`PieceView.fly`).
			task.delay(THROW_SECONDS, function()
				if not here(map) or not self.scene.interior then
					return nil
				end
				local scale = if holder == Players.LocalPlayer.UserId then 1 else OTHER_PLAYER_VOLUME
				self:play("poteQuebra", self.scene.interior:cellCenter(x, y), scale)
			end)
		end)
		Players.PlayerAdded:Connect(function(player)
			return self:watchPlace(player)
		end)
		Players.PlayerRemoving:Connect(function(player)
			local _walkers = self.walkers
			local _player = player
			_walkers[_player] = nil
			local _places = self.places
			local _player_1 = player
			_places[_player_1] = nil
		end)
		for _, player in Players:GetPlayers() do
			self:watchPlace(player)
		end
		RunService.Heartbeat:Connect(function(dt)
			local started = perfBegin("Som")
			self:update(dt)
			perfEnd("Som", started)
		end)
	end
	function SoundController:placeProps()
		local id = self.scene.mapId
		local zone = self.map.zone()
		if self.propsReady and zone == self.propsZone and id == self.propsMap then
			return self.props
		end
		self.propsReady = true
		self.propsZone = zone
		self.propsMap = id
		local base = if id ~= nil then MAP_SOUND_PROPS[id] else nil
		local data = mapData(id)
		local fallback = if data and data.terrain == nil then "casa" else "exterior"
		local _object = {}
		local _left = "ambiente"
		local _result = zone
		if _result ~= nil then
			_result = _result.props.ambiente
		end
		local _condition = _result
		if _condition == nil then
			local _result_1 = base
			if _result_1 ~= nil then
				_result_1 = _result_1.ambiente
			end
			_condition = _result_1
			if _condition == nil then
				_condition = fallback
			end
		end
		_object[_left] = _condition
		local _left_1 = "musica"
		local _result_1 = zone
		if _result_1 ~= nil then
			_result_1 = _result_1.props.musica
		end
		local _condition_1 = _result_1
		if _condition_1 == nil then
			local _result_2 = base
			if _result_2 ~= nil then
				_result_2 = _result_2.musica
			end
			_condition_1 = _result_2
		end
		_object[_left_1] = _condition_1
		self.props = _object
		return self.props
	end
	function SoundController:play(name, at, scale)
		if scale == nil then
			scale = 1
		end
		local variants = EFFECTS[name]
		local def = variants[self.random:NextInteger(0, #variants - 1) + 1]
		self:fire(`effect.{name}`, def, self.effectsGroup, at, scale)
	end
	function SoundController:ui(name)
		local def = UI_SOUNDS[settings().theme][name]
		self:fire(`ui.{settings().theme}.{name}`, def, self.interfaceGroup)
	end
	function SoundController:fire(key, def, group, at, scale)
		if scale == nil then
			scale = 1
		end
		if def.id == "" then
			warnOnce(key, `[Som] "{key}" ainda não tem id (som.* em assets/registro.json): fica mudo`)
			return nil
		end
		-- No máximo `MAX_EFFECT_COPIES` cópias: a mais velha para.
		local _copies = self.copies
		local _key = key
		local _condition = _copies[_key]
		if _condition == nil then
			_condition = {}
		end
		local copies = _condition
		local _copies_1 = self.copies
		local _key_1 = key
		_copies_1[_key_1] = copies
		while #copies >= MAX_EFFECT_COPIES do
			local oldest = table.remove(copies, 1)
			local _result = oldest.Parent
			if _result ~= nil then
				_result = _result:IsA("Attachment")
			end
			(if _result then oldest.Parent else oldest):Destroy()
		end
		local parent = self.folder
		local holder
		if at then
			local attachment = Instance.new("Attachment")
			attachment.Name = key
			attachment.Position = Vector3.new(at.X, 0, at.Z)
			attachment.Parent = self.host
			parent = attachment
			holder = attachment
		end
		local sound = self:makeSound(key, def, parent, group)
		sound.Volume = def.volume * scale
		if def.pitch ~= nil then
			sound.PlaybackSpeed = 1 + self.random:NextNumber(-def.pitch, def.pitch)
		end
		if at then
			sound.RollOffMode = Enum.RollOffMode.LinearSquare
			sound.RollOffMinDistance = EFFECT_MIN
			sound.RollOffMaxDistance = EFFECT_MAX
		end
		table.insert(copies, sound)
		local done = function()
			local index = (table.find(copies, sound) or 0) - 1
			if index >= 0 then
				table.remove(copies, index + 1)
			end
			(holder or sound):Destroy()
		end
		sound.Ended:Once(done)
		-- Garantia, caso o `Ended` não venha (som que não carregou).
		local length = if def.region then def.region[2] - def.region[1] else 8
		task.delay(length / sound.PlaybackSpeed + 2, function()
			if sound.Parent then
				done()
			end
		end)
		sound:Play()
	end
	function SoundController:makePart(name)
		local part = Instance.new("Part")
		part.Name = name
		part.Anchored = true
		part.CanCollide = false
		part.CanQuery = false
		part.CanTouch = false
		part.Transparency = 1
		part.Size = Vector3.new(0.2, 0.2, 0.2)
		part.CFrame = CFrame.new()
		part.Parent = self.folder
		return part
	end
	function SoundController:childGroup(name)
		local group = Instance.new("SoundGroup")
		group.Name = name
		group.Volume = 1
		group.Parent = self.effectsGroup
		return group
	end
	function SoundController:makeSound(name, def, parent, group)
		local sound = Instance.new("Sound")
		sound.Name = name
		sound.SoundId = def.id
		sound.Volume = 0
		sound.SoundGroup = group
		if def.region or def.loop then
			sound.PlaybackRegionsEnabled = true
			if def.region then
				sound.PlaybackRegion = NumberRange.new(def.region[1], def.region[2])
			end
			if def.loop then
				sound.LoopRegion = NumberRange.new(def.loop[1], def.loop[2])
			end
		end
		sound.Parent = parent
		return sound
	end
	function SoundController:preload()
		local ids = {}
		for _, def in pairs(AMBIENCE_LAYERS) do
			if def.id ~= "" then
				local _id = def.id
				ids[_id] = true
			end
		end
		for _, def in pairs(PLACED) do
			if def.id ~= "" then
				local _id = def.id
				ids[_id] = true
			end
		end
		for _, variants in pairs(EFFECTS) do
			for _1, def in variants do
				if def.id ~= "" then
					local _id = def.id
					ids[_id] = true
				end
			end
		end
		-- Pelo `Sound`, não pelo texto do id: com o texto, o `PreloadAsync` pede uma imagem e o Output enche de "Asset
		-- type does not match requested type" (visto no Studio em 2026-10-19).
		local list = {}
		for id in ids do
			local sound = Instance.new("Sound")
			sound.SoundId = id
			table.insert(list, sound)
		end
		task.spawn(function()
			ContentProvider:PreloadAsync(list)
			for _, sound in list do
				sound:Destroy()
			end
		end)
	end
	function SoundController:buildPlaced()
		for _, loop in self.placed do
			local _result = loop.placed
			if _result ~= nil then
				_result = _result.attachment:Destroy()
			end
		end
		table.clear(self.placed)
		self.sea = nil
		table.clear(self.water)
		table.clear(self.closedTaps)
		table.clear(self.stovesOn)
		local interior = self.scene.interior
		local data = mapData(self.scene.mapId)
		if not interior or not data then
			return nil
		end
		local _binding = interior.area
		local ax = _binding.x
		local ay = _binding.y
		local width = _binding.width
		local height = _binding.height
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
						-- O fogo de cada lareira, onde as luzes põem o halo dela (`LIGHT_TILES`).
						local _condition = tile
						if _condition then
							local _result = lightOf(tile)
							if _result ~= nil then
								_result = _result.kind
							end
							_condition = _result == "lareira"
						end
						if _condition then
							self:addPlaced("lareira", interior:cellCenter(x, y), zoneAt(data, x, y))
						end
					end
				end
			end
		end
		local map = self.scene.map
		if map then
			for _, _binding_1 in map.taps do
				local x = _binding_1[1]
				local y = _binding_1[2]
				local loop = self:addPlaced("torneira", interior:cellCenter(x, y), zoneAt(data, x, y))
				local _result = loop
				if _result ~= nil then
					_result = _result.placed
				end
				if _result then
					loop.placed.tap = map:key(x, y)
				end
			end
		end
		-- Os fogões, no meio de cada um; soam só acesos.
		if map then
			for _, fixture in findFixtures(map) do
				if fixture.kind ~= "stove" then
					continue
				end
				if fixture.startsOn then
					local _stovesOn = self.stovesOn
					local _id = fixture.id
					_stovesOn[_id] = true
				end
				local loop = self:addPlaced("fogao", interior:cellCenter(fixture.x + 1, fixture.y + fixture.h - 1), zoneAt(data, fixture.x + 1, fixture.y))
				local _result = loop
				if _result ~= nil then
					_result = _result.placed
				end
				if _result then
					loop.placed.stove = fixture.id
				end
			end
		end
		-- O mar do exterior: o mar fundo e a água rasa do terreno (não a água da banheira).
		if data.terrain then
			do
				local j = 0
				local _shouldIncrement = false
				while true do
					if _shouldIncrement then
						j += 1
					else
						_shouldIncrement = true
					end
					if not (j < data.height) then
						break
					end
					local row = data.actions[j + 1]
					do
						local i = 0
						local _shouldIncrement_1 = false
						while true do
							if _shouldIncrement_1 then
								i += 1
							else
								_shouldIncrement_1 = true
							end
							if not (i < data.width) then
								break
							end
							local _arg0 = i + 1
							local _arg1 = i + 1
							local code = string.sub(row, _arg0, _arg1)
							if code == "~" or code == "6" then
								local _water = self.water
								local _arg0_1 = interior:cellCenter(data.x + i, data.y + j)
								table.insert(_water, _arg0_1)
							end
						end
					end
				end
			end
			if #self.water > 0 then
				self.sea = self:addPlaced("mar", self.water[1], nil)
			end
		end
		self.seaSearchAt = 0
	end
	function SoundController:addPlaced(name, at, zone)
		local def = PLACED[name]
		if def.id == "" then
			warnOnce(`placed.{name}`, `[Som] o som "{name}" pelo lugar ainda não tem id (som.* em assets/registro.json): fica mudo`)
			return nil
		end
		local attachment = Instance.new("Attachment")
		attachment.Name = name
		attachment.Position = Vector3.new(at.X, 0, at.Z)
		attachment.Parent = self.host
		local sound = self:makeSound(name, def, attachment, self.ambienceGroup)
		sound.Looped = true
		sound.RollOffMode = Enum.RollOffMode.LinearSquare
		sound.RollOffMinDistance = def.min
		sound.RollOffMaxDistance = def.max
		local loop = {
			name = name,
			sound = sound,
			def = def,
			target = 0,
			level = 0,
			fade = AMBIENCE_ZONE_FADE,
			aim = 0,
			span = 1,
			heard = 0,
			started = false,
			placed = {
				def = def,
				attachment = attachment,
				zone = zone,
			},
		}
		local _exp = self.placed
		table.insert(_exp, loop)
		return loop
	end
	function SoundController:update(frameDt)
		-- O ouvinte vai ao pé do personagem, no chão, virado para o norte (−Z), como a câmera.
		local _root = Players.LocalPlayer.Character
		if _root ~= nil then
			_root = _root:FindFirstChild("HumanoidRootPart")
		end
		local root = _root
		local _result = root
		if _result ~= nil then
			_result = _result:IsA("BasePart")
		end
		local ear = if _result then Vector3.new(root.Position.X, 0, root.Position.Z) else self.listener.Position
		if ear ~= self.listener.Position then
			self.listener.CFrame = CFrame.new(ear)
		end
		self.pending += frameDt
		if self.pending < TICK_SECONDS then
			return nil
		end
		local dt = self.pending
		self.pending = 0
		-- O véu da porta e a tela do jogo.
		local veilStep = dt / (if self.veilTarget < self.veil then VEIL_FADE_OUT else VEIL_FADE_IN)
		self.veil = self:approach(self.veil, self.veilTarget, veilStep)
		local playing = screen() == "playing"
		self.screenGain = self:approach(self.screenGain, if playing then 1 else 0, dt / SCREEN_FADE)
		local gain = self.veil * self.screenGain
		-- O ambiente de fundo pela zona e pela hora.
		local props = self:placeProps()
		local profile = AMBIENCE_PROFILES[props.ambiente]
		if not profile then
			warnOnce(`profile.{props.ambiente}`, `[Som] ambiente "{props.ambiente}" desconhecido (AMBIENCE_PROFILES em shared/sounds.ts): vale o "exterior"`)
			profile = AMBIENCE_PROFILES.exterior
		end
		local period = periodOf(gameHour())
		local fade = if period ~= self.lastPeriod and self.lastProfile == props.ambiente then AMBIENCE_PERIOD_FADE else AMBIENCE_ZONE_FADE
		if props.ambiente ~= self.lastProfile or period ~= self.lastPeriod then
			local levels = profile.levels[period]
			for name in pairs(AMBIENCE_LAYERS) do
				local _condition = levels[name]
				if _condition == nil then
					_condition = 0
				end
				local level = _condition
				local loop = self.background[name]
				if not loop then
					if level > 0 then
						warnOnce(`layer.{name}`, `[Som] a camada de ambiente "{name}" ainda não tem id (som.* em assets/registro.json): fica muda`)
					end
					continue
				end
				loop.target = level
				loop.fade = fade
			end
			self.lastProfile = props.ambiente
			self.lastPeriod = period
		end
		for _, loop in self.background do
			loop.heard = loop.def.volume * loop.target
		end
		self.muffled = self:approach(self.muffled, if profile.muffled then 1 else 0, dt / AMBIENCE_ZONE_FADE)
		-- O mar vai à célula de água mais perto do ouvinte (na água, a do próprio jogador).
		local now = os.clock()
		if self.sea and now >= self.seaSearchAt then
			self.seaSearchAt = now + SEA_SEARCH_SECONDS
			local best = self.water[1]
			local bestDistance = math.huge
			for _, point in self.water do
				local dx = point.X - ear.X
				local dz = point.Z - ear.Z
				local distance = dx * dx + dz * dz
				if distance < bestDistance then
					best = point
					bestDistance = distance
				end
			end
			local attachment = self.sea.placed.attachment
			if attachment.Position ~= best then
				attachment.Position = best
			end
		end
		-- Os sons pelo lugar: presos à zona, só a torneira aberta, e a queda pela distância (`LinearSquare`).
		local zone = self.map.zone()
		for _, loop in self.placed do
			local placed = loop.placed
			local def = placed.def
			local target = 1
			if def.zoneBound and placed.zone ~= zone then
				target = 0
			end
			local _condition = placed.tap ~= nil
			if _condition then
				local _closedTaps = self.closedTaps
				local _tap = placed.tap
				_condition = _closedTaps[_tap] ~= nil
			end
			if _condition then
				target = 0
			end
			local _condition_1 = placed.stove ~= nil
			if _condition_1 then
				local _stovesOn = self.stovesOn
				local _stove = placed.stove
				_condition_1 = not (_stovesOn[_stove] ~= nil)
			end
			if _condition_1 then
				target = 0
			end
			local distance = (placed.attachment.Position - ear).Magnitude
			local falloff = if distance <= def.min then 1 elseif distance >= def.max then 0 else (1 - (distance - def.min) / (def.max - def.min)) ^ 2
			loop.target = target
			loop.fade = AMBIENCE_ZONE_FADE
			loop.heard = def.volume * target * falloff
		end
		-- No máximo `MAX_AMBIENT_LOOPS` laços: ficam os que mais se ouvem.
		local audible = self.audible
		table.clear(audible)
		for _, loop in self.background do
			if loop.heard > 0 then
				table.insert(audible, loop)
			end
		end
		for _, loop in self.placed do
			if loop.heard > 0 then
				table.insert(audible, loop)
			end
		end
		table.sort(audible, function(a, b)
			return a.heard > b.heard
		end)
		local kept = self.kept
		table.clear(kept)
		do
			local i = 0
			local _shouldIncrement = false
			while true do
				if _shouldIncrement then
					i += 1
				else
					_shouldIncrement = true
				end
				if not (i < math.min(#audible, MAX_AMBIENT_LOOPS)) then
					break
				end
				local _arg0 = audible[i + 1]
				kept[_arg0] = true
			end
		end
		for _, loop in self.background do
			self:drive(loop, if kept[loop] ~= nil then loop.target else 0, gain, dt)
		end
		for _, loop in self.placed do
			-- Fora do alcance, nada a esperar: em pausa na hora.
			if loop.heard <= 0 and loop.target > 0 then
				loop.level = 0
			end
			self:drive(loop, if kept[loop] ~= nil then loop.target else 0, gain, dt)
		end
	end
	function SoundController:drive(loop, target, gain, dt)
		if target ~= loop.aim then
			loop.aim = target
			loop.span = math.max(math.abs(target - loop.level), 0.01)
		end
		loop.level = self:approach(loop.level, target, (dt / loop.fade) * loop.span)
		local volume = loop.def.volume * loop.level * gain
		if math.abs(loop.sound.Volume - volume) > 1e-4 then
			loop.sound.Volume = volume
		end
		if loop.muffle then
			local m = self.muffled
			loop.muffle.LowGain = MUFFLE.low * m
			loop.muffle.MidGain = MUFFLE.mid * m
			loop.muffle.HighGain = MUFFLE.high * m
		end
		local audible = volume > 1e-3
		if audible and not loop.sound.IsPlaying then
			if loop.started then
				loop.sound:Resume()
			else
				loop.started = true
				loop.sound:Play()
			end
		elseif not audible and loop.level <= 0 and loop.sound.IsPlaying then
			loop.sound:Pause()
		end
	end
	function SoundController:approach(value, target, step)
		if value < target then
			return math.min(value + step, target)
		end
		if value > target then
			return math.max(value - step, target)
		end
		return value
	end
	function SoundController:actorFrame(player, at, pose, moving, stepped)
		local scale = if player == Players.LocalPlayer then 1 else OTHER_PLAYER_VOLUME
		local _walkers = self.walkers
		local _player = player
		local walker = _walkers[_player]
		if not walker then
			-- Quem aparece já nadando não respinga.
			walker = {
				swim = pose.swim,
				steps = 0,
			}
			local _walkers_1 = self.walkers
			local _player_1 = player
			local _walker = walker
			_walkers_1[_player_1] = _walker
		end
		if pose.swim ~= walker.swim then
			walker.swim = pose.swim
			self:play(if pose.swim then "respingo" else "passoAgua", at, scale)
			return nil
		end
		if not moving or not stepped then
			return nil
		end
		walker.steps += 1
		if pose.swim then
			if walker.steps % SWIM_STROKE_STEPS == 0 then
				self:play("nadar", at, scale)
			end
		elseif pose.wade then
			self:play("passoAgua", at, scale)
		else
			self:play(self:surfaceAt(at), at, scale)
		end
	end
	function SoundController:surfaceAt(at)
		local map = self.scene.map
		local id = self.scene.mapId
		if not map or id == nil then
			return "passoGrama"
		end
		local _binding = cellOfPoint(mapCorner(id, self.scene.mapSlot), at)
		local x = _binding[1]
		local y = _binding[2]
		local tile = map:ground(x, y)
		if not tile then
			return "passoGrama"
		end
		return if tile[1] == "castelo" then "passoPedra" else "passoTabua"
	end
	function SoundController:watchPlace(player)
		if player == Players.LocalPlayer then
			return nil
		end
		local _places = self.places
		local _exp = player
		local _result = placeOf(player)
		if _result ~= nil then
			_result = _result.key
		end
		_places[_exp] = _result
		player:GetAttributeChangedSignal(MAP_ATTRIBUTE):Connect(function()
			return task.defer(function()
				local _places_1 = self.places
				local _player = player
				local before = _places_1[_player]
				local _after = placeOf(player)
				if _after ~= nil then
					_after = _after.key
				end
				local after = _after
				local _places_2 = self.places
				local _player_1 = player
				_places_2[_player_1] = after
				if before == after then
					return nil
				end
				local mine = self.scene.mapKey
				local where = function()
					local _root = player.Character
					if _root ~= nil then
						_root = _root:FindFirstChild("HumanoidRootPart")
					end
					local root = _root
					local _result_1 = root
					if _result_1 ~= nil then
						_result_1 = _result_1:IsA("BasePart")
					end
					return if _result_1 then root.Position else nil
				end
				if before == mine then
					local at = where()
					if at then
						self:play("porta", at, OTHER_PLAYER_VOLUME)
					end
				elseif after == mine then
					-- O servidor leva o personagem à chegada logo depois de gravar o mapa.
					task.delay(0.3, function()
						local at = where()
						local _condition = at
						if _condition then
							local _result_1 = placeOf(player)
							if _result_1 ~= nil then
								_result_1 = _result_1.key
							end
							_condition = _result_1 == self.scene.mapKey
						end
						if _condition then
							self:play("porta", at, OTHER_PLAYER_VOLUME)
						end
					end)
				end
			end)
		end)
	end
	do
		-- (Flamework) SoundController metadata
		Reflect.defineMetadata(SoundController, "identifier", "client/controllers/SoundController@SoundController")
		Reflect.defineMetadata(SoundController, "flamework:parameters", { "client/controllers/SettingsController@SettingsController", "client/controllers/SceneController@SceneController", "client/controllers/MapController@MapController", "client/controllers/CharacterController@CharacterController", "client/controllers/ActionController@ActionController" })
		Reflect.defineMetadata(SoundController, "flamework:implements", { "$:flamework@OnStart" })
	end
end
-- (Flamework) SoundController decorators
Reflect.decorate(SoundController, "$:flamework@Controller", Controller, {})
return {
	SoundController = SoundController,
}
