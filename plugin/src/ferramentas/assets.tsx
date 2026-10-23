// Assets: o registro (GET /assets) numa tabela chave / id / tipo / arquivo com filtro, destaque do que está sem id
// e contagens; a prévia de uma imagem com id; o envio de imagem pelo Studio (experimental: EditableImage +
// AssetService:CreateAssetAsync, com confirmação explícita porque usa a conta do usuário) e a importação de ids
// (POST /assets/enviadas com { "<chave>": id }).
//
// Desde a janela única (2026-10-20) é a parte "Imagens e sons" da seção Arte (ferramentas/arte.tsx). Simples: a
// lista com o que falta enviar, a prévia e o envio em dois passos; ids, arquivos, a importação de JSON e o log ficam
// no Avançado. Com o painel largo, a lista fica à esquerda dos detalhes; estreito, em cima.
import { HttpService } from "@rbxts/services";
import Vide, { action, cleanup, For, source } from "@rbxts/vide";
import { avancado } from "../config";
import { registrarAcoes } from "../simulacao";
import { Coluna, Preenche } from "../ui/kit";
import { enviarImagem, ImagemPreparada, LADO_MAXIMO, prepararDaImagem } from "../assets/enviar";
import { EntradaRegistro, idTexto, lerRegistro, recorteSugerido } from "../assets/registro";
import { enviarAssets, lerAssets } from "../ponte";
import { Alternar, CaixaTexto, Fileira, LinhaCampo, TextoCurto } from "../ui/kit";
import { AreaTexto, Botao, Campo, cor, ESPACO, Lista, Painel, Rotulo, Separador, tema, TEXTO, Titulo } from "../ui/kit";

const ESQUERDA_FRACAO = 0.55;
const ALTURA_LINHA = TEXTO + 6;
const PREVIA = 192;

/** Colunas da tabela simples: a chave e se já foi enviada. */
const COLUNAS_SIMPLES = [
	{ titulo: "imagem ou som", x: 0, w: 0.7 },
	{ titulo: "no Roblox", x: 0.7, w: 0.3 },
];
/** Larguras das colunas da tabela (Avançado), em fração da linha. */
const COLUNAS = [
	{ titulo: "chave", x: 0, w: 0.42 },
	{ titulo: "id", x: 0.42, w: 0.26 },
	{ titulo: "tipo", x: 0.68, w: 0.1 },
	{ titulo: "arquivo", x: 0.78, w: 0.22 },
];

export function PainelAssets() {
	const largura = source(1000);
	const largo = () => largura() >= 700;
	const entradas = source<EntradaRegistro[]>([]);
	const notas = source<string[]>([]);
	const revisao = source(0);
	const status = source("Carregando o registro...");
	const ocupado = source(false);
	const filtro = source("");
	const soSemId = source(false);
	const verImagens = source(true);
	const verSons = source(true);
	const verAntigos = source(false);
	const selecionada = source<EntradaRegistro | undefined>(undefined);
	const log = source("");

	// Envio
	const eFolha = source("");
	const eX = source("0");
	const eY = source("0");
	const eW = source("0");
	const eH = source("0");
	const eNome = source("");
	const preparada = source<ImagemPreparada | undefined>(undefined);
	const conteudoPrevia = source<Content>(Content.none);
	const confirmando = source(false);
	const avisoEnvio = source("");

	// Importar
	const textoImportar = source("");

	const bump = () => revisao(revisao() + 1);

	function registrar(linha: string) {
		log(`${log()}${log() === "" ? "" : "\n"}[${os.date("%H:%M:%S")}] ${linha}`);
	}

	function carregar() {
		if (ocupado()) return;
		ocupado(true);
		status("Carregando o registro pela ponte...");
		task.spawn(() => {
			const r = lerAssets<unknown>();
			if (r.ok) {
				const registro = lerRegistro(r.valor.registro);
				entradas(registro.entradas);
				notas(registro.notas);
				const semId = registro.entradas.filter((e) => !e.antigo && e.id === undefined).size();
				status(
					`${registro.entradas.filter((e) => !e.antigo).size()} chave(s) no registro (${semId} sem id), ${registro.entradas.filter((e) => e.antigo).size()} antiga(s).` +
						(registro.formato !== 1 ? ` Formato ${registro.formato ?? "?"}: esperava 1.` : ""),
				);
			} else {
				entradas([]);
				status(r.status === 404 ? "assets/registro.json não existe." : r.erro);
			}
			selecionada(undefined);
			bump();
			ocupado(false);
		});
	}

	const filtradas = () => {
		revisao();
		const t = filtro().lower();
		return entradas().filter((e) => {
			if (e.antigo && !verAntigos()) return false;
			if (soSemId() && e.id !== undefined) return false;
			if (e.tipo === "imagem" && !verImagens()) return false;
			if (e.tipo === "som" && !verSons()) return false;
			if (t !== "") {
				const alvo = `${e.chave} ${e.arquivo ?? ""} ${e.id ?? ""}`.lower();
				if (alvo.find(t, 1, true)[0] === undefined) return false;
			}
			return true;
		});
	};

	const contagens = () => {
		revisao();
		const todas = entradas().filter((e) => !e.antigo);
		const imagens = todas.filter((e) => e.tipo === "imagem");
		const sons = todas.filter((e) => e.tipo === "som");
		const semId = (lista: EntradaRegistro[]) => lista.filter((e) => e.id === undefined).size();
		return `${imagens.size()} imagens (${semId(imagens)} sem id) · ${sons.size()} sons (${semId(sons)} sem id) · ${filtradas().size()} na lista`;
	};

	function selecionar(e: EntradaRegistro) {
		selecionada(e);
		confirmando(false);
		limparPreparada();
		avisoEnvio("");
		const sugestao = recorteSugerido(e);
		eNome(e.chave);
		if (sugestao) {
			eFolha(sugestao.caminho);
			eX(tostring(sugestao.x));
			eY(tostring(sugestao.y));
			eW(tostring(sugestao.w));
			eH(tostring(sugestao.h));
			avisoEnvio(`Sugestão: ${sugestao.motivo}.`);
		} else if (e.tipo === "imagem") {
			eFolha("");
			avisoEnvio(
				e.arquivo === undefined
					? "Esta entrada não tem arquivo no repositório: a ponte não a serve. Envie pelo site do Roblox e importe o id abaixo."
					: `A ponte só serve PNG de assets/ e diorama/folhas/ (GET /imagens/<caminho>.rgba); ${e.arquivo} fica fora. Envie pelo site do Roblox e importe o id abaixo, ou copie a imagem para uma dessas pastas e diga o caminho aqui.`,
			);
		} else {
			avisoEnvio("Sons não se enviam por aqui.");
		}
	}

	function limparPreparada() {
		const p = preparada();
		if (p) pcall(() => p.imagem.Destroy());
		preparada(undefined);
		conteudoPrevia(Content.none);
	}

	function preparar() {
		if (ocupado()) return;
		const folha = eFolha();
		const x = tonumber(eX()) ?? 0;
		const y = tonumber(eY()) ?? 0;
		const w = tonumber(eW()) ?? 0;
		const h = tonumber(eH()) ?? 0;
		ocupado(true);
		confirmando(false);
		limparPreparada();
		avisoEnvio(`Lendo ${folha}.png pela ponte...`);
		task.spawn(() => {
			const r = prepararDaImagem(folha, x, y, w, h);
			if (r.ok) {
				preparada(r.valor);
				const [ok, conteudo] = pcall(() => Content.fromObject(r.valor.imagem));
				if (ok) conteudoPrevia(conteudo as Content);
				avisoEnvio(
					`Imagem pronta: ${r.valor.largura}×${r.valor.altura} px, de ${r.valor.caminho}.png${ok ? " (prévia abaixo)" : " (a prévia não funcionou: " + tostring(conteudo) + ")"}. Nada foi enviado ainda.`,
				);
			} else {
				avisoEnvio(`Não preparou: ${r.erro}`);
			}
			ocupado(false);
		});
	}

	function confirmarEnvio() {
		const p = preparada();
		const e = selecionada();
		if (!p || ocupado()) return;
		const nome = eNome() !== "" ? eNome() : (e?.chave ?? p.caminho);
		ocupado(true);
		confirmando(false);
		avisoEnvio(`Enviando "${nome}" ao Roblox pela conta logada no Studio (CreateAssetAsync)...`);
		task.spawn(() => {
			const r = enviarImagem(p, nome);
			if (!r.ok) {
				avisoEnvio(`O envio falhou: ${r.erro}`);
				registrar(`envio de ${nome}: ${r.erro}`);
				ocupado(false);
				return;
			}
			const id = r.valor;
			avisoEnvio(`Enviado: rbxassetid://${id}. Gravando no registro pela ponte...`);
			registrar(`${nome} enviado: rbxassetid://${id}`);
			if (e) {
				e.id = id;
				bump();
			}
			const chave = e?.chave ?? nome;
			const envio: Record<string, number> = {};
			envio[chave] = id;
			const ri = enviarAssets(envio);
			if (ri.ok) {
				registrar(ri.valor.log);
				avisoEnvio(
					ri.valor.ok
						? `Enviado e registrado: ${chave} = rbxassetid://${id}. Rode npm run assets se o importador não gerou assets.ts.`
						: `Enviado (rbxassetid://${id}), mas o importador saiu com código ${ri.valor.codigo ?? "?"}: veja o log. Guarde o id!`,
				);
			} else {
				avisoEnvio(`Enviado (rbxassetid://${id}), mas a ponte não gravou: ${ri.erro}. Guarde o id e importe abaixo.`);
				registrar(`ponte não gravou ${chave}: ${ri.erro}`);
			}
			limparPreparada();
			ocupado(false);
		});
	}

	function importar() {
		if (ocupado()) return;
		const texto = textoImportar();
		const [decodificou, valor] = pcall(() => HttpService.JSONDecode(texto) as unknown);
		if (!decodificou || !typeIs(valor, "table")) {
			registrar(`importar: o texto não é JSON válido (${decodificou ? "não é um objeto" : tostring(valor)})`);
			status("Importar: cole um JSON { \"chave\": id }.");
			return;
		}
		// Aceita { chave: id } (id número, "123" ou "rbxassetid://123"); o resto a ponte e o assets.mjs conferem.
		const envio: Record<string, number> = {};
		let quantos = 0;
		for (const [chave, id] of pairs(valor as Record<string, unknown>)) {
			if (!typeIs(chave, "string")) continue;
			const n = typeIs(id, "number") ? id : typeIs(id, "string") ? tonumber(id.gsub("^rbxassetid://", "")[0]) : undefined;
			if (n === undefined || n <= 0) {
				registrar(`importar: ${chave} com id inválido (${tostring(id)}), ignorado`);
				continue;
			}
			envio[chave] = n;
			quantos++;
		}
		if (quantos === 0) {
			status("Importar: nenhum par chave/id válido.");
			return;
		}
		ocupado(true);
		status(`Importando ${quantos} id(s) pela ponte...`);
		task.spawn(() => {
			const r = enviarAssets(envio);
			if (r.ok) {
				registrar(r.valor.log);
				status(r.valor.ok ? `${quantos} id(s) importado(s); assets.ts regravado.` : `O importador saiu com código ${r.valor.codigo ?? "?"}: veja o log.`);
				if (r.valor.ok) {
					for (const [chave, id] of pairs(envio)) {
						const e = entradas().find((x) => x.chave === chave || x.arquivo === chave);
						if (e) e.id = id;
					}
					bump();
				}
			} else {
				registrar(`importar: ${r.erro}`);
				status(`Não importou: ${r.erro}`);
			}
			ocupado(false);
		});
	}

	carregar();

	const campoNumero = (valor: Vide.Source<string>) => <Campo valor={valor} largura={new UDim(0, 56)} />;
	const detalhe = (rotulo: string, valor: () => string, ordem: number) => (
		<Rotulo
			texto={() => {
				revisao();
				const v = valor();
				return v === "" ? "" : `${rotulo}: ${v}`;
			}}
			ordem={ordem}
		/>
	);

	// As ações vistas de fora (simulacao.ts): o Verificar usa `filtrar` para levar a uma chave do registro.
	cleanup(
		registrarAcoes("arte", {
			filtrar: (args) => {
				filtro(typeIs(args.texto, "string") ? args.texto : "");
				// `so_falta`: liga ou desliga "Só o que falta enviar" (o Verificar leva às chaves sem id com ele ligado).
				if (typeIs(args.so_falta, "boolean")) soSemId(args.so_falta);
				task.wait();
				const lista = filtradas();
				if (lista.size() === 1) selecionar(lista[0]);
				return { mostradas: lista.size() };
			},
			estado: () => ({ entradas: entradas().size(), mostradas: filtradas().size(), status: status(), selecionada: selecionada()?.chave }),
		}),
	);

	const colunasVisiveis = () => (avancado() ? COLUNAS : COLUNAS_SIMPLES);

	return (
		<Painel margem={0}>
			{action((f: Frame) => {
				largura(f.AbsoluteSize.X);
				f.GetPropertyChangedSignal("AbsoluteSize").Connect(() => largura(f.AbsoluteSize.X));
			})}
			{/* Esquerda (ou em cima): filtro, contagens e tabela. */}
			<frame
				Name="Esquerda"
				BackgroundTransparency={1}
				Size={() => (largo() ? new UDim2(ESQUERDA_FRACAO, -ESPACO, 1, 0) : new UDim2(1, 0, 0.45, -ESPACO / 2))}
			>
				<Coluna tamanho={UDim2.fromScale(1, 1)} espaco={4}>
					<Fileira ordem={0}>
						<Campo valor={filtro} dica="procurar…" aoConfirmar={(t) => filtro(t)} aoVivo={true} largura={new UDim(0, 160)} ordem={0} />
						<Alternar texto="Só o que falta enviar" valor={soSemId} ordem={1} />
						<Botao texto="Recarregar" aoClicar={carregar} desligado={ocupado} ordem={2} />
					</Fileira>
					<Fileira ordem={1} visivel={avancado}>
						<Alternar texto="Imagens" valor={verImagens} ordem={0} />
						<Alternar texto="Sons" valor={verSons} ordem={1} />
						<Alternar texto="Antigos" valor={verAntigos} ordem={2} />
					</Fileira>
					<Rotulo texto={contagens} tom="fraco" ordem={2} />
					<Preenche ordem={3}>
						{/* Cabeçalho da tabela */}
						<frame Name="Colunas" BackgroundTransparency={1} Size={new UDim2(1, -12, 0, ALTURA_LINHA)}>
							<For each={colunasVisiveis}>
								{(c) => (
									<textlabel
										BackgroundTransparency={1}
										Position={UDim2.fromScale(c.x, 0)}
										Size={new UDim2(c.w, 0, 1, 0)}
										Text={c.titulo}
										TextSize={TEXTO}
										FontFace={Font.fromEnum(Enum.Font.SourceSansBold)}
										TextColor3={cor(Enum.StudioStyleGuideColor.DimmedText)}
										TextXAlignment={Enum.TextXAlignment.Left}
									/>
								)}
							</For>
						</frame>
						<Lista posicao={UDim2.fromOffset(0, ALTURA_LINHA + 2)} tamanho={new UDim2(1, 0, 1, -(ALTURA_LINHA + 2))} espaco={1}>
							<For each={filtradas}>
								{(e, indice) => <LinhaRegistro entrada={e} revisao={revisao} selecionada={() => selecionada() === e} aoClicar={() => selecionar(e)} ordem={indice()} />}
							</For>
						</Lista>
					</Preenche>
				</Coluna>
			</frame>

			{/* Direita: detalhes, prévia, envio, importação e log. */}
			<Lista
				posicao={() => (largo() ? UDim2.fromScale(ESQUERDA_FRACAO, 0) : new UDim2(0, 0, 0.45, ESPACO / 2))}
				tamanho={() => (largo() ? new UDim2(1 - ESQUERDA_FRACAO, 0, 1, 0) : new UDim2(1, 0, 0.55, -ESPACO / 2))}
			>
				<Rotulo texto={status} tom={() => (ocupado() ? "aviso" : "normal")} ordem={0} />
				<Separador ordem={1} />
				<Rotulo texto={() => (selecionada() ? selecionada()!.chave : "Clique numa linha para ver a imagem e enviar.")} negrito={true} ordem={2} />
				{detalhe("Tipo", () => selecionada()?.tipo ?? "", 3)}
				{detalhe("No Roblox", () => (selecionada() ? (selecionada()!.id !== undefined ? (avancado() ? idTexto(selecionada()!) : "enviado") : "ainda não foi enviado") : ""), 4)}
				{detalhe("Arquivo", () => (avancado() ? (selecionada()?.arquivo ?? "") : ""), 5)}
				{detalhe("Origem", () => (avancado() ? (selecionada()?.origem ?? "") : ""), 6)}
				{detalhe("Nota", () => selecionada()?.nota ?? "", 7)}
				<Rotulo texto={() => (selecionada()?.antigo ? "Entrada de `antigos`: não entra em assets.ts." : "")} tom="aviso" ordem={8} />
				{/* Prévia da imagem com id */}
				<frame
					Name="Previa"
					BackgroundColor3={cor(Enum.StudioStyleGuideColor.InputFieldBackground)}
					BorderSizePixel={0}
					Size={UDim2.fromOffset(PREVIA, PREVIA)}
					Visible={() => {
						revisao();
						const e = selecionada();
						return e !== undefined && e.tipo === "imagem" && e.id !== undefined;
					}}
					LayoutOrder={9}
				>
					<imagelabel
						BackgroundTransparency={1}
						Size={UDim2.fromScale(1, 1)}
						Image={() => {
							revisao();
							const e = selecionada();
							return e ? idTexto(e) : "";
						}}
						ScaleType={Enum.ScaleType.Fit}
						ResampleMode={Enum.ResamplerMode.Pixelated}
					/>
				</frame>
				<Separador ordem={10} />

				{/* Envio */}
				<Rotulo texto="Enviar ao Roblox (experimental)" negrito={true} ordem={11} />
				<Rotulo
					texto={
						"Os pixels vêm da ponte (qualquer PNG de assets/ ou diorama/folhas/), entram numa EditableImage e AssetService:CreateAssetAsync cria o asset " +
						"NA CONTA DE QUEM ESTÁ LOGADO NO STUDIO. O Studio pode pedir permissão na primeira vez. Nada é enviado sem a confirmação " +
						`abaixo. Limite: ${LADO_MAXIMO}×${LADO_MAXIMO} px (as folhas de 2048×512 vão em duas metades, x=0 e x=1024, w=1024).`
					}
					tom="fraco"
					ordem={12}
					visivel={avancado}
				/>
				<LinhaCampo rotulo="Imagem" ordem={13} visivel={avancado}>
					<Campo valor={eFolha} dica="assets/ui/atlas" largura={new UDim(0, 260)} />
					<TextoCurto tom="fraco" texto="(caminho a partir da raiz do repositório, sem .png)" />
				</LinhaCampo>
				<LinhaCampo rotulo="Recorte (px)" ordem={14} visivel={avancado}>
					<TextoCurto tom="fraco" texto="x" />
					{campoNumero(eX)}
					<TextoCurto tom="fraco" texto="y" />
					{campoNumero(eY)}
					<TextoCurto tom="fraco" texto="w" />
					{campoNumero(eW)}
					<TextoCurto tom="fraco" texto="h" />
					{campoNumero(eH)}
					<TextoCurto tom="fraco" texto="(w ou h 0 = a folha inteira)" />
				</LinhaCampo>
				<LinhaCampo rotulo="Nome no Roblox" ordem={15} visivel={avancado}>
					<Campo valor={eNome} largura={new UDim(0, 220)} />
				</LinhaCampo>
				<Fileira ordem={16}>
					<Botao texto="1. Preparar" aoClicar={preparar} desligado={ocupado} ordem={0} />
					<Botao
						texto="2. Enviar ao Roblox..."
						aoClicar={() => {
							if (!preparada()) {
								avisoEnvio("Prepare a imagem primeiro (botão 1).");
								return;
							}
							confirmando(true);
						}}
						desligado={() => ocupado() || preparada() === undefined}
						ordem={1}
					/>
				</Fileira>
				<frame
					Name="Confirmacao"
					BackgroundColor3={cor(Enum.StudioStyleGuideColor.WarningText)}
					BackgroundTransparency={0.8}
					BorderSizePixel={0}
					Size={new UDim2(1, -12, 0, 0)}
					AutomaticSize={Enum.AutomaticSize.Y}
					Visible={confirmando}
					LayoutOrder={17}
				>
					<uipadding PaddingTop={new UDim(0, 6)} PaddingBottom={new UDim(0, 6)} PaddingLeft={new UDim(0, 6)} PaddingRight={new UDim(0, 6)} />
					<uilistlayout FillDirection={Enum.FillDirection.Vertical} SortOrder={Enum.SortOrder.LayoutOrder} Padding={new UDim(0, ESPACO)} />
					<Rotulo
						texto={() => {
							const p = preparada();
							return p
								? `Vai criar um asset de imagem "${eNome()}" (${p.largura}×${p.altura}) na conta do usuário logado no Studio e gravar o id na chave "${selecionada()?.chave ?? eNome()}". Confirma?`
								: "";
						}}
						tom="aviso"
						ordem={0}
					/>
					<Fileira ordem={1}>
						<Botao texto="Confirmar envio (usa a minha conta)" principal={true} aoClicar={confirmarEnvio} desligado={ocupado} ordem={0} />
						<Botao texto="Cancelar" aoClicar={() => confirmando(false)} ordem={1} />
					</Fileira>
				</frame>
				<Rotulo texto={avisoEnvio} tom="aviso" ordem={18} />
				<frame
					Name="PreviaEnvio"
					BackgroundColor3={cor(Enum.StudioStyleGuideColor.InputFieldBackground)}
					BorderSizePixel={0}
					Size={UDim2.fromOffset(PREVIA, PREVIA / 2)}
					Visible={() => preparada() !== undefined}
					LayoutOrder={19}
				>
					<imagelabel BackgroundTransparency={1} Size={UDim2.fromScale(1, 1)} ImageContent={conteudoPrevia} ScaleType={Enum.ScaleType.Fit} ResampleMode={Enum.ResamplerMode.Pixelated} />
				</frame>
				<Separador ordem={20} />

				<Coluna ordem={21} visivel={avancado}>
					{/* Importar */}
					<Rotulo texto="Importar enviadas" negrito={true} ordem={21} />
					<Rotulo
					texto={'Cole um JSON { "chave": id } (a chave do registro, o caminho do arquivo ou só o nome dele; o id como número, "123" ou "rbxassetid://123"). Vai para POST /assets/enviadas, que grava assets/enviadas.json e roda npm run assets -- --importar.'}
					tom="fraco"
					ordem={22}
				/>
					<CaixaTexto valor={textoImportar} dica={'{ "ui.atlas": 123456789 }'} tamanho={new UDim2(1, -12, 0, 90)} ordem={23} />
					<Fileira ordem={24}>
					<Botao texto="Importar enviadas" aoClicar={importar} desligado={ocupado} ordem={0} />
					<Botao texto="Limpar" aoClicar={() => textoImportar("")} ordem={1} />
					</Fileira>
					<Separador ordem={25} />
					<Rotulo texto="Log" negrito={true} ordem={26} />
					<AreaTexto texto={() => (log() === "" ? "(nada ainda)" : log())} tamanho={new UDim2(1, -12, 0, 140)} ordem={27} />
					<Rotulo texto={() => (notas().size() > 0 ? `Notas do registro: ${notas().join(" ")}` : "")} tom="fraco" ordem={28} />
				</Coluna>
			</Lista>
		</Painel>
	);
}

/** Uma linha da tabela: chave, id, tipo e arquivo; sem id, em cor de aviso. */
function LinhaRegistro(props: { entrada: EntradaRegistro; revisao: () => number; selecionada: () => boolean; aoClicar: () => void; ordem?: number }) {
	const passando = source(false);
	const modificador = () => {
		if (props.selecionada()) return Enum.StudioStyleGuideModifier.Selected;
		if (passando()) return Enum.StudioStyleGuideModifier.Hover;
		return Enum.StudioStyleGuideModifier.Default;
	};
	const semId = () => {
		props.revisao();
		return props.entrada.id === undefined;
	};
	const corTexto = () =>
		tema().GetColor(
			semId() ? Enum.StudioStyleGuideColor.WarningText : props.entrada.antigo ? Enum.StudioStyleGuideColor.DimmedText : Enum.StudioStyleGuideColor.MainText,
			modificador(),
		);
	const valoresSimples: Array<() => string> = [
		() => props.entrada.chave,
		() => {
			props.revisao();
			return props.entrada.id === undefined ? "falta enviar" : "ok";
		},
	];
	const valores: Array<() => string> = [
		() => props.entrada.chave,
		() => {
			props.revisao();
			return props.entrada.id === undefined ? "(sem id)" : tostring(props.entrada.id);
		},
		() => props.entrada.tipo,
		() => props.entrada.arquivo ?? (props.entrada.tipo === "imagem" ? "(fora do repositório)" : ""),
	];
	return (
		<textbutton
			Name="LinhaRegistro"
			AutoButtonColor={false}
			Text=""
			Size={new UDim2(1, -12, 0, ALTURA_LINHA)}
			BackgroundColor3={() => tema().GetColor(Enum.StudioStyleGuideColor.Item, modificador())}
			BorderSizePixel={0}
			LayoutOrder={props.ordem}
			Activated={props.aoClicar}
			MouseEnter={() => passando(true)}
			MouseLeave={() => passando(false)}
		>
			{COLUNAS.map((c, i) => (
				<textlabel
					BackgroundTransparency={1}
					Position={() => (avancado() ? UDim2.fromScale(c.x, 0) : UDim2.fromScale(COLUNAS_SIMPLES[math.min(i, 1)].x, 0))}
					Size={() => (avancado() ? new UDim2(c.w, -4, 1, 0) : new UDim2(COLUNAS_SIMPLES[math.min(i, 1)].w, -4, 1, 0))}
					Visible={() => avancado() || i < 2}
					Text={() => (avancado() ? valores[i]() : i < 2 ? valoresSimples[i]() : "")}
					TextSize={TEXTO}
					FontFace={Font.fromEnum(i === 0 ? Enum.Font.SourceSansBold : Enum.Font.SourceSans)}
					TextColor3={corTexto}
					TextXAlignment={Enum.TextXAlignment.Left}
					TextTruncate={Enum.TextTruncate.AtEnd}
				/>
			))}
		</textbutton>
	);
}
