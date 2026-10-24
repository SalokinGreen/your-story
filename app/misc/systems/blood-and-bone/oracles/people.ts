/**
 * Blood & Bone expansion E1 (decisions 150-159): the People table family.
 * Original text (decision 3), approved as the E0 sample (decision 159).
 */
import type { BuiltinNote } from "../../types";

export const PEOPLE_NOTE: BuiltinNote = {
  id: "builtin:blood-and-bone:oracles-people",
  title: "B&B — People",
  type: "table",
  tags: ["Blood & Bone", "Oracle"],
  content: `# B&B — People

Four tables for the people the characters meet. Roll the ones you need;
you rarely need all four. A name and one line of look are enough for a
walk-on. A secret is for anyone who will be seen twice.

## Names (d100)
Mixed on purpose: the cities of the night are full of people from somewhere else.

1. Anka Dorn
2. Teodor Vasile
3. Mireille Caron
4. Jonas Lindqvist
5. Ilona Farkas
6. Bastien Roy
7. Greta Halvorsen
8. Pavel Novák
9. Inès Morel
10. Declan Furey
11. Sofia Brandt
12. Matteo Ricci
13. Zuzana Holá
14. Emre Kaya
15. Lotte Visser
16. Radu Ionescu
17. Agnieszka Wróbel
18. Oskar Weiss
19. Clara Monteiro
20. Niamh Doyle
21. Viktor Sauer
22. Elif Demir
23. Henrik Aas
24. Marta Kowal
25. Luc Fontaine
26. Dagny Strand
27. Tomasz Lis
28. Ines Albrecht
29. Ruairí Quinn
30. Beatriz Lobo
31. Milan Horvat
32. Hanne Berg
33. Yusuf Arslan
34. Edith Marlow
35. Florin Popa
36. Saskia de Wit
37. Kasimir Wolff
38. Lucia Esposito
39. Ondřej Malý
40. Freya Lund
41. Gabriel Leroux
42. Danuta Krol
43. Stelian Munteanu
44. Rosa Abend
45. Callum Shaw
46. Vera Szabó
47. Anton Krüger
48. Margit Toth
49. Rafael Dias
50. Ingrid Moe
51. Nikola Petrović
52. Ottilie Fink
53. Corentin Blanc
54. Liesel Hartmann
55. Ciarán Walsh
56. Dorota Zając
57. Benedek Kiss
58. Paola Greco
59. Sander Bakker
60. Ileana Stan
61. Wilhelm Roth
62. Solveig Dahl
63. Mehmet Yıldız
64. Hélène Girard
65. Bogdan Lazar
66. Juno Achterberg
67. Fergus Kane
68. Kinga Nagy
69. Mateus Rocha
70. Annelie Voss
71. Jiří Svoboda
72. Orla Byrne
73. Dmitri Orlov
74. Céleste Dumas
75. Piet Mulder
76. Agata Nowicka
77. Lorenzo Conti
78. Malin Ek
79. Ferenc Balogh
80. Theodora Keane
81. Ansgar Vogel
82. Livia Marin
83. Rory Hale
84. Eszter Varga
85. Gaspard Noel
86. Wanda Szymańska
87. Kristof Aalders
88. Simona Rossi
89. Ivo Dragan
90. Maud Thorne
91. Leopold Graf
92. Ana Ferreira
93. Sorin Dobre
94. Helga Brenner
95. Eamon Burke
96. Noémie Lambert
97. Lukas Ebner
98. Katalin Fekete
99. Gideon Ashby
100. A name they won't give. Roll again for the one on their papers, which is a lie.

## A stranger's look (d66)
11 A good coat, a cheap phone, cracked down the middle.
12 Hospital wristband still on, cut half through.
13 Wedding ring worn on the wrong hand.
14 Paint under every fingernail, four colours.
15 Too warm for the weather: scarf, gloves, hat, sweating.
16 One eye a different colour, and they keep it turned away.
21 Delivery uniform, no bag, no bike.
22 Old burn scar up the side of the neck, proudly uncovered.
23 Perfect posture, cheap shoes.
24 Smells of church: wax, dust, incense.
25 A child's drawing folded in the breast pocket.
26 Shaved head, healing cut across the scalp.
31 Expensive watch, stopped at 3:14.
32 Soaked to the knees, though it hasn't rained.
33 Reading glasses on a chain, never used.
34 Bitten nails, beautiful hands otherwise.
35 Grey at twenty-five.
36 A press badge from a paper that closed years ago.
41 Laughs too loud, at nothing, then checks who heard.
42 Black clothes, white dog hair all over them.
43 A tremor that stops when they're frightened.
44 Lipstick on the collar, theirs.
45 Tourist map, local accent.
46 Keys to a car that isn't parked anywhere near.
51 Bruised knuckles, gentle voice.
52 Never sits with their back to a window.
53 A rosary used as a bracelet, beads worn flat.
54 Chef's whites under a raincoat, 4 a.m.
55 Smiles with the mouth only. The eyes are counting exits.
56 Carries flowers that are already dead.
61 Hands smell of earth and of bleach.
62 A tattoo of a date, last month.
63 Speaks to you in your own first language before you've spoken.
64 Their shadow is a beat late. Look again and it isn't.
65 Clean, pressed, terrified.
66 Roll twice. Both are true, and they don't fit together.

## What they're hiding (d20)
1. A debt to someone who isn't human, and they know it.
2. They saw something last winter and have told no one.
3. They're informing on the people they work for.
4. A second family in another city.
5. They're dying, and they've been offered a way out.
6. They used to be a hunter. They quit. Mostly.
7. They're the reason someone went missing.
8. They are not who their papers say.
9. They know what you are, and it isn't fear in their face.
10. They're being fed on, by consent, and they like it.
11. A crime they got away with, and the person who knows.
12. They're looking for someone, and you look like a lead.
13. They're in love with a Ghost.
14. Their faith is gone and their congregation must not find out.
15. They're carrying something for someone, and haven't looked inside.
16. A Connection of yours pays them to watch you.
17. They've started to change, and they don't know into what.
18. Nothing. Their life is ordinary, which is exactly why they're in danger.
19. They owe the Vigil, and the Vigil is calling it in.
20. Roll twice: the first is what they'll admit, the second is the truth.

## A tell of the Kind (d6, on the Kind's list)
A small sign a sharp-eyed character could notice. Noticing is a Wits roll
at most; the tell is never proof on its own.

### Vampire
1. No breath fogs in the cold.
2. Declines every drink, politely.
3. Waits at the door to be asked in.
4. Too still between movements.
5. A faint metal sweetness on their breath.
6. Mirrors in the room have been turned.

### Gargoyle
1. Grit in the creases of their hands.
2. Heavier than they look; the floor tells.
3. Never seen by day.
4. Unblinking for a full minute.
5. Cold to the touch even in summer.
6. Pigeons go quiet around them.

### Wendigo
1. Eats constantly and stays thin.
2. Smells of frost and old meat.
3. Lips cracked raw.
4. Looks at people the way people look at menus.
5. Wears too many layers.
6. A hollowness under the cheekbones that shifts.

### Werewolf
1. Runs hot; sleeves always rolled.
2. Sniffs the air before answering.
3. Nails thick and ridged.
4. Restless near the full moon, calm after.
5. Dogs defer to them.
6. A healed bite older than they are.

### Witch/Warlock
1. Chalk dust on the cuffs.
2. Counts under their breath.
3. Salt in their pockets.
4. Something always paid before a favour.
5. Plants in the room lean toward them.
6. A smell of struck matches.

### Hunter
1. Silver somewhere visible.
2. Sits facing every door.
3. Old knife scars on the forearms.
4. Asks the time, then checks the sky.
5. Holy water in a water bottle.
6. Knows the local Kinds' word for "hunter".

### Ghost
1. Never touches anything first.
2. The phone screen won't wake for them.
3. Stands where furniture used to be.
4. Clothes a decade out of date.
5. A cold spot follows them by a step.
6. No one else remembers them coming in.

Use when a new person enters the scene, when you need a stranger's face,
or when you want to know what someone is not saying.`,
};
