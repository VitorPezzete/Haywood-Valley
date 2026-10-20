import { Controller, OnStart } from "@flamework/core";
import { ContentProvider, RunService } from "@rbxts/services";
import { MISSING_IMAGE } from "shared/assets";
import { decodeSavedLook } from "shared/playerData";
import { groundOffset, snapToArtPx, worldToArtPx } from "shared/view";
import { InteriorData } from "shared/interiors/types";
import { cardCFrame } from "client/world/card";
import { createCollider } from "client/world/collider";
import { ACTOR_FEET, ACTOR_FIGURE, BLINK_MAX, BLINK_MIN, BLINK_TIME, figureLayers } from "client/world/graalArt";
import { GroundLayer } from "client/world/ground";
import { INTERIOR_TILE } from "client/world/interior";
import { dressShell, poseShell, puppetOnScreen, storeShell, takeShell, toneShell } from "client/world/puppet";
import { Sprites } from "client/world/sprites";
import { perfBegin, perfEnd } from "client/perf";
import { ActionController } from "./ActionController";
import { DaylightController } from "./DaylightController";
import { SceneController } from "./SceneController";

const SHADOW = Sprites.rockShadow;

type ResidentEntry = NonNullable<InteriorData["residents"]>[number];
type Shell = ReturnType<typeof takeShell>;
type Dressed = ReturnType<typeof dressShell>;
type Pose = Parameters<typeof poseShell>[2];
type Facing = Parameters<typeof dressShell>[2];
type Lit = Parameters<typeof toneShell>[1];
type SavedLook = NonNullable<ReturnType<typeof decodeSavedLook>>;

/** Um morador do mapa montado: o que ele é, onde fica e, enquanto está na tela, o boneco dele. */
interface Resident {
	data: ResidentEntry;
	look: SavedLook;
	at: Vector3;
	screenPx: Vector2;
	pose: Pose;
	shadow?: ImageLabel;
	shell?: Shell;
	dressed?: Dressed;
	nextBlink: number;
	closed: boolean;
	lit?: Lit;
	litKey: number;
}

/**
 * Os moradores do mapa montado (etapa F do Diorama, seção 12.20): os bonecos que o autor pôs no mapa (a chave
 * `moradores` do bloco, `InteriorData.residents`), desenhados como os jogadores (`client/world/puppet.ts`: as mesmas
 * camadas, folhas e estilos por peça), parados, sentados (no assento, para onde o Diorama guardou) ou deitados (na
 * cama, com a cabeça no travesseiro e a coberta por cima, pelo `ActionController`, como o jogador). Piscam, pegam o
 * tom do dia (estão na pasta `World`) e a luz dos halos em que estão. Ninguém os atravessa: a célula de cada um
 * (de quem deita, a cama da coluna) tem um bloqueio e as peças e o Decorar a recusam (`InteriorMap.residentCells`).
 *
 * Desempenho (seção "Desempenho" do CLAUDE.md): fora da tela, o morador não tem boneco (o dele volta ao reservatório
 * comum com os jogadores) e não faz nada; na tela, só pisca e relê a luz quando ela muda. As folhas carregam por trás
 * ao montar o mapa, só as dos visuais dos moradores dele.
 *
 * Os moradores ainda não andam nem falam (os moradores vivos vêm depois, 12.20): o nome fica guardado para o
 * diálogo.
 */
@Controller()
export class ResidentController implements OnStart {
	private residents = new Array<Resident>();
	private colliders = new Array<BasePart>();
	private dirty = true;
	private random = new Random();
	private warned = new Set<string>();

	constructor(
		private scene: SceneController,
		private actions: ActionController,
		private daylight: DaylightController,
	) {}

	onStart() {
		this.scene.onMapChanged(() => {
			this.clear();
			this.dirty = true;
		});
		RunService.BindToRenderStep("ResidentSprites", Enum.RenderPriority.Camera.Value - 1, () => this.update());
	}

	counts() {
		let onScreen = 0;
		for (const resident of this.residents) {
			if (resident.shell) onScreen += 1;
		}
		return { shown: this.residents.size(), onScreen };
	}

	private clear() {
		for (const resident of this.residents) {
			this.hide(resident);
			resident.shadow?.Destroy();
			if (resident.data.pose === "lie") this.actions.leaveResidentBed(resident.data.name);
		}
		this.residents.clear();
		for (const collider of this.colliders) collider.Destroy();
		this.colliders.clear();
	}

	private build() {
		const interior = this.scene.interior;
		const map = this.scene.map;
		const data = map?.data;
		if (!interior || !map || !data) {
			this.dirty = false;
			return;
		}
		if (this.actions.currentBoard()?.map !== map) return;
		this.dirty = false;

		const now = os.clock();
		const sheets = new Set<string>();
		for (const entry of data.residents || []) {
			const look = decodeSavedLook(entry.look);
			if (!look) {
				const key = `${data.id}/${entry.name}`;
				if (!this.warned.has(key)) {
					this.warned.add(key);
					warn(`[Moradores] ${data.id}: o visual de ${entry.name} não abre (${entry.look}); o morador fica de fora`);
				}
				continue;
			}
			for (const layer of figureLayers(look)) {
				if (layer.image !== "" && layer.image !== MISSING_IMAGE) sheets.add(layer.image);
			}
			const lying = entry.pose === "lie";
			const at = snapToArtPx(
				(lying ? this.actions.lieResident(entry.name, entry.x, entry.y) : undefined) ||
					interior.cellCenter(entry.x, entry.y),
			);
			const anim = lying ? 3 : entry.pose === "sit" ? 2 : 0;
			let shadow: ImageLabel | undefined;
			if (anim === 0) {
				shadow = interior.live.addFlat(SHADOW, at, GroundLayer.Shadow);
				shadow.Visible = false;
			}
			this.residents.push({
				data: entry,
				look,
				at,
				screenPx: worldToArtPx(at),
				pose: { anim, frame: 0, facing: lying ? 2 : (entry.facing as Facing), swim: false },
				shadow,
				nextBlink: now + this.random.NextNumber(BLINK_MIN, BLINK_MAX),
				closed: lying,
				litKey: -1,
			});
		}

		// Ninguém atravessa um morador: um bloqueio de uma célula em cada célula dele.
		for (const key of map.residentCells) {
			const x = key % 1024;
			const y = math.floor(key / 1024);
			const base = interior.cellCorner(x, y).add(groundOffset(INTERIOR_TILE / 2, INTERIOR_TILE));
			this.colliders.push(
				createCollider(interior.folder, "Resident", base, new Vector2(INTERIOR_TILE, INTERIOR_TILE)),
			);
		}

		// Só as folhas dos visuais dos moradores deste mapa, por trás.
		const list = new Array<string>();
		for (const sheet of sheets) list.push(sheet);
		if (list.size() > 0) task.spawn(() => ContentProvider.PreloadAsync(list));
		if (this.residents.size() > 0) {
			print(`[Moradores] ${data.id}: ${this.residents.size()} morador(es), ${list.size()} folha(s)`);
		}
	}

	private show(resident: Resident) {
		const shell = takeShell(this.scene.world, `Resident_${resident.data.name}`);
		resident.shell = shell;
		resident.dressed = dressShell(shell, resident.look, resident.pose.facing);
		poseShell(shell, resident.dressed, resident.pose, resident.closed);
		shell.card.part.CFrame = cardCFrame(ACTOR_FIGURE, ACTOR_FEET, resident.at);
		resident.lit = undefined;
		resident.litKey = -1;
		shell.gui.Enabled = true;
		if (resident.shadow) resident.shadow.Visible = true;
	}

	private hide(resident: Resident) {
		const shell = resident.shell;
		if (!shell) return;
		resident.shell = undefined;
		resident.dressed = undefined;
		storeShell(shell);
		if (resident.shadow) resident.shadow.Visible = false;
	}

	private update() {
		const started = perfBegin("Moradores");
		if (this.dirty) this.build();
		const now = os.clock();
		const key = this.daylight.lightKey();
		for (const resident of this.residents) {
			if (!puppetOnScreen(resident.screenPx)) {
				this.hide(resident);
				continue;
			}
			if (!resident.shell) this.show(resident);
			const shell = resident.shell!;

			// Pisca a cada 3 a 6 segundos; deitado, o olho fica fechado.
			if (resident.pose.anim !== 3) {
				if (now >= resident.nextBlink + BLINK_TIME) {
					resident.nextBlink = now + this.random.NextNumber(BLINK_MIN, BLINK_MAX);
				}
				const closed = now >= resident.nextBlink;
				if (closed !== resident.closed) {
					resident.closed = closed;
					poseShell(shell, resident.dressed!, resident.pose, closed);
				}
			}

			// A luz dos halos só é lida de novo quando alguma luz muda: o morador não sai do lugar.
			if (key !== resident.litKey) {
				resident.litKey = key;
				const lit = this.daylight.lightAt(resident.at);
				if (lit !== resident.lit) {
					resident.lit = lit;
					toneShell(shell, lit);
				}
			}
		}
		perfEnd("Moradores", started);
	}
}
