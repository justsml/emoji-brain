#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

// Get current directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const EMOJIS_DIR = path.join(process.cwd(), 'public', 'emojis');
const OUTPUT_FILE = path.join(process.cwd(), 'src', 'data', 'emoji-metadata.json');

// Helper function to generate a unique ID
function generateId(filename) {
  return crypto.createHash('md5').update(filename).digest('hex').slice(0, 8);
}

// Helper function to extract categories and tags from filename
function extractMetadata(filename) {
  const name = path.parse(filename).name;
  const extension = path.parse(filename).ext.toLowerCase();
  const parts = name.split(/[-_\s]+/).filter(Boolean);
  
  // Initialize metadata
  const metadata = {
    categories: new Set(),
    tags: new Set()
  };

  // Add file type as a tag for special types
  if (extension === '.gif') {
    metadata.tags.add('animated');
  }

  // Process filename parts
  parts.forEach((part, index) => {
    // Common prefixes that indicate categories
    if (part === 'meow' || part === 'cat' || part === 'bongo') {
      metadata.categories.add(part);
    }
    // Emotional states often make good categories
    else if (['happy', 'sad', 'angry', 'crying', 'excited'].includes(part)) {
      metadata.categories.add('emotions');
      metadata.tags.add(part);
    }
    // Actions often make good tags
    else if (part.endsWith('ing')) {
      metadata.tags.add(part);
    }
    // Add remaining parts as tags
    else {
      metadata.tags.add(part);
    }
  });

  return {
    categories: [...metadata.categories],
    tags: [...metadata.tags]
  };
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
      
      // Extract metadata
      const { categories, tags } = extractMetadata(filename);
      
      return {
        id: generateId(filename),
        filename,
        path: `/emojis/${filename}`,
        categories,
        tags,
        created: stats.birthtime.toISOString(),
        size: stats.size
      };
    }));

    // Filter out null entries and sort by filename
    const validEmojis = emojis
      .filter(Boolean)
      .sort((a, b) => a.filename.localeCompare(b.filename));

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