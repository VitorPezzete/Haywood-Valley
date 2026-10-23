import { ART_PX_PER_STUD } from "./view";

/**
 * O avatar do Roblox tem uns 5 studs de altura; nesta escala fica com cerca de 40 pixels de arte,
 * e uns 16 de largura, perto dos 14 do boneco desenhado por cima dele.
 */
export const CHARACTER_SCALE = 8 / ART_PX_PER_STUD;
/**
 * O passo do Graal, em pixels de arte por segundo: 0,5 tile por quadro (o padrão do
 * `player.defaultwalkspeed`, segundo o Stefan, criador do Graal, nos fóruns da GraalOnline), a 20
 * quadros por segundo (o cliente do Graal anda em quadros de 0,05 s, o mesmo tempo de cada quadro do
 * walk.gani): 10 tiles de 16 pixels por segundo. Pedido do usuário em 2026-10-17; antes era a metade.
 */
export const WALK_PX_PER_SECOND = 160;
/** Em studs por segundo, andando de lado; na direção da câmera o `MovementController` compensa a inclinação. */
export const WALK_SPEED = WALK_PX_PER_SECOND / ART_PX_PER_STUD;

/**
 * A altura da raiz de quem está em pé no piso (o topo do piso invisível é Y = 0): a altura do quadril mais meia raiz,
 * 0,75 stud na escala de 25%. Quem leva o personagem a outro lugar usa esta altura, para ele não cair do alto (o
 * nascer padrão do Roblox, sem `SpawnLocation`, é em Y = 100: 1 s de queda, medido em 2026-10-23).
 */
export function standingHeight(character: Model) {
	const root = character.FindFirstChild("HumanoidRootPart");
	const humanoid = character.FindFirstChildOfClass("Humanoid");
	if (!root?.IsA("BasePart") || !humanoid) return 1;
	return humanoid.HipHeight + root.Size.Y / 2;
}
