-- Entrada: move a câmera e avisa quando o jogador "clica" num ponto da tela.
--   Mouse:   arrastar move, roda dá zoom, clique sem arrastar age.
--   Teclado: WASD ou setas movem.
--   Toque:   arrastar move, pinça dá zoom, toque age.
--   Gamepad: analógico esquerdo move, gatilhos dão zoom, A age no centro da tela.

local GuiService = game:GetService("GuiService")
local UserInputService = game:GetService("UserInputService")

local Camera2D = require(script.Parent.Camera2D)

local DRAG_THRESHOLD = 6 -- pixels até um clique virar arrasto
local KEY_PAN_SPEED = 900 -- pixels de tela por segundo
local STICK_DEADZONE = 0.2
local PINCH_STEP = 0.08

local KEY_DIRECTIONS = {
	[Enum.KeyCode.W] = Vector2.new(0, -1),
	[Enum.KeyCode.Up] = Vector2.new(0, -1),
	[Enum.KeyCode.S] = Vector2.new(0, 1),
	[Enum.KeyCode.Down] = Vector2.new(0, 1),
	[Enum.KeyCode.A] = Vector2.new(-1, 0),
	[Enum.KeyCode.Left] = Vector2.new(-1, 0),
	[Enum.KeyCode.D] = Vector2.new(1, 0),
	[Enum.KeyCode.Right] = Vector2.new(1, 0),
}

local GAMEPAD_TYPES = {
	[Enum.UserInputType.Gamepad1] = true,
}

local InputController = {
	onClick = nil :: ((screen: Vector2) -> ())?,
}

local pressed = false
local dragging = false
local pressPosition = Vector2.zero
local lastPosition = Vector2.zero
local stick = Vector2.zero
local lastPanTotal = Vector2.zero
local lastPinchScale = 1

local function click(screen: Vector2)
	if InputController.onClick then
		InputController.onClick(screen)
	end
end

local function screenCenter(): Vector2
	return Camera2D.viewport / 2
end

-- Ponto da tela que o jogador está apontando; nil no toque, que não tem cursor.
function InputController.cursor(): Vector2?
	local last = UserInputService:GetLastInputType()
	if GAMEPAD_TYPES[last] then
		return screenCenter()
	elseif last == Enum.UserInputType.Touch then
		return nil
	end
	return UserInputService:GetMouseLocation()
end

function InputController.update(dt: number)
	local direction = Vector2.zero
	if not UserInputService:GetFocusedTextBox() then
		for key, vector in KEY_DIRECTIONS do
			if UserInputService:IsKeyDown(key) then
				direction += vector
			end
		end
	end
	if stick.Magnitude > STICK_DEADZONE then
		-- No analógico, Y positivo é para cima.
		direction += Vector2.new(stick.X, -stick.Y)
	end
	if direction ~= Vector2.zero then
		local move = direction * KEY_PAN_SPEED * dt
		Camera2D.panScreen(-move.X, -move.Y)
	end
end

function InputController.start()
	UserInputService.InputBegan:Connect(function(input, processed)
		if processed then
			return
		end
		if input.UserInputType == Enum.UserInputType.MouseButton1 then
			pressed = true
			dragging = false
			pressPosition = UserInputService:GetMouseLocation()
			lastPosition = pressPosition
		elseif GAMEPAD_TYPES[input.UserInputType] then
			if input.KeyCode == Enum.KeyCode.ButtonA then
				click(screenCenter())
			elseif input.KeyCode == Enum.KeyCode.ButtonR2 then
				Camera2D.zoomAt(screenCenter(), 1)
			elseif input.KeyCode == Enum.KeyCode.ButtonL2 then
				Camera2D.zoomAt(screenCenter(), -1)
			end
		end
	end)

	UserInputService.InputChanged:Connect(function(input, processed)
		if input.UserInputType == Enum.UserInputType.MouseMovement then
			if not pressed then
				return
			end
			local position = UserInputService:GetMouseLocation()
			if not dragging and (position - pressPosition).Magnitude > DRAG_THRESHOLD then
				dragging = true
			end
			if dragging then
				Camera2D.panScreen(position.X - lastPosition.X, position.Y - lastPosition.Y)
			end
			lastPosition = position
		elseif input.UserInputType == Enum.UserInputType.MouseWheel then
			if not processed then
				Camera2D.zoomAt(UserInputService:GetMouseLocation(), if input.Position.Z > 0 then 1 else -1)
			end
		elseif GAMEPAD_TYPES[input.UserInputType] and input.KeyCode == Enum.KeyCode.Thumbstick1 then
			stick = Vector2.new(input.Position.X, input.Position.Y)
		end
	end)

	UserInputService.InputEnded:Connect(function(input)
		if input.UserInputType == Enum.UserInputType.MouseButton1 and pressed then
			pressed = false
			if not dragging then
				click(UserInputService:GetMouseLocation())
			end
		end
	end)

	UserInputService.TouchPan:Connect(function(_, totalTranslation, _, state)
		if state == Enum.UserInputState.Begin then
			lastPanTotal = Vector2.zero
		end
		local delta = totalTranslation - lastPanTotal
		lastPanTotal = totalTranslation
		Camera2D.panScreen(delta.X, delta.Y)
	end)

	UserInputService.TouchPinch:Connect(function(_, scale, _, state)
		if state == Enum.UserInputState.Begin then
			lastPinchScale = 1
		end
		local ratio = scale / lastPinchScale
		if math.abs(ratio - 1) >= PINCH_STEP then
			lastPinchScale = scale
			Camera2D.zoomAt(screenCenter(), if ratio > 1 then 1 else -1)
		end
	end)

	-- As posições de toque não contam a barra superior; o ScreenGui (IgnoreGuiInset) conta.
	UserInputService.TouchTap:Connect(function(positions, processed)
		if not processed and positions[1] then
			click(positions[1] + GuiService:GetGuiInset())
		end
	end)
end

return InputController
