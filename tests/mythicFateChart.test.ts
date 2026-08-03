/**
 * The Fate Chart's orientation.
 *
 * The chart used to be a literal table of `[Exceptional Yes, Yes,
 * Exceptional No]` cells read back as `[Exceptional No, No, Yes, Exceptional
 * Yes]`, with the likelihood columns reversed on top of that. Nothing caught
 * it because nothing asserted on the *distribution* - the oracle answered
 * "yes" to 95% of 50/50 questions at the default Chaos Factor and 50% of
 * "Impossible" ones, and the only visible symptom was a GM that never seemed
 * to hear no.
 *
 * These tests pin the axes rather than individual cells: yes-chance rises
 * with likelihood, rises with chaos, a 50/50 at Chaos Factor 5 is a literal
 * coin flip, and every roll on the die maps to exactly one answer.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  askFate,
  fateTargetNumber,
  fateThresholds,
  type FateAnswer,
  type Likelihood,
} from "@/app/misc/mythic";

const LIKELIHOODS: Likelihood[] = [
  "Impossible",
  "No Way",
  "Very Unlikely",
  "Unlikely",
  "50/50",
  "Somewhat Likely",
  "Likely",
  "Very Likely",
  "Near Sure Thing",
  "A Sure Thing",
  "Has To Be",
];

/** Every d100 face, resolved through askFate with Math.random stubbed. */
function answersForEveryRoll(
  likelihood: Likelihood,
  chaosFactor: number
): FateAnswer[] {
  const answers: FateAnswer[] = [];
  for (let roll = 1; roll <= 100; roll++) {
    // Mid-bucket rather than the lower edge: `(roll - 1) / 100` lands on
    // floating-point values that floor back to roll - 1 (0.29 * 100 is
    // 28.999...), which would silently test the wrong face.
    vi.spyOn(Math, "random").mockReturnValue((roll - 0.5) / 100);
    const result = askFate(likelihood, chaosFactor);
    expect(result.roll).toBe(roll);
    answers.push(result.answer);
  }
  return answers;
}

/**
 * A yes is a yes however it's qualified. "Yes, but" costs something, but
 * the thing still happened - it must count on the yes side of the ladder,
 * or the qualified bands would look like they'd moved the odds.
 */
const YES_ANSWERS = new Set<FateAnswer>([
  "Exceptional Yes",
  "Normal Yes",
  "Yes, but",
]);

function yesChance(likelihood: Likelihood, chaosFactor: number): number {
  return answersForEveryRoll(likelihood, chaosFactor).filter((a) =>
    YES_ANSWERS.has(a)
  ).length;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fate chart orientation", () => {
  it("makes a 50/50 question at chaos 5 an actual coin flip", () => {
    expect(yesChance("50/50", 5)).toBe(50);
  });

  it("does not answer yes to an Impossible question half the time", () => {
    // The headline symptom of the old chart: 50% yes on "Impossible".
    expect(yesChance("Impossible", 5)).toBe(1);
    expect(yesChance("Has To Be", 5)).toBe(99);
  });

  it("raises the yes-chance monotonically as likelihood rises", () => {
    for (const chaosFactor of [1, 3, 5, 7, 9]) {
      const chances = LIKELIHOODS.map((l) => yesChance(l, chaosFactor));
      for (let i = 1; i < chances.length; i++) {
        expect(chances[i]).toBeGreaterThanOrEqual(chances[i - 1]);
      }
      // ...and it actually spans a range, rather than saturating at the top
      // the way rows 5-9 of the old table all did.
      expect(chances[chances.length - 1]).toBeGreaterThan(chances[0]);
    }
  });

  it("raises the yes-chance monotonically as chaos rises", () => {
    for (const likelihood of LIKELIHOODS) {
      const chances = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((cf) =>
        yesChance(likelihood, cf)
      );
      for (let i = 1; i < chances.length; i++) {
        expect(chances[i]).toBeGreaterThanOrEqual(chances[i - 1]);
      }
    }
    // A 50/50 question tracks Mythic's own published column.
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map((cf) => yesChance("50/50", cf))).toEqual(
      [10, 15, 25, 35, 50, 65, 75, 85, 90]
    );
  });

  it("clamps out-of-range chaos factors instead of falling off the ladder", () => {
    expect(fateTargetNumber("50/50", -5)).toBe(fateTargetNumber("50/50", 1));
    expect(fateTargetNumber("50/50", 99)).toBe(fateTargetNumber("50/50", 9));
  });
});

describe("fate answers", () => {
  it("covers every roll on the die exactly once, in order", () => {
    // The old branch chain ended in an unconditional `else` that turned
    // every roll past its top threshold into an Exceptional Yes, so the
    // highest rolls could never come back as a no.
    // Each side of the target is split into fifths: outermost fifth
    // exceptional, innermost fifth (nearest the target) qualified, the
    // three in between ordinary.
    const answers = answersForEveryRoll("50/50", 5);
    expect(answers.slice(0, 10)).toEqual(Array(10).fill("Exceptional Yes"));
    expect(answers.slice(10, 40)).toEqual(Array(30).fill("Normal Yes"));
    expect(answers.slice(40, 50)).toEqual(Array(10).fill("Yes, but"));
    expect(answers.slice(50, 60)).toEqual(Array(10).fill("No, but"));
    expect(answers.slice(60, 90)).toEqual(Array(30).fill("Normal No"));
    expect(answers.slice(90, 100)).toEqual(Array(10).fill("Exceptional No"));
  });

  it("never leaves a roll unanswered at any chart position", () => {
    const valid = new Set([
      "Exceptional Yes",
      "Normal Yes",
      "Yes, but",
      "No, but",
      "Normal No",
      "Exceptional No",
    ]);
    for (const likelihood of LIKELIHOODS) {
      for (const chaosFactor of [1, 5, 9]) {
        for (const answer of answersForEveryRoll(likelihood, chaosFactor)) {
          expect(valid.has(answer)).toBe(true);
        }
      }
    }
  });

  it("names the ordinary results explicitly so they can't read as exceptional", () => {
    // The GM was narrating plain successes as if the oracle had swung hard;
    // a bare "Yes" alongside "Exceptional Yes" invites exactly that.
    const answers = answersForEveryRoll("50/50", 5);
    expect(answers).not.toContain("Yes");
    expect(answers).not.toContain("No");
    expect(answers).toContain("Normal Yes");
    expect(answers).toContain("Normal No");
  });

  it("keeps exceptional results to a fifth of their side of the target", () => {
    expect(fateThresholds(50)).toEqual({
      exceptionalYesMax: 10,
      exceptionalNoMin: 91,
      yesButMin: 41,
      noButMax: 60,
    });
    // At the extremes a fifth rounds away to nothing - a near-certain
    // question has no room left to swing further.
    expect(fateThresholds(99).exceptionalNoMin).toBeGreaterThan(100);
    expect(fateThresholds(1).exceptionalYesMax).toBe(0);
    // ...and the qualified bands collapse the same way, expressed as an
    // empty range rather than a special case.
    expect(fateThresholds(1).yesButMin).toBeGreaterThan(1);
    expect(fateThresholds(99).noButMax).toBe(99);
  });
});
