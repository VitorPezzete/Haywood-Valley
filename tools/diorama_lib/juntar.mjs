// Junta células vizinhas em retângulos que viram uma imagem só, como `mergeCells` de src/client/world/interior.ts:
// em ordem de leitura, cada célula livre cresce para a direita enquanto a vizinha é contígua na folha, depois para
// baixo enquanto a linha inteira é contígua; se o tile é de uma cor só, tenta também crescer entre tiles da mesma
// cor (que o jogo desenha esticando o miolo de um deles) e fica com o maior dos dois retângulos. Guloso.

/**
 * `tileEm(x, y)` devolve o tile da célula (ou undefined); `contiguo(a, b, dc, dl)` diz se `b` é o tile `a` deslocado
 * `dc` colunas e `dl` linhas na folha; `corDe(tile)` devolve a cor de um tile de uma cor só (ou undefined).
 * Devolve [{ x, y, w, h, tile, chapado }] na ordem em que os retângulos nasceram.
 */
export function juntarCelulas(width, height, tileEm, contiguo, corDe = () => undefined) {
	const usadas = new Set();
	const retangulos = [];
	const livre = (x, y) => x < width && y < height && !usadas.has(y * width + x);
	const segue = (tile, x, y, dc, dl) => {
		if (!livre(x, y)) return false;
		const outro = tileEm(x, y);
		return outro !== undefined && contiguo(tile, outro, dc, dl);
	};
	const mesmaCor = (tile, cor, x, y) => {
		if (!livre(x, y)) return false;
		const outro = tileEm(x, y);
		return outro !== undefined && corDe(outro) === cor && contiguo(tile, outro, 0, 0, true);
	};
	const crescer = (cabe, x, y) => {
		let w = 1;
		while (cabe(x + w, y, w, 0)) w++;
		let h = 1;
		let mais = true;
		while (mais) {
			for (let i = 0; i < w && mais; i++) mais = cabe(x + i, y + h, i, h);
			if (mais) h++;
		}
		return [w, h];
	};
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (usadas.has(y * width + x)) continue;
			const tile = tileEm(x, y);
			if (!tile) continue;
			const [cw, ch] = crescer((cx, cy, i, j) => segue(tile, cx, cy, i, j), x, y);
			let retangulo = { x, y, w: cw, h: ch, tile, chapado: false };
			const cor = corDe(tile);
			if (cor !== undefined) {
				const [fw, fh] = crescer((cx, cy) => mesmaCor(tile, cor, cx, cy), x, y);
				if (fw * fh > cw * ch) retangulo = { x, y, w: fw, h: fh, tile, chapado: true };
			}
			for (let j = 0; j < retangulo.h; j++) {
				for (let i = 0; i < retangulo.w; i++) usadas.add((y + j) * width + x + i);
			}
			retangulos.push(retangulo);
		}
	}
	return retangulos;
}
