-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local atom = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "charm", "src").atom
--[[
	*
	 * A prévia de celular (ferramenta de desenvolvimento, `DevToolsController`): o tamanho da tela de um celular, em
	 * pixels do `ViewportSize` dele (o Roblox mede a tela do celular em pontos: 844 × 390 num iPhone comum), ou nada
	 * com a prévia desligada. Com ela, a câmera escolhe o zoom e a interface escolhe o `k` como no celular, e tudo é
	 * mostrado ampliado por um número inteiro (`phoneScale`) num retângulo no meio da tela, com o resto coberto.
	 
]]
local phonePreview = atom(nil)
--* A tela de celular comum da prévia: 844 × 390 pontos (iPhone 12 a 15, deitado). 
local DEFAULT_PHONE = Vector2.new(844, 390)
--* Quantos pixels físicos da tela de agora valem um pixel da tela do celular: o maior inteiro que cabe. 
local function phoneScale(phone, physical)
	return math.max(1, math.floor(math.min(physical.X / phone.X, physical.Y / phone.Y)))
end
--* O tamanho de celular pedido num atributo: "844x390" (ou true, o comum), ou nada. 
local function parsePhone(value)
	if value == true then
		return DEFAULT_PHONE
	end
	local _value = value
	if not (type(_value) == "string") then
		return nil
	end
	local w, h = string.match(value, "^%s*(%d+)%s*[xX×]%s*(%d+)%s*$")
	local width = tonumber(w)
	local height = tonumber(h)
	if width == nil or height == nil or width < 200 or height < 150 then
		return nil
	end
	return Vector2.new(width, height)
end
return {
	phoneScale = phoneScale,
	parsePhone = parsePhone,
	phonePreview = phonePreview,
	DEFAULT_PHONE = DEFAULT_PHONE,
}
