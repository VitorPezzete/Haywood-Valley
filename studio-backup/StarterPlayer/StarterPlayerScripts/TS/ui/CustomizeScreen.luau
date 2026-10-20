-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local _vide = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "vide", "src")
local Vide = _vide
local cleanup = _vide.cleanup
local Show = _vide.Show
local CeleiroLayout = TS.import(script, script.Parent, "customize", "celeiro").CeleiroLayout
local GraalLayout = TS.import(script, script.Parent, "customize", "graal").GraalLayout
local makeParts = TS.import(script, script.Parent, "customize", "parts").makeParts
local createCustomize = TS.import(script, script.Parent, "customize", "state").createCustomize
local _kit = TS.import(script, script.Parent, "kit")
local DESIGN = _kit.DESIGN
local px = _kit.px
local _theme = TS.import(script, script.Parent, "theme")
local theme = _theme.theme
local themeColor = _theme.themeColor
local INK = Color3.fromHex("#0A0F0C")
--[[
	*
	 * Personalização do personagem, no kit de interface do tema escolhido nas Configurações. Cada tema tem
	 * a disposição da prancha dele (customize/celeiro.tsx e customize/graal.tsx); o estado (o visual, as
	 * abas, o histórico, o teclado) fica em customize/state.ts e continua o mesmo quando o tema muda no
	 * meio da tela. À esquerda, o boneco grande andando no lugar, girar, Aleatório, Desfazer e Refazer e
	 * os visuais salvos; à direita, as abas: gênero, cabeça e corpo (grades com rolagem, filtro por
	 * artista e favoritos), cabelo, rosto e roupa (cores em RGB, com as cores prontas e a original);
	 * embaixo, o nome, Voltar e Continuar. Favoritos e visuais salvos ficam guardados entre as partidas
	 * (PlayerDataService). Tudo serve para mouse, toque e teclado.
	 
]]
local function CustomizeScreen(_param)
	local k = _param.k
	local onDone = _param.onDone
	local ctx = createCustomize(k, onDone)
	local parts = makeParts(ctx)
	local root
	root = (Vide.jsx("frame", {
		Name = "Customize",
		BackgroundTransparency = 1,
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = px(k, DESIGN.X, DESIGN.Y),
		ZIndex = 10,
	}, Vide.jsx("frame", {
		Name = "Backdrop",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromScale(6, 6),
		BackgroundColor3 = function()
			return themeColor("screenTint")
		end,
		BorderSizePixel = 0,
		ZIndex = 1,
	}), Vide.jsx(Show, {
		when = function()
			return theme() == "celeiro"
		end,
	}, function()
		return Vide.jsx(CeleiroLayout, {
			ctx = ctx,
		})
	end), Vide.jsx(Show, {
		when = function()
			return theme() == "graal"
		end,
	}, function()
		return Vide.jsx(GraalLayout, {
			ctx = ctx,
		})
	end), parts.tooltip(function()
		return root
	end, function()
		return if theme() == "graal" then {
			color = themeColor("text"),
			shadow = INK,
		} else {
			color = themeColor("text"),
		}
	end, 40)))
	-- O Show do Vide só tira a tela do lugar (Parent = nil), sem destruir; destrói no fim do quadro,
	-- depois de o Vide mexer no Parent (como no MenuPanel).
	cleanup(function()
		return task.defer(function()
			local _result = root
			if _result ~= nil then
				_result = _result:Destroy()
			end
			return _result
		end)
	end)
	return root
end
return {
	CustomizeScreen = CustomizeScreen,
}
