-- Keep each user's Shidney conversation isolated by policy.
ALTER TABLE public.private_chats
    ADD COLUMN IF NOT EXISTS policy_id UUID NULL
    REFERENCES document_management.documents(id) ON DELETE CASCADE;

ALTER TABLE public.private_chats
    DROP CONSTRAINT IF EXISTS chk_private_chat_participants;

ALTER TABLE public.private_chats
    ADD CONSTRAINT chk_private_chat_participants CHECK (
        (is_ai = TRUE AND owner_user_id IS NOT NULL AND user_low_id IS NULL AND user_high_id IS NULL)
        OR
        (is_ai = FALSE AND owner_user_id IS NULL AND policy_id IS NULL
            AND user_low_id IS NOT NULL AND user_high_id IS NOT NULL AND user_low_id < user_high_id)
    );

DROP INDEX IF EXISTS public.uq_private_chat_ai_owner;

CREATE UNIQUE INDEX IF NOT EXISTS uq_private_chat_ai_general_owner
    ON public.private_chats (owner_user_id)
    WHERE is_ai = TRUE AND policy_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_private_chat_ai_policy_owner
    ON public.private_chats (owner_user_id, policy_id)
    WHERE is_ai = TRUE AND policy_id IS NOT NULL;

