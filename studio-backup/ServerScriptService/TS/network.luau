-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local t = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@flamework", "core", "out", "prelude").t
local GlobalEvents = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "network").GlobalEvents
local Events = GlobalEvents:createServer({}, {
	incomingIds = { "setLook", "setName", "react", "setFavorite", "saveLook", "setAction", "piecesReady", "grabPiece", "releasePiece", "stepPiece", "pushPiece", "liftPiece", "placePiece", "throwPiece", "toggleTap", "useFixture", "sleep", "takeExit", "decorPlace", "decorMove", "decorStore", "decorMovePiece" },
	incoming = {
		setLook = { { t.string }, nil },
		setName = { { t.string }, nil },
		react = { { t.number, t.boolean }, nil },
		setFavorite = { { t.literal("head", "body"), t.string, t.boolean }, nil },
		saveLook = { { t.number, t.string }, nil },
		setAction = { { t.string, t.number }, nil },
		piecesReady = { {}, nil },
		grabPiece = { { t.string }, nil },
		releasePiece = { { t.string }, nil },
		stepPiece = { { t.string, t.number, t.number }, nil },
		pushPiece = { { t.string, t.number, t.number }, nil },
		liftPiece = { { t.string }, nil },
		placePiece = { { t.string, t.number, t.number }, nil },
		throwPiece = { { t.string, t.number }, nil },
		toggleTap = { { t.number, t.number }, nil },
		useFixture = { { t.string }, nil },
		sleep = { {}, nil },
		takeExit = { {}, nil },
		decorPlace = { { t.string, t.number, t.number, t.number }, nil },
		decorMove = { { t.number, t.number, t.number, t.number }, nil },
		decorStore = { { t.number }, nil },
		decorMovePiece = { { t.string, t.number, t.number }, nil },
	},
	incomingUnreliable = {},
	outgoingIds = { "playerDataFailed", "playerData", "reacted", "pieceChanged", "pieceThrown", "tapChanged", "fixtureChanged", "slept", "exitRefused", "decorChanged", "decorRefused", "decorStock" },
	outgoingUnreliable = {},
	namespaceIds = {},
	namespaces = {},
})
return {
	Events = Events,
}
