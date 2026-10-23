import { Controller, OnStart } from "@flamework/core";
import { Players, RunService } from "@rbxts/services";
import { mount, source } from "@rbxts/vide";
import {
	cellOfPoint,
	decodeCell,
	exitAt,
	MAP_ATTRIBUTE,
	MAP_CELL_ATTRIBUTE,
	MAP_SLOT_ATTRIBUTE,
	mapCellPoint,
	mapCorner,
	mapData,
	placeOf,
	zoneAt,
} from "shared/interiorChoice";
import { standingHeight } from "shared/character";
import { EN, TextKey } from "shared/i18n/en";
import { cellOpen, WORLD_MAP_ID, worldCellOf, worldCellPoint, worldSpawn, worldZoneAt } from "shared/world";
import { Events } from "client/network";
import { perfBegin, perfEnd } from "client/perf";
import { screen } from "client/state/screen";
import { t } from "client/ui/i18n";
import { MapHud } from "client/ui/MapHud";
import { MovementController } from "./MovementController";
import { SceneController } from "./SceneController";

type Zone = NonNullable<ReturnType<typeof zoneAt>>;

/** O véu preto da troca de mapa: quanto leva para fechar e para abrir, em segundos. */
const FADE_OUT = 0.15;
const FADE_IN = 0.25;
/** Quanto esperar o servidor levar o personagem ao destino antes de o cliente mesmo o levar. */
const ARRIVAL_TIMEOUT = 1.5;
/** Sem resposta do servidor a uma saída, o véu abre de novo. */
const EXIT_TIMEOUT = 3;
/** A que distância da chegada (em studs, no chão) o personagem conta como chegado. */
const ARRIVED_STUDS = 1.5;
/** A plaquinha da zona: quanto aparece inteira e quanto leva para surgir e sumir, em segundos. */
const ZONE_SECONDS = 3;
const ZONE_FADE = 0.3;
/**
 * Ao nascer, quanto o cliente espera o servidor levar o personagem ao lugar dele (com o chão montado embaixo) antes de
 * ele mesmo levar, em segundos. O servidor leva no quadro em que o personagem entra no Workspace (`MapService.place`,
 * corrigido em 2026-10-23); antes, só esta conferida o levava, aos 3 s.
 */
const SPAWN_WAIT = 1.5;
/** Ao nascer, quanto leva o véu para abrir, em segundos. */
const SPAWN_FADE_IN = 0.2;

/** Uma animação de 0 a 1 (ou de 1 a 0) de um número da tela. */
interface Fade {
	from: number;
	to: number;
	started: number;
	seconds: number;
}

/**
 * As ligações e as zonas do mapa no cliente (seção 12.17 da especificação do Diorama):
 *
 * - **Saída**: quem pisa numa saída do mapa (depois de ter saído das saídas ao menos uma vez, para não voltar
 *   na hora quem chega numa porta) fica parado, a tela escurece e o pedido vai ao servidor (`takeExit`), que
 *   confere e leva o personagem (`MapService`). Quando o atributo `Mapa` muda, o `SceneController` monta o mapa
 *   novo, o cliente espera o personagem chegar e a tela clareia. Recusado, só clareia.
 * - **Zonas**: a zona com nome em que o pé está (`zone`), com as propriedades que o som usa
 *   (`musica`, `ambiente`); ao entrar numa zona, o nome dela aparece no canto, traduzido quando é uma chave de
 *   texto (`zone.…`).
 * - **Mundo** (`WORLD_MAP_ID`): a célula é a do mundo; as zonas são as do plano (`worldZoneAt`) e ainda não há saídas.
 */
@Controller()
export class MapController implements OnStart {
	readonly zone = source<Zone | undefined>(undefined);
	/** Começa fechado: abre quando o personagem nasce no lugar dele, com o chão pronto (`settleSpawn`). */
	private veil = source(0);
	private spawnSerial = 0;
	private zoneFade = source(1);
	private zoneName = source("");
	private zoneShownAt = -math.huge;
	private armed = false;
	private travel?: { since: number; release: () => void; asked: boolean };
	private serial = 0;
	private veilFade?: Fade;
	private veilListeners = new Array<(closing: boolean, asked: boolean) => void>();
	private seenCell = { x: math.huge, y: math.huge, map: "", slot: -1, exit: false };

	constructor(
		private scene: SceneController,
		private movement: MovementController,
	) {}

	onStart() {
		if (!this.scene.interior && !this.scene.worldMap) return;
		mount(
			() =>
				MapHud({
					veil: () => this.veil(),
					zoneName: () => this.zoneName(),
					zoneFade: () => this.zoneFade(),
				}),
			Players.LocalPlayer.WaitForChild("PlayerGui"),
		);
		// O servidor grava o dono e o lugar da casa antes do mapa: espera o fim do quadro para ler os três juntos.
		Players.LocalPlayer.GetAttributeChangedSignal(MAP_ATTRIBUTE).Connect(() => task.defer(() => this.follow()));
		Players.LocalPlayer.GetAttributeChangedSignal(MAP_SLOT_ATTRIBUTE).Connect(() => task.defer(() => this.follow()));
		Events.exitRefused.connect(() => this.finish());
		RunService.Heartbeat.Connect(() => this.tick());
		RunService.RenderStepped.Connect(() => this.animate());
		Players.LocalPlayer.CharacterAdded.Connect((character) => this.settleSpawn(character));
		if (Players.LocalPlayer.Character) this.settleSpawn(Players.LocalPlayer.Character);
		this.follow();
	}

	private static zoneTitle(zone: Zone) {
		return EN[zone.name as TextKey] !== undefined ? t(zone.name as TextKey) : zone.name;
	}

	private localRoot() {
		const root = Players.LocalPlayer.Character?.FindFirstChild("HumanoidRootPart");
		return root?.IsA("BasePart") ? root : undefined;
	}

	private inWorld() {
		return this.scene.mapId === WORLD_MAP_ID;
	}

	/** O centro da célula de chegada no chão, no mapa de agora. */
	private cellPoint(cell: [number, number]) {
		if (this.inWorld()) return worldCellPoint(cell[0], cell[1]);
		return mapCellPoint(this.scene.mapId!, cell[0], cell[1], this.scene.mapSlot);
	}

	private arrival(): [number, number] | undefined {
		if (this.inWorld()) return decodeCell(Players.LocalPlayer.GetAttribute(MAP_CELL_ATTRIBUTE)) || worldSpawn();
		const data = mapData(this.scene.mapId);
		if (!data) return undefined;
		return decodeCell(Players.LocalPlayer.GetAttribute(MAP_CELL_ATTRIBUTE)) || data.spawn;
	}

	private arrived() {
		const root = this.localRoot();
		const cell = this.arrival();
		if (!root || !cell || this.scene.mapId === undefined) return false;
		const target = this.cellPoint(cell);
		return new Vector3(root.Position.X - target.X, 0, root.Position.Z - target.Z).Magnitude < ARRIVED_STUDS;
	}

	private placeHere() {
		const character = Players.LocalPlayer.Character;
		const root = this.localRoot();
		const cell = this.arrival();
		if (!character || !root || !cell || this.scene.mapId === undefined) return;
		const point = this.cellPoint(cell);
		character.PivotTo(new CFrame(new Vector3(point.X, standingHeight(character), point.Z)));
	}

	/** Se o personagem está dentro do mapa de agora (no mundo, na área aberta). */
	private insideMap(root: BasePart) {
		const id = this.scene.mapId;
		if (id === undefined) return false;
		if (this.inWorld()) {
			const [wx, wy] = worldCellOf(root.Position);
			return cellOpen(wx, wy);
		}
		const [x, y] = cellOfPoint(mapCorner(id, this.scene.mapSlot), root.Position);
		return x >= 0 && y >= 0 && x < 64 && y < 64;
	}

	/** Se o chão debaixo do personagem já está montado (no mundo, o pedaço do pé; o interior monta inteiro). */
	private groundReady(root: BasePart) {
		const world = this.scene.worldMap;
		return !world || world.groundAt(root.Position);
	}

	/**
	 * Ao nascer (e renascer): o véu fecha na hora e o personagem fica parado até o servidor o levar ao lugar dele e o
	 * chão debaixo dele estar montado; aí o véu abre. Sem o servidor em `SPAWN_WAIT` segundos, o cliente leva (o
	 * personagem é dele na física). Numa viagem em andamento quem cuida é o `follow`.
	 */
	private settleSpawn(character: Model) {
		this.spawnSerial += 1;
		const serial = this.spawnSerial;
		if (this.travel) return;
		this.veilFade = undefined;
		this.veil(0);
		const release = this.movement.hold();
		task.spawn(() => {
			const started = os.clock();
			const current = () => serial === this.spawnSerial && Players.LocalPlayer.Character === character;
			const settled = () => {
				const root = this.localRoot();
				return root !== undefined && this.insideMap(root) && this.groundReady(root);
			};
			while (current() && !this.travel && !settled() && os.clock() - started < SPAWN_WAIT) task.wait();
			if (current() && !this.travel && !settled()) {
				const root = this.localRoot();
				if (root && !this.insideMap(root)) {
					warn(`[Mapa] o servidor não levou o personagem ao nascer (${this.scene.mapId}); levando à chegada`);
					this.placeHere();
				}
				// O pedaço do pé sai no quadro seguinte ao do personagem chegar (`SceneController.onRender`).
				const placed = os.clock();
				while (current() && !this.travel && !settled() && os.clock() - placed < SPAWN_WAIT) task.wait();
			}
			release();
			if (!current() || this.travel) return;
			this.fadeVeil(1, SPAWN_FADE_IN);
			const ms = math.round((os.clock() - started) * 1000);
			Players.LocalPlayer.SetAttribute("NascerMs", ms);
		});
	}

	onVeil(listener: (closing: boolean, asked: boolean) => void) {
		this.veilListeners.push(listener);
	}

	curtain(closing: boolean, seconds: number) {
		if (this.travel) return;
		this.fadeVeil(closing ? 0 : 1, seconds);
		for (const listener of this.veilListeners) listener(closing, false);
	}

	private begin(asked: boolean) {
		const fresh = this.travel === undefined;
		if (!this.travel) this.travel = { since: os.clock(), release: this.movement.hold(), asked };
		this.travel.asked = asked;
		this.fadeVeil(0, FADE_OUT);
		if (fresh) {
			for (const listener of this.veilListeners) listener(true, asked);
		}
	}

	private finish() {
		const travel = this.travel;
		if (!travel) return;
		this.travel = undefined;
		this.serial += 1;
		travel.release();
		this.fadeVeil(1, FADE_IN);
		for (const listener of this.veilListeners) listener(false, false);
	}

	private follow() {
		const place = placeOf(Players.LocalPlayer);
		if (!place || (place.key === this.scene.mapKey && place.slot === this.scene.mapSlot)) return;
		this.begin(false);
		this.serial += 1;
		const serial = this.serial;
		task.spawn(() => {
			task.wait(FADE_OUT);
			if (serial !== this.serial) return;
			this.scene.enter(place);
			this.armed = false;
			this.zone(undefined);
			const started = os.clock();
			while (!this.arrived() && os.clock() - started < ARRIVAL_TIMEOUT) task.wait();
			if (serial !== this.serial) return;
			if (!this.arrived()) this.placeHere();
			task.wait();
			this.finish();
		});
	}

	private tick() {
		const started = perfBegin("Mapa");
		this.check();
		perfEnd("Mapa", started);
	}

	private check() {
		const now = os.clock();
		// O servidor não respondeu à saída: abre o véu.
		if (this.travel?.asked && now - this.travel.since > EXIT_TIMEOUT) this.finish();

		const root = this.localRoot();
		if (this.inWorld()) {
			if (root && !this.travel) this.checkWorld(root, now);
			return;
		}
		const data = mapData(this.scene.mapId);
		if (!data || !root || this.travel) return;
		const [x, y] = cellOfPoint(mapCorner(data.id, this.scene.mapSlot), root.Position);

		// A saída e a zona só mudam quando o pé muda de célula (seção 5.1 do `PLANO_OTIMIZACAO.md`); na mesma célula,
		// só a saída armada que espera a tela do jogo é conferida de novo.
		const seen = this.seenCell;
		if (seen.x === x && seen.y === y && seen.map === data.id && seen.slot === this.scene.mapSlot) {
			if (!seen.exit || !this.armed) return;
		}
		seen.x = x;
		seen.y = y;
		seen.map = data.id;
		seen.slot = this.scene.mapSlot;

		const exit = exitAt(data, x, y);
		seen.exit = exit !== undefined;
		if (!exit) {
			this.armed = true;
		} else if (this.armed && screen() === "playing") {
			this.armed = false;
			this.begin(true);
			Events.takeExit.fire();
		}

		const zone = zoneAt(data, x, y);
		if (zone !== this.zone()) {
			this.zone(zone);
			if (zone) {
				this.zoneName(MapController.zoneTitle(zone));
				this.zoneShownAt = now;
			}
		}
	}

	/** No mundo: só a zona (as saídas do mundo vêm com a fase 1), quando o pé muda de célula. */
	private checkWorld(root: BasePart, now: number) {
		const [x, y] = worldCellOf(root.Position);
		const seen = this.seenCell;
		if (seen.x === x && seen.y === y && seen.map === WORLD_MAP_ID) return;
		seen.x = x;
		seen.y = y;
		seen.map = WORLD_MAP_ID;
		seen.slot = 0;
		seen.exit = false;
		const zone = worldZoneAt(x, y);
		if (zone !== this.zone()) {
			this.zone(zone);
			if (zone) {
				this.zoneName(MapController.zoneTitle(zone));
				this.zoneShownAt = now;
			}
		}
	}

	private fadeVeil(to: number, seconds: number) {
		this.veilFade = { from: this.veil(), to, started: os.clock(), seconds };
	}

	private animate() {
		const now = os.clock();
		const fade = this.veilFade;
		if (fade) {
			const alpha = math.clamp((now - fade.started) / fade.seconds, 0, 1);
			this.veil(fade.from + (fade.to - fade.from) * alpha);
			if (alpha >= 1) this.veilFade = undefined;
		}
		// A plaquinha surge, fica e some; só aparece com o jogo à mostra.
		const age = now - this.zoneShownAt;
		const shown =
			age < ZONE_FADE
				? age / ZONE_FADE
				: age < ZONE_FADE + ZONE_SECONDS
					? 1
					: 1 - (age - ZONE_FADE - ZONE_SECONDS) / ZONE_FADE;
		const transparency = screen() === "playing" ? 1 - math.clamp(shown, 0, 1) : 1;
		if (transparency !== this.zoneFade()) this.zoneFade(transparency);
	}
}
