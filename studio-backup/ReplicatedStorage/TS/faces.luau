-- Compiled with roblox-ts v3.0.0
-- Gerado por tools/cozy_faces.py (pasta Aseprite) a partir de tools/faces_spec.py.
-- Não editar à mão: mudar a especificação e rodar o script de novo.
--* Uma peça de rosto. Cada camada que ela usa é o número de uma tira da folha de rostos. 
--* Um instante de uma reação: índices em `poseEyes`, `poseMouths` e `fx`. O que falta fica como o jogador escolheu. 
--* Lado da célula de rosto, em pixels de arte: ela cobre a cabeça. 
local FACE_CELL = 16
--* Canto da célula dentro do quadro do personagem, no quadro parado. 
local FACE_ORIGIN = Vector2.new(8, 8)
--* Quanto a cabeça sobe (negativo) em cada quadro do andar. 
local HEAD_BOB = { 0, -1, -2, 0, 0, -1, -2, 0 }
--* Uma tira tem a peça de frente, virada para a direita e virada para a esquerda. 
local STRIP_SIZE = Vector2.new(48, 16)
local STRIP_COLUMNS = 5
--* Balões de reação: lado, quantos por linha e onde começam na folha. 
local BUBBLE_SIZE = 16
local BUBBLE_COLUMNS = 16
local BUBBLE_ORIGIN = Vector2.new(0, 432)
local BUBBLE_COUNT = 25
local Faces = {
	eyes = { {
		id = "vivo",
		name = "Vivos",
		iris = 0,
		ink = 1,
	}, {
		id = "brilho",
		name = "Brilhantes",
		iris = 2,
		ink = 3,
	}, {
		id = "arregalado",
		name = "Arregalados",
		iris = 4,
		ink = 5,
	}, {
		id = "cilios",
		name = "Com cílios",
		skin = 6,
		iris = 7,
		ink = 8,
	}, {
		id = "decidido",
		name = "Decididos",
		skin = 9,
		iris = 10,
		ink = 11,
	}, {
		id = "sono",
		name = "Sonolentos",
		skin = 12,
		iris = 13,
		ink = 14,
	}, {
		id = "classico",
		name = "Clássicos",
		iris = 15,
		ink = 16,
	}, {
		id = "ponto",
		name = "Pontinhos",
		iris = 17,
		ink = 18,
	}, {
		id = "risonho",
		name = "Risonhos",
		skin = 19,
		iris = 20,
		ink = 21,
	}, {
		id = "sereno",
		name = "Serenos",
		iris = 22,
		ink = 23,
	} },
	mouths = { {
		id = "nenhuma",
		name = "Sem boca",
	}, {
		id = "risco",
		name = "Risquinho",
		skin = 24,
		ink = 25,
	}, {
		id = "sorriso",
		name = "Sorriso",
		skin = 26,
		ink = 27,
	}, {
		id = "dentes",
		name = "Sorrisão",
		skin = 28,
		ink = 29,
	}, {
		id = "aberta",
		name = "Aberta",
		ink = 30,
	}, {
		id = "lingua",
		name = "Linguinha",
		skin = 31,
		ink = 32,
	}, {
		id = "emburrada",
		name = "Emburrada",
		skin = 33,
	} },
	poseEyes = { {
		id = "closed",
		name = "Fechados",
		iris = 34,
		ink = 35,
	}, {
		id = "happy",
		name = "Felizes",
		skin = 36,
		iris = 37,
		ink = 38,
	}, {
		id = "content",
		name = "Contentes",
		iris = 39,
		ink = 40,
	}, {
		id = "half",
		name = "Meio fechados",
		iris = 41,
		ink = 42,
	}, {
		id = "wide",
		name = "Arregalados",
		iris = 43,
		ink = 44,
	}, {
		id = "ring",
		name = "Esbugalhados",
		iris = 45,
		ink = 46,
	}, {
		id = "tiny",
		name = "Pupilas pequenas",
		iris = 47,
		ink = 48,
	}, {
		id = "up",
		name = "Olhando para cima",
		iris = 49,
		ink = 50,
	}, {
		id = "side",
		name = "Olhando de lado",
		iris = 51,
		ink = 52,
	}, {
		id = "dots",
		name = "Pontinhos",
		iris = 53,
		ink = 54,
	}, {
		id = "angry",
		name = "Bravos",
		skin = 55,
		iris = 56,
		ink = 57,
	}, {
		id = "sad",
		name = "Tristes",
		iris = 58,
		ink = 59,
	}, {
		id = "weary",
		name = "Cansados",
		iris = 60,
		ink = 61,
	}, {
		id = "squeeze",
		name = "Espremidos",
		ink = 62,
	}, {
		id = "hearts",
		name = "Corações",
		ink = 63,
	}, {
		id = "stars",
		name = "Estrelas",
		ink = 64,
	}, {
		id = "shades",
		name = "Óculos escuros",
		ink = 65,
	} },
	poseMouths = { {
		id = "line",
		name = "Risquinho",
		skin = 66,
		ink = 67,
	}, {
		id = "smile",
		name = "Sorriso",
		skin = 68,
		ink = 69,
	}, {
		id = "smile_blush",
		name = "Sorriso corado",
		skin = 70,
		ink = 71,
	}, {
		id = "smirk",
		name = "De canto",
		skin = 72,
	}, {
		id = "smug",
		name = "De canto, reta",
		skin = 73,
	}, {
		id = "flat",
		name = "Reta",
		skin = 74,
		ink = 75,
	}, {
		id = "open",
		name = "Aberta",
		ink = 76,
	}, {
		id = "oh",
		name = "Boca em O",
		ink = 77,
	}, {
		id = "oh_ring",
		name = "Boca em O da surpresa",
		ink = 78,
	}, {
		id = "laugh",
		name = "Gargalhada",
		ink = 79,
	}, {
		id = "grin",
		name = "Dentes à mostra",
		ink = 80,
	}, {
		id = "teeth",
		name = "Dentinhos",
		skin = 81,
		ink = 82,
	}, {
		id = "grit",
		name = "Dentes cerrados",
		skin = 83,
		ink = 84,
	}, {
		id = "wince",
		name = "Dentes de dor",
		ink = 85,
	}, {
		id = "love",
		name = "Apaixonada",
		skin = 86,
		ink = 87,
	}, {
		id = "awe",
		name = "Maravilhada",
		ink = 88,
	}, {
		id = "frown",
		name = "Triste",
		skin = 89,
	}, {
		id = "shy",
		name = "Tímida",
		skin = 90,
		ink = 91,
	}, {
		id = "rosy",
		name = "Corada",
		skin = 92,
		ink = 93,
	}, {
		id = "wavy",
		name = "Tremida",
		skin = 94,
	}, {
		id = "wavy2",
		name = "Tremida para o outro lado",
		skin = 95,
	}, {
		id = "doze",
		name = "Dormindo",
		skin = 96,
		ink = 97,
	}, {
		id = "snore",
		name = "Ronco",
		ink = 98,
	}, {
		id = "wink",
		name = "Piscadinha",
		skin = 99,
		ink = 100,
	} },
	fx = { {
		id = "love",
		name = "Coraçãozinho",
		fx = 101,
	}, {
		id = "love2",
		name = "Coraçãozinho subindo",
		fx = 102,
	}, {
		id = "twinkle",
		name = "Estrelinha",
		fx = 103,
	}, {
		id = "twinkle2",
		name = "Estrelinha apagando",
		fx = 104,
	}, {
		id = "sprout",
		name = "Brotinho",
		fx = 105,
	}, {
		id = "sprout2",
		name = "Brotinho balançando",
		fx = 106,
	}, {
		id = "glint",
		name = "Reflexo na lente",
		fx = 107,
	}, {
		id = "note",
		name = "Nota musical",
		fx = 108,
	}, {
		id = "note2",
		name = "Nota musical do outro lado",
		fx = 109,
	}, {
		id = "shine",
		name = "Brilho",
		fx = 110,
	}, {
		id = "shine2",
		name = "Brilho do outro lado",
		fx = 111,
	}, {
		id = "idea",
		name = "Estalo",
		fx = 112,
	}, {
		id = "idea2",
		name = "Estalo abrindo",
		fx = 113,
	}, {
		id = "shock",
		name = "Susto",
		fx = 114,
	}, {
		id = "shock2",
		name = "Susto abrindo",
		fx = 115,
	}, {
		id = "quest",
		name = "Interrogação",
		fx = 116,
	}, {
		id = "quest2",
		name = "Interrogação balançando",
		fx = 117,
	}, {
		id = "dots1",
		name = "Um ponto",
		fx = 118,
	}, {
		id = "dots2",
		name = "Dois pontos",
		fx = 119,
	}, {
		id = "dots3",
		name = "Três pontos",
		fx = 120,
	}, {
		id = "sweat",
		name = "Gota de suor",
		fx = 121,
	}, {
		id = "sweat2",
		name = "Gota de suor escorrendo",
		fx = 122,
	}, {
		id = "puff",
		name = "Suspiro",
		fx = 123,
	}, {
		id = "puff2",
		name = "Suspiro subindo",
		fx = 124,
	}, {
		id = "zzz",
		name = "Zzz",
		fx = 125,
	}, {
		id = "zzz2",
		name = "Zzz subindo",
		fx = 126,
	}, {
		id = "tear",
		name = "Lágrima",
		fx = 127,
	}, {
		id = "tear2",
		name = "Lágrima escorrendo",
		fx = 128,
	}, {
		id = "tears",
		name = "Choro",
		fx = 129,
	}, {
		id = "tears2",
		name = "Choro escorrendo",
		fx = 130,
	}, {
		id = "impact",
		name = "Estalo de dor",
		fx = 131,
	}, {
		id = "vein",
		name = "Veia de raiva",
		fx = 132,
	}, {
		id = "vein2",
		name = "Veia de raiva pulsando",
		fx = 133,
	} },
	blink = 0,
	defaultEyes = 0,
	defaultMouth = 1,
	reactions = { {
		id = "sorriso",
		name = "Sorriso",
		bubble = 5,
		poses = { {
			mouth = 2,
		} },
		rate = 0,
		seconds = 3,
	}, {
		id = "risada",
		name = "Risada",
		bubble = 11,
		poses = { {
			eyes = 1,
			mouth = 9,
		}, {
			eyes = 1,
			mouth = 10,
		} },
		rate = 4,
		seconds = 3,
	}, {
		id = "apaixonado",
		name = "Apaixonado",
		bubble = 8,
		poses = { {
			eyes = 14,
			mouth = 14,
			fx = 0,
		}, {
			eyes = 14,
			mouth = 14,
			fx = 1,
		} },
		rate = 2,
		seconds = 4,
	}, {
		id = "piscadinha",
		name = "Piscadinha",
		bubble = 7,
		poses = { {
			mouth = 23,
			fx = 2,
		}, {
			mouth = 23,
			fx = 3,
		} },
		rate = 3,
		seconds = 2.5,
	}, {
		id = "contente",
		name = "Contente",
		bubble = 3,
		poses = { {
			eyes = 2,
			mouth = 1,
		} },
		rate = 0,
		seconds = 3,
	}, {
		id = "encantado",
		name = "Encantado",
		bubble = 14,
		poses = { {
			eyes = 1,
			mouth = 18,
		} },
		rate = 0,
		seconds = 3.5,
	}, {
		id = "brotinho",
		name = "Brotinho",
		bubble = 24,
		poses = { {
			eyes = 1,
			mouth = 11,
			fx = 4,
		}, {
			eyes = 1,
			mouth = 11,
			fx = 5,
		} },
		rate = 2,
		seconds = 4,
	}, {
		id = "estiloso",
		name = "Estiloso",
		bubble = 4,
		poses = { {
			eyes = 16,
			mouth = 4,
			fx = 6,
		}, {
			eyes = 16,
			mouth = 4,
		} },
		rate = 1.5,
		seconds = 4,
	}, {
		id = "cantando",
		name = "Cantando",
		bubble = 19,
		poses = { {
			eyes = 1,
			mouth = 7,
			fx = 7,
		}, {
			eyes = 1,
			mouth = 6,
			fx = 8,
		} },
		rate = 3,
		seconds = 4,
	}, {
		id = "maravilhado",
		name = "Maravilhado",
		bubble = 23,
		poses = { {
			eyes = 15,
			mouth = 15,
			fx = 9,
		}, {
			eyes = 15,
			mouth = 15,
			fx = 10,
		} },
		rate = 3,
		seconds = 3.5,
	}, {
		id = "ideia",
		name = "Ideia!",
		bubble = 20,
		poses = { {
			eyes = 4,
			mouth = 11,
			fx = 11,
		}, {
			eyes = 4,
			mouth = 11,
			fx = 12,
		} },
		rate = 4,
		seconds = 2.5,
	}, {
		id = "surpresa",
		name = "Surpresa",
		bubble = 2,
		poses = { {
			eyes = 5,
			mouth = 8,
		} },
		rate = 0,
		seconds = 2.5,
	}, {
		id = "susto",
		name = "Susto",
		bubble = 15,
		poses = { {
			eyes = 4,
			mouth = 7,
			fx = 13,
		}, {
			eyes = 4,
			mouth = 7,
			fx = 14,
		} },
		rate = 4,
		seconds = 2,
	}, {
		id = "duvida",
		name = "Dúvida",
		bubble = 16,
		poses = { {
			eyes = 7,
			mouth = 3,
			fx = 15,
		}, {
			eyes = 7,
			mouth = 3,
			fx = 16,
		} },
		rate = 2,
		seconds = 3,
	}, {
		id = "sempalavras",
		name = "Sem palavras",
		bubble = 17,
		poses = { {
			eyes = 9,
			mouth = 0,
			fx = 17,
		}, {
			eyes = 9,
			mouth = 0,
			fx = 18,
		}, {
			eyes = 9,
			mouth = 0,
			fx = 19,
		} },
		rate = 2,
		seconds = 3,
	}, {
		id = "semjeito",
		name = "Sem jeito",
		bubble = 21,
		poses = { {
			eyes = 6,
			mouth = 19,
			fx = 20,
		}, {
			eyes = 6,
			mouth = 20,
			fx = 21,
		} },
		rate = 2,
		seconds = 3,
	}, {
		id = "timido",
		name = "Tímido",
		bubble = 10,
		poses = { {
			eyes = 8,
			mouth = 17,
		} },
		rate = 0,
		seconds = 3.5,
	}, {
		id = "cansado",
		name = "Cansado",
		bubble = 6,
		poses = { {
			eyes = 12,
			mouth = 6,
			fx = 22,
		}, {
			eyes = 12,
			mouth = 0,
			fx = 23,
		} },
		rate = 1,
		seconds = 3.5,
	}, {
		id = "tedio",
		name = "Tédio",
		bubble = 0,
		poses = { {
			eyes = 3,
			mouth = 5,
		}, {
			eyes = 0,
			mouth = 5,
		} },
		rate = 0.7,
		seconds = 3.5,
	}, {
		id = "dormindo",
		name = "Dormindo",
		bubble = 18,
		poses = { {
			eyes = 0,
			mouth = 21,
			fx = 24,
		}, {
			eyes = 0,
			mouth = 22,
			fx = 25,
		} },
		rate = 1,
		seconds = 6,
	}, {
		id = "triste",
		name = "Triste",
		bubble = 9,
		poses = { {
			eyes = 11,
			mouth = 16,
			fx = 26,
		}, {
			eyes = 11,
			mouth = 16,
			fx = 27,
		} },
		rate = 1,
		seconds = 4,
	}, {
		id = "choro",
		name = "Choro",
		bubble = 13,
		poses = { {
			eyes = 0,
			mouth = 7,
			fx = 28,
		}, {
			eyes = 0,
			mouth = 6,
			fx = 29,
		} },
		rate = 4,
		seconds = 4,
	}, {
		id = "ai",
		name = "Ai!",
		bubble = 12,
		poses = { {
			eyes = 13,
			mouth = 13,
			fx = 30,
		}, {
			eyes = 13,
			mouth = 13,
		} },
		rate = 1.5,
		seconds = 2,
	}, {
		id = "bravo",
		name = "Bravo",
		bubble = 1,
		poses = { {
			eyes = 10,
			mouth = 6,
		}, {
			eyes = 10,
			mouth = 0,
		} },
		rate = 2,
		seconds = 3,
	}, {
		id = "raiva",
		name = "Raiva",
		bubble = 22,
		poses = { {
			eyes = 10,
			mouth = 12,
			fx = 31,
		}, {
			eyes = 10,
			mouth = 12,
			fx = 32,
		} },
		rate = 4,
		seconds = 3,
	}, {
		id = "falando",
		name = "Falando",
		bubble = -1,
		poses = { {
			mouth = 6,
		}, {
			mouth = 0,
		} },
		rate = 6,
		seconds = 1.5,
	} },
}
return {
	FACE_CELL = FACE_CELL,
	FACE_ORIGIN = FACE_ORIGIN,
	HEAD_BOB = HEAD_BOB,
	STRIP_SIZE = STRIP_SIZE,
	STRIP_COLUMNS = STRIP_COLUMNS,
	BUBBLE_SIZE = BUBBLE_SIZE,
	BUBBLE_COLUMNS = BUBBLE_COLUMNS,
	BUBBLE_ORIGIN = BUBBLE_ORIGIN,
	BUBBLE_COUNT = BUBBLE_COUNT,
	Faces = Faces,
}
