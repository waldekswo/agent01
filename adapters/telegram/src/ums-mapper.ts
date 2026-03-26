// ============================================================
// Transform Telegram Update to UMS (Unified Message Spec)
// ============================================================

export interface UMS {
  channel: 'telegram' | 'teams';
  threadId: string;
  userId: string;
  messageType: 'text' | 'command' | 'button';
  text?: string;
  metadata: {
    locale?: string;
    isApprovedAction?: boolean;
    approval?: {
      draftId: string;
      action: 'approve' | 'reject';
    };
  };
}

export function messageToUMS(message: any): UMS {
  return {
    channel: 'telegram',
    threadId: String(message.chat.id),
    userId: String(message.from.id),
    messageType: message.text?.startsWith('/') ? 'command' : 'text',
    text: message.text,
    metadata: {
      locale: message.from.language_code || 'en',
    },
  };
}

export function buttonActionToUMS(query: any, action: string): UMS {
  const [draftId, actionType] = action.split(':');

  return {
    channel: 'telegram',
    threadId: String(query.message.chat.id),
    userId: String(query.from.id),
    messageType: 'button',
    metadata: {
      isApprovedAction: actionType === 'approve',
      approval: {
        draftId,
        action: actionType as 'approve' | 'reject',
      },
    },
  };
}
