import { expect, test } from "bun:test";
import { roast } from "./analyze.ts";

test("roast rewards a question with a reply hook", () => {
  const withQ = roast("what's the one agent workflow you'd never give up?");
  const withoutQ = roast("agent workflows are underrated and most people sleep on them.");
  expect(withQ.score).toBeGreaterThan(withoutQ.score);
});

test("roast penalizes 3+ hashtags and links in the body", () => {
  const spammy = roast("big news #ai #agents #coding check it https://example.com");
  const clean = roast("the agent loop that finally clicked for me was dead simple");
  expect(spammy.score).toBeLessThan(clean.score);
  expect(spammy.quip.length).toBeGreaterThan(0);
});

test("roast clamps the score to the 5-98 range", () => {
  const thin = roast("hi");
  expect(thin.score).toBeGreaterThanOrEqual(5);
  expect(thin.score).toBeLessThanOrEqual(98);
});
