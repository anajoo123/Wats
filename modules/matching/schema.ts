import { z } from 'zod';

export const MatchDecisionSchema = z.object({
  decision: z.enum(['accept', 'decline']),
});

export interface MatchExplanation {
  skill_score: number;        // max 40
  region_score: number;       // max 25
  availability_score: number; // max 20
  load_balance_score: number; // max 15
  total_score: number;        // 0..100
  region_match_level: 'exact_cell' | 'same_region' | 'same_country';
  open_tasks_count: number;
  sensitive_qualified: boolean;
  factors_excluded: ['wealth', 'donations', 'past_aid_count'];
}
