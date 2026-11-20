BEGIN;

UPDATE public.user_request
SET user_email = LOWER(BTRIM(user_email))
WHERE user_email IS DISTINCT FROM LOWER(BTRIM(user_email));

WITH ranked_active_requests AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY LOWER(BTRIM(user_email))
               ORDER BY CASE
                   WHEN status = 'pending' AND is_email_verified = TRUE THEN 0
                   WHEN status = 'pending' AND is_email_verified = FALSE THEN 1
                   ELSE 2
               END,
               updated_at DESC NULLS LAST,
               created_at DESC NULLS LAST,
               id DESC
           ) AS row_number
    FROM public.user_request
    WHERE is_used = FALSE
)
UPDATE public.user_request ur
SET is_used = TRUE,
    updated_at = NOW()
FROM ranked_active_requests ranked
WHERE ranked.id = ur.id AND ranked.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_request_active_normalized_email
    ON public.user_request (LOWER(BTRIM(user_email)))
    WHERE is_used = FALSE;

COMMIT;
