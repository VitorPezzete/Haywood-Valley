-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local Reflect = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Reflect
local Controller = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Controller
local _services = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services")
local GuiService = _services.GuiService
local Players = _services.Players
local RunService = _services.RunService
local UserInputService = _services.UserInputService
local Workspace = _services.Workspace
local _vide = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "vide", "src")
local mount = _vide.mount
local source = _vide.source
local _decor = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "decor")
local decorItem = _decor.decorItem
local decorItemKey = _decor.decorItemKey
local decorVariant = _decor.decorVariant
local DECOR_ORDER = _decor.DECOR_ORDER
local planDecor = _decor.planDecor
local _interiorChoice = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "interiorChoice")
local isHouse = _interiorChoice.isHouse
local placeOf = _interiorChoice.placeOf
local toView = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "view").toView
local Events = TS.import(script, script.Parent.Parent, "network").Events
local _perf = TS.import(script, script.Parent.Parent, "perf")
local perfBegin = _perf.perfBegin
local perfEnd = _perf.perfEnd
local worldZoom = TS.import(script, script.Parent.Parent, "state", "camera").worldZoom
local phonePreview = TS.import(script, script.Parent.Parent, "state", "phone").phonePreview
local screen = TS.import(script, script.Parent.Parent, "state", "screen").screen
local DecorHud = TS.import(script, script.Parent.Parent, "ui", "DecorHud").DecorHud
local GroundLayer = TS.import(script, script.Parent.Parent, "world", "ground").GroundLayer
local _interior = TS.import(script, script.Parent.Parent, "world", "interior")
local INTERIOR_TILE = _interior.INTERIOR_TILE
local sheetRect = _interior.sheetRect
local decorImages = TS.import(script, script.Parent.Parent, "world", "pieces").decorImages
--* A tecla que liga e desliga o Decorar; as do modo: girar, guardar e as que escolhem a peça (1 a 9 e 0, na ordem do painel). 
local DECOR_KEY = Enum.KeyCode.B
local ROTATE_KEY = Enum.KeyCode.R
local STORE_KEYS = {
	[Enum.KeyCode.X] = true,
	[Enum.KeyCode.Delete] = true,
}
local SLOT_KEYS = { Enum.KeyCode.One, Enum.KeyCode.Two, Enum.KeyCode.Three, Enum.KeyCode.Four, Enum.KeyCode.Five, Enum.KeyCode.Six, Enum.KeyCode.Seven, Enum.KeyCode.Eight, Enum.KeyCode.Nine, Enum.KeyCode.Zero }
--* A peça que cabe aparece meio transparente no mouse; a que não cabe, bem apagada (como no carimbo do Diorama). 
local GHOST_OK = 0.3
local GHOST_REFUSED = 0.75
--* A peça que o jogador está mudando de lugar fica apagada no lugar de antes. 
local MOVING_DIM = 0.7
--* Quanto tempo a recusa do servidor fica no aviso, em segundos. 
local REFUSAL_SECONDS = 3
--* Com tudo igual (a célula, a peça, a direção), o plano é refeito no máximo a cada tanto, em segundos. 
local REPLAN_EVERY = 0.25
--* O que o jogador tem na mão no Decorar: uma peça nova do inventário, uma peça que ele pôs ou uma peça móvel da casa. 
--[[
	*
	 * Decorar a casa (etapa E2; regras em `shared/decor.ts`, servidor em `DecorService`). Na própria casa, B (ou o
	 * botão Decorar) liga o modo: o painel mostra o inventário de teste; escolhida uma peça (clique, ou 1 a 9 e 0), ela
	 * segue o mouse meio transparente, já na variante que o chão pede e encaixada na parede, e bem apagada onde não
	 * cabe, com o motivo no aviso. Clique põe. Clicar numa peça posta (ou numa peça móvel da casa: pote, cadeira, baú)
	 * pega para mudar de lugar; R gira entre as direções (a cadeira de frente e as de lado), X ou Delete guarda de
	 * volta, Backspace ou o botão direito larga (o Esc é do menu do Roblox) o que está na mão, B de novo sai. O boneco continua andando (é assim que a
	 * tela anda pela casa). O servidor confere tudo e responde com a peça (ou com a recusa).
	 
]]
local DecorController
do
	DecorController = setmetatable({}, {
		__tostring = function()
			return "DecorController"
		end,
	})
	DecorController.__index = DecorController
	function DecorController.new(...)
		local self = setmetatable({}, DecorController)
		return self:constructor(...) or self
	end
	function DecorController:constructor(scene, actions)
		self.scene = scene
		self.actions = actions
		self.active = source(false)
		self.collapsed = source(false)
		self.available = source(false)
		self.chosen = source(nil)
		self.stock = source({})
		self.status = source({
			key = "decor.status.choose",
		})
		self.form = 0
		self.ghost = {}
		self.ghostKey = ""
		self.planKey = ""
		self.plannedAt = 0
		self.refusedUntil = 0
	end
	function DecorController:onStart()
		if not self.scene.interior then
			return nil
		end
		Events.decorStock:connect(function(text)
			local stock = {}
			for _, entry in string.split(text, ",") do
				local _binding = string.split(entry, "=")
				local id = _binding[1]
				local n = _binding[2]
				local count = tonumber(n)
				if id ~= nil and count ~= nil then
					stock[id] = count
				end
			end
			self.stock(stock)
			-- Acabou a peça escolhida: larga.
			local holding = self.holding
			local _result = holding
			if _result ~= nil then
				_result = _result.kind
			end
			local _condition = _result == "new"
			if _condition then
				local _id = holding.item.id
				local _condition_1 = stock[_id]
				if _condition_1 == nil then
					_condition_1 = 0
				end
				_condition = _condition_1 <= 0
			end
			if _condition then
				self:drop()
			end
		end)
		Events.decorRefused:connect(function(reason, piece, wanted, found)
			self.status({
				key = reason,
				piece = if piece ~= "" then piece else nil,
				wanted = if wanted ~= "" then (string.split(wanted, ",")) else nil,
				found = if found ~= "" then found else nil,
			})
			self.refusedUntil = os.clock() + REFUSAL_SECONDS
		end)
		self.scene:onMapChanged(function()
			return self:setActive(false)
		end)
		UserInputService.InputBegan:Connect(function(input, processed)
			return self:input(input, processed)
		end)
		RunService.RenderStepped:Connect(function()
			return self:update()
		end)
		mount(function()
			return DecorHud({
				available = function()
					return self.available()
				end,
				active = function()
					return self.active()
				end,
				collapsed = function()
					return self.collapsed()
				end,
				onCollapse = function(value)
					return self.collapsed(value)
				end,
				chosen = function()
					return self.chosen()
				end,
				stock = function()
					return self.stock()
				end,
				status = function()
					return self.status()
				end,
				onToggle = function()
					return self:setActive(not self.active())
				end,
				onChoose = function(id)
					return self:choose(id)
				end,
				onRotate = function()
					return self:rotate()
				end,
				onStore = function()
					return self:store()
				end,
			})
		end, Players.LocalPlayer:WaitForChild("PlayerGui"))
	end
	function DecorController:onPhone()
		return phonePreview() ~= nil or (UserInputService.TouchEnabled and not UserInputService.KeyboardEnabled)
	end
	function DecorController:atHome()
		local place = placeOf(Players.LocalPlayer)
		return screen() == "playing" and place ~= nil and isHouse(place.id) and place.owner == Players.LocalPlayer.UserId
	end
	function DecorController:setActive(on)
		if on and not self:atHome() then
			return nil
		end
		if on and not self.active() then
			self.collapsed(DecorController:onPhone())
		end
		self.active(on)
		if not on then
			self:drop()
			self.chosen(nil)
		end
		self.status({
			key = "decor.status.choose",
		})
	end
	function DecorController:choose(id)
		local item = decorItem(id)
		if not item or not self.active() then
			return nil
		end
		if self.chosen() == id then
			return self:drop()
		end
		local _exp = self.stock()
		local _id = id
		local _condition = _exp[_id]
		if _condition == nil then
			_condition = 0
		end
		if _condition <= 0 then
			self.status({
				key = "decor.refuse.none",
				piece = decorItemKey(id),
			})
			self.refusedUntil = os.clock() + REFUSAL_SECONDS
			return nil
		end
		self:drop()
		self.holding = {
			kind = "new",
			item = item,
		}
		self.form = 0
		self.chosen(id)
	end
	function DecorController:drop()
		self.holding = nil
		self.chosen(nil)
		self:clearGhost()
		local _result = self.actions:currentView()
		if _result ~= nil then
			_result:dim(self.dimmed, 0)
		end
		self.dimmed = nil
	end
	function DecorController:clearGhost()
		for _, label in self.ghost do
			label:Destroy()
		end
		table.clear(self.ghost)
		self.ghostKey = ""
		self.planKey = ""
	end
	function DecorController:rotate()
		if not self.active() then
			return nil
		end
		local holding = self.holding
		if holding and holding.kind ~= "piece" then
			self.form = (self.form + 1) % #holding.item.forms
			return nil
		end
		local cell = self:mouseCell()
		local _condition = cell
		if _condition then
			local _result = self.actions:currentBoard()
			if _result ~= nil then
				_result = _result:decorAt(cell[1], cell[2])
			end
			_condition = _result
		end
		local decor = _condition
		if not decor then
			return nil
		end
		local state = decor[1]
		if #state.item.forms > 1 then
			Events.decorMove:fire(state.key, (state.form + 1) % #state.item.forms, state.ax, state.ay)
		end
	end
	function DecorController:store()
		if not self.active() then
			return nil
		end
		local holding = self.holding
		local _result = holding
		if _result ~= nil then
			_result = _result.kind
		end
		if _result == "decor" then
			Events.decorStore:fire(holding.key)
			self:drop()
			return nil
		end
		local cell = self:mouseCell()
		local _condition = cell
		if _condition then
			local _result_1 = self.actions:currentBoard()
			if _result_1 ~= nil then
				_result_1 = _result_1:decorAt(cell[1], cell[2])
			end
			_condition = _result_1
		end
		local decor = _condition
		if decor then
			Events.decorStore:fire(decor[1].key)
		end
	end
	function DecorController:input(input, processed)
		if input.KeyCode == DECOR_KEY and not processed then
			return self:setActive(not self.active())
		end
		if not self.active() or processed then
			return nil
		end
		if input.KeyCode == ROTATE_KEY then
			return self:rotate()
		end
		local _keyCode = input.KeyCode
		if STORE_KEYS[_keyCode] ~= nil then
			return self:store()
		end
		if input.KeyCode == Enum.KeyCode.Backspace or input.UserInputType == Enum.UserInputType.MouseButton2 then
			if self.holding then
				self:drop()
			else
				self:setActive(false)
			end
			return nil
		end
		local _keyCode_1 = input.KeyCode
		local slot = (table.find(SLOT_KEYS, _keyCode_1) or 0) - 1
		if slot >= 0 and DECOR_ORDER[slot + 1] ~= nil then
			return self:choose(DECOR_ORDER[slot + 1])
		end
		-- O mouse pelo `GetMouseLocation` (as mesmas medidas do `WorldToViewportPoint`); o toque vem sem a barra de cima.
		if input.UserInputType == Enum.UserInputType.MouseButton1 then
			self:click(UserInputService:GetMouseLocation())
		elseif input.UserInputType == Enum.UserInputType.Touch then
			local inset = GuiService:GetGuiInset()
			self:click(Vector2.new(input.Position.X, input.Position.Y) + inset)
		end
	end
	function DecorController:mouseCell(at)
		local camera = Workspace.CurrentCamera
		local interior = self.scene.interior
		if not camera or not interior then
			return nil
		end
		local point = at or UserInputService:GetMouseLocation()
		local corner = camera:WorldToViewportPoint(toView(interior:cellCorner(0, 0)))
		local zoom = worldZoom()
		local x = math.floor((point.X - corner.X) / zoom / INTERIOR_TILE)
		local y = math.floor((point.Y - corner.Y) / zoom / INTERIOR_TILE)
		return if x >= 0 and y >= 0 and x < 64 and y < 64 then { x, y } else nil
	end
	function DecorController:click(at)
		local board = self.actions:currentBoard()
		local cell = self:mouseCell(at)
		if not board or not cell then
			return nil
		end
		local holding = self.holding
		local _binding = cell
		local ax = _binding[1]
		local ay = _binding[2]
		if not holding then
			-- Sem nada na mão: pega a peça posta, ou a móvel da casa, que está sob o mouse.
			local decor = board:decorAt(ax, ay)
			if decor then
				self.holding = {
					kind = "decor",
					key = decor[1].key,
					item = decor[1].item,
				}
				self.form = decor[1].form
				self.dimmed = decor[1].key
				local _result = self.actions:currentView()
				if _result ~= nil then
					_result:dim(self.dimmed, MOVING_DIM)
				end
				self.status({
					key = "decor.status.moving",
				})
				return nil
			end
			local piece = board:at(ax, ay)
			if piece and piece.mode == 0 and not piece.spot.test then
				self.holding = {
					kind = "piece",
					id = piece.spot.id,
				}
				self.dimmed = piece.spot.id
				local _result = self.actions:currentView()
				if _result ~= nil then
					_result:dim(self.dimmed, MOVING_DIM)
				end
				self.status({
					key = "decor.status.moving",
				})
			end
			return nil
		end
		local plan = self:planFor(holding, ax, ay)
		if not plan.ok then
			if plan.refusal then
				self.status(plan.refusal)
			end
			self.refusedUntil = os.clock() + REFUSAL_SECONDS
			return nil
		end
		if holding.kind == "new" then
			Events.decorPlace:fire(holding.item.id, self.form, ax, ay)
			-- Continua com a peça na mão enquanto sobrar (o servidor manda quantas sobram).
			local _exp = self.stock()
			local _id = holding.item.id
			local _condition = _exp[_id]
			if _condition == nil then
				_condition = 0
			end
			if _condition <= 1 then
				self:drop()
			end
		elseif holding.kind == "decor" then
			Events.decorMove:fire(holding.key, self.form, ax, ay)
			self:drop()
		else
			Events.decorMovePiece:fire(holding.id, ax, ay)
			self:drop()
		end
	end
	function DecorController:planFor(holding, ax, ay)
		local board = self.actions:currentBoard()
		if holding.kind == "piece" then
			local _pieces = board.pieces
			local _id = holding.id
			local state = _pieces[_id]
			if not state then
				return {
					ok = false,
					variant = 0,
					x = ax,
					y = ay,
				}
			end
			local def = state.spot.def
			local x = ax - math.floor((def.w - 1) / 2)
			local y = ay - math.floor((def.h - 1) / 2)
			local ok = board:fits(state, x, y)
			return {
				ok = ok,
				variant = if ok then board:variantFor(state, x, y) else state.variant,
				x = x,
				y = y,
				refusal = if ok then nil else {
					key = "decor.refuse.blocked",
				},
			}
		end
		return planDecor(board, holding.item, self.form, ax, ay, if holding.kind == "decor" then holding.key else nil)
	end
	function DecorController:update()
		local home = self:atHome()
		if home ~= self.available() then
			self.available(home)
		end
		if self.active() and not home then
			self:setActive(false)
		end
		if not self.active() then
			return nil
		end
		local holding = self.holding
		local cell = self:mouseCell()
		local interior = self.scene.interior
		if not holding or not cell or not interior then
			self:clearGhost()
			if not holding and os.clock() > self.refusedUntil and self.status().key ~= "decor.status.choose" then
				self.status({
					key = "decor.status.choose",
				})
			end
			return nil
		end
		-- O `planDecor` inteiro só roda quando a célula, a peça na mão ou a direção mudam, ou a cada `REPLAN_EVERY`
		-- (o tabuleiro pode mudar por um aviso do servidor): antes, rodava a cada quadro (seção 5.1 do
		-- `PLANO_OTIMIZACAO.md`).
		local now = os.clock()
		local which = if holding.kind == "piece" then holding.id elseif holding.kind == "decor" then holding.key else holding.item.id
		local planKey = `{holding.kind}|{which}|{self.form}|{cell[1]},{cell[2]}`
		if planKey == self.planKey and now - self.plannedAt < REPLAN_EVERY then
			return nil
		end
		self.planKey = planKey
		self.plannedAt = now
		local started = perfBegin("Decorar")
		local plan = self:planFor(holding, cell[1], cell[2])
		perfEnd("Decorar", started)
		local key = `{holding.kind}|{self.form}|{plan.variant}|{plan.x}|{plan.y}|{plan.ok}`
		if key ~= self.ghostKey then
			self:clearGhost()
			self.ghostKey = key
			if holding.kind == "piece" then
				local _pieces = self.actions:currentBoard().pieces
				local _id = holding.id
				local state = _pieces[_id]
				if state then
					local _ghost = self.ghost
					local _arg0 = self:pieceGhost(state, plan)
					table.insert(_ghost, _arg0)
				end
			else
				local variant = decorVariant({
					item = holding.item,
					form = self.form,
					variant = plan.variant,
				})
				for _, label in decorImages(interior, holding.item, variant, plan.x, plan.y, GroundLayer.Shadow) do
					local _exp = self.ghost
					table.insert(_exp, label)
				end
			end
			for _, label in self.ghost do
				label.ImageTransparency = if plan.ok then GHOST_OK else GHOST_REFUSED
			end
		end
		local fits = if holding.kind == "piece" then {
			key = "decor.status.fitsPlain",
		} else {
			key = "decor.status.fits",
			piece = decorItemKey(holding.item.id),
		}
		if os.clock() > self.refusedUntil then
			self.status(if plan.ok then fits else (plan.refusal or {
				key = "decor.refuse.blocked",
			}))
		end
	end
	function DecorController:pieceGhost(state, plan)
		local interior = self.scene.interior
		local _ = self.actions:currentBoard()
		local _object = table.clone(state)
		setmetatable(_object, nil)
		_object.variant = plan.variant
		local def = _:defOf(_object)
		local art = sheetRect({ def.sheet, def.col, def.row }, def.w, def.h)
		local label = Instance.new("ImageLabel")
		label.Name = "DecorGhost"
		label.BackgroundTransparency = 1
		label.ResampleMode = Enum.ResamplerMode.Pixelated
		label.Image = art.image
		label.ImageRectOffset = art.offset
		label.ImageRectSize = art.size
		label.Size = UDim2.fromOffset(art.size.X, art.size.Y)
		local _exp = interior:canvasOf(0, 0)
		local _arg0 = Vector2.new(plan.x, plan.y) * INTERIOR_TILE
		local at = _exp + _arg0
		label.Position = UDim2.fromOffset(at.X, at.Y)
		label.ZIndex = GroundLayer.Shadow
		-- Na camada viva do chão, com as peças (por cima delas, como antes) e sem refazer o canvas grande dos tiles.
		label.Parent = interior.live.gui
		return label
	end
	do
		-- (Flamework) DecorController metadata
		Reflect.defineMetadata(DecorController, "identifier", "client/controllers/DecorController@DecorController")
		Reflect.defineMetadata(DecorController, "flamework:parameters", { "client/controllers/SceneController@SceneController", "client/controllers/ActionController@ActionController" })
		Reflect.defineMetadata(DecorController, "flamework:implements", { "$:flamework@OnStart" })
	end
end
-- (Flamework) DecorController decorators
Reflect.decorate(DecorController, "$:flamework@Controller", Controller, {})
return {
	DecorController = DecorController,
}
