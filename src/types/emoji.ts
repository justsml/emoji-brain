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
  created: string
  size: number
  /** true when the source WebP has more than one frame */
  animated?: boolean
}