-- Compiled with roblox-ts v3.0.0
local TS = require(game:GetService("ReplicatedStorage"):WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
-- Os números do som (página "Plano de som e música" do Notion, seções 1 a 5; estudo em
-- `Aseprite\sons\estudo\ESTUDO_SONS.md`): ids, recortes, volumes e distâncias. Quem toca é o cliente
-- (`SoundController` e `MusicController`); nada de som passa pela rede.
--
-- Os sons da biblioteca do Roblox (Pro Sound Effects, conferidos em 2026-10-18 pelo `GetProductInfo`: existem e
-- são áudio) não se baixam nem se editam: só se recortam aqui (`region`, o `PlaybackRegion`; `loop`, o
-- `LoopRegion`). Os recortes saíram da forma de onda (`AudioPlayer:GetWaveformAsync`), sem ouvir: conferir de
-- ouvido no Studio. Som sem id (o que ainda vai ser feito no Ableton) não toca, e o Output avisa uma vez.
--
-- Os ids moram no registro (assets/registro.json, chaves som.* e musica.*; `npm run assets` grava shared/assets.ts):
-- aqui ficam só os recortes, os volumes e as distâncias. Som novo: a chave no registro e o uso aqui.
local ASSETS = TS.import(script, game:GetService("ReplicatedStorage"), "TS", "assets").ASSETS
--* O período do dia, que escolhe o ambiente e a versão da música (seção 1 do plano). 
--* Manhã das 5h às 8h, dia das 8h às 17h, tarde das 17h às 19h, noite das 19h às 5h. 
local function periodOf(hour)
	if hour >= 5 and hour < 8 then
		return "manha"
	end
	if hour >= 8 and hour < 17 then
		return "dia"
	end
	if hour >= 17 and hour < 19 then
		return "tarde"
	end
	return "noite"
end
--* Um som: o id ("" sem som ainda), o volume (0 a 10 no Roblox; aqui quase sempre abaixo de 1) e os recortes. 
--* O som que vem de um ponto do mapa: cheio até `min` studs, some de vez em `max` (`LinearSquare`). 
-- ------------------------------------------------------------------ grupos e limites (seção 5 do plano)
--* Os grupos novos, filhos do "Effects" das Configurações: o volume de Efeitos vale para eles. 
local AMBIENCE_GROUP = "Ambience"
local INTERFACE_GROUP = "Interface"
--* Laços de ambiente (fundo e pelo lugar) audíveis ao mesmo tempo, no máximo: os mais altos ficam. 
local MAX_AMBIENT_LOOPS = 4
--* Cópias do mesmo efeito tocando juntas, no máximo: a mais velha para quando chega outra. 
local MAX_EFFECT_COPIES = 2
--* Os efeitos de outro jogador saem mais baixos que os do próprio. 
local OTHER_PLAYER_VOLUME = 0.6
--* De onde se ouvem os efeitos pelo lugar (pote, passos de outro jogador), em studs. 
local EFFECT_MIN = 1
local EFFECT_MAX = 12
-- ------------------------------------------------------------------ ambiente (seção 4 do plano, seção 2 do estudo)
--* As camadas de fundo: sem lugar, pela zona e pela hora. 
local AMBIENCE_LAYERS = {
	passaros = {
		id = ASSETS["som.passaros"],
		volume = 1,
	},
	grilos = {
		id = ASSETS["som.grilos"],
		volume = 1,
	},
	vento = {
		id = ASSETS["som.vento"],
		volume = 1,
	},
	marLonge = {
		id = ASSETS["som.mar_longe"],
		volume = 1,
	},
}
--* Um ambiente: o volume de cada camada em cada período (0 a 1, antes das Configurações) e se vem abafado. 
--* Os ambientes, pela propriedade `ambiente` da zona (ou do mapa, `MAP_SOUND_PROPS`). 
local AMBIENCE_PROFILES = {
	casa = {
		muffled = true,
		levels = {
			manha = {
				passaros = 0.08,
			},
			dia = {
				passaros = 0.06,
			},
			tarde = {},
			noite = {
				grilos = 0.08,
			},
		},
	},
	exterior = {
		muffled = false,
		levels = {
			manha = {
				passaros = 0.35,
				vento = 0.15,
			},
			dia = {
				passaros = 0.25,
				vento = 0.2,
			},
			tarde = {
				vento = 0.2,
				passaros = 0.1,
			},
			noite = {
				grilos = 0.35,
				vento = 0.12,
			},
		},
	},
	mar = {
		muffled = false,
		levels = {
			manha = {
				passaros = 0.35,
				vento = 0.15,
				marLonge = 0.15,
			},
			dia = {
				passaros = 0.25,
				vento = 0.2,
				marLonge = 0.15,
			},
			tarde = {
				vento = 0.2,
				passaros = 0.1,
				marLonge = 0.15,
			},
			noite = {
				grilos = 0.35,
				vento = 0.12,
				marLonge = 0.15,
			},
		},
	},
}
--* O abafado de dentro de casa, no `EqualizerSoundEffect` de cada camada de fundo (em dB). 
local MUFFLE = {
	low = 0,
	mid = -12,
	high = -40,
}
--* Quanto leva a troca do fundo, em segundos: ao mudar de zona e ao mudar de período (troca suave, 3 a 8 s). 
local AMBIENCE_ZONE_FADE = 3
local AMBIENCE_PERIOD_FADE = 8
--[[
	*
	 * As propriedades de som de cada mapa (`ambiente`, `musica`), que valem onde nenhuma zona diz outra coisa: a zona
	 * da ilha não cobre a praia, e a casa de teste não tem zona. Mapa fora da lista: `exterior` com terreno, `casa` sem.
	 
]]
local MAP_SOUND_PROPS = {
	exterior_ilha = {
		ambiente = "mar",
		musica = "ilha",
	},
	casa_teste_v2_l = {
		ambiente = "casa",
		musica = "sala",
	},
}
-- ------------------------------------------------------------------ pelo lugar (seção 4 do plano)
local PLACED = {
	lareira = {
		id = ASSETS["som.lareira"],
		volume = 0.6,
		min = 1.5,
		max = 10,
		zoneBound = true,
	},
	torneira = {
		id = ASSETS["som.torneira"],
		volume = 0.5,
		region = { 2, 13 },
		loop = { 2, 13 },
		min = 1,
		max = 7,
		zoneBound = true,
	},
	mar = {
		id = ASSETS["som.mar"],
		volume = 0.7,
		region = { 0, 10 },
		loop = { 0, 10 },
		min = 1,
		max = 10,
		zoneBound = false,
	},
	fogao = {
		id = ASSETS["som.lareira"],
		volume = 0.3,
		min = 1,
		max = 6,
		zoneBound = true,
	},
}
-- ------------------------------------------------------------------ efeitos do mundo (seção 2 do plano)
--* Cada efeito tem uma ou mais variações, sorteadas. 
local EFFECTS = {
	porta = { {
		id = ASSETS["som.porta"],
		volume = 0.5,
		region = { 0.1, 3.45 },
	} },
	poteQuebra = { {
		id = ASSETS["som.pote_quebra"],
		volume = 0.6,
		region = { 0.1, 2.6 },
		pitch = 0.04,
	} },
	respingo = { {
		id = ASSETS["som.respingo"],
		volume = 0.7,
		region = { 0, 1.1 },
		pitch = 0.05,
	} },
	nadar = { {
		id = ASSETS["som.nadar"],
		volume = 0.6,
		region = { 1.25, 2.05 },
		pitch = 0.08,
	} },
	passoAgua = { {
		id = ASSETS["som.passo_agua.0"],
		volume = 0.8,
		pitch = 0.06,
	}, {
		id = ASSETS["som.passo_agua.1"],
		volume = 0.8,
		pitch = 0.06,
	}, {
		id = ASSETS["som.passo_agua.2"],
		volume = 0.6,
		pitch = 0.06,
	} },
	torneiraAbre = { {
		id = ASSETS["som.torneira"],
		volume = 0.5,
		region = { 0, 1.6 },
	} },
	torneiraFecha = { {
		id = ASSETS["som.torneira"],
		volume = 0.5,
		region = { 14, 17.4 },
	} },
	passoTabua = { {
		id = ASSETS["som.passo_tabua"],
		volume = 0.4,
		pitch = 0.06,
	} },
	passoGrama = { {
		id = ASSETS["som.passo_grama"],
		volume = 0.3,
		pitch = 0.06,
	} },
	passoPedra = { {
		id = ASSETS["som.passo_pedra"],
		volume = 0.4,
		pitch = 0.06,
	} },
	bauAbre = { {
		id = ASSETS["som.bau_abre"],
		volume = 0.5,
		pitch = 0.05,
	} },
	bauFecha = { {
		id = ASSETS["som.bau_fecha"],
		volume = 0.5,
		pitch = 0.05,
	} },
	fogaoAcende = { {
		id = ASSETS["som.fogao_acende"],
		volume = 0.4,
	} },
}
--* A cada quantos passos (meio ciclo do andar, `WALK_STEP_PX` × 4) sai uma braçada nadando. 
local SWIM_STROKE_STEPS = 3
-- ------------------------------------------------------------------ interface (seção 3 do plano)
--[[
	*
	 * Os sons da interface de cada kit do tema (Celeiro: madeira e papel; Clássico: sinos e cristal), feitos no
	 * Ableton, num arquivo só por kit, cada som um trecho (`region`). Ainda sem id.
	 
]]
local UI_SOUNDS = {
	celeiro = {
		click = {
			id = ASSETS["som.interface.celeiro"],
			volume = 0.5,
		},
		focus = {
			id = ASSETS["som.interface.celeiro"],
			volume = 0.3,
		},
		open = {
			id = ASSETS["som.interface.celeiro"],
			volume = 0.5,
		},
		close = {
			id = ASSETS["som.interface.celeiro"],
			volume = 0.5,
		},
		change = {
			id = ASSETS["som.interface.celeiro"],
			volume = 0.4,
		},
		confirm = {
			id = ASSETS["som.interface.celeiro"],
			volume = 0.5,
		},
		back = {
			id = ASSETS["som.interface.celeiro"],
			volume = 0.5,
		},
		refused = {
			id = ASSETS["som.interface.celeiro"],
			volume = 0.5,
		},
	},
	graal = {
		click = {
			id = ASSETS["som.interface.graal"],
			volume = 0.5,
		},
		focus = {
			id = ASSETS["som.interface.graal"],
			volume = 0.3,
		},
		open = {
			id = ASSETS["som.interface.graal"],
			volume = 0.5,
		},
		close = {
			id = ASSETS["som.interface.graal"],
			volume = 0.5,
		},
		change = {
			id = ASSETS["som.interface.graal"],
			volume = 0.4,
		},
		confirm = {
			id = ASSETS["som.interface.graal"],
			volume = 0.5,
		},
		back = {
			id = ASSETS["som.interface.graal"],
			volume = 0.5,
		},
		refused = {
			id = ASSETS["som.interface.graal"],
			volume = 0.5,
		},
	},
}
-- ------------------------------------------------------------------ música (seção 1 do plano)
--* Laço contínuo (as telas: título, personalizar e, depois, as lojas) ou com pausas (os lugares). 
--* As faixas, uma por arquivo (feitas no Ableton). Ainda sem id. 
local MUSIC_TRACKS = {
	titulo = {
		id = ASSETS["musica.titulo"],
		volume = 0.5,
	},
	personalizar = {
		id = ASSETS["musica.personalizar"],
		volume = 0.4,
	},
	ilha_manha = {
		id = ASSETS["musica.ilha_manha"],
		volume = 0.5,
	},
	ilha_dia = {
		id = ASSETS["musica.ilha_dia"],
		volume = 0.5,
	},
	ilha_tarde = {
		id = ASSETS["musica.ilha_tarde"],
		volume = 0.5,
	},
	sala_dia = {
		id = ASSETS["musica.sala_dia"],
		volume = 0.45,
	},
	sala_noite = {
		id = ASSETS["musica.sala_noite"],
		volume = 0.35,
	},
}
--* A música de um lugar (`musica` da zona) ou de uma tela: como toca e a faixa de cada período (nada: só ambiente). 
local MUSIC_PLACES = {
	titulo = {
		mode = "loop",
		tracks = {
			manha = "titulo",
			dia = "titulo",
			tarde = "titulo",
			noite = "titulo",
		},
	},
	personalizar = {
		mode = "loop",
		tracks = {
			manha = "personalizar",
			dia = "personalizar",
			tarde = "personalizar",
			noite = "personalizar",
		},
	},
	ilha = {
		mode = "breathe",
		tracks = {
			manha = "ilha_manha",
			dia = "ilha_dia",
			tarde = "ilha_tarde",
		},
	},
	sala = {
		mode = "breathe",
		tracks = {
			manha = "sala_dia",
			dia = "sala_dia",
			tarde = "sala_dia",
			noite = "sala_noite",
		},
	},
}
--* Respira: a faixa some nos últimos segundos, e o silêncio (só ambiente) dura um tempo sorteado entre os dois. 
local MUSIC_END_FADE = 4
local MUSIC_REST = { 60, 180 }
--* No meio de uma faixa, a troca de período é um fade deste tamanho. 
local MUSIC_PERIOD_FADE = 8
--* Troca de tela ou de lugar sem véu (título, personalizar, jogo). 
local MUSIC_SWITCH_FADE = 2
--* O véu da porta: a música e o ambiente somem junto com ele e voltam ao clarear. 
local VEIL_FADE_OUT = 0.8
local VEIL_FADE_IN = 2
return {
	periodOf = periodOf,
	AMBIENCE_GROUP = AMBIENCE_GROUP,
	INTERFACE_GROUP = INTERFACE_GROUP,
	MAX_AMBIENT_LOOPS = MAX_AMBIENT_LOOPS,
	MAX_EFFECT_COPIES = MAX_EFFECT_COPIES,
	OTHER_PLAYER_VOLUME = OTHER_PLAYER_VOLUME,
	EFFECT_MIN = EFFECT_MIN,
	EFFECT_MAX = EFFECT_MAX,
	AMBIENCE_LAYERS = AMBIENCE_LAYERS,
	AMBIENCE_PROFILES = AMBIENCE_PROFILES,
	MUFFLE = MUFFLE,
	AMBIENCE_ZONE_FADE = AMBIENCE_ZONE_FADE,
	AMBIENCE_PERIOD_FADE = AMBIENCE_PERIOD_FADE,
	MAP_SOUND_PROPS = MAP_SOUND_PROPS,
	PLACED = PLACED,
	EFFECTS = EFFECTS,
	SWIM_STROKE_STEPS = SWIM_STROKE_STEPS,
	UI_SOUNDS = UI_SOUNDS,
	MUSIC_TRACKS = MUSIC_TRACKS,
	MUSIC_PLACES = MUSIC_PLACES,
	MUSIC_END_FADE = MUSIC_END_FADE,
	MUSIC_REST = MUSIC_REST,
	MUSIC_PERIOD_FADE = MUSIC_PERIOD_FADE,
	MUSIC_SWITCH_FADE = MUSIC_SWITCH_FADE,
	VEIL_FADE_OUT = VEIL_FADE_OUT,
	VEIL_FADE_IN = VEIL_FADE_IN,
}
