# Super Highlight - MVP Architecture

## Project Structure

```
src/
├── background/          # Extension background script
│   └── index.ts        # Service worker & context menus
├── content/            # Content scripts (injected into web pages)
│   ├── content.ts      # Main highlighting logic & UI interaction
│   └── InlinePopup.ts  # Color selection popup component
├── styles/             # CSS stylesheets
│   ├── popup.css       # Extension popup styles
│   └── options.css     # Options page styles
└── utils/              # Shared utilities
    ├── storage.ts      # Chrome storage management
    └── types.ts        # TypeScript type definitions
```

## Core Components

### Background Script (`background/index.ts`)
- **Purpose**: Service worker for Chrome extension lifecycle
- **Responsibilities**:
  - Context menu creation and handling
  - Storage operations (save/load/sync highlights)
  - Message passing between components
  - Extension settings management

### Content Script (`content/content.ts`)
- **Purpose**: Main highlighting functionality injected into web pages
- **Key Features**:
  - Text selection detection and validation
  - Highlight creation with color selection
  - Persistent highlight restoration on page load
  - Smart word boundary completion
  - XPath-based range serialization for persistence
  - DOM mutation monitoring for dynamic content

### Inline Popup (`content/InlinePopup.ts`)
- **Purpose**: Color selection interface shown near text selection
- **Features**:
  - 6-color palette (yellow, green, blue, pink, orange, purple)
  - Positioned dynamically near text selection
  - Handles both new highlights and existing highlight modification

## Storage Architecture

### Data Structure
```typescript
interface HighlightData {
  id: string;              // Unique identifier
  text: string;            // Selected text content
  url: string;             // Page URL
  timestamp: number;       // Creation timestamp
  color: string;           // Highlight color
  range: SerializedRange;  // XPath-based range data
}
```

### Storage Strategy
- **Chrome Storage API**: Cross-device sync capability
- **XPath Serialization**: Element location persistence across page reloads
- **Text Search Fallback**: Handles dynamic content changes
- **Range Validation**: Ensures highlight integrity on restoration

## User Interaction Flow

### Creating Highlights
1. User selects text on webpage
2. `content.ts` detects selection via `mouseup` event
3. `InlinePopup` appears near selection
4. User chooses color → highlight created
5. Range serialized and stored via `background/index.ts`

### Managing Highlights
- **Ctrl+Click**: Delete highlight
- **Shift+Click**: Change color to next in sequence
- **Context Menu**: Right-click options via background script
- **Extension Popup**: View/manage all highlights (future feature)

## MVP Features

### ✅ Core Functionality
- Text selection and highlighting
- 6-color palette system
- Persistent storage across sessions
- Smart word boundary completion
- Highlight deletion and color modification
- Context menu integration

### 🔄 Future Enhancements (Post-MVP)
- Extension popup for highlight management
- Options page for customization
- Export/import functionality
- Note-taking on highlights
- Search within highlights
- PDF support optimization

## Build & Deployment

- **Framework**: Plasmo (Manifest V3)
- **Build**: `npm run build` → generates `build/chrome-mv3-prod`
- **Development**: `npm run dev` for hot reload
- **Package**: `npm run package` for distribution

## Performance Considerations

- **DOM Queries**: Minimized through smart caching
- **Event Delegation**: Efficient highlight interaction handling
- **Debounced Restoration**: Handles dynamic content gracefully
- **Range Validation**: Prevents broken highlights
- **Memory Management**: Cleanup on navigation/unload