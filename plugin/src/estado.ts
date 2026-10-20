// Estado compartilhado entre as ferramentas do plugin: fontes do Vide que qualquer painel lê e grava, e as leituras
// da ponte que mais de uma ferramenta faz (a lista de mapas, as imagens das folhas). Vivem no módulo (fora de
// qualquer root do Vide), então sobrevivem a abrir e fechar widgets.
import { source } from "@rbxts/vide";
import * as ponte from "./ponte";
import type { ResumoMapa, Status } from "./ponte";

export { erroPonte, ponteLigada } from "./ponte";

/** O último `GET /status` que deu certo. */
export const statusPonte = source<Status | undefined>(undefined);

/** Lista de mapas conhecida (último `GET /mapas`). */
export const mapas = source<ResumoMapa[]>([]);
/** Id do mapa aberto no editor, se houver. */
export const mapaAberto = source<string | undefined>(undefined);
/** Bloco aberto no editor, em coordenadas de bloco. */
export const blocoAberto = source<[number, number]>([0, 0]);

/** Ids (`rbxassetid://`) das duas metades de cada folha do Aeko, pelo nome da folha. */
export type ImagensFolhas = Record<string, [string, string] | undefined>;

/** As folhas que o jogo conhece hoje (INTERIOR_SHEETS). */
export const FOLHAS_DO_JOGO: ReadonlyArray<string> = ["casa", "castelo"];

/** Ids de reserva, copiados de assets/registro.json em 2026-10-20, para quando a ponte não responde. */
export const IMAGENS_RESERVA: Readonly<Record<string, [string, string]>> = {
	casa: ["rbxassetid://139000831386135", "rbxassetid://83430964706202"],
	castelo: ["rbxassetid://71605882676787", "rbxassetid://115997821513657"],
};

/** As imagens das folhas: começa com a reserva; `carregarImagensFolhas` troca pelo registro. */
export const imagensFolhas = source<ImagensFolhas>(copiarReserva());
/** Aviso da última carga das imagens ("" quando o registro tinha tudo). */
export const avisoImagens = source("");
/** Chave do registro de assets → `rbxassetid://`, da última carga (`GET /assets`). */
export const idsAssets = source<Record<string, string>>({});

function copiarReserva(): ImagensFolhas {
	const saida: ImagensFolhas = {};
	for (const folha of FOLHAS_DO_JOGO) saida[folha] = IMAGENS_RESERVA[folha];
	return saida;
}

/** Relê `GET /mapas` e atualiza `mapas`. Yielda: chamar de um task.spawn. Devolve o resultado da ponte. */
export function recarregarMapas() {
	const r = ponte.listarMapas();
	if (r.ok) mapas(r.valor);
	return r;
}

/**
 * Relê `GET /assets` e atualiza `imagensFolhas` (chaves `aeko.<folha>.<metade>`) e `idsAssets`; a folha que
 * faltar no registro fica com a reserva. Yielda. Nunca falha: sem ponte, valem as reservas e `avisoImagens` diz.
 */
export function carregarImagensFolhas() {
	const r = ponte.lerAssets();
	const novas = copiarReserva();
	const faltando = new Array<string>();
	if (r.ok) {
		idsAssets(r.valor.ids);
		for (const folha of FOLHAS_DO_JOGO) {
			const a = r.valor.ids[`aeko.${folha}.0`];
			const b = r.valor.ids[`aeko.${folha}.1`];
			if (a !== undefined && b !== undefined) novas[folha] = [a, b];
			else faltando.push(folha);
		}
	} else {
		for (const folha of FOLHAS_DO_JOGO) faltando.push(folha);
	}
	imagensFolhas(novas);
	avisoImagens(
		faltando.size() > 0
			? `Sem id no registro para ${faltando.join(", ")} (${r.ok ? "chaves aeko.<folha>.<metade> ausentes" : r.erro}); valem os ids guardados no plugin.`
			: "",
	);
	return r;
}
