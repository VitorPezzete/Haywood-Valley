import { ART_PX_PER_STUD } from "./view";

/**
 * O avatar do Roblox tem uns 5 studs de altura; nesta escala fica com cerca de 40 pixels de arte,
 * e uns 16 de largura, perto dos 14 do boneco desenhado por cima dele.
 */
export const CHARACTER_SCALE = 8 / ART_PX_PER_STUD;
/** Em studs por segundo: 80 pixels de arte por segundo, cinco células de 16 pixels. */
export const WALK_SPEED = 80 / ART_PX_PER_STUD;
