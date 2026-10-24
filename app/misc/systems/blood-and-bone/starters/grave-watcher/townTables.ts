/**
 * Grave Watcher: the town's tables (docs/bb-starters-design.md 3.5, decision
 * 172): what is happening on Main Street, who is at the Lamplight, the gossip,
 * a hundred kinds of people, and names. Original text (decision 3). Each note
 * passes tests/helpers/tableShape.ts.
 */
import type { StoryLore } from "../../../../structs";
import { starterNote } from "../shared";

const TOWN_TODAY = starterNote(
  "Grave Watcher — Town today",
  "table",
  `# Grave Watcher — Town today

What is going on in Hollins Ferry right now. Roll when the Watchers walk out of a door, wake up, or come back from a night shift.

## On Main Street (1d20)

1. Walt has taped a new sign to every door. Nobody has read the first one.
2. The Founders' Day committee is measuring the street with a string and an argument.
3. A moving van sits in front of the Hendricks place; the mover asks which way the cemetery is.
4. Rocco is towing a car that was not parked, and the owner is in the passenger seat.
5. The bakery line goes round the corner; Fiona's loud family is handing out samples and insults.
6. Gus and Arlo are both washing their half of the shop window, and have met in the middle.
7. A bridal party is photographing itself in front of St. Bride's; Sister Agnes is critiquing from the porch.
8. The dance studio's window is open and someone is counting out loud to a waltz.
9. A film crew of three is shooting a documentary about small-town cemeteries and wants a quote.
10. Pearl Whitlock is crossing the road with a bunch of lilies and refuses all offers of a lift.
11. A county truck is repainting the crosswalk; Walt is supervising, with a clipboard.
12. A stray dog has adopted the bench outside Brandt Hardware; Wendell is pretending not to feed it.
13. Cora is selling raffle tickets door to door; the prize is a casserole with a name.
14. Eli is up a ladder fixing the town clock, which is 11 minutes slow and has been since the spring.
15. Tommy is racing down the street with a pie in each hand and Marisol shouting behind him.
16. The sheriff is writing a ticket for a parked hearse and does not look happy about it.
17. A busker is playing the harmonica by the bank; Celeste is leaning out of her window to correct his tempo.
18. The fog has not lifted from the reservoir road all day; people are driving with their lights on at noon.
19. Teddy Vance is hanging a wreath on the funeral home door; Ingrid is across the road, watching.
20. Everything is quiet, which is suspicious, and Nell has noticed.

Use when the Watchers step out into Hollins Ferry, or when a scene needs weather, noise and neighbours.`,
);

const AT_THE_LAMPLIGHT = starterNote(
  "Grave Watcher — Who's at the Lamplight",
  "table",
  `# Grave Watcher — Who's at the Lamplight

Who is in the diner when the Watchers walk in. Roll once for the room, again for the back booth.

## At the counter and the booths (1d20)

1. Walt, holding court at the counter over a parking diagram drawn on a napkin.
2. Cora and Marisol, in a cold war about the pie table, civil to the death.
3. Sheriff Okafor, third stool, hiding behind the crossword.
4. Hank, off shift, eating pancakes at three in the afternoon and explaining it.
5. Bea Lindqvist with a stack of old photographs, hunting for the one thing nobody remembers.
6. Dr. Price, two seats down, asleep sitting up over a cold coffee.
7. Rocco, tracks of oil on his sleeve, telling Marisol which songs he'll play on the diner radio.
8. Gus at one end of the counter and Arlo at the other, with Wendell in the middle as a hostage.
9. Owen Lister, charming the waitress, who is charmed and annoyed about it.
10. Pastor Hal, with a slice of pie, delivering the second half of a sermon to a polite stranger.
11. Fiona and two of her family, loud, sharing a plate of fries, arguing over who is the youngest.
12. June, on her break, headset still on, listening to the scanner while she eats.
13. Pearl Whitlock with her hat on, ordering for three, and looking at the empty chairs.
14. Celeste with two students, rehearsing the marathon schedule on the back of the menu.
15. Eli, a soldering iron in his top pocket, borrowing a power outlet for a radio.
16. Tommy, off the clock but still wearing the apron, asking a Watcher how to apply.
17. Teddy Vance in the back booth, ordering a salad, watching the door.
18. Nell, whispering at a booth with someone you have never seen before.
19. Desmond, in daylight, with dark glasses and a thermos, for an appointment he will not explain.
20. Marisol herself, sitting in her own diner, which she never does. Something is wrong.

Use when the Watchers walk into the diner, or when a scene needs a face with a bit of business.`,
);

const GOSSIP = starterNote(
  "Grave Watcher — Gossip going round",
  "table",
  `# Grave Watcher — Gossip going round

What the town is saying. Most of it is wrong and all of it is repeated. Roll once for the story and again for who is telling it.

## The talk of the town (1d20)

1. Teddy Vance paid cash for the Hendricks place. Cash! Who has cash?
2. Walt is going to run for county commissioner and has not told Cora, who is already running his campaign.
3. Arlo and Gus will finally speak at the Founders' Day pancake breakfast. There is a pool.
4. Someone has been leaving fresh flowers in the Old Lot, where nobody is buried.
5. The Board is sending an inspector, and he is single.
6. Desmond Hale has not aged in thirty years. (Everyone has noticed. Nobody minds. Everyone says it anyway.)
7. Celeste is selling the studio, or being sold it, or both.
8. The sheriff is applying for a job in the city, and Walt is already looking for a replacement.
9. Pastor Hal's sermon last Sunday was shorter than the benediction, and everyone is worried.
10. The library's historical society has found a photograph that proves something. Bea won't say what.
11. Fiona's family moved the bakery's hours to 4 a.m. and the whole street is awake.
12. A light was seen again in the Long Acre, low and green, moving between the graves like a person looking for a name.
13. Marisol is thinking of selling up. She says it every spring. This year she has not said it.
14. Rocco proposed to somebody in the gas station, and she said she'd think about it. Nobody knows who.
15. Dr. Price was seen at three a.m. at the Long Acre gate with her bag. Nobody saw her come out.
16. Tommy applied to the Board of Wardens and has already been told no.
17. The Hendricks place is haunted, say the movers. The movers are not from here.
18. Nell says the man in room 6 has not left it in nine days, and she is not worried, only curious.
19. Somebody has been mailing anonymous pies to the Watch. Marisol wants to know who, and why they got her recipe.
20. Tower Six's lamp was on last night. Nobody is in Tower Six. June says she did not see it. June is lying.

Use when someone in town needs something to say, when a scene needs a rumour to chase, or when a quiet day needs a thread.`,
);

const PEOPLE_YOU_MIGHT_MEET = starterNote(
  "Grave Watcher — People you might meet",
  "table",
  `# Grave Watcher — People you might meet

A hundred kinds of people, not named ones: the stranger at the gas station, the face in the crowd at the Lantern Walk. Roll, then name them with the Names table, and play them.

## Kinds of people (1d100)

1. A hearse driver on his lunch break, parked where the view is good.
2. A Werewolf family on a road trip, all asleep in the van but the dad.
3. A retired Watcher from another yard who still checks the sky at dusk.
4. A trucker whose GPS keeps routing him to the Long Acre gate.
5. A Changeling selling soap at the farm stand, with a different face than last month.
6. A college kid filming a dare video, already regretting it.
7. A Vampire insurance adjuster who works only nights and is very sorry about it.
8. A woman in a church hat reading headstones aloud to her late sister.
9. A Rusalka in waders fishing the reservoir bank, polite about it.
10. A county surveyor whose chain keeps measuring the Old Lot differently.
11. A boy selling lemonade at a funeral reception, with a sign that says "Condolences, 50 cents".
12. A Hunter on holiday who has packed no weapons and keeps patting his belt.
13. A young couple eloping, lost, and sure the other one has the map.
14. A grave-robber's apprentice with a very clean shovel.
15. A wedding photographer who only shoots the dead, and says it is a better crowd.
16. A farmer with a pickup full of pumpkins and a story about last Halloween.
17. A priest from the next diocese with a flat tyre and a thermos of whiskey.
18. A Ghost still waiting at the bus stop for a bus that was cancelled in 1982.
19. A trucker's wife with a casserole and a sharp question about her husband.
20. A fisherman who swears the reservoir is deeper than the map says.
21. A Revenant who has come back for a coat, and will say no more.
22. A mailman with a letter for a house that was torn down in 1998.
23. An elderly couple who dress alike and finish each other's complaints.
24. A teenage runaway with a duffel bag and a very good lie.
25. A Doppelgänger in a rented suit, trying to pass as the man who owns it.
26. A veterinarian with a dog that will not walk past the diner's back door.
27. A wandering preacher with a sandwich board and a good voice.
28. A radio-show host recording a segment about haunted small towns, annoyed that this one is quiet.
29. A Wendigo on a camping trip, polite, vegetarian this week, standing very close to the buffet.
30. A woman asking whether the Watch has seen her brother, and showing a photo from 1971.
31. A bored deputy from the next county on a long errand.
32. A salesman with a trunk full of lightning rods, and a theory.
33. A bride who walked out of the chapel and is eating pie in her dress.
34. A gravestone carver with a chisel, a bad back and a lot of opinions about fonts.
35. A kid who says the dead talk to him, and is quite calm about it.
36. A couple from the city who want to buy a farmhouse and have not asked about the yard.
37. A Witch buying ribbon in bulk, and explaining it is for a school play.
38. A man who sells encyclopedias door to door, in the age of phones, with great dignity.
39. A nurse on night shift on the road home, exhausted, who stopped for a coffee and a rest.
40. A pair of ghost hunters with a camera that keeps showing the same empty chair.
41. A cheerful tax assessor measuring things nobody asked him to measure.
42. A widow with her husband's ashes in a thermos, looking for a pretty place.
43. A ranger from the state forest with a map and a request for the Watch's opinion.
44. A boy racer who has stalled his car outside the yard gate and refuses to be towed.
45. A Gargoyle on a day out, sitting on the church roof, pretending to be a statue and not very good at it.
46. A woman who runs a haunted-house attraction two counties over, scouting for ideas.
47. A man in a trench coat who says he is from the Board, and who is not on Owen's list.
48. A young reporter chasing a story about the town's missing library books.
49. A Rusalka's daughter on a school trip, wet at the hem, trying very hard to be normal.
50. A drover with a few sheep who has been told this is the shortcut.
51. A grave-visitor who comes every Thursday and leaves a cigarette on a stone.
52. A man who has come to settle a bet about whether Sister Agnes is real.
53. A lost tourist who will not use the map, and cannot be persuaded to ask.
54. A baker from the next town, here to buy Fiona's recipe, and being very casual about it.
55. A retired army medic who sits on the bench and listens to the Watch's radio.
56. A motorcyclist in leather, polite and very still, who does not take his helmet off.
57. A schoolteacher with eleven children and a field-trip permission slip made out for the wrong cemetery.
58. A boy and a girl who have been told not to come here, and have come every night for a week.
59. A woman with a rolling suitcase asking for room 6 and not asking the price.
60. A former Watcher who went to the city, and misses the fog.
61. A big, quiet man buying more salt than a person could use, and saying it is for a pond.
62. A Changeling child on her first visit among humans, wearing a coat that is a size too big.
63. A man who sells holy water by the gallon, labelled "from a spring" and nothing else.
64. A pair of nuns from a convent three counties over, arguing about the road.
65. A pilot who put his small plane down in the farmer's field and wants a ride to town.
66. A wedding caterer whose van has a flat and whose cake is going bad.
67. A teenage Watcher candidate with a certificate and an expression of enormous determination.
68. A Hunter's widow, here to see the grave of a husband who did not die here.
69. A man with a metal detector who will not stay out of the Paupers' Field.
70. A stage magician between shows, who knows exactly how the green light is done, and says so.
71. A heavily pregnant woman on her way to the clinic, delighted by everything, with the contractions an hour apart.
72. A truck driver who has been awake too long and asks, quietly, if the road ahead is the real one.
73. A little old man who knits in the gas station and claims it is a family tradition.
74. A Vampire on a road trip with a cooler, asking Desmond for a favour.
75. A woman who walks her dog at dusk, and whose dog never comes back with her.
76. A hotelier from the city who wants to buy the Ferry Motel and thinks Nell is joking.
77. A sheriff's cousin, here for the week, with strong views on how the town is run.
78. A boy delivering newspapers on a bike with no brakes and no fear.
79. A woman with a camper van and an enormous dog, who says she is writing a book.
80. A ghost's descendant, come to settle a debt that no one else remembers.
81. A pair of old men playing chess on the town green, one of whom is dead.
82. A high-school band bus with a broken axle and thirty hungry teenagers.
83. A lighthouse keeper on pension who finds the Watch's towers charming and badly built.
84. A woman in a long coat buying a single flower from Ingrid every Friday.
85. A man proposing to his girlfriend at the Lantern Walk, who is about to be interrupted.
86. A bounty hunter after someone in town, who will not say who.
87. A priest who is also a Werewolf and is trying to run both parishes.
88. A young woman who found her great-grandmother's name on a stone, and brought a wreath.
89. A drunk who has wandered up from the Low Water, singing, and who Hank is following at a discreet distance.
90. A man wearing a name tag from a convention three states away, looking for the convention.
91. A little girl with a lantern, who is not on anyone's list of local children.
92. A woman who lost a ring at the Founders' Day picnic eleven years ago and is back to search again.
93. A couple on a honeymoon who thought this was a quaint place to stay, and are right.
94. An old man with a cane who knew the Hendricks family, and wants to say something to Teddy.
95. A Revenant working as a cashier at the gas station, very good at her job, who does not eat.
96. A county clerk with a stack of forms for the Watch, and a smile that means every one of them is urgent.
97. A boy with a paper route and a map of every dog in town, who knows which ones will bark at the yard.
98. A sleepwalker in a nightgown, quite happy, walking toward the Long Acre.
99. A Doppelgänger who is wearing Tommy's apron, working a shift at the Lamplight, and nobody has noticed.
100. Someone who is exactly what they seem, and who has come a very long way to say one thing to one of the Watch.

Use when the Watchers need a stranger, a walk-on, or a new face in the crowd. Roll, then name them, and give them one want.`,
);

const NAMES = starterNote(
  "Grave Watcher — Names",
  "table",
  `# Grave Watcher — Names

Small-town American names, mixed from a lot of places. Roll one from each list.

## First names (1d100)

1. Abigail
2. Walter
3. Maribel
4. Leroy
5. Dolores
6. Curtis
7. Priya
8. Gordon
9. Tamika
10. Eugene
11. Hazel
12. Marcus
13. Lupe
14. Duane
15. Josephine
16. Ravi
17. Beverly
18. Cal
19. Winona
20. Raymond
21. Ana
22. Floyd
23. Mei
24. Harold
25. Delia
26. Jamal
27. Opal
28. Virgil
29. Esperanza
30. Nolan
31. Gladys
32. Kenji
33. Rhonda
34. Ellis
35. Saoirse
36. Jerome
37. Mabel
38. Tobias
39. Fatima
40. Lloyd
41. Constance
42. Darnell
43. Ruby
44. Stanley
45. Noor
46. Wade
47. Ida
48. Hector
49. Louise
50. Pete
51. Yolanda
52. Gil
53. Eunice
54. Amir
55. Frances
56. Clarence
57. Bonnie
58. Dev
59. Lorraine
60. Omar
61. Thelma
62. Silas
63. Carmen
64. Rudy
65. Ivy
66. Nate
67. Edna
68. Lamar
69. Kiri
70. Buck
71. Nadia
72. Percy
73. Maxine
74. Alma
75. Troy
76. Greta
77. Isaiah
78. Dot
79. Reuben
80. Marguerite
81. Ned
82. Tess
83. Julian
84. Hattie
85. Bao
86. Colleen
87. Roscoe
88. Imelda
89. Walker
90. Birdie
91. Moses
92. Candace
93. Otis
94. Lena
95. Gabe
96. Mavis
97. Ezra
98. Joanie
99. Felix
100. Odessa

## Family names (1d100)

1. Abbott
2. Alvarez
3. Bellamy
4. Bishop
5. Booker
6. Calloway
7. Castillo
8. Chen
9. Cobb
10. Dalton
11. Deshpande
12. Doyle
13. Easton
14. Estrada
15. Farrow
16. Fontaine
17. Gallagher
18. Garrett
19. Gray
20. Haddad
21. Hargrove
22. Holloway
23. Ibarra
24. Ingram
25. Jablonski
26. Jeffries
27. Kaplan
28. Keller
29. Kowalski
30. Lacey
31. Landry
32. Lowell
33. Maddox
34. Marlowe
35. McAllister
36. Nakamura
37. Novak
38. Nwosu
39. Oakes
40. Ortega
41. Overton
42. Pace
43. Pickett
44. Prescott
45. Quill
46. Quinlan
47. Radcliffe
48. Rao
49. Rourke
50. Salazar
51. Sandoz
52. Satterfield
53. Shapiro
54. Spurlock
55. Strand
56. Sutter
57. Tillman
58. Tran
59. Trujillo
60. Tuttle
61. Underhill
62. Upshaw
63. Vance
64. Vega
65. Voss
66. Wachowski
67. Wainwright
68. Whitaker
69. Wilkes
70. Winslow
71. Yates
72. Yoder
73. Zeller
74. Ziegler
75. Amato
76. Barlow
77. Crenshaw
78. Delacroix
79. Eastwood
80. Flanagan
81. Gillespie
82. Hobbs
83. Iverson
84. Jessup
85. Kincaid
86. Lundgren
87. Mercer
88. Nolte
89. Oyelaran
90. Peralta
91. Quarles
92. Rutledge
93. Sorensen
94. Thibodeaux
95. Underwood
96. Vasquez
97. Weller
98. Xiong
99. Youngblood
100. Zimmerman

Use when a new person needs a name, any time a face turns up. Roll one first name and one family name.`,
);

export const GW_TOWN_TABLES: StoryLore[] = [
  TOWN_TODAY,
  AT_THE_LAMPLIGHT,
  GOSSIP,
  PEOPLE_YOU_MIGHT_MEET,
  NAMES,
];
