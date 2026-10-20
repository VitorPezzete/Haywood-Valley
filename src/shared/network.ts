import { Networking } from "@flamework/networking";

interface ClientToServerEvents {
	/** O visual montado na tela de personalizar, no texto de `encodeLook`. */
	setLook(look: string): void;
	setName(name: string): void;
	/** O rosto do jogador reagiu a alguma coisa: índice em `Faces.reactions` e se o balão aparece. */
	react(reaction: number, bubble: boolean): void;
	setFavorite(kind: "head" | "body", id: string, favorite: boolean): void;
	saveLook(slot: number, look: string): void;
	setAction(kind: string, facing: number): void;
	piecesReady(): void;
	grabPiece(id: string): void;
	releasePiece(id: string): void;
	stepPiece(id: string, dx: number, dy: number): void;
	pushPiece(id: string, dx: number, dy: number): void;
	liftPiece(id: string): void;
	placePiece(id: string, x: number, y: number): void;
	throwPiece(id: string, facing: number): void;
	toggleTap(x: number, y: number): void;
	useFixture(id: string): void;
	sleep(): void;
	takeExit(): void;
	/** Põe uma peça do inventário; `colors`, as cores das partes no texto de `encodeColors` (shared/decor.ts). */
	decorPlace(item: string, form: number, ax: number, ay: number, colors: string): void;
	decorMove(key: number, form: number, ax: number, ay: number): void;
	/** Pinta de novo uma peça posta, com as cores no texto de `encodeColors`. */
	decorPaint(key: number, colors: string): void;
	decorStore(key: number): void;
	decorMovePiece(id: string, ax: number, ay: number): void;
}

interface ServerToClientEvents {
	playerDataFailed(): void;
	playerData(
		favoriteHeads: string[],
		favoriteBodies: string[],
		savedLooks: string[],
		character: string,
		characterName: string,
	): void;
	/** Um jogador reagiu; cada cliente mostra o rosto (e o balão) no boneco dele. */
	reacted(userId: number, reaction: number, bubble: boolean): void;
	pieceChanged(map: string, id: string, x: number, y: number, mode: number, holder: number, variant: number): void;
	pieceThrown(map: string, id: string, holder: number, x: number, y: number, mode: number, variant: number): void;
	tapChanged(map: string, x: number, y: number, open: boolean): void;
	fixtureChanged(map: string, id: string, on: boolean): void;
	slept(woke: boolean, waiting: number): void;
	exitRefused(): void;
	decorChanged(
		map: string,
		key: number,
		item: string,
		form: number,
		variant: number,
		x: number,
		y: number,
		ax: number,
		ay: number,
		colors: string,
	): void;
	decorRefused(reason: string, piece: string, wanted: string, found: string): void;
	decorStock(text: string): void;
}

export const GlobalEvents = Networking.createEvent<ClientToServerEvents, ServerToClientEvents>();
