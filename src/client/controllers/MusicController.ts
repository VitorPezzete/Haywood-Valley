import { Controller, OnStart } from "@flamework/core";
import { RunService, Workspace } from "@rbxts/services";
import { gameHour } from "shared/clock";
import {
	MUSIC_END_FADE,
	MUSIC_PERIOD_FADE,
	MUSIC_PLACES,
	MUSIC_REST,
	MUSIC_SWITCH_FADE,
	MUSIC_TRACKS,
	MusicTrack,
	periodOf,
	VEIL_FADE_IN,
	VEIL_FADE_OUT,
} from "shared/sounds";
import { perfBegin, perfEnd } from "client/perf";
import { screen } from "client/state/screen";
import { MapController } from "./MapController";
import { SettingsController } from "./SettingsController";
import { SoundController } from "./SoundController";

const TICK_SECONDS = 0.1;

const warned = new Set<string>();
function warnOnce(key: string, text: string) {
	if (warned.has(key)) return;
	warned.add(key);
	warn(text);
}

/** Uma faixa tocando: o volume anda de `level` até `target` em `fade` segundos. */
interface Track {
	key: string;
	sound: Sound;
	volume: number;
	level: number;
	target: number;
	fade: number;
	leaving: boolean;
	ended: boolean;
}

/**
 * O diretor de música (página "Plano de som e música" do Notion, seção 1), no grupo "Music" das Configurações:
 *
 * - **Telas** (título, personalizar): laço contínuo.
 * - **Lugares** (a `musica` da zona ou do mapa, `SoundController.placeProps`): respira. Toca uma faixa inteira, some
 *   nos últimos `MUSIC_END_FADE` segundos, fica de 60 a 180 s só com o ambiente (sorteado) e volta.
 * - **Hora**: a versão de cada período (manhã, dia, tarde, noite) é escolhida ao começar a faixa; no meio dela, a
 *   troca de período é um fade de `MUSIC_PERIOD_FADE` segundos para a versão nova (ou para o silêncio, se o período
 *   não tem música, como a noite da ilha).
 * - **Porta**: a música some com o véu da viagem e volta em 2 s ao clarear; se o lugar novo tem a mesma faixa, ela
 *   continua de onde estava.
 *
 * Faixa sem id não toca, e o Output avisa uma vez.
 */
@Controller()
export class MusicController implements OnStart {
	private group!: SoundGroup;
	private folder!: Folder;
	private current?: Track;
	private leaving = new Array<Track>();
	private place?: string;
	private restUntil = 0;
	private nextFade = MUSIC_SWITCH_FADE;
	private veil = 1;
	private veilTarget = 1;
	private random = new Random();

	constructor(
		private settingsController: SettingsController,
		private sound: SoundController,
		private map: MapController,
	) {}

	onStart() {
		this.group = this.settingsController.group("music");
		this.folder = new Instance("Folder");
		this.folder.Name = "Music";
		this.folder.Parent = Workspace;
		this.map.onVeil((closing) => (this.veilTarget = closing ? 0 : 1));

		// A música anda a cada `TICK_SECONDS` (os fades são de segundos), não a cada quadro.
		let pending = 0;
		RunService.Heartbeat.Connect((dt) => {
			pending += dt;
			if (pending < TICK_SECONDS) return;
			const started = perfBegin("Som");
			this.update(pending);
			pending = 0;
			perfEnd("Som", started);
		});
	}

	private wantedPlace() {
		const now = screen();
		if (now === "loading" || now === "menu") return "titulo";
		if (now === "customize") return "personalizar";
		return this.sound.placeProps().musica;
	}

	private update(dt: number) {
		const now = os.clock();
		this.veil = this.approach(
			this.veil,
			this.veilTarget,
			dt / (this.veilTarget < this.veil ? VEIL_FADE_OUT : VEIL_FADE_IN),
		);

		const placeKey = this.wantedPlace();
		let place;
		if (placeKey !== undefined) {
			place = MUSIC_PLACES[placeKey];
			if (!place) warnOnce(`place.${placeKey}`, `[Som] música "${placeKey}" desconhecida (MUSIC_PLACES em shared/sounds.ts)`);
		}
		const wanted = place ? place.tracks[periodOf(gameHour())] : undefined;
		// Com o véu fechado, a troca é na hora (não se ouve nada); com ele aberto, um fade.
		const hidden = this.veil < 0.05;

		if (placeKey !== this.place) {
			// Lugar novo: a mesma faixa continua; outra entra no lugar, e o silêncio de respirar acaba.
			this.place = placeKey;
			this.restUntil = 0;
			this.nextFade = MUSIC_SWITCH_FADE;
			if (this.current && this.current.key !== wanted) this.drop(hidden ? 0.1 : MUSIC_SWITCH_FADE);
		} else if (this.current && !this.current.leaving && this.current.key !== wanted) {
			// O período mudou no meio da faixa.
			this.drop(MUSIC_PERIOD_FADE);
			this.nextFade = MUSIC_PERIOD_FADE;
			if (place?.mode === "breathe" && wanted === undefined) this.rest();
		}

		// Respira: some no fim da faixa e descansa; acabou, descansa.
		const track = this.current;
		if (track && place?.mode === "breathe") {
			const length = track.sound.TimeLength;
			if (track.ended || (length > 0 && track.sound.TimePosition >= length - MUSIC_END_FADE)) {
				this.drop(MUSIC_END_FADE);
				this.rest();
				this.nextFade = MUSIC_END_FADE;
			}
		}

		if (!this.current && wanted !== undefined && now >= this.restUntil && place) {
			this.current = this.start(wanted, place.mode === "loop", this.nextFade);
		}

		if (this.current) this.drive(this.current, dt);
		for (let i = this.leaving.size() - 1; i >= 0; i--) {
			const old = this.leaving[i];
			this.drive(old, dt);
			if (old.level <= 0 || old.ended) {
				old.sound.Destroy();
				this.leaving.remove(i);
			}
		}
	}

	private start(key: string, looped: boolean, fade: number): Track | undefined {
		const def = MUSIC_TRACKS[key as MusicTrack];
		if (!def || def.id === "") {
			warnOnce(`track.${key}`, `[Som] a faixa "${key}" ainda não tem id (musica.* em assets/registro.json): sem música`);
			return undefined;
		}
		const sound = new Instance("Sound");
		sound.Name = key;
		sound.SoundId = def.id;
		sound.Volume = 0;
		sound.Looped = looped;
		sound.SoundGroup = this.group;
		if (def.region) {
			sound.PlaybackRegionsEnabled = true;
			sound.PlaybackRegion = new NumberRange(def.region[0], def.region[1]);
			if (def.loop) sound.LoopRegion = new NumberRange(def.loop[0], def.loop[1]);
		}
		sound.Parent = this.folder;
		const track: Track = {
			key,
			sound,
			volume: def.volume,
			level: 0,
			target: 1,
			fade,
			leaving: false,
			ended: false,
		};
		sound.Ended.Once(() => (track.ended = true));
		sound.Play();
		return track;
	}

	private drop(fade: number) {
		const track = this.current;
		if (!track) return;
		this.current = undefined;
		track.leaving = true;
		track.target = 0;
		track.fade = fade;
		this.leaving.push(track);
	}

	private rest() {
		this.restUntil = os.clock() + this.random.NextNumber(MUSIC_REST[0], MUSIC_REST[1]);
	}

	private drive(track: Track, dt: number) {
		track.level = this.approach(track.level, track.target, dt / math.max(track.fade, 0.05));
		const volume = track.volume * track.level * this.veil;
		if (math.abs(track.sound.Volume - volume) > 1e-4) track.sound.Volume = volume;
	}

	private approach(value: number, target: number, step: number) {
		if (value < target) return math.min(value + step, target);
		if (value > target) return math.max(value - step, target);
		return value;
	}
}
