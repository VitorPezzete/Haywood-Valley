// Validação do visual de um morador, copiada de `decodeSavedLook` (src/shared/playerData.ts). Os ids de cabeças
// e corpos vêm da ponte (`GET /graal/ids`, que lê src/shared/graalData.ts) por `carregarIdsGraal`; enquanto a ponte
// não respondeu, vale a cópia abaixo (gerada em 2026-10-20 de GRAAL_HEADS e GRAAL_BODIES: o id é o texto antes do
// primeiro "|"), que fica como reserva.
//
// Formato do visual salvo (seção 12.20 da especificação): "gênero|id da cabeça|id do corpo|cores|estilos".
// O jogo recusa texto vazio ou maior que MAX_SAVED_LOOK, cabeça ou corpo que não existem e texto sem o campo
// das cores. Cores fora de -1…0xffffff e estilos desconhecidos não são recusados: viram a cor original e o
// estilo do Aeko, sem aviso; aqui eles saem como avisos.
import { lerIdsGraal } from "../ponte";

/** Tamanho máximo do texto de um visual salvo (MAX_SAVED_LOOK em playerData.ts). */
export const TAMANHO_MAXIMO_VISUAL = 256;
/** Quantas cores o texto guarda: pele, cabelo, olhos, 3 detalhes e 6 partes da roupa (COLOR_KEYS). */
export const QUANTIDADE_CORES = 12;
/** -1 é "a cor original da peça" (ORIGINAL em appearance.ts). */
const COR_ORIGINAL = -1;
/** As letras dos estilos, na ordem de PieceStyle: a do Aeko e a original. */
const ESTILOS = ["a", "o"];

// Ids das cabeças (GRAAL_HEADS), separados por espaço. Gerado em 2026-10-20: 840 cabeças.
const CABECAS_TEXTO = [
	"4alexxx alexxx1green alexxx1red aly1darkgreen-2 aly1green-3 aly1pink-4 aly2 aly2brown aly2red arne-masc94g",
	"bea1 bea2 bea-masc1g bea-masc1p bea-masc2g bea-masc2p bea-masc3g bea-masc3p bea-masc4p bea-masc5g bea-masc6g",
	"bea-masc6p bea-masc7p bea-masc8g bea-masc8p bea-masc9p bea-masc10g bea-masc10p bea-masc11g bea-masc11p",
	"bea-masc12p bea-masc14g bea-masc14p bea-masc15g bea-masc15p bea-masc16g bea-masc16p bea-masc17p bea-masc18g",
	"bea-masc18p bea-masc19g bea-masc19p bea-masc20g bea-masc20p bea-masc21g bea-masc21p bea-masc22p bea-masc23g",
	"bea-masc23p bea-masc24p bea-masc25g bea-masc27g bea-masc27p bea-masc28g bea-masc28p bea-masc29g bea-masc29p",
	"bea-masc30g bea-masc30p bea-masc31g bea-masc31p bea-masc32g bea-masc32p bea-masc33g bea-masc33p bea-masc34g",
	"bea-masc34p bea-masc35g bea-masc35p bea-masc36g bea-masc36p bea-masc37p bea-masc38g bea-masc38p bea-masc39g",
	"bea-masc39p bea-masc40g bea-masc41g bea-masc41p bea-masc42g bea-masc42p bea-masc43g bea-masc43p bea-masc44g",
	"bea-masc45g bea-masc45p bea-masc46p bea-masc47g bea-masc47p bea-masc48g bea-masc48p bea-masc49g bea-masc49p",
	"bea-masc51g bea-masc51p bea-masc52g bea-masc52p bea-masc53g bea-masc53p bea-masc54g bea-masc54p bea-masc55g",
	"bea-masc55p bea-masc56g bea-masc56p bea-masc57g bea-masc57p bea-masc58g bea-masc58p bea-masc59g bea-masc59p",
	"bea-masc60g bea-masc60p bea-masc61g bea-masc61p bea-masc62g bea-masc62p bea-masc63g bea-masc63p bea-masc64g",
	"bea-masc64p bea-masc65g bea-masc65p bea-masc66g bea-masc66p bea-masc67g bea-masc67p bea-masc68g bea-masc69g",
	"bea-masc69p bea-masc70g bea-masc70p bea-masc71g bea-masc71p bea-masc72p bea-masc73g bea-masc73p bea-masc74g",
	"bea-masc75g bea-masc75p bea-masc76g bea-masc76p bea-masc77p bea-masc78p bea-masc79p bea-masc80g bea-masc80p",
	"bea-masc81p bea-masc82p bea-masc83g bea-masc83p bea-masc84g bea-masc84p bea-masc85g bea-masc85p bea-masc86p",
	"bea-masc87p bea-masc88p bea-masc89g bea-masc90g bea-masc91p bea-masc92g bea-masc92p bea-masc93g bea-masc93p",
	"bea-masc94p bea-masc95g bea-masc95p bea-masc96g bea-masc96p bea-masc97g bea-masc97p bea-masc98g bea-masc98p",
	"bea-masc99g bea-masc99p bea-masc100p bea-masc101g bea-masc101p bea-masc102p bea-masc103g bea-masc103p",
	"bea-masc104g bea-masc104p bea-masc105g bea-masc105p bea-masc106g bea-masc107g bea-masc107p bea-masc108g",
	"bea-masc108p bea-masc109g bea-masc109p bea-masc112p bea-masc113p bea-masc114p bea-masc115p bea-masc116p",
	"bea-masc117p bea-masc118p bea-masc119p bea-masc120p bea-masc122p bea-masc123p bea-masc124p bea-masc127p",
	"bea-masc128p bea-masc129p bea-xoxo bea-xoxo2 bear bear1 bear2 bear6 bear10glitters bear11hweenboy bear-evil",
	"bear-evil1 bear_2 cae-masc50p caua-masc13p chan1black chan1brown chan1red chan2blonde chan2white chan4 chan5",
	"chan6 chan7boy daisy1 daisy2 daisy3 daisy4 daisy6 daisy7 daisy9-1 daisy11 daisy12 daisy14 daisy16 daisy19",
	"daisy20 daisy23 daisy24 daisy25 daisy26 daisy27-1 daisy28-1 dj-masc91g dubz-masc86g ena53 ena54 ena55 ena56",
	"ena57 ena58 ena59 ena60morado ena61 ena63 ena64 ena66-1 ena69 ena72 ena80 ena83 ena84 ena86 enigma-masc90p",
	"erick-masc100g frank-masc77g gong1 gong2darkred-1 gong2green-1 gong2purple-1 gong3black gong3brown",
	"gong3darkblue gong3dirtywhite gong3gray jen2blue-1 jen2orange-1 jen3brown jen4pink jen5 jen8azul jen9bpurp",
	"jen10blue jen10pink jen11whitey jen12pinky-1 jen14 jen15 jen16blonde jen17blonde jen22 jen23 jen24 jen25-1",
	"jen26 jen28 jen29 jen30 jen31blck jen32brown jen33brown jen34 jen34purple jen35-1 jen35old-1 jen36 jen36-1",
	"jen36old-1 jen38 jen39 jen40 jen42 jen43 jen44 jen46-1 jen47 jen48 jen49 jen51 jen73 jen74male-1 jen75male-1",
	"jennew18 jennew19 jhonny-masc13g kuroi-masc102g lee-masc88g lee-masc110p nima1-3 nima4 nima5 nima6 nima7",
	"nima9-2 nima11 nima13 nima17 nima18 nima20 nima20_2 nima21_2 nima22 nima23 nima23_2 nima24 nima24-1 nima25",
	"nima25-1 nima26 nimacouple nimacouple2 nuckzz-masc121p pooka pooka1 pooka1-2 pooka1-3 pooka2-1 pooka4 pooka5",
	"pooka6 pooka6_2 pooka7 pooka8 pooka9 pooka10 pooka10_2 pooka11 pooka12 pooka12_2 pooka13 pooka-ombre-6-1",
	"pooka_13_3 pooka_14_7_2 pooka_15 pooka_18-1 pooka_21_1_1 pooka_22 pooka_23 pooka_24 raskit1black raskit1white",
	"raskit2 raskit3blue raskit3pink raskit4auburn raskit4brown raskit5black raskit5red raskit6blonde raskit6brown",
	"raskit6darkbrown raskit6white raskit7black raskit7brown raskit7maroon raskit7red raskit8black raskit8brown",
	"raskit9black raskit9gray raskit10blonde raskit10brown raskit11black raskit11white raskit12brown",
	"raskit12darkbrown raskit12pink raskit12red raskit13black raskit13blonde raskit13blue raskit13red",
	"raskit14brown-2 raskit14fawn-1 raskit15pink raskit16black raskit16brown raskit16grey raskit17maroon",
	"raskit17red raskit18black-1 raskit18brown raskit19brown raskit20blonde raskit20brown raskit20white",
	"raskit21magenta raskit22brown raskit22red remix-masc26g roy-masc26p seraphim1 sully-masc22g tal3-2 tal-b2",
	"tal-c1 tal-c3 tal-d1 tal-d2 tal-e4-2 tal-f2-2 tal-g3 tal-h1 tal-h3 tal-i1 tal-i3 tal-j2-1 tala2 trisha1-1",
	"wally-masc7g zael-masc24g zar1black-1 zar1blonde zar1brown zar2black zar2green zar3green zar4green zar4purple",
	"zar5pink zar6brown zar7black zar7blonde zar7brown zar8black zar8blonde zar8brown zar9pink zar9yellow",
	"zar10brown zar10red zar11brown zar12black zar12white-1 zar13black zar13ginger zar13white zar14red zar15blonde",
	"zar15brown zar16mint-1 zar16pink-1 zar17blonde zar17brown zar18blue zar18red zar19black zar19blonde",
	"zar20auburn zar20blonde zar20brown zar21auburn zar21blonde zar21brown zar22 zar23brown zar24brown zar24purple",
	"zar25auburn zar25black zar25blonde zar25brown zar26green zar26grey zar26pink zar27 zar28green zar28grey",
	"zar28pink zar29brown zar31auburn zar31black zar31brown zar31original zar32black zar32red zar33brown zar34black",
	"zar34brown zar35black zar35brown zar36blue zar37boy zar37girl zar40brown zar40grey zar40original zar40pink",
	"zar41brown zar42blue zar42purple zar43 zar44 zar45 zar46 zar47 zar48black zar48blue zar48brown zar48pink",
	"zar49brown zar50boy zar50girl zar51black zar52grey zar53blue zar53orange zar54blue zar54brown zar54green",
	"zar55gold zar55pink zar56black zar56blonde zar56brown zar57blue zar57pink zar57purple zar58ice zar60black",
	"zar60brown zar60lime zar60purple zar61black zar61blonde zar61brown zar62orange zar63black zar63blonde",
	"zar63brown zar64blue zar66black zar66blue zar66brown zar67black zar68brown zar68white zar69 zar70 zar71 zar72",
	"zar73 zar74 zar75 zar76 zar77 zar78 zar79 zar80 zar81 zar82 zar83black zar84peachblonde zar85green zar85red",
	"zar86brown zar87black zar87blonde zar87brown zar88gold zar88pink zar88red-1 zar89black zar89brown zar89white",
	"zar90black zar90blue zar92black zar92blonde zar92blue zar92brown zar92red zar93purple zar94blonde zar94ginger",
	"zar95black zar95blonde zar95brown zar96brown zar97black zar99blackblue zar99brownred zar102black zar102blonde",
	"zar102brown zar103auburn zar104purple zar104white zar105brown zar106blonde zar106brown zar106white zar107black",
	"zar107brown zar108brown zar109black zar109white zar110blonde zar111brown zar112black zar112blonde zar113blonde",
	"zar114blonde zar114brown zar115femaleblue zar115femalegreen zar115maleblue zar116auburn-1 zar116black",
	"zar117indonesianfemale zar117indonesianmale zar118black zar118green-1 zar118red zar119blonde zar120auburn",
	"zar120blonde zar120brown zar121femaleblack zar121maleblonde zar121malebrown zar122brown zar122grey zar122pink",
	"zar123black zar123blonde zar124brown zar124white zar125kush zar125tiger zar126blonde zar126brown zar126grey",
	"zar126white zar127zara zar128blonde zar128purple zar129blonde zar129blue zar129purple zar130brown zar130red",
	"zar131ombregold-1 zar132femalezombie zar132malezombie zar133blackvampire zar133whitevampire zar134brownwolf",
	"zar135femaledevil zar135maledevil zar136 zar137brown zar137pink zar137white zar138black zar139black",
	"zar139blonde zar140ombreblack zar142black zar142blonde zar142blue zar142red zar143brown zar143red zar144",
	"zar145white zar150brown zar150pink zar151blue zar151brown zar151mint zar153blonde-2 zar153pink-2 zar153white-2",
	"zar154santawhiteblack zar155ombreblackblue zar155ombreblackgrey zar156pink zar157 zar158 zar160black",
	"zar160brown zar160khaki zar161blonde zar161brown zar161pink zar161purple zar162 zar163auburn zar164auburn",
	"zar164black zar170gaara zar170itachi-1 zar170naruto zar170sakura zar170sasuke zar171red zar172 zar172brown",
	"zar173 zar173blue zar174 zar175 zar176red zar177red zar178black zar178brown zar179brown zar180purple",
	"zar180white zar183hazel zar184blonde zar185brown zar186black zar186blonde zar187auburn zar188brown",
	"zar189purple zar189white zar190olive zar191black zar191white zar192brown zar193male zar196female zar197maleori",
	"zar198femalebrown zar201brown zar202black zar202red zar205 zar207ashley zar208hazel zar209red zar210purple",
	"zar211original zar212remake zar213original zar214original zar215black zar215purple zar216pink zar217brown",
	"zar218black zar218tan zar218white zar219hazel zar220brown zar221red zar222brown zar223auburn zar224auburn",
	"zar225brown zar226auburn zar227brown zar227grape zar228red zar229 zar230 zar231 zar232fawn zar234black",
	"zar235brown zar236adam-1 zar237black zar238ginger zar240blonde zar241brown zar243-1 zar243brown zar244brown",
	"zar248 zar248kevo zar249blonde zar250glitters zar251green zar253raskit zar257big zar257small zar258red",
	"zar259auburn zar259v1 zar260 zar260chestnut zar261brown zar261red zar266 zar270 zar270brown zar270brown_2",
	"zar271brown zara1braidblack zara1braidwhite zeus-masc4g",
];

// Ids dos corpos (GRAAL_BODIES). Gerado em 2026-10-20: 107 corpos.
const CORPOS_TEXTO = [
	"bea-masc1p_2 bea-masc2p_2 bea-masc3p_2 bea-masc4p_2 bea-masc5p_2 bea-masc6p_2 bea-masc9p_2 bea-masc12p_2",
	"bea-masc13p bea-masc14p_2 bea-masc15p_2 bea-masc16p_2 bea-masc17p_2 bea-masc18p_2 bea-masc20p_2 bea-masc21p_2",
	"bea-masc22p_2 beas-starbody-givecredit beasbody bear1body-1 bear2body bear3body buichi-masc19p daisy-body1",
	"daisybody daisybody2 pooka4body qwertzilla-masc23p seraphim1body-2 zar1body zar2body zar3body zar4body",
	"zar5body zar6body zar7body zar12body zar14body zar15body zar16body zar17bodyblack zar17bodyblonde",
	"zar17bodybrown zar17bodywhite zar18body zar19body zar20body zar21body zar23body-1 zar23body-fixed zar24body-1",
	"zar24body-fixed zar25body zar26body zar28body zar29body zar30body zar31body zar32body zar34body zar36body",
	"zar39body zar40body zar41body zar42body zar43body zar44body zar45body zar46body zar48body zar49body zar50body",
	"zar51body zar52body zar53body zar54body zar55body zar56body zar59body zar64body-1 zar65bodyauburn",
	"zar65bodyblack zar65bodybrown zar66bodyauburn zar66bodyblack zar66bodybrown zar67body zar71body zar72body-1",
	"zar73body zar76body zar77body zar82body zar83body zar85body-lyviaextension zar88body zar90body zar92body-1",
	"zar93body zar94body zar94bodybrown-1 zar94bodyred zar94fawn zar95body zar95bodybrown zar95bodyfawn",
	"zar95bodyred",
];

function conjunto(linhas: string[]) {
	const ids = new Set<string>();
	for (const linha of linhas) {
		for (const id of linha.split(" ")) {
			if (id !== "") ids.add(id);
		}
	}
	return ids;
}

/** Ids de cabeça que o jogo conhece (a reserva, até a ponte responder). */
export let CABECAS: ReadonlySet<string> = conjunto(CABECAS_TEXTO);
/** Ids de corpo que o jogo conhece (a reserva, até a ponte responder). */
export let CORPOS: ReadonlySet<string> = conjunto(CORPOS_TEXTO);
/** De onde vieram os ids em uso: "reserva" ou "ponte". */
export let ORIGEM_IDS: "reserva" | "ponte" = "reserva";

/**
 * Lê `GET /graal/ids` e troca as listas pelas de src/shared/graalData.ts. Yielda. Sem a ponte (ou com uma ponte
 * antiga, sem a rota), nada muda e a reserva continua valendo. Devolve o erro, se houve.
 */
export function carregarIdsGraal(): string | undefined {
	const r = lerIdsGraal();
	if (!r.ok) return r.erro;
	if (!typeIs(r.valor, "table") || !typeIs(r.valor.cabecas, "table") || !typeIs(r.valor.corpos, "table")) return "resposta de /graal/ids sem cabecas e corpos";
	if (r.valor.cabecas.size() === 0 || r.valor.corpos.size() === 0) return "/graal/ids veio vazio";
	CABECAS = new Set(r.valor.cabecas);
	CORPOS = new Set(r.valor.corpos);
	ORIGEM_IDS = "ponte";
	return undefined;
}

export interface ResultadoVisual {
	/** Por que o jogo recusaria o visual (o morador ficaria de fora), ou nada se ele abre. */
	recusa?: string;
	/** O que o jogo aceita mas corrige em silêncio (cor fora da faixa, estilo desconhecido, campos a mais). */
	avisos: string[];
}

/** Confere o texto de um visual como `decodeSavedLook` faria. Nunca lança erro. */
export function validarVisual(texto: unknown): ResultadoVisual {
	const avisos = new Array<string>();
	if (!typeIs(texto, "string")) return { recusa: "o visual não é um texto", avisos };
	if (texto === "") return { recusa: "o visual está vazio", avisos };
	if (texto.size() > TAMANHO_MAXIMO_VISUAL) {
		return { recusa: `o visual tem ${texto.size()} caracteres; o máximo é ${TAMANHO_MAXIMO_VISUAL}`, avisos };
	}
	const campos = texto.split("|");
	const [genero, cabeca, corpo, cores, estilos] = campos as (string | undefined)[];
	if (cabeca === undefined || !CABECAS.has(cabeca)) {
		return { recusa: `a cabeça "${cabeca ?? ""}" não existe em graalData.ts`, avisos };
	}
	if (corpo === undefined || !CORPOS.has(corpo)) {
		return { recusa: `o corpo "${corpo ?? ""}" não existe em graalData.ts`, avisos };
	}
	if (cores === undefined) return { recusa: "faltam as cores (o quarto campo)", avisos };

	if (genero !== "0" && genero !== "1") avisos.push(`gênero "${genero ?? ""}" (esperado 0 ou 1); o jogo lê como 0`);
	const valores = cores === "" ? new Array<string>() : cores.split(",");
	if (valores.size() !== QUANTIDADE_CORES) {
		avisos.push(`${valores.size()} cor(es) em vez de ${QUANTIDADE_CORES}; as que faltam viram a cor original`);
	}
	for (let indice = 0; indice < math.min(valores.size(), QUANTIDADE_CORES); indice++) {
		const valor = tonumber(valores[indice]);
		const ok = valor !== undefined && valor === math.floor(valor) && valor >= COR_ORIGINAL && valor <= 0xffffff;
		if (!ok) avisos.push(`cor ${indice + 1} = "${valores[indice]}" fora de -1…16777215; vira a cor original`);
	}
	if (estilos !== undefined) {
		if (estilos.size() > 2) avisos.push(`estilos "${estilos}" com mais de duas letras`);
		for (const letra of [estilos.sub(1, 1), estilos.sub(2, 2)]) {
			if (letra !== "" && !ESTILOS.includes(letra)) avisos.push(`estilo "${letra}" desconhecido (a ou o); vira o do Aeko`);
		}
	} else {
		avisos.push("sem o campo dos estilos (texto antigo); vale o estilo do Aeko");
	}
	if (campos.size() > 5) avisos.push(`${campos.size() - 5} campo(s) a mais depois dos estilos, ignorados`);
	return { avisos };
}
