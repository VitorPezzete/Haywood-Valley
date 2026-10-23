import { Players } from "@rbxts/services";

/**
 * O limitador comum dos pedidos do cliente (fase 1 do `PLANO_OTIMIZACAO.md`, seção 6.4): um balde por jogador,
 * que enche `perSecond` fichas por segundo até `burst`; cada pedido gasta uma, e o pedido sem ficha é ignorado.
 * Um limitador por tipo de pedido, criado uma vez no serviço que atende o pedido. Assim um cliente que manda
 * pedidos sem parar (por erro ou de propósito) não faz o servidor trabalhar nem gravar atributo que vai para os
 * 200 clientes a cada quadro.
 */
export class RateLimiter {
	private readonly buckets = new Map<Player, { tokens: number; at: number }>();

	constructor(
		private readonly perSecond: number,
		private readonly burst = perSecond,
	) {
		Players.PlayerRemoving.Connect((player) => this.buckets.delete(player));
	}

	allow(player: Player) {
		const now = os.clock();
		const bucket = this.buckets.get(player);
		if (!bucket) {
			this.buckets.set(player, { tokens: this.burst - 1, at: now });
			return true;
		}
		bucket.tokens = math.min(this.burst, bucket.tokens + (now - bucket.at) * this.perSecond);
		bucket.at = now;
		if (bucket.tokens < 1) return false;
		bucket.tokens -= 1;
		return true;
	}
}

/**
 * Os limites de cada pedido, por segundo (seção 6.4 do plano). O `react` tem o intervalo das reações
 * (`REACTION_COOLDOWN`) e o `takeExit`, o dele (`MapService`). O `piecesReady` devolve o estado inteiro do mapa
 * (peças, torneiras, decoração, baús e fogões) e o cliente só pede ao entrar e ao trocar de mapa: `RATE.ready` por
 * segundo, com rajada de `READY_BURST`.
 */
export const READY_BURST = 3;

export const RATE = {
	setLook: 2,
	setName: 1,
	setFavorite: 10,
	saveLook: 4,
	setAction: 10,
	pieces: 20,
	decor: 8,
	ready: 2,
	/** Arar, plantar e colher (`FarmService`), juntos. */
	farm: 8,
};
