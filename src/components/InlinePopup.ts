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
  }

  private injectStyles(): void {
    const style = document.createElement('style');
    style.id = 'inline-popup-styles';
    style.textContent = `
      .inline-highlight-popup {
        position: absolute;
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
        transform: scale(0.9);
        pointer-events: none;
      }

      .inline-highlight-popup.visible {
        opacity: 1;
        transform: scale(1);
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
      }

      .inline-color-btn:hover {
        border-color: #333;
        transform: scale(1.1);
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

      .inline-popup-arrow {
        position: absolute;
        bottom: -6px;
        left: 50%;
        transform: translateX(-50%) rotate(-45deg);
        width: 12px;
        height: 6px;
        background: white;
        border-left: 1px solid #e0e0e0;
        border-bottom: 1px solid #e0e0e0;
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
      }

      .inline-delete-btn:hover {
        background: #ff0000;
        border-color: #ff0000;
        transform: scale(1.1);
      }

      .inline-delete-btn:active {
        transform: scale(0.95);
      }

      .inline-popup-separator {
        width: 1px;
        height: 24px;
        background: #e0e0e0;
        margin: 4px 2px;
      }
    `;

    if (!document.getElementById('inline-popup-styles')) {
      document.head.appendChild(style);
    }
  }

  public show(selection: Selection, onColorSelect: (color: HighlightColor) => void, onDelete?: () => void): void {
    this.hide();

    if (!selection.rangeCount || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    if (rect.width === 0 && rect.height === 0) return;

    this.popup = document.createElement('div');
    this.popup.className = 'inline-highlight-popup';

    // Add arrow
    const arrow = document.createElement('div');
    arrow.className = 'inline-popup-arrow';
    this.popup.appendChild(arrow);

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

    // Position the popup
    this.positionPopup(rect);

    // Show with animation
    requestAnimationFrame(() => {
      this.popup?.classList.add('visible');
    });

    // Auto-hide after 10 seconds of inactivity
    setTimeout(() => {
      if (this.popup && !this.popup.matches(':hover')) {
        this.hide();
      }
    }, 10000);
  }

  private positionPopup(selectionRect: DOMRect): void {
    if (!this.popup) return;

    const popupRect = this.popup.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    // Calculate ideal position (above the selection, centered)
    let left = selectionRect.left + selectionRect.width / 2 - popupRect.width / 2;
    let top = selectionRect.top - popupRect.height - 10;

    // Adjust horizontal position if popup goes outside viewport
    if (left < 10) {
      left = 10;
    } else if (left + popupRect.width > viewportWidth - 10) {
      left = viewportWidth - popupRect.width - 10;
    }

    // If popup would go above viewport, position it below the selection
    if (top < 10) {
      top = selectionRect.bottom + 10;
      // Flip arrow direction for bottom positioning
      const arrow = this.popup.querySelector('.inline-popup-arrow') as HTMLElement;
      if (arrow) {
        arrow.style.bottom = 'auto';
        arrow.style.top = '-6px';
        arrow.style.transform = 'translateX(-50%) rotate(135deg)';
      }
    }

    this.popup.style.left = `${left + scrollX}px`;
    this.popup.style.top = `${top + scrollY}px`;
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