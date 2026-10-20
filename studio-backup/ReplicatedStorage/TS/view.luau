-- Compiled with roblox-ts v3.0.0
-- Projeção do mundo: vista de cima em 3/4. A câmera olha para o norte (−Z), bem de cima, então a
-- direita da tela é +X e a grade do chão fica alinhada com a tela. As medidas de arte são em pixels
-- do sprite, antes do zoom.
--[[
	*
	 * Pixels de arte por stud. O mundo é pequeno de propósito: com poucos studs na tela, a câmera
	 * pode ficar perto e ainda assim quase sem perspectiva.
	 
]]
local ART_PX_PER_STUD = 32
--[[
	*
	 * Inclinação da câmera acima do horizonte. Não chega a 90°: os objetos em pé são cartões de frente
	 * para a câmera, ordenados pela profundidade, e vistos a prumo ficariam todos à mesma profundidade.
	 * A 70°, andar para cima na tela é só 6% mais lento do que andar para o lado.
	 
]]
local CAMERA_PITCH = math.rad(70)
--[[
	*
	 * Distância máxima da câmera. Na qualidade gráfica mínima o Roblox deixa de desenhar o que está
	 * além de uns 300 a 400 studs (medido no Studio em 2026-10-08), então a câmera fica abaixo disso.
	 
]]
local CAMERA_MAX_DISTANCE = 280
--* Menor campo de visão que o Roblox aceita. 
local CAMERA_MIN_FOV = 1
-- Altura da tela, em pixels de arte, nos zooms da câmera, como no Graal (pedido do usuário em 2026-10-17):
-- o padrão mostra uns 540 (34 tiles de 16) numa tela de 1080, e o jogador aproxima e afasta com a roda do
-- mouse ou a pinça. O zoom é sempre inteiro. A interface não muda com ele (`ui/kit.tsx`, palco de 480×270).
--* O mais perto: a vista de antes, 270 de altura. 
local CLOSEST_VIEW_HEIGHT = 270
--* O padrão. 
local DEFAULT_VIEW_HEIGHT = 540
--[[
	*
	 * O mais longe: uns 768 de altura, o Graal no iPad (2048×1536 em zoom 2, 64×48 tiles). Aceita até 10% a
	 * mais, para uma tela de 779 ainda chegar ao zoom 1.
	 
]]
local FARTHEST_VIEW_HEIGHT = 768
local FARTHEST_SLACK = 1.1
local SCREEN_DENSITIES = { 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 3 }
--[[
	*
	 * Quantos pixels físicos vale um pixel do `ViewportSize`. No Studio com a escala de tela do Windows em
	 * 125%, o ViewportSize vem em pixels lógicos (1530,4 × 779,2 para 1913 × 974 físicos, medido em
	 * 2026-10-17), e um zoom inteiro nele não é inteiro na tela: o pixel de arte fica com 2 e 3 pixels
	 * físicos, alternados, e abre fresta entre as imagens. O Roblox não informa a escala, mas ela aparece no
	 * tamanho fracionário: é a menor das escalas comuns que deixa a largura e a altura inteiras. Com o tamanho
	 * inteiro, vale 1 (numa escala de 150% com o tamanho lógico inteiro, não dá para saber).
	 
]]
local function screenDensity(viewport)
	for _, density in SCREEN_DENSITIES do
		local x = viewport.X * density
		local y = viewport.Y * density
		if math.abs(x - math.round(x)) < 0.01 and math.abs(y - math.round(y)) < 0.01 then
			return density
		end
	end
	return 1
end
--* O zoom inteiro cuja altura de vista fica mais perto de `viewHeight`, pela razão (não pela diferença). 
local function nearestZoom(viewportHeight, viewHeight)
	local exact = viewportHeight / viewHeight
	local low = math.max(1, math.floor(exact))
	local high = low + 1
	return if exact * exact >= low * high then high else low
end
--[[
	*
	 * Os zooms do mundo numa tela de `viewportHeight` pixels físicos de altura (`screenDensity`): quantos
	 * pixels físicos vale um pixel de arte, sempre inteiro. `closest` é o maior, a vista de antes (270 de altura); `farthest` o menor que
	 * ainda mostra no máximo uns 768 (numa tela de 1080 é o mesmo do padrão, porque o zoom 1 mostraria 1080);
	 * `standard`, o padrão, o que fica mais perto de 540.
	 
]]
local function zoomRange(viewportHeight)
	local closest = math.max(1, math.round(viewportHeight / CLOSEST_VIEW_HEIGHT))
	local farthest = math.min(closest, math.max(1, math.ceil(viewportHeight / (FARTHEST_VIEW_HEIGHT * FARTHEST_SLACK))))
	local standard = math.clamp(nearestZoom(viewportHeight, DEFAULT_VIEW_HEIGHT), farthest, closest)
	return {
		closest = closest,
		standard = standard,
		farthest = farthest,
	}
end
local SIN_PITCH = math.sin(CAMERA_PITCH)
local COS_PITCH = math.cos(CAMERA_PITCH)
--* Direita da tela, no mundo. 
local SCREEN_RIGHT = Vector3.xAxis
--* Direção do chão que aponta para a câmera: é o "para baixo" da tela. 
local TOWARD_CAMERA = Vector3.zAxis
--* Para cima da tela, no mundo. 
local _vector3 = Vector3.new(0, COS_PITCH, 0)
local _arg0 = TOWARD_CAMERA * SIN_PITCH
local SCREEN_UP = _vector3 - _arg0
--* Direção em que a câmera olha. 
local _arg0_1 = -COS_PITCH
local _exp = TOWARD_CAMERA * _arg0_1
local _vector3_1 = Vector3.new(0, SIN_PITCH, 0)
local LOOK = _exp - _vector3_1
--* Studs de chão, na direção da câmera, que valem um pixel de arte na vertical da tela. 
local GROUND_STUDS_PER_PX = 1 / (ART_PX_PER_STUD * SIN_PITCH)
--[[
	*
	 * O que se vê não fica na profundidade de verdade. Com o chão inclinado a 70°, a perspectiva deixava o
	 * topo da tela menor que a base: no zoom 3 de uma tela de 779, o pixel de arte do chão media 2,968
	 * pixels da tela no topo e 3,031 embaixo (medido no Studio em 2026-10-17), e de tempos em tempos uma
	 * fileira de pixels dobrava ou sumia. A câmera não pode ir mais longe (`CAMERA_MAX_DISTANCE`).
	 *
	 * Então a profundidade (ao longo da linha de visão) de tudo o que é desenhado, o chão e os cartões, é
	 * multiplicada por este número (`toView`). O lugar na tela não muda: só se anda ao longo da linha de
	 * visão. O chão fica quase de frente para a câmera, e a diferença de tamanho do pixel na tela inteira caiu
	 * de 2,1% para 0,02% a 0,05% (medido no Studio em 2026-10-17, nos zooms 2 e 4): o erro somado fica abaixo
	 * de meio pixel da tela, então nenhum pixel dobra. A ordem dos cartões continua certa, porque o Roblox
	 * ordena os SurfaceGuis pela profundidade, não pela distância em linha reta (medido no Studio no mesmo
	 * dia), e um pixel de arte de chão ainda vale 0,0001 stud de profundidade, acima da precisão do float.
	 *
	 * O que é físico (o personagem do Roblox, os bloqueios, o piso) fica onde está; só o desenho anda. A
	 * câmera olha para o desenho, então uma parte física longe da origem fica a outra distância dela: com o
	 * jogador a mais de uns 800 studs ao sul da origem, a parte física fica atrás da câmera. Nada no jogo
	 * depende disso hoje (não há BillboardGui, ProximityPrompt, raio da câmera nem som 3D); quem vier a
	 * depender tem de usar a posição desenhada (`toView`) ou mudar a referência por região.
	 
]]
local VIEW_DEPTH_SCALE = 0.01
--* Onde um ponto do mundo é desenhado: o mesmo lugar na tela, com a profundidade comprimida. 
local function toView(position)
	local _position = position
	local _arg0_2 = position:Dot(LOOK) * (1 - VIEW_DEPTH_SCALE)
	local _arg0_3 = LOOK * _arg0_2
	return _position - _arg0_3
end
--* Profundidade, no desenho, de um pixel de arte de chão em direção à câmera: para trazer um cartão para a frente. 
local VIEW_DEPTH_PER_PX = GROUND_STUDS_PER_PX * COS_PITCH * VIEW_DEPTH_SCALE
--* Lado da célula do chão na tela, em pixels de arte: ela é um quadrado. 
local CELL_PX = 32
--* Largura da célula no chão, em studs. 
local CELL_WIDTH = CELL_PX / ART_PX_PER_STUD
--* Fundo da célula no chão, em studs. É maior que a largura para compensar a inclinação da câmera. 
local CELL_DEPTH = CELL_PX * GROUND_STUDS_PER_PX
--* Centro da célula (i, j) no chão: i cresce para a direita da tela e j para baixo. 
local function cellToWorld(i, j)
	return Vector3.new(i * CELL_WIDTH, 0, j * CELL_DEPTH)
end
--* Deslocamento no chão que move um ponto (px, py) pixels de arte na tela: x para a direita, y para baixo. 
local function groundOffset(px, py)
	local _arg0_2 = px / ART_PX_PER_STUD
	local _exp_1 = SCREEN_RIGHT * _arg0_2
	local _arg0_3 = py * GROUND_STUDS_PER_PX
	local _arg0_4 = TOWARD_CAMERA * _arg0_3
	return _exp_1 + _arg0_4
end
--* Posição de um ponto do chão na tela, em pixels de arte a partir da origem do mundo. 
local function worldToArtPx(position)
	return Vector2.new(position:Dot(SCREEN_RIGHT) * ART_PX_PER_STUD, position:Dot(TOWARD_CAMERA) / GROUND_STUDS_PER_PX)
end
--* Leva um ponto do chão ao pixel de arte mais próximo, para o que se move não ficar entre dois pixels. 
local function snapToArtPx(position)
	local px = worldToArtPx(position)
	return groundOffset(math.round(px.X), math.round(px.Y))
end
return {
	screenDensity = screenDensity,
	zoomRange = zoomRange,
	toView = toView,
	cellToWorld = cellToWorld,
	groundOffset = groundOffset,
	worldToArtPx = worldToArtPx,
	snapToArtPx = snapToArtPx,
	ART_PX_PER_STUD = ART_PX_PER_STUD,
	CAMERA_PITCH = CAMERA_PITCH,
	CAMERA_MAX_DISTANCE = CAMERA_MAX_DISTANCE,
	CAMERA_MIN_FOV = CAMERA_MIN_FOV,
	CLOSEST_VIEW_HEIGHT = CLOSEST_VIEW_HEIGHT,
	DEFAULT_VIEW_HEIGHT = DEFAULT_VIEW_HEIGHT,
	FARTHEST_VIEW_HEIGHT = FARTHEST_VIEW_HEIGHT,
	SCREEN_RIGHT = SCREEN_RIGHT,
	TOWARD_CAMERA = TOWARD_CAMERA,
	SCREEN_UP = SCREEN_UP,
	LOOK = LOOK,
	GROUND_STUDS_PER_PX = GROUND_STUDS_PER_PX,
	VIEW_DEPTH_SCALE = VIEW_DEPTH_SCALE,
	VIEW_DEPTH_PER_PX = VIEW_DEPTH_PER_PX,
	CELL_PX = CELL_PX,
	CELL_WIDTH = CELL_WIDTH,
	CELL_DEPTH = CELL_DEPTH,
}
