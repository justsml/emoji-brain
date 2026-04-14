#!/usr/bin/env node

import { exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execAsync = promisify(exec);

const INGEST_DIR = path.join(process.cwd(), 'public', 'emojis', 'ingest');
const EMOJIS_DIR = path.join(process.cwd(), 'public', 'emojis');

interface IngestOptions {
  keepGifs: boolean;
  forceRegenerate: boolean;
}

async function runCommand(command: string, description: string): Promise<boolean> {
  console.log(`\n⏳ ${description}...`);
  try {
    await execAsync(command, { cwd: process.cwd() });
    return true;
  } catch (error) {
    console.error(`✗ ${description} failed:`, error);
    return false;
  }
}

async function moveFilesToEmojisDir(): Promise<number> {
  try {
    await fs.access(INGEST_DIR);
  } catch {
    console.log('No ingest directory found. Nothing to ingest.');
    return 0;
  }

  const files = await fs.readdir(INGEST_DIR);
  const imageFiles = files.filter(f => /\.(png|jpe?g|gif|webp)$/i.test(f));

  if (imageFiles.length === 0) {
    console.log('No image files found in ingest directory.');
    return 0;
  }

  console.log(`Found ${imageFiles.length} files to ingest...\n`);

  let moved = 0;
  for (const file of imageFiles) {
    const src = path.join(INGEST_DIR, file);
    const dst = path.join(EMOJIS_DIR, file);
    
    try {
      await fs.rename(src, dst);
      console.log(`✓ ${file}`);
      moved++;
    } catch (error) {
      console.error(`✗ Failed to move ${file}:`, error);
    }
  }

  return moved;
}

async function convertGifsToWebp(deleteOriginals: boolean): Promise<void> {
  const scriptPath = path.join(__dirname, 'convert-gifs-to-webp.ts');
  const args = deleteOriginals ? '' : ' --keep';
  await runCommand(`tsx ${scriptPath}${args}`, 'Converting GIFs to WebP');
}

async function generateMetadata(forceRegenerate: boolean): Promise<void> {
  const scriptPath = path.join(__dirname, 'generate_emoji_metadata.ts');
  const args = forceRegenerate ? ' --force' : '';
  await runCommand(`tsx ${scriptPath}${args}`, 'Generating emoji metadata');
}

async function createPagefindIndex(): Promise<void> {
  const scriptPath = path.join(__dirname, 'create-pagefind-index.ts');
  await runCommand(`tsx ${scriptPath}`, 'Creating Pagefind search index');
}



function printUsage() {
  console.log(`
Usage: tsx scripts/ingest.ts [options]

Options:
  --ingest-dir <path>  Directory to ingest files from (default: public/emojis/ingest)
  --keep-gifs          Keep original GIF files after conversion (default: delete)
  --force              Force regenerate all metadata with AI
  --help, -h           Show this help message

Examples:
  tsx scripts/ingest.ts
  tsx scripts/ingest.ts --keep-gifs
  tsx scripts/ingest.ts --force
`);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    return;
  }

  const options: IngestOptions = {
    keepGifs: args.includes('--keep-gifs'),
    forceRegenerate: args.includes('--force'),
  };

  console.log('🚀 Starting emoji ingestion pipeline...\n');

  // Step 1: Move files from ingest directory
  const movedCount = await moveFilesToEmojisDir();
  if (movedCount === 0) {
    return;
  }
  console.log(`\n✓ Moved ${movedCount} files to emojis directory`);

  // Step 2: Convert GIFs to WebP
  await convertGifsToWebp(!options.keepGifs);

  // Step 3: Generate metadata
  await generateMetadata(options.forceRegenerate);

  // Step 4: Create Pagefind search index
  await createPagefindIndex();

  console.log('\n✨ Ingestion complete!');
  console.log('\n💡 Don\'t forget to commit your changes:');
  console.log('   git add public/emojis/ src/data/emoji-metadata.json public/pagefind/\n');
}

main();
