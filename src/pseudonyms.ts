// Deterministic pseudonym generator.
// Person at insertion index N → first[N % 40] + " " + last[(N + floor(N/40)) % 40]
// Guarantees uniqueness for at least 1600 people (40 × 40).

const FIRST_NAMES = [
  "Aaliyah", "Amir",    "Beatriz",  "Carlos",
  "Chioma",  "Daisuke", "Elena",    "Femi",
  "Giulia",  "Hassan",  "Ingrid",   "Jae-Won",
  "Kaya",    "Leila",   "Mateus",   "Nadia",
  "Obinna",  "Priya",   "Quentin",  "Rania",
  "Soren",   "Tanisha", "Ugo",      "Valentina",
  "Wanjiru", "Xiao",    "Yasmine",  "Zaid",
  "Amara",   "Bjorn",   "Citlali",  "Darian",
  "Emeka",   "Fatou",   "Gael",     "Himari",
  "Ines",    "Jabari",  "Kiri",     "Luca",
] as const;

const LAST_NAMES = [
  "Adeyemi",    "Bergstrom",  "Carvalho",   "Delacroix",
  "Eriksen",    "Flores",     "Gupta",      "Hwang",
  "Ibrahim",    "Jensen",     "Kimura",     "Laurent",
  "Mensah",     "Nakamura",   "Okonkwo",    "Petrov",
  "Qureshi",    "Reyes",      "Svensson",   "Tanaka",
  "Usman",      "Vargas",     "Wolff",      "Xu",
  "Yamamoto",   "Ziegler",    "Abramowitz", "Barbosa",
  "Chakrabarti","Diallo",     "Esposito",   "Fontaine",
  "Guerrero",   "Hashimoto",  "Ito",        "Johansson",
  "Kowalski",   "Lindqvist",  "Moreau",     "Nwosu",
] as const;

const N = 40;

export function getPseudonym(index: number): string {
  const first = FIRST_NAMES[index % N];
  const last  = LAST_NAMES[(index + Math.floor(index / N)) % N];
  return `${first} ${last}`;
}
