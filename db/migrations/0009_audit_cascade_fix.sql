-- Refine audit_logs_immutable to allow foreign key ON DELETE SET NULL while strictly blocking tampering or deletion.
CREATE OR REPLACE FUNCTION audit_logs_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'audit_logs is append-only';
  ELSIF TG_OP = 'UPDATE' THEN
    -- Allow foreign key ON DELETE SET NULL cascades to nullify user_id or project_id,
    -- while keeping action, meta, timestamps, ip, user_agent, and target strictly immutable.
    IF (OLD.id = NEW.id AND
        OLD.action = NEW.action AND
        OLD.target_type IS NOT DISTINCT FROM NEW.target_type AND
        OLD.target_id IS NOT DISTINCT FROM NEW.target_id AND
        OLD.ip IS NOT DISTINCT FROM NEW.ip AND
        OLD.user_agent IS NOT DISTINCT FROM NEW.user_agent AND
        OLD.meta = NEW.meta AND
        OLD.created_at = NEW.created_at AND
        (NEW.user_id IS NULL OR NEW.user_id = OLD.user_id) AND
        (NEW.project_id IS NULL OR NEW.project_id = OLD.project_id)) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'audit_logs is append-only';
  END IF;
  RETURN NEW;
END;
$$;
