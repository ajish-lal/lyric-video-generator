export interface TranscriptSegment {
  text: string;
  start: number;
  end: number;
  words?: Array<{ text: string; start: number; end: number }>;
}

export interface AudioTranscriber {
  transcribe(audioPath: string): Promise<TranscriptSegment[]>;
}
