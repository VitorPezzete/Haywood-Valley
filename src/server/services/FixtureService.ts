import { OnStart, Service } from "@flamework/core";
import { Players, Workspace } from "@rbxts/services";
import { CLOCK_OFFSET_ATTRIBUTE, HOUR_TEST_ATTRIBUTE, secondsUntilWake, WAKE_HOUR } from "shared/clock";
import {
	chestOfPiece,
	COOK_SECONDS,
	Fixture,
	FIXTURE_REACH,
	FIXTURE_SETTLE,
	findFixtures,
	nearCells,
} from "shared/fixtures";
import { Events } from "server/network";
import { RATE, RateLimiter, READY_BURST } from "server/rateLimit";
import { PieceService, Room } from "server/services/PieceService";
import { PlayerDataService } from "server/services/PlayerDataService";

/**
 * O baú, o fogão e as peças-baú de um mapa montado, com o estado da sessão. `room` é o mapa de que ele saiu: a casa
 * de um dono que saiu e voltou é um mapa novo com a mesma chave, e o estado da antiga não vale para ela.
 */
interface RoomFixtures {
	room: Room;
	fixtures: Map<string, Fixture>;
	state: Map<string, boolean>;
	openPieces: Map<string, [number, number]>;
	lit: Map<string, number>;
	/** Quando e por quem (`UserId`) cada um foi mexido por último (`FIXTURE_SETTLE`). */
	touched: Map<string, [number, number]>;
}

/** De quanto em quanto tempo o servidor confere se quem pediu para dormir continua na cama, em segundos. */
const SLEEP_CHECK = 1;

/**
 * As interações que não mudam peça de lugar (etapa E do roteiro do Diorama, item 17):
 *
 * - **Baú**: abre e fecha (o fixo do mapa, pelo id `chest@x,y`, e a peça móvel que é baú, pelo id dela), trocando
 *   os tiles pela versão aberta da mesma folha (`shared/fixtures.ts`). O que tem dentro espera o inventário. O
 *   baú grande do castelo confere a distância pelo retângulo dele fechado (4 × 4, o que bloqueia): a tampa aberta,
 *   nas duas linhas de cima, é só desenho do cliente e não bloqueia.
 * - **Fogão**: acende e apaga a boca e o forno. Aceso por `COOK_SECONDS`, chama o gancho de cozinhar (`cook`), que
 *   hoje só avisa no Output (receitas e ingredientes esperam o inventário).
 * - **Dormir**: deitado numa cama (a do mapa ou a posta no Decorar), a tecla de ação pede para dormir. Quando todos
 *   os jogadores do servidor estão na cama (o relógio de teste é um só para todos), a hora pula para a manhã
 *   (`RelogioDesvio`, ou o `HoraTeste` quando a hora está fixa) e os dados de quem dormiu são salvos na hora.
 *
 * O estado vale só para a sessão, como o das torneiras, e vai a quem está no mesmo mapa (`fixtureChanged`).
 */
@Service()
export class FixtureService implements OnStart {
	private rooms = new Map<string, RoomFixtures>();
	private limit = new RateLimiter(RATE.pieces);
	private sleepLimit = new RateLimiter(1, 2);
	/** O mesmo limite do `PieceService` para o `piecesReady`: os dois baldes andam juntos, então aceitam os mesmos pedidos. */
	private readyLimit = new RateLimiter(RATE.ready, READY_BURST);
	private sleeping = new Set<Player>();

	constructor(
		private readonly pieces: PieceService,
		private readonly playerData: PlayerDataService,
	) {}

	onStart() {
		this.pieces.onRoomCreated((room) => this.rooms.set(room.key, this.build(room)));
		Events.piecesReady.connect((player) => {
			// Pedido além da cadência é ignorado em silêncio, como no `PieceService`.
			if (!this.readyLimit.allow(player)) return;
			const room = this.pieces.roomOf(player);
			const fixtures = room && this.fixturesOf(room);
			if (!room || !fixtures) return;
			for (const [id, on] of fixtures.state) Events.fixtureChanged.fire(player, room.key, id, on);
			for (const [id] of fixtures.openPieces) {
				if (this.pieceStillOpen(room, fixtures, id)) Events.fixtureChanged.fire(player, room.key, id, true);
			}
		});
		Events.useFixture.connect((player, id) => {
			if (!typeIs(id, "string") || !this.limit.allow(player)) return;
			const room = this.pieces.roomOf(player);
			if (room) this.use(room, player, id);
		});
		Events.sleep.connect((player) => {
			if (this.sleepLimit.allow(player)) this.askSleep(player);
		});
		Players.PlayerRemoving.Connect((player) => {
			this.sleeping.delete(player);
			// Quem saiu podia ser o último acordado.
			task.defer(() => this.tryPassNight());
			// A casa vazia de um dono que saiu é esquecida, como no `PieceService`.
			task.defer(() => {
				for (const [key, fixtures] of this.rooms) {
					const room = fixtures.room;
					if (
						room.owner > 0 &&
						this.pieces.playersIn(room).size() === 0 &&
						Players.GetPlayerByUserId(room.owner) === undefined
					) {
						this.rooms.delete(key);
					}
				}
			});
		});
		task.spawn(() => {
			while (true) {
				task.wait(SLEEP_CHECK);
				for (const player of [...this.sleeping]) {
					if (!this.inBed(player)) this.sleeping.delete(player);
				}
			}
		});
	}

	private build(room: Room): RoomFixtures {
		const fixtures = new Map<string, Fixture>();
		for (const fixture of findFixtures(room.board.map)) fixtures.set(fixture.id, fixture);
		if (fixtures.size() > 0) print(`[Fixos] ${room.key}: ${fixtures.size()} baú(s) e fogão(ões)`);
		return { room, fixtures, state: new Map(), openPieces: new Map(), lit: new Map(), touched: new Map() };
	}

	private fixturesOf(room: Room) {
		let fixtures = this.rooms.get(room.key);
		if (!fixtures || fixtures.room !== room) {
			fixtures = this.build(room);
			this.rooms.set(room.key, fixtures);
		}
		return fixtures;
	}

	private pieceStillOpen(room: Room, fixtures: RoomFixtures, id: string) {
		const at = fixtures.openPieces.get(id);
		const state = room.board.pieces.get(id);
		if (!at || !state) return false;
		if (state.mode === 0 && state.x === at[0] && state.y === at[1]) return true;
		fixtures.openPieces.delete(id);
		return false;
	}

	private feetCell(room: Room, player: Player): [number, number] | undefined {
		const feet = this.pieces.feetOf(room, player);
		return feet ? [math.floor(feet.X / 16), math.floor(feet.Y / 16)] : undefined;
	}

	/** Se `id` pode ser mexido por `player` agora; se pode, marca que foi ele (`FIXTURE_SETTLE`). */
	private settle(fixtures: RoomFixtures, player: Player, id: string) {
		const now = os.clock();
		const last = fixtures.touched.get(id);
		if (last && last[1] !== player.UserId && now - last[0] < FIXTURE_SETTLE) return false;
		fixtures.touched.set(id, [now, player.UserId]);
		return true;
	}

	/**
	 * O pedido de mexer em `id`, conferido no mapa do próprio jogador (`roomOf`, pelo atributo que o servidor
	 * grava): o id só é procurado nesse mapa, e a distância é do pé dele nesse mapa. Baú ou fogão de outro mapa, ou
	 * de outra casa, não é achado.
	 */
	private use(room: Room, player: Player, id: string) {
		const fixtures = this.fixturesOf(room);
		const cell = this.feetCell(room, player);
		if (!cell) return;
		const fixture = fixtures.fixtures.get(id);
		if (fixture) {
			if (!nearCells(cell[0], cell[1], fixture.x, fixture.y, fixture.w, fixture.h, FIXTURE_REACH)) return;
			if (!this.settle(fixtures, player, id)) return;
			const on = !(fixtures.state.get(id) ?? fixture.startsOn);
			fixtures.state.set(id, on);
			Events.fixtureChanged.fire(this.pieces.playersIn(room), room.key, id, on);
			if (fixture.kind === "stove" && on) this.startCooking(room, fixtures, fixture, player);
			return;
		}
		// A peça móvel que é baú: abre e fecha no lugar, só no chão e sem ninguém segurando.
		const piece = room.board.pieces.get(id);
		if (!piece || piece.mode !== 0) return;
		const def = room.board.defOf(piece);
		if (!chestOfPiece(def)) return;
		if (!nearCells(cell[0], cell[1], piece.x, piece.y, def.w, def.h, FIXTURE_REACH)) return;
		if (!this.settle(fixtures, player, id)) return;
		const open = !this.pieceStillOpen(room, fixtures, id);
		if (open) fixtures.openPieces.set(id, [piece.x, piece.y]);
		else fixtures.openPieces.delete(id);
		Events.fixtureChanged.fire(this.pieces.playersIn(room), room.key, id, open);
	}

	private startCooking(room: Room, fixtures: RoomFixtures, fixture: Fixture, player: Player) {
		const serial = (fixtures.lit.get(fixture.id) ?? 0) + 1;
		fixtures.lit.set(fixture.id, serial);
		task.delay(COOK_SECONDS, () => {
			if (fixtures.lit.get(fixture.id) !== serial || fixtures.state.get(fixture.id) !== true) return;
			this.cook(room, fixture, player);
		});
	}

	private cook(room: Room, fixture: Fixture, player: Player) {
		print(`[Fixos] ${room.key}: ${player.Name} cozinhou no ${fixture.id} (sem receitas: o inventário ainda não existe)`);
	}

	private inBed(player: Player) {
		const room = this.pieces.roomOf(player);
		const cell = room && this.feetCell(room, player);
		if (!room || !cell) return false;
		const kind = room.board.kind(cell[0], cell[1]);
		return kind === 4 || kind === 5;
	}

	private askSleep(player: Player) {
		if (!this.inBed(player)) {
			Events.slept.fire(player, false, 0);
			return;
		}
		this.sleeping.add(player);
		if (this.tryPassNight()) return;
		const awake = Players.GetPlayers().filter((other) => !this.sleeping.has(other)).size();
		Events.slept.fire(player, false, awake);
	}

	private tryPassNight() {
		const players = Players.GetPlayers();
		if (this.sleeping.size() === 0 || players.some((player) => !this.sleeping.has(player) || !this.inBed(player))) {
			return false;
		}
		const sleepers = [...this.sleeping];
		this.sleeping.clear();
		const fixed = Workspace.GetAttribute(HOUR_TEST_ATTRIBUTE);
		if (typeIs(fixed, "number")) {
			// A hora está fixa para testar: fica fixa, na manhã.
			Workspace.SetAttribute(HOUR_TEST_ATTRIBUTE, WAKE_HOUR);
		} else {
			const offset = Workspace.GetAttribute(CLOCK_OFFSET_ATTRIBUTE);
			Workspace.SetAttribute(CLOCK_OFFSET_ATTRIBUTE, (typeIs(offset, "number") ? offset : 0) + secondsUntilWake());
		}
		print(`[Fixos] ${sleepers.size()} jogador(es) dormiu(ram): a hora pulou para as ${WAKE_HOUR}h`);
		for (const player of sleepers) {
			task.spawn(() => {
				const saved = this.playerData.saveNow(player);
				print(`[Fixos] ${player.Name} dormiu; dados ${saved ? "salvos" : "não salvos (sem DataStore)"}`);
				if (player.Parent) Events.slept.fire(player, true, 0);
			});
		}
		return true;
	}
}
