CREATE TABLE IF NOT EXISTS public.private_chats (
    id BIGSERIAL PRIMARY KEY,
    is_ai BOOLEAN NOT NULL DEFAULT FALSE,
    owner_user_id UUID NULL REFERENCES public.users(id) ON DELETE CASCADE,
    policy_id UUID NULL REFERENCES document_management.documents(id) ON DELETE CASCADE,
    user_low_id UUID NULL REFERENCES public.users(id) ON DELETE CASCADE,
    user_high_id UUID NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_private_chat_participants CHECK (
        (is_ai = TRUE AND owner_user_id IS NOT NULL AND user_low_id IS NULL AND user_high_id IS NULL)
        OR
        (is_ai = FALSE AND owner_user_id IS NULL AND policy_id IS NULL AND user_low_id IS NOT NULL AND user_high_id IS NOT NULL AND user_low_id < user_high_id)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_private_chat_ai_general_owner
    ON public.private_chats (owner_user_id) WHERE is_ai = TRUE AND policy_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_private_chat_ai_policy_owner
    ON public.private_chats (owner_user_id, policy_id) WHERE is_ai = TRUE AND policy_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_private_chat_direct_pair
    ON public.private_chats (user_low_id, user_high_id) WHERE is_ai = FALSE;

CREATE TABLE IF NOT EXISTS public.private_chat_messages (
    id BIGSERIAL PRIMARY KEY,
    chat_id BIGINT NOT NULL REFERENCES public.private_chats(id) ON DELETE CASCADE,
    sender_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
    message_type VARCHAR(20) NOT NULL CHECK (message_type IN ('user', 'assistant')),
    content TEXT NOT NULL CHECK (length(trim(content)) > 0 AND length(content) <= 5000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_private_chat_message_sender CHECK (
        (message_type = 'user' AND sender_id IS NOT NULL)
        OR (message_type = 'assistant' AND sender_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_private_chat_messages_chat_time
    ON public.private_chat_messages (chat_id, created_at, id);
