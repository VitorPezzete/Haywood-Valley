-- Testes das janelas da extensão Diorama 0.5.0 (Arquivo > Diorama > Ferramentas, 2026-10-22), em lote:
--
--   Aseprite.exe -b --script-param saida=<pasta temporária> --script-param vaca=<cópia de vaca.aseprite>
--                --script aseprite/testes/janelas.lua
--
-- Quem chama é tools/testes/aseprite.test.mjs (npm run teste:aseprite), que copia a vaca para uma pasta temporária
-- (nunca o original) e lê as linhas "OK <caso>" / "FALHOU <caso>: <motivo>". Tudo num processo só.
--
-- O modo -b não tem janelas nem carrega extensões: o diorama.lua é carregado por dofile com um plugin de mentira, e
-- `Dialog` é trocado por um de mentira que segue um roteiro (preenche campos, chama os onchange, clica nos botões,
-- desenha os canvas). Assim cada item do menu roda inteiro, do diálogo à ação no sprite, como se fosse clicado; o que
-- não se testa é a janela de verdade (o desenho dos campos, o mouse). A biblioteca é uma pasta temporária; a do
-- usuário e a pasta de extensões do Aseprite não são tocadas. Em `saida` ficam PNGs ampliados 8x para conferir a olho.

local function aqui()
	local fonte = debug.getinfo(1, "S").source
	if fonte:sub(1, 1) == "@" then fonte = fonte:sub(2) end
	return app.fs.filePath(fonte)
end

local REPO = app.fs.normalizePath(app.fs.joinPath(aqui(), "..", ".."))
local SAIDA = app.params.saida
local VACA = app.params.vaca
if not SAIDA or SAIDA == "" then
	SAIDA = app.fs.joinPath(app.fs.tempPath, "hv-janelas")
end
app.fs.makeAllDirectories(SAIDA)
local LIB = app.fs.joinPath(SAIDA, "biblioteca")
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

-- ---------------------------------------------------------------------------------------------------------------
-- Dialog de mentira

local roteiro = {}
local abertos = {}

local function gcFalso(w, h)
	local gc = { width = w or 100, height = h or 100, desenhos = 0 }
	function gc:fillRect(r) assert(r.width) end
	function gc:drawImage(img, a, b)
		assert(img.width and img.width > 0, "drawImage sem imagem")
		self.desenhos = self.desenhos + 1
	end
	return gc
end

local Falso = {}
local function valorDe(c)
	if c.tipo == "entry" then return c.text or "" end
	if c.tipo == "number" then return tonumber(c.text) or 0 end
	if c.tipo == "slider" then return c.value or 0 end
	if c.tipo == "check" then return c.selected == true end
	if c.tipo == "combobox" then return c.option end
	if c.tipo == "color" then return c.color or Color{ r = 0, g = 0, b = 0 } end
	if c.tipo == "file" then return c.filename or "" end
	if c.tipo == "button" then return c.clicado == true end
	return nil
end

local Meta = {
	__index = function(self, k)
		if k == "data" then
			local d = {}
			for id, c in pairs(self.campos) do d[id] = valorDe(c) end
			return d
		end
		return Falso[k]
	end,
}

function Dialog(arg)
	local titulo = type(arg) == "table" and (arg.title or "") or tostring(arg or "")
	local d = setmetatable({ titulo = titulo, campos = {}, ordem = {}, fechado = false, pinturas = 0 }, Meta)
	abertos[#abertos + 1] = d
	return d
end

for _, tipo in ipairs({ "entry", "number", "slider", "check", "combobox", "color", "button", "separator", "label", "file", "canvas", "radio" }) do
	Falso[tipo] = function(self, t)
		t = t or {}
		local c = {}
		for k, v in pairs(t) do c[k] = v end
		c.tipo = tipo
		local id = c.id or ("_" .. (#self.ordem + 1))
		if self.campos[id] then error("campo repetido no diálogo " .. self.titulo .. ": " .. id) end
		if tipo == "combobox" then
			local achou = false
			for _, o in ipairs(c.options or {}) do if o == c.option then achou = true end end
			if not achou then error("combobox " .. id .. ": a opção \"" .. tostring(c.option) .. "\" não está na lista") end
		end
		self.campos[id] = c
		self.ordem[#self.ordem + 1] = id
		return self
	end
end
function Falso:newrow() return self end
function Falso:modify(t)
	local c = self.campos[t.id]
	if not c then error("modify de um campo que não existe: " .. tostring(t.id) .. " em " .. self.titulo) end
	for k, v in pairs(t) do
		if k ~= "id" then c[k] = v end
	end
	if c.tipo == "combobox" and (t.option or t.options) then
		local achou = false
		for _, o in ipairs(c.options or {}) do if o == c.option then achou = true end end
		if not achou then error("modify: a opção \"" .. tostring(c.option) .. "\" não está na lista de " .. t.id) end
	end
	return self
end
function Falso:pintar()
	for _, id in ipairs(self.ordem) do
		local c = self.campos[id]
		if c.tipo == "canvas" and c.onpaint then
			local gc = gcFalso(c.width, c.height)
			c.onpaint({ context = gc })
			self.pinturas = self.pinturas + 1
			self.desenhos = (self.desenhos or 0) + gc.desenhos
		end
	end
end
function Falso:repaint() self:pintar() end
function Falso:close() self.fechado = true end
function Falso:show()
	self:pintar()
	local cena = table.remove(roteiro, 1)
	if not cena then error("abriu o diálogo \"" .. self.titulo .. "\" sem roteiro") end
	if cena.titulo ~= self.titulo then error("esperava o diálogo \"" .. cena.titulo .. "\", abriu \"" .. self.titulo .. "\"") end
	for _, p in ipairs(cena.passos or {}) do
		if self.fechado then break end
		local acao, id, v = p[1], p[2], p[3]
		if acao == "valor" then
			local c = self.campos[id]
			if not c then error("o diálogo \"" .. self.titulo .. "\" não tem o campo " .. id) end
			if c.enabled == false then error("o campo " .. id .. " está desligado em \"" .. self.titulo .. "\"") end
			if c.tipo == "entry" or c.tipo == "number" then
				c.text = tostring(v)
			elseif c.tipo == "slider" then
				c.value = v
			elseif c.tipo == "check" then
				c.selected = v
			elseif c.tipo == "combobox" then
				local achou = false
				for _, o in ipairs(c.options or {}) do if o == v then achou = true end end
				if not achou then error("combobox " .. id .. " não tem a opção \"" .. tostring(v) .. "\" (tem: " .. table.concat(c.options or {}, " | ") .. ")") end
				c.option = v
			elseif c.tipo == "color" then
				c.color = v
			elseif c.tipo == "file" then
				c.filename = v
			end
			local f = c.onchange or c.onclick
			if f then f() end
		elseif acao == "clicar" then
			local c = self.campos[id]
			if not c or c.tipo ~= "button" then error("o diálogo \"" .. self.titulo .. "\" não tem o botão " .. tostring(id)) end
			if c.enabled == false then error("o botão " .. id .. " está desligado") end
			c.clicado = true
			if c.onclick then
				c.onclick()
				c.clicado = false
			else
				self.fechado = true
			end
		elseif acao == "conferir" then
			id(self)
		end
	end
	self.fechado = true
end

local function cena(titulo, passos) roteiro[#roteiro + 1] = { titulo = titulo, passos = passos } end

-- ---------------------------------------------------------------------------------------------------------------
-- A extensão com um plugin de mentira

local avisos, alertas = {}, {}
local respostaConfirmar = true
local M = dofile(app.fs.joinPath(REPO, "aseprite", "diorama", "diorama.lua"))
M.ganchos.avisar = function(t) avisos[#avisos + 1] = tostring(t) end
M.ganchos.alertar = function(t) alertas[#alertas + 1] = type(t) == "table" and table.concat(t, " ") or tostring(t) end
M.ganchos.confirmar = function() return respostaConfirmar end

local comandos, grupos, porGrupo = {}, {}, {}
local plugin = {
	preferences = { raiz = REPO, conectar = false, pinceis = LIB },
	path = app.fs.joinPath(REPO, "aseprite", "diorama"),
	newMenuGroup = function(_, g) grupos[g.id] = g end,
	newMenuSeparator = function() end,
	newCommand = function(_, c)
		comandos[c.title] = c
		porGrupo[c.group] = (porGrupo[c.group] or 0) + 1
	end,
}
init(plugin)
local E = M.adaptador()

--- Roda um item do menu como o Aseprite rodaria (onclick, com os erros virando alerta) e confere que o roteiro
--- foi todo usado e que não houve alerta (a não ser `alertaEsperado`, um trecho do texto).
local function menu(titulo, alertaEsperado)
	local c = comandos[titulo]
	confere(c, "falta o item " .. titulo)
	alertas = {}
	confere(c.onenabled() == true, titulo .. " desligado")
	c.onclick()
	if #roteiro > 0 then
		local resto = roteiro[1].titulo
		roteiro = {}
		error("sobrou roteiro (o diálogo \"" .. resto .. "\" não abriu); alertas: " .. table.concat(alertas, " / "))
	end
	if alertaEsperado then
		confere(#alertas > 0 and alertas[1]:find(alertaEsperado, 1, true), "esperava o alerta \"" .. alertaEsperado .. "\", veio: " .. table.concat(alertas, " / "))
	else
		confere(#alertas == 0, "alerta: " .. table.concat(alertas, " / "))
	end
end

local function ultimoAviso() return avisos[#avisos] or "" end

-- ---------------------------------------------------------------------------------------------------------------
-- Sprites de teste

local function camadas(spr, lista)
	lista = lista or {}
	for _, l in ipairs(spr.layers) do
		if l.isGroup then camadas(l, lista) else lista[#lista + 1] = l end
	end
	return lista
end

local function camada(spr, nome)
	for _, l in ipairs(camadas(spr)) do if l.name == nome then return l end end
	return nil
end

local function pixelsDe(l, q)
	local cel = l:cel(q or 1)
	if not cel then return 0 end
	local n = 0
	for it in cel.image:pixels() do
		if pc.rgbaA(it()) > 0 then n = n + 1 end
	end
	return n
end

--- Assinatura do sprite: camadas (nome, visível), quadros e a imagem achatada de cada quadro.
local function assinatura(spr)
	local partes = { #spr.frames }
	for _, l in ipairs(camadas(spr)) do partes[#partes + 1] = l.name .. (l.isVisible and "+" or "-") .. pixelsDe(l) end
	for q = 1, #spr.frames do
		local img = Image(spr.width, spr.height, ColorMode.RGB)
		img:drawSprite(spr, q)
		partes[#partes + 1] = img.bytes
	end
	return table.concat(partes, "|")
end

local function ver(spr, nome, escala)
	local img = Image(spr.width, spr.height, ColorMode.RGB)
	img:drawSprite(spr, app.frame and app.frame.frameNumber or 1)
	escala = escala or 8
	img:resize(img.width * escala, img.height * escala)
	img:saveAs(app.fs.joinPath(SAIDA, nome .. ".png"))
end

--- Seta para a direita, 9x5, para ver o giro pelo traço.
local function spriteSeta()
	local spr = Sprite(9, 5, ColorMode.RGB)
	local img = Image(9, 5, ColorMode.RGB)
	local escuro, ponta = pc.rgba(40, 30, 60, 255), pc.rgba(220, 60, 60, 255)
	for x = 0, 6 do img:drawPixel(x, 2, escuro) end
	img:drawPixel(7, 1, ponta)
	img:drawPixel(7, 2, ponta)
	img:drawPixel(7, 3, ponta)
	img:drawPixel(8, 2, ponta)
	img:drawPixel(6, 0, ponta)
	img:drawPixel(6, 4, ponta)
	spr.cels[1].image = img
	spr.layers[1].name = "seta"
	return spr
end

--- Três peças separadas (tamanhos diferentes), para o conjunto cortado por ilhas.
local function spritePecas()
	local spr = Sprite(32, 10, ColorMode.RGB)
	local img = Image(32, 10, ColorMode.RGB)
	local cores = { pc.rgba(60, 140, 60, 255), pc.rgba(200, 160, 40, 255), pc.rgba(80, 90, 200, 255) }
	local tam = { 3, 5, 7 }
	for i = 1, 3 do
		local x0 = (i - 1) * 10 + 1
		for y = 1, tam[i] do
			for x = x0, x0 + tam[i] - 1 do img:drawPixel(x, y, cores[i]) end
		end
	end
	spr.cels[1].image = img
	spr.layers[1].name = "pecas"
	return spr
end

local vaca
if VACA and VACA ~= "" and app.fs.isFile(VACA) then
	vaca = app.open(VACA)
else
	-- Sem a vaca: um sprite com duas camadas desenhadas, para os casos rodarem.
	vaca = Sprite(48, 36, ColorMode.RGB)
	local img = Image(48, 36, ColorMode.RGB)
	for y = 8, 28 do for x = 6, 40 do img:drawPixel(x, y, pc.rgba(237, 218, 205, 255)) end end
	vaca.cels[1].image = img
	vaca.layers[1].name = "corpo_e_cabeca"
	local l = vaca:newLayer()
	l.name = "detalhes"
	local d = Image(48, 36, ColorMode.RGB)
	for x = 10, 30, 4 do d:drawPixel(x, 12, pc.rgba(1, 0, 0, 255)) end
	vaca:newCel(l, 1, d, Point(0, 0))
end

--- A camada com mais pixels (o corpo).
local function maiorCamada(spr)
	local melhor, n = nil, -1
	for _, l in ipairs(camadas(spr)) do
		local p = pixelsDe(l)
		if l.isVisible and p > n then melhor, n = l, p end
	end
	return melhor
end

local corpo = camada(vaca, "corpo_e_cabeca") or maiorCamada(vaca)
local function ativar(spr, l)
	app.sprite = spr
	if l then app.layer = l end
	app.frame = spr.frames[1]
end

-- ---------------------------------------------------------------------------------------------------------------
-- Casos

caso("menu — Ferramentas com os 13 itens, Configurações e versão 0.5.0", function()
	confere(M.VERSAO == "0.5.0", "versão " .. tostring(M.VERSAO))
	confere(grupos.diorama_ferramentas and grupos.diorama_ferramentas.group == "diorama_menu", "falta o grupo Ferramentas dentro de Diorama")
	local titulos = { "Biblioteca de pincéis…", "Carimbar ao longo de um traço…", "Conjuntos e pincel ativo…",
		"Próximo pincel do conjunto ativo", "Copiar deslocando…", "Copiar girando…", "Copiar redimensionando…",
		"Exportar seleção…", "Exportar camadas…", "Exportar folha de sprites…", "Quadros da seleção (sprite novo)…",
		"Ajustar matiz, saturação e valor…", "Matrizes de dithering…" }
	for _, t in ipairs(titulos) do
		confere(comandos[t] and comandos[t].group == "diorama_ferramentas", "falta " .. t)
	end
	confere(porGrupo.diorama_ferramentas == 13, "itens no grupo: " .. tostring(porGrupo.diorama_ferramentas))
	confere(comandos["Configurações…"], "falta Configurações…")
	confere(comandos["Girar (RotSprite)…"] and comandos["Limpar doubles e jaggies…"], "os itens da 0.4.0 sumiram")
	confere(M.pastaPinceis() == LIB, "pasta da biblioteca: " .. M.pastaPinceis())
	-- Sem a pasta nas preferências, o padrão fica fora do repositório.
	plugin.preferences.pinceis = nil
	local padrao = M.pastaPinceis()
	plugin.preferences.pinceis = LIB
	confere(padrao:lower():find(app.fs.userConfigPath:lower(), 1, true) == 1 or os.getenv("HV_PINCEIS"), "padrão fora do %APPDATA%: " .. padrao)
	confere(not padrao:lower():find(REPO:lower(), 1, true), "padrão dentro do repositório: " .. padrao)
end)

caso("pontos e listas digitados", function()
	local J = M.janelas()
	local p = J.lerPontos("10,20; 30, 40\n-5,7")
	confere(#p == 3 and p[2][1] == 30 and p[2][2] == 40 and p[3][1] == -5, "lerPontos")
	local l = J.lerLista(" a, b ;c,, ")
	confere(#l == 3 and l[3] == "c", "lerLista")
end)

caso("caminho — linha em escada vira um traço aberto da esquerda para a direita; anel vira traço fechado", function()
	local ordenar = E._interno.ordenarTracos
	-- Escada desenhada sem pixel-perfect (cantos em L), da direita para a esquerda.
	local lista = {}
	for i = 0, 9 do
		lista[#lista + 1] = { 20 - 2 * i, 5 + i }
		lista[#lista + 1] = { 19 - 2 * i, 5 + i }
	end
	local t = ordenar(lista)
	confere(#t == 1 and not t[1].fechado, "escada: " .. #t .. " traço(s)")
	local pts = t[1].pontos
	confere(pts[1][1] < pts[#pts][1], "escada: não vai da esquerda para a direita")
	for k = 2, #pts do
		confere(math.abs(pts[k][1] - pts[k - 1][1]) <= 1 and math.abs(pts[k][2] - pts[k - 1][2]) <= 1, "escada: salto no passo " .. k)
	end
	-- Anel (contorno de um retângulo 10x6) e um segundo pedaço solto.
	local anel = {}
	for x = 0, 9 do anel[#anel + 1] = { x, 0 }; anel[#anel + 1] = { x, 5 } end
	for y = 1, 4 do anel[#anel + 1] = { 0, y }; anel[#anel + 1] = { 9, y } end
	anel[#anel + 1] = { 30, 30 }
	anel[#anel + 1] = { 31, 30 }
	t = ordenar(anel)
	confere(#t == 2, "anel: " .. #t .. " traço(s)")
	confere(t[1].fechado and #t[1].pontos == 28, "anel: fechado com 28 pontos (veio " .. #t[1].pontos .. ")")
	-- Sentido do relógio (y para baixo): do canto de cima, anda para a direita.
	confere(t[1].pontos[2][1] > t[1].pontos[1][1] or t[1].pontos[2][2] == t[1].pontos[1][2], "anel: sentido")
end)

caso("biblioteca — novo pincel da seleção (camada ativa), favorito, prévia", function()
	ativar(vaca, corpo)
	vaca.selection = Selection(Rectangle(0, 0, 24, 18))
	cena("Biblioteca de pincéis", {
		{ "clicar", "novo" },
		{ "conferir", function(dlg)
			confere(dlg.data.pincel == "Cabeça", "pincel escolhido: " .. tostring(dlg.data.pincel))
			confere((dlg.desenhos or 0) > 0, "a prévia não desenhou o pincel")
		end },
		{ "clicar", "favorito" },
		{ "conferir", function(dlg) confere(dlg.data.pincel == "★ Cabeça", "favorito: " .. tostring(dlg.data.pincel)) end },
		{ "clicar", "fechar" },
	})
	cena("Novo pincel", {
		{ "valor", "nome", "Cabeça" },
		{ "valor", "area", "a seleção" },
		{ "valor", "camadas", "só a camada ativa" },
		{ "valor", "grupo", "vaca" },
		{ "valor", "etiquetas", "animal, teste" },
		{ "clicar", "ok" },
	})
	menu("Biblioteca de pincéis…")
	local l = E.chamar("biblioteca.listar", { pasta = LIB })
	confere(l.total == 1 and l.pinceis[1].favorito and l.pinceis[1].grupo == "vaca" and #l.pinceis[1].etiquetas == 2, "listar")
	confere(app.fs.isFile(app.fs.joinPath(LIB, "biblioteca.json")), "biblioteca.json não foi gravado na pasta temporária")
	E.chamar("biblioteca.imagem", { pasta = LIB, pincel = "Cabeça", png = app.fs.joinPath(SAIDA, "pincel_cabeca.png"), png_escala = 8 })
end)

caso("biblioteca — pincel de várias camadas e pincel da seta (sprite novo, camada inteira)", function()
	ativar(vaca, corpo)
	vaca.selection = Selection(Rectangle(0, 0, 48, 36))
	cena("Biblioteca de pincéis", { { "clicar", "novo" }, { "clicar", "fechar" } })
	cena("Novo pincel", {
		{ "valor", "nome", "Vaca inteira" },
		{ "valor", "camadas", "várias camadas (uma parte por camada visível)" },
		{ "valor", "grupo", "vaca" },
		{ "clicar", "ok" },
	})
	menu("Biblioteca de pincéis…")
	local seta = spriteSeta()
	ativar(seta, seta.layers[1])
	cena("Biblioteca de pincéis", { { "clicar", "novo" }, { "clicar", "fechar" } })
	cena("Novo pincel", { { "valor", "nome", "Seta" }, { "valor", "camadas", "só a camada ativa" }, { "valor", "grupo", "setas" }, { "clicar", "ok" } })
	menu("Biblioteca de pincéis…")
	seta:close()
	local l = E.chamar("biblioteca.listar", { pasta = LIB, ordenar = "nome" })
	local porNome = {}
	for _, p in ipairs(l.pinceis) do porNome[p.nome] = p end
	confere(porNome["Vaca inteira"] and #porNome["Vaca inteira"].camadas > 1, "várias camadas: " .. tostring(porNome["Vaca inteira"] and #porNome["Vaca inteira"].camadas))
	confere(porNome.Seta and porNome.Seta.largura == 9 and porNome.Seta.altura == 5, "seta 9x5 (vazio cortado)")
end)

caso("biblioteca — filtro por grupo e só favoritos, editar, renomear em lote, tornar ativo, pintar com ele", function()
	ativar(vaca, corpo)
	cena("Biblioteca de pincéis", {
		{ "valor", "grupo", "vaca" },
		{ "conferir", function(dlg)
			local n = #dlg.campos.pincel.options
			confere(n == 2, "grupo vaca: " .. n .. " pincéis")
		end },
		{ "valor", "favoritos", true },
		{ "conferir", function(dlg) confere(#dlg.campos.pincel.options == 1, "só favoritos") end },
		{ "valor", "favoritos", false },
		{ "valor", "grupo", "(todos)" },
		{ "valor", "pincel", "Seta" },
		{ "clicar", "editar" },
		{ "conferir", function(dlg) confere(dlg.data.pincel == "Seta comprida", "depois de editar: " .. tostring(dlg.data.pincel)) end },
		{ "clicar", "renomear" },
		{ "clicar", "ativar" },
		{ "clicar", "usar" },
	})
	cena("Editar pincel", { { "valor", "nome", "Seta comprida" }, { "valor", "etiquetas", "direção" }, { "clicar", "ok" } })
	cena("Renomear em lote", { { "valor", "grupo", "setas" }, { "valor", "padrao", "seta_%02d" }, { "clicar", "ok" } })
	menu("Biblioteca de pincéis…")
	local l = E.chamar("biblioteca.listar", { pasta = LIB, grupo = "setas" })
	confere(l.pinceis[1].nome == "seta_01", "renomear em lote: " .. l.pinceis[1].nome)
	confere(ultimoAviso():find("no lápis", 1, true), "aviso do pincel: " .. ultimoAviso())
	local at = E.chamar("ativo.ler", { pasta = LIB })
	confere(at.fonte and at.fonte.pincel == "seta", "pincel ativo: " .. tostring(at.fonte and at.fonte.pincel))
end)

caso("carimbar — no centro da seleção, camada nova, um Ctrl+Z desfaz", function()
	ativar(vaca, corpo)
	vaca.selection = Selection(Rectangle(30, 4, 14, 10))
	local antes = assinatura(vaca)
	local nCamadas = #camadas(vaca)
	cena("Biblioteca de pincéis", { { "valor", "pincel", "seta_01" }, { "clicar", "carimbar" } })
	cena("Carimbar", { { "valor", "escala", 200 }, { "valor", "angulo", 90 }, { "clicar", "ok" } })
	menu("Biblioteca de pincéis…")
	local nova = camada(vaca, "pincel")
	local nomes = {}
	for _, l in ipairs(camadas(vaca)) do nomes[#nomes + 1] = l.name .. "=" .. pixelsDe(l) end
	confere(nova and pixelsDe(nova) > 0 and #camadas(vaca) == nCamadas + 1, "camada nova com o carimbo: " .. table.concat(nomes, ", ") .. " / " .. ultimoAviso())
	local cel = nova:cel(1)
	confere(cel.bounds.height > cel.bounds.width, "girou 90° (ficou em pé): " .. cel.bounds.width .. "x" .. cel.bounds.height)
	ver(vaca, "carimbar_centro")
	app.undo()
	confere(assinatura(vaca) == antes, "um Ctrl+Z não voltou ao que era")
end)

caso("carimbar — pincel de várias camadas casa as partes nas camadas de mesmo nome", function()
	ativar(vaca, corpo)
	vaca.selection = Selection()
	local nCamadas = #camadas(vaca)
	local antes = {}
	for _, l in ipairs(camadas(vaca)) do antes[l.name] = pixelsDe(l) end
	cena("Biblioteca de pincéis", { { "valor", "pincel", "Vaca inteira [" .. (#E.chamar("biblioteca.listar", { pasta = LIB, texto = "Vaca inteira" }).pinceis[1].camadas) .. " camadas]" }, { "clicar", "carimbar" } })
	cena("Carimbar", { { "valor", "onde", "nos pontos digitados" }, { "valor", "pontos", "36,20" }, { "valor", "escala", 50 }, { "clicar", "ok" } })
	menu("Biblioteca de pincéis…")
	confere(#camadas(vaca) == nCamadas, "criou camada: " .. #camadas(vaca) .. " (era " .. nCamadas .. ")")
	local mudaram = 0
	for _, l in ipairs(camadas(vaca)) do
		if pixelsDe(l) ~= antes[l.name] then mudaram = mudaram + 1 end
	end
	confere(mudaram > 1, "só " .. mudaram .. " camada(s) mudaram")
	ver(vaca, "carimbar_varias_camadas")
	app.undo()
end)

caso("traço — camada-guia em arco, girando pela direção, guia escondida, um Ctrl+Z desfaz", function()
	ativar(vaca, corpo)
	vaca.selection = Selection()
	local guia = vaca:newLayer()
	guia.name = "guia"
	local img = Image(vaca.width, vaca.height, ColorMode.RGB)
	-- Meio arco de cima (como uma ponte), 1 px.
	for g = 1800, 3600 do
		local t = math.rad(g / 10)
		img:drawPixel(math.floor(24 + 20 * math.cos(t) + 0.5), math.floor(30 + 20 * math.sin(t) + 0.5), pc.rgba(255, 0, 255, 255))
	end
	vaca:newCel(guia, 1, img, Point(0, 0))
	app.layer = guia
	local antes = assinatura(vaca)
	cena("Carimbar ao longo de um traço", {
		{ "valor", "fonte", "pincel: seta_01" },
		{ "valor", "caminho", "camada-guia" },
		{ "valor", "guia", "guia" },
		{ "valor", "espacamento", 6 },
		{ "valor", "passo", "não" },
		{ "clicar", "ok" },
	})
	menu("Carimbar ao longo de um traço…")
	local traco = camada(vaca, "traço")
	local nomes = {}
	for _, l in ipairs(camadas(vaca)) do nomes[#nomes + 1] = l.name .. "=" .. pixelsDe(l) end
	confere(traco and pixelsDe(traco) > 0, "camada traço: " .. table.concat(nomes, ", ") .. " / " .. ultimoAviso())
	confere(not guia.isVisible, "a guia não foi escondida")
	confere(ultimoAviso():find("carimbo", 1, true), "aviso: " .. ultimoAviso())
	ver(vaca, "traco_arco")
	app.undo()
	confere(assinatura(vaca) == antes, "um Ctrl+Z não voltou ao que era")
	confere(guia.isVisible, "a guia não voltou a aparecer")
	-- Os ângulos do mesmo traço, pela ação: do lado esquerdo sobe (perto de 270°/-90°), no meio reto (0°), do lado
	-- direito desce (perto de 90°).
	local r
	app.transaction("teste", function()
		r = E.chamar("biblioteca.traco", { pasta = LIB, pincel = "seta_01", tracos = E.chamar("caminho.da_camada", { camada = "guia" }).tracos,
			camada = "conferir", espacamento = 6, salvar = false })
	end)
	local a1, an = r.angulos[1], r.angulos[#r.angulos]
	confere(a1 > 200 and a1 < 340 and an > 20 and an < 160, "ângulos do arco: " .. table.concat(r.angulos, ","))
	app.undo()
	app.sprite = vaca
	vaca:deleteLayer(guia)
end)

caso("traço — contorno da seleção e pontos digitados (fechado)", function()
	ativar(vaca, corpo)
	vaca.selection = Selection(Rectangle(8, 6, 30, 22))
	local nCamadas = #camadas(vaca)
	cena("Carimbar ao longo de um traço", {
		{ "valor", "fonte", "pincel: seta_01" },
		{ "valor", "caminho", "contorno da seleção" },
		{ "valor", "espacamento", 8 },
		{ "valor", "passo", "90°" },
		{ "clicar", "ok" },
	})
	menu("Carimbar ao longo de um traço…")
	confere(#camadas(vaca) == nCamadas + 1, "camada nova")
	ver(vaca, "traco_contorno_selecao")
	app.undo()
	vaca.selection = Selection()
	cena("Carimbar ao longo de um traço", {
		{ "valor", "fonte", "pincel: seta_01" },
		{ "valor", "caminho", "pontos digitados" },
		{ "valor", "pontos", "6,6; 40,6; 40,30; 6,30" },
		{ "valor", "fechado", true },
		{ "valor", "lateral", 1 },
		{ "valor", "semente", 3 },
		{ "clicar", "ok" },
	})
	menu("Carimbar ao longo de um traço…")
	ver(vaca, "traco_pontos")
	app.undo()
	confere(#camadas(vaca) == nCamadas, "sobrou camada")
end)

caso("traço — camada-guia vazia dá aviso claro", function()
	ativar(vaca, corpo)
	local guia = vaca:newLayer()
	guia.name = "guia vazia"
	cena("Carimbar ao longo de um traço", { { "valor", "fonte", "pincel: seta_01" }, { "valor", "caminho", "camada-guia" }, { "valor", "guia", "guia vazia" }, { "clicar", "ok" } })
	menu("Carimbar ao longo de um traço…", "vazia")
	vaca:deleteLayer(guia)
end)

caso("conjuntos — novo da seleção (ilhas), opções guardadas, ativo, próximo no lápis, carimbar", function()
	local pecas = spritePecas()
	ativar(pecas, pecas.layers[1])
	cena("Conjuntos e pincel ativo", {
		{ "clicar", "novo_selecao" },
		{ "conferir", function(dlg)
			confere(dlg.data.conjunto == "Peças", "conjunto: " .. tostring(dlg.data.conjunto))
			confere((dlg.desenhos or 0) > 0, "a prévia do conjunto não desenhou")
		end },
		{ "valor", "sequencia", "vai e volta" },
		{ "clicar", "guardar" },
		{ "clicar", "ativar" },
		{ "clicar", "fechar" },
	})
	cena("Novo conjunto", { { "valor", "nome", "Peças" }, { "clicar", "ok" } })
	menu("Conjuntos e pincel ativo…")
	local c = E.chamar("conjunto.ler", { pasta = LIB, conjunto = "Peças" })
	confere(c.itens == 3 and c.opcoes.sequencia == "vaivem", "conjunto: " .. c.itens .. " itens, " .. tostring(c.opcoes.sequencia))
	-- Próximo no lápis, cinco vezes: 1, 2, 3, 2, 1 (vai e volta).
	local seq = {}
	for _ = 1, 5 do
		menu("Próximo pincel do conjunto ativo")
		seq[#seq + 1] = ultimoAviso():match("Pincel (%d+) de 3")
	end
	confere(table.concat(seq, ",") == "1,2,3,2,1", "sequência: " .. table.concat(seq, ","))
	pecas:close()
	ativar(vaca, corpo)
	vaca.selection = Selection()
	cena("Conjuntos e pincel ativo", { { "valor", "conjunto", "Peças" }, { "valor", "sequencia", "em frente" }, { "clicar", "carimbar" } })
	cena("Carimbar", { { "valor", "onde", "nos pontos digitados" }, { "valor", "pontos", "8,30; 20,30; 34,30" }, { "clicar", "ok" } })
	menu("Conjuntos e pincel ativo…")
	confere(ultimoAviso():find("3 carimbo", 1, true), "aviso: " .. ultimoAviso())
	ver(vaca, "conjunto_carimbado")
	app.undo()
end)

caso("conjuntos — de pincéis da biblioteca (grupo) e apagar", function()
	cena("Conjuntos e pincel ativo", { { "clicar", "novo_pinceis" }, { "valor", "conjunto", "Da vaca" }, { "clicar", "apagar" }, { "clicar", "fechar" } })
	cena("Conjunto de pincéis da biblioteca", { { "valor", "nome", "Da vaca" }, { "valor", "grupo", "vaca" }, { "clicar", "ok" } })
	menu("Conjuntos e pincel ativo…")
	local l = E.chamar("conjunto.listar", { pasta = LIB })
	confere(l.total == 1 and l.conjuntos[1].nome == "Peças", "conjuntos: " .. l.total)
end)

caso("copiar deslocando — seleção, para a direita, 2 cópias, camada nova; um Ctrl+Z desfaz", function()
	ativar(vaca, corpo)
	vaca.selection = Selection(Rectangle(4, 4, 12, 12))
	local antes = assinatura(vaca)
	cena("Copiar deslocando", { { "valor", "direcao", "→ direita" }, { "valor", "vezes", 2 }, { "valor", "espaco", 1 }, { "valor", "destino", "camada nova" }, { "clicar", "ok" } })
	menu("Copiar deslocando…")
	local c = camada(vaca, "cópias")
	confere(c and pixelsDe(c) > 0, "camada cópias")
	confere(c:cel(1).bounds.x >= 17, "as cópias não estão à direita: x=" .. c:cel(1).bounds.x)
	ver(vaca, "copia_deslocar")
	app.undo()
	confere(assinatura(vaca) == antes, "um Ctrl+Z não voltou ao que era")
end)

caso("copiar girando — sem seleção (o desenho da camada), 90° ao lado", function()
	ativar(vaca, corpo)
	vaca.selection = Selection()
	app.transaction("teste", function() vaca:crop(0, 0, 96, 72) end)
	local antes = pixelsDe(corpo)
	cena("Copiar girando", { { "valor", "angulo", 90 }, { "valor", "onde", "ao lado, à direita" }, { "clicar", "ok" } })
	menu("Copiar girando…")
	confere(pixelsDe(corpo) > antes, "a cópia girada não apareceu")
	ver(vaca, "copia_girar", 4)
	app.undo()
	confere(pixelsDe(corpo) == antes, "desfazer")
	app.undo() -- o aumento da tela
	confere(vaca.width == 48, "tamanho " .. vaca.width)
end)

caso("copiar redimensionando — 200%, embaixo, mantendo o original", function()
	ativar(vaca, corpo)
	vaca.selection = Selection(Rectangle(4, 4, 10, 8))
	cena("Copiar redimensionando", { { "valor", "escala", 200 }, { "valor", "onde", "ao lado, embaixo" }, { "valor", "destino", "camada nova" }, { "clicar", "ok" } })
	menu("Copiar redimensionando…")
	local c = camada(vaca, "cópias")
	confere(c and c:cel(1).bounds.width <= 20 and c:cel(1).bounds.width > 10, "tamanho da cópia: " .. (c and c:cel(1).bounds.width or -1))
	ver(vaca, "copia_redimensionar")
	app.undo()
end)

caso("exportar — seleção (8x), camadas, folha com JSON, quadros da seleção", function()
	ativar(vaca, corpo)
	vaca.selection = Selection(Rectangle(0, 0, 24, 18))
	local png = app.fs.joinPath(SAIDA, "exportar_selecao.png")
	cena("Exportar seleção", { { "valor", "arquivo", png }, { "valor", "escala", 8 }, { "clicar", "ok" } })
	menu("Exportar seleção…")
	confere(app.fs.isFile(png), "png da seleção")
	local img = Image{ fromFile = png }
	confere(img.width == 24 * 8 and img.height == 18 * 8, "tamanho " .. img.width .. "x" .. img.height)
	local pasta = app.fs.joinPath(SAIDA, "exportar_camadas")
	cena("Exportar camadas", { { "valor", "pasta", pasta }, { "valor", "aparar", true }, { "clicar", "ok" } })
	menu("Exportar camadas…")
	confere(#app.fs.listFiles(pasta) >= 2, "camadas exportadas: " .. #app.fs.listFiles(pasta))
	local folha = app.fs.joinPath(SAIDA, "exportar_folha.png")
	cena("Exportar folha de sprites", { { "valor", "arquivo", folha }, { "valor", "escala", 2 }, { "valor", "json", true }, { "clicar", "ok" } })
	menu("Exportar folha de sprites…")
	confere(app.fs.isFile(folha) and app.fs.isFile(app.fs.joinPath(SAIDA, "exportar_folha.json")), "folha e json")
	local novo = app.fs.joinPath(SAIDA, "quadros_selecao.aseprite")
	cena("Quadros da seleção", { { "valor", "largura", 12 }, { "valor", "altura", 9 }, { "valor", "arquivo", novo }, { "clicar", "ok" } })
	menu("Quadros da seleção (sprite novo)…")
	confere(app.fs.isFile(novo), "sprite novo")
	local s = app.sprite
	confere(s and #s.frames >= 2, "quadros: " .. tostring(s and #s.frames))
	if s ~= vaca then s:close() end
	ativar(vaca, corpo)
end)

caso("ajustar cores — a cor de frente (+120° de matiz), a frente acompanha; um Ctrl+Z desfaz", function()
	ativar(vaca, corpo)
	vaca.selection = Selection()
	-- A cor mais comum do corpo.
	local conta, melhor, n = {}, nil, 0
	for it in corpo:cel(1).image:pixels() do
		local v = it()
		if pc.rgbaA(v) > 0 then
			conta[v] = (conta[v] or 0) + 1
			if conta[v] > n then melhor, n = v, conta[v] end
		end
	end
	app.fgColor = Color{ r = pc.rgbaR(melhor), g = pc.rgbaG(melhor), b = pc.rgbaB(melhor) }
	local antes = assinatura(vaca)
	cena("Ajustar matiz, saturação e valor", { { "valor", "quais", "a cor de frente" }, { "valor", "h", 120 }, { "valor", "s", 30 }, { "clicar", "ok" } })
	menu("Ajustar matiz, saturação e valor…")
	confere(ultimoAviso():find(n .. " pixels", 1, true) or ultimoAviso():find("pixels", 1, true), "aviso: " .. ultimoAviso())
	local c = app.fgColor
	confere(not (c.red == pc.rgbaR(melhor) and c.green == pc.rgbaG(melhor) and c.blue == pc.rgbaB(melhor)), "a cor de frente não acompanhou")
	ver(vaca, "cores_ajustadas")
	app.undo()
	confere(assinatura(vaca) == antes, "um Ctrl+Z não voltou ao que era")
	-- Tudo em 0: aviso, nada muda.
	cena("Ajustar matiz, saturação e valor", { { "clicar", "ok" } })
	menu("Ajustar matiz, saturação e valor…", "nada a mudar")
end)

caso("matrizes — conjunto inicial criado ao abrir; preencher só sobre o desenho, faixa e degradê", function()
	ativar(vaca, corpo)
	vaca.selection = Selection(Rectangle(0, 0, 48, 20))
	local antes = assinatura(vaca)
	cena("Matrizes de dithering", {
		{ "conferir", function(dlg)
			confere(#dlg.campos.matriz.options == 7, "matrizes iniciais: " .. #dlg.campos.matriz.options)
			confere((dlg.desenhos or 0) > 0, "a prévia da matriz não desenhou")
		end },
		{ "valor", "matriz", "Bayer 4x4" },
		{ "valor", "densidade", 25 },
		{ "valor", "cor", Color{ r = 40, g = 20, b = 20 } },
		{ "valor", "destino", "camada nova, só sobre o desenho da camada ativa" },
		{ "clicar", "aplicar" },
	})
	menu("Matrizes de dithering…")
	local s = camada(vaca, "sombra")
	confere(s and pixelsDe(s) > 0, "camada sombra")
	-- Só dentro da seleção e só onde o corpo tem desenho.
	local cel = s:cel(1)
	for it in cel.image:pixels() do
		if pc.rgbaA(it()) > 0 then
			local x, y = it.x + cel.position.x, it.y + cel.position.y
			confere(y < 20, "pixel fora da seleção em " .. x .. "," .. y)
			local cc = corpo:cel(1)
			local v = cc.image:getPixel(x - cc.position.x, y - cc.position.y)
			confere(pc.rgbaA(v) > 0, "pixel fora do desenho em " .. x .. "," .. y)
		end
	end
	ver(vaca, "matriz_sombra")
	app.undo()
	confere(assinatura(vaca) == antes, "desfazer a sombra")
	vaca.selection = Selection()
	cena("Matrizes de dithering", { { "valor", "matriz", "Ruído azul 16x16" }, { "valor", "como", "faixa (densidade de um lado ao outro)" }, { "valor", "vertical", true }, { "clicar", "aplicar" } })
	menu("Matrizes de dithering…")
	ver(vaca, "matriz_faixa")
	app.undo()
	app.fgColor = Color{ r = 30, g = 40, b = 90 }
	app.bgColor = Color{ r = 230, g = 160, b = 90 }
	cena("Matrizes de dithering", { { "valor", "matriz", "Linhas 4x4" }, { "valor", "como", "degradê da cor de frente para a de fundo" }, { "valor", "vertical", true }, { "valor", "destino", "camada nova" }, { "clicar", "aplicar" } })
	menu("Matrizes de dithering…")
	local p = camada(vaca, "pontilhado")
	confere(p and pixelsDe(p) == 48 * 36, "o degradê não encheu a área: " .. (p and pixelsDe(p) or -1))
	ver(vaca, "matriz_degrade")
	app.undo()
end)

caso("matrizes — nova (ruído azul 8, sequência), apagar, instalar cancelado não grava", function()
	-- Sequência: um sprite salvo com 3 quadros, cada um mais cheio.
	local niveis = Sprite(4, 4, ColorMode.RGB)
	for _ = 2, 3 do niveis:newEmptyFrame() end
	for q = 1, 3 do
		local img = Image(4, 4, ColorMode.RGB)
		local n = 0
		for y = 0, 3 do
			for x = 0, 3 do
				n = n + 1
				if n <= q * 5 then img:drawPixel(x, y, pc.rgba(0, 0, 0, 255)) end
			end
		end
		niveis:newCel(niveis.layers[1], q, img, Point(0, 0))
	end
	local arq = app.fs.joinPath(SAIDA, "niveis.aseprite")
	niveis:saveAs(arq)
	app.sprite = niveis
	cena("Matrizes de dithering", { { "clicar", "nova" }, { "clicar", "nova" }, { "valor", "matriz", "Xadrez 2x2" }, { "clicar", "apagar" }, { "clicar", "instalar" }, { "clicar", "fechar" } })
	cena("Nova matriz", { { "valor", "nome", "Azul 8 semente 3" }, { "valor", "fonte", "Ruído azul" }, { "valor", "tamanho", "8" }, { "valor", "semente", 3 }, { "clicar", "ok" } })
	cena("Nova matriz", { { "valor", "nome", "Degraus" }, { "valor", "fonte", "Sequência: um nível por quadro" }, { "clicar", "ok" } })
	respostaConfirmar = true
	local antesExt = app.fs.isDirectory(app.fs.joinPath(app.fs.userConfigPath, "extensions", "user_generated_dithers"))
	-- Apagar confirma (true); instalar: a confirmação devolve false (cancelado), para não tocar a pasta do usuário.
	local chamadas = 0
	M.ganchos.confirmar = function(t)
		chamadas = chamadas + 1
		return not t:find("extensão do Aseprite", 1, true)
	end
	menu("Matrizes de dithering…")
	M.ganchos.confirmar = function() return respostaConfirmar end
	niveis:close()
	confere(chamadas == 2, "confirmações: " .. chamadas)
	confere(app.fs.isDirectory(app.fs.joinPath(app.fs.userConfigPath, "extensions", "user_generated_dithers")) == antesExt, "instalar cancelado mexeu na pasta de extensões")
	local l = E.chamar("matriz.listar", { pasta = LIB })
	local nomes = {}
	for _, m in ipairs(l.matrizes) do nomes[m.nome] = m end
	confere(nomes["Azul 8 semente 3"] and nomes["Azul 8 semente 3"].niveis == 64, "ruído azul 8: níveis " .. tostring(nomes["Azul 8 semente 3"] and nomes["Azul 8 semente 3"].niveis))
	confere(nomes.Degraus and nomes.Degraus.niveis == 4, "sequência: níveis " .. tostring(nomes.Degraus and nomes.Degraus.niveis))
	confere(not nomes["Xadrez 2x2"], "o xadrez não foi apagado")
end)

caso("matrizes — ruído azul 16 tem 256 níveis, sem vizinhos acesos juntos a 6%; instalar numa pasta de teste", function()
	local m = E._interno.matriz{ pasta = LIB, matriz = "Ruído azul 16x16" }
	local vistos, n = {}, 0
	for i = 1, 256 do
		if not vistos[m.v[i]] then vistos[m.v[i]] = true; n = n + 1 end
	end
	confere(n == 256, "níveis distintos: " .. n)
	-- A 6,25% (16 pontos), nenhum ponto aceso encosta noutro (4 vizinhos, dando a volta).
	local function aceso(x, y) return m.v[((y % 16) * 16) + (x % 16) + 1] < 16 end
	local juntos = 0
	for y = 0, 15 do
		for x = 0, 15 do
			if aceso(x, y) and (aceso(x + 1, y) or aceso(x, y + 1)) then juntos = juntos + 1 end
		end
	end
	confere(juntos == 0, "pontos encostados a 6%: " .. juntos)
	E.chamar("matriz.ler", { pasta = LIB, matriz = "Ruído azul 16x16", png = app.fs.joinPath(SAIDA, "matriz_ruido_azul_16.png") })
	local ext = app.fs.joinPath(SAIDA, "extensoes_teste")
	local r = E.chamar("matriz.instalar", { pasta = LIB, saida = ext })
	local pasta = app.fs.joinPath(ext, "user_generated_dithers")
	confere(r.extensao.matrizes == #E.chamar("matriz.listar", { pasta = LIB }).matrizes, "matrizes instaladas: " .. r.extensao.matrizes)
	confere(app.fs.isFile(app.fs.joinPath(pasta, "package.json")) and app.fs.isFile(app.fs.joinPath(pasta, "__info.json")), "package.json e __info.json")
	confere(app.fs.isFile(app.fs.joinPath(pasta, "hv_bayer_4x4.bmp")), "hv_bayer_4x4.bmp")
	local f = io.open(app.fs.joinPath(pasta, "package.json"), "rb")
	local pacote = json.decode(f:read("a"))
	f:close()
	confere(#pacote.contributes.ditheringMatrices == r.extensao.matrizes, "entradas no package.json")
	-- Uma matriz lida de volta do .bmp tem os mesmos níveis.
	local spr = app.open(app.fs.joinPath(pasta, "hv_bayer_4x4.bmp"))
	local vs = {}
	for it in spr.cels[1].image:pixels() do vs[it()] = true end
	local k = 0
	for _ in pairs(vs) do k = k + 1 end
	spr:close()
	confere(k == 16, "bayer 4x4 no .bmp: " .. k .. " níveis")
	-- De novo não duplica.
	local r2 = E.chamar("matriz.instalar", { pasta = LIB, saida = ext, iniciais = false })
	f = io.open(app.fs.joinPath(pasta, "package.json"), "rb")
	pacote = json.decode(f:read("a"))
	f:close()
	confere(#pacote.contributes.ditheringMatrices == r2.extensao.matrizes, "duplicou ao instalar de novo")
end)

caso("sem sprite — os itens que precisam de sprite ficam desligados e a biblioteca abre", function()
	local abertos_ = {}
	for _, s in ipairs(app.sprites) do abertos_[#abertos_ + 1] = s end
	-- A vaca continua aberta; só confere o onenabled com o sprite ativo nil não é possível em lote sem fechar tudo:
	-- fecha uma cópia da lista e reabre a vaca no fim.
	for _, s in ipairs(abertos_) do s:close() end
	confere(app.sprite == nil, "ainda há sprite")
	confere(comandos["Copiar girando…"].onenabled() == false, "Copiar girando ligado sem sprite")
	confere(comandos["Biblioteca de pincéis…"].onenabled() == true, "Biblioteca desligada sem sprite")
	cena("Biblioteca de pincéis", { { "clicar", "fechar" } })
	menu("Biblioteca de pincéis…")
end)

exit(plugin)
print(string.format("RESUMO ok=%d falhas=%d", oks, falhas))
