-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local Reflect = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Reflect
local Controller = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Controller
local _services = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services")
local ContentProvider = _services.ContentProvider
local RunService = _services.RunService
local MISSING_IMAGE = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "assets").MISSING_IMAGE
local decodeSavedLook = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "playerData").decodeSavedLook
local _view = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "view")
local groundOffset = _view.groundOffset
local snapToArtPx = _view.snapToArtPx
local worldToArtPx = _view.worldToArtPx
local cardCFrame = TS.import(script, script.Parent.Parent, "world", "card").cardCFrame
local createCollider = TS.import(script, script.Parent.Parent, "world", "collider").createCollider
local _graalArt = TS.import(script, script.Parent.Parent, "world", "graalArt")
local ACTOR_FEET = _graalArt.ACTOR_FEET
local ACTOR_FIGURE = _graalArt.ACTOR_FIGURE
local BLINK_MAX = _graalArt.BLINK_MAX
local BLINK_MIN = _graalArt.BLINK_MIN
local BLINK_TIME = _graalArt.BLINK_TIME
local figureLayers = _graalArt.figureLayers
local GroundLayer = TS.import(script, script.Parent.Parent, "world", "ground").GroundLayer
local INTERIOR_TILE = TS.import(script, script.Parent.Parent, "world", "interior").INTERIOR_TILE
local _puppet = TS.import(script, script.Parent.Parent, "world", "puppet")
local dressShell = _puppet.dressShell
local poseShell = _puppet.poseShell
local puppetOnScreen = _puppet.puppetOnScreen
local storeShell = _puppet.storeShell
local takeShell = _puppet.takeShell
local toneShell = _puppet.toneShell
local Sprites = TS.import(script, script.Parent.Parent, "world", "sprites").Sprites
local _perf = TS.import(script, script.Parent.Parent, "perf")
local perfBegin = _perf.perfBegin
local perfEnd = _perf.perfEnd
local SHADOW = Sprites.rockShadow
--* Um morador do mapa montado: o que ele é, onde fica e, enquanto está na tela, o boneco dele. 
--[[
	*
	 * Os moradores do mapa montado (etapa F do Diorama, seção 12.20): os bonecos que o autor pôs no mapa (a chave
	 * `moradores` do bloco, `InteriorData.residents`), desenhados como os jogadores (`client/world/puppet.ts`: as mesmas
	 * camadas, folhas e estilos por peça), parados, sentados (no assento, para onde o Diorama guardou) ou deitados (na
	 * cama, com a cabeça no travesseiro e a coberta por cima, pelo `ActionController`, como o jogador). Piscam, pegam o
	 * tom do dia (estão na pasta `World`) e a luz dos halos em que estão. Ninguém os atravessa: a célula de cada um
	 * (de quem deita, a cama da coluna) tem um bloqueio e as peças e o Decorar a recusam (`InteriorMap.residentCells`).
	 *
	 * Desempenho (seção "Desempenho" do CLAUDE.md): fora da tela, o morador não tem boneco (o dele volta ao reservatório
	 * comum com os jogadores) e não faz nada; na tela, só pisca e relê a luz quando ela muda. As folhas carregam por trás
	 * ao montar o mapa, só as dos visuais dos moradores dele.
	 *
	 * Os moradores ainda não andam nem falam (os moradores vivos vêm depois, 12.20): o nome fica guardado para o
	 * diálogo.
	 
]]
local ResidentController
do
	ResidentController = setmetatable({}, {
		__tostring = function()
			return "ResidentController"
		end,
	})
	ResidentController.__index = ResidentController
	function ResidentController.new(...)
		local self = setmetatable({}, ResidentController)
		return self:constructor(...) or self
	end
	function ResidentController:constructor(scene, actions, daylight)
		self.scene = scene
		self.actions = actions
		self.daylight = daylight
		self.residents = {}
		self.colliders = {}
		self.dirty = true
		self.random = Random.new()
		self.warned = {}
	end
	function ResidentController:onStart()
		self.scene:onMapChanged(function()
			self:clear()
			self.dirty = true
		end)
		RunService:BindToRenderStep("ResidentSprites", Enum.RenderPriority.Camera.Value - 1, function()
			return self:update()
		end)
	end
	function ResidentController:counts()
		local onScreen = 0
		for _, resident in self.residents do
			if resident.shell then
				onScreen += 1
			end
		end
		return {
			shown = #self.residents,
			onScreen = onScreen,
		}
	end
	function ResidentController:clear()
		for _, resident in self.residents do
			self:hide(resident)
			local _result = resident.shadow
			if _result ~= nil then
				_result:Destroy()
			end
			if resident.data.pose == "lie" then
				self.actions:leaveResidentBed(resident.data.name)
			end
		end
		table.clear(self.residents)
		for _, collider in self.colliders do
			collider:Destroy()
		end
		table.clear(self.colliders)
	end
	function ResidentController:build()
		local interior = self.scene.interior
		local map = self.scene.map
		local _data = map
		if _data ~= nil then
			_data = _data.data
		end
		local data = _data
		if not interior or not map or not data then
			self.dirty = false
			return nil
		end
		local _result = self.actions:currentBoard()
		if _result ~= nil then
			_result = _result.map
		end
		if _result ~= map then
			return nil
		end
		self.dirty = false
		local now = os.clock()
		local sheets = {}
		for _, entry in data.residents or {} do
			local look = decodeSavedLook(entry.look)
			if not look then
				local key = `{data.id}/{entry.name}`
				if not (self.warned[key] ~= nil) then
					self.warned[key] = true
					warn(`[Moradores] {data.id}: o visual de {entry.name} não abre ({entry.look}); o morador fica de fora`)
				end
				continue
			end
			for _1, layer in figureLayers(look) do
				if layer.image ~= "" and layer.image ~= MISSING_IMAGE then
					local _image = layer.image
					sheets[_image] = true
				end
			end
			local lying = entry.pose == "lie"
			local at = snapToArtPx((if lying then self.actions:lieResident(entry.name, entry.x, entry.y) else nil) or interior:cellCenter(entry.x, entry.y))
			local anim = if lying then 3 elseif entry.pose == "sit" then 2 else 0
			local shadow
			if anim == 0 then
				shadow = interior.live:addFlat(SHADOW, at, GroundLayer.Shadow)
				shadow.Visible = false
			end
			local _residents = self.residents
			local _arg0 = {
				data = entry,
				look = look,
				at = at,
				screenPx = worldToArtPx(at),
				pose = {
					anim = anim,
					frame = 0,
					facing = if lying then 2 else (entry.facing),
					swim = false,
				},
				shadow = shadow,
				nextBlink = now + self.random:NextNumber(BLINK_MIN, BLINK_MAX),
				closed = lying,
				litKey = -1,
			}
			table.insert(_residents, _arg0)
		end
		-- Ninguém atravessa um morador: um bloqueio de uma célula em cada célula dele.
		for key in map.residentCells do
			local x = key % 1024
			local y = math.floor(key / 1024)
			local _exp = interior:cellCorner(x, y)
			local _arg0 = groundOffset(INTERIOR_TILE / 2, INTERIOR_TILE)
			local base = _exp + _arg0
			local _colliders = self.colliders
			local _arg0_1 = createCollider(interior.folder, "Resident", base, Vector2.new(INTERIOR_TILE, INTERIOR_TILE))
			table.insert(_colliders, _arg0_1)
		end
		-- Só as folhas dos visuais dos moradores deste mapa, por trás.
		local list = {}
		for sheet in sheets do
			table.insert(list, sheet)
		end
		if #list > 0 then
			task.spawn(function()
				return ContentProvider:PreloadAsync(list)
			end)
		end
		if #self.residents > 0 then
			print(`[Moradores] {data.id}: {#self.residents} morador(es), {#list} folha(s)`)
		end
	end
	function ResidentController:show(resident)
		local shell = takeShell(self.scene.world, `Resident_{resident.data.name}`)
		resident.shell = shell
		resident.dressed = dressShell(shell, resident.look, resident.pose.facing)
		poseShell(shell, resident.dressed, resident.pose, resident.closed)
		shell.card.part.CFrame = cardCFrame(ACTOR_FIGURE, ACTOR_FEET, resident.at)
		resident.lit = nil
		resident.litKey = -1
		shell.gui.Enabled = true
		if resident.shadow then
			resident.shadow.Visible = true
		end
	end
	function ResidentController:hide(resident)
		local shell = resident.shell
		if not shell then
			return nil
		end
		resident.shell = nil
		resident.dressed = nil
		storeShell(shell)
		if resident.shadow then
			resident.shadow.Visible = false
		end
	end
	function ResidentController:update()
		local started = perfBegin("Moradores")
		if self.dirty then
			self:build()
		end
		local now = os.clock()
		local key = self.daylight:lightKey()
		for _, resident in self.residents do
			if not puppetOnScreen(resident.screenPx) then
				self:hide(resident)
				continue
			end
			if not resident.shell then
				self:show(resident)
			end
			local shell = resident.shell
			-- Pisca a cada 3 a 6 segundos; deitado, o olho fica fechado.
			if resident.pose.anim ~= 3 then
				if now >= resident.nextBlink + BLINK_TIME then
					resident.nextBlink = now + self.random:NextNumber(BLINK_MIN, BLINK_MAX)
				end
				local closed = now >= resident.nextBlink
				if closed ~= resident.closed then
					resident.closed = closed
					poseShell(shell, resident.dressed, resident.pose, closed)
				end
			end
			-- A luz dos halos só é lida de novo quando alguma luz muda: o morador não sai do lugar.
			if key ~= resident.litKey then
				resident.litKey = key
				local lit = self.daylight:lightAt(resident.at)
				if lit ~= resident.lit then
					resident.lit = lit
					toneShell(shell, lit)
				end
			end
		end
		perfEnd("Moradores", started)
	end
	do
		-- (Flamework) ResidentController metadata
		Reflect.defineMetadata(ResidentController, "identifier", "client/controllers/ResidentController@ResidentController")
		Reflect.defineMetadata(ResidentController, "flamework:parameters", { "client/controllers/SceneController@SceneController", "client/controllers/ActionController@ActionController", "client/controllers/DaylightController@DaylightController" })
		Reflect.defineMetadata(ResidentController, "flamework:implements", { "$:flamework@OnStart" })
	end
end
-- (Flamework) ResidentController decorators
Reflect.decorate(ResidentController, "$:flamework@Controller", Controller, {})
return {
	ResidentController = ResidentController,
}
