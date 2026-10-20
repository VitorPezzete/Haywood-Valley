-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local _vide = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "vide", "src")
local Vide = _vide
local cleanup = _vide.cleanup
local PERF_SYSTEMS = TS.import(script, script.Parent.Parent, "perf").PERF_SYSTEMS
local t = TS.import(script, script.Parent, "i18n").t
local _kit = TS.import(script, script.Parent, "kit")
local BODY = _kit.BODY
local LABEL = _kit.LABEL
local screenScale = _kit.screenScale
local _theme = TS.import(script, script.Parent, "theme")
local themeColor = _theme.themeColor
local themed = _theme.themed
--* O que o painel de desempenho mostra, medido pelo `DevToolsController`. 
--* O orçamento da seção 8 da especificação do Diorama: de 1.000 a 2.500 imagens e de 150 a 400 cartões. 
local IMAGE_BUDGET = Vector2.new(1000, 2500)
local CARD_BUDGET = 400
--[[
	*
	 * Metas da seção 9.4 do `PLANO_OTIMIZACAO.md` para o celular fraco, o alvo do jogo (decisão do usuário em
	 * 2026-10-18: Android de 3 GB de 2020 para cá, iPhone XR ou 11, a 30 quadros por segundo): o quadro, os nossos
	 * scripts por quadro, a memória total e a de textura, e a rede recebida.
	 
]]
local FRAME_TARGET_MS = 33
local SCRIPTS_TARGET_MS = 6
local MEMORY_TARGET_MB = 600
local TEXTURE_TARGET_MB = 150
local NETWORK_TARGET_KBPS = 30
local PANEL = Vector2.new(214, 166)
--* A linha de texto, em pixels de arte do painel. 
local LINE = 8
--[[
	*
	 * O painel nunca fica menor que esta escala: num celular o `k` da interface é 1, e a letra de 6 pixels não se
	 * lê. Com 1,5, a letra fica com 9 pontos e o painel inteiro cabe na altura de um celular deitado (390 pontos).
	 
]]
local MIN_PANEL_K = 1.5
local WARN = Color3.fromRGB(214, 64, 52)
local SOFT = Color3.fromRGB(210, 150, 40)
local function verdict(reading)
	if reading.images > IMAGE_BUDGET.Y then
		return { "dev.budget.over", WARN }
	end
	if reading.cards > CARD_BUDGET then
		return { "dev.budget.cardsOver", WARN }
	end
	if reading.images < IMAGE_BUDGET.X then
		return { "dev.budget.low", nil }
	end
	return { "dev.budget.ok", SOFT }
end
local one = function(value)
	return string.format("%.1f", value)
end
local two = function(value)
	return string.format("%.2f", value)
end
--[[
	*
	 * As ferramentas de desenvolvimento por cima do jogo (no Studio, com o atributo de teste ou pelo gesto de quem
	 * pode): o painel de desempenho no canto de cima à esquerda, com as imagens, as instâncias, os cartões, os bonecos,
	 * o tempo por quadro, o tempo de cada sistema nosso (média por quadro e, entre parênteses, a vez mais lenta, em
	 * ms), quantas vezes por segundo cada canvas do chão é refeito, a memória e a rede; cada linha fica vermelha
	 * acima da meta do celular fraco. Na prévia de celular, o preto em volta do retângulo da tela do celular, com a
	 * medida dela.
	 
]]
local function DevPanel(_param)
	local budget = _param.budget
	local phoneRect = _param.phoneRect
	local phoneLabel = _param.phoneLabel
	local _binding = screenScale()
	local k = _binding.k
	local pk = function()
		return math.max(k(), MIN_PANEL_K)
	end
	local reading = function()
		return budget()
	end
	local line = function(row, text, color, column, width)
		if column == nil then
			column = 0
		end
		if width == nil then
			width = PANEL.X - 12
		end
		return Vide.jsx("textlabel", {
			BackgroundTransparency = 1,
			Position = function()
				return UDim2.fromOffset((6 + column) * pk(), (12 + row * LINE) * pk())
			end,
			Size = function()
				return UDim2.fromOffset(width * pk(), LINE * pk())
			end,
			FontFace = BODY,
			Text = text,
			TextXAlignment = "Left",
			TextColor3 = function()
				local _result = color
				if _result ~= nil then
					_result = _result()
				end
				local _condition = _result
				if _condition == nil then
					_condition = themeColor("text")
				end
				return _condition
			end,
			TextSize = function()
				return 6 * pk()
			end,
			ZIndex = 1002,
		})
	end
	--* Vermelho acima da meta. 
	local over = function(value, limit)
		return function()
			local r = reading()
			return if r and value(r) > limit then WARN else nil
		end
	end
	local bar = function(name, position, size)
		return Vide.jsx("frame", {
			Name = name,
			BackgroundColor3 = Color3.new(0, 0, 0),
			BorderSizePixel = 0,
			Position = position,
			Size = size,
			ZIndex = 1000,
		})
	end
	-- Os sistemas em duas colunas, sempre na mesma ordem (`PERF_SYSTEMS`).
	local systemRows = math.ceil(#PERF_SYSTEMS / 2)
	-- ▼ ReadonlyArray.map ▼
	local _newValue = table.create(#PERF_SYSTEMS)
	local _callback = function(name, index)
		return line(6 + (index % systemRows), function()
			local _found = reading()
			if _found ~= nil then
				local _exp = _found.systems
				-- ▼ ReadonlyArray.find ▼
				local _callback_1 = function(item)
					return item.name == name
				end
				local _result
				for _i, _v in _exp do
					if _callback_1(_v, _i - 1, _exp) == true then
						_result = _v
						break
					end
				end
				-- ▲ ReadonlyArray.find ▲
				_found = _result
			end
			local found = _found
			local _object = {
				name = t(`dev.system.{name}`),
			}
			local _left = "ms"
			local _result = found
			if _result ~= nil then
				_result = _result.perFrameMs
			end
			local _condition = _result
			if _condition == nil then
				_condition = 0
			end
			_object[_left] = two(_condition)
			local _left_1 = "worst"
			local _result_1 = found
			if _result_1 ~= nil then
				_result_1 = _result_1.worstMs
			end
			local _condition_1 = _result_1
			if _condition_1 == nil then
				_condition_1 = 0
			end
			_object[_left_1] = two(_condition_1)
			return t("dev.budget.system", _object)
		end, nil, if index < systemRows then 0 else (PANEL.X - 12) / 2, (PANEL.X - 12) / 2)
	end
	for _k, _v in PERF_SYSTEMS do
		_newValue[_k] = _callback(_v, _k - 1, PERF_SYSTEMS)
	end
	-- ▲ ReadonlyArray.map ▲
	local systems = _newValue
	local after = 6 + systemRows
	local _exp = Vide.jsx("frame", {
		Name = "Phone",
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Visible = function()
			return phoneRect() ~= nil
		end,
	}, bar("Top", function()
		return UDim2.fromOffset(0, 0)
	end, function()
		local _result = phoneRect()
		if _result ~= nil then
			_result = _result.Min.Y
		end
		local _condition = _result
		if _condition == nil then
			_condition = 0
		end
		return UDim2.new(1, 0, 0, _condition)
	end), bar("Bottom", function()
		local _result = phoneRect()
		if _result ~= nil then
			_result = _result.Max.Y
		end
		local _condition = _result
		if _condition == nil then
			_condition = 0
		end
		return UDim2.fromOffset(0, _condition)
	end, function()
		local _result = phoneRect()
		if _result ~= nil then
			_result = _result.Max.Y
		end
		local _condition = _result
		if _condition == nil then
			_condition = 0
		end
		return UDim2.new(1, 0, 1, -_condition)
	end), bar("Left", function()
		local _result = phoneRect()
		if _result ~= nil then
			_result = _result.Min.Y
		end
		local _condition = _result
		if _condition == nil then
			_condition = 0
		end
		return UDim2.fromOffset(0, _condition)
	end, function()
		local _result = phoneRect()
		if _result ~= nil then
			_result = _result.Min.X
		end
		local _condition = _result
		if _condition == nil then
			_condition = 0
		end
		local _result_1 = phoneRect()
		if _result_1 ~= nil then
			_result_1 = _result_1.Height
		end
		local _condition_1 = _result_1
		if _condition_1 == nil then
			_condition_1 = 0
		end
		return UDim2.fromOffset(_condition, _condition_1)
	end), bar("Right", function()
		local _result = phoneRect()
		if _result ~= nil then
			_result = _result.Max.X
		end
		local _condition = _result
		if _condition == nil then
			_condition = 0
		end
		local _result_1 = phoneRect()
		if _result_1 ~= nil then
			_result_1 = _result_1.Min.Y
		end
		local _condition_1 = _result_1
		if _condition_1 == nil then
			_condition_1 = 0
		end
		return UDim2.fromOffset(_condition, _condition_1)
	end, function()
		local _result = phoneRect()
		if _result ~= nil then
			_result = _result.Max.X
		end
		local _condition = _result
		if _condition == nil then
			_condition = 0
		end
		local _exp_1 = -_condition
		local _result_1 = phoneRect()
		if _result_1 ~= nil then
			_result_1 = _result_1.Height
		end
		local _condition_1 = _result_1
		if _condition_1 == nil then
			_condition_1 = 0
		end
		return UDim2.new(1, _exp_1, 0, _condition_1)
	end), Vide.jsx("textlabel", {
		BackgroundTransparency = 1,
		Position = function()
			local _result = phoneRect()
			if _result ~= nil then
				_result = _result.Min.X
			end
			local _condition = _result
			if _condition == nil then
				_condition = 0
			end
			local _result_1 = phoneRect()
			if _result_1 ~= nil then
				_result_1 = _result_1.Max.Y
			end
			local _condition_1 = _result_1
			if _condition_1 == nil then
				_condition_1 = 0
			end
			return UDim2.fromOffset(_condition, _condition_1 + 2)
		end,
		Size = function()
			local _result = phoneRect()
			if _result ~= nil then
				_result = _result.Width
			end
			local _condition = _result
			if _condition == nil then
				_condition = 0
			end
			return UDim2.fromOffset(_condition, 16)
		end,
		FontFace = LABEL,
		Text = phoneLabel,
		TextColor3 = Color3.new(1, 1, 1),
		TextSize = 10,
		ZIndex = 1001,
	}))
	local _attributes = table.clone(themed("tooltip", pk))
	setmetatable(_attributes, nil)
	_attributes.Name = "Budget"
	_attributes.Visible = function()
		return reading() ~= nil
	end
	_attributes.Position = function()
		return UDim2.fromOffset(6 * pk(), 52 + 6 * pk())
	end
	_attributes.Size = function()
		return UDim2.fromOffset(PANEL.X * pk(), PANEL.Y * pk())
	end
	_attributes.ZIndex = 1001
	local gui = (Vide.jsx("screengui", {
		Name = "DevTools",
		ResetOnSpawn = false,
		DisplayOrder = 1000,
		AutoLocalize = false,
		IgnoreGuiInset = true,
	}, _exp, Vide.jsx("imagelabel", _attributes, Vide.jsx("textlabel", {
		BackgroundTransparency = 1,
		Position = function()
			return UDim2.fromOffset(6 * pk(), 3 * pk())
		end,
		Size = function()
			return UDim2.fromOffset((PANEL.X - 12) * pk(), 8 * pk())
		end,
		FontFace = LABEL,
		Text = function()
			return t("dev.budget.title")
		end,
		TextXAlignment = "Left",
		TextColor3 = function()
			return themeColor("text")
		end,
		TextSize = function()
			return 5 * pk()
		end,
		ZIndex = 1002,
	}), line(0, function()
		local _object = {}
		local _left = "map"
		local _result = reading()
		if _result ~= nil then
			_result = _result.map
		end
		local _condition = _result
		if _condition == nil then
			_condition = ""
		end
		_object[_left] = _condition
		return t("dev.budget.map", _object)
	end), line(1, function()
		local r = reading()
		local _object = {}
		local _left = "n"
		local _result = r
		if _result ~= nil then
			_result = _result.images
		end
		local _condition = _result
		if _condition == nil then
			_condition = 0
		end
		_object[_left] = tostring(_condition)
		local _left_1 = "still"
		local _result_1 = r
		if _result_1 ~= nil then
			_result_1 = _result_1.groundStill
		end
		local _condition_1 = _result_1
		if _condition_1 == nil then
			_condition_1 = 0
		end
		_object[_left_1] = tostring(_condition_1)
		local _left_2 = "live"
		local _result_2 = r
		if _result_2 ~= nil then
			_result_2 = _result_2.groundLive
		end
		local _condition_2 = _result_2
		if _condition_2 == nil then
			_condition_2 = 0
		end
		_object[_left_2] = tostring(_condition_2)
		return t("dev.budget.imagesSplit", _object)
	end, over(function(r)
		return r.images
	end, IMAGE_BUDGET.Y)), line(2, function()
		local _object = {}
		local _left = "n"
		local _result = reading()
		if _result ~= nil then
			_result = _result.instances
		end
		local _condition = _result
		if _condition == nil then
			_condition = 0
		end
		_object[_left] = tostring(_condition)
		local _left_1 = "cards"
		local _result_1 = reading()
		if _result_1 ~= nil then
			_result_1 = _result_1.cards
		end
		local _condition_1 = _result_1
		if _condition_1 == nil then
			_condition_1 = 0
		end
		_object[_left_1] = tostring(_condition_1)
		return t("dev.budget.counts", _object)
	end, over(function(r)
		return r.cards
	end, CARD_BUDGET)), line(3, function()
		local r = reading()
		local _object = {}
		local _left = "shown"
		local _result = r
		if _result ~= nil then
			_result = _result.actorsShown
		end
		local _condition = _result
		if _condition == nil then
			_condition = 0
		end
		_object[_left] = tostring(_condition)
		local _left_1 = "screen"
		local _result_1 = r
		if _result_1 ~= nil then
			_result_1 = _result_1.actorsOnScreen
		end
		local _condition_1 = _result_1
		if _condition_1 == nil then
			_condition_1 = 0
		end
		_object[_left_1] = tostring(_condition_1)
		local _left_2 = "pool"
		local _result_2 = r
		if _result_2 ~= nil then
			_result_2 = _result_2.actorsPool
		end
		local _condition_2 = _result_2
		if _condition_2 == nil then
			_condition_2 = 0
		end
		_object[_left_2] = tostring(_condition_2)
		return t("dev.budget.actors", _object)
	end), line(4, function()
		local r = reading()
		local _object = {}
		local _left = "ms"
		local _result = r
		if _result ~= nil then
			_result = _result.frameMs
		end
		local _condition = _result
		if _condition == nil then
			_condition = 0
		end
		_object[_left] = one(_condition)
		local _left_1 = "fps"
		local _result_1 = r
		if _result_1 ~= nil then
			_result_1 = _result_1.fps
		end
		local _condition_1 = _result_1
		if _condition_1 == nil then
			_condition_1 = 0
		end
		_object[_left_1] = tostring(math.round(_condition_1))
		local _left_2 = "worst"
		local _result_2 = r
		if _result_2 ~= nil then
			_result_2 = _result_2.worstMs
		end
		local _condition_2 = _result_2
		if _condition_2 == nil then
			_condition_2 = 0
		end
		_object[_left_2] = one(_condition_2)
		return t("dev.budget.frame", _object)
	end, over(function(r)
		return r.frameMs
	end, FRAME_TARGET_MS)), line(5, function()
		local _object = {}
		local _left = "ms"
		local _result = reading()
		if _result ~= nil then
			_result = _result.scriptsMs
		end
		local _condition = _result
		if _condition == nil then
			_condition = 0
		end
		_object[_left] = two(_condition)
		return t("dev.budget.scripts", _object)
	end, over(function(r)
		return r.scriptsMs
	end, SCRIPTS_TARGET_MS)), systems, line(after, function()
		local _result = reading()
		if _result ~= nil then
			_result = _result.redraws
		end
		local _condition = _result
		if _condition == nil then
			_condition = { 0, 0, 0 }
		end
		local r = _condition
		return t("dev.budget.redraws", {
			still = one(r[1]),
			live = one(r[2]),
			sea = one(r[3]),
		})
	end), line(after + 1, function()
		local r = reading()
		local _object = {}
		local _left = "total"
		local _result = r
		if _result ~= nil then
			_result = _result.memoryMb
		end
		local _condition = _result
		if _condition == nil then
			_condition = 0
		end
		_object[_left] = tostring(math.round(_condition))
		local _left_1 = "texture"
		local _result_1 = r
		if _result_1 ~= nil then
			_result_1 = _result_1.textureMb
		end
		local _condition_1 = _result_1
		if _condition_1 == nil then
			_condition_1 = 0
		end
		_object[_left_1] = tostring(math.round(_condition_1))
		local _left_2 = "character"
		local _result_2 = r
		if _result_2 ~= nil then
			_result_2 = _result_2.characterTextureMb
		end
		local _condition_2 = _result_2
		if _condition_2 == nil then
			_condition_2 = 0
		end
		_object[_left_2] = tostring(math.round(_condition_2))
		return t("dev.budget.memory", _object)
	end, function()
		local r = reading()
		return if r and (r.memoryMb > MEMORY_TARGET_MB or r.textureMb + r.characterTextureMb > TEXTURE_TARGET_MB) then WARN else nil
	end), line(after + 2, function()
		local r = reading()
		local _object = {}
		local _left = "gui"
		local _result = r
		if _result ~= nil then
			_result = _result.guiMb
		end
		local _condition = _result
		if _condition == nil then
			_condition = 0
		end
		_object[_left] = tostring(math.round(_condition))
		local _left_1 = "lua"
		local _result_1 = r
		if _result_1 ~= nil then
			_result_1 = _result_1.luaMb
		end
		local _condition_1 = _result_1
		if _condition_1 == nil then
			_condition_1 = 0
		end
		_object[_left_1] = tostring(math.round(_condition_1))
		local _left_2 = "inst"
		local _result_2 = r
		if _result_2 ~= nil then
			_result_2 = _result_2.instancesMb
		end
		local _condition_2 = _result_2
		if _condition_2 == nil then
			_condition_2 = 0
		end
		_object[_left_2] = tostring(math.round(_condition_2))
		local _left_3 = "anim"
		local _result_3 = r
		if _result_3 ~= nil then
			_result_3 = _result_3.animationMb
		end
		local _condition_3 = _result_3
		if _condition_3 == nil then
			_condition_3 = 0
		end
		_object[_left_3] = tostring(math.round(_condition_3))
		return t("dev.budget.memoryMore", _object)
	end), line(after + 3, function()
		local _object = {}
		local _left = "recv"
		local _result = reading()
		if _result ~= nil then
			_result = _result.receiveKbps
		end
		local _condition = _result
		if _condition == nil then
			_condition = 0
		end
		_object[_left] = one(_condition)
		local _left_1 = "send"
		local _result_1 = reading()
		if _result_1 ~= nil then
			_result_1 = _result_1.sendKbps
		end
		local _condition_1 = _result_1
		if _condition_1 == nil then
			_condition_1 = 0
		end
		_object[_left_1] = one(_condition_1)
		return t("dev.budget.network", _object)
	end, over(function(r)
		return r.receiveKbps
	end, NETWORK_TARGET_KBPS)), line(after + 4, function()
		local r = reading()
		return if r then t(verdict(r)[1]) else ""
	end, function()
		local r = reading()
		return if r then verdict(r)[2] else nil
	end))))
	cleanup(gui)
	return gui
end
return {
	DevPanel = DevPanel,
	IMAGE_BUDGET = IMAGE_BUDGET,
	CARD_BUDGET = CARD_BUDGET,
}
