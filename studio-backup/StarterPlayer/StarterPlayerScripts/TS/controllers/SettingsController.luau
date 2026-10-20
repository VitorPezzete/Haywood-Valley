-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local Reflect = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Reflect
local Controller = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Controller
local effect = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "charm", "src").effect
local _services = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services")
local LocalizationService = _services.LocalizationService
local Players = _services.Players
local SoundService = _services.SoundService
local SOUND_GROUPS = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "settings").SOUND_GROUPS
local _settings = TS.import(script, script.Parent.Parent, "state", "settings")
local robloxLocale = _settings.robloxLocale
local settings = _settings.settings
--[[
	*
	 * Aplica as Configurações: o volume da música e dos efeitos e o idioma do Roblox que o Automático
	 * segue. Os grupos de som são do cliente, como a cena: todo som do jogo entra num deles.
	 
]]
local SettingsController
do
	SettingsController = setmetatable({}, {
		__tostring = function()
			return "SettingsController"
		end,
	})
	SettingsController.__index = SettingsController
	function SettingsController.new(...)
		local self = setmetatable({}, SettingsController)
		return self:constructor(...) or self
	end
	function SettingsController:constructor()
		self.groups = {}
	end
	function SettingsController:onInit()
		-- Antes do onStart dos outros controllers, para quem criar som já achar o grupo.
		local _groups = self.groups
		local _arg1 = self:createGroup(SOUND_GROUPS.music)
		_groups.music = _arg1
		local _groups_1 = self.groups
		local _arg1_1 = self:createGroup(SOUND_GROUPS.effects)
		_groups_1.effects = _arg1_1
	end
	function SettingsController:onStart()
		effect(function()
			local _binding = settings()
			local music = _binding.music
			local effects = _binding.effects
			self:group("music").Volume = music / 100
			self:group("effects").Volume = effects / 100
		end)
		task.spawn(function()
			-- O tradutor do Roblox acompanha o idioma que o jogador escolhe no menu do Roblox durante a
			-- partida. Só a troca conta: ao entrar vale o idioma da conta, que o átomo já tem. O valor
			-- inicial do tradutor depende dos idiomas cadastrados no painel do jogo (enquanto a língua de
			-- origem lá não for o inglês, ele pode dizer português para quem tem conta em inglês) e
			-- trocaria o idioma com o título já na tela.
			local ok, translator = pcall(function()
				return LocalizationService:GetTranslatorForPlayerAsync(Players.LocalPlayer)
			end)
			if not ok or not (typeof(translator) == "Instance") or not translator:IsA("Translator") then
				return nil
			end
			translator:GetPropertyChangedSignal("LocaleId"):Connect(function()
				return robloxLocale(translator.LocaleId)
			end)
		end)
	end
	function SettingsController:group(kind)
		local _groups = self.groups
		local _kind = kind
		return _groups[_kind]
	end
	function SettingsController:createGroup(name)
		local group = Instance.new("SoundGroup")
		group.Name = name
		group.Parent = SoundService
		return group
	end
	do
		-- (Flamework) SettingsController metadata
		Reflect.defineMetadata(SettingsController, "identifier", "client/controllers/SettingsController@SettingsController")
		Reflect.defineMetadata(SettingsController, "flamework:implements", { "$:flamework@OnInit", "$:flamework@OnStart" })
	end
end
-- (Flamework) SettingsController decorators
Reflect.decorate(SettingsController, "$:flamework@Controller", Controller, {})
return {
	SettingsController = SettingsController,
}
