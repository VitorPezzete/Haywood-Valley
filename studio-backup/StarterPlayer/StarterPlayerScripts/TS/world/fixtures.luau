-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local _fixtures = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "fixtures")
local chestOfPiece = _fixtures.chestOfPiece
local findFixtures = _fixtures.findFixtures
local GroundLayer = TS.import(script, script.Parent, "ground").GroundLayer
local _interior = TS.import(script, script.Parent, "interior")
local INTERIOR_TILE = _interior.INTERIOR_TILE
local sheetRect = _interior.sheetRect
--* O que aparece de um baú ou fogão mexido: as imagens por cima dos tiles e as células acesas (para as luzes). 
--[[
	*
	 * Desenha os baús e fogões do mapa (`shared/fixtures.ts`) no estado da sessão: o mapa fica como está (o canvas
	 * grande não muda) e, por cima, na camada viva, os tiles da versão de agora (o baú aberto, a boca acesa) só nas
	 * células que mudaram. A peça móvel que é baú abre no lugar; mudou de lugar, fecha.
	 
]]
local FixtureView
do
	FixtureView = setmetatable({}, {
		__tostring = function()
			return "FixtureView"
		end,
	})
	FixtureView.__index = FixtureView
	function FixtureView.new(...)
		local self = setmetatable({}, FixtureView)
		return self:constructor(...) or self
	end
	function FixtureView:constructor(board, interior)
		self.board = board
		self.interior = interior
		self.byId = {}
		self.state = {}
		self.pieces = {}
		self.shown = {}
		self.fixtures = findFixtures(board.map)
		for _, fixture in self.fixtures do
			local _byId = self.byId
			local _id = fixture.id
			_byId[_id] = fixture
		end
	end
	function FixtureView:fixture(id)
		local _byId = self.byId
		local _id = id
		return _byId[_id]
	end
	function FixtureView:fixtureAt(x, y)
		for _, fixture in self.fixtures do
			if x >= fixture.x and y >= fixture.y and x < fixture.x + fixture.w and y < fixture.y + fixture.h then
				return fixture
			end
		end
		return nil
	end
	function FixtureView:isOn(fixture)
		local _state = self.state
		local _id = fixture.id
		local _condition = _state[_id]
		if _condition == nil then
			_condition = fixture.startsOn
		end
		return _condition
	end
	function FixtureView:pieceOpen(id)
		local _pieces = self.board.pieces
		local _id = id
		local state = _pieces[_id]
		local chest = state and chestOfPiece(self.board:defOf(state))
		if not chest then
			return false
		end
		local _pieces_1 = self.pieces
		local _id_1 = id
		return _pieces_1[_id_1] ~= nil ~= chest.open
	end
	function FixtureView:set(id, on)
		local _byId = self.byId
		local _id = id
		local fixture = _byId[_id]
		if fixture then
			local _state = self.state
			local _id_1 = id
			local _on = on
			_state[_id_1] = _on
			self:draw(id, fixture.x, fixture.y, fixture.cells, on, true)
			return nil
		end
		local _pieces = self.board.pieces
		local _id_1 = id
		local piece = _pieces[_id_1]
		local chest = piece and chestOfPiece(self.board:defOf(piece))
		if not piece or not chest then
			return nil
		end
		if on and piece.mode == 0 then
			local _pieces_1 = self.pieces
			local _id_2 = id
			local _vector2 = Vector2.new(piece.x, piece.y)
			_pieces_1[_id_2] = _vector2
			-- A peça desenhada fechada mostra a versão aberta, e a aberta a fechada.
			self:draw(id, piece.x, piece.y, chest.cells, not chest.open, false)
		else
			local _pieces_1 = self.pieces
			local _id_2 = id
			_pieces_1[_id_2] = nil
			self:clear(id)
		end
	end
	function FixtureView:cellsOf(id)
		local _shown = self.shown
		local _id = id
		local _result = _shown[_id]
		if _result ~= nil then
			_result = _result.cells
		end
		local _condition = _result
		if _condition == nil then
			_condition = {}
		end
		return _condition
	end
	function FixtureView:update()
		local closed = {}
		for id, at in self.pieces do
			local piece = self.board.pieces[id]
			if piece and piece.mode == 0 and piece.x == at.X and piece.y == at.Y then
				continue
			end
			table.insert(closed, id)
		end
		for _, id in closed do
			self.pieces[id] = nil
			self:clear(id)
		end
		return closed
	end
	function FixtureView:destroy()
		for id in self.shown do
			self:clear(id)
		end
	end
	function FixtureView:clear(id)
		local _shown = self.shown
		local _id = id
		local shown = _shown[_id]
		if not shown then
			return nil
		end
		for _, label in shown.labels do
			label:Destroy()
		end
		local _shown_1 = self.shown
		local _id_1 = id
		_shown_1[_id_1] = nil
	end
	function FixtureView:draw(id, x, y, cells, on, skipSame)
		self:clear(id)
		local shown = {
			labels = {},
			cells = {},
		}
		local origin = self.interior:canvasOf(0, 0)
		for _, cell in cells do
			local cx = x + cell.dx
			local cy = y + cell.dy
			local tile = if on then cell.on else cell.off
			local under = self.board.map:ground(cx, cy)
			if skipSame and under and under[1] == tile[1] and under[2] == tile[2] and under[3] == tile[3] then
				continue
			end
			local _cells = shown.cells
			local _arg0 = { cx, cy, tile }
			table.insert(_cells, _arg0)
			local rect = sheetRect(tile)
			local label = Instance.new("ImageLabel")
			label.Name = `Fixture_{id}`
			label.BackgroundTransparency = 1
			label.Image = rect.image
			label.ImageRectOffset = rect.offset
			label.ImageRectSize = rect.size
			label.Size = UDim2.fromOffset(INTERIOR_TILE, INTERIOR_TILE)
			local _arg0_1 = Vector2.new(cx, cy) * INTERIOR_TILE
			local at = origin + _arg0_1
			label.Position = UDim2.fromOffset(at.X, at.Y)
			label.ResampleMode = Enum.ResamplerMode.Pixelated
			-- Na camada viva, acima das peças (criada depois delas): mexer não refaz o canvas grande dos tiles.
			label.ZIndex = GroundLayer.Piece
			label.Parent = self.interior.live.gui
			local _exp = shown.labels
			table.insert(_exp, label)
		end
		local _shown = self.shown
		local _id = id
		_shown[_id] = shown
	end
end
return {
	FixtureView = FixtureView,
}
