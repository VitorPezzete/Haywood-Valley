import { OnStart, Service } from "@flamework/core";
import { Players } from "@rbxts/services";
import { ACTION_ATTRIBUTE, BodyAction, encodeAction, isAction } from "shared/actions";
import { DecorState, encodeColors } from "shared/decor";
import { actionsStart, cellOfPoint, mapCorner, mapData, placeOf } from "shared/interiorChoice";
import { InteriorMap } from "shared/interiorMap";
import {
	canLift,
	canPull,
	canPush,
	dirStep,
	frontSpot,
	handlingOf,
	PIECE_REACH,
	PieceBoard,
	PieceState,
	TAP_REACH,
	THROW_CELLS,
} from "shared/pieces";
import { worldToArtPx } from "shared/view";
import { Events } from "server/network";
import { RATE, RateLimiter, READY_BURST } from "server/rateLimit";

/**
 * Um mapa com as peças dele: cada mapa tem as suas, montadas quando o primeiro jogador chega. A casa de cada
 * jogador é uma cópia própria (`key` "<mapa>#<dono>"), com a decoração dele.
 */
export interface Room {
	key: string;
	id: string;
	owner: number;
	board: PieceBoard;
	corner: Vector3;
	closedTaps: Set<number>;
}

/**
 * As ações do boneco que passam pelo servidor. A ação de empurrar, segurar e puxar é só desenho: o
 * servidor confere o pedido e grava no atributo `Action` do jogador, que os outros clientes leem.
 *
 * As peças móveis do interior (`shared/pieces.ts`) são dele: cada pedido de segurar, puxar, empurrar (andando contra),
 * levantar, pôr no chão ou jogar é conferido (a peça existe, está perto do jogador, o destino é piso livre
 * sem outra peça nem outro jogador) e o resultado vai para quem está no mesmo mapa. A posição vale só para a
 * sessão. Cada mapa tem as suas peças (`Room`); o mapa de cada jogador é o atributo `Mapa` (`MapService`).
 */
@Service()
export class PieceService implements OnStart {
	private rooms = new Map<string, Room>();
	private limit = new RateLimiter(RATE.pieces);
	private actionLimit = new RateLimiter(RATE.setAction);
	private readyLimit = new RateLimiter(RATE.ready, READY_BURST);
	private created = new Array<(room: Room) => void>();
	private nextDecor = 1;

	onStart() {
		Events.setAction.connect((player, kind, facing) => {
			if (!this.actionLimit.allow(player) || !isAction(kind, facing)) return;
			const value = kind === "" ? "" : encodeAction(kind as BodyAction, facing);
			if (player.GetAttribute(ACTION_ATTRIBUTE) !== value) player.SetAttribute(ACTION_ATTRIBUTE, value);
		});
		Players.PlayerRemoving.Connect((player) => {
			this.leaveMap(player);
			// A casa vazia de um dono que saiu é esquecida (a decoração dela já está no salvo dele).
			task.defer(() => {
				for (const [key, room] of this.rooms) {
					if (
						room.owner > 0 &&
						this.playersIn(room).size() === 0 &&
						Players.GetPlayerByUserId(room.owner) === undefined
					) {
						this.rooms.delete(key);
					}
				}
			});
		});
		Events.piecesReady.connect((player) => {
			// Pedido além da cadência é ignorado: o cliente já pediu antes e recebeu o estado.
			if (!this.readyLimit.allow(player)) return;
			const room = this.roomOf(player);
			if (!room) return;
			for (const state of room.board.all()) {
				if (!room.board.untouched(state)) this.send(room, state, player);
			}
			for (const [x, y] of room.board.map.taps) {
				if (room.closedTaps.has(room.board.map.key(x, y))) Events.tapChanged.fire(player, room.key, x, y, false);
			}
			for (const [, state] of room.board.decor) this.sendDecor(room, state, player);
		});
		Events.toggleTap.connect((player, x, y) => this.request(player, (room) => this.toggleTap(room, player, x, y)));
		Events.grabPiece.connect((player, id) => this.request(player, (room) => this.grab(room, player, id)));
		Events.releasePiece.connect((player, id) => this.request(player, (room) => this.release(room, player, id)));
		Events.stepPiece.connect((player, id, dx, dy) =>
			this.request(player, (room) => this.step(room, player, id, dx, dy)),
		);
		Events.pushPiece.connect((player, id, dx, dy) =>
			this.request(player, (room) => this.push(room, player, id, dx, dy)),
		);
		Events.liftPiece.connect((player, id) => this.request(player, (room) => this.lift(room, player, id)));
		Events.placePiece.connect((player, id, x, y) =>
			this.request(player, (room) => this.place(room, player, id, x, y)),
		);
		Events.throwPiece.connect((player, id, facing) =>
			this.request(player, (room) => this.throw(room, player, id, facing)),
		);
	}

	onRoomCreated(listener: (room: Room) => void) {
		this.created.push(listener);
	}

	roomOf(player: Player) {
		const place = placeOf(player);
		const data = place && mapData(place.id);
		if (!place || !data) return undefined;
		let room = this.rooms.get(place.key);
		if (!room) {
			const start = actionsStart(data);
			room = {
				key: place.key,
				id: data.id,
				owner: place.owner,
				board: new PieceBoard(new InteriorMap(data, start.cell, start.test)),
				corner: mapCorner(data.id, place.slot),
				closedTaps: new Set(),
			};
			this.rooms.set(place.key, room);
			print(`[Pecas] ${place.key}: ${room.board.all().size()} peça(s) móvel(is)`);
			for (const listener of this.created) listener(room);
		}
		return room;
	}

	houseOf(owner: number) {
		for (const [, room] of this.rooms) {
			if (room.owner === owner) return room;
		}
		return undefined;
	}

	playersIn(room: Room) {
		return Players.GetPlayers().filter((player) => placeOf(player)?.key === room.key);
	}

	newDecorKey() {
		return this.nextDecor++;
	}

	sendDecor(room: Room, state: DecorState, to?: Player, removed = false) {
		const args = [
			room.key,
			state.key,
			removed ? "" : state.item.id,
			state.form,
			state.variant,
			state.x,
			state.y,
			state.ax,
			state.ay,
			removed ? "" : encodeColors(state.colors),
		] as const;
		if (to) Events.decorChanged.fire(to, ...args);
		else Events.decorChanged.fire(this.playersIn(room), ...args);
	}

	sendPiece(room: Room, state: PieceState) {
		this.send(room, state);
	}

	leaveMap(player: Player) {
		const room = this.roomOf(player);
		const state = room?.board.heldBy(player.UserId);
		if (room && state) this.release(room, player, state.spot.id);
	}

	private request(player: Player, handle: (room: Room) => void) {
		if (!this.limit.allow(player)) return;
		const room = this.roomOf(player);
		if (room) handle(room);
	}

	feetOf(room: Room, player: Player) {
		const root = player.Character?.FindFirstChild("HumanoidRootPart");
		if (!root?.IsA("BasePart")) return undefined;
		return worldToArtPx(root.Position).sub(worldToArtPx(room.corner));
	}

	private near(room: Room, player: Player, state: PieceState) {
		const feet = this.feetOf(room, player);
		if (!feet) return false;
		const x = math.floor(feet.X / 16);
		const y = math.floor(feet.Y / 16);
		const def = state.spot.def;
		const dx = math.max(state.x - x, 0, x - (state.x + def.w - 1));
		const dy = math.max(state.y - y, 0, y - (state.y + def.h - 1));
		return dx <= PIECE_REACH && dy <= PIECE_REACH;
	}

	someoneAt(room: Room, x: number, y: number, except?: Player) {
		for (const player of this.playersIn(room)) {
			if (player === except) continue;
			const root = player.Character?.FindFirstChild("HumanoidRootPart");
			if (!root?.IsA("BasePart")) continue;
			const [cx, cy] = cellOfPoint(room.corner, root.Position);
			if (cx === x && cy === y) return true;
		}
		return false;
	}

	private send(room: Room, state: PieceState, to?: Player) {
		const args = [room.key, state.spot.id, state.x, state.y, state.mode, state.holder, state.variant] as const;
		if (to) Events.pieceChanged.fire(to, ...args);
		else Events.pieceChanged.fire(this.playersIn(room), ...args);
	}

	private free(room: Room, player: Player, id: string) {
		const state = room.board.pieces.get(id);
		if (!state || state.mode !== 0) return undefined;
		if (room.board.heldBy(player.UserId)) return undefined;
		return this.near(room, player, state) ? state : undefined;
	}

	private own(room: Room, player: Player, id: string, mode: number) {
		const state = room.board.pieces.get(id);
		return state && state.mode === mode && state.holder === player.UserId ? state : undefined;
	}

	private grab(room: Room, player: Player, id: string) {
		const state = this.free(room, player, id);
		if (!state || !canPull(handlingOf(player), state.spot.def)) return;
		state.mode = 1;
		state.holder = player.UserId;
		this.send(room, state);
	}

	private release(room: Room, player: Player, id: string) {
		const state = room.board.pieces.get(id);
		if (!state || state.holder !== player.UserId) return;
		// Carregada e solta (o jogador saiu, caiu na água): volta para onde estava, se ainda couber.
		if (state.mode === 2 && !room.board.fits(state, state.x, state.y)) state.mode = 3;
		else if (state.mode !== 3) state.mode = 0;
		state.holder = 0;
		this.send(room, state);
	}

	private step(room: Room, player: Player, id: string, dx: number, dy: number) {
		const state = this.own(room, player, id, 1);
		if (!state || !this.unitStep(dx, dy) || this.towardPlayer(room, player, state, dx, dy) <= 0) return;
		this.slide(room, player, state, dx, dy);
	}

	private push(room: Room, player: Player, id: string, dx: number, dy: number) {
		const state = this.free(room, player, id);
		if (!state || !this.unitStep(dx, dy) || !canPush(handlingOf(player), state.spot.def)) return;
		if (this.towardPlayer(room, player, state, dx, dy) >= 0) return;
		this.slide(room, player, state, dx, dy);
	}

	private unitStep(dx: number, dy: number) {
		return (
			typeIs(dx, "number") &&
			typeIs(dy, "number") &&
			math.abs(dx) + math.abs(dy) === 1 &&
			dx % 1 === 0 &&
			dy % 1 === 0
		);
	}

	private towardPlayer(room: Room, player: Player, state: PieceState, dx: number, dy: number) {
		const feet = this.feetOf(room, player);
		if (!feet) return 0;
		const def = state.spot.def;
		const center = new Vector2(state.x + def.w / 2, state.y + def.h / 2).mul(16);
		const toFeet = feet.sub(center);
		return toFeet.X * dx + toFeet.Y * dy;
	}

	private slide(room: Room, player: Player, state: PieceState, dx: number, dy: number) {
		const x = state.x + dx;
		const y = state.y + dy;
		if (!this.near(room, player, state)) return;
		if (!room.board.fits(state, x, y, (cx, cy) => this.someoneAt(room, cx, cy, player))) return;
		state.variant = room.board.variantFor(state, x, y);
		state.x = x;
		state.y = y;
		this.send(room, state);
	}

	private lift(room: Room, player: Player, id: string) {
		const state = this.free(room, player, id);
		if (!state || !canLift(handlingOf(player), state.spot.def)) return;
		state.mode = 2;
		state.holder = player.UserId;
		this.send(room, state);
	}

	private place(room: Room, player: Player, id: string, x: number, y: number) {
		const state = this.own(room, player, id, 2);
		if (!state || !typeIs(x, "number") || !typeIs(y, "number") || x % 1 !== 0 || y % 1 !== 0) return;
		const feet = this.feetOf(room, player);
		if (!feet) return;
		// Só logo em volta do pé: o retângulo da peça encosta na célula do pé ou fica a uma célula dela.
		const fx = math.floor(feet.X / 16);
		const fy = math.floor(feet.Y / 16);
		const def = state.spot.def;
		const gapX = math.max(x - fx, 0, fx - (x + def.w - 1));
		const gapY = math.max(y - fy, 0, fy - (y + def.h - 1));
		if (gapX > 2 || gapY > 2) return;
		if (!room.board.fits(state, x, y, (cx, cy) => this.someoneAt(room, cx, cy, player))) return;
		state.variant = room.board.variantFor(state, x, y);
		state.x = x;
		state.y = y;
		state.mode = 0;
		state.holder = 0;
		this.send(room, state);
	}

	private throw(room: Room, player: Player, id: string, facing: number) {
		const state = this.own(room, player, id, 2);
		const feet = this.feetOf(room, player);
		if (!state || !feet || !typeIs(facing, "number") || facing < 0 || facing > 3 || facing % 1 !== 0) return;
		const def = state.spot.def;
		const dir = facing;
		const [sx, sy] = dirStep(dir);
		let [x, y] = frontSpot(feet, dir, def.w, def.h);
		const occupied = (cx: number, cy: number) => this.someoneAt(room, cx, cy, player);
		if (!room.board.fits(state, x, y, occupied)) {
			if (!def.breaks) return;
			this.land(room, state, player, x, y, 3);
			return;
		}
		for (let n = 0; n < THROW_CELLS; n++) {
			if (!room.board.fits(state, x + sx, y + sy, occupied)) break;
			x += sx;
			y += sy;
		}
		this.land(room, state, player, x, y, def.breaks ? 3 : 0);
	}

	private land(room: Room, state: PieceState, player: Player, x: number, y: number, mode: number) {
		if (mode === 0) state.variant = room.board.variantFor(state, x, y);
		state.x = x;
		state.y = y;
		state.mode = mode;
		state.holder = 0;
		Events.pieceThrown.fire(
			this.playersIn(room),
			room.key,
			state.spot.id,
			player.UserId,
			x,
			y,
			mode,
			state.variant,
		);
	}

	private toggleTap(room: Room, player: Player, x: number, y: number) {
		const map = room.board.map;
		if (!typeIs(x, "number") || !typeIs(y, "number") || !map.isTap(x, y)) return;
		const feet = this.feetOf(room, player);
		if (!feet) return;
		const dx = math.abs(math.floor(feet.X / 16) - x);
		const dy = math.abs(math.floor(feet.Y / 16) - y);
		if (dx > TAP_REACH || dy > TAP_REACH) return;
		const key = map.key(x, y);
		const open = room.closedTaps.has(key);
		if (open) room.closedTaps.delete(key);
		else room.closedTaps.add(key);
		Events.tapChanged.fire(this.playersIn(room), room.key, x, y, open);
	}
}
