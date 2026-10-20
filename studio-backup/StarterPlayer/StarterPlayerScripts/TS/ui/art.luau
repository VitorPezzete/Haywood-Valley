-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local ASSETS = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "assets").ASSETS
-- Folha ui_atlas.png, gerada por draw_ui.lua (pasta Aseprite); o id no registro (ui.atlas).
-- As linhas de `UiArt` são a saída desse script: colar de novo sempre que a folha mudar.
local UI_ATLAS = ASSETS["ui.atlas"]
local function piece(x, y, w, h)
	return {
		image = UI_ATLAS,
		offset = Vector2.new(x, y),
		size = Vector2.new(w, h),
	}
end
local UiArt = {
	cloud1 = piece(2, 2, 143, 50),
	cloud2 = piece(147, 2, 127, 37),
	cloud3 = piece(276, 2, 76, 29),
	parchment = piece(354, 2, 24, 24),
	clay = piece(380, 2, 24, 24),
	well = piece(406, 2, 16, 16),
	card = piece(424, 2, 24, 24),
	woodBar = piece(450, 2, 24, 18),
	woodGrain = piece(2, 54, 96, 16),
	purpleBar = piece(100, 54, 16, 16),
	purpleDiamonds = piece(118, 54, 54, 16),
	slot = piece(174, 54, 20, 20),
	slotSelected = piece(196, 54, 22, 22),
	swatch = piece(220, 54, 20, 20),
	pill = piece(242, 54, 24, 18),
	keycap = piece(268, 54, 14, 14),
	hintBack = piece(284, 54, 16, 16),
	ring = piece(302, 54, 26, 26),
	ringSelected = piece(330, 54, 26, 26),
	dot = piece(358, 54, 20, 20),
	ribbon = piece(380, 54, 30, 16),
	cursorHand = piece(412, 54, 18, 12),
	glow = piece(2, 82, 95, 95),
	sliderTrack = piece(99, 82, 16, 12),
	sliderKnob = piece(117, 82, 7, 13),
	colorChip = piece(126, 82, 20, 20),
}
--* Borda que não estica numa peça fatiada em 9, em pixels da folha. 
local function border(left, top, right, bottom)
	return {
		left = left,
		top = top,
		right = right,
		bottom = bottom,
	}
end
local Slice = {
	parchment = border(6, 6, 6, 6),
	clay = border(6, 6, 6, 6),
	well = border(4, 4, 4, 4),
	card = border(6, 6, 6, 6),
	woodBar = border(6, 6, 6, 4),
	purpleBar = border(4, 4, 4, 2),
	slot = border(4, 4, 4, 4),
	slotSelected = border(6, 6, 6, 6),
	swatch = border(4, 4, 4, 4),
	pill = border(9, 8, 9, 8),
	keycap = border(4, 4, 4, 5),
	hintBack = border(6, 6, 6, 6),
	ribbon = border(12, 4, 4, 4),
	sliderTrack = border(5, 5, 5, 5),
	colorChip = border(6, 6, 6, 6),
}
-- Folha chat_bubble.png, gerada por tools/chat_bubble.py (pasta Aseprite): o balão de fala do chat, no
-- estilo dos balões de emoticon. As linhas abaixo são a saída desse script: colar de novo sempre que a folha mudar.
-- O id no registro (ui.chat).
local CHAT_SHEET = ASSETS["ui.chat"]
local function chat(x, y, w, h)
	return {
		image = CHAT_SHEET,
		offset = Vector2.new(x, y),
		size = Vector2.new(w, h),
	}
end
local ChatArt = {
	body = chat(2, 2, 10, 9),
	tail = chat(14, 2, 7, 6),
	face = chat(2, 13, 12, 7),
}
local ChatSlice = {
	body = border(4, 4, 4, 3),
}
--* Linhas do rabinho que cobrem a borda de baixo do corpo. 
local CHAT_TAIL_OVERLAP = 2
--* Deslocamento do rosto do balão de reação `bubble` a partir de `ChatArt.face`. 
local function chatFaceStep(bubble)
	return Vector2.new((bubble % 5) * 14, math.floor(bubble / 5) * 9)
end
--[[
	*
	 * Logo da marca na escala de pixel da tela de título (ui_logo_title.png): HAYWOOD em ouro e VALLEY
	 * em pervinca, a mesma da miniatura. Sai de `logo()` em `marca/ponte_final/thumb.py` (pasta Aseprite).
	 
]]
local LOGO = {
	image = ASSETS["ui.logo"],
	size = Vector2.new(217, 98),
}
--[[
	*
	 * Ilustração da tela de título (draw_title.lua), em camadas do mesmo tamanho: o vale ao fundo e,
	 * por cima das nuvens, o morro com o fazendeiro deitado.
	 
]]
local TITLE = {
	size = Vector2.new(768, 432),
	image = ASSETS["titulo.vila"],
	view = Vector2.new(480, 270),
	panFrom = Vector2.new(0, 24),
	panTo = Vector2.new(288, 156),
	panSeconds = 45,
}
--[[
	*
	 * A água do rio da cena do menu (title_village_water.png): cada faixa tem o lugar dela na cena (`at`,
	 * `size`) e o canto de cada quadro na folha; os quadros trocam a `TITLE_WATER_FPS` por segundo.
	 
]]
local TITLE_WATER = { {
	image = ASSETS["titulo.agua"],
	at = Vector2.new(0, 198),
	size = Vector2.new(467, 234),
	frames = { Vector2.new(0, 0), Vector2.new(467, 0), Vector2.new(0, 234), Vector2.new(467, 234) },
} }
local TITLE_WATER_FPS = 4
-- Folha title_clouds.png, montada por tools/title_pack.py; as linhas abaixo são a saída dele. O id no registro
-- (titulo.nuvens).
local TITLE_CLOUD_SHEET = ASSETS["titulo.nuvens"]
local function cloud(x, y, w, h)
	return {
		image = TITLE_CLOUD_SHEET,
		offset = Vector2.new(x, y),
		size = Vector2.new(w, h),
	}
end
local TitleClouds = {
	cloud1 = cloud(2, 2, 232, 111),
	cloud2 = cloud(236, 2, 160, 80),
	cloud3 = cloud(398, 2, 111, 54),
}
--[[
	*
	 * Sombras de nuvem que passam pela cena do menu: as nuvens da tela de título antiga, pintadas de escuro
	 * e quase transparentes. `y` é a altura na cena quando a sombra entra pela esquerda, `speed` a
	 * velocidade em pixels de arte por segundo (para a direita, descendo `TITLE_SHADOW_SLOPE` por pixel) e
	 * `start` onde ela está quando o menu abre.
	 
]]
local TITLE_SHADOWS = { {
	piece = TitleClouds.cloud1,
	y = -40,
	speed = 6,
	start = 120,
}, {
	piece = TitleClouds.cloud2,
	y = 150,
	speed = 5,
	start = 620,
}, {
	piece = TitleClouds.cloud3,
	y = 60,
	speed = 7,
	start = 860,
}, {
	piece = TitleClouds.cloud2,
	y = 260,
	speed = 4,
	start = 330,
} }
local TITLE_SHADOW_SLOPE = 0.3
return {
	chatFaceStep = chatFaceStep,
	UiArt = UiArt,
	Slice = Slice,
	ChatArt = ChatArt,
	ChatSlice = ChatSlice,
	CHAT_TAIL_OVERLAP = CHAT_TAIL_OVERLAP,
	LOGO = LOGO,
	TITLE = TITLE,
	TITLE_WATER = TITLE_WATER,
	TITLE_WATER_FPS = TITLE_WATER_FPS,
	TITLE_SHADOWS = TITLE_SHADOWS,
	TITLE_SHADOW_SLOPE = TITLE_SHADOW_SLOPE,
}
