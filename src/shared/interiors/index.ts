import type { InteriorData, InteriorSheet } from "./types"; // Reconstruído em 2026-10-20 a partir do Luau compilado: o gerador (tools/diorama_jogo.mjs) se perdeu na formatação de out/2026.
// Gerado por tools/diorama_jogo.mjs: os interiores que o jogo conhece e as folhas do Aeko no Roblox.
// Não editar: cada `npm run diorama:jogo` refaz esta lista com os módulos da pasta.

import { ASSETS } from "../assets";
import { interior as map0 } from "./banheiro_equipe";
import { interior as map1 } from "./casa_teste_v2";
import { interior as map2 } from "./casa_teste_v2_atual";
import { interior as map3 } from "./casa_teste_v2_l";
import { interior as map4 } from "./casa_teste_v2_menor";
import { interior as map5 } from "./castelo_passagem";
import { interior as map6 } from "./comodo_ferramenta";
import { interior as map7 } from "./exemplo_comodo";
import { interior as map8 } from "./exterior_32";
import { interior as map9 } from "./exterior_ilha";
import { interior as map10 } from "./moradores_jogo";
import { interior as map11 } from "./teste_d_destino";
import { interior as map12 } from "./teste_d_ligacoes";
import { interior as map13 } from "./teste_d_origem";

/** As metades de cada folha (ids no registro de assets, aeko.<folha>.<metade>). */
export const INTERIOR_SHEETS: Record<string, InteriorSheet> = {
	casa: [ASSETS["aeko.casa.0"], ASSETS["aeko.casa.1"]],
	castelo: [ASSETS["aeko.castelo.0"], ASSETS["aeko.castelo.1"]],
};

/**
 * As imagens do exterior (a junção: a folha de 16 px da grade dupla e as formas de 32 px da equipe), na ordem
 * do número `imagem` de `terrain.runs` (ids no registro de assets, exterior.<arquivo>).
 */
export const EXTERIOR_SHEETS = [ASSETS["exterior.folha_juncao"], ASSETS["exterior.forma_equipe_32"]];

export const INTERIORS: Record<string, InteriorData> = {
	banheiro_equipe: map0,
	casa_teste_v2: map1,
	casa_teste_v2_atual: map2,
	casa_teste_v2_l: map3,
	casa_teste_v2_menor: map4,
	castelo_passagem: map5,
	comodo_ferramenta: map6,
	exemplo_comodo: map7,
	exterior_32: map8,
	exterior_ilha: map9,
	moradores_jogo: map10,
	teste_d_destino: map11,
	teste_d_ligacoes: map12,
	teste_d_origem: map13,
};
