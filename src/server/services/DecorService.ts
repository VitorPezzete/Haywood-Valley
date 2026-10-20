import { OnStart, Service } from "@flamework/core";
import { Players } from "@rbxts/services";
import {
	decodeMoved,
	decodePlaced,
	decorItem,
	decorItemKey,
	DECOR_MAX_PIECES,
	DECOR_MAX_TEXT,
	DECOR_ORDER,
	DecorRefusal,
	DecorState,
	emptyDecor,
	encodeMoved,
	encodePlaced,
	MovedPiece,
	PlacedDecor,
	planDecor,
	stockOf,
} from "shared/decor";
import { isHouse, placeOf } from "shared/interiorChoice";
import { Events } from "server/network";
import { RATE, RateLimiter } from "server/rateLimit";
import { PieceService, Room } from "server/services/PieceService";
import { PlayerDataService } from "server/services/PlayerDataService";

/**
 * Decorar a casa (etapa E2; regras em `shared/decor.ts`): o dono da casa põe peças do inventário de teste, move,
 * gira e guarda as que pôs, e muda de lugar as peças móveis da casa (pote, cadeira, baú). As peças fixas do mapa
 * não saem. O servidor confere cada pedido com a mesma regra do cliente (o fundo, o encaixe na parede, sem cobrir
 * outra peça, a porta nem um jogador), manda o resultado a quem está na casa e grava no `PlayerData` do dono
 * (`decor`, por mapa). Ao montar a casa (`PieceService.onRoomCreated`) ou quando os dados chegam, a decoração
 * salva volta: cada peça é posta de novo pela regra, e a que não couber mais (o mapa mudou) volta ao inventário.
 *
 * A visita fica para depois: quem está numa casa de outro dono vê a decoração dele (ela é da cópia), mas só o
 * dono decora.
 */
@Service()
export class DecorService implements OnStart {
	private limit = new RateLimiter(RATE.decor);

	constructor(
		private readonly pieces: PieceService,
		private readonly playerData: PlayerDataService,
	) {}

	onStart() {
		this.pieces.onRoomCreated((room) => this.restore(room));
		this.playerData.onLoaded((player) => {
			const room = this.pieces.houseOf(player.UserId);
			if (room) this.restore(room);
			this.sendStock(player);
		});
		Events.decorPlace.connect((player, item, form, ax, ay) =>
			this.request(player, (room) => this.place(room, player, item, form, ax, ay)),
		);
		Events.decorMove.connect((player, key, form, ax, ay) =>
			this.request(player, (room) => this.move(room, player, key, form, ax, ay)),
		);
		Events.decorStore.connect((player, key) => this.request(player, (room) => this.store(room, player, key)));
		Events.decorMovePiece.connect((player, id, ax, ay) =>
			this.request(player, (room) => this.movePiece(room, player, id, ax, ay)),
		);
	}

	private request(player: Player, handle: (room: Room) => void) {
		if (!this.limit.allow(player)) return;
		const place = placeOf(player);
		if (!place || !isHouse(place.id) || place.owner !== player.UserId) {
			return this.refuse(player, { key: "decor.refuse.notHome" });
		}
		// Antes de os dados chegarem, a decoração salva ainda não está na casa: esperar, para não gravar por cima.
		if (!this.playerData.isReady(player)) return;
		const room = this.pieces.roomOf(player);
		if (room) handle(room);
	}

	private refuse(player: Player, refusal: DecorRefusal) {
		Events.decorRefused.fire(
			player,
			refusal.key,
			refusal.piece ?? "",
			(refusal.wanted ?? []).join(","),
			refusal.found ?? "",
		);
	}

	private isCell(value: number) {
		return typeIs(value, "number") && value === math.floor(value) && value >= 0 && value < 64;
	}

	private decorOf(owner: Player) {
		return this.playerData.decorOf(owner) ?? emptyDecor();
	}

	private persist(room: Room, owner: Player, moved?: MovedPiece) {
		const decor = this.decorOf(owner);
		const entry = decor.maps[room.id] ?? { placed: "", moved: "" };
		const placed = new Array<PlacedDecor>();
		for (const [, state] of room.board.decor) {
			placed.push({ item: state.item.id, form: state.form, ax: state.ax, ay: state.ay });
		}
		let movedList = decodeMoved(entry.moved);
		if (moved) movedList = [...movedList.filter((m) => m.id !== moved.id), moved];
		decor.maps[room.id] = { placed: encodePlaced(placed), moved: encodeMoved(movedList) };
		this.playerData.setDecor(owner, decor);
		this.sendStock(owner);
	}

	private sendStock(player: Player) {
		const stock = stockOf(this.decorOf(player));
		Events.decorStock.fire(player, DECOR_ORDER.map((id) => `${id}=${math.max(stock.get(id) ?? 0, 0)}`).join(","));
	}

	private restore(room: Room) {
		if (room.owner === 0) return;
		const owner = Players.GetPlayerByUserId(room.owner);
		if (!owner || !this.playerData.isReady(owner) || room.board.decor.size() > 0) return;
		const entry = this.decorOf(owner).maps[room.id];
		if (!entry) return;
		for (const moved of decodeMoved(entry.moved)) {
			const state = room.board.pieces.get(moved.id);
			if (!state || state.mode !== 0 || !room.board.fits(state, moved.x, moved.y)) continue;
			room.board.set(moved.id, moved.x, moved.y, 0, 0, moved.variant);
			this.pieces.sendPiece(room, state);
		}
		let dropped = 0;
		for (const saved of decodePlaced(entry.placed)) {
			const item = decorItem(saved.item);
			if (!item) continue;
			const plan = planDecor(room.board, item, saved.form, saved.ax, saved.ay);
			if (!plan.ok) {
				dropped++;
				continue;
			}
			const state: DecorState = {
				key: this.pieces.newDecorKey(),
				item,
				form: saved.form,
				variant: plan.variant,
				x: plan.x,
				y: plan.y,
				ax: saved.ax,
				ay: saved.ay,
			};
			room.board.setDecor(state);
			this.pieces.sendDecor(room, state);
		}
		print(
			`[Decorar] ${room.key}: ${room.board.decor.size()} peça(s) posta(s) do salvo` +
				(dropped > 0 ? `, ${dropped} não couberam e voltaram ao inventário` : ""),
		);
		if (dropped > 0) this.persist(room, owner);
	}

	private place(room: Room, player: Player, id: string, form: number, ax: number, ay: number) {
		const item = decorItem(id);
		if (!item || !typeIs(form, "number") || item.forms[form] === undefined || !this.isCell(ax) || !this.isCell(ay)) {
			return;
		}
		if ((stockOf(this.decorOf(player)).get(item.id) ?? 0) <= 0) {
			return this.refuse(player, { key: "decor.refuse.none", piece: decorItemKey(item.id) });
		}
		if (room.board.decor.size() >= DECOR_MAX_PIECES) return this.refuse(player, { key: "decor.refuse.full" });
		const plan = planDecor(room.board, item, form, ax, ay, undefined, (x, y) => this.pieces.someoneAt(room, x, y));
		if (!plan.ok) return this.refuse(player, plan.refusal!);
		const state: DecorState = {
			key: this.pieces.newDecorKey(),
			item,
			form,
			variant: plan.variant,
			x: plan.x,
			y: plan.y,
			ax,
			ay,
		};
		room.board.setDecor(state);
		if (encodePlaced(this.savedList(room)).size() > DECOR_MAX_TEXT) {
			room.board.removeDecor(state.key);
			return this.refuse(player, { key: "decor.refuse.full" });
		}
		this.pieces.sendDecor(room, state);
		this.persist(room, player);
	}

	private savedList(room: Room) {
		const list = new Array<PlacedDecor>();
		for (const [, state] of room.board.decor) {
			list.push({ item: state.item.id, form: state.form, ax: state.ax, ay: state.ay });
		}
		return list;
	}

	private move(room: Room, player: Player, key: number, form: number, ax: number, ay: number) {
		if (!typeIs(key, "number") || !this.isCell(ax) || !this.isCell(ay)) return;
		const state = room.board.decor.get(key);
		if (!state || !typeIs(form, "number") || state.item.forms[form] === undefined) return;
		const plan = planDecor(room.board, state.item, form, ax, ay, key, (x, y) => this.pieces.someoneAt(room, x, y));
		if (!plan.ok) return this.refuse(player, plan.refusal!);
		room.board.setDecor({ ...state, form, variant: plan.variant, x: plan.x, y: plan.y, ax, ay });
		this.pieces.sendDecor(room, room.board.decor.get(key)!);
		this.persist(room, player);
	}

	private store(room: Room, player: Player, key: number) {
		if (!typeIs(key, "number")) return;
		const state = room.board.removeDecor(key);
		if (!state) return;
		this.pieces.sendDecor(room, state, undefined, true);
		this.persist(room, player);
	}

	private movePiece(room: Room, player: Player, id: string, ax: number, ay: number) {
		if (!typeIs(id, "string") || !this.isCell(ax) || !this.isCell(ay)) return;
		const state = room.board.pieces.get(id);
		if (!state || state.mode !== 0 || state.spot.test) return;
		const def = state.spot.def;
		const x = ax - math.floor((def.w - 1) / 2);
		const y = ay - math.floor((def.h - 1) / 2);
		if (!room.board.fits(state, x, y, (cx, cy) => this.pieces.someoneAt(room, cx, cy))) {
			return this.refuse(player, { key: "decor.refuse.blocked" });
		}
		state.variant = room.board.variantFor(state, x, y);
		state.x = x;
		state.y = y;
		this.pieces.sendPiece(room, state);
		this.persist(room, player, { id, x, y, variant: state.variant });
	}
}
