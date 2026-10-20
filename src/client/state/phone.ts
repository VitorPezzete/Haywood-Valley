import { atom } from "@rbxts/charm";

/**
 * A prévia de celular (ferramenta de desenvolvimento, `DevToolsController`): o tamanho da tela de um celular, em
 * pixels do `ViewportSize` dele (o Roblox mede a tela do celular em pontos: 844 × 390 num iPhone comum), ou nada
 * com a prévia desligada. Com ela, a câmera escolhe o zoom e a interface escolhe o `k` como no celular, e tudo é
 * mostrado ampliado por um número inteiro (`phoneScale`) num retângulo no meio da tela, com o resto coberto.
 */
export const phonePreview = atom<Vector2 | undefined>(undefined);

/** A tela de celular comum da prévia: 844 × 390 pontos (iPhone 12 a 15, deitado). */
export const DEFAULT_PHONE = new Vector2(844, 390);

/** Quantos pixels físicos da tela de agora valem um pixel da tela do celular: o maior inteiro que cabe. */
export function phoneScale(phone: Vector2, physical: Vector2) {
	return math.max(1, math.floor(math.min(physical.X / phone.X, physical.Y / phone.Y)));
}

/** O tamanho de celular pedido num atributo: "844x390" (ou true, o comum), ou nada. */
export function parsePhone(value: unknown) {
	if (value === true) return DEFAULT_PHONE;
	if (!typeIs(value, "string")) return undefined;
	const [w, h] = value.match("^%s*(%d+)%s*[xX×]%s*(%d+)%s*$");
	const width = tonumber(w);
	const height = tonumber(h);
	if (width === undefined || height === undefined || width < 200 || height < 150) return undefined;
	return new Vector2(width, height);
}
