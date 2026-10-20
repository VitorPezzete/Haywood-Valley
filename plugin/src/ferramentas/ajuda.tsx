// Ajuda (janela única, 2026-10-20; antes a ferramenta Suporte): o guia rápido (escrito aqui, funciona sem a ponte),
// os atalhos e os documentos de docs/diorama/*.md (GET /docs e GET /docs/<nome>).
import Vide, { cleanup, For, mount, source } from "@rbxts/vide";
import { COMO_LIGAR, lerDoc, listarDocs } from "../ponte";
import { argTexto, registrarAcoes } from "../simulacao";
import { AreaTexto, Botao, Coluna, Fileira, Painel, Preenche, Rotulo, TextoCurto, Titulo } from "../ui/kit";
import type { ContextoSecao } from "../widget";

const GUIA = "guia";
const ATALHOS = "atalhos";

const TEXTO_GUIA = `O Diorama é o editor de mapas do Haywood Valley dentro do Studio. Tudo fica nesta janela; o botão "Diorama" na barra abre e fecha.

COMO COMEÇAR
1. Ligue a ponte: dê dois cliques em Diorama.cmd, na pasta do repositório, e deixe a janela preta aberta. A bolinha no canto de cima fica verde ("Tudo ligado") ou amarela (algo opcional desligado). Vermelha quer dizer ponte desligada.
2. Em Mapa, escolha um mapa (ou "Novo mapa"). Escolha um tile em Tiles e pinte no canvas.
3. Salve com Ctrl+S.
4. Em Testar, clique em "Testar este mapa" e aperte F5.

AS SEÇÕES
Mapa: pintar o mapa. Tiles (a folha), Peças (móveis prontos que encaixam sozinhos) e Marcadores (onde o jogador nasce, entradas, saídas, zonas com música e ambiente, moradores). "⋯ Mais" duplica, renomeia, apaga, mostra o peso do mapa e gera para o jogo.
Peças: as peças das folhas: nome, tipo, recorte e cores, e se entram no Decorar do jogo. "Mandar ao jogo" atualiza a lista do Decorar.
Arte: as folhas de tiles, o Aseprite e as imagens do jogo (o que ainda falta enviar ao Roblox).
Testar: um botão que salva, gera e deixa o Play pronto. O Avançado tem os atributos do Workspace, a conferência do place e o Output filtrado.
Verificar: procura erros em tudo; cada erro tem "como corrigir" e um botão que leva ao lugar.
Configurações: a ponte, as folhas locais, as opções avançadas e os padrões.

O QUE É A PONTE
Um programa pequeno (tools/diorama_ponte.mjs) que roda no seu computador e deixa o Studio ler e gravar os arquivos do jogo (mapas, peças, imagens). O Studio sozinho não mexe em arquivos. Sem a ponte, o Diorama abre mas não carrega nem salva nada.

PEDIR AO CLAUDE
O botão "Pedir ao Claude" (Ctrl+K) abre uma conversa. O Claude explica e, quando o pedido muda algo, mostra a lista das mudanças: nada muda sem você clicar em Aplicar. Vão junto o mapa aberto, a seção, a célula e os problemas do último Verificar.

OPÇÕES AVANÇADAS
Ids, coordenadas, JSON e as abas de depuração ficam escondidos. Clique em "▸ Avançado" em qualquer seção (ou ligue em Configurações) para ver; a escolha fica guardada.

QUANDO ALGO DÁ ERRADO
• Bolinha vermelha: a ponte caiu. Dê dois cliques em Diorama.cmd de novo.
• "Mudanças não salvas de …": o Studio fechou ou o plugin recarregou com o mapa sem salvar. "Recuperar" traz de volta.
• O jogo não mostra o mapa novo: o Rojo precisa estar ligado (npm run serve e Connect) e o código compilado (npm run watch).
• A folha editada no Aseprite não aparece: ligue "Folhas locais" (Configurações ou Arte).`;

const TEXTO_ATALHOS = `NA JANELA
Ctrl+K  Pedir ao Claude
Ctrl+1 a Ctrl+7  trocar de seção (Mapa, Peças, Arte, Testar, Verificar, Ajuda, Configurações)
Esc  fechar a caixa aberta (mapas, conexões, Claude)

NO MAPA (com o canvas focado)
B pincel · R retângulo · G balde · E borracha · I conta-gotas (ou Alt+clique, ou botão direito)
1 chão · 2 objeto · 3 frente · 4 terreno
+ / −  zoom
Ctrl+S salvar · Ctrl+Z desfazer · Ctrl+Y refazer
Esc  cancela o posicionamento de um marcador ou sai da peça

EM PEÇAS
Ctrl+S salvar
Arrastar na folha: cria uma peça (ou muda a área da peça escolhida)`;

export function PainelAjuda() {
	const docs = source<Array<{ nome: string }>>([]);
	const aberto = source<string>(GUIA);
	const texto = source(TEXTO_GUIA);
	const aviso = source("");
	const carregando = source(false);

	function recarregar() {
		task.spawn(() => {
			const r = listarDocs();
			if (r.ok) {
				docs(r.valor.map((nome) => ({ nome })));
				aviso("");
			} else {
				docs([]);
				aviso("Os documentos vêm da ponte, que está desligada. O guia e os atalhos funcionam sem ela.");
			}
		});
	}

	function abrirDoc(nome: string) {
		if (carregando()) return;
		aberto(nome);
		if (nome === GUIA) return texto(TEXTO_GUIA);
		if (nome === ATALHOS) return texto(TEXTO_ATALHOS);
		carregando(true);
		texto(`Carregando ${nome}.md…`);
		task.spawn(() => {
			const r = lerDoc(nome);
			texto(r.ok ? r.valor : `Não deu para ler ${nome}.md: ${r.erro}\n${COMO_LIGAR}`);
			carregando(false);
		});
	}

	recarregar();

	// Abrir um documento visto de fora (simulacao.ts): devolve o tamanho do texto mostrado.
	cleanup(
		registrarAcoes("ajuda", {
			abrir: (args) => {
				abrirDoc(argTexto(args, "nome"));
				const limite = os.clock() + 10;
				task.wait();
				while (carregando() && os.clock() < limite) task.wait();
				return { nome: aberto(), caracteres: texto().size() };
			},
		}),
	);

	return (
		<Painel>
			<Coluna tamanho={UDim2.fromScale(1, 1)}>
				<Titulo texto="Ajuda" ordem={0} />
				<Fileira ordem={1} espaco={3}>
					<Botao texto="Guia rápido" principal={true} ativo={() => aberto() === GUIA} aoClicar={() => abrirDoc(GUIA)} ordem={0} />
					<Botao texto="Atalhos" ativo={() => aberto() === ATALHOS} aoClicar={() => abrirDoc(ATALHOS)} ordem={1} />
					<TextoCurto texto={() => (docs().size() > 0 ? "Documentos:" : "")} tom="fraco" ordem={2} />
					<For each={docs}>
						{(doc, indice) => <Botao texto={doc.nome} ativo={() => aberto() === doc.nome} aoClicar={() => abrirDoc(doc.nome)} ordem={3 + indice()} />}
					</For>
				</Fileira>
				<Rotulo texto={aviso} tom="fraco" ordem={2} />
				<Preenche ordem={3}>
					<AreaTexto texto={texto} tamanho={UDim2.fromScale(1, 1)} />
				</Preenche>
			</Coluna>
		</Painel>
	);
}

export function montar(quadro: Frame, _contexto: ContextoSecao) {
	return mount(() => <PainelAjuda />, quadro);
}
