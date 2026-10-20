-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local Reflect = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Reflect
local Controller = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Controller
local subscribe = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "charm", "src").subscribe
local _services = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services")
local Players = _services.Players
local RunService = _services.RunService
local TextChatService = _services.TextChatService
local WALK_SPEED = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "character").WALK_SPEED
local _moods = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "moods")
local chatMood = _moods.chatMood
local isReaction = _moods.isReaction
local Moods = _moods.Moods
local REACTION_COOLDOWN = _moods.REACTION_COOLDOWN
local Events = TS.import(script, script.Parent.Parent, "network").Events
local _perf = TS.import(script, script.Parent.Parent, "perf")
local perfBegin = _perf.perfBegin
local perfEnd = _perf.perfEnd
local screen = TS.import(script, script.Parent.Parent, "state", "screen").screen
--* Depois de entrar no jogo, o tempo até o boneco cumprimentar: o véu da abertura ainda está saindo. 
local GREET_DELAY = 1.6
--* Andando contra um obstáculo por este tempo, em segundos, o boneco reclama; e só volta a reclamar depois do intervalo. 
local BUMP_SECONDS = 0.3
local BUMP_COOLDOWN = 4
--* Distância, em studs, em que outro jogador conta como encontro, e o intervalo até cumprimentar o mesmo de novo. 
local MEET_DISTANCE = 1.5
local MEET_COOLDOWN = 90
--* De quanto em quanto tempo os encontros são conferidos, em segundos. 
local MEET_EVERY = 0.25
--* Andando sem parar por um tempo sorteado neste intervalo, em segundos, o boneco se anima. 
local STROLL_MIN = 40
local STROLL_MAX = 80
--* De quanto em quanto tempo o rosto confere o esbarrão, o passeio e o encontro, em segundos. 
local WATCH_EVERY = 0.1
--[[
	*
	 * Faz o rosto do jogador reagir ao que acontece com ele, sem ele escolher nada: cumprimenta ao
	 * entrar e ao encontrar alguém, reclama ao esbarrar, se anima num passeio comprido e acompanha o
	 * que ele escreve no chat. A reação aparece na hora no boneco dele e vai pelo servidor aos outros.
	 * O sono de quem fica parado não passa por aqui: cada cliente conta sozinho (`CharacterController`).
	 
]]
local MoodController
do
	MoodController = setmetatable({}, {
		__tostring = function()
			return "MoodController"
		end,
	})
	MoodController.__index = MoodController
	function MoodController.new(...)
		local self = setmetatable({}, MoodController)
		return self:constructor(...) or self
	end
	function MoodController:constructor(characters, movement)
		self.characters = characters
		self.movement = movement
		self.random = Random.new()
		self.last = -math.huge
		self.lastBump = -math.huge
		self.strollAfter = self.random:NextNumber(STROLL_MIN, STROLL_MAX)
		self.nextMeet = 0
		self.met = {}
		self.nextWatch = 0
	end
	function MoodController:onStart()
		Events.reacted:connect(function(userId, reaction, bubble)
			if not isReaction(reaction) then
				return nil
			end
			local player = Players:GetPlayerByUserId(userId)
			if player and player ~= Players.LocalPlayer then
				self.characters:react(player, reaction, bubble)
			end
		end)
		subscribe(screen, function(value)
			if value ~= "playing" then
				return nil
			end
			-- O tempo no menu e na personalização não conta como ficar parado.
			self.characters:touch(Players.LocalPlayer)
			task.delay(GREET_DELAY, function()
				return self:feel(Moods.greet)
			end)
		end)
		TextChatService.SendingMessage:Connect(function(message)
			return self:feel(chatMood(message.Text))
		end)
		Players.PlayerRemoving:Connect(function(player)
			local _met = self.met
			local _player = player
			-- ▼ Map.delete ▼
			local _valueExisted = _met[_player] ~= nil
			_met[_player] = nil
			-- ▲ Map.delete ▲
			return _valueExisted
		end)
		RunService.Heartbeat:Connect(function()
			-- 10 vezes por segundo bastam: o esbarrão e o passeio contam segundos (seção 5.1 do `PLANO_OTIMIZACAO.md`).
			local now = os.clock()
			if now < self.nextWatch then
				return nil
			end
			self.nextWatch = now + WATCH_EVERY
			local started = perfBegin("Humor")
			self:watch()
			perfEnd("Humor", started)
		end)
	end
	function MoodController:feel(mood)
		if mood.reaction < 0 or screen() ~= "playing" then
			return false
		end
		local now = os.clock()
		if now - self.last < REACTION_COOLDOWN then
			return false
		end
		self.last = now
		self.characters:react(Players.LocalPlayer, mood.reaction, mood.bubble)
		Events.react:fire(mood.reaction, mood.bubble)
		return true
	end
	function MoodController:watch()
		if screen() ~= "playing" then
			return nil
		end
		local character = Players.LocalPlayer.Character
		local _humanoid = character
		if _humanoid ~= nil then
			_humanoid = _humanoid:FindFirstChildOfClass("Humanoid")
		end
		local humanoid = _humanoid
		local _root = character
		if _root ~= nil then
			_root = _root:FindFirstChild("HumanoidRootPart")
		end
		local root = _root
		local _condition = not humanoid
		if not _condition then
			local _result = root
			if _result ~= nil then
				_result = _result:IsA("BasePart")
			end
			_condition = not _result
		end
		if _condition then
			return nil
		end
		local now = os.clock()
		local velocity = root.AssemblyLinearVelocity
		local speed = math.sqrt(velocity.X * velocity.X + velocity.Z * velocity.Z)
		-- Esbarrão: o jogador manda andar e o boneco não sai do lugar.
		local pushing = humanoid.MoveDirection.Magnitude > 0.5 and not self.movement.holding()
		if pushing and speed < WALK_SPEED * 0.25 then
			if self.blockedSince == nil then
				self.blockedSince = now
			end
			if now - self.blockedSince >= BUMP_SECONDS and now - self.lastBump >= BUMP_COOLDOWN then
				if self:feel(Moods.bump) then
					self.lastBump = now
				end
			end
		else
			self.blockedSince = nil
		end
		-- Passeio: andando há bastante tempo sem parar.
		if speed > WALK_SPEED * 0.6 then
			if self.walkingSince == nil then
				self.walkingSince = now
			end
			if now - self.walkingSince >= self.strollAfter then
				self:feel(Moods.stroll)
				self.walkingSince = now
				self.strollAfter = self.random:NextNumber(STROLL_MIN, STROLL_MAX)
			end
		else
			self.walkingSince = nil
		end
		-- Encontro: outro jogador chegou perto.
		if now >= self.nextMeet then
			self.nextMeet = now + MEET_EVERY
			for _, other in Players:GetPlayers() do
				if other == Players.LocalPlayer then
					continue
				end
				local _condition_1 = self.met[other]
				if _condition_1 == nil then
					_condition_1 = -math.huge
				end
				if now - _condition_1 < MEET_COOLDOWN then
					continue
				end
				local _otherRoot = other.Character
				if _otherRoot ~= nil then
					_otherRoot = _otherRoot:FindFirstChild("HumanoidRootPart")
				end
				local otherRoot = _otherRoot
				local _result = otherRoot
				if _result ~= nil then
					_result = _result:IsA("BasePart")
				end
				if not _result then
					continue
				end
				local _position = otherRoot.Position
				local _position_1 = root.Position
				local offset = _position - _position_1
				if offset.X * offset.X + offset.Z * offset.Z > MEET_DISTANCE * MEET_DISTANCE then
					continue
				end
				self.met[other] = now
				self:feel(Moods.greet)
			end
		end
	end
	do
		-- (Flamework) MoodController metadata
		Reflect.defineMetadata(MoodController, "identifier", "client/controllers/MoodController@MoodController")
		Reflect.defineMetadata(MoodController, "flamework:parameters", { "client/controllers/CharacterController@CharacterController", "client/controllers/MovementController@MovementController" })
		Reflect.defineMetadata(MoodController, "flamework:implements", { "$:flamework@OnStart" })
	end
end
-- (Flamework) MoodController decorators
Reflect.decorate(MoodController, "$:flamework@Controller", Controller, {})
return {
	MoodController = MoodController,
}
