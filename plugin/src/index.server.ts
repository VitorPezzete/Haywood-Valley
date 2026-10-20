// Entrada do plugin Diorama. É o Script raiz do .rbxm (o Rojo transforma a pasta out/ no Script "Diorama"
// porque este arquivo, index.server.ts, vira out/init.server.luau): cria a barra "Diorama" com um botão por ferramenta de ferramentas.ts.
// Cada botão abre o widget da ferramenta ou o esconde se já estava aberto.
import { FERRAMENTAS } from "./ferramentas";
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

print("[Diorama] plugin carregado com", FERRAMENTAS.size(), "ferramentas");
