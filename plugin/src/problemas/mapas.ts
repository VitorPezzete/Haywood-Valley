// Diagnóstico dos mapas (GET /mapas e GET /mapas/<id>, bloco a bloco), antes de salvar e gerar: o que o jogo
// só avisa em tempo de jogo (seções 12.9, 12.17, 12.19 e 12.20 da especificação) sai aqui como lista.
//
// Por bloco: id de mapa inválido; folha desconhecida (na lista do bloco e nas células); tile fora da folha;
// célula fora do bloco; nascimento fora do bloco, em cima de um morador ou num tile que bloqueia (zona copiada
// em zonas.ts, palpite); entradas com nome inválido ou repetido; saída para mapa desconhecido, chegada com nome
// que o destino não tem ou célula fora do bloco, retângulo fora do bloco; zona sem área ou com área fora do bloco;
// morador com visual que decodeSavedLook recusaria (visual.ts), pose ou direção desconhecida, célula repetida.
import type { Bloco, Celula, Mapa } from "../ponte";
import { dentroDoBloco, idValido, LADO_DO_BLOCO, nomeDeEntradaValido, Problema, tileDentroDaFolha } from "./tipos";
import { validarVisual } from "./visual";
import { zonaBloqueia, zonaDoTile } from "./zonas";

const CAMADAS: Array<keyof Bloco["camadas"]> = ["chao", "objeto", "frente"];
const POSES = ["idle", "sit", "lie"];

/** Os nomes das entradas de todos os blocos de cada mapa, para conferir as chegadas. */
function entradasPorMapa(mapas: Mapa[]): Map<string, Set<string>> {
	const resultado = new Map<string, Set<string>>();
	for (const mapa of mapas) {
		const nomes = new Set<string>();
		for (const bloco of mapa.blocos) {
			for (const entrada of bloco.conteudo?.entradas ?? []) {
				if (typeIs(entrada.nome, "string")) nomes.add(entrada.nome);
			}
		}
		resultado.set(mapa.id, nomes);
	}
	return resultado;
}

export function verificarMapas(mapas: Mapa[], folhasConhecidas: ReadonlySet<string>): Problema[] {
	const problemas = new Array<Problema>();
	const ids = new Set<string>();
	for (const mapa of mapas) ids.add(mapa.id);
	const entradas = entradasPorMapa(mapas);
	for (const mapa of mapas) {
		const onde = `mapa ${mapa.id}`;
		if (!idValido(mapa.id)) {
			problemas.push({ gravidade: "erro", grupo: "mapas", onde, oQue: "id de mapa inválido.", comoCorrigir: "Só letras minúsculas, números e _ (a pasta em diorama/mapas e o módulo gerado usam o id)." });
		}
		if (mapa.blocos.size() === 0) {
			problemas.push({ gravidade: "info", grupo: "mapas", onde, oQue: "o mapa não tem nenhum bloco gravado.", comoCorrigir: "Pinte e salve o bloco 0_0 no editor de Mapas; o jogo só recebe o 0_0." });
		}
		const listados = mapa.mapa?.blocos ?? [];
		for (const [bx, by] of listados) {
			if (!mapa.blocos.some((b) => b.bloco[0] === bx && b.bloco[1] === by)) {
				problemas.push({ gravidade: "aviso", grupo: "mapas", onde: `${onde}, mapa.json`, oQue: `o bloco ${bx}_${by} está na lista, mas não tem arquivo.`, comoCorrigir: "Salve o bloco de novo ou tire-o da lista em mapa.json." });
			}
		}
		if (!mapa.blocos.some((b) => b.bloco[0] === 0 && b.bloco[1] === 0) && mapa.blocos.size() > 0) {
			problemas.push({ gravidade: "aviso", grupo: "mapas", onde, oQue: "não há o bloco 0_0, o único que o jogo recebe.", comoCorrigir: "Pinte o mapa no bloco 0_0." });
		}
		for (const { bloco, conteudo } of mapa.blocos) {
			const prefixo = `${onde}, bloco ${bloco[0]}_${bloco[1]}`;
			const [ok, erro] = pcall(() => verificarBloco(prefixo, mapa.id, conteudo, ids, entradas, folhasConhecidas, problemas));
			if (!ok) {
				problemas.push({ gravidade: "erro", grupo: "mapas", onde: prefixo, oQue: `o bloco não pôde ser lido: ${tostring(erro)}.`, comoCorrigir: "O JSON está fora do formato 1 (ARQUITETURA.md)." });
			}
		}
	}
	return problemas;
}

function verificarBloco(
	onde: string,
	idDoMapa: string,
	bloco: Bloco | undefined,
	mapasConhecidos: ReadonlySet<string>,
	entradasDosMapas: ReadonlyMap<string, Set<string>>,
	folhasConhecidas: ReadonlySet<string>,
	problemas: Problema[],
) {
	const erro = (lugar: string, oQue: string, comoCorrigir: string) => problemas.push({ gravidade: "erro", grupo: "mapas", onde: lugar, oQue, comoCorrigir });
	const aviso = (lugar: string, oQue: string, comoCorrigir: string) => problemas.push({ gravidade: "aviso", grupo: "mapas", onde: lugar, oQue, comoCorrigir });
	if (!typeIs(bloco, "table")) {
		erro(onde, "o arquivo do bloco está vazio ou não é JSON.", "Salve o bloco de novo pelo editor.");
		return;
	}
	if (bloco.versao !== 1) aviso(onde, `versão ${tostring(bloco.versao)} (o plugin conhece a 1).`, "Abra e salve de novo no editor.");
	if (bloco.mapa !== idDoMapa) erro(onde, `o campo "mapa" diz "${tostring(bloco.mapa)}", mas a pasta é "${idDoMapa}".`, "O bloco foi copiado de outro mapa; salve-o de novo pelo editor.");

	// Folhas.
	const folhasDoBloco = new Set<string>();
	for (const folha of typeIs(bloco.folhas, "table") ? bloco.folhas : []) {
		if (!typeIs(folha, "string")) continue;
		folhasDoBloco.add(folha);
		if (!folhasConhecidas.has(folha)) {
			erro(onde, `a folha "${folha}" não existe em diorama/folhas.`, `Folhas conhecidas: ${[...folhasConhecidas].join(", ")}. O jogo avisaria "folha desconhecida" ao montar.`);
		}
	}
	const conferirTile = (lugar: string, folha: unknown, coluna: unknown, linha: unknown) => {
		if (!typeIs(folha, "string")) {
			erro(lugar, `folha "${tostring(folha)}" não é um nome.`, "Cada tile é [folha, coluna, linha].");
			return;
		}
		if (!folhasConhecidas.has(folha)) erro(lugar, `folha "${folha}" desconhecida.`, "Use uma folha de diorama/folhas.");
		else if (!folhasDoBloco.has(folha)) aviso(lugar, `a folha "${folha}" não está na lista "folhas" do bloco.`, "Salve o bloco de novo; o editor refaz a lista.");
		if (!tileDentroDaFolha(coluna, linha)) {
			erro(lugar, `tile [${folha}, ${tostring(coluna)}, ${tostring(linha)}] fora da folha (coluna 0–127, linha 0–31).`, "Repinte a célula com um tile da folha.");
		}
	};
	if (typeIs(bloco.vazio, "table")) conferirTile(`${onde}, vazio`, bloco.vazio[0], bloco.vazio[1], bloco.vazio[2]);
	else erro(onde, "falta o tile \"vazio\" (o fundo do canvas).", "Salve o bloco de novo; o editor põe [folha, 0, 2].");

	// Camadas: o tile de cima de cada célula, para o nascimento.
	const tileDeCima = new Map<string, Celula>();
	const camadas = typeIs(bloco.camadas, "table") ? bloco.camadas : {};
	for (const nome of CAMADAS) {
		const celulas = camadas[nome];
		if (celulas === undefined) continue;
		if (!typeIs(celulas, "table")) {
			erro(`${onde}, camada ${nome}`, "a camada não é uma lista.", "Salve o bloco de novo.");
			continue;
		}
		let forasDoBloco = 0;
		let forasDaFolha = 0;
		celulas.forEach((celula, indice) => {
			if (!typeIs(celula, "table") || celula.size() < 5) {
				erro(`${onde}, camada ${nome}, célula ${indice + 1}`, "célula fora do formato [x, y, folha, coluna, linha].", "Salve o bloco de novo.");
				return;
			}
			const [x, y, folha, coluna, linha] = celula;
			if (!dentroDoBloco(x, y)) {
				forasDoBloco += 1;
				return;
			}
			if (!typeIs(folha, "string") || !folhasConhecidas.has(folha) || !tileDentroDaFolha(coluna, linha)) {
				forasDaFolha += 1;
				if (forasDaFolha <= 3) conferirTile(`${onde}, camada ${nome}, célula (${x}, ${y})`, folha, coluna, linha);
				return;
			}
			if (typeIs(folha, "string") && !folhasDoBloco.has(folha) && folhasDoBloco.size() > 0) {
				// avisado uma vez só, pela primeira célula
				folhasDoBloco.add(folha);
				aviso(`${onde}, camada ${nome}, célula (${x}, ${y})`, `a folha "${folha}" é usada mas não está na lista "folhas" do bloco.`, "Salve o bloco de novo; o editor refaz a lista.");
			}
			tileDeCima.set(`${x},${y}`, celula);
		});
		if (forasDoBloco > 0) erro(`${onde}, camada ${nome}`, `${forasDoBloco} célula(s) fora do bloco (0 a ${LADO_DO_BLOCO - 1}).`, "A ponte recusa isso no PUT; o arquivo foi editado à mão. Salve de novo pelo editor.");
		if (forasDaFolha > 3) erro(`${onde}, camada ${nome}`, `${forasDaFolha} célula(s) com tile fora da folha ou folha desconhecida (só as 3 primeiras estão listadas).`, "Repinte essas células.");
	}

	// Moradores (antes do nascimento, para saber as células ocupadas).
	const celulasDosMoradores = new Map<string, string>();
	const moradores = typeIs(bloco.moradores, "table") ? bloco.moradores : [];
	moradores.forEach((morador, indice) => {
		const nome = typeIs(morador.nome, "string") && morador.nome !== "" ? morador.nome : `morador ${indice + 1}`;
		const lugar = `${onde}, morador ${nome}`;
		if (!typeIs(morador.nome, "string") || morador.nome === "") aviso(lugar, "morador sem nome.", "Dê um nome próprio; ele vai para o diálogo.");
		if (!dentroDoBloco(morador.x, morador.y)) {
			erro(lugar, `célula (${tostring(morador.x)}, ${tostring(morador.y)}) fora do bloco.`, "Ponha o morador numa célula de 0 a 63.");
		} else {
			const chave = `${morador.x},${morador.y}`;
			const outro = celulasDosMoradores.get(chave);
			if (outro !== undefined) erro(lugar, `na mesma célula que ${outro} (${chave}).`, "Dois moradores não cabem na mesma célula; mova um deles.");
			celulasDosMoradores.set(chave, nome);
			const tile = tileDeCima.get(chave);
			if (tile && zonaBloqueia(zonaDoTile(tile[2], tile[3], tile[4])) && morador.pose !== "sit" && morador.pose !== "lie") {
				aviso(lugar, `a célula (${chave}) tem um tile que bloqueia.`, "O morador ficaria dentro de uma parede ou móvel; mova-o para o piso.");
			}
		}
		if (!typeIs(morador.olhando, "number") || morador.olhando < 0 || morador.olhando > 3 || morador.olhando !== math.floor(morador.olhando)) {
			aviso(lugar, `direção ${tostring(morador.olhando)} desconhecida.`, "0 cima, 1 esquerda, 2 baixo, 3 direita.");
		}
		if (morador.pose !== undefined && !POSES.includes(tostring(morador.pose))) {
			erro(lugar, `pose "${tostring(morador.pose)}" desconhecida.`, "idle (de pé), sit (sentado) ou lie (deitado).");
		}
		const visual = validarVisual(morador.visual);
		if (visual.recusa !== undefined) {
			erro(lugar, `o visual não abre: ${visual.recusa}.`, `O jogo deixaria ${nome} de fora ([Moradores]). Escolha o visual de novo na ferramenta de moradores.`);
		}
		for (const texto of visual.avisos) aviso(lugar, `visual: ${texto}.`, "O jogo aceita, mas corrige em silêncio; salve o morador de novo para limpar.");
	});

	// Nascimento.
	if (bloco.nascimento === undefined) {
		aviso(onde, "sem célula de nascimento.", "Marque o nascimento no editor; sem ele o gerador escolhe (ou o jogo cai fora do bloco).");
	} else if (!typeIs(bloco.nascimento, "table") || !dentroDoBloco(bloco.nascimento[0], bloco.nascimento[1])) {
		erro(onde, `nascimento (${tostring(bloco.nascimento[0])}, ${tostring(bloco.nascimento[1])}) fora do bloco.`, "Marque o nascimento numa célula de 0 a 63.");
	} else {
		const chave = `${bloco.nascimento[0]},${bloco.nascimento[1]}`;
		const morador = celulasDosMoradores.get(chave);
		if (morador !== undefined) erro(onde, `o nascimento (${chave}) está na célula do morador ${morador}.`, "A célula do morador bloqueia; mova o nascimento.");
		const tile = tileDeCima.get(chave);
		if (tile && zonaBloqueia(zonaDoTile(tile[2], tile[3], tile[4]))) {
			aviso(onde, `o nascimento (${chave}) está num tile que bloqueia (zona da folha).`, "O jogo avisa e cai no spawn do gerador; mova o nascimento para o piso.");
		}
	}

	// Entradas.
	const nomesDasEntradas = new Set<string>();
	const entradas = typeIs(bloco.entradas, "table") ? bloco.entradas : [];
	entradas.forEach((entrada, indice) => {
		const lugar = `${onde}, entrada ${typeIs(entrada.nome, "string") ? entrada.nome : indice + 1}`;
		if (!nomeDeEntradaValido(entrada.nome)) {
			erro(lugar, `nome "${tostring(entrada.nome)}" inválido.`, "Só letras minúsculas, números, - e _.");
		} else {
			if (nomesDasEntradas.has(entrada.nome)) erro(lugar, "nome repetido.", "Cada entrada tem um nome só; as saídas chegam por ele.");
			nomesDasEntradas.add(entrada.nome);
		}
		if (!dentroDoBloco(entrada.x, entrada.y)) erro(lugar, `célula (${tostring(entrada.x)}, ${tostring(entrada.y)}) fora do bloco.`, "Mova a entrada para dentro do bloco.");
		else {
			const tile = tileDeCima.get(`${entrada.x},${entrada.y}`);
			if (tile && zonaBloqueia(zonaDoTile(tile[2], tile[3], tile[4]))) aviso(lugar, "a célula tem um tile que bloqueia.", "Quem chega por ela cai no spawn, com aviso [Mapa]. Mova a entrada para o piso.");
		}
	});

	// Saídas.
	const saidas = typeIs(bloco.saidas, "table") ? bloco.saidas : [];
	saidas.forEach((saida, indice) => {
		const lugar = `${onde}, saída ${indice + 1}`;
		const largura = typeIs(saida.largura, "number") ? saida.largura : 1;
		const altura = typeIs(saida.altura, "number") ? saida.altura : 1;
		if (largura < 1 || altura < 1) erro(lugar, `retângulo de ${largura} × ${altura}.`, "A saída precisa de pelo menos 1 × 1 célula.");
		if (!dentroDoBloco(saida.x, saida.y) || !dentroDoBloco(saida.x + largura - 1, saida.y + altura - 1)) {
			erro(lugar, `retângulo (${tostring(saida.x)}, ${tostring(saida.y)}) ${largura} × ${altura} sai do bloco.`, "Encolha ou mova a saída.");
		}
		if (!typeIs(saida.mapa, "string") || saida.mapa === "") {
			erro(lugar, "sem mapa de destino.", "Escolha o mapa para onde a saída leva.");
			return;
		}
		// O mapa do mundo (`mundo`, MAPA_MUNDO.md §11; 2026-10-23) não é um mapa do Diorama: o servidor leva ao lote do
		// jogador (`MapService.enterWorld`). A chegada é "lote", nada (o portão do lote) ou uma célula do mundo [x, y].
		if (saida.mapa === "mundo") {
			const chegada = saida.chegada;
			const celula = typeIs(chegada, "table") ? (chegada as unknown[]) : undefined;
			const valida =
				chegada === undefined ||
				chegada === "lote" ||
				(celula !== undefined && typeIs(celula[0], "number") && typeIs(celula[1], "number") && celula[0] >= 0 && celula[1] >= 0);
			if (!valida) erro(lugar, `chegada "${tostring(chegada)}" no mundo fora do formato.`, 'No mundo, a chegada é "lote", nada (os dois: o portão do lote do jogador) ou uma célula do mundo [x, y].');
			return;
		}
		if (!mapasConhecidos.has(saida.mapa)) {
			erro(lugar, `leva ao mapa "${saida.mapa}", que não existe em diorama/mapas.`, "O servidor recusaria a saída (\"o destino não foi gerado\"). Crie o mapa ou corrija o destino.");
			return;
		}
		const chegada = saida.chegada;
		if (chegada === undefined) {
			const nomes = entradasDosMapas.get(saida.mapa);
			if (nomes && !nomes.has("entrada")) {
				aviso(lugar, `sem chegada, e "${saida.mapa}" não tem a entrada "entrada".`, "Quem passa cai no spawn do destino. Dê um nome de chegada ou crie a entrada \"entrada\" lá.");
			}
		} else if (typeIs(chegada, "string")) {
			const nomes = entradasDosMapas.get(saida.mapa);
			if (nomes && !nomes.has(chegada)) {
				erro(lugar, `a chegada "${chegada}" não existe em "${saida.mapa}".`, `Entradas de lá: ${nomes.size() > 0 ? [...nomes].join(", ") : "nenhuma"}. O jogo avisaria [Mapa] e cairia no spawn.`);
			}
		} else if (typeIs(chegada, "table")) {
			const celula = chegada as unknown[];
			if (!dentroDoBloco(celula[0], celula[1])) erro(lugar, `chegada (${tostring(celula[0])}, ${tostring(celula[1])}) fora do bloco de "${saida.mapa}".`, "Use uma célula de 0 a 63, ou o nome de uma entrada.");
		} else {
			erro(lugar, `chegada "${tostring(chegada)}" fora do formato.`, "A chegada é o nome de uma entrada, [x, y], ou nada.");
		}
	});

	// Zonas.
	const zonas = typeIs(bloco.zonas, "table") ? bloco.zonas : [];
	zonas.forEach((zona, indice) => {
		const lugar = `${onde}, zona ${typeIs(zona.nome, "string") && zona.nome !== "" ? zona.nome : indice + 1}`;
		if (!typeIs(zona.nome, "string") || zona.nome === "") aviso(lugar, "zona sem nome.", "O nome aparece no canto da tela ao entrar; dê um nome ou uma chave zone.…");
		const areas = typeIs(zona.areas, "table") ? zona.areas : [];
		if (areas.size() === 0) {
			erro(lugar, "zona sem área.", "Desenhe pelo menos um retângulo; sem área a zona nunca é encontrada.");
			return;
		}
		areas.forEach((area, i) => {
			if (!typeIs(area, "table") || area.size() < 4) {
				erro(`${lugar}, área ${i + 1}`, "área fora do formato [x0, y0, x1, y1].", "Redesenhe a área.");
				return;
			}
			const [x0, y0, x1, y1] = area;
			if (!dentroDoBloco(x0, y0) || !dentroDoBloco(x1, y1)) erro(`${lugar}, área ${i + 1}`, `[${x0}, ${y0}, ${x1}, ${y1}] sai do bloco.`, "Encolha a área para 0–63.");
			else if (x1 < x0 || y1 < y0) erro(`${lugar}, área ${i + 1}`, `[${x0}, ${y0}, ${x1}, ${y1}] está invertida.`, "O canto de cima à esquerda vem primeiro.");
		});
		const props = typeIs(zona.props, "table") ? zona.props : {};
		const ambiente = props.ambiente;
		if (ambiente !== undefined && !["casa", "exterior", "mar"].includes(ambiente)) {
			aviso(lugar, `ambiente "${ambiente}" desconhecido.`, "O jogo avisa e usa \"exterior\". Perfis: casa, exterior, mar (shared/sounds.ts).");
		}
	});

	if (bloco.carimbo === undefined || bloco.carimbo === "") {
		problemas.push({ gravidade: "info", grupo: "mapas", onde, oQue: "o bloco não tem carimbo.", comoCorrigir: "Salve pelo editor; o carimbo é como se confere no Output que o Studio tem o mapa gerado por último." });
	}
}
