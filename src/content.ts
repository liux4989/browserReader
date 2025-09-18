import { type HighlightData, type SerializedRange } from './utils/types';
import { InlinePopup } from './components/InlinePopup';

console.log('Content script loaded!');

class HighlightManager {
  private highlights: Map<string, HighlightData> = new Map();
  private highlightElements: Map<string, HTMLElement[]> = new Map();
  private mutationObserver: MutationObserver | null = null;
  private readonly highlightClassName = 'text-highlight';
  private inlinePopup: InlinePopup;
  private selectionTimeout: NodeJS.Timeout | null = null;
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
      .${this.highlightClassName}:hover {
        filter: brightness(0.9);
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
    // Clear any existing selection timeout
    if (this.selectionTimeout) {
      clearTimeout(this.selectionTimeout);
      this.selectionTimeout = null;
    }
    // Hide popup when starting a new selection
    this.inlinePopup.hide();
    this.storedRange = null;
  }

  private handleMouseUp(): void {
    // Clear any existing timeout
    if (this.selectionTimeout) {
      clearTimeout(this.selectionTimeout);
    }

    // Set a timeout to check for selection after a brief delay
    // This allows the selection to stabilize
    this.selectionTimeout = setTimeout(() => {
      this.checkAndShowInlinePopup();
    }, 200);
  }

  private checkAndShowInlinePopup(): void {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.toString().trim().length === 0) {
      this.inlinePopup.hide();
      this.storedRange = null;
      return;
    }

    // Validate selection range
    if (!selection.rangeCount) {
      console.warn('No ranges in selection');
      this.inlinePopup.hide();
      this.storedRange = null;
      return;
    }

    const range = selection.getRangeAt(0);

    // Additional validation
    if (!range.startContainer.isConnected || !range.endContainer.isConnected) {
      console.warn('Selection range containers are not connected to document');
      this.inlinePopup.hide();
      this.storedRange = null;
      return;
    }

    // Check if selection is on an existing highlight
    const existingHighlight = this.getHighlightFromSelection(selection);

    if (existingHighlight) {
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
      // Store the current selection range before showing popup
      try {
        this.storedRange = range.cloneRange();

        // Double-check the stored range is valid
        if (!this.storedRange || this.storedRange.collapsed) {
          console.warn('Stored range is invalid or collapsed');
          this.storedRange = null;
          this.inlinePopup.hide();
          return;
        }

        // Additional validation
        const rangeText = this.storedRange.toString();
        if (!rangeText || rangeText.trim().length === 0) {
          console.warn('Stored range contains no text');
          this.storedRange = null;
          this.inlinePopup.hide();
          return;
        }

        console.log('Stored range for highlighting:', {
          text: rangeText,
          startContainer: this.storedRange.startContainer.nodeName,
          endContainer: this.storedRange.endContainer.nodeName,
          startOffset: this.storedRange.startOffset,
          endOffset: this.storedRange.endOffset
        });

        // Show the inline popup for new highlight
        this.inlinePopup.show(selection, (color) => {
          this.createHighlightFromStoredRange(color).catch(error => {
            console.error('Failed to create highlight:', error);
            // Show a user-friendly error message
            console.warn('Highlight creation failed. Please try selecting the text again.');
          });
        });
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
    const elements: HTMLElement[] = [];

    try {
      const textNodes = this.getTextNodesInRange(range);

      if (textNodes.length === 0) {
        console.warn('No text nodes found in range, trying direct range approach');

        // Last resort: try to create a highlight directly from the range
        try {
          // Clone the range to avoid modifying the original
          const rangeClone = range.cloneRange();
          const selectedText = rangeClone.toString();

          if (!selectedText || selectedText.trim().length === 0) {
            console.warn('Direct range approach: no text content');
            return elements;
          }

          // Validate range boundaries to prevent expansion
          if (rangeClone.collapsed) {
            console.warn('Direct range approach: range is collapsed');
            return elements;
          }

          console.log('Direct range approach: creating highlight for text:', selectedText.substring(0, 50));

          const span = this.createHighlightElement(color, id);
          const contents = rangeClone.extractContents();

          if (contents.textContent && contents.textContent.trim().length > 0) {
            // Verify the extracted content matches our expected text
            const extractedText = contents.textContent.trim();
            const originalText = selectedText.trim();

            if (extractedText !== originalText) {
              console.warn('Text mismatch in direct approach:', {
                expected: originalText.substring(0, 50),
                extracted: extractedText.substring(0, 50)
              });
              // Don't proceed if the text doesn't match
              return elements;
            }

            span.appendChild(contents);
            rangeClone.insertNode(span);
            elements.push(span);
            console.log('Successfully created highlight using direct range approach');
            return elements;
          }
        } catch (directError) {
          console.error('Direct range approach also failed:', directError);
        }

        return elements;
      }

      textNodes.forEach((textNode, index) => {
        try {
          const parent = textNode.parentNode;
          if (!parent || !textNode.isConnected) {
            console.warn(`Text node ${index} is not connected to document`);
            return;
          }

          // Skip if parent is already a highlight element
          if (this.isHighlightElement(parent as HTMLElement)) {
            console.warn(`Text node ${index} parent is already a highlight element`);
            return;
          }

          let startOffset = 0;
          let endOffset = textNode.textContent?.length || 0;

          if (textNode === range.startContainer) {
            startOffset = Math.min(range.startOffset, endOffset);
          }
          if (textNode === range.endContainer) {
            endOffset = Math.min(range.endOffset, textNode.textContent?.length || 0);
          }

          if (startOffset >= endOffset) {
            console.warn(`Invalid offsets for text node ${index}: start=${startOffset}, end=${endOffset}`);
            return;
          }

          // Additional validation: ensure we're not selecting more text than intended
          const nodeText = textNode.textContent || '';
          const selectedPortion = nodeText.substring(startOffset, endOffset);

          // Log what we're about to highlight from this node
          console.log(`Text node ${index} portion:`, {
            fullNodeText: nodeText.substring(0, 50),
            selectedPortion: selectedPortion,
            startOffset,
            endOffset
          });

          const span = this.createHighlightElement(color, id);

          if (startOffset === 0 && endOffset === textNode.textContent?.length) {
            // Wrap the entire text node
            parent.insertBefore(span, textNode);
            span.appendChild(textNode);
          } else {
            // Split the text node
            const beforeText = textNode.textContent?.substring(0, startOffset) || '';
            const highlightedText = textNode.textContent?.substring(startOffset, endOffset) || '';
            const afterText = textNode.textContent?.substring(endOffset) || '';

            if (highlightedText.length === 0) {
              console.warn(`No text to highlight in node ${index}`);
              return;
            }

            const beforeNode = beforeText ? document.createTextNode(beforeText) : null;
            const highlightedNode = document.createTextNode(highlightedText);
            const afterNode = afterText ? document.createTextNode(afterText) : null;

            if (beforeNode) parent.insertBefore(beforeNode, textNode);
            parent.insertBefore(span, textNode);
            span.appendChild(highlightedNode);
            if (afterNode) parent.insertBefore(afterNode, textNode);

            parent.removeChild(textNode);
          }

          elements.push(span);
        } catch (nodeError) {
          console.error(`Error processing text node ${index}:`, nodeError);
        }
      });

      console.log(`Applied highlight to ${elements.length}/${textNodes.length} text nodes`);

      // Final validation: check if the total highlighted text matches what was selected
      if (elements.length > 0) {
        const highlightedText = elements.map(el => el.textContent || '').join('');
        const originalText = range.toString();

        if (highlightedText.trim() !== originalText.trim()) {
          console.warn('Text mismatch detected:', {
            original: originalText.substring(0, 100),
            highlighted: highlightedText.substring(0, 100),
            originalLength: originalText.length,
            highlightedLength: highlightedText.length
          });

          // If there's a significant mismatch, we might have highlighted too much
          if (highlightedText.length > originalText.length * 1.5) {
            console.error('Highlighted text is significantly longer than selected text - this indicates a bug');
          }
        } else {
          console.log('✓ Highlighted text matches selected text exactly');
        }
      }
    } catch (error) {
      console.error('Error applying highlight:', error);
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

  private getTextNodesInRange(range: Range): Text[] {
    const textNodes: Text[] = [];

    try {
      // Handle simple case where the range is entirely within a single text node
      if (range.startContainer === range.endContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
        const textNode = range.startContainer as Text;
        if (!this.isHighlightElement(textNode.parentElement)) {
          textNodes.push(textNode);
        }
        return textNodes;
      }

      const walker = document.createTreeWalker(
        range.commonAncestorContainer,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            try {
              // Skip if parent is a highlight element
              if (this.isHighlightElement(node.parentElement)) {
                return NodeFilter.FILTER_REJECT;
              }

              // Check if this text node intersects with our range
              const textNode = node as Text;

              // More precise position-based check
              try {
                const textLength = textNode.textContent?.length || 0;

                // Check start position
                const startPosition = range.comparePoint(textNode, 0);
                if (startPosition === -1) {
                  // Node is after the range
                  return NodeFilter.FILTER_REJECT;
                }

                // Check end position
                const endPosition = range.comparePoint(textNode, textLength);
                if (endPosition === 1) {
                  // Node is before the range
                  return NodeFilter.FILTER_REJECT;
                }

                // Additional validation for edge cases
                if (textNode === range.startContainer) {
                  // For start container, make sure we have content after the start offset
                  if (range.startOffset >= textLength) {
                    return NodeFilter.FILTER_REJECT;
                  }
                }

                if (textNode === range.endContainer) {
                  // For end container, make sure we have content before the end offset
                  if (range.endOffset <= 0) {
                    return NodeFilter.FILTER_REJECT;
                  }
                }

                return NodeFilter.FILTER_ACCEPT;
              } catch (compareError) {
                console.warn('Error comparing text node position:', compareError);
                return NodeFilter.FILTER_REJECT;
              }
            } catch (e) {
              console.warn('Error checking text node intersection:', e);
              return NodeFilter.FILTER_REJECT;
            }
          }
        }
      );

      let node;
      while (node = walker.nextNode()) {
        textNodes.push(node as Text);
      }

      // Fallback: if no nodes found, try a different approach
      if (textNodes.length === 0) {
        console.warn('TreeWalker found no nodes, trying fallback approach');
        return this.getTextNodesInRangeFallback(range);
      }

    } catch (error) {
      console.error('Error in getTextNodesInRange:', error);
      return this.getTextNodesInRangeFallback(range);
    }

    return textNodes;
  }

  private getTextNodesInRangeFallback(range: Range): Text[] {
    const textNodes: Text[] = [];

    try {
      // More precise fallback approach
      const collectTextNodes = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const textNode = node as Text;
          if (!this.isHighlightElement(textNode.parentElement) &&
              textNode.textContent &&
              textNode.textContent.trim().length > 0) {
            try {
              // More precise check: only include if the text node actually intersects with our specific range
              if (range.intersectsNode(textNode)) {
                // Additional validation: check if any part of this text node is actually selected
                const nodeLength = textNode.textContent.length;

                // If this is the start container, check if we're past the start offset
                if (textNode === range.startContainer && nodeLength <= range.startOffset) {
                  return; // This text node is before our selection
                }

                // If this is the end container, check if we're before the end offset
                if (textNode === range.endContainer && range.endOffset <= 0) {
                  return; // This text node is after our selection
                }

                textNodes.push(textNode);
              }
            } catch (e) {
              // Only include if we're really sure about the intersection
              console.warn('Fallback intersection check failed, skipping text node');
            }
          }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          // Don't traverse into highlight elements
          if (!this.isHighlightElement(node as HTMLElement)) {
            // Only traverse children if this element actually intersects with our range
            if (range.intersectsNode(node)) {
              for (let child of Array.from(node.childNodes)) {
                collectTextNodes(child);
              }
            }
          }
        }
      };

      collectTextNodes(range.commonAncestorContainer);
      console.log(`Fallback found ${textNodes.length} text nodes`);
    } catch (error) {
      console.error('Error in fallback text node collection:', error);
    }

    return textNodes;
  }

  private rangeIntersectsNode(range: Range, node: Node): boolean {
    const nodeRange = document.createRange();
    nodeRange.selectNode(node);

    return !(
      range.compareBoundaryPoints(Range.END_TO_START, nodeRange) > 0 ||
      range.compareBoundaryPoints(Range.START_TO_END, nodeRange) < 0
    );
  }

  private rangeIntersectsHighlight(range: Range): boolean {
    // Check if any part of the range intersects with existing highlight elements
    const walker = document.createTreeWalker(
      range.commonAncestorContainer,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          const element = node as Element;
          if (element.classList.contains(this.highlightClassName)) {
            // Check if this highlight element intersects with our range
            try {
              const elementRange = document.createRange();
              elementRange.selectNode(element);

              const intersects = !(
                range.compareBoundaryPoints(Range.END_TO_START, elementRange) > 0 ||
                range.compareBoundaryPoints(Range.START_TO_END, elementRange) < 0
              );

              return intersects ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            } catch (e) {
              return NodeFilter.FILTER_REJECT;
            }
          }
          return NodeFilter.FILTER_REJECT;
        }
      }
    );

    return walker.nextNode() !== null;
  }

  private isHighlightElement(element: HTMLElement | null): boolean {
    return element?.classList.contains(this.highlightClassName) || false;
  }

  private serializeRange(range: Range): SerializedRange | null {
    try {
      const startInfo = this.getTextNodeInfo(range.startContainer);
      const endInfo = this.getTextNodeInfo(range.endContainer);

      if (!startInfo || !endInfo) return null;

      return {
        startXPath: this.getXPath(startInfo.container),
        startOffset: range.startOffset,
        startTextIndex: startInfo.textIndex,
        endXPath: this.getXPath(endInfo.container),
        endOffset: range.endOffset,
        endTextIndex: endInfo.textIndex,
        text: range.toString()
      };
    } catch (error) {
      console.error('Error serializing range:', error);
      return null;
    }
  }

  private getTextNodeInfo(node: Node): { container: Element, textIndex: number } | null {
    let container: Element;
    let textIndex = 0;

    if (node.nodeType === Node.TEXT_NODE) {
      container = node.parentElement!;
      if (!container) return null;

      const textNodes = Array.from(container.childNodes).filter(n => n.nodeType === Node.TEXT_NODE);
      textIndex = textNodes.indexOf(node as Text);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      container = node as Element;
    } else {
      return null;
    }

    return { container, textIndex };
  }

  private getXPath(element: Element): string {
    if (element.id) {
      return `//*[@id="${element.id}"]`;
    }

    const paths: string[] = [];
    let current: Element | null = element;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let index = 1;
      let sibling = current.previousElementSibling;

      while (sibling) {
        if (sibling.nodeName === current.nodeName) index++;
        sibling = sibling.previousElementSibling;
      }

      const tagName = current.nodeName.toLowerCase();
      const pathIndex = `[${index}]`;
      paths.unshift(`${tagName}${pathIndex}`);

      current = current.parentElement;
      if (current === document.body) break;
    }

    return paths.length ? `//${paths.join('/')}` : '';
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

      const startElement = this.getElementByXPath(serialized.startXPath);
      const endElement = this.getElementByXPath(serialized.endXPath);

      if (!startElement || !endElement) {
        return this.fuzzyMatchRange(serialized);
      }

      const startTextNode = this.getTextNodeAtIndex(startElement, serialized.startTextIndex);
      const endTextNode = this.getTextNodeAtIndex(endElement, serialized.endTextIndex);

      if (!startTextNode || !endTextNode) {
        return this.fuzzyMatchRange(serialized);
      }

      const range = document.createRange();
      range.setStart(startTextNode, Math.min(serialized.startOffset, startTextNode.textContent?.length || 0));
      range.setEnd(endTextNode, Math.min(serialized.endOffset, endTextNode.textContent?.length || 0));

      return range;
    } catch (error) {
      console.error('Error deserializing range:', error);
      return null;
    }
  }

  private getTextNodeAtIndex(element: Element, index: number): Text | null {
    const textNodes = Array.from(element.childNodes).filter(n => n.nodeType === Node.TEXT_NODE);
    return textNodes[index] as Text || textNodes[0] as Text || null;
  }

  private fuzzyMatchRange(serialized: SerializedRange): Range | null {
    const searchText = serialized.text.toLowerCase().trim();
    if (!searchText) return null;

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (this.isHighlightElement(parent)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let node;
    while (node = walker.nextNode()) {
      const textNode = node as Text;
      const text = textNode.textContent?.toLowerCase() || '';
      const index = text.indexOf(searchText);

      if (index !== -1) {
        try {
          const range = document.createRange();
          range.setStart(textNode, index);
          range.setEnd(textNode, index + serialized.text.length);
          return range;
        } catch (e) {
          continue;
        }
      }
    }

    return null;
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
            const elements = this.applyHighlight(range, highlightData.color, highlightData.id);
            this.highlights.set(highlightData.id, highlightData);
            this.highlightElements.set(highlightData.id, elements);
            restoredCount++;
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
            const newElements = this.applyHighlight(range, highlightData.color, id);
            this.highlightElements.set(id, newElements);
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