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

export function messageToUMS(activity: any): UMS {
  return {
    channel: 'teams',
    threadId: activity.conversation.id,
    userId: activity.from.id,
    messageType: 'text',
    text: activity.text,
    metadata: {
      locale: 'en',
    },
  };
}

export function buttonActionToUMS(activity: any): UMS {
  const actionData = activity.value;
  const [draftId, actionType] = actionData?.split(':') || ['', 'unknown'];

  return {
    channel: 'teams',
    threadId: activity.conversation.id,
    userId: activity.from.id,
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
