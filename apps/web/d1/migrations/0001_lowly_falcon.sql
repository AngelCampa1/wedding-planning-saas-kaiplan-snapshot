CREATE UNIQUE INDEX IF NOT EXISTS signups_email_unique
  ON signups (email);

CREATE UNIQUE INDEX IF NOT EXISTS signups_referral_code_unique
  ON signups (referral_code);

CREATE UNIQUE INDEX IF NOT EXISTS signups_survey_token_unique
  ON signups (survey_token);

CREATE UNIQUE INDEX IF NOT EXISTS survey_responses_unique_idx
  ON survey_responses (signup_email, question_id);

CREATE UNIQUE INDEX IF NOT EXISTS referrals_pair_idx
  ON referrals (referral_code, referred_email);
