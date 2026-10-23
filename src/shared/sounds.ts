// Os números do som (página "Plano de som e música" do Notion, seções 1 a 5; estudo em
// `Aseprite\sons\estudo\ESTUDO_SONS.md`): ids, recortes, volumes e distâncias. Quem toca é o cliente
// (`SoundController` e `MusicController`); nada de som passa pela rede.
//
// Os sons da biblioteca do Roblox (Pro Sound Effects, conferidos em 2026-10-18 pelo `GetProductInfo`: existem e
// são áudio) não se baixam nem se editam: só se recortam aqui (`region`, o `PlaybackRegion`; `loop`, o
// `LoopRegion`). Os recortes saíram da forma de onda (`AudioPlayer:GetWaveformAsync`), sem ouvir: conferir de
// ouvido no Studio. Som sem id (o que ainda vai ser feito no Ableton) não toca, e o Output avisa uma vez.
//
// Os ids moram no registro (assets/registro.json, chaves som.* e musica.*; `npm run assets` grava shared/assets.ts):
// aqui ficam só os recortes, os volumes e as distâncias. Som novo: a chave no registro e o uso aqui.
import { ASSETS } from "./assets";

/** O período do dia, que escolhe o ambiente e a versão da música (seção 1 do plano). */
export type Period = "manha" | "dia" | "tarde" | "noite";

/** Manhã das 5h às 8h, dia das 8h às 17h, tarde das 17h às 19h, noite das 19h às 5h. */
export function periodOf(hour: number): Period {
	if (hour >= 5 && hour < 8) return "manha";
	if (hour >= 8 && hour < 17) return "dia";
	if (hour >= 17 && hour < 19) return "tarde";
	return "noite";
}

/** Um som: o id ("" sem som ainda), o volume (0 a 10 no Roblox; aqui quase sempre abaixo de 1) e os recortes. */
export interface SoundSpec {
	id: string;
	volume: number;
	region?: [number, number];
	loop?: [number, number];
	pitch?: number;
}

/** O som que vem de um ponto do mapa: cheio até `min` studs, some de vez em `max` (`LinearSquare`). */
export interface PlacedSound extends SoundSpec {
	min: number;
	max: number;
	zoneBound: boolean;
}

// ------------------------------------------------------------------ grupos e limites (seção 5 do plano)

/** Os grupos novos, filhos do "Effects" das Configurações: o volume de Efeitos vale para eles. */
export const AMBIENCE_GROUP = "Ambience";
export const INTERFACE_GROUP = "Interface";
/** Laços de ambiente (fundo e pelo lugar) audíveis ao mesmo tempo, no máximo: os mais altos ficam. */
export const MAX_AMBIENT_LOOPS = 4;
/** Cópias do mesmo efeito tocando juntas, no máximo: a mais velha para quando chega outra. */
export const MAX_EFFECT_COPIES = 2;
/** Os efeitos de outro jogador saem mais baixos que os do próprio. */
export const OTHER_PLAYER_VOLUME = 0.6;
/** De onde se ouvem os efeitos pelo lugar (pote, passos de outro jogador), em studs. */
export const EFFECT_MIN = 1;
export const EFFECT_MAX = 12;

// ------------------------------------------------------------------ ambiente (seção 4 do plano, seção 2 do estudo)

// "campoDia" e "campoNoite" (leva de 2026-10-23, feitos no Ableton) completam os pássaros e os grilos da biblioteca:
// folhas e gafanhotos de dia; sapos, coruja e insetos à noite.
export type AmbienceLayer = "passaros" | "grilos" | "vento" | "marLonge" | "campoDia" | "campoNoite";

/** As camadas de fundo: sem lugar, pela zona e pela hora. */
export const AMBIENCE_LAYERS: Record<AmbienceLayer, SoundSpec> = {
	passaros: { id: ASSETS["som.passaros"], volume: 1 },
	grilos: { id: ASSETS["som.grilos"], volume: 1 },
	vento: { id: ASSETS["som.vento"], volume: 1 },
	marLonge: { id: ASSETS["som.mar_longe"], volume: 1 },
	campoDia: { id: ASSETS["som.campo_dia"], volume: 1 },
	campoNoite: { id: ASSETS["som.campo_noite"], volume: 1 },
};

/** Um ambiente: o volume de cada camada em cada período (0 a 1, antes das Configurações) e se vem abafado. */
export interface AmbienceProfile {
	muffled: boolean;
	levels: Record<Period, Partial<Record<AmbienceLayer, number>>>;
}

/** Os ambientes, pela propriedade `ambiente` da zona (ou do mapa, `MAP_SOUND_PROPS`). */
export const AMBIENCE_PROFILES: Record<string, AmbienceProfile> = {
	casa: {
		muffled: true,
		levels: {
			manha: { passaros: 0.08 },
			dia: { passaros: 0.06 },
			tarde: {},
			noite: { grilos: 0.08 },
		},
	},
	exterior: {
		muffled: false,
		levels: {
			manha: { passaros: 0.35, vento: 0.15, campoDia: 0.12 },
			dia: { passaros: 0.25, vento: 0.2, campoDia: 0.18 },
			tarde: { vento: 0.2, passaros: 0.1, campoDia: 0.12 },
			noite: { grilos: 0.35, vento: 0.12, campoNoite: 0.25 },
		},
	},
	mar: {
		muffled: false,
		levels: {
			manha: { passaros: 0.35, vento: 0.15, marLonge: 0.15, campoDia: 0.08 },
			dia: { passaros: 0.25, vento: 0.2, marLonge: 0.15, campoDia: 0.1 },
			tarde: { vento: 0.2, passaros: 0.1, marLonge: 0.15, campoDia: 0.08 },
			noite: { grilos: 0.35, vento: 0.12, marLonge: 0.15, campoNoite: 0.18 },
		},
	},
};

/** O abafado de dentro de casa, no `EqualizerSoundEffect` de cada camada de fundo (em dB). */
export const MUFFLE = { low: 0, mid: -12, high: -40 };

/** Quanto leva a troca do fundo, em segundos: ao mudar de zona e ao mudar de período (troca suave, 3 a 8 s). */
export const AMBIENCE_ZONE_FADE = 3;
export const AMBIENCE_PERIOD_FADE = 8;

/**
 * As propriedades de som de cada mapa (`ambiente`, `musica`), que valem onde nenhuma zona diz outra coisa: a zona
 * da ilha não cobre a praia, e a casa de teste não tem zona. Mapa fora da lista: `exterior` com terreno, `casa` sem.
 */
export const MAP_SOUND_PROPS: Record<string, { ambiente: string; musica: string }> = {
	exterior_ilha: { ambiente: "mar", musica: "ilha" },
	casa_teste_v2_l: { ambiente: "casa", musica: "sala" },
};

// ------------------------------------------------------------------ pelo lugar (seção 4 do plano)

export const PLACED: Record<string, PlacedSound> = {
	lareira: { id: ASSETS["som.lareira"], volume: 0.6, min: 1.5, max: 10, zoneBound: true },
	torneira: {
		id: ASSETS["som.torneira"],
		volume: 0.5,
		region: [2, 13],
		loop: [2, 13],
		min: 1,
		max: 7,
		zoneBound: true,
	},
	mar: {
		id: ASSETS["som.mar"],
		volume: 0.7,
		region: [0, 10],
		loop: [0, 10],
		min: 1,
		max: 10,
		zoneBound: false,
	},
	fogao: { id: ASSETS["som.lareira"], volume: 0.3, min: 1, max: 6, zoneBound: true },
	// Leva de 2026-10-23 (Ableton): o rio (laço de 16 s) e as máquinas de produção (laço de 4 s, enquanto produzem).
	rio: { id: ASSETS["som.rio"], volume: 0.6, min: 2, max: 14, zoneBound: false },
	maquina: { id: ASSETS["som.maquina"], volume: 0.4, min: 1, max: 8, zoneBound: true },
};

// ------------------------------------------------------------------ efeitos do mundo (seção 2 do plano)

export type EffectId =
	| "porta"
	| "poteQuebra"
	| "respingo"
	| "nadar"
	| "passoAgua"
	| "torneiraAbre"
	| "torneiraFecha"
	| "passoTabua"
	| "passoGrama"
	| "passoPedra"
	| "bauAbre"
	| "bauFecha"
	| "fogaoAcende"
	| "galinha"
	| "galinhaOvo"
	| "vaca"
	| "ovelha"
	| "porco"
	| "porcoFunga"
	| "cachorro"
	| "gato"
	| "passaroPousa"
	| "passaroVoa"
	| "enxada"
	| "plantar"
	| "regar"
	| "colher"
	| "matoCorte"
	| "machado"
	| "arvoreCai"
	| "picareta"
	| "pedraQuebra"
	| "pescaLancar"
	| "pescaFisgar"
	| "pescaPuxar"
	| "pescaPegou"
	| "pegarItem"
	| "moedas"
	| "moedasMuitas"
	| "nivel";

/** Cada efeito tem uma ou mais variações, sorteadas. */
export const EFFECTS: Record<EffectId, SoundSpec[]> = {
	porta: [{ id: ASSETS["som.porta"], volume: 0.5, region: [0.1, 3.45] }],
	poteQuebra: [{ id: ASSETS["som.pote_quebra"], volume: 0.6, region: [0.1, 2.6], pitch: 0.04 }],
	respingo: [{ id: ASSETS["som.respingo"], volume: 0.7, region: [0, 1.1], pitch: 0.05 }],
	nadar: [{ id: ASSETS["som.nadar"], volume: 0.6, region: [1.25, 2.05], pitch: 0.08 }],
	passoAgua: [
		{ id: ASSETS["som.passo_agua.0"], volume: 0.8, pitch: 0.06 },
		{ id: ASSETS["som.passo_agua.1"], volume: 0.8, pitch: 0.06 },
		{ id: ASSETS["som.passo_agua.2"], volume: 0.6, pitch: 0.06 },
	],
	torneiraAbre: [{ id: ASSETS["som.torneira"], volume: 0.5, region: [0, 1.6] }],
	torneiraFecha: [{ id: ASSETS["som.torneira"], volume: 0.5, region: [14, 17.4] }],
	// Os passos feitos no Ableton (2026-10-20) vêm 4 num arquivo, um por segundo (tools/som/cortar.py, trechos).
	passoTabua: [
		{ id: ASSETS["som.passo_tabua"], volume: 0.4, region: [0, 0.175], pitch: 0.06 },
		{ id: ASSETS["som.passo_tabua"], volume: 0.4, region: [1, 1.175], pitch: 0.06 },
		{ id: ASSETS["som.passo_tabua"], volume: 0.4, region: [2, 2.175], pitch: 0.06 },
		{ id: ASSETS["som.passo_tabua"], volume: 0.4, region: [3, 3.205], pitch: 0.06 },
	],
	passoGrama: [
		{ id: ASSETS["som.passo_grama"], volume: 0.3, region: [0, 0.17], pitch: 0.06 },
		{ id: ASSETS["som.passo_grama"], volume: 0.3, region: [1, 1.175], pitch: 0.06 },
		{ id: ASSETS["som.passo_grama"], volume: 0.3, region: [2, 2.17], pitch: 0.06 },
		{ id: ASSETS["som.passo_grama"], volume: 0.3, region: [3, 3.18], pitch: 0.06 },
	],
	passoPedra: [
		{ id: ASSETS["som.passo_pedra"], volume: 0.4, region: [0, 0.145], pitch: 0.06 },
		{ id: ASSETS["som.passo_pedra"], volume: 0.4, region: [1, 1.145], pitch: 0.06 },
		{ id: ASSETS["som.passo_pedra"], volume: 0.4, region: [2, 2.145], pitch: 0.06 },
		{ id: ASSETS["som.passo_pedra"], volume: 0.4, region: [3, 3.145], pitch: 0.06 },
	],
	bauAbre: [{ id: ASSETS["som.bau_abre"], volume: 0.5, pitch: 0.05 }],
	bauFecha: [{ id: ASSETS["som.bau_fecha"], volume: 0.5, pitch: 0.05 }],
	fogaoAcende: [{ id: ASSETS["som.fogao_acende"], volume: 0.4 }],
	// Leva de 2026-10-23 (Ableton, tools/som/compor/fazenda.py): variações num arquivo só, um trecho por segundo
	// inteiro, como os passos; o fim de cada `region` é onde o som caiu 40 dB (tools/som/cortes.json, --trechos-limpos).
	// Animais: vozes sintetizadas, estilizadas; ações: camadas de percussão e síntese.
	galinha: [
		{ id: ASSETS["som.galinha"], volume: 0.5, region: [0, 0.542], pitch: 0.05 },
		{ id: ASSETS["som.galinha"], volume: 0.5, region: [1, 1.61], pitch: 0.05 },
		{ id: ASSETS["som.galinha"], volume: 0.5, region: [2, 2.837], pitch: 0.05 },
	],
	galinhaOvo: [
		{ id: ASSETS["som.galinha"], volume: 0.5, region: [3, 4.314] },
	],
	vaca: [
		{ id: ASSETS["som.vaca"], volume: 0.5, region: [0, 1.531], pitch: 0.04 },
		{ id: ASSETS["som.vaca"], volume: 0.5, region: [2, 3.425], pitch: 0.04 },
	],
	ovelha: [
		{ id: ASSETS["som.ovelha"], volume: 0.5, region: [0, 0.863], pitch: 0.04 },
		{ id: ASSETS["som.ovelha"], volume: 0.5, region: [2, 2.687], pitch: 0.04 },
	],
	porco: [
		{ id: ASSETS["som.porco"], volume: 0.5, region: [0, 0.438], pitch: 0.05 },
		{ id: ASSETS["som.porco"], volume: 0.5, region: [1, 1.615], pitch: 0.05 },
	],
	porcoFunga: [
		{ id: ASSETS["som.porco"], volume: 0.4, region: [2, 2.499], pitch: 0.05 },
	],
	cachorro: [
		{ id: ASSETS["som.cachorro"], volume: 0.5, region: [0, 0.412], pitch: 0.04 },
		{ id: ASSETS["som.cachorro"], volume: 0.5, region: [1, 1.634], pitch: 0.04 },
		{ id: ASSETS["som.cachorro"], volume: 0.5, region: [2, 2.699], pitch: 0.04 },
	],
	gato: [
		{ id: ASSETS["som.gato"], volume: 0.45, region: [0, 0.963], pitch: 0.04 },
		{ id: ASSETS["som.gato"], volume: 0.45, region: [1, 1.703], pitch: 0.04 },
	],
	passaroPousa: [
		{ id: ASSETS["som.passaros_pousam"], volume: 0.4, region: [0, 0.706], pitch: 0.05 },
		{ id: ASSETS["som.passaros_pousam"], volume: 0.4, region: [2, 2.659], pitch: 0.05 },
	],
	passaroVoa: [
		{ id: ASSETS["som.passaros_pousam"], volume: 0.4, region: [4, 4.797], pitch: 0.05 },
	],
	enxada: [
		{ id: ASSETS["som.enxada"], volume: 0.5, region: [0, 0.618], pitch: 0.05 },
		{ id: ASSETS["som.enxada"], volume: 0.5, region: [1, 1.632], pitch: 0.05 },
		{ id: ASSETS["som.enxada"], volume: 0.5, region: [2, 2.63], pitch: 0.05 },
	],
	plantar: [
		{ id: ASSETS["som.plantar"], volume: 0.5, region: [0, 0.922], pitch: 0.04 },
		{ id: ASSETS["som.plantar"], volume: 0.5, region: [1, 1.918], pitch: 0.04 },
	],
	regar: [
		{ id: ASSETS["som.regar"], volume: 0.45, region: [0, 1.97], pitch: 0.03 },
		{ id: ASSETS["som.regar"], volume: 0.45, region: [2, 4.32], pitch: 0.03 },
	],
	colher: [
		{ id: ASSETS["som.colher"], volume: 0.5, region: [0, 0.97], pitch: 0.03 },
		{ id: ASSETS["som.colher"], volume: 0.5, region: [1, 1.97], pitch: 0.03 },
		{ id: ASSETS["som.colher"], volume: 0.5, region: [2, 3.32], pitch: 0.03 },
	],
	matoCorte: [
		{ id: ASSETS["som.mato_corte"], volume: 0.5, region: [0, 0.573], pitch: 0.05 },
		{ id: ASSETS["som.mato_corte"], volume: 0.5, region: [1, 1.563], pitch: 0.05 },
		{ id: ASSETS["som.mato_corte"], volume: 0.5, region: [2, 2.569], pitch: 0.05 },
	],
	machado: [
		{ id: ASSETS["som.machado"], volume: 0.55, region: [0, 0.552], pitch: 0.04 },
		{ id: ASSETS["som.machado"], volume: 0.55, region: [1, 1.583], pitch: 0.04 },
		{ id: ASSETS["som.machado"], volume: 0.55, region: [2, 2.554], pitch: 0.04 },
	],
	arvoreCai: [
		{ id: ASSETS["som.machado"], volume: 0.6, region: [3, 5.196] },
	],
	picareta: [
		{ id: ASSETS["som.picareta"], volume: 0.5, region: [0, 0.97], pitch: 0.04 },
		{ id: ASSETS["som.picareta"], volume: 0.5, region: [1, 1.542], pitch: 0.04 },
		{ id: ASSETS["som.picareta"], volume: 0.5, region: [2, 2.615], pitch: 0.04 },
	],
	pedraQuebra: [
		{ id: ASSETS["som.picareta"], volume: 0.55, region: [3, 3.914] },
	],
	pescaLancar: [
		{ id: ASSETS["som.pesca"], volume: 0.5, region: [0, 1.97] },
	],
	pescaFisgar: [
		{ id: ASSETS["som.pesca"], volume: 0.55, region: [2, 2.97] },
	],
	// O puxar da pesca foi feito para laço (de 3 a 5 s, 32 cliques por volta); enquanto não houver a pesca, toca uma volta.
	pescaPuxar: [
		{ id: ASSETS["som.pesca"], volume: 0.45, region: [3, 5] },
	],
	pescaPegou: [
		{ id: ASSETS["som.pesca"], volume: 0.55, region: [6, 7.363] },
	],
	pegarItem: [
		{ id: ASSETS["som.pegar_item"], volume: 0.45, region: [0, 0.97], pitch: 0.03 },
		{ id: ASSETS["som.pegar_item"], volume: 0.45, region: [1, 1.97], pitch: 0.03 },
		{ id: ASSETS["som.pegar_item"], volume: 0.45, region: [2, 3.244], pitch: 0.03 },
	],
	moedas: [
		{ id: ASSETS["som.moedas"], volume: 0.5, region: [0, 1.026] },
	],
	moedasMuitas: [
		{ id: ASSETS["som.moedas"], volume: 0.5, region: [2, 4.215] },
	],
	nivel: [
		{ id: ASSETS["som.nivel"], volume: 0.6, region: [0, 2.384] },
	],
};

/** A cada quantos passos (meio ciclo do andar, `WALK_STEP_PX` × 4) sai uma braçada nadando. */
export const SWIM_STROKE_STEPS = 3;

// ------------------------------------------------------------------ interface (seção 3 do plano)

export type UiSound = "click" | "focus" | "open" | "close" | "change" | "confirm" | "back" | "refused";

/**
 * Os sons da interface de cada kit do tema (Celeiro: madeira e papel; Clássico: sinos e cristal), feitos no
 * Ableton, num arquivo só por kit, cada som um trecho (`region`) que começa num segundo inteiro (os trechos
 * medidos por tools/som/cortar.py em 2026-10-20).
 */
export const UI_SOUNDS: Record<"celeiro" | "graal", Record<UiSound, SoundSpec>> = {
	celeiro: {
		click: { id: ASSETS["som.interface.celeiro"], volume: 0.5, region: [0, 0.15] },
		focus: { id: ASSETS["som.interface.celeiro"], volume: 0.3, region: [1, 1.13] },
		open: { id: ASSETS["som.interface.celeiro"], volume: 0.5, region: [2, 2.34] },
		close: { id: ASSETS["som.interface.celeiro"], volume: 0.5, region: [3, 3.32] },
		change: { id: ASSETS["som.interface.celeiro"], volume: 0.4, region: [4, 4.18] },
		confirm: { id: ASSETS["som.interface.celeiro"], volume: 0.5, region: [5, 5.4] },
		back: { id: ASSETS["som.interface.celeiro"], volume: 0.5, region: [6, 6.28] },
		refused: { id: ASSETS["som.interface.celeiro"], volume: 0.5, region: [7, 7.36] },
	},
	graal: {
		click: { id: ASSETS["som.interface.graal"], volume: 0.5, region: [0, 0.13] },
		focus: { id: ASSETS["som.interface.graal"], volume: 0.3, region: [1, 1.13] },
		open: { id: ASSETS["som.interface.graal"], volume: 0.5, region: [2, 2.38] },
		close: { id: ASSETS["som.interface.graal"], volume: 0.5, region: [3, 3.36] },
		change: { id: ASSETS["som.interface.graal"], volume: 0.4, region: [4, 4.22] },
		confirm: { id: ASSETS["som.interface.graal"], volume: 0.5, region: [5, 5.33] },
		back: { id: ASSETS["som.interface.graal"], volume: 0.5, region: [6, 6.24] },
		refused: { id: ASSETS["som.interface.graal"], volume: 0.5, region: [7, 7.32] },
	},
};

// ------------------------------------------------------------------ música (seção 1 do plano)

/** Laço contínuo (as telas: título, personalizar e, depois, as lojas) ou com pausas (os lugares). */
export type MusicMode = "loop" | "breathe";

export type MusicTrack =
	| "titulo"
	| "personalizar"
	| "ilha_manha"
	| "ilha_dia"
	| "ilha_tarde"
	| "sala_dia"
	| "sala_noite"
	| "vila";

/** As faixas, uma por arquivo (feitas no Ableton). Ainda sem id. */
export const MUSIC_TRACKS: Record<MusicTrack, SoundSpec> = {
	titulo: { id: ASSETS["musica.titulo"], volume: 0.5 },
	personalizar: { id: ASSETS["musica.personalizar"], volume: 0.4 },
	ilha_manha: { id: ASSETS["musica.ilha_manha"], volume: 0.5 },
	ilha_dia: { id: ASSETS["musica.ilha_dia"], volume: 0.5 },
	ilha_tarde: { id: ASSETS["musica.ilha_tarde"], volume: 0.5 },
	sala_dia: { id: ASSETS["musica.sala_dia"], volume: 0.45 },
	sala_noite: { id: ASSETS["musica.sala_noite"], volume: 0.35 },
	vila: { id: ASSETS["musica.vila"], volume: 0.45 },
};

export interface MusicPlace {
	mode: MusicMode;
	tracks: Partial<Record<Period, MusicTrack>>;
}

/** A música de um lugar (`musica` da zona) ou de uma tela: como toca e a faixa de cada período (nada: só ambiente). */
export const MUSIC_PLACES: Record<string, MusicPlace> = {
	titulo: {
		mode: "loop",
		tracks: { manha: "titulo", dia: "titulo", tarde: "titulo", noite: "titulo" },
	},
	personalizar: {
		mode: "loop",
		tracks: { manha: "personalizar", dia: "personalizar", tarde: "personalizar", noite: "personalizar" },
	},
	ilha: {
		mode: "breathe",
		tracks: { manha: "ilha_manha", dia: "ilha_dia", tarde: "ilha_tarde" },
	},
	sala: {
		mode: "breathe",
		tracks: { manha: "sala_dia", dia: "sala_dia", tarde: "sala_dia", noite: "sala_noite" },
	},
	// A vila e o mercado (2026-10-23): laço de dia; à noite o mercado fecha e fica só o ambiente.
	vila: {
		mode: "loop",
		tracks: { manha: "vila", dia: "vila", tarde: "vila" },
	},
};

/** Respira: a faixa some nos últimos segundos, e o silêncio (só ambiente) dura um tempo sorteado entre os dois. */
export const MUSIC_END_FADE = 4;
export const MUSIC_REST: [number, number] = [60, 180];
/** No meio de uma faixa, a troca de período é um fade deste tamanho. */
export const MUSIC_PERIOD_FADE = 8;
/** Troca de tela ou de lugar sem véu (título, personalizar, jogo). */
export const MUSIC_SWITCH_FADE = 2;
/** O véu da porta: a música e o ambiente somem junto com ele e voltam ao clarear. */
export const VEIL_FADE_OUT = 0.8;
export const VEIL_FADE_IN = 2;
