import React, { useState, useEffect } from 'react';
import { type HighlightSettings, type HighlightData, type HighlightColor } from './utils/types';
import "./options.css";

const Options: React.FC = () => {
  const [settings, setSettings] = useState<HighlightSettings>({
    defaultColor: 'yellow',
    highlightOpacity: 0.3,
    showNotes: true,
    syncEnabled: false
  });

  const [highlights, setHighlights] = useState<HighlightData[]>([]);
  const [stats, setStats] = useState({
    totalHighlights: 0,
    uniquePages: 0,
    colorBreakdown: {} as Record<HighlightColor, number>
  });

  const [importFile, setImportFile] = useState<File | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Load settings
      const settingsResponse = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (settingsResponse.settings) {
        setSettings(settingsResponse.settings);
      }

      // Load highlights for stats
      const highlightsResponse = await chrome.runtime.sendMessage({ type: 'GET_HIGHLIGHTS' });
      if (highlightsResponse.highlights) {
        setHighlights(highlightsResponse.highlights);
        calculateStats(highlightsResponse.highlights);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  const calculateStats = (highlightData: HighlightData[]) => {
    const uniquePages = new Set(highlightData.map(h => h.url)).size;
    const colorBreakdown = highlightData.reduce((acc, h) => {
      acc[h.color as HighlightColor] = (acc[h.color as HighlightColor] || 0) + 1;
      return acc;
    }, {} as Record<HighlightColor, number>);

    setStats({
      totalHighlights: highlightData.length,
      uniquePages,
      colorBreakdown
    });
  };

  const saveSettings = async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings });
      showMessage('Settings saved successfully!', 'success');
    } catch (error) {
      showMessage('Failed to save settings', 'error');
    }
  };

  const exportData = async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'EXPORT_DATA' });
      if (response.data) {
        const blob = new Blob([response.data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `super-highlight-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showMessage('Data exported successfully!', 'success');
      }
    } catch (error) {
      showMessage('Failed to export data', 'error');
    }
  };

  const importData = async () => {
    if (!importFile) return;

    try {
      const text = await importFile.text();
      await chrome.runtime.sendMessage({ type: 'IMPORT_DATA', data: text });
      await loadData();
      showMessage('Data imported successfully!', 'success');
      setImportFile(null);
    } catch (error) {
      showMessage('Failed to import data. Please check the file format.', 'error');
    }
  };

  const clearAllData = async () => {
    if (!confirm('Are you sure you want to delete all highlights? This action cannot be undone.')) {
      return;
    }

    try {
      await chrome.storage.local.clear();
      await loadData();
      showMessage('All data cleared successfully!', 'success');
    } catch (error) {
      showMessage('Failed to clear data', 'error');
    }
  };

  const showMessage = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const getColorName = (color: string) => {
    return color.charAt(0).toUpperCase() + color.slice(1);
  };

  const getColorStyle = (color: string) => ({
    backgroundColor: {
      yellow: '#ffff0080',
      green: '#00ff0080',
      blue: '#0099ff80',
      pink: '#ff69b480',
      orange: '#ff8c0080',
      purple: '#9966cc80'
    }[color] || '#ffff0080'
  });

  return (
    <div className="options-container">
      <div className="options-header">
        <h1>Super Highlight Settings</h1>
        <p>Customize your highlighting experience</p>
      </div>

      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="options-content">
        <section className="settings-section">
          <h2>General Settings</h2>

          <div className="setting-group">
            <label>Default Highlight Color:</label>
            <div className="color-selector">
              {(['yellow', 'green', 'blue', 'pink', 'orange', 'purple'] as HighlightColor[]).map(color => (
                <button
                  key={color}
                  className={`color-option ${settings.defaultColor === color ? 'active' : ''}`}
                  style={getColorStyle(color)}
                  onClick={() => setSettings({ ...settings, defaultColor: color })}
                  title={getColorName(color)}
                />
              ))}
            </div>
          </div>

          <div className="setting-group">
            <label>Highlight Opacity:</label>
            <div className="opacity-slider">
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.1"
                value={settings.highlightOpacity}
                onChange={(e) => setSettings({ ...settings, highlightOpacity: parseFloat(e.target.value) })}
              />
              <span>{Math.round(settings.highlightOpacity * 100)}%</span>
            </div>
          </div>

          <div className="setting-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.showNotes}
                onChange={(e) => setSettings({ ...settings, showNotes: e.target.checked })}
              />
              Show notes in highlights
            </label>
          </div>

          <div className="setting-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.syncEnabled}
                onChange={(e) => setSettings({ ...settings, syncEnabled: e.target.checked })}
              />
              Enable sync across devices (experimental)
            </label>
          </div>

          <button className="save-btn" onClick={saveSettings}>
            Save Settings
          </button>
        </section>

        <section className="stats-section">
          <h2>Statistics</h2>
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-value">{stats.totalHighlights}</div>
              <div className="stat-label">Total Highlights</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{stats.uniquePages}</div>
              <div className="stat-label">Pages Highlighted</div>
            </div>
          </div>

          {Object.keys(stats.colorBreakdown).length > 0 && (
            <div className="color-stats">
              <h3>Color Usage</h3>
              <div className="color-breakdown">
                {Object.entries(stats.colorBreakdown).map(([color, count]) => (
                  <div key={color} className="color-stat">
                    <div
                      className="color-indicator"
                      style={getColorStyle(color)}
                    />
                    <span>{getColorName(color)}: {count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="data-section">
          <h2>Data Management</h2>

          <div className="data-actions">
            <div className="action-group">
              <h3>Export Data</h3>
              <p>Download all your highlights as a JSON file for backup or sharing.</p>
              <button className="export-btn" onClick={exportData}>
                📥 Export Highlights
              </button>
            </div>

            <div className="action-group">
              <h3>Import Data</h3>
              <p>Upload a previously exported JSON file to restore your highlights.</p>
              <div className="import-controls">
                <input
                  type="file"
                  accept=".json"
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                />
                <button
                  className="import-btn"
                  onClick={importData}
                  disabled={!importFile}
                >
                  📤 Import Highlights
                </button>
              </div>
            </div>

            <div className="action-group danger">
              <h3>Clear All Data</h3>
              <p>⚠️ This will permanently delete all your highlights and settings.</p>
              <button className="clear-btn" onClick={clearAllData}>
                🗑️ Clear All Data
              </button>
            </div>
          </div>
        </section>

        <section className="help-section">
          <h2>Keyboard Shortcuts</h2>
          <div className="shortcuts">
            <div className="shortcut">
              <kbd>Ctrl</kbd> + <kbd>H</kbd>
              <span>Highlight selected text with default color</span>
            </div>
          </div>

          <h2>Tips</h2>
          <ul className="tips">
            <li>Select text and right-click to see highlight options</li>
            <li>Click on existing highlights to delete or copy them</li>
            <li>Use the popup to view and manage all your highlights</li>
            <li>Export your data regularly to keep a backup</li>
          </ul>
        </section>
      </div>
    </div>
  );
};

export default Options;