export interface EmojiMetadata {
  id: string
  filename: string
  path: string
  categories: string[]
  tags: string[]
  created: string
  size: number
  /** true when the source WebP has more than one frame */
  animated?: boolean
}