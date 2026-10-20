-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
-- O desenho de um boneco no formato do Graal, comum aos jogadores (`CharacterController`) e aos moradores
-- (`ResidentController`, etapa F do Diorama, seção 12.20): o cartão com as camadas da cabeça e do corpo, os
-- braços de carregar, o objeto carregado e a água rasa; vestir um visual, pôr numa pose e pintar com a luz. As
-- instâncias de um boneco que sai de cena voltam a um reservatório só, que serve aos dois (seção 3.2 do
-- `PLANO_OTIMIZACAO.md`).
local worldView = TS.import(script, script.Parent.Parent, "state", "camera").worldView
local createCard = TS.import(script, script.Parent, "card").createCard
local _graalArt = TS.import(script, script.Parent, "graalArt")
local ACTOR_FEET = _graalArt.ACTOR_FEET
local ACTOR_FIGURE = _graalArt.ACTOR_FIGURE
local ACTOR_TOP = _graalArt.ACTOR_TOP
local FEET = _graalArt.FEET
local figureHeight = _graalArt.figureHeight
local figureLayers = _graalArt.figureLayers
local GRAAL_CELL = _graalArt.GRAAL_CELL
local HEAD_Y = _graalArt.HEAD_Y
local layerCell = _graalArt.layerCell
local layerPosition = _graalArt.layerPosition
local layerRect = _graalArt.layerRect
local MAX_FIGURE_LAYERS = _graalArt.MAX_FIGURE_LAYERS
local poseExtras = _graalArt.poseExtras
local _tint = TS.import(script, script.Parent, "tint")
local setOwnTone = _tint.setOwnTone
local setTintBase = _tint.setTintBase
local _water = TS.import(script, script.Parent, "water")
local hasWadeSheet = _water.hasWadeSheet
local WADE_AT = _water.WADE_AT
local WADE_BAND = _water.WADE_BAND
local WADE_BAND_AT = _water.WADE_BAND_AT
local WADE_CELL = _water.WADE_CELL
local wadeImage = _water.wadeImage
--* Quanto o objeto carregado (recortado do fundo) entra no cabelo, em pixels de arte: fica apoiado, sem folga. 
local CARRY_REST = 3
--* Camadas do corpo, no máximo: a inteira, a pele, o cabelo desenhado no corpo e 6 partes da roupa. 
local MAX_BODY_LAYERS = 9
--[[
	*
	 * Nadando, o boneco afunda estes pixels de arte e o corpo mostra só as linhas de cima da célula (os
	 * ombros): da água para fora, só a cabeça e os ombros, como no Graal.
	 
]]
local SWIM_SINK = 10
local SWIM_SHOULDERS = 20
--* Quantos bonecos guardados, sem dono, para reaproveitar em vez de criar de novo (seção 3.2 do plano). 
local POOL_MAX = 12
--[[
	*
	 * Folga em volta da tela, em pixels de arte, para um boneco contar como à mostra (seção 3.3 do
	 * `PLANO_OTIMIZACAO.md`): 2 tiles dos lados e em cima; embaixo, o boneco inteiro com o objeto carregado e o balão
	 * (o desenho sobe a partir do pé, então um pé logo abaixo da tela ainda mostra a cabeça).
	 
]]
local OFFSCREEN_SIDE = 32
local OFFSCREEN_BELOW = 160
--* Se o boneco com o pé em `screenPx` (pixels de arte, `worldToArtPx`) está na tela, com a folga. 
local function puppetOnScreen(screenPx)
	local _screenPx = screenPx
	local _center = worldView.center
	local offset = _screenPx - _center
	local half = worldView.half
	return not (math.abs(offset.X) > half.X + OFFSCREEN_SIDE or offset.Y < -half.Y - OFFSCREEN_SIDE or offset.Y > half.Y + OFFSCREEN_BELOW)
end
--* As instâncias de um boneco, que voltam ao reservatório quando ele sai de cena e servem a outro. 
--* O que a pose decide no desenho do boneco (a `ActorPose` do `ActionController` serve). 
--* O visual vestido num boneco: as camadas, na ordem de `Shell.labels`, e a altura dele (os balões ficam acima). 
--* Bonecos sem dono, prontos para servir a quem aparecer: jogador ou morador. 
local pool = {}
--* Quantos bonecos estão guardados no reservatório (o painel de desempenho mostra). 
local function pooledShells()
	return #pool
end
--* As instâncias de um boneco em `parent`: as do reservatório, ou novas. Começa escondido. 
local resetShell
local function takeShell(parent, name)
	-- ▼ Array.pop ▼
	local _length = #pool
	local _result = pool[_length]
	pool[_length] = nil
	-- ▲ Array.pop ▲
	local reused = _result
	if reused then
		reused.card.part.Name = name
		reused.card.part.Parent = parent
		resetShell(reused)
		return reused
	end
	local card = createCard(parent, name, {
		image = "",
		size = ACTOR_FIGURE,
		anchor = ACTOR_FEET,
		frames = { Vector2.zero },
	}, Vector3.zero)
	local gui = card.image.Parent
	-- O personagem pode chegar antes das partes dele: o boneco só aparece quando há onde pôr.
	gui.Enabled = false
	-- As imagens são irmãs criadas em ordem, então as de cima cobrem as de baixo. Cada uma tem uma
	-- célula de 32×32: a da cabeça no alto da tela, a do corpo 16 pixels abaixo. Os braços de quem
	-- carrega e o objeto carregado vão por cima da cabeça, numa camada acima.
	card.image.Size = UDim2.fromScale(GRAAL_CELL.X / ACTOR_FIGURE.X, GRAAL_CELL.Y / ACTOR_FIGURE.Y)
	card.image.ImageRectSize = GRAAL_CELL
	local labels = { card.image }
	for index = 1, MAX_FIGURE_LAYERS - 1 do
		local label = card.image:Clone()
		label.Parent = gui
		table.insert(labels, label)
	end
	local hands = {}
	for index = 0, MAX_BODY_LAYERS - 1 do
		local label = card.image:Clone()
		label.Visible = false
		label.ZIndex = 2
		label.Parent = gui
		table.insert(hands, label)
	end
	local item = card.image:Clone()
	item.Visible = false
	item.ZIndex = 3
	item.ImageColor3 = Color3.new(1, 1, 1)
	item.Parent = gui
	-- A água rasa: a volta de trás por baixo do corpo (ZIndex 0) e a água da frente e o respingo por cima dele.
	local wadeLabel = function(labelName, zIndex)
		local label = card.image:Clone()
		label.Name = labelName
		label.Visible = false
		label.ZIndex = zIndex
		label.ImageColor3 = Color3.new(1, 1, 1)
		label.Parent = gui
		return label
	end
	local wadeBack = wadeLabel("WadeBack", 0)
	local wadeFront = wadeLabel("WadeFront", 2)
	local splash = wadeLabel("Splash", 2)
	local at = function(label, corner, size)
		label.Position = UDim2.fromScale(corner.X / ACTOR_FIGURE.X, (corner.Y + ACTOR_TOP) / ACTOR_FIGURE.Y)
		label.Size = UDim2.fromScale(size.X / ACTOR_FIGURE.X, size.Y / ACTOR_FIGURE.Y)
	end
	local sheet = hasWadeSheet()
	for _, _binding in { { wadeBack, 0 }, { wadeFront, 1 }, { splash, 2 } } do
		local label = _binding[1]
		local row = _binding[2]
		local _binding_1 = wadeImage(row, 0)
		local image = _binding_1[1]
		local offset = _binding_1[2]
		local size = _binding_1[3]
		label.Image = image
		label.ImageRectOffset = offset
		label.ImageRectSize = size
		at(label, WADE_AT, WADE_CELL)
	end
	-- Sem a folha, a água da frente é uma faixa da cor do mar raso sobre os pés.
	if not sheet then
		at(wadeFront, WADE_BAND_AT, WADE_BAND)
	end
	return {
		card = card,
		gui = gui,
		labels = labels,
		hands = hands,
		item = item,
		wadeBack = wadeBack,
		wadeFront = wadeFront,
		splash = splash,
	}
end
--* Esconde o boneco e o que só aparece em algumas poses (o objeto, a água, os braços de carregar). 
function resetShell(shell)
	shell.gui.Enabled = false
	shell.item.Visible = false
	shell.wadeBack.Visible = false
	shell.wadeFront.Visible = false
	shell.splash.Visible = false
	for _, label in shell.hands do
		label.Visible = false
	end
end
--[[
	*
	 * Devolve o boneco ao reservatório (até `POOL_MAX`; além disso, ele é destruído). Fora da pasta `World`: o tom do
	 * dia devolve a cor de base de cada imagem e a lê de novo ao voltar.
	 
]]
local toneShell
local function storeShell(shell)
	if #pool >= POOL_MAX then
		shell.card.part:Destroy()
		return nil
	end
	shell.gui.Enabled = false
	shell.card.part.Parent = nil
	-- A luz de quem saiu não passa a quem pegar o boneco depois.
	toneShell(shell, nil)
	local _shell = shell
	table.insert(pool, _shell)
end
--* Troca as camadas do boneco pelas do visual: o corpo e a cabeça, com cada parte pintada, olhando para `facing`. 
local function dressShell(shell, look, facing)
	local layers = figureLayers(look)
	for index = 0, #shell.labels - 1 do
		local label = shell.labels[index + 1]
		local layer = layers[index + 1]
		label.Visible = layer ~= nil
		if layer then
			local position = layerPosition(layer)
			label.Position = UDim2.fromScale(position.X / ACTOR_FIGURE.X, (position.Y + ACTOR_TOP) / ACTOR_FIGURE.Y)
			label.Image = layer.image
			-- A pintura do visual, com o tom do dia por cima (`tint.ts`).
			setTintBase(label, layer.color)
			label.ImageRectOffset = layerRect(layer, 0, 0, facing, false)
		end
	end
	-- Os braços de carregar repetem as camadas do corpo, que vêm primeiro.
	for index = 0, #shell.hands - 1 do
		local layer = layers[index + 1]
		local label = shell.hands[index + 1]
		if layer and not layer.head then
			label.Image = layer.image
			setTintBase(label, layer.color)
		end
	end
	return {
		layers = layers,
		height = figureHeight(look),
	}
end
--[[
	*
	 * Põe cada camada do boneco na pose: a célula e o lugar do corpo e da cabeça, os braços por cima da
	 * cabeça e o objeto carregado; nadando, afunda e mostra só os ombros do corpo.
	 
]]
local function poseShell(shell, dressed, pose, closed)
	local _binding = pose
	local anim = _binding.anim
	local frame = _binding.frame
	local facing = _binding.facing
	local extras = poseExtras(anim, frame, facing)
	local sink = if pose.swim then SWIM_SINK else 0
	local place = function(label, at, size)
		label.Position = UDim2.fromScale(at.X / ACTOR_FIGURE.X, (at.Y + ACTOR_TOP + sink) / ACTOR_FIGURE.Y)
		label.Size = UDim2.fromScale(size.X / ACTOR_FIGURE.X, size.Y / ACTOR_FIGURE.Y)
		label.ImageRectSize = size
	end
	local shoulders = Vector2.new(GRAAL_CELL.X, SWIM_SHOULDERS)
	local layers = dressed.layers
	for index = 0, #layers - 1 do
		local layer = layers[index + 1]
		local label = shell.labels[index + 1]
		label.ImageRectOffset = layerRect(layer, anim, frame, facing, closed)
		-- Andando, o corpo e a cabeça se deslocam a cada quadro (pé no chão, cabeça no ombro).
		place(label, layerPosition(layer, anim, frame, facing), if pose.swim and not layer.head then shoulders else GRAAL_CELL)
		label.Visible = layer.head or not extras.noBody
	end
	for index = 0, #shell.hands - 1 do
		local layer = layers[index + 1]
		local label = shell.hands[index + 1]
		local shown = extras.hands and layer ~= nil and not layer.head
		label.Visible = shown
		if not shown then
			continue
		end
		label.ImageRectOffset = layerCell(layer, extras.handsCell)
		place(label, extras.handsAt, GRAAL_CELL)
	end
	local item = pose.item
	shell.item.Visible = item ~= nil and extras.item ~= nil
	if item and extras.item then
		shell.item.Image = item.image
		shell.item.ImageRectOffset = item.offset
		-- Apoiado no alto da cabeça, no x do carry.gani, subindo e descendo com ela a cada quadro do andar:
		-- a base do objeto fica no pixel mais alto da cabeça (FEET.Y - HEAD_Y - height) e, recortado do
		-- fundo, entra CARRY_REST pixels no cabelo; o tile opaco (sem recorte) não entra, para não cobrir a cabeça.
		local headTop = FEET.Y - HEAD_Y - dressed.height
		local bottom = extras.handsAt.Y + headTop + (if item.cutout then CARRY_REST else 0)
		local at = Vector2.new(extras.item.X + (GRAAL_CELL.X - item.size.X) / 2, bottom - item.size.Y)
		place(shell.item, at, item.size)
	end
end
--* Pinta o boneco inteiro com a luz `lit` (`DaylightController.lightAt`), ou o devolve ao tom do dia sem ela. 
function toneShell(shell, lit)
	for _, label in shell.labels do
		setOwnTone(label, lit)
	end
	for _, label in shell.hands do
		setOwnTone(label, lit)
	end
	setOwnTone(shell.item, lit)
	setOwnTone(shell.wadeBack, lit)
	setOwnTone(shell.wadeFront, lit)
	setOwnTone(shell.splash, lit)
end
return {
	puppetOnScreen = puppetOnScreen,
	pooledShells = pooledShells,
	takeShell = takeShell,
	storeShell = storeShell,
	dressShell = dressShell,
	poseShell = poseShell,
	toneShell = toneShell,
	SWIM_SINK = SWIM_SINK,
}
