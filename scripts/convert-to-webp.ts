#!/usr/bin/env node

import { exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execAsync = promisify(exec);

const EMOJIS_DIR = path.join(process.cwd(), 'public', 'emojis');

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.webp'];

async function convertWithSharp(imagePath: string, webpPath: string): Promise<void> {
  await sharp(imagePath)
    .webp({ quality: 80, effort: 6 })
    .toFile(webpPath);
}

async function convertWithGif2Webp(imagePath: string, webpPath: string): Promise<void> {
  await execAsync(`gif2webp -q 90 -mt "${imagePath}" -o "${webpPath}"`);
}

async function isAnimatedGif(imagePath: string): Promise<boolean> {
  try {
    const metadata = await sharp(imagePath).metadata();
    return metadata.pages !== undefined && metadata.pages > 1;
  } catch {
    return false;
  }
}

async function convertImageToWebp(imagePath: string, deleteOriginal: boolean): Promise<void> {
  const ext = path.extname(imagePath).toLowerCase();
  const webpPath = imagePath.replace(/\.[^.]+$/i, '.webp');
  const basename = path.basename(imagePath);
  const webpBasename = path.basename(webpPath);

  // Skip if already WebP
  if (ext === '.webp') {
    return;
  }

  try {
    // Use gif2webp for animated GIFs, sharp for everything else
    if (ext === '.gif') {
      const isAnimated = await isAnimatedGif(imagePath);
      if (isAnimated) {
        console.log(`  🎬 Detected animated GIF: ${basename}`);
        await convertWithGif2Webp(imagePath, webpPath);
      } else {
        await convertWithSharp(imagePath, webpPath);
      }
    } else {
      await convertWithSharp(imagePath, webpPath);
    }

    const originalStat = await fs.stat(imagePath);
    const convertedStat = await fs.stat(webpPath);
    const savings = ((1 - convertedStat.size / originalStat.size) * 100).toFixed(1);

    console.log(`✓ ${basename} → ${webpBasename} (${savings}% smaller)`);

    if (deleteOriginal) {
      await fs.unlink(imagePath);
      console.log(`  🗑️  Deleted ${basename}`);
    }
  } catch (error) {
    console.error(`✗ Failed to convert ${basename}:`, error);
  }
}

async function cleanupOrphanedFiles(deleteOriginals: boolean): Promise<void> {
  const files = await fs.readdir(EMOJIS_DIR);
  const webpFiles = new Set(files.filter(f => f.toLowerCase().endsWith('.webp')).map(f => f.replace(/\.[^.]+$/i, '')));
  
  const orphanedFiles = files.filter(f => {
    const ext = path.extname(f).toLowerCase();
    if (!IMAGE_EXTENSIONS.includes(ext) || ext === '.webp') return false;
    
    const baseName = f.replace(/\.[^.]+$/i, '');
    return webpFiles.has(baseName);
  });

  if (orphanedFiles.length === 0) {
    return;
  }

  console.log(`\n🧹 Found ${orphanedFiles.length} orphaned files (WebP already exists)...`);

  for (const file of orphanedFiles) {
    const filePath = path.join(EMOJIS_DIR, file);
    if (deleteOriginals) {
      await fs.unlink(filePath);
      console.log(`  🗑️  Deleted ${file}`);
    } else {
      console.log(`  ⊘ Skipped ${file} (use default mode to delete)`);
    }
  }
}

async function main() {
  try {
    const keepOriginal = process.argv.includes('--keep') || process.argv.includes('-k');
    
    const files = await fs.readdir(EMOJIS_DIR);
    const imageFiles = files.filter(f => {
      const ext = path.extname(f).toLowerCase();
      return IMAGE_EXTENSIONS.includes(ext) && ext !== '.webp';
    });

    if (imageFiles.length === 0) {
      console.log('No image files found to convert.');
      return;
    }

    if (keepOriginal) {
      console.log(`Found ${imageFiles.length} images to convert (keeping originals)...\n`);
    } else {
      console.log(`Found ${imageFiles.length} images to convert (will delete originals after conversion)...\n`);
      console.log('💡 Tip: Use --keep flag to retain original image files\n');
    }

    // Convert sequentially to avoid overwhelming the system
    for (const image of imageFiles) {
      const imagePath = path.join(EMOJIS_DIR, image);
      const webpPath = imagePath.replace(/\.[^.]+$/i, '.webp');

      // Check if WebP already exists
      try {
        await fs.access(webpPath);
        if (!keepOriginal) {
          await fs.unlink(imagePath);
          console.log(`⊘ ${image} (WebP exists, deleted original)`);
        } else {
          console.log(`⊘ ${image} (WebP already exists, skipping)`);
        }
      } catch {
        await convertImageToWebp(imagePath, !keepOriginal);
      }
    }

    // Cleanup any orphaned files from previous runs
    await cleanupOrphanedFiles(!keepOriginal);

    console.log('\n✨ Conversion complete!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
