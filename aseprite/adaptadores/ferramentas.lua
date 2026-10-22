-- Ferramentas nossas para o que as extensões de terceiros do Aseprite só fazem com janela (2026-10-22).
--
-- O adaptador (extensoes.lua) chama o código do Dithering Generator, do Brush Manager PRO, do Live Brush e do Carbs
-- Toolbar onde dá. O que elas só fazem pela janela, pelo pincel de quem desenha ou trocando de aba ficou de fora; o
-- usuário pediu (2026-10-22) que isso também funcionasse sem janela. Este arquivo refaz essas partes com a API do
-- Aseprite, em código nosso (nada copiado delas: as licenças proíbem): biblioteca de pincéis com favoritos, etiquetas e
-- grupos; pincéis de várias camadas; traço que gira cada carimbo pela direção do caminho; conjuntos salvos e o pincel
-- ativo em arquivo; cópias deslocadas, giradas e redimensionadas; folha de sprites, seleção, camadas e quadros
-- exportados sem trocar de aba; matiz/saturação/valor em cores escolhidas; biblioteca de matrizes de dithering e a
-- pasta de extensão `user_generated_dithers` gerada (sem instalar). Ações e exemplos em docs/arte/EXTENSOES_ASEPRITE.md.
--
-- extensoes.lua carrega este arquivo no fim e passa as utilidades dele (`U`): o alvo (`arquivo`, `camada`, `quadro`,
-- `saida`, `png`...), a colagem com `modo` e `mascara`, as cores. As ações entram em E.ACOES e valem no E.chamar,
-- no rodar.lua e no tools/aseprite_extensoes.mjs como as outras. Nenhuma precisa das extensões instaladas, menos
-- `matriz.gravar` com `ruido` (usa o mapa de limiar do Dithering Generator) e `biblioteca.importar` pelo nome de uma
-- biblioteca do Brush Manager (com o caminho do arquivo, não).
--
-- A biblioteca (pincéis, conjuntos, matrizes) é uma pasta: `pasta` em cada chamada, a variável de ambiente
-- HV_PINCEIS ou, sem as duas, %APPDATA%\Aseprite\diorama\pinceis\ (fora do repositório desde 2026-10-22, a mesma
-- que a extensão Diorama usa com janela). biblioteca.json tem as entradas; as imagens ficam em imagens/ e matrizes/;
-- estado.json guarda o pincel ativo e o uso (recentes).
--
-- Desde 2026-10-22 (extensão Diorama 0.5.0, "Ferramentas" com janela) também: o caminho tirado de uma camada-guia
-- ou do contorno da seleção (`caminho.*`), vários traços num carimbo só (`tracos`), `conjunto.editar`,
-- `ativo.proximo`, matrizes de ruído azul, linhas e xadrez nossas, o conjunto inicial (`matriz.iniciais`) e a
-- instalação na pasta de extensões (`matriz.instalar`).

return function(E, U)
	local falha, cor, pixelDe, hex = U.falha, U.cor, U.pixelDe, U.hex
	local retangulo, tabelaRet, ponto, opaco = U.retangulo, U.tabelaRet, U.ponto, U.opaco
	local pc = app.pixelColor
	local floor, max, min, abs = math.floor, math.max, math.min, math.abs

	-- A pasta "aseprite" do repositório (aseprite/adaptadores/..) ou, instalado, a pasta da extensão Diorama
	-- (<extensão>/adaptadores/..): nas duas, o RotSprite fica em <ela>/pixel/rotsprite.lua.
	local PASTA_ASEPRITE = (function()
		local fonte = debug.getinfo(1, "S").source
		if fonte:sub(1, 1) == "@" then fonte = fonte:sub(2) end
		return app.fs.filePath(app.fs.filePath(fonte))
	end)()
	-- A biblioteca do usuário fica fora do repositório (2026-10-22): o repositório é público, e pincel feito de arte
	-- de terceiros (folhas do Aeko, peças do Graal) não pode ir para ele; fora da pasta da extensão também, para
	-- sobreviver a cada `npm run aseprite:instalar` (que apaga a extensão antes de copiar).
	local PASTA_PADRAO = app.fs.joinPath(app.fs.userConfigPath, "diorama", "pinceis")

	local function semear(o)
		if o.semente ~= nil then math.randomseed(floor(o.semente)) end
	end

	local function agora()
		local ok, t = pcall(os.date, "%Y-%m-%d %H:%M:%S")
		return ok and t or ""
	end

	-- -----------------------------------------------------------------------------------------------------------
	-- JSON: leitura (o json do Aseprite devolve userdata) e escrita estável (chaves em ordem, tabulação), para o
	-- biblioteca.json dar diferenças limpas no git.

	-- No Lua do Aseprite, math.tointeger(0.8) devolve 0 em vez de falhar (2026-10-22): não usar para saber se um
	-- número é inteiro.
	local function inteiroOu(v)
		if math.type(v) == "float" and v == floor(v) and abs(v) < 2 ^ 53 then return floor(v) end
		return v
	end

	local paraTabela
	paraTabela = function(v)
		local tipo = type(v)
		if tipo == "number" then return inteiroOu(v) end
		if tipo ~= "userdata" and tipo ~= "table" then return v end
		local t = {}
		if v[1] ~= nil then
			for i, item in ipairs(v) do t[i] = paraTabela(item) end
		else
			for k, item in pairs(v) do t[k] = paraTabela(item) end
		end
		return t
	end

	local function lerJSON(caminho)
		local texto = U.lerTexto(caminho)
		if not texto then return nil end
		local ok, dados = pcall(json.decode, texto)
		if not ok then falha("JSON estragado em %s: %s", caminho, tostring(dados)) end
		return paraTabela(dados)
	end

	local ESCAPES = { ['"'] = '\\"', ["\\"] = "\\\\", ["\n"] = "\\n", ["\r"] = "\\r", ["\t"] = "\\t" }
	-- Só os controles ASCII viram \uXXXX. Não usar %c: no Lua do Aseprite ele pega bytes acima de 127 também, e um
	-- acento em UTF-8 ("Ruído") virava dois \u00XX que voltavam como outros caracteres (2026-10-22).
	local function textoJSON(s)
		return '"' .. (s:gsub('[\0-\31\127"\\]', function(c) return ESCAPES[c] or string.format("\\u%04x", c:byte()) end)) .. '"'
	end

	-- Tabela marcada como objeto: vazia, sai {} e não [].
	local OBJETO = {}
	local function objeto(t)
		return setmetatable(t or {}, OBJETO)
	end

	local function ehLista(t)
		if getmetatable(t) == OBJETO then return false end
		local n = 0
		for _ in pairs(t) do n = n + 1 end
		return n == #t
	end

	local codificar
	codificar = function(v, recuo)
		local tipo = type(v)
		if tipo == "string" then return textoJSON(v) end
		if tipo == "boolean" then return tostring(v) end
		if tipo == "number" then
			if v ~= v or v == math.huge or v == -math.huge then return "null" end
			local i = inteiroOu(v)
			if math.type(i) == "integer" then return tostring(i) end
			return string.format("%.6g", v)
		end
		if tipo ~= "table" then return "null" end
		local dentro = recuo .. "\t"
		if ehLista(v) then
			if #v == 0 then return "[]" end
			local simples = true
			local partes = {}
			for i, x in ipairs(v) do
				if type(x) == "table" then simples = false end
				partes[i] = codificar(x, dentro)
			end
			if simples then return "[" .. table.concat(partes, ", ") .. "]" end
			return "[\n" .. dentro .. table.concat(partes, ",\n" .. dentro) .. "\n" .. recuo .. "]"
		end
		local chaves = {}
		for k in pairs(v) do chaves[#chaves + 1] = k end
		if #chaves == 0 then return "{}" end
		table.sort(chaves, function(a, b) return tostring(a) < tostring(b) end)
		local partes = {}
		for _, k in ipairs(chaves) do partes[#partes + 1] = textoJSON(tostring(k)) .. ": " .. codificar(v[k], dentro) end
		return "{\n" .. dentro .. table.concat(partes, ",\n" .. dentro) .. "\n" .. recuo .. "}"
	end

	local function criarPastaDe(arquivo)
		local pasta = app.fs.filePath(arquivo)
		if pasta ~= "" and not app.fs.isDirectory(pasta) then app.fs.makeAllDirectories(pasta) end
	end

	local function gravarJSON(caminho, dados)
		criarPastaDe(caminho)
		local f = io.open(caminho, "wb")
		if not f then falha("não consegui gravar %s", caminho) end
		f:write(codificar(dados, ""), "\n")
		f:close()
	end

	local function gravarPNG(img, caminho)
		criarPastaDe(caminho)
		img:saveAs(caminho)
		return caminho
	end

	local function apagarArquivo(caminho)
		if app.fs.isFile(caminho) then os.remove(caminho) end
	end

	local function apagarPastaVazia(pasta)
		if app.fs.isDirectory(pasta) and #app.fs.listFiles(pasta) == 0 and app.fs.removeDirectory then
			pcall(app.fs.removeDirectory, pasta)
		end
	end

	-- -----------------------------------------------------------------------------------------------------------
	-- A pasta da biblioteca

	local function pastaDe(o)
		if o.pasta and o.pasta ~= "" then return o.pasta end
		local ok, env = pcall(os.getenv, "HV_PINCEIS")
		if ok and env and env ~= "" then return env end
		return PASTA_PADRAO
	end

	local function lerBiblioteca(pasta)
		local b = lerJSON(app.fs.joinPath(pasta, "biblioteca.json")) or {}
		b.formato = b.formato or 1
		b.pinceis = b.pinceis or {}
		b.conjuntos = b.conjuntos or {}
		b.matrizes = b.matrizes or {}
		for _, c in ipairs(b.conjuntos) do c.opcoes = objeto(c.opcoes) end
		return b
	end

	local function gravarBiblioteca(pasta, b)
		gravarJSON(app.fs.joinPath(pasta, "biblioteca.json"), b)
	end

	local function lerEstado(pasta)
		local e = lerJSON(app.fs.joinPath(pasta, "estado.json")) or {}
		e.uso = objeto(e.uso)
		if e.ativo then e.ativo.opcoes = objeto(e.ativo.opcoes) end
		return e
	end

	local function gravarEstado(pasta, e)
		gravarJSON(app.fs.joinPath(pasta, "estado.json"), e)
	end

	local ACENTOS = {
		["á"] = "a", ["à"] = "a", ["â"] = "a", ["ã"] = "a", ["ä"] = "a", ["é"] = "e", ["è"] = "e", ["ê"] = "e",
		["ë"] = "e", ["í"] = "i", ["ì"] = "i", ["î"] = "i", ["ï"] = "i", ["ó"] = "o", ["ò"] = "o", ["ô"] = "o",
		["õ"] = "o", ["ö"] = "o", ["ú"] = "u", ["ù"] = "u", ["û"] = "u", ["ü"] = "u", ["ç"] = "c", ["ñ"] = "n",
		["Á"] = "a", ["À"] = "a", ["Â"] = "a", ["Ã"] = "a", ["É"] = "e", ["Ê"] = "e", ["Í"] = "i", ["Ó"] = "o",
		["Ô"] = "o", ["Õ"] = "o", ["Ú"] = "u", ["Ü"] = "u", ["Ç"] = "c",
	}

	--- Identificador de arquivo a partir de um nome: minúsculas ASCII e "_".
	local function slug(nome)
		local s = tostring(nome):gsub("[\192-\255][\128-\191]*", function(c) return ACENTOS[c] or "_" end)
		s = s:lower():gsub("[^%w]+", "_"):gsub("^_+", ""):gsub("_+$", "")
		if s == "" then s = "item" end
		return s
	end

	local function acharEm(lista, ref)
		if ref == nil then return nil end
		ref = tostring(ref)
		for i, x in ipairs(lista) do if x.id == ref then return x, i end end
		for i, x in ipairs(lista) do if x.nome == ref then return x, i end end
		local baixo = ref:lower()
		for i, x in ipairs(lista) do if x.nome and x.nome:lower() == baixo then return x, i end end
		return nil
	end

	local function exigirEm(lista, ref, oque)
		local x, i = acharEm(lista, ref)
		if not x then falha("%s não encontrado: %s", oque, tostring(ref)) end
		return x, i
	end

	local function idLivre(lista, base)
		local id, k = base, 2
		while acharEm(lista, id) and acharEm(lista, id).id == id do
			id = base .. "_" .. k
			k = k + 1
		end
		return id
	end

	-- -----------------------------------------------------------------------------------------------------------
	-- Imagens: escala, espelho, giro e cor, nossos, em qualquer modo de cor (`vazio` é o valor transparente).

	local function nova(modo, w, h, vazio)
		local img
		if modo == ColorMode.INDEXED then
			-- O índice transparente vai no spec: o emRGB do adaptador lê de lá.
			img = Image(ImageSpec{ width = w, height = h, colorMode = modo, transparentColor = vazio or 0 })
		else
			img = Image(w, h, modo)
		end
		img:clear(vazio or 0)
		return img
	end

	local function vazioDoSprite(spr)
		return spr.colorMode == ColorMode.INDEXED and spr.transparentColor or 0
	end

	--- Um valor opaco no modo do sprite (marca onde apagar).
	local function marcaDoSprite(spr)
		if spr.colorMode == ColorMode.RGB then return pc.rgba(0, 0, 0, 255) end
		if spr.colorMode == ColorMode.GRAY then return pc.graya(0, 255) end
		return spr.transparentColor == 0 and 1 or 0
	end

	--- Vizinho mais próximo: cada pixel novo pega o pixel de origem do centro dele.
	local function escalar(img, w, h, vazio)
		w, h = max(1, floor(w + 0.5)), max(1, floor(h + 0.5))
		if w == img.width and h == img.height then return img:clone() end
		local out = nova(img.colorMode, w, h, vazio)
		for y = 0, h - 1 do
			local sy = min(img.height - 1, floor((y + 0.5) * img.height / h))
			for x = 0, w - 1 do
				local sx = min(img.width - 1, floor((x + 0.5) * img.width / w))
				out:drawPixel(x, y, img:getPixel(sx, sy))
			end
		end
		return out
	end

	local function espelhar(img, horizontal, vertical, vazio)
		if not horizontal and not vertical then return img end
		local w, h = img.width, img.height
		local out = nova(img.colorMode, w, h, vazio)
		for it in img:pixels() do
			local x = horizontal and (w - 1 - it.x) or it.x
			local y = vertical and (h - 1 - it.y) or it.y
			out:drawPixel(x, y, it())
		end
		return out
	end

	--- Gira `graus` no sentido do relógio (y para baixo). Múltiplos de 90 são exatos; os outros, vizinho mais
	--- próximo numa tela que cabe o desenho girado (centro com centro), sem misturar cores.
	local function girar(img, graus, vazio)
		local a = (graus or 0) % 360
		if abs(a - floor(a + 0.5)) < 1e-6 then a = floor(a + 0.5) % 360 end
		if a == 0 then return img end
		local w, h = img.width, img.height
		if a == 90 or a == 180 or a == 270 then
			local out = a == 180 and nova(img.colorMode, w, h, vazio) or nova(img.colorMode, h, w, vazio)
			for it in img:pixels() do
				local x, y = it.x, it.y
				if a == 90 then
					out:drawPixel(h - 1 - y, x, it())
				elseif a == 180 then
					out:drawPixel(w - 1 - x, h - 1 - y, it())
				else
					out:drawPixel(y, w - 1 - x, it())
				end
			end
			return out
		end
		local r = math.rad(a)
		local c, s = math.cos(r), math.sin(r)
		local nw = max(1, math.ceil(abs(w * c) + abs(h * s) - 1e-6))
		local nh = max(1, math.ceil(abs(w * s) + abs(h * c) - 1e-6))
		local out = nova(img.colorMode, nw, nh, vazio)
		for oy = 0, nh - 1 do
			local py = oy + 0.5 - nh / 2
			for ox = 0, nw - 1 do
				local px = ox + 0.5 - nw / 2
				local sx = floor(px * c + py * s + w / 2)
				local sy = floor(-px * s + py * c + h / 2)
				if sx >= 0 and sy >= 0 and sx < w and sy < h then
					local v = img:getPixel(sx, sy)
					if v ~= vazio then out:drawPixel(ox, oy, v) end
				end
			end
		end
		return out
	end

	--- Scale2x (EPX): dobra a imagem arredondando as diagonais sem inventar cores.
	local function scale2x(img, vazio)
		local w, h = img.width, img.height
		local out = nova(img.colorMode, w * 2, h * 2, vazio)
		local function px(x, y)
			if x < 0 or y < 0 or x >= w or y >= h then return vazio end
			return img:getPixel(x, y)
		end
		for y = 0, h - 1 do
			for x = 0, w - 1 do
				local p = img:getPixel(x, y)
				local a, b, c, d = px(x, y - 1), px(x + 1, y), px(x - 1, y), px(x, y + 1)
				local e0, e1, e2, e3 = p, p, p, p
				if c == a and c ~= d and a ~= b then e0 = a end
				if a == b and a ~= c and b ~= d then e1 = b end
				if d == c and d ~= b and c ~= a then e2 = c end
				if b == d and b ~= a and d ~= c then e3 = d end
				out:drawPixel(x * 2, y * 2, e0)
				out:drawPixel(x * 2 + 1, y * 2, e1)
				out:drawPixel(x * 2, y * 2 + 1, e2)
				out:drawPixel(x * 2 + 1, y * 2 + 1, e3)
			end
		end
		return out
	end

	--- Giro no jeito do RotSprite: Scale2x duas vezes (4x), gira por vizinho mais próximo e volta ao tamanho pela
	--- cor que mais aparece em cada bloco 4x4 (transparente se for a maioria). Linhas finas saem mais limpas que no
	--- vizinho mais próximo direto; nenhuma cor nova aparece. Múltiplos de 90 vão direto (exatos).
	local function girarLimpo(img, graus, vazio)
		local a = (graus or 0) % 360
		if abs(a - floor(a / 90 + 0.5) * 90) < 1e-6 then return girar(img, a, vazio) end
		local f = 4
		local grande = girar(scale2x(scale2x(img, vazio), vazio), a, vazio)
		local w, h = math.ceil(grande.width / f), math.ceil(grande.height / f)
		local ox = floor((w * f - grande.width) / 2)
		local oy = floor((h * f - grande.height) / 2)
		local out = nova(img.colorMode, w, h, vazio)
		local rgb = img.colorMode == ColorMode.RGB
		for by = 0, h - 1 do
			for bx = 0, w - 1 do
				-- O centro do bloco (dos quatro do meio, o primeiro que tem cor): linha de 1 px não some.
				local cx, cy = bx * f - ox + f / 2, by * f - oy + f / 2
				for _, d in ipairs({ { -1, -1 }, { 0, -1 }, { -1, 0 }, { 0, 0 } }) do
					local x, y = cx + d[1], cy + d[2]
					if x >= 0 and y >= 0 and x < grande.width and y < grande.height then
						local v = grande:getPixel(x, y)
						if v ~= vazio and not (rgb and pc.rgbaA(v) == 0) then
							out:drawPixel(bx, by, v)
							break
						end
					end
				end
			end
		end
		return out
	end

	-- O RotSprite completo (aseprite/pixel/rotsprite.lua: 8x, redução e limpeza de órfãos; na extensão,
	-- <extensão>/pixel/rotsprite.lua), se estiver lá; sem ele, o girarLimpo acima.
	local rotsprite
	local function moduloRotsprite()
		if rotsprite == nil then
			rotsprite = false
			local caminho = app.fs.joinPath(PASTA_ASEPRITE, "pixel", "rotsprite.lua")
			if app.fs.isFile(caminho) then
				local ok, R = pcall(dofile, caminho)
				if ok and type(R) == "table" and type(R.girar_imagem) == "function" then rotsprite = R end
			end
		end
		return rotsprite
	end

	--- O giro pedido: `giro` = "rotsprite" (padrão; o módulo do repositório, ou o "simples" se ele faltar),
	--- "simples" (Scale2x 4x e amostra do centro, deste arquivo) ou "vizinho" (vizinho mais próximo direto).
	local function girarCom(o, img, graus, vazio)
		local metodo = o.giro or "rotsprite"
		if metodo == "vizinho" then return girar(img, graus, vazio) end
		local a = (graus or 0) % 360
		if abs(a - floor(a / 90 + 0.5) * 90) < 1e-6 then return girar(img, a, vazio) end
		if metodo == "rotsprite" then
			local R = moduloRotsprite()
			if R then
				local ok, nova = pcall(R.girar_imagem, img, a, {})
				if ok and nova then return nova end
			end
			return girarLimpo(img, a, vazio)
		end
		if metodo ~= "simples" then falha("giro inválido: %s (rotsprite, simples ou vizinho)", tostring(metodo)) end
		return girarLimpo(img, a, vazio)
	end

	--- Silhueta numa cor (imagem RGB): cada pixel opaco vira a cor, com o alfa dele.
	local function tingir(img, c)
		local out = img:clone()
		local r, g, b, a = c.red, c.green, c.blue, c.alpha
		for it in out:pixels() do
			local v = it()
			local va = pc.rgbaA(v)
			if va > 0 then it(pc.rgba(r, g, b, floor(va * a / 255 + 0.5))) end
		end
		return out
	end

	--- Troca cores exatas (imagem RGB): pares = { {de, para}, ... }; o alfa fica.
	local function trocarCores(img, pares)
		local mapa = {}
		for _, par in ipairs(pares) do
			local de, para = cor(par[1] or par.de), cor(par[2] or par.para)
			mapa[(de.red << 16) | (de.green << 8) | de.blue] = para
		end
		local out = img:clone()
		for it in out:pixels() do
			local v = it()
			local va = pc.rgbaA(v)
			if va > 0 then
				local para = mapa[(pc.rgbaR(v) << 16) | (pc.rgbaG(v) << 8) | pc.rgbaB(v)]
				if para then it(pc.rgba(para.red, para.green, para.blue, va)) end
			end
		end
		return out
	end

	local function temConteudo(img, spr)
		local cm = spr and spr.colorMode or img.colorMode
		local tr = spr and spr.transparentColor or 0
		for it in img:pixels() do
			if opaco(it(), cm, tr) then return true end
		end
		return false
	end

	--- O retângulo do que está desenhado (imagem RGB), ou nil.
	local function limitesRGB(img)
		local r = img:shrinkBounds()
		if r.isEmpty then return nil end
		return r
	end

	--- Cópia ampliada `escala` vezes (vizinho mais próximo); a própria imagem se escala <= 1.
	local function ampliarImg(img, escala)
		escala = floor(escala or 1)
		if escala <= 1 then return img end
		local out = img:clone()
		out:resize(img.width * escala, img.height * escala)
		return out
	end

	-- -----------------------------------------------------------------------------------------------------------
	-- Camadas e quadros de um sprite

	--- Camadas de imagem, de baixo para cima, com o caminho ("grupo/camada") e a visibilidade efetiva.
	local function camadasDeImagem(camadas, lista, prefixo, visivelPai)
		lista = lista or {}
		prefixo = prefixo or ""
		if visivelPai == nil then visivelPai = true end
		for _, l in ipairs(camadas) do
			local vis = visivelPai and l.isVisible
			if l.isGroup then
				camadasDeImagem(l.layers, lista, prefixo .. l.name .. "/", vis)
			elseif l.isImage and not l.isTilemap then
				lista[#lista + 1] = { camada = l, caminho = prefixo .. l.name, visivel = vis }
			end
		end
		return lista
	end

	local function abrirSpriteDe(o)
		local spr, aberto
		if o.arquivo then
			spr, aberto = U.abrirSprite(o.arquivo)
		else
			spr = app.activeSprite
			if not spr then falha("sem sprite: passe `arquivo` (ou abra um antes, como o filename do run_lua_script)") end
		end
		app.activeSprite = spr
		return spr, aberto
	end

	local function validarQuadro(spr, q)
		q = floor(q)
		if q < 1 or q > #spr.frames then falha("quadro %d fora do sprite (1 a %d)", q, #spr.frames) end
		return q
	end

	--- Os quadros pedidos: `quadros` = { n, ... } | "todos", ou `quadro` (1).
	local function listaQuadros(spr, o)
		local lista = {}
		if o.quadros == "todos" then
			for i = 1, #spr.frames do lista[i] = i end
		elseif type(o.quadros) == "table" then
			for _, q in ipairs(o.quadros) do lista[#lista + 1] = validarQuadro(spr, q) end
		else
			lista[1] = validarQuadro(spr, o.quadro or 1)
		end
		return lista
	end

	--- As camadas pedidas (existentes): `camadas` = { nomes } | "todas" | "visiveis", ou `camada`, ou a ativa.
	local function listaCamadas(spr, o)
		local lista = {}
		if o.camadas == "todas" or o.camadas == "visiveis" then
			for _, c in ipairs(camadasDeImagem(spr.layers)) do
				if o.camadas == "todas" or c.visivel then lista[#lista + 1] = c.camada end
			end
		elseif type(o.camadas) == "table" then
			for _, nome in ipairs(o.camadas) do
				local l = U.acharCamada(spr.layers, nome)
				if not l then falha("a camada \"%s\" não existe", nome) end
				lista[#lista + 1] = l
			end
		elseif o.camada then
			local l = U.acharCamada(spr.layers, o.camada)
			if not l then falha("a camada \"%s\" não existe", o.camada) end
			lista[1] = l
		else
			local l = app.activeLayer
			if not l or not l.isImage then falha("diga a `camada` (ou `camadas`)") end
			lista[1] = l
		end
		for _, l in ipairs(lista) do
			if l.isTilemap then falha("\"%s\" é uma camada de tilemap (não suportada)", l.name) end
		end
		if #lista == 0 then falha("nenhuma camada de imagem") end
		return lista
	end

	--- A área: `retangulo`, `fatia` (nome) ou `selecao = true` (a seleção do sprite, com a forma dela). Devolve o
	--- retângulo e, para seleção que não é retângulo, a função (x, y) -> dentro.
	local function areaDe(spr, o, obrigatoria)
		if o.retangulo then return retangulo(o.retangulo):intersect(spr.bounds) end
		if o.fatia then
			for _, s in ipairs(spr.slices) do
				if s.name == o.fatia then return Rectangle(s.bounds) end
			end
			falha("a fatia \"%s\" não existe", o.fatia)
		end
		if o.selecao then
			local sel = spr.selection
			if sel.isEmpty then falha("o sprite não tem seleção") end
			local copia = Selection()
			copia:add(sel)
			return Rectangle(sel.bounds), function(x, y) return copia:contains(x, y) end
		end
		if obrigatoria then falha("diga a área: `retangulo`, `fatia` ou `selecao = true`") end
		return Rectangle(spr.bounds)
	end

	--- Os pixels de um cel dentro da área, no modo do sprite (cópia crua, sem converter).
	local function recorteCru(spr, cel, area, dentro)
		local vazio = vazioDoSprite(spr)
		local img = nova(spr.colorMode, area.width, area.height, vazio)
		if not cel then return img end
		local pos = cel.position
		local fonte = cel.image
		local parte = Rectangle(pos.x, pos.y, fonte.width, fonte.height):intersect(area)
		if parte.isEmpty then return img end
		for y = parte.y, parte.y + parte.height - 1 do
			for x = parte.x, parte.x + parte.width - 1 do
				if not dentro or dentro(x, y) then
					img:drawPixel(x - area.x, y - area.y, fonte:getPixel(x - pos.x, y - pos.y))
				end
			end
		end
		return img
	end

	--- Imagem RGB de uma camada (só ela) dentro da área.
	local function celEmRGB(spr, camada, quadro, area)
		local out = Image(area.width, area.height, ColorMode.RGB)
		local cel = camada:cel(quadro)
		if cel then
			local rgb = U.emRGB(recorteCru(spr, cel, area), spr)
			out:drawImage(rgb, Point(0, 0))
		end
		return out
	end

	--- Desenha o sprite com só as camadas de `caminhos` (conjunto caminho -> true) visíveis; nil = como está.
	local function renderizar(spr, quadro, caminhos)
		if not caminhos then return U.achatar(spr, quadro) end
		local estados = {}
		local function percorrer(camadas, prefixo)
			local algum = false
			for _, l in ipairs(camadas) do
				estados[#estados + 1] = { l, l.isVisible }
				local mostra
				if l.isGroup then
					mostra = percorrer(l.layers, prefixo .. l.name .. "/")
				else
					mostra = caminhos[prefixo .. l.name] == true or caminhos[l.name] == true
				end
				l.isVisible = mostra
				algum = algum or mostra
			end
			return algum
		end
		local ok, img = pcall(function()
			percorrer(spr.layers, "")
			return U.achatar(spr, quadro)
		end)
		for _, e in ipairs(estados) do e[1].isVisible = e[2] end
		if not ok then error(img, 0) end
		return img
	end

	local function caminhosDe(camadas)
		if type(camadas) ~= "table" then return nil end
		local t = {}
		for _, c in ipairs(camadas) do t[type(c) == "string" and c or c.name] = true end
		return t
	end

	-- -----------------------------------------------------------------------------------------------------------
	-- Pincéis: o item em memória é { largura, altura, ancora?, partes = { { camada?, img (RGB, largura x altura),
	-- opacidade?, mistura? } } }. Parte sem `camada` vai para a camada do alvo; com `camada`, para a camada de mesmo
	-- nome (pincel de várias camadas, como o "multi layer" do Brush Manager: uma parte por camada da origem).

	--- Corta um item da origem: { png } | { arquivo?, camada? | camadas = {...} | todas_camadas = true, quadro?,
	--- retangulo? | fatia?, aparar? }. Sem `camada(s)`, o sprite achatado. `aparar` (padrão: sim quando não há
	--- retângulo nem fatia) corta o vazio em volta, igual em todas as partes.
	local function recortar(origem)
		if type(origem) ~= "table" then falha("origem inválida (use { png = ... } ou { arquivo, camada(s), retangulo })") end
		local partes = {}
		local largura, altura
		if origem.png then
			if not app.fs.isFile(origem.png) then falha("png não encontrado: %s", origem.png) end
			local img = Image{ fromFile = origem.png }
			if not img then falha("não li %s", origem.png) end
			img = U.emRGB(img)
			partes[1] = { img = img }
			largura, altura = img.width, img.height
		else
			local spr, aberto = abrirSpriteDe(origem)
			local ok, erro = pcall(function()
				local quadro = validarQuadro(spr, origem.quadro or 1)
				local area, dentro
				if origem.retangulo or origem.fatia or origem.selecao then
					-- `selecao = true`: a forma da seleção (laço, varinha), não só o retângulo dela.
					area, dentro = areaDe(spr, origem, true)
				else
					area = Rectangle(spr.bounds)
				end
				if area.isEmpty then falha("a área da origem está fora do sprite") end
				if origem.camadas or origem.todas_camadas then
					local lista = {}
					if origem.todas_camadas then
						for _, c in ipairs(camadasDeImagem(spr.layers)) do
							if c.visivel or origem.ocultas then lista[#lista + 1] = c.camada end
						end
					else
						for _, nome in ipairs(origem.camadas) do
							local l = U.acharCamada(spr.layers, nome)
							if not l then falha("a camada \"%s\" não existe na origem", nome) end
							lista[#lista + 1] = l
						end
					end
					for _, l in ipairs(lista) do
						local img = celEmRGB(spr, l, quadro, area)
						if not img:isEmpty() or origem.manter_vazias then
							partes[#partes + 1] = { camada = l.name, img = img, opacidade = l.opacity, mistura = l.blendMode }
						end
					end
				elseif origem.camada then
					local l = U.acharCamada(spr.layers, origem.camada)
					if not l then falha("a camada \"%s\" não existe na origem", origem.camada) end
					partes[1] = { img = celEmRGB(spr, l, quadro, area) }
				else
					partes[1] = { img = Image(U.achatar(spr, quadro), area) }
				end
				if dentro then
					for _, p in ipairs(partes) do
						for it in p.img:pixels() do
							if not dentro(area.x + it.x, area.y + it.y) then it(0) end
						end
					end
				end
				largura, altura = area.width, area.height
			end)
			if aberto then spr:close() end
			if not ok then error(erro, 0) end
		end
		if #partes == 0 then falha("a origem não tem nada desenhado nas camadas pedidas") end
		local aparar = origem.aparar
		if aparar == nil then aparar = not origem.retangulo and not origem.fatia and not origem.selecao end
		if aparar then
			local uniao
			for _, p in ipairs(partes) do
				local r = limitesRGB(p.img)
				if r then uniao = uniao and uniao:union(r) or r end
			end
			if not uniao then falha("a origem está vazia") end
			for _, p in ipairs(partes) do p.img = Image(p.img, uniao) end
			largura, altura = uniao.width, uniao.height
		end
		return { largura = largura, altura = altura, partes = partes }
	end

	--- O item achatado (as partes umas sobre as outras), para prévia.
	local function achatarItem(item)
		local img = Image(item.largura, item.altura, ColorMode.RGB)
		for _, p in ipairs(item.partes) do img:drawImage(p.img, Point(0, 0)) end
		return img
	end

	--- Grava as partes de um item em `pasta`/`relativa`/<n>.png e devolve a lista de partes para o JSON.
	local function gravarPartes(pasta, relativa, item)
		local lista = {}
		for i, p in ipairs(item.partes) do
			local nome = p.camada and (i .. "_" .. slug(p.camada)) or tostring(i)
			local rel = relativa .. "/" .. nome .. ".png"
			gravarPNG(p.img, app.fs.joinPath(pasta, rel))
			-- Opacidade e mistura só quando não são as de sempre (a camada nova as recebe).
			local opacidade = p.camada and p.opacidade ~= 255 and p.opacidade or nil
			local mistura = p.camada and p.mistura ~= BlendMode.NORMAL and p.mistura or nil
			lista[i] = { png = rel, camada = p.camada, opacidade = opacidade, mistura = mistura }
		end
		return lista
	end

	local function carregarPartes(pasta, entrada)
		local item = { id = entrada.id, nome = entrada.nome, largura = entrada.largura, altura = entrada.altura,
			ancora = entrada.ancora, partes = {} }
		for i, p in ipairs(entrada.partes or {}) do
			local caminho = app.fs.joinPath(pasta, p.png)
			if not app.fs.isFile(caminho) then falha("falta a imagem %s (de %s)", caminho, tostring(entrada.nome)) end
			local img = Image{ fromFile = caminho }
			item.partes[i] = { camada = p.camada, img = U.emRGB(img), opacidade = p.opacidade, mistura = p.mistura }
		end
		if #item.partes == 0 then falha("\"%s\" não tem partes", tostring(entrada.nome)) end
		item.largura = item.largura or item.partes[1].img.width
		item.altura = item.altura or item.partes[1].img.height
		return item
	end

	local function apagarPartes(pasta, entrada)
		local pastas = {}
		for _, p in ipairs(entrada.partes or {}) do
			local caminho = app.fs.joinPath(pasta, p.png)
			apagarArquivo(caminho)
			pastas[app.fs.filePath(caminho)] = true
		end
		for p in pairs(pastas) do apagarPastaVazia(p) end
	end

	-- -----------------------------------------------------------------------------------------------------------
	-- Motor de carimbo: troca de pincel por carimbo (sequência), escala, espelho, giro (fixo, por passo, sorteado ou
	-- pela direção do traço), deslocamento sorteado, cor, e cada parte na camada dela.

	--- Avança a sequência (estado `seq` = { indice, direcao, usos, iniciado }) e devolve o índice do pincel.
	local function proximoIndice(seq, n, o)
		if n <= 1 then
			seq.indice = 1
			return 1
		end
		local modo = o.sequencia or "frente"
		if seq.iniciado then
			if modo == "aleatorio" then
				seq.indice = math.random(1, n)
			elseif modo ~= "fixo" then
				seq.usos = (seq.usos or 0) + 1
				if seq.usos >= max(1, floor(o.repeticao or 1)) then
					seq.usos = 0
					if modo == "frente" then
						seq.indice = seq.indice % n + 1
					elseif modo == "tras" then
						seq.indice = (seq.indice - 2 + n) % n + 1
					elseif modo == "vaivem" then
						seq.indice = seq.indice + (seq.direcao or 1)
						if seq.indice > n then
							seq.direcao, seq.indice = -1, n - 1
						elseif seq.indice < 1 then
							seq.direcao, seq.indice = 1, 2
						end
					else
						falha("sequencia inválida: %s (fixo, frente, tras, vaivem, aleatorio)", tostring(modo))
					end
				end
			end
		elseif modo == "aleatorio" then
			seq.indice = math.random(1, n)
		end
		seq.iniciado = true
		seq.indice = min(n, max(1, seq.indice or 1))
		return seq.indice
	end

	local function sorteio(a, b)
		return a + math.random() * (b - a)
	end

	local function par(v, padrao)
		if v == nil then return padrao, padrao end
		if type(v) == "table" then
			local a = v.x or v.min or v[1] or padrao
			local b = v.y or v.max or v[2] or a
			return a, b
		end
		return v, v
	end

	--- Os parâmetros de um carimbo: escala, espelho, ângulo, cor.
	local function parametros(o, seq, anguloTraco)
		local sx, sy = par(o.escala, 1)
		if o.escala_aleatoria then
			local a, b = par(o.escala_aleatoria, 1)
			local s = sorteio(min(a, b), max(a, b))
			local t = (o.travar_proporcao == false) and sorteio(min(a, b), max(a, b)) or s
			sx, sy = sx * s, sy * t
		end
		local j = o.jitter or {}
		if j.escala and j.escala > 0 then
			local s = 1 + sorteio(-j.escala, j.escala) / 100
			sx, sy = sx * s, sy * s
		end
		local fh, fv = o.espelhar_h == true, o.espelhar_v == true
		if o.espelho_aleatorio_h then fh = math.random(0, 1) == 1 end
		if o.espelho_aleatorio_v then fv = math.random(0, 1) == 1 end
		local ang = (o.angulo or 0) + (seq.rotacao or 0)
		if anguloTraco and o.girar_pelo_traco ~= false then ang = ang + anguloTraco + (o.angulo_base or 0) end
		if o.angulo_aleatorio then
			local a, b = par(o.angulo_aleatorio, 0)
			ang = ang + sorteio(min(a, b), max(a, b))
		end
		if j.angulo and j.angulo > 0 then ang = ang + sorteio(-j.angulo, j.angulo) end
		if o.passo_angulo and o.passo_angulo > 0 then ang = floor(ang / o.passo_angulo + 0.5) * o.passo_angulo end
		return { sx = sx, sy = sy, fh = fh, fv = fv, angulo = ang % 360 }
	end

	local function transformarItem(item, t, o)
		local saida = {}
		local w = max(1, floor(item.largura * t.sx + 0.5))
		local h = max(1, floor(item.altura * t.sy + 0.5))
		local tinta = o.cor and cor(o.cor)
		for i, p in ipairs(item.partes) do
			local img = p.img
			if w ~= img.width or h ~= img.height then img = escalar(img, w, h, 0) end
			img = espelhar(img, t.fh, t.fv, 0)
			img = girarCom(o, img, t.angulo, 0)
			if o.trocar_cores then img = trocarCores(img, o.trocar_cores) end
			if tinta then img = tingir(img, tinta) end
			saida[i] = { camada = p.camada, img = img, opacidade = p.opacidade, mistura = p.mistura }
		end
		return saida
	end

	-- Para testes (fora do E.chamar, que recusa nomes com "_").
	E._interno = { escalar = escalar, espelhar = espelhar, girar = girar, girarLimpo = girarLimpo, parametros = parametros,
		transformarItem = transformarItem }

	--- A camada de destino de uma parte: sem `camada`, a do alvo; com, a de mesmo nome (ou `mapa_camadas[nome]`),
	--- criada se faltar. `camadas_modo` = "casar" (padrão), "novas" (sempre camadas novas, uma por parte e por
	--- chamada) ou "uma" (tudo na camada do alvo).
	local function camadaDaParte(ctx, parte, o)
		local modo = o.camadas_modo or "casar"
		if modo ~= "casar" and modo ~= "novas" and modo ~= "uma" then
			falha("camadas_modo inválido: %s (casar, novas ou uma)", tostring(modo))
		end
		if not parte.camada or modo == "uma" then
			if not ctx.camada then
				ctx.camada = ctx.spr:newLayer()
				ctx.camada.name = "pincel"
			end
			return ctx.camada
		end
		local nome = (o.mapa_camadas and o.mapa_camadas[parte.camada]) or parte.camada
		ctx.criadas = ctx.criadas or {}
		if ctx.criadas[nome] then return ctx.criadas[nome] end
		if modo == "casar" then
			local l = U.acharCamada(ctx.spr.layers, nome)
			if l then
				ctx.criadas[nome] = l
				return l
			end
		end
		local l = ctx.spr:newLayer()
		l.name = nome
		if parte.opacidade then l.opacity = parte.opacidade end
		if parte.mistura then l.blendMode = parte.mistura end
		local ref = ctx.ultimaCriada
		if not ref and (o.acima_de or o.abaixo_de) then
			ref = U.acharCamada(ctx.spr.layers, o.acima_de or o.abaixo_de)
			if not ref then falha("a camada \"%s\" não existe", o.acima_de or o.abaixo_de) end
			if o.abaixo_de then
				ctx.abaixoDe = ref
				ref = nil
			end
		end
		if ctx.abaixoDe then
			l.parent = ctx.abaixoDe.parent
			l.stackIndex = ctx.abaixoDe.stackIndex
		elseif ref then
			l.parent = ref.parent
			l.stackIndex = ref.stackIndex + 1
			ctx.ultimaCriada = l
		end
		ctx.criadas[nome] = l
		return l
	end

	--- Amostra um caminho (lista de pontos) a cada `passo` px de comprimento; cada amostra tem a direção do traço
	--- em graus (0 = para a direita, 90 = para baixo). `suavizar` (px) tira a direção da corda entre s - suavizar e
	--- s + suavizar, para as curvas não darem trancos; `fechado` liga o último ponto ao primeiro.
	local function amostrarCaminho(pts, passo, suavizar, fechado)
		local p = {}
		for _, v in ipairs(pts) do
			if type(v) ~= "table" then falha("ponto inválido no caminho: %s", tostring(v)) end
			local x, y = v.x or v[1], v.y or v[2]
			if type(x) ~= "number" or type(y) ~= "number" then falha("ponto sem coordenadas no caminho") end
			p[#p + 1] = { x, y }
		end
		if #p == 0 then falha("`caminho` vazio") end
		if fechado and #p > 1 then p[#p + 1] = { p[1][1], p[1][2] } end
		local acum = { 0 }
		for i = 2, #p do
			acum[i] = acum[i - 1] + math.sqrt((p[i][1] - p[i - 1][1]) ^ 2 + (p[i][2] - p[i - 1][2]) ^ 2)
		end
		local total = acum[#p]
		if total <= 0 then return { { p[1][1], p[1][2], 0 } }, 0 end
		local function segmento(s)
			local i = 1
			while i < #p - 1 and acum[i + 1] < s do i = i + 1 end
			return i
		end
		local function posEm(s)
			if fechado then s = s % total else s = min(total, max(0, s)) end
			local i = segmento(s)
			local comp = acum[i + 1] - acum[i]
			local t = comp > 0 and (s - acum[i]) / comp or 0
			return p[i][1] + (p[i + 1][1] - p[i][1]) * t, p[i][2] + (p[i + 1][2] - p[i][2]) * t, i
		end
		local function anguloSeg(i)
			for k = i, #p - 1 do
				local dx, dy = p[k + 1][1] - p[k][1], p[k + 1][2] - p[k][2]
				if dx ~= 0 or dy ~= 0 then return math.deg(math.atan(dy, dx)) end
			end
			for k = i - 1, 1, -1 do
				local dx, dy = p[k + 1][1] - p[k][1], p[k + 1][2] - p[k][2]
				if dx ~= 0 or dy ~= 0 then return math.deg(math.atan(dy, dx)) end
			end
			return 0
		end
		local saida = {}
		local s = 0
		local limite = fechado and total - passo * 0.5 or total + 1e-6
		while s <= limite do
			local x, y, i = posEm(s)
			local ang
			if suavizar and suavizar > 0 then
				local x1, y1 = posEm(s - suavizar)
				local x2, y2 = posEm(s + suavizar)
				if abs(x2 - x1) + abs(y2 - y1) > 1e-6 then ang = math.deg(math.atan(y2 - y1, x2 - x1)) end
			end
			saida[#saida + 1] = { x, y, ang or anguloSeg(i) }
			s = s + passo
		end
		return saida, total
	end

	--- Os pontos de um carimbo: `caminho` (amostrado, com direção) ou `pontos` = { {x, y[, angulo]}, ... }.
	local function pontosDoCarimbo(o, item)
		if o.caminho then
			local menor = min(item.largura, item.altura)
			local passo = o.espacamento or max(1, floor(menor / 2))
			if passo <= 0 then falha("`espacamento` precisa ser maior que 0") end
			local suav = o.suavizar
			if suav == nil then suav = passo end
			local pts, comp = amostrarCaminho(o.caminho, passo, suav, o.fechado == true)
			return pts, comp, true
		end
		local lista = {}
		if o.pontos then
			for _, v in ipairs(o.pontos) do
				local x, y = ponto(v)
				lista[#lista + 1] = { x, y, v.angulo or v[3] }
			end
		elseif o.x or o.y then
			lista[1] = { floor(o.x or 0), floor(o.y or 0) }
		end
		if #lista == 0 then falha("diga onde: `caminho` = {{x,y}, ...} (traço) ou `pontos` = {{x,y}, ...} ou `x`/`y`") end
		return lista, nil, false
	end

	--- Carimba `itens` no alvo (ctx) nos pontos; `seq` guarda a sequência e o giro acumulado entre chamadas.
	local function carimbarItens(ctx, itens, o, seq)
		local pontos, comprimento = pontosDoCarimbo(o, itens[1])
		local j = o.jitter or {}
		local total, angulos = 0, {}
		local usados = {}
		local primeiro
		for _, p in ipairs(pontos) do
			local idx = proximoIndice(seq, #itens, o)
			local item = itens[idx]
			usados[idx] = true
			local t = parametros(o, seq, p[3])
			local partes = transformarItem(item, t, o)
			local px, py = p[1], p[2]
			if j.posicao and j.posicao > 0 then
				local raio = math.random() * j.posicao
				local ang = math.random() * math.pi * 2
				px, py = px + math.cos(ang) * raio, py + math.sin(ang) * raio
			end
			if j.lateral and j.lateral > 0 and p[3] then
				local r = math.rad(p[3])
				local d = sorteio(-j.lateral, j.lateral)
				px, py = px - math.sin(r) * d, py + math.cos(r) * d
			end
			local x, y = U.ancorar(partes[1].img, floor(px + 0.5), floor(py + 0.5), o.ancora or item.ancora or "centro")
			for _, parte in ipairs(partes) do
				local camada = camadaDaParte(ctx, parte, o)
				total = total + U.colar({ spr = ctx.spr, camada = camada, quadro = ctx.quadro }, parte.img, x, y, o)
			end
			if not primeiro then primeiro = partes end
			if #angulos < 64 then angulos[#angulos + 1] = floor(t.angulo + 0.5) % 360 end
			if o.rotacao_passo then seq.rotacao = ((seq.rotacao or 0) + o.rotacao_passo) % 360 end
		end
		local camadas = {}
		if ctx.camada then camadas[#camadas + 1] = ctx.camada.name end
		for nome in pairs(ctx.criadas or {}) do
			if not ctx.camada or nome ~= ctx.camada.name then camadas[#camadas + 1] = nome end
		end
		table.sort(camadas)
		local r = { carimbos = #pontos, pixels = total, angulos = angulos, camadas = camadas }
		if comprimento then r.comprimento = floor(comprimento * 10 + 0.5) / 10 end
		if o.imagem_png and primeiro then
			local w, h = primeiro[1].img.width, primeiro[1].img.height
			local img = Image(w, h, ColorMode.RGB)
			for _, pt in ipairs(primeiro) do img:drawImage(pt.img, Point(0, 0)) end
			r.imagem_png = gravarPNG(img, o.imagem_png)
		end
		local lista = {}
		for i in pairs(usados) do lista[#lista + 1] = i end
		table.sort(lista)
		r.pinceis_usados = lista
		return r
	end

	--- Vários traços de uma vez: `tracos` = { { pontos = {{x,y}, ...}, fechado? }, ... } (ou só a lista de pontos),
	--- cada um como um `caminho`, com a mesma sequência de pincéis (o traço seguinte continua de onde o anterior
	--- parou). Sem `tracos`, o carimbo de sempre. É o que a camada-guia e o contorno da seleção dão (caminho.*).
	local function carimbarTracos(ctx, itens, o, seq)
		if type(o.tracos) ~= "table" then return carimbarItens(ctx, itens, o, seq) end
		if #o.tracos == 0 then falha("`tracos` vazio (a camada-guia não tem nada desenhado?)") end
		local soma = { carimbos = 0, pixels = 0, angulos = {}, comprimento = 0, tracos = #o.tracos }
		local camadas, usados = {}, {}
		for _, t in ipairs(o.tracos) do
			local pontos = t.pontos or t.caminho or t
			local fechado = t.fechado
			if fechado == nil then fechado = o.fechado end
			local oi = {}
			for k, v in pairs(o) do oi[k] = v end
			oi.tracos, oi.pontos, oi.caminho, oi.fechado = nil, nil, pontos, fechado == true
			oi.imagem_png = soma.imagem_png == nil and o.imagem_png or nil
			local r = carimbarItens(ctx, itens, oi, seq)
			soma.carimbos = soma.carimbos + r.carimbos
			soma.pixels = soma.pixels + r.pixels
			soma.comprimento = soma.comprimento + (r.comprimento or 0)
			soma.imagem_png = soma.imagem_png or r.imagem_png
			for _, a in ipairs(r.angulos) do
				if #soma.angulos < 64 then soma.angulos[#soma.angulos + 1] = a end
			end
			for _, c in ipairs(r.camadas) do camadas[c] = true end
			for _, i in ipairs(r.pinceis_usados) do usados[i] = true end
		end
		soma.camadas, soma.pinceis_usados = {}, {}
		for c in pairs(camadas) do soma.camadas[#soma.camadas + 1] = c end
		for i in pairs(usados) do soma.pinceis_usados[#soma.pinceis_usados + 1] = i end
		table.sort(soma.camadas)
		table.sort(soma.pinceis_usados)
		return soma
	end

	--- Abre o alvo para carimbar: se algum pincel tem parte sem camada própria (ou `camada` foi dada), como as outras
	--- ações (camada criada se faltar); se todas as partes têm camada, sem criar camada nenhuma.
	local function abrirParaItens(o, itens, nomePadrao)
		local precisa = o.camada ~= nil or o.camadas_modo == "uma"
		for _, it in ipairs(itens) do
			for _, p in ipairs(it.partes) do
				if not p.camada then precisa = true end
			end
		end
		if precisa then return U.abrir(o, nomePadrao) end
		local spr, aberto = abrirSpriteDe(o)
		return { spr = spr, quadro = validarQuadro(spr, o.quadro or 1), aberto = aberto }
	end

	-- Opções do alvo, que não vão para as opções salvas de um conjunto ou do pincel ativo.
	local DO_ALVO = { arquivo = true, camada = true, quadro = true, saida = true, salvar = true, png = true, png_escala = true,
		pasta = true, pontos = true, caminho = true, tracos = true, x = true, y = true, fechar = true, imagem_png = true,
		pincel = true, pinceis = true, conjunto = true, origem = true, nome = true, abaixo_de = true, acima_de = true,
		grade = true, regioes = true, quadros = true, separar = true, manter = true, reiniciar = true, remover = true,
		substituir = true, opcoes = true, etiquetas = true, grupo = true, favorito = true, descricao = true }

	local function mesclar(base, por_cima)
		local t = {}
		for k, v in pairs(base or {}) do t[k] = v end
		for k, v in pairs(por_cima or {}) do t[k] = v end
		return t
	end

	-- -----------------------------------------------------------------------------------------------------------
	-- biblioteca.*: a biblioteca de pincéis (o que o Brush Manager PRO faz pela janela).

	local B = {}
	E.biblioteca = B

	local function resumoPincel(p, uso)
		local camadas = {}
		for _, parte in ipairs(p.partes or {}) do
			if parte.camada then camadas[#camadas + 1] = parte.camada end
		end
		uso = uso or {}
		return { id = p.id, nome = p.nome, favorito = p.favorito == true, etiquetas = p.etiquetas or {}, grupo = p.grupo,
			largura = p.largura, altura = p.altura, partes = #(p.partes or {}), camadas = camadas, ancora = p.ancora,
			descricao = p.descricao, usos = uso.usos or 0, usado = uso.usado }
	end

	local function temEtiqueta(p, e)
		for _, x in ipairs(p.etiquetas or {}) do
			if x:lower() == tostring(e):lower() then return true end
		end
		return false
	end

	--- Filtros comuns: texto (no nome, grupo, etiquetas, descrição), etiqueta, etiquetas (todas), grupo, favoritos.
	local function passaFiltro(p, o)
		if o.favoritos and not p.favorito then return false end
		if o.grupo and (p.grupo or "") ~= o.grupo then return false end
		if o.etiqueta and not temEtiqueta(p, o.etiqueta) then return false end
		if o.etiquetas then
			for _, e in ipairs(o.etiquetas) do
				if not temEtiqueta(p, e) then return false end
			end
		end
		if o.texto and o.texto ~= "" then
			local t = o.texto:lower()
			local alvo = (p.nome or "") .. " " .. (p.grupo or "") .. " " .. table.concat(p.etiquetas or {}, " ") .. " " .. (p.descricao or "")
			if not alvo:lower():find(t, 1, true) then return false end
		end
		return true
	end

	--- A pasta da biblioteca em uso (para conferir).
	function B.pasta(o)
		o = o or {}
		local pasta = pastaDe(o)
		return { pasta = pasta, existe = app.fs.isFile(app.fs.joinPath(pasta, "biblioteca.json")) }
	end

	--- Cria um pincel: `nome`, `origem` (ver recortar; `camadas`/`todas_camadas` = várias camadas), `etiquetas`,
	--- `grupo`, `favorito`, `ancora`, `descricao`; `substituir = true` troca um de mesmo nome.
	function B.criar(o)
		o = o or {}
		if not o.nome or o.nome == "" then falha("`nome` do pincel é obrigatório") end
		if not o.origem then falha("`origem` é obrigatória ({ arquivo, camada | camadas | todas_camadas, retangulo | fatia } ou { png })") end
		local pasta = pastaDe(o)
		local b = lerBiblioteca(pasta)
		local existente, pos = acharEm(b.pinceis, o.nome)
		if existente and existente.nome == o.nome then
			if not o.substituir then falha("já existe o pincel \"%s\" (passe `substituir = true`)", o.nome) end
		else
			existente = nil
		end
		local item = recortar(U.origemDo(o, o.origem))
		local id = existente and existente.id or idLivre(b.pinceis, slug(o.nome))
		if existente then apagarPartes(pasta, existente) end
		local entrada = {
			id = id, nome = o.nome, largura = item.largura, altura = item.altura,
			partes = gravarPartes(pasta, "imagens/" .. id, item),
			favorito = o.favorito == true or (existente and existente.favorito) or nil,
			etiquetas = o.etiquetas or (existente and existente.etiquetas) or {},
			grupo = o.grupo or (existente and existente.grupo),
			ancora = o.ancora or (existente and existente.ancora),
			descricao = o.descricao or (existente and existente.descricao),
			criado = (existente and existente.criado) or agora(),
		}
		if existente then b.pinceis[pos] = entrada else b.pinceis[#b.pinceis + 1] = entrada end
		gravarBiblioteca(pasta, b)
		local r = resumoPincel(entrada)
		r.pasta = pasta
		if o.imagem_png then r.imagem_png = gravarPNG(achatarItem(item), o.imagem_png) end
		return r
	end

	--- Traz pincéis de uma biblioteca do Brush Manager PRO (.aseprite com fatias): `biblioteca` = caminho (ou o
	--- nome, que pede o Brush Manager instalado para achar o arquivo), `pinceis` = { nomes } (padrão: todos),
	--- `camadas = true` (uma parte por camada da biblioteca, o "multi layer" dele), `grupo`, `etiquetas`, `prefixo`.
	function B.importar(o)
		o = o or {}
		if not o.biblioteca then falha("`biblioteca` (caminho do .aseprite com fatias) é obrigatório") end
		local caminho = o.biblioteca
		if not app.fs.isFile(caminho) then
			for _, x in ipairs(E.pincel.bibliotecas()) do
				if x.nome == o.biblioteca then caminho = x.caminho end
			end
			if not app.fs.isFile(caminho) then falha("biblioteca não encontrada: %s", tostring(o.biblioteca)) end
		end
		local spr, aberto = U.abrirSprite(caminho)
		local nomes = {}
		for _, s in ipairs(spr.slices) do
			local bb = s.bounds
			nomes[#nomes + 1] = (s.name and s.name ~= "") and s.name or ("Brush_" .. bb.width .. "x" .. bb.height)
		end
		local querer
		if o.pinceis then
			querer = {}
			for _, n in ipairs(o.pinceis) do querer[n] = true end
		end
		local criados, pulados = {}, {}
		local ok, erro = pcall(function()
			for _, nome in ipairs(nomes) do
				if not querer or querer[nome] then
					local origem = { arquivo = caminho, fatia = nome, aparar = true }
					if o.camadas then origem.todas_camadas = true end
					local okc, r = pcall(B.criar, { pasta = o.pasta, nome = (o.prefixo or "") .. nome, origem = origem,
						grupo = o.grupo, etiquetas = o.etiquetas, substituir = o.substituir, descricao = "de " .. app.fs.fileTitle(caminho) })
					if okc then criados[#criados + 1] = r.id else pulados[#pulados + 1] = { nome = nome, erro = tostring(r) } end
				end
			end
		end)
		if aberto then spr:close() end
		if not ok then error(erro, 0) end
		return { criados = criados, pulados = pulados, total = #criados }
	end

	--- Lista os pincéis: filtros (texto, etiqueta, etiquetas, grupo, favoritos), `ordenar` = "nome" (padrão),
	--- "recentes", "usos", "criado"; `limite`.
	function B.listar(o)
		o = o or {}
		local pasta = pastaDe(o)
		local b = lerBiblioteca(pasta)
		local estado = lerEstado(pasta)
		local lista = {}
		for _, p in ipairs(b.pinceis) do
			if passaFiltro(p, o) then lista[#lista + 1] = resumoPincel(p, estado.uso[p.id]) end
		end
		local ordem = o.ordenar or "nome"
		local comparar = {
			nome = function(a, c) return a.nome:lower() < c.nome:lower() end,
			recentes = function(a, c) return (a.usado or "") > (c.usado or "") end,
			usos = function(a, c) return a.usos > c.usos end,
			criado = function(a, c) return a.id < c.id end,
		}
		if not comparar[ordem] then falha("ordenar inválido: %s (nome, recentes, usos, criado)", tostring(ordem)) end
		table.sort(lista, function(a, c)
			if a.favorito ~= c.favorito and o.favoritos_primeiro then return a.favorito end
			return comparar[ordem](a, c)
		end)
		if o.limite and #lista > o.limite then
			for i = #lista, o.limite + 1, -1 do lista[i] = nil end
		end
		return { pinceis = lista, total = #lista, pasta = pasta }
	end

	--- Muda um pincel: `pincel` (id ou nome), `novo_nome`, `favorito`, `etiquetas` (troca), `mais_etiquetas`,
	--- `menos_etiquetas`, `grupo` ("" tira), `ancora`, `descricao`.
	function B.editar(o)
		o = o or {}
		local pasta = pastaDe(o)
		local b = lerBiblioteca(pasta)
		local p = exigirEm(b.pinceis, o.pincel, "pincel")
		if o.novo_nome and o.novo_nome ~= p.nome then
			local outro = acharEm(b.pinceis, o.novo_nome)
			if outro and outro ~= p and outro.nome == o.novo_nome then falha("já existe o pincel \"%s\"", o.novo_nome) end
			p.nome = o.novo_nome
		end
		if o.favorito ~= nil then p.favorito = o.favorito == true or nil end
		if o.etiquetas then p.etiquetas = o.etiquetas end
		p.etiquetas = p.etiquetas or {}
		for _, e in ipairs(o.mais_etiquetas or {}) do
			if not temEtiqueta(p, e) then p.etiquetas[#p.etiquetas + 1] = e end
		end
		if o.menos_etiquetas then
			local fica = {}
			for _, e in ipairs(p.etiquetas) do
				local sai = false
				for _, m in ipairs(o.menos_etiquetas) do
					if e:lower() == m:lower() then sai = true end
				end
				if not sai then fica[#fica + 1] = e end
			end
			p.etiquetas = fica
		end
		if o.grupo ~= nil then p.grupo = o.grupo ~= "" and o.grupo or nil end
		if o.ancora ~= nil then p.ancora = o.ancora ~= "" and o.ancora or nil end
		if o.descricao ~= nil then p.descricao = o.descricao ~= "" and o.descricao or nil end
		gravarBiblioteca(pasta, b)
		return resumoPincel(p)
	end

	--- Renomeia um (`pincel`, `nome`) ou vários: os que passam nos filtros (texto, etiqueta, grupo, favoritos),
	--- em ordem de nome, com `padrao` (string.format, ex. "grama_%02d"). O id e os arquivos ficam.
	function B.renomear(o)
		o = o or {}
		if o.pincel then
			if not o.nome then falha("diga o `nome` novo") end
			return B.editar{ pasta = o.pasta, pincel = o.pincel, novo_nome = o.nome }
		end
		if not o.padrao then falha("diga `pincel` + `nome`, ou um `padrao` (ex. \"grama_%%02d\") com filtros") end
		local pasta = pastaDe(o)
		local b = lerBiblioteca(pasta)
		local alvos = {}
		for _, p in ipairs(b.pinceis) do
			if passaFiltro(p, o) then alvos[#alvos + 1] = p end
		end
		table.sort(alvos, function(a, c) return a.nome:lower() < c.nome:lower() end)
		local novos, usados = {}, {}
		for i, p in ipairs(alvos) do
			local n = string.format(o.padrao, (o.inicio or 1) + i - 1)
			if usados[n] then falha("o padrão repete o nome \"%s\"", n) end
			usados[n] = true
			novos[i] = n
		end
		for _, p in ipairs(b.pinceis) do
			if usados[p.nome] then
				local dentro = false
				for _, a in ipairs(alvos) do
					if a == p then dentro = true end
				end
				if not dentro then falha("o nome \"%s\" já é de outro pincel", p.nome) end
			end
		end
		local mudancas = {}
		for i, p in ipairs(alvos) do
			mudancas[i] = { id = p.id, de = p.nome, para = novos[i] }
			p.nome = novos[i]
		end
		gravarBiblioteca(pasta, b)
		return { renomeados = mudancas, total = #mudancas }
	end

	--- Apaga um pincel (entrada e imagens). Recusa se um conjunto usa (`forcar = true` tira de lá também).
	function B.apagar(o)
		o = o or {}
		local pasta = pastaDe(o)
		local b = lerBiblioteca(pasta)
		local p, pos = exigirEm(b.pinceis, o.pincel, "pincel")
		local usam = {}
		for _, c in ipairs(b.conjuntos) do
			for _, it in ipairs(c.itens or {}) do
				if it.pincel == p.id then usam[#usam + 1] = c.nome end
			end
		end
		if #usam > 0 and not o.forcar then
			falha("o pincel \"%s\" está nos conjuntos %s (passe `forcar = true`)", p.nome, table.concat(usam, ", "))
		end
		for _, c in ipairs(b.conjuntos) do
			local fica = {}
			for _, it in ipairs(c.itens or {}) do
				if it.pincel ~= p.id then fica[#fica + 1] = it end
			end
			c.itens = fica
		end
		apagarPartes(pasta, p)
		table.remove(b.pinceis, pos)
		gravarBiblioteca(pasta, b)
		local estado = lerEstado(pasta)
		if estado.uso[p.id] then
			estado.uso[p.id] = nil
			gravarEstado(pasta, estado)
		end
		return { apagado = p.id, conjuntos = usam }
	end

	--- Os grupos e as etiquetas, com quantos pincéis cada.
	function B.grupos(o)
		o = o or {}
		local b = lerBiblioteca(pastaDe(o))
		local grupos, etiquetas, favoritos = {}, {}, 0
		for _, p in ipairs(b.pinceis) do
			local g = p.grupo or ""
			grupos[g] = (grupos[g] or 0) + 1
			for _, e in ipairs(p.etiquetas or {}) do etiquetas[e] = (etiquetas[e] or 0) + 1 end
			if p.favorito then favoritos = favoritos + 1 end
		end
		local function lista(t)
			local l = {}
			for k, n in pairs(t) do l[#l + 1] = { nome = k, total = n } end
			table.sort(l, function(a, c) return a.nome < c.nome end)
			return l
		end
		return { grupos = lista(grupos), etiquetas = lista(etiquetas), favoritos = favoritos, total = #b.pinceis }
	end

	--- Pincéis com os mesmos pixels (e as mesmas camadas).
	function B.duplicados(o)
		o = o or {}
		local pasta = pastaDe(o)
		local b = lerBiblioteca(pasta)
		local por = {}
		for _, p in ipairs(b.pinceis) do
			local ok, item = pcall(carregarPartes, pasta, p)
			if ok then
				local chave = { item.largura .. "x" .. item.altura }
				for _, parte in ipairs(item.partes) do chave[#chave + 1] = (parte.camada or "") .. ":" .. parte.img.bytes end
				local k = table.concat(chave, "|")
				por[k] = por[k] or {}
				table.insert(por[k], p.id)
			end
		end
		local grupos = {}
		for _, ids in pairs(por) do
			if #ids > 1 then
				table.sort(ids)
				grupos[#grupos + 1] = ids
			end
		end
		table.sort(grupos, function(a, c) return a[1] < c[1] end)
		return { duplicados = grupos, total = #grupos }
	end

	--- Prancha com os pincéis (filtrados) lado a lado, para ver a biblioteca: `png`, `colunas` (8), `espaco` (2),
	--- `escala` (1), `fundo` (cor; sem ela, transparente).
	function B.previa(o)
		o = o or {}
		if not o.png then falha("`png` é obrigatório") end
		local pasta = pastaDe(o)
		local b = lerBiblioteca(pasta)
		local itens = {}
		for _, p in ipairs(b.pinceis) do
			if passaFiltro(p, o) then itens[#itens + 1] = { entrada = p, img = achatarItem(carregarPartes(pasta, p)) } end
		end
		if #itens == 0 then falha("nenhum pincel passa nos filtros") end
		table.sort(itens, function(a, c) return a.entrada.nome:lower() < c.entrada.nome:lower() end)
		local colunas = max(1, floor(o.colunas or 8))
		local espaco = floor(o.espaco or 2)
		local cw, ch = 1, 1
		for _, it in ipairs(itens) do cw, ch = max(cw, it.img.width), max(ch, it.img.height) end
		local linhas = math.ceil(#itens / colunas)
		local usadas = min(colunas, #itens)
		local folha = Image(usadas * cw + (usadas + 1) * espaco, linhas * ch + (linhas + 1) * espaco, ColorMode.RGB)
		if o.fundo then folha:clear(pixelDe(cor(o.fundo))) end
		local posicoes = {}
		for i, it in ipairs(itens) do
			local c, l = (i - 1) % colunas, (i - 1) // colunas
			local x = espaco + c * (cw + espaco) + floor((cw - it.img.width) / 2)
			local y = espaco + l * (ch + espaco) + floor((ch - it.img.height) / 2)
			folha:drawImage(it.img, Point(x, y))
			posicoes[i] = { id = it.entrada.id, nome = it.entrada.nome, x = x, y = y }
		end
		local escala = floor(o.escala or 1)
		if escala > 1 then folha:resize(folha.width * escala, folha.height * escala) end
		gravarPNG(folha, o.png)
		return { png = o.png, pinceis = posicoes, total = #itens }
	end

	--- Carrega os pincéis de uma chamada: `pincel` (id ou nome), `pinceis` = { ... }, `conjunto` (nome) ou `origem`
	--- (cortada na hora, sem gravar). Devolve os itens, as opções salvas (do conjunto) e os ids da biblioteca.
	local function resolverItens(o, pasta, b)
		local itens, ids, opcoes = {}, {}, nil
		local function dePincel(ref)
			local p = exigirEm(b.pinceis, ref, "pincel")
			itens[#itens + 1] = carregarPartes(pasta, p)
			ids[#ids + 1] = p.id
		end
		if o.conjunto then
			local c = exigirEm(b.conjuntos, o.conjunto, "conjunto")
			opcoes = c.opcoes
			for i, it in ipairs(c.itens or {}) do
				if it.pincel then
					dePincel(it.pincel)
				else
					itens[#itens + 1] = carregarPartes(pasta, { nome = c.nome .. " #" .. i, largura = it.largura, altura = it.altura, partes = it.partes })
				end
			end
			if #itens == 0 then falha("o conjunto \"%s\" está vazio", c.nome) end
		elseif o.pinceis then
			for _, ref in ipairs(o.pinceis) do dePincel(ref) end
		elseif o.pincel then
			dePincel(o.pincel)
		elseif o.origem then
			itens[1] = recortar(U.origemDo(o, o.origem))
		else
			falha("diga o pincel: `pincel`, `pinceis`, `conjunto` ou `origem`")
		end
		return itens, opcoes, ids
	end

	local function marcarUso(pasta, ids)
		if #ids == 0 then return end
		local estado = lerEstado(pasta)
		local quando = agora()
		for _, id in ipairs(ids) do
			local u = estado.uso[id] or {}
			u.usos = (u.usos or 0) + 1
			u.usado = quando
			estado.uso[id] = u
		end
		gravarEstado(pasta, estado)
	end

	--- Carimba pincéis da biblioteca no alvo: `pincel` | `pinceis` | `conjunto` | `origem`; `pontos` (cada um pode
	--- ter o ângulo: {x, y, graus}) ou `caminho` (traço: amostrado a cada `espacamento` px, cada carimbo girado
	--- pela direção do traço). Opções do carimbo em docs/arte/EXTENSOES_ASEPRITE.md.
	function B.carimbar(o)
		o = o or {}
		semear(o)
		local pasta = pastaDe(o)
		local b = lerBiblioteca(pasta)
		local itens, salvas, ids = resolverItens(o, pasta, b)
		local opcoes = mesclar(salvas, o)
		local ctx = abrirParaItens(opcoes, itens, "pincel")
		local resultado
		app.transaction("Ferramentas: carimbar", function()
			resultado = carimbarTracos(ctx, itens, opcoes, { indice = 1 })
		end)
		marcarUso(pasta, ids)
		return U.finalizar(ctx, opcoes, resultado)
	end

	--- O traço: `caminho` = {{x,y}, ...} obrigatório; cada carimbo gira pela direção do trecho (`girar_pelo_traco`
	--- vale por padrão aqui), a cada `espacamento` px, com `jitter` = { posicao, lateral, angulo, escala } e `semente`.
	function B.traco(o)
		o = o or {}
		if not o.caminho and not o.tracos then falha("`caminho` = {{x,y}, {x,y}, ...} (ou `tracos`) é obrigatório") end
		if o.girar_pelo_traco == nil then o.girar_pelo_traco = true end
		return B.carimbar(o)
	end

	--- O pincel em PNG (as partes achatadas; `partes_png` = "C:/x/p_%s.png" grava cada parte com o nome da camada),
	--- depois das transformações do carimbo (escala, espelho, angulo, cor) se pedidas.
	function B.imagem(o)
		o = o or {}
		semear(o)
		local pasta = pastaDe(o)
		local b = lerBiblioteca(pasta)
		local itens = resolverItens(o, pasta, b)
		local item = itens[1]
		local partes = transformarItem(item, parametros(o, {}, nil), o)
		local w, h = partes[1].img.width, partes[1].img.height
		local img = Image(w, h, ColorMode.RGB)
		for _, p in ipairs(partes) do img:drawImage(p.img, Point(0, 0)) end
		local r = { largura = w, altura = h, partes = #partes }
		if o.png then
			local final = img
			local escala = floor(o.png_escala or 1)
			if escala > 1 then
				final = img:clone()
				final:resize(w * escala, h * escala)
			end
			r.png = gravarPNG(final, o.png)
		end
		if o.partes_png then
			r.partes_png = {}
			for i, p in ipairs(partes) do
				local caminho = string.format(o.partes_png, p.camada and slug(p.camada) or tostring(i))
				r.partes_png[i] = gravarPNG(p.img, caminho)
			end
		end
		return r
	end

	-- -----------------------------------------------------------------------------------------------------------
	-- conjunto.*: conjuntos salvos (o que o Live Brush guarda em brushsets.json pela janela).

	local C = {}
	E.conjunto = C

	--- Retângulos das ilhas de pixels (8 vizinhos) de uma imagem RGB, em coordenadas da `area`.
	local function ilhas(img, area, minimo)
		local w, h = img.width, img.height
		local visto = {}
		local rets = {}
		local function cheio(x, y) return pc.rgbaA(img:getPixel(x, y)) > 0 end
		for y = 0, h - 1 do
			for x = 0, w - 1 do
				local k = y * w + x
				if not visto[k] and cheio(x, y) then
					visto[k] = true
					local fila, i = { k }, 1
					local x0, y0, x1, y1, n = x, y, x, y, 0
					while i <= #fila do
						local kk = fila[i]
						i = i + 1
						n = n + 1
						local cx, cy = kk % w, kk // w
						x0, y0, x1, y1 = min(x0, cx), min(y0, cy), max(x1, cx), max(y1, cy)
						for dy = -1, 1 do
							for dx = -1, 1 do
								local nx, ny = cx + dx, cy + dy
								if nx >= 0 and ny >= 0 and nx < w and ny < h then
									local nk = ny * w + nx
									if not visto[nk] and cheio(nx, ny) then
										visto[nk] = true
										fila[#fila + 1] = nk
									end
								end
							end
						end
					end
					if n >= (minimo or 1) then
						rets[#rets + 1] = Rectangle(area.x + x0, area.y + y0, x1 - x0 + 1, y1 - y0 + 1)
					end
				end
			end
		end
		table.sort(rets, function(a, b)
			if a.y ~= b.y then return a.y < b.y end
			return a.x < b.x
		end)
		return rets
	end

	--- Corta vários itens da origem: `grade` = {largura, altura}, `regioes` = { {x,y,w,h}, ... }, `quadros` =
	--- { n, ... } (o mesmo retângulo em cada quadro) ou `separar = true` (cada ilha de pixels vira um pincel;
	--- `minimo` px). Células vazias ficam de fora.
	local function recortarVarios(o)
		local origem = U.origemDo(o, o.origem or {})
		local itens = {}
		local spr, aberto
		if not origem.png then spr, aberto = abrirSpriteDe(origem) end
		local ok, erro = pcall(function()
			local function corte(extra)
				local c = mesclar(origem, extra)
				local okc, item = pcall(recortar, c)
				if okc then
					itens[#itens + 1] = item
				elseif not tostring(item):find("vazi") and not tostring(item):find("nada desenhado") then
					error(item, 0)
				end
			end
			if o.quadros then
				for _, q in ipairs(o.quadros) do corte({ quadro = q }) end
			elseif o.grade or o.regioes or o.separar then
				local area
				if origem.retangulo then
					area = retangulo(origem.retangulo)
				elseif origem.png then
					local img = Image{ fromFile = origem.png }
					area = Rectangle(0, 0, img.width, img.height)
				else
					area = Rectangle(spr.bounds)
				end
				local rets = {}
				if o.grade then
					local gw, gh = par(o.grade, 16)
					gw, gh = floor(gw), floor(gh)
					for y = area.y, area.y + area.height - gh, gh do
						for x = area.x, area.x + area.width - gw, gw do rets[#rets + 1] = Rectangle(x, y, gw, gh) end
					end
				elseif o.regioes then
					for _, r in ipairs(o.regioes) do rets[#rets + 1] = retangulo(r) end
				else
					local tudo = recortar(mesclar(origem, { retangulo = tabelaRet(area), aparar = false }))
					rets = ilhas(achatarItem(tudo), area, o.minimo)
				end
				for _, r in ipairs(rets) do
					if origem.png then
						local img = U.emRGB(Image{ fromFile = origem.png })
						local pedaco = Image(img, r)
						if not pedaco:isEmpty() then
							local bb = o.aparar and limitesRGB(pedaco)
							if bb then pedaco = Image(pedaco, bb) end
							itens[#itens + 1] = { largura = pedaco.width, altura = pedaco.height, partes = { { img = pedaco } } }
						end
					else
						corte({ retangulo = tabelaRet(r), fatia = false, aparar = o.aparar == true })
					end
				end
			else
				corte({})
			end
		end)
		if aberto then spr:close() end
		if not ok then error(erro, 0) end
		return itens
	end

	local function resumoConjunto(c)
		local refs, proprios = 0, 0
		for _, it in ipairs(c.itens or {}) do
			if it.pincel then refs = refs + 1 else proprios = proprios + 1 end
		end
		return { id = c.id, nome = c.nome, itens = #(c.itens or {}), da_biblioteca = refs, proprios = proprios,
			opcoes = c.opcoes or {}, descricao = c.descricao }
	end

	--- Grava um conjunto nomeado: `nome`; os pincéis vêm de `pinceis` = { ids/nomes da biblioteca } ou de `origem`
	--- cortada por `grade` | `regioes` | `quadros` | `separar` (imagens próprias do conjunto); `opcoes` = as opções
	--- de carimbo que o conjunto leva (sequencia, repeticao, escala_aleatoria, angulo_aleatorio, espelho_aleatorio_h,
	--- jitter...); `substituir = true` troca um de mesmo nome.
	function C.gravar(o)
		o = o or {}
		if not o.nome or o.nome == "" then falha("`nome` do conjunto é obrigatório") end
		local pasta = pastaDe(o)
		local b = lerBiblioteca(pasta)
		local existente, pos = acharEm(b.conjuntos, o.nome)
		if existente and existente.nome == o.nome then
			if not o.substituir then falha("já existe o conjunto \"%s\" (passe `substituir = true`)", o.nome) end
		else
			existente = nil
		end
		local id = existente and existente.id or idLivre(b.conjuntos, slug(o.nome))
		local itens = {}
		if o.pinceis then
			for _, ref in ipairs(o.pinceis) do
				local p = exigirEm(b.pinceis, ref, "pincel")
				itens[#itens + 1] = { pincel = p.id }
			end
		elseif o.origem then
			local cortados = recortarVarios(o)
			if #cortados == 0 then falha("o corte não deu nenhum pincel (a origem está vazia nas regiões?)") end
			if existente then
				for _, it in ipairs(existente.itens or {}) do
					if not it.pincel then apagarPartes(pasta, it) end
				end
			end
			for i, item in ipairs(cortados) do
				itens[i] = { largura = item.largura, altura = item.altura,
					partes = gravarPartes(pasta, "imagens/conjuntos/" .. id .. "/" .. i, item) }
			end
		else
			falha("diga de onde: `pinceis` = { ... } ou `origem` com `grade` | `regioes` | `quadros` | `separar`")
		end
		local entrada = { id = id, nome = o.nome, itens = itens, opcoes = objeto(o.opcoes or (existente and existente.opcoes)),
			descricao = o.descricao or (existente and existente.descricao) }
		if existente then b.conjuntos[pos] = entrada else b.conjuntos[#b.conjuntos + 1] = entrada end
		gravarBiblioteca(pasta, b)
		local r = resumoConjunto(entrada)
		r.pasta = pasta
		return r
	end

	function C.listar(o)
		o = o or {}
		local b = lerBiblioteca(pastaDe(o))
		local lista = {}
		for _, c in ipairs(b.conjuntos) do lista[#lista + 1] = resumoConjunto(c) end
		table.sort(lista, function(a, c) return a.nome:lower() < c.nome:lower() end)
		return { conjuntos = lista, total = #lista }
	end

	--- Um conjunto: as opções e os itens; `imagens_png` = "C:/x/c_%d.png" grava cada item achatado.
	function C.ler(o)
		o = o or {}
		local pasta = pastaDe(o)
		local b = lerBiblioteca(pasta)
		local c = exigirEm(b.conjuntos, o.conjunto or o.nome, "conjunto")
		local r = resumoConjunto(c)
		local itens = resolverItens({ conjunto = c.id }, pasta, b)
		r.lista = {}
		for i, item in ipairs(itens) do
			local x = { largura = item.largura, altura = item.altura, pincel = c.itens[i] and c.itens[i].pincel, partes = #item.partes }
			if o.imagens_png then x.png = gravarPNG(achatarItem(item), string.format(o.imagens_png, i)) end
			r.lista[i] = x
		end
		return r
	end

	function C.apagar(o)
		o = o or {}
		local pasta = pastaDe(o)
		local b = lerBiblioteca(pasta)
		local c, pos = exigirEm(b.conjuntos, o.conjunto or o.nome, "conjunto")
		for _, it in ipairs(c.itens or {}) do
			if not it.pincel then apagarPartes(pasta, it) end
		end
		apagarPastaVazia(app.fs.joinPath(pasta, "imagens", "conjuntos", c.id))
		table.remove(b.conjuntos, pos)
		gravarBiblioteca(pasta, b)
		return { apagado = c.id }
	end

	--- Muda um conjunto sem recortar de novo: `conjunto`, `opcoes` (troca todas), `mais_opcoes` (mescla),
	--- `menos_opcoes` = { chaves }, `novo_nome`, `descricao`.
	function C.editar(o)
		o = o or {}
		local pasta = pastaDe(o)
		local b = lerBiblioteca(pasta)
		local c = exigirEm(b.conjuntos, o.conjunto or o.nome, "conjunto")
		if o.novo_nome and o.novo_nome ~= c.nome then
			local outro = acharEm(b.conjuntos, o.novo_nome)
			if outro and outro ~= c and outro.nome == o.novo_nome then falha("já existe o conjunto \"%s\"", o.novo_nome) end
			c.nome = o.novo_nome
		end
		if o.opcoes then c.opcoes = objeto(mesclar({}, o.opcoes)) end
		if o.mais_opcoes then c.opcoes = objeto(mesclar(c.opcoes, o.mais_opcoes)) end
		for _, k in ipairs(o.menos_opcoes or {}) do c.opcoes[k] = nil end
		if o.descricao ~= nil then c.descricao = o.descricao ~= "" and o.descricao or nil end
		gravarBiblioteca(pasta, b)
		return resumoConjunto(c)
	end

	--- Carimba um conjunto (as opções salvas nele valem; as da chamada passam por cima).
	function C.carimbar(o)
		o = o or {}
		if not o.conjunto then falha("`conjunto` (nome) é obrigatório") end
		return B.carimbar(o)
	end

	-- -----------------------------------------------------------------------------------------------------------
	-- ativo.*: o "pincel ativo" num arquivo (estado.json da pasta), para encadear chamadas: a sequência do conjunto,
	-- o giro acumulado e o sorteio continuam de uma chamada para a outra, como continuariam no pincel do Aseprite.

	local A = {}
	E.ativo = A

	local function opcoesDoCarimbo(o)
		local t = {}
		for k, v in pairs(o) do
			if not DO_ALVO[k] then t[k] = v end
		end
		return objeto(t)
	end

	--- Define o pincel ativo: `pincel` | `pinceis` | `conjunto` | `origem` (cortada agora e guardada em ativo/),
	--- mais as opções de carimbo que ficam valendo.
	function A.definir(o)
		o = o or {}
		local pasta = pastaDe(o)
		local b = lerBiblioteca(pasta)
		local fonte
		if o.conjunto then
			fonte = { conjunto = exigirEm(b.conjuntos, o.conjunto, "conjunto").id }
		elseif o.pinceis then
			local ids = {}
			for _, ref in ipairs(o.pinceis) do ids[#ids + 1] = exigirEm(b.pinceis, ref, "pincel").id end
			fonte = { pinceis = ids }
		elseif o.pincel then
			fonte = { pincel = exigirEm(b.pinceis, o.pincel, "pincel").id }
		elseif o.origem then
			local item = recortar(U.origemDo(o, o.origem))
			local antigo = lerEstado(pasta).ativo
			if antigo and antigo.fonte and antigo.fonte.item then apagarPartes(pasta, antigo.fonte.item) end
			local marca = tostring(os.time and os.time() or 0)
			fonte = { item = { nome = "ativo", largura = item.largura, altura = item.altura,
				partes = gravarPartes(pasta, "ativo/" .. marca, item) } }
		else
			falha("diga o pincel ativo: `pincel`, `pinceis`, `conjunto` ou `origem`")
		end
		local estado = lerEstado(pasta)
		estado.ativo = { fonte = fonte, opcoes = opcoesDoCarimbo(o), seq = { indice = 1, direcao = 1, usos = 0, rotacao = 0 },
			chamadas = 0, definido = agora() }
		gravarEstado(pasta, estado)
		return estado.ativo
	end

	function A.ler(o)
		o = o or {}
		local estado = lerEstado(pastaDe(o))
		if not estado.ativo then return { ativo = false } end
		return estado.ativo
	end

	--- Muda as opções do pincel ativo (mescla; `remover` = { chaves } tira), `reiniciar = true` volta a sequência
	--- e o giro ao começo.
	function A.ajustar(o)
		o = o or {}
		local pasta = pastaDe(o)
		local estado = lerEstado(pasta)
		if not estado.ativo then falha("não há pincel ativo (ativo.definir)") end
		local at = estado.ativo
		at.opcoes = objeto(mesclar(at.opcoes, opcoesDoCarimbo(o)))
		for _, k in ipairs(o.remover or {}) do at.opcoes[k] = nil end
		if o.reiniciar then at.seq = { indice = 1, direcao = 1, usos = 0, rotacao = 0 } end
		gravarEstado(pasta, estado)
		return at
	end

	--- Carimba com o pincel ativo (`pontos` ou `caminho`, e o alvo); as opções da chamada passam por cima das
	--- salvas só nesta chamada. A sequência e o giro avançam e ficam gravados.
	function A.carimbar(o)
		o = o or {}
		local pasta = pastaDe(o)
		local estado = lerEstado(pasta)
		local at = estado.ativo
		if not at then falha("não há pincel ativo (ativo.definir)") end
		local b = lerBiblioteca(pasta)
		local itens, salvas, ids
		if at.fonte.item then
			itens, salvas, ids = { carregarPartes(pasta, at.fonte.item) }, nil, {}
		else
			itens, salvas, ids = resolverItens(at.fonte, pasta, b)
		end
		local opcoes = mesclar(mesclar(salvas, at.opcoes), o)
		if opcoes.semente ~= nil then math.randomseed(floor(opcoes.semente) + (at.chamadas or 0)) end
		if (opcoes.caminho or opcoes.tracos) and opcoes.girar_pelo_traco == nil then opcoes.girar_pelo_traco = true end
		local ctx = abrirParaItens(opcoes, itens, "pincel")
		local seq = at.seq or { indice = 1 }
		local resultado
		app.transaction("Ferramentas: pincel ativo", function()
			resultado = carimbarTracos(ctx, itens, opcoes, seq)
		end)
		at.seq = seq
		at.chamadas = (at.chamadas or 0) + 1
		gravarEstado(pasta, estado)
		marcarUso(pasta, ids)
		resultado.indice = seq.indice
		return U.finalizar(ctx, opcoes, resultado)
	end

	function A.limpar(o)
		o = o or {}
		local pasta = pastaDe(o)
		local estado = lerEstado(pasta)
		if estado.ativo and estado.ativo.fonte and estado.ativo.fonte.item then apagarPartes(pasta, estado.ativo.fonte.item) end
		estado.ativo = nil
		gravarEstado(pasta, estado)
		return { ativo = false }
	end

	--- O próximo pincel do ativo, sem carimbar: avança a sequência (e o giro, o sorteio) como um carimbo avançaria e
	--- devolve a imagem achatada e transformada. É o "trocar de pincel a cada traço" do Live Brush, para pintar com
	--- o lápis do Aseprite: a extensão Diorama põe a imagem como pincel do Aseprite (app.brush).
	local function proximoAtivo(o)
		o = o or {}
		local pasta = pastaDe(o)
		local estado = lerEstado(pasta)
		local at = estado.ativo
		if not at then falha("não há pincel ativo (ativo.definir)") end
		local itens, salvas, ids
		if at.fonte.item then
			itens, salvas, ids = { carregarPartes(pasta, at.fonte.item) }, nil, {}
		else
			itens, salvas, ids = resolverItens(at.fonte, pasta, lerBiblioteca(pasta))
		end
		local opcoes = mesclar(mesclar(salvas, at.opcoes), o)
		if opcoes.semente ~= nil then math.randomseed(floor(opcoes.semente) + (at.chamadas or 0)) end
		local seq = at.seq or { indice = 1 }
		local idx = proximoIndice(seq, #itens, opcoes)
		local t = parametros(opcoes, seq, nil)
		local partes = transformarItem(itens[idx], t, opcoes)
		local img = Image(partes[1].img.width, partes[1].img.height, ColorMode.RGB)
		for _, p in ipairs(partes) do img:drawImage(p.img, Point(0, 0)) end
		if opcoes.rotacao_passo then seq.rotacao = ((seq.rotacao or 0) + opcoes.rotacao_passo) % 360 end
		at.seq = seq
		at.chamadas = (at.chamadas or 0) + 1
		gravarEstado(pasta, estado)
		if ids[idx] then marcarUso(pasta, { ids[idx] }) elseif #ids == 1 then marcarUso(pasta, ids) end
		local info = { indice = idx, total = #itens, largura = img.width, altura = img.height, angulo = floor(t.angulo + 0.5) % 360,
			ancora = opcoes.ancora or itens[idx].ancora or "centro", fonte = at.fonte.conjunto or at.fonte.pincel or (at.fonte.pinceis and "pinceis") or "origem" }
		return img, info
	end

	--- O próximo pincel do ativo (ver proximoAtivo); `png` (e `png_escala`) grava a imagem.
	function A.proximo(o)
		o = o or {}
		local img, info = proximoAtivo(o)
		if o.png then
			info.png = gravarPNG(ampliarImg(img, o.png_escala), o.png)
		end
		return info
	end

	-- Para a janela (extensão Diorama): imagens, sem passar por PNG.
	E._interno.proximoAtivo = proximoAtivo

	--- A imagem achatada de um pincel (`pincel`) ou dos itens de um conjunto (`conjunto`): { imagens, itens }.
	function E._interno.imagens(o)
		local pasta = pastaDe(o)
		local itens = resolverItens(o, pasta, lerBiblioteca(pasta))
		local imagens = {}
		for i, item in ipairs(itens) do imagens[i] = achatarItem(item) end
		return imagens, itens
	end

	-- -----------------------------------------------------------------------------------------------------------
	-- caminho.*: o traço para o `biblioteca.traco` sem digitar pontos (2026-10-22, para a janela da extensão
	-- Diorama): uma camada-guia com uma linha de 1 px desenhada pelo usuário (o lápis, em qualquer cor), ou o contorno
	-- da seleção. Devolvem `tracos` = { { pontos = {{x, y}, ...}, fechado }, ... }, que o carimbo aceita como está.

	local Cm = {}
	E.caminho = Cm

	-- Ortogonais primeiro: nas escadas o caminho passa pelo canto em vez de cortar na diagonal.
	local VIZINHOS = { { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 }, { 1, 1 }, { -1, 1 }, { 1, -1 }, { -1, -1 } }

	local function chavePx(x, y) return (y + 32768) * 65536 + (x + 32768) end

	local function inverterLista(t)
		local n = #t
		for i = 1, n // 2 do t[i], t[n - i + 1] = t[n - i + 1], t[i] end
		return t
	end

	--- Ordena pixels ({ {x, y}, ... }) em traços, um por pedaço ligado (8 vizinhos). Linha aberta: o caminho mais
	--- longo entre as duas pontas (BFS duas vezes), que atravessa as escadas e os cantos grossos sem voltar; vai da
	--- esquerda para a direita (ou de cima para baixo, se é mais alta que larga). Linha fechada (muito pixel longe
	--- desse caminho): uma volta inteira de vizinho em vizinho, cada passo para o vizinho com menos saídas, no
	--- sentido do relógio. Pedaços com menos de `minimo` pixels ficam de fora.
	local function ordenarTracos(lista, minimo)
		local em = {}
		for _, p in ipairs(lista) do em[chavePx(p[1], p[2])] = p end
		local function vizinhos(p, filtro)
			local r = {}
			for _, d in ipairs(VIZINHOS) do
				local q = em[chavePx(p[1] + d[1], p[2] + d[2])]
				if q and (not filtro or filtro(q)) then r[#r + 1] = q end
			end
			return r
		end
		local function maisLonge(origem)
			local dist, pai = { [origem] = 0 }, {}
			local fila, i, longe = { origem }, 1, origem
			while i <= #fila do
				local p = fila[i]
				i = i + 1
				if dist[p] > dist[longe] then longe = p end
				for _, q in ipairs(vizinhos(p)) do
					if dist[q] == nil then
						dist[q], pai[q] = dist[p] + 1, p
						fila[#fila + 1] = q
					end
				end
			end
			return longe, pai
		end
		table.sort(lista, function(a, b)
			if a[2] ~= b[2] then return a[2] < b[2] end
			return a[1] < b[1]
		end)
		local visto, tracos = {}, {}
		for _, inicio in ipairs(lista) do
			if not visto[inicio] then
				local comp = { inicio }
				visto[inicio] = true
				local i = 1
				while i <= #comp do
					for _, q in ipairs(vizinhos(comp[i])) do
						if not visto[q] then
							visto[q] = true
							comp[#comp + 1] = q
						end
					end
					i = i + 1
				end
				if #comp >= (minimo or 1) then
					local a = maisLonge(comp[1])
					local b, pai = maisLonge(a)
					local caminho = {}
					local p = b
					while p do
						caminho[#caminho + 1] = p
						p = pai[p]
					end
					local perto = {}
					for _, q in ipairs(caminho) do
						perto[q] = true
						for _, r in ipairs(vizinhos(q)) do perto[r] = true end
					end
					local longe = 0
					for _, q in ipairs(comp) do
						if not perto[q] then longe = longe + 1 end
					end
					local fechado = false
					if longe > max(2, #comp * 0.2) then
						local usado = { [inicio] = true }
						caminho = { inicio }
						local atual = inicio
						while true do
							local livres = vizinhos(atual, function(q) return not usado[q] end)
							if #livres == 0 then break end
							local melhor, menos = nil, math.huge
							for _, q in ipairs(livres) do
								local n = #vizinhos(q, function(r) return not usado[r] end)
								if n < menos then melhor, menos = q, n end
							end
							usado[melhor] = true
							caminho[#caminho + 1] = melhor
							atual = melhor
						end
						local u = caminho[#caminho]
						fechado = #caminho > 2 and abs(u[1] - inicio[1]) <= 1 and abs(u[2] - inicio[2]) <= 1
						local area = 0
						for k = 1, #caminho do
							local p1, p2 = caminho[k], caminho[k % #caminho + 1]
							area = area + p1[1] * p2[2] - p2[1] * p1[2]
						end
						if area < 0 then inverterLista(caminho) end
					else
						local p1, pn = caminho[1], caminho[#caminho]
						local dx, dy = pn[1] - p1[1], pn[2] - p1[2]
						if (abs(dx) >= abs(dy) and dx < 0) or (abs(dy) > abs(dx) and dy < 0) then inverterLista(caminho) end
					end
					local pontos = {}
					for k, q in ipairs(caminho) do pontos[k] = { q[1], q[2] } end
					tracos[#tracos + 1] = { pontos = pontos, fechado = fechado, pixels = #comp }
				end
			end
		end
		return tracos
	end

	local function terminarTracos(tracos, o)
		if o.inverter then
			for _, t in ipairs(tracos) do inverterLista(t.pontos) end
		end
		return tracos
	end

	--- Os traços desenhados numa camada-guia: `camada` (padrão: a ativa), `quadro`, `minimo` (px por traço, 1),
	--- `inverter` (o sentido de todos). Cada pedaço ligado é um traço; desenhe com o lápis, 1 px de largura.
	function Cm.da_camada(o)
		o = o or {}
		local spr, aberto = abrirSpriteDe(o)
		local r
		local ok, erro = pcall(function()
			local camada = o.camada and U.acharCamada(spr.layers, o.camada) or app.activeLayer
			if not camada then falha("a camada-guia \"%s\" não existe", tostring(o.camada)) end
			if not camada.isImage or camada.isTilemap then falha("a camada-guia precisa ser uma camada de imagem") end
			local cel = camada:cel(validarQuadro(spr, o.quadro or 1))
			local lista = {}
			if cel then
				local pos = cel.position
				for it in cel.image:pixels() do
					if opaco(it(), spr.colorMode, spr.transparentColor) then lista[#lista + 1] = { it.x + pos.x, it.y + pos.y } end
				end
			end
			if #lista == 0 then falha("a camada-guia \"%s\" está vazia neste quadro: desenhe o traço com o lápis", camada.name) end
			if #lista > 50000 then falha("a camada-guia tem %d pixels: desenhe só a linha do traço (1 px)", #lista) end
			r = { tracos = terminarTracos(ordenarTracos(lista, o.minimo), o), camada = camada.name }
		end)
		if aberto then spr:close() end
		if not ok then error(erro, 0) end
		r.total = #r.tracos
		return r
	end

	--- O contorno da seleção do sprite ativo como traço fechado (a borda de dentro: os pixels selecionados que
	--- encostam num de fora). Seleção com buracos ou partes soltas dá um traço por borda. `inverter`, `minimo`.
	function Cm.da_selecao(o)
		o = o or {}
		local spr = abrirSpriteDe(o)
		local sel = spr.selection
		if sel.isEmpty then falha("o sprite não tem seleção") end
		local b = sel.bounds
		local lista = {}
		for y = b.y, b.y + b.height - 1 do
			for x = b.x, b.x + b.width - 1 do
				if sel:contains(x, y) and not (sel:contains(x + 1, y) and sel:contains(x - 1, y) and sel:contains(x, y + 1)
					and sel:contains(x, y - 1)) then
					lista[#lista + 1] = { x, y }
				end
			end
		end
		local tracos = terminarTracos(ordenarTracos(lista, o.minimo), o)
		return { tracos = tracos, total = #tracos }
	end

	E._interno.ordenarTracos = ordenarTracos

	-- -----------------------------------------------------------------------------------------------------------
	-- copia.*: duplicar e deslocar, duplicar e girar, redimensionar a cópia (o que o Carbs Toolbar faz colando uma
	-- seleção flutuante e movendo pelo editor). Aqui a cópia é feita nas imagens das células: `retangulo`, `fatia`
	-- ou `selecao`; `camada` | `camadas` (lista, "todas", "visiveis"); `quadro` | `quadros` (lista, "todos").

	local Cp = {}
	E.copia = Cp

	local function abrirVarios(o)
		local spr, aberto = abrirSpriteDe(o)
		local camadas = listaCamadas(spr, o)
		local quadros = listaQuadros(spr, o)
		return { spr = spr, aberto = aberto, camada = camadas[1], quadro = quadros[1] }, camadas, quadros
	end

	local function camadaDestino(ctx, origem, o)
		if not o.camada_destino then return origem end
		local l = U.acharCamada(ctx.spr.layers, o.camada_destino)
		if not l then
			l = ctx.spr:newLayer()
			l.name = o.camada_destino
		end
		return l
	end

	local function apagarArea(ctx, camada, quadro, area, dentro)
		local spr = ctx.spr
		local marca = marcaDoSprite(spr)
		local img = nova(spr.colorMode, area.width, area.height, vazioDoSprite(spr))
		for y = 0, area.height - 1 do
			for x = 0, area.width - 1 do
				if not dentro or dentro(area.x + x, area.y + y) then img:drawPixel(x, y, marca) end
			end
		end
		return U.colar({ spr = spr, camada = camada, quadro = quadro }, img, area.x, area.y, { modo = "apagar" })
	end

	local DIRECOES = {
		cima = { 0, -1 }, baixo = { 0, 1 }, esquerda = { -1, 0 }, direita = { 1, 0 },
		cima_esquerda = { -1, -1 }, cima_direita = { 1, -1 }, baixo_esquerda = { -1, 1 }, baixo_direita = { 1, 1 },
	}

	--- O passo de uma cópia: `dx`/`dy` em px, ou `direcao` (cima, baixo, esquerda, direita e as quatro diagonais,
	--- ex. "baixo_direita") com `deslocamento` = { x%, y% } do tamanho da área (100: encostada, como o Carbs) e
	--- `espaco` px a mais.
	local function passoDe(area, o)
		if o.dx or o.dy then return floor(o.dx or 0), floor(o.dy or 0) end
		local d = DIRECOES[o.direcao or ""]
		if not d then
			local nomes = {}
			for k in pairs(DIRECOES) do nomes[#nomes + 1] = k end
			table.sort(nomes)
			falha("diga `dx`/`dy` ou `direcao` (%s)", table.concat(nomes, ", "))
		end
		local px, py = par(o.deslocamento, 100)
		local espaco = floor(o.espaco or 0)
		return d[1] * (floor(area.width * px / 100 + 0.5) + espaco), d[2] * (floor(area.height * py / 100 + 0.5) + espaco)
	end

	--- Duplica a área e desloca: `vezes` cópias em fila (cada uma um passo adiante), ou `preencher = true` (a área
	--- repetida no sprite inteiro, como o "Fill" do Carbs). `mover = true` apaga o original; `modo` (compor,
	--- substituir); `camada_destino` põe as cópias noutra camada (criada se faltar).
	function Cp.deslocar(o)
		o = o or {}
		local ctx, camadas, quadros = abrirVarios(o)
		local spr = ctx.spr
		local area, dentro = areaDe(spr, o, true)
		local dx, dy = 0, 0
		if not o.preencher then dx, dy = passoDe(area, o) end
		local vezes = max(1, floor(o.vezes or 1))
		local total, copias = 0, 0
		app.transaction("Ferramentas: copia.deslocar", function()
			for _, camada in ipairs(camadas) do
				for _, q in ipairs(quadros) do
					local pedaco = recorteCru(spr, camada:cel(q), area, dentro)
					if temConteudo(pedaco, spr) then
						local destino = camadaDestino(ctx, camada, o)
						if o.mover then apagarArea(ctx, camada, q, area, dentro) end
						local alvo = { spr = spr, camada = destino, quadro = q }
						if o.preencher then
							local x0 = area.x - math.ceil(area.x / area.width) * area.width
							local y0 = area.y - math.ceil(area.y / area.height) * area.height
							for y = y0, spr.height - 1, area.height do
								for x = x0, spr.width - 1, area.width do
									if x ~= area.x or y ~= area.y or destino ~= camada then
										total = total + U.colar(alvo, pedaco, x, y, { modo = o.modo })
										copias = copias + 1
									end
								end
							end
						else
							for k = 1, vezes do
								total = total + U.colar(alvo, pedaco, area.x + dx * k, area.y + dy * k, { modo = o.modo })
								copias = copias + 1
							end
						end
					end
				end
			end
		end)
		return U.finalizar(ctx, o, { copias = copias, pixels = total, passo = { x = dx, y = dy }, retangulo = tabelaRet(area) })
	end

	--- Lugar da cópia transformada (w x h): centrada na área original, mais `dx`/`dy` (cada cópia k anda k passos),
	--- ou ao lado (`ao_lado` = direita, esquerda, baixo, cima, com `espaco`), ou no canto `x`/`y`.
	local function lugarDaCopia(area, w, h, o, k)
		local x = area.x + floor((area.width - w) / 2)
		local y = area.y + floor((area.height - h) / 2)
		if o.x or o.y then
			x, y = floor(o.x or area.x), floor(o.y or area.y)
		elseif o.ao_lado then
			local espaco = floor(o.espaco or 0)
			local lado = o.ao_lado
			if lado == "direita" then
				x = area.x + area.width + espaco + (k - 1) * (w + espaco)
			elseif lado == "esquerda" then
				x = area.x - espaco - w - (k - 1) * (w + espaco)
			elseif lado == "baixo" then
				y = area.y + area.height + espaco + (k - 1) * (h + espaco)
			elseif lado == "cima" then
				y = area.y - espaco - h - (k - 1) * (h + espaco)
			else
				falha("ao_lado inválido: %s (direita, esquerda, baixo, cima)", tostring(lado))
			end
			if lado == "direita" or lado == "esquerda" then y = area.y end
			if lado == "baixo" or lado == "cima" then x = area.x end
			return x, y
		end
		return x + floor(o.dx or 0) * k, y + floor(o.dy or 0) * k
	end

	--- Duplica e gira: `angulo` (graus, sentido do relógio; 90/180/270 exatos, os outros por vizinho mais próximo)
	--- ou `sentido` = "horario" | "anti_horario" (90). `vezes` cópias, a k-ésima girada k vezes; onde, como em
	--- lugarDaCopia (padrão: por cima do original, centrada, como o Carbs cola). `no_lugar = true` gira o próprio
	--- (apaga o original antes). `espelhar_h`/`espelhar_v` antes de girar.
	function Cp.girar(o)
		o = o or {}
		local ctx, camadas, quadros = abrirVarios(o)
		local spr = ctx.spr
		local area, dentro = areaDe(spr, o, true)
		local angulo = o.angulo
		if angulo == nil then
			if o.sentido == "horario" then
				angulo = 90
			elseif o.sentido == "anti_horario" then
				angulo = -90
			else
				falha("diga `angulo` (graus) ou `sentido` = \"horario\" | \"anti_horario\"")
			end
		end
		local vezes = max(1, floor(o.vezes or 1))
		local vazio = vazioDoSprite(spr)
		local total, copias = 0, 0
		app.transaction("Ferramentas: copia.girar", function()
			for _, camada in ipairs(camadas) do
				for _, q in ipairs(quadros) do
					local pedaco = recorteCru(spr, camada:cel(q), area, dentro)
					if temConteudo(pedaco, spr) then
						pedaco = espelhar(pedaco, o.espelhar_h == true, o.espelhar_v == true, vazio)
						local destino = camadaDestino(ctx, camada, o)
						if o.no_lugar or o.mover then apagarArea(ctx, camada, q, area, dentro) end
						for k = 1, vezes do
							local girado = girarCom(o, pedaco, angulo * k, vazio)
							local x, y = lugarDaCopia(area, girado.width, girado.height, o, k)
							total = total + U.colar({ spr = spr, camada = destino, quadro = q }, girado, x, y, { modo = o.modo })
							copias = copias + 1
						end
					end
				end
			end
		end)
		return U.finalizar(ctx, o, { copias = copias, pixels = total, angulo = angulo, retangulo = tabelaRet(area) })
	end

	--- Redimensiona a cópia (vizinho mais próximo): `escala` (0.25, 0.5, 2, 4... ou {x, y}) ou `largura`/`altura`
	--- (uma só mantém a proporção). Padrão do Carbs: o original sai e a cópia fica centrada no lugar dele;
	--- `manter_original = true` deixa os dois. Onde, como em lugarDaCopia.
	function Cp.redimensionar(o)
		o = o or {}
		local ctx, camadas, quadros = abrirVarios(o)
		local spr = ctx.spr
		local area, dentro = areaDe(spr, o, true)
		local w, h
		if o.largura or o.altura then
			w = o.largura or floor(area.width * o.altura / area.height + 0.5)
			h = o.altura or floor(area.height * o.largura / area.width + 0.5)
		else
			local sx, sy = par(o.escala, nil)
			if not sx then falha("diga `escala` ou `largura`/`altura`") end
			w, h = area.width * sx, area.height * sy
		end
		w, h = max(1, floor(w + 0.5)), max(1, floor(h + 0.5))
		local vazio = vazioDoSprite(spr)
		local total, copias = 0, 0
		app.transaction("Ferramentas: copia.redimensionar", function()
			for _, camada in ipairs(camadas) do
				for _, q in ipairs(quadros) do
					local pedaco = recorteCru(spr, camada:cel(q), area, dentro)
					if temConteudo(pedaco, spr) then
						local destino = camadaDestino(ctx, camada, o)
						if not o.manter_original and destino == camada then apagarArea(ctx, camada, q, area, dentro) end
						local novo = escalar(pedaco, w, h, vazio)
						local x, y = lugarDaCopia(area, w, h, o, 1)
						total = total + U.colar({ spr = spr, camada = destino, quadro = q }, novo, x, y, { modo = o.modo })
						copias = copias + 1
					end
				end
			end
		end)
		return U.finalizar(ctx, o, { copias = copias, pixels = total, largura = w, altura = h, retangulo = tabelaRet(area) })
	end

	-- -----------------------------------------------------------------------------------------------------------
	-- exportar.*: seleção, camadas e folha de sprites da seleção, sem abrir sprite novo nem trocar de aba (o Carbs
	-- cria um sprite da seleção e volta ao arquivo com GoToNextTab). Não mudam nem gravam o sprite.

	local X = {}
	E.exportar = X

	local function fecharSo(ctx, o, r)
		if ctx.aberto and o.fechar ~= false then ctx.spr:close() end
		return r
	end

	local function nomeDeArquivo(t)
		return (tostring(t):gsub('[\\/:%*%?"<>|]', "_"))
	end

	--- Troca {camada}, {quadro}, {nome} no padrão; se há várias saídas e o padrão não distingue, põe _<camada>_<quadro>.
	local function caminhoSaida(padrao, campos, varias)
		local s = padrao:gsub("{(%w+)}", function(k)
			if campos[k] ~= nil then return nomeDeArquivo(campos[k]) end
		end)
		if varias and s == padrao then
			local base, ext = s:match("^(.*)(%.[^%.\\/]+)$")
			if not base then base, ext = s, ".png" end
			local extra = ""
			if campos.camada then extra = extra .. "_" .. nomeDeArquivo(campos.camada) end
			if campos.quadro then extra = extra .. "_" .. campos.quadro end
			s = base .. extra .. ext
		end
		return s
	end

	local function recortarRGB(img, area, dentro)
		local out = Image(img, area)
		if dentro then
			for it in out:pixels() do
				if not dentro(area.x + it.x, area.y + it.y) then it(0) end
			end
		end
		return out
	end

	local function ampliar(img, escala)
		escala = floor(escala or 1)
		if escala > 1 then
			img = img:clone()
			img:resize(img.width * escala, img.height * escala)
		end
		return img
	end

	--- Exporta a área (`retangulo` | `fatia` | `selecao`; padrão: o sprite) em `png`. `camadas` = { nomes } limita
	--- às camadas pedidas (padrão: as visíveis achatadas); `separar_camadas = true` faz um PNG por camada;
	--- `quadro` | `quadros`. O padrão aceita {camada}, {quadro}, {nome}. `escala`.
	function X.selecao(o)
		o = o or {}
		if not o.png then falha("`png` (caminho de saída) é obrigatório") end
		local spr, aberto = abrirSpriteDe(o)
		local ctx = { spr = spr, aberto = aberto }
		local arquivos = {}
		local ok, erro = pcall(function()
			local area, dentro = areaDe(spr, o, false)
			local quadros = listaQuadros(spr, o)
			local grupos = {}
			if o.separar_camadas then
				local lista = o.camadas and listaCamadas(spr, o) or nil
				if not lista then
					lista = {}
					for _, c in ipairs(camadasDeImagem(spr.layers)) do
						if c.visivel then lista[#lista + 1] = c.camada end
					end
				end
				for _, l in ipairs(lista) do grupos[#grupos + 1] = { nome = l.name, caminhos = { [l.name] = true } } end
			else
				grupos[1] = { caminhos = caminhosDe(o.camadas) }
			end
			local varias = #grupos * #quadros > 1
			for _, g in ipairs(grupos) do
				for _, q in ipairs(quadros) do
					local img = recortarRGB(renderizar(spr, q, g.caminhos), area, dentro)
					local caminho = caminhoSaida(o.png, { camada = g.nome, quadro = q, nome = app.fs.fileTitle(spr.filename) }, varias)
					arquivos[#arquivos + 1] = gravarPNG(ampliar(img, o.escala), caminho)
				end
			end
			ctx.area = area
		end)
		fecharSo(ctx, o, nil)
		if not ok then error(erro, 0) end
		return { arquivos = arquivos, retangulo = tabelaRet(ctx.area) }
	end

	--- Um PNG por camada (como o "Export Layers" do Carbs, mas de qualquer quadro e sem trocar de aba):
	--- `camadas` = { nomes } | "todas" | "visiveis" (padrão), `quadro` | `quadros`, `pasta_saida` (padrão:
	--- <pasta do sprite>/<nome>_camadas), `nome` = padrão do arquivo ("{camada}_{quadro}.png"), `aparar = true`
	--- corta o vazio, `retangulo`/`fatia` limita, `escala`, `incluir_vazias`.
	function X.camadas(o)
		o = o or {}
		local spr, aberto = abrirSpriteDe(o)
		local ctx = { spr = spr, aberto = aberto }
		local arquivos = {}
		local ok, erro = pcall(function()
			local lista = {}
			if o.camadas == nil then o = mesclar(o, { camadas = "visiveis" }) end
			local caminhos = {}
			for _, c in ipairs(camadasDeImagem(spr.layers)) do caminhos[c.camada.name] = caminhos[c.camada.name] or c.caminho end
			for _, l in ipairs(listaCamadas(spr, o)) do lista[#lista + 1] = { camada = l, caminho = caminhos[l.name] or l.name } end
			local pasta = o.pasta_saida
			if not pasta then
				if spr.filename == "" then falha("o sprite não tem arquivo: passe `pasta_saida`") end
				pasta = app.fs.joinPath(app.fs.filePath(spr.filename), app.fs.fileTitle(spr.filename) .. "_camadas")
			end
			local padrao = o.nome or "{camada}_{quadro}.png"
			local area = (o.retangulo or o.fatia) and areaDe(spr, o, true) or Rectangle(spr.bounds)
			for _, c in ipairs(lista) do
				for _, q in ipairs(listaQuadros(spr, o)) do
					local img = Image(renderizar(spr, q, { [c.caminho] = true }), area)
					local vazia = img:isEmpty()
					if not vazia or o.incluir_vazias then
						if o.aparar and not vazia then img = Image(img, img:shrinkBounds()) end
						local nome = caminhoSaida(padrao, { camada = (c.caminho:gsub("/", "_")), quadro = q, nome = app.fs.fileTitle(spr.filename) }, false)
						arquivos[#arquivos + 1] = gravarPNG(ampliar(img, o.escala), app.fs.joinPath(pasta, nome))
					end
				end
			end
		end)
		fecharSo(ctx, o, nil)
		if not ok then error(erro, 0) end
		return { arquivos = arquivos, total = #arquivos }
	end

	--- Folha de sprites da área: os quadros `quadros` | `tag` (nome) | todos, lado a lado (`colunas`; padrão uma
	--- linha só), ou uma linha por tag (`por_tag = true`, como o Carbs sem "Active Tag Only"). `camada` (só ela,
	--- o "Active Layer Only") ou `camadas`; `espaco`, `escala`, `png` obrigatório; `json` grava onde cada quadro
	--- ficou e a duração.
	function X.folha(o)
		o = o or {}
		if not o.png then falha("`png` (caminho de saída) é obrigatório") end
		local spr, aberto = abrirSpriteDe(o)
		local ctx = { spr = spr, aberto = aberto }
		local r
		local ok, erro = pcall(function()
			local area, dentro = areaDe(spr, o, false)
			local linhas = {}
			local function daTag(tag)
				local l = { tag = tag.name }
				for q = tag.fromFrame.frameNumber, tag.toFrame.frameNumber do l[#l + 1] = q end
				return l
			end
			if o.por_tag then
				if #spr.tags == 0 then falha("o sprite não tem tags") end
				for _, t in ipairs(spr.tags) do linhas[#linhas + 1] = daTag(t) end
			else
				local qs
				if o.tag then
					local achada
					for _, t in ipairs(spr.tags) do
						if t.name == o.tag then achada = t end
					end
					if not achada then falha("a tag \"%s\" não existe", o.tag) end
					qs = daTag(achada)
				elseif o.quadros and o.quadros ~= "todos" then
					qs = listaQuadros(spr, o)
				else
					qs = {}
					for i = 1, #spr.frames do qs[i] = i end
				end
				local colunas = max(1, floor(o.colunas or #qs))
				local l = {}
				for _, q in ipairs(qs) do
					l[#l + 1] = q
					if #l == colunas then
						linhas[#linhas + 1] = l
						l = {}
					end
				end
				if #l > 0 then linhas[#linhas + 1] = l end
			end
			local caminhos = o.camada and { [o.camada] = true } or caminhosDe(o.camadas)
			if o.camada and not U.acharCamada(spr.layers, o.camada) then falha("a camada \"%s\" não existe", o.camada) end
			local escala = max(1, floor(o.escala or 1))
			local espaco = floor(o.espaco or 0)
			local cw, ch = area.width * escala, area.height * escala
			local colunas = 0
			for _, l in ipairs(linhas) do colunas = max(colunas, #l) end
			local folha = Image(colunas * cw + (colunas - 1) * espaco, #linhas * ch + (#linhas - 1) * espaco, ColorMode.RGB)
			local quadros, tags = {}, {}
			for li, l in ipairs(linhas) do
				for ci, q in ipairs(l) do
					local img = ampliar(recortarRGB(renderizar(spr, q, caminhos), area, dentro), escala)
					local x, y = (ci - 1) * (cw + espaco), (li - 1) * (ch + espaco)
					folha:drawImage(img, Point(x, y))
					quadros[#quadros + 1] = { quadro = q, x = x, y = y, largura = cw, altura = ch,
						duracao = floor(spr.frames[q].duration * 1000 + 0.5), linha = li }
				end
				if l.tag then tags[#tags + 1] = { nome = l.tag, linha = li, de = l[1], ate = l[#l] } end
			end
			gravarPNG(folha, o.png)
			r = { png = o.png, largura = folha.width, altura = folha.height, quadros = #quadros, linhas = #linhas,
				retangulo = tabelaRet(area) }
			if o.json then
				gravarJSON(o.json, { imagem = app.fs.fileName(o.png), retangulo = tabelaRet(area), escala = escala,
					quadros = quadros, tags = tags })
				r.json = o.json
			end
		end)
		fecharSo(ctx, o, nil)
		if not ok then error(erro, 0) end
		return r
	end

	-- -----------------------------------------------------------------------------------------------------------
	-- quadros.*: quadros a partir da seleção (o Carbs corta pela grade num sprite novo com ImportSpriteSheet).

	local Q = {}
	E.quadros = Q

	--- Sprite novo, gravado em `saida` (e fechado), com cada célula da `grade` = {largura, altura} dentro da área
	--- como um quadro (linha a linha); sem `grade`, a área inteira num quadro só (o "Create New Sprite" do Carbs).
	--- As camadas de imagem vêm junto (nome, opacidade, mistura, visibilidade); `achatar = true` faz uma camada só.
	--- `quadro` de origem, `duracao` (ms, padrão 100), `manter_vazios` (células vazias também).
	function Q.da_selecao(o)
		o = o or {}
		if not o.saida then falha("`saida` (o arquivo novo, .aseprite ou outro formato) é obrigatória") end
		local spr, aberto = abrirSpriteDe(o)
		local r
		local ok, erro = pcall(function()
			local area, dentro = areaDe(spr, o, false)
			local quadro = validarQuadro(spr, o.quadro or 1)
			local celulas = {}
			local gw, gh = area.width, area.height
			if o.grade then
				gw, gh = par(o.grade, 16)
				gw, gh = floor(gw), floor(gh)
				for y = area.y, area.y + area.height - gh, gh do
					for x = area.x, area.x + area.width - gw, gw do celulas[#celulas + 1] = Rectangle(x, y, gw, gh) end
				end
				if #celulas == 0 then falha("a área é menor que uma célula da grade") end
			else
				celulas[1] = area
			end
			local fontes = {}
			if o.achatar then
				fontes[1] = { nome = "achatado" }
			else
				for _, c in ipairs(camadasDeImagem(spr.layers)) do
					fontes[#fontes + 1] = { nome = c.caminho, camada = c.camada, visivel = c.visivel }
				end
			end
			-- Imagens de cada célula; as vazias (em todas as camadas) saem, a não ser com manter_vazios.
			local quadrosNovos = {}
			for _, cel in ipairs(celulas) do
				local imgs, alguma = {}, false
				for i, f in ipairs(fontes) do
					local img
					if f.camada then
						img = recorteCru(spr, f.camada:cel(quadro), cel, dentro)
					else
						img = U.noModoDo(recortarRGB(U.achatar(spr, quadro), cel, dentro), spr)
					end
					imgs[i] = img
					if temConteudo(img, spr) then alguma = true end
				end
				if alguma or o.manter_vazios then quadrosNovos[#quadrosNovos + 1] = imgs end
			end
			if #quadrosNovos == 0 then falha("as células estão vazias") end
			local paleta = spr.palettes[1]
			local transparente = spr.transparentColor
			local modo = spr.colorMode
			local novo = Sprite(gw, gh, modo)
			local ok2, erro2 = pcall(function()
				if modo == ColorMode.INDEXED then
					novo:setPalette(paleta)
					novo.transparentColor = transparente
				end
				local camadasNovas = { novo.layers[1] }
				for i = 2, #fontes do camadasNovas[i] = novo:newLayer() end
				for i, f in ipairs(fontes) do
					local l = camadasNovas[i]
					l.name = f.nome
					if f.camada then
						l.opacity = f.camada.opacity
						l.blendMode = f.camada.blendMode
						l.isVisible = f.visivel ~= false
					end
				end
				for n = 2, #quadrosNovos do novo:newEmptyFrame() end
				local duracao = (o.duracao or 100) / 1000
				for n, imgs in ipairs(quadrosNovos) do
					novo.frames[n].duration = duracao
					for i, img in ipairs(imgs) do
						if temConteudo(img, spr) then novo:newCel(camadasNovas[i], n, img, Point(0, 0)) end
					end
				end
				criarPastaDe(o.saida)
				novo:saveAs(o.saida)
			end)
			novo:close()
			if not ok2 then error(erro2, 0) end
			r = { saida = o.saida, quadros = #quadrosNovos, largura = gw, altura = gh, camadas = #fontes }
		end)
		if aberto then spr:close() end
		if not ok then error(erro, 0) end
		return r
	end

	-- -----------------------------------------------------------------------------------------------------------
	-- cores.*: matiz/saturação/valor em cores escolhidas, na paleta e nos pixels (o Carbs só mexe nas cores
	-- marcadas na paleta da janela).

	local K = {}
	E.cores = K

	local function rgbParaHsv(r, g, b)
		r, g, b = r / 255, g / 255, b / 255
		local mx, mn = max(r, g, b), min(r, g, b)
		local d = mx - mn
		local h = 0
		if d > 0 then
			if mx == r then
				h = ((g - b) / d) % 6
			elseif mx == g then
				h = (b - r) / d + 2
			else
				h = (r - g) / d + 4
			end
			h = h * 60
		end
		local s = mx > 0 and d / mx or 0
		return h, s, mx
	end

	local function hsvParaRgb(h, s, v)
		h = h % 360
		local c = v * s
		local x = c * (1 - abs((h / 60) % 2 - 1))
		local m = v - c
		local r, g, b
		if h < 60 then
			r, g, b = c, x, 0
		elseif h < 120 then
			r, g, b = x, c, 0
		elseif h < 180 then
			r, g, b = 0, c, x
		elseif h < 240 then
			r, g, b = 0, x, c
		elseif h < 300 then
			r, g, b = x, 0, c
		else
			r, g, b = c, 0, x
		end
		local function canal(t) return min(255, max(0, floor((t + m) * 255 + 0.5))) end
		return canal(r), canal(g), canal(b)
	end

	local function chaveRGB(r, g, b) return (r << 16) | (g << 8) | b end

	--- Ajusta matiz (`h`, graus), saturação (`s`) e valor (`v`) (pontos percentuais, -100 a 100) das cores
	--- escolhidas: `cores` = { "#rrggbb", ... } e/ou `indices` = { índices da paleta }; sem as duas, todas.
	--- `paleta` (padrão sim) muda as entradas da paleta; `pixels` (padrão sim; num sprite indexado os pixels seguem a
	--- paleta sozinhos) muda os pixels dessas cores nas `camadas` (padrão todas) e `quadros` (padrão todos), dentro
	--- do `retangulo` se houver; `tolerancia` (distância RGB) pega cores parecidas.
	function K.ajustar(o)
		o = o or {}
		local spr, aberto = abrirSpriteDe(o)
		local ctx = { spr = spr, aberto = aberto, quadro = 1 }
		if spr.colorMode == ColorMode.GRAY then
			if aberto then spr:close() end
			falha("sprite em escala de cinza não tem matiz (converta para RGB ou indexado)")
		end
		local dh, ds, dv = o.h or 0, (o.s or 0) / 100, (o.v or 0) / 100
		local pal = spr.palettes[1]
		local alvos, indices = {}, {}
		local todas = not o.cores and not o.indices
		for _, c in ipairs(o.cores or {}) do
			local x = cor(c)
			alvos[#alvos + 1] = { x.red, x.green, x.blue }
		end
		for _, i in ipairs(o.indices or {}) do
			if i < 0 or i >= #pal then falha("índice %d fora da paleta (0 a %d)", i, #pal - 1) end
			indices[i] = true
			local x = pal:getColor(i)
			alvos[#alvos + 1] = { x.red, x.green, x.blue }
		end
		local exatos = {}
		for _, a in ipairs(alvos) do exatos[chaveRGB(a[1], a[2], a[3])] = true end
		local tol = o.tolerancia or 0
		local function escolhida(r, g, b)
			if todas or exatos[chaveRGB(r, g, b)] then return true end
			if tol > 0 then
				for _, a in ipairs(alvos) do
					if (r - a[1]) ^ 2 + (g - a[2]) ^ 2 + (b - a[3]) ^ 2 <= tol * tol then return true end
				end
			end
			return false
		end
		local cache, mudancas = {}, {}
		local function novaCor(r, g, b)
			local k = chaveRGB(r, g, b)
			local n = cache[k]
			if not n then
				local h, s, v = rgbParaHsv(r, g, b)
				local nr, ng, nb = hsvParaRgb(h + dh, min(1, max(0, s + ds)), min(1, max(0, v + dv)))
				n = { nr, ng, nb }
				cache[k] = n
				if #mudancas < 256 then
					mudancas[#mudancas + 1] = { de = string.format("#%02x%02x%02x", r, g, b), para = string.format("#%02x%02x%02x", nr, ng, nb) }
				end
			end
			return n[1], n[2], n[3]
		end
		local napaleta, npixels = 0, 0
		app.transaction("Ferramentas: cores.ajustar", function()
			if o.paleta ~= false then
				for i = 0, #pal - 1 do
					local c = pal:getColor(i)
					local pega
					if spr.colorMode == ColorMode.INDEXED then
						pega = todas or indices[i] or (o.cores and escolhida(c.red, c.green, c.blue))
						if i == spr.transparentColor and not indices[i] then pega = false end
					else
						pega = indices[i] or escolhida(c.red, c.green, c.blue)
					end
					if pega then
						local r, g, b = novaCor(c.red, c.green, c.blue)
						if r ~= c.red or g ~= c.green or b ~= c.blue then
							pal:setColor(i, Color{ r = r, g = g, b = b, a = c.alpha })
							napaleta = napaleta + 1
						end
					end
				end
			end
			if spr.colorMode == ColorMode.RGB and o.pixels ~= false then
				local lista = (o.camadas or o.camada) and listaCamadas(spr, o) or nil
				local nomes = {}
				for _, l in ipairs(lista or {}) do nomes[l.name] = true end
				local quadros
				if o.quadros or o.quadro then
					quadros = {}
					for _, q in ipairs(listaQuadros(spr, o)) do quadros[q] = true end
				end
				local area = o.retangulo and retangulo(o.retangulo)
				local vistas = {}
				for _, l in ipairs(camadasDeImagem(spr.layers)) do
					if not lista or nomes[l.camada.name] then
						for _, cel in ipairs(l.camada.cels) do
							-- Células ligadas dividem a imagem: cada imagem uma vez só.
							local id = cel.image.id or (l.caminho .. "#" .. cel.frameNumber)
							if (not quadros or quadros[cel.frameNumber]) and not vistas[id] then
								vistas[id] = true
								local img = cel.image:clone()
								local pos = cel.position
								local mudou = 0
								for it in img:pixels() do
									local v = it()
									local a = pc.rgbaA(v)
									if a > 0 then
										local x, y = it.x + pos.x, it.y + pos.y
										if not area or (x >= area.x and y >= area.y and x < area.x + area.width and y < area.y + area.height) then
											local r, g, b = pc.rgbaR(v), pc.rgbaG(v), pc.rgbaB(v)
											if escolhida(r, g, b) then
												local nr, ng, nb = novaCor(r, g, b)
												if nr ~= r or ng ~= g or nb ~= b then
													it(pc.rgba(nr, ng, nb, a))
													mudou = mudou + 1
												end
											end
										end
									end
								end
								if mudou > 0 then
									cel.image = img
									npixels = npixels + mudou
								end
							end
						end
					end
				end
			end
		end)
		return U.finalizar(ctx, o, { paleta = napaleta, pixels = npixels, mudancas = mudancas })
	end

	-- -----------------------------------------------------------------------------------------------------------
	-- matriz.*: biblioteca de matrizes de dithering (mapas de limiar), aplicação com elas, sequência de níveis e a
	-- pasta de extensão do Aseprite gerada num diretório de saída, sem instalar. Uma matriz é uma imagem em cinza:
	-- o valor (0 a 255) de cada célula é o limiar; com densidade d% acende onde valor < d * 256 / 100.

	local M = {}
	E.matriz = M

	--- Bayer n x n (n = 2, 4, 8, 16), valores espalhados de 0 a 255.
	local function bayer(n)
		local m = { { 0 } }
		local tam = 1
		while tam < n do
			local nm = {}
			for y = 1, tam * 2 do nm[y] = {} end
			for y = 1, tam do
				for x = 1, tam do
					local v = m[y][x] * 4
					nm[y][x] = v
					nm[y][x + tam] = v + 2
					nm[y + tam][x] = v + 3
					nm[y + tam][x + tam] = v + 1
				end
			end
			m, tam = nm, tam * 2
		end
		if tam ~= n then falha("bayer precisa ser 2, 4, 8 ou 16") end
		local img = Image(n, n, ColorMode.RGB)
		for y = 1, n do
			for x = 1, n do
				local v = floor(m[y][x] * 256 / (n * n))
				img:drawPixel(x - 1, y - 1, pc.rgba(v, v, v, 255))
			end
		end
		return img
	end

	--- Imagem cinza n x n a partir da ordem de cada célula (0 a n*n - 1): o valor é a ordem espalhada de 0 a 255.
	local function deOrdens(n, ordem)
		local img = Image(n, n, ColorMode.RGB)
		for y = 0, n - 1 do
			for x = 0, n - 1 do
				local v = floor(ordem(x, y) * 256 / (n * n))
				img:drawPixel(x, y, pc.rgba(v, v, v, 255))
			end
		end
		return img
	end

	--- Ordem de Bayer numa dimensão (bits ao contrário): para 4, as posições 0, 2, 1, 3 acendem nessa ordem.
	local function ordem1D(n)
		local bits = 0
		while (1 << bits) < n do bits = bits + 1 end
		if (1 << bits) ~= n or n < 2 or n > 16 then falha("o tamanho precisa ser 2, 4, 8 ou 16") end
		local r = {}
		for i = 0, n - 1 do
			local v = 0
			for b = 0, bits - 1 do
				if (i >> b) & 1 == 1 then v = v | (1 << (bits - 1 - b)) end
			end
			r[i] = v
		end
		return r
	end

	--- Linhas horizontais: uma linha inteira acende antes da próxima (na ordem de Bayer), e dentro da linha os
	--- pixels também na ordem de Bayer. A 25% (n = 4), uma linha cheia a cada quatro.
	local function matrizLinhas(n)
		local o = ordem1D(n)
		return deOrdens(n, function(x, y) return o[y] * n + o[x] end)
	end

	--- Xadrez: metade acende de uma vez, depois a outra metade (2 níveis).
	local function matrizXadrez()
		return deOrdens(2, function(x, y) return ((x + y) % 2 == 0) and 0 or 2 end)
	end

	--- Ruído azul n x n pelo void-and-cluster de Ulichney (1993), em código nosso: pontos que se afastam uns dos
	--- outros por igual, sem o desenho em cruz do Bayer. Repetível pela `semente` (sorteio próprio, não mexe no
	--- math.random). Energia por um núcleo gaussiano (sigma 1,5) que dá a volta nas bordas, para o ladrilho emendar.
	local function matrizRuidoAzul(n, semente)
		if n < 4 or n > 32 then falha("ruído azul de 4 a 32") end
		local N = n * n
		local nucleo = {}
		for dy = 0, n - 1 do
			for dx = 0, n - 1 do
				local a, b = min(dx, n - dx), min(dy, n - dy)
				nucleo[dy * n + dx] = math.exp(-(a * a + b * b) / (2 * 1.5 * 1.5))
			end
		end
		local energia, cheio = {}, {}
		for i = 0, N - 1 do energia[i] = 0 end
		local function mudar(i, sinal)
			local x0, y0 = i % n, i // n
			for y = 0, n - 1 do
				local linha = ((y - y0) % n) * n
				for x = 0, n - 1 do
					local j = y * n + x
					energia[j] = energia[j] + sinal * nucleo[linha + (x - x0) % n]
				end
			end
		end
		local s = floor(semente or 1) % 2147483647
		if s <= 0 then s = s + 2147483646 end
		local function sorteio(m)
			s = (s * 48271) % 2147483647
			return s % m
		end
		local uns = max(1, N // 10)
		local postos = 0
		while postos < uns do
			local i = sorteio(N)
			if not cheio[i] then
				cheio[i] = true
				mudar(i, 1)
				postos = postos + 1
			end
		end
		local function aglomerado()
			local melhor, mv = nil, -math.huge
			for i = 0, N - 1 do
				if cheio[i] and energia[i] > mv then melhor, mv = i, energia[i] end
			end
			return melhor
		end
		local function vao()
			local melhor, mv = nil, math.huge
			for i = 0, N - 1 do
				if not cheio[i] and energia[i] < mv then melhor, mv = i, energia[i] end
			end
			return melhor
		end
		-- Fase 0: tira o ponto mais apertado e põe no maior vão até não mudar mais (o protótipo).
		for _ = 1, N * 4 do
			local a = aglomerado()
			cheio[a] = nil
			mudar(a, -1)
			local v = vao()
			cheio[v] = true
			mudar(v, 1)
			if v == a then break end
		end
		local proto, eproto = {}, {}
		for i = 0, N - 1 do proto[i], eproto[i] = cheio[i], energia[i] end
		-- Fase 1: os pontos do protótipo recebem as ordens de baixo, o mais apertado sai primeiro (ordem mais alta).
		local ordem = {}
		local k = uns
		while k > 0 do
			local a = aglomerado()
			cheio[a] = nil
			mudar(a, -1)
			k = k - 1
			ordem[a] = k
		end
		-- Fases 2 e 3: do protótipo, cada novo ponto no maior vão (o mesmo que o aglomerado de zeros da fase 3, já que
		-- a energia dos zeros é a soma do núcleo menos a dos uns).
		for i = 0, N - 1 do cheio[i], energia[i] = proto[i], eproto[i] end
		k = uns
		while k < N do
			local v = vao()
			cheio[v] = true
			mudar(v, 1)
			ordem[v] = k
			k = k + 1
		end
		return deOrdens(n, function(x, y) return ordem[y * n + x] end)
	end

	--- Valores de uma imagem fonte: RGB/cinza pela luminância (alfa 0 = 255, nunca acende antes do cheio);
	--- indexada pelo índice.
	local function valoresDe(img)
		local out = Image(img.width, img.height, ColorMode.RGB)
		for it in img:pixels() do
			local v = it()
			local n
			if img.colorMode == ColorMode.INDEXED then
				n = min(255, v)
			elseif img.colorMode == ColorMode.GRAY then
				n = pc.grayaA(v) > 0 and pc.grayaV(v) or 255
			else
				n = pc.rgbaA(v) > 0 and floor(pc.rgbaR(v) * 0.299 + pc.rgbaG(v) * 0.587 + pc.rgbaB(v) * 0.114 + 0.5) or 255
			end
			out:drawPixel(it.x, it.y, pc.rgba(n, n, n, 255))
		end
		return out
	end

	--- Espalha os valores distintos de 0 a 255 mantendo a ordem (bom para mapas pintados à mão com poucos cinzas).
	local function normalizar(img)
		local vistos, lista = {}, {}
		for it in img:pixels() do
			local v = pc.rgbaR(it())
			if not vistos[v] then
				vistos[v] = true
				lista[#lista + 1] = v
			end
		end
		table.sort(lista)
		local mapa = {}
		for i, v in ipairs(lista) do mapa[v] = floor((i - 1) * 256 / #lista) end
		for it in img:pixels() do
			local n = mapa[pc.rgbaR(it())]
			it(pc.rgba(n, n, n, 255))
		end
		return img
	end

	local function niveisDe(img)
		local vistos, n = {}, 0
		for it in img:pixels() do
			local v = pc.rgbaR(it())
			if not vistos[v] then
				vistos[v] = true
				n = n + 1
			end
		end
		return n
	end

	local function gravarMatriz(o, img, origem)
		if not o.nome or o.nome == "" then falha("`nome` da matriz é obrigatório") end
		local pasta = pastaDe(o)
		local b = lerBiblioteca(pasta)
		local existente, pos = acharEm(b.matrizes, o.nome)
		if existente and existente.nome == o.nome then
			if not o.substituir then falha("já existe a matriz \"%s\" (passe `substituir = true`)", o.nome) end
		else
			existente = nil
		end
		local id = existente and existente.id or idLivre(b.matrizes, slug(o.nome))
		local rel = "matrizes/" .. id .. ".png"
		gravarPNG(img, app.fs.joinPath(pasta, rel))
		local entrada = { id = id, nome = o.nome, png = rel, largura = img.width, altura = img.height, niveis = niveisDe(img),
			origem = origem, descricao = o.descricao or (existente and existente.descricao) }
		if existente then b.matrizes[pos] = entrada else b.matrizes[#b.matrizes + 1] = entrada end
		gravarBiblioteca(pasta, b)
		entrada.pasta = pasta
		if o.imagem_png then
			entrada.imagem_png = gravarPNG(ampliar(img, o.png_escala or 8), o.imagem_png)
		end
		return entrada
	end

	--- Grava uma matriz na biblioteca: `nome` e a fonte: `bayer` = 2 | 4 | 8 | 16 (nossa); `ruido` (o mapa de
	--- limiar do Dithering Generator: bayer, blue, white, halftone, lines_h, lines_v, lines_d; com `tamanho`,
	--- `angulo`, `dx`, `dy`, `inverter`, `fractal`); `png` (um mapa em cinza, ou a matriz .bmp de uma extensão) ou
	--- `origem` = { arquivo, camada, retangulo }. `normalizar = true` espalha os níveis; `substituir = true`.
	function M.gravar(o)
		o = o or {}
		local img, origem
		if o.bayer then
			img = bayer(floor(o.bayer))
			origem = "bayer " .. floor(o.bayer)
		elseif o.ruido_azul then
			img = matrizRuidoAzul(floor(o.ruido_azul), o.semente)
			origem = "ruído azul " .. floor(o.ruido_azul) .. " (void-and-cluster, semente " .. floor(o.semente or 1) .. ")"
		elseif o.linhas then
			img = matrizLinhas(floor(o.linhas))
			origem = "linhas " .. floor(o.linhas)
		elseif o.xadrez then
			img = matrizXadrez()
			origem = "xadrez"
		elseif o.ruido then
			local opcoes = { ruido = o.ruido, tamanho = o.tamanho, angulo = o.angulo, dx = o.dx, dy = o.dy,
				inverter = o.inverter, fractal = o.fractal, mapa = true, densidade = 17 }
			img = valoresDe(E.dithering._ladrilho(opcoes))
			origem = "Dithering Generator: " .. o.ruido .. (o.tamanho and (" " .. o.tamanho) or "")
		elseif o.png then
			if not app.fs.isFile(o.png) then falha("png não encontrado: %s", o.png) end
			img = valoresDe(Image{ fromFile = o.png })
			origem = "png " .. app.fs.fileName(o.png)
		elseif o.origem then
			img = valoresDe(U.imagemDeOrigem(U.origemDo(o, o.origem)))
			origem = "origem"
		else
			falha("diga a fonte: `bayer`, `ruido_azul`, `linhas`, `xadrez`, `ruido`, `png` ou `origem` (ou use matriz.sequencia)")
		end
		if o.normalizar then img = normalizar(img) end
		return gravarMatriz(o, img, origem)
	end

	--- Matriz a partir de uma sequência de níveis (o "sequence" do Dithering Generator): cada imagem é um nível,
	--- do menos cheio para o mais cheio; o limiar de cada pixel é o primeiro nível em que ele acende. Imagens:
	--- `pngs` = { caminhos } ou os `quadros` (padrão: todos) de `arquivo` (`camada` opcional; sem ela, achatado),
	--- dentro de `retangulo`. `inverter = true` lê do mais cheio para o menos. Grava com `nome`.
	function M.sequencia(o)
		o = o or {}
		local imagens = {}
		if o.pngs then
			for _, caminho in ipairs(o.pngs) do imagens[#imagens + 1] = U.emRGB(Image{ fromFile = caminho }) end
		else
			if not o.arquivo then falha("diga `pngs` = { ... } ou `arquivo` (cada quadro um nível)") end
			local spr, aberto = U.abrirSprite(o.arquivo)
			local ok, erro = pcall(function()
				local quadros = o.quadros and o.quadros ~= "todos" and listaQuadros(spr, o) or nil
				if not quadros then
					quadros = {}
					for i = 1, #spr.frames do quadros[i] = i end
				end
				for _, q in ipairs(quadros) do
					imagens[#imagens + 1] = U.imagemDeOrigem({ arquivo = o.arquivo, camada = o.camada, quadro = q,
						retangulo = o.retangulo, inteiro = true })
				end
			end)
			if aberto then spr:close() end
			if not ok then error(erro, 0) end
		end
		if #imagens < 2 then falha("a sequência precisa de 2 níveis ou mais") end
		if o.inverter then
			local inv = {}
			for i = #imagens, 1, -1 do inv[#inv + 1] = imagens[i] end
			imagens = inv
		end
		local w, h = imagens[1].width, imagens[1].height
		for _, img in ipairs(imagens) do
			if img.width ~= w or img.height ~= h then falha("os níveis precisam ter o mesmo tamanho (%dx%d)", w, h) end
		end
		local n = #imagens
		local mapa = Image(w, h, ColorMode.RGB)
		local fora, desordem = 0, 0
		for y = 0, h - 1 do
			for x = 0, w - 1 do
				local primeiro
				for k = 1, n do
					local aceso = pc.rgbaA(imagens[k]:getPixel(x, y)) > 0
					if aceso and not primeiro then
						primeiro = k
					elseif primeiro and not aceso then
						desordem = desordem + 1
					end
				end
				local v = primeiro and floor((primeiro - 1) * 256 / n) or 255
				if not primeiro then fora = fora + 1 end
				mapa:drawPixel(x, y, pc.rgba(v, v, v, 255))
			end
		end
		local r = gravarMatriz(o, mapa, "sequência de " .. n .. " níveis")
		r.nunca_acende = fora
		r.apagam_depois = desordem
		return r
	end

	local function resumoMatriz(m)
		return { id = m.id, nome = m.nome, largura = m.largura, altura = m.altura, niveis = m.niveis, origem = m.origem,
			descricao = m.descricao }
	end

	function M.listar(o)
		o = o or {}
		local b = lerBiblioteca(pastaDe(o))
		local lista = {}
		for _, m in ipairs(b.matrizes) do lista[#lista + 1] = resumoMatriz(m) end
		table.sort(lista, function(a, c) return a.nome:lower() < c.nome:lower() end)
		return { matrizes = lista, total = #lista }
	end

	--- Carrega uma matriz: { largura, altura, v = { [y * largura + x + 1] = valor } }. `matriz` = nome, ou
	--- `bayer` = n direto, sem biblioteca.
	local function carregarMatriz(o)
		local img, entrada
		if o.bayer and not o.matriz then
			img = bayer(floor(o.bayer))
			entrada = { id = "bayer" .. floor(o.bayer), nome = "bayer " .. floor(o.bayer) }
		else
			if not o.matriz then falha("diga a `matriz` (nome na biblioteca) ou `bayer` = n") end
			local pasta = pastaDe(o)
			local b = lerBiblioteca(pasta)
			entrada = exigirEm(b.matrizes, o.matriz, "matriz")
			local caminho = app.fs.joinPath(pasta, entrada.png)
			if not app.fs.isFile(caminho) then falha("falta a imagem %s", caminho) end
			img = U.emRGB(Image{ fromFile = caminho })
		end
		local v = {}
		for it in img:pixels() do v[it.y * img.width + it.x + 1] = pc.rgbaR(it()) end
		return { largura = img.width, altura = img.height, v = v, entrada = entrada, img = img }
	end

	local function valorEm(m, x, y)
		return m.v[(y % m.altura) * m.largura + (x % m.largura) + 1]
	end

	--- Uma matriz: a entrada e, com `png`, a imagem (`png_escala`, padrão 8).
	function M.ler(o)
		o = o or {}
		local m = carregarMatriz(o)
		local r = resumoMatriz(m.entrada)
		r.largura, r.altura = m.largura, m.altura
		if o.png then r.png = gravarPNG(ampliar(m.img, o.png_escala or 8), o.png) end
		return r
	end

	function M.apagar(o)
		o = o or {}
		local pasta = pastaDe(o)
		local b = lerBiblioteca(pasta)
		local m, pos = exigirEm(b.matrizes, o.matriz or o.nome, "matriz")
		apagarArquivo(app.fs.joinPath(pasta, m.png))
		table.remove(b.matrizes, pos)
		gravarBiblioteca(pasta, b)
		return { apagada = m.id }
	end

	--- Enche a área (`retangulo`, padrão o sprite) com a matriz na `densidade` (0 a 100) e `cor`, preso à grade do
	--- sprite (`dx`/`dy` deslocam a matriz); `inverter`; `modo`, `mascara`, `mascara_camada` como nas outras.
	function M.preencher(o)
		o = o or {}
		local m = carregarMatriz(o)
		local ctx = U.abrir(o, "matriz")
		-- `selecao = true` (a forma da seleção) ou `fatia` também valem, como nas cópias.
		local area, dentro = areaDe(ctx.spr, o, false)
		if area.isEmpty then falha("a área está fora do sprite") end
		local limiar = floor((o.densidade or 50) * 256 / 100 + 0.5)
		local tinta = pixelDe(cor(o.cor, "#000000"))
		local dx, dy = floor(o.dx or 0), floor(o.dy or 0)
		local img = Image(area.width, area.height, ColorMode.RGB)
		local acesos = 0
		for y = 0, area.height - 1 do
			for x = 0, area.width - 1 do
				local aceso = valorEm(m, area.x + x - dx, area.y + y - dy) < limiar
				if o.inverter then aceso = not aceso end
				if dentro and not dentro(area.x + x, area.y + y) then aceso = false end
				if aceso then
					img:drawPixel(x, y, tinta)
					acesos = acesos + 1
				end
			end
		end
		local resultado = { matriz = m.entrada.nome, densidade = o.densidade or 50, acesos = acesos, retangulo = tabelaRet(area) }
		app.transaction("Ferramentas: matriz.preencher", function()
			resultado.pixels = U.colar(ctx, img, area.x, area.y, o)
		end)
		return U.finalizar(ctx, o, resultado)
	end

	--- Faixa com a matriz: a densidade vai de `inicio` a `fim` (0 a 100) ao longo da área (`vertical = true` de
	--- cima para baixo), na `cor`; com `cores` = { 2 ou mais }, um degradê pontilhado cheio entre elas (cada par
	--- vizinho misturado pela matriz).
	function M.faixa(o)
		o = o or {}
		local m = carregarMatriz(o)
		local ctx = U.abrir(o, "matriz")
		local area, dentro = areaDe(ctx.spr, o, false)
		if area.isEmpty then falha("a área está fora do sprite") end
		local img = Image(area.width, area.height, ColorMode.RGB)
		local comp = o.vertical and area.height or area.width
		local dx, dy = floor(o.dx or 0), floor(o.dy or 0)
		local cores
		if o.cores then
			if #o.cores < 2 then falha("`cores` precisa de 2 cores ou mais") end
			cores = {}
			for i, c in ipairs(o.cores) do cores[i] = pixelDe(cor(c)) end
		end
		local tinta = pixelDe(cor(o.cor, "#000000"))
		local ini, fim = o.inicio or 100, o.fim or 0
		for y = 0, area.height - 1 do
			for x = 0, area.width - 1 do
				local t = ((o.vertical and y or x) + 0.5) / comp
				if o.inverter then t = 1 - t end
				local v = valorEm(m, area.x + x - dx, area.y + y - dy)
				if dentro and not dentro(area.x + x, area.y + y) then
					-- fora da seleção: nada
				elseif cores then
					local u = t * (#cores - 1)
					local k = min(#cores - 2, floor(u))
					local f = u - k
					img:drawPixel(x, y, v < f * 256 and cores[k + 2] or cores[k + 1])
				else
					local d = ini + (fim - ini) * t
					if v < d * 256 / 100 then img:drawPixel(x, y, tinta) end
				end
			end
		end
		local resultado = { matriz = m.entrada.nome, retangulo = tabelaRet(area) }
		app.transaction("Ferramentas: matriz.faixa", function()
			resultado.pixels = U.colar(ctx, img, area.x, area.y, o)
		end)
		return U.finalizar(ctx, o, resultado)
	end

	--- Gera a pasta de extensão do Aseprite com as matrizes (o formato que o Dithering Generator instala:
	--- package.json com contributes.ditheringMatrices e um .bmp indexado em cinza por matriz, índice = limiar,
	--- 255 transparente) dentro de `saida`, SEM instalar: `saida`/<nome_pacote>/. `matrizes` = { nomes } (padrão:
	--- todas); `nome_pacote` (padrão "user_generated_dithers"), `nome_exibido`. Se a pasta já existe ali, as
	--- entradas de mesmo id são trocadas e as outras ficam. Para usar, o usuário copia a pasta para
	--- %APPDATA%\Aseprite\extensions\ (ou compacta em .aseprite-extension) e reinicia o Aseprite.
	function M.extensao(o)
		o = o or {}
		if not o.saida then falha("`saida` (a pasta onde gerar) é obrigatória") end
		local pastaLib = pastaDe(o)
		local b = lerBiblioteca(pastaLib)
		local lista = {}
		if o.matrizes then
			for _, ref in ipairs(o.matrizes) do lista[#lista + 1] = exigirEm(b.matrizes, ref, "matriz") end
		else
			lista = b.matrizes
		end
		if #lista == 0 then falha("nenhuma matriz na biblioteca (%s)", pastaLib) end
		local nomePacote = o.nome_pacote or "user_generated_dithers"
		if not nomePacote:match("^[%w_%-]+$") then falha("nome_pacote só com letras, números, _ e -") end
		local destino = app.fs.joinPath(o.saida, nomePacote)
		app.fs.makeAllDirectories(destino)
		local caminhoPacote = app.fs.joinPath(destino, "package.json")
		local pacote = lerJSON(caminhoPacote) or {}
		pacote.name = pacote.name or nomePacote
		pacote.displayName = o.nome_exibido or pacote.displayName or "User Generated Dithers"
		pacote.version = pacote.version or "1.0"
		pacote.publisher = pacote.publisher or "user"
		pacote.contributes = pacote.contributes or {}
		local entradas = pacote.contributes.ditheringMatrices or {}
		local arquivos = {}
		for _, m in ipairs(lista) do
			local mat = carregarMatriz({ pasta = o.pasta, matriz = m.id })
			local id = "hv_" .. m.id
			local arquivo = id .. ".bmp"
			local spr = Sprite(mat.largura, mat.altura, ColorMode.INDEXED)
			local ok, erro = pcall(function()
				local pal = Palette(256)
				for i = 0, 255 do pal:setColor(i, Color{ r = i, g = i, b = i, a = 255 }) end
				spr:setPalette(pal)
				spr.transparentColor = 255
				-- Os níveis em ordem, 0 a n-1 (como as matrizes que vêm com o Aseprite: o Bayer 4 sai 0 a 15).
				local distintos, ordem = {}, {}
				for _, v in ipairs(mat.v) do
					if not distintos[v] then
						distintos[v] = true
						ordem[#ordem + 1] = v
					end
				end
				table.sort(ordem)
				local nivel = {}
				for i, v in ipairs(ordem) do nivel[v] = min(254, i - 1) end
				local img = Image(mat.largura, mat.altura, ColorMode.INDEXED)
				for y = 0, mat.altura - 1 do
					for x = 0, mat.largura - 1 do img:drawPixel(x, y, nivel[mat.v[y * mat.largura + x + 1]]) end
				end
				spr:newCel(spr.layers[1], 1, img, Point(0, 0))
				spr:saveCopyAs(app.fs.joinPath(destino, arquivo))
			end)
			spr:close()
			if not ok then error(erro, 0) end
			local nova = { id = id, name = m.nome, path = arquivo }
			local trocou = false
			for i, e in ipairs(entradas) do
				if e.id == id then
					entradas[i] = nova
					trocou = true
				end
			end
			if not trocou then entradas[#entradas + 1] = nova end
			arquivos[#arquivos + 1] = app.fs.joinPath(destino, arquivo)
		end
		pacote.contributes.ditheringMatrices = entradas
		gravarJSON(caminhoPacote, pacote)
		-- __info.json: a lista que o Aseprite usa para desinstalar pela janela de extensões (todos os arquivos da pasta,
		-- inclusive os de uma instalação anterior do Dithering Generator que ficaram).
		if o.info ~= false then
			local instalados = {}
			for _, nome in ipairs(app.fs.listFiles(destino)) do
				if nome ~= "__info.json" and app.fs.isFile(app.fs.joinPath(destino, nome)) then instalados[#instalados + 1] = nome end
			end
			table.sort(instalados)
			gravarJSON(app.fs.joinPath(destino, "__info.json"), { installedFiles = instalados })
		end
		return { pasta = destino, package = caminhoPacote, matrizes = #lista, arquivos = arquivos,
			instalar = "copie a pasta para " .. app.fs.joinPath(app.fs.userConfigPath, "extensions") .. " (só com o aval do usuário) e reinicie o Aseprite" }
	end

	-- O conjunto inicial (2026-10-22, pedido do usuário): o que serve para sombra, céu, água e textura em pixel art.
	local INICIAIS = {
		{ nome = "Bayer 2x2", bayer = 2 },
		{ nome = "Bayer 4x4", bayer = 4 },
		{ nome = "Bayer 8x8", bayer = 8 },
		{ nome = "Ruído azul 8x8", ruido_azul = 8, semente = 7 },
		{ nome = "Ruído azul 16x16", ruido_azul = 16, semente = 7 },
		{ nome = "Linhas 4x4", linhas = 4 },
		{ nome = "Xadrez 2x2", xadrez = 2 },
	}

	--- Põe o conjunto inicial na biblioteca se ela não tem nenhuma matriz (`completar = true`: acrescenta as que
	--- faltam mesmo havendo outras). Devolve as criadas.
	function M.iniciais(o)
		o = o or {}
		local pasta = pastaDe(o)
		local tinha = #lerBiblioteca(pasta).matrizes
		local criadas = {}
		if tinha == 0 or o.completar then
			for _, m in ipairs(INICIAIS) do
				if not acharEm(lerBiblioteca(pasta).matrizes, m.nome) then
					M.gravar(mesclar(m, { pasta = o.pasta, descricao = "conjunto inicial" }))
					criadas[#criadas + 1] = m.nome
				end
			end
		end
		return { criadas = criadas, ja_tinha = tinha, pasta = pasta }
	end

	--- Instala as matrizes no Aseprite: o conjunto inicial se a biblioteca está vazia (`iniciais = false` pula) e a
	--- pasta user_generated_dithers gerada direto na pasta de extensões (`saida`; padrão a do usuário,
	--- %APPDATA%\Aseprite\extensions). Só com o pedido do usuário (o instalador, `npm run aseprite:instalar`, e o
	--- botão da janela). O Aseprite lê as matrizes ao abrir: reiniciar.
	function M.instalar(o)
		o = o or {}
		local r = { iniciais = (o.iniciais ~= false) and M.iniciais(o) or nil }
		local x = mesclar(o, { saida = o.saida or app.fs.joinPath(app.fs.userConfigPath, "extensions") })
		x.iniciais = nil
		r.extensao = M.extensao(x)
		r.extensao.instalar = nil
		r.reiniciar = true
		return r
	end

	E._interno.matriz = function(o) return carregarMatriz(o or {}) end

	-- -----------------------------------------------------------------------------------------------------------

	for _, nome in ipairs({
		"biblioteca.pasta", "biblioteca.criar", "biblioteca.importar", "biblioteca.listar", "biblioteca.editar",
		"biblioteca.renomear", "biblioteca.apagar", "biblioteca.grupos", "biblioteca.duplicados", "biblioteca.previa",
		"biblioteca.imagem", "biblioteca.carimbar", "biblioteca.traco",
		"conjunto.gravar", "conjunto.listar", "conjunto.ler", "conjunto.editar", "conjunto.apagar", "conjunto.carimbar",
		"ativo.definir", "ativo.ler", "ativo.ajustar", "ativo.carimbar", "ativo.proximo", "ativo.limpar",
		"caminho.da_camada", "caminho.da_selecao",
		"copia.deslocar", "copia.girar", "copia.redimensionar",
		"exportar.selecao", "exportar.camadas", "exportar.folha", "quadros.da_selecao", "cores.ajustar",
		"matriz.gravar", "matriz.sequencia", "matriz.listar", "matriz.ler", "matriz.apagar", "matriz.preencher",
		"matriz.faixa", "matriz.extensao", "matriz.iniciais", "matriz.instalar",
	}) do
		E.ACOES[#E.ACOES + 1] = nome
	end
end
