/**
 * Phase 9α — Barrel re-export so the renderer's switch imports stay tidy.
 * Implementations live in the *BlockViews.tsx files.
 */
export { VideoBlockView, AudioBlockView, PdfBlockView } from './MediaBlockViews';
export { RichTextBlockView, ReflectionBlockView, CheckInBlockView } from './TextBlockViews';
export { QuizBlockView, WorksheetBlockView } from './StructuredBlockViews';
