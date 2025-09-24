import { type HighlightColor } from '../utils/types';

export class InlinePopup {
  private popup: HTMLElement | null = null;
  private colors: HighlightColor[] = ['yellow', 'green', 'blue', 'pink', 'orange', 'purple'];
  private colorMap = {
    yellow: 'rgba(255, 235, 59, 0.4)',
    green: 'rgba(76, 175, 80, 0.4)',
    blue: 'rgba(33, 150, 243, 0.4)',
    pink: 'rgba(233, 30, 99, 0.4)',
    orange: 'rgba(255, 152, 0, 0.4)',
    purple: 'rgba(156, 39, 176, 0.4)'
  };

  constructor() {
    this.injectStyles();
    this.setupGlobalClickHandler();
  }

  private injectStyles(): void {
    const style = document.createElement('style');
    style.id = 'inline-popup-styles';
    style.textContent = `
      .inline-highlight-popup {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: white;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        padding: 8px;
        z-index: 10001;
        display: flex;
        gap: 4px;
        transition: opacity 0.2s ease, transform 0.2s ease;
        opacity: 0;
        transform: translateX(-50%) translateY(20px);
        pointer-events: none;
        max-width: calc(100vw - 40px);
        overflow-x: auto;
      }

      .inline-highlight-popup.visible {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
        pointer-events: auto;
      }

      .inline-color-btn {
        width: 32px;
        height: 32px;
        border: 2px solid transparent;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s ease;
        position: relative;
        background: none;
        padding: 0;
        flex-shrink: 0;
      }


      .inline-color-btn:active {
        transform: scale(0.95);
      }

      .inline-color-btn::before {
        content: '';
        position: absolute;
        top: 2px;
        left: 2px;
        right: 2px;
        bottom: 2px;
        border-radius: 4px;
        background-color: var(--color);
      }

      .inline-delete-btn {
        width: 32px;
        height: 32px;
        border: 2px solid #ff4444;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s ease;
        background: #ff4444;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        font-weight: bold;
        padding: 0;
        flex-shrink: 0;
      }


      .inline-delete-btn:active {
        transform: scale(0.95);
      }

      .inline-popup-separator {
        width: 1px;
        height: 24px;
        background: #e0e0e0;
        margin: 4px 2px;
        flex-shrink: 0;
      }
    `;

    if (!document.getElementById('inline-popup-styles')) {
      document.head.appendChild(style);
    }
  }

  private setupGlobalClickHandler(): void {
    document.addEventListener('click', (event) => {
      if (this.popup && !this.popup.contains(event.target as Node)) {
        this.hide();
      }
    });
  }

  public show(selection: Selection, onColorSelect: (color: HighlightColor) => void, onDelete?: () => void): void {
    this.hide();

    if (!selection.rangeCount || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    if (rect.width === 0 && rect.height === 0) return;

    this.popup = document.createElement('div');
    this.popup.className = 'inline-highlight-popup';

    // No arrow needed for docked bottom positioning

    // Add color buttons
    this.colors.forEach(color => {
      const button = document.createElement('button');
      button.className = 'inline-color-btn';
      button.style.setProperty('--color', this.colorMap[color]);
      button.title = `Highlight with ${color}`;

      button.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Add a small delay to ensure the stored range is still valid
        setTimeout(() => {
          onColorSelect(color);
          this.hide();
        }, 10);
      });

      this.popup!.appendChild(button);
    });

    // Add delete button if onDelete callback is provided (for existing highlights)
    if (onDelete) {
      // Add separator
      const separator = document.createElement('div');
      separator.className = 'inline-popup-separator';
      this.popup.appendChild(separator);

      // Add delete button
      const deleteButton = document.createElement('button');
      deleteButton.className = 'inline-delete-btn';
      deleteButton.innerHTML = '×';
      deleteButton.title = 'Delete highlight';

      deleteButton.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      deleteButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onDelete();
        this.hide();
      });

      this.popup.appendChild(deleteButton);
    }

    document.body.appendChild(this.popup);

    // Show with animation
    requestAnimationFrame(() => {
      this.popup?.classList.add('visible');
    });

  }


  public hide(): void {
    if (this.popup) {
      this.popup.remove();
      this.popup = null;
    }
  }

  public isVisible(): boolean {
    return this.popup !== null && document.body.contains(this.popup);
  }
}