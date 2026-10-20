-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local Reflect = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Reflect
local Controller = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out").Controller
local _services = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "services")
local Players = _services.Players
local TextChatService = _services.TextChatService
--* O canal público do chat do Roblox. Os outros (mensagens do sistema, cochichos, equipes) não sobem balão. 
local PUBLIC_CHANNEL = "RBXGeneral"
--* Por quanto tempo, em segundos, uma mensagem fica lembrada, para o balão não subir duas vezes. 
local SEEN_SECONDS = 60
--* A partir de quantas mensagens lembradas as antigas são esquecidas. 
local SEEN_LIMIT = 100
--[[
	*
	 * Troca o balão de chat do Roblox, que fica em cima do personagem invisível, pelo nosso balão de fala
	 * (`CharacterController.say`). A janela e a barra do chat continuam as do Roblox.
	 *
	 * Cada cliente desenha o balão a partir da mensagem que o chat do Roblox entregou a ele: o texto já
	 * vem filtrado para este jogador (e traduzido, se ele ligou a tradução do chat). O texto nunca passa
	 * pelo servidor nem por outro cliente. Mensagens do sistema, cochichos e mensagens recusadas pelo
	 * filtro não sobem balão. Quem o jogador silencia com /mute deixa de ter balão: o Roblox continua
	 * entregando as mensagens dele, e é a interface que precisa escondê-las.
	 
]]
local ChatController
do
	ChatController = setmetatable({}, {
		__tostring = function()
			return "ChatController"
		end,
	})
	ChatController.__index = ChatController
	function ChatController.new(...)
		local self = setmetatable({}, ChatController)
		return self:constructor(...) or self
	end
	function ChatController:constructor(characters)
		self.characters = characters
		self.muted = {}
		self.seen = {}
	end
	function ChatController:onStart()
		if TextChatService.ChatVersion ~= Enum.ChatVersion.TextChatService then
			warn("[chat] ChatVersion is not TextChatService: chat balloons need it (set it in Studio)")
		end
		-- Só os balões do Roblox saem. A configuração pode chegar depois deste controller.
		local turnOff = function(child)
			if child:IsA("BubbleChatConfiguration") then
				child.Enabled = false
			end
		end
		for _, child in TextChatService:GetChildren() do
			turnOff(child)
		end
		TextChatService.ChildAdded:Connect(turnOff)
		TextChatService.MessageReceived:Connect(function(message)
			return self:receive(message)
		end)
		task.spawn(function()
			return self:watchMute("RBXMuteCommand", true)
		end)
		task.spawn(function()
			return self:watchMute("RBXUnmuteCommand", false)
		end)
	end
	function ChatController:receive(message)
		-- Só a mensagem que passou pelo servidor: quem escreve recebe antes a cópia local, sem filtro.
		if message.Status ~= Enum.TextChatMessageStatus.Success then
			return nil
		end
		local source = message.TextSource
		local _condition = not source
		if not _condition then
			local _result = message.TextChannel
			if _result ~= nil then
				_result = _result.Name
			end
			_condition = _result ~= PUBLIC_CHANNEL
		end
		if _condition then
			return nil
		end
		local _seen = self.seen
		local _messageId = message.MessageId
		if _seen[_messageId] ~= nil then
			return nil
		end
		self:remember(message.MessageId)
		local _muted = self.muted
		local _userId = source.UserId
		if _muted[_userId] ~= nil then
			return nil
		end
		local player = Players:GetPlayerByUserId(source.UserId)
		if not player then
			return nil
		end
		local text = self:textOf(message)
		-- Mensagem só com espaços não tem o que mostrar.
		if (string.find(text, "%S")) == nil then
			return nil
		end
		self.characters:say(player, text)
	end
	function ChatController:textOf(message)
		local ok, translating = pcall(function()
			return TextChatService.ChatTranslationEnabled
		end)
		return if ok and translating == true and message.Translation ~= "" then message.Translation else message.Text
	end
	function ChatController:remember(id)
		local now = os.clock()
		local _seen = self.seen
		local _id = id
		_seen[_id] = now
		-- ▼ ReadonlyMap.size ▼
		local _size = 0
		for _ in self.seen do
			_size += 1
		end
		-- ▲ ReadonlyMap.size ▲
		if _size <= SEEN_LIMIT then
			return nil
		end
		for old, at in self.seen do
			if now - at > SEEN_SECONDS then
				self.seen[old] = nil
			end
		end
	end
	function ChatController:watchMute(name, muting)
		local commands = TextChatService:WaitForChild("TextChatCommands", 30)
		local _command = commands
		if _command ~= nil then
			_command = _command:WaitForChild(name, 30)
		end
		local command = _command
		local _result = command
		if _result ~= nil then
			_result = _result:IsA("TextChatCommand")
		end
		if not _result then
			return nil
		end
		command.Triggered:Connect(function(_, text)
			local words = {}
			for word in string.gmatch(text, "%S+") do
				table.insert(words, word)
			end
			local target = words[2]
			if target == nil then
				return nil
			end
			local wanted = string.lower((if string.sub(target, 1, 1) == "@" then string.sub(target, 2) else target))
			for _1, player in Players:GetPlayers() do
				if string.lower(player.Name) ~= wanted and string.lower(player.DisplayName) ~= wanted then
					continue
				end
				if muting then
					local _muted = self.muted
					local _userId = player.UserId
					_muted[_userId] = true
					self.characters:hush(player)
				else
					local _muted = self.muted
					local _userId = player.UserId
					_muted[_userId] = nil
				end
			end
		end)
	end
	do
		-- (Flamework) ChatController metadata
		Reflect.defineMetadata(ChatController, "identifier", "client/controllers/ChatController@ChatController")
		Reflect.defineMetadata(ChatController, "flamework:parameters", { "client/controllers/CharacterController@CharacterController" })
		Reflect.defineMetadata(ChatController, "flamework:implements", { "$:flamework@OnStart" })
	end
end
-- (Flamework) ChatController decorators
Reflect.decorate(ChatController, "$:flamework@Controller", Controller, {})
return {
	ChatController = ChatController,
}
