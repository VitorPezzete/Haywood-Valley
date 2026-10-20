// As ações de cada painel vistas de fora, para o comando `simular` do canal e o autoteste: cada painel montado
// registra as funções que os cliques dele chamam (pincel numa célula, desfazer, salvar...), e quem simula chama a
// mesma função que o clique chamaria. Só existe enquanto o painel está montado (o cleanup tira o registro).
export type AcaoSimulada = (args: Record<string, unknown>) => unknown;

const registros = new Map<string, Record<string, AcaoSimulada>>();

/** O painel registra as ações ao montar; a função devolvida as tira (chamar no cleanup do painel). */
export function registrarAcoes(ferramenta: string, acoes: Record<string, AcaoSimulada>): () => void {
	registros.set(ferramenta, acoes);
	return () => {
		if (registros.get(ferramenta) === acoes) registros.delete(ferramenta);
	};
}

export function acoesDe(ferramenta: string): Record<string, AcaoSimulada> | undefined {
	return registros.get(ferramenta);
}

/** Os nomes das ações registradas por ferramenta (para a mensagem de erro de uma ação que não existe). */
export function listaDeAcoes(ferramenta: string): string[] {
	const acoes = registros.get(ferramenta);
	const nomes = new Array<string>();
	if (acoes) for (const [nome] of pairs(acoes)) nomes.push(nome as string);
	nomes.sort();
	return nomes;
}

/** Espera o painel registrar as ações (a montagem é síncrona, mas o canal pode chegar antes). Yielda. */
export function esperarAcoes(ferramenta: string, segundos = 5): Record<string, AcaoSimulada> | undefined {
	const limite = os.clock() + segundos;
	let acoes = registros.get(ferramenta);
	while (!acoes && os.clock() < limite) {
		task.wait(0.1);
		acoes = registros.get(ferramenta);
	}
	return acoes;
}

/** Lê um número inteiro de `args` (erro claro se faltar). */
export function argNumero(args: Record<string, unknown>, nome: string): number {
	const v = args[nome];
	if (!typeIs(v, "number")) error(`falta o número ${nome}`, 0);
	return v;
}

export function argTexto(args: Record<string, unknown>, nome: string): string {
	const v = args[nome];
	if (!typeIs(v, "string") || v === "") error(`falta o texto ${nome}`, 0);
	return v;
}
