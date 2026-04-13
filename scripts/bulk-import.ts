#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createHash } from 'crypto';

interface ImportOptions {
  sourceDir: string;
  destDir: string;
  normalizeNames: boolean;
  dedupe: boolean;
  trimNumbers: boolean;
  dryRun: boolean;
}

interface ImportResult {
  imported: number;
  skipped: number;
  duplicates: number;
  renamed: number;
  errors: Array<{ file: string; error: string }>;
}

function calculateFileHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function normalizeFilename(filename: string): string {
  const parsed = path.parse(filename);
  let name = parsed.name;
  const ext = parsed.ext.toLowerCase();
  
  name = name.toLowerCase();
  name = name.replace(/^[0-9]+[-_\s]+/, '');
  name = name.replace(/[-_]+$/, '');
  name = name.replace(/^[-_]+/, '');
  name = name.replace(/_/g, '-');
  name = name.replace(/[-_]+/g, '-');
  name = name.replace(/[^a-z0-9-]/g, '');
  name = name.replace(/-+/g, '-');
  name = name.trim();
  
  if (!name) {
    name = 'emoji';
  }
  
  return name + ext;
}

function trimNumberedNames(filename: string): string {
  const parsed = path.parse(filename);
  let name = parsed.name;
  const ext = parsed.ext;
  
  name = name.replace(/[-_\s][1-3]$/, '');
  
  if (!name) {
    name = 'emoji';
  }
  
  return name + ext;
}

async function ensureDirectory(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function bulkImport(options: ImportOptions): Promise<ImportResult> {
  const result: ImportResult = {
    imported: 0,
    skipped: 0,
    duplicates: 0,
    renamed: 0,
    errors: [],
  };

  const fileHashes = new Map<string, string>();
  
  await ensureDirectory(options.destDir);

  let files: string[];
  try {
    files = await fs.readdir(options.sourceDir);
  } catch (error) {
    console.error(`Error reading source directory: ${options.sourceDir}`);
    console.error(error);
    return result;
  }

  const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
  files = files.filter(f => imageExtensions.includes(path.extname(f).toLowerCase()));

  console.log(`Found ${files.length} image files to process\n`);

  for (const file of files) {
    const sourcePath = path.join(options.sourceDir, file);
    
    let destFilename = file;
    let originalFilename = file;
    
    try {
      const content = await fs.readFile(sourcePath);
      const hash = calculateFileHash(content);
      
      if (options.dedupe) {
        if (fileHashes.has(hash)) {
          console.log(`⏭️  Skipped duplicate: ${file} (duplicate of ${fileHashes.get(hash)})`);
          result.duplicates++;
          result.skipped++;
          continue;
        }
        fileHashes.set(hash, destFilename);
      }
      
      if (options.trimNumbers) {
        destFilename = trimNumberedNames(destFilename);
      }
      
      if (options.normalizeNames) {
        destFilename = normalizeFilename(destFilename);
      }
      
      if (destFilename !== originalFilename) {
        result.renamed++;
        console.log(`✏️  ${originalFilename} → ${destFilename}`);
      }
      
      let finalDestFilename = destFilename;
      let counter = 1;
      const parsed = path.parse(destFilename);
      
      while (await fs.access(path.join(options.destDir, finalDestFilename)).then(() => true).catch(() => false)) {
        const existingContent = await fs.readFile(path.join(options.destDir, finalDestFilename));
        if (calculateFileHash(existingContent) === hash) {
          console.log(`⏭️  Skipped duplicate (existing file): ${file}`);
          result.duplicates++;
          result.skipped++;
          break;
        }
        finalDestFilename = `${parsed.name}-${counter}${parsed.ext}`;
        counter++;
      }
      
      if (options.dryRun) {
        console.log(`📦 Would import: ${file} → ${finalDestFilename}`);
        result.imported++;
      } else {
        const destPath = path.join(options.destDir, finalDestFilename);
        await fs.copyFile(sourcePath, destPath);
        console.log(`✅ Imported: ${file} → ${finalDestFilename}`);
        result.imported++;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push({ file, error: errorMessage });
      console.error(`❌ Error processing ${file}: ${errorMessage}`);
    }
  }

  return result;
}

function printSummary(result: ImportResult, dryRun: boolean): void {
  console.log('\n' + '='.repeat(50));
  console.log(`📊 Import ${dryRun ? 'Preview' : 'Summary'}`);
  console.log('='.repeat(50));
  console.log(`✅ ${dryRun ? 'Would import' : 'Imported'}: ${result.imported} files`);
  console.log(`✏️  Renamed: ${result.renamed} files`);
  console.log(`⏭️  Skipped duplicates: ${result.duplicates} files`);
  console.log(`❌ Errors: ${result.errors.length} files`);
  
  if (result.errors.length > 0) {
    console.log('\n⚠️  Failed files:');
    result.errors.forEach(({ file, error }) => {
      console.log(`   - ${file}: ${error}`);
    });
  }
}

function printUsage(): void {
  console.log(`
Usage: bun run scripts/bulk-import.ts [options] <source-folder>

Options:
  --dest, -d <folder>    Destination folder (default: public/emojis)
  --normalize, -n        Normalize filenames (lowercase, remove special chars)
  --dedupe, -D           Remove duplicate files (by content hash)
  --trim-numbers, -t     Trim leading numbers from filenames
  --dry-run, --dry       Preview without copying files
  --help, -h             Show this help message

Examples:
  bun run scripts/bulk-import.ts ~/Downloads/emoji-pack
  bun run scripts/bulk-import.ts -n -D -t ~/Downloads/emoji-pack
  bun run scripts/bulk-import.ts --normalize --dedupe --dry-run ./my-emojis
  bun run scripts/bulk-import.ts -d public/emojis/custom -n ./new-emojis
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    printUsage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const options: ImportOptions = {
    sourceDir: '',
    destDir: path.join(process.cwd(), 'public', 'emojis'),
    normalizeNames: false,
    dedupe: false,
    trimNumbers: false,
    dryRun: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    
    if (arg === '--dest' || arg === '-d') {
      options.destDir = path.isAbsolute(args[i + 1]) 
        ? args[i + 1] 
        : path.join(process.cwd(), args[i + 1]);
      i += 2;
    } else if (arg === '--normalize' || arg === '-n') {
      options.normalizeNames = true;
      i++;
    } else if (arg === '--dedupe' || arg === '-D') {
      options.dedupe = true;
      i++;
    } else if (arg === '--trim-numbers' || arg === '-t') {
      options.trimNumbers = true;
      i++;
    } else if (arg === '--dry-run' || arg === '--dry') {
      options.dryRun = true;
      i++;
    } else if (arg.startsWith('-')) {
      console.error(`Unknown option: ${arg}`);
      printUsage();
      process.exit(1);
    } else {
      options.sourceDir = path.isAbsolute(arg) 
        ? arg 
        : path.join(process.cwd(), arg);
      i++;
    }
  }

  if (!options.sourceDir) {
    console.error('Error: Source folder is required');
    printUsage();
    process.exit(1);
  }

  try {
    await fs.access(options.sourceDir);
  } catch {
    console.error(`Error: Source folder does not exist: ${options.sourceDir}`);
    process.exit(1);
  }

  console.log('🚀 Bulk Emoji Import');
  console.log('='.repeat(50));
  console.log(`📂 Source: ${options.sourceDir}`);
  console.log(`📁 Destination: ${options.destDir}`);
  console.log(`🔧 Options:`);
  console.log(`   - Normalize names: ${options.normalizeNames ? '✅' : '❌'}`);
  console.log(`   - Dedupe: ${options.dedupe ? '✅' : '❌'}`);
  console.log(`   - Trim numbers: ${options.trimNumbers ? '✅' : '❌'}`);
  console.log(`   - Dry run: ${options.dryRun ? '✅' : '❌'}`);
  console.log('='.repeat(50) + '\n');

  const result = await bulkImport(options);
  printSummary(result, options.dryRun);
}

main();
