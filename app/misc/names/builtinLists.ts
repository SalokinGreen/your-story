/**
 * The built-in name lists: the fallback for a story whose notes and system
 * declare no name table (randomness plan R2, design 3.2, decision 260).
 *
 * Original text (decision 3): every list was written for this file, from
 * ordinary given names and surnames and invented place names, not copied from a
 * product's list. They are deliberately varied in length and sound, and avoid
 * the handful of names a model reaches for first (Elara, Kael, Lyra, Thorne,
 * Mara, Elias, Ravenwood...); `tests/names.lists.test.ts` holds that.
 */

export type NameStyle = "fantasy" | "modern" | "historical-european" | "nordic";

export const NAME_STYLES: readonly NameStyle[] = [
  "fantasy",
  "modern",
  "historical-european",
  "nordic",
];

export const DEFAULT_NAME_STYLE: NameStyle = "fantasy";

export interface NameList {
  /** Given names, 80 or so. */
  given: string[];
  /** Family names, 50 or so. A person is a given name and a family name. */
  family: string[];
  /** Place names, 40 or so. */
  places: string[];
}

export const BUILTIN_NAME_LISTS: Record<NameStyle, NameList> = {
  fantasy: {
    given: [
      "Ambrose", "Bertram", "Cecily", "Dunstan", "Edmer", "Fenwick", "Gwenllian", "Hobart",
      "Ivo", "Jorund", "Kendrick", "Leofric", "Morwenna", "Nesta", "Oswin", "Perrin",
      "Quillon", "Rudgar", "Sabeth", "Tamsin", "Ulla", "Verity", "Wystan", "Yorick",
      "Zinnia", "Agnes", "Bran", "Corwen", "Dilys", "Eadric", "Floria", "Garrick",
      "Hild", "Isembard", "Jessamy", "Keturah", "Lowen", "Merrick", "Nell", "Orlaith",
      "Pernel", "Radella", "Selwyn", "Tegan", "Urien", "Vanora", "Wilmot", "Ysolt",
      "Anwen", "Bledri", "Cador", "Drustan", "Elspeth", "Fiachra", "Gethin", "Hestia",
      "Idony", "Jocasta", "Kenric", "Lorcan", "Maelis", "Nuala", "Osric", "Petra",
      "Rhosyn", "Sorcha", "Torvald", "Una", "Vesna", "Wulfric", "Yevan", "Zerah",
      "Abelard", "Brigid", "Cormac", "Dara", "Emlyn", "Fergal", "Greer", "Hamish",
    ],
    family: [
      "Ashgrove", "Barrowmere", "Coldwater", "Dunmarrow", "Eastcombe", "Fallowfield", "Greywick", "Hartwell",
      "Ironsides", "Juniper", "Kettleby", "Longstride", "Marrowby", "Nettlebed", "Oakhollow", "Pennywhistle",
      "Quarrel", "Redfern", "Stonecrop", "Thistledown", "Underhill", "Vale", "Whitlock", "Yarrow",
      "Applegate", "Bracken", "Corvane", "Dunnock", "Elderby", "Fairweather", "Gorse", "Hollis",
      "Inglewood", "Jessop", "Kestlow", "Lantern", "Mossop", "Nightingale", "Orchard", "Pargeter",
      "Rookwood", "Saltmarsh", "Tanner", "Upcott", "Verrick", "Wetherby", "Yewdale", "Ballard",
      "Crane", "Dray",
    ],
    places: [
      "Aldermere", "Brackenholt", "Candlewick", "Dunharrow Cross", "Eastmoor", "Fenwater", "Goldencombe", "Highcairn",
      "Ironford", "Jackdaw Hollow", "Kelsbury", "Lowmarsh", "Millstream", "Northwatch", "Oldpine", "Pebblebrook",
      "Quarrytown", "Rushmere", "Saltcliff", "Thornbury Green", "Underfell", "Vesperton", "Willowmere", "Yarrowdale",
      "Ashby Ford", "Bellhaven", "Cresswick", "Dovecote", "Emberley", "Foxhollow", "Gallowglass", "Harrowgate Bridge",
      "Inkwell", "Kingfisher Reach", "Larkspur", "Mistlebank", "Nettlefold", "Otterburn", "Plumtree", "Redwater",
    ],
  },
  modern: {
    given: [
      "Priya", "Tomas", "Dana", "Kofi", "Ines", "Hamid", "Jun", "Rosalind",
      "Mateo", "Noor", "Brendan", "Ayesha", "Luca", "Chidi", "Wanda", "Dmitri",
      "Imani", "Gareth", "Soledad", "Anders", "Thuy", "Cormac", "Delphine", "Emeka",
      "Farah", "Graham", "Hana", "Isidro", "Janelle", "Kwame", "Leilani", "Mirek",
      "Nadia", "Oren", "Paloma", "Quincy", "Rafaela", "Stellan", "Tamika", "Uriel",
      "Valentina", "Wes", "Xiomara", "Yusuf", "Zora", "Ada", "Bashir", "Colette",
      "Darius", "Eunice", "Felipe", "Gloria", "Hiroshi", "Iris", "Jamal", "Kirsten",
      "Lorenzo", "Marisol", "Nikhil", "Odette", "Percy", "Reza", "Sunita", "Teodor",
      "Ulises", "Vera", "Waleed", "Yasmin", "Zeke", "Annika", "Bogdan", "Carmen",
      "Desmond", "Esther", "Fatima", "Gideon", "Helga", "Ibrahim", "Joon", "Katarzyna",
    ],
    family: [
      "Okafor", "Lindqvist", "Marchetti", "Haddad", "Whitaker", "Nakamura", "Duarte", "Kowalczyk",
      "Abara", "Brennan", "Castellano", "Dhillon", "Eriksen", "Fontaine", "Guerrero", "Holloway",
      "Iyer", "Jankowski", "Kapoor", "Lacroix", "Mbeki", "Novak", "Ostrowski", "Pellegrino",
      "Quintero", "Rahman", "Sandoval", "Tran", "Underwood", "Vasquez", "Wojcik", "Yamada",
      "Zielinski", "Ahmadi", "Bergstrom", "Calloway", "Demir", "Esposito", "Fairchild", "Gutierrez",
      "Hale", "Ivanova", "Jovanovic", "Keane", "Lombardi", "Moreau", "Nwosu", "Okonkwo",
      "Pruitt", "Rossi",
    ],
    places: [
      "Harlow Bend", "Mill Creek", "Cedar Junction", "Port Alder", "Lakeshore Heights", "Dunmore Falls", "Fairview Crossing", "Granger",
      "Hollin Cross", "Iron Mesa", "Jasper Springs", "Kettle Run", "Lowell Park", "Maple Reach", "North Larkin", "Oxbow",
      "Pine Hollow", "Quarry Bay", "Red Bluff", "Stony Point", "Tillman", "Upper Marsh", "Vista Ridge", "Westbrook Landing",
      "Ashford Station", "Bridger", "Copper Gulch", "Dell Rapids", "Eastgate", "Foxglove Lane", "Glenwood", "Harbor Point",
      "Irving Street", "Juniper Flats", "Kensing Park", "Linden Row", "Merrill Crossing", "Newcomb", "Orchard Hill", "Prospect Green",
    ],
  },
  "historical-european": {
    given: [
      "Godfrey", "Isabeau", "Berengar", "Hildegund", "Matthias", "Ottilie", "Piero", "Sancha",
      "Wenzel", "Aveline", "Baldwin", "Clemence", "Dietrich", "Eleonore", "Florian", "Gisela",
      "Henrik", "Ida", "Jacopo", "Katharina", "Lothar", "Margery", "Nicolaus", "Odile",
      "Pelagia", "Raimund", "Sibylla", "Tancred", "Ulrich", "Valentin", "Walburga", "Xaver",
      "Yolande", "Zdenek", "Adelheid", "Bartholomew", "Cunigunde", "Domenico", "Egidio", "Fiametta",
      "Gervase", "Hartmut", "Ingeborg", "Joscelin", "Konrad", "Ludovica", "Mathilde", "Narcisse",
      "Otto", "Perrette", "Quirin", "Rosamund", "Sigismund", "Theophano", "Urban", "Viviane",
      "Willem", "Ysabel", "Anselm", "Beatrix", "Casimir", "Dorothea", "Eustace", "Francesca",
      "Gottfried", "Heloise", "Ivar", "Johanna", "Karel", "Lucrezia", "Martinus", "Nikolaus",
      "Osbern", "Pernette", "Rainer", "Simone", "Tiberio", "Ursula", "Vitale", "Wolfram",
    ],
    family: [
      "von Hagen", "de Montfort", "Brandt", "Castellane", "Delacroix", "Eberhardt", "Fabbri", "Gallo",
      "Hartmann", "Ibarra", "Jager", "Kellermann", "Lefebvre", "Moretti", "Neumann", "Orsini",
      "Pfeiffer", "Quesnel", "Rinaldi", "Schreiber", "Tessier", "Ulrich", "Vermeer", "Wagner",
      "Ximenes", "Zanetti", "Aubry", "Beckmann", "Contarini", "Dubois", "Engel", "Falconer",
      "Giraud", "Hofmann", "Isnard", "Janssen", "Krause", "Lombard", "Mercier", "Nardi",
      "Oberlin", "Pagano", "Reinhardt", "Sauvage", "Tolomei", "Uhlmann", "Vasari", "Weiss",
      "Zimmer", "Bauer",
    ],
    places: [
      "Saint-Maur", "Oberwald", "Castelmoro", "Dunmarrow Priory", "Altenbrunn", "Bellegarde", "Corvara", "Drachenfels",
      "Eichstatt", "Fontaine-sur-Loire", "Gravelines", "Hohenau", "Isola Bella", "Kirchberg", "Lombardeau", "Montferrat",
      "Neuburg", "Orvinio", "Pontecorvo", "Quedlin", "Rocamadour", "Sankt Veit", "Tarquinia Nova", "Unterberg",
      "Valmontone", "Waldenburg", "Aigues-Vives", "Brunnen", "Cividale", "Dornach", "Erlenbach", "Fiesole Alta",
      "Grandval", "Hallstein", "Intra", "Joinville", "Kaltenborn", "Laroque", "Mirecourt", "Nogaret",
    ],
  },
  nordic: {
    given: [
      "Astrid", "Bjarke", "Dagny", "Eirik", "Freydis", "Gunnar", "Halla", "Ingvar",
      "Jorun", "Ketil", "Leif", "Magnhild", "Njal", "Olaf", "Ragna", "Sigrun",
      "Torbjorn", "Ulfar", "Vigdis", "Yngve", "Aslaug", "Bergljot", "Cnut", "Dagfinn",
      "Embla", "Finnbogi", "Gudrun", "Hallvard", "Ingrid", "Jarl", "Kolbein", "Liv",
      "Mjoll", "Nanna", "Orm", "Petra", "Runa", "Steinar", "Thyra", "Una",
      "Valdis", "Yrsa", "Arnfinn", "Brynja", "Eilif", "Frode", "Geirr", "Hjordis",
      "Isak", "Jofrid", "Knut", "Lagnhild", "Mette", "Nils", "Oddny", "Ranveig",
      "Sverre", "Tora", "Ubbe", "Vebjorn", "Asmund", "Birgit", "Dorte", "Egil",
      "Fridleif", "Gisli", "Haakon", "Ivar", "Jostein", "Kari", "Lisbet", "Mats",
      "Nora", "Ottar", "Pernille", "Rikard", "Solveig", "Tryggve", "Ulrika", "Viggo",
    ],
    family: [
      "Haraldsen", "Eriksdottir", "Bjornsson", "Thorvaldsen", "Gunnarsdottir", "Ivarsen", "Olafsson", "Sigurdsen",
      "Halvorsen", "Knutsdottir", "Lindgren", "Magnusson", "Nilsen", "Ormsson", "Ragnarsen", "Solbakken",
      "Torvik", "Ulvestad", "Vikstrom", "Aasen", "Bergstad", "Dahl", "Eide", "Fjeldstad",
      "Grindal", "Holmgren", "Isaksen", "Jernberg", "Kaldahl", "Lunde", "Moen", "Nesheim",
      "Ostby", "Rasmussen", "Skogen", "Tveit", "Vang", "Aarvik", "Brekke", "Ekeland",
      "Foss", "Gjerde", "Hauge", "Iversen", "Kvale", "Leknes", "Mjelde", "Naess",
      "Rognes", "Strand",
    ],
    places: [
      "Skjoldvik", "Hravnsfjord", "Ulvedal", "Brekkeness", "Ormhaug", "Solvang", "Torsvik", "Vindheim",
      "Aldrefjell", "Bjornoy", "Dalsfjord", "Eidsvoll Gard", "Fossheim", "Grimstad Vik", "Haugesund Nord", "Isfjord",
      "Jotunheimen Pass", "Kvaloy", "Lysefjell", "Myrkdal", "Nordhavn", "Odinsvall", "Rimfaxe", "Svartevik",
      "Trollhaugen", "Urdal", "Vadheim", "Aurland Gard", "Bergdalen", "Djupvik", "Eikeland", "Frostvag",
      "Gullfoss Gard", "Hornelen", "Ingolfsvik", "Kaldnes", "Langfjord", "Mosjoen Stad", "Njardvik", "Orlandsvag",
    ],
  },
};

/** The names a model reaches for first; no built-in list may hold one. */
export const OVERUSED_NAMES: readonly string[] = [
  "Elara", "Kael", "Kaelen", "Lyra", "Thorne", "Mara", "Elias", "Ravenwood", "Aria", "Luna",
  "Seraphina", "Elena", "Aldric", "Theron", "Zephyr", "Lysander", "Evelyn", "Eldrin",
];
