// A parte do autoteste do Catálogo que confere a seção "Recorte e cores" (etapa G, ui/recortePeca.tsx): abre o
// recorte de uma peça com partes, confere que o original, o recorte, a base e cada máscara montaram em EditableImage
// (pixels opacos lidos de volta > 0), que escolher uma cor muda o ImageColor3 da máscara na prévia e que "Restaurar
// cores" a esconde; depois, que uma luz não oferece o seletor e que uma peça sem recorte diz para rodar o
// tools/recortes.py. Só lê: nada é gravado. No fim, volta à peça que estava selecionada.
import type { Conferencia } from "./autoteste";
import type { Peca } from "./catalogo/formato";
import { motivoNaoPintavel, recorteDaPeca } from "./catalogo/recortes";
import { AcaoSimulada, esperarAcoes } from "./simulacao";
import type { EstadoRecorte } from "./ui/recortePeca";

/** A peça do teste: o sofá dourado, se estiver no catálogo; senão a primeira pintável com 2 partes ou mais; senão a primeira com recorte. */
export function pecaDoTesteRecorte(pecas: ReadonlyArray<Peca>): Peca | undefined {
	const comRecorte = pecas.filter((p) => recorteDaPeca(p) !== undefined);
	return (
		comRecorte.find((p) => p.id === "sofa_dourado") ??
		comRecorte.find((p) => motivoNaoPintavel(p, pecas) === undefined && recorteDaPeca(p)!.partes.size() >= 2) ??
		comRecorte[0]
	);
}

export function conferenciasRecorte(lista: Conferencia[], pecas: ReadonlyArray<Peca>) {
	const conferir = (nome: string, ok: boolean, detalhe: string) => lista.push({ nome, ok, detalhe });
	const acoes = esperarAcoes("catalogo");
	if (!acoes) return conferir("recorte", false, "o painel Catálogo não registrou as ações");
	const chamar = (nome: string, args: Record<string, unknown> = {}) => (acoes[nome] as AcaoSimulada)(args);
	const estadoCatalogo = () => chamar("estado") as { selecionada?: string; ocupado: boolean };
	const limite = os.clock() + 10;
	while (estadoCatalogo().ocupado && os.clock() < limite) task.wait(0.1);
	const antes = estadoCatalogo().selecionada;

	const peca = pecaDoTesteRecorte(pecas);
	if (!peca) return conferir("recorte", false, "nenhuma peça de pecas.json tem `recorte` (rode python tools/recortes.py)");
	const recorte = recorteDaPeca(peca)!;

	chamar("selecionar", { id: peca.id });
	const e = chamar("recorte") as EstadoRecorte;
	const mascaras = e.partes.map((p) => `${p.n}:${p.mascara}`).join(" ");
	conferir(
		`recorte de ${peca.id}: montou`,
		e.situacao === "pronto" &&
			(e.original ?? 0) > 0 &&
			(e.recorte ?? 0) > 0 &&
			(e.base ?? 0) > 0 &&
			e.partes.size() === recorte.partes.size() &&
			e.partes.every((p) => p.mascara > 0),
		`${e.situacao}${e.erro !== undefined ? ` (${e.erro})` : ""}; opacos: original ${e.original}, recorte ${e.recorte}, base ${e.base}, máscaras ${mascaras === "" ? "nenhuma" : mascaras} (${recorte.partes.size()} no catálogo)${e.avisos.size() > 0 ? `; avisos: ${e.avisos.join("; ")}` : ""}`,
	);

	if (e.situacao === "pronto" && e.partes.size() > 0 && e.nao_pintavel === undefined) {
		const n = e.partes[0].n;
		const azul = chamar("recorte_cor", { n, cor: "#2E86DE" }) as EstadoRecorte;
		const pa = azul.partes.find((p) => p.n === n);
		const vinho = chamar("recorte_cor", { n, cor: "#802038" }) as EstadoRecorte;
		const pv = vinho.partes.find((p) => p.n === n);
		const restaurado = chamar("recorte_restaurar") as EstadoRecorte;
		const pr = restaurado.partes.find((p) => p.n === n);
		conferir(
			`recorte de ${peca.id}: trocar a cor da parte ${n}`,
			pa?.image_color3 === "#2e86de" && pa.visivel === true && pv?.image_color3 === "#802038" && pr?.visivel === false && pr.cor === undefined,
			`azul → ImageColor3 ${pa?.image_color3} (visível ${pa?.visivel}); vinho → ${pv?.image_color3}; restaurar → visível ${pr?.visivel}, cor ${pr?.cor ?? "original"}`,
		);
	} else if (e.situacao === "pronto") {
		conferir(`recorte de ${peca.id}: trocar a cor`, true, `pulado: ${e.nao_pintavel ?? "sem parte pintável"}`);
	}

	// Uma luz: monta, mas não se pinta.
	const luz = pecas.find((p) => recorteDaPeca(p) !== undefined && motivoNaoPintavel(p, pecas) !== undefined && recorteDaPeca(p)!.partes.size() > 0);
	if (luz) {
		chamar("selecionar", { id: luz.id });
		const el = chamar("recorte") as EstadoRecorte;
		const [recusou] = pcall(() => chamar("recorte_cor", { n: el.partes[0]?.n ?? 1, cor: "#2e86de" }));
		conferir(
			`recorte de ${luz.id}: luz não pintável`,
			el.situacao === "pronto" && el.nao_pintavel !== undefined && !recusou,
			`${el.situacao}; ${el.nao_pintavel ?? "pintável (devia ser luz)"}; pintar ${recusou ? "aceitou (devia recusar)" : "recusado"}`,
		);
	}

	// Uma peça sem recorte (o tapete).
	const sem = pecas.find((p) => recorteDaPeca(p) === undefined);
	if (sem) {
		chamar("selecionar", { id: sem.id });
		const es = chamar("recorte") as EstadoRecorte;
		conferir(`recorte de ${sem.id}: sem recorte`, es.situacao === "sem", `${es.situacao}`);
	}

	if (antes !== undefined) pcall(() => chamar("selecionar", { id: antes }));
}
