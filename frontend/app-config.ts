import type { AppConfig } from './lib/types';

export const APP_CONFIG_DEFAULTS: AppConfig = {
  companyName: 'استانداری',
  pageTitle: 'دستیار هوشمند پشتیبانی استانداری',
  pageDescription: 'دستیار صوتی پشتیبانی فنی با آواتار تصویری',

  supportsChatInput: true,
  supportsVideoInput: true,
  supportsScreenShare: true,
  isPreConnectBufferEnabled: true,

  logo: '/lk-logo.svg',
  accent: '#002cf2',
  logoDark: '/lk-logo-dark.svg',
  accentDark: '#1fd5f9',
  startButtonText: 'شروع گفت‌وگو',
};
