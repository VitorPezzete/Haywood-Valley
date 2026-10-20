// Entrada do plugin Diorama. É o Script raiz do .rbxm (o Rojo transforma a pasta out/ no Script "Diorama"
// porque este arquivo, index.server.ts, vira out/init.server.luau): cria a barra "Diorama" com um botão por ferramenta de ferramentas/index.ts.
// Cada botão abre o widget da ferramenta ou o esconde se já estava aberto.
//
// Ao carregar na edição, liga o filtro do Output (para o painel Servidor já ter o histórico) e aplica o teleporte
// que a instância do Play tenha deixado guardado (servidor/teleporte.ts); nas outras sessões, só a barra.
import { FERRAMENTAS } from "./ferramentas";
import { modoAtual } from "./servidor/execucao";
import { ligarOutput } from "./servidor/output";
import { aplicarPendente } from "./servidor/teleporte";
import { fecharTodos } from "./widget";

const barra = plugin.CreateToolbar("Diorama");

for (const ferramenta of FERRAMENTAS) {
	const botao = barra.CreateButton(`diorama_${ferramenta.id}`, ferramenta.descricao, ferramenta.icone, ferramenta.nome);
	// Deixa clicar mesmo sem a viewport (no editor de scripts); a propriedade falta nos tipos do @rbxts/types.
	(botao as unknown as { ClickableWhenViewportHidden: boolean }).ClickableWhenViewportHidden = true;
	let acompanhando = false;
	botao.Click.Connect(() => {
		const [ok, resultado] = pcall(() => ferramenta.abrir(plugin));
		if (!ok) {
			warn(`[Diorama] a ferramenta ${ferramenta.nome} não abriu: ${tostring(resultado)}`);
			return;
		}
		const gui = resultado as DockWidgetPluginGui;
		// O botão fica marcado enquanto o widget está à vista, inclusive quando o usuário o fecha pelo X.
		if (!acompanhando) {
			acompanhando = true;
			gui.GetPropertyChangedSignal("Enabled").Connect(() => botao.SetActive(gui.Enabled));
		}
		botao.SetActive(gui.Enabled);
	});
}

plugin.Unloading.Connect(() => fecharTodos());

if (modoAtual() === "edicao") {
	ligarOutput();
	const [ok, erro] = pcall(() => aplicarPendente(plugin));
	if (!ok) warn(`[Diorama] teleporte pendente: ${tostring(erro)}`);
}

print("[Diorama] plugin carregado com", FERRAMENTAS.size(), "ferramentas");
