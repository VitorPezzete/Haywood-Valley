-- Compiled with roblox-ts v3.0.0
-- Medidas de desempenho do cliente (fase 0 do `PLANO_OTIMIZACAO.md`, seção 9.1). Cada sistema que roda a cada
-- quadro abre e fecha um rótulo (`perfBegin`, `perfEnd`): o rótulo aparece no MicroProfiler do Roblox (Ctrl+F6
-- no Studio) sempre, e o tempo é somado aqui só enquanto o painel de desempenho está ligado (`perfOn`), para
-- não gastar nada à toa. O `DevToolsController` lê e zera as somas a cada meio segundo.
--* Os sistemas medidos, na ordem em que o painel mostra. 
local PERF_SYSTEMS = { "Bonecos", "Moradores", "Baloes", "Tom", "Luzes", "Tiles", "Vento", "Oclusao", "Camera", "Acoes", "Mapa", "Humor", "Decorar", "Som" }
local sums = {}
for _, name in PERF_SYSTEMS do
	sums[name] = {
		total = 0,
		worst = 0,
		calls = 0,
	}
end
--* O nome de cada rótulo no MicroProfiler, feito uma vez só (sem montar texto a cada quadro). 
local PROFILE_NAMES = {}
for _, name in PERF_SYSTEMS do
	local _arg1 = `HV {name}`
	PROFILE_NAMES[name] = _arg1
end
local on = false
--* Liga ou desliga a soma dos tempos (o rótulo do MicroProfiler vale sempre). 
local resetSum
local function setPerfOn(value)
	on = value
	if not value then
		for _, sum in sums do
			resetSum(sum)
		end
	end
end
--* Se a soma dos tempos está ligada (o painel de desempenho à mostra). 
local function perfOn()
	return on
end
function resetSum(sum)
	sum.total = 0
	sum.worst = 0
	sum.calls = 0
end
--* Abre o rótulo do sistema; devolve a hora de começo (0 com a soma desligada), para o `perfEnd`. 
local function perfBegin(name)
	local _name = name
	debug.profilebegin(PROFILE_NAMES[_name])
	return if on then os.clock() else 0
end
--* Fecha o rótulo aberto por `perfBegin` e soma o tempo dele. 
local function perfEnd(name, started)
	debug.profileend()
	if not on or started == 0 then
		return nil
	end
	local ms = (os.clock() - started) * 1000
	local _name = name
	local sum = sums[_name]
	sum.total += ms
	sum.calls += 1
	if ms > sum.worst then
		sum.worst = ms
	end
end
--* Uma leitura de um sistema: a média por quadro e a vez mais lenta, em milissegundos. 
--* Lê as somas desde a última leitura, divididas pelos `frames` quadros do período, e zera. 
local function takePerf(frames)
	local readings = {}
	local count = math.max(frames, 1)
	for _, name in PERF_SYSTEMS do
		local sum = sums[name]
		local _arg0 = {
			name = name,
			perFrameMs = sum.total / count,
			worstMs = sum.worst,
		}
		table.insert(readings, _arg0)
		resetSum(sum)
	end
	return readings
end
--[[
	*
	 * Atributo dos `SurfaceGui` deitados no chão, com o papel de cada um: "fixo" (os tiles parados, o canvas grande),
	 * "vivo" (a camada viva: sombras, tiles animados, halos) e "mar" (o mar de fora, embaixo de tudo). O painel conta
	 * em quantos quadros por segundo cada um teve alguma imagem mudada, o que obriga o Roblox a refazer o desenho
	 * dele (página do `SurfaceGui`).
	 
]]
local CANVAS_ROLE_ATTRIBUTE = "Chao"
return {
	setPerfOn = setPerfOn,
	perfOn = perfOn,
	perfBegin = perfBegin,
	perfEnd = perfEnd,
	takePerf = takePerf,
	PERF_SYSTEMS = PERF_SYSTEMS,
	CANVAS_ROLE_ATTRIBUTE = CANVAS_ROLE_ATTRIBUTE,
}
