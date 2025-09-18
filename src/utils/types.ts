export interface SerializedRange {
  startXPath: string;
  startOffset: number;
  startTextIndex: number;
  endXPath: string;
  endOffset: number;
  endTextIndex: number;
  text: string;
}

export interface HighlightData {
  id: string;
  text: string;
  url: string;
  timestamp: number;
  color: string;
  note?: string;
  range: SerializedRange;
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