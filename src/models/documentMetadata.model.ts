export interface DocumentMetadata {
  source: string;
  doc_id: string;
  company: string;
  language: string;
  doc_type: string;
  filename?: string;
  title?: string;
  created_at?: string;

  [key: string]: unknown;
}