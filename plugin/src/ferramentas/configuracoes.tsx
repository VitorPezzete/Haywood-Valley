// Configurações (janela única, 2026-10-20): tudo o que antes ficava espalhado pelos painéis e a antiga ferramenta
// Conexão. A ponte (estado e endereço), o editor (zoom e grade ao abrir, reabrir o último mapa), as folhas locais,
// as opções avançadas, "Permitir executar Luau" e "Restaurar padrões". Os valores moram em config.ts (uma chave
// só), menos Folhas locais (folhasLocais.ts) e Executar Luau (canal.ts), que já tinham chave própria.
import Vide, { cleanup, mount, source } from "@rbxts/vide";
import { ambienteSeHouver } from "../ambiente";
import { definirPermitirLuau, permitirLuau } from "../canal";
import {
	avancado,
	definirAvancado,
	definirEndereco,
	definirGradePadrao,
	definirLembrarMapa,
	definirZoomPadrao,
	enderecoConfigurado,
	fachada,
	gradePadrao,
	lembrarMapa,
	PADRAO,
	restaurarPadroes,
	zoomPadrao,
} from "../config";
import { definirFolhasLocais, ponteLigada, statusPonte } from "../estado";
import { folhasLocais } from "../folhasLocais";
import { erroPonte } from "../ponte";
import { argTexto, registrarAcoes } from "../simulacao";
import { copiarTexto } from "../ui/copiar";
import { conferirConexoes } from "../ui/janela";
import { Alternar, Botao, Campo, Coluna, Escolha, Fileira, Lista, Painel, Rotulo, TextoCurto, Titulo } from "../ui/kit";
import { Cartao, LinhaEstado } from "../ui/simples";
import { DATA_VERSAO, VERSAO } from "../versao";
import type { ContextoSecao } from "../widget";

/** Onde o .rbxm do plugin é gravado por npm run plugin:build. */
const CAMINHO_PLUGIN = "%LOCALAPPDATA%\\Roblox\\Plugins\\Diorama.rbxm";

export function PainelConfiguracoes() {
	const mensagem = source("");
	const endereco = source(enderecoConfigurado());
	const confirmarRestaurar = source(false);
	const conferindo = source(false);

	const tentar = () => {
		if (conferindo()) return;
		conferindo(true);
		task.spawn(() => {
			conferirConexoes();
			conferindo(false);
		});
	};
	tentar();

	const gravarEndereco = (texto: string) => {
		if (definirEndereco(texto)) {
			endereco(enderecoConfigurado());
			mensagem(`Ponte em ${enderecoConfigurado()}.`);
			tentar();
		} else mensagem(`"${texto}" não é um endereço (exemplo: ${PADRAO.enderecoPonte}).`);
	};

	const restaurar = () => {
		if (!confirmarRestaurar()) {
			confirmarRestaurar(true);
			mensagem('Clique de novo em "Restaurar padrões" para confirmar.');
			return;
		}
		confirmarRestaurar(false);
		restaurarPadroes();
		endereco(enderecoConfigurado());
		definirPermitirLuau(false);
		if (folhasLocais()) task.spawn(definirFolhasLocais, false);
		mensagem("Tudo voltou ao padrão.");
		tentar();
	};

	const luau = fachada(permitirLuau, definirPermitirLuau);
	const folhas = fachada(folhasLocais, (v: boolean) => task.spawn(definirFolhasLocais, v));
	const opcaoAvancado = fachada(avancado, definirAvancado);
	const grade = fachada(gradePadrao, definirGradePadrao);
	const lembrar = fachada(lembrarMapa, definirLembrarMapa);
	const zoom = fachada(() => tostring(zoomPadrao()), (v: string) => definirZoomPadrao(tonumber(v) ?? 2));

	const amb = ambienteSeHouver();
	const caminhos = () => {
		const s = statusPonte();
		const linhas = [`Ponte: ${enderecoConfigurado()}`, `Plugin: ${CAMINHO_PLUGIN}`];
		if (s) {
			linhas.push(`Repositório: ${s.raiz}`);
			linhas.push(`Ligar a ponte: ${s.raiz}\\Diorama.cmd`);
		}
		return linhas.join("\n");
	};

	cleanup(
		registrarAcoes("configuracoes", {
			estado: () => ({
				avancado: avancado(),
				zoom_padrao: zoomPadrao(),
				grade_padrao: gradePadrao(),
				lembrar_mapa: lembrarMapa(),
				endereco: enderecoConfigurado(),
				folhas_locais: folhasLocais(),
				permitir_luau: permitirLuau(),
			}),
			avancado: (args) => {
				definirAvancado(args.valor === true);
				return avancado();
			},
			endereco: (args) => {
				gravarEndereco(argTexto(args, "texto"));
				return { endereco: enderecoConfigurado(), mensagem: mensagem() };
			},
		}),
	);

	return (
		<Painel>
			<Lista tamanho={UDim2.fromScale(1, 1)} espaco={8}>
				<uipadding PaddingRight={new UDim(0, 12)} />
				<Titulo texto="Configurações" ordem={0} />
				<Cartao titulo="Ponte" ordem={1}>
					<LinhaEstado
						cor={() => (ponteLigada() ? "verde" : "vermelho")}
						texto={() => (ponteLigada() ? `Ligada${statusPonte() ? ` (versão ${statusPonte()!.versao})` : ""}.` : (erroPonte() ?? "Desligada."))}
						ordem={0}
					/>
					<Rotulo
						texto="Para ligar a ponte: dois cliques em Diorama.cmd, na pasta do repositório. Ela liga o Studio aos arquivos do jogo."
						tom="fraco"
						ordem={1}
					/>
					<Fileira ordem={2}>
						<TextoCurto texto="Endereço:" tom="fraco" ordem={0} />
						<Campo valor={endereco} dica={PADRAO.enderecoPonte} aoConfirmar={gravarEndereco} largura={new UDim(0, 200)} ordem={1} />
						<Botao texto="Usar" aoClicar={() => gravarEndereco(endereco())} ordem={2} />
						<Botao texto="Padrão" aoClicar={() => gravarEndereco(PADRAO.enderecoPonte)} ordem={3} />
					</Fileira>
					<Fileira ordem={3}>
						<Botao texto={() => (conferindo() ? "Conferindo…" : "Tentar de novo")} desligado={conferindo} aoClicar={tentar} ordem={0} />
						<Botao
							texto="Copiar caminhos"
							aoClicar={() => mensagem(copiarTexto(caminhos()) ? "Caminhos copiados." : caminhos())}
							ordem={1}
						/>
					</Fileira>
				</Cartao>
				<Cartao titulo="Editor de mapas" ordem={2}>
					<Fileira ordem={0}>
						<TextoCurto texto="Zoom ao abrir:" tom="fraco" ordem={0} />
						<Escolha
							opcoes={[
								{ id: "1", titulo: "1×" },
								{ id: "2", titulo: "2×" },
								{ id: "3", titulo: "3×" },
							]}
							valor={zoom}
							ordem={1}
						/>
					</Fileira>
					<Fileira ordem={1}>
						<Alternar texto="Grade ligada ao abrir" valor={grade} ordem={0} />
						<Alternar texto="Reabrir o último mapa" valor={lembrar} ordem={1} />
					</Fileira>
				</Cartao>
				<Cartao titulo="Imagens" ordem={3}>
					<Alternar texto="Folhas locais" valor={folhas} ordem={0} />
					<Rotulo
						texto="Ligado, as folhas aparecem como estão no disco (o que você acabou de salvar no Aseprite), sem esperar o envio ao Roblox. Gasta mais memória."
						tom="fraco"
						ordem={1}
					/>
				</Cartao>
				<Cartao titulo="Interface" ordem={4}>
					<Alternar texto="Mostrar opções avançadas" valor={opcaoAvancado} ordem={0} />
					<Rotulo texto="Mostra ids, coordenadas, JSON e as abas de depuração em todas as seções. O idioma é só português." tom="fraco" ordem={1} />
				</Cartao>
				<Cartao titulo="Claude" ordem={5}>
					<Alternar texto="Permitir executar Luau" valor={luau} ordem={0} />
					<Rotulo
						texto="Deixa o Claude rodar código neste Studio (pelo canal da ponte), com as permissões do plugin. Desligado, ele só usa os comandos do Diorama."
						tom="fraco"
						ordem={1}
					/>
				</Cartao>
				<Cartao titulo="Sobre" ordem={6} visivel={avancado}>
					<Rotulo
						texto={`Diorama ${VERSAO} (${DATA_VERSAO})${amb ? ` · pacote ${amb.versao}${amb.hash !== undefined ? ` (${amb.hash})` : ""}, ${amb.origem === "ponte" ? "da ponte (atualiza sozinho)" : "embutido no .rbxm"} · sessão ${amb.sessao.sub(1, 8)}` : ""}`}
						tom="fraco"
						ordem={0}
					/>
					<Rotulo texto={caminhos} tom="fraco" ordem={1} />
				</Cartao>
				<Fileira ordem={7}>
					<Botao texto={() => (confirmarRestaurar() ? "Confirmar: restaurar padrões" : "Restaurar padrões")} aoClicar={restaurar} ordem={0} />
				</Fileira>
				<Rotulo texto={mensagem} tom="aviso" ordem={8} />
			</Lista>
		</Painel>
	);
}

export function montar(quadro: Frame, _contexto: ContextoSecao) {
	return mount(() => <PainelConfiguracoes />, quadro);
}
