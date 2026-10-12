// Shared (client + server) vocabulary for the hosted research beta: feedback taxonomy, review workflow, consent versions.
export const FEEDBACK_CATEGORIES = [
  { id: "incorrect_figure", label: "A figure is incorrect" },
  { id: "wrong_geography", label: "Wrong place (district / state)" },
  { id: "wrong_indicator_or_period", label: "Wrong indicator or time period" },
  { id: "incomplete_answer", label: "The answer is incomplete" },
  { id: "unclear_explanation", label: "The explanation is unclear" },
  { id: "missing_data_not_explained", label: "Missing data was not explained" },
  { id: "overconfident_or_unsafe", label: "Overconfident or potentially misleading" },
  { id: "other", label: "Something else" },
] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number]["id"];
export const FEEDBACK_CATEGORY_IDS: readonly string[] = FEEDBACK_CATEGORIES.map(c => c.id);

// Review workflow. Nothing here authorises training: "candidate_for_training_review" only queues a record for the
// separate, manual provenance / licence / consent review described in the pilot plan.
export const REVIEW_STATUSES = [
  "new", "triaged", "confirmed_issue", "not_an_issue", "needs_expert", "candidate_for_training_review", "rejected_for_training",
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const CONSENT_VERSION = "2026-10-beta-1";
export const MAX_COMMENT_CHARS = 1500;
export const MAX_CORRECTION_CHARS = 2000;
