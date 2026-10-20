-- Diorama: extensão do Aseprite que liga o editor à ponte do Haywood Valley.
--
-- Abre um WebSocket em ws://127.0.0.1:34873/ws?cliente=aseprite (reconecta sozinho a cada 3 s), se apresenta com
-- `ola` e responde aos comandos da ponte: ping, sprite_atual, abrir, abrir_regiao, salvar_regiao, exportar, paleta
-- e pixel. O contrato está em docs/diorama/CONEXOES.md (seção 3); o uso, em docs/diorama/ASEPRITE.md.
--
-- Tudo fica neste arquivo de propósito: o Aseprite pede permissão (WebSocket, gravar arquivo) por arquivo de script,
-- então um arquivo só significa um aviso só ("Dar confiança total a este script").
--
-- Também roda fora da interface (aseprite -b --script): `dofile` deste arquivo devolve a tabela M, com os comandos
-- prontos para chamar. É assim que os testes em lote conferem a lógica sem a ponte.

local VERSAO = "0.1.0"
local RAIZ_PADRAO = [[C:\Users\Szortek\Documents\Haywood-Valley]]
local URL_PADRAO = "ws://127.0.0.1:34873/ws?cliente=aseprite"
local TILE = 16
local ESPERA_RECONEXAO = 3 -- segundos

local M = { VERSAO = VERSAO }

-- Preferências: no Aseprite com interface, `plugin.preferences` (salvas pelo Aseprite em __pref.lua, na pasta da
-- extensão); fora dele, uma tabela comum.
local prefs = {}

--- Para os testes em lote: muda uma preferência (raiz, url).
function M.definir(nome, valor)
	prefs[nome] = valor
end

-- ---------------------------------------------------------------------------------------------------------------
-- Utilidades

--- Tira o "arquivo:linha: " que o Lua põe na frente das mensagens de erro.
local function limparErro(e)
	local texto = tostring(e)
	return (texto:gsub("^[^\n]-%.lua:%d+: ", ""))
end

local function inteiro(v, nome)
	local n = tonumber(v)
	if n == nil or n ~= math.floor(n) then
		error(nome .. " precisa ser um número inteiro", 0)
	end
	return math.floor(n)
end

-- Diagnóstico: com a variável de ambiente DIORAMA_LOG apontando para um arquivo, a conexão anota ali o que acontece.
local arquivoLog = nil
do
	local ok, v = pcall(os.getenv, "DIORAMA_LOG")
	if ok and type(v) == "string" and v ~= "" then
		arquivoLog = v
	end
end

local function registrar(texto)
	if arquivoLog == nil then
		return
	end
	pcall(function()
		local f = io.open(arquivoLog, "a")
		f:write(os.date("%H:%M:%S "), texto, "\n")
		f:close()
	end)
end

local function raiz()
	local r = prefs.raiz
	if type(r) ~= "string" or r == "" then
		r = RAIZ_PADRAO
	end
	return r
end
M.raiz = raiz

local function urlPonte()
	local ok, env = pcall(os.getenv, "DIORAMA_PONTE_URL")
	if ok and type(env) == "string" and env ~= "" then
		return env
	end
	local u = prefs.url
	if type(u) == "string" and u ~= "" then
		return u
	end
	return URL_PADRAO
end
M.urlPonte = urlPonte

local function absoluto(p)
	return p:match("^%a:[\\/]") ~= nil or p:match("^[\\/][\\/]") ~= nil
end

--- Caminho de arquivo: relativo à raiz do repositório (o normal) ou absoluto.
local function caminho(p)
	if type(p) ~= "string" or p == "" then
		error("falta o caminho do arquivo", 0)
	end
	if absoluto(p) then
		return app.fs.normalizePath(p)
	end
	return app.fs.normalizePath(app.fs.joinPath(raiz(), p))
end
M.caminho = caminho

local function validarFolha(folha)
	if type(folha) ~= "string" or not folha:match("^[%w_]+$") then
		error("nome de folha inválido: " .. tostring(folha), 0)
	end
	return folha
end

local function arquivoFolha(folha)
	return app.fs.joinPath(raiz(), "diorama", "folhas", validarFolha(folha) .. ".png")
end

--- A área em tiles {coluna, linha, largura, altura}, vinda do JSON (userdata) ou de uma tabela Lua.
local function lerArea(a)
	if a == nil then
		return nil
	end
	local ok, n = pcall(function()
		return #a
	end)
	if not ok or n ~= 4 then
		error("área precisa ser [coluna, linha, largura, altura]", 0)
	end
	local area = {
		inteiro(a[1], "coluna"),
		inteiro(a[2], "linha"),
		inteiro(a[3], "largura"),
		inteiro(a[4], "altura"),
	}
	if area[1] < 0 or area[2] < 0 or area[3] < 1 or area[4] < 1 then
		error("área fora da folha", 0)
	end
	return area
end

local function cor(c)
	local pc = app.pixelColor
	return string.format("#%02X%02X%02X%02X", pc.rgbaR(c), pc.rgbaG(c), pc.rgbaB(c), pc.rgbaA(c))
end

local function lerCor(texto)
	if type(texto) ~= "string" then
		error("cor precisa ser texto #RRGGBB ou #RRGGBBAA", 0)
	end
	local h = texto:gsub("^#", "")
	if #h ~= 6 and #h ~= 8 then
		error("cor inválida: " .. texto, 0)
	end
	local function canal(i)
		local v = tonumber(h:sub(i, i + 1), 16)
		if v == nil then
			error("cor inválida: " .. texto, 0)
		end
		return v
	end
	local a = #h == 8 and canal(7) or 255
	return app.pixelColor.rgba(canal(1), canal(3), canal(5), a)
end

local function carregarImagem(arquivo)
	if not app.fs.isFile(arquivo) then
		error("arquivo não existe: " .. arquivo, 0)
	end
	local img = Image{ fromFile = arquivo }
	if img == nil then
		error("não consegui ler " .. arquivo, 0)
	end
	if img.colorMode ~= ColorMode.RGB then
		error(arquivo .. " não está em RGBA; a extensão só mexe em folhas RGBA", 0)
	end
	return img
end

--- O sprite inteiro achatado (camadas visíveis do quadro atual) numa imagem RGBA.
local function achatar(spr)
	local quadro = 1
	if app.sprite == spr and app.frame then
		quadro = app.frame.frameNumber
	end
	local img = Image(spr.width, spr.height, ColorMode.RGB)
	img:drawSprite(spr, quadro)
	return img
end

local function spriteAtivo()
	local spr = app.sprite
	if spr == nil then
		error("nenhum sprite aberto no Aseprite", 0)
	end
	return spr
end

--- De onde veio o sprite: propriedades gravadas por abrir_regiao; senão, o nome `folha@coluna,linha`.
local function origemDoSprite(spr)
	local ok, p = pcall(function()
		return spr.properties.diorama
	end)
	if ok and type(p) == "table" and type(p.folha) == "string" and type(p.area) == "table" then
		return p.folha, { p.area[1], p.area[2], p.area[3], p.area[4] }
	end
	local titulo = app.fs.fileTitle(spr.filename or "")
	local folha, c, l = titulo:match("^([%w_]+)@(%d+),(%d+)$")
	if folha then
		if spr.width % TILE ~= 0 or spr.height % TILE ~= 0 then
			error("o sprite " .. titulo .. " não tem tamanho múltiplo de " .. TILE, 0)
		end
		return folha, { tonumber(c), tonumber(l), spr.width // TILE, spr.height // TILE }
	end
	return nil, nil
end

local function infoSprite(spr)
	local camadas = {}
	for i, camada in ipairs(spr.layers) do
		camadas[i] = camada.name
	end
	local modos = { [ColorMode.RGB] = "rgb", [ColorMode.GRAY] = "cinza", [ColorMode.INDEXED] = "indexado" }
	local info = {
		arquivo = spr.filename,
		nome = app.fs.fileName(spr.filename or ""),
		largura = spr.width,
		altura = spr.height,
		modo = modos[spr.colorMode] or tostring(spr.colorMode),
		camadas = camadas,
		quadros = #spr.frames,
		modificado = spr.isModified,
	}
	if app.sprite == spr then
		if app.layer then
			info.camada = app.layer.name
		end
		if app.frame then
			info.quadro = app.frame.frameNumber
		end
	end
	if not spr.selection.isEmpty then
		local b = spr.selection.bounds
		info.selecao = { b.x, b.y, b.width, b.height }
	end
	local folha, area = origemDoSprite(spr)
	if folha then
		info.origem = { folha = folha, area = area }
	end
	return info
end

-- ---------------------------------------------------------------------------------------------------------------
-- Comandos (os mesmos nomes do contrato). Cada um recebe `args` (userdata do json.decode ou tabela) e devolve o valor;
-- um erro vira { ok = false, erro = ... }.

local comandos = {}
M.comandos = comandos

function comandos.ping()
	return { versao = VERSAO, aseprite = tostring(app.version), raiz = raiz() }
end

function comandos.sprite_atual()
	if app.sprite == nil then
		return nil
	end
	return infoSprite(app.sprite)
end

function comandos.abrir(args)
	local arquivo = caminho(args.arquivo)
	if not app.fs.isFile(arquivo) then
		error("arquivo não existe: " .. arquivo, 0)
	end
	-- Pelo comando, e não por app.open: casa_0.png e casa_1.png pareceriam uma sequência de quadros, e o Aseprite
	-- abriria as duas juntas (ou perguntaria, com a interface).
	app.command.OpenFile{ filename = arquivo, sequence = "skip", ui = false }
	local spr = nil
	for _, s in ipairs(app.sprites) do
		if app.fs.normalizePath(s.filename):lower() == arquivo:lower() then
			spr = s
		end
	end
	if spr ~= nil then
		app.sprite = spr
	else
		error("o Aseprite não abriu " .. arquivo, 0)
	end
	return infoSprite(spr)
end

--- Paleta com as cores da região (a transparente primeiro), até 256, para o conta-gotas e o `paleta`.
local function paletaDaRegiao(img)
	local vistas, cores = {}, { app.pixelColor.rgba(0, 0, 0, 0) }
	for px in img:pixels() do
		local c = px()
		if app.pixelColor.rgbaA(c) > 0 and not vistas[c] and #cores < 256 then
			vistas[c] = true
			cores[#cores + 1] = c
		end
	end
	local pal = Palette(#cores)
	for i, c in ipairs(cores) do
		pal:setColor(i - 1, Color(c))
	end
	return pal
end

function comandos.abrir_regiao(args)
	local folha = validarFolha(args.folha)
	local area = lerArea(args.area)
	if area == nil then
		error("falta a área [coluna, linha, largura, altura]", 0)
	end
	local inteira = carregarImagem(arquivoFolha(folha))
	local x, y, w, h = area[1] * TILE, area[2] * TILE, area[3] * TILE, area[4] * TILE
	if x + w > inteira.width or y + h > inteira.height then
		error(string.format("área fora da folha %s (%d×%d tiles)", folha, inteira.width // TILE, inteira.height // TILE), 0)
	end
	local regiao = Image(inteira, Rectangle(x, y, w, h))

	local spr = Sprite(w, h, ColorMode.RGB)
	spr:setPalette(paletaDaRegiao(regiao))
	spr:newCel(spr.layers[1], 1, regiao, Point(0, 0))
	spr.layers[1].name = folha
	spr.filename = string.format("%s@%d,%d", folha, area[1], area[2])
	spr.gridBounds = Rectangle(0, 0, TILE, TILE)
	pcall(function()
		spr.properties.diorama = { folha = folha, area = area }
	end)
	pcall(function()
		app.preferences.document(spr).show.grid = true
	end)
	pcall(function()
		app.command.FitScreen()
	end)
	return infoSprite(spr)
end

--- Copia `img` para a posição (x, y) de `destino` trocando os pixels (inclusive a transparência), sem misturar.
local function colar(destino, img, x, y)
	destino:drawImage(img, Point(x, y), 255, BlendMode.SRC)
end

--- Quantos pixels diferem entre duas imagens do mesmo tamanho.
local function contarDiferencas(a, b)
	local n = 0
	for px in a:pixels() do
		if px() ~= b:getPixel(px.x, px.y) then
			n = n + 1
		end
	end
	return n
end

function comandos.salvar_regiao(args)
	args = args or {}
	local spr = spriteAtivo()
	local folha, area
	if args.folha ~= nil or args.area ~= nil then
		folha = args.folha and validarFolha(args.folha) or nil
		area = lerArea(args.area)
	end
	if folha == nil or area == nil then
		local f, a = origemDoSprite(spr)
		folha = folha or f
		area = area or a
	end
	if folha == nil or area == nil then
		error("o sprite não veio de abrir_regiao (nome folha@coluna,linha); informe folha e área", 0)
	end
	validarFolha(folha)
	local x, y, w, h = area[1] * TILE, area[2] * TILE, area[3] * TILE, area[4] * TILE
	if spr.width ~= w or spr.height ~= h then
		error(string.format("o sprite tem %d×%d e a área %d×%d pixels", spr.width, spr.height, w, h), 0)
	end

	local arquivo = arquivoFolha(folha)
	local inteira = carregarImagem(arquivo)
	if x + w > inteira.width or y + h > inteira.height then
		error("área fora da folha " .. folha, 0)
	end
	local nova = achatar(spr)
	local antiga = Image(inteira, Rectangle(x, y, w, h))
	local mudados = contarDiferencas(antiga, nova)
	local gravados = {}
	if mudados > 0 then
		colar(inteira, nova, x, y)
		inteira:saveAs(arquivo)
		gravados[#gravados + 1] = "diorama/folhas/" .. folha .. ".png"
	end

	-- As metades de 1024 de largura que o Roblox recebe: mesma região, recortada de cada lado.
	local metade = inteira.width // 2
	for i = 0, 1 do
		local arqMetade = app.fs.joinPath(raiz(), "diorama", "folhas", folha .. "_" .. i .. ".png")
		local x0 = i * metade
		local cruza = x < x0 + metade and x + w > x0
		if cruza and app.fs.isFile(arqMetade) then
			local img = carregarImagem(arqMetade)
			if img.width ~= metade or img.height ~= inteira.height then
				error(string.format("%s_%d.png tem %d×%d; esperava %d×%d", folha, i, img.width, img.height, metade, inteira.height), 0)
			end
			local recorte = Image(inteira, Rectangle(math.max(x, x0), y, math.min(x + w, x0 + metade) - math.max(x, x0), h))
			local atual = Image(img, Rectangle(math.max(x, x0) - x0, y, recorte.width, h))
			if contarDiferencas(atual, recorte) > 0 then
				colar(img, recorte, math.max(x, x0) - x0, y)
				img:saveAs(arqMetade)
				gravados[#gravados + 1] = "diorama/folhas/" .. folha .. "_" .. i .. ".png"
			end
		end
	end

	return { folha = folha, area = area, pixels = mudados, arquivos = gravados }
end

function comandos.exportar(args)
	local spr = spriteAtivo()
	local arquivo = caminho(args.arquivo)
	if app.fs.fileExtension(arquivo) == "" then
		arquivo = arquivo .. ".png"
	end
	local pasta = app.fs.filePath(arquivo)
	if pasta ~= "" and not app.fs.isDirectory(pasta) then
		app.fs.makeAllDirectories(pasta)
	end
	if app.fs.fileExtension(arquivo):lower() == "png" then
		-- Só o quadro atual, achatado: um PNG, nunca uma sequência casa1.png, casa2.png…
		achatar(spr):saveAs(arquivo)
	else
		spr:saveCopyAs(arquivo)
	end
	return { arquivo = arquivo }
end

function comandos.paleta()
	local spr = spriteAtivo()
	local pal = spr.palettes[1]
	local cores = {}
	for i = 0, #pal - 1 do
		local c = pal:getColor(i)
		cores[#cores + 1] = string.format("#%02X%02X%02X", c.red, c.green, c.blue)
	end
	return cores
end

--- Extra (fora do contrato): lê ou pinta um pixel do sprite atual. Sem `cor`, devolve a cor vista (camadas
--- achatadas); com `cor` (#RRGGBB ou #RRGGBBAA), pinta na camada ativa, com desfazer.
function comandos.pixel(args)
	local spr = spriteAtivo()
	local x, y = inteiro(args.x, "x"), inteiro(args.y, "y")
	if x < 0 or y < 0 or x >= spr.width or y >= spr.height then
		error("pixel fora do sprite", 0)
	end
	if args.cor ~= nil then
		local c = lerCor(args.cor)
		local camada = app.layer or spr.layers[1]
		local quadro = app.frame or spr.frames[1]
		app.transaction("Diorama: pixel", function()
			local cel = camada:cel(quadro)
			if cel == nil then
				cel = spr:newCel(camada, quadro, Image(spr.width, spr.height, ColorMode.RGB), Point(0, 0))
			end
			local img = Image(spr.width, spr.height, ColorMode.RGB)
			colar(img, cel.image, cel.position.x, cel.position.y)
			img:drawPixel(x, y, c)
			cel.image = img
			cel.position = Point(0, 0)
		end)
		app.refresh()
	end
	return { x = x, y = y, cor = cor(achatar(spr):getPixel(x, y)) }
end

--- Roda um comando e devolve a mensagem de resposta do contrato.
function M.executar(nome, args, id)
	local f = comandos[nome]
	if f == nil then
		return { tipo = "resposta", id = id, ok = false, erro = "comando desconhecido: " .. tostring(nome) }
	end
	local ok, valor = pcall(f, args or {})
	if ok then
		return { tipo = "resposta", id = id, ok = true, valor = valor }
	end
	return { tipo = "resposta", id = id, ok = false, erro = limparErro(valor) }
end

-- ---------------------------------------------------------------------------------------------------------------
-- Conexão com a ponte

local ws = nil
local conectado = false
-- O WebSocket do Aseprite não volta sozinho depois que a ponte cai (conferido no 1.3.18): um relógio de 3 s refaz a
-- conexão com o mesmo objeto (close + connect). Recriar o objeto pediria a permissão do WebSocket de novo a quem
-- não marcou "não perguntar de novo".
local relogio = nil

local function enviar(msg)
	if ws == nil or not conectado then
		return false
	end
	local ok, e = pcall(function()
		ws:sendText(json.encode(msg))
	end)
	if not ok then
		-- Socket morto: o relógio reconecta no próximo tique.
		registrar("falha ao enviar: " .. tostring(e))
		conectado = false
	end
	return ok
end

local function avisarFolhaSalva(valor)
	enviar({ tipo = "evento", nome = "folha_salva", dados = { folha = valor.folha, area = valor.area, pixels = valor.pixels } })
end

local function receber(tipo, dados)
	if tipo == WebSocketMessageType.OPEN then
		conectado = true
		enviar({ tipo = "ola", versao = VERSAO, aseprite = tostring(app.version) })
	elseif tipo == WebSocketMessageType.CLOSE then
		-- ERROR só chega em tentativa de conexão que falhou (ainda desconectado); não mexe no estado.
		conectado = false
	elseif tipo == WebSocketMessageType.TEXT then
		local ok, msg = pcall(json.decode, dados)
		if not ok or msg == nil or msg.tipo ~= "comando" then
			return
		end
		local resposta = M.executar(msg.nome, msg.args, msg.id)
		enviar(resposta)
		if resposta.ok and msg.nome == "salvar_regiao" and resposta.valor.pixels > 0 then
			avisarFolhaSalva(resposta.valor)
		end
	end
end

local function conectar()
	if ws ~= nil then
		return
	end
	prefs.conectar = true
	ws = WebSocket{
		url = urlPonte(),
		deflate = false,
		minreconnectwait = ESPERA_RECONEXAO,
		maxreconnectwait = ESPERA_RECONEXAO,
		onreceive = function(tipo, dados, motivo)
			if tipo ~= WebSocketMessageType.TEXT then
				registrar(string.format("ws tipo=%s motivo=%s", tostring(tipo), tostring(motivo)))
			end
			-- Erro aqui faria o Aseprite parar o WebSocket; por isso tudo passa por pcall.
			local ok, e = pcall(receber, tipo, dados)
			if not ok then
				print("[Diorama] " .. limparErro(e))
			end
		end,
	}
	ws:connect()
	registrar("conectando a " .. urlPonte())
	if relogio == nil then
		relogio = Timer{
			interval = ESPERA_RECONEXAO,
			ontick = function()
				if ws == nil then
					return
				end
				if conectado then
					-- O Aseprite não percebe sozinho que a ponte caiu (nenhum CLOSE chega): um ping num socket morto falha.
					local ok, e = pcall(function()
						ws:sendPing("diorama")
					end)
					if ok then
						return
					end
					registrar("relógio: ping falhou — " .. tostring(e))
					conectado = false
				end
				local ok, e = pcall(function()
					ws:close()
					ws:connect()
				end)
				registrar("relógio: reconectando" .. (ok and "" or (" — erro: " .. tostring(e))))
			end,
		}
	end
	relogio:start()
end

local function desconectar()
	prefs.conectar = false
	if relogio ~= nil then
		relogio:stop()
	end
	if ws ~= nil then
		pcall(function()
			ws:close()
		end)
	end
	ws = nil
	conectado = false
end

local function reconectar()
	if ws ~= nil then
		desconectar()
		conectar()
	end
end

-- ---------------------------------------------------------------------------------------------------------------
-- Menu (Arquivo > Diorama)

local function avisar(texto)
	if not pcall(app.tip, texto, 3) then
		app.alert{ title = "Diorama", text = texto }
	end
end

--- As folhas de diorama/folhas, sem as metades (casa_0, casa_1) de quem tem a folha inteira.
local function listarFolhas()
	local pasta = app.fs.joinPath(raiz(), "diorama", "folhas")
	local nomes, existe = {}, {}
	if not app.fs.isDirectory(pasta) then
		return nomes
	end
	for _, arq in ipairs(app.fs.listFiles(pasta)) do
		local nome = arq:match("^([%w_]+)%.png$")
		if nome then
			existe[nome] = true
		end
	end
	for nome in pairs(existe) do
		local base = nome:match("^(.+)_[01]$")
		if not (base and existe[base]) then
			nomes[#nomes + 1] = nome
		end
	end
	table.sort(nomes)
	return nomes
end

local function dialogoAbrirRegiao()
	local folhas = listarFolhas()
	if #folhas == 0 then
		app.alert{ title = "Diorama", text = "Não achei folhas em " .. app.fs.joinPath(raiz(), "diorama", "folhas") }
		return
	end
	local ultima = type(prefs.ultima) == "table" and prefs.ultima or { folha = folhas[1], area = { 0, 0, 4, 4 } }
	local dlg = Dialog("Abrir região da folha")
	dlg:combobox{ id = "folha", label = "Folha", option = ultima.folha, options = folhas }
	dlg:number{ id = "coluna", label = "Coluna", text = tostring(ultima.area[1]), decimals = 0 }
	dlg:number{ id = "linha", label = "Linha", text = tostring(ultima.area[2]), decimals = 0 }
	dlg:number{ id = "largura", label = "Largura", text = tostring(ultima.area[3]), decimals = 0 }
	dlg:number{ id = "altura", label = "Altura", text = tostring(ultima.area[4]), decimals = 0 }
	dlg:label{ text = "Em tiles de " .. TILE .. " px." }
	dlg:button{ id = "ok", text = "Abrir", focus = true }
	dlg:button{ id = "cancelar", text = "Cancelar" }
	dlg:show()
	local d = dlg.data
	if not d.ok then
		return
	end
	local area = { d.coluna, d.linha, d.largura, d.altura }
	local r = M.executar("abrir_regiao", { folha = d.folha, area = area })
	if r.ok then
		prefs.ultima = { folha = d.folha, area = area }
	else
		app.alert{ title = "Diorama", text = r.erro }
	end
end

local function menuSalvarRegiao()
	local r = M.executar("salvar_regiao", {})
	if not r.ok then
		app.alert{ title = "Diorama", text = r.erro }
		return
	end
	local v = r.valor
	if v.pixels == 0 then
		avisar("Nada mudou em " .. v.folha .. ".")
	else
		avisarFolhaSalva(v)
		avisar(string.format("%s: %d pixels gravados (%s)%s", v.folha, v.pixels, table.concat(v.arquivos, ", "),
			conectado and "" or " — ponte desconectada, o Studio não foi avisado"))
	end
end

local function dialogoRaiz()
	local dlg = Dialog("Diorama: configuração")
	dlg:entry{ id = "raiz", label = "Raiz do repositório", text = raiz() }
	dlg:entry{ id = "url", label = "Endereço da ponte", text = (type(prefs.url) == "string" and prefs.url ~= "") and prefs.url or URL_PADRAO }
	dlg:label{ text = conectado and "Conectado à ponte." or "Desconectado da ponte." }
	dlg:button{ id = "ok", text = "OK", focus = true }
	dlg:button{ id = "cancelar", text = "Cancelar" }
	dlg:show()
	local d = dlg.data
	if not d.ok then
		return
	end
	if not app.fs.isDirectory(app.fs.joinPath(d.raiz, "diorama", "folhas")) then
		if not (app.alert{ title = "Diorama", text = "Não achei diorama\\folhas nessa pasta. Usar assim mesmo?", buttons = { "Usar", "Cancelar" } } == 1) then
			return
		end
	end
	prefs.raiz = d.raiz
	local urlAntiga = urlPonte()
	prefs.url = (d.url ~= URL_PADRAO) and d.url or nil
	if urlPonte() ~= urlAntiga then
		reconectar()
	end
end

function init(plugin)
	prefs = plugin.preferences

	plugin:newMenuGroup{ id = "diorama_menu", title = "Diorama", group = "file_scripts" }
	plugin:newCommand{
		id = "DioramaConectar",
		title = "Conectar/desconectar da ponte",
		group = "diorama_menu",
		onchecked = function()
			return conectado
		end,
		onclick = function()
			if ws ~= nil then
				desconectar()
				avisar("Desconectado da ponte.")
			else
				conectar()
				avisar("Conectando a " .. urlPonte() .. "…")
			end
		end,
	}
	plugin:newCommand{
		id = "DioramaAbrirRegiao",
		title = "Abrir região da folha…",
		group = "diorama_menu",
		onclick = dialogoAbrirRegiao,
	}
	plugin:newCommand{
		id = "DioramaSalvarRegiao",
		title = "Salvar região na folha",
		group = "diorama_menu",
		onenabled = function()
			return app.sprite ~= nil
		end,
		onclick = menuSalvarRegiao,
	}
	plugin:newMenuSeparator{ group = "diorama_menu" }
	plugin:newCommand{
		id = "DioramaRaiz",
		title = "Raiz do repositório…",
		group = "diorama_menu",
		onclick = dialogoRaiz,
	}

	-- Conecta ao abrir, a não ser que o usuário tenha desligado pelo menu na última sessão.
	if prefs.conectar ~= false and app.isUIAvailable then
		conectar()
	end
end

function exit(plugin)
	local querConectar = prefs.conectar
	desconectar()
	prefs.conectar = querConectar
end

return M
