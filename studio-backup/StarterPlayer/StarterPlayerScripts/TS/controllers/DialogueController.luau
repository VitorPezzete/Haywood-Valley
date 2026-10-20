-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local Reflect = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Reflect
local Controller = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Controller
local _services = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services")
local Players = _services.Players
local RunService = _services.RunService
local UserInputService = _services.UserInputService
local _vide = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "vide", "src")
local mount = _vide.mount
local source = _vide.source
local TEXT_SPEEDS = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "settings").TEXT_SPEEDS
local settings = TS.import(script, script.Parent.Parent, "state", "settings").settings
local DialogueBox = TS.import(script, script.Parent.Parent, "ui", "DialogueBox").DialogueBox
local ADVANCE_KEYS = {
	[Enum.KeyCode.Space] = true,
	[Enum.KeyCode.Return] = true,
	[Enum.KeyCode.E] = true,
}
local function lengthOf(text)
	local count = utf8.len(text)
	return if type(count) == "number" then count else #text
end
--[[
	*
	 * Conversas na tela: mostra uma fala por vez, letra a letra, na velocidade escolhida em
	 * Configurações. O jogador avança com Espaço, Enter, E ou clique; o primeiro toque completa a fala,
	 * o segundo passa para a próxima. Enquanto houver fala, o personagem fica parado.
	 
]]
local DialogueController
do
	DialogueController = setmetatable({}, {
		__tostring = function()
			return "DialogueController"
		end,
	})
	DialogueController.__index = DialogueController
	function DialogueController.new(...)
		local self = setmetatable({}, DialogueController)
		return self:constructor(...) or self
	end
	function DialogueController:constructor(movement)
		self.movement = movement
		self.queue = {}
		self.line = source(nil)
		self.shown = source(0)
	end
	function DialogueController:onStart()
		local waiting = function()
			local current = self.line()
			return current ~= nil and self.shown() >= lengthOf(current.text())
		end
		local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")
		mount(function()
			return DialogueBox({
				line = self.line,
				shown = self.shown,
				waiting = waiting,
			})
		end, playerGui)
		RunService.Heartbeat:Connect(function(dt)
			local current = self.line()
			if not current then
				return nil
			end
			local total = lengthOf(current.text())
			if self.shown() >= total then
				return nil
			end
			-- A velocidade vem de Configurações; "instantâneo" mostra a fala inteira de uma vez.
			local speed = TEXT_SPEEDS[settings().textSpeed]
			self.shown(if speed == math.huge then total else math.min(total, self.shown() + dt * speed))
		end)
		UserInputService.InputBegan:Connect(function(input, processed)
			if processed or self.line() == nil then
				return nil
			end
			local click = input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch
			local _condition = click
			if not _condition then
				local _keyCode = input.KeyCode
				_condition = ADVANCE_KEYS[_keyCode] ~= nil
			end
			if _condition then
				self:advance()
			end
		end)
	end
	function DialogueController:say(lines)
		for _, item in lines do
			local _exp = self.queue
			table.insert(_exp, item)
		end
		if self.line() == nil then
			self:next()
		end
	end
	function DialogueController:advance()
		local current = self.line()
		if not current then
			return nil
		end
		local total = lengthOf(current.text())
		if self.shown() < total then
			self.shown(total)
		else
			self:next()
		end
	end
	function DialogueController:next()
		local following = table.remove(self.queue, 1)
		self.shown(0)
		self.line(following)
		if following then
			if self.release == nil then
				self.release = self.movement:hold()
			end
		else
			local _result = self.release
			if _result ~= nil then
				_result()
			end
			self.release = nil
		end
	end
	do
		-- (Flamework) DialogueController metadata
		Reflect.defineMetadata(DialogueController, "identifier", "client/controllers/DialogueController@DialogueController")
		Reflect.defineMetadata(DialogueController, "flamework:parameters", { "client/controllers/MovementController@MovementController" })
		Reflect.defineMetadata(DialogueController, "flamework:implements", { "$:flamework@OnStart" })
	end
end
-- (Flamework) DialogueController decorators
Reflect.decorate(DialogueController, "$:flamework@Controller", Controller, {})
return {
	DialogueController = DialogueController,
}
