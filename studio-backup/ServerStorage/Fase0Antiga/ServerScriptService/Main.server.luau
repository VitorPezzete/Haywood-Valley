local Players = game:GetService("Players")

-- O jogo é todo em ScreenGui; o personagem 3D do Roblox não é usado.
Players.CharacterAutoLoads = false

require(script.Parent.Services.PlotService).start()
