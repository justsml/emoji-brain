import type {APIRoute} from 'astro';
import emojiMetadata from '../data/emoji-metadata.json';
import {placeholderAtlas} from '../lib/placeholderAtlas.server';

export const GET: APIRoute = async () => {
  const {bytes} = await placeholderAtlas(emojiMetadata.emojis.map(emoji => emoji.filename));
  return new Response(bytes, {headers: {'Content-Type': 'image/webp'}});
};
