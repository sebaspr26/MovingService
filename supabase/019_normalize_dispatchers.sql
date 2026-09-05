-- Normalize existing dispatchers and enforce normalization on future inserts/updates

-- 1. Clean up existing dispatcher values: trim, collapse whitespace, take first word, uppercase
UPDATE orders
SET dispatcher = upper(split_part(trim(regexp_replace(dispatcher, '\s+', ' ', 'g')), ' ', 1))
WHERE dispatcher IS NOT NULL AND dispatcher <> '';

-- 2. Create trigger function to keep dispatchers normalized automatically
CREATE OR REPLACE FUNCTION normalize_dispatcher()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.dispatcher IS NOT NULL AND NEW.dispatcher <> '' THEN
    NEW.dispatcher := upper(split_part(trim(regexp_replace(NEW.dispatcher, '\s+', ' ', 'g')), ' ', 1));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Attach trigger to orders table
DROP TRIGGER IF EXISTS trg_normalize_dispatcher ON orders;
CREATE TRIGGER trg_normalize_dispatcher
BEFORE INSERT OR UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION normalize_dispatcher();
