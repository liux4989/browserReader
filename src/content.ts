import { type HighlightData } from './utils/types';

console.log('Content script loaded!');

class HighlightManager {
  private highlights: Map<string, HighlightData> = new Map();
  private highlightElements: Map<string, HTMLElement> = new Map();

  constructor() {
    this.init();
  }

  private init(): void {
    this.setupMessageHandlers();
    this.restoreHighlights();
  }

  private setupMessageHandlers(): void {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sendResponse);
      return true; // Keep message channel open for async response
    });
  }

  private async handleMessage(message: any, sendResponse: (response?: any) => void): Promise<void> {
    console.log('Content script received message:', message);

    try {
      if (message.type === 'CREATE_HIGHLIGHT') {
        await this.createHighlight(message.color);
        sendResponse({ success: true });
      } else if (message.type === 'STORAGE_CHANGED') {
        await this.handleStorageChange(message.changes);
        sendResponse({ success: true });
      } else if (message.type === 'GET_HIGHLIGHTS') {
        const highlights = await this.getHighlightsForCurrentPage();
        sendResponse({ highlights });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  private async createHighlight(color: string): Promise<void> {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.toString().trim().length === 0) {
      throw new Error('No text selected');
    }

    const range = selection.getRangeAt(0);
    const selectedText = selection.toString();

    // Create highlight data
    const highlightData: HighlightData = {
      id: this.generateId(),
      text: selectedText,
      url: window.location.href,
      timestamp: Date.now(),
      color,
      range: this.serializeRange(range)
    };

    // Create visual highlight
    const highlightElement = this.createVisualHighlight(range, color, highlightData.id);

    // Store highlight data
    this.highlights.set(highlightData.id, highlightData);
    this.highlightElements.set(highlightData.id, highlightElement);

    // Save to storage
    await this.saveHighlightToStorage(highlightData);

    console.log('Highlight created successfully:', highlightData.id);
  }

  private createVisualHighlight(range: Range, color: string, id: string): HTMLElement {
    const colors = {
      yellow: '#ffff0080',
      green: '#00ff0080',
      blue: '#0099ff80',
      pink: '#ff69b480',
      orange: '#ff8c0080',
      purple: '#9966cc80'
    };

    const span = document.createElement('span');
    span.style.backgroundColor = colors[color as keyof typeof colors] || colors.yellow;
    span.style.padding = '2px';
    span.style.borderRadius = '2px';
    span.setAttribute('data-highlight-id', id);
    span.classList.add('highlight-element');

    try {
      const contents = range.extractContents();
      span.appendChild(contents);
      range.insertNode(span);
    } catch (error) {
      console.error('Error creating visual highlight:', error);
      // Fallback method
      this.createVisualHighlightFallback(range, span);
    }

    return span;
  }

  private createVisualHighlightFallback(range: Range, span: HTMLElement): void {
    const walker = document.createTreeWalker(
      range.commonAncestorContainer,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const nodeRange = document.createRange();
          nodeRange.selectNode(node);
          return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      }
    );

    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node);
    }

    textNodes.forEach(textNode => {
      const parent = textNode.parentNode;
      if (parent && parent.nodeType === Node.ELEMENT_NODE) {
        const highlightSpan = span.cloneNode(true) as HTMLElement;
        highlightSpan.textContent = textNode.textContent;
        parent.replaceChild(highlightSpan, textNode);
      }
    });
  }

  private serializeRange(range: Range): HighlightData['range'] {
    return {
      startContainer: this.getNodePath(range.startContainer),
      startOffset: range.startOffset,
      endContainer: this.getNodePath(range.endContainer),
      endOffset: range.endOffset,
      commonAncestor: this.getNodePath(range.commonAncestorContainer)
    };
  }

  private getNodePath(node: Node): string {
    const path = [];
    let current = node;

    while (current && current !== document.body) {
      if (current.nodeType === Node.ELEMENT_NODE) {
        const element = current as Element;
        const tagName = element.tagName.toLowerCase();
        const parent = element.parentNode;
        if (parent) {
          const index = Array.from(parent.children).indexOf(element);
          path.unshift(`${tagName}[${index}]`);
        }
      } else if (current.nodeType === Node.TEXT_NODE) {
        const parent = current.parentNode;
        if (parent) {
          const index = Array.from(parent.childNodes).indexOf(current as ChildNode);
          path.unshift(`text[${index}]`);
        }
      }
      current = current.parentNode as Node;
    }

    return path.join(' > ');
  }

  private getNodeFromPath(path: string): Node | null {
    const parts = path.split(' > ');
    let current: Node | null = document.body;

    for (const part of parts) {
      if (!current) return null;

      if (part.startsWith('text[')) {
        const index = parseInt(part.match(/\[(\d+)\]/)?.[1] || '0');
        current = current.childNodes[index] || null;
      } else if (part.includes('[')) {
        const [tagName, indexStr] = part.split('[');
        const index = parseInt(indexStr.replace(']', ''));
        const element = (current as Element).children[index] as Element;
        current = element || null;
      }
    }

    return current;
  }

  private deserializeRange(rangeData: HighlightData['range']): Range | null {
    try {
      const startContainer = this.getNodeFromPath(rangeData.startContainer);
      const endContainer = this.getNodeFromPath(rangeData.endContainer);

      if (!startContainer || !endContainer) return null;

      const range = document.createRange();
      range.setStart(startContainer, rangeData.startOffset);
      range.setEnd(endContainer, rangeData.endOffset);

      return range;
    } catch (error) {
      console.error('Error deserializing range:', error);
      return null;
    }
  }

  private async saveHighlightToStorage(highlightData: HighlightData): Promise<void> {
    try {
      await chrome.runtime.sendMessage({
        type: 'SAVE_HIGHLIGHT',
        highlight: highlightData
      });
    } catch (error) {
      console.error('Error saving highlight to storage:', error);
    }
  }

  private async getHighlightsForCurrentPage(): Promise<HighlightData[]> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_HIGHLIGHTS_BY_URL',
        url: window.location.href
      });
      return response.highlights || [];
    } catch (error) {
      console.error('Error getting highlights:', error);
      return [];
    }
  }

  private async restoreHighlights(): Promise<void> {
    try {
      const highlights = await this.getHighlightsForCurrentPage();

      for (const highlightData of highlights) {
        const range = this.deserializeRange(highlightData.range);
        if (range) {
          const highlightElement = this.createVisualHighlight(range, highlightData.color, highlightData.id);
          this.highlights.set(highlightData.id, highlightData);
          this.highlightElements.set(highlightData.id, highlightElement);
        }
      }

      console.log(`Restored ${highlights.length} highlights`);
    } catch (error) {
      console.error('Error restoring highlights:', error);
    }
  }

  private async handleStorageChange(changes: { [key: string]: chrome.storage.StorageChange }): Promise<void> {
    if (changes.highlights) {
      // Reload highlights for current page
      await this.clearHighlights();
      await this.restoreHighlights();
    }
  }

  private clearHighlights(): void {
    // Remove all highlight elements
    this.highlightElements.forEach(element => {
      element.remove();
    });

    this.highlights.clear();
    this.highlightElements.clear();
  }

  private generateId(): string {
    return `highlight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Initialize highlight manager when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new HighlightManager();
  });
} else {
  new HighlightManager();
}
