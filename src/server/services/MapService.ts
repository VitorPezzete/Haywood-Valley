import { OnStart, Service } from "@flamework/core";
import { Players, Workspace } from "@rbxts/services";
import { CHARACTER_SCALE } from "shared/character";
import {
	arrivalCell,
	cellOfPoint,
	chosenInterior,
	decodeCell,
	encodeCell,
	exitAt,
	isHouse,
	MAP_ATTRIBUTE,
	MAP_CELL_ATTRIBUTE,
	MAP_OWNER_ATTRIBUTE,
	MAP_SLOT_ATTRIBUTE,
	MAX_HOUSE_SLOTS,
	mapCellPoint,
	mapCorner,
	mapData,
	placeOf,
} from "shared/interiorChoice";
import { InteriorData } from "shared/interiors/types";
import { Events } from "server/network";
import { PieceService } from "server/services/PieceService";

/** Quantas células em volta da saída ainda valem: o servidor vê o personagem um pouco atrasado. */
const EXIT_SLACK = 1;
/** Por quanto tempo o servidor espera ver o personagem chegar à saída, em segundos. */
const EXIT_WAIT = 0.75;
/** Intervalo mínimo entre duas viagens do mesmo jogador, em segundos. */
const TRAVEL_COOLDOWN = 1;
/** Quanto esperar o avatar ser reduzido (`CharacterService`) antes de pôr o personagem no lugar. */
const SCALE_TIMEOUT = 10;

/**
 * Em que mapa do Diorama cada jogador está e as ligações entre os mapas (seção 12.17 da especificação), como
 * os `LINK` do Graal: um mapa por vez para cada jogador, gravado no atributo `Mapa` do jogador. Cada mapa fica
 * num lugar próprio do mundo (`mapCenter`), então os jogadores de mapas diferentes nunca se esbarram.
 *
 * - Ao entrar, o jogador vai ao mapa de começo (o teste `InteriorTeste`, ou o de começo do jogo), na célula de
 *   começo; ao renascer, volta à célula em que chegou ao mapa (`MapaCelula`).
 * - O cliente que pisa numa saída pede a viagem (`takeExit`); o servidor confere que o personagem está mesmo
 *   na saída do mapa em que ele está e que o destino existe no jogo, solta o que ele segura, grava o mapa novo e
 *   leva o personagem à chegada pedida.
 * - A casa (`HOUSE_MAPS`) é de cada jogador: quem entra nela vai à cópia do dono (hoje sempre a própria), num
 *   lugar do mundo só dela (`MapaDono` e `MapaLugar` no jogador). O lugar fica reservado enquanto o dono está no
 *   servidor.
 */
/** Quanto esperar o cliente receber a volta do destino antes de levar o personagem, em segundos. */
const STREAM_TIMEOUT = 2;

/** Atributo do Workspace, só para testes: o primeiro lugar de casa a dar. */
const HOUSE_SLOT_TEST_ATTRIBUTE = "CasaLugarTeste";

@Service()
export class MapService implements OnStart {
	private lastTravel = new Map<Player, number>();
	private slots = new Map<number, number>();

	constructor(private readonly pieces: PieceService) {}

	onStart() {
		Players.PlayerAdded.Connect((player) => this.join(player));
		Players.PlayerRemoving.Connect((player) => {
			this.lastTravel.delete(player);
			// O lugar da casa fica livre quando o dono sai e ninguém mais está nela.
			const owner = player.UserId;
			task.defer(() => {
				const inside = Players.GetPlayers().some((other) => other.GetAttribute(MAP_OWNER_ATTRIBUTE) === owner);
				if (!inside && Players.GetPlayerByUserId(owner) === undefined) this.slots.delete(owner);
			});
		});
		for (const player of Players.GetPlayers()) this.join(player);
		Events.takeExit.connect((player) => task.spawn(() => this.takeExit(player)));
	}

	private join(player: Player) {
		const start = chosenInterior();
		if (start && player.GetAttribute(MAP_ATTRIBUTE) === undefined) {
			player.SetAttribute(MAP_CELL_ATTRIBUTE, encodeCell(start.cell));
			this.setPlace(player, start.data.id);
		}
		player.CharacterAdded.Connect((character) => this.place(player, character));
		if (player.Character) this.place(player, player.Character);
	}

	private slotFor(owner: number) {
		const known = this.slots.get(owner);
		if (known !== undefined) return known;
		const used = new Set<number>();
		for (const [, slot] of this.slots) used.add(slot);
		// Teste: `workspace:SetAttribute("CasaLugarTeste", 200)` antes do Play põe a casa a partir desse lugar (o mais
		// longe da origem é o 199, à direita, e o 200, à esquerda), para conferir o desenho longe da origem.
		const test = Workspace.GetAttribute(HOUSE_SLOT_TEST_ATTRIBUTE);
		let slot = typeIs(test, "number") && test >= 1 && test <= MAX_HOUSE_SLOTS ? math.floor(test) : 1;
		while (used.has(slot) && slot < MAX_HOUSE_SLOTS) slot++;
		this.slots.set(owner, slot);
		return slot;
	}

	private setPlace(player: Player, id: string) {
		const owner = isHouse(id) ? player.UserId : 0;
		player.SetAttribute(MAP_OWNER_ATTRIBUTE, owner);
		player.SetAttribute(MAP_SLOT_ATTRIBUTE, owner > 0 ? this.slotFor(owner) : 0);
		player.SetAttribute(MAP_ATTRIBUTE, id);
	}

	private place(player: Player, character: Model) {
		task.spawn(() => {
			const root = character.WaitForChild("HumanoidRootPart", 10);
			if (!root?.IsA("BasePart")) return;
			const started = os.clock();
			while (character.GetScale() > CHARACTER_SCALE * 1.5 && os.clock() - started < SCALE_TIMEOUT) task.wait();
			if (character.Parent === undefined) return;
			const place = placeOf(player);
			const data = place && mapData(place.id);
			if (!place || !data) return;
			const cell = decodeCell(player.GetAttribute(MAP_CELL_ATTRIBUTE)) ?? data.spawn;
			this.move(character, data, cell, place.slot);
		});
	}

	private move(character: Model, data: InteriorData, cell: [number, number], slot: number, travel = false) {
		const root = character.FindFirstChild("HumanoidRootPart");
		const height = root?.IsA("BasePart") ? math.max(root.Position.Y, 1) : 1;
		const point = mapCellPoint(data.id, cell[0], cell[1], slot);
		// Na viagem, com o streaming, o lugar novo fica longe (os mapas a `MAP_SPACING` uns dos outros): o servidor
		// pede que o cliente receba a volta do destino antes de levar o personagem (o jeito que a documentação do
		// streaming manda para levar alguém longe). Ao nascer não: o cliente acabou de entrar e o pedido atrasava o
		// personagem além dos 3 s em que o próprio cliente o leva (visto no Studio em 2026-10-18).
		const player = travel ? Players.GetPlayerFromCharacter(character) : undefined;
		if (player) pcall(() => player.RequestStreamAroundAsync(point, STREAM_TIMEOUT));
		if (character.Parent === undefined) return;
		character.PivotTo(new CFrame(new Vector3(point.X, height, point.Z)));
		if (root?.IsA("BasePart")) root.AssemblyLinearVelocity = Vector3.zero;
	}

	private takeExit(player: Player) {
		const refuse = (why: string) => {
			warn(`[Mapa] ${player.Name}: saída recusada (${why})`);
			Events.exitRefused.fire(player);
		};
		const now = os.clock();
		if (now - (this.lastTravel.get(player) ?? -math.huge) < TRAVEL_COOLDOWN) return refuse("pedido repetido");
		const place = placeOf(player);
		const data = place && mapData(place.id);
		const character = player.Character;
		const root = character?.FindFirstChild("HumanoidRootPart");
		if (!place || !data || !character || !root?.IsA("BasePart")) return refuse("sem mapa ou sem personagem");
		const corner = mapCorner(data.id, place.slot);
		// O cliente para na saída e o servidor vê o personagem com um atraso: confere de novo por um instante.
		this.lastTravel.set(player, now);
		const exitNear = () => {
			const [cx, cy] = cellOfPoint(corner, root.Position);
			for (let dy = -EXIT_SLACK; dy <= EXIT_SLACK; dy++) {
				for (let dx = -EXIT_SLACK; dx <= EXIT_SLACK; dx++) {
					const found = exitAt(data, cx + dx, cy + dy);
					if (found) return found;
				}
			}
			return undefined;
		};
		let exit = exitNear();
		while (!exit && os.clock() - now < EXIT_WAIT && root.Parent !== undefined) {
			task.wait(0.05);
			exit = exitNear();
		}
		if (!exit) {
			const [cx, cy] = cellOfPoint(corner, root.Position);
			return refuse(`longe de uma saída de "${data.id}" (célula ${cx},${cy})`);
		}
		if (player.GetAttribute(MAP_ATTRIBUTE) !== data.id) return refuse("o mapa mudou no caminho");
		const target = mapData(exit.map);
		if (!target) return refuse(`o destino "${exit.map}" não foi gerado para o jogo`);
		this.pieces.leaveMap(player);
		const cell = arrivalCell(target, exit.arrival);
		player.SetAttribute(MAP_CELL_ATTRIBUTE, encodeCell(cell));
		this.setPlace(player, target.id);
		this.move(character, target, cell, placeOf(player)?.slot ?? 0, true);
		print(`[Mapa] ${player.Name}: ${data.id} → ${target.id} (${encodeCell(cell)})`);
	}
}
