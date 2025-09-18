import { type HighlightData, type HighlightSettings } from './types';

export class StorageManager {
  private static readonly HIGHLIGHTS_KEY = 'highlights';
  private static readonly SETTINGS_KEY = 'settings';

  static async getHighlights(): Promise<HighlightData[]> {
    const result = await chrome.storage.local.get([this.HIGHLIGHTS_KEY]);
    return result[this.HIGHLIGHTS_KEY] || [];
  }

  static async saveHighlight(highlight: HighlightData): Promise<void> {
    const highlights = await this.getHighlights();
    const existingIndex = highlights.findIndex(h => h.id === highlight.id);

    if (existingIndex >= 0) {
      highlights[existingIndex] = highlight;
    } else {
      highlights.push(highlight);
    }

    await chrome.storage.local.set({ [this.HIGHLIGHTS_KEY]: highlights });
  }

  static async deleteHighlight(id: string): Promise<void> {
    const highlights = await this.getHighlights();
    const filtered = highlights.filter(h => h.id !== id);
    await chrome.storage.local.set({ [this.HIGHLIGHTS_KEY]: filtered });
  }

  static async getSettings(): Promise<HighlightSettings> {
    const result = await chrome.storage.local.get([this.SETTINGS_KEY]);
    return result[this.SETTINGS_KEY] || {
      defaultColor: 'yellow',
      highlightOpacity: 0.3,
      showNotes: true,
      syncEnabled: false,
    };
  }

  static async saveSettings(settings: HighlightSettings): Promise<void> {
    await chrome.storage.local.set({ [this.SETTINGS_KEY]: settings });
  }

  static async getHighlightsByUrl(url: string): Promise<HighlightData[]> {
    const highlights = await this.getHighlights();
    return highlights.filter(h => h.url === url);
  }
}