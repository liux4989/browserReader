import React, { useState, useEffect } from 'react';
import { HighlightData, HighlightSettings } from '../utils/types';

interface PopupProps {}

const Popup: React.FC<PopupProps> = () => {
  const [highlights, setHighlights] = useState<HighlightData[]>([]);
  const [currentPageHighlights, setCurrentPageHighlights] = useState<HighlightData[]>([]);
  const [settings, setSettings] = useState<HighlightSettings | null>(null);
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab | null>(null);
  const [activeView, setActiveView] = useState<'current' | 'all'>('current');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Get current tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      setCurrentTab(tab);

      // Get all highlights
      const response = await chrome.runtime.sendMessage({ type: 'GET_HIGHLIGHTS' });
      if (response.highlights) {
        setHighlights(response.highlights);

        // Filter highlights for current page
        if (tab?.url) {
          const pageHighlights = response.highlights.filter((h: HighlightData) => h.url === tab.url);
          setCurrentPageHighlights(pageHighlights);
        }
      }

      // Get settings
      const settingsResponse = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (settingsResponse.settings) {
        setSettings(settingsResponse.settings);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  const deleteHighlight = async (id: string) => {
    try {
      await chrome.runtime.sendMessage({ type: 'DELETE_HIGHLIGHT', id });
      await loadData();
    } catch (error) {
      console.error('Failed to delete highlight:', error);
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
        a.download = `highlights-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Failed to export data:', error);
    }
  };

  const openOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString();
  };

  const truncateText = (text: string, maxLength: number = 100) => {
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  const filteredHighlights = (activeView === 'current' ? currentPageHighlights : highlights)
    .filter(h => h.text.toLowerCase().includes(searchTerm.toLowerCase()));

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
    <div className="popup-container">
      <div className="popup-header">
        <h1>Super Highlight</h1>
        <div className="header-actions">
          <button onClick={exportData} title="Export highlights">
            📥
          </button>
          <button onClick={openOptions} title="Settings">
            ⚙️
          </button>
        </div>
      </div>

      <div className="search-bar">
        <input
          type="text"
          placeholder="Search highlights..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="view-toggle">
        <button
          className={activeView === 'current' ? 'active' : ''}
          onClick={() => setActiveView('current')}
        >
          This Page ({currentPageHighlights.length})
        </button>
        <button
          className={activeView === 'all' ? 'active' : ''}
          onClick={() => setActiveView('all')}
        >
          All Pages ({highlights.length})
        </button>
      </div>

      <div className="highlights-list">
        {filteredHighlights.length === 0 ? (
          <div className="empty-state">
            <p>
              {activeView === 'current'
                ? 'No highlights on this page yet. Select text and highlight it to get started!'
                : 'No highlights found. Start highlighting text to see them here.'}
            </p>
          </div>
        ) : (
          filteredHighlights.map((highlight) => (
            <div key={highlight.id} className="highlight-item">
              <div className="highlight-content">
                <div
                  className="highlight-text"
                  style={getColorStyle(highlight.color)}
                >
                  "{truncateText(highlight.text)}"
                </div>
                <div className="highlight-meta">
                  <span className="highlight-date">{formatDate(highlight.timestamp)}</span>
                  {activeView === 'all' && (
                    <span className="highlight-url" title={highlight.url}>
                      {new URL(highlight.url).hostname}
                    </span>
                  )}
                </div>
                {highlight.note && (
                  <div className="highlight-note">
                    📝 {highlight.note}
                  </div>
                )}
              </div>
              <div className="highlight-actions">
                <button
                  onClick={() => navigator.clipboard.writeText(highlight.text)}
                  title="Copy text"
                  className="action-btn"
                >
                  📋
                </button>
                <button
                  onClick={() => deleteHighlight(highlight.id)}
                  title="Delete highlight"
                  className="action-btn delete-btn"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {currentTab && (
        <div className="quick-actions">
          <div className="color-palette">
            {['yellow', 'green', 'blue', 'pink', 'orange', 'purple'].map(color => (
              <button
                key={color}
                className="color-btn"
                style={getColorStyle(color)}
                onClick={async () => {
                  try {
                    await chrome.tabs.sendMessage(currentTab.id!, {
                      type: 'CREATE_HIGHLIGHT',
                      color
                    });
                    setTimeout(loadData, 500);
                  } catch (error) {
                    console.error('Failed to create highlight:', error);
                  }
                }}
                title={`Highlight with ${color}`}
              />
            ))}
          </div>
          <div className="quick-tip">
            💡 Select text on the page and click a color or use Ctrl+H for yellow
          </div>
        </div>
      )}
    </div>
  );
};

export default Popup;