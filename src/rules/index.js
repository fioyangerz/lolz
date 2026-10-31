// Move-specific rule sets, keyed by Dance.rules. A rule set is (ctx) => issues[].
// Dances without one (e.g. future uploaded TikTok choreo) still get generic feedback.
import { dougieRules } from './dougie.js';

export const RULES = {
  dougie: dougieRules,
};
