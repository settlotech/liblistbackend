CREATE TABLE IF NOT EXISTS public.policy_chat_messages (
    id           BIGSERIAL PRIMARY KEY,
    document_id  UUID NOT NULL REFERENCES document_management.documents(id) ON DELETE CASCADE,
    sender_id    UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
    message_type VARCHAR(20) NOT NULL CHECK (message_type IN ('user', 'assistant', 'task')),
    content      TEXT NOT NULL CHECK (length(trim(content)) > 0 AND length(content) <= 5000),
    task_id      INTEGER NULL REFERENCES public.tasks(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_policy_chat_messages_document_time
    ON public.policy_chat_messages (document_id, created_at, id);
