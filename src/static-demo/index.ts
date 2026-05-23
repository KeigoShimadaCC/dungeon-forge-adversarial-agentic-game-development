export { buildStaticDemoBundle } from './build-bundle.js';
export {
  acceptanceEvidenceLabel,
  artifactEvidenceLabel,
  coverageEvidenceLabel,
} from './evidence-labels.js';
export {
  exportStaticDemoBundle,
  staticDemoLinkBaseForOutput,
  type ExportStaticDemoResult,
} from './export-bundle.js';
export { renderStaticDemoHtml, type RenderStaticDemoHtmlOptions } from './render-html.js';
export { renderStaticDemoMarkdown } from './render-markdown.js';
export {
  STATIC_DEMO_EXPORT_CLI_USAGE,
  parseStaticDemoExportCliArgs,
  runStaticDemoExportCli,
  type StaticDemoExportCliIo,
} from './static-demo-export-cli.js';
export type {
  StaticDemoBundle,
  StaticDemoComparisonEntry,
  StaticDemoEvidenceLabel,
  StaticDemoTimelineEntry,
} from './types.js';
