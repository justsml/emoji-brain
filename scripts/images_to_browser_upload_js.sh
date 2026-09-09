#!/bin/bash

usage() {
  echo "Usage: $0 [OPTIONS] FOLDER"
  echo
  echo "Generate a self-contained Slack emoji uploader for the browser console."
  echo
  echo "Options:"
  echo "  -o, --output FILE    Output stem or .js file (default: browser-upload.js)"
  echo "  -n, --num-files N    Split images across N numbered browser scripts"
  echo "  -c, --concurrency N  Maximum parallel Slack requests (default: 3)"
  echo "      --requests-per-window N  Shared request limit (default: 60)"
  echo "      --window-seconds N       Request window duration (default: 60)"
  echo "      --no-minify      Keep generated JavaScript readable"
  echo "  -e, --extensions EXT List of image extensions to include (space-separated,"
  echo "                       default: jpg jpeg png gif bmp webp)"
  echo "  -h, --help           Display this help message and exit"
  echo
  echo "Example:"
  echo "  $0 ./my_images -o upload-images.js -e jpg png"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: $1 command not found"
    exit 1
  fi
}

require_command base64
require_command jq

OUTPUT_FILE="browser-upload.js"
NUM_FILES=0
CONCURRENCY=3
REQUESTS_PER_WINDOW=60
WINDOW_SECONDS=60
MINIFY=1
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ESBUILD_BIN="$SCRIPT_DIR/../node_modules/.bin/esbuild"
EXTENSIONS=("jpg" "jpeg" "png" "gif" "bmp" "webp")
POSITIONAL=()

while [[ $# -gt 0 ]]; do
  key="$1"
  case "$key" in
    -o|--output)
      if [[ $# -lt 2 ]]; then
        echo "Error: $key requires a value"
        exit 1
      fi
      OUTPUT_FILE="$2"
      shift 2
      ;;
    -c|--concurrency)
      if [[ $# -lt 2 || ! "$2" =~ ^[1-9][0-9]*$ ]]; then
        echo "Error: $key requires a positive integer"
        exit 1
      fi
      CONCURRENCY="$2"
      shift 2
      ;;
    -n|--num-files)
      if [[ $# -lt 2 || ! "$2" =~ ^[1-9][0-9]*$ ]]; then
        echo "Error: $key requires a positive integer"
        exit 1
      fi
      NUM_FILES="$2"
      shift 2
      ;;
    --no-minify)
      MINIFY=0
      shift
      ;;
    --requests-per-window)
      if [[ $# -lt 2 || ! "$2" =~ ^[1-9][0-9]*$ ]]; then
        echo "Error: $key requires a positive integer"
        exit 1
      fi
      REQUESTS_PER_WINDOW="$2"
      shift 2
      ;;
    --window-seconds)
      if [[ $# -lt 2 || ! "$2" =~ ^[1-9][0-9]*$ ]]; then
        echo "Error: $key requires a positive integer"
        exit 1
      fi
      WINDOW_SECONDS="$2"
      shift 2
      ;;
    -e|--extensions)
      EXTENSIONS=()
      shift
      while [[ $# -gt 0 && ! "$1" =~ ^- ]]; do
        EXTENSIONS+=("$1")
        shift
      done
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
    *)
      POSITIONAL+=("$1")
      shift
      ;;
  esac
done

set -- "${POSITIONAL[@]}"
if [ $# -ne 1 ]; then
  echo "Error: You must specify one image folder."
  usage
  exit 1
fi

FOLDER_PATH="$1"
if [ ! -d "$FOLDER_PATH" ]; then
  echo "Error: The folder '$FOLDER_PATH' does not exist."
  exit 1
fi
FOLDER_PATH=$(cd "$FOLDER_PATH" && pwd)

# Generated content is JavaScript even when the caller supplies another suffix.
if [[ "$OUTPUT_FILE" == *.* ]]; then
  OUTPUT_FILE="${OUTPUT_FILE%.*}.js"
else
  OUTPUT_FILE="${OUTPUT_FILE}.js"
fi

is_valid_extension() {
  local extension="$1"
  local valid_extension
  for valid_extension in "${EXTENSIONS[@]}"; do
    if [ "$extension" = "$valid_extension" ]; then
      return 0
    fi
  done
  return 1
}

MATCHING_IMAGES=0
while IFS= read -r -d '' FILE; do
  filename=$(basename "$FILE")
  extension="${filename##*.}"
  extension=$(echo "$extension" | tr '[:upper:]' '[:lower:]')
  if is_valid_extension "$extension"; then
    MATCHING_IMAGES=$((MATCHING_IMAGES + 1))
  fi
done < <(find "$FOLDER_PATH" -type f -print0)

echo "Scanning folder: $FOLDER_PATH"
echo "Output file: $OUTPUT_FILE"
echo "Found $MATCHING_IMAGES matching image(s)."

generate_script() {
  local target_file="$1"
  local part_number="$2"
  local part_count="$3"
  local part_start=$(( (part_number - 1) * MATCHING_IMAGES / part_count ))
  local part_end=$(( part_number * MATCHING_IMAGES / part_count ))
  local part_images=$((part_end - part_start))

  echo "Generating part $part_number/$part_count with $part_images image(s): $target_file"

{
  cat <<'EOF'
// Generated Slack emoji uploader. Paste this entire file into DevTools while
// signed in at https://YOUR-WORKSPACE.slack.com/customize/emoji.
(async () => {
  const SCRIPT_VERSION = '2.7.0';
  const CONFIG = {
    concurrency: __CONCURRENCY__,
    requestsPerWindow: __REQUESTS_PER_WINDOW__,
    requestWindowSeconds: __WINDOW_SECONDS__,
    dryRun: false,
    searchPageSize: 100,
    requestTimeoutMs: 30000,
    maxRetries: 4,
    retryBaseMs: 1000,
    retryMaxMs: 60000,
    blockedProbeSize: 3,
    blockedFallbackOrder: 'reverse',
  };

  const images = [
EOF

  NEED_COMMA=0
  CURRENT_IMAGE=0
  MATCHING_INDEX=0
  while IFS= read -r -d '' FILE; do
    filename=$(basename "$FILE")
    extension="${filename##*.}"
    extension=$(echo "$extension" | tr '[:upper:]' '[:lower:]')
    if ! is_valid_extension "$extension"; then
      continue
    fi

    if [ "$MATCHING_INDEX" -lt "$part_start" ] || [ "$MATCHING_INDEX" -ge "$part_end" ]; then
      MATCHING_INDEX=$((MATCHING_INDEX + 1))
      continue
    fi
    MATCHING_INDEX=$((MATCHING_INDEX + 1))

    CURRENT_IMAGE=$((CURRENT_IMAGE + 1))
    echo "[$CURRENT_IMAGE/$part_images] Encoding: $filename" >&2
    if ! base64_data=$(base64 -i "$FILE" | tr -d '\n'); then
      echo "Error: Failed to encode $filename" >&2
      exit 1
    fi

    if [ "$extension" = "jpg" ]; then
      mime_type="image/jpeg"
    else
      mime_type="image/$extension"
    fi

    if [ "$NEED_COMMA" -eq 1 ]; then
      printf ',\n'
    fi
    jq -n --arg filename "$filename" --arg mime_type "$mime_type" --arg base64 "$base64_data" \
      '{ filename: $filename, mimeType: $mime_type, base64: $base64 }' | sed 's/^/    /'
    NEED_COMMA=1
    echo "[$CURRENT_IMAGE/$part_images] Added: $filename" >&2
  done < <(find "$FOLDER_PATH" -type f -print0)

  cat <<'EOF'

  ];

  const log = (...args) => console.log('[slack-emoji-upload]', ...args);
  const warn = (...args) => console.warn('[slack-emoji-upload]', ...args);
  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  let globalRateLimitUntil = 0;
  const requestStarts = [];
  let semaphoreQueue = Promise.resolve();
  let nextRequestAt = 0;
  let adaptiveConcurrency = CONFIG.concurrency;
  let activeRequests = 0;
  const concurrencyWaiters = [];

  function wakeConcurrencyWaiters() {
    while (concurrencyWaiters.length > 0) concurrencyWaiters.shift()();
  }

  async function acquireConcurrencySlot() {
    while (activeRequests >= adaptiveConcurrency) {
      await new Promise(resolve => concurrencyWaiters.push(resolve));
    }
    activeRequests += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      activeRequests -= 1;
      wakeConcurrencyWaiters();
    };
  }

  function reduceConcurrency(emojiName, path) {
    const previous = adaptiveConcurrency;
    adaptiveConcurrency = Math.max(1, adaptiveConcurrency - 1);
    if (adaptiveConcurrency < previous) {
      warn(`${emojiName}: reducing shared concurrency ${previous} -> ${adaptiveConcurrency} after 429 from ${path}`);
    }
  }

  function acquireRequestSlot(emojiName, path) {
    const acquire = async () => {
      const windowMs = CONFIG.requestWindowSeconds * 1000;
      const spacingMs = windowMs / CONFIG.requestsPerWindow;
      while (true) {
        const now = Date.now();
        while (requestStarts.length > 0 && requestStarts[0] <= now - windowMs) {
          requestStarts.shift();
        }
        const windowDelay = requestStarts.length < CONFIG.requestsPerWindow
          ? 0
          : Math.max(1, requestStarts[0] + windowMs - now);
        const pacingDelay = Math.max(0, nextRequestAt - now);
        const delay = Math.max(windowDelay, pacingDelay);
        if (delay === 0) {
          const startedAt = Date.now();
          requestStarts.push(startedAt);
          nextRequestAt = startedAt + spacingMs;
          return;
        }

        log(
          `${emojiName}: paced request wait before ${path}; waiting ${Math.ceil(delay / 1000)}s`,
        );
        await sleep(delay);
      }
    };

    const slot = semaphoreQueue.then(acquire, acquire);
    semaphoreQueue = slot.catch(() => {});
    return slot;
  }

  async function waitForGlobalRateLimit(emojiName, path) {
    while (Date.now() < globalRateLimitUntil) {
      const delay = globalRateLimitUntil - Date.now();
      log(`${emojiName}: global 429 pause before ${path}; waiting ${Math.ceil(delay / 1000)}s`);
      await sleep(delay);
    }
  }

  function extendGlobalRateLimit(delay) {
    globalRateLimitUntil = Math.max(globalRateLimitUntil, Date.now() + delay);
  }

  function logResult(progress, result) {
    const subject = result.name || result.filename;
    const message = `${progress} ${result.status}: ${subject}`;
    if (result.status === 'uploaded' || result.status === 'dry-run') {
      log(message, result);
    } else if (result.status === 'exact-conflict' || result.status === 'possible-conflict') {
      warn(message, result);
    } else {
      console.error('[slack-emoji-upload]', message, result);
    }
    return result;
  }

  function findSlackToken() {
    const candidates = [
      document.querySelector('input[name="token"]')?.value,
      globalThis.TS?.boot_data?.api_token,
      globalThis.boot_data?.api_token,
      globalThis.slackDebug?.token,
    ];
    return candidates.find(value => typeof value === 'string' && value.length > 0);
  }

  function imageName(filename) {
    return filename
      .replace(/\.[^.]+$/, '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^[_-]+|[_-]+$/g, '');
  }

  function alternateNames(name) {
    const names = new Set();
    const addSeparators = value => {
      names.add(value);
      names.add(value.replace(/_/g, '-'));
      names.add(value.replace(/-/g, '_'));
    };
    const withoutPrefix = name.replace(/^(?:cat|meow)[_-]/, '');
    const hasCatPrefix = /^cat[_-]/.test(name);
    const hasMeowPrefix = /^meow[_-]/.test(name);

    addSeparators(name);
    if (hasCatPrefix || hasMeowPrefix) {
      addSeparators(withoutPrefix);
      addSeparators(`cat_${withoutPrefix}`);
      addSeparators(`meow_${withoutPrefix}`);
    } else {
      addSeparators(`cat_${name}`);
      addSeparators(`meow_${name}`);
    }
    return [...names].filter(Boolean);
  }

  function nameFamily(name) {
    return name
      .replace(/^(?:cat|meow)[_-]/, '')
      .replace(/[-_]+/g, '_');
  }

  function collectEmojiRecords(value, records = [], seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return records;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) collectEmojiRecords(item, records, seen);
      return records;
    }

    const name = value.name ?? value.emoji_name ?? value.alias;
    const imageUrl = value.url ?? value.image_url ?? value.imageUrl ?? value.src;
    if (typeof name === 'string') {
      records.push({ name, imageUrl: typeof imageUrl === 'string' ? imageUrl : null });
    }
    for (const child of Object.values(value)) {
      collectEmojiRecords(child, records, seen);
    }
    return records;
  }

  function rateLimitDelay(response, retryNumber) {
    const retryAfter = response.headers.get('retry-after') || response.headers.get('x-retry-after');
    const resetAt = response.headers.get('x-ratelimit-reset');
    let headerDelay = 0;

    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds)) headerDelay = seconds * 1000;
      else {
        const date = Date.parse(retryAfter);
        if (Number.isFinite(date)) headerDelay = Math.max(0, date - Date.now());
      }
    } else if (resetAt && Number.isFinite(Number(resetAt))) {
      headerDelay = Math.max(0, Number(resetAt) * 1000 - Date.now());
    }

    const exponentialDelay = Math.min(
      CONFIG.retryMaxMs,
      CONFIG.retryBaseMs * 2 ** (retryNumber - 1),
    );
    return Math.max(headerDelay, exponentialDelay);
  }

  async function slackFormRequest(path, fields, emojiName) {
    for (let attempt = 0; attempt <= CONFIG.maxRetries; attempt += 1) {
      await waitForGlobalRateLimit(emojiName, path);
      await acquireRequestSlot(emojiName, path);
      await waitForGlobalRateLimit(emojiName, path);
      const releaseConcurrencySlot = await acquireConcurrencySlot();

      const form = new FormData();
      form.append('token', token);
      for (const [key, value] of Object.entries(fields)) form.append(key, value);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CONFIG.requestTimeoutMs);
      let response;
      try {
        response = await fetch(path, {
          method: 'POST',
          credentials: 'same-origin',
          body: form,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
        releaseConcurrencySlot();
      }

      if (response.status === 429) {
        reduceConcurrency(emojiName, path);
      }
      if (response.status === 429 && attempt < CONFIG.maxRetries) {
        const retryNumber = attempt + 1;
        const delay = rateLimitDelay(response, retryNumber);
        extendGlobalRateLimit(delay);
        warn(
          `${emojiName}: rate limited by ${path}; pausing all workers, retry ${retryNumber}/${CONFIG.maxRetries} in ${Math.ceil(delay / 1000)}s`,
        );
        continue;
      }
      if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
      const body = await response.json();
      if (body.ok === false) throw new Error(body.error || `${path} failed`);
      return body;
    }
    throw new Error(`${path} exhausted retries`);
  }

  async function findConflicts(name, alternates) {
    const body = await slackFormRequest('/api/emoji.adminList', {
      page: '1',
      count: String(CONFIG.searchPageSize),
      queries: JSON.stringify(alternates),
      user_ids: '[]',
      _x_reason: 'customize-emoji-new-query',
      _x_mode: 'online',
    }, name);
    const wanted = new Set(alternates.map(name => name.toLowerCase()));
    const unique = new Map();
    for (const record of collectEmojiRecords(body)) {
      const key = record.name.toLowerCase();
      if (wanted.has(key) && !unique.has(key)) unique.set(key, record);
    }
    return [...unique.values()];
  }

  function decodeImage(image) {
    const binary = atob(image.base64);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    return new File([bytes], image.filename, { type: image.mimeType });
  }

  async function uploadEmoji(image, name) {
    if (CONFIG.dryRun) return { ok: true, dryRun: true };
    return slackFormRequest('/api/emoji.add', {
      name,
      mode: 'data',
      image: decodeImage(image),
      _x_reason: 'customize-emoji-add',
      _x_mode: 'online',
    }, name);
  }

  async function mapConcurrent(items, limit, worker) {
    const results = new Array(items.length);
    let nextIndex = 0;
    async function runWorker() {
      while (nextIndex < items.length) {
        const index = nextIndex++;
        results[index] = await worker(items[index], index);
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(limit, items.length) }, () => runWorker()),
    );
    return results;
  }

  if (!location.hostname.endsWith('.slack.com')) {
    throw new Error('Run this script on your Slack workspace customize/emoji page.');
  }
  if (!Number.isInteger(CONFIG.concurrency) || CONFIG.concurrency < 1) {
    throw new Error('CONFIG.concurrency must be a positive integer.');
  }
  if (!Number.isInteger(CONFIG.requestsPerWindow) || CONFIG.requestsPerWindow < 1) {
    throw new Error('CONFIG.requestsPerWindow must be a positive integer.');
  }
  if (!Number.isFinite(CONFIG.requestWindowSeconds) || CONFIG.requestWindowSeconds <= 0) {
    throw new Error('CONFIG.requestWindowSeconds must be positive.');
  }

  const token = findSlackToken();
  if (!token) {
    throw new Error('Could not find the Slack page token. Open /customize/emoji and retry.');
  }

  const prepared = images.map((image, index) => {
    const name = imageName(image.filename);
    return { image, index, name, alternates: alternateNames(name), family: nameFamily(name) };
  });
  const localFamilies = new Map();
  for (const item of prepared) {
    const first = localFamilies.get(item.family);
    if (first) item.localConflict = first;
    else localFamilies.set(item.family, item);
  }

  async function processEmoji(item, index, total) {
    const progress = `[${index + 1}/${total}]`;
    if (!item.name) {
      return logResult(progress, {
        status: 'error',
        reason: 'invalid-name',
        filename: item.image.filename,
      });
    }
    if (item.localConflict) {
      const conflict = {
        status: 'possible-conflict',
        reason: 'local-similar-name',
        filename: item.image.filename,
        name: item.name,
        conflictsWith: item.localConflict.image.filename,
        alternates: item.alternates,
      };
      return logResult(progress, conflict);
    }

    log(progress, 'Checking', item.name, item.alternates);
    try {
      const conflicts = await findConflicts(item.name, item.alternates);
      if (conflicts.length > 0) {
        const exactConflicts = conflicts.filter(
          conflict => conflict.name.toLowerCase() === item.name.toLowerCase(),
        );
        const conflict = {
          status: exactConflicts.length > 0 ? 'exact-conflict' : 'possible-conflict',
          reason: exactConflicts.length > 0 ? 'existing-exact-name' : 'existing-similar-name',
          filename: item.image.filename,
          name: item.name,
          alternates: item.alternates,
          conflicts,
        };
        return logResult(progress, conflict);
      }

      log(progress, CONFIG.dryRun ? 'Dry run passed' : 'Uploading', item.name);
      await uploadEmoji(item.image, item.name);
      return logResult(progress, {
        status: CONFIG.dryRun ? 'dry-run' : 'uploaded',
        filename: item.image.filename,
        name: item.name,
      });
    } catch (error) {
      const failure = {
        status: error?.name === 'AbortError' ? 'timeout' : 'error',
        filename: item.image.filename,
        name: item.name,
        error: error instanceof Error ? error.message : String(error),
      };
      return logResult(progress, failure);
    }
  }

  async function processBatch(items, offset = 0, total = 0) {
    return mapConcurrent(
      items,
      CONFIG.concurrency,
      (item, index) => processEmoji(item, index + offset, total || items.length),
    );
  }

  const blockedStatuses = new Set([
    'exact-conflict',
    'possible-conflict',
    'timeout',
    'error',
  ]);
  const probeSize = Math.min(CONFIG.blockedProbeSize, prepared.length);
  const probeReport = [];
  for (let index = 0; index < probeSize; index += 1) {
    probeReport.push(await processEmoji(prepared[index], index, prepared.length));
  }

  const probeBlocked = probeReport.length === CONFIG.blockedProbeSize
    && probeReport.every(item => blockedStatuses.has(item.status));
  let remaining = prepared.slice(probeSize);
  if (probeBlocked && CONFIG.blockedFallbackOrder === 'reverse') {
    remaining = remaining.reverse();
    warn(
      `First ${CONFIG.blockedProbeSize} results were conflicts or errors; processing ${remaining.length} remaining image(s) in reverse order.`,
    );
  }

  const remainingReport = await processBatch(remaining, probeSize, prepared.length);
  let report = probeReport.concat(remainingReport);

  const summary = report.reduce((counts, item) => {
    counts[item.status] = (counts[item.status] || 0) + 1;
    return counts;
  }, {});
  globalThis.slackEmojiUploadReport = report;
  globalThis.slackEmojiUploadState = () => ({
    activeRequests,
    adaptiveConcurrency,
    configuredConcurrency: CONFIG.concurrency,
    globalRateLimitUntil,
    requestsInRollingWindow: requestStarts.length,
  });
  globalThis.retrySlackEmojiFailures = async () => {
    const retryableNames = new Set(
      report
        .filter(item => item.status === 'timeout' || item.status === 'error')
        .map(item => item.name)
        .filter(Boolean),
    );
    const retryItems = prepared.filter(item => retryableNames.has(item.name));
    if (retryItems.length === 0) {
      log('No failed uploads to retry.');
      return { summary: {}, report: [] };
    }

    log(`Retrying ${retryItems.length} failed upload(s).`);
    const retried = await processBatch(retryItems);
    const retriedNames = new Set(retried.map(item => item.name));
    report = report.filter(item => !retriedNames.has(item.name)).concat(retried);
    globalThis.slackEmojiUploadReport = report;
    const retrySummary = retried.reduce((counts, item) => {
      counts[item.status] = (counts[item.status] || 0) + 1;
      return counts;
    }, {});
    log('Retry complete', retrySummary);
    console.table(retried);
    return { summary: retrySummary, report: retried };
  };
  log(`Version ${SCRIPT_VERSION} complete`, summary);
  log('Retry timeout/error results with: await retrySlackEmojiFailures()');
  console.table(report);
  return { summary, report };
})();
EOF
} > "$target_file"

sed \
  -e "s/__CONCURRENCY__/$CONCURRENCY/" \
  -e "s/__REQUESTS_PER_WINDOW__/$REQUESTS_PER_WINDOW/" \
  -e "s/__WINDOW_SECONDS__/$WINDOW_SECONDS/" \
  "$target_file" > "${target_file}.tmp"
mv "${target_file}.tmp" "$target_file"

if [ "$MINIFY" -eq 1 ]; then
  if [ ! -x "$ESBUILD_BIN" ]; then
    echo "Error: esbuild not found at $ESBUILD_BIN. Install project dependencies or use --no-minify." >&2
    return 1
  fi
  "$ESBUILD_BIN" "$target_file" \
    --minify \
    --legal-comments=none \
    --outfile="${target_file}.minified" >/dev/null
  mv "${target_file}.minified" "$target_file"
fi

echo "Created: $(cd "$(dirname "$target_file")" && pwd)/$(basename "$target_file")"
}

if [ "$NUM_FILES" -gt 1 ]; then
  if [[ "$OUTPUT_FILE" == *.* ]]; then
    output_base="${OUTPUT_FILE%.*}"
    output_extension=".${OUTPUT_FILE##*.}"
  else
    output_base="$OUTPUT_FILE"
    output_extension=""
  fi
  for ((part = 1; part <= NUM_FILES; part++)); do
    generate_script "${output_base}_${part}${output_extension}" "$part" "$NUM_FILES"
  done
else
  generate_script "$OUTPUT_FILE" 1 1
fi

echo "Open your Slack workspace's /customize/emoji page, then paste the whole generated file into DevTools."
