-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
-- O boneco do jogador, no formato do Graal, com as cabeças e os corpos dos contribuidores (zar, jen,
-- raskit, daisy e os outros dos créditos). Tela de 32×48: a cabeça em cima, o corpo 16 pixels abaixo
-- dela e por baixo da cabeça, como no Graal. 4 direções, parado e andando, e a cabeça pisca. Cada peça
-- vem em camadas (graal.ts): a peça inteira nas cores originais e, por cima, uma máscara em cinza por
-- parte pintável, com o degradê e os detalhes da parte, que só aparece quando o jogador escolhe uma cor
-- para ela e recebe essa cor por `ImageColor3`.
local _appearance = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "appearance")
local CLOTH_KEYS = _appearance.CLOTH_KEYS
local colorOfRgb = _appearance.colorOfRgb
local DETAIL_KEYS = _appearance.DETAIL_KEYS
local lookBody = _appearance.lookBody
local lookHead = _appearance.lookHead
local ORIGINAL = _appearance.ORIGINAL
local ASSET_LISTS = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "assets").ASSET_LISTS
local GRAAL_SHEET_COUNT = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "graalData").GRAAL_SHEET_COUNT
local GRAAL_ORIGINAL_SHEET_COUNT = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "graalDataOriginal").GRAAL_ORIGINAL_SHEET_COUNT
--[[
	*
	 * Quantas das primeiras `count` folhas de uma lista ainda não têm id no registro (o "" no lugar, ou a lista mais
	 * curta que as folhas que o pacote montou).
	 
]]
local function missingSheets(sheets, count)
	local missing = 0
	do
		local i = 0
		local _shouldIncrement = false
		while true do
			if _shouldIncrement then
				i += 1
			else
				_shouldIncrement = true
			end
			if not (i < count) then
				break
			end
			local _condition = sheets[i + 1]
			if _condition == nil then
				_condition = ""
			end
			if _condition == "" then
				missing += 1
			end
		end
	end
	return missing
end
--[[
	*
	 * Folhas graal_<n>.png no estilo do Aeko, montadas por tools/graal_pack.py (pasta Aseprite) em
	 * contribuidores/pack_aeko. Células de 32×32, 32 por linha. Os ids vêm do registro (assets/registro.json, chaves
	 * graal.aeko.<n>): depois de rodar o script e enviar só as folhas novas, `npm run assets -- --importar` traz os ids
	 * do contribuidores/pack_aeko/enviadas.json para o registro. O estilo original tem as folhas casadas célula a célula
	 * com estas em contribuidores/pack_original (chaves graal.original.<n>).
	 
]]
local GRAAL_SHEETS = ASSET_LISTS["graal.aeko"]
do
	local missing = missingSheets(GRAAL_SHEETS, GRAAL_SHEET_COUNT)
	if missing > 0 then
		warn(`[graalArt] {missing} folha(s) do boneco sem id no registro (graal.aeko em assets/registro.json)`)
	end
end
--[[
	*
	 * Folhas graal_<n>.png no estilo original (as cores dos contribuidores), em contribuidores/pack_original,
	 * casadas célula a célula com as de GRAAL_SHEETS: a camada de uma peça fica na mesma folha e na mesma
	 * célula nos dois estilos (as poucas exceções estão em GRAAL_LAYERS_ORIGINAL, graalDataOriginal.ts). Os
	 * ids, na ordem, vêm do registro (graal.original.<n>; enviadas em 2026-10-18).
	 
]]
local GRAAL_SHEETS_ORIGINAL = ASSET_LISTS["graal.original"]
do
	local missing = missingSheets(GRAAL_SHEETS_ORIGINAL, GRAAL_ORIGINAL_SHEET_COUNT)
	if missing > 0 then
		warn(`[graalArt] {missing} folha(s) do estilo original sem id no registro (graal.original em assets/registro.json)`)
	end
end
--* As folhas das peças do estilo `style`. 
local function sheetsOf(style)
	return if style == 1 then GRAAL_SHEETS_ORIGINAL else GRAAL_SHEETS
end
--[[
	*
	 * A tela do boneco, em pixels de arte: a mesma área do Graal, para as posições das animações dele valerem
	 * como estão (de lado, a cabeça e o corpo vão até 6 pixels para o lado).
	 
]]
local FIGURE = Vector2.new(48, 48)
--* Uma célula das folhas: um quadro da cabeça ou do corpo. 
local GRAAL_CELL = Vector2.new(32, 32)
--* O ponto da tela que fica sobre o chão: a sola de quem está de frente ou de lado, no meio da sombra do Graal. 
local FEET = Vector2.new(24, 47)
local SHEET_COLUMNS = 32
--* Para onde o boneco olha, na ordem das colunas do corpo e dos quadros da cabeça. "Baixo" é virado para a câmera. 
--[[
	*
	 * As animações do boneco, como os ganis padrão do Graal (ver as poses abaixo): parado e andando, sentado,
	 * deitado, empurrando, segurando, puxando, carregando (andando e parado) e levantando um objeto.
	 
]]
--* A célula da cabeça vista de cima, depois das 4 direções: para deitar e dormir. 
local HEAD_TOP = 4
--[[
	*
	 * O corpo traz as 22 linhas do molde do Graal (todas as peças seguem o mesmo): 0 parado, 1 a 5 andar,
	 * 6 a 9 golpe, 10 a 14 segurar, puxar e empurrar, 15 braços soltos, 16 a 18 andar sem braços
	 * (carregar), 19 e 20 sentar e cair, 21 braços para cima, deitado e sombra. As linhas de cada
	 * animação estão nas poses abaixo.
	 
]]
local BODY_ROWS = 22
--[[
	*
	 * Uma pose do Graal: a linha do corpo e, por direção (cima, esquerda, baixo, direita), o canto da célula do
	 * corpo e o da cabeça na tela de 48×48 (y negativo sobe acima dela, como no sentar do Graal).
	 
]]
--* A mesma linha do corpo nas 4 direções. 
local function cellsOf(row)
	return { { row, 0 }, { row, 1 }, { row, 2 }, { row, 3 } }
end
--[[
	*
	 * Parado, como no idle.gani do Graal: o corpo em y 16 e a cabeça em y 2, entrando 18 pixels no corpo
	 * (com a cabeça em 0, como antes, sobrava uma falha no pescoço); de lado, os dois vão 4 pixels para o
	 * lado, para o desenho ficar em cima da sombra.
	 
]]
local IDLE = {
	row = 0,
	body = { { 8, 16 }, { 12, 16 }, { 8, 16 }, { 4, 16 } },
	head = { { 8, 2 }, { 12, 2 }, { 8, 2 }, { 4, 2 } },
}
local WALK_A = {
	row = 4,
	body = { { 8, 16 }, { 12, 16 }, { 8, 16 }, { 2, 16 } },
	head = { { 8, 4 }, { 12, 0 }, { 8, 2 }, { 4, 0 } },
}
local WALK_B = {
	row = 5,
	body = { { 8, 17 }, { 10, 16 }, { 8, 20 }, { 4, 16 } },
	head = { { 8, 0 }, { 12, 2 }, { 8, 0 }, { 4, 2 } },
}
local WALK_C = {
	row = 3,
	body = { { 8, 17 }, { 12, 18 }, { 8, 16 }, { 2, 18 } },
	head = { { 8, 4 }, { 12, 2 }, { 8, 4 }, { 4, 2 } },
}
local WALK_D = {
	row = 2,
	body = { { 8, 16 }, { 12, 14 }, { 8, 16 }, { 2, 14 } },
	head = { { 8, 2 }, { 12, 0 }, { 8, 2 }, { 4, 0 } },
}
local WALK_E = {
	row = 1,
	body = { { 8, 15 }, { 10, 16 }, { 8, 14 }, { 4, 16 } },
	head = { { 8, 0 }, { 10, 0 }, { 8, 0 }, { 6, 0 } },
}
--[[
	*
	 * O andar, como no walk.gani padrão do Graal (lido em 2026-10-17 do visualizador de ganis do
	 * dustyshouri): 8 quadros nas linhas 4, 5, 4, 3, 2, 1, 2, 3 do corpo, ida e volta, com braço e perna
	 * alternando, e em cada quadro a posição do corpo e da cabeça (a cabeça segue o ombro, o corpo balança
	 * e, de lado, vai 2 pixels para os lados). Sem tempo no arquivo, cada quadro dura o padrão do Graal,
	 * 0,05 s: 20 por segundo.
	 
]]
local WALK = { WALK_A, WALK_B, WALK_A, WALK_C, WALK_D, WALK_E, WALK_D, WALK_C }
local WALK_FRAMES = #WALK
local WALK_FPS = 20
--[[
	*
	 * Pixels de arte andados em cada quadro do andar: no passo do Graal (`WALK_PX_PER_SECOND`, 160) e a 20
	 * quadros por segundo, 8. O jogo troca o quadro pela distância andada, não pelo relógio: o andar acompanha
	 * o boneco em qualquer velocidade (mais devagar para cima na tela, raspando numa parede) e o pé não
	 * escorrega.
	 
]]
local WALK_STEP_PX = 8
--* A altura da cabeça na tela, parado: a grade de cabeças sobe esse tanto para a cabeça ficar no meio. 
local HEAD_Y = IDLE.head[1][2]
--[[
	*
	 * Sentado, como no sit.gani do Graal (lido em 2026-10-17 do visualizador do dustyshouri): de costas, o corpo
	 * de levantar (linha 14); de lado, as células de sentar da linha 20 e, de frente, a da 19. O corpo e a
	 * cabeça sobem 8 a 10 pixels, para o boneco ficar em cima do assento, que a vista em 3/4 desenha mais alto.
	 
]]
local SIT = {
	row = 19,
	cells = { { 14, 0 }, { 20, 1 }, { 19, 3 }, { 20, 3 } },
	body = { { 8, 6 }, { 8, 8 }, { 8, 10 }, { 8, 8 } },
	head = { { 8, -4 }, { 16, -6 }, { 8, -6 }, { 0, -6 } },
}
--[[
	*
	 * Deitado na cama: só a cabeça, de frente e de olho fechado, sobre o travesseiro; a coberta da cama (os
	 * próprios tiles da parte de baixo dela) vai por cima do corpo. O corpo deitado do molde (linha 21, 48×32)
	 * fica de lado, atravessado, e não serve à cama em pé do Aeko: debaixo da coberta, não aparece.
	 
]]
local LIE = {
	row = 0,
	noBody = true,
	body = IDLE.body,
	head = { { 8, 8 }, { 8, 8 }, { 8, 8 }, { 8, 8 } },
}
--[[
	*
	 * Segurando, como no grab.gani: os braços para a frente (linha 10; de costas, a 13) e a cabeça inclinada
	 * para o lado do móvel.
	 
]]
local GRAB = {
	row = 10,
	cells = { { 13, 0 }, { 10, 1 }, { 10, 2 }, { 10, 3 } },
	body = { { 8, 16 }, { 10, 16 }, { 8, 16 }, { 6, 16 } },
	head = { { 8, 2 }, { 8, 2 }, { 8, 6 }, { 8, 2 } },
}
--[[
	*
	 * Puxando, como no pull.gani: a linha 13, com a cabeça jogada para trás. De costas, o Graal usa o corpo
	 * de braços para cima (linha 21) com 48 pixels de altura, mas as folhas guardam só 32 (graal_pack.py deixa
	 * os 16 de baixo de fora): sem as pernas, fica a pose de segurar de costas.
	 
]]
local PULL = {
	row = 13,
	body = { { 8, 16 }, { 8, 16 }, { 8, 16 }, { 8, 16 } },
	head = { { 8, 2 }, { 16, 2 }, { 8, 4 }, { 0, 2 } },
}
--[[
	*
	 * Empurrando, contra a parede ou um móvel. O visualizador não tem o push.gani: como no Graal, o corpo
	 * alterna as linhas de empurrar do molde (10, 11, 12 e 11), na posição do segurar, inclinado para a frente.
	 
]]
local _exp = { 10, 11, 12, 11 }
-- ▼ ReadonlyArray.map ▼
local _newValue = table.create(#_exp)
local _callback = function(row)
	local _object = table.clone(GRAB)
	setmetatable(_object, nil)
	_object.row = row
	_object.cells = cellsOf(row)
	return _object
end
for _k, _v in _exp do
	_newValue[_k] = _callback(_v, _k - 1, _exp)
end
-- ▲ ReadonlyArray.map ▲
local PUSH = _newValue
local PUSH_FRAMES = #PUSH
--* Quadros de empurrar por segundo: devagar, como quem faz força. 
local PUSH_FPS = 6
local ITEM_LOW = { { 8, -20 }, { 8, -22 }, { 8, -20 }, { 8, -22 } }
local ITEM_HIGH = { { 8, -22 }, { 8, -22 }, { 8, -22 }, { 8, -22 } }
local ITEM_DOWN = { { 8, -18 }, { 8, -20 }, { 8, -18 }, { 8, -20 } }
--[[
	*
	 * Carregando, como no carry.gani: o andar sem braços (linhas 16 a 20) e os braços para cima (linha 15)
	 * por cima da cabeça, segurando o objeto 20 pixels acima dela. 8 quadros, no passo do andar.
	 
]]
local CARRY_A = {
	row = 17,
	hands = true,
	body = { { 8, 16 }, { 10, 14 }, { 8, 16 }, { 6, 14 } },
	head = { { 8, 2 }, { 12, 0 }, { 8, 2 }, { 4, 0 } },
	item = ITEM_LOW,
}
local CARRY_B = {
	row = 18,
	hands = true,
	body = { { 8, 16 }, { 10, 14 }, { 8, 16 }, { 6, 14 } },
	head = { { 8, 4 }, { 12, 2 }, { 8, 4 }, { 4, 2 } },
	item = ITEM_DOWN,
}
local CARRY_C = {
	row = 16,
	hands = true,
	body = { { 8, 16 }, { 10, 16 }, { 8, 16 }, { 6, 16 } },
	head = { { 8, 0 }, { 12, 0 }, { 8, 0 }, { 4, 0 } },
	item = ITEM_HIGH,
}
local _object = table.clone(CARRY_A)
setmetatable(_object, nil)
_object.cells = { { 19, 0 }, { 17, 1 }, { 19, 2 }, { 17, 3 } }
local CARRY_D = _object
local _object_1 = table.clone(CARRY_B)
setmetatable(_object_1, nil)
_object_1.cells = { { 20, 0 }, { 18, 1 }, { 20, 2 }, { 18, 3 } }
local CARRY_E = _object_1
local CARRY = { CARRY_A, CARRY_B, CARRY_A, CARRY_C, CARRY_D, CARRY_E, CARRY_D, CARRY_C }
local CARRY_FRAMES = #CARRY
--* Levantando o objeto do chão (linha 14, braços para a frente), antes de ir para cima da cabeça. 
local LIFT = {
	row = 14,
	body = IDLE.body,
	head = IDLE.head,
	item = { { 8, 4 }, { 0, 8 }, { 8, 18 }, { 16, 8 } },
}
--* A pose do quadro `frame` da animação. 
local function poseOf(anim, frame)
	repeat
		if anim == 1 then
			return WALK[frame % WALK_FRAMES + 1]
		end
		if anim == 2 then
			return SIT
		end
		if anim == 3 then
			return LIE
		end
		if anim == 4 then
			return PUSH[frame % PUSH_FRAMES + 1]
		end
		if anim == 5 then
			return GRAB
		end
		if anim == 6 then
			return PULL
		end
		if anim == 7 then
			return CARRY[frame % CARRY_FRAMES + 1]
		end
		if anim == 8 then
			return CARRY_C
		end
		if anim == 9 then
			return LIFT
		end
		return IDLE
	until true
end
--* O que a pose desenha além da cabeça e do corpo: os braços por cima da cabeça e o objeto carregado. 
local function poseExtras(anim, frame, facing)
	local pose = poseOf(anim, frame)
	local _binding = pose.head[facing + 1]
	local hx = _binding[1]
	local hy = _binding[2]
	return {
		hands = pose.hands == true,
		handsCell = 15 * 4 + facing,
		handsAt = Vector2.new(hx, hy),
		item = if pose.item then Vector2.new(pose.item[facing + 1][1], pose.item[facing + 1][2]) else nil,
		noBody = pose.noBody == true,
	}
end
--* Quanto a cabeça sobe na pose, em relação a quem está parado: os balões sobem junto. 
local function poseRise(anim, facing)
	return IDLE.head[facing + 1][2] - poseOf(anim, 0).head[facing + 1][2]
end
--[[
	*
	 * A tela do boneco no mundo: a de 48×48 do Graal com 32 pixels a mais em cima, para o que a pose põe acima
	 * dela (a cabeça de quem senta, o objeto carregado apoiado no alto da cabeça, que com a cabeça de 32 sobe até
	 * uns 30 pixels acima da tela). As posições das poses descem esse tanto.
	 
]]
local ACTOR_TOP = 32
local ACTOR_FIGURE = Vector2.new(FIGURE.X, FIGURE.Y + ACTOR_TOP)
local ACTOR_FEET = Vector2.new(FEET.X, FEET.Y + ACTOR_TOP)
--* Camadas de um boneco, no máximo: no corpo a inteira, a pele e 6 partes da roupa; na cabeça a inteira, o cabelo, a pele, os olhos e 3 enfeites. 
local MAX_FIGURE_LAYERS = 15
--* Cada boneco pisca a cada 3 a 6 segundos, de olho fechado por um instante. 
local BLINK_MIN = 3
local BLINK_MAX = 6
local BLINK_TIME = 0.15
--* Uma camada do boneco: a folha, o bloco, a cor que multiplica a imagem e se é da cabeça ou do corpo. 
local WHITE = Color3.new(1, 1, 1)
local KEY_OF_TINT = {
	skin = "skinRgb",
	hair = "hairRgb",
	eyes = "eyesRgb",
}
--[[
	*
	 * A cor que pinta a máscara da camada, ou nada se ela não aparece. A camada inteira (sem `tint`)
	 * aparece sempre, sem tinta. A máscara de uma parte só aparece com cor escolhida: na cor original, o
	 * desenho embaixo já mostra a parte como ela é. A pele e o cabelo desenhados no corpo (cabelo comprido,
	 * trança) são a exceção: na cor original, seguem os da cabeça, para os dois saírem com o mesmo tom.
	 
]]
local function tintOf(look, layer, head)
	if layer.tint == nil then
		return WHITE
	end
	local _result
	if layer.tint == "cloth" then
		local _exp_1 = CLOTH_KEYS
		local _condition = layer.part
		if _condition == nil then
			_condition = 0
		end
		_result = _exp_1[_condition + 1]
	else
		local _result_1
		if layer.tint == "detail" then
			local _exp_1 = DETAIL_KEYS
			local _condition = layer.part
			if _condition == nil then
				_condition = 0
			end
			_result_1 = _exp_1[_condition + 1]
		else
			_result_1 = KEY_OF_TINT[layer.tint]
		end
		_result = _result_1
	end
	local key = _result
	if key == nil then
		return nil
	end
	local chosen = look[key]
	if chosen ~= ORIGINAL then
		return colorOfRgb(chosen)
	end
	-- Pele e cabelo desenhados no corpo seguem os da cabeça (no estilo dela), para combinarem.
	if (layer.tint == "skin" or layer.tint == "hair") and not head then
		local headPiece = lookHead(look)
		local _result_1
		if layer.tint == "skin" then
			local _result_2 = headPiece
			if _result_2 ~= nil then
				_result_2 = _result_2.skin
			end
			_result_1 = _result_2
		else
			local _result_2 = headPiece
			if _result_2 ~= nil then
				_result_2 = _result_2.hair
			end
			_result_1 = _result_2
		end
		local headColor = _result_1
		if headColor ~= nil then
			return colorOfRgb(headColor)
		end
	end
	return nil
end
--* As camadas da peça, nas folhas do estilo dela. 
local function pushLayers(layers, look, piece, head)
	local sheets = sheetsOf(piece.style)
	for _, layer in piece.layers do
		local color = tintOf(look, layer, head)
		if color then
			local _layers = layers
			local _object_2 = {}
			local _left = "image"
			local _condition = sheets[layer.sheet + 1]
			if _condition == nil then
				_condition = ""
			end
			_object_2[_left] = _condition
			_object_2.color = color
			_object_2.head = head
			_object_2.cell = layer.cell
			_object_2.blink = layer.blink
			table.insert(_layers, _object_2)
		end
	end
end
--* As camadas de um visual, de baixo para cima: o corpo e depois a cabeça, cada um no estilo escolhido para ele. 
local function figureLayers(look)
	local layers = {}
	local body = lookBody(look)
	if body then
		pushLayers(layers, look, body, false)
	end
	local head = lookHead(look)
	if head then
		pushLayers(layers, look, head, true)
	end
	return layers
end
--* As camadas só da cabeça, para os ícones da tela de personalizar. 
local function headLayers(look)
	local layers = {}
	local head = lookHead(look)
	if head then
		pushLayers(layers, look, head, true)
	end
	return layers
end
local function cellOffset(cell)
	return Vector2.new((cell % SHEET_COLUMNS) * GRAAL_CELL.X, math.floor(cell / SHEET_COLUMNS) * GRAAL_CELL.Y)
end
--[[
	*
	 * Canto da camada na folha (`ImageRectOffset`), no quadro `frame` da animação, na direção `facing`.
	 * `closed` mostra o olho fechado nas camadas da cabeça que mudam na piscada (de costas não há olho).
	 
]]
local function layerRect(layer, anim, frame, facing, closed)
	if layer.head then
		-- O bloco da cabeça: as 4 direções, a vista de cima (HEAD_TOP) e, com piscada, o olho fechado de lado e de frente.
		local blinking = closed and layer.blink and facing ~= 0
		return cellOffset(layer.cell + (if blinking then HEAD_TOP + facing else facing))
	end
	local pose = poseOf(anim, frame)
	local _binding = if pose.cells then pose.cells[facing + 1] else { pose.row, facing }
	local row = _binding[1]
	local col = _binding[2]
	return cellOffset(layer.cell + row * 4 + col)
end
--* Canto, na folha, de uma célula do bloco da camada (no corpo, linha * 4 + coluna). 
local function layerCell(layer, index)
	return cellOffset(layer.cell + index)
end
--[[
	*
	 * Onde a imagem da camada fica dentro da tela de 48×48, no quadro `frame` da animação, na direção
	 * `facing`: a posição do Graal para o corpo ou a cabeça (ver IDLE e WALK). Sem isso a cabeça ficava
	 * parada enquanto o corpo andava, com uma falha no pescoço.
	 
]]
local function layerPosition(layer, anim, frame, facing)
	if anim == nil then
		anim = 0
	end
	if frame == nil then
		frame = 0
	end
	if facing == nil then
		facing = 2
	end
	local pose = poseOf(anim, frame)
	local _binding = (if layer.head then pose.head else pose.body)[facing + 1]
	local x = _binding[1]
	local y = _binding[2]
	return Vector2.new(x, y)
end
--[[
	*
	 * Altura do boneco, em pixels de arte acima da sola: até o pixel mais alto da cabeça. Os balões
	 * ficam acima dela, então um penteado alto não fica coberto.
	 
]]
local function figureHeight(look)
	local head = lookHead(look)
	return FEET.Y - (if head then HEAD_Y + head.top else IDLE.body[3][2])
end
--* Direção de cada quarto de volta, começando na direita e girando para baixo da tela. 
local FACING_OF_SECTOR = { 3, 2, 1, 0 }
local SECTOR_OF_FACING = { 3, 2, 1, 0 }
--* Quem já olha para uma direção só troca quando o movimento passa do quarto com esta folga, em graus. 
local FACING_SLACK = 10
--[[
	*
	 * A direção de quem anda `right` para a direita e `down` para baixo da tela. Na diagonal fica a que
	 * já estava, como no Graal, e só troca quando o movimento sai dela com folga, para não tremer.
	 
]]
local function facingOf(right, down, current)
	local angle = math.deg(math.atan2(down, right))
	local center = SECTOR_OF_FACING[current + 1] * 90
	local off = math.abs(((angle - center + 540) % 360) - 180)
	if off <= 45 + FACING_SLACK then
		return current
	end
	local sector = ((math.round(angle / 90) % 4) + 4) % 4
	return FACING_OF_SECTOR[sector + 1]
end
--* Ordem em que a prévia da tela de personalizar gira. 
local TURN_ORDER = { 2, 1, 0, 3 }
return {
	sheetsOf = sheetsOf,
	poseExtras = poseExtras,
	poseRise = poseRise,
	figureLayers = figureLayers,
	headLayers = headLayers,
	layerRect = layerRect,
	layerCell = layerCell,
	layerPosition = layerPosition,
	figureHeight = figureHeight,
	facingOf = facingOf,
	GRAAL_SHEETS = GRAAL_SHEETS,
	GRAAL_SHEETS_ORIGINAL = GRAAL_SHEETS_ORIGINAL,
	FIGURE = FIGURE,
	GRAAL_CELL = GRAAL_CELL,
	FEET = FEET,
	HEAD_TOP = HEAD_TOP,
	BODY_ROWS = BODY_ROWS,
	WALK_FRAMES = WALK_FRAMES,
	WALK_FPS = WALK_FPS,
	WALK_STEP_PX = WALK_STEP_PX,
	HEAD_Y = HEAD_Y,
	PUSH_FRAMES = PUSH_FRAMES,
	PUSH_FPS = PUSH_FPS,
	CARRY_FRAMES = CARRY_FRAMES,
	ACTOR_TOP = ACTOR_TOP,
	ACTOR_FIGURE = ACTOR_FIGURE,
	ACTOR_FEET = ACTOR_FEET,
	MAX_FIGURE_LAYERS = MAX_FIGURE_LAYERS,
	BLINK_MIN = BLINK_MIN,
	BLINK_MAX = BLINK_MAX,
	BLINK_TIME = BLINK_TIME,
	TURN_ORDER = TURN_ORDER,
}
