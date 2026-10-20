-- Compiled with roblox-ts v3.0.0
-- O tom do dia nas imagens do mundo. Cada `ImageLabel` (e o texto dos balões) desenhado no mundo tem a cor
-- multiplicada pelo tom da hora (`shared/daylight.ts`): `ImageColor3` = cor dela × tom. A luz do Roblox não
-- entra (os `SurfaceGui` ficam com `LightInfluence = 0`), e a interface, em `ScreenGui`, fica de fora.
--
-- Por que uma cor por imagem, e não um `CanvasGroup` por `SurfaceGui`: o `CanvasGroup` desenha o conteúdo
-- numa textura e a refaz a cada mudança dentro dele (o boneco muda a cada quadro), gasta memória de textura
-- do tamanho do canvas (o chão do interior tem uns 2560 × 1824 pixels de arte) e reamostra essa textura ao
-- desenhar, o que pode borrar o pixel. O `SurfaceGui` não tem cor própria (só `Brightness`, sem cor). Já o
-- `ImageColor3` é uma propriedade de cada imagem, sem textura nova: trocar o tom é um laço que muda uma cor
-- por imagem, e só quando o tom muda (`TINT_INTERVAL`). O custo medido fica no Output (`[Luz]`).
local TINT_INTERVAL = 0.25
--[[
	*
	 * Atributo que deixa uma imagem fora do tom: os halos e as fontes de luz (a chama, a lâmpada, o vidro aceso),
	 * que ficam na cor cheia à noite.
	 
]]
local NO_TINT_ATTRIBUTE = "SemTom"
--* A cor de cada imagem sem o tom: a que o código que a criou pôs nela. 
local bases = {}
--* O tom próprio de algumas imagens, no lugar do tom do dia: o boneco dentro de um halo (`setOwnTone`). 
local own = {}
local tone = Color3.new(1, 1, 1)
local appliedAt = -math.huge
--* Quanto levou a última troca de tom, em milissegundos, e em quantas imagens. 
local tintStats = {
	images = 0,
	lastMs = 0,
	maxMs = 0,
	applies = 0,
}
local function times(a, b)
	return Color3.new(a.R * b.R, a.G * b.G, a.B * b.B)
end
local function paint(label, base)
	local _exp = base
	local _label = label
	local _condition = own[_label]
	if _condition == nil then
		_condition = tone
	end
	local color = times(_exp, _condition)
	if label:IsA("ImageLabel") then
		label.ImageColor3 = color
	else
		label.TextColor3 = color
	end
end
local function track(instance)
	if not instance:IsA("ImageLabel") and not instance:IsA("TextLabel") then
		return nil
	end
	local _condition = instance:GetAttribute(NO_TINT_ATTRIBUTE) == true
	if not _condition then
		local _instance = instance
		_condition = bases[_instance] ~= nil
	end
	if _condition then
		return nil
	end
	local base = if instance:IsA("ImageLabel") then instance.ImageColor3 else instance.TextColor3
	local _instance = instance
	bases[_instance] = base
	paint(instance, base)
end
--* Tira a imagem do tom e devolve a cor dela, para que entrar de novo no mundo não tinja duas vezes. 
local function untrack(instance)
	if not instance:IsA("ImageLabel") and not instance:IsA("TextLabel") then
		return nil
	end
	local _instance = instance
	local base = bases[_instance]
	if not base then
		return nil
	end
	local _instance_1 = instance
	bases[_instance_1] = nil
	local _instance_2 = instance
	own[_instance_2] = nil
	if instance:IsA("ImageLabel") then
		instance.ImageColor3 = base
	else
		instance.TextColor3 = base
	end
end
--[[
	*
	 * Passa a tingir tudo o que há e o que entrar em `root` (a pasta `World` do `SceneController`). A cor de
	 * base de cada imagem é lida no fim do quadro em que ela entra, depois de o código que a criou pôr as
	 * propriedades; quem muda a cor de uma imagem depois disso chama `setTintBase`.
	 
]]
local function watchTint(root)
	for _, instance in root:GetDescendants() do
		track(instance)
	end
	local added = root.DescendantAdded:Connect(function(instance)
		if not instance:IsA("ImageLabel") and not instance:IsA("TextLabel") then
			return nil
		end
		task.defer(function()
			if instance:IsDescendantOf(root) then
				track(instance)
			end
		end)
	end)
	local removing = root.DescendantRemoving:Connect(untrack)
	return function()
		added:Disconnect()
		removing:Disconnect()
	end
end
--[[
	*
	 * Dá à imagem um tom só dela no lugar do tom do dia, ou volta ao tom do dia com nada: o boneco perto de uma luz
	 * clareia e esquenta como o chão em volta. Quem chama compara antes, para não pintar a cada quadro à toa.
	 
]]
local function setOwnTone(label, color)
	if color then
		local _label = label
		local _color = color
		own[_label] = _color
	else
		local _label = label
		own[_label] = nil
	end
	local _label = label
	local base = bases[_label]
	if base then
		paint(label, base)
	end
end
--* O tom do dia em uso agora. 
local function dayTone()
	return tone
end
--* Muda a cor de base de uma imagem do mundo (a pintura do boneco); ela aparece já com o tom. 
local function setTintBase(label, color)
	local _label = label
	if bases[_label] ~= nil then
		local _label_1 = label
		local _color = color
		bases[_label_1] = _color
		paint(label, color)
	else
		label.ImageColor3 = color
	end
end
--[[
	*
	 * Pede o tom `color`. Só muda as imagens quando o tom muda de verdade (em passos de 1/255) e no máximo a cada
	 * `TINT_INTERVAL` segundos: num dia de 10 minutos, o tom anda uns 2 passos por segundo nas passagens.
	 
]]
local function setTone(color, now, force)
	if force == nil then
		force = false
	end
	local quantized = Color3.fromRGB(math.round(color.R * 255), math.round(color.G * 255), math.round(color.B * 255))
	if quantized == tone and not force then
		return nil
	end
	if not force and now - appliedAt < TINT_INTERVAL then
		return nil
	end
	appliedAt = now
	tone = quantized
	local started = os.clock()
	local count = 0
	for label, base in bases do
		paint(label, base)
		count += 1
	end
	local ms = (os.clock() - started) * 1000
	tintStats.images = count
	tintStats.lastMs = ms
	tintStats.maxMs = math.max(tintStats.maxMs, ms)
	tintStats.applies += 1
end
--* Quantas imagens o tom pinta agora. 
local function tintedCount()
	-- ▼ ReadonlyMap.size ▼
	local _size = 0
	for _ in bases do
		_size += 1
	end
	-- ▲ ReadonlyMap.size ▲
	return _size
end
return {
	watchTint = watchTint,
	setOwnTone = setOwnTone,
	dayTone = dayTone,
	setTintBase = setTintBase,
	setTone = setTone,
	tintedCount = tintedCount,
	NO_TINT_ATTRIBUTE = NO_TINT_ATTRIBUTE,
	tintStats = tintStats,
}
