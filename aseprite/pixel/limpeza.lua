-- Removedor de doubles, jaggies e pixels órfãos para pixel art, dentro do Aseprite (2026-10-22).
--
-- Plano, definições e números dos testes: docs/arte/PLANO_LIMPEZA_LINHAS.md. Testes: aseprite/pixel/testes.lua
-- (npm run teste:pixel). Usado pelo RotSprite (aseprite/pixel/rotsprite.lua) na limpeza depois do giro e pelo menu
-- Arquivo > Diorama > "Limpar doubles e jaggies…" da extensão (aseprite/diorama/diorama.lua).
--
--   local L = dofile([[C:\Users\Szortek\Documents\Haywood-Valley\aseprite\pixel\limpeza.lua]])
--   L.analisar_imagem(img, opcoes) -> relatorio          -- puro: não muda a imagem
--   L.limpar_imagem(img, opcoes) -> Image, relatorio      -- puro: devolve uma imagem nova
--   L.limpar{ arquivo?, camada?, quadro?, cores_linha?, area?, doubles?, jaggies?, orfaos?, protegidos?,
--             saida_camada?, png?, png_escala?, salvar? } -> relatorio
--
-- Nunca cria cor: todo pixel trocado recebe a cor de um vizinho. Nada aqui pede permissão ao Aseprite (só lê e
-- grava imagens pela API dele), então o arquivo pode ser carregado por dofile de qualquer script ou extensão.

local L = { VERSAO = "1.0.0" }

local pc = app.pixelColor

-- Vizinhança em volta de um pixel, no sentido do relógio a partir do norte (a ordem do anel importa só para o
-- número de conexões).
local ANEL = { { 0, -1 }, { 1, -1 }, { 1, 0 }, { 1, 1 }, { 0, 1 }, { -1, 1 }, { -1, 0 }, { -1, -1 } }
local ORTO = { { 0, -1 }, { 1, 0 }, { 0, 1 }, { -1, 0 } }

-- Pares de posições do anel que se tocam (8 direções), para contar os pedaços de linha em volta de um pixel.
local ADJ_ANEL = {}
for a = 1, 8 do
	ADJ_ANEL[a] = {}
	for b = 1, 8 do
		if a ~= b and math.max(math.abs(ANEL[a][1] - ANEL[b][1]), math.abs(ANEL[a][2] - ANEL[b][2])) == 1 then
			table.insert(ADJ_ANEL[a], b)
		end
	end
end

-- ---------------------------------------------------------------------------------------------------------------
-- Grade: os pixels de uma Image numa lista (índice y*w + x + 1), com a transparência normalizada (todo pixel de
-- alfa 0 vira o mesmo valor `t`: 0 em RGB e cinza, o índice transparente em indexado).

local function grade(img, transparente)
	local w, h, modo = img.width, img.height, img.colorMode
	local t = transparente
	if t == nil then
		t = (modo == ColorMode.INDEXED) and img.spec.transparentColor or 0
	end
	local px, i = {}, 1
	for y = 0, h - 1 do
		for x = 0, w - 1 do
			local v = img:getPixel(x, y)
			if modo == ColorMode.RGB then
				if pc.rgbaA(v) == 0 then v = t end
			elseif modo == ColorMode.GRAY then
				if pc.grayaA(v) == 0 then v = t end
			end
			px[i] = v
			i = i + 1
		end
	end
	return { w = w, h = h, px = px, modo = modo, t = t }
end
L.grade = grade

local function copiarGrade(g)
	local px = {}
	for i = 1, g.w * g.h do
		px[i] = g.px[i]
	end
	return { w = g.w, h = g.h, px = px, modo = g.modo, t = g.t }
end
L.copiar_grade = copiarGrade

local function imagemDaGrade(g)
	local img = Image(g.w, g.h, g.modo)
	if g.modo == ColorMode.INDEXED then
		img:clear(g.t)
	end
	local i = 1
	for y = 0, g.h - 1 do
		for x = 0, g.w - 1 do
			img:drawPixel(x, y, g.px[i])
			i = i + 1
		end
	end
	return img
end
L.imagem_da_grade = imagemDaGrade

local function valor(g, x, y)
	if x < 0 or y < 0 or x >= g.w or y >= g.h then
		return g.t
	end
	return g.px[y * g.w + x + 1]
end

local function contarCores(g)
	local vistas, n = {}, 0
	for i = 1, g.w * g.h do
		local v = g.px[i]
		if v ~= g.t and not vistas[v] then
			vistas[v] = true
			n = n + 1
		end
	end
	return n, vistas
end
L.contar_cores = contarCores

--- Cores (opacas) que estão em `depois` e não estavam em `antes`.
function L.cores_novas(antes, depois)
	local _, va = contarCores(antes)
	local _, vd = contarCores(depois)
	local n = 0
	for v in pairs(vd) do
		if not va[v] then n = n + 1 end
	end
	return n
end

-- ---------------------------------------------------------------------------------------------------------------
-- Cores: texto #RRGGBB, valores do pixel e brilho.

local function rgbaDe(g, v, paleta)
	if v == g.t then
		return 0, 0, 0, 0
	end
	if g.modo == ColorMode.RGB then
		return pc.rgbaR(v), pc.rgbaG(v), pc.rgbaB(v), pc.rgbaA(v)
	elseif g.modo == ColorMode.GRAY then
		local c = pc.grayaV(v)
		return c, c, c, pc.grayaA(v)
	end
	if paleta and v < #paleta then
		local c = paleta:getColor(v)
		return c.red, c.green, c.blue, c.alpha
	end
	return v, v, v, 255
end

local function hexDe(g, v, paleta)
	local r, gg, b = rgbaDe(g, v, paleta)
	return string.format("#%02X%02X%02X", r, gg, b)
end

local function lerHex(texto)
	local h = tostring(texto):gsub("^#", "")
	if #h ~= 6 and #h ~= 8 then
		error("cor inválida: " .. tostring(texto), 0)
	end
	local function canal(i)
		local n = tonumber(h:sub(i, i + 1), 16)
		if n == nil then error("cor inválida: " .. tostring(texto), 0) end
		return n
	end
	return canal(1), canal(3), canal(5), (#h == 8) and canal(7) or 255
end

local function brilho(r, g, b)
	return 0.2126 * r + 0.7152 * g + 0.0722 * b
end

--- Um pixel faz parte de um bloco 2×2 da mesma cor?
local function emBloco(g, x, y, igual)
	for _, d in ipairs({ { -1, -1 }, { 0, -1 }, { -1, 0 }, { 0, 0 } }) do
		local x0, y0 = x + d[1], y + d[2]
		if igual(x0, y0) and igual(x0 + 1, y0) and igual(x0, y0 + 1) and igual(x0 + 1, y0 + 1) then
			return true
		end
	end
	return false
end

--- A cor de linha automática: a mais escura entre as que formam traços de 1 px (pelo menos 8 pixels, e 60% deles
--- fora de blocos 2×2 da mesma cor). Sem nenhuma assim, nil.
local function corLinhaAuto(g, paleta)
	local cont = {}
	for i = 1, g.w * g.h do
		local v = g.px[i]
		if v ~= g.t then cont[v] = (cont[v] or 0) + 1 end
	end
	local melhor, melhorBrilho = nil, math.huge
	for v, n in pairs(cont) do
		if n >= 8 then
			local finos = 0
			local function igual(x, y) return valor(g, x, y) == v end
			for y = 0, g.h - 1 do
				for x = 0, g.w - 1 do
					if g.px[y * g.w + x + 1] == v and not emBloco(g, x, y, igual) then
						finos = finos + 1
					end
				end
			end
			local r, gg, b, a = rgbaDe(g, v, paleta)
			local br = brilho(r, gg, b)
			if a > 0 and finos >= 0.6 * n and br < melhorBrilho then
				melhor, melhorBrilho = v, br
			end
		end
	end
	return melhor
end

--- `cores_linha` ({"#010000"}, "auto", ou valores já no formato do pixel) -> conjunto de valores do pixel.
local function resolverLinhas(g, cores, paleta)
	local set, lista = {}, {}
	if cores == nil then cores = { "#010000" } end
	if cores == "auto" then
		local v = corLinhaAuto(g, paleta)
		if v ~= nil then
			set[v] = true
			lista[1] = hexDe(g, v, paleta)
		end
		return set, lista
	end
	if type(cores) == "string" then cores = { cores } end
	for _, c in ipairs(cores) do
		if type(c) == "number" then
			set[c] = true
			lista[#lista + 1] = hexDe(g, c, paleta)
		else
			local r, gg, b, a = lerHex(c)
			if g.modo == ColorMode.RGB then
				set[pc.rgba(r, gg, b, a)] = true
			elseif g.modo == ColorMode.GRAY then
				set[pc.graya(math.floor(brilho(r, gg, b) + 0.5), a)] = true
			elseif paleta then
				for i = 0, #paleta - 1 do
					local p = paleta:getColor(i)
					if i ~= g.t and p.red == r and p.green == gg and p.blue == b then
						set[i] = true
					end
				end
			end
			lista[#lista + 1] = string.format("#%02X%02X%02X", r, gg, b)
		end
	end
	return set, lista
end
L.resolver_linhas = resolverLinhas

-- ---------------------------------------------------------------------------------------------------------------
-- Opções comuns: área (só mexe e só relata dentro dela), pontos protegidos e a origem das coordenadas relatadas.

local function lerRetangulo(a)
	if a == nil then return nil end
	if type(a) == "userdata" then
		return { x = a.x, y = a.y, w = a.width, h = a.height }
	end
	return { x = a.x or a[1], y = a.y or a[2], w = a.w or a.width or a[3], h = a.h or a.height or a[4] }
end

local function preparar(g, opcoes)
	local o = opcoes or {}
	local origem = o.origem or { 0, 0 }
	local ox, oy = origem.x or origem[1] or 0, origem.y or origem[2] or 0
	local area = lerRetangulo(o.area)
	local dentro
	if area then
		local x0, y0, x1, y1 = area.x - ox, area.y - oy, area.x - ox + area.w, area.y - oy + area.h
		dentro = function(x, y) return x >= x0 and y >= y0 and x < x1 and y < y1 end
	else
		dentro = function() return true end
	end
	local p = o.protegidos
	local protegido
	if p == nil then
		protegido = function() return false end
	elseif type(p) == "function" then
		protegido = function(x, y) return p(x + ox, y + oy) end
	elseif type(p) == "userdata" then
		-- Máscara: Image do mesmo tamanho, pixel não transparente = protegido.
		local m = grade(p)
		protegido = function(x, y) return valor(m, x, y) ~= m.t end
	else
		local set = {}
		for _, pt in ipairs(p) do
			local x, y = (pt.x or pt[1]) - ox, (pt.y or pt[2]) - oy
			set[y * g.w + x + 1] = true
		end
		protegido = function(x, y) return set[y * g.w + x + 1] == true end
	end
	return {
		ox = ox,
		oy = oy,
		dentro = dentro,
		protegido = protegido,
		mexivel = function(x, y) return dentro(x, y) and not protegido(x, y) end,
		paleta = o.paleta,
	}
end

local function ponto(ctx, x, y)
	return { x + ctx.ox, y + ctx.oy }
end

-- ---------------------------------------------------------------------------------------------------------------
-- Componentes ligados (8 direções) da cor de linha.

local function contarComponentes(g, linhas)
	local visto, n = {}, 0
	local w, h = g.w, g.h
	for i = 1, w * h do
		if linhas[g.px[i]] and not visto[i] then
			n = n + 1
			local pilha = { i }
			visto[i] = true
			while #pilha > 0 do
				local j = table.remove(pilha)
				local x, y = (j - 1) % w, (j - 1) // w
				for _, d in ipairs(ANEL) do
					local nx, ny = x + d[1], y + d[2]
					if nx >= 0 and ny >= 0 and nx < w and ny < h then
						local k = ny * w + nx + 1
						if not visto[k] and linhas[g.px[k]] then
							visto[k] = true
							pilha[#pilha + 1] = k
						end
					end
				end
			end
		end
	end
	return n
end
L.contar_componentes = contarComponentes

local function contarLinha(g, linhas)
	local n = 0
	for i = 1, g.w * g.h do
		if linhas[g.px[i]] then n = n + 1 end
	end
	return n
end

-- ---------------------------------------------------------------------------------------------------------------
-- Doubles (plano, "Algoritmo > Doubles")

--- Quantos pedaços de linha ficam em volta de (x, y) se ele sair (o número de conexões do afinamento de Zhang-Suen,
--- em 8 direções).
local function conexoes(ehL, x, y)
	local liga, n = {}, 0
	for k = 1, 8 do
		liga[k] = ehL(x + ANEL[k][1], y + ANEL[k][2])
	end
	local visto = {}
	for k = 1, 8 do
		if liga[k] and not visto[k] then
			n = n + 1
			local pilha = { k }
			visto[k] = true
			while #pilha > 0 do
				local a = table.remove(pilha)
				for _, b in ipairs(ADJ_ANEL[a]) do
					if liga[b] and not visto[b] then
						visto[b] = true
						pilha[#pilha + 1] = b
					end
				end
			end
		end
	end
	return n
end

--- Se (x, y) é double, devolve a cor que ele deve receber; senão, nil.
local function testarDouble(g, ehL, x, y)
	local l, r, u, d = ehL(x - 1, y), ehL(x + 1, y), ehL(x, y - 1), ehL(x, y + 1)
	if (l and r) or (u and d) or not (l or r) or not (u or d) then
		return nil
	end
	local ax = l and -1 or 1
	local by = u and -1 or 1
	-- A, B e o canto entre eles também de linha: bloco 2×2 (área cheia), fica.
	if ehL(x + ax, y + by) then
		return nil
	end
	-- Junção (tirar P parte a linha em dois ou mais pedaços).
	if conexoes(ehL, x, y) ~= 1 then
		return nil
	end
	-- Canto reto (o plano não previa; ver "O que mudou na implementação"): os dois braços seguem retos por mais um
	-- pixel além de A e de B. É a quina de um retângulo, não um degrau.
	if ehL(x + 2 * ax, y) and ehL(x, y + 2 * by) then
		return nil
	end
	-- A cor do lado de fora do "L": os dois vizinhos em 4 direções que não são linha (peso 2) e a diagonal entre eles
	-- (peso 1). Fora da imagem conta como transparente.
	local votos, ordem = {}, {}
	local function votar(v, peso)
		if votos[v] == nil then
			votos[v] = 0
			ordem[#ordem + 1] = v
		end
		votos[v] = votos[v] + peso
	end
	votar(valor(g, x - ax, y), 2)
	votar(valor(g, x, y - by), 2)
	if not ehL(x - ax, y - by) then
		votar(valor(g, x - ax, y - by), 1)
	end
	local melhor, mv = nil, -1
	for _, v in ipairs(ordem) do
		if votos[v] > mv then
			melhor, mv = v, votos[v]
		end
	end
	return melhor
end

--- Tira os doubles de `g` (no lugar), em até 3 passadas. Devolve a lista de pontos tirados (coordenadas da grade).
local function removerDoubles(g, linhas, ctx, passadas)
	local w, h = g.w, g.h
	local function ehL(x, y)
		if x < 0 or y < 0 or x >= w or y >= h then return false end
		return linhas[g.px[y * w + x + 1]] == true
	end
	local tirados = {}
	for _ = 1, passadas or 3 do
		local n = 0
		for y = 0, h - 1 do
			for x = 0, w - 1 do
				local i = y * w + x + 1
				if linhas[g.px[i]] and ctx.mexivel(x, y) then
					local nova = testarDouble(g, ehL, x, y)
					if nova ~= nil then
						g.px[i] = nova
						tirados[#tirados + 1] = { x, y }
						n = n + 1
					end
				end
			end
		end
		if n == 0 then break end
	end
	return tirados
end
L.remover_doubles = removerDoubles

-- ---------------------------------------------------------------------------------------------------------------
-- Órfãos (plano, "Pixels órfãos")

--- Pixels cuja cor não aparece em nenhum dos 8 vizinhos (fora da imagem conta como transparente). Devolve a lista
--- { {x, y, cor_nova} } com a cor da maioria dos vizinhos (desempate: a que mais aparece nos 4 de lado).
local function acharOrfaos(g, ctx, legitimo)
	local achados = {}
	for y = 0, g.h - 1 do
		for x = 0, g.w - 1 do
			local v = g.px[y * g.w + x + 1]
			if ctx.dentro(x, y) then
				local sozinho = true
				for _, d in ipairs(ANEL) do
					if valor(g, x + d[1], y + d[2]) == v then
						sozinho = false
						break
					end
				end
				if sozinho and not (legitimo and legitimo(x, y, v)) then
					local cont, orto, ordem = {}, {}, {}
					for k, d in ipairs(ANEL) do
						local c = valor(g, x + d[1], y + d[2])
						if cont[c] == nil then
							cont[c], orto[c] = 0, 0
							ordem[#ordem + 1] = c
						end
						cont[c] = cont[c] + 1
						if k % 2 == 1 then orto[c] = orto[c] + 1 end
					end
					local melhor = ordem[1]
					for _, c in ipairs(ordem) do
						if cont[c] > cont[melhor] or (cont[c] == cont[melhor] and orto[c] > orto[melhor]) then
							melhor = c
						end
					end
					achados[#achados + 1] = { x, y, melhor }
				end
			end
		end
	end
	return achados
end
L.achar_orfaos = acharOrfaos

-- ---------------------------------------------------------------------------------------------------------------
-- Jaggies (plano, "Algoritmo > Jaggies")
--
-- A linha é seguida pelos pixels "finos" da cor de linha (fora de bloco 2×2), com a vizinhança mista (m-adjacência):
-- a diagonal só liga dois pixels se nenhum vizinho de lado comum aos dois for linha. Assim um "L" não vira triângulo
-- e cada pixel do meio de um traço tem exatamente dois vizinhos. Pontas (1 vizinho) e junções (3 ou mais) fecham a
-- cadeia; o que sobra sem ponta é contorno fechado.

local function sinal(v)
	return v > 0 and 1 or (v < 0 and -1 or 0)
end

local function arred(v)
	-- Arredonda metade para longe do zero (simétrico para os dois lados).
	if v >= 0 then return math.floor(v + 0.5) end
	return -math.floor(-v + 0.5)
end

--- Palavra equilibrada (as contagens de D em quaisquer duas janelas do mesmo tamanho diferem no máximo em 1) é
--- exatamente a palavra de um segmento de reta digital: o "reto regular".
local function equilibrada(palavra)
	local n = #palavra
	local acum = { [0] = 0 }
	for i = 1, n do
		acum[i] = acum[i - 1] + palavra[i]
	end
	for len = 1, n - 1 do
		local mn, mx = math.huge, -math.huge
		for i = 0, n - len do
			local c = acum[i + len] - acum[i]
			if c < mn then mn = c end
			if c > mx then mx = c end
		end
		if mx - mn > 1 then return false end
	end
	return true
end

local function palavraDasCorridas(corridas)
	local p = {}
	for k, r in ipairs(corridas) do
		for _ = 1, r - 1 do p[#p + 1] = 0 end
		if k < #corridas then p[#p + 1] = 1 end
	end
	return p
end

local function monotona(corridas)
	local sobe, desce = true, true
	for k = 2, #corridas do
		if corridas[k] < corridas[k - 1] then sobe = false end
		if corridas[k] > corridas[k - 1] then desce = false end
	end
	return sobe or desce
end

--- O eixo menor (f) a partir de f0, com as corridas dadas e o degrau `passo` (+1 ou -1).
local function fDasCorridas(corridas, f0, passo)
	local f, v = {}, f0
	for k, r in ipairs(corridas) do
		for _ = 1, r do f[#f + 1] = v end
		if k < #corridas then v = v + passo end
	end
	return f
end

local function desvio(f, s)
	local soma, mx = 0, 0
	for t = 1, #f do
		local d = math.abs(f[t] - s[t])
		soma = soma + d
		if d > mx then mx = d end
	end
	return soma, mx
end

local function corridasDeF(f)
	local c, r = {}, 1
	for t = 2, #f do
		if f[t] == f[t - 1] then r = r + 1 else c[#c + 1] = r r = 1 end
	end
	c[#c + 1] = r
	return c
end

--- Segue as linhas finas de `g` e devolve as cadeias { pts = {{x,y}...}, livreIni, livreFim, fechada }.
local function cadeias(g, linhas)
	local w, h = g.w, g.h
	local function ehL(x, y)
		if x < 0 or y < 0 or x >= w or y >= h then return false end
		return linhas[g.px[y * w + x + 1]] == true
	end
	local fino = {}
	for y = 0, h - 1 do
		for x = 0, w - 1 do
			if ehL(x, y) and not emBloco(g, x, y, ehL) then
				fino[y * w + x + 1] = true
			end
		end
	end
	local function ehF(x, y)
		return x >= 0 and y >= 0 and x < w and y < h and fino[y * w + x + 1] == true
	end
	local function vizinhos(x, y)
		local v = {}
		for _, d in ipairs(ORTO) do
			if ehF(x + d[1], y + d[2]) then v[#v + 1] = { x + d[1], y + d[2] } end
		end
		for _, d in ipairs({ { 1, -1 }, { 1, 1 }, { -1, 1 }, { -1, -1 } }) do
			if ehF(x + d[1], y + d[2]) and not ehF(x + d[1], y) and not ehF(x, y + d[2]) then
				v[#v + 1] = { x + d[1], y + d[2] }
			end
		end
		return v
	end
	-- Ponta livre: um vizinho só e nenhum pixel de linha grossa encostado.
	local function livre(x, y, grau)
		if grau ~= 1 then return false end
		for _, d in ipairs(ANEL) do
			if ehL(x + d[1], y + d[2]) and not ehF(x + d[1], y + d[2]) then return false end
		end
		return true
	end
	local viz, grau = {}, {}
	for i in pairs(fino) do
		local x, y = (i - 1) % w, (i - 1) // w
		viz[i] = vizinhos(x, y)
		grau[i] = #viz[i]
	end
	local function idx(p) return p[2] * w + p[1] + 1 end
	local arestas, usado, saida = {}, {}, {}
	local function chave(a, b)
		if a > b then a, b = b, a end
		return a * (w * h + 1) + b
	end
	local function seguir(ini, prox)
		local pts = { { (ini - 1) % w, (ini - 1) // w } }
		local ant, cur = ini, prox
		arestas[chave(ini, prox)] = true
		usado[ini] = true
		while true do
			pts[#pts + 1] = { (cur - 1) % w, (cur - 1) // w }
			usado[cur] = true
			if grau[cur] ~= 2 or cur == ini then break end
			local seguinte = nil
			for _, q in ipairs(viz[cur]) do
				local j = idx(q)
				if j ~= ant and not arestas[chave(cur, j)] then
					seguinte = j
					break
				end
			end
			if seguinte == nil then break end
			arestas[chave(cur, seguinte)] = true
			ant, cur = cur, seguinte
		end
		return pts, cur
	end
	-- Ordem fixa (linha a linha) para o resultado não depender da ordem do pairs.
	local ordem = {}
	for i in pairs(fino) do ordem[#ordem + 1] = i end
	table.sort(ordem)
	for _, i in ipairs(ordem) do
		if grau[i] ~= 2 then
			for _, q in ipairs(viz[i]) do
				local j = idx(q)
				if not arestas[chave(i, j)] then
					local pts, fim = seguir(i, j)
					local x0, y0 = (i - 1) % w, (i - 1) // w
					local x1, y1 = (fim - 1) % w, (fim - 1) // w
					saida[#saida + 1] = { pts = pts, livreIni = livre(x0, y0, grau[i]), livreFim = livre(x1, y1, grau[fim]) }
				end
			end
		end
	end
	for _, i in ipairs(ordem) do
		if grau[i] == 2 and not usado[i] then
			local pts = seguir(i, idx(viz[i][1]))
			saida[#saida + 1] = { pts = pts, livreIni = false, livreFim = false, fechada = true }
		end
	end
	return saida, ehL
end

--- Quebra uma cadeia em trechos de direção parecida: cada trecho usa só um passo de lado O e uma diagonal D vizinha
--- dele (E e NE, por exemplo). Devolve { ini, fim, O, D, livreIni, livreFim } (índices em pts).
local function trechos(c)
	local pts = c.pts
	local saida = {}
	local ini, O, D = 1, nil, nil
	local function cabe(dx, dy)
		local orto = (dx == 0 or dy == 0)
		if orto then
			if O then return O[1] == dx and O[2] == dy end
			if D == nil or (dx ~= 0 and D[1] == dx) or (dy ~= 0 and D[2] == dy) then
				O = { dx, dy }
				return true
			end
			return false
		end
		if D then return D[1] == dx and D[2] == dy end
		if O == nil or (O[1] ~= 0 and O[1] == dx) or (O[2] ~= 0 and O[2] == dy) then
			D = { dx, dy }
			return true
		end
		return false
	end
	local ultimoO = nil -- índice do último passo de lado do trecho atual
	for k = 1, #pts - 1 do
		local dx, dy = pts[k + 1][1] - pts[k][1], pts[k + 1][2] - pts[k][2]
		if not cabe(dx, dy) then
			saida[#saida + 1] = { ini = ini, fim = k, O = O, D = D }
			-- Quando o traço vira de E+NE para NE+N (a mesma diagonal), os passos diagonais do fim do trecho servem aos
			-- dois: o trecho novo começa logo depois do último passo de lado. Assim a divisão não depende do sentido em
			-- que a linha foi seguida.
			local mesmaD = D and ultimoO and (dx == 0 or dy == 0) and ((dx ~= 0 and D[1] == dx) or (dy ~= 0 and D[2] == dy))
			if mesmaD then
				ini, O = ultimoO + 1, nil
			else
				ini, O, D = k, nil, nil
			end
			ultimoO = nil
			cabe(dx, dy)
		end
		if dx == 0 or dy == 0 then ultimoO = k end
	end
	saida[#saida + 1] = { ini = ini, fim = #pts, O = O, D = D }
	for k, t in ipairs(saida) do
		t.livreIni = (k == 1) and c.livreIni
		t.livreFim = (k == #saida) and c.livreFim
	end
	return saida
end

--- Analisa um trecho: corridas, tipo, padrão sugerido e o desvio. Devolve nil se o trecho é curto demais ou é só
--- diagonal ou só reto.
local function analisarTrecho(c, t)
	if t.O == nil or t.D == nil then return nil end
	local pts = c.pts
	local maiorX = t.O[1] ~= 0
	-- Corridas: grupos de pixels separados pelos passos diagonais.
	local corridas, inicio = {}, { t.ini }
	local r = 1
	for k = t.ini, t.fim - 1 do
		local dx, dy = pts[k + 1][1] - pts[k][1], pts[k + 1][2] - pts[k][2]
		if dx == t.O[1] and dy == t.O[2] then
			r = r + 1
		else
			corridas[#corridas + 1] = r
			inicio[#inicio + 1] = k + 1
			r = 1
		end
	end
	corridas[#corridas + 1] = r
	-- As corridas das pontas que não são ponta livre da linha estão cortadas (seguem no trecho vizinho ou somem numa
	-- junção): ficam de fora da conta e não se mexem.
	local a, b = 1, #corridas
	if not t.livreIni then a = a + 1 end
	if not t.livreFim then b = b - 1 end
	if b - a + 1 < 3 then return nil end
	local nucleo = {}
	for k = a, b do nucleo[#nucleo + 1] = corridas[k] end
	local kIni = inicio[a]
	local kFim = (b < #corridas) and (inicio[b + 1] - 1) or t.fim
	local tipo
	if equilibrada(palavraDasCorridas(nucleo)) then
		tipo = "reto"
	elseif monotona(nucleo) then
		tipo = "curva"
	else
		tipo = "jaggy"
	end
	local res = { ini = kIni, fim = kFim, corridas = nucleo, tipo = tipo, maiorX = maiorX }
	if tipo ~= "jaggy" then return res end
	-- Eixo menor como função do maior.
	local f = {}
	for k = kIni, kFim do
		f[#f + 1] = maiorX and pts[k][2] or pts[k][1]
	end
	local n = #f
	local passo = maiorX and t.D[2] or t.D[1]
	-- Reto: a reta digital entre as duas pontas (as pontas não mudam).
	local reto = {}
	for k = 1, n do
		reto[k] = f[1] + arred((k - 1) * (f[n] - f[1]) / (n - 1))
	end
	local sReto, mReto = desvio(f, reto)
	-- Curva: as mesmas corridas em ordem crescente ou decrescente.
	local cres, decr = {}, {}
	for k, v in ipairs(nucleo) do cres[k], decr[k] = v, v end
	table.sort(cres)
	table.sort(decr, function(x, y) return x > y end)
	local fc, fd = fDasCorridas(cres, f[1], passo), fDasCorridas(decr, f[1], passo)
	local sc, mc = desvio(f, fc)
	local sd, md = desvio(f, fd)
	local s, m, sug, padrao = sReto, mReto, reto, "reto"
	if sc < s then s, m, sug, padrao = sc, mc, fc, "curva" end
	if sd < s then s, m, sug, padrao = sd, md, fd, "curva" end
	res.f, res.sugerido_f, res.padrao, res.pontuacao, res.desvio_max = f, sug, padrao, s, m
	res.sugerido = corridasDeF(sug)
	res.passo = passo
	return res
end

--- Acha os jaggies de `g`; com `corrigir`, redesenha (no lugar) os que dá. Devolve a lista de trechos.
local function jaggies(g, linhas, ctx, corrigir)
	local lista = {}
	local cs, ehL = cadeias(g, linhas)
	for _, c in ipairs(cs) do
		for _, t in ipairs(trechos(c)) do
			local a = analisarTrecho(c, t)
			if a and a.tipo == "jaggy" then
				local pts = c.pts
				local todosDentro = true
				for k = a.ini, a.fim do
					if not ctx.dentro(pts[k][1], pts[k][2]) then todosDentro = false end
				end
				if todosDentro then
					local item = {
						pontos = {},
						corridas = a.corridas,
						sugerido = a.sugerido,
						padrao = a.padrao,
						pontuacao = a.pontuacao,
						desvio_max = a.desvio_max,
						corrigido = false,
						fora = {},
					}
					for k = a.ini, a.fim do
						item.pontos[#item.pontos + 1] = ponto(ctx, pts[k][1], pts[k][2])
					end
					-- Pixels que mudariam de lugar.
					local mudancas = {}
					for k = 1, #a.f do
						if a.sugerido_f[k] ~= a.f[k] then
							local p = pts[a.ini + k - 1]
							local d = a.sugerido_f[k] - a.f[k]
							local nx, ny = p[1], p[2]
							if a.maiorX then ny = ny + d else nx = nx + d end
							mudancas[#mudancas + 1] = { velho = p, novo = { nx, ny }, d = d }
							item.fora[#item.fora + 1] = ponto(ctx, p[1], p[2])
						end
					end
					if corrigir then
						item.corrigido, item.motivo = (function()
							if a.desvio_max > 1 then return false, "um pixel sairia mais de 1 px do lugar" end
							-- Os pixels do trecho e dois de cada lado na cadeia; nada mais de linha pode encostar.
							local permitido = {}
							for k = math.max(1, a.ini - 2), math.min(#pts, a.fim + 2) do
								permitido[pts[k][2] * g.w + pts[k][1] + 1] = true
							end
							for k = a.ini, a.fim do
								if not ehL(pts[k][1], pts[k][2]) then return false, "o trecho mudou" end
							end
							local escritas = {}
							for _, m in ipairs(mudancas) do
								local vx, vy = m.velho[1], m.velho[2]
								local nx, ny = m.novo[1], m.novo[2]
								if nx < 0 or ny < 0 or nx >= g.w or ny >= g.h then return false, "sai da imagem" end
								if not (ctx.mexivel(vx, vy) and ctx.mexivel(nx, ny)) then return false, "protegido ou fora da área" end
								if ehL(nx, ny) then return false, "encosta em outra linha" end
								permitido[ny * g.w + nx + 1] = true
								-- O lugar vago pega a cor do lado oposto ao movimento.
								local ox, oy = vx, vy
								if a.maiorX then oy = oy - m.d else ox = ox - m.d end
								if ehL(ox, oy) then return false, "não há cor de lado para copiar" end
								escritas[#escritas + 1] = { vx, vy, valor(g, ox, oy) }
								escritas[#escritas + 1] = { nx, ny, g.px[vy * g.w + vx + 1] }
							end
							for _, m in ipairs(mudancas) do
								for _, p in ipairs({ m.velho, m.novo }) do
									for _, d in ipairs(ANEL) do
										local qx, qy = p[1] + d[1], p[2] + d[2]
										if ehL(qx, qy) and not permitido[qy * g.w + qx + 1] then
											return false, "encosta em outra linha ou junção"
										end
									end
								end
							end
							-- Primeiro os lugares vagos, depois os novos (um novo pode ser o vago de outro).
							for k = 1, #escritas, 2 do
								local e = escritas[k]
								g.px[e[2] * g.w + e[1] + 1] = e[3]
							end
							for k = 2, #escritas, 2 do
								local e = escritas[k]
								g.px[e[2] * g.w + e[1] + 1] = e[3]
							end
							return true, nil
						end)()
					end
					lista[#lista + 1] = item
				end
			end
		end
	end
	return lista
end
L.jaggies = jaggies

-- ---------------------------------------------------------------------------------------------------------------
-- Relatório e nota

--- Nota da linha, 0 a 10: 10 sem defeito; cada double vale 1, cada pixel de desvio num jaggy 1, cada órfão da cor
--- de linha 0,5; a nota cai 3 pontos por defeito a cada 10 pixels de linha (heurística para o crítico de pixel art).
local function nota(totalLinha, doubles, desvioJaggies, orfaosLinha)
	if totalLinha == 0 then return 10 end
	local defeitos = doubles + desvioJaggies + 0.5 * orfaosLinha
	local n = 10 * math.max(0, 1 - 3 * defeitos / totalLinha)
	return math.floor(n * 100 + 0.5) / 100
end

local function pontos(ctx, lista)
	local p = {}
	for _, q in ipairs(lista) do p[#p + 1] = ponto(ctx, q[1], q[2]) end
	return p
end

local function marcarRetangulo(img, x, y, l, a, cor)
	for i = 0, l - 1 do
		img:drawPixel(x + i, y, cor)
		img:drawPixel(x + i, y + a - 1, cor)
	end
	for j = 0, a - 1 do
		img:drawPixel(x, y + j, cor)
		img:drawPixel(x + l - 1, y + j, cor)
	end
end

--- PNG ampliado: o antes com os defeitos marcados (vermelho: double; amarelo: trecho com jaggy, laranja: os pixels
--- dele fora do padrão; magenta: órfão) e, se houve correção, o depois ao lado.
local function gravarPng(arquivo, escala, gAntes, gDepois, marcas, paleta)
	escala = math.max(2, math.floor(escala or 8))
	local w, h = gAntes.w, gAntes.h
	local paineis = gDepois and 2 or 1
	local img = Image(w * escala * paineis + (paineis - 1) * escala, h * escala, ColorMode.RGB)
	img:clear(pc.rgba(255, 255, 255, 255))
	local function desenhar(g, x0)
		for y = 0, h - 1 do
			for x = 0, w - 1 do
				local v = g.px[y * w + x + 1]
				local cor
				if v == g.t then
					local claro = ((x + y) % 2 == 0)
					cor = claro and pc.rgba(236, 236, 236, 255) or pc.rgba(214, 214, 214, 255)
				else
					local r, gg, b, a = rgbaDe(g, v, paleta)
					local f = a / 255
					cor = pc.rgba(math.floor(r * f + 230 * (1 - f)), math.floor(gg * f + 230 * (1 - f)), math.floor(b * f + 230 * (1 - f)), 255)
				end
				for j = 0, escala - 1 do
					for i = 0, escala - 1 do
						img:drawPixel(x0 + x * escala + i, y * escala + j, cor)
					end
				end
			end
		end
	end
	desenhar(gAntes, 0)
	if gDepois then desenhar(gDepois, (w + 1) * escala) end
	local cores = {
		jaggy = pc.rgba(255, 220, 0, 255),
		fora = pc.rgba(255, 128, 0, 255),
		double = pc.rgba(255, 0, 0, 255),
		orfao = pc.rgba(255, 0, 255, 255),
	}
	for _, m in ipairs(marcas) do
		local cor = cores[m[3]]
		marcarRetangulo(img, m[1] * escala, m[2] * escala, escala, escala, cor)
		if escala >= 6 then
			marcarRetangulo(img, m[1] * escala + 1, m[2] * escala + 1, escala - 2, escala - 2, cor)
		end
	end
	img:saveAs(arquivo)
end

-- ---------------------------------------------------------------------------------------------------------------
-- O núcleo: analisa (e, se pedido, corrige) uma grade.

local function processar(g0, opcoes, mexer)
	local o = opcoes or {}
	local ctx = preparar(g0, o)
	local linhas, listaLinhas = resolverLinhas(g0, o.cores_linha, o.paleta)
	local g = copiarGrade(g0)
	local querDoubles = o.doubles ~= false
	local modoJ = o.jaggies
	if modoJ == nil then modoJ = "relatar" end
	local modoO = o.orfaos
	if modoO == nil then modoO = "relatar" end

	local rel = {
		cores_linha = listaLinhas,
		total_linha = contarLinha(g0, linhas),
		componentes_antes = contarComponentes(g0, linhas),
	}

	-- Órfãos: achados na imagem como veio (antes de qualquer troca).
	local orfaos = {}
	if modoO then
		orfaos = acharOrfaos(g0, ctx, o.orfao_legitimo)
	end
	local orfaosLinha = 0
	for _, q in ipairs(orfaos) do
		if linhas[valor(g0, q[1], q[2])] then orfaosLinha = orfaosLinha + 1 end
	end
	rel.orfaos = { encontrados = #orfaos, da_linha = orfaosLinha, corrigidos = 0, pontos = pontos(ctx, orfaos) }
	if mexer and modoO == "corrigir" then
		for _, q in ipairs(orfaos) do
			if ctx.mexivel(q[1], q[2]) then
				g.px[q[2] * g.w + q[1] + 1] = q[3]
				rel.orfaos.corrigidos = rel.orfaos.corrigidos + 1
			end
		end
	end

	-- Doubles: a lista é o que a remoção tira (numa cópia, se for só relatório).
	local doubles = {}
	if querDoubles and next(linhas) ~= nil then
		local alvo = mexer and g or copiarGrade(g)
		doubles = removerDoubles(alvo, linhas, ctx, 3)
		if not mexer then
			-- Os jaggies são procurados depois dos doubles, como no plano.
			g = alvo
		end
	end
	rel.doubles = { encontrados = #doubles, corrigidos = mexer and #doubles or 0, pontos = pontos(ctx, doubles) }

	-- Jaggies.
	local lista = {}
	if modoJ and next(linhas) ~= nil then
		lista = jaggies(g, linhas, ctx, mexer and modoJ == "corrigir")
	end
	local soma, corrigidos = 0, 0
	for _, j in ipairs(lista) do
		soma = soma + j.pontuacao
		if j.corrigido then corrigidos = corrigidos + 1 end
	end
	rel.jaggies = { encontrados = #lista, corrigidos = corrigidos, pontuacao = soma, trechos = lista }
	rel.nota = nota(rel.total_linha, #doubles, soma, orfaosLinha)

	local resultado = mexer and g or g0
	rel.componentes_depois = contarComponentes(resultado, linhas)
	rel.cores_novas = L.cores_novas(g0, resultado)
	local mudados = 0
	for i = 1, g0.w * g0.h do
		if g0.px[i] ~= resultado.px[i] then mudados = mudados + 1 end
	end
	rel.mudados = mudados

	if mexer and mudados > 0 then
		-- Como ficou: as contagens de uma nova análise do resultado.
		local depois = processar(resultado, {
			cores_linha = o.cores_linha,
			paleta = o.paleta,
			area = o.area,
			origem = o.origem,
			protegidos = o.protegidos,
			doubles = o.doubles,
			jaggies = modoJ and "relatar" or false,
			orfaos = modoO and "relatar" or false,
			orfao_legitimo = o.orfao_legitimo,
		}, false)
		rel.depois = {
			doubles = depois.doubles.encontrados,
			jaggies = depois.jaggies.encontrados,
			orfaos = depois.orfaos.encontrados,
			nota = depois.nota,
		}
	end

	if o.png then
		local marcas = {}
		for _, j in ipairs(lista) do
			for _, p in ipairs(j.pontos) do marcas[#marcas + 1] = { p[1] - ctx.ox, p[2] - ctx.oy, "jaggy" } end
			for _, p in ipairs(j.fora) do marcas[#marcas + 1] = { p[1] - ctx.ox, p[2] - ctx.oy, "fora" } end
		end
		for _, q in ipairs(doubles) do marcas[#marcas + 1] = { q[1], q[2], "double" } end
		for _, q in ipairs(orfaos) do marcas[#marcas + 1] = { q[1], q[2], "orfao" } end
		gravarPng(o.png, o.png_escala, g0, (mexer and mudados > 0) and resultado or nil, marcas, o.paleta)
		rel.png = o.png
	end
	return rel, resultado
end

--- Só o relatório; a grade não muda.
function L.analisar_grade(g, opcoes)
	local rel = processar(g, opcoes, false)
	return rel
end

--- Grade nova corrigida e o relatório.
function L.limpar_grade(g, opcoes)
	local rel, nova = processar(g, opcoes, true)
	return nova, rel
end

--- Relatório de uma Image (nada muda). `opcoes`: cores_linha, doubles, jaggies, orfaos, area, protegidos, origem,
--- paleta (indexado), png, png_escala.
function L.analisar_imagem(img, opcoes)
	return L.analisar_grade(grade(img), opcoes)
end

--- Image nova, limpa, e o relatório. Padrões: doubles corrigidos, jaggies e órfãos só relatados.
function L.limpar_imagem(img, opcoes)
	local nova, rel = L.limpar_grade(grade(img), opcoes)
	return imagemDaGrade(nova), rel
end

-- ---------------------------------------------------------------------------------------------------------------
-- Sobre um sprite (com desfazer)

local function acharCamada(spr, camada)
	if camada == nil then
		if app.sprite == spr and app.layer and not app.layer.isGroup then return app.layer end
		for _, l in ipairs(spr.layers) do
			if not l.isGroup then return l end
		end
		error("o sprite não tem camada", 0)
	end
	if type(camada) == "userdata" then return camada end
	local function buscar(lista)
		for _, l in ipairs(lista) do
			if l.name == camada and not l.isGroup then return l end
			if l.isGroup then
				local achou = buscar(l.layers)
				if achou then return achou end
			end
		end
	end
	local l = buscar(spr.layers)
	if l == nil then error("camada não encontrada: " .. tostring(camada), 0) end
	return l
end
L.achar_camada = acharCamada

local function acharQuadro(spr, quadro)
	if quadro == nil then
		if app.sprite == spr and app.frame then return app.frame end
		return spr.frames[1]
	end
	if type(quadro) == "userdata" then return quadro end
	local f = spr.frames[quadro]
	if f == nil then error("quadro não existe: " .. tostring(quadro), 0) end
	return f
end
L.achar_quadro = acharQuadro

--- Põe `img` (na posição `pos`) numa camada nova chamada `nome`, logo acima de `base`; se já existe uma camada com
--- esse nome, troca a célula dela naquele quadro. Para usar dentro de app.transaction.
function L.por_em_camada(spr, base, quadro, nome, img, pos)
	local alvo = nil
	for _, l in ipairs(spr.layers) do
		if l.name == nome and not l.isGroup then alvo = l end
	end
	if alvo == nil then
		alvo = spr:newLayer()
		alvo.name = nome
		pcall(function()
			alvo.parent = base.parent
			alvo.stackIndex = base.stackIndex + 1
		end)
	end
	local cel = alvo:cel(quadro)
	if cel then spr:deleteCel(cel) end
	spr:newCel(alvo, quadro, img, pos)
	return alvo
end

--- Limpa uma camada de um sprite (o aberto, ou `arquivo`). Coordenadas (área, protegidos, pontos do relatório) são
--- do sprite. `saida_camada`: nome de uma camada nova para o resultado; sem ela, troca a célula na mesma camada.
--- `protegidos` também pode ser o nome de uma camada (pixel não transparente nela = protegido). Tudo numa transação
--- só (um Ctrl+Z desfaz). `salvar = true` grava o arquivo; um texto grava uma cópia nesse caminho.
function L.limpar(o)
	o = o or {}
	local spr = o.arquivo and app.open(o.arquivo) or app.sprite
	if spr == nil then error("nenhum sprite aberto", 0) end
	local camada = acharCamada(spr, o.camada)
	local quadro = acharQuadro(spr, o.quadro)
	local cel = camada:cel(quadro)
	if cel == nil then error("a camada " .. camada.name .. " não tem célula no quadro " .. quadro.frameNumber, 0) end
	local pos = cel.position
	local opcoes = {}
	for k, v in pairs(o) do opcoes[k] = v end
	opcoes.origem = { pos.x, pos.y }
	opcoes.paleta = spr.palettes[1]
	if type(o.protegidos) == "string" then
		local m = acharCamada(spr, o.protegidos)
		local mc = m:cel(quadro)
		local mascara = Image(spr.width, spr.height, spr.colorMode)
		if spr.colorMode == ColorMode.INDEXED then mascara:clear(spr.transparentColor) end
		if mc then mascara:drawImage(mc.image, mc.position) end
		local mg = grade(mascara)
		opcoes.protegidos = function(x, y) return valor(mg, x, y) ~= mg.t end
	end
	local nova, rel = L.limpar_imagem(cel.image, opcoes)
	rel.camada = camada.name
	rel.quadro = quadro.frameNumber
	if rel.mudados > 0 or o.saida_camada then
		app.transaction("Limpar doubles e jaggies", function()
			if o.saida_camada then
				local l = L.por_em_camada(spr, camada, quadro, o.saida_camada, nova, pos)
				rel.saida_camada = l.name
			else
				cel.image = nova
			end
		end)
	end
	if o.salvar == true then
		spr:saveAs(spr.filename)
	elseif type(o.salvar) == "string" then
		spr:saveCopyAs(o.salvar)
	end
	return rel
end

return L
