ALTER TABLE sources ADD COLUMN label text CHECK (label IS NULL OR (length(label) BETWEEN 1 AND 60 AND label !~ '[[:cntrl:]]'));
