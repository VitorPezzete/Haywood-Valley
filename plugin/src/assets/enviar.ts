// Enviar uma imagem ao Roblox de dentro do Studio (experimental): os pixels vêm da ponte
// (GET /imagens/<caminho>.rgba: qualquer PNG de assets/ e diorama/folhas/), entram numa EditableImage e
// AssetService:CreateAssetAsync(imagem, Image, { Name, Description }) cria o asset na conta de quem está logado
// no Studio. Tudo em pcall; nada disto é chamado sem o clique de confirmação do usuário.
// Limites conhecidos: EditableImage de até 1024×1024; o Studio pode pedir permissão na primeira chamada;
// CreateAssetAsync pode devolver PermissionDenied, UploadFailed ou Unknown.
import { AssetService } from "@rbxts/services";
import { lerImagem, Resultado } from "../ponte";

/** Maior lado que uma EditableImage aceita. */
export const LADO_MAXIMO = 1024;

export interface ImagemPreparada {
	/** Caminho relativo à raiz do repositório, sem o .png. */
	caminho: string;
	largura: number;
	altura: number;
	imagem: EditableImage;
}

/**
 * Lê o recorte de um PNG do repositório pela ponte (`caminho` sem o .png: `assets/ui/atlas`, `diorama/folhas/casa`;
 * um nome solto vale como folha de diorama/folhas/) e monta a EditableImage. Yielda: chamar de um task.spawn.
 */
export function prepararDaImagem(caminho: string, x: number, y: number, w: number, h: number): Resultado<ImagemPreparada> {
	if (caminho === "") return { ok: false, erro: "diga o caminho do PNG a partir da raiz (assets/... ou diorama/folhas/...), sem .png" };
	const limpo = caminho.gsub("\\", "/")[0].gsub("%.png$", "")[0];
	const completo = limpo.find("/", 1, true)[0] === undefined ? `diorama/folhas/${limpo}` : limpo;
	const inteira = w <= 0 || h <= 0;
	const r = inteira ? lerImagem(completo) : lerImagem(completo, x, y, w, h);
	if (!r.ok) return r;
	const { largura, altura, pixels } = r.valor;
	if (largura > LADO_MAXIMO || altura > LADO_MAXIMO) {
		return {
			ok: false,
			erro: `o recorte tem ${largura}×${altura}; a EditableImage aceita até ${LADO_MAXIMO}×${LADO_MAXIMO}. Envie por metades (x=0 e x=1024, w=1024).`,
		};
	}
	const [criou, imagem] = pcall(() => AssetService.CreateEditableImage({ Size: new Vector2(largura, altura) }));
	if (!criou) return { ok: false, erro: `CreateEditableImage falhou: ${tostring(imagem)}` };
	const editavel = imagem as EditableImage | undefined;
	if (editavel === undefined) return { ok: false, erro: "CreateEditableImage devolveu nil (orçamento de memória de imagens editáveis esgotado)" };
	const [escreveu, erro] = pcall(() => editavel.WritePixelsBuffer(Vector2.zero, new Vector2(largura, altura), pixels));
	if (!escreveu) {
		editavel.Destroy();
		return { ok: false, erro: `WritePixelsBuffer falhou: ${tostring(erro)}` };
	}
	return { ok: true, valor: { caminho: completo, largura, altura, imagem: editavel } };
}

/** O tipo de @rbxts/types declara o retorno de CreateAssetAsync como `unknown`; na verdade é (resultado, id). */
interface ServicoComCreateAsset {
	CreateAssetAsync(
		this: ServicoComCreateAsset,
		objeto: RBXObject,
		tipo: Enum.AssetType,
		parametros: { Name: string; Description: string },
	): LuaTuple<[Enum.CreateAssetResult, number]>;
}

/**
 * Cria o asset de imagem na conta do usuário logado no Studio e devolve o id. Yielda. Usa a conta do usuário:
 * só chamar depois da confirmação explícita dele.
 */
export function enviarImagem(preparada: ImagemPreparada, nome: string): Resultado<number> {
	const servico = AssetService as unknown as ServicoComCreateAsset;
	const [ok, resultado] = pcall(() => {
		const [estado, id] = servico.CreateAssetAsync(preparada.imagem, Enum.AssetType.Image, {
			Name: nome,
			Description: "Haywood Valley",
		});
		return { estado, id };
	});
	if (!ok) return { ok: false, erro: `CreateAssetAsync falhou: ${tostring(resultado)}` };
	const { estado, id } = resultado as { estado: Enum.CreateAssetResult | undefined; id: unknown };
	if (estado !== Enum.CreateAssetResult.Success) {
		return { ok: false, erro: `CreateAssetAsync devolveu ${estado ? estado.Name : "nada"}${typeIs(id, "number") ? ` (${id})` : ""}` };
	}
	if (!typeIs(id, "number") || id <= 0) return { ok: false, erro: `CreateAssetAsync deu Success mas sem id (${tostring(id)})` };
	return { ok: true, valor: id };
}
