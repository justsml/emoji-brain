import type {APIRoute} from 'astro';
import emojiMetadata from '../data/emoji-metadata.json';
import {catalogFilenames, placeholderAtlas} from '../lib/placeholderAtlas.server';

export const GET: APIRoute = async () => {
  const {bytes} = await placeholderAtlas(catalogFilenames(emojiMetadata.emojis));
  return new Response(bytes, {headers: {'Content-Type': 'image/webp'}});
};
