export interface HighlightData {
  id: string;
  text: string;
  url: string;
  timestamp: number;
  color: string;
  note?: string;
  range: {
    startContainer: string;
    startOffset: number;
    endContainer: string;
    endOffset: number;
    commonAncestor: string;
  };
}

export interface HighlightSettings {
  defaultColor: string;
  highlightOpacity: number;
  showNotes: boolean;
  syncEnabled: boolean;
}

export type HighlightColor =
  | 'yellow'
  | 'green'
  | 'blue'
  | 'pink'
  | 'orange'
  | 'purple';

export interface StorageData {
  highlights: HighlightData[];
  settings: HighlightSettings;
}