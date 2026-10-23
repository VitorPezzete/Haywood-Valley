import { OnStart, Service } from "@flamework/core";
import { DataStoreService, Players, RunService } from "@rbxts/services";
import { LOOK_ATTRIBUTE, parseLook } from "shared/appearance";
import { PlayerDecor, sanitizeDecor } from "shared/decor";
import { PlayerFarm, sanitizeFarm } from "shared/farm";
import { NAME_ATTRIBUTE } from "shared/names";
import {
	decodeSavedLook,
	emptyPlayerData,
	encodeSavedLook,
	isPieceId,
	MAX_FAVORITES,
	PLAYER_DATA_VERSION,
	PlayerData,
	SAVED_LOOKS,
} from "shared/playerData";
import { Events } from "server/network";
import { RATE, RateLimiter } from "server/rateLimit";

/** Nome do DataStore; trocar o sufixo recomeça os dados de todo mundo. */
const STORE = "PlayerData_v1";
/** De quanto em quanto tempo os dados mudados vão para o DataStore, em segundos. */
const SAVE_EVERY = 30;
/**
 * A trava de sessão (`session` no valor salvo): o servidor que tem o jogador grava nela o `JobId` e a hora, e a
 * renova a cada gravação. Um servidor só lê ou grava por cima de uma trava de outro quando ela está vencida, sem
 * renovar há este tempo, em segundos (o dono renova a cada `LOCK_REFRESH`, mesmo sem nada mudado).
 */
const LOCK_STALE = 90;
const LOCK_REFRESH = 60;
/** Quanto tempo quem entra espera a trava de outro servidor soltar ou vencer, em segundos, e de quanto em quanto confere. */
const LOCK_WAIT = LOCK_STALE + 15;
const LOCK_POLL = 5;
/** Esperas entre as tentativas de ler e gravar que falham, em segundos: 3 tentativas a mais. */
const RETRY_WAITS = [1, 2, 4];
/** Gravações em andamento ao mesmo tempo, no máximo: a fila do DataStore tem 30 lugares por servidor. */
const MAX_SAVING = 10;
/** Ao fechar o servidor, quanto tempo esperar as gravações, em segundos (o Roblox dá uns 30). */
const CLOSE_WAIT = 25;

/** A trava de sessão guardada junto com os dados. */
interface SessionLock {
	job: string;
	at: number;
}

type Stored = Partial<PlayerData> & { session?: SessionLock };

/** O resultado de uma leitura com trava. */
type LockedRead = { kind: "ok"; stored?: Stored } | { kind: "locked" } | { kind: "error"; message: unknown };

/** O `JobId` deste servidor; no Studio vem vazio, e todos os Plays do Studio contam como o mesmo servidor. */
function jobId() {
	return game.JobId !== "" ? game.JobId : "studio";
}

function lockedByOther(stored: Stored | undefined) {
	const lock = stored?.session;
	return lock !== undefined && lock.job !== jobId() && os.time() - lock.at < LOCK_STALE;
}

/**
 * Guarda no DataStore do Roblox o que o jogador quer manter entre uma partida e outra: o personagem
 * confirmado (visual e nome, para o Continuar do menu), as cabeças e os corpos favoritos e os visuais
 * salvos da tela de personalizar (pedidos do usuário em 2026-10-17) e a decoração da casa.
 *
 * Desde a fase 1 do `PLANO_OTIMIZACAO.md` (2026-10-18, seção 7.2):
 *
 * - **Trava de sessão**: ler e gravar com `UpdateAsync`, com o servidor dono e a hora no valor (`session`). Quem
 *   entra espera a trava de outro servidor soltar (ao sair, a gravação final tira a trava) ou vencer
 *   (`LOCK_STALE`); assim, um jogador que troca de servidor depressa não tem os dados gravados por cima pelo
 *   servidor velho. O servidor que perde a trava para de gravar aquele jogador.
 * - **Tentar de novo**: leitura e gravação que falham tentam mais 3 vezes, esperando 1, 2 e 4 s. A leitura que
 *   falha de vez avisa o cliente (`playerDataFailed`), que volta ao início com o aviso, em vez de jogar uma sessão
 *   que não grava. No Studio sem acesso às APIs, só avisa no Output, como antes.
 * - **Gravação espalhada**: cada jogador tem a própria hora de gravar (a cada `SAVE_EVERY` segundos, a primeira
 *   sorteada), com no máximo `MAX_SAVING` gravações em andamento.
 * - **Ao fechar o servidor**: todas as gravações em paralelo, esperando até `CLOSE_WAIT` segundos.
 * - **Sem reenviar tudo**: o cliente muda os próprios dados na hora (`state/playerData.ts`); o servidor manda os
 *   dados inteiros só ao carregar e quando recusa um pedido (o favorito além do limite, por exemplo).
 * - **Limite de pedidos** (`server/rateLimit.ts`): `setFavorite` e `saveLook`.
 *
 * Desde 2026-10-23 (formato 2, `PLAYER_DATA_VERSION`): a fazenda do lote do mundo (`farm`, `FarmService`); a
 * gravação guarda os campos do salvo que este servidor não conhece (de uma versão mais nova), e o salvo de uma versão
 * mais nova fica com o número dela.
 */
@Service()
export class PlayerDataService implements OnStart {
	private store?: DataStore;
	private data = new Map<Player, PlayerData>();
	private loaded = new Set<Player>();
	private dirty = new Set<Player>();
	private nextSave = new Map<Player, number>();
	private lockedAt = new Map<Player, number>();
	private saving = 0;
	private busy = new Set<Player>();
	private leaving = new Set<Player>();
	private closing = false;
	private loadedListeners = new Array<(player: Player) => void>();
	private random = new Random();
	private confirmed = new Set<Player>();
	private ready = new Set<Player>();

	onStart() {
		const [ok, store] = pcall(() => DataStoreService.GetDataStore(STORE));
		if (ok) this.store = store;
		else warn(`[PlayerData] sem DataStore: ${store}`);

		Players.PlayerAdded.Connect((player) => this.load(player));
		Players.PlayerRemoving.Connect((player) => this.release(player));
		for (const player of Players.GetPlayers()) task.spawn(() => this.load(player));
		game.BindToClose(() => this.closeAll());
		task.spawn(() => {
			while (true) {
				task.wait(1);
				this.saveDue();
			}
		});

		const favoriteLimit = new RateLimiter(RATE.setFavorite);
		Events.setFavorite.connect((player, kind, id, favorite) => {
			const data = this.data.get(player);
			if (!data || !favoriteLimit.allow(player)) return;
			if (!isPieceId(kind, id)) return this.push(player, data);
			const list = kind === "head" ? data.favoriteHeads : data.favoriteBodies;
			const at = list.indexOf(id);
			if (favorite && at < 0 && list.size() < MAX_FAVORITES) list.push(id);
			else if (!favorite && at >= 0) list.remove(at);
			else return this.push(player, data);
			this.dirty.add(player);
		});

		// O personagem confirmado: o visual que o AppearanceService aceitou e o nome que o NameService
		// filtrou, lidos dos atributos depois de o jogador confirmar a tela de personalizar.
		Events.setLook.connect((player) => {
			task.defer(() => {
				const data = this.data.get(player);
				const look = parseLook(player.GetAttribute(LOOK_ATTRIBUTE));
				if (!data || !look) return;
				const character = encodeSavedLook(look);
				this.confirmed.add(player);
				if (data.character === character) return;
				data.character = character;
				this.dirty.add(player);
			});
		});
		Players.PlayerAdded.Connect((player) => this.watchName(player));
		for (const player of Players.GetPlayers()) this.watchName(player);

		const saveLimit = new RateLimiter(RATE.saveLook);
		Events.saveLook.connect((player, slot, look) => {
			const data = this.data.get(player);
			if (!data || !saveLimit.allow(player)) return;
			if (!typeIs(slot, "number") || slot !== math.floor(slot) || slot < 0 || slot >= SAVED_LOOKS) return;
			if (!typeIs(look, "string") || (look !== "" && decodeSavedLook(look) === undefined)) {
				return this.push(player, data);
			}
			data.savedLooks[slot] = look;
			this.dirty.add(player);
		});
	}

	private watchName(player: Player) {
		player.GetAttributeChangedSignal(NAME_ATTRIBUTE).Connect(() => {
			const data = this.data.get(player);
			const name = player.GetAttribute(NAME_ATTRIBUTE);
			if (!data || !this.confirmed.has(player) || !typeIs(name, "string") || name === player.DisplayName) return;
			data.characterName = name;
			this.dirty.add(player);
		});
	}

	decorOf(player: Player) {
		return this.data.get(player)?.decor;
	}

	farmOf(player: Player) {
		return this.data.get(player)?.farm;
	}

	setFarm(player: Player, farm: PlayerFarm) {
		const data = this.data.get(player);
		if (!data) return;
		data.farm = farm;
		this.dirty.add(player);
	}

	setDecor(player: Player, decor: PlayerDecor) {
		const data = this.data.get(player);
		if (!data) return;
		data.decor = decor;
		this.dirty.add(player);
	}

	saveNow(player: Player) {
		if (!this.data.has(player)) return false;
		this.dirty.add(player);
		this.nextSave.set(player, os.clock() + SAVE_EVERY);
		return this.save(player);
	}

	isReady(player: Player) {
		return this.ready.has(player);
	}

	onLoaded(listener: (player: Player) => void) {
		this.loadedListeners.push(listener);
	}

	private key(player: Player) {
		return `player_${player.UserId}`;
	}

	private push(player: Player, data: PlayerData) {
		Events.playerData.fire(
			player,
			data.favoriteHeads,
			data.favoriteBodies,
			data.savedLooks,
			data.character,
			data.characterName,
		);
	}

	private retry<T>(attempt: () => T): [true, T] | [false, unknown] {
		// No Studio sem acesso às APIs, o erro se repetiria: tenta uma vez só.
		const waits = RunService.IsStudio() ? [] : RETRY_WAITS;
		let failure: unknown;
		for (let index = 0; index <= waits.size(); index++) {
			const [ok, result] = pcall(attempt);
			if (ok) return [true, result];
			failure = result;
			if (index < waits.size()) task.wait(waits[index]);
		}
		return [false, failure];
	}

	private lockAndRead(player: Player): LockedRead {
		const store = this.store!;
		const [ok, result] = this.retry(() => {
			let outcome: LockedRead = { kind: "locked" };
			store.UpdateAsync(this.key(player), (old: Stored | undefined) => {
				if (lockedByOther(old)) {
					outcome = { kind: "locked" };
					return $tuple(undefined);
				}
				outcome = { kind: "ok", stored: old };
				const value: Stored = { ...(old ?? {}), session: { job: jobId(), at: os.time() } };
				return $tuple(value, [player.UserId]);
			});
			return outcome;
		});
		return ok ? result : { kind: "error", message: result };
	}

	private load(player: Player) {
		const data = emptyPlayerData();
		this.data.set(player, data);
		if (this.store) {
			// Espera a trava de outro servidor (o jogador acabou de sair dele) soltar ou vencer.
			const started = os.clock();
			let result = this.lockAndRead(player);
			while (result.kind === "locked" && os.clock() - started < LOCK_WAIT && player.Parent) {
				task.wait(LOCK_POLL);
				result = this.lockAndRead(player);
			}
			if (!player.Parent) return;
			if (result.kind === "ok") {
				this.loaded.add(player);
				this.lockedAt.set(player, os.clock());
				this.nextSave.set(player, os.clock() + this.random.NextNumber(0, SAVE_EVERY));
				const saved = result.stored;
				if (saved) {
					if (typeIs(saved.favoriteHeads, "table")) {
						data.favoriteHeads = saved.favoriteHeads.filter((id) => isPieceId("head", id));
					}
					if (typeIs(saved.favoriteBodies, "table")) {
						data.favoriteBodies = saved.favoriteBodies.filter((id) => isPieceId("body", id));
					}
					if (typeIs(saved.character, "string") && decodeSavedLook(saved.character)) {
						data.character = saved.character;
					}
					if (typeIs(saved.characterName, "string")) data.characterName = saved.characterName.sub(1, 64);
					data.decor = sanitizeDecor(saved.decor);
					data.farm = sanitizeFarm(saved.farm);
					if (typeIs(saved.v, "number") && saved.v > PLAYER_DATA_VERSION) data.v = saved.v;
					if (typeIs(saved.savedLooks, "table")) {
						for (let slot = 0; slot < SAVED_LOOKS; slot++) {
							const look = saved.savedLooks[slot];
							data.savedLooks[slot] = typeIs(look, "string") ? look : "";
						}
					}
				}
			} else if (RunService.IsStudio()) {
				warn(
					"[PlayerData] DataStore indisponível no Studio (ligue Enable Studio Access to API Services); nada será salvo",
				);
			} else {
				const why = result.kind === "locked" ? "outro servidor ainda tem os dados" : tostring(result.message);
				warn(`[PlayerData] não deu para ler os dados de ${player.Name}: ${why}`);
				// Uma sessão que não grava perderia tudo o que o jogador fizer: ele volta ao início com o aviso.
				Events.playerDataFailed.fire(player);
			}
		}
		if (player.Parent) this.push(player, data);
		this.ready.add(player);
		for (const listener of this.loadedListeners) task.spawn(listener, player);
	}

	private save(player: Player, unlock = false) {
		// Uma gravação de cada vez por jogador: a que renova a trava, ainda no ar, não pode chegar depois da que a solta
		// (ao sair) e travar de novo os dados de quem já foi para outro servidor.
		const waitStarted = os.clock();
		while (this.busy.has(player) && os.clock() - waitStarted < CLOSE_WAIT) task.wait(0.1);
		const data = this.data.get(player);
		if (!data || !this.store || !this.loaded.has(player)) return false;
		// Quem está saindo só grava a gravação que solta a trava.
		if (!unlock && (this.leaving.has(player) || this.closing)) return false;
		this.busy.add(player);
		const saved = this.write(player, data, unlock);
		this.busy.delete(player);
		if (saved && unlock) print(`[PlayerData] ${player.Name}: dados gravados e trava solta`);
		return saved;
	}

	private write(player: Player, data: PlayerData, unlock: boolean) {
		const store = this.store!;
		const hadChanges = this.dirty.has(player);
		this.dirty.delete(player);
		this.saving++;
		let lost = false;
		const [ok, err] = this.retry(() => {
			lost = false;
			store.UpdateAsync(this.key(player), (old: Stored | undefined) => {
				if (lockedByOther(old)) {
					lost = true;
					return $tuple(undefined);
				}
				// Os campos que este servidor não conhece (de uma versão mais nova do jogo) ficam como estavam.
				const value: Stored = {
					...(old ?? {}),
					...data,
					session: unlock ? undefined : { job: jobId(), at: os.time() },
				};
				return $tuple(value, [player.UserId]);
			});
		});
		this.saving--;
		if (!ok) {
			warn(`[PlayerData] não deu para salvar ${player.Name}: ${err}`);
			if (hadChanges) this.dirty.add(player);
			return false;
		}
		if (lost) {
			warn(`[PlayerData] ${player.Name} está noutro servidor: este para de gravar os dados dele`);
			this.loaded.delete(player);
			return false;
		}
		this.lockedAt.set(player, os.clock());
		return true;
	}

	private saveDue() {
		if (this.closing) return;
		const now = os.clock();
		for (const player of this.loaded) {
			if (this.saving >= MAX_SAVING) return;
			if (now < (this.nextSave.get(player) ?? 0)) continue;
			const stale = now - (this.lockedAt.get(player) ?? 0) >= LOCK_REFRESH;
			if (!this.dirty.has(player) && !stale) continue;
			this.nextSave.set(player, now + SAVE_EVERY);
			task.spawn(() => this.save(player));
		}
	}

	private release(player: Player) {
		this.leaving.add(player);
		this.save(player, true);
		this.leaving.delete(player);
		this.data.delete(player);
		this.loaded.delete(player);
		this.dirty.delete(player);
		this.confirmed.delete(player);
		this.ready.delete(player);
		this.nextSave.delete(player);
		this.lockedAt.delete(player);
	}

	private closeAll() {
		this.closing = true;
		const started = os.clock();
		let pending = 0;
		for (const player of [...this.loaded]) {
			pending++;
			task.spawn(() => {
				this.save(player, true);
				pending--;
			});
		}
		while (pending > 0 && os.clock() - started < CLOSE_WAIT) task.wait(0.1);
	}
}
