-- RotSprite nosso: girar pixel art em qualquer ângulo sem criar cor e sem borrar o traço (2026-10-22).
--
-- Plano e números dos testes: docs/arte/PLANO_ROTSPRITE.md. Testes: aseprite/pixel/testes.lua (npm run teste:pixel).
-- Menu: Arquivo > Diorama > "Girar (RotSprite)…" (aseprite/diorama/diorama.lua).
--
--   local R = dofile([[C:\Users\Szortek\Documents\Haywood-Valley\aseprite\pixel\rotsprite.lua]])
--   R.girar_imagem(img, angulo, opcoes) -> Image, info    -- puro, sem sprite
--   R.girar{ arquivo?, camada?, quadro?, angulo, pivo?, area?, reducao?, tolerancia?, limpar?, recortar?,
--            espelho?, cores_linha?, saida_camada?, png?, png_escala?, salvar? } -> info
--   R.folha{ ...as mesmas..., angulos = {0, 45, 90} | passos = 8, png?, novo_sprite? } -> info
--
-- Ângulo em graus, positivo no sentido do relógio (como o Rotate do Aseprite); normalizado (-90 = 270).
-- Algoritmo (o de Xenowhirl, 2007): Scale2x três vezes (8×), giro pelo vizinho mais próximo, volta a 1× escolhendo
-- uma cor por bloco 8×8; depois a limpeza (órfãos criados pelo giro e doubles, com aseprite/pixel/limpeza.lua).
-- 0°, 90°, 180°, 270° e os espelhos são exatos, pixel a pixel.

local R = { VERSAO = "1.0.0" }

local pc = app.pixelColor

-- A limpeza mora ao lado deste arquivo.
local function pastaDeste()
	-- Nível 1 é a função anônima (deste arquivo); pcall(debug.getinfo, 1) daria o próprio pcall.
	local ok, info = pcall(function() return debug.getinfo(1, "S") end)
	if ok and info and type(info.source) == "string" and info.source:sub(1, 1) == "@" then
		return app.fs.filePath(info.source:sub(2))
	end
	return nil
end

local L
do
	local pasta = pastaDeste()
	if pasta and app.fs.isFile(app.fs.joinPath(pasta, "limpeza.lua")) then
		L = dofile(app.fs.joinPath(pasta, "limpeza.lua"))
	end
end

--- Para quem carregou este arquivo de um jeito que não deixa achar a pasta: entrega o módulo da limpeza.
function R.usar_limpeza(modulo)
	L = modulo
end

local function limpeza()
	if L == nil then error("rotsprite: limpeza.lua não foi carregada (R.usar_limpeza)", 0) end
	return L
end

-- ---------------------------------------------------------------------------------------------------------------
-- Comparação de cores: igualdade exata, ou distância no OKLab até `tolerancia` (arte com ruído de compressão).

local function linear(c)
	c = c / 255
	if c <= 0.04045 then return c / 12.92 end
	return ((c + 0.055) / 1.055) ^ 2.4
end

local function oklab(r, g, b)
	r, g, b = linear(r), linear(g), linear(b)
	local l = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ^ (1 / 3)
	local m = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ^ (1 / 3)
	local s = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) ^ (1 / 3)
	return 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
end

local function comparador(g, tolerancia, paleta)
	if not tolerancia or tolerancia <= 0 then
		return function(a, b) return a == b end
	end
	local cache = {}
	local function lab(v)
		local c = cache[v]
		if c then return c end
		local r, gg, b
		if g.modo == ColorMode.RGB then
			r, gg, b = pc.rgbaR(v), pc.rgbaG(v), pc.rgbaB(v)
		elseif g.modo == ColorMode.GRAY then
			r = pc.grayaV(v)
			gg, b = r, r
		elseif paleta and v < #paleta then
			local cor = paleta:getColor(v)
			r, gg, b = cor.red, cor.green, cor.blue
		else
			r, gg, b = v, v, v
		end
		c = { oklab(r, gg, b) }
		cache[v] = c
		return c
	end
	local t = g.t
	return function(a, b)
		if a == b then return true end
		if a == t or b == t then return false end
		local p, q = lab(a), lab(b)
		local d = math.sqrt((p[1] - q[1]) ^ 2 + (p[2] - q[2]) ^ 2 + (p[3] - q[3]) ^ 2)
		return d <= tolerancia
	end
end

-- ---------------------------------------------------------------------------------------------------------------
-- Scale2x (EPX). Fora da imagem conta como transparente (o Aseprite repete o pixel da borda; para um sprite, o que
-- está fora da célula é transparente de verdade).

local function scale2x(src, w, h, t, igual)
	local dst, W = {}, 2 * w
	for y = 0, h - 1 do
		for x = 0, w - 1 do
			local i = y * w + x + 1
			local P = src[i]
			local A = (y > 0) and src[i - w] or t
			local B = (x < w - 1) and src[i + 1] or t
			local C = (x > 0) and src[i - 1] or t
			local D = (y < h - 1) and src[i + w] or t
			local e0, e1, e2, e3 = P, P, P, P
			if igual(C, A) and not igual(C, D) and not igual(A, B) then e0 = A end
			if igual(A, B) and not igual(A, C) and not igual(B, D) then e1 = B end
			if igual(D, C) and not igual(D, B) and not igual(C, A) then e2 = C end
			if igual(B, D) and not igual(B, A) and not igual(D, C) then e3 = D end
			local j = 2 * y * W + 2 * x + 1
			dst[j], dst[j + 1], dst[j + W], dst[j + W + 1] = e0, e1, e2, e3
		end
	end
	return dst
end
R.scale2x = scale2x

-- ---------------------------------------------------------------------------------------------------------------
-- Casos exatos

local function normalizar(angulo)
	local a = tonumber(angulo) or 0
	a = a % 360
	if math.abs(a - 360) < 1e-9 then a = 0 end
	return a
end
R.normalizar = normalizar

local function exatoDe(a)
	for _, q in ipairs({ 0, 90, 180, 270 }) do
		if math.abs(a - q) < 1e-9 then return q end
	end
	return nil
end

local function girarExato(g, q)
	local w, h, px = g.w, g.h, g.px
	local nw, nh = w, h
	if q == 90 or q == 270 then nw, nh = h, w end
	local out = {}
	for y = 0, h - 1 do
		for x = 0, w - 1 do
			local nx, ny
			if q == 0 then nx, ny = x, y
			elseif q == 90 then nx, ny = h - 1 - y, x
			elseif q == 180 then nx, ny = w - 1 - x, h - 1 - y
			else nx, ny = y, w - 1 - x end
			out[ny * nw + nx + 1] = px[y * w + x + 1]
		end
	end
	return { w = nw, h = nh, px = out, modo = g.modo, t = g.t }
end

local function espelhar(g, eixo)
	local w, h, px = g.w, g.h, g.px
	local out = {}
	for y = 0, h - 1 do
		for x = 0, w - 1 do
			local sx, sy = x, y
			if eixo == "h" then sx = w - 1 - x else sy = h - 1 - y end
			out[y * w + x + 1] = px[sy * w + sx + 1]
		end
	end
	return { w = w, h = h, px = out, modo = g.modo, t = g.t }
end

--- Uma grade recortada/colocada num retângulo (ox, oy, ow, oh) das coordenadas dela (fora vira transparente).
local function reenquadrar(g, ox, oy, ow, oh)
	local out = {}
	for y = 0, oh - 1 do
		for x = 0, ow - 1 do
			local sx, sy = x + ox, y + oy
			local v = g.t
			if sx >= 0 and sy >= 0 and sx < g.w and sy < g.h then v = g.px[sy * g.w + sx + 1] end
			out[y * ow + x + 1] = v
		end
	end
	return { w = ow, h = oh, px = out, modo = g.modo, t = g.t }
end

-- ---------------------------------------------------------------------------------------------------------------
-- Pivô

--- O pivô em coordenadas da grade: "centro" (padrão), "pe" (meio da base do que é opaco) ou {x, y}.
local function pivoDe(g, pivo, origem)
	local ox, oy = origem and origem[1] or 0, origem and origem[2] or 0
	if pivo == nil or pivo == "centro" then
		return g.w / 2, g.h / 2
	end
	if pivo == "pe" then
		local x0, x1, y1 = math.huge, -1, -1
		for y = 0, g.h - 1 do
			for x = 0, g.w - 1 do
				if g.px[y * g.w + x + 1] ~= g.t then
					if x < x0 then x0 = x end
					if x > x1 then x1 = x end
					if y > y1 then y1 = y end
				end
			end
		end
		if x1 < 0 then return g.w / 2, g.h end
		return (x0 + x1 + 1) / 2, y1 + 1
	end
	if type(pivo) == "table" then
		return (pivo.x or pivo[1]) - ox, (pivo.y or pivo[2]) - oy
	end
	if type(pivo) == "userdata" then
		return pivo.x - ox, pivo.y - oy
	end
	error("pivo precisa ser \"centro\", \"pe\" ou {x, y}", 0)
end

-- ---------------------------------------------------------------------------------------------------------------
-- O giro

--- Gira uma grade. Devolve a grade nova e a info (sem a limpeza).
local function girarGrade(g, angulo, o)
	o = o or {}
	local a = normalizar(angulo)
	local px, py = pivoDe(g, o.pivo, o.origem)
	local q = exatoDe(a)
	if q then
		-- Exato: troca de linhas e colunas. O deslocamento leva o retângulo girado em volta do pivô.
		local saida = girarExato(g, q)
		local rad = math.rad(q)
		local c, s = math.floor(math.cos(rad) + 0.5), math.floor(math.sin(rad) + 0.5)
		local minx, miny = math.huge, math.huge
		for _, p in ipairs({ { 0, 0 }, { g.w, 0 }, { g.w, g.h }, { 0, g.h } }) do
			local dx, dy = p[1] - px, p[2] - py
			local x = px + dx * c - dy * s
			local y = py + dx * s + dy * c
			if x < minx then minx = x end
			if y < miny then miny = y end
		end
		local dx, dy = math.floor(minx + 0.5), math.floor(miny + 0.5)
		if o.recortar then
			saida = reenquadrar(saida, -dx, -dy, g.w, g.h)
			dx, dy = 0, 0
		end
		return saida, { exato = true, deslocamento = { dx, dy }, angulo = a }
	end

	local rad = math.rad(a)
	local c, s = math.cos(rad), math.sin(rad)
	-- Retângulo de saída (coordenadas da grade original).
	local ox, oy, ow, oh
	if o.recortar then
		ox, oy, ow, oh = 0, 0, g.w, g.h
	else
		local minx, miny, maxx, maxy = math.huge, math.huge, -math.huge, -math.huge
		for _, p in ipairs({ { 0, 0 }, { g.w, 0 }, { g.w, g.h }, { 0, g.h } }) do
			local dx, dy = p[1] - px, p[2] - py
			local x = px + dx * c - dy * s
			local y = py + dx * s + dy * c
			minx, maxx = math.min(minx, x), math.max(maxx, x)
			miny, maxy = math.min(miny, y), math.max(maxy, y)
		end
		ox, oy = math.floor(minx + 1e-6), math.floor(miny + 1e-6)
		ow, oh = math.ceil(maxx - 1e-6) - ox, math.ceil(maxy - 1e-6) - oy
	end

	-- 1. 8× com Scale2x, três vezes.
	local igual = comparador(g, o.tolerancia, o.paleta)
	local t = g.t
	local s8 = g.px
	local w8, h8 = g.w, g.h
	for _ = 1, 3 do
		s8 = scale2x(s8, w8, h8, t, igual)
		w8, h8 = w8 * 2, h8 * 2
	end

	-- 2 e 3. Para cada pixel de saída, o bloco 8×8 dele na imagem 8× girada: 64 amostras, cada uma o vizinho mais
	-- próximo do ponto que o giro leva até ela.
	local function amostra(sx, sy)
		local dx, dy = sx - px, sy - py
		local u = px + dx * c + dy * s
		local v = py - dx * s + dy * c
		local iu, iv = math.floor(u * 8), math.floor(v * 8)
		if iu < 0 or iv < 0 or iu >= w8 or iv >= h8 then return t end
		return s8[iv * w8 + iu + 1]
	end
	local reducao = o.reducao or "centro"
	local opacidade = o.opacidade or "maioria"
	local out = {}
	local origemFonte = {} -- o pixel da imagem original que o centro de cada pixel de saída veio buscar
	for Y = 0, oh - 1 do
		for X = 0, ow - 1 do
			local cx, cy = ox + X + 0.5, oy + Y + 0.5
			local centro = amostra(cx, cy)
			local cont, perto, ordem, opacos = {}, {}, {}, 0
			for j = 0, 7 do
				for i = 0, 7 do
					local v = amostra(ox + X + (i + 0.5) / 8, oy + Y + (j + 0.5) / 8)
					if v ~= t then
						opacos = opacos + 1
						if cont[v] == nil then
							cont[v] = 0
							perto[v] = math.huge
							ordem[#ordem + 1] = v
						end
						cont[v] = cont[v] + 1
						local d = (i - 3.5) ^ 2 + (j - 3.5) ^ 2
						if d < perto[v] then perto[v] = d end
					end
				end
			end
			local maisFrequente = nil
			for _, v in ipairs(ordem) do
				if maisFrequente == nil or cont[v] > cont[maisFrequente]
					or (cont[v] == cont[maisFrequente] and perto[v] < perto[maisFrequente]) then
					maisFrequente = v
				end
			end
			local cor
			local opaco
			if opacidade == "amostra" then
				opaco = (centro ~= t)
			else
				opaco = opacos * 2 > 64
			end
			if not opaco then
				cor = t
			elseif reducao == "maioria" then
				cor = maisFrequente
			else
				cor = (centro ~= t) and centro or maisFrequente
			end
			local k = Y * ow + X + 1
			out[k] = cor
			local dx, dy = cx - px, cy - py
			origemFonte[k] = { math.floor(px + dx * c + dy * s), math.floor(py - dx * s + dy * c) }
		end
	end
	return { w = ow, h = oh, px = out, modo = g.modo, t = t }, {
		exato = false,
		deslocamento = { ox, oy },
		angulo = a,
		origemFonte = origemFonte,
	}
end

--- A limpeza depois do giro: órfãos que o giro criou e doubles que não estavam no original.
local function limparGiro(gFonte, gSaida, origemFonte, o)
	local Lm = limpeza()
	local linhas, lista = Lm.resolver_linhas(gFonte, o.cores_linha or "auto", o.paleta)
	local valores = {}
	for v in pairs(linhas) do valores[#valores + 1] = v end
	-- O que já estava no original fica: órfãos (um brilho de 1 px no olho) e doubles que o artista pôs.
	local ctxTudo = { dentro = function() return true end }
	local orfaosFonte = {}
	for _, q in ipairs(Lm.achar_orfaos(gFonte, ctxTudo)) do
		orfaosFonte[q[2] * gFonte.w + q[1] + 1] = true
	end
	local doublesFonte = {}
	if #valores > 0 then
		local copia = Lm.copiar_grade(gFonte)
		local tudo = { dentro = function() return true end, mexivel = function() return true end }
		for _, q in ipairs(Lm.remover_doubles(copia, linhas, tudo, 3)) do
			doublesFonte[q[2] * gFonte.w + q[1] + 1] = true
		end
	end
	local function fonte(x, y)
		local f = origemFonte[y * gSaida.w + x + 1]
		if f == nil then return nil end
		return f[1], f[2]
	end
	local function legitimo(x, y, v)
		local fx, fy = fonte(x, y)
		if fx == nil then return false end
		for dy = -1, 1 do
			for dx = -1, 1 do
				local sx, sy = fx + dx, fy + dy
				if sx >= 0 and sy >= 0 and sx < gFonte.w and sy < gFonte.h then
					local i = sy * gFonte.w + sx + 1
					if orfaosFonte[i] and gFonte.px[i] == v then return true end
				end
			end
		end
		return false
	end
	local function protegido(x, y)
		local fx, fy = fonte(x, y)
		if fx == nil or fx < 0 or fy < 0 or fx >= gFonte.w or fy >= gFonte.h then return false end
		return doublesFonte[fy * gFonte.w + fx + 1] == true
	end
	local nova, rel = Lm.limpar_grade(gSaida, {
		cores_linha = (#valores > 0) and valores or {},
		paleta = o.paleta,
		doubles = #valores > 0,
		jaggies = false,
		orfaos = "corrigir",
		orfao_legitimo = legitimo,
		protegidos = protegido,
	})
	return nova, {
		orfaos = rel.orfaos.corrigidos,
		doubles = rel.doubles.corrigidos,
		pixels = rel.mudados,
		cores_linha = lista,
	}
end

--- Gira uma grade (L.grade) e devolve a grade nova e a info. Para quem já tem a grade (testes, folha).
function R.girar_grade(g, angulo, opcoes)
	local o = opcoes or {}
	local fonte = g
	if o.espelho == "h" or o.espelho == "v" then
		fonte = espelhar(g, o.espelho)
	elseif o.espelho ~= nil and o.espelho ~= false then
		error("espelho precisa ser \"h\" ou \"v\"", 0)
	end
	local saida, info = girarGrade(fonte, angulo, o)
	local Lm = limpeza()
	info.cores_antes = Lm.contar_cores(g)
	if not info.exato and o.limpar ~= false then
		saida, info.limpeza = limparGiro(fonte, saida, info.origemFonte, o)
	else
		info.limpeza = { orfaos = 0, doubles = 0, pixels = 0 }
	end
	info.origemFonte = nil
	info.cores_depois = Lm.contar_cores(saida)
	info.cores_novas = Lm.cores_novas(g, saida)
	info.largura, info.altura = saida.w, saida.h
	info.reducao = info.exato and "exato" or (o.reducao or "centro")
	return saida, info
end

--- Gira uma Image (qualquer modo de cor). `opcoes`: pivo ("centro" | "pe" | {x, y} em pixels da imagem),
--- reducao ("centro" | "maioria"), opacidade ("maioria" | "amostra"), tolerancia (OKLab, 0 = exata), limpar
--- (padrão true), recortar (mantém o tamanho), espelho ("h" | "v", antes do giro), cores_linha (padrão "auto"),
--- paleta (indexado, para a tolerância e a cor de linha). Devolve a Image nova e a info: largura, altura,
--- deslocamento {x, y} (onde o canto da imagem nova fica em relação ao da original), cores_antes, cores_depois,
--- cores_novas, limpeza { orfaos, doubles, pixels }, exato, angulo.
function R.girar_imagem(img, angulo, opcoes)
	local g = limpeza().grade(img)
	local saida, info = R.girar_grade(g, angulo, opcoes)
	return limpeza().imagem_da_grade(saida), info
end

-- ---------------------------------------------------------------------------------------------------------------
-- Sobre um sprite (com desfazer)

local function lerRetangulo(a)
	if a == nil then return nil end
	if type(a) == "userdata" then return { x = a.x, y = a.y, w = a.width, h = a.height } end
	return { x = a.x or a[1], y = a.y or a[2], w = a.w or a.width or a[3], h = a.h or a.height or a[4] }
end

--- A imagem de onde se gira: a célula inteira ou o pedaço dela dentro de `area` (coordenadas do sprite). Devolve a
--- Image e a origem dela no sprite.
local function fonteDaCelula(spr, cel, area)
	local pos = cel.position
	if area == nil then
		return cel.image, { pos.x, pos.y }
	end
	local r = lerRetangulo(area)
	local img = Image(r.w, r.h, cel.image.colorMode)
	if cel.image.colorMode == ColorMode.INDEXED then img:clear(spr.transparentColor) end
	img:drawImage(cel.image, Point(pos.x - r.x, pos.y - r.y), 255, BlendMode.SRC)
	return img, { r.x, r.y }
end

local function salvarPng(img, arquivo, escala, paleta)
	escala = math.max(1, math.floor(escala or 1))
	local saida = img
	if escala > 1 then
		saida = Image(img.width * escala, img.height * escala, img.colorMode)
		if img.colorMode == ColorMode.INDEXED then saida:clear(img.spec.transparentColor) end
		for y = 0, img.height - 1 do
			for x = 0, img.width - 1 do
				local v = img:getPixel(x, y)
				for j = 0, escala - 1 do
					for i = 0, escala - 1 do
						saida:drawPixel(x * escala + i, y * escala + j, v)
					end
				end
			end
		end
	end
	if img.colorMode == ColorMode.INDEXED and paleta then
		saida:saveAs{ filename = arquivo, palette = paleta }
	else
		saida:saveAs(arquivo)
	end
end
R.salvar_png = salvarPng

local function abrirSprite(o)
	local spr = o.arquivo and app.open(o.arquivo) or app.sprite
	if spr == nil then error("nenhum sprite aberto", 0) end
	return spr
end

local function nomeAngulo(a)
	if a == math.floor(a) then return string.format("%d", a) end
	return string.format("%.1f", a)
end

--- Gira uma camada de um sprite (o aberto, ou `arquivo`) e põe o resultado numa camada nova (`saida_camada`, padrão
--- "<camada> <ângulo>°"); o original fica. `pivo` e `area` em coordenadas do sprite. Uma transação só (um Ctrl+Z
--- desfaz). `png` grava o resultado (ampliado por `png_escala`); `salvar = true` grava o arquivo, um texto grava uma
--- cópia nesse caminho. Devolve a info de girar_imagem, mais camada, posicao {x, y} da célula nova.
function R.girar(o)
	o = o or {}
	local Lm = limpeza()
	local spr = abrirSprite(o)
	local camada = Lm.achar_camada(spr, o.camada)
	local quadro = Lm.achar_quadro(spr, o.quadro)
	local cel = camada:cel(quadro)
	if cel == nil then error("a camada " .. camada.name .. " não tem célula no quadro " .. quadro.frameNumber, 0) end
	local img, origem = fonteDaCelula(spr, cel, o.area)
	local opcoes = {}
	for k, v in pairs(o) do opcoes[k] = v end
	opcoes.origem = origem
	opcoes.paleta = spr.palettes[1]
	local nova, info = R.girar_imagem(img, o.angulo or 0, opcoes)
	local pos = Point(origem[1] + info.deslocamento[1], origem[2] + info.deslocamento[2])
	local nome = o.saida_camada or (camada.name .. " " .. nomeAngulo(info.angulo) .. "°")
	app.transaction("Girar (RotSprite)", function()
		local l = Lm.por_em_camada(spr, camada, quadro, nome, nova, pos)
		info.camada = l.name
	end)
	info.posicao = { pos.x, pos.y }
	if o.png then
		salvarPng(nova, o.png, o.png_escala, spr.palettes[1])
		info.png = o.png
	end
	if o.salvar == true then
		spr:saveAs(spr.filename)
	elseif type(o.salvar) == "string" then
		spr:saveCopyAs(o.salvar)
	end
	return info
end

--- Uma tira com a camada girada em vários ângulos (`angulos`, ou `passos` ângulos iguais de 0 a 360). Cada célula da
--- tira tem o mesmo tamanho e o pivô no mesmo lugar. Abre num sprite novo (a não ser com `novo_sprite = false`) e
--- grava `png` se pedido. Devolve { angulos, celula = {l, a}, largura, altura, pivo = {x, y} na célula, infos,
--- imagem, sprite? }.
function R.folha(o)
	o = o or {}
	local Lm = limpeza()
	local spr = abrirSprite(o)
	local camada = Lm.achar_camada(spr, o.camada)
	local quadro = Lm.achar_quadro(spr, o.quadro)
	local cel = camada:cel(quadro)
	if cel == nil then error("a camada " .. camada.name .. " não tem célula no quadro " .. quadro.frameNumber, 0) end
	local img, origem = fonteDaCelula(spr, cel, o.area)
	local angulos = o.angulos
	if angulos == nil then
		local n = math.max(1, math.floor(o.passos or 8))
		angulos = {}
		for k = 0, n - 1 do angulos[#angulos + 1] = k * 360 / n end
	end
	local opcoes = {}
	for k, v in pairs(o) do opcoes[k] = v end
	opcoes.origem = origem
	opcoes.paleta = spr.palettes[1]
	opcoes.recortar = false
	local g = Lm.grade(img)
	local giradas, infos = {}, {}
	local minx, miny, maxx, maxy = math.huge, math.huge, -math.huge, -math.huge
	for k, a in ipairs(angulos) do
		local s, info = R.girar_grade(g, a, opcoes)
		giradas[k], infos[k] = s, info
		local dx, dy = info.deslocamento[1], info.deslocamento[2]
		minx, miny = math.min(minx, dx), math.min(miny, dy)
		maxx, maxy = math.max(maxx, dx + s.w), math.max(maxy, dy + s.h)
	end
	local cw, ch = maxx - minx, maxy - miny
	local tira = Image(cw * #angulos, ch, img.colorMode)
	if img.colorMode == ColorMode.INDEXED then tira:clear(spr.transparentColor) end
	for k, s in ipairs(giradas) do
		local pedaco = Lm.imagem_da_grade(s)
		local dx, dy = infos[k].deslocamento[1], infos[k].deslocamento[2]
		tira:drawImage(pedaco, Point((k - 1) * cw + dx - minx, dy - miny), 255, BlendMode.SRC)
	end
	local px, py = pivoDe(g, o.pivo, origem)
	local res = {
		angulos = angulos,
		celula = { cw, ch },
		largura = tira.width,
		altura = tira.height,
		pivo = { px - minx, py - miny },
		infos = infos,
		imagem = tira,
	}
	if o.png then
		salvarPng(tira, o.png, o.png_escala, spr.palettes[1])
		res.png = o.png
	end
	if o.novo_sprite ~= false then
		local nova = Sprite(tira.width, tira.height, img.colorMode)
		if img.colorMode == ColorMode.INDEXED then
			nova:setPalette(spr.palettes[1])
			nova.transparentColor = spr.transparentColor
		end
		nova.cels[1].image = tira
		nova.layers[1].name = camada.name .. " girada"
		nova.filename = (app.fs.fileTitle(spr.filename or "") ~= "" and app.fs.fileTitle(spr.filename) or "sprite") .. "_rotsprite"
		pcall(function() nova.gridBounds = Rectangle(0, 0, cw, ch) end)
		res.sprite = nova
	end
	return res
end

return R
