-- Testes do RotSprite e da limpeza de linhas (2026-10-22), em lote:
--
--   Aseprite.exe -b --script-param saida=<pasta temporária> --script-param vaca=<cópia de vaca.aseprite>
--                --script aseprite/pixel/testes.lua
--
-- Quem chama de costume é tools/testes/pixel.test.mjs (npm run teste:pixel), que copia a vaca para uma pasta
-- temporária (nunca o original) e lê as linhas "OK <caso>", "FALHOU <caso>: <motivo>" e "NUM <chave> <valor>".
-- Os casos são os das seções "Testes" de docs/arte/PLANO_ROTSPRITE.md e docs/arte/PLANO_LIMPEZA_LINHAS.md; os
-- números registrados lá saem das linhas NUM. Em `saida` ficam PNGs ampliados para conferir a olho.

local function aqui()
	local fonte = debug.getinfo(1, "S").source
	if fonte:sub(1, 1) == "@" then fonte = fonte:sub(2) end
	return app.fs.filePath(fonte)
end

local PASTA = aqui()
local L = dofile(app.fs.joinPath(PASTA, "limpeza.lua"))
local R = dofile(app.fs.joinPath(PASTA, "rotsprite.lua"))
local SAIDA = app.params.saida
local VACA = app.params.vaca
if SAIDA and SAIDA ~= "" and not app.fs.isDirectory(SAIDA) then app.fs.makeAllDirectories(SAIDA) end

local pc = app.pixelColor
local falhas, oks = 0, 0

local function caso(nome, f)
	local ok, e = pcall(f)
	if ok then
		oks = oks + 1
		print("OK " .. nome)
	else
		falhas = falhas + 1
		print("FALHOU " .. nome .. ": " .. tostring(e):gsub("\n", " "))
	end
end

local function confere(cond, msg)
	if not cond then error(msg, 2) end
end

local function num(chave, valor)
	if type(valor) == "number" and valor ~= math.floor(valor) then
		print(string.format("NUM %s %.4f", chave, valor))
	else
		print("NUM " .. chave .. " " .. tostring(valor))
	end
end

local function arquivo(nome)
	if not SAIDA or SAIDA == "" then return nil end
	return app.fs.joinPath(SAIDA, nome)
end

-- ---------------------------------------------------------------------------------------------------------------
-- Imagens de teste

local PRETO = pc.rgba(1, 0, 0, 255) -- #010000, o contorno do Aeko
local CREME = pc.rgba(237, 218, 205, 255)
local VERMELHO = pc.rgba(176, 66, 87, 255)
local CINZA = pc.rgba(54, 54, 59, 255)

--- Image RGB a partir de texto: '#' preto, 'o' creme, 'r' vermelho, 'c' cinza, '.' transparente.
local function desenho(linhas)
	local cores = { ["#"] = PRETO, o = CREME, r = VERMELHO, c = CINZA }
	local h, w = #linhas, #linhas[1]
	local img = Image(w, h, ColorMode.RGB)
	for y = 1, h do
		for x = 1, w do
			local ch = linhas[y]:sub(x, x)
			if cores[ch] then img:drawPixel(x - 1, y - 1, cores[ch]) end
		end
	end
	return img
end

--- Linha livre feita de corridas horizontais (subindo um pixel entre elas), com margem de 2.
local function escada(corridas)
	local total = 0
	for _, r in ipairs(corridas) do total = total + r end
	local img = Image(total + 4, #corridas + 4, ColorMode.RGB)
	local x, y = 2, #corridas + 1
	for _, r in ipairs(corridas) do
		for _ = 1, r do
			img:drawPixel(x, y, PRETO)
			x = x + 1
		end
		y = y - 1
	end
	return img
end

--- Círculo de contorno (ponto médio, sem doubles por construção) com o miolo creme.
local function circulo(raio)
	local n = 2 * raio + 5
	local img = Image(n, n, ColorMode.RGB)
	local c = raio + 2
	for y = 0, n - 1 do
		for x = 0, n - 1 do
			local d = math.sqrt((x - c) ^ 2 + (y - c) ^ 2)
			if d < raio - 0.5 then img:drawPixel(x, y, CREME) end
		end
	end
	local x, y, e = raio, 0, 1 - raio
	while x >= y do
		for _, p in ipairs({ { x, y }, { y, x }, { -y, x }, { -x, y }, { -x, -y }, { -y, -x }, { y, -x }, { x, -y } }) do
			img:drawPixel(c + p[1], c + p[2], PRETO)
		end
		y = y + 1
		if e < 0 then
			e = e + 2 * y + 1
		else
			x = x - 1
			e = e + 2 * (y - x) + 1
		end
	end
	return img
end

local function quadradoComContorno()
	return desenho({
		"............",
		".##########.",
		".#oooooooo#.",
		".#oooooooo#.",
		".#oorroooo#.",
		".#oorroooo#.",
		".#oooooooo#.",
		".#oooooooo#.",
		".##########.",
		"............",
	})
end

local function linhaDiagonal()
	local img = Image(20, 20, ColorMode.RGB)
	for k = 0, 15 do img:drawPixel(2 + k, 17 - k, PRETO) end
	return img
end

local function vacaAchatada()
	if not VACA or VACA == "" or not app.fs.isFile(VACA) then return nil end
	local spr = app.open(VACA)
	local img = Image(spr.width, spr.height, ColorMode.RGB)
	img:drawSprite(spr, 1)
	spr:close()
	return img
end

-- ---------------------------------------------------------------------------------------------------------------
-- Medidas

local function iguais(a, b)
	if a.width ~= b.width or a.height ~= b.height then return false end
	for y = 0, a.height - 1 do
		for x = 0, a.width - 1 do
			if a:getPixel(x, y) ~= b:getPixel(x, y) then return false end
		end
	end
	return true
end

local function rotacaoExata(img, q)
	local w, h = img.width, img.height
	local nw, nh = (q % 180 == 0) and w or h, (q % 180 == 0) and h or w
	local out = Image(nw, nh, img.colorMode)
	for y = 0, h - 1 do
		for x = 0, w - 1 do
			local nx, ny
			if q == 90 then nx, ny = h - 1 - y, x
			elseif q == 180 then nx, ny = w - 1 - x, h - 1 - y
			elseif q == 270 then nx, ny = y, w - 1 - x
			else nx, ny = x, y end
			out:drawPixel(nx, ny, img:getPixel(x, y))
		end
	end
	return out
end

--- 4-componentes do que não é linha (para saber se um contorno fechado continua fechado).
local function regioes(img, linha)
	local w, h = img.width, img.height
	local visto, n = {}, 0
	for y0 = 0, h - 1 do
		for x0 = 0, w - 1 do
			local i0 = y0 * w + x0
			if not visto[i0] and img:getPixel(x0, y0) ~= linha then
				n = n + 1
				local pilha = { { x0, y0 } }
				visto[i0] = true
				while #pilha > 0 do
					local p = table.remove(pilha)
					for _, d in ipairs({ { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 } }) do
						local x, y = p[1] + d[1], p[2] + d[2]
						if x >= 0 and y >= 0 and x < w and y < h and not visto[y * w + x] and img:getPixel(x, y) ~= linha then
							visto[y * w + x] = true
							pilha[#pilha + 1] = { x, y }
						end
					end
				end
			end
		end
	end
	return n
end

local function mudados(a, b)
	local n = 0
	for y = 0, a.height - 1 do
		for x = 0, a.width - 1 do
			if a:getPixel(x, y) ~= b:getPixel(x, y) then n = n + 1 end
		end
	end
	return n
end

--- Imagem ampliada (×e) com fundo xadrez, para os PNGs de conferência; várias lado a lado.
local function painel(nomeArq, imagens, e)
	local caminho = arquivo(nomeArq)
	if not caminho then return end
	e = e or 8
	local larg, alt = 0, 0
	for _, img in ipairs(imagens) do
		larg = larg + img.width * e + e
		alt = math.max(alt, img.height * e)
	end
	local out = Image(larg - e, alt, ColorMode.RGB)
	out:clear(pc.rgba(255, 255, 255, 255))
	local x0 = 0
	for _, img in ipairs(imagens) do
		for y = 0, img.height - 1 do
			for x = 0, img.width - 1 do
				local v = img:getPixel(x, y)
				if pc.rgbaA(v) == 0 then
					v = ((x + y) % 2 == 0) and pc.rgba(236, 236, 236, 255) or pc.rgba(214, 214, 214, 255)
				end
				for j = 0, e - 1 do
					for i = 0, e - 1 do out:drawPixel(x0 + x * e + i, y * e + j, v) end
				end
			end
		end
		x0 = x0 + img.width * e + e
	end
	out:saveAs(caminho)
end

-- ---------------------------------------------------------------------------------------------------------------
-- Réplica do RotSprite do Aseprite 1.3 (src/doc/algorithm/rotsprite.cpp e rotate.cpp, conferidos no código da
-- v1.3.15), porque em lote (-b) o Rotate com ângulo livre não faz nada: ele precisa do editor (MovingPixelsState).
-- Os três passos dele: Scale2x três vezes repetindo o pixel da borda; o paralelogramo com os cantos truncados para
-- inteiro (o giro em volta do centro da seleção); a volta a 1× pelo scale_image, que anda (8L-1)/(L-1) pixels por
-- pixel com arredondamento (não pega o centro do bloco: é a "distorção" conhecida).

local function rotspriteAseprite(img, angulo)
	local g = L.grade(img)
	local w, h, t = g.w, g.h, g.t
	local function s2x(src, sw, sh)
		local dst, W = {}, 2 * sw
		for y = 0, sh - 1 do
			for x = 0, sw - 1 do
				local i = y * sw + x + 1
				local P = src[i]
				local A = (y > 0) and src[i - sw] or P
				local B = (x < sw - 1) and src[i + 1] or P
				local C = (x > 0) and src[i - 1] or P
				local D = (y < sh - 1) and src[i + sw] or P
				local j = 2 * y * W + 2 * x + 1
				dst[j] = (C == A and C ~= D and A ~= B) and A or P
				dst[j + 1] = (A == B and A ~= C and B ~= D) and B or P
				dst[j + W] = (D == C and D ~= B and C ~= A) and C or P
				dst[j + W + 1] = (B == D and B ~= A and D ~= C) and D or P
			end
		end
		return dst
	end
	local s8, w8, h8 = g.px, w, h
	for _ = 1, 3 do
		s8 = s2x(s8, w8, h8)
		w8, h8 = w8 * 2, h8 * 2
	end
	local rad = math.rad(angulo)
	local c, s = math.cos(rad), math.sin(rad)
	local px, py = w / 2, h / 2
	local function canto(x, y)
		local dx, dy = x - px, y - py
		local fx, fy = px + dx * c - dy * s, py + dx * s + dy * c
		-- int(double) do C++: trunca para o zero.
		local function trunc(v) return v >= 0 and math.floor(v) or -math.floor(-v) end
		return trunc(fx), trunc(fy)
	end
	local x1, y1 = canto(0, 0)
	local x2, y2 = canto(w, 0)
	local x4, y4 = canto(0, h)
	local x3, y3 = canto(w, h)
	local xmin, xmax = math.min(x1, x2, x3, x4), math.max(x1, x2, x3, x4)
	local ymin, ymax = math.min(y1, y2, y3, y4), math.max(y1, y2, y3, y4)
	local rw, rh = xmax - xmin, ymax - ymin
	-- Paralelogramo: ponto = C1 + a*(C2-C1) + b*(C4-C1), com (a, b) em [0,1) levando a (a*w8, b*h8) na imagem 8×.
	local ux, uy = (x2 - x1) * 8, (y2 - y1) * 8
	local vx, vy = (x4 - x1) * 8, (y4 - y1) * 8
	local det = ux * vy - uy * vx
	local W8, H8 = rw * 8, rh * 8
	local big = {}
	for Y = 0, H8 - 1 do
		for X = 0, W8 - 1 do
			local qx, qy = X + 0.5 - (x1 - xmin) * 8, Y + 0.5 - (y1 - ymin) * 8
			local a = (qx * vy - qy * vx) / det
			local b = (ux * qy - uy * qx) / det
			local v = t
			if a >= 0 and a < 1 and b >= 0 and b < 1 then
				v = s8[math.floor(b * h8) * w8 + math.floor(a * w8) + 1]
			end
			big[Y * W8 + X + 1] = v
		end
	end
	local out = Image(rw, rh, img.colorMode)
	local dx = (W8 - 1) / (rw - 1)
	local dy = (H8 - 1) / (rh - 1)
	for v = 0, rh - 1 do
		local sy = math.min(H8 - 1, math.floor(v * dy + 0.5))
		for u = 0, rw - 1 do
			local sx = math.min(W8 - 1, math.floor(u * dx + 0.5))
			local val = big[sy * W8 + sx + 1]
			if val ~= t then out:drawPixel(u, v, val) end
		end
	end
	return out
end

-- ---------------------------------------------------------------------------------------------------------------
-- Limpeza (PLANO_LIMPEZA_LINHAS.md, "Testes")

caso("limpeza: diagonal com doubles sai com 1 px e ligada", function()
	local img = desenho({
		"..........",
		".##.......",
		"..##......",
		"...##.....",
		"....##....",
		".....##...",
		"......##..",
		"..........",
	})
	local antes = L.analisar_imagem(img, {})
	local nova, rel = L.limpar_imagem(img, {})
	local depois = L.analisar_imagem(nova, {})
	num("limpeza.diagonal.doubles_antes", antes.doubles.encontrados)
	num("limpeza.diagonal.doubles_depois", depois.doubles.encontrados)
	confere(antes.doubles.encontrados == 5, "esperava 5 doubles, achou " .. antes.doubles.encontrados)
	confere(depois.doubles.encontrados == 0, "sobrou double")
	confere(rel.componentes_depois == 1, "a linha partiu: " .. rel.componentes_depois .. " pedaços")
	confere(rel.cores_novas == 0, "cor nova")
	-- 1 px: nenhum pixel com vizinho de linha na horizontal e na vertical ao mesmo tempo.
	for y = 0, nova.height - 1 do
		for x = 0, nova.width - 1 do
			if nova:getPixel(x, y) == PRETO then
				local hz = (x > 0 and nova:getPixel(x - 1, y) == PRETO) or (x < nova.width - 1 and nova:getPixel(x + 1, y) == PRETO)
				local vt = (y > 0 and nova:getPixel(x, y - 1) == PRETO) or (y < nova.height - 1 and nova:getPixel(x, y + 1) == PRETO)
				confere(not (hz and vt), string.format("canto em L em (%d,%d)", x, y))
			end
		end
	end
	painel("limpeza_diagonal.png", { img, nova }, 10)
end)

caso("limpeza: escada 3-1-3-2-3 vira regular", function()
	local img = escada({ 3, 1, 3, 2, 3 })
	local rel = L.analisar_imagem(img, { jaggies = "relatar" })
	confere(rel.jaggies.encontrados == 1, "esperava 1 jaggy, achou " .. rel.jaggies.encontrados)
	local j = rel.jaggies.trechos[1]
	num("limpeza.escada.corridas", table.concat(j.corridas, "-"))
	num("limpeza.escada.sugerido", table.concat(j.sugerido, "-"))
	num("limpeza.escada.pontuacao", j.pontuacao)
	local nova, rel2 = L.limpar_imagem(img, { jaggies = "corrigir", png = arquivo("limpeza_escada.png"), png_escala = 12 })
	confere(rel2.jaggies.corrigidos == 1, "não corrigiu: " .. tostring(rel2.jaggies.trechos[1].motivo))
	confere(rel2.depois and rel2.depois.jaggies == 0, "continua jaggy")
	confere(rel2.componentes_depois == 1, "a linha partiu")
	confere(rel2.cores_novas == 0, "cor nova")
	-- O relatório não mexe.
	local _, rel3 = L.limpar_imagem(img, { jaggies = "relatar" })
	confere(rel3.mudados == 0, "o modo relatório mexeu")
	num("limpeza.escada.mudados", rel2.mudados)
end)

caso("limpeza: curva 1-1-2-3-4 não mexe", function()
	local img = escada({ 1, 1, 2, 3, 4 })
	local nova, rel = L.limpar_imagem(img, { jaggies = "corrigir", orfaos = "corrigir" })
	confere(rel.jaggies.encontrados == 0, "achou jaggy numa curva regular")
	confere(rel.mudados == 0, "mexeu " .. rel.mudados .. " pixels")
	confere(iguais(img, nova), "imagem mudou")
end)

caso("limpeza: retas regulares (2-1-2-1, 3-3-2-3-3-2) não mexem", function()
	for _, c in ipairs({ { 2, 1, 2, 1, 2 }, { 3, 3, 2, 3, 3, 2, 3 }, { 4, 4, 4, 4 } }) do
		local _, rel = L.limpar_imagem(escada(c), { jaggies = "corrigir" })
		confere(rel.jaggies.encontrados == 0 and rel.mudados == 0, "mexeu em " .. table.concat(c, "-"))
	end
end)

caso("limpeza: junção em T e cruz não mexem", function()
	local t = desenho({
		"...........",
		".#########.",
		".....#.....",
		".....#.....",
		".....#.....",
		"...........",
	})
	local cruz = desenho({
		".........",
		"....#....",
		"....#....",
		".#######.",
		"....#....",
		"....#....",
		".........",
	})
	local y = desenho({
		"..........",
		".#.....#..",
		"..#...#...",
		"...#.#....",
		"....#.....",
		"....#.....",
		"....#.....",
		"..........",
	})
	for nome, img in pairs({ T = t, cruz = cruz, Y = y }) do
		local _, rel = L.limpar_imagem(img, { jaggies = "corrigir", orfaos = "corrigir" })
		confere(rel.mudados == 0, nome .. ": mexeu " .. rel.mudados .. " pixels")
	end
end)

caso("limpeza: bloco cheio 2×2 e quinas de retângulo não mexem", function()
	local bloco = desenho({
		"........",
		".##.....",
		".##.....",
		"...##...",
		"...##...",
		"........",
	})
	local _, rel = L.limpar_imagem(bloco, { jaggies = "corrigir" })
	confere(rel.mudados == 0, "bloco: mexeu " .. rel.mudados)
	local _, rel2 = L.limpar_imagem(quadradoComContorno(), { jaggies = "corrigir" })
	confere(rel2.mudados == 0, "quadrado: mexeu " .. rel2.mudados)
end)

caso("limpeza: contorno fechado de um círculo continua fechado", function()
	for _, raio in ipairs({ 5, 9, 14 }) do
		local img = circulo(raio)
		-- Um double de propósito em cada círculo (o canto de fora de um degrau).
		local nova, rel = L.limpar_imagem(img, { jaggies = "corrigir", orfaos = "corrigir" })
		confere(rel.cores_novas == 0, "cor nova")
		confere(rel.componentes_depois <= rel.componentes_antes, "o contorno partiu")
		confere(regioes(nova, PRETO) == regioes(img, PRETO), "o contorno abriu (dentro e fora se juntaram)")
		num("limpeza.circulo" .. raio .. ".doubles", rel.doubles.encontrados)
		num("limpeza.circulo" .. raio .. ".jaggies", rel.jaggies.encontrados)
		num("limpeza.circulo" .. raio .. ".mudados", rel.mudados)
		if raio == 9 then painel("limpeza_circulo9.png", { img, nova }, 10) end
	end
end)

caso("limpeza: protegidos ficam", function()
	local img = desenho({
		"........",
		".##.....",
		"..##....",
		"...##...",
		"........",
	})
	local _, livre = L.limpar_imagem(img, {})
	local _, rel = L.limpar_imagem(img, { protegidos = { { 2, 1 }, { 3, 2 }, { 2, 2 }, { 3, 3 } } })
	confere(livre.mudados > 0, "sem proteção devia mexer")
	confere(rel.mudados == 0, "mexeu em pixel protegido")
	local mascara = Image(img.width, img.height, ColorMode.RGB)
	mascara:clear(pc.rgba(255, 255, 255, 255))
	local _, rel2 = L.limpar_imagem(img, { protegidos = mascara })
	confere(rel2.mudados == 0, "máscara não protegeu")
end)

caso("limpeza: órfãos relatados e corrigidos", function()
	local img = desenho({
		".......",
		".ooooo.",
		".oorooo",
		".ooooo.",
		".......",
		"...r...",
		".......",
	})
	local rel = L.analisar_imagem(img, { orfaos = "relatar" })
	confere(rel.orfaos.encontrados == 2, "esperava 2 órfãos, achou " .. rel.orfaos.encontrados)
	local nova, rel2 = L.limpar_imagem(img, { orfaos = "corrigir" })
	confere(rel2.orfaos.corrigidos == 2, "não corrigiu")
	confere(nova:getPixel(3, 2) == CREME, "o órfão de dentro não virou creme")
	confere(pc.rgbaA(nova:getPixel(3, 5)) == 0, "o órfão de fora não virou transparente")
end)

caso("limpeza: cor de linha automática", function()
	local img = quadradoComContorno()
	local rel = L.analisar_imagem(img, { cores_linha = "auto" })
	confere(rel.cores_linha[1] == "#010000", "auto escolheu " .. tostring(rel.cores_linha[1]))
end)

caso("limpeza: sprite indexado, célula deslocada, camada nova e desfazer", function()
	local spr = Sprite(40, 30, ColorMode.INDEXED)
	local pal = Palette(4)
	pal:setColor(0, Color{ r = 0, g = 0, b = 0, a = 0 })
	pal:setColor(1, Color{ r = 1, g = 0, b = 0 })
	pal:setColor(2, Color{ r = 237, g = 218, b = 205 })
	pal:setColor(3, Color{ r = 176, g = 66, b = 87 })
	spr:setPalette(pal)
	local img = Image(10, 8, ColorMode.INDEXED)
	img:clear(0)
	for k = 0, 5 do
		img:drawPixel(1 + k, 1 + k, 1)
		img:drawPixel(2 + k, 1 + k, 1)
	end
	img:drawPixel(8, 1, 3)
	spr:newCel(spr.layers[1], 1, img, Point(17, 9))
	local camadas = #spr.layers
	local rel = L.limpar{ camada = spr.layers[1].name, saida_camada = "limpa", orfaos = "relatar" }
	confere(#spr.layers == camadas + 1, "não criou camada")
	confere(rel.doubles.corrigidos == 5, "doubles: " .. rel.doubles.corrigidos)
	confere(rel.cores_novas == 0, "cor nova")
	confere(rel.doubles.pontos[1][1] >= 17 and rel.doubles.pontos[1][2] >= 9, "pontos sem a posição da célula")
	confere(rel.orfaos.pontos[1][1] == 25 and rel.orfaos.pontos[1][2] == 10, "órfão no lugar errado")
	local nova = spr.layers[#spr.layers]:cel(1)
	confere(nova.position.x == 17 and nova.position.y == 9, "célula nova fora do lugar")
	for p in nova.image:pixels() do
		confere(p() <= 3, "índice novo " .. p())
	end
	app.undo()
	confere(#spr.layers == camadas, "o desfazer não tirou a camada")
	-- Na mesma camada, só dentro da área.
	local rel2 = L.limpar{ camada = spr.layers[1].name, area = { 17, 9, 4, 8 } }
	confere(rel2.doubles.corrigidos > 0 and rel2.doubles.corrigidos < 5, "área ignorada: " .. rel2.doubles.corrigidos)
	spr:close()
end)

-- ---------------------------------------------------------------------------------------------------------------
-- RotSprite (PLANO_ROTSPRITE.md, "Testes")

local vaca = vacaAchatada()
local imagens = { diagonal = linhaDiagonal(), quadrado = quadradoComContorno() }
if vaca then imagens.vaca = vaca else print("AVISO sem a vaca (--script-param vaca=...)") end

caso("rotsprite: 0° e 360° devolvem a imagem idêntica", function()
	for nome, img in pairs(imagens) do
		for _, a in ipairs({ 0, 360, -360, 720 }) do
			local out, info = R.girar_imagem(img, a)
			confere(iguais(out, img), nome .. " a " .. a .. "° mudou")
			confere(info.deslocamento[1] == 0 and info.deslocamento[2] == 0, "deslocou")
		end
	end
end)

caso("rotsprite: 90°, 180°, 270° iguais à rotação exata (e -90 = 270)", function()
	for nome, img in pairs(imagens) do
		for _, a in ipairs({ 90, 180, 270, -90, 450 }) do
			local q = a % 360
			local out = R.girar_imagem(img, a)
			confere(iguais(out, rotacaoExata(img, q)), nome .. " a " .. a .. "°")
		end
	end
end)

caso("rotsprite: espelhos", function()
	local img = imagens.quadrado
	local h = R.girar_imagem(img, 0, { espelho = "h" })
	local v = R.girar_imagem(img, 0, { espelho = "v" })
	for y = 0, img.height - 1 do
		for x = 0, img.width - 1 do
			confere(h:getPixel(x, y) == img:getPixel(img.width - 1 - x, y), "espelho h")
			confere(v:getPixel(x, y) == img:getPixel(x, img.height - 1 - y), "espelho v")
		end
	end
end)

caso("rotsprite: nenhuma cor nova de 0° a 345°, de 15 em 15", function()
	local maxCores = {}
	for nome, img in pairs(imagens) do
		for a = 0, 345, 15 do
			for _, red in ipairs({ "centro", "maioria" }) do
				local out, info = R.girar_imagem(img, a, { reducao = red })
				confere(info.cores_novas == 0, string.format("%s a %d° (%s): %d cores novas", nome, a, red, info.cores_novas))
				confere(info.cores_depois <= info.cores_antes, "mais cores depois")
				confere(L.cores_novas(L.grade(img), L.grade(out)) == 0, "conferência independente achou cor nova")
			end
		end
		maxCores[#maxCores + 1] = nome
	end
	num("rotsprite.cores.angulos", 24)
	num("rotsprite.cores.imagens", table.concat(maxCores, ","))
end)

caso("rotsprite: ida e volta (30° e -30°)", function()
	for nome, img in pairs(imagens) do
		local g = L.grade(img)
		local a, ia = R.girar_grade(g, 30, {})
		local pivo = { g.w / 2 - ia.deslocamento[1], g.h / 2 - ia.deslocamento[2] }
		local b, ib = R.girar_grade(a, -30, { pivo = pivo })
		local dx, dy = ia.deslocamento[1] + ib.deslocamento[1], ia.deslocamento[2] + ib.deslocamento[2]
		local diferentes, opacos = 0, 0
		for y = 0, g.h - 1 do
			for x = 0, g.w - 1 do
				local v = g.px[y * g.w + x + 1]
				local bx, by = x - dx, y - dy
				local u = b.t
				if bx >= 0 and by >= 0 and bx < b.w and by < b.h then u = b.px[by * b.w + bx + 1] end
				if v ~= g.t or u ~= b.t then
					opacos = opacos + 1
					if u ~= v then diferentes = diferentes + 1 end
				end
			end
		end
		local fracao = diferentes / opacos
		num("rotsprite.ida_volta." .. nome .. ".diferentes", diferentes)
		num("rotsprite.ida_volta." .. nome .. ".opacos", opacos)
		num("rotsprite.ida_volta." .. nome .. ".fracao", fracao)
		confere(fracao <= 0.2, string.format("%s perdeu %.1f%%", nome, fracao * 100))
		if nome == "vaca" then
			painel("rotsprite_ida_volta.png", { img, L.imagem_da_grade(a), L.imagem_da_grade(b) }, 8)
		end
	end
end)

caso("rotsprite: a 45°, órfãos e doubles nossos <= os do RotSprite do Aseprite", function()
	for nome, img in pairs(imagens) do
		local nosso = R.girar_imagem(img, 45)
		local cru = R.girar_imagem(img, 45, { limpar = false })
		local maioria = R.girar_imagem(img, 45, { reducao = "maioria" })
		local ase = rotspriteAseprite(img, 45)
		local function medir(rotulo, out)
			local rel = L.analisar_imagem(out, { cores_linha = { "#010000" }, jaggies = "relatar" })
			num("rotsprite.45." .. nome .. "." .. rotulo .. ".orfaos", rel.orfaos.encontrados)
			num("rotsprite.45." .. nome .. "." .. rotulo .. ".doubles", rel.doubles.encontrados)
			num("rotsprite.45." .. nome .. "." .. rotulo .. ".jaggies", rel.jaggies.encontrados)
			num("rotsprite.45." .. nome .. "." .. rotulo .. ".componentes_linha", rel.componentes_antes)
			num("rotsprite.45." .. nome .. "." .. rotulo .. ".cores_novas", L.cores_novas(L.grade(img), L.grade(out)))
			return rel
		end
		local rn = medir("nosso", nosso)
		medir("nosso_sem_limpeza", cru)
		medir("nosso_maioria", maioria)
		local ra = medir("aseprite", ase)
		local orig = L.analisar_imagem(img, { cores_linha = { "#010000" } })
		num("rotsprite.45." .. nome .. ".original.orfaos", orig.orfaos.encontrados)
		num("rotsprite.45." .. nome .. ".original.doubles", orig.doubles.encontrados)
		confere(rn.orfaos.encontrados <= ra.orfaos.encontrados, string.format("%s: órfãos %d > %d", nome, rn.orfaos.encontrados, ra.orfaos.encontrados))
		confere(rn.doubles.encontrados <= ra.doubles.encontrados, string.format("%s: doubles %d > %d", nome, rn.doubles.encontrados, ra.doubles.encontrados))
		painel("rotsprite_45_" .. nome .. ".png", { img, nosso, cru, ase }, 8)
	end
end)

caso("rotsprite: 30° e 45° antes e depois da limpeza de linhas", function()
	if not imagens.vaca then return end
	for _, a in ipairs({ 30, 45 }) do
		local cru = R.girar_imagem(imagens.vaca, a, { limpar = false })
		local limpo, rel = L.limpar_imagem(cru, { cores_linha = { "#010000" }, jaggies = "corrigir", orfaos = "relatar" })
		num("limpeza.rotsprite" .. a .. ".antes.doubles", rel.doubles.encontrados)
		num("limpeza.rotsprite" .. a .. ".antes.jaggies", rel.jaggies.encontrados)
		num("limpeza.rotsprite" .. a .. ".antes.orfaos", rel.orfaos.encontrados)
		num("limpeza.rotsprite" .. a .. ".antes.nota", rel.nota)
		num("limpeza.rotsprite" .. a .. ".jaggies_corrigidos", rel.jaggies.corrigidos)
		if rel.depois then
			num("limpeza.rotsprite" .. a .. ".depois.doubles", rel.depois.doubles)
			num("limpeza.rotsprite" .. a .. ".depois.jaggies", rel.depois.jaggies)
			num("limpeza.rotsprite" .. a .. ".depois.nota", rel.depois.nota)
		end
		confere(rel.cores_novas == 0, "cor nova")
		confere(rel.componentes_depois <= rel.componentes_antes, "a linha partiu")
		painel("limpeza_rotsprite" .. a .. ".png", { cru, limpo }, 8)
	end
end)

caso("limpeza: a vaca (relatório e correção sem abrir buraco)", function()
	if not imagens.vaca then return end
	local img = imagens.vaca
	local rel = L.analisar_imagem(img, { jaggies = "relatar", png = arquivo("limpeza_vaca_relatorio.png"), png_escala = 10 })
	num("limpeza.vaca.total_linha", rel.total_linha)
	num("limpeza.vaca.doubles", rel.doubles.encontrados)
	num("limpeza.vaca.jaggies", rel.jaggies.encontrados)
	num("limpeza.vaca.orfaos", rel.orfaos.encontrados)
	num("limpeza.vaca.orfaos_da_linha", rel.orfaos.da_linha)
	num("limpeza.vaca.componentes", rel.componentes_antes)
	num("limpeza.vaca.nota", rel.nota)
	local nova, rel2 = L.limpar_imagem(img, { jaggies = "corrigir", orfaos = "relatar" })
	num("limpeza.vaca.corrigidos.doubles", rel2.doubles.corrigidos)
	num("limpeza.vaca.corrigidos.jaggies", rel2.jaggies.corrigidos)
	num("limpeza.vaca.mudados", rel2.mudados)
	confere(rel2.cores_novas == 0, "cor nova")
	confere(rel2.componentes_depois <= rel2.componentes_antes, "o contorno partiu: " .. rel2.componentes_antes .. " -> " .. rel2.componentes_depois)
	confere(regioes(nova, PRETO) == regioes(img, PRETO), "o contorno abriu")
	painel("limpeza_vaca.png", { img, nova }, 10)
	-- Camada a camada, no arquivo (cópia), com as células nas posições delas.
	local spr = app.open(VACA)
	local partidas = 0
	for _, camada in ipairs(spr.layers) do
		if camada:cel(1) then
			local r = L.limpar{ camada = camada.name, jaggies = "corrigir" }
			if r.componentes_depois > r.componentes_antes then partidas = partidas + 1 end
			confere(r.cores_novas == 0, camada.name .. ": cor nova")
		end
	end
	confere(partidas == 0, partidas .. " camadas com contorno partido")
	spr:close()
end)

caso("rotsprite: sprite RGB e indexado, célula deslocada, camada nova e desfazer", function()
	for _, modo in ipairs({ ColorMode.RGB, ColorMode.INDEXED }) do
		local spr = Sprite(64, 64, modo)
		local img
		if modo == ColorMode.INDEXED then
			local pal = Palette(4)
			pal:setColor(0, Color{ r = 0, g = 0, b = 0, a = 0 })
			pal:setColor(1, Color{ r = 1, g = 0, b = 0 })
			pal:setColor(2, Color{ r = 237, g = 218, b = 205 })
			pal:setColor(3, Color{ r = 176, g = 66, b = 87 })
			spr:setPalette(pal)
			img = Image(9, 6, ColorMode.INDEXED)
			img:clear(0)
			for y = 0, 5 do
				for x = 0, 8 do
					local borda = x == 0 or y == 0 or x == 8 or y == 5
					img:drawPixel(x, y, borda and 1 or ((x == 2 and y == 2) and 3 or 2))
				end
			end
		else
			img = quadradoComContorno()
		end
		spr:newCel(spr.layers[1], 1, img, Point(20, 13))
		local camadas = #spr.layers
		-- 90°: exato; a célula gira em volta do centro dela.
		local info = R.girar{ camada = spr.layers[1].name, angulo = 90 }
		confere(#spr.layers == camadas + 1, "não criou camada")
		local nova = spr.layers[#spr.layers]:cel(1)
		confere(iguais(nova.image, rotacaoExata(img, 90)), "90° na camada")
		local cx0, cy0 = 20 + img.width / 2, 13 + img.height / 2
		local cx1, cy1 = nova.position.x + nova.image.width / 2, nova.position.y + nova.image.height / 2
		confere(math.abs(cx0 - cx1) <= 0.5 and math.abs(cy0 - cy1) <= 0.5, string.format("centro andou: (%g,%g) -> (%g,%g)", cx0, cy0, cx1, cy1))
		app.undo()
		confere(#spr.layers == camadas, "o desfazer não tirou a camada")
		-- 37°, pivô no pé, maioria.
		local info2 = R.girar{ camada = spr.layers[1].name, angulo = 37, pivo = "pe", reducao = "maioria", saida_camada = "girada" }
		confere(info2.cores_novas == 0, "cor nova a 37°")
		local cel2 = spr.layers[#spr.layers]:cel(1)
		confere(spr.layers[#spr.layers].name == "girada", "nome da camada")
		local maxIndice = 0
		for p in cel2.image:pixels() do
			if modo == ColorMode.INDEXED and p() > maxIndice then maxIndice = p() end
		end
		confere(maxIndice <= 3, "índice novo")
		num("rotsprite.sprite." .. (modo == ColorMode.INDEXED and "indexado" or "rgb") .. ".37.tamanho", cel2.image.width .. "x" .. cel2.image.height)
		spr:close()
	end
end)

caso("rotsprite: folha com 8 passos e recortar", function()
	local spr = Sprite(32, 32, ColorMode.RGB)
	spr:newCel(spr.layers[1], 1, quadradoComContorno(), Point(10, 11))
	local res = R.folha{ passos = 8, novo_sprite = true, png = arquivo("rotsprite_folha_quadrado.png"), png_escala = 6 }
	confere(#res.angulos == 8, "ângulos")
	confere(res.largura == res.celula[1] * 8, "largura da tira")
	confere(res.sprite and res.sprite.width == res.largura, "sprite novo")
	for _, info in ipairs(res.infos) do confere(info.cores_novas == 0, "cor nova") end
	res.sprite:close()
	local _, info = R.girar_imagem(quadradoComContorno(), 30, { recortar = true })
	confere(info.largura == 12 and info.altura == 10, "recortar mudou o tamanho")
	spr:close()
	if vaca then
		local s = Sprite(vaca.width, vaca.height, ColorMode.RGB)
		s.cels[1].image = vaca
		R.folha{ passos = 8, novo_sprite = false, png = arquivo("rotsprite_folha_vaca.png"), png_escala = 4 }
		s:close()
	end
end)

caso("rotsprite: tolerância não cria cor", function()
	local img = quadradoComContorno()
	-- Ruído: um creme quase igual em metade dos pixels de dentro.
	local quase = pc.rgba(236, 218, 206, 255)
	for y = 2, 7 do
		for x = 2, 9 do
			if (x + y) % 2 == 0 and img:getPixel(x, y) == CREME then img:drawPixel(x, y, quase) end
		end
	end
	local out, info = R.girar_imagem(img, 30, { tolerancia = 0.02 })
	confere(info.cores_novas == 0, "cor nova com tolerância")
end)

caso("rotsprite: tempo", function()
	if not vaca then return end
	local t0 = os.clock()
	R.girar_imagem(vaca, 33)
	num("rotsprite.tempo.vaca_33_s", os.clock() - t0)
end)

caso("extensão Diorama: registra os itens do menu e carrega os módulos", function()
	-- O diorama.lua por dofile, com um plugin de mentira (o modo -b não carrega extensões nem tem diálogos).
	local repo = app.fs.normalizePath(app.fs.joinPath(PASTA, "..", ".."))
	local ext = app.fs.joinPath(repo, "aseprite", "diorama", "diorama.lua")
	local M = dofile(ext)
	local comandos = {}
	local plugin = {
		preferences = { raiz = repo, conectar = false },
		path = app.fs.joinPath(repo, "aseprite", "diorama"), -- sem pixel/ ali: cai no repositório
		newMenuGroup = function() end,
		newMenuSeparator = function() end,
		newCommand = function(_, c) comandos[c.title] = c end,
	}
	init(plugin)
	confere(M.VERSAO == "0.5.0", "versão " .. tostring(M.VERSAO))
	confere(comandos["Girar (RotSprite)…"] ~= nil, "falta o item Girar (RotSprite)…")
	confere(comandos["Limpar doubles e jaggies…"] ~= nil, "falta o item Limpar doubles e jaggies…")
	local Rm, Lm = M.pixel("rotsprite"), M.pixel("limpeza")
	confere(type(Rm.girar) == "function" and type(Lm.limpar) == "function", "módulos")
	exit(plugin)
	-- Sem sprite aberto, os itens ficam desligados.
	confere(app.sprite == nil or comandos["Girar (RotSprite)…"].onenabled() == true, "onenabled")
end)

print(string.format("RESUMO ok=%d falhas=%d", oks, falhas))
