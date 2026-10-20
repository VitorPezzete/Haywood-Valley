-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
-- O que faz o rosto do personagem reagir sozinho. O jogador não escolhe reação: ela vem do que
-- acontece com ele (ficar parado, esbarrar, encontrar alguém, falar no chat). Cada situação aponta
-- para uma reação de `Faces.reactions` pelo id; se a folha de rostos não tiver essa reação, a
-- situação simplesmente não muda o rosto.
local Faces = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "faces").Faces
local function mood(id, bubble)
	local _object = {}
	local _left = "reaction"
	local _exp = Faces.reactions
	-- ▼ ReadonlyArray.findIndex ▼
	local _callback = function(reaction)
		return reaction.id == id
	end
	local _result = -1
	for _i, _v in _exp do
		if _callback(_v, _i - 1, _exp) == true then
			_result = _i - 1
			break
		end
	end
	-- ▲ ReadonlyArray.findIndex ▲
	_object[_left] = _result
	_object.bubble = bubble
	return _object
end
local Moods = {
	greet = mood("sorriso", false),
	bump = mood("ai", false),
	drowsy = mood("tedio", false),
	sleep = mood("dormindo", true),
	talk = mood("falando", false),
	stroll = mood("cantando", true),
	pleased = mood("sorriso", false),
}
--* Segundos parado até os olhos pesarem e até dormir. Todo cliente conta isso para todo jogador. 
local DROWSY_AFTER = 40
local SLEEP_AFTER = 60
--* Tempo mínimo entre duas reações disparadas pelo mesmo jogador, em segundos. 
local REACTION_COOLDOWN = 0.6
--* Se `value` é o índice de uma reação que existe. 
local function isReaction(value)
	local _value = value
	local _condition = type(_value) == "number"
	if _condition then
		_condition = value == math.floor(value) and value >= 0 and value < #Faces.reactions
	end
	return _condition
end
--[[
	*
	 * O que o jogador escreve no chat também mexe no rosto. `has` são trechos que podem estar em
	 * qualquer lugar do texto (carinhas, risada comprida); `words` são palavras inteiras. Vale a
	 * primeira linha que casar, então as mais específicas vêm antes.
	 *
	 * As palavras valem em qualquer idioma da interface: cada jogador escreve na língua dele, então
	 * cada linha junta português e inglês.
	 
]]
local CHAT = { {
	reaction = "choro",
	has = { ":'(", "t_t", ";-;", ";_;" },
	words = { "buaa", "chorando", "cry", "crying" },
}, {
	reaction = "bravo",
	has = { ">:(" },
	words = { "grr", "aff", "raiva", "ugh", "angry" },
}, {
	reaction = "apaixonado",
	has = { "<3" },
	words = { "s2", "amo", "amei", "love", "luv" },
}, {
	reaction = "risada",
	has = { "kkk", "haha", "hehe", "rsrs", ":d", "lmao", "rofl" },
	words = { "lol", "xd" },
}, {
	reaction = "piscadinha",
	has = { ";)", ";d", ";-)" },
}, {
	reaction = "triste",
	has = { ":(", ":/" },
	words = { "poxa", "triste", "sad" },
}, {
	reaction = "surpresa",
	has = { ":o", "!!" },
	words = { "nossa", "eita", "uau", "wow", "whoa", "woah", "omg" },
}, {
	reaction = "dormindo",
	has = { "zzz" },
	words = { "sono", "sleepy" },
}, {
	reaction = "duvida",
	has = { "??" },
	words = { "hein", "huh" },
}, {
	reaction = "sorriso",
	has = { ":)", "(:", "=)", "^^" },
	words = { "oi", "olá", "ola", "opa", "hi", "hello", "hey" },
} }
-- ▼ ReadonlyArray.map ▼
local _newValue = table.create(#CHAT)
local _callback = function(entry)
	local _object = {
		mood = mood(entry.reaction, true),
		has = entry.has or {},
	}
	local _left = "words"
	local _set = {}
	for _, _v in entry.words or {} do
		_set[_v] = true
	end
	_object[_left] = _set
	return _object
end
for _k, _v in CHAT do
	_newValue[_k] = _callback(_v, _k - 1, CHAT)
end
-- ▲ ReadonlyArray.map ▲
local CHAT_MOODS = _newValue
--* A reação que um texto do chat pede; sem nada especial nele, a de falar. 
local function chatMood(text)
	local lower = string.lower(text)
	-- Palavra é tudo o que não é espaço nem pontuação; as letras acentuadas ficam dentro dela.
	local words = {}
	for word in string.gmatch(lower, "[^%s%p]+") do
		table.insert(words, word)
	end
	for _, entry in CHAT_MOODS do
		if entry.mood.reaction < 0 then
			continue
		end
		for _1, piece in entry.has do
			if (string.find(lower, piece, 1, true)) ~= nil then
				return entry.mood
			end
		end
		for _1, word in words do
			if entry.words[word] ~= nil then
				return entry.mood
			end
		end
	end
	return Moods.talk
end
return {
	isReaction = isReaction,
	chatMood = chatMood,
	Moods = Moods,
	DROWSY_AFTER = DROWSY_AFTER,
	SLEEP_AFTER = SLEEP_AFTER,
	REACTION_COOLDOWN = REACTION_COOLDOWN,
}
