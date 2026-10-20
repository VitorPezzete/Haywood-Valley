-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local Reflect = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Reflect
local Controller = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Controller
local _services = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services")
local RunService = _services.RunService
local Workspace = _services.Workspace
local gameHour = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "clock").gameHour
local _sounds = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "sounds")
local MUSIC_END_FADE = _sounds.MUSIC_END_FADE
local MUSIC_PERIOD_FADE = _sounds.MUSIC_PERIOD_FADE
local MUSIC_PLACES = _sounds.MUSIC_PLACES
local MUSIC_REST = _sounds.MUSIC_REST
local MUSIC_SWITCH_FADE = _sounds.MUSIC_SWITCH_FADE
local MUSIC_TRACKS = _sounds.MUSIC_TRACKS
local periodOf = _sounds.periodOf
local VEIL_FADE_IN = _sounds.VEIL_FADE_IN
local VEIL_FADE_OUT = _sounds.VEIL_FADE_OUT
local _perf = TS.import(script, script.Parent.Parent, "perf")
local perfBegin = _perf.perfBegin
local perfEnd = _perf.perfEnd
local screen = TS.import(script, script.Parent.Parent, "state", "screen").screen
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
--* Uma faixa tocando: o volume anda de `level` até `target` em `fade` segundos. 
--[[
	*
	 * O diretor de música (página "Plano de som e música" do Notion, seção 1), no grupo "Music" das Configurações:
	 *
	 * - **Telas** (título, personalizar): laço contínuo.
	 * - **Lugares** (a `musica` da zona ou do mapa, `SoundController.placeProps`): respira. Toca uma faixa inteira, some
	 *   nos últimos `MUSIC_END_FADE` segundos, fica de 60 a 180 s só com o ambiente (sorteado) e volta.
	 * - **Hora**: a versão de cada período (manhã, dia, tarde, noite) é escolhida ao começar a faixa; no meio dela, a
	 *   troca de período é um fade de `MUSIC_PERIOD_FADE` segundos para a versão nova (ou para o silêncio, se o período
	 *   não tem música, como a noite da ilha).
	 * - **Porta**: a música some com o véu da viagem e volta em 2 s ao clarear; se o lugar novo tem a mesma faixa, ela
	 *   continua de onde estava.
	 *
	 * Faixa sem id não toca, e o Output avisa uma vez.
	 
]]
local MusicController
do
	MusicController = setmetatable({}, {
		__tostring = function()
			return "MusicController"
		end,
	})
	MusicController.__index = MusicController
	function MusicController.new(...)
		local self = setmetatable({}, MusicController)
		return self:constructor(...) or self
	end
	function MusicController:constructor(settingsController, sound, map)
		self.settingsController = settingsController
		self.sound = sound
		self.map = map
		self.leaving = {}
		self.restUntil = 0
		self.nextFade = MUSIC_SWITCH_FADE
		self.veil = 1
		self.veilTarget = 1
		self.random = Random.new()
	end
	function MusicController:onStart()
		self.group = self.settingsController:group("music")
		self.folder = Instance.new("Folder")
		self.folder.Name = "Music"
		self.folder.Parent = Workspace
		self.map:onVeil(function(closing)
			self.veilTarget = if closing then 0 else 1
			return self.veilTarget
		end)
		-- A música anda a cada `TICK_SECONDS` (os fades são de segundos), não a cada quadro.
		local pending = 0
		RunService.Heartbeat:Connect(function(dt)
			pending += dt
			if pending < TICK_SECONDS then
				return nil
			end
			local started = perfBegin("Som")
			self:update(pending)
			pending = 0
			perfEnd("Som", started)
		end)
	end
	function MusicController:wantedPlace()
		local now = screen()
		if now == "loading" or now == "menu" then
			return "titulo"
		end
		if now == "customize" then
			return "personalizar"
		end
		return self.sound:placeProps().musica
	end
	function MusicController:update(dt)
		local now = os.clock()
		self.veil = self:approach(self.veil, self.veilTarget, dt / (if self.veilTarget < self.veil then VEIL_FADE_OUT else VEIL_FADE_IN))
		local placeKey = self:wantedPlace()
		local place
		if placeKey ~= nil then
			place = MUSIC_PLACES[placeKey]
			if not place then
				warnOnce(`place.{placeKey}`, `[Som] música "{placeKey}" desconhecida (MUSIC_PLACES em shared/sounds.ts)`)
			end
		end
		local wanted = if place then place.tracks[periodOf(gameHour())] else nil
		-- Com o véu fechado, a troca é na hora (não se ouve nada); com ele aberto, um fade.
		local hidden = self.veil < 0.05
		if placeKey ~= self.place then
			-- Lugar novo: a mesma faixa continua; outra entra no lugar, e o silêncio de respirar acaba.
			self.place = placeKey
			self.restUntil = 0
			self.nextFade = MUSIC_SWITCH_FADE
			if self.current and self.current.key ~= wanted then
				self:drop(if hidden then 0.1 else MUSIC_SWITCH_FADE)
			end
		elseif self.current and not self.current.leaving and self.current.key ~= wanted then
			-- O período mudou no meio da faixa.
			self:drop(MUSIC_PERIOD_FADE)
			self.nextFade = MUSIC_PERIOD_FADE
			local _result = place
			if _result ~= nil then
				_result = _result.mode
			end
			local _condition = _result == "breathe"
			if _condition then
				_condition = wanted == nil
			end
			if _condition then
				self:rest()
			end
		end
		-- Respira: some no fim da faixa e descansa; acabou, descansa.
		local track = self.current
		local _condition = track
		if _condition then
			local _result = place
			if _result ~= nil then
				_result = _result.mode
			end
			_condition = _result == "breathe"
		end
		if _condition then
			local length = track.sound.TimeLength
			if track.ended or (length > 0 and track.sound.TimePosition >= length - MUSIC_END_FADE) then
				self:drop(MUSIC_END_FADE)
				self:rest()
				self.nextFade = MUSIC_END_FADE
			end
		end
		if not self.current and wanted ~= nil and now >= self.restUntil and place then
			self.current = self:start(wanted, place.mode == "loop", self.nextFade)
		end
		if self.current then
			self:drive(self.current, dt)
		end
		for i = #self.leaving - 1, 0, -1 do
			local old = self.leaving[i + 1]
			self:drive(old, dt)
			if old.level <= 0 or old.ended then
				old.sound:Destroy()
				local _leaving = self.leaving
				local _i = i
				table.remove(_leaving, _i + 1)
			end
		end
	end
	function MusicController:start(key, looped, fade)
		local def = MUSIC_TRACKS[key]
		if not def or def.id == "" then
			warnOnce(`track.{key}`, `[Som] a faixa "{key}" ainda não tem id (musica.* em assets/registro.json): sem música`)
			return nil
		end
		local sound = Instance.new("Sound")
		sound.Name = key
		sound.SoundId = def.id
		sound.Volume = 0
		sound.Looped = looped
		sound.SoundGroup = self.group
		if def.region then
			sound.PlaybackRegionsEnabled = true
			sound.PlaybackRegion = NumberRange.new(def.region[1], def.region[2])
			if def.loop then
				sound.LoopRegion = NumberRange.new(def.loop[1], def.loop[2])
			end
		end
		sound.Parent = self.folder
		local track = {
			key = key,
			sound = sound,
			volume = def.volume,
			level = 0,
			target = 1,
			fade = fade,
			leaving = false,
			ended = false,
		}
		sound.Ended:Once(function()
			track.ended = true
			return track.ended
		end)
		sound:Play()
		return track
	end
	function MusicController:drop(fade)
		local track = self.current
		if not track then
			return nil
		end
		self.current = nil
		track.leaving = true
		track.target = 0
		track.fade = fade
		local _exp = self.leaving
		table.insert(_exp, track)
	end
	function MusicController:rest()
		self.restUntil = os.clock() + self.random:NextNumber(MUSIC_REST[1], MUSIC_REST[2])
	end
	function MusicController:drive(track, dt)
		track.level = self:approach(track.level, track.target, dt / math.max(track.fade, 0.05))
		local volume = track.volume * track.level * self.veil
		if math.abs(track.sound.Volume - volume) > 1e-4 then
			track.sound.Volume = volume
		end
	end
	function MusicController:approach(value, target, step)
		if value < target then
			return math.min(value + step, target)
		end
		if value > target then
			return math.max(value - step, target)
		end
		return value
	end
	do
		-- (Flamework) MusicController metadata
		Reflect.defineMetadata(MusicController, "identifier", "client/controllers/MusicController@MusicController")
		Reflect.defineMetadata(MusicController, "flamework:parameters", { "client/controllers/SettingsController@SettingsController", "client/controllers/SoundController@SoundController", "client/controllers/MapController@MapController" })
		Reflect.defineMetadata(MusicController, "flamework:implements", { "$:flamework@OnStart" })
	end
end
-- (Flamework) MusicController decorators
Reflect.decorate(MusicController, "$:flamework@Controller", Controller, {})
return {
	MusicController = MusicController,
}
