-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local Reflect = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Reflect
local Service = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Service
local _services = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services")
local DataStoreService = _services.DataStoreService
local Players = _services.Players
local RunService = _services.RunService
local _appearance = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "appearance")
local LOOK_ATTRIBUTE = _appearance.LOOK_ATTRIBUTE
local parseLook = _appearance.parseLook
local sanitizeDecor = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "decor").sanitizeDecor
local NAME_ATTRIBUTE = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "names").NAME_ATTRIBUTE
local _playerData = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "playerData")
local decodeSavedLook = _playerData.decodeSavedLook
local emptyPlayerData = _playerData.emptyPlayerData
local encodeSavedLook = _playerData.encodeSavedLook
local isPieceId = _playerData.isPieceId
local MAX_FAVORITES = _playerData.MAX_FAVORITES
local SAVED_LOOKS = _playerData.SAVED_LOOKS
local Events = TS.import(script, game:GetService("ServerScriptService"), "TS", "network").Events
local _rateLimit = TS.import(script, game:GetService("ServerScriptService"), "TS", "rateLimit")
local RATE = _rateLimit.RATE
local RateLimiter = _rateLimit.RateLimiter
--* Nome do DataStore; trocar o sufixo recomeça os dados de todo mundo. 
local STORE = "PlayerData_v1"
--* De quanto em quanto tempo os dados mudados vão para o DataStore, em segundos. 
local SAVE_EVERY = 30
--[[
	*
	 * A trava de sessão (`session` no valor salvo): o servidor que tem o jogador grava nela o `JobId` e a hora, e a
	 * renova a cada gravação. Um servidor só lê ou grava por cima de uma trava de outro quando ela está vencida, sem
	 * renovar há este tempo, em segundos (o dono renova a cada `LOCK_REFRESH`, mesmo sem nada mudado).
	 
]]
local LOCK_STALE = 90
local LOCK_REFRESH = 60
--* Quanto tempo quem entra espera a trava de outro servidor soltar ou vencer, em segundos, e de quanto em quanto confere. 
local LOCK_WAIT = LOCK_STALE + 15
local LOCK_POLL = 5
--* Esperas entre as tentativas de ler e gravar que falham, em segundos: 3 tentativas a mais. 
local RETRY_WAITS = { 1, 2, 4 }
--* Gravações em andamento ao mesmo tempo, no máximo: a fila do DataStore tem 30 lugares por servidor. 
local MAX_SAVING = 10
--* Ao fechar o servidor, quanto tempo esperar as gravações, em segundos (o Roblox dá uns 30). 
local CLOSE_WAIT = 25
--* A trava de sessão guardada junto com os dados. 
--* O resultado de uma leitura com trava. 
--* O `JobId` deste servidor; no Studio vem vazio, e todos os Plays do Studio contam como o mesmo servidor. 
local function jobId()
	return if game.JobId ~= "" then game.JobId else "studio"
end
local function lockedByOther(stored)
	local _lock = stored
	if _lock ~= nil then
		_lock = _lock.session
	end
	local lock = _lock
	return lock ~= nil and lock.job ~= jobId() and os.time() - lock.at < LOCK_STALE
end
--[[
	*
	 * Guarda no DataStore do Roblox o que o jogador quer manter entre uma partida e outra: o personagem
	 * confirmado (visual e nome, para o Continuar do menu), as cabeças e os corpos favoritos e os visuais
	 * salvos da tela de personalizar (pedidos do usuário em 2026-10-17) e a decoração da casa.
	 *
	 * Desde a fase 1 do `PLANO_OTIMIZACAO.md` (2026-10-18, seção 7.2):
	 *
	 * - **Trava de sessão**: ler e gravar com `UpdateAsync`, com o servidor dono e a hora no valor (`session`). Quem
	 *   entra espera a trava de outro servidor soltar (ao sair, a gravação final tira a trava) ou vencer
	 *   (`LOCK_STALE`); assim, um jogador que troca de servidor depressa não tem os dados gravados por cima pelo
	 *   servidor velho. O servidor que perde a trava para de gravar aquele jogador.
	 * - **Tentar de novo**: leitura e gravação que falham tentam mais 3 vezes, esperando 1, 2 e 4 s. A leitura que
	 *   falha de vez avisa o cliente (`playerDataFailed`), que volta ao início com o aviso, em vez de jogar uma sessão
	 *   que não grava. No Studio sem acesso às APIs, só avisa no Output, como antes.
	 * - **Gravação espalhada**: cada jogador tem a própria hora de gravar (a cada `SAVE_EVERY` segundos, a primeira
	 *   sorteada), com no máximo `MAX_SAVING` gravações em andamento.
	 * - **Ao fechar o servidor**: todas as gravações em paralelo, esperando até `CLOSE_WAIT` segundos.
	 * - **Sem reenviar tudo**: o cliente muda os próprios dados na hora (`state/playerData.ts`); o servidor manda os
	 *   dados inteiros só ao carregar e quando recusa um pedido (o favorito além do limite, por exemplo).
	 * - **Limite de pedidos** (`server/rateLimit.ts`): `setFavorite` e `saveLook`.
	 
]]
local PlayerDataService
do
	PlayerDataService = setmetatable({}, {
		__tostring = function()
			return "PlayerDataService"
		end,
	})
	PlayerDataService.__index = PlayerDataService
	function PlayerDataService.new(...)
		local self = setmetatable({}, PlayerDataService)
		return self:constructor(...) or self
	end
	function PlayerDataService:constructor()
		self.data = {}
		self.loaded = {}
		self.dirty = {}
		self.nextSave = {}
		self.lockedAt = {}
		self.saving = 0
		self.busy = {}
		self.leaving = {}
		self.closing = false
		self.loadedListeners = {}
		self.random = Random.new()
		self.confirmed = {}
		self.ready = {}
	end
	function PlayerDataService:onStart()
		local ok, store = pcall(function()
			return DataStoreService:GetDataStore(STORE)
		end)
		if ok then
			self.store = store
		else
			warn(`[PlayerData] sem DataStore: {store}`)
		end
		Players.PlayerAdded:Connect(function(player)
			return self:load(player)
		end)
		Players.PlayerRemoving:Connect(function(player)
			return self:release(player)
		end)
		for _, player in Players:GetPlayers() do
			task.spawn(function()
				return self:load(player)
			end)
		end
		game:BindToClose(function()
			return self:closeAll()
		end)
		task.spawn(function()
			while true do
				task.wait(1)
				self:saveDue()
			end
		end)
		local favoriteLimit = RateLimiter.new(RATE.setFavorite)
		Events.setFavorite:connect(function(player, kind, id, favorite)
			local _data = self.data
			local _player = player
			local data = _data[_player]
			if not data or not favoriteLimit:allow(player) then
				return nil
			end
			if not isPieceId(kind, id) then
				return self:push(player, data)
			end
			local list = if kind == "head" then data.favoriteHeads else data.favoriteBodies
			local _id = id
			local at = (table.find(list, _id) or 0) - 1
			if favorite and at < 0 and #list < MAX_FAVORITES then
				local _id_1 = id
				table.insert(list, _id_1)
			elseif not favorite and at >= 0 then
				table.remove(list, at + 1)
			else
				return self:push(player, data)
			end
			local _dirty = self.dirty
			local _player_1 = player
			_dirty[_player_1] = true
		end)
		-- O personagem confirmado: o visual que o AppearanceService aceitou e o nome que o NameService
		-- filtrou, lidos dos atributos depois de o jogador confirmar a tela de personalizar.
		Events.setLook:connect(function(player)
			task.defer(function()
				local _data = self.data
				local _player = player
				local data = _data[_player]
				local look = parseLook(player:GetAttribute(LOOK_ATTRIBUTE))
				if not data or not look then
					return nil
				end
				local character = encodeSavedLook(look)
				local _confirmed = self.confirmed
				local _player_1 = player
				_confirmed[_player_1] = true
				if data.character == character then
					return nil
				end
				data.character = character
				local _dirty = self.dirty
				local _player_2 = player
				_dirty[_player_2] = true
			end)
		end)
		Players.PlayerAdded:Connect(function(player)
			return self:watchName(player)
		end)
		for _, player in Players:GetPlayers() do
			self:watchName(player)
		end
		local saveLimit = RateLimiter.new(RATE.saveLook)
		Events.saveLook:connect(function(player, slot, look)
			local _data = self.data
			local _player = player
			local data = _data[_player]
			if not data or not saveLimit:allow(player) then
				return nil
			end
			local _slot = slot
			local _condition = not (type(_slot) == "number")
			if not _condition then
				_condition = slot ~= math.floor(slot) or slot < 0 or slot >= SAVED_LOOKS
			end
			if _condition then
				return nil
			end
			local _look = look
			local _condition_1 = not (type(_look) == "string")
			if not _condition_1 then
				_condition_1 = (look ~= "" and decodeSavedLook(look) == nil)
			end
			if _condition_1 then
				return self:push(player, data)
			end
			data.savedLooks[slot + 1] = look
			local _dirty = self.dirty
			local _player_1 = player
			_dirty[_player_1] = true
		end)
	end
	function PlayerDataService:watchName(player)
		player:GetAttributeChangedSignal(NAME_ATTRIBUTE):Connect(function()
			local _data = self.data
			local _player = player
			local data = _data[_player]
			local name = player:GetAttribute(NAME_ATTRIBUTE)
			local _condition = not data
			if not _condition then
				local _confirmed = self.confirmed
				local _player_1 = player
				_condition = not (_confirmed[_player_1] ~= nil)
				if not _condition then
					_condition = not (type(name) == "string") or name == player.DisplayName
				end
			end
			if _condition then
				return nil
			end
			data.characterName = name
			local _dirty = self.dirty
			local _player_1 = player
			_dirty[_player_1] = true
		end)
	end
	function PlayerDataService:decorOf(player)
		local _data = self.data
		local _player = player
		local _result = _data[_player]
		if _result ~= nil then
			_result = _result.decor
		end
		return _result
	end
	function PlayerDataService:setDecor(player, decor)
		local _data = self.data
		local _player = player
		local data = _data[_player]
		if not data then
			return nil
		end
		data.decor = decor
		local _dirty = self.dirty
		local _player_1 = player
		_dirty[_player_1] = true
	end
	function PlayerDataService:saveNow(player)
		local _data = self.data
		local _player = player
		if not (_data[_player] ~= nil) then
			return false
		end
		local _dirty = self.dirty
		local _player_1 = player
		_dirty[_player_1] = true
		local _nextSave = self.nextSave
		local _player_2 = player
		local _arg1 = os.clock() + SAVE_EVERY
		_nextSave[_player_2] = _arg1
		return self:save(player)
	end
	function PlayerDataService:isReady(player)
		local _ready = self.ready
		local _player = player
		return _ready[_player] ~= nil
	end
	function PlayerDataService:onLoaded(listener)
		local _loadedListeners = self.loadedListeners
		local _listener = listener
		table.insert(_loadedListeners, _listener)
	end
	function PlayerDataService:key(player)
		return `player_{player.UserId}`
	end
	function PlayerDataService:push(player, data)
		Events.playerData:fire(player, data.favoriteHeads, data.favoriteBodies, data.savedLooks, data.character, data.characterName)
	end
	function PlayerDataService:retry(attempt)
		-- No Studio sem acesso às APIs, o erro se repetiria: tenta uma vez só.
		local waits = if RunService:IsStudio() then {} else RETRY_WAITS
		local failure
		for index = 0, #waits do
			local ok, result = pcall(attempt)
			if ok then
				return { true, result }
			end
			failure = result
			if index < #waits then
				task.wait(waits[index + 1])
			end
		end
		return { false, failure }
	end
	function PlayerDataService:lockAndRead(player)
		local store = self.store
		local _binding = self:retry(function()
			local outcome = {
				kind = "locked",
			}
			store:UpdateAsync(self:key(player), function(old)
				if lockedByOther(old) then
					outcome = {
						kind = "locked",
					}
					return nil
				end
				outcome = {
					kind = "ok",
					stored = old,
				}
				local _object = table.clone((old or {}))
				setmetatable(_object, nil)
				_object.session = {
					job = jobId(),
					at = os.time(),
				}
				local value = _object
				return value, { player.UserId }
			end)
			return outcome
		end)
		local ok = _binding[1]
		local result = _binding[2]
		return if ok then result else {
			kind = "error",
			message = result,
		}
	end
	function PlayerDataService:load(player)
		local data = emptyPlayerData()
		local _data = self.data
		local _player = player
		_data[_player] = data
		if self.store then
			-- Espera a trava de outro servidor (o jogador acabou de sair dele) soltar ou vencer.
			local started = os.clock()
			local result = self:lockAndRead(player)
			while result.kind == "locked" and os.clock() - started < LOCK_WAIT and player.Parent do
				task.wait(LOCK_POLL)
				result = self:lockAndRead(player)
			end
			if not player.Parent then
				return nil
			end
			if result.kind == "ok" then
				local _loaded = self.loaded
				local _player_1 = player
				_loaded[_player_1] = true
				local _lockedAt = self.lockedAt
				local _player_2 = player
				local _arg1 = os.clock()
				_lockedAt[_player_2] = _arg1
				local _nextSave = self.nextSave
				local _player_3 = player
				local _arg1_1 = os.clock() + self.random:NextNumber(0, SAVE_EVERY)
				_nextSave[_player_3] = _arg1_1
				local saved = result.stored
				if saved then
					local _favoriteHeads = saved.favoriteHeads
					if type(_favoriteHeads) == "table" then
						local _exp = saved.favoriteHeads
						-- ▼ ReadonlyArray.filter ▼
						local _newValue = {}
						local _callback = function(id)
							return isPieceId("head", id)
						end
						local _length = 0
						for _k, _v in _exp do
							if _callback(_v, _k - 1, _exp) == true then
								_length += 1
								_newValue[_length] = _v
							end
						end
						-- ▲ ReadonlyArray.filter ▲
						data.favoriteHeads = _newValue
					end
					local _favoriteBodies = saved.favoriteBodies
					if type(_favoriteBodies) == "table" then
						local _exp = saved.favoriteBodies
						-- ▼ ReadonlyArray.filter ▼
						local _newValue = {}
						local _callback = function(id)
							return isPieceId("body", id)
						end
						local _length = 0
						for _k, _v in _exp do
							if _callback(_v, _k - 1, _exp) == true then
								_length += 1
								_newValue[_length] = _v
							end
						end
						-- ▲ ReadonlyArray.filter ▲
						data.favoriteBodies = _newValue
					end
					local _character = saved.character
					local _condition = type(_character) == "string"
					if _condition then
						_condition = decodeSavedLook(saved.character)
					end
					if _condition then
						data.character = saved.character
					end
					local _characterName = saved.characterName
					if type(_characterName) == "string" then
						data.characterName = string.sub(saved.characterName, 1, 64)
					end
					data.decor = sanitizeDecor(saved.decor)
					local _savedLooks = saved.savedLooks
					if type(_savedLooks) == "table" then
						for slot = 0, SAVED_LOOKS - 1 do
							local look = saved.savedLooks[slot + 1]
							data.savedLooks[slot + 1] = if type(look) == "string" then look else ""
						end
					end
				end
			elseif RunService:IsStudio() then
				warn("[PlayerData] DataStore indisponível no Studio (ligue Enable Studio Access to API Services); nada será salvo")
			else
				local why = if result.kind == "locked" then "outro servidor ainda tem os dados" else tostring(result.message)
				warn(`[PlayerData] não deu para ler os dados de {player.Name}: {why}`)
				-- Uma sessão que não grava perderia tudo o que o jogador fizer: ele volta ao início com o aviso.
				Events.playerDataFailed:fire(player)
			end
		end
		if player.Parent then
			self:push(player, data)
		end
		local _ready = self.ready
		local _player_1 = player
		_ready[_player_1] = true
		for _, listener in self.loadedListeners do
			task.spawn(listener, player)
		end
	end
	function PlayerDataService:save(player, unlock)
		if unlock == nil then
			unlock = false
		end
		-- Uma gravação de cada vez por jogador: a que renova a trava, ainda no ar, não pode chegar depois da que a solta
		-- (ao sair) e travar de novo os dados de quem já foi para outro servidor.
		local waitStarted = os.clock()
		while true do
			local _busy = self.busy
			local _player = player
			local _condition = _busy[_player] ~= nil
			if _condition then
				_condition = os.clock() - waitStarted < CLOSE_WAIT
			end
			if not _condition then
				break
			end
			task.wait(0.1)
		end
		local _data = self.data
		local _player = player
		local data = _data[_player]
		local _condition = not data or not self.store
		if not _condition then
			local _loaded = self.loaded
			local _player_1 = player
			_condition = not (_loaded[_player_1] ~= nil)
		end
		if _condition then
			return false
		end
		-- Quem está saindo só grava a gravação que solta a trava.
		local _condition_1 = not unlock
		if _condition_1 then
			local _leaving = self.leaving
			local _player_1 = player
			local _condition_2 = _leaving[_player_1] ~= nil
			if not _condition_2 then
				_condition_2 = self.closing
			end
			_condition_1 = _condition_2
		end
		if _condition_1 then
			return false
		end
		local _busy = self.busy
		local _player_1 = player
		_busy[_player_1] = true
		local saved = self:write(player, data, unlock)
		local _busy_1 = self.busy
		local _player_2 = player
		_busy_1[_player_2] = nil
		if saved and unlock then
			print(`[PlayerData] {player.Name}: dados gravados e trava solta`)
		end
		return saved
	end
	function PlayerDataService:write(player, data, unlock)
		local store = self.store
		local _dirty = self.dirty
		local _player = player
		local hadChanges = _dirty[_player] ~= nil
		local _dirty_1 = self.dirty
		local _player_1 = player
		_dirty_1[_player_1] = nil
		self.saving += 1
		local lost = false
		local _binding = self:retry(function()
			lost = false
			store:UpdateAsync(self:key(player), function(old)
				if lockedByOther(old) then
					lost = true
					return nil
				end
				local _object = table.clone(data)
				setmetatable(_object, nil)
				_object.session = if unlock then nil else {
					job = jobId(),
					at = os.time(),
				}
				local value = _object
				return value, { player.UserId }
			end)
		end)
		local ok = _binding[1]
		local err = _binding[2]
		self.saving -= 1
		if not ok then
			warn(`[PlayerData] não deu para salvar {player.Name}: {err}`)
			if hadChanges then
				local _dirty_2 = self.dirty
				local _player_2 = player
				_dirty_2[_player_2] = true
			end
			return false
		end
		if lost then
			warn(`[PlayerData] {player.Name} está noutro servidor: este para de gravar os dados dele`)
			local _loaded = self.loaded
			local _player_2 = player
			_loaded[_player_2] = nil
			return false
		end
		local _lockedAt = self.lockedAt
		local _player_2 = player
		local _arg1 = os.clock()
		_lockedAt[_player_2] = _arg1
		return true
	end
	function PlayerDataService:saveDue()
		if self.closing then
			return nil
		end
		local now = os.clock()
		for player in self.loaded do
			if self.saving >= MAX_SAVING then
				return nil
			end
			local _condition = self.nextSave[player]
			if _condition == nil then
				_condition = 0
			end
			if now < _condition then
				continue
			end
			local _condition_1 = self.lockedAt[player]
			if _condition_1 == nil then
				_condition_1 = 0
			end
			local stale = now - _condition_1 >= LOCK_REFRESH
			if not (self.dirty[player] ~= nil) and not stale then
				continue
			end
			local _nextSave = self.nextSave
			local _arg1 = now + SAVE_EVERY
			_nextSave[player] = _arg1
			task.spawn(function()
				return self:save(player)
			end)
		end
	end
	function PlayerDataService:release(player)
		local _leaving = self.leaving
		local _player = player
		_leaving[_player] = true
		self:save(player, true)
		local _leaving_1 = self.leaving
		local _player_1 = player
		_leaving_1[_player_1] = nil
		local _data = self.data
		local _player_2 = player
		_data[_player_2] = nil
		local _loaded = self.loaded
		local _player_3 = player
		_loaded[_player_3] = nil
		local _dirty = self.dirty
		local _player_4 = player
		_dirty[_player_4] = nil
		local _confirmed = self.confirmed
		local _player_5 = player
		_confirmed[_player_5] = nil
		local _ready = self.ready
		local _player_6 = player
		_ready[_player_6] = nil
		local _nextSave = self.nextSave
		local _player_7 = player
		_nextSave[_player_7] = nil
		local _lockedAt = self.lockedAt
		local _player_8 = player
		_lockedAt[_player_8] = nil
	end
	function PlayerDataService:closeAll()
		self.closing = true
		local started = os.clock()
		local pending = 0
		local _array = {}
		local _length = #_array
		for _v in self.loaded do
			_length += 1
			_array[_length] = _v
		end
		for _, player in _array do
			pending += 1
			task.spawn(function()
				self:save(player, true)
				pending -= 1
			end)
		end
		while pending > 0 and os.clock() - started < CLOSE_WAIT do
			task.wait(0.1)
		end
	end
	do
		-- (Flamework) PlayerDataService metadata
		Reflect.defineMetadata(PlayerDataService, "identifier", "server/services/PlayerDataService@PlayerDataService")
		Reflect.defineMetadata(PlayerDataService, "flamework:implements", { "$:flamework@OnStart" })
	end
end
-- (Flamework) PlayerDataService decorators
Reflect.decorate(PlayerDataService, "$:flamework@Service", Service, {})
return {
	PlayerDataService = PlayerDataService,
}
