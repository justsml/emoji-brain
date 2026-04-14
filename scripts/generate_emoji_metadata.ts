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

// Load existing metadata to preserve labels across runs
async function loadExistingMetadata(): Promise<Map<string, { categories: string[]; tags: string[] }>> {
  const existing = new Map<string, { categories: string[]; tags: string[] }>();
  try {
    const content = await fs.readFile(OUTPUT_FILE, 'utf8');
    const data = JSON.parse(content);
    for (const emoji of data.emojis || []) {
      if (emoji.filename && (emoji.categories?.length || emoji.tags?.length)) {
        existing.set(emoji.filename, {
          categories: emoji.categories || [],
          tags: emoji.tags || [],
        });
      }
    }
  } catch {
    // File doesn't exist yet, return empty map
  }
  return existing;
}

// Helper function to extract categories and tags from filename
async function extractMetadata(filename: string, existingMetadata: Map<string, { categories: string[]; tags: string[] }>, forceRegenerate = false) {
  const name = path.parse(filename).name;
  
  // Check if we have existing metadata for this file
  const existing = existingMetadata.get(filename);
  
  // If existing metadata has labels and we're not forcing regeneration, reuse them
  if (!forceRegenerate && existing && (existing.categories.length > 0 || existing.tags.length > 0)) {
    return existing;
  }
  
  const labels = await emojiLabeler(join(EMOJIS_DIR, filename)).catch((error) => {
    console.error(`Error labeling emoji ${filename}:`, error);
    return {};
  });

  if (typeof labels === 'string') {
    try {
      const parsedLabels = JSON.parse(labels);
      return parsedLabels;
    } catch (error) {
      console.error(`Error parsing labels for ${filename}:`, error);
      console.error(`Received labels: ${labels}`);
      // Return existing metadata if parsing fails
      return existing || { categories: [], tags: [] };
    }
  }

  // Return existing metadata if AI didn't generate new labels
  return existing || {
    categories: [],
    tags: [],
  };
}

async function generateEmojiMetadata() {
  try {
    // Ensure output directory exists
    await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });

    // Check for --force flag to regenerate all labels
    const forceRegenerate = process.argv.includes('--force') || process.argv.includes('-f');
    
    // Load existing metadata to preserve labels across runs
    const existingMetadata = await loadExistingMetadata();
    
    if (forceRegenerate) {
      console.log(`⚠️  Force regeneration mode - all labels will be regenerated`);
    } else {
      console.log(`📦 Loaded existing metadata for ${existingMetadata.size} emojis`);
    }

    // Read emoji directory
    const files = await fs.readdir(EMOJIS_DIR);
    
    // Process each emoji file
    const emojis = await Promise.all(files.map(async (filename) => {
      const stats = await fs.stat(path.join(EMOJIS_DIR, filename));
      
      // Skip if not a file
      if (!stats.isFile()) return null;
      
      try {
        // Extract metadata (passing existing metadata for consistency)
        const { categories, tags } = await extractMetadata(filename, existingMetadata, forceRegenerate);
        
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

    // Count how many had existing labels preserved
    const preservedCount = validEmojis.filter(
      (e) => e?.categories?.length || e?.tags?.length
    ).length;

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
    if (!forceRegenerate) {
      console.log(`💾 Preserved labels for ${preservedCount} emojis (consistent with previous runs)`);
    }
    console.log(`📝 Metadata saved to: ${OUTPUT_FILE}`);
    console.log(`\n💡 Tip: Use --force flag to regenerate all labels with the AI`);

  } catch (error) {
    console.error('Error generating emoji metadata:', error);
    process.exit(1);
  }
}

// Run the script
generateEmojiMetadata();