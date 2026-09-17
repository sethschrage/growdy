import DOMPurify from 'dompurify'

// One sanitize call, shared by every place that renders a chat-generated
// svg (SvgGraphic's inline/expanded chat copy, PublicArtifactView's
// signed-out page, ArtifactsView's saved list) -- not one DOMPurify call
// per caller that could quietly drift onto a different, less safe
// profile. See docs/decisions/0021, 0027.
export function sanitizeSvg(content: string): string {
  return DOMPurify.sanitize(content, { USE_PROFILES: { svg: true, svgFilters: true } }).trim()
}
