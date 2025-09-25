import { type HighlightData, type SerializedRange } from '../utils/types';
import { InlinePopup } from './InlinePopup';

console.log('Content script loaded!');

class HighlightManager {
  private highlights: Map<string, HighlightData> = new Map();
  private highlightElements: Map<string, HTMLElement[]> = new Map();
  private mutationObserver: MutationObserver | null = null;
  private readonly highlightClassName = 'text-highlight';
  private inlinePopup: InlinePopup;
  private storedRange: Range | null = null;
  private readonly colors = {
    yellow: 'rgba(255, 235, 59, 0.4)',
    green: 'rgba(76, 175, 80, 0.4)',
    blue: 'rgba(33, 150, 243, 0.4)',
    pink: 'rgba(233, 30, 99, 0.4)',
    orange: 'rgba(255, 152, 0, 0.4)',
    purple: 'rgba(156, 39, 176, 0.4)'
  };

  constructor() {
    this.inlinePopup = new InlinePopup();
    this.init();
  }

  private init(): void {
    this.injectStyles();
    this.setupMessageHandlers();
    this.setupMutationObserver();
    this.restoreHighlights();
    this.setupEventListeners();
  }

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      .${this.highlightClassName} {
        display: inline;
        border-radius: 3px;
        padding: 1px 0;
        transition: background-color 0.2s ease;
        cursor: pointer;
        position: relative;
      }
      .${this.highlightClassName}[data-highlight-active="true"] {
        outline: 2px solid rgba(0, 0, 0, 0.3);
        outline-offset: 1px;
      }
      .highlight-tooltip {
        position: absolute;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        white-space: nowrap;
        z-index: 10000;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  private setupEventListeners(): void {
    document.addEventListener('click', this.handleHighlightClick.bind(this));
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
    document.addEventListener('mouseup', this.handleMouseUp.bind(this));
    document.addEventListener('mousedown', this.handleMouseDown.bind(this));
  }

  private handleHighlightClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.classList.contains(this.highlightClassName)) return;

    const highlightId = target.getAttribute('data-highlight-id');
    if (!highlightId) return;

    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      event.stopPropagation();
      this.removeHighlight(highlightId);
    } else if (event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      this.editHighlightColor(highlightId);
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.clearActiveHighlights();
      this.inlinePopup.hide();
      this.storedRange = null;
    }
  }

  private handleMouseDown(): void {
    // Hide popup when starting a new selection
    this.inlinePopup.hide();
    this.storedRange = null;
  }

  private handleMouseUp(): void {
    this.checkAndShowInlinePopup();
  }

  private checkAndShowInlinePopup(): void {
    console.log('🔍 checkAndShowInlinePopup called');
    const selection = window.getSelection();

    if (!selection) {
      console.log('❌ No selection object');
      this.inlinePopup.hide();
      this.storedRange = null;
      return;
    }

    if (selection.isCollapsed) {
      console.log('❌ Selection is collapsed');
      this.inlinePopup.hide();
      this.storedRange = null;
      return;
    }

    const selectedText = selection.toString();
    if (selectedText.trim().length === 0) {
      console.log('❌ Selection has no text content');
      this.inlinePopup.hide();
      this.storedRange = null;
      return;
    }

    console.log('✅ Valid selection found:', selectedText.substring(0, 50) + '...');

    // Validate selection range
    if (!selection.rangeCount) {
      console.warn('❌ No ranges in selection');
      this.inlinePopup.hide();
      this.storedRange = null;
      return;
    }

    const range = selection.getRangeAt(0);

    // Additional validation
    if (!range.startContainer.isConnected || !range.endContainer.isConnected) {
      console.warn('❌ Selection range containers are not connected to document');
      this.inlinePopup.hide();
      this.storedRange = null;
      return;
    }

    console.log('✅ Range containers are connected to document');

    // Check if selection is on an existing highlight
    const existingHighlight = this.getHighlightFromSelection(selection);

    if (existingHighlight) {
      console.log('✅ Selection is on existing highlight:', existingHighlight);
      // Show popup with delete option for existing highlight
      this.inlinePopup.show(
        selection,
        (color) => {
          // Change color of existing highlight
          this.changeHighlightColor(existingHighlight, color).catch(error => {
            console.error('Failed to change highlight color:', error);
          });
        },
        () => {
          // Delete existing highlight
          this.removeHighlight(existingHighlight).catch(error => {
            console.error('Failed to delete highlight:', error);
          });
        }
      );
    } else {
      console.log('✅ Selection is on new text, preparing to show popup');
      // Store the current selection range before showing popup
      try {
        this.storedRange = range.cloneRange();
        console.log('✅ Range cloned successfully');

        // Double-check the stored range is valid
        if (!this.storedRange || this.storedRange.collapsed) {
          console.warn('❌ Stored range is invalid or collapsed');
          this.storedRange = null;
          this.inlinePopup.hide();
          return;
        }

        // Additional validation
        const rangeText = this.storedRange.toString();
        if (!rangeText || rangeText.trim().length === 0) {
          console.warn('❌ Stored range contains no text');
          this.storedRange = null;
          this.inlinePopup.hide();
          return;
        }

        console.log('✅ Stored range is valid:', rangeText.substring(0, 30) + '...');

        console.log('Stored range for highlighting:', {
          text: rangeText,
          startContainer: this.storedRange.startContainer.nodeName,
          endContainer: this.storedRange.endContainer.nodeName,
          startOffset: this.storedRange.startOffset,
          endOffset: this.storedRange.endOffset
        });

        // Show the inline popup for new highlight
        console.log('🎯 Calling inlinePopup.show()...');
        this.inlinePopup.show(selection, (color) => {
          console.log('🎨 Color selected:', color);
          this.createHighlightFromStoredRange(color).catch(error => {
            console.error('Failed to create highlight:', error);
            // Show a user-friendly error message
            console.warn('Highlight creation failed. Please try selecting the text again.');
          });
        });
        console.log('✅ inlinePopup.show() completed');
      } catch (cloneError) {
        console.error('Failed to clone range:', cloneError);
        this.storedRange = null;
        this.inlinePopup.hide();
        return;
      }
    }
  }

  private getHighlightFromSelection(selection: Selection): string | null {
    if (!selection.rangeCount) return null;

    const range = selection.getRangeAt(0);
    let container = range.commonAncestorContainer;

    // If the container is a text node, check its parent
    if (container.nodeType === Node.TEXT_NODE) {
      container = container.parentNode as Node;
    }

    // Check if any parent element is a highlight and return its ID
    let current = container as Element;
    while (current && current !== document.body) {
      if (current.classList && current.classList.contains(this.highlightClassName)) {
        return current.getAttribute('data-highlight-id');
      }
      current = current.parentElement as Element;
    }

    return null;
  }

  private isSelectionInHighlight(selection: Selection): boolean {
    return this.getHighlightFromSelection(selection) !== null;
  }

  private clearActiveHighlights(): void {
    document.querySelectorAll(`.${this.highlightClassName}[data-highlight-active="true"]`)
      .forEach(el => el.setAttribute('data-highlight-active', 'false'));
  }

  private setupMutationObserver(): void {
    this.mutationObserver = new MutationObserver((mutations) => {
      const shouldRestore = mutations.some(mutation => {
        return mutation.type === 'childList' &&
               (mutation.removedNodes.length > 0 || mutation.addedNodes.length > 0);
      });

      if (shouldRestore) {
        this.debouncedRestoreHighlights();
      }
    });

    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  private debouncedRestoreHighlights = this.debounce(() => {
    this.validateAndRestoreHighlights();
  }, 500);

  private debounce<T extends (...args: any[]) => void>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null;
    return (...args: Parameters<T>) => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }

  private setupMessageHandlers(): void {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      this.handleMessage(message, sendResponse);
      return true;
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

  private async createHighlightFromStoredRange(color: string): Promise<void> {
    if (!this.storedRange) {
      throw new Error('No stored range available');
    }

    const range = this.storedRange;

    console.log('Creating highlight from stored range:', {
      startContainer: range.startContainer.nodeName,
      endContainer: range.endContainer.nodeName,
      startOffset: range.startOffset,
      endOffset: range.endOffset,
      collapsed: range.collapsed,
      text: range.toString()
    });

    // Validate that the range is still connected to the document
    if (!range.startContainer.isConnected || !range.endContainer.isConnected) {
      this.storedRange = null;
      throw new Error('Stored range is no longer valid - DOM has changed');
    }

    // Check if the range is collapsed or empty
    if (range.collapsed) {
      this.storedRange = null;
      throw new Error('Stored range is collapsed');
    }

    const selectedText = range.toString();
    if (selectedText.trim().length === 0) {
      this.storedRange = null;
      throw new Error('No text in stored range');
    }

    // Check if the range intersects with existing highlights
    if (this.rangeIntersectsHighlight(range)) {
      console.warn('Range intersects with existing highlight, proceeding anyway');
    }

    const serializedRange = this.serializeRange(range);
    if (!serializedRange) {
      this.storedRange = null;
      throw new Error('Failed to serialize selection range');
    }

    const highlightData: HighlightData = {
      id: this.generateId(),
      text: selectedText,
      url: window.location.href,
      timestamp: Date.now(),
      color,
      range: serializedRange
    };

    try {
      const highlightElements = this.applyHighlight(range, color, highlightData.id);

      if (highlightElements.length === 0) {
        throw new Error('No highlight elements were created');
      }

      this.highlights.set(highlightData.id, highlightData);
      this.highlightElements.set(highlightData.id, highlightElements);

      await this.saveHighlightToStorage(highlightData);

      console.log('Highlight created successfully:', highlightData.id, 'with', highlightElements.length, 'elements');
    } catch (error) {
      console.error('Failed to apply highlight:', error);
      throw error;
    } finally {
      // Always clear the stored range
      this.storedRange = null;
    }
  }

  private async createHighlight(color: string): Promise<void> {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.toString().trim().length === 0) {
      throw new Error('No text selected');
    }

    const range = selection.getRangeAt(0);
    const selectedText = selection.toString();

    const serializedRange = this.serializeRange(range);
    if (!serializedRange) {
      throw new Error('Failed to serialize selection range');
    }

    const highlightData: HighlightData = {
      id: this.generateId(),
      text: selectedText,
      url: window.location.href,
      timestamp: Date.now(),
      color,
      range: serializedRange
    };

    const highlightElements = this.applyHighlight(range, color, highlightData.id);

    this.highlights.set(highlightData.id, highlightData);
    this.highlightElements.set(highlightData.id, highlightElements);

    await this.saveHighlightToStorage(highlightData);

    selection.removeAllRanges();
    console.log('Highlight created successfully:', highlightData.id);
  }

  private applyHighlight(range: Range, color: string, id: string): HTMLElement[] {
    // For new user selections, apply word completion
    return this.applyHighlightWithCompletion(range, color, id);
  }

  private applyHighlightWithCompletion(range: Range, color: string, id: string): HTMLElement[] {
    const elements: HTMLElement[] = [];

    try {
      // Smart word completion for partial selections
      const expandedRange = this.completeWordSelection(range);

      // Validate the expanded range
      if (expandedRange.collapsed || !expandedRange.toString().trim()) {
        console.warn('Range is collapsed or empty after word completion');
        return elements;
      }

      const selectedText = expandedRange.toString();
      console.log('Creating highlight for text:', selectedText.substring(0, 50));

      return this.applyHighlightDirect(expandedRange, color, id);

    } catch (error) {
      console.error('Error applying highlight with completion:', error);
      return elements;
    }
  }

  private applyHighlightDirect(range: Range, color: string, id: string): HTMLElement[] {
    const elements: HTMLElement[] = [];

    try {
      // Validate range without word completion
      if (range.collapsed || !range.toString().trim()) {
        console.warn('Direct highlight: Range is collapsed or empty');
        return elements;
      }

      const selectedText = range.toString();
      console.log('Creating direct highlight for text:', selectedText.substring(0, 50));

      const span = this.createHighlightElement(color, id);

      // Try the simple approach first - this works for most cases
      try {
        range.surroundContents(span);
        elements.push(span);
        console.log('✓ Successfully created highlight using surroundContents');
        return elements;
      } catch (surroundError) {
        // surroundContents fails when the range crosses element boundaries
        console.log('surroundContents failed, trying extraction method');
      }

      // Fallback: use extraction method for complex selections
      try {
        const contents = range.extractContents();

        if (!contents.textContent?.trim()) {
          console.warn('No text content in extracted range');
          return elements;
        }

        span.appendChild(contents);
        range.insertNode(span);
        elements.push(span);
        console.log('✓ Successfully created highlight using extraction method');
      } catch (extractError) {
        console.error('Both highlighting methods failed:', extractError);
      }

    } catch (error) {
      console.error('Error applying direct highlight:', error);
    }

    return elements;
  }

  private createHighlightElement(color: string, id: string): HTMLElement {
    const span = document.createElement('span');
    span.className = this.highlightClassName;
    span.style.backgroundColor = this.colors[color as keyof typeof this.colors] || this.colors.yellow;
    span.setAttribute('data-highlight-id', id);
    span.setAttribute('data-highlight-color', color);
    span.setAttribute('title', 'Ctrl+Click to remove, Shift+Click to change color');
    return span;
  }


  private rangeIntersectsHighlight(range: Range): boolean {
    // Simple check: see if any existing highlight elements intersect with the range
    const highlightElements = document.querySelectorAll(`.${this.highlightClassName}`);

    for (const element of highlightElements) {
      try {
        if (range.intersectsNode(element)) {
          return true;
        }
      } catch (e) {
        // Continue checking other elements if one fails
        continue;
      }
    }

    return false;
  }

  private isHighlightElement(element: HTMLElement | null): boolean {
    return element?.classList.contains(this.highlightClassName) || false;
  }

  private completeWordSelection(range: Range): Range {
    // First validate the input range
    if (range.collapsed || !range.toString().trim()) {
      console.warn('Input range is collapsed or empty, cannot complete words');
      return range;
    }

    const selectedText = range.toString();
    console.log(`Checking for word completion: "${selectedText}"`);

    try {
      // Always try to complete word boundaries, regardless of length
      const wordCompleted = this.completeWordBoundaries(range);

      // Validate the completed range
      if (wordCompleted.collapsed) {
        console.warn('Word completion resulted in collapsed range, using original');
        return range;
      }

      const completedText = wordCompleted.toString();

      // Validate we didn't lose content
      if (!completedText.trim()) {
        console.warn('Word completion resulted in empty text, using original');
        return range;
      }

      // Only expand if we actually completed something
      if (completedText !== selectedText) {
        console.log(`Word completed: "${selectedText}" → "${completedText}"`);
        return wordCompleted;
      } else {
        console.log('Selection already at word boundaries, no completion needed');
        return range;
      }

    } catch (error) {
      console.error('Error completing word boundaries:', error);
      return range;
    }
  }

  private completeWordBoundaries(range: Range): Range {
    const completedRange = range.cloneRange();

    // Validate that the range containers are still connected to the document
    if (!range.startContainer.isConnected || !range.endContainer.isConnected) {
      console.warn('Range containers not connected to document');
      return range;
    }

    // Complete word at start if selection begins mid-word
    this.completeWordStart(completedRange);

    // Complete word at end if selection ends mid-word
    this.completeWordEnd(completedRange);

    return completedRange;
  }

  private completeWordStart(range: Range) {
    const container = range.startContainer;
    let offset = range.startOffset;

    if (container.nodeType === Node.TEXT_NODE) {
      const text = container.textContent || '';

      // Validate offset bounds
      if (offset < 0 || offset > text.length) {
        console.warn('Invalid start offset in completeWordStart:', offset);
        return;
      }

      // Check if we're already at a word boundary
      if (offset === 0 || this.isWordBoundary(text[offset - 1])) {
        return; // Already at word start, no completion needed
      }

      // Go backwards to find the start of the word
      while (offset > 0 && !this.isWordBoundary(text[offset - 1])) {
        offset--;
      }

      // Validate new offset and only update if valid
      if (offset >= 0 && offset <= range.endOffset) {
        range.setStart(container, offset);
      }
    }
  }

  private completeWordEnd(range: Range) {
    const container = range.endContainer;
    let offset = range.endOffset;

    if (container.nodeType === Node.TEXT_NODE) {
      const text = container.textContent || '';

      // Validate offset bounds
      if (offset < 0 || offset > text.length) {
        console.warn('Invalid end offset in completeWordEnd:', offset);
        return;
      }

      // Check if we're already at a word boundary
      if (offset >= text.length || this.isWordBoundary(text[offset])) {
        return; // Already at word end, no completion needed
      }

      // Go forwards to find the end of the word
      while (offset < text.length && !this.isWordBoundary(text[offset])) {
        offset++;
      }

      // Validate new offset and only update if valid
      if (offset <= text.length && offset >= range.startOffset) {
        range.setEnd(container, offset);
      }
    }
  }

  private isWordBoundary(char: string): boolean {
    // Simple word boundary detection: whitespace and common punctuation
    return /[\s\.,;:!?\-()[\]{}'""]/.test(char);
  }

  private serializeRange(range: Range): SerializedRange | null {
    try {
      // Get the actual offsets relative to the parent element
      const startInfo = this.getContainerInfo(range.startContainer, range.startOffset);
      const endInfo = this.getContainerInfo(range.endContainer, range.endOffset);

      if (!startInfo || !endInfo) {
        console.error('Failed to get container info for serialization');
        return null;
      }

      return {
        startXPath: startInfo.xpath,
        startOffset: startInfo.offset,
        startTextIndex: startInfo.textIndex,
        endXPath: endInfo.xpath,
        endOffset: endInfo.offset,
        endTextIndex: endInfo.textIndex,
        text: range.toString()
      };
    } catch (error) {
      console.error('Error serializing range:', error);
      return null;
    }
  }

  private getContainerInfo(container: Node, offset: number): { xpath: string, offset: number, textIndex: number } | null {
    try {
      // For text nodes, we need to find the offset relative to the parent element
      if (container.nodeType === Node.TEXT_NODE) {
        const parentElement = container.parentElement;
        if (!parentElement) return null;

        // Calculate the accumulated offset of text before this text node
        let textIndex = 0;
        let accumulatedOffset = offset;

        const walker = document.createTreeWalker(
          parentElement,
          NodeFilter.SHOW_TEXT,
          null
        );

        let node;
        while (node = walker.nextNode()) {
          if (node === container) {
            break;
          }
          textIndex++;
          accumulatedOffset += (node.textContent?.length || 0);
        }

        return {
          xpath: this.getSimpleXPath(parentElement),
          offset: accumulatedOffset,
          textIndex: textIndex
        };
      } else {
        // For element nodes, use as-is
        return {
          xpath: this.getSimpleXPath(container),
          offset: offset,
          textIndex: 0
        };
      }
    } catch (error) {
      console.error('Error getting container info:', error);
      return null;
    }
  }

  private getSimpleXPath(node: Node): string {
    try {
      // For text nodes, get the path to the parent element
      const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node as Element;
      if (!element) return '';

      // Use ID if available
      if (element.id) {
        return `//*[@id="${element.id}"]`;
      }

      // Simple path generation - just enough to find the element again
      const paths: string[] = [];
      let current: Element | null = element;

      while (current && current !== document.body) {
        let index = 1;
        let sibling = current.previousElementSibling;

        while (sibling) {
          if (sibling.nodeName === current.nodeName) index++;
          sibling = sibling.previousElementSibling;
        }

        paths.unshift(`${current.nodeName.toLowerCase()}[${index}]`);
        current = current.parentElement;
      }

      return paths.length ? `//${paths.join('/')}` : '';
    } catch (error) {
      console.error('Error generating XPath:', error);
      return '';
    }
  }

  private getElementByXPath(xpath: string): Element | null {
    try {
      const result = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      return result.singleNodeValue as Element;
    } catch (error) {
      return null;
    }
  }

  private deserializeRange(rangeData: any): Range | null {
    try {
      const serialized = rangeData as SerializedRange;

      // Validate serialized data
      if (!serialized.text || !serialized.text.trim()) {
        console.warn('Cannot deserialize range: no text content');
        return null;
      }

      const startElement = this.getElementByXPath(serialized.startXPath);
      const endElement = this.getElementByXPath(serialized.endXPath);

      if (!startElement || !endElement) {
        // Fallback to text search
        console.log('XPath elements not found, trying text search');
        return this.simpleTextSearch(serialized.text);
      }

      const range = document.createRange();

      // For element containers, find the appropriate text node
      const startContainer = this.findAppropriateContainer(startElement, serialized.startOffset, false);
      const endContainer = this.findAppropriateContainer(endElement, serialized.endOffset, true);

      if (!startContainer || !endContainer) {
        console.log('Container nodes not found, trying text search');
        return this.simpleTextSearch(serialized.text);
      }

      range.setStart(startContainer.node, startContainer.offset);
      range.setEnd(endContainer.node, endContainer.offset);

      // Validate the created range
      if (range.collapsed) {
        console.warn('Deserialized range is collapsed, trying text search');
        return this.simpleTextSearch(serialized.text);
      }

      const rangeText = range.toString();
      if (!rangeText.trim()) {
        console.warn('Deserialized range has no text content, trying text search');
        return this.simpleTextSearch(serialized.text);
      }

      // Verify the text roughly matches (allowing for some whitespace differences)
      const normalizedOriginal = serialized.text.trim().toLowerCase();
      const normalizedRange = rangeText.trim().toLowerCase();

      if (normalizedRange !== normalizedOriginal && !normalizedRange.includes(normalizedOriginal)) {
        console.warn('Deserialized range text mismatch, trying text search');
        return this.simpleTextSearch(serialized.text);
      }

      return range;
    } catch (error) {
      console.error('Error deserializing range:', error);
      return this.simpleTextSearch(rangeData.text);
    }
  }

  private findAppropriateContainer(element: Element, offset: number, _isEnd: boolean = false): { node: Node, offset: number } | null {
    // Get all text nodes in the element
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          return !this.isHighlightElement(node.parentElement) ?
            NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      }
    );

    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node as Text);
    }

    if (textNodes.length === 0) {
      // No text nodes found, try to use element's children
      if (element.childNodes.length > 0) {
        const childIndex = Math.min(offset, element.childNodes.length - 1);
        return { node: element, offset: childIndex };
      }
      return { node: element, offset: 0 };
    }

    // Calculate which text node contains the offset
    let accumulatedLength = 0;
    for (const textNode of textNodes) {
      const textLength = textNode.textContent?.length || 0;
      if (accumulatedLength + textLength >= offset) {
        // This text node contains our offset
        const nodeOffset = offset - accumulatedLength;
        return {
          node: textNode,
          offset: Math.min(nodeOffset, textLength)
        };
      }
      accumulatedLength += textLength;
    }

    // If offset is beyond all text nodes, use the last text node
    const lastTextNode = textNodes[textNodes.length - 1];
    return {
      node: lastTextNode,
      offset: lastTextNode.textContent?.length || 0
    };
  }

  private simpleTextSearch(text: string): Range | null {
    if (!text || !text.trim()) return null;

    const searchText = text.trim();

    // Try different search strategies
    const strategies = [
      () => this.exactTextSearch(searchText),
      () => this.fuzzyTextSearch(searchText),
      () => this.partialTextSearch(searchText)
    ];

    for (const strategy of strategies) {
      const result = strategy();
      if (result) return result;
    }

    console.warn('All text search strategies failed for:', searchText.substring(0, 30));
    return null;
  }

  private exactTextSearch(searchText: string): Range | null {
    // Simple text search across all text nodes
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          return !this.isHighlightElement(node.parentElement) ?
            NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      }
    );

    let node;
    while (node = walker.nextNode()) {
      const textNode = node as Text;
      const nodeText = textNode.textContent || '';
      const index = nodeText.indexOf(searchText);

      if (index !== -1) {
        try {
          const range = document.createRange();
          range.setStart(textNode, index);
          range.setEnd(textNode, index + searchText.length);

          // Validate the created range
          if (range.collapsed) {
            continue;
          }

          const rangeText = range.toString();
          if (!rangeText.trim()) {
            continue;
          }

          console.log('✓ Exact text search found match:', rangeText.substring(0, 30));
          return range;
        } catch (e) {
          continue;
        }
      }
    }

    return null;
  }

  private fuzzyTextSearch(searchText: string): Range | null {
    // Search with normalized whitespace
    const normalizedSearch = searchText.replace(/\s+/g, ' ');

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          return !this.isHighlightElement(node.parentElement) ?
            NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      }
    );

    let node;
    while (node = walker.nextNode()) {
      const textNode = node as Text;
      const nodeText = (textNode.textContent || '').replace(/\s+/g, ' ');
      const index = nodeText.indexOf(normalizedSearch);

      if (index !== -1) {
        try {
          // Find the actual positions in the original text
          const originalText = textNode.textContent || '';
          let actualStart = 0;
          let normalizedPos = 0;

          for (let i = 0; i < originalText.length; i++) {
            if (normalizedPos === index) {
              actualStart = i;
              break;
            }
            if (!/\s/.test(originalText[i]) || (i === 0 || !/\s/.test(originalText[i-1]))) {
              normalizedPos++;
            }
          }

          const range = document.createRange();
          range.setStart(textNode, actualStart);

          // Find end position
          let actualEnd = actualStart;
          let matchLength = 0;
          for (let i = actualStart; i < originalText.length && matchLength < normalizedSearch.length; i++) {
            if (!/\s/.test(originalText[i]) || (matchLength > 0 && normalizedSearch[matchLength] === ' ')) {
              matchLength++;
            }
            actualEnd = i + 1;
          }

          range.setEnd(textNode, actualEnd);

          if (!range.collapsed && range.toString().trim()) {
            console.log('✓ Fuzzy text search found match:', range.toString().substring(0, 30));
            return range;
          }
        } catch (e) {
          continue;
        }
      }
    }

    return null;
  }

  private partialTextSearch(searchText: string): Range | null {
    // Try to find at least the beginning of the text
    const words = searchText.split(/\s+/).filter(w => w.length > 2);
    if (words.length === 0) return null;

    // Try to find at least the first few words
    const partialSearch = words.slice(0, Math.min(3, words.length)).join(' ');

    return this.exactTextSearch(partialSearch);
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
      let restoredCount = 0;

      for (const highlightData of highlights) {
        try {
          const range = this.deserializeRange(highlightData.range);
          if (range && !this.isRangeAlreadyHighlighted(range, highlightData.id)) {
            // Use direct highlighting for restoration (skip word completion)
            const elements = this.applyHighlightDirect(range, highlightData.color, highlightData.id);
            if (elements.length > 0) {
              this.highlights.set(highlightData.id, highlightData);
              this.highlightElements.set(highlightData.id, elements);
              restoredCount++;
            }
          }
        } catch (error) {
          console.warn(`Failed to restore highlight ${highlightData.id}:`, error);
        }
      }

      console.log(`Restored ${restoredCount}/${highlights.length} highlights`);
    } catch (error) {
      console.error('Error restoring highlights:', error);
    }
  }

  private isRangeAlreadyHighlighted(range: Range, highlightId: string): boolean {
    const container = range.commonAncestorContainer;
    const existingHighlight = container.nodeType === Node.TEXT_NODE
      ? container.parentElement
      : container as Element;

    return existingHighlight?.getAttribute('data-highlight-id') === highlightId;
  }

  private validateAndRestoreHighlights(): void {
    this.highlightElements.forEach((elements, id) => {
      const stillExists = elements.every(el => document.body.contains(el));
      if (!stillExists) {
        const highlightData = this.highlights.get(id);
        if (highlightData) {
          const range = this.deserializeRange(highlightData.range);
          if (range && !this.isRangeAlreadyHighlighted(range, id)) {
            // Use direct highlighting for restoration (skip word completion)
            const newElements = this.applyHighlightDirect(range, highlightData.color, id);
            if (newElements.length > 0) {
              this.highlightElements.set(id, newElements);
            }
          }
        }
      }
    });
  }

  private async handleStorageChange(changes: { [key: string]: chrome.storage.StorageChange }): Promise<void> {
    if (changes.highlights) {
      this.clearHighlights();
      await this.restoreHighlights();
    }
  }

  private clearHighlights(): void {
    this.highlightElements.forEach(elements => {
      elements.forEach(element => {
        const parent = element.parentNode;
        if (!parent) return;

        while (element.firstChild) {
          parent.insertBefore(element.firstChild, element);
        }
        parent.removeChild(element);
      });
    });

    document.body.normalize();
    this.highlights.clear();
    this.highlightElements.clear();
  }

  private async removeHighlight(highlightId: string): Promise<void> {
    const elements = this.highlightElements.get(highlightId);
    if (!elements) return;

    elements.forEach(element => {
      const parent = element.parentNode;
      if (!parent) return;

      while (element.firstChild) {
        parent.insertBefore(element.firstChild, element);
      }
      parent.removeChild(element);
      parent.normalize();
    });

    this.highlights.delete(highlightId);
    this.highlightElements.delete(highlightId);

    await chrome.runtime.sendMessage({
      type: 'REMOVE_HIGHLIGHT',
      highlightId
    });
  }

  private async changeHighlightColor(highlightId: string, newColor: string): Promise<void> {
    const highlight = this.highlights.get(highlightId);
    const elements = this.highlightElements.get(highlightId);

    if (!highlight || !elements) return;

    elements.forEach(element => {
      element.style.backgroundColor = this.colors[newColor as keyof typeof this.colors];
      element.setAttribute('data-highlight-color', newColor);
    });

    highlight.color = newColor;
    this.highlights.set(highlightId, highlight);

    await chrome.runtime.sendMessage({
      type: 'UPDATE_HIGHLIGHT',
      highlight
    });

    console.log('Highlight color changed:', highlightId, 'to', newColor);
  }

  private async editHighlightColor(highlightId: string): Promise<void> {
    const highlight = this.highlights.get(highlightId);
    const elements = this.highlightElements.get(highlightId);

    if (!highlight || !elements) return;

    const colors = Object.keys(this.colors);
    const currentIndex = colors.indexOf(highlight.color);
    const newColor = colors[(currentIndex + 1) % colors.length];

    await this.changeHighlightColor(highlightId, newColor);
  }

  private generateId(): string {
    return `highlight_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new HighlightManager();
  });
} else {
  new HighlightManager();
}