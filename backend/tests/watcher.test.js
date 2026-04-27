const { ruleClassify } = require('../src/services/nlp/rule_classifier');
const { mergeEntity, parsePollInterval, parseNotifyChannel, formatInterval } = require('../src/services/nlp/clarification_handler');

describe('Watcher Intent Classification', () => {
  test.each([
    'notify me when there is a new commit',
    'keep an eye on my repo',
    'alert me if something changes',
    'watch my github repo',
  ])('classifies "%s" as watcher intent', (input) => {
    const result = ruleClassify(input);
    expect(result.intent).toBe('watcher');
    expect(result.clarification_needed).toBe(true);
  });

  test('extracts repo when present', () => {
    const result = ruleClassify('watch my repo rahul/my-project');
    expect(result.intent).toBe('watcher');
    expect(result.entities.repo).toBe('rahul/my-project');
  });

  test('asks for repo when not specified', () => {
    const result = ruleClassify('notify me when something happens');
    expect(result.intent).toBe('watcher');
    expect(result.missing_entities).toContain('repo');
    expect(result.clarification_prompt).toContain('repo');
  });
});

describe('Watcher Clarification Flow', () => {
  test('chains questions one at a time', () => {
    // Start with a watcher intent missing repo, branch, poll_interval, notify_channel
    const initial = ruleClassify('notify me when something happens');
    expect(initial.missing_entities).toEqual(
      expect.arrayContaining(['repo', 'branch', 'poll_interval', 'notify_channel'])
    );

    // User provides repo
    const step1 = mergeEntity(initial, 'repo', 'rahul/my-project');
    expect(step1.entities.repo).toBe('rahul/my-project');
    expect(step1.missing_entities).not.toContain('repo');
    expect(step1.clarification_needed).toBe(true);
    expect(step1.clarification_prompt).toContain('branch');

    // User provides branch
    const step2 = mergeEntity(step1, 'branch', 'develop');
    expect(step2.entities.branch).toBe('develop');
    expect(step2.missing_entities).not.toContain('branch');
    expect(step2.clarification_needed).toBe(true);
    expect(step2.clarification_prompt).toContain('How often');

    // User provides poll interval
    const step3 = mergeEntity(step2, 'poll_interval', 'every 5 minutes');
    expect(step3.entities.poll_interval).toBe(300);
    expect(step3.missing_entities).not.toContain('poll_interval');
    expect(step3.clarification_needed).toBe(true);
    expect(step3.clarification_prompt).toContain('notify');

    // User provides notification channel
    const step4 = mergeEntity(step3, 'notify_channel', 'in-app');
    expect(step4.entities.notify_channel).toBe('in_app');
    // Now all params are collected → should show confirmation
    expect(step4.clarification_needed).toBe(true);
    expect(step4._awaiting_confirmation).toBe(true);
    expect(step4.clarification_prompt).toContain('Does that sound right');
    expect(step4.clarification_prompt).toContain('rahul/my-project');

    // User confirms
    const step5 = mergeEntity(step4, 'confirmation', 'yes');
    expect(step5._confirmed).toBe(true);
    expect(step5.clarification_needed).toBe(false);
  });

  test('handles user saying no to confirmation', () => {
    // Build up to confirmation
    let intent = ruleClassify('watch my repo rahul/test');
    intent = mergeEntity(intent, 'branch', 'main');
    intent = mergeEntity(intent, 'poll_interval', '1 minute');
    intent = mergeEntity(intent, 'notify_channel', 'push');
    // Now at confirmation
    expect(intent._awaiting_confirmation).toBe(true);

    // User says no
    const afterNo = mergeEntity(intent, 'confirmation', 'no, change the branch');
    expect(afterNo._confirmed).toBeFalsy();
    expect(afterNo.clarification_needed).toBe(true);
    expect(afterNo.clarification_prompt).toContain('what would you like to change');
  });
});

describe('Poll Interval Parsing', () => {
  test.each([
    ['every 5 minutes', 300],
    ['5 min', 300],
    ['every minute', 60],
    ['1 minute', 60],
    ['30 seconds', 30],
    ['1 hour', 3600],
    ['5', 300], // just a number = minutes
  ])('parses "%s" → %d seconds', (input, expected) => {
    expect(parsePollInterval(input)).toBe(expected);
  });
});

describe('Notify Channel Parsing', () => {
  test('parses "push" variants', () => {
    expect(parseNotifyChannel('push')).toBe('push');
    expect(parseNotifyChannel('push notification')).toBe('push');
  });

  test('defaults to in_app', () => {
    expect(parseNotifyChannel('in-app')).toBe('in_app');
    expect(parseNotifyChannel('in app')).toBe('in_app');
    expect(parseNotifyChannel('something')).toBe('in_app');
  });
});

describe('Format Interval', () => {
  test('formats seconds to readable string', () => {
    expect(formatInterval(30)).toBe('30 seconds');
    expect(formatInterval(60)).toBe('1 minute');
    expect(formatInterval(300)).toBe('5 minutes');
    expect(formatInterval(3600)).toBe('1 hour');
  });
});
