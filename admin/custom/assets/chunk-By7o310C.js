import './chunk-7JBODIaV.js';
import { t as ComponentBase } from './chunk-DtAs99Z6.js';
import './chunk-BV8XpdMm.js';
import { $n as jsx, Tr as initReact, er as jsxs } from './chunk-DjJxfWw4.js';

initReact();

const CATEGORIES = ['consumption', 'generation_pv', 'lighting', 'device_usage', 'environment'];
const VALUE_KINDS = ['gauge', 'boolean_state', 'daily_reset_counter', 'cumulative_total', 'event_count'];
const SYNC_STATE_ID = 'catalogSync';

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function parseSyncState(state) {
  if (!state || state.val == null) return null;
  const raw = state.val;
  const text = typeof raw === 'string' ? raw : String(raw);
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_error) {
    return null;
  }
}

class CatalogDevicesComponent extends ComponentBase {
  constructor(props) {
    super(props);
    this.state = {
      ...this.state,
      entries: [],
      filter: '',
      loading: true,
      status: '',
      sync: { running: false, phase: 'idle', processed: 0, total: 0, message: '' },
    };
    this.pollTimer = null;
    this.refreshInFlight = false;
    this.isMountedFlag = false;
  }

  getAdapterName() {
    return `ai-analytics.${this.props.oContext.instance}`;
  }

  getSyncStateId() {
    return `${this.getAdapterName()}.${SYNC_STATE_ID}`;
  }

  async callAdapter(command, message = {}) {
    return this.props.oContext.socket.sendTo(this.getAdapterName(), command, message);
  }

  async readState(stateId) {
    const socket = this.props.oContext.socket;
    if (socket.getStateAsync) {
      return socket.getStateAsync(stateId);
    }
    if (socket.getState) {
      return new Promise((resolve, reject) => {
        socket.getState(stateId, (error, state) => {
          if (error) reject(error);
          else resolve(state);
        });
      });
    }
    return null;
  }

  async loadEntries({ quiet = false } = {}) {
    if (quiet && this.refreshInFlight) {
      return;
    }

    if (!quiet) {
      this.setState({ loading: true });
    }

    this.refreshInFlight = true;
    try {
      const response = await this.callAdapter('listCatalogEntries');
      if (!this.isMountedFlag) return;
      this.setState({
        entries: (response && response.entries) || [],
        loading: false,
        status: quiet ? this.state.status : '',
      });
    } catch (error) {
      if (!this.isMountedFlag) return;
      this.setState({
        entries: quiet ? this.state.entries : [],
        loading: false,
        status: `Fehler: ${error.message || error}`,
      });
    } finally {
      this.refreshInFlight = false;
    }
  }

  async refreshSyncState() {
    try {
      const state = await this.readState(this.getSyncStateId());
      const sync = parseSyncState(state) || { running: false, phase: 'idle', processed: 0, total: 0, message: '' };
      if (!this.isMountedFlag) return;
      this.setState({ sync });

      if (sync.running) {
        await this.loadEntries({ quiet: true });
      }
    } catch (_error) {
      // Ignore polling errors; the table still works without live sync state.
    }
  }

  startPolling() {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      this.refreshSyncState();
    }, 1000);
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async componentDidMount() {
    if (typeof super.componentDidMount === 'function') {
      super.componentDidMount();
    }
    this.isMountedFlag = true;
    await Promise.all([this.loadEntries(), this.refreshSyncState()]);
    this.startPolling();
  }

  componentWillUnmount() {
    this.isMountedFlag = false;
    this.stopPolling();
    if (typeof super.componentWillUnmount === 'function') {
      super.componentWillUnmount();
    }
  }

  async updateEntry(entry, patch) {
    try {
      await this.callAdapter('updateCatalogEntryAdmin', { sourceId: entry.sourceId, ...patch });
      await this.loadEntries({ quiet: true });
    } catch (error) {
      this.setState({ status: `Fehler: ${error.message || error}` });
    }
  }

  async removeEntry(entry) {
    try {
      await this.callAdapter('removeCatalogEntry', { sourceId: entry.sourceId });
      await this.loadEntries({ quiet: true });
    } catch (error) {
      this.setState({ status: `Fehler: ${error.message || error}` });
    }
  }

  async runCommand(command, pendingText, successText) {
    this.setState({ status: pendingText });
    try {
      await this.callAdapter(command);
      await this.refreshSyncState();
      await this.loadEntries({ quiet: true });
      this.setState({ status: successText });
    } catch (error) {
      this.setState({ status: `Fehler: ${error.message || error}` });
    }
  }

  renderProgress(sync) {
    const running = !!(sync && sync.running);
    const processed = Number(sync && sync.processed) || 0;
    const total = Number(sync && sync.total) || 0;
    const percent = total > 0 ? clampPercent((processed / total) * 100) : 0;
    const barWidth = running ? (total > 0 ? `${percent}%` : '35%') : '100%';
    const title = running ? 'Sync laeuft' : sync && sync.phase === 'done' ? 'Sync abgeschlossen' : 'Sync inaktiv';

    return jsxs('div', {
      style: {
        border: '1px solid #d0d7de',
        borderRadius: 6,
        padding: 12,
        margin: '12px 0',
        background: running ? '#f6ffed' : '#fafbfc',
      },
      children: [
        jsxs('div', {
          style: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' },
          children: [
            jsx('strong', { children: title }),
            jsx('span', { style: { fontSize: 12, opacity: 0.8 }, children: sync && sync.message ? sync.message : '' }),
          ],
        }),
        jsx('div', {
          style: {
            marginTop: 10,
            height: 8,
            borderRadius: 999,
            background: '#e5e7eb',
            overflow: 'hidden',
          },
          children: jsx('div', {
            style: {
              width: barWidth,
              height: '100%',
              borderRadius: 999,
              background: running ? 'linear-gradient(90deg, #2e7d32, #66bb6a)' : '#9ca3af',
              transition: 'width 180ms linear',
            },
          }),
        }),
        jsxs('div', {
          style: { display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 8, fontSize: 12, opacity: 0.85 },
          children: [
            jsx('span', { children: total > 0 ? `${processed} / ${total}` : running ? 'warte auf Treffer...' : 'kein aktiver Lauf' }),
            jsx('span', { children: sync && sync.currentSourceId ? sync.currentSourceId : '' }),
          ],
        }),
      ],
    });
  }

  renderRow(entry) {
    const save = (patch) => this.updateEntry(entry, patch);
    return jsxs('tr', {
      children: [
        jsx('td', { children: entry.sourceId }),
        jsx('td', {
          children: jsx('input', {
            defaultValue: entry.description || '',
            onBlur: (event) => save({ description: event.target.value }),
          }),
        }),
        jsx('td', {
          children: jsxs('select', {
            defaultValue: entry.category || '',
            onChange: (event) => save({ category: event.target.value }),
            children: [
              jsx('option', { value: '', children: 'unbekannt' }, 'empty-category'),
              ...CATEGORIES.map((category) => jsx('option', { value: category, children: category }, category)),
            ],
          }),
        }),
        jsx('td', {
          children: jsxs('select', {
            defaultValue: entry.valueKind || '',
            onChange: (event) => event.target.value && save({ valueKind: event.target.value }),
            children: [
              jsx('option', { value: '', children: 'nicht gesetzt' }, 'empty-kind'),
              ...VALUE_KINDS.map((kind) => jsx('option', { value: kind, children: kind }, kind)),
            ],
          }),
        }),
        jsx('td', {
          children: jsx('input', {
            defaultValue: entry.room || '',
            onBlur: (event) => save({ room: event.target.value }),
          }),
        }),
        jsx('td', {
          children: jsx('input', {
            type: 'checkbox',
            defaultChecked: !!entry.ignored,
            onChange: (event) => save({ ignored: event.target.checked }),
          }),
        }),
        jsx('td', {
          children: jsx('button', {
            type: 'button',
            onClick: () => this.removeEntry(entry),
            children: 'Entfernen',
          }),
        }),
      ],
    });
  }

  render() {
    const filteredEntries = (this.state.entries || []).filter((entry) => {
      const query = (this.state.filter || '').trim().toLowerCase();
      if (!query) return true;
      return [entry.sourceId, entry.description, entry.category, entry.valueKind, entry.room]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });

    return jsxs('div', {
      style: { padding: 16 },
      children: [
        jsxs('div', {
          style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 },
          children: [
            jsx('input', {
              type: 'search',
              placeholder: 'Datenpunkte filtern...',
              value: this.state.filter,
              onChange: (event) => this.setState({ filter: event.target.value }),
              style: { minWidth: 240 },
            }),
            jsx('button', {
              type: 'button',
              onClick: () => this.loadEntries(),
              children: 'Aktualisieren',
            }),
            jsx('button', {
              type: 'button',
              onClick: () => this.runCommand('runDiscoveryNow', 'Geräte werden neu eingelesen...', 'Gerätesync beendet.'),
              children: 'Geräte neu einlesen',
            }),
          ],
        }),
        this.renderProgress(this.state.sync),
        this.state.status
          ? jsx('div', { style: { marginBottom: 12, color: this.state.status.startsWith('Fehler:') ? '#b42318' : '#555' }, children: this.state.status })
          : null,
        this.state.loading
          ? jsx('div', { style: { padding: 12 }, children: 'Lade Geräte...' })
          : null,
        jsx('div', {
          style: { marginBottom: 8, fontSize: 12, opacity: 0.8 },
          children: `Angezeigt: ${filteredEntries.length} von ${this.state.entries.length || 0}`,
        }),
        jsx('div', {
          style: { overflowX: 'auto' },
          children: jsxs('table', {
            style: { width: '100%', borderCollapse: 'collapse' },
            children: [
              jsx('thead', {
                children: jsx('tr', {
                  children: [
                    'Source ID',
                    'Beschreibung',
                    'Kategorie',
                    'valueKind',
                    'Raum',
                    'Ignored',
                    'Aktion',
                  ].map((label) => jsx('th', { style: { textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid #ddd' }, children: label }, label)),
                }),
              }),
              jsx('tbody', {
                children: filteredEntries.map((entry) => this.renderRow(entry)),
              }),
            ],
          }),
        }),
      ],
    });
  }
}

export { CatalogDevicesComponent };
