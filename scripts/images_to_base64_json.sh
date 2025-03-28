#!/bin/bash

# Function to print usage information
usage() {
  echo "Usage: $0 [OPTIONS] FOLDER"
  echo
  echo "Convert all images in a folder to a JSON file with base64 encoded data."
  echo
  echo "Options:"
  echo "  -o, --output FILE    Output JSON file (default: images.json)"
  echo "  -e, --extensions EXT List of image extensions to include (space-separated,"
  echo "                       default: jpg jpeg png gif bmp webp)"
  echo "  -h, --help           Display this help message and exit"
  echo
  echo "Example:"
  echo "  $0 ./my_images -o my_images.json -e jpg png"
}

# Check for required commands
if ! command -v base64 >/dev/null 2>&1; then
  echo "Error: base64 command not found"
  exit 1
fi

# Default values
OUTPUT_FILE="images.json"
EXTENSIONS=("jpg" "jpeg" "png" "gif" "bmp" "webp")

# Parse command line arguments
POSITIONAL=()
while [[ $# -gt 0 ]]; do
  key="$1"
  case $key in
    -o|--output)
      OUTPUT_FILE="$2"
      shift 2
      ;;
    -e|--extensions)
      # Clear default extensions
      EXTENSIONS=()
      # Shift to the first extension
      shift
      # Collect all extensions until the next option or the end
      while [[ $# -gt 0 && ! "$1" =~ ^- ]]; do
        EXTENSIONS+=("$1")
        shift
      done
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*) # Unknown option
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
    *) # Anything else is a positional argument
      POSITIONAL+=("$1")
      shift
      ;;
  esac
done

# Restore positional parameters
set -- "${POSITIONAL[@]}"

# Check for the required folder argument
if [ $# -eq 0 ]; then
  echo "Error: You must specify a folder."
  usage
  exit 1
fi

FOLDER_PATH="$1"

# Check if folder exists
if [ ! -d "$FOLDER_PATH" ]; then
  echo "Error: The folder '$FOLDER_PATH' does not exist."
  exit 1
fi

# Get absolute path
FOLDER_PATH=$(cd "$FOLDER_PATH" && pwd)

echo "Scanning folder: $FOLDER_PATH"
echo "Output file: $OUTPUT_FILE"
echo "Extensions: ${EXTENSIONS[*]}"

# Start the JSON file with opening structure
echo '{' > "$OUTPUT_FILE"
echo '  "total_images": 0,' >> "$OUTPUT_FILE"
echo '  "images": [' >> "$OUTPUT_FILE"

# Counter for total images
TOTAL_IMAGES=0
# Flag to track if we need to add a comma before the next image
NEED_COMMA=0

# Process all files in the folder
while IFS= read -r -d '' FILE; do
  # Skip if not a file
  if [ ! -f "$FILE" ]; then
    continue
  fi
  
  FILENAME=$(basename "$FILE")
  # Extract extension (lowercase)
  EXT="${FILENAME##*.}"
  EXT=$(echo "$EXT" | tr '[:upper:]' '[:lower:]')
  
  # Check if extension is in the list using a loop for proper matching
  is_valid_ext=0
  for valid_ext in "${EXTENSIONS[@]}"; do
    if [ "$EXT" = "$valid_ext" ]; then
      is_valid_ext=1
      break
    fi
  done
  
  if [ $is_valid_ext -eq 1 ]; then
    # Add comma before the next image (not the first one)
    if [ $NEED_COMMA -eq 1 ]; then
      echo ',' >> "$OUTPUT_FILE"
    fi
    
    # Get file size in bytes
    SIZE=$(stat -f %z "$FILE" 2>/dev/null || stat -c %s "$FILE" 2>/dev/null)
    
    # Set correct MIME type
    if [ "$EXT" = "jpg" ]; then
      MIME_TYPE="image/jpeg"
    else
      MIME_TYPE="image/$EXT"
    fi
    
    # Convert to base64 with error handling
    if ! BASE64_DATA=$(base64 -i "$FILE" | tr -d '\n'); then
      echo "Error: Failed to encode $FILENAME to base64"
      continue
    fi
    
    # Write image data to JSON
    echo '    {' >> "$OUTPUT_FILE"
    echo "      \"filename\": \"$FILENAME\"," >> "$OUTPUT_FILE"
    echo "      \"extension\": \".$EXT\"," >> "$OUTPUT_FILE"
    echo "      \"size_bytes\": $SIZE," >> "$OUTPUT_FILE"
    echo "      \"mime_type\": \"$MIME_TYPE\"," >> "$OUTPUT_FILE"
    echo "      \"base64\": \"$BASE64_DATA\"" >> "$OUTPUT_FILE"
    echo -n '    }' >> "$OUTPUT_FILE"
    NEED_COMMA=1
    
    # Increment the counter
    TOTAL_IMAGES=$((TOTAL_IMAGES + 1))
    
    echo "Processed: $FILENAME"
  fi
done < <(find "$FOLDER_PATH" -type f -print0)

# Close the JSON structure
echo >> "$OUTPUT_FILE"
echo '  ]' >> "$OUTPUT_FILE"
echo '}' >> "$OUTPUT_FILE"

# Update the total_images value in the JSON file
if [ $TOTAL_IMAGES -gt 0 ]; then
  # Use platform-independent sed command
  case "$(uname)" in
    Darwin)
      sed -i '' "s/\"total_images\": 0/\"total_images\": $TOTAL_IMAGES/" "$OUTPUT_FILE"
      ;;
    *)
      sed -i "s/\"total_images\": 0/\"total_images\": $TOTAL_IMAGES/" "$OUTPUT_FILE"
      ;;
  esac
fi

echo
echo "Conversion complete!"
echo "Total images processed: $TOTAL_IMAGES"
echo "Output saved to: $(cd "$(dirname "$OUTPUT_FILE")" && pwd)/$(basename "$OUTPUT_FILE")"


# Function to split JSON file into smaller files based on size
split_json_file() {
  local input_file="$1"
  local max_bytes="${2:-1024000}"
  local base_name="${input_file%.*}"
  local current_size=0
  local file_counter=1
  local temp_file
  
  # Sort the images array by size_bytes in descending order using jq
  if ! command -v jq >/dev/null 2>&1; then
    echo "Error: jq command not found. Please install jq to enable sorting."
    return 1
  fi

  # Create sorted version
  jq '.images |= sort_by(-.size_bytes)' "$input_file" > "${input_file}.sorted"
  mv "${input_file}.sorted" "$input_file"

  # Skip splitting if max_bytes is 0 or not set
  [ -z "$max_bytes" ] || [ "$max_bytes" -eq 0 ] && return 0

  # Read the original file
  while IFS= read -r line; do
    if [ $current_size -eq 0 ]; then
      temp_file="${base_name}_${file_counter}.json"
      echo '{' > "$temp_file"
      echo "  \"part\": $file_counter," >> "$temp_file"
      echo '  "images": [' >> "$temp_file"
      current_size=$(stat -f %z "$temp_file" 2>/dev/null || stat -c %s "$temp_file" 2>/dev/null)
    fi

    # Add line to current file
    if [[ "$line" =~ ^[[:space:]]*\{.*\}$ ]]; then
      [ $current_size -gt 0 ] && echo ',' >> "$temp_file"
      echo "$line" >> "$temp_file"
      current_size=$(stat -f %z "$temp_file" 2>/dev/null || stat -c %s "$temp_file" 2>/dev/null)

      # Check if we need to start a new file
      if [ $current_size -ge $max_bytes ]; then
        echo '  ]' >> "$temp_file"
        echo '}' >> "$temp_file"
        file_counter=$((file_counter + 1))
        current_size=0
      fi
    fi
  done < <(jq -c '.images[]' "$input_file")

  # Close the last file if needed
  if [ $current_size -gt 0 ]; then
    echo '  ]' >> "$temp_file"
    echo '}' >> "$temp_file"
  fi

  echo "Split into $file_counter files"
}

# Add file_max_bytes option to argument parsing
FILE_MAX_BYTES=1024000
case $key in
  --file-max-bytes)
    FILE_MAX_BYTES="$2"
    shift 2
    ;;
esac

# Call the split function at the end
split_json_file "$OUTPUT_FILE" "$FILE_MAX_BYTES"
