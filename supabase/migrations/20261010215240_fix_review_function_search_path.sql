-- Pin review-reaction trigger functions to a known search_path.
BEGIN;

CREATE OR REPLACE FUNCTION public.recalc_review_reactions(rid text)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  UPDATE public.reviews
  SET
    likes = (SELECT count(*) FROM public.review_reactions WHERE review_id = rid AND kind = 'like'),
    dislikes = (SELECT count(*) FROM public.review_reactions WHERE review_id = rid AND kind = 'dislike')
  WHERE id = rid;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recount_review_reactions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  rid text;
BEGIN
  IF tg_op = 'DELETE' THEN
    rid := old.review_id;
  ELSE
    rid := new.review_id;
  END IF;
  UPDATE public.reviews
  SET
    likes = (SELECT count(*) FROM public.review_reactions WHERE review_id = rid AND kind = 'like'),
    dislikes = (SELECT count(*) FROM public.review_reactions WHERE review_id = rid AND kind = 'dislike')
  WHERE id = rid;
  RETURN coalesce(new, old);
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_review_reactions_del()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  PERFORM public.recalc_review_reactions(OLD.review_id);
  RETURN OLD;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_review_reactions_ins()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  PERFORM public.recalc_review_reactions(NEW.review_id);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_review_reactions_upd()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  PERFORM public.recalc_review_reactions(NEW.review_id);
  RETURN NEW;
END;
$function$;

COMMIT;
