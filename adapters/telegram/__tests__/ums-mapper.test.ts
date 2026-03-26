import { messageToUMS } from '../../src/ums-mapper';

describe('Telegram UMS Mapper', () => {
  it('converts message to UMS', () => {
    const message = {
      chat: { id: 123 },
      from: { id: 456, language_code: 'pl' },
      text: 'Hello agent',
    };

    const ums = messageToUMS(message);

    expect(ums.channel).toBe('telegram');
    expect(ums.userId).toBe('456');
    expect(ums.text).toBe('Hello agent');
    expect(ums.metadata.locale).toBe('pl');
  });
});
