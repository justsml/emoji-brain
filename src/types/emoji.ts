export interface EmojiMetadata {
  id: string
  filename: string
  path: string
  categories: string[]
  tags: string[]
  aliases?: string[]
  hash?: string
  labelHash?: string
  modified?: string
  width?: number
  height?: number
  created?: string
  size: number
  /** true when the source WebP has more than one frame */
  animated?: boolean
  /**
   * Compressed bytes this image contributes to a Slack script, keyed by pixel
   * size. Joined from the delivery manifest at build time so the tray can price
   * an export without fetching the catalog.
   */
  gzip?: Record<string, number>
  /** Bytes of the full-resolution source, for pricing a ZIP of the originals. */
  originalBytes?: number
}
