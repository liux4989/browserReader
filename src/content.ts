console.log('Content script loaded!');

// Simple test to see if content script is working
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, content script is active');
});

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message);
  
  if (message.type === 'CREATE_HIGHLIGHT') {
    console.log('Creating highlight with color:', message.color);
    
    // Get current selection
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) {
      console.log('Selected text:', selection.toString());
      
    // Create a simple highlight using a more robust method
    const range = selection.getRangeAt(0);
    const span = document.createElement('span');
    
    // Set color based on message.color
    const colors = {
      yellow: '#ffff0080',
      green: '#00ff0080',
      blue: '#0099ff80',
      pink: '#ff69b480',
      orange: '#ff8c0080',
      purple: '#9966cc80'
    };
    
    span.style.backgroundColor = colors[message.color] || colors.yellow;
    span.style.padding = '2px';
    span.style.borderRadius = '2px';
    
    try {
      // Extract the contents and wrap them
      const contents = range.extractContents();
      span.appendChild(contents);
      range.insertNode(span);
      
      console.log('Highlight created successfully');
      sendResponse({ success: true });
    } catch (error) {
      console.error('Error creating highlight:', error);
      
      // Fallback: try to highlight each text node individually
      try {
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
            const highlightSpan = document.createElement('span');
            highlightSpan.style.backgroundColor = colors[message.color] || colors.yellow;
            highlightSpan.style.padding = '2px';
            highlightSpan.style.borderRadius = '2px';
            highlightSpan.textContent = textNode.textContent;
            parent.replaceChild(highlightSpan, textNode);
          }
        });
        
        console.log('Highlight created using fallback method');
        sendResponse({ success: true });
      } catch (fallbackError) {
        console.error('Fallback method also failed:', fallbackError);
        sendResponse({ success: false, error: 'Could not create highlight' });
      }
    }
    } else {
      console.log('No text selected');
      sendResponse({ success: false, error: 'No text selected' });
    }
  }
  
  return true; // Keep message channel open for async response
});
