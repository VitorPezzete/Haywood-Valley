// "Teleportar" durante o Play: o jogo lê InteriorTeste e InteriorTesteCelula uma vez, no começo, então mudar o
// atributo na sessão de Play não move ninguém, e a mudança some no Stop. O que dá para fazer é deixar o próximo
// teste pronto: gravar os dois atributos no place da edição.
//
// Como o clique pode vir da instância do plugin que roda dentro do Play (que não enxerga o place da edição), o
// pedido fica guardado em plugin:SetSetting (as configurações são um arquivo, compartilhado entre as sessões), e
// a instância da edição o aplica: ao carregar e enquanto o painel Servidor está aberto, de segundo em segundo.
import { gravarAtributo, ATRIBUTO_INTERIOR_CELULA, ATRIBUTO_INTERIOR_TESTE } from "./atributos";
import { modoAtual } from "./execucao";

const CHAVE = "diorama.servidor.teleportePendente";

export interface Teleporte {
	mapa: string;
	/** "x,y" ou vazio (o começo do gerador). */
	celula: string;
	/** os.time() de quando foi pedido. */
	quando: number;
}

export function pendente(plugin: Plugin): Teleporte | undefined {
	const [ok, valor] = pcall(() => plugin.GetSetting(CHAVE));
	if (!ok || !typeIs(valor, "table")) return undefined;
	const t = valor as Partial<Teleporte>;
	if (!typeIs(t.mapa, "string") || t.mapa === "") return undefined;
	return { mapa: t.mapa, celula: typeIs(t.celula, "string") ? t.celula : "", quando: typeIs(t.quando, "number") ? t.quando : 0 };
}

function esquecer(plugin: Plugin) {
	pcall(() => plugin.SetSetting(CHAVE, undefined));
}

/** Grava os atributos no Workspace desta sessão. */
function gravarAgora(t: Teleporte): { ok: boolean; mensagem: string } {
	const r1 = gravarAtributo(ATRIBUTO_INTERIOR_TESTE, t.mapa);
	if (!r1.ok) return { ok: false, mensagem: r1.mensagem ?? "erro" };
	const r2 = gravarAtributo(ATRIBUTO_INTERIOR_CELULA, t.celula !== "" ? t.celula : undefined);
	if (!r2.ok) return { ok: false, mensagem: r2.mensagem ?? "erro" };
	return { ok: true, mensagem: r1.mensagem ?? r2.mensagem ?? "" };
}

/**
 * Pede o teleporte: na edição, grava na hora; no Play, guarda para a edição aplicar. Devolve a mensagem para o
 * painel.
 */
export function teleportar(plugin: Plugin, mapa: string, celula: string): { ok: boolean; mensagem: string } {
	const t: Teleporte = { mapa, celula, quando: os.time() };
	if (modoAtual() === "edicao") {
		const r = gravarAgora(t);
		if (!r.ok) return r;
		return { ok: true, mensagem: `Próximo teste: ${mapa}${celula !== "" ? ` em ${celula}` : ""}. ${r.mensagem}`.gsub("%s+$", "")[0] };
	}
	const [ok, erro] = pcall(() => plugin.SetSetting(CHAVE, t));
	if (!ok) return { ok: false, mensagem: `não deu para guardar o pedido: ${tostring(erro)}` };
	// Grava também nesta sessão, para o caso de o jogo reler (não relê hoje), e para o painel mostrar.
	gravarAgora(t);
	return {
		ok: true,
		mensagem: `Guardado para o próximo teste: ${mapa}${celula !== "" ? ` em ${celula}` : ""}. A edição aplica ao Stop (ou abra o Servidor lá).`,
	};
}

/**
 * Na edição: aplica o pedido guardado, se houver, e o esquece. Devolve a mensagem quando aplicou. Chamar ao abrir
 * o painel e de tempos em tempos enquanto ele está aberto.
 */
export function aplicarPendente(plugin: Plugin): string | undefined {
	if (modoAtual() !== "edicao") return undefined;
	const t = pendente(plugin);
	if (!t) return undefined;
	const r = gravarAgora(t);
	if (!r.ok) {
		warn(`[Diorama] teleporte pendente não aplicado: ${r.mensagem}`);
		return undefined;
	}
	esquecer(plugin);
	const texto = `Teleporte aplicado: ${ATRIBUTO_INTERIOR_TESTE} = ${t.mapa}${t.celula !== "" ? `, ${ATRIBUTO_INTERIOR_CELULA} = ${t.celula}` : ""}.`;
	print(`[Diorama] ${texto}`);
	return texto;
}

/** Descarta o pedido guardado. */
export function descartarPendente(plugin: Plugin) {
	esquecer(plugin);
}
