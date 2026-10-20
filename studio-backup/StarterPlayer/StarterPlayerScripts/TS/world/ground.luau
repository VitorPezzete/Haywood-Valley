-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local _view = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "view")
local ART_PX_PER_STUD = _view.ART_PX_PER_STUD
local GROUND_STUDS_PER_PX = _view.GROUND_STUDS_PER_PX
local SCREEN_RIGHT = _view.SCREEN_RIGHT
local TOWARD_CAMERA = _view.TOWARD_CAMERA
local toView = _view.toView
local worldToArtPx = _view.worldToArtPx
local CANVAS_ROLE_ATTRIBUTE = TS.import(script, script.Parent.Parent, "perf").CANVAS_ROLE_ATTRIBUTE
local GRASS_TILE = TS.import(script, script.Parent, "sprites").GRASS_TILE
local THICKNESS = 0.2
--* O padrão do SurfaceGui é sumir a 1000 studs; a câmera fica longe. 
local SURFACE_MAX_DISTANCE = 10000
--[[
	*
	 * O Roblox desenha os SurfaceGuis do mais distante para o mais próximo, medindo pelo centro de
	 * cada um. Sem isto, o chão cobriria todo objeto que está além do centro dele.
	 
]]
local DRAW_FIRST = -100
--[[
	*
	 * A camada viva do chão (seção 3.4 do `PLANO_OTIMIZACAO.md`): um segundo canvas no mesmo plano, desenhado logo
	 * depois do chão e ainda antes de todo cartão. O Roblox refaz o desenho de um `SurfaceGui` inteiro quando
	 * qualquer imagem dentro dele muda; o que se mexe (sombras, tiles animados, halos, peças) fica nela, com poucas
	 * imagens, e o canvas grande dos tiles parados não é refeito a cada quadro.
	 
]]
local LIVE_Z_OFFSET = DRAW_FIRST + 1
--* O mar de fora, num canvas próprio por baixo do chão: troca de quadro sem refazer o canvas dos tiles. 
local UNDER_Z_OFFSET = DRAW_FIRST - 1
--[[
	*
	 * Camadas do que é desenhado deitado no chão. `Piece`: as peças móveis dos interiores, acima dos tiles.
	 * `Light`: os halos das luzes (`lights.ts`), por cima de tudo o que é deitado.
	 
]]
local GroundLayer = {
	Grass = 0,
	Soil = 1,
	Piece = 2,
	Shadow = 3,
	Light = 4,
}
--[[
	*
	 * O chão visível: um Part alinhado com a tela, com um SurfaceGui cujo canvas é medido em pixels de arte.
	 * Ele é o chão de verdade com a profundidade comprimida (`toView`): fica quase de frente para a câmera, e
	 * cada pixel de arte tem o mesmo tamanho na tela inteira. A grama e tudo o que fica deitado (solo, sombras) são ImageLabels nesse canvas,
	 * ordenados entre si por ZIndex. Sem `grass`, o canvas começa vazio (o interior do Diorama põe os tiles dele).
	 
]]
local function createGround(parent, center, canvasSize, grass, zOffset, role)
	if grass == nil then
		grass = true
	end
	if zOffset == nil then
		zOffset = DRAW_FIRST
	end
	if role == nil then
		role = "fixo"
	end
	local part = Instance.new("Part")
	part.Name = "Ground"
	part.Anchored = true
	part.CanCollide = false
	part.CanQuery = false
	part.CanTouch = false
	part.CastShadow = false
	part.Transparency = 1
	-- O "para baixo" do chão (um stud em direção à câmera), já comprimido.
	local down = toView(TOWARD_CAMERA)
	part.Size = Vector3.new(canvasSize.X / ART_PX_PER_STUD, canvasSize.Y * GROUND_STUDS_PER_PX * down.Magnitude, THICKNESS)
	-- A face Front fica virada para a câmera (era para cima, antes da compressão); a direita do canvas é
	-- a direita da tela e o pé do canvas é o lado da câmera.
	local right = SCREEN_RIGHT * (-1)
	local up = down.Unit * (-1)
	local back = right:Cross(up).Unit
	local _exp = toView(center)
	local _arg0 = THICKNESS / 2
	local _arg0_1 = back * _arg0
	part.CFrame = CFrame.fromMatrix(_exp + _arg0_1, right, up, back)
	local gui = Instance.new("SurfaceGui")
	gui.Face = Enum.NormalId.Front
	gui.SizingMode = Enum.SurfaceGuiSizingMode.FixedSize
	gui.CanvasSize = canvasSize
	gui.LightInfluence = 0
	gui.MaxDistance = SURFACE_MAX_DISTANCE
	gui.ZOffset = zOffset
	gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
	-- O papel do canvas, para o painel de desempenho contar quantas vezes cada um é refeito (`client/perf.ts`).
	gui:SetAttribute(CANVAS_ROLE_ATTRIBUTE, role)
	gui.Parent = part
	if grass then
		local label = Instance.new("ImageLabel")
		label.Name = "Grass"
		label.BackgroundTransparency = 1
		label.Size = UDim2.fromScale(1, 1)
		label.Image = GRASS_TILE.image
		label.ScaleType = Enum.ScaleType.Tile
		label.TileSize = UDim2.fromOffset(GRASS_TILE.size.X, GRASS_TILE.size.Y)
		label.ResampleMode = Enum.ResamplerMode.Pixelated
		label.ZIndex = GroundLayer.Grass
		label.Parent = gui
	end
	local _exp_1 = canvasSize / 2
	local _arg0_2 = worldToArtPx(center)
	local origin = _exp_1 - _arg0_2
	part.Parent = parent
	local canvasPosition = function(sprite, position)
		local _arg0_3 = worldToArtPx(position)
		local _exp_2 = origin + _arg0_3
		local _anchor = sprite.anchor
		local at = _exp_2 - _anchor
		return UDim2.fromOffset(math.round(at.X), math.round(at.Y))
	end
	return {
		part = part,
		gui = gui,
		moveFlat = function(self, label, sprite, position)
			local at = canvasPosition(sprite, position)
			if label.Position ~= at then
				label.Position = at
			end
		end,
		addFlat = function(self, sprite, position, layer)
			local label = Instance.new("ImageLabel")
			label.BackgroundTransparency = 1
			label.Position = canvasPosition(sprite, position)
			label.Size = UDim2.fromOffset(sprite.size.X, sprite.size.Y)
			label.Image = sprite.image
			label.ImageRectOffset = sprite.frames[1]
			label.ImageRectSize = sprite.size
			label.ResampleMode = Enum.ResamplerMode.Pixelated
			label.ZIndex = layer
			label.Parent = gui
			return label
		end,
	}
end
return {
	createGround = createGround,
	SURFACE_MAX_DISTANCE = SURFACE_MAX_DISTANCE,
	LIVE_Z_OFFSET = LIVE_Z_OFFSET,
	UNDER_Z_OFFSET = UNDER_Z_OFFSET,
	GroundLayer = GroundLayer,
}
