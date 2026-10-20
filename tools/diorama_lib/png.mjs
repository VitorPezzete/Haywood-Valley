// Leitura e escrita de PNG com o pngjs (devDependency). Devolve { width, height, data } com RGBA cru.
import fs from "node:fs";
import { PNG } from "pngjs";

export function lerPng(caminho) {
	const png = PNG.sync.read(fs.readFileSync(caminho));
	return { width: png.width, height: png.height, data: png.data };
}

export function gravarPng(caminho, imagem) {
	const png = new PNG({ width: imagem.width, height: imagem.height });
	imagem.data.copy(png.data);
	fs.writeFileSync(caminho, PNG.sync.write(png));
}

/** Cor RGBA do pixel (x, y) como [r, g, b, a]. */
export function pixel(imagem, x, y) {
	const i = (y * imagem.width + x) * 4;
	return [imagem.data[i], imagem.data[i + 1], imagem.data[i + 2], imagem.data[i + 3]];
}
