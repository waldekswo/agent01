import { messageToUMS } from '../src/ums-mapper';

describe('Teams UMS Mapper', () => {
  it('converts activity to UMS', () => {
    const activity = {
      conversation: { id: 'conv123' },
      from: { id: 'user456' },
      text: 'Hello',
    };

    const ums = messageToUMS(activity);

    expect(ums.channel).toBe('teams');
    expect(ums.threadId).toBe('conv123');
    expect(ums.userId).toBe('user456');
  });
});
