import { StorageManager } from '../utils/storage';
import { type HighlightColor, type HighlightData, type HighlightSettings } from '../utils/types';

class BackgroundService {
  constructor() {
    this.init();
  }

  private init(): void {
    this.setupContextMenus();
    this.setupMessageHandlers();
    this.setupStorageHandlers();
  }

  private setupContextMenus(): void {
    chrome.runtime.onInstalled.addListener(() => {
      console.log('Setting up context menu...');

      chrome.contextMenus.create({
        id: 'highlight-text',
        title: 'Highlight Selected Text',
        contexts: ['selection']
      }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error creating context menu:', chrome.runtime.lastError);
        } else {
          console.log('Context menu created successfully');
        }
      });

      chrome.contextMenus.create({
        id: 'manage-highlights',
        title: 'Manage Highlights',
        contexts: ['selection']
      }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error creating manage highlights menu:', chrome.runtime.lastError);
        } else {
          console.log('All context menus created successfully');
        }
      });
    });

    chrome.contextMenus.onClicked.addListener((info, tab) => {
      this.handleContextMenuClick(info, tab);
    });
  }

  private async handleContextMenuClick(
    info: chrome.contextMenus.OnClickData,
    tab?: chrome.tabs.Tab
  ): Promise<void> {
    if (!tab?.id) return;

    if (info.menuItemId === 'highlight-text') {
      try {
        console.log('Sending highlight message to tab:', tab.id);
        const response = await chrome.tabs.sendMessage(tab.id, {
          type: 'CREATE_HIGHLIGHT',
          color: 'yellow' // Default color
        });
        console.log('Response from content script:', response);
      } catch (error) {
        console.error('Failed to create highlight:', error);
      }
    } else if (info.menuItemId === 'manage-highlights') {
      chrome.action.openPopup();
    }
  }

  private setupMessageHandlers(): void {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
    });
  }

  private handleMessage(
    message: { type: string; [key: string]: unknown },
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: { success?: boolean; error?: string; highlights?: HighlightData[]; settings?: HighlightSettings; data?: string }) => void
  ): boolean | void {
    if (message.type === 'GET_HIGHLIGHTS') {
      StorageManager.getHighlights()
        .then(highlights => sendResponse({ highlights }))
        .catch(error => sendResponse({ error: error.message }));
      return true;
    }

    if (message.type === 'GET_HIGHLIGHTS_BY_URL') {
      StorageManager.getHighlightsByUrl(message.url as string)
        .then(highlights => sendResponse({ highlights }))
        .catch(error => sendResponse({ error: error.message }));
      return true;
    }

    if (message.type === 'DELETE_HIGHLIGHT') {
      StorageManager.deleteHighlight(message.id as string)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ error: error.message }));
      return true;
    }

    if (message.type === 'GET_SETTINGS') {
      StorageManager.getSettings()
        .then(settings => sendResponse({ settings }))
        .catch(error => sendResponse({ error: error.message }));
      return true;
    }

    if (message.type === 'SAVE_SETTINGS') {
      StorageManager.saveSettings(message.settings as HighlightSettings)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ error: error.message }));
      return true;
    }

    if (message.type === 'EXPORT_DATA') {
      this.exportData()
        .then(data => sendResponse({ data }))
        .catch(error => sendResponse({ error: error.message }));
      return true;
    }

    if (message.type === 'IMPORT_DATA') {
      this.importData(message.data as string)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ error: error.message }));
      return true;
    }

    if (message.type === 'SAVE_HIGHLIGHT') {
      StorageManager.saveHighlight(message.highlight as HighlightData)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ error: error.message }));
      return true;
    }

    if (message.type === 'REMOVE_HIGHLIGHT') {
      StorageManager.deleteHighlight(message.highlightId as string)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ error: error.message }));
      return true;
    }

    if (message.type === 'UPDATE_HIGHLIGHT') {
      StorageManager.saveHighlight(message.highlight as HighlightData)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ error: error.message }));
      return true;
    }
  }

  private setupStorageHandlers(): void {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local') {
        this.broadcastStorageChange(changes);
      }
    });
  }

  private broadcastStorageChange(changes: { [key: string]: chrome.storage.StorageChange }): void {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'STORAGE_CHANGED',
            changes
          }).catch(() => {
            // Ignore errors for tabs that can't receive messages
          });
        }
      });
    });
  }

  private async exportData(): Promise<string> {
    const highlights = await StorageManager.getHighlights();
    const settings = await StorageManager.getSettings();

    const exportData = {
      highlights,
      settings,
      exportDate: new Date().toISOString(),
      version: '1.0'
    };

    return JSON.stringify(exportData, null, 2);
  }

  private async importData(jsonData: string): Promise<void> {
    try {
      const data = JSON.parse(jsonData);

      if (!data.highlights || !Array.isArray(data.highlights)) {
        throw new Error('Invalid data format: missing highlights array');
      }

      if (!data.settings || typeof data.settings !== 'object') {
        throw new Error('Invalid data format: missing settings object');
      }

      // Clear existing data
      await chrome.storage.local.clear();

      // Import new data
      await chrome.storage.local.set({
        highlights: data.highlights,
        settings: data.settings
      });

    } catch (error) {
      throw new Error(`Failed to import data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async getActiveTab(): Promise<chrome.tabs.Tab | null> {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0] || null;
  }
}

new BackgroundService();