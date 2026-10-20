-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local Reflect = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Reflect
local Service = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Service
local _services = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services")
local Players = _services.Players
local Workspace = _services.Workspace
local _clock = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "clock")
local CLOCK_OFFSET_ATTRIBUTE = _clock.CLOCK_OFFSET_ATTRIBUTE
local HOUR_TEST_ATTRIBUTE = _clock.HOUR_TEST_ATTRIBUTE
local secondsUntilWake = _clock.secondsUntilWake
local WAKE_HOUR = _clock.WAKE_HOUR
local _fixtures = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "fixtures")
local chestOfPiece = _fixtures.chestOfPiece
local COOK_SECONDS = _fixtures.COOK_SECONDS
local FIXTURE_REACH = _fixtures.FIXTURE_REACH
local findFixtures = _fixtures.findFixtures
local nearCells = _fixtures.nearCells
local Events = TS.import(script, game:GetService("ServerScriptService"), "TS", "network").Events
local _rateLimit = TS.import(script, game:GetService("ServerScriptService"), "TS", "rateLimit")
local RATE = _rateLimit.RATE
local RateLimiter = _rateLimit.RateLimiter
--* O baú, o fogão e as peças-baú de um mapa montado, com o estado da sessão. 
--* De quanto em quanto tempo o servidor confere se quem pediu para dormir continua na cama, em segundos. 
local SLEEP_CHECK = 1
--[[
	*
	 * As interações que não mudam peça de lugar (etapa E do roteiro do Diorama, item 17):
	 *
	 * - **Baú**: abre e fecha (o fixo do mapa, pelo id `chest@x,y`, e a peça móvel que é baú, pelo id dela), trocando
	 *   os tiles pela versão aberta da mesma folha (`shared/fixtures.ts`). O que tem dentro espera o inventário.
	 * - **Fogão**: acende e apaga a boca e o forno. Aceso por `COOK_SECONDS`, chama o gancho de cozinhar (`cook`), que
	 *   hoje só avisa no Output (receitas e ingredientes esperam o inventário).
	 * - **Dormir**: deitado numa cama (a do mapa ou a posta no Decorar), a tecla de ação pede para dormir. Quando todos
	 *   os jogadores do servidor estão na cama (o relógio de teste é um só para todos), a hora pula para a manhã
	 *   (`RelogioDesvio`, ou o `HoraTeste` quando a hora está fixa) e os dados de quem dormiu são salvos na hora.
	 *
	 * O estado vale só para a sessão, como o das torneiras, e vai a quem está no mesmo mapa (`fixtureChanged`).
	 
]]
local FixtureService
do
	FixtureService = setmetatable({}, {
		__tostring = function()
			return "FixtureService"
		end,
	})
	FixtureService.__index = FixtureService
	function FixtureService.new(...)
		local self = setmetatable({}, FixtureService)
		return self:constructor(...) or self
	end
	function FixtureService:constructor(pieces, playerData)
		self.pieces = pieces
		self.playerData = playerData
		self.rooms = {}
		self.limit = RateLimiter.new(RATE.pieces)
		self.sleepLimit = RateLimiter.new(1, 2)
		self.sleeping = {}
	end
	function FixtureService:onStart()
		self.pieces:onRoomCreated(function(room)
			local _rooms = self.rooms
			local _key = room.key
			local _arg1 = self:build(room)
			_rooms[_key] = _arg1
			return _rooms
		end)
		Events.piecesReady:connect(function(player)
			local room = self.pieces:roomOf(player)
			local fixtures = room and self:fixturesOf(room)
			if not room or not fixtures then
				return nil
			end
			for id, on in fixtures.state do
				Events.fixtureChanged:fire(player, room.key, id, on)
			end
			for id in fixtures.openPieces do
				if self:pieceStillOpen(room, fixtures, id) then
					Events.fixtureChanged:fire(player, room.key, id, true)
				end
			end
		end)
		Events.useFixture:connect(function(player, id)
			local _id = id
			local _condition = not (type(_id) == "string")
			if not _condition then
				_condition = not self.limit:allow(player)
			end
			if _condition then
				return nil
			end
			local room = self.pieces:roomOf(player)
			if room then
				self:use(room, player, id)
			end
		end)
		Events.sleep:connect(function(player)
			if self.sleepLimit:allow(player) then
				self:askSleep(player)
			end
		end)
		Players.PlayerRemoving:Connect(function(player)
			local _sleeping = self.sleeping
			local _player = player
			_sleeping[_player] = nil
			-- Quem saiu podia ser o último acordado.
			task.defer(function()
				return self:tryPassNight()
			end)
		end)
		task.spawn(function()
			while true do
				task.wait(SLEEP_CHECK)
				local _array = {}
				local _length = #_array
				for _v in self.sleeping do
					_length += 1
					_array[_length] = _v
				end
				for _, player in _array do
					if not self:inBed(player) then
						self.sleeping[player] = nil
					end
				end
			end
		end)
	end
	function FixtureService:build(room)
		local fixtures = {}
		for _, fixture in findFixtures(room.board.map) do
			local _id = fixture.id
			fixtures[_id] = fixture
		end
		-- ▼ ReadonlyMap.size ▼
		local _size = 0
		for _ in fixtures do
			_size += 1
		end
		-- ▲ ReadonlyMap.size ▲
		if _size > 0 then
			local _exp = room.key
			-- ▼ ReadonlyMap.size ▼
			local _size_1 = 0
			for _ in fixtures do
				_size_1 += 1
			end
			-- ▲ ReadonlyMap.size ▲
			print(`[Fixos] {_exp}: {_size_1} baú(s) e fogão(ões)`)
		end
		return {
			fixtures = fixtures,
			state = {},
			openPieces = {},
			lit = {},
		}
	end
	function FixtureService:fixturesOf(room)
		local _rooms = self.rooms
		local _key = room.key
		local fixtures = _rooms[_key]
		if not fixtures then
			fixtures = self:build(room)
			local _rooms_1 = self.rooms
			local _key_1 = room.key
			local _fixtures_1 = fixtures
			_rooms_1[_key_1] = _fixtures_1
		end
		return fixtures
	end
	function FixtureService:pieceStillOpen(room, fixtures, id)
		local _openPieces = fixtures.openPieces
		local _id = id
		local at = _openPieces[_id]
		local _pieces = room.board.pieces
		local _id_1 = id
		local state = _pieces[_id_1]
		if not at or not state then
			return false
		end
		if state.mode == 0 and state.x == at[1] and state.y == at[2] then
			return true
		end
		local _openPieces_1 = fixtures.openPieces
		local _id_2 = id
		_openPieces_1[_id_2] = nil
		return false
	end
	function FixtureService:feetCell(room, player)
		local feet = self.pieces:feetOf(room, player)
		return if feet then { math.floor(feet.X / 16), math.floor(feet.Y / 16) } else nil
	end
	function FixtureService:use(room, player, id)
		local fixtures = self:fixturesOf(room)
		local cell = self:feetCell(room, player)
		if not cell then
			return nil
		end
		local _fixtures_1 = fixtures.fixtures
		local _id = id
		local fixture = _fixtures_1[_id]
		if fixture then
			if not nearCells(cell[1], cell[2], fixture.x, fixture.y, fixture.w, fixture.h, FIXTURE_REACH) then
				return nil
			end
			local _state = fixtures.state
			local _id_1 = id
			local _condition = _state[_id_1]
			if _condition == nil then
				_condition = fixture.startsOn
			end
			local on = not _condition
			local _state_1 = fixtures.state
			local _id_2 = id
			_state_1[_id_2] = on
			Events.fixtureChanged:fire(self.pieces:playersIn(room), room.key, id, on)
			if fixture.kind == "stove" and on then
				self:startCooking(room, fixtures, fixture, player)
			end
			return nil
		end
		-- A peça móvel que é baú: abre e fecha no lugar, só no chão e sem ninguém segurando.
		local _pieces = room.board.pieces
		local _id_1 = id
		local piece = _pieces[_id_1]
		if not piece or piece.mode ~= 0 or not chestOfPiece(room.board:defOf(piece)) then
			return nil
		end
		local def = piece.spot.def
		if not nearCells(cell[1], cell[2], piece.x, piece.y, def.w, def.h, FIXTURE_REACH) then
			return nil
		end
		local open = not self:pieceStillOpen(room, fixtures, id)
		if open then
			local _openPieces = fixtures.openPieces
			local _id_2 = id
			local _arg1 = { piece.x, piece.y }
			_openPieces[_id_2] = _arg1
		else
			local _openPieces = fixtures.openPieces
			local _id_2 = id
			_openPieces[_id_2] = nil
		end
		Events.fixtureChanged:fire(self.pieces:playersIn(room), room.key, id, open)
	end
	function FixtureService:startCooking(room, fixtures, fixture, player)
		local _lit = fixtures.lit
		local _id = fixture.id
		local _condition = _lit[_id]
		if _condition == nil then
			_condition = 0
		end
		local serial = _condition + 1
		local _lit_1 = fixtures.lit
		local _id_1 = fixture.id
		_lit_1[_id_1] = serial
		task.delay(COOK_SECONDS, function()
			local _lit_2 = fixtures.lit
			local _id_2 = fixture.id
			local _condition_1 = _lit_2[_id_2] ~= serial
			if not _condition_1 then
				local _state = fixtures.state
				local _id_3 = fixture.id
				_condition_1 = _state[_id_3] ~= true
			end
			if _condition_1 then
				return nil
			end
			self:cook(room, fixture, player)
		end)
	end
	function FixtureService:cook(room, fixture, player)
		print(`[Fixos] {room.key}: {player.Name} cozinhou no {fixture.id} (sem receitas: o inventário ainda não existe)`)
	end
	function FixtureService:inBed(player)
		local room = self.pieces:roomOf(player)
		local cell = room and self:feetCell(room, player)
		if not room or not cell then
			return false
		end
		local kind = room.board:kind(cell[1], cell[2])
		return kind == 4 or kind == 5
	end
	function FixtureService:askSleep(player)
		if not self:inBed(player) then
			Events.slept:fire(player, false, 0)
			return nil
		end
		local _sleeping = self.sleeping
		local _player = player
		_sleeping[_player] = true
		if self:tryPassNight() then
			return nil
		end
		local _exp = Players:GetPlayers()
		-- ▼ ReadonlyArray.filter ▼
		local _newValue = {}
		local _callback = function(other)
			local _sleeping_1 = self.sleeping
			local _other = other
			return not (_sleeping_1[_other] ~= nil)
		end
		local _length = 0
		for _k, _v in _exp do
			if _callback(_v, _k - 1, _exp) == true then
				_length += 1
				_newValue[_length] = _v
			end
		end
		-- ▲ ReadonlyArray.filter ▲
		local awake = #_newValue
		Events.slept:fire(player, false, awake)
	end
	function FixtureService:tryPassNight()
		local players = Players:GetPlayers()
		-- ▼ ReadonlySet.size ▼
		local _size = 0
		for _ in self.sleeping do
			_size += 1
		end
		-- ▲ ReadonlySet.size ▲
		local _condition = _size == 0
		if not _condition then
			-- ▼ ReadonlyArray.some ▼
			local _result = false
			local _callback = function(player)
				local _sleeping = self.sleeping
				local _player = player
				local _condition_1 = not (_sleeping[_player] ~= nil)
				if not _condition_1 then
					_condition_1 = not self:inBed(player)
				end
				return _condition_1
			end
			for _k, _v in players do
				if _callback(_v, _k - 1, players) then
					_result = true
					break
				end
			end
			-- ▲ ReadonlyArray.some ▲
			_condition = _result
		end
		if _condition then
			return false
		end
		local _array = {}
		local _length = #_array
		for _v in self.sleeping do
			_length += 1
			_array[_length] = _v
		end
		local sleepers = _array
		table.clear(self.sleeping)
		local fixed = Workspace:GetAttribute(HOUR_TEST_ATTRIBUTE)
		if type(fixed) == "number" then
			-- A hora está fixa para testar: fica fixa, na manhã.
			Workspace:SetAttribute(HOUR_TEST_ATTRIBUTE, WAKE_HOUR)
		else
			local offset = Workspace:GetAttribute(CLOCK_OFFSET_ATTRIBUTE)
			Workspace:SetAttribute(CLOCK_OFFSET_ATTRIBUTE, (if type(offset) == "number" then offset else 0) + secondsUntilWake())
		end
		print(`[Fixos] {#sleepers} jogador(es) dormiu(ram): a hora pulou para as {WAKE_HOUR}h`)
		for _, player in sleepers do
			task.spawn(function()
				local saved = self.playerData:saveNow(player)
				print(`[Fixos] {player.Name} dormiu; dados {if saved then "salvos" else "não salvos (sem DataStore)"}`)
				if player.Parent then
					Events.slept:fire(player, true, 0)
				end
			end)
		end
		return true
	end
	do
		-- (Flamework) FixtureService metadata
		Reflect.defineMetadata(FixtureService, "identifier", "server/services/FixtureService@FixtureService")
		Reflect.defineMetadata(FixtureService, "flamework:parameters", { "server/services/PieceService@PieceService", "server/services/PlayerDataService@PlayerDataService" })
		Reflect.defineMetadata(FixtureService, "flamework:implements", { "$:flamework@OnStart" })
	end
end
-- (Flamework) FixtureService decorators
Reflect.decorate(FixtureService, "$:flamework@Service", Service, {})
return {
	FixtureService = FixtureService,
}
