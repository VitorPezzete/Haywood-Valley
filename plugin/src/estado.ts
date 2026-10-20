// Estado compartilhado entre as ferramentas do plugin: fontes do Vide que qualquer painel lê e grava.
// Vivem no módulo (fora de qualquer root do Vide), então sobrevivem a abrir e fechar widgets.
import { source } from "@rbxts/vide";
import type { ResumoMapa, Status } from "./ponte";

/** A última chamada à ponte respondeu? Atualizado por `ponte.ts` a cada pedido. */
export const ponteLigada = source(false);
/** Mensagem amigável do último erro de conexão (ou `undefined` quando a ponte respondeu). */
export const erroPonte = source<string | undefined>(undefined);
/** O último `GET /status` que deu certo. */
export const statusPonte = source<Status | undefined>(undefined);

/** Lista de mapas conhecida (último `GET /mapas`). */
export const mapas = source<ResumoMapa[]>([]);
/** Id do mapa aberto no editor, se houver. */
export const mapaAberto = source<string | undefined>(undefined);
/** Bloco aberto no editor, em coordenadas de bloco. */
export const blocoAberto = source<[number, number]>([0, 0]);
