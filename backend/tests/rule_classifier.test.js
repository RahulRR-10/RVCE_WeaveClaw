const { ruleClassify } = require('../src/services/nlp/rule_classifier');

describe('Rule Classifier — App Control (Phase 1)', () => {
  const phrases = [
    { input: 'open YouTube',              expectedApp: 'youtube' },
    { input: 'launch Chrome',             expectedApp: 'chrome' },
    { input: 'open the camera app',       expectedApp: 'camera' },
    { input: 'start Spotify',             expectedApp: 'spotify' },
    { input: 'go to Instagram',           expectedApp: 'instagram' },
  ];

  test.each(phrases)(
    'classifies "$input" as device_command with open_app action',
    ({ input, expectedApp }) => {
      const result = ruleClassify(input);

      expect(result.intent).toBe('device_command');
      expect(result.actions).toBeDefined();
      expect(result.actions.length).toBeGreaterThan(0);

      const action = result.actions[0];
      expect(action.type).toBe('emulator_control');
      expect(action.command).toBe('open_app');
      expect(action.params.app.toLowerCase()).toContain(expectedApp);
    }
  );

  test('does not classify general phrases as device_command', () => {
    const result = ruleClassify('turn on the kitchen lights');
    expect(result.intent).not.toBe('device_command');
  });

  test('classifies URL navigation as device_command with open_url', () => {
    const result = ruleClassify('open https://example.com');
    expect(result.intent).toBe('device_command');
    expect(result.actions[0].command).toBe('open_url');
    expect(result.actions[0].params.url).toBe('https://example.com');
  });

  test('classifies YouTube search as device_command', () => {
    const result = ruleClassify('search youtube for cats');
    expect(result.intent).toBe('device_command');
    expect(result.actions[0].command).toBe('search_youtube');
    expect(result.actions[0].params.query).toBe('cats');
  });

  test('classifies go home as device_command', () => {
    const result = ruleClassify('go home');
    expect(result.intent).toBe('device_command');
    expect(result.actions[0].command).toBe('go_home');
  });

  test('classifies go back as device_command', () => {
    const result = ruleClassify('go back');
    expect(result.intent).toBe('device_command');
    expect(result.actions[0].command).toBe('go_back');
  });

  test('classifies unknown app name as device_command (resolved later)', () => {
    const result = ruleClassify('open SomeRandomApp');
    expect(result.intent).toBe('device_command');
    expect(result.actions[0].command).toBe('open_app');
    expect(result.actions[0].params.app).toBe('somerandomapp');
  });

  test('returns unparseable for empty/garbled input', () => {
    const result = ruleClassify('');
    expect(result.intent).toBe('unparseable');
  });
});

describe('Rule Classifier — Watcher Intent (Phase 2)', () => {
  test('classifies "notify me when" as watcher', () => {
    const result = ruleClassify('notify me when there is a new commit on myrepo');
    expect(result.intent).toBe('watcher');
    expect(result.clarification_needed).toBe(true);
  });

  test('classifies "watch my" as watcher', () => {
    const result = ruleClassify('watch my github repo rahul/project');
    expect(result.intent).toBe('watcher');
    expect(result.entities.repo).toBe('rahul/project');
  });

  test('classifies "alert me if" as watcher', () => {
    const result = ruleClassify('alert me if something changes');
    expect(result.intent).toBe('watcher');
  });

  test('classifies "keep an eye on" as watcher', () => {
    const result = ruleClassify('keep an eye on my repository');
    expect(result.intent).toBe('watcher');
  });
});

describe('Rule Classifier — Rich Device Intents', () => {
  test('classifies "set an alarm at 6am" as set_alarm', () => {
    const result = ruleClassify('set an alarm at 6am');
    expect(result.intent).toBe('device_command');
    expect(result.actions[0].command).toBe('set_alarm');
    expect(result.actions[0].params.hour).toBe(6);
    expect(result.actions[0].params.minute).toBe(0);
  });

  test('classifies "set alarm for 7:30 pm" with correct hour conversion', () => {
    const result = ruleClassify('set alarm for 7:30 pm');
    expect(result.intent).toBe('device_command');
    expect(result.actions[0].command).toBe('set_alarm');
    expect(result.actions[0].params.hour).toBe(19);
    expect(result.actions[0].params.minute).toBe(30);
  });

  test('classifies "wake me up at 5" as set_alarm', () => {
    const result = ruleClassify('wake me up at 5am');
    expect(result.intent).toBe('device_command');
    expect(result.actions[0].command).toBe('set_alarm');
    expect(result.actions[0].params.hour).toBe(5);
  });

  test('classifies "set a timer for 5 minutes" as set_timer', () => {
    const result = ruleClassify('set a timer for 5 minutes');
    expect(result.intent).toBe('device_command');
    expect(result.actions[0].command).toBe('set_timer');
    expect(result.actions[0].params.seconds).toBe(300);
  });

  test('classifies "play some relaxing music" as play_music', () => {
    const result = ruleClassify('play some relaxing music');
    expect(result.intent).toBe('device_command');
    expect(result.actions[0].command).toBe('play_music');
    expect(result.actions[0].params.query).toBe('relaxing music');
  });

  test('classifies "take a photo" as take_photo', () => {
    const result = ruleClassify('take a photo');
    expect(result.intent).toBe('device_command');
    expect(result.actions[0].command).toBe('take_photo');
  });

  test('classifies "volume up" as volume_up', () => {
    const result = ruleClassify('turn the volume up');
    expect(result.intent).toBe('device_command');
    expect(result.actions[0].command).toBe('volume_up');
  });

  test('classifies "open settings" as open_settings', () => {
    const result = ruleClassify('open settings');
    expect(result.intent).toBe('device_command');
    expect(result.actions[0].command).toBe('open_settings');
  });

  test('classifies "open wifi settings" with panel', () => {
    const result = ruleClassify('open wifi settings');
    expect(result.intent).toBe('device_command');
    expect(result.actions[0].command).toBe('open_settings');
    expect(result.actions[0].params.panel).toBe('wifi');
  });
});

describe('Rule Classifier — Compound Commands', () => {
  test('splits "set an alarm at 6am and play relaxing music" into 2 actions', () => {
    const result = ruleClassify('set an alarm at 6am and play relaxing music');
    expect(result.intent).toBe('device_command');
    expect(result.actions.length).toBe(2);
    expect(result.actions[0].command).toBe('set_alarm');
    expect(result.actions[0].params.hour).toBe(6);
    expect(result.actions[1].command).toBe('play_music');
    expect(result.actions[1].params.query).toContain('relaxing');
  });

  test('splits "open YouTube then search for cats" into 2 actions', () => {
    const result = ruleClassify('open YouTube then search for cats');
    expect(result.intent).toBe('device_command');
    expect(result.actions.length).toBe(2);
    expect(result.actions[0].command).toBe('open_app');
    expect(result.actions[1].command).toBe('search_google');
  });

  test('splits "turn volume up and set brightness to 80" into 2 actions', () => {
    const result = ruleClassify('turn volume up and set brightness to 80');
    expect(result.intent).toBe('device_command');
    expect(result.actions.length).toBe(2);
    expect(result.actions[0].command).toBe('volume_up');
    expect(result.actions[1].command).toBe('set_brightness');
    expect(result.actions[1].params.level).toBe(80);
  });

  test('splits numbered list "1, timer 2, play music 3, dnd" into 3 actions', () => {
    const result = ruleClassify('1, set a timer for 30 minutes\n2, play relaxing music\n3, and put the phone on dnd');
    expect(result.intent).toBe('device_command');
    expect(result.actions.length).toBe(3);
    expect(result.actions[0].command).toBe('set_timer');
    expect(result.actions[0].params.seconds).toBe(1800);
    expect(result.actions[1].command).toBe('play_music');
    expect(result.actions[2].command).toBe('toggle_dnd');
  });

  test('classifies "put the phone on dnd" as toggle_dnd (not make_call)', () => {
    const result = ruleClassify('put the phone on dnd');
    expect(result.intent).toBe('device_command');
    expect(result.actions[0].command).toBe('toggle_dnd');
  });
});
