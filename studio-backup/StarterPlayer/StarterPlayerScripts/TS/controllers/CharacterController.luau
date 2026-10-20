-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local Reflect = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Reflect
local Controller = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Controller
local _services = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services")
local Players = _services.Players
local RunService = _services.RunService
local _appearance = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "appearance")
local DEFAULT_LOOK = _appearance.DEFAULT_LOOK
local LOOK_ATTRIBUTE = _appearance.LOOK_ATTRIBUTE
local parseLook = _appearance.parseLook
local _interiorChoice = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiorChoice")
local MAP_ATTRIBUTE = _interiorChoice.MAP_ATTRIBUTE
local MAP_OWNER_ATTRIBUTE = _interiorChoice.MAP_OWNER_ATTRIBUTE
local MAP_SLOT_ATTRIBUTE = _interiorChoice.MAP_SLOT_ATTRIBUTE
local placeOf = _interiorChoice.placeOf
local WALK_SPEED = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "character").WALK_SPEED
local Faces = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "faces").Faces
local _moods = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "moods")
local DROWSY_AFTER = _moods.DROWSY_AFTER
local Moods = _moods.Moods
local SLEEP_AFTER = _moods.SLEEP_AFTER
local _view = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "view")
local ART_PX_PER_STUD = _view.ART_PX_PER_STUD
local CAMERA_LOOK = _view.LOOK
local SCREEN_RIGHT = _view.SCREEN_RIGHT
local SCREEN_UP = _view.SCREEN_UP
local TOWARD_CAMERA = _view.TOWARD_CAMERA
local VIEW_DEPTH_PER_PX = _view.VIEW_DEPTH_PER_PX
local snapToArtPx = _view.snapToArtPx
local worldToArtPx = _view.worldToArtPx
local _card = TS.import(script, script.Parent.Parent, "world", "card")
local cardCFrame = _card.cardCFrame
local createCard = _card.createCard
local _graalArt = TS.import(script, script.Parent.Parent, "world", "graalArt")
local ACTOR_FEET = _graalArt.ACTOR_FEET
local ACTOR_FIGURE = _graalArt.ACTOR_FIGURE
local BLINK_MAX = _graalArt.BLINK_MAX
local BLINK_MIN = _graalArt.BLINK_MIN
local BLINK_TIME = _graalArt.BLINK_TIME
local facingOf = _graalArt.facingOf
local poseRise = _graalArt.poseRise
local WALK_STEP_PX = _graalArt.WALK_STEP_PX
local _characterArt = TS.import(script, script.Parent.Parent, "world", "characterArt")
local BUBBLE_FRAME = _characterArt.BUBBLE_FRAME
local bubbleOffset = _characterArt.bubbleOffset
local FACE_SHEET = _characterArt.FACE_SHEET
local ChatBalloon = TS.import(script, script.Parent.Parent, "world", "chatBalloon").ChatBalloon
local GroundLayer = TS.import(script, script.Parent.Parent, "world", "ground").GroundLayer
local _puppet = TS.import(script, script.Parent.Parent, "world", "puppet")
local dressShell = _puppet.dressShell
local pooledShells = _puppet.pooledShells
local poseShell = _puppet.poseShell
local puppetOnScreen = _puppet.puppetOnScreen
local storeShell = _puppet.storeShell
local SWIM_SINK = _puppet.SWIM_SINK
local takeShell = _puppet.takeShell
local toneShell = _puppet.toneShell
local Sprites = TS.import(script, script.Parent.Parent, "world", "sprites").Sprites
local _water = TS.import(script, script.Parent.Parent, "world", "water")
local hasWadeSheet = _water.hasWadeSheet
local SPLASH_FPS = _water.SPLASH_FPS
local SPLASH_FRAMES = _water.SPLASH_FRAMES
local WADE_FRAMES = _water.WADE_FRAMES
local wadeImage = _water.wadeImage
local TILE_ANIMATION_FPS = TS.import(script, script.Parent.Parent, "world", "interior").TILE_ANIMATION_FPS
local _perf = TS.import(script, script.Parent.Parent, "perf")
local perfBegin = _perf.perfBegin
local perfEnd = _perf.perfEnd
--* Abaixo desta velocidade, em studs por segundo, o personagem conta como parado. 
local MOVING_SPEED = 0.5
--[[
	*
	 * A direção do boneco só segue o movimento acima desta velocidade: ao esbarrar num móvel, o personagem do
	 * Roblox escorrega devagar para o lado, e o boneco virava de lado ou de costas para o móvel (visto em
	 * 2026-10-17, segurando o baú de cima para baixo).
	 
]]
local FACING_SPEED = WALK_SPEED * 0.4
--* Pixels de arte andados entre dois passos do andar (meio ciclo de 8 quadros): um respingo por passo na água rasa. 
local STEP_PX = WALK_STEP_PX * 4
local SHADOW = Sprites.rockShadow
--* O balão encosta a ponta de baixo no ponto do chão; daí sobe até ficar acima da cabeça. 
local BUBBLE_ANCHOR = Vector2.new(BUBBLE_FRAME.X / 2, BUBBLE_FRAME.Y)
--[[
	*
	 * Quanto a borda de baixo do quadro do balão fica acima da altura do boneco (`figureHeight`), em
	 * pixels de arte. O desenho do balão deixa linhas vazias embaixo do quadro (2 nos de emoticon), então
	 * sobram uns 3 pixels entre o rabinho e o cabelo (com o Curto, o quadro fica 40 pixels acima da sola).
	 
]]
local BUBBLE_CLEARANCE = 1
--[[
	*
	 * Quanto o balão vem para perto da câmera, para ser desenhado depois do boneco: 4 pixels de chão, na
	 * profundidade comprimida do desenho.
	 
]]
local BUBBLE_NUDGE = 4 * VIEW_DEPTH_PER_PX
--* Uma reação em curso: qual (em `Faces.reactions`) e desde quando. 
--* O personagem do Roblox de um jogador e a parte que anda (que o streaming pode tirar deste cliente). 
--[[
	*
	 * Desenha o sprite de cada jogador sobre o personagem do Roblox dele, que é invisível e só serve
	 * para andar, colidir e chegar aos outros clientes. O boneco é uma cabeça e um corpo dos
	 * contribuidores, no formato do Graal, em camadas pintadas conforme o visual que o servidor guarda no
	 * jogador, em 4 direções, parado ou andando, piscando de vez em quando.
	 *
	 * As reações não têm rosto neste boneco: cada uma aparece pelo balão em cima da cabeça. Quem fica
	 * muito tempo parado fica entediado e depois dorme; as demais reações vêm do `MoodController`.
	 *
	 * O que o jogador escreve no chat aparece no balão de fala (`say`, chamado pelo `ChatController`).
	 * Os dois balões não se empilham: enquanto a fala está à mostra, a reação aparece como rosto dentro
	 * dela, à esquerda do texto, e o balão de reação some; se a reação ainda durar quando a fala sumir,
	 * o balão dela volta.
	 
]]
local CharacterController
do
	CharacterController = setmetatable({}, {
		__tostring = function()
			return "CharacterController"
		end,
	})
	CharacterController.__index = CharacterController
	function CharacterController.new(...)
		local self = setmetatable({}, CharacterController)
		return self:constructor(...) or self
	end
	function CharacterController:constructor(scene, actions, daylight)
		self.scene = scene
		self.actions = actions
		self.daylight = daylight
		self.actors = {}
		self.bodies = {}
		self.places = {}
		self.watchers = {}
		self.random = Random.new()
		self.frameListeners = {}
	end
	function CharacterController:onActorFrame(listener)
		local _frameListeners = self.frameListeners
		local _listener = listener
		table.insert(_frameListeners, _listener)
	end
	function CharacterController:onStart()
		Players.PlayerAdded:Connect(function(player)
			return self:watch(player)
		end)
		Players.PlayerRemoving:Connect(function(player)
			return self:forgetPlayer(player)
		end)
		for _, player in Players:GetPlayers() do
			self:watch(player)
		end
		RunService:BindToRenderStep("CharacterSprites", Enum.RenderPriority.Camera.Value - 1, function()
			return self:update()
		end)
		-- A sombra fica na camada viva do chão do mapa: o mapa novo tem outro chão.
		self.scene:onMapChanged(function()
			for _, actor in self.actors do
				actor.shadow:Destroy()
				actor.shadow = self.scene.live:addFlat(SHADOW, Vector3.zero, GroundLayer.Shadow)
				actor.shadow.Visible = false
				actor.shadowAt = nil
				actor.placed = false
				actor.onScreen = false
				actor.gui.Enabled = false
				actor.lastPx = nil
				actor.litAt = nil
			end
		end)
	end
	function CharacterController:sameMap(player)
		if player == Players.LocalPlayer or self.scene.mapKey == nil then
			return true
		end
		local _places = self.places
		local _player = player
		return _places[_player] == self.scene.mapKey
	end
	function CharacterController:conceal(actor)
		if not actor.onScreen then
			return nil
		end
		actor.onScreen = false
		actor.gui.Enabled = false
		actor.shadow.Visible = false
		local _result = actor.chat
		if _result ~= nil then
			_result:conceal()
		end
		self:float(actor, -1, Vector3.zero, 0, 0)
	end
	function CharacterController:counts()
		local onScreen = 0
		for _, actor in self.actors do
			if actor.onScreen then
				onScreen += 1
			end
		end
		local _object = {}
		local _left = "shown"
		-- ▼ ReadonlyMap.size ▼
		local _size = 0
		for _ in self.actors do
			_size += 1
		end
		-- ▲ ReadonlyMap.size ▲
		_object[_left] = _size
		_object.onScreen = onScreen
		_object.pool = pooledShells()
		return _object
	end
	function CharacterController:react(player, reaction, bubble)
		local _actors = self.actors
		local _player = player
		local actor = _actors[_player]
		if not actor or not Faces.reactions[reaction + 1] then
			return nil
		end
		-- Sem rosto para mudar, a reação que não sobe balão não teria o que mostrar: sobe sempre que houver.
		local _ = bubble
		local _1 = nil
		local now = os.clock()
		actor.feeling = {
			reaction = reaction,
			started = now,
		}
		actor.stillSince = now
	end
	function CharacterController:touch(player)
		local _actors = self.actors
		local _player = player
		local actor = _actors[_player]
		if actor then
			actor.stillSince = os.clock()
		end
	end
	function CharacterController:say(player, text)
		local _actors = self.actors
		local _player = player
		local actor = _actors[_player]
		-- Quem está noutro mapa não aparece aqui, nem a fala dele em cima do boneco (a janela do chat continua).
		if not actor or not self:sameMap(player) then
			return nil
		end
		if actor.chat == nil then
			actor.chat = ChatBalloon.new(self.scene.world, `{actor.card.part.Name}Chat`)
		end
		actor.chat:show(text)
		-- Falar também conta como atividade.
		actor.stillSince = os.clock()
	end
	function CharacterController:hush(player)
		local _actors = self.actors
		local _player = player
		local _result = _actors[_player]
		if _result ~= nil then
			_result = _result.chat
			if _result ~= nil then
				_result:hide()
			end
		end
	end
	function CharacterController:watch(player)
		local refresh = function()
			local _places = self.places
			local _exp = player
			local _result = placeOf(player)
			if _result ~= nil then
				_result = _result.key
			end
			_places[_exp] = _result
		end
		refresh()
		local connections = { player:GetAttributeChangedSignal(MAP_ATTRIBUTE):Connect(refresh), player:GetAttributeChangedSignal(MAP_OWNER_ATTRIBUTE):Connect(refresh), player:GetAttributeChangedSignal(MAP_SLOT_ATTRIBUTE):Connect(refresh), player.CharacterAdded:Connect(function(character)
			return self:setBody(player, character)
		end), player.CharacterRemoving:Connect(function()
			return self:setBody(player, nil)
		end) }
		local _watchers = self.watchers
		local _player = player
		_watchers[_player] = connections
		if player.Character then
			self:setBody(player, player.Character)
		end
	end
	function CharacterController:setBody(player, character)
		self:release(player)
		if character then
			local _bodies = self.bodies
			local _player = player
			local _arg1 = {
				character = character,
			}
			_bodies[_player] = _arg1
		else
			local _bodies = self.bodies
			local _player = player
			_bodies[_player] = nil
		end
	end
	function CharacterController:rootOf(body)
		local known = body.root
		if known and known.Parent == body.character then
			return known
		end
		local found = body.character:FindFirstChild("HumanoidRootPart")
		local _result = found
		if _result ~= nil then
			_result = _result:IsA("BasePart")
		end
		body.root = if _result then found else nil
		return body.root
	end
	function CharacterController:add(player, character)
		local shell = takeShell(self.scene.world, player.Name)
		local shadow = self.scene.live:addFlat(SHADOW, Vector3.zero, GroundLayer.Shadow)
		shadow.Visible = false
		local now = os.clock()
		local actor
		actor = {
			card = shell.card,
			gui = shell.gui,
			labels = shell.labels,
			hands = shell.hands,
			item = shell.item,
			wadeBack = shell.wadeBack,
			wadeFront = shell.wadeFront,
			splash = shell.splash,
			character = character,
			splashStart = -1,
			splashFoot = 0,
			step = 0,
			layers = {},
			height = 0,
			shadow = shadow,
			facing = 2,
			nextBlink = now + self.random:NextNumber(BLINK_MIN, BLINK_MAX),
			shownAnim = -1,
			shownFrame = -1,
			shownFacing = -1,
			shownClosed = false,
			shownSwim = false,
			rest = {
				reaction = -1,
				started = 0,
			},
			stillSince = now,
			bubbleShown = -1,
			placed = false,
			walked = 0,
			litKey = -1,
			onScreen = false,
			lookChanged = player:GetAttributeChangedSignal(LOOK_ATTRIBUTE):Connect(function()
				return self:dress(actor, self:lookOf(player))
			end),
		}
		self:dress(actor, self:lookOf(player))
		local _actors = self.actors
		local _player = player
		_actors[_player] = actor
		return actor
	end
	function CharacterController:lookOf(player)
		return parseLook(player:GetAttribute(LOOK_ATTRIBUTE)) or DEFAULT_LOOK
	end
	function CharacterController:dress(actor, look)
		local dressed = dressShell(actor, look, actor.facing)
		actor.layers = dressed.layers
		actor.height = dressed.height
		actor.shownAnim = -1
	end
	function CharacterController:release(player)
		local _actors = self.actors
		local _player = player
		local actor = _actors[_player]
		if not actor then
			return nil
		end
		actor.lookChanged:Disconnect()
		self.actions:forget(player)
		local _result = actor.bubble
		if _result ~= nil then
			_result = _result.part:Destroy()
		end
		local _result_1 = actor.chat
		if _result_1 ~= nil then
			_result_1:destroy()
		end
		actor.shadow:Destroy()
		local _actors_1 = self.actors
		local _player_1 = player
		_actors_1[_player_1] = nil
		storeShell({
			card = actor.card,
			gui = actor.gui,
			labels = actor.labels,
			hands = actor.hands,
			item = actor.item,
			wadeBack = actor.wadeBack,
			wadeFront = actor.wadeFront,
			splash = actor.splash,
		})
	end
	function CharacterController:forgetPlayer(player)
		self:release(player)
		local _bodies = self.bodies
		local _player = player
		_bodies[_player] = nil
		local _places = self.places
		local _player_1 = player
		_places[_player_1] = nil
		local _watchers = self.watchers
		local _player_2 = player
		local _condition = _watchers[_player_2]
		if _condition == nil then
			_condition = {}
		end
		for _, connection in _condition do
			connection:Disconnect()
		end
		local _watchers_1 = self.watchers
		local _player_3 = player
		_watchers_1[_player_3] = nil
	end
	function CharacterController:feelingOf(actor, now)
		local fired = actor.feeling
		if fired then
			if now - fired.started < Faces.reactions[fired.reaction + 1].seconds then
				return fired
			end
			actor.feeling = nil
		end
		local still = now - actor.stillSince
		local asleep = still >= SLEEP_AFTER and Moods.sleep.reaction >= 0
		local mood = if asleep then Moods.sleep elseif still >= DROWSY_AFTER then Moods.drowsy else nil
		if not mood or mood.reaction < 0 then
			return nil
		end
		local rest = actor.rest
		rest.reaction = mood.reaction
		rest.started = actor.stillSince + (if asleep then SLEEP_AFTER else DROWSY_AFTER)
		return rest
	end
	function CharacterController:pose(actor, pose, closed)
		poseShell(actor, actor, pose, closed)
	end
	function CharacterController:float(actor, bubble, position, elapsed, height)
		if bubble < 0 then
			if actor.bubbleShown >= 0 and actor.bubble then
				(actor.bubble.image.Parent).Enabled = false
			end
			actor.bubbleShown = -1
			return nil
		end
		if actor.bubble == nil then
			actor.bubble = createCard(self.scene.world, `{actor.card.part.Name}Bubble`, {
				image = FACE_SHEET,
				size = BUBBLE_FRAME,
				anchor = BUBBLE_ANCHOR,
				frames = { Vector2.zero },
			}, position)
		end
		local card = actor.bubble
		-- O balão salta para o lugar e depois flutua um pixel para cima e para baixo.
		local hop = if elapsed < 0.08 then -3 elseif elapsed < 0.16 then 1 else math.floor(elapsed * 2) % 2
		local _exp = cardCFrame(BUBBLE_FRAME, BUBBLE_ANCHOR, position)
		local _arg0 = (height + BUBBLE_CLEARANCE + hop) / ART_PX_PER_STUD
		local _arg0_1 = SCREEN_UP * _arg0
		local _arg0_2 = CAMERA_LOOK * BUBBLE_NUDGE
		card.part.CFrame = _exp + _arg0_1 - _arg0_2
		if bubble ~= actor.bubbleShown then
			actor.bubbleShown = bubble
			card.image.ImageRectOffset = bubbleOffset(bubble);
			(card.image.Parent).Enabled = true
		end
	end
	function CharacterController:light(actor, position)
		local key = self.daylight:lightKey()
		if key == actor.litKey and position == actor.litAt then
			return nil
		end
		actor.litKey = key
		actor.litAt = position
		local lit = self.daylight:lightAt(position)
		if lit == actor.lit then
			return nil
		end
		actor.lit = lit
		toneShell(actor, lit)
	end
	function CharacterController:wade(actor, pose, moving, now)
		local step = math.floor(actor.walked / STEP_PX)
		local stepped = step ~= actor.step
		actor.step = step
		local inWater = pose.wade
		actor.wadeFront.Visible = inWater
		local sheet = hasWadeSheet()
		actor.wadeBack.Visible = inWater and sheet
		if not inWater or not sheet then
			actor.splash.Visible = false
			actor.splashStart = -1
			return stepped
		end
		local frame = math.floor(now * TILE_ANIMATION_FPS) % WADE_FRAMES
		local set = function(label, row, index)
			local offset = wadeImage(row, index)[2]
			if label.ImageRectOffset ~= offset then
				label.ImageRectOffset = offset
			end
		end
		set(actor.wadeBack, 0, frame)
		set(actor.wadeFront, 1, frame)
		if moving and stepped then
			actor.splashStart = now
			actor.splashFoot = 1 - actor.splashFoot
		end
		local splashFrame = if actor.splashStart < 0 then -1 else math.floor((now - actor.splashStart) * SPLASH_FPS)
		local splashing = splashFrame >= 0 and splashFrame < SPLASH_FRAMES
		actor.splash.Visible = splashing
		if splashing then
			set(actor.splash, if actor.splashFoot == 0 then 2 else 3, splashFrame)
		else
			actor.splashStart = -1
		end
		return stepped
	end
	function CharacterController:update()
		local started = perfBegin("Bonecos")
		local now = os.clock()
		for player, body in self.bodies do
			local root = self:rootOf(body)
			-- Noutro mapa, ou com o personagem fora deste cliente (o streaming o tirou, longe): o boneco volta ao
			-- reservatório, sem deixar fantasma parado onde ele estava.
			if not root or not self:sameMap(player) then
				self:release(player)
				continue
			end
			local actor = self.actors[player] or self:add(player, body.character)
			-- O andar troca de quadro a cada `WALK_STEP_PX` andados na tela, como o Graal no passo dele.
			local screenPx = worldToArtPx(root.Position)
			if actor.lastPx then
				local _lastPx = actor.lastPx
				actor.walked += (screenPx - _lastPx).Magnitude
			end
			actor.lastPx = screenPx
			local velocity = root.AssemblyLinearVelocity
			local right = velocity:Dot(SCREEN_RIGHT)
			local down = velocity:Dot(TOWARD_CAMERA)
			local speed = math.sqrt(right * right + down * down)
			local moving = speed > MOVING_SPEED
			if moving then
				actor.stillSince = now
			end
			if speed > FACING_SPEED then
				actor.facing = facingOf(right, down, actor.facing)
			end
			-- Fora da tela (com a folga), nada de pose, luz, água nem balão (seção 3.3 do `PLANO_OTIMIZACAO.md`). O
			-- próprio jogador está sempre nela.
			if player ~= Players.LocalPlayer and not puppetOnScreen(screenPx) then
				self:conceal(actor)
				continue
			end
			-- A ação (sentar, deitar, nadar, empurrar, segurar, puxar, carregar) decide a pose e pode virar o boneco.
			local ground = snapToArtPx(Vector3.new(root.Position.X, 0, root.Position.Z))
			local pose = self.actions:poseFor(player, ground, moving, actor.facing, actor.walked)
			actor.facing = pose.facing
			if pose.anim == 3 then
				actor.stillSince = math.min(actor.stillSince, now - SLEEP_AFTER)
			end
			if now >= actor.nextBlink + BLINK_TIME then
				actor.nextBlink = now + self.random:NextNumber(BLINK_MIN, BLINK_MAX)
			end
			-- Deitado, de olho fechado.
			local closed = now >= actor.nextBlink or pose.anim == 3
			-- A pose mudou? Campo a campo, sem montar texto.
			local item = pose.item
			local _condition = pose.anim ~= actor.shownAnim or pose.frame ~= actor.shownFrame or pose.facing ~= actor.shownFacing or closed ~= actor.shownClosed or pose.swim ~= actor.shownSwim
			if not _condition then
				local _result = item
				if _result ~= nil then
					_result = _result.image
				end
				_condition = _result ~= actor.shownItemImage
				if not _condition then
					local _result_1 = item
					if _result_1 ~= nil then
						_result_1 = _result_1.offset
					end
					_condition = _result_1 ~= actor.shownItemOffset
				end
			end
			if _condition then
				actor.shownAnim = pose.anim
				actor.shownFrame = pose.frame
				actor.shownFacing = pose.facing
				actor.shownClosed = closed
				actor.shownSwim = pose.swim
				local _result = item
				if _result ~= nil then
					_result = _result.image
				end
				actor.shownItemImage = _result
				local _result_1 = item
				if _result_1 ~= nil then
					_result_1 = _result_1.offset
				end
				actor.shownItemOffset = _result_1
				self:pose(actor, pose, closed)
			end
			local position = if pose.at then snapToArtPx(pose.at) else ground
			self:light(actor, position)
			-- O cartão e a sombra só se mexem quando o pé muda de pixel de arte: a sombra fica na camada viva do chão.
			if position ~= actor.shadowAt then
				actor.shadowAt = position
				actor.card.part.CFrame = cardCFrame(ACTOR_FIGURE, ACTOR_FEET, position)
				self.scene.live:moveFlat(actor.shadow, SHADOW, position)
			end
			local shadowShown = actor.placed and pose.shadow
			if actor.shadow.Visible ~= shadowShown then
				actor.shadow.Visible = shadowShown
			end
			local stepped = self:wade(actor, pose, moving, now)
			for _, listener in self.frameListeners do
				listener(player, position, pose, moving, stepped)
			end
			local bubbles = perfBegin("Baloes")
			local feeling = self:feelingOf(actor, now)
			local bubble = if feeling then Faces.reactions[feeling.reaction + 1].bubble else -1
			-- Os balões sobem com a cabeça (sentado) e descem com ela (nadando).
			local height = actor.height + poseRise(pose.anim, pose.facing) - (if pose.swim then SWIM_SINK else 0)
			-- Com a fala à mostra, a reação vai como rosto dentro dela e o balão de reação fica escondido.
			local _result = actor.chat
			if _result ~= nil then
				_result = _result:update(now, position, height, bubble)
			end
			local _condition_1 = _result
			if _condition_1 == nil then
				_condition_1 = false
			end
			local talking = _condition_1
			self:float(actor, if talking then -1 else bubble, position, if feeling then now - feeling.started else 0, height)
			perfEnd("Baloes", bubbles)
			if not actor.onScreen then
				actor.placed = true
				actor.onScreen = true
				actor.gui.Enabled = true
				actor.shadow.Visible = pose.shadow
			end
		end
		perfEnd("Bonecos", started)
	end
	do
		-- (Flamework) CharacterController metadata
		Reflect.defineMetadata(CharacterController, "identifier", "client/controllers/CharacterController@CharacterController")
		Reflect.defineMetadata(CharacterController, "flamework:parameters", { "client/controllers/SceneController@SceneController", "client/controllers/ActionController@ActionController", "client/controllers/DaylightController@DaylightController" })
		Reflect.defineMetadata(CharacterController, "flamework:implements", { "$:flamework@OnStart" })
	end
end
-- (Flamework) CharacterController decorators
Reflect.decorate(CharacterController, "$:flamework@Controller", Controller, {})
return {
	CharacterController = CharacterController,
}
