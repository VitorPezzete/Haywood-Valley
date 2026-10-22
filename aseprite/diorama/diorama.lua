-- Diorama: extensão do Aseprite que liga o editor à ponte do Haywood Valley.
--
-- Abre um WebSocket em ws://127.0.0.1:34873/ws?cliente=aseprite (reconecta sozinho a cada 3 s), se apresenta com
-- `ola` e responde aos comandos da ponte: ping, sprite_atual, abrir, abrir_regiao, salvar_regiao, exportar, paleta
-- e pixel. O contrato está em docs/diorama/CONEXOES.md (seção 3); o uso, em docs/diorama/ASEPRITE.md. Desde a 0.3.0
-- também pede coisas à ponte (pedidos `temporaria` e `estilo_aeko`) para o "Aplicar estilo Aeko…" (docs/arte/ESTILO_AEKO_ARTE.md).
-- Desde a 0.4.0, "Girar (RotSprite)…" e "Limpar doubles e jaggies…", com os módulos de aseprite/pixel/ (copiados para
-- <extensão>/pixel/ na instalação; docs/arte/PLANO_ROTSPRITE.md e PLANO_LIMPEZA_LINHAS.md).
--
-- Tudo fica neste arquivo de propósito: o Aseprite pede permissão (WebSocket, gravar arquivo) por arquivo de script,
-- então um arquivo só significa um aviso só ("Dar confiança total a este script").
--
-- Também roda fora da interface (aseprite -b --script): `dofile` deste arquivo devolve a tabela M, com os comandos
-- prontos para chamar. É assim que os testes em lote conferem a lógica sem a ponte.

local VERSAO = "0.4.0"
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

--- Erro legível se o sprite foi fechado (um sprite fechado vira um objeto que dá erro a qualquer acesso).
local function conferirSprite(spr)
	local ok = pcall(function()
		return spr.width
	end)
	if not ok then
		error("o sprite foi fechado no meio do comando", 0)
	end
	return spr
end

local function spriteAtivo()
	local spr = app.sprite
	if spr == nil then
		error("nenhum sprite aberto no Aseprite", 0)
	end
	return conferirSprite(spr)
end

--- Grava `img` em `arquivo` sem deixar um PNG pela metade: salva num temporário da mesma pasta
--- (`.<nome>.salvando.png`, que a ponte e o menu ignoram) e troca pelo original. O rename do Windows não
--- substitui arquivo existente, então o original vai antes para `.<nome>.anterior.png` e volta se a troca falhar.
local function gravarImagem(img, arquivo)
	local pasta = app.fs.filePath(arquivo)
	local titulo = app.fs.fileTitle(arquivo)
	local tmp = app.fs.joinPath(pasta, "." .. titulo .. ".salvando.png")
	local velho = app.fs.joinPath(pasta, "." .. titulo .. ".anterior.png")
	if app.fs.isFile(tmp) then
		os.remove(tmp)
	end
	img:saveAs(tmp)
	if not app.fs.isFile(tmp) then
		error("o Aseprite não conseguiu gravar " .. tmp, 0)
	end
	if app.fs.isFile(arquivo) then
		if app.fs.isFile(velho) then
			os.remove(velho)
		end
		local ok, e = os.rename(arquivo, velho)
		if not ok then
			os.remove(tmp)
			error("não deu para trocar " .. arquivo .. " (aberto em outro programa?): " .. tostring(e), 0)
		end
	end
	local ok, e = os.rename(tmp, arquivo)
	if not ok then
		os.rename(velho, arquivo)
		os.remove(tmp)
		error("não deu para gravar " .. arquivo .. ": " .. tostring(e), 0)
	end
	if app.fs.isFile(velho) then
		os.remove(velho)
	end
end
M.gravarImagem = gravarImagem

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
	local nova = achatar(conferirSprite(spr))
	local antiga = Image(inteira, Rectangle(x, y, w, h))
	local mudados = contarDiferencas(antiga, nova)
	if mudados > 0 then
		colar(inteira, nova, x, y)
	end

	-- As metades de 1024 de largura que o Roblox recebe: mesma região, recortada de cada lado. Uma área que cruza
	-- o meio vai em parte para cada metade. Tudo é conferido antes de gravar qualquer arquivo, para um erro numa
	-- metade não deixar a folha gravada e a metade velha.
	local metade = inteira.width // 2
	local trocas = {}
	for i = 0, 1 do
		local arqMetade = app.fs.joinPath(raiz(), "diorama", "folhas", folha .. "_" .. i .. ".png")
		local x0 = i * metade
		local ini = math.max(x, x0)
		local fim = math.min(x + w, x0 + metade)
		if fim > ini and app.fs.isFile(arqMetade) then
			local img = carregarImagem(arqMetade)
			if img.width ~= metade or img.height ~= inteira.height then
				error(string.format("%s_%d.png tem %d×%d; esperava %d×%d (nada foi gravado)", folha, i, img.width, img.height, metade, inteira.height), 0)
			end
			local recorte = Image(inteira, Rectangle(ini, y, fim - ini, h))
			local atual = Image(img, Rectangle(ini - x0, y, fim - ini, h))
			if contarDiferencas(atual, recorte) > 0 then
				colar(img, recorte, ini - x0, y)
				trocas[#trocas + 1] = { img = img, arquivo = arqMetade, nome = "diorama/folhas/" .. folha .. "_" .. i .. ".png" }
			end
		end
	end

	local gravados = {}
	if mudados > 0 then
		gravarImagem(inteira, arquivo)
		gravados[#gravados + 1] = "diorama/folhas/" .. folha .. ".png"
	end
	for _, t in ipairs(trocas) do
		gravarImagem(t.img, t.arquivo)
		gravados[#gravados + 1] = t.nome
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

-- O objeto WebSocket é criado uma vez por endereço e reaproveitado: recriá-lo pediria a permissão do WebSocket de
-- novo a quem não marcou "não perguntar de novo". `ativo` diz se o usuário quer a conexão (menu); `conectado`, se
-- ela está aberta agora.
local ws = nil
local wsUrl = nil
local ativo = false
local conectado = false
-- O WebSocket do Aseprite não volta sozinho depois que a ponte cai (conferido no 1.3.18): um relógio de 3 s refaz a
-- conexão com o mesmo objeto (close + connect). Há um relógio só, criado na primeira conexão e parado/religado
-- pelo menu; nunca um por conexão.
local relogio = nil

local function enviar(msg)
	if ws == nil or not conectado then
		return false
	end
	-- Codificar e mandar são separados: um valor que o json não codifica não é socket morto.
	local okJson, texto = pcall(json.encode, msg)
	if not okJson then
		registrar("resposta sem JSON: " .. tostring(texto))
		if msg.tipo ~= "resposta" then
			return false
		end
		texto = json.encode({ tipo = "resposta", id = msg.id, ok = false, erro = "a resposta não virou JSON: " .. limparErro(texto) })
	end
	local ok, e = pcall(function()
		ws:sendText(texto)
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

-- Pedidos da extensão à ponte (o contrário de um comando): { tipo = "pedido", id, nome, args }; a resposta volta como
-- { tipo = "resposta_pedido", id, ok, valor | erro } e chama a função guardada aqui.
local pedidosPendentes = {}
local proximoPedido = 1

--- Manda um pedido à ponte; `aoResponder(msg)` roda quando a resposta chegar. Devolve false se não está conectado.
local function pedirPonte(nome, args, aoResponder)
	if not conectado then
		return false
	end
	local id = "x" .. proximoPedido
	proximoPedido = proximoPedido + 1
	pedidosPendentes[id] = aoResponder
	if not enviar({ tipo = "pedido", id = id, nome = nome, args = args }) then
		pedidosPendentes[id] = nil
		return false
	end
	return true
end

local function receber(tipo, dados)
	if tipo == WebSocketMessageType.OPEN then
		conectado = true
		local sprite = nil
		if app.sprite ~= nil then
			local ok, info = pcall(infoSprite, app.sprite)
			sprite = ok and info or nil
		end
		enviar({ tipo = "ola", versao = VERSAO, aseprite = tostring(app.version), sprite = sprite })
	elseif tipo == WebSocketMessageType.CLOSE then
		-- ERROR só chega em tentativa de conexão que falhou (ainda desconectado); não mexe no estado.
		conectado = false
	elseif tipo == WebSocketMessageType.TEXT then
		local ok, msg = pcall(json.decode, dados)
		if ok and msg ~= nil and msg.tipo == "resposta_pedido" then
			local aoResponder = pedidosPendentes[msg.id]
			pedidosPendentes[msg.id] = nil
			if aoResponder then
				aoResponder(msg)
			end
			return
		end
		if not ok or msg == nil or msg.tipo ~= "comando" then
			return
		end
		local resposta = M.executar(msg.nome, msg.args, msg.id)
		enviar(resposta)
		if resposta.ok and msg.nome == "salvar_regiao" and type(resposta.valor) == "table" and (resposta.valor.pixels or 0) > 0 then
			avisarFolhaSalva(resposta.valor)
		end
	end
end

local function tique()
	if not ativo or ws == nil then
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
end

local function conectar()
	prefs.conectar = true
	ativo = true
	local url = urlPonte()
	if ws ~= nil and wsUrl ~= url then
		-- Endereço novo: o objeto velho é fechado e esquecido (as mensagens dele são ignoradas abaixo).
		pcall(function()
			ws:close()
		end)
		ws = nil
		conectado = false
	end
	if ws == nil then
		local este
		este = WebSocket{
			url = url,
			deflate = false,
			minreconnectwait = ESPERA_RECONEXAO,
			maxreconnectwait = ESPERA_RECONEXAO,
			onreceive = function(tipo, dados, motivo)
				-- Mensagem de um objeto antigo (troca de endereço) ou com a conexão desligada pelo menu: ignorada.
				if este ~= ws or not ativo then
					return
				end
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
		ws = este
		wsUrl = url
	end
	if not conectado then
		pcall(function()
			ws:connect()
		end)
		registrar("conectando a " .. url)
	end
	if relogio == nil then
		relogio = Timer{ interval = ESPERA_RECONEXAO, ontick = tique }
	end
	if not relogio.isRunning then
		relogio:start()
	end
end

local function desconectar()
	prefs.conectar = false
	ativo = false
	if relogio ~= nil and relogio.isRunning then
		relogio:stop()
	end
	if ws ~= nil then
		pcall(function()
			ws:close()
		end)
	end
	conectado = false
end

local function reconectar()
	if ativo then
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
	-- A última região usada (preferência salva pelo Aseprite); qualquer coisa estranha nela volta ao padrão.
	local ultima = { folha = folhas[1], area = { 0, 0, 4, 4 } }
	local p = prefs.ultima
	if type(p) == "table" and type(p.folha) == "string" and type(p.area) == "table" then
		local ok, area = pcall(lerArea, p.area)
		if ok and area then
			ultima = { folha = p.folha, area = area }
		end
	end
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
		avisar(#v.arquivos > 0 and ("Folha igual; metades atualizadas: " .. table.concat(v.arquivos, ", ")) or ("Nada mudou em " .. v.folha .. "."))
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

-- ---------------------------------------------------------------------------------------------------------------
-- Aplicar estilo Aeko (tools/estilo_aeko_arte.py; docs/arte/ESTILO_AEKO_ARTE.md)
--
-- Grava o sprite atual (camadas visíveis do quadro atual, achatadas) num PNG na pasta temporária da ponte, pede à
-- ponte para rodar a ferramenta (pedido `estilo_aeko`) e abre o resultado como um sprite novo: o original nunca é
-- sobrescrito. Sem a ponte, oferece rodar o Python direto (o Aseprite pede a permissão de executar programas).

local ESTILOS = { "aeko", "equipe", "aeko+equipe" }
local PALETAS = { "auto", "estilo", "livre", "aeko", "equipe" }
local CONTORNOS = { "externo", "todos", "nao" }
local CORES_CONTORNO = { "auto", "preto", "escuro" }

--- As opções do diálogo no formato da ponte (as mesmas chaves de OPCOES_ESTILO em diorama_ponte.mjs).
local function opcoesDoDialogo(d)
	local o = { estilo = d.estilo, paleta = d.paleta, contorno = d.contorno, cor_contorno = d.cor_contorno, previa = d.previa }
	if d.estilo == "aeko+equipe" then
		o.mistura = d.mistura / 100
	end
	if d.fundo == "cor" then
		o.fundo = string.format("#%02X%02X%02X", d.cor_fundo.red, d.cor_fundo.green, d.cor_fundo.blue)
	else
		o.fundo = d.fundo
	end
	local tons = math.floor(tonumber(d.tons) or 0)
	if tons >= 1 and tons <= 16 then
		o.tons = tons
	end
	local nota = tonumber(d.nota_minima) or 0
	if nota > 0 and nota <= 10 then
		o.nota_minima = nota
	end
	return o
end

--- Os argumentos da linha de comando para as mesmas opções (o caminho sem a ponte).
local function argumentosDeOpcoes(o)
	local args = {}
	for _, chave in ipairs({ "estilo", "mistura", "fundo", "paleta", "tons", "contorno", "cor_contorno", "nota_minima" }) do
		if o[chave] ~= nil then
			args[#args + 1] = "--" .. chave:gsub("_", "-")
			args[#args + 1] = tostring(o[chave])
		end
	end
	if o.previa then
		args[#args + 1] = "--previa"
	end
	return args
end

local function nomeSeguro(texto)
	local t = (texto or ""):gsub("[^%w_%-]", "_")
	if t == "" then
		t = "sprite"
	end
	return t
end

local function abrirResultado(saida, resumo)
	app.command.OpenFile{ filename = saida, sequence = "skip", ui = false }
	if type(resumo) == "table" and resumo.nota then
		local texto = string.format("Estilo %s: nota %.2f (mínima %g)", tostring(resumo.estilo), resumo.nota, resumo.nota_minima or 0)
		if resumo.chegou == false then
			local faltou = {}
			for _, f in ipairs(resumo.faltou or {}) do
				faltou[#faltou + 1] = tostring(f)
			end
			app.alert{ title = "Diorama: estilo", text = { texto .. " — não chegou à mínima.", "Faltou: " .. (#faltou > 0 and table.concat(faltou, ", ") or "um pouco de tudo"),
				"Tente paleta \"estilo\", menos tons ou contorno externo." } }
		else
			avisar(texto)
		end
	end
end

--- O fim do log (as últimas linhas), para o aviso de erro.
local function fimDoLog(log)
	local linhas = {}
	for linha in tostring(log or ""):gmatch("[^\r\n]+") do
		linhas[#linhas + 1] = linha
	end
	local saida = {}
	for i = math.max(1, #linhas - 5), #linhas do
		saida[#saida + 1] = linhas[i]
	end
	return saida
end

--- Sem a ponte: roda o Python direto e lê a última linha JSON (o resumo).
local function estiloSemPonte(entrada, saida, opcoes)
	local python = "python"
	local ok, local_ = pcall(os.getenv, "LOCALAPPDATA")
	if ok and local_ then
		local candidato = app.fs.joinPath(local_, "Programs", "Python", "Python312", "python.exe")
		if app.fs.isFile(candidato) then
			python = candidato
		end
	end
	local partes = { '"' .. python .. '"', "-I", '"' .. app.fs.joinPath(raiz(), "tools", "estilo_aeko_arte.py") .. '"', '"' .. entrada .. '"', '"' .. saida .. '"' }
	for _, a in ipairs(argumentosDeOpcoes(opcoes)) do
		partes[#partes + 1] = '"' .. a .. '"'
	end
	partes[#partes + 1] = "--json"
	-- O cmd.exe tira a primeira e a última aspas quando há mais de duas: a linha inteira vai entre aspas.
	local f = io.popen('"' .. table.concat(partes, " ") .. ' 2>&1"')
	if not f then
		error("não deu para rodar o Python", 0)
	end
	local log = f:read("a")
	f:close()
	local resumo = nil
	for linha in log:gmatch("[^\r\n]+") do
		if linha:sub(1, 1) == "{" then
			local okj, v = pcall(json.decode, linha)
			if okj then
				resumo = v
			end
		end
	end
	return resumo, log
end

-- Para os testes em lote (aseprite -b): o caminho sem a ponte e a tradução das opções.
M.estilo = { argumentosDeOpcoes = argumentosDeOpcoes, semPonte = estiloSemPonte }

local function dialogoEstilo()
	local spr = app.sprite
	if spr == nil then
		app.alert{ title = "Diorama", text = "Abra um sprite antes." }
		return
	end
	local u = type(prefs.estilo) == "table" and prefs.estilo or {}
	local dlg = Dialog("Aplicar estilo Aeko")
	dlg:combobox{ id = "estilo", label = "Estilo", option = u.estilo or "aeko", options = ESTILOS,
		onchange = function()
			dlg:modify{ id = "mistura", enabled = dlg.data.estilo == "aeko+equipe" }
		end }
	dlg:slider{ id = "mistura", label = "Mistura (0 equipe, 100 Aeko)", min = 0, max = 100, value = u.mistura or 50, enabled = (u.estilo or "aeko") == "aeko+equipe" }
	dlg:separator{}
	dlg:combobox{ id = "fundo", label = "Fundo", option = u.fundo or "auto", options = { "auto", "nenhum", "cor" },
		onchange = function()
			dlg:modify{ id = "cor_fundo", enabled = dlg.data.fundo == "cor" }
		end }
	dlg:color{ id = "cor_fundo", label = "Cor do fundo", color = Color{ r = 255, g = 255, b = 255 }, enabled = u.fundo == "cor" }
	dlg:combobox{ id = "paleta", label = "Paleta", option = u.paleta or "auto", options = PALETAS }
	dlg:number{ id = "tons", label = "Tons por rampa (0 = do estilo)", text = tostring(u.tons or 0), decimals = 0 }
	dlg:combobox{ id = "contorno", label = "Contorno", option = u.contorno or "externo", options = CONTORNOS }
	dlg:combobox{ id = "cor_contorno", label = "Cor do contorno", option = u.cor_contorno or "auto", options = CORES_CONTORNO }
	dlg:number{ id = "nota_minima", label = "Nota mínima (0 = padrão, 8)", text = tostring(u.nota_minima or 0), decimals = 1 }
	dlg:check{ id = "previa", label = "Prévia", text = "abrir também antes | depois", selected = u.previa or false }
	dlg:label{ text = "O resultado abre como sprite novo; o atual não muda." }
	dlg:button{ id = "ok", text = "Aplicar", focus = true }
	dlg:button{ id = "cancelar", text = "Cancelar" }
	dlg:show()
	local d = dlg.data
	if not d.ok then
		return
	end
	prefs.estilo = { estilo = d.estilo, mistura = d.mistura, fundo = d.fundo, paleta = d.paleta, tons = d.tons, contorno = d.contorno,
		cor_contorno = d.cor_contorno, nota_minima = d.nota_minima, previa = d.previa }
	local opcoes = opcoesDoDialogo(d)
	local imagem = achatar(conferirSprite(spr))
	local base = nomeSeguro(app.fs.fileTitle(spr.filename or "")) .. "_" .. os.time()
	local sufixo = (d.estilo:gsub("%+", "_"))

	local function terminar(resumo, log, saida, ok)
		if not ok or not app.fs.isFile(saida) then
			app.alert{ title = "Diorama: estilo", text = { "A ferramenta não terminou.", table.unpack(fimDoLog(log)) } }
			return
		end
		abrirResultado(saida, resumo)
		if opcoes.previa and type(resumo) == "table" and type(resumo.previa) == "string" and app.fs.isFile(resumo.previa) then
			app.command.OpenFile{ filename = resumo.previa, sequence = "skip", ui = false }
		end
	end

	local pediu = pedirPonte("temporaria", {}, function(r)
		if not r.ok then
			app.alert{ title = "Diorama", text = "A ponte não deu a pasta temporária: " .. tostring(r.erro) }
			return
		end
		local pasta = r.valor.pasta
		local entrada = app.fs.joinPath(pasta, base .. ".png")
		local saida = app.fs.joinPath(pasta, base .. "." .. sufixo .. ".png")
		local okGravar, erro = pcall(function()
			imagem:saveAs(entrada)
		end)
		if not okGravar then
			app.alert{ title = "Diorama", text = "Não deu para gravar " .. entrada .. ": " .. limparErro(erro) }
			return
		end
		avisar("Aplicando o estilo " .. d.estilo .. "…")
		local enviado = pedirPonte("estilo_aeko", { entrada = entrada, saida = saida, opcoes = opcoes }, function(e)
			if not e.ok then
				app.alert{ title = "Diorama: estilo", text = "A ponte recusou: " .. tostring(e.erro) }
				return
			end
			terminar(e.valor.resumo, e.valor.log, e.valor.saida or saida, e.valor.ok)
		end)
		if not enviado then
			app.alert{ title = "Diorama", text = "A conexão com a ponte caiu antes do pedido." }
		end
	end)
	if pediu then
		return
	end

	-- Sem a ponte: o Python direto, numa pasta temporária do sistema.
	if app.alert{ title = "Diorama: estilo", text = { "A ponte não está conectada.", "Rodar a ferramenta direto pelo Python? (o Aseprite vai pedir permissão para executar programas)" },
		buttons = { "Rodar", "Cancelar" } } ~= 1 then
		return
	end
	local okTmp, tmp = pcall(os.getenv, "TEMP")
	local pasta = app.fs.joinPath((okTmp and tmp) or raiz(), "diorama-ponte")
	app.fs.makeAllDirectories(pasta)
	local entrada = app.fs.joinPath(pasta, base .. ".png")
	local saida = app.fs.joinPath(pasta, base .. "." .. sufixo .. ".png")
	imagem:saveAs(entrada)
	local okRodar, resumo, log = pcall(estiloSemPonte, entrada, saida, opcoes)
	if not okRodar then
		app.alert{ title = "Diorama: estilo", text = limparErro(resumo) }
		return
	end
	terminar(resumo, log, saida, resumo ~= nil)
end

-- ---------------------------------------------------------------------------------------------------------------
-- Girar (RotSprite) e Limpar doubles e jaggies (0.4.0; aseprite/pixel/, docs/arte/PLANO_ROTSPRITE.md e
-- PLANO_LIMPEZA_LINHAS.md)
--
-- Os módulos ficam em aseprite/pixel/ no repositório; `npm run aseprite:instalar` copia rotsprite.lua e limpeza.lua
-- para <extensão>/pixel/, e é essa cópia que o menu usa (a versão casa com a da extensão). Sem a cópia (por exemplo,
-- este arquivo carregado por dofile num teste em lote), usa os do repositório (Raiz do repositório…). O dofile não
-- passa pelas permissões do Aseprite (só io/os passam), e os módulos não usam io nem os: nenhuma pergunta nova.

local pastaExtensao = nil
local modulosPixel = {}

--- Carrega aseprite/pixel/<nome>.lua (a cópia da extensão; senão, a do repositório). Uma vez por sessão.
local function pixel(nome)
	if modulosPixel[nome] then
		return modulosPixel[nome]
	end
	local candidatos = {}
	if pastaExtensao then
		candidatos[#candidatos + 1] = app.fs.joinPath(pastaExtensao, "pixel", nome .. ".lua")
	end
	candidatos[#candidatos + 1] = app.fs.joinPath(raiz(), "aseprite", "pixel", nome .. ".lua")
	for _, arq in ipairs(candidatos) do
		if app.fs.isFile(arq) then
			local m = dofile(arq)
			modulosPixel[nome] = m
			return m
		end
	end
	error("não achei " .. nome .. ".lua (reinstale a extensão: npm run aseprite:instalar)", 0)
end
M.pixel = pixel

--- A célula da camada ativa no quadro ativo, ou um erro legível.
local function celAtiva()
	local spr = spriteAtivo()
	local camada = app.layer
	if camada == nil or camada.isGroup then
		error("escolha uma camada de imagem (não um grupo)", 0)
	end
	if camada.isTilemap then
		error("camada de tilemap: converta para camada comum antes", 0)
	end
	local cel = camada:cel(app.frame or spr.frames[1])
	if cel == nil then
		error("a camada " .. camada.name .. " não tem nada neste quadro", 0)
	end
	return spr, camada, cel
end

--- "auto", ou uma lista "#010000, #1c181c" -> o formato de cores_linha.
local function lerCoresLinha(texto)
	texto = tostring(texto or ""):gsub("^%s+", ""):gsub("%s+$", "")
	if texto == "" or texto:lower() == "auto" then
		return "auto"
	end
	local cores = {}
	for c in texto:gmatch("[^,%s]+") do
		if not c:match("^#?%x%x%x%x%x%x$") then
			error("cor de linha inválida: " .. c .. " (use #RRGGBB, separadas por vírgula, ou auto)", 0)
		end
		cores[#cores + 1] = c:sub(1, 1) == "#" and c or ("#" .. c)
	end
	return cores
end

local function areaDaSelecao(spr, usar)
	if usar and not spr.selection.isEmpty then
		local b = spr.selection.bounds
		return { b.x, b.y, b.width, b.height }
	end
	return nil
end

local function dialogoGirar()
	local spr, camada = celAtiva()
	local R = pixel("rotsprite")
	local u = type(prefs.girar) == "table" and prefs.girar or {}
	local temSelecao = not spr.selection.isEmpty
	local dlg = Dialog("Girar (RotSprite)")
	dlg:number{ id = "angulo", label = "Ângulo (graus, horário)", text = tostring(u.angulo or 45), decimals = 1 }
	dlg:combobox{ id = "pivo", label = "Pivô", option = u.pivo or "centro", options = { "centro", "pé", "ponto" },
		onchange = function()
			local ponto = dlg.data.pivo == "ponto"
			dlg:modify{ id = "pivo_x", enabled = ponto }
			dlg:modify{ id = "pivo_y", enabled = ponto }
		end }
	dlg:number{ id = "pivo_x", label = "Pivô x, y (no sprite)", text = tostring(u.pivo_x or spr.width / 2), decimals = 1, enabled = u.pivo == "ponto" }
	dlg:number{ id = "pivo_y", text = tostring(u.pivo_y or spr.height / 2), decimals = 1, enabled = u.pivo == "ponto" }
	dlg:combobox{ id = "reducao", label = "Redução", option = u.reducao or "centro", options = { "centro", "maioria" } }
	dlg:check{ id = "limpar", label = "Limpeza", text = "tirar órfãos e doubles que o giro criou", selected = u.limpar ~= false }
	dlg:entry{ id = "cores_linha", label = "Cor de linha", text = u.cores_linha or "auto" }
	dlg:check{ id = "recortar", label = "Tamanho", text = "manter o tamanho (recorta o que sair)", selected = u.recortar == true }
	dlg:check{ id = "selecao", label = "Área", text = "só a seleção", selected = temSelecao and u.selecao ~= false, enabled = temSelecao }
	dlg:label{ text = "O resultado vai para uma camada nova; o original fica. Ctrl+Z desfaz." }
	dlg:button{ id = "ok", text = "Girar", focus = true }
	dlg:button{ id = "cancelar", text = "Cancelar" }
	dlg:show()
	local d = dlg.data
	if not d.ok then
		return
	end
	prefs.girar = { angulo = d.angulo, pivo = d.pivo, pivo_x = d.pivo_x, pivo_y = d.pivo_y, reducao = d.reducao, limpar = d.limpar,
		cores_linha = d.cores_linha, recortar = d.recortar, selecao = d.selecao }
	local pivo = "centro"
	if d.pivo == "pé" then
		pivo = "pe"
	elseif d.pivo == "ponto" then
		pivo = { d.pivo_x, d.pivo_y }
	end
	local info = R.girar{
		camada = camada,
		quadro = app.frame,
		angulo = d.angulo,
		pivo = pivo,
		area = areaDaSelecao(spr, d.selecao),
		reducao = d.reducao,
		limpar = d.limpar,
		cores_linha = lerCoresLinha(d.cores_linha),
		recortar = d.recortar,
	}
	app.refresh()
	avisar(string.format("%s: %d×%d, cores %d → %d%s", info.camada, info.largura, info.altura, info.cores_antes, info.cores_depois,
		(info.limpeza.pixels > 0) and string.format(", limpeza: %d órfãos, %d doubles", info.limpeza.orfaos, info.limpeza.doubles) or ""))
end

local MODOS_DEFEITO = { "relatar", "corrigir", "não" }

local function modoDefeito(v)
	if v == "não" then
		return false
	end
	return v
end

local function dialogoLimpar()
	local spr, camada, cel = celAtiva()
	local Lm = pixel("limpeza")
	local u = type(prefs.limpar) == "table" and prefs.limpar or {}
	local temSelecao = not spr.selection.isEmpty
	local dlg

	local function opcoes(d)
		return {
			cores_linha = lerCoresLinha(d.cores_linha),
			doubles = d.doubles,
			jaggies = modoDefeito(d.jaggies),
			orfaos = modoDefeito(d.orfaos),
			area = areaDaSelecao(spr, d.selecao),
		}
	end

	-- Prévia: a análise da célula como está (nada muda), com as opções do diálogo.
	local function previa()
		local d = dlg.data
		local ok, rel = pcall(function()
			local o = opcoes(d)
			o.origem = { cel.position.x, cel.position.y }
			o.paleta = spr.palettes[1]
			o.jaggies = o.jaggies and "relatar" or false
			o.orfaos = o.orfaos and "relatar" or false
			return Lm.analisar_imagem(cel.image, o)
		end)
		local texto
		if not ok then
			texto = limparErro(rel)
		elseif #rel.cores_linha == 0 then
			texto = "Nenhuma cor de linha achada (tente uma cor #RRGGBB)."
		else
			texto = string.format("Linha %s: %d px · doubles %d · jaggies %d · órfãos %d · nota %.1f", table.concat(rel.cores_linha, ","),
				rel.total_linha, rel.doubles.encontrados, rel.jaggies.encontrados, rel.orfaos.encontrados, rel.nota)
		end
		dlg:modify{ id = "previa", text = texto }
	end

	dlg = Dialog("Limpar doubles e jaggies")
	dlg:entry{ id = "cores_linha", label = "Cor de linha", text = u.cores_linha or "#010000", onchange = function() previa() end }
	dlg:check{ id = "doubles", label = "Doubles", text = "corrigir", selected = u.doubles ~= false, onclick = function() previa() end }
	dlg:combobox{ id = "jaggies", label = "Jaggies", option = u.jaggies or "relatar", options = MODOS_DEFEITO, onchange = function() previa() end }
	dlg:combobox{ id = "orfaos", label = "Órfãos", option = u.orfaos or "relatar", options = MODOS_DEFEITO, onchange = function() previa() end }
	dlg:check{ id = "selecao", label = "Área", text = "só a seleção", selected = temSelecao and u.selecao ~= false, enabled = temSelecao,
		onclick = function() previa() end }
	dlg:combobox{ id = "saida", label = "Resultado", option = u.saida or "camada nova", options = { "camada nova", "mesma camada" } }
	dlg:check{ id = "png", label = "Relatório", text = "abrir PNG ampliado com os defeitos marcados", selected = u.png == true }
	dlg:separator{}
	dlg:label{ id = "previa", text = "" }
	dlg:button{ id = "ok", text = "Aplicar", focus = true }
	dlg:button{ id = "cancelar", text = "Cancelar" }
	previa()
	dlg:show()
	local d = dlg.data
	if not d.ok then
		return
	end
	prefs.limpar = { cores_linha = d.cores_linha, doubles = d.doubles, jaggies = d.jaggies, orfaos = d.orfaos, selecao = d.selecao, saida = d.saida, png = d.png }
	local o = opcoes(d)
	o.camada = camada
	o.quadro = app.frame
	if d.saida == "camada nova" then
		o.saida_camada = camada.name .. " limpa"
	end
	if d.png then
		local okTmp, tmp = pcall(os.getenv, "TEMP")
		local pasta = app.fs.joinPath((okTmp and tmp) or raiz(), "diorama-ponte")
		app.fs.makeAllDirectories(pasta)
		o.png = app.fs.joinPath(pasta, nomeSeguro(app.fs.fileTitle(spr.filename or "")) .. "_" .. os.time() .. ".limpeza.png")
		o.png_escala = 8
	end
	local rel = Lm.limpar(o)
	app.refresh()
	if rel.png and app.fs.isFile(rel.png) then
		app.command.OpenFile{ filename = rel.png, sequence = "skip", ui = false }
	end
	local partes = { string.format("%d pixels mudados", rel.mudados) }
	if rel.doubles.corrigidos > 0 then partes[#partes + 1] = rel.doubles.corrigidos .. " doubles" end
	if rel.jaggies.encontrados > 0 then partes[#partes + 1] = string.format("jaggies %d (%d corrigidos)", rel.jaggies.encontrados, rel.jaggies.corrigidos) end
	if rel.orfaos.encontrados > 0 then partes[#partes + 1] = string.format("órfãos %d (%d corrigidos)", rel.orfaos.encontrados, rel.orfaos.corrigidos) end
	avisar(table.concat(partes, ", ") .. string.format("; nota %.1f%s", rel.nota, rel.depois and string.format(" → %.1f", rel.depois.nota) or ""))
end

local function comAlerta(f)
	return function()
		local ok, erro = pcall(f)
		if not ok then
			app.alert{ title = "Diorama", text = limparErro(erro) }
		end
	end
end

function init(plugin)
	prefs = plugin.preferences
	pastaExtensao = plugin.path

	plugin:newMenuGroup{ id = "diorama_menu", title = "Diorama", group = "file_scripts" }
	plugin:newCommand{
		id = "DioramaConectar",
		title = "Conectar/desconectar da ponte",
		group = "diorama_menu",
		onchecked = function()
			return conectado
		end,
		onclick = function()
			if ativo then
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
	plugin:newCommand{
		id = "DioramaEstiloAeko",
		title = "Aplicar estilo Aeko…",
		group = "diorama_menu",
		onenabled = function()
			return app.sprite ~= nil
		end,
		onclick = function()
			local ok, erro = pcall(dialogoEstilo)
			if not ok then
				app.alert{ title = "Diorama", text = limparErro(erro) }
			end
		end,
	}
	plugin:newCommand{
		id = "DioramaGirar",
		title = "Girar (RotSprite)…",
		group = "diorama_menu",
		onenabled = function()
			return app.sprite ~= nil
		end,
		onclick = comAlerta(dialogoGirar),
	}
	plugin:newCommand{
		id = "DioramaLimparLinhas",
		title = "Limpar doubles e jaggies…",
		group = "diorama_menu",
		onenabled = function()
			return app.sprite ~= nil
		end,
		onclick = comAlerta(dialogoLimpar),
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
