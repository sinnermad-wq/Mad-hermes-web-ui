import { useState } from 'react';
import { TabStrip } from '../../components/UI/Tabs';
import { SectionCard } from '../../components/UI/Card';
import { StatusBadge, type BadgeTone } from '../../components/UI/Badge';
import { useTheme } from '../../hooks/useTheme';
import './Settings.css';

type Section = 'profile' | 'appearance' | 'channels' | 'advanced';
const sections: { id: Section; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'channels', label: 'Channels' },
  { id: 'advanced', label: 'Advanced' },
];

const channelsMock = [
  { id: 'telegram', name: 'Telegram', detail: 'Connected · home channel 980366696', tone: 'ok' as BadgeTone, on: true },
  { id: 'discord', name: 'Discord', detail: 'Not connected', tone: 'pending' as BadgeTone, on: false },
  { id: 'slack', name: 'Slack', detail: 'Not connected', tone: 'pending' as BadgeTone, on: false },
  { id: 'whatsapp', name: 'WhatsApp', detail: 'Connected · paired', tone: 'ok' as BadgeTone, on: true },
  { id: 'feishu', name: 'Feishu', detail: 'Not configured', tone: 'pending' as BadgeTone, on: false },
  { id: 'webhook', name: 'Webhooks', detail: '3 routes active', tone: 'info' as BadgeTone, on: true },
];

export function SettingsPage() {
  const [section, setSection] = useState<Section>('profile');
  return (
    <div className="settings">
      <TabStrip title="Settings" sub={`section:${section} · local-only mock`} />
      <div className="settings-grid">
        <nav className="settings-nav" aria-label="Settings navigation">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              className={section === s.id ? 'active' : ''}
              onClick={() => setSection(s.id)}
              aria-current={section === s.id ? 'page' : undefined}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="settings-section" role="region" aria-label={`${section} settings`}>
          {section === 'profile' && <ProfileSection />}
          {section === 'appearance' && <AppearanceSection />}
          {section === 'channels' && <ChannelsSection />}
          {section === 'advanced' && <AdvancedSection />}
        </div>
      </div>
    </div>
  );
}

function ProfileSection() {
  return (
    <SectionCard title="Profile">
      <div className="field-row">
        <div className="field">
          <label>Display name</label>
          <input type="text" defaultValue="Hermes" />
        </div>
        <div className="field">
          <label>Default profile</label>
          <select defaultValue="main">
            <option value="main">main</option>
            <option value="work">work</option>
            <option value="dev">dev</option>
          </select>
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>Timezone</label>
          <select defaultValue="Asia/Hong_Kong">
            <option>Asia/Hong_Kong</option>
            <option>UTC</option>
            <option>America/New_York</option>
            <option>Europe/London</option>
          </select>
        </div>
        <div className="field">
          <label>Language</label>
          <select defaultValue="zh-HK">
            <option value="en">English</option>
            <option value="zh-HK">繁體中文（香港）</option>
            <option value="zh-CN">简体中文</option>
          </select>
        </div>
      </div>
      <p className="text-tertiary" style={{ fontSize: 'var(--text-xs)', margin: 0 }}>
        Profile changes are local-only in v1. v2 will sync via FastAPI.
      </p>
    </SectionCard>
  );
}

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  return (
    <>
      <SectionCard title="Theme">
        <div className="field-row">
          <div className="field">
            <label>Theme</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['light', 'dark'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className="icon-text-btn"
                  aria-pressed={theme === t}
                  style={{
                    background: theme === t ? 'var(--accent-bg)' : undefined,
                    color: theme === t ? 'var(--accent-text)' : undefined,
                  }}
                  onClick={() => setTheme(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Density</label>
            <select defaultValue="comfortable">
              <option value="compact">Compact</option>
              <option value="comfortable">Comfortable</option>
            </select>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Layout">
        <div className="field-row">
          <div className="field">
            <label>Default landing page</label>
            <select defaultValue="/">
              <option value="/">Chat</option>
              <option value="/dashboard">Dashboard</option>
              <option value="/sessions">Sessions</option>
            </select>
          </div>
          <div className="field">
            <label>Sidebar (desktop)</label>
            <select defaultValue="expanded">
              <option>expanded</option>
              <option>collapsed</option>
            </select>
          </div>
        </div>
      </SectionCard>
    </>
  );
}

function ChannelsSection() {
  const [state, setState] = useState(channelsMock);
  return (
    <SectionCard title="Channels">
      <div role="list">
        {state.map((c, i) => (
          <div key={c.id} role="listitem" className="channel-row">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <strong>{c.name}</strong>
                <StatusBadge tone={c.tone} label={c.tone} />
              </div>
              <span className="text-tertiary" style={{ fontSize: 'var(--text-xs)' }}>
                {c.detail}
              </span>
            </div>
            <button
              type="button"
              className={'switch' + (c.on ? ' on' : '')}
              aria-pressed={c.on}
              aria-label={`Toggle ${c.name}`}
              onClick={() => {
                const next = [...state];
                next[i] = { ...c, on: !c.on };
                setState(next);
              }}
            />
          </div>
        ))}
      </div>
      <p className="text-tertiary" style={{ fontSize: 'var(--text-xs)', margin: 'var(--space-3) 0 0' }}>
        Toggles are visual-only in v1.
      </p>
    </SectionCard>
  );
}

function AdvancedSection() {
  return (
    <>
      <SectionCard title="Endpoints">
        <div className="code-block">
{`# Reserved for v2
# GET  /api/health
# POST /api/sessions/:id/messages
# GET  /api/sessions/:id/trace
# SSE  /api/events?session=:id
# POST /api/mini-app/auth  (Telegram Mini App → JWT)`}
        </div>
      </SectionCard>
      <SectionCard title="Local data">
        <div className="code-block">
{`$HERMES_HOME: %LOCALAPPDATA%\\hermes
config.yaml: ${'${HERMES_HOME}'}\\config.yaml
state.db:    ${'${HERMES_HOME}'}\\state.db
logs:        ${'${HERMES_HOME}'}\\logs\\*.log`}
        </div>
      </SectionCard>
      <SectionCard title="TL;DR">
        <p className="text-secondary" style={{ margin: 0 }}>
          This shell defaults to local mocks; backend integration is paused until v2.
        </p>
      </SectionCard>
    </>
  );
}
