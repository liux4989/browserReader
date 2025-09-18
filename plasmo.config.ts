import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  all_frames: false
}

export const manifest = {
  manifest_version: 3,
  name: "Super highlight",
  version: "0.0.1",
  description: "A highlight tool for web pages and PDFs",
  author: "liux4989",
  permissions: [
    "contextMenus",
    "storage", 
    "activeTab"
  ],
  host_permissions: [
    "https://*/*"
  ],
  action: {
    default_popup: "popup.html",
    default_title: "Super highlight"
  },
  options_page: "options.html"
}

export default config
