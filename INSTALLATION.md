# Super Highlight Extension - Installation Guide

## 🚀 Quick Installation

### Method 1: Load Unpacked Extension (Recommended for Testing)

1. **Open Chrome Extensions Page**
   - Go to `chrome://extensions/` in your Chrome browser
   - Or click the three dots menu → More Tools → Extensions

2. **Enable Developer Mode**
   - Toggle on "Developer mode" in the top-right corner

3. **Load the Extension**
   - Click "Load unpacked" button
   - Navigate to this project folder and select the `dist/` directory
   - Click "Select Folder"

4. **Verify Installation**
   - You should see "Browser Highlighting Plugin" in your extensions list
   - The extension icon should appear in your Chrome toolbar

### Method 2: Package for Chrome Web Store

```bash
# Create a zip file for Chrome Web Store submission
cd dist
zip -r ../super-highlight-extension.zip .
```

## 🧪 Testing the Extension

### 1. Basic Text Highlighting
- Open any website (or use the provided `test-content-script.html`)
- Select any text on the page
- A color palette should appear above the selected text
- Click any color to highlight the text
- Or use **Ctrl+H** for quick yellow highlighting

### 2. Right-Click Context Menu
- Select text on any page
- Right-click to see "Highlight Selected Text" in the context menu
- Choose from submenu color options

### 3. Popup Interface
- Click the extension icon in the Chrome toolbar
- View highlights from the current page and all pages
- Search through your highlights
- Use the color palette for quick highlighting

### 4. Settings & Options
- Click the gear icon (⚙️) in the popup
- Or right-click the extension icon → Options
- Customize default colors, export/import data, view statistics

### 5. Highlight Management
- Click on any existing highlight to see options (delete, copy)
- Highlights persist across page reloads
- Data is stored locally in Chrome storage

## 🔧 Troubleshooting

### Common Issues:

1. **Extension not loading:**
   - Make sure you selected the `dist/` folder, not the root project folder
   - Check that all files are present in `dist/`

2. **Highlighting not working:**
   - Refresh the page after loading the extension
   - Check browser console for any errors
   - Ensure the extension has proper permissions

3. **Popup not opening:**
   - Check if popup.html and popup.js are in the dist folder
   - Try disabling and re-enabling the extension

4. **Context menu missing:**
   - Right-click the extension icon and ensure it's enabled
   - Check that contextMenus permission is granted

## 📁 Extension Structure

```
dist/
├── manifest.json          # Extension configuration
├── background.js          # Service worker
├── content.js/.css        # Content script and styles
├── popup.html/.js/.css    # Popup interface
├── options.html/.js/.css  # Options page
├── storage.js             # Storage utilities
└── assets/                # Icons and images
```

## 🎯 Features Overview

- ✅ **Text Selection Highlighting** - Multiple colors available
- ✅ **Keyboard Shortcut** - Ctrl+H for quick highlighting
- ✅ **Right-Click Context Menu** - Easy access to highlight options
- ✅ **Popup Management** - View and organize all highlights
- ✅ **Settings Page** - Customize colors, export/import data
- ✅ **Data Persistence** - Highlights saved across browser sessions
- ✅ **Cross-Page Search** - Find highlights across all websites

## 🛠️ Development

To make changes and rebuild:

```bash
# Install dependencies (if not done already)
npm install

# Development build
npm run build

# Production build
npm run build:prod

# Lint code
npm run lint
```

## 📝 Notes

- The extension works on all websites with appropriate permissions
- Data is stored locally and not synced to cloud (privacy-focused)
- No external dependencies or tracking
- Built with React + TypeScript for maintainability