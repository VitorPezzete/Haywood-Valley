-- Adaptador das extensões de terceiros do Aseprite do usuário, para chamar as funções delas sem interface (2026-10-22).
--
-- As quatro extensões (Dithering Generator e Brush Manager PRO, do sodedromme; Live Brush, do Devkidd; Carbs
-- Toolbar, do CarbsCode) só funcionam por janelas e pelo pincel de quem desenha. Este arquivo carrega o código delas
-- de onde o Aseprite as instalou (%APPDATA%\Aseprite\extensions\<pasta>), sem copiar nada para cá e sem mudar os
-- arquivos delas, e expõe o que serve para desenhar em modo lote (aseprite -b). As licenças proíbem redistribuir:
-- por isso o repositório só tem este adaptador, nosso. O que cada uma faz, o que ficou de fora e por quê, as licenças
-- e os exemplos estão em docs/arte/EXTENSOES_ASEPRITE.md.
--
-- Uso (Aseprite em lote, pelo run_lua_script do MCP `aseprite` ou por tools/aseprite_extensoes.mjs):
--
--   local E = dofile([[C:\Users\Szortek\Documents\Haywood-Valley\aseprite\adaptadores\extensoes.lua]])
--   E.dithering.preencher{ arquivo = [[C:\...\vaca.aseprite]], camada = "sombra", ruido = "bayer", densidade = 5,
--                          cor = "#3a2a1a", mascara_camada = "corpo_e_cabeca", saida = [[C:\...\vaca_teste.aseprite]] }
--   E.chamar("carbs.contorno", { arquivo = ..., camada = "corpo_e_cabeca", espessura = 1, cor = "#000000" })
--
-- Regras comuns a quem desenha no sprite (seção "Alvo" do documento): `arquivo` (sem ele, o sprite ativo), `camada`
-- (criada por cima se não existir), `quadro` (1), `saida` (sem ela, grava no próprio arquivo; `salvar = false` não
-- grava), `png` (exporta o sprite achatado; `png_escala` amplia), `semente` (sorteios repetíveis). Toda função devolve
-- uma tabela simples (vira JSON no rodar.lua). Erros saem com `error()` e começam por "[extensoes]".
--
-- O que as extensões só fazem pela janela (biblioteca de pincéis, pincéis de várias camadas, giro pelo traço,
-- conjuntos salvos, pincel ativo, cópias e exportações do Carbs, ajuste de cor, matrizes de dithering) foi refeito em
-- código nosso em ferramentas.lua, carregado no fim deste arquivo (2026-10-22).

local E = { VERSAO = "1.0.0" }

-- Versões conferidas em 2026-10-22. Se a extensão mudar de versão o adaptador recusa (as funções delas podem ter
-- mudado de nome ou de parâmetros); `E.configurar{ aceitar_outra_versao = true }` passa por cima, por sua conta.
local EXTENSOES = {
	dithering = { pasta = "dithering-generator", nome = "Dithering Generator", versao = "1.0.0", autor = "sodedromme" },
	pincel = { pasta = "brush-manager-pro", nome = "Brush Manager PRO", versao = "0.9.7.1", autor = "sodedromme" },
	livebrush = { pasta = "live-brush", nome = "Live Brush", versao = "2.1.1", autor = "Devkidd" },
	carbs = { pasta = "carbs-toolbar", nome = "Carbs Toolbar", versao = "4.0.1", autor = "CarbsCode" },
}

local config = {
	pasta_extensoes = app.fs.joinPath(app.fs.userConfigPath, "extensions"),
	aceitar_outra_versao = false,
}

-- O código de cada extensão, carregado na primeira chamada (dg, bm, lb, carbs). E.configurar esvazia.
local caches = {}

local pc = app.pixelColor

-- ---------------------------------------------------------------------------------------------------------------
-- Utilidades

local function falha(fmt, ...)
	error("[extensoes] " .. string.format(fmt, ...), 0)
end

local function lerTexto(caminho)
	local f = io.open(caminho, "rb")
	if not f then return nil end
	local t = f:read("a")
	f:close()
	-- Alguns arquivos das extensões começam com o BOM do UTF-8, que o `load` do Lua não aceita (o dofile do
	-- Aseprite pula).
	return (t:gsub("^\239\187\191", ""))
end

--- Muda a configuração: pasta_extensoes (outra instalação), aceitar_outra_versao.
function E.configurar(t)
	for k, v in pairs(t or {}) do
		if config[k] == nil then falha("configuração desconhecida: %s", tostring(k)) end
		config[k] = v
	end
	caches = {}
	return config
end

local function pastaDe(chave)
	local info = EXTENSOES[chave]
	return app.fs.joinPath(config.pasta_extensoes, info.pasta)
end

--- Confere se a extensão está instalada e na versão esperada; devolve a pasta.
local function exigir(chave)
	local info = EXTENSOES[chave]
	local pasta = pastaDe(chave)
	local pacote = lerTexto(app.fs.joinPath(pasta, "package.json"))
	if not pacote then
		falha("a extensão %s (%s) não está instalada em %s", info.nome, info.autor, pasta)
	end
	-- O json do Aseprite devolve userdata (com acesso por campo), não tabela.
	local ok, versao = pcall(function() return json.decode(pacote).version end)
	versao = ok and versao or "?"
	if versao ~= info.versao and not config.aceitar_outra_versao then
		falha("%s mudou de versão (o adaptador conhece a %s, está instalada a %s); confira as funções em "
			.. "docs/arte/EXTENSOES_ASEPRITE.md antes de usar, ou chame E.configurar{ aceitar_outra_versao = true }",
			info.nome, info.versao, tostring(versao))
	end
	return pasta, versao
end

--- Carrega um arquivo Lua num ambiente próprio (as funções globais dele ficam no ambiente, não no _G).
--- `sufixo` é acrescentado ao texto só na memória (o arquivo no disco não muda).
local function carregarEm(ambiente, caminho, sufixo)
	local texto = lerTexto(caminho)
	if not texto then falha("não achei %s", caminho) end
	if sufixo then texto = texto .. "\n" .. sufixo end
	local bloco, erro = load(texto, "@" .. caminho, "t", ambiente)
	if not bloco then falha("não consegui ler %s: %s", caminho, tostring(erro)) end
	return bloco
end

--- Um `app` de mentira por cima do de verdade: o que está em `sobre` (cor de frente e de fundo, área de
--- transferência, avisos) vale no lugar do real; o resto (sprite ativo, comandos, pixelColor...) é o real.
local function appSobreposto(sobre)
	return setmetatable({}, {
		__index = function(_, k)
			local v = sobre[k]
			if v ~= nil then return v end
			return app[k]
		end,
		__newindex = function(_, k, v)
			if sobre[k] ~= nil then sobre[k] = v else app[k] = v end
		end,
	})
end

--- Cor a partir de "#rrggbb", "#rrggbbaa", {r,g,b,a}, {r=,g=,b=,a=}, Color ou número (índice da paleta).
local function cor(v, padrao)
	if v == nil then
		if padrao == nil then return nil end
		v = padrao
	end
	local tipo = type(v)
	if tipo == "userdata" then return Color(v) end
	if tipo == "number" then return Color{ index = v } end
	if tipo == "string" then
		local h = v:gsub("^#", "")
		if not h:match("^%x+$") or (#h ~= 6 and #h ~= 8) then falha("cor inválida: %s (use #rrggbb ou #rrggbbaa)", v) end
		local a = #h == 8 and tonumber(h:sub(7, 8), 16) or 255
		return Color{ r = tonumber(h:sub(1, 2), 16), g = tonumber(h:sub(3, 4), 16), b = tonumber(h:sub(5, 6), 16), a = a }
	end
	if tipo == "table" then
		local r = v.r or v[1] or 0
		local g = v.g or v[2] or 0
		local b = v.b or v[3] or 0
		local a = v.a or v[4] or 255
		return Color{ r = r, g = g, b = b, a = a }
	end
	falha("cor inválida: %s", tostring(v))
end

local function pixelDe(c)
	return pc.rgba(c.red, c.green, c.blue, c.alpha)
end

local function hex(c)
	return string.format("#%02x%02x%02x%02x", c.red, c.green, c.blue, c.alpha)
end

--- Retângulo a partir de {x,y,w,h}, {x=,y=,largura=,altura=} ou Rectangle.
local function retangulo(v)
	if v == nil then return nil end
	if type(v) == "userdata" then return Rectangle(v) end
	if type(v) ~= "table" then falha("retângulo inválido: %s", tostring(v)) end
	local x = v.x or v[1] or 0
	local y = v.y or v[2] or 0
	local w = v.largura or v.w or v.width or v[3]
	local h = v.altura or v.h or v.height or v[4]
	if not w or not h or w < 1 or h < 1 then falha("retângulo sem largura ou altura") end
	return Rectangle(math.floor(x), math.floor(y), math.floor(w), math.floor(h))
end

local function tabelaRet(r)
	if not r then return nil end
	return { x = r.x, y = r.y, largura = r.width, altura = r.height }
end

local function ponto(v)
	if type(v) ~= "table" then falha("ponto inválido: %s", tostring(v)) end
	return math.floor(v.x or v[1] or 0), math.floor(v.y or v[2] or 0)
end

local function semear(o)
	if o.semente ~= nil then math.randomseed(math.floor(o.semente)) end
end

local function opaco(v, modo, transparente)
	if modo == ColorMode.INDEXED then return v ~= transparente end
	if modo == ColorMode.GRAY then return pc.grayaA(v) > 0 end
	return pc.rgbaA(v) > 0
end

--- Uma cópia RGB da imagem (as funções das extensões trabalham em RGB). `spr` dá a paleta das indexadas.
local function emRGB(img, spr)
	if img.colorMode == ColorMode.RGB then return img:clone() end
	local out = Image(img.width, img.height, ColorMode.RGB)
	if img.colorMode == ColorMode.INDEXED then
		if not spr then falha("imagem indexada sem sprite para dar a paleta") end
		local pal = spr.palettes[1]
		local transparente = img.spec.transparentColor
		for it in img:pixels() do
			local v = it()
			if v ~= transparente and v < #pal then
				local c = pal:getColor(v)
				out:drawPixel(it.x, it.y, pc.rgba(c.red, c.green, c.blue, c.alpha))
			end
		end
	else
		for it in img:pixels() do
			local v = it()
			local g = pc.grayaV(v)
			out:drawPixel(it.x, it.y, pc.rgba(g, g, g, pc.grayaA(v)))
		end
	end
	return out
end

--- Converte uma imagem RGB para o modo de cor do sprite (indexado: a cor mais próxima da paleta; cinza: a luminância).
local function noModoDo(img, spr)
	if img.colorMode == spr.colorMode then return img end
	if img.colorMode ~= ColorMode.RGB then img = emRGB(img, spr) end
	if spr.colorMode == ColorMode.RGB then return img end
	local out = Image(img.width, img.height, spr.colorMode)
	if spr.colorMode == ColorMode.INDEXED then
		local pal = spr.palettes[1]
		local transparente = spr.transparentColor
		out:clear(transparente)
		local cache = {}
		for it in img:pixels() do
			local v = it()
			if pc.rgbaA(v) >= 128 then
				local idx = cache[v]
				if not idx then
					local r, g, b = pc.rgbaR(v), pc.rgbaG(v), pc.rgbaB(v)
					local melhor, menor = transparente == 0 and 1 or 0, math.huge
					for i = 0, #pal - 1 do
						if i ~= transparente then
							local c = pal:getColor(i)
							local d = (r - c.red) ^ 2 + (g - c.green) ^ 2 + (b - c.blue) ^ 2
							if d < menor then menor, melhor = d, i end
						end
					end
					idx = melhor
					cache[v] = idx
				end
				out:drawPixel(it.x, it.y, idx)
			end
		end
	else
		for it in img:pixels() do
			local v = it()
			local l = math.floor(pc.rgbaR(v) * 0.299 + pc.rgbaG(v) * 0.587 + pc.rgbaB(v) * 0.114 + 0.5)
			out:drawPixel(it.x, it.y, pc.graya(l, pc.rgbaA(v)))
		end
	end
	return out
end

--- Pixel RGBA de `src` por cima de `dst` (composição normal).
local function compor(dst, src)
	local sa = pc.rgbaA(src)
	if sa >= 255 then return src end
	if sa == 0 then return dst end
	local da = pc.rgbaA(dst)
	local fs, fd = sa / 255, da / 255 * (1 - sa / 255)
	local oa = fs + fd
	if oa <= 0 then return 0 end
	local function canal(s, d) return math.floor((s * fs + d * fd) / oa + 0.5) end
	return pc.rgba(canal(pc.rgbaR(src), pc.rgbaR(dst)), canal(pc.rgbaG(src), pc.rgbaG(dst)),
		canal(pc.rgbaB(src), pc.rgbaB(dst)), math.floor(oa * 255 + 0.5))
end

--- Imagem vazia no modo do sprite (nas indexadas, cheia do índice transparente).
local function imagemVazia(spr, w, h)
	local img = Image(w, h, spr.colorMode)
	img:clear(spr.colorMode == ColorMode.INDEXED and spr.transparentColor or 0)
	return img
end

--- Gira 90 graus (para as faixas verticais: o comprimento vira altura).
local function transpor(img)
	local out = Image(img.height, img.width, img.colorMode)
	for it in img:pixels() do out:drawPixel(it.y, it.x, it()) end
	return out
end

-- ---------------------------------------------------------------------------------------------------------------
-- Alvo: abrir o sprite, escolher camada e quadro, colar, gravar

local function acharCamada(camadas, nome)
	for _, l in ipairs(camadas) do
		if l.name == nome and not l.isGroup then return l end
		if l.isGroup then
			local achada = acharCamada(l.layers, nome)
			if achada then return achada end
		end
	end
	return nil
end

local function caminhoIgual(a, b)
	return app.fs.normalizePath(a):lower() == app.fs.normalizePath(b):lower()
end

local function abrirSprite(arquivo)
	for _, s in ipairs(app.sprites) do
		if s.filename ~= "" and caminhoIgual(s.filename, arquivo) then return s, false end
	end
	if not app.fs.isFile(arquivo) then falha("arquivo não encontrado: %s", arquivo) end
	local s = app.open(arquivo)
	if not s then falha("o Aseprite não abriu %s", arquivo) end
	return s, true
end

--- Abre o alvo. `opcoes.camada_existente`: a camada tem de existir (efeitos sobre o que já está desenhado);
--- senão é criada por cima com o nome pedido (ou `nome_padrao`).
local function abrir(o, nome_padrao, opcoes)
	opcoes = opcoes or {}
	local spr, aberto
	if o.arquivo then
		spr, aberto = abrirSprite(o.arquivo)
	else
		spr = app.activeSprite
		if not spr then falha("sem sprite: passe `arquivo` (ou abra um antes, como o filename do run_lua_script)") end
	end
	app.activeSprite = spr
	local quadro = math.floor(o.quadro or 1)
	if quadro < 1 or quadro > #spr.frames then falha("quadro %d fora do sprite (1 a %d)", quadro, #spr.frames) end
	local camada
	if o.camada then
		camada = acharCamada(spr.layers, o.camada)
		if not camada then
			if opcoes.camada_existente then falha("a camada \"%s\" não existe", o.camada) end
			camada = spr:newLayer()
			camada.name = o.camada
		end
	elseif opcoes.camada_existente then
		camada = app.activeLayer
		if not camada or camada.isGroup then falha("diga a `camada`") end
	else
		camada = spr:newLayer()
		camada.name = nome_padrao or "extensoes"
	end
	-- Camada recém-criada vai para o topo; `abaixo_de`/`acima_de` = nome de outra camada a põe junto dela.
	if camada:cel(quadro) == nil and #camada.cels == 0 and (o.abaixo_de or o.acima_de) then
		local ref = acharCamada(spr.layers, o.abaixo_de or o.acima_de)
		if not ref then falha("a camada \"%s\" não existe", o.abaixo_de or o.acima_de) end
		if ref ~= camada then
			camada.parent = ref.parent
			camada.stackIndex = o.abaixo_de and ref.stackIndex or ref.stackIndex + 1
		end
	end
	if camada.isGroup then falha("\"%s\" é um grupo, não uma camada de imagem", camada.name) end
	if camada.isTilemap then falha("\"%s\" é uma camada de tilemap (não suportada)", camada.name) end
	app.activeLayer = camada
	app.activeFrame = spr.frames[quadro]
	return { spr = spr, camada = camada, quadro = quadro, aberto = aberto }
end

--- Função (x, y em coordenadas do sprite) -> bool, a partir do que já está desenhado numa camada.
local function mascaraDe(ctx, o)
	local qual, inverter
	if o.mascara_camada then
		qual = acharCamada(ctx.spr.layers, o.mascara_camada)
		if not qual then falha("a camada da máscara \"%s\" não existe", o.mascara_camada) end
	elseif o.mascara == "conteudo" or o.mascara == "vazio" then
		qual = ctx.camada
	elseif o.mascara ~= nil then
		falha("mascara inválida: %s (vale \"conteudo\" ou \"vazio\"; ou use mascara_camada)", tostring(o.mascara))
	else
		return nil
	end
	inverter = o.mascara == "vazio"
	local cel = qual:cel(ctx.quadro)
	local img = cel and cel.image:clone()
	local pos = cel and cel.position
	local modo, transparente = ctx.spr.colorMode, ctx.spr.transparentColor
	return function(x, y)
		local dentro = false
		if img then
			local ix, iy = x - pos.x, y - pos.y
			if ix >= 0 and iy >= 0 and ix < img.width and iy < img.height then
				dentro = opaco(img:getPixel(ix, iy), modo, transparente)
			end
		end
		if inverter then return not dentro end
		return dentro
	end
end

--- Cola `img` (RGB ou no modo do sprite) em (x, y) da camada/quadro do alvo. Modos: "compor" (padrão, por cima),
--- "substituir" (troca os pixels, inclusive pelos transparentes), "apagar" (apaga onde a imagem tem pixel).
--- `mascara`/`mascara_camada` limitam onde se desenha. Devolve quantos pixels mudaram.
local function colar(ctx, img, x, y, o)
	o = o or {}
	local spr = ctx.spr
	local modo = o.modo or "compor"
	if modo ~= "compor" and modo ~= "substituir" and modo ~= "apagar" then
		falha("modo inválido: %s (compor, substituir ou apagar)", tostring(modo))
	end
	local mascara = mascaraDe(ctx, o)
	img = noModoDo(img, spr)
	local cm, transparente = spr.colorMode, spr.transparentColor
	local vazio = cm == ColorMode.INDEXED and transparente or 0
	local area = Rectangle(x, y, img.width, img.height):intersect(spr.bounds)
	if area.isEmpty then return 0 end
	local cel = ctx.camada:cel(ctx.quadro)
	local antiga = cel and cel.bounds
	local uniao = antiga and antiga:union(area) or area
	local nova = Image(uniao.width, uniao.height, cm)
	nova:clear(vazio)
	if cel then
		local ox, oy = antiga.x - uniao.x, antiga.y - uniao.y
		for it in cel.image:pixels() do nova:drawPixel(it.x + ox, it.y + oy, it()) end
	end
	local mudou = 0
	for sy = area.y, area.y + area.height - 1 do
		for sx = area.x, area.x + area.width - 1 do
			local v = img:getPixel(sx - x, sy - y)
			local tem = opaco(v, cm, transparente)
			if (tem or modo == "substituir") and (not mascara or mascara(sx, sy)) then
				local dx, dy = sx - uniao.x, sy - uniao.y
				local antes = nova:getPixel(dx, dy)
				local depois
				if modo == "apagar" then
					depois = vazio
				elseif modo == "substituir" or cm ~= ColorMode.RGB then
					depois = v
				else
					depois = compor(antes, v)
				end
				if depois ~= antes then
					nova:drawPixel(dx, dy, depois)
					mudou = mudou + 1
				end
			end
		end
	end
	if cel then
		cel.image = nova
		cel.position = Point(uniao.x, uniao.y)
	else
		spr:newCel(ctx.camada, ctx.quadro, nova, Point(uniao.x, uniao.y))
	end
	return mudou
end

--- Imagem RGB do sprite achatado (camadas visíveis) num quadro.
local function achatar(spr, quadro)
	local img = Image(spr.width, spr.height, ColorMode.RGB)
	img:drawSprite(spr, quadro, Point(0, 0))
	return img
end

--- Grava e exporta, conforme `salvar`, `saida`, `png`, `png_escala`; devolve o resumo do alvo.
local function finalizar(ctx, o, resultado, salvar_padrao)
	local spr = ctx.spr
	resultado = resultado or {}
	local salvar = o.salvar
	if salvar == nil then salvar = salvar_padrao ~= false end
	if salvar then
		local destino = o.saida or spr.filename
		if destino == nil or destino == "" then falha("o sprite não tem arquivo: passe `saida`") end
		if o.saida and not caminhoIgual(o.saida, spr.filename) then
			spr:saveCopyAs(o.saida)
		else
			spr:saveAs(spr.filename)
		end
		resultado.salvo = destino
	end
	if o.png then
		local img = achatar(spr, ctx.quadro)
		local escala = math.floor(o.png_escala or 1)
		if escala > 1 then img:resize(img.width * escala, img.height * escala) end
		img:saveAs(o.png)
		resultado.png = o.png
	end
	resultado.camada = ctx.camada and ctx.camada.name
	resultado.quadro = ctx.quadro
	if ctx.aberto and o.fechar ~= false then
		spr:close()
	end
	return resultado
end

--- Imagem a partir de `origem`: { png = caminho } | { arquivo?, camada?, quadro?, retangulo? | fatia? }.
--- Sem `arquivo`, o sprite ativo. Sem `camada`, o sprite achatado. Devolve uma imagem RGB.
local function imagemDeOrigem(origem)
	if type(origem) ~= "table" then falha("origem inválida (use { png = ... } ou { arquivo, camada, retangulo })") end
	if origem.png then
		if not app.fs.isFile(origem.png) then falha("png não encontrado: %s", origem.png) end
		local img = Image{ fromFile = origem.png }
		if not img then falha("não li %s", origem.png) end
		return emRGB(img)
	end
	local spr, aberto
	if origem.arquivo then
		spr, aberto = abrirSprite(origem.arquivo)
	else
		spr = app.activeSprite
		if not spr then falha("origem sem arquivo e sem sprite ativo") end
	end
	local quadro = math.floor(origem.quadro or 1)
	local camada, cel
	if origem.camada then
		camada = acharCamada(spr.layers, origem.camada)
		if not camada then falha("a camada \"%s\" não existe na origem", origem.camada) end
		cel = camada:cel(quadro)
	end
	local area
	if origem.fatia then
		for _, s in ipairs(spr.slices) do
			if s.name == origem.fatia then area = Rectangle(s.bounds) end
		end
		if not area then falha("a fatia \"%s\" não existe", origem.fatia) end
	else
		-- Só a camada, sem retângulo: o que está desenhado nela (o cel), não o sprite inteiro.
		area = retangulo(origem.retangulo) or (cel and not origem.inteiro and Rectangle(cel.bounds)) or Rectangle(spr.bounds)
	end
	local out
	if camada then
		out = Image(area.width, area.height, ColorMode.RGB)
		if cel then
			local rgb = emRGB(cel.image, spr)
			out:drawImage(rgb, Point(cel.position.x - area.x, cel.position.y - area.y))
		end
	else
		out = Image(achatar(spr, quadro), area)
	end
	if aberto then
		spr:close()
	end
	return out
end

--- A origem de uma ação: sem `arquivo` nem `png`, é o próprio alvo (`o.arquivo`).
local function origemDo(o, origem)
	if type(origem) ~= "table" or origem.arquivo or origem.png or not o.arquivo then return origem end
	local c = {}
	for k, v in pairs(origem) do c[k] = v end
	c.arquivo = o.arquivo
	return c
end

--- Grava a imagem gerada (antes de colar) se `imagem_png` foi pedido.
local function gravarImagem(img, o, resultado)
	if o.imagem_png then
		img:saveAs(o.imagem_png)
		resultado.imagem_png = o.imagem_png
	end
end

local ANCORAS = {
	topo_esquerda = { 0, 0 }, topo = { 0.5, 0 }, topo_direita = { 1, 0 },
	esquerda = { 0, 0.5 }, centro = { 0.5, 0.5 }, direita = { 1, 0.5 },
	base_esquerda = { 0, 1 }, base = { 0.5, 1 }, base_direita = { 1, 1 },
}

local function ancorar(img, x, y, ancora)
	local a = ANCORAS[ancora or "centro"]
	if not a then falha("âncora inválida: %s", tostring(ancora)) end
	return x - math.floor(img.width * a[1]), y - math.floor(img.height * a[2])
end

--- Lista de pontos: `pontos` ({{x,y},...}); com `espacamento`, preenche o caminho entre eles a cada N pixels.
local function listaDePontos(o)
	local pontos = {}
	if o.pontos then
		for _, p in ipairs(o.pontos) do
			local x, y = ponto(p)
			pontos[#pontos + 1] = { x, y }
		end
	elseif o.x or o.y then
		pontos[1] = { math.floor(o.x or 0), math.floor(o.y or 0) }
	end
	if #pontos == 0 then falha("diga onde: `pontos` = {{x,y}, ...} ou `x`/`y`") end
	local passo = o.espacamento
	if passo and passo > 0 and #pontos > 1 then
		local denso = { pontos[1] }
		for i = 2, #pontos do
			local a, b = pontos[i - 1], pontos[i]
			local dx, dy = b[1] - a[1], b[2] - a[2]
			local dist = math.sqrt(dx * dx + dy * dy)
			local n = math.max(1, math.floor(dist / passo))
			for k = 1, n do
				denso[#denso + 1] = { math.floor(a[1] + dx * k / n + 0.5), math.floor(a[2] + dy * k / n + 0.5) }
			end
		end
		pontos = denso
	end
	return pontos
end

-- ---------------------------------------------------------------------------------------------------------------
-- Dithering Generator (sodedromme): brush_algo.lua é um módulo puro (devolve uma tabela); carregado inteiro.

local function algoDG()
	if caches.dg then return caches.dg end
	local pasta = exigir("dithering")
	local A = dofile(app.fs.joinPath(pasta, "brush_algo.lua"))
	for _, nome in ipairs({ "generateScatterDither", "generateThresholdMatrix", "buildTiledBrush", "applyFractalNoise",
		"invertImage", "createScaledImage" }) do
		if type(A[nome]) ~= "function" then falha("o Dithering Generator não tem mais Algo.%s", nome) end
	end
	caches.dg = A
	return A
end

local D = {}
E.dithering = D

-- Os ruídos do getNoiseValue da extensão. O tamanho de repetição muda: o azul repete a cada 16, os outros a cada 8.
D.RUIDOS = { "bayer", "blue", "white", "halftone", "lines_h", "lines_v", "lines_d", "none" }
local TAMANHO_PADRAO = { bayer = 8, blue = 16, white = 16, halftone = 8, lines_h = 8, lines_v = 8, lines_d = 8, none = 8 }

local function ruidoDe(o)
	local r = o.ruido or "bayer"
	if not TAMANHO_PADRAO[r] then falha("ruído desconhecido: %s (vale %s)", tostring(r), table.concat(D.RUIDOS, ", ")) end
	return r
end

local function listaDeCores(lista)
	local cores = {}
	for _, c in ipairs(lista) do cores[#cores + 1] = pixelDe(cor(c)) end
	return cores
end

--- Faixa de dithering (o "Strip" da extensão): densidade indo de `inicio` a `fim` (0 a 100) ao longo do
--- comprimento. Com `cores` (2 ou mais), vira um degradê pontilhado entre as cores (o "multicor" da extensão).
--- `padrao` (origem) troca a cor sólida por uma imagem repetida. `vertical` deita a faixa de cima para baixo.
function D.faixa(o)
	o = o or {}
	local A = algoDG()
	local ruido = ruidoDe(o)
	local area = retangulo(o.retangulo)
	local comprimento = math.floor(o.comprimento or (area and (o.vertical and area.height or area.width)) or 64)
	local largura = math.floor(o.largura or (area and (o.vertical and area.width or area.height)) or 16)
	local fonte, multicor
	if o.cores then
		if #o.cores < 2 then falha("`cores` precisa de 2 cores ou mais") end
		multicor = listaDeCores(o.cores)
		fonte = Image(1, 1, ColorMode.RGB)
		fonte:drawPixel(0, 0, pc.rgba(255, 255, 255, 255))
	elseif o.padrao then
		fonte = imagemDeOrigem(origemDo(o, o.padrao))
	else
		fonte = Image(16, 16, ColorMode.RGB)
		fonte:clear(pixelDe(cor(o.cor, "#000000")))
	end
	local img = A.generateScatterDither(fonte, comprimento, largura, o.inicio or 100, o.fim or 0, o.angulo or 0,
		o.dx or 0, o.dy or 0, ruido, nil, o.inverter == true, multicor)
	if not img then falha("a extensão não gerou a faixa") end
	if o.vertical then img = transpor(img) end
	return D._aplicar(o, img, "dithering.faixa", area)
end

--- Degradê pontilhado entre `cores` (2 ou mais) num retângulo (padrão: o sprite todo). É a faixa multicor.
function D.gradiente(o)
	o = o or {}
	if not o.cores then falha("`cores` = { \"#...\", \"#...\" } é obrigatório") end
	if not o.retangulo and not o.comprimento then
		local spr = o.arquivo and abrirSprite(o.arquivo) or app.activeSprite
		if spr then o.retangulo = { 0, 0, spr.width, spr.height } end
	end
	return D.faixa(o)
end

--- O ladrilho da matriz (o "Matrix" da extensão), RGB: `ruido`, `tamanho` (2, 4, 8, 16; padrão pelo ruído),
--- `densidade` 1 a 17 (17 = cheio), `angulo`, `dx`, `dy`, `inverter`, `cor`, `escala` (1 a 16) e `acrescimo`
--- (0 a 16, aumenta o ladrilho repetindo). `mapa = true` devolve o mapa de limiar em cinza (o que a extensão instala
--- como matriz de dithering do Aseprite); `fractal` mistura o ruído no mapa.
local function ladrilho(o)
	local A = algoDG()
	local ruido = ruidoDe(o)
	local tamanho = math.floor(o.tamanho or TAMANHO_PADRAO[ruido])
	local densidade = math.max(1, math.min(17, math.floor(o.densidade or 9)))
	local inverter = o.inverter == true and ruido ~= "none"
	local saida
	if o.mapa then
		saida = A.generateThresholdMatrix(nil, ruido, tamanho, o.angulo or 0, o.dx or 0, o.dy or 0, inverter)
		if densidade < 17 then
			-- Menos densidade: o mapa sobe para o claro (limiar mais alto, menos pontos).
			local faixa = (densidade - 1) / 16 * 255
			for it in saida:pixels() do
				local v = it()
				if pc.rgbaA(v) > 0 then
					local n = math.min(255, math.floor(255 - faixa + pc.rgbaR(v) * faixa / 255))
					it(pc.rgba(n, n, n, pc.rgbaA(v)))
				end
			end
		end
	else
		local mapa = A.generateThresholdMatrix(nil, ruido, tamanho, o.angulo or 0, o.dx or 0, o.dy or 0, false)
		local limite = math.floor((densidade - 1) / 16 * 254)
		local tinta = pixelDe(cor(o.cor, "#000000"))
		saida = Image(mapa.width, mapa.height, ColorMode.RGB)
		for it in mapa:pixels() do
			local passa = pc.rgbaR(it()) <= limite
			if inverter then passa = not passa end
			if passa then saida:drawPixel(it.x, it.y, tinta) end
		end
	end
	local escala = math.floor(o.escala or 1)
	local acrescimo = math.floor(o.acrescimo or 0)
	if escala > 1 or acrescimo > 0 then saida = A.buildTiledBrush(saida, acrescimo, escala) end
	if o.mapa and o.fractal then saida = A.applyFractalNoise(saida, ruido) end
	return saida
end
-- O matriz.gravar de ferramentas.lua usa o mapa de limiar dos ruídos da extensão.
D._ladrilho = ladrilho

--- O ladrilho sozinho: grava em `imagem_png` e, com alvo, cola uma vez em (x, y).
function D.matriz(o)
	o = o or {}
	local img = ladrilho(o)
	if not o.arquivo and not app.activeSprite then
		local r = { largura = img.width, altura = img.height }
		gravarImagem(img, o, r)
		return r
	end
	return D._aplicar(o, img, "dithering.matriz", nil)
end

--- Enche um retângulo (padrão: o sprite todo) com o ladrilho repetido. Com `mascara_camada`/`mascara`, só sobre o
--- que já está desenhado (sombra pontilhada dentro de uma forma); com `modo = "apagar"`, vira transparência pontilhada.
function D.preencher(o)
	o = o or {}
	local tile = ladrilho(o)
	local ctx = abrir(o, "dithering")
	local area = retangulo(o.retangulo) or Rectangle(ctx.spr.bounds)
	local img = Image(area.width, area.height, ColorMode.RGB)
	-- O ladrilho fica preso à grade do sprite (0,0), não ao canto do retângulo: dois preenchimentos vizinhos casam.
	local ox, oy = area.x % tile.width, area.y % tile.height
	for y = -oy, area.height - 1, tile.height do
		for x = -ox, area.width - 1, tile.width do
			img:drawImage(tile, Point(x, y))
		end
	end
	local resultado = { ladrilho = { largura = tile.width, altura = tile.height }, retangulo = tabelaRet(area) }
	gravarImagem(tile, o, resultado)
	app.transaction("Extensões: dithering.preencher", function()
		resultado.pixels = colar(ctx, img, area.x, area.y, o)
	end)
	return finalizar(ctx, o, resultado)
end

--- Cola a imagem gerada no alvo (x, y; ou o canto do `retangulo`), grava `imagem_png`.
function D._aplicar(o, img, nome, area)
	local resultado = { largura = img.width, altura = img.height }
	gravarImagem(img, o, resultado)
	if not o.arquivo and not app.activeSprite then return resultado end
	if o.aplicar == false then return resultado end
	local ctx = abrir(o, (nome:gsub("%.", "_")))
	area = area or retangulo(o.retangulo)
	local x = math.floor(o.x or (area and area.x) or 0)
	local y = math.floor(o.y or (area and area.y) or 0)
	app.transaction("Extensões: " .. nome, function()
		resultado.pixels = colar(ctx, img, x, y, o)
	end)
	resultado.posicao = { x = x, y = y }
	return finalizar(ctx, o, resultado)
end

-- ---------------------------------------------------------------------------------------------------------------
-- Brush Manager PRO (sodedromme): brush_algo.lua e brush_utils.lua são módulos puros; Algo.init(Utils) os liga.
-- As bibliotecas de pincéis são .aseprite com fatias (cada fatia é um pincel): as de exemplo em sources/ e as do
-- usuário em %APPDATA%\Aseprite\scripts\user_brushes_pro.aseprite, user_dithers_pro.aseprite e nos caminhos de
-- %APPDATA%\Aseprite\brush_manager_paths_pro.txt.

local function algoBM()
	if caches.bm then return caches.bm end
	local pasta = exigir("pincel")
	local U = dofile(app.fs.joinPath(pasta, "brush_utils.lua"))
	local A = dofile(app.fs.joinPath(pasta, "brush_algo.lua"))
	if type(A.init) ~= "function" then falha("o Brush Manager PRO não tem mais Algo.init") end
	A.init(U)
	for _, nome in ipairs({ "createScaledImage", "createRotatedImage", "getRandomTransformedImage", "transformImageSimple",
		"createSmartRecolorImage", "applyColorJitterToImage", "addOutlineToImage", "applyRadialDensity", "applyCoverageOffset",
		"generateTileVariation", "applyOutlineToCanvas", "applyGraffitiToCanvas", "applyShatterToCanvas",
		"applyGlitchToCanvas", "applyDistortToCanvas", "applyNegativeToCanvas", "applyMagicToCanvas" }) do
		if type(A[nome]) ~= "function" then falha("o Brush Manager PRO não tem mais Algo.%s", nome) end
	end
	caches.bm = A
	return A
end

local P = {}
E.pincel = P

--- Os arquivos de biblioteca que o Brush Manager PRO lê, na ordem dele.
function P.bibliotecas()
	local pasta = exigir("pincel")
	local lista = {}
	local vistos = {}
	local function por(caminho, tipo)
		if caminho and app.fs.isFile(caminho) and not vistos[caminho:lower()] then
			vistos[caminho:lower()] = true
			lista[#lista + 1] = { caminho = caminho, nome = app.fs.fileTitle(caminho), tipo = tipo }
		end
	end
	local scripts = app.fs.joinPath(app.fs.userConfigPath, "scripts")
	por(app.fs.joinPath(scripts, "user_dithers_pro.aseprite"), "usuario")
	local fontes = app.fs.joinPath(pasta, "sources")
	if app.fs.isDirectory(fontes) then
		local arquivos = app.fs.listFiles(fontes)
		table.sort(arquivos)
		for _, f in ipairs(arquivos) do
			if f:lower():match("%.aseprite$") then por(app.fs.joinPath(fontes, f), "exemplo") end
		end
	end
	por(app.fs.joinPath(scripts, "user_brushes_pro.aseprite"), "usuario")
	local extras = lerTexto(app.fs.joinPath(app.fs.userConfigPath, "brush_manager_paths_pro.txt"))
	if extras then
		for linha in extras:gmatch("[^\r\n]+") do por(linha, "usuario") end
	end
	return lista
end

local function acharBiblioteca(nome)
	if nome and app.fs.isFile(nome) then return nome end
	for _, b in ipairs(P.bibliotecas()) do
		if b.nome == nome then return b.caminho end
	end
	falha("biblioteca não encontrada: %s (veja pincel.bibliotecas())", tostring(nome))
end

--- Os pincéis (fatias) de uma biblioteca, ou de todas.
function P.listar(o)
	o = o or {}
	local caminhos = {}
	if o.biblioteca then
		caminhos[1] = acharBiblioteca(o.biblioteca)
	else
		for _, b in ipairs(P.bibliotecas()) do caminhos[#caminhos + 1] = b.caminho end
	end
	local pinceis = {}
	for _, caminho in ipairs(caminhos) do
		local spr, aberto = abrirSprite(caminho)
		for _, s in ipairs(spr.slices) do
			local b = s.bounds
			local nome = (s.name and s.name ~= "") and s.name or ("Brush_" .. b.width .. "x" .. b.height)
			pinceis[#pinceis + 1] = { nome = nome, largura = b.width, altura = b.height, biblioteca = app.fs.fileTitle(caminho) }
		end
		if aberto then spr:close() end
	end
	return { pinceis = pinceis, total = #pinceis }
end

--- A imagem de um pincel da biblioteca, como o Brush Manager mostra (o quadro achatado dentro da fatia).
local function imagemDoPincelBM(nome, biblioteca)
	local caminhos = {}
	if biblioteca then
		caminhos[1] = acharBiblioteca(biblioteca)
	else
		for _, b in ipairs(P.bibliotecas()) do caminhos[#caminhos + 1] = b.caminho end
	end
	for _, caminho in ipairs(caminhos) do
		local spr, aberto = abrirSprite(caminho)
		for _, s in ipairs(spr.slices) do
			local b = s.bounds
			local n = (s.name and s.name ~= "") and s.name or ("Brush_" .. b.width .. "x" .. b.height)
			if n == nome then
				local img = Image(achatar(spr, 1), Rectangle(b))
				if aberto then spr:close() end
				return img
			end
		end
		if aberto then spr:close() end
	end
	falha("pincel não encontrado: %s", tostring(nome))
end

--- A imagem de base: `pincel` (nome na biblioteca, com `biblioteca` opcional) ou `origem` (ver imagemDeOrigem).
local function baseDoPincel(o)
	if o.pincel then return imagemDoPincelBM(o.pincel, o.biblioteca) end
	if o.origem then return imagemDeOrigem(origemDo(o, o.origem)) end
	falha("diga o pincel: `pincel` = \"nome\" (da biblioteca) ou `origem` = { arquivo, retangulo | png }")
end

--- As transformações do Brush Manager, na ordem dele, sobre uma imagem RGB. Opções (todas opcionais):
---   espelhar = "flip_h" | "flip_v" | "cw" | "ccw"          aleatorio = "all" | "flip_h" | "flip_v" | "flip_hv" | "rot"
---   recolorir = { modo = "frente_fundo" | "harmonico" | "mapa" | "gradiente", frente, fundo, cores = {...},
---                 ruido, angulo, densidade (1 a 17), inverter }
---   variacao_cor = { h = graus, s = %, v = %, harmonico = bool, alfa = % }   (sorteio)
---   contorno = cor                     cobertura = { largura, altura, grade = bool }
---   escala = n | { x, y }              densidade = { valor (1 a 17), angulo, esmaecer, inverter, ruido, cor }
---   angulo = graus
function P._transformar(img, o)
	local A = algoBM()
	if o.espelhar then img = A.transformImageSimple(img, o.espelhar) end
	if o.aleatorio then img = A.getRandomTransformedImage(img, o.aleatorio == true and "all" or o.aleatorio) end
	local frente = cor(o.frente, "#000000")
	local fundo = cor(o.fundo, "#ffffff")
	if o.recolorir then
		local r = o.recolorir
		local modo = r.modo or "frente_fundo"
		local mapa = {}
		for _, c in ipairs(r.cores or {}) do mapa[#mapa + 1] = cor(c) end
		if (modo == "mapa" or modo == "gradiente") and #mapa == 0 then falha("recolorir.%s precisa de `cores`", modo) end
		img = A.createSmartRecolorImage(img, {
			fg = cor(r.frente, frente), bg = cor(r.fundo, fundo),
			useMap = modo == "mapa", mappingColors = mapa,
			isHarmonious = modo == "harmonico",
			isDensityGradient = modo == "gradiente",
			isInvertDist = r.inverter == true,
			noiseType = r.ruido or "bayer", noiseAngle = r.angulo or 0, density = r.densidade or 17,
		})
	end
	if o.variacao_cor then
		local j = o.variacao_cor
		img = A.applyColorJitterToImage(img, {
			isRandom = true, isHarmonious = j.harmonico == true,
			h = math.floor(j.h or 0), s = math.floor(j.s or 0), v = math.floor(j.v or 0),
			isAlpha = (j.alfa or 0) > 0, a = math.floor(j.alfa or 0),
		})
	end
	if o.contorno then img = A.addOutlineToImage(img, pixelDe(cor(o.contorno))) end
	local efW, efH = img.width, img.height
	if o.cobertura then
		local c = o.cobertura
		local nova, tw, th = A.applyCoverageOffset(img, math.floor(c.largura or c[1] or 0), math.floor(c.altura or c[2] or 0), c.grade == true)
		img = nova
		if c.grade then efW, efH = tw, th else efW, efH = img.width, img.height end
	end
	if o.escala then
		local sx, sy
		if type(o.escala) == "table" then sx, sy = o.escala.x or o.escala[1], o.escala.y or o.escala[2] else sx, sy = o.escala, o.escala end
		img = A.createScaledImage(img, sx, sy)
		efW, efH = math.max(1, math.floor(efW * sx)), math.max(1, math.floor(efH * sy))
	end
	if o.densidade then
		local d = o.densidade
		img = A.applyRadialDensity(img, math.floor(d.valor or 17), d.angulo or 0, d.esmaecer == true, d.inverter == true,
			pixelDe(cor(d.cor, frente)), d.ruido or "bayer", efW, efH)
	end
	if o.angulo and o.angulo ~= 0 then img = A.createRotatedImage(img, o.angulo) end
	return img
end

--- A imagem de um pincel (biblioteca ou origem), transformada; grava `imagem_png` e, com alvo, cola em (x, y).
function P.imagem(o)
	o = o or {}
	semear(o)
	local img = P._transformar(baseDoPincel(o), o)
	local resultado = { largura = img.width, altura = img.height }
	gravarImagem(img, o, resultado)
	if (o.arquivo or app.activeSprite) and o.aplicar ~= false and (o.x or o.y or o.pontos) then
		return P.carimbar(o)
	end
	return resultado
end

--- Carimba o pincel em cada ponto (`pontos`, com `espacamento` opcional), com `ancora` (padrão "centro"). As
--- transformações com sorteio (aleatorio, variacao_cor) são sorteadas de novo a cada carimbo.
function P.carimbar(o)
	o = o or {}
	semear(o)
	local base = baseDoPincel(o)
	local ctx = abrir(o, "pincel")
	local pontos = listaDePontos(o)
	local resultado = { carimbos = #pontos }
	local total = 0
	app.transaction("Extensões: pincel.carimbar", function()
		for i, p in ipairs(pontos) do
			local img = P._transformar(base, o)
			if i == 1 then gravarImagem(img, o, resultado) end
			local x, y = ancorar(img, p[1], p[2], o.ancora)
			total = total + colar(ctx, img, x, y, o)
		end
	end)
	resultado.pixels = total
	return finalizar(ctx, o, resultado)
end

local function pixelsDoCel(ctx, area)
	local cel = ctx.camada:cel(ctx.quadro)
	if not cel then falha("a camada \"%s\" não tem nada no quadro %d", ctx.camada.name, ctx.quadro) end
	local lista = {}
	local cm, transparente = ctx.spr.colorMode, ctx.spr.transparentColor
	local pos = cel.position
	for it in cel.image:pixels() do
		local v = it()
		local x, y = it.x + pos.x, it.y + pos.y
		if opaco(v, cm, transparente) and (not area or (x >= area.x and y >= area.y and x < area.x + area.width and y < area.y + area.height)) then
			lista[#lista + 1] = { x = x, y = y, colorVal = v }
		end
	end
	return lista, cel
end

-- Os efeitos de "pincel vivo" do Brush Manager, aplicados de uma vez sobre o que já está desenhado na camada.
local EFEITOS_BM = {
	grafite = function(A, cel, px, o) A.applyGraffitiToCanvas(cel, px, o.forca or 20, o.tamanho or 5) end,
	estilhaco = function(A, cel, px, o) A.applyShatterToCanvas(cel, px, o.forca or 20) end,
	glitch = function(A, cel, px, o) A.applyGlitchToCanvas(cel, px, o.forca or 20) end,
	onda = function(A, cel, px, o) A.applyDistortToCanvas(cel, px, o.forca or 20, "wave") end,
	zigue = function(A, cel, px, o) A.applyDistortToCanvas(cel, px, o.forca or 20, "zigzag") end,
	espiral = function(A, cel, px, o) A.applyDistortToCanvas(cel, px, o.forca or 20, "spiral") end,
	circulo = function(A, cel, px, o) A.applyDistortToCanvas(cel, px, o.forca or 20, "circle") end,
	magia = function(A, cel, px, o) A.applyMagicToCanvas(cel, px, o.forca or 20, o.tamanho or 1) end,
	negativo = function(A, cel, px, o)
		A.applyNegativeToCanvas(cel, px, { image = cel.image:clone(), position = cel.position }, o.forca or 100)
	end,
}

--- Efeitos do Brush Manager sobre a camada: tipo = "contorno" | "grafite" | "estilhaco" | "glitch" | "onda" | "zigue"
--- | "espiral" | "circulo" | "magia" | "negativo"; `forca` (0 a 100), `tamanho` (do pincel, para grafite e magia),
--- `retangulo` (limita), `cor` (contorno), `semente`.
function P.efeito(o)
	o = o or {}
	semear(o)
	local A = algoBM()
	local tipo = o.tipo
	if tipo ~= "contorno" and not EFEITOS_BM[tipo] then
		local nomes = { "contorno" }
		for k in pairs(EFEITOS_BM) do nomes[#nomes + 1] = k end
		table.sort(nomes)
		falha("efeito desconhecido: %s (vale %s)", tostring(tipo), table.concat(nomes, ", "))
	end
	local ctx = abrir(o, nil, { camada_existente = true })
	local area = retangulo(o.retangulo)
	local resultado = { tipo = tipo }
	app.transaction("Extensões: pincel.efeito " .. tipo, function()
		if tipo == "contorno" then
			local cel = ctx.camada:cel(ctx.quadro)
			if not cel then falha("a camada \"%s\" não tem nada no quadro %d", ctx.camada.name, ctx.quadro) end
			if area then ctx.spr.selection:select(area) else ctx.spr.selection:deselect() end
			resultado.mudou = A.applyOutlineToCanvas(ctx.spr, cel, cor(o.cor, "#000000"))
			ctx.spr.selection:deselect()
		else
			local px, cel = pixelsDoCel(ctx, area)
			resultado.pixels = #px
			EFEITOS_BM[tipo](A, cel, px, o)
		end
	end)
	return finalizar(ctx, o, resultado)
end

--- Variações de um ladrilho (generateTileVariation): `quantidade` cópias lado a lado a partir de (x, y), cada uma com
--- pixels deslocados (`deslocar`, 0 = nenhum; `expandir` deixa crescer), giradas/espelhadas (`transformar`) e com
--- `cor` = { h, s, v, harmonico, alfa } sorteada. `espaco` entre elas (padrão 1).
function P.variacoes(o)
	o = o or {}
	semear(o)
	local A = algoBM()
	local base = baseDoPincel(o)
	local ctx = abrir(o, "variacoes")
	local n = math.max(1, math.floor(o.quantidade or 4))
	local espaco = math.floor(o.espaco or 1)
	local x, y = math.floor(o.x or 0), math.floor(o.y or 0)
	local total = 0
	app.transaction("Extensões: pincel.variacoes", function()
		for _ = 1, n do
			local j = o.cor
			local img = A.generateTileVariation(base, {
				shift = math.floor(o.deslocar or 0), expand = o.expandir == true, transform = o.transformar == true,
				color = j ~= nil,
				jitter = j and { harm = j.harmonico == true, h = math.floor(j.h or 0), s = math.floor(j.s or 0),
					v = math.floor(j.v or 0), rAlpha = (j.alfa or 0) > 0, a = math.floor(j.alfa or 0) },
			})
			total = total + colar(ctx, img, x, y, o)
			x = x + img.width + espaco
		end
	end)
	return finalizar(ctx, o, { variacoes = n, pixels = total })
end

--- Acrescenta um pincel (fatia) a um arquivo de biblioteca no formato do Brush Manager: um sprite RGB com os pincéis
--- empilhados, 8 px entre eles. `biblioteca` é obrigatório (caminho .aseprite; criado se não existir). Para o pincel
--- aparecer no Brush Manager do Aseprite, aponte para %APPDATA%\Aseprite\scripts\user_brushes_pro.aseprite (só com
--- o aval do usuário: é a biblioteca dele).
function P.criar(o)
	o = o or {}
	if not o.biblioteca then falha("`biblioteca` (caminho .aseprite) é obrigatório") end
	if not o.nome or o.nome == "" then falha("`nome` do pincel é obrigatório") end
	local img = baseDoPincel(o)
	local spr, aberto
	if app.fs.isFile(o.biblioteca) then
		spr, aberto = abrirSprite(o.biblioteca)
	else
		spr = Sprite(256, 256, ColorMode.RGB)
		aberto = true
	end
	if spr.colorMode ~= ColorMode.RGB then falha("a biblioteca precisa ser RGB") end
	local nome = o.nome
	local existe = {}
	for _, s in ipairs(spr.slices) do existe[s.name] = true end
	local k = 1
	while existe[nome] do nome = o.nome .. "_" .. k; k = k + 1 end
	local y = 0
	for _, s in ipairs(spr.slices) do y = math.max(y, s.bounds.y + s.bounds.height) end
	if #spr.slices > 0 then y = y + 8 end
	local w = math.max(spr.width, img.width)
	local h = math.max(spr.height, y + img.height)
	if w ~= spr.width or h ~= spr.height then spr:crop(0, 0, w, h) end
	local camada = spr.layers[1]
	local cel = camada:cel(1)
	local base = Image(w, h, ColorMode.RGB)
	if cel then base:drawImage(cel.image, cel.position) end
	base:drawImage(img, Point(0, y))
	if cel then cel.image = base; cel.position = Point(0, 0) else spr:newCel(camada, 1, base, Point(0, 0)) end
	local fatia = spr:newSlice(Rectangle(0, y, img.width, img.height))
	fatia.name = nome
	fatia.color = Color{ r = 0, g = 255, b = 0 }
	spr:saveAs(o.biblioteca)
	if aberto then spr:close() end
	return { biblioteca = o.biblioteca, nome = nome, largura = img.width, altura = img.height }
end

-- ---------------------------------------------------------------------------------------------------------------
-- Live Brush (Devkidd): LiveBrush.lua não é módulo (tudo `local`, abre janelas). É carregado na memória num
-- ambiente próprio, com as duas janelas trocadas por tabelas vazias e uma linha `return { ... }` acrescentada no fim
-- (só na memória) que entrega as funções de imagem dele. O arquivo instalado não muda.

local sobreLB
local FUNCOES_LB = { "rotate_image", "apply_colors", "get_flipped_image", "find_disjoint_selection_rects" }

local function liveBrush()
	if caches.lb then return caches.lb end
	local pasta = exigir("livebrush")
	sobreLB = { fgColor = Color{ r = 0, g = 0, b = 0 }, bgColor = Color{ r = 255, g = 255, b = 255 } }
	local ambiente
	local janelaVazia = setmetatable({}, { __index = function() return function() end end })
	local function dofileLB(caminho)
		local nome = app.fs.fileName(caminho)
		if nome == "LiveBrushSetDialog.lua" or nome == "LiveBrushHelpDialog.lua" then return janelaVazia end
		return carregarEm(ambiente, app.fs.joinPath(pasta, nome))()
	end
	ambiente = setmetatable({ dofile = dofileLB, app = appSobreposto(sobreLB) }, { __index = _G })
	local exporta = "return { " .. table.concat((function()
		local t = {}
		for _, n in ipairs(FUNCOES_LB) do t[#t + 1] = n .. " = " .. n end
		return t
	end)(), ", ") .. " }"
	local lb = carregarEm(ambiente, app.fs.joinPath(pasta, "LiveBrush.lua"), exporta)()
	for _, n in ipairs(FUNCOES_LB) do
		if type(lb[n]) ~= "function" then falha("o Live Brush não tem mais a função %s", n) end
	end
	caches.lb = lb
	return lb
end

local L = {}
E.livebrush = L

--- Gira um pedaço da camada no lugar, pelo giro do Live Brush (vizinho mais próximo, sem misturar cores, centrado
--- numa tela quadrada). `retangulo` (padrão: o conteúdo do quadro), `angulo` em graus.
function L.girar(o)
	o = o or {}
	local lb = liveBrush()
	local ctx = abrir(o, nil, { camada_existente = true })
	local cel = ctx.camada:cel(ctx.quadro)
	if not cel then falha("a camada \"%s\" não tem nada no quadro %d", ctx.camada.name, ctx.quadro) end
	local area = retangulo(o.retangulo) or Rectangle(cel.bounds)
	local resultado = { angulo = o.angulo or 0, retangulo = tabelaRet(area) }
	app.transaction("Extensões: livebrush.girar", function()
		local pedaco = imagemVazia(ctx.spr, area.width, area.height)
		pedaco:drawImage(cel.image, Point(cel.position.x - area.x, cel.position.y - area.y))
		local girado = lb.rotate_image(pedaco, o.angulo or 0)
		colar(ctx, imagemVazia(ctx.spr, area.width, area.height), area.x, area.y, { modo = "substituir" })
		local gx = area.x + math.floor((area.width - girado.width) / 2)
		local gy = area.y + math.floor((area.height - girado.height) / 2)
		resultado.pixels = colar(ctx, girado, gx, gy, {})
		gravarImagem(girado, o, resultado)
	end)
	return finalizar(ctx, o, resultado)
end

--- Folha girada (o "Rotate Set" da grade): cada célula de `grade` = { largura, altura } dentro de `retangulo` é
--- girada no lugar por passo * índice, com passo = 360 / número de células. Bom para itens que giram.
function L.folha_girada(o)
	o = o or {}
	local lb = liveBrush()
	local ctx = abrir(o, nil, { camada_existente = true })
	local cel = ctx.camada:cel(ctx.quadro)
	if not cel then falha("a camada \"%s\" não tem nada no quadro %d", ctx.camada.name, ctx.quadro) end
	local area = retangulo(o.retangulo) or Rectangle(ctx.spr.bounds)
	local g = o.grade or {}
	local gw, gh = math.floor(g.largura or g[1] or 16), math.floor(g.altura or g[2] or gw)
	local colunas, linhas = math.floor(area.width / gw), math.floor(area.height / gh)
	local n = colunas * linhas
	if n == 0 then falha("o retângulo é menor que uma célula da grade") end
	local passo = 360 / n
	local fonte = cel.image:clone()
	local fpos = cel.position
	local vazio = imagemVazia(ctx.spr, gw, gh)
	app.transaction("Extensões: livebrush.folha_girada", function()
		for linha = 0, linhas - 1 do
			for coluna = 0, colunas - 1 do
				local i = linha * colunas + coluna
				local cx, cy = area.x + coluna * gw, area.y + linha * gh
				local pedaco = imagemVazia(ctx.spr, gw, gh)
				pedaco:drawImage(fonte, Point(fpos.x - cx, fpos.y - cy))
				local girado = lb.rotate_image(pedaco, passo * i)
				colar(ctx, vazio, cx, cy, { modo = "substituir" })
				colar(ctx, girado, cx + math.floor((gw - girado.width) / 2), cy + math.floor((gh - girado.height) / 2), {})
			end
		end
	end)
	return finalizar(ctx, o, { celulas = n, passo = passo })
end

--- O conjunto de pincéis do Live Brush, como imagens RGB: da `origem` (arquivo, camada, retangulo), cortado por
--- `grade` = { largura, altura }, por `regioes` = { {x,y,w,h}, ... } (cada retângulo separado da seleção, como o
--- "Set from Separate Selection") ou por `quadros` = { 1, 2, ... } (o mesmo retângulo em vários quadros).
local function conjuntoLB(o)
	local lb = liveBrush()
	local origem = origemDo(o, o.origem or {})
	local imagens = {}
	if o.quadros then
		for _, q in ipairs(o.quadros) do
			local c = {}
			for k, v in pairs(origem) do c[k] = v end
			c.quadro = q
			imagens[#imagens + 1] = imagemDeOrigem(c)
		end
		return imagens
	end
	local tudo = imagemDeOrigem({ arquivo = origem.arquivo, camada = origem.camada, quadro = origem.quadro, png = origem.png, inteiro = true })
	local area = retangulo(origem.retangulo) or Rectangle(0, 0, tudo.width, tudo.height)
	local rets = {}
	if o.grade then
		local gw = math.floor(o.grade.largura or o.grade[1])
		local gh = math.floor(o.grade.altura or o.grade[2] or gw)
		for y = area.y, area.y + area.height - 1, gh do
			for x = area.x, area.x + area.width - 1, gw do
				rets[#rets + 1] = Rectangle(x, y, math.min(gw, area.x + area.width - x), math.min(gh, area.y + area.height - y))
			end
		end
	elseif o.regioes then
		local sel = Selection()
		for _, r in ipairs(o.regioes) do sel:add(retangulo(r)) end
		rets = lb.find_disjoint_selection_rects(sel)
	else
		-- Um pincel só: sem retângulo, o que está desenhado (aparado), não o sprite inteiro.
		if not origem.retangulo then
			local util = tudo:shrinkBounds()
			if not util.isEmpty then area = util end
		end
		rets[1] = area
	end
	for _, r in ipairs(rets) do
		local img = Image(tudo, r)
		if not img:isEmpty() or o.manter_vazios then imagens[#imagens + 1] = img end
	end
	return imagens
end

--- Corta o conjunto e grava cada pincel em `imagens_png` (um padrão com %d, ex. "C:/tmp/pincel_%d.png").
function L.conjunto(o)
	o = o or {}
	local imagens = conjuntoLB(o)
	local lista = {}
	for i, img in ipairs(imagens) do
		local item = { largura = img.width, altura = img.height }
		if o.imagens_png then
			item.png = string.format(o.imagens_png, i)
			img:saveAs(item.png)
		end
		lista[i] = item
	end
	return { total = #imagens, pinceis = lista }
end

--- Carimba o conjunto do Live Brush nos `pontos`, trocando de pincel como ele troca a cada traço:
---   sequencia = "fixo" | "frente" | "tras" | "vaivem" | "aleatorio" (padrão "frente"), repeticao = n (troca a cada n)
---   tamanho = { x%, y% } (100), tamanho_aleatorio = { min%, max% }, travar_proporcao (padrão true)
---   espelhar_h, espelhar_v, espelho_aleatorio_h, espelho_aleatorio_v
---   rotacao (graus), rotacao_passo (soma a cada carimbo), rotacao_aleatoria = { min, max }
---   deslocamento_aleatorio = raio em px
---   cor_frente / cor_fundo: pinta o pincel como o Live Brush faz ao trocar a cor (uma cor: tudo; duas: frente e fundo)
function L.carimbar(o)
	o = o or {}
	semear(o)
	local lb = liveBrush()
	local imagens = conjuntoLB(o)
	if #imagens == 0 then falha("o conjunto ficou vazio (a origem não tem pixels nas regiões)") end
	local ctx = abrir(o, "livebrush")
	local pontos = listaDePontos(o)
	local seq = o.sequencia or "frente"
	local repeticao = math.max(1, math.floor(o.repeticao or 1))
	local idx, direcao, usos = 1, 1, 0
	local rotacao = o.rotacao or 0
	local travar = o.travar_proporcao ~= false
	for i, img in ipairs(imagens) do imagens[i] = noModoDo(img, ctx.spr) end
	sobreLB.fgColor = cor(o.cor_frente, "#000000")
	sobreLB.bgColor = cor(o.cor_fundo, "#ffffff")
	local total = 0
	app.transaction("Extensões: livebrush.carimbar", function()
		for n, p in ipairs(pontos) do
			if n > 1 and #imagens > 1 then
				if seq == "aleatorio" then
					idx = math.random(1, #imagens)
				elseif seq ~= "fixo" then
					usos = usos + 1
					if usos >= repeticao then
						usos = 0
						if seq == "frente" then
							idx = idx % #imagens + 1
						elseif seq == "tras" then
							idx = (idx - 2 + #imagens) % #imagens + 1
						elseif seq == "vaivem" then
							idx = idx + direcao
							if idx > #imagens then direcao, idx = -1, #imagens - 1 elseif idx < 1 then direcao, idx = 1, 2 end
						else
							falha("sequencia inválida: %s", tostring(seq))
						end
					end
				end
			end
			local img = imagens[idx]:clone()
			if o.cor_frente or o.cor_fundo then lb.apply_colors(img, o.cor_frente ~= nil, o.cor_fundo ~= nil) end
			local sx, sy = 100, 100
			if o.tamanho then sx, sy = o.tamanho.x or o.tamanho[1] or 100, o.tamanho.y or o.tamanho[2] or o.tamanho[1] or 100 end
			if o.tamanho_aleatorio then
				local a, b = math.floor(o.tamanho_aleatorio[1]), math.floor(o.tamanho_aleatorio[2])
				sx = math.random(math.min(a, b), math.max(a, b))
				sy = travar and sx or math.random(math.min(a, b), math.max(a, b))
			end
			if sx ~= 100 or sy ~= 100 then
				img:resize(math.max(1, math.floor(img.width * sx / 100)), math.max(1, math.floor(img.height * sy / 100)))
			end
			local fh = o.espelhar_h == true
			local fv = o.espelhar_v == true
			if o.espelho_aleatorio_h then fh = math.random(0, 1) == 1 end
			if o.espelho_aleatorio_v then fv = math.random(0, 1) == 1 end
			if fh or fv then img = lb.get_flipped_image(img, fh, fv) end
			local giro = rotacao
			if o.rotacao_aleatoria then
				local a, b = math.floor(o.rotacao_aleatoria[1]), math.floor(o.rotacao_aleatoria[2])
				giro = giro + math.random(math.min(a, b), math.max(a, b))
			end
			if giro ~= 0 then img = lb.rotate_image(img, giro) end
			if o.rotacao_passo then rotacao = (rotacao + o.rotacao_passo + 180) % 360 - 180 end
			local dx, dy = 0, 0
			if o.deslocamento_aleatorio and o.deslocamento_aleatorio > 0 then
				local raio = math.random(0, math.floor(o.deslocamento_aleatorio))
				local ang = math.random() * math.pi * 2
				dx, dy = math.floor(math.cos(ang) * raio + 0.5), math.floor(math.sin(ang) * raio + 0.5)
			end
			local x, y = ancorar(img, p[1] + dx, p[2] + dy, o.ancora)
			total = total + colar(ctx, img, x, y, o)
		end
	end)
	return finalizar(ctx, o, { carimbos = #pontos, pinceis = #imagens, pixels = total })
end

-- ---------------------------------------------------------------------------------------------------------------
-- Carbs Toolbar (CarbsCode): carbs-toolbar.lua define funções globais CarbsToolbar_MAIN_* e monta a janela no fim.
-- É carregado num ambiente próprio com uma `Dialog` de mentira (guarda os valores dos campos em `.data`, que o
-- adaptador muda antes de cada chamada), o plugin dado como aberto (para as funções lerem as opções da janela) e um
-- `app` sobreposto (cor de frente, área de transferência e avisos não tocam o Aseprite do usuário). As funções em si
-- são as dele; a maioria chama comandos do Aseprite (Outline, CanvasSize, ExportSpriteSheet...), que rodam em lote.

local function carbs()
	if caches.carbs then return caches.carbs end
	local pasta = exigir("carbs")
	local estado = { dados = nil, avisos = {} }
	-- RemoveFrameTag precisa da linha do tempo: em lote derruba o Aseprite (falha de segmentação, 2026-10-22). Troca
	-- pelo deleteTag da API, que faz o mesmo sem janela; os outros comandos passam direto.
	local comandos = setmetatable({
		RemoveFrameTag = function(t)
			local spr = app.activeSprite
			for _, tag in ipairs(spr.tags) do
				if tag.name == t.name then
					spr:deleteTag(tag)
					return
				end
			end
		end,
	}, { __index = function(_, k) return app.command[k] end })
	local sobre = {
		fgColor = Color{ r = 0, g = 0, b = 0 },
		bgColor = Color{ r = 255, g = 255, b = 255 },
		command = comandos,
		clipboard = { text = "" },
		tip = function() end,
		alert = function(t)
			local texto = type(t) == "table" and (t.title or "") .. ": " .. (type(t.text) == "table" and table.concat(t.text, " ") or tostring(t.text or "")) or tostring(t)
			estado.avisos[#estado.avisos + 1] = texto
			return 2
		end,
	}
	local function DialogFalsa(arg)
		local titulo = type(arg) == "table" and arg.title or arg
		local dados = {}
		local d = {}
		setmetatable(d, {
			__index = function(_, k)
				if k == "data" then return dados end
				if k == "bounds" then return rawget(d, "_limites") or Rectangle(0, 0, 100, 100) end
				return function(self, w)
					if type(w) == "table" and w.id then
						local v = w.selected
						if v == nil then v = w.value end
						if v == nil then v = w.color end
						if v == nil then v = w.option end
						if k ~= "modify" then
							if v == nil then v = w.text end
							if dados[w.id] == nil then dados[w.id] = v end
						elseif v ~= nil then
							dados[w.id] = v
						end
					end
					return self
				end
			end,
			__newindex = function(_, k, v)
				if k == "bounds" then rawset(d, "_limites", v) else rawset(d, k, v) end
			end,
		})
		if type(titulo) == "string" and titulo:find("^Carbs Toolbar") then estado.dados = dados end
		return d
	end
	local ambiente
	ambiente = setmetatable({
		app = appSobreposto(sobre),
		Dialog = DialogFalsa,
		CarbsToolbar_PLUGIN_GetIsOpen = function() return true end,
		CarbsToolbar_PLUGIN_SetIsOpen = function() end,
		dofile = function(caminho) return carregarEm(ambiente, caminho)() end,
		loadfile = function(caminho) return carregarEm(ambiente, caminho) end,
	}, { __index = _G })
	carregarEm(ambiente, app.fs.joinPath(pasta, "carbs-toolbar.lua"))({})
	if not estado.dados then falha("o Carbs Toolbar não montou a janela principal (mudou a estrutura?)") end
	estado.dados.chk_show_tips = false
	caches.carbs = { amb = ambiente, estado = estado, sobre = sobre }
	return caches.carbs
end

local C = {}
E.carbs = C

--- Prepara o alvo, a seleção (`retangulo`; sem ele, o sprite todo) e as opções da janela; chama a função do Carbs.
local function chamarCarbs(o, nomeFuncao, opcoes, args)
	local c = carbs()
	local f = c.amb[nomeFuncao]
	if type(f) ~= "function" then falha("o Carbs Toolbar não tem mais %s", nomeFuncao) end
	local ctx = abrir(o, opcoes.criar_camada, { camada_existente = opcoes.criar_camada == nil })
	local area = retangulo(o.retangulo)
	if area then
		ctx.spr.selection:select(area)
	elseif opcoes.sem_selecao then
		ctx.spr.selection:deselect()
	else
		ctx.spr.selection:select(ctx.spr.bounds)
	end
	for k, v in pairs(opcoes.dados or {}) do c.estado.dados[k] = v end
	c.estado.avisos = {}
	c.sobre.clipboard = { text = "" }
	f(table.unpack(args or {}))
	return ctx, c
end

local function comAvisos(c, resultado)
	if #c.estado.avisos > 0 then resultado.avisos = c.estado.avisos end
	return resultado
end

local function contornoCarbs(nome, funcao)
	return function(o)
		o = o or {}
		local c = carbs()
		local pinta = cor(o.cor, "#000000")
		c.sobre.fgColor = pinta
		local real = app.fgColor
		-- O comando Fill (contorno interno) usa a cor de frente de verdade: troca e devolve logo depois.
		if funcao == "CarbsToolbar_MAIN_QuickInlineSelection" then app.fgColor = pinta end
		local ok, ctx = pcall(chamarCarbs, o, funcao, { dados = { sld_outline_thickness = math.floor(o.espessura or 1) } })
		if funcao == "CarbsToolbar_MAIN_QuickInlineSelection" then app.fgColor = real end
		if not ok then error(ctx, 0) end
		ctx.spr.selection:deselect()
		return finalizar(ctx, o, comAvisos(c, { acao = nome, espessura = o.espessura or 1, cor = hex(pinta) }))
	end
end

--- Contorno por fora (Quick Outline): `espessura` px, `cor`, na `camada` existente; `retangulo` limita.
C.contorno = contornoCarbs("contorno", "CarbsToolbar_MAIN_QuickOutlineSelection")
--- Contorno por dentro (Quick Inline): pinta a borda interna do conteúdo da seleção.
C.contorno_interno = contornoCarbs("contorno_interno", "CarbsToolbar_MAIN_QuickInlineSelection")
--- Sombra (Quick Shadow): contorno só para baixo e para a direita.
C.sombra = contornoCarbs("sombra", "CarbsToolbar_MAIN_QuickShadowFromSelection")

--- Encolhe a seleção (`retangulo`, ou o sprite) até o conteúdo da camada; devolve o retângulo. Não grava.
function C.encolher_selecao(o)
	o = o or {}
	local ctx, c = chamarCarbs(o, "CarbsToolbar_MAIN_ShrinkWrap", {})
	local r = tabelaRet(ctx.spr.selection.bounds)
	ctx.spr.selection:deselect()
	return finalizar(ctx, o, comAvisos(c, { retangulo = r }), false)
end

--- Aumenta a tela pelo tamanho de `retangulo` (ou `largura`/`altura`) nas direções pedidas:
--- cima, baixo, esquerda, direita (bool).
function C.expandir_tela(o)
	o = o or {}
	if not o.retangulo then
		o.retangulo = { 0, 0, o.largura or 16, o.altura or o.largura or 16 }
	end
	if not (o.cima or o.baixo or o.esquerda or o.direita) then falha("diga a direção: cima, baixo, esquerda e/ou direita") end
	local ctx, c = chamarCarbs(o, "CarbsToolbar_MAIN_ExpandCanvas", {},
		{ o.cima == true, o.baixo == true, o.esquerda == true, o.direita == true })
	ctx.spr.selection:deselect()
	return finalizar(ctx, o, comAvisos(c, { largura = ctx.spr.width, altura = ctx.spr.height }))
end

--- Camada nova com grade isométrica 2:1, 3:1 ou 4:1 em duas cores (`cor1`, `cor2`), criada acima de `camada` (ou
--- da camada ativa); `nome_camada` troca o nome que o Carbs dá ("2:1 Isometric Grid").
function C.grade_iso(o)
	o = o or {}
	local funcoes = { ["2:1"] = "CarbsToolbar_MAIN_Create2To1Iso", ["3:1"] = "CarbsToolbar_MAIN_Create3To1Iso", ["4:1"] = "CarbsToolbar_MAIN_Create4To1Iso" }
	local proporcao = o.proporcao or "2:1"
	if not funcoes[proporcao] then falha("proporcao inválida: %s (2:1, 3:1 ou 4:1)", tostring(proporcao)) end
	local ctx, c = chamarCarbs(o, funcoes[proporcao], {
		dados = { col_iso_fg_color = cor(o.cor1, "#ffffff"), col_iso_bg_color = cor(o.cor2, "#000000") },
	})
	local criada = app.activeLayer
	if o.nome_camada then criada.name = o.nome_camada end
	ctx.camada = criada
	ctx.spr.selection:deselect()
	return finalizar(ctx, o, comAvisos(c, { proporcao = proporcao }))
end

--- Pinta as cores da paleta, uma por pixel, a partir do canto do `retangulo` (a largura dele dá as colunas).
function C.paleta_em_pixels(o)
	o = o or {}
	if not o.retangulo then falha("`retangulo` é obrigatório (canto e largura das linhas)") end
	local ctx, c = chamarCarbs(o, "CarbsToolbar_MAIN_PlacePaletteInSelectionPixels", { criar_camada = "paleta" })
	ctx.spr.selection:deselect()
	return finalizar(ctx, o, comAvisos(c, { cores = #ctx.spr.palettes[1] }))
end

--- Fatia (slice) do tamanho do `retangulo`; `nome` troca o "Slice N" do Carbs, `cor` a cor da fatia.
function C.fatia(o)
	o = o or {}
	if not o.retangulo then falha("`retangulo` é obrigatório") end
	local dados = {}
	if o.cor then dados.col_slice_selection = cor(o.cor) end
	local ctx, c = chamarCarbs(o, "CarbsToolbar_MAIN_CreateSliceFromSelection", { dados = dados })
	local fatia = ctx.spr.slices[#ctx.spr.slices]
	if o.nome and fatia then fatia.name = o.nome end
	ctx.spr.selection:deselect()
	return finalizar(ctx, o, comAvisos(c, { fatia = fatia and fatia.name }))
end

--- Exporta as fatias do sprite para a pasta dele (o Carbs grava ao lado do .aseprite): formato = "png" | "folha" |
--- "gif". Opções: quadro_unico, tag_atual, camadas_separadas, numeros_absolutos (png); gif_tag_atual,
--- gif_tags_separadas, gif_camadas_separadas. Não grava o sprite. Devolve os arquivos novos.
function C.exportar_fatias(o)
	o = o or {}
	local funcoes = { png = "CarbsToolbar_MAIN_ExportSlicesAsPngTrans", folha = "CarbsToolbar_MAIN_ExportSlicesAsSpritesheetTrans",
		gif = "CarbsToolbar_MAIN_ExportSlicesAsGifTrans" }
	local formato = o.formato or "png"
	if not funcoes[formato] then falha("formato inválido: %s (png, folha ou gif)", tostring(formato)) end
	local spr = o.arquivo and abrirSprite(o.arquivo) or app.activeSprite
	if not spr or spr.filename == "" then falha("o sprite precisa ter arquivo (as fatias vão para a pasta dele)") end
	if #spr.slices == 0 then falha("o sprite não tem fatias") end
	local pasta = app.fs.filePath(spr.filename)
	local antes = {}
	for _, f in ipairs(app.fs.listFiles(pasta)) do antes[f] = true end
	local ctx, c = chamarCarbs(o, funcoes[formato], {
		sem_selecao = true,
		dados = {
			chk_export_slices_is_frame = o.quadro_unico == true,
			chk_export_slices_is_tag = o.tag_atual == true,
			chk_export_slices_is_split_layers = o.camadas_separadas == true,
			chk_export_slices_is_absolute_frame_numbers = o.numeros_absolutos == true,
			chk_export_slices_gifs_single_tag = o.gif_tag_atual == true,
			chk_export_slices_gifs_split_tag = o.gif_tags_separadas == true,
			chk_export_slices_gifs_split_layers = o.gif_camadas_separadas == true,
		},
	})
	local novos = {}
	for _, f in ipairs(app.fs.listFiles(pasta)) do
		if not antes[f] then novos[#novos + 1] = app.fs.joinPath(pasta, f) end
	end
	table.sort(novos)
	return finalizar(ctx, o, comAvisos(c, { formato = formato, arquivos = novos }), false)
end

--- Os pixels da seleção como texto (tabela Lua com x, y e, com `cores = true`, as cores), como o "Copy Pixels As
--- Text" do Carbs, mas devolvido aqui em vez de ir para a área de transferência. Não grava.
function C.pixels_texto(o)
	o = o or {}
	if not o.retangulo then falha("`retangulo` é obrigatório") end
	local ctx, c = chamarCarbs(o, "CarbsToolbar_MAIN_CopyPixelCordsWithDataToClipboard", {}, { o.cores == true })
	local texto = c.sobre.clipboard.text
	ctx.spr.selection:deselect()
	return finalizar(ctx, o, comAvisos(c, { texto = texto }), false)
end

--- Grade do sprite com o tamanho e a posição do `retangulo` (Set Grid); sem retângulo, 16 px (Reset Grids).
function C.grade(o)
	o = o or {}
	local ctx, c
	if o.retangulo then
		ctx, c = chamarCarbs(o, "CarbsToolbar_MAIN_SetGrid", {})
	else
		ctx, c = chamarCarbs(o, "CarbsToolbar_MAIN_ResetGrids", { sem_selecao = true })
	end
	local g = tabelaRet(ctx.spr.gridBounds)
	ctx.spr.selection:deselect()
	return finalizar(ctx, o, comAvisos(c, { grade = g }))
end

-- ---------------------------------------------------------------------------------------------------------------
-- Conferência e chamada por nome

--- Para cada extensão: instalada, versão, se o adaptador carrega e acha as funções dela.
function E.verificar()
	local saida = {}
	local carregar = { dithering = algoDG, pincel = algoBM, livebrush = liveBrush, carbs = carbs }
	for chave, info in pairs(EXTENSOES) do
		local item = { nome = info.nome, autor = info.autor, pasta = pastaDe(chave), esperada = info.versao }
		local ok, pasta, versao = pcall(exigir, chave)
		if ok then
			item.versao = versao
			local ok2, erro = pcall(carregar[chave])
			item.ok = ok2
			if not ok2 then item.erro = tostring(erro) end
		else
			item.ok = false
			item.erro = tostring(pasta)
		end
		saida[chave] = item
	end
	return saida
end

E.ACOES = {
	"verificar",
	"dithering.faixa", "dithering.gradiente", "dithering.matriz", "dithering.preencher",
	"pincel.bibliotecas", "pincel.listar", "pincel.imagem", "pincel.carimbar", "pincel.efeito", "pincel.variacoes", "pincel.criar",
	"livebrush.girar", "livebrush.folha_girada", "livebrush.conjunto", "livebrush.carimbar",
	"carbs.contorno", "carbs.contorno_interno", "carbs.sombra", "carbs.encolher_selecao", "carbs.expandir_tela",
	"carbs.grade_iso", "carbs.paleta_em_pixels", "carbs.fatia", "carbs.exportar_fatias", "carbs.pixels_texto", "carbs.grade",
}

-- ---------------------------------------------------------------------------------------------------------------
-- Ferramentas nossas (ferramentas.lua, 2026-10-22): o que as extensões só fazem com janela, refeito com a API do
-- Aseprite (biblioteca de pincéis, pincéis de várias camadas, traço que gira o pincel, conjuntos salvos, pincel ativo,
-- cópias deslocadas/giradas/redimensionadas, exportações, ajuste de cor, biblioteca de matrizes). Usa as utilidades
-- daqui; as ações entram em E.ACOES e no E.chamar como as outras.

E._util = {
	falha = falha, lerTexto = lerTexto, cor = cor, pixelDe = pixelDe, hex = hex, retangulo = retangulo,
	tabelaRet = tabelaRet, ponto = ponto, semear = semear, opaco = opaco, emRGB = emRGB, noModoDo = noModoDo,
	imagemVazia = imagemVazia, acharCamada = acharCamada, caminhoIgual = caminhoIgual, abrirSprite = abrirSprite,
	abrir = abrir, colar = colar, achatar = achatar, finalizar = finalizar, imagemDeOrigem = imagemDeOrigem,
	origemDo = origemDo, gravarImagem = gravarImagem, ancorar = ancorar,
}

do
	local fonte = debug.getinfo(1, "S").source
	if fonte:sub(1, 1) == "@" then fonte = fonte:sub(2) end
	local registrar = dofile(app.fs.joinPath(app.fs.filePath(fonte), "ferramentas.lua"))
	registrar(E, E._util)
end

--- Chama uma ação pelo nome ("dithering.preencher", "verificar"...).
function E.chamar(acao, opcoes)
	if acao == "verificar" then return E.verificar() end
	if acao == "acoes" then return E.ACOES end
	local grupo, nome = tostring(acao):match("^(%w+)%.([%w_]+)$")
	local tabela = grupo and E[grupo]
	local f = tabela and type(tabela) == "table" and nome:sub(1, 1) ~= "_" and tabela[nome]
	if type(f) ~= "function" then falha("ação desconhecida: %s (vale %s)", tostring(acao), table.concat(E.ACOES, ", ")) end
	return f(opcoes or {})
end

return E
