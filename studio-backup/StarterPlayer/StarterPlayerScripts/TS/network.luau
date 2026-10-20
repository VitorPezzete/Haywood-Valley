-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local t = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out", "prelude").t
local GlobalEvents = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "network").GlobalEvents
local Events = GlobalEvents:createClient({}, {
	incomingIds = { "playerDataFailed", "playerData", "reacted", "pieceChanged", "pieceThrown", "tapChanged", "fixtureChanged", "slept", "exitRefused", "decorChanged", "decorRefused", "decorStock" },
	incoming = {
		playerDataFailed = { {}, nil },
		playerData = { { t.array(t.string), t.array(t.string), t.array(t.string), t.string, t.string }, nil },
		reacted = { { t.number, t.number, t.boolean }, nil },
		pieceChanged = { { t.string, t.string, t.number, t.number, t.number, t.number, t.number }, nil },
		pieceThrown = { { t.string, t.string, t.number, t.number, t.number, t.number, t.number }, nil },
		tapChanged = { { t.string, t.number, t.number, t.boolean }, nil },
		fixtureChanged = { { t.string, t.string, t.boolean }, nil },
		slept = { { t.boolean, t.number }, nil },
		exitRefused = { {}, nil },
		decorChanged = { { t.string, t.number, t.string, t.number, t.number, t.number, t.number, t.number, t.number }, nil },
		decorRefused = { { t.string, t.string, t.string, t.string }, nil },
		decorStock = { { t.string }, nil },
	},
	incomingUnreliable = {},
	outgoingIds = { "setLook", "setName", "react", "setFavorite", "saveLook", "setAction", "piecesReady", "grabPiece", "releasePiece", "stepPiece", "pushPiece", "liftPiece", "placePiece", "throwPiece", "toggleTap", "useFixture", "sleep", "takeExit", "decorPlace", "decorMove", "decorStore", "decorMovePiece" },
	outgoingUnreliable = {},
	namespaceIds = {},
	namespaces = {},
})
return {
	Events = Events,
}
