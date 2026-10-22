-- Entrada de linha de comando do adaptador das extensões de terceiros (extensoes.lua, 2026-10-22).
--
--   aseprite -b --script-param acao=dithering.preencher --script-param opcoes=<arquivo.json | JSON>
--            --script aseprite/adaptadores/rodar.lua
--
-- `opcoes` é o caminho de um .json (o jeito seguro no Windows, sem aspas na linha de comando) ou o próprio JSON.
-- `--script-param arquivo=<.aseprite>` é atalho para opcoes.arquivo. Escreve uma linha "RESULTADO <json>" ou
-- "ERRO <mensagem>"; tools/aseprite_extensoes.mjs lê essa linha. docs/arte/EXTENSOES_ASEPRITE.md tem as ações.

local function aqui()
	local fonte = debug.getinfo(1, "S").source
	if fonte:sub(1, 1) == "@" then fonte = fonte:sub(2) end
	return app.fs.filePath(fonte)
end

local paraTabela

local function lerOpcoes(valor)
	if valor == nil or valor == "" then return {} end
	local texto = valor
	if app.fs.isFile(valor) then
		local f = io.open(valor, "rb")
		texto = f:read("a")
		f:close()
	end
	local ok, dados = pcall(json.decode, texto)
	if not ok or (type(dados) ~= "table" and type(dados) ~= "userdata") then
		error("[extensoes] opcoes não é um JSON de objeto: " .. tostring(valor), 0)
	end
	return paraTabela(dados)
end

-- O json do Aseprite devolve objetos e listas como userdata (com pairs/ipairs) e todo número como real (3.0): o
-- adaptador quer tabelas comuns e inteiros onde o número é inteiro.
paraTabela = function(v)
	local tipo = type(v)
	if tipo == "number" then return math.tointeger(v) or v end
	if tipo ~= "userdata" and tipo ~= "table" then return v end
	-- Lista se tem [1]; senão, objeto (o # do userdata conta as chaves de um objeto também).
	local t = {}
	if v[1] ~= nil then
		for i, item in ipairs(v) do t[i] = paraTabela(item) end
	else
		for k, item in pairs(v) do t[k] = paraTabela(item) end
	end
	return t
end
local ok, resultado = pcall(function()
	local E = dofile(app.fs.joinPath(aqui(), "extensoes.lua"))
	local acao = app.params.acao
	if not acao or acao == "" then error("[extensoes] falta --script-param acao=<ação> (veja E.ACOES)", 0) end
	local opcoes = lerOpcoes(app.params.opcoes)
	if app.params.arquivo and app.params.arquivo ~= "" and opcoes.arquivo == nil then opcoes.arquivo = app.params.arquivo end
	return E.chamar(acao, opcoes)
end)

if ok then
	local codificado, texto = pcall(json.encode, resultado == nil and {} or resultado)
	print("RESULTADO " .. (codificado and texto or "{}"))
else
	print("ERRO " .. tostring(resultado):gsub("[\r\n]+", " "))
end
