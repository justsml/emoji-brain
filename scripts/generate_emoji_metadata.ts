#!/usr/bin/env node

import { promises as fs } from 'fs';
import path, { join } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { emojiLabeler } from './emoji-labeler';

// Get current directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const EMOJIS_DIR = path.join(process.cwd(), 'public', 'emojis');
const OUTPUT_FILE = path.join(process.cwd(), 'src', 'data', 'emoji-metadata.json');

// Helper function to generate a unique ID
function generateId(filename: string) {
  return crypto.createHash('md5').update(filename).digest('hex').slice(0, 8);
}

// Helper function to extract categories and tags from filename
async function extractMetadata(filename: string) {
  const name = path.parse(filename).name;
  // const extension = path.parse(filename).ext.toLowerCase();
  // const parts = name.split(/[-_\s]+/).filter(Boolean);
  

  const labels = await emojiLabeler(join(EMOJIS_DIR, filename)).catch((error) => {
    console.error(`Error labeling emoji ${filename}:`, error);
    process.exit(1);
    return {};
  });

  if (typeof labels === 'string') {
    try {
      const parsedLabels = JSON.parse(labels);
      return parsedLabels;
    } catch (error) {
      console.error(`Error parsing labels for ${filename}:`, error);
      console.error(`Received labels: ${labels}`);
      process.exit(1);
    }
  } else if (labels && typeof labels === 'object') {
    return labels;
  }

  return {
    categories: [],
    tags: [],
  }
  // return {
  //   categories: [...metadata.categories],
  //   tags: [...metadata.tags]
  // };
}

async function generateEmojiMetadata() {
  try {
    // Ensure output directory exists
    await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });

    // Read emoji directory
    const files = await fs.readdir(EMOJIS_DIR);
    
    // Process each emoji file
    const emojis = await Promise.all(files.map(async (filename) => {
      const stats = await fs.stat(path.join(EMOJIS_DIR, filename));
      
      // Skip if not a file
      if (!stats.isFile()) return null;
      
      try {
        // Extract metadata
        const { categories, tags } = await extractMetadata(filename);
        
        return {
          id: generateId(filename),
          filename,
          path: `/emojis/${filename}`,
          categories,
          tags,
          created: stats.birthtime.toISOString(),
          size: stats.size
        };
      } catch (error) {
        console.error(`\n❌ Failed to process metadata for: ${filename}`);
        console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
        // Optionally log the full error: console.error(error);
        return null; // Skip this emoji if metadata extraction fails
      }
    }));

    // Filter out null entries and sort by filename
    const validEmojis = emojis
      .filter(Boolean)
      .sort((a, b) => a?.filename?.localeCompare(b!.filename) ?? 0);

    // Create final metadata object
    const metadata = {
      total: validEmojis.length,
      lastUpdated: new Date().toISOString(),
      emojis: validEmojis
    };

    // Write metadata to file
    await fs.writeFile(
      OUTPUT_FILE,
      JSON.stringify(metadata, null, 2),
      'utf8'
    );

    console.log(`✨ Generated metadata for ${validEmojis.length} emojis`);
    console.log(`📝 Metadata saved to: ${OUTPUT_FILE}`);

  } catch (error) {
    console.error('Error generating emoji metadata:', error);
    process.exit(1);
  }
}

// Run the script
generateEmojiMetadata();