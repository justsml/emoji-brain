#!/usr/bin/env node

import { exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execAsync = promisify(exec);

const EMOJIS_DIR = path.join(process.cwd(), 'public', 'emojis');

async function convertGifToWebp(gifPath: string, deleteOriginal: boolean): Promise<void> {
  const webpPath = gifPath.replace(/\.gif$/i, '.webp');
  
  try {
    await execAsync(`gif2webp -q 80 -m 9 -mt "${gifPath}" -o "${webpPath}"`);
    
    const originalStat = await fs.stat(gifPath);
    const convertedStat = await fs.stat(webpPath);
    const savings = ((1 - convertedStat.size / originalStat.size) * 100).toFixed(1);
    
    console.log(`✓ ${path.basename(gifPath)} → ${path.basename(webpPath)} (${savings}% smaller)`);
    
    if (deleteOriginal) {
      await fs.unlink(gifPath);
      console.log(`  🗑️  Deleted ${path.basename(gifPath)}`);
    }
  } catch (error) {
    console.error(`✗ Failed to convert ${path.basename(gifPath)}:`, error);
  }
}

async function main() {
  try {
    const keepOriginal = process.argv.includes('--keep') || process.argv.includes('-k');
    
    const files = await fs.readdir(EMOJIS_DIR);
    const gifFiles = files.filter(f => f.toLowerCase().endsWith('.gif'));
    
    if (gifFiles.length === 0) {
      console.log('No GIF files found to convert.');
      return;
    }
    
    if (keepOriginal) {
      console.log(`Found ${gifFiles.length} GIF files to convert (keeping originals)...\n`);
    } else {
      console.log(`Found ${gifFiles.length} GIF files to convert (will delete originals after conversion)...\n`);
      console.log('💡 Tip: Use --keep flag to retain original GIF files\n');
    }
    
    // Convert sequentially to avoid overwhelming the system
    for (const gif of gifFiles) {
      const gifPath = path.join(EMOJIS_DIR, gif);
      const webpPath = gifPath.replace(/\.gif$/i, '.webp');
      
      // Check if WebP already exists
      try {
        await fs.access(webpPath);
        if (!keepOriginal) {
          await fs.unlink(gifPath);
          console.log(`⊘ ${gif} (WebP exists, deleted GIF)`);
        } else {
          console.log(`⊘ ${gif} (WebP already exists, skipping)`);
        }
      } catch {
        await convertGifToWebp(gifPath, !keepOriginal);
      }
    }
    
    console.log('\n✨ Conversion complete!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
