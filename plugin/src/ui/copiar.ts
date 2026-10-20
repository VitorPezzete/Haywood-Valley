// Copiar texto para a área de transferência. O Roblox não tem API pública para isso em plugins: `setclipboard`
// existe só em alguns ambientes (executores, e talvez versões futuras do Studio). Tentamos chamá-la por pcall;
// quando não existe, quem chama mostra o texto numa AreaTexto para o usuário selecionar e dar Ctrl+C.

/** Declaração ambiente: no Luau, um global que não existe lê como nil, então `=== undefined` basta. */
declare const setclipboard: ((texto: string) => void) | undefined;

/** Tenta copiar; devolve true se a função existia e não deu erro. */
export function copiarTexto(texto: string): boolean {
	const [ok, existe] = pcall(() => setclipboard !== undefined);
	if (!ok || !existe) return false;
	const [copiou] = pcall(() => {
		(setclipboard as (texto: string) => void)(texto);
	});
	return copiou;
}
