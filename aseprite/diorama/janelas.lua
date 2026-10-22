-- Diorama 0.5.0: as janelas do submenu Arquivo > Diorama > Ferramentas (2026-10-22).
--
-- Pedido do usuário: "faça as ferramentas que ficaram de fora e instale elas", para usar no Aseprite com janela o que
-- aseprite/adaptadores/ferramentas.lua faz em lote (biblioteca de pincéis com favoritos e grupos, pincéis de várias
-- camadas, carimbo ao longo de um traço girando pela direção, conjuntos e pincel ativo, cópias deslocadas/giradas/
-- redimensionadas, exportações, matiz/saturação/valor em cores escolhidas, matrizes de dithering). Este arquivo só
-- monta os diálogos e traduz o que o usuário escolheu nas opções das ações; quem desenha e grava é o ferramentas.lua
-- (por E.chamar), que a instalação copia para <extensão>/adaptadores/. Nada aqui usa io nem os.
--
-- Cada ação que mexe no sprite roda numa transação só ("Diorama: ..."): um Ctrl+Z desfaz tudo, inclusive a camada
-- nova. O arquivo do sprite nunca é gravado (salvar = false). A biblioteca do usuário fica na pasta de
-- D.pasta() (%APPDATA%\Aseprite\diorama\pinceis por padrão), fora do repositório.
--
-- Uso em docs/diorama/ASEPRITE.md, seção "Ferramentas". Testes: aseprite/testes/janelas.lua (npm run teste:aseprite),
-- com um Dialog de mentira que preenche os campos e clica nos botões.

return function(D)
	-- D: E() (o adaptador carregado), pasta(), prefs(), avisar(texto), alertar(texto), confirmar(texto, sim),
	-- limparErro(e), temporaria() (pasta para PNGs de prévia).
	local J = {}
	local floor, max, min = math.floor, math.max, math.min
	local pc = app.pixelColor

	local NENHUM = "(nenhum)"
	local TODOS = "(todos)"
	local SEM_GRUPO = "(sem grupo)"
	local ANCORAS = { "centro", "base", "topo", "esquerda", "direita", "topo_esquerda", "topo_direita", "base_esquerda", "base_direita" }
	local ANCORA_XY = {
		topo_esquerda = { 0, 0 }, topo = { 0.5, 0 }, topo_direita = { 1, 0 },
		esquerda = { 0, 0.5 }, centro = { 0.5, 0.5 }, direita = { 1, 0.5 },
		base_esquerda = { 0, 1 }, base = { 0.5, 1 }, base_direita = { 1, 1 },
	}
	local GIROS = { "rotsprite", "simples", "vizinho" }
	local SEQUENCIAS = { "em frente", "para trás", "vai e volta", "ao acaso", "sempre o primeiro" }
	local SEQ = { ["em frente"] = "frente", ["para trás"] = "tras", ["vai e volta"] = "vaivem", ["ao acaso"] = "aleatorio",
		["sempre o primeiro"] = "fixo" }
	local CAMADAS_MODO = { "casar pelo nome", "camadas novas", "tudo numa camada" }
	local MODO_CAMADAS = { ["casar pelo nome"] = "casar", ["camadas novas"] = "novas", ["tudo numa camada"] = "uma" }

	-- ---------------------------------------------------------------------------------------------------------------
	-- Utilidades

	local function E() return D.E() end

	local function semPrefixo(e)
		return (D.limparErro(e):gsub("^%[extensoes%] ", ""))
	end

	--- Chama uma ação do ferramentas.lua com a pasta da biblioteca e sem gravar o arquivo do sprite.
	local function chamar(acao, o)
		o = o or {}
		if o.pasta == nil then o.pasta = D.pasta() end
		if o.salvar == nil then o.salvar = false end
		return E().chamar(acao, o)
	end
	J.chamar = chamar

	--- Roda f; um erro vira aviso (a janela continua aberta).
	local function tentar(f)
		return function(...)
			local ok, e = pcall(f, ...)
			if not ok then D.alertar(semPrefixo(e)) end
		end
	end

	local function lembrado(chave)
		local p = D.prefs()
		if type(p.ferramentas) ~= "table" then p.ferramentas = {} end
		if type(p.ferramentas[chave]) ~= "table" then p.ferramentas[chave] = {} end
		return p.ferramentas[chave]
	end

	--- Guarda os valores simples do diálogo (texto, número, sim/não) para a próxima vez.
	local function lembrar(chave, d, campos)
		local t = lembrado(chave)
		for _, c in ipairs(campos) do
			local v = d[c]
			if type(v) == "string" or type(v) == "number" or type(v) == "boolean" then t[c] = v end
		end
	end

	local function exigirSprite()
		local spr = app.sprite
		if spr == nil then error("Abra um sprite antes.", 0) end
		return spr
	end

	local function quadroAtual()
		return app.frame and app.frame.frameNumber or 1
	end

	local function camadaDeImagem()
		local l = app.layer
		if l == nil or l.isGroup or l.isTilemap or not l.isImage then
			error("Escolha uma camada de imagem (não um grupo nem um tilemap).", 0)
		end
		return l
	end

	local function camadasDeImagem(camadas, lista)
		lista = lista or {}
		for _, l in ipairs(camadas) do
			if l.isGroup then
				camadasDeImagem(l.layers, lista)
			elseif l.isImage and not l.isTilemap then
				lista[#lista + 1] = l
			end
		end
		return lista
	end

	local function acharCamada(spr, nome)
		for _, l in ipairs(camadasDeImagem(spr.layers)) do
			if l.name == nome then return l end
		end
		return nil
	end

	--- "pincel", "pincel 2", "pincel 3"... o primeiro nome que nenhuma camada usa.
	local function nomeLivre(spr, base)
		local usados = {}
		local function percorrer(camadas)
			for _, l in ipairs(camadas) do
				usados[l.name] = true
				if l.isGroup then percorrer(l.layers) end
			end
		end
		percorrer(spr.layers)
		if not usados[base] then return base end
		local k = 2
		while usados[base .. " " .. k] do k = k + 1 end
		return base .. " " .. k
	end
	J.nomeLivre = nomeLivre

	--- Põe a camada `nome` (recém-criada no topo) logo acima de `ref`.
	local function porAcima(spr, nome, ref)
		if not ref then return end
		local l = acharCamada(spr, nome)
		if l and l ~= ref then
			pcall(function()
				l.parent = ref.parent
				l.stackIndex = ref.stackIndex + 1
			end)
		end
	end

	--- Uma transação só (um Ctrl+Z desfaz tudo); as transações do ferramentas.lua entram nela.
	local function transacao(nome, f)
		local r
		app.transaction("Diorama: " .. nome, function() r = f() end)
		app.refresh()
		return r
	end

	--- "10,20; 30,40" (ou uma linha por ponto) -> { {10, 20}, {30, 40} }.
	local function lerPontos(texto)
		local pontos = {}
		for x, y in tostring(texto or ""):gmatch("(-?%d+%.?%d*)%s*,%s*(-?%d+%.?%d*)") do
			pontos[#pontos + 1] = { floor(tonumber(x) + 0.5), floor(tonumber(y) + 0.5) }
		end
		return pontos
	end
	J.lerPontos = lerPontos

	--- "a, b, c" -> { "a", "b", "c" } (sem vazios).
	local function lerLista(texto)
		local t = {}
		for parte in tostring(texto or ""):gmatch("[^,;]+") do
			parte = parte:gsub("^%s+", ""):gsub("%s+$", "")
			if parte ~= "" then t[#t + 1] = parte end
		end
		return t
	end
	J.lerLista = lerLista

	local function hexDe(c)
		return string.format("#%02x%02x%02x%02x", c.red, c.green, c.blue, c.alpha)
	end

	local function rgbDe(c)
		return string.format("#%02x%02x%02x", c.red, c.green, c.blue)
	end

	local function corDeHex(h)
		h = h:gsub("^#", "")
		return Color{ r = tonumber(h:sub(1, 2), 16), g = tonumber(h:sub(3, 4), 16), b = tonumber(h:sub(5, 6), 16) }
	end

	local function retDe(r)
		return { r.x, r.y, r.width, r.height }
	end

	local function temSelecao(spr)
		return not spr.selection.isEmpty
	end

	--- A área de uma cópia ou exportação: a seleção, ou o que está desenhado nas camadas nos quadros.
	local function areaDoDesenho(spr, camadas, quadros)
		local uniao
		for _, l in ipairs(camadas) do
			for _, q in ipairs(quadros) do
				local cel = l:cel(q)
				if cel then
					local b = cel.bounds
					local img = cel.image
					local r = img:shrinkBounds()
					if not r.isEmpty then
						b = Rectangle(b.x + r.x, b.y + r.y, r.width, r.height)
						uniao = uniao and uniao:union(b) or b
					end
				end
			end
		end
		if not uniao then error("Nada desenhado nas camadas escolhidas (neste quadro). Desenhe algo ou faça uma seleção.", 0) end
		return uniao
	end

	local function pastaDoSprite(spr)
		local f = spr.filename or ""
		local pasta = app.fs.filePath(f)
		if pasta ~= "" and app.fs.isDirectory(pasta) then return pasta end
		return app.fs.userDocsPath
	end

	local function tituloDoSprite(spr)
		local t = app.fs.fileTitle(spr.filename or "")
		if t == "" then t = "sprite" end
		return t
	end

	--- Põe `img` (RGB) como pincel do Aseprite, com o ponto de apoio na âncora, e troca para o lápis.
	local function usarComoPincel(img, ancora)
		local spr = app.sprite
		local b = img
		if spr and spr.colorMode ~= ColorMode.RGB then b = E()._util.noModoDo(img, spr) end
		local a = ANCORA_XY[ancora or "centro"] or ANCORA_XY.centro
		local cx = min(img.width - 1, floor(img.width * a[1]))
		local cy = min(img.height - 1, floor(img.height * a[2]))
		app.brush = Brush{ type = BrushType.IMAGE, image = b, center = Point(cx, cy) }
		pcall(function() app.tool = "pencil" end)
	end
	J.usarComoPincel = usarComoPincel

	--- Desenha `img` no meio do canvas, ampliada pelo maior inteiro que cabe, sobre um xadrez.
	local function desenharPrevia(ev, img)
		local gc = ev.context
		local w, h = gc.width, gc.height
		for y = 0, h - 1, 8 do
			for x = 0, w - 1, 8 do
				local claro = ((x // 8 + y // 8) % 2 == 0)
				gc.color = claro and Color{ r = 205, g = 205, b = 205 } or Color{ r = 160, g = 160, b = 160 }
				gc:fillRect(Rectangle(x, y, 8, 8))
			end
		end
		if not img then return end
		local esc = min((w - 4) // img.width, (h - 4) // img.height)
		local dw, dh
		if esc >= 1 then
			dw, dh = img.width * esc, img.height * esc
		else
			local f = min(w / img.width, h / img.height)
			dw, dh = max(1, floor(img.width * f)), max(1, floor(img.height * f))
		end
		pcall(function() gc.antialias = false end)
		gc:drawImage(img, Rectangle(0, 0, img.width, img.height), Rectangle((w - dw) // 2, (h - dh) // 2, dw, dh))
	end

	--- Várias imagens lado a lado numa só (prévia de conjunto).
	local function emFila(imagens, espaco)
		espaco = espaco or 2
		local w, h = 0, 1
		for _, img in ipairs(imagens) do
			w = w + img.width + espaco
			h = max(h, img.height)
		end
		local out = Image(max(1, w - espaco), h, ColorMode.RGB)
		local x = 0
		for _, img in ipairs(imagens) do
			out:drawImage(img, Point(x, h - img.height))
			x = x + img.width + espaco
		end
		return out
	end

	-- ---------------------------------------------------------------------------------------------------------------
	-- Pincéis: listas para os diálogos

	local function rotuloPincel(p)
		local t = (p.favorito and "★ " or "") .. p.nome
		if #(p.camadas or {}) > 1 then t = t .. " [" .. #p.camadas .. " camadas]" end
		return t
	end

	--- Pincel de várias camadas: duas partes ou mais, cada uma com a camada dela. Um de uma parte só (mesmo feito
	--- com "várias camadas" de um sprite de uma camada) vai para a camada de destino, como um pincel comum.
	local function multicamada(p)
		return p ~= nil and #(p.camadas or {}) > 1 and #p.camadas == p.partes
	end

	--- As fontes de carimbo para o traço: pincéis (favoritos e recentes primeiro), conjuntos e o pincel ativo.
	local function fontesDeCarimbo()
		local nomes, mapa = {}, {}
		local ativo = chamar("ativo.ler", {})
		if ativo.ativo ~= false and ativo.fonte then
			local t = "pincel ativo"
			nomes[#nomes + 1] = t
			mapa[t] = { ativo = true }
		end
		for _, p in ipairs(chamar("biblioteca.listar", { ordenar = "recentes", favoritos_primeiro = true }).pinceis) do
			local t = "pincel: " .. rotuloPincel(p)
			nomes[#nomes + 1] = t
			mapa[t] = { pincel = p.id, info = p }
		end
		for _, c in ipairs(chamar("conjunto.listar", {}).conjuntos) do
			local t = "conjunto: " .. c.nome
			nomes[#nomes + 1] = t
			mapa[t] = { conjunto = c.id }
		end
		return nomes, mapa
	end

	--- As opções de destino de um carimbo: camada nova (ou a ativa), e o que fazer com pincel de várias camadas.
	local function destinoDoCarimbo(spr, o, destino, modoCamadas, varias, base)
		local nova = nil
		local modo = MODO_CAMADAS[modoCamadas or ""] or "casar"
		if varias and modo ~= "uma" then
			o.camadas_modo = modo
		else
			-- Tudo na camada do destino (um pincel de uma parte com nome de camada não abre camada com esse nome).
			o.camadas_modo = "uma"
			if destino == "camada ativa" then
				o.camada = camadaDeImagem().name
			else
				nova = nomeLivre(spr, base)
				o.camada = nova
			end
		end
		return nova
	end

	-- ---------------------------------------------------------------------------------------------------------------
	-- Carimbar (no centro da seleção, espalhado nela ou em pontos digitados)

	--- `fonte` = { pincel = id } | { conjunto = id } | { ativo = true }; `info` = o resumo do pincel (camadas);
	--- `extras` = opções de carimbo que valem por cima (as do diálogo de conjuntos).
	function J.carimbar(fonte, info, extras)
		local spr = exigirSprite()
		local ref = app.layer
		local sel = temSelecao(spr)
		local varias = multicamada(info)
		local u = lembrado("carimbar")
		local ondes = sel and { "no centro da seleção", "espalhado na seleção", "nos pontos digitados" }
			or { "no centro do sprite", "nos pontos digitados" }
		local dlg = Dialog("Carimbar")
		dlg:combobox{ id = "onde", label = "Onde", option = ondes[1], options = ondes }
		dlg:number{ id = "quantidade", label = "Quantos (espalhado)", text = tostring(u.quantidade or 12), decimals = 0 }
		dlg:entry{ id = "pontos", label = "Pontos (x,y; x,y)", text = u.pontos or "" }
		dlg:combobox{ id = "destino", label = "Resultado em", option = u.destino or "camada nova", options = { "camada nova", "camada ativa" } }
		if varias then
			dlg:combobox{ id = "camadas_modo", label = "Partes do pincel", option = u.camadas_modo or CAMADAS_MODO[1], options = CAMADAS_MODO }
		end
		dlg:number{ id = "escala", label = "Tamanho (%)", text = tostring(u.escala or 100), decimals = 0 }
		dlg:number{ id = "angulo", label = "Ângulo (graus, horário)", text = tostring(u.angulo or 0), decimals = 1 }
		dlg:check{ id = "espelhar_h", label = "Espelhar", text = "horizontal", selected = u.espelhar_h == true }
		dlg:check{ id = "espelhar_v", text = "vertical", selected = u.espelhar_v == true }
		dlg:number{ id = "escala_var", label = "Variar tamanho (± %)", text = tostring(u.escala_var or 0), decimals = 0 }
		dlg:number{ id = "angulo_var", label = "Variar ângulo (± graus)", text = tostring(u.angulo_var or 0), decimals = 0 }
		dlg:check{ id = "espelho_aleatorio", label = "Ao acaso", text = "espelhar metade das vezes", selected = u.espelho_aleatorio == true }
		dlg:combobox{ id = "giro", label = "Giro", option = u.giro or "rotsprite", options = GIROS }
		dlg:number{ id = "semente", label = "Semente (0 = ao acaso)", text = tostring(u.semente or 0), decimals = 0 }
		dlg:label{ text = "Ctrl+Z desfaz tudo de uma vez." }
		dlg:button{ id = "ok", text = "Carimbar", focus = true }
		dlg:button{ id = "cancelar", text = "Cancelar" }
		dlg:show()
		local d = dlg.data
		if not d.ok then return nil end
		lembrar("carimbar", d, { "quantidade", "pontos", "destino", "camadas_modo", "escala", "angulo", "espelhar_h", "espelhar_v",
			"escala_var", "angulo_var", "espelho_aleatorio", "giro", "semente" })

		local o = {}
		for k, v in pairs(extras or {}) do o[k] = v end
		o.quadro = quadroAtual()
		o.escala = (d.escala ~= 100) and d.escala / 100 or nil
		o.angulo = (d.angulo ~= 0) and d.angulo or nil
		o.espelhar_h, o.espelhar_v = d.espelhar_h or nil, d.espelhar_v or nil
		o.giro = d.giro
		if d.escala_var > 0 or d.angulo_var > 0 then o.jitter = { escala = d.escala_var, angulo = d.angulo_var } end
		if d.espelho_aleatorio then o.espelho_aleatorio_h = true end
		if d.semente ~= 0 then
			o.semente = d.semente
			math.randomseed(floor(d.semente))
		end
		local b = sel and spr.selection.bounds or spr.bounds
		if d.onde == "nos pontos digitados" then
			o.pontos = lerPontos(d.pontos)
			if #o.pontos == 0 then error("Digite os pontos como x,y; x,y (em pixels do sprite).", 0) end
		elseif d.onde == "espalhado na seleção" then
			o.pontos = {}
			local n = max(1, floor(d.quantidade))
			local tentativas = 0
			while #o.pontos < n and tentativas < n * 200 do
				tentativas = tentativas + 1
				local x = b.x + math.random(0, b.width - 1)
				local y = b.y + math.random(0, b.height - 1)
				if spr.selection:contains(x, y) then o.pontos[#o.pontos + 1] = { x, y } end
			end
		else
			o.pontos = { { b.x + b.width // 2, b.y + b.height // 2 } }
		end
		local nova = destinoDoCarimbo(spr, o, d.destino, d.camadas_modo, varias, "pincel")
		local acao = "biblioteca.carimbar"
		if fonte.ativo then
			acao = "ativo.carimbar"
		else
			o.pincel, o.conjunto = fonte.pincel, fonte.conjunto
		end
		local r = transacao("carimbar", function()
			local r = chamar(acao, o)
			porAcima(spr, nova, ref)
			return r
		end)
		D.avisar(string.format("%d carimbo(s), %d pixels em %s", r.carimbos, r.pixels, table.concat(r.camadas or {}, ", ")))
		return r
	end

	-- ---------------------------------------------------------------------------------------------------------------
	-- Biblioteca de pincéis (no lugar da janela do Brush Manager PRO)

	--- Cria um pincel do sprite ativo; devolve o id (ou nil se cancelou).
	function J.novoPincel()
		local spr = exigirSprite()
		local ativa = app.layer
		local sel = temSelecao(spr)
		local u = lembrado("novo_pincel")
		local areas = sel and { "a seleção", "a camada inteira" } or { "a camada inteira" }
		local dlg = Dialog("Novo pincel")
		dlg:entry{ id = "nome", label = "Nome", text = "", focus = true }
		dlg:combobox{ id = "area", label = "De onde", option = areas[1], options = areas }
		dlg:combobox{ id = "camadas", label = "Camadas", option = u.camadas or "só a camada ativa",
			options = { "só a camada ativa", "as visíveis, achatadas", "várias camadas (uma parte por camada visível)" } }
		dlg:check{ id = "aparar", label = "Bordas", text = "cortar o vazio em volta", selected = u.aparar ~= false }
		dlg:entry{ id = "grupo", label = "Grupo", text = u.grupo or "" }
		dlg:entry{ id = "etiquetas", label = "Etiquetas (a, b)", text = "" }
		dlg:combobox{ id = "ancora", label = "Ponto de apoio", option = u.ancora or "centro", options = ANCORAS }
		dlg:check{ id = "favorito", label = "Favorito", text = "★", selected = false }
		dlg:label{ text = "Biblioteca: " .. D.pasta() }
		dlg:button{ id = "ok", text = "Criar", focus = true }
		dlg:button{ id = "cancelar", text = "Cancelar" }
		dlg:show()
		local d = dlg.data
		if not d.ok then return nil end
		lembrar("novo_pincel", d, { "camadas", "aparar", "grupo", "ancora" })
		local nome = d.nome:gsub("^%s+", ""):gsub("%s+$", "")
		if nome == "" then error("Dê um nome ao pincel.", 0) end
		local origem = { quadro = quadroAtual(), aparar = d.aparar }
		if d.area == "a seleção" then origem.selecao = true end
		if d.camadas == "só a camada ativa" then
			if not ativa or ativa.isGroup or not ativa.isImage then error("Escolha uma camada de imagem.", 0) end
			origem.camada = ativa.name
		elseif d.camadas ~= "as visíveis, achatadas" then
			origem.todas_camadas = true
		end
		local o = { nome = nome, origem = origem, grupo = d.grupo ~= "" and d.grupo or nil, etiquetas = lerLista(d.etiquetas),
			ancora = d.ancora ~= "centro" and d.ancora or nil, favorito = d.favorito or nil }
		local ok, r = pcall(chamar, "biblioteca.criar", o)
		if not ok and tostring(r):find("já existe") then
			if not D.confirmar("Já existe um pincel \"" .. nome .. "\". Trocar pelo novo?", "Trocar") then return nil end
			o.substituir = true
			r = chamar("biblioteca.criar", o)
		elseif not ok then
			error(r, 0)
		end
		D.avisar(string.format("Pincel \"%s\" criado: %d×%d, %d parte(s)", r.nome, r.largura, r.altura, r.partes))
		return r.id
	end

	local function editarPincel(p)
		local dlg = Dialog("Editar pincel")
		dlg:entry{ id = "nome", label = "Nome", text = p.nome }
		dlg:entry{ id = "grupo", label = "Grupo", text = p.grupo or "" }
		dlg:entry{ id = "etiquetas", label = "Etiquetas (a, b)", text = table.concat(p.etiquetas or {}, ", ") }
		dlg:entry{ id = "descricao", label = "Descrição", text = p.descricao or "" }
		dlg:combobox{ id = "ancora", label = "Ponto de apoio", option = p.ancora or "centro", options = ANCORAS }
		dlg:check{ id = "favorito", label = "Favorito", text = "★", selected = p.favorito == true }
		dlg:button{ id = "ok", text = "Salvar", focus = true }
		dlg:button{ id = "cancelar", text = "Cancelar" }
		dlg:show()
		local d = dlg.data
		if not d.ok then return false end
		chamar("biblioteca.editar", { pincel = p.id, novo_nome = d.nome ~= "" and d.nome or nil, grupo = d.grupo,
			etiquetas = lerLista(d.etiquetas), descricao = d.descricao, ancora = d.ancora, favorito = d.favorito })
		return true
	end

	local function gruposDaBiblioteca()
		local g = chamar("biblioteca.grupos", {})
		local nomes = { TODOS, SEM_GRUPO }
		for _, x in ipairs(g.grupos) do
			if x.nome ~= "" then nomes[#nomes + 1] = x.nome end
		end
		return nomes, g
	end

	local function renomearEmLote()
		local grupos = gruposDaBiblioteca()
		local dlg = Dialog("Renomear em lote")
		dlg:combobox{ id = "grupo", label = "Grupo", option = TODOS, options = grupos }
		dlg:entry{ id = "etiqueta", label = "Com a etiqueta", text = "" }
		dlg:entry{ id = "texto", label = "Com o texto", text = "" }
		dlg:entry{ id = "padrao", label = "Nome novo", text = "pincel_%02d" }
		dlg:number{ id = "inicio", label = "Começar em", text = "1", decimals = 0 }
		dlg:label{ text = "%02d vira 01, 02, 03… (em ordem de nome)." }
		dlg:button{ id = "ok", text = "Renomear", focus = true }
		dlg:button{ id = "cancelar", text = "Cancelar" }
		dlg:show()
		local d = dlg.data
		if not d.ok then return false end
		if not d.padrao:find("%%0?%d*d") then error("O nome novo precisa de um número, como grama_%02d.", 0) end
		local o = { padrao = d.padrao, inicio = floor(d.inicio) }
		if d.grupo == SEM_GRUPO then o.grupo = "" elseif d.grupo ~= TODOS then o.grupo = d.grupo end
		if d.etiqueta ~= "" then o.etiqueta = d.etiqueta end
		if d.texto ~= "" then o.texto = d.texto end
		local r = chamar("biblioteca.renomear", o)
		D.avisar(r.total .. " pincel(is) renomeado(s)")
		return true
	end

	local function importar()
		local dlg = Dialog("Importar pincéis")
		dlg:file{ id = "arquivo", label = "Arquivo", title = "Biblioteca .aseprite com fatias (uma fatia por pincel)", open = true,
			filetypes = { "aseprite", "ase" } }
		dlg:check{ id = "camadas", label = "Camadas", text = "uma parte por camada (pincel de várias camadas)", selected = false }
		dlg:entry{ id = "grupo", label = "Grupo", text = "" }
		dlg:entry{ id = "prefixo", label = "Prefixo do nome", text = "" }
		dlg:button{ id = "ok", text = "Importar", focus = true }
		dlg:button{ id = "cancelar", text = "Cancelar" }
		dlg:show()
		local d = dlg.data
		if not d.ok then return false end
		if (d.arquivo or "") == "" or not app.fs.isFile(d.arquivo) then error("Escolha o arquivo .aseprite.", 0) end
		local r = chamar("biblioteca.importar", { biblioteca = d.arquivo, camadas = d.camadas or nil,
			grupo = d.grupo ~= "" and d.grupo or nil, prefixo = d.prefixo ~= "" and d.prefixo or nil })
		D.avisar(string.format("%d pincel(is) importado(s), %d pulado(s)", r.total, #r.pulados))
		return true
	end

	function J.biblioteca()
		local u = lembrado("biblioteca")
		local estado = { porRotulo = {}, imagem = nil, fechar = nil }
		local dlg
		local grupos = gruposDaBiblioteca()
		local ORDENS = { ["nome"] = "nome", ["usados há pouco"] = "recentes", ["mais usados"] = "usos", ["criação"] = "criado" }

		local function atual()
			return estado.porRotulo[dlg.data.pincel]
		end

		local function mostrar()
			local p = atual()
			estado.imagem = nil
			local texto = "Nenhum pincel. Crie um com \"Novo pincel…\" (da seleção ou da camada)."
			if p then
				local ok, imgs = pcall(function() return (E()._interno.imagens{ pasta = D.pasta(), pincel = p.id }) end)
				if ok then estado.imagem = imgs[1] end
				local partes = { string.format("%d×%d", p.largura, p.altura) }
				if p.grupo then partes[#partes + 1] = "grupo " .. p.grupo end
				if #p.etiquetas > 0 then partes[#partes + 1] = table.concat(p.etiquetas, ", ") end
				if #p.camadas > 1 then partes[#partes + 1] = #p.camadas .. " camadas" end
				partes[#partes + 1] = "usado " .. p.usos .. "×"
				texto = table.concat(partes, " · ")
			end
			dlg:modify{ id = "info", text = texto }
			for _, id in ipairs({ "usar", "carimbar", "ativar", "favorito", "editar", "apagar" }) do
				dlg:modify{ id = id, enabled = p ~= nil }
			end
			dlg:repaint()
		end

		local function carregar(manter)
			local d = dlg.data
			local o = { ordenar = ORDENS[d.ordenar] or "nome", favoritos_primeiro = true }
			if d.texto ~= "" then o.texto = d.texto end
			if d.grupo == SEM_GRUPO then o.grupo = "" elseif d.grupo ~= TODOS then o.grupo = d.grupo end
			if d.favoritos then o.favoritos = true end
			local r = chamar("biblioteca.listar", o)
			-- O escolhido antes de trocar a lista (depois de renomear, o rótulo dele muda).
			manter = manter or (atual() and atual().id)
			estado.porRotulo = {}
			local nomes = {}
			for _, p in ipairs(r.pinceis) do
				local t = rotuloPincel(p)
				nomes[#nomes + 1] = t
				estado.porRotulo[t] = p
			end
			if #nomes == 0 then nomes = { NENHUM } end
			local escolha = nomes[1]
			for _, t in ipairs(nomes) do
				if estado.porRotulo[t] and estado.porRotulo[t].id == manter then escolha = t end
			end
			dlg:modify{ id = "pincel", options = nomes, option = escolha }
			mostrar()
		end

		local function recarregarGrupos()
			grupos = gruposDaBiblioteca()
			local g = dlg.data.grupo
			local existe = false
			for _, x in ipairs(grupos) do if x == g then existe = true end end
			dlg:modify{ id = "grupo", options = grupos, option = existe and g or TODOS }
		end

		dlg = Dialog("Biblioteca de pincéis")
		dlg:entry{ id = "texto", label = "Procurar", text = "", onchange = tentar(function() carregar() end) }
		dlg:combobox{ id = "grupo", label = "Grupo", option = TODOS, options = grupos, onchange = tentar(function() carregar() end) }
		dlg:check{ id = "favoritos", label = "Mostrar", text = "só os favoritos ★", selected = u.favoritos == true,
			onclick = tentar(function() carregar() end) }
		dlg:combobox{ id = "ordenar", label = "Ordem", option = u.ordenar or "nome", options = { "nome", "usados há pouco", "mais usados", "criação" },
			onchange = tentar(function() carregar() end) }
		dlg:separator{}
		dlg:combobox{ id = "pincel", label = "Pincel", option = NENHUM, options = { NENHUM }, onchange = tentar(mostrar) }
		dlg:canvas{ id = "previa", width = 160, height = 96, onpaint = function(ev) desenharPrevia(ev, estado.imagem) end }
		dlg:label{ id = "info", text = "" }
		dlg:separator{ text = "Usar" }
		dlg:button{ id = "usar", text = "Pintar com ele (pincel do Aseprite)", onclick = tentar(function()
			local p = atual()
			if not p or not estado.imagem then return end
			usarComoPincel(estado.imagem, p.ancora)
			estado.fechar = "usar"
			dlg:close()
			D.avisar("Pincel \"" .. p.nome .. "\" no lápis" .. (#p.camadas > 1 and " (achatado: o lápis pinta numa camada só)" or ""))
		end) }
		dlg:button{ id = "carimbar", text = "Carimbar…", onclick = tentar(function()
			local p = atual()
			if not p then return end
			exigirSprite()
			estado.fechar = "carimbar"
			dlg:close()
			J.carimbar({ pincel = p.id }, p)
		end) }
		dlg:button{ id = "ativar", text = "Tornar ativo", onclick = tentar(function()
			local p = atual()
			if not p then return end
			chamar("ativo.definir", { pincel = p.id })
			D.avisar("Pincel ativo: " .. p.nome)
		end) }
		dlg:separator{ text = "Organizar" }
		dlg:button{ id = "favorito", text = "★ Favorito (liga/desliga)", onclick = tentar(function()
			local p = atual()
			if not p then return end
			chamar("biblioteca.editar", { pincel = p.id, favorito = not p.favorito })
			carregar(p.id)
		end) }
		dlg:button{ id = "editar", text = "Nome, grupo, etiquetas…", onclick = tentar(function()
			local p = atual()
			if p and editarPincel(p) then
				recarregarGrupos()
				carregar(p.id)
			end
		end) }
		dlg:button{ id = "apagar", text = "Apagar", onclick = tentar(function()
			local p = atual()
			if not p or not D.confirmar("Apagar o pincel \"" .. p.nome .. "\"?", "Apagar") then return end
			local ok, e = pcall(chamar, "biblioteca.apagar", { pincel = p.id })
			if not ok and tostring(e):find("conjuntos") then
				if not D.confirmar(semPrefixo(e) .. ". Tirar dos conjuntos e apagar?", "Apagar") then return end
				chamar("biblioteca.apagar", { pincel = p.id, forcar = true })
			elseif not ok then
				error(e, 0)
			end
			recarregarGrupos()
			carregar()
		end) }
		dlg:newrow()
		dlg:button{ id = "novo", text = "Novo pincel…", onclick = tentar(function()
			local id = J.novoPincel()
			if id then
				recarregarGrupos()
				carregar(id)
			end
		end) }
		dlg:button{ id = "renomear", text = "Renomear em lote…", onclick = tentar(function()
			if renomearEmLote() then carregar() end
		end) }
		dlg:button{ id = "importar", text = "Importar…", onclick = tentar(function()
			if importar() then
				recarregarGrupos()
				carregar()
			end
		end) }
		dlg:button{ id = "prancha", text = "Ver todos (prancha)", onclick = tentar(function()
			local d = dlg.data
			local o = { png = app.fs.joinPath(D.temporaria(), "prancha_pinceis.png"), escala = 4, colunas = 8 }
			if d.grupo == SEM_GRUPO then o.grupo = "" elseif d.grupo ~= TODOS then o.grupo = d.grupo end
			if d.favoritos then o.favoritos = true end
			local r = chamar("biblioteca.previa", o)
			estado.fechar = "prancha"
			dlg:close()
			app.open(r.png)
		end) }
		dlg:separator{}
		dlg:label{ text = "Biblioteca: " .. D.pasta() }
		dlg:button{ id = "fechar", text = "Fechar" }
		carregar()
		dlg:show()
		lembrar("biblioteca", dlg.data, { "favoritos", "ordenar" })
		return estado.fechar
	end

	-- ---------------------------------------------------------------------------------------------------------------
	-- Carimbar ao longo de um traço (camada-guia, contorno da seleção ou pontos), girando pela direção

	local CAMINHOS = { "camada-guia", "contorno da seleção", "pontos digitados" }

	function J.traco()
		local spr = exigirSprite()
		local ref = app.layer
		local fontes, mapa = fontesDeCarimbo()
		if #fontes == 0 then
			error("A biblioteca está vazia: crie um pincel em Ferramentas > Biblioteca de pincéis… > Novo pincel… (da seleção ou da camada).", 0)
		end
		local u = lembrado("traco")
		local nomes = {}
		local guiaPadrao
		for _, l in ipairs(camadasDeImagem(spr.layers)) do
			nomes[#nomes + 1] = l.name
			local n = l.name:lower()
			if n == "guia" or n == "traço" or n == "traco" or n == "caminho" then guiaPadrao = l.name end
		end
		if not guiaPadrao and ref and ref.isImage then guiaPadrao = ref.name end
		local fontePadrao = fontes[1]
		for _, f in ipairs(fontes) do if f == u.fonte then fontePadrao = f end end
		local caminhoPadrao = u.caminho or "camada-guia"
		if caminhoPadrao == "contorno da seleção" and not temSelecao(spr) then caminhoPadrao = "camada-guia" end

		local dlg
		local function ajustar()
			local c = dlg.data.caminho
			dlg:modify{ id = "guia", enabled = c == "camada-guia" }
			dlg:modify{ id = "esconder", enabled = c == "camada-guia" }
			dlg:modify{ id = "pontos", enabled = c == "pontos digitados" }
			dlg:modify{ id = "fechado", enabled = c == "pontos digitados" }
		end
		dlg = Dialog("Carimbar ao longo de um traço")
		dlg:combobox{ id = "fonte", label = "Pincel", option = fontePadrao, options = fontes }
		dlg:combobox{ id = "caminho", label = "Caminho", option = caminhoPadrao, options = CAMINHOS, onchange = ajustar }
		dlg:combobox{ id = "guia", label = "Camada-guia", option = guiaPadrao or nomes[1], options = #nomes > 0 and nomes or { NENHUM } }
		dlg:check{ id = "esconder", text = "esconder a camada-guia depois", selected = u.esconder ~= false }
		dlg:entry{ id = "pontos", label = "Pontos (x,y; x,y…)", text = u.pontos or "" }
		dlg:check{ id = "fechado", text = "fechar (liga o fim ao começo)", selected = u.fechado == true }
		dlg:check{ id = "inverter", label = "Sentido", text = "ao contrário", selected = false }
		dlg:separator{ text = "Carimbos" }
		dlg:number{ id = "espacamento", label = "Espaçamento (px; 0 = meio pincel)", text = tostring(u.espacamento or 0), decimals = 0 }
		dlg:check{ id = "girar", label = "Girar", text = "cada carimbo pela direção do traço", selected = u.girar ~= false }
		dlg:number{ id = "angulo_base", label = "Somar ao ângulo (graus)", text = tostring(u.angulo_base or 0), decimals = 0 }
		dlg:combobox{ id = "passo", label = "Arredondar ângulo", option = u.passo or "não", options = { "não", "45°", "90°" } }
		dlg:combobox{ id = "suavizar", label = "Curvas", option = u.suavizar or "suaves", options = { "suaves", "bem suaves", "sem suavizar" } }
		dlg:number{ id = "escala", label = "Tamanho (%)", text = tostring(u.escala or 100), decimals = 0 }
		dlg:number{ id = "lateral", label = "Desvio para os lados (px)", text = tostring(u.lateral or 0), decimals = 0 }
		dlg:number{ id = "angulo_var", label = "Variar ângulo (± graus)", text = tostring(u.angulo_var or 0), decimals = 0 }
		dlg:number{ id = "escala_var", label = "Variar tamanho (± %)", text = tostring(u.escala_var or 0), decimals = 0 }
		dlg:combobox{ id = "sequencia", label = "Ordem (conjunto)", option = u.sequencia or SEQUENCIAS[1], options = SEQUENCIAS }
		dlg:combobox{ id = "camadas_modo", label = "Pincel de várias camadas", option = u.camadas_modo or CAMADAS_MODO[1], options = CAMADAS_MODO }
		dlg:combobox{ id = "giro", label = "Giro", option = u.giro or "rotsprite", options = GIROS }
		dlg:number{ id = "semente", label = "Semente (0 = ao acaso)", text = tostring(u.semente or 0), decimals = 0 }
		dlg:label{ text = "Camada-guia: desenhe o traço com o lápis, 1 px, numa camada só para isso." }
		dlg:label{ text = "O resultado vai para uma camada nova; Ctrl+Z desfaz tudo." }
		dlg:button{ id = "ok", text = "Carimbar", focus = true }
		dlg:button{ id = "cancelar", text = "Cancelar" }
		ajustar()
		dlg:show()
		local d = dlg.data
		if not d.ok then return nil end
		lembrar("traco", d, { "fonte", "caminho", "esconder", "pontos", "fechado", "espacamento", "girar", "angulo_base", "passo", "suavizar",
			"escala", "lateral", "angulo_var", "escala_var", "sequencia", "camadas_modo", "giro", "semente" })

		local fonte = mapa[d.fonte]
		if not fonte then error("Escolha o pincel.", 0) end
		local o = { quadro = quadroAtual(), girar_pelo_traco = d.girar, giro = d.giro, sequencia = SEQ[d.sequencia] }
		local guia
		if d.caminho == "camada-guia" then
			guia = acharCamada(spr, d.guia)
			if not guia then error("Escolha a camada-guia (uma camada de imagem com o traço desenhado).", 0) end
			o.tracos = chamar("caminho.da_camada", { camada = d.guia, quadro = o.quadro, inverter = d.inverter or nil }).tracos
		elseif d.caminho == "contorno da seleção" then
			if not temSelecao(spr) then error("Faça uma seleção antes (o contorno dela vira o traço).", 0) end
			o.tracos = chamar("caminho.da_selecao", { inverter = d.inverter or nil }).tracos
		else
			local pts = lerPontos(d.pontos)
			if #pts < 2 then error("Digite pelo menos dois pontos: x,y; x,y (em pixels do sprite).", 0) end
			if d.inverter then
				local inv = {}
				for i = #pts, 1, -1 do inv[#inv + 1] = pts[i] end
				pts = inv
			end
			o.tracos = { { pontos = pts, fechado = d.fechado } }
		end
		if d.espacamento > 0 then o.espacamento = d.espacamento end
		if d.angulo_base ~= 0 then o.angulo_base = d.angulo_base end
		if d.passo == "45°" then o.passo_angulo = 45 elseif d.passo == "90°" then o.passo_angulo = 90 end
		if d.suavizar == "sem suavizar" then
			o.suavizar = 0
		elseif d.suavizar == "bem suaves" then
			o.suavizar = (o.espacamento or 4) * 3
		end
		if d.escala ~= 100 then o.escala = d.escala / 100 end
		if d.lateral > 0 or d.angulo_var > 0 or d.escala_var > 0 then
			o.jitter = { lateral = d.lateral, angulo = d.angulo_var, escala = d.escala_var }
		end
		if d.semente ~= 0 then o.semente = d.semente end
		local nova = destinoDoCarimbo(spr, o, "camada nova", d.camadas_modo, multicamada(fonte.info), "traço")
		local acao = "biblioteca.carimbar"
		if fonte.ativo then acao = "ativo.carimbar" else o.pincel, o.conjunto = fonte.pincel, fonte.conjunto end
		local r = transacao("carimbar no traço", function()
			local r = chamar(acao, o)
			porAcima(spr, nova, guia or ref)
			if guia and d.esconder then guia.isVisible = false end
			return r
		end)
		D.avisar(string.format("%d carimbo(s) em %d traço(s), %.0f px de comprimento", r.carimbos, r.tracos or 1, r.comprimento or 0))
		return r
	end

	-- ---------------------------------------------------------------------------------------------------------------
	-- Conjuntos e pincel ativo (no lugar dos conjuntos e do pincel trocado a cada traço do Live Brush)

	--- O próximo pincel do ativo no lápis do Aseprite (o item de menu que dá para pôr num atalho de teclado).
	function J.proximoPincel()
		local at = chamar("ativo.ler", {})
		if at.ativo == false or not at.fonte then
			error("Nenhum pincel ativo: escolha um em Ferramentas > Conjuntos e pincel ativo… > Tornar pincel ativo.", 0)
		end
		local img, info = E()._interno.proximoAtivo{ pasta = D.pasta() }
		usarComoPincel(img, info.ancora)
		D.avisar(string.format("Pincel %d de %d (%d×%d%s)", info.indice, info.total, info.largura, info.altura,
			info.angulo ~= 0 and (", " .. info.angulo .. "°") or ""))
		return info
	end

	local function opcoesDoConjunto(d)
		local o = { sequencia = SEQ[d.sequencia] or "frente" }
		if d.repeticao > 1 then o.repeticao = floor(d.repeticao) end
		if d.escala_min ~= 100 or d.escala_max ~= 100 then o.escala_aleatoria = { d.escala_min / 100, d.escala_max / 100 } end
		if d.angulo_var > 0 then o.angulo_aleatorio = { -d.angulo_var, d.angulo_var } end
		if d.rotacao_passo ~= 0 then o.rotacao_passo = d.rotacao_passo end
		if d.espelho then o.espelho_aleatorio_h = true end
		return o
	end
	J.opcoesDoConjunto = opcoesDoConjunto

	local function novoConjuntoDaSelecao()
		local spr = exigirSprite()
		local ativa = app.layer
		local sel = temSelecao(spr)
		local dlg = Dialog("Novo conjunto")
		dlg:entry{ id = "nome", label = "Nome", text = "", focus = true }
		dlg:combobox{ id = "corte", label = "Cortar em", option = "cada desenho separado",
			options = { "cada desenho separado", "grade", "um por quadro (a mesma área)" } }
		dlg:number{ id = "largura", label = "Grade: largura", text = "16", decimals = 0 }
		dlg:number{ id = "altura", label = "Grade: altura", text = "16", decimals = 0 }
		dlg:combobox{ id = "camadas", label = "Camadas", option = "as visíveis, achatadas", options = { "as visíveis, achatadas", "só a camada ativa" } }
		dlg:label{ text = sel and "Área: a seleção." or "Área: o sprite inteiro (sem seleção)." }
		dlg:button{ id = "ok", text = "Criar", focus = true }
		dlg:button{ id = "cancelar", text = "Cancelar" }
		dlg:show()
		local d = dlg.data
		if not d.ok then return nil end
		if d.nome == "" then error("Dê um nome ao conjunto.", 0) end
		local origem = { quadro = quadroAtual() }
		if sel then origem.retangulo = retDe(spr.selection.bounds) end
		if d.camadas == "só a camada ativa" then
			if not ativa or not ativa.isImage then error("Escolha uma camada de imagem.", 0) end
			origem.camada = ativa.name
		end
		local o = { nome = d.nome, origem = origem }
		if d.corte == "grade" then
			o.grade = { max(1, floor(d.largura)), max(1, floor(d.altura)) }
		elseif d.corte == "um por quadro (a mesma área)" then
			o.quadros = {}
			for i = 1, #spr.frames do o.quadros[i] = i end
		else
			o.separar = true
			o.minimo = 2
		end
		local r = chamar("conjunto.gravar", o)
		D.avisar(string.format("Conjunto \"%s\": %d pincel(is)", r.nome, r.itens))
		return r.id
	end

	local function novoConjuntoDePinceis()
		local grupos = gruposDaBiblioteca()
		local dlg = Dialog("Conjunto de pincéis da biblioteca")
		dlg:entry{ id = "nome", label = "Nome", text = "", focus = true }
		dlg:combobox{ id = "grupo", label = "Todos do grupo", option = TODOS, options = grupos }
		dlg:entry{ id = "nomes", label = "Ou estes (a, b, c)", text = "" }
		dlg:button{ id = "ok", text = "Criar", focus = true }
		dlg:button{ id = "cancelar", text = "Cancelar" }
		dlg:show()
		local d = dlg.data
		if not d.ok then return nil end
		if d.nome == "" then error("Dê um nome ao conjunto.", 0) end
		local pinceis = lerLista(d.nomes)
		if #pinceis == 0 then
			local o = { ordenar = "nome" }
			if d.grupo == SEM_GRUPO then o.grupo = "" elseif d.grupo ~= TODOS then o.grupo = d.grupo end
			for _, p in ipairs(chamar("biblioteca.listar", o).pinceis) do pinceis[#pinceis + 1] = p.id end
		end
		if #pinceis == 0 then error("Nenhum pincel nesse grupo.", 0) end
		local r = chamar("conjunto.gravar", { nome = d.nome, pinceis = pinceis })
		D.avisar(string.format("Conjunto \"%s\": %d pincel(is)", r.nome, r.itens))
		return r.id
	end

	function J.conjuntos()
		local estado = { porNome = {}, imagem = nil, fechar = nil }
		local dlg

		local function textoAtivo()
			local at = chamar("ativo.ler", {})
			if at.ativo == false or not at.fonte then return "Pincel ativo: nenhum." end
			local f = at.fonte
			local qual = f.conjunto and ("conjunto " .. f.conjunto) or f.pincel and ("pincel " .. f.pincel) or "recorte"
			return string.format("Pincel ativo: %s (próximo depois do %d).", qual, (at.seq and at.seq.indice) or 1)
		end

		local function atual()
			return estado.porNome[dlg.data.conjunto]
		end

		local function mostrar()
			local c = atual()
			estado.imagem = nil
			local info = "Nenhum conjunto. Crie um da seleção ou de pincéis da biblioteca."
			if c then
				local ok, imgs = pcall(function() return (E()._interno.imagens{ pasta = D.pasta(), conjunto = c.id }) end)
				if ok then estado.imagem = emFila(imgs) end
				info = string.format("%d pincel(is)%s", c.itens, c.da_biblioteca > 0 and (" (" .. c.da_biblioteca .. " da biblioteca)") or "")
				local op = c.opcoes or {}
				local inv = {}
				for k, v in pairs(SEQ) do inv[v] = k end
				dlg:modify{ id = "sequencia", option = inv[op.sequencia or "frente"] or SEQUENCIAS[1] }
				dlg:modify{ id = "repeticao", text = tostring(op.repeticao or 1) }
				local ea = op.escala_aleatoria
				dlg:modify{ id = "escala_min", text = tostring(ea and floor((ea[1] or 1) * 100 + 0.5) or 100) }
				dlg:modify{ id = "escala_max", text = tostring(ea and floor((ea[2] or ea[1] or 1) * 100 + 0.5) or 100) }
				local aa = op.angulo_aleatorio
				dlg:modify{ id = "angulo_var", text = tostring(aa and math.abs(aa[2] or aa[1] or 0) or 0) }
				dlg:modify{ id = "rotacao_passo", text = tostring(op.rotacao_passo or 0) }
				dlg:modify{ id = "espelho", selected = op.espelho_aleatorio_h == true }
			end
			dlg:modify{ id = "info", text = info }
			dlg:modify{ id = "ativo", text = textoAtivo() }
			for _, id in ipairs({ "guardar", "ativar", "carimbar", "apagar" }) do dlg:modify{ id = id, enabled = c ~= nil } end
			dlg:repaint()
		end

		local function carregar(manter)
			local lista = chamar("conjunto.listar", {}).conjuntos
			estado.porNome = {}
			local nomes = {}
			local escolha
			for _, c in ipairs(lista) do
				nomes[#nomes + 1] = c.nome
				estado.porNome[c.nome] = c
				if c.id == manter then escolha = c.nome end
			end
			if #nomes == 0 then nomes = { NENHUM } end
			dlg:modify{ id = "conjunto", options = nomes, option = escolha or nomes[1] }
			mostrar()
		end

		dlg = Dialog("Conjuntos e pincel ativo")
		dlg:combobox{ id = "conjunto", label = "Conjunto", option = NENHUM, options = { NENHUM }, onchange = tentar(mostrar) }
		dlg:canvas{ id = "previa", width = 240, height = 64, onpaint = function(ev) desenharPrevia(ev, estado.imagem) end }
		dlg:label{ id = "info", text = "" }
		dlg:separator{ text = "Como troca de pincel" }
		dlg:combobox{ id = "sequencia", label = "Ordem", option = SEQUENCIAS[1], options = SEQUENCIAS }
		dlg:number{ id = "repeticao", label = "Repetir cada um (vezes)", text = "1", decimals = 0 }
		dlg:number{ id = "escala_min", label = "Tamanho ao acaso: de (%)", text = "100", decimals = 0 }
		dlg:number{ id = "escala_max", label = "até (%)", text = "100", decimals = 0 }
		dlg:number{ id = "angulo_var", label = "Ângulo ao acaso (± graus)", text = "0", decimals = 0 }
		dlg:number{ id = "rotacao_passo", label = "Girar a cada troca (graus)", text = "0", decimals = 0 }
		dlg:check{ id = "espelho", label = "Espelho", text = "espelhar ao acaso", selected = false }
		dlg:button{ id = "guardar", text = "Guardar estas opções no conjunto", onclick = tentar(function()
			local c = atual()
			if not c then return end
			chamar("conjunto.editar", { conjunto = c.id, opcoes = opcoesDoConjunto(dlg.data) })
			carregar(c.id)
			D.avisar("Opções guardadas em \"" .. c.nome .. "\"")
		end) }
		dlg:separator{ text = "Usar" }
		dlg:label{ id = "ativo", text = "" }
		dlg:button{ id = "ativar", text = "Tornar pincel ativo", onclick = tentar(function()
			local c = atual()
			if not c then return end
			local o = opcoesDoConjunto(dlg.data)
			o.conjunto = c.id
			chamar("ativo.definir", o)
			mostrar()
			D.avisar("Pincel ativo: conjunto \"" .. c.nome .. "\". Use \"Próximo pincel do conjunto ativo\" (dá para pôr num atalho).")
		end) }
		dlg:button{ id = "proximo", text = "Próximo no lápis", onclick = tentar(function()
			J.proximoPincel()
			estado.fechar = "proximo"
			dlg:close()
		end) }
		dlg:newrow()
		dlg:button{ id = "reiniciar", text = "Recomeçar a ordem", onclick = tentar(function()
			chamar("ativo.ajustar", { reiniciar = true })
			mostrar()
		end) }
		dlg:button{ id = "carimbar", text = "Carimbar…", onclick = tentar(function()
			local c = atual()
			if not c then return end
			exigirSprite()
			local extras = opcoesDoConjunto(dlg.data)
			estado.fechar = "carimbar"
			dlg:close()
			J.carimbar({ conjunto = c.id }, nil, extras)
		end) }
		dlg:separator{ text = "Organizar" }
		dlg:button{ id = "novo_selecao", text = "Novo da seleção…", onclick = tentar(function()
			local id = novoConjuntoDaSelecao()
			if id then carregar(id) end
		end) }
		dlg:button{ id = "novo_pinceis", text = "Novo de pincéis…", onclick = tentar(function()
			local id = novoConjuntoDePinceis()
			if id then carregar(id) end
		end) }
		dlg:button{ id = "apagar", text = "Apagar", onclick = tentar(function()
			local c = atual()
			if not c or not D.confirmar("Apagar o conjunto \"" .. c.nome .. "\"? (os pincéis da biblioteca ficam)", "Apagar") then return end
			chamar("conjunto.apagar", { conjunto = c.id })
			carregar()
		end) }
		dlg:separator{}
		dlg:button{ id = "fechar", text = "Fechar" }
		carregar()
		dlg:show()
		return estado.fechar
	end

	-- ---------------------------------------------------------------------------------------------------------------
	-- Copiar deslocando, girando, redimensionando (no lugar do que o Carbs Toolbar faz com a seleção flutuante)

	local DIRECOES = { "→ direita", "← esquerda", "↓ baixo", "↑ cima", "↘ baixo e direita", "↙ baixo e esquerda",
		"↗ cima e direita", "↖ cima e esquerda", "dx, dy (px)" }
	local DIRECAO = { ["→ direita"] = "direita", ["← esquerda"] = "esquerda", ["↓ baixo"] = "baixo", ["↑ cima"] = "cima",
		["↘ baixo e direita"] = "baixo_direita", ["↙ baixo e esquerda"] = "baixo_esquerda", ["↗ cima e direita"] = "cima_direita",
		["↖ cima e esquerda"] = "cima_esquerda" }
	local ONDES = { "no lugar do original (centrada)", "ao lado, à direita", "ao lado, embaixo", "ao lado, à esquerda", "ao lado, em cima" }
	local AO_LADO = { ["ao lado, à direita"] = "direita", ["ao lado, embaixo"] = "baixo", ["ao lado, à esquerda"] = "esquerda",
		["ao lado, em cima"] = "cima" }

	--- Os campos comuns às três cópias.
	local function camposDaCopia(dlg, spr, u)
		local sel = temSelecao(spr)
		local b = spr.selection.bounds
		dlg:label{ text = sel and string.format("Área: a seleção (%d×%d em %d,%d).", b.width, b.height, b.x, b.y)
			or "Área: o que está desenhado (sem seleção)." }
		dlg:combobox{ id = "camadas", label = "Camadas", option = u.camadas or "camada ativa", options = { "camada ativa", "camadas visíveis", "todas as camadas" } }
		dlg:combobox{ id = "quadros", label = "Quadros", option = u.quadros or "quadro atual", options = { "quadro atual", "todos os quadros" } }
		dlg:combobox{ id = "destino", label = "Cópias em", option = u.destino or "mesma camada", options = { "mesma camada", "camada nova" } }
	end

	--- As opções comuns, a partir dos campos acima. Devolve as opções e o nome da camada nova (se houver).
	local function opcoesDaCopia(spr, d)
		local o = {}
		local camadas
		if d.camadas == "camada ativa" then
			local l = camadaDeImagem()
			o.camada = l.name
			camadas = { l }
		else
			o.camadas = d.camadas == "todas as camadas" and "todas" or "visiveis"
			camadas = {}
			for _, l in ipairs(camadasDeImagem(spr.layers)) do
				if d.camadas == "todas as camadas" or l.isVisible then camadas[#camadas + 1] = l end
			end
		end
		local quadros
		if d.quadros == "todos os quadros" then
			o.quadros = "todos"
			quadros = {}
			for i = 1, #spr.frames do quadros[i] = i end
		else
			o.quadro = quadroAtual()
			quadros = { o.quadro }
		end
		if temSelecao(spr) then
			o.selecao = true
		else
			o.retangulo = retDe(areaDoDesenho(spr, camadas, quadros))
		end
		local nova
		if d.destino == "camada nova" then
			nova = nomeLivre(spr, "cópias")
			o.camada_destino = nova
		end
		return o, nova
	end
	J.opcoesDaCopia = opcoesDaCopia

	local function terminarCopia(spr, acao, nome, o, nova, ref)
		local r = transacao(nome, function()
			local r = chamar(acao, o)
			porAcima(spr, nova, ref)
			return r
		end)
		if r.copias == 0 then
			D.alertar("Nada foi copiado: a área está vazia nas camadas escolhidas.")
		else
			D.avisar(string.format("%d cópia(s), %d pixels", r.copias, r.pixels))
		end
		return r
	end

	function J.copiaDeslocar()
		local spr = exigirSprite()
		local ref = app.layer
		local u = lembrado("copia_deslocar")
		local dlg
		local function ajustar()
			local px = dlg.data.direcao == "dx, dy (px)"
			dlg:modify{ id = "dx", enabled = px }
			dlg:modify{ id = "dy", enabled = px }
			dlg:modify{ id = "espaco", enabled = not px }
		end
		dlg = Dialog("Copiar deslocando")
		camposDaCopia(dlg, spr, u)
		dlg:separator{}
		dlg:combobox{ id = "direcao", label = "Para onde", option = u.direcao or DIRECOES[1], options = DIRECOES, onchange = ajustar }
		dlg:number{ id = "vezes", label = "Quantas cópias", text = tostring(u.vezes or 1), decimals = 0 }
		dlg:number{ id = "espaco", label = "Espaço entre elas (px)", text = tostring(u.espaco or 0), decimals = 0 }
		dlg:number{ id = "dx", label = "dx, dy (px)", text = tostring(u.dx or 16), decimals = 0 }
		dlg:number{ id = "dy", text = tostring(u.dy or 0), decimals = 0 }
		dlg:check{ id = "preencher", label = "Padrão", text = "repetir pela tela toda", selected = false }
		dlg:check{ id = "mover", label = "Original", text = "mover (apaga o original)", selected = false }
		dlg:button{ id = "ok", text = "Copiar", focus = true }
		dlg:button{ id = "cancelar", text = "Cancelar" }
		ajustar()
		dlg:show()
		local d = dlg.data
		if not d.ok then return nil end
		lembrar("copia_deslocar", d, { "camadas", "quadros", "destino", "direcao", "vezes", "espaco", "dx", "dy" })
		local o, nova = opcoesDaCopia(spr, d)
		if d.direcao == "dx, dy (px)" then
			o.dx, o.dy = floor(d.dx), floor(d.dy)
			if o.dx == 0 and o.dy == 0 and not d.preencher then error("dx e dy são zero: a cópia cairia em cima do original.", 0) end
		else
			o.direcao = DIRECAO[d.direcao]
			o.espaco = floor(d.espaco)
		end
		o.vezes = max(1, floor(d.vezes))
		o.preencher = d.preencher or nil
		o.mover = d.mover or nil
		return terminarCopia(spr, "copia.deslocar", "copiar deslocando", o, nova, ref)
	end

	local function campoOnde(dlg, u)
		dlg:combobox{ id = "onde", label = "Onde fica", option = u.onde or ONDES[2], options = ONDES }
		dlg:number{ id = "espaco", label = "Espaço (px)", text = tostring(u.espaco or 2), decimals = 0 }
	end

	local function opcoesOnde(o, d)
		local lado = AO_LADO[d.onde]
		if lado then
			o.ao_lado = lado
			o.espaco = floor(d.espaco)
		end
	end

	function J.copiaGirar()
		local spr = exigirSprite()
		local ref = app.layer
		local u = lembrado("copia_girar")
		local dlg = Dialog("Copiar girando")
		camposDaCopia(dlg, spr, u)
		dlg:separator{}
		dlg:number{ id = "angulo", label = "Ângulo (graus, horário)", text = tostring(u.angulo or 90), decimals = 1 }
		dlg:number{ id = "vezes", label = "Quantas cópias", text = tostring(u.vezes or 1), decimals = 0 }
		campoOnde(dlg, u)
		dlg:check{ id = "no_lugar", label = "Original", text = "girar o próprio (apaga o original)", selected = false }
		dlg:check{ id = "espelhar_h", label = "Espelhar antes", text = "horizontal", selected = false }
		dlg:check{ id = "espelhar_v", text = "vertical", selected = false }
		dlg:combobox{ id = "giro", label = "Giro", option = u.giro or "rotsprite", options = GIROS }
		dlg:label{ text = "A k-ésima cópia gira k vezes o ângulo; 90°, 180° e 270° são exatos." }
		dlg:button{ id = "ok", text = "Copiar", focus = true }
		dlg:button{ id = "cancelar", text = "Cancelar" }
		dlg:show()
		local d = dlg.data
		if not d.ok then return nil end
		lembrar("copia_girar", d, { "camadas", "quadros", "destino", "angulo", "vezes", "onde", "espaco", "giro" })
		local o, nova = opcoesDaCopia(spr, d)
		o.angulo = d.angulo
		o.vezes = max(1, floor(d.vezes))
		o.giro = d.giro
		o.espelhar_h, o.espelhar_v = d.espelhar_h or nil, d.espelhar_v or nil
		if d.no_lugar then o.no_lugar = true else opcoesOnde(o, d) end
		return terminarCopia(spr, "copia.girar", "copiar girando", o, nova, ref)
	end

	function J.copiaRedimensionar()
		local spr = exigirSprite()
		local ref = app.layer
		local u = lembrado("copia_redimensionar")
		local dlg = Dialog("Copiar redimensionando")
		camposDaCopia(dlg, spr, u)
		dlg:separator{}
		dlg:number{ id = "escala", label = "Tamanho (%)", text = tostring(u.escala or 200), decimals = 0 }
		dlg:number{ id = "largura", label = "Ou largura, altura (px)", text = "0", decimals = 0 }
		dlg:number{ id = "altura", text = "0", decimals = 0 }
		campoOnde(dlg, u)
		dlg:check{ id = "manter", label = "Original", text = "manter o original", selected = u.manter ~= false }
		dlg:label{ text = "Vizinho mais próximo (sem cores novas). 0 na largura ou altura: proporcional." }
		dlg:button{ id = "ok", text = "Copiar", focus = true }
		dlg:button{ id = "cancelar", text = "Cancelar" }
		dlg:show()
		local d = dlg.data
		if not d.ok then return nil end
		lembrar("copia_redimensionar", d, { "camadas", "quadros", "destino", "escala", "onde", "espaco", "manter" })
		local o, nova = opcoesDaCopia(spr, d)
		if d.largura > 0 or d.altura > 0 then
			o.largura = d.largura > 0 and floor(d.largura) or nil
			o.altura = d.altura > 0 and floor(d.altura) or nil
		else
			if d.escala <= 0 then error("O tamanho precisa ser maior que 0%.", 0) end
			o.escala = d.escala / 100
		end
		o.manter_original = d.manter or nil
		opcoesOnde(o, d)
		return terminarCopia(spr, "copia.redimensionar", "copiar redimensionando", o, nova, ref)
	end

	-- ---------------------------------------------------------------------------------------------------------------
	-- Exportar seleção, camadas, folha; quadros da seleção

	local function comPng(caminho)
		if caminho == nil or caminho == "" then error("Escolha onde gravar.", 0) end
		if app.fs.fileExtension(caminho) == "" then caminho = caminho .. ".png" end
		return caminho
	end

	local function abrirDepois(arquivo)
		local spr = app.sprite
		app.open(arquivo)
		return spr
	end

	function J.exportarSelecao()
		local spr = exigirSprite()
		local sel = temSelecao(spr)
		local u = lembrado("exportar_selecao")
		local base = app.fs.joinPath(pastaDoSprite(spr), tituloDoSprite(spr) .. (sel and "_selecao.png" or ".png"))
		local dlg = Dialog("Exportar seleção")
		dlg:label{ text = sel and "A área da seleção (com a forma dela)." or "Sem seleção: o sprite inteiro." }
		dlg:file{ id = "arquivo", label = "Arquivo", title = "Exportar seleção", save = true, filename = base, filetypes = { "png" } }
		dlg:combobox{ id = "camadas", label = "Camadas", option = u.camadas or "visíveis, achatadas",
			options = { "visíveis, achatadas", "só a camada ativa", "um PNG por camada visível" } }
		dlg:combobox{ id = "quadros", label = "Quadros", option = "quadro atual", options = { "quadro atual", "todos (um PNG por quadro)" } }
		dlg:number{ id = "escala", label = "Ampliar (vezes)", text = tostring(u.escala or 1), decimals = 0 }
		dlg:check{ id = "abrir", label = "Depois", text = "abrir o PNG no Aseprite", selected = u.abrir == true }
		dlg:button{ id = "ok", text = "Exportar", focus = true }
		dlg:button{ id = "cancelar", text = "Cancelar" }
		dlg:show()
		local d = dlg.data
		if not d.ok then return nil end
		lembrar("exportar_selecao", d, { "camadas", "escala", "abrir" })
		local o = { png = comPng(d.arquivo), escala = max(1, floor(d.escala)), selecao = sel or nil }
		if d.camadas == "só a camada ativa" then
			o.camadas = { camadaDeImagem().name }
		elseif d.camadas == "um PNG por camada visível" then
			o.separar_camadas = true
		end
		if d.quadros == "quadro atual" then o.quadro = quadroAtual() else o.quadros = "todos" end
		local r = transacao("exportar seleção", function() return chamar("exportar.selecao", o) end)
		D.avisar(#r.arquivos .. " PNG(s): " .. app.fs.filePath(r.arquivos[1] or o.png))
		if d.abrir and r.arquivos[1] then abrirDepois(r.arquivos[1]) end
		return r
	end

	function J.exportarCamadas()
		local spr = exigirSprite()
		local sel = temSelecao(spr)
		local u = lembrado("exportar_camadas")
		local dlg = Dialog("Exportar camadas")
		dlg:entry{ id = "pasta", label = "Pasta", text = app.fs.joinPath(pastaDoSprite(spr), tituloDoSprite(spr) .. "_camadas") }
		dlg:entry{ id = "nome", label = "Nome dos arquivos", text = u.nome or "{camada}_{quadro}.png" }
		dlg:combobox{ id = "camadas", label = "Camadas", option = u.camadas or "visíveis", options = { "visíveis", "todas" } }
		dlg:combobox{ id = "quadros", label = "Quadros", option = u.quadros or "quadro atual", options = { "quadro atual", "todos" } }
		dlg:check{ id = "aparar", label = "Bordas", text = "cortar o vazio em volta", selected = u.aparar == true }
		dlg:check{ id = "selecao", label = "Área", text = "só a seleção", selected = sel and u.selecao ~= false, enabled = sel }
		dlg:number{ id = "escala", label = "Ampliar (vezes)", text = tostring(u.escala or 1), decimals = 0 }
		dlg:label{ text = "{camada}, {quadro} e {nome} viram o nome da camada, o número do quadro e o do sprite." }
		dlg:button{ id = "ok", text = "Exportar", focus = true }
		dlg:button{ id = "cancelar", text = "Cancelar" }
		dlg:show()
		local d = dlg.data
		if not d.ok then return nil end
		lembrar("exportar_camadas", d, { "nome", "camadas", "quadros", "aparar", "selecao", "escala" })
		if d.pasta == "" then error("Escolha a pasta.", 0) end
		local o = { pasta_saida = d.pasta, nome = d.nome ~= "" and d.nome or nil, camadas = d.camadas == "todas" and "todas" or "visiveis",
			aparar = d.aparar or nil, escala = max(1, floor(d.escala)) }
		if d.quadros == "todos" then o.quadros = "todos" else o.quadro = quadroAtual() end
		if d.selecao and sel then o.retangulo = retDe(spr.selection.bounds) end
		local r = transacao("exportar camadas", function() return chamar("exportar.camadas", o) end)
		D.avisar(r.total .. " PNG(s) em " .. d.pasta)
		return r
	end

	function J.exportarFolha()
		local spr = exigirSprite()
		local sel = temSelecao(spr)
		local u = lembrado("exportar_folha")
		local quadros = { "todos", "uma linha por tag" }
		for _, t in ipairs(spr.tags) do quadros[#quadros + 1] = "tag: " .. t.name end
		local dlg = Dialog("Exportar folha de sprites")
		dlg:file{ id = "arquivo", label = "Arquivo", title = "Exportar folha", save = true,
			filename = app.fs.joinPath(pastaDoSprite(spr), tituloDoSprite(spr) .. "_folha.png"), filetypes = { "png" } }
		dlg:combobox{ id = "quadros", label = "Quadros", option = "todos", options = quadros }
		dlg:number{ id = "colunas", label = "Colunas (0 = uma linha)", text = tostring(u.colunas or 0), decimals = 0 }
		dlg:number{ id = "espaco", label = "Espaço (px)", text = tostring(u.espaco or 0), decimals = 0 }
		dlg:number{ id = "escala", label = "Ampliar (vezes)", text = tostring(u.escala or 1), decimals = 0 }
		dlg:combobox{ id = "camadas", label = "Camadas", option = u.camadas or "visíveis", options = { "visíveis", "só a camada ativa" } }
		dlg:check{ id = "selecao", label = "Área", text = "só a seleção (cada quadro recortado nela)", selected = sel, enabled = sel }
		dlg:check{ id = "json", label = "JSON", text = "gravar também onde ficou cada quadro", selected = u.json == true }
		dlg:check{ id = "abrir", label = "Depois", text = "abrir a folha no Aseprite", selected = u.abrir == true }
		dlg:button{ id = "ok", text = "Exportar", focus = true }
		dlg:button{ id = "cancelar", text = "Cancelar" }
		dlg:show()
		local d = dlg.data
		if not d.ok then return nil end
		lembrar("exportar_folha", d, { "colunas", "espaco", "escala", "camadas", "json", "abrir" })
		local png = comPng(d.arquivo)
		local o = { png = png, espaco = max(0, floor(d.espaco)), escala = max(1, floor(d.escala)) }
		if d.colunas > 0 then o.colunas = floor(d.colunas) end
		if d.quadros == "uma linha por tag" then
			if #spr.tags == 0 then error("O sprite não tem tags.", 0) end
			o.por_tag = true
		elseif d.quadros ~= "todos" then
			o.tag = d.quadros:gsub("^tag: ", "")
		end
		if d.camadas == "só a camada ativa" then o.camada = camadaDeImagem().name end
		if d.selecao and sel then o.selecao = true end
		if d.json then o.json = (png:gsub("%.[^%.\\/]+$", "")) .. ".json" end
		local r = transacao("exportar folha", function() return chamar("exportar.folha", o) end)
		D.avisar(string.format("Folha %d×%d com %d quadro(s): %s", r.largura, r.altura, r.quadros, png))
		if d.abrir then abrirDepois(png) end
		return r
	end

	function J.quadrosDaSelecao()
		local spr = exigirSprite()
		local sel = temSelecao(spr)
		local u = lembrado("quadros_selecao")
		local dlg = Dialog("Quadros da seleção")
		dlg:label{ text = sel and "Cada célula da grade dentro da seleção vira um quadro de um sprite novo." or "Sem seleção: o sprite inteiro." }
		dlg:number{ id = "largura", label = "Grade: largura (0 = sem grade)", text = tostring(u.largura or 16), decimals = 0 }
		dlg:number{ id = "altura", label = "Grade: altura", text = tostring(u.altura or 16), decimals = 0 }
		dlg:file{ id = "arquivo", label = "Sprite novo", title = "Gravar o sprite novo", save = true,
			filename = app.fs.joinPath(pastaDoSprite(spr), tituloDoSprite(spr) .. "_quadros.aseprite"), filetypes = { "aseprite" } }
		dlg:check{ id = "achatar", label = "Camadas", text = "achatar numa camada só", selected = u.achatar == true }
		dlg:number{ id = "duracao", label = "Duração (ms)", text = tostring(u.duracao or 100), decimals = 0 }
		dlg:button{ id = "ok", text = "Criar", focus = true }
		dlg:button{ id = "cancelar", text = "Cancelar" }
		dlg:show()
		local d = dlg.data
		if not d.ok then return nil end
		lembrar("quadros_selecao", d, { "largura", "altura", "achatar", "duracao" })
		local saida = d.arquivo
		if saida == nil or saida == "" then error("Escolha onde gravar o sprite novo.", 0) end
		if app.fs.fileExtension(saida) == "" then saida = saida .. ".aseprite" end
		local o = { saida = saida, quadro = quadroAtual(), achatar = d.achatar or nil, duracao = max(1, floor(d.duracao)), selecao = sel or nil }
		if d.largura > 0 and d.altura > 0 then o.grade = { floor(d.largura), floor(d.altura) } end
		local r = chamar("quadros.da_selecao", o)
		app.sprite = spr
		app.open(r.saida)
		D.avisar(string.format("%d quadro(s) de %d×%d em %s", r.quadros, r.largura, r.altura, r.saida))
		return r
	end

	-- ---------------------------------------------------------------------------------------------------------------
	-- Ajustar matiz, saturação e valor em cores escolhidas

	local QUAIS = { "a cor de frente", "a cor de fundo", "frente e fundo", "as marcadas na paleta", "estas cores", "todas as cores" }

	function J.cores()
		local spr = exigirSprite()
		if spr.colorMode == ColorMode.GRAY then error("Sprite em escala de cinza não tem matiz: converta para RGB ou indexado.", 0) end
		local marcadas = {}
		pcall(function()
			for _, i in ipairs(app.range.colors) do marcadas[#marcadas + 1] = i end
		end)
		local u = lembrado("cores")
		local sel = temSelecao(spr)
		local dlg
		local function ajustar()
			dlg:modify{ id = "lista", enabled = dlg.data.quais == "estas cores" }
		end
		local quaisPadrao = #marcadas > 1 and "as marcadas na paleta" or (u.quais or "a cor de frente")
		dlg = Dialog("Ajustar matiz, saturação e valor")
		dlg:combobox{ id = "quais", label = "Em quais cores", option = quaisPadrao, options = QUAIS, onchange = ajustar }
		dlg:entry{ id = "lista", label = "Cores (#rrggbb, …)", text = u.lista or rgbDe(app.fgColor) }
		dlg:label{ text = string.format("Frente %s · fundo %s · %d marcada(s) na paleta", rgbDe(app.fgColor), rgbDe(app.bgColor), #marcadas) }
		dlg:number{ id = "tolerancia", label = "Pegar parecidas (0 = só a exata)", text = tostring(u.tolerancia or 0), decimals = 0 }
		dlg:separator{}
		dlg:slider{ id = "h", label = "Matiz (graus)", min = -180, max = 180, value = 0 }
		dlg:slider{ id = "s", label = "Saturação (%)", min = -100, max = 100, value = 0 }
		dlg:slider{ id = "v", label = "Valor (%)", min = -100, max = 100, value = 0 }
		dlg:separator{}
		dlg:check{ id = "paleta", label = "Mudar", text = "a paleta", selected = u.paleta ~= false }
		dlg:check{ id = "pixels", text = "os pixels", selected = u.pixels ~= false }
		dlg:combobox{ id = "camadas", label = "Camadas", option = u.camadas or "todas", options = { "todas", "só a camada ativa" } }
		dlg:combobox{ id = "quadros", label = "Quadros", option = u.quadros or "todos", options = { "todos", "só o atual" } }
		dlg:check{ id = "selecao", label = "Área", text = "só dentro da seleção (retângulo)", selected = false, enabled = sel }
		dlg:label{ text = spr.colorMode == ColorMode.INDEXED and "Sprite indexado: os pixels seguem a paleta." or "Ctrl+Z desfaz." }
		dlg:button{ id = "ok", text = "Aplicar", focus = true }
		dlg:button{ id = "cancelar", text = "Cancelar" }
		ajustar()
		dlg:show()
		local d = dlg.data
		if not d.ok then return nil end
		lembrar("cores", d, { "quais", "lista", "tolerancia", "paleta", "pixels", "camadas", "quadros" })
		if d.h == 0 and d.s == 0 and d.v == 0 then error("Matiz, saturação e valor estão em 0: nada a mudar.", 0) end
		local o = { h = d.h, s = d.s, v = d.v, tolerancia = d.tolerancia > 0 and d.tolerancia or nil, paleta = d.paleta, pixels = d.pixels }
		local frente, fundo = rgbDe(app.fgColor), rgbDe(app.bgColor)
		if d.quais == "a cor de frente" then
			o.cores = { frente }
		elseif d.quais == "a cor de fundo" then
			o.cores = { fundo }
		elseif d.quais == "frente e fundo" then
			o.cores = { frente, fundo }
		elseif d.quais == "as marcadas na paleta" then
			if #marcadas == 0 then error("Marque as cores na paleta (clique, Ctrl+clique ou Shift+clique) antes de abrir.", 0) end
			o.indices = marcadas
		elseif d.quais == "estas cores" then
			o.cores = lerLista(d.lista)
			if #o.cores == 0 then error("Digite as cores como #rrggbb, separadas por vírgula.", 0) end
		end
		if d.camadas == "só a camada ativa" then o.camada = camadaDeImagem().name end
		if d.quadros == "só o atual" then o.quadro = quadroAtual() end
		if d.selecao and sel then o.retangulo = retDe(spr.selection.bounds) end
		local r = transacao("ajustar cores", function() return chamar("cores.ajustar", o) end)
		-- A cor de frente e a de fundo acompanham a mudança.
		for _, m in ipairs(r.mudancas or {}) do
			if (d.quais == "a cor de frente" or d.quais == "frente e fundo") and m.de == frente then app.fgColor = corDeHex(m.para) end
			if (d.quais == "a cor de fundo" or d.quais == "frente e fundo") and m.de == fundo then app.bgColor = corDeHex(m.para) end
		end
		D.avisar(string.format("%d cor(es) na paleta, %d pixels", r.paleta, r.pixels))
		return r
	end

	-- ---------------------------------------------------------------------------------------------------------------
	-- Matrizes de dithering: biblioteca, aplicar e instalar no Aseprite

	local function previaMatriz(m)
		local w, h = 100, 16
		local img = Image(w, h, ColorMode.RGB)
		img:clear(pc.rgba(255, 255, 255, 255))
		local preto = pc.rgba(0, 0, 0, 255)
		for y = 0, h - 1 do
			for x = 0, w - 1 do
				local dens = (x + 0.5) / w * 100
				local v = m.v[(y % m.altura) * m.largura + (x % m.largura) + 1]
				if v < dens * 256 / 100 then img:drawPixel(x, y, preto) end
			end
		end
		return img
	end

	local function novaMatriz()
		local spr = app.sprite
		local dlg
		local FONTES = { "Bayer", "Ruído azul", "Linhas", "Xadrez", "Da seleção (escuro acende primeiro)", "Sequência: um nível por quadro" }
		local function ajustar()
			local f = dlg.data.fonte
			dlg:modify{ id = "tamanho", enabled = f == "Bayer" or f == "Ruído azul" or f == "Linhas" }
			dlg:modify{ id = "semente", enabled = f == "Ruído azul" }
			dlg:modify{ id = "normalizar", enabled = f:sub(1, 3) == "Da " }
		end
		dlg = Dialog("Nova matriz")
		dlg:entry{ id = "nome", label = "Nome", text = "", focus = true }
		dlg:combobox{ id = "fonte", label = "De onde", option = "Bayer", options = FONTES, onchange = ajustar }
		dlg:combobox{ id = "tamanho", label = "Tamanho", option = "8", options = { "2", "4", "8", "16" } }
		dlg:number{ id = "semente", label = "Semente", text = "7", decimals = 0 }
		dlg:check{ id = "normalizar", label = "Níveis", text = "espalhar de 0 a 255", selected = true }
		dlg:label{ text = "Da seleção: o cinza da camada ativa na seleção é o limiar." }
		dlg:label{ text = "Sequência: cada quadro do sprite (salvo) é um nível, do menos cheio ao mais cheio." }
		dlg:button{ id = "ok", text = "Criar", focus = true }
		dlg:button{ id = "cancelar", text = "Cancelar" }
		ajustar()
		dlg:show()
		local d = dlg.data
		if not d.ok then return nil end
		if d.nome == "" then error("Dê um nome à matriz.", 0) end
		local n = tonumber(d.tamanho)
		local o = { nome = d.nome }
		if d.fonte == "Bayer" then
			o.bayer = n
		elseif d.fonte == "Ruído azul" then
			o.ruido_azul = max(4, n)
			o.semente = floor(d.semente)
		elseif d.fonte == "Linhas" then
			o.linhas = n
		elseif d.fonte == "Xadrez" then
			o.xadrez = 2
		elseif d.fonte:sub(1, 3) == "Da " then
			if not spr or spr.selection.isEmpty then error("Selecione a área da matriz (em cinza) antes.", 0) end
			o.origem = { camada = camadaDeImagem().name, retangulo = retDe(spr.selection.bounds), quadro = quadroAtual() }
			o.normalizar = d.normalizar
		else
			if not spr then error("Abra o sprite com os níveis (um por quadro).", 0) end
			if (spr.filename or "") == "" then error("Salve o sprite dos níveis antes.", 0) end
			local r = chamar("matriz.sequencia", { nome = d.nome, arquivo = spr.filename,
				retangulo = (not spr.selection.isEmpty) and retDe(spr.selection.bounds) or nil })
			D.avisar(string.format("Matriz \"%s\" %d×%d, %d níveis", r.nome, r.largura, r.altura, r.niveis))
			return r.id
		end
		local r = chamar("matriz.gravar", o)
		D.avisar(string.format("Matriz \"%s\" %d×%d, %d níveis", r.nome, r.largura, r.altura, r.niveis))
		return r.id
	end

	local COMOS = { "preencher numa densidade", "faixa (densidade de um lado ao outro)", "degradê da cor de frente para a de fundo" }
	local DESTINOS = { "camada nova", "camada nova, só sobre o desenho da camada ativa", "camada ativa", "apagar na camada ativa (transparência pontilhada)" }

	function J.matrizes()
		local estado = { porNome = {}, imagem = nil, fechar = nil }
		local u = lembrado("matrizes")
		local iniciais = chamar("matriz.iniciais", {})
		local dlg

		local function atual()
			return estado.porNome[dlg.data.matriz]
		end

		local function mostrar()
			local m = atual()
			estado.imagem = nil
			local info = "Nenhuma matriz."
			if m then
				local ok, mat = pcall(E()._interno.matriz, { pasta = D.pasta(), matriz = m.id })
				if ok then estado.imagem = previaMatriz(mat) end
				info = string.format("%d×%d · %d níveis · %s", m.largura, m.altura, m.niveis or 0, m.origem or "")
			end
			dlg:modify{ id = "info", text = info }
			dlg:repaint()
		end

		local function carregar(manter)
			local lista = chamar("matriz.listar", {}).matrizes
			estado.porNome = {}
			local nomes, escolha = {}, nil
			for _, m in ipairs(lista) do
				nomes[#nomes + 1] = m.nome
				estado.porNome[m.nome] = m
				if m.id == manter or (not manter and m.nome == u.matriz) then escolha = m.nome end
			end
			if #nomes == 0 then nomes = { NENHUM } end
			dlg:modify{ id = "matriz", options = nomes, option = escolha or nomes[1] }
			mostrar()
		end

		local function ajustar()
			local c = dlg.data.como
			dlg:modify{ id = "densidade", enabled = c == COMOS[1] }
			dlg:modify{ id = "inicio", enabled = c == COMOS[2] }
			dlg:modify{ id = "fim", enabled = c == COMOS[2] }
			dlg:modify{ id = "vertical", enabled = c ~= COMOS[1] }
			dlg:modify{ id = "cor", enabled = c ~= COMOS[3] }
		end

		local function aplicar()
			local spr = exigirSprite()
			local m = atual()
			if not m then error("Escolha uma matriz.", 0) end
			local d = dlg.data
			lembrar("matrizes", d, { "matriz", "como", "densidade", "inicio", "fim", "vertical", "area", "destino" })
			local o = { matriz = m.id, quadro = quadroAtual() }
			if d.area == "a seleção" then o.selecao = true end
			local ativa = app.layer
			local imagemAtiva = ativa and ativa.isImage and not ativa.isTilemap
			if d.destino == DESTINOS[1] or d.destino == DESTINOS[2] then
				o.camada = nomeLivre(spr, d.destino == DESTINOS[1] and "pontilhado" or "sombra")
				if imagemAtiva then o.acima_de = ativa.name end
				if d.destino == DESTINOS[2] then o.mascara_camada = camadaDeImagem().name end
			else
				o.camada = camadaDeImagem().name
				if d.destino == DESTINOS[4] then o.modo = "apagar" end
			end
			local acao
			if d.como == COMOS[1] then
				acao = "matriz.preencher"
				o.densidade = d.densidade
				o.cor = hexDe(d.cor)
			elseif d.como == COMOS[2] then
				acao = "matriz.faixa"
				o.inicio, o.fim, o.vertical, o.cor = d.inicio, d.fim, d.vertical or nil, hexDe(d.cor)
			else
				acao = "matriz.faixa"
				o.cores = { hexDe(app.fgColor), hexDe(app.bgColor) }
				o.vertical = d.vertical or nil
			end
			local r = transacao("pontilhado", function() return chamar(acao, o) end)
			D.avisar(string.format("%s: %d pixels em %s", m.nome, r.pixels or 0, r.camada or "?"))
			return r
		end

		local temSel = app.sprite and not app.sprite.selection.isEmpty
		local areas = temSel and { "a seleção", "o sprite inteiro" } or { "o sprite inteiro" }
		dlg = Dialog("Matrizes de dithering")
		dlg:combobox{ id = "matriz", label = "Matriz", option = NENHUM, options = { NENHUM }, onchange = tentar(mostrar) }
		dlg:canvas{ id = "previa", width = 200, height = 32, onpaint = function(ev) desenharPrevia(ev, estado.imagem) end }
		dlg:label{ id = "info", text = "" }
		dlg:separator{ text = "Aplicar no sprite" }
		dlg:combobox{ id = "como", label = "Como", option = u.como or COMOS[1], options = COMOS, onchange = ajustar }
		dlg:slider{ id = "densidade", label = "Densidade (%)", min = 0, max = 100, value = u.densidade or 50 }
		dlg:slider{ id = "inicio", label = "Começo (%)", min = 0, max = 100, value = u.inicio or 100 }
		dlg:slider{ id = "fim", label = "Fim (%)", min = 0, max = 100, value = u.fim or 0 }
		dlg:check{ id = "vertical", label = "Direção", text = "de cima para baixo (senão, da esquerda para a direita)", selected = u.vertical == true }
		dlg:color{ id = "cor", label = "Cor", color = app.fgColor }
		dlg:combobox{ id = "area", label = "Área", option = areas[1], options = areas }
		dlg:combobox{ id = "destino", label = "Resultado", option = u.destino or DESTINOS[1], options = DESTINOS }
		dlg:button{ id = "aplicar", text = "Aplicar", focus = true, onclick = tentar(function()
			aplicar()
			estado.fechar = "aplicar"
			dlg:close()
		end) }
		dlg:separator{ text = "Biblioteca" }
		dlg:button{ id = "nova", text = "Nova matriz…", onclick = tentar(function()
			local id = novaMatriz()
			if id then carregar(id) end
		end) }
		dlg:button{ id = "apagar", text = "Apagar", onclick = tentar(function()
			local m = atual()
			if not m or not D.confirmar("Apagar a matriz \"" .. m.nome .. "\"?", "Apagar") then return end
			chamar("matriz.apagar", { matriz = m.id })
			carregar()
		end) }
		dlg:button{ id = "instalar", text = "Instalar no Aseprite…", onclick = tentar(function()
			local destino = app.fs.joinPath(app.fs.userConfigPath, "extensions", "user_generated_dithers")
			if not D.confirmar("Gravar as matrizes da biblioteca como extensão do Aseprite em " .. destino
				.. "? Elas aparecem no degradê e em Sprite > Modo de cor depois de reiniciar o Aseprite.", "Instalar") then return end
			local r = chamar("matriz.instalar", { iniciais = false })
			D.alertar(string.format("%d matriz(es) instaladas em %s. Feche e abra o Aseprite para elas aparecerem.", r.extensao.matrizes, r.extensao.pasta))
		end) }
		dlg:separator{}
		dlg:label{ text = "Biblioteca: " .. D.pasta() }
		dlg:button{ id = "fechar", text = "Fechar" }
		carregar()
		ajustar()
		if #iniciais.criadas > 0 then D.avisar(#iniciais.criadas .. " matrizes iniciais criadas na biblioteca") end
		dlg:show()
		return estado.fechar
	end

	-- ---------------------------------------------------------------------------------------------------------------
	-- Os itens do submenu, na ordem (separador antes de cada grupo). `sprite`: só com um sprite aberto.

	J.itens = {
		{ id = "DioramaPinceis", titulo = "Biblioteca de pincéis…", f = J.biblioteca },
		{ id = "DioramaTraco", titulo = "Carimbar ao longo de um traço…", f = J.traco, sprite = true },
		{ id = "DioramaConjuntos", titulo = "Conjuntos e pincel ativo…", f = J.conjuntos },
		{ id = "DioramaProximoPincel", titulo = "Próximo pincel do conjunto ativo", f = J.proximoPincel },
		{ separador = true },
		{ id = "DioramaCopiaDeslocar", titulo = "Copiar deslocando…", f = J.copiaDeslocar, sprite = true },
		{ id = "DioramaCopiaGirar", titulo = "Copiar girando…", f = J.copiaGirar, sprite = true },
		{ id = "DioramaCopiaRedimensionar", titulo = "Copiar redimensionando…", f = J.copiaRedimensionar, sprite = true },
		{ separador = true },
		{ id = "DioramaExportarSelecao", titulo = "Exportar seleção…", f = J.exportarSelecao, sprite = true },
		{ id = "DioramaExportarCamadas", titulo = "Exportar camadas…", f = J.exportarCamadas, sprite = true },
		{ id = "DioramaExportarFolha", titulo = "Exportar folha de sprites…", f = J.exportarFolha, sprite = true },
		{ id = "DioramaQuadrosSelecao", titulo = "Quadros da seleção (sprite novo)…", f = J.quadrosDaSelecao, sprite = true },
		{ separador = true },
		{ id = "DioramaAjustarCores", titulo = "Ajustar matiz, saturação e valor…", f = J.cores, sprite = true },
		{ id = "DioramaMatrizes", titulo = "Matrizes de dithering…", f = J.matrizes },
	}

	return J
end
