-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local Reflect = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Reflect
local Controller = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Controller
local Workspace = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services").Workspace
local _clock = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "clock")
local CLOCK_OFFSET_ATTRIBUTE = _clock.CLOCK_OFFSET_ATTRIBUTE
local gameHour = _clock.gameHour
local HOUR_TEST_ATTRIBUTE = _clock.HOUR_TEST_ATTRIBUTE
local _decor = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "decor")
local decorTile = _decor.decorTile
local decorVariant = _decor.decorVariant
local daylightAt = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "daylight").daylightAt
local _perf = TS.import(script, script.Parent.Parent, "perf")
local perfBegin = _perf.perfBegin
local perfEnd = _perf.perfEnd
local TILE_ANIMATION_FPS = TS.import(script, script.Parent.Parent, "world", "interior").TILE_ANIMATION_FPS
local buildLights = TS.import(script, script.Parent.Parent, "world", "lights").buildLights
local _tint = TS.import(script, script.Parent.Parent, "world", "tint")
local dayTone = _tint.dayTone
local setTone = _tint.setTone
local tintedCount = _tint.tintedCount
local tintStats = _tint.tintStats
local watchTint = _tint.watchTint
--* Depois de quantos segundos de jogo o Output mostra o custo do tom e das luzes. 
local REPORT_AFTER = 8
--[[
	*
	 * De quanto em quanto tempo a hora é lida de novo, em segundos: num dia de 10 minutos a hora anda devagar, e o
	 * tom só troca a cada 0,25 s (`tint.ts`). Os halos que tremem trocam de quadro no ritmo dos tiles animados, então
	 * a hora também é lida quando esse quadro muda (seção 5.1 do `PLANO_OTIMIZACAO.md`).
	 
]]
local DAY_EVERY = 0.25
--[[
	*
	 * O dia e a noite no mundo: a cada quadro lê a hora (`shared/clock.ts`), tinge tudo o que é desenhado na
	 * pasta `World` com o tom da hora (`client/world/tint.ts`), troca as janelas do interior pela versão de noite
	 * e acerta a força dos halos (`client/world/lights.ts`). A interface fica de fora.
	 
]]
local DaylightController
do
	DaylightController = setmetatable({}, {
		__tostring = function()
			return "DaylightController"
		end,
	})
	DaylightController.__index = DaylightController
	function DaylightController.new(...)
		local self = setmetatable({}, DaylightController)
		return self:constructor(...) or self
	end
	function DaylightController:constructor(scene, actions)
		self.scene = scene
		self.actions = actions
		self.started = 0
		self.reported = false
		self.lastName = ""
		self.lastApply = -math.huge
		self.lastTick = -1
		self.lightSerial = 0
		self.seenLights = -1
	end
	function DaylightController:onStart()
		self.started = os.clock()
		watchTint(self.scene.world)
		if self.scene.interior then
			self.lights = buildLights(self.scene.interior)
		end
		self:addExtras()
		-- Outro mapa: as luzes dele, e as janelas e os halos já na hora de agora.
		self.scene:onMapChanged(function()
			self.lightSerial += 1
			local _result = self.lights
			if _result ~= nil then
				_result:destroy()
			end
			self.lights = if self.scene.interior then buildLights(self.scene.interior) else nil
			self:addExtras()
			self:apply(true)
		end)
		-- As peças postas no Decorar (a tocha, a luminária, a janela) e o fogão aceso acendem como os tiles do mapa.
		self.actions:onDecor(function(key, state)
			return self:setDecorLights(key, state)
		end)
		self.actions:onFixture(function(id, _on, cells)
			local _result = self.lights
			if _result ~= nil then
				_result:setExtra(`fixture:{id}`, cells)
			end
			self:apply(true)
		end)
		self:apply(true)
		-- Hora fixada ou solta para testar: o tom muda na hora, sem esperar o intervalo do `tint.ts`.
		Workspace:GetAttributeChangedSignal(HOUR_TEST_ATTRIBUTE):Connect(function()
			return self:apply(true)
		end)
		-- Dormir pula a hora (`RelogioDesvio`): o tom da manhã entra na hora.
		Workspace:GetAttributeChangedSignal(CLOCK_OFFSET_ATTRIBUTE):Connect(function()
			return self:apply(true)
		end)
	end
	function DaylightController:onRender()
		local now = os.clock()
		local tick = math.floor(now * TILE_ANIMATION_FPS)
		if tick == self.lastTick and now - self.lastApply < DAY_EVERY then
			return nil
		end
		self.lastTick = tick
		self:apply(false)
	end
	function DaylightController:lightAt(position)
		local _result = self.lights
		if _result ~= nil then
			_result = _result:lightAt(position, dayTone())
		end
		return _result
	end
	function DaylightController:lightKey()
		return self.lightSerial
	end
	function DaylightController:setDecorLights(key, state)
		local cells = {}
		if state then
			for _, cell in decorVariant(state).cells do
				local _arg0 = { state.x + cell[1], state.y + cell[2], decorTile(state.item, cell) }
				table.insert(cells, _arg0)
			end
		end
		local _result = self.lights
		if _result ~= nil then
			_result:setExtra(`decor:{key}`, cells)
		end
		self:apply(true)
	end
	function DaylightController:addExtras()
		if not self.lights then
			return nil
		end
		-- O tabuleiro ainda pode ser o do mapa de antes (o `ActionController` troca no mesmo aviso): só o do mapa de agora.
		local board = self.actions:currentBoard()
		if not board or board.map ~= self.scene.map then
			return nil
		end
		for key, state in board.decor do
			self:setDecorLights(key, state)
		end
		local fixtures = self.actions:currentFixtures()
		if fixtures then
			for _, fixture in fixtures.fixtures do
				self.lights:setExtra(`fixture:{fixture.id}`, fixtures:cellsOf(fixture.id))
			end
		end
	end
	function DaylightController:apply(force)
		local now = os.clock()
		self.lastApply = now
		local day = daylightAt(gameHour())
		local started = perfBegin("Tom")
		setTone(day.tone, now, force)
		local _result = self.scene.interior
		if _result ~= nil then
			_result:setNight(day.night)
		end
		perfEnd("Tom", started)
		started = perfBegin("Luzes")
		local _result_1 = self.lights
		if _result_1 ~= nil then
			_result_1:update(day, now)
		end
		perfEnd("Luzes", started)
		local _result_2 = self.lights
		if _result_2 ~= nil then
			_result_2 = _result_2.version
		end
		local _condition = _result_2
		if _condition == nil then
			_condition = -1
		end
		local version = _condition
		if version ~= self.seenLights or dayTone() ~= self.seenTone then
			self.seenLights = version
			self.seenTone = dayTone()
			self.lightSerial += 1
		end
		if day.name ~= self.lastName then
			self.lastName = day.name
			print(`[Luz] {string.format("%05.2f", day.hour)}h: {day.name}, luzes {string.format("%.2f", day.lights)}`)
		end
		if not self.reported and now - self.started > REPORT_AFTER then
			self.reported = true
			local _exp = `[Luz] tom em {tintedCount()} imagens; última troca {string.format("%.2f", tintStats.lastMs)} ms, ` .. `a mais lenta {string.format("%.2f", tintStats.maxMs)} ms, {tintStats.applies} trocas; `
			local _result_3 = self.lights
			if _result_3 ~= nil then
				_result_3 = _result_3.count
			end
			local _condition_1 = _result_3
			if _condition_1 == nil then
				_condition_1 = 0
			end
			local _result_4 = self.scene.interior
			if _result_4 ~= nil then
				_result_4 = _result_4.stats.windowImages
			end
			local _condition_2 = _result_4
			if _condition_2 == nil then
				_condition_2 = 0
			end
			print(_exp .. `{_condition_1} halos; {_condition_2} imagens de janela`)
		end
	end
	do
		-- (Flamework) DaylightController metadata
		Reflect.defineMetadata(DaylightController, "identifier", "client/controllers/DaylightController@DaylightController")
		Reflect.defineMetadata(DaylightController, "flamework:parameters", { "client/controllers/SceneController@SceneController", "client/controllers/ActionController@ActionController" })
		Reflect.defineMetadata(DaylightController, "flamework:implements", { "$:flamework@OnStart", "$:flamework@OnRender" })
	end
end
-- (Flamework) DaylightController decorators
Reflect.decorate(DaylightController, "$:flamework@Controller", Controller, {})
return {
	DaylightController = DaylightController,
}
