alter table demo_scores drop constraint demo_scores_score_check;
alter table demo_scores add constraint demo_scores_score_check check (score >= 0 and score <= 5);