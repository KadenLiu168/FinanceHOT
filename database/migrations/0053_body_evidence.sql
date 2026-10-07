-- Optional provenance for extracted documents; existing materials and revisions remain intact.
ALTER TABLE articles ADD COLUMN body_evidence jsonb;
ALTER TABLE article_revisions ADD COLUMN body_evidence jsonb;
ALTER TABLE articles ADD COLUMN disclosure_progress jsonb;
