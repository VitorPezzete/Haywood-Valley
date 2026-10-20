// Os balões de reação, na folha de rostos do boneco do Cozy People (cozy_faces.png, de
// tools/cozy_faces.py). O resto daquele boneco está em legacy/cozy-people/characterArt.ts.txt.
import { BUBBLE_COLUMNS, BUBBLE_ORIGIN, BUBBLE_SIZE } from "shared/faces";
import { ASSETS } from "shared/assets";

/**
 * Folha de rostos (cozy_faces.png), montada por tools/cozy_faces.py: as peças de olhos, bocas e
 * efeitos em tiras e, embaixo, os balões de reação. O id no registro (boneco.rostos).
 */
export const FACE_SHEET = ASSETS["boneco.rostos"];

export const BUBBLE_FRAME = new Vector2(BUBBLE_SIZE, BUBBLE_SIZE);

/** Canto do balão `bubble` na folha de rostos. */
export function bubbleOffset(bubble: number) {
	return BUBBLE_ORIGIN.add(
		new Vector2((bubble % BUBBLE_COLUMNS) * BUBBLE_SIZE, math.floor(bubble / BUBBLE_COLUMNS) * BUBBLE_SIZE),
	);
}
