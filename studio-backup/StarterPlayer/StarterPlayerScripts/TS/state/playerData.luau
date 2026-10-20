-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local atom = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rbxts", "charm", "src").atom
local _playerData = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "playerData")
local emptyPlayerData = _playerData.emptyPlayerData
local encodeSavedLook = _playerData.encodeSavedLook
local SAVED_LOOKS = _playerData.SAVED_LOOKS
local Events = TS.import(script, script.Parent.Parent, "network").Events
--[[
	*
	 * Os favoritos e os visuais salvos do jogador. O servidor guarda (PlayerDataService) e manda a versão dele ao
	 * carregar e quando recusa um pedido (PlayerDataController); aqui a mudança aparece na hora, sem esperar a volta.
	 
]]
local playerData = atom(emptyPlayerData())
local function isFavorite(kind, id)
	local data = playerData()
	local _exp = (if kind == "head" then data.favoriteHeads else data.favoriteBodies)
	local _id = id
	return table.find(_exp, _id) ~= nil
end
--* Marca ou desmarca a peça como favorita. 
local function toggleFavorite(kind, id)
	local favorite = not isFavorite(kind, id)
	playerData(function(data)
		local _array = {}
		local _length = #_array
		local _array_1 = (if kind == "head" then data.favoriteHeads else data.favoriteBodies)
		table.move(_array_1, 1, #_array_1, _length + 1, _array)
		local list = _array
		local _id = id
		local at = (table.find(list, _id) or 0) - 1
		if favorite and at < 0 then
			local _id_1 = id
			table.insert(list, _id_1)
		end
		if not favorite and at >= 0 then
			table.remove(list, at + 1)
		end
		local _result
		if kind == "head" then
			local _object = table.clone(data)
			setmetatable(_object, nil)
			_object.favoriteHeads = list
			_result = _object
		else
			local _object = table.clone(data)
			setmetatable(_object, nil)
			_object.favoriteBodies = list
			_result = _object
		end
		return _result
	end)
	Events.setFavorite:fire(kind, id, favorite)
end
--* Grava o visual no espaço `slot` dos visuais salvos, ou apaga o espaço com `undefined`. 
local function saveLook(slot, look)
	if slot < 0 or slot >= SAVED_LOOKS then
		return nil
	end
	local text = if look then encodeSavedLook(look) else ""
	playerData(function(data)
		local _array = {}
		local _length = #_array
		local _array_1 = data.savedLooks
		table.move(_array_1, 1, #_array_1, _length + 1, _array)
		local savedLooks = _array
		savedLooks[slot + 1] = text
		local _object = table.clone(data)
		setmetatable(_object, nil)
		_object.savedLooks = savedLooks
		return _object
	end)
	Events.saveLook:fire(slot, text)
end
return {
	isFavorite = isFavorite,
	toggleFavorite = toggleFavorite,
	saveLook = saveLook,
	playerData = playerData,
}
