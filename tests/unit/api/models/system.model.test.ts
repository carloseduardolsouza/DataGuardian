import { getDefaultSettings } from '../../../../src/api/models/system.model';

describe('system model', () => {
  it('returns required default settings keys', () => {
    const settings = getDefaultSettings();
    expect(settings['notifications.whatsapp_enabled']).toBeDefined();
    expect(settings['notifications.whatsapp_evolution_config']).toBeDefined();
    expect(settings['notifications.whatsapp_chatbot_enabled']).toBeDefined();
    expect(settings['notifications.whatsapp_chatbot_allowed_numbers']).toBeDefined();
    expect(settings['notifications.whatsapp_chatbot_webhook_token']).toBeDefined();
    expect(settings['system.max_concurrent_backups']).toBeDefined();
    expect(settings['system.temp_directory']).toBeDefined();
    expect(settings['system.health_check_interval_ms']).toBeDefined();
    expect(settings['system.scheduler_interval_ms']).toBeDefined();
  });
});
