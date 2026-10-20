-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local Reflect = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Reflect
local Controller = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Controller
local _services = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services")
local GuiService = _services.GuiService
local Players = _services.Players
local RunService = _services.RunService
local Stats = _services.Stats
local UserInputService = _services.UserInputService
local Workspace = _services.Workspace
local _vide = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "vide", "src")
local mount = _vide.mount
local source = _vide.source
local _view = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "view")
local screenDensity = _view.screenDensity
local zoomRange = _view.zoomRange
local _perf = TS.import(script, script.Parent.Parent, "perf")
local CANVAS_ROLE_ATTRIBUTE = _perf.CANVAS_ROLE_ATTRIBUTE
local setPerfOn = _perf.setPerfOn
local takePerf = _perf.takePerf
local _phone = TS.import(script, script.Parent.Parent, "state", "phone")
local phonePreview = _phone.phonePreview
local phoneScale = _phone.phoneScale
local parsePhone = _phone.parsePhone
local t = TS.import(script, script.Parent.Parent, "ui", "i18n").t
local DevPanel = TS.import(script, script.Parent.Parent, "ui", "DevPanel").DevPanel
local DESIGN = TS.import(script, script.Parent.Parent, "ui", "kit").DESIGN
--* Atributo do Workspace que mostra o painel de orçamento (true). 
local BUDGET_ATTRIBUTE = "OrcamentoTeste"
--* Atributo do Workspace que liga a prévia de celular: true (844 × 390, o comum) ou "LxA" em pontos. 
local PHONE_ATTRIBUTE = "CelularTeste"
--[[
	*
	 * Atributo do Workspace que deixa qualquer jogador abrir o painel pelo gesto do celular ou pelo atalho, fora do
	 * Studio (para um teste com amigos num servidor privado). Sem ele, só quem é do grupo dono do jogo (cargo 250 ou
	 * mais) ou o dono, quando o jogo é de uma pessoa.
	 
]]
local PANEL_FOR_ALL_ATTRIBUTE = "PainelParaTodos"
--* De quanto em quanto tempo o painel mede de novo, em segundos. 
local MEASURE_EVERY = 0.5
--* O nome do quadro que segura a interface do jogo dentro da tela do celular, em cada `ScreenGui`. 
local PHONE_FRAME = "PhoneScreen"
--* O gesto do celular: três dedos na tela ao mesmo tempo, soltos antes deste tempo, em segundos. 
local GESTURE_FINGERS = 3
local GESTURE_SECONDS = 0.8
--* Cargo mínimo no grupo dono do jogo para abrir o painel fora do Studio. 
local DEV_RANK = 250
--* Os papéis dos canvas do chão (`client/perf.ts`), na ordem do painel. 
local ROLES = { "fixo", "vivo", "mar" }
--* Um canvas do chão vigiado: cada mudança numa imagem dele obriga o Roblox a refazer o desenho. 
--[[
	*
	 * Ferramentas de desenvolvimento, no Studio (atalhos Ctrl+Shift+O e Ctrl+Shift+P), com os atributos de teste do
	 * Workspace (`OrcamentoTeste`, `CelularTeste`), que valem fora do Studio também, e, para quem pode (o grupo dono do
	 * jogo, ou todos com `PainelParaTodos`), pelo atalho Ctrl+Shift+O ou pelo gesto de três dedos no celular:
	 *
	 * - **Desempenho** (fase 0 do `PLANO_OTIMIZACAO.md`, seção 9.1): imagens (no chão fixo e na camada viva),
	 *   instâncias, cartões, bonecos, o tempo por quadro (média e pior), o tempo de cada sistema nosso por quadro
	 *   (`client/perf.ts`), quantas vezes por segundo cada canvas do chão é refeito, a memória (total, texturas,
	 *   interface, Lua, instâncias, animação) e a rede (recebido e enviado), medidos a cada meio segundo. Com o painel
	 *   fechado, nada disso é medido.
	 * - **Prévia de celular**: a câmera escolhe o zoom e a interface o `k` como num celular comum (`client/state/
	 *   phone.ts`); tudo aparece ampliado pelo inteiro que cabe, num retângulo no meio da tela, com o resto preto. A
	 *   interface do jogo vai para dentro do retângulo: os filhos de cada `ScreenGui` passam para um quadro do tamanho
	 *   dele, e voltam ao desligar.
	 
]]
local DevToolsController
do
	DevToolsController = setmetatable({}, {
		__tostring = function()
			return "DevToolsController"
		end,
	})
	DevToolsController.__index = DevToolsController
	function DevToolsController.new(...)
		local self = setmetatable({}, DevToolsController)
		return self:constructor(...) or self
	end
	function DevToolsController:constructor(scene, characters)
		self.scene = scene
		self.characters = characters
		self.budget = source(nil)
		self.phoneRect = source(nil)
		self.phoneLabel = source("")
		self.frames = {}
		self.lastMeasure = 0
		self.wrapped = {}
		self.canvases = {}
		self.developer = false
		self.touches = {}
		self.gestureFingers = 0
	end
	function DevToolsController:onStart()
		local studio = RunService:IsStudio()
		local apply = function()
			local phone = parsePhone(Workspace:GetAttribute(PHONE_ATTRIBUTE))
			if phonePreview() ~= phone then
				phonePreview(phone)
			end
			local on = Workspace:GetAttribute(BUDGET_ATTRIBUTE) == true
			setPerfOn(on)
			if not on then
				self.budget(nil)
				self:unwatchCanvases()
			end
		end
		Workspace:GetAttributeChangedSignal(PHONE_ATTRIBUTE):Connect(apply)
		Workspace:GetAttributeChangedSignal(BUDGET_ATTRIBUTE):Connect(apply)
		apply()
		self.developer = studio
		if not studio then
			task.spawn(function()
				self.developer = self:isDeveloper()
			end)
		end
		-- Os atalhos e o gesto ligam e desligam os atributos só neste cliente.
		UserInputService.InputBegan:Connect(function(input, processed)
			if input.UserInputType == Enum.UserInputType.Touch then
				self:touchBegan(input)
			end
			if processed then
				return nil
			end
			local ctrl = UserInputService:IsKeyDown(Enum.KeyCode.LeftControl) or UserInputService:IsKeyDown(Enum.KeyCode.RightControl)
			local shift = UserInputService:IsKeyDown(Enum.KeyCode.LeftShift) or UserInputService:IsKeyDown(Enum.KeyCode.RightShift)
			if not ctrl or not shift then
				return nil
			end
			if input.KeyCode == Enum.KeyCode.O and self:allowed() then
				self:toggleBudget()
			end
			if input.KeyCode == Enum.KeyCode.P and studio then
				Workspace:SetAttribute(PHONE_ATTRIBUTE, if Workspace:GetAttribute(PHONE_ATTRIBUTE) ~= nil then nil else true)
			end
		end)
		UserInputService.InputEnded:Connect(function(input)
			if input.UserInputType == Enum.UserInputType.Touch then
				self:touchEnded(input)
			end
		end)
		RunService.RenderStepped:Connect(function(dt)
			return self:tick(dt)
		end)
		mount(function()
			return DevPanel({
				budget = function()
					return self.budget()
				end,
				phoneRect = function()
					return self.phoneRect()
				end,
				phoneLabel = function()
					return self.phoneLabel()
				end,
			})
		end, Players.LocalPlayer:WaitForChild("PlayerGui"))
	end
	function DevToolsController:allowed()
		return self.developer or Workspace:GetAttribute(PANEL_FOR_ALL_ATTRIBUTE) == true
	end
	function DevToolsController:isDeveloper()
		local player = Players.LocalPlayer
		if game.CreatorType == Enum.CreatorType.User then
			return player.UserId == game.CreatorId
		end
		local ok, rank = pcall(function()
			return player:GetRankInGroup(game.CreatorId)
		end)
		return ok and rank >= DEV_RANK
	end
	function DevToolsController:toggleBudget()
		Workspace:SetAttribute(BUDGET_ATTRIBUTE, if Workspace:GetAttribute(BUDGET_ATTRIBUTE) == true then nil else true)
	end
	function DevToolsController:touchBegan(input)
		local _touches = self.touches
		local _input = input
		_touches[_input] = true
		-- ▼ ReadonlySet.size ▼
		local _size = 0
		for _ in self.touches do
			_size += 1
		end
		-- ▲ ReadonlySet.size ▲
		if _size == 1 then
			self.gestureStart = os.clock()
			self.gestureFingers = 0
		end
		local _exp = self.gestureFingers
		-- ▼ ReadonlySet.size ▼
		local _size_1 = 0
		for _ in self.touches do
			_size_1 += 1
		end
		-- ▲ ReadonlySet.size ▲
		self.gestureFingers = math.max(_exp, _size_1)
	end
	function DevToolsController:touchEnded(input)
		local _touches = self.touches
		local _input = input
		_touches[_input] = nil
		-- ▼ ReadonlySet.size ▼
		local _size = 0
		for _ in self.touches do
			_size += 1
		end
		-- ▲ ReadonlySet.size ▲
		if _size > 0 then
			return nil
		end
		local start = self.gestureStart
		self.gestureStart = nil
		if start == nil or self.gestureFingers < GESTURE_FINGERS or os.clock() - start > GESTURE_SECONDS then
			return nil
		end
		if self:allowed() then
			self:toggleBudget()
		end
	end
	function DevToolsController:tick(dt)
		if Workspace:GetAttribute(BUDGET_ATTRIBUTE) == true then
			-- Só com o painel aberto: o tempo de cada quadro e quais canvas do chão mudaram nele.
			local _frames = self.frames
			local _dt = dt
			table.insert(_frames, _dt)
			for _, watch in self.canvases do
				if not watch.touched then
					continue
				end
				watch.touched = false
				watch.frames += 1
			end
			local now = os.clock()
			if now - self.lastMeasure >= MEASURE_EVERY then
				local seconds = now - self.lastMeasure
				self.lastMeasure = now
				self:measure(seconds)
			end
		end
		self:updatePhone()
	end
	function DevToolsController:watchCanvases(guis)
		local _set = {}
		for _, _v in guis do
			_set[_v] = true
		end
		local present = _set
		for gui, watch in self.canvases do
			if present[gui] ~= nil then
				continue
			end
			for _, connection in watch.connections do
				connection:Disconnect()
			end
			self.canvases[gui] = nil
		end
		for _, gui in guis do
			if self.canvases[gui] ~= nil then
				continue
			end
			local watch = {
				role = gui:GetAttribute(CANVAS_ROLE_ATTRIBUTE),
				connections = {},
				touched = false,
				frames = 0,
			}
			local mark = function(property)
				if property ~= "AbsolutePosition" and property ~= "AbsoluteSize" and property ~= "AbsoluteRotation" then
					watch.touched = true
				end
			end
			local hook = function(instance)
				if not instance:IsA("GuiObject") then
					return nil
				end
				local changed = instance.Changed
				local _connections = watch.connections
				local _arg0 = changed:Connect(mark)
				table.insert(_connections, _arg0)
			end
			for _1, descendant in gui:GetDescendants() do
				hook(descendant)
			end
			local _connections = watch.connections
			local _arg0 = gui.DescendantAdded:Connect(function(instance)
				watch.touched = true
				hook(instance)
			end)
			table.insert(_connections, _arg0)
			local _connections_1 = watch.connections
			local _arg0_1 = gui.DescendantRemoving:Connect(function()
				watch.touched = true
			end)
			table.insert(_connections_1, _arg0_1)
			self.canvases[gui] = watch
		end
	end
	function DevToolsController:unwatchCanvases()
		for _, watch in self.canvases do
			for _1, connection in watch.connections do
				connection:Disconnect()
			end
		end
		table.clear(self.canvases)
	end
	function DevToolsController:measure(seconds)
		local images = 0
		local cards = 0
		local grounds = {}
		local descendants = self.scene.world:GetDescendants()
		for _, child in descendants do
			if child:IsA("ImageLabel") or child:IsA("ImageButton") then
				images += 1
			elseif child:IsA("SurfaceGui") then
				if child:GetAttribute(CANVAS_ROLE_ATTRIBUTE) ~= nil then
					table.insert(grounds, child)
				else
					cards += 1
				end
			end
		end
		local groundImages = {
			fixo = 0,
			vivo = 0,
			mar = 0,
		}
		for _, gui in grounds do
			local role = gui:GetAttribute(CANVAS_ROLE_ATTRIBUTE)
			for _1, child in gui:GetDescendants() do
				if child:IsA("ImageLabel") then
					groundImages[role] += 1
				end
			end
		end
		local redraws = {
			fixo = 0,
			vivo = 0,
			mar = 0,
		}
		for _, watch in self.canvases do
			redraws[watch.role] = math.max(redraws[watch.role], watch.frames / math.max(seconds, 1e-3))
			watch.frames = 0
		end
		self:watchCanvases(grounds)
		local total = 0
		local worst = 0
		for _, dt in self.frames do
			total += dt
			worst = math.max(worst, dt)
		end
		local count = math.max(#self.frames, 1)
		table.clear(self.frames)
		local systems = takePerf(count)
		local scripts = 0
		for _, reading in systems do
			if reading.name ~= "Baloes" then
				scripts += reading.perFrameMs
			end
		end
		local tag = function(which)
			local ok, mb = pcall(function()
				return Stats:GetMemoryUsageMbForTag(which)
			end)
			return if ok then mb else 0
		end
		local actors = self.characters:counts()
		local _self = self
		local _object = {}
		local _left = "map"
		local _condition = self.scene.mapKey
		if _condition == nil then
			_condition = "-"
		end
		_object[_left] = _condition
		_object.images = images
		_object.groundStill = groundImages.fixo
		_object.groundLive = groundImages.vivo + groundImages.mar
		_object.instances = #descendants + 1
		_object.cards = cards
		_object.frameMs = (total / count) * 1000
		_object.worstMs = worst * 1000
		_object.fps = if total > 0 then count / total else 0
		_object.scriptsMs = scripts
		_object.systems = systems
		local _left_1 = "redraws"
		-- ▼ ReadonlyArray.map ▼
		local _newValue = table.create(#ROLES)
		local _callback = function(role)
			return redraws[role]
		end
		for _k, _v in ROLES do
			_newValue[_k] = _callback(_v, _k - 1, ROLES)
		end
		-- ▲ ReadonlyArray.map ▲
		_object[_left_1] = _newValue
		_object.memoryMb = Stats:GetTotalMemoryUsageMb()
		_object.textureMb = tag(Enum.DeveloperMemoryTag.GraphicsTexture)
		_object.characterTextureMb = tag(Enum.DeveloperMemoryTag.GraphicsTextureCharacter)
		_object.guiMb = tag(Enum.DeveloperMemoryTag.Gui)
		_object.luaMb = tag(Enum.DeveloperMemoryTag.LuaHeap)
		_object.instancesMb = tag(Enum.DeveloperMemoryTag.Instances)
		_object.animationMb = tag(Enum.DeveloperMemoryTag.Animation)
		_object.receiveKbps = Stats.DataReceiveKbps
		_object.sendKbps = Stats.DataSendKbps
		_object.actorsShown = actors.shown
		_object.actorsOnScreen = actors.onScreen
		_object.actorsPool = actors.pool
		_self.budget(_object)
	end
	function DevToolsController:updatePhone()
		local phone = phonePreview()
		local camera = Workspace.CurrentCamera
		if not phone or not camera then
			if self.phoneRect() ~= nil then
				self.phoneRect(nil)
				self:unwrapAll()
			end
			return nil
		end
		local real = camera.ViewportSize
		local density = screenDensity(real)
		local scale = phoneScale(phone, real * density)
		local _arg0 = scale / density
		local size = phone * _arg0
		local min = (real - size) / 2
		local rect = Rect.new(math.floor(min.X), math.floor(min.Y), math.floor(min.X) + size.X, math.floor(min.Y) + size.Y)
		local old = self.phoneRect()
		if not old or old.Min ~= rect.Min or old.Max ~= rect.Max then
			self.phoneRect(rect)
		end
		local zoom = zoomRange(phone.Y)
		local k = math.max(1, math.floor(math.min(phone.X / DESIGN.X, phone.Y / DESIGN.Y)))
		local label = t("dev.phone.label", {
			w = tostring(phone.X),
			h = tostring(phone.Y),
			zoom = `{zoom.farthest}-{zoom.closest}`,
			k = tostring(k),
		})
		if label ~= self.phoneLabel() then
			self.phoneLabel(label)
		end
		self:wrapAll(rect)
	end
	function DevToolsController:wrapAll(rect)
		local gui = Players.LocalPlayer:FindFirstChild("PlayerGui")
		if not gui then
			return nil
		end
		for _, child in gui:GetChildren() do
			if not child:IsA("ScreenGui") or child.Name == "DevTools" then
				continue
			end
			local wrap = self.wrapped[child]
			if not wrap then
				local frame = Instance.new("Frame")
				frame.Name = PHONE_FRAME
				frame.BackgroundTransparency = 1
				frame.Parent = child
				for _1, other in child:GetChildren() do
					if other ~= frame and other:IsA("GuiObject") then
						other.Parent = frame
					end
				end
				-- O que entra depois (o Vide recoloca o que o `Show` esconde) vai para dentro também.
				local connection = child.ChildAdded:Connect(function(added)
					if added ~= frame and added:IsA("GuiObject") then
						task.defer(function()
							if added.Parent == child then
								added.Parent = frame
							end
						end)
					end
				end)
				wrap = {
					frame = frame,
					connection = connection,
				}
				local _wrapped = self.wrapped
				local _wrap = wrap
				_wrapped[child] = _wrap
			end
			-- A tela que não ignora a barra de cima começa abaixo dela (o `AbsolutePosition` da ScreenGui vem 0, 0).
			local offset = if child.IgnoreGuiInset then Vector2.zero else (GuiService:GetGuiInset())
			wrap.frame.Position = UDim2.fromOffset(rect.Min.X - offset.X, rect.Min.Y - offset.Y)
			wrap.frame.Size = UDim2.fromOffset(rect.Width, rect.Height)
		end
		if not self.guiWatch then
			self.guiWatch = gui.ChildRemoved:Connect(function(removed)
				local _wrapped = self.wrapped
				local _removed = removed
				-- ▼ Map.delete ▼
				local _valueExisted = _wrapped[_removed] ~= nil
				_wrapped[_removed] = nil
				-- ▲ Map.delete ▲
				return _valueExisted
			end)
		end
	end
	function DevToolsController:unwrapAll()
		for gui, wrap in self.wrapped do
			wrap.connection:Disconnect()
			for _, child in wrap.frame:GetChildren() do
				child.Parent = gui
			end
			wrap.frame:Destroy()
		end
		table.clear(self.wrapped)
	end
	do
		-- (Flamework) DevToolsController metadata
		Reflect.defineMetadata(DevToolsController, "identifier", "client/controllers/DevToolsController@DevToolsController")
		Reflect.defineMetadata(DevToolsController, "flamework:parameters", { "client/controllers/SceneController@SceneController", "client/controllers/CharacterController@CharacterController" })
		Reflect.defineMetadata(DevToolsController, "flamework:implements", { "$:flamework@OnStart" })
	end
end
-- (Flamework) DevToolsController decorators
Reflect.decorate(DevToolsController, "$:flamework@Controller", Controller, {})
return {
	BUDGET_ATTRIBUTE = BUDGET_ATTRIBUTE,
	PHONE_ATTRIBUTE = PHONE_ATTRIBUTE,
	PANEL_FOR_ALL_ATTRIBUTE = PANEL_FOR_ALL_ATTRIBUTE,
	DevToolsController = DevToolsController,
}
