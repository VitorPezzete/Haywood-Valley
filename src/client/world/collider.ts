import { ART_PX_PER_STUD, GROUND_STUDS_PER_PX, SCREEN_RIGHT, TOWARD_CAMERA, groundOffset } from "shared/view";

const HEIGHT = 3;

/**
 * Bloqueio invisível no pé de um objeto. `footprint` é a área que ele ocupa no chão, em pixels de
 * arte na tela: largura e profundidade, a partir da base do sprite para trás.
 */
export function createCollider(parent: Instance, name: string, position: Vector3, footprint: Vector2) {
	const part = new Instance("Part");
	part.Name = `${name}Collider`;
	part.Anchored = true;
	part.CanQuery = false;
	part.CanTouch = false;
	part.CastShadow = false;
	part.Transparency = 1;
	part.Size = new Vector3(footprint.X / ART_PX_PER_STUD, HEIGHT, footprint.Y * GROUND_STUDS_PER_PX);
	const center = position.add(groundOffset(0, -footprint.Y / 2)).add(new Vector3(0, HEIGHT / 2, 0));
	// Alinhado com a tela: X para a direita, Z para o lado da câmera.
	part.CFrame = CFrame.fromMatrix(center, SCREEN_RIGHT, Vector3.yAxis, TOWARD_CAMERA);
	part.Parent = parent;
	return part;
}
