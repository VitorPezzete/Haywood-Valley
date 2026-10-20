-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local Reflect = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Reflect
local Controller = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Controller
local subscribe = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "charm", "src").subscribe
local _services = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services")
local Players = _services.Players
local RunService = _services.RunService
local UserInputService = _services.UserInputService
local _vide = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "vide", "src")
local mount = _vide.mount
local source = _vide.source
local _actions = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "actions")
local ACTION_ATTRIBUTE = _actions.ACTION_ATTRIBUTE
local encodeAction = _actions.encodeAction
local parseAction = _actions.parseAction
local PUSH_AFTER = _actions.PUSH_AFTER
local PUSH_STREAK = _actions.PUSH_STREAK
local SIT_TURN_HOLD = _actions.SIT_TURN_HOLD
local TAP_CLOSED = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiorMap").TAP_CLOSED
local decorItem = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "decor").decorItem
local _fixtures = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "fixtures")
local chestOfPiece = _fixtures.chestOfPiece
local CHEST_TAP_SECONDS = _fixtures.CHEST_TAP_SECONDS
local _pieces = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "pieces")
local canLift = _pieces.canLift
local canPull = _pieces.canPull
local canPush = _pieces.canPush
local dirStep = _pieces.dirStep
local frontSpot = _pieces.frontSpot
local handlingOf = _pieces.handlingOf
local PieceBoard = _pieces.PieceBoard
local STEP_SECONDS = _pieces.STEP_SECONDS
local TAP_REACH = _pieces.TAP_REACH
local _view = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "view")
local groundOffset = _view.groundOffset
local SCREEN_RIGHT = _view.SCREEN_RIGHT
local TOWARD_CAMERA = _view.TOWARD_CAMERA
local worldToArtPx = _view.worldToArtPx
local WALK_SPEED = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "character").WALK_SPEED
local Events = TS.import(script, script.Parent.Parent, "network").Events
local _perf = TS.import(script, script.Parent.Parent, "perf")
local perfBegin = _perf.perfBegin
local perfEnd = _perf.perfEnd
local screen = TS.import(script, script.Parent.Parent, "state", "screen").screen
local ActionHud = TS.import(script, script.Parent.Parent, "ui", "ActionHud").ActionHud
local t = TS.import(script, script.Parent.Parent, "ui", "i18n").t
local FixtureView = TS.import(script, script.Parent.Parent, "world", "fixtures").FixtureView
local createCard = TS.import(script, script.Parent.Parent, "world", "card").createCard
local _graalArt = TS.import(script, script.Parent.Parent, "world", "graalArt")
local CARRY_FRAMES = _graalArt.CARRY_FRAMES
local PUSH_FPS = _graalArt.PUSH_FPS
local PUSH_FRAMES = _graalArt.PUSH_FRAMES
local WALK_FRAMES = _graalArt.WALK_FRAMES
local WALK_STEP_PX = _graalArt.WALK_STEP_PX
local _interior = TS.import(script, script.Parent.Parent, "world", "interior")
local INTERIOR_TILE = _interior.INTERIOR_TILE
local sheetRect = _interior.sheetRect
local PieceView = TS.import(script, script.Parent.Parent, "world", "pieces").PieceView
--* As teclas da ação: F no teclado (o A do Graal é andar para a esquerda aqui) e X no controle. 
local ACTION_KEYS = {
	[Enum.KeyCode.F] = true,
	[Enum.KeyCode.ButtonX] = true,
}
--* Quanto dura levantar o objeto do chão, em segundos, antes de ele ir para cima da cabeça. 
local LIFT_SECONDS = 0.25
--* Abaixo desta fração do passo, quem tenta andar está parado contra alguma coisa. 
local STUCK_FRACTION = 0.3
--* Quanto à frente do pé se procura a peça, em pixels de arte: logo depois do bloqueio do personagem. 
local REACH_PROBES = { 10, 14, 20 }
--[[
	*
	 * Deitado, quanto o pé do desenho fica abaixo do meio da célula do travesseiro: a cabeça da pose deitada
	 * tem o meio 23 pixels acima do pé (a célula de 32 em y 8 da tela, o pé em 47), e o rosto cai no travesseiro.
	 
]]
local LIE_FEET_BELOW_PILLOW = 23
--* Abaixo desta velocidade, em studs por segundo, quem para num assento senta. 
local SIT_STILL_SPEED = 0.5
--* Dormir: quanto a tela leva para escurecer, quanto fica escura e quanto se espera o servidor, em segundos. 
local SLEEP_FADE = 0.6
local SLEEP_DARK = 1.5
local SLEEP_TIMEOUT = 8
--* Um pedido de passo sem resposta do servidor é esquecido depois deste tempo, em segundos. 
local STEP_TIMEOUT = 1
--* A pose de um boneco neste quadro, que o `CharacterController` desenha. 
--* A direção da tela mais perto do movimento (x para a direita, z para baixo), ou nada parado. 
local function dirOf(move)
	local x = move:Dot(SCREEN_RIGHT)
	local z = move:Dot(TOWARD_CAMERA)
	if math.abs(x) < 0.3 and math.abs(z) < 0.3 then
		return nil
	end
	if math.abs(x) >= math.abs(z) then
		return if x > 0 then 3 else 1
	end
	return if z > 0 then 2 else 0
end
local function opposite(dir)
	return (dir + 2) % 4
end
--[[
	*
	 * As ações do boneco, como no Graal Online Classic:
	 *
	 * - **Sentar** (tile 3: cadeira, sofá, vaso) e **deitar** (4 e 5: cama): o boneco anda por cima e, ao parar,
	 *   senta virado para onde o assento olha (`seatFacing`) ou deita com a cabeça no travesseiro e a coberta
	 *   por cima (os próprios tiles da parte de baixo da cama, num cartão na frente do boneco). Sentado, um toque
	 *   numa direção vira o boneco sem levantar; segurar a direção levanta e anda (`updateSeat`).
	 * - **Nadar** (11, água funda): só a cabeça e os ombros aparecem.
	 * - **Água rasa** (6, "swamp" no Graal): o boneco anda com os pés na água, em qualquer pose de pé.
	 * - **Empurrar**: andando contra o que bloqueia por `PUSH_AFTER`, o boneco faz força; se for uma peça que se
	 *   move, ela desliza uma célula, e quem continua andando contra ela segue empurrando, célula por célula. Sem
	 *   tecla, como no Graal.
	 * - **Segurar e puxar**: com F (ou X no controle, ou o botão na tela) apertado de frente para uma peça, o
	 *   boneco segura; só andar para trás puxa, uma célula por vez, com a peça junto. Para os lados e para a
	 *   frente ele não anda enquanto segura. Soltar a tecla solta a peça.
	 * - **Levantar, carregar, pôr no chão e jogar**: F de frente para um pote ou um caixote levanta acima da
	 *   cabeça; com ele, F parado põe no chão à frente e F andando joga. O pote quebra ao cair; o caixote pousa.
	 *
	 * Sentar, deitar e nadar cada cliente tira do lugar em que o boneco parou; empurrar, segurar e puxar vêm do
	 * atributo `Action` do jogador (o servidor grava o que o cliente dele pede); carregar, das peças, que são do
	 * servidor (PieceService). O próprio jogador vê a ação dele na hora, sem esperar a rede.
	 
]]
local ActionController
do
	ActionController = setmetatable({}, {
		__tostring = function()
			return "ActionController"
		end,
	})
	ActionController.__index = ActionController
	function ActionController.new(...)
		local self = setmetatable({}, ActionController)
		return self:constructor(...) or self
	end
	function ActionController:constructor(scene, movement, mapController, dialogue)
		self.scene = scene
		self.movement = movement
		self.mapController = mapController
		self.dialogue = dialogue
		self.prompt = source(nil)
		self.corner = Vector3.zero
		self.liftUntil = 0
		self.stuckFacing = 2
		self.sent = ""
		self.localFacing = 2
		self.localMoving = false
		self.beds = {}
		self.closedTaps = {}
		self.localLying = false
		self.decorListeners = {}
		self.fixtureListeners = {}
		self.poses = {}
		self.remoteActions = {}
	end
	function ActionController:onStart()
		if self.scene.interior then
			-- Os avisos do servidor trazem o mapa: o que chega de um mapa de onde o jogador já saiu fica de fora.
			local here = function(map)
				return map == self.scene.mapKey and self.board ~= nil
			end
			Events.pieceChanged:connect(function(map, id, x, y, mode, holder, variant)
				if here(map) then
					self:changed(id, x, y, mode, holder, variant)
				end
			end)
			Events.pieceThrown:connect(function(map, id, holder, x, y, mode, variant)
				if here(map) then
					self:thrown(id, holder, x, y, mode, variant)
				end
			end)
			Events.tapChanged:connect(function(map, x, y, open)
				if not here(map) then
					return nil
				end
				local key = self.board.map:key(x, y)
				if open then
					self.closedTaps[key] = nil
				else
					self.closedTaps[key] = true
				end
				local _result = self.scene.interior
				if _result ~= nil then
					_result:setAnimatedTile(x, y, if open then nil else TAP_CLOSED)
				end
			end)
			Events.decorChanged:connect(function(map, key, item, form, variant, x, y, ax, ay)
				if here(map) then
					self:decorChanged(key, item, form, variant, x, y, ax, ay)
				end
			end)
			Events.fixtureChanged:connect(function(map, id, on)
				if not here(map) or not self.fixtures then
					return nil
				end
				self.fixtures:set(id, on)
				local cells = self.fixtures:cellsOf(id)
				for _, listener in self.fixtureListeners do
					listener(id, on, cells)
				end
			end)
			Events.slept:connect(function(woke, waiting)
				return self:slept(woke, waiting)
			end)
			self:useMap()
			self.scene:onMapChanged(function()
				return self:useMap()
			end)
		end
		UserInputService.InputBegan:Connect(function(input, processed)
			local _condition = not processed
			if _condition then
				local _keyCode = input.KeyCode
				_condition = ACTION_KEYS[_keyCode] ~= nil
			end
			if _condition then
				self:press()
			end
		end)
		UserInputService.InputEnded:Connect(function(input)
			local _keyCode = input.KeyCode
			if ACTION_KEYS[_keyCode] ~= nil then
				self:unpress()
			end
		end)
		Players.LocalPlayer.CharacterAdded:Connect(function()
			self:stopHolding(true)
			self:leaveSeat()
		end)
		RunService.Heartbeat:Connect(function()
			return self:tick()
		end)
		local playing = source(screen() == "playing")
		subscribe(screen, function(value)
			return playing(value == "playing")
		end)
		mount(function()
			return ActionHud({
				prompt = self.prompt,
				visible = playing,
				onDown = function()
					return self:press()
				end,
				onUp = function()
					return self:unpress()
				end,
			})
		end, Players.LocalPlayer:WaitForChild("PlayerGui"))
	end
	function ActionController:useMap()
		local map = self.scene.map
		local interior = self.scene.interior
		if not map or not interior then
			return nil
		end
		self:stopHolding(true)
		self:leaveSeat()
		self.pendingPush = nil
		self.streak = nil
		for player in self.beds do
			self:leaveBed(player)
		end
		table.clear(self.closedTaps)
		self.board = PieceBoard.new(map)
		self.view = PieceView.new(self.board, interior)
		local _result = self.fixtures
		if _result ~= nil then
			_result:destroy()
		end
		self.fixtures = FixtureView.new(self.board, interior)
		self.corner = interior:cellCorner(0, 0)
		Events.piecesReady:fire()
	end
	function ActionController:currentBoard()
		return self.board
	end
	function ActionController:onDecor(listener)
		local _decorListeners = self.decorListeners
		local _listener = listener
		table.insert(_decorListeners, _listener)
	end
	function ActionController:onFixture(listener)
		local _fixtureListeners = self.fixtureListeners
		local _listener = listener
		table.insert(_fixtureListeners, _listener)
	end
	function ActionController:currentFixtures()
		return self.fixtures
	end
	function ActionController:currentView()
		return self.view
	end
	function ActionController:decorChanged(key, id, form, variant, x, y, ax, ay)
		local board = self.board
		local item = decorItem(id)
		if not item then
			board:removeDecor(key)
			local _result = self.view
			if _result ~= nil then
				_result:removeDecor(key)
			end
			for _, listener in self.decorListeners do
				listener(key, nil)
			end
			return nil
		end
		local state = {
			key = key,
			item = item,
			form = form,
			variant = variant,
			x = x,
			y = y,
			ax = ax,
			ay = ay,
		}
		board:setDecor(state)
		local _result = self.view
		if _result ~= nil then
			_result:refreshDecor(state)
		end
		for _, listener in self.decorListeners do
			listener(key, state)
		end
	end
	function ActionController:poseFor(player, position, moving, facing, walked)
		local pose = self:choose(player, position, moving, facing, walked)
		if pose.anim ~= 3 then
			self:leaveBed(player)
		end
		-- Na água rasa, de pé (andando, parado, carregando, empurrando), a água cobre os pés e a sombra some.
		if self.board and not pose.swim and pose.anim ~= 3 and pose.anim ~= 2 then
			local _binding = self:cellOf(position)
			local x = _binding[1]
			local y = _binding[2]
			if self.board:kind(x, y) == 6 then
				pose.wade = true
				pose.shadow = false
			end
		end
		if player == Players.LocalPlayer then
			self.localFacing = pose.facing
			self.localMoving = moving
			self.localLying = pose.anim == 3
		end
		return pose
	end
	function ActionController:forget(player)
		self:leaveBed(player)
		local _poses = self.poses
		local _player = player
		_poses[_player] = nil
		local _remoteActions = self.remoteActions
		local _player_1 = player
		_remoteActions[_player_1] = nil
	end
	function ActionController:remoteAction(player)
		local raw = player:GetAttribute(ACTION_ATTRIBUTE)
		local _remoteActions = self.remoteActions
		local _player = player
		local known = _remoteActions[_player]
		if known and known.raw == raw then
			return known.value
		end
		local value = parseAction(raw)
		local _remoteActions_1 = self.remoteActions
		local _player_1 = player
		local _arg1 = {
			raw = raw,
			value = value,
		}
		_remoteActions_1[_player_1] = _arg1
		return value
	end
	function ActionController:choose(player, position, moving, facing, walked)
		local now = os.clock()
		local walkFrame = if moving then math.floor(walked / WALK_STEP_PX) % WALK_FRAMES else 0
		local _poses = self.poses
		local _player = player
		local pose = _poses[_player]
		if not pose then
			pose = {
				anim = 0,
				frame = 0,
				facing = facing,
				swim = false,
				wade = false,
				shadow = true,
			}
			local _poses_1 = self.poses
			local _player_1 = player
			local _pose = pose
			_poses_1[_player_1] = _pose
		end
		-- Por padrão, andando ou parado; cada caso abaixo muda só o que é dele.
		pose.anim = if moving then 1 else 0
		pose.frame = walkFrame
		pose.facing = facing
		pose.swim = false
		pose.wade = false
		pose.shadow = true
		pose.at = nil
		pose.item = nil
		local _carried = self.board
		if _carried ~= nil then
			_carried = _carried:heldBy(player.UserId)
		end
		local carried = _carried
		if carried and carried.mode == 2 and self.view then
			pose.item = self.view:carriedArt(carried)
			if player == Players.LocalPlayer and now < self.liftUntil then
				pose.anim = 9
				pose.frame = 0
				return pose
			end
			pose.anim = if moving then 7 else 8
			pose.frame = if moving then math.floor(walked / WALK_STEP_PX) % CARRY_FRAMES else 0
			return pose
		end
		local action = if player == Players.LocalPlayer then self:localAction() else self:remoteAction(player)
		-- Sentado, virado para o lado que o jogador escolheu (o assento, por onde chegou ou um toque numa direção).
		local _result = action
		if _result ~= nil then
			_result = _result.kind
		end
		if _result == "sit" then
			pose.anim = 2
			pose.frame = 0
			pose.facing = action.facing
			pose.shadow = false
			return pose
		end
		if action then
			pose.anim = if action.kind == "push" then 4 elseif action.kind == "grab" then 5 else 6
			pose.frame = if action.kind == "push" then math.floor(now * PUSH_FPS) % PUSH_FRAMES else 0
			pose.facing = action.facing
			return pose
		end
		local board = self.board
		if not board then
			return pose
		end
		local _binding = self:cellOf(position)
		local x = _binding[1]
		local y = _binding[2]
		local kind = board:kind(x, y)
		if kind == 11 then
			pose.swim = true
			pose.shadow = false
			return pose
		end
		if moving then
			return pose
		end
		if kind == 4 or kind == 5 then
			pose.at = self:bedFor(player, x, y)
			pose.anim = 3
			pose.frame = 0
			pose.facing = 2
			pose.shadow = false
			return pose
		end
		if kind == 3 then
			-- Sem lado no desenho (as almofadas do castelo), senta virado para onde chegou.
			local seat = board:seatFacing(x, y)
			pose.anim = 2
			pose.frame = 0
			pose.facing = if seat ~= nil then seat else facing
			pose.shadow = false
		end
		return pose
	end
	function ActionController:localAction()
		if self.seat then
			return {
				kind = "sit",
				facing = self.seat.facing,
			}
		end
		if self.step then
			local _object = {
				kind = self.step.kind,
			}
			local _left = "facing"
			local _result = self.holding
			if _result ~= nil then
				_result = _result.facing
			end
			local _condition = _result
			if _condition == nil then
				_condition = (self.localFacing)
			end
			_object[_left] = _condition
			return _object
		end
		local _result = self.holding
		if _result ~= nil then
			_result = _result.confirmed
		end
		if _result then
			return {
				kind = "grab",
				facing = self.holding.facing,
			}
		end
		if self.stuckSince ~= nil and os.clock() - self.stuckSince >= PUSH_AFTER then
			return {
				kind = "push",
				facing = self.stuckFacing,
			}
		end
		-- Empurrando uma peça que desliza, o boneco segue fazendo força enquanto anda atrás dela.
		local streak = self.streak
		if streak and streak.dir == self.trying and os.clock() - streak.at < PUSH_STREAK then
			return {
				kind = "push",
				facing = streak.dir,
			}
		end
		return nil
	end
	function ActionController:cellOf(position)
		local px = self:pxOf(position)
		return { math.floor(px.X / INTERIOR_TILE), math.floor(px.Y / INTERIOR_TILE) }
	end
	function ActionController:pxOf(position)
		local _exp = worldToArtPx(position)
		local _arg0 = worldToArtPx(self.corner)
		return _exp - _arg0
	end
	function ActionController:bedFor(player, x, y)
		local board = self.board
		local pillow = y
		if board:kind(x, y) == 5 then
			while board:kind(x, pillow - 1) == 5 do
				pillow -= 1
			end
			if board:kind(x, pillow - 1) == 4 then
				pillow -= 1
			end
		else
			while board:kind(x, pillow + 1) == 4 do
				pillow += 1
			end
		end
		local _corner = self.corner
		local _arg0 = groundOffset(x * INTERIOR_TILE + INTERIOR_TILE / 2, pillow * INTERIOR_TILE + INTERIOR_TILE / 2 + LIE_FEET_BELOW_PILLOW)
		local at = _corner + _arg0
		local key = `{x},{pillow}`
		local _beds = self.beds
		local _player = player
		local _result = _beds[_player]
		if _result ~= nil then
			_result = _result.key
		end
		if _result == key then
			return at
		end
		self:leaveBed(player)
		local cells = self:coverCells(x, pillow + 1)
		if #cells > 0 then
			local _beds_1 = self.beds
			local _player_1 = player
			local _arg1 = {
				key = key,
				card = self:coverCard(player, cells),
			}
			_beds_1[_player_1] = _arg1
		end
		return at
	end
	function ActionController:lieResident(name, x, y)
		return if self.board then self:bedFor(`resident:{name}`, x, y) else nil
	end
	function ActionController:leaveResidentBed(name)
		self:leaveBed(`resident:{name}`)
	end
	function ActionController:coverCells(x, y)
		local board = self.board
		local cells = {}
		local seen = {}
		local queue = { { x, y } }
		while #queue > 0 and #cells < 64 do
			local _binding = table.remove(queue, 1)
			local cx = _binding[1]
			local cy = _binding[2]
			local key = board.map:key(cx, cy)
			if seen[key] ~= nil then
				continue
			end
			seen[key] = true
			if board:kind(cx, cy) ~= 5 then
				continue
			end
			local _arg0 = { cx, cy }
			table.insert(cells, _arg0)
			local _arg0_1 = { cx + 1, cy }
			local _arg1 = { cx - 1, cy }
			local _arg2 = { cx, cy + 1 }
			local _arg3 = { cx, cy - 1 }
			-- ▼ Array.push ▼
			table.insert(queue, _arg0_1)
			table.insert(queue, _arg1)
			table.insert(queue, _arg2)
			table.insert(queue, _arg3)
			-- ▲ Array.push ▲
		end
		return cells
	end
	function ActionController:coverCard(player, cells)
		local x0 = math.huge
		local y0 = math.huge
		local x1 = -math.huge
		local y1 = -math.huge
		for _, _binding in cells do
			local x = _binding[1]
			local y = _binding[2]
			x0 = math.min(x0, x)
			y0 = math.min(y0, y)
			x1 = math.max(x1, x)
			y1 = math.max(y1, y)
		end
		local size = Vector2.new(x1 - x0 + 1, y1 - y0 + 1) * INTERIOR_TILE
		local _corner = self.corner
		local _arg0 = groundOffset(x0 * INTERIOR_TILE, (y1 + 1) * INTERIOR_TILE)
		local base = _corner + _arg0
		local _exp = self.scene.interior.folder
		local _player = player
		local card = createCard(_exp, `Cover_{if type(_player) == "string" then player else player.Name}`, {
			image = "",
			size = size,
			anchor = Vector2.new(0, size.Y),
			frames = { Vector2.zero },
		}, base)
		card.image.Visible = false
		local gui = card.image.Parent
		for _, _binding in cells do
			local x = _binding[1]
			local y = _binding[2]
			local tile = self.board:top(x, y)
			if not tile then
				continue
			end
			local art = sheetRect(tile)
			local label = Instance.new("ImageLabel")
			label.BackgroundTransparency = 1
			label.Image = art.image
			label.ImageRectOffset = art.offset
			label.ImageRectSize = art.size
			label.ResampleMode = Enum.ResamplerMode.Pixelated
			label.Position = UDim2.fromOffset((x - x0) * INTERIOR_TILE, (y - y0) * INTERIOR_TILE)
			label.Size = UDim2.fromOffset(INTERIOR_TILE, INTERIOR_TILE)
			label.Parent = gui
		end
		return card
	end
	function ActionController:leaveBed(player)
		local _beds = self.beds
		local _player = player
		local bed = _beds[_player]
		if not bed then
			return nil
		end
		bed.card.part:Destroy()
		local _beds_1 = self.beds
		local _player_1 = player
		_beds_1[_player_1] = nil
	end
	function ActionController:changed(id, x, y, mode, holder, variant)
		local board = self.board
		local _pieces_1 = board.pieces
		local _id = id
		local state = _pieces_1[_id]
		if not state then
			return nil
		end
		local before = {
			x = state.x,
			y = state.y,
			mode = state.mode,
		}
		board:set(id, x, y, mode, holder, variant)
		local dx = x - before.x
		local dy = y - before.y
		local unit = math.abs(dx) + math.abs(dy) == 1
		local stepped = before.mode == 1 and mode == 1 and unit
		local pushed = before.mode == 0 and mode == 0 and unit
		-- Empurrada, a peça desliza para longe de quem empurra e o bloqueio vai junto; puxada, ele some no
		-- deslize, porque a peça vem para onde o jogador estava.
		self.view:refresh(state, stepped or pushed, pushed)
		local _condition = pushed
		if _condition then
			local _result = self.pendingPush
			if _result ~= nil then
				_result = _result.id
			end
			_condition = _result == id
		end
		if _condition then
			self.pendingPush = nil
			self.streak = {
				dir = self.stuckFacing,
				at = os.clock(),
			}
		end
		local me = Players.LocalPlayer.UserId
		local pending = self.pendingStep
		if pending and pending.id == id and stepped then
			self.pendingStep = nil
			self:beginStep(pending.kind, dx, dy)
		end
		local holding = self.holding
		if holding and holding.id == id then
			if mode == 1 and holder == me then
				holding.confirmed = true
			else
				self:stopHolding(false)
			end
		end
		if mode == 2 and holder == me and before.mode ~= 2 then
			-- Levantar: o boneco para um instante com o objeto à frente, depois anda com ele na cabeça.
			self.liftUntil = os.clock() + LIFT_SECONDS
			local release = self.movement:hold()
			task.delay(LIFT_SECONDS, release)
		end
	end
	function ActionController:thrown(id, holder, x, y, mode, variant)
		local board = self.board
		local _pieces_1 = board.pieces
		local _id = id
		local state = _pieces_1[_id]
		if not state then
			return nil
		end
		local thrower = Players:GetPlayerByUserId(holder)
		local _root = thrower
		if _root ~= nil then
			_root = _root.Character
			if _root ~= nil then
				_root = _root:FindFirstChild("HumanoidRootPart")
			end
		end
		local root = _root
		local _result = root
		if _result ~= nil then
			_result = _result:IsA("BasePart")
		end
		local from = if _result then Vector3.new(root.Position.X, 0, root.Position.Z) else self.scene.interior:cellCenter(state.x, state.y)
		board:set(id, x, y, mode, 0, variant)
		self.view:fly(state, from, mode == 3)
	end
	function ActionController:frontPiece(feet, dir)
		if dir == nil then
			dir = self.localFacing
		end
		local board = self.board
		if not board then
			return nil
		end
		local _binding = dirStep(dir)
		local sx = _binding[1]
		local sy = _binding[2]
		for _, reach in REACH_PROBES do
			local _feet = feet
			local _arg0 = Vector2.new(sx, sy) * reach
			local probe = _feet + _arg0
			local piece = board:at(math.floor(probe.X / INTERIOR_TILE), math.floor(probe.Y / INTERIOR_TILE))
			if piece and piece.mode == 0 then
				return piece
			end
		end
		return nil
	end
	function ActionController:frontTap(feet)
		local board = self.board
		if not board then
			return nil
		end
		local fx = math.floor(feet.X / INTERIOR_TILE)
		local fy = math.floor(feet.Y / INTERIOR_TILE)
		local _binding = dirStep(self.localFacing)
		local sx = _binding[1]
		local sy = _binding[2]
		local best
		local bestDistance = math.huge
		for _, _binding_1 in board.map.taps do
			local x = _binding_1[1]
			local y = _binding_1[2]
			local dx = x - fx
			local dy = y - fy
			if math.abs(dx) > TAP_REACH or math.abs(dy) > TAP_REACH or dx * sx + dy * sy <= 0 then
				continue
			end
			local distance = math.abs(dx) + math.abs(dy)
			if distance < bestDistance then
				best = { x, y }
				bestDistance = distance
			end
		end
		return best
	end
	function ActionController:localRoot()
		local _root = Players.LocalPlayer.Character
		if _root ~= nil then
			_root = _root:FindFirstChild("HumanoidRootPart")
		end
		local root = _root
		local _result = root
		if _result ~= nil then
			_result = _result:IsA("BasePart")
		end
		return if _result then root else nil
	end
	function ActionController:putSpot(state, feet)
		local def = state.spot.def
		local _binding = frontSpot(feet, self.localFacing, def.w, def.h)
		local x = _binding[1]
		local y = _binding[2]
		return if self.board:fits(state, x, y) then ({ x, y }) else nil
	end
	function ActionController:press()
		local board = self.board
		local root = self:localRoot()
		if not board or not root or screen() ~= "playing" or self.holding or self.step then
			return nil
		end
		local feet = self:pxOf(root.Position)
		local carried = board:heldBy(Players.LocalPlayer.UserId)
		if carried and carried.mode == 2 then
			if os.clock() < self.liftUntil then
				return nil
			end
			local spot = if self.localMoving then nil else self:putSpot(carried, feet)
			if spot then
				Events.placePiece:fire(carried.spot.id, spot[1], spot[2])
			else
				Events.throwPiece:fire(carried.spot.id, self.localFacing)
			end
			return nil
		end
		-- Uma tela na frente (diálogo) segura o personagem: a tecla não faz nada.
		if self.movement.holding() then
			return nil
		end
		-- Deitado numa cama, dorme.
		if self.localLying then
			self:sleep()
			return nil
		end
		local piece = self:frontPiece(feet)
		local handling = handlingOf(Players.LocalPlayer)
		if not piece then
			local fixture = self:frontFixture(feet)
			if fixture then
				Events.useFixture:fire(fixture.id)
				return nil
			end
			local tap = self:frontTap(feet)
			if tap then
				Events.toggleTap:fire(tap[1], tap[2])
			end
			return nil
		end
		-- O baú aberto fecha; o fechado abre num toque em F (segurar F segura para puxar, `unpress`).
		local chest = self.fixtures and chestOfPiece(board:defOf(piece)) ~= nil
		if chest and self.fixtures:pieceOpen(piece.spot.id) then
			Events.useFixture:fire(piece.spot.id)
			return nil
		end
		if canLift(handling, piece.spot.def) then
			Events.liftPiece:fire(piece.spot.id)
			return nil
		end
		if not canPull(handling, piece.spot.def) then
			if chest then
				Events.useFixture:fire(piece.spot.id)
			end
			return nil
		end
		self.chestTap = if chest then {
			id = piece.spot.id,
			since = os.clock(),
			x = piece.x,
			y = piece.y,
		} else nil
		Events.grabPiece:fire(piece.spot.id)
		self.holding = {
			id = piece.spot.id,
			facing = self.localFacing,
			confirmed = false,
			since = os.clock(),
			release = self.movement:hold(),
		}
	end
	function ActionController:unpress()
		local holding = self.holding
		local tap = self.chestTap
		self.chestTap = nil
		if not holding then
			return nil
		end
		Events.releasePiece:fire(holding.id)
		self:stopHolding(false)
		-- Um toque rápido no baú, sem puxar: abre (o servidor recebe na ordem, depois de soltar).
		local _piece = self.board
		if _piece ~= nil then
			local _pieces_1 = _piece.pieces
			local _id = holding.id
			_piece = _pieces_1[_id]
		end
		local piece = _piece
		if tap and tap.id == holding.id and os.clock() - tap.since < CHEST_TAP_SECONDS and piece and piece.x == tap.x and piece.y == tap.y then
			Events.useFixture:fire(holding.id)
		end
	end
	function ActionController:frontFixture(feet)
		local fixtures = self.fixtures
		if not fixtures or #fixtures.fixtures == 0 then
			return nil
		end
		local _binding = dirStep(self.localFacing)
		local sx = _binding[1]
		local sy = _binding[2]
		for _, reach in REACH_PROBES do
			local _feet = feet
			local _arg0 = Vector2.new(sx, sy) * reach
			local probe = _feet + _arg0
			local fixture = fixtures:fixtureAt(math.floor(probe.X / INTERIOR_TILE), math.floor(probe.Y / INTERIOR_TILE))
			if fixture then
				return fixture
			end
		end
		return nil
	end
	function ActionController:sleep()
		if self.sleepRequest then
			return nil
		end
		self.sleepRequest = {
			release = self.movement:hold(),
			since = os.clock(),
		}
		self.mapController:curtain(true, SLEEP_FADE)
		Events.sleep:fire()
		task.delay(SLEEP_TIMEOUT, function()
			local request = self.sleepRequest
			if request and os.clock() - request.since >= SLEEP_TIMEOUT - 0.05 then
				self:wake()
			end
		end)
	end
	function ActionController:slept(woke, waiting)
		if not woke then
			self:wake()
			if waiting > 0 then
				self.dialogue:say({ {
					name = function()
						return t("dialogue.tip")
					end,
					text = function()
						return t("sleep.waiting", {
							count = waiting,
						})
					end,
				} })
			end
			return nil
		end
		-- Quem esperava acordado na cama (o último a deitar foi outro) escurece agora.
		if not self.sleepRequest then
			self.sleepRequest = {
				release = self.movement:hold(),
				since = os.clock(),
			}
			self.mapController:curtain(true, SLEEP_FADE)
		end
		local request = self.sleepRequest
		task.delay(SLEEP_DARK, function()
			if self.sleepRequest == request then
				self:wake()
			end
		end)
	end
	function ActionController:wake()
		local request = self.sleepRequest
		if not request then
			return nil
		end
		self.sleepRequest = nil
		request.release()
		self.mapController:curtain(false, SLEEP_FADE * 2)
	end
	function ActionController:stopHolding(now)
		local _result = self.holding
		if _result ~= nil then
			_result.release()
		end
		self.holding = nil
		self.pendingStep = nil
		if now then
			self.step = nil
		end
	end
	function ActionController:beginStep(kind, dx, dy)
		local character = Players.LocalPlayer.Character
		if not character then
			return nil
		end
		self.step = {
			kind = kind,
			started = os.clock(),
			from = character:GetPivot(),
			delta = groundOffset(dx * INTERIOR_TILE, dy * INTERIOR_TILE),
		}
	end
	function ActionController:tick()
		local started = perfBegin("Acoes")
		self:advance()
		perfEnd("Acoes", started)
	end
	function ActionController:advance()
		local now = os.clock()
		local _result = self.view
		if _result ~= nil then
			_result:update(now)
		end
		-- O baú aberto que saiu do lugar (puxado, empurrado) fechou: as luzes e o som também ficam sabendo.
		if self.fixtures then
			for _, id in self.fixtures:update() do
				for _1, listener in self.fixtureListeners do
					listener(id, false, {})
				end
			end
		end
		local character = Players.LocalPlayer.Character
		local root = self:localRoot()
		local _humanoid = character
		if _humanoid ~= nil then
			_humanoid = _humanoid:FindFirstChildOfClass("Humanoid")
		end
		local humanoid = _humanoid
		local step = self.step
		if step and character then
			local t = math.clamp((now - step.started) / STEP_SECONDS, 0, 1)
			local _from = step.from
			local _arg0 = step.delta * t
			character:PivotTo(_from + _arg0)
			if t >= 1 then
				self.step = nil
			end
		end
		if self.pendingStep and now - self.pendingStep.sent > STEP_TIMEOUT then
			self.pendingStep = nil
		end
		if self.pendingPush and now - self.pendingPush.sent > STEP_TIMEOUT then
			self.pendingPush = nil
		end
		-- O servidor não deu a peça (outro jogador pegou antes, longe demais): solta o personagem.
		if self.holding and not self.holding.confirmed and now - self.holding.since > STEP_TIMEOUT then
			self:stopHolding(false)
		end
		local board = self.board
		local holding = self.holding
		local _condition = board and root and humanoid
		if _condition then
			local _result_1 = holding
			if _result_1 ~= nil then
				_result_1 = _result_1.confirmed
			end
			_condition = _result_1
			if _condition then
				_condition = not self.step and not self.pendingStep
			end
		end
		if _condition then
			self:tryStep(holding, root, humanoid)
		end
		-- Empurrar a parede: quem tenta andar e não sai do lugar.
		local _result_1 = humanoid
		if _result_1 ~= nil then
			_result_1 = _result_1.MoveDirection
		end
		local _condition_1 = _result_1
		if _condition_1 == nil then
			_condition_1 = Vector3.zero
		end
		local move = _condition_1
		local _result_2 = root
		if _result_2 ~= nil then
			_result_2 = _result_2.AssemblyLinearVelocity
		end
		local _condition_2 = _result_2
		if _condition_2 == nil then
			_condition_2 = Vector3.zero
		end
		local velocity = _condition_2
		local flat = Vector3.new(velocity.X, 0, velocity.Z).Magnitude
		local trying = dirOf(move)
		self.trying = trying
		local _result_3 = board
		if _result_3 ~= nil then
			_result_3 = _result_3:heldBy(Players.LocalPlayer.UserId)
			if _result_3 ~= nil then
				_result_3 = _result_3.mode
			end
		end
		local carrying = _result_3 == 2
		local swimming = false
		if board and root then
			local _binding = self:cellOf(root.Position)
			local cx = _binding[1]
			local cy = _binding[2]
			swimming = board:kind(cx, cy) == 11
		end
		local free = not holding and not self.step and not carrying and not swimming and not self.movement.holding()
		if free and trying ~= nil and flat < WALK_SPEED * STUCK_FRACTION then
			if self.stuckSince == nil or trying ~= self.stuckFacing then
				self.stuckSince = now
			end
			self.stuckFacing = trying
		else
			self.stuckSince = nil
		end
		if free and trying ~= nil and board and root then
			self:tryPush(board, root, trying, flat, now)
		end
		if board and root then
			self:updateSeat(board, root, trying, flat, carrying, now)
		end
		local action = self:localAction()
		local _result_4 = action
		if _result_4 ~= nil then
			_result_4 = _result_4.kind
		end
		local _result_5 = action
		if _result_5 ~= nil then
			_result_5 = _result_5.facing
		end
		local _condition_3 = _result_5
		if _condition_3 == nil then
			_condition_3 = 2
		end
		local value = encodeAction(_result_4, _condition_3)
		if value ~= self.sent then
			self.sent = value
			local _ = Events.setAction
			local _result_6 = action
			if _result_6 ~= nil then
				_result_6 = _result_6.kind
			end
			local _condition_4 = _result_6
			if _condition_4 == nil then
				_condition_4 = ""
			end
			local _result_7 = action
			if _result_7 ~= nil then
				_result_7 = _result_7.facing
			end
			local _condition_5 = _result_7
			if _condition_5 == nil then
				_condition_5 = 2
			end
			_:fire(_condition_4, _condition_5)
		end
		local prompt = self:promptFor(root)
		if prompt ~= self.prompt() then
			self.prompt(prompt)
		end
	end
	function ActionController:updateSeat(board, root, trying, flat, carrying, now)
		local _binding = self:cellOf(root.Position)
		local cx = _binding[1]
		local cy = _binding[2]
		local onSeat = board:kind(cx, cy) == 3
		local seat = self.seat
		if seat then
			if not onSeat or self.holding or self.step or carrying then
				self:leaveSeat()
				return nil
			end
			if trying == nil then
				seat.since = nil
				return nil
			end
			if seat.since == nil then
				seat.since = now
			end
			seat.facing = trying
			if now - seat.since > SIT_TURN_HOLD then
				self:leaveSeat()
			end
			return nil
		end
		if not onSeat or trying ~= nil or flat > SIT_STILL_SPEED or self.holding or self.step or carrying then
			return nil
		end
		if self.movement.holding() then
			return nil
		end
		local _condition = board:seatFacing(cx, cy)
		if _condition == nil then
			_condition = (self.localFacing)
		end
		local facing = _condition
		self.seat = {
			facing = facing,
			release = self.movement:hold(),
		}
	end
	function ActionController:leaveSeat()
		local _result = self.seat
		if _result ~= nil then
			_result.release()
		end
		self.seat = nil
	end
	function ActionController:tryPush(board, root, trying, flat, now)
		if self.pendingPush or flat >= WALK_SPEED * STUCK_FRACTION then
			return nil
		end
		local streak = self.streak
		local ready = (self.stuckSince ~= nil and now - self.stuckSince >= PUSH_AFTER) or (streak ~= nil and streak.dir == trying and now - streak.at < PUSH_STREAK)
		if not ready then
			return nil
		end
		local piece = self:frontPiece(self:pxOf(root.Position), trying)
		if not piece or not canPush(handlingOf(Players.LocalPlayer), piece.spot.def) then
			return nil
		end
		local _binding = dirStep(trying)
		local dx = _binding[1]
		local dy = _binding[2]
		if not board:fits(piece, piece.x + dx, piece.y + dy) then
			return nil
		end
		self.pendingPush = {
			id = piece.spot.id,
			sent = now,
		}
		Events.pushPiece:fire(piece.spot.id, dx, dy)
	end
	function ActionController:tryStep(holding, root, humanoid)
		local board = self.board
		local _pieces_1 = board.pieces
		local _id = holding.id
		local state = _pieces_1[_id]
		local trying = dirOf(humanoid.MoveDirection)
		if not state or trying == nil or trying ~= opposite(holding.facing) then
			return nil
		end
		local _binding = dirStep(trying)
		local dx = _binding[1]
		local dy = _binding[2]
		if not board:fits(state, state.x + dx, state.y + dy) then
			return nil
		end
		-- Para trás do jogador também tem de ter lugar.
		local feet = self:pxOf(root.Position)
		local _arg0 = Vector2.new(dx, dy) * INTERIOR_TILE
		local back = feet + _arg0
		if board:blocked(math.floor(back.X / INTERIOR_TILE), math.floor(back.Y / INTERIOR_TILE)) then
			return nil
		end
		self.pendingStep = {
			id = holding.id,
			kind = "pull",
			sent = os.clock(),
		}
		Events.stepPiece:fire(holding.id, dx, dy)
	end
	function ActionController:promptFor(root)
		local board = self.board
		if not board or not root or screen() ~= "playing" then
			return nil
		end
		if self.holding then
			return "action.pull"
		end
		local carried = board:heldBy(Players.LocalPlayer.UserId)
		if carried and carried.mode == 2 then
			local feet = self:pxOf(root.Position)
			return if not self.localMoving and self:putSpot(carried, feet) then "action.put" else "action.throw"
		end
		if self.movement.holding() then
			return nil
		end
		if self.localLying then
			return "action.sleep"
		end
		local feet = self:pxOf(root.Position)
		local piece = self:frontPiece(feet)
		if not piece then
			local fixture = self:frontFixture(feet)
			if fixture then
				local on = self.fixtures:isOn(fixture)
				if fixture.kind == "stove" then
					return if on then "action.stoveOff" else "action.cook"
				end
				return if on then "action.closeChest" else "action.openChest"
			end
			local tap = self:frontTap(feet)
			if not tap then
				return nil
			end
			local _closedTaps = self.closedTaps
			local _arg0 = board.map:key(tap[1], tap[2])
			return if _closedTaps[_arg0] ~= nil then "action.openTap" else "action.closeTap"
		end
		-- O baú: o toque abre e fecha (segurar F ainda segura para puxar).
		if self.fixtures and chestOfPiece(board:defOf(piece)) then
			return if self.fixtures:pieceOpen(piece.spot.id) then "action.closeChest" else "action.openChest"
		end
		local handling = handlingOf(Players.LocalPlayer)
		if canLift(handling, piece.spot.def) then
			return "action.lift"
		end
		return if canPull(handling, piece.spot.def) then "action.grab" else nil
	end
	do
		-- (Flamework) ActionController metadata
		Reflect.defineMetadata(ActionController, "identifier", "client/controllers/ActionController@ActionController")
		Reflect.defineMetadata(ActionController, "flamework:parameters", { "client/controllers/SceneController@SceneController", "client/controllers/MovementController@MovementController", "client/controllers/MapController@MapController", "client/controllers/DialogueController@DialogueController" })
		Reflect.defineMetadata(ActionController, "flamework:implements", { "$:flamework@OnStart" })
	end
end
-- (Flamework) ActionController decorators
Reflect.decorate(ActionController, "$:flamework@Controller", Controller, {})
return {
	ActionController = ActionController,
}
