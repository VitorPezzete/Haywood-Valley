-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
-- O balão de fala do chat, que substitui o balão do Roblox em cima do personagem: o corpo e o
-- rabinho dos balões de emoticon do Cozy People (folha chat_bubble.png, tools/chat_bubble.py), com o
-- texto dentro e, quando o personagem está reagindo, o rosto da reação à esquerda do texto.
--
-- É um cartão como os outros objetos do mundo (card.ts), com uma diferença: o canvas do SurfaceGui
-- é medido em pixels da tela (o pixel de arte vezes o zoom do mundo), e não em pixels de arte, para a
-- letra ser desenhada no tamanho em que aparece e sair nítida. As peças da folha são ampliadas pelo
-- mesmo zoom, com `Pixelated`, então continuam do tamanho do resto da arte.
local _services = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services")
local TextService = _services.TextService
local Workspace = _services.Workspace
local _view = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "view")
local ART_PX_PER_STUD = _view.ART_PX_PER_STUD
local LOOK = _view.LOOK
local SCREEN_UP = _view.SCREEN_UP
local VIEW_DEPTH_PER_PX = _view.VIEW_DEPTH_PER_PX
local worldZoom = TS.import(script, script.Parent.Parent, "state", "camera").worldZoom
local _art = TS.import(script, script.Parent.Parent, "ui", "art")
local CHAT_TAIL_OVERLAP = _art.CHAT_TAIL_OVERLAP
local ChatArt = _art.ChatArt
local chatFaceStep = _art.chatFaceStep
local ChatSlice = _art.ChatSlice
local BODY = TS.import(script, script.Parent.Parent, "ui", "kit").BODY
local cardCFrame = TS.import(script, script.Parent, "card").cardCFrame
local SURFACE_MAX_DISTANCE = TS.import(script, script.Parent, "ground").SURFACE_MAX_DISTANCE
-- Medidas em pixels de arte.
--* Altura da linha do texto. A letra é a BODY (Montserrat Medium), que tem os acentos. 
local TEXT_SIZE = 8
--* Largura em que o texto quebra a linha, e quantas linhas cabem; o que passa disso termina em "…". 
local MAX_TEXT_WIDTH = 112
local MAX_LINES = 3
--* Da borda de fora do corpo até o texto: dos lados, em cima e embaixo (com a linha de sombra). 
local PAD_X = 5
local PAD_TOP = 3
local PAD_BOTTOM = 4
--* O corpo nunca fica mais estreito que o do balão de reação. 
local MIN_WIDTH = 14
--* O rosto da reação fica à esquerda do texto, com esta folga até ele. 
local FACE_X = PAD_X - 1
local FACE_GAP = 2
--* Tinta do texto: o contorno do balão bem mais escuro, porque o do balão é claro demais para letra. 
local INK = Color3.fromRGB(62, 52, 48)
--[[
	*
	 * Folga entre o pixel mais alto do boneco (`figureHeight`, que já conta o penteado) e a ponta do
	 * rabinho. Com o Curto e o Rabo de cavalo, a ponta fica 41 pixels acima do chão; com o Espetado, 47.
	 
]]
local CLEARANCE = 2
--[[
	*
	 * Quanto o balão vem para perto da câmera, medido em pixels de chão: o que está em pé até esta
	 * distância à frente do personagem (árvore, arbusto, plantação) passa a ser desenhado antes do balão,
	 * então não cobre o texto. O balão encolhe na mesma proporção e continua do mesmo tamanho na tela.
	 * Na profundidade comprimida do desenho (`VIEW_DEPTH_PER_PX`).
	 
]]
local LIFT_PX = 160
local LIFT = LIFT_PX * VIEW_DEPTH_PER_PX
local THICKNESS = 0.05
--* Quanto tempo a fala fica à mostra: um tanto fixo e mais um pouco por letra, entre o mínimo e o máximo. 
local SECONDS_BASE = 3
local SECONDS_PER_LETTER = 0.08
local SECONDS_MIN = 4
local SECONDS_MAX = 12
--* O fim da fala, em que o balão vai sumindo. 
local FADE_SECONDS = 0.4
--[[
	*
	 * A reação que chega logo depois da fala ainda põe o rosto no balão. A de quem fala chega quase
	 * sempre antes (ela sai na hora; a fala espera o filtro do Roblox), mas pode vir um pouco depois.
	 
]]
local FACE_GRACE = 0.5
--* Peça da folha num `ImageLabel`, sem esticar. 
local function pieceLabel(parent, piece, zIndex)
	local label = Instance.new("ImageLabel")
	label.BackgroundTransparency = 1
	label.Image = piece.image
	label.ImageRectOffset = piece.offset
	label.ImageRectSize = piece.size
	label.ResampleMode = Enum.ResamplerMode.Pixelated
	label.ZIndex = zIndex
	label.Parent = parent
	return label
end
--[[
	*
	 * O balão do chat de um personagem. A fala nova substitui a que estiver à mostra; o texto é medido
	 * antes de aparecer (`TextService`), para o balão ter o tamanho do texto em pixels de arte inteiros.
	 
]]
local ChatBalloon
do
	ChatBalloon = setmetatable({}, {
		__tostring = function()
			return "ChatBalloon"
		end,
	})
	ChatBalloon.__index = ChatBalloon
	function ChatBalloon.new(...)
		local self = setmetatable({}, ChatBalloon)
		return self:constructor(...) or self
	end
	function ChatBalloon:constructor(parent, name)
		self.serial = 0
		self.text = ""
		self.pendingSeconds = 0
		self.measuring = false
		self.measuredZoom = 0
		self.size = Vector2.zero
		self.withFace = false
		self.faceBubble = -1
		self.reaction = -1
		self.openedAt = -1
		self.seconds = 0
		self.transparency = -1
		self.scale = 0
		self.destroyed = false
		local part = Instance.new("Part")
		part.Name = name
		part.Anchored = true
		part.CanCollide = false
		part.CanQuery = false
		part.CanTouch = false
		part.CastShadow = false
		part.Transparency = 1
		part.Size = Vector3.new(1, 1, THICKNESS)
		local gui = Instance.new("SurfaceGui")
		gui.Face = Enum.NormalId.Front
		gui.SizingMode = Enum.SurfaceGuiSizingMode.FixedSize
		gui.LightInfluence = 0
		gui.MaxDistance = SURFACE_MAX_DISTANCE
		gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
		-- O texto é do jogador, já filtrado e traduzido pelo chat do Roblox: a tradução automática não mexe.
		gui.AutoLocalize = false
		gui.Enabled = false
		gui.Parent = part
		local body = pieceLabel(gui, ChatArt.body, 1)
		body.ScaleType = Enum.ScaleType.Slice
		local slice = ChatSlice.body
		body.SliceCenter = Rect.new(slice.left, slice.top, ChatArt.body.size.X - slice.right, ChatArt.body.size.Y - slice.bottom)
		-- O rabinho cobre a borda de baixo do corpo, onde ele sai.
		local tail = pieceLabel(gui, ChatArt.tail, 2)
		local face = pieceLabel(gui, ChatArt.face, 3)
		face.Visible = false
		-- O texto que passa das linhas que cabem fica cortado na borda desta moldura.
		local clip = Instance.new("Frame")
		clip.BackgroundTransparency = 1
		clip.ClipsDescendants = true
		clip.ZIndex = 3
		clip.Parent = gui
		local label = Instance.new("TextLabel")
		label.BackgroundTransparency = 1
		label.FontFace = BODY
		label.TextColor3 = INK
		label.LineHeight = 1
		-- O chat do Roblox entrega o texto com <, > e & já trocados por entidades: com RichText eles
		-- voltam a aparecer como estão, e ninguém consegue formatar o texto dos outros.
		label.RichText = true
		label.TextWrapped = true
		label.TextXAlignment = Enum.TextXAlignment.Center
		label.TextYAlignment = Enum.TextYAlignment.Top
		label.AutoLocalize = false
		label.ZIndex = 3
		label.Parent = clip
		part.Parent = parent
		self.part = part
		self.gui = gui
		self.body = body
		self.tail = tail
		self.face = face
		self.clip = clip
		self.label = label
	end
	function ChatBalloon:show(text)
		self.serial += 1
		self.text = text
		local letters = utf8.len(text)
		local count = if type(letters) == "number" then letters else #text
		self.pendingSeconds = math.clamp(SECONDS_BASE + count * SECONDS_PER_LETTER, SECONDS_MIN, SECONDS_MAX)
		self:measure(true)
	end
	function ChatBalloon:hide()
		self.serial += 1
		self.measuring = false
		self:close()
	end
	function ChatBalloon:conceal()
		if self.gui.Enabled then
			self.gui.Enabled = false
		end
	end
	function ChatBalloon:destroy()
		self.destroyed = true
		self.serial += 1
		self.part:Destroy()
	end
	function ChatBalloon:update(now, ground, height, reaction)
		self.reaction = reaction
		if self.openedAt < 0 then
			return false
		end
		local age = now - self.openedAt
		if age >= self.seconds then
			self:close()
			return false
		end
		-- O zoom do mundo mudou (o jogador aproximou ou afastou, ou a janela mudou de tamanho): o texto é
		-- medido de novo nele.
		if not self.measuring and worldZoom() ~= self.measuredZoom then
			self:measure(false)
		end
		if reaction >= 0 then
			if not self.withFace and age < FACE_GRACE then
				self.withFace = true
				self:layout()
			end
			if self.withFace then
				self:showFace(reaction)
			end
		end
		-- O balão salta para o lugar, como o de reação, mas não flutua: o texto ficaria tremendo.
		local hop = if age < 0.08 then -2 elseif age < 0.16 then 1 else 0
		local anchor = Vector2.new(math.floor(self.size.X / 2), self.size.Y)
		local _self = self
		local _exp = cardCFrame(self.size, anchor, ground)
		local _arg0 = (height + CLEARANCE + hop) / ART_PX_PER_STUD
		local _arg0_1 = SCREEN_UP * _arg0
		_self:place(_exp + _arg0_1)
		self:fade(math.clamp((age - (self.seconds - FADE_SECONDS)) / FADE_SECONDS, 0, 1))
		self.gui.Enabled = true
		return true
	end
	function ChatBalloon:close()
		self.openedAt = -1
		self.gui.Enabled = false
	end
	function ChatBalloon:measure(fresh)
		local zoom = worldZoom()
		local serial = self.serial
		local text = self.text
		self.measuring = true
		task.spawn(function()
			local params = Instance.new("GetTextBoundsParams")
			params.Text = text
			params.Font = BODY
			params.Size = TEXT_SIZE * zoom
			params.Width = MAX_TEXT_WIDTH * zoom
			params.RichText = true
			local ok, result = pcall(function()
				return TextService:GetTextBoundsAsync(params)
			end)
			params:Destroy()
			if self.destroyed or serial ~= self.serial then
				return nil
			end
			self.measuring = false
			if not ok then
				warn(`[chat] could not measure the balloon text: {result}`)
				return nil
			end
			self.bounds = result
			self.measuredZoom = zoom
			if fresh then
				self.label.Text = text
				self.openedAt = os.clock()
				self.seconds = self.pendingSeconds
				self.withFace = self.reaction >= 0
				self.faceBubble = -1
				if self.withFace then
					self:showFace(self.reaction)
				end
				self:fade(0)
			end
			self:layout()
		end)
	end
	function ChatBalloon:layout()
		local bounds = self.bounds
		if not bounds then
			return nil
		end
		local zoom = self.measuredZoom
		local at = function(x, y)
			return UDim2.fromOffset(x * zoom, y * zoom)
		end
		local lines = math.max(1, math.round(bounds.Y / (TEXT_SIZE * zoom)))
		local cut = lines > MAX_LINES
		local textHeight = math.min(lines, MAX_LINES) * TEXT_SIZE
		local textWidth = if cut then MAX_TEXT_WIDTH else math.clamp(math.ceil(bounds.X / zoom), 1, MAX_TEXT_WIDTH)
		local faceWidth = if self.withFace then ChatArt.face.size.X + FACE_GAP else 0
		local width = math.max(PAD_X * 2 + faceWidth + textWidth, MIN_WIDTH)
		local bodyHeight = PAD_TOP + textHeight + PAD_BOTTOM
		local tail = ChatArt.tail.size
		self.size = Vector2.new(width, bodyHeight + tail.Y - CHAT_TAIL_OVERLAP)
		self.gui.CanvasSize = self.size * zoom
		self.body.Size = at(width, bodyHeight)
		self.body.SliceScale = zoom
		self.tail.Position = at(math.floor((width - tail.X) / 2), bodyHeight - CHAT_TAIL_OVERLAP)
		self.tail.Size = at(tail.X, tail.Y)
		local face = ChatArt.face.size
		self.face.Visible = self.withFace
		self.face.Position = at(FACE_X, PAD_TOP + math.floor((textHeight - face.Y) / 2))
		self.face.Size = at(face.X, face.Y)
		local areaX = PAD_X + faceWidth
		local areaWidth = width - PAD_X - areaX
		self.clip.Position = at(areaX, PAD_TOP)
		self.clip.Size = at(areaWidth, textHeight)
		-- O rótulo tem a largura em que o texto foi medido, para quebrar as linhas nos mesmos lugares,
		-- centrado na área do texto; cada linha fica centrada nele, então nenhuma sai da área.
		self.label.Size = UDim2.fromOffset(MAX_TEXT_WIDTH * zoom, textHeight * zoom)
		self.label.Position = UDim2.fromOffset(math.floor(((areaWidth - MAX_TEXT_WIDTH) * zoom) / 2), 0)
		self.label.TextSize = TEXT_SIZE * zoom
		self.label.TextTruncate = if cut then Enum.TextTruncate.AtEnd else Enum.TextTruncate.None
		self.scale = 0
	end
	function ChatBalloon:showFace(bubble)
		if bubble < 0 or bubble == self.faceBubble then
			return nil
		end
		self.faceBubble = bubble
		local _offset = ChatArt.face.offset
		local _arg0 = chatFaceStep(bubble)
		self.face.ImageRectOffset = _offset + _arg0
	end
	function ChatBalloon:fade(alpha)
		if alpha == self.transparency then
			return nil
		end
		self.transparency = alpha
		self.body.ImageTransparency = alpha
		self.tail.ImageTransparency = alpha
		self.face.ImageTransparency = alpha
		self.label.TextTransparency = alpha
	end
	function ChatBalloon:place(at)
		local center = at.Position
		local scale = 1
		local camera = Workspace.CurrentCamera
		if camera then
			local eye = camera.CFrame.Position
			local depth = (center - eye):Dot(LOOK)
			-- Antes de a câmera do jogo assumir, ela pode estar em qualquer lugar: aí não aproxima.
			if depth > LIFT * 4 then
				scale = (depth - LIFT) / depth
				local _exp = center - eye
				local _scale = scale
				center = eye + (_exp * _scale)
			end
		end
		if math.abs(scale - self.scale) > 1e-5 then
			self.scale = scale
			self.part.Size = Vector3.new((self.size.X / ART_PX_PER_STUD) * scale, (self.size.Y / ART_PX_PER_STUD) * scale, THICKNESS)
		end
		local _rotation = at.Rotation
		local _center = center
		self.part.CFrame = _rotation + _center
	end
end
return {
	ChatBalloon = ChatBalloon,
}
